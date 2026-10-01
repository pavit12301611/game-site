/**
 * Arcade effects and the result dialog: the winning-run helper, the "what just changed" marks (src/ui/fx.js),
 * and the dialog that opens when a game finishes (src/result-popup.js) for the winner, the loser and a draw.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let dom;
let appRoot;
const startupErrors = [];

before(async () => {
  dom = new JSDOM('<!doctype html><html><head><meta id="meta-theme-color" content=""></head><body><div id="app"></div></body></html>', {
    url: 'https://psd-gaming.test/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  // jsdom has no matchMedia, and the theme code calls it on every render.
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  // Node 22 defines some of these as getter-only globals, so they have to be redefined.
  const define = (name, value) => Object.defineProperty(global, name, { value, configurable: true, writable: true });
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('location', window.location);
  define('HTMLElement', window.HTMLElement);
  define('Node', window.Node);
  define('FormData', window.FormData);
  define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  define('getComputedStyle', window.getComputedStyle.bind(window));
  define('KeyboardEvent', window.KeyboardEvent);
  define('Element', window.Element);

  appRoot = window.document.querySelector('#app');
  // Imported after the globals exist: src/app.js touches document/localStorage as it loads.
  // console.error is watched meanwhile: the recovery screen (render.js) and the start-up guard
  // (app.js) both keep the page visible but report through it, and that must count as a failure.
  const originalError = console.error;
  console.error = (...args) => { startupErrors.push(args); originalError.apply(console, args); };
  try {
    await import('../src/app.js');
  } finally {
    console.error = originalError;
  }
});


import { readFileSync } from 'node:fs';

const $ = (selector) => appRoot.querySelector(selector);
const all = (selector) => [...appRoot.querySelectorAll(selector)];
const click = (element) => { assert.ok(element, 'the element to click exists'); element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); };
const setHash = (hash) => { dom.window.location.hash = hash; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); };
const card = (id) => all('[data-action="open-game"]').find((node) => node.dataset.gameId === id);
const startPractice = (id) => { setHash('#/catalog'); click(card(id)); click($('[data-action="practice-game"]')); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('winningCells finds rows, columns and both diagonals, and ignores runs that are too short', async () => {
  const { winningCells } = await import('../src/ui/win-cells.js');
  const a = 'a'; const b = 'b'; const n = null;
  assert.deepEqual([...winningCells([a, a, a, n, b, n, b, n, n], 3, 3)].sort(), [0, 1, 2], 'a row');
  assert.deepEqual([...winningCells([a, b, n, a, b, n, a, n, n], 3, 3)].sort(), [0, 3, 6], 'a column');
  assert.deepEqual([...winningCells([a, b, n, b, a, n, n, n, a], 3, 3)].sort(), [0, 4, 8], 'a diagonal');
  assert.deepEqual([...winningCells([n, n, a, n, a, n, a, n, n], 3, 3)].sort(), [2, 4, 6], 'the other diagonal');
  assert.equal(winningCells([a, a, n, b, b, n, n, n, n], 3, 3).size, 0, 'two in a row is not a win');
  assert.equal(winningCells([a, a, a, a, n, b, n, n, n, n, b, n], 4, 4).size, 4, 'a rectangular board (4 wide, 3 tall)');
  assert.equal(winningCells([a, a, a, a, a, a, a, a, a], 3, 3).size, 9, 'every cell of a full run is returned');
});

test('a move marks the new piece with fx-pop, and only that piece', async () => {
  startPractice('pixel-tac-toe');
  assert.equal(all('.fx-pop').length, 0, 'nothing animates on the first paint of a game');
  const cell = $('.line-cell:not([disabled])');
  click(cell);
  const popped = all('.line-cell.fx-pop');
  assert.equal(popped.length, 1, 'exactly one cell pops');
  assert.equal(popped[0].textContent.trim(), '✕');
  await wait(900); // the CPU answers, then the next paint marks only its piece
  assert.ok(all('.line-cell.fx-pop').length <= 1);
});

test('a finished game opens the result dialog for a win, a loss and a draw, and Play again closes it', async () => {
  const { state } = await import('../src/state.js');
  const { render } = await import('../src/render.js');
  const { resetResultPopup, RESULT_DELAY_MS } = await import('../src/result-popup.js');
  const finish = (winnerUid) => {
    resetResultPopup();
    startPractice('pixel-tac-toe');
    window.clearTimeout(state.cpuTimer);
    state.local.gameState = { ...state.local.gameState, phase: 'finished', winnerUid, result: winnerUid ? 'win' : 'draw' };
    render();
  };

  finish('local-you');
  assert.equal($('.result-modal'), null, 'it waits a moment so the last move can be seen');
  await wait(RESULT_DELAY_MS + 150);
  assert.ok($('.result-modal.is-win'), 'the dialog opens after the delay');
  assert.equal($('#result-title').textContent, 'You win!');
  assert.ok($('.result-confetti'), 'winning gets confetti (decorative)');
  assert.equal($('.result-confetti').getAttribute('aria-hidden'), 'true');
  assert.ok($('.result-modal [data-action="play-again"]'), 'the next step: play again');
  assert.ok($('.result-modal [data-action="leave-session"]'), 'the next step: another game');
  assert.equal($('.result-modal').getAttribute('role'), 'dialog');
  click($('.result-modal [data-action="play-again"]'));
  await wait(50);
  assert.equal($('.result-modal'), null, 'Play again closes the dialog');
  assert.equal(state.local.gameState.phase, 'playing', 'and starts a new round');

  finish('local-cpu');
  await wait(RESULT_DELAY_MS + 150);
  assert.ok($('.result-modal.is-loss'));
  assert.match($('#result-title').textContent, /wins!/);
  assert.equal($('.result-confetti'), null, 'no confetti when you lose');
  click($('.result-modal .modal-close'));
  assert.equal($('.result-modal'), null, 'the close button returns to the board');
  assert.ok($('.result-banner'), 'the board and its banner are still there');
  await wait(RESULT_DELAY_MS + 150);
  assert.equal($('.result-modal'), null, 'it does not reopen for the same finished game');

  finish(null);
  await wait(RESULT_DELAY_MS + 150);
  assert.ok($('.result-modal.is-draw'));
  assert.equal($('#result-title').textContent, 'It’s a draw!');
  click($('.result-modal .modal-close'));
});

test('every effect has a reduced-motion twin', () => {
  const css = readFileSync(new URL('../src/styles/fx.css', import.meta.url), 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.fx-pop[^{]*\{[^}]*animation: none/);
  assert.match(reduced, /\.game-stage::before \{ animation: none/);
  assert.match(reduced, /\.result-confetti \{ display: none/);
  assert.match(reduced, /\.is-win-cell/);
});
