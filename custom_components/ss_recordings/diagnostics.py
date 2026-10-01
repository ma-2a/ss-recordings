"""Diagnostics for Surveillance Station Recordings."""

from __future__ import annotations

import time
from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant

from . import SSConfigEntry
from .api import SurveillanceError

TO_REDACT = {CONF_HOST, CONF_PASSWORD, CONF_USERNAME, "path", "_sid", "sid"}


def _sample(data: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in data.items() if not isinstance(v, list)}
    for key, value in data.items():
        if isinstance(value, list):
            out[key] = value[:3]
            out[f"{key}_count"] = len(value)
    return out


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: SSConfigEntry
) -> dict[str, Any]:
    coordinator = entry.runtime_data
    api = coordinator.api
    now = int(time.time())
    since = now - coordinator.lookback_hours * 3600

    raw: dict[str, Any] = {}
    for label, params in (
        ("filtered", {"offset": 0, "limit": 3, "fromTime": since, "toTime": now}),
        ("unfiltered", {"offset": 0, "limit": 3}),
    ):
        try:
            raw[label] = _sample(await api.list_raw(**params))
        except SurveillanceError as err:
            raw[label] = {"error": str(err), "code": err.code}

    return {
        "entry": async_redact_data(dict(entry.data), TO_REDACT),
        "options": dict(entry.options),
        "now": now,
        "window_start": since,
        "apis": api.api_versions(),
        "cameras": coordinator.cameras,
        "recordings_in_window": len(coordinator.data or {}),
        "last_list": api.last_list_info,
        "raw_list": async_redact_data(raw, TO_REDACT),
    }
