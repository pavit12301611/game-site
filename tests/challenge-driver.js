/** Deterministic test drivers use public engine actions, never injected winning states. */
import { loadWarehouse, moveCrate } from '../src/challenges/sokoban.js';
import { floodColor } from '../src/challenges/flood.js';
import { PAD } from '../src/challenges/lander.js';
export function solveWarehouse(level) {
 const start=loadWarehouse(level),queue=[{state:start,parent:-1,direction:''}],seen=new Set();let head=0;
 const key=s=>`${s.player}:${[...s.boxes].sort((a,b)=>a-b).join(',')}`;seen.add(key(start));
 while(head<queue.length&&head<250000){const index=head++,node=queue[index];
  if(node.state.phase==='won'){const route=[];let current=index;while(queue[current].parent!==-1){route.push(queue[current].direction);current=queue[current].parent;}return route.reverse();}
  for(const direction of ['up','right','down','left']){const next={...node.state,boxes:[...node.state.boxes],history:[]};if(!moveCrate(next,direction))continue;const id=key(next);if(seen.has(id))continue;seen.add(id);next.history=[];queue.push({state:next,parent:index,direction});}
 }
 throw Error(`Warehouse ${level} has no solution within the search budget (${head} states).`);
}
export function bestFloodColor(s){let choice=-1,growth=-1;for(let color=0;color<6;color++){if(color===s.board[0])continue;const copy={...s,board:[...s.board],owned:[...s.owned]};floodColor(copy,color);if(copy.owned.length>growth){growth=copy.owned.length;choice=color;}}return choice;}
export function landingInputs(s){
 const target=(PAD.left+PAD.right)/2,alt=PAD.y-16-s.y;
 const desiredVx=Math.max(-22,Math.min(22,(target-s.x)*.23));
 const ax=Math.max(-18,Math.min(18,(desiredVx-s.vx)*1.1));
 const desiredVy=Math.max(8,Math.min(22,alt*.28));
 const desiredAngle=Math.max(-.7,Math.min(.7,Math.atan2(ax,32)));
 return {left:s.angle>desiredAngle+.016,right:s.angle<desiredAngle-.016,thrust:s.vy>desiredVy-1};
}
