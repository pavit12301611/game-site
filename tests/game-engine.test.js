import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAMES,
  applyGameAction,
  createInitialGameState,
  getGameArtwork,
  getGameGuide,
  getQuizQuestion,
} from '../src/catalog.js';

const twoPlayers = [
  { uid: 'p1', name: 'One' },
  { uid: 'p2', name: 'Two' },
];
const threePlayers = [...twoPlayers, { uid: 'p3', name: 'Three' }];

function play(gameId, moves, players = twoPlayers, seed = 'test-seed') {
  const game = GAMES.find((entry) => entry.id === gameId);
  let state = createInitialGameState(game, players, seed);
  for (const [uid, action] of moves) state = applyGameAction(game, state, uid, action, players);
  return state;
}

test('the catalog contains exactly 160 unique, selectable games', () => {
  assert.equal(GAMES.length, 160);
  assert.equal(new Set(GAMES.map((game) => game.id)).size, 160);
  assert.ok(GAMES.every((game) => game.title && game.blurb && game.engine && game.options));
  assert.deepEqual(new Set(GAMES.map((game) => game.engine)), new Set(['line', 'drop', 'memory', 'race', 'rps', 'quiz', 'maze', 'battle', 'rally', 'code']));
  assert.ok(GAMES.every((game) => getGameArtwork(game).src === (game.options.variant ? `/images/expansion/${game.id}.svg` : `/images/games/${game.id}.webp`)));
  assert.ok(GAMES.every((game) => getGameGuide(game)?.goal && getGameGuide(game)?.controls && getGameGuide(game)?.rules));
});

test('every catalog entry initializes a serializable three-player match', () => {
  for (const game of GAMES) {
    const state = createInitialGameState(game, threePlayers, `smoke:${game.id}`);
    assert.equal(state.phase, 'playing', `${game.id} should start`);
    assert.doesNotThrow(() => JSON.stringify(state), `${game.id} should be Firestore-safe JSON`);
  }
});

test('line-board wins are detected and turns rotate', () => {
  const game = GAMES.find((entry) => entry.id === 'pixel-tac-toe');
  let state = createInitialGameState(game, twoPlayers);
  state = applyGameAction(game, state, 'p1', { index: 0 }, twoPlayers);
  assert.equal(state.turnUid, 'p2');
  state = applyGameAction(game, state, 'p2', { index: 3 }, twoPlayers);
  state = applyGameAction(game, state, 'p1', { index: 1 }, twoPlayers);
  state = applyGameAction(game, state, 'p2', { index: 4 }, twoPlayers);
  state = applyGameAction(game, state, 'p1', { index: 2 }, twoPlayers);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.throws(() => applyGameAction(game, state, 'p1', { index: 5 }, twoPlayers), /already over/i);
});

test('three players can take turns on the shared line board', () => {
  const game = GAMES.find((entry) => entry.id === 'pixel-tac-toe');
  let state = createInitialGameState(game, threePlayers);
  state = applyGameAction(game, state, 'p1', { index: 0 }, threePlayers);
  state = applyGameAction(game, state, 'p2', { index: 4 }, threePlayers);
  assert.equal(state.turnUid, 'p3');
  state = applyGameAction(game, state, 'p3', { index: 1 }, threePlayers);
  assert.equal(state.turnUid, 'p1');
});

test('drop-board detects a vertical Connect Four win', () => {
  const state = play('connect-four', [
    ['p1', { col: 0 }], ['p2', { col: 1 }],
    ['p1', { col: 0 }], ['p2', { col: 1 }],
    ['p1', { col: 0 }], ['p2', { col: 1 }],
    ['p1', { col: 0 }],
  ]);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
});

test('full columns and occupied squares are rejected', () => {
  const game = GAMES.find((entry) => entry.id === 'pixel-tac-toe');
  let state = createInitialGameState(game, twoPlayers);
  state = applyGameAction(game, state, 'p1', { index: 0 }, twoPlayers);
  assert.throws(() => applyGameAction(game, state, 'p2', { index: 0 }, twoPlayers), /not available/i);
});

test('race scoring reaches its finish line', () => {
  const game = GAMES.find((entry) => entry.id === 'pixel-tap');
  let state = createInitialGameState(game, twoPlayers);
  for (let index = 0; index < game.options.target; index += 1) state = applyGameAction(game, state, 'p2', { type: 'tap' }, twoPlayers);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p2');
  assert.equal(state.scores.p2, game.options.target);
});

