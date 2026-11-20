"""POST /api/chat —— 直接解析与引导式答疑。"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.api.model_config import configured_client, require_profiles

from app.deps import get_chat_service
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.model_profiles import ModelConfigError
from app.services.agent import (
    ChatService,
    LLMNotConfiguredError,
    LLMUpstreamError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])
_STREAM_MEDIA_TYPE = "application/x-ndjson"


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: Request,
    payload: ChatRequest,
    service: Annotated[ChatService, Depends(get_chat_service)],
    user_api_key: str | None = Header(default=None, alias="X-User-LLM-Key"),
    model_profile: str | None = Header(default=None, alias="X-Wenjing-Model-Profile", max_length=64),
) -> ChatResponse | StreamingResponse:
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
        options = {"user_api_key": user_api_key}
        if model_profile:
            profile = require_profiles(request).get(model_profile)
            options = {"llm_client": configured_client(profile.base_url, profile.model, profile.api_key)}
        if request.headers.get("accept") == _STREAM_MEDIA_TYPE:
            events = service.stream_chat(payload, **options)
            return StreamingResponse(
                _encode_events(events, payload.question_id),
                media_type=_STREAM_MEDIA_TYPE,
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        return await service.chat(payload, **options)
    except ModelConfigError as error:
        raise HTTPException(error.status_code, str(error)) from error
    except (LLMNotConfiguredError, LLMUpstreamError) as error:
        raise _chat_http_error(error, payload.question_id) from error


def _chat_http_error(
    error: LLMNotConfiguredError | LLMUpstreamError, question_id: str | None
) -> HTTPException:
    if isinstance(error, LLMNotConfiguredError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "llm_not_configured",
                "message": str(error),
                "retryable": False,
            },
        )
    logger.warning("chat upstream failure question_id=%s", question_id)
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={
            "code": "llm_upstream_error",
            "message": str(error),
            "retryable": True,
            "retry_after_seconds": 5,
        },
        headers={"Retry-After": "5"},
    )


async def _encode_events(
    events: AsyncGenerator[str | ChatResponse, None], question_id: str | None
) -> AsyncIterator[str]:
    try:
        async with aclosing(events):
            async for event in events:
                if isinstance(event, str):
                    message = {"type": "delta", "text": event}
                else:
                    message = {"type": "done", "response": event.model_dump()}
                yield json.dumps(message, ensure_ascii=False) + "\n"
    except (LLMNotConfiguredError, LLMUpstreamError) as error:
        failure = _chat_http_error(error, question_id)
        message = {"type": "error", "status": failure.status_code, "detail": failure.detail}
        yield json.dumps(message, ensure_ascii=False) + "\n"
