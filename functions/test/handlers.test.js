/**
 * Backend tests: the security properties that used to be "the browser promises to behave".
 *
 * These run against an in-memory store, so they need no emulator, no JVM and no network, and they
 * cover the whole handler surface: identity claims, friend lookup, rooms, moves, rematches, blocks,
 * reports, rate limits and account deletion. `index.js` only adapts these handlers to `onCall`; the
 * policy decisions are all in here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GAMES } from '../../shared/games.js';
import { ON_DEVICE_REVIEW_MODEL_ID, ON_DEVICE_REVIEW_MODEL_REVISION } from '../../shared/reviews/agent.js';
import { ENGINE_POLICY, RATE_LIMITS } from '../../shared/online/policy.js';
import { onlineItemsForGame, practiceItemsForGame } from '../../shared/content/quiz-banks.js';
import * as engineRegistry from '../../src/engines/index.js';
import { createHandlers, PolicyError, RECENT_AUTH_WINDOW_MS } from '../src/handlers.js';
import { cleanupExpiredData, purgeRoom } from '../src/cleanup.js';
import { createFakeStore } from './fake-store.js';

const NOW = 1_700_000_000_000;
const TTL_MS = 60 * 60 * 1000;

const gameById = (gameId) => GAMES.find((game) => game.id === gameId) ?? null;

/** The registry the backend validates with; online quizzes deal from the server-only bank. */
const engines = {
  createInitialGameState: (game, players, seed) => engineRegistry.createInitialGameState(
    game,
    players,
    seed,
    game?.engine === 'quiz' ? { bank: onlineItemsForGame(game.id) } : undefined,
  ),
  applyGameAction: engineRegistry.applyGameAction,
  gameById,
};

/** A running backend on top of the in-memory store. */
function backend() {
  const clock = { nowMs: NOW };
  const store = createFakeStore({ now: () => clock.nowMs });
  const deletedUsers = [];
  let ids = 0;
  const deps = {
    store,
    games: GAMES,
    engines,
    onlineBankFor: onlineItemsForGame,
    randomId: (length = 20) => `${(ids += 1).toString(36).padStart(6, '0')}${'a'.repeat(20)}`.slice(0, length),
    timestampMs: clock.nowMs,
    deleteAuthUser: async (uid) => { deletedUsers.push(uid); },
  };
  const handlers = createHandlers(deps);
  return {
    handlers,
    store,
    deletedUsers,
    dump: () => store.dump(),
    advance: (ms) => { clock.nowMs += ms; deps.timestampMs = clock.nowMs; },
  };
}

/** A signed-in account context, the shape Cloud Functions passes to a callable. */
const account = (uid, provider = 'google.com') => ({
  uid,
  token: { firebase: { sign_in_provider: provider }, auth_time: Math.floor(NOW / 1000) },
});
const guest = (uid) => account(uid, 'anonymous');

async function makeAccounts(handlers, entries) {
  for (const [uid, username] of entries) await handlers.claimUsername({ username }, account(uid));
}

async function lobby(handlers, { gameId, maxPlayers = 2, host = 'uid-a', joiners = ['uid-b'] } = {}) {
  const room = await handlers.createRoom({ gameId, maxPlayers }, account(host));
  for (const uid of joiners) await handlers.joinRoom({ roomId: room.roomId }, account(uid));
  await handlers.startRoom({ roomId: room.roomId }, account(host));
  return room;
}

// ── Identity ─────────────────────────────────────────────────────────────────────────────────────

test('a username is claimed atomically and cannot be taken twice or changed', async () => {
  const { handlers, dump } = backend();
  const claimed = await handlers.claimUsername({ username: 'PixelPilot' }, account('uid-a'));
  assert.deepEqual(claimed, { username: 'PixelPilot', usernameLower: 'pixelpilot' });
  await assert.rejects(
    () => handlers.claimUsername({ username: 'pixelpilot' }, account('uid-b')),
    (error) => error instanceof PolicyError && error.code === 'username-taken',
  );
  await assert.rejects(
    () => handlers.claimUsername({ username: 'SomeoneElse' }, account('uid-a')),
    (error) => error.code === 'profile-exists',
    'a claimed username cannot be renamed',
  );
  assert.equal(dump()['usernames/pixelpilot'].uid, 'uid-a');
  assert.equal(dump()['profiles/uid-a'].username, 'PixelPilot');
});

test('anonymous guests cannot claim usernames, but may play with a temporary name', async () => {
  const { handlers, dump } = backend();
  await assert.rejects(
    () => handlers.claimUsername({ username: 'freeloader' }, guest('guest-1')),
    (error) => error.code === 'account-required',
  );
  const room = await handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 2, displayName: 'Guest one' }, guest('guest-1'));
  assert.equal(dump()[`rooms/${room.roomId}`].playerNames['guest-1'], 'Guest one');
});

test('bad usernames are refused before anything is written', async () => {
  const { handlers, dump } = backend();
  for (const username of ['ab', 'a'.repeat(19), 'has space', 'emoji😀', 'semi;colon', '']) {
    await assert.rejects(
      () => handlers.claimUsername({ username }, account('uid-a')),
      (error) => error.code === 'invalid-username',
      `"${username}" must be refused`,
    );
  }
  assert.deepEqual(Object.keys(dump()), [], 'nothing was written');
});

test('friend lookup is an exact user lookup that refuses guests and cannot page the directory', async () => {
  const { handlers } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const found = await handlers.lookupUser({ username: 'BOB' }, account('uid-a'));
  assert.deepEqual({ found: found.found, uid: found.uid, alreadyFriends: found.alreadyFriends }, { found: true, uid: 'uid-b', alreadyFriends: false });
  assert.equal((await handlers.lookupUser({ username: 'nobody' }, account('uid-a'))).found, false);
  assert.equal((await handlers.lookupUser({ username: 'bobby' }, account('uid-a'))).found, false, 'no fuzzy or partial matching');
  await assert.rejects(
    () => handlers.lookupUser({ username: 'bo' }, account('uid-a')),
    (error) => error.code === 'invalid-username',
    'a query shorter than a legal username is refused outright',
  );
  await assert.rejects(
    () => handlers.lookupUser({ username: 'bob' }, guest('guest-1')),
    (error) => error.code === 'account-required',
    'guests cannot search the player directory',
  );
});

