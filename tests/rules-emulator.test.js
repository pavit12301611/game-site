/**
 * Real Firestore security-rule tests, run against the Firestore emulator.
 *
 *   npm run test:rules      # starts the emulator, runs this file, shuts the emulator down
 *   npm run emulators       # leave it running, then: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test
 *
 * Needs Java on the PATH (the emulator is a JVM app) and the dev dependencies installed. When no
 * emulator answers, every test here is skipped instead of failing, so `npm test` stays green on
 * machines that only run the unit tests. CI installs Java and runs the real thing on every PR.
 *
 * These tests cover behaviour the app depends on, not individual lines of firestore.rules: who may
 * claim a username, how a room join works, and which fields nobody may rewrite.
 */
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const PROJECT_ID = 'psd-gaming-rules';
const ALICE = 'uid-alice';
const BOB = 'uid-bob';
const CAROL = 'uid-carol';

/** Where `firebase emulators:exec` says Firestore lives. */
function emulatorTarget() {
  const raw = String(process.env.FIRESTORE_EMULATOR_HOST || '').trim();
  if (!raw) return { host: '127.0.0.1', port: 8080 };
  const [host, port] = raw.split(':');
  return { host: host || '127.0.0.1', port: Number(port) || 8080 };
}

function canReach({ host, port }, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

const target = emulatorTarget();
/**
 * `firebase emulators:exec` (behind `npm run test:rules`, which is what CI runs) exports
 * FIRESTORE_EMULATOR_HOST. When it is set, "no emulator" is a failure, not a skip: the rules job
 * must never go green because every test in this file quietly skipped.
 */
const EMULATOR_EXPECTED = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let emulatorReady = false;
let skippedRuleTests = 0;
let testEnv = null;
let ruts = null;

const ts = () => serverTimestamp();

before(async () => {
  if (!(await canReach(target))) {
    if (EMULATOR_EXPECTED) throw new Error(`FIRESTORE_EMULATOR_HOST is set to ${target.host}:${target.port} but nothing answers there: the emulator did not start, so these tests must not be skipped.`);
    return;
  }
  try {
    ruts = await import('@firebase/rules-unit-testing');
  } catch (error) {
    if (EMULATOR_EXPECTED) throw error;
    return; // dev dependencies are not installed here: skip instead of failing the suite
  }
  testEnv = await ruts.initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: target.host, port: target.port },
  });
  emulatorReady = true;
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

after(async (t) => {
  if (testEnv) await testEnv.cleanup();
  if (!emulatorReady && !EMULATOR_EXPECTED && skippedRuleTests) {
    t.diagnostic(`NOTE: ${skippedRuleTests} Firestore rules tests skipped (no emulator on ${target.host}:${target.port}) — run \`npm run test:rules\` (needs Java) or rely on the firestore-rules CI job.`);
  }
});

/** Skips the test with a clear reason when there is no emulator to test against. */
function ready(t) {
  if (emulatorReady) return true;
  skippedRuleTests += 1;
  t.skip(`No Firestore emulator on ${target.host}:${target.port} — run "npm run test:rules" (needs Java).`);
  return false;
}

/** Seeds documents with the security rules switched off, so a test starts from a known world. */
function seed(build) {
  return testEnv.withSecurityRulesDisabled(async (context) => build(context.firestore()));
}

/** The two documents a new account writes, in one batch, when it claims a username. */
function profileBatch(db, uid, username) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', username), { uid, username, createdAt: ts() });
  batch.set(doc(db, 'profiles', uid), { uid, username, usernameLower: username, createdAt: ts() });
  return batch;
}

function waitingRoom(uid, name = 'Alice', maxPlayers = 2) {
  return {
    hostUid: uid,
    hostName: name,
    gameId: 'pixel-tac-toe',
    playerUids: [uid],
    playerNames: { [uid]: name },
    maxPlayers,
    status: 'waiting',
    state: { phase: 'playing', turnUid: uid, moves: 0 },
    createdAt: ts(),
    updatedAt: ts(),
  };
}

