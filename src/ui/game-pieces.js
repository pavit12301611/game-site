/** Local vector pieces: visible geometry plus a text equivalent for keyboard/screen-reader users. */
import { esc } from './html.js';
const marks = [
  '<path d="M20 20 60 60M60 20 20 60"/>',
  '<circle cx="40" cy="40" r="25"/>',
  '<path d="m40 12 28 28-28 28-28-28Z"/>',
];
export function markGraphic(index) {
  const i = Math.max(0, index) % 3;
  return `<span class="sr-only">${['✕', '◯', '◇'][i]}</span><svg class="board-mark-art" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${marks[i]}</svg>`;
}
const faces = {
  '✦': '<path d="m40 8 8 24 24 8-24 8-8 24-8-24-24-8 24-8Z"/>',
  '☻': '<circle cx="40" cy="40" r="26"/><path d="M27 46q13 15 26 0M30 30v3m20-3v3"/>',
  '♫': '<path d="M31 54V21l28-6v34M31 28l28-6"/><ellipse cx="23" cy="57" rx="8" ry="6"/><ellipse cx="51" cy="52" rx="8" ry="6"/>',
  '◆': '<path d="m40 12 25 28-25 28-25-28Z"/>',
  '⚡': '<path d="m44 9-26 35h19l-3 27 27-38H43Z"/>',
  '☾': '<path d="M53 15a28 28 0 1 0 13 42A31 31 0 0 1 53 15Z"/>',
  '✿': '<circle cx="40" cy="40" r="8"/><path d="M34 30C7 4 5 45 29 40 3 69 44 76 40 51c27 26 35-13 11-11 25-28-17-35-11-11Z"/>',
  '◉': '<circle cx="40" cy="40" r="26"/><circle cx="40" cy="40" r="12"/>',
  '♜': '<path d="M24 14v17l7 7-5 23h28l-5-23 7-7V14H45v12H35V14ZM21 67h38"/>',
  '▲': '<path d="m40 14 28 48H12Z"/>',
  '●': '<circle cx="40" cy="40" r="24" fill="currentColor"/>',
  '▣': '<rect x="15" y="15" width="50" height="50" rx="9"/><rect x="29" y="29" width="22" height="22" rx="4"/>',
};
export function memoryGraphic(symbol) {
  const face = faces[symbol];
  if (!face) return esc(symbol);
  return `<span class="sr-only">${esc(symbol)}</span><svg class="memory-face-art" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${face}</svg>`;
}
const hands = {
  rock: '<path d="M22 53V31q0-9 8-9h23q8 0 8 8v20L51 64H32Z"/><path d="M22 40h22q8 0 8 8v5M32 25v12m10-13v13m10-12v13"/>',
  paper: '<path d="M23 45 17 34q-4-7 2-9 4-1 8 8l3 5V17q0-9 7-7v26-26q7-5 8 4v22-20q7-5 8 4v19-15q7-4 8 4v20q0 17-16 20H33Z"/>',
  scissors: '<path d="m30 36-8-22q-2-7 5-7l14 29 9-25q4-7 9-3L49 40q13-2 13 9v7L50 67H32L20 52q-6-10 0-13l10 9Z"/><path d="M31 48h18q8 0 7 9"/>',
};
export function handGraphic(choice, fallback) {
  return hands[choice] ? `<svg class="duel-hand-art" viewBox="0 0 80 80" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${hands[choice]}</svg>` : esc(fallback);
}
