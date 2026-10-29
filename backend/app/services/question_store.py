"""题库加载与存储。

存储方案：以 data/questions.json 作为唯一事实来源（single source of truth），
进程启动时一次性载入内存并构建检索索引，运行期只读。

为什么选 JSON 文件而不是数据库：
- 数据同学（林明亮）直接交付文件即可，无需后端迁移脚本，Git 可 diff、可 code review；
- 408 题库量级（千级到万级）完全放得进内存，检索延迟在毫秒级；
- 部署无需额外数据库实例，DevOps（林子涵）成本最低。

迁移路径：本模块只暴露 load() / stats()，后续若要换 SQLite / 向量库，
只需提供同样接口的新实现，检索层无需改动。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.schemas.question import KnowledgePoint, Question

logger = logging.getLogger(__name__)


class QuestionStoreError(Exception):
    """题库不可用（文件缺失或整体结构非法）。"""


class QuestionStore:
    """JSON 题库读取器。单条脏数据只跳过并告警，不让整个服务起不来。"""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._questions: list[Question] = []
        self._knowledge_points: list[KnowledgePoint] = []
        self._meta: dict[str, Any] = {}
        self._skipped: list[dict[str, str]] = []
        self._loaded = False

    @property
    def questions(self) -> list[Question]:
        self._ensure_loaded()
        return self._questions

    @property
    def knowledge_points(self) -> list[KnowledgePoint]:
        self._ensure_loaded()
        return self._knowledge_points

    def get_question(self, question_id: str) -> Question | None:
        """按契约 question_id 取题；找不到时由 Agent 走无题库上下文路径。"""
        self._ensure_loaded()
        return next(
            (
                question
                for question in self._questions
                if question.question_id == question_id
            ),
            None,
        )

    def load(self) -> list[Question]:
        """（重新）读取题库文件。"""
        self._questions = []
        self._knowledge_points = []
        self._skipped = []
        self._meta = {}

        if not self.path.exists():
            logger.warning("题库文件不存在：%s，检索将全部返回 miss", self.path)
            self._loaded = True
            return self._questions

        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise QuestionStoreError(f"题库 JSON 解析失败：{self.path}（{exc}）") from exc

        if isinstance(raw, list):  # 兼容「顶层直接是数组」的简写格式
            raw = {"questions": raw}

        if not isinstance(raw, dict):
            raise QuestionStoreError(f"题库顶层结构应为对象或数组：{self.path}")

        self._meta = {
            "version": raw.get("version", ""),
            "updated_at": raw.get("updated_at", ""),
            "source_table": raw.get("source_table", ""),
        }

        for item in raw.get("knowledge_points", []) or []:
            if not isinstance(item, dict):
                continue
            try:
                self._knowledge_points.append(KnowledgePoint(**item))
            except Exception as exc:  # noqa: BLE001
                self._skipped.append({"id": str(item), "reason": f"考点字段非法：{exc}"})

        for index, item in enumerate(raw.get("questions", []) or []):
            if not isinstance(item, dict):
                self._skipped.append({"id": f"#{index}", "reason": "题目不是对象"})
                continue
            try:
                self._questions.append(Question(**item))
            except Exception as exc:  # noqa: BLE001
                qid = str(item.get("question_id") or f"#{index}")
                self._skipped.append({"id": qid, "reason": str(exc)})
                logger.warning("跳过非法题目 %s：%s", qid, exc)

        self._loaded = True
        logger.info(
            "题库加载完成：%s，有效 %d 题，跳过 %d 条",
            self.path,
            len(self._questions),
            len(self._skipped),
        )
        return self._questions

    def reload(self) -> list[Question]:
        return self.load()

    def stats(self) -> dict[str, Any]:
        """题库健康度概览，供 /api/health 与联调排查使用。"""
        self._ensure_loaded()
        by_subject: dict[str, int] = {}
        by_review: dict[str, int] = {}
        for q in self._questions:
            by_subject[q.subject] = by_subject.get(q.subject, 0) + 1
            state = q.normalized_review_state()
            by_review[state] = by_review.get(state, 0) + 1
        return {
            "path": str(self.path),
            "exists": self.path.exists(),
            "total": len(self._questions),
            "knowledge_points": len(self._knowledge_points),
            "by_subject": by_subject,
            "by_review_state": by_review,
            "skipped": self._skipped,
            **self._meta,
        }

    def _ensure_loaded(self) -> None:
        if not self._loaded:
            self.load()
