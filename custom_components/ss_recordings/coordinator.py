"""Polling, clip cache and thumbnails."""

from __future__ import annotations

import asyncio
from datetime import timedelta
import logging
from pathlib import Path
import shutil
import time

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import (
    Recording,
    SurveillanceApi,
    SurveillanceAuthError,
    SurveillanceError,
)
from .const import (
    CACHE_DIR,
    CONF_CACHE_MB,
    CONF_LOOKBACK_HOURS,
    CONF_PREFETCH,
    DEFAULT_CACHE_MB,
    DEFAULT_LOOKBACK_HOURS,
    DEFAULT_PREFETCH,
    DOMAIN,
    EVENT_NEW_RECORDING,
    SCAN_INTERVAL_SECONDS,
)

_LOGGER = logging.getLogger(__name__)

SETTLE_SECONDS = 90


class RecordingsCoordinator(DataUpdateCoordinator[dict[int, Recording]]):
    """Keeps the list of recordings inside the lookback window."""

    def __init__(
        self, hass: HomeAssistant, entry: ConfigEntry, api: SurveillanceApi
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=timedelta(seconds=SCAN_INTERVAL_SECONDS),
        )
        self.api = api
        self.cameras: dict[int, str] = {}
        self.store = ClipStore(hass, entry.entry_id, api)
        self._known: set[int] | None = None
        self._prefetch_task: asyncio.Task | None = None

    @property
    def lookback_hours(self) -> int:
        return int(
            self.config_entry.options.get(CONF_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS)
        )

    async def _async_update_data(self) -> dict[int, Recording]:
        now = int(time.time())
        since = now - self.lookback_hours * 3600
        try:
            if not self.cameras or self._known is None:
                self.cameras = await self.api.cameras()
            recordings = await self.api.recordings(since, now, self.cameras)
        except SurveillanceAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except SurveillanceError as err:
            raise UpdateFailed(str(err)) from err

        data = {rec.id: rec for rec in recordings}
        if self._known is not None:
            for rec in recordings:
                if rec.id not in self._known:
                    self.hass.bus.async_fire(
                        EVENT_NEW_RECORDING,
                        {**rec.as_dict(), "entry_id": self.config_entry.entry_id},
                    )
        self._known = set(data)

        options = self.config_entry.options
        cache_bytes = int(options.get(CONF_CACHE_MB, DEFAULT_CACHE_MB)) * 1024 * 1024
        if self._prefetch_task is None or self._prefetch_task.done():
            self._prefetch_task = self.config_entry.async_create_background_task(
                self.hass,
                self.store.maintain(
                    recordings,
                    cache_bytes,
                    prefetch=options.get(CONF_PREFETCH, DEFAULT_PREFETCH),
                ),
                f"{DOMAIN}_cache",
            )
        return data


class ClipStore:
    """Downloads clips on demand and keeps them on disk for fast replay."""

    def __init__(self, hass: HomeAssistant, entry_id: str, api: SurveillanceApi) -> None:
        self.hass = hass
        self.api = api
        self.root = Path(hass.config.path(CACHE_DIR, entry_id))
        self._locks: dict[int, asyncio.Lock] = {}
        self._download_slots = asyncio.Semaphore(2)
        self._failed: set[int] = set()

    def clip_path(self, rec_id: int) -> Path:
        return self.root / f"{rec_id}.mp4"

    def thumb_path(self, rec_id: int) -> Path:
        return self.root / f"{rec_id}.jpg"

    def _lock(self, rec_id: int) -> asyncio.Lock:
        return self._locks.setdefault(rec_id, asyncio.Lock())

    async def ensure_clip(self, rec: Recording) -> Path:
        path = self.clip_path(rec.id)
        async with self._lock(rec.id):
            if await asyncio.to_thread(path.exists):
                return path
            async with self._download_slots:
                await self.api.download(rec, path)
        return path

    async def ensure_thumb(self, rec: Recording) -> Path | None:
        thumb = self.thumb_path(rec.id)
        if await asyncio.to_thread(thumb.exists):
            return thumb
        clip = await self.ensure_clip(rec)
        async with self._lock(rec.id):
            if await asyncio.to_thread(thumb.exists):
                return thumb
            offset = f"{min(1.0, rec.duration / 2):.2f}"
            try:
                proc = await asyncio.create_subprocess_exec(
                    self._ffmpeg(),
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-ss",
                    offset,
                    "-i",
                    str(clip),
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale=480:-2",
                    "-q:v",
                    "5",
                    str(thumb),
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                )
            except FileNotFoundError:
                _LOGGER.warning("ffmpeg not found, thumbnails are disabled")
                return None
            _, err = await proc.communicate()
            if proc.returncode != 0 or not await asyncio.to_thread(thumb.exists):
                _LOGGER.debug("Thumbnail for %s failed: %s", rec.id, err.decode(errors="ignore"))
                return None
        return thumb

    def _ffmpeg(self) -> str:
        try:
            from homeassistant.components.ffmpeg import get_ffmpeg_manager

            return get_ffmpeg_manager(self.hass).binary
        except (ImportError, KeyError, ValueError):
            return shutil.which("ffmpeg") or "ffmpeg"

    async def maintain(
        self, recordings: list[Recording], max_bytes: int, prefetch: bool
    ) -> None:
        keep = {rec.id for rec in recordings}
        await asyncio.to_thread(self._cleanup, keep, max_bytes)
        if not prefetch:
            return
        now = time.time()
        for rec in sorted(recordings, key=lambda r: r.start, reverse=True):
            if rec.stop > now - SETTLE_SECONDS:
                continue
            if rec.id in self._failed:
                continue
            if await asyncio.to_thread(self.thumb_path(rec.id).exists):
                continue
            if await asyncio.to_thread(self._size) > max_bytes:
                break
            try:
                if await self.ensure_thumb(rec) is None:
                    self._failed.add(rec.id)
            except SurveillanceError as err:
                self._failed.add(rec.id)
                _LOGGER.debug("Prefetch of %s failed: %s", rec.id, err)
            except OSError as err:
                _LOGGER.warning("Could not write clip cache: %s", err)
                return
            except Exception:
                _LOGGER.exception("Unexpected error while caching recording %s", rec.id)
                self._failed.add(rec.id)

    def _size(self) -> int:
        if not self.root.exists():
            return 0
        return sum(p.stat().st_size for p in self.root.iterdir() if p.is_file())

    def _cleanup(self, keep: set[int], max_bytes: int) -> None:
        if not self.root.exists():
            return
        files = []
        for path in self.root.iterdir():
            if not path.is_file():
                continue
            stem = path.stem
            if path.suffix == ".part":
                if time.time() - path.stat().st_mtime > 3600:
                    path.unlink(missing_ok=True)
                continue
            if not stem.isdigit() or int(stem) not in keep:
                path.unlink(missing_ok=True)
                continue
            files.append(path)
        total = sum(p.stat().st_size for p in files)
        for path in sorted(files, key=lambda p: p.stat().st_mtime):
            if total <= max_bytes:
                break
            if path.suffix == ".mp4":
                total -= path.stat().st_size
                path.unlink(missing_ok=True)

    def remove_all(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)
