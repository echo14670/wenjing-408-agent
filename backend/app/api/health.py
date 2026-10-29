"""服务自检接口。

部署自检接口，用于检查题库加载与索引状态。
不代表模型或 OCR 可用；与三个学习接口分开记录。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.deps import get_question_store, get_retrieval_service
from app.services import text_utils
from app.services.question_store import QuestionStore
from app.services.retrieval import RetrievalService

router = APIRouter(prefix="/api", tags=["ops"])


@router.get("/health")
def health(
    store: Annotated[QuestionStore, Depends(get_question_store)],
    service: Annotated[RetrievalService, Depends(get_retrieval_service)],
) -> dict:
    stats = store.stats()
    return {
        "status": "ok",
        "questions": stats["total"],
        "by_subject": stats["by_subject"],
        "by_review_state": stats["by_review_state"],
        "skipped": stats["skipped"],
        "tokenizer": "jieba" if text_utils.HAS_JIEBA else "fallback-bigram",
        "indexed": service.size,
    }
