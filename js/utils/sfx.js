const KEY_MUTE = "librarians-challenge:muted";

function readMuted() {
  try {
    return localStorage.getItem(KEY_MUTE) === "1";
  } catch {
    return false;
  }
}

function writeMuted(value) {
  try {
    localStorage.setItem(KEY_MUTE, value ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

const FILES = {
  ui: "assets/audio/ui.wav",
  drop: "assets/audio/drop.wav",
  win: "assets/audio/win.wav",
  ambience: "assets/audio/ambience.wav",
};

export const Sfx = {
  muted: readMuted(),
  _ctx: null,
  _buffers: new Map(),
  _unlocked: false,
  _loading: null,
  _armed: false,
  _ambienceSrc: null,
  _ambienceGain: null,
  _skipAmbience: typeof window !== "undefined" && new URLSearchParams(window.location.search).has("test"),

  init() {
    if (typeof window === "undefined") return Promise.resolve();
    this.armUnlock();
    this.armVisibility();
    if (!this._loading) this._loading = this._load().catch((err) => {
      console.warn("[sfx] could not load audio", err);
    });
    return this._loading;
  },

  armUnlock() {
    if (this._armed || typeof window === "undefined") return;
    this._armed = true;
    const unlock = () => {
      this.unlock();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
  },

  armVisibility() {
    if (this._visArmed || typeof document === "undefined") return;
    this._visArmed = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.setAmbienceLevel(0);
      else if (!this.muted) this.setAmbienceLevel(0.07);
    });
  },

  ctx() {
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this._ctx = new AC();
    }
    return this._ctx;
  },

  async unlock() {
    const ctx = this.ctx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* autoplay policies can still block */
      }
    }
    this._unlocked = ctx.state === "running";
    if (this._unlocked) this.startAmbience();
  },

  async _load() {
    const ctx = this.ctx();
    if (!ctx) return;
    await Promise.all(
      Object.entries(FILES).map(async ([name, url]) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} (${res.status})`);
        const raw = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(raw.slice(0));
        this._buffers.set(name, decoded);
      })
    );
    if (this._unlocked) this.startAmbience();
  },

  play(name, volume = 0.4) {
    if (this.muted) return;
    const buffer = this._buffers.get(name);
    const ctx = this.ctx();
    if (!buffer || !ctx) return;
    const start = () => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(start).catch(() => {});
      return;
    }
    start();
  },

  ui() {
    this.play("ui", 0.28);
  },

  drop() {
    this.play("drop", 0.42);
  },

  win() {
    this.play("win", 0.46);
  },

  startAmbience() {
    if (this.muted || this._skipAmbience || this._ambienceSrc) return;
    const buffer = this._buffers.get("ambience");
    const ctx = this.ctx();
    if (!buffer || !ctx || ctx.state !== "running") return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = document.hidden ? 0 : 0.07;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    this._ambienceSrc = src;
    this._ambienceGain = gain;
    src.onended = () => {
      if (this._ambienceSrc === src) this._ambienceSrc = null;
    };
  },

  stopAmbience() {
    try {
      this._ambienceSrc?.stop();
    } catch {
      /* already stopped */
    }
    this._ambienceSrc = null;
    this._ambienceGain = null;
  },

  setAmbienceLevel(value) {
    if (!this._ambienceGain) return;
    this._ambienceGain.gain.value = value;
  },

  isMuted() {
    return this.muted;
  },

  setMuted(value) {
    this.muted = Boolean(value);
    writeMuted(this.muted);
    if (this.muted) this.stopAmbience();
    else this.startAmbience();
  },

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  },
};
