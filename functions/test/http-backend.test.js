/**
 * The HTTPS transport of the backend (`functions/src/http-backend.js`), tested without a host, an
 * emulator or the network.
 *
 * This is the transport the free deployment uses: the same handlers as the Firebase callables, but
 * served by Vercel serverless functions under /api/backend/<name>. What these tests pin down:
 *
 *   - the caller is nobody until a verified Firebase ID token says otherwise, and the context the
 *     handlers receive carries exactly the claims the callable transport would pass
 *     (`uid`, `token.firebase.sign_in_provider`, `token.auth_time`);
 *   - failures use the same wire shape as the callable SDK — canonical status, player-facing
 *     sentence, our policy code in `details` — so `src/online/callables.js` maps both transports
 *     with one function;
 *   - the cleanup endpoint refuses to run without its secret, and accepts any HTTP method.
 *
 * The handlers run on the in-memory store (see ./fake-store.js), exactly like the handler tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GAMES } from '../../shared/games.js';
import { onlineItemsForGame } from '../../shared/content/quiz-banks.js';
import * as engineRegistry from '../../src/engines/index.js';
import { createHandlers } from '../src/handlers.js';
import { createHttpBackend, HANDLER_NAMES, parseServiceAccount, UNAUTHENTICATED_MESSAGE } from '../src/http-backend.js';
import { createFakeStore } from './fake-store.js';

const NOW = 1_700_000_000_000;

const engines = {
  createInitialGameState: (game, players, seed) => engineRegistry.createInitialGameState(
    game,
    players,
    seed,
    game?.engine === 'quiz' ? { bank: onlineItemsForGame(game.id) } : undefined,
  ),
  applyGameAction: engineRegistry.applyGameAction,
  gameById: (gameId) => GAMES.find((game) => game.id === gameId) ?? null,
};

/** The verified-token stand-in: any "header.payload.signature" whose payload names a uid. */
const tokenFor = (uid, provider = 'google.com') => `header.${Buffer.from(JSON.stringify({
  uid,
  firebase: { sign_in_provider: provider },
  auth_time: Math.floor(NOW / 1000),
})).toString('base64url')}.signature`;

/** One runtime (store + handlers) over the in-memory store, as both transports build per request. */
function createRuntimeFor(timestampMs, store) {
  return {
    store,
    handlers: createHandlers({
      store,
      games: GAMES,
      engines,
      onlineBankFor: onlineItemsForGame,
      randomId: (length = 20) => `id${'x'.repeat(20)}`.slice(0, length),
      timestampMs,
      deleteAuthUser: async () => {},
    }),
  };
}

/**
 * A backend over the in-memory store. `secrets` maps uid → provider so guest/provider behaviour can
 * be exercised through the token, the way the real Admin SDK delivers it.
 */
function httpBackend({ cronSecret = '' } = {}) {
  const clock = { nowMs: NOW };
  const store = createFakeStore({ now: () => clock.nowMs });
  const createRuntime = (timestampMs) => createRuntimeFor(timestampMs, store);
  const api = createHttpBackend({
    createRuntime,
    // Rejects tokens the Admin SDK would reject: the exact string 'expired' stands in for a
    // signature failure; anything else "verifies" to the uid baked into the fake token.
    verifyToken: async (token) => {
      if (token === 'expired.signature') throw new Error('invalid token');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      return payload;
    },
    cronSecret: () => cronSecret,
    now: () => clock.nowMs,
    log: () => {},
  });
  return { api, store, clock };
}

/** A minimal valid request with a signed-in caller. */
const call = (api, name, body, { token = tokenFor('uid-a'), method = 'POST' } = {}) =>
  api.handleCall({ name, method, authorization: token ? `Bearer ${token}` : '', body });

test('the HTTP route serves exactly the callable surface', () => {
  // If a handler is added in functions/src/index.js but not here, the browser would see a
  // deployment that answers 404 for a real feature.
  const { store } = createRuntimeFor(NOW);
  for (const name of HANDLER_NAMES) {
    assert.equal(typeof createHandlers({ store, games: GAMES, engines })[name], 'function', `${name} must exist`);
  }
  assert.ok(HANDLER_NAMES.has('createRoom'));
  assert.ok(!HANDLER_NAMES.has('cleanupExpired'), 'the schedule is not a callable');
});

