import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapApiBookToGameBook, uniqueBySourceId } from "../js/utils/apiBooks.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const booksPath = path.join(root, "data/books.json");

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const inputPath = process.argv[2];
const startId = Number.parseInt(readArg("start-id", "1"), 10);

if (!inputPath) {
  console.error("Usage: node tools/import-real-books.mjs <api-books.json> [--start-id=1]");
  process.exit(1);
}

if (!Number.isFinite(startId) || startId < 1) {
  console.error("Invalid --start-id value.");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const apiBooks = Array.isArray(payload) ? payload : payload.books ?? [];
const existing = JSON.parse(fs.readFileSync(booksPath, "utf8"));

const mapped = uniqueBySourceId(apiBooks)
  .filter((book) => book?.title)
  .map((book, index) => mapApiBookToGameBook(book, startId + index));

if (mapped.length === 0) {
  console.error("No books to import.");
  process.exit(1);
}

const merged = [...existing];
mapped.forEach((book) => {
  const index = merged.findIndex((entry) => entry.id === book.id);
  if (index >= 0) merged[index] = book;
  else merged.push(book);
});
merged.sort((a, b) => a.id - b.id);

fs.writeFileSync(booksPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

const endId = startId + mapped.length - 1;
console.log(
  `Updated ${booksPath}: imported ${mapped.length} real books into ids ${startId}-${endId} (${merged.length} total).`
);
