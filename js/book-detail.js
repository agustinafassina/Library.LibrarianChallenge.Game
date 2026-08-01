import { loadBooks } from "./utils/dataLoader.js";
import { I18n } from "./utils/i18n.js";
import {
  escapeHtml,
  renderBookDetailMarkup,
  renderBookDetailNotFoundMarkup,
} from "./utils/bookDetail.js";
import { shouldOfferTranslation, translateText } from "./utils/translate.js";

function bindDescriptionTranslate(book) {
  const root = document.getElementById("book-detail-root");
  const btn = root?.querySelector('[data-action="translate"]');
  const para = root?.querySelector("#book-description-text");
  const description = book.description?.trim();
  if (!btn || !para || !description || !shouldOfferTranslation(I18n.lang, true)) return;

  let translated = null;
  let showingOriginal = true;
  let busy = false;

  btn.addEventListener("click", async () => {
    if (busy) return;

    if (!showingOriginal) {
      para.textContent = description;
      showingOriginal = true;
      btn.textContent = I18n.t("bookDetailTranslate");
      return;
    }

    if (translated) {
      para.textContent = translated;
      showingOriginal = false;
      btn.textContent = I18n.t("bookDetailShowOriginal");
      return;
    }

    busy = true;
    btn.disabled = true;
    btn.textContent = I18n.t("bookDetailTranslating");

    try {
      translated = await translateText(description, I18n.lang);
      para.textContent = translated;
      showingOriginal = false;
      btn.textContent = I18n.t("bookDetailShowOriginal");
    } catch (err) {
      console.error(err);
      btn.textContent = I18n.t("bookDetailTranslateError");
    } finally {
      busy = false;
      btn.disabled = false;
    }
  });
}

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
    bindDescriptionTranslate(book);
    document.title = `${book.title} — ${I18n.t("booksTitle")}`;
  } catch (err) {
    console.error(err);
    root.innerHTML = `<article class="book-detail-card"><p>${escapeHtml(I18n.t("booksError"))}</p></article>`;
  }
}

main();