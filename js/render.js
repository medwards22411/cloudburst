import { Game } from "./game.js";
import { FIELD, HEIGHT, WIDTH } from "./stages.js";

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

/** Sky colors per screen: [top, bottom]. Each round has its own light. */
const SKIES = {
  attract: ["#3b82c4", "#a9d8f5"],
  0: ["#2f74c0", "#9fd3f7"],
  1: ["#e2725b", "#f7c59f"],
  2: ["#1d2b53", "#5b4b8a"],
  results: ["#17325c", "#4f86c6"],
};

/**
 * Draws the game in its logical WIDTH x HEIGHT space; main.js sets the transform that
 * fits it to the screen. Background clouds are drawn once to an offscreen canvas.
 */
export class Renderer {
  /**
   * :param ctx: the 2D context, already scaled to logical space
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.drift = 0;
    this.backdrop = this.makeBackdrop();
  }

  /** A strip of soft background clouds, twice the screen wide so it can scroll. */
  makeBackdrop() {
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(WIDTH * 2, HEIGHT) : document.createElement("canvas");
    canvas.width = WIDTH * 2;
    canvas.height = HEIGHT;
    const c = canvas.getContext("2d");
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 26; i += 1) {
      const x = rand() * WIDTH * 2;
      const y = 120 + rand() * (HEIGHT - 200);
      const s = 0.6 + rand() * 1.4;
      c.globalAlpha = 0.12 + rand() * 0.14;
      this.puff(c, x, y, 70 * s, "#ffffff");
    }
    return canvas;
  }

  /** A cloud: overlapping circles with a flat base. */
  puff(c, x, y, r, color) {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x - r * 0.6, y + r * 0.1, r * 0.55, 0, Math.PI * 2);
    c.arc(x - r * 0.1, y - r * 0.25, r * 0.7, 0, Math.PI * 2);
    c.arc(x + r * 0.5, y, r * 0.6, 0, Math.PI * 2);
    c.arc(x + r * 0.1, y + r * 0.25, r * 0.55, 0, Math.PI * 2);
    c.fill();
  }

  /**
   * Draw one frame.
   *
   * :param game: the Game
   * :param pointer: {x, y} in logical space
   * :param board: today's top scores, for the idle screen
   * :param dt: seconds since the last frame
   */
  draw(game, pointer, board, dt, settings = { eventName: "" }, staff = null) {
    const c = this.ctx;
    this.drift = (this.drift + dt * 12) % WIDTH;
    const key = game.state === "intro" || game.state === "play" ? game.round : game.state === "attract" ? "attract" : "results";
    this.sky(SKIES[key] || SKIES.attract);
    c.save();
    // In the Read round, faint background clouds could pass for friendly ones: dim them.
    c.globalAlpha = key === 2 ? 0.3 : 1;
    c.drawImage(this.backdrop, -this.drift, 0);
    c.drawImage(this.backdrop, WIDTH * 2 - this.drift, 0);
    c.restore();
    if (game.state === "attract") this.attract(game, board, settings.eventName);
    if (game.state === "intro") this.intro(game);
    if (game.state === "play") this.play(game);
    if (game.state === "results") this.results(game);
    if (game.state === "initials") this.initials(game, pointer);
    if (staff?.open) this.staffPanel(staff);
    else this.crosshair(pointer.x, pointer.y);
  }

  sky([top, bottom]) {
    const c = this.ctx;
    const g = c.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, WIDTH, HEIGHT);
  }

  text(str, x, y, size, options = {}) {
    const c = this.ctx;
    c.font = `${options.weight || 700} ${size}px ${FONT}`;
    c.textAlign = options.align || "center";
    c.textBaseline = options.baseline || "middle";
    if (options.shadow !== false) {
      c.fillStyle = "rgba(10, 25, 50, 0.35)";
      c.fillText(str, x + 2, y + 3);
    }
    c.fillStyle = options.color || "#ffffff";
    c.fillText(str, x, y);
  }

  panel(x, y, w, h, alpha = 0.28) {
    const c = this.ctx;
    c.fillStyle = `rgba(8, 24, 52, ${alpha})`;
    c.beginPath();
    c.roundRect(x, y, w, h, 22);
    c.fill();
  }

  attract(game, board, eventName = "") {
    const pulse = 0.5 + 0.5 * Math.sin(game.timer * 3);
    this.text("CLOUDBURST", WIDTH * 0.36, 230, 132, { weight: 900 });
    if (eventName) this.text(eventName, WIDTH * 0.36, 315, 34, { color: "#ffd166" });
    this.text("Aim. Track. Read. 90 seconds.", WIDTH * 0.36, eventName ? 375 : 330, 40, { weight: 600 });
    this.ctx.globalAlpha = 0.6 + 0.4 * pulse;
    this.text("Click anywhere to play", WIDTH * 0.36, 470, 46);
    this.ctx.globalAlpha = 1;
    const steps = [["1", "Flick", "Hit clouds fast"], ["2", "Track", "Stay on the storm"], ["3", "Read", "Storms only"]];
    steps.forEach(([n, name, line], i) => {
      const x = WIDTH * 0.36 + (i - 1) * 250;
      this.panel(x - 110, 560, 220, 150);
      this.text(n, x, 600, 34, { color: "#ffd166" });
      this.text(name, x, 645, 34);
      this.text(line, x, 685, 22, { weight: 500 });
    });
    this.text("Today's sky is the same for everyone. Beat the board.", WIDTH * 0.36, 790, 24, { weight: 500 });
    // Today's best.
    this.panel(WIDTH - 470, 130, 400, 640, 0.32);
    this.text("TODAY'S TOP 10", WIDTH - 270, 180, 32, { color: "#ffd166" });
    if (!board.length) this.text("Be the first!", WIDTH - 270, 260, 28, { weight: 500 });
    board.slice(0, 10).forEach((s, i) => {
      const y = 240 + i * 52;
      const fresh = game.lastSaved && s.at === game.lastSaved.at;
      this.text(`${i + 1}.`, WIDTH - 420, y, 28, { align: "left", color: fresh ? "#ffd166" : "#ffffff" });
      this.text(s.initials, WIDTH - 360, y, 30, { align: "left", color: fresh ? "#ffd166" : "#ffffff" });
      this.text(String(s.total), WIDTH - 110, y, 30, { align: "right", color: fresh ? "#ffd166" : "#ffffff" });
    });
  }

  staffPanel(staff) {
    const stats = staff.store.stats(staff.today());
    this.ctx.fillStyle = "rgba(8, 24, 52, 0.65)";
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.panel(260, 70, 1080, 760, 0.88);
    this.text("STAFF PANEL", WIDTH / 2, 130, 48, { color: "#ffd166", weight: 900 });
    this.text(`Today: ${stats.count} games   •   Best ${stats.best}   •   Average ${Math.round(stats.average * 10) / 10}`, WIDTH / 2, 205, 30);
    const rows = [
      ["Event name", `${staff.settings.value.eventName || (staff.editing ? "" : "(none)")}${staff.editing ? "_" : ""}`],
      ["Sound on by default", staff.settings.value.soundOn ? "Yes" : "No"],
      ["Save scores to a file", "CSV"],
      ["Clear today's board", staff.confirming ? "Press Enter again within 3 seconds" : ""],
    ];
    rows.forEach(([label, value], i) => {
      const y = 280 + i * 105;
      this.panel(320, y - 34, 960, 82, i === staff.selected ? 0.8 : 0.28);
      this.text(`${i === staff.selected ? "›  " : ""}${label}`, 350, y + 7, 30, { align: "left", color: i === staff.selected ? "#ffd166" : "#ffffff" });
      this.text(value, 1250, y + 7, i === 3 ? 23 : 30, { align: "right", weight: 600 });
    });
    this.text(staff.editing ? "Type the event name • Enter to finish" : "↑ ↓ select  •  Enter act  •  Esc close", WIDTH / 2, 760, 27, { weight: 500 });
  }

  intro(game) {
    const Round = game.roundClass;
    const count = Math.max(1, Math.ceil(Game.INTRO - game.timer));
    this.text(`Round ${game.round + 1} of 3`, WIDTH / 2, 230, 38, { weight: 600, color: "#ffd166" });
    this.text(Round.NAME, WIDTH / 2, 330, 120, { weight: 900 });
    this.text(Round.HINT, WIDTH / 2, 440, 42, { weight: 600 });
    this.text(String(count), WIDTH / 2, 620, 160, { weight: 900 });
  }

  play(game) {
    const stage = game.stage;
    const so = game.results.reduce((sum, r) => sum + r.points, 0);
    // Score bar.
    this.panel(40, 24, WIDTH - 80, 80, 0.3);
    this.text(`Round ${game.round + 1}: ${stage.name}`, 80, 64, 34, { align: "left" });
    this.text(`${Math.round(so + stage.points)}`, WIDTH - 80, 64, 40, { align: "right", weight: 900 });
    const barW = 560;
    const left = WIDTH / 2 - barW / 2;
    this.ctx.fillStyle = "rgba(255,255,255,0.25)";
    this.ctx.fillRect(left, 56, barW, 16);
    this.ctx.fillStyle = stage.remaining < 5 ? "#ff7a59" : "#ffd166";
    this.ctx.fillRect(left, 56, barW * (stage.remaining / stage.duration), 16);
    if (stage.name === "Flick") this.flick(stage);
    if (stage.name === "Track") this.track(stage);
    if (stage.name === "Read") this.read(stage);
    this.effects(stage);
  }

  flick(stage) {
    const t = stage.target;
    const age = stage.time - t.bornAt;
    const grow = Math.min(1, age / 0.08);
    this.ctx.save();
    this.ctx.shadowColor = "rgba(0, 30, 70, 0.35)";
    this.ctx.shadowBlur = 18;
    this.puff(this.ctx, t.x, t.y, t.r * 1.15 * grow, "#ffffff");
    this.ctx.restore();
    this.ctx.strokeStyle = "rgba(255, 209, 102, 0.9)";
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    this.ctx.stroke();
    if (stage.streak >= 3) this.text(`Streak ${stage.streak}`, 80, 145, 28, { align: "left", color: "#ffd166" });
  }

  stormShape(x, y, r, charge) {
    const c = this.ctx;
    c.save();
    // A warm glow rim keeps storms readable on every sky, day or night.
    c.shadowColor = "rgba(255, 110, 80, 0.95)";
    c.shadowBlur = 26;
    this.puff(c, x, y, r * 1.2, "#3d3557");
    c.shadowBlur = 0;
    this.puff(c, x, y, r * 1.2, "#3d3557");
    c.restore();
    c.strokeStyle = "#ffd166";
    c.lineWidth = 6;
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(x + r * 0.1, y - r * 0.5);
    c.lineTo(x - r * 0.2, y + r * 0.05);
    c.lineTo(x + r * 0.08, y + r * 0.05);
    c.lineTo(x - r * 0.15, y + r * 0.55);
    c.stroke();
    if (charge !== null) {
      c.strokeStyle = "rgba(255,255,255,0.9)";
      c.lineWidth = 6;
      c.beginPath();
      c.arc(x, y, r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      c.stroke();
    }
  }

  track(stage) {
    const s = stage.storm;
    this.stormShape(s.x, s.y, s.r, s.charge / 1.6);
    if (stage.locked) {
      this.ctx.strokeStyle = "rgba(255, 209, 102, 0.85)";
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, s.r + 26, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    const share = stage.time > 0 ? Math.round((100 * stage.onTarget) / stage.time) : 0;
    this.text(`On target ${share}%`, 80, 145, 28, { align: "left", color: "#ffffff" });
  }

  read(stage) {
    const t = stage.target;
    if (!t) return;
    const left = 1 - (stage.time - t.bornAt) / t.life;
    if (t.hostile) {
      this.stormShape(t.x, t.y, t.r, left);
    } else {
      this.ctx.save();
      this.ctx.shadowColor = "rgba(0, 30, 70, 0.3)";
      this.ctx.shadowBlur = 16;
      this.puff(this.ctx, t.x, t.y, t.r * 1.2, "#f4fbff");
      this.ctx.restore();
      // A small star marks a friendly cloud, so color is not the only cue.
      this.star(t.x, t.y, 18, "#5fb3ff");
    }
  }

  star(x, y, r, color) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }

  effects(stage) {
    for (const e of stage.effects) {
      const age = stage.time - e.at;
      if (age > 0.6) continue;
      const k = age / 0.6;
      const c = this.ctx;
      c.globalAlpha = 1 - k;
      if (e.kind === "burst") {
        c.strokeStyle = "#ffffff";
        c.lineWidth = 5;
        c.beginPath();
        c.arc(e.x, e.y, 30 + 60 * k, 0, Math.PI * 2);
        c.stroke();
      }
      if (e.kind === "miss" || e.kind === "wrong") {
        c.strokeStyle = "#ff7a59";
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(e.x - 14, e.y - 14);
        c.lineTo(e.x + 14, e.y + 14);
        c.moveTo(e.x + 14, e.y - 14);
        c.lineTo(e.x - 14, e.y + 14);
        c.stroke();
      }
      if (e.text) this.text(e.text, e.x, e.y - 50 - 40 * k, 30, { color: e.kind === "burst" ? "#ffd166" : "#ff9f86" });
      c.globalAlpha = 1;
    }
  }

  results(game) {
    const s = game.score;
    this.text("YOUR RUN", WIDTH / 2, 120, 36, { weight: 600, color: "#ffd166" });
    this.text(String(s.total), WIDTH / 2, 220, 140, { weight: 900 });
    this.text(s.tier, WIDTH / 2, 320, 56, { weight: 800, color: "#ffd166" });
    this.text(game.place === 1 ? "#1 today!" : `#${game.place} today`, WIDTH / 2, 385, 34, { weight: 600 });
    const bars = [["Aim", s.aim], ["Tracking", s.tracking], ["Decisions", s.decisions]];
    bars.forEach(([label, value], i) => {
      const y = 470 + i * 80;
      this.text(label, WIDTH / 2 - 330, y, 34, { align: "left" });
      this.ctx.fillStyle = "rgba(255,255,255,0.22)";
      this.ctx.fillRect(WIDTH / 2 - 120, y - 14, 380, 28);
      this.ctx.fillStyle = "#ffd166";
      this.ctx.fillRect(WIDTH / 2 - 120, y - 14, (380 * value) / 100, 28);
      this.text(String(value), WIDTH / 2 + 330, y, 34, { align: "right" });
    });
    if (s.reaction !== null) this.text(`Average reaction ${s.reaction} ms`, WIDTH / 2, 720, 30, { weight: 500 });
    if (game.timer > 1.5) this.text("Click to add your initials", WIDTH / 2, 810, 38);
  }

  initials(game, pointer) {
    this.text("Your initials for the board", WIDTH / 2, 130, 44);
    for (let i = 0; i < 3; i += 1) {
      const x = WIDTH / 2 - 150 + i * 110;
      this.panel(x, 190, 90, 110, 0.35);
      this.text(game.initials[i] || "_", x + 45, 248, 70, { weight: 900, color: "#ffd166" });
    }
    for (const k of Game.keyboard()) {
      const over = pointer.x >= k.x && pointer.x <= k.x + k.w && pointer.y >= k.y && pointer.y <= k.y + k.h;
      this.panel(k.x, k.y, k.w, k.h, over ? 0.75 : 0.4);
      this.text(k.label, k.x + k.w / 2, k.y + k.h / 2, k.label.length > 1 ? 30 : 38);
    }
  }

  crosshair(x, y) {
    const c = this.ctx;
    for (const [color, width] of [["rgba(10,25,50,0.7)", 6], ["#ffffff", 2.5]]) {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(x - 22, y);
      c.lineTo(x - 7, y);
      c.moveTo(x + 7, y);
      c.lineTo(x + 22, y);
      c.moveTo(x, y - 22);
      c.lineTo(x, y - 7);
      c.moveTo(x, y + 7);
      c.lineTo(x, y + 22);
      c.stroke();
    }
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(x, y, 2.5, 0, Math.PI * 2);
    c.fill();
  }
}
