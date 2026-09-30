import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTION_LABELS, describeConnection } from '../src/connection-status.js';
import { parseFirebaseConfig } from '../src/firebase-config.js';

const READY = { status: 'ok', code: 'ok', message: '', hint: '', projectId: 'psd-arcade-test', authDomain: 'psd-arcade-test.firebaseapp.com' };
const MISSING = parseFirebaseConfig(undefined);
const INVALID = parseFirebaseConfig('{"apiKey":"test-api-key"}');
const INIT_FAILED = { status: 'invalid', code: 'init-failed', message: 'Firebase could not start with the config in VITE_FIREBASE_CONFIG (auth/invalid-api-key).', hint: 'Fix it.' };

test('the three labels are exactly the ones the UI must show', () => {
  assert.deepEqual({ ...CONNECTION_LABELS }, {
    online: 'Online rooms ready',
    offline: 'Offline · local play',
    local: 'Local practice mode',
  });
});

test('"Online rooms ready" requires Firebase to be initialized AND the browser to be online', () => {
  const view = describeConnection({ setup: READY, online: true });
  assert.equal(view.kind, 'online');
  assert.equal(view.label, 'Online rooms ready');
  assert.equal(view.shortLabel, 'ONLINE');
  assert.equal(view.tone, 'ok');
  assert.equal(view.onlineFeatures, true);
  assert.equal(view.setupNeeded, false);
});

test('configured but offline shows "Offline · local play" and turns online features off', () => {
  const view = describeConnection({ setup: READY, online: false });
  assert.equal(view.kind, 'offline');
  assert.equal(view.label, 'Offline · local play');
  assert.equal(view.tone, 'warn');
  assert.equal(view.onlineFeatures, false);
  assert.equal(view.setupNeeded, false, 'offline is not a setup problem');
  assert.match(view.detail, /offline/i);
});

test('a missing config shows "Local practice mode" with the deployment message, online or not', () => {
  for (const online of [true, false]) {
    const view = describeConnection({ setup: MISSING, online });
    assert.equal(view.kind, 'local', `online=${online}`);
    assert.equal(view.label, 'Local practice mode');
    assert.equal(view.shortLabel, 'LOCAL');
    assert.equal(view.tone, 'setup');
    assert.equal(view.onlineFeatures, false);
    assert.equal(view.setupNeeded, true);
    assert.equal(view.detail, 'Firebase config is missing from this deployment. Add VITE_FIREBASE_CONFIG in Vercel and redeploy.');
    assert.match(view.hint, /redeploy/);
  }
});

test('an invalid config or a failed initialization also shows "Local practice mode", with the specific reason', () => {
  const invalid = describeConnection({ setup: INVALID, online: true });
  assert.equal(invalid.label, 'Local practice mode');
  assert.match(invalid.detail, /missing required field\(s\): authDomain, projectId, appId/);
  const failed = describeConnection({ setup: INIT_FAILED, online: true });
  assert.equal(failed.label, 'Local practice mode');
  assert.match(failed.detail, /auth\/invalid-api-key/);
  assert.equal(failed.setupNeeded, true);
});

test('never claims to be online unless both facts are true (exhaustive)', () => {
  const setups = { ok: READY, missing: MISSING, invalid: INVALID, failed: INIT_FAILED, none: undefined };
  for (const [name, setup] of Object.entries(setups)) {
    for (const online of [true, false]) {
      const view = describeConnection({ setup, online });
      const expectOnline = name === 'ok' && online === true;
      assert.equal(view.label === 'Online rooms ready', expectOnline, `${name}/online=${online}`);
      assert.equal(view.onlineFeatures, expectOnline, `${name}/online=${online}`);
      assert.equal(view.kind === 'online', expectOnline, `${name}/online=${online}`);
    }
  }
});

test('with no information at all it falls back to the setup message instead of pretending to be online', () => {
  for (const view of [describeConnection(), describeConnection({})]) {
    assert.equal(view.kind, 'local');
    assert.match(view.detail, /Firebase config is missing from this deployment/);
  }
});
