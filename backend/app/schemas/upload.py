"""/api/upload 出参模型 —— 严格对齐 Apifox 契约。

契约（Apifox · 文件上传）：
    响应 { "task_id": str, "extracted_text": str, "failure_details": [] }

`failure_details` 为字符串数组，每项是一条自包含的失败描述（含页码/文件定位），
与前端 normalize.js 的 asStringArray 直接对齐。任何字段变更需先报备 TL。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    """文件上传解析出参。"""

    task_id: str = Field(..., description="本次导入任务 ID（task_ + 随机串）")
    extracted_text: str = Field("", description="提取出的全部纯文本")
    failure_details: list[str] = Field(
        default_factory=list,
        description="逐项失败信息；无失败时为空数组",
    )
