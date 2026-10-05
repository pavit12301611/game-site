/**
 * The quiz engine, after every themed quiz got its own curated bank.
 *
 * Two things changed shape here and both are guarded below: the engine deals whole items into the
 * state (so the trusted backend can keep the answer key server-side), and the browser only bundles
 * the warm-up subset while online rooms are dealt from the full bank.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as quiz from '../../src/engines/quiz.js';
import { QUIZ_BANKS, QUIZ_BANK_BY_GAME, bankForGame, onlineItemsForGame, practiceItemsForGame } from '../../shared/content/quiz-banks.js';
import { PRACTICE_BANKS, practiceBankFor } from '../../shared/content/quiz-practice.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const three = [...two, { uid: 'p3', name: 'Three' }];
const trivia = GAMES.find((game) => game.id === 'retro-trivia');
const quizGames = GAMES.filter((game) => game.engine === 'quiz');

function start(game = trivia, players = two, seed = 'quiz-seed', deps) {
  return quiz.createInitialState(game, players, seed, deps);
}

/** The item the engine is currently asking about. */
function currentItem(state) {
  return state.items[state.questionIndex];
}

test('every themed quiz has its own, well-formed bank', () => {
  assert.equal(Object.keys(QUIZ_BANKS).length, 10, 'one bank per themed quiz');
  assert.deepEqual(Object.keys(QUIZ_BANKS).sort(), quizGames.map((game) => game.id).sort(), 'the banks cover exactly the catalog quiz games');
  for (const game of quizGames) {
    const bank = bankForGame(game.id);
    assert.ok(bank.length >= game.options.rounds, `${game.id} needs at least ${game.options.rounds} questions, found ${bank.length}`);
    assert.ok(new Set(bank.map((item) => item.id)).size === bank.length, `${game.id} has duplicate item ids`);
    for (const item of bank) {
      assert.ok(item.prompt, `${item.id} has a prompt`);
      assert.ok(item.choices.length >= 2, `${item.id} offers at least two answers`);
      assert.ok(item.answer >= 0 && item.answer < item.choices.length, `${item.id} points at a real choice`);
      assert.equal(new Set(item.choices).size, item.choices.length, `${item.id} has no duplicate choices`);
      assert.ok(['trivia', 'emoji', 'scramble', 'riddle', 'number'].includes(item.kind), `${item.id} has a known kind`);
    }
  }
});

test('the question content matches the game title it belongs to', () => {
  for (const game of quizGames) {
    const kinds = new Set(bankForGame(game.id).map((item) => item.kind));
    if (game.id === 'emoji-decode') assert.deepEqual([...kinds], ['emoji'], 'Emoji Decode only asks emoji clues');
    if (game.id === 'word-scramble') assert.deepEqual([...kinds], ['scramble'], 'Word Scramble only asks scrambled words');
    if (game.id === 'number-chase') assert.deepEqual([...kinds], ['number'], 'Number Chase only asks number puzzles');
    if (game.id === 'brain-busters' || game.id === 'eight-bit-riddles') assert.deepEqual([...kinds], ['riddle'], `${game.id} only asks riddles`);
  }
  const emoji = bankForGame('emoji-decode');
  for (const item of emoji) {
    assert.ok(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(item.clue || ''), `${item.id} shows an actual emoji clue`);
    assert.ok(item.label, `${item.id} carries a plain-text label for screen readers`);
  }
  for (const item of bankForGame('word-scramble')) {
    assert.ok(/^[A-Z]( [A-Z])*$/.test(item.clue || ''), `${item.id} shows letter-by-letter scrambled text`);
  }
});

test('the browser only receives the warm-up subset, and online decks exclude it', () => {
  for (const game of quizGames) {
    const shipped = PRACTICE_BANKS[game.id] ?? [];
    assert.equal(shipped.length, 6, `${game.id} ships six warm-up questions`);
    assert.ok(shipped.length >= game.options.rounds, `${game.id} can deal a full practice round from the shipped subset`);
    const shippedIds = new Set(shipped.map((item) => item.id));
    assert.deepEqual(shipped.map((item) => item.id), practiceItemsForGame(game.id).map((item) => item.id), `${game.id} practice ids match the generator`);
    for (const item of onlineItemsForGame(game.id)) {
      assert.equal(shippedIds.has(item.id), false, `${item.id} is shipped to the browser and must not be asked online`);
    }
    assert.ok(onlineItemsForGame(game.id).length >= game.options.rounds, `${game.id} has enough online-only questions`);
  }
  assert.deepEqual(Object.keys(QUIZ_BANK_BY_GAME).sort(), quizGames.map((game) => game.id).sort());
});

