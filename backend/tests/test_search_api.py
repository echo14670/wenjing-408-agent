"""POST /api/search 接口用例：契约字段、三态、入参校验。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_ROOT
from app.deps import get_retrieval_service
from app.services.question_store import QuestionStore
from app.services.retrieval import RetrievalService
from main import app

CONTRACT_KEYS = {"match_type", "question_data", "similar_questions"}
QUESTION_KEYS = {
    "question_id",
    "subject",
    "chapter",
    "stem",
    "options",
    "answer",
    "solution",
    "review_state",
    "source_ref",
}
SIMILAR_KEYS = {"question_id", "subject", "stem", "source_ref"}


@pytest.fixture
def client() -> TestClient:
    """接口测试跑在 questions.sample.json 上。

    正式题库（data/questions.json，80 题）全部处于「待核验」，按降级策略不会出现
    original，无法验证原题三态；样例库保留了已核验的 Cache 基准题 Q001，
    作为检索行为的回归基线，与真实起服务联调时使用的是同一套代码路径。
    """
    store = QuestionStore(BACKEND_ROOT / "data" / "questions.sample.json")
    service = RetrievalService(questions=store.load())
    app.dependency_overrides[get_retrieval_service] = lambda: service
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_response_matches_contract(client: TestClient):
    resp = client.post("/api/search", json={"raw_input": "四路组相联，组号占 2 位", "input_type": "text"})
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == CONTRACT_KEYS
    assert body["match_type"] == "original"
    assert set(body["question_data"].keys()) == QUESTION_KEYS
    assert body["question_data"]["question_id"] == "Q001"
    assert body["similar_questions"] == []


def test_original_returns_verified_solution(client: TestClient):
    body = client.post(
        "/api/search",
        json={
            "raw_input": "某计算机按字节编址，Cache 容量为 64KB，主存块大小为 64B，"
            "采用四路组相联映射，主存地址为 32 位。组号占 2 位，对吗？",
            "input_type": "text",
        },
    ).json()
    assert body["match_type"] == "original"
    assert body["question_data"]["review_state"] == "verified"
    assert body["question_data"]["solution"]


def test_similar_returns_list_without_question_data(client: TestClient):
    body = client.post(
        "/api/search",
        json={"raw_input": "Cache 容量为 16KB，块大小 32B，两路组相联，求组索引位数", "input_type": "text"},
    ).json()
    assert body["match_type"] == "similar"
    assert body["question_data"] is None
    assert body["similar_questions"], "相似态应给出参考题"
    for item in body["similar_questions"]:
        assert set(item.keys()) == SIMILAR_KEYS


def test_miss_returns_empty_payload(client: TestClient):
    body = client.post(
        "/api/search", json={"raw_input": "今天天气怎么样", "input_type": "text"}
    ).json()
    assert body["match_type"] == "miss"
    assert body["question_data"] is None
    assert body["similar_questions"] == []


def test_input_type_defaults_to_text(client: TestClient):
    body = client.post("/api/search", json={"raw_input": "四路组相联，组号占 2 位"}).json()
    assert body["match_type"] == "original"


def test_image_input_uses_extracted_text(client: TestClient):
    """图片输入的文本由上传链路提取后传入，检索逻辑与文字输入一致。"""
    body = client.post(
        "/api/search", json={"raw_input": "四路组相联，组号占 2 位", "input_type": "image"}
    ).json()
    assert body["match_type"] == "original"


def test_missing_raw_input_is_rejected(client: TestClient):
    assert client.post("/api/search", json={"input_type": "text"}).status_code == 422


def test_empty_raw_input_is_rejected(client: TestClient):
    assert client.post("/api/search", json={"raw_input": "  "}).status_code == 422


def test_invalid_input_type_is_rejected(client: TestClient):
    resp = client.post("/api/search", json={"raw_input": "Cache", "input_type": "audio"})
    assert resp.status_code == 422


def test_oversized_input_is_rejected(client: TestClient):
    assert client.post("/api/search", json={"raw_input": "题" * 4001}).status_code == 422


def test_health_reports_bank_stats(client: TestClient):
    """health 读的是正式题库（data/questions.json），检索服务被 override 成样例库。"""
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["questions"] >= 10, "应能读到正式题库 data/questions.json"
    assert body["indexed"] >= 1, "索引条数应与被注入的检索服务一致"
    assert "tokenizer" in body


def test_single_word_query_is_not_original(client: TestClient):
    """单词查询不足以判定原题：短查询不构成强命中，避免「Cache」就返回某道题的解析。"""
    body = client.post("/api/search", json={"raw_input": "Cache"}).json()
    assert body["match_type"] in {"similar", "miss"}
