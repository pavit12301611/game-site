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
let emulatorReady = false;
let testEnv = null;
let ruts = null;

const ts = () => serverTimestamp();

before(async () => {
  if (!(await canReach(target))) return;
  try {
    ruts = await import('@firebase/rules-unit-testing');
  } catch {
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

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

/** Skips the test with a clear reason when there is no emulator to test against. */
function ready(t) {
  if (emulatorReady) return true;
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
