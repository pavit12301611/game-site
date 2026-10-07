/**
 * Battle engine: fleet radar games (sea battle, pixel fleet, alien skirmish).
 *
 * Options: { board: number, fleet: number }
 * Players place hidden ships, then take turns firing at each other's grids.
 */

import { seededRandom, assertPlaying, currentPlayer, advanceTurn, declareWinner, assertTurn } from './shared.js';

export function createInitialState(game, players, seed) {
  const rng = seededRandom(seed);
  const { board, fleet } = game.options;

  const grids = {};
  const shots = {};

  for (const p of players) {
    // Place fleet randomly
    const shipCells = new Set();
    while (shipCells.size < fleet) {
      const cell = Math.floor(rng() * board * board);
      shipCells.add(cell);
    }
    grids[p.uid] = {
      ships: [...shipCells], // hidden: only sent via private view
      hits: Array(board * board).fill(false),
    };
    shots[p.uid] = Array(board * board).fill(false); // shots this player has fired
  }

  return {
    engine: 'battle',
    board,
    fleet,
    grids,
    shots,
    turnIndex: 0,
    status: 'playing',
    winner: '',
    lastShot: null, // { shooter, target, cell, hit }
    seed,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  const current = currentPlayer(state, players);
  assertTurn(uid, current);

  if (action.type !== 'fire') throw new Error('Use the fire action.');
  const { targetUid, index } = action;

  if (!players.some(p => p.uid === targetUid)) throw new Error('Invalid target.');
  if (targetUid === uid) throw new Error('You cannot fire at yourself.');
  if (index < 0 || index >= state.board * state.board) throw new Error('Invalid cell.');

  if (state.shots[uid]?.[index]) throw new Error('You already fired at that cell.');

  state.shots[uid] = state.shots[uid] || Array(state.board * state.board).fill(false);
  state.shots[uid][index] = true;

  const hit = (state.grids[targetUid]?.ships || []).includes(index);
  if (hit) {
    state.grids[targetUid].hits[index] = true;
  }

  state.lastShot = { shooter: uid, target: targetUid, cell: index, hit };

  // Check if all of target's ships are sunk
  const targetShips = state.grids[targetUid]?.ships || [];
  const targetHits = state.grids[targetUid]?.hits || [];
  const allSunk = targetShips.every(cell => targetHits[cell]);

  if (allSunk) {
    // Check if this shooter is the last one standing
    const alivePlayers = players.filter(p => {
      const ships = state.grids[p.uid]?.ships || [];
      const hits = state.grids[p.uid]?.hits || [];
      return !ships.every(cell => hits[cell]);
    });

    if (alivePlayers.length <= 1) {
      declareWinner(state, uid);
      return state;
    }
  }

  advanceTurn(state, players.length);
  return state;
}