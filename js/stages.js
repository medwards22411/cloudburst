/**
 * The three rounds of a Cloudburst run. Each round is pure game logic: it reads the
 * pointer, advances with time and keeps its own score, with no drawing and no DOM.
 * render.js draws them, and the tests drive them with scripted input.
 *
 * Coordinates are in the game's logical space, WIDTH by HEIGHT, whatever the screen.
 */
export const WIDTH = 1600;
export const HEIGHT = 900;

/** The playable sky, below the score bar. */
export const FIELD = { left: 80, top: 130, right: WIDTH - 80, bottom: HEIGHT - 60 };

/**
 * One frame of pointer input.
 *
 * :param x: pointer x in logical space
 * :param y: pointer y in logical space
 * :param clicked: true when a click started this frame
 * :return: the input object stages read
 */
export function pointer(x, y, clicked = false) {
  return { x: x, y: y, clicked: clicked };
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Shared clock and score for every round.
 */
class Stage {
  /**
   * :param rng: the run's seeded Rng
   * :param duration: the round's length in seconds
   */
  constructor(rng, duration) {
    this.rng = rng;
    this.duration = duration;
    this.time = 0;
    this.points = 0;
    /** Short-lived effects for the renderer: {kind, x, y, at, text?}. */
    this.effects = [];
  }

  get done() {
    return this.time >= this.duration;
  }

  get remaining() {
    return Math.max(0, this.duration - this.time);
  }

  /** Add an effect, keeping the list short so a long session never grows it. */
  effect(kind, x, y, text = "") {
    this.effects.push({ kind: kind, x: x, y: y, at: this.time, text: text });
    if (this.effects.length > 24) this.effects.shift();
  }

  /** Award points; a round's score never drops below zero. */
  award(amount) {
    this.points = Math.max(0, this.points + amount);
  }
}

/**
 * Round 1, Flick: one cloud at a time pops up somewhere else in the sky. Click it as
 * fast as you can. Faster hits and streaks score more; a click on empty sky costs points
 * and breaks the streak.
 */
export class FlickStage extends Stage {
  static NAME = "Flick";

  static HINT = "Click each cloud as fast as you can";

  static DURATION = 25;

  constructor(rng) {
    super(rng, FlickStage.DURATION);
    this.name = FlickStage.NAME;
    this.hint = FlickStage.HINT;
    this.hits = 0;
    this.misses = 0;
    this.streak = 0;
    this.reactions = [];
    this.target = null;
    this.spawn();
  }

  /** Place the next cloud well away from the last one, so every hit is a real flick. */
  spawn() {
    const radius = Math.max(26, 48 - this.streak * 2);
    const last = this.target;
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 20; tries += 1) {
      x = this.rng.range(FIELD.left + radius, FIELD.right - radius);
      y = this.rng.range(FIELD.top + radius, FIELD.bottom - radius);
      if (!last || distance(x, y, last.x, last.y) > 320) break;
    }
    this.target = { x: x, y: y, r: radius, bornAt: this.time };
  }

  update(dt, input) {
    if (this.done) return;
    this.time += dt;
    if (!input.clicked) return;
    const t = this.target;
    if (distance(input.x, input.y, t.x, t.y) <= t.r) {
      const reaction = (this.time - t.bornAt) * 1000;
      this.reactions.push(reaction);
      this.hits += 1;
      this.streak += 1;
      const speed = Math.max(0, Math.round((800 - reaction) / 8));
      const streak = Math.min(this.streak, 10) * 5;
      this.award(100 + speed + streak);
      this.effect("burst", t.x, t.y, `+${100 + speed + streak}`);
      this.spawn();
    } else {
      this.misses += 1;
      this.streak = 0;
      this.award(-25);
      this.effect("miss", input.x, input.y);
    }
  }

  /** :return: the round's numbers for scoring */
  result() {
    return {
      round: "flick",
      points: this.points,
      hits: this.hits,
      misses: this.misses,
      seconds: this.duration,
      reactions: this.reactions.slice(),
    };
  }
}

/**
 * Round 2, Track: a storm cell drifts across the sky on a smooth, speeding-up path.
 * Keep your crosshair on it. Time on target drains it; a drained storm bursts for a
 * bonus and a new one forms.
 */
export class TrackStage extends Stage {
  static NAME = "Track";

  static HINT = "Keep your crosshair on the storm";

  static DURATION = 20;

  static CHARGE = 1.6;

  constructor(rng) {
    super(rng, TrackStage.DURATION);
    this.name = TrackStage.NAME;
    this.hint = TrackStage.HINT;
    this.onTarget = 0;
    this.bursts = 0;
    this.locked = false;
    this.newStorm();
    this.storm.x = this.pathX(0);
    this.storm.y = this.pathY(0);
  }

