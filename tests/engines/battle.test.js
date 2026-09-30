import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as battle from '../../src/engines/battle.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const three = [...two, { uid: 'p3', name: 'Three' }];
const seaBattle = GAMES.find((game) => game.id === 'sea-battle');

function start(players = two, seed = 'battle-seed') {
  return battle.createInitialState(seaBattle, players, seed);
}

test('every player gets a hidden fleet of the right size, seeded by the room', () => {
  const state = start(three);
  assert.equal(state.boardSize, 6);
  assert.deepEqual(Object.keys(state.ships).sort(), ['p1', 'p2', 'p3']);
  for (const uid of ['p1', 'p2', 'p3']) {
    assert.equal(state.ships[uid].length, 4);
    assert.equal(new Set(state.ships[uid]).size, 4, 'no ship sits on top of another');
    assert.ok(state.ships[uid].every((index) => index >= 0 && index < 36));
  }
  assert.deepEqual(start(three, 'battle-seed').ships, state.ships, 'the same seed deals the same fleets');
  assert.notDeepEqual(start(three, 'other-seed').ships, state.ships);
  assert.deepEqual(state.shots, { p1: [], p2: [], p3: [] });
  assert.equal(state.turnUid, 'p1');
});

test('a shot is recorded against the shooter and the turn passes on', () => {
  let state = start();
  const ship = state.ships.p2[0];
  let otherCell = 0;
  while (state.ships.p1.includes(otherCell)) otherCell += 1;
  state = battle.applyAction(seaBattle, state, 'p1', { targetUid: 'p2', index: ship }, two);
  assert.deepEqual(state.lastShot, { shooterUid: 'p1', targetUid: 'p2', index: ship, hit: true });
  assert.equal(state.turnUid, 'p2');
  state = battle.applyAction(seaBattle, state, 'p2', { targetUid: 'p1', index: otherCell }, two);
  assert.equal(state.lastShot.hit, false);
  assert.equal(state.turnUid, 'p1');
  assert.equal(state.shots.p1.length, 1);
  assert.equal(state.shots.p2.length, 1);
});

test('the same square cannot be fired at twice', () => {
  let state = start();
  state = battle.applyAction(seaBattle, state, 'p1', { targetUid: 'p2', index: 0 }, two);
  state = battle.applyAction(seaBattle, state, 'p2', { targetUid: 'p1', index: 1 }, two);
  assert.equal(state.turnUid, 'p1');
  assert.throws(() => battle.applyAction(seaBattle, state, 'p1', { targetUid: 'p2', index: 0 }, two), /already fired/i);
});

test('you cannot fire at your own board or at a stranger', () => {
  const state = start();
  assert.throws(() => battle.applyAction(seaBattle, state, 'p1', { targetUid: 'p1', index: 0 }, two), /another player/i);
  assert.throws(() => battle.applyAction(seaBattle, state, 'p1', { targetUid: 'nobody', index: 0 }, two), /another player/i);
  assert.throws(() => battle.applyAction(seaBattle, state, 'p1', { targetUid: 'p2', index: 36 }, two), /choose a square/i);
  assert.throws(() => battle.applyAction(seaBattle, state, 'p1', { targetUid: 'p2', index: -1 }, two), /choose a square/i);
  assert.throws(() => battle.applyAction(seaBattle, state, 'p2', { targetUid: 'p1', index: 0 }, two), /wait for your turn/i);
});

test('sinking the whole rival fleet wins the game', () => {
  let state = start();
  let spare = 0;
  const missCell = () => {
    while (state.ships.p1.includes(spare)) spare += 1;
    const cell = spare;
    spare += 1;
    return cell;
  };
  for (const ship of state.ships.p2) {
    if (state.phase !== 'playing') break;
    state = battle.applyAction(seaBattle, state, 'p1', { targetUid: 'p2', index: ship }, two);
    if (state.phase === 'playing') state = battle.applyAction(seaBattle, state, 'p2', { targetUid: 'p1', index: missCell() }, two);
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.result, 'winner');
});

test('with three players you must sink every rival, not just one', () => {
  let state = start(three);
  /** A cell that is guaranteed to miss, so the other players never win first. */
  const nextMiss = (shooter, target) => {
    let cell = 0;
    while (state.ships[target].includes(cell) || state.shots[shooter].includes(`${target}:${cell}`)) cell += 1;
    return cell;
  };
  for (const ship of state.ships.p2) {
    state = battle.applyAction(seaBattle, state, 'p1', { targetUid: 'p2', index: ship }, three);
    state = battle.applyAction(seaBattle, state, 'p2', { targetUid: 'p3', index: nextMiss('p2', 'p3') }, three);
    state = battle.applyAction(seaBattle, state, 'p3', { targetUid: 'p1', index: nextMiss('p3', 'p1') }, three);
  }
  assert.equal(state.phase, 'playing', 'p2 is sunk but p3 is untouched');
  for (const ship of state.ships.p3) {
    if (state.phase !== 'playing') break;
    state = battle.applyAction(seaBattle, state, 'p1', { targetUid: 'p3', index: ship }, three);
    if (state.phase === 'playing') {
      state = battle.applyAction(seaBattle, state, 'p2', { targetUid: 'p1', index: nextMiss('p2', 'p1') }, three);
      state = battle.applyAction(seaBattle, state, 'p3', { targetUid: 'p2', index: nextMiss('p3', 'p2') }, three);
    }
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
});
