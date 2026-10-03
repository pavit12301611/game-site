export const WIDTH = 800, HEIGHT = 520;
export function brickField(level) {
  return Array.from({ length: 50 }, (_, i) => ({ x: 40 + (i % 10) * 73, y: 64 + Math.floor(i / 10) * 29, w: 66, h: 20, alive: true, color: Math.floor(i / 10), offset: level }));
}
export function createBreakout() {
  return { paddle: 400, ball: { x: 400, y: 460, vx: 0, vy: 0 }, bricks: brickField(1), serving: true, lives: 3, level: 1, score: 0, phase: 'running' };
}
export function serve(state) { state.serving = true; state.ball = { x: state.paddle, y: 460, vx: 0, vy: 0 }; }
export function stepBreakout(state, input, delta) {
  if (state.phase !== 'running') return;
  const dt = Math.min(Math.max(delta, 0), 0.033);
  state.paddle = Math.max(60, Math.min(740, typeof input.target === 'number' ? input.target : state.paddle + (input.right - input.left) * 560 * dt));
  const ball = state.ball;
  if (state.serving) {
    ball.x = state.paddle; ball.y = 460;
    if (!input.fire) return;
    state.serving = false; ball.vx = 145; ball.vy = -(265 + state.level * 25);
  }
  const oldY = ball.y;
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  if (ball.x < 8 || ball.x > WIDTH - 8) { ball.x = Math.max(8, Math.min(WIDTH - 8, ball.x)); ball.vx *= -1; }
  if (ball.y < 8) { ball.y = 8; ball.vy = Math.abs(ball.vy); }
  if (ball.vy > 0 && oldY + 8 <= 478 && ball.y + 8 >= 478 && Math.abs(ball.x - state.paddle) <= 64) {
    const offset = Math.max(-0.94, Math.min(0.94, (ball.x - state.paddle) / 58));
    const speed = 335 + state.level * 35;
    ball.vx = Math.sin(offset * 1.1) * speed; ball.vy = -Math.cos(offset * 1.1) * speed; ball.y = 469;
  }
  for (const brick of state.bricks) {
    if (!brick.alive || ball.x + 8 < brick.x || ball.x - 8 > brick.x + brick.w || ball.y + 8 < brick.y || ball.y - 8 > brick.y + brick.h) continue;
    brick.alive = false; state.score += 10;
    if (oldY + 8 <= brick.y || oldY - 8 >= brick.y + brick.h) ball.vy *= -1; else ball.vx *= -1;
    break;
  }
  if (state.bricks.every(b => !b.alive)) {
    if (state.level === 3) state.phase = 'won';
    else { state.level++; state.bricks = brickField(state.level); serve(state); }
  } else if (ball.y > HEIGHT + 8) {
    state.lives--; if (!state.lives) state.phase = 'lost'; else serve(state);
  }
}
