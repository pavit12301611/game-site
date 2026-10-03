import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlocks, fillBag, fits, shiftBlock, rotateBlock, hardDrop, lockBlock, descendBlock, stepBlocks, ghostY } from '../src/challenges/blocks.js';
import { loadWarehouse, moveCrate, undoCrate, WAREHOUSES } from '../src/challenges/sokoban.js';
import { createFlood, floodColor, territory, hexNeighbours } from '../src/challenges/flood.js';
import { createLander, stepLander, groundAt } from '../src/challenges/lander.js';
import { solveWarehouse, landingInputs, bestFloodColor } from './challenge-driver.js';
const random=()=>.31;
test('Blocks seven-bag has each type once and a fresh board fits its active piece',()=>{
 const s=createBlocks(random);assert.equal(s.board.length,20);assert.equal(s.board[0].length,10);assert.equal(fits(s,s.active.cells,s.active.x,s.active.y),true);
 const bag={queue:[]};fillBag(bag,random);assert.equal(new Set(bag.queue).size,7);assert.equal(bag.queue.length,7);
});
test('Blocks movement is bounded, rotation is legal and the ghost matches a hard drop',()=>{
 const s=createBlocks(random);for(let i=0;i<20;i++)shiftBlock(s,-1);assert.equal(shiftBlock(s,-1),false);assert.equal(rotateBlock(s),true);assert.equal(fits(s,s.active.cells,s.active.x,s.active.y),true);
 const y=ghostY(s);assert.ok(y>=16);hardDrop(s,random);assert.ok(s.board.flat().some(Boolean));assert.ok(s.score>0);
});
test('Blocks line clear scores once, removes the row and advances level',()=>{
 const s=createBlocks();s.lines=4;s.board[19]=[1,1,1,1,1,1,0,0,0,0];s.active={type:0,cells:[[1,1,1,1]],x:6,y:19};lockBlock(s,random);
 assert.equal(s.lines,5);assert.equal(s.level,2);assert.equal(s.score,100);assert.equal(s.board.flat().filter(Boolean).length,0);
});
test('Blocks four-row clear, target win and top-out are terminal',()=>{
 const s=createBlocks();for(let y=16;y<20;y++)s.board[y]=[1,1,1,1,0,1,1,1,1,1];s.active={type:0,cells:[[1],[1],[1],[1]],x:4,y:16};s.lines=16;lockBlock(s);
 assert.equal(s.phase,'won');assert.equal(s.lines,20);assert.equal(s.score,800);const saved=JSON.stringify(s);hardDrop(s);assert.equal(JSON.stringify(s),saved);
 const lost=createBlocks();lost.active={type:0,cells:[[1],[1]],x:0,y:-1};lost.board[1][0]=2;descendBlock(lost);assert.equal(lost.phase,'lost');
});
test('Blocks frame stepping applies gravity and clamps oversized deltas',()=>{
 const s=createBlocks();const y=s.active.y;stepBlocks(s,10);assert.equal(s.clock,.1);assert.equal(s.active.y,y);for(let i=0;i<10;i++)stepBlocks(s,.1);assert.ok(s.active.y>y);
});
test('Sokoban all handcrafted rooms solve using legal movement and pushes',()=>{
 for(let level=0;level<WAREHOUSES.length;level++){
  const s=loadWarehouse(level);const route=solveWarehouse(level);assert.ok(route.length>0);
  for(const direction of route)assert.equal(moveCrate(s,direction),true);
  assert.equal(s.phase,'won');assert.equal(s.boxes.length,s.goals.length);assert.ok(s.pushes>0);
  assert.equal(undoCrate(s),true);assert.equal(s.phase,'playing');assert.equal(moveCrate(s,route.at(-1)),true);assert.equal(s.phase,'won');
 }
});
test('Sokoban walls and double-box pushes are illegal, undo exactly restores state',()=>{
 const s=loadWarehouse();s.player=9;assert.equal(moveCrate(s,'left'),false);assert.equal(moveCrate(s,'up'),false);
 const fresh=loadWarehouse();const before=JSON.stringify({player:fresh.player,boxes:fresh.boxes,moves:fresh.moves,pushes:fresh.pushes});moveCrate(fresh,'right');undoCrate(fresh);assert.equal(JSON.stringify({player:fresh.player,boxes:fresh.boxes,moves:fresh.moves,pushes:fresh.pushes}),before);
 const blocked=loadWarehouse();blocked.boxes=[27,19];blocked.player=35;assert.equal(moveCrate(blocked,'up'),false);
});
test('Hex adjacency is symmetric, offset-row aware and bounded',()=>{
 for(let i=0;i<81;i++){const neighbours=hexNeighbours(i);assert.ok(neighbours.length<=6);assert.equal(new Set(neighbours).size,neighbours.length);for(const n of neighbours){assert.ok(n>=0&&n<81);assert.ok(hexNeighbours(n).includes(i));}}
 assert.ok(hexNeighbours(9).includes(1));assert.ok(!hexNeighbours(0).includes(10));
});
test('Flood expands only the connected origin territory and ignores the current colour',()=>{
 const s=createFlood(()=>0);assert.equal(s.phase,'playing');const owned=s.owned.length;assert.equal(owned,80);assert.equal(floodColor(s,0),false);assert.equal(s.moves,0);
 floodColor(s,1);assert.equal(s.phase,'won');assert.equal(s.owned.length,81);assert.equal(s.moves,1);
 assert.equal(territory([0,...Array(80).fill(1)]).length,1);
});
test('Flood thirty unsuccessful moves lose; generated sample boards are solvable',()=>{
 const s=createFlood(()=>0);s.moves=29;floodColor(s,2);assert.equal(s.phase,'lost');assert.equal(floodColor(s,1),false);
 for(let seed=1;seed<=50;seed++){let n=seed;const rand=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};const board=createFlood(rand);while(board.phase==='playing')floodColor(board,bestFloodColor(board));assert.equal(board.phase,'won',`seed ${seed}`);}
});
test('Lander gravity, thrust, rotation and fuel change physical state',()=>{
 const s=createLander();stepLander(s,{},.04);assert.ok(s.vy>0);const before=s.vy;stepLander(s,{right:true,thrust:true},.04);assert.ok(s.angle>0);assert.ok(s.vx>0);assert.ok(s.vy<before);assert.ok(s.fuel<100);
 s.fuel=0;stepLander(s,{thrust:true},.04);assert.equal(s.burning,false);assert.equal(s.fuel,0);
});
test('Lander rejects hard/tilted touchdowns and landing outside the pad',()=>{
 for(const overrides of [{x:610,y:413,vy:80},{x:610,y:414,vy:10,angle:.4},{x:400,y:440,vy:10}]){
  const s=Object.assign(createLander(),overrides);stepLander(s,{},.04);assert.equal(s.phase,'lost');
 }
 assert.equal(groundAt(600),430);
});
test('Lander legal feedback controls complete the mission without state teleportation',()=>{
 const s=createLander();for(let i=0;i<60*90&&s.phase==='playing';i++)stepLander(s,landingInputs(s),1/60);
 assert.equal(s.phase,'won');assert.ok(s.fuel>0);assert.ok(s.time>10);assert.ok(Math.abs(s.vx)<=15);assert.ok(s.vy<=28);assert.ok(Math.abs(s.angle)<=.16);
 const saved=JSON.stringify(s);stepLander(s,{thrust:true},.03);assert.equal(JSON.stringify(s),saved);
});