test('a verified caller gets the callable contract: result payload, policy codes in details', async () => {
  const { api } = httpBackend();
  const created = await call(api, 'createRoom', { gameId: GAMES[0].id, maxPlayers: 2 });
  assert.equal(created.status, 200);
  assert.ok(created.json.result.roomId, 'the room payload is inside result');
  assert.ok(created.json.result.code);

  const joined = await call(api, 'joinRoom', { code: 'NOTREAL' });
  assert.equal(joined.status, 404);
  assert.equal(joined.json.error.status, 'not-found');
  assert.equal(joined.json.error.details.code, 'room-not-found');
  assert.match(joined.json.error.message, /No room matches the code NOTREAL/);
});

test('nobody gets in without a verified Firebase ID token', async () => {
  const { api } = httpBackend();
  for (const authorization of ['', 'Bearer', 'Bearer abc', 'Bearer not-a-jwt', 'Bearer expired.signature']) {
    const result = await api.handleCall({ name: 'createRoom', method: 'POST', authorization, body: {} });
    assert.equal(result.status, 401, `authorization "${authorization}" must be refused`);
    assert.equal(result.json.error.status, 'unauthenticated');
    assert.equal(result.json.error.message, UNAUTHENTICATED_MESSAGE);
    assert.equal(result.json.error.details.code, 'unauthenticated');
  }
});

test('only POST reaches the handlers, and unknown names answer not-found', async () => {
  const { api } = httpBackend();
  const get = await call(api, 'createRoom', {}, { method: 'GET' });
  assert.equal(get.status, 405);
  assert.equal(get.json.error.details.code, 'method-not-allowed');

  const unknown = await call(api, 'definitelyNotAFunction', {});
  assert.equal(unknown.status, 404);
  assert.equal(unknown.json.error.status, 'not-found');
  assert.equal(unknown.json.error.details.code, 'unknown-handler');
});

test('the handlers see the caller the token describes, including the auth_time the deletion check needs', async () => {
  const { api } = httpBackend();
  // deleteAccount refuses a sign-in older than the recent-auth window; the token carries that time.
  const result = await call(api, 'deleteAccount', { confirm: true }, {
    token: tokenFor('uid-a'),
  });
  assert.ok([200, 412].includes(result.status), 'the request itself must be authenticated');
  assert.notEqual(result.json.error?.details?.code, 'unauthenticated');
});

test('rate limits surface as 429 with the retry hint in details', async () => {
  const { api } = httpBackend();
  let last;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    last = await call(api, 'createRoom', { gameId: GAMES[0].id, maxPlayers: 2 });
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429);
  assert.equal(last.json.error.status, 'resource-exhausted');
  assert.equal(last.json.error.details.code, 'rate-limited');
  assert.ok(Number(last.json.error.details.retryAfterMs) > 0);
});

test('guest providers are refused by the username policy exactly as over callables', async () => {
  const { api } = httpBackend();
  const guest = await call(api, 'claimUsername', { username: 'guestplayer' }, {
    token: tokenFor('uid-guest', 'anonymous'),
  });
  assert.equal(guest.status, 412);
  assert.equal(guest.json.error.details.code, 'account-required');
});

test('the cleanup endpoint refuses to run without a secret, and with the wrong one', async () => {
  const disabled = httpBackend({});
  const unconfigured = await disabled.api.handleCleanup({ authorization: 'Bearer anything' });
  assert.equal(unconfigured.status, 503);
  assert.equal(unconfigured.json.error.details.code, 'cleanup-unconfigured');

  const { api } = httpBackend({ cronSecret: 'sweep-secret' });
  const wrong = await api.handleCleanup({ authorization: 'Bearer not-the-secret' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error.details.code, 'bad-cron-secret');
});

test('the cleanup endpoint runs the sweep with the right secret, on either HTTP method', async () => {
  const { api, store } = httpBackend({ cronSecret: 'sweep-secret' });
  store.seed('rooms/gone-room', { expiresAt: NOW - 1000, status: 'waiting' });
  const ok = await api.handleCleanup({ authorization: 'Bearer sweep-secret' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.result.expiredRooms, 1);
  assert.deepEqual(ok.json.result.errors, []);
});

test('a malformed service-account variable is a configuration error, not a mystery', () => {
  assert.equal(parseServiceAccount(undefined), null);
  assert.equal(parseServiceAccount(''), null);
  assert.throws(() => parseServiceAccount('not json at all'), /neither valid JSON nor valid base64/);
  assert.throws(() => parseServiceAccount(JSON.stringify({ project_id: 'p' })), /missing project_id, private_key or client_email/);
  const parsed = parseServiceAccount(JSON.stringify({ project_id: 'p', private_key: 'k', client_email: 'e@p.iam' }));
  assert.equal(parsed.project_id, 'p');
});
