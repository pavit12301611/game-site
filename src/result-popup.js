/**
 * Opens the result dialog when a game finishes, for the winner, the loser and everyone watching.
 *
 * It is driven from `render()`, because a finished game arrives by two routes (the CPU loop in local practice,
 * a Firestore snapshot in an online room) and both end in a repaint. The dialog waits a moment so the last
 * move and the winning line can be seen first, opens once per finished game, and re-arms when a new game starts.
 */
import { currentGameState, currentUid, state } from './state.js';
import { playUiTone } from './ui/sound.js';

export const RESULT_DELAY_MS = 900;

/** @type {number | null} */
let timer = null;
let shown = false;

function isFinished() {
  return state.page === 'game' && currentGameState()?.phase === 'finished';
}

/** Which way the finished game went for this player. @returns {'win' | 'loss' | 'draw'} */
export function resultKind() {
  const gameState = currentGameState();
  if (!gameState?.winnerUid) return 'draw';
  return gameState.winnerUid === currentUid() ? 'win' : 'loss';
}

/**
 * Call after every paint.
 * @param {() => void} repaint
 */
export function trackResult(repaint) {
  if (!isFinished()) {
    shown = false;
    if (timer) window.clearTimeout(timer);
    timer = null;
    return;
  }
  if (shown || timer || state.modal) return;
  timer = window.setTimeout(() => {
    timer = null;
    if (!isFinished() || state.modal || shown) return;
    shown = true;
    state.modal = { type: 'result' };
    repaint();
    playUiTone(resultKind());
  }, RESULT_DELAY_MS);
}

/** Test hook: forget the "already shown" flag and any pending timer. */
export function resetResultPopup() {
  if (timer) window.clearTimeout(timer);
  timer = null;
  shown = false;
}
