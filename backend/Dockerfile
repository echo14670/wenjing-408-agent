FROM python:3.11-slim

# 国内/受限网络可覆盖：--build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PIP_INDEX_URL=https://pypi.org/simple

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -i "$PIP_INDEX_URL" -r requirements.txt

COPY . .

ENV PORT=8000
EXPOSE 8000

# 健康检查读 $PORT，避免端口迁移后 HEALTHCHECK 仍打旧端口
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'), timeout=4).status == 200 else 1)"

# 用 sh -c 展开 ${PORT}，让 ENV PORT 真正生效（旧版 CMD 硬编码 8000）
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
