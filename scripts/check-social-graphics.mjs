/** Screenshots and interaction regression checks for all ten illustrated social games. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.ARCADE_URL || 'http://localhost:5174';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
const games = [
  ['pixel-tac-toe', 'line', '[data-action="line-move"][data-index="0"]', '.board-mark-art'],
  ['connect-four', 'drop', '[data-action="drop-move"][data-col="0"]', '.disc'],
  ['memory-match', 'memory', '[data-action="memory-flip"][data-index="0"]', '.memory-face-art'],
  ['pixel-tap', 'race', '[data-action="race-tap"]', '.race-progress i'],
  ['rock-paper-scissors', 'rps', '[data-action="duel-choice"][data-choice="rock"]', '.duel-hand-art'],
  ['retro-trivia', 'quiz', '[data-action="quiz-answer"][data-answer="0"]', '.quiz-option'],
  ['maze-runner', 'maze', '[data-action="maze-move"][data-direction="up"]', '.maze-token'],
  ['sea-battle', 'battle', '[data-action="battle-fire"][data-index="0"]', '.battle-cell.is-hit,.battle-cell.is-miss'],
  ['pong-rally', 'rally', '[data-action="rally-hit"][data-lane="2"]', '.court-paddle'],
  ['codebreaker', 'code', '[data-action="code-submit"]', '.guess-row'],
];
try {
  await mkdir('.arena/social', { recursive: true });
  const errors = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const mobile = viewport.width < 500;
    const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/#/catalog`);
    if (!mobile) {
      await page.locator('.game-card').last().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.game-card img')].every(i => i.complete && i.naturalWidth > 0));
      await page.evaluate(async () => { window.scrollTo(0, 0); await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); });
      await page.screenshot({ path: '.arena/social/library.png', fullPage: true, animations: 'disabled' });
    }
    for (const [id, engine, action, visual] of games) {
      await page.goto(`${base}/#/catalog`);
      await page.locator(`[data-action="open-game"][data-game-id="${id}"]`).click();
      await page.locator('[data-action="practice-game"]').click();
      await page.waitForSelector(`.board-studio[data-engine="${engine}"]`);
      await page.locator(action).first().click();
      await page.waitForSelector(visual);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${id}: no horizontal overflow`);
      const studio = await page.locator('.board-studio').boundingBox();
      assert.ok(studio.x >= -1 && studio.x + studio.width <= viewport.width + 1, `${id}: board fits`);
      await page.locator('.board-studio').screenshot({ animations: 'disabled', path: `.arena/social/${id}-${mobile ? 'mobile' : 'desktop'}.png` });
      assert.equal(await page.locator('.fatal-error').count(), 0);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: all ten social boards load and accept moves on desktop + emulated mobile; generated covers load; vector pieces render; no horizontal overflow or runtime errors.');
} finally { await browser.close(); }
