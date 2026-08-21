const PREFIX = "librarians-challenge:";
const KEY_MAX_LEVEL = PREFIX + "maxLevelUnlocked";
const KEY_BEST = PREFIX + "bestScores";
const KEY_PROFILE = PREFIX + "guestProfile";
const KEY_STATS = PREFIX + "globalStats";
const KEY_COACH = PREFIX + "seenCoach";

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

function nowIso() {
  return new Date().toISOString();
}

function createGuestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const Storage = {
  getGuestProfile() {
    const existing = readJSON(KEY_PROFILE, null);
    if (existing?.id) return existing;

    const profile = {
      id: createGuestId(),
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      mode: "guest",
    };
    writeJSON(KEY_PROFILE, profile);
    return profile;
  },

  touchSession() {
    const profile = this.getGuestProfile();
    const updated = { ...profile, lastSeenAt: nowIso() };
    writeJSON(KEY_PROFILE, updated);
    return updated;
  },

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

  getGlobalStats() {
    return readJSON(KEY_STATS, {
      completedLevels: [],
      totalCompletions: 0,
      totalMoves: 0,
      totalTimeMs: 0,
      lastCompletedLevel: null,
      lastPlayedAt: null,
    });
  },

  recordLevelCompletion(level, result) {
    this.touchSession();
    const stats = this.getGlobalStats();
    const completed = new Set(stats.completedLevels ?? []);
    completed.add(level);

    const updated = {
      ...stats,
      completedLevels: [...completed].sort((a, b) => a - b),
      totalCompletions: (stats.totalCompletions ?? 0) + 1,
      totalMoves: (stats.totalMoves ?? 0) + (result.moves ?? 0),
      totalTimeMs: (stats.totalTimeMs ?? 0) + (result.timeMs ?? 0),
      lastCompletedLevel: level,
      lastPlayedAt: nowIso(),
    };
    writeJSON(KEY_STATS, updated);
    return updated;
  },

  clearAll() {
    localStorage.removeItem(KEY_MAX_LEVEL);
    localStorage.removeItem(KEY_BEST);
    localStorage.removeItem(KEY_PROFILE);
    localStorage.removeItem(KEY_STATS);
    localStorage.removeItem(KEY_COACH);
  },

  hasSeenCoach() {
    return readJSON(KEY_COACH, false) === true;
  },

  markCoachSeen() {
    writeJSON(KEY_COACH, true);
  },
};
