import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMULATOR_DEFAULTS,
  EMULATOR_ENV_NAMES,
  EMULATOR_ENV_VARS,
  describeEmulatorConfig,
  resolveEmulatorConfig,
} from '../src/emulator.js';

const ON = { [EMULATOR_ENV_VARS.enabled]: '1' };

test('the emulator is off unless the flag explicitly asks for it', () => {
  for (const value of [undefined, '', '0', 'false', 'no', 'off', 'TRUE-ish']) {
    const config = resolveEmulatorConfig({ [EMULATOR_ENV_VARS.enabled]: value }, { dev: true });
    assert.equal(config.enabled, false, `a value of ${String(value)} keeps the emulator off`);
    assert.equal(config.reason, 'off');
  }
  for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
    const config = resolveEmulatorConfig({ [EMULATOR_ENV_VARS.enabled]: value }, { dev: true });
    assert.equal(config.enabled, true, `a value of ${String(value)} turns the emulator on`);
  }
});

test('the flag is ignored in a production build, so a deploy can never point at localhost', () => {
  const config = resolveEmulatorConfig(ON, { dev: false });
  assert.equal(config.enabled, false);
  assert.equal(config.reason, 'production-build');
  assert.match(describeEmulatorConfig(config), /not a dev build/i);
});

test('the default target is the standard emulator suite on this machine', () => {
  const config = resolveEmulatorConfig(ON, { dev: true });
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.firestorePort, 8080);
  assert.equal(config.authPort, 9099);
  assert.equal(config.authUrl, 'http://127.0.0.1:9099');
});

test('host and ports can be overridden, and bad ones fall back to the defaults', () => {
  const config = resolveEmulatorConfig({
    ...ON,
    [EMULATOR_ENV_VARS.host]: '192.168.0.10',
    [EMULATOR_ENV_VARS.firestorePort]: '9000',
    [EMULATOR_ENV_VARS.authPort]: '9098',
  }, { dev: true });
  assert.equal(config.host, '192.168.0.10');
  assert.equal(config.firestorePort, 9000);
  assert.equal(config.authPort, 9098);
  assert.equal(config.authUrl, 'http://192.168.0.10:9098');

  const junk = resolveEmulatorConfig({
    ...ON,
    [EMULATOR_ENV_VARS.host]: '   ',
    [EMULATOR_ENV_VARS.firestorePort]: 'not-a-port',
    [EMULATOR_ENV_VARS.authPort]: '99999',
  }, { dev: true });
  assert.deepEqual(
    { host: junk.host, firestorePort: junk.firestorePort, authPort: junk.authPort },
    EMULATOR_DEFAULTS,
    'unusable values never produce a broken URL',
  );
});

test('the description only ever prints the target, never a credential', () => {
  assert.match(describeEmulatorConfig(resolveEmulatorConfig(ON, { dev: true })), /127\.0\.0\.1:8080/);
  assert.match(describeEmulatorConfig(resolveEmulatorConfig({}, { dev: true })), /emulators are off/i);
});

test('every emulator variable is a VITE_ variable, so the client build can see it', () => {
  for (const name of EMULATOR_ENV_NAMES) {
    assert.match(name, /^VITE_/, `${name} is embedded at build time`);
    assert.ok(!/SECRET|KEY|TOKEN/.test(name), `${name} must not look like it carries a secret`);
  }
  assert.equal(EMULATOR_ENV_NAMES.length, 4);
});
