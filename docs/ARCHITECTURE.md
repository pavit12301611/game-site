# Architecture

PSD Gaming v2 is a **local-first browser arcade**: zero backend, zero sign-up,
instant play. Everything runs from static files, so it deploys anywhere.

## Layers

```
index.html
src/main.js            → styles + app boot (+ last-resort error overlay)
src/app.js             → shell, hash router views (library / game page)
src/core/              → framework-free shared primitives
  dom.js                 h() builder, rng, shuffle, formatting
  store.js               prefs + stats (localStorage, memory fallback)
  sound.js               WebAudio bleeps, no audio files
  router.js              hash routes: #/ and #/game/<id>?mode=&diff=
src/games/registry.js  → the catalog: 1 import + 1 line per game
src/games/table.js     → session runner for turn-based games
src/games/*.js         → one file per game (logic + mount)
src/styles/            → tokens, base, shell, home, game, games
tests/                 → node:test over pure game logic (no DOM needed)
```

## The game contract

Each game module default-exports a definition:

```js
{
  id, name, tagline, genre, players, icon, hue,
  modes,            // [{ id: 'cpu', label: 'Vs CPU' }, ...]
  difficulties,     // [{ id, label }] or null
  howTo,            // string[] shown in the side panel
  mount(root, ctx)  // paint into root, return cleanup()
}
```

`ctx` carries `{ mode, difficulty, names, stats, sfx, toast, prefs }`.
`mount` must return a cleanup function (remove listeners, cancel timers/loops).

## Two ways to build a game

**1. Turn-based — use `createTable` (recommended).**
You supply pure logic + board painting; the table supplies the status bar,
CPU scheduling, restart, end overlay, stats and sounds:

```js
createTable(root, {
  gameId, mode, players, difficulty,
  setup(),                       // → state
  statusOf(state),               // → { text, turn }
  applyMove(state, move, control), // → { state, sound?, silent? }
  resultOf(state),               // → null | { winner, label, sub? }
  cpuMove(state, difficulty),    // → move
  renderBoard(el, state, api),   // paint; api.move(m), api.setState(s)
  busy(state)?,                  // true while animations settle (memory)
});
```

`control.defer(ms, fn)` schedules follow-up state changes that are cancelled
automatically on restart, destroy, or game over.

**2. Real-time / custom — own your `mount`.**
Canvas + `requestAnimationFrame` (snake, pong), DOM timers (whack, quiz,
minesweeper, 2048, codebreaker, rps). Keep any testable logic as exported
pure functions and cover them in `tests/`.

## State & stats

- No global framework store. Route state lives in the URL hash; player
  prefs and per-game stats live in `store.js` (localStorage).
- `stats.record(gameId, { winner, score })` — `winner` is `0 | 1 | 'draw' |
  null` (solo/unranked); `score` feeds the numeric `best` (higher = better).
- Time-based games store an inverted score (e.g. `3600 - seconds`) so "best"
  keeps working without special cases.

## Why local-first

The previous generation was server-authoritative on day one and paid for it
in complexity. v2 inverts that: the arcade is fully playable offline from a
static host, and online play returns later as a **network adapter** behind the
same game contract (see `docs/ROADMAP.md`) — games won't need rewrites.