  /** A new storm: its own path, full charge. */
  newStorm() {
    const r = this.rng;
    this.path = {
      ax: r.range(0.22, 0.32), fx: r.range(0.35, 0.55), px: r.range(0, Math.PI * 2),
      bx: r.range(0.1, 0.16), gx: r.range(0.9, 1.3), qx: r.range(0, Math.PI * 2),
      ay: r.range(0.18, 0.26), fy: r.range(0.45, 0.7), py: r.range(0, Math.PI * 2),
      by: r.range(0.06, 0.1), gy: r.range(1.1, 1.6), qy: r.range(0, Math.PI * 2),
    };
    this.storm = { x: this.storm ? this.storm.x : WIDTH / 2, y: this.storm ? this.storm.y : HEIGHT / 2, r: 62, charge: TrackStage.CHARGE };
  }

  /** The path speeds up through the round. */
  phase(t) {
    return t + 0.03 * t * t;
  }

  pathX(t) {
    const p = this.path;
    const s = this.phase(t);
    const w = FIELD.right - FIELD.left;
    return (FIELD.left + FIELD.right) / 2 + w * (p.ax * Math.sin(p.fx * s + p.px) + p.bx * Math.sin(p.gx * s + p.qx));
  }

  pathY(t) {
    const p = this.path;
    const s = this.phase(t);
    const h = FIELD.bottom - FIELD.top;
    return (FIELD.top + FIELD.bottom) / 2 + h * (p.ay * Math.sin(p.fy * s + p.py) + p.by * Math.sin(p.gy * s + p.qy));
  }

  update(dt, input) {
    if (this.done) return;
    this.time += dt;
    // Ease toward the path, so a new storm glides in from where the last one burst.
    const tx = this.pathX(this.time);
    const ty = this.pathY(this.time);
    const ease = Math.min(1, dt * 6);
    this.storm.x += (tx - this.storm.x) * ease;
    this.storm.y += (ty - this.storm.y) * ease;
    this.locked = distance(input.x, input.y, this.storm.x, this.storm.y) <= this.storm.r;
    if (!this.locked) return;
    this.onTarget += dt;
    this.award(dt * 100);
    this.storm.charge -= dt;
    if (this.storm.charge <= 0) {
      this.bursts += 1;
      this.award(250);
      this.effect("burst", this.storm.x, this.storm.y, "+250");
      this.newStorm();
    }
  }

  result() {
    return {
      round: "track",
      points: Math.round(this.points),
      onTarget: this.onTarget,
      seconds: this.duration,
      bursts: this.bursts,
    };
  }
}

/**
 * Round 3, Read: storms and friendly clouds flash up, one at a time, faster and faster.
 * Hit the storms. Leave the friendlies alone. Wrong calls cost more than slow ones.
 */
export class ReadStage extends Stage {
  static NAME = "Read";

  static HINT = "Hit the storms. Leave the friendly clouds";

  static DURATION = 25;

  constructor(rng) {
    super(rng, ReadStage.DURATION);
    this.name = ReadStage.NAME;
    this.hint = ReadStage.HINT;
    this.correct = 0;
    this.wrong = 0;
    this.missed = 0;
    this.avoided = 0;
    this.stray = 0;
    this.reactions = [];
    this.target = null;
    this.nextAt = 0.6;
  }

  /** How long a target stays up: from 1 s down to 0.55 s over the round. */
  life() {
    return 1.0 - 0.45 * Math.min(1, this.time / this.duration);
  }

  spawn() {
    const radius = 50;
    this.target = {
      x: this.rng.range(FIELD.left + radius, FIELD.right - radius),
      y: this.rng.range(FIELD.top + radius, FIELD.bottom - radius),
      r: radius,
      hostile: this.rng.next() < 0.65,
      bornAt: this.time,
      life: this.life(),
    };
  }

  /** Clear the target and schedule the next one after a short, varied gap. */
  clear() {
    this.target = null;
    this.nextAt = this.time + this.rng.range(0.25, 0.55);
  }

  update(dt, input) {
    if (this.done) return;
    this.time += dt;
    const t = this.target;
    if (!t && this.time >= this.nextAt) {
      this.spawn();
    } else if (t && this.time - t.bornAt >= t.life) {
      if (t.hostile) {
        this.missed += 1;
        this.effect("late", t.x, t.y, "Too slow");
      } else {
        this.avoided += 1;
        this.award(25);
      }
      this.clear();
    }
    if (!input.clicked) return;
    const now = this.target;
    if (now && distance(input.x, input.y, now.x, now.y) <= now.r) {
      if (now.hostile) {
        const reaction = (this.time - now.bornAt) * 1000;
        this.reactions.push(reaction);
        this.correct += 1;
        const speed = Math.max(0, Math.round((700 - reaction) / 5));
        this.award(150 + speed);
        this.effect("burst", now.x, now.y, `+${150 + speed}`);
      } else {
        this.wrong += 1;
        this.award(-150);
        this.effect("wrong", now.x, now.y, "Friendly!");
      }
      this.clear();
    } else {
      this.stray += 1;
      this.award(-20);
      this.effect("miss", input.x, input.y);
    }
  }

  result() {
    return {
      round: "read",
      points: this.points,
      correct: this.correct,
      wrong: this.wrong,
      missed: this.missed,
      avoided: this.avoided,
      stray: this.stray,
      reactions: this.reactions.slice(),
    };
  }
}
