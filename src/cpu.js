/**
 * CPU opponent: plays the same engines as online, but locally.
 */

import { GAMES, getGame, createInitialGameState, applyGameAction } from './catalog.js';
import { state } from './state.js';
import { render } from './render.js';
import { showToast } from './ui/toast.js';
import { navigate } from './router.js';

/**
 * Starts a local practice game against a CPU opponent.
 */
export function startPractice(gameId) {
  const game = getGame(gameId);
  if (!game) throw new Error('Game not found.');

  const players = [
    { uid: 'local-you', name: state.displayName || 'You' },
    { uid: 'local-cpu', name: 'CPU' },
  ];

  state.local = {
    gameId,
    players,
    gameState: createInitialGameState(game, players, `local:${Date.now()}`),
    seed: `local:${Date.now()}`,
  };

  state.codeDraft = [0, 0, 0, 0];
  state.modal = null;
  state.page = 'game';
  if (location.hash !== '#/game') location.hash = '#/game';
  render();

  if (game.engine === 'race') startCpuRaceLoop();
  else scheduleCpuMove();
}

/**
 * Sends a game action in local practice mode.
 */
export async function sendGameAction(action) {
  if (state.local) {
    const game = getGame(state.local.gameId);
    if (!game) return;
    try {
      state.local.gameState = applyGameAction(
        game,
        state.local.gameState,
        'local-you',
        action,
        state.local.players,
      );
      render();
      scheduleCpuMove();
    } catch (error) {
      showToast(error.message, 'warning');
    }
    return;
  }

  // Online: send to backend
  if (!state.roomId) return;
  state.onlineActionsPending++;
  render();
  try {
    const { playMove } = await import('./online/callables.js');
    const { generateActionId } = await import('./online/action-sync.js');
    const result = await playMove({
      roomId: state.roomId,
      action,
      clientActionId: generateActionId(),
    });
    // Room snapshot will update via Firestore listener
  } catch (error) {
    showToast(error?.message || 'Move rejected.', 'warning');
  }
  state.onlineActionsPending = Math.max(0, state.onlineActionsPending - 1);
  render();
}

/**
 * Schedules a CPU move with a small delay for realism.
 */
export function scheduleCpuMove() {
  if (!state.local || state.local.gameState.status === 'finished') return;
  const game = getGame(state.local.gameId);
  if (!game) return;

  // CPU is always player index 1
  if (state.local.gameState.turnIndex !== 1) return;

  state.cpuPending = true;
  state.cpuTimer = window.setTimeout(() => {
    if (!state.local || state.local.gameState.status === 'finished') { state.cpuPending = false; return; }
    const cpuAction = computeCpuAction(game, state.local.gameState, state.local.players);
    if (cpuAction) {
      try {
        state.local.gameState = applyGameAction(game, state.local.gameState, 'local-cpu', cpuAction, state.local.players);
      } catch { /* illegal move — skip */ }
    }
    state.cpuPending = false;
    render();
  }, 400 + Math.random() * 300);
}

/**
 * Computes a simple CPU action for the current engine.
 */
function computeCpuAction(game, gameState, players) {
  switch (game.engine) {
    case 'line': return cpuLineAction(game, gameState);
    case 'drop': return cpuDropAction(game, gameState);
    case 'memory': return cpuMemoryAction(gameState);
    case 'rps': return cpuRpsAction(game.options);
    case 'quiz': return cpuQuizAction(game, gameState);
    case 'battle': return cpuBattleAction(gameState);
    case 'rally': return cpuRallyAction(game);
    case 'code': return cpuCodeAction(game, gameState);
    default: return null;
  }
}

function cpuLineAction(game, state) {
  const { size } = game.options;
  const empty = [];
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] === '') empty.push(i);
  }
  if (!empty.length) return null;
  return { index: empty[Math.floor(Math.random() * empty.length)] };
}

function cpuDropAction(game, state) {
  const { cols, rows } = game.options;
  const available = [];
  for (let c = 0; c < cols; c++) {
    if (state.colHeights[c] < rows) available.push(c);
  }
  if (!available.length) return null;
  return { col: available[Math.floor(Math.random() * available.length)] };
}

function cpuMemoryAction(state) {
  const unmatched = [];
  for (let i = 0; i < state.cards.length; i++) {
    if (!state.matched[i] && !state.selected.includes(i)) unmatched.push(i);
  }
  if (!unmatched.length) return null;
  return { index: unmatched[Math.floor(Math.random() * unmatched.length)] };
}

function cpuRpsAction(options) {
  const choices = options.mode === 'coin' ? ['heads', 'tails']
    : options.mode === 'dice' ? ['1', '2', '3', '4', '5', '6']
    : ['rock', 'paper', 'scissors'];
  return { choice: choices[Math.floor(Math.random() * choices.length)] };
}

function cpuQuizAction(game, state) {
  if (state.roundRevealed) return { type: 'next' };
  const q = state.questions[state.currentRound];
  if (!q) return { type: 'next' };
  // CPU picks randomly (25% chance of correct)
  return { answer: Math.floor(Math.random() * 4) };
}

function cpuBattleAction(state) {
  const board = state.board;
  const myShots = state.shots['local-cpu'] || Array(board * board).fill(false);
  const unshot = [];
  for (let i = 0; i < myShots.length; i++) {
    if (!myShots[i]) unshot.push(i);
  }
  if (!unshot.length) return null;
  const cell = unshot[Math.floor(Math.random() * unshot.length)];
  return { type: 'fire', targetUid: 'local-you', index: cell };
}

function cpuRallyAction(game) {
  const { lanes } = game.options;
  return { lane: Math.floor(Math.random() * lanes) };
}

function cpuCodeAction(game, state) {
  const { digits, symbols } = state;
  const guess = [];
  for (let i = 0; i < digits; i++) {
    guess.push(Math.floor(Math.random() * symbols));
  }
  return { guess };
}

/**
 * Starts the CPU race loop (for race engine games).
 */
export function startCpuRaceLoop() {
  if (!state.local || state.local.gameState.status === 'finished') return;
  state.cpuTimer = window.setInterval(() => {
    if (!state.local || state.local.gameState.status === 'finished') {
      clearInterval(state.cpuTimer);
      return;
    }
    const game = getGame(state.local.gameId);
    if (!game || game.engine !== 'race') return;
    try {
      state.local.gameState = applyGameAction(game, state.local.gameState, 'local-cpu', { type: 'tap' }, state.local.players);
      render();
    } catch { /* ignore */ }
  }, 200 + Math.random() * 100);
}