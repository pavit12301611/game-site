/**
 * Maintenance mode, front half: the dedicated page, the states it must show (and not show),
 * and the safe handling of missing or malformed maintenance data.
 *
 * Runs in jsdom with no Firebase configured (like app-render.test.js), so `state.maintenance`
 * is set directly to the shapes `loadMaintenanceStatus` can produce, and `render()` paints the
 * real shell. The backend half (admin-only updates, PIN verification, rate limits) is covered
 * in functions/test/handlers.test.js; the rules half in firestore-rules / rules-emulator.
 */
import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let dom;
let state;
let render;
let normalizeMaintenanceData;

before(async () => {
  dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
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
  define('HTMLElement', window.HTMLElement);
  define('Node', window.Node);
  define('FormData', window.FormData);
  define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  define('getComputedStyle', window.getComputedStyle.bind(window));
  // Imported after the globals exist: state.js reads localStorage and render.js the document.
  ({ state } = await import('../src/state.js'));
  ({ render } = await import('../src/render.js'));
  ({ normalizeMaintenanceData } = await import('../src/maintenance.js'));
});

/** @param {Record<string, unknown>} [maintenance] @param {{ admin?: boolean, bypass?: boolean, error?: string }} [flags] */
function paint(maintenance = null, { admin = false, bypass = false, error = '' } = {}) {
  state.maintenance = maintenance;
  state.isAdmin = admin;
  state.maintenanceBypass = bypass;
  state.maintenanceError = error;
  state.page = 'home';
  state.modal = null;
  render();
  return dom.window.document;
}

/** True when the real app shell (search box and all) is on screen. */
function appVisible(documentEl) {
  return Boolean(documentEl.querySelector('#global-search')) && !documentEl.querySelector('.maintenance-page');
}

beforeEach(() => {
  state.maintenance = null;
  state.isAdmin = false;
  state.maintenanceBypass = false;
  state.maintenanceError = '';
});

test('the maintenance page renders for a visitor when maintenance mode is enabled', () => {
  const documentEl = paint({ enabled: true, message: 'Be right back - shipping the arcade soon.' });
  assert.ok(documentEl.querySelector('.maintenance-page'), 'the dedicated page replaces the shell');
  assert.ok(documentEl.querySelector('#maintenance-title'), 'the page has a heading to focus');
  assert.ok(documentEl.body.textContent.includes('Be right back - shipping the arcade soon.'), 'the operator message is shown');
  assert.ok(!documentEl.querySelector('#global-search'), 'no app chrome leaks under maintenance');
  const pin = /** @type {HTMLInputElement | null} */ (documentEl.querySelector('#maintenance-pin'));
  assert.ok(pin, 'the tester PIN field is there');
  assert.equal(pin.maxLength, 16, 'the field is exactly 16 characters');
  assert.equal(pin.getAttribute('pattern'), '[0-9]{16}', 'digits only');
  assert.ok(documentEl.querySelector('form[data-form="maintenance-pin"]'), 'the form goes through the app handler');
});

test('a disabled (or never read) flag shows the normal arcade, never the maintenance page', () => {
  assert.ok(appVisible(paint({ enabled: false, message: 'Be right back.' })));
  assert.ok(appVisible(paint(null)), 'a missing flag fails open: the arcade stays up');
  assert.ok(appVisible(paint({ enabled: true, message: 'x' }, { admin: true })), 'a verified admin is never locked out, even mid-maintenance');
  assert.ok(appVisible(paint({ enabled: true, message: 'x' }, { bypass: true })), 'a tester the backend let in with the PIN stays in');
});

test('the operator message is always escaped before it is drawn', () => {
  const documentEl = paint({ enabled: true, message: '<img src=x onerror=alert(1)>' });
  assert.ok(!documentEl.querySelector('.maintenance-card img'), 'markup in the message cannot execute');
  assert.ok(documentEl.querySelector('.maintenance-message')?.textContent.includes('<img src=x onerror=alert(1)>'), 'the text is shown, escaped');
});

test('a rejected PIN is shown inline (no toast can render under the gate)', () => {
  const documentEl = paint({ enabled: true, message: '' }, { error: 'That PIN does not match.' });
  assert.ok(documentEl.querySelector('.maintenance-error[role="alert"]'), 'the error is announced');
  assert.ok(documentEl.querySelector('.maintenance-error')?.textContent.includes('That PIN does not match.'));
  assert.equal(documentEl.querySelector('#maintenance-pin')?.getAttribute('aria-invalid'), 'true');
});

test('malformed maintenance data is normalized to something safe and open', () => {
  assert.deepEqual(normalizeMaintenanceData(null), { enabled: false, message: '' }, 'a missing document leaves the arcade open');
  assert.deepEqual(normalizeMaintenanceData('not an object'), { enabled: false, message: '' });
  assert.deepEqual(normalizeMaintenanceData({ enabled: 'yes', message: 42 }), { enabled: false, message: '' }, 'a lying enabled field cannot close the arcade');
  assert.deepEqual(normalizeMaintenanceData({ enabled: true }), { enabled: true, message: '' }, 'a missing message falls back to the default copy');
  const long = normalizeMaintenanceData({ enabled: true, message: 'a'.repeat(500) });
  assert.equal(long.message.length, 280, 'the message is capped at the backend ceiling');
  assert.deepEqual(normalizeMaintenanceData({ enabled: true, message: 'Tuning.' }), { enabled: true, message: 'Tuning.' }, 'an honest document passes through');
  const documentEl = paint(normalizeMaintenanceData({ enabled: 'yes', message: 42 }));
  assert.ok(appVisible(documentEl), 'and the page honors the normalized flag, not the raw document');
});
