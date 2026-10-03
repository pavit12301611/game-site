export function formation(wave) {
  return Array.from({ length: 32 }, (_, i) => ({ x: 105 + (i % 8) * 76, y: 60 + Math.floor(i / 8) * 42, alive: true, row: Math.floor(i / 8), wave }));
}
export function createShooter() {
  return { x: 400, score: 0, lives: 3, level: 1, phase: 'running', enemies: formation(1), shots: [], bombs: [], direction: 1, cooldown: 0, bombClock: 0.9, invulnerable: 0 };
}
export function stepShooter(state, input, delta, random = Math.random) {
  if (state.phase !== 'running') return;
  const dt = Math.min(Math.max(delta, 0), 0.033);
  state.x = Math.max(24, Math.min(776, typeof input.target === 'number' ? input.target : state.x + (input.right - input.left) * 360 * dt));
  state.cooldown -= dt; state.bombClock -= dt; state.invulnerable = Math.max(0, state.invulnerable - dt);
  if (input.fire && state.cooldown <= 0) { state.shots.push({ x: state.x, y: 462 }); state.cooldown = 0.19; }
  const live = state.enemies.filter(e => e.alive);
  const speed = 20 + state.level * 9 + (32 - live.length) * 1.8;
  live.forEach(e => { e.x += state.direction * speed * dt; });
  if (live.some(e => e.x < 24 || e.x > 776)) { state.direction *= -1; live.forEach(e => { e.x = Math.max(24, Math.min(776, e.x)); e.y += 20; }); }
  if (state.bombClock <= 0 && live.length) {
    const enemy = live[Math.min(live.length - 1, Math.floor(random() * live.length))];
    state.bombs.push({ x: enemy.x, y: enemy.y + 18 }); state.bombClock = Math.max(0.3, 1.1 - state.level * 0.16);
  }
  state.shots.forEach(shot => { shot.y -= 540 * dt;
    const enemy = live.find(e => e.alive && Math.abs(e.x - shot.x) < 23 && Math.abs(e.y - shot.y) < 18);
    if (enemy) { enemy.alive = false; shot.y = -100; state.score += 25; }
  });
  state.bombs.forEach(bomb => { bomb.y += (180 + state.level * 25) * dt;
    if (Math.abs(bomb.x - state.x) < 20 && Math.abs(bomb.y - 480) < 20 && !state.invulnerable) { state.lives--; state.invulnerable = 1.5; bomb.y = 600; }
  });
  state.shots = state.shots.filter(s => s.y > -10); state.bombs = state.bombs.filter(b => b.y < 540);
  if (!state.lives || live.some(e => e.alive && e.y >= 450)) state.phase = 'lost';
  else if (state.enemies.every(e => !e.alive)) {
    if (state.level === 3) state.phase = 'won';
    else { state.level++; state.enemies = formation(state.level); state.shots = []; state.bombs = []; state.direction = 1; state.bombClock = 1; }
  }
}
