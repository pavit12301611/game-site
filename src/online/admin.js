/**
 * The admin dashboard's data.
 *
 * Firestore rules are what actually protect this: only a UID listed in `admins/{uid}` can list
 * rooms, and the client hides the page unless that flag is set. This module only reads.
 */

import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db, firebaseReady } from '../firebase.js';
import { friendlyError } from '../errors.js';
import { render } from '../render.js';
import { state } from '../state.js';

export async function loadAdminData() {
  if (!firebaseReady || !state.isAdmin || !state.user) return;
  // `db` is null only when Firebase never started, which the guard above has already ruled out.
  const store = /** @type {import('firebase/firestore').Firestore} */ (db);
  state.adminLoading = true;
  render();
  try {
    const [roomsSnap, profilesSnap, friendsSnap] = await Promise.all([
      getDocs(query(collection(store, 'rooms'), orderBy('createdAt', 'desc'), limit(50))),
      getDocs(query(collection(store, 'profiles'), limit(200))),
      getDocs(query(collection(store, 'friendships'), limit(200))),
    ]);
    state.adminData = {
      rooms: roomsSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
      profiles: profilesSnap.size,
      friendships: friendsSnap.size,
    };
  } catch (error) {
    state.adminData = { error: friendlyError(error), rooms: [], profiles: 0, friendships: 0 };
  }
  state.adminLoading = false;
  render();
}
