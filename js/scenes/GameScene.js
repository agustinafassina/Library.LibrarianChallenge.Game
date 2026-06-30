import { getLevelWithBooks, getLevelCount } from "../utils/dataLoader.js";
import { evaluateOrder, getRuleLabel } from "../utils/rules.js";
import { Storage } from "../utils/storage.js";
import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, COLORS, FONTS, formatTime } from "../utils/ui.js";

const BOOK_W_MAX = 102;
const BOOK_H_MAX = 152;
const GAP_X = 14;
const GAP_Y = 18;
const BOARD_H = 14;
const MAX_PER_ROW = 6;
const MAX_ROWS_PER_PAGE = 4;
const AREA_TOP = 150;
const AREA_BOTTOM = 600;
const LEFT_RESERVED = 24;
const RIGHT_MARGIN = 24;
const RIGHT_GUTTER = 60;

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
    this.autoArranging = false;
    this.autoUsed = false;
    this.levelDef = null;
    this.currentPage = 0;
    this.pageCount = 1;
    this.dragging = null;
    this.flipCooldown = 0;
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
    this.buildLevelInstruction();
    this.buildLibrarian();
    this.buildControls();
    this.buildPager();
    this.showPage(0);

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
    const { width } = this.scale;
    const bar = this.add.graphics();
    bar.fillStyle(COLORS.ink, 0.92);
    bar.fillRect(0, 0, width, 56);
    bar.setDepth(50);

    this.add
      .text(16, 28, I18n.t("appTitle"), {
        fontFamily: FONTS.title,
        fontSize: "22px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5)
      .setDepth(51);

    const headerLeft = 380;
    const headerRight = width - 220;
    const headerStep = (headerRight - headerLeft) / 2;

    this.levelText = this.add
      .text(headerLeft, 28, "", {
        fontFamily: FONTS.body,
        fontSize: "18px",
        color: "#d9a441",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.movesText = this.add
      .text(headerLeft + headerStep, 28, I18n.t("movesLabel", { moves: 0 }), {
        fontFamily: FONTS.body,
        fontSize: "18px",
        color: "#f3e3c3",
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.timeText = this.add
      .text(headerRight, 28, I18n.t("timeLabel", { time: "0:00" }), {
        fontFamily: FONTS.body,
        fontSize: "18px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(51);

    // Menu button — opens the action menu, pinned to the right
    this.menuBtn = makeButton(
      this,
      width - 70,
      28,
      I18n.t("menu"),
      () => this.toggleActionMenu(),
      { width: 116, height: 40, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    ).setDepth(51);
  }

  computeLayout(count) {
    const { width } = this.scale;
    const rows = Math.max(1, Math.ceil(count / MAX_PER_ROW));
    this.pageCount = Math.max(1, Math.ceil(rows / MAX_ROWS_PER_PAGE));
    const rowsOnScreen = Math.min(rows, MAX_ROWS_PER_PAGE);

    const regionLeft = LEFT_RESERVED;
    const regionRight = width - (this.pageCount > 1 ? RIGHT_GUTTER : RIGHT_MARGIN);
    const regionCenter = (regionLeft + regionRight) / 2;
    const availW = regionRight - regionLeft;
    const availH = AREA_BOTTOM - AREA_TOP;

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
      (availH - rowsOnScreen * BOARD_H - (rowsOnScreen - 1) * GAP_Y) / rowsOnScreen,
      78,
      BOOK_H_MAX
    );

    const rowStride = this.bookH + BOARD_H + GAP_Y;
    const totalH =
      rowsOnScreen * this.bookH + rowsOnScreen * BOARD_H + (rowsOnScreen - 1) * GAP_Y;
    const startY = AREA_TOP + (availH - totalH) / 2;

    this.slots = [];
    this.rowRects = [];
    for (let r = 0; r < rows; r++) {
      const page = Math.floor(r / MAX_ROWS_PER_PAGE);
      const screenRow = r % MAX_ROWS_PER_PAGE;
      const cnt = rowCounts[r];
      const rowW = cnt * this.bookW + (cnt - 1) * GAP_X;
      const startX = regionCenter - rowW / 2 + this.bookW / 2;
      const centerY = startY + this.bookH / 2 + screenRow * rowStride;
      for (let c = 0; c < cnt; c++) {
        this.slots.push({ x: startX + c * (this.bookW + GAP_X), y: centerY, page });
      }
      this.rowRects.push({
        x: startX - this.bookW / 2 - 16,
        y: startY + this.bookH + screenRow * rowStride,
        w: rowW + 32,
        page,
      });
    }

    this.celebrateY = (AREA_TOP + AREA_BOTTOM) / 2;
  }

  buildShelf(count) {
    this.computeLayout(count);

    this.shelfGraphics = [];
    this.rowRects.forEach((rect) => {
      const g = this.add.graphics();
      g.fillStyle(COLORS.woodLight, 1);
      g.fillRect(rect.x, rect.y, rect.w, BOARD_H);
      g.fillStyle(COLORS.woodDark, 1);
      g.fillRect(rect.x, rect.y + BOARD_H, rect.w, 9);
      this.shelfGraphics.push({ gfx: g, page: rect.page });
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

    const showAuthor = w >= 78;
    const showGenre  = h >= 88;

    const titleSize = Math.round(Phaser.Math.Clamp(Math.min(h * 0.11, w * 0.2), 12, 15));
    const metaSize  = Math.round(Phaser.Math.Clamp(Math.min(h * 0.09, w * 0.17), 11, 13));

    const spine = this.add.graphics();
    const fill = Phaser.Display.Color.HexStringToColor(book.color).color;

    // ── Book cover body ──────────────────────────────────────
    spine.fillStyle(fill, 1);
    spine.fillRoundedRect(-w / 2, -h / 2, w, h, 7);

    // Binding strip on the left (spine edge)
    const bindW = Math.max(5, Math.round(w * 0.1));
    spine.fillStyle(0x000000, 0.2);
    spine.fillRoundedRect(-w / 2, -h / 2, bindW, h, { tl: 7, tr: 2, bl: 7, br: 2 });

    // Page edges on the right (stacked pages visible from front)
    const ex = w / 2 - 3;
    spine.fillStyle(0xffffff, 0.35);
    spine.fillRect(ex - 1, -h / 2 + 5, 2, h - 10);
    spine.fillStyle(0xffffff, 0.2);
    spine.fillRect(ex - 4, -h / 2 + 5, 2, h - 10);
    spine.fillStyle(0xffffff, 0.1);
    spine.fillRect(ex - 7, -h / 2 + 5, 2, h - 10);

    // Inner frame (book cover border)
    spine.lineStyle(1, 0xffffff, 0.22);
    spine.strokeRoundedRect(-w / 2 + bindW + 2, -h / 2 + 3, w - bindW - 8, h - 6, 4);

    // Outer border
    spine.lineStyle(1.5, 0x000000, 0.35);
    spine.strokeRoundedRect(-w / 2, -h / 2, w, h, 7);

    const shadow = { offsetX: 0, offsetY: 1, color: "#000000", blur: 3, fill: true };

    const titleTxt = this.add
      .text(0, -h / 2 + 10, book.title, {
        fontFamily: FONTS.body,
        fontSize: `${titleSize}px`,
        color: "#ffffff",
        align: "center",
        fontStyle: "bold",
        wordWrap: { width: w - 10 },
        shadow,
      })
      .setOrigin(0.5, 0);

    const yearOnly = !showAuthor && !showGenre;
    let metaStr;
    if (showAuthor && showGenre) {
      metaStr = `${book.author}\n${book.genre} \u00b7 ${book.year}`;
    } else if (showGenre) {
      metaStr = `${book.genre} \u00b7 ${book.year}`;
    } else {
      metaStr = `${book.year}`;
    }

    const metaTxt = this.add
      .text(0, h / 2 - 8, metaStr, {
        fontFamily: FONTS.body,
        fontSize: `${yearOnly ? metaSize + 1 : metaSize}px`,
        fontStyle: yearOnly ? "bold" : "normal",
        color: "#ffffff",
        align: "center",
        lineSpacing: 3,
        wordWrap: { width: w - 10 },
        shadow,
      })
      .setOrigin(0.5, 1);

    const container = this.add.container(slot.x, slot.y, [spine, titleTxt, metaTxt]);
    container.setSize(w, h);
    container.setData("book", book);
    container.setData("spine", spine);
    container.setData("compact", !showAuthor || !showGenre);
    return container;
  }

  showBookTooltip(container) {
    this.hideBookTooltip();
    if (this.dragging || this.solved) return;

    const { width } = this.scale;
    const book = container.getData("book");
    const h = this.bookH;
    const lines = `${book.title}\n${book.author}\n${book.genre} \u00b7 ${book.year}`;

    const txt = this.add
      .text(0, 0, lines, {
        fontFamily: FONTS.body,
        fontSize: "13px",
        color: "#2c1d14",
        align: "center",
        lineSpacing: 3,
      })
      .setDepth(60)
      .setOrigin(0.5, 1);

    const tw = txt.width + 18;
    const th = txt.height + 12;
    const tx = Phaser.Math.Clamp(container.x, tw / 2 + 8, width - tw / 2 - 8);
    const ty = Math.max(AREA_TOP + th + 4, container.y - h / 2 - 6);

    txt.setPosition(tx, ty);

    const bg = this.add.graphics().setDepth(59);
    bg.fillStyle(COLORS.parchment, 0.97);
    bg.fillRoundedRect(tx - tw / 2, ty - th, tw, th, 8);
    bg.lineStyle(1, 0x2c1d14, 0.3);
    bg.strokeRoundedRect(tx - tw / 2, ty - th, tw, th, 8);

    this.activeTooltip = { txt, bg };
  }

  hideBookTooltip() {
    if (this.activeTooltip) {
      this.activeTooltip.txt.destroy();
      this.activeTooltip.bg.destroy();
      this.activeTooltip = null;
    }
  }

  enableDragging() {
    this.activeTooltip = null;

    this.order.forEach((c) => {
      c.setInteractive({ useHandCursor: true, draggable: true });
      c.on("pointerover", () => this.showBookTooltip(c));
      c.on("pointerout",  () => this.hideBookTooltip());
    });

    this.input.on("dragstart", (_p, obj) => {
      if (this.solved || this.autoArranging) return;
      this.hideBookTooltip();
      this.dragging = obj;
      obj.setDepth(20);
      this.tweens.add({ targets: obj, scale: 1.06, duration: 100 });
    });

    this.input.on("drag", (_p, obj, dragX, dragY) => {
      if (this.solved || this.autoArranging) return;
      obj.x = dragX;
      obj.y = dragY;
      this.maybeFlipPage(dragX);
    });

    this.input.on("dragend", (_p, obj) => {
      if (this.solved || this.autoArranging) return;
      obj.setDepth(1);
      this.tweens.add({ targets: obj, scale: 1, duration: 100 });
      this.handleDrop(obj);
      this.dragging = null;
      this.showPage(this.currentPage);
    });
  }

  maybeFlipPage(dragX) {
    if (this.pageCount <= 1) return;
    const { width } = this.scale;
    if (this.time.now < this.flipCooldown) return;
    if (dragX > width - RIGHT_GUTTER && this.currentPage < this.pageCount - 1) {
      this.flipCooldown = this.time.now + 450;
      this.goToPage(this.currentPage + 1);
    } else if (dragX < RIGHT_GUTTER && this.currentPage > 0) {
      this.flipCooldown = this.time.now + 450;
      this.goToPage(this.currentPage - 1);
    }
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
    let best = -1;
    let bestDist = Infinity;
    this.slots.forEach((slot, i) => {
      if (slot.page !== this.currentPage) return;
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

  buildLevelInstruction() {
    const { width } = this.scale;
    this.levelText.setText(
      I18n.t("levelProgress", { level: this.levelNumber, total: this.totalLevels })
    );

    const translated = I18n.t(`rule_${this.levelDef.rule}`);
    const ruleName = translated.startsWith("rule_")
      ? getRuleLabel(this.levelDef.rule)
      : translated;
    const ruleLine = I18n.t("ruleColon", { label: ruleName });
    const detail =
      I18n.pick(this.levelDef, "hint") || I18n.pick(this.levelDef, "description");
    const bx = width / 2;
    const by = 78;

    this.add
      .text(bx, by, ruleLine, {
        fontFamily: FONTS.body,
        fontSize: "18px",
        color: "#d9a441",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);

    if (detail) {
      this.add
        .text(bx, by + 26, detail, {
          fontFamily: FONTS.body,
          fontSize: "15px",
          color: "#f3e3c3",
          align: "center",
          wordWrap: { width: width - 120 },
        })
        .setOrigin(0.5, 0);
    }
  }

  buildLibrarian() {
    const { height } = this.scale;
    this.librarian = this.add
      .image(44, height - 28, "librarian")
      .setScale(0.74)
      .setOrigin(0.5, 1)
      .setDepth(5);

    this.tweens.add({
      targets: this.librarian,
      y: this.librarian.y - 4,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  buildControls() {
    const { width } = this.scale;
    // Primary action — compact icon button, pinned top-right below Menu
    const bx = width - 70;
    const by = 96;
    this.checkBtn = makeButton(
      this,
      bx,
      by,
      "\u2713",
      () => this.checkSolved(true),
      { width: 64, height: 44, fontSize: 26, fill: COLORS.good, textColor: "#ffffff" }
    ).setDepth(51);
    this.checkBtn.on("pointerover", () =>
      this.showActionTooltip(bx, by + 40, I18n.t("checkOrder"))
    );
    this.checkBtn.on("pointerout", () => this.hideActionTooltip());

    this.actionMenuItems = [];
    this.actionMenuOpen = false;
  }

  showActionTooltip(x, y, label) {
    this.hideActionTooltip();
    const txt = this.add
      .text(0, 0, label, {
        fontFamily: FONTS.body,
        fontSize: "14px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(71);

    const padX = 10;
    const padY = 6;
    const bw = txt.width + padX * 2;
    const bh = txt.height + padY * 2;
    const bg = this.add.graphics().setDepth(70);
    bg.fillStyle(COLORS.ink, 0.95);
    bg.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 6);
    bg.lineStyle(1, COLORS.accent, 0.8);
    bg.strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 6);
    txt.setPosition(x, y);

    this.actionTooltip = { bg, txt };
  }

  hideActionTooltip() {
    if (!this.actionTooltip) return;
    this.actionTooltip.bg.destroy();
    this.actionTooltip.txt.destroy();
    this.actionTooltip = null;
  }

  toggleActionMenu() {
    if (this.actionMenuOpen) {
      this.closeActionMenu();
      return;
    }
    this.actionMenuOpen = true;

    const { width, height } = this.scale;
    const itemW = 190;
    const itemH = 44;
    const vgap = 8;
    const menuX = width - 12 - itemW / 2;
    const baseY = 56 + 8 + itemH / 2;

    this.actionOverlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.001)
      .setOrigin(0)
      .setDepth(58)
      .setInteractive();
    this.actionOverlay.on("pointerdown", () => this.closeActionMenu());

    const defs = [
      {
        label: I18n.t("autoArrange"),
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
        onTap: () => this.autoArrange(),
      },
      {
        label: I18n.t("resetR"),
        fill: COLORS.accent,
        textColor: "#2c1d14",
        onTap: () => this.resetLevel(),
      },
      {
        label: I18n.t("menu"),
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
        onTap: () => this.scene.start("MenuScene"),
      },
    ];

    defs.forEach((def, i) => {
      const cy = baseY + i * (itemH + vgap);
      const btn = makeButton(this, menuX, cy, def.label, () => {
        this.closeActionMenu();
        def.onTap();
      }, {
        width: itemW,
        height: itemH,
        fontSize: 16,
        fill: def.fill,
        textColor: def.textColor,
      }).setDepth(60);
      this.actionMenuItems.push(btn);
    });
  }

  closeActionMenu() {
    this.actionMenuOpen = false;
    this.actionOverlay?.destroy();
    this.actionOverlay = null;
    this.actionMenuItems?.forEach((b) => b.destroy());
    this.actionMenuItems = [];
  }

  buildPager() {
    const { width } = this.scale;
    const midY = (AREA_TOP + AREA_BOTTOM) / 2;

    // Left side arrow
    this.sidePrev = makeButton(
      this,
      28,
      midY,
      "\u2039",
      () => this.goToPage(this.currentPage - 1),
      { width: 44, height: 96, fontSize: 40, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    ).setDepth(40);

    // Right side arrow
    this.sideNext = makeButton(
      this,
      width - 28,
      midY,
      "\u203a",
      () => this.goToPage(this.currentPage + 1),
      { width: 44, height: 96, fontSize: 40, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    ).setDepth(40);

    // Minimal page indicator — small pill at bottom center
    this.pagerLabel = this.add
      .text(width / 2, AREA_BOTTOM + 18, "", {
        fontFamily: FONTS.body,
        fontSize: "13px",
        color: "#c9b08a",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(40);
  }

  showPage(p) {
    this.currentPage = Phaser.Math.Clamp(p, 0, this.pageCount - 1);

    this.order.forEach((c, i) => {
      const onPage = this.slots[i].page === this.currentPage;
      c.setVisible(onPage || c === this.dragging);
    });
    this.slotGuides.forEach((guide, i) =>
      guide.setVisible(this.slots[i].page === this.currentPage)
    );
    this.shelfGraphics.forEach((s) => s.gfx.setVisible(s.page === this.currentPage));

    this.updatePager();
  }

  goToPage(p) {
    const target = Phaser.Math.Clamp(p, 0, this.pageCount - 1);
    if (target === this.currentPage) return;
    this.showPage(target);
  }

  updatePager() {
    const multi = this.pageCount > 1;
    const notFirst = this.currentPage > 0;
    const notLast  = this.currentPage < this.pageCount - 1;

    this.sidePrev?.setVisible(multi && notFirst);
    this.sideNext?.setVisible(multi && notLast);
    this.pagerLabel?.setVisible(multi);
    if (!multi) return;

    this.pagerLabel.setText(
      I18n.t("pageIndicator", { page: this.currentPage + 1, total: this.pageCount })
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
    const wrongPages = new Set();

    this.order.forEach((c, i) => {
      const ok   = perSlot[i];
      const slot = this.slots[i];
      const guide = this.slotGuides[i];
      const onScreen = slot.page === this.currentPage;

      // Draw guide border on current page only (other guides are hidden)
      if (onScreen) {
        guide.clear();
        guide.lineStyle(3, ok ? COLORS.good : COLORS.bad, 0.9);
        guide.strokeRoundedRect(
          slot.x - this.bookW / 2,
          slot.y - this.bookH / 2,
          this.bookW,
          this.bookH,
          8
        );
      }

      if (!ok) {
        if (onScreen) {
          // Shake only visible wrong books
          this.tweens.add({ targets: c, x: c.x + 6, duration: 50, yoyo: true, repeat: 3 });
        } else {
          wrongPages.add(slot.page + 1); // 1-based page number
        }
      }
    });

    // Toast warning for errors on hidden pages
    if (wrongPages.size > 0) {
      const pages = [...wrongPages].sort().join(", ");
      this.showFeedbackToast(I18n.t("errorsOnPage", { pages }));
    }

    this.time.delayedCall(1000, () => this.restoreGuides());
  }

  showFeedbackToast(message) {
    // Destroy any previous toast
    if (this.feedbackToast) {
      this.feedbackToast.forEach((o) => o.destroy());
      this.feedbackToast = null;
    }

    const { width } = this.scale;
    const toastY = AREA_BOTTOM - 12;

    const txt = this.add
      .text(width / 2, toastY, message, {
        fontFamily: FONTS.body,
        fontSize: "14px",
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setDepth(70)
      .setAlpha(0);

    const tw = txt.width + 24;
    const th = txt.height + 12;
    const bg = this.add.graphics().setDepth(69).setAlpha(0);
    bg.fillStyle(COLORS.bad, 0.92);
    bg.fillRoundedRect(width / 2 - tw / 2, toastY - th, tw, th, 8);

    this.feedbackToast = [bg, txt];

    this.tweens.add({
      targets: [bg, txt],
      alpha: 1,
      duration: 200,
      hold: 2200,
      yoyo: true,
      onComplete: () => {
        bg.destroy();
        txt.destroy();
        this.feedbackToast = null;
      },
    });
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
        autoUsed: this.autoUsed,
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
    const base = Math.max(50, raw);
    return this.autoUsed ? Math.min(100, base) : base;
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
    this.showPage(0);
    this.checkSolved();
    return this.solved;
  }

  autoArrange() {
    if (!this.levelDef || this.solved || this.autoArranging) return;
    this.showAutoConfirm();
  }

  showAutoConfirm() {
    const { width, height } = this.scale;
    const pw = 400, ph = 210;
    const px = (width - pw) / 2, py = (height - ph) / 2;

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.55)
      .setOrigin(0)
      .setDepth(50)
      .setInteractive();

    const panel = this.add.graphics().setDepth(51);
    panel.fillStyle(0x3b2a1a, 1);
    panel.fillRoundedRect(px, py, pw, ph, 14);
    panel.lineStyle(2, 0xd9a441, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 14);

    const title = this.add.text(width / 2, py + 28, I18n.t("autoConfirmTitle"), {
      fontFamily: "Georgia, serif",
      fontSize: "20px",
      color: "#f3e3c3",
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setDepth(52);

    const body = this.add.text(width / 2, py + 80, I18n.t("autoConfirmBody"), {
      fontFamily: "Georgia, serif",
      fontSize: "14px",
      color: "#c8b89a",
      align: "center",
    }).setOrigin(0.5, 0.5).setDepth(52);

    const closeAll = () => {
      overlay.destroy();
      panel.destroy();
      title.destroy();
      body.destroy();
      cancelBtn.destroy();
      confirmBtn.destroy();
    };

    const cancelBtn = this.makeDialogButton(
      px + 90, py + ph - 42, 140, 38,
      I18n.t("cancel") ?? "Cancel",
      0x5a3e28, "#f3e3c3", 52,
      closeAll
    );

    const confirmBtn = this.makeDialogButton(
      px + pw - 90, py + ph - 42, 160, 38,
      I18n.t("autoConfirmYes"),
      0x8b2020, "#ffffff", 52,
      () => { closeAll(); this.runAutoArrange(); }
    );
  }

  makeDialogButton(cx, cy, w, h, label, fillColor, textColor, depth, onTap) {
    const bg = this.add.graphics().setDepth(depth);
    const draw = (lit) => {
      bg.clear();
      bg.fillStyle(lit ? 0xffffff : fillColor, lit ? 0.15 : 1);
      bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
      bg.lineStyle(1, 0xd9a441, 0.7);
      bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    };
    draw(false);

    const txt = this.add.text(cx, cy, label, {
      fontFamily: "Georgia, serif",
      fontSize: "14px",
      color: textColor,
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setDepth(depth + 1);

    const zone = this.add.zone(cx, cy, w, h).setDepth(depth + 2).setInteractive();
    zone.on("pointerover", () => draw(true));
    zone.on("pointerout", () => draw(false));
    zone.on("pointerup", () => onTap());

    const destroy = () => { bg.destroy(); txt.destroy(); zone.destroy(); };
    return { destroy };
  }

  runAutoArrange() {
    if (!this.levelDef || this.solved || this.autoArranging) return;
    this.autoUsed = true;
    this.autoArranging = true;
    this.autoBtn?.setEnabled(false);

    const books = this.order.map((c) => c.getData("book"));
    const { expected } = evaluateOrder(books, this.levelDef.rule);
    this.order.sort(
      (a, b) => expected.indexOf(a.getData("book")) - expected.indexOf(b.getData("book"))
    );

    this.currentPage = 0;
    this.showPage(0);

    const stepDelay = 100;
    let animSteps = 0;
    this.order.forEach((c, i) => {
      const slot = this.slots[i];
      if (slot.page !== 0) {
        c.x = slot.x;
        c.y = slot.y;
        return;
      }
      const step = animSteps++;
      c.setDepth(10 + step);
      this.tweens.add({
        targets: c,
        x: slot.x,
        y: slot.y,
        delay: step * stepDelay,
        duration: 280,
        ease: "Back.out",
        onStart: () => {
          this.tweens.add({ targets: c, scale: 1.1, duration: 140, yoyo: true });
        },
      });
    });

    const total = animSteps * stepDelay + 360;
    this.time.delayedCall(total, () => {
      this.order.forEach((c) => c.setDepth(1));
      this.autoArranging = false;
      this.showPage(0);
      this.checkSolved();
    });
  }

  update() {
    if (this.timerStarted && !this.solved) {
      const elapsed = this.time.now - this.startTime;
      this.timeText.setText(I18n.t("timeLabel", { time: formatTime(elapsed) }));
    }
  }
}
