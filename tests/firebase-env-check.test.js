import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFirebaseBuildEnv, firebaseEnvCheckPlugin } from '../scripts/firebase-env-check.js';

const VALID = {
  apiKey: 'test-api-key-123',
  authDomain: 'psd-arcade-test.firebaseapp.com',
  projectId: 'psd-arcade-test',
  storageBucket: 'psd-arcade-test.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:0a1b2c3d4e5f',
};
const validLine = JSON.stringify(VALID);
const PEM_HEADER = `-----BEGIN ${'PRIVATE'} KEY-----`;
const text = (result) => result.lines.join('\n');

test('a Vercel build without the variable warns loudly but does not fail by default', () => {
  const result = checkFirebaseBuildEnv({ VERCEL: '1', VERCEL_ENV: 'production' });
  assert.equal(result.level, 'warn');
  assert.equal(result.fatal, false);
  assert.match(text(result), /Firebase config \(VITE_FIREBASE_\* variables\) is not set for this Vercel production/);
  assert.match(text(result), /Local practice mode/);
  assert.match(text(result), /Environment Variables/);
  assert.match(text(result), /redeploy/);
  assert.match(text(result), /REQUIRE_FIREBASE_CONFIG=1/);
});

test('a Preview build reminds you that the variable must be enabled for Preview too', () => {
  const result = checkFirebaseBuildEnv({ VERCEL: '1', VERCEL_ENV: 'preview' });
  assert.match(text(result), /Vercel preview/);
  assert.match(text(result), /Preview environment/);
});

test('a local build points at .env.local as well', () => {
  assert.match(text(checkFirebaseBuildEnv({})), /\.env\.local/);
  assert.doesNotMatch(text(checkFirebaseBuildEnv({ VERCEL: '1', VERCEL_ENV: 'production' })), /own machine/);
});

test('a misnamed variable is pointed out by name only (never by value)', () => {
  const result = checkFirebaseBuildEnv({
    VERCEL: '1',
    VERCEL_ENV: 'production',
    FIREBASE_CONFIG: '{"apiKey":"SENTINEL-1"}',
    vite_firebase_config: 'SENTINEL-2',
    FIREBASE_API_KEY: 'SENTINEL-3',
    UNRELATED: 'SENTINEL-4',
  });
  assert.equal(result.level, 'warn');
  assert.match(text(result), /Found other Firebase-looking variable name\(s\): FIREBASE_API_KEY, FIREBASE_CONFIG, vite_firebase_config\./);
  assert.match(text(result), /VITE_ prefix/);
  assert.doesNotMatch(text(result), /SENTINEL|UNRELATED/);
  // no noise when nothing looks misnamed, or when the real variable is present
  assert.doesNotMatch(text(checkFirebaseBuildEnv({ VERCEL: '1' })), /Firebase-looking/);
  assert.doesNotMatch(text(checkFirebaseBuildEnv({ FIREBASE_CONFIG: 'x', VITE_FIREBASE_CONFIG: validLine })), /Firebase-looking/);
});

test('a valid config is acknowledged with its public identifiers only', () => {
  const result = checkFirebaseBuildEnv({ VITE_FIREBASE_CONFIG: validLine, VERCEL: '1', VERCEL_ENV: 'production' });
  assert.equal(result.level, 'ok');
  assert.equal(result.fatal, false);
  assert.match(text(result), /psd-arcade-test/);
  assert.match(text(result), /psd-arcade-test\.firebaseapp\.com/);
  assert.doesNotMatch(text(result), /test-api-key-123/);
});

test('an invalid config warns with the specific reason', () => {
  const result = checkFirebaseBuildEnv({ VITE_FIREBASE_CONFIG: `'${validLine}'`, VERCEL: '1', VERCEL_ENV: 'production' });
  assert.equal(result.level, 'warn');
  assert.equal(result.fatal, false);
  assert.match(text(result), /invalid for this Vercel production: .*extra quotes/);
  assert.doesNotMatch(text(result), /test-api-key-123/);
});

test('REQUIRE_FIREBASE_CONFIG turns a missing or invalid config into a build error', () => {
  for (const flag of ['1', 'true', 'TRUE', 'yes', 'on', ' 1 ']) {
    const missing = checkFirebaseBuildEnv({ REQUIRE_FIREBASE_CONFIG: flag });
    assert.equal(missing.level, 'error', flag);
    assert.equal(missing.fatal, true, flag);
    assert.match(missing.errorMessage, /is not set.*REQUIRE_FIREBASE_CONFIG is set, so the build is stopped/, flag);
    const invalid = checkFirebaseBuildEnv({ REQUIRE_FIREBASE_CONFIG: flag, VITE_FIREBASE_CONFIG: 'nope' });
    assert.equal(invalid.fatal, true, flag);
  }
  for (const flag of ['0', 'false', 'no', '', undefined]) {
    assert.equal(checkFirebaseBuildEnv({ REQUIRE_FIREBASE_CONFIG: flag }).fatal, false, String(flag));
  }
  const fine = checkFirebaseBuildEnv({ REQUIRE_FIREBASE_CONFIG: '1', VITE_FIREBASE_CONFIG: validLine });
  assert.equal(fine.level, 'ok');
  assert.equal(fine.fatal, false);
});