test('the engine deals whole items and publishes only the question, never the answer', () => {
  const state = start();
  assert.equal(state.rounds, state.deck.length, 'rounds and deck agree');
  assert.equal(state.deck.length, trivia.options.rounds);
  assert.equal(state.questionIndex, 0);
  assert.deepEqual(state.answeredUids, []);
  assert.equal(quiz.publicQuestionFor(currentItem(state)).prompt, state.question.prompt);
  assert.equal(Object.hasOwn(state.question, 'answer'), false, 'the public question has no answer field');
  assert.equal(Object.hasOwn(state.question, 'id'), false, 'the public question has no item id to look up');
  assert.deepEqual(state.question.choices, currentItem(state).choices);
});

test('two games never deal the same warm-up order twice in one seed-set', () => {
  const orders = new Set(quizGames.map((game) => start(game, two, 'deck-order').deck.join(',')));
  assert.equal(orders.size, quizGames.length, 'each game deals its own deck');
});

test('answers stay hidden until everyone has answered', () => {
  let state = start(trivia, three);
  state = quiz.applyAction(trivia, state, 'p1', { answer: 0 }, three);
  assert.deepEqual(state.answers, { p1: 0 });
  assert.deepEqual(state.answeredUids, ['p1']);
  assert.equal(state.lastRound, null, 'nothing is revealed yet');
  state = quiz.applyAction(trivia, state, 'p2', { answer: 1 }, three);
  assert.equal(state.lastRound, null, 'still waiting for the third player');
  state = quiz.applyAction(trivia, state, 'p3', { answer: 2 }, three);
  assert.equal(state.lastRound.correct, currentItem(state).answer);
  assert.deepEqual(state.lastRound.answers, { p1: 0, p2: 1, p3: 2 });
});

test('a correct answer scores, a wrong one does not', () => {
  let state = start();
  const correct = currentItem(state).answer;
  state = quiz.applyAction(trivia, state, 'p1', { answer: correct }, two);
  state = quiz.applyAction(trivia, state, 'p2', { answer: correct === 0 ? 1 : 0 }, two);
  assert.equal(state.scores.p1, 1);
  assert.equal(state.scores.p2, 0);
});

test('next question advances the round and clears the answers', () => {
  let state = start();
  state = quiz.applyAction(trivia, state, 'p1', { answer: 0 }, two);
  state = quiz.applyAction(trivia, state, 'p2', { answer: 0 }, two);
  state = quiz.applyAction(trivia, state, 'p1', { type: 'next' }, two);
  assert.equal(state.questionIndex, 1);
  assert.deepEqual(state.answers, {});
  assert.deepEqual(state.answeredUids, []);
  assert.equal(state.lastRound, null);
  assert.equal(state.question.prompt, quiz.publicQuestionFor(state.items[1]).prompt);
});

test('the last round finishes the quiz for the highest scorer', () => {
  let state = start();
  for (let round = 0; round < trivia.options.rounds; round += 1) {
    const item = currentItem(state);
    const wrong = (item.answer + 1) % item.choices.length;
    state = quiz.applyAction(trivia, state, 'p1', { answer: item.answer }, two);
    state = quiz.applyAction(trivia, state, 'p2', { answer: wrong }, two);
    state = quiz.applyAction(trivia, state, 'p1', { type: 'next' }, two);
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.scores.p1, trivia.options.rounds);
});

test('an all-correct quiz is a draw', () => {
  let state = start();
  for (let round = 0; round < trivia.options.rounds; round += 1) {
    const item = currentItem(state);
    state = quiz.applyAction(trivia, state, 'p1', { answer: item.answer }, two);
    state = quiz.applyAction(trivia, state, 'p2', { answer: item.answer }, two);
    state = quiz.applyAction(trivia, state, 'p1', { type: 'next' }, two);
  }
  assert.equal(state.result, 'draw');
  assert.equal(state.winnerUid, null);
});

test('illegal quiz moves are refused with a readable reason', () => {
  const state = start();
  assert.throws(() => quiz.applyAction(trivia, state, 'p1', { type: 'next' }, two), /wait for everyone/i, 'advancing too early');
  assert.throws(() => quiz.applyAction(trivia, state, 'p1', { answer: 99 }, two), /choose one of the answers/i);
  assert.throws(() => quiz.applyAction(trivia, state, 'p1', { answer: -1 }, two), /choose one of the answers/i);
  const answered = quiz.applyAction(trivia, state, 'p1', { answer: 0 }, two);
  assert.throws(() => quiz.applyAction(trivia, answered, 'p1', { answer: 1 }, two), /already answered/i);
});

test('a host that passes the online-only bank deals questions the browser never saw', () => {
  // The backend deals from onlineItemsForGame(): the full bank minus the items shipped to the
  // browser for practice. That is what keeps an online answer out of the page source.
  const serverBank = onlineItemsForGame('retro-trivia');
  const state = start(trivia, two, 'server-deck', { bank: serverBank });
  const shipped = new Set(practiceBankFor('retro-trivia').map((item) => item.id));
  assert.equal(state.items.length, trivia.options.rounds);
  for (const item of state.items) {
    assert.equal(shipped.has(item.id), false, `${item.id} is a warm-up item and must not be dealt online`);
  }
});
