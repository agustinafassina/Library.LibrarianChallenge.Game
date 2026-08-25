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

function menuMetrics(w, h, safe, portrait, compact, shortLandscape, librarianScale) {
  const menuBtnW = portrait ? Math.min(320, w - 48) : 240;
  const menuCx = portrait ? w / 2 : Math.round(w * 0.34);
  const versionY = h - 10 - safe.bottom;

  if (portrait) {
    const edge = Math.max(safe.bottom, 16);
    const versionYPortrait = h - 22 - edge;
    const titleY = Math.round(60 + safe.top);
    const titleSize = compact ? 32 : 44;
    const subtitleY = titleY + 40;
    const tall = h >= 800;
    const mascotScale = Math.min(tall ? 0.64 : 0.46, Math.max(0.32, (h * (tall ? 0.26 : 0.18)) / 320));
    return {
      titleY,
      titleSize,
      subtitleY,
      buttonsY: subtitleY + 36,
      gap: 56,
      secH: 50,
      secW: Math.min(148, (menuBtnW - 12) / 2),
      secGapY: 12,
      versionY: versionYPortrait,
      mascotX: Math.round(w * (tall ? 0.56 : 0.78)),
      mascotY: Math.round(h - 48 - edge),
      mascotScale,
      mascotOriginY: 1,
      menuBtnW,
      menuCx,
    };
  }

  const titleY = shortLandscape ? Math.round(18 + safe.top) : Math.round(h * 0.18);
  const titleSize = shortLandscape ? 26 : compact ? 42 : 52;
  const subtitleY = shortLandscape ? titleY + 24 : Math.round(titleY + h * 0.07);
  const buttonsY = shortLandscape ? subtitleY + 26 : Math.round(h * 0.36);
  const mascotScale = shortLandscape
    ? Math.min(0.55, Math.max(0.4, (h * 0.28) / 320))
    : Math.max(0.9, librarianScale * 1.12);
  return {
    titleY,
    titleSize,
    subtitleY,
    buttonsY,
    gap: shortLandscape ? 50 : 58,
    secH: shortLandscape ? 34 : 50,
    secW: shortLandscape ? 100 : 110,
    secGapY: shortLandscape ? 8 : 12,
    versionY,
    mascotX: Math.round(w * 0.8),
    mascotY: shortLandscape ? Math.round(h * 0.54) : Math.round(h * 0.62),
    mascotScale,
    mascotOriginY: 0.5,
    menuBtnW,
    menuCx,
  };
}

export function getUiLayout(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const safe = getSafeInsets();
  const portrait = h > w;
  const compact = w < 720;
  const stackedHud = portrait || w < 560;
  const shortLandscape = !portrait && h < 520;

  const topBarH = stackedHud ? Math.round(92 + safe.top) : Math.round(56 + safe.top);
  const bottomBarH = portrait ? Math.round(72 + safe.bottom) : 0;

  const maxPerRow = portrait ? (w < 360 ? 2 : 3) : w < 900 ? 5 : 6;
  const maxRowsPerPage = portrait ? 4 : 3;

  const bookWMax = w >= 1400 ? 140 : w >= 1100 ? 124 : w >= 800 ? 112 : 108;
  const bookHMax = Math.round(bookWMax * 1.49);

  const largeScreen = !portrait && (h >= 860 || w >= 1280);
  const librarianScale = portrait
    ? Math.min(0.36, Math.max(0.28, (Math.min(w, h) * 0.16) / 320))
    : Math.min(
        largeScreen ? 1.55 : shortLandscape ? 0.62 : 0.92,
        Math.max(
          shortLandscape ? 0.38 : 0.5,
          (h * (largeScreen ? 0.46 : shortLandscape ? 0.22 : 0.3)) / 320
        )
      );

  const librarianDisplayW = 240 * librarianScale;
  const librarianX = portrait
    ? Math.max(safe.left, 4) + librarianDisplayW * 0.32
    : Math.max(safe.left, 8) + librarianDisplayW * 0.42;
  const actionColW = portrait ? 0 : 108;
  const leftReserved = portrait ? 16 : Math.round(librarianX + librarianDisplayW * 0.5 + 10);
  const rightMargin = portrait ? 16 : actionColW;
  const flipGutter = portrait ? Math.max(64, Math.round(w * 0.16)) : 60;
  const rightGutter = portrait ? Math.max(16, Math.round(flipGutter * 0.35)) : actionColW;
  const areaBottom = portrait ? h - bottomBarH : h - 24;
  const instructionY = topBarH + (stackedHud ? 6 : 18);
  const areaTopBase = instructionY + (stackedHud ? 48 : 56);
  const wrapPad = portrait ? 32 : Math.max(200, leftReserved + 24);

  const lsCols = portrait ? 2 : w < 900 ? 3 : 5;
  const lsGridTop = Math.round((shortLandscape ? 64 : compact ? 88 : 108) + safe.top);
  const lsPagerH = Math.round(56 + safe.bottom);
  const lsGridBottom = h - lsPagerH;
  const lsCellH = portrait ? 118 : shortLandscape ? 110 : 122;
  const lsAvailH = Math.max(160, lsGridBottom - lsGridTop);
  const lsRowsPerPage = Math.max(1, Math.min(5, Math.floor(lsAvailH / lsCellH)));
  const lsCellW = Math.min(174, Math.floor((w - 32) / lsCols));
  const lsCardW = Math.min(150, lsCellW - 16);
  const lsCardH = Math.min(104, lsCellH - 16);

  const menu = menuMetrics(w, h, safe, portrait, compact, shortLandscape, librarianScale);

  return {
    width: w,
    height: h,
    safe,
    portrait,
    compact,
    stackedHud,
    shortLandscape,
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
    menuBtnW: menu.menuBtnW,
    menuCx: menu.menuCx,
    menu,
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
