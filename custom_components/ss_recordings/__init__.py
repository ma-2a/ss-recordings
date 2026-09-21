"""Surveillance Station Recordings for Home Assistant."""

from __future__ import annotations

import asyncio
from datetime import timedelta
from pathlib import Path
import shutil
import time
from typing import Any

from aiohttp import web
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.components.http.auth import async_sign_path
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    CONF_HOST,
    CONF_PASSWORD,
    CONF_PORT,
    CONF_SSL,
    CONF_USERNAME,
    Platform,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.http import KEY_HASS
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.typing import ConfigType

from .api import SurveillanceApi, SurveillanceError
from .const import CARD_FILE, CARD_URL, CONF_VERIFY_SSL, DOMAIN, VERSION
from .coordinator import RecordingsCoordinator

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
SIGN_TTL = timedelta(hours=24)

type SSConfigEntry = ConfigEntry[RecordingsCoordinator]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                CARD_URL,
                str(Path(__file__).parent / "frontend"),
                cache_headers=False,
            )
        ]
    )
    add_extra_js_url(hass, f"{CARD_URL}/{CARD_FILE}?v={VERSION}")
    hass.http.register_view(ClipView())
    hass.http.register_view(ThumbView())
    websocket_api.async_register_command(hass, ws_recordings)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: SSConfigEntry) -> bool:
    session = async_create_clientsession(
        hass, verify_ssl=entry.data.get(CONF_VERIFY_SSL, False)
    )
    api = SurveillanceApi(
        session,
        entry.data[CONF_HOST],
        entry.data[CONF_PORT],
        entry.data[CONF_SSL],
        entry.data[CONF_USERNAME],
        entry.data[CONF_PASSWORD],
    )
    coordinator = RecordingsCoordinator(hass, entry, api)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_reload))
    return True


async def _reload(hass: HomeAssistant, entry: SSConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: SSConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        await entry.runtime_data.api.logout()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: SSConfigEntry) -> None:
    root = Path(hass.config.path("ss_recordings", entry.entry_id))
    await asyncio.to_thread(shutil.rmtree, root, True)


def _coordinator(hass: HomeAssistant, entry_id: str) -> RecordingsCoordinator | None:
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN or not hasattr(entry, "runtime_data"):
        return None
    return entry.runtime_data


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/recordings",
        vol.Optional("entry_id"): str,
        vol.Optional("since"): vol.Coerce(int),
        vol.Optional("until"): vol.Coerce(int),
        vol.Optional("cameras"): [str],
    }
)
@callback
def ws_recordings(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    entries = [
        e
        for e in hass.config_entries.async_loaded_entries(DOMAIN)
        if "entry_id" not in msg or e.entry_id == msg["entry_id"]
    ]
    now = int(time.time())
    since = msg.get("since", now - 12 * 3600)
    until = msg.get("until", now)
    wanted = {c.casefold() for c in msg.get("cameras", [])}

    items: list[dict[str, Any]] = []
    cameras: set[str] = set()
    for entry in entries:
        coordinator: RecordingsCoordinator = entry.runtime_data
        cameras.update(coordinator.cameras.values())
        for rec in (coordinator.data or {}).values():
            if not since <= rec.start <= until:
                continue
            if wanted and rec.camera_name.casefold() not in wanted:
                continue
            base = f"/api/{DOMAIN}/{entry.entry_id}/{rec.id}"
            items.append(
                {
                    **rec.as_dict(),
                    "entry_id": entry.entry_id,
                    "clip_url": async_sign_path(hass, f"{base}/clip.mp4", SIGN_TTL),
                    "thumb_url": async_sign_path(hass, f"{base}/thumb.jpg", SIGN_TTL),
                }
            )
    items.sort(key=lambda r: r["start"])
    connection.send_result(
        msg["id"],
        {
            "recordings": items,
            "cameras": sorted(cameras),
            "configured": bool(entries),
        },
    )


class _RecordingView(HomeAssistantView):
    requires_auth = True

    def _lookup(self, request: web.Request, entry_id: str, rec_id: str):
        coordinator = _coordinator(request.app[KEY_HASS], entry_id)
        if coordinator is None or not rec_id.isdigit():
            raise web.HTTPNotFound
        rec = (coordinator.data or {}).get(int(rec_id))
        if rec is None:
            raise web.HTTPNotFound
        return coordinator, rec


class ClipView(_RecordingView):
    url = f"/api/{DOMAIN}/{{entry_id}}/{{rec_id}}/clip.mp4"
    name = f"api:{DOMAIN}:clip"

    async def get(self, request: web.Request, entry_id: str, rec_id: str) -> web.StreamResponse:
        coordinator, rec = self._lookup(request, entry_id, rec_id)
        try:
            path = await coordinator.store.ensure_clip(rec)
        except SurveillanceError as err:
            raise web.HTTPBadGateway(text=str(err)) from err
        return web.FileResponse(
            path, headers={"Content-Type": "video/mp4", "Cache-Control": "private, max-age=86400"}
        )


class ThumbView(_RecordingView):
    url = f"/api/{DOMAIN}/{{entry_id}}/{{rec_id}}/thumb.jpg"
    name = f"api:{DOMAIN}:thumb"

    async def get(self, request: web.Request, entry_id: str, rec_id: str) -> web.StreamResponse:
        coordinator, rec = self._lookup(request, entry_id, rec_id)
        try:
            path = await coordinator.store.ensure_thumb(rec)
        except SurveillanceError as err:
            raise web.HTTPBadGateway(text=str(err)) from err
        if path is None:
            raise web.HTTPNotFound
        return web.FileResponse(
            path, headers={"Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400"}
        )
