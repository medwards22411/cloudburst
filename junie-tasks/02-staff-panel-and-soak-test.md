# Task for Junie: staff panel and soak test

Cloudburst is a booth mini-game (plain HTML + ES modules, no build step, no network).
Read README.md, js/game.js, js/main.js, js/render.js, js/scores.js, js/board.js and
tests/bots.mjs first. Players use the mouse only; booth staff have a keyboard.

## Part 1: staff panel

A hidden panel that only staff can reach, for running the booth all day.

1. Open and close it with Ctrl+Shift+S in the game window (index.html). Players never
   see it by accident: no on-screen button, and opening it pauses nothing important
   (only allowed on the idle screen; on other screens the shortcut does nothing).
2. Draw it in the game's own style on the canvas (js/render.js), operated with the
   keyboard: arrow keys move, Enter acts, Esc closes. Show:
   - games played today, today's best and average score (from ScoreStore);
   - an editable event name (typed text, up to 24 characters), shown under the title
     on the idle screen and in the header of board.html;
   - sound on by default: yes/no;
   - "Save scores to a file": downloads all scores as CSV (initials, total, aim,
     tracking, decisions, tier, date, time), named cloudburst-scores-YYYY-MM-DD.csv;
   - "Clear today's board": needs Enter pressed twice within 3 seconds, removes only
     today's scores, and the board window updates.
3. Settings persist in localStorage under one key (e.g. "cloudburst.settings.v1") with
   safe defaults if storage is missing or corrupt; board.html reads the event name too
   and updates when it changes (same BroadcastChannel/storage approach as scores).
4. Keep the logic testable without a DOM: put state and actions in a module (e.g.
   js/staff.js) and add ScoreStore methods such as `clearDay(date)`, `toCsv()` and
   `stats(date)`. Escape CSV fields correctly. Tests in tests/staff.test.mjs.

## Part 2: soak test

Prove the game is safe to leave running at a booth all day.

5. tests/soak.test.mjs: one Game and one ScoreStore (memory storage) play 300
   consecutive runs with the bots in tests/bots.mjs, mixing all skill profiles and a
   few walk-away players (no initials) and abandoned runs (Escape mid-round). After
   every run assert the game is back on the idle screen with nothing left over (no
   stage, no results, no score). Assert stage effect lists never exceed their cap,
   the store never exceeds ScoreStore.LIMIT entries, and the time per simulated frame
   in the last 50 runs is not meaningfully slower than in the first 50 (allow for
   noise; the point is no growth). Keep the test under about 30 seconds.
6. If the soak test finds a real leak or slowdown, fix the cause in the game code.

## Rules

- Do not change the game's rounds, scoring or tiers. No new dependencies.
- Update README.md: a "Staff panel" section (shortcut and what each item does) and a
  line about the soak test under Tests.
- Done means `node --test "tests/*.test.mjs"` passes, including the existing 21 tests.
