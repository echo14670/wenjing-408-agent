"""题库内部数据模型（Questions.json 的载入结构）。

注意：这里的字段属于「题库资产」，可以随数据同学（林明亮）的需求扩展；
对外接口的出入参以 app/schemas/search.py 为准，严格对齐 Apifox 契约，两者解耦。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# 408 四门统考科目。
SUBJECTS = ("数据结构", "计算机组成原理", "操作系统", "计算机网络")

# 题型。
QUESTION_TYPES = (
    "single_choice",
    "multiple_choice",
    "fill_blank",
    "short_answer",
    "calculation",
    "comprehensive",
)

# 核验状态：待核验 / 已核验 / 有争议（见《开发基准与设计规范》数据字典）。
ReviewState = Literal["pending", "verified", "disputed"]
REVIEW_STATE_LABELS = {
    "pending": "待核验",
    "verified": "已核验",
    "disputed": "有争议",
}


class KnowledgePoint(BaseModel):
    """考点：kp_id + name，用于同考点推荐与知识树。"""

    kp_id: str
    name: str
    subject: str = ""


class Question(BaseModel):
    """一道题目。

    必填字段只有 question_id / subject / stem，其余均可缺省，
    这样数据同学可以分批补充字段而不会让整个题库加载失败。
    """

    question_id: str = Field(..., min_length=1)
    subject: str = Field(..., min_length=1)
    chapter: str = ""
    question_type: str = "single_choice"
    stem: str = Field(..., min_length=1)
    options: list[str] = Field(default_factory=list)
    answer: str = ""
    solution: str = ""
    source_ref: str = ""
    review_state: str = "pending"
    knowledge_points: list[str] = Field(default_factory=list)
    year: int | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)
    tags: list[str] = Field(default_factory=list)

    def normalized_review_state(self) -> str:
        """把未知 / 中文核验状态收敛到三态枚举，非法值按最保守的 pending 处理。"""
        value = (self.review_state or "").strip().lower()
        if value in REVIEW_STATE_LABELS:
            return value
        for key, label in REVIEW_STATE_LABELS.items():
            if value == label:
                return key
        return "pending"

    def is_verified(self) -> bool:
        return self.normalized_review_state() == "verified"


class QuestionBank(BaseModel):
    """题库文件整体结构。"""

    version: str = "1.0"
    updated_at: str = ""
    source_table: str = ""
    knowledge_points: list[KnowledgePoint] = Field(default_factory=list)
    questions: list[Question] = Field(default_factory=list)
