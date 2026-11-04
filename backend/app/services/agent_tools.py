"""Agent 可确定性核验的本地计算工具。

返回结构化状态，区分：
- ok：参数齐全且计算有效；
- insufficient：识别到目标题型，但缺少或存在冲突参数；
- not_applicable：本轮题目不需要当前工具。

Agent 只将 ok 状态的数值写入 ``tool_result``；参数不足时必须明确追问，
不能让模型自行补全条件。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Literal

from app.schemas.question import Question

ToolStatus = Literal["ok", "insufficient", "not_applicable"]

_SIZE_PATTERN = r"(\d+(?:\.\d+)?)\s*(B|KB|MB)"
_CACHE_CAPACITY = re.compile(
    r"(?:Cache\s*)?容量\s*(?:为|是|=|＝)?\s*" + _SIZE_PATTERN,
    flags=re.IGNORECASE,
)
_BLOCK_SIZE = re.compile(
    r"(?:主存)?块大小\s*(?:为|是|=|＝)?\s*" + _SIZE_PATTERN,
    flags=re.IGNORECASE,
)
_ASSOCIATIVITY = re.compile(r"(一|二|两|四|八|\d+)\s*路组相联")
_ADDRESS_BITS = re.compile(
    r"(?:主存)?地址\s*(?:为|是|=|＝)?\s*(\d+)\s*位",
    flags=re.IGNORECASE,
)
_HIT_RATE = re.compile(
    r"(?:命中率|Cache\s*命中率)\s*(?:为|是|=|＝)?\s*(\d+(?:\.\d+)?)\s*%",
    flags=re.IGNORECASE,
)
_CACHE_TIME = re.compile(
    r"Cache\s*访问时间\s*(?:为|是|=|＝)?\s*(\d+(?:\.\d+)?)\s*ns",
    flags=re.IGNORECASE,
)
_MAIN_MEMORY_TIME = re.compile(
    r"(?:主存访问时间|缺失代价|未命中代价)\s*(?:为|是|=|＝)?\s*"
    r"(\d+(?:\.\d+)?)\s*ns",
    flags=re.IGNORECASE,
)

_ASSOCIATIVITY_VALUES = {
    "一": 1,
    "二": 2,
    "两": 2,
    "四": 4,
    "八": 8,
}


@dataclass(frozen=True)
class CalculationOutcome:
    tool_name: str
    status: ToolStatus
    result: str = ""
    reason: str = ""
    missing_conditions: tuple[str, ...] = ()

    @property
    def has_result(self) -> bool:
        return self.status == "ok" and bool(self.result)

    @property
    def prompt_summary(self) -> str:
        if self.status == "ok":
            return f"工具 {self.tool_name} 已核验：{self.result}"
        if self.status == "insufficient":
            missing = "、".join(self.missing_conditions) or "必要参数"
            return f"工具 {self.tool_name} 无法计算：{self.reason}；缺少：{missing}。"
        return "本轮没有适用的确定性计算工具。"


def _not_applicable() -> CalculationOutcome:
    return CalculationOutcome(tool_name="", status="not_applicable")


def _insufficient(
    *,
    tool_name: str,
    reason: str,
    missing: list[str],
    parsed: dict[str, str | int | float],
) -> CalculationOutcome:
    result = (
        "status: insufficient; "
        + "; ".join(f"{key}: {value}" for key, value in parsed.items())
    )
    return CalculationOutcome(
        tool_name=tool_name,
        status="insufficient",
        result="",
        reason=f"{reason}（{result}）",
        missing_conditions=tuple(missing),
    )


def _bytes(value: str, unit: str) -> int | None:
    try:
        number = Decimal(value)
    except InvalidOperation:
        return None
    multiplier = {"B": 1, "KB": 1024, "MB": 1024 * 1024}[unit.upper()]
    size = number * multiplier
    if size <= 0 or size != size.to_integral_value():
        return None
    return int(size)


def _power_of_two_bits(value: int) -> int | None:
    if value <= 0 or value & (value - 1):
        return None
    return value.bit_length() - 1


def _format_number(value: Decimal) -> str:
    normalized = value.normalize()
    if normalized == normalized.to_integral_value():
        return str(int(normalized))
    return format(normalized, "f")


def run_calculation_tool(question: Question | None) -> CalculationOutcome:
    if question is None:
        return _not_applicable()

    searchable = f"{question.stem} {' '.join(question.tags)} {' '.join(question.knowledge_points)}"
    if "Cache" not in searchable and "cache" not in searchable.lower():
        return _not_applicable()

    if any(
        keyword in question.stem
        for keyword in ("命中率", "平均访问时间", "缺失代价", "未命中代价")
    ):
        return _average_access_time(question)

    if "直接映射" in question.stem:
        return _direct_mapping(question)

    if "组相联" in question.stem:
        return _set_associative(question)

    return _not_applicable()


def _average_access_time(question: Question) -> CalculationOutcome:
    hit_match = _HIT_RATE.search(question.stem)
    cache_match = _CACHE_TIME.search(question.stem)
    memory_match = _MAIN_MEMORY_TIME.search(question.stem)
    missing = [
        name
        for name, match in (
            ("命中率", hit_match),
            ("Cache 访问时间", cache_match),
            ("未命中代价或主存访问时间", memory_match),
        )
        if match is None
    ]
    parsed: dict[str, str | int | float] = {}
    if hit_match:
        parsed["hit_rate_percent"] = hit_match.group(1)
    if cache_match:
        parsed["hit_time_ns"] = cache_match.group(1)
    if memory_match:
        parsed["miss_penalty_ns"] = memory_match.group(1)
    if missing:
        return _insufficient(
            tool_name="cache_average_access_time",
            reason="Cache 平均访问时间条件不完整",
            missing=missing,
            parsed=parsed,
        )

    try:
        hit_rate = Decimal(hit_match.group(1)) / 100
        hit_time = Decimal(cache_match.group(1))
        miss_penalty = Decimal(memory_match.group(1))
    except (AttributeError, InvalidOperation):
        return _insufficient(
            tool_name="cache_average_access_time",
            reason="Cache 平均访问时间参数格式无效",
            missing=["可解析的命中率与访问时间"],
            parsed=parsed,
        )
    if not Decimal(0) <= hit_rate <= Decimal(1):
        return _insufficient(
            tool_name="cache_average_access_time",
            reason="命中率必须位于 0% 到 100%",
            missing=["合法命中率"],
            parsed=parsed,
        )

    miss_rate = Decimal(1) - hit_rate
    serial_average = hit_time + miss_rate * miss_penalty
    concurrent_average = hit_rate * hit_time + miss_rate * miss_penalty
    uses_serial_model = any(
        phrase in question.stem
        for phrase in ("调入再访问", "串行访问", "先查 Cache", "先访问 Cache")
    )
    average = serial_average if uses_serial_model else concurrent_average
    model = "serial" if uses_serial_model else "concurrent"
    result = (
        f"average_access_time_ns: {_format_number(average)}; "
        f"hit_rate: {_format_number(hit_rate)}; "
        f"hit_time_ns: {_format_number(hit_time)}; "
        f"miss_rate: {_format_number(miss_rate)}; "
        f"miss_penalty_ns: {_format_number(miss_penalty)}; "
        f"model: {model}"
    )
    return CalculationOutcome(
        tool_name="cache_average_access_time",
        status="ok",
        result=result,
    )


def _direct_mapping(question: Question) -> CalculationOutcome:
    capacity_match = _CACHE_CAPACITY.search(question.stem)
    block_match = _BLOCK_SIZE.search(question.stem)
    address_match = _ADDRESS_BITS.search(question.stem)
    missing = [
        name
        for name, match in (
            ("Cache 容量", capacity_match),
            ("块大小", block_match),
            ("主存地址位数", address_match),
        )
        if match is None
    ]
    parsed: dict[str, str | int | float] = {}
    if capacity_match:
        parsed["cache_capacity"] = " ".join(capacity_match.groups())
    if block_match:
        parsed["block_size"] = " ".join(block_match.groups())
    if address_match:
        parsed["address_bits"] = int(address_match.group(1))
    if missing:
        return _insufficient(
            tool_name="cache_direct_mapping",
            reason="直接映射 Cache 地址划分条件不完整",
            missing=missing,
            parsed=parsed,
        )

    capacity = _bytes(capacity_match.group(1), capacity_match.group(2))
    block_size = _bytes(block_match.group(1), block_match.group(2))
    address_bits = int(address_match.group(1))
    if capacity is None or block_size is None:
        return _insufficient(
            tool_name="cache_direct_mapping",
            reason="Cache 容量或块大小不是有效整数",
            missing=["合法的 Cache 容量与块大小"],
            parsed=parsed,
        )
    if capacity % block_size != 0:
        return _insufficient(
            tool_name="cache_direct_mapping",
            reason="Cache 容量不能被块大小整除",
            missing=["相互一致的 Cache 容量与块大小"],
            parsed=parsed,
        )

    lines = capacity // block_size
    index_bits = _power_of_two_bits(lines)
    offset_bits = _power_of_two_bits(block_size)
    if index_bits is None or offset_bits is None:
        return _insufficient(
            tool_name="cache_direct_mapping",
            reason="行数或块大小不是 2 的幂，无法得到整数位宽",
            missing=["2 的幂形式的行数与块大小"],
            parsed=parsed,
        )
    tag_bits = address_bits - index_bits - offset_bits
    if tag_bits < 0:
        return _insufficient(
            tool_name="cache_direct_mapping",
            reason="地址位宽小于索引位与块内偏移之和",
            missing=["与 Cache 结构一致的地址位宽"],
            parsed=parsed,
        )
    return CalculationOutcome(
        tool_name="cache_direct_mapping",
        status="ok",
        result=(
            f"cache_lines: {lines}; index_bits: {index_bits}; "
            f"block_offset_bits: {offset_bits}; tag_bits: {tag_bits}"
        ),
    )


def _set_associative(question: Question) -> CalculationOutcome:
    capacity_match = _CACHE_CAPACITY.search(question.stem)
    block_match = _BLOCK_SIZE.search(question.stem)
    associativity_match = _ASSOCIATIVITY.search(question.stem)
    address_match = _ADDRESS_BITS.search(question.stem)
    missing = [
        name
        for name, match in (
            ("Cache 容量", capacity_match),
            ("块大小", block_match),
            ("相联路数", associativity_match),
        )
        if match is None
    ]
    parsed: dict[str, str | int | float] = {}
    if capacity_match:
        parsed["cache_capacity"] = " ".join(capacity_match.groups())
    if block_match:
        parsed["block_size"] = " ".join(block_match.groups())
    if associativity_match:
        parsed["associativity"] = associativity_match.group(1)
    if missing:
        return _insufficient(
            tool_name="cache_set_associative",
            reason="组相联 Cache 地址划分条件不完整",
            missing=missing,
            parsed=parsed,
        )

    capacity = _bytes(capacity_match.group(1), capacity_match.group(2))
    block_size = _bytes(block_match.group(1), block_match.group(2))
    associativity_raw = associativity_match.group(1)
    associativity = (
        int(associativity_raw)
        if associativity_raw.isdigit()
        else _ASSOCIATIVITY_VALUES[associativity_raw]
    )
    if capacity is None or block_size is None:
        return _insufficient(
            tool_name="cache_set_associative",
            reason="Cache 容量或块大小不是有效整数",
            missing=["合法的 Cache 容量与块大小"],
            parsed=parsed,
        )
    if capacity % block_size != 0:
        return _insufficient(
            tool_name="cache_set_associative",
            reason="Cache 容量不能被块大小整除",
            missing=["相互一致的 Cache 容量与块大小"],
            parsed=parsed,
        )

    lines = capacity // block_size
    if lines % associativity != 0:
        return _insufficient(
            tool_name="cache_set_associative",
            reason="Cache 行数不能被相联路数整除",
            missing=["与 Cache 行数相匹配的相联路数"],
            parsed=parsed,
        )
    sets = lines // associativity
    group_bits = _power_of_two_bits(sets)
    offset_bits = _power_of_two_bits(block_size)
    if group_bits is None or offset_bits is None:
        return _insufficient(
            tool_name="cache_set_associative",
            reason="组数或块大小不是 2 的幂，无法得到整数位宽",
            missing=["2 的幂形式的组数与块大小"],
            parsed=parsed,
        )

    result_parts = [
        f"cache_lines: {lines}",
        f"sets: {sets}",
        f"group_bits: {group_bits}",
        f"associativity: {associativity}",
        f"block_offset_bits: {offset_bits}",
    ]
    if address_match:
        address_bits = int(address_match.group(1))
        tag_bits = address_bits - group_bits - offset_bits
        if tag_bits < 0:
            return _insufficient(
                tool_name="cache_set_associative",
                reason="地址位宽小于组索引位与块内偏移之和",
                missing=["与 Cache 结构一致的地址位宽"],
                parsed=parsed,
            )
        result_parts.append(f"tag_bits: {tag_bits}")
    return CalculationOutcome(
        tool_name="cache_set_associative",
        status="ok",
        result="; ".join(result_parts),
    )


def cache_association_tool(question: Question | None) -> str:
    """兼容旧调用方，仅返回成功工具结果。"""
    outcome = run_calculation_tool(question)
    return outcome.result if outcome.has_result else ""
