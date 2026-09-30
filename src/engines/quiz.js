/**
 * quiz engine — everyone answers the same question, then anyone advances to the next round.
 * Games: Retro Trivia, Emoji Decode, Arcade Facts, Pixel Pop Quiz, Movie Mayhem, Word Scramble,
 * Number Chase, Brain Busters, 8-Bit Riddles, Retro Rewind.
 *
 * The questions live here (next to the engine that reads them) so the catalog stays a list of
 * games. Moving them to Firestore is backlog item 77; `getQuizQuestion` is the seam to replace.
 */
import { assertPlaying, finishByScore, newBase, scoresFor } from './shared.js';

export const QUIZ_QUESTIONS = [
  { prompt: 'Which classic game asks you to clear lines by fitting falling blocks?', choices: ['Tetris', 'Pong', 'Asteroids', 'Frogger'], answer: 0 },
  { prompt: 'In Pac-Man, what does the player collect through the maze?', choices: ['Rings', 'Pellets', 'Stars', 'Keys'], answer: 1 },
  { prompt: 'Which game is famous for two paddles and a bouncing square ball?', choices: ['Pong', 'Snake', 'Breakout', 'Space Invaders'], answer: 0 },
  { prompt: 'What does a chess knight move look like?', choices: ['A straight line', 'An L shape', 'A circle', 'A diagonal only'], answer: 1 },
  { prompt: 'Which animal is the hero of the classic game Frogger?', choices: ['A turtle', 'A rabbit', 'A frog', 'A duck'], answer: 2 },
  { prompt: 'In Space Invaders, what are you defending Earth from?', choices: ['Aliens', 'Pirates', 'Robots', 'Asteroids'], answer: 0 },
  { prompt: 'Which handheld console made its debut in 1989?', choices: ['Game Boy', 'PSP', 'Switch', 'Steam Deck'], answer: 0 },
  { prompt: 'In a standard deck, how many suits are there?', choices: ['Two', 'Three', 'Four', 'Five'], answer: 2 },
  { prompt: 'What is the usual goal in a game of Breakout?', choices: ['Catch a ball', 'Clear all the bricks', 'Find a hidden word', 'Race a car'], answer: 1 },
  { prompt: 'Which color is NOT on a standard traffic light?', choices: ['Red', 'Amber', 'Green', 'Purple'], answer: 3 },
];

/** @param {number} index @returns {{ prompt: string, choices: string[], answer: number }} */
export function getQuizQuestion(index) {
  return QUIZ_QUESTIONS[index % QUIZ_QUESTIONS.length];
}

export function createInitialState(game, players) {
  const ids = players.map((player) => player.uid);
  return {
    ...newBase(players),
    turnUid: null,
    questionIndex: 0,
    answers: {},
    scores: scoresFor(ids),
    rounds: game.options.rounds,
    lastRound: null,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  const ids = players.map((player) => player.uid);
  if (action.type === 'next') {
    const allAnswered = ids.every((playerUid) => Object.hasOwn(state.answers, playerUid));
    if (!allAnswered) throw new Error('Wait for everyone to answer first.');
    if (state.questionIndex + 1 >= state.rounds) {
      finishByScore(state, players, state.scores);
      return state;
    }
    state.questionIndex += 1;
    state.answers = {};
    state.lastRound = null;
    return state;
  }
  if (Object.hasOwn(state.answers, uid)) throw new Error('You have already answered this round.');
  const question = getQuizQuestion(state.questionIndex);
  const answer = Number(action.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer >= question.choices.length) throw new Error('Choose one of the answers.');
  const answers = { ...state.answers, [uid]: answer };
  state.answers = answers;
  state.moves += 1;
  if (ids.every((playerUid) => Object.hasOwn(answers, playerUid))) {
    const scores = { ...state.scores };
    for (const player of players) if (answers[player.uid] === question.answer) scores[player.uid] = (scores[player.uid] ?? 0) + 1;
    state.scores = scores;
    state.lastRound = { answers, correct: question.answer, questionIndex: state.questionIndex };
  }
  return state;
}
