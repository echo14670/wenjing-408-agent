"""POST /api/recommend 接口用例：字段结构、筛选语义、入参校验。

测试直接使用仓库自带 questions.json（与联调同一份数据），
题目间考点关系以该文件为准：Q001/Q004/Q005/Q007 共享「Cache 组相联映射」等考点。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_ROOT
from app.deps import get_recommend_service
from app.schemas.question import Question
from app.services.question_store import QuestionStore
from app.services.recommend import RecommendService
from main import app
from tests.conftest import make_question

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

# 覆盖测试要求的推荐场景：同考点 3 题（Q101 当前、Q102 done、Q103 verified、Q104 pending）。
RECO_BANK = [
    make_question("Q101", "推荐场景当前题", knowledge_points=["测试考点A"]),
    make_question("Q102", "推荐场景已做题", knowledge_points=["测试考点A"]),
    make_question("Q103", "推荐场景可推荐题", knowledge_points=["测试考点A"]),
    make_question("Q104", "推荐场景未核验题", review_state="pending", knowledge_points=["测试考点A"]),
]


@pytest.fixture
def client() -> TestClient:
    store = QuestionStore(BACKEND_ROOT / "data" / "questions.json")
    service = RecommendService(store.load())
    app.dependency_overrides[get_recommend_service] = lambda: service
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def reco_client() -> TestClient:
    """可控小题库，验证筛选语义。"""
    app.dependency_overrides[get_recommend_service] = lambda: RecommendService(RECO_BANK)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_response_structure(reco_client: TestClient):
    body = reco_client.post("/api/recommend", json={"question_id": "Q101"}).json()
    assert set(body.keys()) == {"questions", "scope", "notice"}
    assert body["scope"] == "knowledge_point"
    assert body["notice"] == ""
    for q in body["questions"]:
        assert set(q.keys()) == QUESTION_KEYS
        assert q["review_state"] == "verified", "默认只返回已核验题"


def test_recommend_excludes_current_and_done(reco_client: TestClient):
    body = reco_client.post(
        "/api/recommend",
        json={"question_id": "Q101", "done_question_ids": ["Q103"]},
    ).json()
    ids = [q["question_id"] for q in body["questions"]]
    assert "Q101" not in ids and "Q103" not in ids


def test_recommend_empty_when_no_suitable_candidate(reco_client: TestClient):
    """做完全部合适候选后应返回空数组，而不是塞回未核验题。"""
    body = reco_client.post(
        "/api/recommend",
        json={"question_id": "Q101", "done_question_ids": ["Q103", "Q102"]},
    ).json()
    assert body["questions"] == []


def test_recommend_unknown_question_returns_empty(client: TestClient):
    body = client.post("/api/recommend", json={"question_id": "Q99999"}).json()
    assert body["questions"] == []


def test_recommend_real_bank_returns_same_chapter_questions(client: TestClient):
    """正式题库（81 题 v1.1）上验证：考点零复用时退到同章节，且不含当前题。"""
    body = client.post(
        "/api/recommend",
        json={"question_id": "COP006", "top_k": 5},
    ).json()
    assert body["scope"] == "chapter", "考点无复用时应退到同章节"
    ids = [q["question_id"] for q in body["questions"]]
    assert ids and "COP006" not in ids
    assert {"COP005", "COP007"} <= set(ids), "同章节的已核验题应被召回"


def test_recommend_real_bank_default_excludes_unverified(client: TestClient):
    """v1.1 题库有 11 道已核验题：默认只返回已核验候选，70 道待核验题不出现。"""
    body = client.post("/api/recommend", json={"question_id": "COP005"}).json()
    ids = [q["question_id"] for q in body["questions"]]
    assert ids, "同章节存在已核验题时应返回候选"
    assert all(q["review_state"] == "verified" for q in body["questions"])
    assert "COP005" not in ids


def test_recommend_validates_input(client: TestClient):
    assert client.post("/api/recommend", json={}).status_code == 422
    assert client.post("/api/recommend", json={"question_id": ""}).status_code == 422
    assert client.post(
        "/api/recommend", json={"question_id": "Q001", "top_k": 99}
    ).status_code == 422
