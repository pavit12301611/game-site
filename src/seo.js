/**
 * Page-specific metadata.
 *
 * The app is one HTML document with a hash router, so every route shares `index.html`; this module
 * updates the title, the description and the social-preview tags on every repaint, which is what a
 * browser tab, a bookmark and most crawlers read. It never invents a canonical URL for a hash route
 * (search engines treat `#/catalog` as the same document), so `index.html` keeps the single
 * canonical link and the sitemap lists the one real URL.
 *
 * Static, dependency-free and safe in a non-browser test environment: every DOM access is optional.
 */

import { state } from './state.js';

/** One honest line per route — what this page is, in the app's own words. */
export const PAGE_META = Object.freeze({
  home: {
    title: 'PSD-gaming — Play together, anywhere',
    description: 'Forty bite-size retro games for 2–3 friends. Share a link and play in the browser. No downloads, no accounts required to try a guest room.',
  },
  catalog: {
    title: 'Game library — 40 retro mini-games · PSD-gaming',
    description: 'Browse all 40 browser games by category, round length, difficulty and input style, then open a private 2–3 player room or practice locally.',
  },
  friends: {
    title: 'Friends — add players by username · PSD-gaming',
    description: 'Find a player by their exact username, keep a friends list, and send direct game invites. Guests can play by link without an account.',
  },
  admin: {
    title: 'Admin studio · PSD-gaming',
    description: 'Operator tools: rooms, players, social cleanup, and the reports players send in. Available only to approved admin accounts.',
  },
  privacy: {
    title: 'Privacy notice — what the arcade stores · PSD-gaming',
    description: 'What PSD-gaming stores in Firebase, who can read it, how long rooms and social data live, and how self-service account deletion works.',
  },
  safety: {
    title: 'Terms & safety — house rules · PSD-gaming',
    description: 'House rules for PSD-gaming: fair play, what blocking and reporting really do, account responsibilities, and the limits of casual rooms.',
  },
  room: {
    title: 'Private room — waiting for players · PSD-gaming',
    description: 'A private invite-only game room. Anyone with the link or the 7-character room code can join while the room is open.',
  },
  game: {
    title: 'Now playing · PSD-gaming',
    description: 'A live round of a browser mini-game, synced through a trusted Firebase backend.',
  },
});

/** The title for a finished online round, so a tab in the background still says something useful. */
function titleFor(page) {
  const meta = PAGE_META[page] || PAGE_META.home;
  if (page !== 'game') return meta.title;
  const game = state.local?.gameId || state.room?.gameId;
  return game ? `${String(game).replace(/-/g, ' ')} · PSD-gaming` : meta.title;
}

function setMeta(selector, attribute, value) {
  const element = /** @type {HTMLMetaElement | HTMLLinkElement | null} */ (document.querySelector(selector));
  if (element) element.setAttribute(attribute, value);
}

function setProperty(property, value) {
  setMeta(`meta[property="${property}"]`, 'content', value);
}

function setName(name, value) {
  setMeta(`meta[name="${name}"]`, 'content', value);
}

/**
 * Applies the metadata for the current page. Called by `render()` after every repaint.
 * @param {string} [page]
 */
export function applyPageMeta(page = state.page) {
  if (typeof document === 'undefined') return;
  const meta = PAGE_META[page] || PAGE_META.home;
  const title = titleFor(page);
  document.title = title;
  setName('description', meta.description);
  setProperty('og:title', title);
  setProperty('og:description', meta.description);
  setName('twitter:title', title);
  setName('twitter:description', meta.description);
}
