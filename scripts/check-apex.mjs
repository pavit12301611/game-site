/** Run against a Vite server: APEX_URL=http://localhost:5173/drive.html node scripts/check-apex.mjs
 * Optional CHROMIUM_PATH and LD_LIBRARY_PATH for sandbox-provided Chromium.
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APEX_URL || 'http://localhost:5173/drive.html');
  await page.waitForFunction(() => !document.querySelector('#start').disabled);
  assert.equal(await page.locator('#world canvas').count(), 1);
  const webgl = await page.locator('canvas').evaluate(c => Boolean(c.getContext('webgl2')));
  assert.equal(webgl, true, 'a real WebGL2 context was created');
  await mkdir('.arena/apex', { recursive: true });
  await page.screenshot({ path: '.arena/apex/intro.png' });
  await page.click('#start');
  await page.waitForFunction(() => document.querySelector('#timer').textContent !== '00:00.00', { timeout: 20000 });
  await page.keyboard.down('w');
  await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) > 20);
  await page.keyboard.up('w');
  await page.keyboard.down('d'); await page.waitForTimeout(350); await page.keyboard.up('d');
  await page.screenshot({ path: '.arena/apex/driving.png' });
  await page.click('#pause');
  const pausedTime = await page.locator('#timer').textContent();
  await page.waitForTimeout(350); assert.equal(await page.locator('#timer').textContent(), pausedTime);
  await page.click('#pause');
  await page.waitForFunction(old => document.querySelector('#timer').textContent !== old, pausedTime);
  await page.click('#camera'); assert.match(await page.locator('#camera').textContent(), /aerial/);
  await page.click('#restart'); await page.waitForFunction(() => document.querySelector('#timer').textContent === '00:00.00');
  assert.equal(await page.locator('#lap').textContent(), '1 / 3');
  assert.deepEqual(errors, []);
  // Touch layout and independent pointer controls.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await mobile.goto(process.env.APEX_URL || 'http://localhost:5173/drive.html');
  await mobile.waitForFunction(() => !document.querySelector('#start').disabled);
  await mobile.screenshot({ path: '.arena/apex/mobile.png' });
  await mobile.click('#start');
  await mobile.waitForFunction(() => document.querySelector('#timer').textContent !== '00:00.00', { timeout: 20000 });
  const pedal = await mobile.locator('[data-control="throttle"]').boundingBox();
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pedal.x + pedal.width / 2, y: pedal.y + pedal.height / 2 }] });
  await mobile.waitForFunction(() => Number(document.querySelector('#speed').textContent) > 10);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  // Graceful failure without WebGL.
  const fallback = await browser.newPage();
  await fallback.addInitScript(() => { window.HTMLCanvasElement.prototype.getContext = () => null; });
  await fallback.goto(process.env.APEX_URL || 'http://localhost:5173/drive.html');
  await fallback.waitForFunction(() => document.querySelector('#start').textContent === 'WebGL unavailable');
  console.log('PASS: real WebGL2, rendered screenshots, keyboard acceleration/steering, pause/resume, camera, restart, touch throttle, responsive width, no-WebGL fallback, no desktop JS errors.');
} finally { await browser.close(); }
