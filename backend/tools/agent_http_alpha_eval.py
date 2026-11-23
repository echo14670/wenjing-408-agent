"""Collect the fixed Alpha Agent cases through a deployed public HTTP API.

Examples:
    python tools/agent_http_alpha_eval.py --base-url http://123.60.34.87 --preflight-only
    python tools/agent_http_alpha_eval.py --base-url http://123.60.34.87

A successful run collects evidence for manual review of the replies.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from pydantic import ValidationError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TOOLS_ROOT = Path(__file__).resolve().parent
for candidate in (BACKEND_ROOT, TOOLS_ROOT):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from agent_alpha_eval import CASES, has_guided_leak
from app.schemas.chat import ChatRequest, ChatResponse

EXPECTED_QUESTION_COUNT = 81


def request_json(
    url: str,
    *,
    payload: dict | None = None,
    timeout_seconds: float = 90,
) -> tuple[int, object]:
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
            status_code, body = response.status, response.read()
    except urllib.error.HTTPError as error:
        with error:
            status_code, body = error.code, error.read()
    try:
        return status_code, json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return status_code, None


def preflight_blockers(status_code: int, health: object) -> list[str]:
    if status_code != 200:
        return [f"health 返回 HTTP {status_code}。"]
    if not isinstance(health, dict) or health.get("status") != "ok":
        return ["health 未返回状态为 ok 的 JSON 对象。"]

    blockers = []
    question_count = health.get("questions")
    if not isinstance(question_count, int) or question_count != EXPECTED_QUESTION_COUNT:
        blockers.append(f"正式题库预期 {EXPECTED_QUESTION_COUNT} 题，实际为 {question_count}。")
    if health.get("skipped") != []:
        blockers.append("health 未确认 skipped=[]。")

    configured = health.get("llm_configured")
    if configured is False:
        blockers.append("线上模型未配置（llm_configured=false）。")
    elif configured is not True:
        blockers.append("health 未提供可确认的 llm_configured 字段。")
    model = health.get("llm_model")
    if not isinstance(model, str) or not model.strip():
        blockers.append("health 未提供实际模型名 llm_model。")
    return blockers


def evaluate_case(base_url: str, name: str, case: ChatRequest) -> dict:
    started = time.perf_counter()
    status_code, body = request_json(
        f"{base_url}/api/chat",
        payload=case.model_dump(mode="json"),
    )
    result = {
        "case": name,
        "status_code": status_code,
        "elapsed_seconds": round(time.perf_counter() - started, 2),
    }
    if status_code != 200:
        return {**result, "error": f"chat 返回 HTTP {status_code}。"}

    try:
        response = ChatResponse.model_validate(body)
    except ValidationError:
        return {**result, "error": "响应字段不符合 /api/chat 契约。"}
    if not response.reply.strip():
        return {**result, "error": "答疑回复为空。"}

    answer_revealed = any(
        item.role == "user" and "我已主动选择查看答案" in item.content
        for item in case.session_messages
    )
    return {
        **result,
        **response.model_dump(),
        "guided_leak": (
            case.mode == "guided"
            and not answer_revealed
            and (bool(response.tool_result.strip()) or has_guided_leak(response.reply))
        ),
    }


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
    blockers = preflight_blockers(health_status, health)
    output: dict = {
        "base_url": base_url,
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "health_status": health_status,
        "health": health,
        "preflight_ok": not blockers,
        "results": [],
    }
    if blockers or args.preflight_only:
        output["status"] = "blocked" if blockers else "ready"
        if blockers:
            output["blocked_reasons"] = blockers
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 2 if blockers else 0

    results = [evaluate_case(base_url, name, case) for name, case in CASES]
    failed = any(result.get("error") or result.get("guided_leak") for result in results)
    output["results"] = results
    output["status"] = "failed" if failed else "needs_review"
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
