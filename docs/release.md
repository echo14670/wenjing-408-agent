# 发布与回滚手册（问径 · 408 智能体）

> 维护人：林子涵（H 包）｜最后更新：2026-11-09｜依据：2026-11-09 线上与本地实测
>
> 本文档按**线上真实形态**书写，不是"理想架构"。所有命令都在本机（Windows + Git Bash）或服务器（root@123.60.34.87）实跑过，未验证的步骤会显式标注。

---

## 一、线上环境真实形态（2026-11-09 实测）

| 项 | 实际情况 |
| --- | --- |
| 服务器 | `123.60.34.87`（华为云 Flexus 实例 `flexusx-4260`，Ubuntu 24.04.4 LTS，系统盘 40G / 已用 20%） |
| 入口 | 宿主机 **Nginx 1.24.0**（systemd 服务，非容器），仅监听 80（未配 TLS） |
| 站点配置 | `/etc/nginx/sites-available/wenjing`，`sites-enabled/wenjing` 为软链 |
| 静态资源根 | `/var/www/wenjing`（`index.html` + `assets/`，`www-data` 属主） |
| 接口反代 | `location /api/` → `http://127.0.0.1:8000`，`proxy_read_timeout 120s`，`client_max_body_size 21m` |
| 后端 | **容器** `wenjing-backend`（镜像 `wenjing-backend:glm53`），端口映射 `127.0.0.1:8000->8000`，`restart=unless-stopped` |
| 题库挂载 | 宿主机 `/opt/wenjing/app/backend/data` → 容器 `/app/data`（改题库不用重建镜像） |
| 部署目录 | `/opt/wenjing/app`（仓库 checkout，后端镜像由该目录构建） |
| 防火墙 | `ufw` active，放行 `22/80/443` |
| 宿主运行时 | Python 3.12.3（**不参与后端运行**，后端只在容器内）；宿主机**未安装 Node** |

线上 Nginx 站点配置（与仓库 `frontend/nginx.conf` 同构，差异只在 `proxy_pass` 上游）：

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/wenjing;
    index index.html;
    client_max_body_size 21m;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

---

## 二、本地一键启动 vs 线上差异

本地用 `docker compose up`（仓库根目录 `docker-compose.yml`）：

| 维度 | 本地 compose | 线上 |
| --- | --- | --- |
| 前端 | `frontend` 容器内 Nginx（`8080:80`），静态文件在镜像内 | 宿主机 Nginx 直接托管 `/var/www/wenjing` |
| 反代上游 | `backend:8000`（compose 网络服务名） | `127.0.0.1:8000`（宿主机回环 + 端口映射） |
| 后端 | `backend` 容器（`8000:8000`） | 容器 `wenjing-backend`（只映射回环） |
| 题库 | `./backend/data` 挂载 | `/opt/wenjing/app/backend/data` 挂载 |
| 健康检查 | 两个服务都带 healthcheck，`frontend` 等 `backend` healthy | 无（部署时人工验证 `/api/health`） |
| 入口端口 | 8080 | 80 |

启动：`docker compose up -d --build`，访问 `http://localhost:8080`。
停止：`docker compose down`（加 `-v --rmi local` 会连本地镜像一起清）。

### 网络受限（线上服务器实测）

服务器**无法直连 Docker Hub 与 pypi.org**（`registry-1.docker.io`、`files.pythonhosted.org` 均超时/连接被拒），构建必须走镜像：

- 基础镜像：`docker pull docker.m.daocloud.io/library/node:22-alpine` → `docker tag ... node:22-alpine`（`nginx:1.27-alpine`、`python:3.11-slim` 同理）
- Python 依赖：`PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple docker compose build backend`
- 前端依赖：`package-lock.json` 的 `resolved` 全是 `registry.npmmirror.com`（109 条），镜像构建与 CI 已用 `replace-registry-host=always` 改写到 `registry.npmjs.org`，避免单个镜像站 500 造成构建失败

---

## 三、发布步骤（11/16 用）

前置：11/15 测试通过后冻结候选 commit；**不要用"重启旧容器"代替部署**（见第七节）。

