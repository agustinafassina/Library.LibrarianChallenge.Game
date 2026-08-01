import { getLevelWithBooks, getLevelCount } from "../utils/dataLoader.js";
import { getRuleLabel, resolveRule } from "../utils/rules.js";
import { Storage } from "../utils/storage.js";
import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, goToScene, COLORS, FONTS, formatTime } from "../utils/ui.js";
import { openDomOverlay, closeDomOverlay, escapeHtml } from "../utils/domOverlay.js";
import { GAME_LAYOUT } from "../config/layout.js";
import { BoardController } from "../game/BoardController.js";

const HINT_SCORE_PENALTY = 120;
const BOOK_W_MAX = GAME_LAYOUT.bookWMax;
const BOOK_H_MAX = GAME_LAYOUT.bookHMax;
const GAP_X = GAME_LAYOUT.gapX;
const GAP_Y = GAME_LAYOUT.gapY;
const BOARD_H = GAME_LAYOUT.boardH;
const MAX_PER_ROW = GAME_LAYOUT.maxPerRow;
const MAX_ROWS_PER_PAGE = GAME_LAYOUT.maxRowsPerPage;
let AREA_TOP = GAME_LAYOUT.areaTopBase;
const AREA_BOTTOM = GAME_LAYOUT.areaBottom;
const LEFT_RESERVED = GAME_LAYOUT.leftReserved;
const RIGHT_MARGIN = GAME_LAYOUT.rightMargin;
const RIGHT_GUTTER = GAME_LAYOUT.rightGutter;

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
    this.board = new BoardController();
    this.hintsUsed = 0;
    this.failed = false;
    this.challenge = null;
    this.challengeText = null;
    this.challengeBadgeBg = null;
    this.failItems = null;
    this.dropTargetIndex = -1;
    this.bookTextureCache = new Map();
    this.handlers = {};
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
      goToScene(this, "ErrorScene", {
        title: I18n.t("errorTitle"),
        messageKey: "levelDataError",
        details: err?.message || String(err),
        retryScene: "GameScene",
        retryData: { level: this.levelNumber },
      });
      return;
    }
    if (!level) {
      goToScene(this, "ErrorScene", {
        title: I18n.t("errorTitle"),
        message: I18n.t("levelNotFound", { level: this.levelNumber }),
        retryScene: "LevelSelectScene",
      });
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

    this.handlers.onKeyR = () => this.resetLevel();
    this.handlers.onKeyP = () => this.togglePause();
    this.handlers.onKeyEsc = () => this.togglePause();
    this.handlers.onKeyZ = (e) => {
      if (e.ctrlKey || e.metaKey) this.undoMove();
    };
    this.input.keyboard.on("keydown-R", this.handlers.onKeyR);
    this.input.keyboard.on("keydown-P", this.handlers.onKeyP);
    this.input.keyboard.on("keydown-ESC", this.handlers.onKeyEsc);
    this.input.keyboard.on("keydown-Z", this.handlers.onKeyZ);

    this.startTime = this.time.now;
    this.timerStarted = true;
    this.updateChallengeDisplay();

    this.events.once("shutdown", () => this.cleanupSceneListeners());
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
    const compact = width < 920;
    const rightPad = 12;
    const menuW = compact ? 98 : 116;
    const menuH = 40;
    const menuFont = compact ? 14 : 16;
    const pauseW = compact ? 40 : 44;
    const pauseGap = 8;

    const bar = this.add.graphics();
    bar.fillStyle(COLORS.ink, 0.92);
    bar.fillRect(0, 0, width, 56);
    bar.setDepth(50);

    this.titleText = this.add
      .text(16, 28, I18n.t("appTitle"), {
        fontFamily: FONTS.title,
        fontSize: compact ? "18px" : "22px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5)
      .setDepth(51);

    this.levelText = this.add
      .text(0, 28, "", {
        fontFamily: FONTS.body,
        fontSize: compact ? "15px" : "18px",
        color: "#d9a441",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.movesText = this.add
      .text(0, 28, I18n.t("movesLabel", { moves: 0 }), {
        fontFamily: FONTS.body,
        fontSize: compact ? "15px" : "18px",
        color: "#f3e3c3",
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.timeText = this.add
      .text(0, 28, I18n.t("timeLabel", { time: "0:00" }), {
        fontFamily: FONTS.body,
        fontSize: compact ? "15px" : "18px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(51);

    const menuX = width - rightPad - menuW / 2;
    const pbx = menuX - menuW / 2 - pauseGap - pauseW / 2;
    this.headerMenuX = menuX;
    this.headerPauseW = pauseW;

    // Pause button — compact icon, left of Menu
    this.pauseBtn = makeButton(
      this,
      pbx,
      28,
      "\u2016",
      () => this.togglePause(),
      {
        width: pauseW,
        height: menuH,
        fontSize: compact ? 18 : 20,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
      }
    ).setDepth(51);
    this.pauseBtn.on("pointerover", () =>
      this.showActionTooltip(pbx, 62, I18n.t("pause"))
    );
    this.pauseBtn.on("pointerout", () => this.hideActionTooltip());

    // Menu button — opens the action menu, pinned to the right
    this.menuBtn = makeButton(
      this,
      menuX,
      28,
      I18n.t("menu"),
      () => this.toggleActionMenu(),
      {
        width: menuW,
        height: menuH,
        fontSize: menuFont,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
      }
    ).setDepth(51);

    this.updateTopBarLayout();
  }

  fitTextToWidth(textObj, maxWidth, baseSize, minSize = 11) {
    if (!textObj) return;
    textObj.setFontSize(baseSize);
    while (textObj.width > maxWidth && baseSize > minSize) {
      baseSize -= 1;
      textObj.setFontSize(baseSize);
    }
  }

  fitTextToBox(textObj, maxWidth, maxHeight, baseSize, minSize = 10) {
    if (!textObj) return;

    let fontSize = baseSize;
    textObj.setFontSize(fontSize);

    const fits = () => textObj.width <= maxWidth && textObj.height <= maxHeight;
    while (!fits() && fontSize > minSize) {
      fontSize -= 1;
      textObj.setFontSize(fontSize);
    }
  }

  truncateTextToWidth(textObj, fullText, maxWidth, baseSize, minSize = 10) {
    if (!textObj) return;

    const normalized = String(fullText ?? "").replace(/\s+/g, " ").trim();
    if (normalized.length === 0) { textObj.setText(""); return; }

    const ellipsis = "\u2026";

    // Helper: set text + font and return whether it fits.
    const tryAt = (text, size) => {
      textObj.setText(text);
      textObj.setFontSize(size);
      return textObj.width <= maxWidth;
    };

    // 1. Try full text at baseSize — if it fits, we're done.
    if (tryAt(normalized, baseSize)) return;

    // 2. Try full text at smaller sizes down to minSize.
    for (let sz = baseSize - 1; sz >= minSize; sz--) {
      if (tryAt(normalized, sz)) return;
    }

    // 3. Full text doesn't fit even at minSize — truncate with ellipsis.
    //    After finding the truncated string, scale font back up to max that fits.
    const words = normalized.split(" ");
    let truncated = null;

    outer: while (words.length > 1) {
      words.pop();
      const candidate = `${words.join(" ")}${ellipsis}`;
      for (let sz = baseSize; sz >= minSize; sz--) {
        if (tryAt(candidate, sz)) { truncated = { text: candidate, size: sz }; break outer; }
      }
    }

    if (!truncated) {
      // Last resort: trim char by char.
      let chars = normalized.length;
      while (chars > 1) {
        chars -= 1;
        const candidate = `${normalized.slice(0, chars).trimEnd()}${ellipsis}`;
        for (let sz = baseSize; sz >= minSize; sz--) {
          if (tryAt(candidate, sz)) { truncated = { text: candidate, size: sz }; break; }
        }
        if (truncated) break;
      }
    }

    if (truncated) {
      textObj.setText(truncated.text);
      textObj.setFontSize(truncated.size);
    } else {
      textObj.setText(ellipsis);
      textObj.setFontSize(minSize);
    }
  }

  updateTopBarLayout() {
    if (!this.titleText || !this.levelText || !this.movesText || !this.timeText) return;

    const { width } = this.scale;
    const compact = width < 920;
    const titleBase = compact ? 18 : 22;
    const infoBase = compact ? 15 : 18;

    const leftPad = 16;
    const titleMaxW = compact ? 220 : 300;
    this.titleText.setPosition(leftPad, 28);
    this.fitTextToWidth(this.titleText, titleMaxW, titleBase, compact ? 12 : 14);

    const titleRight = leftPad + this.titleText.width;
    const rightBound = this.pauseBtn
      ? this.pauseBtn.x - this.headerPauseW / 2 - 12
      : width - 180;
    const centerEnd = rightBound;
    let centerStart = Math.max(titleRight + 18, width * (compact ? 0.35 : 0.32));
    if (centerEnd - centerStart < 150) {
      centerStart = Math.max(titleRight + 10, centerEnd - 150);
    }

    const span = Math.max(180, centerEnd - centerStart);
    const step = span / 3;
    const cellW = step - 8;
    const x1 = centerStart + step * 0.5;
    const x2 = centerStart + step * 1.5;
    const x3 = centerStart + step * 2.5;

    this.fitTextToWidth(this.levelText, cellW, infoBase, 11);
    this.fitTextToWidth(this.movesText, cellW, infoBase, 11);
    this.fitTextToWidth(this.timeText, cellW, infoBase, 11);

    this.levelText.setPosition(x1, 28);
    this.movesText.setPosition(x2, 28);
    this.timeText.setPosition(x3, 28);
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
    const rawBookH = (availH - rowsOnScreen * BOARD_H - (rowsOnScreen - 1) * GAP_Y) / rowsOnScreen;
    // Cap height so a single-row level doesn't fill the whole vertical space.
    const maxBookHForRows = rowsOnScreen === 1 ? Math.min(rawBookH, this.bookW * 1.6)
      : rowsOnScreen === 2 ? Math.min(rawBookH, this.bookW * 1.8)
      : rawBookH;
    this.bookH = Phaser.Math.Clamp(maxBookHForRows, 78, BOOK_H_MAX);

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

    this.board.setStructure({
      slots: this.slots,
      zoneRanges: this.zoneRanges,
      pageCount: this.pageCount,
    });
    this.board.setCurrentPage(this.currentPage);
  }

  buildBooks() {
    const zones = this.levelDef.zones;
    this.order = [];

    const initialBooks = this.board.createInitialOrder(zones);
    initialBooks.forEach((book, i) => {
      const slot = this.slots[i];
      const zoneIdx = slot.zoneIdx ?? 0;
      const rule = this.zoneRanges[zoneIdx]?.rule;
      const primaryAttr = this.primaryAttrFor(rule);
      const card = this.createBookCard(book, slot, primaryAttr);
      card.setData("zoneIdx", zoneIdx);
      this.order.push(card);
    });

    this.board.setItems(this.order);

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

  getBookTextureKey(book, w, h) {
    return `book-${w}x${h}-${String(book.color).replace("#", "")}`;
  }

  ensureBookTexture(book, w, h) {
    const key = this.getBookTextureKey(book, w, h);
    if (this.bookTextureCache.has(key) || this.textures.exists(key)) {
      this.bookTextureCache.set(key, true);
      return key;
    }

    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const fill = Phaser.Display.Color.HexStringToColor(book.color).color;

    // Book body
    g.fillStyle(fill, 1);
    g.fillRoundedRect(0, 0, w, h, 7);

    // Binding strip
    const bindW = Math.max(5, Math.round(w * 0.1));
    g.fillStyle(0x000000, 0.2);
    g.fillRoundedRect(0, 0, bindW, h, { tl: 7, tr: 2, bl: 7, br: 2 });

    // Page edges
    const ex = w - 3;
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(ex - 1, 5, 2, h - 10);
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(ex - 4, 5, 2, h - 10);
    g.fillStyle(0xffffff, 0.1);
    g.fillRect(ex - 7, 5, 2, h - 10);

    // Inner frame
    g.lineStyle(1, 0xffffff, 0.22);
    g.strokeRoundedRect(bindW + 2, 3, w - bindW - 8, h - 6, 4);

    // Outer border
    g.lineStyle(1.5, 0x000000, 0.35);
    g.strokeRoundedRect(0, 0, w, h, 7);

    g.generateTexture(key, w, h);
    g.destroy();
    this.bookTextureCache.set(key, true);
    return key;
  }

  createBookCard(book, slot, primaryAttr = null) {
    const w = this.bookW;
    const h = this.bookH;

    const showAuthor = w >= 96 && h >= 96;
    const showGenre  = h >= 88;

    // Scale font generously with card size; allow larger text on big cards.
    const titleSize = Math.round(Phaser.Math.Clamp(Math.min(h * 0.13, w * 0.22), 13, 22));
    const metaSize  = Math.round(Phaser.Math.Clamp(Math.min(h * 0.12, w * 0.20), 12, 20));

    const coverTex = this.ensureBookTexture(book, Math.round(w), Math.round(h));
    const spine = this.add.image(0, 0, coverTex).setOrigin(0.5);
    const bindW = Math.max(5, Math.round(w * 0.1));
    const textA11y = {
      textColor: "#ffffff",
      strokeColor: "#000000",
      shadowColor: "#000000",
      bandFill: 0x000000,
      bandAlpha: 0.2,
    };

    const shadow = {
      offsetX: 0,
      offsetY: 1,
      color: textA11y.shadowColor,
      blur: 3,
      fill: true,
    };

    // Position title in the upper third of the card (not pinned to the very top).
    const titleY = -h * 0.28;
    const titleTxt = this.add
      .text(0, titleY, book.title, {
        fontFamily: FONTS.body,
        fontSize: `${titleSize}px`,
        color: textA11y.textColor,
        align: "center",
        fontStyle: "bold",
        stroke: textA11y.strokeColor,
        strokeThickness: 2,
        shadow,
      })
      .setOrigin(0.5, 0.5);

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
      metaStr = `${book.author} \u00b7 ${book.genre} \u00b7 ${book.year}`;
    } else if (showGenre) {
      metaStr = `${book.genre} \u00b7 ${book.year}`;
    } else {
      metaStr = `${book.year}`;
    }

    const metaY = h * 0.28;
    const metaTxt = this.add
      .text(0, metaY, metaStr, {
        fontFamily: FONTS.body,
        fontSize: `${yearOnly ? metaSize + 1 : metaSize}px`,
        fontStyle: "bold",
        color: textA11y.textColor,
        align: "center",
        stroke: textA11y.strokeColor,
        strokeThickness: 2,
        lineSpacing: 3,
        shadow,
      })
      .setOrigin(0.5, 0.5);

    const textMaxWidth = w - bindW - 14;
    this.truncateTextToWidth(titleTxt, book.title, textMaxWidth, titleSize, 12);
    this.truncateTextToWidth(metaTxt, metaStr, textMaxWidth, yearOnly ? metaSize + 1 : metaSize, 11);

    // Translucent bands behind each text block for contrast.
    const bandW = w - bindW - 8;
    const bandX = -w / 2 + bindW + 2;

    const titleBand = this.add.graphics();
    const titleBandH = titleTxt.height + 10;
    titleBand.fillStyle(textA11y.bandFill, textA11y.bandAlpha);
    titleBand.fillRoundedRect(bandX, titleY - titleBandH / 2, bandW, titleBandH, 4);

    const metaBand = this.add.graphics();
    const metaBandH = metaTxt.height + 10;
    metaBand.fillStyle(textA11y.bandFill, textA11y.bandAlpha);
    metaBand.fillRoundedRect(bandX, metaY - metaBandH / 2, bandW, metaBandH, 4);

    const container = this.add.container(slot.x, slot.y, [spine, titleBand, metaBand, titleTxt, metaTxt]);
    container.setSize(w, h);
    container.setData("book", book);
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

  showDropTarget(index) {
    if (index === this.dropTargetIndex) return;
    this.clearDropTarget();
    if (index < 0 || index >= this.slotGuides.length) return;

    const slot = this.slots[index];
    const guide = this.slotGuides[index];
    if (slot.page !== this.currentPage) return;

    guide.clear();
    guide.fillStyle(COLORS.good, 0.14);
    guide.fillRoundedRect(
      slot.x - this.bookW / 2,
      slot.y - this.bookH / 2,
      this.bookW,
      this.bookH,
      8
    );
    guide.lineStyle(3, COLORS.good, 0.95);
    guide.strokeRoundedRect(
      slot.x - this.bookW / 2,
      slot.y - this.bookH / 2,
      this.bookW,
      this.bookH,
      8
    );
    this.dropTargetIndex = index;
  }

  clearDropTarget() {
    if (this.dropTargetIndex < 0) return;
    const idx = this.dropTargetIndex;
    this.dropTargetIndex = -1;
    const slot = this.slots[idx];
    const guide = this.slotGuides[idx];
    if (!slot || !guide) return;
    guide.clear();
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
  }

  enableDragging() {
    this.activeTooltip = null;

    this.order.forEach((c) => {
      c.setInteractive({ useHandCursor: true, draggable: true });
      c.on("pointerover", () => this.showBookTooltip(c));
      c.on("pointerout",  () => this.hideBookTooltip());
    });

    this.handlers.onDragStart = (_p, obj) => {
      if (this.solved || this.failed || this.autoArranging || this.paused) return;
      this.hideBookTooltip();
      this.dragging = obj;
      obj.setDepth(20);
      this.tweens.add({ targets: obj, scale: 1.06, duration: 100 });
      const fromIndex = this.order.indexOf(obj);
      this.showDropTarget(fromIndex);
      this.updateFlipEdgeHints(obj.x);
    };
    this.input.on("dragstart", this.handlers.onDragStart);

    this.handlers.onDrag = (_p, obj, dragX, dragY) => {
      if (this.solved || this.failed || this.autoArranging || this.paused) return;
      obj.x = dragX;
      obj.y = dragY;
      const zoneIdx = obj.getData("zoneIdx");
      const multiZone = this.levelDef.zones.length > 1;
      const nearest = this.board.nearestSlot(dragX, dragY, multiZone ? zoneIdx : null);
      this.showDropTarget(nearest);
      this.updateFlipEdgeHints(dragX);
      this.maybeFlipPage(dragX);
    };
    this.input.on("drag", this.handlers.onDrag);

    this.handlers.onDragEnd = (_p, obj) => {
      if (this.solved || this.failed || this.autoArranging || this.paused) return;
      obj.setDepth(1);
      this.tweens.add({ targets: obj, scale: 1, duration: 100 });
      this.clearDropTarget();
      this.handleDrop(obj);
      this.dragging = null;
      this.hideFlipEdgeHints();
      this.showPage(this.currentPage);
    };
    this.input.on("dragend", this.handlers.onDragEnd);
  }

  cleanupSceneListeners() {
    this.input.off("dragstart", this.handlers.onDragStart);
    this.input.off("drag", this.handlers.onDrag);
    this.input.off("dragend", this.handlers.onDragEnd);

    this.input.keyboard.off("keydown-R", this.handlers.onKeyR);
    this.input.keyboard.off("keydown-P", this.handlers.onKeyP);
    this.input.keyboard.off("keydown-ESC", this.handlers.onKeyEsc);
    this.input.keyboard.off("keydown-Z", this.handlers.onKeyZ);

    this.handlers = {};
    closeDomOverlay();
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
    const nearest = this.board.nearestSlot(obj.x, obj.y, multiZone ? zoneIdx : null);

    let moved = false;
    if (this.board.dropAt(fromIndex, nearest)) {
      moved = true;
      this.moves++;
      this.movesText.setText(I18n.t("movesLabel", { moves: this.moves }));
      this.updateTopBarLayout();
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
    const move = this.board.undoLast();
    if (!move) return;
    const { fromIndex } = move;

    this.moves = Math.max(0, this.moves - 1);
    this.movesText.setText(I18n.t("movesLabel", { moves: this.moves }));
    this.updateTopBarLayout();
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
      this.board.hasUndo() && !this.solved && !this.failed && !this.autoArranging;
    this.undoBtn?.setEnabled(canUndo);
  }

  refreshHintButton() {
    const canHint = !this.solved && !this.failed && !this.autoArranging && !this.paused;
    this.hintBtn?.setEnabled(canHint);
  }

  giveHint() {
    if (this.solved || this.failed || this.autoArranging || this.paused) return;

    const targetIndex = this.board.pickHintTargetIndex((c) => c.getData("book"));
    if (targetIndex < 0) {
      this.showFeedbackToast(I18n.t("alreadySorted"));
      return;
    }

    const slot = this.slots[targetIndex];
    if (slot.page !== this.currentPage) {
      this.goToPage(slot.page);
    }

    const book = this.order[targetIndex];
    if (book) {
      book.setDepth(25);
      this.tweens.add({
        targets: book,
        scale: 1.14,
        angle: 4,
        duration: 140,
        yoyo: true,
        repeat: 2,
        onComplete: () => {
          book.setDepth(1);
          book.setScale(1);
          book.setAngle(0);
        },
      });
    }

    const guide = this.slotGuides[targetIndex];
    if (guide) {
      guide.clear();
      guide.fillStyle(COLORS.accent, 0.16);
      guide.fillRoundedRect(
        slot.x - this.bookW / 2,
        slot.y - this.bookH / 2,
        this.bookW,
        this.bookH,
        8
      );
      guide.lineStyle(3, COLORS.accent, 0.95);
      guide.strokeRoundedRect(
        slot.x - this.bookW / 2,
        slot.y - this.bookH / 2,
        this.bookW,
        this.bookH,
        8
      );
      this.time.delayedCall(850, () => this.restoreGuides());
    }

    this.hintsUsed++;
    this.showFeedbackToast(I18n.t("hintUsed", { points: HINT_SCORE_PENALTY }));
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
    this.updateTopBarLayout();

    const zones = this.levelDef.zones;
    const bx = width / 2;
    const by = 74;
    let bottomOfInstruction;

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
      .sprite(44, height - 28, "librarian", "thinking")
      .setScale(0.74)
      .setOrigin(0.5, 1)
      .setDepth(5);
    this.librarian.play("librarian-thinking");

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
    const bx = this.headerMenuX ?? (width - 70);
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

    // Hint — below Undo, highlights one wrong book with score penalty
    const hy = uy + 56;
    this.hintBtn = makeButton(
      this,
      bx,
      hy,
      "?",
      () => this.giveHint(),
      { width: 64, height: 44, fontSize: 24, fill: COLORS.accent, textColor: "#2c1d14" }
    ).setDepth(51);
    this.hintBtn.on("pointerover", () =>
      this.showActionTooltip(
        bx,
        hy + 40,
        I18n.t("hintTooltip", { points: HINT_SCORE_PENALTY })
      )
    );
    this.hintBtn.on("pointerout", () => this.hideActionTooltip());

    this.actionMenuItems = [];
    this.actionMenuOpen = false;
    this.refreshHintButton();
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
    openDomOverlay({
      scene: this,
      panelWidth: 380,
      buildPanel: (panel, close) => {
        const langButtons = I18n.available
          .map(
            (lang) =>
              `<button type="button" class="lc-btn ${lang.code === I18n.lang ? "is-active" : "lc-btn--wood"}" data-lang="${escapeHtml(lang.code)}">${escapeHtml(lang.label)}</button>`
          )
          .join("");

        panel.innerHTML = `
          <h2 class="lc-title">${escapeHtml(I18n.t("language"))}</h2>
          <div class="lc-actions lc-actions--wrap">${langButtons}</div>
          <div class="lc-actions">
            <button type="button" class="lc-btn lc-btn--wood">${escapeHtml(I18n.t("done"))}</button>
          </div>
        `;

        panel.querySelectorAll("[data-lang]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const code = btn.dataset.lang;
            if (code !== I18n.lang) {
              I18n.set(code);
              close();
              this.scene.restart({ level: this.levelNumber });
            } else {
              close();
            }
          });
        });

        panel.querySelector(".lc-actions:last-of-type button").addEventListener("click", close);
      },
    });
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
    this.refreshHintButton();
    this.hideBookTooltip();
    this.hideActionTooltip();
    this.closeActionMenu?.();

    const elapsed = this.pauseStart - this.startTime;
    const sub = `${I18n.t("timeLabel", { time: formatTime(elapsed) })} · ${I18n.t("movesLabel", { moves: this.moves })}`;

    openDomOverlay({
      scene: this,
      panelWidth: 360,
      closeOnBackdrop: true,
      onBackdropClick: () => this.resumeGame(),
      buildPanel: (panel, close) => {
        panel.innerHTML = `
          <h2 class="lc-title">${escapeHtml(I18n.t("paused"))}</h2>
          <p class="lc-body lc-body--center">${escapeHtml(sub)}</p>
          <div class="lc-actions" style="flex-direction: column; align-items: center; gap: 10px;">
            <button type="button" class="lc-btn lc-btn--good lc-btn--wide" data-action="resume">${escapeHtml(I18n.t("resume"))}</button>
            <button type="button" class="lc-btn lc-btn--wood lc-btn--wide" data-action="restart">${escapeHtml(I18n.t("restartLevel"))}</button>
            <button type="button" class="lc-btn lc-btn--wood lc-btn--wide" data-action="menu">${escapeHtml(I18n.t("menu"))}</button>
          </div>
        `;

        panel.querySelector('[data-action="resume"]').addEventListener("click", () => this.resumeGame());
        panel.querySelector('[data-action="restart"]').addEventListener("click", () => {
          this.clearPauseUI();
          this.scene.restart({ level: this.levelNumber });
        });
        panel.querySelector('[data-action="menu"]').addEventListener("click", () => {
          this.clearPauseUI();
          goToScene(this, "MenuScene");
        });
      },
    });
  }

  resumeGame() {
    if (!this.paused) return;
    // Shift startTime forward by the paused duration so the timer stays accurate
    this.startTime += this.time.now - this.pauseStart;
    this.paused = false;
    this.refreshHintButton();
    this.clearPauseUI();
  }

  clearPauseUI() {
    closeDomOverlay();
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
    this.refreshHintButton();
    this.showChallengeFailModal(reason);
  }

  showChallengeFailModal(reason) {
    const reasonText =
      reason === "time" ? I18n.t("challengeFailTime") : I18n.t("challengeFailMoves");

    openDomOverlay({
      scene: this,
      panelClass: "lc-panel--fail",
      panelWidth: 390,
      closeOnBackdrop: false,
      buildPanel: (panel) => {
        panel.innerHTML = `
          <h2 class="lc-title lc-title--danger">${escapeHtml(I18n.t("challengeFailed"))}</h2>
          <p class="lc-body lc-body--center">${escapeHtml(reasonText)}</p>
          <div class="lc-actions" style="flex-direction: column; align-items: center; gap: 10px;">
            <button type="button" class="lc-btn lc-btn--good lc-btn--wide">${escapeHtml(I18n.t("retryLevel"))}</button>
            <button type="button" class="lc-btn lc-btn--wood lc-btn--wide">${escapeHtml(I18n.t("menu"))}</button>
          </div>
        `;

        const [retryBtn, menuBtn] = panel.querySelectorAll("button");
        retryBtn.addEventListener("click", () => this.scene.restart({ level: this.levelNumber }));
        menuBtn.addEventListener("click", () => goToScene(this, "MenuScene"));
      },
    });
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
    this.board.setCurrentPage(this.currentPage);

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
    const result = this.board.evaluateAll((c) => c.getData("book"));
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
    this.refreshHintButton();
    this.librarian?.play("librarian-happy");
    const timeMs = this.time.now - this.startTime;
    const score = this.computeScore(timeMs, this.moves);
    const result = {
      score,
      timeMs,
      moves: this.moves,
    };

    Storage.unlockLevel(this.levelNumber + 1);
    const isBest = Storage.saveResult(this.levelNumber, result);
    Storage.recordLevelCompletion(this.levelNumber, result);

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
      hintsUsed: this.hintsUsed,
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
    const emitter = this.add
      .particles(width / 2, this.celebrateY, "spark", {
        speed: { min: -260, max: 260 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.9, end: 0 },
        lifespan: 900,
        gravityY: 420,
        quantity: 30,
        tint: [0xd9a441, 0x5bbf6a, 0xffffff, 0x4f86c6],
        emitting: false,
      })
      .setDepth(68);
    emitter.explode(40);
    // Explode is fire-and-forget; explicitly destroy the emitter to avoid leaks.
    this.time.delayedCall(1200, () => emitter.destroy());
  }

  computeScore(timeMs, moves) {
    const seconds = Math.floor(timeMs / 1000);
    const raw = 1000 - seconds * 4 - moves * 15;
    const hintPenalty = this.hintsUsed * HINT_SCORE_PENALTY;
    const base = Math.max(50, raw - hintPenalty);
    return this.autoUsed ? Math.min(100, base) : base;
  }

  resetLevel() {
    if (!this.levelDef) return;
    this.scene.restart({ level: this.levelNumber });
  }

  autosolve() {
    if (!this.levelDef || this.solved) return false;
    this.board.sortAllZones((c) => c.getData("book"));
    this.layoutBooks(false);
    this.showPage(0);
    this.checkSolved();
    return this.solved;
  }

  autoArrange() {
    if (!this.levelDef || this.solved || this.failed || this.autoArranging) return;
    this.showAutoConfirm();
  }

  showAutoConfirm() {
    openDomOverlay({
      scene: this,
      panelClass: "lc-panel--auto",
      panelWidth: 400,
      closeOnBackdrop: false,
      buildPanel: (panel, close) => {
        panel.innerHTML = `
          <h2 class="lc-title">${escapeHtml(I18n.t("autoConfirmTitle"))}</h2>
          <p class="lc-body lc-body--center">${escapeHtml(I18n.t("autoConfirmBody"))}</p>
          <div class="lc-actions">
            <button type="button" class="lc-btn lc-btn--wood">${escapeHtml(I18n.t("cancel"))}</button>
            <button type="button" class="lc-btn lc-btn--danger">${escapeHtml(I18n.t("autoConfirmYes"))}</button>
          </div>
        `;

        const [cancelBtn, confirmBtn] = panel.querySelectorAll("button");
        cancelBtn.addEventListener("click", close);
        confirmBtn.addEventListener("click", () => {
          close();
          this.runAutoArrange();
        });
      },
    });
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
    this.refreshHintButton();

    this.board.sortAllZones((c) => c.getData("book"));

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
      this.refreshHintButton();
      this.showPage(0);
      this.checkSolved();
    });
  }

  update() {
    if (this.timerStarted && !this.solved && !this.failed && !this.paused) {
      if (this.checkChallengeLimits()) return;
      const elapsed = this.time.now - this.startTime;
      this.timeText.setText(I18n.t("timeLabel", { time: formatTime(elapsed) }));
      this.updateTopBarLayout();
      this.updateChallengeDisplay();
    }
  }
}
