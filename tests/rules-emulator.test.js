/**
 * Real Firestore security-rule tests, run against the Firestore emulator.
 *
 *   npm run test:rules      # starts the emulator, runs this file, shuts the emulator down
 *   npm run emulators       # leave it running, then: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test
 *
 * Needs Java on the PATH (the emulator is a JVM app) and the dev dependencies installed. When no
 * emulator answers, every test here is skipped instead of failing, so `npm test` stays green on
 * machines that only run the unit tests. CI installs Java and runs the real thing on every PR - and
 * `FIRESTORE_EMULATOR_HOST` being set turns "no emulator" into a failure, so the job cannot go green
 * by skipping.
 *
 * These tests cover the promises the product makes, not individual lines of `firestore.rules`:
 *
 *   - a profile is private (owner and admins only) and the player directory cannot be listed or
 *     scraped, by a guest or by a registered player;
 *   - a room is readable by its members and by nobody else, and **no client writes rooms, secrets or
 *     private views at all** - those go through callable Cloud Functions with the Admin SDK;
 *   - social documents are readable by their participants and writable by nobody;
 *   - the two client-writable exceptions stay narrow: presence heartbeats (your own) and admin
 *     access management.
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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const PROJECT_ID = 'psd-gaming-rules';
const ALICE = 'uid-alice';
const BOB = 'uid-bob';
const CAROL = 'uid-carol';
const GUEST = 'uid-guest';

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
 * FIRESTORE_EMULATOR_HOST. When it is set, "no emulator" is a failure, not a skip.
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

/** The two documents the backend's `claimUsername` writes, in one batch. */
function claimBatch(db, uid, username) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', username), { uid, username, usernameLower: username, createdAtMs: 1 });
  batch.set(doc(db, 'profiles', uid), { uid, username, usernameLower: username, createdAtMs: 1 });
  return batch;
}

/** A waiting room whose host is `uid`, written by the backend (rules off). */
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
    code: 'ABCDEFG',
    backend: 1,
    revision: 1,
    createdAt: ts(),
    updatedAt: ts(),
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
}

const asUser = (uid) => testEnv.authenticatedContext(uid).firestore();
const asGuest = () => testEnv.authenticatedContext(GUEST, { firebase: { sign_in_provider: 'anonymous' } }).firestore();

// ── Profiles are private ────────────────────────────────────────────────────────────────────────

test('a signed-out visitor can read public reviews, but no private player or room data', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await claimBatch(db, ALICE, 'alice').commit();
    await setDoc(doc(db, 'rooms', 'r1'), waitingRoom(ALICE));
    await setDoc(doc(db, 'reviews', 'review-1'), { reviewerName: 'Pixel player', rating: 5, message: 'Great arcade games.', assistantReply: 'Thanks for the note!', createdAtMs: 1 });
  });
  const anon = testEnv.unauthenticatedContext().firestore();
  await ruts.assertSucceeds(getDoc(doc(anon, 'reviews', 'review-1')));
  await ruts.assertSucceeds(getDocs(collection(anon, 'reviews')));
  await ruts.assertFails(getDoc(doc(anon, 'profiles', ALICE)));
  await ruts.assertFails(getDocs(collection(anon, 'profiles')));
  await ruts.assertFails(getDoc(doc(anon, 'rooms', 'r1')));
  await ruts.assertFails(setDoc(doc(anon, 'profiles', ALICE), { uid: ALICE, username: 'alice' }));
  await ruts.assertFails(setDoc(doc(anon, 'rooms', 'r2'), waitingRoom(ALICE)));
  await ruts.assertFails(setDoc(doc(anon, 'reviews', 'forged'), { rating: 5, message: 'fake' }), 'review writes go through the agent backend');
});

test('an ordinary player reads their own profile and nobody else’s', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => { await claimBatch(db, ALICE, 'alice').commit(); });
  const bob = asUser(BOB);
  await ruts.assertSucceeds(getDoc(doc(bob, 'profiles', BOB)), 'a missing own profile is "not found", not denied');
  await ruts.assertFails(getDoc(doc(bob, 'profiles', ALICE)), 'another player’s profile is private');
});

