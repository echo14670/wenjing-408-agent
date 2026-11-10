# API 契约

线上契约以 [Apifox](https://hr124ptabw.apifox.cn/) 为准。接口字段名和响应结构不得由个人私自修改，契约变更需先报备 TL，再同步更新 Apifox 和本文件。

## 接口总览

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/api/search` | POST | 搜题，返回 `original` / `similar` / `miss` 三态 |
| `/api/chat` | POST | 直接解析或引导式答疑 |
| `/api/upload` | POST | 提取 PDF/文本纯文本，失败如实返回 |
| `/api/recommend` | POST | 同考点推荐（两阶段：考点→章节兜底） |
| `/api/question/{question_id}` | GET | 按稳定题号获取题目详情 |
| `/api/health` | GET | 部署自检（含模型配置状态） |

## 1. 查题 `POST /api/search`

请求：

```json
{ "raw_input": "32位物理地址Cache……", "input_type": "text" }
```

响应（原题命中）：

```json
{
  "match_type": "original",
  "question_data": {
    "question_id": "COP006", "subject": "计算机组成原理", "chapter": "存储器层次结构",
    "stem": "……", "options": ["A. …", "B. …"], "answer": "A", "solution": "……",
    "review_state": "verified", "source_ref": "……"
  },
  "similar_questions": []
}
```

三态互斥：`original` 返回 `question_data` 且 `similar_questions=[]`；`similar` 的 `question_data=null`；`miss` 两者为空。`raw_input` 空白/超 4000 字返回 422。

## 2. 答疑 `POST /api/chat`

请求：

```json
{
  "session_messages": [{"role": "user", "content": "为什么第三步这样算？"}],
  "question_id": "COP006",
  "user_answer": "因为四路，组号占2位",
  "mode": "guided",
  "context_chunks": ["个人资料切片1", "个人资料切片2"]
}
```

响应：

```json
{
  "reply": "……",
  "tool_result": "cache_lines: 512; sets: 128; group_bits: 7; associativity: 4",
  "citations": ["题库来源（已核验）"]
}
```

- `mode` 仅 `direct` / `guided`；`guided` 初始不泄答案、完整解析与工具结果，用户主动查看后才展示。
- `question_id` 在 `miss` 场景可为 `null`。
- 可选请求头 `X-User-LLM-Key`（用户自带 Key，不写日志、不持久化）。
- 未配置 Key → `503 llm_not_configured`；上游失败/超时 → `502 llm_upstream_error`，二者 `detail` 均含 `code/message/retryable/retry_after_seconds`（`Retry-After` 头同步）。

## 3. 上传解析 `POST /api/upload`

请求：`multipart/form-data`，键名 `file`。

响应：

```json
{ "task_id": "task_xxx", "extracted_text": "【第1页】……", "failure_details": ["第3页：未提取到文本（可能为扫描图片页），需视觉模型/OCR 处理"] }
```

`failure_details` 为 `string[]`（自包含失败描述，含页码/文件定位），无失败为空数组。错误结构统一为 `detail={code, message}`：

| 状态码 | code | message 示例 |
| --- | --- | --- |
| 400 | `empty_file` | 文件为空 |
| 413 | `file_too_large` | 文件超过大小限制（上限 20MB） |
| 415 | `unsupported_type` | 不支持的文件类型：.bin |

## 4. 同考点推荐 `POST /api/recommend`

请求：

```json
{ "question_id": "COP006", "done_question_ids": [], "top_k": 3, "include_unverified": false }
```

响应：

```json
{
  "questions": [ { "question_id": "COP005", "subject": "…", "chapter": "…", "stem": "…", "options": [], "answer": "…", "solution": "…", "review_state": "verified", "source_ref": "…" } ],
  "scope": "knowledge_point",
  "notice": ""
}
```

- `questions[]` 复用 `question_data` 的 9 字段（不含 `knowledge_points/difficulty`）。
- `scope`：`knowledge_point`（同考点）/ `chapter`（同章节兜底）/ `none`（空候选）。
- 排除当前题与 `done_question_ids` 已做题；仅取 `verified`；`include_unverified=true` 时兜底未核验题并附 `notice`。
- 空候选返回 `questions: []` 与 `scope: none`，不硬凑、不回 mock。

## 5. 题目详情 `GET /api/question/{question_id}`

响应：

```json
{ "question_data": { "question_id": "COP006", "subject": "…", "chapter": "…", "stem": "…", "options": ["…"], "answer": "A", "solution": "…", "review_state": "verified", "source_ref": "…" } }
```

- `question_data` 结构与 `/api/search` 原题命中一致。
- 未命中返回 `404`，`detail={"code":"question_not_found","message":"题目不存在：COP999"}`；不传/空值 404，不做模糊匹配。

## 6. 部署自检 `GET /api/health`

```json
{
  "status": "ok", "questions": 81,
  "by_subject": { "数据结构": 20, "计算机组成原理": 20, "操作系统": 21, "计算机网络": 20 },
  "by_review_state": { "verified": 11, "pending": 70 },
  "skipped": [], "tokenizer": "jieba", "indexed": 81,
  "llm_configured": true, "llm_model": "deepseek-flash"
}
```

- `llm_configured` = `LLM_API_KEY` 非空；`llm_model` = `LLM_MODEL`；**严禁返回 Key**。模型可用性以 `/api/chat` 实际调用为准。

## 统一错误结构

业务错误统一 `detail={code, message, [retryable, retry_after_seconds]}`；前端从 `err.detail.message` 取文案，不允许只显示 HTTP 状态码。422 为参数校验错误（数组结构），404/405 为字符串，OpenAPI 当前只声明 422。
