/** Reversi with legal captures, forced passes and a small deterministic CPU evaluator. */
const DIRECTIONS = [-1, 0, 1].flatMap(y => [-1, 0, 1].map(x => [x, y])).filter(([x, y]) => x || y);
export function createReversi() {
  const board = Array(64).fill(0); board[27] = board[36] = 2; board[28] = board[35] = 1;
  return { board, turn: 1, phase: 'playing', winner: 0, moves: 0, last: -1, flipped: [], passed: 0 };
}
export function captures(board, index, player) {
  if (!Number.isInteger(index) || index < 0 || index >= 64 || board[index]) return [];
  const found = [], x = index % 8, y = Math.floor(index / 8);
  for (const [dx, dy] of DIRECTIONS) {
    const ray = []; let nx = x + dx, ny = y + dy;
    while (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny * 8 + nx] === 3 - player) { ray.push(ny * 8 + nx); nx += dx; ny += dy; }
    if (ray.length && nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny * 8 + nx] === player) found.push(...ray);
  }
  return found;
}
export function legalMoves(board, player) { return board.map((_, i) => i).filter(i => captures(board, i, player).length); }
export function countDiscs(board) { return [board.filter(x => x === 1).length, board.filter(x => x === 2).length]; }
export function playReversi(state, index) {
  if (state.phase !== 'playing') return false;
  const flipped = captures(state.board, index, state.turn); if (!flipped.length) return false;
  state.board[index] = state.turn; flipped.forEach(i => { state.board[i] = state.turn; });
  state.flipped = flipped; state.last = index; state.moves++; state.passed = 0;
  const other = 3 - state.turn;
  if (legalMoves(state.board, other).length) state.turn = other;
  else if (legalMoves(state.board, state.turn).length) state.passed = other;
  else { const [black, white] = countDiscs(state.board); state.phase = 'finished'; state.winner = black === white ? 0 : black > white ? 1 : 2; }
  return true;
}
function positionValue(board, player) {
  const weights = [90, -20, 8, 5, 5, 8, -20, 90];
  return board.reduce((score, value, i) => {
    if (!value) return score;
    const x = i % 8, y = Math.floor(i / 8);
    const weight = y === 0 || y === 7 ? weights[x] : x === 0 || x === 7 ? weights[y] : (x === 1 || x === 6) && (y === 1 || y === 6) ? -25 : 1;
    return score + (value === player ? weight : -weight);
  }, 0) + 4 * (legalMoves(board, player).length - legalMoves(board, 3 - player).length);
}
export function chooseReversiMove(state) {
  let best = -Infinity, choice = -1;
  for (const move of legalMoves(state.board, state.turn)) {
    const copy = { ...state, board: [...state.board] }; playReversi(copy, move);
    let score = positionValue(copy.board, state.turn);
    if (copy.phase === 'playing' && copy.turn !== state.turn) {
      score = Math.min(...legalMoves(copy.board, copy.turn).map(reply => {
        const next = { ...copy, board: [...copy.board] }; playReversi(next, reply); return positionValue(next.board, state.turn);
      }));
    }
    if (score > best) { best = score; choice = move; }
  }
  return choice;
}
