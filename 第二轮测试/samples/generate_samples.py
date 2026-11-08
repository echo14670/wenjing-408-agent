from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter


ROOT = Path(__file__).resolve().parent


def make_text_pdf(text: str) -> bytes:
    stream = f"BT /F1 18 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
            b"/Resources << /Font << /F1 5 0 R >> >> >>"
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


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)

    (ROOT / "note.txt").write_text(
        "Cache 行数 = Cache 容量 ÷ 主存块大小。\n"
        "64KB ÷ 64B = 1024 行。\n",
        encoding="utf-8",
    )
    (ROOT / "note.md").write_text(
        "# Cache 计算\n\n"
        "四路组相联：组数 = 1024 ÷ 4 = 256，组索引为 8 位。\n",
        encoding="utf-8",
    )
    (ROOT / "empty.txt").write_bytes(b"")
    (ROOT / "unsupported.bin").write_bytes(b"\x00\x01\x02\x03")
    (ROOT / "oversized.txt").write_bytes(b"x" * (20 * 1024 * 1024 + 1))
    (ROOT / "corrupt.pdf").write_bytes(b"%PDF-1.4\nnot a real pdf")

    text_pdf = make_text_pdf("Cache lines: 64KB / 64B = 1024")
    (ROOT / "text.pdf").write_bytes(text_pdf)

    writer = PdfWriter()
    writer.append(PdfReader(BytesIO(text_pdf)))
    writer.add_blank_page(width=612, height=792)
    mixed = BytesIO()
    writer.write(mixed)
    (ROOT / "mixed.pdf").write_bytes(mixed.getvalue())

    scan_writer = PdfWriter()
    scan_writer.add_blank_page(width=612, height=792)
    scan = BytesIO()
    scan_writer.write(scan)
    (ROOT / "scan.pdf").write_bytes(scan.getvalue())

    image = Image.new("RGB", (800, 500), "white")
    draw = ImageDraw.Draw(image)
    draw.text((40, 80), "408 Cache question image - OCR required", fill="black")
    draw.rectangle((40, 140, 740, 440), outline="black", width=3)
    image.save(ROOT / "question.png")

    print(ROOT)
    for path in sorted(ROOT.iterdir()):
        print(f"{path.name}\t{path.stat().st_size}")


if __name__ == "__main__":
    main()
