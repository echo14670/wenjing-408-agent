# -*- coding: utf-8 -*-
"""
问径·408智能体 —— 全局 E-R 图生成器（Chen 记法）
团队：你说的都队   责任人：周玘晖

运行：python docs/db-design/generate_er_svg.py
输出：docs/db-design/er-diagram.svg
记法：矩形=实体（双线=弱实体），菱形=联系（双线=标识联系），
      椭圆=属性（下划线=主键/候选键），1/N/M=联系的基数。
"""

from __future__ import annotations

W, H = 1900, 1150
FONT = "Microsoft YaHei, PingFang SC, sans-serif"

parts: list[str] = []


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def rect(x, y, w, h, label, en, weak=False, rx=6):
    """实体：矩形（弱实体双线）"""
    style = f"fill:#ffffff;stroke:#1f3b73;stroke-width:2;rx:{rx}"
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" style="{style}"/>')
    if weak:
        inset = 5
        parts.append(
            f'<rect x="{x+inset}" y="{y+inset}" width="{w-2*inset}" height="{h-2*inset}" '
            f'style="fill:none;stroke:#1f3b73;stroke-width:1.4;rx:{rx-2}"/>'
        )
    cx = x + w / 2
    cy = y + h / 2 - 3
    parts.append(
        f'<text x="{cx}" y="{cy}" text-anchor="middle" font-size="16" font-weight="bold" '
        f'font-family="{FONT}" fill="#1f3b73">{esc(label)}</text>'
    )
    parts.append(
        f'<text x="{cx}" y="{cy + 16}" text-anchor="middle" font-size="10.5" '
        f'font-family="Consolas, monospace" fill="#6b7280">{esc(en)}</text>'
    )


def diamond(cx, cy, label, double=False):
    """联系：菱形（标识联系双线）"""
    dw, dh = 52, 30
    pts = f"{cx},{cy-dh} {cx+dw},{cy} {cx},{cy+dh} {cx-dw},{cy}"
    parts.append(
        f'<polygon points="{pts}" style="fill:#eef4ff;stroke:#7c3aed;stroke-width:2"/>'
    )
    if double:
        parts.append(
            f'<polygon points="{pts}" transform="translate({cx},{cy}) scale(0.82) '
            f'translate({-cx},{-cy})" style="fill:none;stroke:#7c3aed;stroke-width:1.3"/>'
        )
    parts.append(
        f'<text x="{cx}" y="{cy+4}" text-anchor="middle" font-size="13" font-weight="bold" '
        f'font-family="{FONT}" fill="#5b21b6">{esc(label)}</text>'
    )


def oval(cx, cy, label, key=False, attach=None):
    """属性：椭圆（下划线=键）"""
    rx, ry = 46, 16
    parts.append(
        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" '
        f'style="fill:#fffbeb;stroke:#b45309;stroke-width:1.4"/>'
    )
    if key:
        tw = len(label) * 11 + 4
        parts.append(
            f'<line x1="{cx-tw/2}" y1="{cy+4}" x2="{cx+tw/2}" y2="{cy+4}" '
            f'stroke="#b45309" stroke-width="1.2"/>'
        )
    parts.append(
        f'<text x="{cx}" y="{cy+4}" text-anchor="middle" font-size="11.5" '
        f'font-family="{FONT}" fill="#78350f">{esc(label)}</text>'
    )
    if attach:
        ax, ay = attach
        dx, dy = cx - ax, cy - ay
        import math

        n = math.hypot(dx, dy) or 1
        px, py = cx - dx / n * rx, cy - dy / n * ry  # 椭圆边缘起点（近似）
        parts.append(
            f'<line x1="{px:.1f}" y1="{py:.1f}" x2="{ax}" y2="{ay}" '
            f'stroke="#92400e" stroke-width="1"/>'
        )


def line(p1, p2, card=None, near=0.18, dashed=False):
    x1, y1 = p1
    x2, y2 = p2
    d = 'stroke-dasharray="5,4"' if dashed else ""
    parts.append(
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#374151" '
        f'stroke-width="1.6" {d}/>'
    )
    if card:
        tx = x1 + (x2 - x1) * near
        ty = y1 + (y2 - y1) * near - 6
        parts.append(
            f'<text x="{tx}" y="{ty}" text-anchor="middle" font-size="13" font-weight="bold" '
            f'font-family="{FONT}" fill="#dc2626">{card}</text>'
        )


def edge_point(x, y, w, h, side, frac=0.5):
    """实体/菱形边缘连接点"""
    if side == "top":
        return (x + w * frac, y)
    if side == "bottom":
        return (x + w * frac, y + h)
    if side == "left":
        return (x, y + h * frac)
    return (x + w, y + h * frac)


