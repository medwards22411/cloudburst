/**
 * A small seeded random number generator (mulberry32).
 *
 * Every player on the same day gets the same sequence of targets, so the booth
 * leaderboard compares skill, not luck.
 */
export class Rng {
  /**
   * :param seed: a 32-bit integer seed
   */
  constructor(seed) {
    this.state = seed >>> 0;
  }

  /**
   * Make a seed from a date, so a day's games share one sequence.
   *
   * :param date: the day as "YYYY-MM-DD"
   * :return: a 32-bit seed
   */
  static seedFor(date) {
    let hash = 2166136261;
    for (const char of String(date)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /** :return: a number in [0, 1) */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * :param min: the lower bound
   * :param max: the upper bound
   * :return: a number in [min, max)
   */
  range(min, max) {
    return min + (max - min) * this.next();
  }
}
