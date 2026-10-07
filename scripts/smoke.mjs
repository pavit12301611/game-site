// Runtime smoke test: boots the real app in jsdom, visits every game in every
// mode, clicks around, and fails on any uncaught error.
// Run: npm run smoke
import { JSDOM, VirtualConsole } from 'jsdom';

const failures = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => failures.push(`jsdom: ${e.message}\n${e.stack || ''}`));
virtualConsole.on('error', (...args) => failures.push(`console.error: ${args.join(' ')}`));

const dom = new JSDOM('<!doctype html><html data-theme="dark"><head></head><body><div id="app"></div></body></html>', {
  url: 'http://localhost/',
  virtualConsole,
  pretendToBeVisual: true,
});

const { window } = dom;
global.window = window;
global.document = window.document;
global.location = window.location;
try { global.navigator = window.navigator; } catch { /* Node owns global navigator */ }
global.HTMLElement = window.HTMLElement;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.Event = window.Event;
global.HashChangeEvent = window.HashChangeEvent || window.Event;
global.Node = window.Node;

// Canvas: absorb all 2d calls with a chainable stub.
function chainableCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get: () => proxy,
    set: () => true,
    apply: () => proxy,
  });
  return proxy;
}
window.HTMLCanvasElement.prototype.getContext = () => chainableCtx();

// Bounded rAF: lets game loops tick a little, then stalls (no infinite spins).
let rafBudget = 4000;
global.requestAnimationFrame = (cb) => {
  if (rafBudget-- > 0) setTimeout(() => cb(performance.now()), 0);
  return 1;
};
global.cancelAnimationFrame = () => {};
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;
window.scrollTo = () => {};
window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
if (!window.HTMLElement.prototype.focus) window.HTMLElement.prototype.focus = () => {};
if (!window.HTMLElement.prototype.scrollIntoView) window.HTMLElement.prototype.scrollIntoView = () => {};

process.on('unhandledRejection', (e) => failures.push(`unhandled rejection: ${e?.stack || e}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) failures.push(msg);
  else console.log(`  ✓ ${msg}`);
};

const { start } = await import('../src/app.js');
const { navigate, gamePath } = await import('../src/core/router.js');
const { GAMES } = await import('../src/games/registry.js');

console.log('booting app…');
start(document.getElementById('app'));
await sleep(50);

assert(document.querySelectorAll('.card').length === GAMES.length, `home shows ${GAMES.length} cards`);

// Search + filters
const search = document.querySelector('.search');
search.value = 'snake';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(20);
assert(document.querySelectorAll('.card').length === 1, 'search narrows to 1 card');
search.value = '';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(20);

// Theme + sound toggles
document.querySelectorAll('.icon-btn')[0].click();
assert(document.documentElement.dataset.theme === 'light', 'theme toggles to light');
document.querySelectorAll('.icon-btn')[0].click();
document.querySelectorAll('.icon-btn')[1].click();
document.querySelectorAll('.icon-btn')[1].click();

// Every game × every mode × first difficulty
for (const game of GAMES) {
  for (const mode of game.modes) {
    const diff = game.difficulties?.[0]?.id;
    navigate(gamePath(game.id, diff ? { mode: mode.id, diff } : { mode: mode.id }));
    await sleep(60);
    const arena = document.querySelector('.arena');
    assert(!!arena && arena.childElementCount > 0, `${game.id}/${mode.id} mounts into arena`);

    // Click a few buttons to exercise handlers (moves, starts, answers…).
    for (let round = 0; round < 3; round++) {
      const btns = [...document.querySelectorAll('.arena button:not(:disabled)')].slice(0, 2);
      if (btns.length === 0) break;
      for (const b of btns) b.click();
      await sleep(120);
    }

    // Difficulty switch remounts cleanly.
    if (game.difficulties && game.difficulties.length > 1) {
      const sel = document.querySelector('.game-controls select');
      if (sel) {
        sel.value = game.difficulties[1].id;
        sel.dispatchEvent(new window.Event('change', { bubbles: true }));
        await sleep(60);
        assert(document.querySelector('.arena')?.childElementCount > 0, `${game.id} survives difficulty change`);
      }
    }

    // Mode tab (if more than one mode) navigates.
    const tabs = [...document.querySelectorAll('.seg-btn')];
    if (tabs.length > 1) {
      tabs.find((t) => !t.classList.contains('on')).click();
      await sleep(60);
      assert(document.querySelector('.arena')?.childElementCount > 0, `${game.id} survives mode switch`);
    }
  }
  console.log(`  — ${game.id} ok`);
}

// Deeper flows: play tic-tac-toe to a full board, answer quiz twice, run 2048 keys.
navigate(gamePath('tictactoe', { mode: 'local' }));
await sleep(50);
for (let i = 0; i < 9; i++) {
  document.querySelector('.ttt-cell:not(:disabled)')?.click();
  await sleep(10);
}
assert(!!document.querySelector('.table-overlay'), 'tic-tac-toe reaches game over');

navigate(gamePath('quiz', { mode: 'solo', diff: 'easy' }));
await sleep(50);
document.querySelector('.quiz-opt')?.click();
await sleep(1100);
document.querySelector('.quiz-opt')?.click();
await sleep(1100);
assert(document.querySelectorAll('.quiz-opt').length === 4, 'quiz advances questions');

navigate(gamePath('g2048', { mode: 'solo' }));
await sleep(50);
for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  await sleep(10);
}
assert(document.querySelectorAll('.tz-cell').length === 16, '2048 board intact after keys');

navigate(gamePath('snake', { mode: 'solo', diff: 'easy' }));
await sleep(50);
document.querySelector('.arc-panel button')?.click(); // start
await sleep(300);
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
await sleep(300);
assert(document.querySelector('.arc-canvas') !== null, 'snake runs a loop without errors');

navigate(gamePath('pong', { mode: 'cpu', diff: 'easy' }));
await sleep(50);
document.querySelector('.arc-panel button')?.click(); // serve
await sleep(400);
assert(document.querySelector('.pong-score') !== null, 'pong rallies without errors');

navigate(gamePath('minesweeper', { mode: 'solo', diff: 'easy' }));
await sleep(50);
document.querySelector('.ms-cell')?.click();
await sleep(60);
assert(document.querySelectorAll('.ms-cell.open').length > 0, 'minesweeper reveals on first click');

// Unknown routes show friendly pages, not blanks.
navigate('/game/nope');
await sleep(40);
assert(document.querySelector('.empty') !== null, 'unknown game shows friendly page');

navigate('/');
await sleep(40);
assert(document.querySelectorAll('.card').length === GAMES.length, 'back home, cards intact');

// Let pending timers flush so their errors surface too.
await sleep(1500);

if (failures.length > 0) {
  console.error(`\nSMOKE FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error(`\n• ${f}`);
  process.exit(1);
}
console.log('\nSMOKE PASSED — every game boots and plays.');
process.exit(0);
