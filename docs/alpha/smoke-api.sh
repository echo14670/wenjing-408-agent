#!/usr/bin/env bash
# 接口冒烟：对本地后端逐一请求主接口，打印状态码与关键字段。
# 用法：bash docs/alpha/smoke-api.sh [base_url]
set -u
BASE="${1:-http://localhost:8000}"

echo "== 1. health =="
curl -s -o /dev/null -w "status=%{http_code}\n" "$BASE/api/health"
curl -s "$BASE/api/health" | head -c 300; echo

echo "== 2. search（原题/相似/未命中三态）=="
curl -s -X POST "$BASE/api/search" -H "Content-Type: application/json" \
  -d '{"raw_input":"某 Cache 采用四路组相联","input_type":"text"}' | head -c 300; echo

echo "== 3. question 详情（计划中，C 包实现后验证）=="
curl -s -o /dev/null -w "status=%{http_code}\n" "$BASE/api/question/COP006"

echo "== 4. recommend =="
curl -s -X POST "$BASE/api/recommend" -H "Content-Type: application/json" \
  -d '{"question_id":"COP006","done_question_ids":[],"top_k":3,"include_unverified":false}' | head -c 300; echo

echo "== 5. upload（需本地准备 notes.pdf）=="
# curl -s -X POST "$BASE/api/upload" -F "file=@notes.pdf" | head -c 300; echo
echo "(跳过：需先准备文字层 PDF 文件)"

echo "== 6. chat（未配 Key 时返回 503 llm_not_configured）=="
curl -s -o /dev/null -w "status=%{http_code}\n" -X POST "$BASE/api/chat" -H "Content-Type: application/json" \
  -d '{"session_messages":[{"role":"user","content":"为什么第三步这样算？"}],"question_id":null,"user_answer":"","mode":"guided","context_chunks":[]}'
