import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.ARCADE_URL || 'http://localhost:5174';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await mkdir('.arena/curated', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/#/catalog`);
  await page.waitForSelector('.game-card');
  assert.equal(await page.locator('.game-card').count(), 22);
  assert.equal(await page.locator('[data-solo-game]').count(), 12);
  await page.waitForFunction(() => [...document.querySelectorAll('.game-card img')].every(i => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: '.arena/curated/library.png', fullPage: true });
  await page.locator('[data-action="toggle-favorite"][data-game-id="neon-snake"]').click();
  await page.waitForFunction(() => document.querySelector('[data-action="toggle-favorite"][data-game-id="neon-snake"]').getAttribute('aria-pressed') === 'true');
  const ids = await page.locator('[data-action="open-game"]').evaluateAll(nodes => nodes.map(n => n.dataset.gameId));
  // All ten retained room games must open a practice board with no runtime error.
  for (const id of ids) {
    await page.goto(`${base}/#/catalog`);
    await page.locator(`[data-action="open-game"][data-game-id="${id}"]`).click();
    await page.locator('[data-action="practice-game"]').click();
    await page.waitForFunction(() => document.querySelector('#page-content').textContent.includes('Local practice'));
    assert.equal(await page.locator('.fatal-error').count(), 0, id);
  }
  for (const id of ['neon-snake', 'prism-breaker', 'star-defender']) {
    console.log('Checking', id);
    await page.goto(`${base}/play.html?game=${id}`);
    await page.locator('#solo-start').click();
    await page.waitForFunction(() => document.querySelector('.console-led').textContent.includes('PLAYING'));
    if (id === 'neon-snake') {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(350);
    } else {
      await page.keyboard.down(' ');
      await page.waitForFunction(() => Number(document.querySelector('#solo-score').textContent) > 0, null, { timeout: 20000 });
      await page.keyboard.up(' ');
    }
    await page.locator('#solo-pause').click();
    const pixels = await page.locator('canvas').evaluate(c => c.toDataURL());
    await page.waitForTimeout(250);
    assert.equal(await page.locator('canvas').evaluate(c => c.toDataURL()), pixels, 'paused board stays fixed');
    await page.locator('#solo-resume').click();
    await page.screenshot({ path: `.arena/curated/${id}.png` });
    await page.locator('#solo-restart').click();
    await page.waitForFunction(() => document.querySelector('#solo-score').textContent === '0000');
    if (id === 'neon-snake') {
      await page.waitForSelector('#solo-again', { timeout: 7000 });
      assert.match(await page.locator('#solo-status').textContent(), /Game over/);
      await page.locator('#solo-again').click();
      await page.waitForFunction(() => document.querySelector('#solo-overlay').hidden);
    }
  }
  await page.goto(`${base}/play.html?game=not-real`); assert.match(await page.locator('h1').textContent(), /not in this arcade/);
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', e => errors.push(e.message));
  for (const id of ['neon-snake', 'prism-breaker', 'star-defender']) {
    await mobile.goto(`${base}/play.html?game=${id}`);
    await mobile.screenshot({ path: `.arena/curated/${id}-mobile-intro.png`, fullPage: true });
    await mobile.locator('#solo-start').tap();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (id === 'neon-snake') await mobile.locator('[data-dir="up"]').tap();
    else {
      const fire = await mobile.locator('[data-held="fire"]').boundingBox();
      const cdp = await mobile.context().newCDPSession(mobile);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 }] });
      await mobile.waitForFunction(() => Number(document.querySelector('#solo-score').textContent) > 0, null, { timeout: 20000 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await mobile.locator('#solo-pause').tap();
    await mobile.waitForFunction(() => !document.querySelector('#pause-screen').hidden);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: 22 cards, all cover images loaded, solo favorites, ten room-practice boards, all three new game canvases, keyboard play/scoring, pause/resume/restart, Snake game-over/replay, mobile touch input/scoring, mobile width, invalid route. No page errors.');
} finally { await browser.close(); }