test('the player directory cannot be listed, by a player or by a guest', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await claimBatch(db, ALICE, 'alice').commit();
    await claimBatch(db, BOB, 'bob').commit();
  });
  await ruts.assertFails(getDocs(collection(asUser(BOB), 'profiles')), 'no scraping the directory');
  await ruts.assertFails(getDocs(collection(asGuest(), 'profiles')), 'guests cannot scrape either');
  await ruts.assertFails(
    getDocs(query(collection(asGuest(), 'profiles'), where('usernameLower', '==', 'alice'))),
    'the old username query is gone: lookup is a backend call now',
  );
});

test('username reservations are server-only', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => { await claimBatch(db, ALICE, 'alice').commit(); });
  await ruts.assertFails(getDoc(doc(asUser(ALICE), 'usernames', 'alice')), 'even the owner cannot read a reservation');
  await ruts.assertFails(getDocs(collection(asGuest(), 'usernames')), 'nobody lists reservations');
  await ruts.assertFails(
    setDoc(doc(asUser(BOB), 'usernames', 'bob'), { uid: BOB, username: 'bob', createdAt: ts() }),
    'nobody writes a reservation from a client',
  );
});

test('a profile is not writable from a client, not even by its owner', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => { await claimBatch(db, ALICE, 'alice').commit(); });
  const alice = asUser(ALICE);
  await ruts.assertFails(updateDoc(doc(alice, 'profiles', ALICE), { lastSeenAt: ts() }), 'renames and edits go through the backend');
  await ruts.assertFails(updateDoc(doc(alice, 'profiles', ALICE), { username: 'alice2' }));
  await ruts.assertFails(deleteDoc(doc(alice, 'profiles', ALICE)));
  await ruts.assertFails(setDoc(doc(alice, 'profiles', BOB), { uid: BOB, username: 'bob', usernameLower: 'bob', createdAtMs: 1 }));
});

test('an admin keeps the read access the dashboard needs, but profiles are backend-written', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'admins', ALICE), { admin: true });
    await claimBatch(db, BOB, 'bob').commit();
  });
  const alice = asUser(ALICE);
  await ruts.assertSucceeds(getDocs(collection(alice, 'profiles')), 'the dashboard lists profiles');
  await ruts.assertSucceeds(getDoc(doc(alice, 'profiles', BOB)));
  // Removing a player is `adminRemovePlayer`, which releases the username and deletes social data in
  // the same transaction. A bare client delete would leave a reservation pointing at nothing, so the
  // rules refuse it even for an admin.
  await ruts.assertFails(deleteDoc(doc(alice, 'profiles', BOB)), 'the studio removes a player through the callable');
  await ruts.assertFails(updateDoc(doc(alice, 'profiles', BOB), { username: 'bob2' }));
  await ruts.assertFails(getDocs(collection(asUser(BOB), 'profiles')), 'and a player still cannot');
});

// ── Rooms: members read, nobody writes ──────────────────────────────────────────────────────────

test('a room is readable by its members and by nobody else', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => { await setDoc(doc(db, 'rooms', 'r1'), waitingRoom(ALICE)); });
  await ruts.assertSucceeds(getDoc(doc(asUser(ALICE), 'rooms', 'r1')));
  await ruts.assertFails(getDoc(doc(asUser(BOB), 'rooms', 'r1')), 'a stranger cannot read a room they are not in');
  await ruts.assertFails(getDoc(doc(asGuest(), 'rooms', 'r1')));
  await ruts.assertFails(getDocs(collection(asUser(ALICE), 'rooms')), 'rooms are not listable, even for a member');
});

test('a room that does not exist reads as "not found" so an invite link can say so', async (t) => {
  if (!ready(t)) return;
  const snapshot = await getDoc(doc(asGuest(), 'rooms', 'never-existed'));
  assert.equal(snapshot.exists(), false);
});

