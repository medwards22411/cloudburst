import assert from "node:assert/strict";
import test from "node:test";
import { ScoreStore } from "../js/scores.js";

const DAY = "2027-01-05";
const OTHER_DAY = "2027-01-04";
const score = (initials, total, date = DAY, at = 0) => ({ initials, total, aim: 50, tracking: 60, decisions: 70, tier: "Cirrus", date, at });

function memoryStorage(initial = []) {
  const values = new Map([[ScoreStore.KEY, JSON.stringify(initial)]]);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("stats count only the requested day and return an exact average", () => {
  const store = new ScoreStore(memoryStorage([score("AAA", 11), score("BBB", 20), score("OLD", 500, OTHER_DAY)]));
  assert.deepEqual(store.stats(DAY), { count: 2, best: 20, average: 15.5 });
  assert.deepEqual(store.stats(OTHER_DAY), { count: 1, best: 500, average: 500 });
  assert.deepEqual(store.stats("2027-01-06"), { count: 0, best: 0, average: 0 });
});

test("clearDay saves only other days and broadcasts after the storage write", () => {
  const original = globalThis.BroadcastChannel;
  const scores = [score("AAA", 100), score("OLD", 50, OTHER_DAY), score("BBB", 20)];
  const storage = memoryStorage(scores);
  storage.values.set(ScoreStore.LATEST_KEY, JSON.stringify(scores[0]));
  const messages = [];
  let closed = false;
  try {
    globalThis.BroadcastChannel = class {
      constructor(name) { assert.equal(name, "cloudburst"); }
      postMessage(message) {
        assert.deepEqual(JSON.parse(storage.values.get(ScoreStore.KEY)), [scores[1]]);
        messages.push(message);
      }
      close() { closed = true; }
    };
    const store = new ScoreStore(storage);
    assert.equal(store.clearDay(DAY), 2);
    assert.deepEqual(store.all(), [scores[1]]);
    assert.deepEqual(messages, [{ type: "scores-cleared", date: DAY, scores: [scores[1]], persisted: true }]);
    assert.equal(closed, true);
    assert.equal(JSON.parse(storage.values.get(ScoreStore.LATEST_KEY)), null);
    assert.equal(store.clearDay(DAY), 0);
    assert.deepEqual(messages[1], { type: "scores-cleared", date: DAY, scores: [scores[1]], persisted: true });
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("clearing preserves the latest score from another day and works without a channel", () => {
  const original = globalThis.BroadcastChannel;
  const old = score("OLD", 50, OTHER_DAY);
  const storage = memoryStorage([score("AAA", 100), old]);
  storage.values.set(ScoreStore.LATEST_KEY, JSON.stringify(old));
  try {
    globalThis.BroadcastChannel = undefined;
    assert.equal(new ScoreStore(storage).clearDay(DAY), 1);
    assert.deepEqual(JSON.parse(storage.values.get(ScoreStore.LATEST_KEY)), old);
    assert.deepEqual(JSON.parse(storage.values.get(ScoreStore.KEY)), [old]);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("clearing a day with no retained scores still clears and announces a dropped latest score", () => {
  const original = globalThis.BroadcastChannel;
  const storage = memoryStorage([score("OLD", 50, OTHER_DAY)]);
  storage.values.set(ScoreStore.LATEST_KEY, JSON.stringify(score("LOW", 1)));
  const messages = [];
  try {
    globalThis.BroadcastChannel = class {
      postMessage(message) { messages.push(message); }
      close() {}
    };
    assert.equal(new ScoreStore(storage).clearDay(DAY), 0);
    assert.equal(JSON.parse(storage.values.get(ScoreStore.LATEST_KEY)), null);
    assert.deepEqual(messages, [{ type: "scores-cleared", date: DAY, scores: [score("OLD", 50, OTHER_DAY)], persisted: true }]);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("CSV includes all scores, escapes fields, and formats the timestamp in local time", () => {
  const time = new Date(2027, 0, 5, 7, 8, 9).getTime();
  const entry = { ...score("A,B", 123, DAY, time), aim: null, tier: 'Cloud, "Nine"\r\nline' };
  const other = { ...score("OLD", 2, OTHER_DAY, NaN), tracking: undefined };
  const store = new ScoreStore(null);
  store.memory = [entry, other];
  assert.equal(store.toCsv(), 'initials,total,aim,tracking,decisions,tier,date,time\r\n"A,B",123,,60,70,"Cloud, ""Nine""\r\nline",2027-01-05,07:08:09\r\nOLD,2,50,,70,Cirrus,2027-01-04,');
  assert.equal(new ScoreStore(null).toCsv(), "initials,total,aim,tracking,decisions,tier,date,time");
});

test("a failed score write falls back to memory without losing later additions or clears", () => {
  const original = globalThis.BroadcastChannel;
  const old = score("OLD", 50, OTHER_DAY);
  const storage = memoryStorage([old]);
  const messages = [];
  storage.setItem = () => { throw new Error("quota exceeded"); };
  try {
    globalThis.BroadcastChannel = class {
      postMessage(message) { messages.push(message); }
      close() {}
    };
    const store = new ScoreStore(storage);
    const added = store.add(score("NEW", 100));
    assert.deepEqual(store.all(), [added, old]);
    assert.equal(store.clearDay(DAY), 1);
    assert.deepEqual(store.all(), [old]);
    assert.deepEqual(messages.at(-1), { type: "scores-cleared", date: DAY, scores: [old], persisted: false });
    assert.deepEqual(JSON.parse(storage.values.get(ScoreStore.KEY)), [old]);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("a failed clear write retains the other days in memory and sends the fallback snapshot", () => {
  const original = globalThis.BroadcastChannel;
  const old = score("OLD", 50, OTHER_DAY);
  const storage = memoryStorage([score("AAA", 100), old]);
  const messages = [];
  storage.setItem = () => { throw new Error("storage unavailable"); };
  try {
    globalThis.BroadcastChannel = class {
      postMessage(message) { messages.push(message); }
      close() {}
    };
    const store = new ScoreStore(storage);
    assert.equal(store.clearDay(DAY), 1);
    assert.deepEqual(store.all(), [old]);
    assert.deepEqual(messages, [{ type: "scores-cleared", date: DAY, scores: [old], persisted: false }]);
    const added = store.add(score("NEW", 75, OTHER_DAY));
    assert.deepEqual(store.all(), [added, old]);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("channel and latest-key failures do not undo a successful clear", () => {
  const original = globalThis.BroadcastChannel;
  const storage = memoryStorage([score("AAA", 100), score("OLD", 50, OTHER_DAY)]);
  storage.values.set(ScoreStore.LATEST_KEY, JSON.stringify(score("AAA", 100)));
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === ScoreStore.LATEST_KEY) throw new Error("unavailable");
    set(key, value);
  };
  try {
    globalThis.BroadcastChannel = class { constructor() { throw new Error("unavailable"); } };
    const store = new ScoreStore(storage);
    assert.equal(store.clearDay(DAY), 1);
    assert.deepEqual(store.all(), [score("OLD", 50, OTHER_DAY)]);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("a failed read keeps the last successful snapshot available in memory", () => {
  const old = score("OLD", 50, OTHER_DAY);
  const storage = memoryStorage([old]);
  const store = new ScoreStore(storage);
  assert.deepEqual(store.all(), [old]);
  storage.getItem = () => { throw new Error("storage unavailable"); };
  assert.deepEqual(store.all(), [old]);
  assert.deepEqual(store.stats(OTHER_DAY), { count: 1, best: 50, average: 50 });
});

test("a memory-only clear broadcasts its snapshot even when posting throws", () => {
  const original = globalThis.BroadcastChannel;
  let closed = false;
  let message;
  try {
    globalThis.BroadcastChannel = class {
      postMessage(value) {
        message = value;
        throw new Error("unavailable");
      }
      close() { closed = true; }
    };
    const store = new ScoreStore(null);
    store.memory = [score("AAA", 100)];
    assert.equal(store.clearDay(DAY), 1);
    assert.deepEqual(store.all(), []);
    assert.deepEqual(message, { type: "scores-cleared", date: DAY, scores: [], persisted: false });
    assert.equal(closed, true);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});

test("a successful clear refreshes the existing board through its storage listener", async () => {
  const originals = Object.fromEntries(["document", "window", "localStorage", "BroadcastChannel", "setInterval"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class Element {
    constructor() { this.children = []; this.textContent = ""; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
  }
  const elements = Object.fromEntries(["today-rows", "all-time-rows", "new-score", "date"].map((id) => [id, new Element()]));
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const otherDay = today === OTHER_DAY ? DAY : OTHER_DAY;
  const values = new Map([[ScoreStore.KEY, JSON.stringify([score("AAA", 100, today), score("OLD", 50, otherDay)])]]);
  let onStorage;
  try {
    globalThis.document = { getElementById: (id) => elements[id], createElement: () => new Element() };
    globalThis.window = { addEventListener: (type, handler) => { if (type === "storage") onStorage = handler; } };
    globalThis.localStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        const oldValue = values.get(key) ?? null;
        values.set(key, value);
        if (oldValue !== value && onStorage) onStorage({ key, oldValue, newValue: value });
      },
      removeItem: (key) => values.delete(key),
    };
    globalThis.BroadcastChannel = undefined;
    globalThis.setInterval = () => {};
    await import("../js/board.js?clear-storage-test");
    assert.equal(elements["today-rows"].children[0].children[1].textContent, "AAA");
    assert.equal(new ScoreStore(globalThis.localStorage).clearDay(today), 1);
    assert.equal(elements["today-rows"].children[0].children[0].textContent, "Be the first to play!");
    assert.equal(elements["all-time-rows"].children[0].children[1].textContent, "OLD");
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});