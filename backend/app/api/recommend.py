"""POST /api/recommend —— 同考点推荐。

⚠️ 契约变更报备：本接口不在 Apifox 现有契约中，属于新增接口。
字段定义已同步到 docs/question-bank-design.md §推荐接口，合入前需 TL 报备并更新 Apifox。

请求：
{
  "question_id": "Q001",
  "done_question_ids": ["Q003"],   // 可选：前端本地做过的题（LocalStorage，后端不落库）
  "top_k": 5                        // 可选：默认 5，上限 10
}

响应：
{
  "questions": [ { ...question_data，同 /api/search 的原题结构 }, ... ]
}

语义：
- 只返回「已核验 且 未做过」的同考点题；无合适候选时 questions 为空数组；
- 当前题不存在 / 无考点信息同样返回空数组（reason 供排查，前端可忽略）。
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.search import _to_question_data
from app.deps import get_recommend_service
from app.schemas.search import QuestionData
from app.services.recommend import RecommendService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["recommend"])


class RecommendRequest(BaseModel):
    """推荐入参。done_question_ids 来自前端本地记录，后端无状态透传。"""

    question_id: str = Field(..., min_length=1, description="当前题目的 question_id")
    done_question_ids: list[str] = Field(
        default_factory=list,
        description="前端本地已做过的题，推荐时排除",
    )
    top_k: int = Field(default=5, ge=1, le=10, description="推荐数量，默认 5")


class RecommendResponse(BaseModel):
    """推荐出参。无合适候选时 questions 为空数组。"""

    questions: list[QuestionData] = Field(default_factory=list)


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
    )
    logger.info(
        "recommend question_id=%s reason=%s returned=%d",
        payload.question_id,
        outcome.reason,
        len(outcome.questions),
    )
    return RecommendResponse(
        questions=[_to_question_data(q) for q in outcome.questions],
    )
