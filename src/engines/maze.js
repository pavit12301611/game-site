/**
 * maze engine — simultaneous tile race: everyone moves at once, first to the star gate wins.
 * Games: Maze Runner (7x7 classic), Neon Labyrinth (7x7 spiral), Byte Escape (7x7 pillars),
 * Star Runner (9x9 zigzag).
 *
 * Each game has its own wall layout rather than the same board with a new title: `classic` keeps the
 * original hand-drawn 7x7 wall set, and the generated layouts are pruned until every starting tile
 * can still reach the star, so no variant can deal an impossible maze. Every player sees exactly the
 * same walls, and `scores` counts steps taken, so the winner is also the shortest route.
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import { assertPlaying, newBase, scoresFor } from './shared.js';

export const MAZE_WALLS = [8, 9, 11, 15, 18, 22, 24, 25, 29, 32, 33, 37, 38];

const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Wall cells, as a set, for each named layout. Each returns flat board indices. */
const LAYOUTS = {
  classic: (width, height) => (width === 7 && height === 7 ? new Set(MAZE_WALLS) : pillarWalls(width, height)),
  spiral: (width, height) => {
    const walls = new Set();
    for (let x = 1; x <= width - 2; x += 1) walls.add(2 * width + x);
    for (let y = 2; y <= height - 3; y += 1) walls.add(y * width + (width - 3));
    for (let x = 3; x <= width - 3; x += 1) walls.add((height - 3) * width + x);
    return walls;
  },
  pillars: (width, height) => pillarWalls(width, height),
  zigzag: (width, height) => {
    const walls = new Set();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if ((x + y * 2) % 5 === 2) walls.add(y * width + x);
      }
    }
    return walls;
  },
};

/** Evenly spaced pillars: open enough to always be solvable. */
function pillarWalls(width, height) {
  const walls = new Set();
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) walls.add(y * width + x);
  }
  return walls;
}

/** @param {string} layout @param {number} width @param {number} height @returns {number[]} */
export function wallsForLayout(layout, width, height) {
  const build = LAYOUTS[layout] ?? LAYOUTS.classic;
  const walls = build(width, height);
  // Start tiles are the bottom row at x = 0, 2, 4 …; the goal is the top-right corner.
  const starts = [0, 2, 4].map((x) => ({ x, y: height - 1 }));
  const goal = { x: width - 1, y: 0 };
  const candidates = [...walls].sort((a, b) => a - b);
  for (const wall of candidates) {
    if (starts.every((start) => canReach(start, goal, walls, width, height))) break;
    walls.delete(wall);
  }
  return [...walls].sort((a, b) => a - b);
}

/**
 * Breadth-first search used to guarantee a layout is playable.
 * @param {{x: number, y: number}} from @param {{x: number, y: number}} to
 * @param {Set<number>} walls @param {number} width @param {number} height
 */
export function canReach(from, to, walls, width, height) {
  const seen = new Set([from.y * width + from.x]);
  const queue = [from];
  while (queue.length) {
    const current = /** @type {{x: number, y: number}} */ (queue.shift());
    if (current.x === to.x && current.y === to.y) return true;
    for (const [dx, dy] of Object.values(DIRECTIONS)) {
      const x = current.x + dx;
      const y = current.y + dy;
      const index = y * width + x;
      if (x < 0 || x >= width || y < 0 || y >= height || walls.has(index) || seen.has(index)) continue;
      seen.add(index);
      queue.push({ x, y });
    }
  }
  return false;
}

/**
 * @param {Game} game
 * @param {Player[]} players
 * @returns {GameState}
 */
export function createInitialState(game, players) {
  const width = game.options.width;
  const height = game.options.height;
  const layout = game.options.layout || 'classic';
  const starts = players.map((_, index) => ({ x: index * 2, y: height - 1 }));
  return {
    ...newBase(players),
    turnUid: null,
    width,
    height,
    layout,
    walls: wallsForLayout(layout, width, height),
    positions: Object.fromEntries(players.map((player, index) => [player.uid, starts[index]])),
    goal: { x: width - 1, y: 0 },
    scores: scoresFor(players.map((player) => player.uid)),
  };
}

/**
 * @param {Game} game
 * @param {GameState} state
 * @param {string} uid
 * @param {Action} action
 * @returns {GameState}
 */
export function applyAction(game, state, uid, action) {
  assertPlaying(state);
  const delta = DIRECTIONS[action.direction];
  if (!delta) throw new Error('Choose a direction to move.');
  const position = state.positions[uid];
  const x = position.x + delta[0];
  const y = position.y + delta[1];
  const index = y * state.width + x;
  if (x < 0 || x >= state.width || y < 0 || y >= state.height || state.walls.includes(index)) {
    throw new Error('There is a wall in the way.');
  }
  state.positions[uid] = { x, y };
  state.scores[uid] = (state.scores[uid] ?? 0) + 1;
  state.moves += 1;
  if (x === state.goal.x && y === state.goal.y) {
    state.phase = 'finished';
    state.winnerUid = uid;
    state.result = 'winner';
  }
  return state;
}