test('the lookup rate limit stops a scraper even with exact names', async () => {
  const { handlers } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  let blocked = null;
  for (let attempt = 0; attempt < RATE_LIMITS.lookupUser.max + 1; attempt += 1) {
    try {
      await handlers.lookupUser({ username: 'bob' }, account('uid-a'));
    } catch (error) {
      blocked = error;
      break;
    }
  }
  assert.equal(blocked?.code, 'rate-limited');
});

// ── Social ───────────────────────────────────────────────────────────────────────────────────────

test('friend requests flow through the backend and only the recipient can answer', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob'], ['uid-c', 'carol']]);
  const sent = await handlers.sendFriendRequest({ username: 'bob' }, account('uid-a'));
  assert.equal(sent.status, 'pending');
  assert.equal(sent.alreadySent, false);
  const resent = await handlers.sendFriendRequest({ username: 'bob' }, account('uid-a'));
  assert.equal(resent.alreadySent, true, 'a repeated tap updates the same request');
  await assert.rejects(
    () => handlers.respondFriendRequest({ requestId: sent.requestId, accept: true }, account('uid-c')),
    (error) => error.code === 'not-your-request',
  );
  const answered = await handlers.respondFriendRequest({ requestId: sent.requestId, accept: true }, account('uid-b'));
  assert.equal(answered.accepted, true);
  const friendship = dump()['friendships/uid-a_uid-b'];
  assert.deepEqual(friendship.memberUids, ['uid-a', 'uid-b']);
  assert.deepEqual(Object.keys(friendship.memberNames).sort(), ['uid-a', 'uid-b']);
  await assert.rejects(
    () => handlers.respondFriendRequest({ requestId: sent.requestId, accept: true }, account('uid-b')),
    (error) => error.code === 'request-handled',
  );
  await assert.rejects(
    () => handlers.sendFriendRequest({ username: 'bob' }, account('uid-a')),
    (error) => error.code === 'already-friends',
  );
});

test('a block stops requests in both directions and clears what was waiting', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const pending = await handlers.sendFriendRequest({ username: 'bob' }, account('uid-a'));
  assert.ok(dump()[`friendRequests/${pending.requestId}`]);
  await handlers.blockUser({ uid: 'uid-b' }, account('uid-a'));
  assert.equal(dump()[`friendRequests/${pending.requestId}`], undefined, 'the block clears the pending request');
  await assert.rejects(
    () => handlers.sendFriendRequest({ username: 'bob' }, account('uid-a')),
    (error) => error.code === 'blocked',
  );
  await assert.rejects(
    () => handlers.sendFriendRequest({ username: 'alice' }, account('uid-b')),
    (error) => error.code === 'blocked',
    'the block works both ways',
  );
  await handlers.unblockUser({ uid: 'uid-b' }, account('uid-a'));
  const sent = await handlers.sendFriendRequest({ username: 'bob' }, account('uid-a'));
  assert.equal(sent.status, 'pending');
});

test('game invites require a friendship, a room you host and a free seat', async () => {
  const { handlers } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob'], ['uid-c', 'carol']]);
  const room = await handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 2 }, account('uid-a'));
  await assert.rejects(
    () => handlers.createGameInvite({ roomId: room.roomId, toUid: 'uid-b' }, account('uid-a')),
    (error) => error.code === 'not-friends',
  );
  const request = await handlers.sendFriendRequest({ username: 'bob' }, account('uid-a'));
  await handlers.respondFriendRequest({ requestId: request.requestId, accept: true }, account('uid-b'));
  const invite = await handlers.createGameInvite({ roomId: room.roomId, toUid: 'uid-b' }, account('uid-a'));
  assert.equal(invite.roomId, room.roomId);
  await handlers.joinRoom({ roomId: room.roomId }, account('uid-b'));
  await assert.rejects(
    () => handlers.createGameInvite({ roomId: room.roomId, toUid: 'uid-c' }, account('uid-a')),
    (error) => error.code === 'not-friends' || error.code === 'room-full',
  );
  const stranger = await handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 2 }, account('uid-c'));
  await assert.rejects(
    () => handlers.createGameInvite({ roomId: stranger.roomId, toUid: 'uid-b' }, account('uid-a')),
    (error) => error.code === 'host-only',
  );
});

// ── Rooms and moves ──────────────────────────────────────────────────────────────────────────────

test('only a member can move, only the host can start, and turns are the server’s decision', async () => {
  const { handlers } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob'], ['uid-c', 'carol']]);
  const room = await handlers.createRoom({ gameId: 'connect-four', maxPlayers: 2 }, account('uid-a'));
  await assert.rejects(
    () => handlers.playMove({ roomId: room.roomId, action: { col: 0 }, clientActionId: 'x1' }, account('uid-c')),
    (error) => error.code === 'not-in-room',
  );
  await handlers.joinRoom({ roomId: room.roomId }, account('uid-b'));
  await assert.rejects(
    () => handlers.playMove({ roomId: room.roomId, action: { col: 0 }, clientActionId: 'x1' }, account('uid-a')),
    (error) => error.code === 'not-playing',
    'no move before the host starts the match',
  );
  await assert.rejects(
    () => handlers.startRoom({ roomId: room.roomId }, account('uid-b')),
    (error) => error.code === 'host-only',
  );
  await handlers.startRoom({ roomId: room.roomId }, account('uid-a'));
  await assert.rejects(
    () => handlers.playMove({ roomId: room.roomId, action: { col: 0 }, clientActionId: 'x1' }, account('uid-b')),
    // The handlers import the mirrored `functions/vendor` copy, so match on name/code rather than
    // on `instanceof` across the two module instances.
    (error) => error?.name === 'RoomError' && error.code === 'illegal-move' && /wait for your turn/i.test(error.message),
    'the server enforces turn order, not just the disabled button',
  );
  const move = await handlers.playMove({ roomId: room.roomId, action: { col: 0 }, clientActionId: 'x1' }, account('uid-a'));
  assert.equal(move.applied, true);
});

