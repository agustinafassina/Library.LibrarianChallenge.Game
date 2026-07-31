import { loadBooks } from "./utils/dataLoader.js";
import { I18n } from "./utils/i18n.js";
import {
  escapeHtml,
  renderBookDetailMarkup,
  renderBookDetailNotFoundMarkup,
} from "./utils/bookDetail.js";

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const id = Number.parseInt(params.get("id") ?? "", 10);
  const lang = params.get("lang");
  return { id, lang };
}

async function main() {
  const root = document.getElementById("book-detail-root");
  const { id, lang } = readParams();

  if (lang && I18n.available.some((entry) => entry.code === lang)) {
    I18n.set(lang);
  }

  if (!Number.isFinite(id)) {
    root.innerHTML = renderBookDetailNotFoundMarkup();
    document.title = I18n.t("bookDetailNotFound");
    return;
  }

  try {
    const books = await loadBooks();
    const book = books.find((entry) => entry.id === id);
    if (!book) {
      root.innerHTML = renderBookDetailNotFoundMarkup();
      document.title = I18n.t("bookDetailNotFound");
      return;
    }
    root.innerHTML = renderBookDetailMarkup(book);
    document.title = `${book.title} — ${I18n.t("booksTitle")}`;
  } catch (err) {
    console.error(err);
    root.innerHTML = `<article class="book-detail-card"><p>${escapeHtml(I18n.t("booksError"))}</p></article>`;
  }
}

main();