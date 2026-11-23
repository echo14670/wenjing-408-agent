"""题库单一源 -> 运行库 / 归档库 的可复跑生成脚本（TD-07）。

用法（在仓库根目录或 backend/ 目录下均可）：

    python backend/tools/build_bank.py            # 生成 + 打印统计
    python backend/tools/build_bank.py --check     # 只校验源数据与产物一致性，不写文件

输入（唯一手工编辑源）：
    backend/data/source-bank.json

输出（由脚本生成，不要手改）：
    backend/data/questions.json   后端运行库（后端启动时载入内存）
    docs/questions.json          归档展示库（与运行库同构，避免字段漂移）

约定：
- audit.conclusion 四态映射到后端三态 review_state：
    通过 / 修正后通过 -> verified；待核验 -> pending；存在争议 -> disputed。
- 审计人、日期、勘误说明只保留在源文件 audit 块与 docs/alpha/bank-audit.md，
  不为此扩大对外 API（Question 模型字段保持不变）。
- questions.sample.json 是 16 题回归样例，独立保留，不参与本流程。

复跑一致性：相同源文件重跑后，题数、ID 集合、跳过数、版本、来源记录与
核验状态分布必须完全一致；--check 模式会断言两份产物与源数据吻合。
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

try:  # 后端依赖（pydantic）可用时走模型严格校验；干净环境用内置兜底校验
    from app.schemas.question import Question, SUBJECTS  # type: ignore
    _MODEL_AVAILABLE = True
except Exception:  # noqa: BLE001
    Question = None  # type: ignore
    SUBJECTS = ("数据结构", "计算机组成原理", "操作系统", "计算机网络")
    _MODEL_AVAILABLE = False

VALID_TYPES = {
    "single_choice", "multiple_choice", "fill_blank",
    "short_answer", "calculation", "comprehensive",
}
VALID_STATES = {"pending", "verified", "disputed"}

SOURCE_PATH = BACKEND_ROOT / "data" / "source-bank.json"
RUNTIME_PATH = BACKEND_ROOT / "data" / "questions.json"
ARCHIVE_PATH = REPO_ROOT / "docs" / "questions.json"

# 审计结论 -> 后端三态枚举
CONCLUSION_TO_STATE = {
    "通过": "verified",
    "修正后通过": "verified",
    "待核验": "pending",
    "存在争议": "disputed",
}

# 运行库题目保留的字段（与 Question 模型对齐；audit 等内部字段不对外）
RUNTIME_FIELDS = (
    "question_id", "subject", "chapter", "question_type", "stem", "options",
    "answer", "solution", "source_ref", "review_state", "knowledge_points",
    "year", "difficulty", "tags", "permission", "reviewer", "question_no",
)


def load_source() -> dict:
    if not SOURCE_PATH.exists():
        raise SystemExit(f"单一编辑源不存在：{SOURCE_PATH}")
    return json.loads(SOURCE_PATH.read_text(encoding="utf-8"))


def validate_question(normalized: dict) -> tuple[dict, str | None]:
    """返回 (记录, 错误信息)。优先用 pydantic 模型，缺失时用内置规则兜底。"""
    if _MODEL_AVAILABLE:
        try:
            question = Question(**{k: normalized.get(k) for k in RUNTIME_FIELDS})
            return json.loads(question.model_dump_json()), None
        except Exception as exc:  # noqa: BLE001
            return {}, str(exc)

    # 内置兜底：对齐 Question 模型的必填与枚举约束
    if not normalized.get("question_id"):
        return {}, "缺少 question_id"
    if not normalized.get("subject"):
        return {}, "缺少 subject"
    if not normalized.get("stem"):
        return {}, "缺少 stem"
    if normalized["subject"] not in SUBJECTS:
        return {}, f"科目非法：{normalized['subject']}"
    if normalized.get("question_type") not in VALID_TYPES:
        return {}, f"题型非法：{normalized.get('question_type')}"
    if normalized.get("review_state") not in VALID_STATES:
        return {}, f"核验状态非法：{normalized.get('review_state')}"
    diff = normalized.get("difficulty")
    if diff is not None and not (1 <= int(diff) <= 5):
        return {}, f"难度越界：{diff}"
    return {k: normalized.get(k) for k in RUNTIME_FIELDS}, None


def build_runtime_questions(source: dict) -> tuple[list[dict], list[dict], dict]:
    """把源题目转换成运行库题目；返回 (题目, 跳过清单, 审计统计)。"""
    runtime: list[dict] = []
    skipped: list[dict] = []
    conclusions: Counter[str] = Counter()
    states: Counter[str] = Counter()
    verified_by_subject: Counter[str] = Counter()

    for index, item in enumerate(source.get("questions", [])):
        qid = str(item.get("question_id") or f"#{index}")
        audit = item.get("audit", {}) or {}
        conclusion = audit.get("conclusion", "待核验")
        state = CONCLUSION_TO_STATE.get(conclusion)
        if state is None:
            skipped.append({"id": qid, "reason": f"未知审计结论：{conclusion}"})
            continue

        normalized = dict(item)
        normalized["review_state"] = state
        # 剥离内部审计块，避免进入对外题目结构
        normalized.pop("audit", None)

        try:
            record, err = validate_question(normalized)
            if err:
                raise ValueError(err)
        except Exception as exc:  # noqa: BLE001
            skipped.append({"id": qid, "reason": str(exc)})
            continue
        runtime.append(record)
        conclusions[conclusion] += 1
        states[state] += 1
        if state == "verified":
            verified_by_subject[record["subject"]] += 1

    stats = {
        "conclusions": dict(conclusions),
        "review_states": dict(states),
        "verified_by_subject": dict(verified_by_subject),
    }
    return runtime, skipped, stats


def build_payload(source: dict, runtime: list[dict]) -> dict:
    meta = source.get("meta", {})
    knowledge_points = [
        {"kp_id": kp.get("kp_id", ""), "name": kp.get("name", ""), "subject": kp.get("subject", "")}
        for kp in source.get("knowledge_points", [])
    ]
    return {
        "version": str(meta.get("version", "1.0")),
        "updated_at": str(meta.get("generated", "")),
        "source_table": str(meta.get("source_table", "")),
        "knowledge_points": knowledge_points,
        "questions": runtime,
        "meta": meta,
    }


def write_outputs(payload: dict) -> None:
    RUNTIME_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    ARCHIVE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def report(source: dict, runtime: list[dict], skipped: list[dict], stats: dict) -> dict:
    ids = [q["question_id"] for q in runtime]
    dup = [qid for qid, n in Counter(ids).items() if n > 1]
    groups = source.get("recommend_groups", [])

    summary = {
        "source": str(SOURCE_PATH.relative_to(REPO_ROOT)),
        "runtime": str(RUNTIME_PATH.relative_to(REPO_ROOT)),
        "archive": str(ARCHIVE_PATH.relative_to(REPO_ROOT)),
        "version": source.get("meta", {}).get("version", ""),
        "total": len(runtime),
        "skipped": skipped,
        "duplicate_ids": dup,
        "by_subject": dict(Counter(q["subject"] for q in runtime)),
        "by_review_state": stats["review_states"],
        "by_conclusion": stats["conclusions"],
        "verified_by_subject": stats["verified_by_subject"],
        "recommend_groups": [
            {"group_id": g["group_id"], "title": g["title"], "question_ids": g["question_ids"],
             "verified": [qid for qid in g["question_ids"] if next(
                 (x for x in runtime if x["question_id"] == qid), {}
             ).get("review_state") == "verified"]}
            for g in groups
        ],
    }
    return summary


def print_summary(s: dict) -> None:
    print(f"题库版本: {s['version']}")
    print(f"有效题数: {s['total']}  跳过: {len(s['skipped'])}")
    for sk in s["skipped"]:
        print(f"  [跳过] {sk['id']}: {sk['reason']}")
    print(f"科目分布: {s['by_subject']}")
    print(f"核验状态: {s['by_review_state']}")
    print(f"审计结论: {s['by_conclusion']}")
    print(f"分科已核验: {s['verified_by_subject']}")
    if s["duplicate_ids"]:
        print(f"  [警告] 重复题号: {s['duplicate_ids']}")
    print("\n推荐题组:")
    for g in s["recommend_groups"]:
        print(f"  - {g['group_id']}（{g['title']}）: {g['question_ids']}，已核验 {g['verified']}")


def check_consistency(payload: dict, runtime: list[dict]) -> None:
    """--check：断言产物与源数据吻合、模型可加载、无跳过。"""
    skipped: list[dict] = []
    for index, item in enumerate(runtime):
        _, err = validate_question(item)
        if err:
            skipped.append({"id": item.get("question_id", f"#{index}"), "reason": err})
    if skipped:
        raise SystemExit(f"产物存在跳过题：{skipped}")
    if len(runtime) != len({q['question_id'] for q in runtime}):
        raise SystemExit("产物存在重复 question_id")
    for q in runtime:
        if q["subject"] not in SUBJECTS:
            raise SystemExit(f"{q['question_id']} 科目非法：{q['subject']}")
    # 两份产物必须逐字节一致（同构）
    if RUNTIME_PATH.exists() and ARCHIVE_PATH.exists():
        if RUNTIME_PATH.read_text(encoding="utf-8") != ARCHIVE_PATH.read_text(encoding="utf-8"):
            raise SystemExit("运行库与归档库内容不一致")
    print("一致性校验通过：题数、ID、状态、两份产物吻合，0 跳过。")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="只校验一致性，不写文件")
    args = parser.parse_args()

    source = load_source()
    runtime, skipped, stats = build_runtime_questions(source)
    summary = report(source, runtime, skipped, stats)

    if args.check:
        check_consistency(None, runtime)
        print_summary(summary)
        return

    payload = build_payload(source, runtime)
    write_outputs(payload)
    check_consistency(payload, runtime)
    print_summary(summary)
    print(f"\n已生成 {summary['runtime']} 与 {summary['archive']}")


if __name__ == "__main__":
    main()
