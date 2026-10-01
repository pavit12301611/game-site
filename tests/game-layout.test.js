/**
 * Layout stability of the game screen: acting in a game must not resize the box around it. jsdom has no layout,
 * so these tests pin the three causes that were found in a real browser:
 *  1. dynamic regions (result banner, last-round panel, code reveal) live in reserved slots instead of being inserted;
 *  2. grid tracks on boards are `minmax(0, 1fr)`, so a glyph inside a cell can never stretch its row or column;
 *  3. the footer and the result banner share one `.stage-foot` zone.
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

test('every practice game puts its footer in the single reserved .stage-foot zone, with no banner before the end', () => {
  for (const id of ['pixel-tac-toe', 'connect-four', 'memory-match', 'pixel-tap', 'rock-paper-scissors', 'retro-trivia', 'maze-runner', 'sea-battle', 'pong-rally', 'codebreaker']) {
    startPractice(id);
    assert.equal(all('.game-stage > .stage-foot').length, 1, `${id}: one stage-foot`);
    assert.ok($('.stage-foot .game-stage-footer'), `${id}: the footer sits inside the zone`);
    assert.equal($('.result-banner'), null, `${id}: no banner at the start`);
    assert.equal($('.game-stage > .game-stage-footer'), null, `${id}: the footer is not a loose child of the stage`);
  }
});

test('the duel board always renders the last-round panel and the code board always renders its reveal slot', () => {
  startPractice('rock-paper-scissors');
  assert.ok($('.duel-board > .last-round-result.is-idle'), 'a placeholder holds the space before round one');
  startPractice('codebreaker');
  assert.ok($('.code-board-wrap > .code-reveal-slot'), 'the reveal slot exists before the game ends');
  assert.equal($('.code-reveal'), null);
  assert.ok($('.guess-history'), 'guesses scroll inside a fixed window');
});

test('board grids use minmax(0, 1fr) tracks so a glyph cannot stretch a row or column', () => {
  const css = readFileSync(new URL('../src/styles/boards.css', import.meta.url), 'utf8');
  const bare = css.match(/repeat\(var\(--[a-z-]+\), 1fr\)/g) || [];
  assert.deepEqual(bare, [], 'no repeat(var(--n), 1fr): use minmax(0, 1fr)');
  assert.match(css, /\.line-board \{[^}]*grid-template-rows: repeat\(var\(--board-size\), minmax\(0, 1fr\)\)/, 'the line board has explicit equal rows');
});
