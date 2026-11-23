"""Run the fixed real-model Alpha Agent cases and print a JSON checkpoint.

Usage:
    cd backend
    python tools/agent_alpha_eval.py

The script reads LLM_* from the normal application settings. It never prints the
API key. Run it again on the 11/16 integration build and the final candidate.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.core.config import Settings
from app.schemas.chat import ChatRequest, SessionMessage
from app.services.agent import AgentService
from app.services.question_store import QuestionStore


def message(role: str, content: str) -> SessionMessage:
    return SessionMessage(role=role, content=content)


CASES = (
    (
        "C01_COP005_direct_wrong",
        ChatRequest(
            session_messages=[message("user", "我选 D，请纠正我的字段顺序")],
            question_id="COP005",
            user_answer="6、6、20",
            mode="direct",
        ),
    ),
    (
        "C02_COP006_direct",
        ChatRequest(
            session_messages=[message("user", "按已知条件、公式和步骤讲解")],
            question_id="COP006",
            mode="direct",
        ),
    ),
    (
        "C03_COP007_direct_wrong",
        ChatRequest(
            session_messages=[message("user", "我算 6.5 个周期，哪里错了")],
            question_id="COP007",
            user_answer="6.5",
            mode="direct",
        ),
    ),
    (
        "C04_COP020_direct",
        ChatRequest(
            session_messages=[message("user", "请完成地址划分和命中率两部分")],
            question_id="COP020",
            mode="direct",
        ),
    ),
    (
        "C05_COP005_guided_first",
        ChatRequest(
            session_messages=[message("user", "先给一个提示，不要揭晓答案")],
            question_id="COP005",
            user_answer="6、6、20",
            mode="guided",
        ),
    ),
    (
        "C06_COP006_guided_multiturn",
        ChatRequest(
            session_messages=[
                message("user", "先算总行数"),
                message("assistant", "可以，先写出 Cache 行数公式。"),
                message("user", "我算总行数是 512，下一步呢"),
            ],
            question_id="COP006",
            user_answer="总行数512",
            mode="guided",
        ),
    ),
    (
        "C07_COP007_guided_reveal",
        ChatRequest(
            session_messages=[
                message("user", "先提示"),
                message("user", "我已主动选择查看答案，请结合完整答案继续讲解。"),
            ],
            question_id="COP007",
            user_answer="6.5",
            mode="guided",
        ),
    ),
    (
        "C08_miss_personal",
        ChatRequest(
            session_messages=[message("user", "按我的笔记解释平均访问时间")],
            question_id=None,
            mode="direct",
            context_chunks=["串行模型：平均访问时间 = 命中时间 + 缺失率 × 缺失代价。"],
        ),
    ),
)


def has_guided_leak(reply: str) -> bool:
    return bool(
        re.search(
            r"(?:标准答案|正确答案|最终答案|答案|应选|选)\s*[:：]?\s*[A-D]\b",
            reply,
            flags=re.IGNORECASE,
        )
    )


async def main() -> None:
    settings = Settings()
    store = QuestionStore(settings.question_bank_path)
    store.load()
    service = AgentService(store=store, settings=settings)
    results = []
    for name, request in CASES:
        started = time.perf_counter()
        response = await service.chat(request)
        elapsed = time.perf_counter() - started
        answer_revealed = any(
            item.role == "user" and "我已主动选择查看答案" in item.content
            for item in request.session_messages
        )
        results.append(
            {
                "case": name,
                "mode": request.mode,
                "elapsed_seconds": round(elapsed, 2),
                "reply_excerpt": response.reply[:500],
                "tool_result": response.tool_result,
                "citations": response.citations,
                "guided_leak": (
                    has_guided_leak(response.reply)
                    if request.mode == "guided" and not answer_revealed
                    else False
                ),
            }
        )
    print(
        json.dumps(
            {
                "model": settings.llm_model,
                "base_url": settings.llm_base_url,
                "key_configured": bool(settings.llm_api_key),
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
