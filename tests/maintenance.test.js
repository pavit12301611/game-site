import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { MAINTENANCE_PIN_LENGTH, MAINTENANCE_REASON_MAX } from '../src/helpers.js';

let formatMaintenancePin;
let generateMaintenancePin;
let hashesEqual;
let hashMaintenancePin;
let isCompleteMaintenancePin;
let normalizeMaintenancePin;
let parseMaintenanceStatus;
let isSiteLocked;
let state;
let renderMaintenancePage;
let renderAdminMaintenance;

before(async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
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
  ({
    formatMaintenancePin,
    generateMaintenancePin,
    hashesEqual,
    hashMaintenancePin,
    isCompleteMaintenancePin,
    normalizeMaintenancePin,
    parseMaintenanceStatus,
  } = await import('../src/maintenance.js'));
  ({ isSiteLocked, state } = await import('../src/state.js'));
  ({ renderMaintenancePage, renderAdminMaintenance } = await import('../src/views/maintenance.js'));
});

function resetLockState() {
  state.isAdmin = false;
  state.maintenanceUnlocked = false;
  state.maintenancePlainPin = '';
  state.maintenancePinError = '';
  state.maintenanceSaving = false;
  state.maintenance = {
    pending: false,
    loaded: true,
    enabled: false,
    reason: '',
    sessionId: '',
    pinSalt: '',
    pinHash: '',
    updatedAt: null,
    updatedBy: '',
  };
}

test('a generated PIN is exactly 16 unbiased decimal digits', () => {
  const pins = new Set();
  for (let i = 0; i < 20; i += 1) {
    const pin = generateMaintenancePin();
    assert.equal(pin.length, MAINTENANCE_PIN_LENGTH);
    assert.match(pin, /^\d{16}$/);
    pins.add(pin);
  }
  assert.equal(pins.size, 20, 'twenty draws should not collide');
});

test('generateMaintenancePin consumes the injected byte source and skips 250-255', () => {
  const bytes = Uint8Array.from([250, 251, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6]);
  const pin = generateMaintenancePin(() => bytes);
  assert.equal(pin, '9012345678901234');
});

test('PIN normalize / format / completeness helpers', () => {
  assert.equal(normalizeMaintenancePin('12ab 34-56 78_90 1234 999'), '1234567890123499');
  assert.equal(formatMaintenancePin('1234567890123456'), '1234 5678 9012 3456');
  assert.equal(formatMaintenancePin('1234'), '1234');
  assert.equal(isCompleteMaintenancePin('1234 5678 9012 3456'), true);
  assert.equal(isCompleteMaintenancePin('1234 5678'), false);
});

test('hashMaintenancePin is deterministic, salted, and session-bound', async () => {
  const pin = '1234567890123456';
  const first = await hashMaintenancePin(pin, 'salt-a', 'session-1');
  const again = await hashMaintenancePin('1234 5678 9012 3456', 'salt-a', 'session-1');
  const otherSalt = await hashMaintenancePin(pin, 'salt-b', 'session-1');
  const otherSession = await hashMaintenancePin(pin, 'salt-a', 'session-2');
  assert.equal(first.length, 64);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, again);
  assert.notEqual(first, otherSalt);
  assert.notEqual(first, otherSession);
  assert.equal(hashesEqual(first, again), true);
  assert.equal(hashesEqual(first, otherSalt), false);
  assert.equal(hashesEqual('abc', 'ab'), false);
});

test('parseMaintenanceStatus ignores junk and caps the reason', () => {
  const parsed = parseMaintenanceStatus({
    enabled: true,
    reason: 'x'.repeat(MAINTENANCE_REASON_MAX + 40),
    sessionId: 'abc',
    pinSalt: 'def',
    pinHash: 'ghi',
    updatedBy: 'uid-1',
  });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.reason.length, MAINTENANCE_REASON_MAX);
  assert.equal(parsed.sessionId, 'abc');
  assert.equal(parseMaintenanceStatus(null).enabled, false);
  assert.equal(parseMaintenanceStatus({ enabled: 'yes' }).enabled, false);
});

test('isSiteLocked: admins and PIN holders pass; everyone else is blocked while it is on or pending', () => {
  resetLockState();
  assert.equal(isSiteLocked(), false);

  state.maintenance.pending = true;
  assert.equal(isSiteLocked(), true, 'hold the public UI until status is known');
  state.isAdmin = true;
  assert.equal(isSiteLocked(), false, 'an admin is never locked out');

  resetLockState();
  state.maintenance.enabled = true;
  assert.equal(isSiteLocked(), true);
  state.maintenanceUnlocked = true;
  assert.equal(isSiteLocked(), false, 'a valid tester PIN unlocks this device');
  state.maintenanceUnlocked = false;
  state.isAdmin = true;
  assert.equal(isSiteLocked(), false);
  resetLockState();
});

test('the public maintenance page shows the reason, PIN pad and admin sign-in', () => {
  resetLockState();
  state.maintenance.enabled = true;
  state.maintenance.reason = 'Cabinets are getting new boards <script>';
  const html = renderMaintenancePage();
  assert.match(html, /under maintenance/i);
  assert.match(html, /will soon be available/i);
  assert.match(html, /Cabinets are getting new boards/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /data-form="maintenance-pin"/);
  assert.equal((html.match(/class="pin-cell"/g) || []).length, 4);
  assert.match(html, /data-action="open-auth"/);
  assert.match(html, /inputmode="numeric"/);
  resetLockState();
});

test('the pending gate does not ask for a PIN before status is known', () => {
  resetLockState();
  state.maintenance.pending = true;
  const html = renderMaintenancePage();
  assert.match(html, /Checking whether the arcade is open/);
  assert.doesNotMatch(html, /data-form="maintenance-pin"/);
  resetLockState();
});

test('the admin maintenance panel toggles, takes a reason and reveals a freshly minted PIN', () => {
  resetLockState();
  state.isAdmin = true;
  state.maintenance.enabled = true;
  state.maintenance.reason = 'Patching rooms';
  state.maintenancePlainPin = '1234567890123456';
  const html = renderAdminMaintenance();
  assert.match(html, /data-action="toggle-maintenance"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /1234 5678 9012 3456/);
  assert.match(html, /data-action="copy-maintenance-pin"/);
  assert.match(html, /data-action="regenerate-maintenance-pin"/);
  assert.match(html, /data-form="maintenance-reason"/);
  assert.match(html, /Patching rooms/);
  resetLockState();
});
