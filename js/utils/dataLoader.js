import { isKnownRuleName, resolveRule, VALID_SORT_KEYS } from "./rules.js";
import { fetchBooksFromApi, mergeApiBooksIntoLocalCatalog } from "./apiBooks.js";

const DATA_SOURCE = {
  booksUrl: "data/books.json",
  levelsUrl: "data/levels.json",
};

let _booksCache = null;
let _levelsCache = null;
let _schemaValidated = false;

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  }
  return res.json();
}

async function fetchBooks() {
  const localBooks = await fetchJSON(DATA_SOURCE.booksUrl);
  try {
    const apiBooks = await fetchBooksFromApi();
    const merged = mergeApiBooksIntoLocalCatalog(localBooks, apiBooks);
    if (apiBooks.length > 0) {
      console.info(`[books-api] loaded ${apiBooks.length} real books from the API`);
    }
    return merged;
  } catch (err) {
    console.warn("[books-api] falling back to local books.json:", err);
    return localBooks;
  }
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
  await validateSchemasOnce();
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

function readRuleKeys(ruleSpec) {
  return resolveRule(ruleSpec).keys.map((k) => k.key);
}

function validateBooksSchema(books) {
  const warns = [];
  const ids = new Set();
  books.forEach((b, i) => {
    const row = i + 1;
    if (typeof b.id !== "number") warns.push(`[books] row ${row}: missing numeric id`);
    else if (ids.has(b.id)) warns.push(`[books] duplicate id: ${b.id}`);
    else ids.add(b.id);

    if (!b.title) warns.push(`[books] id ${b.id ?? "?"}: missing title`);
    if (!b.author) warns.push(`[books] id ${b.id ?? "?"}: missing author`);
    if (!b.genre) warns.push(`[books] id ${b.id ?? "?"}: missing genre`);
    if (!Number.isFinite(b.year)) warns.push(`[books] id ${b.id ?? "?"}: invalid year`);
    if (!["small", "medium", "large"].includes(String(b.size).toLowerCase())) {
      warns.push(`[books] id ${b.id ?? "?"}: invalid size "${b.size}"`);
    }
    if (!/^#?[0-9a-fA-F]{6}$/.test(String(b.color ?? ""))) {
      warns.push(`[books] id ${b.id ?? "?"}: invalid color "${b.color}"`);
    }
    if (!Number.isFinite(b.pages) || b.pages <= 0) {
      warns.push(`[books] id ${b.id ?? "?"}: invalid pages "${b.pages}"`);
    }
  });
  return { warns, ids };
}

function validateRuleSpec(ruleSpec, context, warns) {
  if (typeof ruleSpec === "string" && !isKnownRuleName(ruleSpec)) {
    warns.push(`${context}: unknown rule "${ruleSpec}"`);
    return;
  }
  const keys = readRuleKeys(ruleSpec);
  if (keys.length === 0) {
    warns.push(`${context}: rule has no valid sort keys`);
    return;
  }
  keys.forEach((k) => {
    if (!VALID_SORT_KEYS.includes(k)) {
      warns.push(`${context}: unknown sort key "${k}"`);
    }
  });
}

function validateBookIds(bookIds, knownIds, context, warns) {
  if (!Array.isArray(bookIds) || bookIds.length === 0) {
    warns.push(`${context}: missing books array`);
    return;
  }
  bookIds.forEach((id) => {
    if (!knownIds.has(id)) warns.push(`${context}: unknown book id ${id}`);
  });
}

function validateLevelsSchema(levels, knownBookIds) {
  const warns = [];
  const seenLevels = new Set();
  levels.forEach((lvl) => {
    const levelNo = lvl.level;
    if (!Number.isFinite(levelNo)) {
      warns.push("[levels] entry without numeric level");
      return;
    }
    if (seenLevels.has(levelNo)) warns.push(`[levels] duplicate level number: ${levelNo}`);
    seenLevels.add(levelNo);

    const hasZones = Array.isArray(lvl.zones);
    if (hasZones) {
      if (lvl.zones.length === 0) warns.push(`[levels] L${levelNo}: zones array is empty`);
      lvl.zones.forEach((z, i) => {
        const ctx = `[levels] L${levelNo} zone ${i + 1}`;
        validateRuleSpec(buildRuleSpec(z), ctx, warns);
        validateBookIds(z.books, knownBookIds, ctx, warns);
      });
    } else {
      const ctx = `[levels] L${levelNo}`;
      validateRuleSpec(buildRuleSpec(lvl), ctx, warns);
      validateBookIds(lvl.books, knownBookIds, ctx, warns);
    }
  });
  return warns;
}

async function validateSchemasOnce() {
  if (_schemaValidated) return;
  const [books, levels] = await Promise.all([loadBooks(), Promise.resolve(_levelsCache ?? [])]);
  const { warns: bookWarns, ids } = validateBooksSchema(books);
  const levelWarns = validateLevelsSchema(levels, ids);
  const warns = [...bookWarns, ...levelWarns];
  if (warns.length > 0) {
    console.warn(
      `[schema] validation found ${warns.length} issue(s):\n` +
        warns.map((w) => `- ${w}`).join("\n")
    );
  } else {
    console.info("[schema] books.json and levels.json validation OK");
  }
  _schemaValidated = true;
}

export async function getLevelWithBooks(levelNumber) {
  const [levels, byId] = await Promise.all([loadLevels(), getBooksById()]);
  const def = levels.find((l) => l.level === levelNumber);
  if (!def) return null;

  let zones;
  if (def.zones) {
    zones = def.zones.map((z) => ({
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
