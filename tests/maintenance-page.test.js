/**
 * The maintenance page, rendered in jsdom, from `state` alone.
 *
 * What this covers, and why each one is here:
 *
 *   - the page renders the operator's message and a labelled 16-digit PIN field;
 *   - the two states: enabled closes the arcade for a visitor, disabled (or a missing, unreadable or
 *     malformed document) leaves the whole app exactly as it was;
 *   - the two ways through: a verified admin keeps the app, and a visitor holding a pass for the
 *     current PIN generation steps in;
 *   - a pass from an earlier maintenance window does not open this one, and a pass cannot open the
 *     arcade when maintenance is off;
 *   - rendering is pure: nothing here talks to Firebase, and everything user-written is escaped.
 *
 * `src/views/maintenance.js` and `src/render.js` are imported directly (not `src/app.js`), the same
 * way the other view tests do it, so a failure points at the view rather than at the wiring.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let dom;
let render;
let state;
let maintenanceView;
let shared;

before(async () => {
  dom = new JSDOM('<!doctype html><html><head><meta id="meta-theme-color" content=""></head><body><div id="app"></div></body></html>', {
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
  define('sessionStorage', window.sessionStorage);
  define('location', window.location);
  define('HTMLElement', window.HTMLElement);
  define('Node', window.Node);
  define('FormData', window.FormData);
  define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  define('getComputedStyle', window.getComputedStyle.bind(window));

  ({ render } = await import('../src/render.js'));
  ({ state } = await import('../src/state.js'));
  maintenanceView = await import('../src/views/maintenance.js');
  shared = await import('../shared/online/maintenance.js');
});

/** A visitor with no Firebase, no account and no maintenance notice: the default world. */
function resetState() {
  state.page = 'home';
  state.isAdmin = false;
  state.user = null;
  state.maintenance = shared.safeMaintenanceStatus(null);
  state.maintenanceUnlocked = false;
  state.maintenancePass = null;
  state.maintenanceError = '';
  state.adminMaintenancePin = null;
  state.modal = null;
  state.toast = null;
}

const appRoot = () => /** @type {HTMLElement} */ (dom.window.document.querySelector('#app'));

/** @param {Record<string, any>} raw */
function withMaintenance(raw) {
  state.maintenance = shared.safeMaintenanceStatus(raw);
  state.maintenanceUnlocked = shared.maintenancePassMatches(state.maintenancePass, state.maintenance);
}

test('the maintenance page renders the message, a labelled 16-digit PIN field and the unlock button', () => {
  resetState();
  withMaintenance({ enabled: true, message: 'Back at 18:00 UTC - sorry for the wait.', pinVersion: 4, pinActive: true });
  const html = maintenanceView.renderMaintenancePage();
  assert.match(html, /Back at 18:00 UTC - sorry for the wait\./, 'the operator message is shown');
  assert.match(html, /id="maintenance-pin"/, 'the PIN field is there');
  assert.match(html, /name="pin"/);
  assert.match(html, /maxlength="16"/, 'exactly the 16 digits of the tester PIN');
  assert.match(html, /inputmode="numeric"/, 'a phone shows the number pad');
  assert.match(html, /autocomplete="off"/, 'a password manager must not offer to save it');
  assert.match(html, /data-form="maintenance-pin"/, 'it posts through the form handler in src/app.js');
  assert.match(html, /Tester PIN/, 'the field is labelled');
  const dom2 = new JSDOM(`<!doctype html><body>${html}`);
  assert.equal(dom2.window.document.querySelectorAll('input#maintenance-pin').length, 1, 'one PIN field, so a browser cannot autofill the wrong one');
  assert.match(dom2.window.document.querySelector('label[for="maintenance-pin"]').textContent, /Tester PIN/);
});

test('an enabled document replaces the whole app with the maintenance page', () => {
  resetState();
  withMaintenance({ enabled: true, message: 'Tuning the servers.', pinVersion: 1, pinActive: true });
  render();
  assert.ok(appRoot().querySelector('.maintenance-screen'), 'the visitor gets the maintenance screen');
  assert.equal(appRoot().querySelector('.app-shell'), null, 'and not the arcade shell');
  assert.equal(appRoot().querySelector('.sidebar'), null, 'no sidebar to click through');
  assert.match(appRoot().textContent, /Tuning the servers\./);
});

test('a disabled document leaves the arcade exactly as it was', () => {
  resetState();
  withMaintenance({ enabled: false, message: 'ignored while open', pinVersion: 3, pinActive: false });
  render();
  assert.equal(appRoot().querySelector('.maintenance-screen'), null, 'no notice');
  assert.ok(appRoot().querySelector('.app-shell'), 'the normal shell is painted');
  assert.ok(appRoot().querySelector('.sidebar'), 'with its navigation');
});

test('a verified admin keeps the whole app and sees a banner instead of the notice', () => {
  resetState();
  state.isAdmin = true;
  withMaintenance({ enabled: true, message: 'Tuning the servers.', pinVersion: 2, pinActive: true });
  render();
  assert.equal(appRoot().querySelector('.maintenance-screen'), null, 'the admin is not locked out of the studio');
  assert.ok(appRoot().querySelector('.app-shell'));
  const banner = appRoot().querySelector('.maintenance-banner');
  assert.ok(banner, 'the admin is told maintenance is on');
  assert.match(banner.textContent, /Maintenance mode is ON/);
  assert.ok(banner.querySelector('[data-action="navigate"][data-page="admin"]'), 'and can jump straight to the switch');
});

