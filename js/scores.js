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
    let value;
    try {
      value = this.storage.getItem(ScoreStore.KEY);
    } catch {
      this.storage = null;
      return this.memory.slice();
    }
    try {
      const saved = JSON.parse(value || "[]");
      this.memory = Array.isArray(saved) ? saved : [];
    } catch {
      this.memory = [];
    }
    return this.memory.slice();
  }

  /** Save a snapshot, keeping it in memory if storage is unavailable. */
  save(scores) {
    this.memory = scores;
    if (this.storage) {
      try {
        this.storage.setItem(ScoreStore.KEY, JSON.stringify(scores));
        return true;
      } catch {
        this.storage = null;
      }
    }
    return false;
  }

  /** Notify other windows when the channel is available. */
  notify(message) {
    if (typeof globalThis.BroadcastChannel !== "undefined") {
      try {
        const channel = new globalThis.BroadcastChannel("cloudburst");
        try {
          channel.postMessage(message);
        } finally {
          channel.close();
        }
      } catch {
        // Storage events still provide updates if the channel is unavailable.
      }
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
    this.save(kept);
    if (this.storage) {
      try {
        this.storage.setItem(ScoreStore.LATEST_KEY, JSON.stringify(clean));
      } catch {
        // The score is already saved; notification must not interrupt the game.
      }
    }
    this.notify({ type: "score", entry: clean });
    return clean;
  }

  /** Remove one day, returning the number of scores removed. */
  clearDay(date) {
    const scores = this.all();
    const kept = scores.filter((score) => score.date !== date);
    const removed = scores.length - kept.length;
    const persisted = removed ? this.save(kept) : !!this.storage;
    if (this.storage) {
      try {
        const latest = JSON.parse(this.storage.getItem(ScoreStore.LATEST_KEY) || "null");
        if (latest?.date === date) this.storage.setItem(ScoreStore.LATEST_KEY, "null");
      } catch {
        // Clearing the latest announcement is best effort.
      }
    }
    this.notify({ type: "scores-cleared", date, scores: kept, persisted });
    return removed;
  }

  /** Count, highest total and mean total for one day. */
  stats(date) {
    const scores = this.all().filter((score) => score.date === date);
    const count = scores.length;
    const total = scores.reduce((sum, score) => sum + score.total, 0);
    const best = scores.reduce((highest, score) => Math.max(highest, score.total), 0);
    return { count, best, average: count ? total / count : 0 };
  }

  /** Export every saved score as CSV with a local HH:MM:SS time. */
  toCsv() {
    const escape = (value) => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = [["initials", "total", "aim", "tracking", "decisions", "tier", "date", "time"]];
    for (const entry of this.all()) {
      const date = typeof entry.at === "number" ? new Date(entry.at) : new Date(NaN);
      const time = Number.isNaN(date.getTime()) ? "" : [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
      rows.push([entry.initials, entry.total, entry.aim, entry.tracking, entry.decisions, entry.tier, entry.date, time]);
    }
    return rows.map((row) => row.map(escape).join(",")).join("\r\n");
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
