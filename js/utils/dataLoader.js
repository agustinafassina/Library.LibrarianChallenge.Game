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

function buildRuleSpec(src) {
  if (Array.isArray(src.keys) && src.keys.length) {
    return {
      keys: src.keys,
      label: src.ruleLabel ?? null,
      label_es: src.ruleLabel_es ?? null,
    };
  }
  return src.rule;
}

export async function getLevelWithBooks(levelNumber) {
  const [levels, byId] = await Promise.all([loadLevels(), getBooksById()]);
  const def = levels.find((l) => l.level === levelNumber);
  if (!def) return null;

  let zones;
  if (def.zones) {    zones = def.zones.map((z) => ({
      ...z,
      rule: buildRuleSpec(z),
      books: (z.books ?? []).map((id) => byId.get(id)).filter(Boolean),
    }));
  } else {
    zones = [
      {
        rule: buildRuleSpec(def),
        label: null,
        label_es: null,
        books: (def.books ?? []).map((id) => byId.get(id)).filter(Boolean),
      },
    ];
  }

  const books = zones.flatMap((z) => z.books);

  return { ...def, zones, books };
}

export async function getLevelCount() {
  const levels = await loadLevels();
  return levels.length;
}
