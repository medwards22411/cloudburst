import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { Game } from "../js/game.js";
import { ScoreStore } from "../js/scores.js";
import { pointer } from "../js/stages.js";
import { Bot, PROFILES } from "./bots.mjs";

const DAY = "2027-01-05";
const DT = 1 / 60;
const idle = pointer(0, 0);

// The median of five 10-run, frame-weighted batches tolerates occasional GC or
// scheduler pauses without letting a handful of fast runs hide sustained growth.
function medianBatchTime(runs) {
  const batches = [];
  for (let i = 0; i < runs.length; i += 10) {
    const batch = runs.slice(i, i + 10);
    const elapsed = batch.reduce((sum, run) => sum + run.elapsed, 0);
    const frames = batch.reduce((sum, run) => sum + run.frames, 0);
    batches.push(elapsed / frames);
  }
  return batches.sort((a, b) => a - b)[Math.floor(batches.length / 2)];
}

test("300 mixed runs reset cleanly and do not slow down", (t) => {
  const started = performance.now();
  const store = new ScoreStore(null);
  // Start at capacity so the limit and the cost of a full booth board are exercised
  // throughout both timing windows, rather than only after 500 players.
  for (let i = 0; i < ScoreStore.LIMIT; i += 1) {
    store.add({ initials: "OLD", total: 0, date: DAY, at: i - ScoreStore.LIMIT });
  }
  let runNumber = 0;
  const game = new Game(store, () => DAY, () => runNumber);
  const profiles = Object.values(PROFILES);
  const timings = [];
  const maxEffects = new Map();
  const outcomes = { saved: 0, resultsWalkaway: 0, initialsWalkaway: 0, abandoned: [0, 0, 0] };

  for (runNumber = 0; runNumber < 300; runNumber += 1) {
    // Repeat the same mix every 50 runs, including an abandonment in each round
    // and both ways to walk away without entering initials.
    const slot = runNumber % 50;
    const abandonRound = slot < 3 ? slot : -1;
    const walkaway = slot === 3 ? "results" : slot === 4 ? "initials" : null;
    const bot = new Bot(profiles[slot % profiles.length], runNumber + 1);
    const before = store.all();
    const previousSaved = game.lastSaved;
    let frames = 0;
    let aborted = false;
    let sawResults = false;
    let sawInitials = false;
    const start = performance.now();

    do {
      assert.ok(frames < 60 * 200, `run ${runNumber} stuck in ${game.state}`);
      const state = game.state;
      const stage = game.stage;
      let input = bot.input(game, DT);
      let key = state === "initials" ? "BOT"[game.initials.length] : null;
      if (state === "results") {
        sawResults = true;
        if (walkaway === "results") input = idle;
      } else if (state === "initials") {
        sawInitials = true;
        if (walkaway === "initials") key = null;
      } else if (state === "play" && game.round === abandonRound && stage.time >= stage.duration / 2) {
        input = idle;
        key = "Escape";
        aborted = true;
      }
      game.update(DT, input, key);
      frames += 1;

      // Check both sides of the update: the old stage can finish and disappear or
      // a new stage can be created on this frame.
      for (const current of [stage, game.stage]) {
        if (!current) continue;
        const count = current.effects.length;
        if (count > 24) assert.fail(`${current.name} effects exceeded 24 in run ${runNumber}: ${count}`);
        maxEffects.set(current.name, Math.max(maxEffects.get(current.name) || 0, count));
      }
    } while (game.state !== "attract");
    timings.push({ elapsed: performance.now() - start, frames });

    assert.equal(game.stage, null, `run ${runNumber}: stage`);
    assert.deepEqual(game.results, [], `run ${runNumber}: results`);
    assert.equal(game.score, null, `run ${runNumber}: score`);
    assert.equal(game.round, -1);
    assert.equal(game.timer, 0);
    assert.equal(game.idle, 0);
    assert.equal(game.place, null);
    assert.equal(game.initials, "");
    assert.equal(game.saved, null);
    assert.ok(store.all().length <= ScoreStore.LIMIT);
    assert.equal(store.all().length, ScoreStore.LIMIT);
    if (abandonRound >= 0) {
      assert.ok(aborted, `run ${runNumber} must be abandoned mid-round`);
      assert.deepEqual(store.all(), before, "abandoning must not save a score");
      assert.equal(game.lastSaved, previousSaved);
      outcomes.abandoned[abandonRound] += 1;
    } else {
      assert.ok(sawResults, `run ${runNumber} must reach results`);
      assert.equal(sawInitials, walkaway !== "results");
      assert.notEqual(game.lastSaved, previousSaved);
      assert.equal(game.lastSaved.initials, walkaway ? "---" : "BOT");
      assert.equal(game.lastSaved.at, runNumber);
      if (walkaway === "results") outcomes.resultsWalkaway += 1;
      else if (walkaway === "initials") outcomes.initialsWalkaway += 1;
      else outcomes.saved += 1;
    }
  }

  assert.deepEqual(outcomes, { saved: 270, resultsWalkaway: 6, initialsWalkaway: 6, abandoned: [6, 6, 6] });
  assert.deepEqual([...maxEffects.keys()].sort(), ["Flick", "Read", "Track"]);
  assert.equal(maxEffects.get("Flick"), 24, "the effect cap was actually reached");
  assert.ok(store.all().some((entry) => entry.initials !== "OLD"), "new scores replace old ones at capacity");

  const first = medianBatchTime(timings.slice(0, 50));
  const last = medianBatchTime(timings.slice(-50));
  const seconds = (performance.now() - started) / 1000;
  t.diagnostic(`first 50: ${(first * 1000).toFixed(3)} µs/frame; last 50: ${(last * 1000).toFixed(3)} µs/frame; total: ${seconds.toFixed(3)} s`);
  // A 2.5x allowance plus 0.2 µs/frame of measurement noise catches sustained,
  // substantial growth without treating tiny absolute timing changes as a leak.
  assert.ok(last <= first * 2.5 + 0.0002, `last 50: ${last} ms/frame, first 50: ${first} ms/frame`);
});