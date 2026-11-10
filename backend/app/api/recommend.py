"""POST /api/recommend —— 同考点推荐。

⚠️ 契约变更报备：本接口不在 Apifox 现有契约中，属于新增接口。
字段定义已同步到 docs/question-bank-design.md §推荐接口，合入前需 TL 报备并更新 Apifox。

请求：
{
  "question_id": "COP006",
  "done_question_ids": ["OS001"],   // 可选：前端本地做过的题（LocalStorage，后端不落库）
  "top_k": 5,                        // 可选：默认 5，上限 10
  "include_unverified": false        // 可选：演示期可置 true，让待核验题兜底
}

响应：
{
  "questions": [ { ...question_data，同 /api/search 的原题结构 }, ... ],
  "scope": "knowledge_point",        // knowledge_point | chapter | none
  "notice": ""                       // 兜底到待核验题时的提示文案
}

语义：
- 召回：同考点优先，考点无候选时退到同章节（正式题库考点零复用，必须有这一级）；
- 过滤：排除当前题与 done_question_ids；默认只返回「已核验」题；
- 兜底：include_unverified=true 时，同层无已核验题可返回未核验题，并给出 notice；
- 两级都没有合适候选时 questions 为空数组（不硬凑）。
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Literal

from app.api.search import _to_question_data
from app.deps import get_recommend_service
from app.schemas.search import QuestionData
from app.services.recommend import RecommendService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["recommend"])

# 兜底到待核验题时给前端的提示，避免被当作核验解析展示。
UNVERIFIED_NOTICE = "以下题目尚未完成核验，仅作同考点练习推荐，不可作为标准解析展示。"


class RecommendRequest(BaseModel):
    """推荐入参。done_question_ids 来自前端本地记录，后端无状态透传。"""

    question_id: str = Field(..., min_length=1, description="当前题目的 question_id")
    done_question_ids: list[str] = Field(
        default_factory=list,
        description="前端本地已做过的题，推荐时排除",
    )
    top_k: int = Field(default=5, ge=1, le=10, description="推荐数量，默认 5")
    include_unverified: bool = Field(
        default=False,
        description="是否允许待核验题兜底（演示期用，默认关闭）",
    )


class RecommendResponse(BaseModel):
    """推荐出参。无合适候选时 questions 为空数组。"""

    questions: list[QuestionData] = Field(default_factory=list)
    scope: Literal["knowledge_point", "chapter", "none"] = Field(
        default="none", description="召回层级：同考点 / 同章节 / 无"
    )
    notice: str = Field(default="", description="需要前端提示的文案（如待核验兜底）")


@router.post("/recommend", response_model=RecommendResponse)
def recommend_questions(
    payload: RecommendRequest,
    service: RecommendService = Depends(get_recommend_service),
) -> RecommendResponse:
    """同考点推荐：优先返回未做过的已核验题。"""
    outcome = service.recommend(
        question_id=payload.question_id,
        done_question_ids=payload.done_question_ids,
        top_k=payload.top_k,
        include_unverified=payload.include_unverified,
    )
    logger.info(
        "recommend question_id=%s scope=%s reason=%s returned=%d",
        payload.question_id,
        outcome.scope,
        outcome.reason,
        len(outcome.questions),
    )
    return RecommendResponse(
        questions=[_to_question_data(q) for q in outcome.questions],
        scope=outcome.scope,  # type: ignore[arg-type]
        notice=UNVERIFIED_NOTICE if outcome.reason == "unverified_fallback" else "",
    )
