/**
 * Public reviews: paged reads, featured review, and callable submission.
 */

import { db, firebaseReady } from './firebase.js';
import { state } from './state.js';
import { render } from './render.js';
import { showToast } from './ui/toast.js';
import { collection, query, orderBy, limit, startAfter, getDocs, where } from 'firebase/firestore';

const PAGE_SIZE = 10;

/**
 * Loads public reviews with pagination.
 */
export async function loadPublicReviews({ reset = false } = {}) {
  if (!firebaseReady) return;
  if (state.reviewsLoading) return;

  state.reviewsLoading = true;
  state.reviewsError = '';
  if (reset) {
    state.reviews = [];
    state.reviewsHasMore = true;
  }
  render();

  try {
    let q = query(
      collection(db, 'reviews'),
      where('approved', '==', true),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    );

    if (state.reviews.length > 0 && !reset) {
      const last = state.reviews[state.reviews.length - 1];
      q = query(
        collection(db, 'reviews'),
        where('approved', '==', true),
        orderBy('createdAt', 'desc'),
        startAfter(last._doc || last),
        limit(PAGE_SIZE),
      );
    }

    const snapshot = await getDocs(q);
    const newReviews = snapshot.docs.map(d => ({ id: d.id, _doc: d, ...d.data() }));

    state.reviews = reset ? newReviews : [...state.reviews, ...newReviews];
    state.reviewsHasMore = newReviews.length >= PAGE_SIZE;
  } catch (error) {
    state.reviewsError = error?.message || 'Could not load reviews.';
  }

  state.reviewsLoading = false;
  render();
}

/**
 * Loads the featured (top) review.
 */
export async function loadFeaturedReview({ force = false } = {}) {
  if (!firebaseReady) return;
  if (state.featuredReview && !force) return;

  try {
    const q = query(
      collection(db, 'reviews'),
      where('approved', '==', true),
      where('featured', '==', true),
      limit(1),
    );
    const snapshot = await getDocs(q);
    state.featuredReview = snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
    state.featuredReviewError = '';
  } catch (error) {
    state.featuredReviewError = error?.message || '';
  }
  render();
}

/**
 * Submits a review through the backend (which attaches the sentiment analysis reply).
 */
export async function submitReview(payload, onStatus) {
  const { createReview } = await import('./online/callables.js');
  return createReview(payload);
}