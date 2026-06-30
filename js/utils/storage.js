const PREFIX = "librarians-challenge:";
const KEY_MAX_LEVEL = PREFIX + "maxLevelUnlocked";
const KEY_BEST = PREFIX + "bestScores";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn("[storage] could not read", key, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("[storage] could not write", key, err);
  }
}

export const Storage = {
  getMaxLevelUnlocked() {
    return Math.max(1, Number(readJSON(KEY_MAX_LEVEL, 1)) || 1);
  },

  unlockLevel(level) {
    const current = this.getMaxLevelUnlocked();
    if (level > current) writeJSON(KEY_MAX_LEVEL, level);
  },

  hasProgress() {
    return this.getMaxLevelUnlocked() > 1;
  },

  getBestScores() {
    return readJSON(KEY_BEST, {});
  },

  getBestForLevel(level) {
    return this.getBestScores()[level] || null;
  },

  saveResult(level, result) {
    const all = this.getBestScores();
    const prev = all[level];
    const isBetter =
      !prev ||
      result.score > prev.score ||
      (result.score === prev.score && result.timeMs < prev.timeMs);

    if (isBetter) {
      all[level] = result;
      writeJSON(KEY_BEST, all);
    }
    return isBetter;
  },

  clearAll() {
    localStorage.removeItem(KEY_MAX_LEVEL);
    localStorage.removeItem(KEY_BEST);
  },
};
