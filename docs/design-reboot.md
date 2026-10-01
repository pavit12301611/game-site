# PSD-gaming — visual reboot: audit and design brief (Phase 0)

Status: **proposal for the owner to approve**. No product code changes in this phase. Phases 1–5
implement it, one PR each. Everything below was checked against `main` at `e9d51d1`; numbers marked
"measured" are recomputed by `tests/design-brief.test.js` on every `npm test`, so the brief cannot
drift from its own claims.

## 1. Audit: what is wrong today (verified in the repo)

| # | Finding | Where | Fixed in |
| --- | --- | --- | --- |
| A1 | 6 stock JPGs (≈640 px) shared by category; `getGameArtwork()` picks by index. Unused `Multiplayer` cover. Every card is the same photo with a glyph, "scanlines" and "orbits" painted over it. | `src/catalog.js` `GAME_COVERS`, `.art-*` CSS | 1, 2 |
| A2 | Images are decorative-only (`alt=""` + `aria-hidden`) and carry no `width`/`height` (layout shift) and an inline `onerror=` handler. | `src/views/pages.js`, `modals.js` | 1 |
| A3 | `src/styles.css`: 1 392 lines, 624 hex colour literals, **213 `font-size` declarations ≤ 10 px** (3–10 px, mostly boards and small-caps labels), 10 `!important`. The light theme is a ~30-line override list of hard-coded colours, not tokens. | `src/styles.css` | 2, 5 |
| A4 | Contrast of today's tokens, measured: dark `--soft` on `--panel-2` **4.12**; light `--soft` on `--bg` **4.01**; light `--cyan` **3.56**, `--orange` **3.25**, `--pink` **3.78**, `--green` **3.93**, `--gold` **4.18** on `--bg` (all < 4.5 for text). Dark `--line-strong` over `--bg` ≈ 1.6:1 (decorative only, which is fine, but inputs and buttons rely on it too). | tokens, `[data-theme='light']` | 2 |
| A5 | **No `aria-live` anywhere** in `src/`. Turn changes, results, and the quiz reveal are silent for screen readers. The toast has `role="status"` but is destroyed and rebuilt by every repaint. | `src/views/*.js` | 3 |
| A6 | `render()` replaces `#app.innerHTML` on every state change. Consequences: keyboard focus is lost after every move (so a keyboard player must re-tab to the board each turn); CSS transitions and keyframes can never play on a changed element (the element is new); a live region inside `#app` would be rebuilt too. | `src/render.js` | 2 (mechanism), 3 |
| A7 | Boards: `role="grid"` on containers whose children are `<button>`/`<div>` with no `row`/`gridcell` roles (invalid ARIA); line cells are labelled "Square 5", not row/column; drop discs have no accessible name and maze cells only a `title` on the tokens; battle cells say "Target square 14". | `src/views/boards.js` | 3 |
| A8 | Modals: `role="dialog"` + `aria-modal` but no focus move on open, no focus trap, no focus return on close (the only `.focus()` calls in `src/` are for the search box, in `src/app.js` and `src/router.js`). Backdrop click and Esc do close them. | `src/views/modals.js`, `src/app.js` | 2 |
| A9 | Window-level key handlers: arrow keys are captured for maze even when focus is in an input/select; Space in race has no `event.repeat` guard, so holding the key auto-fires taps (see open decision D5). | `handleKeydown` in `src/app.js` | 3 |
| A10 | No OG/Twitter tags, no apple-touch-icon, favicon is a data-URI only. README documents the design system but no social image. | `index.html` | 1 |
| A11 | Cosmetic dead code: `--memory-cols:${n === 16 ? 4 : 4}`; the quiz engine has 11 questions shared by all 10 quiz games (engine content, out of scope here, noted for the owner). | `boards.js`, `engines/quiz.js` | note only |

Tooling facts for later phases: the agent sandbox has **no browser and no Chrome** (so no LCP/CLS/axe
measurements here), ImageMagick 6.9 **with WebP** (resize/convert), and **no SVG rasteriser**
(icons/favicon PNGs are drawn with ImageMagick primitives or exported by hand-written script).

## 2. Direction in 10 lines