test('a forged action shape or an unknown field is rejected before it reaches the engine', async () => {
  const { handlers } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'pixel-tac-toe' });
  await assert.rejects(
    () => handlers.playMove({ roomId: room.roomId, action: { index: 0, phase: 'finished' }, clientActionId: 'x1' }, account('uid-a')),
    (error) => error.code === 'bad-action-field',
  );
  await assert.rejects(
    () => handlers.playMove({ roomId: room.roomId, action: 'index=0', clientActionId: 'x2' }, account('uid-a')),
    (error) => error.code === 'bad-action',
  );
  await assert.rejects(
    () => handlers.playMove({ roomId: room.roomId, action: { index: 99 }, clientActionId: 'x3' }, account('uid-a')),
    /square|board|cell|index/i,
    'an out-of-range move fails inside the engine',
  );
  await assert.rejects(
    () => handlers.playMove({ roomId: room.roomId, action: {}, clientActionId: 'x4' }, account('uid-a')),
    (error) => error.code === 'empty-action',
  );
});

test('a retried move (same clientActionId) is applied once', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'pixel-tac-toe' });
  const first = await handlers.playMove({ roomId: room.roomId, action: { index: 4 }, clientActionId: 'move-1' }, account('uid-a'));
  assert.equal(first.applied, true);
  const replay = await handlers.playMove({ roomId: room.roomId, action: { index: 4 }, clientActionId: 'move-1' }, account('uid-a'));
  assert.equal(replay.duplicate, true);
  assert.equal(dump()[`rooms/${room.roomId}`].state.moves, 1);
});

test('a retried move with a different index but the same id is still a duplicate', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'pixel-tac-toe' });
  await handlers.playMove({ roomId: room.roomId, action: { index: 0 }, clientActionId: 'move-1' }, account('uid-a'));
  const replay = await handlers.playMove({ roomId: room.roomId, action: { index: 1 }, clientActionId: 'move-1' }, account('uid-a'));
  assert.equal(replay.duplicate, true);
  assert.equal(dump()[`rooms/${room.roomId}`].state.moves, 1);
});

test('the race tempo is enforced by the server and a burst is allowed', async () => {
  const { handlers, dump, advance } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'bug-blaster' });
  const burst = await handlers.playMove({ roomId: room.roomId, action: { type: 'tap', count: 12 }, clientActionId: 'tap-1' }, account('uid-a'));
  assert.deepEqual({ applied: burst.applied, accepted: burst.accepted, rejected: burst.rejected }, { applied: true, accepted: 4, rejected: 8 });
  advance(60_000);
  const refill = await handlers.playMove({ roomId: room.roomId, action: { type: 'tap', count: 20 }, clientActionId: 'tap-2' }, account('uid-a'));
  assert.deepEqual({ accepted: refill.accepted, rejected: refill.rejected }, { accepted: 4, rejected: 16 }, 'a burst never refills past four taps');
  // A script that hammers the callable stays far behind the tempo it is pretending to keep.
  let counted = 0;
  let requested = 0;
  for (let tick = 1; tick <= 8; tick += 1) {
    advance(250);
    const move = await handlers.playMove({ roomId: room.roomId, action: { type: 'tap', count: 40 }, clientActionId: `spam-${tick}` }, account('uid-a'));
    counted += move.accepted ?? 0;
    requested += 40;
  }
  assert.ok(counted <= 10, `one tap per 250 ms counted, not ${counted}`);
  assert.ok(requested > counted * 4, 'the spammer sent four times what the tempo allowed');
  assert.equal(dump()[`rooms/${room.roomId}/secrets/engine`].state.scores['uid-a'], 4 + 4 + counted);
});

test('a faster script gains nothing in a paced race, but an unpaced race accepts the batch', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const paced = await lobby(handlers, { gameId: 'spacebar-showdown' });
  const pacedBurst = await handlers.playMove({ roomId: paced.roomId, action: { type: 'tap', count: 40 }, clientActionId: 'tap-1' }, account('uid-a'));
  assert.equal(pacedBurst.accepted, 4, 'a 40-tap batch counts as four at the start');
  const unpaced = await lobby(handlers, { gameId: 'pixel-tap' });
  const unpacedBurst = await handlers.playMove({ roomId: unpaced.roomId, action: { type: 'tap', count: 40 }, clientActionId: 'tap-1' }, account('uid-a'));
  assert.equal(unpacedBurst.accepted, 16, 'Pixel Tap Sprint has no tempo rule, so taps count until the target is reached');
  assert.equal(unpacedBurst.rejected, 24, 'taps past the winning one are dropped, not applied');
  assert.equal(dump()[`rooms/${unpaced.roomId}`].status, 'finished', 'reaching the target finishes the match');
  assert.equal(dump()[`rooms/${unpaced.roomId}`].winnerUid, 'uid-a');
});

test('the host can rematch a finished room, others cannot, and the reset is real', async () => {
  const { handlers, dump, advance } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'pixel-tap' });
  await assert.rejects(
    () => handlers.rematch({ roomId: room.roomId }, account('uid-a')),
    (error) => error.code === 'not-finished',
    'a match in progress cannot be reset out from under the other player',
  );
  await handlers.playMove({ roomId: room.roomId, action: { type: 'tap', count: 16 }, clientActionId: 'tap-1' }, account('uid-a'));
  assert.equal(dump()[`rooms/${room.roomId}`].status, 'finished');
  await assert.rejects(
    () => handlers.rematch({ roomId: room.roomId }, account('uid-b')),
    (error) => error.code === 'host-only',
  );
  advance(1000);
  const again = await handlers.rematch({ roomId: room.roomId }, account('uid-a'));
  assert.equal(again.status, 'playing');
  const state = dump()[`rooms/${room.roomId}`].state;
  assert.equal(state.phase, 'playing');
  assert.equal(state.moves, 0);
  assert.equal(state.scores['uid-a'], 0, 'the new match starts from zero');
  assert.notEqual(state.target, undefined);
});

