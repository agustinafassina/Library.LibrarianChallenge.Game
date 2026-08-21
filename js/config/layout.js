function readCssPx(name) {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function getSafeInsets() {
  return {
    top: readCssPx("--sat"),
    right: readCssPx("--sar"),
    bottom: readCssPx("--sab"),
    left: readCssPx("--sal"),
  };
}

export const GAME_LAYOUT = Object.freeze({
  bookWMax: 102,
  bookHMax: 152,
  gapX: 14,
  gapY: 18,
  boardH: 14,
  maxPerRow: 6,
  maxRowsPerPage: 3,
  areaTopBase: 150,
  areaBottom: 620,
  leftReserved: 24,
  rightMargin: 24,
  rightGutter: 60,
});

export const LEVEL_SELECT_LAYOUT = Object.freeze({
  cols: 5,
  rowsPerPage: 4,
  perPage: 20,
  cellW: 174,
  cellH: 122,
  cardW: 150,
  cardH: 104,
  gridTop: 108,
  gridBottom: 580,
});

export function getUiLayout(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const safe = getSafeInsets();
  const portrait = h > w;
  const compact = w < 720;
  const stackedHud = portrait || w < 560;

  const topBarH = stackedHud ? Math.round(92 + safe.top) : Math.round(56 + safe.top);
  const bottomBarH = portrait ? Math.round(72 + safe.bottom) : 0;

  const maxPerRow = portrait ? (w < 360 ? 2 : 3) : w < 900 ? 5 : 6;
  const maxRowsPerPage = portrait ? 4 : 3;

  const bookWMax = w >= 1400 ? 140 : w >= 1100 ? 124 : w >= 800 ? 112 : 108;
  const bookHMax = Math.round(bookWMax * 1.49);

  const largeScreen = !portrait && (h >= 860 || w >= 1280);
  const librarianScale = portrait
    ? Math.min(0.36, Math.max(0.28, (Math.min(w, h) * 0.16) / 320))
    : Math.min(largeScreen ? 1.55 : 0.92, Math.max(0.5, (h * (largeScreen ? 0.46 : 0.30)) / 320));

  const leftReserved = portrait ? 16 : Math.max(24, Math.round(240 * librarianScale * 0.22));
  const rightMargin = portrait ? 16 : 24;
  const flipGutter = portrait ? Math.max(64, Math.round(w * 0.16)) : 60;
  const rightGutter = portrait ? Math.max(16, Math.round(flipGutter * 0.35)) : 60;
  const areaBottom = portrait ? h - bottomBarH : h - 24;
  const instructionY = topBarH + (stackedHud ? 6 : 18);
  const areaTopBase = instructionY + (stackedHud ? 48 : 56);
  const wrapPad = portrait ? 32 : 200;

  const lsCols = portrait ? 2 : w < 900 ? 3 : 5;
  const lsGridTop = Math.round((compact ? 88 : 108) + safe.top);
  const lsPagerH = Math.round(56 + safe.bottom);
  const lsGridBottom = h - lsPagerH;
  const lsCellH = portrait ? 118 : 122;
  const lsAvailH = Math.max(200, lsGridBottom - lsGridTop);
  const lsRowsPerPage = Math.max(2, Math.min(5, Math.floor(lsAvailH / lsCellH)));
  const lsCellW = Math.min(174, Math.floor((w - 32) / lsCols));
  const lsCardW = Math.min(150, lsCellW - 16);
  const lsCardH = Math.min(104, lsCellH - 16);

  return {
    width: w,
    height: h,
    safe,
    portrait,
    compact,
    stackedHud,
    topBarH,
    bottomBarH,
    maxPerRow,
    maxRowsPerPage,
    bookWMax,
    bookHMax,
    gapX: portrait ? 10 : GAME_LAYOUT.gapX,
    gapY: portrait ? 12 : GAME_LAYOUT.gapY,
    boardH: GAME_LAYOUT.boardH,
    leftReserved,
    rightMargin,
    rightGutter,
    flipGutter,
    areaTopBase,
    areaBottom,
    instructionY,
    hideLibrarian: false,
    librarianScale,
    sidePager: !portrait,
    instructionWrap: Math.max(160, w - wrapPad),
    challengeWrap: Math.max(160, w - (portrait ? 32 : 180)),
    panelMax: Math.min(460, w - 32),
    menuBtnW: portrait ? Math.min(320, w - 48) : 240,
    menuCx: portrait ? w / 2 : w * 0.34,
    levelSelect: {
      cols: lsCols,
      rowsPerPage: lsRowsPerPage,
      perPage: lsCols * lsRowsPerPage,
      cellW: lsCellW,
      cellH: lsCellH,
      cardW: lsCardW,
      cardH: lsCardH,
      gridTop: lsGridTop,
      gridBottom: lsGridBottom,
    },
  };
}
