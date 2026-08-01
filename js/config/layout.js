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

export function getLevelSelectLayout(width, height) {
  if (height <= width) return LEVEL_SELECT_LAYOUT;

  const cols = 3;
  const rowsPerPage = 5;
  const perPage = cols * rowsPerPage;
  const sidePad = 24;
  const cellW = Math.floor((width - sidePad * 2) / cols);
  const cellH = 112;
  const cardW = Math.min(150, cellW - 18);
  const cardH = 96;

  return {
    cols,
    rowsPerPage,
    perPage,
    cellW,
    cellH,
    cardW,
    cardH,
    gridTop: 96,
    gridBottom: height - 64,
  };
}

export function getGameLayout(width, height) {
  const portrait = height > width;
  const controlBarHeight = portrait ? 68 : 0;

  return {
    ...GAME_LAYOUT,
    portrait,
    controlsDock: portrait ? "bottom" : "right",
    controlBarHeight,
    areaTopBase: portrait ? 118 : GAME_LAYOUT.areaTopBase,
    areaBottom: height - (portrait ? controlBarHeight + 20 : 20),
    rightGutter: portrait ? 26 : GAME_LAYOUT.rightGutter,
    leftReserved: portrait ? 10 : GAME_LAYOUT.leftReserved,
    rightMargin: portrait ? 10 : GAME_LAYOUT.rightMargin,
    bookWMax: portrait ? 98 : GAME_LAYOUT.bookWMax,
    bookHMax: portrait ? 126 : GAME_LAYOUT.bookHMax,
    gapX: portrait ? 8 : GAME_LAYOUT.gapX,
    gapY: portrait ? 14 : GAME_LAYOUT.gapY,
    maxPerRow: portrait ? 5 : GAME_LAYOUT.maxPerRow,
    maxRowsPerPage: portrait ? 4 : GAME_LAYOUT.maxRowsPerPage,
  };
}
