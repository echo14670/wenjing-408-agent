#!/usr/bin/env python3
"""发布后自检脚本（β-09 / 林子涵）。

对一条候选提交绑定检查公开站的关键行为，输出可直接贴进发布台账的表格。
只用标准库，服务器与本机都能跑。

检查档位（--profile）：
    baseline  基线自检：小测接口 404 记为「跳过」（β 尚未实现，不算通过也不算失败）
    release   发包自检：小测接口 404 记为「失败」，避免把小测未上线写成自检通过

用法：
    python3 scripts/release_check.py --expect-commit 9e9793a \
        --expect-model Qwen/Qwen2.5-7B-Instruct --expect-questions 81

    # 发包前自检（小测 404 判失败）
    python3 scripts/release_check.py --profile release --expect-commit <sha>

    # 指定站点
    python3 scripts/release_check.py --base http://123.60.34.87

    # 额外核对服务器静态目录（只能在服务器上跑）
    python3 scripts/release_check.py --webroot /var/www/wenjing

    # 需要 Windows 包时校验 SHA-256 与必需文件
    python3 scripts/release_check.py --package ~/Downloads/wenjing-408-windows.zip

部署提交号核对（--expect-commit）优先读部署目录的 git HEAD（--deploy-dir，默认 /opt/wenjing/app2），
其次读最近一条发布记录（--release-dir，默认 /opt/wenjing/releases 的 release-*.txt 里的 commit=）；
两者都拿不到时判失败——"无法证明实际部署的提交"不等于通过。

退出码：0 = 无失败项（跳过项不算失败）；1 = 有失败项。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

STREAM_ACCEPT = "application/x-ndjson"
REQUIRED_PACKAGE_ENTRIES = ("start-wenjing.cmd",)
PROGRESSIVE_GAP_SECONDS = 0.2

PASS, FAIL, SKIP = "✅", "❌", "⏭"


class Checker:
    def __init__(self, base: str, timeout: float, profile: str) -> None:
        self.base = base.rstrip("/")
        self.timeout = timeout
        self.profile = profile
        self.rows: list[tuple[str, str, str]] = []

    def record(self, name: str, result: str, detail: str) -> None:
        self.rows.append((name, result, detail))
        print(f"{result} {name}: {detail}")

    def get_json(self, path: str) -> dict:
        resp = urllib.request.urlopen(f"{self.base}{path}", timeout=self.timeout)
        return json.loads(resp.read().decode("utf-8"))

    def post_json(self, path: str, payload: dict, timeout: float | None = None) -> tuple[int, dict]:
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=timeout or self.timeout)
            return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, {}

    # ---------- 部署提交号核对 ----------

    @staticmethod
    def _read_deploy_dir_commit(deploy_dir: str) -> tuple[str, str]:
        path = Path(deploy_dir)
        if not path.exists():
            return "", f"{deploy_dir} 不存在"
        try:
            out = subprocess.run(
                ["git", "-C", str(path), "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, timeout=10, check=True,
            )
            return out.stdout.strip(), f"git HEAD @ {deploy_dir}"
        except Exception as error:  # noqa: BLE001
            return "", f"读取 {deploy_dir} 的 git HEAD 失败：{error}"

    @staticmethod
    def _read_latest_release_commit(release_dir: str) -> tuple[str, str]:
        path = Path(release_dir)
        if not path.is_dir():
            return "", f"{release_dir} 不存在"
        records = sorted(path.glob("release-*.txt"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not records:
            return "", f"{release_dir} 下没有发布记录"
        for line in records[0].read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("commit="):
                return line.split("=", 1)[1].strip(), f"发布记录 {records[0].name}"
        return "", f"{records[0].name} 中无 commit 字段"

    def check_deploy_commit(self, expect_commit: str, deploy_dir: str, release_dir: str) -> None:
        if not expect_commit:
            self.record("部署提交号", SKIP, "未指定 --expect-commit")
            return
        actual, source = self._read_deploy_dir_commit(deploy_dir)
        if not actual:
            actual, alt_source = self._read_latest_release_commit(release_dir)
            source = alt_source if actual else f"{source}；{alt_source}"
        if not actual:
            self.record("部署提交号", FAIL, f"无法确认实际部署提交（{source}）")
            return
        expected = expect_commit.strip().lower()
        got = actual.lower()
        ok = expected.startswith(got) or got.startswith(expected)
        detail = f"线上实际 {actual}（{source}）｜期望 {expect_commit}"
        self.record("部署提交号", PASS if ok else FAIL, detail)

    # ---------- 站点检查 ----------

    def check_health(self, expect_model: str, expect_questions: int) -> None:
        try:
            health = self.get_json("/api/health")
        except Exception as error:  # noqa: BLE001
            self.record("health", FAIL, f"请求失败：{error}")
            return
        ok = (
            health.get("status") == "ok"
            and health.get("questions") == expect_questions
            and health.get("skipped") == []
            and health.get("llm_configured") is True
            and health.get("llm_model") == expect_model
        )
        detail = (
            f"questions={health.get('questions')} skipped={health.get('skipped')} "
            f"llm_configured={health.get('llm_configured')} llm_model={health.get('llm_model')}"
        )
        self.record("health", PASS if ok else FAIL, detail)

    def check_routes(self) -> None:
        for path in ("/", "/workbench", "/practice", "/materials"):
            try:
                resp = urllib.request.urlopen(f"{self.base}{path}", timeout=self.timeout)
                self.record(f"页面 {path}", PASS if resp.status == 200 else FAIL, f"HTTP {resp.status}")
            except urllib.error.HTTPError as error:
                self.record(f"页面 {path}", FAIL, f"HTTP {error.code}")
            except Exception as error:  # noqa: BLE001
                self.record(f"页面 {path}", FAIL, f"请求失败：{error}")

    def check_question(self, question_id: str = "COP006") -> None:
        try:
            data = self.get_json(f"/api/question/{question_id}")
        except urllib.error.HTTPError as error:
            self.record("题目详情", FAIL, f"HTTP {error.code}")
            return
        except Exception as error:  # noqa: BLE001
            self.record("题目详情", FAIL, f"请求失败：{error}")
            return
        ok = data.get("question_id") == question_id and bool(data.get("stem")) and bool(data.get("options"))
        self.record("题目详情", PASS if ok else FAIL, f"question_id={data.get('question_id')} 选项数={len(data.get('options') or [])}")

    def check_recommend(self, question_id: str = "COP006") -> None:
        status, data = self.post_json(
            "/api/recommend",
            {"question_id": question_id, "done_question_ids": [], "top_k": 3},
        )
        candidates = data.get("questions") or []
        ok = status == 200 and bool(candidates)
        self.record("同考点推荐", PASS if ok else FAIL, f"HTTP {status} 候选={len(candidates)}")

    def check_search_variants(self, question_id: str = "COP006") -> None:
        try:
            question = self.get_json(f"/api/question/{question_id}")
        except Exception as error:  # noqa: BLE001
            self.record("题号变体", FAIL, f"取题干失败：{error}")
            return
        stem = question.get("stem") or ""
        cases = [
            ("原始题干", stem, "original"),
            ("第N题前缀", f"第12题：{stem}", "original"),
            ("前置空行", f"\n\n{stem}", "original"),
        ]
        for name, text, expect in cases:
            status, data = self.post_json("/api/search", {"raw_input": text, "input_type": "text"}, timeout=60)
            actual = data.get("match_type")
            ok = status == 200 and actual == expect
            self.record(f"题号变体·{name}", PASS if ok else FAIL, f"预期 {expect} 实际 {actual}")

    def check_stream_protocol(self) -> None:
        """检查 NDJSON 流式协议是否完整；同时记录事件到达的时间差。

        说明：本项只能证明「协议完整、事件齐全」。若首事件与末事件时间差过小，
        说明可能是一次性下发，不能据此宣称「逐段到达」。
        """
        payload = {
            "session_messages": [{"role": "user", "content": "一句话说明 Cache 命中率怎么算"}],
            "question_id": None,
            "user_answer": "",
            "mode": "direct",
            "context_chunks": [],
        }
        req = urllib.request.Request(
            f"{self.base}/api/chat",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": STREAM_ACCEPT},
            method="POST",
        )
        started = time.time()
        first_event = last_event = None
        deltas = 0
        done = False
        try:
            resp = urllib.request.urlopen(req, timeout=180)
            for raw in resp:
                line = raw.decode("utf-8").strip()
                if not line:
                    continue
                now = time.time()
                if first_event is None:
                    first_event = now
                last_event = now
                event = json.loads(line)
                if event.get("type") == "delta":
                    deltas += 1
                elif event.get("type") == "done":
                    done = True
                    break
        except Exception as error:  # noqa: BLE001
            self.record("流式协议", FAIL, f"请求失败：{error}")
            return
        total = time.time() - started
        gap = (last_event - first_event) if (first_event and last_event) else 0.0
        ok = done and deltas > 0
        if ok and gap >= PROGRESSIVE_GAP_SECONDS:
            arrival = f"首末事件间隔 {gap:.2f}s，具备逐段到达迹象"
        elif ok:
            arrival = f"首末事件间隔 {gap:.2f}s，仅证明协议完整（可能整体缓冲，不能当作逐段到达证据）"
        else:
            arrival = f"首末事件间隔 {gap:.2f}s"
        self.record("流式协议", PASS if ok else FAIL, f"delta={deltas} done={done} 总={total:.2f}s｜{arrival}")

    def check_quiz(self, quiz_id: str = "co-memory-01") -> None:
        try:
            resp = urllib.request.urlopen(f"{self.base}/api/quiz/{quiz_id}", timeout=self.timeout)
            self.record("小测接口", PASS, f"HTTP {resp.status}（已实现）")
        except urllib.error.HTTPError as error:
            if error.code != 404:
                self.record("小测接口", FAIL, f"HTTP {error.code}")
            elif self.profile == "release":
                self.record("小测接口", FAIL, "HTTP 404：发包自检不允许小测缺失")
            else:
                self.record("小测接口", SKIP, "HTTP 404：β 尚未实现（基线跳过，发包档会判失败）")
        except Exception as error:  # noqa: BLE001
            self.record("小测接口", FAIL, f"请求失败：{error}")

    def check_webroot(self, webroot: str) -> None:
        index = Path(webroot) / "index.html"
        if not index.exists():
            self.record("静态目录", FAIL, f"{index} 不存在")
            return
        digest = hashlib.sha256(index.read_bytes()).hexdigest()
        assets_dir = Path(webroot) / "assets"
        assets = sorted(p.name for p in assets_dir.glob("*")) if assets_dir.is_dir() else []
        self.record("静态目录", PASS, f"index.html sha256={digest[:16]}… assets={len(assets)} 个")

    def check_package(self, package: str, expect_sha256: str | None) -> None:
        path = Path(package).expanduser()
        if not path.exists():
            self.record("发布包", FAIL, f"文件不存在：{path}")
            return
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        ok_sha = True if not expect_sha256 else digest == expect_sha256.lower()
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
        missing = [entry for entry in REQUIRED_PACKAGE_ENTRIES if not any(n.endswith(entry) for n in names)]
        ok = ok_sha and not missing
        self.record(
            "发布包", PASS if ok else FAIL,
            f"sha256={digest[:16]}… 校验={'通过' if ok_sha else '不匹配'} 文件数={len(names)} 缺失={missing or '无'}",
        )

    def summary(self) -> int:
        failures = [row for row in self.rows if row[1] == FAIL]
        skips = [row for row in self.rows if row[1] == SKIP]
        print("\n| 检查项 | 结果 | 证据 |")
        print("| --- | --- | --- |")
        for name, result, detail in self.rows:
            safe = detail.replace("|", "\\|")
            print(f"| {name} | {result} | {safe} |")
        print(f"\n合计 {len(self.rows)} 项：通过 {len(self.rows) - len(failures) - len(skips)}、"
              f"跳过 {len(skips)}、失败 {len(failures)}")
        return 0 if not failures else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="发布后自检（公开站 + 可选包校验）")
    parser.add_argument("--base", default="http://127.0.0.1", help="站点基地址，默认 http://127.0.0.1")
    parser.add_argument("--profile", choices=("baseline", "release"), default="baseline",
                        help="baseline=基线自检（小测 404 跳过）；release=发包自检（小测 404 判失败）")
    parser.add_argument("--expect-commit", default="", help="候选提交号；与线上实际部署比对，不一致判失败")
    parser.add_argument("--deploy-dir", default="/opt/wenjing/app2", help="部署目录（读 git HEAD 核对提交号）")
    parser.add_argument("--release-dir", default="/opt/wenjing/releases", help="发布记录目录（git 不可用时的回退来源）")
    parser.add_argument("--expect-model", default="Qwen/Qwen2.5-7B-Instruct", help="期望的 llm_model")
    parser.add_argument("--expect-questions", type=int, default=81, help="期望题数")
    parser.add_argument("--webroot", default="", help="服务器静态目录（可选，仅服务器可跑）")
    parser.add_argument("--package", default="", help="Windows ZIP 路径（可选）")
    parser.add_argument("--expect-sha256", default="", help="发布包期望 SHA-256（可选）")
    parser.add_argument("--timeout", type=float, default=15.0, help="单请求超时秒数")
    args = parser.parse_args()

    print(f"站点：{args.base}｜档位：{args.profile}｜期望提交：{args.expect_commit or '未指定'}")
    checker = Checker(args.base, args.timeout, args.profile)
    checker.check_deploy_commit(args.expect_commit, args.deploy_dir, args.release_dir)
    checker.check_health(args.expect_model, args.expect_questions)
    checker.check_routes()
    checker.check_question()
    checker.check_recommend()
    checker.check_search_variants()
    checker.check_stream_protocol()
    checker.check_quiz()
    if args.webroot:
        checker.check_webroot(args.webroot)
    if args.package:
        checker.check_package(args.package, args.expect_sha256 or None)
    return checker.summary()


if __name__ == "__main__":
    sys.exit(main())
