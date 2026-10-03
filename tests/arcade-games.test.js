import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnake, stepSnake, turnSnake, placeFood, COLS, ROWS } from '../src/arcade/snake.js';
import { createBreakout, stepBreakout } from '../src/arcade/breakout.js';
import { createShooter, stepShooter } from '../src/arcade/shooter.js';
const idle = { left: 0, right: 0, fire: false };
function snakeTick(state) { stepSnake(state, 0.1, () => 0); stepSnake(state, 0.1, () => 0); }

test('Snake grows, scores, and spawns food outside its body', () => {
  const s = createSnake(() => 0); s.food = { x: 7, y: 9 }; snakeTick(s);
  assert.equal(s.score, 10); assert.equal(s.body.length, 4); assert.equal(s.body[0].x, 7);
  assert.ok(!s.body.some(p => p.x === s.food.x && p.y === s.food.y));
});
test('Snake rejects reversing and queues at most one turn per simulation step', () => {
  const s = createSnake(); turnSnake(s, 'left'); assert.equal(s.pending, '');
  turnSnake(s, 'up'); turnSnake(s, 'left'); snakeTick(s);
  assert.equal(s.direction, 'up'); assert.equal(s.body[0].y, 8);
});
test('Snake loses to walls and self-collision; stopped games do not keep moving', () => {
  const wall = createSnake(); wall.body[0].x = COLS - 1; snakeTick(wall); assert.equal(wall.phase, 'lost');
  const saved = JSON.stringify(wall); snakeTick(wall); assert.equal(JSON.stringify(wall), saved);
  const self = createSnake(); self.body = [{ x: 6, y: 9 }, { x: 7, y: 9 }, { x: 7, y: 10 }, { x: 6, y: 10 }]; snakeTick(self); assert.equal(self.phase, 'lost');
});
test('Snake can enter a vacating tail cell and filling the board wins', () => {
  const s = createSnake(); s.body = [{ x: 6, y: 9 }, { x: 6, y: 10 }, { x: 7, y: 10 }, { x: 7, y: 9 }]; snakeTick(s); assert.equal(s.phase, 'running');
  s.body = Array.from({ length: COLS * ROWS }, (_, i) => ({ x: i % COLS, y: Math.floor(i / COLS) })); placeFood(s); assert.equal(s.phase, 'won'); assert.equal(s.food, null);
});
test('Snake speed level advances after five food orbs', () => {
  const s = createSnake(); s.score = 40; s.food = { x: 7, y: 9 }; snakeTick(s); assert.equal(s.level, 2);
});
test('Breakout waits for a serve, accepts paddle input, then moves continuously', () => {
  const s = createBreakout(); stepBreakout(s, { ...idle, right: 1 }, .03); assert.ok(s.paddle > 400); assert.equal(s.ball.y, 460);
  stepBreakout(s, { ...idle, fire: true }, .03); assert.equal(s.serving, false); assert.ok(s.ball.y < 460);
});
test('Breakout reflects at walls and paddle impact controls rebound angle', () => {
  const s = createBreakout(); s.serving = false; s.ball = { x: 6, y: 300, vx: -200, vy: -100 };
  stepBreakout(s, idle, .02); assert.ok(s.ball.vx > 0);
  s.ball = { x: 445, y: 467, vx: 0, vy: 300 }; stepBreakout(s, idle, .02);
  assert.ok(s.ball.vy < 0); assert.ok(s.ball.vx > 0);
});
test('Breakout destroys bricks, awards points, and transitions through three stages', () => {
  const s = createBreakout(); s.serving = false; s.ball = { x: 70, y: 90, vx: 0, vy: -200 };
  stepBreakout(s, idle, .02); assert.equal(s.score, 10); assert.equal(s.bricks.filter(b => !b.alive).length, 1);
  for (let level = 1; level <= 3; level++) {
    s.bricks.forEach(b => { b.alive = false; }); s.serving = false; stepBreakout(s, idle, .02);
    if (level < 3) { assert.equal(s.level, level + 1); assert.equal(s.bricks.filter(b => b.alive).length, 50); }
  }
  assert.equal(s.phase, 'won');
});
test('Breakout loses a life per miss and ends after three misses', () => {
  const s = createBreakout();
  for (let i = 0; i < 3; i++) { s.serving = false; s.ball = { x: 400, y: 530, vx: 0, vy: 200 }; stepBreakout(s, idle, .02); }
  assert.equal(s.phase, 'lost'); assert.equal(s.lives, 0);
});
test('Shooter movement is bounded and firing is rate-limited', () => {
  const s = createShooter(); s.x = 775; stepShooter(s, { ...idle, right: 1, fire: true }, .03);
  assert.equal(s.x, 776); assert.equal(s.shots.length, 1); stepShooter(s, { ...idle, fire: true }, .03); assert.equal(s.shots.length, 1);
});
test('Shooter projectiles kill enemies and score exactly once', () => {
  const s = createShooter(); s.shots = [{ x: 105, y: 72 }]; stepShooter(s, idle, .02, () => 0);
  assert.equal(s.score, 25); assert.equal(s.enemies.filter(e => !e.alive).length, 1); assert.equal(s.shots.length, 0);
});
test('Shooter formation bounces, descends, and eventually invades', () => {
  const s = createShooter(); s.enemies.forEach(e => { e.x = 777; }); stepShooter(s, idle, .02);
  assert.equal(s.direction, -1); assert.equal(s.enemies[0].y, 80);
  s.enemies[0].y = 451; stepShooter(s, idle, .02); assert.equal(s.phase, 'lost');
});
test('Shooter damage grants temporary invulnerability and three hits end the game', () => {
  const s = createShooter();
  for (let i = 0; i < 3; i++) { s.invulnerable = 0; s.bombs = [{ x: 400, y: 475 }, { x: 400, y: 475 }]; stepShooter(s, idle, .02); assert.equal(s.lives, 2 - i); }
  assert.equal(s.phase, 'lost');
});
test('Shooter clears three waves, discards old bullets, and wins', () => {
  const s = createShooter();
  for (let wave = 1; wave <= 3; wave++) { s.enemies.forEach(e => { e.alive = false; }); stepShooter(s, idle, .02); if (wave < 3) { assert.equal(s.level, wave + 1); assert.equal(s.enemies.filter(e => e.alive).length, 32); } }
  assert.equal(s.phase, 'won');
});
