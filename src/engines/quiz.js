/**
 * quiz engine — everyone answers the same question, then anyone advances to the next round.
 * Games: Retro Trivia, Emoji Decode, Arcade Facts, Pixel Pop Quiz, Movie Mayhem, Word Scramble,
 * Number Chase, Brain Busters, 8-Bit Riddles, Retro Rewind.
 *
 * Two rules keep the answer key out of other players' browsers:
 *
 * - the engine deals a **deck of whole items** (prompt, clue, choices and answer) into the state,
 *   and the trusted backend keeps that state in a server-only document. The public room document
 *   only ever carries `question` — the current prompt, clue and choices, without the answer.
 * - the browser only ever bundles the warm-up subset (`shared/content/quiz-practice.js`) for local
 *   practice against the CPU. Online rooms are dealt by the backend from the full bank minus that
 *   subset, so a player cannot look up an online answer in their own copy of the bundle.
 *
 * Round length always matches the deck: `state.rounds === state.deck.length`.
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */
/** @typedef {{ id: string, kind: 'emoji'|'number'|'riddle'|'scramble'|'trivia', prompt: string, clue?: string, label?: string, choices: string[], answer: number, note?: string }} QuizItem */

import { practiceBankFor } from '../../shared/content/quiz-practice.js';
import { quizDeck } from '../../shared/content/quiz-banks.js';
import { assertPlaying, finishByScore, newBase, scoresFor, shuffled } from './shared.js';

/**
 * The public half of one item: everything a player needs to answer, and nothing that gives the
 * answer away. The item id is deliberately absent — the id would let a client match the question
 * against a shipped bank.
 * @param {QuizItem} item
 * @returns {{ prompt: string, clue: string, label: string, kind: string, choices: string[], note: string }}
 */
export function publicQuestionFor(item) {
  return {
    prompt: item.prompt,
    clue: item.clue ?? '',
    label: item.label ?? '',
    kind: item.kind,
    choices: [...item.choices],
    note: item.note ?? '',
  };
}

/**
 * @param {Game} game
 * @param {Player[]} players
 * @param {string} [seed]
 * @param {{ bank?: QuizItem[] }} [deps] `bank` lets the trusted backend deal from the server-only
 *   bank (shared/content/quiz-banks.js, minus the warm-up items); the browser and the tests fall
 *   back to the shipped warm-up subset.
 * @returns {GameState}
 */
export function createInitialState(game, players, seed = 'psd', deps = {}) {
  const ids = players.map((player) => player.uid);
  const bank = deps.bank ?? practiceBankFor(game.id);
  const rounds = Math.max(1, Math.min(Number(game.options.rounds) || 5, bank.length));
  const deck = quizDeck(game.id, seed, rounds, { shuffle: (values, deckSeed) => shuffled(values, deckSeed), bank });
  const items = deck.map((id) => bank.find((item) => item.id === id)).filter(Boolean);
  const first = items[0];
  if (!first) throw new Error('This quiz has no questions to deal. Add items to its bank first.');
  return {
    ...newBase(players),
    turnUid: null,
    deck,
    items,
    questionIndex: 0,
    question: publicQuestionFor(first),
    answers: {},
    answeredUids: [],
    scores: scoresFor(ids),
    rounds: items.length,
    lastRound: null,
  };
}

/**
 * @param {Game} game
 * @param {GameState} state
 * @param {string} uid
 * @param {Action} action
 * @param {Player[]} players
 * @returns {GameState}
 */
export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  const ids = players.map((player) => player.uid);
  if (action.type === 'next') {
    const allAnswered = ids.every((playerUid) => state.answeredUids.includes(playerUid));
    if (!allAnswered) throw new Error('Wait for everyone to answer first.');
    if (state.questionIndex + 1 >= state.rounds) {
      finishByScore(state, players, state.scores);
      return state;
    }
    state.questionIndex += 1;
    state.question = publicQuestionFor(state.items[state.questionIndex]);
    state.answers = {};
    state.answeredUids = [];
    state.lastRound = null;
    state.moves += 1;
    return state;
  }
  if (state.answeredUids.includes(uid)) throw new Error('You have already answered this round.');
  const item = state.items[state.questionIndex];
  if (!item) throw new Error('This round has no question left.');
  const answer = Number(action.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer >= item.choices.length) throw new Error('Choose one of the answers.');
  const answers = { ...state.answers, [uid]: answer };
  state.answers = answers;
  state.answeredUids = [...state.answeredUids, uid];
  state.moves += 1;
  if (ids.every((playerUid) => answers[playerUid] !== undefined)) {
    const scores = { ...state.scores };
    for (const player of players) if (answers[player.uid] === item.answer) scores[player.uid] = (scores[player.uid] ?? 0) + 1;
    state.scores = scores;
    state.lastRound = {
      answers,
      correct: item.answer,
      questionIndex: state.questionIndex,
      choices: [...item.choices],
      explanation: item.note ?? '',
    };
  }
  return state;
}
