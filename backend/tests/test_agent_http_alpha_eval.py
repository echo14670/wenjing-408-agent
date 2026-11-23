"""Regression checks for the deployed Agent evaluation command."""

import json
import sys

import pytest

from tools import agent_http_alpha_eval

BASE_URL = "http://local-agent.test"
READY_HEALTH = {
    "status": "ok",
    "questions": 81,
    "skipped": [],
    "llm_configured": True,
    "llm_model": "deepseek-flash",
}


def run_evaluation(monkeypatch, capsys, health, chat=None, preflight_only=False):
    chat_requests = []

    def request(url, *, payload=None):
        if url == f"{BASE_URL}/api/health":
            return 200, health
        assert url == f"{BASE_URL}/api/chat"
        chat_requests.append(payload)
        assert chat is not None
        return chat

    arguments = ["agent_http_alpha_eval.py", "--base-url", BASE_URL]
    if preflight_only:
        arguments.append("--preflight-only")
    monkeypatch.setattr(sys, "argv", arguments)
    monkeypatch.setattr(agent_http_alpha_eval, "request_json", request)
    exit_code = agent_http_alpha_eval.main()
    return exit_code, json.loads(capsys.readouterr().out), chat_requests


@pytest.mark.parametrize(
    "model_fields",
    [{}, {"llm_configured": False, "llm_model": "deepseek-flash"}],
)
def test_preflight_blocks_when_model_readiness_is_absent_or_false(
    monkeypatch, capsys, model_fields
):
    health = {"status": "ok", "questions": 81, "skipped": [], **model_fields}
    exit_code, report, chat_requests = run_evaluation(
        monkeypatch, capsys, health, preflight_only=True
    )

    assert exit_code == 2
    assert report["status"] == "blocked"
    assert not report["preflight_ok"]
    assert chat_requests == []


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"reply": " \n", "tool_result": "", "citations": []},
        {"reply": "有文本", "tool_result": "", "citations": "无"},
    ],
)
def test_http_200_without_a_valid_chat_response_fails(monkeypatch, capsys, body):
    exit_code, report, chat_requests = run_evaluation(
        monkeypatch, capsys, READY_HEALTH, (200, body)
    )

    assert exit_code == 1
    assert report["status"] == "failed"
    assert len(chat_requests) == len(agent_http_alpha_eval.CASES)
    assert all(result["error"] for result in report["results"])


def test_successful_calls_preserve_full_replies_for_manual_review(monkeypatch, capsys):
    reply = "这里是待人工核对的内容。" * 60
    body = {"reply": reply, "tool_result": "", "citations": ["个人资料"]}
    exit_code, report, chat_requests = run_evaluation(
        monkeypatch, capsys, READY_HEALTH, (200, body)
    )

    assert exit_code == 0
    assert report["status"] == "needs_review"
    assert len(chat_requests) == len(agent_http_alpha_eval.CASES)
    assert all(result["reply"] == reply for result in report["results"])


@pytest.mark.parametrize("questions", [16, 82])
def test_preflight_requires_the_fixed_question_bank_count(monkeypatch, capsys, questions):
    health = {**READY_HEALTH, "questions": questions}
    body = {"reply": "有文本", "tool_result": "", "citations": []}
    exit_code, report, chat_requests = run_evaluation(
        monkeypatch, capsys, health, (200, body)
    )

    assert exit_code == 2
    assert report["status"] == "blocked"
    assert chat_requests == []


def test_unrevealed_guided_cases_flag_tool_result_as_a_leak(monkeypatch, capsys):
    body = {"reply": "你可以先算组数。", "tool_result": "组索引为 6 位", "citations": []}
    exit_code, report, _ = run_evaluation(
        monkeypatch, capsys, READY_HEALTH, (200, body)
    )

    assert exit_code == 1
    assert report["status"] == "failed"
    assert [
        result["case"].split("_")[0]
        for result in report["results"]
        if result["guided_leak"]
    ] == ["C05", "C06"]
