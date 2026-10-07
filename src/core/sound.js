// Retro bleeps via WebAudio — zero audio files, mutable, lazy.
import { prefs } from './store.js';

let ctx = null;

function ac() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  ac();
}

function tone(freq, dur = 0.08, type = 'square', delay = 0, vol = 0.05) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SCORES = {
  click: [[660, 0.05]],
  move: [[440, 0.06]],
  flip: [[520, 0.05], [780, 0.05, 'square', 0.05]],
  pop: [[880, 0.06], [1320, 0.07, 'square', 0.06]],
  good: [[523, 0.07], [659, 0.07, 'square', 0.07], [784, 0.1, 'square', 0.14]],
  win: [
    [523, 0.09], [659, 0.09, 'square', 0.09], [784, 0.09, 'square', 0.18],
    [1047, 0.16, 'square', 0.27],
  ],
  lose: [[392, 0.12], [330, 0.12, 'sawtooth', 0.12], [262, 0.2, 'sawtooth', 0.24]],
  draw: [[440, 0.1], [440, 0.1, 'square', 0.14]],
  error: [[160, 0.12, 'sawtooth']],
  tick: [[1200, 0.03, 'sine', 0, 0.03]],
};

export const sfx = {
  play(name) {
    if (!prefs.get().sound) return;
    const notes = SCORES[name];
    if (!notes) return;
    for (const [freq, dur, type, delay, vol] of notes) {
      tone(freq, dur, type || 'square', delay || 0, vol ?? 0.05);
    }
  },
};
