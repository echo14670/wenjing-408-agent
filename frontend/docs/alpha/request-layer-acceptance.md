# 请求层与运行状态验收（TD-02 / §3.7）

> 负责人：郑志銮 · 记录日期：2026-11-13
> 代码基线：`main@4705d33`（#20 已合并、#22 已合并后的主干）
> 分支：`feature/frontend-request-layer-td02`
> 状态口径：**已开发 / 已自验 / 已提交 PR / 已合并 / 已上线 / 已验证** 分开记录，不混写。

| 事项 | 状态 |
| --- | --- |
| 单一请求客户端（TD-02） | 已开发、已自验 |
| 取消 / 超时 / multipart / 错误 / 重试信息 | 已开发、已自验 |
| 兼容入口（`request.js` / `http.js`） | 已开发、已自验 |
| 本文件与证据 | 已产出 |
| 合入主干 | **待评审**（未合并） |
| 线上版本 | **未上线**（部署由 H 包负责，本包不宣称已生效） |

---

## 1. 范围与边界

本包只做**请求层与运行状态**，接续 #20，不重复开发其成果：

- **保留不动**：#20 的 `errors.js` 错误形状、`paths.js` 路径登记、`health.js` 三态读取、侧栏模型状态。
- **本包新增**：消除两个 axios 实例；统一超时/取消/multipart/重试信息；旧入口改为纯转发；补充取消语义与 `Retry-After` 解析；补请求层验收脚本与证据。
- **不在本包**：个人资料管理（P 包 · 高一鹏）、练习页业务与 `useAnswerFlow`（F 包 · 王翔鹏）、历史 store（B 包 · 龚巍斌）、公共外壳（TD-01 · 黄俊凡）、部署与线上（H 包 · 林子涵）。

## 2. 改造前的问题（可核对）

| 问题 | 位置 | 说明 |
| --- | --- | --- |
| 两个 axios 实例 | `src/api/request.js`、`src/api/http.js` | 各自 `axios.create()`，超时分别为 15s / 10s |
| 传输规则重复 | 同上 | 各自维护 JSON 头；上传处逐个写 `headers: { 'Content-Type': undefined }` 打补丁 |
| 取消被当成故障 | `errors.js` | `ERR_CANCELED` 无 `response`，落到 `kind='network'`，界面显示“网络不可达” |
| 重试信息不全 | `errors.js` | 只读响应体 `retry_after_seconds`，忽略 `Retry-After` 响应头 |
| 路径仍有硬编码 | `api/practice.js` | `/recommend`、`/question/{id}` 未走 `API_PATHS` |

## 3. 改造后的结构

```
组件 / store
   │
   ├── api/search.js ─┐
   ├── api/chat.js ───┤
   ├── api/upload.js ─┤
   ├── api/endpoints.js ─┤──► api/client.js（唯一 axios 实例）
   ├── api/health.js ─┤        ├─ baseURL: /api
   └── api/practice.js ┘        ├─ timeout: 10s（调用方可覆盖）
                                └─ 错误 → errors.js:toAppError()
                                     │
api/request.js（旧默认导入）──纯转发──┘
api/http.js（旧命名导入）────再导出──┘
```

### 3.1 唯一客户端 `src/api/client.js`

- 只在此处 `axios.create()`；`test:request` 会扫描 `src/**`，出现第二处即失败。
- **故意不设默认 `Content-Type`**：普通对象由 axios 自动用 `application/json`，`FormData` 自动用带 boundary 的 `multipart/form-data`。写死 JSON 头会让 axios 把 FormData 序列化成 JSON，上传直接 422。
- 错误统一经 `toAppError()`，调用方只处理 `AppError`。

### 3.2 传输规则

| 规则 | 实现 | 验证 |
| --- | --- | --- |
| 默认超时 | `REQUEST_TIMEOUT_MS = 10s` | 配置读取 |
| 答疑长超时 | `chatRequest` 覆盖为 `CHAT_TIMEOUT_MS = 120s` | 捕获 config.timeout |
| health 短超时 | `refreshHealth` 覆盖为 5s | 捕获 config.timeout |
| 取消 | 透传 `AbortSignal`；映射为 `kind='canceled'`、`code='CANCELED'` | 真实中断 |
| multipart | 不预设 Content-Type，调用处不再打补丁 | 真实往返，服务端收到 boundary |
| 重试信息 | `retryable` + `retryAfterSeconds`（响应体优先，其次 `Retry-After` 头） | 503 桩（30 秒）+ 真实 503 |
| 错误文案 | 400/413/415/422/500/502/503 均有兜底；HTML 错误页不进 `message` | 真实往返 |

### 3.3 兼容入口