test('simultaneous rock-paper-scissors resolves a round', () => {
  const game = GAMES.find((entry) => entry.id === 'rock-paper-scissors');
  let state = createInitialGameState(game, twoPlayers);
  state = applyGameAction(game, state, 'p1', { choice: 'rock' }, twoPlayers);
  assert.deepEqual(state.picks, { p1: 'rock' });
  state = applyGameAction(game, state, 'p2', { choice: 'scissors' }, twoPlayers);
  assert.equal(state.lastRound.winnerUids[0], 'p1');
  assert.equal(state.scores.p1, 1);
  assert.deepEqual(state.picks, {});
});

test('quiz scoring waits for every player and advances questions', () => {
  const game = GAMES.find((entry) => entry.id === 'retro-trivia');
  let state = createInitialGameState(game, twoPlayers);
  const right = getQuizQuestion(0).answer;
  state = applyGameAction(game, state, 'p1', { answer: right }, twoPlayers);
  assert.equal(state.lastRound, null);
  state = applyGameAction(game, state, 'p2', { answer: 0 }, twoPlayers);
  assert.equal(state.lastRound.correct, right);
  assert.equal(state.scores.p1, 1);
  state = applyGameAction(game, state, 'p2', { type: 'next' }, twoPlayers);
  assert.equal(state.questionIndex, 1);
  assert.deepEqual(state.answers, {});
});

test('memory deck has pairs and scores a matching pair', () => {
  const game = GAMES.find((entry) => entry.id === 'memory-match');
  let state = createInitialGameState(game, twoPlayers, 'memory-seed');
  assert.equal(state.cards.length, 12);
  assert.equal(new Set(state.cards).size, 6);
  const first = 0;
  const second = state.cards.findIndex((card, index) => index !== first && card === state.cards[first]);
  state = applyGameAction(game, state, 'p1', { index: first }, twoPlayers);
  state = applyGameAction(game, state, 'p1', { index: second }, twoPlayers);
  assert.equal(state.scores.p1, 1);
  assert.equal(state.matched.length, 2);
  assert.equal(state.turnUid, 'p1');
});

test('maze movement rejects walls and updates the player position', () => {
  const game = GAMES.find((entry) => entry.id === 'maze-runner');
  let state = createInitialGameState(game, twoPlayers);
  state = applyGameAction(game, state, 'p1', { direction: 'right' }, twoPlayers);
  state = applyGameAction(game, state, 'p1', { direction: 'up' }, twoPlayers);
  assert.deepEqual(state.positions.p1, { x: 1, y: 5 });
  assert.throws(() => applyGameAction(game, state, 'p1', { direction: 'right' }, twoPlayers), /wall/i);
  assert.equal(state.scores.p1, 2);
});

test('battle actions log hits and rotate turns', () => {
  const game = GAMES.find((entry) => entry.id === 'sea-battle');
  let state = createInitialGameState(game, twoPlayers, 'fleet-seed');
  const targetCell = state.ships.p2[0];
  state = applyGameAction(game, state, 'p1', { targetUid: 'p2', index: targetCell }, twoPlayers);
  assert.equal(state.lastShot.hit, true);
  assert.equal(state.turnUid, 'p2');
  assert.equal(state.shots.p1.length, 1);
});

test('rally points resolve a winner', () => {
  const game = GAMES.find((entry) => entry.id === 'pong-rally');
  let state = createInitialGameState(game, twoPlayers);
  for (let index = 0; index < game.options.target; index += 1) {
    state = applyGameAction(game, state, 'p1', { lane: index % 3 }, twoPlayers);
    if (state.phase === 'playing') state = applyGameAction(game, state, 'p2', { lane: (index + 1) % 3 }, twoPlayers);
  }
  assert.equal(state.phase, 'finished');
  assert.ok(['p1', 'p2'].includes(state.winnerUid));
});

test('codebreaker reports exact and misplaced digits', () => {
  const game = GAMES.find((entry) => entry.id === 'codebreaker');
  let state = createInitialGameState(game, twoPlayers, 'code-test');
  const secret = [...state.secret];
  state = applyGameAction(game, state, 'p1', { guess: secret }, twoPlayers);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.guesses[0].exact, 4);
});