test('a visitor who is not signed in can read nothing', async (t) => {
  if (!ready(t)) return;
  const guest = testEnv.unauthenticatedContext().firestore();
  await assert.rejects(getDoc(doc(guest, 'profiles', ALICE)), /permission|denied/i);
  await ruts.assertFails(setDoc(doc(guest, 'rooms', 'r1'), waitingRoom(ALICE)));
});

test('a player claims a username together with its profile, atomically', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  await ruts.assertSucceeds(profileBatch(alice, ALICE, 'alice').commit());
  const claim = await getDoc(doc(alice, 'usernames', 'alice'));
  assert.equal(claim.data().uid, ALICE);
  const profile = await getDoc(doc(alice, 'profiles', ALICE));
  assert.equal(profile.data().usernameLower, 'alice');
});

test('a username reservation without the matching profile is refused', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  await ruts.assertFails(setDoc(doc(alice, 'usernames', 'solo'), { uid: ALICE, username: 'solo', createdAt: ts() }));
});

test('a profile must be your own, with a valid username and a closed field list', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  await ruts.assertFails(profileBatch(alice, BOB, 'bob').commit(), 'nobody creates another player profile');
  await ruts.assertFails(profileBatch(alice, ALICE, 'ab').commit(), 'usernames are at least three characters');
  await ruts.assertFails(profileBatch(alice, ALICE, 'not valid').commit(), 'letters, numbers and underscores only');
  await ruts.assertFails(
    setDoc(doc(alice, 'profiles', ALICE), { uid: ALICE, username: 'alice', usernameLower: 'alice', createdAt: ts(), isAdmin: true }),
    'extra fields are refused',
  );
});

test('a claimed username can never be claimed again', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await ruts.assertSucceeds(profileBatch(alice, ALICE, 'alice').commit());
  await ruts.assertFails(profileBatch(bob, BOB, 'alice').commit());
});

test('the only editable field on a profile is lastSeenAt', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  await ruts.assertSucceeds(profileBatch(alice, ALICE, 'alice').commit());
  await ruts.assertSucceeds(updateDoc(doc(alice, 'profiles', ALICE), { lastSeenAt: ts() }));
  await ruts.assertFails(updateDoc(doc(alice, 'profiles', ALICE), { username: 'alice2' }));
  await ruts.assertFails(deleteDoc(doc(alice, 'profiles', ALICE)));
});

test('admin flags are read-only, and only their owner can read them', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await seed(async (db) => setDoc(doc(db, 'admins', ALICE), { admin: true }));
  await ruts.assertSucceeds(getDoc(doc(alice, 'admins', ALICE)));
  await ruts.assertFails(getDoc(doc(bob, 'admins', ALICE)));
  await ruts.assertFails(setDoc(doc(alice, 'admins', ALICE), { admin: true }));
});

test('a host can open a private room for two or three players', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'room-2'), waitingRoom(ALICE, 'Alice', 2)));
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'room-3'), waitingRoom(ALICE, 'Alice', 3)));
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'room-4'), waitingRoom(ALICE, 'Alice', 4)));
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'room-1'), waitingRoom(ALICE, 'Alice', 1)));
});

test('a new room starts waiting, with only the host in it', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const room = waitingRoom(ALICE);
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'two-uids'), {
    ...room,
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice' },
  }));
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'not-host'), { ...room, hostUid: BOB }));
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'started'), { ...room, status: 'playing' }));
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'extra'), { ...room, isPublic: true }));
});