test('in-match chat works and is purged when the match finishes and on rematch', async () => {
  const { handlers, dump, store } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'pixel-tac-toe' });

  const sent = await handlers.sendChat({ roomId: room.roomId, text: 'Good game!' }, account('uid-a'));
  const chatPath = `rooms/${room.roomId}/chat/${sent.messageId}`;
  assert.equal(dump()[chatPath].text, 'Good game!');
  assert.equal(dump()[chatPath].uid, 'uid-a');

  const winningMoves = [
    ['uid-a', 0], ['uid-b', 3], ['uid-a', 1], ['uid-b', 4], ['uid-a', 2],
  ];
  for (const [index, [uid, cell]] of winningMoves.entries()) {
    await handlers.playMove({
      roomId: room.roomId,
      action: { index: cell },
      clientActionId: `chat-finish-${index}`,
    }, account(uid));
  }
  assert.equal(dump()[`rooms/${room.roomId}`].status, 'finished');
  assert.equal(dump()[chatPath], undefined, 'the winning move deletes the live chat');

  // Rematch purges stragglers as well, including a write that raced with the finishing move.
  store.seed(chatPath, { uid: 'uid-a', name: 'alice', text: 'late message', createdAtMs: NOW });
  const rematch = await handlers.rematch({ roomId: room.roomId }, account('uid-a'));
  assert.equal(rematch.status, 'playing');
  assert.equal(dump()[chatPath], undefined, 'a rematch starts with no previous-match messages');
});

test('an expired room refuses everything and reports its code', async () => {
  const { handlers, advance } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'pixel-tac-toe' });
  advance(TTL_MS + 1);
  await assert.rejects(
    () => handlers.playMove({ roomId: room.roomId, action: { index: 0 }, clientActionId: 'late' }, account('uid-a')),
    (error) => error.code === 'room-expired',
  );
  await assert.rejects(
    () => handlers.joinRoom({ roomId: room.roomId }, account('uid-b')),
    (error) => error.code === 'room-expired',
  );
  await assert.rejects(
    () => handlers.createRoom({ gameId: 'not-a-game', maxPlayers: 2 }, account('uid-a')),
    (error) => error.code === 'unknown-game',
  );
  await assert.rejects(
    () => handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 5 }, account('uid-a')),
    (error) => error.code === 'bad-room-size',
  );
});

test('joining by display code works and a three-player room holds three seats', async () => {
  const { handlers } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob'], ['uid-c', 'carol']]);
  const room = await handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 3 }, account('uid-a'));
  assert.equal(room.code.length, 7);
  const joined = await handlers.joinRoom({ code: room.code.toLowerCase() }, account('uid-b'));
  assert.equal(joined.status, 'waiting', 'the 7-character code is enough to join');
  await handlers.joinRoom({ code: room.code }, account('uid-c'));
  await handlers.startRoom({ roomId: room.roomId }, account('uid-a'));
  const started = await handlers.playMove({ roomId: room.roomId, action: { index: 4 }, clientActionId: 'p-1' }, account('uid-a'));
  assert.equal(started.applied, true, 'a three-player line game starts');
});

test('host handoff is refused while the host is present and offered once they are gone', async () => {
  const { handlers, dump, advance, store } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 2 }, account('uid-a'));
  await handlers.joinRoom({ roomId: room.roomId }, account('uid-b'));
  store.seed(`rooms/${room.roomId}/presence/uid-a`, { status: 'here', lastSeenAtMs: NOW });
  await assert.rejects(
    () => handlers.claimHost({ roomId: room.roomId }, account('uid-b')),
    (error) => error.code === 'host-still-here',
  );
  store.seed(`rooms/${room.roomId}/presence/uid-a`, { status: 'here', lastSeenAtMs: NOW });
  advance(2 * 60 * 1000);
  const claimed = await handlers.claimHost({ roomId: room.roomId }, account('uid-b'));
  assert.equal(claimed.changed, true);
  assert.equal(dump()[`rooms/${room.roomId}`].hostUid, 'uid-b');
  assert.equal(dump()[`rooms/${room.roomId}`].hostName, 'bob');
  await assert.rejects(
    () => handlers.startRoom({ roomId: room.roomId }, account('uid-a')),
    (error) => error.code === 'host-only',
    'the old host cannot start the lobby any more',
  );
});

// ── Hidden state ─────────────────────────────────────────────────────────────────────────────────

test('hidden engines keep their secret out of the public room document', async () => {
  const { handlers, dump } = backend();
  let seat = 0;
  for (const game of GAMES.filter((entry) => ENGINE_POLICY[entry.engine].hidden)) {
    seat += 1;
    const room = await lobby(handlers, { gameId: game.id, host: `host-${seat}`, joiners: [`rival-${seat}`] });
    const publicState = dump()[`rooms/${room.roomId}`].state;
    assert.ok(dump()[`rooms/${room.roomId}/secrets/engine`]?.state, `${game.id} keeps an authoritative state server-side`);
    const published = JSON.stringify(publicState);
    if (game.engine === 'code') assert.equal(publicState.secret, undefined, `${game.id}: the code is not public`);
    if (game.engine === 'quiz') assert.equal(publicState.items, undefined, `${game.id}: the answer key is private`);
    if (game.engine === 'battle') assert.equal(publicState.ships, undefined, `${game.id}: the fleets are not public`);
    if (game.engine === 'rps') assert.equal(publicState.picks, undefined, `${game.id}: locked picks stay hidden`);
    if (game.engine === 'memory') {
      const revealed = new Set([...(publicState.matched || []), ...(publicState.opened || [])]);
      const hidden = publicState.cards.filter((card, index) => !revealed.has(index));
      assert.ok(hidden.every((card) => card === null), `${game.id}: unopened card faces stay hidden`);
      assert.ok(hidden.length > 0, `${game.id}: some card faces are genuinely still hidden`);
    }
    if (game.engine === 'quiz') {
      assert.equal(publicState.items, undefined, `${game.id}: the dealt items stay hidden`);
      assert.equal(publicState.answers, undefined, `${game.id}: other players’ answers stay hidden`);
      assert.equal(published.includes('"answer"'), false, `${game.id}: no field named answer reaches the client`);
      assert.equal(published.includes('practice'), false, `${game.id}: no practice-bank ids reach the client`);
    }
  }
});

