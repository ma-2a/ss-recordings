# Surveillance Station Recordings

Bring your Synology Surveillance Station **recordings** into Home Assistant: a dashboard card that shows everything recorded since last night, with thumbnails, one-tap playback and a "play all" mode for a quick morning review.

The built-in Synology DSM integration only exposes live streams. Event lists and recorded clips stay locked inside Surveillance Station. This integration fills that gap.

![Card](docs/card.png)

## Features

- **Morning review card**: shows last night's clips by default (20:00–07:00, adjustable), with a switch to show all recordings. Unseen clips are marked.
- **Glass look**: translucent, blurred card that picks up the colors of your theme, in light and dark.
- **Play all**: plays unseen clips back to back, at 1×, 2× or 4× speed.
- **No duplicate storage**: clips are streamed from Surveillance Station when you play them. Only small thumbnails are kept. If Home Assistant runs on the NAS, it can read the recordings straight from disk.
- **Works everywhere**: clips are served by Home Assistant itself through signed URLs, so they play in the browser, the companion app and over your VPN without exposing DSM.
- **Per-camera sensors**: number of recordings in the last 24 hours plus details of the latest one.
- **Automation event**: `ss_recordings_new_recording` fires for every new clip.
- Everything stays local. No cloud, no third-party service.

## Requirements

- Synology NAS with Surveillance Station
- Home Assistant 2025.4 or newer
- `ffmpeg` available to Home Assistant for thumbnails (included in the official container and HA OS)

## Installation

### HACS

1. HACS → three-dot menu → **Custom repositories**
2. Add `https://github.com/ma-2a/ss-recordings`, category **Integration**
3. Install **Surveillance Station Recordings** and restart Home Assistant

### Manual

Copy `custom_components/ss_recordings` into your `config/custom_components/` folder and restart Home Assistant.

## Setup

### 1. Create a DSM user

Use a dedicated account instead of your admin:

1. DSM → Control Panel → User & Group → create user `homeassistant`
2. Do **not** enable 2-step verification for this user
3. Surveillance Station → Privilege Settings: give the user a profile with access to the cameras you want and permission to **play back** and **download** recordings

### 2. Add the integration

Settings → Devices & services → **Add integration** → *Surveillance Station Recordings*

| Field | Example |
| --- | --- |
| Host | `192.168.178.20` |
| Port | `5001` (HTTPS) or `5000` (HTTP) |
| Use HTTPS | on |
| Verify SSL certificate | off for a self-signed certificate |

If Home Assistant runs on the same NAS, use the NAS's LAN IP.

### 3. Add the card

The card is registered automatically. Add it to any dashboard:

```yaml
type: custom:ss-recordings-card
```

All main settings are available in the visual card editor. After updating the integration, reload the browser once so the new card version is used.

#### Card options

| Option | Default | Description |
| --- | --- | --- |
| `default_view` | `night` | What the card shows when it opens: `night` or `all` |
| `night_start` | `"20:00"` | Start of the night window |
| `night_end` | `"07:00"` | End of the night window |
| `show_toggle` | `true` | Show the Night / All switch |
| `title` | "Last night" | Title of the night view |
| `cameras` | all | List of camera names, e.g. `[Front door]` |
| `order` | `oldest` | `oldest` or `newest` first |
| `speed` | `1` | Initial playback speed |
| `autoplay_next` | `true` | Continue with the next clip when one ends |
| `variant` | `glass` | `glass` for the translucent look, `plain` for a normal Home Assistant card |

The night view shows the most recent night: in the morning that is last night from start to end, during the evening it is the night in progress. "All" shows every recording within the integration's time window (48 h by default).

```yaml
type: custom:ss-recordings-card
default_view: night
night_start: "22:00"
night_end: "06:30"
cameras:
  - Front door
speed: 2
```

"Seen" state is stored per browser.

#### Appearance

The card is translucent and blurs whatever is behind it, so it works best on a dashboard with a background image or a colored theme. On a plain white background the effect is barely visible — `variant: plain` then gives the normal card look.

Four CSS variables control the look. Set them in your theme (`themes.yaml`) to apply them to every instance of the card:

```yaml
my-theme:
  ss-recordings-accent: "#ff9f0a"   # buttons, markers, highlight
  ss-recordings-radius: 22px        # corner radius
  ss-recordings-blur: 26px          # blur strength behind the card
  ss-recordings-tint: "#101522"     # tint of the glass surface
```

Without these the card uses your theme's accent color and card background.

## Integration options

Settings → Devices & services → Surveillance Station Recordings → **Configure**

| Option | Default | Description |
| --- | --- | --- |
| Keep recordings from the last | 48 h | Window of recordings loaded from Surveillance Station. The "All" view can't look further back than this. |
| Create thumbnails in the background | on | Small JPEG previews, stored in `config/ss_recordings/`. |
| Keep full clips on disk | off | Off: clips are streamed when played and nothing is stored. On: clips are cached for instant replay. |
| Local cache size | 2000 MB | Upper limit when full clips are kept. Oldest clips are removed first. |
| Surveillance folder inside the container | – | Read clips directly from disk instead of through the API, see below. |

Recording deletion and retention are still handled by Surveillance Station.

### Reading recordings directly from disk

If Home Assistant runs as a container on the same Synology, it can read the recording files directly. Nothing is downloaded or copied, and seeking is instant.

1. Container Manager → your Home Assistant container → **Stop** → **Edit** → **Volume Settings** → **Add Folder**
2. Choose the shared folder `surveillance`, mount path `/surveillance`, and tick **Read-only**
3. Save and start the container
4. Integration options → **Surveillance folder inside the container**: `/surveillance`

If you use `docker compose`, add `- /volume1/surveillance:/surveillance:ro` to the volumes of the Home Assistant service.

## Automations

Morning push with the number of clips per camera:

```yaml
automation:
  - alias: Morning camera summary
    triggers:
      - trigger: time
        at: "07:00:00"
    actions:
      - action: notify.mobile_app_phone
        data:
          title: "Overnight"
          message: >
            Front door: {{ states('sensor.front_door_recordings_24h') }} clips
          data:
            url: /lovelace/cameras
```

React to every new clip:

```yaml
triggers:
  - trigger: event
    event_type: ss_recordings_new_recording
    event_data:
      camera_name: Front door
```

Event data: `id`, `camera_id`, `camera_name`, `start`, `stop`, `duration`, `reason`, `entry_id`.

## How it works

The integration logs into DSM with a dedicated Surveillance Station session, polls `SYNO.SurveillanceStation.Recording` every minute and streams clips via the same API (or reads them from the mounted surveillance folder). Home Assistant serves them from `/api/ss_recordings/...` behind its own authentication. The card talks to the integration over the websocket API.

## Troubleshooting

- **Invalid credentials**: check the password and make sure 2-step verification is off for this user.
- **Surveillance Station did not answer**: the package must be running and the user needs Surveillance Station access.
- **No thumbnails**: `ffmpeg` is missing. Playback still works.
- **Clip does not play in the browser**: the browser can't decode the camera's codec. H.264 works everywhere. H.265 plays in Safari and in some Chromium builds. Switch the camera's stream to H.264 if needed.

- **Card shows no recordings although Surveillance Station has some**: check that the DSM user may play back the camera in Surveillance Station's privilege settings. Then open the integration, use the three-dot menu → **Download diagnostics** and attach the file to an issue. It contains the raw answer from Surveillance Station (host, user and paths are removed).

Enable debug logging:

```yaml
logger:
  logs:
    custom_components.ss_recordings: debug
```

## License

MIT
