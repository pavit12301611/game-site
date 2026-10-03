/** 2048: pure board transitions; each tile may merge only once per move. */
export function addTile(board, random = Math.random) {
  const empty = board.map((value, i) => value === 0 ? i : -1).filter(i => i >= 0);
  if (!empty.length) return -1;
  const index = empty[Math.min(empty.length - 1, Math.floor(random() * empty.length))];
  board[index] = random() < 0.9 ? 2 : 4;
  return index;
}
export function createMerge(random = Math.random) {
  const state = { board: Array(16).fill(0), score: 0, moves: 0, phase: 'playing', spawned: -1 };
  addTile(state.board, random); state.spawned = addTile(state.board, random); return state;
}
export function collapse(line) {
  const values = line.filter(Boolean), result = []; let score = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === values[i + 1]) { result.push(values[i] * 2); score += values[i] * 2; i++; }
    else result.push(values[i]);
  }
  while (result.length < 4) result.push(0);
  return { result, score };
}
export function canMove(board) {
  return board.some((value, i) => !value || i % 4 < 3 && value === board[i + 1] || i < 12 && value === board[i + 4]);
}
export function moveMerge(state, direction, random = Math.random) {
  if (state.phase !== 'playing' || !['left', 'right', 'up', 'down'].includes(direction)) return false;
  const next = [...state.board]; let score = 0;
  for (let line = 0; line < 4; line++) {
    const indices = Array.from({ length: 4 }, (_, n) => direction === 'left' ? line * 4 + n : direction === 'right' ? line * 4 + 3 - n : direction === 'up' ? n * 4 + line : (3 - n) * 4 + line);
    const merged = collapse(indices.map(i => state.board[i]));
    indices.forEach((index, n) => { next[index] = merged.result[n]; }); score += merged.score;
  }
  if (next.every((value, i) => value === state.board[i])) { if (!canMove(next)) state.phase = 'lost'; return false; }
  state.board = next; state.score += score; state.moves++;
  state.spawned = addTile(state.board, random);
  if (state.board.includes(2048)) state.phase = 'won'; else if (!canMove(state.board)) state.phase = 'lost';
  return true;
}
