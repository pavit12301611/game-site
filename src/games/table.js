// createTable — the shared session runner for turn-based games.
// A game only supplies pure logic + board painting; the table supplies
// status bar, CPU scheduling, restart, end-of-game overlay, stats and sounds.
import { h, clear } from '../core/dom.js';
import { sfx } from '../core/sound.js';
import { stats } from '../core/store.js';

export function createTable(root, cfg) {
  let state = cfg.setup();
  let over = false;
  let thinking = false;
  let destroyed = false;
  let lastMove = null;
  let cpuTimer = null;
  let gen = 0;

  // Lets games schedule follow-up state changes (e.g. flip mismatched
  // cards back over). Cancelled automatically on restart/destroy/game-over.
  const control = {
    defer(ms, fn) {
      const g = gen;
      setTimeout(() => {
        if (!destroyed && g === gen && !over) fn(api);
      }, ms);
    },
  };

  const statusEl = h('div', { class: 'table-status', role: 'status', 'aria-live': 'polite' });
  const boardEl = h('div', { class: 'table-board' });
  const footEl = h('div', { class: 'table-foot' });
  const restartBtn = h('button', { class: 'btn btn-ghost btn-sm', onclick: () => restart() }, '↻ Restart');
  footEl.append(restartBtn);
  root.append(statusEl, boardEl, footEl);

  const isCpuTurn = () =>
    !over &&
    !thinking &&
    !cfg.busy?.(state) &&
    cfg.mode === 'cpu' &&
    statusOf(state).turn === (cfg.cpuSeat ?? 1);

  function statusOf(s) {
    if (over && state._result) return { text: state._result.label, turn: null };
    return cfg.statusOf(s);
  }

  const api = {
    move(m) {
      if (over || destroyed || thinking || cfg.busy?.(state)) return;
      if (cfg.mode === 'cpu' && statusOf(state).turn === (cfg.cpuSeat ?? 1)) return;
      doApply(m);
    },
    setState(next, move = lastMove) {
      if (destroyed) return;
      state = next;
      lastMove = move ?? null;
      render();
    },
    getState: () => state,
    get lastMove() {
      return lastMove;
    },
    get disabled() {
      return over || thinking;
    },
  };

  function doApply(m) {
    const out = cfg.applyMove(state, m, control);
    lastMove = m;
    state = out.state;
    if (!out.silent) sfx.play(out.sound || 'move');
    render();
  }

  function render() {
    if (destroyed) return;
    const result = cfg.resultOf(state);
    if (result && !over) return finish(result);

    const st = statusOf(state);
    clear(statusEl);
    if (thinking) {
      statusEl.append(
        h('span', { class: 'turn-dot cpu-thinking' }),
        h('span', { text: 'CPU is thinking…' }),
      );
    } else {
      const dot = st.turn === null ? null : h('span', { class: `turn-dot p${st.turn}` });
      statusEl.append(dot, h('span', { text: st.text }));
    }

    clear(boardEl);
    cfg.renderBoard(boardEl, state, api);

    clearTimeout(cpuTimer);
    cpuTimer = null;
    if (isCpuTurn()) {
      thinking = true;
      // Repaint the status right away so "thinking…" shows during the delay.
      clear(statusEl);
      statusEl.append(
        h('span', { class: 'turn-dot cpu-thinking' }),
        h('span', { text: 'CPU is thinking…' }),
      );
      cpuTimer = setTimeout(() => {
        if (destroyed || over) return;
        thinking = false;
        try {
          const m = cfg.cpuMove(state, cfg.difficulty);
          if (m !== null && m !== undefined) doApply(m);
          else render();
        } catch (err) {
          console.error('CPU move failed', err);
          render();
        }
      }, cfg.thinkingMs ?? 550);
    }
  }

  function finish(result) {
    over = true;
    thinking = false;
    clearTimeout(cpuTimer);
    cpuTimer = null;
    state = { ...state, _result: result };

    clear(statusEl);
    statusEl.append(h('span', { class: 'turn-dot done' }), h('span', { text: result.label }));
    clear(boardEl);
    cfg.renderBoard(boardEl, state, api);

    stats.record(cfg.gameId, { winner: result.winner });
    if (result.winner === 'draw') sfx.play('draw');
    else if (cfg.mode === 'cpu') sfx.play(result.winner === 0 ? 'win' : 'lose');
    else sfx.play('win');

    const winnerName = result.winner === 'draw' ? "It's a draw" : `${cfg.players[result.winner]} wins!`;
    const overlay = h(
      'div',
      { class: 'table-overlay' },
      h(
        'div',
        { class: 'result-card', role: 'dialog', 'aria-label': 'Game over' },
        h('div', { class: 'result-emoji', text: result.winner === 'draw' ? '🤝' : '🏆' }),
        h('h2', { text: winnerName }),
        result.sub ? h('p', { class: 'muted', text: result.sub }) : null,
        h(
          'div',
          { class: 'result-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => restart() }, 'Play again'),
        ),
      ),
    );
    root.append(overlay);
    overlay.querySelector('button')?.focus({ preventScroll: true });
  }

  function restart() {
    clearTimeout(cpuTimer);
    cpuTimer = null;
    gen += 1;
    root.querySelector('.table-overlay')?.remove();
    state = cfg.setup();
    over = false;
    thinking = false;
    lastMove = null;
    sfx.play('click');
    render();
  }

  function destroy() {
    destroyed = true;
    gen += 1;
    clearTimeout(cpuTimer);
    cpuTimer = null;
  }

  render();
  return { destroy, restart, getState: api.getState };
}
