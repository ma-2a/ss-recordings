const CARD_VERSION = "0.1.0";

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

function sinceTimestamp(config, now = new Date()) {
  if (config.hours) {
    return Math.floor(now.getTime() / 1000 - Number(config.hours) * 3600);
  }
  const [h, m] = String(config.since || "20:00").split(":").map(Number);
  const start = new Date(now);
  start.setHours(h || 0, m || 0, 0, 0);
  if (start > now) start.setDate(start.getDate() - 1);
  return Math.floor(start.getTime() / 1000);
}

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

class SSRecordingsCard extends HTMLElement {
  static getStubConfig() {
    return { since: "20:00" };
  }

  setConfig(config) {
    this._config = { since: "20:00", speed: 1, autoplay_next: true, ...config };
    this._speed = Number(this._config.speed) || 1;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this._items = null;
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
    const lang = (this._hass?.language || "en").split("-")[0];
    return STRINGS[lang] || STRINGS.en;
  }

  async _load() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    try {
      const msg = { type: "ss_recordings/recordings", since: sinceTimestamp(this._config) };
      if (this._config.cameras?.length) msg.cameras = this._config.cameras;
      if (this._config.entry_id) msg.entry_id = this._config.entry_id;
      const res = await this._hass.callWS(msg);
      this._configured = res.configured;
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
    } catch (err) {
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
    }
    this._render();
  }

  _time(ts, withDay = false) {
    const opts = { hour: "2-digit", minute: "2-digit" };
    if (withDay) Object.assign(opts, { weekday: "short" });
    return new Date(ts * 1000).toLocaleString(this._hass?.locale?.language || this._hass?.language, opts);
  }

  _shell() {
    if (this.shadowRoot.querySelector("ha-card")) return;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <ha-card><div class="head"></div><div class="slot"></div><div class="body"></div></ha-card>`;
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
    this._renderBody();
  }

  _renderHead() {
    const t = this._t;
    const items = this._items || [];
    const seen = loadSeen();
    const unseen = items.filter((r) => !seen.has(this._key(r))).length;
    const since = sinceTimestamp(this._config);
    const summary = items.length
      ? `${t.recordings(items.length)} · ${t.since} ${this._time(since, true)}${unseen ? ` · <span class="new">${t.newOnes(unseen)}</span>` : ""}`
      : `${t.since} ${this._time(since, true)}`;
    this.shadowRoot.querySelector(".head").innerHTML = `
      <div>
        <div class="title">${this._esc(this._config.title || t.title)}</div>
        <div class="sub">${summary}</div>
      </div>
      <div class="actions">
        ${unseen ? `<button class="icon" data-act="seen" title="${t.markSeen}"><ha-icon icon="mdi:check-all"></ha-icon></button>` : ""}
        ${items.length ? `<button class="play" data-act="all"><ha-icon icon="mdi:play"></ha-icon>${t.playAll}</button>` : ""}
      </div>`;
  }

  _renderBody(force = false) {
    const t = this._t;
    const items = this._items || [];
    const seen = loadSeen();
    const playingKey = this._current ? this._key(this._current) : null;
    const showCamera = new Set(items.map((r) => r.camera_name)).size > 1;
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
      const tiles = items
        .map((r, i) => {
          const day = new Date(r.start * 1000).toDateString();
          const sep =
            day !== lastDay && lastDay !== null
              ? `<div class="day">${new Date(r.start * 1000).toLocaleDateString(this._hass?.language, { weekday: "long", day: "numeric", month: "long" })}</div>`
              : "";
          lastDay = day;
          const key = this._key(r);
          const cls = ["tile", seen.has(key) ? "seen" : "", key === playingKey ? "playing" : ""].join(" ");
          return `${sep}<button class="${cls}" data-i="${i}">
            <div class="thumb">
              <ha-icon icon="mdi:cctv"></ha-icon>
              <img loading="lazy" src="${r.thumb_url}" alt="" onerror="this.remove()">
              <span class="dur">${fmtDuration(r.duration)}</span>
              ${seen.has(key) ? "" : '<span class="dot"></span>'}
            </div>
            <div class="meta"><span class="time">${this._time(r.start)}</span>${showCamera ? `<span class="cam">${this._esc(r.camera_name)}</span>` : ""}</div>
          </button>`;
        })
        .join("");
      body = `<div class="grid">${tiles}</div>`;
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
          <div class="caption"><b>${this._esc(r.camera_name)}</b> · ${this._time(r.start, true)} · ${fmtDuration(r.duration)}</div>
          <button class="speed" data-act="speed">${this._speed}×</button>
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
    } else if (act === "seen") {
      const seen = loadSeen();
      this._items.forEach((r) => seen.add(this._key(r)));
      saveSeen(seen);
      this._render();
    }
  }

  _esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
}

const STYLE = `
  ha-card { overflow: hidden; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 16px 8px; }
  .title { font-size: 1.15em; font-weight: 500; color: var(--primary-text-color); }
  .sub { font-size: .85em; color: var(--secondary-text-color); margin-top: 2px; }
  .sub .new { color: var(--primary-color); font-weight: 500; }
  .actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
  .play { display: flex; align-items: center; gap: 4px; padding: 6px 12px 6px 8px; border-radius: 18px;
    background: var(--primary-color); color: var(--text-primary-color, #fff); font-weight: 500; font-size: .9em; }
  .play ha-icon { --mdc-icon-size: 20px; }
  .icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--secondary-text-color); }
  .icon:hover { background: var(--secondary-background-color); }
  .player { background: #000; margin: 0 0 8px; }
  .player video { display: block; width: 100%; max-height: 60vh; background: #000; }
  .bar { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--secondary-background-color); }
  .caption { flex: 1; min-width: 0; font-size: .9em; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .speed { min-width: 40px; height: 28px; border-radius: 14px; font-size: .85em; font-weight: 500;
    color: var(--primary-text-color); border: 1px solid var(--divider-color); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; padding: 8px 16px 16px; }
  .day { grid-column: 1 / -1; font-size: .8em; font-weight: 500; text-transform: uppercase; letter-spacing: .04em;
    color: var(--secondary-text-color); padding-top: 6px; }
  .tile { display: block; padding: 0; text-align: left; border-radius: 10px; overflow: hidden;
    background: var(--secondary-background-color); outline: 2px solid transparent; transition: outline-color .15s; }
  .tile:hover { outline-color: var(--divider-color); }
  .tile.playing { outline-color: var(--primary-color); }
  .tile.seen .thumb img { opacity: .55; }
  .thumb { position: relative; aspect-ratio: 16 / 9; display: grid; place-items: center; background: #1c1c1c; }
  .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .thumb ha-icon { color: #666; }
  .dur { position: absolute; right: 6px; bottom: 6px; padding: 1px 6px; border-radius: 4px; font-size: .75em;
    background: rgba(0,0,0,.7); color: #fff; font-variant-numeric: tabular-nums; }
  .dot { position: absolute; left: 8px; top: 8px; width: 8px; height: 8px; border-radius: 50%;
    background: var(--primary-color); box-shadow: 0 0 0 2px rgba(0,0,0,.4); }
  .meta { display: flex; justify-content: space-between; gap: 6px; padding: 6px 8px; font-size: .85em; }
  .time { color: var(--primary-text-color); font-weight: 500; font-variant-numeric: tabular-nums; }
  .cam { color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .msg { padding: 16px; color: var(--secondary-text-color); text-align: center; }
  .msg.error { color: var(--error-color); }
`;

if (!customElements.get("ss-recordings-card")) {
  customElements.define("ss-recordings-card", SSRecordingsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "ss-recordings-card",
    name: "Surveillance Station Recordings",
    description: "Review recorded clips from Surveillance Station, e.g. everything since last night.",
    preview: false,
  });
  console.info(`%c SS-RECORDINGS-CARD %c ${CARD_VERSION} `, "background:#03a9f4;color:#fff", "");
}