```bash
# 0) 记录旧版本，便于回滚
OLD_TAG=backup-$(date +%Y%m%d-%H%M)
docker tag wenjing-backend:glm53 wenjing-backend:$OLD_TAG
tar -czf /opt/backup-web-$OLD_TAG.tgz -C /var/www wenjing
docker inspect wenjing-backend --format '{{range .Config.Env}}{{println .}}{{end}}' > /opt/backup-env-$OLD_TAG.txt

# 1) 拉取候选版本
cd /opt/wenjing/app
git fetch --all --tags
git checkout <候选 commit>

# 2) 构建后端镜像（走国内源）
docker build \
  --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
  -t wenjing-backend:<候选 tag> ./backend

# 3) 重建后端容器（保留原环境变量与题库挂载；LLM_* 必须照抄，见第五节）
docker rm -f wenjing-backend
docker run -d --name wenjing-backend --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  --env-file /opt/wenjing/backend.env \
  -v /opt/wenjing/app/backend/data:/app/data \
  wenjing-backend:<候选 tag>

# 4) 等健康后再验证
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:8000/api/health >/dev/null && break; sleep 2; done
curl -s http://127.0.0.1:8000/api/health

# 5) 前端构建并替换静态资源
cd /opt/wenjing/app/frontend
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always
npm run build
rsync -a --delete dist/ /var/www/wenjing/
chown -R www-data:www-data /var/www/wenjing

# 6) Nginx（站点配置未变可跳过）
nginx -t && systemctl reload nginx
```

> 说明：`--env-file /opt/wenjing/backend.env` 是建议的收敛方式（当前线上是直接 `docker run -e` 注入，环境变量散落在命令历史里）。首次落地时请把现状 `docker inspect` 的 env 落盘为该文件，**不要提交到仓库**。

### 发布后验证清单（必须逐条有证据）

| 检查项 | 命令 / 判据 |
| --- | --- |
| 题库已更新 | `curl -s http://127.0.0.1/api/health` → `questions=81`、`skipped=[]` |
| 模型状态字段 | `health` 含 `llm_configured`（C 包新增后才有） |
| 推荐接口 | `curl -s -X POST http://127.0.0.1/api/recommend -H 'Content-Type: application/json' -d '{"question_id":"COP006","done_question_ids":[],"top_k":3}'` → 200 且有真实候选 |
| 题目详情 | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/question/COP006` → 200 |
| 前端已更新 | 首页 `Last-Modified` 变化；`/var/www/wenjing/assets/` 哈希与本地 `dist/assets/` 一致 |
| 真实模型可用 | `POST /api/chat` 返回 200 且有讲解正文（见第六节实测样例） |
| 错误契约 | 无效 Key 时 502 含 `retryable`/`retry_after_seconds` 且带 `Retry-After` 头；未配置 Key 时 503 含 `retryable=false` |

---

## 四、回滚步骤

**后端回滚（优先，分钟级）**

```bash
docker rm -f wenjing-backend
docker run -d --name wenjing-backend --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  --env-file /opt/wenjing/backend.env \
  -v /opt/wenjing/app/backend/data:/app/data \
  wenjing-backend:backup-YYYYMMDD-HHMM
```

**前端回滚**

```bash
rm -rf /var/www/wenjing.new
mkdir -p /var/www/wenjing.new
tar -xzf /opt/backup-web-backup-YYYYMMDD-HHMM.tgz -C /var/www/wenjing.new --strip-components=1
rsync -a --delete /var/www/wenjing.new/ /var/www/wenjing/
chown -R www-data:www-data /var/www/wenjing
```

回滚后按第三节验证清单复核，并在发布记录里写明回滚时间与原因；线上验收**顺延**，不得写成通过。

---

## 五、环境变量

来源：`backend/.env.example`（仓库）+ 线上容器实际注入值（2026-11-09 实测）。

| 变量 | 线上实际值 / 说明 | 是否入库 |
| --- | --- | --- |
| `HOST` / `PORT` | `0.0.0.0` / `8000` | 可入库（示例值） |
| `CORS_ORIGINS` | `http://123.60.34.87` | 可入库 |
| `QUESTION_BANK_PATH` | 空（默认 `backend/data/questions.json`） | 可入库 |
| `SEARCH_ORIGINAL_THRESHOLD` / `SEARCH_SIMILAR_THRESHOLD` | `0.72` / `0.45` | 可入库 |
| `SEARCH_SIMILAR_ITEM_MIN_SCORE` / `SEARCH_MAX_SIMILAR` | `0.35` / `5` | 可入库 |
| `SEARCH_UNVERIFIED_POLICY` / `SEARCH_MAX_INPUT_LENGTH` | `downgrade` / `4000` | 可入库 |
| `MAX_UPLOAD_BYTES` / `ALLOWED_UPLOAD_EXTENSIONS` | `20971520` / `.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.pptx,.txt,.md,.markdown,.json,.csv` | 可入库 |
| `LLM_API_KEY` | 已配置（值仅存服务器，**绝不入库、不写文档**） | ❌ |
| `LLM_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4/`（智谱 OpenAI 兼容接口） | 可入库（非密） |
| `LLM_MODEL` | `glm-5.3-flash` | 可入库 |
| `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` / `LLM_TIMEOUT_SECONDS` | `.env.example` 有定义 | 可入库 |
| `LLM_THINKING_MODE` / `LLM_REASONING_EFFORT` / `LLM_CLEAR_THINKING` | **线上容器额外存在**（`enabled` / `low` / `true`），仓库 `.env.example` 未声明 | 可入库（非密） |

