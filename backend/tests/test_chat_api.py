"""POST /api/chat 契约、引导模式、工具核验与冲突展示测试。"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_ROOT, Settings
from app.deps import get_chat_service
from app.services.agent import AgentService
from app.services.question_store import QuestionStore
from main import app


class FakeLLM:
    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.system = ""
        self.messages: list[dict[str, str]] = []
        self.api_keys: list[str] = []

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
    ) -> str:
        self.system = system
        self.messages = messages
        return self.reply


@pytest.fixture
def chat_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, FakeLLM]]:
    monkeypatch.setenv("LLM_API_KEY", "server-test-key")
    monkeypatch.setenv("LLM_MODEL", "deepseek-flash")
    store = QuestionStore(BACKEND_ROOT / "data" / "questions.json")
    store.load()
    fake = FakeLLM("建议先计算 Cache 行数，再计算组数和组索引位数。")
    service = AgentService(store=store, settings=Settings())
    service.set_client_factory(lambda api_key: fake)
    app.dependency_overrides[get_chat_service] = lambda: service
    with TestClient(app) as client:
        yield client, fake
    app.dependency_overrides.clear()


def chat_request(*, mode: str = "guided") -> dict:
    return {
        "session_messages": [
            {
                "role": "user",
                "content": "四路组相联 Cache 的组号为什么不是 2 位？",
            }
        ],
        "question_id": "Q001",
        "user_answer": "因为四路，所以组号占 2 位",
        "mode": mode,
        "context_chunks": ["Cache 行数 = 容量 ÷ 块大小。"],
    }


def test_chat_response_matches_frozen_contract(
    chat_client: tuple[TestClient, FakeLLM],
) -> None:
    client, fake = chat_client
    response = client.post("/api/chat", json=chat_request(mode="direct"))

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"reply", "tool_result", "citations"}
    assert body["reply"] == fake.reply
    assert "group_bits: 8" in body["tool_result"]
    assert "QA 基准用例" in body["citations"][0]
    assert "用户提供的个人资料切片" in body["citations"]


def test_prompt_contains_question_answer_and_user_attempt(
    chat_client: tuple[TestClient, FakeLLM],
) -> None:
    client, fake = chat_client
    client.post("/api/chat", json=chat_request(mode="direct"))

    assert "题库答案：B" in fake.system
    assert "因为四路，所以组号占 2 位" in fake.system
    assert "Cache 行数 = 容量 ÷ 块大小" in fake.system


def test_guided_mode_hides_answer_from_prompt_and_output(
    chat_client: tuple[TestClient, FakeLLM],
) -> None:
    client, fake = chat_client
    fake.reply = "标准答案为 B，最终组号是 8 位。"
    response = client.post("/api/chat", json=chat_request(mode="guided"))

    assert response.status_code == 200
    assert "题库答案：B" not in fake.system
    assert "先不直接公布最终答案" in response.json()["reply"]
    assert "标准答案为 B" not in response.json()["reply"]


def test_explicit_reveal_allows_full_guided_answer(
    chat_client: tuple[TestClient, FakeLLM],
) -> None:
    client, fake = chat_client
    fake.reply = "标准答案为 B，组索引为 8 位。"
    payload = chat_request(mode="guided")
    payload["session_messages"].append(
        {
            "role": "user",
            "content": "我已主动选择查看答案，可以结合完整答案继续讲解。",
        }
    )
    response = client.post("/api/chat", json=payload)

    assert response.status_code == 200
    assert "题库答案：B" in fake.system
    assert "标准答案为 B" in response.json()["reply"]


def test_ai_bank_conflict_is_surfaced_in_reply(
    chat_client: tuple[TestClient, FakeLLM],
) -> None:
    client, fake = chat_client
    fake.reply = "答案：C。根据我的计算，组索引是 10 位。"
    response = client.post("/api/chat", json=chat_request(mode="direct"))

    assert response.status_code == 200
    reply = response.json()["reply"]
    assert "冲突提示" in reply
    assert "选项 C" in reply
    assert "题库答案 B" in reply


def test_miss_question_does_not_invent_bank_citation(
    chat_client: tuple[TestClient, FakeLLM],
) -> None:
    client, fake = chat_client
    fake.reply = "现有资料不足，请提供题干或补充个人资料。"
    payload = chat_request()
    payload["question_id"] = None
    payload["context_chunks"] = []
    response = client.post("/api/chat", json=payload)

    assert response.status_code == 200
    assert response.json()["citations"] == []
    assert response.json()["tool_result"] == ""


def test_invalid_mode_rejected(chat_client: tuple[TestClient, FakeLLM]) -> None:
    client, _ = chat_client
    payload = chat_request()
    payload["mode"] = "lecture"
    assert client.post("/api/chat", json=payload).status_code == 422


def test_user_supplied_key_is_forwarded_to_factory(
    chat_client: tuple[TestClient, FakeLLM],
) -> None:
    client, _ = chat_client
    received: list[str] = []
    service = app.dependency_overrides[get_chat_service]()
    service.set_client_factory(
        lambda api_key: (
            received.append(api_key)
            or FakeLLM("已使用用户临时 Key 完成回答。")
        )
    )

    response = client.post(
        "/api/chat",
        headers={"X-User-LLM-Key": "user-key"},
        json=chat_request(mode="direct"),
    )

    assert response.status_code == 200
    assert received == ["user-key"]


@pytest.mark.parametrize("reply", ["答案：C。", "正确答案为 B。"])
def test_guided_response_hides_answers_and_tool_results(chat_client, reply):
    client, fake = chat_client
    fake.reply = reply
    response = client.post("/api/chat", json=chat_request(mode="guided"))
    assert response.status_code == 200
    body = response.json()
    assert body["tool_result"] == ""
    assert "先不直接公布最终答案" in body["reply"]
    assert "题库答案 B" not in body["reply"]
    assert "group_bits: 8" not in fake.system


def test_revealed_guided_response_keeps_tools_and_conflict(chat_client):
    client, fake = chat_client
    fake.reply = "答案：C。"
    payload = chat_request(mode="guided")
    payload["session_messages"].append({
        "role": "user", "content": "我已主动选择查看答案，可以结合完整答案继续讲解。"
    })
    body = client.post("/api/chat", json=payload).json()
    assert "group_bits: 8" in body["tool_result"]
    assert "题库答案 B" in body["reply"]
