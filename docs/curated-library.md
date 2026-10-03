# Curated arcade — distinct games, not numbered presets

## Public library: 22 entries
Twelve standalone games (Reversi also supports two players on one device):
1. Apex Circuit — existing real-time Three.js circuit racer against two scripted AI rivals.
2. Neon Snake — **new** Canvas game: queued turns, food/growth, speed progression, wall/self collisions, full-board win.
3. Prism Breaker — **new** Canvas game: moving paddle, serve, angle-controlled ball rebounds, bricks, three lives, three stages.
4. Star Defender — **new** Canvas game: player projectiles, moving/descending enemy formation, enemy fire, invulnerability, three waves.

5. Merge 2048 — sliding tiles, single-merge-per-move logic, scoring, local best, 2048 win and locked-board loss.
6. Minefield — nine-by-nine Minesweeper with ten mines, first-reveal neighbourhood protection, flood reveal, flag mode and win/loss states.
7. Reversi — legal disc captures in eight directions, automatic passes, terminal scoring, CPU rival or same-device two-player mode.
8. Pocket Golf — continuous ball physics, friction, bumper/wall rebounds, three courses, stroke penalties and final scorecard.

9. Falling Blocks — seven-bag falling pieces, rotation, ghost landing, line clears and a 20-line mission.
10. Crate Shift — push-only Sokoban with undo and four solvable rooms, counted as one game.
11. Orbit Lander — gravity, thrust, steering, finite fuel and terrain-aware safe touchdown.
12. Hex Flood — six-colour hex adjacency, connected territory capture and a 30-move limit.

Ten curated social games (one per existing room engine): Pixel Tic-Tac-Toe, Connect Four, Memory Match, Pixel Tap Sprint, Rock Paper Scissors, Retro Trivia, Maze Runner, Sea Battle, Volley Tactics, Codebreaker. Volley Tactics is explicitly labeled a turn-based lane game; it is not advertised as real-time Pong.

The rejected 120 numbered challenge entries, procedural SVG covers and auxiliary state-only WebGL overlays were deleted. Thirty repetitive legacy entries are no longer shown or offered in room selection/quick play. Their original data and artwork remain only to support old saved room links and regression coverage. They do not inflate the public count. `ROOM_GAMES` contains the ten public room titles; `LIBRARY` contains all twenty-two; `GAMES` is the legacy compatibility registry.

## Artwork and presentation
Four independently AI-generated cover illustrations were created for the four action games, compressed to 960×600 WebP (roughly 47–60 KB each). These are promotional illustrations, **not gameplay screenshots**. All twenty-two public entries have different cover files. The originals share a consistent player shell with game-specific colors, instructions, pause/restart, local best score, keyboard and touch controls. The actual 2D gameplay is drawn from state on Canvas, not painted cover images.

Original cover credits: `public/images/CREDITS.md`. The ten retained social games now also have individually generated stylized covers in 1280×800 and 640×400 WebP, replacing their older photographic-style covers. Their playable HTML/SVG boards were polished separately; cover illustrations are not used as fake gameplay. No external image URLs, embeds, or third-party playable games were added.

## Validation and boundaries
- Pure rule tests cover all three new games: scoring, input restrictions, collisions, lives, stage/wave transitions and terminal win/loss states.
- Automated Chromium browser smoke opens all ten social practice boards, checks all twenty-two cover images, solo favorites and all three new Canvas games.
- Desktop keyboard scoring, pause/resume/restart, Snake game-over/replay and mobile touch scoring are exercised.
- Desktop library/gameplay and mobile intro screenshots were inspected.
- This is **not** full human playtesting or a real-phone performance certification. Shooter/Breakout full victory sequences are unit-tested, not full browser playthroughs. Browser smoke mobile checks use emulation.
- Solo games work without Firebase; online social rooms require configured Firebase. No new multi-device live-network validation is claimed.

Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`.
For browser smoke, run Vite and use `ARCADE_URL=http://localhost:5173 node scripts/check-curated.mjs` (Playwright Chromium required). `CHROMIUM_PATH` can select a sandbox browser. Test screenshots live in ignored `.arena/curated/`.

