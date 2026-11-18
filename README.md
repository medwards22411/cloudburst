# Cloudburst

A 90-second aim, tracking and decision drill for esports event booths. Mouse only, no
tutorial, three rounds:

1. **Flick:** clouds pop up across the sky. Click each one as fast as you can.
2. **Track:** a storm cell drifts on a speeding-up path. Keep your crosshair on it.
3. **Read:** storms and friendly clouds flash up. Hit the storms, leave the friendlies.

The score card rates **Aim**, **Tracking** and **Decisions** from 0 to 100, gives a tier
from Drizzle to Cloud Nine, and asks for three initials for the day's board. Everyone
plays the same sky each day (a seed from the date), so the board compares skill, not luck.

Built for Category 3 (Event Mini Game) of the Cloud9 x JetBrains "Sky's The Limit"
hackathon.

## Run it

It is plain HTML and JavaScript modules, with no build step, no dependencies and no
network use. With Node.js installed, start the included offline server and open
http://localhost:8080/:

```bash
npm start
```

Any other static server works too. In WebStorm, the shared run setups **Run booth
server**, **All tests** and **Calibrate tiers** are ready in the Run menu.

Keys: **F** full screen, **M** mute, **Esc** abandon a run.

## Second screen

Open `board.html` from the same server in a second window, drag it to the second
monitor, and press **F11**. The leaderboard updates on the same computer without Wi-Fi.

## Staff panel

On the idle game screen, press **Ctrl+Shift+S** to open or close the hidden staff
panel. Use **↑/↓** to select, **Enter** to act and **Esc** to close. The panel shows
today's games played, best and average score. Select **Event name** and press Enter
to type up to 24 characters (Enter finishes); it appears on the idle screen and the
second-screen board. **Sound on by default** sets the saved sound preference; **M**
still temporarily mutes or unmutes the current session. **Save scores to a file**
downloads all retained scores as a dated CSV. **Clear today's board** removes only
today's scores after a second Enter within three seconds and updates the board.
Settings are stored locally on this computer.

## Tests

```bash
npm test
npm run calibrate
```

The tests drive the real game with scripted bot players: every round's rules, the
scoring, a full run from idle screen to saved score, walk-away and abandon handling,
and the score store. `calibrate.mjs` plays 160 bot runs across four skill levels and
prints the score spread the tiers are tuned to. `soak.test.mjs` checks 300 consecutive
runs for bounded state, cleanup and sustained frame performance.

## License

MIT
