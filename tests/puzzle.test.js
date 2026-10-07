import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck } from '../src/games/memory.js';
import { placeMines, countsFor, neighbors } from '../src/games/minesweeper.js';
import { slideRowLeft, moveDir, hasMoves } from '../src/games/g2048.js';
import { scoreGuess, randomSecret } from '../src/games/codebreaker.js';
import { BANK, pickQuestions } from '../src/games/quiz.js';
import { seededRng } from '../src/core/dom.js';

describe('memory', () => {
  it('builds a shuffled deck with exact pairs', () => {
    const deck = buildDeck(8, seededRng(7));
    assert.equal(deck.length, 16);
    const counts = {};
    for (const c of deck) counts[c.icon] = (counts[c.icon] || 0) + 1;
    assert.ok(Object.values(counts).every((n) => n === 2));
  });
});

describe('minesweeper', () => {
  it('places the right count and keeps the safe zone clear', () => {
    const mines = placeMines(9, 9, 10, 40, seededRng(3));
    assert.equal(mines.size, 10);
    const banned = new Set([40, ...neighbors(9, 9, 40)]);
    for (const m of mines) assert.ok(!banned.has(m));
  });

  it('computes neighbor counts correctly', () => {
    const counts = countsFor(3, 3, new Set([4]));
    assert.equal(counts[4], -1);
    assert.ok([0, 1, 2, 3, 5, 6, 7, 8].every((i) => counts[i] === 1));
  });
});

describe('2048', () => {
  it('slides and merges rows left', () => {
    assert.deepEqual(slideRowLeft([2, 2, 0, 0]), { row: [4, 0, 0, 0], score: 4 });
    assert.deepEqual(slideRowLeft([2, 2, 2, 2]), { row: [4, 4, 0, 0], score: 8 });
    assert.deepEqual(slideRowLeft([4, 4, 8, 8]), { row: [8, 16, 0, 0], score: 24 });
    assert.deepEqual(slideRowLeft([2, 0, 2, 4]), { row: [4, 4, 0, 0], score: 4 });
  });

  it('moves in all directions and reports movement', () => {
    const g = [
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const up = moveDir(g, 'up');
    assert.equal(up.moved, true); // the stacked 2s merge
    assert.deepEqual(up.grid[0], [4, 0, 0, 0]);
    const down = moveDir(g, 'down');
    assert.equal(down.moved, true);
    assert.deepEqual(down.grid[3], [4, 0, 0, 0]);
    const right = moveDir(g, 'right');
    assert.equal(right.moved, true);
  });

  it('detects dead boards', () => {
    const dead = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    assert.equal(hasMoves(dead), false);
    const alive = dead.map((r) => r.slice());
    alive[0][0] = 0;
    assert.equal(hasMoves(alive), true);
  });
});

describe('codebreaker', () => {
  it('scores bulls and cows', () => {
    assert.deepEqual(scoreGuess([0, 1, 2, 3], [0, 1, 2, 3]), { bulls: 4, cows: 0 });
    assert.deepEqual(scoreGuess([0, 1, 2, 3], [3, 2, 1, 0]), { bulls: 0, cows: 4 });
    assert.deepEqual(scoreGuess([0, 0, 1, 1], [0, 1, 0, 1]), { bulls: 2, cows: 2 });
    assert.deepEqual(scoreGuess([0, 1, 2, 3], [4, 4, 4, 4]), { bulls: 0, cows: 0 });
  });

  it('generates valid secrets', () => {
    const s = randomSecret(5, 8, seededRng(11));
    assert.equal(s.length, 5);
    assert.ok(s.every((v) => v >= 0 && v < 8));
  });
});

describe('quiz', () => {
  it('bank entries are valid', () => {
    assert.ok(BANK.length >= 30);
    for (const q of BANK) {
      assert.ok(q.q && q.q.length > 5);
      assert.equal(q.o.length, 4);
      assert.ok(q.a >= 0 && q.a < 4);
      assert.ok(new Set(q.o).size === 4, 'options must be unique');
    }
  });

  it('picks unique questions', () => {
    const picked = pickQuestions(BANK, 10, seededRng(5));
    assert.equal(picked.length, 10);
    assert.equal(new Set(picked.map((q) => q.q)).size, 10);
  });
});
