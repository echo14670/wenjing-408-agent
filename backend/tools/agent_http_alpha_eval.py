"""Evaluate a deployed Agent through its public HTTP API.

Examples:
    python tools/agent_http_alpha_eval.py --base-url http://123.60.34.87 --preflight-only
    python tools/agent_http_alpha_eval.py --base-url http://123.60.34.87

The script never reads or prints the server API key.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TOOLS_ROOT = Path(__file__).resolve().parent
for candidate in (BACKEND_ROOT, TOOLS_ROOT):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from agent_alpha_eval import CASES, has_guided_leak


def request_json(
    url: str,
    *,
    payload: dict | None = None,
    timeout_seconds: float = 90,
) -> tuple[int, dict]:
    data = (
        json.dumps(payload, ensure_ascii=False).encode("utf-8")
        if payload is not None
        else None
    )
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    request = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method="POST" if data is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            decoded = json.loads(body)
        except json.JSONDecodeError:
            decoded = {"raw": body}
        return error.code, decoded


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        default="http://123.60.34.87",
        help="Backend base URL without a trailing slash",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="Only check health, question count and model status fields",
    )
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    health_status, health = request_json(f"{base_url}/api/health")
    question_count = health.get("questions")
    preflight_ok = (
        health_status == 200
        and isinstance(question_count, int)
        and question_count >= 81
        and health.get("skipped") == []
    )
    output: dict = {
        "base_url": base_url,
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "health_status": health_status,
        "health": health,
        "preflight_ok": preflight_ok,
        "results": [],
    }
    if not preflight_ok or args.preflight_only:
        output["status"] = "ready" if preflight_ok else "blocked"
        if not preflight_ok:
            output["blocked_reason"] = (
                "线上题库不是至少 81 题的正式库，或 health 报告 skipped 非空。"
            )
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0 if preflight_ok else 2

    for name, case in CASES:
        started = time.perf_counter()
        status_code, body = request_json(
            f"{base_url}/api/chat",
            payload=case.model_dump(mode="json"),
        )
        elapsed = time.perf_counter() - started
        reply = body.get("reply", "")
        answer_revealed = any(
            item.role == "user" and "我已主动选择查看答案" in item.content
            for item in case.session_messages
        )
        output["results"].append(
            {
                "case": name,
                "status_code": status_code,
                "elapsed_seconds": round(elapsed, 2),
                "reply_excerpt": reply[:500],
                "tool_result": body.get("tool_result", ""),
                "citations": body.get("citations", []),
                "guided_leak": (
                    has_guided_leak(reply)
                    if case.mode == "guided" and not answer_revealed
                    else False
                ),
            }
        )

    output["status"] = (
        "passed"
        if all(item["status_code"] == 200 for item in output["results"])
        and not any(item["guided_leak"] for item in output["results"])
        else "failed"
    )
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if output["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
