import { loadBooks } from "../utils/dataLoader.js";
import { I18n } from "../utils/i18n.js";
import { bookDetailRows } from "../utils/bookDetail.js";
import { makeButton, goToScene, COLORS, FONTS } from "../utils/ui.js";

const LABEL_W = 118;
const META_ROW_GAP = 10;

export default class BookDetailScene extends Phaser.Scene {
  constructor() {
    super("BookDetailScene");
  }

  init(data) {
    this.book = data.book ?? null;
    this.bookId = data.bookId ?? data.book?.id ?? null;
    this.contentContainer = null;
    this.scrollOffset = 0;
    this.maxScroll = 0;
    this.statusText = null;
    this.wheelHandler = null;
    this.scrollHint = null;
  }

  create() {
    const { width } = this.scale;
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.drawBackground();

    makeButton(this, 80, 40, I18n.t("back"), () => goToScene(this, "BooksScene"), {
      width: 120,
      height: 40,
      fontSize: 16,
      fill: COLORS.woodLight,
      textColor: "#f3e3c3",
    });

    this.add
      .text(width / 2, 42, I18n.t("booksTitle"), {
        fontFamily: FONTS.title,
        fontSize: "36px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(width / 2, this.scale.height / 2, I18n.t("loadingBooks"), {
        fontFamily: FONTS.body,
        fontSize: "22px",
        color: "#d9a441",
      })
      .setOrigin(0.5);

    this.events.once("shutdown", () => this.unbindScroll());
    this.loadBook();
  }

  async loadBook() {
    try {
      let book = this.book;
      if (!book && Number.isFinite(this.bookId)) {
        const books = await loadBooks();
        book = books.find((entry) => entry.id === this.bookId) ?? null;
      }

      this.statusText?.destroy();
      this.statusText = null;

      if (!book) {
        this.renderMessage(I18n.t("bookDetailNotFound"), I18n.t("bookDetailNotFoundHint"));
        return;
      }

      this.renderBook(book);
    } catch (err) {
      console.error(err);
      this.statusText?.destroy();
      this.statusText = null;
      this.renderMessage(I18n.t("booksError"));
    }
  }

  renderMessage(title, subtitle = "") {
    const { width, height } = this.scale;
    const panel = this.panelLayout();
    this.drawPanel(panel.x, panel.y, panel.w, panel.h);

    this.add
      .text(width / 2, height / 2 - (subtitle ? 12 : 0), title, {
        fontFamily: FONTS.body,
        fontSize: "22px",
        color: "#f3e3c3",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: panel.w - 80 },
      })
      .setOrigin(0.5);

