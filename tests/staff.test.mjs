import assert from "node:assert/strict";
import test from "node:test";
import { ScoreStore } from "../js/scores.js";
import { SettingsStore, StaffPanel } from "../js/staff.js";

const DAY = "2027-01-05";

function storage(initial = null) {
  const values = new Map(initial === null ? [] : [[SettingsStore.KEY, initial]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("settings have safe defaults, validate corrupt data, and persist under one key", () => {
  for (const value of ["{", "null", "[]", '{"eventName":12,"soundOn":"no"}']) {
    const settings = new SettingsStore(storage(value));
    assert.deepEqual(settings.value, { eventName: "", soundOn: true });
  }
  const saved = storage();
  const settings = new SettingsStore(saved);
  settings.set({ eventName: "Cloud Nine", soundOn: false });
  assert.deepEqual(new SettingsStore(saved).value, { eventName: "Cloud Nine", soundOn: false });
  assert.deepEqual(new SettingsStore(null).value, { eventName: "", soundOn: true });
  const broken = new SettingsStore({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  broken.set({ eventName: "Offline" });
  assert.equal(broken.value.eventName, "Offline");
});

test("settings notify other windows and limit event names", () => {
  const original = globalThis.BroadcastChannel;
  const messages = [];
  let closed = 0;
  try {
    globalThis.BroadcastChannel = class {
      constructor(name) { assert.equal(name, "cloudburst"); }
      postMessage(message) { messages.push(message); }
      close() { closed += 1; }
    };
    const settings = new SettingsStore(null);
    settings.set({ eventName: "x".repeat(30) });
    assert.equal(settings.value.eventName, "x".repeat(24));
    assert.deepEqual(messages, [{ type: "settings", settings: settings.value }]);
    assert.equal(closed, 1);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("panel opens only at idle, edits text, toggles sound, and closes", () => {
  const settings = new SettingsStore(null);
  const panel = new StaffPanel({ stats: () => ({}), clearDay() {} }, settings, () => DAY);
  assert.equal(panel.toggle("play"), false);
  assert.equal(panel.open, false);
  assert.equal(panel.toggle("attract"), true);
  panel.key("Enter");
  for (const char of "Cloud Nine") panel.key(char);
  panel.key("Backspace");
  panel.key("!");
  panel.key("Enter");
  assert.equal(settings.value.eventName, "Cloud Nin!");
  panel.key("ArrowRight");
  panel.key("Enter");
  assert.equal(settings.value.soundOn, false);
  panel.key("Escape");
  assert.equal(panel.open, false);
});

test("export is an action and clearing requires two presses within three seconds", () => {
  let now = 1000;
  let day = DAY;
  const cleared = [];
  const panel = new StaffPanel({ stats: () => ({}), clearDay: (date) => cleared.push(date) }, new SettingsStore(null), () => day, () => now);
  panel.toggle("attract");
  panel.key("ArrowDown");
  panel.key("ArrowDown");
  assert.equal(panel.key("Enter"), "export");
  panel.key("ArrowDown");
  panel.key("Enter");
  now += 3001;
  panel.key("Enter");
  assert.deepEqual(cleared, []);
  now += 2999;
  panel.key("Enter");
  assert.deepEqual(cleared, [DAY]);
  panel.key("Enter");
  day = "2027-01-06";
  panel.key("Enter");
  assert.deepEqual(cleared, [DAY], "confirmation cannot clear a different day");
  panel.key("ArrowUp");
  panel.key("ArrowDown");
  panel.key("Enter");
  assert.deepEqual(cleared, [DAY], "moving away cancels confirmation");
});

test("the game window isolates panel keyboard and mouse input and downloads CSV", async () => {
  const keys = ["document", "addEventListener", "requestAnimationFrame", "OffscreenCanvas", "devicePixelRatio", "innerWidth", "innerHeight", "localStorage", "BroadcastChannel", "cloudburst"];
  const originals = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = {};
  const canvasListeners = {};
  const downloads = [];
  const text = [];
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), fillText: (value) => text.push(value) }, { get: (target, key) => target[key] || (() => {}) });
  const canvas = { getContext: () => context, addEventListener: (type, cb) => { canvasListeners[type] = cb; }, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  try {
    globalThis.document = {
      getElementById: () => canvas,
      createElement: () => ({ click() { downloads.push(this.download); } }),
    };
    globalThis.OffscreenCanvas = class { getContext() { return context; } };
    globalThis.addEventListener = (type, cb) => { listeners[type] = cb; };
    globalThis.requestAnimationFrame = () => {};
    globalThis.devicePixelRatio = 1;
    globalThis.innerWidth = 1600;
    globalThis.innerHeight = 900;
    globalThis.localStorage = { ...storage(), removeItem() {} };
    globalThis.BroadcastChannel = undefined;
    await import("../js/main.js?staff-runtime-test");
    const app = globalThis.cloudburst;
    const press = (key, extra = {}) => listeners.keydown({ key, preventDefault() {}, ...extra });
    const shortcut = () => press("S", { ctrlKey: true, shiftKey: true });
    shortcut();
    assert.equal(app.staff.open, true);
    canvasListeners.pointerdown({ clientX: 10, clientY: 10 });
    press("Enter");
    press("m");
    press("f");
    press("Enter");
    assert.equal(app.settings.value.eventName, "mf");
    assert.equal(app.sound.muted, false);
    app.frame(app.last + 16);
    assert.equal(app.game.state, "attract");
    assert.ok(text.includes("STAFF PANEL"));
    assert.ok(text.includes("mf"));
    press("ArrowDown");
    press("ArrowDown");
    press("Enter");
    assert.match(downloads[0], /^cloudburst-scores-\d{4}-\d{2}-\d{2}\.csv$/);
    let clears = 0;
    app.store.clearDay = () => { clears += 1; };
    press("ArrowDown");
    press("Enter");
    press("Enter", { repeat: true });
    assert.equal(clears, 0, "holding Enter must not confirm a clear");
    press("Enter");
    assert.equal(clears, 1);
    press("Escape");
    assert.equal(app.staff.open, false);
    assert.equal(app.game.state, "attract");
    shortcut();
    shortcut();
    app.frame(app.last + 16);
    assert.equal(app.game.state, "attract");
    app.game.start();
    shortcut();
    assert.equal(app.staff.open, false);
    assert.equal(app.game.state, "intro");
    assert.equal(app.key, null);
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("the second screen updates settings and cleared scores via channel and storage", async () => {
  const keys = ["document", "window", "localStorage", "BroadcastChannel", "setInterval"];
  const originals = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class Element {
    constructor() { this.children = []; this.textContent = ""; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
  }
  const elements = Object.fromEntries(["today-rows", "all-time-rows", "new-score", "date", "event-name"].map((id) => [id, new Element()]));
  const values = new Map();
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const score = (initials, date, total) => ({ initials, total, aim: 1, tracking: 1, decisions: 1, tier: "Drizzle", date, at: Date.now() });
  const current = score("NEW", day, 100);
  const old = score("OLD", "2020-01-01", 50);
  values.set(ScoreStore.KEY, JSON.stringify([current, old]));
  values.set(ScoreStore.LATEST_KEY, JSON.stringify(current));
  values.set(SettingsStore.KEY, JSON.stringify({ eventName: "Initial", soundOn: true }));
  let onMessage;
  let onStorage;
  let tick;
  try {
    globalThis.document = { getElementById: (id) => elements[id], createElement: () => new Element() };
    globalThis.window = { addEventListener: (type, cb) => { if (type === "storage") onStorage = cb; } };
    globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
    globalThis.BroadcastChannel = class { addEventListener(type, cb) { onMessage = cb; } };
    globalThis.setInterval = (cb) => { tick = cb; };
    await import("../js/board.js?staff-runtime-test");
    assert.equal(elements["event-name"].textContent, "Initial");
    assert.match(elements["new-score"].textContent, /NEW: NEW/);
    onMessage({ data: { type: "settings", settings: { eventName: "<Event>", soundOn: false } } });
    assert.equal(elements["event-name"].textContent, "<Event>");
    onStorage({ key: SettingsStore.KEY, newValue: JSON.stringify({ eventName: "Storage event", soundOn: true }) });
    assert.equal(elements["event-name"].textContent, "Storage event");
    onMessage({ data: { type: "scores-cleared", date: day, scores: [old], persisted: true } });
    assert.equal(elements["new-score"].textContent, "");
    assert.equal(elements["today-rows"].children[0].children[0].textContent, "Be the first to play!");
    assert.equal(elements["all-time-rows"].children[0].children[1].textContent, "OLD");
    tick();
    assert.equal(elements["all-time-rows"].children[0].children[1].textContent, "OLD", "stale storage must not undo the clear");
    values.set(ScoreStore.KEY, JSON.stringify([old]));
    tick();
    onMessage({ data: { type: "scores-cleared", date: day, scores: [old], persisted: false } });
    const later = score("BOT", day, 70);
    onMessage({ data: { type: "score", entry: later } });
    assert.equal(elements["today-rows"].children[0].children[1].textContent, "BOT", "memory-only scores follow a clear");
    onStorage({ key: ScoreStore.LATEST_KEY, newValue: "null" });
    assert.equal(elements["new-score"].textContent, "");
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});