test('no client can create, change, start, finish, rematch or delete a room', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => { await setDoc(doc(db, 'rooms', 'r1'), waitingRoom(ALICE)); });
  const alice = asUser(ALICE);
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'r2'), waitingRoom(ALICE)), 'creation is a callable');
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'r1'), { status: 'playing' }), 'starting is a callable');
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'r1'), { state: { phase: 'finished', winnerUid: ALICE } }), 'moves are callables');
  await ruts.assertFails(updateDoc(doc(alice, 'rooms', 'r1'), { hostUid: BOB }), 'host handoff is a callable');
  await ruts.assertFails(deleteDoc(doc(alice, 'rooms', 'r1')), 'deletion is the backend’s job');
  await ruts.assertFails(updateDoc(doc(asUser(BOB), 'rooms', 'r1'), { playerUids: [ALICE, BOB] }), 'joining is a callable');
});

test('hidden game state stays on the server and a private view is readable only by its owner', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'admins', ALICE), { admin: true });
    await setDoc(doc(db, 'rooms', 'r1'), waitingRoom(BOB, 'Bob'));
    await setDoc(doc(db, 'rooms', 'r1', 'secrets', 'engine'), { state: { secret: [1, 2, 3] }, roomId: 'r1' });
    await setDoc(doc(db, 'rooms', 'r1', 'views', BOB), { myShips: [1, 2, 3] });
  });
  await ruts.assertFails(getDoc(doc(asUser(BOB), 'rooms', 'r1', 'secrets', 'engine')), 'the code and the fleets stay on the server');
  await ruts.assertFails(getDoc(doc(asUser(ALICE), 'rooms', 'r1', 'secrets', 'engine')), 'not even an admin reads the secret state');
  await ruts.assertFails(setDoc(doc(asUser(BOB), 'rooms', 'r1', 'secrets', 'engine'), { state: {} }));
  await ruts.assertFails(getDoc(doc(asUser(BOB), 'rooms', 'r1', 'views', ALICE)), 'a player cannot read another player’s view');
  const alice = asUser(ALICE);
  await ruts.assertFails(setDoc(doc(alice, 'rooms', 'r1', 'views', BOB), { myShips: [] }), 'nor write one');
});

test('a player reads their own private view', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'rooms', 'r1'), waitingRoom(BOB, 'Bob'));
    await setDoc(doc(db, 'rooms', 'r1', 'views', BOB), { myShips: [4, 9] });
  });
  const view = await getDoc(doc(asUser(BOB), 'rooms', 'r1', 'views', BOB));
  assert.deepEqual(view.data().myShips, [4, 9]);
});

// ── Presence: the one client-writable room document ─────────────────────────────────────────────

test('presence heartbeats are written by their owner and read by members', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'rooms', 'r1'), { ...waitingRoom(ALICE), playerUids: [ALICE, BOB], playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' } });
  });
  await ruts.assertSucceeds(setDoc(doc(asUser(ALICE), 'rooms', 'r1', 'presence', ALICE), { status: 'here', lastSeenAt: ts() }));
  await ruts.assertSucceeds(getDoc(doc(asUser(BOB), 'rooms', 'r1', 'presence', ALICE)), 'a member sees who is here');
  await ruts.assertFails(setDoc(doc(asUser(BOB), 'rooms', 'r1', 'presence', ALICE), { status: 'here', lastSeenAt: ts() }), 'nobody speaks for someone else');
  await ruts.assertFails(getDoc(doc(asUser(CAROL), 'rooms', 'r1', 'presence', ALICE)), 'non-members cannot watch a room');
  await ruts.assertFails(setDoc(doc(asUser(BOB), 'rooms', 'r1', 'presence', BOB), { status: 'here', lastSeenAt: ts(), extra: 1 }), 'a heartbeat has two fields');
});

// ── Social: participants read, players never write ──────────────────────────────────────────────

