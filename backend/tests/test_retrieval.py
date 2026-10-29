"""检索与三态判定用例（F01 核心逻辑）。"""

from __future__ import annotations

import pytest

from app.core.config import BACKEND_ROOT
from app.schemas.question import Question
from app.services import text_utils
from app.services.question_store import QuestionStore
from app.services.retrieval import RetrievalService
from tests.conftest import make_question

REAL_BANK_PATH = BACKEND_ROOT / "data" / "questions.json"


# --------------------------------------------------------------------- 三态

def test_original_when_stem_copied_verbatim(cache_service: RetrievalService):
    query = (
        "某计算机按字节编址，Cache 容量为 64KB，主存块大小为 64B，采用四路组相联映射，"
        "主存地址为 32 位。有同学认为“该地址中的组号占 2 位”。请判断该说法是否正确，并说明理由。"
    )
    outcome = cache_service.search(query)
    assert outcome.match_type == "original", outcome.reason
    assert outcome.question is not None
    assert outcome.question.question_id == "Q001"


def test_partial_query_only_returns_reference(cache_service: RetrievalService):
    """缺少容量、块大小的片段不能唯一确认是哪道题。"""
    outcome = cache_service.search("四路组相联，组号占 2 位")
    assert outcome.match_type == "similar", outcome.reason
    assert outcome.question is None
    assert outcome.candidates[0].question.question_id == "Q001"


def test_fullwidth_input_still_retrieves_reference(cache_service: RetrievalService):
    outcome = cache_service.search(
        "某计算机按字节编址，Ｃａｃｈｅ 容量为 ６４ＫＢ，主存块大小为 ６４Ｂ，采用四路组相联映射，"
        "主存地址为 ３２ 位。有同学认为“该地址中的组号占 ２ 位”。请判断该说法是否正确，并说明理由。"
    )
    assert outcome.match_type == "similar", outcome.reason
    assert outcome.question is None
    assert outcome.candidates[0].question.question_id == "Q001"


def test_similar_when_parameters_differ(cache_service: RetrievalService):
    """参数不同的变式题只能判 similar，不能当原题给出核验解析。"""
    outcome = cache_service.search(
        "某计算机 Cache 容量为 16KB，主存块大小为 32B，采用两路组相联映射，求组索引位数。"
    )
    assert outcome.match_type == "similar", outcome.reason
    assert outcome.question is None
    assert outcome.candidates, "相似态必须给出相似题列表"
    assert outcome.reason in {"params_mismatch", "low_score", "identity_not_confirmed"}


def test_miss_for_unrelated_input(cache_service: RetrievalService):
    outcome = cache_service.search("今天中午吃什么比较好")
    assert outcome.match_type == "miss"
    assert outcome.question is None
    assert outcome.candidates == []


def test_miss_when_only_generic_words_match():
    """只靠「计算机」这类通用词凑出来的弱相关必须判 miss，不能硬凑相似题。"""
    store = QuestionStore(REAL_BANK_PATH)
    service = RetrievalService(questions=store.load())
    outcome = service.search("请说明量子计算机的基本原理")
    assert outcome.match_type == "miss", outcome.reason
    assert outcome.match_type == "miss"
    assert outcome.question is None
    assert outcome.candidates == []


def test_miss_for_empty_input(cache_service: RetrievalService):
    assert cache_service.search("").match_type == "miss"
    assert cache_service.search("   ").match_type == "miss"


def test_retrieval_without_jieba_falls_back(monkeypatch, cache_bank: list[Question]):
    """部署环境没装 jieba 时走 bigram 降级，检索仍要可用（不能报错、不能整体失效）。"""
    monkeypatch.setattr(text_utils, "HAS_JIEBA", False)
    assert text_utils.tokenize("四路组相联映射") != []
    service = RetrievalService(questions=cache_bank)
    outcome = service.search(
        "某计算机按字节编址，Cache 容量为 64KB，主存块大小为 64B，采用四路组相联映射，"
        "主存地址为 32 位。有同学认为“该地址中的组号占 2 位”。请判断该说法是否正确，并说明理由。"
    )
    assert outcome.match_type == "original", outcome.reason
    assert outcome.question.question_id == "Q001"


def test_miss_when_bank_is_empty():
    service = RetrievalService(questions=[])
    outcome = service.search("Cache 四路组相联")
    assert outcome.match_type == "miss"
    assert outcome.reason == "empty_bank"


# ------------------------------------------------------------- 防幻觉：核验状态

