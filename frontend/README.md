# 问径前端 · 郑志銮模块（输入 / 搜索 / 结果页）

408 智能体（问径）前端工程。本分支模块由郑志銮负责：**输入页、检索结果页、Mock 联调、本地问答历史、长文本切片（context_chunks）**。

## 快速开始

```bash
npm install
npm run dev        # 打开 http://localhost:5173
```

其他命令：

```bash
npm run build      # 产物校验（构建）
npm run preview    # 预览构建产物
npm run test:chunk # 切片工具单测
```

## 目录结构与职责

```text
frontend/
├── src/
│   ├── api/                 # Axios 请求封装（search / chat / upload），统一走 /api 代理
│   ├── components/          # 公共组件
│   │   ├── SideNav.vue      #   深色侧边导航（原型风格）
│   │   ├── TopBar.vue       #   顶栏（面包屑 + 数据来源 chip）
│   │   ├── MatchTypeBadge.vue  # 原题/相似题/未命中 三态徽章
│   │   ├── DevMockSwitch.vue   # 右下角 Mock 联调开关（三态 UI 演示）
│   │   └── AnswerPanel.vue     # 【王翔鹏集成边界】答案/步骤/教学模式展示
│   ├── config/mock.js       # Mock 地址 + 本地三态样例数据 + match_type 元信息
│   ├── store/               # Pinia：mock 开关 / 搜索状态 / 问答历史(localStorage) / 个人资料(localStorage)
│   ├── utils/               # chunkText 长文本切片、storage 安全封装
│   └── views/               # SearchView 输入页 / ResultView 结果页 / HistoryView 学习记录 / MaterialsStub 资料占位
```

## Mock 联调（重要）

团队约定的 Apifox Mock 地址已通过 `vite.config.js` 的 `/api` 代理接入：

| 场景 | 地址 |
| :--- | :--- |
| 原题 | `/api/search` |
| 未命中 | `/api/search?apifoxResponseId=342552720` |
| 对话 | `/api/chat` |
| 上传 | `/api/upload` |

**现状（2026-10-28 实测）**：四个 Mock 地址均可达、返回结构与契约一致，但 Apifox「智能 Mock」返回的是**占位假数据**（`match_type` 为随机文本，非 `original/similar/miss`）。

因此页面右下角提供 **Mock 联调开关**：

- **真实 Apifox Mock**：请求团队约定地址，验证请求管线 / CORS 代理 / 错误处理；
- **本地样例 · 原题 / 相似题 / 未命中**：使用 `src/config/mock.js` 中按契约构造的样例数据，保证三态 UI 可稳定演示。

默认 `local`。后端就绪后：把开关切回「真实 Apifox Mock」并把 `vite.config.js` 的 `target` 改为本地后端地址即可，前端代码无需改动。

## 核心逻辑

1. **本地问答历史**（`src/store/history.js`）：会话 + 消息 + 作答记录存 localStorage，支持导出 / 导入 / 清空（需求 F07）。
2. **长文本切片**（`src/utils/chunkText.js`）：个人资料按「前端无状态切片」原则切块，请求 `/api/chat` 时经 `materials.contextChunks` 填入 `context_chunks`（后端仅透传拼装，不落库）。
3. **三态严格隔离**（业务底线 #3）：`similar` 候选仅参考，答疑使用用户原始题干而不绑定候选 ID；`original` 展示题库核验解析；`miss` 进入 AI 解题分支。

## 协作说明

- `AnswerPanel.vue` 顶部注释写明与王翔鹏的集成边界：当前为基础可用实现（消息流、tool_result、citations、直接讲解/引导学习基础差异、冲突展示占位），后续由王翔鹏深化步骤卡、教学模式与冲突 Diff 视图，**对外 props（sessionId）保持不变**。
- 「我的资料」完整页（条目预览 / 核验状态 / 知识条目）由资料模块成员开发，`MaterialsStub.vue` 仅作占位并演示切片链路。
- 接口字段名严格对齐开发基准·API 契约，未经 TL 同意不改字段（交接文档红线）。

## 原接口复核与兼容修复（2026-10-29）

本次继续使用团队 stage2 的三个接口，不新增或改名 HTTP 字段：
- 搜题仍仅发送 `raw_input`、`input_type`。学科、年份和题号的独立筛选尚未定义，界面暂禁用对应输入，待团队确认。
- 原始题干放入现有 `session_messages`，随后保留最近三轮对话。读取会话时按组件的 `sessionId` 取上下文，避免混题。
- 引导模式默认隐藏题库答案、完整解析和原始工具结果。用户主动查看后保存本地 `answer_revealed`，并通过已有消息内容表达查看意图。该状态不新增为 API 字段。
- 相似候选仅用于参考。下方答疑使用用户自己的题干，`question_id` 为 null，不绑定相似题的 ID。
- 上传只提取与预览。用户修正并确认后才保存到本地资料库；相同名称、类型和内容的资料重复确认时复用已有条目。
- `AnswerPanel.vue` 的组件入口仍为 `sessionId`，王翔鹏后续集成时请保留上述交互约束。

验证：`npm run build`、`npm run test:chunk`、`npm run test:contract`。
`test:contract` 使用 Vite 和 Vue SSR 渲染实际组件，无需额外测试依赖。
真实模型答疑和文件解析仍需后端 `/api/chat`、`/api/upload` 实现后联调；当前本地演示不是模型实测结果。
