"""检索文本预处理：归一化、分词、参数（数字 / 单位）抽取。

设计要点
--------
1. 零强依赖：优先使用 jieba 分词；未安装时自动降级为「英文整词 + 中文 bigram」，
   保证在没有第三方分词库的机器上也能启动服务（降级效果是召回变噪，不会报错）。
2. 408 题干含大量数字与单位（64KB、32 位、4 路）。参数是否一致是判定
   「原题 / 相似题」的关键信号，因此单独提供 extract_numbers() 做参数比对。
3. 归一化统一全角 / 半角、大小写、空白与题号前缀，避免用户复制题干时
   带入的排版差异导致漏召回。
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

try:  # pragma: no cover - 取决于运行环境是否安装 jieba
    import jieba
except Exception:  # noqa: BLE001 - 任何异常都视为不可用，走降级分支
    jieba = None

HAS_JIEBA = jieba is not None

# NFKC 归一化后仍可能残留的排版符号。
_PUNCT_RE = re.compile(r"[^\w\u4e00-\u9fff]+", re.UNICODE)
# 题干前缀题号： "12."、"（3）"、"第 4 题："、"IV." 等。
# 注意：分隔符不能包含空白，否则 "32 位地址" 里的 "32 " 会被误当成题号剥掉。
_LEADING_NO_RE = re.compile(
    r"^\s*[（(\[]?\s*(?:第)?\s*[0-9ivxIVX]{1,3}\s*[.、．:：)）\]】]\s*"
)
_ASCII_TOKEN_RE = re.compile(r"[a-z0-9]+(?:\.[a-z0-9]+)*")
_CJK_RUN_RE = re.compile(r"[\u4e00-\u9fff]+")
# 参数单位：英文缩写（kb / mb / ns / bps）或常见单字中文单位（位 / 路 / 组 / 行 / 年 ...）。
_UNIT_CHARS = "位路组行次个倍年月日时分秒纳毫微千兆字页块%"
_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?(?:[a-z]{1,3}|[" + _UNIT_CHARS + r"])?")

# 仅过滤高频虚词，不过滤单字实词（"组""位""路"在 408 题干里是有义项的参数词）。
_STOPWORDS = frozenset(
    {
        "的", "了", "是", "在", "和", "与", "及", "对", "某", "请", "问",
        "下列", "关于", "以下", "中", "为", "其", "该", "有", "若", "则",
        "并", "或", "这", "那", "上", "下", "之", "把", "被", "给", "从",
        "到", "于", "以", "而", "且", "所", "等", "一个", "什么", "如何",
    }
)


def normalize(text: str | None) -> str:
    """把任意输入压成可比较的检索串：全角转半角、小写、去空白、去标点、去题号前缀。"""
    if not text:
        return ""
    value = unicodedata.normalize("NFKC", str(text)).lower()
    value = value.replace("\u3000", " ")
    value = _LEADING_NO_RE.sub("", value)
    value = re.sub(r"\s+", "", value)
    value = _PUNCT_RE.sub("", value)
    return value


def normalize_identity(text: str | None) -> str:
    """严格比较题目身份；大小写、内部空白、符号和字符宽度均可能影响答案。"""
    if not text:
        return ""
    # 只忽略首尾空白和明确的“第 N 题”标记，其他排版差异留给相似题召回。
    value = re.sub(r"^\s*第\s*\d+\s*题\s*[:：]?\s*", "", str(text))
    return value.strip()


def _cjk_bigrams(segment: str) -> list[str]:
    """中文串切 2-gram；单字成串时保留单字，避免短查询丢词。"""
    tokens: list[str] = []
    for run in _CJK_RUN_RE.findall(segment):
        if len(run) == 1:
            tokens.append(run)
            continue
        tokens.extend(run[i : i + 2] for i in range(len(run) - 1))
    return tokens


def _fallback_tokens(normalized: str) -> list[str]:
    """无 jieba 时的降级分词：英文 / 数字整词 + 中文 bigram。"""
    tokens: list[str] = []
    for segment in _ASCII_TOKEN_RE.split(normalized):
        if segment:
            tokens.extend(_cjk_bigrams(segment))
    tokens.extend(_ASCII_TOKEN_RE.findall(normalized))
    return tokens


def tokenize(text: str | None) -> list[str]:
    """检索用分词。jieba 可用时走 jieba，否则降级。返回去重无关的 token 列表。"""
    normalized = normalize(text)
    if not normalized:
        return []

    if HAS_JIEBA:  # pragma: no cover - 依赖环境
        raw = jieba.lcut(normalized)
        tokens = [t.strip() for t in raw if t.strip()]
    else:
        tokens = _fallback_tokens(normalized)

    return [t for t in tokens if t and t not in _STOPWORDS]


def extract_numbers(text: str | None) -> set[str]:
    """抽取题干中的参数（数字 + 单位），用于判断两道题是否为同一道（参数一致）。"""
    normalized = normalize(text)
    if not normalized:
        return set()
    return {m.group(0) for m in _NUMBER_RE.finditer(normalized)}


def unique(items: Iterable[str]) -> list[str]:
    """保持顺序去重。"""
    seen: set[str] = []
    result: list[str] = []
    for item in items:
        if item not in seen:
            seen.append(item)
            result.append(item)
    return result


def warmup() -> None:
    """预热分词器，避免首个请求承担 jieba 首次加载的开销。"""
    if HAS_JIEBA:  # pragma: no cover - 依赖环境
        jieba.lcut("计算机组成原理 Cache 组相联映射")
