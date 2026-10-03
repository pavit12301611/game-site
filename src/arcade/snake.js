export const COLS = 24, ROWS = 18;
const VECTORS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export function placeFood(state, random = Math.random) {
  const occupied = new Set(state.body.map(p => p.y * COLS + p.x));
  const empty = Array.from({ length: COLS * ROWS }, (_, i) => i).filter(i => !occupied.has(i));
  if (!empty.length) { state.phase = 'won'; state.food = null; return; }
  const index = empty[Math.min(empty.length - 1, Math.floor(random() * empty.length))];
  state.food = { x: index % COLS, y: Math.floor(index / COLS) };
}
export function createSnake(random = Math.random) {
  const state = { body: [{ x: 6, y: 9 }, { x: 5, y: 9 }, { x: 4, y: 9 }], direction: 'right', pending: '', accumulator: 0, score: 0, level: 1, phase: 'running', food: /** @type {{x:number,y:number} | null} */ (null) };
  placeFood(state, random); return state;
}
export function turnSnake(state, direction) {
  if (state.pending || state.phase !== 'running' || !VECTORS[direction]) return;
  const [x, y] = VECTORS[state.direction], [nx, ny] = VECTORS[direction];
  if (nx === -x && ny === -y || direction === state.direction) return;
  state.pending = direction;
}
export function stepSnake(state, delta, random = Math.random) {
  if (state.phase !== 'running') return;
  state.accumulator += Math.min(Math.max(delta, 0), 0.1);
  const interval = Math.max(0.075, 0.17 - (state.level - 1) * 0.012);
  if (state.accumulator < interval) return;
  state.accumulator -= interval;
  if (state.pending) { state.direction = state.pending; state.pending = ''; }
  const [dx, dy] = VECTORS[state.direction];
  const head = { x: state.body[0].x + dx, y: state.body[0].y + dy };
  const eats = state.food && head.x === state.food.x && head.y === state.food.y;
  const body = eats ? state.body : state.body.slice(0, -1);
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS || body.some(p => p.x === head.x && p.y === head.y)) { state.phase = 'lost'; return; }
  state.body.unshift(head);
  if (eats) { state.score += 10; state.level = 1 + Math.floor(state.score / 50); placeFood(state, random); }
  else state.body.pop();
}
