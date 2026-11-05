"""检索阈值校准。

用法（在 backend/ 目录下运行）：

  python tools/calibrate_threshold.py data/questions.json [--report report.md]

做法：
1. 把题库每道题的题干当作查询，跑一遍检索（自己不在候选里时看是否命中原题）；
2. 对每道题记录「自检索得分」（best 分）与「最高干扰分」（除自身外最像的题的分）；
3. 用两组分数分布给出阈值建议：
   - original_threshold 建议 = min(自检索分) 向下留 3% 安全边距；
   - similar_threshold 建议 = max(干扰分中位数, 全库噪声上界) 向上留余量；
4. 输出逐题明细 + 汇总结论，可写入 markdown 作为「阈值校准记录」交付。

另外支持 --probe "查询文本" 的方式手动补充改写查询样本（改写查询的自检索
得分反映模型对同义改写的容忍度，是判断 original 阈值是否会误杀的重要依据）。
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.question_store import QuestionStore  # noqa: E402
from app.services import text_utils  # noqa: E402
from app.services.retrieval import RetrievalService  # noqa: E402


def collect_scores(questions, service: RetrievalService) -> list[dict]:
    rows = []
    for q in questions:
        # 直接查索引拿分数（service.search 在 original 态不回传候选列表）。
        candidates = service.index.search(q.stem, top_k=max(6, service.max_similar + 1))
        mine = next((c for c in candidates if c.question.question_id == q.question_id), None)
        others = [c.score for c in candidates if c.question.question_id != q.question_id]
        # 自检索成功：自身得分达到 original 阈值（题库参数相同的兄弟题也可能排第一，
        # 但同参数同题型的题判 original 同样正确，这里只关心分数是否过线）。
        self_hit = mine is not None and mine.score >= service.original_threshold
        rows.append({
            "question_id": q.question_id,
            "subject": q.subject,
            "match_type": "original" if self_hit else ("similar" if mine else "miss"),
            "self_hit": self_hit,
            "best_score": round(mine.score, 4) if mine else 0.0,
            "distractor_score": round(max(others), 4) if others else 0.0,
        })
    return rows


def summarize(
    rows: list[dict],
    original_threshold: float,
    similar_threshold: float,
    probe_scores: list[float] | None = None,
) -> dict:
    probe_scores = probe_scores or []
    self_scores = [r["best_score"] for r in rows if r["self_hit"]]
    miss_scores = [r["best_score"] for r in rows if not r["self_hit"]]
    distractors = [r["distractor_score"] for r in rows]
    # original 阈值上限约束：改写查询（如学生手动输入的缩写题干）也应判 original，
    # 因此建议值不能高于最弱改写样本的得分，否则会把真人输入误杀成 similar。
    original_cap = min(self_scores) * 0.97 if self_scores else None
    if probe_scores:
        original_cap = min(original_cap, min(probe_scores)) if original_cap else min(probe_scores)
    return {
        "total": len(rows),
        "self_hit": len(self_scores),
        "missed": len(miss_scores),
        "self_score_min": round(min(self_scores), 4) if self_scores else None,
        "self_score_median": round(statistics.median(self_scores), 4) if self_scores else None,
        "miss_score_max": round(max(miss_scores), 4) if miss_scores else None,
        "distractor_max": round(max(distractors), 4) if distractors else None,
        "distractor_median": round(statistics.median(distractors), 4) if distractors else None,
        "probe_min_score": round(min(probe_scores), 4) if probe_scores else None,
        "current_original_threshold": original_threshold,
        "current_similar_threshold": similar_threshold,
        "suggested_original_threshold": round(original_cap, 2) if self_scores else None,
        "suggested_similar_threshold": (
            round(min(max(statistics.median(distractors), 0.30) * 1.25, 0.55), 2)
            if distractors else None
        ),
    }


def render_report(rows: list[dict], summary: dict, probes: list[dict], bank: str) -> str:
    lines = [
        "# 检索阈值校准记录",
        "",
        f"- 题库：`{bank}`，共 {summary['total']} 题",
        f"- 方法：每题以完整题干自检索，记录自检索得分与最高干扰分",
        f"- 当前阈值：original={summary['current_original_threshold']}，"
        f"similar={summary['current_similar_threshold']}",
        "",
        "## 汇总",
        "",
        f"- 自检索命中 {summary['self_hit']}/{summary['total']}"
        f"（命中率 {summary['self_hit'] / summary['total']:.0%}）",
        f"- 自检索得分：最低 {summary['self_score_min']}，中位 {summary['self_score_median']}",
        f"- 未命中题的最高得分：{summary['miss_score_max']}（这些是 original 阈值需要避开的误判源）",
        f"- 干扰分：最大 {summary['distractor_max']}，中位 {summary['distractor_median']}",
        f"- **建议阈值：original={summary['suggested_original_threshold']}，"
        f"similar={summary['suggested_similar_threshold']}**",
        "",
    ]
    if probes:
        lines += ["## 改写查询样本", "", "| 查询 | 判定 | 得分 |", "| --- | --- | --- |"]
        for p in probes:
            lines.append(f"| {p['query'][:40]} | {p['match_type']} | {p['best_score']} |")
        lines.append("")
    lines += [
        "## 逐题明细",
        "",
        "| 题号 | 科目 | 自检索判定 | 自检索分 | 最高干扰分 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        lines.append(
            f"| {r['question_id']} | {r['subject']} | {r['match_type']} "
            f"{'✓' if r['self_hit'] else '✗'} | {r['best_score']} | {r['distractor_score']} |"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("bank", help="题库 JSON 路径")
    parser.add_argument("--report", help="输出 markdown 校准记录路径")
    parser.add_argument("--probe", action="append", default=[],
                        help="补充改写查询（可多次）")
    args = parser.parse_args()

    text_utils.warmup()
    store = QuestionStore(args.bank)
    questions = store.load()
    if not questions:
        raise SystemExit("题库为空，无法校准")

    service = RetrievalService(questions=questions)
    rows = collect_scores(questions, service)

    probes = []
    for query in args.probe:
        candidates = service.index.search(query, top_k=1)
        best = candidates[0] if candidates else None
        probes.append({
            "query": query,
            "match_type": (
                "original" if best and best.score >= service.original_threshold
                else ("similar" if best and best.score >= service.similar_threshold else "miss")
            ),
            "best_score": round(best.score, 4) if best else 0.0,
        })

    summary = summarize(
        rows,
        service.original_threshold,
        service.similar_threshold,
        probe_scores=[p["best_score"] for p in probes],
    )
    report = render_report(rows, summary, probes, args.bank)
    print(report)

    if args.report:
        Path(args.report).write_text(report, encoding="utf-8")
        print(f"校准记录已写入 {args.report}")


if __name__ == "__main__":
    main()
