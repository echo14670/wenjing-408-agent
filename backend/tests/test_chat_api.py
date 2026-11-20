"""POST /api/chat 契约、引导模式、工具核验与冲突展示测试。"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_ROOT, Settings
from app.deps import get_chat_service
from app.services.agent import AgentService, LLMUpstreamError
from app.services.question_store import QuestionStore
from main import app


class FakeLLM:
    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.replies: list[str] = []
        self.completed_turns: list[list[dict[str, str]]] = []
        self.stream_parts: list[str] = []
        self.interrupt_stream = False
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
        self.completed_turns.append(messages)
        return self.replies.pop(0) if self.replies else self.reply

    async def stream(
        self, *, system: str, messages: list[dict[str, str]]
    ) -> AsyncIterator[str]:
        for part in self.stream_parts:
            yield part
        if self.interrupt_stream:
            raise LLMUpstreamError("模型回复中断。")


@pytest.fixture
def chat_client(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> Iterator[tuple[TestClient, FakeLLM]]:
    monkeypatch.setenv("LLM_API_KEY", "server-test-key")
    monkeypatch.setenv("LLM_MODEL", "deepseek-flash")
    bank = getattr(request, "param", "questions.sample.json")
    store = QuestionStore(BACKEND_ROOT / "data" / bank)
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
    assert body["citations"] == ["用户提供的个人资料切片"]


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


@pytest.mark.parametrize(
    "reply",
    ["答案：C。", "正确答案为 B。", "因此组索引为 8 位。"],
)
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


@pytest.mark.parametrize("answer_text", [
    "答案：C。",
    "### 结论\n\n答案：**C**。",
    "### 结论\n\n**C**。",
])
def test_direct_stream_sends_deltas_and_final_answer(chat_client, answer_text):
    client, fake = chat_client
    fake.stream_parts = [answer_text, "\n\n组号推导。"]
    response = client.post(
        "/api/chat", json=chat_request(mode="direct"),
        headers={"Accept": "application/x-ndjson"},
    )

    assert response.headers["content-type"].startswith("application/x-ndjson")
    deltas = [json.loads(line) for line in response.iter_lines()]
    assert [event["type"] for event in deltas] == ["delta", "delta", "done"]
    assert [event["text"] for event in deltas[:-1]] == [answer_text, "\n\n组号推导。"]
    final = deltas[-1]["response"]
    assert final["reply"].endswith(answer_text + "\n\n组号推导。")
    assert "冲突提示" in final["reply"]
    assert "group_bits: 8" in final["tool_result"]
    assert final["citations"] == ["用户提供的个人资料切片"]


def test_guided_stream_checks_answer_before_sending_chat(chat_client):
    client, fake = chat_client
    fake.reply = "标准答案为 B，最终组号是 8 位。"
    response = client.post(
        "/api/chat", json=chat_request(mode="guided"),
        headers={"Accept": "application/x-ndjson"},
    )

    events = [json.loads(line) for line in response.iter_lines()]
    assert [event["type"] for event in events] == ["done"]
    assert "标准答案为 B" not in events[0]["response"]["reply"]
    assert events[0]["response"]["tool_result"] == ""


def test_interrupted_stream_sends_error_without_final_answer(chat_client):
    client, fake = chat_client
    fake.stream_parts = ["暂时生成的内容"]
    fake.interrupt_stream = True
    response = client.post(
        "/api/chat", json=chat_request(mode="direct"),
        headers={"Accept": "application/x-ndjson"},
    )

    events = [json.loads(line) for line in response.iter_lines()]
    assert [event["type"] for event in events] == ["delta", "error"]
    assert events[-1]["status"] == 502
    assert events[-1]["detail"]["code"] == "llm_upstream_error"


def test_direct_solution_prompt_requires_a_visible_derivation(chat_client):
    client, fake = chat_client
    response = client.post("/api/chat", json=chat_request(mode="direct"))

    assert response.status_code == 200
    assert "### 结论" in fake.system
    assert "### 分步推导" in fake.system
    assert "### 校验与易错点" in fake.system
    assert "中间结果" in fake.system


@pytest.mark.parametrize(
    ("model_reply", "should_show"),
    [
        ("因此根节点是 `A`。你能用它把中序序列分成哪两段？", True),
        ("`A` 是根。它把中序序列分成了哪两段？", True),
        ("正确答案是 **A**。根节点是 `A`。", False),
        ("答案是（A）。", False),
        ("本题选 A，最后访问整棵树的根。", False),
        ("因此，选 A。", False),
        ("根据遍历规则，可以选 **A**。再核对左右子树。", False),
        ("选项 **A** 正确。", False),
        ("后序是 D → E → B → F → G → C → A。", False),
        ("遍历顺序为 DEBFGCA。根节点是 `A`。", False),
    ],
)
def test_guided_traversal_distinguishes_node_name_from_answer(
    chat_client, model_reply, should_show
):
    client, fake = chat_client
    fake.reply = model_reply
    payload = chat_request()
    payload["question_id"] = "Q007"
    payload["session_messages"] = [{"role": "user", "content": "我选择了 C，想知道下一步。"}]
    payload["user_answer"] = "C"
    payload["context_chunks"] = []

    response = client.post("/api/chat", json=payload)

    assert response.status_code == 200
    reply = response.json()["reply"]
    if should_show:
        assert reply.endswith(model_reply)
    else:
        assert "先不直接公布最终答案" in reply
        assert model_reply not in reply



@pytest.mark.parametrize("chat_client", ["questions.json"], indirect=True)
def test_guided_traversal_continues_after_student_splits_tree(chat_client):
    client, fake = chat_client
    first_hint = "取先序的第一个节点作根。它把中序分成了哪两段？"
    next_hint = (
        "**提示** 以 A 为界拆出的 DBE 和 CF 都正确。所以左子树的节点数是 3。\n\n"
        "**下一步** 从先序的根后数 3 个节点，哪一段属于左子树？"
    )
    fake.replies = [first_hint, next_hint]
    payload = {
        "mode": "guided",
        "question_id": "DS007",
        "user_answer": "C",
        "session_messages": [
            {"role": "user", "content": "求这棵二叉树的后序遍历。"},
            {"role": "user", "content": "先序遍历序列为 ABDECF，中序遍历序列为 DBEACF。先求出根节点"},
        ],
    }
    first = client.post("/api/chat", json=payload)
    assert first.status_code == 200
    assert first.json()["reply"].endswith(first_hint)
    current_step = {"role": "user", "content": "根是A。中序遍历中根左边是DBE，右边是CF"}
    payload["session_messages"].extend([
        {"role": "assistant", "content": first.json()["reply"]},
        current_step,
    ])

    second = client.post("/api/chat", json=payload)
    assert second.status_code == 200
    assert second.json()["reply"].endswith(next_hint)
    assert fake.messages[-1] == current_step
    assert fake.messages[-2] == payload["session_messages"][-2]
    assert len(fake.completed_turns) == 2


def test_blocked_guided_reply_recovers_from_the_current_step(chat_client):
    client, fake = chat_client
    next_hint = "你的行数算对了。现在用路数把这些行分组，应该做乘法还是除法？"
    fake.replies = ["标准答案为 B，组索引是 8 位。", next_hint]
    payload = chat_request()
    payload["session_messages"].extend([
        {"role": "assistant", "content": "先用容量除以块大小，你得到多少行？"},
        {"role": "user", "content": "有 1024 行。"},
    ])

    response = client.post("/api/chat", json=payload)
    assert response.status_code == 200
    assert response.json()["reply"] == next_hint
    assert response.json()["tool_result"] == ""
    assert fake.completed_turns == [payload["session_messages"], payload["session_messages"]]
