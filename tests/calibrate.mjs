// Plays many bot runs per skill profile and prints the score spread, for tuning TIERS.
// Run: node tests/calibrate.mjs
import { Game } from "../js/game.js";
import { ScoreStore } from "../js/scores.js";
import { Bot, PROFILES } from "./bots.mjs";

for (const [name, profile] of Object.entries(PROFILES)) {
  const totals = [];
  const ratings = [];
  for (let i = 0; i < 40; i += 1) {
    const game = new Game(new ScoreStore(null), () => `2027-01-${String((i % 28) + 1).padStart(2, "0")}`);
    const score = new Bot(profile, i + 1).play(game);
    totals.push(score.total);
    ratings.push(score);
  }
  totals.sort((a, b) => a - b);
  const mean = (key) => Math.round(ratings.reduce((s, r) => s + r[key], 0) / ratings.length);
  console.log(`${name.padEnd(8)} min ${totals[0]}  median ${totals[20]}  max ${totals[39]}  aim ${mean("aim")}  tracking ${mean("tracking")}  decisions ${mean("decisions")}  reaction ${mean("reaction")}ms  tier ${ratings[20].tier}`);
}
