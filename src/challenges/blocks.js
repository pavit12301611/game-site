/** Seven-bag falling-block game. Basic wall kicks, ghost piece, 20-line win target. */
export const SHAPES = [
 [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
 [[1,0,0],[1,1,1],[0,0,0]], [[0,0,1],[1,1,1],[0,0,0]],
 [[1,1],[1,1]], [[0,1,1],[1,1,0],[0,0,0]],
 [[0,1,0],[1,1,1],[0,0,0]], [[1,1,0],[0,1,1],[0,0,0]],
];
export function fillBag(state, random = Math.random) {
 const bag=SHAPES.map((_,i)=>i);
 for(let i=bag.length-1;i>0;i--){const j=Math.min(i,Math.floor(random()*(i+1)));[bag[i],bag[j]]=[bag[j],bag[i]];}
 state.queue.push(...bag);
}
export function fits(state, cells, x, y) {
 return cells.every((row,dy)=>row.every((v,dx)=>!v || (x+dx>=0&&x+dx<10&&y+dy<20&&(y+dy<0||!state.board[y+dy][x+dx]))));
}
export function spawn(state,random=Math.random){
 if(state.queue.length<7)fillBag(state,random);
 const type=state.queue.shift();state.active={type,cells:SHAPES[type].map(row=>[...row]),x:3,y:-1};state.clock=0;
 if(!fits(state,state.active.cells,state.active.x,state.active.y))state.phase='lost';
}
export function createBlocks(random=Math.random){
 const s={board:Array.from({length:20},()=>Array(10).fill(0)),queue:[],active:/** @type {any} */(null),score:0,lines:0,level:1,clock:0,phase:'playing',lastClear:0};spawn(s,random);return s;
}
export function shiftBlock(s,dx){if(s.phase!=='playing')return false;const p=s.active;if(!fits(s,p.cells,p.x+dx,p.y))return false;p.x+=dx;return true;}
export function rotateBlock(s){
 if(s.phase!=='playing')return false;const p=s.active,n=p.cells.length;
 const cells=Array.from({length:n},(_,y)=>Array.from({length:n},(_,x)=>p.cells[n-1-x][y]));
 for(const [dx,dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]])if(fits(s,cells,p.x+dx,p.y+dy)){p.cells=cells;p.x+=dx;p.y+=dy;return true;}
 return false;
}
export function lockBlock(s,random=Math.random){
 if(s.phase!=='playing')return;
 const p=s.active;let topped=false;
 p.cells.forEach((row,dy)=>row.forEach((v,dx)=>{if(!v)return;if(p.y+dy<0)topped=true;else s.board[p.y+dy][p.x+dx]=p.type+1;}));
 if(topped){s.phase='lost';return;}
 const kept=s.board.filter(row=>row.some(v=>!v));const cleared=20-kept.length;
 while(kept.length<20)kept.unshift(Array(10).fill(0));s.board=kept;s.lastClear=cleared;
 s.score+=[0,100,300,500,800][cleared]*s.level;s.lines+=cleared;s.level=1+Math.floor(s.lines/5);
 if(s.lines>=20)s.phase='won';else spawn(s,random);
}
export function descendBlock(s,random=Math.random){if(s.phase!=='playing')return false;const p=s.active;if(fits(s,p.cells,p.x,p.y+1)){p.y++;return true;}lockBlock(s,random);return false;}
export function ghostY(s){let y=s.active.y;while(fits(s,s.active.cells,s.active.x,y+1))y++;return y;}
export function hardDrop(s,random=Math.random){if(s.phase!=='playing')return;const y=ghostY(s);s.score+=(y-s.active.y)*2;s.active.y=y;lockBlock(s,random);}
export function stepBlocks(s,dt,random=Math.random){if(s.phase!=='playing')return;s.clock+=Math.min(Math.max(dt,0),.1);const interval=Math.max(.12,.8-(s.level-1)*.12);if(s.clock>=interval){s.clock-=interval;descendBlock(s,random);}}
