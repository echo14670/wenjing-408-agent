# 同考点推荐与连续练习前端验收（F 包 / TD-06）

> 负责人：王翔鹏　｜　日期：2026-11-14　｜　基线：`main@76fe528`（题库 `v1.2-alpha`，81 题）
> 对应《Alpha 冲刺两周任务分工安排》§3.8 与 §5.1 TD-06。
> 文档按仓库现有前端验收文档惯例放在 `frontend/docs/alpha/`（与 `request-layer-acceptance.md` 同级）。
> 状态：**前端已实现并自验通过**；线上部署与详情接口联调仍属待验收项，见第 8 节。

## 1. 本轮解决的问题

PR #15 已把「再练一道」入口与切题隔离合入主干，但它是在推荐接口尚未落地时写的：前端用 `GET /api/recommend` 加内置示例兜底，后端后来实现的是 `POST`。两边从未真正连通，默认路径一直显示「示例数据」。本轮按已冻结契约完成真实联调，并清偿 TD-06。

| 开工前的实际状态 | 证据 |
| :--- | :--- |
| 前端 `GET /api/recommend?question_id=&limit=`，后端 `POST /api/recommend` | `frontend/src/api/practice.js`、`backend/app/api/recommend.py` |
| 前端只认 `candidates`，后端返回 `questions` | `normalizeRecommend` |
| `scope` / `notice` 前端完全没读 | 页面一律写死「同考点」 |
| 404 / 405 / 501 / **所有 5xx** / 空候选 / 占位文本，六条路径静默填内置样例 | `shouldFallback()` |
| `DEMO_KNOWLEDGE_POINT` 写死考点 | `constants/demo.js`、`AnswerView.vue` |
| `done_question_ids` 未传 | 只排当前题 |
| `docs/alpha/practice-acceptance.md` 缺失 | 同组已交 10 份验收文档 |

## 2. 前后端契约（已对齐）

`docs/api-contract.md` §4 与 `backend/app/api/recommend.py`：

| 方向 | 字段 | 说明 |
| :--- | :--- | :--- |
| 请求 | `question_id` | 当前已核验原题题号 |
| 请求 | `done_question_ids` | 前端本地记的已做题号，后端不落库 |
| 请求 | `top_k` | 1–10，前端默认 3 |
| 请求 | `include_unverified` | 默认 `false` |
| 响应 | `questions: QuestionData[]` | **完整题目**，含 `answer` / `solution` / `options` / `chapter` / `review_state` / `source_ref` |
| 响应 | `scope` | `knowledge_point` \| `chapter` \| `none`，决定界面写「同考点」还是「同章节」 |
| 响应 | `notice` | 兜底到待核验题时的提示，前端独立展示 |

`GET /api/question/{id}`（C 包）仍待实现。本轮把它改为**可选补充**：推荐响应的 `questions` 已是权威题目，详情接口只补空字段，404 不阻塞切题、不把真实题误标成示例。C 包合入后无需改前端即自动生效。

## 3. 改动清单

| 文件 | 改动 |
| :--- | :--- |
| `src/api/practice.js` | 改 POST + 正式请求体；删除全部静默兜底；详情改为主数据补充、不覆盖权威字段；示例候选只在显式演示模式返回 |
| `src/api/normalize.js` | `normalizeRecommend` 认 `questions` / `scope` / `notice`；`normalizeQuestion` 与候选项保留 `chapter` / `options` / `solution` |
| `src/utils/practice.js` | 新增 `buildRecommendPayload`、`mergeQuestionDetail`、`SCOPE_META`、`scopeMeta`、`recommendScopeLine`；空态文案按真实空结果重写 |
| `src/composables/usePracticeList.js` | 读取演示模式、透传 `doneQuestionIds` / `chapter` / `signal`；新增 `scope` / `notice` / `demo` 状态；失败如实呈现 |
| `src/components/answer/PracticeRecommend.vue` | 动态 scope 标签与说明、后端 notice 黄条、已排除题数、示例数据标只在演示模式出现、错误详情与重试 |
| `src/store/wjPractice.js` | 结合历史中的已作答或已揭示题目和切走的题号，保存最近的真实候选供刷新恢复 |
| `src/composables/useAnswerFlow.js` | 确认新题后标记旧题为已做，保存独立会话；新题和答疑分别管理状态 |
| `src/views/AnswerView.vue` | 考点取题目真实 `chapter`，删除写死常量；传 `chapter` / `doneIds`；`practice=<id>` 刷新优先从历史恢复 |
| `src/constants/demo.js` | 移除未使用的写死考点常量 |
| `scripts/test-recommend-contract.mjs` | 新增 52 条契约与防回归断言 |
| `package.json` | 新增 `test:recommend` 并纳入 `test:fast` |
| `frontend/docs/alpha/` | 本文档、7 张验收截图、机器可读断言报告 |

