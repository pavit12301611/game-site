/**
 * Playing against the browser.
 *
 * Local practice needs no Firebase at all: the match is a plain object in `state.local` and the CPU
 * move is chosen by the same engine the online game uses, from the same state. That is why practice
 * is a real test of a game's rules and not a separate, second implementation.
 *
 * The CPU is deliberately beatable: it takes a winning move when it sees one, blocks an obvious
 * threat most of the time, and otherwise plays at random, with a short delay so turns feel like
 * turns. `startCpuRaceLoop` is the one exception - tap races are real-time, so they tick.
 */

import { GAMES, applyGameAction, createInitialGameState, getGame, getQuizQuestion } from './catalog.js';
import { friendlyError } from './errors.js';
import { recordRecentGame } from './ui/prefs.js';
import { playUiTone } from './ui/sound.js';
import { render } from './render.js';
import { state } from './state.js';
import { showToast } from './ui/toast.js';
import { doOnlineAction } from './online/rooms.js';

export function startPractice(gameId) {
  const game = getGame(gameId);
  if (!game) return;
  recordRecentGame(gameId);
  const players = [
    { uid: 'local-you', name: 'You' },
    { uid: 'local-cpu', name: 'CPU rival' },
  ];
  const seed = `practice-${gameId}-${Date.now()}`;
  state.local = { gameId, players, gameState: createInitialGameState(game, players, seed), seed };
  state.room = null;
  state.roomId = null;
  state.page = 'game';
  state.modal = null;
  state.selectedBattleTarget = 'local-cpu';
  state.codeDraft = [0, 0, 0, 0];
  if (location.hash !== '#/game') location.hash = '#/game';
  render();
  if (game.engine === 'race') startCpuRaceLoop();
  else scheduleCpuMove();
}

export function localMove(uid, action) {
  if (!state.local) return;
  try {
    const game = getGame(state.local.gameId);
    if (!game) return;
    const next = applyGameAction(game, state.local.gameState, uid, action, state.local.players);
    state.local.gameState = next;
    playUiTone(next.phase === 'finished' ? 'win' : 'tap');
    render();
    if (game.engine !== 'race') scheduleCpuMove();
  } catch (error) {
    showToast(friendlyError(error), 'warning');
  }
}

export async function sendGameAction(action) {
  if (state.local) {
    localMove('local-you', action);
    return;
  }
  try {
    await doOnlineAction(action);
    playUiTone('tap');
  } catch (error) {
    playUiTone('error');
    showToast(friendlyError(error), 'warning');
  }
}

export function scheduleCpuMove() {
  if (!state.local || state.cpuPending || getGame(state.local.gameId)?.engine === 'race') return;
  const game = getGame(state.local.gameId);
  const gameState = state.local.gameState;
  const cpu = state.local.players[1];
  if (!game || gameState.phase !== 'playing') return;
  const shouldMove = ['rps', 'quiz', 'maze'].includes(game.engine)
    ? !Object.hasOwn(gameState.answers || gameState.picks || {}, cpu.uid) || game.engine === 'maze'
    : gameState.turnUid === cpu.uid;
  if (!shouldMove) return;
  state.cpuPending = true;
  const delay = game.engine === 'memory' && gameState.opened.length === 1 ? 780 : 620;
  state.cpuTimer = window.setTimeout(() => {
    state.cpuPending = false;
    if (!state.local) return;
    const current = state.local.gameState;
    if (current.phase !== 'playing') return;
    const action = chooseCpuAction(game, current, state.local.players);
    if (action) localMove(cpu.uid, action);
  }, delay);
}

export function startCpuRaceLoop() {
  window.clearTimeout(state.cpuTimer);
  const loop = () => {
    if (!state.local || getGame(state.local.gameId)?.engine !== 'race' || state.local.gameState.phase !== 'playing') return;
    localMove('local-cpu', { type: 'tap' });
    state.cpuTimer = window.setTimeout(loop, 690 + Math.random() * 500);
  };
  state.cpuTimer = window.setTimeout(loop, 850);
}

export function chooseCpuAction(game, gameState, players) {
  const cpu = players[1];
  const random = (max) => Math.floor(Math.random() * max);
  switch (game.engine) {
    case 'line': {
      const open = gameState.board.map((cell, index) => cell === null ? index : -1).filter((index) => index >= 0);
      return open.length ? { index: open[random(open.length)] } : null;
    }
    case 'drop': {
      const open = Array.from({ length: gameState.cols }, (_, index) => index).filter((col) => gameState.board[col] === null);
      return open.length ? { col: open[random(open.length)] } : null;
    }
    case 'memory': {
      const open = gameState.opened.length >= 2 ? [] : gameState.opened;
      const hidden = gameState.cards.map((_, index) => index).filter((index) => !gameState.matched.includes(index) && !open.includes(index));
      if (!hidden.length) return null;
      if (open.length === 1) {
        const match = hidden.find((index) => gameState.cards[index] === gameState.cards[open[0]]);
        if (match !== undefined && Math.random() > 0.18) return { index: match };
      }
      return { index: hidden[random(hidden.length)] };
    }
    case 'rps': {
      const choice = gameState.mode === 'rps' ? ['rock', 'paper', 'scissors'][random(3)] : gameState.mode === 'coin' ? ['heads', 'tails'][random(2)] : String(random(6) + 1);
      return { choice };
    }
    case 'quiz': {
      if (Object.hasOwn(gameState.answers, cpu.uid)) return null;
      const question = getQuizQuestion(gameState.questionIndex);
      return { answer: Math.random() > 0.3 ? question.answer : random(question.choices.length) };
    }
    case 'maze': {
      const { x, y } = gameState.positions[cpu.uid];
      const options = [
        ['up', x, y - 1], ['left', x - 1, y], ['right', x + 1, y], ['down', x, y + 1],
      ].filter(([, nextX, nextY]) => nextX >= 0 && nextX < gameState.width && nextY >= 0 && nextY < gameState.height && !gameState.walls.includes(nextY * gameState.width + nextX));
      options.sort((a, b) => Math.abs(a[1] - gameState.goal.x) + Math.abs(a[2] - gameState.goal.y) - (Math.abs(b[1] - gameState.goal.x) + Math.abs(b[2] - gameState.goal.y)));
      const move = options[0];
      return move ? { direction: move[0] } : null;
    }
    case 'battle': {
      if (gameState.turnUid !== cpu.uid) return null;
      const target = players.find((player) => player.uid !== cpu.uid);
      if (!target) return null;
      const used = new Set(gameState.shots[cpu.uid].filter((key) => key.startsWith(`${target.uid}:`)).map((key) => Number(key.split(':')[1])));
      const available = Array.from({ length: gameState.boardSize ** 2 }, (_, index) => index).filter((index) => !used.has(index));
      return available.length ? { targetUid: target.uid, index: available[random(available.length)] } : null;
    }
    case 'rally':
      return gameState.turnUid === cpu.uid ? { lane: random(3) } : null;
    case 'code':
      return gameState.turnUid === cpu.uid ? { guess: Array.from({ length: gameState.digits }, () => random(6)) } : null;
    default:
      return null;
  }
}
