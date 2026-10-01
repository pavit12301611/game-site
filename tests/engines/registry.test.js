import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, applyGameAction, createInitialGameState } from '../../src/catalog.js';
import { ENGINES, createInitialGameState as createInitialEngineState, engineIds, getEngine } from '../../src/engines/index.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];

test('the registry covers exactly the ten engines the catalog uses', () => {
  assert.deepEqual(engineIds().sort(), [...new Set(GAMES.map((game) => game.engine))].sort());
  assert.equal(engineIds().length, 10);
  for (const id of engineIds()) {
    const engine = getEngine(id);
    assert.equal(typeof engine.createInitialState, 'function', `${id} can start a game`);
    assert.equal(typeof engine.applyAction, 'function', `${id} can take a move`);
  }
  assert.equal(getEngine('nope'), null);
  assert.equal(Object.keys(ENGINES).length, 10);
});

test('every catalog game starts and moves through the registry', () => {
  for (const game of GAMES) {
    const state = createInitialEngineState(game, two, `registry:${game.id}`);
    assert.equal(state.phase, 'playing', `${game.id} starts playable`);
    assert.doesNotThrow(() => JSON.stringify(state), `${game.id} stays plain JSON`);
  }
});

test('the catalog wrappers accept a game id or a game object', () => {
  const byId = createInitialGameState('pixel-tac-toe', two, 'seed');
  const byObject = createInitialGameState(GAMES[0], two, 'seed');
  assert.deepEqual(byId, byObject);
  assert.equal(byId.turnUid, 'p1');
  const moved = applyGameAction('pixel-tac-toe', byId, 'p1', { index: 0 }, two);
  assert.equal(moved.turnUid, 'p2');
  assert.deepEqual(applyGameAction(GAMES[0], byId, 'p1', { index: 0 }, two), moved);
});

test('the wrappers explain what went wrong', () => {
  assert.throws(() => createInitialGameState('no-such-game', two), /could not be found/i);
  assert.throws(() => createInitialGameState(GAMES[0], []), /at least one player/i);
  const state = createInitialGameState(GAMES[0], two);
  assert.throws(() => applyGameAction(GAMES[0], state, 'stranger', { index: 0 }, two), /not in this game/i);
  assert.throws(() => applyGameAction(GAMES[0], null, 'p1', { index: 0 }, two), /not in this game/i);
});

test('an engine the catalog does not ship is reported, not swallowed', () => {
  const unknown = { id: 'mystery', engine: 'chess', options: {} };
  assert.throws(() => createInitialGameState(unknown, two), /The chess game mode is not available\./);
  assert.throws(() => applyGameAction(unknown, { phase: 'playing' }, 'p1', {}, two), /not ready yet/i);
});

test('applying a move never mutates the state it was given', () => {
  const game = GAMES.find((entry) => entry.id === 'connect-four');
  const state = createInitialGameState(game, two, 'immutable');
  const before = JSON.stringify(state);
  const next = applyGameAction(game, state, 'p1', { col: 0 }, two);
  assert.equal(JSON.stringify(state), before, 'the previous state is untouched');
  assert.notEqual(JSON.stringify(next), before, 'a new state is returned');
  assert.equal(next.turnUid, 'p2');
});

test('an illegal move leaves the game exactly as it was', () => {
  const game = GAMES.find((entry) => entry.id === 'pixel-tac-toe');
  const state = createInitialGameState(game, two, 'illegal');
  const before = JSON.stringify(state);
  assert.throws(() => applyGameAction(game, state, 'p2', { index: 0 }, two), /wait for your turn/i);
  assert.equal(JSON.stringify(state), before, 'a refused move changes nothing');
});
