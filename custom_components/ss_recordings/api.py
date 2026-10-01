"""Minimal async client for the Synology Surveillance Station Web API."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any

import aiohttp

_LOGGER = logging.getLogger(__name__)

API_INFO = "SYNO.API.Info"
API_AUTH = "SYNO.API.Auth"
API_CAMERA = "SYNO.SurveillanceStation.Camera"
API_RECORDING = "SYNO.SurveillanceStation.Recording"

SESSION_ERRORS = {105, 106, 107, 119}
AUTH_ERRORS = {400, 401, 402, 403, 404, 407}


class SurveillanceError(Exception):
    """Generic API error."""

    def __init__(self, message: str, code: int | None = None) -> None:
        super().__init__(message)
        self.code = code


class SurveillanceAuthError(SurveillanceError):
    """Login failed."""


class SurveillanceConnectionError(SurveillanceError):
    """DSM not reachable."""


@dataclass(slots=True)
class Recording:
    """A single Surveillance Station recording."""

    id: int
    camera_id: int
    camera_name: str
    start: int
    stop: int
    mount_id: int | None
    reason: str | None
    size: int | None

    @property
    def duration(self) -> int:
        return max(self.stop - self.start, 0)

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "camera_id": self.camera_id,
            "camera_name": self.camera_name,
            "start": self.start,
            "stop": self.stop,
            "duration": self.duration,
            "reason": self.reason,
            "size": self.size,
        }


REASONS = {
    0: "none",
    1: "continuous",
    2: "motion",
    3: "digital_input",
    4: "digital_input",
    5: "manual",
    6: "external",
    7: "analytics",
    8: "edge",
    9: "action_rule",
    10: "action_rule",
    11: "audio",
    12: "tampering",
}


def _to_seconds(value: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    if number > 100_000_000_000:
        number //= 1000
    return number


def _first(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
    return None


class SurveillanceApi:
    """Talks to DSM using a dedicated Surveillance Station session."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        host: str,
        port: int,
        use_ssl: bool,
        username: str,
        password: str,
    ) -> None:
        self._session = session
        self._base = f"{'https' if use_ssl else 'http'}://{host}:{port}/webapi/"
        self._username = username
        self._password = password
        self._sid: str | None = None
        self._apis: dict[str, dict[str, Any]] = {}
        self._login_lock = asyncio.Lock()
        self.last_list_info: dict[str, Any] = {}

    async def _raw(
        self, path: str, params: dict[str, Any], timeout: float = 30
    ) -> dict[str, Any]:
        try:
            async with self._session.get(
                self._base + path,
                params={k: str(v) for k, v in params.items() if v is not None},
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as resp:
                resp.raise_for_status()
                return await resp.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise SurveillanceConnectionError(str(err)) from err

    async def _load_apis(self) -> None:
        data = await self._raw(
            "query.cgi",
            {
                "api": API_INFO,
                "version": 1,
                "method": "query",
                "query": f"{API_AUTH},SYNO.SurveillanceStation.",
            },
        )
        if not data.get("success"):
            raise SurveillanceError("SYNO.API.Info query failed")
        self._apis = data.get("data", {})
        if API_RECORDING not in self._apis:
            raise SurveillanceError(
                "Surveillance Station API not found. Is the package installed and running?"
            )

    def api_versions(self) -> dict[str, Any]:
        return {
            name: {k: info.get(k) for k in ("path", "minVersion", "maxVersion")}
            for name, info in self._apis.items()
            if name in (API_AUTH, API_CAMERA, API_RECORDING)
        }

    def _api(self, name: str) -> tuple[str, int]:
        info = self._apis.get(name)
        if not info:
            raise SurveillanceError(f"API {name} is not available")
        return info["path"], int(info["maxVersion"])

    async def login(self) -> None:
        async with self._login_lock:
            if not self._apis:
                await self._load_apis()
            path, version = self._api(API_AUTH)
            data = await self._raw(
                path,
                {
                    "api": API_AUTH,
                    "version": min(version, 6),
                    "method": "login",
                    "account": self._username,
                    "passwd": self._password,
                    "session": "SurveillanceStation",
                    "format": "sid",
                },
            )
            if not data.get("success"):
                code = data.get("error", {}).get("code")
                if code in AUTH_ERRORS:
                    raise SurveillanceAuthError(
                        "Invalid credentials or 2FA enabled for this account", code
                    )
                raise SurveillanceError(f"Login failed ({code})", code)
            self._sid = data["data"]["sid"]

    async def logout(self) -> None:
        if not self._sid:
            return
        try:
            path, _ = self._api(API_AUTH)
            await self._raw(
                path,
                {
                    "api": API_AUTH,
                    "version": 1,
                    "method": "logout",
                    "session": "SurveillanceStation",
                    "_sid": self._sid,
                },
            )
        except SurveillanceError:
            pass
        self._sid = None

    async def _call(
        self, api: str, method: str, version: int | None = None, **params: Any
    ) -> dict[str, Any]:
        for attempt in range(2):
            if self._sid is None:
                await self.login()
            path, max_version = self._api(api)
            data = await self._raw(
                path,
                {
                    "api": api,
                    "method": method,
                    "version": min(version or max_version, max_version),
                    "_sid": self._sid,
                    **params,
                },
            )
            if data.get("success"):
                return data.get("data") or {}
            code = data.get("error", {}).get("code")
            if code in SESSION_ERRORS and attempt == 0:
                self._sid = None
                continue
            raise SurveillanceError(f"{api}.{method} failed ({code})", code)
        raise SurveillanceError(f"{api}.{method} failed")

    async def cameras(self) -> dict[int, str]:
        data = await self._call(API_CAMERA, "List", version=9, basic="true")
        result: dict[int, str] = {}
        for cam in data.get("cameras", []):
            cam_id = int(cam.get("id", 0))
            result[cam_id] = str(
                _first(cam, "newName", "name", "camera_name") or f"Camera {cam_id}"
            )
        return result

    async def list_raw(self, **params: Any) -> dict[str, Any]:
        return await self._call(API_RECORDING, "List", **params)

    @staticmethod
    def _items(data: dict[str, Any]) -> list[dict[str, Any]]:
        items = _first(data, "events", "recordings", "data") or []
        return items if isinstance(items, list) else []

    def _in_window(
        self, items: list[dict[str, Any]], since: int, until: int, cameras: dict[int, str]
    ) -> list[Recording]:
        result = []
        for item in items:
            rec = self._parse(item, cameras)
            if rec is not None and since <= rec.start <= until:
                result.append(rec)
        return result

    async def recordings(
        self, since: int, until: int, cameras: dict[int, str], limit: int = 500
    ) -> list[Recording]:
        data = await self.list_raw(offset=0, limit=limit, fromTime=since, toTime=until)
        items = self._items(data)
        found = self._in_window(items, since, until, cameras)
        info: dict[str, Any] = {
            "filtered_total": data.get("total"),
            "filtered_items": len(items),
            "filtered_in_window": len(found),
        }

        if not found:
            seen: dict[int, Recording] = {}
            scanned = 0
            for page in range(8):
                data = await self.list_raw(offset=page * limit, limit=limit)
                items = self._items(data)
                scanned += len(items)
                for rec in self._in_window(items, since, until, cameras):
                    seen[rec.id] = rec
                if len(items) < limit:
                    break
            found = list(seen.values())
            info.update(
                unfiltered_total=data.get("total"),
                unfiltered_scanned=scanned,
                unfiltered_in_window=len(found),
            )

        if items:
            info["sample_keys"] = sorted(items[0].keys())
        self.last_list_info = info
        _LOGGER.debug("Recording list: %s", info)
        found.sort(key=lambda r: r.start)
        return found

    @staticmethod
    def _parse(item: dict[str, Any], cameras: dict[int, str]) -> Recording | None:
        rec_id = _first(item, "id", "eventId", "event_id")
        if rec_id is None:
            return None
        start = _to_seconds(_first(item, "startTime", "start_time", "starttime"))
        stop = _to_seconds(_first(item, "stopTime", "stop_time", "endTime", "stoptime"))
        if not start or not stop or stop < start:
            return None
        camera_id = int(_first(item, "cameraId", "camera_id", "camId") or 0)
        reason = _first(item, "reason", "eventType", "type")
        if isinstance(reason, int) or (isinstance(reason, str) and reason.isdigit()):
            reason = REASONS.get(int(reason), str(reason))
        mount = _first(item, "mountId", "mount_id")
        size = _first(item, "sizeByte", "size", "eventSize")
        return Recording(
            id=int(rec_id),
            camera_id=camera_id,
            camera_name=cameras.get(camera_id)
            or str(_first(item, "camera_name", "cameraName") or f"Camera {camera_id}"),
            start=start,
            stop=stop,
            mount_id=int(mount) if mount not in (None, "") else None,
            reason=reason,
            size=int(size) if str(size or "").isdigit() else None,
        )

    async def download(self, rec: Recording, target: Path) -> None:
        """Write the recording as MP4 to target (via a .part file)."""
        part = target.with_suffix(".part")
        for attempt in range(2):
            if self._sid is None:
                await self.login()
            path, max_version = self._api(API_RECORDING)
            params = {
                "api": API_RECORDING,
                "method": "Download",
                "version": max_version,
                "id": rec.id,
                "mountId": rec.mount_id,
                "offsetTimeMs": 0,
                "playTimeMs": rec.duration * 1000 + 1000,
                "_sid": self._sid,
            }
            try:
                async with self._session.get(
                    self._base + path,
                    params={k: str(v) for k, v in params.items() if v is not None},
                    timeout=aiohttp.ClientTimeout(total=600, sock_read=60),
                ) as resp:
                    resp.raise_for_status()
                    if "json" in resp.content_type or "text" in resp.content_type:
                        data = await resp.json(content_type=None)
                        code = data.get("error", {}).get("code")
                        if code in SESSION_ERRORS and attempt == 0:
                            self._sid = None
                            continue
                        raise SurveillanceError(f"Download of {rec.id} failed ({code})", code)
                    await asyncio.to_thread(part.parent.mkdir, parents=True, exist_ok=True)
                    fh = await asyncio.to_thread(part.open, "wb")
                    try:
                        async for chunk in resp.content.iter_chunked(1 << 16):
                            await asyncio.to_thread(fh.write, chunk)
                    finally:
                        await asyncio.to_thread(fh.close)
                await asyncio.to_thread(part.replace, target)
                return
            except (aiohttp.ClientError, asyncio.TimeoutError) as err:
                await asyncio.to_thread(part.unlink, True)
                raise SurveillanceConnectionError(str(err)) from err
        raise SurveillanceError(f"Download of {rec.id} failed")