1. **A game table, not a neon cabinet.** The product reads as warm wood, felt, paper and plastic under one soft lamp.
2. One light source, top-left, everywhere. Shadows fall bottom-right; insets are darker top-left.
3. UI chrome is quiet and neutral (warm greys); **one** brass/amber primary; colour is saved for players and states.
4. Boards are **physical objects** and look the same in both themes; only the table around them changes.
5. Each of 4 player colours is paired with a **shape** (circle, triangle, square, diamond) and a letter: colour is never the only signal.
6. Type does the hierarchy: Inter for everything; Chakra Petch only for the wordmark and score digits; mono only for room codes and key caps. No text below 12 px.
7. Real spacing scale (4-pt), 4 radii, 3 elevations, 4 durations. No one-off numbers.
8. Photography leads: every game has its own image; no overlays painted on it except a text scrim where text sits.
9. Motion explains cause and effect (a disc falls, a card flips, a button depresses) and has a reduced-motion twin for every effect.
10. Light theme is designed first-class (paper), not derived: it has its own measured palette.

## 3. Token set

All tokens are CSS custom properties on `:root` / `[data-theme='light']`; the light theme is a pure
token swap, with **no** per-component overrides (that is how Phase 5 deletes the override list).

### 3.1 Colour (measured)

Token → hex, both themes:

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--bg` | #14110F | #F6F1E8 | page background |
| `--surface-1` | #1C1815 | #FFFDF8 | cards, panels, sidebar |
| `--surface-2` | #262019 | #EFE8DB | inputs, raised cards, table stripes |
| `--surface-3` | #322A22 | #E4DAC8 | wells and inset areas only (no controls, no status text) |
| `--ink` | #F4EEE5 | #241F1A | body text, headings |
| `--ink-muted` | #C2B7A8 | #554C41 | secondary text |
| `--ink-subtle` | #A09484 | #675D50 | captions, placeholders (never on --surface-3) |
| `--control-edge` | #8C8070 | #8A7D6C | borders of inputs, buttons, chips (UI contrast) |
| `--primary` | #E8A33D | #8F5200 | primary button fill, links, active nav |
| `--on-primary` | #1A1208 | #FFFFFF | text/icon on --primary |
| `--focus-ring` | #8CC4FF | #1B4FD1 | 2px focus ring |
| `--ok` | #6FCF97 | #16774A | success text and icon |
| `--bad` | #FF9A8A | #B3321F | error text and icon |
| `--warn` | #F2C14E | #8A5A00 | warning text and icon |
| `--info` | #86BDF2 | #1F5FA8 | info text and icon |
| `--line` | #3B332A | #D8CCB8 | decorative hairlines only; carries no meaning |

Pairing rules: text uses only `--bg`, `--surface-1`, `--surface-2`; `--surface-3` may carry `--ink` and
`--ink-muted` only. Controls never sit on `--surface-3`. Status colours are always accompanied by an
icon and a word. Every row below is a pair the product is allowed to use, with its measured WCAG
ratio against the requirement (4.5 text, 3 UI/graphics). Rows use the worst-case allowed surface
(`--surface-2` is the lightest of the three in dark and the darkest in light), so the same colours on
`--bg` and `--surface-1` pass by construction:

| Context | Foreground | Background | FG hex | BG hex | Ratio | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| dark | `--ink` | `--surface-2` | #F4EEE5 | #262019 | 13.97 | 4.5:1 |
| dark | `--ink` | `--surface-3` | #F4EEE5 | #322A22 | 12.22 | 4.5:1 |
| dark | `--ink-muted` | `--surface-2` | #C2B7A8 | #262019 | 8.16 | 4.5:1 |
| dark | `--ink-muted` | `--surface-3` | #C2B7A8 | #322A22 | 7.14 | 4.5:1 |
| dark | `--ink-subtle` | `--surface-2` | #A09484 | #262019 | 5.42 | 4.5:1 |
| dark | `--primary` | `--surface-2` | #E8A33D | #262019 | 7.47 | 4.5:1 |
| dark | `--on-primary` | `--primary` | #1A1208 | #E8A33D | 8.59 | 4.5:1 |
| dark | `--ok` | `--surface-2` | #6FCF97 | #262019 | 8.48 | 4.5:1 |
| dark | `--bad` | `--surface-2` | #FF9A8A | #262019 | 7.86 | 4.5:1 |
| dark | `--warn` | `--surface-2` | #F2C14E | #262019 | 9.60 | 4.5:1 |
| dark | `--info` | `--surface-2` | #86BDF2 | #262019 | 8.12 | 4.5:1 |
| dark | `--control-edge` | `--surface-2` | #8C8070 | #262019 | 4.17 | 3:1 |
| dark | `--focus-ring` | `--surface-2` | #8CC4FF | #262019 | 8.79 | 3:1 |
| light | `--ink` | `--surface-2` | #241F1A | #EFE8DB | 13.40 | 4.5:1 |
| light | `--ink` | `--surface-3` | #241F1A | #E4DAC8 | 11.79 | 4.5:1 |
| light | `--ink-muted` | `--surface-2` | #554C41 | #EFE8DB | 6.90 | 4.5:1 |
| light | `--ink-muted` | `--surface-3` | #554C41 | #E4DAC8 | 6.07 | 4.5:1 |
| light | `--ink-subtle` | `--surface-2` | #675D50 | #EFE8DB | 5.29 | 4.5:1 |
| light | `--primary` | `--surface-2` | #8F5200 | #EFE8DB | 5.11 | 4.5:1 |
| light | `--on-primary` | `--primary` | #FFFFFF | #8F5200 | 6.22 | 4.5:1 |
| light | `--ok` | `--surface-2` | #16774A | #EFE8DB | 4.57 | 4.5:1 |
| light | `--bad` | `--surface-2` | #B3321F | #EFE8DB | 5.08 | 4.5:1 |
| light | `--warn` | `--surface-2` | #8A5A00 | #EFE8DB | 4.86 | 4.5:1 |
| light | `--info` | `--surface-2` | #1F5FA8 | #EFE8DB | 5.29 | 4.5:1 |
| light | `--control-edge` | `--surface-2` | #8A7D6C | #EFE8DB | 3.30 | 3:1 |
| light | `--focus-ring` | `--surface-2` | #1B4FD1 | #EFE8DB | 5.59 | 3:1 |

**Player colours** (pieces, dots, lane tokens). A piece is `fill + 2 px edge + shape + letter`, so
legibility never depends on the fill alone. Edge-to-fill contrast, measured:

| Player | Shape | Fill (dark) | Fill (light) |
| --- | --- | --- | --- |
| P1 red | circle | #E5533D | #D6402B |
| P2 yellow | triangle | #F2C230 | #E0A800 |
| P3 blue | square | #5AAEF0 | #2F7FD0 |
| P4 green | diamond | #4CC38A | #23995F |

| Context | Foreground | Background | FG hex | BG hex | Ratio | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| P1 red piece, dark | edge | fill | #1A1208 | #E5533D | 4.97 | 3:1 |
| P1 red piece, light | edge | fill | #241F1A | #D6402B | 3.60 | 3:1 |
| P2 yellow piece, dark | edge | fill | #1A1208 | #F2C230 | 11.05 | 3:1 |
| P2 yellow piece, light | edge | fill | #241F1A | #E0A800 | 7.60 | 3:1 |
| P3 blue piece, dark | edge | fill | #1A1208 | #5AAEF0 | 7.71 | 3:1 |
| P3 blue piece, light | edge | fill | #241F1A | #2F7FD0 | 3.94 | 3:1 |
| P4 green piece, dark | edge | fill | #1A1208 | #4CC38A | 8.36 | 3:1 |
| P4 green piece, light | edge | fill | #241F1A | #23995F | 4.51 | 3:1 |

Yellow on a light surface is only ~2.1:1 by itself, which is exactly why the edge and shape are mandatory.

**Board materials** are theme-independent (a wooden board is wooden in both themes). Text printed on them:

| Context | Foreground | Background | FG hex | BG hex | Ratio | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| maple wood (line board) | label | material | #2B1A0E | #D9B27C | 8.44 | 4.5:1 |
| walnut frame | label | material | #F3E3C3 | #5B3A24 | 7.99 | 4.5:1 |
| green felt (dice, race) | label | material | #F1F5EE | #1F5A3D | 7.36 | 4.5:1 |
| blue plastic frame (drop) | label | material | #FFFFFF | #1D4F9C | 7.92 | 4.5:1 |
| dark slate (battle, maze, rally) | label | material | #6EE7A0 | #0F1A22 | 11.42 | 4.5:1 |
| card back (memory) | label | material | #F1E7C8 | #23305E | 10.27 | 4.5:1 |

### 3.2 Type

Same three npm packages already bundled (no new dependency); fewer weights shipped.

| Token | Size / line | Use |
| --- | --- | --- |
| `--fs-1` | 12 / 16 | captions, key caps, badges (the minimum, nothing smaller) |
| `--fs-2` | 14 / 20 | secondary text, table cells, chips |
| `--fs-3` | 16 / 24 | body, inputs, buttons (16 px also stops iOS zoom on focus) |
| `--fs-4` | 18 / 26 | lead paragraphs, card titles |
| `--fs-5` | 22 / 28 | section headings (h3) |
| `--fs-6` | 28 / 34 | page headings (h2) |
| `--fs-7` | clamp(32, 5vw, 44) / 1.1 | page titles (h1) |
| `--fs-8` | clamp(40, 7vw, 64) / 1.05 | landing hero only |

Weights: 400 body, 500 UI labels, 600 buttons and card titles, 700 headings. Small-caps "eyebrow"
labels (10 px mono, letter-spaced, today everywhere) are replaced by sentence-case 12 px `--ink-muted`
labels. `font-variant-numeric: tabular-nums` on every score, timer and counter, so digits never jiggle.

### 3.3 Space, radius, elevation, motion, layout

- **Space (4-pt):** `--sp-1 4`, `-2 8`, `-3 12`, `-4 16`, `-5 24`, `-6 32`, `-7 48`, `-8 64`, `-9 96` px.
- **Radius:** `--r-1 4` (pieces, key caps), `--r-2 8` (inputs, buttons, chips), `--r-3 12` (cards, panels), `--r-4 20` (dialogs, hero), `--r-pill 999`. Boards use their own small radii (a real board has 2–6 px corners).
- **Elevation** (warm black, light from top-left; light theme halves the alpha): `--shadow-1` `1px 2px 3px / .30` (cards at rest), `--shadow-2` `2px 6px 16px / .30` (hover, popovers), `--shadow-3` `4px 18px 44px / .36` (dialogs). Plus `--shadow-inset` (wells, board grooves), `--shadow-piece` (`1px 2px 3px / .45`), and `--press` (button depth: the 3 px "ledge" under a button collapses to 1 px on `:active`).
- **Motion:** `--dur-1 100ms` (hover/press), `--dur-2 180ms` (state change), `--dur-3 280ms` (dialog, drawer), `--dur-4 600ms` (disc drop, card flip, reveal). Easing `--ease-out cubic-bezier(.2,.7,.2,1)` and `--ease-io cubic-bezier(.4,0,.2,1)`. Under `prefers-reduced-motion: reduce`: all durations become 0 except opacity cross-fades ≤ 120 ms; no transforms, trails, pulses or parallax.
- **Layout:** works from **320 px**; breakpoints 480 / 720 / 1024 / 1280; content max-width 1200; sidebar 240 px from 1024 up, bottom bar below. Touch targets ≥ 44×44 (inline links get 44 px of padding hit area). Focus ring: `outline: 2px solid var(--focus-ring); outline-offset: 2px` on every focusable element, never removed; plus a 1 px inner `--surface-1` ring on dark photos.
- **Images in layout:** every image sits in a box with a fixed `aspect-ratio` (cards 16:10, hero 16:9, lobby banner 21:9) and carries `width`/`height`, so loading cannot shift anything (CLS target < 0.1).

## 4. Component inventory

| Component | Variants | States that must be visible | Notes |
| --- | --- | --- | --- |
| Button | primary, secondary (outlined), quiet (text), danger; sizes md (44 px), sm (36 px, only in dense tables), icon-only (44×44) | hover, `:focus-visible`, active (`--press`), disabled (text + 3:1 border kept, not just 45% opacity), loading (spinner + `aria-busy`) | primary = `--primary` fill + `--on-primary` text |
| Field | text, search, select, checkbox/switch, radio group | focus, invalid (icon + message linked with `aria-describedby`), disabled, read-only | label always visible; border `--control-edge` |
| Card | game card, panel, stat tile | hover (lift to `--shadow-2`), focus, pressed, favourite on/off | whole card is one link/button; favourite is a separate 44 px button |
| Chip / pill | filter, status, "HOST", "YOU" | selected (`aria-pressed`: fill + check icon), disabled | status chips: icon + word + colour |
| Avatar | player 1–4, guest, CPU | here / away / left ring + label (presence stays meaningful) | shape + letter from §3.1 |
| Player slot | filled, empty, host | is-here, is-away, is-left, you | replaces `.player-slot` / `.match-player`; keeps the presence words |
| Rail / scoreboard | match rail, memory/rally score strip | your turn (icon + "Your turn"), winner (trophy icon) | `aria-live="polite"` status line |
| Toast | success, warning, error | enter/exit | lives in a persistent live region outside `#app` (A5, A6) |
| Dialog | standard, wide (setup), alert (recovery) | open: focus moves in, trapped, returns to opener on close | Esc and backdrop close; `aria-labelledby` |
| Table | admin metrics, setup check | row hover, sticky header ≥ 720 px; stacked cards < 720 px | real `<table>`, scoped `<th>` |
| Banner | info, setup-needed, offline | — | keeps the documented connection wording |
| Empty / loading / error | catalog "no results", room loading, room error | skeleton shimmer (none under reduced motion) | each has an icon, a sentence and a next action |
| Icon set | ~30 inline SVG, 24-px grid, **one 1.75 px stroke**, round caps | inherit `currentColor` | `aria-hidden` unless it is the only label |

