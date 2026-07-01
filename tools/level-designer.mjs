#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getExpectedOrder,
  isKnownRuleName,
  resolveRule,
  VALID_SORT_KEYS,
} from "../js/utils/rules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BOOKS_PATH = path.join(ROOT, "data", "books.json");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function usage() {
  console.log(`
Level Designer (preview + JSON snippet)

Usage:
  npm run level:preview -- --level 63 --title "My Level" --title_es "Mi nivel" --rule title_az --books 4,1,3,2
  npm run level:preview -- --level 64 --title "Custom" --title_es "Custom" --keys genre,year:desc,title --books 3,18,4,6,1,7

Optional:
  --hint "..."
  --hint_es "..."
  --challengeMoves 16
  --challengeTimeSec 85
  --out data/level-draft.json   (writes generated JSON)
  --list                        (prints all books with ids)
`);
}

function parseList(value) {
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBookIds(raw) {
  const ids = parseList(raw).map((n) => Number(n));
  if (ids.some((n) => !Number.isFinite(n))) {
    throw new Error("Invalid --books list. Use comma-separated numeric ids.");
  }
  return ids;
}

function parseKeys(raw) {
  const tokens = parseList(raw);
  if (!tokens.length) throw new Error("--keys is empty.");
  const keyNames = resolveRule(tokens).keys.map((k) => k.key);
  const invalid = keyNames.filter((k) => !VALID_SORT_KEYS.includes(k));
  if (invalid.length) {
    throw new Error(`Unknown sort key(s): ${invalid.join(", ")}. Valid keys: ${VALID_SORT_KEYS.join(", ")}`);
  }
  return tokens;
}

function readBooks() {
  return JSON.parse(fs.readFileSync(BOOKS_PATH, "utf8"));
}

function listBooks(books) {
  books.forEach((b) => {
    console.log(
      `${String(b.id).padStart(2, " ")} | ${b.title} | ${b.author} | ${b.genre} | ${b.year} | ${b.size} | ${b.pages}p`
    );
  });
}

function main() {
  const args = parseArgs(process.argv);
  const books = readBooks();

  if (args.help || args.h) {
    usage();
    return;
  }

  if (args.list) {
    listBooks(books);
    return;
  }

  const level = Number(args.level);
  if (!Number.isFinite(level)) {
    throw new Error("Missing/invalid --level");
  }
  if (!args.title || !args.title_es) {
    throw new Error("Missing --title and/or --title_es");
  }
  if (!args.books) {
    throw new Error("Missing --books (comma-separated ids)");
  }
  if (!args.rule && !args.keys) {
    throw new Error("Provide either --rule <name> or --keys <k1,k2,...>");
  }
  if (args.rule && args.keys) {
    throw new Error("Use only one: --rule OR --keys");
  }

  const byId = new Map(books.map((b) => [b.id, b]));
  const ids = parseBookIds(args.books);
  const selected = ids.map((id) => byId.get(id));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(`Unknown book id(s): ${missing.join(", ")}`);
  }

  let ruleSpec;
  if (args.rule) {
    if (!isKnownRuleName(args.rule)) {
      throw new Error(`Unknown --rule "${args.rule}"`);
    }
    ruleSpec = args.rule;
  } else {
    ruleSpec = { keys: parseKeys(args.keys) };
  }

  const expected = getExpectedOrder(selected, ruleSpec);

  console.log(`\nSelected books (${selected.length}):`);
  selected.forEach((b) =>
    console.log(`- ${b.id}: ${b.title} (${b.author}, ${b.genre}, ${b.year}, ${b.size}, ${b.pages}p)`)
  );

  console.log("\nExpected order:");
  expected.forEach((b, i) => console.log(`${String(i + 1).padStart(2, " ")}. ${b.id} - ${b.title}`));

  const levelObj = {
    level,
    ...(args.rule ? { rule: args.rule } : { keys: parseKeys(args.keys) }),
    title: args.title,
    title_es: args.title_es,
    hint: args.hint || "",
    hint_es: args.hint_es || "",
    books: ids,
  };

  const challenge = {};
  if (args.challengeMoves) challenge.maxMoves = Number(args.challengeMoves);
  if (args.challengeTimeSec) challenge.maxTimeSec = Number(args.challengeTimeSec);
  if (Object.keys(challenge).length) levelObj.challenge = challenge;

  const json = JSON.stringify(levelObj, null, 2);
  console.log("\nGenerated JSON snippet:\n");
  console.log(json);

  if (args.out) {
    const outPath = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
    fs.writeFileSync(outPath, json + "\n");
    console.log(`\nSaved to: ${outPath}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`\n[level-designer] ${err.message}`);
  usage();
  process.exit(1);
}
