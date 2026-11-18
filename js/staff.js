import { ScoreStore } from "./scores.js";

/** Persistent booth settings; also works in memory when storage is unavailable. */
export class SettingsStore {
  static KEY = "cloudburst.settings.v1";

  constructor(storage = ScoreStore.defaultStorage()) {
    this.storage = storage;
    this.value = this.read();
  }

  static clean(value) {
    const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      eventName: typeof data.eventName === "string" ? Array.from(data.eventName.replace(/[\x00-\x1f\x7f]/g, "")).slice(0, 24).join("") : "",
      soundOn: typeof data.soundOn === "boolean" ? data.soundOn : true,
    };
  }

  read() {
    try {
      return SettingsStore.clean(JSON.parse(this.storage?.getItem(SettingsStore.KEY) || "null"));
    } catch {
      return SettingsStore.clean(null);
    }
  }

  set(changes) {
    this.value = SettingsStore.clean({ ...this.value, ...changes });
    try {
      this.storage?.setItem(SettingsStore.KEY, JSON.stringify(this.value));
    } catch {
      // The booth can still use the in-memory settings.
    }
    try {
      if (typeof globalThis.BroadcastChannel !== "undefined") {
        const channel = new globalThis.BroadcastChannel("cloudburst");
        try {
          channel.postMessage({ type: "settings", settings: this.value });
        } finally {
          channel.close();
        }
      }
    } catch {
      // Storage events are the fallback.
    }
  }
}

/** Keyboard-only staff panel state and actions, independent of the browser. */
export class StaffPanel {
  constructor(store, settings, today, clock = () => Date.now()) {
    this.store = store;
    this.settings = settings;
    this.today = today;
    this.clock = clock;
    this.open = false;
    this.selected = 0;
    this.editing = false;
    this.confirmation = null;
  }

  toggle(state) {
    if (state !== "attract") return false;
    this.open = !this.open;
    this.editing = false;
    this.confirmation = null;
    return this.open;
  }

  get confirming() {
    const now = this.clock();
    return !!this.confirmation && this.confirmation.date === this.today() && now >= this.confirmation.at && now - this.confirmation.at <= 3000;
  }

  key(key) {
    if (!this.open) return null;
    if (key === "Escape") {
      this.toggle("attract");
    } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
      this.selected = (this.selected + (key === "ArrowUp" || key === "ArrowLeft" ? 3 : 1)) % 4;
      this.editing = false;
      this.confirmation = null;
    } else if (this.editing) {
      if (key === "Enter") this.editing = false;
      else if (key === "Backspace") this.settings.set({ eventName: Array.from(this.settings.value.eventName).slice(0, -1).join("") });
      else if (Array.from(key).length === 1 && !/[\x00-\x1f\x7f]/.test(key)) {
        this.settings.set({ eventName: this.settings.value.eventName + key });
      }
    } else if (key === "Enter") {
      if (this.selected === 0) this.editing = true;
      if (this.selected === 1) this.settings.set({ soundOn: !this.settings.value.soundOn });
      if (this.selected === 2) return "export";
      if (this.selected === 3) {
        if (this.confirming) {
          this.store.clearDay(this.today());
          this.confirmation = null;
        } else {
          this.confirmation = { date: this.today(), at: this.clock() };
        }
      }
    }
    return null;
  }
}