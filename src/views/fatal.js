/**
 * The last-resort screen.
 *
 * If drawing the app throws, the page would otherwise go blank - the worst possible failure,
 * because it looks like the site is down and there is nothing to click. `src/render.js` catches
 * that and shows this instead: what happened, a reload, and a way back in.
 *
 * The message is escaped and capped, because an error string can contain anything.
 */

import { esc } from '../ui/html.js';

/**
 * @param {unknown} error
 * @returns {string}
 */
export function renderFatal(error) {
  const message = String(/** @type {any} */ (error)?.message || error || 'Unknown error').slice(0, 300);
  return `<section class="surface fatal-error" role="alert" aria-labelledby="fatal-title">
    <div class="fatal-badge" aria-hidden="true">!</div>
    <div class="eyebrow">THE ARCADE COULD NOT DRAW THIS PAGE</div>
    <h1 id="fatal-title">Something went wrong<span>.</span></h1>
    <p>Nothing on this device was lost: your favorites, recent games and theme are still saved.
    Reloading fixes it almost every time.</p>
    <pre class="fatal-detail">${esc(message)}</pre>
    <div class="fatal-actions">
      <button class="button button-primary" data-action="reload">Reload the arcade</button>
      <a class="button button-outline" href="#/home">Back to the game shelf</a>
    </div>
  </section>`;
}