# ------------------------------------------------------------------
# 实体坐标（x, y, w, h）
# ------------------------------------------------------------------
E_SUBJ = (80, 110, 150, 48)        # 科目
E_KP = (60, 430, 150, 48)          # 考点
E_QUES = (480, 300, 180, 60)       # 题目
E_OPT = (280, 650, 130, 48)        # 选项（弱）
E_REV = (600, 780, 150, 48)        # 核验记录（弱）
E_USER = (1050, 300, 160, 48)      # 用户
E_LOG = (1400, 80, 170, 48)        # 搜题日志
E_SESS = (1380, 500, 150, 48)      # 会话
E_MSG = (1380, 720, 150, 48)       # 消息（弱）
E_UP = (1380, 950, 160, 48)        # 上传文档

rect(*E_SUBJ, "科目", "subject")
rect(*E_KP, "考点", "knowledge_point")
rect(*E_QUES, "题目", "question")
rect(*E_OPT, "选项", "question_option", weak=True)
rect(*E_REV, "核验记录", "review_record", weak=True)
rect(*E_USER, "用户", "app_user")
rect(*E_LOG, "搜题日志", "search_log")
rect(*E_SESS, "会话", "chat_session")
rect(*E_MSG, "消息", "chat_message", weak=True)
rect(*E_UP, "上传文档", "upload_document")

# ------------------------------------------------------------------
# 联系 + 基数
# ------------------------------------------------------------------
# 科目 1—N 题目（属于）
diamond(330, 180, "属于")
line(edge_point(*E_SUBJ, "bottom", 0.8), (330, 155), "1")
line((330, 205), edge_point(*E_QUES, "top", 0.1), "N")

# 考点 N—1 科目（归属）
diamond(135, 290, "归属")
line(edge_point(*E_SUBJ, "bottom", 0.15), (135, 262), "1")
line((135, 318), edge_point(*E_KP, "top", 0.5), "N")

# 题目 M—N 考点（涉及）
diamond(300, 370, "涉及")
line(edge_point(*E_KP, "right", 0.4), (252, 380), "M")
line((348, 360), edge_point(*E_QUES, "left", 0.7), "N")

# 题目 1—N 选项（拥有，弱）
diamond(430, 500, "拥有", double=True)
line(edge_point(*E_QUES, "bottom", 0.15), (447, 472), "1")
line((415, 528), edge_point(*E_OPT, "top", 0.5), "N")

# 题目 1—N 核验记录（核验，弱）
diamond(610, 600, "核验", double=True)
line(edge_point(*E_QUES, "bottom", 0.55), (612, 572), "1")
line((610, 628), edge_point(*E_REV, "top", 0.45), "N")

# 用户 M—N 题目（作答）
diamond(790, 300, "作答")
line(edge_point(*E_QUES, "right", 0.2), (738, 300), "N")
line((842, 300), edge_point(*E_USER, "left", 0.5), "M")

# 用户 1—N 搜题日志（产生）
diamond(1270, 230, "产生")
line(edge_point(*E_USER, "top", 0.5), (1244, 246), "1")
line((1296, 214), edge_point(*E_LOG, "left", 0.5), "N")

# 搜题日志 N—1 题目（命中，可空）
diamond(1050, 200, "命中")
line(edge_point(*E_LOG, "bottom", 0.22), (1080, 226), "N")
line((1000, 214), edge_point(*E_QUES, "right", 0.05), "1", near=0.9)
parts.append(
    '<text x="1005" y="188" font-size="11" font-family="' + FONT + '" fill="#6b7280">可空</text>'
)

# 用户 1—N 会话（发起）
diamond(1250, 430, "发起")
line(edge_point(*E_USER, "bottom", 0.85), (1258, 404), "1")
line((1245, 456), edge_point(*E_SESS, "left", 0.4), "N")

# 会话 N—1 题目（针对，可空）
diamond(900, 540, "针对")
line(edge_point(*E_QUES, "bottom", 0.95), (878, 514), "N", near=0.05)
line((948, 526), edge_point(*E_SESS, "left", 0.75), "1", near=0.12)
parts.append(
    '<text x="1120" y="505" font-size="11" font-family="' + FONT + '" fill="#6b7280">可空</text>'
)

# 会话 1—N 消息（包含，弱）
diamond(1455, 640, "包含", double=True)
line(edge_point(*E_SESS, "bottom", 0.5), (1455, 612), "1")
line((1455, 668), edge_point(*E_MSG, "top", 0.5), "N")

# 用户 1—N 上传文档（上传）
diamond(1150, 660, "上传")
line(edge_point(*E_USER, "bottom", 0.15), (1138, 632), "1")
line((1190, 686), edge_point(*E_UP, "top", 0.5), "N")

