/**
 * Maze engine: labyrinth races.
 *
 * Options: { width: number, height: number, layout: 'classic'|'spiral'|'pillars'|'zigzag' }
 * All players move simultaneously. First to reach the star wins.
 */

import { seededRandom, assertPlaying, declareWinner } from './shared.js';

export function createInitialState(game, players, seed) {
  const { width, height, layout } = game.options;
  const rng = seededRandom(seed);
  const grid = generateMaze(width, height, layout, rng);

  // Place players at random walkable positions (not the goal)
  const walkable = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === 0 && !(x === width - 1 && y === height - 1)) {
        walkable.push({ x, y });
      }
    }
  }

  // Shuffle walkable positions
  for (let i = walkable.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [walkable[i], walkable[j]] = [walkable[j], walkable[i]];
  }

  const positions = {};
  const steps = {};
  players.forEach((p, i) => {
    const pos = walkable[i % walkable.length];
    positions[p.uid] = { x: pos.x, y: pos.y };
    steps[p.uid] = 0;
  });

  return {
    engine: 'maze',
    grid,
    width,
    height,
    goalX: width - 1,
    goalY: height - 1,
    positions,
    steps,
    turnIndex: 0,
    status: 'playing',
    winner: '',
    seed,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  if (!players.some(p => p.uid === uid)) throw new Error('You are not in this game.');
  if (!state.positions[uid]) throw new Error('You are not in the maze.');

  const { direction } = action;
  const pos = state.positions[uid];
  const dx = { left: -1, right: 1, up: 0, down: 0 }[direction] ?? null;
  const dy = { up: -1, down: 1, left: 0, right: 0 }[direction] ?? null;

  if (dx === null || dy === null) throw new Error('Use up, down, left or right.');

  const nx = pos.x + dx;
  const ny = pos.y + dy;

  if (nx < 0 || nx >= state.width || ny < 0 || ny >= state.height) throw new Error('You hit the edge.');
  if (state.grid[ny][nx] === 1) throw new Error('There is a wall in the way.');

  pos.x = nx;
  pos.y = ny;
  state.steps[uid]++;

  // Check if reached the goal
  if (nx === state.goalX && ny === state.goalY) {
    declareWinner(state, uid);
  }

  return state;
}

/**
 * Generates a maze grid: 0 = walkable, 1 = wall.
 * Uses a recursive backtracker modified for the desired layout.
 */
function generateMaze(width, height, layout, rng) {
  // Initialize all walls
  const grid = Array.from({ length: height }, () => Array(width).fill(1));

  // Carve passages
  const carve = (x, y) => {
    grid[y][x] = 0;
    const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    // Shuffle directions
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === 1) {
        grid[y + dy / 2][x + dx / 2] = 0;
        carve(nx, ny);
      }
    }
  };

  carve(1, 1);

  // Ensure goal and start are walkable
  grid[height - 1][width - 1] = 0;
  grid[0][0] = 0;
  // Ensure neighbors of goal are reachable
  if (width > 1) grid[height - 1][width - 2] = 0;
  if (height > 1) grid[height - 2][width - 1] = 0;

  // Apply layout modifications
  if (layout === 'pillars') {
    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        if (rng() > 0.5) grid[y][x] = 1;
      }
    }
  }

  return grid;
}