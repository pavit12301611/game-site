/**
 * The one bridge to the backend: same-origin /api/* calls carrying the Firebase ID token.
 * No callable Cloud Functions — everything goes through Vercel serverless routes.
 */

import { auth, firebaseReady } from '../firebase.js';

/**
 * Calls a backend API route with the user's ID token.
 * @param {string} route  e.g. '/api/createRoom'
 * @param {Record<string, any>} body
 * @returns {Promise<any>}
 */
async function callApi(route, body = {}) {
  if (!firebaseReady || !auth.currentUser) throw new Error('Sign in first.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorBody;
    try { errorBody = await response.json(); } catch { errorBody = null; }
    const message = errorBody?.error || `Server error (${response.status})`;
    const code = errorBody?.code || 'server-error';
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  return response.json();
}

export const createRoom = (data) => callApi('/api/createRoom', data);
export const joinRoom = (data) => callApi('/api/joinRoom', data);
export const leaveRoom = (data) => callApi('/api/leaveRoom', data);
export const startRoom = (data) => callApi('/api/startRoom', data);
export const playMove = (data) => callApi('/api/playMove', data);
export const claimHost = (data) => callApi('/api/claimHost', data);
export const rematch = (data) => callApi('/api/rematch', data);
export const sendChat = (data) => callApi('/api/sendChat', data);
export const sendFriendRequest = (data) => callApi('/api/sendFriendRequest', data);
export const respondFriendRequest = (data) => callApi('/api/respondFriendRequest', data);
export const cancelFriendRequest = (data) => callApi('/api/cancelFriendRequest', data);
export const blockUser = (data) => callApi('/api/blockUser', data);
export const unblockUser = (data) => callApi('/api/unblockUser', data);
export const reportProblem = (data) => callApi('/api/reportProblem', data);
export const createReview = (data) => callApi('/api/createReview', data);
export const claimUsername = (data) => callApi('/api/claimUsername', data);
export const deleteAccount = () => callApi('/api/deleteAccount');
export const lookupUser = (data) => callApi('/api/lookupUser', data);
export const createGameInvite = (data) => callApi('/api/createGameInvite', data);
export const respondGameInvite = (data) => callApi('/api/respondGameInvite', data);

// Admin routes
export const adminRoomAction = (data) => callApi('/api/adminRoomAction', data);
export const adminRemovePlayer = (data) => callApi('/api/adminRemovePlayer', data);
export const adminLabelReview = (data) => callApi('/api/adminLabelReview', data);
export const adminTrainReviewAgent = () => callApi('/api/adminTrainReviewAgent');