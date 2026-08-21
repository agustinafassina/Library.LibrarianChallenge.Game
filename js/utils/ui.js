import { Sfx } from "./sfx.js";

export const COLORS = {
  wood: 0x6b4423,
  woodDark: 0x4a2f18,
  woodLight: 0x8a5a2b,
  parchment: 0xf3e3c3,
  ink: 0x2c1d14,
  accent: 0xd9a441,
  accentDark: 0xb5842c,
  good: 0x5bbf6a,
  bad: 0xc6504f,
  panel: 0x2c1d14,
};

export const FONTS = {
  title: "Trebuchet MS, Segoe UI, sans-serif",
  body: "Trebuchet MS, Segoe UI, sans-serif",
};

export function makeButton(scene, x, y, label, onClick, opts = {}) {
  const {
    width = 240,
    height = 56,
    fill = COLORS.accent,
    fillHover = COLORS.accentDark,
    textColor = "#2c1d14",
    fontSize = 22,
    enabled = true,
  } = opts;

  const radius = 12;
  const bg = scene.add.graphics();
  const drawBg = (color) => {
    bg.clear();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
  };
  drawBg(fill);

  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONTS.body,
      fontSize: `${fontSize}px`,
      color: textColor,
      fontStyle: "bold",
    })
    .setOrigin(0.5);

  const container = scene.add.container(Math.round(x), Math.round(y), [bg, text]);
  container.setSize(width, height);

  let isEnabled = enabled;

  const applyEnabledLook = () => {
    container.setAlpha(isEnabled ? 1 : 0.45);
    if (isEnabled) {
      container.setInteractive({ useHandCursor: true });
    } else {
      container.disableInteractive();
    }
  };

  container
    .setInteractive({ useHandCursor: true })
    .on("pointerover", () => isEnabled && drawBg(fillHover))
    .on("pointerout", () => drawBg(fill))
    .on("pointerdown", () => {
      if (!isEnabled) return;
      scene.tweens.add({
        targets: container,
        scale: 0.95,
        duration: 60,
        yoyo: true,
      });
      onClick?.();
      Sfx.ui();
    });

  container.setEnabled = (value) => {
    isEnabled = value;
    applyEnabledLook();
  };
  container.setLabel = (value) => text.setText(value);

  applyEnabledLook();
  return container;
}

export function isCoarsePointer() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(pointer: coarse)").matches) return true;
  return (navigator.maxTouchPoints || 0) > 0;
}

export function isE2ETest() {
  return typeof window !== "undefined" && Boolean(window.__GAME__);
}

export function goToScene(scene, key, data = {}) {
  if (isE2ETest()) {
    scene.scene.start(key, data);
    return;
  }
  const cam = scene.cameras.main;
  cam.fadeOut(180, 0, 0, 0);
  cam.once("camerafadeoutcomplete", () => scene.scene.start(key, data));
}

export function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function panelBox(width, height, preferredW, preferredH, pad = 32) {
  const pw = Math.min(preferredW, Math.max(260, width - pad));
  const ph = Math.min(preferredH, Math.max(180, height - 40));
  return {
    pw,
    ph,
    px: Math.round((width - pw) / 2),
    py: Math.round((height - ph) / 2),
  };
}

export function placeButtonRow(scene, cx, y, specs, gap = 16) {
  const widths = specs.map((s) => s.opts?.width ?? 240);
  const heights = specs.map((s) => s.opts?.height ?? 56);
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, specs.length - 1);
  const stack = total > scene.scale.width - 32;

  if (!stack) {
    let x = cx - total / 2;
    return specs.map((spec, i) => {
      const w = widths[i];
      const btn = makeButton(scene, x + w / 2, y, spec.label, spec.onClick, spec.opts);
      if (spec.depth != null) btn.setDepth(spec.depth);
      x += w + gap;
      return btn;
    });
  }

  let yy = y;
  return specs.map((spec, i) => {
    const h = heights[i];
    const btn = makeButton(scene, cx, yy, spec.label, spec.onClick, spec.opts);
    if (spec.depth != null) btn.setDepth(spec.depth);
    yy += h + 12;
    return btn;
  });
}

export function bindResizeRestart(scene, getData) {
  let lastW = Math.round(scene.scale.width);
  let lastH = Math.round(scene.scale.height);
  let timer = null;
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  const onResize = (gameSize) => {
    const w = Math.round(gameSize.width);
    const h = Math.round(gameSize.height);
    if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - startedAt < 250) {
      lastW = w;
      lastH = h;
      return;
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!scene.scene.isActive()) return;
      lastW = w;
      lastH = h;
      const extra = typeof getData === "function" ? getData() : getData;
      const data = { ...(scene.scene.settings.data || {}), ...(extra || {}) };
      scene.scene.restart(data);
    }, 160);
  };

  scene.scale.on("resize", onResize);
  scene.events.once("shutdown", () => {
    scene.scale.off("resize", onResize);
    window.clearTimeout(timer);
  });
}