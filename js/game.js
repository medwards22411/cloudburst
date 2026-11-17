import { Rng } from "./rng.js";
import { scoreRun } from "./scoring.js";
import { FlickStage, ReadStage, TrackStage, WIDTH, HEIGHT } from "./stages.js";

/**
 * The run from idle screen to saved score, as a small state machine:
 *
 *   attract -> intro -> play -> intro -> play -> intro -> play -> results -> initials -> attract
 *
 * It holds no DOM and no timers: main.js feeds it time and pointer input each frame,
 * and render.js draws whatever state it is in. Every run starts from fresh objects, so
 * nothing carries over from one player to the next.
 */
export class Game {
  static ROUNDS = [FlickStage, TrackStage, ReadStage];

  /** Seconds of countdown before each round. */
  static INTRO = 3;

  /** Seconds of no input before the results or initials screen gives up and saves. */
  static IDLE_RESULTS = 20;

  static IDLE_INITIALS = 30;

  static LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /**
   * :param store: a ScoreStore
   * :param today: a function returning today's date as "YYYY-MM-DD"
   * :param clock: a function returning milliseconds since the epoch
   */
  constructor(store, today, clock = () => Date.now()) {
    this.store = store;
    this.today = today;
    this.clock = clock;
    this.reset();
  }

  /** Back to the idle screen with nothing left over from the last player. */
  reset() {
    this.state = "attract";
    this.timer = 0;
    this.idle = 0;
    this.round = -1;
    this.stage = null;
    this.results = [];
    this.score = null;
    this.place = null;
    this.initials = "";
    this.saved = null;
  }

  /** Start a run: the day's seed, so everyone today faces the same sky. */
  start() {
    this.reset();
    this.rng = new Rng(Rng.seedFor(this.today()));
    this.round = 0;
    this.state = "intro";
  }

  /** The round about to start or running, as its class. */
  get roundClass() {
    return Game.ROUNDS[this.round] || null;
  }

  /**
   * Advance one frame.
   *
   * :param dt: seconds since the last frame (capped, so a stall cannot skip a round)
   * :param input: {x, y, clicked} in logical space
   * :param key: a key pressed this frame, or null
   */
  update(dt, input, key = null) {
    dt = Math.min(dt, 0.1);
    this.timer += dt;
    this.idle = input.clicked || key ? 0 : this.idle + dt;
    if (key === "Escape" && this.state !== "attract") {
      this.reset();
      return;
    }
    switch (this.state) {
      case "attract":
        if (input.clicked || key === "Enter" || key === " ") this.start();
        break;
      case "intro":
        if (this.timer >= Game.INTRO) {
          this.stage = new Game.ROUNDS[this.round](this.rng);
          this.state = "play";
          this.timer = 0;
        }
        break;
      case "play":
        this.stage.update(dt, input);
        if (this.stage.done) this.endRound();
        break;
      case "results":
        // Ignore the first moments: a player still clicking from the last round should
        // see their score, not skip it.
        if (this.timer > 1.5 && (input.clicked || key === "Enter")) {
          this.state = "initials";
          this.timer = 0;
        } else if (this.idle >= Game.IDLE_RESULTS) {
          this.save();
        }
        break;
      case "initials":
        this.updateInitials(input, key);
        if (this.state === "initials" && this.idle >= Game.IDLE_INITIALS) this.save();
        break;
      default:
        this.reset();
    }
  }

  endRound() {
    this.results.push(this.stage.result());
    this.round += 1;
    this.timer = 0;
    if (this.round < Game.ROUNDS.length) {
      this.state = "intro";
      return;
    }
    this.stage = null;
    const [flick, track, read] = this.results;
    this.score = scoreRun(flick, track, read);
    this.place = this.store.placeFor(this.score.total, this.today());
    this.state = "results";
  }

  /**
   * The on-screen keyboard for initials: 26 letters, then Delete and Done.
   * Shared with the renderer, so what is drawn is what is clicked.
   *
   * :return: [{label, x, y, w, h}]
   */
  static keyboard() {
    const keys = [];
    const size = 78;
    const gap = 12;
    const perRow = 9;
    const rowWidth = perRow * size + (perRow - 1) * gap;
    const left = (WIDTH - rowWidth) / 2;
    const top = HEIGHT / 2 - 40;
    Game.LETTERS.split("").forEach((letter, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      keys.push({ label: letter, x: left + col * (size + gap), y: top + row * (size + gap), w: size, h: size });
    });
    const y = top + 3 * (size + gap) + 10;
    keys.push({ label: "Delete", x: WIDTH / 2 - 250, y: y, w: 230, h: 70 });
    keys.push({ label: "Done", x: WIDTH / 2 + 20, y: y, w: 230, h: 70 });
    return keys;
  }

  updateInitials(input, key) {
    let pressed = null;
    if (input.clicked) {
      const hit = Game.keyboard().find((k) => input.x >= k.x && input.x <= k.x + k.w && input.y >= k.y && input.y <= k.y + k.h);
      pressed = hit ? hit.label : null;
    } else if (key) {
      if (/^[a-z]$/i.test(key)) pressed = key.toUpperCase();
      if (key === "Backspace") pressed = "Delete";
      if (key === "Enter") pressed = "Done";
    }
    if (!pressed) return;
    if (pressed === "Delete") {
      this.initials = this.initials.slice(0, -1);
    } else if (pressed === "Done") {
      this.save();
    } else if (this.initials.length < 3) {
      this.initials += pressed;
      if (this.initials.length === 3) this.save();
    }
  }

  /** Save the run (blank initials become "---") and return to the idle screen. */
  save() {
    if (this.score) {
      this.saved = this.store.add({
        initials: this.initials || "---",
        total: this.score.total,
        aim: this.score.aim,
        tracking: this.score.tracking,
        decisions: this.score.decisions,
        tier: this.score.tier,
        date: this.today(),
        at: this.clock(),
      });
    }
    const saved = this.saved;
    this.reset();
    this.lastSaved = saved;
  }
}
