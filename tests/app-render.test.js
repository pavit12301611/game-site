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
let appRoot;
/** Everything written to console.error while src/app.js loaded and painted for the first time. */
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

test('start-up ends in a painted page: shell, sidebar brand and hero are in #app', () => {
  // The blank-page outage was exactly this assertion failing in production: #app stayed empty
  // because start-up threw before the first paint. Everything below must hold synchronously
  // after `import('../src/app.js')` in local practice mode.
  assert.ok($('.app-shell'), 'the app shell is painted');
  assert.ok($('.sidebar .brand-lockup'), 'the sidebar brand is there');
  assert.match($('.sidebar .brand-lockup').textContent, /PSD/);
  assert.ok($('.hero-panel'), 'the landing page hero is there');
  assert.ok($('.hero-panel h1'), 'with its headline');
  assert.ok($('#page-content'), 'and the page container');
  assert.ok(appRoot.innerHTML.length > 1000, 'the shell is rendered');
  assert.match(appRoot.textContent, /PSD/);
  assert.match(appRoot.textContent, /Your arcade/, 'the hero copy is there');
  assert.equal($('.fatal-error'), null, 'it is the real page, not the recovery screen');
  assert.deepEqual(startupErrors, [], 'start-up wrote nothing to console.error');
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
  const titles = all('.game-card-title').map((node) => node.textContent);
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
  assert.match($('#page-content').textContent, /Local practice/, 'the practice badge is shown');
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

test('starting a second practice game while the CPU is still thinking does not crash the first timer', async () => {
  const errors = [];
  const onError = (event) => { errors.push(event.message); event.preventDefault(); };
  dom.window.addEventListener('error', onError);
  const open = (id) => {
    setHash('#/catalog');
    click(all('[data-action="open-game"]').find((node) => node.dataset.gameId === id));
    click(button('practice-game'));
  };
  open('maze-runner'); // schedules a CPU move 620 ms out
  open('sea-battle'); // a different engine: the old timer must not act on this state
  await new Promise((resolve) => setTimeout(resolve, 900));
  dom.window.removeEventListener('error', onError);
  assert.deepEqual(errors, [], 'no uncaught error from the stale CPU timer');
  assert.ok(all('[data-action="battle-fire"]').length > 0, 'the second game is on screen');
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

test('the admin studio renders every section with its action buttons for a flagged admin', async () => {
  // Rendering is pure "state in, HTML out", so a flagged state paints the studio *without* a
  // Firebase backend: loadAdminData returns immediately when Firebase is off, and Firestore stays
  // the real gatekeeper for the buttons shown here (firestore.rules isAdmin()).
  const { state } = await import('../src/state.js');
  const { GAMES } = await import('../src/catalog.js');
  const gameId = GAMES[0].id;
  state.isAdmin = true;
  state.user = { uid: 'uid-admin-1', isAnonymous: false };
  state.adminLoading = false;
  state.adminTab = 'overview';
  state.adminData = {
    error: '',
    rooms: [
      { id: 'room-waiting', gameId, hostUid: 'uid-2', hostName: 'Hosty', playerUids: ['uid-2', 'uid-3'], playerNames: { 'uid-2': 'Hosty', 'uid-3': 'Guesty' }, maxPlayers: 2, status: 'waiting', createdAt: Date.now() - 10 * 60 * 1000 },
      { id: 'room-live', gameId, hostUid: 'uid-2', hostName: 'Hosty', playerUids: ['uid-2', 'uid-3'], playerNames: { 'uid-2': 'Hosty', 'uid-3': 'Guesty' }, maxPlayers: 2, status: 'playing', createdAt: Date.now() - 20 * 60 * 1000 },
      { id: 'room-expired', gameId, hostUid: 'uid-2', hostName: 'OldHost', playerUids: ['uid-2'], playerNames: { 'uid-2': 'OldHost' }, maxPlayers: 2, status: 'waiting', createdAt: Date.now() - 61 * 60 * 1000 },
    ],
    profiles: [
      { uid: 'uid-admin-1', username: 'boss', usernameLower: 'boss' },
      { uid: 'uid-2', username: 'hosty', usernameLower: 'hosty' },
    ],
    admins: [{ id: 'uid-admin-1', admin: true }],
    friendships: [{ id: 'f1', memberUids: ['uid-2', 'uid-3'], memberNames: { 'uid-2': 'Hosty', 'uid-3': 'Guesty' } }],
    requests: [{ id: 'r1', fromUid: 'uid-2', toUid: 'uid-3', fromName: 'hosty', toName: 'guesty', status: 'pending' }],
    invites: [{ id: 'i1', fromUid: 'uid-2', toUid: 'uid-3', fromName: 'hosty', toName: 'guesty', gameId, status: 'pending' }],
  };
  try {
    setHash('#/admin');
    assert.equal(all('.admin-tabs [data-action="admin-tab"]').length, 6, 'all six studio sections exist');
    assert.ok($('.admin-metrics'), 'the overview metrics render');
    assert.match($('#page-content').textContent, /What this studio can do/);

    click(button('admin-tab', '[data-tab="rooms"]'));
    assert.ok(button('admin-delete-room', '[data-room-id="room-waiting"]'), 'each room can be deleted');
    assert.ok(button('admin-kick-player', '[data-room-id="room-waiting"][data-uid="uid-3"]'), 'a waiting lobby member can be kicked');
    assert.ok(!button('admin-kick-player', '[data-room-id="room-live"]'), 'kicks are not offered for a running match');
    assert.ok(!button('admin-delete-room', '[data-room-id="room-expired"]'), 'rooms older than 1 hour are excluded');

    click(button('admin-tab', '[data-tab="players"]'));
    assert.ok($('.uid-chip'), 'player UIDs are shown');
    assert.ok(button('admin-grant', '[data-uid="uid-2"]'), 'a player can be promoted');
    assert.ok(button('admin-remove-player', '[data-uid="uid-2"]'), 'a player can be removed');
    assert.ok(!button('admin-remove-player', '[data-uid="uid-admin-1"]'), 'your own row has no self-destruct');

    click(button('admin-tab', '[data-tab="social"]'));
    assert.ok(button('admin-delete-friendship', '[data-friendship-id="f1"]'), 'a friend link can be unlinked');
    assert.ok(button('admin-delete-request', '[data-request-id="r1"]'), 'a request can be deleted');
    assert.ok(button('admin-delete-invite', '[data-invite-id="i1"]'), 'an invite can be deleted');

    click(button('admin-tab', '[data-tab="access"]'));
    assert.ok($('#admin-uid-input'), 'the promote-by-UID form exists');
    assert.match($('#page-content').textContent, /@boss/, 'admin names resolve from profiles');
    assert.match($('#page-content').textContent, /Self-lockout is blocked/, 'your own flag cannot be revoked from here');

    // Every destructive click goes through the confirm modal, and cancel leaves the data alone.
    click(button('admin-tab', '[data-tab="rooms"]'));
    click(button('admin-delete-room', '[data-room-id="room-waiting"]'));
    assert.ok($('.confirm-modal'), 'the confirm gate opens before anything destructive');
    assert.equal(state.modal.type, 'confirm');
    click(button('close-modal'));
    assert.ok(!$('.confirm-modal'), 'cancelling closes the gate');

    for (const control of all('#page-content button')) {
      const label = (control.getAttribute('aria-label') || control.textContent || '').trim();
      assert.ok(label.length > 0, `admin studio button without a label: ${control.outerHTML.slice(0, 80)}`);
    }
  } finally {
    state.isAdmin = false;
    state.user = null;
    state.adminData = null;
    state.adminTab = 'overview';
    setHash('#/home');
  }
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

test('landing and catalog images: sized, lazy except the hero, and every game card shows its own file', () => {
  setHash('#/home');
  const hero = all('img.hero-artwork');
  assert.equal(hero.length, 1, 'one hero image');
  assert.equal(hero[0].getAttribute('fetchpriority'), 'high');
  assert.equal(all('img[fetchpriority="high"]').length, 1, 'only the hero is high priority');
  for (const img of all('img')) {
    assert.ok(img.getAttribute('width') && img.getAttribute('height'), `${img.getAttribute('src')} has width and height`);
    if (!img.classList.contains('hero-artwork')) {
      assert.equal(img.getAttribute('loading'), 'lazy', `${img.getAttribute('src')} is lazy`);
      assert.equal(img.getAttribute('decoding'), 'async');
    }
  }
  assert.equal(all('.category-card').length, 4, 'four category covers on the landing page');

  setHash('#/catalog');
  const clear = button('clear-filters');
  if (clear) click(clear);
  click(all('[data-action="filter-category"]').find((node) => node.dataset.category === 'All games'));
  const sources = all('.game-card img').map((img) => img.getAttribute('src'));
  assert.equal(sources.length, 40);
  assert.equal(new Set(sources).size, 40, 'no two cards share a picture');
});

test('a category cover on the landing page opens the catalog filtered to that category', () => {
  setHash('#/home');
  click(all('.category-card').find((node) => node.dataset.category === 'Strategy'));
  assert.equal(dom.window.location.hash, '#/catalog');
  assert.ok($('#catalog-grid'), 'the catalog is showing');
  assert.ok(all('.filter-pill.is-active').some((node) => node.dataset.category === 'Strategy'), 'the Strategy filter is active');
  assert.ok(all('.game-card').length > 0 && all('.game-card').length < 40);
  click(all('[data-action="filter-category"]').find((node) => node.dataset.category === 'All games'));
});
