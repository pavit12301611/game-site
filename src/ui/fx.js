/**
 * Visual effects: applied after each render.
 */

export function applyFx(root) {
  // Neon glow animation on active boards
  const boards = root.querySelectorAll('.board-cell.is-active');
  boards.forEach(cell => cell.classList.add('glow-pulse'));
}