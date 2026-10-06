/**
 * Public review reads and the trusted review submission call.
 *
 * Reading is deliberately unauthenticated (`firestore.rules` makes only the public review
 * collection world-readable). Submissions go through a callable so sentiment analysis and the
 * assistant reply happen before anything can appear on that public collection.
 */

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore';
import { db, firebaseReady } from './firebase.js';
import { friendlyError } from './errors.js';
import { callBackend } from './online/callables.js';
import { ensureOnlineUser } from './online/session.js';
import { classifyReviewOnDevice } from './review-model.js';
import { render } from './render.js';
import { state } from './state.js';

const PAGE_SIZE = 24;
/**
 * `db` is null only when Firebase never started; all reads in this module are guarded by
 * `firebaseReady`, so the cast describes the guarded branch.
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);
/** @type {import('firebase/firestore').QueryDocumentSnapshot | null} */
let reviewsCursor = null;
let featuredLoaded = false;

/** @param {import('firebase/firestore').QuerySnapshot} snapshot */
function rowsOf(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

/** Load the single best-scoring review separately from the chronological feed. */
export async function loadFeaturedReview({ force = false } = {}) {
  if (featuredLoaded && !force) return;
  featuredLoaded = true;
  if (!firebaseReady) {
    state.featuredReview = null;
    return;
  }
  try {
    const snapshot = await getDocs(query(collection(store, 'reviews'), orderBy('featuredScore', 'desc'), limit(1)));
    state.featuredReview = rowsOf(snapshot)[0] || null;
    state.featuredReviewError = '';
  } catch (error) {
    state.featuredReview = null;
    state.featuredReviewError = friendlyError(error);
  }
  if (state.page === 'home' || state.page === 'reviews') render();
}

/**
 * Load a page of public reviews. `reset` starts from the newest one; the button uses the saved
 * Firestore cursor to append the next page, so older reviews are reachable rather than hidden.
 */
export async function loadPublicReviews({ reset = true } = {}) {
  if (!firebaseReady) {
    state.reviewsError = 'Reviews need Firebase to be configured for this deployment.';
    state.reviewsLoading = false;
    state.reviewsHasMore = false;
    if (state.page === 'reviews') render();
    return;
  }
  if (state.reviewsLoading) return;
  if (!reset && !state.reviewsHasMore) return;
  if (reset) {
    reviewsCursor = null;
    state.reviews = [];
    state.reviewsHasMore = true;
    state.reviewsError = '';
  }
  state.reviewsLoading = true;
  render();
  try {
    /** @type {import('firebase/firestore').QueryConstraint[]} */
    const constraints = [orderBy('createdAtMs', 'desc'), limit(PAGE_SIZE)];
    if (!reset && reviewsCursor) constraints.unshift(startAfter(reviewsCursor));
    const snapshot = await getDocs(query(collection(store, 'reviews'), ...constraints));
    const rows = rowsOf(snapshot);
    state.reviews = reset ? rows : [...state.reviews, ...rows];
    reviewsCursor = snapshot.docs.at(-1) || reviewsCursor;
    state.reviewsHasMore = snapshot.docs.length === PAGE_SIZE;
    state.reviewsError = '';
  } catch (error) {
    state.reviewsError = friendlyError(error);
    state.reviewsHasMore = false;
  }
  state.reviewsLoading = false;
  if (state.page === 'reviews') render();
}

/**
 * Run sentiment locally, then send the review and its tiny prediction envelope through the trusted
 * callable. Only the static model files are requested from the public model host; review text stays
 * in this browser until the normal Firebase submission.
 * @param {Record<string, any>} payload
 * @param {(message: string) => void} [onModelProgress]
 * @returns {Promise<Record<string, any> & { usedOnDeviceModel: boolean, modelUnavailable: boolean }>}
 */
export async function submitReview(payload, onModelProgress) {
  await ensureOnlineUser();
  let pretrainedPrediction = null;
  let modelUnavailable = false;
  try {
    pretrainedPrediction = await classifyReviewOnDevice(
      `${String(payload.title || '')}. ${String(payload.message || '')}`,
      onModelProgress,
    );
  } catch {
    // Keep review submission available when the user is offline, the browser has no Worker support,
    // or a model-weight request is blocked. The backend still supplies its transparent local reply.
    modelUnavailable = true;
  }
  const result = await callBackend('createReview', { ...payload, pretrainedPrediction });
  return { ...result, usedOnDeviceModel: Boolean(pretrainedPrediction), modelUnavailable };
}
