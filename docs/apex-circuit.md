# Apex Circuit — first distinct browser-3D milestone

A standalone real-time low-poly circuit racer at `/drive.html`, reachable from the homepage and catalog. It is one of eight standalone games in the current eighteen-game curated library. The earlier numbered expansion has been removed. See [Curated arcade](curated-library.md). Neither 40 new independent games nor AAA/Unity delivery is claimed.

## Implemented
- A continuous driving model: acceleration, drag, braking, speed-dependent steering and track-wall collision penalties.
- Three laps through eight ordered checkpoints per lap; skipped/repeated finish gates cannot award laps.
- Two scripted AI pace rivals, rival-contact speed penalties, position display and race results.
- Race countdown, timer, best lap, locally saved personal-best race time, restart and pause/resume.
- Chase/aerial cameras, keyboard and multitouch pedals/steering, opt-in synthesized engine tone.
- Browser WebGL geometry, lighting/shadows, track, curbs, barriers, grandstand/paddock, trees and basic car models.
- Automatic pause on focus loss/hidden tab, no-WebGL message, context-loss recovery message, renderer/resource disposal.

This is **single-player versus scripted AI**, not online multiplayer. The vehicle model is simplified arcade driving, not a rigid-body or tire-grip simulation. The circular track and generated low-poly models are a first playable milestone, not AAA art or a Unity project. All assets and libraries load locally; no Firebase configuration is needed for this game.

## Checks actually performed
- Production build, ESLint, TypeScript checkJs.
- Physics tests: throttle/brake, steering, collision clamping/debounce, ordered checkpoints, three full continuously simulated laps without teleportation, final-state lock, frame-delta bounds, time formatting.
- Chromium with a real WebGL2 context using **software SwiftShader**, not a hardware GPU performance benchmark.
- Browser smoke: initial renderer, keyboard acceleration/steering input, pause/resume, restart, camera mode, emulated touch throttle, mobile width, and forced no-WebGL fallback. Desktop JS errors monitored.
- Desktop driving and mobile intro screenshots were opened and visually inspected.

Not completed: full race completion via browser keyboard/touch, physical-phone testing, human handling/balance playtesting, GPU profiling, or multiplayer (not part of this milestone). The pure driving-model replay completes all three laps, but that is not an end-to-end browser victory-screen test.

## Reproduce
```sh
npm install
npm run dev
# In another terminal, after installing Playwright's Chromium:
npx playwright install chromium
node scripts/check-apex.mjs
node --test tests/racing-physics.test.js
```
`APEX_URL` overrides the default `http://localhost:5173/drive.html` smoke target; `CHROMIUM_PATH` optionally points at a local executable. Screenshots are scratch files under `.arena/apex/`, not shipped game assets.

In this sandbox Playwright's browser download endpoint was unavailable. A temporary npm-provided Chromium executable and runtime libraries were used instead; they are not production dependencies. The smoke script is still runnable with a normal Playwright installation.

## Next development work
Refine handling with human feedback; validate finish/replay end-to-end; test physical phones and optimize GPU draw calls; then introduce a second track and richer car models. Develop other genres as distinct tested games rather than counting target presets as new game engines.
