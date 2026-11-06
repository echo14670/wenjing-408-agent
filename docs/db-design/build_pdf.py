# -*- coding: utf-8 -*-
"""
问径·408智能体 —— 数据库设计说明书 PDF 排版脚本
团队：你说的都队   责任人：周玘晖

运行：python docs/db-design/build_pdf.py
依赖：pip install markdown
流程：database-design.md → 样式化 HTML（嵌入 er-diagram.svg）
      → Edge 无头打印 → ../你说的都队_数据库设计说明书.pdf
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MD = os.path.join(HERE, "database-design.md")
SVG = os.path.join(HERE, "er-diagram.svg")
HTML = os.path.join(HERE, "database-design.html")
PDF = os.path.join(HERE, "..", "你说的都队_数据库设计说明书.pdf")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
EDGE2 = r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"

CSS = """
@page { size: A4; margin: 16mm 15mm 18mm 15mm; }
* { box-sizing: border-box; }
body {
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 10.5pt; line-height: 1.62; color: #1f2937; margin: 0;
}
h1 {
  font-size: 21pt; color: #1e3a8a; text-align: center; margin: 8mm 0 2mm;
  padding-bottom: 3mm; border-bottom: 2.5pt solid #1e3a8a;
}
h2 {
  font-size: 14.5pt; color: #1e3a8a; margin: 8mm 0 3mm;
  padding-left: 3mm; border-left: 4pt solid #3b82f6;
  page-break-after: avoid;
}
h3 { font-size: 12pt; color: #1d4ed8; margin: 5mm 0 2mm; page-break-after: avoid; }
p { margin: 2mm 0; text-align: justify; }
blockquote {
  margin: 3mm 0; padding: 3mm 4mm; background: #eef4ff;
  border-left: 3pt solid #3b82f6; border-radius: 2pt; color: #1e3a5f;
  font-size: 9.5pt; line-height: 1.7;
}
blockquote p { margin: 1mm 0; }
table {
  border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9pt;
  page-break-inside: avoid;
}
th {
  background: #1e3a8a; color: #fff; padding: 1.6mm 2.2mm; text-align: left;
  font-weight: 600; border: 0.5pt solid #1e3a8a;
}
td { padding: 1.4mm 2.2mm; border: 0.5pt solid #c7d2e8; vertical-align: top; }
tr:nth-child(even) td { background: #f4f7fd; }
code {
  font-family: Consolas, "Courier New", monospace; font-size: 8.8pt;
  background: #f1f5f9; padding: 0.4mm 1.2mm; border-radius: 2pt; color: #b91c1c;
}
pre {
  background: #f8fafc; border: 0.5pt solid #cbd5e1; border-left: 3pt solid #64748b;
  padding: 2.5mm 3mm; margin: 3mm 0; white-space: pre-wrap; word-break: break-all;
  page-break-inside: avoid; border-radius: 2pt;
}
pre code { background: none; padding: 0; color: #0f172a; font-size: 8.6pt; }
hr { border: none; border-top: 0.8pt solid #cbd5e1; margin: 5mm 0; }
ul, ol { margin: 2mm 0; padding-left: 7mm; }
li { margin: 1mm 0; }
strong { color: #111827; }
.er-figure { text-align: center; margin: 4mm 0; page-break-inside: avoid; }
.er-figure svg { width: 100%; height: auto; max-height: 175mm; }
.er-caption { font-size: 9pt; color: #475569; text-align: center; margin-top: 1.5mm; }
"""


def build() -> None:
    import markdown

    with open(MD, encoding="utf-8") as f:
        md_text = f.read()

    body = markdown.markdown(md_text, extensions=["tables", "fenced_code"])

    # 在“3.1 全局 E-R 图”正文位置嵌入 SVG
    with open(SVG, encoding="utf-8") as f:
        svg = f.read()
    figure = (
        f'<div class="er-figure">{svg}'
        f'<div class="er-caption">图 3-1　问径·408 智能体全局 E-R 图（Chen 记法，'
        f'矩形=实体，双矩形=弱实体，菱形=联系，椭圆=属性，下划线=键）</div></div>'
    )
    anchor = "（见下页插图，源文件 <code>er-diagram.svg</code>，由 <code>generate_er_svg.py</code> 生成，Chen 记法）"
    if anchor in body:
        body = body.replace(f"<p>{anchor}</p>", figure)

    html = (
        "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'>"
        f"<style>{CSS}</style></head><body>{body}</body></html>"
    )
    with open(HTML, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"html written: {HTML}")

    edge = EDGE if os.path.exists(EDGE) else EDGE2
    if not os.path.exists(edge):
        print("未找到 Edge，无法打印 PDF", file=sys.stderr)
        sys.exit(1)

    cmd = [
        edge,
        "--headless",
        "--disable-gpu",
        f"--print-to-pdf={os.path.abspath(PDF)}",
        "--no-pdf-header-footer",
        os.path.abspath(HTML).replace("\\", "/").join(("file:///", "")),
    ]
    cmd[-1] = "file:///" + os.path.abspath(HTML).replace("\\", "/")
    subprocess.run(cmd, check=True, capture_output=True, timeout=120)
    size = os.path.getsize(PDF)
    print(f"pdf written: {os.path.abspath(PDF)}  ({size/1024:.0f} KB)")


if __name__ == "__main__":
    try:
        import markdown  # noqa: F401
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "markdown"], check=True)
    build()
