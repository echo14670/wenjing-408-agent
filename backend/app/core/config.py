"""后端配置：全部从环境变量读取，配合 backend/.env 使用（.env 不入库）。"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

# backend/app/core/config.py -> backend/
BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv() -> None:
    """按 backend/.env 加载本地环境变量；没有 python-dotenv 时静默跳过。"""
    try:
        from dotenv import load_dotenv
    except Exception:  # noqa: BLE001
        return
    env_file = BACKEND_ROOT / ".env"
    if env_file.exists():
        load_dotenv(env_file, override=False)


def _str(name: str, default: str = "") -> str:
    value = os.getenv(name)
    return value if value not in (None, "") else default


def _float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw in (None, ""):
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw in (None, ""):
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw in (None, ""):
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    """运行期配置。检索阈值集中在这里，便于 QA 调参与演示现场微调。"""

    def __init__(self) -> None:
        _load_dotenv()

        # ---- 服务 ----
        self.app_name: str = _str("APP_NAME", "问径 · 408 智能体后端")
        self.host: str = _str("HOST", "0.0.0.0")
        self.port: int = _int("PORT", 8000)
        self.debug: bool = _bool("DEBUG", False)

        cors = _str("CORS_ORIGINS", "http://localhost:5173")
        self.cors_origins: list[str] = [o.strip() for o in cors.split(",") if o.strip()]

        # ---- 题库 ----
        self.question_bank_path: Path = Path(
            _str("QUESTION_BANK_PATH", str(BACKEND_ROOT / "data" / "questions.json"))
        )

        # ---- 上传解析（解析链路，高一鹏）----
        # 单文件大小上限（字节），默认 20MB。
        self.max_upload_bytes: int = _int("MAX_UPLOAD_BYTES", 20 * 1024 * 1024)
        # 允许上传的扩展名（小写，含点），逗号分隔。
        _upload_exts = _str(
            "ALLOWED_UPLOAD_EXTENSIONS",
            ".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.pptx,.txt,.md,.markdown,.json,.csv",
        )
        self.allowed_upload_extensions: set[str] = {
            e.strip().lower() for e in _upload_exts.split(",") if e.strip()
        }

        # ---- 检索阈值（三态判定）----
        # 归一化后的综合分落在 [0, 1]。调大 ORIGINAL 会让原题判定更保守（更不容易误判）。
        self.original_threshold: float = _float("SEARCH_ORIGINAL_THRESHOLD", 0.72)
        self.similar_threshold: float = _float("SEARCH_SIMILAR_THRESHOLD", 0.45)
        # 相似题列表的单条门槛：低于此分的不展示，避免「题库没收录」时硬凑一屏无关题。
        self.similar_item_min_score: float = _float("SEARCH_SIMILAR_ITEM_MIN_SCORE", 0.35)
        self.max_similar: int = _int("SEARCH_MAX_SIMILAR", 5)
        self.max_input_length: int = _int("SEARCH_MAX_INPUT_LENGTH", 4000)

        # 未核验题目的处置策略：
        #   downgrade（默认）——未核验 / 有争议的题目不判 original，降级为 similar，守住防幻觉红线；
        #   allow          ——仅按相似度判定，不区分核验状态（如需放宽由 TL 决定并同步文档）。
        self.unverified_policy: str = _str("SEARCH_UNVERIFIED_POLICY", "downgrade").lower()
        if self.unverified_policy not in {"downgrade", "allow"}:
            self.unverified_policy = "downgrade"

        # ---- 大模型（Agent 链路，本模块暂不使用）----
        self.llm_api_key: str = _str("LLM_API_KEY", "")
        self.llm_base_url: str = _str("LLM_BASE_URL", "")
        self.llm_model: str = _str("LLM_MODEL", "")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