test('a waiting room opens by link, a running one stays private to its players', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  const carol = testEnv.authenticatedContext(CAROL).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'open'), waitingRoom(ALICE)));
  await ruts.assertSucceeds(getDoc(doc(bob, 'rooms', 'open')), 'the invite link is what makes a room findable');
  await seed(async (db) => setDoc(doc(db, 'rooms', 'running'), {
    ...waitingRoom(ALICE),
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
    status: 'playing',
  }));
  const asBob = await getDoc(doc(bob, 'rooms', 'running'));
  assert.equal(asBob.data().status, 'playing', 'a player in the match can still read it');
  await assert.rejects(getDoc(doc(carol, 'rooms', 'running')), /permission|denied/i, 'everyone else cannot');
});

test('rooms can never be listed, only opened by their id', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'listed'), waitingRoom(ALICE)));
  await ruts.assertFails(getDocs(collection(alice, 'rooms')));
});

test('a join adds exactly one player, up to the room size', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  const carol = testEnv.authenticatedContext(CAROL).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'join-2'), waitingRoom(ALICE, 'Alice', 2)));
  await ruts.assertSucceeds(updateDoc(doc(bob, 'rooms', 'join-2'), {
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
    state: { phase: 'playing', turnUid: ALICE, moves: 0 },
    updatedAt: ts(),
  }));
  await ruts.assertFails(updateDoc(doc(carol, 'rooms', 'join-2'), {
    playerUids: [ALICE, BOB, CAROL],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob', [CAROL]: 'Carol' },
    state: { phase: 'playing' },
    updatedAt: ts(),
  }), 'the room only seats two');
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'join-2'), {
    playerUids: [ALICE, BOB, CAROL],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob', [CAROL]: 'Carol' },
    state: { phase: 'playing' },
    updatedAt: ts(),
  }), 'the host cannot add a third seat to a two-player room');
});

test('a join touches nothing but the player list and the game state', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'join-clean'), waitingRoom(ALICE)));
  await ruts.assertFails(updateDoc(doc(bob, 'rooms', 'join-clean'), {
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
    state: { phase: 'playing' },
    status: 'playing',
    updatedAt: ts(),
  }), 'only the host starts the match');
  await ruts.assertFails(updateDoc(doc(bob, 'rooms', 'join-clean'), {
    playerUids: [BOB],
    playerNames: { [BOB]: 'Bob' },
    state: { phase: 'playing' },
    updatedAt: ts(),
  }), 'a join cannot remove the host');
});

test('only the host can start a match, and only once someone has joined', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'start'), waitingRoom(ALICE)));
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'start'), { status: 'playing', updatedAt: ts() }), 'nobody has joined yet');
  await ruts.assertSucceeds(updateDoc(doc(bob, 'rooms', 'start'), {
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
    state: { phase: 'playing', moves: 0 },
    updatedAt: ts(),
  }));
  await ruts.assertFails(updateDoc(doc(bob, 'rooms', 'start'), { status: 'playing', updatedAt: ts() }), 'only the host starts');
  await ruts.assertSucceeds(updateDoc(doc(alice, 'rooms', 'start'), { status: 'playing', updatedAt: ts() }));
});

test('players may move, but nobody may rewrite the room around them', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await seed(async (db) => setDoc(doc(db, 'rooms', 'live'), {
    ...waitingRoom(ALICE),
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
    status: 'playing',
  }));
  await ruts.assertSucceeds(updateDoc(doc(bob, 'rooms', 'live'), { state: { phase: 'playing', moves: 1 }, updatedAt: ts() }));
  await ruts.assertFails(updateDoc(doc(bob, 'rooms', 'live'), {
    status: 'playing',
    winnerUid: BOB,
    updatedAt: ts(),
  }), 'a player cannot set the winner while the match is still playing');
  await ruts.assertFails(updateDoc(doc(bob, 'rooms', 'live'), {
    playerNames: { [ALICE]: 'Alicia', [BOB]: 'Bob' },
    updatedAt: ts(),
  }), 'a player cannot rename another player during a move');
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'live'), { hostUid: BOB, updatedAt: ts() }), 'the host is not handed to another player mid-match');
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'live'), { maxPlayers: 3, updatedAt: ts() }));
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'live'), { gameId: 'connect-four', updatedAt: ts() }));
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'live'), { playerUids: [ALICE], updatedAt: ts() }), 'nobody is dropped mid-match');
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'live'), { status: 'finished', winnerUid: BOB, updatedAt: ts() }), 'a match cannot be closed while the game is still running');
  await ruts.assertSucceeds(updateDoc(doc(alice, 'rooms', 'live'), {
    state: { phase: 'finished', moves: 2 },
    status: 'finished',
    winnerUid: BOB,
    updatedAt: ts(),
  }), 'a finished game closes the room');
  await ruts.assertFails(updateDoc(doc(bob, 'rooms', 'live'), { status: 'playing', updatedAt: ts() }), 'a finished room is not reopened without a fresh game');
  await ruts.assertSucceeds(updateDoc(doc(alice, 'rooms', 'live'), {
    state: { phase: 'playing', moves: 0 },
    status: 'playing',
    updatedAt: ts(),
  }), 'a finished match can be played again');
});

