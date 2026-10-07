/**
 * Shared utilities for all game engines: deterministic PRNG, deep copy, and player assertions.
 */

/**
 * A simple seeded PRNG (mulberry32). Produces the same sequence for the same seed.
 * @param {string} seed
 * @returns {() => number} returns 0–1 floats
 */
export function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deep clone a plain object (game state).
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function copy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Throws if the game is already finished.
 * @param {{ status: string }} state
 */
export function assertPlaying(state) {
  if (state.status === 'finished') throw new Error('This game is already over.');
}

/**
 * Returns the uid of the current turn holder.
 * @param {{ turnIndex: number }} state
 * @param {Array<{ uid: string }>} players
 * @returns {string}
 */
export function currentPlayer(state, players) {
  return players[state.turnIndex % players.length]?.uid || '';
}

/**
 * Advances the turn to the next player.
 * @param {{ turnIndex: number }} state
 * @param {number} playerCount
 */
export function advanceTurn(state, playerCount) {
  state.turnIndex = (state.turnIndex + 1) % playerCount;
}

/**
 * Sets the winner and finishes the game.
 * @param {{ status: string, winner: string }} state
 * @param {string} uid
 */
export function declareWinner(state, uid) {
  state.status = 'finished';
  state.winner = uid;
}

/**
 * Declares a draw.
 * @param {{ status: string, winner: string }} state
 */
export function declareDraw(state) {
  state.status = 'finished';
  state.winner = 'draw';
}

/**
 * Asserts it is the caller's turn.
 * @param {string} uid
 * @param {string} expectedUid
 */
export function assertTurn(uid, expectedUid) {
  if (uid !== expectedUid) throw new Error('It is not your turn.');
}

/**
 * Asserts an index is within bounds.
 * @param {number} index
 * @param {number} min
 * @param {number} max
 */
export function assertInRange(index, min, max) {
  if (!Number.isInteger(index) || index < min || index >= max)
    throw new Error(`Position must be between ${min} and ${max - 1}.`);
}