# β 冲刺 · 发布台账（v0.2.0-beta.1）

> 负责人：林子涵（β-09 发布候选、部署与回滚）｜最后更新：2026-11-22
>
> 口径：**已开发 / 已提交 / 已合并 / 已上线 / 已验证**分开记录，不把"合并"写成"上线"。
> 包与凭据：本文件不含任何密钥；模型 Key 仅存服务器 `/opt/wenjing/backend.env`（权限 600）。

---

## 一、版本与基线

| 项 | 值 |
| --- | --- |
| β 版本号 | **`v0.2.0-beta.1`**（尚未打 tag / 发 Release，等候选冻结 + PM 确认） |
| 文档基线 | `9e9793a`（2026-11-21 18:11，PR #42） |
| 公开站已部署 | **`9e9793a`**，2026-11-22 16:31（`release-20261122-163150.txt`） |
| 验收地址 | http://123.60.34.87/ |
| 上一版 | `f9ef33d`（= `v0.2.0-alpha.2` 目标提交） |

### 1.1 数据与模型

| 项 | 值 |
| --- | --- |
| 题库版本 | `1.2-alpha`，81 题（数据结构 20 / 计组 20 / 操作系统 21 / 网络 20） |
| 核验状态 | verified **15**、pending **65**、disputed **1**；`skipped=[]`，`indexed=81` |
| 模型 | SiliconFlow `Qwen/Qwen2.5-7B-Instruct`（`llm_configured=true`） |
| 分词 | jieba |

### 1.2 构建产物

| 项 | 值 |
| --- | --- |
| 后端镜像 | `wenjing-backend:9e9793a` |
| 前端镜像 | `wenjing-frontend:9e9793a` |
| 前端资源 | `assets/index-BNlM9WTO.js`、`assets/index-2GvRLDVq.css` |
| `index.html` SHA-256 | `648542cc5a0ffe6d81ecf4540334034ca736d8dfefb1562142392686226e0ecc` |
| 部署记录 | `/opt/wenjing/releases/release-20261122-163150.txt` |

---

## 二、上线后自检结果（2026-11-22 16:35，绑 `9e9793a`）

| 检查 | 结果 |
| --- | --- |
| `/api/health` | ✅ `status=ok`、`questions=81`、`skipped=[]`、`llm_configured=true`、`llm_model=Qwen/Qwen2.5-7B-Instruct` |
| 页面路由 | ✅ `/`、`/workbench`、`/practice`、`/materials` 均 200 |
| `GET /api/question/COP006` | ✅ 200（返回扁平题目对象，含 stem/options/answer/solution） |
| `POST /api/recommend` | ✅ 200，返回真实候选 |
| 流式协议 `/api/chat`（`Accept: application/x-ndjson`） | ✅ NDJSON 事件完整（`delta`+`done`）；首末事件间隔约 0.5–0.6s，**具备逐段到达迹象**（间隔过小时脚本只标"协议完整"，不当作逐段证据） |
| 题号前缀（#40 修复） | ✅ `第12题：+原题干` → `original`；`原始题干`、前置空行 → `original` |
| 改参数反例 | ✅ `64 B → 128 B` 降级为 `similar` |
| `GET /api/quiz/co-memory-01` | ⏭ **跳过**（HTTP 404，β 小测接口尚未实现；baseline 档跳过、**release 档判失败**） |

### 2.1 已知缺口（记录，不作为本包交付）

1. **小测功能未上线**：后端无 quiz 路由、前端无小测页面，`/api/quiz` 404。阻塞 β 主流程终验。
2. **题号变体覆盖不全**：`12.`、`（12）`、`第十二题` 三种前缀仍判 `similar`（仅 `第N题` 已修）。需周玘晖补归一化规则，属 β 验收用例范围。
3. **会话隔离补丁 `853bd67`**：远端无此提交（任务书记"本地待交接"），未进候选。
4. **Windows 试用包**：本轮不做（α.1/α.2 的 ZIP 为仓外手工产物，仓库无打包脚本）。

---

## 三、回滚点

