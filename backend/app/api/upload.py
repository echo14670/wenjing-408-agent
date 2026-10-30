"""POST /api/upload —— 资料上传解析，返回提取文本与失败项。

契约以 Apifox 为准：请求 form-data 键名 file；响应 task_id / extracted_text / failure_details。
"""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import Settings, get_settings
from app.schemas.upload import UploadResponse
from app.services.parsing import parse_content

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["upload"])


def _ext_of(filename: str) -> str:
    dot = filename.rfind(".")
    return filename[dot:].lower() if dot >= 0 else ""


@router.post("/upload", response_model=UploadResponse)
async def upload(
    file: Annotated[UploadFile, File(...)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> UploadResponse:
    filename = file.filename or "file"
    ext = _ext_of(filename)

    if ext not in settings.allowed_upload_extensions:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "unsupported_type", "message": f"不支持的文件类型：{ext or '未知'}"},
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "empty_file", "message": "文件为空"},
        )
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "code": "file_too_large",
                "message": f"文件超过大小限制（上限 {settings.max_upload_bytes // (1024 * 1024)}MB）",
            },
        )

    task_id = "task_" + uuid.uuid4().hex[:12]
    extracted_text, failures = parse_content(filename, content)
    logger.info(
        "upload task_id=%s ext=%s bytes=%d failures=%d",
        task_id, ext, len(content), len(failures),
    )
    return UploadResponse(
        task_id=task_id,
        extracted_text=extracted_text,
        failure_details=failures,
    )
