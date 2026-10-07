/**
 * Tiny HTML helpers shared by every view.
 *
 * `esc` is the only thing standing between a player-chosen display name and the DOM, so it is used
 * for every interpolated string in the app — including the ones that come back from Firestore.
 */
export const ICONS = {
  grid: '<path d="M4 4h16v16H4zM4 10h16M10 4v16"/><path d="M7 7h.01M16 16h.01"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/>',
  star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3ZM19 15l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  gamepad: '<path d="M6 12h4m-2-2v4m8-3h.01M18 13h.01M7 7h10a4 4 0 0 1 3.9 3.1l1 4A3 3 0 0 1 19 18l-3.2-2.1H8.2L5 18a3 3 0 0 1-2.9-3.9l1-4A4 4 0 0 1 7 7Z"/>',
  exit: '<path d="M10 17l5-5-5-5M15 12H3m9-8h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"/>',
  wifi: '<path d="M2 8.5a15.5 15.5 0 0 1 20 0M5 12a10.8 10.8 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0M12 19h.01"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/>',
  crown: '<path d="M3 17h18M5 17 3.4 7.6 8 11l4-6.6L16 11l4.6-3.4L19 17H5Z"/>',
  cone: '<path d="M12 3 4 21h16L12 3Z"/><path d="M8.2 14h7.6"/>',
};

export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;
}

export function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/**
 * The PSD logo lock-up, as inline SVG so it needs no network request and inherits the current
 * colour. Lives here (not with the shell views) because both the sidebar/topbar and the modals
 * show it, and a shared view module would make those two import each other.
 *
 * @returns {string}
 */
export function renderBrand() {
  return `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><path class="b1" d="M8 15 14 7h12l6 8-2 17H10z"/><path class="b2" d="M9 16h22l-2 8H11z"/><path class="b3" d="M17 28h6" fill="none" stroke-width="2" stroke-linecap="round"/></svg></span>`;
}

/**
 * One responsive picture. Every image in the app goes through here so each one carries its real
 * width/height (no layout shift), lazy loading and async decoding; only the hero opts out.
 * @param {{ src: string, srcset?: string, width: number, height: number, focal?: string, alt?: string }} art
 * @param {{ className: string, sizes?: string, hero?: boolean }} options
 */
export function artImage(art, { className, sizes = '100vw', hero = false }) {
  const attrs = hero ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
  const srcset = art.srcset ? ` srcset="${art.srcset}" sizes="${sizes}"` : '';
  const focal = art.focal && art.focal !== 'center center' ? ` style="object-position:${art.focal}"` : '';
  return `<img class="${className}" src="${art.src}"${srcset} alt="${esc(art.alt || '')}" width="${art.width}" height="${art.height}" ${attrs}${focal}>`;
}