test('the final Tic-Tac-Toe square may finish a drawn room with no winner', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  await seed(async (db) => setDoc(doc(db, 'rooms', 'draw'), {
    ...waitingRoom(ALICE),
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
    status: 'playing',
    state: {
      phase: 'playing',
      board: [ALICE, ALICE, BOB, BOB, BOB, ALICE, ALICE, BOB, null],
      size: 3,
      connect: 3,
      moves: 8,
    },
  }));
  await ruts.assertSucceeds(updateDoc(doc(alice, 'rooms', 'draw'), {
    state: {
      phase: 'finished',
      board: [ALICE, ALICE, BOB, BOB, BOB, ALICE, ALICE, BOB, ALICE],
      size: 3,
      connect: 3,
      moves: 9,
      winnerUid: null,
      result: 'draw',
    },
    status: 'finished',
    winnerUid: null,
    updatedAt: ts(),
  }));
});

test('updatedAt must be the server clock, never a client one', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'clock'), waitingRoom(ALICE)));
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'clock'), { status: 'playing', updatedAt: new Date('2020-01-01') }));
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'clock-2'), { ...waitingRoom(ALICE), updatedAt: new Date('2030-01-01') }));
});

test('only the host may delete a waiting room', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'doomed'), waitingRoom(ALICE)));
  await ruts.assertFails(deleteDoc(doc(bob, 'rooms', 'doomed')));
  await ruts.assertSucceeds(deleteDoc(doc(alice, 'rooms', 'doomed')));
});

test('a waiting room gives your seat back when you leave, and goes away with the last player', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  const carol = testEnv.authenticatedContext(CAROL).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'leave'), waitingRoom(ALICE)));
  await ruts.assertSucceeds(updateDoc(doc(bob, 'rooms', 'leave'), {
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
    state: { phase: 'playing', moves: 0 },
    updatedAt: ts(),
  }));
  // You may only take yourself out: not the host, and not by swapping in somebody else.
  await ruts.assertFails(updateDoc(doc(bob, 'rooms', 'leave'), {
    playerUids: [BOB],
    playerNames: { [BOB]: 'Bob' },
    updatedAt: ts(),
  }), 'nobody else is removed from a room');
  await ruts.assertFails(updateDoc(doc(bob, 'rooms', 'leave'), {
    playerUids: [ALICE, CAROL],
    playerNames: { [ALICE]: 'Alice', [CAROL]: 'Carol' },
    updatedAt: ts(),
  }), 'a seat is not handed to a different player');
  // Leaving releases the seat, so the link works for the next person again.
  await ruts.assertSucceeds(updateDoc(doc(bob, 'rooms', 'leave'), {
    playerUids: [ALICE],
    playerNames: { [ALICE]: 'Alice' },
    updatedAt: ts(),
  }));
  await ruts.assertSucceeds(deleteDoc(doc(alice, 'rooms', 'leave')), 'the last player takes the empty room with them');
  // A room you are not in is not yours to delete, even when it is empty.
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'keep'), waitingRoom(ALICE)));
  await ruts.assertFails(deleteDoc(doc(carol, 'rooms', 'keep')));
});

