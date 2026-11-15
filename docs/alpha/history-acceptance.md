# 历史记录统一与验收（龚巍斌 · TD-05）

> 日期：2026-11-15；PR 集成基线：`main@7e516acb17872a6162b6d3d07afa98b28eb8a8c3`。初始实现及题库复核基线为 `91987ff`。
>
> 分支：`feature/alpha-history-independent-review-gwb`。本页记录本次实现和实际本地验证；不代表已合并、已部署或已完成候选版验收。

## 1. 交付结论

历史记录已统一由 `history` 基础 store 保存和更新，`wjHistory` 保留新答疑页面所需的薄适配。新增统一字段转换、完整备份、导入预览与确认、按 ID 去重及实际新增计数。未改动后端接口、题库、资料模块、公共布局或 `useAnswerFlow`。

本次验证结果：接入最新公共页面外壳与 Agent 检查提交后，新增历史回归 **15 个场景全部通过**；前端 `npm test` 全部通过；生产构建通过；Chrome、Edge 各 **8 项本地界面检查通过**，截图已按新布局更新。后端既有回归本次执行结果为 **113 passed**。界面检查使用隔离浏览器及接口替身，没有调用真实模型。

课程要求的最终线上学习主线仍需在 11/19 候选版部署后执行，不能用本页的本地通过代替。

## 2. 原问题与修改

| 原问题 | 本次处理 |
| --- | --- |
| 适配层直接修改基础会话，多处维护字段与保存规则 | `history.upsertSession()` 统一创建、部分更新、时间戳与持久化；适配层调用该入口 |
| `id/session_id`、`result/result_snapshot` 等转换分散 | `utils/historyExchange.js` 负责规范化与兼容视图，不访问存储 |
| 导入返回有效条数，重复导入却显示有新增 | 返回实际 `added`；库内和同批重复均跳过，已有内容保留 |
| 导入即写入，缺少检查和取消机会 | 文件读取 → 只读预览 → 明确确认；取消或整体格式错误不写入 |
| 坏条目和不支持版本边界不明确 | 整体格式/版本错误拒绝；逐条无效项列明原因，有效项可单独合并 |
| 引用、快照、揭示状态、思路可能在适配时丢失 | 统一记录并通过往返及 A/B/A 测试核对；兼容视图深拷贝，避免串改 |
| 旧练习记录“继续答疑”未携带练习身份 | 历史页根据快照补充 `practice` 查询参数，保持原有练习恢复语义 |

调用关系：`HistoryView / 旧页面 → history`；`新答疑页面 → wjHistory → history`。两种页面没有第二份历史数据库。

## 3. 数据模型与兼容边界

存储逻辑键保持 **`history:v1`**；`storage.js` 加前缀后，实际 localStorage 键为 **`wenjing:history:v1`**。不自动清空、不更换存储键、不另建迁移库。

| 基础模型字段 | 接受的旧/新字段 | 恢复内容 |
| --- | --- | --- |
| `session_id` | `sessionId`、`id` | 会话身份，导入去重依据 |
| `question_id`、`question_stem`、`title` | `questionId`、`stem`、`stemSummary` | 题号、完整原题、列表摘要 |
| `mode`、`match_type` | `mode`、`matchType` | 直接/引导模式、匹配类型 |
| `answer_attempt` | `userThought`、`userAnswerDigest`、`userReasoning`，旧 `attempt.userAnswer` | 用户作答及单独思路 |
| `answer_revealed` | `answerRevealed`，旧 `attempt.referenceExposed` | 主动查看答案状态 |
| `messages` | 消息 `message_id/id`、`created_at/createdAt` | 角色、正文、kind、时间、模型来源、引用和工具结果 |
| `result_snapshot`、`last_reply` | `result`、`lastReply` | 原题/相似题结果、选项、来源、最后回复与工具信息 |
| `chat_status`、`chat_error` | `chatStatus`、`chatError` | 未完成/异常提示及后续重试依据 |
| `created_at`、`updated_at` | `createdAt`、`updatedAt` | 统一为 ISO 时间；缺失旧时间使用固定兜底值 |

`upsertSession` 未提供的字段保留原值；显式传入的值覆盖对应字段。消息缺少 ID 时按会话和序号生成稳定 ID。返回的兼容视图包含独立副本，页面临时修改消息或快照不会直接修改历史。

备份格式为 `{format:"wenjing-history", version:1, exported_at, sessions:[...]}`。兼容旧的 `version:1` 备份，也接受没有 version 的旧 sessions 封套；未知显式版本或其他 format 被拒绝。仍兼容已有 `createSession / appendMessage / updateAnswerAttempt / importJSON / exportJSON` 调用，`importJSON()` 返回实际新增整数。

**早期摘要备份的限制：**只有 `stemSummary` 而没有完整题干的记录可保留、查看、再次导出，但标记为 `legacy_incomplete`，历史页禁用“继续答疑”。摘要不能还原被截断的题干；缺失的旧引用或快照也不能凭空补全。拥有完整题干但没有结果快照的旧记录可继续答疑，届时沿用原流程重新检索，不能保证离线恢复旧结果。

## 4. 导入规则

