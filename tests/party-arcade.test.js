import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decide, MOVES } from '../src/games/rps.js';
import { nextHead, outOfBounds, hitsSelf, SPEEDS } from '../src/games/snake.js';
import { CPU } from '../src/games/pong.js';
import { LEVELS as WHACK_LEVELS, DURATION_S } from '../src/games/whack.js';
import { TIME as QUIZ_TIME } from '../src/games/quiz.js';
import { LEVELS as MS_LEVELS } from '../src/games/minesweeper.js';
import { LEVELS as CB_LEVELS } from '../src/games/codebreaker.js';

describe('rock paper scissors', () => {
  it('judges the full matrix', () => {
    assert.equal(decide('rock', 'scissors'), 0);
    assert.equal(decide('scissors', 'paper'), 0);
    assert.equal(decide('paper', 'rock'), 0);
    assert.equal(decide('scissors', 'rock'), 1);
    assert.equal(decide('rock', 'paper'), 1);
    assert.equal(decide('paper', 'scissors'), 1);
    for (const m of MOVES) assert.equal(decide(m, m), 'draw');
  });
});

describe('snake helpers', () => {
  it('steps, bounds-checks and self-collides', () => {
    assert.deepEqual(nextHead({ x: 1, y: 1 }, { x: 1, y: 0 }), { x: 2, y: 1 });
    assert.equal(outOfBounds({ x: -1, y: 0 }), true);
    assert.equal(outOfBounds({ x: 0, y: 0 }), false);
    assert.equal(hitsSelf([{ x: 1, y: 1 }, { x: 2, y: 1 }], { x: 2, y: 1 }), true);
    assert.equal(hitsSelf([{ x: 1, y: 1 }], { x: 0, y: 0 }), false);
  });

  it('higher difficulty means faster snake', () => {
    assert.ok(SPEEDS.easy > SPEEDS.medium && SPEEDS.medium > SPEEDS.hard);
  });
});

describe('difficulty tables', () => {
  it('pong CPU gets faster and sharper', () => {
    assert.ok(CPU.easy.speed < CPU.medium.speed && CPU.medium.speed < CPU.hard.speed);
    assert.ok(CPU.easy.error > CPU.medium.error && CPU.medium.error > CPU.hard.error);
  });

  it('whack levels speed up with a fixed 30s round', () => {
    assert.equal(DURATION_S, 30);
    assert.ok(WHACK_LEVELS.easy.spawnMs > WHACK_LEVELS.hard.spawnMs);
  });

  it('quiz timers tighten', () => {
    assert.ok(QUIZ_TIME.easy > QUIZ_TIME.medium && QUIZ_TIME.medium > QUIZ_TIME.hard);
  });

  it('minesweeper grows by level', () => {
    assert.ok(MS_LEVELS.easy.mines < MS_LEVELS.medium.mines);
    assert.ok(MS_LEVELS.medium.mines < MS_LEVELS.hard.mines);
  });

  it('codebreaker hard adds a peg', () => {
    assert.ok(CB_LEVELS.hard.pegs > CB_LEVELS.easy.pegs);
  });
});
