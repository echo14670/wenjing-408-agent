from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from main import app

KEY_HEADER = "X-Wenjing-Provider-Key"
PROFILE_HEADER = "X-Wenjing-Model-Profile"
CHAT = {
    "session_messages": [{"role": "user", "content": "什么是 Cache？"}],
    "mode": "direct",
}
REMOTE = {
    "name": "测试远程模型",
    "kind": "remote",
    "base_url": "https://provider.example/v1/",
    "model": "example-model",
}


@pytest.fixture
def model_client(monkeypatch, tmp_path):
    path = tmp_path / "profiles.json"
    monkeypatch.setenv("MODEL_PROFILES_FILE", str(path))
    monkeypatch.setenv("CORS_ORIGINS", "http://127.0.0.1:4181")
    get_settings.cache_clear()
    yield TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 35000)), path
    get_settings.cache_clear()


def test_profile_survives_restart_without_returning_key(model_client):
    client, path = model_client
    saved = client.post("/api/model-config/profiles", json=REMOTE, headers={KEY_HEADER: "sample-token"})
    assert saved.status_code == 200, saved.text
    profile = saved.json()
    assert "sample-token" not in saved.text
    assert profile["has_key"] is True
    assert path.is_file()
    get_settings.cache_clear()
    listed = client.get("/api/model-config")
    assert listed.json()["profiles"] == [profile]
    assert "sample-token" not in listed.text

    edited = {**REMOTE, "id": profile["id"], "name": "改名"}
    assert client.post("/api/model-config/profiles", json=edited).json()["has_key"] is True
    edited["base_url"] = "https://different.example/v1"
    assert client.post("/api/model-config/profiles", json=edited).status_code == 422
    assert client.get("/api/model-config").json()["profiles"][0]["name"] == "改名"


def test_catalog_and_chat_use_chosen_endpoint_key_and_model(model_client, monkeypatch):
    client, _ = model_client
    saved = client.post("/api/model-config/profiles", json=REMOTE, headers={KEY_HEADER: "sample-token"})
    assert saved.status_code == 200, saved.text
    profile = saved.json()
    sent = []

    def provider(request):
        sent.append(request)
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "example-model", "object": "model",
                                                        "created": 0, "owned_by": "test"}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": "Cache 是高速缓存。"}}]})

    monkeypatch.setattr("app.services.agent.direct_http_client",
                        lambda: httpx.AsyncClient(transport=httpx.MockTransport(provider)))
    connection = {"id": profile["id"], "kind": profile["kind"], "base_url": profile["base_url"]}
    catalog = client.post("/api/model-config/catalog", json=connection)
    assert catalog.json() == {"models": ["example-model"]}
    tested = client.post("/api/model-config/test", json={**connection, "name": profile["name"], "model": profile["model"]})
    assert tested.status_code == 200, tested.text
    answer = client.post("/api/chat", json=CHAT, headers={PROFILE_HEADER: profile["id"]})
    assert "Cache 是高速缓存" in answer.json()["reply"]
    assert [request.url.path for request in sent] == ["/v1/models", "/v1/chat/completions", "/v1/chat/completions"]
    assert all(request.url.host == "provider.example" for request in sent)
    assert all(request.headers["authorization"] == "Bearer sample-token" for request in sent)
    assert [json.loads(request.content)["model"] for request in sent[1:]] == ["example-model"] * 2


def test_local_profiles_accept_loopback_service_without_key(model_client):
    client, _ = model_client
    local = {**REMOTE, "kind": "local", "base_url": "http://127.0.0.1:11434/v1"}
    saved = client.post("/api/model-config/profiles", json=local)
    assert saved.status_code == 200, saved.text
    assert saved.json()["has_key"] is False
    assert client.get("/api/model-config", headers={"Origin": "https://outside.example"}).status_code == 403


def test_profile_management_disabled_by_default(model_client, monkeypatch):
    client, _ = model_client
    monkeypatch.setenv("MODEL_PROFILES_FILE", "")
    get_settings.cache_clear()
    assert client.get("/api/model-config").status_code == 404


def test_nonlocal_origin_rejected_even_when_cors_allows_it(model_client, monkeypatch):
    client, _ = model_client
    monkeypatch.setenv("CORS_ORIGINS", "http://127.0.0.1:4181,https://outside.example")
    get_settings.cache_clear()
    assert client.get("/api/model-config", headers={"Origin": "http://127.0.0.1:4181"}).status_code == 200
    assert client.get("/api/model-config", headers={"Origin": "https://outside.example"}).status_code == 403
