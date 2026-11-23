"""服务自检接口。

部署自检接口，用于检查题库加载与索引状态。
不代表模型或 OCR 可用；与三个学习接口分开记录。
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import get_settings
from app.deps import get_question_store, get_retrieval_service
from app.services import text_utils
from app.services.question_store import QuestionStore
from app.services.retrieval import RetrievalService

router = APIRouter(prefix="/api", tags=["ops"])
BUILD_COMMIT_FILE = Path(__file__).resolve().parents[2] / ".build-commit"


@router.get("/health")
def health(
    store: Annotated[QuestionStore, Depends(get_question_store)],
    service: Annotated[RetrievalService, Depends(get_retrieval_service)],
) -> dict:
    stats = store.stats()
    settings = get_settings()
    model = settings.llm_model
    configured = bool(settings.llm_api_key.strip() and model.strip())
    build_commit = BUILD_COMMIT_FILE.read_text(encoding="utf-8").strip() if BUILD_COMMIT_FILE.is_file() else ""
    return {
        "status": "ok",
        "build_commit": build_commit or None,
        "llm_configured": configured,
        "llm_model": model,
        "llm": {"configured": configured, "model": model},
        "questions": stats["total"],
        "by_subject": stats["by_subject"],
        "by_review_state": stats["by_review_state"],
        "skipped": stats["skipped"],
        "tokenizer": "jieba" if text_utils.HAS_JIEBA else "fallback-bigram",
        "indexed": service.size,
    }

