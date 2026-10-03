# Dimension expansion

## Delivered
- Original 40 games retained; 120 additional, explicitly labeled challenge variants across 12 families (160 entries total).
- 20 Three.js/WebGL views: Orbit Boost (10 target presets) and Prism Escape (10 distinct maze layouts).
- 140 2D entries, dimension filters, refreshed homepage, 120 small procedural SVG covers.
- Existing practice/CPU and 2–3 player private-room flows reused. No separate networking or credentials added.
- Three.js is lazy-loaded only for a 3D match. Geometry, materials, resize observers and WebGL contexts are disposed on rerender/navigation. Rendering is event-driven, not a continuous battery-consuming loop.
- 2D board and controls remain below the 3D view, including when WebGL is unavailable. Scenes show real game state after moves; this is not a physics-based racing simulation.

## Scope and deployment
These are parameterized challenge variants using existing engines, **not 120 independently developed games**. The new maze layouts leave the perimeter open so every player can reach the goal. The original 40 engine baseline fingerprints are unchanged; the fixture now also covers the 120 additions.

This uses real browser-rendered geometry through Three.js, **not Unity**. Unity Editor cannot be operated by this repository. Future Unity integration needs a licensed/exported WebGL build, compatible hosting headers/CSP, and an explicit multiplayer bridge; none is included or implied here.

Online accounts, invitations and multiplayer need the Firebase environment values and deployed rules described in the main README. Local practice works without those values. No new live Firebase end-to-end session was verified as part of this change. This is a product expansion, not a valuation guarantee or a claim of production security certification.

## Validation
`npm run build`, `npm run lint`, `npm run typecheck`, `npm test`.
Expansion tests verify catalog size, distinct presets, 2D/3D filtering, and legal winning paths for all three players in every new maze. Firebase emulator tests remain opt-in. A real-device WebGL/performance and multi-client Firebase QA pass is still recommended before launch.
