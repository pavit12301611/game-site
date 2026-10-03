/** Browser interactions and screenshots for the four distinct tabletop games. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base=process.env.ARCADE_URL||'http://localhost:5174';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
try{
  await mkdir('.arena/tabletop',{recursive:true});const errors=[];
  for(const mobile of [false,true]){
    const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{let seed=12345;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
    for(const id of ['merge-2048','minefield','reversi','pocket-golf']){
      console.log(mobile?'Mobile':'Desktop',id);
      await page.goto(`${base}/collection.html?game=${id}`);
      await page.locator('#table-start').waitFor();
      await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.decode()));});
      await page.screenshot({path:`.arena/tabletop/${id}-${mobile?'mobile':'desktop'}-intro.png`,fullPage:true});
      await page.locator('#table-start').click();
      if(id==='merge-2048'){
        assert.equal(await page.locator('.merge-tile').count(),16);
        if(mobile){
          const board=await page.locator('.merge-grid').boundingBox();const cdp=await page.context().newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:board.x+board.width*.8,y:board.y+board.height*.5}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:board.x+board.width*.2,y:board.y+board.height*.5}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        }else await page.keyboard.press('ArrowLeft');
        await page.waitForFunction(()=>Number(document.querySelectorAll('#table-hud b')[2].textContent)>0);
        for(const direction of ['up','right','down','left'])await page.locator(`[data-slide="${direction}"]`).click();
        assert.ok(Number(await page.locator('#table-hud b').first().textContent())>0);
      }else if(id==='minefield'){
        assert.equal(await page.locator('.mine-cell').count(),81);
        await page.locator('[data-cell="40"]').click();assert.ok(await page.locator('.mine-cell.open').count()>1);
        assert.equal(await page.locator('.exploded').count(),0);
        await page.locator('#flag-mode').click();await page.locator('.mine-cell:not(.open)').first().click();assert.equal(await page.locator('.flagged').count(),1);
        await page.locator('.flagged').click();assert.equal(await page.locator('.flagged').count(),0);await page.locator('#flag-mode').click();
      }else if(id==='reversi'){
        assert.equal(await page.locator('.reversi-disc').count(),4);await page.locator('[data-cell="19"]').click();
        await page.waitForFunction(()=>document.querySelectorAll('.reversi-disc').length===6);
        await page.locator('#reversi-mode').selectOption('local');assert.equal(await page.locator('.reversi-disc').count(),4);
        await page.locator('[data-cell="19"]').click();assert.match(await page.locator('#table-message').textContent(),/White to play/);
        await page.locator('.reversi-cell.legal:not(:disabled)').first().click();assert.match(await page.locator('#table-message').textContent(),/Black to play/);
      }else{
        if(mobile){
          const box=await page.locator('canvas').boundingBox();const cdp=await page.context().newCDPSession(page);
          const x=box.x+100/800*box.width,y=box.y+330/480*box.height;
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+80,y:y-30}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForFunction(()=>document.querySelector('#golf-strokes').textContent==='1');
          await page.locator('#table-restart').click();
        }
        await page.locator('#golf-angle').fill('-90');await page.locator('#golf-power').fill('33');
        await page.locator('#golf-hit').click();await page.waitForFunction(()=>document.querySelector('#golf-strokes').textContent==='1');
        await page.locator('#golf-pause').click();
        await page.waitForFunction(()=>document.querySelector('#golf-pause').textContent==='Resume');
        await page.waitForTimeout(80);const image=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(200);assert.equal(await page.locator('canvas').evaluate(c=>c.toDataURL()),image);
        await page.locator('#golf-pause').click();
        await page.waitForFunction(()=>!document.querySelector('#golf-hit').disabled,null,{timeout:12000});
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`${id} fits mobile width`);
      await page.screenshot({path:`.arena/tabletop/${id}-${mobile?'mobile':'desktop'}-play.png`,fullPage:true,animations:'disabled'});
      await page.locator('#table-restart').click();
      if(id==='reversi'){
        await page.waitForTimeout(600);assert.equal(await page.locator('.reversi-disc').count(),4,'no stale CPU move after restart');
      }else if(id==='pocket-golf')await page.waitForFunction(()=>document.querySelector('#golf-score').textContent==='0');
      else if(id==='minefield')assert.equal(await page.locator('.mine-cell.open').count(),0);
      else assert.equal(await page.locator('#table-hud b').first().textContent(),'0');
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: all four games rendered on desktop/mobile, 2048 keyboard/swipe and scoring, safe mine reveal and flag/unflag, CPU response and local Reversi turns, golf controls/motion/pause, restarts, no horizontal overflow or page errors.');
}finally{await browser.close();}
