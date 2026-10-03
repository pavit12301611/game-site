import test from 'node:test';
import assert from 'node:assert/strict';
import { createMerge, collapse, moveMerge, canMove } from '../src/tabletop/merge.js';
import { createMines, revealMine, flagMine, neighbours } from '../src/tabletop/mines.js';
import { createReversi, captures, legalMoves, playReversi, chooseReversiMove, countDiscs } from '../src/tabletop/reversi.js';
import { COURSES, createGolf, hitGolf, stepGolf, nextHole, resetGolfBall, golfMoving } from '../src/tabletop/golf.js';

const random = () => .01;
test('2048 starts with exactly two tiles and merges each source tile once', () => {
  const s=createMerge(random);assert.equal(s.board.filter(Boolean).length,2);
  assert.deepEqual(collapse([2,2,2,2]),{result:[4,4,0,0],score:8});
  assert.deepEqual(collapse([2,2,4,0]),{result:[4,4,0,0],score:4});
  assert.deepEqual(collapse([4,0,4,4]),{result:[8,4,0,0],score:8});
});
test('2048 moves in all four directions and does not spawn on a no-op', () => {
  for(const direction of ['left','right','up','down']) {
    const s=createMerge(random);s.board=Array(16).fill(0);s.board[5]=s.board[6]=2;
    assert.equal(moveMerge(s,direction,random),true);assert.equal(s.moves,1);
  }
  const s=createMerge(random);s.board=Array(16).fill(0);s.board[0]=2;const old=[...s.board];
  assert.equal(moveMerge(s,'left',random),false);assert.deepEqual(s.board,old);assert.equal(s.moves,0);
});
test('2048 wins at the target and detects a full board without legal merges', () => {
  const s=createMerge(random);s.board=Array(16).fill(0);s.board[0]=s.board[1]=1024;moveMerge(s,'left',random);assert.equal(s.phase,'won');assert.equal(s.score,2048);
  const blocked=[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];assert.equal(canMove(blocked),false);
  const lost=createMerge(random);lost.board=blocked;moveMerge(lost,'up',random);assert.equal(lost.phase,'lost');
});
test('Minesweeper first reveal protects itself and all adjacent cells with exactly ten mines', () => {
  for(const first of [0,8,40,72,80]) {
    const s=createMines();revealMine(s,first,random);assert.equal(s.mines.filter(Boolean).length,10);
    for(const safe of [first,...neighbours(first)])assert.equal(s.mines[safe],false);
    assert.equal(s.revealed[first],true);assert.notEqual(s.phase,'lost');
  }
});
test('Minesweeper validates flags, protects flagged cells and limits flags to ten', () => {
  const s=createMines();assert.equal(flagMine(s,-1),false);assert.equal(revealMine(s,81),false);
  for(let i=0;i<10;i++)assert.equal(flagMine(s,i),true);
  assert.equal(flagMine(s,10),false);assert.equal(revealMine(s,0),false);assert.equal(s.planted,false);
  flagMine(s,0);revealMine(s,0,random);assert.equal(flagMine(s,0),false);
});
test('Minesweeper clue counts match neighbourhoods, and revealing all safe squares wins', () => {
  const s=createMines();revealMine(s,40,random);
  for(let i=0;i<81;i++){assert.equal(s.counts[i],neighbours(i).filter(n=>s.mines[n]).length);if(!s.mines[i])revealMine(s,i,random);}
  assert.equal(s.phase,'won');assert.equal(s.revealed.filter(Boolean).length,71);
});
test('Minesweeper a mine hit ends the game without allowing additional moves', () => {
  const s=createMines();revealMine(s,40,()=>.73);const mine=s.mines.findIndex(Boolean);revealMine(s,mine);assert.equal(s.phase,'lost');assert.equal(s.exploded,mine);
  assert.equal(flagMine(s,80),false);assert.equal(revealMine(s,80),false);
});
test('Reversi initial legal moves and capture rules are standard', () => {
  const s=createReversi();assert.deepEqual(countDiscs(s.board),[2,2]);assert.deepEqual(legalMoves(s.board,1),[19,26,37,44]);
  assert.equal(playReversi(s,0),false);assert.deepEqual(captures(s.board,19,1),[27]);
  assert.equal(playReversi(s,19),true);assert.deepEqual(countDiscs(s.board),[4,1]);assert.equal(s.turn,2);
});
test('Reversi scans all directions without wrapping rows', () => {
  const board=Array(64).fill(0);board[7]=1;board[8]=2;assert.deepEqual(captures(board,9,1),[]);
  const center=27;for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1]]){board[center+dy*8+dx]=2;board[center+dy*16+dx*2]=1;}
  assert.equal(captures(board,center,1).length,6);
});
test('Reversi CPU only makes legal moves and plays a complete game to a consistent result', () => {
  const s=createReversi();let guard=0;
  while(s.phase==='playing'&&guard++<64){const move=chooseReversiMove(s);assert.ok(legalMoves(s.board,s.turn).includes(move));assert.equal(playReversi(s,move),true);}
  assert.equal(s.phase,'finished');const [black,white]=countDiscs(s.board);assert.equal(s.winner,black===white?0:black>white?1:2);
  assert.equal(playReversi(s,0),false);
});
test('Reversi passes a player with no legal move instead of hanging', () => {
  // Search deterministic legal trajectories until a forced pass occurs.
  let passed=false;
  for(let seed=1;seed<=20&&!passed;seed++){
    const s=createReversi();let n=seed;
    while(s.phase==='playing'){
      const moves=legalMoves(s.board,s.turn);n=(Math.imul(n,1664525)+1013904223)>>>0;
      const player=s.turn;playReversi(s,moves[n%moves.length]);
      if(s.passed){assert.equal(s.passed,3-player);assert.equal(s.turn,player);assert.ok(legalMoves(s.board,player).length);assert.equal(legalMoves(s.board,3-player).length,0);passed=true;break;}
    }
  }
  assert.equal(passed,true);
});
function settle(s){for(let i=0;i<1200&&golfMoving(s)&&s.phase==='playing';i++)stepGolf(s,1/60);}
function aimAt(s,x,y){const distance=Math.hypot(x-s.x,y-s.y);assert.equal(hitGolf(s,Math.atan2(y-s.y,x-s.x),(distance*.9+5)/640),true);settle(s);}
test('Golf only allows one shot while moving, has friction, and counts reset penalties', () => {
  const s=createGolf();assert.equal(hitGolf(s,0,.3),true);assert.equal(hitGolf(s,0,.3),false);settle(s);assert.equal(golfMoving(s),false);assert.ok(s.x>100);assert.equal(s.strokes,1);
  resetGolfBall(s);assert.equal(s.x,100);assert.equal(s.total,2);
  assert.equal(hitGolf(s,NaN,.5),false);
});
test('Golf walls reflect the ball and high-speed steps do not tunnel through bumpers', () => {
  const s=createGolf();s.x=300;s.y=250;hitGolf(s,0,1);
  for(let i=0;i<4;i++)stepGolf(s,.05);
  assert.ok(s.collisions>0);assert.ok(s.vx<0);assert.ok(s.x<322);
});
test('Golf completes all three courses through legal continuous shots, without teleportation', () => {
  const s=createGolf();
  aimAt(s,100,100);aimAt(s,650,110);assert.equal(s.phase,'holed');assert.equal(s.results[0],2);nextHole(s);
  aimAt(s,380,350);aimAt(s,380,110);aimAt(s,680,95);assert.equal(s.phase,'holed');assert.equal(s.results[1],3);nextHole(s);
  aimAt(s,95,350);aimAt(s,680,350);assert.equal(s.phase,'holed');nextHole(s);assert.equal(s.phase,'finished');assert.equal(s.total,7);assert.equal(s.results.length,COURSES.length);
  assert.equal(hitGolf(s,0,1),false);assert.equal(nextHole(s),false);
});
