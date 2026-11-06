# -*- coding: utf-8 -*-
"""
问径 · 408 智能体 —— ORM 映射（SQLAlchemy 2.0）
团队：你说的都队   责任人：周玘晖（后端 · 题库/检索/推荐）

定位：
- 本文件是《数据库设计说明书》的 ORM 映射源文件，与 docs/db-design/schema.sql 一一对应；
- v1 线上仍以 JSON 文件为题库事实来源，本文件**不接入运行时**；
- 采纳路径（v2）：pip install sqlalchemy → 本文件移入 backend/app/db/models.py →
  由 QuestionStore 的窄接口实现替换 JSON 加载，retrieval.py 与路由层无需改动。

运行（自检）：
    python docs/db-design/sqlalchemy_models.py
    # 在内存 SQLite 中建表并打印表结构，验证模式与 schema.sql 一致
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    select,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    Session,
)

# ------------------------------------------------------------------
# 基类
# ------------------------------------------------------------------


class Base(DeclarativeBase):
    """全局 Declarative Base。"""


# ------------------------------------------------------------------
# 1. subject 科目字典
# ------------------------------------------------------------------
class Subject(Base):
    __tablename__ = "subject"

    subject_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        unique=True,
        comment="数据结构/计算机组成原理/操作系统/计算机网络",
    )
    sort_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    knowledge_points: Mapped[list["KnowledgePoint"]] = relationship(
        back_populates="subject"
    )
    questions: Mapped[list["Question"]] = relationship(back_populates="subject")


# ------------------------------------------------------------------
# 2. knowledge_point 考点字典
# ------------------------------------------------------------------
class KnowledgePoint(Base):
    __tablename__ = "knowledge_point"
    __table_args__ = (UniqueConstraint("subject_id", "name", name="uq_kp_subject_name"),)

    kp_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subject.subject_id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)

    subject: Mapped["Subject"] = relationship(back_populates="knowledge_points")
    questions: Mapped[list["Question"]] = relationship(
        secondary="question_kp", back_populates="knowledge_points"
    )


# ------------------------------------------------------------------
# 3. question 题目主表（字段对齐 backend/data/questions.json）
# ------------------------------------------------------------------
QUESTION_TYPES = (
    "single_choice",
    "multiple_choice",
    "fill_blank",
    "short_answer",
    "calculation",
    "comprehensive",
)
REVIEW_STATES = ("pending", "verified", "disputed")


class Question(Base):
    __tablename__ = "question"
    __table_args__ = (
        CheckConstraint(
            f"question_type IN {QUESTION_TYPES!r}".replace("'", '"'),
            name="ck_question_type",
        ),
        CheckConstraint(
            f"review_state IN {REVIEW_STATES!r}".replace("'", '"'),
            name="ck_review_state",
        ),
        CheckConstraint("difficulty IS NULL OR difficulty BETWEEN 1 AND 5",
                        name="ck_question_difficulty"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="代理主键")
    question_id: Mapped[str] = mapped_column(
        String(32), nullable=False, unique=True, comment="业务主键，如 Q001/DS001"
    )
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subject.subject_id"), nullable=False
    )
    chapter: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    question_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="single_choice"
    )
    stem: Mapped[str] = mapped_column(Text, nullable=False, comment="题干，检索主依据")
    answer: Mapped[str | None] = mapped_column(Text)
    solution: Mapped[str | None] = mapped_column(Text, comment="核验解析")
    source_ref: Mapped[str | None] = mapped_column(Text, comment="出处，不得编造")
    review_state: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", comment="参与三态判定"
    )
    permission: Mapped[str] = mapped_column(String(32), nullable=False, default="原创")
    reviewer: Mapped[str | None] = mapped_column(String(64))
    year: Mapped[int | None] = mapped_column(Integer, comment="真题年份，出处不明保持 NULL")
    question_no: Mapped[str | None] = mapped_column(String(32))
    difficulty: Mapped[int | None] = mapped_column(Integer)
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __mapper_args__ = {"eager_defaults": True}

    subject: Mapped["Subject"] = relationship(back_populates="questions")
    options: Mapped[list["QuestionOption"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionOption.sort_no",
    )
    knowledge_points: Mapped[list["KnowledgePoint"]] = relationship(
        secondary="question_kp", back_populates="questions"
    )
    review_records: Mapped[list["ReviewRecord"]] = relationship(
        back_populates="question"
    )


Index("idx_question_subject", Question.subject_id)
Index("idx_question_review", Question.review_state)
Index("idx_question_chapter", Question.chapter)


# ------------------------------------------------------------------
# 4. question_option 选项子表
# ------------------------------------------------------------------
class QuestionOption(Base):
    __tablename__ = "question_option"
    __table_args__ = (UniqueConstraint("question_id", "label", name="uq_option_label"),)

    option_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(8), nullable=False, comment="A/B/C/D…")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sort_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    question: Mapped["Question"] = relationship(back_populates="options")


# ------------------------------------------------------------------
# 5. question_kp 题目-考点关联（M:N）
# ------------------------------------------------------------------
class QuestionKp(Base):
    __tablename__ = "question_kp"

    question_id: Mapped[int] = mapped_column(
        ForeignKey("question.id", ondelete="CASCADE"), primary_key=True
    )
    kp_id: Mapped[int] = mapped_column(
        ForeignKey("knowledge_point.kp_id", ondelete="CASCADE"), primary_key=True
    )


Index("idx_qkp_kp", QuestionKp.kp_id)


# ------------------------------------------------------------------
# 6. review_record 核验流转历史
# ------------------------------------------------------------------
class ReviewRecord(Base):
    __tablename__ = "review_record"

    review_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question.id", ondelete="CASCADE"), nullable=False
    )
    old_state: Mapped[str | None] = mapped_column(String(16))
    new_state: Mapped[str] = mapped_column(String(16), nullable=False)
    reviewer: Mapped[str] = mapped_column(String(64), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )

    question: Mapped["Question"] = relationship(back_populates="review_records")


# ------------------------------------------------------------------
# 7. app_user 用户（v1 匿名设备 UUID）
# ------------------------------------------------------------------
class AppUser(Base):
    __tablename__ = "app_user"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_uuid: Mapped[str | None] = mapped_column(
        String(64), unique=True, comment="v1 前端 LocalStorage 匿名标识"
    )
    nickname: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )

    answers: Mapped[list["UserAnswer"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["ChatSession"]] = relationship(back_populates="user")


# ------------------------------------------------------------------
# 8. user_answer 做题记录（done_question_ids 数据来源）
# ------------------------------------------------------------------
ANSWER_MODES = ("search", "guided", "recommend")


class UserAnswer(Base):
    __tablename__ = "user_answer"
    __table_args__ = (
        CheckConstraint("is_correct IS NULL OR is_correct IN (0, 1)",
                        name="ck_answer_correct"),
        CheckConstraint(
            f"mode IN {ANSWER_MODES!r}".replace("'", '"'), name="ck_answer_mode"
        ),
    )

    record_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.user_id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question.id", ondelete="CASCADE"), nullable=False
    )
    user_answer: Mapped[str | None] = mapped_column(Text)
    is_correct: Mapped[int | None] = mapped_column(Integer, comment="0/1，未判定为 NULL")
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="practice")
    answered_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )

    user: Mapped["AppUser"] = relationship(back_populates="answers")
    question: Mapped["Question"] = relationship()


Index("idx_answer_user_q", UserAnswer.user_id, UserAnswer.question_id)


# ------------------------------------------------------------------
# 9. chat_session 答疑会话
# ------------------------------------------------------------------
class ChatSession(Base):
    __tablename__ = "chat_session"

    session_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("app_user.user_id", ondelete="SET NULL"), comment="允许匿名"
    )
    question_id: Mapped[int | None] = mapped_column(
        ForeignKey("question.id", ondelete="SET NULL"),
        comment="搜到原题后回查关联",
    )
    title: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["AppUser"] = relationship(back_populates="sessions")
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


# ------------------------------------------------------------------
# 10. chat_message 会话消息
# ------------------------------------------------------------------
class ChatMessage(Base):
    __tablename__ = "chat_message"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant', 'system')",
                        name="ck_msg_role"),
    )

    message_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_session.session_id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )

    session: Mapped["ChatSession"] = relationship(back_populates="messages")


Index("idx_msg_session", ChatMessage.session_id, ChatMessage.message_id)


# ------------------------------------------------------------------
# 11. search_log 搜题日志
# ------------------------------------------------------------------
class SearchLog(Base):
    __tablename__ = "search_log"
    __table_args__ = (
        CheckConstraint("input_type IN ('text', 'image')", name="ck_search_input_type"),
        CheckConstraint(
            "match_type IS NULL OR match_type IN ('original', 'similar', 'miss')",
            name="ck_search_match_type",
        ),
    )

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("app_user.user_id", ondelete="SET NULL")
    )
    raw_input: Mapped[str] = mapped_column(Text, nullable=False)
    input_type: Mapped[str] = mapped_column(String(8), nullable=False, default="text")
    match_type: Mapped[str | None] = mapped_column(String(16))
    matched_question_id: Mapped[int | None] = mapped_column(
        ForeignKey("question.id", ondelete="SET NULL")
    )
    top_score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )


Index("idx_search_time", SearchLog.created_at)


# ------------------------------------------------------------------
# 12. upload_document 上传文档
# ------------------------------------------------------------------
class UploadDocument(Base):
    __tablename__ = "upload_document"
    __table_args__ = (
        CheckConstraint("file_type IN ('pdf', 'image')", name="ck_upload_type"),
    )

    upload_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("app_user.user_id", ondelete="SET NULL")
    )
    file_name: Mapped[str] = mapped_column(String(256), nullable=False)
    file_type: Mapped[str] = mapped_column(String(8), nullable=False)
    file_size: Mapped[int | None] = mapped_column(Integer)
    extract_summary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )


# ------------------------------------------------------------------
# 推荐接口核心查询示例（/api/recommend 的 SQL 语义）
#   排除当前题 + 仅 verified + 排除已做过 + 同考点优先同章节兜底
# ------------------------------------------------------------------
RECOMMEND_SQL = select(Question).where(
    Question.id != 0,  # 运行时绑定当前题 id
    Question.review_state == "verified",
    ~Question.id.in_(
        select(UserAnswer.question_id).where(UserAnswer.user_id == 0)
    ),
)


def _self_check() -> None:
    """在内存 SQLite 建全表，打印结构，验证与 schema.sql 一致。"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    tables = sorted(Base.metadata.tables)
    print(f"共 {len(tables)} 张表：")
    for name in tables:
        table = Base.metadata.tables[name]
        cols = ", ".join(f"{c.name}:{c.type}" for c in table.columns)
        print(f"  {name:20s} ({cols})")
    with Session(engine) as session:
        for sid, name in [(1, "数据结构"), (2, "计算机组成原理"),
                          (3, "操作系统"), (4, "计算机网络")]:
            session.add(Subject(subject_id=sid, name=name, sort_no=sid))
        session.commit()
        print("科目字典初始化：", [r.name for r in session.scalars(select(Subject))])


if __name__ == "__main__":
    _self_check()
