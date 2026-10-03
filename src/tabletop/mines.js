/** Nine by nine Minesweeper, ten mines. First reveal and its neighbours are safe. */
export const SIZE = 9, MINE_COUNT = 10;
export function neighbours(index) {
  const x = index % SIZE, y = Math.floor(index / SIZE), result = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) result.push(ny * SIZE + nx);
  }
  return result;
}
export function createMines() {
  return { mines: Array(81).fill(false), counts: Array(81).fill(0), revealed: Array(81).fill(false), flags: Array(81).fill(false), planted: false, phase: 'playing', exploded: -1, moves: 0 };
}
function plant(state, first, random) {
  const protectedCells = new Set([first, ...neighbours(first)]);
  const candidates = Array.from({ length: 81 }, (_, i) => i).filter(i => !protectedCells.has(i));
  for (let i = 0; i < MINE_COUNT; i++) {
    const pick = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    state.mines[candidates.splice(pick, 1)[0]] = true;
  }
  state.counts = state.mines.map((_, i) => neighbours(i).filter(n => state.mines[n]).length);
  state.planted = true;
}
export function flagMine(state, index) {
  if (state.phase !== 'playing' || !Number.isInteger(index) || index < 0 || index >= 81 || state.revealed[index]) return false;
  if (!state.flags[index] && state.flags.filter(Boolean).length >= MINE_COUNT) return false;
  state.flags[index] = !state.flags[index]; return true;
}
export function revealMine(state, index, random = Math.random) {
  if (state.phase !== 'playing' || !Number.isInteger(index) || index < 0 || index >= 81 || state.flags[index] || state.revealed[index]) return false;
  if (!state.planted) plant(state, index, random);
  state.moves++;
  if (state.mines[index]) { state.revealed[index] = true; state.exploded = index; state.phase = 'lost'; return true; }
  const queue = [index];
  while (queue.length) {
    const cell = queue.pop();
    if (state.revealed[cell] || state.flags[cell] || state.mines[cell]) continue;
    state.revealed[cell] = true;
    if (!state.counts[cell]) queue.push(...neighbours(cell));
  }
  if (state.revealed.filter(Boolean).length === 81 - MINE_COUNT) state.phase = 'won';
  return true;
}
