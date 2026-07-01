const KEY_EXTRACTORS = {
  title: (b) => String(b.title).toLowerCase(),
  author: (b) => String(b.author).toLowerCase(),
  genre: (b) => String(b.genre).toLowerCase(),
  year: (b) => Number(b.year),
  size: (b) => SIZE_ORDER[String(b.size).toLowerCase()] ?? 99,
  pages: (b) => Number(b.pages),
  color: (b) => hexToHue(b.color),
};

const SIZE_ORDER = { small: 0, medium: 1, large: 2 };

function hexToHue(hex) {
  const h = String(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

const KEY_LABELS = {
  title: "Title",
  author: "Author",
  genre: "Genre",
  year: "Year",
  size: "Size",
  pages: "Pages",
  color: "Color",
};

// Predefined named rules. Each `keys` entry is a key token (see parseKeyToken).
const RULES = {
  title_az: {
    label: "Title A\u2013Z",
    keys: ["title"],
  },
  author_az: {
    label: "Author A\u2013Z",
    keys: ["author", "title"],
  },
  genre_az: {
    label: "Genre A\u2013Z",
    keys: ["genre", "title"],
  },
  year_asc: {
    label: "Year (oldest first)",
    keys: ["year", "title"],
  },
  year_desc: {
    label: "Year (newest first)",
    keys: ["year:desc", "title"],
  },
  genre_then_title: {
    label: "Genre A\u2013Z, then Title A\u2013Z",
    keys: ["genre", "title"],
  },
  title_za: {
    label: "Title Z\u2013A",
    keys: ["title:desc"],
  },
  author_za: {
    label: "Author Z\u2013A",
    keys: ["author:desc", "title"],
  },
  size_asc: {
    label: "Size (small to large)",
    keys: ["size", "title"],
  },
  size_desc: {
    label: "Size (large to small)",
    keys: ["size:desc", "title"],
  },
  color_rainbow: {
    label: "Color (rainbow)",
    keys: ["color", "title"],
  },
  pages_asc: {
    label: "Pages (fewest first)",
    keys: ["pages", "title"],
  },
  pages_desc: {
    label: "Pages (most first)",
    keys: ["pages:desc", "title"],
  },
};

/**
 * Parse a single key token into { key, dir }.
 * Accepted forms:
 *   "year"                       → ascending
 *   "year:desc" / "year:asc"     → explicit direction
 *   "-year"                      → shorthand for descending
 *   { key: "year", dir: "desc" } → object form
 */
function parseKeyToken(token) {
  if (token && typeof token === "object") {
    return { key: token.key, dir: token.dir === "desc" || token.dir === -1 ? -1 : 1 };
  }
  let key = String(token);
  let dir = 1;
  if (key.startsWith("-")) {
    dir = -1;
    key = key.slice(1);
  } else if (key.includes(":")) {
    const [k, d] = key.split(":");
    key = k;
    dir = d === "desc" ? -1 : 1;
  }
  return { key, dir };
}

/**
 * Normalise any rule reference into { keys: [{key, dir}], label, label_es }.
 * A rule can be:
 *   - a string naming a predefined RULE ("title_az")
 *   - an array of key tokens (["genre", "-year", "title"])
 *   - an object { keys: [...], label?, label_es? }
 */
export function resolveRule(rule) {
  if (Array.isArray(rule)) {
    return { keys: rule.map(parseKeyToken), label: null, label_es: null };
  }
  if (rule && typeof rule === "object") {
    return {
      keys: (rule.keys ?? []).map(parseKeyToken),
      label: rule.label ?? null,
      label_es: rule.label_es ?? null,
    };
  }
  const def = RULES[rule];
  if (!def) {
    console.warn("[rules] unknown rule:", rule);
    return { keys: [], label: typeof rule === "string" ? rule : null, label_es: null };
  }
  return { keys: def.keys.map(parseKeyToken), label: def.label, label_es: null };
}

function compareByKeys(a, b, keys) {
  for (const { key, dir } of keys) {
    const extract = KEY_EXTRACTORS[key];
    if (!extract) continue;
    const va = extract(a);
    const vb = extract(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
  }
  return 0;
}

function describeKeys(keys) {
  return keys
    .map(({ key, dir }) => {
      const base = KEY_LABELS[key] ?? key;
      return `${base} ${dir === -1 ? "\u2193" : "\u2191"}`;
    })
    .join(", ");
}

export function getRuleLabel(rule) {
  const resolved = resolveRule(rule);
  if (resolved.label) return resolved.label;
  if (resolved.keys.length) return describeKeys(resolved.keys);
  return typeof rule === "string" ? rule : "Custom order";
}

export function getExpectedOrder(books, rule) {
  const { keys } = resolveRule(rule);
  return [...books].sort((a, b) => compareByKeys(a, b, keys));
}

export function evaluateOrder(currentBooks, rule) {
  const { keys } = resolveRule(rule);
  const expected = getExpectedOrder(currentBooks, rule);

  const perSlot = currentBooks.map(
    (book, i) => compareByKeys(book, expected[i], keys) === 0
  );

  return {
    perSlot,
    solved: perSlot.every(Boolean),
    expected,
  };
}
