"""题库检索与三态判定（original / similar / miss）。

检索链路
--------
1. 归一化：统一全角半角、大小写、空白、题号前缀（text_utils.normalize）。
2. 分词：jieba（缺失时降级为英文整词 + 中文 bigram）。
3. 索引：字段加权倒排索引 + BM25。字段权重反映「题干比解析更重要」。
4. 打分：BM25 归一化分 × 覆盖度 × 参数一致性惩罚。
5. 三态判定：
   - original —— 通过分数门槛、完整题目身份唯一确认、参数一致且核验状态过关；
   - similar  —— 综合分 ≥ 相似阈值，但不满足原题条件；
   - miss     —— 其余，含题库为空、输入为空等情形。

三态隔离是验收红线之一：相似题只能参考，不能进入作答与追问流程，
因此宁可判 similar / miss，也不能把参数不同的题误判成 original。
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Optional

from app.schemas.question import Question
from app.services import text_utils

logger = logging.getLogger(__name__)

# 字段权重：题干是判重的主依据，选项与解析只作补充信号。
FIELD_WEIGHTS: dict[str, float] = {
    "stem": 1.0,
    "chapter": 0.5,
    "knowledge_points": 0.6,
    "tags": 0.4,
    "options": 0.35,
    "solution": 0.2,
}

BM25_K1 = 1.5
BM25_B = 0.75
# BM25 原始分归一化用的软化系数：norm = score / (score + SOFTEN)。
BM25_SOFTEN = 6.0

WEIGHT_BM25 = 0.55
WEIGHT_COVERAGE = 0.45

# 参数（数字/单位）完全不一致时的惩罚下限。
PARAM_PENALTY_FLOOR = 0.55
# 题干互为子串时的加成：用户常整段复制题干，这个信号很稳。
SUBSTRING_BONUS = 0.12

# ---- 强命中规则 ----
# BM25 的 idf 依赖题库规模，题库越小绝对分越低。为了让「完整题干复制」这种典型输入
# 在小题库上也能通过候选分数门槛，额外增加一条与题库规模无关的规则：
# 查询词几乎全部命中题干 + 参数完全一致 + 不是一两个词就能触发的短查询。
STRONG_COVERAGE = 0.9
STRONG_MIN_BM25 = 0.2
STRONG_MIN_QUERY_TERMS = 3
# 强命中只是「放宽」，不是「绕过」：仍要求分数不低于阈值的这个比例，
# 保证调高 original_threshold 一定能让判定更保守。
STRONG_RELAX_RATIO = 0.85


@dataclass
class Candidate:
    """一次检索命中的候选项。"""

    question: Question
    score: float
    bm25: float
    coverage: float
    param_ratio: float

    @property
    def params_match(self) -> bool:
        """参数是否完全一致（查询里没有数字时视为一致）。"""
        return self.param_ratio >= 1.0


@dataclass
class SearchOutcome:
    """检索结果：三态 + 数据，直接映射到契约响应。"""

    match_type: str
    question: Optional[Question]
    candidates: list[Candidate]
    reason: str = ""
    query_terms: int = 0


class RetrievalIndex:
    """内存倒排索引 + BM25。题库变更时重建即可。"""

    def __init__(self, questions: list[Question]) -> None:
        self.questions: list[Question] = questions
        self.doc_count: int = len(questions)
        self.doc_terms: list[dict[str, float]] = []
        self.doc_lengths: list[float] = []
        self.doc_numbers: list[set[str]] = []
        self.doc_norm_stem: list[str] = []
        self.inverted: dict[str, dict[int, float]] = {}
        self.avg_doc_length: float = 0.0
        self._build()

    # ------------------------------------------------------------------ 索引

    def _field_text(self, question: Question, field: str) -> str:
        if field == "stem":
            return question.stem
        if field == "chapter":
            return question.chapter
        if field == "knowledge_points":
            return " ".join(question.knowledge_points)
        if field == "tags":
            return " ".join(question.tags)
        if field == "options":
            return " ".join(question.options)
        if field == "solution":
            return question.solution
        return ""

    def _build(self) -> None:
        for question in self.questions:
            weighted_tf: dict[str, float] = {}
            for field, weight in FIELD_WEIGHTS.items():
                text = self._field_text(question, field)
                if not text:
                    continue
                for token in text_utils.tokenize(text):
                    weighted_tf[token] = weighted_tf.get(token, 0.0) + weight
            self.doc_terms.append(weighted_tf)
            self.doc_lengths.append(sum(weighted_tf.values()))
            self.doc_numbers.append(text_utils.extract_numbers(question.stem))
            self.doc_norm_stem.append(text_utils.normalize(question.stem))
            for token, tf in weighted_tf.items():
                self.inverted.setdefault(token, {})[len(self.doc_terms) - 1] = tf

        if self.doc_count:
            self.avg_doc_length = sum(self.doc_lengths) / self.doc_count

    def _idf(self, term: str) -> float:
        df = len(self.inverted.get(term, {}))
        if df == 0:
            return 0.0
        return math.log(1 + (self.doc_count - df + 0.5) / (df + 0.5))

    # ------------------------------------------------------------------ 检索

    def search(self, query: str, top_k: int = 5) -> list[Candidate]:
        """返回按综合分排序的候选项（不做三态判定，判定交给 decide）。"""
        if not self.doc_count:
            return []

        query_terms = text_utils.tokenize(query)
        if not query_terms:
            return []

        query_numbers = text_utils.extract_numbers(query)
        norm_query = text_utils.normalize(query)

        scores: dict[int, float] = {}
        matched: dict[int, int] = {}
        for term in query_terms:
            postings = self.inverted.get(term)
            if not postings:
                continue
            idf = self._idf(term)
            for doc_id, tf in postings.items():
                dl = self.doc_lengths[doc_id] or 1.0
                denom = tf + BM25_K1 * (
                    1 - BM25_B + BM25_B * dl / (self.avg_doc_length or 1.0)
                )
                scores[doc_id] = scores.get(doc_id, 0.0) + idf * (tf * (BM25_K1 + 1)) / denom
                matched[doc_id] = matched.get(doc_id, 0) + 1

        candidates: list[Candidate] = []
        for doc_id, raw_score in scores.items():
            bm25_norm = raw_score / (raw_score + BM25_SOFTEN)
            coverage = matched.get(doc_id, 0) / len(query_terms)
            param_ratio = self._param_ratio(query_numbers, self.doc_numbers[doc_id])
            penalty = PARAM_PENALTY_FLOOR + (1 - PARAM_PENALTY_FLOOR) * param_ratio
            score = (WEIGHT_BM25 * bm25_norm + WEIGHT_COVERAGE * coverage) * penalty

            norm_stem = self.doc_norm_stem[doc_id]
            if norm_query and norm_stem and (norm_query in norm_stem or norm_stem in norm_query):
                score = min(1.0, score + SUBSTRING_BONUS)

            candidates.append(
                Candidate(
                    question=self.questions[doc_id],
                    score=round(score, 4),
                    bm25=round(bm25_norm, 4),
                    coverage=round(coverage, 4),
                    param_ratio=round(param_ratio, 4),
                )
            )

        candidates.sort(key=lambda c: (-c.score, c.question.question_id))
        logger.debug(
            "检索 %r 命中 %d 条，top=%s",
            query[:40],
            len(candidates),
            [(c.question.question_id, c.score) for c in candidates[:top_k]],
        )
        return candidates[:top_k]

    @staticmethod
    def _param_ratio(query_numbers: set[str], doc_numbers: set[str]) -> float:
        """查询参数被题目覆盖的比例。查询无参数时返回 1.0（不构成约束）。"""
        if not query_numbers:
            return 1.0
        if not query_numbers & doc_numbers:
            return 0.0
        return len(query_numbers & doc_numbers) / len(query_numbers)


class RetrievalService:
    """对外检索入口：索引 + 三态判定策略。"""

    def __init__(
        self,
        questions: list[Question],
        original_threshold: float = 0.72,
        similar_threshold: float = 0.45,
        max_similar: int = 5,
        unverified_policy: str = "downgrade",
        similar_item_min_score: float = 0.35,
    ) -> None:
        self.index = RetrievalIndex(questions)
        self.original_threshold = original_threshold
        self.similar_threshold = similar_threshold
        self.max_similar = max_similar
        self.unverified_policy = unverified_policy
        self.similar_item_min_score = similar_item_min_score

    @property
    def size(self) -> int:
        return self.index.doc_count

    def search(self, raw_input: str, top_k: int | None = None) -> SearchOutcome:
        """执行一次检索并给出三态结论。"""
        top_k = top_k or self.max_similar
        if not raw_input or not raw_input.strip():
            return SearchOutcome("miss", None, [], reason="empty_input")

        if not self.index.doc_count:
            return SearchOutcome("miss", None, [], reason="empty_bank")

        query_terms = len(text_utils.tokenize(raw_input))
        candidates = self.index.search(raw_input, top_k=top_k)
        if not candidates:
            return SearchOutcome("miss", None, [], reason="no_candidate")

        return self._decide(candidates, query_terms, raw_input)

    def _is_strong_hit(self, best: Candidate, query_terms: int) -> bool:
        """与题库规模无关的强命中判定。"""
        return (
            query_terms >= STRONG_MIN_QUERY_TERMS
            and best.coverage >= STRONG_COVERAGE
            and best.params_match
            and best.bm25 >= STRONG_MIN_BM25
            and best.score >= self.original_threshold * STRONG_RELAX_RATIO
        )

    def _decide(self, candidates: list[Candidate], query_terms: int, raw_input: str) -> SearchOutcome:
        best = candidates[0]

        if best.score >= self.original_threshold or self._is_strong_hit(best, query_terms):
            if not best.params_match:
                # 参数不一致：Cache 类计算题换了容量 / 块大小就是另一道题，
                # 判 similar 而不是 original，避免把错答案当核验解析给出去。
                return SearchOutcome(
                    "similar",
                    None,
                    self._limit(candidates),
                    reason="params_mismatch",
                    query_terms=query_terms,
                )
            # 高相似度只能召回候选，不能证明题目相同。完整题干（或题干+同序选项）
            # 必须在保留数学符号的排版归一化后唯一匹配，才可进入原题分支。
            identity = text_utils.normalize_identity(raw_input)
            exact = [
                question for question in self.index.questions
                if identity in {
                    text_utils.normalize_identity(question.stem),
                    text_utils.normalize_identity("\n".join([question.stem, *question.options])),
                }
            ]
            if len(exact) != 1 or exact[0].question_id != best.question.question_id:
                return SearchOutcome(
                    "similar", None, self._limit(candidates),
                    reason="identity_not_confirmed", query_terms=query_terms,
                )
            if self.unverified_policy == "downgrade" and not best.question.is_verified():
                return SearchOutcome(
                    "similar",
                    None,
                    self._limit(candidates),
                    reason=f"unverified:{best.question.normalized_review_state()}",
                )
            return SearchOutcome(
                "original", best.question, [], reason="hit", query_terms=query_terms
            )

        if best.score >= self.similar_threshold:
            return SearchOutcome(
                "similar", None, self._limit(candidates), reason="low_score", query_terms=query_terms
            )

        return SearchOutcome(
            "miss", None, [], reason="below_similar_threshold", query_terms=query_terms
        )

    def _limit(self, candidates: list[Candidate]) -> list[Candidate]:
        """相似题列表：只保留达到单条门槛的项，宁可少给也不要硬凑。"""
        kept = [c for c in candidates if c.score >= self.similar_item_min_score]
        return (kept or candidates[:1])[: self.max_similar]


def build_service(
    questions: list[Question],
    original_threshold: float,
    similar_threshold: float,
    max_similar: int,
    unverified_policy: str,
    similar_item_min_score: float = 0.35,
) -> RetrievalService:
    """构造检索服务并预热分词器。"""
    text_utils.warmup()
    return RetrievalService(
        questions=questions,
        original_threshold=original_threshold,
        similar_threshold=similar_threshold,
        max_similar=max_similar,
        unverified_policy=unverified_policy,
        similar_item_min_score=similar_item_min_score,
    )
