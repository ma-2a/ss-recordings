"""Constants for Surveillance Station Recordings."""

DOMAIN = "ss_recordings"
VERSION = "0.2.1"

CONF_VERIFY_SSL = "verify_ssl"
CONF_LOOKBACK_HOURS = "lookback_hours"
CONF_CACHE_MB = "cache_mb"
CONF_PREFETCH = "prefetch"

DEFAULT_PORT = 5001
DEFAULT_LOOKBACK_HOURS = 48
DEFAULT_CACHE_MB = 2000
DEFAULT_PREFETCH = True

SCAN_INTERVAL_SECONDS = 60
CACHE_DIR = "ss_recordings"
CARD_URL = "/ss_recordings_static"
CARD_FILE = "ss-recordings-card.js"

EVENT_NEW_RECORDING = f"{DOMAIN}_new_recording"
