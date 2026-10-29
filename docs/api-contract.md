# API 契约

线上契约以 [Apifox](https://hr124ptabw.apifox.cn/) 为准。

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/api/search` | POST | 搜题并返回 `original`、`similar` 或 `miss` 三态 |
| `/api/chat` | POST | 直接解析或引导式答疑 |
| `/api/upload` | POST | 提取 PDF/图片文本并返回处理摘要 |

接口字段名和响应结构不得由个人私自修改。契约变更需先报备 TL，再同步更新 Apifox 和本文件。

## `/api/chat` 当前契约

请求：

```json
{
  "session_messages": [
    {"role": "user", "content": "为什么第三步这样算？"}
  ],
  "question_id": "Q001",
  "user_answer": "因为四路，组号占2位",
  "mode": "guided",
  "context_chunks": ["个人资料切片1", "个人资料切片2"]
}
```

响应：

```json
{
  "reply": "先计算 Cache 行数，再计算组数和组索引位数。",
  "tool_result": "cache_lines: 1024; sets: 256; group_bits: 8; associativity: 4",
  "citations": ["QA 基准用例 · Cache 组相联（团队验收基线，非真题出处）"]
}
```

实现说明：

- `mode` 仅接受 `direct` 或 `guided`。
- 当前前端在 `miss` 场景会把 `question_id` 传为 `null`，后端已兼容；是否将该值正式标注为 nullable 需 TL 同步 Apifox。
- 可选请求头 `X-User-LLM-Key` 用于用户自带模型 Key，不写入日志或响应；如 TL 不同意该扩展，应移除。
- 后端不保存聊天历史，`session_messages` 由前端 LocalStorage 透传。


> 补充：`GET /api/health` 为部署自检与联调排查接口（题目数、科目分布、核验状态、脏数据明细），
> 不属于业务契约，不进 Apifox，前端不应依赖。如 TL 认为不需要可移除。
> `/api/search` 的三态判定口径与阈值配置见 [question-bank-design.md](question-bank-design.md)。
