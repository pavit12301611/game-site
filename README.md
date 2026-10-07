# 🎮 PSD Gaming — Browser Arcade

A lightweight, no-sign-up arcade of **12 original mini-games** that plays in
seconds on laptops and phones. Local-first: every game runs against the CPU,
a friend on the same device, or solo — scores stay in your browser.

This is the **v2 rebuild**: the previous generation's soul (fast, original,
playable anywhere) with 100× the clarity — one file per game, a shared
turn-based engine, zero backend, and a documented path from 12 games to
infinity.

## Play it

```bash
npm install
npm run dev
```

Open the printed URL. That's it — no keys, no config, no database.

| Script            | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Dev server with hot reload            |
| `npm run build`   | Static production build into `dist/`  |
| `npm run preview` | Preview the production build locally  |
| `npm test`        | Rule tests for every game (`node:test`) |

Deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages…).

## The shelf

| Game | Genre | Modes |
| ---- | ----- | ----- |
| ❌ Tic-Tac-Toe | Strategy | CPU · 2P (unbeatable Hard) |
| 🔴 Connect Four | Strategy | CPU · 2P (4-ply Hard) |
| 🔲 Dots & Boxes | Strategy | CPU · 2P |
| 🃏 Memory Match | Puzzle | CPU · 2P (6/8/12 pairs) |
| 💣 Minesweeper | Puzzle | Solo (3 field sizes) |
| 🔢 2048 | Puzzle | Solo |
| 🕵️ Codebreaker | Puzzle | Solo · 2P (friend sets the code) |
| 🧠 Quiz Blitz | Trivia | Solo · 2P duel (36 questions) |
| ✊ Rock Paper Scissors | Party | CPU · 2P pass-and-play |
| 🔨 Whack-a-Mole | Party | Solo · 2P turns |
| 🐍 Snake | Arcade | Solo (keyboard / swipe / pad) |
| 🏓 Pong | Arcade | CPU · 2P (keyboard / touch) |

Every CPU has three levels. Every game works offline once loaded, at 360px
wide, with keyboard and touch.

## How it's built

- **No framework.** Vanilla ES modules + a 30-line `h()` DOM helper.
- **One file per game** (`src/games/*.js`) registered in one catalog
  (`src/games/registry.js`). Cards, filters, pages and stats read from it.
- **Shared table engine** (`src/games/table.js`) runs all turn-based games:
  status bar, CPU scheduling, restart, end overlay, stats, sounds.
- **Pure, tested rules.** Winners, moves and scoring are exported functions
  covered by `tests/` — no DOM needed.
- **Docs:** [ARCHITECTURE](docs/ARCHITECTURE.md) ·
  [ADDING_A_GAME](docs/ADDING_A_GAME.md) (ship a game in ~15 min) ·
  [ROADMAP](docs/ROADMAP.md) (the road to infinity: PWA → online rooms → packs)

## Project layout

```
src/
  main.js app.js            entry + shell/router/views
  core/                     dom, store (prefs+stats), sound, router
  games/registry.js         the catalog — 1 import + 1 line per game
  games/table.js            turn-based session runner
  games/*.js                the 12 games
  styles/                   design system (dark-first, light theme too)
tests/                      rule tests (node:test, zero deps)
docs/                       architecture, game-author guide, roadmap
```

## License

MIT — play it, fork it, add your game to the shelf.
