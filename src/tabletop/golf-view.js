import { COURSES, createGolf, golfMoving, hitGolf, stepGolf, nextHole, resetGolfBall } from './golf.js';
/** A separate renderer and input layer: the cover image is never used as the playing field. */
export function mountGolf(root) {
  const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('canvas'));
  const ctx = canvas.getContext('2d');
  if (!ctx) { root.textContent = 'Canvas rendering is unavailable. Try a current browser or return to the library.'; return; }
  const c = ctx;
  let state = createGolf(), started = false, paused = false, previous = 0, frameId;
  let angle = -0.35, power = 0.6, message = '';
  /** @type {{x:number,y:number,distance:number}|null} */ let drag = null;
  const angleInput = /** @type {HTMLInputElement} */ (root.querySelector('#golf-angle'));
  const powerInput = /** @type {HTMLInputElement} */ (root.querySelector('#golf-power'));
  const status = root.querySelector('#table-status');
  const curtain = root.querySelector('.session-cover');
  const score = root.querySelector('#golf-score');
  const shotButton = /** @type {HTMLButtonElement} */ (root.querySelector('#golf-hit'));
  const next = /** @type {HTMLButtonElement} */ (root.querySelector('#golf-next'));
  const pause = /** @type {HTMLButtonElement} */ (root.querySelector('#golf-pause'));
  const outputs = root.querySelectorAll('.golf-meter');
  function inputs() { angleInput.value = String(Math.round(angle * 180 / Math.PI)); powerInput.value = String(Math.round(power * 100)); outputs[0].textContent = `${angleInput.value}°`; outputs[1].textContent = `${powerInput.value}%`; }
  function announce(text) { if (message !== text) { message = text; status.textContent = text; } }
  function reset() { state = createGolf(); started = true; paused = false; drag = null; angle = -0.35; power = .6; curtain.hidden = true; next.hidden = true; pause.disabled = false; pause.textContent = 'Pause'; root.querySelector('#golf-finish').textContent = ''; inputs(); announce('Hole 1. Drag from the ball towards your target, or set the angle and power below.'); canvas.focus(); }
  function togglePause() { if (!started || state.phase === 'finished') return; paused = !paused; drag = null; pause.textContent = paused ? 'Resume' : 'Pause'; announce(paused ? 'Paused. Press Resume to continue.' : 'Back on the green.'); }
  function stroke() { if (started && !paused && hitGolf(state, angle, power)) announce('Ball in motion.'); }
  root.querySelector('#table-start').addEventListener('click', reset);
  root.querySelector('#table-restart').addEventListener('click', reset);
  pause.addEventListener('click', togglePause);
  shotButton.addEventListener('click', stroke);
  root.querySelector('#golf-reset').addEventListener('click', () => { if (started && !paused) { resetGolfBall(state); announce('Ball reset to tee. One penalty stroke added.'); } });
  next.addEventListener('click', () => {
    if (paused || !nextHole(state)) return;
    next.hidden = true;
    if (state.phase === 'finished') {
      let record = '';
      try { const best = Number(localStorage.getItem('psd-pocket-golf-best')) || Infinity; if (state.total < best) { localStorage.setItem('psd-pocket-golf-best', String(state.total)); record = ' New personal best!'; } } catch { /* Optional storage. */ }
      announce(`Course complete: ${state.total} strokes, par 8.${record} Restart to play again.`);
      root.querySelector('#golf-finish').innerHTML = `<div class="golf-scorecard"><h3>COURSE COMPLETE</h3><div class="scorecard-holes">${state.results.map((strokes, index) => `<div><small>HOLE ${index + 1} · PAR ${COURSES[index].par}</small><b>${strokes}</b></div>`).join('')}</div><p><strong>${state.total} strokes</strong> · Course par 8${record}</p></div>`;
    } else { angle = Math.atan2(COURSES[state.hole].cup.y - state.y, COURSES[state.hole].cup.x - state.x); inputs(); announce(`Hole ${state.hole + 1}: ${COURSES[state.hole].name}.`); }
  });
  angleInput.addEventListener('input', () => { angle = Number(angleInput.value) * Math.PI / 180; inputs(); });
  powerInput.addEventListener('input', () => { power = Number(powerInput.value) / 100; inputs(); });
  function point(e) { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) / rect.width * 800, y: (e.clientY - rect.top) / rect.height * 480 }; }
  canvas.addEventListener('pointerdown', e => {
    if (!started || paused || golfMoving(state) || state.phase !== 'playing') return;
    const p = point(e); if (Math.hypot(p.x - state.x, p.y - state.y) > 46) { announce('Start your drag on the white ball.'); return; }
    canvas.setPointerCapture(e.pointerId); drag = { x: state.x, y: state.y, distance: 0 }; e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const p = point(e); drag.distance = Math.hypot(p.x - drag.x, p.y - drag.y); angle = Math.atan2(p.y - drag.y, p.x - drag.x); power = Math.max(.1, Math.min(1, drag.distance / 240)); inputs(); });
  canvas.addEventListener('pointerup', () => { if (drag && drag.distance > 10) stroke(); drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    if (e.key.toLowerCase() === 'p') { e.preventDefault(); if (!e.repeat) togglePause(); }
    if (!started || paused) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); angle += (e.key === 'ArrowLeft' ? -1 : 1) * .05; angle = Math.atan2(Math.sin(angle), Math.cos(angle)); inputs(); }
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) stroke(); }
  });
  const blur = () => { if (started && !paused && state.phase !== 'finished') togglePause(); };
  window.addEventListener('blur', blur); document.addEventListener('visibilitychange', () => { if (document.hidden) blur(); });
  function rectangle(x,y,w,h,color,r=0) { c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill(); }
  function paint() {
    const course = COURSES[state.hole];
    c.clearRect(0,0,800,480); const bg = c.createLinearGradient(0,0,800,480);bg.addColorStop(0,'#0c2530');bg.addColorStop(1,'#0a1829');rectangle(0,0,800,480,bg);
    c.shadowColor='#0008';c.shadowBlur=18;c.shadowOffsetY=10;rectangle(28,28,744,424,'#3d6670',24);c.shadowBlur=0;c.shadowOffsetY=0;
    rectangle(36,36,728,408,'#122e39',20);rectangle(40,40,720,400,'#235f54',16);
    c.save();c.beginPath();c.roundRect(40,40,720,400,16);c.clip();
    for(let x=40;x<760;x+=72)rectangle(x,40,36,400,'#baffd308');
    c.strokeStyle='#c2ffd82a';c.lineWidth=2;c.strokeRect(50,50,700,380);c.restore();
    for(const wall of course.walls){rectangle(wall.x+3,wall.y+6,wall.w,wall.h,'#102b31aa',5);rectangle(wall.x,wall.y,wall.w,wall.h,'#93b8ac',5);rectangle(wall.x+3,wall.y+3,wall.w-6,wall.h-8,'#628d86',3);}
    c.beginPath();c.arc(course.cup.x,course.cup.y,14,0,Math.PI*2);c.fillStyle='#0b2025';c.fill();c.strokeStyle='#8da899';c.lineWidth=2;c.stroke();
    c.beginPath();c.moveTo(course.cup.x,course.cup.y);c.lineTo(course.cup.x,course.cup.y-42);c.strokeStyle='#ffe5ab';c.lineWidth=3;c.stroke();c.beginPath();c.moveTo(course.cup.x,course.cup.y-42);c.lineTo(course.cup.x+28,course.cup.y-33);c.lineTo(course.cup.x,course.cup.y-25);c.fillStyle='#ff9b98';c.fill();
    if(started&&!paused&&!golfMoving(state)&&state.phase==='playing'){
      const distance=40+power*180;c.save();c.setLineDash([5,9]);c.strokeStyle='#d6ffdeaa';c.lineWidth=2;c.beginPath();c.moveTo(state.x,state.y);c.lineTo(state.x+Math.cos(angle)*distance,state.y+Math.sin(angle)*distance);c.stroke();c.restore();
    }
    if(state.phase==='playing'){
      c.beginPath();c.ellipse(state.x+2,state.y+4,9,6,0,0,Math.PI*2);c.fillStyle='#061b2977';c.fill();
      const ball=c.createRadialGradient(state.x-3,state.y-3,1,state.x,state.y,9);ball.addColorStop(0,'#fff');ball.addColorStop(1,'#bfcfc5');c.beginPath();c.arc(state.x,state.y,8,0,Math.PI*2);c.fillStyle=ball;c.fill();
    }
    if(paused){rectangle(0,0,800,480,'#091625d9');c.fillStyle='#def6eb';c.font='bold 36px sans-serif';c.textAlign='center';c.fillText('PAUSED',400,250);}
  }
  function frame(now) {
    frameId=requestAnimationFrame(frame);const dt=Math.min((now-(previous||now))/1000,.05);previous=now;
    const before=state.phase;if(started&&!paused)stepGolf(state,dt);
    if(before==='playing'&&state.phase==='holed'){next.hidden=false;next.textContent=state.hole===2?'See scorecard →':'Next hole →';announce(`Holed in ${state.strokes} strokes. Par ${COURSES[state.hole].par}.`);}
    const canAim=started&&!paused&&!golfMoving(state)&&state.phase==='playing';shotButton.disabled=!canAim;angleInput.disabled=powerInput.disabled=!canAim;
    next.disabled=paused; score.textContent=String(state.total);root.querySelector('#golf-hole').textContent=`${state.hole+1} / 3`;root.querySelector('#golf-strokes').textContent=String(state.strokes);root.querySelector('#golf-par').textContent=String(COURSES[state.hole].par);
    paint();
  }
  inputs();frameId=requestAnimationFrame(frame);
  window.addEventListener('pagehide', e=>{if(e.persisted)blur();else cancelAnimationFrame(frameId);});
}
