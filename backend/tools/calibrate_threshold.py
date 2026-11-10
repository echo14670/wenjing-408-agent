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


def collect_scores(
    questions,
    service: RetrievalService,
    rewrite_ratio: float = 0.0,
) -> tuple[list[dict], list[dict]]:
    """逐题自检索 + （可选）截断改写检索。

    返回 (逐题明细, 改写样本明细)。改写样本模拟「图片 OCR 只识别到一半题干」的真实场景：
    截掉尾部后仍应能命中同一道题，这些样本的得分决定了 original 阈值不能高于多少。
    """
    rows = []
    rewrites = []
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

        if rewrite_ratio > 0 and len(q.stem) >= 20:
            cut = max(12, int(len(q.stem) * rewrite_ratio))
            query = q.stem[:cut]
            cands = service.index.search(query, top_k=3)
            best = cands[0] if cands else None
            rewrites.append({
                "question_id": q.question_id,
                "query": query,
                "best_id": best.question.question_id if best else "-",
                "best_score": round(best.score, 4) if best else 0.0,
                "hit_self": bool(best and best.question.question_id == q.question_id),
            })
    return rows, rewrites


def summarize(
    rows: list[dict],
    original_threshold: float,
    similar_threshold: float,
    probe_scores: list[float] | None = None,
    rewrites: list[dict] | None = None,
    negative_scores: list[float] | None = None,
) -> dict:
    """给出 original 阈值的「安全区间」而不是一个拍脑袋的数值。

    区间下界必须高于「最强干扰分」（否则会把别的题判成原题），
    上界必须低于「最弱自检索分」（否则同一道题都判不中）。
    两者若相交为空，说明题库里存在近乎孪生的题，需要先做数据治理。
    """
    probe_scores = probe_scores or []
    rewrites = rewrites or []
    negative_scores = negative_scores or []

    self_scores = [r["best_score"] for r in rows if r["self_hit"]]
    miss_scores = [r["best_score"] for r in rows if not r["self_hit"]]
    distractors = [r["distractor_score"] for r in rows]
    rewrite_scores = [r["best_score"] for r in rewrites if r["hit_self"]]

    safe_lower = round(max(distractors) + 0.02, 2) if distractors else None
    safe_upper = round(min(self_scores) * 0.97, 2) if self_scores else None
    suggested = (
        round((safe_lower + safe_upper) / 2, 2)
        if safe_lower is not None and safe_upper is not None and safe_lower <= safe_upper
        else None
    )

    def hit_rate(scores: list[float], threshold: float) -> float | None:
        if not scores:
            return None
        return round(sum(1 for s in scores if s >= threshold) / len(scores), 4)

    similar_floor = (
        round(max(statistics.median(distractors) * 1.15, 0.30), 2) if distractors else None
    )
    return {
        "total": len(rows),
        "self_hit": len(self_scores),
        "missed": len(miss_scores),
        "self_score_min": round(min(self_scores), 4) if self_scores else None,
        "self_score_median": round(statistics.median(self_scores), 4) if self_scores else None,
        "miss_score_max": round(max(miss_scores), 4) if miss_scores else None,
        "distractor_max": round(max(distractors), 4) if distractors else None,
        "distractor_median": round(statistics.median(distractors), 4) if distractors else None,
        "distractor_p90": (
            round(statistics.quantiles(distractors, n=10)[-1], 4) if len(distractors) >= 10 else None
        ),
        "rewrite_total": len(rewrites),
        "rewrite_self_hit": len(rewrite_scores),
        "rewrite_min_score": round(min(rewrite_scores), 4) if rewrite_scores else None,
        "rewrite_median_score": (
            round(statistics.median(rewrite_scores), 4) if rewrite_scores else None
        ),
        "probe_min_score": round(min(probe_scores), 4) if probe_scores else None,
        "negative_max_score": round(max(negative_scores), 4) if negative_scores else None,
        "current_original_threshold": original_threshold,
        "current_similar_threshold": similar_threshold,
        "safe_lower": safe_lower,
        "safe_upper": safe_upper,
        "current_in_safe_range": (
            safe_lower is not None
            and safe_upper is not None
            and safe_lower <= original_threshold <= safe_upper
        ),
        "suggested_original_threshold": suggested,
        "suggested_similar_threshold": similar_floor,
        "rewrite_hit_rate_rewrite_at_current": hit_rate(rewrite_scores, original_threshold),
        "rewrite_hit_rate_at_suggested": (
            hit_rate(rewrite_scores, suggested) if suggested is not None else None
        ),
    }


