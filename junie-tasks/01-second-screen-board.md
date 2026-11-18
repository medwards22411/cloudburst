# Task for Junie: second-screen leaderboard

Cloudburst is a booth mini-game (plain HTML + ES modules, no build step, no network).
Read README.md, js/scores.js, js/game.js and js/render.js first.

Build a second-screen leaderboard that event staff open on a second monitor next to
the game, on the same computer, with no Wi-Fi.

Requirements:

1. New page `board.html` with `js/board.js` and `css/board.css`. Full-screen, readable
   from a few meters away: TODAY'S TOP 10 (large) and ALL-TIME TOP 5 (smaller), each row
   showing place, initials, total and tier. Same sky look as the game's idle screen
   (colors from SKIES.attract in js/render.js, the same font stack). Show today's date and
   a footer: "Play at the booth. Same sky for everyone today."
2. Live updates without network: when the game saves a score, the board updates within
   one second. In `ScoreStore.add` (js/scores.js), post `{type: "score", entry}` on a
   `BroadcastChannel("cloudburst")` after saving; guard so it is skipped when
   `BroadcastChannel` does not exist (Node tests). The board listens on that channel and
   also on the window `storage` event as a fallback, and reads the stored scores on load.
3. Highlight the newest entry for 10 seconds (gold glow on its row) and show a banner
   "NEW: <initials> <total> (<tier>)". If the newest entry did not make the top 10,
   still show the banner.
4. Booth-safe: the page must run all day. No unbounded arrays or timers piling up, one
   animation loop or interval at most, and the "today" list rolls over at local midnight
   without a reload.
5. Put the board's logic in a pure, exported function, e.g. `boardModel(scores, today,
   newest, now)` returning the rows, banner and highlight state, and test it in
   `tests/board.test.mjs` (node:test, no DOM): top-10 ordering, all-time list, the
   10-second highlight window, the banner for an entry outside the top 10, and the
   midnight rollover. Also test that `ScoreStore.add` posts on the channel when a
   BroadcastChannel stub exists and does nothing when it does not.
6. Do not change the game's rules, scoring or tiers. No new dependencies.
7. Add a "Second screen" section to README.md: open `board.html` in a second window,
   drag it to the second monitor, press F11.

Done means: `node --test "tests/*.test.mjs"` passes (the existing 13 tests and the new
ones), and opening board.html next to index.html shows a score the moment a game saves it.
