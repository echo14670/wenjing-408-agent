"""旧版 Web 的本地模型配置路由。公开部署默认不启用。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from openai import APIStatusError, OpenAIError

from app.core.config import get_settings
from app.services.agent import LLMUpstreamError, OpenAICompatibleClient, openai_connection
from app.services.model_profiles import (
    LOOPBACK_HOSTS,
    ModelConfigError,
    ModelConnection,
    ModelDraft,
    ModelProfiles,
)

router = APIRouter(prefix="/api/model-config", tags=["model-config"])


@lru_cache(maxsize=4)
def _store(path: Path) -> ModelProfiles:
    return ModelProfiles(path)


def _is_loopback_origin(origin: str) -> bool:
    try:
        address = urlsplit(origin)
        return address.scheme in {"http", "https"} and address.hostname in LOOPBACK_HOSTS
    except ValueError:
        return False


def require_profiles(request: Request) -> ModelProfiles:
    settings = get_settings()
    if not settings.model_profiles_file:
        raise HTTPException(404, "当前部署未启用本地模型配置")
    if (
        request.client is None or request.client.host not in LOOPBACK_HOSTS
        or request.url.hostname not in LOOPBACK_HOSTS
    ):
        raise HTTPException(403, "模型配置仅供本机使用")
    origin = request.headers.get("origin")
    if origin and (origin not in settings.cors_origins or not _is_loopback_origin(origin)):
        raise HTTPException(403, "请从本地试用页打开模型配置")
    return _store(settings.model_profiles_file)


Store = Annotated[ModelProfiles, Depends(require_profiles)]
ProviderKey = Annotated[str, Header(alias="X-Wenjing-Provider-Key")]


def configured_client(base_url: str, model: str, key: str, *, test: bool = False) -> OpenAICompatibleClient:
    settings = get_settings()
    return OpenAICompatibleClient(
        api_key=key or "wenjing-local", base_url=base_url, model=model,
        temperature=None, max_tokens=None,
        timeout_seconds=min(settings.llm_timeout_seconds, 25) if test else settings.llm_timeout_seconds,
        use_direct_transport=True,
    )


@router.get("")
def profiles(store: Store) -> dict:
    try:
        return {"profiles": [profile.public() for profile in store.list()]}
    except ModelConfigError as error:
        raise HTTPException(error.status_code, str(error)) from error


@router.post("/profiles")
def save_profile(draft: ModelDraft, store: Store, provider_key: ProviderKey = "") -> dict:
    try:
        return store.save(draft, provider_key).public()
    except ModelConfigError as error:
        raise HTTPException(error.status_code, str(error)) from error


@router.post("/catalog")
async def catalog(draft: ModelConnection, store: Store, provider_key: ProviderKey = "") -> dict:
    try:
        key = store.connection_key(draft, provider_key)
        async with openai_connection(
            api_key=key or "wenjing-local", base_url=draft.base_url, timeout=10,
            max_retries=0, use_direct_transport=True,
        ) as client:
            page = await client.models.list()
        return {"models": sorted({model.id for model in page.data if model.id})}
    except ModelConfigError as error:
        raise HTTPException(error.status_code, str(error)) from error
    except APIStatusError as error:
        message = "服务未提供模型目录，请手动填写模型 ID。" if error.status_code == 404 else "读取模型目录失败，请核对 API 地址和密钥。"
        raise HTTPException(502, message) from error
    except (OpenAIError, ValueError) as error:
        raise HTTPException(502, "无法读取模型目录，请核对服务地址后重试。") from error


@router.post("/test")
async def test_profile(draft: ModelDraft, store: Store, provider_key: ProviderKey = "") -> dict:
    try:
        key = store.connection_key(draft, provider_key)
        client = configured_client(draft.base_url, draft.model, key, test=True)
        await client.complete(
            system="You are testing a model connection.",
            messages=[{"role": "user", "content": "Reply with OK."}],
        )
        return {"connected": True}
    except ModelConfigError as error:
        raise HTTPException(error.status_code, str(error)) from error
    except LLMUpstreamError as error:
        raise HTTPException(502, "模型未能返回有效回复，请核对服务地址、API 密钥和模型 ID。") from error
