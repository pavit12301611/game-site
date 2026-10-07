/**
 * Maintenance mode's security properties, on the in-memory store (no emulator, no JVM, no network).
 *
 * The promises under test:
 *
 *   - only a verified administrator can close the arcade, edit the public message or mint a PIN, and
 *     the refusal is the same for a signed-out visitor and for an ordinary player;
 *   - the public document never contains the PIN, and the document that does hold it (a salted hash)
 *     is written and kept by the backend alone;
 *   - every new maintenance window mints a new PIN, and the old one stops working immediately;
 *   - a wrong PIN is refused without leaking how close it was, and the attempts are rate limited,
 *     because whoever is typing has not signed in and so is not covered by a per-user limit;
 *   - the PIN only works while maintenance is on, and never for anything else;
 *   - a missing or malformed status document cannot close the arcade and cannot unlock anything.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GAMES } from '../../shared/games.js';
import {
  MAINTENANCE_DEFAULT_MESSAGE,
  MAINTENANCE_MESSAGE_MAX,
  MAINTENANCE_PIN_LENGTH,
  safeMaintenanceStatus,
} from '../../shared/online/maintenance.js';
import { RATE_LIMITS } from '../../shared/online/policy.js';
import * as engineRegistry from '../../src/engines/index.js';
import {
  generateMaintenancePin,
  hashMaintenancePin,
  verifyMaintenancePin,
} from '../src/maintenance.js';
import { createHandlers, PolicyError } from '../src/handlers.js';
import { createFakeStore } from './fake-store.js';

const NOW = 1_700_000_000_000;
const ADMIN = 'uid-admin';
const PLAYER = 'uid-player';

const gameById = (gameId) => GAMES.find((game) => game.id === gameId) ?? null;

/** A running backend on top of the in-memory store, with one admin already flagged. */
function backend({ admin = true } = {}) {
  const clock = { nowMs: NOW };
  const store = createFakeStore({ now: () => clock.nowMs });
  let ids = 0;
  const deps = {
    store,
    games: GAMES,
    engines: { createInitialGameState: engineRegistry.createInitialGameState, applyGameAction: engineRegistry.applyGameAction, gameById },
    onlineBankFor: () => [],
    randomId: (length = 20) => `${(ids += 1).toString(36).padStart(6, '0')}${'b'.repeat(32)}`.slice(0, length),
    timestampMs: clock.nowMs,
  };
  if (admin) store.seed(`admins/${ADMIN}`, { admin: true });
  const handlers = createHandlers(deps);
  return {
    handlers,
    store,
    dump: () => store.dump(),
    status: () => safeMaintenanceStatus(store.dump()['maintenance/status'] ?? null),
    gate: () => store.dump()['maintenanceGate/active'] ?? null,
    advance: (ms) => { clock.nowMs += ms; deps.timestampMs = clock.nowMs; },
  };
}

