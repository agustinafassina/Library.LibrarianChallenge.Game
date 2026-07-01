import { getLevelWithBooks, getLevelCount } from "../utils/dataLoader.js";
import { evaluateOrder, getRuleLabel, resolveRule } from "../utils/rules.js";
import { Storage } from "../utils/storage.js";
import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, goToScene, COLORS, FONTS, formatTime } from "../utils/ui.js";

const BOOK_W_MAX = 102;
const BOOK_H_MAX = 152;
const GAP_X = 14;
const GAP_Y = 18;
const BOARD_H = 14;
const MAX_PER_ROW = 6;
const MAX_ROWS_PER_PAGE = 4;
let AREA_TOP = 150;
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
    this.paused = false;
    this.pauseStart = 0;
    this.pauseItems = null;
    this.moveHistory = [];
    this.failed = false;
    this.challenge = null;
    this.challengeText = null;
    this.challengeBadgeBg = null;
    this.failItems = null;
  }

  async create() {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(200, 0, 0, 0);
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
    this.initChallenge();

    this.buildLevelInstruction();
    this.buildShelf();
    this.buildBooks();
    this.buildLibrarian();
    this.buildControls();
    this.buildPager();
    this.buildFlipEdgeHints();
    this.showPage(0);

    this.input.keyboard.on("keydown-R", () => this.resetLevel());
    this.input.keyboard.on("keydown-P", () => this.togglePause());
    this.input.keyboard.on("keydown-ESC", () => this.togglePause());
    this.input.keyboard.on("keydown-Z", (e) => {
      if (e.ctrlKey || e.metaKey) this.undoMove();
    });

    this.startTime = this.time.now;
    this.timerStarted = true;
    this.updateChallengeDisplay();
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

  initChallenge() {
    const raw = this.levelDef?.challenge;
    if (!raw) {
      this.challenge = null;
      return;
    }
    const maxMoves = Number.isFinite(raw.maxMoves) ? raw.maxMoves : null;
    const maxTimeMs = Number.isFinite(raw.maxTimeSec) ? raw.maxTimeSec * 1000 : null;
    this.challenge = maxMoves == null && maxTimeMs == null
      ? null
      : { maxMoves, maxTimeMs };
  }

  buildChallengeDisplayText() {
    if (!this.challenge) return "";
    const chunks = [];
    if (this.challenge.maxMoves != null) {
      const left = Math.max(0, this.challenge.maxMoves - this.moves);
      chunks.push(I18n.t("challengeMovesLeft", { n: left }));
    }
    if (this.challenge.maxTimeMs != null) {
      const elapsed = Math.max(0, this.time.now - this.startTime);
      const leftMs = Math.max(0, this.challenge.maxTimeMs - elapsed);
      chunks.push(I18n.t("challengeTimeLeft", { time: formatTime(leftMs) }));
    }
    return I18n.t("challengeGoal", { goal: chunks.join(" · ") });
  }

  updateChallengeDisplay() {
    if (!this.challengeText || !this.challenge) return;
    this.challengeText.setText(this.buildChallengeDisplayText());
    this.refreshChallengeBadge();
  }

  refreshChallengeBadge() {
    if (!this.challengeBadgeBg || !this.challengeText) return;
    const padX = 12;
    const padY = 6;
    const x = this.challengeText.x - this.challengeText.width / 2 - padX;
    const y = this.challengeText.y - padY;
    const w = this.challengeText.width + padX * 2;
    const h = this.challengeText.height + padY * 2;
    this.challengeBadgeBg.clear();
    this.challengeBadgeBg.fillStyle(0x5a1f1f, 0.9);
    this.challengeBadgeBg.fillRoundedRect(x, y, w, h, 8);
    this.challengeBadgeBg.lineStyle(1.5, 0xff8f8f, 0.95);
    this.challengeBadgeBg.strokeRoundedRect(x, y, w, h, 8);
  }

  checkChallengeLimits() {
    if (!this.challenge || this.solved || this.failed) return false;
    if (this.challenge.maxMoves != null && this.moves > this.challenge.maxMoves) {
      this.onChallengeFailed("moves");
      return true;
    }
    const elapsed = this.time.now - this.startTime;
    if (this.challenge.maxTimeMs != null && elapsed > this.challenge.maxTimeMs) {
      this.onChallengeFailed("time");
      return true;
    }
    return false;
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
    const headerRight = width - 250;
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

    // Pause button — compact icon just right of the timer
    const pbx = width - 158;
    this.pauseBtn = makeButton(
      this,
      pbx,
      28,
      "\u2016",
      () => this.togglePause(),
      { width: 44, height: 40, fontSize: 20, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    ).setDepth(51);
    this.pauseBtn.on("pointerover", () =>
      this.showActionTooltip(pbx, 62, I18n.t("pause"))
    );
    this.pauseBtn.on("pointerout", () => this.hideActionTooltip());

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

  computeLayout(zones) {
    if (zones.length === 1) {
      this._layoutSingleZone(zones[0]);
    } else {
      this._layoutMultiZone(zones);
    }
  }

  _layoutSingleZone(zone) {
    const { width } = this.scale;
    const count = zone.books.length;
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
      60, BOOK_W_MAX
    );
    this.bookH = Phaser.Math.Clamp(
      (availH - rowsOnScreen * BOARD_H - (rowsOnScreen - 1) * GAP_Y) / rowsOnScreen,
      78, BOOK_H_MAX
    );

    const rowStride = this.bookH + BOARD_H + GAP_Y;
    const totalH = rowsOnScreen * this.bookH + rowsOnScreen * BOARD_H + (rowsOnScreen - 1) * GAP_Y;
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
        this.slots.push({ x: startX + c * (this.bookW + GAP_X), y: centerY, page, zoneIdx: 0 });
      }
      this.rowRects.push({
        x: startX - this.bookW / 2 - 16,
        y: startY + this.bookH + screenRow * rowStride,
        w: rowW + 32,
        page, zoneIdx: 0,
      });
    }

    this.zoneRanges = [{ zi: 0, rule: zone.rule, label: zone.label, label_es: zone.label_es,
      start: 0, end: count - 1 }];
    this.zoneTopYMap = null;
    this.celebrateY = (AREA_TOP + AREA_BOTTOM) / 2;
  }

  _layoutMultiZone(zones) {
    const { width } = this.scale;
    const ZONE_LABEL_H = 26;
    const ZONE_SEP = 18;

    this.pageCount = 1; // multi-zone levels are single-page
    this.slots = [];
    this.rowRects = [];
    this.zoneRanges = [];
    this.zoneTopYMap = new Map();

    // Pre-compute per-zone row metadata
    const zoneMetas = zones.map((zone) => {
      const count = zone.books.length;
      const rows = Math.max(1, Math.ceil(count / MAX_PER_ROW));
      const rowCounts = [];
      let remaining = count;
      for (let r = 0; r < rows; r++) {
        const n = Math.ceil(remaining / (rows - r));
        rowCounts.push(n);
        remaining -= n;
      }
      return { count, rows, rowCounts, widestRow: Math.max(...rowCounts) };
    });

    const totalRows = zoneMetas.reduce((s, z) => s + z.rows, 0);
    const maxWidestRow = Math.max(...zoneMetas.map((z) => z.widestRow));
    const numZones = zones.length;

    const regionLeft = LEFT_RESERVED;
    const regionRight = width - RIGHT_MARGIN;
    const regionCenter = (regionLeft + regionRight) / 2;
    const availW = regionRight - regionLeft;

    // Height reserved for zone labels and separators
    const labelsH = numZones * ZONE_LABEL_H + (numZones - 1) * ZONE_SEP;
    const availH = AREA_BOTTOM - AREA_TOP - labelsH;

    this.bookW = Phaser.Math.Clamp(
      (availW - (maxWidestRow - 1) * GAP_X) / maxWidestRow,
      60, BOOK_W_MAX
    );
    this.bookH = Phaser.Math.Clamp(
      (availH - totalRows * BOARD_H - (totalRows - 1) * GAP_Y) / totalRows,
      78, BOOK_H_MAX
    );

    const rowStride = this.bookH + BOARD_H + GAP_Y;

    let currentY = AREA_TOP;
    let slotStart = 0;

    zones.forEach((zone, zi) => {
      const meta = zoneMetas[zi];

      // Record the Y position of this zone's label area
      this.zoneTopYMap.set(zi, currentY);
      currentY += ZONE_LABEL_H;

      // Lay out rows for this zone
      for (let r = 0; r < meta.rows; r++) {
        const cnt = meta.rowCounts[r];
        const rowW = cnt * this.bookW + (cnt - 1) * GAP_X;
        const startX = regionCenter - rowW / 2 + this.bookW / 2;
        const centerY = currentY + this.bookH / 2;

        for (let c = 0; c < cnt; c++) {
          this.slots.push({
            x: startX + c * (this.bookW + GAP_X),
            y: centerY,
            page: 0,
            zoneIdx: zi,
          });
        }
        this.rowRects.push({
          x: startX - this.bookW / 2 - 16,
          y: currentY + this.bookH,
          w: rowW + 32,
          page: 0, zoneIdx: zi,
        });
        currentY += rowStride;
      }

      this.zoneRanges.push({
        zi, rule: zone.rule, label: zone.label, label_es: zone.label_es,
        start: slotStart, end: slotStart + meta.count - 1,
      });
      slotStart += meta.count;

      if (zi < numZones - 1) currentY += ZONE_SEP;
    });

    this.celebrateY = (AREA_TOP + AREA_BOTTOM) / 2;
  }

  buildShelf() {
    const zones = this.levelDef.zones;
    this.computeLayout(zones);

    this.shelfGraphics = [];
    this.rowRects.forEach((rect) => {
      const g = this.add.graphics();
      g.fillStyle(COLORS.woodLight, 1);
      g.fillRect(rect.x, rect.y, rect.w, BOARD_H);
      g.fillStyle(COLORS.woodDark, 1);
      g.fillRect(rect.x, rect.y + BOARD_H, rect.w, 9);
      this.shelfGraphics.push({ gfx: g, page: rect.page });
    });

    // Zone labels and separators (multi-zone levels only)
    this.zoneLabelObjects = [];
    if (zones.length > 1 && this.zoneTopYMap) {
      this.zoneRanges.forEach((range) => {
        const labelY = this.zoneTopYMap.get(range.zi);
        if (labelY == null) return;

        const rawLabel = I18n.lang === "es"
          ? (range.label_es || range.label || "")
          : (range.label || range.label_es || "");
        const ruleName = this.ruleDisplayName(range.rule);
        const displayText = rawLabel
          ? `${rawLabel} \u2014 ${ruleName}`
          : ruleName;

        // Separator line above zone (except first)
        if (range.zi > 0) {
          const sepG = this.add.graphics();
          sepG.lineStyle(1, COLORS.accent, 0.25);
          sepG.lineBetween(LEFT_RESERVED, labelY - 8, this.scale.width - RIGHT_MARGIN, labelY - 8);
          this.zoneLabelObjects.push(sepG);
        }

        const lbl = this.add
          .text(LEFT_RESERVED + 8, labelY + 13, displayText, {
            fontFamily: FONTS.body,
            fontSize: "13px",
            color: "#d9a441",
            fontStyle: "bold",
          })
          .setOrigin(0, 0.5)
          .setDepth(10);
        this.zoneLabelObjects.push(lbl);
      });
    }

    this.slotGuides = [];
    this.slots.forEach((slot) => {
      const guide = this.add.graphics();
      guide.fillStyle(COLORS.parchment, 0.08);
      guide.fillRoundedRect(
        slot.x - this.bookW / 2,
        slot.y - this.bookH / 2,
        this.bookW,
        this.bookH,
        8
      );
      guide.lineStyle(2, COLORS.accent, 0.34);
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

  buildBooks() {
    const zones = this.levelDef.zones;
    this.order = [];

    zones.forEach((zone, zi) => {
      const scrambled = this.scrambleZone(zone.books, zone.rule);
      const range = this.zoneRanges[zi];
      const primaryAttr = this.primaryAttrFor(zone.rule);
      scrambled.forEach((book, localIdx) => {
        const slotIdx = range.start + localIdx;
        const card = this.createBookCard(book, this.slots[slotIdx], primaryAttr);
        card.setData("zoneIdx", zi);
        this.order.push(card);
      });
    });

    this.enableDragging();
  }

  /** The first sort key of a rule, used to surface the relevant attribute on cards. */
  primaryAttrFor(rule) {
    const { keys } = resolveRule(rule);
    return keys[0]?.key ?? null;
  }

  sizeWord(size) {
    const key = { small: "sizeSmall", medium: "sizeMedium", large: "sizeLarge" }[
      String(size).toLowerCase()
    ];
    return key ? I18n.t(key) : String(size);
  }

  /**
   * Score a shuffled arrangement by how "easy" it is.
   * Lower fixed slots and larger displacements mean better challenge starts.
   */
  scoreShuffle(arr, rule) {
    const { expected, perSlot } = evaluateOrder(arr, rule);
    const n = arr.length;
    const expectedIndex = new Map(expected.map((b, i) => [b, i]));
    let displaced = 0;
    let farDisplaced = 0;
    let displacementSum = 0;

    arr.forEach((book, i) => {
      const ei = expectedIndex.get(book);
      const d = Math.abs(i - ei);
      displacementSum += d;
      if (d > 0) displaced++;
      if (d >= 2) farDisplaced++;
    });

    const correctCount = perSlot.filter(Boolean).length;
    return {
      solved: perSlot.every(Boolean),
      correctCount,
      displaced,
      farDisplaced,
      avgDisplacement: n > 0 ? displacementSum / n : 0,
    };
  }

  /**
   * A controlled-difficulty start should avoid "almost solved" layouts.
   * Rules are lenient on tiny levels and stricter on medium/large ones.
   */
  isGoodShuffle(score, n) {
    if (score.solved) return false;
    if (n <= 2) return true;

    // Cap how many books may start in the right slot.
    const maxCorrect = n <= 4 ? 1 : Math.floor(n * 0.3);
    if (score.correctCount > maxCorrect) return false;

    // Require enough books to move from their expected slot.
    const minDisplaced = n <= 4 ? n - 1 : Math.ceil(n * 0.6);
    if (score.displaced < minDisplaced) return false;

    // Require at least one meaningful displacement.
    if (n >= 5 && score.farDisplaced < 1) return false;

    return true;
  }

  scrambleZone(books, rule) {
    if (books.length < 2) return [...books];

    let bestArr = [...books];
    let bestScore = this.scoreShuffle(bestArr, rule);

    // Try many shuffles and keep the best fallback if strict criteria aren't met.
    for (let attempts = 0; attempts < 120; attempts++) {
      const candidate = Phaser.Utils.Array.Shuffle([...books]);
      const score = this.scoreShuffle(candidate, rule);

      if (this.isGoodShuffle(score, books.length)) {
        return candidate;
      }

      // Prefer fewer correct slots, then larger average displacement.
      const isBetter =
        score.correctCount < bestScore.correctCount ||
        (
          score.correctCount === bestScore.correctCount &&
          score.avgDisplacement > bestScore.avgDisplacement
        );
      if (isBetter) {
        bestArr = candidate;
        bestScore = score;
      }
    }

    return bestArr;
  }

  /** @deprecated kept for any legacy call-sites; delegates to scrambleZone */
  scramble(books) {
    const rule = this.levelDef.zones?.[0]?.rule ?? this.levelDef.rule;
    return this.scrambleZone(books, rule);
  }

  createBookCard(book, slot, primaryAttr = null) {
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

    // When the level sorts by pages or size, surface that attribute prominently
    // so the puzzle is solvable at a glance (colour is already the spine fill).
    const emphasize = primaryAttr === "pages" || primaryAttr === "size";
    const yearOnly = emphasize || (!showAuthor && !showGenre);
    let metaStr;
    if (primaryAttr === "pages") {
      metaStr = I18n.t("pagesCount", { n: book.pages });
    } else if (primaryAttr === "size") {
      metaStr = this.sizeWord(book.size);
    } else if (showAuthor && showGenre) {
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
    const lines =
      `${book.title}\n${book.author}\n${book.genre} \u00b7 ${book.year}\n` +
      `${this.sizeWord(book.size)} \u00b7 ${I18n.t("pagesCount", { n: book.pages })}`;

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
      if (this.solved || this.failed || this.autoArranging || this.paused) return;
      this.hideBookTooltip();
      this.dragging = obj;
      obj.setDepth(20);
      this.tweens.add({ targets: obj, scale: 1.06, duration: 100 });
      this.updateFlipEdgeHints(obj.x);
    });

    this.input.on("drag", (_p, obj, dragX, dragY) => {
      if (this.solved || this.failed || this.autoArranging || this.paused) return;
      obj.x = dragX;
      obj.y = dragY;
      this.updateFlipEdgeHints(dragX);
      this.maybeFlipPage(dragX);
    });

    this.input.on("dragend", (_p, obj) => {
      if (this.solved || this.failed || this.autoArranging || this.paused) return;
      obj.setDepth(1);
      this.tweens.add({ targets: obj, scale: 1, duration: 100 });
      this.handleDrop(obj);
      this.dragging = null;
      this.hideFlipEdgeHints();
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
    const zoneIdx = obj.getData("zoneIdx");
    const multiZone = this.levelDef.zones.length > 1;
    const nearest = this.nearestSlot(obj.x, obj.y, multiZone ? zoneIdx : null);

    let moved = false;
    if (nearest !== fromIndex) {
      this.order.splice(fromIndex, 1);
      this.order.splice(nearest, 0, obj);
      moved = true;
      this.moves++;
      this.movesText.setText(I18n.t("movesLabel", { moves: this.moves }));
      this.moveHistory.push({ fromIndex, nearest });
      this.refreshUndoButton();
    }
    this.layoutBooks(true);
    if (moved) {
      this.updateChallengeDisplay();
      if (this.checkChallengeLimits()) return;
    }
    this.checkSolved();
  }

  undoMove() {
    if (this.solved || this.failed || this.autoArranging || this.paused) return;
    if (this.moveHistory.length === 0) return;

    const { fromIndex, nearest } = this.moveHistory.pop();
    const [obj] = this.order.splice(nearest, 1);
    this.order.splice(fromIndex, 0, obj);

    this.moves = Math.max(0, this.moves - 1);
    this.movesText.setText(I18n.t("movesLabel", { moves: this.moves }));
    this.updateChallengeDisplay();

    // Bring the affected page into view so the change is visible
    const slot = this.slots[fromIndex];
    this.currentPage = Phaser.Math.Clamp(slot.page, 0, this.pageCount - 1);
    this.layoutBooks(true);
    this.showPage(this.currentPage);
    this.refreshUndoButton();
  }

  refreshUndoButton() {
    const canUndo =
      this.moveHistory.length > 0 && !this.solved && !this.failed && !this.autoArranging;
    this.undoBtn?.setEnabled(canUndo);
  }

  /**
   * Returns the index of the nearest slot on the current page.
   * When zoneIdx is provided, only slots belonging to that zone are considered,
   * which prevents books from being dropped into the wrong zone.
   */
  nearestSlot(x, y, zoneIdx = null) {
    let best = -1;
    let bestDist = Infinity;
    this.slots.forEach((slot, i) => {
      if (slot.page !== this.currentPage) return;
      if (zoneIdx !== null && slot.zoneIdx !== zoneIdx) return;
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

    const zones = this.levelDef.zones;
    const bx = width / 2;
    const by = 74;
    let bottomOfInstruction = by;

    if (zones.length === 1) {
      // Single-zone: show "Rule: <label>" + optional hint
      const ruleName = this.ruleDisplayName(zones[0].rule);
      const ruleLine = I18n.t("ruleColon", { label: ruleName });
      const detail =
        I18n.pick(this.levelDef, "hint") || I18n.pick(this.levelDef, "description");

      const ruleObj = this.add
        .text(bx, by, ruleLine, {
          fontFamily: FONTS.body,
          fontSize: "18px",
          color: "#d9a441",
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5, 0);

      bottomOfInstruction = by + ruleObj.height + 6;

      if (detail) {
        const detailObj = this.add
          .text(bx, bottomOfInstruction, detail, {
            fontFamily: FONTS.body,
            fontSize: "14px",
            color: "#f3e3c3",
            align: "center",
            wordWrap: { width: width - 200 },
          })
          .setOrigin(0.5, 0);
        bottomOfInstruction += detailObj.height + 6;
      }
    } else {
      // Multi-zone: show level-wide hint (or generic multi-zone hint)
      const detail =
        I18n.pick(this.levelDef, "hint") || I18n.pick(this.levelDef, "description");
      const hintText = detail || I18n.t("multiZoneHint");
      const hintObj = this.add
        .text(bx, by, hintText, {
          fontFamily: FONTS.body,
          fontSize: "15px",
          color: "#f3e3c3",
          align: "center",
          wordWrap: { width: width - 200 },
        })
        .setOrigin(0.5, 0);
      bottomOfInstruction = by + hintObj.height + 6;
    }

    if (this.challenge) {
      const challengeY = bottomOfInstruction + 8;
      this.challengeBadgeBg = this.add.graphics().setDepth(51);
      this.challengeText = this.add
        .text(bx, challengeY, this.buildChallengeDisplayText(), {
          fontFamily: FONTS.body,
          fontSize: "16px",
          color: "#ffdede",
          align: "center",
          fontStyle: "bold",
          wordWrap: { width: width - 180 },
        })
        .setOrigin(0.5, 0)
        .setDepth(52);
      this.refreshChallengeBadge();
      bottomOfInstruction = challengeY + this.challengeText.height + 16;
    } else {
      this.challengeText = null;
      this.challengeBadgeBg = null;
    }

    // Adjust AREA_TOP dynamically so the grid never overlaps the instructions
    AREA_TOP = Math.max(140, bottomOfInstruction + 10);
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

    // Undo — compact icon button below Check, disabled until a move is made
    const uy = by + 56;
    this.undoBtn = makeButton(
      this,
      bx,
      uy,
      "\u21B6",
      () => this.undoMove(),
      { width: 64, height: 44, fontSize: 24, fill: COLORS.woodLight, textColor: "#f3e3c3", enabled: false }
    ).setDepth(51);
    this.undoBtn.on("pointerover", () =>
      this.showActionTooltip(bx, uy + 40, I18n.t("undo"))
    );
    this.undoBtn.on("pointerout", () => this.hideActionTooltip());

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
        label: I18n.t("language"),
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
        onTap: () => this.showLanguageModal(),
      },
      {
        label: I18n.t("menu"),
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
        onTap: () => goToScene(this, "MenuScene"),
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

  showLanguageModal() {
    const { width, height } = this.scale;
    const pw = 380, ph = 200;
    const px = (width - pw) / 2, py = (height - ph) / 2;

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.55)
      .setOrigin(0).setDepth(60).setInteractive();

    const panel = this.add.graphics().setDepth(61);
    panel.fillStyle(COLORS.ink, 0.97);
    panel.fillRoundedRect(px, py, pw, ph, 14);
    panel.lineStyle(2, COLORS.accent, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 14);

    const title = this.add.text(width / 2, py + 30, I18n.t("language"), {
      fontFamily: FONTS.title, fontSize: "22px", color: "#f3e3c3", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(62);

    const modalItems = [overlay, panel, title];

    const close = () => modalItems.forEach((o) => o.destroy());

    const langs = I18n.available;
    const totalW = langs.length * 150 + (langs.length - 1) * 16;
    const startX = width / 2 - totalW / 2 + 75;

    langs.forEach((lang, i) => {
      const isCurrent = lang.code === I18n.lang;
      const btn = makeButton(
        this,
        startX + i * 166,
        py + 98,
        lang.label,
        () => {
          if (lang.code !== I18n.lang) {
            I18n.set(lang.code);
            close();
            this.scene.restart({ level: this.levelNumber });
          } else {
            close();
          }
        },
        {
          width: 150, height: 46, fontSize: 17,
          fill: isCurrent ? COLORS.accent : COLORS.woodLight,
          textColor: isCurrent ? "#2c1d14" : "#f3e3c3",
        }
      ).setDepth(62);
      modalItems.push(btn);
    });

    const doneBtn = makeButton(this, width / 2, py + ph - 28, I18n.t("done"), close, {
      width: 130, height: 38, fontSize: 15,
      fill: COLORS.woodLight, textColor: "#f3e3c3",
    }).setDepth(62);
    modalItems.push(doneBtn);

    overlay.on("pointerdown", close);
  }

  togglePause() {
    if (this.solved || this.failed || this.autoArranging) return;
    if (this.paused) this.resumeGame();
    else this.pauseGame();
  }

  pauseGame() {
    if (this.paused || this.solved) return;
    this.paused = true;
    this.pauseStart = this.time.now;
    this.hideBookTooltip();
    this.hideActionTooltip();
    this.closeActionMenu?.();

    const { width, height } = this.scale;
    const pw = 360, ph = 300;
    const px = (width - pw) / 2, py = (height - ph) / 2;

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.6)
      .setOrigin(0).setDepth(80).setInteractive();

    const panel = this.add.graphics().setDepth(81);
    panel.fillStyle(COLORS.ink, 0.98);
    panel.fillRoundedRect(px, py, pw, ph, 16);
    panel.lineStyle(2, COLORS.accent, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 16);

    const title = this.add.text(width / 2, py + 44, I18n.t("paused"), {
      fontFamily: FONTS.title, fontSize: "28px", color: "#f3e3c3", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(82);

    const elapsed = this.pauseStart - this.startTime;
    const sub = this.add.text(width / 2, py + 84,
      `${I18n.t("timeLabel", { time: formatTime(elapsed) })}  \u00b7  ${I18n.t("movesLabel", { moves: this.moves })}`,
      { fontFamily: FONTS.body, fontSize: "15px", color: "#c9b08a" }
    ).setOrigin(0.5).setDepth(82);

    this.pauseItems = [overlay, panel, title, sub];

    const resumeBtn = makeButton(this, width / 2, py + 140, I18n.t("resume"),
      () => this.resumeGame(),
      { width: 220, height: 52, fontSize: 20, fill: COLORS.good, textColor: "#ffffff" }
    ).setDepth(82);

    const restartBtn = makeButton(this, width / 2, py + 200, I18n.t("restartLevel"),
      () => { this.clearPauseUI(); this.scene.restart({ level: this.levelNumber }); },
      { width: 200, height: 44, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    ).setDepth(82);

    const menuBtn = makeButton(this, width / 2, py + 252, I18n.t("menu"),
      () => { this.clearPauseUI(); goToScene(this, "MenuScene"); },
      { width: 200, height: 44, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    ).setDepth(82);

    this.pauseItems.push(resumeBtn, restartBtn, menuBtn);

    overlay.on("pointerdown", () => this.resumeGame());
  }

  resumeGame() {
    if (!this.paused) return;
    // Shift startTime forward by the paused duration so the timer stays accurate
    this.startTime += this.time.now - this.pauseStart;
    this.paused = false;
    this.clearPauseUI();
  }

  clearPauseUI() {
    if (!this.pauseItems) return;
    this.pauseItems.forEach((o) => o.destroy());
    this.pauseItems = null;
  }

  onChallengeFailed(reason) {
    if (this.failed || this.solved) return;
    this.failed = true;
    this.paused = false;
    this.clearPauseUI();
    this.hideBookTooltip();
    this.hideActionTooltip();
    this.closeActionMenu();
    this.dragging = null;
    this.refreshUndoButton();
    this.checkBtn?.setEnabled(false);
    this.pauseBtn?.setEnabled(false);
    this.showChallengeFailModal(reason);
  }

  showChallengeFailModal(reason) {
    const { width, height } = this.scale;
    const pw = 390;
    const ph = 230;
    const px = (width - pw) / 2;
    const py = (height - ph) / 2;

    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.62)
      .setOrigin(0)
      .setDepth(90)
      .setInteractive();

    const panel = this.add.graphics().setDepth(91);
    panel.fillStyle(COLORS.ink, 0.98);
    panel.fillRoundedRect(px, py, pw, ph, 14);
    panel.lineStyle(2, COLORS.bad, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 14);

    const title = this.add
      .text(width / 2, py + 38, I18n.t("challengeFailed"), {
        fontFamily: FONTS.title,
        fontSize: "28px",
        color: "#ffd5d5",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(92);

    const reasonText = reason === "time"
      ? I18n.t("challengeFailTime")
      : I18n.t("challengeFailMoves");
    const body = this.add
      .text(width / 2, py + 86, reasonText, {
        fontFamily: FONTS.body,
        fontSize: "15px",
        color: "#f3e3c3",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(92);

    const retryBtn = makeButton(
      this,
      width / 2,
      py + 146,
      I18n.t("retryLevel"),
      () => this.scene.restart({ level: this.levelNumber }),
      { width: 220, height: 50, fontSize: 20, fill: COLORS.good, textColor: "#ffffff" }
    ).setDepth(92);

    const menuBtn = makeButton(
      this,
      width / 2,
      py + 198,
      I18n.t("menu"),
      () => goToScene(this, "MenuScene"),
      { width: 180, height: 40, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    ).setDepth(92);

    this.failItems = [overlay, panel, title, body, retryBtn, menuBtn];
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

  buildFlipEdgeHints() {
    const { width } = this.scale;
    const midY = (AREA_TOP + AREA_BOTTOM) / 2;
    const hintW = RIGHT_GUTTER - 8;
    const hintH = AREA_BOTTOM - AREA_TOP + 16;

    const leftBg = this.add
      .rectangle(0, midY, hintW, hintH, COLORS.accent, 0.18)
      .setOrigin(0, 0.5)
      .setDepth(39)
      .setVisible(false);
    const leftArrow = this.add
      .text(18, midY, "‹", {
        fontFamily: FONTS.body,
        fontSize: "34px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);

    const rightBg = this.add
      .rectangle(width, midY, hintW, hintH, COLORS.accent, 0.18)
      .setOrigin(1, 0.5)
      .setDepth(39)
      .setVisible(false);
    const rightArrow = this.add
      .text(width - 18, midY, "›", {
        fontFamily: FONTS.body,
        fontSize: "34px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);

    this.flipEdgeHints = {
      left: { bg: leftBg, arrow: leftArrow },
      right: { bg: rightBg, arrow: rightArrow },
    };
  }

  updateFlipEdgeHints(dragX = null) {
    if (!this.flipEdgeHints) return;
    const { width } = this.scale;
    const dragging = !!this.dragging && this.pageCount > 1;
    const canLeft = dragging && this.currentPage > 0;
    const canRight = dragging && this.currentPage < this.pageCount - 1;
    const nearLeft = dragX != null && dragX < RIGHT_GUTTER;
    const nearRight = dragX != null && dragX > width - RIGHT_GUTTER;

    const setHint = (hint, visible, active) => {
      hint.bg.setVisible(visible);
      hint.arrow.setVisible(visible);
      if (!visible) return;
      hint.bg.setAlpha(active ? 0.32 : 0.16);
      hint.arrow.setAlpha(active ? 1 : 0.6);
      hint.arrow.setScale(active ? 1.08 : 1);
    };

    setHint(this.flipEdgeHints.left, canLeft, nearLeft);
    setHint(this.flipEdgeHints.right, canRight, nearRight);
  }

  hideFlipEdgeHints() {
    if (!this.flipEdgeHints) return;
    this.flipEdgeHints.left.bg.setVisible(false);
    this.flipEdgeHints.left.arrow.setVisible(false);
    this.flipEdgeHints.right.bg.setVisible(false);
    this.flipEdgeHints.right.arrow.setVisible(false);
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
    this.updateFlipEdgeHints(this.dragging ? this.dragging.x : null);
    if (!multi) return;

    this.pagerLabel.setText(
      I18n.t("pageIndicator", { page: this.currentPage + 1, total: this.pageCount })
    );
  }

  checkSolved(manual = false) {
    if (this.solved || this.failed) return;
    const result = this._evaluateAll();
    if (result.solved) {
      this.onSolved();
    } else if (manual) {
      this.flashFeedback(result.perSlot);
    }
  }

  /**
   * Resolve a display name for a rule reference (string, keys array or object).
   * Named string rules are localised via i18n; custom rules use their JSON
   * label (localised) or an auto-generated description from getRuleLabel().
   */
  ruleDisplayName(rule) {
    if (typeof rule === "string") {
      const translated = I18n.t(`rule_${rule}`);
      return translated.startsWith("rule_") ? getRuleLabel(rule) : translated;
    }
    if (rule && typeof rule === "object" && !Array.isArray(rule)) {
      const lbl = I18n.lang === "es"
        ? (rule.label_es || rule.label)
        : (rule.label || rule.label_es);
      if (lbl) return lbl;
    }
    return getRuleLabel(rule);
  }

  /** Evaluate every zone and return a combined {perSlot, solved} result. */
  _evaluateAll() {
    const perSlot = [];
    let solved = true;
    this.zoneRanges.forEach((range) => {
      const books = this.order.slice(range.start, range.end + 1).map((c) => c.getData("book"));
      const zr = evaluateOrder(books, range.rule);
      perSlot.push(...zr.perSlot);
      if (!zr.solved) solved = false;
    });
    return { perSlot, solved };
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

    // Toast for visible-page errors
    const hasCurrentPageErrors = this.order.some((c, i) =>
      !perSlot[i] && this.slots[i].page === this.currentPage
    );
    if (hasCurrentPageErrors) {
      this.showFeedbackToast(I18n.t("orderWrong"));
    }

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
    this.refreshUndoButton();
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

    const sceneData = {
      level: this.levelNumber,
      totalLevels: this.totalLevels,
      timeMs,
      moves: this.moves,
      score,
      isBest,
      autoUsed: this.autoUsed,
    };

    const doTransition = () => {
      if (this.solveTimer) {
        this.solveTimer.remove();
        this.solveTimer = null;
      }
      this.input.off("pointerdown", doTransition);
      goToScene(this, "LevelCompleteScene", sceneData);
    };

    this.solveTimer = this.time.delayedCall(900, doTransition);
    this.input.once("pointerdown", doTransition);
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
    this._sortAllZones();
    this.layoutBooks(false);
    this.showPage(0);
    this.checkSolved();
    return this.solved;
  }

  /** Sort books within each zone into their correct order (in-place on this.order). */
  _sortAllZones() {
    this.zoneRanges.forEach((range) => {
      const slice = this.order.slice(range.start, range.end + 1);
      const books = slice.map((c) => c.getData("book"));
      const { expected } = evaluateOrder(books, range.rule);
      const sorted = [...slice].sort(
        (a, b) => expected.indexOf(a.getData("book")) - expected.indexOf(b.getData("book"))
      );
      sorted.forEach((c, i) => { this.order[range.start + i] = c; });
    });
  }

  autoArrange() {
    if (!this.levelDef || this.solved || this.failed || this.autoArranging) return;
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
    this.refreshUndoButton();

    this._sortAllZones();

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
    if (this.timerStarted && !this.solved && !this.failed && !this.paused) {
      if (this.checkChallengeLimits()) return;
      const elapsed = this.time.now - this.startTime;
      this.timeText.setText(I18n.t("timeLabel", { time: formatTime(elapsed) }));
      this.updateChallengeDisplay();
    }
  }
}
