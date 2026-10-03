import * as THREE from 'three';
import './styles/racing.css';
import { newCar, stepCar, raceTime, TRACK_RADIUS, TOTAL_LAPS, CHECKPOINTS } from './racing-physics.js';

/** @template {HTMLElement} T @param {string} id @returns {T} */
function el(id) { return /** @type {T} */ (document.getElementById(id)); }
const world = el('world');
const start = /** @type {HTMLButtonElement} */ (el('start'));
const pauseButton = /** @type {HTMLButtonElement} */ (el('pause'));
const restart = /** @type {HTMLButtonElement} */ (el('restart'));
const overlay = el('race-overlay');
let car = newCar();
let mode = 'intro';
let countdown = 0;
let cameraMode = 0;
let last = 0;
let soundOn = false;
/** @type {AudioContext | undefined} */ let audio;
/** @type {OscillatorNode | undefined} */ let oscillator;
/** @type {GainNode | undefined} */ let volume;
const keys = new Set();
const touch = new Set();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  start.textContent = 'WebGL unavailable';
  el('loading-note').textContent = 'This device could not create a WebGL context. Try an updated browser with hardware acceleration, or return to the 2D library.';
}
if (renderer) init(renderer);

/** @param {THREE.WebGLRenderer} renderer */
function init(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-label', 'Apex Circuit live 3D race. Steering and pedal controls are described in the start panel.');
  world.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#223c50');
  scene.fog = new THREE.Fog('#223c50', 95, 240);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 350);
  const ambient = new THREE.HemisphereLight(0xa5d9ee, 0x253c32, 2.5); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe3bf, 3.3); sun.position.set(30, 65, 20);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 160 });
  sun.shadow.bias = -0.001; scene.add(sun);
  const resources = new Set();
  const material = (color, metalness = 0, roughness = 0.8) => { const m = new THREE.MeshStandardMaterial({ color, metalness, roughness }); resources.add(m); return m; };
  const asphalt = material(0x26353e), grass = material(0x274c46), white = material(0xd6e9d9), red = material(0xb44e51), dark = material(0x0a1320);
  /** @param {THREE.BufferGeometry} geometry @param {THREE.Material} mat @param {number} x @param {number} y @param {number} z @param {THREE.Object3D} parent */
  function mesh(geometry, mat, x = 0, y = 0, z = 0, parent = scene) {
    resources.add(geometry); const obj = new THREE.Mesh(geometry, mat);
    obj.position.set(x, y, z); obj.castShadow = true; obj.receiveShadow = true; parent.add(obj); return obj;
  }
  /** @param {number} w @param {number} h @param {number} d @param {THREE.Material} mat @param {number} x @param {number} y @param {number} z @param {THREE.Object3D} parent */
  function box(w, h, d, mat, x, y, z, parent = scene) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent); }
  mesh(new THREE.CylinderGeometry(160, 160, 0.3, 96), grass, 0, -0.25, 0);
  const road = mesh(new THREE.RingGeometry(35, 49, 192), asphalt, 0, 0.02, 0); road.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 120; i++) {
    const angle = i / 120 * Math.PI * 2;
    for (const radius of [34.8, 49.2]) {
      const curb = box(0.9, 0.24, 2.3, i % 2 ? red : white, Math.cos(angle) * radius, 0.08, Math.sin(angle) * radius);
      curb.rotation.y = -angle;
      const wall = box(0.4, 0.8, 2.7, i % 8 < 4 ? dark : white, Math.cos(angle) * (radius + (radius > 40 ? 0.5 : -0.5)), 0.4, Math.sin(angle) * (radius + (radius > 40 ? 0.5 : -0.5)));
      wall.rotation.y = -angle;
    }
    if (i % 2 === 0) {
      const stripe = box(0.13, 0.025, 1.6, white, Math.cos(angle) * TRACK_RADIUS, 0.04, Math.sin(angle) * TRACK_RADIUS); stripe.rotation.y = -angle;
    }
  }
  // Central paddock and lightweight grandstands make the circuit a physical place, not a flat UI.
  const building = material(0x425c67), glass = material(0x71c0d5, 0.8, 0.16);
  box(22, 3.6, 9, building, 0, 1.8, 0);
  box(23, 0.5, 10, dark, 0, 3.8, 0);
  box(21, 1.2, 0.15, glass, 0, 2.4, 4.6);
  for (let i = 0; i < 5; i++) box(16, 0.7, 2.2, i % 2 ? white : red, 0, i * 0.6 + 0.5, -12 - i * 1.7);
  const leaf = material(0x326052), trunk = material(0x514137);
  for (let i = 0; i < 42; i++) {
    const a = i * 2.39996, r = 59 + (i % 7) * 5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    mesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 6), trunk, x, 1.5, z);
    mesh(new THREE.ConeGeometry(2 + i % 2, 7, 7), leaf, x, 5, z);
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const x = Math.cos(a) * 54, z = Math.sin(a) * 54;
    box(0.25, 9, 0.25, dark, x, 4.5, z); box(2, 0.25, 0.8, white, x, 9, z);
  }
  // Start / finish gantry and checkerboard.
  box(0.3, 6, 0.3, dark, 34, 3, 0); box(0.3, 6, 0.3, dark, 50, 3, 0);
  box(16.5, 1.1, 0.45, dark, 42, 6, 0);
  for (let i = 0; i < 14; i++) for (let j = 0; j < 2; j++) box(1, 0.025, 1, (i + j) % 2 ? dark : white, 35.5 + i, 0.07, j - 0.5);
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x7affdc, transparent: true, opacity: 0.55 }); resources.add(gateMat);
  const checkpoint = new THREE.Group(); scene.add(checkpoint);
  box(0.16, 3.2, 0.16, gateMat, -6.3, 1.6, 0, checkpoint);
  box(0.16, 3.2, 0.16, gateMat, 6.3, 1.6, 0, checkpoint);
  box(12.6, 0.12, 0.12, gateMat, 0, 3.2, 0, checkpoint);
  function makeVehicle(color) {
    const group = new THREE.Group(); scene.add(group);
    const paint = material(color, 0.65, 0.25);
    box(1.7, 0.5, 3.1, paint, 0, 0.62, 0, group);
    box(1.4, 0.45, 1.3, glass, 0, 1.02, -0.15, group);
    box(1.85, 0.12, 0.4, dark, 0, 1.05, -1.25, group);
    box(0.28, 0.07, 2.8, white, -0.32, 0.89, 0, group);
    for (const x of [-0.85, 0.85]) for (const z of [-0.93, 0.93]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12), dark, x, 0.4, z, group); wheel.rotation.z = Math.PI / 2;
    }
    for (const x of [-0.55, 0.55]) { box(0.32, 0.14, 0.08, white, x, 0.68, 1.57, group); box(0.3, 0.12, 0.08, red, x, 0.66, -1.57, group); }
    return group;
  }
  const vehicle = makeVehicle(0x82f5cc);
  const rivals = [
    { mesh: makeVehicle(0xb18af8), angle: -0.075, radius: 39.5, pace: 14.5 },
    { mesh: makeVehicle(0xffae62), angle: -0.15, radius: 44.5, pace: 16 },
  ];
  const desired = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  function reset() {
    car = newCar(); rivals[0].angle = -0.075; rivals[1].angle = -0.15;
    countdown = 3; mode = 'countdown'; overlay.hidden = true;
    pauseButton.disabled = false; restart.disabled = false; pauseButton.textContent = 'Pause';
    keys.clear(); touch.clear();
    camera.position.set(car.x + 9, 7, car.z - 12);
  }
  function pause() {
    if (mode === 'running' || mode === 'countdown') { mode = mode === 'running' ? 'paused' : 'paused-countdown'; keys.clear(); touch.clear(); pauseButton.textContent = 'Resume'; el('announcement').textContent = 'PAUSED'; }
    else if (mode === 'paused' || mode === 'paused-countdown') { mode = mode === 'paused' ? 'running' : 'countdown'; pauseButton.textContent = 'Pause'; el('announcement').textContent = ''; }
  }
  function changeCamera() { cameraMode = (cameraMode + 1) % 2; el('camera').textContent = `Camera: ${cameraMode ? 'aerial' : 'chase'}`; }
  start.disabled = false; start.textContent = 'START YOUR ENGINE →';
  el('loading-note').textContent = 'Ready · Procedural 3D circuit · Keyboard + touch';
  start.addEventListener('click', reset); restart.addEventListener('click', reset);
  pauseButton.addEventListener('click', pause); el('camera').addEventListener('click', changeCamera);
  const handled = ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','p','c','escape'];
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (!handled.includes(key) || e.target instanceof HTMLButtonElement && (key === ' ' || key === 'enter')) return;
    e.preventDefault();
    if (!e.repeat && (key === 'p' || key === 'escape')) pause();
    if (!e.repeat && key === 'c') changeCamera();
    keys.add(key);
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  const loseFocus = () => { keys.clear(); touch.clear(); document.querySelectorAll('.is-down').forEach(n => n.classList.remove('is-down')); if (mode === 'running' || mode === 'countdown') pause(); };
  window.addEventListener('blur', loseFocus);
  document.addEventListener('visibilitychange', () => { if (document.hidden) loseFocus(); });
  document.querySelectorAll('[data-control]').forEach((element) => {
    const button = /** @type {HTMLButtonElement} */ (element), action = button.dataset.control;
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); touch.add(action); button.classList.add('is-down'); });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => { touch.delete(action); button.classList.remove('is-down'); });
  });
  el('sound').addEventListener('click', async () => {
    try {
      if (!audio) { audio = new window.AudioContext(); oscillator = audio.createOscillator(); volume = audio.createGain(); oscillator.type = 'sawtooth'; volume.gain.value = 0; oscillator.connect(volume); volume.connect(audio.destination); oscillator.start(); }
      await audio.resume(); soundOn = !soundOn;
      el('sound').textContent = soundOn ? 'Sound on' : 'Sound off'; el('sound').setAttribute('aria-pressed', String(soundOn));
    } catch { el('sound').textContent = 'Sound unavailable'; }
  });
  function finish() {
    mode = 'finished'; pauseButton.disabled = true;
    const ahead = rivals.filter(r => r.angle / (2 * Math.PI) >= TOTAL_LAPS).length;
    let saved = '';
    try {
      const previous = Number(localStorage.getItem('psd-apex-best')) || Infinity;
      if (car.elapsed < previous) { localStorage.setItem('psd-apex-best', String(car.elapsed)); saved = ' · New personal best!'; }
    } catch { /* Racing never requires storage. */ }
    overlay.innerHTML = `<div class="intro-card"><span class="eyebrow">RACE COMPLETE · P${ahead + 1} / 3</span><h1>FINISH<br><em>STRONG.</em></h1><p>Total time <b>${raceTime(car.elapsed)}</b><br>Best lap <b>${raceTime(car.bestLap)}</b><br>Wall / rival contacts <b>${car.hits}</b>${saved}</p><button id="race-again" class="start-button">RACE AGAIN →</button><a class="back-link" href="/#/catalog">← BACK TO THE ARCADE</a></div>`;
    overlay.hidden = false; el('race-again').addEventListener('click', reset); el('race-again').focus();
  }
  const resize = () => { camera.aspect = world.clientWidth / world.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(world.clientWidth, world.clientHeight); };
  window.addEventListener('resize', resize); resize();
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); loseFocus(); el('announcement').textContent = 'Graphics interrupted. Reload to recover.'; });
  let animation;
  function frame(now) {
    animation = requestAnimationFrame(frame);
    const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
    if (mode === 'countdown') { countdown -= dt; el('announcement').textContent = countdown > 0 ? String(Math.ceil(countdown)) : 'GO'; if (countdown <= 0) mode = 'running'; }
    if (mode === 'running') {
      const left = keys.has('a') || keys.has('arrowleft') || touch.has('left');
      const right = keys.has('d') || keys.has('arrowright') || touch.has('right');
      stepCar(car, { throttle: keys.has('w') || keys.has('arrowup') || touch.has('throttle'), brake: keys.has('s') || keys.has('arrowdown') || touch.has('brake'), steer: Number(left) - Number(right) }, dt);
      rivals.forEach(r => {
        r.angle = Math.min(TOTAL_LAPS * 2 * Math.PI, r.angle + r.pace / r.radius * dt);
        const rx = Math.cos(r.angle) * r.radius, rz = Math.sin(r.angle) * r.radius;
        if (Math.hypot(car.x - rx, car.z - rz) < 2.15 && car.collisionCooldown === 0) { car.speed *= 0.55; car.hits++; car.collisionCooldown = 1; }
      });
      el('announcement').textContent = car.collisionCooldown > 0.65 ? 'CONTACT' : car.elapsed < 1 ? 'GO' : '';
      if (car.finished) finish();
    }
    vehicle.position.set(car.x, 0, car.z); vehicle.rotation.y = car.heading;
    rivals.forEach(r => { r.mesh.position.set(Math.cos(r.angle) * r.radius, 0, Math.sin(r.angle) * r.radius); r.mesh.rotation.y = -r.angle; });
    const a = car.nextCheckpoint * Math.PI * 2 / CHECKPOINTS;
    checkpoint.position.set(Math.cos(a) * TRACK_RADIUS, 0, Math.sin(a) * TRACK_RADIUS); checkpoint.rotation.y = -a;
    if (mode === 'intro') { camera.position.set(87, 59, 74); camera.lookAt(6, 0, 0); }
    else {
      if (cameraMode) desired.set(car.x + 2, 52, car.z - 18);
      else desired.set(car.x - Math.sin(car.heading) * 10, 5.8, car.z - Math.cos(car.heading) * 10);
      camera.position.lerp(desired, 1 - Math.exp(-5 * dt));
      lookAt.set(car.x + Math.sin(car.heading) * 8, 0.7, car.z + Math.cos(car.heading) * 8); camera.lookAt(lookAt);
    }
    el('speed').textContent = String(Math.round(car.speed * 3.6)); el('speed-meter').style.width = `${car.speed / 34 * 160}px`;
    el('timer').textContent = raceTime(car.elapsed); el('lap').innerHTML = `${Math.min(car.laps + 1, TOTAL_LAPS)} <em>/ ${TOTAL_LAPS}</em>`;
    el('gate').textContent = `${car.nextCheckpoint || 8} / 8`;
    // Count ordered sectors, not just position, so shortcuts cannot inflate race position.
    const playerAngle = (Math.atan2(car.z, car.x) + Math.PI * 2) % (Math.PI * 2);
    const progress = car.finished ? TOTAL_LAPS : Math.min(car.checkpoints / 8 + 1 / 8, car.laps + playerAngle / (Math.PI * 2));
    el('position').textContent = `${1 + rivals.filter(r => (car.finished ? r.angle / (Math.PI * 2) >= progress : r.angle / (Math.PI * 2) > progress)).length} / 3`;
    if (audio && oscillator && volume) { oscillator.frequency.setTargetAtTime(35 + car.speed * 4, audio.currentTime, 0.1); volume.gain.setTargetAtTime(soundOn && mode === 'running' ? 0.022 : 0, audio.currentTime, 0.1); }
    renderer.render(scene, camera);
  }
  animation = requestAnimationFrame(frame);
  window.addEventListener('pagehide', (event) => { if (event.persisted) { loseFocus(); return; } cancelAnimationFrame(animation); resources.forEach(r => r.dispose()); renderer.dispose(); audio?.close(); }, { once: true });
}
