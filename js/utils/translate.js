const CACHE_PREFIX = "lc:translation:";
const CHUNK_SIZE = 450;

function hashString(value) {
  let hash = 0;
  const str = String(value ?? "");
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function cacheKey(text, sourceLang, targetLang) {
  return `${CACHE_PREFIX}${sourceLang}:${targetLang}:${hashString(text)}`;
}

function readCache(text, sourceLang, targetLang) {
  try {
    return sessionStorage.getItem(cacheKey(text, sourceLang, targetLang));
  } catch {
    return null;
  }
}

function writeCache(text, sourceLang, targetLang, translated) {
  try {
    sessionStorage.setItem(cacheKey(text, sourceLang, targetLang), translated);
  } catch {
    // Ignore quota errors.
  }
}

export function shouldOfferTranslation(targetLang, hasDescription = true, sourceLang = "en") {
  return Boolean(hasDescription) && targetLang !== sourceLang;
}

export function splitTextForTranslation(text, maxLen = CHUNK_SIZE) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const chunks = [];
  let remaining = trimmed;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf(". ", maxLen);
    if (cut < maxLen * 0.4) cut = remaining.lastIndexOf(" ", maxLen);
    if (cut <= 0) cut = maxLen;
    else cut += remaining[cut] === "." ? 1 : 0;

    const piece = remaining.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function fetchChunk(text, sourceLang, targetLang) {
  const langpair = `${sourceLang}|${targetLang}`;
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", langpair);

  const res = await fetch(url.toString(), { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Translation failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (data.responseStatus && Number(data.responseStatus) !== 200) {
    throw new Error(data.responseDetails || "Translation unavailable");
  }

  const translated = data.responseData?.translatedText?.trim();
  if (!translated) {
    throw new Error("Empty translation response");
  }
  return translated;
}

export async function translateText(text, targetLang, sourceLang = "en") {
  const trimmed = String(text ?? "").trim();
  if (!trimmed || targetLang === sourceLang) return trimmed;

  const cached = readCache(trimmed, sourceLang, targetLang);
  if (cached) return cached;

  const chunks = splitTextForTranslation(trimmed);
  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await fetchChunk(chunk, sourceLang, targetLang));
  }

  const translated = translatedChunks.join(chunks.length > 1 ? " " : "");
  writeCache(trimmed, sourceLang, targetLang, translated);
  return translated;
}
