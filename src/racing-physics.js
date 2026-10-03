/** Pure deterministic driving model. World units are metres, time is seconds. */
export const TRACK_RADIUS = 42;
export const TRACK_HALF_WIDTH = 7;
export const TOTAL_LAPS = 3;
export const CHECKPOINTS = 8;
export function newCar() {
  return { x: TRACK_RADIUS, z: 0, heading: 0, speed: 0, nextCheckpoint: 1, checkpoints: 0, laps: 0, elapsed: 0, lapStarted: 0, lastLap: 0, bestLap: 0, hits: 0, collisionCooldown: 0, finished: false };
}
/** A heading of zero faces +Z; positive steering turns towards +X. */
export function stepCar(car, input, delta) {
  if (car.finished) return car;
  const dt = Math.max(0, Math.min(delta, 0.05));
  car.elapsed += dt;
  car.collisionCooldown = Math.max(0, car.collisionCooldown - dt);
  const acceleration = input.throttle ? 15 : 0;
  const braking = input.brake ? 25 : 0;
  car.speed = Math.max(0, Math.min(34, car.speed + (acceleration - braking - 0.8 - car.speed * 0.045) * dt));
  car.heading += input.steer * Math.min(car.speed / 10, 1) * (input.brake ? 1.9 : 1.3) * dt;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const radius = Math.hypot(car.x, car.z);
  const minimum = TRACK_RADIUS - TRACK_HALF_WIDTH + 0.9;
  const maximum = TRACK_RADIUS + TRACK_HALF_WIDTH - 0.9;
  if (radius < minimum || radius > maximum) {
    const bounded = Math.max(minimum, Math.min(maximum, radius));
    car.x *= bounded / radius; car.z *= bounded / radius;
    car.speed *= 0.65;
    if (!car.collisionCooldown) { car.hits++; car.collisionCooldown = 0.8; }
  }
  const angle = car.nextCheckpoint * Math.PI * 2 / CHECKPOINTS;
  const tx = Math.cos(angle) * TRACK_RADIUS, tz = Math.sin(angle) * TRACK_RADIUS;
  // Ordered checkpoints prevent finish-line oscillation or backwards lap farming.
  if (Math.hypot(car.x - tx, car.z - tz) < 9) {
    car.checkpoints++;
    car.nextCheckpoint = (car.nextCheckpoint + 1) % CHECKPOINTS;
    if (car.checkpoints % CHECKPOINTS === 0) {
      car.laps++;
      car.lastLap = car.elapsed - car.lapStarted;
      car.bestLap = car.bestLap ? Math.min(car.bestLap, car.lastLap) : car.lastLap;
      car.lapStarted = car.elapsed;
      if (car.laps >= TOTAL_LAPS) { car.finished = true; car.speed = 0; }
    }
  }
  return car;
}
export function raceTime(seconds) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}