test('a missing friend request or game invite reads as not-found for a signed-in player', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const request = await getDoc(doc(alice, 'friendRequests', 'missing'));
  const invite = await getDoc(doc(alice, 'gameInvites', 'missing'));
  assert.equal(request.exists(), false);
  assert.equal(invite.exists(), false);
});

test('friend requests need a real recipient and an honest sender', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  await seed(async (db) => profileBatch(db, BOB, 'bob').commit());
  const request = { fromUid: ALICE, toUid: BOB, fromName: 'alice', toName: 'bob', status: 'pending', createdAt: ts() };
  await ruts.assertSucceeds(setDoc(doc(alice, 'friendRequests', 'r1'), request));
  await ruts.assertFails(setDoc(doc(alice, 'friendRequests', 'r2'), { ...request, fromUid: BOB }), 'the sender must be you');
  await ruts.assertFails(setDoc(doc(alice, 'friendRequests', 'r3'), { ...request, toUid: ALICE }), 'you cannot befriend yourself');
  await ruts.assertFails(setDoc(doc(alice, 'friendRequests', 'r4'), { ...request, toUid: 'uid-ghost' }), 'the other player must exist');
  await ruts.assertFails(setDoc(doc(alice, 'friendRequests', 'r5'), { ...request, status: 'accepted' }), 'requests start pending');
});

test('a request can only be answered by the player who received it', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await seed(async (db) => {
    await profileBatch(db, BOB, 'bob').commit();
    await setDoc(doc(db, 'friendRequests', 'r1'), {
      fromUid: ALICE,
      toUid: BOB,
      fromName: 'alice',
      toName: 'bob',
      status: 'pending',
      createdAt: ts(),
    });
  });
  await ruts.assertFails(updateDoc(doc(alice, 'friendRequests', 'r1'), { status: 'accepted', respondedAt: ts() }));
  await ruts.assertSucceeds(updateDoc(doc(bob, 'friendRequests', 'r1'), { status: 'accepted', respondedAt: ts() }));
  await ruts.assertFails(updateDoc(doc(bob, 'friendRequests', 'r1'), { status: 'pending', respondedAt: ts() }), 'an answer is final');
});

test('a friendship only appears by accepting a request, in the same write', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await seed(async (db) => {
    await profileBatch(db, BOB, 'bob').commit();
    await setDoc(doc(db, 'friendRequests', 'r1'), {
      fromUid: ALICE,
      toUid: BOB,
      fromName: 'alice',
      toName: 'bob',
      status: 'pending',
      createdAt: ts(),
    });
  });
  const friendship = {
    memberUids: [ALICE, BOB],
    memberNames: { [ALICE]: 'alice', [BOB]: 'bob' },
    requestId: 'r1',
    createdAt: ts(),
  };
  await ruts.assertFails(setDoc(doc(bob, 'friendships', 'uid-alice_uid-bob'), friendship), 'the request is still pending');
  const batch = writeBatch(bob);
  batch.update(doc(bob, 'friendRequests', 'r1'), { status: 'accepted', respondedAt: ts() });
  batch.set(doc(bob, 'friendships', 'uid-alice_uid-bob'), friendship);
  await ruts.assertSucceeds(batch.commit());
  const both = await getDoc(doc(alice, 'friendships', 'uid-alice_uid-bob'));
  assert.equal(both.exists(), true, 'both players can read the friendship');
});