test('online quiz rounds come from questions the browser never receives', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'word-scramble' });
  const secret = dump()[`rooms/${room.roomId}/secrets/engine`].state;
  const shipped = new Set(practiceItemsForGame('word-scramble').map((item) => item.id));
  assert.equal(secret.deck.length, gameById('word-scramble').options.rounds);
  for (const id of secret.deck) assert.equal(shipped.has(id), false, `${id} ships to the browser and must not be asked online`);
  const publicState = dump()[`rooms/${room.roomId}`].state;
  assert.ok(publicState.question.prompt.length > 0);
  assert.equal(typeof publicState.question.prompt, 'string');
});

test('a battle room gives each player only their own fleet', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await handlers.createRoom({ gameId: 'sea-battle', maxPlayers: 2 }, account('uid-a'));
  await handlers.joinRoom({ roomId: room.roomId }, account('uid-b'));
  const secret = dump()[`rooms/${room.roomId}/secrets/engine`].state;
  const alice = dump()[`rooms/${room.roomId}/views/uid-a`];
  const bob = dump()[`rooms/${room.roomId}/views/uid-b`];
  assert.deepEqual(alice.myShips, secret.ships['uid-a']);
  assert.deepEqual(bob.myShips, secret.ships['uid-b']);
  assert.notDeepEqual(alice.myShips, bob.myShips);
  assert.equal(dump()[`rooms/${room.roomId}`].state.myShips, undefined, 'the public document has no fleet at all');
});

test('a shot publishes the outcome but never the fleet', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'sea-battle' });
  const secret = dump()[`rooms/${room.roomId}/secrets/engine`].state;
  const shipIndex = secret.ships['uid-b'][0];
  const result = await handlers.playMove({ roomId: room.roomId, action: { targetUid: 'uid-b', index: shipIndex }, clientActionId: 'shot-1' }, account('uid-a'));
  assert.equal(result.applied, true);
  const publicState = dump()[`rooms/${room.roomId}`].state;
  assert.equal(publicState.marks[`uid-b:${shipIndex}`], 'hit');
  assert.equal(JSON.stringify(publicState).includes('"ships"'), false);
});

test('the public projection of every catalog game stays inside the size budget', async () => {
  const { handlers, dump } = backend();
  let seat = 0;
  for (const game of GAMES) {
    seat += 1;
    const room = await lobby(handlers, { gameId: game.id, host: `host-${seat}`, joiners: [`rival-${seat}`] });
    const size = JSON.stringify(dump()[`rooms/${room.roomId}`]).length;
    assert.ok(size < 200 * 1024, `${game.id} public room document is ${size} bytes`);
    await handlers.leaveRoom({ roomId: room.roomId }, account(`host-${seat}`));
  }
});

// ── Reports, limits, deletion and moderation ─────────────────────────────────────────────────────

test('per-user rate limits stop a script, not a player', async () => {
  const { handlers } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice']]);
  let blocked = null;
  for (let attempt = 0; attempt < RATE_LIMITS.createRoom.max + 1; attempt += 1) {
    try {
      await handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 2 }, account('uid-a'));
    } catch (error) {
      blocked = error;
      break;
    }
  }
  assert.ok(blocked, 'a script cannot create rooms forever');
  assert.equal(blocked.code, 'rate-limited');
  assert.ok(blocked.details.retryAfterMs > 0, 'the error says when to try again');
});

test('reports are stored for the operator and never echoed to the reported player', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const report = await handlers.reportProblem({ kind: 'player', targetUid: 'uid-b', message: 'Said something nasty in the lobby.' }, account('uid-a'));
  const stored = dump()[`reports/${report.reportId}`];
  assert.equal(stored.status, 'open');
  assert.equal(stored.targetUid, 'uid-b');
  assert.equal(stored.reporterUid, 'uid-a');
  await assert.rejects(
    () => handlers.reportProblem({ kind: 'player', message: 'no' }, account('uid-a')),
    (error) => error.code === 'report-too-short',
  );
});

