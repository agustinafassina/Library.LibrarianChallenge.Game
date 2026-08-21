import { getLevelWithBooks, getLevelCount } from "../utils/dataLoader.js";
import { getRuleLabel, resolveRule } from "../utils/rules.js";
import { Storage } from "../utils/storage.js";
import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, goToScene, isE2ETest, COLORS, FONTS, formatTime, panelBox, isCoarsePointer } from "../utils/ui.js";
import { getUiLayout } from "../config/layout.js";
import { BoardController } from "../game/BoardController.js";
import { Sfx } from "../utils/sfx.js";
import { fillLibraryRoom, drawShelfPlank, ensureBookSpineTexture, bookFaceSize } from "../utils/libraryArt.js";

const HINT_SCORE_PENALTY = 120;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  applyLayout() {
    this.ui = getUiLayout(this.scale.width, this.scale.height);
    this.areaTop = this.ui.areaTopBase;
    this.bookW = this.ui.bookWMax;
    this.bookH = this.ui.bookHMax;
  }

  init(data) {
    this.levelNumber = data.level ?? 1;
    this.resume = data.resume ?? null;
    this.order = [];
    this.slots = [];
    this.applyLayout();
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
    this.applyLayout();
    if (!this.resume) this.cameras.main.fadeIn(200, 0, 0, 0);
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
    this.showPage(this.resume?.page ?? 0);
    this.applyResumeState();
    this.bindResumeResize();
    this.maybeStartCoach();

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

    this.startTime = this.resume
      ? this.time.now - (this.resume.elapsed ?? 0)
      : this.time.now;
    this.timerStarted = true;
    this.updateChallengeDisplay();

    this.events.once("shutdown", () => this.cleanupSceneListeners());
  }

  captureResume() {
    if (!this.levelDef || !this.order?.length) return null;
    return {
      bookIds: this.order.map((c) => c.getData("book")?.id),
      moves: this.moves,
      elapsed: Math.max(0, this.time.now - this.startTime),
      page: this.currentPage,
      hintsUsed: this.hintsUsed,
      autoUsed: this.autoUsed,
      paused: this.paused,
    };
  }

  applyResumeState() {
    const r = this.resume;
    if (!r) return;
    this.moves = r.moves ?? 0;
    this.hintsUsed = r.hintsUsed ?? 0;
    this.autoUsed = !!r.autoUsed;
    this.movesText?.setText(I18n.t("movesLabel", { moves: this.moves }));
    this.updateTopBarLayout();
    this.refreshUndoButton();
    if (r.paused) {
      this.time.delayedCall(0, () => this.pauseGame());
    }
  }

  bindResumeResize() {
    let lastW = Math.round(this.scale.width);
    let lastH = Math.round(this.scale.height);
    this.handlers.onResize = (gameSize) => {
      const w = Math.round(gameSize.width);
      const h = Math.round(gameSize.height);
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
      window.clearTimeout(this.handlers.resizeTimer);
      this.handlers.resizeTimer = window.setTimeout(() => {
        if (!this.scene.isActive() || this.solved || this.failed || !this.order?.length) return;
        lastW = w;
        lastH = h;
        const resume = this.captureResume();
        this.scene.restart({
          level: this.levelNumber,
          resume,
        });
      }, 160);
    };
    this.scale.on("resize", this.handlers.onResize);
  }

  drawBackground() {
    fillLibraryRoom(this);
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
    const ui = this.ui;
    const compact = ui.compact;
    const stacked = ui.stackedHud;
    const rightPad = 12 + ui.safe.right;
    const menuW = stacked ? 72 : compact ? 98 : 116;
    const menuH = 40;
    const menuFont = stacked ? 13 : compact ? 14 : 16;
    const pauseW = compact || stacked ? 40 : 44;
    const pauseGap = 8;
    const titleY = Math.round(ui.safe.top + (stacked ? 22 : 28));

    const bar = this.add.graphics();
    bar.fillStyle(COLORS.ink, 0.92);
    bar.fillRect(0, 0, width, ui.topBarH);
    bar.setDepth(50);

    this.titleText = this.add
      .text(16, titleY, I18n.t("appTitle"), {
        fontFamily: FONTS.title,
        fontSize: stacked ? "16px" : compact ? "18px" : "22px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5)
      .setDepth(51);

    this.levelText = this.add
      .text(0, titleY, "", {
        fontFamily: FONTS.body,
        fontSize: stacked ? "13px" : compact ? "15px" : "18px",
        color: "#d9a441",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.movesText = this.add
      .text(0, titleY, I18n.t("movesLabel", { moves: 0 }), {
        fontFamily: FONTS.body,
        fontSize: stacked ? "13px" : compact ? "15px" : "18px",
        color: "#f3e3c3",
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.timeText = this.add
      .text(0, titleY, I18n.t("timeLabel", { time: "0:00" }), {
        fontFamily: FONTS.body,
        fontSize: stacked ? "13px" : compact ? "15px" : "18px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(51);

    const menuX = width - rightPad - menuW / 2;
    const pbx = menuX - menuW / 2 - pauseGap - pauseW / 2;
    this.headerMenuX = menuX;
    this.headerPauseW = pauseW;
    this.headerMenuW = menuW;

    this.pauseBtn = makeButton(
      this,
      pbx,
      titleY,
      "\u2016",
      () => this.togglePause(),
      {
        width: pauseW,
        height: menuH,
        fontSize: stacked ? 16 : compact ? 18 : 20,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
      }
    ).setDepth(51);
    this.pauseBtn.on("pointerover", () => {
      if (!isCoarsePointer()) this.showActionTooltip(pbx, titleY + 34, I18n.t("pause"));
    });
    this.pauseBtn.on("pointerdown", () => {
      if (isCoarsePointer()) this.showActionTooltip(pbx, titleY + 34, I18n.t("pause"), 1400);
    });
    this.pauseBtn.on("pointerout", () => {
      if (!isCoarsePointer()) this.hideActionTooltip();
    });

    this.menuBtn = makeButton(
      this,
      menuX,
      titleY,
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

  fitTextToLines(textObj, fullText, maxWidth, maxLines, baseSize, minSize = 11) {
    if (!textObj) return;
    const normalized = String(fullText ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      textObj.setText("");
      return;
    }

    const ellipsis = "\u2026";
    textObj.setAlign("center");
    textObj.setWordWrapWidth(maxWidth, true);

    const wrapped = (text, size) => {
      textObj.setFontSize(size);
      textObj.setText(text);
      return textObj.getWrappedText();
    };

    let size = baseSize;
    let lines = wrapped(normalized, size);
    while (size > minSize && lines.length > maxLines) {
      size -= 1;
      lines = wrapped(normalized, size);
    }
    if (lines.length <= maxLines) return;

    let lo = 1;
    let hi = normalized.length;
    let best = `${normalized.slice(0, 1)}${ellipsis}`;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const candidate = `${normalized.slice(0, mid).trimEnd()}${ellipsis}`;
      const candidateLines = wrapped(candidate, size);
      if (candidateLines.length <= maxLines) {
        best = candidate;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    wrapped(best, size);
  }

  updateTopBarLayout() {
    if (!this.titleText || !this.levelText || !this.movesText || !this.timeText) return;

    const { width } = this.scale;
    const ui = this.ui;
    const compact = ui.compact;
    const stacked = ui.stackedHud;
    const titleBase = stacked ? 16 : compact ? 18 : 22;
    const infoBase = stacked ? 13 : compact ? 15 : 18;
    const leftPad = 16 + ui.safe.left;
    const titleY = Math.round(ui.safe.top + (stacked ? 22 : 28));

    if (stacked) {
      const titleMaxW = Math.max(110, width - 24 - (this.headerMenuW ?? 72) - (this.headerPauseW ?? 40) - 20);
      this.titleText.setPosition(leftPad, titleY);
      this.fitTextToWidth(this.titleText, titleMaxW, titleBase, 11);

      const row2Y = Math.round(ui.safe.top + 58);
      const statsPad = 16;
      const statsW = width - statsPad * 2;
      const step = statsW / 3;
      this.fitTextToWidth(this.levelText, step - 8, infoBase, 10);
      this.fitTextToWidth(this.movesText, step - 8, infoBase, 10);
      this.fitTextToWidth(this.timeText, step - 8, infoBase, 10);
      this.levelText.setPosition(Math.round(statsPad + step * 0.5), row2Y);
      this.movesText.setPosition(Math.round(statsPad + step * 1.5), row2Y);
      this.timeText.setPosition(Math.round(statsPad + step * 2.5), row2Y);
      return;
    }

    const titleMaxW = compact ? 220 : 300;
    this.titleText.setPosition(leftPad, titleY);
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

    this.levelText.setPosition(x1, titleY);
    this.movesText.setPosition(x2, titleY);
    this.timeText.setPosition(x3, titleY);
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
    const rows = Math.max(1, Math.ceil(count / this.ui.maxPerRow));
    this.pageCount = Math.max(1, Math.ceil(rows / this.ui.maxRowsPerPage));
    const rowsOnScreen = Math.min(rows, this.ui.maxRowsPerPage);

    const regionLeft = this.ui.leftReserved;
    const regionRight = width - (this.pageCount > 1 ? this.ui.rightGutter : this.ui.rightMargin);
    const regionCenter = (regionLeft + regionRight) / 2;
    const availW = regionRight - regionLeft;
    const availH = this.ui.areaBottom - this.areaTop;

    const rowCounts = [];
    let remaining = count;
    for (let r = 0; r < rows; r++) {
      const n = Math.ceil(remaining / (rows - r));
      rowCounts.push(n);
      remaining -= n;
    }
    const widestRow = Math.max(...rowCounts);

    this.bookW = Phaser.Math.Clamp(
      (availW - (widestRow - 1) * this.ui.gapX) / widestRow,
      60, this.ui.bookWMax
    );
    const rawBookH = (availH - rowsOnScreen * this.ui.boardH - (rowsOnScreen - 1) * this.ui.gapY) / rowsOnScreen;
    // Cap height so a single-row level doesn't fill the whole vertical space.
    const maxBookHForRows = rowsOnScreen === 1 ? Math.min(rawBookH, this.bookW * 1.6)
      : rowsOnScreen === 2 ? Math.min(rawBookH, this.bookW * 1.8)
      : rawBookH;
    this.bookH = Phaser.Math.Clamp(maxBookHForRows, this.ui.portrait ? 64 : 78, this.ui.bookHMax);

    const rowStride = this.bookH + this.ui.boardH + this.ui.gapY;
    const totalH = rowsOnScreen * this.bookH + rowsOnScreen * this.ui.boardH + (rowsOnScreen - 1) * this.ui.gapY;
    const startY = this.areaTop + (availH - totalH) / 2;

    this.slots = [];
    this.rowRects = [];
    for (let r = 0; r < rows; r++) {
      const page = Math.floor(r / this.ui.maxRowsPerPage);
      const screenRow = r % this.ui.maxRowsPerPage;
      const cnt = rowCounts[r];
      const rowW = cnt * this.bookW + (cnt - 1) * this.ui.gapX;
      const startX = regionCenter - rowW / 2 + this.bookW / 2;
      const centerY = startY + this.bookH / 2 + screenRow * rowStride;
      for (let c = 0; c < cnt; c++) {
        this.slots.push({
          x: Math.round(startX + c * (this.bookW + this.ui.gapX)),
          y: Math.round(centerY),
          page,
          zoneIdx: 0,
        });
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
    this.celebrateY = (this.areaTop + this.ui.areaBottom) / 2;
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
      const rows = Math.max(1, Math.ceil(count / this.ui.maxPerRow));
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

    const regionLeft = this.ui.leftReserved;
    const regionRight = width - this.ui.rightMargin;
    const regionCenter = (regionLeft + regionRight) / 2;
    const availW = regionRight - regionLeft;

    // Height reserved for zone labels and separators
    const labelsH = numZones * ZONE_LABEL_H + (numZones - 1) * ZONE_SEP;
    const availH = this.ui.areaBottom - this.areaTop - labelsH;

    this.bookW = Phaser.Math.Clamp(
      (availW - (maxWidestRow - 1) * this.ui.gapX) / maxWidestRow,
      60, this.ui.bookWMax
    );
    this.bookH = Phaser.Math.Clamp(
      (availH - totalRows * this.ui.boardH - (totalRows - 1) * this.ui.gapY) / totalRows,
      this.ui.portrait ? 64 : 78, this.ui.bookHMax
    );

    const rowStride = this.bookH + this.ui.boardH + this.ui.gapY;

    let currentY = this.areaTop;
    let slotStart = 0;

    zones.forEach((zone, zi) => {
      const meta = zoneMetas[zi];

      // Record the Y position of this zone's label area
      this.zoneTopYMap.set(zi, currentY);
      currentY += ZONE_LABEL_H;

      // Lay out rows for this zone
      for (let r = 0; r < meta.rows; r++) {
        const cnt = meta.rowCounts[r];
        const rowW = cnt * this.bookW + (cnt - 1) * this.ui.gapX;
        const startX = regionCenter - rowW / 2 + this.bookW / 2;
        const centerY = currentY + this.bookH / 2;

        for (let c = 0; c < cnt; c++) {
          this.slots.push({
            x: Math.round(startX + c * (this.bookW + this.ui.gapX)),
            y: Math.round(centerY),
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

    this.celebrateY = (this.areaTop + this.ui.areaBottom) / 2;
  }

  buildShelf() {
    const zones = this.levelDef.zones;
    this.computeLayout(zones);

    this.shelfGraphics = [];
    this.rowRects.forEach((rect) => {
      const g = this.add.graphics();
      drawShelfPlank(g, rect.x, rect.y, rect.w, this.ui.boardH);
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
          sepG.lineBetween(this.ui.leftReserved, labelY - 8, this.scale.width - this.ui.rightMargin, labelY - 8);
          this.zoneLabelObjects.push(sepG);
        }

        const lbl = this.add
          .text(this.ui.leftReserved + 8, labelY + 13, displayText, {
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

    const initialBooks = this.restoreBookOrder(
      this.board.createInitialOrder(zones),
      this.resume?.bookIds
    );
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

  restoreBookOrder(books, ids) {
    if (!Array.isArray(ids) || ids.length !== books.length) return books;
    const remaining = [...books];
    const out = [];
    for (const id of ids) {
      const idx = remaining.findIndex((b) => b.id === id);
      if (idx < 0) return books;
      out.push(remaining.splice(idx, 1)[0]);
    }
    return out.length === books.length ? out : books;
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

  ensureBookTexture(book, w, h, extras) {
    const key = ensureBookSpineTexture(this, book, w, h, extras);
    this.bookTextureCache.set(key, true);
    return key;
  }

  createBookCard(book, slot, primaryAttr = null) {
    const w = this.bookW;
    const h = this.bookH;
    const face = bookFaceSize(book, w, h);

    let subtitle;
    if (primaryAttr === "pages") {
      subtitle = I18n.t("pagesCount", { n: book.pages });
    } else if (primaryAttr === "size") {
      subtitle = this.sizeWord(book.size);
    } else if (primaryAttr === "year") {
      subtitle = String(book.year);
    } else if (primaryAttr === "genre") {
      subtitle = book.genre;
    } else {
      subtitle = book.author;
    }

    const coverTex = this.ensureBookTexture(book, face.w, face.h, {
      title: book.title,
      subtitle,
    });
    const spine = this.add
      .image(0, Math.round(h / 2), coverTex)
      .setOrigin(0.5, 1)
      .setDisplaySize(face.w, face.h);

    const container = this.add.container(slot.x, slot.y, [spine]);
    container.setSize(w, h);
    container.setData("book", book);
    container.setData("compact", face.h < h * 0.92);
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
    const ty = Math.max(this.areaTop + th + 4, container.y - h / 2 - 6);

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
      c.on("pointerover", () => {
        if (!isCoarsePointer()) this.showBookTooltip(c);
      });
      c.on("pointerout", () => {
        if (!isCoarsePointer()) this.hideBookTooltip();
      });
      c.on("pointerdown", () => {
        this.cancelBookTooltipHold();
        this.bookTooltipHold = this.time.delayedCall(420, () => {
          if (this.dragging || this.solved) return;
          this.showBookTooltip(c);
          this.bookTooltipHoldHide = this.time.delayedCall(2500, () => this.hideBookTooltip());
        });
      });
      c.on("pointerup", () => {
        this.bookTooltipHold?.remove(false);
        this.bookTooltipHold = null;
      });
    });

    this.handlers.onDragStart = (_p, obj) => {
      if (this.solved || this.failed || this.autoArranging || this.paused) return;
      this.cancelBookTooltipHold();
      this.hideBookTooltip();
      this.dragging = obj;
      obj.setDepth(20);
      this.tweens.add({ targets: obj, scale: 1.06, duration: 100 });
      const fromIndex = this.order.indexOf(obj);
      this.showDropTarget(fromIndex);
      this.updateFlipEdgeHints(obj.x);
      this.maybeFlipPage(obj.x, obj.y);
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
      this.maybeFlipPage(dragX, dragY);
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

    this.scale.off("resize", this.handlers.onResize);
    window.clearTimeout(this.handlers.resizeTimer);
    this.cancelBookTooltipHold();
    this.hideBookTooltip();
    this.hideActionTooltip();
    this.clearCoach();

    this.handlers = {};
  }

  cancelBookTooltipHold() {
    this.bookTooltipHold?.remove(false);
    this.bookTooltipHold = null;
    this.bookTooltipHoldHide?.remove(false);
    this.bookTooltipHoldHide = null;
  }

  maybeFlipPage(dragX, dragY = null) {
    if (this.pageCount <= 1) return;
    const { width } = this.scale;
    const gutter = this.ui.flipGutter ?? this.ui.rightGutter;
    if (this.time.now < this.flipCooldown) return;
    if (dragY != null && (dragY < this.areaTop || dragY > this.ui.areaBottom)) return;
    const dwell = this.ui.portrait ? 380 : 450;
    if (dragX > width - gutter && this.currentPage < this.pageCount - 1) {
      this.flipCooldown = this.time.now + dwell;
      this.goToPage(this.currentPage + 1);
    } else if (dragX < gutter && this.currentPage > 0) {
      this.flipCooldown = this.time.now + dwell;
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
      Sfx.drop();
      this.moves++;
      this.movesText.setText(I18n.t("movesLabel", { moves: this.moves }));
      this.updateTopBarLayout();
      this.refreshUndoButton();
    }
    this.layoutBooks(true);
    if (moved) {
      this.advanceCoachFrom("drag");
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
    this.reactLibrarian("hint");
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
    const bx = Math.round(width / 2);
    const by = Math.round(this.ui.instructionY);
    const wrapW = Math.round(this.ui.instructionWrap);
    const textRes = Math.min(window.devicePixelRatio || 1, 2);
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
          fontSize: this.ui.compact ? "16px" : "18px",
          color: "#d9a441",
          fontStyle: "bold",
          align: "center",
          wordWrap: { width: wrapW },
        })
        .setOrigin(0.5, 0)
        .setResolution(textRes);

      bottomOfInstruction = Math.round(by + ruleObj.height + 6);

      if (detail) {
        const detailObj = this.add
          .text(bx, bottomOfInstruction, detail, {
            fontFamily: FONTS.body,
            fontSize: "15px",
            color: "#f3e3c3",
            align: "center",
            wordWrap: { width: wrapW },
            lineSpacing: 3,
          })
          .setOrigin(0.5, 0)
          .setResolution(textRes);
        bottomOfInstruction = Math.round(bottomOfInstruction + detailObj.height + 6);
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
          wordWrap: { width: wrapW },
          lineSpacing: 3,
        })
        .setOrigin(0.5, 0)
        .setResolution(textRes);
      bottomOfInstruction = Math.round(by + hintObj.height + 6);
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
          wordWrap: { width: this.ui.challengeWrap },
        })
        .setOrigin(0.5, 0)
        .setDepth(52);
      this.refreshChallengeBadge();
      bottomOfInstruction = challengeY + this.challengeText.height + 16;
    } else {
      this.challengeText = null;
      this.challengeBadgeBg = null;
    }

    // Adjust this.areaTop dynamically so the grid never overlaps the instructions
    this.areaTop = Math.max(this.ui.areaTopBase, bottomOfInstruction + 10);
  }

  buildLibrarian() {
    const { height } = this.scale;
    const portrait = this.ui.portrait;
    const scale = this.ui.librarianScale || 0.48;
    this.librarianBaseScale = scale;
    const displayW = 240 * scale;
    const x = portrait
      ? Math.round(Math.max(this.ui.safe.left, 4) + displayW * 0.32)
      : Math.round(Math.max(this.ui.safe.left, 8) + displayW * 0.42);
    const y = portrait
      ? height - this.ui.bottomBarH + 8
      : height - Math.max(this.ui.safe.bottom, 10);
    this.librarian = this.add
      .sprite(x, y, "librarian", "thinking")
      .setScale(scale)
      .setOrigin(0.5, 1)
      .setDepth(portrait ? 8 : 5);
    this.librarian.play("librarian-thinking");
    this.librarianHomeX = x;
    this.librarianHomeY = y;

    this.tweens.add({
      targets: this.librarian,
      y: y - 6,
      angle: 1.2,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  reactLibrarian(kind) {
    if (!this.librarian) return;
    if (kind === "happy") {
      this.librarian.play("librarian-happy");
      return;
    }
    this.librarian.play("librarian-thinking");
    if (kind === "wrong") {
      this.tweens.add({
        targets: this.librarian,
        x: this.librarianHomeX + 6,
        duration: 45,
        yoyo: true,
        repeat: 4,
        onComplete: () => {
          if (this.librarian) this.librarian.x = this.librarianHomeX;
        },
      });
      return;
    }
    if (kind === "hint") {
      const base = this.librarianBaseScale || this.librarian.scale;
      this.tweens.add({
        targets: this.librarian,
        scale: base * 1.08,
        duration: 140,
        yoyo: true,
        onComplete: () => {
          if (this.librarian) this.librarian.setScale(base);
        },
      });
    }
  }

  maybeStartCoach() {
    if (this.resume || this.levelNumber !== 1 || isE2ETest()) return;
    if (Storage.hasSeenCoach()) return;
    if (!this.order?.length || !this.checkBtn) return;
    this.coachStep = 0;
    this.showCoachStep();
  }

  showCoachStep() {
    this.clearCoach(false);
    const { width, height } = this.scale;
    const steps = [
      {
        text: I18n.t("coachDrag"),
        x: this.order[0]?.x ?? width / 2,
        y: (this.order[0]?.y ?? height * 0.4) - this.bookH / 2 - 16,
        w: this.bookW + 10,
        h: this.bookH + 10,
      },
      {
        text: I18n.t("coachCheck"),
        x: this.checkBtn.x,
        y: this.checkBtn.y - (this.ui.portrait ? 52 : 48),
        w: 64,
        h: 52,
        ringX: this.checkBtn.x,
        ringY: this.checkBtn.y,
      },
    ];
    const step = steps[this.coachStep];
    if (!step) {
      this.finishCoach();
      return;
    }

    const ringX = step.ringX ?? step.x;
    const ringY = step.ringY ?? (this.order[0]?.y ?? step.y);
    const ring = this.add.graphics().setDepth(78);
    ring.lineStyle(3, COLORS.accent, 0.95);
    ring.strokeRoundedRect(ringX - step.w / 2, ringY - step.h / 2, step.w, step.h, 10);
    this.tweens.add({
      targets: ring,
      alpha: 0.25,
      duration: 520,
      yoyo: true,
      repeat: -1,
    });

    const bubbleY = Phaser.Math.Clamp(step.y, 70, height - (this.ui.portrait ? this.ui.bottomBarH + 70 : 80));
    const txt = this.add
      .text(0, 0, step.text, {
        fontFamily: FONTS.body,
        fontSize: this.ui.portrait ? "15px" : "16px",
        color: "#f3e3c3",
        align: "center",
        wordWrap: { width: Math.min(280, width - 48) },
      })
      .setOrigin(0.5)
      .setDepth(81);
    const padX = 16;
    const padY = 12;
    const skipH = 34;
    const bw = Math.min(width - 32, Math.max(txt.width + padX * 2, 168));
    const bh = txt.height + padY * 2 + skipH + 8;
    const bx = Phaser.Math.Clamp(step.x, bw / 2 + 12, width - bw / 2 - 12);
    const by = bubbleY - bh / 2;

    const bg = this.add.graphics().setDepth(80);
    bg.fillStyle(COLORS.ink, 0.94);
    bg.fillRoundedRect(bx - bw / 2, by, bw, bh, 12);
    bg.lineStyle(2, COLORS.accent, 0.9);
    bg.strokeRoundedRect(bx - bw / 2, by, bw, bh, 12);
    txt.setPosition(bx, by + padY + txt.height / 2);

    const skip = makeButton(
      this,
      bx,
      by + bh - skipH / 2 - 8,
      I18n.t("coachSkip"),
      () => this.advanceCoach(),
      { width: Math.min(132, bw - 24), height: 32, fontSize: 14, fill: COLORS.accent, textColor: "#2c1d14" }
    ).setDepth(82);

    this.coachItems = [ring, bg, txt, skip];
    this.coachTimer = this.time.delayedCall(5600, () => this.advanceCoach());
  }

  advanceCoachFrom(kind) {
    if (this.coachStep == null) return;
    if (kind === "drag" && this.coachStep === 0) this.advanceCoach();
    if (kind === "check") this.finishCoach();
  }

  advanceCoach() {
    if (this.coachStep == null) return;
    this.coachStep += 1;
    if (this.coachStep >= 2) this.finishCoach();
    else this.showCoachStep();
  }

  finishCoach() {
    if (this.coachStep == null && !this.coachItems) return;
    Storage.markCoachSeen();
    this.clearCoach(true);
  }

  clearCoach(done = false) {
    this.coachTimer?.remove(false);
    this.coachTimer = null;
    this.coachItems?.forEach((item) => item?.destroy?.());
    this.coachItems = null;
    if (done) this.coachStep = null;
  }

  buildControls() {
    const { width, height } = this.scale;
    const portrait = this.ui.portrait;
    let bx;
    let by;
    let gap = 56;
    const btnW = portrait ? 56 : 64;
    const btnH = portrait ? 48 : 44;

    if (portrait) {
      const bar = this.add.graphics().setDepth(50);
      bar.fillStyle(COLORS.ink, 0.92);
      bar.fillRect(0, height - this.ui.bottomBarH, width, this.ui.bottomBarH);
      const span = Math.min(width - 24, 360);
      const start = width / 2 - span / 2;
      const step = span / 3;
      by = Math.round(height - this.ui.bottomBarH / 2 - this.ui.safe.bottom * 0.15);
      bx = Math.round(start + step * 0.5);
      this.undoX = Math.round(start + step * 1.5);
      this.hintX = Math.round(start + step * 2.5);
      gap = 0;
    } else {
      bx = this.headerMenuX ?? (width - 70);
      by = this.ui.topBarH + 40;
      this.undoX = bx;
      this.hintX = bx;
    }

    this.checkBtn = makeButton(
      this,
      bx,
      by,
      "\u2713",
      () => this.checkSolved(true),
      { width: btnW, height: btnH, fontSize: 26, fill: COLORS.good, textColor: "#ffffff" }
    ).setDepth(51);
    this.checkBtn.on("pointerover", () => {
      if (!isCoarsePointer()) this.showActionTooltip(bx, portrait ? by - 40 : by + 40, I18n.t("checkOrder"));
    });
    this.checkBtn.on("pointerdown", () => {
      if (isCoarsePointer()) this.showActionTooltip(bx, portrait ? by - 40 : by + 40, I18n.t("checkOrder"), 1400);
    });
    this.checkBtn.on("pointerout", () => {
      if (!isCoarsePointer()) this.hideActionTooltip();
    });

    const uy = portrait ? by : by + gap;
    this.undoBtn = makeButton(
      this,
      this.undoX,
      uy,
      "\u21B6",
      () => this.undoMove(),
      { width: btnW, height: btnH, fontSize: 24, fill: COLORS.woodLight, textColor: "#f3e3c3", enabled: false }
    ).setDepth(51);
    this.undoBtn.on("pointerover", () => {
      if (!isCoarsePointer()) this.showActionTooltip(this.undoX, portrait ? uy - 40 : uy + 40, I18n.t("undo"));
    });
    this.undoBtn.on("pointerdown", () => {
      if (isCoarsePointer()) this.showActionTooltip(this.undoX, portrait ? uy - 40 : uy + 40, I18n.t("undo"), 1400);
    });
    this.undoBtn.on("pointerout", () => {
      if (!isCoarsePointer()) this.hideActionTooltip();
    });

    const hy = portrait ? by : uy + gap;
    this.hintBtn = makeButton(
      this,
      this.hintX,
      hy,
      "?",
      () => this.giveHint(),
      { width: btnW, height: btnH, fontSize: 24, fill: COLORS.accent, textColor: "#2c1d14" }
    ).setDepth(51);
    this.hintBtn.on("pointerover", () => {
      if (!isCoarsePointer()) {
        this.showActionTooltip(
          this.hintX,
          portrait ? hy - 40 : hy + 40,
          I18n.t("hintTooltip", { points: HINT_SCORE_PENALTY })
        );
      }
    });
    this.hintBtn.on("pointerdown", () => {
      if (isCoarsePointer()) {
        this.showActionTooltip(
          this.hintX,
          portrait ? hy - 40 : hy + 40,
          I18n.t("hintTooltip", { points: HINT_SCORE_PENALTY }),
          1600
        );
      }
    });
    this.hintBtn.on("pointerout", () => {
      if (!isCoarsePointer()) this.hideActionTooltip();
    });

    this.actionMenuItems = [];
    this.actionMenuOpen = false;
    this.refreshHintButton();
  }

  showActionTooltip(x, y, label, autoHideMs = 0) {
    this.hideActionTooltip();
    const { width } = this.scale;
    const txt = this.add
      .text(0, 0, label, {
        fontFamily: FONTS.body,
        fontSize: "14px",
        color: "#f3e3c3",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width - 24 },
      })
      .setOrigin(0.5)
      .setDepth(71);

    const padX = 10;
    const padY = 6;
    const bw = txt.width + padX * 2;
    const bh = txt.height + padY * 2;
    const tx = Phaser.Math.Clamp(x, bw / 2 + 8, width - bw / 2 - 8);
    const bg = this.add.graphics().setDepth(70);
    bg.fillStyle(COLORS.ink, 0.95);
    bg.fillRoundedRect(tx - bw / 2, y - bh / 2, bw, bh, 6);
    bg.lineStyle(1, COLORS.accent, 0.8);
    bg.strokeRoundedRect(tx - bw / 2, y - bh / 2, bw, bh, 6);
    txt.setPosition(tx, y);

    this.actionTooltip = { bg, txt };
    if (autoHideMs > 0) {
      this.actionTooltipHide = this.time.delayedCall(autoHideMs, () => this.hideActionTooltip());
    }
  }

  hideActionTooltip() {
    this.actionTooltipHide?.remove(false);
    this.actionTooltipHide = null;
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
    const menuX = width - 12 - itemW / 2 - this.ui.safe.right;
    const baseY = this.ui.topBarH + 8 + itemH / 2;

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
    const stack = width < 500;
    const langs = I18n.available;
    const { pw, ph, px, py } = panelBox(width, height, 380, stack ? 140 + langs.length * 58 + 52 : 200);

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

    const totalW = langs.length * 150 + (langs.length - 1) * 16;
    const startX = width / 2 - totalW / 2 + 75;

    langs.forEach((lang, i) => {
      const isCurrent = lang.code === I18n.lang;
      const btnX = stack ? width / 2 : startX + i * 166;
      const btnY = stack ? py + 86 + i * 58 : py + 98;
      const btn = makeButton(
        this,
        btnX,
        btnY,
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
          width: Math.min(150, pw - 48), height: 46, fontSize: 17,
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
    this.refreshHintButton();
    this.hideBookTooltip();
    this.hideActionTooltip();
    this.closeActionMenu?.();

    const { width, height } = this.scale;
    const { pw, ph, px, py } = panelBox(width, height, 360, 300);

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
      { width: Math.min(220, pw - 48), height: 52, fontSize: 20, fill: COLORS.good, textColor: "#ffffff" }
    ).setDepth(82);

    const restartBtn = makeButton(this, width / 2, py + 200, I18n.t("restartLevel"),
      () => { this.clearPauseUI(); this.scene.restart({ level: this.levelNumber }); },
      { width: Math.min(200, pw - 48), height: 44, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    ).setDepth(82);

    const menuBtn = makeButton(this, width / 2, py + 252, I18n.t("menu"),
      () => { this.clearPauseUI(); goToScene(this, "MenuScene"); },
      { width: Math.min(200, pw - 48), height: 44, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    ).setDepth(82);

    this.pauseItems.push(resumeBtn, restartBtn, menuBtn);

    overlay.on("pointerdown", () => this.resumeGame());
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
    this.refreshHintButton();
    this.showChallengeFailModal(reason);
  }

  showChallengeFailModal(reason) {
    const { width, height } = this.scale;
    const { pw, ph, px, py } = panelBox(width, height, 390, 230);

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
    const midY = (this.areaTop + this.ui.areaBottom) / 2;
    const pagerY = this.ui.portrait ? this.ui.areaBottom - 14 : this.ui.areaBottom + 8;

    if (this.ui.sidePager) {
      this.sidePrev = makeButton(
        this,
        28,
        midY,
        "\u2039",
        () => this.goToPage(this.currentPage - 1),
        { width: 44, height: 96, fontSize: 40, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      ).setDepth(40);

      this.sideNext = makeButton(
        this,
        width - 28,
        midY,
        "\u203a",
        () => this.goToPage(this.currentPage + 1),
        { width: 44, height: 96, fontSize: 40, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      ).setDepth(40);
    } else {
      this.sidePrev = makeButton(
        this,
        width / 2 - 88,
        pagerY - 12,
        "\u2039",
        () => this.goToPage(this.currentPage - 1),
        { width: 40, height: 36, fontSize: 22, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      ).setDepth(40);

      this.sideNext = makeButton(
        this,
        width / 2 + 88,
        pagerY - 12,
        "\u203a",
        () => this.goToPage(this.currentPage + 1),
        { width: 40, height: 36, fontSize: 22, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      ).setDepth(40);
    }

    this.pagerLabel = this.add
      .text(width / 2, pagerY, "", {
        fontFamily: FONTS.body,
        fontSize: "13px",
        color: "#c9b08a",
        align: "center",
      })
      .setOrigin(0.5, this.ui.portrait ? 1 : 0)
      .setDepth(40);
  }

  buildFlipEdgeHints() {
    const { width } = this.scale;
    const midY = (this.areaTop + this.ui.areaBottom) / 2;
    const hintW = Math.max(28, (this.ui.flipGutter ?? this.ui.rightGutter) - 8);
    const hintH = this.ui.areaBottom - this.areaTop + 16;

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
    const gutter = this.ui.flipGutter ?? this.ui.rightGutter;
    const nearLeft = dragX != null && dragX < gutter;
    const nearRight = dragX != null && dragX > width - gutter;

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
      this.advanceCoachFrom("check");
      this.reactLibrarian("wrong");
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
    const toastY = this.ui.areaBottom - 12;

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
    this.reactLibrarian("happy");
    this.finishCoach();
    Sfx.win();
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

    if (isE2ETest()) {
      goToScene(this, "LevelCompleteScene", sceneData);
      return;
    }

    if (this.librarian) {
      this.tweens.add({
        targets: this.librarian,
        y: this.librarian.y - 40,
        duration: 220,
        yoyo: true,
        repeat: 2,
        ease: "Quad.out",
      });
    }

    this.celebrate();

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
    const { width, height } = this.scale;
    const { pw, ph, px, py } = panelBox(width, height, 400, 210);

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
      px + pw * 0.28, py + ph - 42, Math.min(140, pw * 0.42), 38,
      I18n.t("cancel") ?? "Cancel",
      0x5a3e28, "#f3e3c3", 52,
      closeAll
    );

    const confirmBtn = this.makeDialogButton(
      px + pw * 0.72, py + ph - 42, Math.min(160, pw * 0.42), 38,
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
