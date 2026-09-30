/**
 * Helpers shared by every game engine in this folder.
 *
 * An engine is a pure module with exactly two exports:
 *
 *   createInitialState(game, players, seed) -> state   plain JSON, safe to store in Firestore
 *   applyAction(game, state, uid, action, players)     -> next state, or throws with a player-facing message
 *
 * Engines never touch the DOM, the network, `Date.now()` or `Math.random()`. Every "random" choice
 * comes from `makeRandom(seed)` so the same room seed always deals the same game.
 */

/** @template T @param {T} value @returns {T} */
export function copy(value) {
  return structuredClone(value);
}

/**
 * FNV-1a hash. Used both as a deterministic RNG seed and to decide coin flips without randomness
 * that a client could predict or replay differently.
 *
 * @param {string} text
 * @returns {number} unsigned 32-bit hash
 */
export function hashNumber(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Seeded pseudo-random generator (mulberry32). Same seed -> same sequence, on every device.
 *
 * @param {string} seed
 * @returns {() => number} random float in [0, 1)
 */
export function makeRandom(seed) {
  let state = hashNumber(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle.
 *
 * @template T
 * @param {T[]} values
 * @param {string} seed
 * @returns {T[]}
 */
export function shuffled(values, seed) {
  const items = [...values];
  const random = makeRandom(seed);
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

/** @returns {string} the uid that plays after `uid`, wrapping around and skipping nobody. */
export function nextPlayer(players, uid) {
  const index = players.findIndex((player) => player.uid === uid);
  return players[(index + 1 + players.length) % players.length]?.uid ?? uid;
}

/**
 * @param {{ uid: string }[]} players
 * @param {Record<string, number>} scores
 * @returns {string | null} the single highest scorer, or null for a tie / an all-zero board
 */
export function winnerFromScores(players, scores) {
  const highScore = Math.max(0, ...players.map((player) => scores[player.uid] ?? 0));
  const winners = players.filter((player) => (scores[player.uid] ?? 0) === highScore);
  return winners.length === 1 ? winners[0].uid : null;
}

/** Fields every engine state starts from. @returns {Record<string, any>} */
export function newBase(players, firstUid) {
  return {
    phase: 'playing',
    turnUid: firstUid ?? players[0]?.uid ?? null,
    winnerUid: null,
    result: null,
    moves: 0,
  };
}

/** @param {string[]} ids @returns {Record<string, number>} a zero score for every player. */
export function scoresFor(ids) {
  return Object.fromEntries(ids.map((uid) => [uid, 0]));
}

/** Ends a score-based game: one clear leader wins, anything else is a draw. */
export function finishByScore(state, players, scoreMap) {
  const winnerUid = winnerFromScores(players, scoreMap);
  state.phase = 'finished';
  state.winnerUid = winnerUid;
  state.result = winnerUid ? 'winner' : 'draw';
}

/** @throws {Error} when the match is already over. */
export function assertPlaying(state) {
  if (state.phase !== 'playing') throw new Error('This round is already over.');
}

/** @throws {Error} when it is not `uid`'s turn (engines without turns simply do not call this). */
export function assertTurn(state, uid) {
  if (state.turnUid && state.turnUid !== uid) throw new Error('Wait for your turn.');
}

/** Hands the turn to the next player. */
export function advanceTurn(state, players, uid) {
  state.turnUid = nextPlayer(players, uid);
}

/**
 * True when the mark just placed at `index` completes a line of at least `connect`.
 * Used by both grid engines (line, drop): `size` is the row length of the flat board.
 */
export function resolveLineWinner(board, size, index, uid, connect) {
  const row = Math.floor(index / size);
  const col = index % size;
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of directions) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let x = col + dx * sign;
      let y = row + dy * sign;
      while (x >= 0 && x < size && y >= 0 && y < size && board[y * size + x] === uid) {
        count += 1;
        x += dx * sign;
        y += dy * sign;
      }
    }
    if (count >= connect) return true;
  }
  return false;
}

/**
 * Starting state for the two "first to N" engines (race and rally). They share the shape; only
 * the turn handling differs: race is a real-time free-for-all, rally alternates volleys.
 */
export function createRaceState(game, players) {
  const ids = players.map((player) => player.uid);
  return {
    ...newBase(players),
    turnUid: game.engine === 'race' ? null : ids[0],
    scores: scoresFor(ids),
    target: game.options.target,
    lastAction: null,
  };
}
