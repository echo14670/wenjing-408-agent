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
    LLMNotConfiguredError,
    LLMUpstreamError,
    is_authoritative_source,
)
from app.services.agent_tools import run_calculation_tool
from app.services.question_store import QuestionStore
from main import app
from tests.conftest import make_question


@pytest.fixture
def quality_store() -> QuestionStore:
    store = QuestionStore(BACKEND_ROOT / "data" / "questions.sample.json")
    store.load()
    return store


@pytest.fixture
def formal_store() -> QuestionStore:
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


@pytest.mark.parametrize(
    ("question_id", "expected_fragments"),
    [
        (
            "COP005",
            (
                "block_offset_bits: 6",
                "index_bits: 10",
                "tag_bits: 14",
            ),
        ),
        (
            "COP006",
            (
                "block_offset_bits: 6",
                "group_bits: 7",
                "tag_bits: 19",
            ),
        ),
        (
            "COP007",
            (
                "average_access_time_cycles: 6",
                "miss_rate: 0.05",
                "model: serial",
            ),
        ),
        (
            "COP020",
            (
                "block_offset_bits: 5",
                "group_bits: 8",
                "tag_bits: 19",
                "hits: 3",
                "hit_rate: 0.5",
            ),
        ),
    ],
)
def test_formal_cache_questions_are_parameter_driven(
    formal_store: QuestionStore,
    question_id: str,
    expected_fragments: tuple[str, ...],
) -> None:
    question = formal_store.get_question(question_id)
    assert question is not None

    outcome = run_calculation_tool(question)

    assert outcome.status == "ok", outcome.reason
    for fragment in expected_fragments:
        assert fragment in outcome.result


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


def test_effective_model_config_is_read_by_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_API_KEY", "configured-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://api.deepseek.com")
    monkeypatch.setenv("LLM_MODEL", "deepseek-flash")
    monkeypatch.setenv("LLM_TEMPERATURE", "0.15")
    monkeypatch.setenv("LLM_MAX_TOKENS", "1800")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "45")

    settings = Settings()

    assert settings.llm_api_key == "configured-key"
    assert settings.llm_base_url == "https://api.deepseek.com"
    assert settings.llm_model == "deepseek-flash"
    assert settings.llm_temperature == 0.15
    assert settings.llm_max_tokens == 1800
    assert settings.llm_timeout_seconds == 45


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


def test_miss_with_personal_context_uses_only_provided_material(
    quality_store: QuestionStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_API_KEY", "quality-test-key")
    monkeypatch.setenv("LLM_MODEL", "deepseek-flash")
    fake = FakeQualityLLM("根据你的笔记，串行模型应先计算缺失率。")
    service = AgentService(store=quality_store, settings=Settings())
    service.set_client_factory(lambda _: fake)

    response = asyncio.run(
        service.chat(
            ChatRequest(
                session_messages=[
                    SessionMessage(role="user", content="按我的笔记解释平均访问时间")
                ],
                question_id=None,
                mode="direct",
                context_chunks=["串行模型：平均访问时间 = 命中时间 + 缺失率 × 缺失代价。"],
            )
        )
    )

    assert response.citations == ["用户提供的个人资料切片"]
    assert "串行模型" in fake.system


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
        self.system = ""

    async def complete(self, *, system: str, messages: list[dict[str, str]]) -> str:
        self.system = system
        return self.reply


class FailingChatService:
    async def chat(self, payload, *, user_api_key=None):
        raise LLMUpstreamError("模型服务暂时不可用，请保留当前内容后重试。")


class UnconfiguredChatService:
    async def chat(self, payload, *, user_api_key=None):
        raise LLMNotConfiguredError("未配置 LLM_API_KEY。")


def test_model_not_configured_returns_non_retryable_503() -> None:
    app.dependency_overrides[get_chat_service] = lambda: UnconfiguredChatService()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/chat",
                json={
                    "session_messages": [{"role": "user", "content": "讲解 COP005"}],
                    "question_id": "COP005",
                    "user_answer": "",
                    "mode": "direct",
                    "context_chunks": [],
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "llm_not_configured"
    assert detail["retryable"] is False


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
