const CARD_VERSION = "0.5.0";

const STRINGS = {
  en: {
    title: "Last night",
    empty: "No recordings in this period.",
    notConfigured: "The Surveillance Station Recordings integration is not set up.",
    playAll: "Play all",
    recordings: (n) => (n === 1 ? "1 recording" : `${n} recordings`),
    since: "since",
    newOnes: (n) => `${n} new`,
    markSeen: "Mark all as seen",
    error: "Could not load recordings",
    allTitle: "All recordings",
    night: "Night",
    all: "All",
    tonight: "Tonight",
    lastNight: "Last night",
    nightOf: (d) => `Night of ${d}`,
    last: (h) => `last ${h} h`,
    older: "Earlier night",
    newer: "Later night",
    download: "Download",
    events: (n) => (n === 1 ? "1 event" : `${n} events`),
    sumLast: "last night",
    sumTonight: "tonight so far",
    sumNone: (label) => `No events ${label}`,
    sumBetween: (a, b) => `between ${a} and ${b}`,
    sumAt: (a) => `at ${a}`,
    sumUnseen: (n) => `${n} not watched yet`,
    sumAllSeen: "all watched",
    dismiss: "Dismiss until the next night",
    form: {
      title: "Title",
      default_view: "Show by default",
      night_start: "Night starts",
      night_end: "Night ends",
      show_toggle: "Show Night / All switch",
      order: "Order",
      variant: "Style",
      speed: "Playback speed",
      opt_night: "Night",
      opt_all: "All recordings",
      opt_oldest: "Oldest first",
      opt_newest: "Newest first",
      opt_glass: "Glass",
      opt_plain: "Plain",
      opt_small: "Small",
      opt_medium: "Medium",
      opt_large: "Large",
      sec_time: "Time range",
      sec_cameras: "Cameras",
      sec_look: "Appearance",
      sec_play: "Playback",
      cameras: "Cameras (empty = all)",
      tile_size: "Tile size",
      max_height: "Maximum height (0 = no limit)",
      show_camera: "Always show camera name",
      autoplay_next: "Play next clip automatically",
      show_download: "Show download button",
      h_title: "Leave empty for automatic titles like Last night or Tonight.",
      h_night: "Before the night ends the card shows the running night, afterwards the night that just ended.",
      sec_summary: "Summary line",
      summary: "Show summary line",
      opt_sum_unseen: "Only when there are unwatched clips",
      opt_sum_always: "Always",
      opt_sum_never: "Never",
      summary_from: "Visible from",
      summary_until: "Visible until",
      h_summary_window: "Leave both empty to show it all day.",
    },
  },
  de: {
    title: "Letzte Nacht",
    empty: "Keine Aufnahmen in diesem Zeitraum.",
    notConfigured: "Die Integration Surveillance Station Recordings ist nicht eingerichtet.",
    playAll: "Alle abspielen",
    recordings: (n) => (n === 1 ? "1 Aufnahme" : `${n} Aufnahmen`),
    since: "seit",
    newOnes: (n) => `${n} neu`,
    markSeen: "Alle als gesehen markieren",
    error: "Aufnahmen konnten nicht geladen werden",
    allTitle: "Alle Aufnahmen",
    night: "Nacht",
    all: "Alle",
    tonight: "Heute Nacht",
    lastNight: "Letzte Nacht",
    nightOf: (d) => `Nacht vom ${d}`,
    last: (h) => `letzte ${h} h`,
    older: "Frühere Nacht",
    newer: "Spätere Nacht",
    download: "Herunterladen",
    events: (n) => (n === 1 ? "1 Ereignis" : `${n} Ereignisse`),
    sumLast: "letzte Nacht",
    sumTonight: "heute Nacht bisher",
    sumNone: (label) => `Keine Ereignisse ${label}`,
    sumBetween: (a, b) => `zwischen ${a} und ${b}`,
    sumAt: (a) => `um ${a}`,
    sumUnseen: (n) => `${n} noch nicht angesehen`,
    sumAllSeen: "alle angesehen",
    dismiss: "Bis zur nächsten Nacht ausblenden",
    form: {
      title: "Titel",
      default_view: "Standardmäßig anzeigen",
      night_start: "Nacht beginnt",
      night_end: "Nacht endet",
      show_toggle: "Umschalter Nacht / Alle anzeigen",
      order: "Reihenfolge",
      variant: "Stil",
      speed: "Abspielgeschwindigkeit",
      opt_night: "Nacht",
      opt_all: "Alle Aufnahmen",
      opt_oldest: "Älteste zuerst",
      opt_newest: "Neueste zuerst",
      opt_glass: "Glas",
      opt_plain: "Schlicht",
      opt_small: "Klein",
      opt_medium: "Mittel",
      opt_large: "Groß",
      sec_time: "Zeitraum",
      sec_cameras: "Kameras",
      sec_look: "Darstellung",
      sec_play: "Wiedergabe",
      cameras: "Kameras (leer = alle)",
      tile_size: "Kachelgröße",
      max_height: "Maximale Höhe (0 = unbegrenzt)",
      show_camera: "Kameranamen immer anzeigen",
      autoplay_next: "Nächsten Clip automatisch abspielen",
      show_download: "Download-Button anzeigen",
      h_title: "Leer lassen für automatische Titel wie Letzte Nacht oder Heute Nacht.",
      h_night: "Bis zum Ende der Nacht zeigt die Karte die laufende Nacht, danach die gerade beendete.",
      sec_summary: "Zusammenfassung",
      summary: "Zusammenfassung anzeigen",
      opt_sum_unseen: "Nur wenn es Ungesehenes gibt",
      opt_sum_always: "Immer",
      opt_sum_never: "Nie",
      summary_from: "Sichtbar ab",
      summary_until: "Sichtbar bis",
      h_summary_window: "Beide leer lassen, um sie den ganzen Tag zu zeigen.",
    },
  },
};

