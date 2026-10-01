"""Polling, clip cache and thumbnails."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import time
from datetime import timedelta
from pathlib import Path

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
    CONF_KEEP_CLIPS,
    CONF_LOOKBACK_HOURS,
    CONF_PREFETCH,
    CONF_RECORDINGS_PATH,
    DEFAULT_CACHE_MB,
    DEFAULT_KEEP_CLIPS,
    DEFAULT_LOOKBACK_HOURS,
    DEFAULT_PREFETCH,
    DOMAIN,
    EVENT_NEW_RECORDING,
    SCAN_INTERVAL_SECONDS,
)

_LOGGER = logging.getLogger(__name__)

SETTLE_SECONDS = 90
OPEN_ENDED_SECONDS = 600


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
        self.store = ClipStore(
            hass,
            entry.entry_id,
            api,
            keep_clips=entry.options.get(CONF_KEEP_CLIPS, DEFAULT_KEEP_CLIPS),
            recordings_path=entry.options.get(CONF_RECORDINGS_PATH, "") or "",
        )
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

        await self.store.load_durations()
        for rec in recordings:
            self.store.apply_duration(rec)

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
    """Serves clips and keeps thumbnails (and optionally clips) on disk."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str,
        api: SurveillanceApi,
        keep_clips: bool = False,
        recordings_path: str = "",
    ) -> None:
        self.hass = hass
        self.api = api
        self.keep_clips = keep_clips
        self.recordings_root = Path(recordings_path) if recordings_path else None
        self.root = Path(hass.config.path(CACHE_DIR, entry_id))
        self._tmp = self.root / "tmp"
        self._locks: dict[int, asyncio.Lock] = {}
        self._thumb_locks: dict[int, asyncio.Lock] = {}
        self._download_slots = asyncio.Semaphore(2)
        self._failed: set[int] = set()
        self._durations: dict[int, int] | None = None
        self._camera_dirs: dict[str, Path] = {}

    def clip_path(self, rec_id: int) -> Path:
        return self.root / f"{rec_id}.mp4"

    def thumb_path(self, rec_id: int) -> Path:
        return self.root / f"{rec_id}.jpg"

    def _meta_path(self) -> Path:
        return self.root / "durations.json"

    def _lock(self, rec_id: int) -> asyncio.Lock:
        return self._locks.setdefault(rec_id, asyncio.Lock())

    async def load_durations(self) -> None:
        if self._durations is not None:
            return

        def _read() -> dict[int, int]:
            try:
                raw = json.loads(self._meta_path().read_text())
                return {int(k): int(v) for k, v in raw.items()}
            except (OSError, ValueError):
                return {}

        self._durations = await asyncio.to_thread(_read)

    async def _save_durations(self) -> None:
        data = {str(k): v for k, v in (self._durations or {}).items()}

        def _write() -> None:
            self.root.mkdir(parents=True, exist_ok=True)
            self._meta_path().write_text(json.dumps(data))

        await asyncio.to_thread(_write)

    def apply_duration(self, rec: Recording) -> None:
        if not rec.exact and self._durations and rec.id in self._durations:
            rec.stop = rec.start + self._durations[rec.id]

    def _find_local(self, rec: Recording) -> Path | None:
        if self.recordings_root is None or not rec.file_path:
            return None
        rel = rec.file_path.lstrip("/")
        known = self._camera_dirs.get(rec.camera_name)
        candidates = [known / rel] if known else []
        candidates += [self.recordings_root / rec.camera_name / rel, self.recordings_root / rel]
        for candidate in candidates:
            if candidate.is_file():
                return candidate
        try:
            for folder in self.recordings_root.iterdir():
                if folder.is_dir() and (folder / rel).is_file():
                    self._camera_dirs[rec.camera_name] = folder
                    return folder / rel
        except OSError:
            pass
        return None

    async def clip_source(self, rec: Recording) -> Path | None:
        """A file that holds the clip, or None if it has to be streamed."""
        local = await asyncio.to_thread(self._find_local, rec)
        if local:
            return local
        cached = self.clip_path(rec.id)
        if await asyncio.to_thread(cached.exists):
            return cached
        if self.keep_clips:
            return await self.ensure_clip(rec)
        return None

    async def ensure_clip(self, rec: Recording) -> Path:
        path = self.clip_path(rec.id)
        async with self._lock(rec.id):
            if await asyncio.to_thread(path.exists):
                return path
            async with self._download_slots:
                await self.api.download(rec, path)
        await self._learn_duration(rec, path)
        return path

    async def _learn_duration(self, rec: Recording, clip: Path) -> None:
        if rec.exact or not self._settled(rec, time.time()):
            return
        await self.load_durations()
        if rec.id in self._durations:
            return
        duration = await self._probe_duration(clip)
        if duration:
            self._durations[rec.id] = duration
            rec.stop = rec.start + duration
            await self._save_durations()

    async def _run_ffmpeg(self, *args: str) -> tuple[int, str]:
        try:
            proc = await asyncio.create_subprocess_exec(
                self._ffmpeg(),
                "-hide_banner",
                *args,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            _LOGGER.warning("ffmpeg not found, thumbnails are disabled")
            return -1, ""
        _, err = await proc.communicate()
        return proc.returncode or 0, err.decode(errors="ignore")

    async def _probe_duration(self, clip: Path) -> int | None:
        _, out = await self._run_ffmpeg("-i", str(clip))
        match = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", out)
        if not match:
            return None
        h, m, sec = match.groups()
        return max(1, round(int(h) * 3600 + int(m) * 60 + float(sec)))

    async def ensure_thumb(self, rec: Recording) -> Path | None:
        thumb = self.thumb_path(rec.id)
        if await asyncio.to_thread(thumb.exists):
            return thumb
        async with self._thumb_locks.setdefault(rec.id, asyncio.Lock()):
            if await asyncio.to_thread(thumb.exists):
                return thumb
            source = await self.clip_source(rec)
            temp: Path | None = None
            if source is None:
                temp = self._tmp / f"{rec.id}.mp4"
                async with self._download_slots:
                    await self.api.download(rec, temp)
                source = temp
            try:
                await self._learn_duration(rec, source)
                await asyncio.to_thread(self.root.mkdir, parents=True, exist_ok=True)
                first = f"{min(1.0, rec.duration / 2):.2f}" if rec.duration else "1"
                err = ""
                for offset in (first, "0"):
                    code, err = await self._run_ffmpeg(
                        "-loglevel", "error", "-y", "-ss", offset, "-i", str(source),
                        "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", str(thumb),
                    )
                    if code == -1:
                        return None
                    if code == 0 and await asyncio.to_thread(thumb.exists):
                        return thumb
                _LOGGER.debug("Thumbnail for %s failed: %s", rec.id, err)
                return None
            finally:
                if temp is not None:
                    await asyncio.to_thread(temp.unlink, True)

    def _ffmpeg(self) -> str:
        try:
            from homeassistant.components.ffmpeg import get_ffmpeg_manager

            return get_ffmpeg_manager(self.hass).binary
        except (ImportError, KeyError, ValueError):
            return shutil.which("ffmpeg") or "ffmpeg"

    @staticmethod
    def _settled(rec: Recording, now: float) -> bool:
        if rec.exact:
            return rec.stop <= now - SETTLE_SECONDS
        return rec.start <= now - OPEN_ENDED_SECONDS

    async def maintain(
        self, recordings: list[Recording], max_bytes: int, prefetch: bool
    ) -> None:
        await self.load_durations()
        dropped = await asyncio.to_thread(self._cleanup, recordings, max_bytes)
        if dropped and self._durations:
            for rec_id in dropped:
                self._durations.pop(rec_id, None)
                self._failed.discard(rec_id)
            await self._save_durations()
        if not prefetch:
            return
        now = time.time()
        for rec in sorted(recordings, key=lambda r: r.start, reverse=True):
            if not self._settled(rec, now) or rec.id in self._failed:
                continue
            if await asyncio.to_thread(self.thumb_path(rec.id).exists):
                continue
            if self.keep_clips and await asyncio.to_thread(self._size) > max_bytes:
                break
            try:
                if await self.ensure_thumb(rec) is None:
                    self._failed.add(rec.id)
            except SurveillanceError as err:
                self._failed.add(rec.id)
                _LOGGER.debug("Prefetch of %s failed: %s", rec.id, err)
            except OSError as err:
                _LOGGER.warning("Could not write thumbnail cache: %s", err)
                return
            except Exception:
                _LOGGER.exception("Unexpected error while caching recording %s", rec.id)
                self._failed.add(rec.id)

    def _size(self) -> int:
        if not self.root.exists():
            return 0
        return sum(p.stat().st_size for p in self.root.iterdir() if p.is_file())

    def _cleanup(self, recordings: list[Recording], max_bytes: int) -> set[int]:
        """Remove stale files, and clips that are not wanted or were fetched too early."""
        if not self.root.exists():
            return set()
        by_id = {rec.id: rec for rec in recordings}
        now = time.time()
        dropped: set[int] = set()
        if self._tmp.exists():
            for path in self._tmp.iterdir():
                if now - path.stat().st_mtime > 3600:
                    path.unlink(missing_ok=True)
        files = []
        for path in self.root.iterdir():
            if not path.is_file() or path.name == "durations.json":
                continue
            if path.suffix == ".part":
                if now - path.stat().st_mtime > 3600:
                    path.unlink(missing_ok=True)
                continue
            stem = path.stem
            rec = by_id.get(int(stem)) if stem.isdigit() else None
            if rec is None:
                path.unlink(missing_ok=True)
                if stem.isdigit():
                    dropped.add(int(stem))
                continue
            if path.suffix == ".mp4":
                if not self.keep_clips:
                    path.unlink(missing_ok=True)
                    continue
                if self._settled(rec, now):
                    complete_after = (
                        rec.stop + 30 if rec.exact else rec.start + OPEN_ENDED_SECONDS
                    )
                    if path.stat().st_mtime < complete_after:
                        path.unlink(missing_ok=True)
                        self.thumb_path(rec.id).unlink(missing_ok=True)
                        dropped.add(rec.id)
                        continue
            files.append(path)
        files = [p for p in files if p.exists()]
        total = sum(p.stat().st_size for p in files)
        for path in sorted(files, key=lambda p: p.stat().st_mtime):
            if total <= max_bytes:
                break
            if path.suffix == ".mp4":
                total -= path.stat().st_size
                path.unlink(missing_ok=True)
        return dropped

    def remove_all(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)
