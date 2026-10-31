# /api/upload 上传解析接口说明

> 负责人：高一鹏（后端资料处理与工具接口）｜ v1 支持范围与调用/响应样例
> 契约以 [Apifox](https://hr124ptabw.apifox.cn/) 为准；本文说明支持范围与样例，便于联调与验收。

## 一、接口契约

| 项 | 值 |
| :--- | :--- |
| 方法 / 路径 | `POST /api/upload` |
| 请求格式 | `multipart/form-data`，键名 `file` |
| 响应 | `{ "task_id": str, "extracted_text": str, "failure_details": [] }` |

- `task_id`：本次导入任务 ID（`task_` + 随机串），前端用于追踪一次导入。
- `extracted_text`：提取出的全部纯文本（按页/幻灯片加 `【第N页】` 分隔标记）。
- `failure_details`：**字符串数组**，每项是一条自包含的失败描述（含页码/文件定位）；无失败时为空数组 `[]`。与前端 `normalize.asStringArray` 直接对齐。

---

## 二、支持范围（v1）

| 文件类型 | 处理方式 | 说明 |
| :--- | :--- | :--- |
| `.txt` `.md` `.markdown` | 直接读取（UTF-8，回退 GBK） | 无解析成本 |
| `.csv` | 按文本读取 | 不做结构化切题，留给前端预览 |
| `.json` | 题目数组抽取题干；否则返回可读 JSON | 切题/去重/核验留前端 |
| `.pdf`（含文字层） | `pypdf` 逐页提取文字层 | 每页加 `【第N页】` 标记 |
| `.pdf`（扫描/图片版） | 逐页返回失败项 | 不硬上 OCR，交视觉模型 |
| `.pptx` | `python-pptx` 提取文本框 | 依赖已加入 requirements.txt |
| 图片（png/jpg/jpeg/webp/bmp/tif/tiff） | 返回失败项 | 题图识别走 VLM，不在本接口做 OCR |

**明确不做**：题目切分、答案核验、图结构识别、图片 OCR。这些是前端预览/修正与视觉模型的职责。

---

## 三、限制与边界

| 项 | 默认值 | 配置 |
| :--- | :--- | :--- |
| 单文件大小上限 | 20MB | `.env` 的 `MAX_UPLOAD_BYTES` |
| 允许的扩展名 | 见上表 | `.env` 的 `ALLOWED_UPLOAD_EXTENSIONS`（逗号分隔） |
| 超限 / 空文件 / 不支持类型 | 返回 413 / 400 / 415 | 见下方失败样例 |
| 单页失败 | 不影响其他页 | 成功页正常输出，失败页进 `failure_details` |

---

## 四、调用样例（curl）

```bash
# 上传含文字层的 PDF
curl -F "file=@notes.pdf" http://localhost:8000/api/upload

# 上传文本 / Markdown
curl -F "file=@chapter.txt" http://localhost:8000/api/upload

# 上传题图（返回失败项，交视觉模型）
curl -F "file=@question.png" http://localhost:8000/api/upload
```

---

## 五、正常样例（响应 JSON）

**文字型 PDF（含文字层）**

```json
{
  "task_id": "task_e281d6a7747c",
  "extracted_text": "【第1页】\nCache 地址划分：行数 = 容量 ÷ 块大小；…",
  "failure_details": []
}
```

**纯文本 TXT**

```json
{
  "task_id": "task_989cb21e38a5",
  "extracted_text": "这是第一行\n这是第二行 408",
  "failure_details": []
}
```

**JSON 题库（题目数组抽取题干）**

```json
{
  "task_id": "task_abc123456789",
  "extracted_text": "【第1题】\n某计算机按字节编址…\n\n【第2题】\n…",
  "failure_details": []
}
```

---

## 六、失败样例

**空文件 → `400`**

```json
{ "detail": { "code": "empty_file", "message": "文件为空" } }
```

**超限 → `413`**

```json
{ "detail": { "code": "file_too_large", "message": "文件超过大小限制（上限 20MB）" } }
```

**不支持类型 → `415`**

```json
{ "detail": { "code": "unsupported_type", "message": "不支持的文件类型：.bin" } }
```

**扫描版 PDF（无文字层）→ 200 + 失败项**

```json
{
  "task_id": "task_xxxxxxxxxxxx",
  "extracted_text": "",
  "failure_details": [
    "第1页：未提取到文本（可能为扫描图片页），需视觉模型/OCR 处理"
  ]
}
```

**纯图片 → 200 + 失败项**

```json
{
  "task_id": "task_xxxxxxxxxxxx",
  "extracted_text": "",
  "failure_details": [
    "question.png：图片需视觉模型/OCR 识别，未在本接口内处理，请走题图识别流程"
  ]
}
```

**部分页失败（成功页正常输出，失败页进 failure_details）**

```json
{
  "task_id": "task_xxxxxxxxxxxx",
  "extracted_text": "【第1页】\n…正文…",
  "failure_details": [
    "第3页：未提取到文本（可能为扫描图片页），需视觉模型/OCR 处理"
  ]
}
```

---

## 七、依赖配置

- `backend/requirements.txt` 新增：`python-multipart`（form-data 解析）、`pypdf`（PDF 文字提取）、`python-pptx`（PPTX 提取）。
- `backend/.env.example` 新增：`MAX_UPLOAD_BYTES`（大小上限）、`ALLOWED_UPLOAD_EXTENSIONS`（扩展名白名单）。

---

## 八、可执行样例（测试）

`backend/tests/test_upload_api.py` 提供 9 个可执行用例，覆盖文字 PDF、扫描 PDF、损坏 PDF、文本、JSON、图片、不支持类型、空文件、超限，可直接 `pytest tests/test_upload_api.py` 验证。
