/** Real browser completion checks via legal UI inputs, not injected wins/state. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base=process.env.ARCADE_URL||'http://localhost:5174';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1360,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('.arena/tabletop',{recursive:true});
 await page.goto(`${base}/collection.html?game=reversi`);await page.locator('#table-start').click();await page.locator('#reversi-mode').selectOption('local');
 let moves=0;while(await page.locator('.reversi-cell.legal:not(:disabled)').count()&&moves++<64)await page.locator('.reversi-cell.legal:not(:disabled)').first().click();
 assert.match(await page.locator('#table-message').textContent(),/wins|draw/i);assert.ok(moves>=4&&moves<=60);await page.screenshot({path:'.arena/tabletop/reversi-complete.png',fullPage:true,animations:'disabled'});
 console.log('PASS: Reversi browser match finished through',moves,'legal moves.');
 await page.goto(`${base}/collection.html?game=minefield`);await page.locator('#table-start').click();await page.locator('[data-cell="40"]').click();
 let reveals=0;while(await page.locator('.mine-cell:not(.open):not(:disabled)').count()&&reveals++<81)await page.locator('.mine-cell:not(.open):not(:disabled)').first().click();
 assert.match(await page.locator('#table-message').textContent(),/Mine hit|cleared/);await page.locator('#table-restart').click();assert.equal(await page.locator('.mine-cell.open').count(),0);
 console.log('PASS: Minesweeper terminal feedback and new-game reset.');
 await page.goto(`${base}/collection.html?game=pocket-golf`);await page.locator('#table-start').click();
 const holes=[[[-90,33],[1,78]],[[0,39],[-91,35],[-2,43]],[[90,37],[0,83]]];
 for(let hole=0;hole<holes.length;hole++){
  for(const [angle,power]of holes[hole]){
   await page.locator('#golf-angle').fill(String(angle));await page.locator('#golf-power').fill(String(power));await page.locator('#golf-hit').click();
   // Wait for a complete stroke, whether it settles on the green or drops in the cup.
   await page.waitForFunction(()=>!document.querySelector('#golf-next').hidden||!document.querySelector('#golf-hit').disabled,null,{timeout:15000});
  }
  await page.locator('#golf-next').waitFor({state:'visible',timeout:5000});await page.locator('#golf-next').click();
  console.log('PASS: golf hole',hole+1,'through slider controls and simulated physics.');
 }
 await page.waitForFunction(()=>document.querySelector('#golf-finish').textContent.includes('COURSE COMPLETE'));
 assert.equal(await page.locator('#golf-score').textContent(),'7');await page.screenshot({path:'.arena/tabletop/golf-complete.png',fullPage:true});
 await page.locator('#table-restart').click();await page.waitForFunction(()=>document.querySelector('#golf-score').textContent==='0');assert.equal(await page.locator('#golf-finish').textContent(),'');
 assert.deepEqual(errors,[]);console.log('PASS: all three golf holes, final scorecard, restart, no runtime errors.');
}finally{await browser.close();}