/** The one assertion every refusal test makes, so the shape of a refusal stays identical. */
async function refuses(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof PolicyError, `expected a PolicyError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  });
}

// ── Who may change anything ────────────────────────────────────────────────────────────────────

test('only a verified admin may enable maintenance, edit the message or mint a PIN', async () => {
  const { handlers, status, dump } = backend();
  await refuses(handlers.adminSetMaintenance({ enabled: true, message: 'down' }, { uid: '' }), 'unauthenticated');
  await refuses(handlers.adminSetMaintenance({ enabled: true, message: 'down' }, { uid: PLAYER }), 'admin-only');
  await refuses(handlers.adminSetMaintenance({ enabled: false, rotatePin: true }, { uid: PLAYER }), 'admin-only');
  assert.equal(status().enabled, false, 'nothing was written by a refused call');
  assert.equal(Object.hasOwn(dump(), 'maintenanceGate/active'), false, 'and no PIN was minted');

  const result = await handlers.adminSetMaintenance({ enabled: true, message: 'Down for a tune-up.' }, { uid: ADMIN });
  assert.equal(result.enabled, true);
  assert.equal(result.message, 'Down for a tune-up.');
  assert.equal(status().enabled, true, 'the public document now says so');
});

test('the public document carries no PIN and no hash, and the hash lives where no client can read it', async () => {
  const { handlers, dump, gate } = backend();
  const result = await handlers.adminSetMaintenance({ enabled: true, message: 'Back soon.' }, { uid: ADMIN });
  const publicDocument = dump()['maintenance/status'];
  assert.deepEqual(Object.keys(publicDocument).sort(), ['enabled', 'message', 'pinActive', 'pinVersion', 'schema', 'updatedAtMs', 'updatedBy'].sort());
  assert.equal(JSON.stringify(publicDocument).includes(result.pin), false, 'the digits are not in the public document');
  assert.equal(JSON.stringify(publicDocument).toLowerCase().includes('hash'), false);
  const stored = gate();
  assert.equal(typeof stored.pinHash, 'string');
  assert.match(stored.pinHash, /^[0-9a-f]{64}$/, 'a SHA-256 hash, not the PIN');
  assert.equal(JSON.stringify(stored).includes(result.pin), false, 'and the digits are not in the gate document either');
  assert.ok(stored.salt, 'the hash is salted, so the same PIN does not hash the same across windows');
});

test('the PIN is a fresh 16-digit secret, and the previous one stops working the moment it is replaced', async () => {
  const { handlers } = backend();
  const first = await handlers.adminSetMaintenance({ enabled: true, message: 'Window one.' }, { uid: ADMIN });
  assert.match(first.pin, new RegExp(`^\\d{${MAINTENANCE_PIN_LENGTH}}$`), 'exactly 16 digits');
  assert.equal(first.pinActive, true);
  assert.equal(first.pinVersion, 1);

  // The same window, re-saved: the PIN a tester already has keeps working, unless a rotation is asked for.
  const again = await handlers.adminSetMaintenance({ enabled: true, message: 'Window one, edited.' }, { uid: ADMIN });
  assert.equal(again.pin, '', 'no new PIN for a message edit');
  assert.equal(again.pinVersion, 1);
  const redeemed = await handlers.redeemMaintenancePin({ pin: first.pin });
  assert.equal(redeemed.unlocked, true);

  // A new maintenance window: a new PIN, a new generation, and the old one is refused.
  const off = await handlers.adminSetMaintenance({ enabled: false, message: 'Open again.' }, { uid: ADMIN });
  assert.equal(off.pinActive, false, 'the PIN is retired when the arcade reopens');
  const second = await handlers.adminSetMaintenance({ enabled: true, message: 'Window two.' }, { uid: ADMIN });
  assert.match(second.pin, new RegExp(`^\\d{${MAINTENANCE_PIN_LENGTH}}$`));
  assert.notEqual(second.pin, first.pin, 'a new window is a new PIN');
  assert.equal(second.pinVersion, 2);
  await refuses(handlers.redeemMaintenancePin({ pin: first.pin }), 'invalid-pin');
  const secondRedeem = await handlers.redeemMaintenancePin({ pin: second.pin });
  assert.equal(secondRedeem.unlocked, true);
  assert.equal(secondRedeem.pinVersion, 2, 'the pass belongs to the generation that is live');

  // An explicit rotation while the window stays open.
  const rotated = await handlers.adminSetMaintenance({ enabled: true, rotatePin: true, message: 'Window two.' }, { uid: ADMIN });
  assert.notEqual(rotated.pin, second.pin);
  assert.equal(rotated.pinVersion, 3);
  await refuses(handlers.redeemMaintenancePin({ pin: second.pin }), 'invalid-pin');
});

test('a wrong, mistyped or missing PIN never unlocks anything', async () => {
  const { handlers } = backend();
  const { pin } = await handlers.adminSetMaintenance({ enabled: true, message: 'Down.' }, { uid: ADMIN });

  await refuses(handlers.redeemMaintenancePin({ pin: pin.slice(0, 15) }), 'invalid-pin');
  await refuses(handlers.redeemMaintenancePin({ pin: `${pin.slice(0, 15)}${(Number(pin[15]) + 1) % 10}` }), 'invalid-pin', 'one digit off');
  await refuses(handlers.redeemMaintenancePin({ pin: '' }), 'invalid-pin');
  await refuses(handlers.redeemMaintenancePin({}), 'invalid-pin');
  await refuses(handlers.redeemMaintenancePin({ pin: { $ne: pin } }), 'invalid-pin', 'a query object is not a PIN');
  await refuses(handlers.redeemMaintenancePin({ pin: 'AAAA-BBBB-CCCC-DDDD' }), 'invalid-pin');
  // Whitespace and dashes are a human reading 16 digits out loud, so they are normalised away.
  const spaced = `${pin.slice(0, 4)} ${pin.slice(4, 8)} ${pin.slice(8, 12)} ${pin.slice(12)}`;
  assert.equal((await handlers.redeemMaintenancePin({ pin: spaced })).unlocked, true);
});

test('the PIN does nothing while the arcade is open', async () => {
  const { handlers } = backend();
  await refuses(handlers.redeemMaintenancePin({ pin: '1234567890123456' }), 'maintenance-not-active');
  await refuses(handlers.redeemMaintenancePin({ pin: '0000000000000000' }), 'maintenance-not-active');
  // A visitor cannot tell a wrong PIN from a closed door: both are refused, and nothing was minted.
  const { pin } = await handlers.adminSetMaintenance({ enabled: true, message: 'Down.' }, { uid: ADMIN });
  assert.equal((await handlers.redeemMaintenancePin({ pin })).unlocked, true);
  await handlers.adminSetMaintenance({ enabled: false, message: 'Open.' }, { uid: ADMIN });
  await refuses(handlers.redeemMaintenancePin({ pin }), 'maintenance-not-active');
});

test('rate limiting stops a guessing script before it gets anywhere near 10^16', async () => {
  const { handlers } = backend();
  const { pin } = await handlers.adminSetMaintenance({ enabled: true, message: 'Down.' }, { uid: ADMIN });
  const policy = RATE_LIMITS.maintenancePin;
  assert.ok(policy, 'the gate has a rate limit');
  assert.ok(policy.windowMs >= 5 * 60 * 1000 && policy.max <= 120, 'it is tight enough that 16 digits cannot be guessed');
  for (let attempt = 0; attempt < policy.max; attempt += 1) {
    await refuses(handlers.redeemMaintenancePin({ pin: '0000000000000000' }), 'invalid-pin');
  }
  // The bucket is shared (whoever is typing has not signed in), so the next attempt - even with the
  // right digits - waits it out, and the refusal says how long: the browser turns that into
  // "try again in N minutes".
  await assert.rejects(handlers.redeemMaintenancePin({ pin }), (error) => error.code === 'rate-limited' && error.details.retryAfterMs > 0);
});

test('the rate-limit bucket refills and the same PIN works after it', async () => {
  const { handlers, advance } = backend();
  const { pin } = await handlers.adminSetMaintenance({ enabled: true, message: 'Down.' }, { uid: ADMIN });
  const policy = RATE_LIMITS.maintenancePin;
  for (let attempt = 0; attempt < policy.max; attempt += 1) {
    await refuses(handlers.redeemMaintenancePin({ pin: '9999999999999999' }), 'invalid-pin');
  }
  await refuses(handlers.redeemMaintenancePin({ pin }), 'rate-limited');
  advance(policy.windowMs + 1000);
  assert.equal((await handlers.redeemMaintenancePin({ pin })).unlocked, true, 'the real tester is not locked out forever');
});

// ── Bad data, and the input the operator writes ─────────────────────────────────────────────────

test('a missing or malformed public document reads as "the arcade is open" and cannot unlock anything', async () => {
  const store = createFakeStore({ now: () => NOW });
  store.seed(`admins/${ADMIN}`, { admin: true });
  const handlers = createHandlers({
    store,
    games: GAMES,
    engines: { createInitialGameState: () => ({}), applyGameAction: () => ({}), gameById },
    onlineBankFor: () => [],
    randomId: () => 'id',
    timestampMs: NOW,
  });
  // No maintenance document at all.
  await refuses(handlers.redeemMaintenancePin({ pin: '1234567890123456' }), 'maintenance-not-active');
  // Half-written documents: the read path must not throw, and must not treat garbage as "on".
  for (const raw of ['nonsense', 42, [], { enabled: 'true' }, { enabled: true, pinActive: true, pinVersion: -3 }]) {
    store.seed('maintenance/status', /** @type {any} */ (raw));
    assert.equal(safeMaintenanceStatus(raw).enabled, raw?.enabled === true, 'only an explicit boolean enables it');
    await refuses(handlers.redeemMaintenancePin({ pin: '1234567890123456' }), 'maintenance-not-active');
  }
  // A document that says "enabled" but has no gate: still nothing to redeem.
  store.seed('maintenance/status', { enabled: true, message: 'Down.', pinVersion: 1, pinActive: true });
  await refuses(handlers.redeemMaintenancePin({ pin: '1234567890123456' }), 'invalid-pin');
  // ...and the admin can still fix it, which mints the PIN that was missing.
  const fixed = await handlers.adminSetMaintenance({ enabled: true, message: 'Down.' }, { uid: ADMIN });
  assert.match(fixed.pin, new RegExp(`^\\d{${MAINTENANCE_PIN_LENGTH}}$`));
});

test('an operator message is cleaned, capped and never stored as anything but a string', async () => {
  const { handlers, status } = backend();
  const long = 'x'.repeat(MAINTENANCE_MESSAGE_MAX + 200);
  await handlers.adminSetMaintenance({ enabled: true, message: long }, { uid: ADMIN });
  assert.equal(status().message.length, MAINTENANCE_MESSAGE_MAX);
  await handlers.adminSetMaintenance({ enabled: true, message: 'line one\nline two\t\u0007 bell' }, { uid: ADMIN });
  assert.equal(status().message, 'line one line two bell', 'control characters and newlines are normalised away');
  await handlers.adminSetMaintenance({ enabled: true, message: { text: 'not a string' } }, { uid: ADMIN });
  assert.equal(status().message, 'line one line two bell', 'a non-string message keeps the previous sentence');
  await handlers.adminSetMaintenance({ enabled: true, message: '   ' }, { uid: ADMIN });
  assert.equal(status().message, 'line one line two bell');
  await handlers.adminSetMaintenance({ enabled: false, message: '' }, { uid: ADMIN });
  assert.equal(status().message, 'line one line two bell', 'turning it off does not wipe the message');
  assert.equal(status().enabled, false);
});

test('the stored verifier is salted, hashed and compared in constant time', () => {
  const pin = generateMaintenancePin(MAINTENANCE_PIN_LENGTH);
  assert.match(pin, new RegExp(`^\\d{${MAINTENANCE_PIN_LENGTH}}$`));
  const saltA = 'a'.repeat(32);
  const saltB = 'b'.repeat(32);
  assert.notEqual(hashMaintenancePin(pin, saltA), hashMaintenancePin(pin, saltB), 'the salt changes the hash');
  assert.equal(hashMaintenancePin(pin, saltA).length, 64);
  const gate = { salt: saltA, pinHash: hashMaintenancePin(pin, saltA), pinVersion: 1 };
  assert.equal(verifyMaintenancePin(pin, gate), true);
  assert.equal(verifyMaintenancePin(`${pin.slice(0, 15)}0`, gate), false);
  // Malformed gates fail closed instead of throwing.
  for (const broken of [null, undefined, '', 42, {}, { salt: saltA }, { pinHash: gate.pinHash }, { salt: saltA, pinHash: 'not-a-hash' }, { salt: saltA, pinHash: 'ff'.repeat(64) }]) {
    assert.equal(verifyMaintenancePin(pin, broken), false, `${JSON.stringify(broken)} must not verify`);
  }
  // Generated PINs do not repeat (a broken CSPRNG wiring would show up here immediately).
  const seen = new Set(Array.from({ length: 200 }, () => generateMaintenancePin(MAINTENANCE_PIN_LENGTH)));
  assert.equal(seen.size, 200);
});

test('nothing else in the app is affected: an admin can still run the studio after switching maintenance on', async () => {
  const { handlers, store, status } = backend();
  await handlers.adminSetMaintenance({ enabled: true, message: '' }, { uid: ADMIN });
  assert.equal(status().message, MAINTENANCE_DEFAULT_MESSAGE, 'enabling without a message uses the shipped sentence');
  store.seed(`profiles/${PLAYER}`, { uid: PLAYER, username: 'player', usernameLower: 'player', createdAtMs: NOW });
  const removed = await handlers.adminRemovePlayer({ uid: PLAYER }, { uid: ADMIN });
  assert.equal(removed.removed, PLAYER, 'the rest of the admin surface still works while the arcade is closed');
});
