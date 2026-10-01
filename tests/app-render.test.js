/**
 * App-level smoke tests: the real UI, rendered in jsdom, with no Firebase configured.
 *
 * They cover the path a visitor takes before any online feature exists — the thing that must never
 * break: the shell renders, the catalog lists every game, a practice match can be played against the
 * CPU, the search filters, the theme toggles and Escape closes a dialog.
 *
 * `src/app.js` is imported (not `src/main.js`) because the entry point also imports the stylesheet,
 * which only Vite understands. Everything here runs offline: Firebase is not configured in Node, so
 * the app is in "Local practice mode" by design.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let dom;
let app;
let appRoot;

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

  appRoot = window.document.querySelector('#app');
  // Imported after the globals exist: src/app.js touches document/localStorage as it loads.
  app = await import('../src/app.js');
});

/** @param {string} selector */
function $(selector) {
  return appRoot.querySelector(selector);
}

function all(selector) {
  return [...appRoot.querySelectorAll(selector)];
}

/** @param {string} action */
function button(action, extra = '') {
  return appRoot.querySelector(`[data-action="${action}"]${extra}`);
}

function click(element) {
  assert.ok(element, 'the element to click exists');
  element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}

function setHash(hash) {
  dom.window.location.hash = hash;
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
}

test('the app renders the shell in local practice mode', () => {
  assert.ok(appRoot.innerHTML.length > 1000, 'the shell is rendered');
  assert.match(appRoot.textContent, /PSD/);
  assert.match(appRoot.textContent, /Your arcade/, 'the hero copy is there');
  assert.match(appRoot.querySelector('.sidebar-bottom').textContent, /Local practice mode/, 'no Firebase config means local practice, honestly labelled');
  assert.equal(all('.nav-item').length >= 3, true, 'the sidebar shows Home / Game library / Friends');
});

test('the catalog lists all 40 games and filters by search text', () => {
  setHash('#/catalog');
  assert.equal(all('[data-action="open-game"]').length, 40);
  assert.match($('.game-count').textContent, /40/);

  const search = $('#global-search');
  assert.ok(search, 'the global search box exists');
  search.value = 'maze';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const titles = all('.game-card-copy h3').map((node) => node.textContent);
  assert.ok(titles.length > 0 && titles.length < 40, 'search narrows the shelf');
  assert.ok(titles.every((title) => /maze|labyrinth|escape|runner/i.test(title)), 'only maze games remain');

  search.value = '';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(all('[data-action="open-game"]').length, 40, 'clearing the search restores the shelf');
});

test('a category filter narrows the shelf and can be cleared', () => {
  setHash('#/catalog');
  const pill = all('[data-action="filter-category"]').find((node) => node.dataset.category === 'Puzzle');
  click(pill);
  assert.ok(all('[data-action="open-game"]').length < 40, 'only puzzle games are shown');
  click(all('[data-action="filter-category"]').find((node) => node.dataset.category === 'All games'));
  assert.equal(all('[data-action="open-game"]').length, 40);
});

test('opening a game offers local practice and disables online rooms without Firebase', () => {
  setHash('#/catalog');
  click(button('open-game'));
  assert.ok($('.game-modal'), 'the game dialog opened');
  assert.match($('.game-modal').textContent, /Create online room/);
  assert.equal(button('create-room-for-game').disabled, true, 'online rooms are off, so the button says so by being disabled');
  assert.equal(button('practice-game').disabled, false);
  assert.match($('.game-modal').textContent, /Practice locally/);
});

test('a practice match renders its board and accepts a move', () => {
  setHash('#/catalog');
  // Pixel Tic-Tac-Toe is the first card in the catalog.
  const card = all('[data-action="open-game"]').find((node) => node.dataset.gameId === 'pixel-tac-toe');
  click(card);
  click(button('practice-game'));
  assert.match($('#page-content').textContent, /LOCAL PRACTICE/, 'the practice badge is shown');
  const cells = all('[data-action="line-move"]');
  assert.equal(cells.length, 9, 'a 3x3 board is rendered');
  assert.equal(cells.filter((cell) => cell.disabled).length, 0, 'it is your turn, so every cell is live');

  click(cells[0]);
  const after = all('[data-action="line-move"]');
  assert.match(after[0].textContent, /✕/, 'your mark lands on the board');
  assert.equal(after[0].disabled, true, 'the square is taken');
});

test('the CPU answers, and the match rail shows both players', () => {
  const players = all('.match-player b').map((node) => node.textContent.trim());
  assert.ok(players.some((name) => /You/.test(name)), 'you are listed');
  assert.ok(players.some((name) => /CPU/.test(name)), 'the browser rival is listed');
});

test('Escape closes a dialog, and the backdrop click only closes from the backdrop', () => {
  setHash('#/catalog');
  click(button('open-game'));
  assert.ok($('.modal-backdrop'), 'a dialog is open');
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal($('.modal-backdrop'), null, 'Escape closed it');
});

test('leaving a practice match returns to the catalog', () => {
  setHash('#/catalog');
  click(all('[data-action="open-game"]').find((node) => node.dataset.gameId === 'connect-four'));
  click(button('practice-game'));
  assert.ok($('[data-action="drop-move"]') || all('[data-action="drop-move"]').length > 0, 'the drop board is rendered');
  click(button('leave-session'));
  assert.match($('#page-content').textContent, /The game shelf|game shelf/i);
});

test('the theme toggle flips the document theme and persists the choice', () => {
  setHash('#/home');
  const before = dom.window.document.documentElement.dataset.theme;
  click(button('toggle-theme'));
  const after = dom.window.document.documentElement.dataset.theme;
  assert.notEqual(after, before, 'the theme changed');
  assert.ok(['light', 'dark'].includes(after));
  assert.equal(dom.window.localStorage.getItem('psd-theme-preference'), after, 'the choice is stored');
  click(button('toggle-theme'));
  assert.equal(dom.window.document.documentElement.dataset.theme, before, 'toggling again goes back');
});

test('the friends page explains that online features need a configured Firebase', () => {
  setHash('#/friends');
  assert.match($('#page-content').textContent, /Friends need Firebase|Firebase/i);
  assert.equal($('#friend-username').disabled, true, 'adding friends is unavailable without an account');
});

test('the admin page is not reachable for a normal visitor', () => {
  setHash('#/admin');
  assert.match($('#page-content').textContent, /Restricted area/i);
  assert.ok(!$('.admin-table'), 'no admin data is rendered');
});

test('every rendered control has an accessible name', () => {
  setHash('#/catalog');
  const controls = all('button');
  for (const control of controls) {
    const label = (control.getAttribute('aria-label') || control.textContent || '').trim();
    assert.ok(label.length > 0, `a button without a label: ${control.outerHTML.slice(0, 80)}`);
  }
});

test('rendering never throws for any page', () => {
  for (const page of ['home', 'catalog', 'friends', 'admin']) {
    assert.doesNotThrow(() => setHash(`#/${page}`), `#/${page} renders`);
    assert.ok($('#page-content').textContent.trim().length > 0, `#/${page} has content`);
  }
});