test('a secret in the variable always stops the build and is never printed', () => {
  const raw = JSON.stringify({ type: 'service_account', private_key: `${PEM_HEADER}\nSENTINEL\n`, client_email: 'a@b.iam.gserviceaccount.com' });
  for (const env of [{ VITE_FIREBASE_CONFIG: raw }, { VITE_FIREBASE_CONFIG: raw, REQUIRE_FIREBASE_CONFIG: '0' }]) {
    const result = checkFirebaseBuildEnv(env);
    assert.equal(result.level, 'error');
    assert.equal(result.fatal, true);
    assert.match(text(result), /Refusing to build/);
    assert.match(text(result), /public browser bundle/);
    assert.doesNotMatch(text(result), /SENTINEL|BEGIN|iam\.gserviceaccount/);
    assert.match(result.errorMessage, /^Refusing to build/);
    assert.doesNotMatch(result.errorMessage, /SENTINEL|BEGIN|iam\.gserviceaccount/);
  }
});

test('the dev server variant points at .env.local and skips the build-only tip', () => {
  const result = checkFirebaseBuildEnv({}, { command: 'serve' });
  assert.equal(result.level, 'warn');
  assert.match(text(result), /local dev server/);
  assert.match(text(result), /\.env\.local/);
  assert.doesNotMatch(text(result), /Tip:/);
});

function runPlugin({ dir, command = 'build', mode = 'production' }) {
  const logs = [];
  const logger = { info: (m) => logs.push(['info', m]), warn: (m) => logs.push(['warn', m]), error: (m) => logs.push(['error', m]) };
  const plugin = firebaseEnvCheckPlugin();
  plugin.configResolved({ mode, command, root: dir, envDir: dir, logger });
  let thrown = null;
  try {
    plugin.buildStart.call({ error: (message) => { throw new Error(message); } });
  } catch (error) {
    thrown = error;
  }
  return { logs, thrown, plugin };
}

test('the Vite plugin reads .env.local exactly as documented in the README, and lets real env vars win', () => {
  const dir = mkdtempSync(join(tmpdir(), 'psd-env-'));
  const saved = { config: process.env.VITE_FIREBASE_CONFIG, require: process.env.REQUIRE_FIREBASE_CONFIG };
  delete process.env.VITE_FIREBASE_CONFIG;
  delete process.env.REQUIRE_FIREBASE_CONFIG;
  try {
    // 1) nothing anywhere -> warning, build continues
    let run = runPlugin({ dir });
    assert.equal(run.thrown, null);
    assert.equal(run.logs[0][0], 'warn');
    assert.match(run.logs[0][1], /^\[psd-gaming\] ⚠ The Firebase config \(VITE_FIREBASE_\* variables\) is not set/);

    // 2) the README's .env.local example: unquoted one-line JSON
    writeFileSync(join(dir, '.env.local'), `VITE_FIREBASE_CONFIG=${validLine}\n`);
    run = runPlugin({ dir });
    assert.equal(run.thrown, null);
    assert.equal(run.logs[0][0], 'info');
    assert.match(run.logs[0][1], /✔ VITE_FIREBASE_CONFIG is set.*psd-arcade-test/);

    // 3) a real environment variable (what Vercel provides) takes priority over the file
    process.env.VITE_FIREBASE_CONFIG = `'${validLine}'`;
    run = runPlugin({ dir });
    assert.equal(run.logs[0][0], 'warn');
    assert.match(run.logs.map(([, m]) => m).join('\n'), /extra quotes/);

    // 4) strict mode turns that into a failed build
    process.env.REQUIRE_FIREBASE_CONFIG = '1';
    run = runPlugin({ dir });
    assert.ok(run.thrown, 'build must fail');
    assert.match(run.thrown.message, /VITE_FIREBASE_CONFIG is invalid.*REQUIRE_FIREBASE_CONFIG is set, so the build is stopped/);

    // 5) a secret fails the build even in dev
    process.env.VITE_FIREBASE_CONFIG = JSON.stringify({ ...VALID, client_secret: 'SENTINEL' });
    delete process.env.REQUIRE_FIREBASE_CONFIG;
    run = runPlugin({ dir, command: 'serve', mode: 'development' });
    assert.ok(run.thrown);
    assert.doesNotMatch(run.thrown.message, /SENTINEL/);
  } finally {
    for (const [key, value] of [['VITE_FIREBASE_CONFIG', saved.config], ['REQUIRE_FIREBASE_CONFIG', saved.require]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test('separate VITE_FIREBASE_* variables are acknowledged, and a partial set is reported by variable name', () => {
  const vars = {
    VITE_FIREBASE_API_KEY: VALID.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: VALID.authDomain,
    VITE_FIREBASE_PROJECT_ID: VALID.projectId,
    VITE_FIREBASE_APP_ID: VALID.appId,
  };
  const ok = checkFirebaseBuildEnv({ ...vars, VERCEL: '1', VERCEL_ENV: 'production' });
  assert.equal(ok.level, 'ok');
  assert.match(text(ok), /VITE_FIREBASE_\* variables are set for this Vercel production.*psd-arcade-test/);
  assert.doesNotMatch(text(ok), /test-api-key-123/);
  assert.doesNotMatch(text(ok), /Firebase-looking/);

  const { VITE_FIREBASE_APP_ID, ...partial } = vars;
  const bad = checkFirebaseBuildEnv({ ...partial, VERCEL: '1', VERCEL_ENV: 'production' });
  assert.equal(bad.level, 'warn');
  assert.match(text(bad), /invalid for this Vercel production: Missing required Firebase variable\(s\): VITE_FIREBASE_APP_ID/);
  assert.equal(checkFirebaseBuildEnv({ ...partial, REQUIRE_FIREBASE_CONFIG: '1' }).fatal, true);

  const secret = checkFirebaseBuildEnv({ ...vars, VITE_FIREBASE_API_KEY: `${PEM_HEADER}\nSENTINEL` });
  assert.equal(secret.fatal, true);
  assert.doesNotMatch(text(secret), /SENTINEL|BEGIN/);
});
