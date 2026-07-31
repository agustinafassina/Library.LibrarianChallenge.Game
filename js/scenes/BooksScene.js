import { loadBooks } from "../utils/dataLoader.js";
import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, goToScene, COLORS, FONTS } from "../utils/ui.js";

const DEFAULT_TAGS = [
  "Lgbtiq",
  "Queer",
  "Lesbian",
  "Gay",
  "Bisexual",
  "Trans",
  "NonBinary",
  "Intersex",
  "Feminism",
  "Activism",
];

const TAG_GENRES = {
  Lgbtiq: "LGTBIQ+",
  Queer: "Queer",
  Lesbian: "Lesbian",
  Gay: "Gay",
  Bisexual: "Bisexual",
  Trans: "Trans",
  NonBinary: "Non-binary",
  Intersex: "Intersex",
  Feminism: "Feminism",
  Activism: "Activism",
};

function configuredTags() {
  const tags = globalThis.LIBRARIAN_CHALLENGE_CONFIG?.bookTags;
  return Array.isArray(tags) && tags.length ? tags : DEFAULT_TAGS;
}

function matchesTag(book, tag) {
  if (Array.isArray(book.tags) && book.tags.includes(tag)) return true;
  return TAG_GENRES[tag] && String(book.genre).toLowerCase() === TAG_GENRES[tag].toLowerCase();
}

const PAGER_BTN_H = 34;
const PAGER_CENTER_FROM_BOTTOM = 48;
const PAGER_BOTTOM_PAD = 14;
const ROWS_PER_PAGE = 8;
const ROW_H_MAX = 42;
const ROW_H_MIN = 38;

export default class BooksScene extends Phaser.Scene {
  constructor() {
    super("BooksScene");
  }

  init() {
    this.books = [];
    this.tags = configuredTags();
    this.selectedTag = this.tags[0];
    this.searchQuery = "";
    this.currentPage = 0;
    this.rows = [];
    this.filterToolbarDom = null;
    this.searchDom = null;
    this.tagSelectDom = null;
    this.statusText = null;
    this.syncToolbarLayout = this.syncToolbarLayout.bind(this);
  }

  async create() {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.drawBackground();

    this.add
      .text(width / 2, 42, I18n.t("booksTitle"), {
        fontFamily: FONTS.title,
        fontSize: "36px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    makeButton(this, 80, 40, I18n.t("back"), () => goToScene(this, "MenuScene"), {
      width: 120,
      height: 40,
      fontSize: 16,
      fill: COLORS.woodLight,
      textColor: "#f3e3c3",
    });

    this.statusText = this.add
      .text(width / 2, height / 2, I18n.t("loadingBooks"), {
        fontFamily: FONTS.body,
        fontSize: "22px",
        color: "#d9a441",
      })
      .setOrigin(0.5);

    try {
      this.books = await loadBooks();
    } catch (err) {
      console.error(err);
      this.statusText.setText(I18n.t("booksError"));
      return;
    }

    this.statusText.destroy();
    this.statusText = null;
    this.toolbarDomHeightGame = 60;

    this.buildFilterToolbar();
    this.bindLayoutSync();
    this.renderBookList();
    this.events.once("shutdown", () => this.cleanupDomControls());
  }

  getPanelLayout() {
    const { width, height } = this.scale;
    const w = Math.min(820, width - 90);
    const x = width / 2 - w / 2;
    const top = 92;
    const pagerY = height - PAGER_CENTER_FROM_BOTTOM;
    const panelBottom = pagerY + PAGER_BTN_H / 2 + PAGER_BOTTOM_PAD;
    const h = panelBottom - top;
    const headerTopPad = 14;
    const titleLine = 20;
    const hintGap = 8;
    const hintLine = 14;
    const afterHintGap = 14;
    const toolbarH = this.toolbarDomHeightGame ?? 60;
    const afterToolbarGap = 16;
    const titleY = top + headerTopPad;
    const hintY = titleY + titleLine + hintGap;
    const toolbarGameY = hintY + hintLine + afterHintGap;
    const listTop = toolbarGameY + toolbarH + afterToolbarGap;
    const headerH = listTop - top;

    return {
      x,
      top,
      w,
      h,
      headerH,
      listTop,
      titleY,
      hintY,
      toolbarPadding: 14,
      toolbarGameY,
      pagerY,
      panelBottom,
    };
  }

  bindLayoutSync() {
    this.onLayoutChange = () => {
      this.syncToolbarLayout();
      if (this.filterToolbarDom && !this.statusText) {
        this.renderBookList();
      }
    };
    this.scale.on("resize", this.onLayoutChange);
    window.addEventListener("resize", this.onLayoutChange);
    window.visualViewport?.addEventListener("resize", this.onLayoutChange);
  }

  cleanupDomControls() {
    this.scale.off("resize", this.onLayoutChange);
    window.removeEventListener("resize", this.onLayoutChange);
    window.visualViewport?.removeEventListener("resize", this.onLayoutChange);
    this.filterToolbarDom?.remove();
    this.filterToolbarDom = null;
    this.searchDom = null;
    this.tagSelectDom = null;
  }