    if (subtitle) {
      this.add
        .text(width / 2, height / 2 + 24, subtitle, {
          fontFamily: FONTS.body,
          fontSize: "16px",
          color: "#c9b08a",
          align: "center",
          wordWrap: { width: panel.w - 80 },
        })
        .setOrigin(0.5);
    }
  }

  panelLayout() {
    const { width, height } = this.scale;
    const w = Math.min(820, width - 90);
    const top = 88;
    return { x: width / 2 - w / 2, y: top, w, h: height - top - 24, pad: 24 };
  }

  renderBook(book) {
    const panel = this.panelLayout();
    const contentW = panel.w - panel.pad * 2;
    const coverW = 54;
    const coverGap = 16;
    const bodyX = coverW + coverGap;
    const bodyW = contentW - bodyX;

    this.drawPanel(panel.x, panel.y, panel.w, panel.h);
    this.contentContainer = this.add.container(panel.x + panel.pad, panel.y + panel.pad);
    let y = 0;

    const coverColor = Phaser.Display.Color.HexStringToColor(book.color || "#8a7358").color;
    const title = this.add
      .text(bodyX, y, book.title, {
        fontFamily: FONTS.title,
        fontSize: "26px",
        color: "#f3e3c3",
        fontStyle: "bold",
        wordWrap: { width: bodyW },
      })
      .setOrigin(0, 0);
    this.contentContainer.add(title);

    const byline = this.add
      .text(bodyX, title.y + title.height + 8, `${book.author || "—"} · ${book.year ?? "—"}`, {
        fontFamily: FONTS.body,
        fontSize: "15px",
        color: "#c9b08a",
      })
      .setOrigin(0, 0);
    this.contentContainer.add(byline);

    const genreBadge = this.drawGenreBadge(bodyX, byline.y + byline.height + 10, book.genre || "—", coverColor);
    this.contentContainer.add(genreBadge);

    const heroH = Math.max(coverW * 1.45, genreBadge.y + genreBadge.height);
    this.contentContainer.add(this.drawBookCover(0, 0, coverW, heroH, coverColor));

    y = heroH + 22;
    this.contentContainer.add(this.drawSectionDivider(contentW, y));
    y += 14;

    const metaRows = bookDetailRows(book).filter(
      ([label]) =>
        label !== I18n.t("bookDetailAuthor") &&
        label !== I18n.t("bookDetailGenre") &&
        label !== I18n.t("bookDetailYear")
    );
    const metaPanelH = this.estimateMetaPanelHeight(metaRows, bodyW - LABEL_W - 12);
    this.contentContainer.add(this.drawInsetPanel(0, y, contentW, metaPanelH));

    let rowY = y + 14;
    metaRows.forEach(([label, value], index) => {
      if (index > 0) {
        this.contentContainer.add(this.drawRowDivider(12, rowY - 6, contentW - 24));
      }

      const labelText = this.add
        .text(20, rowY, label, {
          fontFamily: FONTS.body,
          fontSize: "14px",
          color: "#d9a441",
          fontStyle: "bold",
        })
        .setOrigin(0, 0);
      const valueText = this.add
        .text(20 + LABEL_W, rowY, String(value), {
          fontFamily: FONTS.body,
          fontSize: "14px",
          color: "#f3e3c3",
          wordWrap: { width: contentW - LABEL_W - 32 },
        })
        .setOrigin(0, 0);
      this.contentContainer.add([labelText, valueText]);
      rowY += Math.max(labelText.height, valueText.height) + META_ROW_GAP + 8;
    });

    y += metaPanelH + 18;
    this.contentContainer.add(this.drawSectionDivider(contentW, y));
    y += 14;

    const descTitle = this.add
      .text(0, y, I18n.t("bookDetailDescription"), {
        fontFamily: FONTS.body,
        fontSize: "16px",
        color: "#d9a441",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.contentContainer.add(descTitle);
    y += descTitle.height + 10;

    const description = book.description?.trim();
    const descText = this.add
      .text(0, y, description || I18n.t("bookDetailNoDescription"), {
        fontFamily: FONTS.body,
        fontSize: "14px",
        color: description ? "#c9b08a" : "#8a7358",
        fontStyle: description ? "normal" : "italic",
        wordWrap: { width: contentW },
        lineSpacing: 6,
      })
      .setOrigin(0, 0);
    this.contentContainer.add(descText);
    y += descText.height + 16;

    const maskShape = this.make.graphics({ x: panel.x + 8, y: panel.y + 8 });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRoundedRect(0, 0, panel.w - 16, panel.h - 16, 12);
    this.contentContainer.setMask(maskShape.createGeometryMask());

    const visibleH = panel.h - panel.pad * 2;
    this.scrollOffset = 0;
    this.maxScroll = Math.max(0, y - visibleH);
    this.baseContainerY = panel.y + panel.pad;
    this.bindScroll();
    this.updateScrollHint(panel);
  }

  estimateMetaPanelHeight(rows, valueW) {
    let h = 28;
    rows.forEach(([label, value]) => {
      const labelLines = Math.ceil(label.length / 14);
      const valueLines = Math.ceil(String(value).length / Math.max(1, Math.floor(valueW / 8)));
      h += Math.max(labelLines, valueLines) * 18 + META_ROW_GAP + 8;
    });
    return h;
  }

  drawBookCover(x, y, w, h, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(2, 0xffffff, 0.18);
    g.strokeRoundedRect(x, y, w, h, 8);
    g.fillStyle(0x000000, 0.22);
    g.fillRoundedRect(x + 5, y + 8, 4, h - 16, 2);
    g.fillStyle(0xffffff, 0.08);
    g.fillRoundedRect(x + w - 10, y + 10, 3, h - 20, 1);
    return g;
  }

  drawGenreBadge(x, y, genre, color) {
    const container = this.add.container(x, y);
    const label = this.add
      .text(12, 7, genre, {
        fontFamily: FONTS.body,
        fontSize: "13px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    const badgeW = label.width + 24;
    const badgeH = 28;
    const bg = this.add.graphics();
    bg.fillStyle(color, 0.35);
    bg.fillRoundedRect(0, 0, badgeW, badgeH, 14);
    bg.lineStyle(1, color, 0.85);
    bg.strokeRoundedRect(0, 0, badgeW, badgeH, 14);
    container.add([bg, label]);
    container.setSize(badgeW, badgeH);
    return container;
  }

  drawInsetPanel(x, y, w, h) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.22);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(1, 0xffffff, 0.08);
    g.strokeRoundedRect(x, y, w, h, 10);
    return g;
  }

  drawSectionDivider(w, y) {
    const g = this.add.graphics();
    g.lineStyle(1, COLORS.accent, 0.35);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.strokePath();
    return g;
  }

  drawRowDivider(x, y, w) {
    const g = this.add.graphics();
    g.lineStyle(1, 0xffffff, 0.06);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w, y);
    g.strokePath();
    return g;
  }

  updateScrollHint(panel) {
    this.scrollHint?.destroy();
    if (this.maxScroll <= 0) return;

    this.scrollHint = this.add
      .text(panel.x + panel.w / 2, panel.y + panel.h - 14, I18n.t("bookDetailScrollHint"), {
        fontFamily: FONTS.body,
        fontSize: "12px",
        color: "#8a7358",
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  bindScroll() {
    this.unbindScroll();
    this.wheelHandler = (_pointer, _objects, _deltaX, deltaY) => {
      if (this.maxScroll <= 0 || !this.contentContainer) return;
      this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + deltaY * 0.45, 0, this.maxScroll);
      this.contentContainer.y = this.baseContainerY - this.scrollOffset;
    };
    this.input.on("wheel", this.wheelHandler);
  }

  unbindScroll() {
    if (this.wheelHandler) {
      this.input.off("wheel", this.wheelHandler);
      this.wheelHandler = null;
    }
    this.scrollHint?.destroy();
    this.scrollHint = null;
  }

  drawPanel(x, y, w, h) {
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.ink, 0.98);
    panel.fillRoundedRect(x, y, w, h, 16);
    panel.lineStyle(3, COLORS.accent, 1);
    panel.strokeRoundedRect(x, y, w, h, 16);
    panel.fillStyle(0xffffff, 0.03);
    panel.fillRoundedRect(x + 3, y + 3, w - 6, 28, 12);
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
