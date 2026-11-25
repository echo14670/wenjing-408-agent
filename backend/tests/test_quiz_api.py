"""小测接口用例：出卷字段、按版本判分、错误与重复提交。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _submit(client: TestClient, **overrides):
    payload = {
        "version": "1",
        "attempt_id": "attempt-001",
        "answers": {"COP005": "A", "COP006": "B", "COP007": "B"},
    }
    payload.update(overrides)
    return client.post("/api/quiz/co-memory-01/submit", json=payload)


def test_get_quiz_returns_three_questions_without_answers(client: TestClient):
    resp = client.get("/api/quiz/co-memory-01")
    assert resp.status_code == 200
    body = resp.json()
    assert body["quiz_id"] == "co-memory-01"
    assert body["version"] == "1"
    assert [q["question_id"] for q in body["questions"]] == ["COP005", "COP006", "COP007"]
    for q in body["questions"]:
        assert "answer" not in q
        assert "solution" not in q
        assert q["stem"] and q["options"]


def test_submit_scores_abb_as_2_of_3(client: TestClient):
    resp = _submit(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == 2
    assert body["total"] == 3
    correct_ids = [r["question_id"] for r in body["results"] if r["is_correct"]]
    assert correct_ids == ["COP005", "COP007"]


def test_submit_same_answer_same_score(client: TestClient):
    assert _submit(client).json()["score"] == _submit(client).json()["score"]


def test_submit_missing_answer_rejected(client: TestClient):
    resp = _submit(client, answers={"COP005": "A", "COP006": "B"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "missing_answers"


def test_submit_unknown_question_rejected(client: TestClient):
    resp = _submit(client, answers={"COP005": "A", "COP006": "B", "COP007": "B", "COP999": "A"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "unknown_question"


def test_submit_invalid_option_rejected(client: TestClient):
    resp = _submit(client, answers={"COP005": "E", "COP006": "B", "COP007": "B"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_option"


def test_submit_wrong_version_rejected(client: TestClient):
    resp = _submit(client, version="99")
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "version_mismatch"


def test_unknown_quiz_not_found(client: TestClient):
    resp = client.get("/api/quiz/nope")
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "quiz_not_found"
