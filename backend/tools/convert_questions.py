"""题库字段转换与载入统计。

用法（在 backend/ 目录下运行）：

  # 1) 载入统计：核对题数与字段完整性（阶段任务卡要求核对 80 题）
  python tools/convert_questions.py stats data/questions.json

  # 2) 字段转换：把数据同学交付的原始文件转成标准 questions.json
  python tools/convert_questions.py convert 源文件.csv data/questions.json

支持源格式：JSON（数组或 {questions:[...]}）、CSV（表头自动映射）。

CSV 列名映射（大小写、中英文均可，缺的列留空）：
  question_id / 题号 / 编号      -> question_id
  subject / 科目                 -> subject
  chapter / 章节                 -> chapter
  question_type / 题型           -> question_type（中文题型自动转枚举）
  stem / 题干 / 题目             -> stem
  options / 选项                 -> options（JSON 数组或 A.xx;B.xx 形式）
  answer / 答案                  -> answer
  solution / 解析 / 解答         -> solution
  source_ref / 来源              -> source_ref
  review_state / 核验状态 / 状态 -> review_state（中文自动转枚举）
  knowledge_points / 考点        -> knowledge_points（顿号/分号/逗号分隔）
  year / 年份                    -> year
  difficulty / 难度              -> difficulty
  tags / 标签                    -> tags

统计输出（stdout，可直接粘贴进交付文档）：
  - 总题数 / 有效题数 / 跳过数（附原因）
  - 每个字段的非空率（字段完整性）
  - 科目分布、核验状态分布、考点覆盖
  - question_id 重复 / subject 非法 等健康问题清单
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

# 保证可从 backend/ 下直接运行：python tools/convert_questions.py ...
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.schemas.question import SUBJECTS, Question  # noqa: E402

# CSV 列名 -> 标准字段 的别名表。
COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "question_id": ("question_id", "题号", "编号", "id"),
    "subject": ("subject", "科目"),
    "chapter": ("chapter", "章节"),
    "question_type": ("question_type", "题型"),
    "stem": ("stem", "题干", "题目", "题目内容"),
    "options": ("options", "选项"),
    "answer": ("answer", "答案"),
    "solution": ("solution", "解析", "解答", "答案解析"),
    "source_ref": ("source_ref", "来源", "出处"),
    "review_state": ("review_state", "核验状态", "状态"),
    "knowledge_points": ("knowledge_points", "考点", "知识点"),
    "year": ("year", "年份"),
    "difficulty": ("difficulty", "难度"),
    "tags": ("tags", "标签"),
}

# 中文题型 -> 枚举。
TYPE_MAP = {
    "单选": "single_choice", "单选题": "single_choice", "单项选择": "single_choice",
    "多选": "multiple_choice", "多选题": "multiple_choice", "多项选择": "multiple_choice",
    "填空": "fill_blank", "填空题": "fill_blank",
    "简答": "short_answer", "简答题": "short_answer", "问答": "short_answer", "问答题": "short_answer",
    "计算": "calculation", "计算题": "calculation",
    "综合": "comprehensive", "综合题": "comprehensive", "应用": "comprehensive", "应用题": "comprehensive",
}

STATE_MAP = {
    "已核验": "verified", "已审核": "verified", "verified": "verified",
    "待核验": "pending", "未核验": "pending", "待审核": "pending", "pending": "pending",
    "有争议": "disputed", "争议": "disputed", "disputed": "disputed",
}


def _split_list(raw: str) -> list[str]:
    """选项 / 考点 / 标签：兼容 JSON 数组与顿号、分号、逗号分隔。"""
    raw = (raw or "").strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
            return [str(x).strip() for x in parsed if str(x).strip()]
        except json.JSONDecodeError:
            pass
    parts = re.split(r"[、;；,，|\n]", raw)
    return [p.strip() for p in parts if p.strip()]


def _normalize_item(item: dict) -> dict:
    """把一条原始记录整理成标准字段结构（不做强校验，校验交给载入统计）。"""
    out: dict = {}
    for field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in item and str(item[alias]).strip() != "":
                value = item[alias]
                if field in ("options", "knowledge_points", "tags"):
                    out[field] = _split_list(str(value))
                elif field == "question_type":
                    out[field] = TYPE_MAP.get(str(value).strip(), str(value).strip())
                elif field == "review_state":
                    out[field] = STATE_MAP.get(str(value).strip(), "pending")
                elif field in ("year", "difficulty"):
                    try:
                        out[field] = int(float(str(value)))
                    except ValueError:
                        pass
                else:
                    out[field] = str(value).strip()
                break
    return out


def read_source(path: Path) -> list[dict]:
    """读取源文件，统一成 dict 列表。"""
    suffix = path.suffix.lower()
    if suffix == ".json":
        raw = json.loads(path.read_text(encoding="utf-8"))
        items = raw.get("questions", []) if isinstance(raw, dict) else raw
        return [x for x in items if isinstance(x, dict)]
    if suffix == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as fh:
            sample = fh.read(4096)
            fh.seek(0)
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t") if sample else csv.excel
            return list(csv.DictReader(fh, dialect=dialect))
    raise SystemExit(f"不支持的源文件格式：{path}（支持 .json / .csv）")


def build_stats(questions: list[Question], skipped: list[dict]) -> dict:
    """字段完整性等载入统计，供交付文档与 /api/health 排查用。"""
    field_report: dict[str, dict] = {}
    for name, _alias in COLUMN_ALIASES.items():
        filled = sum(
            1 for q in questions
            if getattr(q, name) not in (None, "", []) and getattr(q, name) is not None
        )
        field_report[name] = {
            "filled": filled,
            "ratio": round(filled / len(questions), 4) if questions else 0.0,
            "required": name in ("question_id", "subject", "stem"),
        }

    problems: list[str] = []
    ids = [q.question_id for q in questions]
    for qid, count in Counter(ids).items():
        if count > 1:
            problems.append(f"question_id 重复：{qid}（{count} 次）")
    for q in questions:
        if q.subject not in SUBJECTS:
            problems.append(f"{q.question_id}: 科目不在 408 四门之内：{q.subject}")
        if q.question_type not in (
            "single_choice", "multiple_choice", "fill_blank",
            "short_answer", "calculation", "comprehensive",
        ):
            problems.append(f"{q.question_id}: 题型非法：{q.question_type}")

    kp_counter = Counter(kp for q in questions for kp in q.knowledge_points)
    return {
        "total": len(questions),
        "skipped": skipped,
        "fields": field_report,
        "problems": problems,
        "by_subject": dict(Counter(q.subject for q in questions)),
        "by_review_state": dict(Counter(q.normalized_review_state() for q in questions)),
        "knowledge_point_coverage": {
            "distinct_kp": len(kp_counter),
            "questions_without_kp": sum(1 for q in questions if not q.knowledge_points),
            "top_kp": kp_counter.most_common(10),
        },
    }


def print_stats(stats: dict) -> None:
    print(f"有效题数: {stats['total']}")
    for s in stats["skipped"]:
        print(f"  [跳过] {s['id']}: {s['reason']}")
    print("\n字段完整性（非空率）:")
    for name, info in stats["fields"].items():
        mark = "✓" if info["ratio"] >= 0.95 else ("△" if info["ratio"] > 0 else "✗")
        req = "（必填）" if info["required"] else ""
        print(f"  {mark} {name:<18} {info['filled']}/{stats['total']} ({info['ratio']:.0%}) {req}")
    print("\n科目分布:", stats["by_subject"])
    print("核验状态分布:", stats["by_review_state"])
    kpc = stats["knowledge_point_coverage"]
    print(f"考点覆盖: {kpc['distinct_kp']} 个考点，{kpc['questions_without_kp']} 题无考点（无法参与推荐）")
    if stats["problems"]:
        print(f"\n健康问题 {len(stats['problems'])} 项:")
        for p in stats["problems"][:20]:
            print(f"  - {p}")
    else:
        print("\n健康问题: 无")


def main() -> None:
    if len(sys.argv) < 3 or sys.argv[1] not in ("stats", "convert"):
        print(__doc__)
        raise SystemExit(2)

    mode, source = sys.argv[1], Path(sys.argv[2])
    if not source.exists():
        raise SystemExit(f"文件不存在：{source}")

    items = read_source(source)
    questions: list[Question] = []
    skipped: list[dict] = []
    for index, item in enumerate(items):
        normalized = _normalize_item(item)
        try:
            questions.append(Question(**normalized))
        except Exception as exc:  # noqa: BLE001
            qid = str(normalized.get("question_id") or f"#{index}")
            skipped.append({"id": qid, "reason": str(exc)})

    stats = build_stats(questions, skipped)
    print_stats(stats)

    if mode == "convert":
        if len(sys.argv) < 4:
            raise SystemExit("convert 模式需要输出路径：convert 源文件 输出.json")
        out_path = Path(sys.argv[3])
        payload = {
            "version": "1.0",
            "updated_at": "",
            "source_table": "",
            "questions": [json.loads(q.model_dump_json()) for q in questions],
        }
        out_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\n已写入 {out_path}（{len(questions)} 题，跳过 {len(skipped)} 条）")


if __name__ == "__main__":
    main()
