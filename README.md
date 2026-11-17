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

It is plain HTML and JavaScript modules, with no build step and no network use. Serve
the folder with any static server and open it:

```bash
npx serve .
```

Keys: **F** full screen, **M** mute, **Esc** abandon a run.

## Tests

```bash
node --test "tests/*.test.mjs"
node tests/calibrate.mjs
```

The tests drive the real game with scripted bot players: every round's rules, the
scoring, a full run from idle screen to saved score, walk-away and abandon handling,
and the score store. `calibrate.mjs` plays 160 bot runs across four skill levels and
prints the score spread the tiers are tuned to.

## License

MIT
