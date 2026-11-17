// Simulated players for tests and for tuning the tiers. A bot has a reaction time, an
// aim error and a decision error, and plays a whole run through the real Game.
import { Game } from "../js/game.js";
import { Rng } from "../js/rng.js";
import { pointer } from "../js/stages.js";

/**
 * Skill profiles from casual to pro.
 */
export const PROFILES = {
  casual: { reaction: 650, aimError: 30, trackLag: 0.28, wrongRate: 0.25, missRate: 0.3 },
  regular: { reaction: 480, aimError: 18, trackLag: 0.16, wrongRate: 0.12, missRate: 0.15 },
  good: { reaction: 380, aimError: 11, trackLag: 0.09, wrongRate: 0.06, missRate: 0.07 },
  pro: { reaction: 290, aimError: 6, trackLag: 0.04, wrongRate: 0.02, missRate: 0.02 },
};

/**
 * A bot that plays one run.
 */
export class Bot {
  /**
   * :param profile: one of PROFILES
   * :param seed: the bot's own randomness (separate from the game's)
   */
  constructor(profile, seed = 1) {
    this.p = profile;
    this.rng = new Rng(seed);
    this.x = 800;
    this.y = 450;
    this.plan = null;
  }

  gauss() {
    const u = Math.max(1e-9, this.rng.next());
    const v = this.rng.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Decide this frame's input.
   *
   * :param game: the Game
   * :param dt: the frame length
   * :return: {x, y, clicked}
   */
  input(game, dt) {
    if (game.state === "attract" || game.state === "results") return pointer(this.x, this.y, true);
    if (game.state === "initials") return pointer(this.x, this.y, false);
    if (game.state !== "play") return pointer(this.x, this.y, false);
    const stage = game.stage;
    if (stage.name === "Track") {
      // Follow the storm with a lag: move part of the way each frame.
      const k = Math.min(1, dt / this.p.trackLag);
      this.x += (stage.storm.x - this.x) * k + this.gauss() * this.p.aimError * 0.3;
      this.y += (stage.storm.y - this.y) * k + this.gauss() * this.p.aimError * 0.3;
      return pointer(this.x, this.y, false);
    }
    const t = stage.target;
    if (!t) {
      this.plan = null;
      return pointer(this.x, this.y, false);
    }
    if (!this.plan || this.plan.target !== t) {
      const delay = Math.max(0.15, (this.p.reaction + this.gauss() * 60) / 1000);
      let click = true;
      if (stage.name === "Read") {
        click = t.hostile ? this.rng.next() > this.p.missRate : this.rng.next() < this.p.wrongRate;
      }
      this.plan = { target: t, at: t.bornAt + delay, click: click, done: false };
    }
    if (!this.plan.done && this.plan.click && stage.time >= this.plan.at) {
      this.plan.done = true;
      this.x = t.x + this.gauss() * this.p.aimError;
      this.y = t.y + this.gauss() * this.p.aimError;
      return pointer(this.x, this.y, true);
    }
    return pointer(this.x, this.y, false);
  }

  /**
   * Play a full run on the game and save the score with these initials.
   *
   * :param game: a Game in the attract state
   * :param initials: three letters
   * :return: the run's score
   */
  play(game, initials = "BOT") {
    const dt = 1 / 60;
    let score = null;
    for (let frame = 0; frame < 60 * 200; frame += 1) {
      const key = game.state === "initials" ? initials[game.initials.length] || "Enter" : null;
      game.update(dt, this.input(game, dt), key);
      if (game.score) score = game.score;
      if (score && game.state === "attract") return score;
    }
    throw new Error(`The run did not finish; stuck in ${game.state}`);
  }
}