test('friend requests and invites are readable by their participants only', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'friendRequests', `${ALICE}_${BOB}`), { fromUid: ALICE, toUid: BOB, fromName: 'alice', toName: 'bob', status: 'pending', createdAtMs: 1 });
    await setDoc(doc(db, 'gameInvites', 'inv1'), { fromUid: ALICE, toUid: BOB, roomId: 'r1', gameId: 'pixel-tac-toe', status: 'pending', createdAtMs: 1 });
    await setDoc(doc(db, 'friendships', `${ALICE}_${BOB}`), { memberUids: [ALICE, BOB], memberNames: { [ALICE]: 'alice', [BOB]: 'bob' }, requestId: `${ALICE}_${BOB}`, createdAtMs: 1 });
  });
  await ruts.assertSucceeds(getDoc(doc(asUser(BOB), 'friendRequests', `${ALICE}_${BOB}`)));
  await ruts.assertSucceeds(getDocs(query(collection(asUser(BOB), 'friendRequests'), where('toUid', '==', BOB))));
  await ruts.assertSucceeds(getDocs(query(collection(asUser(ALICE), 'friendships'), where('memberUids', 'array-contains', ALICE))));
  await ruts.assertFails(getDoc(doc(asUser(CAROL), 'friendRequests', `${ALICE}_${BOB}`)), 'a stranger cannot read someone’s inbox');
  await ruts.assertFails(getDocs(collection(asUser(CAROL), 'friendRequests')), 'nor list all requests');
  await ruts.assertSucceeds(getDocs(query(collection(asUser(CAROL), 'gameInvites'), where('toUid', '==', CAROL))), 'the app lists your own invites');
  await ruts.assertFails(getDocs(collection(asUser(CAROL), 'gameInvites')), 'but nobody lists the whole invite collection');
});

test('a block is private to the person who created it', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'blocks', `${ALICE}_${BOB}`), { blockerUid: ALICE, blockedUid: BOB, createdAtMs: 1 });
  });
  // This is exactly the query the friends page subscribes to.
  await ruts.assertSucceeds(getDocs(query(collection(asUser(ALICE), 'blocks'), where('blockerUid', '==', ALICE))));
  await ruts.assertSucceeds(getDoc(doc(asUser(ALICE), 'blocks', `${ALICE}_${BOB}`)));
  await ruts.assertFails(getDoc(doc(asUser(BOB), 'blocks', `${ALICE}_${BOB}`)), 'the blocked player never sees the block');
  await ruts.assertFails(getDoc(doc(asUser(CAROL), 'blocks', `${ALICE}_${BOB}`)));
  // Asking for *your own* blocks is always allowed and simply comes back empty when you have none;
  // what the rules refuse is the unfiltered list, which would show everyone's blocks.
  const ownBlocks = await getDocs(query(collection(asUser(BOB), 'blocks'), where('blockerUid', '==', BOB)));
  assert.equal(ownBlocks.size, 0, 'the blocked player has no blocks of their own to see');
  await ruts.assertFails(getDocs(collection(asUser(BOB), 'blocks')), 'and nobody lists the whole block collection');
});