test('report messages are normalised, capped and stored verbatim for the operator', async () => {
  const { handlers, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice']]);
  const report = await handlers.reportProblem({ kind: 'bug', message: 'line one\n\n\u0007 line two' }, account('uid-a'));
  const stored = dump()[`reports/${report.reportId}`];
  assert.equal(stored.message, 'line one line two', 'control characters become spaces, text is preserved');
  const capped = await handlers.reportProblem({ kind: 'bug', message: 'x'.repeat(2000) }, account('uid-a'));
  assert.equal(dump()[`reports/${capped.reportId}`].message.length, 400, 'a report cannot store an unbounded message');
  assert.equal(dump()[`reports/${report.reportId}`].status, 'open');
});

test('reviews are validated, publicly published without UIDs and automatically replied to by the local agent', async () => {
  const { handlers, dump } = backend();
  const result = await handlers.createReview({
    rating: 5,
    gameId: 'pixel-tac-toe',
    title: 'A really fun classic',
    message: 'Great, smooth and fun to play with friends.',
    reviewerName: 'Guest pilot',
  }, guest('guest-reviewer'));
  const published = dump()[`reviews/${result.reviewId}`];
  assert.equal(published.rating, 5);
  assert.equal(published.reviewerName, 'Guest pilot');
  assert.equal(published.gameId, 'pixel-tac-toe');
  assert.equal(published.sentiment, 'positive');
  assert.match(published.assistantReply, /Thanks for the kind words/);
  assert.equal(published.assistantName, 'Arcade Review Agent');
  assert.equal(published.assistantMode, 'local-lexicon');
  assert.equal(Object.hasOwn(published, 'ownerUid'), false, 'public documents never reveal the Firebase UID');
  assert.doesNotMatch(JSON.stringify(published), /guest-reviewer/);
  assert.equal(dump()[`reviewOwners/${result.reviewId}`].ownerUid, 'guest-reviewer', 'the private owner map supports account deletion');
  assert.ok(published.featuredScore >= 5000);

  const modeled = await handlers.createReview({
    rating: 5,
    gameId: 'arcade',
    message: 'A considered note without obvious emotion cues.',
    pretrainedPrediction: {
      modelId: ON_DEVICE_REVIEW_MODEL_ID,
      revision: ON_DEVICE_REVIEW_MODEL_REVISION,
      sentiment: 'positive',
      confidence: 0.91,
    },
  }, guest('guest-with-on-device-model'));
  assert.equal(dump()[`reviews/${modeled.reviewId}`].assistantMode, 'on-device-distilbert');
  assert.equal(dump()[`reviews/${modeled.reviewId}`].sentiment, 'positive');

  const untrusted = await handlers.createReview({
    rating: 1,
    gameId: 'arcade',
    message: 'Broken, laggy and frustrating.',
    pretrainedPrediction: {
      modelId: 'some-other-model',
      revision: ON_DEVICE_REVIEW_MODEL_REVISION,
      sentiment: 'positive',
      confidence: 0.99,
    },
  }, guest('guest-with-invalid-model'));
  assert.notEqual(dump()[`reviews/${untrusted.reviewId}`].assistantMode, 'on-device-distilbert');

  await assert.rejects(
    () => handlers.createReview({ rating: 0, message: 'This text is long enough', gameId: 'arcade' }, guest('guest-invalid')),
    (error) => error.code === 'invalid-review-rating',
  );
  await assert.rejects(
    () => handlers.createReview({ rating: 5, message: 'Too short', gameId: 'not-a-game' }, guest('guest-invalid')),
    (error) => error.code === 'invalid-review-game',
  );
  await assert.rejects(
    () => handlers.createReview({ rating: 5, message: '  no  ', gameId: 'arcade' }, guest('guest-invalid')),
    (error) => error.code === 'review-too-short',
  );
  await assert.rejects(
    () => handlers.createReview({ rating: 5, message: 'This should not be anonymous', gameId: 'arcade' }, { uid: '' }),
    (error) => error.code === 'unauthenticated',
  );
});

test('review submission is rate-limited per account', async () => {
  const { handlers, dump } = backend();
  const reviewer = guest('guest-review-limit');
  for (let attempt = 0; attempt < RATE_LIMITS.review.max; attempt += 1) {
    await handlers.createReview({ rating: 4, gameId: 'arcade', message: `Review number ${attempt} was pretty fun.` }, reviewer);
  }
  await assert.rejects(
    () => handlers.createReview({ rating: 4, gameId: 'arcade', message: 'One too many review submissions.' }, reviewer),
    (error) => error.code === 'rate-limited',
  );
  assert.equal(Object.keys(dump()).filter((path) => path.startsWith('reviews/')).length, RATE_LIMITS.review.max);
});

test('only admins can label reviews and distill the local model from real corrected reviews', async () => {
  const { handlers, store, dump } = backend();
  const sources = [
    ['review-positive-a', 'Great smooth polished game that I love', 'positive'],
    ['review-positive-b', 'Fun awesome excellent and responsive', 'positive'],
    ['review-negative-a', 'Broken laggy confusing and frustrating', 'negative'],
    ['review-negative-b', 'Bad clunky slow controls with crashes', 'negative'],
  ];
  const reviewIds = [];
  for (let index = 0; index < sources.length; index += 1) {
    const [uid, message, label] = sources[index];
    const result = await handlers.createReview({ rating: label === 'positive' ? 5 : 1, gameId: 'arcade', message }, guest(uid));
    reviewIds.push({ id: result.reviewId, label });
  }
  await assert.rejects(
    () => handlers.adminLabelReview({ reviewId: reviewIds[0].id, sentiment: 'positive' }, account('not-admin')),
    (error) => error.code === 'admin-only',
  );
  store.seed('admins/review-admin', { admin: true });
  for (const review of reviewIds) await handlers.adminLabelReview({ reviewId: review.id, sentiment: review.label }, account('review-admin'));
  const trained = await handlers.adminTrainReviewAgent({}, account('review-admin'));
  assert.equal(trained.trainingSize, 4);
  assert.ok(trained.vocabularySize > 0);
  const model = dump()['reviewAgentModels/active'];
  assert.equal(model.trainingSize, 4);
  assert.equal(JSON.stringify(model).includes(sources[0][1]), false, 'distilled weights do not keep source text');
  const next = await handlers.createReview({ rating: 5, gameId: 'arcade', message: 'Polished smooth enjoyable game' }, guest('review-after-training'));
  assert.equal(dump()[`reviews/${next.reviewId}`].assistantMode, 'distilled-model');
});

test('account deletion removes authored public reviews and clears a model distilled from them', async () => {
  const { handlers, store, dump } = backend();
  await makeAccounts(handlers, [['review-owner', 'reviewowner']]);
  const review = await handlers.createReview({ rating: 5, gameId: 'arcade', message: 'A great, fun arcade experience.' }, account('review-owner'));
  store.seed('reviewAnnotations/labelled-review', { sentiment: 'positive', createdByUid: 'some-admin' });
  store.seed('reviewAgentModels/active', { classes: ['positive', 'negative'], weights: { positive: { great: -0.1 } } });
  // A label attached to the owner's review is removed with the review, not left as orphan training data.
  store.seed(`reviewAnnotations/${review.reviewId}`, { sentiment: 'positive', createdByUid: 'some-admin' });
  const removed = await handlers.deleteAccount({ confirm: true }, account('review-owner'));
  assert.equal(removed.reviews, 1);
  assert.equal(dump()[`reviews/${review.reviewId}`], undefined);
  assert.equal(dump()[`reviewOwners/${review.reviewId}`], undefined);
  assert.equal(dump()[`reviewAnnotations/${review.reviewId}`], undefined);
  assert.equal(dump()['reviewAgentModels/active'], undefined);
  assert.ok(dump()['reviewAnnotations/labelled-review'], 'another review’s annotation is not removed');
});

test('account deletion removes the profile, username, social data and waiting rooms, and deletes the auth user', async () => {
  const { handlers, dump, deletedUsers, store } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const request = await handlers.sendFriendRequest({ username: 'bob' }, account('uid-a'));
  await handlers.respondFriendRequest({ requestId: request.requestId, accept: true }, account('uid-b'));
  const room = await handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 2 }, account('uid-a'));
  const invite = await handlers.createGameInvite({ roomId: room.roomId, toUid: 'uid-b' }, account('uid-a'));
  store.seed(`rooms/${room.roomId}/presence/uid-a`, { status: 'here', lastSeenAtMs: NOW });
  store.seed(`rooms/${room.roomId}/views/uid-a`, { myShips: [] });
  const result = await handlers.deleteAccount({ confirm: true }, account('uid-a'));
  assert.equal(result.deleted, true);
  assert.equal(result.profile, true);
  assert.ok(result.friendships >= 1 && result.invites >= 1 && result.rooms >= 1);
  const after = dump();
  assert.equal(after['profiles/uid-a'], undefined);
  assert.equal(after['usernames/alice'], undefined, 'the username reservation is freed');
  assert.equal(after['friendships/uid-a_uid-b'], undefined);
  assert.equal(after[`gameInvites/${invite.inviteId}`], undefined);
  assert.equal(after[`rooms/${room.roomId}`], undefined, 'a waiting room whose host leaves is gone');
  assert.equal(after[`rooms/${room.roomId}/presence/uid-a`], undefined);
  assert.equal(after[`rooms/${room.roomId}/views/uid-a`], undefined);
  assert.deepEqual(deletedUsers, ['uid-a'], 'the Firebase Auth user is removed with the data');
});

