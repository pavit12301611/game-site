import './player.css';
import { SOLO_GAMES } from './catalog.js';
import { createSnake, stepSnake, turnSnake, COLS, ROWS } from './snake.js';
import { createBreakout, stepBreakout } from './breakout.js';
import { createShooter, stepShooter } from './shooter.js';

const id = new URLSearchParams(location.search).get('game');
const game = SOLO_GAMES.find(g => g.id === id && ['snake', 'breakout', 'shooter'].includes(g.engine));
const root = /** @type {HTMLElement} */ (document.getElementById('solo-app'));
if (!game) root.innerHTML = '<section class="missing-game"><h1>That game is not in this arcade.</h1><a href="/#/catalog">← Back to the game library</a></section>';
else mount(game);
function mount(game) {
  const descriptions = {
    snake: { theme: 'mint', name: 'SURVIVE THE GRID', controls: 'Arrow keys / WASD to turn. On mobile, swipe the board or use the direction pad.', goal: 'Eat coral orbs to grow. Avoid the walls and your own tail. Every five bites makes you faster.', subtitle: 'One more bite. One less way out.', label: 'SPEED', action: 'Start moving' },
    breakout: { theme: 'violet', name: 'FIND YOUR ANGLE', controls: 'Mouse / touch to move the paddle, or ← → / A D. Space or Launch to serve.', goal: 'Clear all three stages with three lives. Hit with the paddle edges to change the ball’s angle.', subtitle: 'A perfect angle changes everything.', label: 'STAGE', action: 'Enter the arena' },
    shooter: { theme: 'amber', name: 'HOLD THE LINE', controls: '← → / A D to move. Hold Space or FIRE to shoot. On mobile, drag your ship or use the buttons.', goal: 'Destroy three waves. Dodge enemy shots. Stop the formation before it reaches your ship.', subtitle: 'The last ship. The first line of defense.', label: 'WAVE', action: 'Deploy your ship' },
  };
  const spec = descriptions[game.engine];
  document.title = `${game.title} — PSD Gaming`;
  root.dataset.theme = spec.theme;
  root.innerHTML = `<header class="solo-top"><a class="solo-brand" href="/#/catalog">← PSD <span>GAMING</span></a><span class="solo-top-label">THE ORIGINALS COLLECTION</span><span class="solo-badge">2D · SINGLE PLAYER</span></header>
    <section class="solo-heading"><div><span class="solo-eyebrow">${spec.name}</span><h1>${game.title}</h1><p>${spec.subtitle}</p></div><div class="solo-buttons"><button id="solo-pause" disabled>Pause</button><button id="solo-restart" disabled>Restart ↻</button></div></section>
    <section class="game-console"><div class="console-hud"><div><small>SCORE</small><b id="solo-score">0000</b></div><div><small>BEST</small><b id="solo-best">0000</b></div><div><small>${spec.label}</small><b id="solo-level">01</b></div><div><small>${game.engine === 'snake' ? 'LENGTH' : 'LIVES'}</small><b id="solo-lives">03</b></div><span class="console-led">● READY</span></div>
    <div class="canvas-stage"><canvas id="solo-canvas" width="800" height="520" tabindex="0" aria-label="${game.title} game board. ${spec.controls}"></canvas><div id="solo-overlay" class="solo-overlay"><img src="/images/originals/${game.id}.webp" alt="" width="960" height="600"><div class="solo-overlay-copy"><span class="solo-eyebrow">YOUR NEXT HIGH SCORE STARTS HERE</span><h2>${game.title}</h2><p>${spec.goal}</p><button id="solo-start" class="solo-primary">${spec.action} →</button><small>Free to play · No account needed</small></div></div><div id="pause-screen" class="pause-screen" hidden><h2>Take a breather.</h2><p>Your game is paused.</p><button id="solo-resume" class="solo-primary">Resume →</button></div></div>
    <div class="console-bottom"><span>● ${game.engine === 'snake' ? 'DON’T CROSS YOUR TAIL' : game.engine === 'breakout' ? 'THREE STAGES. MAKE EVERY BALL COUNT.' : 'THREE WAVES. NO SECOND FLEET.'}</span><span>P TO PAUSE</span></div></section>
    <section class="solo-touch" aria-label="Touch controls">${game.engine === 'snake' ? '<button data-dir="left" aria-label="Turn left">←</button><button data-dir="up" aria-label="Turn up">↑</button><button data-dir="down" aria-label="Turn down">↓</button><button data-dir="right" aria-label="Turn right">→</button>' : '<button data-held="left" aria-label="Move left">←</button><button data-held="right" aria-label="Move right">→</button><button data-held="fire" class="touch-fire">'+(game.engine === 'breakout' ? 'LAUNCH' : 'FIRE')+'</button>'}</section>
    <footer class="solo-help"><div><b>HOW TO PLAY</b><p>${spec.controls} <kbd>P</kbd> to pause.</p></div><div><b>THE OBJECTIVE</b><p>${spec.goal}</p></div></footer><p id="solo-status" class="solo-status" role="status" aria-live="polite">Ready when you are.</p>`;
  const find = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const canvas = /** @type {HTMLCanvasElement} */ (find('solo-canvas'));
  const ctx = canvas.getContext('2d');
  if (!ctx) { find('solo-status').textContent = 'Canvas is unavailable in this browser. Please try another browser.'; return; }
  const context = ctx;
  const create = { snake: createSnake, breakout: createBreakout, shooter: createShooter }[game.engine];
  /** @type {any} */ let state = create();
  let playing = false, paused = false, previous = 0, best = 0;
  /** @type {number | undefined} */ let pointerTarget;
  const held = new Set();
  const touches = new Set();
  const key = `psd-best-${game.id}`;
  try { best = Number(localStorage.getItem(key)) || 0; } catch { /* Private browsing can block storage. */ }
  find('solo-best').textContent = String(best).padStart(4, '0');
  function reset() {
    state = create(); playing = true; paused = false; held.clear(); touches.clear(); pointerTarget = undefined;
    find('solo-overlay').hidden = true; find('pause-screen').hidden = true;
    for (const id of ['solo-pause', 'solo-restart']) /** @type {HTMLButtonElement} */ (find(id)).disabled = false;
    find('solo-pause').textContent = 'Pause'; find('solo-status').textContent = 'Game started.';
    canvas.focus();
  }
  function togglePause() {
    if (!playing) return; paused = !paused; held.clear(); touches.clear(); pointerTarget = undefined;
    find('pause-screen').hidden = !paused; find('solo-pause').textContent = paused ? 'Resume' : 'Pause';
    find('solo-status').textContent = paused ? 'Game paused.' : 'Game resumed.';
    if (paused) find('solo-resume').focus(); else canvas.focus();
  }
  find('solo-start').addEventListener('click', reset); find('solo-restart').addEventListener('click', reset);
  find('solo-pause').addEventListener('click', togglePause); find('solo-resume').addEventListener('click', togglePause);
  function finish() {
    playing = false; const won = state.phase === 'won';
    if (state.score > best) { best = state.score; try { localStorage.setItem(key, String(best)); } catch { /* Optional storage. */ } }
    find('solo-best').textContent = String(best).padStart(4, '0');
    find('solo-overlay').innerHTML = `<div class="solo-result"><span class="solo-eyebrow">${won ? 'MISSION COMPLETE' : 'THE NEXT RUN IS YOURS'}</span><h2>${won ? 'Beautifully played.' : 'One more round?'}</h2><p>Score <strong>${state.score}</strong> · Best <strong>${best}</strong></p><button id="solo-again" class="solo-primary">Play again →</button><a href="/#/catalog">Explore another game</a></div>`;
    find('solo-overlay').hidden = false; find('solo-again').addEventListener('click', reset); find('solo-again').focus();
    /** @type {HTMLButtonElement} */ (find('solo-pause')).disabled = true;
    find('solo-status').textContent = `${won ? 'You won' : 'Game over'}. Score ${state.score}.`;
  }
  const directionKeys = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'p' || key === 'escape') { if (!e.repeat) togglePause(); return; }
    if (!playing || paused || !(key in directionKeys || key === ' ')) return;
    if (e.target instanceof HTMLButtonElement && key === ' ') return;
    e.preventDefault(); held.add(key); pointerTarget = undefined;
    if (game.engine === 'snake' && directionKeys[key]) turnSnake(state, directionKeys[key]);
  });
  window.addEventListener('keyup', e => held.delete(e.key.toLowerCase()));
  function blur() { held.clear(); touches.clear(); if (playing && !paused) togglePause(); }
  window.addEventListener('blur', blur); document.addEventListener('visibilitychange', () => { if (document.hidden) blur(); });
  /** @type {{x: number, y: number} | null} */ let swipe = null;
  canvas.addEventListener('pointerdown', e => {
    if (!playing || paused) return; e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    swipe = { x: e.clientX, y: e.clientY }; if (game.engine !== 'snake') movePointer(e);
  });
  function movePointer(e) { const bounds = canvas.getBoundingClientRect(); pointerTarget = (e.clientX - bounds.left) / bounds.width * 800; }
  canvas.addEventListener('pointermove', e => { if (game.engine !== 'snake' && playing && !paused && (e.pointerType === 'mouse' || e.buttons)) movePointer(e); });
  canvas.addEventListener('pointerup', e => {
    if (swipe && game.engine === 'snake' && playing && !paused) {
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 12) turnSnake(state, Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
    }
    swipe = null;
  });
  canvas.addEventListener('pointercancel', () => { swipe = null; });
  root.querySelectorAll('[data-dir]').forEach(node => node.addEventListener('click', () => { if (playing && !paused) turnSnake(state, /** @type {HTMLElement} */ (node).dataset.dir); }));
  root.querySelectorAll('[data-held]').forEach(node => {
    const button = /** @type {HTMLButtonElement} */ (node), action = button.dataset.held;
    button.addEventListener('pointerdown', e => { if (!playing || paused) return; e.preventDefault(); button.setPointerCapture(e.pointerId); touches.add(action); pointerTarget = undefined; button.classList.add('held'); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => { touches.delete(action); button.classList.remove('held'); });
  });
  function rect(x, y, w, h, color, radius = 0) {
    context.fillStyle = color; context.beginPath(); context.roundRect(x, y, w, h, radius); context.fill();
  }
  function paint() {
    const c = context;
    const bg = c.createLinearGradient(0, 0, 800, 520); bg.addColorStop(0, '#0b172a'); bg.addColorStop(1, '#080d1b'); rect(0, 0, 800, 520, bg);
    if (game.engine === 'snake') {
      const size = 25, ox = 100, oy = 35;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) rect(ox + x * size, oy + y * size, size - 1, size - 1, (x + y) % 2 ? '#112238' : '#102035', 2);
      state.body.forEach((p, i) => rect(ox + p.x * size + 2, oy + p.y * size + 2, 21, 21, i === 0 ? '#c1ffe0' : `hsl(158 63% ${Math.max(30, 60 - i * 1.1)}%)`, 6));
      const head = state.body[0];
      const vertical = ['up', 'down'].includes(state.direction), positive = ['right', 'down'].includes(state.direction);
      for (const eye of [7, 16]) rect(ox + head.x * size + (vertical ? eye : positive ? 16 : 6), oy + head.y * size + (vertical ? positive ? 16 : 6 : eye), 3, 3, '#14352d', 1);
      if (state.food) { c.shadowColor = '#ff818d'; c.shadowBlur = 18; rect(ox + state.food.x * size + 5, oy + state.food.y * size + 5, 15, 15, '#ff818d', 6); c.shadowBlur = 0; }
    } else if (game.engine === 'breakout') {
      const colors = ['#bb9bff', '#ad79fb', '#ec8be9', '#ffacb8', '#ffd39d'];
      state.bricks.filter(b => b.alive).forEach(b => { rect(b.x, b.y, b.w, b.h, colors[(b.color + state.level - 1) % colors.length], 4); rect(b.x + 3, b.y + 2, b.w - 6, 3, '#ffffff50', 2); });
      c.shadowColor = '#c3a4ff'; c.shadowBlur = 20;
      rect(state.paddle - 58, 478, 116, 12, '#c9b5ff', 6); c.shadowBlur = 0;
      c.beginPath(); c.arc(state.ball.x, state.ball.y, 8, 0, Math.PI * 2); c.fillStyle = '#fff4df'; c.fill();
      if (state.serving && playing) { c.fillStyle = '#bbc8e2'; c.font = '15px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('SPACE / LAUNCH TO SERVE', 400, 300); }
    } else {
      for (let i = 0; i < 75; i++) rect((i * 137.7) % 800, (i * 83.2) % 520, i % 4 ? 1 : 2, i % 4 ? 1 : 2, '#a8bedb80');
      state.enemies.filter(e => e.alive).forEach(e => {
        const color = ['#ff9c81', '#ffc28b', '#f1a5dc', '#b9a2ff'][e.row];
        rect(e.x - 17, e.y - 10, 34, 20, color, 5); rect(e.x - 24, e.y - 3, 8, 14, color, 2); rect(e.x + 16, e.y - 3, 8, 14, color, 2);
        rect(e.x - 10, e.y - 4, 5, 5, '#1a1930'); rect(e.x + 5, e.y - 4, 5, 5, '#1a1930');
      });
      state.shots.forEach(s => rect(s.x - 2, s.y - 10, 4, 15, '#8afce1', 2));
      state.bombs.forEach(b => rect(b.x - 3, b.y, 6, 13, '#ff8c8c', 3));
      if (!state.invulnerable || Math.floor(state.invulnerable * 12) % 2) {
        c.fillStyle = '#8afce1'; c.beginPath(); c.moveTo(state.x, 458); c.lineTo(state.x + 20, 493); c.lineTo(state.x, 485); c.lineTo(state.x - 20, 493); c.closePath(); c.fill(); rect(state.x - 4, 489, 8, 10, '#ffd39d', 3);
      }
    }
  }
  let frameId;
  function frame(now) {
    frameId = requestAnimationFrame(frame);
    const dt = Math.min((now - (previous || now)) / 1000, 0.05); previous = now;
    if (playing && !paused) {
      const input = { left: Number(held.has('arrowleft') || held.has('a') || touches.has('left')), right: Number(held.has('arrowright') || held.has('d') || touches.has('right')), fire: held.has(' ') || touches.has('fire'), target: pointerTarget };
      if (game.engine === 'snake') stepSnake(state, dt);
      else if (game.engine === 'breakout') stepBreakout(state, input, dt);
      else stepShooter(state, input, dt);
      find('solo-score').textContent = String(state.score).padStart(4, '0');
      find('solo-level').textContent = String(state.level).padStart(2, '0');
      find('solo-lives').textContent = String(game.engine === 'snake' ? state.body.length : state.lives).padStart(2, '0');
      if (state.phase !== 'running') finish();
    }
    const led = /** @type {HTMLElement} */ (root.querySelector('.console-led')); led.textContent = paused ? '● PAUSED' : playing ? '● PLAYING' : '● READY';
    paint();
  }
  frameId = requestAnimationFrame(frame);
  window.addEventListener('pagehide', e => { if (e.persisted) blur(); else cancelAnimationFrame(frameId); });
}
