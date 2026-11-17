/**
 * Short sound effects made with the Web Audio API: no audio files, so nothing to load
 * and no licensing. Sound starts on the first click (browsers require a gesture) and M
 * mutes it.
 */
export class Sound {
  constructor() {
    this.context = null;
    this.muted = false;
  }

  /** Create the audio context; call from a click. */
  unlock() {
    if (this.context || typeof AudioContext === "undefined") return;
    try {
      this.context = new AudioContext();
    } catch {
      this.context = null;
    }
  }

  toggle() {
    this.muted = !this.muted;
  }

  /**
   * Play a short tone.
   *
   * :param freq: start frequency in Hz
   * :param end: end frequency in Hz
   * :param seconds: length
   * :param type: oscillator type
   * :param volume: peak gain
   */
  tone(freq, end, seconds, type = "sine", volume = 0.18) {
    const c = this.context;
    if (!c || this.muted) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), now + seconds);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  }

  /** :param kind: an effect kind from a stage ("burst", "miss", "wrong", "late") */
  effect(kind) {
    if (kind === "burst") this.tone(660, 1320, 0.12, "triangle");
    if (kind === "miss") this.tone(220, 140, 0.08, "square", 0.06);
    if (kind === "wrong") this.tone(180, 90, 0.25, "sawtooth", 0.1);
    if (kind === "late") this.tone(300, 200, 0.12, "sine", 0.08);
  }

  tick() {
    this.tone(880, 880, 0.06, "sine", 0.08);
  }

  go() {
    this.tone(523, 1046, 0.25, "triangle", 0.15);
  }

  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.18, "triangle", 0.12), i * 110));
  }
}
