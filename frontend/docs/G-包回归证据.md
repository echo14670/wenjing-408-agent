# G 包回归证据（郑志銮 · BUG-07 / BUG-08 / 接口层）

> 基线：`main@f4606f6`（2026-11-08）
> 生成时间：2026-11-09
> 用途：交沈雷（K 包）归档，复测 BUG-07、BUG-08 与接口层统一改造
> 环境：Windows / Node 22.22.2 / Python 3.13.14 / 后端 `uvicorn 127.0.0.1:8000` / 前端 `vite 127.0.0.1:5173`（`/api` 反代到 8000）

## 一、上传错误展示（BUG-07）

### 1.1 后端真实响应（本地 main，81 题）

| 用例 | 请求 | HTTP | 响应体 |
| --- | --- | --- | --- |
| 不支持类型 | `curl -F file=@bad.bin /api/upload` | **415** | `{"detail":{"code":"unsupported_type","message":"不支持的文件类型：.bin"}}` |
| 空文件 | `curl -F file=@empty.txt /api/upload` | **400** | `{"detail":{"code":"empty_file","message":"文件为空"}}` |
| 超限（21 MB） | `curl -F file=@big.txt /api/upload` | **413** | `{"detail":{"code":"file_too_large","message":"文件超过大小限制（上限 20MB）"}}` |

机器可读版本：`evidence-g/upload-api-checks.json`

### 1.2 前端页面实际展示（浏览器真实点击，非设计稿）

| 用例 | 页面文案 | 错误码标签 | 截图 |
| --- | --- | --- | --- |
| 415 | **不支持的文件类型：.bin** | `unsupported_type` | `evidence-g/upload-415.png` |
| 400 | **文件为空** | `empty_file` | `evidence-g/upload-400.png` |
| 413 | **文件超过大小限制（上限 20MB）** | `file_too_large` | `evidence-g/upload-413.png` |

修复前：三个用例都只显示「请求失败（HTTP 415 / 400 / 413）」，后端 `detail.message` 被旧栈丢弃。
修复后：文案、错误码、HTTP 状态三者一致，页面不再只显示状态码。

机器可读版本：`evidence-g/upload-ui-checks.json`

## 二、学习记录导出 / 清空 / 恢复

命令：`cd frontend && node scripts/g-evidence.mjs`

```json
{
  "history_roundtrip": {
    "exported_bytes": 1200,
    "export_version": 1,
    "before_clear": { "sessions": 1, "messages": 2 },
    "after_clear": { "sessions": 0 },
    "imported_sessions": 1,
    "after_import": {
      "sessions": 1,
      "messages": 2,
      "restoredStem": "某计算机按字节编址，Cache 容量 64KB，主存块大小 64B，四路组相联，地址 32 位。判断“组号占 2 位”。"
    }
  }
}
```

结论：导出 → 清空 → 重新导入后，会话数、消息数、题干均恢复；导出文件为 `version: 1` 的 JSON。

## 三、答疑 `context_chunks` 链路

同一脚本捕获的真实请求体（`/api/chat`）：

```json
{
  "request_url": "/api/chat",
  "request_keys": ["context_chunks", "mode", "question_id", "session_messages", "user_answer"],
  "context_chunk_count": 1,
  "context_chunks": [
    "组相联映射：组数 = 行数 ÷ 路数；组索引位数 = log2(组数)。四路表示每组四条 Cache 行。"
  ],
  "session_message_count": 1,
  "mode": "guided",
  "question_id": null,
  "user_answer": ""
}
```

结论：个人资料（`materials:v1`）进入 `context_chunks`，随答疑请求发出；字段集合与契约一致；未命中原题时 `question_id=null`，不冒充原题。

机器可读版本：`evidence-g/history-and-context.json`

## 四、侧栏模型状态（BUG-08）

`GET /api/health` 的 `llm_configured / llm_model` 由 C 包（周玘晖）按 §3.4-B 提供；G 包只消费。

| 状态 | 触发条件 | 侧栏文案 | 证据 |
| --- | --- | --- | --- |
| 已连接 | `llm_configured: true` + `llm_model: "deepseek-flash"` | **模型已连接（deepseek-flash）** | `evidence-g/sidenav-model-connected.simulated.png`（按契约模拟） |
| 未配置 | `llm_configured: false` | **模型未配置** | `evidence-g/sidenav-model-unconfigured.simulated.png`（按契约模拟） |
| 未知 | 当前 main 无 llm 字段 / 接口不可达 / 字段缺失 | **模型状态未知** | `evidence-g/sidenav-model-unknown.real.png`（真实后端） |

说明：
1. 前两张标注 `simulated`：当前 `main@f4606f6` 的 `/api/health` 还没有 `llm_configured/llm_model`，为验证前端三态，按 §3.4-B 冻结契约用本地桩返回（`/api/health` 字段与契约一致），不代表后端已实现；C 包合入后无需改前端。
2. 第三张是**真实后端**（81 题，无 llm 字段）下的表现：必须是“未知”，不能猜成“已连接”。
3. 状态只读 `llm_configured / llm_model`，不读、不展示 Key；`llm_configured=true` 只表示 Key 已配置，真实可用性以 `/api/chat` 为准（已写进 tooltip）。
4. 演示模式保留：选择本地演示样例时，侧栏额外显示「演示数据」标，避免把样例当真实结果。

## 五、自动化测试

```bash
cd frontend
npm run test:chunk        # 15 passed
npm run test:contract     # 17 passed（新增 6 项：API_PATHS、415 形状一致、400/413/415 映射、SearchView 415、health 三态、侧栏渲染）
npm run test:chunk-pro    # 43 passed
npm run test:answer-flow  # 12 passed
npm run test:practice     # 53 passed
npm run build             # ✓ built
```

合计 **140 项**全绿（第二轮基线 134 项 + 本包新增 6 项）；构建通过。

## 六、复现步骤

1. 后端：`cd backend && .venv/Scripts/python -m uvicorn main:app --port 8000`
2. 前端：`cd frontend && npm run dev`
3. 打开 `http://127.0.0.1:5173/#/` → 「上传题图」→ 选择 `bad.bin` / 空 `txt` / 21MB `txt` → 点「上传并识别」
4. 预期：分别显示 415/400/413 的具体原因与错误码（见 1.2 截图）
5. 学习记录与 `context_chunks`：`node scripts/g-evidence.mjs`，读 `docs/evidence-g/history-and-context.json`

## 七、边界与遗留

- 本轮**不合并**两套请求栈（任务书明确顺延），只统一错误形状：`kind/code/status/detail/message`，可选 `retryable/retryAfterSeconds`。
- `llm_configured/llm_model` 的后端实现属 C 包；C 包未合入前，真实环境显示“未知”是预期行为。
- 上传解析的 `failure_details`、样本清单与资料页闭环属 P 包，本证据不覆盖。
- `practice.js` 的 `/recommend`、`/question/{id}` 路径常量消费由 F 包在 F1 中按约定接入（`API_PATHS` 已导出）。
