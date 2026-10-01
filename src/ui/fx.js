/**
 * Post-paint game effects.
 *
 * The views are pure and `render()` repaints the whole page, so a CSS animation put on a piece would replay
 * for every piece on every move. Instead this module remembers a signature for each watched element after a
 * paint and, on the next paint of the same game, adds `fx-pop` to the elements that just changed (a new mark,
 * a flipped card, a hit, a score). The animation lives in `src/styles/fx.css`; it only moves transform,
 * opacity and shadows, so it can never change the size of a box, and it is switched off by
 * `prefers-reduced-motion`.
 */
import { state } from '../state.js';

/** @type {{ sel: string, when?: (el: Element) => boolean }[]} */
const WATCHED = [
  { sel: '.line-cell', when: (el) => el.textContent.trim() !== '' },
  { sel: '.drop-cell > i', when: (el) => el.classList.contains('disc') },
  { sel: '.memory-card', when: (el) => el.classList.contains('is-revealed') || el.classList.contains('is-matched') },
  { sel: '.battle-cell', when: (el) => el.classList.contains('is-hit') || el.classList.contains('is-miss') },
  { sel: '.maze-cell', when: (el) => Boolean(el.querySelector('.maze-token')) },
  { sel: '.race-pixels i', when: (el) => el.classList.contains('filled') },
  { sel: '.guess-history > .guess-row:first-child' },
  { sel: '.quiz-option', when: (el) => el.classList.contains('is-correct') || el.classList.contains('is-wrong') },
  { sel: '.choice-button', when: (el) => el.classList.contains('is-chosen') },
  { sel: '.last-round-result:not(.is-idle)' },
  { sel: '.rally-court' },
  { sel: '.match-player > strong' },
  { sel: '.duel-score > strong' },
  { sel: '.rally-score > strong' },
  { sel: '.memory-score > b' },
  { sel: '.quiz-scores b' },
  { sel: '.maze-score-row b' },
  { sel: '.race-lane-head > strong' },
];

/** @type {Map<string, string[]>} */
let previous = new Map();
let previousGame = '';

/** @param {Element} el */
function signature(el) {
  return `${el.className.toString().replace(/\bfx-pop\b/g, '').trim()}|${el.textContent.trim()}|${el.getAttribute('data-move') ?? ''}`;
}

function currentGameKey() {
  if (state.page !== 'game') return '';
  if (state.local) return `local:${state.local.gameId}:${state.local.seed}`;
  return `room:${state.room?.id || ''}`;
}

/**
 * Marks what changed since the last paint of this game. Call after every paint.
 * @param {ParentNode} root
 * @returns {number} how many elements were marked (0 on the first paint of a game and on every other page)
 */
export function applyFx(root) {
  const key = currentGameKey();
  if (!key) { previous = new Map(); previousGame = ''; return 0; }
  const fresh = key !== previousGame;
  let marked = 0;
  const next = new Map();
  for (const { sel, when } of WATCHED) {
    const elements = [...root.querySelectorAll(sel)];
    const signatures = elements.map(signature);
    next.set(sel, signatures);
    const before = previous.get(sel);
    if (fresh || !before || before.length !== signatures.length) continue;
    elements.forEach((el, index) => {
      if (signatures[index] === before[index] || (when && !when(el))) return;
      el.classList.add('fx-pop');
      marked += 1;
    });
  }
  previous = next;
  previousGame = key;
  return marked;
}

/** Forget everything (tests, and a clean start after leaving a game). */
export function resetFx() {
  previous = new Map();
  previousGame = '';
}
