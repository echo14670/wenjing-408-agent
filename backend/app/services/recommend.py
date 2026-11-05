"""同考点推荐服务（F01 扩展能力）。

需求（阶段任务卡）：
- 根据当前题目的考点，推荐同考点练习题；
- 排除当前题本身；
- 优先返回「未做过的已核验题」——做过的题由前端 LocalStorage 记录并随请求传入
  done_question_ids（后端无状态，不存用户数据）；
- 无合适候选时返回空结果，不硬凑。

召回层级（scope）
----------------
正式题库（80 题）实测：80 道题对应 80 个考点，考点零复用。
严格只认同考点会退化成一个永远返回空数组的接口，因此做两级召回：

  1. knowledge_point —— 与当前题共享至少一个考点（首选）；
  2. chapter         —— 考点层无候选时，退到同章节（同一章的知识点天然相邻）。

章节为空的题不参与第 2 级，避免「空章节」把全库串起来。
两级都没有合适候选 -> 返回空数组。

合适候选的优先级（review policy）
--------------------------------
  1. 未做过 + 已核验   —— 唯一默认返回的组合（符合任务卡与三态隔离红线）；
  2. 未做过 + 待核验   —— 仅在请求显式带上 include_unverified=true 时返回，
                          用于演示 / 题库尚未完成核验的阶段，前端必须打「待核验」标记，
                          不得当作核验解析展示（红线见《开发基准与设计规范》）。
做过的题一律不返回。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.schemas.question import Question

logger = logging.getLogger(__name__)

DEFAULT_TOP_K = 5
MAX_TOP_K = 10

# 召回层级标识，直接回给前端用于文案（「同考点练习」/「同章节练习」）。
SCOPE_KNOWLEDGE_POINT = "knowledge_point"
SCOPE_CHAPTER = "chapter"
SCOPE_NONE = "none"


@dataclass
class RecommendOutcome:
    """推荐结果：仅保留合适候选，附召回层级与原因便于前端展示和排查。"""

    questions: list[Question] = field(default_factory=list)
    scope: str = SCOPE_NONE
    reason: str = ""
    shared_kp: dict[str, list[str]] = field(default_factory=dict)  # question_id -> 共享考点名


class RecommendService:
    """考点 / 章节倒排索引，查询 O(候选数)，无需重复建全文索引。"""

    def __init__(self, questions: list[Question]) -> None:
        self._by_id: dict[str, Question] = {q.question_id: q for q in questions}
        # 考点名 -> 题目 id；同一考点可能有不同写法，按字面聚合，
        # 由数据同学在题库里统一考点命名（见设计文档 knowledge_points 约定）。
        self._kp_index: dict[str, list[str]] = {}
        self._chapter_index: dict[str, list[str]] = {}
        for q in questions:
            for kp in q.knowledge_points:
                self._kp_index.setdefault(kp, []).append(q.question_id)
            if q.chapter:
                self._chapter_index.setdefault(q.chapter, []).append(q.question_id)

    def __len__(self) -> int:
        return len(self._by_id)

    # ------------------------------------------------------------------ 对外

    def recommend(
        self,
        question_id: str,
        done_question_ids: list[str] | None = None,
        top_k: int = DEFAULT_TOP_K,
        include_unverified: bool = False,
    ) -> RecommendOutcome:
        done = {d for d in (done_question_ids or []) if d}
        top_k = max(1, min(top_k, MAX_TOP_K))

        current = self._by_id.get(question_id)
        if current is None:
            return RecommendOutcome(reason="question_not_found")

        # 第 1 级：同考点；第 2 级：同章节。
        levels: list[tuple[str, set[str]]] = []
        if current.knowledge_points:
            ids: set[str] = set()
            for kp in current.knowledge_points:
                ids.update(self._kp_index.get(kp, []))
            levels.append((SCOPE_KNOWLEDGE_POINT, ids))
        if current.chapter:
            levels.append(
                (SCOPE_CHAPTER, set(self._chapter_index.get(current.chapter, [])))
            )

        if not levels:
            return RecommendOutcome(reason="no_knowledge_points")

        for scope, candidate_ids in levels:
            candidate_ids = candidate_ids - {question_id} - done
            if not candidate_ids:
                continue
            outcome = self._pick(current, candidate_ids, scope, top_k, include_unverified)
            if outcome.questions:
                return outcome

        return RecommendOutcome(reason="no_suitable_candidate")

    # ------------------------------------------------------------------ 内部

    def _pick(
        self,
        current: Question,
        candidate_ids: set[str],
        scope: str,
        top_k: int,
        include_unverified: bool,
    ) -> RecommendOutcome:
        """在候选集合里挑合适题：已核验优先，未核验仅作兜底（需显式开启）。"""
        verified: list[tuple[Question, list[str]]] = []
        unverified: list[tuple[Question, list[str]]] = []

        for cid in candidate_ids:
            candidate = self._by_id[cid]
            shared = [kp for kp in current.knowledge_points if kp in candidate.knowledge_points]
            bucket = verified if candidate.is_verified() else unverified
            bucket.append((candidate, shared))

        pool = verified
        if not pool and include_unverified:
            pool = unverified
        if not pool:
            return RecommendOutcome(reason="no_suitable_candidate")

        # 排序：共享考点数多者优先 -> 已核验优先 -> 题号，保证结果稳定可复现。
        pool.sort(key=lambda pair: (-len(pair[1]), pair[0].question_id))
        chosen = pool[:top_k]
        reason = "ok" if pool is verified else "unverified_fallback"
        return RecommendOutcome(
            questions=[q for q, _ in chosen],
            scope=scope,
            reason=reason,
            shared_kp={q.question_id: kps for q, kps in chosen},
        )
