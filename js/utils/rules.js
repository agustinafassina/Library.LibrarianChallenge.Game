const KEY_EXTRACTORS = {
  title: (b) => String(b.title).toLowerCase(),
  author: (b) => String(b.author).toLowerCase(),
  genre: (b) => String(b.genre).toLowerCase(),
  year: (b) => Number(b.year),
};

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
  genre_then_title: {
    label: "Genre A\u2013Z, then Title A\u2013Z",
    keys: ["genre", "title"],
  },
};

function compareByKeys(a, b, keys) {
  for (const key of keys) {
    const extract = KEY_EXTRACTORS[key];
    const va = extract(a);
    const vb = extract(b);
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

export function getRuleLabel(rule) {
  return RULES[rule]?.label ?? rule;
}

export function getExpectedOrder(books, rule) {
  const def = RULES[rule];
  if (!def) {
    console.warn("[rules] unknown rule:", rule);
    return [...books];
  }
  return [...books].sort((a, b) => compareByKeys(a, b, def.keys));
}

export function evaluateOrder(currentBooks, rule) {
  const expected = getExpectedOrder(currentBooks, rule);

  const def = RULES[rule] ?? { keys: [] };
  const perSlot = currentBooks.map(
    (book, i) => compareByKeys(book, expected[i], def.keys) === 0
  );

  return {
    perSlot,
    solved: perSlot.every(Boolean),
    expected,
  };
}