## 4. TD-06 清偿对照

| 遗留行为 | 现在 |
| :--- | :--- |
| 404/405/501/5xx 静默回落实例 | 一律原样抛错 → 错误态 + 可读原因 + 「重新获取」 |
| `questions=[]` 被样例填满 | 保持空态，明确说明「题库中暂无…」，不出现任何示例题 |
| 占位拉丁串被样例替换 | 判为「推荐接口返回的内容不可读」，可重试；不填假题 |
| 考点写死 | 取后端考点或题目 `chapter`，`scope=chapter` 时如实说明降级原因 |
| 详情降级丢字段 | 以推荐响应为主数据，详情只补空字段（单测覆盖 7 项） |
| 演示数据混进默认路径 | 仅 DevMockSwitch 显式演示模式或 `?mock=` 场景使用，界面打「示例数据」标 |
| `?rec=none/error/slow` 注入假题 | 只制造状态，不制造题目 |

## 5. 操作流程（验收时照着点）

前提：`cd frontend && npm install && npm run dev`，后端在 `127.0.0.1:8000`（`vite.config.js` 已配 `/api` 代理）。路由是 hash 模式，URL 必须带 `#/`。

1. **真实推荐**：用已核验原题（如 `COP006`）完整题干检索，进答案页后点「再练一道」。
   期望：发出 `POST /api/recommend`，列出候选的题干摘要、来源、核验状态；顶部按 `scope` 显示「同考点」或「同章节」；**不出现「示例数据」**。
2. **空结果 / 故障**：后端返回 `questions=[]` → 「本题暂无可推荐的题目」+ 重新获取；
   返回 502 → 「推荐加载失败」+ 可读原因 + 重试，当前题解析不受影响。
   纯前端验收也可加 `&panel=practice&rec=none` / `&rec=error` / `&rec=slow`。
3. **切题与隔离**：点第一条「开始练习」。
   期望：顶部「已切题」逐项列出隔离了什么；新题题面卡显示题干、选项、来源、核验态和实际推荐范围。「我的思路」清空，两种教学模式都需主动查看参考答案。
4. **连续练习**：在新题下再点一次「开始练习」。
   期望：第二次请求带上 `done_question_ids`，候选不再出现做过的题；面板底部显示「已排除 N 道当前或做过的题」。
5. **刷新恢复**：按 F5。
   期望：仍停在练习态（按 URL 中的练习题号和会话 ID 恢复），延续测试时的模式和答案揭示状态，已做题仍被排除。
6. **主动揭示**：点「查看参考答案」后展开，再切下一题时新题重新收起（不串揭示态）。
7. **演示模式**：DevMockSwitch 切到 `original` 等显式演示模式时，内置样例可用且必须显示「示例数据」标；生产构建默认真实后端，不显示开发开关。

## 6. 验收结果

