import assert from "node:assert/strict";
import test from "node:test";
import { boardModel } from "../js/board.js";
import { ScoreStore } from "../js/scores.js";

const DAY = "2027-01-05";
const OTHER_DAY = "2027-01-04";
const score = (initials, total, date = DAY, at = total) => ({ initials, total, aim: 50, tracking: 50, decisions: 50, tier: "Cirrus", date, at });

test("the board orders today's top 10 and the all-time top 5, breaking ties by time", () => {
  const scores = Array.from({ length: 12 }, (_, i) => score(`P${i}`, i * 100));
  scores.push(score("OLD", 2000, OTHER_DAY), score("TIE", 1100, DAY, 1));
  const before = scores.slice();
  const model = boardModel(scores, DAY, null, 0);
  assert.deepEqual(model.today.map((row) => row.entry.initials), ["TIE", "P11", "P10", "P9", "P8", "P7", "P6", "P5", "P4", "P3"]);
  assert.deepEqual(model.today.map((row) => row.place), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(model.allTime.map((row) => row.entry.initials), ["OLD", "TIE", "P11", "P10", "P9"]);
  assert.deepEqual(scores, before, "the input is not mutated");
});

test("the newest entry glows and is announced for exactly 10 seconds", () => {
  const entry = score("ACE", 100);
  const newest = { entry, receivedAt: 5000 };
  const active = boardModel([{ ...entry }], DAY, newest, 14999);
  assert.equal(active.banner, "NEW: ACE 100 (Cirrus)");
  assert.equal(active.today[0].highlight, true);
  assert.equal(active.allTime[0].highlight, true);
  const expired = boardModel([entry], DAY, newest, 15000);
  assert.equal(expired.banner, null);
  assert.equal(expired.today[0].highlight, false);
  assert.equal(boardModel([entry], DAY, newest, 4999).banner, null);
});

test("a new entry outside today's top 10 still gets a banner", () => {
  const scores = Array.from({ length: 10 }, (_, i) => score(`P${i}`, 1000 + i));
  const entry = score("LOW", 1);
  const model = boardModel([...scores, entry], DAY, { entry, receivedAt: 100 }, 100);
  assert.equal(model.banner, "NEW: LOW 1 (Cirrus)");
  assert.equal(model.today.length, 10);
  assert.ok(model.today.every((row) => !row.highlight));
});

test("today's list rolls over without changing the all-time list", () => {
  const scores = [score("OLD", 100, DAY), score("NEW", 50, "2027-01-06")];
  const before = boardModel(scores, DAY, null, 0);
  const after = boardModel(scores, "2027-01-06", null, 0);
  assert.deepEqual(before.today.map((row) => row.entry.initials), ["OLD"]);
  assert.deepEqual(after.today.map((row) => row.entry.initials), ["NEW"]);
  assert.deepEqual(after.allTime, before.allTime);
});

test("saving posts the cleaned entry after storage and closes the channel", () => {
  const original = globalThis.BroadcastChannel;
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const messages = [];
  let closed = false;
  try {
    globalThis.BroadcastChannel = class {
      constructor(name) { assert.equal(name, "cloudburst"); }
      postMessage(message) {
        assert.deepEqual(JSON.parse(values.get(ScoreStore.KEY)), [message.entry]);
        messages.push(message);
      }
      close() { closed = true; }
    };
    const saved = new ScoreStore(storage).add(score("ace", 10));
    assert.deepEqual(messages, [{ type: "score", entry: saved }]);
    assert.equal(closed, true);
    assert.deepEqual(JSON.parse(values.get(ScoreStore.LATEST_KEY)), saved);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("saving works without BroadcastChannel and announces scores dropped by the limit", () => {
  const original = globalThis.BroadcastChannel;
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  try {
    globalThis.BroadcastChannel = undefined;
    values.set(ScoreStore.KEY, JSON.stringify(Array.from({ length: ScoreStore.LIMIT }, (_, i) => score("TOP", 1000 + i))));
    const store = new ScoreStore(storage);
    const saved = store.add(score("LOW", 1));
    assert.equal(store.all().length, ScoreStore.LIMIT);
    assert.ok(store.all().every((entry) => entry.initials !== "LOW"));
    assert.deepEqual(JSON.parse(values.get(ScoreStore.LATEST_KEY)), saved);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("a score still saves if the browser cannot open a broadcast channel", () => {
  const original = globalThis.BroadcastChannel;
  try {
    globalThis.BroadcastChannel = class { constructor() { throw new Error("unavailable"); } };
    const store = new ScoreStore(null);
    const saved = store.add(score("ACE", 10));
    assert.deepEqual(store.all(), [saved]);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("the board refreshes when a broadcast arrives before storage is visible", async () => {
  const originals = Object.fromEntries(["document", "window", "localStorage", "BroadcastChannel", "setInterval"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class Element {
    constructor() { this.children = []; this.textContent = ""; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
  }
  const elements = Object.fromEntries(["today-rows", "all-time-rows", "new-score", "date"].map((id) => [id, new Element()]));
  const values = new Map();
  let onMessage;
  let tick;
  try {
    globalThis.document = { getElementById: (id) => elements[id], createElement: () => new Element() };
    globalThis.window = { addEventListener() {} };
    globalThis.localStorage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    globalThis.BroadcastChannel = class { addEventListener(type, handler) { onMessage = handler; } };
    globalThis.setInterval = (callback) => { tick = callback; };
    await import("../js/board.js?runtime-test");
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const entry = score("ACE", 500, today, Date.now());
    onMessage({ data: { type: "score", entry } });
    assert.equal(elements["new-score"].textContent, "NEW: ACE 500 (Cirrus)");
    assert.equal(elements["today-rows"].children[0].children[0].textContent, "Be the first to play!");
    values.set(ScoreStore.KEY, JSON.stringify([entry]));
    tick();
    assert.equal(elements["today-rows"].children[0].children[1].textContent, "ACE");
    assert.equal(elements["today-rows"].children[0].className, "highlight");
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});