test('game invites need a real friendship and a room you host', async (t) => {
  if (!ready(t)) return;
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await seed(async (db) => {
    await profileBatch(db, BOB, 'bob').commit();
    await setDoc(doc(db, 'friendships', 'uid-alice_uid-bob'), {
      memberUids: [ALICE, BOB],
      memberNames: { [ALICE]: 'alice', [BOB]: 'bob' },
      requestId: 'r1',
      createdAt: ts(),
    });
    await setDoc(doc(db, 'rooms', 'mine'), waitingRoom(ALICE));
    await setDoc(doc(db, 'rooms', 'theirs'), waitingRoom(BOB, 'Bob'));
  });
  const invite = {
    fromUid: ALICE,
    toUid: BOB,
    fromName: 'alice',
    toName: 'bob',
    friendshipId: 'uid-alice_uid-bob',
    roomId: 'mine',
    gameId: 'pixel-tac-toe',
    status: 'pending',
    createdAt: ts(),
  };
  await ruts.assertSucceeds(setDoc(doc(alice, 'gameInvites', 'i1'), invite));
  await ruts.assertFails(setDoc(doc(alice, 'gameInvites', 'i2'), { ...invite, roomId: 'theirs' }), 'you must host the room you invite to');
  await ruts.assertFails(setDoc(doc(alice, 'gameInvites', 'i3'), { ...invite, friendshipId: 'nope' }), 'the friendship must be real');
  await ruts.assertFails(setDoc(doc(bob, 'gameInvites', 'i4'), invite), 'the sender must be you');
  await ruts.assertSucceeds(updateDoc(doc(bob, 'gameInvites', 'i1'), { status: 'accepted', respondedAt: ts() }));
});

/** The heartbeat document src/online/presence.js writes. */
function heartbeat(status = 'here') {
  return { status, lastSeenAt: ts() };
}

/** A two-player room with Alice (host) and Bob in it, seeded with the rules off. */
async function seedPair(roomId, status = 'waiting') {
  await seed(async (db) => setDoc(doc(db, 'rooms', roomId), {
    ...waitingRoom(ALICE),
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
    status,
  }));
}

test('presence: a member writes their own heartbeat and nobody else\'s', async (t) => {
  if (!ready(t)) return;
  await seedPair('p-own');
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await ruts.assertSucceeds(setDoc(doc(bob, 'rooms', 'p-own', 'presence', BOB), heartbeat()), 'a guest in the room beats');
  await ruts.assertSucceeds(setDoc(doc(bob, 'rooms', 'p-own', 'presence', BOB), heartbeat()), 'and beats again (update)');
  await ruts.assertSucceeds(setDoc(doc(bob, 'rooms', 'p-own', 'presence', BOB), heartbeat('left')), 'and can say they left');
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'p-own', 'presence', ALICE), heartbeat()), 'the host too');
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'p-own', 'presence', BOB), heartbeat('left')), 'the host cannot mark Bob as gone');
  await ruts.assertFails(setDoc(doc(bob, 'rooms', 'p-own', 'presence', ALICE), heartbeat()), 'nor Bob the host as here');
});

test('presence: only room members read or write it, and the room stays unlistable', async (t) => {
  if (!ready(t)) return;
  await seedPair('p-members', 'playing');
  const bob = testEnv.authenticatedContext(BOB).firestore();
  const carol = testEnv.authenticatedContext(CAROL).firestore();
  const guest = testEnv.unauthenticatedContext().firestore();
  await ruts.assertSucceeds(setDoc(doc(bob, 'rooms', 'p-members', 'presence', BOB), heartbeat()));
  await ruts.assertSucceeds(getDocs(collection(bob, 'rooms', 'p-members', 'presence')), 'a member sees everyone\'s heartbeat');
  await ruts.assertSucceeds(getDoc(doc(bob, 'rooms', 'p-members', 'presence', ALICE)), 'even one that does not exist yet (not found, not denied)');
  await ruts.assertFails(setDoc(doc(carol, 'rooms', 'p-members', 'presence', CAROL), heartbeat()), 'someone who is not in the room cannot claim to be');
  await ruts.assertFails(getDocs(collection(carol, 'rooms', 'p-members', 'presence')), 'nor watch who is');
  await ruts.assertFails(getDoc(doc(carol, 'rooms', 'p-members', 'presence', BOB)));
  await ruts.assertFails(setDoc(doc(guest, 'rooms', 'p-members', 'presence', BOB), heartbeat()));
  await ruts.assertFails(getDocs(collection(guest, 'rooms', 'p-members', 'presence')));
  await ruts.assertFails(getDocs(collection(bob, 'rooms')), 'presence does not make rooms listable');
});

