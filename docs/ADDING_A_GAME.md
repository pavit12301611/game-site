# Adding a game (15 minutes)

Every game is **one file**. The catalog, cards, filters, game page, stats and
side panel all read from it — there is no other wiring.

## 1. Copy the template

Create `src/games/mygame.js`:

```js
import { h } from '../core/dom.js';
import { createTable } from './table.js';

// --- pure logic (export anything you want tested) ---
export function winnerOf(state) { /* ... */ }
export function cpuPick(state, difficulty) { /* ... */ }

export default {
  id: 'mygame',              // unique, URL-safe
  name: 'My Game',
  tagline: 'One catchy line.',
  genre: 'Strategy',         // Strategy | Puzzle | Arcade | Party | Trivia (or a new one)
  players: 'both',           // solo | 2p | both
  icon: '🎯',                // card emoji
  hue: 220,                  // card accent 0-360
  modes: [
    { id: 'cpu', label: 'Vs CPU' },
    { id: 'local', label: '2 Players' },
  ],
  difficulties: [            // or null for no level picker
    { id: 'easy', label: 'Chill' },
    { id: 'medium', label: 'Sharp' },
    { id: 'hard', label: 'Ruthless' },
  ],
  howTo: [
    'Rule one.',
    'Rule two.',
    'Rule three.',
  ],
  mount(root, ctx) {
    const players = ctx.mode === 'cpu' ? [ctx.names[0], 'CPU'] : ctx.names;
    const table = createTable(root, {
      gameId: 'mygame',
      mode: ctx.mode,
      players,
      difficulty: ctx.difficulty,
      setup: () => ({ /* initial state */ turn: 0 }),
      statusOf: (s) => ({ text: `${players[s.turn]}'s turn`, turn: s.turn }),
      applyMove: (s, move) => ({ state: s }), // + { sound } or { silent: true }
      resultOf: (s) => null,                  // or { winner: 0|1|'draw', label }
      cpuMove: (s, d) => cpuPick(s, d),
      renderBoard: (el, s, api) => {
        // paint with h(); call api.move(m) on clicks
      },
    });
    return () => table.destroy();
  },
};
```

For real-time games (canvas, timers), skip `createTable` and own `mount`
entirely — see `snake.js` / `whack.js`. Always return a cleanup function.

## 2. Register it

In `src/games/registry.js` add one import and one line in `DEFS`.

## 3. Style it

Add board styles to `src/styles/games.css`. Reuse `.table-status`,
`.pill`, `.btn`, `.result-card` where you can.

## 4. Test the logic

Export pure functions (winners, moves, scoring) and cover them in
`tests/`. Run `npm test`. DOM is never needed for logic tests.

## Checklist

- [ ] Unique `id`, 3 `howTo` lines, all modes playable
- [ ] CPU has 3 visibly different levels (or the game documents why not)
- [ ] Keyboard accessible (real `<button>`s, focus visible)
- [ ] Works at 360px wide (responsive board, no sideways scroll)
- [ ] Cleanup cancels every listener/timer/loop
- [ ] `npm test` green, `npm run build` green