| 项 | 结果 |
| :--- | :--- |
| `npm run test:recommend` | **52 通过 / 0 失败** |
| `npm run test:practice` | 53 通过 / 0 失败 |
| `npm test`（含 chunk / contract / request-layer / answer-flow / material-exchange） | 全 PASS |
| `npm run build` | 通过 |
| 作者的浏览器契约样例（`verify-report.json`） | 35 通过 / 0 失败，控制台异常 0 |
| 生产构建默认连真实后端 | `test:request` 已覆盖 |

作者的浏览器样例覆盖 POST 请求体、候选渲染、范围和提示、空结果、502 重试、切题、刷新和 BUG-08 侧栏文案。截图和 JSON 保留当时契约服务的样例。

审阅时另用本地 FastAPI 和 81 道正式题浏览器复测。COP006 返回同章节的 COP005、COP007、COP020。COP005 详情返回 404，未配置模型的答疑返回 503，页面仍可继续练习。连续练完三题后返回空候选。请求如下。

```
POST /api/recommend {question_id:"COP006", done_question_ids:[],            top_k:3}
POST /api/recommend {question_id:"COP005", done_question_ids:["COP006"],    top_k:3}
POST /api/recommend {question_id:"COP007", done_question_ids:["COP006","COP005"], top_k:3}
```

截图（均在 `screenshots/`）：

| 文件 | 内容 |
| :--- | :--- |
| `01-recommend-real.png` | 契约样例中的候选列表、来源、核验态和同考点标签 |
| `02-scope-chapter.png` | 同章节标签、降级说明、后端 notice |
| `03-empty-real.png` | 空候选样例 |
| `04-error-502.png` | 502 错误态与重试 |
| `05-switch-isolation.png` | 已切题说明、新题题面卡、答案默认收起 |
| `06-continuous-practice.png` | 第二组练习与已做题排除 |
| `07-after-refresh.png` | 刷新后仍在练习态 |

## 7. 缺陷复测结论

| 编号 | 原现象 | 本轮结论 |
| :--- | :--- | :--- |
| BUG-05 | 切题后 B 题参考答案与完整讲解立即展开 | 本地回归通过。两种模式切题后均收起参考答案，完整讲解在主动查看后显示 |
| BUG-08 | 侧栏固定显示「交互演示 · 无模型连接」 | **已由 #20/G 包修复**：`main@76fe528` 源码已无该字符串，浏览器断言 1h 通过 |
| BUG-03 | `/api/recommend`、`/api/question/{id}` 均 404 | 推荐接口已由 #19 实现并联调通过；详情接口仍属 C 包，见第 8 节 |

缺陷清单里的状态仍写着「待确认 / 待修复」，需沈雷在最终回归报告里按本轮证据更新，本包不代改测试文档。

## 8. 边界与依赖（不要写成已完成）

1. **详情接口**：`GET /api/question/{id}` 后端未实现（`backend/app/api/` 只有 chat / health / recommend / search / upload），由周玘晖 C 包负责。本轮不依赖它也能闭环，但真实环境里详情字段始终来自推荐响应。
2. **线上部署**：本轮包含契约样例测试及本地正式题库复测。林子涵与沈雷在集成版部署后核对线上推荐、详情和真实模型行为。
3. **示例数据**：只存在于 `src/mock/fixtures/practiceCandidates.js`，仅在显式演示模式启用；默认路径不含任何内置题目。
4. **练习记录归属**：切题会话仍写入 `wj:v1:*` 适配层（该层已转接基础 `history:v1`），龚巍斌正在统一历史模型（TD-05）。本包未擅自改 `store/history.js`，最终按他的迁移口径对齐。
5. **未覆盖**：`include_unverified=true` 的真实后端行为、`top_k>3` 的展示、多浏览器兼容、真实模型长耗时下的切题竞态，留 11/19 候选版回归。

## 9. 交付物

- 练习前端代码与状态修正（第 3 节）
- `scripts/test-recommend-contract.mjs`（必要用例）
- 本文档、`screenshots/` 7 张、`verify-report.json`（35 条断言与请求日志）
- PR 说明：改动摘要、验收步骤、依赖与边界
