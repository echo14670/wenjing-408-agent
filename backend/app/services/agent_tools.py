"""Agent 可确定性核验的本地计算工具。

当前覆盖验收基准中的四路组相联 Cache 地址划分。返回空字符串表示本轮题目
不需要工具；Agent 不得自行伪造工具结果。
"""

from __future__ import annotations

import math
import re

from app.schemas.question import Question

_SIZE_PATTERN = r"(\d+(?:\.\d+)?)\s*(KB|MB|B)"
_CACHE_CAPACITY = re.compile(r"Cache\s*(?:容量)?\s*(?:为|是|=|＝)?\s*" + _SIZE_PATTERN)
_BLOCK_SIZE = re.compile(
    r"(?:主存)?块大小\s*(?:为|是|=|＝)?\s*" + _SIZE_PATTERN
)
_ASSOCIATIVITY = re.compile(r"(一|二|两|四|八|\d+)\s*路组相联")

_ASSOCIATIVITY_VALUES = {
    "一": 1,
    "二": 2,
    "两": 2,
    "四": 4,
    "八": 8,
}


def _bytes(value: str, unit: str) -> int:
    multiplier = {"B": 1, "KB": 1024, "MB": 1024 * 1024}[unit.upper()]
    return int(float(value) * multiplier)


def cache_association_tool(question: Question | None) -> str:
    if question is None:
        return ""
    text = f"{question.stem} {' '.join(question.tags)}"
    if "Cache" not in text or "组相联" not in text:
        return ""

    capacity_match = _CACHE_CAPACITY.search(question.stem)
    block_match = _BLOCK_SIZE.search(question.stem)
    associativity_match = _ASSOCIATIVITY.search(question.stem)
    if not capacity_match or not block_match or not associativity_match:
        return ""

    capacity = _bytes(capacity_match.group(1), capacity_match.group(2))
    block_size = _bytes(block_match.group(1), block_match.group(2))
    associativity_raw = associativity_match.group(1)
    associativity = int(associativity_raw) if associativity_raw.isdigit() else (
        _ASSOCIATIVITY_VALUES[associativity_raw]
    )
    if block_size <= 0 or associativity <= 0 or capacity % block_size != 0:
        return ""

    lines = capacity // block_size
    if lines % associativity != 0:
        return ""
    sets = lines // associativity
    if sets <= 0 or sets & (sets - 1):
        return ""
    group_bits = int(math.log2(sets))
    return (
        f"cache_lines: {lines}; sets: {sets}; "
        f"group_bits: {group_bits}; associativity: {associativity}"
    )
