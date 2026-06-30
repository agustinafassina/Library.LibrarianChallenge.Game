import { getLevelWithBooks, getLevelCount } from "../utils/dataLoader.js";
import { evaluateOrder, getRuleLabel } from "../utils/rules.js";
import { Storage } from "../utils/storage.js";
import { I18n } from "../utils/i18n.js";
import { makeButton, COLORS, FONTS, formatTime } from "../utils/ui.js";

const BOOK_W_MAX = 96;
const BOOK_H_MAX = 150;
const GAP_X = 14;
const GAP_Y = 18;
const BOARD_H = 14;
const MAX_PER_ROW = 6;
const AREA_TOP = 156;
const AREA_BOTTOM = 462;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init(data) {
    this.levelNumber = data.level ?? 1;
    this.order = [];
    this.slots = [];
    this.bookW = BOOK_W_MAX;
    this.bookH = BOOK_H_MAX;
    this.moves = 0;
    this.startTime = 0;
    this.solved = false;
    this.levelDef = null;
  }

  async create() {
    const { width, height } = this.scale;
    this.drawBackground();
    this.buildTopBar();

    this.loadingText = this.add
      .text(width / 2, height / 2, I18n.t("loadingLevel"), {
        fontFamily: FONTS.body,
        fontSize: "24px",
        color: "#d9a441",
      })
      .setOrigin(0.5);

    let level;
    try {
      level = await getLevelWithBooks(this.levelNumber);
      this.totalLevels = await getLevelCount();
    } catch (err) {
      console.error(err);
      this.loadingText.setText(I18n.t("levelDataError"));
      return;
    }
    if (!level) {
      this.loadingText.setText(I18n.t("levelNotFound", { level: this.levelNumber }));
      return;
    }
    this.loadingText.destroy();
    this.levelDef = level;

    this.buildShelf(level.books.length);
    this.buildBooks(level.books);
    this.buildRuleBadge();
    this.buildLibrarian();
    this.buildControls();

    this.input.keyboard.on("keydown-R", () => this.resetLevel());

    this.startTime = this.time.now;
    this.timerStarted = true;
  }

  drawBackground() {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(COLORS.woodDark, 1);
    g.fillRect(0, 0, width, height);
    g.fillStyle(COLORS.wood, 0.25);
    for (let yy = 90; yy < height - 60; yy += 70) {
      g.fillRect(20, yy, width - 40, 40);
    }
  }

  buildTopBar() {
    const { width, height } = this.scale;
    const bar = this.add.graphics();
    bar.fillStyle(COLORS.ink, 0.92);
    bar.fillRect(0, 0, width, 56);
    bar.setDepth(50);

    this.add
      .text(16, 28, "Librarian's Challenge", {
        fontFamily: FONTS.title,
        fontSize: "22px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5)
      .setDepth(51);

    this.levelText = this.add
      .text(width * 0.42, 28, "", {
        fontFamily: FONTS.body,
        fontSize: "18px",
        color: "#d9a441",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.movesText = this.add
      .text(width * 0.62, 28, I18n.t("movesLabel", { moves: 0 }), {
        fontFamily: FONTS.body,
        fontSize: "18px",
        color: "#f3e3c3",
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.timeText = this.add
      .text(width - 20, height - 28, I18n.t("timeLabel", { time: "0:00" }), {
        fontFamily: FONTS.body,
        fontSize: "20px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5)
      .setDepth(51);

    makeButton(this, width - 220, 28, I18n.t("resetR"), () => this.resetLevel(), {
      width: 110,
      height: 40,
      fontSize: 16,
    }).setDepth(51);

    makeButton(this, width - 80, 28, I18n.t("menu"), () => this.scene.start("MenuScene"), {
      width: 110,
      height: 40,
      fontSize: 16,
      fill: COLORS.woodLight,
      textColor: "#f3e3c3",
    }).setDepth(51);
  }

  computeLayout(count) {
    const { width } = this.scale;
    const availW = width - 80;
    const availH = AREA_BOTTOM - AREA_TOP;

    const rows = Math.max(1, Math.ceil(count / MAX_PER_ROW));

    const rowCounts = [];
    let remaining = count;
    for (let r = 0; r < rows; r++) {
      const n = Math.ceil(remaining / (rows - r));
      rowCounts.push(n);
      remaining -= n;
    }
    const widestRow = Math.max(...rowCounts);

    this.bookW = Phaser.Math.Clamp(
      (availW - (widestRow - 1) * GAP_X) / widestRow,
      60,
      BOOK_W_MAX
    );
    this.bookH = Phaser.Math.Clamp(
      (availH - rows * BOARD_H - (rows - 1) * GAP_Y) / rows,
      78,
      BOOK_H_MAX
    );

    const rowStride = this.bookH + BOARD_H + GAP_Y;
    const totalH = rows * this.bookH + rows * BOARD_H + (rows - 1) * GAP_Y;
    const startY = AREA_TOP + (availH - totalH) / 2;

    this.slots = [];
    this.rowRects = [];
    for (let r = 0; r < rows; r++) {
      const cnt = rowCounts[r];
      const rowW = cnt * this.bookW + (cnt - 1) * GAP_X;
      const startX = (width - rowW) / 2 + this.bookW / 2;
      const centerY = startY + this.bookH / 2 + r * rowStride;
      for (let c = 0; c < cnt; c++) {
        this.slots.push({ x: startX + c * (this.bookW + GAP_X), y: centerY });
      }
      this.rowRects.push({
        x: startX - this.bookW / 2 - 16,
        y: startY + this.bookH + r * rowStride,
        w: rowW + 32,
      });
    }

    this.celebrateY = (AREA_TOP + AREA_BOTTOM) / 2;
  }

  buildShelf(count) {
    this.computeLayout(count);

    const g = this.add.graphics();
    this.rowRects.forEach((rect) => {
      g.fillStyle(COLORS.woodLight, 1);
      g.fillRect(rect.x, rect.y, rect.w, BOARD_H);
      g.fillStyle(COLORS.woodDark, 1);
      g.fillRect(rect.x, rect.y + BOARD_H, rect.w, 9);
    });

    this.slotGuides = [];
    this.slots.forEach((slot) => {
      const guide = this.add.graphics();
      guide.lineStyle(2, COLORS.accent, 0.12);
      guide.strokeRoundedRect(
        slot.x - this.bookW / 2,
        slot.y - this.bookH / 2,
        this.bookW,
        this.bookH,
        8
      );
      this.slotGuides.push(guide);
    });
  }

  buildBooks(books) {
    const scrambled = this.scramble(books);
    this.order = scrambled.map((book, i) => this.createBookCard(book, this.slots[i]));
    this.enableDragging();
  }

  scramble(books) {
    if (books.length < 2) return [...books];
    let arr;
    let attempts = 0;
    do {
      arr = Phaser.Utils.Array.Shuffle([...books]);
      attempts++;
    } while (evaluateOrder(arr, this.levelDef.rule).solved && attempts < 20);
    return arr;
  }

  createBookCard(book, slot) {
    const w = this.bookW;
    const h = this.bookH;
    const titleSize = Math.round(Phaser.Math.Clamp(h * 0.085, 10, 13));
    const metaSize = Math.round(Phaser.Math.Clamp(h * 0.07, 9, 11));

    const spine = this.add.graphics();
    const fill = Phaser.Display.Color.HexStringToColor(book.color).color;
    spine.fillStyle(fill, 1);
    spine.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    spine.lineStyle(3, 0x000000, 0.25);
    spine.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    spine.fillStyle(0xffffff, 0.18);
    spine.fillRect(-w / 2 + 6, -h / 2 + 8, w - 12, 4);
    spine.fillRect(-w / 2 + 6, h / 2 - 12, w - 12, 4);

    const titleTxt = this.add
      .text(0, -h / 2 + 14, book.title, {
        fontFamily: FONTS.body,
        fontSize: `${titleSize}px`,
        color: "#ffffff",
        align: "center",
        fontStyle: "bold",
        wordWrap: { width: w - 14 },
      })
      .setOrigin(0.5, 0);

    const meta = `${book.author}\n${book.genre}\n${book.year}`;
    const metaTxt = this.add
      .text(0, h / 2 - 12, meta, {
        fontFamily: FONTS.body,
        fontSize: `${metaSize}px`,
        color: "#f7f0e0",
        align: "center",
        lineSpacing: 1,
      })
      .setOrigin(0.5, 1);

    const container = this.add.container(slot.x, slot.y, [spine, titleTxt, metaTxt]);
    container.setSize(w, h);
    container.setData("book", book);
    container.setData("spine", spine);
    return container;
  }

  enableDragging() {
    this.order.forEach((c) => {
      c.setInteractive({ useHandCursor: true, draggable: true });
    });

    this.input.on("dragstart", (_p, obj) => {
      if (this.solved) return;
      obj.setDepth(20);
      this.tweens.add({ targets: obj, scale: 1.06, duration: 100 });
    });

    this.input.on("drag", (_p, obj, dragX, dragY) => {
      if (this.solved) return;
      obj.x = dragX;
      obj.y = dragY;
    });

    this.input.on("dragend", (_p, obj) => {
      if (this.solved) return;
      obj.setDepth(1);
      this.tweens.add({ targets: obj, scale: 1, duration: 100 });
      this.handleDrop(obj);
    });
  }

  handleDrop(obj) {
    const fromIndex = this.order.indexOf(obj);
    const nearest = this.nearestSlot(obj.x, obj.y);

    if (nearest !== fromIndex) {
      this.order.splice(fromIndex, 1);
      this.order.splice(nearest, 0, obj);
      this.moves++;
      this.movesText.setText(I18n.t("movesLabel", { moves: this.moves }));
    }
    this.layoutBooks(true);
    this.checkSolved();
  }

  nearestSlot(x, y) {
    let best = 0;
    let bestDist = Infinity;
    this.slots.forEach((slot, i) => {
      const d = Phaser.Math.Distance.Between(slot.x, slot.y, x, y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  layoutBooks(animate) {
    this.order.forEach((c, i) => {
      const { x, y } = this.slots[i];
      if (animate) {
        this.tweens.add({ targets: c, x, y, duration: 180, ease: "Back.out" });
      } else {
        c.x = x;
        c.y = y;
      }
    });
  }

  buildRuleBadge() {
    const { width } = this.scale;
    this.levelText.setText(
      I18n.t("levelProgress", { level: this.levelNumber, total: this.totalLevels })
    );

    const translated = I18n.t(`rule_${this.levelDef.rule}`);
    const ruleName = translated.startsWith("rule_")
      ? getRuleLabel(this.levelDef.rule)
      : translated;
    const label = I18n.t("ruleColon", { label: ruleName });
    const badge = this.add.graphics();
    const padX = 18;
    const tmp = this.add
      .text(0, 0, label, { fontFamily: FONTS.body, fontSize: "20px", fontStyle: "bold" })
      .setVisible(false);
    const bw = tmp.width + padX * 2;
    tmp.destroy();

    const bx = width / 2;
    const by = 86;
    badge.fillStyle(COLORS.accent, 1);
    badge.fillRoundedRect(bx - bw / 2, by - 20, bw, 40, 20);
    this.add
      .text(bx, by, label, {
        fontFamily: FONTS.body,
        fontSize: "20px",
        color: "#2c1d14",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(bx, by + 32, I18n.pick(this.levelDef, "description"), {
        fontFamily: FONTS.body,
        fontSize: "15px",
        color: "#f3e3c3",
        align: "center",
        wordWrap: { width: width - 120 },
      })
      .setOrigin(0.5);
  }

  buildLibrarian() {
    const { height } = this.scale;
    this.librarian = this.add
      .image(96, height - 110, "librarian")
      .setScale(1.2)
      .setDepth(5);

    this.tweens.add({
      targets: this.librarian,
      y: this.librarian.y - 8,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this.buildSpeechBubble(
      I18n.pick(this.levelDef, "hint") || I18n.pick(this.levelDef, "description")
    );
  }

  buildSpeechBubble(text) {
    const x = 180;
    const y = this.scale.height - 150;
    const w = 320;
    const h = 86;

    const bubble = this.add.graphics().setDepth(6);
    bubble.fillStyle(COLORS.parchment, 1);
    bubble.fillRoundedRect(x, y - h / 2, w, h, 12);
    bubble.fillTriangle(x, y + 6, x - 18, y + 24, x, y + 26);

    this.add
      .text(x + w / 2, y, text, {
        fontFamily: FONTS.body,
        fontSize: "15px",
        color: "#2c1d14",
        align: "center",
        wordWrap: { width: w - 24 },
      })
      .setOrigin(0.5)
      .setDepth(7);
  }

  buildControls() {
    const { width, height } = this.scale;
    this.checkBtn = makeButton(
      this,
      width / 2,
      height - 60,
      I18n.t("checkOrder"),
      () => this.checkSolved(true),
      { width: 220, height: 52, fontSize: 20, fill: COLORS.good, textColor: "#ffffff" }
    );
  }

  checkSolved(manual = false) {
    if (this.solved) return;
    const currentBooks = this.order.map((c) => c.getData("book"));
    const result = evaluateOrder(currentBooks, this.levelDef.rule);

    if (result.solved) {
      this.onSolved();
    } else if (manual) {
      this.flashFeedback(result.perSlot);
    }
  }

  flashFeedback(perSlot) {
    this.order.forEach((c, i) => {
      const ok = perSlot[i];
      const guide = this.slotGuides[i];
      const slot = this.slots[i];
      guide.clear();
      guide.lineStyle(3, ok ? COLORS.good : COLORS.bad, 0.9);
      guide.strokeRoundedRect(
        slot.x - this.bookW / 2,
        slot.y - this.bookH / 2,
        this.bookW,
        this.bookH,
        8
      );
      if (!ok) {
        this.tweens.add({
          targets: c,
          x: c.x + 6,
          duration: 50,
          yoyo: true,
          repeat: 3,
        });
      }
    });

    this.time.delayedCall(700, () => this.restoreGuides());
  }

  restoreGuides() {
    this.slotGuides.forEach((guide, i) => {
      const slot = this.slots[i];
      guide.clear();
      guide.lineStyle(2, COLORS.accent, 0.12);
      guide.strokeRoundedRect(
        slot.x - this.bookW / 2,
        slot.y - this.bookH / 2,
        this.bookW,
        this.bookH,
        8
      );
    });
  }

  onSolved() {
    this.solved = true;
    const timeMs = this.time.now - this.startTime;
    const score = this.computeScore(timeMs, this.moves);

    Storage.unlockLevel(this.levelNumber + 1);
    const isBest = Storage.saveResult(this.levelNumber, {
      score,
      timeMs,
      moves: this.moves,
    });

    this.order.forEach((_, i) => {
      const guide = this.slotGuides[i];
      const slot = this.slots[i];
      guide.clear();
      guide.lineStyle(4, COLORS.good, 1);
      guide.strokeRoundedRect(
        slot.x - this.bookW / 2,
        slot.y - this.bookH / 2,
        this.bookW,
        this.bookH,
        8
      );
    });

    this.tweens.add({
      targets: this.librarian,
      y: this.librarian.y - 40,
      duration: 220,
      yoyo: true,
      repeat: 2,
      ease: "Quad.out",
    });

    this.celebrate();

    this.time.delayedCall(900, () => {
      this.scene.start("LevelCompleteScene", {
        level: this.levelNumber,
        totalLevels: this.totalLevels,
        timeMs,
        moves: this.moves,
        score,
        isBest,
      });
    });
  }

  celebrate() {
    const { width } = this.scale;
    const emitter = this.add.particles(width / 2, this.celebrateY, "spark", {
      speed: { min: -260, max: 260 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.9, end: 0 },
      lifespan: 900,
      gravityY: 420,
      quantity: 30,
      tint: [0xd9a441, 0x5bbf6a, 0xffffff, 0x4f86c6],
      emitting: false,
    });
    emitter.explode(40);
  }

  computeScore(timeMs, moves) {
    const seconds = Math.floor(timeMs / 1000);
    const raw = 1000 - seconds * 4 - moves * 15;
    return Math.max(50, raw);
  }

  resetLevel() {
    if (!this.levelDef) return;
    this.scene.restart({ level: this.levelNumber });
  }

  autosolve() {
    if (!this.levelDef || this.solved) return false;
    const books = this.order.map((c) => c.getData("book"));
    const { expected } = evaluateOrder(books, this.levelDef.rule);
    this.order.sort(
      (a, b) => expected.indexOf(a.getData("book")) - expected.indexOf(b.getData("book"))
    );
    this.layoutBooks(false);
    this.checkSolved();
    return this.solved;
  }

  update() {
    if (this.timerStarted && !this.solved) {
      const elapsed = this.time.now - this.startTime;
      this.timeText.setText(I18n.t("timeLabel", { time: formatTime(elapsed) }));
    }
  }
}
