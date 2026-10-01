/**
 * Deterministic replay driver shared by the engine tests.
 *
 * It plays every game in the catalog with a fixed, engine-aware script and returns a stable
 * fingerprint of the state after every move. The same driver is used to create
 * `tests/fixtures/engine-baseline.json` (from the code that shipped before the engines were
 * extracted) and to check the current engines against it, which is what proves the extraction
 * did not change a single rule.
 *
 * Not a test file on purpose: `node --test` only picks up `*.test.js`.
 */
import { createHash } from 'node:crypto';

/** Enough moves to finish the short games and to exercise the long ones well past the opening. */
export const MAX_MOVES = 24;

const MAZE_PATTERN = ['up', 'up', 'left', 'up', 'right', 'up', 'left', 'down'];

/** Stable JSON: object keys are sorted, so a reordered literal cannot look like a behaviour change. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
  return `{${entries.join(',')}}`;
}

/** @param {unknown} value */
export function fingerprint(value) {
  return createHash('sha256').update(canonical(value)).digest('hex').slice(0, 32);
}

/**
 * Actions to try, in order, for the player who is about to move.
 * The first one the engine accepts wins, so the script never depends on randomness.
 *
 * @param {string} engine
 * @param {Record<string, any>} state
 * @param {{ uid: string }[]} players
 * @param {string} uid
 */
export function candidateActions(engine, state, players, uid) {
  const others = players.filter((player) => player.uid !== uid).map((player) => player.uid);
  switch (engine) {
    case 'line':
      return state.board.map((cell, index) => (cell === null ? { index } : null)).filter(Boolean);
    case 'drop':
      return Array.from({ length: state.cols }, (_, col) => ({ col }));
    case 'memory':
      return state.cards
        .map((_, index) => (state.matched.includes(index) || state.opened.includes(index) ? null : { index }))
        .filter(Boolean);
    case 'race':
      return [{ type: 'tap' }];
    case 'rps':
      return (state.mode === 'rps'
        ? ['rock', 'paper', 'scissors']
        : state.mode === 'coin'
          ? ['heads', 'tails']
          : ['1', '2', '3', '4', '5', '6']).map((choice) => ({ choice }));
    case 'quiz':
      return [{ answer: 0 }, { answer: 1 }, { answer: 2 }, { answer: 3 }, { type: 'next' }];
    case 'maze':
      return MAZE_PATTERN.map((direction) => ({ direction }));
    case 'battle': {
      const actions = [];
      for (const targetUid of others) {
        for (let index = 0; index < state.boardSize * state.boardSize; index += 1) actions.push({ targetUid, index });
      }
      return actions;
    }
    case 'rally':
      return [{ lane: 0 }, { lane: 1 }, { lane: 2 }];
    case 'code':
      return Array.from({ length: 6 }, (_, value) => ({ guess: Array.from({ length: state.digits }, () => value) }));
    default:
      return [];
  }
}

/** Who acts next: turn-based engines follow `turnUid`, simultaneous ones rotate in player order. */
export function actorForStep(engine, state, players, step) {
  if (state.turnUid) return state.turnUid;
  return players[step % players.length].uid;
}

/**
 * Plays one game and fingerprints the state after every accepted move.
 *
 * @param {object} input
 * @param {{ id: string, engine: string }} input.game
 * @param {{ uid: string, name: string }[]} input.players
 * @param {string} input.seed
 * @param {Function} input.createInitialGameState
 * @param {Function} input.applyGameAction
 */
export function replay({ game, players, seed, createInitialGameState, applyGameAction }) {
  let state = createInitialGameState(game, players, seed);
  const hashes = [fingerprint(state)];
  const errors = [];
  let applied = 0;

  for (let step = 0; step < MAX_MOVES && state.phase === 'playing'; step += 1) {
    const uid = actorForStep(game.engine, state, players, step);
    let moved = false;
    for (const action of candidateActions(game.engine, state, players, uid)) {
      try {
        state = applyGameAction(game, state, uid, action, players);
        hashes.push(fingerprint(state));
        applied += 1;
        moved = true;
        break;
      } catch (error) {
        errors.push(`${step}:${uid}:${error?.message || 'unknown error'}`);
      }
    }
    // Nobody in this slot could move: stop instead of spinning through the remaining slots.
    if (!moved) break;
  }

  return {
    hashes,
    applied,
    rejected: errors.length,
    errors,
    finished: state.phase === 'finished',
    winnerUid: state.winnerUid ?? null,
  };
}
