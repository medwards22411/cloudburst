// Run: node --test "tests/*.test.mjs"
import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../js/game.js";
import { Rng } from "../js/rng.js";
import { ScoreStore } from "../js/scores.js";
import { aimRating, decisionRating, scoreRun, speedScore, tierFor, trackingRating } from "../js/scoring.js";
import { FIELD, FlickStage, ReadStage, TrackStage, pointer } from "../js/stages.js";
import { Bot, PROFILES } from "./bots.mjs";

const DAY = "2027-01-05";
const idle = pointer(0, 0, false);

test("the same day gives the same sky; another day a different one", () => {
  const a = new FlickStage(new Rng(Rng.seedFor(DAY)));
  const b = new FlickStage(new Rng(Rng.seedFor(DAY)));
  const c = new FlickStage(new Rng(Rng.seedFor("2027-01-06")));
  assert.deepEqual([a.target.x, a.target.y], [b.target.x, b.target.y]);
  assert.notDeepEqual([a.target.x, a.target.y], [c.target.x, c.target.y]);
});

test("Flick: a fast hit scores speed and streak bonuses; a miss costs 25 and ends the streak", () => {
  const stage = new FlickStage(new Rng(1));
  stage.update(0.2, idle);
  const first = stage.target;
  stage.update(0, pointer(first.x, first.y, true));
  assert.equal(stage.hits, 1);
  // 200 ms reaction: speed bonus (800 - 200) / 8 = 75, streak 1 = 5.
  assert.equal(stage.points, 180);
  assert.notEqual(stage.target, first, "a new cloud spawns after a hit");
  assert.ok(Math.hypot(stage.target.x - first.x, stage.target.y - first.y) > 320, "the next cloud needs a real flick");
  stage.update(0, pointer(FIELD.left, FIELD.top, true));
  assert.equal(stage.misses, 1);
  assert.equal(stage.streak, 0);
  assert.equal(stage.points, 155);
});

test("Flick: the score never goes below zero, and the cloud shrinks with a streak", () => {
  const stage = new FlickStage(new Rng(2));
  for (let i = 0; i < 5; i += 1) stage.update(0.01, pointer(0, 0, true));
  assert.equal(stage.points, 0);
  const big = stage.target.r;
  for (let i = 0; i < 6; i += 1) {
    stage.update(0.3, pointer(stage.target.x, stage.target.y, true));
  }
  assert.ok(stage.target.r < big);
  assert.ok(stage.target.r >= 26);
});

test("Track: time on the storm scores, bursts it after its charge, and a new storm forms", () => {
  const stage = new TrackStage(new Rng(3));
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 3; i += 1) stage.update(dt, pointer(stage.storm.x, stage.storm.y));
  assert.ok(stage.onTarget > 2.9);
  assert.equal(stage.bursts, 1, "3 s on target bursts one 1.6 s storm");
  const off = new TrackStage(new Rng(3));
  for (let i = 0; i < 60; i += 1) off.update(dt, pointer(0, 0));
  assert.equal(off.onTarget, 0);
  assert.equal(off.points, 0);
});

test("Read: storms score, friendlies cost, expired storms are missed, ignored friendlies count", () => {
  const stage = new ReadStage(new Rng(4));
  const dt = 1 / 60;
  let guard = 0;
  const seen = { hostile: 0, friendly: 0 };
  while (!stage.done && guard < 5000) {
    guard += 1;
    stage.update(dt, idle);
    const t = stage.target;
    if (t && stage.time - t.bornAt > 0.2 && stage.time - t.bornAt < 0.22) {
      if (t.hostile && seen.hostile === 0) {
        seen.hostile += 1;
        stage.update(0, pointer(t.x, t.y, true));
      } else if (!t.hostile && seen.friendly === 0) {
        seen.friendly += 1;
        stage.update(0, pointer(t.x, t.y, true));
      }
    }
  }
  assert.equal(stage.correct, 1);
  assert.equal(stage.wrong, 1);
  assert.ok(stage.missed > 0, "storms left alone expire as misses");
  assert.ok(stage.avoided > 0, "friendlies left alone count");
});

