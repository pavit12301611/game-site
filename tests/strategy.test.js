import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { winnerOf as tttWin, cpuPick as tttCpu } from '../src/games/tictactoe.js';
import {
  newGrid, legalCols, dropRow, winnerOf as c4Win, cpuPick as c4Cpu,
} from '../src/games/connect4.js';
import {
  newState as dotsNew, applyEdge, sidesOf, cpuPick as dotsCpu, N,
} from '../src/games/dotsboxes.js';

describe('tic-tac-toe', () => {
  it('detects rows, diagonals and draws', () => {
    assert.deepEqual(tttWin([0, 0, 0, -1, -1, -1, -1, -1, -1]), { winner: 0, line: [0, 1, 2] });
    assert.deepEqual(tttWin([1, -1, -1, -1, 1, -1, -1, -1, 1]).winner, 1);
    assert.equal(tttWin([0, 1, 0, 0, 1, 1, 1, 0, 0]).winner, 'draw');
    assert.equal(tttWin(Array(9).fill(-1)).winner, null);
  });

  it('hard CPU takes wins and blocks losses', () => {
    assert.equal(tttCpu([0, 0, -1, -1, 1, -1, -1, -1, -1], 0, 'hard'), 2);
    assert.equal(tttCpu([1, 1, -1, -1, 0, -1, -1, -1, -1], 0, 'hard'), 2);
    const first = tttCpu(Array(9).fill(-1), 0, 'hard');
    assert.ok(first >= 0 && first < 9);
  });

  it('easy CPU always returns a legal move', () => {
    for (let i = 0; i < 25; i++) {
      const m = tttCpu([0, -1, -1, -1, -1, -1, -1, -1, -1], 1, 'easy');
      assert.ok(m >= 1 && m < 9);
    }
  });
});

describe('connect four', () => {
  it('drops stack from the bottom', () => {
    const g = newGrid();
    assert.equal(dropRow(g, 3), 5);
    g[5][3] = 0;
    assert.equal(dropRow(g, 3), 4);
  });

  it('detects horizontal, vertical and diagonal wins', () => {
    const horiz = newGrid();
    horiz[5][0] = 0; horiz[5][1] = 0; horiz[5][2] = 0; horiz[5][3] = 0;
    assert.equal(c4Win(horiz).winner, 0);

    const vert = newGrid();
    vert[5][2] = 1; vert[4][2] = 1; vert[3][2] = 1; vert[2][2] = 1;
    assert.equal(c4Win(vert).winner, 1);

    const diag = newGrid();
    diag[5][0] = 0; diag[4][1] = 0; diag[3][2] = 0; diag[2][3] = 0;
    assert.equal(c4Win(diag).winner, 0);
    assert.equal(c4Win(newGrid()).winner, null);
  });

  it('medium CPU takes immediate wins and blocks', () => {
    const win = newGrid();
    win[5][0] = 0; win[5][1] = 0; win[5][2] = 0;
    assert.equal(c4Cpu(win, 0, 'medium'), 3);
    const block = newGrid();
    block[5][0] = 1; block[5][1] = 1; block[5][2] = 1;
    assert.equal(c4Cpu(block, 0, 'medium'), 3);
  });

  it('hard CPU returns a legal column', () => {
    const g = newGrid();
    g[5][3] = 0;
    g[5][2] = 1;
    const m = c4Cpu(g, 0, 'hard');
    assert.ok(legalCols(g).includes(m));
  });
});

describe('dots & boxes', () => {
  it('claims a box on the 4th side and moves again', () => {
    let s = dotsNew();
    s = applyEdge(s, { o: 'h', r: 0, c: 0 });
    s = applyEdge(s, { o: 'v', r: 0, c: 0 });
    s = applyEdge(s, { o: 'v', r: 0, c: 1 });
    assert.equal(sidesOf(s, 0, 0), 3);
    const turn = s.turn;
    s = applyEdge(s, { o: 'h', r: 1, c: 0 });
    assert.equal(s.boxes[0][0], turn);
    assert.equal(s.scores[turn], 1);
    assert.equal(s.turn, turn); // extra move
  });

  it('rejects re-drawing an edge', () => {
    const s = dotsNew();
    const once = applyEdge(s, { o: 'h', r: 0, c: 0 });
    assert.equal(applyEdge(once, { o: 'h', r: 0, c: 0 }), null);
  });

  it('medium CPU completes an available box', () => {
    let s = dotsNew();
    s = applyEdge(s, { o: 'h', r: 2, c: 2 });
    s = applyEdge(s, { o: 'v', r: 2, c: 2 });
    s = applyEdge(s, { o: 'v', r: 2, c: 3 });
    const m = dotsCpu(s, 'medium');
    assert.deepEqual(m, { o: 'h', r: 3, c: 2 });
  });

  it('board is 4x4', () => {
    assert.equal(N, 4);
    assert.equal(dotsNew().boxes.flat().length, 16);
  });
});