const SEEN_KEY = "ss-recordings-seen";
const SPEEDS = [1, 2, 4];

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch (e) {
    return new Set();
  }
}

function saveSeen(seen) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-2000)));
  } catch (e) {
    /* storage unavailable */
  }
}

const DISMISS_KEY = "ss-recordings-dismissed";

function loadDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function saveDismissed(list) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-50)));
  } catch (e) {
    /* storage unavailable */
  }
}

function inTimeWindow(from, until, now = new Date()) {
  if (!from && !until) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = parseTime(from, "00:00");
  const [uh, um] = parseTime(until, "23:59");
  const a = fh * 60 + fm;
  const b = uh * 60 + um;
  return a <= b ? minutes >= a && minutes <= b : minutes >= a || minutes <= b;
}

function parseTime(value, fallback) {
  const [h, m] = String(value || fallback).split(":").map(Number);
  return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
}

function nightBounds(config, startDay) {
  const [sh, sm] = parseTime(config.night_start, "20:00");
  const [eh, em] = parseTime(config.night_end, "07:00");
  const start = new Date(startDay);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(start);
  end.setHours(eh, em, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

function nightList(config, now = new Date(), lookbackHours = 48) {
  const [sh, sm] = parseTime(config.night_start, "20:00");
  const latest = new Date(now);
  latest.setHours(sh, sm, 0, 0);
  if (latest > now) latest.setDate(latest.getDate() - 1);
  const oldest = now.getTime() - lookbackHours * 3600 * 1000;
  const nights = [];
  const day = new Date(latest);
  for (let i = 0; i < 31; i++) {
    const { start, end } = nightBounds(config, day);
    if (end.getTime() <= oldest) break;
    const running = end > now;
    nights.push({
      since: Math.floor(start.getTime() / 1000),
      until: Math.floor(Math.min(end.getTime(), now.getTime()) / 1000),
      end: Math.floor(end.getTime() / 1000),
      running,
    });
    day.setDate(day.getDate() - 1);
  }
  return nights;
}

function defaultNightIndex(config, nights, now = new Date()) {
  if (!nights.length || !nights[0].running) return 0;
  const [eh, em] = parseTime(config.night_end, "07:00");
  const minutes = now.getHours() * 60 + now.getMinutes();
  const morning = minutes < eh * 60 + em;
  return morning || nights.length === 1 ? 0 : 1;
}

function langOf(hass) {
  const lang = (hass?.language || document.documentElement.lang || navigator.language || "en").split("-")[0];
  return STRINGS[lang] ? lang : "en";
}

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

class SSRecordingsCard extends HTMLElement {
  static getStubConfig() {
    return { default_view: "night", night_start: "20:00", night_end: "07:00" };
  }

  static getConfigElement() {
    return document.createElement("ss-recordings-card-editor");
  }

  setConfig(config) {
    this._config = {
      default_view: "night",
      night_start: "20:00",
      night_end: "07:00",
      show_toggle: true,
      summary: "unseen",
      speed: 1,
      autoplay_next: true,
      ...config,
    };
    this._view = this._config.default_view === "all" ? "all" : "night";
    this._nightIdx = null;
    this._speed = Number(this._config.speed) || 1;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this._items = null;
    this._lastBody = null;
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
    this._render();
    if (this._hass) this._load();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first && this._config) {
      this._load();
    }
  }

  connectedCallback() {
    this._timer = setInterval(() => this._load(), 60000);
    if (this._hass && this._config) this._load();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  getCardSize() {
    return 6;
  }

  get _t() {
    return STRINGS[langOf(this._hass)];
  }

  _nights() {
    return nightList(this._config, new Date(), this._lookback || 48);
  }

  _window() {
    if (this._view === "all") {
      return { since: 0, until: Math.floor(Date.now() / 1000), running: true };
    }
    const nights = this._nights();
    if (this._nightIdx === null) this._nightIdx = defaultNightIndex(this._config, nights);
    this._nightIdx = Math.min(this._nightIdx, Math.max(nights.length - 1, 0));
    return nights[this._nightIdx] || { since: 0, until: 0, end: 0, running: false };
  }

  _nightTitle(win) {
    const t = this._t;
    const nights = this._nights();
    if (this._config.title && this._nightIdx === defaultNightIndex(this._config, nights)) {
      return this._config.title;
    }
    if (win.running) return t.tonight;
    if (this._nightIdx === nights.findIndex((n) => !n.running)) return t.lastNight;
    const day = new Date(win.since * 1000).toLocaleDateString(this._lang, { weekday: "short", day: "numeric", month: "numeric" });
    return t.nightOf(day);
  }

  get _lang() {
    return this._hass?.locale?.language || this._hass?.language;
  }

  async _load() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    try {
      const win = this._window();
      const msg = { type: "ss_recordings/recordings", since: win.since, until: win.until };
      if (this._config.cameras?.length) msg.cameras = this._config.cameras;
      if (this._config.entry_id) msg.entry_id = this._config.entry_id;
      const res = await this._hass.callWS(msg);
      this._configured = res.configured;
      this._lookback = res.lookback_hours;
      const newest = this._config.order === "newest";
      const now = Date.now();
      this._urls = this._urls || new Map();
      const items = res.recordings.map((r) => {
        const key = this._key(r);
        let cached = this._urls.get(key);
        if (!cached || now - cached.at > 20 * 3600 * 1000) {
          cached = { thumb_url: r.thumb_url, clip_url: r.clip_url, at: now };
          this._urls.set(key, cached);
        }
        return { ...r, thumb_url: cached.thumb_url, clip_url: cached.clip_url };
      });
      this._items = newest ? items.reverse() : items;
      this._error = null;
      await this._loadSummary(win, this._items);
    } catch (err) {
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
    }
    this._render();
    if (this._playAfterLoad) {
      this._playAfterLoad = false;
      if (this._items?.length) this._action("all");
    }
  }

  _summaryNight() {
    const nights = this._nights();
    return nights[defaultNightIndex(this._config, nights)];
  }

  async _loadSummary(win, items) {
    if (this._config.summary === "never" || this._config.summary === false) {
      this._summary = null;
      return;
    }
    const night = this._summaryNight();
    if (!night) {
      this._summary = null;
      return;
    }
    let recordings = items;
    if (this._view !== "night" || win.since !== night.since) {
      const msg = { type: "ss_recordings/recordings", since: night.since, until: night.until };
      if (this._config.cameras?.length) msg.cameras = this._config.cameras;
      if (this._config.entry_id) msg.entry_id = this._config.entry_id;
      try {
        recordings = (await this._hass.callWS(msg)).recordings;
      } catch (err) {
        return;
      }
    }
    this._summary = { night, recordings };
  }

  _summaryVisible() {
    const mode = this._config.summary;
    if (!this._summary || mode === "never" || mode === false) return false;
    if (!inTimeWindow(this._config.summary_from, this._config.summary_until)) return false;
    if (loadDismissed().includes(this._summary.night.since)) return false;
    if (mode === "always" || mode === true) return true;
    const seen = loadSeen();
    return this._summary.recordings.some((r) => !seen.has(this._key(r)));
  }

  _renderSummary() {
    const slot = this.shadowRoot.querySelector(".summary-slot");
    if (!slot) return;
    if (!this._summaryVisible()) {
      slot.innerHTML = "";
      return;
    }
    const t = this._t;
    const { night, recordings } = this._summary;
    const label = night.running ? t.sumTonight : t.sumLast;
    const seen = loadSeen();
    const unseen = recordings.filter((r) => !seen.has(this._key(r))).length;
    let text;
    const details = [];
    if (!recordings.length) {
      text = t.sumNone(label);
    } else {
      text = `${t.events(recordings.length)} ${label}`;
      const first = recordings[0].start;
      const last = recordings[recordings.length - 1].start;
      details.push(first === last ? t.sumAt(this._time(first)) : t.sumBetween(this._time(first), this._time(last)));
      const perCamera = {};
      recordings.forEach((r) => (perCamera[r.camera_name] = (perCamera[r.camera_name] || 0) + 1));
      if (Object.keys(perCamera).length > 1) {
        details.push(Object.entries(perCamera).map(([name, n]) => `${this._esc(name)} ${n}`).join(", "));
      }
      details.push(unseen ? t.sumUnseen(unseen) : t.sumAllSeen);
    }
    const icon = !recordings.length ? "mdi:shield-check-outline" : unseen ? "mdi:motion-sensor" : "mdi:check-circle-outline";
    slot.innerHTML = `<div class="summary ${unseen ? "has-unseen" : ""}">
        <button class="summary-main" data-act="summary-open" ${recordings.length ? "" : "disabled"}>
          <ha-icon icon="${icon}"></ha-icon>
          <span class="summary-text"><b>${text}</b>${details.length ? `<span class="summary-detail">${details.join(" · ")}</span>` : ""}</span>
        </button>
        <button class="icon small" data-act="summary-dismiss" title="${t.dismiss}"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>`;
  }

  _time(ts, withDay = false) {
    const opts = { hour: "2-digit", minute: "2-digit" };
    if (withDay) Object.assign(opts, { weekday: "short" });
    return new Date(ts * 1000).toLocaleString(this._hass?.locale?.language || this._hass?.language, opts);
  }

  _shell() {
    if (this.shadowRoot.querySelector("ha-card")) return;
    const variant = this._config.variant === "plain" ? "plain" : "glass";
    const maxHeight = Number(this._config.max_height) || 0;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <ha-card class="${variant}"><div class="head"></div><div class="summary-slot"></div><div class="slot"></div>
        <div class="body" style="${maxHeight ? `max-height:${maxHeight}px;overflow-y:auto` : ""}"></div></ha-card>`;
    this.shadowRoot.querySelector("ha-card").addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-i],[data-act]");
      if (!el) return;
      if (el.dataset.i !== undefined) this._play(Number(el.dataset.i), false);
      else this._action(el.dataset.act);
    });
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    this._shell();
    this._renderHead();
    this._renderSummary();
    this._renderBody();
  }

  _renderHead() {
    const t = this._t;
    const items = this._items || [];
    const seen = loadSeen();
    const unseen = items.filter((r) => !seen.has(this._key(r))).length;
    const parts = [];
    if (items.length) parts.push(t.recordings(items.length));
    let title;
    let nav = "";
    if (this._view === "all") {
      title = t.allTitle;
      if (this._lookback) parts.push(t.last(this._lookback));
    } else {
      const win = this._window();
      const nights = this._nights();
      title = this._nightTitle(win);
      parts.push(
        win.running
          ? `${t.since} ${this._time(win.since)}`
          : `${this._time(win.since, true)} – ${this._time(win.end, true)}`
      );
      const older = this._nightIdx < nights.length - 1;
      const newer = this._nightIdx > 0;
      nav = `<div class="nav">
          <button class="icon small" data-act="night-older" title="${t.older}" ${older ? "" : "disabled"}><ha-icon icon="mdi:chevron-left"></ha-icon></button>
          <button class="icon small" data-act="night-newer" title="${t.newer}" ${newer ? "" : "disabled"}><ha-icon icon="mdi:chevron-right"></ha-icon></button>
        </div>`;
    }
    if (unseen) parts.push(`<span class="new">${t.newOnes(unseen)}</span>`);
    const toggle = this._config.show_toggle === false ? "" : `
      <div class="seg" role="tablist">
        <button class="${this._view === "night" ? "on" : ""}" data-act="view-night">${t.night}</button>
        <button class="${this._view === "all" ? "on" : ""}" data-act="view-all">${t.all}</button>
      </div>`;
    this.shadowRoot.querySelector(".head").innerHTML = `
      <div class="head-text">
        <div class="title-row"><div class="title">${this._esc(title)}</div>${nav}</div>
        <div class="sub">${parts.join(" · ")}</div>
      </div>
      <div class="actions">
        ${toggle}
        ${unseen ? `<button class="icon" data-act="seen" title="${t.markSeen}"><ha-icon icon="mdi:check-all"></ha-icon></button>` : ""}
        ${items.length ? `<button class="play" data-act="all"><ha-icon icon="mdi:play"></ha-icon>${t.playAll}</button>` : ""}
      </div>`;
  }

  _renderBody(force = false) {
    const t = this._t;
    const items = this._items || [];
    const seen = loadSeen();
    const playingKey = this._current ? this._key(this._current) : null;
    const showCamera =
      this._config.show_camera === true || new Set(items.map((r) => r.camera_name)).size > 1;
    let body;
    if (this._error) {
      body = `<div class="msg error">${t.error}: ${this._esc(this._error)}</div>`;
    } else if (this._items === null) {
      body = `<div class="msg"><ha-circular-progress indeterminate size="small"></ha-circular-progress></div>`;
    } else if (this._configured === false) {
      body = `<div class="msg">${t.notConfigured}</div>`;
    } else if (!items.length) {
      body = `<div class="msg">${t.empty}</div>`;
    } else {
      let lastDay = null;
      const multiDay = new Set(items.map((r) => new Date(r.start * 1000).toDateString())).size > 1;
      const tiles = items
        .map((r, i) => {
          const day = new Date(r.start * 1000).toDateString();
          const sep =
            multiDay && day !== lastDay
              ? `<div class="day">${new Date(r.start * 1000).toLocaleDateString(this._hass?.language, { weekday: "long", day: "numeric", month: "long" })}</div>`
              : "";
          lastDay = day;
          const key = this._key(r);
          const cls = ["tile", seen.has(key) ? "seen" : "", key === playingKey ? "playing" : ""].join(" ");
          return `${sep}<button class="${cls}" data-i="${i}">
            <div class="thumb">
              <ha-icon icon="mdi:cctv"></ha-icon>
              <img loading="lazy" src="${r.thumb_url}" alt="" onerror="this.remove()">
              ${r.duration ? `<span class="dur">${fmtDuration(r.duration)}</span>` : ""}
              ${seen.has(key) ? "" : '<span class="dot"></span>'}
            </div>
            <div class="meta"><span class="time">${this._time(r.start)}</span>${showCamera ? `<span class="cam">${this._esc(r.camera_name)}</span>` : ""}</div>
          </button>`;
        })
        .join("");
      body = `<div class="grid ${this._config.tile_size || "medium"}">${tiles}</div>`;
    }
    if (!force && body === this._lastBody) return;
    this._lastBody = body;
    this.shadowRoot.querySelector(".body").innerHTML = body;
  }

  _renderPlayer() {
    const slot = this.shadowRoot.querySelector(".slot");
    if (!this._current) {
      slot.innerHTML = "";
      return;
    }
    const r = this._current;
    slot.innerHTML = `<div class="player">
        <video playsinline controls src="${r.clip_url}"></video>
        <div class="bar">
          <button class="icon" data-act="prev"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
          <div class="caption"><b>${this._esc(r.camera_name)}</b> · ${this._time(r.start, true)}${r.duration ? ` · ${fmtDuration(r.duration)}` : ""}</div>
          <button class="speed" data-act="speed">${this._speed}×</button>
          ${this._config.show_download === false ? "" : `<a class="icon" href="${r.clip_url}" download="${this._fileName(r)}" title="${this._t.download}"><ha-icon icon="mdi:download"></ha-icon></a>`}
          <button class="icon" data-act="next"><ha-icon icon="mdi:skip-next"></ha-icon></button>
          <button class="icon" data-act="close"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>
      </div>`;
    const video = slot.querySelector("video");
    video.playbackRate = this._speed;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
    video.addEventListener("loadedmetadata", () => (video.playbackRate = this._speed));
    video.addEventListener("ended", () => {
      if (this._queue || this._config.autoplay_next) this._step(1);
    });
  }

  _fileName(r) {
    const d = new Date(r.start * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `${r.camera_name.replace(/[^\p{L}\p{N}_-]+/gu, "_")}_${stamp}.mp4`;
  }

  _key(r) {
    return `${r.entry_id}:${r.id}`;
  }

  _index() {
    if (!this._current || !this._items) return -1;
    const key = this._key(this._current);
    return this._items.findIndex((r) => this._key(r) === key);
  }

  _play(index, queue) {
    const rec = this._items?.[index];
    if (!rec) {
      this._current = null;
      this._queue = false;
      this._renderPlayer();
      this._render();
      return;
    }
    this._current = rec;
    this._queue = queue;
    const seen = loadSeen();
    seen.add(this._key(rec));
    saveSeen(seen);
    this._renderPlayer();
    this._render();
    this.shadowRoot.querySelector(".player")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  _step(dir) {
    const i = this._index();
    this._play(i + dir, this._queue);
  }

  _action(act) {
    if (act === "all") {
      const seen = loadSeen();
      const firstUnseen = this._items.findIndex((r) => !seen.has(this._key(r)));
      this._play(firstUnseen >= 0 ? firstUnseen : 0, true);
    } else if (act === "next") this._step(1);
    else if (act === "prev") this._step(-1);
    else if (act === "close") this._play(-1, false);
    else if (act === "speed") {
      this._speed = SPEEDS[(SPEEDS.indexOf(this._speed) + 1) % SPEEDS.length];
      const video = this.shadowRoot.querySelector("video");
      if (video) video.playbackRate = this._speed;
      const btn = this.shadowRoot.querySelector(".speed");
      if (btn) btn.textContent = `${this._speed}×`;
    } else if (act === "view-night" || act === "view-all") {
      const view = act === "view-all" ? "all" : "night";
      if (view === this._view) return;
      this._view = view;
      this._nightIdx = null;
      this._reload();
    } else if (act === "night-older" || act === "night-newer") {
      const nights = this._nights();
      const next = (this._nightIdx ?? 0) + (act === "night-older" ? 1 : -1);
      if (next < 0 || next >= nights.length) return;
      this._nightIdx = next;
      this._reload();
    } else if (act === "summary-dismiss") {
      if (!this._summary) return;
      saveDismissed([...loadDismissed(), this._summary.night.since]);
      this._renderSummary();
    } else if (act === "summary-open") {
      const nights = this._nights();
      const index = defaultNightIndex(this._config, nights);
      if (this._view === "night" && this._nightIdx === index && this._items) {
        this._action("all");
        return;
      }
      this._view = "night";
      this._nightIdx = index;
      this._playAfterLoad = true;
      this._reload();
    } else if (act === "seen") {
      const seen = loadSeen();
      this._items.forEach((r) => seen.add(this._key(r)));
      saveSeen(seen);
      this._render();
    }
  }

  _reload() {
    this._items = null;
    this._lastBody = null;
    this._render();
    this._load();
  }

  _esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
}

const STYLE = `
  :host {
    --ss-accent: var(--ss-recordings-accent, var(--primary-color));
    --ss-radius: var(--ss-recordings-radius, 18px);
    --ss-blur: var(--ss-recordings-blur, 20px);
    --ss-tint: var(--ss-recordings-tint, var(--card-background-color, #fff));
  }
  ha-card { overflow: hidden; border-radius: var(--ss-radius); }
  ha-card.glass {
    position: relative;
    background: rgba(130, 130, 130, .18);
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--ss-tint) 66%, transparent),
      color-mix(in srgb, var(--ss-tint) 38%, transparent)
    );
    border: 1px solid rgba(140, 140, 140, .25);
    border: 1px solid color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    backdrop-filter: blur(var(--ss-blur)) saturate(165%);
    -webkit-backdrop-filter: blur(var(--ss-blur)) saturate(165%);
    box-shadow: 0 12px 34px rgba(0, 0, 0, .2), inset 0 1px 0 rgba(255, 255, 255, .22);
  }
  ha-card.glass::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 45%;
    pointer-events: none;
    background: linear-gradient(rgba(255, 255, 255, .16), transparent);
  }
  .head { position: relative; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 12px; padding: 18px 18px 10px; }
  .title { font-size: 1.15em; font-weight: 500; letter-spacing: .01em; color: var(--primary-text-color); }
  .sub { font-size: .85em; color: var(--secondary-text-color); margin-top: 3px; }
  .sub .new { color: var(--ss-accent); font-weight: 500; }
  .actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; margin-left: auto; }
  .head-text { min-width: 0; flex: 1 1 220px; }
  .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title-row { display: flex; align-items: center; gap: 6px; }
  .summary {
    position: relative; display: flex; align-items: center; gap: 4px; margin: 0 18px 10px;
    padding: 4px 4px 4px 12px; border-radius: 12px;
    background: rgba(140, 140, 140, .12);
    background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    border: 1px solid rgba(140, 140, 140, .18);
    border: 1px solid color-mix(in srgb, var(--primary-text-color) 8%, transparent);
  }
  .summary.has-unseen {
    background: color-mix(in srgb, var(--ss-accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--ss-accent) 35%, transparent);
  }
  .summary-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 6px 0; text-align: left; }
  .summary-main[disabled] { cursor: default; }
  .summary-main ha-icon { flex-shrink: 0; color: var(--secondary-text-color); --mdc-icon-size: 22px; }
  .summary.has-unseen .summary-main ha-icon { color: var(--ss-accent); }
  .summary-text { min-width: 0; display: flex; flex-wrap: wrap; column-gap: 8px; font-size: .9em; color: var(--primary-text-color); }
  .summary-text b { font-weight: 500; }
  .summary-detail { color: var(--secondary-text-color); }
  .nav { display: flex; }
  .icon.small { width: 30px; height: 30px; }
  .icon[disabled] { opacity: .3; cursor: default; pointer-events: none; }
  a.icon { text-decoration: none; }
  .grid.small { grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
  .grid.large { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .seg { display: inline-flex; padding: 3px; border-radius: 999px; background: rgba(140, 140, 140, .16);
    background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); }
  .seg button { padding: 5px 12px; border-radius: 999px; font-size: .85em; font-weight: 500;
    color: var(--secondary-text-color); transition: background .15s ease, color .15s ease; }
  .seg button.on { background: var(--card-background-color, #fff); color: var(--primary-text-color);
    box-shadow: 0 1px 4px rgba(0, 0, 0, .18); }
  .glass .seg button.on { background: color-mix(in srgb, var(--ss-tint) 85%, transparent); }
  button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
  .play {
    display: flex; align-items: center; gap: 4px; padding: 7px 14px 7px 9px; border-radius: 999px;
    background: var(--ss-accent); color: var(--text-primary-color, #fff); font-weight: 500; font-size: .9em;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .play:hover { transform: translateY(-1px); }
  .play ha-icon { --mdc-icon-size: 20px; }
  .icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--secondary-text-color); transition: background .15s ease; }
  .icon:hover { background: rgba(140, 140, 140, .2); }
  .glass .play { box-shadow: 0 6px 18px color-mix(in srgb, var(--ss-accent) 45%, transparent); }
  .glass .icon:hover { background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
  .player { position: relative; background: #000; margin: 0 0 10px; }
  .player video { display: block; width: 100%; max-height: 60vh; background: #000; }
  .bar { display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: var(--secondary-background-color); }
  .glass .player { margin: 0 14px 12px; border-radius: 14px; overflow: hidden; box-shadow: 0 8px 24px rgba(0, 0, 0, .3); }
  .glass .bar {
    background: rgba(20, 20, 20, .55);
    color: #fff;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
  .caption { flex: 1; min-width: 0; font-size: .9em; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .glass .caption, .glass .bar .icon { color: #fff; }
  .glass .bar .icon:hover { background: rgba(255, 255, 255, .16); }
  .speed { min-width: 42px; height: 28px; border-radius: 999px; font-size: .85em; font-weight: 500;
    color: var(--primary-text-color); border: 1px solid var(--divider-color); }
  .glass .speed { color: #fff; border-color: rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .12); }
  .grid { position: relative; display: grid; grid-template-columns: repeat(auto-fill, minmax(146px, 1fr)); gap: 12px; padding: 8px 18px 18px; }
  .day { grid-column: 1 / -1; font-size: .78em; font-weight: 500; text-transform: uppercase; letter-spacing: .06em;
    color: var(--secondary-text-color); padding-top: 6px; }
  .tile {
    display: block; padding: 0; text-align: left; border-radius: 14px; overflow: hidden;
    background: var(--secondary-background-color);
    border: 1px solid transparent;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  }
  .tile:hover { transform: translateY(-2px); }
  .tile.playing { border-color: var(--ss-accent); }
  .tile.seen .thumb img { filter: brightness(.55) saturate(.7); }
  .tile.seen .meta { opacity: .7; }
  .glass .tile {
    background: rgba(140, 140, 140, .14);
    background: color-mix(in srgb, var(--primary-text-color) 7%, transparent);
    border-color: rgba(140, 140, 140, .22);
    border-color: color-mix(in srgb, var(--primary-text-color) 9%, transparent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
  }
  .glass .tile:hover { box-shadow: 0 10px 22px rgba(0, 0, 0, .18), inset 0 1px 0 rgba(255, 255, 255, .2); }
  .glass .tile.playing { box-shadow: 0 0 0 1px var(--ss-accent), 0 10px 24px color-mix(in srgb, var(--ss-accent) 35%, transparent); }
  .thumb { position: relative; aspect-ratio: 16 / 9; display: grid; place-items: center; background: #1b1b1b; }
  .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .thumb ha-icon { color: #666; }
  .dur {
    position: absolute; right: 7px; bottom: 7px; padding: 2px 7px; border-radius: 999px; font-size: .74em;
    background: rgba(0, 0, 0, .55); color: #fff; font-variant-numeric: tabular-nums;
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  }
  .dot { position: absolute; left: 9px; top: 9px; width: 8px; height: 8px; border-radius: 50%;
    background: var(--ss-accent); box-shadow: 0 0 0 2px rgba(0, 0, 0, .35), 0 0 10px var(--ss-accent); }
  .meta { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; padding: 8px 10px 9px; font-size: .85em; }
  .time { color: var(--primary-text-color); font-weight: 500; font-variant-numeric: tabular-nums; }
  .cam { color: var(--secondary-text-color); font-size: .92em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .msg { position: relative; padding: 18px; color: var(--secondary-text-color); text-align: center; }
  .msg.error { color: var(--error-color); }
  @media (prefers-reduced-motion: reduce) {
    .tile, .play { transition: none; }
    .tile:hover, .play:hover { transform: none; }
  }
`;


const EDITOR_DEFAULTS = {
  default_view: "night",
  night_start: "20:00",
  night_end: "07:00",
  show_toggle: true,
  summary: "unseen",
  summary_from: "",
  summary_until: "",
  cameras: [],
  title: "",
  variant: "glass",
  tile_size: "medium",
  max_height: 0,
  order: "oldest",
  show_camera: false,
  speed: 1,
  autoplay_next: true,
  show_download: true,
};

class SSRecordingsCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    this._loadCameras();
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  get _t() {
    return STRINGS[langOf(this._hass)].form;
  }

  async _loadCameras() {
    if (this._cameras || this._loadingCameras || !this._hass) return;
    this._loadingCameras = true;
    try {
      const res = await this._hass.callWS({
        type: "ss_recordings/recordings",
        since: Math.floor(Date.now() / 1000),
      });
      this._cameras = res.cameras || [];
    } catch (err) {
      this._cameras = [];
    }
    this._render();
  }

  _schema() {
    const t = this._t;
    const select = (options, extra = {}) => ({
      select: { mode: "dropdown", ...extra, options: options.map(([value, label]) => ({ value, label })) },
    });
    const cameras = (this._cameras || []).map((name) => [name, name]);
    return [
      {
        type: "expandable",
        name: "",
        flatten: true,
        expanded: true,
        title: t.sec_time,
        icon: "mdi:weather-night",
        schema: [
          { name: "default_view", selector: select([["night", t.opt_night], ["all", t.opt_all]]) },
          {
            type: "grid",
            name: "",
            schema: [
              { name: "night_start", selector: { time: { no_second: true } } },
              { name: "night_end", selector: { time: { no_second: true } } },
            ],
          },
          { name: "show_toggle", selector: { boolean: {} } },
        ],
      },
      {
        type: "expandable",
        name: "",
        flatten: true,
        title: t.sec_summary,
        icon: "mdi:text-box-outline",
        schema: [
          {
            name: "summary",
            selector: select([
              ["unseen", t.opt_sum_unseen],
              ["always", t.opt_sum_always],
              ["never", t.opt_sum_never],
            ]),
          },
          {
            type: "grid",
            name: "",
            schema: [
              { name: "summary_from", selector: { time: { no_second: true } } },
              { name: "summary_until", selector: { time: { no_second: true } } },
            ],
          },
        ],
      },
      {
        type: "expandable",
        name: "",
        flatten: true,
        title: t.sec_cameras,
        icon: "mdi:cctv",
        schema: [
          {
            name: "cameras",
            selector: select(cameras, { multiple: true, custom_value: true, mode: "list" }),
          },
        ],
      },
      {
        type: "expandable",
        name: "",
        flatten: true,
        title: t.sec_look,
        icon: "mdi:palette-outline",
        schema: [
          { name: "title", selector: { text: {} } },
          {
            type: "grid",
            name: "",
            schema: [
              { name: "variant", selector: select([["glass", t.opt_glass], ["plain", t.opt_plain]]) },
              {
                name: "tile_size",
                selector: select([["small", t.opt_small], ["medium", t.opt_medium], ["large", t.opt_large]]),
              },
              { name: "order", selector: select([["oldest", t.opt_oldest], ["newest", t.opt_newest]]) },
              {
                name: "max_height",
                selector: { number: { min: 0, max: 3000, step: 50, mode: "box", unit_of_measurement: "px" } },
              },
            ],
          },
          { name: "show_camera", selector: { boolean: {} } },
        ],
      },
      {
        type: "expandable",
        name: "",
        flatten: true,
        title: t.sec_play,
        icon: "mdi:play-circle-outline",
        schema: [
          { name: "speed", selector: select([["1", "1×"], ["2", "2×"], ["4", "4×"]]) },
          { name: "autoplay_next", selector: { boolean: {} } },
          { name: "show_download", selector: { boolean: {} } },
        ],
      },
    ];
  }

  _render() {
    if (!this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (ev) => this._changed(ev));
      this.appendChild(this._form);
    }
    const t = this._t;
    this._form.hass = this._hass;
    this._form.data = {
      ...EDITOR_DEFAULTS,
      ...this._config,
      speed: String(this._config.speed ?? EDITOR_DEFAULTS.speed),
    };
    this._form.schema = this._schema();
    this._form.computeLabel = (schema) => t[schema.name] ?? schema.name;
    this._form.computeHelper = (schema) =>
      ({ title: t.h_title, night_start: t.h_night, summary_from: t.h_summary_window })[schema.name];
  }

  _changed(ev) {
    ev.stopPropagation();
    const value = { ...ev.detail.value };
    for (const key of ["night_start", "night_end", "summary_from", "summary_until"]) {
      if (typeof value[key] === "string" && /^\d{2}:\d{2}:00$/.test(value[key])) {
        value[key] = value[key].slice(0, 5);
      }
    }
    if (value.speed !== undefined) value.speed = Number(value.speed);
    const config = { type: this._config.type || "custom:ss-recordings-card" };
    for (const [key, val] of Object.entries(value)) {
      if (["type", "since", "hours"].includes(key) || val === "" || val === undefined) continue;
      if (Array.isArray(val) && !val.length) continue;
      const isDefault = JSON.stringify(val) === JSON.stringify(EDITOR_DEFAULTS[key]);
      if (isDefault && !(key in this._config)) continue;
      config[key] = val;
    }
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

function register() {
  const registry = window.customElements;
  if (!registry.get("ss-recordings-card-editor")) {
    registry.define("ss-recordings-card-editor", SSRecordingsCardEditor);
  }
  if (registry.get("ss-recordings-card")) return;
  registry.define("ss-recordings-card", SSRecordingsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "ss-recordings-card",
    name: "Surveillance Station Recordings",
    description: "Review recorded clips from Surveillance Station, e.g. everything from last night.",
    preview: true,
  });
  console.info(`%c SS-RECORDINGS-CARD %c ${CARD_VERSION} `, "background:#03a9f4;color:#fff", "");
}

// Home Assistant installs its own element registry while booting. Defining the card
// before that happens leaves it invisible to the dashboard, so wait for the app first.
(function waitForApp(tries = 0) {
  const appPending =
    document.querySelector("home-assistant") && !window.customElements.get("home-assistant");
  if (!appPending || tries > 300) register();
  else setTimeout(() => waitForApp(tries + 1), 50);
})();
