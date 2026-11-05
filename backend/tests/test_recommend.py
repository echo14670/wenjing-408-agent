"""同考点推荐服务单元测试。"""

from __future__ import annotations

from app.services.recommend import RecommendService
from tests.conftest import make_question


def make_bank() -> list:
    """构造推荐场景题库：
    Q001-Q002/Q004 同考点（Cache 组相联映射），Q003 不同考点。
    Q002 未核验，Q004 已核验。Q005 与 Q001 共享两个考点。
    """
    return [
        make_question(
            "Q001", "Cache 四路组相联题干 A",
            knowledge_points=["Cache 组相联映射", "主存地址划分"],
        ),
        make_question(
            "Q002", "Cache 两路组相联题干 B",
            review_state="pending",
            knowledge_points=["Cache 组相联映射"],
        ),
        make_question(
            "Q003", "补码表示范围题干 C",
            knowledge_points=["定点数表示"],
        ),
        make_question(
            "Q004", "Cache 直接映射题干 D",
            knowledge_points=["Cache 组相联映射"],
        ),
        make_question(
            "Q005", "Cache 地址划分综合题干 E",
            knowledge_points=["主存地址划分", "Cache 组相联映射"],
        ),
        make_question(
            "Q006", "无考点题干 F",
            knowledge_points=[],
        ),
    ]


def test_recommend_excludes_current_and_returns_verified_undone():
    svc = RecommendService(make_bank())
    outcome = svc.recommend("Q001", done_question_ids=["Q004"])
    ids = [q.question_id for q in outcome.questions]
    assert "Q001" not in ids, "必须排除当前题"
    assert "Q004" not in ids, "做过的题必须排除"
    assert "Q002" not in ids, "未核验题不应返回"
    assert ids == ["Q005"], "共享考点更多的 Q005 应排第一"


def test_recommend_falls_back_to_chapter_when_kp_exhausted():
    """同考点候选被做/未核验过滤完后，退到同章节，仍不返回未核验题与做过的题。"""
    svc = RecommendService(make_bank())
    outcome = svc.recommend("Q001", done_question_ids=["Q004", "Q005"])
    assert outcome.scope == "chapter"
    ids = [q.question_id for q in outcome.questions]
    assert set(ids) == {"Q003", "Q006"}, "同章节的已核验题应作为兜底"
    assert "Q002" not in ids, "未核验题默认不返回"


def test_recommend_orders_by_shared_kp_count():
    svc = RecommendService(make_bank())
    outcome = svc.recommend("Q005")
    ids = [q.question_id for q in outcome.questions]
    # Q001 与 Q005 共享 2 个考点，应排第一；Q002 未核验被过滤，Q004 共享 1 个考点排其后。
    assert ids == ["Q001", "Q004"]


def test_recommend_unknown_question_returns_empty():
    svc = RecommendService(make_bank())
    outcome = svc.recommend("Q999")
    assert outcome.questions == []
    assert outcome.reason == "question_not_found"


def test_recommend_question_without_kp_falls_back_to_chapter():
    """无考点信息时不能靠考点召回，退到同章节；仍排除自己。"""
    svc = RecommendService(make_bank())
    outcome = svc.recommend("Q006")
    assert outcome.scope == "chapter"
    assert "Q006" not in [q.question_id for q in outcome.questions]
    assert outcome.questions


def test_recommend_without_kp_and_chapter_returns_empty():
    bank = [make_question("Q901", "孤立题干", chapter="", knowledge_points=[])]
    outcome = RecommendService(bank).recommend("Q901")
    assert outcome.questions == []
    assert outcome.reason == "no_knowledge_points"


def test_recommend_include_unverified_as_fallback():
    """显式开启后，同层无已核验题时用未核验题兜底，并标记原因。"""
    svc = RecommendService(make_bank())
    outcome = svc.recommend("Q001", done_question_ids=["Q004", "Q005"], include_unverified=True)
    ids = [q.question_id for q in outcome.questions]
    assert ids == ["Q002"], "已核验题优先，未核验题只在无核验题时兜底"
    assert outcome.reason == "unverified_fallback"


def test_recommend_top_k_respected_and_capped():
    svc = RecommendService(make_bank())
    outcome = svc.recommend("Q005", top_k=1)
    assert len(outcome.questions) == 1
    # 上限 10：传入超大值不应异常。
    outcome = svc.recommend("Q005", top_k=999)
    assert len(outcome.questions) <= 10
