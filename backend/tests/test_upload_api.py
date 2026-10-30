"""POST /api/upload 接口用例：契约字段、文本提取、扫描页失败项、异常态。"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

from main import app

CONTRACT_KEYS = {"task_id", "extracted_text", "failure_details"}


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def _make_text_pdf(text: str = "Hello 408 upload") -> bytes:
    """构造一个含文字层的最小合法 PDF（Helvetica 字体，用于验证提取成功路径）。"""
    stream = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF"
    ).encode()
    return bytes(out)


def _make_blank_pdf() -> bytes:
    """构造一个无文字层的空白页 PDF，模拟扫描版（图片）PDF。"""
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


# 1x1 透明 PNG。
_PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626000000000010000ffff03000006000557bfabd40000000049454e44ae426082"
)


def test_pdf_extracts_text(client: TestClient):
    resp = client.post(
        "/api/upload",
        files={"file": ("doc.pdf", _make_text_pdf(), "application/pdf")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == CONTRACT_KEYS
    assert body["task_id"].startswith("task_")
    assert "Hello 408 upload" in body["extracted_text"]
    assert body["failure_details"] == []


def test_scanned_pdf_reports_failure(client: TestClient):
    body = client.post(
        "/api/upload",
        files={"file": ("scan.pdf", _make_blank_pdf(), "application/pdf")},
    ).json()
    assert body["extracted_text"] == ""
    assert body["failure_details"], "扫描页应如实返回失败项"
    assert any("OCR" in f or "未提取到文本" in f for f in body["failure_details"])


def test_corrupt_pdf_reports_failure_not_500(client: TestClient):
    resp = client.post(
        "/api/upload",
        files={"file": ("bad.pdf", b"%PDF-1.4\nnot a real pdf", "application/pdf")},
    )
    assert resp.status_code == 200
    assert resp.json()["failure_details"], "损坏 PDF 应返回失败项而非 500"


def test_text_file_extracts_content(client: TestClient):
    body = client.post(
        "/api/upload",
        files={"file": ("note.txt", "这是第一行\n这是第二行 408".encode("utf-8"), "text/plain")},
    ).json()
    assert "这是第一行" in body["extracted_text"]
    assert body["failure_details"] == []


def test_json_question_bank_extracts_stems(client: TestClient):
    body = client.post(
        "/api/upload",
        files={
            "file": (
                "bank.json",
                '[{"stem":"某题题干","answer":"A"},{"stem":"第二题"}]'.encode("utf-8"),
                "application/json",
            )
        },
    ).json()
    assert "某题题干" in body["extracted_text"]
    assert "第二题" in body["extracted_text"]


def test_image_returns_ocr_failure(client: TestClient):
    body = client.post(
        "/api/upload",
        files={"file": ("pic.png", _PNG_1PX, "image/png")},
    ).json()
    assert body["extracted_text"] == ""
    assert body["failure_details"], "纯图片应返回「需视觉模型/OCR」失败项"


def test_unsupported_type_rejected(client: TestClient):
    resp = client.post(
        "/api/upload",
        files={"file": ("x.bin", b"123", "application/octet-stream")},
    )
    assert resp.status_code == 415


def test_empty_file_rejected(client: TestClient):
    resp = client.post(
        "/api/upload",
        files={"file": ("e.txt", b"", "text/plain")},
    )
    assert resp.status_code == 400


def test_oversized_file_rejected(client: TestClient):
    from app.core.config import Settings, get_settings

    small = Settings()
    small.max_upload_bytes = 8
    app.dependency_overrides[get_settings] = lambda: small
    try:
        resp = client.post(
            "/api/upload",
            files={"file": ("big.txt", b"x" * 64, "text/plain")},
        )
        assert resp.status_code == 413
    finally:
        app.dependency_overrides.clear()
