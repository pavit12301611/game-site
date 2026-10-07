/**
 * Game result popup: tracks when a game finishes and shows the result modal.
 */

import { state } from './state.js';

let lastStatus = null;

/**
 * Checks if a game just finished and shows the result modal.
 * @param {() => void} renderFn
 */
export function trackResult(renderFn) {
  const gs = (state.local?.gameState) || (state.room?.state);
  if (!gs) { lastStatus = null; return; }

  if (gs.status === 'finished' && lastStatus !== 'finished') {
    const isWinner = gs.winner === (state.local ? 'local-you' : state.user?.uid);
    const isDraw = gs.winner === 'draw';

    state.modal = {
      type: 'result',
      winner: gs.winner,
      isWinner,
      isDraw,
      title: isDraw ? 'Draw!' : isWinner ? 'You won!' : 'Game over',
    };
    renderFn();
  }

  lastStatus = gs.status;
}