test('presence: a heartbeat is exactly { status, lastSeenAt: server time }', async (t) => {
  if (!ready(t)) return;
  await seedPair('p-shape');
  const bob = testEnv.authenticatedContext(BOB).firestore();
  const ref = doc(bob, 'rooms', 'p-shape', 'presence', BOB);
  await ruts.assertFails(setDoc(ref, { status: 'here', lastSeenAt: new Date() }), 'a client clock is not a heartbeat');
  await ruts.assertFails(setDoc(ref, { status: 'here' }), 'the time is required');
  await ruts.assertFails(setDoc(ref, { status: 'typing', lastSeenAt: ts() }), 'only here or left');
  await ruts.assertFails(setDoc(ref, { status: 'here', lastSeenAt: ts(), name: 'Bob' }), 'no extra fields (names live on the room)');
  await ruts.assertFails(setDoc(ref, { status: 'here', lastSeenAt: ts(), uid: ALICE }), 'no impersonation field either');
  await ruts.assertSucceeds(setDoc(ref, heartbeat()));
});

test('presence: you take your heartbeat with you when you leave, also when the room goes', async (t) => {
  if (!ready(t)) return;
  await seedPair('p-leave');
  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const bob = testEnv.authenticatedContext(BOB).firestore();
  await ruts.assertSucceeds(setDoc(doc(alice, 'rooms', 'p-leave', 'presence', ALICE), heartbeat()));
  await ruts.assertSucceeds(setDoc(doc(bob, 'rooms', 'p-leave', 'presence', BOB), heartbeat()));
  await ruts.assertFails(deleteDoc(doc(alice, 'rooms', 'p-leave', 'presence', BOB)), 'the host cannot delete Bob\'s heartbeat');
  // Bob gives his seat back and removes his heartbeat in one batch (what leaveWaitingRoom does).
  const leave = writeBatch(bob);
  leave.update(doc(bob, 'rooms', 'p-leave'), { playerUids: [ALICE], playerNames: { [ALICE]: 'Alice' }, updatedAt: ts() });
  leave.delete(doc(bob, 'rooms', 'p-leave', 'presence', BOB));
  await ruts.assertSucceeds(leave.commit());
  await ruts.assertFails(setDoc(doc(bob, 'rooms', 'p-leave', 'presence', BOB), heartbeat('left')), 'out of the room, out of its presence');
  // Alice, last one in, deletes the room and her heartbeat together: no litter left behind.
  const last = writeBatch(alice);
  last.delete(doc(alice, 'rooms', 'p-leave', 'presence', ALICE));
  last.delete(doc(alice, 'rooms', 'p-leave'));
  await ruts.assertSucceeds(last.commit());
  // And a heartbeat left under a room that is already gone can still be removed by its owner.
  await seed(async (db) => setDoc(doc(db, 'rooms', 'p-gone', 'presence', BOB), { status: 'here', lastSeenAt: ts() }));
  await ruts.assertSucceeds(deleteDoc(doc(bob, 'rooms', 'p-gone', 'presence', BOB)));
  await ruts.assertFails(setDoc(doc(bob, 'rooms', 'p-gone', 'presence', BOB), heartbeat()), 'but not re-created');
});

test('under `npm run test:rules` nothing in this file was skipped', () => {
  if (EMULATOR_EXPECTED) assert.equal(emulatorReady, true, 'the emulator answered and the rules were loaded');
});
