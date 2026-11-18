import { ScoreStore } from "./scores.js";
import { SettingsStore } from "./staff.js";

const FIELDS = ["initials", "total", "aim", "tracking", "decisions", "tier", "date", "at"];

function sameEntry(a, b) {
  return !!a && !!b && FIELDS.every((field) => a[field] === b[field]);
}

/** Build the two leaderboards and the temporary announcement without changing scores. */
export function boardModel(scores, today, newest, now) {
  const sorted = scores.slice().sort((a, b) => b.total - a.total || a.at - b.at);
  const active = newest && now >= newest.receivedAt && now - newest.receivedAt < 10000;
  const rows = (entries) => {
    const highlighted = active ? entries.findIndex((entry) => sameEntry(entry, newest.entry)) : -1;
    return entries.map((entry, i) => ({ place: i + 1, entry, highlight: i === highlighted }));
  };
  const entry = active ? newest.entry : null;
  return {
    today: rows(sorted.filter((score) => score.date === today).slice(0, 10)),
    allTime: rows(sorted.slice(0, 5)),
    banner: entry ? `NEW: ${entry.initials} ${entry.total} (${entry.tier})` : null,
  };
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parse(value, fallback = null) {
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

/** Find an added score even if writing the separate latest-score key failed. */
function addedScore(oldValue, newValue) {
  const oldScores = parse(oldValue, []);
  const newScores = parse(newValue, []);
  if (!Array.isArray(oldScores) || !Array.isArray(newScores)) return null;
  const remaining = oldScores.slice();
  const added = [];
  for (const entry of newScores) {
    const index = remaining.findIndex((old) => sameEntry(old, entry));
    if (index < 0) added.push(entry);
    else remaining.splice(index, 1);
  }
  return added.sort((a, b) => b.at - a.at)[0] || null;
}

function startBoard() {
  const store = new ScoreStore();
  const settings = new SettingsStore();
  const todayRows = document.getElementById("today-rows");
  const allTimeRows = document.getElementById("all-time-rows");
  const banner = document.getElementById("new-score");
  const dateLabel = document.getElementById("date");
  const eventName = document.getElementById("event-name");
  let date = localDate(new Date());
  let newest = null;
  let refreshUntil = 0;
  let scoreSnapshot = null;
  let waitingForStorage = false;

  try {
    const entry = parse(store.storage?.getItem(ScoreStore.LATEST_KEY));
    if (entry && Number.isFinite(entry.at)) newest = { entry, receivedAt: entry.at };
  } catch {
    // The board can still run without storage.
  }

  function drawRows(container, rows) {
    container.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.className = "empty";
      cell.textContent = "Be the first to play!";
      empty.append(cell);
      container.append(empty);
      return;
    }
    for (const { place, entry, highlight } of rows) {
      const row = document.createElement("tr");
      if (highlight) row.className = "highlight";
      for (const value of [place, entry.initials, entry.total, entry.tier]) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }
      container.append(row);
    }
  }

  function render() {
    const now = new Date();
    date = localDate(now);
    const model = boardModel(scoreSnapshot || store.all(), date, newest, now.getTime());
    dateLabel.textContent = now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    if (eventName) eventName.textContent = settings.value.eventName;
    if (banner.textContent !== (model.banner || "")) banner.textContent = model.banner || "";
    drawRows(todayRows, model.today);
    drawRows(allTimeRows, model.allTime);
  }

  function announce(entry) {
    if (!entry || typeof entry !== "object") return;
    if (scoreSnapshot && !scoreSnapshot.some((score) => sameEntry(score, entry))) {
      scoreSnapshot = [...scoreSnapshot, entry].sort((a, b) => b.total - a.total || a.at - b.at).slice(0, ScoreStore.LIMIT);
    }
    if (!newest || !sameEntry(entry, newest.entry)) {
      if (newest && Number.isFinite(entry.at) && entry.at < newest.entry.at) return;
      newest = { entry, receivedAt: Date.now() };
      // The channel can arrive before another window sees the storage write.
      refreshUntil = newest.receivedAt + 1000;
    }
    render();
  }

  if (typeof globalThis.BroadcastChannel !== "undefined") {
    try {
      const channel = new globalThis.BroadcastChannel("cloudburst");
      channel.addEventListener("message", (event) => {
        if (event.data?.type === "score") announce(event.data.entry);
        if (event.data?.type === "scores-cleared" && Array.isArray(event.data.scores)) {
          if (newest?.entry.date === event.data.date) newest = null;
          scoreSnapshot = event.data.scores;
          waitingForStorage = !!event.data.persisted;
          refreshUntil = Date.now() + 1000;
          render();
        }
        if (event.data?.type === "settings") {
          settings.value = SettingsStore.clean(event.data.settings);
          render();
        }
      });
    } catch {
      // Storage events are the fallback.
    }
  }
  window.addEventListener("storage", (event) => {
    if (event.key === SettingsStore.KEY || event.key === null) {
      settings.value = event.key === null ? settings.read() : SettingsStore.clean(parse(event.newValue));
      render();
    }
    if (event.key === ScoreStore.LATEST_KEY) {
      const entry = parse(event.newValue);
      if (entry) announce(entry);
      else { newest = null; render(); }
    }
    if (event.key === ScoreStore.KEY) {
      scoreSnapshot = null;
      waitingForStorage = false;
      const oldScores = parse(event.oldValue, []);
      const newScores = parse(event.newValue, []);
      if (newest && Array.isArray(oldScores) && Array.isArray(newScores) &&
          oldScores.some((score) => sameEntry(score, newest.entry)) && !newScores.some((score) => sameEntry(score, newest.entry))) {
        newest = null;
      }
      const entry = addedScore(event.oldValue, event.newValue);
      if (entry) announce(entry);
      else render();
    }
    if (event.key === null) render();
  });

  render();
  setInterval(() => {
    const now = Date.now();
    if (waitingForStorage && scoreSnapshot) {
      const saved = store.all();
      if (saved.length === scoreSnapshot.length && saved.every((entry, i) => sameEntry(entry, scoreSnapshot[i]))) {
        scoreSnapshot = null;
        waitingForStorage = false;
      }
    }
    if (newest && now - newest.receivedAt >= 10000) {
      newest = null;
      render();
    } else if (now < refreshUntil || localDate(new Date(now)) !== date) {
      render();
    }
  }, 250);
}

if (typeof document !== "undefined") startBoard();