  syncToolbarLayout() {
    if (!this.filterToolbarDom) return;

    const canvas = this.game.canvas;
    const container = document.getElementById("game-container");
    if (!canvas || !container) return;

    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scaleX = canvasRect.width / this.scale.width;
    const scaleY = canvasRect.height / this.scale.height;
    const domRect = this.filterToolbarDom.getBoundingClientRect();
    if (domRect.height > 0) {
      this.toolbarDomHeightGame = domRect.height / scaleY;
    }

    const panel = this.getPanelLayout();

    Object.assign(this.filterToolbarDom.style, {
      left: `${canvasRect.left - containerRect.left + (panel.x + panel.toolbarPadding) * scaleX}px`,
      top: `${canvasRect.top - containerRect.top + panel.toolbarGameY * scaleY}px`,
      width: `${(panel.w - panel.toolbarPadding * 2) * scaleX}px`,
      transform: "none",
      padding: "0",
    });
  }

  buildFilterToolbar() {
    const host = document.getElementById("game-container");
    if (!host) return;

    const toolbar = document.createElement("div");
    toolbar.className = "books-toolbar";

    const categoryField = document.createElement("label");
    categoryField.className = "books-toolbar-field books-toolbar-field--category";
    const categoryLabel = document.createElement("span");
    categoryLabel.className = "books-toolbar-label";
    categoryLabel.textContent = I18n.t("booksCategory");
    const select = document.createElement("select");
    select.className = "books-field";
    select.setAttribute("aria-label", I18n.t("booksCategory"));
    this.tags.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      option.selected = tag === this.selectedTag;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      this.selectedTag = select.value;
      this.currentPage = 0;
      this.renderBookList();
    });
    categoryField.append(categoryLabel, select);

    const searchField = document.createElement("label");
    searchField.className = "books-toolbar-field books-toolbar-field--search";
    const searchLabel = document.createElement("span");
    searchLabel.className = "books-toolbar-label";
    searchLabel.textContent = I18n.t("booksSearch");
    const input = document.createElement("input");
    input.type = "search";
    input.className = "books-field";
    input.value = this.searchQuery;
    input.placeholder = I18n.t("booksSearchPlaceholder");
    input.setAttribute("aria-label", I18n.t("booksSearch"));
    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      this.currentPage = 0;
      this.renderBookList();
    });
    searchField.append(searchLabel, input);

    toolbar.append(categoryField, searchField);
    host.appendChild(toolbar);

    this.filterToolbarDom = toolbar;
    this.tagSelectDom = select;
    this.searchDom = input;
    this.syncToolbarLayout();
    requestAnimationFrame(() => {
      if (!this.scene.isActive()) return;
      this.syncToolbarLayout();
      this.renderBookList();
    });
  }

  drawTablePanel(panel) {
    const g = this.add.graphics();
    g.fillStyle(COLORS.ink, 0.94);
    g.fillRoundedRect(panel.x, panel.top, panel.w, panel.h, 12);
    g.lineStyle(2, COLORS.accent, 1);
    g.strokeRoundedRect(panel.x, panel.top, panel.w, panel.h, 12);

    g.fillStyle(0x3a2618, 0.92);
    g.fillRect(panel.x + 2, panel.top + 2, panel.w - 4, panel.headerH - 2);

    return g;
  }

  renderBookList() {
    const { width, height } = this.scale;
    this.rows.forEach((row) => row.destroy());
    this.rows = [];

    if (this.tagSelectDom && this.tagSelectDom.value !== this.selectedTag) {
      this.tagSelectDom.value = this.selectedTag;
    }

    this.syncToolbarLayout();
    const panel = this.getPanelLayout();
    this.rows.push(this.drawTablePanel(panel));

    const books = this.books
      .filter((book) => matchesTag(book, this.selectedTag))
      .filter((book) => this.matchesSearch(book))
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));

    const titleY = panel.titleY;
    const title = this.add
      .text(width / 2, titleY, I18n.t("booksForTag", { tag: this.selectedTag, count: books.length }), {
        fontFamily: FONTS.body,
        fontSize: "17px",
        color: "#d9a441",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.rows.push(title);

    const hint = this.add
      .text(width / 2, panel.hintY, I18n.t("booksOpenDetailHint"), {
        fontFamily: FONTS.body,
        fontSize: "12px",
        color: "#8a7358",
      })
      .setOrigin(0.5, 0);
    this.rows.push(hint);

    if (books.length === 0) {
      const empty = this.add
        .text(width / 2, panel.listTop + 80, I18n.t("booksEmpty"), {
          fontFamily: FONTS.body,
          fontSize: "18px",
          color: "#c9b08a",
        })
        .setOrigin(0.5);
      this.rows.push(empty);
      return;
    }

    const listTop = panel.listTop + 6;
    const pagerTop = panel.pagerY - PAGER_BTN_H / 2;
    const listGap = 6;
    const available = pagerTop - listTop - listGap;
    const rowH = Phaser.Math.Clamp(Math.floor(available / ROWS_PER_PAGE), ROW_H_MIN, ROW_H_MAX);
    const maxRows = Math.min(ROWS_PER_PAGE, Math.max(1, Math.floor(available / rowH)));
    const pageCount = Math.max(1, Math.ceil(books.length / maxRows));
    this.currentPage = Phaser.Math.Clamp(this.currentPage, 0, pageCount - 1);
    const start = this.currentPage * maxRows;
    const visible = books.slice(start, start + maxRows);
    const panelX = panel.x + 10;
    const panelW = panel.w - 20;
    const eyeBtnW = 34;
    const metaMaxW = panelW * 0.42;

    visible.forEach((book, i) => {
      const y = listTop + i * rowH;
      const rowHInner = rowH - 6;
      const bg = this.add.graphics();
      bg.fillStyle(i % 2 === 0 ? 0x3a2618 : 0x2c1d14, 0.92);
      bg.fillRoundedRect(panelX, y, panelW, rowHInner, 8);
      bg.lineStyle(1, 0xffffff, 0.08);
      bg.strokeRoundedRect(panelX, y, panelW, rowHInner, 8);
      this.rows.push(bg);

      const spine = this.add.graphics();
      const spineColor = Phaser.Display.Color.HexStringToColor(book.color || "#8a7358").color;
      spine.fillStyle(spineColor, 1);
      spine.fillRoundedRect(panelX + 8, y + 6, 10, rowHInner - 12, 3);
      this.rows.push(spine);

      const titleText = this.add
        .text(panelX + 26, y + 10, book.title, {
          fontFamily: FONTS.body,
          fontSize: "16px",
          color: "#f3e3c3",
          fontStyle: "bold",
        })
        .setOrigin(0, 0);
      titleText.setCrop(0, 0, panelW * 0.38, 22);
      this.rows.push(titleText);

      const meta = `${book.author} · ${book.year} · ${I18n.t("pagesCount", { n: book.pages })}`;
      const metaText = this.add
        .text(panelX + panelW * 0.42, y + 11, meta, {
          fontFamily: FONTS.body,
          fontSize: "14px",
          color: "#c9b08a",
        })
        .setOrigin(0, 0);
      metaText.setCrop(0, 0, metaMaxW, 20);
      this.rows.push(metaText);

      const viewBtn = makeButton(
        this,
        panelX + panelW - eyeBtnW / 2 - 10,
        y + rowHInner / 2,
        "👁",
        () => goToScene(this, "BookDetailScene", { book }),
        {
          width: eyeBtnW,
          height: rowHInner - 10,
          fontSize: 18,
          fill: COLORS.woodLight,
          fillHover: COLORS.accent,
          textColor: "#f3e3c3",
        }
      );
      viewBtn.setDepth(2);
      this.rows.push(viewBtn);
    });

    if (pageCount > 1) this.renderPager(pageCount, panel.pagerY);
  }

  matchesSearch(book) {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return true;

    return [
      book.title,
      book.author,
      book.genre,
      book.year,
      book.pages,
      ...(book.tags ?? []),
    ]
      .filter((value) => value !== null && value !== undefined)
      .some((value) => String(value).toLowerCase().includes(q));
  }

  renderPager(pageCount, pagerY) {
    const { width } = this.scale;

    const prev = makeButton(
      this,
      width / 2 - 150,
      pagerY,
      I18n.t("prevPage"),
      () => {
        this.currentPage = Math.max(0, this.currentPage - 1);
        this.renderBookList();
      },
      {
        width: 120,
        height: PAGER_BTN_H,
        fontSize: 14,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
        enabled: this.currentPage > 0,
      }
    );
    this.rows.push(prev);

    const label = this.add
      .text(
        width / 2,
        pagerY,
        I18n.t("pageIndicator", { page: this.currentPage + 1, total: pageCount }),
        {
          fontFamily: FONTS.body,
          fontSize: "15px",
          color: "#c9b08a",
          fontStyle: "bold",
        }
      )
      .setOrigin(0.5);
    this.rows.push(label);

    const next = makeButton(
      this,
      width / 2 + 150,
      pagerY,
      I18n.t("nextPage"),
      () => {
        this.currentPage = Math.min(pageCount - 1, this.currentPage + 1);
        this.renderBookList();
      },
      {
        width: 120,
        height: PAGER_BTN_H,
        fontSize: 14,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
        enabled: this.currentPage < pageCount - 1,
      }
    );
    this.rows.push(next);
  }

  drawBackground() {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(COLORS.woodDark, 1);
    g.fillRect(0, 0, width, height);
    g.lineStyle(2, 0x000000, 0.15);
    for (let yy = 80; yy < height; yy += 90) {
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(width, yy);
      g.strokePath();
    }
  }
}
