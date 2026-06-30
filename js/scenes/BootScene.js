import { COLORS } from "../utils/ui.js";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {}

  create() {
    this.createLibrarianTexture();
    this.createParticleTexture();
    this.scene.start("MenuScene");
  }

  createLibrarianTexture() {
    const w = 120;
    const h = 170;
    const g = this.add.graphics();

    g.fillStyle(0x4a2f1a, 1);
    g.fillEllipse(60, 62, 80, 104);

    g.fillStyle(0x7a4fc6, 1);
    g.fillRoundedRect(24, 82, 72, 80, 14);
    g.fillStyle(0x9165d8, 1);
    g.fillRect(56, 82, 8, 80);

    const pinX = 28;
    const pinY = 96;
    const pinW = 34;
    const stripeH = 3;
    const rainbow = [0xe40303, 0xff8c00, 0xffed00, 0x008026, 0x004dff, 0x750787];
    rainbow.forEach((c, i) => {
      g.fillStyle(c, 1);
      g.fillRect(pinX, pinY + i * stripeH, pinW, stripeH);
    });
    const pinH = rainbow.length * stripeH;
    const pinBottom = pinY + pinH;
    const midY = pinY + pinH / 2;
    const chevron = [0x000000, 0x613915, 0x73d7ee, 0xffafc7, 0xffffff];
    const depth = 13;
    chevron.forEach((c, i) => {
      const ox = pinX + i * 3;
      g.fillStyle(c, 1);
      g.fillTriangle(ox, pinY, ox, pinBottom, ox + depth, midY);
    });
    g.lineStyle(1.5, 0xffffff, 0.6);
    g.strokeRect(pinX, pinY, pinW, pinH);

    g.fillStyle(0x6a3fb0, 1);
    g.fillRoundedRect(15, 86, 16, 56, 8);
    g.fillRoundedRect(89, 86, 16, 56, 8);
    g.fillStyle(0xf0c9a0, 1);
    g.fillRect(52, 68, 16, 18);
    g.fillStyle(0xf6d3ad, 1);
    g.fillCircle(60, 48, 27);

    g.fillStyle(0x1a1a1a, 1);
    g.fillEllipse(60, 22, 78, 46);
    g.fillEllipse(60, 16, 56, 26);
    g.fillRect(28, 26, 64, 14);
    g.fillRect(28, 26, 12, 58);
    g.fillRect(80, 26, 12, 58);
    g.fillCircle(34, 84, 8);
    g.fillCircle(86, 84, 8);
    g.fillStyle(0xc64f9e, 1);
    g.fillRect(40, 26, 6, 46);

    g.lineStyle(3, 0x2c1d14, 1);
    g.strokeCircle(49, 50, 9);
    g.strokeCircle(71, 50, 9);
    g.lineBetween(58, 50, 62, 50);
    g.fillStyle(0x2c1d14, 1);
    g.fillCircle(49, 50, 3);
    g.fillCircle(71, 50, 3);
    g.fillStyle(0xe79a8a, 0.5);
    g.fillCircle(44, 58, 5);
    g.fillCircle(76, 58, 5);
    g.fillStyle(0xc6504f, 1);
    g.fillEllipse(60, 62, 13, 5);
    g.fillStyle(COLORS.accent, 1);
    g.fillCircle(34, 61, 3);
    g.fillCircle(86, 61, 3);

    g.fillStyle(COLORS.accent, 1);
    g.fillRoundedRect(72, 120, 34, 24, 4);
    g.lineStyle(2, 0xffffff, 0.8);
    g.lineBetween(89, 122, 89, 142);

    g.generateTexture("librarian", w, h);
    g.destroy();
  }

  createParticleTexture() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture("spark", 16, 16);
    g.destroy();
  }
}