This is an honest **22-game public library**, not a claim that 40 new games or AAA assets were delivered. Additional games should only be counted when they introduce real independent gameplay.


## Social graphics pass
All ten social games now have new generated covers: tic-tac-toe, Connect Four, Memory Match, Pixel Tap Sprint, Rock Paper Scissors, Retro Trivia, Maze Runner, Sea Battle, Volley Tactics and Codebreaker. Full-size covers keep the existing 1280×800 contract; mobile covers are 640×400 and each stays below 40 KB. Existing paths were retained so cards, lobby panels, dialogs and stage headers all use the replacement art.

Actual board improvements are local CSS/SVG: scalable X/O/diamond pieces; distinct vector memory faces; consistent RPS hand symbols; beveled discs and cards; themed quiz console, radar grid, maze masonry/pawns, charge button, and vault dials. Volley Tactics displays the last chosen return lane using actual state. Overlapping maze players are now all visible. Color is supplemented by shapes, names and text; reduced-motion mode disables effects. Game rules and engine baselines were not changed by this visual pass.

`node scripts/check-social-graphics.mjs` opens and makes a move in every social game on desktop and emulated mobile, checks art loading, runtime errors and horizontal overflow, and saves screenshots under ignored `.arena/social/`. Selected library/board screenshots were visually inspected. This does not replace full multiplayer or physical-device testing.


## Tabletop batch validation
The four new titles each have separate generated promotional art (960×600 WebP). Actual gameplay is CSS-rendered number tiles, clue grids and discs, or a state-driven Canvas golf course; none of the covers are gameplay screenshots.

- `tests/tabletop.test.js` covers merge rules, loss/win states, protected first mine reveal, flood/flag behaviour, Reversi ray captures and forced passes, CPU legality/completion, and golf friction/collision/scoring. A deterministic golf plan completes all three courses without teleporting the ball.
- `scripts/check-tabletop.mjs` tests desktop and emulated mobile input, 2048 swipe and scoring, mines reveal/flag/unflag, Reversi CPU response/local turns/reset, golf touch drag, slider inputs, movement and pause/resume. It checks overflow and runtime errors and saves screenshots.
- `scripts/check-tabletop-completion.mjs` plays a full 60-move local Reversi game using legal UI buttons, exercises Minesweeper end-state/restart, and completes all three golf courses in the browser through seven slider-controlled shots, then checks restart.
- 2048 victory and Minesweeper victory are rule-tested; a full human/automated browser win for those two is not claimed. No physical-phone performance or new online-multiplayer certification is claimed.

The tabletop games are local. Reversi's two-player option is explicitly same-device, not an online room. Pocket Golf's three courses are levels within one game, not three library entries.


## Challenge batch validation
Four additional generated cover illustrations use 960×600 WebP. The playable Canvas graphics are separate: beveled blocks with a landing ghost and next-piece preview; raised warehouse walls and goal-aware crates; a starfield, lunar terrain and thrust-driven lander; and numbered, outlined hex territories.

- `tests/challenges.test.js` verifies bag/rotation/drop/line-clear/top-out rules, all four warehouse solutions and undo, hex adjacency and 50 seeded flood solutions, and flight physics, fuel, unsafe contact and a legal-input landing.
- `scripts/check-challenges.mjs` tests all four routes/covers on desktop and emulated mobile, restart and layout width. It plays Blocks to top-out, checks pause/resume, solves all four warehouses through real buttons, reads rendered hex colours and wins Flood through palette buttons. A Lander controller reads visible flight instruments and presses real keyboard controls to achieve a safe landing. Mobile Lander hold controls are exercised separately.
- Blocks' 20-line victory is rule-tested, not a full browser victory. Browser automation is not personal human playtesting or physical-phone certification. Online multiplayer has not been re-certified.
- Screenshots are saved to ignored `.arena/challenges/`; selected desktop/mobile screenshots were visually inspected. Set `ARCADE_URL` and optionally `CHROMIUM_PATH` to run against a local Vite instance.