# ------------------------------------------------------------------
# 属性（键加下划线）
# ------------------------------------------------------------------
# 科目
oval(150, 45, "科目编号", key=True, attach=edge_point(*E_SUBJ, "top", 0.35))
oval(280, 60, "科目名称", attach=edge_point(*E_SUBJ, "top", 0.85))
# 考点
oval(130, 515, "考点编号", key=True, attach=edge_point(*E_KP, "bottom", 0.2))
oval(290, 515, "考点名称", attach=edge_point(*E_KP, "bottom", 0.85))
# 题目（上方两行）
q_top = edge_point(*E_QUES, "top", 0.5)
oval(500, 130, "题号", key=True, attach=(500, 300))
oval(610, 130, "题干", attach=(610, 300))
oval(720, 130, "题型", attach=(720, 300))
oval(830, 130, "答案", attach=(790, 275))
oval(520, 195, "解析", attach=(530, 300))
oval(640, 195, "核验状态", attach=(620, 300))
oval(760, 195, "难度", attach=(660, 310))
oval(390, 250, "出处", attach=(480, 320))
# 选项
oval(280, 735, "选项标号", key=True, attach=edge_point(*E_OPT, "bottom", 0.2))
oval(420, 735, "选项内容", attach=edge_point(*E_OPT, "bottom", 0.85))
# 核验记录
oval(520, 870, "记录号", key=True, attach=edge_point(*E_REV, "bottom", 0.08))
oval(650, 870, "原状态", attach=edge_point(*E_REV, "bottom", 0.4))
oval(770, 870, "新状态", attach=edge_point(*E_REV, "bottom", 0.72))
oval(890, 870, "核验人", attach=edge_point(*E_REV, "bottom", 0.98))
# 用户
oval(1310, 255, "用户号", key=True, attach=edge_point(*E_USER, "right", 0.1))
oval(1310, 310, "设备标识", attach=edge_point(*E_USER, "right", 0.5))
oval(1310, 365, "昵称", attach=edge_point(*E_USER, "right", 0.9))
# 作答（联系属性，2×2）
oval(710, 195, "作答内容", attach=(768, 280))
oval(810, 195, "正误", attach=(790, 275))
oval(710, 250, "作答模式", attach=(772, 285))
oval(810, 250, "作答时间", attach=(790, 280))
# 搜题日志（右侧竖排，避开顶部标题）
oval(1700, 55, "日志号", key=True, attach=edge_point(*E_LOG, "right", 0.05))
oval(1700, 110, "原始输入", attach=edge_point(*E_LOG, "right", 0.3))
oval(1700, 165, "输入类型", attach=edge_point(*E_LOG, "right", 0.55))
oval(1700, 220, "判定类型", attach=edge_point(*E_LOG, "right", 0.8))
oval(1700, 275, "Top1得分", attach=edge_point(*E_LOG, "right", 0.98))
# 会话
oval(1660, 450, "会话号", key=True, attach=edge_point(*E_SESS, "right", 0.1))
oval(1660, 505, "标题", attach=edge_point(*E_SESS, "right", 0.5))
oval(1660, 560, "创建时间", attach=edge_point(*E_SESS, "right", 0.9))
# 消息
oval(1670, 695, "消息号", key=True, attach=edge_point(*E_MSG, "right", 0.1))
oval(1670, 750, "角色", attach=edge_point(*E_MSG, "right", 0.5))
oval(1670, 805, "内容", attach=edge_point(*E_MSG, "right", 0.9))
# 上传文档
oval(1280, 1040, "上传号", key=True, attach=edge_point(*E_UP, "bottom", 0.08))
oval(1410, 1040, "文件名", attach=edge_point(*E_UP, "bottom", 0.4))
oval(1540, 1040, "文件类型", attach=edge_point(*E_UP, "bottom", 0.72))
oval(1670, 1040, "提取摘要", attach=edge_point(*E_UP, "bottom", 0.98))

# ------------------------------------------------------------------
# 标题 + 图例
# ------------------------------------------------------------------
parts.append(
    f'<text x="{W/2}" y="42" text-anchor="middle" font-size="22" font-weight="bold" '
    f'font-family="{FONT}" fill="#111827">问径 · 408 智能体　全局 E-R 图（概念结构设计）</text>'
)
parts.append(
    f'<text x="{W/2}" y="66" text-anchor="middle" font-size="12" '
    f'font-family="{FONT}" fill="#6b7280">你说的都队 · 周玘晖 · 2026-11　（Chen 记法：矩形=实体，双矩形=弱实体，菱形=联系，双菱形=标识联系，椭圆=属性，下划线=键，数字=基数）</text>'
)

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
    f'font-family="{FONT}">'
    f'<rect width="{W}" height="{H}" fill="#ffffff"/>'
    + "".join(parts)
    + "</svg>"
)

out = __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0] if False else None
import os

target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "er-diagram.svg")
with open(target, "w", encoding="utf-8") as f:
    f.write(svg)
print(f"written: {target}  ({len(svg)} bytes)")