test('no client writes requests, friendships, invites, blocks or reports', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await claimBatch(db, BOB, 'bob').commit();
    // Seed a real pending request, so the refused update below is refused by the rules and not
    // merely by the document being missing.
    await setDoc(doc(db, 'friendRequests', `${ALICE}_${BOB}`), { fromUid: ALICE, toUid: BOB, fromName: 'a', toName: 'b', status: 'pending', createdAtMs: 1 });
  });
  const alice = asUser(ALICE);
  await ruts.assertFails(setDoc(doc(alice, 'friendRequests', 'x'), { fromUid: ALICE, toUid: BOB, fromName: 'a', toName: 'b', status: 'pending', createdAt: ts() }));
  await ruts.assertFails(updateDoc(doc(alice, 'friendRequests', `${ALICE}_${BOB}`), { status: 'accepted' }));
  await ruts.assertFails(setDoc(doc(alice, 'friendships', `${ALICE}_${BOB}`), { memberUids: [ALICE, BOB], memberNames: {}, requestId: 'r', createdAt: ts() }));
  await ruts.assertFails(setDoc(doc(alice, 'gameInvites', 'inv'), { fromUid: ALICE, toUid: BOB, roomId: 'r1', status: 'pending', createdAt: ts() }));
  await ruts.assertFails(setDoc(doc(alice, 'blocks', `${ALICE}_${BOB}`), { blockerUid: ALICE, blockedUid: BOB, createdAtMs: 1 }));
  await ruts.assertFails(setDoc(doc(alice, 'reports', 'rep'), { reporterUid: ALICE, kind: 'bug', message: 'hello', status: 'open', createdAtMs: 1 }));
  await ruts.assertFails(getDoc(doc(alice, 'reports', 'rep')), 'reports are for the operator, not for players');
});

test('an admin can still tidy social documents and read reports', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'admins', ALICE), { admin: true });
    await setDoc(doc(db, 'friendRequests', 'req1'), { fromUid: BOB, toUid: CAROL, fromName: 'bob', toName: 'carol', status: 'pending', createdAtMs: 1 });
    await setDoc(doc(db, 'gameInvites', 'inv1'), { fromUid: BOB, toUid: CAROL, roomId: 'r1', status: 'pending', createdAtMs: 1 });
    await setDoc(doc(db, 'friendships', 'b1_c1'), { memberUids: [BOB, CAROL], memberNames: {}, requestId: 'req1', createdAtMs: 1 });
    await setDoc(doc(db, 'reports', 'rep1'), { reporterUid: BOB, kind: 'player', targetUid: CAROL, message: 'Said something nasty.', status: 'open', createdAtMs: 1 });
  });
  const alice = asUser(ALICE);
  await ruts.assertSucceeds(getDocs(collection(alice, 'friendRequests')));
  await ruts.assertSucceeds(getDoc(doc(alice, 'reports', 'rep1')));
  await ruts.assertSucceeds(deleteDoc(doc(alice, 'friendRequests', 'req1')));
  await ruts.assertSucceeds(deleteDoc(doc(alice, 'gameInvites', 'inv1')));
  await ruts.assertSucceeds(deleteDoc(doc(alice, 'friendships', 'b1_c1')));
});

test('published reviews are visible to everyone while ownership and training data stay private', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'admins', ALICE), { admin: true });
    await setDoc(doc(db, 'reviews', 'r1'), { reviewerName: 'Player', rating: 4, message: 'Pretty fun game.', assistantReply: 'Thanks for sharing!', createdAtMs: 1 });
    await setDoc(doc(db, 'reviewOwners', 'r1'), { ownerUid: BOB });
    await setDoc(doc(db, 'reviewAnnotations', 'r1'), { sentiment: 'positive' });
    await setDoc(doc(db, 'reviewAgentModels', 'active'), { classes: ['positive', 'negative'], weights: {} });
  });
  const publicReader = testEnv.unauthenticatedContext().firestore();
  await ruts.assertSucceeds(getDocs(collection(publicReader, 'reviews')));
  await ruts.assertSucceeds(getDoc(doc(asGuest(), 'reviews', 'r1')));
  await ruts.assertFails(getDoc(doc(asUser(BOB), 'reviewOwners', 'r1')));
  await ruts.assertFails(getDoc(doc(asUser(BOB), 'reviewAnnotations', 'r1')));
  await ruts.assertFails(getDoc(doc(asUser(BOB), 'reviewAgentModels', 'active')));
  await ruts.assertSucceeds(getDoc(doc(asUser(ALICE), 'reviewAnnotations', 'r1')));
  await ruts.assertSucceeds(getDoc(doc(asUser(ALICE), 'reviewAgentModels', 'active')));
  await ruts.assertFails(updateDoc(doc(asUser(ALICE), 'reviews', 'r1'), { sentiment: 'fake' }));
  await ruts.assertFails(setDoc(doc(asUser(ALICE), 'reviewAnnotations', 'r2'), { sentiment: 'positive' }));
  await ruts.assertFails(setDoc(doc(asUser(ALICE), 'reviewAgentModels', 'active'), { weights: {} }));
});

