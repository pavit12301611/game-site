import { SHAPES, ghostY } from './blocks.js';
import { HEX_COLORS, HEX_SIZE } from './flood.js';
import { PAD, TERRAIN } from './lander.js';
const BLOCK_COLORS=['#91dfeb','#9eaeea','#f0b78b','#edda92','#94d4b3','#c5a6e8','#eea6ba'];
export function drawChallenge(c,kind,s,width,height){
 const bg=c.createLinearGradient(0,0,width,height);bg.addColorStop(0,'#102235');bg.addColorStop(1,'#080f1d');
 function rect(x,y,w,h,color,r=0){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
 function text(value,x,y,size,color='#bfd1e5',align='left'){c.font=`600 ${size}px Inter, sans-serif`;c.textAlign=align;c.fillStyle=color;c.fillText(String(value),x,y);}
 rect(0,0,width,height,bg);
 function tile(x,y,size,color){rect(x,y+3,size-2,size-2,'#050e19',4);rect(x,y,size-2,size-2,color,4);rect(x+3,y+2,size-8,3,'#ffffff55',2);}
 if(kind==='blocks'){
  const size=26,ox=35,oy=25;rect(ox-7,oy-7,274,534,'#365168',12);rect(ox-3,oy-3,266,526,'#091423',9);
  for(let y=0;y<20;y++)for(let x=0;x<10;x++)rect(ox+x*size,oy+y*size,size-1,size-1,'#16283b',2);
  s.board.forEach((row,y)=>row.forEach((v,x)=>{if(v)tile(ox+x*size,oy+y*size,size,BLOCK_COLORS[v-1]);}));
  const p=s.active;const ghost=ghostY(s);
  p.cells.forEach((row,dy)=>row.forEach((v,dx)=>{if(v&&ghost+dy>=0){c.strokeStyle='#bbdddf77';c.lineWidth=1;c.strokeRect(ox+(p.x+dx)*size+2,oy+(ghost+dy)*size+2,size-6,size-6);}}));
  p.cells.forEach((row,dy)=>row.forEach((v,dx)=>{if(v&&p.y+dy>=0)tile(ox+(p.x+dx)*size,oy+(p.y+dy)*size,size,BLOCK_COLORS[p.type]);}));
  text('NEXT',331,42,13);s.queue.slice(0,3).forEach((type,i)=>{rect(324,57+i*100,126,83,'#172b40',9);SHAPES[type].forEach((row,y)=>row.forEach((v,x)=>{if(v)tile(340+x*22,75+i*100+y*22,22,BLOCK_COLORS[type]);}));});
  text('MISSION',331,401,11);text('20 LINES',331,431,18,'#ace8ce');text('Ghost = landing',331,481,10);text('Space = drop',331,503,10);text(`${Math.max(0,20-s.lines)} lines remaining`,35,578,14);
 }else if(kind==='sokoban'){
  const size=Math.min(480/s.width,400/s.height),ox=(800-s.width*size)/2,oy=(500-s.height*size)/2;
  rect(ox-10,oy-10,s.width*size+20,s.height*size+26,'#0a1725',16);
  for(let i=0;i<s.width*s.height;i++){
   const x=ox+(i%s.width)*size,y=oy+Math.floor(i/s.width)*size;
   rect(x,y,size-2,size-2,'#203c45',4);rect(x+3,y+3,size-8,1,'#aacddd11');
   if(s.walls.includes(i)){rect(x,y+4,size-2,size-2,'#10242e',5);rect(x,y,size-2,size-5,'#466f72',5);rect(x+3,y+2,size-8,4,'#a6c6ab66',2);}
   else if(s.goals.includes(i)){c.beginPath();c.arc(x+size/2,y+size/2,size*.3,0,Math.PI*2);c.strokeStyle='#a0f6cc';c.lineWidth=3;c.stroke();c.fillStyle='#a0f6cc22';c.fill();}
  }
  s.boxes.forEach(i=>{const x=ox+(i%s.width)*size+5,y=oy+Math.floor(i/s.width)*size+5,w=size-12;rect(x,y+4,w,w,'#102327',5);rect(x,y,w,w,s.goals.includes(i)?'#85c6a2':'#c9a078',5);rect(x+4,y+4,w-8,w-8,s.goals.includes(i)?'#3e7e65':'#856446',3);c.strokeStyle=s.goals.includes(i)?'#baedd0':'#e9c393';c.lineWidth=4;c.beginPath();c.moveTo(x+7,y+7);c.lineTo(x+w-7,y+w-7);c.moveTo(x+w-7,y+7);c.lineTo(x+7,y+w-7);c.stroke();});
  const px=ox+(s.player%s.width)*size+size*.22,py=oy+Math.floor(s.player/s.width)*size+size*.2,w=size*.56;
  rect(px,py+5,w,w,'#0b2031',10);rect(px,py,w,w,'#f2a4a0',10);rect(px+4,py+5,w-8,w*.48,'#344458',6);rect(px+8,py+10,4,5,'#b0ffe2',1);rect(px+w-12,py+10,4,5,'#b0ffe2',1);
 }else if(kind==='flood'){
  const r=24,dx=Math.sqrt(3)*r,ox=202,oy=67;
  s.board.forEach((v,i)=>{const row=Math.floor(i/HEX_SIZE),x=ox+(i%HEX_SIZE+row%2*.5)*dx,y=oy+row*r*1.5;
   c.beginPath();for(let k=0;k<6;k++){const a=(k*60-30)*Math.PI/180;const px=x+Math.cos(a)*(r-1.7),py=y+Math.sin(a)*(r-1.7);if(k)c.lineTo(px,py);else c.moveTo(px,py);}c.closePath();c.fillStyle=HEX_COLORS[v];c.fill();c.strokeStyle=s.owned.includes(i)?'#f0ffeb':'#11263a';c.lineWidth=s.owned.includes(i)?2:1;c.stroke();text(v+1,x,y+5,12,'#153442','center');
  });text('START',141,72,12,'#c5f4de');text('→',166,72,19,'#c5f4de');text('Outlined hexes are your territory',400,438,14,'#becde2','center');
 }else{
  for(let i=0;i<85;i++){const x=(i*139.3)%800,y=(i*61.7)%365;rect(x,y,i%3?1:2,i%3?1:2,'#d0e4f78a');}
  c.beginPath();c.arc(715,95,38,0,Math.PI*2);c.fillStyle='#86aec733';c.fill();
  c.beginPath();c.moveTo(0,500);TERRAIN.forEach(([x,y])=>c.lineTo(x,y));c.lineTo(800,500);c.closePath();c.fillStyle='#34384f';c.fill();c.strokeStyle='#8494ac';c.lineWidth=3;c.stroke();
  c.beginPath();c.moveTo(0,487);c.lineTo(98,448);c.lineTo(210,496);c.lineTo(390,461);c.lineTo(470,491);c.lineTo(760,447);c.strokeStyle='#5b647d55';c.lineWidth=2;c.stroke();
  rect(PAD.left,PAD.y-3,PAD.right-PAD.left,7,'#a1f2c4',2);for(let x=PAD.left+4;x<PAD.right;x+=17)rect(x,PAD.y+6,8,3,'#ecce94',1);text('LANDING ZONE',610,462,10,'#c8edce','center');
  c.save();c.translate(s.x,s.y);c.rotate(s.angle);if(s.burning){c.beginPath();c.moveTo(-6,8);c.lineTo(0,25+(Math.floor(s.time*12)%3)*4);c.lineTo(6,8);c.fillStyle='#ffd09b';c.fill();}
  c.beginPath();c.moveTo(-10,5);c.lineTo(-15,16);c.lineTo(-22,16);c.moveTo(10,5);c.lineTo(15,16);c.lineTo(22,16);c.strokeStyle='#dbd6b9';c.lineWidth=3;c.stroke();
  rect(-12,-12,24,24,s.phase==='lost'?'#af7780':'#cbe5d9',5);rect(-8,-9,16,10,'#477184',3);rect(-7,10,14,4,'#687d81',2);c.restore();
  text('SAFE TOUCHDOWN',25,30,11);text('↓ ≤ 28  •  → ≤ 15  •  tilt ≤ 9°',25,50,11,'#9db6cb');
 }
}
