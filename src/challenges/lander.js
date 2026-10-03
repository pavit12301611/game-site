/** Lunar lander: gravity, rotation, finite fuel, terrain contact and safe touchdown. */
export const PAD={left:550,right:670,y:430};
export const TERRAIN=[[0,445],[90,420],[170,460],[260,405],[350,445],[470,430],[550,430],[670,430],[740,390],[800,410]];
export function groundAt(x){for(let i=1;i<TERRAIN.length;i++){const a=TERRAIN[i-1],b=TERRAIN[i];if(x<=b[0])return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}return 410;}
export function createLander(){return {x:400,y:75,vx:0,vy:0,angle:0,fuel:100,time:0,phase:'playing',burning:false,reason:''};}
export function stepLander(s,input,delta){
 if(s.phase!=='playing')return;const dt=Math.min(.04,Math.max(0,delta));s.time+=dt;
 s.angle=Math.max(-1.2,Math.min(1.2,s.angle+(Number(Boolean(input.right))-Number(Boolean(input.left)))*1.3*dt));
 s.burning=Boolean(input.thrust&&s.fuel>0);
 if(s.burning){s.vx+=Math.sin(s.angle)*60*dt;s.vy-=Math.cos(s.angle)*60*dt;s.fuel=Math.max(0,s.fuel-8*dt);}
 s.vy+=20*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;
 if(s.x<12||s.x>788||s.y<15){s.phase='lost';s.reason='You left the flight corridor.';return;}
 if(s.y+16>=Math.min(groundAt(s.x-12),groundAt(s.x+12))){
  if(s.x>=PAD.left+15&&s.x<=PAD.right-15&&Math.abs(s.vx)<=15&&s.vy>=0&&s.vy<=28&&Math.abs(s.angle)<=.16){s.phase='won';s.y=PAD.y-16;s.reason='Safe touchdown.';}
  else{s.phase='lost';s.reason=s.x<PAD.left+15||s.x>PAD.right-15?'Missed the landing pad.':'Touchdown too fast or too tilted.';}
  s.burning=false;
 }
}
