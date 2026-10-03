/** Offset-row hex topology. Flooded territory always starts at the top-left hex. */
export const HEX_SIZE=9, FLOOD_LIMIT=30;
export const HEX_COLORS=['#93dfc7','#f2b28e','#aaa8ed','#e89cc2','#91c9e9','#e4cf81'];
export function hexNeighbours(i){
 const x=i%HEX_SIZE,y=Math.floor(i/HEX_SIZE),offset=y%2?1:-1;
 return [[x-1,y],[x+1,y],[x,y-1],[x+offset,y-1],[x,y+1],[x+offset,y+1]].filter(([nx,ny])=>nx>=0&&nx<HEX_SIZE&&ny>=0&&ny<HEX_SIZE).map(([nx,ny])=>ny*HEX_SIZE+nx);
}
export function territory(board){
 const found=new Set([0]),queue=[0],color=board[0];
 while(queue.length)for(const n of hexNeighbours(queue.pop()))if(!found.has(n)&&board[n]===color){found.add(n);queue.push(n);}
 return [...found];
}
export function createFlood(random=Math.random){const board=Array.from({length:81},()=>Math.min(5,Math.floor(random()*6)));if(board.every(v=>v===board[0]))board[80]=(board[0]+1)%6;return {board,moves:0,phase:'playing',owned:territory(board)};}
export function floodColor(s,color){
 if(s.phase!=='playing'||!Number.isInteger(color)||color<0||color>5||color===s.board[0])return false;
 for(const i of s.owned)s.board[i]=color;s.owned=territory(s.board);s.moves++;
 if(s.owned.length===81)s.phase='won';else if(s.moves>=FLOOD_LIMIT)s.phase='lost';return true;
}
