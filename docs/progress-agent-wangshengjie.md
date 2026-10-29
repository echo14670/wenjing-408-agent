# Agent 模块进度与交付说明

- 负责人：王圣杰
- 更新时间：2026-10-29
- 当前状态：`/api/chat` P0 初版已完成，后端测试与真实 DeepSeek 联调通过
- 工作分支：`feature/agent-chat`
- 代码基线：`feature/backend-question-bank`

## 1. 任务完成情况

| 项目任务 | 状态 | 实现说明 |
|---|---|---|
| `/api/chat` 接口 | 已完成 | 严格返回 `reply`、`tool_result`、`citations` 三个字段 |
| 直接解析 | 已完成 | 注入题干、选项、题库答案、题库解析和用户作答 |
| 引导模式 | 已完成 | 标准答案不进入 Prompt；输出再次执行泄露检查 |
| 带入作答追问 | 已完成 | 接收 `user_answer`，支持前端透传多轮 `session_messages` |
| 个人资料问答 | 已完成 | 接收并拼接 `context_chunks`，资料文本按不可信数据处理 |
| Cache 工具核验 | 已完成 | 四路组相联基准题自动输出行数、组数、组索引位数 |
| 防幻觉 | 已完成 | 无题库来源时不能生成题库引用；Prompt 禁止编造年份和页码 |
| 冲突展示 | 已完成 | 检测 AI 选项与题库答案冲突，在 `reply` 开头显示冲突提示 |
| 默认模型配置 | 已完成 | 使用 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` |
| 用户自带 Key | 已完成初版 | 可选 `X-User-LLM-Key` 请求头，不持久化、不写日志 |
| 自动化测试 | 已完成 | 后端全量 64 个测试通过 |
| 真实模型联调 | 已完成 | `deepseek-flash` 直接解析和引导模式均通过 |

## 2. 新增与修改文件

新增：

- `backend/app/api/chat.py`
- `backend/app/schemas/chat.py`
- `backend/app/services/agent.py`
- `backend/app/services/agent_tools.py`
- `backend/tests/test_chat_api.py`
- `docs/progress-agent-wangshengjie.md`

修改：

- `backend/main.py`：注册 `/api/chat` 路由
- `backend/app/deps.py`：提供 AgentService 单例依赖
- `backend/app/services/question_store.py`：按 `question_id` 查询原题
- `backend/requirements.txt`：增加 OpenAI 兼容 SDK
- `backend/.env.example`：补充 DeepSeek 默认地址和模型
- `docs/api-contract.md`：记录当前 `/api/chat` 契约与实现约定

## 3. 接口行为

直接解析：

- 从题库按 `question_id` 查询原题。
- 将题干、答案、解析、用户作答、资料切片拼接为 Prompt。
- 返回完整讲解。

引导模式：

- 不把标准答案和题库解析放入 Prompt。
- 要求模型给出最小提示并通过问题引导学生。
- 若模型仍然直接泄露答案，服务端替换为安全引导，不返回最终结果。
- 只有当 `session_messages` 出现“我已主动选择查看答案”时解除限制。

相似题：

- `/api/search` 返回 `similar` 时不提供可追问的原题 `question_id`。
- 前端根据三态规则不进入 `/api/chat`。
- Agent 不自行把相似题当成原题处理。

未命中：

- `question_id` 允许为空。
- 有 `context_chunks` 时仅依据资料回答。
- 没有资料时明确说明资料不足，并返回空引用。

## 4. 工具核验

当前工具处理基准题 Q001：

```text
Cache 容量 64KB
块大小 64B
四路组相联
```

计算输出：

```text
cache_lines: 1024; sets: 256; group_bits: 8; associativity: 4
```

工具结果通过 `tool_result` 返回，同时注入 Prompt，要求模型以工具数值为事实。

## 5. 验证证据

静态检查：

```powershell
cd backend
python -m ruff check app tests main.py
```

结果：通过。

自动化测试：

```powershell
cd backend
python -m pytest -q
```

结果：

```text
64 passed
```

真实 DeepSeek 联调：

- 模型：`deepseek-flash`
- 直接解析：返回标准三字段，工具结果为 `group_bits: 8`
- 引导模式：未泄露最终选项，继续向学生提出中间计算问题
- 请求和响应字段与仓库 `docs/api-contract.md` 一致

## 6. 待协调事项

1. 当前分支基于 `feature/backend-question-bank`，应在题库后端分支合入后合并到 `main`，或由 TL 指定目标分支。
2. Apifox 的 `question_id` 示例为字符串，但现有前端在 miss 场景传 `null`；后端已兼容，需 TL 决定是否正式标注 nullable。
3. `X-User-LLM-Key` 是满足“前端自带 Key”需求的扩展请求头，需 TL 确认是否保留。
4. 合并后需要和前端 `feature/frontend-zhengzhiluan` 做一次真实页面闭环联调。
5. QA 沈雷需按《测试基线与红线清单》继续验证防幻觉、三态隔离和冲突展示。

## 7. 交付检查清单

- [x] `/api/chat` 已注册
- [x] 请求/响应字段与 Apifox 当前契约一致
- [x] 直接解析可用
- [x] 引导模式不泄露答案
- [x] 支持带入用户作答
- [x] 支持个人资料切片
- [x] Cache 基准题工具核验
- [x] 防幻觉与冲突提示
- [x] 自动化测试通过
- [x] 真实 DeepSeek 调用通过
- [ ] 前端页面联调
- [ ] TL 合并到 main
