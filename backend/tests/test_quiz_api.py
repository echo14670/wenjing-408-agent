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


@pytest.fixture
def fresh_snapshots():
    """每个用例前清空版本快照缓存与文件，避免串用例。"""
    import app.api.quiz as quiz_mod

    quiz_mod._snapshots = None
    if quiz_mod.SNAPSHOT_PATH.exists():
        quiz_mod.SNAPSHOT_PATH.unlink()
    yield
    quiz_mod._snapshots = None
    if quiz_mod.SNAPSHOT_PATH.exists():
        quiz_mod.SNAPSHOT_PATH.unlink()


def test_bank_correction_keeps_frozen_version_score(client: TestClient, fresh_snapshots):
    """题库勘误后，同版本同答案判分仍一致（读快照而非活题库）。"""
    from app.deps import get_question_store

    # 首次交卷冻结 v1，得 2/3
    assert _submit(client).json()["score"] == 2
    # 模拟题库勘误：把 COP006 答案改成 B
    store = get_question_store()
    question = store.get_question("COP006")
    original_answer = question.answer
    question.answer = "B"
    try:
        # 同版本同答案重试 → 仍 2/3（不受勘误影响）
        assert _submit(client).json()["score"] == 2
    finally:
        question.answer = original_answer  # 恢复，避免影响其它用例


def test_new_version_still_accepts_old_sheet(client: TestClient, fresh_snapshots):
    """发布新版本后，旧版本答卷仍可交卷判分。"""
    import app.api.quiz as quiz_mod

    # 冻结 v1
    assert _submit(client).json()["score"] == 2
    # 模拟发布新版：把当前版本改为 2
    quiz_mod.QUIZZES["co-memory-01"]["version"] = "2"
    # 旧 v1 答卷仍能交（按 v1 快照判分）
    resp = _submit(client)
    assert resp.status_code == 200
    assert resp.json()["score"] == 2
    assert resp.json()["version"] == "1"
    # 恢复，避免影响其它用例
    quiz_mod.QUIZZES["co-memory-01"]["version"] = "1"