## 5. Screen by screen: today → after

| Screen | Today | After |
| --- | --- | --- |
| Shell | 252 px dark sidebar with "PSD ™" lockup, promo card, "YOUR ARCADE / QUICK PLAY" mono captions; topbar with ⌘K search, status pill, theme, bell, profile; extra breadcrumb strip; 5-item mobile bar | Calm 240 px sidebar (logo, 3–4 nav, connection status at the bottom: wording unchanged), slim topbar (search, theme, inbox, profile), breadcrumb strip removed (the page `h1` does that job), skip-link to `#page-content`, bottom bar ≥ 44 px targets on mobile |
| Landing | hero with stock photo, CSS-drawn "console", glows and gridlines; stat strip; 4 featured games; shortlist; invite banner | Hero = real photo (LCP, `fetchpriority="high"`), one headline, two buttons, status chip; "How it works" in 3 steps (pick, share link, play); featured row with real per-game photos; invite banner as a plain card |
| Catalog | "INSERT FRIENDS HERE" kicker, filter pills, count, grid of identical-looking art | Page title + search + 5 category tabs (with counts), 16:10 photo cards with title, category, players, engine tag; designed empty state; loading skeleton; results count in a live region |
| Game modal | Art with overlays, rules text, buttons | Photo header, 3-fact strip (players, time, input), how-to-play, "Play with friends" / "Practice vs CPU" |
| Lobby | Art block with sigil + label, copy, player slots | Photo banner (21:9), room code as a copyable field, slots with shape+letter avatars, presence states, clear host/guest call to action |
| Game screen | stage panel + match rail, "how to play" open by default, result banner, 3-line footer | Stage = the board, centred and as large as fits; one status line (`aria-live`); how-to-play collapsed after first visit (remembered on device); rail = scoreboard; result card with replay |
| Boards (10) | flat tiles, neon glow, text glyphs, sizes down to 3 px | §7 |
| Friends | list + request cards | Table-like list with avatar, name, presence, action; inbox badges with numbers |
| Admin | metric tiles + table | Same data, real table, stacked below 720 px |
| Settings / prefs | modal with theme + sound | Same controls (theme, sound, plus a reduced-motion override and "large board" toggle if cheap), restyled; nothing removed |
| Setup dialog + banners | long dialog | Same words, steps as numbered list with copy buttons |
| Recovery screen | card with "!" badge | Same text, wider card, `role="alert"`, buttons ≥ 44 px, works with zero CSS images |
| Toasts | bottom-right pill, rebuilt on each paint | Persistent live region, stacked, dismissible, pause on hover/focus |
| Favicon / social | data-URI SVG, no OG | `favicon.svg`, 48 px PNG/ICO, 180 px apple-touch-icon, `og-image.jpg` 1200×630, OG + Twitter tags |

