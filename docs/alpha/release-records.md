# Alpha 冲刺 · 发布与回滚记录

> 负责人：林子涵（H 包 / Alpha TD-09）｜最后更新：2026-11-13
>
> 本文件记录**每次实际发布与回滚**的事实，以及发布前的线上基线。口径遵循 Alpha 文档要求：
> **已开发 / 已提交 / 已合并 / 已上线 / 已验证 分开记录，不把"合并"写成"上线"，也不把"计划"写成"已实现"。**

---

## 一、状态口径（写记录时必须选一个）

| 状态 | 含义 | 证据形式 |
| --- | --- | --- |
| 已开发 | 代码在本地或分支 | 分支名 |
| 已提交 | 开了 PR | PR 链接 |
| 已合并 | 进入 `main` | 合并 commit |
| 已上线 | 线上正在跑该版本 | 线上自检输出 + 镜像 tag |
| 已验证 | 有可复现的验证证据 | 命令 + 输出/截图 + 时间 |

---

## 二、部署前线上基线（2026-11-13 00:10 实测，只读）

用于部署后逐项对照，作为"旧版 → 新版"的差异证据。

| 检查项 | 部署前实际值 | 证据 |
| --- | --- | --- |
| `/api/health` | `200`，`questions=16`，`by_review_state={verified:14,pending:1,disputed:1}`，`indexed=16`，**无 `llm_configured`** | `curl http://123.60.34.87/api/health` |
| 首页 `Last-Modified` | `Fri, 30 Oct 2026 12:37:20 GMT` | `curl -I http://123.60.34.87/` |
| `POST /api/recommend` | `404`（路由不存在） | `curl -o /dev/null -w '%{http_code}' -X POST` |
| `GET /api/question/COP006` | `404` | `curl -o /dev/null -w '%{http_code}'` |
| 后端镜像 | `wenjing-backend:glm53`，构建于 `2026-10-30 21:04` | `docker inspect` |
| 502 契约 | 缺 `retryable` / `retry_after_seconds` / `Retry-After`（镜像早于契约提交 `0b91e05`） | 临时容器实测 |
| 主干版本 | `main@4705d33`（11-12 23:14），CI 4 项全绿 | `actions/runs/43245597029`、`/43245597176` |

> 结论：**线上 = 10/30 旧版（16 题样例）**；主干 = 81 题 + `POST /api/recommend`。
> `GET /api/question/{id}` 与 `health.llm_configured` 在 `main@4705d33` 上**仍不存在**（C 包未合入），部署后如仍缺失，按"未实现"记录，不算回归缺陷。

---

## 三、发布记录

每次发布复制一节填写；`scripts/deploy.sh` 会自动在服务器 `/opt/wenjing/releases/release-<时间戳>.txt` 落一份原始记录，本节为汇总。

```markdown
### 发布 <版本号 / 名称> · YYYY-MM-DD HH:MM

- 状态：已上线（待验证）/ 已验证
- 候选 commit：<sha>（<commit 标题>）
- 部署方式：`scripts/deploy.sh [--frontend]`（镜像构建于服务器）
- 后端镜像：`wenjing-backend:<sha>`
- 前端：已发布 / 未发布；资源主文件 `index-<hash>.js`
- 题库：`questions=<N>`、`verified=<N>`、`skipped=<[]>`
- 模型：`LLM_MODEL=<model>`、`LLM_BASE_URL=<host>`
- 线上自检：health `✅/❌`、recommend `<code>`、question `<code>`、chat `<code>`、502 契约 `✅/❌`
- 备份点：镜像 `wenjing-backend:backup-<ts>`、静态资源 `/opt/backup-web-<ts>.tgz`
- GitHub Release：<链接 / 暂不发布及原因>
- 遗留：<无 / 列出>
```

---

## 四、回滚记录

```markdown
### 回滚 YYYY-MM-DD HH:MM

- 触发原因：<健康检查失败 / 线上验收不通过 / 其他>
- 新旧版本：`<新 sha>` → `<回滚目标 backup tag>`
- 执行方式：`scripts/rollback.sh --to <tag> [--web-backup <tar>]`
- 回滚后自检：health `✅/❌`、首页 `✅/❌`、主流程 `✅/❌`
- 线上验收：顺延（不以回滚后状态宣称通过）
- 记录文件：`/opt/wenjing/releases/rollback-<时间戳>.txt`
```

---

## 五、本次已归档记录

| 类型 | 时间 | 结论 |
| --- | --- | --- |
| 部署前基线 | 2026-11-13 00:10 | 线上仍为 10/30 旧版（16 题），与主干不一致 |
| 回滚演练 | 待填（沙箱容器，不触线上） | — |
| 正式发布 | 待填 | — |

---

## 六、版本号规划

仓库当前 **0 个 tag、0 个 release**（2026-11-13 核对），可安全从下列编号起步：

| 版本 | 对应 | 状态 |
| --- | --- | --- |
| `v0.2.0-alpha.1` | 首个集成版部署 | 待发布 |
| `v0.2.0-alpha.2` | 候选版 | 待发布 |

发布前先 `git tag -l` 核对，避免与团队后续打的重号；Release 必须对应一次**真实上线**。
