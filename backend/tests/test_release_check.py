import io
import json
import runpy
import sys
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import health
from main import app

release_check = runpy.run_path(str(Path(__file__).resolve().parents[2] / "scripts" / "release_check.py"))
Checker = release_check["Checker"]
CANDIDATE = "1234567890abcdef1234567890abcdef12345678"
PREVIOUS = "abcdef0123456789abcdef0123456789abcdef01"


@pytest.fixture
def release_cli(monkeypatch):
    def run(*args, build_commit=None):
        monkeypatch.setattr(sys, "argv", ["release_check.py", "--profile", "release", *args])
        monkeypatch.setattr(Checker, "get_json", lambda self, path: {
            "status": "ok",
            "questions": 81,
            "skipped": [],
            "llm_configured": True,
            "llm_model": "Qwen/Qwen2.5-7B-Instruct",
            "build_commit": build_commit,
        })
        for method in (
            "check_routes", "check_question", "check_recommend",
            "check_search_variants", "check_stream_protocol", "check_quiz",
        ):
            monkeypatch.setattr(Checker, method, lambda self: None)
        return release_check["main"]()

    return run


def test_health_reports_build_commit_baked_into_image(tmp_path, monkeypatch):
    marker = tmp_path / ".build-commit"
    marker.write_text(CANDIDATE, encoding="utf-8")
    monkeypatch.setattr(health, "BUILD_COMMIT_FILE", marker, raising=False)

    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.json()["build_commit"] == CANDIDATE


@pytest.mark.parametrize(("build_commit", "exit_code"), [
    (CANDIDATE, 0),
    (PREVIOUS, 1),
    (None, 1),
])
def test_release_compares_running_build_to_expected_commit(release_cli, build_commit, exit_code):
    assert release_cli("--expect-commit", CANDIDATE[:7], build_commit=build_commit) == exit_code


def test_release_requires_expected_commit(release_cli):
    with pytest.raises(SystemExit) as error:
        release_cli()
    assert error.value.code == 2


QUESTIONS = [
    {"question_id": question_id, "stem": "题干", "options": ["A", "B"]}
    for question_id in ("COP005", "COP006", "COP007")
]


@pytest.mark.parametrize(("payload", "exit_code"), [
    (b"<html>Not a quiz</html>", 1),
    ({"quiz_id": "wrong-quiz", "version": "1", "questions": QUESTIONS}, 1),
    ({"quiz_id": "co-memory-01", "questions": QUESTIONS}, 1),
    ({"quiz_id": "co-memory-01", "version": "1", "questions": QUESTIONS[:2]}, 1),
    ({"quiz_id": "co-memory-01", "version": "1", "questions": [{}, {}, {}]}, 1),
    ({"quiz_id": "co-memory-01", "version": "1", "questions": QUESTIONS}, 0),
])
def test_quiz_requires_a_valid_three_question_response(monkeypatch, payload, exit_code):
    response = io.BytesIO(payload if isinstance(payload, bytes) else json.dumps(payload).encode())
    response.status = 200
    monkeypatch.setattr(urllib.request, "urlopen", lambda *args, **kwargs: response)

    checker = Checker("http://localhost", 1, "release")
    checker.check_quiz()

    assert checker.summary() == exit_code


@pytest.mark.parametrize(("profile", "result"), [("baseline", "SKIP"), ("release", "FAIL")])
def test_quiz_404_depends_on_check_profile(monkeypatch, profile, result):
    def not_found(url, **kwargs):
        raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", not_found)
    checker = Checker("http://localhost", 1, profile)

    checker.check_quiz()

    assert checker.rows[0][1] == release_check[result]
