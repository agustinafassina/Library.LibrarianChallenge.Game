import { COLORS } from "./ui.js";

const GOLD = "#d9a441";
const CREAM = "#f3e3c3";
const DISTANT_COLORS = [0x7a4fc6, 0xc64f9e, 0xd9a441, 0x4f86c6, 0xc64f5b, 0x5bbf6a, 0x8a5a2b, 0x73bfe6];

function hash32(value) {
  let hash = 2166136261;
  const str = String(value ?? "");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hexToRgb(hex) {
  const raw = String(hex || "#8a5a2b").replace("#", "");
  const n = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "0");
  const v = Number.parseInt(n.slice(0, 6), 16) || 0x8a5a2b;
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function shadeHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const t = (c) => Math.max(0, Math.min(255, Math.round(c + amount)));
  return `rgb(${t(r)}, ${t(g)}, ${t(b)})`;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function bookFaceSize(book, maxW, maxH) {
  const size = String(book?.size || "medium").toLowerCase();
  const hScale = size === "small" ? 0.78 : size === "large" ? 1 : 0.9;
  const wScale = size === "small" ? 0.9 : size === "large" ? 1 : 0.95;
  return {
    w: Math.max(52, Math.round(maxW * wScale)),
    h: Math.max(70, Math.round(maxH * hScale)),
  };
}

function wrapWords(ctx, text, maxWidth, maxLines, useEllipsis) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let line = "";

  const flush = () => {
    if (line) {
      lines.push(line);
      line = "";
    }
  };

  const splitWord = (word) => {
    let chunk = "";
    for (const ch of word) {
      if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    return chunk;
  };

  for (const raw of words) {
    let word = raw;
    if (ctx.measureText(word).width > maxWidth) word = splitWord(word);
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      flush();
      line = word;
    }
  }
  flush();

  if (useEllipsis && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines.slice(0, maxLines);
}

function fitCoverText(ctx, text, maxWidth, maxLines, maxSize, minSize) {
  for (let size = maxSize; size >= minSize; size -= 1) {
    ctx.font = `bold ${size}px Trebuchet MS, Segoe UI, sans-serif`;
    const lines = wrapWords(ctx, text, maxWidth, 20, false);
    if (lines.length <= maxLines) return { lines, size };
  }
  ctx.font = `bold ${minSize}px Trebuchet MS, Segoe UI, sans-serif`;
  return { lines: wrapWords(ctx, text, maxWidth, maxLines, true), size: minSize };
}

function paintCaption(ctx, lines, x, y, size, ink) {
  ctx.font = `bold ${size}px Trebuchet MS, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const lh = Math.round(size * 1.18);
  lines.forEach((line, i) => {
    const yy = y + i * lh;
    ctx.fillStyle = "rgba(20,12,8,0.45)";
    ctx.fillText(line, x, yy + 1);
    ctx.fillStyle = ink;
    ctx.fillText(line, x, yy);
  });
  return lines.length * lh;
}

function paintRibbon(ctx, w) {
  const rx = Math.round(w * 0.68);
  ctx.fillStyle = "#c64f5b";
  ctx.beginPath();
  ctx.moveTo(rx, 0);
  ctx.lineTo(rx + 8, 0);
  ctx.lineTo(rx + 8, 18);
  ctx.lineTo(rx + 4, 14);
  ctx.lineTo(rx, 18);
  ctx.closePath();
  ctx.fill();
}

export function bookSpineTextureKey(book, w, h, extras = {}) {
  const id = book?.id ?? book?.title ?? "x";
  const color = String(book?.color || "none").replace("#", "");
  const title = String(extras.title ?? book?.title ?? "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 24);
  const sub = String(extras.subtitle ?? "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 16);
  return `spine-v6-${id}-${Math.round(w)}x${Math.round(h)}-${color}-${title}-${sub}`;
}

export function ensureBookSpineTexture(scene, book, width, height, extras = {}) {
  const w = Math.max(8, Math.round(width));
  const h = Math.max(16, Math.round(height));
  const title = extras.title ?? book?.title ?? "";
  const subtitle = extras.subtitle ?? "";
  const key = bookSpineTextureKey(book, w, h, { title, subtitle });
  if (scene.textures.exists(key)) return key;

  const dpr = 2;
  const cw = w * dpr;
  const ch = h * dpr;
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.scale(dpr, dpr);

  const fill = book?.color || "#8a5a2b";
  const seed = hash32(`${book?.id ?? ""}:${book?.title ?? ""}:${w}x${h}`);
  const bindW = Math.max(8, Math.round(w * 0.14));
  const radius = 5;
  const ink = "#f3e3c3";

  ctx.save();
  roundedRectPath(ctx, 1, 1, w - 2, h - 2, radius);
  ctx.clip();

  ctx.fillStyle = shadeHex(fill, (seed % 5 - 2) * 6);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(bindW, 0, 5, h);

  ctx.fillStyle = shadeHex(fill, -50);
  ctx.fillRect(0, 0, bindW, h);

  ctx.fillStyle = CREAM;
  ctx.fillRect(w - 4, 7, 3, h - 14);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(w - 5, 7, 1, h - 14);

  if (seed % 4 === 0) paintRibbon(ctx, w);

  ctx.fillStyle = GOLD;
  ctx.fillRect(3, Math.round(h * 0.42), bindW - 6, 3);
  ctx.fillRect(3, Math.round(h * 0.58), bindW - 6, 3);

  const textW = w - bindW - 14;
  const textX = bindW + (w - bindW) / 2;
  const titleFit = fitCoverText(ctx, title, textW, 4, Math.round(Math.min(14, w * 0.13)), 9);
  paintCaption(ctx, titleFit.lines, textX, 12, titleFit.size, ink);

  if (subtitle) {
    const subFit = fitCoverText(ctx, subtitle, textW, 2, Math.round(Math.min(11, w * 0.1)), 8);
    paintCaption(ctx, subFit.lines, textX, h - 12 - subFit.lines.length * Math.round(subFit.size * 1.18), subFit.size, ink);
  }

  ctx.restore();

  ctx.strokeStyle = "#2c1d14";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, 1.2, 1.2, w - 2.4, h - 2.4, radius);
  ctx.stroke();

  tex.refresh();
  return key;
}

function drawDistantBooks(g, shelfY, width) {
  const leftEnd = width * 0.18;
  const rightStart = width * 0.82;
  let x = 24;
  let i = 0;
  while (x < width - 24) {
    const inQuietMid = x > leftEnd && x < rightStart;
    if (!inQuietMid && i % 2 === 0) {
      const bw = 8 + ((x * 17 + i * 11) % 6);
      const bh = 16 + ((x * 9 + i * 5) % 12);
      g.fillStyle(DISTANT_COLORS[i % DISTANT_COLORS.length], 0.1);
      g.fillRect(x, shelfY - bh, bw, bh);
    }
    x += 14 + (i % 5);
    i += 1;
    if (i % 7 === 0) x += 28;
  }
}

export function fillLibraryRoom(scene) {
  const { width, height } = scene.scale;
  const g = scene.add.graphics().setDepth(-20);

  g.fillStyle(0x24160f, 1);
  g.fillRect(0, 0, width, height);

  const plankH = 36;
  for (let y = 0, row = 0; y < height; y += plankH, row += 1) {
    g.fillStyle(row % 2 === 0 ? 0x2e1d14 : 0x2a1a12, 1);
    g.fillRect(0, y, width, plankH - 1);
    g.fillStyle(0x1a100c, 0.35);
    g.fillRect(0, y + plankH - 1, width, 1);
  }

  const gap = Math.max(88, Math.round(height * 0.2));
  for (let y = Math.round(height * 0.22); y < height - 48; y += gap) {
    g.fillStyle(COLORS.wood, 0.28);
    g.fillRect(0, y, width, 7);
    g.fillStyle(COLORS.woodDark, 0.4);
    g.fillRect(0, y + 7, width, 3);
    drawDistantBooks(g, y, width);
  }

  g.fillStyle(0x000000, 0.22);
  g.fillRect(0, 0, width, 28);
  g.fillRect(0, height - 22, width, 22);
  return g;
}

export function drawShelfPlank(g, x, y, w, boardH) {
  const lip = Math.max(9, Math.round(boardH * 0.7));
  g.fillStyle(0x8a5a2b, 1);
  g.fillRect(x, y, w, boardH);
  g.fillStyle(0xc4a574, 0.4);
  g.fillRect(x, y, w, 2);
  g.fillStyle(0x6b4423, 0.28);
  for (let i = 10; i < w - 8; i += 17) {
    g.fillRect(x + i, y + 2, 2, boardH - 3);
  }
  g.fillStyle(0x5a3a1c, 1);
  g.fillRect(x, y + boardH, w, lip);
  g.fillStyle(0x3d2714, 1);
  g.fillRect(x, y + boardH + lip, w, 3);
  g.fillStyle(0xc4a574, 0.22);
  g.fillRect(x, y + boardH, w, 1);
  g.fillStyle(0x000000, 0.28);
  g.fillRect(x + 3, y + boardH + lip + 3, w - 6, 5);
}