> ⚠️ **重建容器时这三个 `LLM_THINKING_*` 变量必须照抄**，否则会丢模型思考配置（表现为讲解风格/耗时变化）。建议 W 包（模型配置）或 J 包把它补进 `.env.example`，H 包不擅自改后端配置文件。

---

## 六、模型可用性核查（H3，2026-11-09 实测）

| 场景 | 结果 |
| --- | --- |
| 线上 `POST /api/chat`（经 Nginx） | `HTTP 200`，`3.47s`，返回 361 字符完整讲解（四路组相联地址划分：标记 20 / 组号 8 / 块内 6）→ **真实模型可用** |
| 无效 Key（临时容器 `:18080`，`LLM_API_KEY=sk-invalid...`） | `HTTP 502`，body `{"detail":{"code":"llm_upstream_error","message":"云端模型调用失败"}}` |
| 未配置 Key（临时容器 `:18081`，`LLM_API_KEY` 为空） | `HTTP 503`，body `{"detail":{"code":"llm_not_configured","message":"未配置 LLM_API_KEY，..."}}` |

**问题**：线上 502/503 响应体**缺少 `retryable` / `retry_after_seconds`，也没有 `Retry-After` 头**；而当前主干 `backend/app/api/chat.py` 的实现是：502 → `retryable: true` + `retry_after_seconds: 5` + `Retry-After: 5`，503 → `retryable: false`。
原因已定位：线上镜像构建于 **2026-10-30 21:04**，而该契约由 **2026-11-03 的提交 `0b91e05`** 引入，线上镜像是旧版（同一原因导致 `/api/recommend`、`/api/question/{id}` 线上 404）。
→ **11/16 部署必须重新构建镜像**，`restart` 旧容器不会生效；部署后请 K 包复测 502/503 契约。

---

## 七、版本矩阵与依赖固定策略（本轮决策）

| 环境 | Python | Node |
| --- | --- | --- |
| GitHub Actions（后端 CI） | **3.11 + 3.12 双矩阵**（3.11 为基准，3.12 为前瞻） | — |
| GitHub Actions（前端 CI） | — | **22** |
| Docker（backend） | `python:3.11-slim`（与线上容器一致） | — |
| Docker（frontend，构建阶段） | — | `node:22-alpine` → `nginx:1.27-alpine` |
| 线上容器 | 3.11 | — |
| 宿主机 | 3.12.3（不参与运行） | 未安装 |
| 开发机（本轮实测） | — | 22.21.0 |

**决策**：
1. **运行时基准统一为 Python 3.11 + Node 22**；CI 额外跑 3.12 只作兼容性预警，不阻塞合并。
2. `requirements.txt` 继续保持 `>=`（不锁死），**可复现性由镜像保证**：每次发布把 `docker run --rm <image> pip freeze` 的结果归档进发布记录，作为事实上的 lock。
3. 前端依赖由 `package-lock.json`（lockfileVersion 3）锁定，CI/镜像统一 `npm ci`。

---

## 八、发布记录模板（每次发布复制一份填写）

```markdown
### 发布记录 YYYY-MM-DD HH:MM (+08)

- 候选 commit：<sha>（main@<sha>）
- 题库：questions=<N>，verified=<N>，skipped=<[]>
- 模型：LLM_MODEL=<model>，LLM_BASE_URL=<host>
- 后端镜像：wenjing-backend:<tag>（备份旧镜像 wenjing-backend:backup-<ts>）
- 前端：dist 资源主文件 index-<hash>.js，dist 大小 <KB>
- 环境变量变更：无 / <列出>
- 验证：health ✅ / recommend ✅ / question ✅ / chat ✅ / 502 契约 ✅ / 502 头 Retry-After ✅
- 回滚点：镜像 backup-<ts>，静态资源 /opt/backup-web-<ts>.tgz
- 操作人：林子涵
- 遗留：<无 / 列出>
```

---

## 九、当前遗留与风险

1. 线上仍是 10/30 版本（health `questions=16`、无 `llm_configured`），与主干 81 题不一致 —— **属预期**，11/16 部署时关闭 BUG-01。
2. 服务器不能直连 Docker Hub / pypi.org，构建需镜像源（第二节）；镜像源若整体不可用，回退方案：本地构建后 `docker save` + `scp` + `docker load`。
3. 线上未配 TLS（仅 HTTP 80）；如需 HTTPS 需额外申请证书并改 Nginx，本轮不做。
4. 环境变量目前靠 `docker run -e` 注入，未收敛成 env 文件；建议按第三节改成 `--env-file`，避免重建容器时丢变量。
5. 前端构建依赖 Node，宿主机没有 Node：线上更新前端只能在别的机器构建后同步 `dist/`，或在服务器上用临时容器构建（本手册用服务器容器内构建，已验证可行）。
