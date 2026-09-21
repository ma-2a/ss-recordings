"""Per-camera recording counters."""

from __future__ import annotations

from datetime import datetime, timezone
import time

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import SSConfigEntry
from .const import DOMAIN
from .coordinator import RecordingsCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: SSConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data
    async_add_entities(
        RecordingCountSensor(coordinator, cam_id, name)
        for cam_id, name in coordinator.cameras.items()
    )


class RecordingCountSensor(CoordinatorEntity[RecordingsCoordinator], SensorEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "recordings_24h"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = "recordings"
    _attr_icon = "mdi:filmstrip-box-multiple"

    def __init__(self, coordinator: RecordingsCoordinator, cam_id: int, name: str) -> None:
        super().__init__(coordinator)
        entry_id = coordinator.config_entry.entry_id
        self._cam_id = cam_id
        self._attr_unique_id = f"{entry_id}_{cam_id}_recordings_24h"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{entry_id}_{cam_id}")},
            name=name,
            manufacturer="Synology",
            model="Surveillance Station camera",
        )

    def _recent(self):
        since = time.time() - 24 * 3600
        return sorted(
            (
                r
                for r in (self.coordinator.data or {}).values()
                if r.camera_id == self._cam_id and r.start >= since
            ),
            key=lambda r: r.start,
        )

    @property
    def native_value(self) -> int:
        return len(self._recent())

    @property
    def extra_state_attributes(self) -> dict:
        recent = self._recent()
        if not recent:
            return {"last_recording": None}
        last = recent[-1]
        return {
            "last_recording": datetime.fromtimestamp(last.start, timezone.utc).isoformat(),
            "last_duration": last.duration,
            "last_reason": last.reason,
        }
