"""依赖注入：题库与检索服务单例。

题库在首次请求（或启动预热）时载入内存，之后只读。
需要刷新题库时调用 get_question_store().reload() 并重建检索服务。
"""

from __future__ import annotations

import logging

from app.core.config import get_settings
from app.services.question_store import QuestionStore
from app.services.retrieval import RetrievalService, build_service

logger = logging.getLogger(__name__)

_store: QuestionStore | None = None
_service: RetrievalService | None = None


def get_question_store() -> QuestionStore:
    global _store
    if _store is None:
        settings = get_settings()
        _store = QuestionStore(settings.question_bank_path)
        _store.load()
    return _store


def get_retrieval_service() -> RetrievalService:
    global _service
    if _service is None:
        settings = get_settings()
        questions = get_question_store().questions
        _service = build_service(
            questions=questions,
            original_threshold=settings.original_threshold,
            similar_threshold=settings.similar_threshold,
            max_similar=settings.max_similar,
            unverified_policy=settings.unverified_policy,
            similar_item_min_score=settings.similar_item_min_score,
        )
        logger.info("检索服务就绪：%d 题，阈值 original=%.2f similar=%.2f",
                    _service.size, settings.original_threshold, settings.similar_threshold)
    return _service


def reset() -> None:
    """测试或热更新用：清空缓存，下次调用重新载入题库。"""
    global _store, _service
    _store = None
    _service = None
