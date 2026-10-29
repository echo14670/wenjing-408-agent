"""/api/search 出入参模型 —— 严格对齐 Apifox 契约，禁止私自增删字段。

契约（Apifox · 查题检索）：
    请求 { "raw_input": str, "input_type": "text" | "image" }
    响应 { "match_type": str, "question_data": obj | null, "similar_questions": [] }

任何字段变更需先报备 TL 并同步更新 Apifox 与 docs/api-contract.md。
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

# 三态：原题 / 相似题 / 未命中。
MatchType = Literal["original", "similar", "miss"]
# 输入类型：文字 / 图片。
InputType = Literal["text", "image"]


class SearchRequest(BaseModel):
    """查题检索入参。"""

    raw_input: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="题干原文或图片提取文本",
    )
    input_type: InputType = Field(
        "text",
        description="text：文字输入；image：图片（文本由上传链路提取后传入）",
    )

    @field_validator("raw_input")
    @classmethod
    def reject_blank(cls, value: str) -> str:
        """纯空白视为非法入参：返回 422 而不是 miss，避免前端无法区分「没输入」和「没收录」。"""
        if not value.strip():
            raise ValueError("raw_input 不能为空白")
        return value


class QuestionData(BaseModel):
    """原题详情。字段与 Apifox 成功示例及前端 Mock 保持一致。"""

    question_id: str
    subject: str
    chapter: str = ""
    stem: str
    options: list[str] = Field(default_factory=list)
    answer: str = ""
    solution: str = ""
    review_state: str = "pending"
    source_ref: str = ""


class SimilarQuestion(BaseModel):
    """相似题摘要：仅作参考展示，不可进入作答与追问流程。"""

    question_id: str
    subject: str
    stem: str
    source_ref: str = ""


class SearchResponse(BaseModel):
    """查题检索出参。三态互斥，字段恒定存在（未命中时为 null / []）。"""

    match_type: MatchType
    question_data: Optional[QuestionData] = None
    similar_questions: list[SimilarQuestion] = Field(default_factory=list)
