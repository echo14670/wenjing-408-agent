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
| 流式答疑 `/api/chat`（`Accept: application/x-ndjson`） | ✅ `delta` 逐段到达 + `done`，首字节远早于总耗时 |
| 题号前缀（#40 修复） | ✅ `第12题：+原题干` → `original`；`原始题干`、前置空行 → `original` |
| 改参数反例 | ✅ `64 B → 128 B` 降级为 `similar` |
| `GET /api/quiz/co-memory-01` | ❌ **404**（β 小测接口尚未实现，非回归） |

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
# 1) 公开站自检（绑提交号）
python3 scripts/release_check.py --base http://127.0.0.1 \
  --expect-commit 9e9793a --expect-model Qwen/Qwen2.5-7B-Instruct --expect-questions 81

# 2) 干净目录下载包 → 校验 SHA-256 → 启动 → 跑主流程（Windows 包本轮暂缓）

# 3) 记录/回填本台账：commit、镜像 tag、资源哈希、题库与模型、回滚点、遗留
```

发布前提（按 β 任务书）：沈雷在同一提交完成验收 + PM 确认 → 才按仓库规则打 tag、发 Release。

---

## 五、变更记录

| 日期 | 事件 | 提交 | 结果 |
| --- | --- | --- | --- |
| 2026-11-18 | alpha.1 发布（前序） | `0a57b6e` | 已发布（Release） |
| 2026-11-20 | alpha.2 发布（前序） | `f9ef33d` | 已发布（Release） |
| 2026-11-22 | β 基线部署 | `9e9793a` | 已上线，自检通过 |