test('a running match keeps its seat when a player deletes their account', async () => {
  const { handlers, dump, store } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'pixel-tac-toe' });
  store.seed('admins/uid-a', { admin: true });
  store.seed('admins/uid-b', { admin: true });
  await handlers.deleteAccount({ confirm: true }, account('uid-a'));
  const after = dump()[`rooms/${room.roomId}`];
  assert.ok(after, 'the room survives for the other player');
  assert.deepEqual(after.playerUids, ['uid-a', 'uid-b'], 'but the seat is not given to a newcomer mid-match');
  assert.equal(after.state.turnUid === undefined ? 'uid-b' : after.state.turnUid, 'uid-a', 'the seat still belongs to the deleted account until the room expires');
});

test('account deletion refuses a missing confirmation, a stale session and the last admin', async () => {
  const { handlers, store } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice']]);
  await assert.rejects(() => handlers.deleteAccount({}, account('uid-a')), (error) => error.code === 'confirm-required');
  const stale = { uid: 'uid-a', token: { firebase: { sign_in_provider: 'google.com' }, auth_time: Math.floor((NOW - RECENT_AUTH_WINDOW_MS - 1000) / 1000) } };
  await assert.rejects(() => handlers.deleteAccount({ confirm: true }, stale), (error) => error.code === 'recent-login-required');
  store.seed('admins/uid-a', { admin: true });
  await assert.rejects(() => handlers.deleteAccount({ confirm: true }, account('uid-a')), (error) => error.code === 'last-admin');
  assert.ok(store.dump()['profiles/uid-a'], 'nothing was deleted');
});

test('an admin can delete their own account once another admin exists', async () => {
  const { handlers, store, deletedUsers } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  store.seed('admins/uid-a', { admin: true });
  store.seed('admins/uid-b', { admin: true });
  const result = await handlers.deleteAccount({ confirm: true }, account('uid-a'));
  assert.equal(result.deleted, true);
  assert.deepEqual(deletedUsers, ['uid-a']);
  assert.equal(store.dump()['admins/uid-a'], undefined, 'the admin flag goes with the account');
  assert.ok(store.dump()['admins/uid-b'], 'the surviving admin keeps the installation administrable');
});

test('admin actions require an admin flag the server can see', async () => {
  const { handlers, store, dump } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob'], ['uid-c', 'carol']]);
  const room = await handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 3 }, account('uid-a'));
  await handlers.joinRoom({ roomId: room.roomId }, account('uid-b'));
  await assert.rejects(
    () => handlers.adminRoomAction({ roomId: room.roomId, action: 'kick', uid: 'uid-b' }, account('uid-a')),
    (error) => error.code === 'admin-only',
  );
  store.seed('admins/uid-c', { admin: true });
  const kicked = await handlers.adminRoomAction({ roomId: room.roomId, action: 'kick', uid: 'uid-b' }, account('uid-c'));
  assert.equal(kicked.kicked, 'uid-b');
  assert.deepEqual(dump()[`rooms/${room.roomId}`].playerUids, ['uid-a']);
  const closed = await handlers.adminRoomAction({ roomId: room.roomId, action: 'close' }, account('uid-c'));
  assert.equal(closed.closed, true);
  assert.equal(dump()[`rooms/${room.roomId}`], undefined);
  assert.equal(dump()[`rooms/${room.roomId}/secrets/engine`], undefined, 'closing a room takes its private state with it');
  await assert.rejects(
    () => handlers.adminRemovePlayer({ uid: 'uid-a' }, account('uid-b')),
    (error) => error.code === 'admin-only',
  );
  const removed = await handlers.adminRemovePlayer({ uid: 'uid-b' }, account('uid-c'));
  assert.equal(removed.hadProfile, true);
  assert.equal(dump()['profiles/uid-b'], undefined);
  assert.equal(dump()['usernames/bob'], undefined, 'the username is freed for reuse');
});

// ── Cleanup ──────────────────────────────────────────────────────────────────────────────────────

