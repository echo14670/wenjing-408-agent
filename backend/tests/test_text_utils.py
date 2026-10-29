"""文本预处理用例：归一化、分词降级、参数抽取。"""

from __future__ import annotations

import pytest

from app.services import text_utils


def test_normalize_fullwidth_and_case():
    assert text_utils.normalize("Ｃａｃｈｅ　６４ＫＢ") == "cache64kb"


def test_normalize_strips_question_number():
    assert text_utils.normalize("12. Cache 容量 64KB").startswith("cache")
    assert text_utils.normalize("（3）组相联映射").startswith("组相联")


def test_normalize_removes_spaces_and_punctuation():
    assert text_utils.normalize("四路 组相联，组号 占 2 位！") == "四路组相联组号占2位"


def test_tokenize_never_empty_for_cjk():
    tokens = text_utils.tokenize("四路组相联映射")
    assert tokens, "任意中文输入都应产出 token"


def test_tokenize_handles_ascii_terms():
    tokens = text_utils.tokenize("Cache 容量 64KB")
    assert any("cache" in t for t in tokens)
    assert any("64" in t for t in tokens)


def test_extract_numbers_includes_unit():
    numbers = text_utils.extract_numbers("Cache 容量 64KB，块大小 64B，32 位地址")
    assert "64kb" in numbers
    assert "64b" in numbers
    assert any(n.startswith("32") for n in numbers)


def test_extract_numbers_fullwidth_equals_halfwidth():
    assert text_utils.extract_numbers("６４ＫＢ") == text_utils.extract_numbers("64KB")


def test_empty_input_is_safe():
    assert text_utils.normalize(None) == ""
    assert text_utils.tokenize("") == []
    assert text_utils.extract_numbers("") == set()

@pytest.mark.parametrize("left,right", [
    ("整数 -128", "整数 +128"),
    ("容量为 2² 字节", "容量为 22 字节"),
    ("命中率 0.95", "命中率 095"),
    ("选出正确的说法", "选出不正确的说法"),
])
def test_identity_preserves_meaningful_differences(left, right):
    assert text_utils.normalize_identity(left) != text_utils.normalize_identity(right)
