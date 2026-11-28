# Beta 08 · 小测页面与作答结果验收

> 负责人：王翔鹏　｜　日期：2026-11-28　｜　基线：`main@ac01f249`（含 PR #48 后端小测接口）
> 对应《问径408_Beta冲刺任务分派》§一 08 包与 §三 08 提示词。
> 状态：**前端已实现并自验通过**；真实部署与沈雷独立回归待候选版同一提交。

## 1. 交付内容

从答题到重做的一条完整链路：三题有序作答 → 进度 → 缺题拦截 → 交卷判分 → 逐题解析 → 刷新续答 → 重做 → 从学习记录按 ID 找回旧成绩。

| 用户能看到什么 | 实现 |
| :--- | :--- |
| 三道有序题目、答题进度、可换行题干与选项 | `QuizPanel.vue` + 复用 `workbench.css` 的 `wb-question` / `wb-options` |
| 未选满不能交卷 | 按钮禁用 + 文案「选完全部题目后交卷」；绕过禁用时 `missingQuestions` 再次拦截并提示缺哪题 |
| 交卷后得分与逐题正误、解析 | 后端判分响应为准，前端不算分；状态用「正确/错误/未作答」文字，颜色只辅助 |
| 刷新续答 | `attempt_id` 写入 URL，草稿与选项存 `wj:v1:quiz:attempts` |
| 双击交卷只发一次 | 提交期间 `phase='submitting'` 锁按钮；同 ID 重试不产生第二条记录 |
| 失败保留选项 | 交卷失败回到作答态，选项不清空，重试复用同一 `attempt_id` |
| 重做与旧成绩 | 重做生成新 ID，旧结果保留；本机列表与学习记录都按 ID 打开 |
| 窄屏可用 | 375 px 无横向滚动，选项可点、按钮可见 |

## 2. 边界与契约

| 项 | 口径 |
| :--- | :--- |
| 出卷 | `GET /api/quiz/co-memory-01` → `{quiz_id, version, title, questions}`，**出卷不含答案与解析**，前端不猜 |
| 交卷 | `POST /api/quiz/{id}/submit`，请求体 `{version, attempt_id, answers}`（snake_case，与后端 Pydantic 模型一致）；曾误写 `attemptId`，本地宽松服务未暴露，单测已锁定正确字段 |
| 判分 | 后端按题组版本判分；A/B/B → 2/3，正确题 COP005 / COP007 |
| 浏览器存储 | `wj:v1:quiz:attempts`，只存 attempt_id / 版本 / 所选项 / 判分结果，不存标准答案 |
| 学习记录接线 | `attemptRoute(attemptId, quizId?)` 返回 `{name:'quiz', query:{quiz, attempt}}`，龚巍斌按此打开草稿或固定成绩；本包不另建第二份会话存储 |
| 工作台入口 | 独立路由 `#/quiz`；黄俊凡在工作台挂入口即可，本包未改 `WorkbenchView.vue` 的公共接线 |

## 3. 改动文件

| 文件 | 说明 |
| :--- | :--- |
| `src/utils/quiz.js` | 纯函数：出卷/判分归一化、缺题、请求体构造、作答摘要 |
| `src/store/wjQuiz.js` | attempt 状态与持久化，新建/保存/交卷/重做/按 ID 恢复 |
| `src/api/quiz.js` | 出卷与交卷请求封装，走统一 `client.js` |
| `src/api/paths.js` | 登记 `quiz` 路径与 `quizPath` / `quizSubmitPath` |
| `src/components/QuizPanel.vue` | 小测组件，接受 quizId / attemptId，回传 attempt-change |
| `src/views/QuizView.vue` | 独立页，含本机作答记录列表与按 ID 打开 |
| `src/router/index.js`、`src/constants/routes.js` | 新增 `/quiz` 路由与 `attemptRoute()` |
| `scripts/test-quiz.mjs`、`package.json` | 新增 `test:quiz`（32 条）并纳入 `test:fast` |
| `docs/beta/quiz-acceptance.md` | 本文档 |
| `docs/beta/screenshots/*.png`、`verify-report.json` | 验收截图与 29 条浏览器断言 |

## 4. 实测结果

| 项 | 结果 |
| :--- | :--- |
| `npm run test:quiz` | **32 通过 / 0 失败** |
| `npm test`（chunk / chunk-pro / practice / recommend / material-exchange / history / quiz + 慢测） | 全 PASS |
| `npm run build` | 通过 |
| 浏览器真实契约断言 | **29 通过 / 0 失败，控制台异常 0** |

浏览器断言覆盖：三题出卷、进度、按钮禁用、ID 写入 URL、刷新续答、缺题拦截、A/B/B 得 2/3、双击只发一次、请求体字段、交卷后刷新、重做新 ID、按 ID 找回旧成绩、失败保留选项与同 ID 重试、375 px 无横向滚动、不存在的 ID 明确提示。

请求取证（同一轮，节选）：

```
POST /api/quiz/co-memory-01/submit
{"version":"1","attempt_id":"attempt_xxx","answers":{"COP005":"A","COP006":"B","COP007":"B"}}
→ score 2 / total 3
```

截图（在 `screenshots/`）：

| 文件 | 内容 |
| :--- | :--- |
| `01-quiz-empty.png` | 出卷与 0/3 进度 |
| `02-quiz-resumed.png` | 刷新后续答 |
| `03-quiz-result.png` | A/B/B 得分 2/3 与逐题解析 |
| `04-quiz-redo.png` | 重做后新作答 |
| `05-quiz-history-result.png` | 按 ID 找回旧成绩 |
| `06-quiz-retry.png` | 交卷失败保留选项并重试 |
| `07-quiz-mobile.png` | 375 px 窄屏 |

## 5. 怎么复测

```bash
cd frontend
npm install && npm test && npm run build
npm run dev   # 需后端在 127.0.0.1:8000，且 main 已含 PR #48
```

打开 `http://localhost:5173/#/quiz`：

1. 选 A / B / B，确认进度 3/3 后交卷，得分应为 **2/3**，COP005 与 COP007 为「正确」
2. 刷新页面，成绩与作答 ID 不变
3. 点「重做一套」，生成新 ID，旧成绩仍在「本机作答记录」里
4. 打开旧记录，仍显示当时的 2/3
5. `#/quiz?attempt=not-exist` 应提示记录不可用并可开始新作答

## 6. 已知限制 / 不属于本包

- 判分依赖真实后端；浏览器只保存本机草稿与成绩，换设备或清浏览器数据后无法找回。
- 四科归档、单题学习成果导图是龚巍斌选做；题干复制与讲解导出是黄俊凡；停止生成是郑志銮。
- 出卷字段不含标准答案，因此交卷前页面无法预览正确选项——这是契约要求，不是缺陷。
- 本轮用本地契约服务按 main 的 `quiz_catalog.json` 验证；线上公开站与 Windows 包需林子涵在候选提交上复测，沈雷另出独立结论。