- `api/request.js`：默认导出可调用函数，带 `.get/.post/.put/.patch/.delete`；**不建实例、不定超时、不挂错误转换器**，全部转到 `client.js`。保留 `defaults` / `interceptors` 指向同一份对象，供现有测试与调试读取。
- `api/http.js`：只再导出 `http / request / withSignal / toAppError / isCanceled`。
- 三个旧业务模块（`search.js`、`chat.js`、`upload.js`）已改为直接使用 `client.js`，组件层零改动。
- 计划在 11/18 迁移窗口（与 F/P 包集成回归后）删除两个兼容文件，届时同步更新 `scripts/test-contract.mjs`、`scripts/g-evidence.mjs` 的引用。

### 3.4 固定对外签名（本次提交起不变）

| 函数 | 签名 | 返回 / 异常 |
| --- | --- | --- |
| `request` | `request(config) => Promise<any>` | 响应体；异常为 `AppError` |
| `http` | axios 实例 | 供少数需要实例配置的场景 |
| `withSignal` | `withSignal(signal) => { signal } \| {}` | 展开进 config |
| `searchQuestion` | `(payload, { mock='auto', signal })` | `{match_type, question_data, similar_questions, source}` |
| `chatRequest` | `(payload, { signal })` | `{reply, tool_result, citations, source}` |
| `uploadFile` | `(file, { signal })` | `{task_id, extracted_text, failure_details, source}` |
| `sendChat` / `endpoints.searchQuestion` / `endpoints.uploadFile` | 维持 #20 后现状 | 领域模型（camelCase），供 F 包使用 |
| `toAppError` / `isCanceled` / `errorText` / `uploadErrorInfo` | 维持 #20 后现状，`isCanceled` 为新增 | — |
| `legacyRequest`（`api/request.js` 默认导出） | `(config)` / `.post(url, data, config)` 等 | 与 `request` 相同 |

### 3.5 取消的接入范围

- 已接入：`store/search.js` + `SearchView.vue`。重复提交或离开页面时 `abort()` 上一次检索；取消**不写 `search.error`**，界面不显示失败。
- 已具备但未接入：答疑页。`useAnswerFlow` 目前用 `sequence++` 作废旧响应，没有真正 `abort()`；请求层已支持 `signal`，待 F 包（王翔鹏）接入，避免跨归属改动。
- `errors.js` 已提供 `isCanceled()`，其他页面接入时按同一判断处理。

## 4. 验证矩阵

证据目录：`frontend/docs/evidence-request/`
复跑：`cd frontend && npm run test:request`

| # | 用例 | 方式 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 1 | 正常检索 | 真实后端 `main@4705d33`（81 题）+ 浏览器 | 200、`match_type=original`、`source=backend` | 通过 | `real-backend.json` → `search_original`；`search-original.png` |
| 2 | 空结果 | 真实后端无关输入 + 本地真实 HTTP 200 空载荷 | 200、`miss`、`question_data=null`，不抛错 | 通过 | `real-backend.json` → `search_miss`；测试日志 |
| 3 | 400 空文件 | 真实后端 + 浏览器上传 | `empty_file` / “文件为空” | 通过 | `real-backend.json`；`upload-400.png` |
| 4 | 413 超限 | 真实后端（21MB）+ 浏览器 | `file_too_large` / “文件超过大小限制（上限 20MB）” | 通过 | 同上；`upload-413.png` |
| 5 | 415 类型 | 真实后端（`.bin`）+ 浏览器 | `unsupported_type` / “不支持的文件类型：.bin” | 通过 | 同上；`upload-415.png` |
| 6 | 422 校验 | 真实后端缺 `raw_input`；本地 HTTP 数组 detail | `validation_error`，消息合并，不显示 HTML | 通过 | `real-backend.json` → `search_422`；测试日志 |
| 7 | 502 | 本地真实 HTTP | 可读文案 + `retryable=true` | 通过 | 测试日志 |
| 8 | 503 | 真实后端（未配置 `LLM_API_KEY`）+ 浏览器；本地桩带 `Retry-After: 30` | 页面显示可读原因并可重试；`retryAfterSeconds=30` | 通过 | `real-backend.json` → `chat_503`；`search-original.png`（页面右下错误卡）；测试日志 |
| 9 | 网络错误 | 本地服务端 RST | `kind=network`、`code=NETWORK` | 通过 | 测试日志 |
| 10 | 超时 | 本地挂起响应 + 150ms 超时 | `kind=timeout`，文案含毫秒 | 通过 | 测试日志 |
| 11 | 取消 | 真实 `AbortController` | `kind=canceled`；“请求已取消”，不含“网络/失败” | 通过 | 测试日志 |
| 12 | 取消不污染 store | `store/search.runSearch({signal})` | `error=null`、`loading=false` | 通过 | 测试日志 |
| 13 | multipart | 真实往返 | 服务端收到 `multipart/form-data; boundary=…` | 通过 | 测试日志 |
| 14 | 单一实例 | 源码扫描 | `axios.create` 仅 `client.js`；无其他 `from 'axios'` | 通过 | 测试日志 |
| 15 | 生产默认 | `npm run build` + `vite preview` + 浏览器 | 无开发面板、无“演示数据”标、请求 `/api/search` 200 | 通过 | `prod-default-backend.png` |
| 16 | 显式演示 | `searchQuestion(..., {mock:'original'})` | 返回 `local-demo`，不发起真实请求 | 通过 | 测试日志 |

