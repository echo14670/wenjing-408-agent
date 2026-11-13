# 开发指南（Alpha · 可复现开发基线）

> 维护：叶凯乐（TL）｜ 更新：2026-11-13 ｜ 目标：让「文档约定」与「主干实际能力」「别人运行结果」一致

## 一、快速启动

### 后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows；Mac/Linux 用 source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # 填 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
uvicorn main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm ci                            # 锁定依赖
npm run dev                       # http://localhost:5173
```

### 自检

```bash
# 后端
cd backend && python -m pytest -q          # 基线 106 passed
# 数据
python tools/convert_questions.py stats data/questions.json   # 81 题，skipped 空
# 前端
cd frontend && npm test && npm run build   # 5 套测试 + 构建
```

## 二、接口冒烟（curl）

```bash
# 健康检查（含模型配置状态）
curl http://localhost:8000/api/health
# 搜题三态
curl -X POST http://localhost:8000/api/search -H "Content-Type: application/json" \
  -d '{"raw_input":"某 Cache 采用四路组相联","input_type":"text"}'
# 题目详情
curl http://localhost:8000/api/question/COP006
# 推荐
curl -X POST http://localhost:8000/api/recommend -H "Content-Type: application/json" \
  -d '{"question_id":"COP006","done_question_ids":[],"top_k":3,"include_unverified":false}'
# 上传（文字层 PDF）
curl -X POST http://localhost:8000/api/upload -F "file=@notes.pdf"
```

## 三、接口清单与状态

| 接口 | 方法 | 状态 |
| :--- | :--- | :--- |
| `/api/search` | POST | 已实现 |
| `/api/chat` | POST | 已实现（502/503 含 retryable） |
| `/api/upload` | POST | 已实现（400/413/415 detail） |
| `/api/recommend` | POST | 已实现（`questions/scope/notice`） |
| `/api/question/{id}` | GET | **计划中**（周玘晖 C 包，未合入） |
| `/api/health` | GET | 已实现（`llm_configured/llm_model` 扩展计划中） |

> 注意区分「约定」与「实际已实现」：`question` 详情与 `health` 模型字段是冻结契约（§3.4），后端实现由周玘晖完成，未合入前不写成已上线。

## 四、数据与存储

| 数据 | 位置 | 说明 |
| :--- | :--- | :--- |
| 题库 | `backend/data/questions.json` | 81 题 v1.1，启动内存只读 |
| 回归样例 | `backend/data/questions.sample.json` | 16 题，含 Cache 基准 Q001 |
| 问答历史 | 浏览器 `history:v1` | 前端 LocalStorage |
| 个人资料 | 浏览器 `materials:v1` | 前端 LocalStorage，切片透传 |

## 五、环境变量（脱敏）

| 变量 | 用途 |
| :--- | :--- |
| `LLM_API_KEY` | 模型 Key（**不入库、不返回**） |
| `LLM_BASE_URL` | 模型服务地址 |
| `LLM_MODEL` | 模型名（如 `deepseek-flash`） |
| `CORS_ORIGINS` | 允许的前端源 |
| `MAX_UPLOAD_BYTES` / `ALLOWED_UPLOAD_EXTENSIONS` | 上传限制 |

## 六、四条业务红线

1. 三态隔离：相似题仅展示，不进追问。
2. 防幻觉：未命中不编造年份/页码，来源分级标注。
3. 引导不泄底：标准答案不进 Prompt，输出再查泄露。
4. 无状态切片：个人资料随 `context_chunks` 透传，后端不落库。