test('rate-limit bookkeeping is invisible to every client', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'admins', ALICE), { admin: true });
    await setDoc(doc(db, 'rateLimits', ALICE), { buckets: {}, updatedAtMs: 1 });
  });
  await ruts.assertFails(getDoc(doc(asUser(ALICE), 'rateLimits', ALICE)), 'not even the account it belongs to');
  await ruts.assertFails(getDocs(collection(asUser(ALICE), 'rateLimits')), 'nor lists them');
  await ruts.assertFails(setDoc(doc(asGuest(), 'rateLimits', GUEST), { buckets: {} }), 'nobody stuffs the counters');
});

// ── Admin access management (unchanged, and still narrow) ───────────────────────────────────────

test('admin flags: owners read theirs, admins manage access, and a first flag cannot be minted', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => setDoc(doc(db, 'admins', ALICE), { admin: true }));
  const alice = asUser(ALICE);
  const bob = asUser(BOB);
  await ruts.assertSucceeds(getDoc(doc(alice, 'admins', ALICE)));
  await ruts.assertFails(getDoc(doc(bob, 'admins', ALICE)), 'not everyone reads other flags');
  await ruts.assertSucceeds(getDocs(collection(alice, 'admins')), 'an admin lists the flags');
  await ruts.assertFails(setDoc(doc(bob, 'admins', BOB), { admin: true }), 'nobody mints their first flag from the client');
  await ruts.assertSucceeds(setDoc(doc(alice, 'admins', BOB), { admin: true }), 'an admin can promote someone');
  await ruts.assertFails(setDoc(doc(alice, 'admins', CAROL), { admin: true, level: 9 }), 'a flag holds only the boolean');
  await ruts.assertFails(deleteDoc(doc(alice, 'admins', ALICE)), 'a flag cannot lock itself out');
  await ruts.assertSucceeds(deleteDoc(doc(alice, 'admins', BOB)));
  await ruts.assertFails(getDocs(collection(bob, 'admins')), 'the revoked admin loses access immediately');
});

test('a guest holds no profile access, but can still play in a room they joined', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await claimBatch(db, ALICE, 'alice').commit();
    await setDoc(doc(db, 'rooms', 'r1'), waitingRoom(ALICE));
    await setDoc(doc(db, 'rooms', 'r2'), { ...waitingRoom(ALICE), playerUids: [ALICE, GUEST], playerNames: { [ALICE]: 'Alice', [GUEST]: 'Guest' } });
  });
  const guest = asGuest();
  await ruts.assertFails(getDoc(doc(guest, 'profiles', ALICE)), 'guests cannot read profiles');
  await ruts.assertFails(getDocs(collection(guest, 'profiles')), 'guests cannot list profiles');
  await ruts.assertFails(getDocs(collection(guest, 'usernames')), 'guests cannot list usernames');
  await ruts.assertFails(setDoc(doc(guest, 'friendRequests', 'x'), { fromUid: GUEST, toUid: ALICE, fromName: 'g', toName: 'a', status: 'pending', createdAt: ts() }));
  await ruts.assertFails(getDoc(doc(guest, 'rooms', 'r1')), 'a guest is not in that room');
  // The backend took the guest's seat in r2, so the live snapshot the game needs is allowed.
  await ruts.assertSucceeds(getDoc(doc(guest, 'rooms', 'r2')));
  await ruts.assertSucceeds(setDoc(doc(guest, 'rooms', 'r2', 'presence', GUEST), { status: 'here', lastSeenAt: ts() }));
});

// ── Maintenance mode: public status, server-only PIN and passes ───────────────────────────────