test('cleanup deletes expired rooms with their private data, and is safe to run twice', async () => {
  const { handlers, dump, advance, store } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const playing = await lobby(handlers, { gameId: 'sea-battle' });
  const waiting = await handlers.createRoom({ gameId: 'pixel-tac-toe', maxPlayers: 2 }, account('uid-a'));
  await handlers.sendFriendRequest({ username: 'bob' }, account('uid-a'));
  store.seed(`rooms/${playing.roomId}/presence/uid-a`, { status: 'left', lastSeenAtMs: NOW });
  advance(TTL_MS + 60_000);

  const first = await cleanupExpiredData({ store, nowMs: NOW + TTL_MS + 60_000 });
  assert.equal(first.expiredRooms, 2);
  assert.equal(first.requests, 0, 'a fresh friend request is left alone');
  const after = dump();
  assert.equal(after[`rooms/${playing.roomId}`], undefined);
  assert.equal(after[`rooms/${playing.roomId}/secrets/engine`], undefined);
  assert.equal(after[`rooms/${playing.roomId}/views/uid-a`], undefined);
  assert.equal(after[`rooms/${playing.roomId}/presence/uid-a`], undefined);
  assert.equal(after[`rooms/${waiting.roomId}`], undefined);

  const second = await cleanupExpiredData({ store, nowMs: NOW + TTL_MS + 60_000 });
  assert.deepEqual(
    { rooms: second.expiredRooms, requests: second.requests },
    { rooms: 0, requests: 0 },
    'a retry does not fail on already-deleted documents',
  );
});

test('cleanup prunes stale requests, invites, rate-limit documents, reports and community reviews', async () => {
  const { store, dump } = backend();
  const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
  store.seed('friendRequests/old_1', { fromUid: 'old', toUid: '1', status: 'pending', createdAtMs: NOW - thirtyOneDays });
  store.seed('friendRequests/new_1', { fromUid: 'new', toUid: '1', status: 'pending', createdAtMs: NOW });
  store.seed('gameInvites/old_1', { roomId: 'gone', createdAtMs: NOW - 3 * 60 * 60 * 1000 });
  store.seed('rateLimits/uid-old', { buckets: { createRoom: { windowStart: NOW - 5 * 24 * 60 * 60 * 1000, count: 3 } }, updatedAtMs: NOW - 5 * 24 * 60 * 60 * 1000 });
  store.seed('rateLimits/uid-new', { buckets: { createRoom: { windowStart: NOW, count: 1 } }, updatedAtMs: NOW });
  store.seed('reports/ancient', { reporterUid: 'uid-a', message: 'old', createdAtMs: NOW - 200 * 24 * 60 * 60 * 1000 });
  store.seed('reviews/ancient', { reviewerName: 'Old player', message: 'expired', createdAtMs: NOW - 400 * 24 * 60 * 60 * 1000 });
  store.seed('reviewOwners/ancient', { ownerUid: 'uid-old' });
  store.seed('reviewAnnotations/ancient', { sentiment: 'negative' });
  store.seed('reviewAgentModels/active', { classes: ['positive', 'negative'], weights: {} });
  const summary = await cleanupExpiredData({ store, nowMs: NOW });
  assert.deepEqual(
    { invites: summary.invites, requests: summary.requests, rateLimits: summary.rateLimits, reports: summary.reports, reviews: summary.reviews },
    { invites: 1, requests: 1, rateLimits: 1, reports: 1, reviews: 1 },
  );
  const after = dump();
  assert.ok(after['friendRequests/new_1'], 'a current request survives');
  assert.ok(after['rateLimits/uid-new'], 'a current rate-limit document survives');
  assert.equal(after['reports/ancient'], undefined);
  assert.equal(after['reviews/ancient'], undefined);
  assert.equal(after['reviewOwners/ancient'], undefined);
  assert.equal(after['reviewAnnotations/ancient'], undefined);
  assert.equal(after['reviewAgentModels/active'], undefined, 'an expired source review resets the compact model');
});

test('cleanup leaves a live room alone and purges one room on demand', async () => {
  const { handlers, store, dump, advance } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'pixel-tac-toe' });
  advance(10 * 60 * 1000);
  const summary = await cleanupExpiredData({ store, nowMs: NOW + 10 * 60 * 1000 });
  assert.equal(summary.expiredRooms, 0);
  assert.ok(dump()[`rooms/${room.roomId}`]);
  const purged = await purgeRoom(store, room.roomId);
  assert.equal(purged.roomId, room.roomId);
  assert.equal(dump()[`rooms/${room.roomId}`], undefined);
  assert.equal(dump()[`rooms/${room.roomId}/secrets/engine`], undefined);
  assert.equal((await purgeRoom(store, room.roomId)).roomId, room.roomId, 'purging twice is not an error');
});

test('a finished room is kept for the rematch window then cleaned up', async () => {
  const { handlers, store, dump, advance } = backend();
  await makeAccounts(handlers, [['uid-a', 'alice'], ['uid-b', 'bob']]);
  const room = await lobby(handlers, { gameId: 'pixel-tap' });
  await handlers.playMove({ roomId: room.roomId, action: { type: 'tap', count: 16 }, clientActionId: 'tap-1' }, account('uid-a'));
  advance(2 * 60 * 1000);
  const early = await cleanupExpiredData({ store, nowMs: NOW + 2 * 60 * 1000 });
  assert.equal(early.finishedRooms, 0, 'the rematch button still works for ten minutes');
  assert.ok(dump()[`rooms/${room.roomId}`]);
  advance(20 * 60 * 1000);
  const later = await cleanupExpiredData({ store, nowMs: NOW + 22 * 60 * 1000 });
  assert.equal(later.finishedRooms, 1);
  assert.equal(dump()[`rooms/${room.roomId}`], undefined);
});

test('the whole catalog can be created, joined, started and left without an engine error', async () => {
  const { handlers, dump } = backend();
  let seat = 0;
  for (const game of GAMES) {
    seat += 1;
    const host = `host-${seat}`;
    const room = await handlers.createRoom({ gameId: game.id, maxPlayers: 3, displayName: 'Host' }, account(host));
    await handlers.joinRoom({ roomId: room.roomId, displayName: 'Rival one' }, account(`rival-${seat}-a`));
    await handlers.joinRoom({ roomId: room.roomId, displayName: 'Rival two' }, account(`rival-${seat}-b`));
    await handlers.startRoom({ roomId: room.roomId }, account(host));
    assert.equal(dump()[`rooms/${room.roomId}`].status, 'playing', `${game.id} starts`);
    const left = await handlers.leaveRoom({ roomId: room.roomId }, account(`rival-${seat}-a`));
    assert.equal(left.deleted, false, `${game.id} keeps running when a player leaves`);
  }
});
