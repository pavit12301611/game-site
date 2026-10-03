/** Deterministic top-down golf. Small physics substeps prevent tunnelling through bumpers. */
export const COURSES = [
  { name: 'The opening line', start: { x: 100, y: 330 }, cup: { x: 650, y: 110 }, par: 2, walls: [{ x: 330, y: 190, w: 40, h: 160 }] },
  { name: 'Between the banks', start: { x: 110, y: 350 }, cup: { x: 680, y: 95 }, par: 3, walls: [{ x: 260, y: 40, w: 34, h: 205 }, { x: 480, y: 210, w: 34, h: 230 }] },
  { name: 'The final approach', start: { x: 95, y: 95 }, cup: { x: 680, y: 350 }, par: 3, walls: [{ x: 280, y: 40, w: 32, h: 225 }, { x: 470, y: 215, w: 140, h: 32 }] },
];
export function createGolf() {
  return { hole: 0, x: COURSES[0].start.x, y: COURSES[0].start.y, vx: 0, vy: 0, strokes: 0, total: 0, results: [], phase: 'playing', collisions: 0 };
}
export function golfMoving(state) { return Math.hypot(state.vx, state.vy) > 0; }
export function hitGolf(state, angle, power) {
  if (state.phase !== 'playing' || golfMoving(state) || !Number.isFinite(angle) || !Number.isFinite(power)) return false;
  const speed = Math.max(0.1, Math.min(1, power)) * 640;
  state.vx = Math.cos(angle) * speed; state.vy = Math.sin(angle) * speed; state.strokes++; state.total++; return true;
}
export function nextHole(state) {
  if (state.phase !== 'holed') return false;
  if (state.hole >= COURSES.length - 1) { state.phase = 'finished'; return true; }
  state.hole++; const start = COURSES[state.hole].start;
  state.x = start.x; state.y = start.y; state.vx = state.vy = 0; state.strokes = 0; state.phase = 'playing'; return true;
}
export function resetGolfBall(state) {
  if (state.phase !== 'playing') return;
  const start = COURSES[state.hole].start; state.x = start.x; state.y = start.y; state.vx = state.vy = 0; state.strokes++; state.total++;
}
export function stepGolf(state, delta) {
  if (state.phase !== 'playing' || !golfMoving(state)) return;
  const dt = Math.min(0.05, Math.max(0, delta));
  const steps = Math.max(1, Math.ceil(dt / (1 / 240))), sub = dt / steps, r = 8;
  const course = COURSES[state.hole];
  for (let i = 0; i < steps; i++) {
    state.x += state.vx * sub; state.y += state.vy * sub;
    if (state.x < 40 + r || state.x > 760 - r) { state.x = Math.max(40 + r, Math.min(760 - r, state.x)); state.vx *= -0.78; state.collisions++; }
    if (state.y < 40 + r || state.y > 440 - r) { state.y = Math.max(40 + r, Math.min(440 - r, state.y)); state.vy *= -0.78; state.collisions++; }
    for (const wall of course.walls) {
      const cx = Math.max(wall.x, Math.min(wall.x + wall.w, state.x)), cy = Math.max(wall.y, Math.min(wall.y + wall.h, state.y));
      const dx = state.x - cx, dy = state.y - cy, distance = Math.hypot(dx, dy);
      if (distance >= r) continue;
      if (distance > 0) {
        const nx = dx / distance, ny = dy / distance, dot = state.vx * nx + state.vy * ny;
        state.x = cx + nx * (r + 0.01); state.y = cy + ny * (r + 0.01);
        if (dot < 0) { state.vx -= 1.78 * dot * nx; state.vy -= 1.78 * dot * ny; state.collisions++; }
      }
    }
    if (Math.hypot(state.x - course.cup.x, state.y - course.cup.y) < 12 && Math.hypot(state.vx, state.vy) < 165) {
      state.x = course.cup.x; state.y = course.cup.y; state.vx = state.vy = 0; state.phase = 'holed'; state.results.push(state.strokes); return;
    }
    const friction = Math.exp(-0.9 * sub); state.vx *= friction; state.vy *= friction;
    if (Math.hypot(state.vx, state.vy) < 5) { state.vx = state.vy = 0; break; }
  }
}
