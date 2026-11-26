"""小测接口用例：出卷字段、按版本判分、错误与重复提交。"""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from shutil import copyfile
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api import quiz
from app.deps import get_question_store
from main import app


@pytest.fixture
def quiz_catalog(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    deployed = tmp_path / "quiz_catalog.json"
    copyfile(quiz.QUIZ_CATALOG_PATH, deployed)
    monkeypatch.setattr(quiz, "QUIZ_CATALOG_PATH", deployed)
    return deployed


@pytest.fixture
def client(quiz_catalog: Path) -> Iterator[TestClient]:
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



def test_bank_correction_keeps_frozen_version_score(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    question = get_question_store().get_question("COP006")
    monkeypatch.setattr(question, "answer", "B")

    # 首次从干净目录出卷，活题库已经勘误。
    assert client.get("/api/quiz/co-memory-01").json()["version"] == "1"
    assert _submit(client).json()["score"] == 2


def test_new_deployment_still_accepts_old_sheet(client: TestClient, quiz_catalog: Path):
    catalog = json.loads(quiz_catalog.read_text(encoding="utf-8"))
    quiz_set = catalog["co-memory-01"]
    v2 = deepcopy(quiz_set["versions"]["1"])
    v2["questions"][1]["answer"] = "B"
    quiz_set["versions"]["2"] = v2
    quiz_set["current_version"] = "2"
    quiz_catalog.write_text(json.dumps(catalog, ensure_ascii=False), encoding="utf-8")

    assert client.get("/api/quiz/co-memory-01").json()["version"] == "2"
    assert _submit(client, version="2").json()["score"] == 3
    old = _submit(client)
    assert old.status_code == 200
    assert old.json()["version"] == "1"
    assert old.json()["score"] == 2


def test_clean_deployment_grades_from_catalog_without_loading_live_bank(
    client: TestClient, quiz_catalog: Path, monkeypatch: pytest.MonkeyPatch,
):
    before = quiz_catalog.read_bytes()

    def unavailable_bank():
        raise AssertionError("小测应从随版本发布的快照读取题目")

    monkeypatch.setitem(app.dependency_overrides, get_question_store, unavailable_bank)
    sheet = client.get("/api/quiz/co-memory-01")
    assert sheet.status_code == 200
    assert sheet.json()["version"] == "1"
    scored = _submit(client)
    assert scored.status_code == 200
    assert scored.json()["score"] == 2
    assert quiz_catalog.read_bytes() == before
