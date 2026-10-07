# Roadmap: from zero to infinity

v2 restarts from a clean core: 12 games, local-first, one-file-per-game.
Growth comes in phases, each shippable on its own.

## Phase 1 — Depth (next)
- [ ] Daily seed + streaks: seeded shuffles/quiz with a "daily challenge" badge
- [ ] Achievements shelf (first win, 2048 tile, 30-bonk round…) in localStorage
- [ ] Sound theme switcher (retro / soft / off) + haptics on mobile
- [ ] PWA: installable, offline-first service worker, app icons
- [ ] More games to 20: checkers, chess-lite tactics, sudoku, word ladder,
      breakout, minesweeper-hex, Simon, reaction duel, blackjack, hangman

## Phase 2 — Online rooms (the adapter)
- [ ] `NetAdapter` interface behind the game contract:
      `LocalAdapter` (today) vs `RoomAdapter` (later) — games stay untouched
- [ ] Share-link private rooms (2–4 players), spectator mode
- [ ] Server-authoritative relay for hidden state (fleet positions, codes…)
- [ ] Presence, rematch votes, host migration, reports + blocks

## Phase 3 — Social
- [ ] Optional accounts (guest → named → email), friend lists, invites
- [ ] Leaderboards per game (seasonal), replays for turn-based games
- [ ] Review wall with on-device sentiment (no API keys, like v1)

## Phase 4 — Infinity
- [ ] Community game packs: user-submitted game files in `src/games/packs/`
- [ ] Game jam template + automated checks (the ADDING_A_GAME checklist as CI)
- [ ] Tournament brackets, async daily ladders, live events

## Non-goals (guardrails)
- No accounts required to play — ever.
- No game ships without 3 CPU levels or a documented reason.
- No backend dependency for local play; the static build must always work.
