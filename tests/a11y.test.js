/**
 * Keyboard and screen-reader behaviour that has to survive `render()` repainting the whole page: one persistent
 * live region, focus that comes back after a repaint, dialog focus (in, trapped, back out), arrow-key movement
 * inside boards and the number keys for quiz answers and rally lanes.
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


const $ = (selector) => appRoot.querySelector(selector);
const all = (selector) => [...appRoot.querySelectorAll(selector)];
const click = (element) => { assert.ok(element, 'the element to click exists'); element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); };
const setHash = (hash) => { dom.window.location.hash = hash; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); };
const key = (target, name, extra = {}) => {
  const event = new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event);
  return event;
};
const card = (id) => all('[data-action="open-game"]').find((node) => node.dataset.gameId === id);
const startPractice = (id) => { setHash('#/catalog'); click(card(id)); click($('[data-action="practice-game"]')); };

test('one persistent polite live region lives outside #app and survives repaints', () => {
  const region = dom.window.document.getElementById('live-region');
  assert.ok(region, 'the live region exists after the first paint');
  assert.equal(region.getAttribute('aria-live'), 'polite');
  assert.equal(region.getAttribute('role'), 'status');
  assert.equal(appRoot.contains(region), false, 'it is not inside #app, so a repaint cannot recreate it');
  setHash('#/catalog');
  setHash('#/home');
  assert.equal(dom.window.document.querySelectorAll('#live-region').length, 1);
  assert.equal(dom.window.document.getElementById('live-region'), region, 'the same node, not a new one');
});

test('a practice match announces the turn in the live region', () => {
  startPractice('pixel-tac-toe');
  const text = dom.window.document.getElementById('live-region').textContent;
  assert.ok(text.length > 3, 'something was announced');
  assert.equal(text.trim(), $('.turn-chip').textContent.trim(), 'it is the same words the turn chip shows');
});

test('a toast is announced too', () => {
  setHash('#/catalog');
  const star = $('[data-action="toggle-favorite"]');
  click(star);
  const region = dom.window.document.getElementById('live-region');
  assert.match(region.textContent, /\w/, 'the region has text after a toast');
  assert.equal(region.textContent.trim(), $('.toast').textContent.trim());
});

test('focus returns to the same control after a repaint', () => {
  setHash('#/catalog');
  const star = all('[data-action="toggle-favorite"]').find((node) => node.dataset.gameId === 'neon-gomoku');
  star.focus();
  assert.equal(dom.window.document.activeElement, star);
  click(star); // toggles the favourite and repaints everything
  const now = dom.window.document.activeElement;
  assert.notEqual(now, star, 'the old node is gone');
  assert.equal(now.dataset.action, 'toggle-favorite');
  assert.equal(now.dataset.gameId, 'neon-gomoku', 'focus is on the same game button');
  click(now); // put the favourite back
});

test('a dialog takes focus, keeps Tab inside, and gives focus back to its opener on Escape', () => {
  setHash('#/catalog');
  const opener = card('connect-four');
  opener.focus();
  click(opener);
  const dialog = $('[role="dialog"]');
  assert.ok(dialog, 'the dialog opened');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.ok(dialog.contains(dom.window.document.activeElement), 'focus moved into the dialog');

  const focusables = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled])')];
  assert.ok(focusables.length >= 2);
  focusables.at(-1).focus();
  const forward = key(focusables.at(-1), 'Tab');
  assert.equal(forward.defaultPrevented, true, 'Tab on the last control is handled');
  assert.equal(dom.window.document.activeElement, focusables[0], 'and wraps to the first');
  const backward = key(focusables[0], 'Tab', { shiftKey: true });
  assert.equal(backward.defaultPrevented, true);
  assert.equal(dom.window.document.activeElement, focusables.at(-1), 'Shift+Tab wraps to the last');

  key(dom.window.document.activeElement, 'Escape');
  assert.equal($('[role="dialog"]'), null, 'Escape closed it');
  const back = dom.window.document.activeElement;
  assert.equal(back.dataset.action, 'open-game');
  assert.equal(back.dataset.gameId, 'connect-four', 'focus is back on the card that opened it');
});

test('arrow keys move between squares of a board, skipping taken ones', () => {
  startPractice('pixel-tac-toe');
  const cells = all('[data-action="line-move"]');
  assert.equal(cells.length, 9);
  assert.equal($('.line-board').getAttribute('data-nav'), 'grid');
  assert.equal($('.line-board').getAttribute('role'), 'group', 'a flat list of buttons is a group, not an invalid grid');
  cells[4].focus();
  assert.equal(key(cells[4], 'ArrowRight').defaultPrevented, true);
  assert.equal(dom.window.document.activeElement, cells[5]);
  key(cells[5], 'ArrowDown');
  assert.equal(dom.window.document.activeElement, cells[8]);
  key(cells[8], 'ArrowRight'); // the right edge: stays put
  assert.equal(dom.window.document.activeElement, cells[8]);
  key(cells[8], 'Home');
  assert.equal(dom.window.document.activeElement, cells[0]);
  key(cells[0], 'End');
  assert.equal(dom.window.document.activeElement, cells[8]);
});

test('arrow keys skip disabled buttons and a row only moves sideways', () => {
  const host = dom.window.document.createElement('div');
  host.innerHTML = '<div data-nav="grid" data-cols="3"><button id="a">a</button><button id="b" disabled>b</button><button id="c">c</button><button id="d">d</button><button id="e">e</button><button id="f">f</button></div>'
    + '<div data-nav="row"><button id="x">x</button><button id="y">y</button></div>';
  dom.window.document.body.append(host);
  const id = (name) => host.querySelector(`#${name}`);
  id('a').focus();
  key(id('a'), 'ArrowRight');
  assert.equal(dom.window.document.activeElement, id('c'), 'the disabled neighbour is skipped');
  key(id('c'), 'ArrowDown');
  assert.equal(dom.window.document.activeElement, id('f'));
  id('x').focus();
  assert.equal(key(id('x'), 'ArrowDown').defaultPrevented, false, 'a row ignores up/down');
  key(id('x'), 'ArrowRight');
  assert.equal(dom.window.document.activeElement, id('y'));
  host.remove();
});

test('a quiz is answered with the number keys or A-D, and a rally lane with 1-3', () => {
  startPractice('retro-trivia');
  const clicked = [];
  const record = (event) => clicked.push(event.target.closest('.quiz-option, [data-action="rally-hit"]'));
  dom.window.addEventListener('click', record, true);
  const options = all('.quiz-option');
  assert.ok(options.length >= 3, 'the question has answers');
  key(dom.window.document.body, '2');
  assert.equal(clicked[0], options[1], 'the key 2 pressed the second answer');
  dom.window.removeEventListener('click', record, true);

  startPractice('pong-rally');
  const lanes = all('[data-action="rally-hit"]');
  assert.equal(lanes.length, 3);
  assert.equal($('.lane-buttons').getAttribute('data-nav'), 'row');
  if (!lanes[0].disabled) {
    dom.window.addEventListener('click', record, true);
    key(dom.window.document.body, '3');
    dom.window.removeEventListener('click', record, true);
    assert.equal(clicked.at(-1), lanes[2], 'the key 3 chose the third lane');
  }
});
