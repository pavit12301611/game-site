/**
 * Two tiny synthesised UI tones. There are no audio files to download, nothing plays until the
 * player turns sound on in Settings, and it stays off by default.
 */

import { SOUND_STORAGE_KEY } from '../helpers.js';
import { state } from '../state.js';

export function setSoundEnabled(enabled) {
  state.soundEnabled = Boolean(enabled);
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, String(state.soundEnabled));
  } catch {
    // Sound is optional; a blocked localStorage must not keep the setting from taking effect.
  }
}

/** Notes (Hz) per tone: one for a tap, a rising arpeggio for a win, a falling pair for a loss. */
const TONES = {
  tap: [420],
  error: [180],
  win: [523, 659, 784, 1047],
  lose: [392, 311, 233],
  draw: [440, 440],
};

export function playUiTone(kind = 'tap') {
  if (!state.soundEnabled || !window.AudioContext) return;
  try {
    const context = new window.AudioContext();
    const notes = TONES[kind] || TONES.tap;
    const step = notes.length > 1 ? 0.12 : 0;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * step;
      oscillator.type = kind === 'win' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(notes.length > 1 ? 0.03 : 0.018, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (notes.length > 1 ? 0.22 : 0.08));
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + (notes.length > 1 ? 0.24 : 0.09));
      if (index === notes.length - 1) oscillator.addEventListener('ended', () => void context.close(), { once: true });
    });
  } catch {
    // Audio is a progressive enhancement; never block a game move.
  }
}
