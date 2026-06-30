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

  const container = scene.add.container(x, y, [bg, text]);
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
    });

  container.setEnabled = (value) => {
    isEnabled = value;
    applyEnabledLook();
  };
  container.setLabel = (value) => text.setText(value);

  applyEnabledLook();
  return container;
}

export function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}