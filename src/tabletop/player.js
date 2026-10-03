import './tabletop.css';
import { SOLO_GAMES } from '../arcade/catalog.js';
import { createMerge, moveMerge } from './merge.js';
import { createMines, revealMine, flagMine, MINE_COUNT } from './mines.js';
import { createReversi, playReversi, legalMoves, countDiscs, chooseReversiMove } from './reversi.js';
import { mountGolf } from './golf-view.js';

const game = SOLO_GAMES.find(g => g.id === new URLSearchParams(location.search).get('game') && ['merge', 'mines', 'reversi', 'golf'].includes(g.engine));
const root = /** @type {HTMLElement} */ (document.getElementById('collection-app'));
const SPECS = {
  merge: { kicker: 'EVERY MOVE ADDS UP', subtitle: 'Make room for something bigger.', goal: 'Slide the board. Equal neighbours merge once per move. Build a 2048 tile before the grid locks up.', controls: 'Arrow keys / WASD, swipe the board, or use the direction buttons. A valid move adds a new tile.', accent: 'apricot', label: 'Number puzzle' },
  mines: { kicker: 'READ BETWEEN THE TILES', subtitle: 'A little logic. A lot of nerve.', goal: 'Uncover 71 safe squares. Numbers count nearby mines. Ten mines are hidden; the first reveal and its neighbours are safe.', controls: 'Click to reveal. Right-click to flag, or switch Flag mode for touch. Flags are markers, not proof a cell is safe.', accent: 'cyan', label: 'Logic puzzle' },
  reversi: { kicker: 'CHANGE THE WHOLE BOARD', subtitle: 'One move can turn everything.', goal: 'Bracket enemy discs in a straight line to flip them. The player with more discs when neither side can move wins.', controls: 'Choose a dotted legal square. Black plays first. No legal move? Your turn passes automatically. CPU mode or two people on this device.', accent: 'mint', label: 'Strategy' },
  golf: { kicker: 'FIND A DIFFERENT ANGLE', subtitle: 'Three greens. Your perfect line.', goal: 'Sink the ball on three courses in as few strokes as possible. Walls bounce; the ball must slow down to drop into the cup.', controls: 'Drag from the ball toward your target: longer drag = more power. Or use the angle/power sliders and Take shot. Arrow keys aim; Space shoots; P pauses.', accent: 'mint', label: 'Physics golf' },
};
if (!game) root.innerHTML = '<div class="not-found"><h1>Choose a game from the collection.</h1><a href="/#/catalog">← Back to the library</a></div>';
else start(game);
function start(game) {
  const spec = SPECS[game.engine];document.title=`${game.title} — PSD Gaming`;root.dataset.accent=spec.accent;
  const isGolf=game.engine==='golf';
  root.innerHTML=`<header class="collection-top"><a href="/#/catalog" class="collection-brand">← PSD <span>GAMING</span></a><span class="collection-label">THE TABLETOP COLLECTION</span><span class="collection-tag">${spec.label}</span></header>
    <section class="collection-heading"><div><span class="overline">${spec.kicker}</span><h1>${game.title}</h1><p>${spec.subtitle}</p></div><button id="table-restart" class="quiet-control">New game ↻</button></section>
    <div class="collection-layout"><section class="table-console"><div id="table-hud" class="table-hud">${isGolf?'<div><small>HOLE</small><b id="golf-hole">1 / 3</b></div><div><small>STROKES</small><b id="golf-strokes">0</b></div><div><small>PAR</small><b id="golf-par">2</b></div><div><small>TOTAL</small><b id="golf-score">0</b></div>':''}</div>
    <div class="table-arena ${isGolf?'golf-arena':''}"><div id="table-board" tabindex="0" aria-label="${game.title} playing area">${isGolf?'<canvas id="golf-canvas" width="800" height="480" tabindex="0" aria-label="Golf course. Drag from the ball to aim, or use the controls below."></canvas>':''}</div><div class="session-cover"><img src="/images/originals/${game.id}.webp" width="960" height="600" alt=""><div><span class="overline">PICK UP. PLAY. THINK AGAIN.</span><h2>${game.title}</h2><p>${spec.goal}</p><button id="table-start" class="accent-control">Play ${game.title} →</button><small>No account needed · Runs in your browser</small></div></div></div>
    <div id="table-message" class="table-message" role="status" aria-live="polite">${isGolf?'<div id="golf-finish"></div>':''}</div>
    <div class="table-controls">${isGolf?'<div class="golf-sliders"><label>ANGLE <output class="golf-meter"></output><input id="golf-angle" type="range" min="-180" max="180" value="-20" aria-label="Shot angle"></label><label>POWER <output class="golf-meter"></output><input id="golf-power" type="range" min="10" max="100" value="60" aria-label="Shot power"></label></div><div class="control-row"><button id="golf-hit" class="accent-control" disabled>Take shot ↗</button><button id="golf-next" class="accent-control" hidden>Next hole →</button><button id="golf-pause" disabled>Pause</button><button id="golf-reset">Reset ball (+1)</button></div>':game.engine==='merge'?'<div class="direction-controls" aria-label="Slide tiles"><button data-slide="left" aria-label="Slide left">←</button><button data-slide="up" aria-label="Slide up">↑</button><button data-slide="down" aria-label="Slide down">↓</button><button data-slide="right" aria-label="Slide right">→</button></div>':game.engine==='mines'?'<button id="flag-mode" aria-pressed="false">⚑ Flag mode: OFF</button><span class="control-note">Right-click also places a flag</span>':'<label class="opponent-label">OPPONENT <select id="reversi-mode"><option value="cpu">CPU rival</option><option value="local">Friend on this device</option></select></label><span class="control-note">Black opens · Dots show legal moves</span>'}</div></section>
    <aside class="collection-guide"><div class="guide-art"><img src="/images/originals/${game.id}.webp" width="960" height="600" alt="${game.title} promotional illustration"></div><div class="guide-copy"><span class="overline">THE OBJECTIVE</span><p>${spec.goal}</p><span class="overline">YOUR CONTROLS</span><p>${spec.controls}</p><div class="honest-mode">${game.engine==='reversi'?'Solo vs CPU or local two-player. No online room.':'Single-player · Local session'}</div></div></aside></div><p id="table-status" class="table-status" role="status" aria-live="polite">Ready when you are.</p>`;
  if(isGolf){mountGolf(root);return;}
  function select(selector) {
    const node = root.querySelector(selector);
    if (!(node instanceof HTMLElement)) throw new Error(`Missing game control: ${selector}`);
    return node;
  }
  const board=/** @type {HTMLElement} */(select('#table-board'));
  const hud=select('#table-hud');const cover=/** @type {HTMLElement} */(select('.session-cover'));
  const status=select('#table-status');const message=select('#table-message');
  const factories={merge:createMerge,mines:createMines,reversi:createReversi};
  /** @type {any} */let state=factories[game.engine]();let started=false,flags=false,opponent='cpu',generation=0;
  /** @type {ReturnType<typeof setTimeout> | null} */let cpuTimer=null;
  let best=0;try{best=Number(localStorage.getItem(`psd-best-${game.id}`))||0;}catch{/* Optional storage. */}
  function cancelCPU(){generation++;if(cpuTimer!==null){clearTimeout(cpuTimer);cpuTimer=null;}}
  function reset(){cancelCPU();state=factories[game.engine]();started=true;flags=false;cover.hidden=true;status.textContent='New game started.';render();board.focus({preventScroll:true});}
  function render(){
    if(game.engine==='merge'){
      if(state.score>best){best=state.score;try{localStorage.setItem(`psd-best-${game.id}`,String(best));}catch{/* Optional storage. */}}
      hud.innerHTML=`<div><small>SCORE</small><b>${state.score}</b></div><div><small>BEST</small><b>${best}</b></div><div><small>MOVES</small><b>${state.moves}</b></div><div><small>TARGET</small><b>2048</b></div>`;
      board.innerHTML=`<div class="merge-grid" role="grid" aria-label="2048 tile board">${state.board.map((v,i)=>`<div class="merge-tile ${v?'tile-'+Math.min(11,Math.log2(v)):'empty'} ${i===state.spawned?'tile-new':''}" role="gridcell" aria-label="Row ${Math.floor(i/4)+1}, column ${i%4+1}: ${v||'empty'}">${v||''}</div>`).join('')}</div>`;
      message.textContent=state.phase==='won'?'2048! You made it. Start a new game to play again.':state.phase==='lost'?'No moves left. Your next run starts with New game.':'Slide equal tiles together. Each tile merges once per move.';
      root.querySelectorAll('[data-slide]').forEach(n=>{/** @type {HTMLButtonElement} */(n).disabled=!started||state.phase!=='playing';});
    }else if(game.engine==='mines'){
      const opened=state.revealed.filter(Boolean).length,marked=state.flags.filter(Boolean).length;
      hud.innerHTML=`<div><small>MINES</small><b>${MINE_COUNT}</b></div><div><small>FLAGS LEFT</small><b>${MINE_COUNT-marked}</b></div><div><small>SAFE</small><b>${opened-(state.exploded>=0?1:0)} / 71</b></div>`;
      board.innerHTML=`<div class="mine-grid" role="group" aria-label="Minefield, nine rows and nine columns">${state.revealed.map((shown,i)=>{
        const showMine=state.phase==='lost'&&state.mines[i],flag=state.flags[i];const label=showMine?'mine':flag?'flagged':shown?state.counts[i]?`${state.counts[i]} adjacent mines`:'empty':'covered';
        return `<button class="mine-cell ${shown?'open':''} ${flag?'flagged':''} ${showMine?'mine':''} ${state.exploded===i?'exploded':''}" data-cell="${i}" data-clue="${shown?state.counts[i]:0}" aria-label="Row ${Math.floor(i/9)+1}, column ${i%9+1}: ${label}" ${!started||state.phase!=='playing'?'disabled':''}>${showMine?'<span class="mine-symbol" aria-hidden="true">✹</span>':flag?'<span class="flag-symbol" aria-hidden="true">⚑</span>':shown?state.counts[i]||'':''}</button>`;
      }).join('')}</div>`;
      message.textContent=state.phase==='won'?'All 71 safe squares found. Field cleared!':state.phase==='lost'?'Mine hit. The field is revealed. Try a new game.':!state.planted?'Your first reveal and its neighbours are safe.':flags?'Flag mode: tap a covered square to mark or unmark it.':'Read the clues. Each number counts neighbouring mines.';
      const flag=select('#flag-mode');flag.textContent=`⚑ Flag mode: ${flags?'ON':'OFF'}`;flag.setAttribute('aria-pressed',String(flags));
    }else{
      const [black,white]=countDiscs(state.board),legal=legalMoves(state.board,state.turn);const thinking=started&&opponent==='cpu'&&state.turn===2&&state.phase==='playing';
      hud.innerHTML=`<div><small>● BLACK${opponent==='cpu'?' · YOU':''}</small><b>${black}</b></div><div><small>○ WHITE${opponent==='cpu'?' · CPU':''}</small><b>${white}</b></div><div><small>TURN</small><b>${state.phase==='finished'?'DONE':state.turn===1?'BLACK':'WHITE'}</b></div>`;
      board.innerHTML=`<div class="reversi-grid" role="group" aria-label="Reversi board, eight rows and eight columns">${state.board.map((v,i)=>`<button class="reversi-cell ${legal.includes(i)?'legal':''} ${i===state.last?'last-move':''}" data-cell="${i}" aria-label="Row ${Math.floor(i/8)+1}, column ${i%8+1}: ${v?v===1?'black disc':'white disc':legal.includes(i)?'legal move':'empty'}" ${!started||thinking||state.phase!=='playing'||!legal.includes(i)?'disabled':''}>${v?`<span class="reversi-disc disc-${v} ${state.flipped.includes(i)?'disc-flipped':''}" aria-hidden="true"></span>`:legal.includes(i)?'<span class="legal-dot" aria-hidden="true"></span>':''}</button>`).join('')}</div>`;
      message.textContent=state.phase==='finished'?`${state.winner===0?'A draw':state.winner===1?'Black wins':'White wins'} — ${black} to ${white}.`:thinking?'CPU is considering its reply…':`${state.passed?(state.passed===1?'Black':'White')+' has no legal move and passes. ':''}${state.turn===1?'Black':'White'} to play. Choose a dotted square.`;
    }
  }
  function scheduleCPU(){
    if(game.engine!=='reversi'||!started||opponent!=='cpu'||state.turn!==2||state.phase!=='playing'||cpuTimer!==null)return;
    const ticket=generation;cpuTimer=setTimeout(()=>{cpuTimer=null;if(ticket!==generation||!started)return;const move=chooseReversiMove(state);if(move>=0)playReversi(state,move);render();scheduleCPU();},480);
  }
  function slide(direction){if(!started)return;const moved=moveMerge(state,direction);if(moved||state.phase!=='playing'){render();status.textContent=state.phase==='playing'?`Score ${state.score}. ${state.moves} moves.`:message.textContent;}}
  select('#table-start').addEventListener('click',reset);select('#table-restart').addEventListener('click',reset);
  root.addEventListener('click',e=>{
    const target=/** @type {HTMLElement} */(e.target);const cell=/** @type {HTMLButtonElement | null} */(target.closest('[data-cell]'));const arrow=/** @type {HTMLButtonElement | null} */(target.closest('[data-slide]'));
    if(arrow&&game.engine==='merge'){slide(arrow.dataset.slide);return;}
    if(!cell||!started)return;const index=Number(cell.dataset.cell);
    if(game.engine==='mines'){if(flags)flagMine(state,index);else revealMine(state,index);}
    else if(game.engine==='reversi'){if(opponent==='cpu'&&state.turn===2)return;playReversi(state,index);}
    render();const replacement=/** @type {HTMLButtonElement | null} */(board.querySelector(`[data-cell="${index}"]`));if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});else board.focus({preventScroll:true});
    status.textContent=message.textContent;scheduleCPU();
  });
  if(game.engine==='mines'){
    select('#flag-mode').addEventListener('click',()=>{flags=!flags;render();status.textContent=message.textContent;});
    board.addEventListener('contextmenu',e=>{e.preventDefault();const cell=/** @type {HTMLElement | null} */(/** @type {HTMLElement} */(e.target).closest('[data-cell]'));if(started&&cell){flagMine(state,Number(cell.dataset.cell));render();}});
  }
  if(game.engine==='reversi')select('#reversi-mode').addEventListener('change',e=>{opponent=/** @type {HTMLSelectElement} */(e.target).value;reset();});
  const directions={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down'};
  window.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||!started)return;
    const direction=directions[e.key.toLowerCase()];if(!direction)return;
    if(game.engine==='merge'){e.preventDefault();slide(direction);}
    else{
      const current=/** @type {HTMLElement} */(document.activeElement);if(!current?.matches('[data-cell]'))return;e.preventDefault();
      const size=game.engine==='mines'?9:8,index=Number(current.dataset.cell),delta=direction==='left'?-1:direction==='right'?1:direction==='up'?-size:size;
      let next=index+delta;while(next>=0&&next<size*size){if(Math.abs(delta)===1&&Math.floor(next/size)!==Math.floor(index/size))break;const candidate=/** @type {HTMLButtonElement | null} */(board.querySelector(`[data-cell="${next}"]`));if(candidate&&!candidate.disabled){candidate.focus();break;}next+=delta;}
    }
  });
  /** @type {{x:number,y:number}|null} */let swipe=null;
  board.addEventListener('pointerdown',e=>{if(game.engine==='merge'&&started){swipe={x:e.clientX,y:e.clientY};board.setPointerCapture(e.pointerId);}});
  board.addEventListener('pointerup',e=>{if(!swipe)return;const x=e.clientX-swipe.x,y=e.clientY-swipe.y;swipe=null;if(Math.max(Math.abs(x),Math.abs(y))>20)slide(Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up');});
  board.addEventListener('pointercancel',()=>{swipe=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelCPU();else scheduleCPU();});
  window.addEventListener('pagehide',cancelCPU);window.addEventListener('pageshow',scheduleCPU);
  render();
}
