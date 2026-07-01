import { describe, expect, it } from "vitest";
import { evaluateOrder, getExpectedOrder, resolveRule } from "../js/utils/rules.js";

const BOOKS = [
  { id: 1, title: "Gamma", author: "Ada", genre: "History", year: 2001, size: "small", color: "#ff0000", pages: 120 },
  { id: 2, title: "Alpha", author: "Zoe", genre: "Fantasy", year: 2010, size: "large", color: "#00ff00", pages: 340 },
  { id: 3, title: "Beta", author: "Ada", genre: "Fantasy", year: 2005, size: "medium", color: "#0000ff", pages: 220 },
];

describe("rules.js", () => {
  it("orders by named rule title_az", () => {
    const ordered = getExpectedOrder(BOOKS, "title_az");
    expect(ordered.map((b) => b.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("orders by named rule year_desc", () => {
    const ordered = getExpectedOrder(BOOKS, "year_desc");
    expect(ordered.map((b) => b.year)).toEqual([2010, 2005, 2001]);
  });

  it("orders by custom combined keys from JSON style", () => {
    const ordered = getExpectedOrder(BOOKS, {
      keys: ["genre", "year:desc", "title"],
    });
    expect(ordered.map((b) => b.id)).toEqual([2, 3, 1]);
  });

  it("supports shorthand descending key with '-' prefix", () => {
    const ordered = getExpectedOrder(BOOKS, ["-title"]);
    expect(ordered.map((b) => b.title)).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("evaluateOrder returns solved=true for correctly ordered books", () => {
    const ordered = getExpectedOrder(BOOKS, "author_az");
    const result = evaluateOrder(ordered, "author_az");
    expect(result.solved).toBe(true);
    expect(result.perSlot.every(Boolean)).toBe(true);
  });

  it("evaluateOrder detects wrong slots when order is incorrect", () => {
    const wrong = [BOOKS[2], BOOKS[0], BOOKS[1]]; // Beta, Gamma, Alpha
    const result = evaluateOrder(wrong, "title_az");
    expect(result.solved).toBe(false);
    expect(result.perSlot).toEqual([false, false, false]);
  });

  it("resolveRule returns empty keys for unknown rule names", () => {
    const resolved = resolveRule("rule_that_does_not_exist");
    expect(resolved.keys).toEqual([]);
  });
});