def render_report(
    rows: list[dict], summary: dict, probes: list[dict], bank: str,
    rewrites: list[dict] | None = None,
) -> str:
    rewrites = rewrites or []
    lines = [
        "# 检索阈值校准记录",
        "",
        f"- 题库：`{bank}`，共 {summary['total']} 题",
        f"- 方法：每题以完整题干自检索，记录自检索得分与最高干扰分；"
        f"另用截断改写模拟 OCR 不完整的输入",
        f"- 当前阈值：original={summary['current_original_threshold']}，"
        f"similar={summary['current_similar_threshold']}",
        "",
        "## 汇总",
        "",
        f"- 自检索命中 {summary['self_hit']}/{summary['total']}"
        f"（命中率 {summary['self_hit'] / summary['total']:.0%}）",
        f"- 自检索得分：最低 {summary['self_score_min']}，中位 {summary['self_score_median']}",
        f"- 未命中题的最高得分：{summary['miss_score_max']}（这些是 original 阈值需要避开的误判源）",
        f"- 干扰分（除自身外最高分）：最大 {summary['distractor_max']}，"
        f"中位 {summary['distractor_median']}，P90 {summary['distractor_p90']}",
    ]
    if rewrites:
        lines.append(
            f"- 截断改写（取题干前若干字，模拟 OCR 不完整）：{summary['rewrite_self_hit']}/"
            f"{summary['rewrite_total']} 仍命中自身，得分最低 {summary['rewrite_min_score']}，"
            f"中位 {summary['rewrite_median_score']}"
        )
    if summary.get("negative_max_score") is not None:
        lines.append(f"- 无关查询最高分：{summary['negative_max_score']}（用于确认不会被判成相似题）")
    lines += [
        "",
        "### 阈值安全区间",
        "",
        f"- 下界（必须高于最强干扰分）：**{summary['safe_lower']}**",
        f"- 上界（必须低于最弱自检索分）：**{summary['safe_upper']}**",
        f"- 建议取值（区间中点）：**original={summary['suggested_original_threshold']}**，"
        f"similar 不低于 **{summary['suggested_similar_threshold']}**",
        f"- 当前配置 original={summary['current_original_threshold']} "
        f"{'✓ 落在安全区间内' if summary['current_in_safe_range'] else '✗ 不在安全区间内'}",
    ]
    if summary.get("rewrite_hit_rate_rewrite_at_current") is not None:
        lines.append(
            f"- 截断改写在该阈值下的命中率：{summary['rewrite_hit_rate_rewrite_at_current']:.0%}"
            f"（建议值下 {summary['rewrite_hit_rate_at_suggested']:.0%}）"
        )
    lines += [
        "",
        "> 判读方式：阈值低于下界 → 把别的题当成原题（错答案当核验解析，踩防幻觉红线）；"
        "高于上界 → 同一道题都判不中。截断改写命中率是「体验指标」，不作为阈值下压的依据。",
        "",
    ]
    if probes:
        lines += ["## 改写查询样本", "", "| 查询 | 判定 | 得分 |", "| --- | --- | --- |"]
        for p in probes:
            lines.append(f"| {p['query'][:40]} | {p['match_type']} | {p['best_score']} |")
        lines.append("")
    if rewrites:
        missed = [r for r in rewrites if not r["hit_self"]]
        lines += [
            "## 截断改写明细（每题取前若干字）",
            "",
            f"未命中自身 {len(missed)} 条"
            + (f"：{', '.join(r['question_id'] for r in missed[:10])}" if missed else ""),
            "",
            "| 题号 | 命中题 | 得分 | 命中自身 |",
            "| --- | --- | --- | --- |",
        ]
        for r in rewrites:
            lines.append(
                f"| {r['question_id']} | {r['best_id']} | {r['best_score']} | "
                f"{'✓' if r['hit_self'] else '✗'} |"
            )
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
    parser.add_argument("--rewrite-ratio", type=float, default=0.6,
                        help="截断改写比例，0 表示不跑截断样本（默认 0.6）")
    parser.add_argument("--negative", action="append", default=[],
                        help="无关查询样本（可多次），用于确认噪声不会被判成相似题")
    args = parser.parse_args()

    text_utils.warmup()
    store = QuestionStore(args.bank)
    questions = store.load()
    if not questions:
        raise SystemExit("题库为空，无法校准")

    service = RetrievalService(questions=questions)
    rows, rewrites = collect_scores(questions, service, rewrite_ratio=args.rewrite_ratio)

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

    negatives = []
    for query in args.negative:
        candidates = service.index.search(query, top_k=1)
        best = candidates[0] if candidates else None
        negatives.append({
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
        rewrites=rewrites,
        negative_scores=[n["best_score"] for n in negatives],
    )
    report = render_report(rows, summary, probes, args.bank, rewrites)

    if negatives:
        report += "\n## 无关查询样本\n\n| 查询 | 判定 | 得分 |\n| --- | --- | --- |\n"
        for n in negatives:
            report += f"| {n['query'][:40]} | {n['match_type']} | {n['best_score']} |\n"
    print(report)

    if args.report:
        Path(args.report).write_text(report, encoding="utf-8")
        print(f"校准记录已写入 {args.report}")


if __name__ == "__main__":
    main()
