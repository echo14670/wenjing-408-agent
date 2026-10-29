# 问径 · 408 智能体

> 面向 408 考研学生的搜题与答疑助手，提供题库精准检索、AI 引导式追问和本地资料解析。

当前阶段：仓库初始化与并行开发准备。

## 核心资源

- [项目总览（腾讯文档）](https://docs.qq.com/markdown/DYXBPbEdYWGtHYkVC)
- [开发交接与执行指南（腾讯文档）](https://docs.qq.com/markdown/DYWpLVFZ0dVZ3aGJh)
- [开发基准与设计规范（腾讯文档）](https://docs.qq.com/markdown/DYVZUc3RMUmJXVXFD)
- [Apifox API 契约](https://hr124ptabw.apifox.cn/)

## 仓库结构

```text
project-root/
├── frontend/                 # 前端项目
│   ├── public/               # 静态资源
│   ├── src/api/              # 请求封装
│   ├── src/assets/           # 图片与全局样式
│   ├── src/components/       # 公共组件
│   ├── src/router/           # 路由配置
│   ├── src/store/            # 状态管理
│   ├── src/utils/            # 工具函数
│   └── src/views/            # 核心页面
├── backend/                  # 后端项目
│   ├── app/api/              # 路由接口
│   ├── app/core/             # 配置
│   ├── app/schemas/          # 数据校验
│   ├── app/services/         # 业务逻辑
│   ├── data/questions.json   # 题库资产
│   └── tests/                # 后端测试
├── docs/                     # 交付文档
├── .gitignore
├── docker-compose.yml
└── README.md
```

## 协作规则

- `main` 是受保护主干，禁止直接 push。
- 开发分支使用 `feature/<scope>`，完成后通过 Pull Request 合入 `main`。
- PR 至少获得 1 个批准，由 TL 负责最终合并。
- 提交信息使用 `type: description`，例如 `feat: 新增检索接口`、`fix: 修复上传异常`。
- 接口字段和返回结构以 Apifox 为准。修改契约前必须报备 TL，并同步更新 Apifox。
- 禁止提交 `.env`、API Key、个人凭据和本地工作区文件。

## 快速开始

克隆仓库：

```powershell
git clone https://github.com/echo14670/wenjing-408-agent.git
cd wenjing-408-agent
```

### 后端（检索与答疑链路已就绪）

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt     # macOS / Linux：source .venv/bin/activate 后 pip install
copy .env.example .env                             # 按需修改阈值，.env 不要提交
.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

- 自检：`http://localhost:8000/api/health`（题目数、科目分布、核验状态、脏数据明细）
- 接口文档：`http://localhost:8000/docs`
- 测试：`pytest`（在 `backend` 目录下执行，64 条用例）
- Agent 接口：`POST /api/chat`，状态见 [docs/progress-agent-wangshengjie.md](docs/progress-agent-wangshengjie.md)

三态判定口径与阈值调优见 [docs/question-bank-design.md](docs/question-bank-design.md)。

### 前端

脚手架合入后在此补充依赖安装与启动命令。联调时把 `VITE_API_BASE_URL` 指向本地后端即可。

## 环境变量

- 前端本地配置使用 `frontend/.env.development`。
- 后端复制 `backend/.env.example` 为 `backend/.env` 后填写本地值。
- 真实密钥只放入本地 `.env`，不得提交到仓库。
- Agent 默认使用 DeepSeek OpenAI 兼容接口；本地填写 `LLM_API_KEY`，默认模型为 `deepseek-flash`。

## 部署

测试/演示环境地址：待部署后补充。
