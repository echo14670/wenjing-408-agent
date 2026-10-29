"""POST /api/chat —— 直接解析与引导式答疑。"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.deps import get_chat_service
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.agent import (
    ChatService,
    LLMNotConfiguredError,
    LLMUpstreamError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    service: Annotated[ChatService, Depends(get_chat_service)],
    user_api_key: str | None = Header(default=None, alias="X-User-LLM-Key"),
) -> ChatResponse:
    """按冻结契约返回 reply / tool_result / citations。

    X-User-LLM-Key 是可选扩展，用于满足“前端允许自带 Key”；不写入日志、
    不持久化，也不改变 Apifox 的请求/响应字段。
    """
    logger.info(
        "chat request mode=%s question_id=%s messages=%d chunks=%d",
        payload.mode,
        payload.question_id,
        len(payload.session_messages),
        len(payload.context_chunks),
    )
    try:
        return await service.chat(payload, user_api_key=user_api_key)
    except LLMNotConfiguredError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "llm_not_configured", "message": str(error)},
        ) from error
    except LLMUpstreamError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "llm_upstream_error", "message": str(error)},
        ) from error
