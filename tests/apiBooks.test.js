import { describe, expect, it } from "vitest";
import {
  fetchBooksFromApi,
  mapApiBookToGameBook,
  mergeApiBooksIntoLocalCatalog,
} from "../js/utils/apiBooks.js";

describe("apiBooks.js", () => {
  it("maps an API book into the game book shape", () => {
    const mapped = mapApiBookToGameBook(
      {
        title: "Sister Outsider",
        authors: ["Audre Lorde"],
        publishedDate: "1984-01-01",
        tags: ["Lesbian", "Activism"],
        source: "GoogleBooks",
        externalId: "abc",
      },
      10
    );

    expect(mapped).toMatchObject({
      id: 10,
      title: "Sister Outsider",
      author: "Audre Lorde",
      genre: "Lesbian",
      year: 1984,
      color: "#d96f8a",
      source: "GoogleBooks",
      externalId: "abc",
    });
    expect(["small", "medium", "large"]).toContain(mapped.size);
    expect(mapped.pages).toBeGreaterThan(0);
  });

  it("merges API books over local ids so existing levels still resolve", () => {
    const local = [
      {
        id: 1,
        title: "Local A",
        author: "A",
        genre: "Mystery",
        year: 2000,
        size: "small",
        color: "#000000",
        pages: 100,
      },
      {
        id: 2,
        title: "Local B",
        author: "B",
        genre: "Fantasy",
        year: 2001,
        size: "medium",
        color: "#111111",
        pages: 200,
      },
    ];
    const api = [
      {
        title: "Real Book",
        authors: ["Real Author"],
        publishedDate: "2020",
        tags: ["Queer"],
        source: "GoogleBooks",
        externalId: "g1",
      },
    ];

    const merged = mergeApiBooksIntoLocalCatalog(local, api);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      id: 1,
      title: "Real Book",
      author: "Real Author",
      genre: "Queer",
    });
    expect(merged[1]).toEqual(local[1]);
  });

  it("deduplicates API books by source and external id before merging", () => {
    const local = [
      {
        id: 1,
        title: "Local A",
        author: "A",
        genre: "Mystery",
        year: 2000,
        size: "small",
        color: "#000000",
        pages: 100,
      },
      {
        id: 2,
        title: "Local B",
        author: "B",
        genre: "Fantasy",
        year: 2001,
        size: "medium",
        color: "#111111",
        pages: 200,
      },
    ];
    const api = [
      { title: "Real Book", authors: ["Real Author"], source: "GoogleBooks", externalId: "g1" },
      {
        title: "Real Book Duplicate",
        authors: ["Real Author"],
        source: "GoogleBooks",
        externalId: "g1",
      },
    ];

    const merged = mergeApiBooksIntoLocalCatalog(local, api);

    expect(merged[0].title).toBe("Real Book");
    expect(merged[1]).toEqual(local[1]);
  });

  it("loads books from the Google by-tag endpoint response shape", async () => {
    const originalFetch = globalThis.fetch;
    const originalConfig = globalThis.LIBRARIAN_CHALLENGE_CONFIG;
    globalThis.LIBRARIAN_CHALLENGE_CONFIG = {
      apiBaseUrl: "http://localhost:5142",
      apiKey: "test-key",
      useApiBooks: true,
      bookTags: ["Bisexual"],
      maxResultsPerTag: 20,
      autoTag: true,
    };
    let requestedUrl = "";
    let requestedHeaders = {};
    globalThis.fetch = async (url, options) => {
      requestedUrl = String(url);
      requestedHeaders = options?.headers ?? {};
      return {
        ok: true,
        json: async () => ({
          count: 1,
          books: [{ title: "Real API Book", authors: ["Author"], source: "GoogleBooks" }],
        }),
      };
    };

    const books = await fetchBooksFromApi();

    expect(requestedUrl).toBe(
      "http://localhost:5142/api/v1/Book/google/by-tag/Bisexual?maxResults=20&autoTag=true"
    );
    expect(requestedHeaders["X-API-Key"]).toBe("test-key");
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ title: "Real API Book", tags: ["Bisexual"] });

    globalThis.fetch = originalFetch;
    globalThis.LIBRARIAN_CHALLENGE_CONFIG = originalConfig;
  });
});
