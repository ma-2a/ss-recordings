"""Constants for Surveillance Station Recordings."""

DOMAIN = "ss_recordings"
VERSION = "0.5.0"

CONF_VERIFY_SSL = "verify_ssl"
CONF_LOOKBACK_HOURS = "lookback_hours"
CONF_CACHE_MB = "cache_mb"
CONF_PREFETCH = "prefetch"
CONF_KEEP_CLIPS = "keep_clips"
CONF_RECORDINGS_PATH = "recordings_path"

DEFAULT_PORT = 5001
DEFAULT_LOOKBACK_HOURS = 48
DEFAULT_CACHE_MB = 2000
DEFAULT_PREFETCH = True
DEFAULT_KEEP_CLIPS = False

SCAN_INTERVAL_SECONDS = 60
CACHE_DIR = "ss_recordings"
CARD_URL = "/ss_recordings_static"
CARD_FILE = "ss-recordings-card.js"

EVENT_NEW_RECORDING = f"{DOMAIN}_new_recording"