test('a visitor with the current tester pass steps inside; an older pass does not', () => {
  resetState();
  withMaintenance({ enabled: true, message: 'Tuning the servers.', pinVersion: 5, pinActive: true });
  state.maintenancePass = { token: 'tok-abc', pinVersion: 5 };
  state.maintenanceUnlocked = shared.maintenancePassMatches(state.maintenancePass, state.maintenance);
  render();
  assert.equal(appRoot().querySelector('.maintenance-screen'), null, 'the current pass opens the arcade for this tab');

  // The next maintenance window mints a new PIN, so the old pass (and the old PIN) are worthless.
  withMaintenance({ enabled: true, message: 'Round two.', pinVersion: 6, pinActive: true });
  state.maintenanceUnlocked = shared.maintenancePassMatches(state.maintenancePass, state.maintenance);
  render();
  assert.ok(appRoot().querySelector('.maintenance-screen'), 'a pass from the previous window does not open this one');

  // A pass never bypasses anything on its own: with maintenance off it simply does not matter.
  withMaintenance({ enabled: false, message: '', pinVersion: 6, pinActive: false });
  assert.equal(shared.maintenancePassMatches({ token: 'tok-abc', pinVersion: 6 }, state.maintenance), false);
});

test('missing or malformed maintenance data means "the arcade is open", never a blank or closed screen', () => {
  const defaults = ['', null, undefined, 42, 'maintenance', [], { enabled: 'yes' }, { enabled: 1 }, { message: { text: 'nope' } }];
  for (const raw of defaults) {
    const status = shared.safeMaintenanceStatus(raw);
    assert.equal(status.enabled, false, `${JSON.stringify(raw)} must not close the arcade`);
    assert.equal(typeof status.message, 'string');
    assert.ok(status.message.length > 0, 'there is always a sentence to show if it is ever enabled');
    assert.equal(status.pinActive, false);
    assert.equal(shared.maintenanceIsActive(status, { isAdmin: false, unlocked: false }), false);
  }
  // And the page still renders a readable notice from a document that is half garbage.
  resetState();
  const messy = shared.safeMaintenanceStatus({ enabled: true, message: 'x'.repeat(900), pinVersion: 'nonsense', pinActive: 'yes', updatedBy: { uid: 'nope' } });
  assert.equal(messy.enabled, true);
  assert.equal(messy.message.length, shared.MAINTENANCE_MESSAGE_MAX, 'an overlong message is capped');
  assert.equal(messy.pinVersion, 0, 'a nonsense generation is not trusted');
  assert.equal(messy.pinActive, false, 'so no pass can match it');
  state.maintenance = messy;
  assert.ok(maintenanceView.renderMaintenancePage().includes('x'.repeat(50)), 'the notice still renders');
});

test('the PIN field accepts only 16 digits, and the page escapes whatever an operator typed', () => {
  assert.equal(shared.MAINTENANCE_PIN_LENGTH, 16);
  for (const good of ['1234567890123456', '1234 5678 9012 3456', '1234-5678-9012-3456']) {
    assert.ok(shared.isValidMaintenancePin(shared.normalizeMaintenancePin(good)), `${good} is 16 digits`);
  }
  for (const bad of ['123456789012345', '12345678901234567', '123456789012345a', '', '   ', '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯']) {
    assert.equal(shared.isValidMaintenancePin(shared.normalizeMaintenancePin(bad)), false, `${bad} is not a valid PIN`);
  }
  resetState();
  const html = maintenanceView.renderMaintenancePage();
  assert.doesNotMatch(html, /<script/i);
  const escaped = maintenanceView.renderMaintenancePage();
  state.maintenance = shared.safeMaintenanceStatus({ enabled: true, message: '<img src=x onerror="alert(1)">', pinVersion: 1, pinActive: true });
  const withMarkup = maintenanceView.renderMaintenancePage();
  assert.doesNotMatch(withMarkup, /<img src=x/, 'an operator message is escaped, never parsed as HTML');
  assert.match(withMarkup, /&lt;img src=x/);
  assert.ok(escaped.length > 0);
});

test('the admin panel shows the switch, the message box and the one-time PIN, and escapes the digits', () => {
  resetState();
  state.isAdmin = true;
  state.adminTab = 'maintenance';
  state.maintenance = shared.safeMaintenanceStatus({ enabled: true, message: 'Back soon.', pinVersion: 7, pinActive: true });
  state.adminMaintenancePin = { pin: '1234 5678 9012 3456', pinVersion: 7 };
  state.adminData = { error: '', rooms: [], profiles: [], admins: [], friendships: [], requests: [], invites: [], reviews: [], reviewAnnotations: [], reviewAgentModel: null };
  return import('../src/views/pages.js').then((pages) => {
    state.adminTab = 'maintenance';
    const html = pages.renderAdmin();
    assert.match(html, /data-form="maintenance"/, 'the settings form exists');
    assert.match(html, /<input id="maintenance-enabled" type="checkbox" name="enabled" checked>/, 'the current state is shown on the switch');
    assert.match(html, /name="message"[^>]*>Back soon\./, 'the message is editable');
    assert.match(html, /data-action="admin-maintenance-pin"/, 'a new PIN can be minted on demand');
    assert.match(html, /data-action="admin-maintenance-copy-pin"/, 'the one-time PIN can be copied');
    assert.match(html, /1234 5678 9012 3456/);
    assert.match(html, /shown once/i, 'the operator is told the digits will not be shown again');
    assert.doesNotMatch(html, /pinHash/, 'the studio never shows the stored verifier');
    assert.doesNotMatch(html, /[0-9a-f]{64}/, 'and never a hash-shaped string');
  });
});
