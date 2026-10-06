/**
 * The privacy and safety pages, and the metadata the shell puts in the document head.
 *
 * These pages make promises on the operator's behalf, so the test is written as a check on the
 * *claims*: the retention numbers must equal the shared table the cleanup function uses, the pages
 * must not claim a legal compliance the project cannot verify, and the two honest limitations
 * (invite-link sharing and casual rooms not being cheat-proof) must be present.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  CLEANUP_INTERVAL_MS,
  FRIEND_REQUEST_MAX_AGE_MS,
  INVITE_MAX_AGE_MS,
  RATE_LIMIT_MAX_AGE_MS,
  RECENT_AUTH_WINDOW_MS,
  REPORT_MAX_AGE_MS,
  ROOM_TTL_MS,
} from '../shared/online/retention.js';

let renderPrivacy;
let renderSafety;
let renderShell;
let applyPageMeta;
let PAGE_META;
let state;

before(async () => {
  const dom = new JSDOM('<!doctype html><html><head><meta id="meta-theme-color" content=""><meta name="description" content="x"><meta property="og:title" content="x"><meta property="og:description" content="x"><meta name="twitter:title" content="x"><meta name="twitter:description" content="x"></head><body><div id="app"></div></body></html>', {
    url: 'https://psd-gaming.test/#/privacy',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const define = (name, value) => Object.defineProperty(global, name, { value, configurable: true, writable: true });
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('location', window.location);
  define('matchMedia', window.matchMedia);
  define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  ({ renderPrivacy, renderSafety } = await import('../src/views/legal.js'));
  ({ renderShell } = await import('../src/views/shell.js'));
  ({ applyPageMeta, PAGE_META } = await import('../src/seo.js'));
  ({ state } = await import('../src/state.js'));
});

/** Strips tags so the assertions read the sentence, not the markup. */
function text(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

test('the privacy notice describes every collection the app really writes', () => {
  const page = renderPrivacy();
  const words = text(page);
  for (const collection of ['profiles/', 'usernames/', 'friendRequests', 'friendships', 'gameInvites', 'rooms/{id}/secrets', 'rooms/{id}/views', 'rateLimits/', 'blocks/', 'localStorage']) {
    assert.match(words, new RegExp(collection.replace(/[/{}]/g, (char) => `\\${char}`)), `privacy notice must mention ${collection}`);
  }
  assert.match(words, /Firebase Authentication/);
  assert.match(words, /Passwords are handled by Firebase Authentication/);
  assert.match(words, /Hugging Face/);
  assert.match(words, /about 67 MB/);
  assert.match(words, /never sends your review text/);
  assert.match(words, /movie-review sentences, not PSD-gaming reviews or game reviews/);
});

test('the retention numbers on the page are the numbers the cleanup function uses', () => {
  const words = text(renderPrivacy());
  const hours = (ms) => ms / (60 * 60 * 1000);
  assert.match(words, new RegExp(`${ROOM_TTL_MS / 60000} minutes`), 'room lifetime is quoted');
  assert.match(words, new RegExp(`${hours(INVITE_MAX_AGE_MS)} hours`), 'invite lifetime is quoted');
  assert.match(words, new RegExp(`${hours(RATE_LIMIT_MAX_AGE_MS) / 24} days`), 'rate-limit lifetime is quoted');
  assert.match(words, new RegExp(`${FRIEND_REQUEST_MAX_AGE_MS / (24 * 60 * 60 * 1000)} days`), 'request lifetime is quoted');
  assert.match(words, new RegExp(`${REPORT_MAX_AGE_MS / (24 * 60 * 60 * 1000)} days`), 'report retention is quoted');
  assert.match(words, new RegExp(`${RECENT_AUTH_WINDOW_MS / 60000} minutes`), 'the recent sign-in window is quoted');
  assert.equal(CLEANUP_INTERVAL_MS, 15 * 60 * 1000, 'the page says every 15 minutes; keep them together');
  assert.match(words, /every 15 minutes/);
});

test('the pages state the limitations and make no compliance claim', () => {
  const words = text(renderPrivacy() + renderSafety());
  assert.match(words, /not cheat-proof/, 'casual rooms must stay honestly described');
  assert.match(words, /holds a working invite link can join/, 'invite-link sharing must be stated');
  assert.match(words, /no automatic moderation/, 'reports must not look like moderation');
  assert.match(words, /not legal advice/, 'the house rules must not read as a contract');
  assert.match(words, /no compliance claim/i);
  assert.doesNotMatch(words, /(?:we|this app|this project) (?:are|is|comply with|complies with|is compliant with)/i, 'no compliance claims anywhere');
  assert.doesNotMatch(words, /GDPR[- ]?compliant|COPPA[- ]?compliant|fully compliant/i, 'GDPR/COPPA are only mentioned as things this project does not claim');
  assert.doesNotMatch(words, /we (?:sell|share) your data|100% secure|military-grade/i, 'no security marketing');
});

test('operator-specific facts are labelled checklist items, not invented', () => {
  const words = text(renderPrivacy());
  assert.match(words, /Operator details — launch checklist/);
  assert.match(words, /legal name and a postal or contact address/);
  assert.match(words, /Contact for privacy questions/);
  assert.doesNotMatch(words, /@psd-gaming\.(?:com|dev)|Data Protection Officer:/i, 'no invented contact details or DPO');
});

test('telemetry is off by default and the page says so', () => {
  const words = text(renderPrivacy());
  assert.match(words, /no analytics package, no advertising pixels and no third-party telemetry/);
});

test('both legal routes render inside the app shell with working navigation', () => {
  state.isAdmin = false;
  for (const page of ['privacy', 'safety']) {
    state.page = page;
    const shell = renderShell();
    assert.match(shell, new RegExp(`data-page="${page}"`), `${page} is reachable from the shell`);
    assert.match(shell, /sidebar-legal/, 'the sidebar links the legal pages');
  }
  state.page = 'privacy';
  assert.match(renderShell(), /Written for this codebase/);
  state.page = 'safety';
  assert.match(renderShell(), /House rules/);
  // Both pages link to each other, so a reader never has to use the browser back button.
  assert.match(renderPrivacy(), /data-page="safety"/);
  assert.match(renderSafety(), /data-page="privacy"/);
});

test('the auth, account and settings dialogs all link to the legal pages', async () => {
  const { renderModal } = await import('../src/views/modals.js');
  state.modal = { type: 'auth', mode: 'login' };
  assert.match(renderModal(), /data-page="privacy"/);
  state.modal = { type: 'account' };
  const account = renderModal();
  assert.match(account, /data-page="privacy"/);
  assert.match(account, /data-action="open-delete-account"/, 'self-service deletion is offered in the account menu');
  assert.match(account, /data-action="open-report"/, 'a report path is offered in the account menu');
  state.modal = { type: 'settings' };
  assert.match(renderModal(), /data-page="safety"/);
  state.modal = null;
});

test('every route has its own title and description, and the shell applies them', () => {
  const routes = ['home', 'catalog', 'friends', 'admin', 'privacy', 'safety', 'room', 'game'];
  const titles = new Set();
  for (const route of routes) {
    const meta = PAGE_META[route];
    assert.ok(meta, `${route} has metadata`);
    assert.ok(meta.title.length > 10 && meta.title.length < 70, `${route} title length is sane (${meta.title.length})`);
    assert.ok(meta.description.length > 40 && meta.description.length <= 160, `${route} description length is sane (${meta.description.length})`);
    titles.add(meta.title);
  }
  assert.equal(titles.size, routes.length, 'no two pages share a title');
  state.page = 'catalog';
  applyPageMeta('catalog');
  assert.equal(document.title, PAGE_META.catalog.title);
  assert.equal(document.querySelector('meta[name="description"]')?.getAttribute('content'), PAGE_META.catalog.description);
  assert.equal(document.querySelector('meta[property="og:title"]')?.getAttribute('content'), PAGE_META.catalog.title);
  assert.equal(document.querySelector('meta[name="twitter:description"]')?.getAttribute('content'), PAGE_META.catalog.description);
});
