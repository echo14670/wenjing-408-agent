# API 契约

线上契约以 [Apifox](https://hr124ptabw.apifox.cn/) 为准。接口字段名和响应结构不得由个人私自修改，契约变更需先报备 TL，再同步更新 Apifox 和本文件。

本文列出仓库当前的接口和 C 包待实现的契约。线上可用范围以对应部署版本为准。

## 接口总览

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/api/search` | POST | 搜题，返回 `original` / `similar` / `miss` 三态 |
| `/api/chat` | POST | 直接解析或引导式答疑 |
| `/api/upload` | POST | 提取含文字层的 PDF 等资料文本，按页或文件返回失败信息 |
| `/api/recommend` | POST | 同考点推荐已实现，待录入 Apifox |
| `/api/question/{question_id}` | GET | C 包待实现，按稳定题号获取题目详情 |
| `/api/health` | GET | 题库与索引自检已实现，模型配置字段待 C 包扩展 |

## 1. 查题 `POST /api/search`

以下请求使用 v1.1 中已核验的 COP006 完整题干。

```json
{
  "raw_input": "某计算机主存地址 32 位、按字节编址，Cache 数据区容量 32 KB，采用 4 路组相联映射，块大小 64 B。则块内偏移、组索引、标记字段的位数分别是（　）。",
  "input_type": "text"
}
```

原题命中的响应示例

```json
{
  "match_type": "original",
  "question_data": {
    "question_id": "COP006",
    "subject": "计算机组成原理",
    "chapter": "存储器层次结构",
    "stem": "某计算机主存地址 32 位、按字节编址，Cache 数据区容量 32 KB，采用 4 路组相联映射，块大小 64 B。则块内偏移、组索引、标记字段的位数分别是（　）。",
    "options": [
      "A. 6、7、19",
      "B. 6、8、18",
      "C. 5、7、20",
      "D. 6、9、17"
    ],
    "answer": "A",
    "solution": "行数 = 32 KB/64 B = 512；组数 = 512/4 = 128 = 2⁷，组索引 7 位；块内偏移 6 位；标记 = 32 - 7 - 6 = 19 位。",
    "review_state": "verified",
    "source_ref": "自拟（与 PPT 第 9 页演示案例同构、参数不同；按唐朔飞教材 Cache 映射知识点）"
  },
  "similar_questions": []
}
```

`original` 返回 `question_data` 和空的 `similar_questions`。相似题将 `question_data` 置为 `null`，候选只包含 `question_id`、`subject`、`stem`、`source_ref`。未命中返回 `question_data: null` 与 `similar_questions: []`。空白或超过 4000 字的 `raw_input` 返回 422。参数校验和三态判定详见[题库设计](question-bank-design.md)。

## 2. 答疑 `POST /api/chat`

请求：

```json
{
  "session_messages": [{"role": "user", "content": "为什么第三步这样算？"}],
  "question_id": "COP006",
  "user_answer": "因为四路，组号占2位",
  "mode": "guided",
  "context_chunks": ["组数等于 Cache 总行数除以每组行数。"]
}
```

首次引导的响应示例

```json
{
  "reply": "四路表示每组有四行。先算出总行数，再求组数。",
  "tool_result": "",
  "citations": ["用户提供的个人资料切片"]
}
```

- `mode` 接受 `direct` 或 `guided`。首次引导给出提示，`tool_result` 为空字符串。主动查看答案后可以展示完整解析与工具结果。
- `question_id` 在 `miss` 场景可为 `null`。
- 没有题库命中且个人资料切片为空时，由后端直接返回资料不足说明，工具结果和引用为空。
- 可选请求头 `X-User-LLM-Key`（用户自带 Key，不写日志、不持久化）。
- 需要调用模型而有效 Key 或模型名缺失时，返回 `503 llm_not_configured`。响应的 `detail` 包含 `code`、`message`、`retryable: false`。
- 模型上游失败或超时时，返回 `502 llm_upstream_error`。响应的 `detail` 包含 `code`、`message`、`retryable: true`、`retry_after_seconds: 5`，并带 `Retry-After: 5` 响应头。

## 3. 上传解析 `POST /api/upload`

请求：`multipart/form-data`，键名 `file`。

响应：

```json
{ "task_id": "task_xxx", "extracted_text": "【第1页】……", "failure_details": ["第3页：未提取到文本（可能为扫描图片页），需视觉模型/OCR 处理"] }
```

`failure_details` 为 `string[]`，失败描述会注明页码或文件。图片和无文字层的扫描页返回失败项。无失败时为空数组。上传业务错误使用 `detail={code, message}`，支持范围详见[上传接口说明](upload-api.md)。

| 状态码 | code | message 示例 |
| --- | --- | --- |
| 400 | `empty_file` | 文件为空 |
| 413 | `file_too_large` | 文件超过大小限制（上限 20MB） |
| 415 | `unsupported_type` | 不支持的文件类型：.bin |

## 4. 同考点推荐 `POST /api/recommend`

下列示例在 v1.1 题库中从 COP006 推荐一道题。COP005 与 COP006 同章节，考点字段各自独立，因此本例的 `scope` 为 `chapter`。

```json
{
  "question_id": "COP006",
  "done_question_ids": [],
  "top_k": 1,
  "include_unverified": false
}
```

```json
{
  "questions": [
    {
      "question_id": "COP005",
      "subject": "计算机组成原理",
      "chapter": "存储器层次结构",
      "stem": "某计算机主存容量 1 GB、按字节编址，Cache 数据区容量 64 KB，块大小 64 B，采用直接映射。主存地址中块内偏移、Cache 块号、标记字段的位数依次为（　）。",
      "options": [
        "A. 6、10、14",
        "B. 6、16、8",
        "C. 10、6、14",
        "D. 6、14、10"
      ],
      "answer": "A",
      "solution": "块内偏移 = log₂64 = 6 位；Cache 块数 = 64 KB/64 B = 1024 = 2¹⁰，块号 10 位；主存按 64 B 分块共 2²⁴ 块，标记 = 24 - 10 = 14 位。",
      "review_state": "verified",
      "source_ref": "自拟（按唐朔飞《计算机组成原理》第3版·Cache 映射知识点，换参数）"
    }
  ],
  "scope": "chapter",
  "notice": ""
}
```

- `questions[]` 复用 `question_data` 的 9 个字段。
- `scope` 取 `knowledge_point`（同考点）、`chapter`（同章节兜底）或 `none`（空候选）。
- 后端排除当前题及 `done_question_ids` 中的题。每层召回默认使用已核验题。`include_unverified=true` 时，该层没有已核验候选才会返回未核验候选，并通过 `notice` 提示。
- 两层都没有候选时，接口返回 `questions: []` 和 `scope: none`。F 包接入真实接口时以这个响应渲染空态。

## 5. 题目详情 `GET /api/question/{question_id}`（C 包待实现）

本节是已约定的接入契约。当前后端尚未注册此路由，C 包合入后按以下格式联调。

计划响应示例

```json
{ "question_data": { "question_id": "COP006", "subject": "…", "chapter": "…", "stem": "…", "options": ["…"], "answer": "A", "solution": "…", "review_state": "verified", "source_ref": "…" } }
```

- `question_data` 结构与 `/api/search` 原题命中一致。
- 计划按稳定题号精确匹配。题号不存在时返回 404，响应为 `{"detail":{"code":"question_not_found","message":"题目不存在：COP999"}}`。缺失路径段时按路由 404 处理。

## 6. 部署自检 `GET /api/health`

下例来自本地后端加载 v1.1 题库并安装 jieba 的情况。

```json
{
  "status": "ok",
  "questions": 81,
  "by_subject": {
    "数据结构": 20,
    "计算机组成原理": 20,
    "操作系统": 21,
    "计算机网络": 20
  },
  "by_review_state": {
    "verified": 11,
    "pending": 70
  },
  "skipped": [],
  "tokenizer": "jieba",
  "indexed": 81
}
```

C 包计划扩展 `llm_configured`（服务端配置的 `LLM_API_KEY` 是否非空）和 `llm_model`（`LLM_MODEL` 的值）。Key 不进入响应。当前后端缺少这两个字段，前端显示模型状态未知。模型调用以 `/api/chat` 实测为准。

## 统一错误结构

业务错误的 HTTP 响应体使用 `detail.code` 和 `detail.message`。答疑错误另外提供第 2 节列出的重试字段。参数校验 422 的 `detail` 为数组。框架处理的路由 404 和方法 405 使用字符串 `detail`，第 5 节的业务 404 计划使用对象 `detail`。前端根据收到的结构提取说明。
