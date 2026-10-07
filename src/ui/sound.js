/**
 * Sound effects: simple audio feedback using Web Audio API.
 */

import { SOUND_STORAGE_KEY } from '../helpers.js';

const audioCtx = typeof AudioContext !== 'undefined' ? new AudioContext() : null;

/**
 * Plays a short beep for game actions.
 */
export function playSound(type = 'click') {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.value = 0.1;

    if (type === 'win') {
      osc.frequency.value = 600;
      osc.type = 'sine';
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'move') {
      osc.frequency.value = 400;
      osc.type = 'sine';
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } else {
      osc.frequency.value = 500;
      osc.type = 'sine';
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    }
  } catch { /* ignore audio errors */ }
}

/**
 * Sets sound enabled/disabled.
 */
export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch { /* ignore */ }
}