## 6. Per-game image brief

**Output spec.** `public/images/games/<game-id>.webp` 1280×800 (16:10), `<game-id>-640.webp` 640×400 for
`srcset`/`sizes`. Hero `public/images/hero.webp` 1600×900 (+800 w), four covers
`public/images/categories/<slug>.webp` 1280×800 (+640), `public/images/og-image.jpg` 1200×630
(JPEG: most social crawlers still reject WebP). Favicons in `public/`.

**Weight budget.** 1280 files ≤ 150 KB (hard test), 640 files ≤ 36 KB (so even if lazy loading did
nothing, 40 cards = 1.44 MB < the 1.5 MB route budget), hero ≤ 150 KB. `scripts/build-images.sh`
(dev-only, ImageMagick; no runtime dependency) crops to 16:10, strips metadata, and lowers quality
until the budget holds; only the optimised outputs are committed (sources are not).

**Source and licence.** There is no way to verify a stock photo's licence from the sandbox, and
hot-linking is blocked by the CSP anyway, so the default is: **every image is generated** with the
agent image tool as a photorealistic render, **labelled `generated`** in `public/images/CREDITS.md`
(format: `| file | subject | source | licence | author |`). Prompt template (identical for every game, so
the set looks like one shoot): *"Photorealistic top-down-ish photograph of {subject}, warm soft key
light from the upper left, shallow depth of field, neutral dark-wood table, no text, no logos, no
brands, no packaging, no people's faces, 16:10"*. Every image is inspected at 100 % for stray text,
logos, malformed hands or look-alike packaging before it is kept; failures are regenerated. If you
later have a real photo (your own, Pexels, Pixabay, Unsplash, CC0) drop it in under the same name
and fix the CREDITS line. Alt text is written per image and describes the picture ("A wooden
tic-tac-toe board with three X and two O tiles"), not the marketing blurb. Focal point
(`object-position`) is set per image after viewing it; the map is `GAME_ARTWORK[id] = { src, srcset, alt, focal, credit }`
and the engine label ("GRID TACTICS", …) moves to its own helper because the lobby still uses it.

| Game id | Engine | What the photo shows (generic objects only) |
| --- | --- | --- |
| `pixel-tac-toe` | line | Wooden tic-tac-toe board, X and O wooden pieces, one winning diagonal |
| `neon-gomoku` | line | Close crop of a go board, black and white stones, grid lines in focus |
| `connect-four` | drop | Upright blue frame, red and yellow discs, no logo, no box |
| `five-in-row` | drop | Larger wooden drop-frame, side light, discs in two colours |
| `memory-match` | memory | Face-down cards on a table, two turned face-up |
| `neon-pairs` | memory | Cards with glowing geometric backs on dark glass |
| `emoji-flip` | memory | Cards with generic round-face drawings (not any emoji set) |
| `arcade-pairs` | memory | Pairs of arcade tokens/coins laid out on a grid |
| `pixel-tap` | race | Close-up of a big arcade push button |
| `button-masher` | race | Oversized red push button, finger about to press |
| `turbo-charge` | race | Boost/turbo gauge on a dashboard, needle high |
| `reaction-rush` | race | Stopwatch mid-run, thumb on the button |
| `spacebar-showdown` | race | Macro of a mechanical-keyboard spacebar |
| `bug-blaster` | race | Retro toy ray gun on a bench, no brand marks |
| `rock-paper-scissors` | rps | Three hands making rock, paper and scissors |
| `laser-duel` | rps | Laser-tag beams crossing in fog |
| `coin-flip-clash` | rps | A coin spinning mid-air, heads/tails unmarked by any real currency |
| `dice-duel` | rps | Two dice tumbling on green felt |
| `retro-trivia` | quiz | Vintage TV or generic arcade cabinet, no marquee text |
| `emoji-decode` | quiz | Colourful smiley stickers, generic faces |
| `arcade-facts` | quiz | Joystick and buttons close-up |
| `pixel-pop-quiz` | quiz | Row of colourful quiz buzzers |
| `movie-mayhem` | quiz | Clapperboard (blank slate) and popcorn, **no posters** |
| `word-scramble` | quiz | Wooden letter tiles, no brand, no board |
| `number-chase` | quiz | Number tiles or chalkboard numerals |
| `brain-busters` | quiz | Wooden brain-teaser puzzle |
| `eight-bit-riddles` | quiz | Generic retro handheld console, screen blank or abstract |
| `retro-rewind` | quiz | Cassette tape and a blank VHS-style tape, no labels |
| `maze-runner` | maze | Aerial view of a hedge maze |
| `neon-labyrinth` | maze | Neon-lit corridor maze |
| `byte-escape` | maze | Circuit-board macro that reads as a maze |
| `star-runner` | maze | Wooden ball-labyrinth toy with a star hole, or star trails |
| `sea-battle` | battle | Peg grid with small plastic ships, no box art |
| `pixel-fleet` | battle | Toy boats on a grid or a radar scope |
| `alien-skirmish` | battle | Green radar scope / retro space toy |
| `pong-rally` | rally | Table-tennis paddles and ball on a table |
| `paddle-wars` | rally | Two paddles facing off |
| `air-hockey` | rally | Air-hockey table with puck and striker |
| `codebreaker` | code | Combination padlock dials |
| `mastermind` | code | Coloured code pegs with black/white feedback pegs on a generic board |

Hero: friends around a table with laptops and phones in warm light, **shot from behind or hands-only**
(no frontal faces: generated faces age badly and raise likeness questions; see D2). Covers, one real
object each: **Arcade** joystick, **Party** dice and party hat on felt, **Puzzle** jigsaw/cube,
**Strategy** chess or go pieces. Not allowed anywhere: logos, packaging, posters/stills, celebrities,
recognisable characters.

## 7. Board spec

### 7.1 Rules for every board

- Contract kept: `renderEngineBoard(game, gameState, players, me)`, all `data-action` names and `data-*` payloads (`line-move[index]`, `drop-move[col]`, `memory-flip[index]`, `race-tap`, `duel-choice[choice]`, `quiz-answer[answer]`, `quiz-next`, `maze-move[direction]`, `battle-target[uid]`, `battle-fire[index]`, `rally-hit[lane]`, `code-digit[index]`, `code-submit`). Engines and baseline untouched.
- **Status line:** one `<p class="board-status">` per board with turn/result text. A single **persistent** `aria-live="polite"` region (created once in `src/main.js`, outside `#app`) is updated by `textContent` after each paint when the status string changes. Per-board status lines are not live themselves (they would be rebuilt, A6).
- **Focus survives repaint:** controls get a stable `data-focus-id`; `render()` records the focused id before swapping `innerHTML` and re-focuses it after. Entry animations are triggered by a one-frame `.is-new` class computed from the previous state (a tiny diff in the view layer), because transitions cannot run on re-created nodes.
- **No layout shift:** every state (empty, filled, disabled, win) occupies the same box; counters are `tabular-nums`; status text has a reserved two-line height.
- Disabled ≠ invisible: a not-your-turn control keeps full contrast, shows a lock/clock icon or "Waiting for Sam", and is `aria-disabled`/`disabled`.
- Win/last-move/hit are shown by **shape or icon + colour + text**; reduced motion removes movement but keeps every marker.
- Dark + light + 320 px checked per board (board scales by `min(100%, 70vh)` with `aspect-ratio`; the one known exception to 44 px targets is the 9×9 Gomoku board: full-bleed at 320 px its cells are ≈ 35 px, so it gets a visible focus/press state and zoom-friendly spacing, and the PR will say so).
- Ten boards, ten sets of jsdom tests: markup contract (labels, roles, disabled states), win/last-move classes, keyboard handler maps, no ≤ 11 px text.

### 7.2 Per engine

| Engine (games) | Physical object | Layout and states | Keyboard and a11y | Motion (reduced-motion twin) |
| --- | --- | --- | --- | --- |
| **line** (3×3, 9×9) | Maple board with routed grid lines (`maple`, `walnut` border); turned-wood X and O pieces with `--shadow-piece` | Square board; empty cell shows faint ghost of your piece on hover/focus; last move ringed; winning line drawn as a brass bar and the pieces lift 2 px | `role="grid"` → real `row`/`gridcell` wrappers with the `<button>` inside; `aria-label="Row 2, column 3, empty"` / `"…, X by Sam"`; arrows move focus between cells, Enter/Space places | Piece settles 180 ms (instant) |
| **drop** (7×6, 8×7) | Upright blue frame (`frame-blue`), round holes with inner shadow, red/yellow discs with a bevel; base feet | Hover/focus on a column lights a ghost disc above it; full column shows a lock icon; winning four get a ring + glow | Column buttons above the frame; **←/→ choose a column, Enter/Space drops**; each column labelled "Column 3, 2 free"; discs get `aria-label` per cell in a visually hidden list | Disc falls with gravity ease 600 ms (instant, ghost fades) |
| **memory** (12/16 cards) | Cards on a table: patterned navy backs (`card-back`), cream faces with a printed symbol | 4 columns; flipped cards show symbol **and** a text name; matched pairs sink 2 px and take the owner's tint + their shape badge; per-player pair counter in the strip | Cards are buttons in a labelled group, "Card 5 of 12, face down" / "Card 5, star, matched by Alex"; arrows move focus; Enter flips | 3D flip 600 ms (cross-fade 120 ms) |
| **race** | Lanes on a track with ticks (`slate`/felt); one token per player; big plastic button with a 6 px ledge | Progress ticks = score; "3, 2, 1" countdown card; you = labelled "You"; finish line flag icon | Button reachable by Tab, **Space/Enter** both fire; `aria-label="Boost, 7 of 16"`; keeps focus across repaints (A6); `event.repeat` decision D5 | Button depresses 100 ms; token slides 180 ms (jump) |
| **rps / coin / dice** | Hand signs, a two-faced coin and pipped dice as inline SVG on felt | Three/two/six large choice buttons with icon + word; locked choice shows a check and "Locked in"; result card shows both picks, winner and a round history list | Radio-like group (arrows + Enter); result announced in the live region | Hands shake 3×, coin rotates, dice tumble ≤ 600 ms (swap to final face) |
| **quiz** | Question card on paper (`surface-1`), answer buttons with letter badges A–D | Countdown ring (text seconds inside it); per-player score strip; after reveal: correct = check icon + "Correct", yours-wrong = cross icon + "Your answer" (colour-blind safe: shapes differ, not just green/red) | Buttons keys **A–D** and 1–4 also answer; the reveal text goes to the live region; "Next question" gets focus after reveal | Ring drains linearly (static text only) |
| **maze** | Tiled floor, walls with top/side bevel, star at the exit (`slate` + stone) | Player tokens use shape+letter; footsteps counter per player; D-pad ≥ 56 px on touch | Board is `tabindex="0"` with `aria-label` "Maze, use arrow keys"; **arrows** move (ignored while typing in an input); D-pad buttons duplicate; focus never leaves the board | Token slides 100 ms (jump) |
| **battle** (6×6) | Radar glass (`slate`): your fleet grid and the target grid, sonar rings | Own fleet vs target grids side by side (stacked < 720 px); hit = peg with ✕ icon, miss = hollow peg with · icon; crosshair follows hover/focus; target picker for 3 players | Cells are buttons `aria-label="Row 3, column B, untouched"`; arrows move the crosshair, Enter fires; turn text in live region | Peg drops 180 ms (instant), sonar sweep static |
| **rally** (3 lanes) | Top-down table: green table-tennis table with net, or air-hockey rink with centre line; paddle and ball/puck | Three lane buttons (up/centre/down) with arrows + words; scoreboard; ball/puck shown at the last exchange with a short trail | Lane buttons are a toolbar (←/→ + Enter, or 1–3); score announced | Ball arcs 280 ms with a 3-frame trail (jump, no trail) |
| **code** (4 digits 0–5, 10 tries) | Brass dials / peg board; feedback pegs | Each of the six symbols = **colour + shape + digit**; guess history rows with feedback pegs: exact = solid, near = hollow, plus text "2 exact, 1 near"; remaining-guesses counter | Dial buttons keep `code-digit` (cycle) and also take **↑/↓** and digit keys 0–5; Enter = `code-submit`; draft is local state (`state.codeDraft`), no engine change | Dial clicks 100 ms (none) |

Definition of done per board: the table row implemented, the 7.1 rules met, tests added, 320 px /
light / dark / reduced-motion each checked, owner confirms on the Vercel preview.

## 8. Phases, files and tests

| Phase | Main files | Tests added or updated |
| --- | --- | --- |
| 0 (this PR) | `docs/design-reboot.md`, `tests/design-brief.test.js`, one README row | brief contains all 40 games and 10 engines; every contrast figure recomputed |
| 1 | `public/images/**`, `CREDITS.md`, `scripts/build-images.sh`, `src/catalog.js`, `index.html` | new `tests/artwork.test.js`; `tests/game-engine.test.js:30` |
| 2 | `src/styles.css` (tokens + shell/pages), `src/render.js`, `src/views/{shell,pages,modals}.js`, `src/ui/{toast,html}.js` | `app-render`, `production-boot` ("Online rooms ready" kept), new live-region, focus-restore and dialog-focus tests |
| 3 | `src/views/{boards,pages}.js`, board CSS | `presence-render` (`.player-slot.is-filled > small`, `.host-wait`, `.match-player`, `.turn-chip` kept or tests updated in the same commit), new per-board markup tests |
| 4 | friends/admin/settings/setup/recovery views | `render-fatal`, new 320 px and reduced-motion CSS assertions |
| 5 | README "Design system", CSS cleanup | size budget test (CSS bytes, image bytes); Lighthouse numbers come from a CI job (no Chrome in the sandbox) |

Baseline to protect: **316 tests, 289 pass, 27 skip, 0 fail**. The count only grows.

## 9. Open decisions for the owner

- **D1 Branching.** The brief asks for a new branch per phase. This working session is pinned to one branch (`arena/01a0f6c5-psd-gaming`), so Phase 0 is on it. For Phases 1+ either each phase gets its own session/branch, or phases stack on one PR. Say which.
- **D2 Imagery.** Default is AI-generated, labelled `generated`, faces avoided. If you prefer real stock photos, send the files or say "use Pexels"; licences must then be recorded per file.
- **D3 Fonts.** Default keeps the three installed packages and uses fewer weights. A new face would be a new dependency, which the rules forbid.
- **D4 Brand.** The sidebar says "PSD ™". Keep the ™?  Default: drop it (no registered mark known).
- **D5 Race Space-bar.** Holding Space currently auto-repeats `tap`s. Ignoring `event.repeat` is fair but changes the game's feel. Default: ignore repeats; say if you disagree.
