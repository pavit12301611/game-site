/**
 * Two tiny synthesised UI tones. There are no audio files to download, nothing plays until the
 * player turns sound on in Settings, and it stays off by default.
 */

import { SOUND_STORAGE_KEY } from '../helpers.js';
import { state } from '../state.js';

export function setSoundEnabled(enabled) {
  state.soundEnabled = Boolean(enabled);
  try { localStorage.setItem(SOUND_STORAGE_KEY, String(state.soundEnabled)); } catch {}
}

export function playUiTone(kind = 'tap') {
  if (!state.soundEnabled || !window.AudioContext) return;
  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'win' ? 660 : kind === 'error' ? 180 : 420;
    gain.gain.setValueAtTime(0.018, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.08);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.09);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch {
    // Audio is a progressive enhancement; never block a game move.
  }
}
