"""/api/chat 出入参模型，严格对齐 Apifox 冻结契约。

请求：
    session_messages: [{role, content}]
    question_id
    user_answer
    mode: direct | guided
    context_chunks: string[]

响应：
    reply, tool_result, citations
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

ChatMode = Literal["direct", "guided"]
ChatRole = Literal["user", "assistant"]


class SessionMessage(BaseModel):
    role: ChatRole
    content: str = Field(..., min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    session_messages: list[SessionMessage] = Field(..., min_length=1, max_length=30)
    # 前端在 miss 场景会传 null，因此这里兼容空值；字段名仍严格使用 question_id。
    question_id: str | None = Field(default=None, max_length=128)
    user_answer: str = Field(default="", max_length=4000)
    mode: ChatMode
    context_chunks: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("question_id")
    @classmethod
    def normalize_question_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class ChatResponse(BaseModel):
    reply: str
    tool_result: str
    citations: list[str]
