import { I18n } from "./i18n.js";

const SIZE_KEYS = {
  small: "sizeSmall",
  medium: "sizeMedium",
  large: "sizeLarge",
};

export function bookSizeLabel(size) {
  const key = SIZE_KEYS[size];
  return key ? I18n.t(key) : size || "—";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bookDetailRows(book) {
  const rows = [
    [I18n.t("bookDetailAuthor"), book.author || "—"],
    [I18n.t("bookDetailGenre"), book.genre || "—"],
    [I18n.t("bookDetailYear"), book.year ?? "—"],
    [
      I18n.t("bookDetailPages"),
      book.pages != null ? I18n.t("pagesCount", { n: book.pages }) : "—",
    ],
    [I18n.t("bookDetailSize"), bookSizeLabel(book.size)],
    [I18n.t("bookDetailTags"), (book.tags ?? []).join(", ") || "—"],
  ];
  if (book.source) rows.push([I18n.t("bookDetailSource"), book.source]);
  return rows;
}

export function renderBookDetailMarkup(book) {
  const description = book.description?.trim();
  const rows = bookDetailRows(book)
    .map(
      ([label, value]) => `
        <div class="book-detail-row">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>`
    )
    .join("");

  return `
    <article class="book-detail-card">
      <div class="book-detail-header">
        <span class="book-detail-spine" style="background:${escapeHtml(book.color || "#8a7358")}"></span>
        <div>
          <p class="book-detail-kicker">${escapeHtml(I18n.t("booksTitle"))}</p>
          <h1>${escapeHtml(book.title)}</h1>
        </div>
      </div>
      <dl class="book-detail-meta">${rows}</dl>
      ${
        description
          ? `<section class="book-detail-description">
              <h2>${escapeHtml(I18n.t("bookDetailDescription"))}</h2>
              <p>${escapeHtml(description)}</p>
            </section>`
          : ""
      }
    </article>`;
}

export function renderBookDetailNotFoundMarkup() {
  return `
    <article class="book-detail-card">
      <h1>${escapeHtml(I18n.t("bookDetailNotFound"))}</h1>
      <p class="book-detail-muted">${escapeHtml(I18n.t("bookDetailNotFoundHint"))}</p>
    </article>`;
}

export function buildBookDetailUrl(bookId, lang = I18n.lang) {
  const url = new URL("book-detail.html", window.location.href);
  url.searchParams.set("id", String(bookId));
  if (lang && lang !== "en") url.searchParams.set("lang", lang);
  return url.toString();
}
