"""契约回归：检索相似度不能替代原题身份确认。"""
import pytest

from app.services.retrieval import RetrievalService
from tests.conftest import make_question


@pytest.mark.parametrize("query", [
    "某计算机按字节编址，Cache 容量为 64KB，主存块大小为 64B，采用四路组相联映射，主存地址为 32 位。求标记位数和块内偏移位数。",
    "某计算机按字节编址，Cache 容量为 64KB，主存块大小为 64B，采用四路组相联映射，主存地址为 32 位。有同学认为“该地址中的组号占 2 位”。请判断该说法是否错误，并说明理由。",
    "四路组相联，组号占 2 位",
])
def test_related_but_different_or_incomplete_question_is_not_original(cache_service, query):
    result = cache_service.search(query)
    assert result.match_type == "similar"
    assert result.question is None
    assert result.candidates

def test_changed_sign_is_not_original():
    service = RetrievalService([make_question("SIGNED", "一个整数的值为 -128，求其补码表示。")])
    result = service.search("一个整数的值为 +128，求其补码表示。")
    assert result.match_type != "original"

def test_reordered_options_are_not_the_same_original():
    question = make_question("CHOICE", "下列哪一种结构遵循先进先出原则？",
                             options=["A. 栈", "B. 队列"])
    service = RetrievalService([question])
    result = service.search("下列哪一种结构遵循先进先出原则？\nA. 队列\nB. 栈")
    assert result.match_type != "original"

def test_ambiguous_stem_does_not_choose_an_option_version_arbitrarily():
    stem = "下列哪一种结构遵循先进先出原则？"
    service = RetrievalService([
        make_question("CHOICE-A", stem, options=["A. 栈", "B. 队列"]),
        make_question("CHOICE-B", stem, options=["A. 队列", "B. 栈"]),
    ])
    result = service.search(stem)
    assert result.match_type == "similar"
    assert result.question is None

@pytest.mark.parametrize("stem,query", [
    ('某字符串的内容为 "a b"，请问该字符串的长度是多少？', '某字符串的内容为 "ab"，请问该字符串的长度是多少？'),
    ('设 C 语言变量 x=1、X=2，表达式 x+1 的值是多少？', '设 C 语言变量 x=1、X=2，表达式 X+1 的值是多少？'),
    ('Cache 容量为 64KB，求其字节数。', 'Cache 容量为 64Kb，求其字节数。'),
    ('字符串 "Ａ" 的 UTF-8 编码是什么？', '字符串 "A" 的 UTF-8 编码是什么？'),
])
def test_text_and_code_content_is_not_lost_in_identity(stem, query, monkeypatch):
    from app.services import text_utils
    monkeypatch.setattr(text_utils, "HAS_JIEBA", False)
    service = RetrievalService([make_question("CONTENT", stem)])
    assert service.search(query).match_type != "original"
