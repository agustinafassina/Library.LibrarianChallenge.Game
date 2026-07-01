import { evaluateOrder } from "../utils/rules.js";

export class BoardController {
  constructor() {
    this.slots = [];
    this.zoneRanges = [];
    this.pageCount = 1;
    this.currentPage = 0;
    this.items = [];
    this.moveHistory = [];
  }

  setStructure({ slots, zoneRanges, pageCount }) {
    this.slots = slots ?? [];
    this.zoneRanges = zoneRanges ?? [];
    this.pageCount = pageCount ?? 1;
    this.currentPage = 0;
    this.moveHistory = [];
  }

  setItems(items) {
    this.items = items ?? [];
    this.moveHistory = [];
  }

  setCurrentPage(page) {
    const last = Math.max(0, this.pageCount - 1);
    this.currentPage = Math.max(0, Math.min(last, page));
  }

  hasUndo() {
    return this.moveHistory.length > 0;
  }

  scoreShuffle(arr, rule) {
    const { expected, perSlot } = evaluateOrder(arr, rule);
    const n = arr.length;
    const expectedIndex = new Map(expected.map((b, i) => [b, i]));
    let displaced = 0;
    let farDisplaced = 0;
    let displacementSum = 0;

    arr.forEach((book, i) => {
      const ei = expectedIndex.get(book);
      const d = Math.abs(i - ei);
      displacementSum += d;
      if (d > 0) displaced++;
      if (d >= 2) farDisplaced++;
    });

    const correctCount = perSlot.filter(Boolean).length;
    return {
      solved: perSlot.every(Boolean),
      correctCount,
      displaced,
      farDisplaced,
      avgDisplacement: n > 0 ? displacementSum / n : 0,
    };
  }

  isGoodShuffle(score, n) {
    if (score.solved) return false;
    if (n <= 2) return true;

    const maxCorrect = n <= 4 ? 1 : Math.floor(n * 0.3);
    if (score.correctCount > maxCorrect) return false;

    const minDisplaced = n <= 4 ? n - 1 : Math.ceil(n * 0.6);
    if (score.displaced < minDisplaced) return false;

    if (n >= 5 && score.farDisplaced < 1) return false;
    return true;
  }

  scrambleZone(books, rule) {
    if (books.length < 2) return [...books];

    let bestArr = [...books];
    let bestScore = this.scoreShuffle(bestArr, rule);

    for (let attempts = 0; attempts < 120; attempts++) {
      const candidate = Phaser.Utils.Array.Shuffle([...books]);
      const score = this.scoreShuffle(candidate, rule);

      if (this.isGoodShuffle(score, books.length)) {
        return candidate;
      }

      const isBetter =
        score.correctCount < bestScore.correctCount ||
        (
          score.correctCount === bestScore.correctCount &&
          score.avgDisplacement > bestScore.avgDisplacement
        );
      if (isBetter) {
        bestArr = candidate;
        bestScore = score;
      }
    }

    return bestArr;
  }

  createInitialOrder(zones) {
    const out = [];
    zones.forEach((zone) => {
      out.push(...this.scrambleZone(zone.books, zone.rule));
    });
    return out;
  }

  nearestSlot(x, y, zoneIdx = null) {
    let best = -1;
    let bestDist = Infinity;
    this.slots.forEach((slot, i) => {
      if (slot.page !== this.currentPage) return;
      if (zoneIdx !== null && slot.zoneIdx !== zoneIdx) return;
      const d = Phaser.Math.Distance.Between(slot.x, slot.y, x, y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  dropAt(fromIndex, toIndex) {
    if (toIndex < 0 || fromIndex < 0 || toIndex === fromIndex) return false;
    this.items.splice(toIndex, 0, this.items.splice(fromIndex, 1)[0]);
    this.moveHistory.push({ fromIndex, toIndex });
    return true;
  }

  undoLast() {
    if (this.moveHistory.length === 0) return null;
    const { fromIndex, toIndex } = this.moveHistory.pop();
    this.items.splice(fromIndex, 0, this.items.splice(toIndex, 1)[0]);
    return { fromIndex, toIndex };
  }

  evaluateAll(getBook) {
    const perSlot = [];
    let solved = true;
    this.zoneRanges.forEach((range) => {
      const books = this.items.slice(range.start, range.end + 1).map(getBook);
      const zr = evaluateOrder(books, range.rule);
      perSlot.push(...zr.perSlot);
      if (!zr.solved) solved = false;
    });
    return { perSlot, solved };
  }

  sortAllZones(getBook) {
    this.zoneRanges.forEach((range) => {
      const slice = this.items.slice(range.start, range.end + 1);
      const books = slice.map(getBook);
      const { expected } = evaluateOrder(books, range.rule);
      const sorted = [...slice].sort(
        (a, b) => expected.indexOf(getBook(a)) - expected.indexOf(getBook(b))
      );
      sorted.forEach((it, i) => { this.items[range.start + i] = it; });
    });
  }

  pickHintTargetIndex(getBook) {
    const result = this.evaluateAll(getBook);
    const wrong = result.perSlot
      .map((ok, i) => (!ok ? i : -1))
      .filter((i) => i >= 0);
    if (wrong.length === 0) return -1;
    const onCurrent = wrong.find((i) => this.slots[i].page === this.currentPage);
    return onCurrent ?? wrong[0];
  }
}