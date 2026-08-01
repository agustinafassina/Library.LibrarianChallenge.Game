import { describe, expect, it } from "vitest";
import {
  shouldOfferTranslation,
  splitTextForTranslation,
  translateText,
} from "../js/utils/translate.js";

describe("translate.js", () => {
  it("offers translation when UI language differs from source", () => {
    expect(shouldOfferTranslation("es", true)).toBe(true);
    expect(shouldOfferTranslation("en", true)).toBe(false);
    expect(shouldOfferTranslation("es", false)).toBe(false);
  });

  it("splits long descriptions into chunks under the API limit", () => {
    const text = "Sentence one. Sentence two. Sentence three. ".repeat(20).trim();
    const chunks = splitTextForTranslation(text, 80);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 80)).toBe(true);
    expect(chunks.join(" ")).toContain("Sentence one.");
  });

  it("returns cached translations without calling fetch again", async () => {
    const originalFetch = globalThis.fetch;
    const originalStorage = globalThis.sessionStorage;
    const store = new Map();
    globalThis.sessionStorage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    };

    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return {
        ok: true,
        json: async () => ({
          responseStatus: 200,
          responseData: { translatedText: "Texto traducido." },
        }),
      };
    };

    const first = await translateText("Original text.", "es");
    const second = await translateText("Original text.", "es");

    expect(first).toBe("Texto traducido.");
    expect(second).toBe("Texto traducido.");
    expect(fetchCount).toBe(1);

    globalThis.fetch = originalFetch;
    globalThis.sessionStorage = originalStorage;
  });
});
