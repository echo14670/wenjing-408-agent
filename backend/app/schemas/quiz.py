"""小测（quiz）接口出入参模型 —— 对齐 Beta 冲刺任务书。

出卷只输出作答需要的字段（question_id/stem/options/source_ref），
标准答案与解析在交卷后返回。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class QuizQuestion(BaseModel):
    """出卷时的题目摘要（不含答案与解析）。"""

    question_id: str
    stem: str
    options: list[str] = Field(default_factory=list)
    source_ref: str = ""


class QuizResponse(BaseModel):
    """GET /api/quiz/{quiz_id} 出参。"""

    quiz_id: str
    version: str
    title: str
    questions: list[QuizQuestion]


class QuizSubmitRequest(BaseModel):
    """POST /api/quiz/{quiz_id}/submit 入参。"""

    version: str
    attempt_id: str
    answers: dict[str, str] = Field(..., description="按题号提交的选项，如 {COP005: A}")


class QuizResultItem(BaseModel):
    """逐题判分结果。"""

    question_id: str
    selected: str
    correct: str
    is_correct: bool
    solution: str = ""


class QuizSubmitResponse(BaseModel):
    """交卷判分出参。"""

    quiz_id: str
    version: str
    attempt_id: str
    score: int
    total: int
    results: list[QuizResultItem]
