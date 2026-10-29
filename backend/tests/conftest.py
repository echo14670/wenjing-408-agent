"""pytest 公共夹具：把 backend 目录加入模块搜索路径，并提供一个可控的小题库。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.schemas.question import Question
from app.services.retrieval import RetrievalService


def make_question(
    qid: str,
    stem: str,
    *,
    subject: str = "计算机组成原理",
    chapter: str = "存储系统",
    review_state: str = "verified",
    answer: str = "B",
    solution: str = "",
    source_ref: str = "",
    options: list[str] | None = None,
    knowledge_points: list[str] | None = None,
    tags: list[str] | None = None,
) -> Question:
    """构造测试用题目，缺省字段都给安全值。"""
    return Question(
        question_id=qid,
        subject=subject,
        chapter=chapter,
        stem=stem,
        options=options or [],
        answer=answer,
        solution=solution,
        source_ref=source_ref or f"测试用例 {qid}",
        review_state=review_state,
        knowledge_points=knowledge_points or [],
        tags=tags or [],
    )


@pytest.fixture
def cache_bank() -> list[Question]:
    """Cache 主题小题库：含基准题 + 参数不同的变式题，用于验证三态与参数一致性。"""
    return [
        make_question(
            "Q001",
            "某计算机按字节编址，Cache 容量为 64KB，主存块大小为 64B，采用四路组相联映射，"
            "主存地址为 32 位。有同学认为“该地址中的组号占 2 位”。请判断该说法是否正确，并说明理由。",
            answer="B",
            solution="行数 = 64KB ÷ 64B = 1024；组数 = 1024 ÷ 4 = 256；组索引 = 8 位。",
            knowledge_points=["Cache 组相联映射"],
            tags=["Cache", "组相联"],
        ),
        make_question(
            "Q002",
            "某计算机按字节编址，Cache 容量为 32KB，主存块大小为 32B，采用两路组相联映射。求组索引位数。",
            answer="B",
            solution="组数 = 512，组索引 = 9 位。",
            knowledge_points=["Cache 组相联映射"],
            tags=["Cache", "组相联"],
        ),
        make_question(
            "Q003",
            "采用 8 位补码表示定点整数时，其所能表示的数值范围是多少？",
            chapter="数据的表示和运算",
            answer="B",
            knowledge_points=["定点数表示"],
        ),
    ]


@pytest.fixture
def cache_service(cache_bank: list[Question]) -> RetrievalService:
    return RetrievalService(
        questions=cache_bank,
        original_threshold=0.72,
        similar_threshold=0.28,
        max_similar=5,
        unverified_policy="downgrade",
    )
