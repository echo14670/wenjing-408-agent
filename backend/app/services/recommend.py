"""同考点推荐服务。

需求（来自阶段任务卡）：
- 根据当前题目的考点，推荐同考点练习题；
- 排除当前题本身；
- 优先返回「未做过的已核验题」——做过的题由前端 LocalStorage 记录并随请求传入
  done_question_ids（后端无状态，不存用户数据）；
- 无合适候选时返回空结果，不硬凑。

筛选语义（刻意保守，与检索三态一致）：
- 候选 = 与当前题共享至少一个考点的题；
- 合适候选 = 候选中「已核验 且 不在 done_question_ids」的题；
- 合适候选为空 → 返回空列表，不做降级凑数（是否放宽由 TL 拍板后加策略开关）。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.schemas.question import Question

logger = logging.getLogger(__name__)

# 默认推荐数量；防呆上限防止一次拉全库。
DEFAULT_TOP_K = 5
MAX_TOP_K = 10


@dataclass
class RecommendOutcome:
    """推荐结果：仅保留「合适候选」，附命中原因便于前端展示与排查。"""

    questions: list[Question] = field(default_factory=list)
    reason: str = ""
    shared_kp: dict[str, list[str]] = field(default_factory=dict)  # question_id -> 共享考点名


class RecommendService:
    """基于考点倒排的同考点推荐，查询 O(候选数)，无需重复建全文索引。"""

    def __init__(self, questions: list[Question]) -> None:
        self._by_id: dict[str, Question] = {q.question_id: q for q in questions}
        # 考点名 -> 题目 id 列表；知识库同一考点可能有不同写法，这里按字面聚合，
        # 由数据同学在题库里统一考点命名（见设计文档对 knowledge_points 的约定）。
        self._kp_index: dict[str, list[str]] = {}
        for q in questions:
            for kp in q.knowledge_points:
                self._kp_index.setdefault(kp, []).append(q.question_id)

    def __len__(self) -> int:
        return len(self._by_id)

    def recommend(
        self,
        question_id: str,
        done_question_ids: list[str] | None = None,
        top_k: int = DEFAULT_TOP_K,
    ) -> RecommendOutcome:
        done = {d for d in (done_question_ids or []) if d}
        top_k = max(1, min(top_k, MAX_TOP_K))

        current = self._by_id.get(question_id)
        if current is None:
            return RecommendOutcome(reason="question_not_found")
        if not current.knowledge_points:
            return RecommendOutcome(reason="no_knowledge_points")

        # 候选：同考点，排除当前题。
        candidate_ids: set[str] = set()
        for kp in current.knowledge_points:
            candidate_ids.update(self._kp_index.get(kp, []))
        candidate_ids.discard(question_id)
        if not candidate_ids:
            return RecommendOutcome(reason="no_same_kp_question")

        # 合适候选：已核验且未做过；过滤后为空则直接返回空结果。
        suitable: list[tuple[Question, list[str]]] = []
        for cid in candidate_ids:
            candidate = self._by_id[cid]
            if cid in done:
                continue
            if not candidate.is_verified():
                continue
            shared = [kp for kp in current.knowledge_points if kp in candidate.knowledge_points]
            suitable.append((candidate, shared))

        if not suitable:
            return RecommendOutcome(reason="no_suitable_candidate")

        # 排序：共享考点数多者优先，同分按 question_id 保证结果稳定。
        suitable.sort(key=lambda pair: (-len(pair[1]), pair[0].question_id))

        outcome = RecommendOutcome(
            reason="ok",
            shared_kp={q.question_id: kps for q, kps in suitable},
        )
        outcome.questions = [q for q, _ in suitable[:top_k]]
        return outcome
