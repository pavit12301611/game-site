/** Legal UI play; reads Flood pixels and Lander's visible instruments, not hidden state. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { solveWarehouse, bestFloodColor, landingInputs } from '../tests/challenge-driver.js';
import { HEX_COLORS, territory, floodColor } from '../src/challenges/flood.js';
const base=process.env.ARCADE_URL||'http://localhost:5174';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
try{
 await mkdir('.arena/challenges',{recursive:true});const errors=[];
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});page.on('pageerror',e=>errors.push(e.message));
  for(const id of ['falling-blocks','crate-shift','orbit-lander','hex-flood']){
   console.log(mobile?'Mobile':'Desktop',id);await page.goto(`${base}/challenge.html?game=${id}`);await page.locator('#mission-start').waitFor();
   await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.decode()));});
   await page.screenshot({path:`.arena/challenges/${id}-${mobile?'mobile':'desktop'}-intro.png`,fullPage:true});
   await page.locator('#mission-start').click();await page.waitForTimeout(100);
   if(id==='falling-blocks'){
    await page.locator('[data-act="rotate"]').click();await page.locator('[data-act="left"]').click();await page.locator('[data-act="drop"]').click();assert.ok(Number(await page.locator('#mission-hud b').first().textContent())>0);
    await page.locator('#mission-pause').click();await page.waitForTimeout(60);const image=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(200);assert.equal(await page.locator('canvas').evaluate(c=>c.toDataURL()),image);await page.locator('#mission-continue').click();
    await page.screenshot({path:`.arena/challenges/${id}-${mobile?'mobile':'desktop'}-play.png`,fullPage:true});
    for(let i=0;i<30&&await page.locator('#mission-overlay').isHidden();i++)await page.locator('[data-act="drop"]').click();assert.match(await page.locator('#result-heading').textContent(),/One more/);await page.locator('#mission-continue').click();
   }else if(id==='crate-shift'){
    for(let room=0;room<4;room++){
     for(const direction of solveWarehouse(room))await page.locator(`[data-act="${direction}"]`).click();
     assert.match(await page.locator('#mission-status').textContent(),/solved/);
     if(room===0){await page.locator('[data-act="undo"]').click();assert.match(await page.locator('#mission-status').textContent(),/undone/);await page.locator('[data-act="up"]').click();}
     if(room<3)await page.locator('[data-act="next"]').click();
    }assert.match(await page.locator('#mission-status').textContent(),/All four rooms complete/);
   }else if(id==='hex-flood'){
    const colors=HEX_COLORS.map(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(','));
    const pixels=await page.locator('canvas').evaluate(c=>{const ctx=c.getContext('2d');return Array.from({length:81},(_,i)=>{const row=Math.floor(i/9),x=202+(i%9+row%2*.5)*Math.sqrt(3)*24,y=67+row*36;return [...ctx.getImageData(Math.round(x+8),Math.round(y+7),1,1).data].slice(0,3).join(',');});});
    const board=pixels.map(p=>colors.indexOf(p));assert.ok(board.every(v=>v>=0),'read numbered hex colours from the rendered board');const s={board,moves:0,owned:territory(board),phase:'playing'};
    while(s.phase==='playing'){const color=bestFloodColor(s);await page.locator(`[data-color="${color}"]`).click();floodColor(s,color);assert.equal(await page.locator('#mission-hud b').first().textContent(),`${s.owned.length} / 81`);}
    assert.equal(s.phase,'won');assert.match(await page.locator('#result-heading').textContent(),/Beautifully/);
   }else{
    await page.locator('#mission-pause').click();assert.equal(await page.locator('#mission-pause').textContent(),'Resume');await page.locator('#mission-continue').click();
    if(mobile){const box=await page.locator('[data-hold="thrust"]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();assert.ok(parseInt(await page.locator('#mission-hud b').nth(3).textContent())<100);}
    else{
     const held=new Set();const deadline=Date.now()+90000;
     while(await page.locator('#mission-overlay').isHidden()&&Date.now()<deadline){
      const s=await page.evaluate(()=>{const hud=[...document.querySelectorAll('#mission-hud b')].map(e=>parseFloat(e.textContent));return {x:Number(document.querySelector('#flight-x').textContent),y:414-hud[0],vx:hud[2],vy:hud[1],angle:Number(document.querySelector('#flight-tilt').textContent)*Math.PI/180};});
      const inputs=landingInputs(s);for(const [action,key] of [['left','ArrowLeft'],['right','ArrowRight'],['thrust','ArrowUp']]){if(inputs[action]&&!held.has(key)){await page.keyboard.down(key);held.add(key);}else if(!inputs[action]&&held.has(key)){await page.keyboard.up(key);held.delete(key);}}
      await page.waitForTimeout(20);
     }
     for(const key of held)await page.keyboard.up(key);assert.match(await page.locator('#result-copy').textContent(),/Safe touchdown/);
    }
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`${id} width`);
   await page.screenshot({path:`.arena/challenges/${id}-${mobile?'mobile':'desktop'}-play.png`,fullPage:true});
   await page.locator('#mission-restart').click();assert.equal(await page.locator('#mission-overlay').isHidden(),true);
  }await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: four covers/routes, desktop + emulated mobile controls, Blocks pause/loss/replay, four warehouse solutions/undo, Flood win, instrument-driven Lander safe landing, restart and width. No page errors.');
}finally{await browser.close();}