| 回滚目标 | 含义 | 可用性 |
| --- | --- | --- |
| `wenjing-backend:backup-20261122-163150` | 本次部署前镜像（`f9ef33d`） | ✅ |
| `/opt/backup-web-20261122-163150.tgz` | 本次部署前静态资源 | ✅ |
| `wenjing-backend:backup-20261120-180152` | `f9ef33d`（= alpha.2） | ✅ 沙箱实测可启动、健康 |
| `wenjing-backend:backup-20261118-235248` | `0a57b6e`（= alpha.1） | ✅ |
| `wenjing-backend:backup-20261113-001000-known-good` | 最初线上版（10-30） | ✅ |
| `/opt/wenjing/app`（旧目录） | 10-30 代码 + 16 题数据 | ✅ 保留未动 |

**回滚步骤**

```bash
cd /opt/wenjing/app2
./scripts/rollback.sh --to wenjing-backend:backup-20261122-163150 \
  --web-backup /opt/backup-web-20261122-163150.tgz
```

**回滚演练（2026-11-22）**：用 `backup-20261120-180152` 在沙箱容器（端口 18086）启动，`/api/health` 正常返回 81 题后销毁；未触碰线上容器与 8000 端口。

---

## 四、发布检查流程（β 发包时执行）

```bash
# 1) 对尚未带镜像版本信息的历史基线做功能自检
python3 scripts/release_check.py --base http://127.0.0.1 \
  --expect-model Qwen/Qwen2.5-7B-Instruct --expect-questions 81

# 2) 发包前设置 CANDIDATE_SHA，再核对目标站点的后端镜像和小测响应
python3 scripts/release_check.py --profile release --expect-commit "$CANDIDATE_SHA"

# 3) 干净目录下载包 → 校验 SHA-256 → 启动 → 跑主流程（Windows 包本轮暂缓）

# 4) 记录/回填本台账：commit、镜像 tag、资源哈希、题库与模型、回滚点、遗留
```

**档位差异**

| 档位 | 小测 404 | 用途 |
| --- | --- | --- |
| `baseline`（默认） | ⏭ 跳过 | 阶段性基线自检，不阻塞 |
| `release` | ❌ 失败 | 发包前自检，必须三题小测已上线 |

**提交号核对**通过目标站点的 `/api/health` 读取正在运行的后端镜像提交号 `build_commit`。候选部署需用新版 `deploy.sh` 构建镜像；非 Git 目录部署时，`--commit` 填完整提交号。发包档要求 `--expect-commit`，实际版本缺失或不匹配判失败。前端版本继续按台账核对静态资源哈希。

**小测响应**在返回 200 时检查 JSON 题组 ID、版本和三道题的题干、题号与选项。

**流式检查口径**：`流式协议` 只判定 NDJSON 事件是否完整（`delta>0` 且有 `done`）。脚本同时记录首事件/末事件时间差：≥0.2s 记为"具备逐段到达迹象"，否则明确注明"仅证明协议完整，可能整体缓冲"，不把前者当作逐段到达证据。

发布前提（按 β 任务书）：沈雷在同一提交完成验收 + PM 确认 → 才按仓库规则打 tag、发 Release。

---

## 五、变更记录

| 日期 | 事件 | 提交 | 结果 |
| --- | --- | --- | --- |
| 2026-11-18 | alpha.1 发布（前序） | `0a57b6e` | 已发布（Release） |
| 2026-11-20 | alpha.2 发布（前序） | `f9ef33d` | 已发布（Release） |
| 2026-11-22 | β 基线部署 | `9e9793a` | 已上线，自检通过 |
| 2026-11-23 | 按 PR #43 评审意见修订检查脚本 | — | 提交号核对/小测档位/流式口径已改 |

---

## 六、合并时的评审意见记录（PR #43）

| 评审意见 | 处理 | 验证 |
| --- | --- | --- |
| `--expect-commit` 需核对实际部署提交，不一致退出非零 | 新增 `部署提交号` 检查：git HEAD（`/opt/wenjing/app2`）→ 发布记录回退；不一致或无法确认均判失败 | 期望 `deadbee` → ❌ 退出码 1；期望 `9e9793a` → ✅ 退出码 0；两处来源都不存在 → ❌ 退出码 1 |
| 小测 404 基线显式跳过；发包检查判失败 | 新增 `--profile baseline\|release`：baseline 记 ⏭、release 记 ❌ | release 档实测退出码 1，baseline 档退出码 0 |
| 流式检查不应把"一次性下发"当逐段证据 | 检查项改名 `流式协议`，只判事件完整性；另记录首末事件间隔并区分"逐段迹象/仅协议完整" | 实测间隔 0.57s → 标注"具备逐段到达迹象"；间隔过小时自动注明不能当作逐段证据 |

