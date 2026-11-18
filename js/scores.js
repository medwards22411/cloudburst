/**
 * Keeps the booth's scores on this machine, with no network: in localStorage when the
 * browser has it, in memory otherwise (tests, private windows).
 */
export class ScoreStore {
  static KEY = "cloudburst.scores.v1";

  static LATEST_KEY = "cloudburst.latest.v1";

  /** The most scores kept; the lowest drop off first. */
  static LIMIT = 500;

  /**
   * :param storage: a Storage-like object (getItem/setItem), or null for memory only
   */
  constructor(storage = ScoreStore.defaultStorage()) {
    this.storage = storage;
    this.memory = [];
  }

  /** :return: window.localStorage when it works, else null */
  static defaultStorage() {
    try {
      const probe = "cloudburst.probe";
      globalThis.localStorage.setItem(probe, "1");
      globalThis.localStorage.removeItem(probe);
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }

  /** :return: every saved score */
  all() {
    if (!this.storage) return this.memory.slice();
    try {
      const saved = JSON.parse(this.storage.getItem(ScoreStore.KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  /**
   * Save a finished run.
   *
   * :param entry: {initials, total, aim, tracking, decisions, tier, date, at}
   * :return: the entry as saved
   */
  add(entry) {
    const clean = {
      initials: String(entry.initials || "---").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 3).padEnd(3, "-"),
      total: Math.max(0, Math.round(entry.total)),
      aim: entry.aim,
      tracking: entry.tracking,
      decisions: entry.decisions,
      tier: entry.tier,
      date: entry.date,
      at: entry.at,
    };
    const scores = this.all();
    scores.push(clean);
    scores.sort((a, b) => b.total - a.total || a.at - b.at);
    const kept = scores.slice(0, ScoreStore.LIMIT);
    if (this.storage) {
      try {
        this.storage.setItem(ScoreStore.KEY, JSON.stringify(kept));
      } catch {
        this.memory = kept;
      }
    } else {
      this.memory = kept;
    }
    if (this.storage) {
      try {
        this.storage.setItem(ScoreStore.LATEST_KEY, JSON.stringify(clean));
      } catch {
        // The score is already saved; notification must not interrupt the game.
      }
    }
    if (typeof globalThis.BroadcastChannel !== "undefined") {
      try {
        const channel = new globalThis.BroadcastChannel("cloudburst");
        try {
          channel.postMessage({ type: "score", entry: clean });
        } finally {
          channel.close();
        }
      } catch {
        // Storage events still provide updates if the channel is unavailable.
      }
    }
    return clean;
  }

  /**
   * The best scores, highest first.
   *
   * :param count: how many
   * :param date: only this day ("YYYY-MM-DD"), or null for all time
   * :return: the scores
   */
  top(count, date = null) {
    return this.all().filter((s) => !date || s.date === date).slice(0, count);
  }

  /**
   * Where a total would place among a day's scores, 1 being first.
   *
   * :param total: the run's total
   * :param date: the day
   * :return: the place
   */
  placeFor(total, date) {
    return this.all().filter((s) => s.date === date && s.total > total).length + 1;
  }
}
