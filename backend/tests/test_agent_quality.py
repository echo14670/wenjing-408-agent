"""Agent 质量控制：计算正确性、来源真实性、条件不足与失败处理。"""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_ROOT, Settings
from app.deps import get_chat_service
from app.schemas.chat import ChatRequest, SessionMessage
from app.services.agent import (
    AgentService,
    LLMUpstreamError,
    is_authoritative_source,
)
from app.services.agent_tools import run_calculation_tool
from app.services.question_store import QuestionStore
from main import app
from tests.conftest import make_question


@pytest.fixture
def quality_store() -> QuestionStore:
    store = QuestionStore(BACKEND_ROOT / "data" / "questions.json")
    store.load()
    return store


@pytest.mark.parametrize(
    ("question_id", "expected_values"),
    [
        ("Q001", {"cache_lines": 1024, "sets": 256, "group_bits": 8, "tag_bits": 18}),
        ("Q002", {"cache_lines": 1024, "sets": 512, "group_bits": 9}),
        ("Q003", {"average_access_time_ns": 15, "miss_rate": 0.05}),
        ("Q004", {"cache_lines": 256, "index_bits": 8, "tag_bits": 18}),
    ],
)
def test_cache_tools_match_fixed_cases(
    quality_store: QuestionStore,
    question_id: str,
    expected_values: dict[str, int | float],
) -> None:
    question = quality_store.get_question(question_id)
    assert question is not None

    outcome = run_calculation_tool(question)

    assert outcome.status == "ok"
    for key, expected in expected_values.items():
        assert f"{key}: {expected}" in outcome.result


def test_tool_reports_missing_conditions() -> None:
    question = make_question(
        "Q-MISSING",
        "某 Cache 容量为 64KB，采用四路组相联映射，求组索引位数。",
        tags=["Cache", "组相联"],
    )

    outcome = run_calculation_tool(question)

    assert outcome.status == "insufficient"
    assert "块大小" in outcome.missing_conditions
    assert outcome.result == ""


def test_source_filter_rejects_demo_markers() -> None:
    assert is_authoritative_source("《计算机组成原理》第 4 版，第 120 页")
    assert not is_authoritative_source("联调样例 · 待《资料来源表》替换")
    assert not is_authoritative_source("QA 基准用例 · 非真题出处")
    assert not is_authoritative_source("")


def test_demo_question_does_not_return_fake_citation(
    quality_store: QuestionStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_API_KEY", "quality-test-key")
    monkeypatch.setenv("LLM_MODEL", "deepseek-flash")
    service = AgentService(store=quality_store, settings=Settings())
    service.set_client_factory(lambda _: FakeQualityLLM("组号为 8 位。"))

    response = asyncio.run(
        service.chat(
            ChatRequest(
                session_messages=[SessionMessage(role="user", content="直接讲解")],
                question_id="Q001",
                mode="direct",
            )
        )
    )

    assert response.citations == []


def test_non_authoritative_question_without_tool_gets_visible_scope_notice(
    quality_store: QuestionStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_API_KEY", "quality-test-key")
    monkeypatch.setenv("LLM_MODEL", "deepseek-flash")
    service = AgentService(store=quality_store, settings=Settings())
    service.set_client_factory(lambda _: FakeQualityLLM("8 位补码范围是 -128 到 127。"))

    response = asyncio.run(
        service.chat(
            ChatRequest(
                session_messages=[SessionMessage(role="user", content="解释补码范围")],
                question_id="Q005",
                mode="direct",
            )
        )
    )

    assert response.citations == []
    assert "没有可核验的外部来源" in response.reply


def test_miss_without_context_skips_model_call(
    quality_store: QuestionStore,
) -> None:
    service = AgentService(store=quality_store, settings=Settings())

    def should_not_run(_: str):
        raise AssertionError("未命中且无资料时不应调用模型")

    service.set_client_factory(should_not_run)
    response = asyncio.run(
        service.chat(
            ChatRequest(
                session_messages=[
                    SessionMessage(role="user", content="一道题库未收录的 Cache 题")
                ],
                question_id=None,
                mode="direct",
            )
        )
    )

    assert response.citations == []
    assert response.tool_result == ""
    assert "未命中题库" in response.reply
    assert "不会编造" in response.reply


def test_insufficient_conditions_skip_model_and_request_missing_fields(
    tmp_path,
) -> None:
    question = make_question(
        "Q-MISSING",
        "某 Cache 容量为 64KB，采用四路组相联映射，求组索引位数。",
        solution="",
        tags=["Cache", "组相联"],
    ).model_dump()
    data_path = tmp_path / "questions.json"
    data_path.write_text(
        json.dumps({"questions": [question]}, ensure_ascii=False),
        encoding="utf-8",
    )
    store = QuestionStore(data_path)
    store.load()
    service = AgentService(store=store, settings=Settings())

    def should_not_run(_: str):
        raise AssertionError("条件不足时不应调用模型补条件")

    service.set_client_factory(should_not_run)
    response = asyncio.run(
        service.chat(
            ChatRequest(
                session_messages=[SessionMessage(role="user", content="求组索引位数")],
                question_id="Q-MISSING",
                mode="direct",
            )
        )
    )

    assert "条件不足" in response.reply
    assert "块大小" in response.reply
    assert response.tool_result == ""


class FakeQualityLLM:
    def __init__(self, reply: str) -> None:
        self.reply = reply

    async def complete(self, *, system: str, messages: list[dict[str, str]]) -> str:
        return self.reply


class FailingChatService:
    async def chat(self, payload, *, user_api_key=None):
        raise LLMUpstreamError("模型服务暂时不可用，请保留当前内容后重试。")


def test_model_failure_returns_retryable_gateway_error() -> None:
    app.dependency_overrides[get_chat_service] = lambda: FailingChatService()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/chat",
                json={
                    "session_messages": [{"role": "user", "content": "讲解 Q001"}],
                    "question_id": "Q001",
                    "user_answer": "",
                    "mode": "direct",
                    "context_chunks": [],
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.headers["Retry-After"] == "5"
    detail = response.json()["detail"]
    assert detail["code"] == "llm_upstream_error"
    assert detail["retryable"] is True
