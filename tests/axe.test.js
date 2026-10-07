/**
 * Automated accessibility checks with axe-core.
 *
 * Every route and every dialog is rendered in jsdom and scanned against the WCAG 2.0/2.1 A and AA
 * rule tags. Two rules are switched off on purpose, and both are covered elsewhere:
 *
 *   - `color-contrast`: jsdom performs no layout and no painting, so axe cannot measure it. The real
 *     ratios are computed from the token hex values and asserted in `tests/design-brief.test.js`,
 *     and a real-browser pass is part of the staging smoke test in `docs/online-play.md`.
 *   - the page-level landmark rules (`landmark-one-main`, `page-has-heading-one`, `region`): this
 *     suite scans `#app` — one region of a document whose landmarks and `lang` live in `index.html`.
 *
 * A third of the rules that *can* run are structural (labels, names, roles, nesting, ARIA usage),
 * which is exactly what a full re-paint from template strings can break without anyone noticing.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

let renderShell;
let state;
let appRoot;

/** Rules jsdom cannot judge; both are covered by other tests or the staging checklist. */
const DISABLED_RULES = {
  'color-contrast': { enabled: false },
  'landmark-one-main': { enabled: false },
  'page-has-heading-one': { enabled: false },
  region: { enabled: false },
};

before(async () => {
  const dom = new JSDOM('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PSD-gaming</title></head><body><div id="app"></div></body></html>', {
    url: 'https://psd-gaming.test/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const define = (name, value) => Object.defineProperty(global, name, { value, configurable: true, writable: true });
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('location', window.location);
  define('matchMedia', window.matchMedia);
  define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  define('getComputedStyle', window.getComputedStyle.bind(window));
  // axe measures elements against the current document, so it has to be the jsdom one.
  window.axe = axe;
  ({ renderShell } = await import('../src/views/shell.js'));
  ({ state } = await import('../src/state.js'));
  appRoot = window.document.querySelector('#app');
});

/** Renders the shell for a state and returns axe's violations. */
async function scan(label, mutate) {
  Object.assign(state, {
    page: 'home', modal: null, local: null, room: null, roomId: null, roomError: '',
    profile: null, isAdmin: false, friends: [], requests: [], invites: [], blocked: [],
    friendResults: [], toast: null, routeNotice: '', user: null,
  });
  mutate?.();
  appRoot.innerHTML = renderShell();
  const results = await axe.run(appRoot, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: DISABLED_RULES,
  });
  const detail = results.violations
    .map((violation) => `${violation.id}: ${violation.help} → ${violation.nodes.slice(0, 2).map((node) => node.html.slice(0, 90)).join(' | ')}`)
    .join('\n');
  assert.equal(results.violations.length, 0, `${label} has accessibility violations:\n${detail}`);
  assert.ok(results.passes.length >= 5, `${label}: axe ran a meaningful rule set (${results.passes.length} rule groups passed)`);
  return results;
}

test('the home page passes the WCAG A/AA rules axe can evaluate', async () => {
  await scan('home');
});

test('the library, friends and admin pages pass', async () => {
  await scan('catalog', () => { state.page = 'catalog'; });
  await scan('friends', () => {
    state.page = 'friends';
    state.user = { uid: 'me', isAnonymous: false, email: 'me@example.com' };
    state.profile = { uid: 'me', username: 'pixelpilot' };
    state.friends = [{ id: 'me_friend', memberUids: ['me', 'friend'], memberNames: { me: 'pixelpilot', friend: 'rival' }, createdAt: undefined }];
    state.blocked = [{ id: 'me_rude', blockerUid: 'me', blockedUid: 'rude', createdAtMs: Date.now() }];
    state.requests = [{ id: 'friend_me', fromUid: 'friend', fromName: 'rival', createdAt: undefined }];
  });
  await scan('admin', () => {
    state.page = 'admin';
    state.isAdmin = true;
    state.adminData = null;
  });
});

test('the privacy and safety pages pass', async () => {
  await scan('privacy', () => { state.page = 'privacy'; });
  await scan('safety', () => { state.page = 'safety'; });
});

test('the room, match and recovery screens pass', async () => {
  await scan('room error', () => {
    state.page = 'room';
    state.roomError = 'This invite room no longer exists.';
    state.roomId = 'abc';
  });
  await scan('game loading', () => { state.page = 'game'; });
  await scan('unknown-route notice', () => { state.routeNotice = 'nonsense'; });
});

test('every dialog passes, including the new report and delete flows', async () => {
  await scan('game dialog', () => { state.modal = { type: 'game', gameId: 'connect-four' }; });
  await scan('create-room dialog', () => { state.modal = { type: 'room', gameId: 'connect-four', friend: null }; });
  await scan('auth dialog', () => { state.modal = { type: 'auth', mode: 'register' }; });
  await scan('username dialog', () => { state.modal = { type: 'username', suggestion: 'pixelpilot' }; });
  await scan('account dialog', () => {
    state.user = { uid: 'me', isAnonymous: false, email: 'me@example.com' };
    state.profile = { uid: 'me', username: 'pixelpilot' };
    state.modal = { type: 'account' };
  });
  await scan('settings dialog', () => { state.modal = { type: 'settings' }; });
  await scan('notifications dialog', () => { state.modal = { type: 'notifications' }; });
  await scan('report dialog', () => { state.modal = { type: 'report', kind: 'player', targetUid: 'rude', targetName: 'rude', roomId: '' }; });
  await scan('delete confirmation', () => { state.modal = { type: 'confirm', title: 'Delete this account?', body: 'This cannot be undone.', confirmLabel: 'Delete my account', run: () => {} }; });
  await scan('setup dialog', () => { state.modal = { type: 'setup' }; });
});

test('the maintenance page passes the WCAG A/AA rules axe can evaluate', async () => {
  // The one screen every visitor sees while the arcade is closed: it is rendered instead of the
  // shell, so it has to carry its own landmarks, heading, labelled field and error region.
  const { renderMaintenancePage } = await import('../src/views/maintenance.js');
  const { safeMaintenanceStatus } = await import('../shared/online/maintenance.js');
  Object.assign(state, {
    page: 'home',
    modal: null,
    toast: null,
    isAdmin: false,
    maintenanceUnlocked: false,
    maintenanceError: '',
    maintenance: safeMaintenanceStatus({ enabled: true, message: 'Down for a tune-up. Back at 18:00 UTC.', pinVersion: 1, pinActive: true }),
  });
  for (const withError of [false, true]) {
    state.maintenanceError = withError ? 'That tester PIN is not correct.' : '';
    appRoot.innerHTML = renderMaintenancePage();
    const results = await axe.run(appRoot, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: DISABLED_RULES,
    });
    const detail = results.violations
      .map((violation) => `${violation.id}: ${violation.help} → ${violation.nodes.slice(0, 2).map((node) => node.html.slice(0, 90)).join(' | ')}`)
      .join('\n');
    assert.equal(results.violations.length, 0, `the maintenance page${withError ? ' with a PIN error' : ''} has accessibility violations:\n${detail}`);
    assert.ok(results.passes.length >= 5, `axe ran a meaningful rule set (${results.passes.length} rule groups passed)`);
  }
});
