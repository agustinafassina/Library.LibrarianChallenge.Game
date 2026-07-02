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
    this.tagButtons = [];
    this.rows = [];
    this.searchDom = null;
    this.statusText = null;
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

    this.buildTagButtons();
    this.buildSearchInput();
    this.renderBookList();
  }

  buildSearchInput() {
    const input = document.createElement("input");
    input.type = "search";
    input.value = this.searchQuery;
    input.placeholder = I18n.t("booksSearchPlaceholder");
    input.setAttribute("aria-label", I18n.t("booksSearch"));
    input.style.position = "absolute";
    input.style.top = "30px";
    input.style.right = "24px";
    input.style.zIndex = "20";
    input.style.width = "270px";
    input.style.height = "34px";
    input.style.border = "2px solid #d9a441";
    input.style.borderRadius = "10px";
    input.style.background = "#2c1d14";
    input.style.color = "#f3e3c3";
    input.style.font = "bold 15px Trebuchet MS, Segoe UI, sans-serif";
    input.style.outline = "none";
    input.style.padding = "0 14px";
    input.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.28)";

    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      this.currentPage = 0;
      this.renderBookList();
    });

    document.getElementById("game-container")?.appendChild(input);
    this.searchDom = input;
    this.events.once("shutdown", () => input.remove());
  }

  buildTagButtons() {
    const { width } = this.scale;
    this.tagButtons.forEach((btn) => btn.destroy());
    this.tagButtons = [];

    const cols = 5;
    const btnW = 132;
    const btnH = 36;
    const gapX = 12;
    const gapY = 10;
    const startX = width / 2 - ((cols - 1) * (btnW + gapX)) / 2;
    const startY = 92;

    this.tags.forEach((tag, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (btnW + gapX);
      const y = startY + row * (btnH + gapY);
      const selected = tag === this.selectedTag;
      const btn = makeButton(
        this,
        x,
        y,
        tag,
        () => {
          this.selectedTag = tag;
          this.currentPage = 0;
          this.buildTagButtons();
          this.renderBookList();
        },
        {
          width: btnW,
          height: btnH,
          fontSize: 14,
          fill: selected ? COLORS.accent : COLORS.woodLight,
          textColor: selected ? "#2c1d14" : "#f3e3c3",
        }
      );
      this.tagButtons.push(btn);
    });
  }

  renderBookList() {
    const { width, height } = this.scale;
    this.rows.forEach((row) => row.destroy());
    this.rows = [];

    const books = this.books
      .filter((book) => matchesTag(book, this.selectedTag))
      .filter((book) => this.matchesSearch(book))
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));

    const titleY = 224;
    const title = this.add
      .text(width / 2, titleY, I18n.t("booksForTag", { tag: this.selectedTag, count: books.length }), {
        fontFamily: FONTS.body,
        fontSize: "20px",
        color: "#d9a441",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.rows.push(title);

    if (books.length === 0) {
      const empty = this.add
        .text(width / 2, height / 2, I18n.t("booksEmpty"), {
          fontFamily: FONTS.body,
          fontSize: "18px",
          color: "#c9b08a",
        })
        .setOrigin(0.5);
      this.rows.push(empty);
      return;
    }

    const listTop = 264;
    const rowH = 42;
    const pagerBottom = 48;
    const maxRows = Math.max(1, Math.min(7, Math.floor((height - listTop - 96) / rowH)));
    const pageCount = Math.max(1, Math.ceil(books.length / maxRows));
    this.currentPage = Phaser.Math.Clamp(this.currentPage, 0, pageCount - 1);
    const start = this.currentPage * maxRows;
    const visible = books.slice(start, start + maxRows);
    const panelW = Math.min(820, width - 90);
    const panelX = width / 2 - panelW / 2;

    visible.forEach((book, i) => {
      const y = listTop + i * rowH;
      const bg = this.add.graphics();
      bg.fillStyle(i % 2 === 0 ? 0x3a2618 : 0x2c1d14, 0.92);
      bg.fillRoundedRect(panelX, y, panelW, rowH - 6, 8);
      bg.lineStyle(1, 0xffffff, 0.08);
      bg.strokeRoundedRect(panelX, y, panelW, rowH - 6, 8);
      this.rows.push(bg);

      const titleText = this.add
        .text(panelX + 18, y + 10, book.title, {
          fontFamily: FONTS.body,
          fontSize: "16px",
          color: "#f3e3c3",
          fontStyle: "bold",
        })
        .setOrigin(0, 0);
      titleText.setCrop(0, 0, panelW * 0.42, 22);
      this.rows.push(titleText);

      const meta = `${book.author} · ${book.year} · ${I18n.t("pagesCount", { n: book.pages })}`;
      const metaText = this.add
        .text(panelX + panelW * 0.48, y + 11, meta, {
          fontFamily: FONTS.body,
          fontSize: "14px",
          color: "#c9b08a",
        })
        .setOrigin(0, 0);
      metaText.setCrop(0, 0, panelW * 0.48, 20);
      this.rows.push(metaText);
    });

    if (pageCount > 1) this.renderPager(pageCount, pagerBottom);
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

  renderPager(pageCount, y) {
    const { width } = this.scale;

    const prev = makeButton(
      this,
      width / 2 - 150,
      this.scale.height - y,
      I18n.t("prevPage"),
      () => {
        this.currentPage = Math.max(0, this.currentPage - 1);
        this.renderBookList();
      },
      {
        width: 120,
        height: 34,
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
        this.scale.height - y,
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
      this.scale.height - y,
      I18n.t("nextPage"),
      () => {
        this.currentPage = Math.min(pageCount - 1, this.currentPage + 1);
        this.renderBookList();
      },
      {
        width: 120,
        height: 34,
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
