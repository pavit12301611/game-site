/**
 * Hash router: parses and navigates between pages.
 */

import { firebaseReady } from './firebase.js';
import { render } from './render.js';
import { maintenanceBlocks, state } from './state.js';
import { showToast } from './ui/toast.js';
import { loadAdminData } from './online/admin.js';
import { openRoomFromLink, stopActiveRoom } from './online/rooms.js';
import { loadFeaturedReview, loadPublicReviews } from './reviews.js';

export function parseHash() {
  const path = location.hash.replace(/^#\/?/, '') || 'home';
  const [page, id] = path.split('/');
  return { page, id };
}

export function setHash(path) {
  const nextHash = `#/${path}`;
  if (location.hash === nextHash) routeFromHash();
  else location.hash = nextHash;
}

export function routeFromHash() {
  const { page, id } = parseHash();
  const validPages = ['home', 'catalog', 'friends', 'reviews', 'admin', 'privacy', 'safety', 'room', 'game'];
  const nextPage = validPages.includes(page) ? page : 'home';
  state.routeNotice = validPages.includes(page) ? '' : String(page || '').slice(0, 40);

  if (nextPage === 'room' && id) {
    state.page = 'room';
    state.local = null;
    render();
    if (firebaseReady && !maintenanceBlocks()) void openRoomFromLink(id);
    return;
  }

  stopActiveRoom();
  if (nextPage !== 'game') state.local = null;
  state.page = nextPage;
  render();

  if (maintenanceBlocks()) return;

  if (state.focusSearchAfterRoute) {
    state.focusSearchAfterRoute = false;
    requestAnimationFrame(() => {
      const search = /** @type {HTMLInputElement | null} */ (document.querySelector('#global-search'));
      search?.focus();
      search?.setSelectionRange(search.value.length, search.value.length);
    });
  }

  if (nextPage === 'reviews') {
    void loadPublicReviews({ reset: true });
    void loadFeaturedReview();
  }
  if (nextPage === 'admin' && state.isAdmin) void loadAdminData();
}

export function navigate(page) {
  if (page === 'admin' && !state.isAdmin) {
    showToast('The admin area is only available to approved accounts.', 'warning');
    return;
  }
  if (page !== 'room') stopActiveRoom();
  if (page !== 'game') state.local = null;
  state.page = page;
  if (location.hash !== `#/${page}`) location.hash = `#/${page}`;
  render();
  if (page === 'admin') void loadAdminData();
}