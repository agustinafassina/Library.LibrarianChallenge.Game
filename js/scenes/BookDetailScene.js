import { loadBooks } from "../utils/dataLoader.js";
import { I18n } from "../utils/i18n.js";
import { bookDetailRows, isLongBookTitle, truncateWrappedText } from "../utils/bookDetail.js";
import { shouldOfferTranslation, translateText } from "../utils/translate.js";
import { makeButton, goToScene, COLORS, FONTS } from "../utils/ui.js";

const LABEL_W = 118;
const META_ROW_GAP = 10;
const HERO_TITLE_MAX_H = 64;

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
    this.originalDescription = "";
    this.translatedDescription = null;
    this.showingTranslated = false;
    this.descText = null;
    this.translateBtn = null;
    this.translateBtnLabel = null;
    this.contentEndY = 0;
    this.visibleH = 0;
    this.panelRef = null;
    this.panelGraphics = null;
    this.panelMask = null;
    this.isTranslating = false;
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
      this.clearBookContent();
      this.statusText?.destroy();
      this.statusText = null;
      this.renderMessage(I18n.t("booksError"));
    }
  }

  clearBookContent() {
    this.unbindScroll();
    this.contentContainer?.destroy(true);
    this.contentContainer = null;
    this.panelGraphics?.destroy();
    this.panelGraphics = null;
    this.panelMask?.destroy();
    this.panelMask = null;
    this.descText = null;
    this.translateBtn = null;
    this.translateBtnLabel = null;
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

  panelLayout(contentHeight = null) {
    const { width, height } = this.scale;
    const w = Math.min(820, width - 90);
    const top = 88;
    const bottom = 24;
    const pad = 24;
    const maxH = height - top - bottom;

    if (contentHeight == null) {
      return { x: width / 2 - w / 2, y: top, w, h: maxH, pad, maxH };
    }

    const innerBottomPad = 10;
    const desiredH = contentHeight + pad * 2 + innerBottomPad;
    const h = Math.min(desiredH, maxH);

    return { x: width / 2 - w / 2, y: top, w, h, pad, maxH };
  }

  renderBook(book) {
    const basePanel = this.panelLayout();
    const contentW = basePanel.w - basePanel.pad * 2;
    const coverW = 54;
    const coverGap = 16;
    const bodyX = coverW + coverGap;
    const bodyW = contentW - bodyX;

    this.contentContainer = this.add.container(basePanel.x + basePanel.pad, basePanel.y + basePanel.pad);
    let y = 0;

    const coverColor = Phaser.Display.Color.HexStringToColor(book.color || "#8a7358").color;
    const titleStyle = {
      fontFamily: FONTS.title,
      fontSize: "26px",
      color: "#f3e3c3",
      fontStyle: "bold",
      wordWrap: { width: bodyW },
    };
    const titleIsLong = isLongBookTitle(book.title);
    const heroTitle = titleIsLong
      ? truncateWrappedText(this, book.title, titleStyle, bodyW, HERO_TITLE_MAX_H)
      : null;
    const title = this.add
      .text(bodyX, y, heroTitle?.text ?? book.title, titleStyle)
      .setOrigin(0, 0);
    this.contentContainer.add(title);

    const titleBlockH = heroTitle?.height ?? title.height;

    const byline = this.add
      .text(bodyX, title.y + titleBlockH + 8, `${book.author || "—"} · ${book.year ?? "—"}`, {
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
    const metaStartY = y;
    const firstMetaIndex = this.contentContainer.length;
    let rowY = metaStartY + 14;

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

    const metaPanelH = rowY - metaStartY + 8;
    this.contentContainer.addAt(this.drawInsetPanel(0, metaStartY, contentW, metaPanelH), firstMetaIndex);

    y = metaStartY + metaPanelH + 14;
    this.contentContainer.add(this.drawSectionDivider(contentW, y));
    y += 14;

    if (titleIsLong) {
      const fullTitle = this.add
        .text(0, y, book.title, {
          fontFamily: FONTS.title,
          fontSize: "20px",
          color: "#f3e3c3",
          fontStyle: "bold",
          wordWrap: { width: contentW },
          lineSpacing: 4,
        })
        .setOrigin(0, 0);
      this.contentContainer.add(fullTitle);
      y += fullTitle.height + 12;
    }

    const description = book.description?.trim();
    const descTitle = this.add
      .text(0, y, I18n.t("bookDetailDescription"), {
        fontFamily: FONTS.body,
        fontSize: "16px",
        color: "#d9a441",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.contentContainer.add(descTitle);

    this.originalDescription = description || "";
    this.translatedDescription = null;
    this.showingTranslated = false;

    if (shouldOfferTranslation(I18n.lang, Boolean(description))) {
      const btnW = 118;
      const btnH = 28;
      this.translateBtn = makeButton(
        this,
        contentW - btnW / 2,
        y + descTitle.height / 2,
        I18n.t("bookDetailTranslate"),
        () => this.toggleDescriptionTranslation(),
        {
          width: btnW,
          height: btnH,
          fontSize: 12,
          fill: COLORS.woodLight,
          fillHover: COLORS.accent,
          textColor: "#f3e3c3",
        }
      );
      this.translateBtnLabel = this.translateBtn.list[1];
      this.translateBtn.setDepth(3);
      this.contentContainer.add(this.translateBtn);
    }

    y += descTitle.height + 10;

    this.descText = this.add
      .text(0, y, description || I18n.t("bookDetailNoDescription"), {
        fontFamily: FONTS.body,
        fontSize: "14px",
        color: description ? "#c9b08a" : "#8a7358",
        fontStyle: description ? "normal" : "italic",
        wordWrap: { width: contentW },
        lineSpacing: 6,
      })
      .setOrigin(0, 0);
    this.contentContainer.add(this.descText);
    this.contentEndY = y + this.descText.height + 10;

    this.reflowPanel();
  }

  reflowPanel() {
    if (!this.contentContainer) return;

    const fitted = this.panelLayout(this.contentEndY);
    this.panelRef = fitted;

    this.panelGraphics?.destroy();
    this.panelGraphics = this.drawPanel(fitted.x, fitted.y, fitted.w, fitted.h);
    this.panelGraphics.setDepth(0);
    this.contentContainer.setDepth(1);

    this.panelMask?.destroy();
    this.panelMask = this.make.graphics({ x: fitted.x + 8, y: fitted.y + 8 });
    this.panelMask.fillStyle(0xffffff);
    this.panelMask.fillRoundedRect(0, 0, fitted.w - 16, fitted.h - 16, 12);
    this.contentContainer.setMask(this.panelMask.createGeometryMask());
    this.contentContainer.setPosition(fitted.x + fitted.pad, fitted.y + fitted.pad);

    this.visibleH = fitted.h - fitted.pad * 2;
    this.baseContainerY = fitted.y + fitted.pad;
    this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset ?? 0, 0, Math.max(0, this.contentEndY - this.visibleH));
    this.contentContainer.y = this.baseContainerY - this.scrollOffset;
    this.maxScroll = Math.max(0, this.contentEndY - this.visibleH);
    this.bindScroll();
    this.updateScrollHint(fitted);
  }

  async toggleDescriptionTranslation() {
    if (!this.descText || !this.originalDescription || this.isTranslating) return;

    if (this.showingTranslated) {
      this.setDescriptionText(this.originalDescription);
      this.showingTranslated = false;
      this.translateBtnLabel?.setText(I18n.t("bookDetailTranslate"));
      return;
    }

    if (this.translatedDescription) {
      this.setDescriptionText(this.translatedDescription);
      this.showingTranslated = true;
      this.translateBtnLabel?.setText(I18n.t("bookDetailShowOriginal"));
      return;
    }

    this.isTranslating = true;
    this.translateBtn?.setEnabled(false);
    this.translateBtnLabel?.setText(I18n.t("bookDetailTranslating"));

    try {
      this.translatedDescription = await translateText(this.originalDescription, I18n.lang);
      this.setDescriptionText(this.translatedDescription);
      this.showingTranslated = true;
      this.translateBtnLabel?.setText(I18n.t("bookDetailShowOriginal"));
    } catch (err) {
      console.error(err);
      this.translateBtnLabel?.setText(I18n.t("bookDetailTranslateError"));
    } finally {
      this.isTranslating = false;
      this.translateBtn?.setEnabled(true);
    }
  }

  setDescriptionText(text) {
    if (!this.descText) return;

    const oldHeight = this.descText.height;
    this.descText.setText(text);
    this.descText.setColor("#c9b08a");
    this.descText.setFontStyle("normal");

    const delta = this.descText.height - oldHeight;
    this.contentEndY += delta;
    this.reflowPanel();
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
    return panel;
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
