# Surveillance Station Recordings

Bring your Synology Surveillance Station **recordings** into Home Assistant: a dashboard card that shows everything recorded since last night, with thumbnails, one-tap playback and a "play all" mode for a quick morning review.

The built-in Synology DSM integration only exposes live streams. Event lists and recorded clips stay locked inside Surveillance Station. This integration fills that gap.

![Card](docs/card.png)

## Features

- **Morning review card**: all clips since a time of your choice (default 20:00 the previous evening), grouped by day, newest marked as unseen.
- **Play all**: plays unseen clips back to back, at 1×, 2× or 4× speed.
- **Fast**: new clips are downloaded in the background and cached locally, so playback starts instantly.
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

After updating the integration, reload the browser once so the new card version is used.

#### Card options

| Option | Default | Description |
| --- | --- | --- |
| `title` | "Last night" | Card title |
| `since` | `"20:00"` | Show clips since the most recent occurrence of this time |
| `hours` | – | Alternative to `since`: show the last N hours |
| `cameras` | all | List of camera names, e.g. `[Front door]` |
| `order` | `oldest` | `oldest` or `newest` first |
| `speed` | `1` | Initial playback speed |
| `autoplay_next` | `true` | Continue with the next clip when one ends |

```yaml
type: custom:ss-recordings-card
title: Last night
since: "21:00"
cameras:
  - Front door
order: oldest
speed: 2
```

"Seen" state is stored per browser.

## Integration options

Settings → Devices & services → Surveillance Station Recordings → **Configure**

| Option | Default | Description |
| --- | --- | --- |
| Keep recordings from the last | 48 h | Window of recordings loaded from Surveillance Station. The card can't look further back than this. |
| Local clip cache size | 2000 MB | Clips are cached in `config/ss_recordings/`. Oldest clips are removed first. |
| Download new clips in the background | on | Pre-downloads clips and thumbnails so the card is instant. |

Recording deletion and retention are still handled by Surveillance Station. The cache only holds copies.

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

The integration logs into DSM with a dedicated Surveillance Station session, polls `SYNO.SurveillanceStation.Recording` every minute and downloads clips via the same API. Home Assistant serves them from `/api/ss_recordings/...` behind its own authentication. The card talks to the integration over the websocket API.

## Troubleshooting

- **Invalid credentials**: check the password and make sure 2-step verification is off for this user.
- **Surveillance Station did not answer**: the package must be running and the user needs Surveillance Station access.
- **No thumbnails**: `ffmpeg` is missing. Playback still works.
- **Clip does not play in the browser**: the browser can't decode the camera's codec. H.264 works everywhere. H.265 plays in Safari and in some Chromium builds. Switch the camera's stream to H.264 if needed.

Enable debug logging:

```yaml
logger:
  logs:
    custom_components.ss_recordings: debug
```

## License

MIT
