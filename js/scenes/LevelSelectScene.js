import { Storage } from "../utils/storage.js";
import { loadLevels } from "../utils/dataLoader.js";
import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, goToScene, COLORS, FONTS, formatTime, bindResizeRestart } from "../utils/ui.js";
import { getUiLayout } from "../config/layout.js";
import { fillLibraryRoom } from "../utils/libraryArt.js";

const RULE_BADGE = {
  title_az:         { en: "Title A–Z",       es: "Título A–Z" },
  author_az:        { en: "Author A–Z",      es: "Autor A–Z" },
  genre_az:         { en: "Genre A–Z",       es: "Género A–Z" },
  year_asc:         { en: "Year ↑",          es: "Año ↑" },
  genre_then_title: { en: "Genre › Title",   es: "Género › Título" },
  year_desc:        { en: "Year ↓",          es: "Año ↓" },
  title_za:         { en: "Title Z–A",       es: "Título Z–A" },
  author_za:        { en: "Author Z–A",      es: "Autor Z–A" },
  size_asc:         { en: "Size ↑",          es: "Tamaño ↑" },
  size_desc:        { en: "Size ↓",          es: "Tamaño ↓" },
  color_rainbow:    { en: "Color 🌈",        es: "Color 🌈" },
  pages_asc:        { en: "Pages ↑",         es: "Páginas ↑" },
  pages_desc:       { en: "Pages ↓",         es: "Páginas ↓" },
};

function ruleBadgeLabel(rule) {
  const entry = RULE_BADGE[rule];
  if (!entry) return rule;
  return entry[I18n.lang] ?? entry.en;
}

function levelBookCount(levelDef) {
  if (Array.isArray(levelDef.zones)) {
    return levelDef.zones.reduce((sum, z) => sum + (z.books?.length ?? 0), 0);
  }
  return levelDef.books?.length ?? 0;
}