test("ratings: speed, aim, tracking and decisions follow their rules", () => {
  assert.equal(speedScore(300), 1);
  assert.equal(speedScore(900), 0);
  assert.equal(speedScore(null), 0);
  assert.equal(aimRating({ hits: 40, misses: 0, seconds: 25, reactions: [300] }), 100);
  assert.equal(aimRating({ hits: 0, misses: 0, seconds: 25, reactions: [] }), 0);
  assert.equal(trackingRating({ onTarget: 10, seconds: 20 }), 50);
  assert.equal(decisionRating({ correct: 10, avoided: 10, wrong: 0, missed: 0, stray: 0, reactions: [300] }), 100);
  assert.equal(decisionRating({ correct: 0, avoided: 0, wrong: 0, missed: 0, stray: 0, reactions: [] }), 0);
  assert.equal(tierFor(0), "Drizzle");
  assert.equal(tierFor(6500), "Cumulus");
  assert.equal(tierFor(99999), "Cloud Nine");
  const run = scoreRun({ points: 100, hits: 1, misses: 0, seconds: 25, reactions: [400] }, { points: 200, onTarget: 2, seconds: 20 }, { points: 300, correct: 1, wrong: 0, missed: 0, avoided: 0, stray: 0, reactions: [600] });
  assert.equal(run.total, 600);
  assert.equal(run.reaction, 500);
});

test("a full run: idle screen, three rounds, results, initials, saved, back to idle", () => {
  const store = new ScoreStore(null);
  const game = new Game(store, () => DAY, () => 1000);
  assert.equal(game.state, "attract");
  const score = new Bot(PROFILES.good, 7).play(game, "ACE");
  assert.equal(game.state, "attract");
  const saved = store.top(1, DAY)[0];
  assert.equal(saved.initials, "ACE");
  assert.equal(saved.total, score.total);
  assert.equal(game.score, null, "nothing from the last player is left");
  assert.equal(game.stage, null);
  assert.deepEqual(game.results, []);
});

test("results ignore clicks for a moment, so a player still clicking sees their score", () => {
  const game = new Game(new ScoreStore(null), () => DAY);
  game.state = "results";
  game.score = { total: 1 };
  game.timer = 0;
  game.update(0.1, pointer(0, 0, true));
  assert.equal(game.state, "results");
  game.timer = 2;
  game.update(0.1, pointer(0, 0, true));
  assert.equal(game.state, "initials");
});

test("a walk-away player is saved as --- and the booth returns to idle", () => {
  const store = new ScoreStore(null);
  const game = new Game(store, () => DAY);
  game.state = "results";
  game.score = { total: 1234, aim: 1, tracking: 1, decisions: 1, tier: "Drizzle" };
  for (let i = 0; i < 25 * 10; i += 1) game.update(0.1, idle);
  assert.equal(game.state, "attract");
  assert.equal(store.top(1)[0].initials, "---");
});

test("initials: on-screen keys and the keyboard both work; Delete removes; three letters save", () => {
  const store = new ScoreStore(null);
  const game = new Game(store, () => DAY);
  game.state = "initials";
  game.score = { total: 500, aim: 1, tracking: 1, decisions: 1, tier: "Drizzle" };
  const keys = Game.keyboard();
  const press = (label) => {
    const k = keys.find((key) => key.label === label);
    game.update(0.01, pointer(k.x + k.w / 2, k.y + k.h / 2, true));
  };
  press("Z");
  press("Delete");
  press("M");
  game.update(0.01, idle, "e");
  assert.equal(game.initials, "ME");
  game.update(0.01, idle, "g");
  assert.equal(game.state, "attract");
  assert.equal(store.top(1)[0].initials, "MEG");
});

test("Escape aborts a run back to the idle screen without saving", () => {
  const store = new ScoreStore(null);
  const game = new Game(store, () => DAY);
  game.update(0.01, pointer(0, 0, true));
  assert.equal(game.state, "intro");
  game.update(0.01, idle, "Escape");
  assert.equal(game.state, "attract");
  assert.equal(store.all().length, 0);
});

test("a run lasts under three minutes from click to score", () => {
  const rounds = FlickStage.DURATION + TrackStage.DURATION + ReadStage.DURATION + 3 * Game.INTRO;
  assert.ok(rounds < 100, `${rounds} s of play`);
});

test("the store keeps the best scores, by day, and places a new total", () => {
  const store = new ScoreStore(null);
  store.add({ initials: "aaa", total: 100, date: DAY, at: 1 });
  store.add({ initials: "bbb", total: 300, date: DAY, at: 2 });
  store.add({ initials: "ccc", total: 200, date: "2027-01-04", at: 3 });
  assert.deepEqual(store.top(5, DAY).map((s) => s.initials), ["BBB", "AAA"]);
  assert.deepEqual(store.top(5).map((s) => s.total), [300, 200, 100]);
  assert.equal(store.placeFor(250, DAY), 2);
  assert.equal(store.add({ initials: "<b>x", total: 1, date: DAY, at: 4 }).initials, "BX-", "initials are cleaned");
});