test('the maintenance status is world-readable and nothing else under maintenance/ is client-reachable', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'maintenance', 'status'), { enabled: true, message: 'Tuning the arcade.', updatedAtMs: 1, updatedBy: ALICE });
    await setDoc(doc(db, 'maintenance', 'secrets', 'status'), { pin: '1234567890123456', updatedAtMs: 1 });
    await setDoc(doc(db, 'maintenance', 'bypasses', 'tok1'), { createdAtMs: 1, expiresAtMs: 9_999_999_999_999 });
  });
  const anon = testEnv.unauthenticatedContext().firestore();
  const status = await getDoc(doc(anon, 'maintenance', 'status'));
  assert.equal(status.data().enabled, true, 'a signed-out visitor reads the safe status');
  assert.equal(status.data().message, 'Tuning the arcade.');
  assert.ok(!('pin' in status.data()), 'the safe status carries no PIN field');
  await ruts.assertFails(getDoc(doc(anon, 'maintenance', 'secrets', 'status')), 'the 16-digit tester PIN is never public');
  await ruts.assertFails(getDoc(doc(anon, 'maintenance', 'bypasses', 'tok1')), 'nor is a verified tester pass');
  await ruts.assertFails(getDocs(collection(anon, 'maintenance')), 'and nobody lists the maintenance collection');
});

test('non-admin users cannot write maintenance documents', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'maintenance', 'status'), { enabled: true, message: 'Tuning the arcade.', updatedAtMs: 1, updatedBy: ALICE });
  });
  const bob = asUser(BOB);
  await ruts.assertFails(updateDoc(doc(bob, 'maintenance', 'status'), { enabled: false }), 'a player cannot switch maintenance off');
  await ruts.assertFails(updateDoc(doc(bob, 'maintenance', 'status'), { message: 'Forged by a player' }));
  await ruts.assertFails(setDoc(doc(bob, 'maintenance', 'status'), { enabled: true, message: 'hijack' }), 'nor overwrite the document');
  await ruts.assertFails(deleteDoc(doc(bob, 'maintenance', 'status')));
  await ruts.assertFails(setDoc(doc(bob, 'maintenance', 'secrets', 'status'), { pin: '9999999999999999' }), 'nor touch the PIN secret');
  await ruts.assertFails(setDoc(doc(bob, 'maintenance', 'bypasses', 'forged'), { createdAtMs: 1, expiresAtMs: 1 }), 'nor mint a tester pass');
  // An unauthenticated visitor is refused the same way.
  const anon = testEnv.unauthenticatedContext().firestore();
  await ruts.assertFails(updateDoc(doc(anon, 'maintenance', 'status'), { enabled: false }));
});

test('maintenance writes go through the backend even for a verified admin', async (t) => {
  if (!ready(t)) return;
  await seed(async (db) => {
    await setDoc(doc(db, 'admins', CAROL), { admin: true });
    await setDoc(doc(db, 'maintenance', 'status'), { enabled: true, message: 'Tuning the arcade.', updatedAtMs: 1, updatedBy: CAROL });
  });
  const carol = asUser(CAROL);
  // The admin can read the status (the public get covers everyone) ...
  await ruts.assertSucceeds(getDoc(doc(carol, 'maintenance', 'status')));
  // ... but the actual write still has to be the adminSetMaintenance callable, which rotates the
  // PIN server-side. A direct client write could not, so the rules refuse it even for an admin.
  await ruts.assertFails(updateDoc(doc(carol, 'maintenance', 'status'), { enabled: false }), 'no direct admin write: PIN rotation would be skipped');
  await ruts.assertFails(setDoc(doc(carol, 'maintenance', 'secrets', 'status'), { pin: '9999999999999999' }), 'the secret is backend-only, admin included');
  await ruts.assertFails(setDoc(doc(carol, 'maintenance', 'bypasses', 'forged'), { createdAtMs: 1, expiresAtMs: 1 }));
});