def test_unverified_question_is_downgraded():
    """未核验题目不得作为 original 返回，降级为 similar（防幻觉红线）。"""
    bank = [
        make_question(
            "Q-P",
            "某系统采用页式存储管理，逻辑地址为 32 位，页面大小为 4KB，每个页表项占 4B，"
            "该进程的页表最多占用多少内存空间？",
            subject="操作系统",
            chapter="内存管理",
            review_state="pending",
        )
    ]
    service = RetrievalService(questions=bank, unverified_policy="downgrade")
    outcome = service.search(
        "某系统采用页式存储管理，逻辑地址为 32 位，页面大小为 4KB，每个页表项占 4B，"
        "该进程的页表最多占用多少内存空间？"
    )
    assert outcome.match_type == "similar"
    assert outcome.reason.startswith("unverified")


def test_disputed_question_is_downgraded():
    bank = [make_question("Q-D", "有争议的题目：最短帧长至少为多少字节？", review_state="disputed")]
    service = RetrievalService(questions=bank, unverified_policy="downgrade")
    assert service.search("有争议的题目：最短帧长至少为多少字节？").match_type == "similar"


def test_allow_policy_keeps_unverified_original():
    """策略放开时（需 TL 确认）未核验题也可判 original。"""
    bank = [make_question("Q-P", "页式存储管理页表大小计算", review_state="pending")]
    service = RetrievalService(questions=bank, unverified_policy="allow")
    assert service.search("页式存储管理页表大小计算").match_type == "original"


def test_chinese_review_state_is_normalized():
    q = make_question("Q-C", "中文核验状态", review_state="已核验")
    assert q.normalized_review_state() == "verified"
    assert q.is_verified()


# ------------------------------------------------------------------ 排序与阈值

def test_candidates_sorted_by_score(cache_service: RetrievalService):
    outcome = cache_service.search("Cache 组相联映射 组索引位数")
    scores = [c.score for c in outcome.candidates]
    assert scores == sorted(scores, reverse=True)


def test_original_threshold_is_configurable(cache_bank: list[Question]):
    strict = RetrievalService(questions=cache_bank, original_threshold=0.99)
    query = "四路组相联，组号占 2 位"
    assert strict.search(query).match_type != "original"


def test_max_similar_limits_candidates(cache_bank: list[Question]):
    service = RetrievalService(questions=cache_bank, max_similar=2)
    outcome = service.search("Cache 组相联映射")
    assert len(outcome.candidates) <= 2


# ------------------------------------------------------------------ 题库加载

def test_store_loads_real_bank():
    store = QuestionStore(REAL_BANK_PATH)
    questions = store.load()
    assert len(questions) >= 10
    assert all(isinstance(q, Question) for q in questions)
    assert not store.stats()["skipped"]


def test_store_tolerates_dirty_records(tmp_path):
    path = tmp_path / "bank.json"
    path.write_text(
        '{"questions":[{"question_id":"Q1","subject":"数据结构","stem":"合法题目"},'
        '{"question_id":"Q2"},{"question_id":"Q3","subject":"操作系统","stem":"另一题"}]}',
        encoding="utf-8",
    )
    store = QuestionStore(path)
    questions = store.load()
    assert [q.question_id for q in questions] == ["Q1", "Q3"]
    assert len(store.stats()["skipped"]) == 1


def test_store_missing_file_degrades_to_empty(tmp_path):
    store = QuestionStore(tmp_path / "not-exist.json")
    assert store.load() == []
    assert store.stats()["exists"] is False


def test_store_rejects_broken_json(tmp_path):
    path = tmp_path / "broken.json"
    path.write_text("{not json", encoding="utf-8")
    from app.services.question_store import QuestionStoreError

    with pytest.raises(QuestionStoreError):
        QuestionStore(path).load()


# --------------------------------------------------- 真实题库上的 Cache 基准用例

def test_cache_baseline_on_real_bank():
    """团队验收红线：Cache 基准案例必须命中原题且答案正确。"""
    store = QuestionStore(REAL_BANK_PATH)
    service = RetrievalService(questions=store.load())
    outcome = service.search(
        "某计算机按字节编址，Cache 容量为 64KB，主存块大小为 64B，采用四路组相联映射，"
        "主存地址为 32 位。有同学认为“该地址中的组号占 2 位”。请判断该说法是否正确，并说明理由。"
    )
    assert outcome.match_type == "original", outcome.reason
    assert outcome.question is not None
    assert outcome.question.question_id == "Q001"
    assert outcome.question.answer == "B"
