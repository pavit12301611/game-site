/** Small handcrafted warehouse puzzles; undo restores pushes as well as walking. */
export const WAREHOUSES=[
 ['########','#      #','# . .  #','# $ $  #','#  @   #','#      #','########'],
 ['########','#   .  #','#   $  #','# #    #','# . $  #','#  @   #','########'],
 ['########','#  .   #','#  $   #','# .$.  #','#  $   #','#  @   #','#      #','########'],
 ['#########','#       #','# . . . #','# $ $ $ #','#   #   #','#   @   #','#       #','#########'],
];
export function loadWarehouse(level=0){
 const layout=WAREHOUSES[level],width=layout[0].length,walls=[],goals=[],boxes=[];let player=0;
 layout.forEach((row,y)=>[...row].forEach((v,x)=>{const i=y*width+x;if(v==='#')walls.push(i);if(v==='.')goals.push(i);if(v==='$')boxes.push(i);if(v==='@')player=i;}));
 return {width,height:layout.length,walls,goals,boxes,player,level,moves:0,pushes:0,history:[],phase:'playing'};
}
const directions={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
export function moveCrate(s,direction){
 if(s.phase!=='playing'||!directions[direction])return false;
 const [dx,dy]=directions[direction],x=s.player%s.width,y=Math.floor(s.player/s.width),nx=x+dx,ny=y+dy;
 if(nx<0||nx>=s.width||ny<0||ny>=s.height)return false;const target=ny*s.width+nx;if(s.walls.includes(target))return false;
 const box=s.boxes.indexOf(target),next=(ny+dy)*s.width+nx+dx;
 if(box>=0&&(nx+dx<0||nx+dx>=s.width||ny+dy<0||ny+dy>=s.height||s.walls.includes(next)||s.boxes.includes(next)))return false;
 s.history.push({player:s.player,boxes:[...s.boxes],moves:s.moves,pushes:s.pushes});
 if(box>=0){s.boxes[box]=next;s.pushes++;}s.player=target;s.moves++;
 if(s.boxes.every(i=>s.goals.includes(i)))s.phase='won';return true;
}
export function undoCrate(s){const last=s.history.pop();if(!last)return false;Object.assign(s,last);s.phase='playing';return true;}
