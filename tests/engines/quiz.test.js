import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as quiz from '../../src/engines/quiz.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const three = [...two, { uid: 'p3', name: 'Three' }];
const trivia = GAMES.find((game) => game.id === 'retro-trivia');

function start(players = two) {
  return quiz.createInitialState(trivia, players);
}

test('the question bank is well formed and wraps around', () => {
  assert.ok(quiz.QUIZ_QUESTIONS.length >= 5, 'enough questions for the longest quiz');
  for (const question of quiz.QUIZ_QUESTIONS) {
    assert.ok(question.prompt, 'every question has a prompt');
    assert.ok(question.choices.length >= 2, 'every question offers at least two answers');
    assert.ok(question.answer >= 0 && question.answer < question.choices.length, 'the answer points at a real choice');
  }
  assert.equal(quiz.getQuizQuestion(0).prompt, quiz.QUIZ_QUESTIONS[0].prompt);
  assert.equal(quiz.getQuizQuestion(quiz.QUIZ_QUESTIONS.length).prompt, quiz.QUIZ_QUESTIONS[0].prompt, 'the bank repeats');
});

test('a quiz starts with nobody having answered and no turns', () => {
  const state = start();
  assert.equal(state.turnUid, null);
  assert.equal(state.questionIndex, 0);
  assert.deepEqual(state.answers, {});
  assert.equal(state.rounds, 5);
  assert.deepEqual(state.scores, { p1: 0, p2: 0 });
});

test('answers stay hidden until everyone has answered', () => {
  let state = start(three);
  state = quiz.applyAction(trivia, state, 'p1', { answer: 0 }, three);
  assert.deepEqual(state.answers, { p1: 0 });
  assert.equal(state.lastRound, null, 'nothing is revealed yet');
  state = quiz.applyAction(trivia, state, 'p2', { answer: 1 }, three);
  assert.equal(state.lastRound, null, 'still waiting for the third player');
  state = quiz.applyAction(trivia, state, 'p3', { answer: 2 }, three);
  assert.equal(state.lastRound.correct, quiz.getQuizQuestion(0).answer);
  assert.deepEqual(state.lastRound.answers, { p1: 0, p2: 1, p3: 2 });
});

test('a correct answer scores, a wrong one does not', () => {
  let state = start();
  const correct = quiz.getQuizQuestion(0).answer;
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
  assert.equal(state.lastRound, null);
});

test('the last round finishes the quiz for the highest scorer', () => {
  let state = start();
  for (let round = 0; round < 5; round += 1) {
    const correct = quiz.getQuizQuestion(state.questionIndex).answer;
    const wrong = (correct + 1) % quiz.getQuizQuestion(state.questionIndex).choices.length;
    state = quiz.applyAction(trivia, state, 'p1', { answer: correct }, two);
    state = quiz.applyAction(trivia, state, 'p2', { answer: wrong }, two);
    state = quiz.applyAction(trivia, state, 'p1', { type: 'next' }, two);
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.scores.p1, 5);
});

test('an all-correct quiz is a draw', () => {
  let state = start();
  for (let round = 0; round < 5; round += 1) {
    const correct = quiz.getQuizQuestion(state.questionIndex).answer;
    state = quiz.applyAction(trivia, state, 'p1', { answer: correct }, two);
    state = quiz.applyAction(trivia, state, 'p2', { answer: correct }, two);
    state = quiz.applyAction(trivia, state, 'p1', { type: 'next' }, two);
  }
  assert.equal(state.result, 'draw');
  assert.equal(state.winnerUid, null);
});

test('illegal quiz moves are refused with a readable reason', () => {
  let state = start();
  assert.throws(() => quiz.applyAction(trivia, state, 'p1', { type: 'next' }, two), /wait for everyone/i, 'advancing too early');
  assert.throws(() => quiz.applyAction(trivia, state, 'p1', { answer: 99 }, two), /choose one of the answers/i);
  assert.throws(() => quiz.applyAction(trivia, state, 'p1', { answer: -1 }, two), /choose one of the answers/i);
  state = quiz.applyAction(trivia, state, 'p1', { answer: 0 }, two);
  assert.throws(() => quiz.applyAction(trivia, state, 'p1', { answer: 1 }, two), /already answered/i);
});
