/**
 * The rules of maintenance mode, tested where they are written: `shared/online/maintenance.js` holds
 * the code format, the operator's wording limits, the document shapes the security rules accept, the
 * lock decision and the attempt throttle. It is dependency-free on purpose — the browser and Cloud
 * Functions both build on it — so these tests need no DOM, no Firebase and no emulator.
 *
 * What each test protects, in one line: a code that is typed on a phone, a page that cannot be made
 * to say something rude, a document that the security rules will actually accept, a pass that dies
 * when the code is rotated, an admin who can never lock themselves out, and a guesser who is slowed
 * down. The UI that sits on top of all this is covered in `tests/app-render.test.js`, and the rules
 * themselves in `tests/firestore-rules.test.js` / `tests/rules-emulator.test.js`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAINTENANCE_ACCESS_FIELDS,
  MAINTENANCE_COOLDOWN_MS,
  MAINTENANCE_DIGEST_FALLBACK,
  MAINTENANCE_DIGEST_SHA256,
  MAINTENANCE_MAX_ATTEMPTS,
  MAINTENANCE_PIN_DEFAULT_HOURS,
  MAINTENANCE_PIN_DIGITS,
  MAINTENANCE_REASON_LINES_MAX,
  MAINTENANCE_REASON_MAX,
  MAINTENANCE_STATUS_FIELDS,
  buildMaintenanceAccessUpdate,
  buildMaintenanceStatusUpdate,
  formatMaintenancePin,
  isMaintenanceLocked,
  isValidMaintenancePin,
  maintenanceAgeMs,
  maintenanceAttemptsLocked,
  maintenancePassIsValid,
  maintenancePinDigest,
  maintenancePinGroupHint,
  maintenancePinIsLive,
  maintenancePinLength,
  maintenancePinWindowMs,
  normalizeMaintenancePin,
  randomMaintenancePin,
  randomMaintenanceSalt,
  registerMaintenanceAttempt,
  safeMaintenanceReason,
} from '../shared/online/maintenance.js';

const HOUR_MS = 60 * 60 * 1000;

test('a code is sixteen digits, however it arrives', () => {
  const pin = '491733801256 9042'.replace(/\s/g, '');
  assert.equal(normalizeMaintenancePin(' 4917-3380 1256*9042 '), pin, 'spaces, dashes and paste junk are dropped');
  assert.equal(normalizeMaintenancePin(''), '', 'nothing typed is not a code');
  assert.equal(normalizeMaintenancePin(null), '', 'and a missing value is not a crash');
  assert.equal(maintenancePinLength('4917 3380'), 8, 'the tally counts digits, not keystrokes');

  assert.equal(isValidMaintenancePin(pin), true, 'exactly sixteen');
  assert.equal(isValidMaintenancePin(pin.slice(0, 15)), false, 'one short is not a code');
  // The count is taken before the box truncates, so a paste that drags extra digits along is refused
  // and explained rather than quietly shortened into a code nobody meant.
  assert.equal(maintenancePinLength(`${pin}9`), MAINTENANCE_PIN_DIGITS + 1);
  assert.equal(isValidMaintenancePin(`${pin}9`), false, 'one over is not a code either');
  assert.equal(normalizeMaintenancePin(`${pin}9`), pin, 'typing is still capped at what the field can hold');
  assert.equal(isValidMaintenancePin('abcdefghijklmnop'), false, 'and letters are not digits');
});

test('a code reads in groups of four, on paper and on screen', () => {
  const pin = '1234567890123456';
  assert.equal(formatMaintenancePin(pin), '1234 5678 9012 3456');
  assert.equal(formatMaintenancePin('1234 5678 9012 3456'), formatMaintenancePin(pin), 'reformatting is a no-op');
  assert.equal(formatMaintenancePin(pin, '-'), '1234-5678-9012-3456', 'a separator can be chosen');
  assert.equal(formatMaintenancePin('123').length, 3, 'a partial code is not padded');
  assert.equal(formatMaintenancePin(pin).length, MAINTENANCE_PIN_DIGITS + 3);
  assert.equal(maintenancePinGroupHint(), '16 digits in 4 groups of 4', 'the same sentence is used on both screens');
});

test('the operator can say what is happening, in a page that stays safe to paint', () => {
  const plain = safeMaintenanceReason('  Rooms are moving to a new backend.  \n\n\tBack within the hour. ');
  assert.equal(plain.ok, true);
  assert.equal(plain.reason, 'Rooms are moving to a new backend.\nBack within the hour.', 'blank lines collapse, runs of spaces tidy');

  assert.equal(safeMaintenanceReason('').reason, '', 'no reason is a legitimate reason');
  assert.equal(safeMaintenanceReason(undefined).ok, true);

  // The notice prints these words with no markup around them, so anything that could break out of a
  // text node or wreck the layout has to be gone before the document is written.
  const hostile = safeMaintenanceReason('down<script>alert(1)</script>\u0000\u0007 for an hour');
  // eslint-disable-next-line no-control-regex -- the point of the test is which control characters survive
  assert.equal(/[\u0000-\u0009\u000b-\u001f\u007f]/.test(hostile.reason), false, 'no control characters survive');
  assert.match(hostile.reason, /<script>/, 'the angle brackets are the app\'s problem to escape, not this one to rewrite');

  const rambling = safeMaintenanceReason(Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n'));
  assert.equal(rambling.reason.split('\n').length, MAINTENANCE_REASON_LINES_MAX, 'a wall of text becomes a few lines');
  assert.equal(rambling.ok, true, 'and that alone already fits a notice');
  // The line cap shortens the notice; the length cap refuses the write. Nobody is expected to notice
  // that half of what they typed is gone, so the studio gets an error instead of a surprise.
  const overflowing = safeMaintenanceReason(`${'x'.repeat(600)}\n${'y'.repeat(600)}`);
  assert.equal(overflowing.reason.split('\n').length, 2, 'lines are kept whole');
  assert.equal(overflowing.ok, false, 'and a reason that is still too long is refused');

  const exact = safeMaintenanceReason('x'.repeat(MAINTENANCE_REASON_MAX));
  assert.equal(exact.ok, true, 'the limit itself is allowed');
  const over = safeMaintenanceReason('x'.repeat(MAINTENANCE_REASON_MAX + 1));
  assert.equal(over.ok, false);
  assert.match(over.error, /500 characters/, 'the error names the limit');
});

test('a code is valid for the window the operator chose, and no longer', () => {
  assert.equal(maintenancePinWindowMs(1), HOUR_MS);
  assert.equal(maintenancePinWindowMs(72), 72 * HOUR_MS);
  assert.equal(maintenancePinWindowMs('24'), 24 * HOUR_MS, 'a select box hands over a string');
  assert.equal(maintenancePinWindowMs(9), MAINTENANCE_PIN_DEFAULT_HOURS * HOUR_MS, 'an unpicked duration falls back');
  assert.equal(maintenancePinWindowMs(undefined), MAINTENANCE_PIN_DEFAULT_HOURS * HOUR_MS);
  assert.equal(maintenancePinWindowMs(NaN), MAINTENANCE_PIN_DEFAULT_HOURS * HOUR_MS);

  const live = { enabled: true, pinHash: 'sha256:aa', pinExpiresAtMs: Date.now() + HOUR_MS };
  assert.equal(maintenancePinIsLive(live), true);
  assert.equal(maintenancePinIsLive({ ...live, pinExpiresAtMs: Date.now() - 1 }), false, 'expired is expired');
  assert.equal(maintenancePinIsLive({ ...live, pinHash: '' }), false, 'a window with no code has nothing to be live');
  assert.equal(maintenancePinIsLive(null), false, 'and no status document at all is not a crash');
});

test('a device pass is worth exactly what its code is worth', () => {
  const nowMs = 1_800_000_000_000;
  const status = { enabled: true, pinHash: 'sha256:aa', pinExpiresAtMs: nowMs + 6 * HOUR_MS };
  const pass = { digest: 'sha256:aa', expiresAtMs: nowMs + HOUR_MS };

  assert.equal(maintenancePassIsValid(pass, status, nowMs), true, 'right digest, both sides unexpired');
  assert.equal(maintenancePassIsValid({ ...pass, digest: 'sha256:bb' }, status, nowMs), false, 'a rotated code revokes every device');
  assert.equal(maintenancePassIsValid({ ...pass, expiresAtMs: nowMs - 1 }, status, nowMs), false, 'a pass that ran out');
  assert.equal(maintenancePassIsValid(pass, { ...status, pinExpiresAtMs: nowMs - 1 }, nowMs), false, 'or the code it came from');
  assert.equal(maintenancePassIsValid(pass, { ...status, enabled: false }, nowMs), false, 'and an open site has no passes');
  assert.equal(maintenancePassIsValid(null, status, nowMs), false);
  assert.equal(maintenancePassIsValid(pass, null, nowMs), false);
});

test('the notice is for everyone except the person who put it up', () => {
  const on = { enabled: true };
  assert.equal(isMaintenanceLocked(on, {}), true, 'a visitor, in the dark');
  assert.equal(isMaintenanceLocked(on, { passValid: true }), false, 'a device let in on a code');
  assert.equal(isMaintenanceLocked(on, { isAdmin: true }), false, 'the admin, always');
  assert.equal(isMaintenanceLocked(on, { isAdmin: true, passValid: true }), false, 'even with a pass of their own');
  assert.equal(isMaintenanceLocked({ enabled: true, preview: true }, { isAdmin: true }), true, 'until they ask to see it');
  assert.equal(isMaintenanceLocked({ enabled: false, preview: true }, { isAdmin: true }), false, 'previewing with no maintenance locks nobody');
  assert.equal(isMaintenanceLocked(null, {}), false, 'a site that has never reported a status is open');
});

test('six wrong codes cool a device down, and the cool-down passes', () => {
  const t0 = 1_800_000_000_000;
  let attempts = { count: 0, lockedUntilMs: 0 };
  for (let i = 1; i < MAINTENANCE_MAX_ATTEMPTS; i += 1) {
    attempts = registerMaintenanceAttempt(attempts, t0);
    assert.equal(maintenanceAttemptsLocked(attempts, t0), 0, `attempt ${i} is free`);
  }
  attempts = registerMaintenanceAttempt(attempts, t0);
  assert.equal(attempts.count, 0, 'the count resets with the lock, so a second round starts clean');
  assert.equal(attempts.lockedUntilMs, t0 + MAINTENANCE_COOLDOWN_MS);
  assert.equal(maintenanceAttemptsLocked(attempts, t0), MAINTENANCE_COOLDOWN_MS, 'locked for the whole cooldown');
  assert.equal(maintenanceAttemptsLocked(attempts, t0 + 60_000), MAINTENANCE_COOLDOWN_MS - 60_000, 'the wait counts down');
  assert.equal(maintenanceAttemptsLocked(attempts, t0 + MAINTENANCE_COOLDOWN_MS), 0, 'and it is over exactly when it said');
  assert.equal(maintenanceAttemptsLocked(null, t0), 0, 'no record, no lock');
});

test('the digest is salted, deterministic and honest about how it was made', async () => {
  const pin = '1234567890123456';
  const a = await maintenancePinDigest('a1b2c3d4e5f60718', pin);
  const b = await maintenancePinDigest('a1b2c3d4e5f60718', pin);
  assert.equal(a, b, 'the same code checked twice gives the same answer');
  assert.equal(await maintenancePinDigest('a1b2c3d4e5f60718', '1234 5678 9012 3456'), a, 'and formatting is not part of it');
  assert.notEqual(await maintenancePinDigest('a1b2c3d4e5f60718', '1234567890123457'), a);
  assert.notEqual(await maintenancePinDigest('ffffffffffffffff', pin), a, 'a new salt means a new stored value');
  assert.match(a, /^(sha256|fnv1a8):[0-9a-f]+$/, 'the algorithm travels with the value');
  const algorithm = a.split(':')[0];
  assert.ok([MAINTENANCE_DIGEST_SHA256, MAINTENANCE_DIGEST_FALLBACK].includes(algorithm));
  if (globalThis.crypto?.subtle) assert.equal(algorithm, MAINTENANCE_DIGEST_SHA256, 'in a secure context, SHA-256');
});

test('the digest still works where SubtleCrypto does not exist', async () => {
  // Plain http on a LAN is a real way to open this app, and there `crypto.subtle` is missing. The
  // fallback is weaker; it is not a password hash, it is a soft gate check, and it must at least agree
  // with itself — otherwise a tester\'s pass could be computed one way and compared another.
  const real = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: real?.getRandomValues?.bind(real) }, configurable: true });
    const weak = await maintenancePinDigest('aa', '1234567890123456');
    assert.match(weak, new RegExp(`^${MAINTENANCE_DIGEST_FALLBACK}:[0-9a-f]{64}$`));
    assert.equal(weak, await maintenancePinDigest('aa', '1234567890123456'));
    assert.notEqual(weak, await maintenancePinDigest('aa', '1234567890123457'));
    assert.notEqual(weak, await maintenancePinDigest('ab', '1234567890123456'));
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
  }
});

test('generated codes use every byte they are given and never the same one twice', () => {
  const sweep = new Uint8Array(256).map((_, i) => i);
  // Bytes 250-255 are thrown away so that no digit is likelier than another; the first 16 surviving
  // bytes are 0-15, so the answer is exact and the mapping is pinned.
  assert.equal(randomMaintenancePin(() => sweep), '0123456789012345');
  assert.equal(randomMaintenancePin(() => new Uint8Array(128).fill(255)), '0'.repeat(MAINTENANCE_PIN_DIGITS), 'a run of rejects pads, never truncates');
  assert.equal(randomMaintenancePin(() => new Uint8Array([9, 9, 9])).length, MAINTENANCE_PIN_DIGITS, 'however little entropy arrives');
  for (const value of [randomMaintenancePin(), randomMaintenancePin()]) {
    assert.match(value, /^[0-9]{16}$/, 'the code is sixteen digits and nothing else');
  }
  assert.notEqual(randomMaintenancePin(), randomMaintenancePin(), 'two mints do not agree');
  assert.equal(randomMaintenanceSalt(() => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7])), '0001020304050607');
  assert.match(randomMaintenanceSalt(), /^[0-9a-f]{16}$/, 'a salt is hex, so it survives any transport');
});

test('the two documents are built exactly as wide as the rules allow', () => {
  const nowMs = 1_800_000_000_000;
  const status = buildMaintenanceStatusUpdate({
    enabled: true,
    reason: 'Rooms are moving to a new backend.',
    pinDigest: 'sha256:aa',
    salt: 'a1b2c3d4e5f60718',
    pinExpiresAtMs: nowMs + 24 * HOUR_MS,
    pinSetAtMs: nowMs,
    uid: 'uid-admin',
    nowMs,
  });
  assert.deepEqual(Object.keys(status).sort(), [...MAINTENANCE_STATUS_FIELDS].sort(), 'no extra field, none missing');
  assert.equal(status.enabled, true);
  assert.equal(status.reason, 'Rooms are moving to a new backend.');
  assert.equal(status.pinHash, 'sha256:aa', 'the code itself is not here for a visitor to read');
  assert.equal(status.updatedAtMs, nowMs);
  assert.equal(status.updatedByUid, 'uid-admin');

  const closed = buildMaintenanceStatusUpdate({ enabled: false, reason: 'leftover words', pinDigest: '', uid: 'uid-admin', nowMs });
  assert.deepEqual(
    closed,
    { enabled: false, reason: '', updatedAtMs: nowMs, updatedByUid: 'uid-admin', pinHash: '', pinSalt: '', pinExpiresAtMs: 0, pinSetAtMs: 0 },
    'opening the site destroys the code and the message with it, so the next run starts clean',
  );

  const access = buildMaintenanceAccessUpdate({
    pin: '1234 5678 9012 3456',
    pinDigest: 'sha256:aa',
    salt: 'a1b2c3d4e5f60718',
    expiresAtMs: nowMs + 24 * HOUR_MS,
    hours: 24,
    uid: 'uid-admin',
    nowMs,
  });
  assert.deepEqual(Object.keys(access).sort(), [...MAINTENANCE_ACCESS_FIELDS].sort(), 'the admin-only document, same discipline');
  assert.equal(access.pin, '1234567890123456', 'stored so the studio can show it again after a reload');
  assert.equal(access.setAtMs, nowMs);
  assert.equal(buildMaintenanceAccessUpdate({ pin: '1', pinDigest: '', salt: '', expiresAtMs: 0, hours: 0, uid: '', nowMs }).hours, MAINTENANCE_PIN_DEFAULT_HOURS);
});

test('the age of a status is measured, never invented', () => {
  const nowMs = 1_800_000_000_000;
  assert.equal(maintenanceAgeMs(nowMs - 90_000, nowMs), 90_000);
  assert.equal(maintenanceAgeMs(nowMs + 10_000, nowMs), 0, 'a clock skew forward reads as just now');
  assert.equal(maintenanceAgeMs(undefined, nowMs), 0);
  assert.equal(maintenanceAgeMs('nope', nowMs), 0);
});

test('the limits that the UI promises are the limits the code enforces', () => {
  assert.equal(MAINTENANCE_PIN_DIGITS, 16, 'the brief: a temporary 16-digit PIN');
  assert.ok(MAINTENANCE_MAX_ATTEMPTS > 3, 'enough tries for fat fingers');
  assert.ok(MAINTENANCE_COOLDOWN_MS >= 60_000, 'long enough that guessing is boring');
  assert.ok(MAINTENANCE_REASON_MAX <= 1_000, 'a notice people actually read');
});
