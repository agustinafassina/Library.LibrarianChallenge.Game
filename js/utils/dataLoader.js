const DATA_SOURCE = {
  booksUrl: "data/books.json",
  levelsUrl: "data/levels.json",
};

let _booksCache = null;
let _levelsCache = null;

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  }
  return res.json();
}

async function fetchBooks() {
  return fetchJSON(DATA_SOURCE.booksUrl);
}

async function fetchLevels() {
  return fetchJSON(DATA_SOURCE.levelsUrl);
}

export async function loadBooks() {
  if (!_booksCache) _booksCache = await fetchBooks();
  return _booksCache;
}

export async function loadLevels() {
  if (!_levelsCache) {
    const levels = await fetchLevels();
    _levelsCache = [...levels].sort((a, b) => a.level - b.level);
  }
  return _levelsCache;
}

export async function getBooksById() {
  const books = await loadBooks();
  const map = new Map();
  for (const b of books) map.set(b.id, b);
  return map;
}

export async function getLevelWithBooks(levelNumber) {
  const [levels, byId] = await Promise.all([loadLevels(), getBooksById()]);
  const def = levels.find((l) => l.level === levelNumber);
  if (!def) return null;

  const books = def.books
    .map((id) => byId.get(id))
    .filter(Boolean);

  return { ...def, books };
}

export async function getLevelCount() {
  const levels = await loadLevels();
  return levels.length;
}
