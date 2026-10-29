"""POST /api/search —— 查题检索，返回 original / similar / miss 三态。

契约以 Apifox 为准，响应字段名与结构不可私自修改。
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.deps import get_retrieval_service
from app.schemas.question import Question
from app.schemas.search import (
    QuestionData,
    SearchRequest,
    SearchResponse,
    SimilarQuestion,
)
from app.services.retrieval import RetrievalService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["search"])


def _to_question_data(question: Question) -> QuestionData:
    """把题库内部模型裁成契约要求的出参（内部扩展字段不外泄）。"""
    return QuestionData(
        question_id=question.question_id,
        subject=question.subject,
        chapter=question.chapter,
        stem=question.stem,
        options=list(question.options),
        answer=question.answer,
        solution=question.solution,
        review_state=question.normalized_review_state(),
        source_ref=question.source_ref,
    )


def _to_similar(question: Question) -> SimilarQuestion:
    return SimilarQuestion(
        question_id=question.question_id,
        subject=question.subject,
        stem=question.stem,
        source_ref=question.source_ref,
    )


@router.post("/search", response_model=SearchResponse)
def search_question(
    payload: SearchRequest,
    service: Annotated[RetrievalService, Depends(get_retrieval_service)],
) -> SearchResponse:
    """题干检索。

    - original：命中已核验原题，返回题库核验解析；
    - similar：只返回相似题列表（question_data 为 null），候选只作参考，用户可围绕自己的原题继续答疑；
    - miss：题库未收录，交给 Agent 链路尝试解题。

    input_type=image 时，v1 后端不做 OCR，raw_input 视为前端 / 上传接口已提取的文本；
    若 raw_input 为空白则由请求模型返回 422。
    """
    outcome = service.search(payload.raw_input)
    logger.info(
        "search match_type=%s reason=%s input_type=%s length=%d",
        outcome.match_type,
        outcome.reason,
        payload.input_type,
        len(payload.raw_input),
    )

    if outcome.match_type == "original" and outcome.question is not None:
        return SearchResponse(
            match_type="original",
            question_data=_to_question_data(outcome.question),
            similar_questions=[],
        )

    if outcome.match_type == "similar":
        return SearchResponse(
            match_type="similar",
            question_data=None,
            similar_questions=[_to_similar(c.question) for c in outcome.candidates],
        )

    return SearchResponse(match_type="miss", question_data=None, similar_questions=[])
