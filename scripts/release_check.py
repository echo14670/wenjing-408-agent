#!/usr/bin/env python3
"""发布后自检脚本（β-09 / 林子涵）。

对一条候选提交绑定检查公开站的关键行为，输出可直接贴进发布台账的表格。
只用标准库，服务器与本机都能跑。

用法：
    python3 scripts/release_check.py --expect-commit 9e9793a \
        --expect-model Qwen/Qwen2.5-7B-Instruct --expect-questions 81

    # 指定站点（默认 http://127.0.0.1，即服务器本机经 nginx）
    python3 scripts/release_check.py --base http://123.60.34.87

    # 额外核对服务器静态目录（只能在服务器上跑）
    python3 scripts/release_check.py --webroot /var/www/wenjing

    # 需要 Windows 包时校验 SHA-256 与必需文件
    python3 scripts/release_check.py --package ~/Downloads/wenjing-408-windows.zip

退出码：0 = 全通过；1 = 有失败项（失败项在输出里标 ❌）。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

STREAM_ACCEPT = "application/x-ndjson"
REQUIRED_PACKAGE_ENTRIES = ("start-wenjing.cmd",)


class Checker:
    def __init__(self, base: str, timeout: float) -> None:
        self.base = base.rstrip("/")
        self.timeout = timeout
        self.rows: list[tuple[str, bool, str]] = []

    def record(self, name: str, ok: bool, detail: str) -> None:
        self.rows.append((name, ok, detail))
        print(f"{'✅' if ok else '❌'} {name}: {detail}")

    def _open(self, req: urllib.request.Request) -> tuple[object, float]:
        started = time.time()
        resp = urllib.request.urlopen(req, timeout=self.timeout)
        return resp, started

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

    def check_health(self, expect_commit: str, expect_model: str, expect_questions: int) -> None:
        try:
            health = self.get_json("/api/health")
        except Exception as error:  # noqa: BLE001
            self.record("health", False, f"请求失败：{error}")
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
        if expect_commit:
            detail += f"；待核对提交 {expect_commit}"
        self.record("health", ok, detail)

    def check_routes(self) -> None:
        for path in ("/", "/workbench", "/practice", "/materials"):
            try:
                resp = urllib.request.urlopen(f"{self.base}{path}", timeout=self.timeout)
                self.record(f"页面 {path}", resp.status == 200, f"HTTP {resp.status}")
            except urllib.error.HTTPError as error:
                self.record(f"页面 {path}", False, f"HTTP {error.code}")
            except Exception as error:  # noqa: BLE001
                self.record(f"页面 {path}", False, f"请求失败：{error}")

    def check_question(self, question_id: str = "COP006") -> None:
        try:
            data = self.get_json(f"/api/question/{question_id}")
        except urllib.error.HTTPError as error:
            self.record("题目详情", False, f"HTTP {error.code}")
            return
        except Exception as error:  # noqa: BLE001
            self.record("题目详情", False, f"请求失败：{error}")
            return
        ok = data.get("question_id") == question_id and bool(data.get("stem")) and bool(data.get("options"))
        self.record("题目详情", ok, f"question_id={data.get('question_id')} 选项数={len(data.get('options') or [])}")

    def check_recommend(self, question_id: str = "COP006") -> None:
        status, data = self.post_json(
            "/api/recommend",
            {"question_id": question_id, "done_question_ids": [], "top_k": 3},
        )
        candidates = data.get("questions") or []
        self.record("同考点推荐", status == 200 and bool(candidates), f"HTTP {status} 候选={len(candidates)}")

    def check_search_variants(self, question_id: str = "COP006") -> None:
        try:
            question = self.get_json(f"/api/question/{question_id}")
        except Exception as error:  # noqa: BLE001
            self.record("题号变体", False, f"取题干失败：{error}")
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
            self.record(f"题号变体·{name}", status == 200 and actual == expect, f"预期 {expect} 实际 {actual}")

    def check_stream_chat(self) -> None:
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
        try:
            resp = urllib.request.urlopen(req, timeout=180)
            first_byte = time.time() - started
            deltas = 0
            done = False
            for raw in resp:
                line = raw.decode("utf-8").strip()
                if not line:
                    continue
                event = json.loads(line)
                if event.get("type") == "delta":
                    deltas += 1
                elif event.get("type") == "done":
                    done = True
                    break
        except Exception as error:  # noqa: BLE001
            self.record("流式答疑", False, f"请求失败：{error}")
            return
        total = time.time() - started
        ok = done and deltas > 0 and first_byte < total
        self.record(
            "流式答疑",
            ok,
            f"首字节={first_byte:.2f}s 总={total:.2f}s delta={deltas} done={done}",
        )

    def check_quiz(self, quiz_id: str = "co-memory-01") -> None:
        try:
            resp = urllib.request.urlopen(f"{self.base}/api/quiz/{quiz_id}", timeout=self.timeout)
            self.record("小测接口", resp.status == 200, f"HTTP {resp.status}（已实现）")
        except urllib.error.HTTPError as error:
            note = "尚未实现（β 已知缺口，非回归）" if error.code == 404 else "异常"
            self.record("小测接口", error.code == 404, f"HTTP {error.code} {note}")
        except Exception as error:  # noqa: BLE001
            self.record("小测接口", False, f"请求失败：{error}")

    def check_webroot(self, webroot: str) -> None:
        index = Path(webroot) / "index.html"
        if not index.exists():
            self.record("静态目录", False, f"{index} 不存在")
            return
        digest = hashlib.sha256(index.read_bytes()).hexdigest()
        assets = sorted(p.name for p in (Path(webroot) / "assets").glob("*")) if (Path(webroot) / "assets").is_dir() else []
        self.record("静态目录", True, f"index.html sha256={digest[:16]}… assets={len(assets)} 个")

    def check_package(self, package: str, expect_sha256: str | None) -> None:
        path = Path(package).expanduser()
        if not path.exists():
            self.record("发布包", False, f"文件不存在：{path}")
            return
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        ok_sha = True if not expect_sha256 else digest == expect_sha256.lower()
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
        missing = [entry for entry in REQUIRED_PACKAGE_ENTRIES if not any(n.endswith(entry) for n in names)]
        self.record(
            "发布包",
            ok_sha and not missing,
            f"sha256={digest[:16]}… 校验={'通过' if ok_sha else '不匹配'} 文件数={len(names)} 缺失={missing or '无'}",
        )

    def summary(self) -> int:
        failed = [row for row in self.rows if not row[1]]
        print("\n| 检查项 | 结果 | 证据 |")
        print("| --- | --- | --- |")
        for name, ok, detail in self.rows:
            print(f"| {name} | {'✅' if ok else '❌'} | {detail} |")
        print(f"\n合计 {len(self.rows)} 项，失败 {len(failed)} 项")
        return 0 if not failed else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="发布后自检（公开站 + 可选包校验）")
    parser.add_argument("--base", default="http://127.0.0.1", help="站点基地址，默认 http://127.0.0.1")
    parser.add_argument("--expect-commit", default="", help="候选提交号（写入输出，便于台账追溯）")
    parser.add_argument("--expect-model", default="Qwen/Qwen2.5-7B-Instruct", help="期望的 llm_model")
    parser.add_argument("--expect-questions", type=int, default=81, help="期望题数")
    parser.add_argument("--webroot", default="", help="服务器静态目录（可选，仅服务器可跑）")
    parser.add_argument("--package", default="", help="Windows ZIP 路径（可选）")
    parser.add_argument("--expect-sha256", default="", help="发布包期望 SHA-256（可选）")
    parser.add_argument("--timeout", type=float, default=15.0, help="单请求超时秒数")
    args = parser.parse_args()

    print(f"站点：{args.base}｜候选提交：{args.expect_commit or '未指定'}")
    checker = Checker(args.base, args.timeout)
    checker.check_health(args.expect_commit, args.expect_model, args.expect_questions)
    checker.check_routes()
    checker.check_question()
    checker.check_recommend()
    checker.check_search_variants()
    checker.check_stream_chat()
    checker.check_quiz()
    if args.webroot:
        checker.check_webroot(args.webroot)
    if args.package:
        checker.check_package(args.package, args.expect_sha256 or None)
    return checker.summary()


if __name__ == "__main__":
    sys.exit(main())
