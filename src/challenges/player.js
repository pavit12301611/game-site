import '../tabletop/tabletop.css';
import './challenges.css';
import { SOLO_GAMES } from '../arcade/catalog.js';
import { createBlocks, shiftBlock, rotateBlock, descendBlock, hardDrop, stepBlocks } from './blocks.js';
import { loadWarehouse, moveCrate, undoCrate, WAREHOUSES } from './sokoban.js';
import { createFlood, floodColor, HEX_COLORS, FLOOD_LIMIT } from './flood.js';
import { createLander, stepLander, PAD } from './lander.js';
import { drawChallenge } from './renderers.js';
const SPECS={
 blocks:{title:'STACK WITH INTENTION',tag:'Falling-block puzzle',sub:'Find the gap. Clear the line.',goal:'Clear 20 lines before the stack reaches the top. Seven different pieces arrive in shuffled bags; complete horizontal rows disappear.',controls:'← → / A D move. ↑ / W rotates. ↓ / S soft-drops. Space hard-drops. Touch buttons do the same. P pauses.',size:[480,600]},
 sokoban:{title:'THINK BEFORE YOU PUSH',tag:'Crate-pushing puzzle',sub:'Every box needs a way home.',goal:'Push every crate onto a mint target. You can push one crate at a time, never pull. Four handcrafted rooms form one puzzle game.',controls:'Arrow keys / WASD or swipe to walk and push. Z or Undo steps back. Reset room is always available. Complete a room to unlock the next.',size:[800,500]},
 lander:{title:'MAKE A SOFT ARRIVAL',tag:'Lunar flight physics',sub:'Gravity is not on your side.',goal:'Land on the illuminated pad with downward speed at most 28, horizontal speed at most 15 and tilt below 9°. Fuel is limited.',controls:'Hold ← → / A D to rotate. Hold ↑ / W / Space for thrust. Release to coast. P pauses. Touch controls support simultaneous rotation and thrust.',size:[800,500]},
 flood:{title:'MAKE THE COLOURS YOURS',tag:'Hex territory puzzle',sub:'One colour can change the map.',goal:'Starting at the outlined top-left territory, choose colours to absorb adjacent hexes. Own all 81 hexes within 30 moves.',controls:'Tap one of six named colour buttons, or press 1–6. Numbers on the hexes match the buttons. Choosing your current colour does not spend a move.',size:[800,500]},
};
const game=SOLO_GAMES.find(g=>g.id===new URLSearchParams(location.search).get('game')&&Object.hasOwn(SPECS,g.engine));
const root=/** @type {HTMLElement} */(document.getElementById('challenge-app'));
if(!game)root.innerHTML='<section class="not-found"><h1>That challenge is not in this collection.</h1><a href="/#/catalog">← Return to the library</a></section>';
else mount(game);
function mount(game){
 const kind=game.engine,spec=SPECS[kind],realtime=['blocks','lander'].includes(kind);root.dataset.kind=kind;document.title=`${game.title} — PSD Gaming`;
 const paletteNames=['Mint','Coral','Violet','Rose','Blue','Gold'];
 const controls=kind==='blocks'?'<button data-act="left" aria-label="Move left">←</button><button data-act="rotate" aria-label="Rotate piece">↻</button><button data-act="right" aria-label="Move right">→</button><button data-act="down" aria-label="Soft drop">↓</button><button data-act="drop" class="accent-control">Drop ⤓</button>':kind==='sokoban'?'<button data-act="left" aria-label="Move left">←</button><button data-act="up" aria-label="Move up">↑</button><button data-act="down" aria-label="Move down">↓</button><button data-act="right" aria-label="Move right">→</button><button data-act="undo">Undo ↶</button><button data-act="room-reset">Reset room</button><button data-act="next" class="accent-control" hidden>Next room →</button>':kind==='lander'?'<button data-hold="left" aria-label="Rotate left">↶ Rotate</button><button data-hold="thrust" class="accent-control">▲ THRUST</button><button data-hold="right" aria-label="Rotate right">Rotate ↷</button>':paletteNames.map((name,i)=>`<button data-color="${i}" class="palette-button" style="--swatch:${HEX_COLORS[i]}" aria-label="${name}, key ${i+1}"><i aria-hidden="true">${i+1}</i><span>${name}</span></button>`).join('');
 root.innerHTML=`<header class="collection-top"><a class="collection-brand" href="/#/catalog">← PSD <span>GAMING</span></a><span class="collection-label">THE CHALLENGE COLLECTION</span><span class="collection-tag">${spec.tag}</span></header><section class="collection-heading"><div><span class="overline">${spec.title}</span><h1>${game.title}</h1><p>${spec.sub}</p></div><div class="mission-actions">${realtime?'<button id="mission-pause" disabled>Pause</button>':''}<button id="mission-restart">New game ↻</button></div></section><div class="collection-layout"><section class="table-console"><div class="table-hud" id="mission-hud"></div><div class="mission-stage"><canvas id="mission-canvas" width="${spec.size[0]}" height="${spec.size[1]}" tabindex="0" aria-label="${game.title} playing field. ${spec.controls}"></canvas><div class="session-cover"><img src="/images/originals/${game.id}.webp" width="960" height="600" alt=""><div><span class="overline">A DIFFERENT KIND OF CHALLENGE</span><h2>${game.title}</h2><p>${spec.goal}</p><button id="mission-start" class="accent-control">Start playing →</button><small>Single-player · No account needed</small></div></div><div id="mission-overlay" class="mission-result" hidden><h2 id="result-heading"></h2><p id="result-copy"></p><button id="mission-continue" class="accent-control">Play again →</button></div></div>${kind==='lander'?'<div class="flight-readout"><span>X <b id="flight-x">400</b></span><span>TILT <b id="flight-tilt">0</b>°</span><span>TIME <b id="flight-time">0</b>s</span></div>':''}<div id="mission-status" class="table-message" role="status" aria-live="polite">${spec.controls}</div><div class="table-controls mission-controls">${controls}</div></section><aside class="collection-guide"><div class="guide-art"><img src="/images/originals/${game.id}.webp" width="960" height="600" alt="${game.title} promotional illustration"></div><div class="guide-copy"><span class="overline">THE OBJECTIVE</span><p>${spec.goal}</p><span class="overline">YOUR CONTROLS</span><p>${spec.controls}</p><div class="honest-mode">Single-player · Local session<br>Illustrated cover, actual state-driven gameplay.</div></div></aside></div>`;
 function el(id){const node=root.querySelector(`#${id}`);if(!(node instanceof HTMLElement))throw Error(`Missing control ${id}`);return node;}
 const canvas=/** @type {HTMLCanvasElement} */(el('mission-canvas')),c=canvas.getContext('2d');if(!c){el('mission-status').textContent='Canvas is unavailable. Try a current browser.';return;}
 const context=c;const cover=/** @type {HTMLElement} */(root.querySelector('.session-cover'));
 const factory={blocks:createBlocks,sokoban:loadWarehouse,lander:createLander,flood:createFlood}[kind];
 /** @type {any} */let state=factory();let started=false,paused=false,previous=0,frameId,lastHUD='';let best=0;
 const held=new Set(),keys=new Set();const storageKey=`psd-best-${game.id}`;
 try{best=Number(localStorage.getItem(storageKey))||0;}catch{/* Storage is optional. */}
 function say(text){el('mission-status').textContent=text;}
 function reset(){state=factory();started=true;paused=false;keys.clear();held.clear();root.querySelectorAll('.held').forEach(n=>n.classList.remove('held'));cover.hidden=true;el('mission-overlay').hidden=true;if(realtime){/** @type {HTMLButtonElement} */(el('mission-pause')).disabled=false;el('mission-pause').textContent='Pause';}say(spec.controls);update();canvas.focus({preventScroll:true});}
 function pause(){if(!started||state.phase!=='playing')return;paused=!paused;keys.clear();held.clear();root.querySelectorAll('.held').forEach(n=>n.classList.remove('held'));el('mission-pause').textContent=paused?'Resume':'Pause';el('mission-overlay').hidden=!paused;el('result-heading').textContent='Take a breather.';el('result-copy').textContent='Your game is paused.';el('mission-continue').textContent='Resume →';say(paused?'Paused.':spec.controls);}
 function terminal(){
  if(kind==='sokoban'){say(`Room ${state.level+1} solved in ${state.moves} moves and ${state.pushes} pushes.${state.level===WAREHOUSES.length-1?' All four rooms complete!':''}`);return;}
  if(state.phase==='won'||state.phase==='lost'){
   const score=kind==='blocks'?state.score:kind==='lander'&&state.phase==='won'?Math.round(state.fuel*10):kind==='flood'&&state.phase==='won'?FLOOD_LIMIT-state.moves+1:0;
   if(score>best){best=score;try{localStorage.setItem(storageKey,String(best));}catch{/* Optional high score. */}}
   el('mission-overlay').hidden=false;el('result-heading').textContent=state.phase==='won'?'Beautifully done.':'One more attempt?';
   el('result-copy').textContent=kind==='blocks'?`${state.lines} lines · Score ${state.score} · Best ${best}`:kind==='lander'?`${state.reason} Fuel ${Math.round(state.fuel)}% · ${state.time.toFixed(1)} seconds`:`${state.owned.length} / 81 hexes in ${state.moves} moves.`;
   el('mission-continue').textContent='Play again →';say(el('result-copy').textContent);keys.clear();held.clear();root.querySelectorAll('.held').forEach(n=>n.classList.remove('held'));
  }
 }
 function update(){
  const pairs=kind==='blocks'?[['SCORE',state.score],['LINES',`${state.lines} / 20`],['LEVEL',state.level],['BEST',best]]:kind==='sokoban'?[['ROOM',`${state.level+1} / ${WAREHOUSES.length}`],['MOVES',state.moves],['PUSHES',state.pushes],['GOALS',`${state.boxes.filter(i=>state.goals.includes(i)).length} / ${state.goals.length}`]]:kind==='lander'?[['ALTITUDE',Math.max(0,Math.round(PAD.y-state.y-16))],['↓ SPEED',state.vy.toFixed(1)],['→ SPEED',state.vx.toFixed(1)],['FUEL',`${Math.round(state.fuel)}%`]]:[['TERRITORY',`${state.owned.length} / 81`],['MOVES LEFT',FLOOD_LIMIT-state.moves],['BEST',best]];
  const html=pairs.map(([label,value])=>`<div><small>${label}</small><b>${value}</b></div>`).join('');if(html!==lastHUD){lastHUD=html;el('mission-hud').innerHTML=html;}
  if(kind==='lander'){el('flight-x').textContent=state.x.toFixed(1);el('flight-tilt').textContent=(state.angle*180/Math.PI).toFixed(1);el('flight-time').textContent=state.time.toFixed(1);}
  if(kind==='sokoban'){const next=/** @type {HTMLButtonElement} */(root.querySelector('[data-act="next"]'));next.hidden=state.phase!=='won'||state.level===WAREHOUSES.length-1;}
  if(kind==='flood')root.querySelectorAll('[data-color]').forEach(n=>{const b=/** @type {HTMLButtonElement} */(n);b.disabled=!started||state.phase!=='playing'||Number(b.dataset.color)===state.board[0];b.setAttribute('aria-pressed',String(Number(b.dataset.color)===state.board[0]));});
 }
 function action(act){if(!started||paused)return;const before=state.phase;
  if(kind==='blocks'){if(act==='left')shiftBlock(state,-1);if(act==='right')shiftBlock(state,1);if(act==='rotate')rotateBlock(state);if(act==='down'&&descendBlock(state))state.score++;if(act==='drop')hardDrop(state);}
  if(kind==='sokoban'){
   if(act==='undo'){if(undoCrate(state))say('Last move undone.');}else if(act==='room-reset'){state=loadWarehouse(state.level);say('Room reset.');}else if(act==='next'&&state.phase==='won'&&state.level<WAREHOUSES.length-1){state=loadWarehouse(state.level+1);say(`Room ${state.level+1}. Push every crate onto a target.`);}else moveCrate(state,act);
  }
  if(kind==='flood')floodColor(state,Number(act));
  update();if(before==='playing'&&state.phase!=='playing')terminal();
 }
 el('mission-start').addEventListener('click',reset);el('mission-restart').addEventListener('click',reset);if(realtime)el('mission-pause').addEventListener('click',pause);
 el('mission-continue').addEventListener('click',()=>{if(paused)pause();else reset();});
 root.addEventListener('click',e=>{const button=/** @type {HTMLButtonElement|null} */(/** @type {HTMLElement} */(e.target).closest('[data-act],[data-color]'));if(button)action(button.dataset.act??button.dataset.color);});
 root.querySelectorAll('[data-hold]').forEach(node=>{const b=/** @type {HTMLButtonElement} */(node);b.addEventListener('pointerdown',e=>{if(!started||paused)return;e.preventDefault();b.setPointerCapture(e.pointerId);held.add(b.dataset.hold);b.classList.add('held');});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{held.delete(b.dataset.hold);b.classList.remove('held');});});
 const map={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowdown:'down',s:'down',arrowup:'up',w:'up'};
 window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(!started)return;if(k==='p'&&realtime){e.preventDefault();if(!e.repeat)pause();return;}if(paused||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(k===' '&&e.target instanceof HTMLButtonElement)return;
  if(kind==='lander'&&(map[k]||k===' ')){e.preventDefault();keys.add(k);return;}
  if(kind==='flood'&&/^[1-6]$/.test(k)){e.preventDefault();if(!e.repeat)action(String(Number(k)-1));return;}
  if(map[k]){e.preventDefault();action(kind==='blocks'&&map[k]==='up'?'rotate':map[k]);}else if(kind==='blocks'&&k===' '){e.preventDefault();if(!e.repeat)action('drop');}else if(kind==='sokoban'&&k==='z'){e.preventDefault();action('undo');}
 });
 window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
 /** @type {{x:number,y:number}|null} */let swipe=null;
 canvas.addEventListener('pointerdown',e=>{if(kind==='sokoban'&&started){swipe={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
 canvas.addEventListener('pointerup',e=>{if(!swipe)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;if(Math.max(Math.abs(dx),Math.abs(dy))>15)action(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');});canvas.addEventListener('pointercancel',()=>{swipe=null;});
 function blur(){keys.clear();held.clear();root.querySelectorAll('.held').forEach(n=>n.classList.remove('held'));if(realtime&&started&&!paused&&state.phase==='playing')pause();}
 window.addEventListener('blur',blur);document.addEventListener('visibilitychange',()=>{if(document.hidden)blur();});
 function frame(now){frameId=requestAnimationFrame(frame);const dt=Math.min((now-(previous||now))/1000,.05);previous=now;const before=state.phase;
  if(started&&!paused){if(kind==='blocks')stepBlocks(state,dt);if(kind==='lander')stepLander(state,{left:keys.has('arrowleft')||keys.has('a')||held.has('left'),right:keys.has('arrowright')||keys.has('d')||held.has('right'),thrust:keys.has('arrowup')||keys.has('w')||keys.has(' ')||held.has('thrust')},dt);}
  if(before==='playing'&&state.phase!=='playing')terminal();update();drawChallenge(context,kind,state,canvas.width,canvas.height);
 }
 update();frameId=requestAnimationFrame(frame);window.addEventListener('pagehide',e=>{if(e.persisted)blur();else cancelAnimationFrame(frameId);});
}