function computeStars(best, levelDef) {
  if (!best) return 0;
  const books = Math.max(1, levelBookCount(levelDef));
  const seconds = Math.floor(best.timeMs / 1000);

  const targetMoves = Math.max(4, Math.round(books * 0.9));
  const targetSeconds = Math.max(25, Math.round(books * 7));

  if (best.moves <= targetMoves && seconds <= targetSeconds) return 3;
  if (
    best.moves <= Math.round(targetMoves * 1.35) &&
    seconds <= Math.round(targetSeconds * 1.35)
  ) return 2;
  return 1;
}

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super("LevelSelectScene");
  }

  init(data) {
    this.currentPage = data?.page ?? 0;
    this.pageCount   = 1;
    this.cardGroups  = []; // [{page, objects:[]}]
    this.lockedFeedback = null;
  }

  async create() {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(200, 0, 0, 0);

    fillLibraryRoom(this);

    // Header
    this.add
      .text(width / 2, 52, I18n.t("levelSelect"), {
        fontFamily: FONTS.title,
        fontSize: width < 720 ? "28px" : "36px",
        color: "#f3e3c3",
        fontStyle: "bold",
        wordWrap: { width: width - 180 },
        align: "center",
      })
      .setOrigin(0.5);

    makeButton(this, Math.min(80, width * 0.18), 40, I18n.t("back"), () => goToScene(this, "MenuScene"), {
      width: width < 420 ? 96 : 120,
      height: 40,
      fontSize: 16,
      fill: COLORS.woodLight,
      textColor: "#f3e3c3",
    });

    // Loading
    const loading = this.add
      .text(width / 2, height / 2, I18n.t("loadingLevels"), {
        fontFamily: FONTS.body,
        fontSize: "22px",
        color: "#d9a441",
      })
      .setOrigin(0.5);

    let levels;
    try {
      levels = await loadLevels();
    } catch (err) {
      console.error(err);
      goToScene(this, "ErrorScene", {
        title: I18n.t("errorTitle"),
        messageKey: "levelsError",
        details: err?.message || String(err),
        retryScene: "LevelSelectScene",
      });
      return;
    }
    loading.destroy();

    const ui = getUiLayout(width, height).levelSelect;
    const COLS = ui.cols;
    const ROWS_PAGE = ui.rowsPerPage;
    const PER_PAGE = ui.perPage;
    const CELL_W = ui.cellW;
    const CELL_H = ui.cellH;
    const CARD_W = ui.cardW;
    const CARD_H = ui.cardH;
    const GRID_TOP = ui.gridTop;
    const GRID_BOTTOM = ui.gridBottom;

    this.pageCount = Math.ceil(levels.length / PER_PAGE);
    this.currentPage = Phaser.Math.Clamp(this.currentPage, 0, Math.max(0, this.pageCount - 1));
    const maxUnlocked = Storage.getMaxLevelUnlocked();

    // Grid layout
    const totalGridW = COLS * CELL_W;
    const startX = width / 2 - totalGridW / 2 + CELL_W / 2;
    const availH = GRID_BOTTOM - GRID_TOP;
    const startY = GRID_TOP + (availH - ROWS_PAGE * CELL_H) / 2 + CELL_H / 2;

    this.cardGroups = [];

    levels.forEach((lvl, i) => {
      const page = Math.floor(i / PER_PAGE);
      const idx  = i % PER_PAGE;
      const col  = idx % COLS;
      const row  = Math.floor(idx / COLS);
      const x    = startX + col * CELL_W;
      const y    = startY + row * CELL_H;
      const unlocked = lvl.level <= maxUnlocked;
      const best     = Storage.getBestForLevel(lvl.level);
      const played   = !!best;
      const stars    = played ? computeStars(best, lvl) : 0;

      const objects = [];

      // ── Card background ──────────────────────────────────
      const card = this.add.graphics();
      if (!unlocked) {
        card.fillStyle(0x2a1e14, 1);
        card.fillRoundedRect(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, 10);
        card.lineStyle(1.5, 0x3a2a1c, 1);
        card.strokeRoundedRect(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, 10);
      } else {
        card.fillStyle(COLORS.wood, 1);
        card.fillRoundedRect(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, 10);
        // Accent border: gold for best, green for played, normal for unlocked
        const borderColor = played ? (best.score >= 800 ? COLORS.good : COLORS.accent) : COLORS.accent;
        card.lineStyle(played ? 2.5 : 1.5, borderColor, 1);
        card.strokeRoundedRect(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, 10);
        // Inner highlight line
        card.lineStyle(1, 0xffffff, 0.12);
        card.lineBetween(x - CARD_W / 2 + 8, y - CARD_H / 2 + 2, x + CARD_W / 2 - 8, y - CARD_H / 2 + 2);
      }
      objects.push(card);

      // ── Level number ──────────────────────────────────────
      const numTxt = this.add
        .text(x, y - CARD_H / 2 + 18, lvl.level.toString(), {
          fontFamily: FONTS.body,
          fontSize: "22px",
          color: unlocked ? "#f3e3c3" : "#5a4030",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      objects.push(numTxt);

      // ── Level title ───────────────────────────────────────
      const titleTxt = this.add
        .text(x, y, I18n.pick(lvl, "title"), {
          fontFamily: FONTS.body,
          fontSize: "12px",
          color: unlocked ? "#d9a441" : "#4a3528",
          align: "center",
          wordWrap: { width: CARD_W - 16 },
        })
        .setOrigin(0.5);
      objects.push(titleTxt);

      // ── Rule badge ────────────────────────────────────────
      const hasCustomKeys = Array.isArray(lvl.keys) && lvl.keys.length;
      const badgeRule = lvl.rule ?? (lvl.zones ? "__multi__" : hasCustomKeys ? "__custom__" : null);
      if (unlocked && badgeRule) {
        let badgeLabel;
        if (badgeRule === "__multi__") {
          badgeLabel = I18n.lang === "es" ? "Multi-estante" : "Multi-shelf";
        } else if (badgeRule === "__custom__") {
          badgeLabel = (I18n.lang === "es" ? lvl.ruleLabel_es : lvl.ruleLabel)
            || lvl.ruleLabel || lvl.ruleLabel_es
            || (I18n.lang === "es" ? "Regla combinada" : "Combined rule");
        } else {
          badgeLabel = ruleBadgeLabel(badgeRule);
        }
        const badgeTxt = this.add
          .text(x, y + CARD_H / 2 - 14, badgeLabel, {
            fontFamily: FONTS.body,
            fontSize: "10px",
            color: "#2c1d14",
            align: "center",
          })
          .setOrigin(0.5);

        const bw = badgeTxt.width + 10;
        const badgeBg = this.add.graphics();
        badgeBg.fillStyle(COLORS.accent, 1);
        badgeBg.fillRoundedRect(x - bw / 2, y + CARD_H / 2 - 22, bw, 16, 6);
        // insert badge bg before text
        objects.push(badgeBg);
        objects.push(badgeTxt);
      }

      // ── Best score / status ───────────────────────────────
      if (unlocked) {
        const statusTxt = played
          ? I18n.t("best", { score: best.score, time: formatTime(best.timeMs) })
          : I18n.t("notPlayed");
        const statusColor = played ? "#c9b08a" : "#7a6548";

        const st = this.add
          .text(x, y - 14, statusTxt, {
            fontFamily: FONTS.body,
            fontSize: "10px",
            color: statusColor,
            align: "center",
          })
          .setOrigin(0.5);
        objects.push(st);

        // ── Stars by time + moves ──────────────────────────────
        const starsText = "★".repeat(stars) + "☆".repeat(3 - stars);
        const starsColor = stars === 3 ? "#ffd766" : stars === 2 ? "#e9c77b" : stars === 1 ? "#caa56a" : "#6e5a43";
        const starsObj = this.add
          .text(x, y + 14, starsText, {
            fontFamily: FONTS.body,
            fontSize: "14px",
            color: starsColor,
            align: "center",
            fontStyle: "bold",
          })
          .setOrigin(0.5);
        objects.push(starsObj);
      }

      // ── Lock icon ─────────────────────────────────────────
      let lockIcon = null;
      if (!unlocked) {
        lockIcon = this.add
          .text(x, y + 4, "🔒", {
            fontSize: "22px",
          })
          .setOrigin(0.5);
        objects.push(lockIcon);
      }

      // ── Interaction ───────────────────────────────────────
      if (unlocked) {
        const hit = this.add
          .rectangle(x, y, CARD_W, CARD_H, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true });
        hit.on("pointerover", () => {
          card.setAlpha(0.8);
          this.tweens.add({ targets: [numTxt, titleTxt], y: `-=2`, duration: 80 });
        });
        hit.on("pointerout", () => {
          card.setAlpha(1);
          this.tweens.add({ targets: [numTxt, titleTxt], y: `+=2`, duration: 80 });
        });
        hit.on("pointerdown", () =>
          goToScene(this, "GameScene", { level: lvl.level })
        );
        objects.push(hit);
      } else {
        const hit = this.add
          .rectangle(x, y, CARD_W, CARD_H, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true });
        hit.on("pointerover", () => {
          card.setAlpha(0.9);
        });
        hit.on("pointerout", () => {
          card.setAlpha(1);
        });
        hit.on("pointerdown", () => {
          this.showLockedFeedback(Math.max(1, lvl.level - 1));
          if (lockIcon) {
            this.tweens.add({ targets: lockIcon, y: `-=3`, duration: 70, yoyo: true });
          }
        });
        objects.push(hit);
      }

      if (!this.cardGroups[page]) this.cardGroups[page] = [];
      this.cardGroups[page].push(...objects);
    });

    this.buildPager(width, height);
    this.showPage(this.currentPage);
    bindResizeRestart(this, () => ({ page: this.currentPage }));
  }

  showLockedFeedback(requiredLevel) {
    const { width, height } = this.scale;
    const message = I18n.t("lockedPrevHint", { level: requiredLevel });

    if (this.lockedFeedback) {
      this.lockedFeedback.bg.destroy();
      this.lockedFeedback.txt.destroy();
      this.lockedFeedback = null;
    }

    const txt = this.add
      .text(width / 2, height - 74, message, {
        fontFamily: FONTS.body,
        fontSize: "15px",
        color: "#2c1d14",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(30);

    const padX = 14;
    const padY = 8;
    const bw = txt.width + padX * 2;
    const bh = txt.height + padY * 2;
    const bg = this.add.graphics().setDepth(29);
    bg.fillStyle(COLORS.parchment, 0.97);
    bg.fillRoundedRect(width / 2 - bw / 2, height - 74 - bh / 2, bw, bh, 8);
    bg.lineStyle(1.5, COLORS.accent, 0.85);
    bg.strokeRoundedRect(width / 2 - bw / 2, height - 74 - bh / 2, bw, bh, 8);

    this.lockedFeedback = { bg, txt };
    this.tweens.add({
      targets: [bg, txt],
      alpha: 0,
      delay: 1200,
      duration: 260,
      onComplete: () => {
        bg.destroy();
        txt.destroy();
        if (this.lockedFeedback?.bg === bg) this.lockedFeedback = null;
      },
    });
  }

  buildPager(width, height) {
    if (this.pageCount <= 1) return;

    const btnY = height - 32;

    this.prevPageBtn = makeButton(
      this,
      width / 2 - 80,
      btnY,
      "\u2039",
      () => this.showPage(this.currentPage - 1),
      { width: 44, height: 44, fontSize: 28, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    );

    this.pageLbl = this.add
      .text(width / 2, btnY, "", {
        fontFamily: FONTS.body,
        fontSize: "15px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.nextPageBtn = makeButton(
      this,
      width / 2 + 80,
      btnY,
      "\u203a",
      () => this.showPage(this.currentPage + 1),
      { width: 44, height: 44, fontSize: 28, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    );
  }

  showPage(p) {
    this.currentPage = Phaser.Math.Clamp(p, 0, this.pageCount - 1);

    this.cardGroups.forEach((group, pageIdx) => {
      const visible = pageIdx === this.currentPage;
      group.forEach((obj) => obj.setVisible(visible));
    });

    if (this.pageLbl) {
      this.pageLbl.setText(
        I18n.t("pageIndicator", { page: this.currentPage + 1, total: this.pageCount })
      );
    }
    this.prevPageBtn?.setEnabled(this.currentPage > 0);
    this.nextPageBtn?.setEnabled(this.currentPage < this.pageCount - 1);
  }
}
