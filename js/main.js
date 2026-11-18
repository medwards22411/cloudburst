import { Sound } from "./audio.js";
import { Game } from "./game.js";
import { Renderer } from "./render.js";
import { ScoreStore } from "./scores.js";
import { SettingsStore, StaffPanel } from "./staff.js";
import { HEIGHT, WIDTH, pointer } from "./stages.js";

/**
 * Connects the game to the browser: one canvas, one animation loop, one set of input
 * listeners for the whole session, so the booth can run all day without anything
 * piling up.
 */
class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.store = new ScoreStore();
    this.settings = new SettingsStore();
    this.game = new Game(this.store, App.today);
    this.staff = new StaffPanel(this.store, this.settings, App.today);
    this.renderer = new Renderer(this.ctx);
    this.sound = new Sound();
    this.sound.muted = !this.settings.value.soundOn;
    this.mouse = { x: WIDTH / 2, y: HEIGHT / 2 };
    this.clicked = false;
    this.key = null;
    this.last = performance.now();
    this.effectsSeen = 0;
    this.lastState = this.game.state;
    this.lastCount = 0;
    this.fit();
    addEventListener("resize", () => this.fit());
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerdown", (e) => {
      this.move(e);
      if (!this.staff.open) this.clicked = true;
      this.sound.unlock();
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("keydown", (e) => this.keydown(e));
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Today as "YYYY-MM-DD" in the booth's own time zone. */
  static today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** Fit the logical WIDTH x HEIGHT space to the window, letterboxed, at device pixels. */
  fit() {
    const ratio = devicePixelRatio || 1;
    this.canvas.width = Math.round(innerWidth * ratio);
    this.canvas.height = Math.round(innerHeight * ratio);
    this.scale = Math.min(innerWidth / WIDTH, innerHeight / HEIGHT);
    this.offsetX = (innerWidth - WIDTH * this.scale) / 2;
    this.offsetY = (innerHeight - HEIGHT * this.scale) / 2;
    this.ratio = ratio;
  }

  move(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = (e.clientX - rect.left - this.offsetX) / this.scale;
    this.mouse.y = (e.clientY - rect.top - this.offsetY) / this.scale;
  }

  keydown(e) {
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!e.repeat && this.game.state === "attract") {
        this.staff.toggle(this.game.state);
        this.key = null;
        this.clicked = false;
      }
      return;
    }
    if (this.staff.open) {
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey || e.altKey) || (e.repeat && e.key === "Enter")) return;
      const soundOn = this.settings.value.soundOn;
      const action = this.staff.key(e.key);
      if (soundOn !== this.settings.value.soundOn) this.sound.muted = !this.settings.value.soundOn;
      if (action === "export") this.exportScores();
      this.sound.unlock();
      return;
    }
    if (e.key === "m" || e.key === "M") {
      if (this.game.state !== "initials") this.sound.toggle();
    }
    if (e.key === "f" || e.key === "F") {
      if (this.game.state !== "initials") this.toggleFullscreen();
    }
    if (e.key === "Backspace" || e.key === " ") e.preventDefault();
    this.key = e.key;
    this.sound.unlock();
  }

  exportScores() {
    const blob = new Blob([this.store.toCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cloudburst-scores-${App.today()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  /** Play sounds for what changed this frame: new effects, countdown ticks, the end. */
  sounds() {
    const g = this.game;
    if (g.state === "play") {
      const effects = g.stage.effects;
      const newest = effects.length ? effects[effects.length - 1].at : -1;
      if (newest > this.effectsSeen) {
        this.sound.effect(effects[effects.length - 1].kind);
        this.effectsSeen = newest;
      }
    } else {
      this.effectsSeen = -1;
    }
    if (g.state === "intro") {
      const count = Math.ceil(Game.INTRO - g.timer);
      if (count !== this.lastCount && count > 0) this.sound.tick();
      this.lastCount = count;
    }
    if (g.state !== this.lastState) {
      if (g.state === "play") this.sound.go();
      if (g.state === "results") this.sound.fanfare();
      this.lastState = g.state;
    }
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const input = pointer(this.mouse.x, this.mouse.y, this.staff.open ? false : this.clicked);
    this.game.update(dt, input, this.staff.open ? null : this.key);
    this.clicked = false;
    this.key = null;
    this.sounds();
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#0b1a33";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale * this.ratio, 0, 0, this.scale * this.ratio, this.offsetX * this.ratio, this.offsetY * this.ratio);
    c.save();
    c.beginPath();
    c.rect(0, 0, WIDTH, HEIGHT);
    c.clip();
    const board = this.game.state === "attract" ? this.store.top(10, App.today()) : [];
    this.renderer.draw(this.game, this.mouse, board, dt, this.settings.value, this.staff);
    c.restore();
    requestAnimationFrame((t) => this.frame(t));
  }
}

// Exposed for the browser console and automated checks; the game never reads it.
globalThis.cloudburst = new App(document.getElementById("game"));
