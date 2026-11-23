#!/usr/bin/env python3
"""Alpha API acceptance entry point.

This script exercises the main search, upload, recommendation and error paths
against the current FastAPI app. It writes a machine-readable result file so a
review can compare outcomes across commits without relying on old reports.

Usage from the repository root:

    python scripts/alpha_acceptance.py \
      --output docs/alpha/evidence/alpha-acceptance.json

The command exits with status 1 when a check fails. During an in-progress Alpha,
use ``--allow-known-failures`` to keep the run successful while the report still
records every failure.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from main import app  # noqa: E402


def make_text_pdf(text: str = "Alpha 408 acceptance") -> bytes:
    """Build a minimal text-layer PDF without writing a fixture to disk."""
    stream = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(output)
    output += f"xref\n0 {len(objects) + 1}\n".encode()
    output += b"0000000000 65535 f \n"
    for offset in offsets:
        output += f"{offset:010d} 00000 n \n".encode()
    output += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF"
    ).encode()
    return bytes(output)


def make_blank_pdf() -> bytes:
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


class Recorder:
    def __init__(self) -> None:
        self.checks: list[dict[str, Any]] = []

    def add(self, preset: str, condition: bool, detail: str = "") -> None:
        self.checks.append(
            {
                "preset": preset,
                "status": "pass" if condition else "fail",
                "detail": detail,
            }
        )


def run_check(
    recorder: Recorder,
    name: str,
    callback: Callable[[], tuple[bool, str]],
) -> None:
    try:
        ok, detail = callback()
    except Exception as exc:  # noqa: BLE001 - report the failed acceptance step itself
        ok, detail = False, f"{type(exc).__name__}: {exc}"
    recorder.add(name, ok, detail)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "docs" / "alpha" / "evidence" / "alpha-acceptance.json",
        help="Path for the JSON result file.",
    )
    parser.add_argument(
        "--allow-known-failures",
        action="store_true",
        help="Keep exit status 0 while known Alpha defects remain open.",
    )
    args = parser.parse_args()

    bank = json.loads((BACKEND_ROOT / "data" / "questions.json").read_text(encoding="utf-8"))
    questions = {item["question_id"]: item for item in bank["questions"]}
    current = questions["COP006"]
    stem = current["stem"]
    recorder = Recorder()

    with TestClient(app) as client:
        def health() -> tuple[bool, str]:
            response = client.get("/api/health")
            body = response.json()
            ok = (
                response.status_code == 200
                and body.get("questions") == len(questions)
                and body.get("indexed") == len(questions)
                and body.get("skipped") == []
                and set(body.get("by_subject", {}))
                == {"数据结构", "计算机组成原理", "操作系统", "计算机网络"}
            )
            return ok, json.dumps(body, ensure_ascii=False)

        run_check(recorder, "health_bank", health)

        def search_exact() -> tuple[bool, str]:
            response = client.post(
                "/api/search", json={"raw_input": stem, "input_type": "text"}
            )
            body = response.json()
            ok = (
                response.status_code == 200
                and set(body) == {"match_type", "question_data", "similar_questions"}
                and body.get("match_type") == "original"
                and body.get("question_data", {}).get("question_id") == "COP006"
            )
            return ok, f"{response.status_code} {body.get('match_type')}"

        run_check(recorder, "search_exact_original", search_exact)

        def search_with_question_prefix() -> tuple[bool, str]:
            response = client.post(
                "/api/search",
                json={"raw_input": f"第12题\n{stem}", "input_type": "text"},
            )
            body = response.json()
            ok = body.get("match_type") == "original"
            return ok, (
                f"status={response.status_code}; match_type={body.get('match_type')}; "
                f"question_id={(body.get('question_data') or {}).get('question_id')}"
            )

        # BUG-06 remains an explicit acceptance check rather than being hidden.
        run_check(recorder, "bug06_question_prefix", search_with_question_prefix)

        def search_similar() -> tuple[bool, str]:
            response = client.post(
                "/api/search",
                json={
                    "raw_input": "Cache 容量 16KB，块大小 32B，两路组相联，求组索引位数",
                    "input_type": "text",
                },
            )
            body = response.json()
            ok = (
                response.status_code == 200
                and body.get("match_type") == "similar"
                and body.get("question_data") is None
                and bool(body.get("similar_questions"))
            )
            return ok, f"{response.status_code} {body.get('match_type')}"

        run_check(recorder, "search_similar", search_similar)

        def search_miss() -> tuple[bool, str]:
            response = client.post(
                "/api/search", json={"raw_input": "今天天气怎么样", "input_type": "text"}
            )
            body = response.json()
            ok = (
                response.status_code == 200
                and body.get("match_type") == "miss"
                and body.get("question_data") is None
                and body.get("similar_questions") == []
            )
            return ok, f"{response.status_code} {body.get('match_type')}"

        run_check(recorder, "search_miss", search_miss)

        def recommend() -> tuple[bool, str]:
            response = client.post(
                "/api/recommend",
                json={"question_id": "COP006", "top_k": 3},
            )
            body = response.json()
            ids = [item["question_id"] for item in body.get("questions", [])]
            ok = (
                response.status_code == 200
                and body.get("scope") in {"knowledge_point", "chapter"}
                and bool(ids)
                and "COP006" not in ids
                and all(item.get("review_state") == "verified" for item in body["questions"])
            )
            return ok, f"{response.status_code} scope={body.get('scope')} ids={ids}"

        run_check(recorder, "recommend_real_bank", recommend)

        def recommend_exclusion() -> tuple[bool, str]:
            first = client.post(
                "/api/recommend",
                json={"question_id": "COP006", "top_k": 3},
            ).json()["questions"][0]["question_id"]
            response = client.post(
                "/api/recommend",
                json={
                    "question_id": "COP006",
                    "top_k": 3,
                    "done_question_ids": [first],
                },
            )
            body = response.json()
            ids = [item["question_id"] for item in body.get("questions", [])]
            ok = first not in ids and "COP006" not in ids
            return ok, f"excluded={first}; ids={ids}"

        run_check(recorder, "recommend_excludes_done", recommend_exclusion)

        def question_detail() -> tuple[bool, str]:
            response = client.get("/api/question/COP006")
            body = response.json()
            return (
                response.status_code == 200,
                f"status={response.status_code}; body={json.dumps(body, ensure_ascii=False)}",
            )

        run_check(recorder, "bug03_question_detail", question_detail)

        def upload_text_pdf() -> tuple[bool, str]:
            response = client.post(
                "/api/upload",
                files={
                    "file": (
                        "alpha-text.pdf",
                        make_text_pdf(),
                        "application/pdf",
                    )
                },
            )
            body = response.json()
            ok = (
                response.status_code == 200
                and "Alpha 408 acceptance" in body.get("extracted_text", "")
                and body.get("failure_details") == []
            )
            return ok, f"{response.status_code} text={body.get('extracted_text', '')[:60]}"

        run_check(recorder, "upload_text_pdf", upload_text_pdf)

        def upload_scanned_pdf() -> tuple[bool, str]:
            response = client.post(
                "/api/upload",
                files={
                    "file": ("alpha-scan.pdf", make_blank_pdf(), "application/pdf")
                },
            )
            body = response.json()
            ok = (
                response.status_code == 200
                and body.get("extracted_text") == ""
                and bool(body.get("failure_details"))
            )
            return ok, json.dumps(body.get("failure_details"), ensure_ascii=False)

        run_check(recorder, "upload_scan_limit", upload_scanned_pdf)

        def upload_unsupported() -> tuple[bool, str]:
            response = client.post(
                "/api/upload",
                files={
                    "file": (
                        "alpha-unsupported.bin",
                        b"not-supported",
                        "application/octet-stream",
                    )
                },
            )
            body = response.json()
            ok = (
                response.status_code == 415
                and body.get("detail", {}).get("code") == "unsupported_type"
            )
            return ok, f"{response.status_code} {json.dumps(body, ensure_ascii=False)}"

        run_check(recorder, "upload_unsupported_type", upload_unsupported)

        def upload_empty() -> tuple[bool, str]:
            response = client.post(
                "/api/upload",
                files={"file": ("alpha-empty.txt", b"", "text/plain")},
            )
            body = response.json()
            ok = (
                response.status_code == 400
                and body.get("detail", {}).get("code") == "empty_file"
            )
            return ok, f"{response.status_code} {json.dumps(body, ensure_ascii=False)}"

        run_check(recorder, "upload_empty_file", upload_empty)

        def chat_validation() -> tuple[bool, str]:
            response = client.post(
                "/api/chat",
                json={
                    "session_messages": [{"role": "user", "content": "测试"}],
                    "question_id": "COP006",
                    "user_answer": "",
                    "mode": "invalid",
                    "context_chunks": [],
                },
            )
            return response.status_code == 422, f"status={response.status_code}"

        run_check(recorder, "chat_input_validation", chat_validation)

    failures = [item for item in recorder.checks if item["status"] == "fail"]
    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "question_bank": {
            "path": "backend/data/questions.json",
            "version": bank.get("version"),
            "updated_at": bank.get("updated_at"),
            "questions": len(questions),
        },
        "summary": {
            "total": len(recorder.checks),
            "passed": len(recorder.checks) - len(failures),
            "failed": len(failures),
        },
        "checks": recorder.checks,
    }

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result["summary"], ensure_ascii=False))
    for item in failures:
        print(f"FAIL {item['preset']}: {item['detail']}")
    print(f"report: {output}")

    if failures and not args.allow_known_failures:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
