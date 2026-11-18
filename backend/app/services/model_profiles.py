"""本地部署的模型连接记录。公开视图只返回密钥是否已保存。"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from ipaddress import ip_address
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock
from typing import Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


class ModelConfigError(RuntimeError):
    def __init__(self, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.status_code = status_code


class ModelConnection(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str | None = Field(default=None, min_length=1, max_length=64)
    kind: Literal["remote", "local"]
    base_url: str = Field(min_length=1, max_length=2048)

    @model_validator(mode="after")
    def normalize_url(self) -> ModelConnection:
        try:
            parsed = urlsplit(self.base_url)
            host = parsed.hostname
            port = parsed.port
        except ValueError as error:
            raise ValueError("请输入完整的模型 API 地址") from error
        if (
            not host or parsed.username is not None or parsed.password is not None
            or parsed.query or parsed.fragment
            or any(ch.isspace() or ch == chr(92) for ch in self.base_url)
        ):
            raise ValueError("API 地址需要包含协议和主机，密钥请填在单独的字段中")
        if self.kind == "local":
            if parsed.scheme not in {"http", "https"} or host not in LOOPBACK_HOSTS:
                raise ValueError("本地模型请使用本机回环地址，例如 http://127.0.0.1:11434/v1")
            if host == "localhost" and parsed.scheme == "http":
                host = "127.0.0.1"
        else:
            try:
                address = ip_address(host)
            except ValueError:
                address = None
            if parsed.scheme != "https" or host in LOOPBACK_HOSTS or (address and not address.is_global):
                raise ValueError("远程 API 请使用提供方的 HTTPS 地址")

        netloc = f"[{host}]" if ":" in host else host
        if port and not (parsed.scheme == "https" and port == 443 or parsed.scheme == "http" and port == 80):
            netloc += f":{port}"
        path = parsed.path.rstrip("/").removesuffix("/chat/completions")
        self.base_url = urlunsplit((parsed.scheme, netloc, path, "", ""))
        return self


class ModelDraft(ModelConnection):
    name: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=200)


@dataclass(frozen=True)
class ModelProfile:
    id: str
    kind: str
    name: str
    base_url: str
    model: str
    api_key: str = field(repr=False)

    def public(self) -> dict:
        fields = asdict(self)
        fields["has_key"] = bool(fields.pop("api_key"))
        return fields


class ModelProfiles:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = Lock()

    def list(self) -> list[ModelProfile]:
        with self._lock:
            return list(self._read().values())

    def get(self, profile_id: str) -> ModelProfile:
        with self._lock:
            return self._find(self._read(), profile_id)

    def connection_key(self, draft: ModelConnection, key: str) -> str:
        with self._lock:
            return self._key(self._read(), draft, key)

    def save(self, draft: ModelDraft, key: str) -> ModelProfile:
        with self._lock:
            profiles = self._read()
            profile = ModelProfile(
                id=draft.id or uuid4().hex, name=draft.name, kind=draft.kind,
                base_url=draft.base_url, model=draft.model, api_key=self._key(profiles, draft, key),
            )
            profiles[profile.id] = profile
            self._write(profiles)
            return profile

    @staticmethod
    def _find(profiles: dict[str, ModelProfile], profile_id: str) -> ModelProfile:
        if profile_id not in profiles:
            raise ModelConfigError("模型配置已失效，请重新选择模型", 404)
        return profiles[profile_id]

    def _key(self, profiles: dict[str, ModelProfile], draft: ModelConnection, key: str) -> str:
        previous = self._find(profiles, draft.id) if draft.id else None
        value = key.strip()
        if not value and previous and (previous.base_url, previous.kind) == (draft.base_url, draft.kind):
            value = previous.api_key
        if draft.kind == "remote" and not value:
            raise ModelConfigError("请输入此 API 地址的密钥")
        return value

    def _read(self) -> dict[str, ModelProfile]:
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            return {entry["id"]: ModelProfile(**entry) for entry in data}
        except FileNotFoundError:
            return {}
        except (OSError, ValueError, TypeError, KeyError) as error:
            raise ModelConfigError("无法读取本地模型配置", 500) from error

    def _write(self, profiles: dict[str, ModelProfile]) -> None:
        pending = None
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with NamedTemporaryFile(mode="w", encoding="utf-8", dir=self._path.parent, delete=False) as file:
                pending = Path(file.name)
                json.dump([asdict(profile) for profile in profiles.values()], file, ensure_ascii=False, indent=2)
            pending.replace(self._path)
        except OSError as error:
            raise ModelConfigError("无法保存本地模型配置", 500) from error
        finally:
            if pending:
                pending.unlink(missing_ok=True)
