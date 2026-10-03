import test from 'node:test';
import assert from 'node:assert/strict';
import { newCar, stepCar, TRACK_RADIUS, TOTAL_LAPS, raceTime } from '../src/racing-physics.js';

test('throttle moves a car continuously; braking reduces speed', () => {
  const c = newCar();
  for (let i = 0; i < 60; i++) stepCar(c, { throttle: true, brake: false, steer: 0 }, 1 / 60);
  assert.ok(c.z > 5); assert.ok(c.speed > 10);
  const before = c.speed;
  stepCar(c, { throttle: false, brake: true, steer: 0 }, 0.05);
  assert.ok(c.speed < before);
});
test('left/right steering changes heading only while moving', () => {
  const a = newCar(), b = newCar(); a.speed = b.speed = 10;
  stepCar(a, { steer: 1 }, 0.05); stepCar(b, { steer: -1 }, 0.05);
  assert.ok(a.heading > 0 && b.heading < 0);
  const stationary = newCar(); stepCar(stationary, { steer: 1 }, 0.05); assert.equal(stationary.heading, 0);
});
test('walls constrain position, cost speed and count a debounced contact', () => {
  const c = newCar(); c.x = 48; c.heading = Math.PI / 2; c.speed = 30;
  stepCar(c, { throttle: true, steer: 0 }, 0.05);
  assert.ok(Math.hypot(c.x, c.z) <= 48.1 + 1e-8); assert.ok(c.speed < 25); assert.equal(c.hits, 1);
  stepCar(c, { throttle: true, steer: 0 }, 0.05); assert.equal(c.hits, 1);
});
test('sitting on finish line or skipping gates never awards a lap', () => {
  const c = newCar();
  for (let i = 0; i < 100; i++) stepCar(c, { steer: 0 }, 0.05);
  assert.equal(c.laps, 0);
  c.x = 0; c.z = -TRACK_RADIUS;
  stepCar(c, { steer: 0 }, 0.05); assert.equal(c.checkpoints, 0);
});
test('the real continuous model can complete three ordered laps without teleporting', () => {
  const c = newCar();
  // Test driver follows a point ahead on the centreline using the same steering/acceleration model.
  for (let frame = 0; frame < 60 * 180 && !c.finished; frame++) {
    const a = Math.atan2(c.z, c.x) + 0.18;
    const target = Math.atan2(Math.cos(a) * TRACK_RADIUS - c.x, Math.sin(a) * TRACK_RADIUS - c.z);
    const error = Math.atan2(Math.sin(target - c.heading), Math.cos(target - c.heading));
    stepCar(c, { throttle: c.speed < 20, brake: c.speed > 23, steer: Math.max(-1, Math.min(1, error * 3)) }, 1 / 60);
  }
  assert.equal(c.finished, true); assert.equal(c.laps, TOTAL_LAPS); assert.equal(c.checkpoints, 24);
  assert.equal(c.hits, 0); assert.ok(c.bestLap > 0); assert.ok(c.elapsed > 30);
  const time = c.elapsed; stepCar(c, { throttle: true, steer: 1 }, 0.05); assert.equal(c.elapsed, time);
});
test('time formatting and oversized simulation frames are bounded', () => {
  assert.equal(raceTime(65.25), '01:05.25');
  const c = newCar(); stepCar(c, { throttle: true, steer: 0 }, 100); assert.equal(c.elapsed, 0.05);
});
