const DEFAULT_API_BASE_URL = "http://localhost:5142";
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

const TAG_COLORS = {
  Lgbtiq: "#7a4fc6",
  Queer: "#c64f9e",
  Lesbian: "#d96f8a",
  Gay: "#4f86c6",
  Bisexual: "#8e6fc6",
  Trans: "#73bfe6",
  NonBinary: "#d9a441",
  Intersex: "#c6a84f",
  Feminism: "#c64f5b",
  Activism: "#5bbf6a",
};

function readRuntimeConfig() {
  const cfg = globalThis.LIBRARIAN_CHALLENGE_CONFIG ?? {};
  return {
    apiBaseUrl: (cfg.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, ""),
    apiKey: cfg.apiKey || "",
    tags: Array.isArray(cfg.bookTags) && cfg.bookTags.length ? cfg.bookTags : DEFAULT_TAGS,
    enabled: cfg.useApiBooks !== false,
    maxResults: Number.isFinite(cfg.maxResultsPerTag) ? cfg.maxResultsPerTag : 20,
    autoTag: cfg.autoTag !== false,
  };
}

async function fetchJson(url, apiKey) {
  const headers = apiKey ? { "X-API-Key": apiKey } : undefined;
  const res = await fetch(url, { cache: "no-cache", headers });
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  }
  return res.json();
}

function stableHash(value) {
  let hash = 0;
  const str = String(value ?? "");
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function uniqueBySourceId(books) {
  const seen = new Set();
  const unique = [];
  for (const book of books) {
    const key = `${book.source ?? "api"}:${book.externalId ?? book.id ?? book.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(book);
  }
  return unique;
}

function readBooksPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.books)) return payload.books;
  return [];
}

function parseYear(publishedDate, fallbackSeed) {
  const match = String(publishedDate ?? "").match(/\d{4}/);
  if (match) return Number(match[0]);
  return 1990 + (stableHash(fallbackSeed) % 36);
}

function derivePages(book) {
  const seed = `${book.externalId ?? book.id ?? ""}:${book.title ?? ""}`;
  return 120 + (stableHash(seed) % 430);
}

function deriveSize(pages) {
  if (pages < 240) return "small";
  if (pages < 390) return "medium";
  return "large";
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t)).filter(Boolean);
}

function pickGenre(book, tags) {
  const tagGenre = tags.map((t) => TAG_GENRES[t]).find(Boolean);
  if (tagGenre) return tagGenre;
  if (Array.isArray(book.categories) && book.categories.length) {
    return String(book.categories[0]).split("/")[0].trim() || "Literature";
  }
  return "Literature";
}

function pickColor(tags, seed) {
  const tagColor = tags.map((t) => TAG_COLORS[t]).find(Boolean);
  if (tagColor) return tagColor;

  const palette = [
    "#4f86c6",
    "#c64f5b",
    "#5bbf6a",
    "#d9a441",
    "#8e6fc6",
    "#4fc6b3",
    "#c64f9e",
    "#c6504f",
  ];
  return palette[stableHash(seed) % palette.length];
}

export function mapApiBookToGameBook(apiBook, id) {
  const tags = normalizeTags(apiBook.tags);
  const title = String(apiBook.title || "Untitled book");
  const author =
    Array.isArray(apiBook.authors) && apiBook.authors.length
      ? String(apiBook.authors[0])
      : "Unknown author";
  const year = parseYear(apiBook.publishedDate, title);
  const pages = Number.isFinite(apiBook.pages) ? Number(apiBook.pages) : derivePages(apiBook);

  return {
    id,
    title,
    author,
    genre: pickGenre(apiBook, tags),
    year,
    size: deriveSize(pages),
    color: pickColor(tags, title),
    pages,
    tags,
    source: apiBook.source ?? "Library.LibrarianChallenge.Game.Api",
    externalId: apiBook.externalId ?? null,
  };
}

export function mergeApiBooksIntoLocalCatalog(localBooks, apiBooks) {
  const mappedApiBooks = uniqueBySourceId(apiBooks)
    .filter((book) => book && book.title)
    .map((book, index) => mapApiBookToGameBook(book, index + 1));

  if (mappedApiBooks.length === 0) return localBooks;

  const merged = [...localBooks];
  mappedApiBooks.forEach((book, index) => {
    if (index < merged.length) {
      merged[index] = { ...book, id: merged[index].id };
    } else {
      merged.push({ ...book, id: index + 1 });
    }
  });
  return merged;
}

export async function fetchBooksFromApi() {
  const config = readRuntimeConfig();
  if (!config.enabled) return [];

  const responses = await Promise.allSettled(
    config.tags.map(async (tag) => {
      const params = new URLSearchParams({
        maxResults: String(config.maxResults),
        autoTag: String(config.autoTag),
      });
      const payload = await fetchJson(
        `${config.apiBaseUrl}/api/v1/Book/google/by-tag/${encodeURIComponent(tag)}?${params}`,
        config.apiKey
      );
      return readBooksPayload(payload).map((book) => ({
        ...book,
        tags: Array.isArray(book.tags) && book.tags.length ? book.tags : [tag],
      }));
    })
  );

  const books = [];
  responses.forEach((result, index) => {
    if (result.status === "fulfilled") {
      books.push(...result.value);
    } else if (result.status === "rejected") {
      console.warn(`[books-api] failed to load tag ${config.tags[index]}:`, result.reason);
    }
  });

  return uniqueBySourceId(books);
}