1. 读取 JSON，仅验证格式并生成预览，不写内存或磁盘。
2. 检查会话 ID、模式、消息数组以及消息角色/文本；预览显示总数、可新增数、重复数和无效条目原因。
3. 按会话 ID 合并，已有数据优先，同批相同 ID 仅保留首条有效记录，不合并两条消息流。
4. 确认时再次去重，处理预览期间新建同 ID 会话的情况。
5. 先写合并后的 localStorage，成功后才替换内存；配额不足等写入失败时保留原有内存和磁盘数据。
6. 显示实际新增、重复和无效数；没有可新增项时不能空确认。取消、损坏 JSON、不支持版本不影响已有记录。

普通会话写入失败会保留当前内存并提示先导出备份；该提示不等于数据已落盘。历史仍仅存在当前浏览器；本次没有增加账号同步、云端备份或跨标签页实时合并。

## 5. 测试与复跑

新增测试源码：[test-history.mjs](../../frontend/scripts/test-history.mjs)。使用实际 Pinia store 和 `useAnswerFlow`，localStorage、网络为受控替身。

| 编号 | 检查场景 | 结果 |
| --- | --- | --- |
| H01 | 新旧入口共用现有存储，部分更新保留完整字段 | 通过 |
| H02 | 导出→清空→导入→重建 store，完整内容一致 | 通过 |
| H03 | 旧规范字段及无版本旧备份兼容 | 通过 |
| H04 | camelCase 旧完整记录、引用与揭示状态兼容 | 通过 |
| H05 | 摘要型旧记录保留且不伪造题干 | 通过 |
| H06 | 重复导入新增 0，已有内容不覆盖 | 通过 |
| H07 | 库内重复、批内重复、无效条目分别计数 | 通过 |
| H08 | 预览/取消不写入 | 通过 |
| H09 | 预览期间出现同 ID，确认时重新去重 | 通过 |
| H10 | 损坏 JSON、未知版本、错误格式整体拒绝 | 通过 |
| H11 | 坏模式/坏消息逐条拒绝，其余有效项可确认 | 通过 |
| H12 | 配额写入失败不损坏原历史 | 通过 |
| H13 | 兼容视图深拷贝，不串改结果/消息/来源 | 通过 |
| H14 | 旧追加消息、作答、揭示及最近上下文入口 | 通过 |
| H15 | A/B/A 恢复题干、作答、模式、引用和揭示状态，零网络请求 | 通过 |

在仓库根目录执行：

```powershell
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run test:history
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
# 已有后端环境：
backend\.venv\Scripts\python.exe -m pytest -q backend
```

本次 `npm test` 中历史新增 15 场景通过，既有请求、契约、练习、资料及答疑等测试套件全部通过。配额失败场景会输出预期的 storage 警告，测试本身通过。后端结果为 113 passed；本次没有修改后端行为。

界面测试源码：[test-history-browser.mjs](../../frontend/scripts/test-history-browser.mjs)。先启动本地服务：

```powershell
npm.cmd --prefix frontend run dev -- --host 127.0.0.1 --port 5184 --strictPort
```

另一个终端在 `frontend` 目录执行 `node scripts/test-history-browser.mjs`。该项为可选测试，需本机 Chrome、Edge 和可解析的 Playwright 包；Playwright 不加入项目依赖或默认 `npm test`。已有独立 Playwright 安装时，可将环境变量 `PLAYWRIGHT_MODULE_PATH` 指向其 `index.mjs`。运行地址可用 `HISTORY_BASE_URL` 调整，脚本只接受本地地址。

实际检查包括：旧记录及思路显示、浏览器导出、预览取消、重复/无效统计、重复导入禁空确认、坏文件保护、完整往返及 A/B/A 页面恢复刷新。两浏览器均通过、无 pageerror、恢复过程中 `/chat` 请求数均为 0。检查是在全新隔离上下文完成，不访问用户现有浏览器记录；API 被替身拦截，因此不证明真实模型和线上环境可用。

- [浏览器结果与被测源码 SHA-256（统一 LF 换行）](evidence/history-browser-check.json)
- [Chrome 导入预览](evidence/history-import-chrome.png)
- [Edge 导入预览](evidence/history-import-edge.png)
- [验证结果汇总](evidence/history-verification.json)

已目视检查两浏览器截图：预览数量、错误原因、确认/取消按钮及会话详情可见，无遮挡或明显重叠。

## 6. 尚待候选版完成的独立体验验收

以下为后续验收清单，**本次不填“通过”**。由林子涵提供候选 commit、题库版本、部署地址和真实模型配置口径后，龚巍斌与系统回归负责人分别记录结论。

| 流程 | 要检查什么 | 当前状态 |
| --- | --- | --- |
| 正式搜题→答疑 | 题号、来源、核验状态一致，真实错误不静默换 Mock | 待候选版 |
| 引导→主动查看 | 主动查看前不泄露答案，查看后可继续讲解 | 待候选版真实模型 |
| 再练→历史→刷新 | 不串题、不串作答，揭示状态完整 | 本地恢复通过；线上待测 |
| 个人资料→答疑 | 真实 `context_chunks` 发送，引用不过度声称权威 | 待线上联调 |
| 导出→清空→导入→刷新 | 完整往返、可取消、错误明确、重复新增 0 | 本地通过；线上待测 |
| 内容勘误 | DS016、COP009 等修正后再复核，详见独立报告 | 待林明亮修正 |

最终记录补充：实际日期、commit、题库 hash、模型、步骤、实际结果及问题归属。当前开发交付、合并、上线和最终验收须分别登记。
