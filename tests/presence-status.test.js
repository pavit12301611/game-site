/**
 * Presence verdicts and the heartbeat loop, without Firebase.
 *
 * The Firestore half (src/online/presence.js) only moves these values in and out of Firestore; the
 * rules that decide what a player sees - here / away / left / unknown, and when the room repaints -
 * are all in src/presence-status.js and are pinned down here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AWAY_AFTER_MS,
  HEARTBEAT_MS,
  clockOffset,
  createHeartbeat,
  describePresence,
  formatAwayFor,
  presenceSignature,
  presenceVerdicts,
} from '../src/presence-status.js';

const NOW = 1_700_000_000_000;

test('a fresh heartbeat means here, an old one means away, and "left" is taken at its word', () => {
  assert.equal(describePresence({ lastSeenMs: NOW - 5_000, status: 'here' }, NOW).kind, 'here');
  assert.equal(describePresence({ lastSeenMs: NOW - AWAY_AFTER_MS, status: 'here' }, NOW).kind, 'here', 'exactly at the limit is still here');
  const away = describePresence({ lastSeenMs: NOW - AWAY_AFTER_MS - 1_000, status: 'here' }, NOW);
  assert.equal(away.kind, 'away');
  assert.equal(away.awayForMs, AWAY_AFTER_MS + 1_000);
  const left = describePresence({ lastSeenMs: NOW - 1_000, status: 'left' }, NOW);
  assert.equal(left.kind, 'left', 'a player who said they left is not shown as here, however fresh the write');
});

test('no heartbeat at all is "unknown", and unknown reads exactly like the room did before presence', () => {
  for (const record of [undefined, null, { lastSeenMs: null, status: 'here' }]) {
    const verdict = describePresence(record, NOW);
    assert.equal(verdict.kind, 'unknown');
    assert.equal(verdict.label, 'IN THE ROOM');
    assert.equal(verdict.detail, '', 'the match rail keeps its usual text');
  }
});

test('the labels are built for the two places they are shown', () => {
  const away = describePresence({ lastSeenMs: NOW - 2 * 60_000 - 5_000, status: 'here' }, NOW);
  assert.equal(away.label, 'AWAY · 2 MIN', 'capitals for the lobby slot');
  assert.equal(away.detail, 'Away for 2 min', 'sentence case for the match rail');
  assert.equal(describePresence({ lastSeenMs: NOW, status: 'left' }, NOW).label, 'LEFT THE ROOM');
  assert.equal(describePresence({ lastSeenMs: NOW, status: 'left' }, NOW).detail, 'Left the room');
});

test('durations read like a person would say them', () => {
  assert.equal(formatAwayFor(20_000), '20 s');
  assert.equal(formatAwayFor(59_400), '59 s');
  assert.equal(formatAwayFor(61_000), '1 min');
  assert.equal(formatAwayFor(45 * 60_000), '45 min');
  assert.equal(formatAwayFor(2 * 3_600_000 + 10 * 60_000), '2 hr');
  assert.equal(formatAwayFor(-5_000), '0 s', 'a clock running ahead never produces a negative age');
});

test('the heartbeat comes before the away limit with room for a missed beat and skew', () => {
  assert.ok(HEARTBEAT_MS * 2 <= AWAY_AFTER_MS, 'one missed beat is not "away"');
  assert.ok(AWAY_AFTER_MS <= 2 * 60_000, 'but a closed tab is noticed within two minutes');
});

test('verdicts cover every player in the room, and the signature only changes with a kind', () => {
  const records = {
    alice: { lastSeenMs: NOW - 1_000, status: 'here' },
    bob: { lastSeenMs: NOW - 5 * 60_000, status: 'here' },
  };
  const verdicts = presenceVerdicts(['alice', 'bob', 'carol'], records, NOW);
  assert.deepEqual(Object.keys(verdicts).sort(), ['alice', 'bob', 'carol']);
  assert.equal(verdicts.alice.kind, 'here');
  assert.equal(verdicts.bob.kind, 'away');
  assert.equal(verdicts.carol.kind, 'unknown', 'a player with no heartbeat document');
  const later = presenceVerdicts(['alice', 'bob', 'carol'], records, NOW + 20_000);
  assert.equal(presenceSignature(later), presenceSignature(verdicts), 'bob being away for longer is not a repaint');
  const bobBack = presenceVerdicts(['alice', 'bob', 'carol'], { ...records, bob: { lastSeenMs: NOW + 19_000, status: 'here' } }, NOW + 20_000);
  assert.notEqual(presenceSignature(bobBack), presenceSignature(verdicts), 'bob coming back is');
  assert.equal(presenceSignature(presenceVerdicts([], {}, NOW)), '');
});

test('the server-clock offset comes from our own acknowledged heartbeat', () => {
  assert.equal(clockOffset(NOW + 30_000, NOW), 30_000, 'a laptop 30 s behind the server');
  assert.equal(clockOffset(NOW - 2_000, NOW), -2_000, 'or ahead of it');
  assert.equal(clockOffset(null, NOW), 0, 'unknown until the first heartbeat lands');
  assert.equal(clockOffset(NOW, null), 0);
});

/** Fake timers: intervals fire only when the test says so. */
function fakeTimers() {
  const intervals = new Map();
  let nextId = 1;
  return {
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => { intervals.delete(id); },
    tick: () => { for (const { fn } of [...intervals.values()]) fn(); },
    get active() { return intervals.size; },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('the loop beats at once, then on every interval, and stop() is final', async () => {
  const timers = fakeTimers();
  let beats = 0;
  const loop = createHeartbeat({ beat: () => { beats += 1; }, intervalMs: 25_000, ...timers });
  assert.equal(beats, 0);
  loop.start();
  await flush();
  assert.equal(beats, 1, 'the first beat is immediate, so a new member shows up as here right away');
  assert.equal(timers.active, 1);
  timers.tick();
  timers.tick();
  await flush();
  assert.equal(beats, 3);
  loop.start();
  assert.equal(timers.active, 1, 'starting twice does not double the beats');
  loop.stop();
  loop.stop();
  assert.equal(timers.active, 0);
  assert.equal(loop.running, false);
  assert.equal(loop.stopped, true);
  loop.start();
  loop.visibilityChanged();
  await flush();
  assert.equal(beats, 3, 'a stopped loop never beats again');
});

test('a hidden tab stops beating and a visible one beats the moment it is back', async () => {
  const timers = fakeTimers();
  let visible = true;
  let beats = 0;
  const loop = createHeartbeat({ beat: () => { beats += 1; }, isVisible: () => visible, ...timers });
  loop.start();
  await flush();
  assert.equal(beats, 1);
  visible = false;
  loop.visibilityChanged();
  assert.equal(timers.active, 0, 'no interval while hidden: a backgrounded tab honestly becomes "away"');
  timers.tick();
  await flush();
  assert.equal(beats, 1);
  visible = true;
  loop.visibilityChanged();
  await flush();
  assert.equal(beats, 2, 'coming back beats immediately, so the others see it within a second');
  assert.equal(timers.active, 1);
  loop.stop();
});

test('a loop started while hidden waits for the tab to become visible', async () => {
  const timers = fakeTimers();
  let visible = false;
  let beats = 0;
  const loop = createHeartbeat({ beat: () => { beats += 1; }, isVisible: () => visible, ...timers });
  loop.start();
  await flush();
  assert.equal(beats, 0);
  assert.equal(timers.active, 0);
  visible = true;
  loop.visibilityChanged();
  await flush();
  assert.equal(beats, 1);
  loop.stop();
});

test('a failing beat is reported and does not stop the loop', async () => {
  const timers = fakeTimers();
  const errors = [];
  let calls = 0;
  const loop = createHeartbeat({
    beat: () => { calls += 1; if (calls === 1) throw new Error('offline'); return Promise.reject(new Error('still offline')); },
    onError: (error) => errors.push(error.message),
    ...timers,
  });
  loop.start();
  await flush();
  timers.tick();
  await flush();
  assert.deepEqual(errors, ['offline', 'still offline'], 'a sync throw and a rejection are both just a missed beat');
  assert.equal(loop.running, true);
  loop.stop();
});

test('onError may stop the loop (what a permission-denied heartbeat does)', async () => {
  const timers = fakeTimers();
  let beats = 0;
  /** @type {ReturnType<typeof createHeartbeat>} */
  let loop;
  loop = createHeartbeat({
    beat: () => { beats += 1; return Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' })); },
    onError: () => loop.stop(),
    ...timers,
  });
  loop.start();
  await flush();
  assert.equal(beats, 1);
  assert.equal(timers.active, 0, 'the loop stopped itself from inside onError');
  timers.tick();
  await flush();
  assert.equal(beats, 1);
});
