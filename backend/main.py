"""问径 · 408 智能体后端启动入口。

    uvicorn main:app --reload --port 8000

当前已实现：/api/search（检索三态）、/api/health（自检）。
/api/chat 与 /api/upload 由 Agent 链路（王圣杰）与解析链路（高一鹏）在各自分支补齐，
注册路由时把对应 router include 进来即可，互不影响。
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, health, search
from app.core.config import get_settings
from app.deps import get_retrieval_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
logger = logging.getLogger("wenjing408")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时预热分词器与题库索引，避免首个请求承担加载开销。"""
    settings = get_settings()
    service = get_retrieval_service()
    logger.info(
        "启动完成：题库 %d 题，CORS=%s", service.size, ",".join(settings.cors_origins)
    )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="408 搜题与答疑助手后端：题库检索（original / similar / miss 三态）",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(search.router)
    app.include_router(chat.router)
    app.include_router(health.router)
    return app


app = create_app()
