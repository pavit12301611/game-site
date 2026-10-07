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

test('the maintenance notice, the tester banner and the admin panel all pass', async () => {
  // `scan()` resets the fields it knows about and `state.maintenance` is not one of them, so the
  // fixture is written in full every time and cleared at the end.
  const closed = {
    status: 'live',
    enabled: true,
    reason: 'Rooms are moving to a new backend.\nBack within the hour.',
    updatedAtMs: Date.now() - 120000,
    updatedByUid: 'admin',
    pinHash: 'sha256:aa',
    pinSalt: 'bb',
    pinExpiresAtMs: Date.now() + 3_600_000,
    pinSetAtMs: Date.now() - 120000,
    pinExpired: false,
    error: '',
    pass: null,
    attempts: { count: 1, lockedUntilMs: 0 },
    checking: false,
    saving: false,
    pinDraft: '1234 5678 9012 3456',
    unlockMessage: 'That is not the code. 5 more attempts before a short pause.',
    unlockOk: false,
    preview: false,
    access: { pin: '1234567890123456', expiresAtMs: Date.now() + 86_400_000, hours: 24 },
    accessError: '',
    draft: { reason: 'Rooms are moving to a new backend.', hours: 24 },
  };
  try {
    // The page a locked-out visitor gets: the whole document is this, so its headings, labels and
    // live regions have to be right with nothing else on the page to share the job with.
    await scan('maintenance notice', () => { state.maintenance = { ...state.maintenance, ...closed }; });
    await scan('maintenance notice with no code and a failed read', () => {
      state.maintenance = {
        ...state.maintenance,
        ...closed,
        status: 'error',
        error: 'Firestore refused that read.',
        pinHash: '',
        unlockMessage: '',
        access: null,
        pinDraft: '',
      };
    });
    await scan('maintenance notice an admin is previewing', () => {
      state.maintenance = { ...state.maintenance, ...closed, preview: true };
      state.isAdmin = true;
      state.user = { uid: 'admin', isAnonymous: false, email: 'admin@example.com' };
      state.profile = { uid: 'admin', username: 'operator' };
    });
    await scan('the tester banner, over the live arcade', () => {
      state.maintenance = { ...state.maintenance, ...closed, pass: { digest: 'sha256:aa', expiresAtMs: Date.now() + 3_600_000 } };
      state.isAdmin = false;
    });
    await scan('the admin studio panel', () => {
      state.page = 'admin';
      state.isAdmin = true;
      state.adminData = null;
      state.maintenance = { ...state.maintenance, ...closed };
      state.adminTab = 'maintenance';
    });
    await scan('the admin studio panel while the site is open', () => {
      state.page = 'admin';
      state.isAdmin = true;
      state.adminTab = 'maintenance';
      state.maintenance = { ...state.maintenance, ...closed, enabled: false, access: null, pass: null };
    });
  } finally {
    state.maintenance = { ...state.maintenance, enabled: false, preview: false, pass: null, access: null, pinDraft: '', unlockMessage: '', unlockOk: false, attempts: { count: 0, lockedUntilMs: 0 } };
  }
});