### 4.1 关于 502/503 的口径

- 真实后端 503 的响应体为 `{"detail":{"code":"llm_not_configured","message":"未配置 LLM_API_KEY…","retryable":false}}`，**没有 `Retry-After` 头**；前端按 `retryable=false` 展示，不提示“可重试”。
- `Retry-After` 头的解析用本地契约桩（`503` + `Retry-After: 30`）验证，属于前端侧能力验证，不代表后端已返回该头。需要 C 包在 502/503 时补该头，前端无需再改。

### 4.2 未覆盖 / 风险

1. **未做双浏览器**：只在本机 Chromium 内核（夸克）+ 生产构建预览验证；Edge/Firefox 由 K 包（沈雷）统一回归。
2. **未上线**：本包只到合并前；线上是否生效由 H 包发布记录证明。
3. **兼容文件仍在**：`request.js` / `http.js` 是可删除的薄转发，11/18 前清理；在此之前不要在新代码里引用。
4. **答疑页取消**：请求层已支持，页面侧待 F 包接入；当前 `sequence++` 能避免串题，但不会真正断开连接。
5. **health 字段**：`llm_configured/llm_model` 仍缺（C 包），侧栏显示“模型状态未知”属预期，不是本包缺陷。

## 5. #20 回归结论

- `test:contract` 17 项全绿，含：上传 415 保留 `detail` 文案、400/413/415 业务码、`SearchView` 415 文案、health 三态、侧栏渲染、`API_PATHS` 登记。
- 错误形状未变：`kind/code/status/detail/message`（+ 可选 `retryable/retryAfterSeconds`），`AnswerPanel` 等旧调用方无需改动。
- `API_PATHS` 未改；`practice.js` 改用 `API_PATHS.recommend` 与 `questionPath()`，路径行为不变。

## 6. 测试与构建

```
test:chunk        15 通过
test:chunk-pro    43 通过
test:practice     53 通过
test:contract     17 通过
test:answer-flow  12 通过
test:request      17 通过（本包新增）
合计             157 通过 / 0 失败
npm run build     ✓（dist 正常产出）
```

## 7. 进度登记（供黄俊凡汇总，可直接粘贴）

| 日期 | 成员／任务包 | 完成及证据 | 下一步 | 阻碍 | 预计剩余小时 |
| --- | --- | --- | --- | --- | ---: |
| 2026-11-13 | 郑志銮 / G→TD-02 | 单一客户端 + 取消/超时/multipart/重试信息；`docs/alpha/request-layer-acceptance.md`、`docs/evidence-request/`；157 项测试与构建通过 | 与 F/P 包集成后删兼容入口 | 答疑页取消需 F 包接 `signal`；503 的 `Retry-After` 需 C 包补 | 6 |

个人体会（约 180 字，可直接用）：
> 这次把“两套请求栈”真正合到一起，才发现之前很多“偶发问题”其实是规则重复：两个实例各有超时、各有请求头，上传还要在每个调用处手动抹掉 JSON 头。合并后我刻意没有设默认 Content-Type，让 axios 按数据类型决定，multipart 就不再需要补丁。取消这块也修正了一个认知：取消没有 response，旧代码会把它当网络故障，用户看到的是“网络不可达”。现在单独给了 `canceled` 类型，页面可以静默忽略。教训是“统一”不能只统一错误形状，传输规则本身也要只有一份，否则迟早分叉。

## 8. 复跑命令

```bash
cd frontend
npm install
npm run test:request     # 请求层 17 项（自带本地真实 HTTP 服务，不依赖后端）
npm run test:slow        # contract + request + answer-flow
npm test                 # 全部 157 项
npm run build
```

真实后端对照（可选）：

```bash
cd backend && .venv/Scripts/python -m uvicorn main:app --port 8000
cd frontend && npm run dev -- --port 5173
# 浏览器打开 http://127.0.0.1:5173/#/
```
