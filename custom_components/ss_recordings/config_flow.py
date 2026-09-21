"""Config flow for Surveillance Station Recordings."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import (
    CONF_HOST,
    CONF_PASSWORD,
    CONF_PORT,
    CONF_SSL,
    CONF_USERNAME,
)
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.selector import (
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
)

from .api import (
    SurveillanceApi,
    SurveillanceAuthError,
    SurveillanceConnectionError,
    SurveillanceError,
)
from .const import (
    CONF_CACHE_MB,
    CONF_LOOKBACK_HOURS,
    CONF_PREFETCH,
    CONF_VERIFY_SSL,
    DEFAULT_CACHE_MB,
    DEFAULT_LOOKBACK_HOURS,
    DEFAULT_PORT,
    DEFAULT_PREFETCH,
    DOMAIN,
)


def _user_schema(defaults: Mapping[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_HOST, default=defaults.get(CONF_HOST, "")): str,
            vol.Required(CONF_PORT, default=defaults.get(CONF_PORT, DEFAULT_PORT)): int,
            vol.Required(CONF_SSL, default=defaults.get(CONF_SSL, True)): bool,
            vol.Required(
                CONF_VERIFY_SSL, default=defaults.get(CONF_VERIFY_SSL, False)
            ): bool,
            vol.Required(CONF_USERNAME, default=defaults.get(CONF_USERNAME, "")): str,
            vol.Required(CONF_PASSWORD): str,
        }
    )


async def _validate(hass, data: Mapping[str, Any]) -> dict[str, str]:
    session = async_create_clientsession(hass, verify_ssl=data[CONF_VERIFY_SSL])
    api = SurveillanceApi(
        session,
        data[CONF_HOST],
        data[CONF_PORT],
        data[CONF_SSL],
        data[CONF_USERNAME],
        data[CONF_PASSWORD],
    )
    try:
        await api.login()
        await api.cameras()
    except SurveillanceAuthError:
        return {"base": "invalid_auth"}
    except SurveillanceConnectionError:
        return {"base": "cannot_connect"}
    except SurveillanceError:
        return {"base": "no_surveillance"}
    finally:
        await api.logout()
    return {}


class SSRecordingsConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            user_input[CONF_HOST] = user_input[CONF_HOST].strip()
            await self.async_set_unique_id(
                f"{user_input[CONF_HOST]}:{user_input[CONF_PORT]}"
            )
            self._abort_if_unique_id_configured()
            errors = await _validate(self.hass, user_input)
            if not errors:
                return self.async_create_entry(
                    title=f"Surveillance Station ({user_input[CONF_HOST]})",
                    data=user_input,
                )
        return self.async_show_form(
            step_id="user",
            data_schema=_user_schema(user_input or {}),
            errors=errors,
        )

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            data = {**entry.data, **user_input}
            errors = await _validate(self.hass, data)
            if not errors:
                return self.async_update_reload_and_abort(entry, data=data)
        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_USERNAME, default=entry.data[CONF_USERNAME]
                    ): str,
                    vol.Required(CONF_PASSWORD): str,
                }
            ),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return SSRecordingsOptionsFlow()


class SSRecordingsOptionsFlow(OptionsFlow):
    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        options = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_LOOKBACK_HOURS,
                        default=options.get(CONF_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS),
                    ): vol.All(
                        NumberSelector(
                            NumberSelectorConfig(
                                min=6, max=336, step=1, mode=NumberSelectorMode.BOX,
                                unit_of_measurement="h",
                            )
                        ),
                        vol.Coerce(int),
                    ),
                    vol.Required(
                        CONF_CACHE_MB,
                        default=options.get(CONF_CACHE_MB, DEFAULT_CACHE_MB),
                    ): vol.All(
                        NumberSelector(
                            NumberSelectorConfig(
                                min=100, max=100000, step=100, mode=NumberSelectorMode.BOX,
                                unit_of_measurement="MB",
                            )
                        ),
                        vol.Coerce(int),
                    ),
                    vol.Required(
                        CONF_PREFETCH,
                        default=options.get(CONF_PREFETCH, DEFAULT_PREFETCH),
                    ): bool,
                }
            ),
        )
