/**
 * The cells that make up a winning run on a flat board (line and drop engines).
 * Pure and read-only: it only looks at the board, so the engines stay the single source of the rules.
 *
 * @param {(string | null)[]} board flat board, row by row
 * @param {number} width cells per row
 * @param {number} connect run length that wins
 * @returns {Set<number>} indexes of every cell in a run of at least `connect` equal marks
 */
export function winningCells(board, width, connect) {
  const found = new Set();
  const height = Math.floor(board.length / width);
  for (let index = 0; index < board.length; index += 1) {
    const uid = board[index];
    if (!uid) continue;
    const row = Math.floor(index / width);
    const col = index % width;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const run = [index];
      let x = col + dx;
      let y = row + dy;
      while (x >= 0 && x < width && y >= 0 && y < height && board[y * width + x] === uid) {
        run.push(y * width + x);
        x += dx;
        y += dy;
      }
      if (run.length >= connect) run.forEach((cell) => found.add(cell));
    }
  }
  return found;
}
