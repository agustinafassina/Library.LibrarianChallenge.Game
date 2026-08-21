import { COLORS } from "../utils/ui.js";

const FRAME_W = 240;
const FRAME_H = 320;
const MOODS = ["idle", "happy", "thinking", "blink"];

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.image("librarian-idle-src", "assets/images/librarian-idle.png");
    this.load.image("librarian-happy-src", "assets/images/librarian-happy.png");
    this.load.image("librarian-thinking-src", "assets/images/librarian-thinking.png");
    this.load.image("librarian-blink-src", "assets/images/librarian-blink.png");
    this.load.svg("spark", "assets/images/spark.svg", { width: 32, height: 32 });
    this.load.on("loaderror", (file) => {
      console.warn("[boot] missing asset", file?.key);
    });
  }

  create() {
    const artReady = MOODS.every((mood) => this.textures.exists(`librarian-${mood}-src`));
    if (artReady) this.packLibrarianFromArt();
    else this.createLibrarianTexture();
    this.createLibrarianAnimations();
    if (!this.textures.exists("spark")) this.createParticleTexture();
    this.scene.start("MenuScene");
  }

  packLibrarianFromArt() {
    const canvasTex = this.textures.createCanvas("librarianSheet", FRAME_W * MOODS.length, FRAME_H);
    const ctx = canvasTex.getContext();
    MOODS.forEach((mood, i) => {
      const src = this.textures.get(`librarian-${mood}-src`).getSourceImage();
      ctx.drawImage(src, 0, 0, src.width, src.height, i * FRAME_W, 0, FRAME_W, FRAME_H);
    });
    canvasTex.refresh();
    MOODS.forEach((mood, i) => {
      canvasTex.add(mood, 0, i * FRAME_W, 0, FRAME_W, FRAME_H);
    });
    if (this.textures.exists("librarian")) this.textures.remove("librarian");
    this.textures.renameTexture("librarianSheet", "librarian");
    MOODS.forEach((mood) => this.textures.remove(`librarian-${mood}-src`));
  }

  createLibrarianTexture() {
    const w = 120;
    const h = 170;
    const strip = this.make.renderTexture({ width: w * MOODS.length, height: h, add: false });

    MOODS.forEach((mood, i) => {
      const frameKey = `librarian-frame-${mood}`;
      this.drawLibrarianFrame(frameKey, w, h, mood);
      strip.draw(frameKey, i * w, 0);
      this.textures.remove(frameKey);
    });

    strip.saveTexture("librarianSheet");
    strip.destroy();

    const tex = this.textures.get("librarianSheet");
    tex.add("idle", 0, 0, 0, w, h);
    tex.add("happy", 0, w, 0, w, h);
    tex.add("thinking", 0, w * 2, 0, w, h);
    tex.add("blink", 0, w * 3, 0, w, h);
    tex.add("legacy", 0, 0, 0, w, h);
    if (this.textures.exists("librarian")) {
      this.textures.remove("librarian");
    }
    this.textures.renameTexture("librarianSheet", "librarian");
  }

  drawLibrarianFrame(textureKey, w, h, mood) {
    const g = this.make.graphics({ add: false });

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

    const eyeY = mood === "thinking" ? 48 : 50;
    if (mood === "blink") {
      g.lineStyle(3, 0x2c1d14, 1);
      g.beginPath();
      g.arc(49, eyeY, 7, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
      g.strokePath();
      g.beginPath();
      g.arc(71, eyeY, 7, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
      g.strokePath();
    } else {
      g.lineStyle(3, 0x2c1d14, 1);
      g.strokeCircle(49, eyeY, 9);
      g.strokeCircle(71, eyeY, 9);
      g.lineBetween(58, eyeY, 62, eyeY);
      g.fillStyle(0x2c1d14, 1);
      g.fillCircle(49, eyeY, 3);
      g.fillCircle(71, eyeY, 3);
    }

    g.fillStyle(0xe79a8a, 0.5);
    g.fillCircle(44, 58, 5);
    g.fillCircle(76, 58, 5);

    if (mood === "happy") {
      g.lineStyle(2.5, 0xc6504f, 1);
      g.beginPath();
      g.arc(60, 60, 7, Phaser.Math.DegToRad(15), Phaser.Math.DegToRad(165), false);
      g.strokePath();
    } else if (mood === "thinking") {
      g.fillStyle(0x2c1d14, 1);
      g.fillRoundedRect(53, 61, 14, 3, 2);
      g.fillStyle(0xd9d9d9, 0.9);
      g.fillCircle(89, 36, 4);
      g.fillCircle(96, 30, 6);
    } else {
      g.fillStyle(0xc6504f, 1);
      g.fillEllipse(60, 62, 13, 5);
    }

    g.fillStyle(COLORS.accent, 1);
    g.fillCircle(34, 61, 3);
    g.fillCircle(86, 61, 3);

    g.fillStyle(COLORS.accent, 1);
    g.fillRoundedRect(72, 120, 34, 24, 4);
    g.lineStyle(2, 0xffffff, 0.8);
    g.lineBetween(89, 122, 89, 142);

    g.generateTexture(textureKey, w, h);
    g.destroy();
  }

  createLibrarianAnimations() {
    const idle = { key: "librarian", frame: "idle" };
    const happy = { key: "librarian", frame: "happy" };
    const thinking = { key: "librarian", frame: "thinking" };
    const blink = { key: "librarian", frame: "blink" };

    if (this.anims.exists("librarian-idle")) this.anims.remove("librarian-idle");
    this.anims.create({
      key: "librarian-idle",
      frames: [idle, idle, idle, idle, idle, idle, idle, blink, idle],
      frameRate: 7,
      repeat: -1,
    });

    if (this.anims.exists("librarian-happy")) this.anims.remove("librarian-happy");
    this.anims.create({
      key: "librarian-happy",
      frames: [happy, idle, happy, idle],
      frameRate: 5,
      repeat: -1,
    });

    if (this.anims.exists("librarian-thinking")) this.anims.remove("librarian-thinking");
    this.anims.create({
      key: "librarian-thinking",
      frames: [thinking],
      frameRate: 2,
      repeat: -1,
    });
  }

  createParticleTexture() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture("spark", 16, 16);
    g.destroy();
  }
}
