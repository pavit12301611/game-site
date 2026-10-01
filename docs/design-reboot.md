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

1. **An arcade, not a spreadsheet.** The product reads as a neon game room: deep indigo cabinets, hot pink, cyan, lime and yellow, chunky ledged buttons. See §11 (this replaced the warm "game table" draft).
2. One light source, top-left, everywhere. Shadows fall bottom-right; insets are darker top-left.
3. Chrome is dark indigo with bold edges; **one** yellow primary (violet in the light theme); neon pink, cyan, lime and violet mark categories, boards and states.
4. Boards are **cabinet screens**: dark neon glass in both themes; only the room around them changes.
5. Each of 4 player colours is paired with a **shape** (circle, triangle, square, diamond) and a letter: colour is never the only signal.
6. Type does the hierarchy: Inter for everything; Chakra Petch only for the wordmark and score digits; mono only for room codes and key caps. No text below 13 px; body 17 px.
7. Real spacing scale (4-pt), 4 radii, 3 elevations, 4 durations. No one-off numbers.
8. Photography leads: every game has its own image; no overlays painted on it except a text scrim where text sits.
9. Motion explains cause and effect (a disc falls, a card flips, a button depresses) and has a reduced-motion twin for every effect.
10. Light theme is designed first-class (paper), not derived: it has its own measured palette.

## 3. Token set

All tokens are CSS custom properties on `:root` / `[data-theme='light']`; the light theme is a pure
token swap, with **no** per-component overrides (that is how Phase 5 deletes the override list).

### 3.1 Colour (measured)

> **Arcade direction (§11) replaced the warm palette of the first draft.** The tables below are the current
> values; `tests/design-brief.test.js` recomputes every ratio from them.

Token → hex, both themes:

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--bg` | #0B0720 | #F6F1FF | page background |
| `--surface-1` | #150D36 | #FFFFFF | cards, panels, sidebar |
| `--surface-2` | #20154F | #ECE5FF | inputs, raised cards, table stripes |
| `--surface-3` | #2E2068 | #DDD2FF | wells and inset areas only (no controls, no status text) |
| `--ink` | #F7F3FF | #1A1040 | body text, headings |
| `--ink-muted` | #CFC6F5 | #463B86 | secondary text |
| `--ink-subtle` | #AA9FE0 | #574C96 | captions, placeholders (never on --surface-3) |
| `--control-edge` | #8F80DC | #7566C0 | borders of inputs, buttons, chips (UI contrast) |
| `--primary` | #FFD23F | #5B21D6 | primary button fill, links, active nav (yellow in dark, violet in light) |
| `--on-primary` | #140A2E | #FFFFFF | text/icon on --primary |
| `--focus-ring` | #5EF0FF | #0B4BD6 | 2px focus ring |
| `--ok` | #5DFFA0 | #087040 | success text and icon |
| `--bad` | #FF8AA0 | #C1123A | error text and icon |
| `--warn` | #FFD23F | #8A5A00 | warning text and icon |
| `--info` | #7ADCFF | #1250A8 | info text and icon |
| `--neon-pink` | #FF4DB8 | #C4157F | arcade accent: Arcade category, hot highlights |
| `--neon-cyan` | #2EE6FF | #006B8F | arcade accent: Strategy category, grid lines |
| `--neon-lime` | #86FF5C | #256F00 | arcade accent: Puzzle category, go/ready |
| `--neon-violet` | #B79BFF | #6A3DF0 | arcade accent: Party-adjacent glows, decorative |
| `--line` | #3B2C80 | #D0C4F7 | decorative hairlines only; carries no meaning |

Pairing rules: text uses only `--bg`, `--surface-1`, `--surface-2`; `--surface-3` may carry `--ink` and
`--ink-muted` only. Controls never sit on `--surface-3`. Status colours are always accompanied by an
icon and a word. The neon accents are used as text only in the rows measured below; a glow or an outline is
decoration and never the only signal. Every row below is a pair the product is allowed to use, with its
measured WCAG ratio against the requirement (4.5 text, 3 UI/graphics). Rows use the worst-case allowed
surface (`--surface-2`), so the same colours on `--bg` and `--surface-1` pass by construction:

| Context | Foreground | Background | FG hex | BG hex | Ratio | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| dark | `--ink` | `--surface-2` | #F7F3FF | #20154F | 15.00 | 4.5:1 |
| dark | `--ink` | `--surface-3` | #F7F3FF | #2E2068 | 12.62 | 4.5:1 |
| dark | `--ink-muted` | `--surface-2` | #CFC6F5 | #20154F | 10.18 | 4.5:1 |
| dark | `--ink-muted` | `--surface-3` | #CFC6F5 | #2E2068 | 8.57 | 4.5:1 |
| dark | `--ink-subtle` | `--surface-2` | #AA9FE0 | #20154F | 6.82 | 4.5:1 |
| dark | `--primary` | `--surface-2` | #FFD23F | #20154F | 11.35 | 4.5:1 |
| dark | `--on-primary` | `--primary` | #140A2E | #FFD23F | 13.07 | 4.5:1 |
| dark | `--ok` | `--surface-2` | #5DFFA0 | #20154F | 12.70 | 4.5:1 |
| dark | `--bad` | `--surface-2` | #FF8AA0 | #20154F | 7.33 | 4.5:1 |
| dark | `--warn` | `--surface-2` | #FFD23F | #20154F | 11.35 | 4.5:1 |
| dark | `--info` | `--surface-2` | #7ADCFF | #20154F | 10.54 | 4.5:1 |
| dark | `--neon-pink` | `--surface-2` | #FF4DB8 | #20154F | 5.47 | 4.5:1 |
| dark | `--neon-cyan` | `--surface-2` | #2EE6FF | #20154F | 10.83 | 4.5:1 |
| dark | `--neon-lime` | `--surface-2` | #86FF5C | #20154F | 12.85 | 4.5:1 |
| dark | `--neon-violet` | `--surface-2` | #B79BFF | #20154F | 7.14 | 4.5:1 |
| dark | `--control-edge` | `--surface-2` | #8F80DC | #20154F | 4.91 | 3:1 |
| dark | `--focus-ring` | `--surface-2` | #5EF0FF | #20154F | 12.00 | 3:1 |
| light | `--ink` | `--surface-2` | #1A1040 | #ECE5FF | 14.44 | 4.5:1 |
| light | `--ink` | `--surface-3` | #1A1040 | #DDD2FF | 12.36 | 4.5:1 |
| light | `--ink-muted` | `--surface-2` | #463B86 | #ECE5FF | 7.72 | 4.5:1 |
| light | `--ink-muted` | `--surface-3` | #463B86 | #DDD2FF | 6.61 | 4.5:1 |
| light | `--ink-subtle` | `--surface-2` | #574C96 | #ECE5FF | 5.98 | 4.5:1 |
| light | `--primary` | `--surface-2` | #5B21D6 | #ECE5FF | 6.54 | 4.5:1 |
| light | `--on-primary` | `--primary` | #FFFFFF | #5B21D6 | 7.97 | 4.5:1 |
| light | `--ok` | `--surface-2` | #087040 | #ECE5FF | 5.06 | 4.5:1 |
| light | `--bad` | `--surface-2` | #C1123A | #ECE5FF | 5.04 | 4.5:1 |
| light | `--warn` | `--surface-2` | #8A5A00 | #ECE5FF | 4.86 | 4.5:1 |
| light | `--info` | `--surface-2` | #1250A8 | #ECE5FF | 6.29 | 4.5:1 |
| light | `--neon-pink` | `--surface-2` | #C4157F | #ECE5FF | 4.58 | 4.5:1 |
| light | `--neon-cyan` | `--surface-2` | #006B8F | #ECE5FF | 4.92 | 4.5:1 |
| light | `--neon-lime` | `--surface-2` | #256F00 | #ECE5FF | 5.14 | 4.5:1 |
| light | `--neon-violet` | `--surface-2` | #6A3DF0 | #ECE5FF | 4.87 | 4.5:1 |
| light | `--control-edge` | `--surface-2` | #7566C0 | #ECE5FF | 3.90 | 3:1 |
| light | `--focus-ring` | `--surface-2` | #0B4BD6 | #ECE5FF | 5.76 | 3:1 |

**Player colours** (pieces, dots, lane tokens). A piece is `fill + 2 px edge + shape + letter`, so
legibility never depends on the fill alone. Edge-to-fill contrast, measured:

| Player | Shape | Fill (dark) | Fill (light) |
| --- | --- | --- | --- |
| P1 red-pink | circle | #FF5A7A | #C8123F |
| P2 yellow | triangle | #FFD23F | #D99A00 |
| P3 blue | square | #38C8FF | #1676D6 |
| P4 green | diamond | #5DFF9A | #1A9250 |

| Context | Foreground | Background | FG hex | BG hex | Ratio | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| P1 red-pink piece, dark | edge | fill | #140A2E | #FF5A7A | 6.29 | 3:1 |
| P1 red-pink piece, light | edge | fill | #1A1040 | #C8123F | 3.03 | 3:1 |
| P2 yellow piece, dark | edge | fill | #140A2E | #FFD23F | 13.07 | 3:1 |
| P2 yellow piece, light | edge | fill | #1A1040 | #D99A00 | 7.19 | 3:1 |
| P3 blue piece, dark | edge | fill | #140A2E | #38C8FF | 9.77 | 3:1 |
| P3 blue piece, light | edge | fill | #1A1040 | #1676D6 | 3.86 | 3:1 |
| P4 green piece, dark | edge | fill | #140A2E | #5DFF9A | 14.59 | 3:1 |
| P4 green piece, light | edge | fill | #1A1040 | #1A9250 | 4.42 | 3:1 |

**Board materials** are theme-independent (a neon cabinet screen is dark in both themes). Text printed on them:

| Context | Foreground | Background | FG hex | BG hex | Ratio | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| neon glass (line, memory, maze boards) | label | material | #E6FBFF | #0D0826 | 18.16 | 4.5:1 |
| blue frame (drop board) | label | material | #FFFFFF | #1B2A8F | 11.83 | 4.5:1 |
| card back (memory) | label | material | #FFE27A | #2B1A7A | 10.72 | 4.5:1 |
| card face (memory, choices) | label | material | #140A2E | #FFF7D6 | 17.55 | 4.5:1 |
| radar glass (battle) | label | material | #5DFFA0 | #04141A | 14.53 | 4.5:1 |
| court (rally) | label | material | #EAFFF4 | #0B3A2F | 12.11 | 4.5:1 |
| arcade-red button (race) | label | material | #FFFFFF | #B3123A | 6.85 | 4.5:1 |

### 3.2 Type

Same three npm packages already bundled (no new dependency); fewer weights shipped.

| Token | Size / line | Use |
| --- | --- | --- |
| `--fs-1` | 13 / 18 | captions, key caps, badges (the minimum, nothing smaller) |
| `--fs-2` | 15 / 22 | secondary text, table cells, chips |
| `--fs-3` | 17 / 26 | body, inputs, buttons (≥ 16 px also stops iOS zoom on focus) |
| `--fs-4` | 19 / 28 | lead paragraphs, card titles |
| `--fs-5` | 24 / 30 | section headings (h3) |
| `--fs-6` | 30 / 36 | page headings (h2) |
| `--fs-7` | clamp(34, 5vw, 48) / 1.1 | page titles (h1) |
| `--fs-8` | clamp(42, 7vw, 68) / 1.05 | landing hero only |

Bigger on purpose (owner request, D6): today's body is 15 px and much of the UI is 9-11 px; the new
base is 17 px with a 13 px floor, so it reads well on a phone held at arm's length and on a desktop.

Weights: 400 body, 500 UI labels, 600 buttons and card titles, 700 headings. Small-caps "eyebrow"
labels (10 px mono, letter-spaced, today everywhere) are replaced by sentence-case 13 px `--ink-muted`
labels. `font-variant-numeric: tabular-nums` on every score, timer and counter, so digits never jiggle.

### 3.3 Space, radius, elevation, motion, layout

- **Space (4-pt):** `--sp-1 4`, `-2 8`, `-3 12`, `-4 16`, `-5 24`, `-6 32`, `-7 48`, `-8 64`, `-9 96` px.
- **Radius:** `--r-1 4` (pieces, key caps), `--r-2 8` (inputs, buttons, chips), `--r-3 12` (cards, panels), `--r-4 20` (dialogs, hero), `--r-pill 999`. Boards use their own small radii (a real board has 2–6 px corners).
- **Elevation** (superseded by §11: arcade tokens use hard offset shadows plus dark-theme glows; the numbers in this bullet describe the first draft): `--shadow-1` `1px 2px 3px / .30` (cards at rest), `--shadow-2` `2px 6px 16px / .30` (hover, popovers), `--shadow-3` `4px 18px 44px / .36` (dialogs). Plus `--shadow-inset` (wells, board grooves), `--shadow-piece` (`1px 2px 3px / .45`), and `--press` (button depth: the 3 px "ledge" under a button collapses to 1 px on `:active`).
- **Motion:** `--dur-1 100ms` (hover/press), `--dur-2 180ms` (state change), `--dur-3 280ms` (dialog, drawer), `--dur-4 600ms` (disc drop, card flip, reveal). Easing `--ease-out cubic-bezier(.2,.7,.2,1)` and `--ease-io cubic-bezier(.4,0,.2,1)`. Under `prefers-reduced-motion: reduce`: all durations become 0 except opacity cross-fades ≤ 120 ms; no transforms, trails, pulses or parallax.
- **Layout:** works from **320 px**; breakpoints 480 / 720 / 1024 / 1280; content max-width 1200; sidebar 240 px from 1024 up, bottom bar below. Touch targets ≥ 48×48 (WCAG asks for 44; we go bigger on purpose, D6). Inline links get 48 px of hit area. **Boxes are big:** game cards are at least 300 px wide (1 column up to 640 px, 2 up to 1024 px, 3–4 above), card titles use `--fs-4`, panels pad with `--sp-5`, and the board uses `min(100%, 78vh)` so it fills the screen on a phone and a desktop. Focus ring: `outline: 2px solid var(--focus-ring); outline-offset: 2px` on every focusable element, never removed; plus a 1 px inner `--surface-1` ring on dark photos.
- **Images in layout:** every image sits in a box with a fixed `aspect-ratio` (cards 16:10, hero 16:9, lobby banner 21:9) and carries `width`/`height`, so loading cannot shift anything (CLS target < 0.1).

## 4. Component inventory

| Component | Variants | States that must be visible | Notes |
| --- | --- | --- | --- |
| Button | primary, secondary (outlined), quiet (text), danger; sizes md (48 px), sm (40 px, only in dense tables), icon-only (48×48) | hover, `:focus-visible`, active (`--press`), disabled (text + 3:1 border kept, not just 45% opacity), loading (spinner + `aria-busy`) | primary = `--primary` fill + `--on-primary` text |
| Field | text, search, select, checkbox/switch, radio group | focus, invalid (icon + message linked with `aria-describedby`), disabled, read-only | label always visible; border `--control-edge` |
| Card | game card, panel, stat tile | hover (lift to `--shadow-2`), focus, pressed, favourite on/off | whole card is one link/button; favourite is a separate 48 px button |
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
| Shell | 252 px dark sidebar with "PSD ™" lockup, promo card, "YOUR ARCADE / QUICK PLAY" mono captions; topbar with ⌘K search, status pill, theme, bell, profile; extra breadcrumb strip; 5-item mobile bar | Calm 240 px sidebar (logo, 3–4 nav, connection status at the bottom: wording unchanged), slim topbar (search, theme, inbox, profile), breadcrumb strip removed (the page `h1` does that job), skip-link to `#page-content`, bottom bar ≥ 56 px tall with 48 px targets on mobile |
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
| Recovery screen | card with "!" badge | Same text, wider card, `role="alert"`, buttons ≥ 48 px, works with zero CSS images |
| Toasts | bottom-right pill, rebuilt on each paint | Persistent live region, stacked, dismissible, pause on hover/focus |
| Favicon / social | data-URI SVG, no OG | `favicon.svg`, 48 px PNG/ICO, 180 px apple-touch-icon, `og-image.jpg` 1200×630, OG + Twitter tags |

## 6. Per-game image brief

> Status: the 40 per-game photos follow this brief (warm, real objects). The hero, category covers, social image, backdrop and trophy were regenerated as neon arcade art (§11.4); the game photos are unified in the UI with a scanline overlay, saturation and a category-coloured frame until they are regenerated in neon.

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
- Dark + light + 320 px checked per board (board scales by `min(100%, 78vh)` with `aspect-ratio`; the one known exception to 48 px targets is the 9×9 Gomoku board: full-bleed at 320 px its cells are ≈ 35 px, so it gets a visible focus/press state and zoom-friendly spacing, and the PR will say so).
- Ten boards, ten sets of jsdom tests: markup contract (labels, roles, disabled states), win/last-move classes, keyboard handler maps, no ≤ 11 px text.

### 7.2 Per engine

> The **Physical object** column below is the first-draft wording. The arcade materials in §11.3 replace it; the layout, states, keyboard and motion columns still apply unchanged.

| Engine (games) | Physical object | Layout and states | Keyboard and a11y | Motion (reduced-motion twin) |
| --- | --- | --- | --- | --- |
| **line** (3×3, 9×9) | Maple board with routed grid lines (`maple`, `walnut` border); turned-wood X and O pieces with `--shadow-piece` | Square board; empty cell shows faint ghost of your piece on hover/focus; last move ringed; winning line drawn as a brass bar and the pieces lift 2 px | `role="grid"` → real `row`/`gridcell` wrappers with the `<button>` inside; `aria-label="Row 2, column 3, empty"` / `"…, X by Sam"`; arrows move focus between cells, Enter/Space places | Piece settles 180 ms (instant) |
| **drop** (7×6, 8×7) | Upright blue frame (`frame-blue`), round holes with inner shadow, red/yellow discs with a bevel; base feet | Hover/focus on a column lights a ghost disc above it; full column shows a lock icon; winning four get a ring + glow | Column buttons above the frame; **←/→ choose a column, Enter/Space drops**; each column labelled "Column 3, 2 free"; discs get `aria-label` per cell in a visually hidden list | Disc falls with gravity ease 600 ms (instant, ghost fades) |
| **memory** (12/16 cards) | Cards on a table: patterned navy backs (`card-back`), cream faces with a printed symbol | 4 columns; flipped cards show symbol **and** a text name; matched pairs sink 2 px and take the owner's tint + their shape badge; per-player pair counter in the strip | Cards are buttons in a labelled group, "Card 5 of 12, face down" / "Card 5, star, matched by Alex"; arrows move focus; Enter flips | 3D flip 600 ms (cross-fade 120 ms) |
| **race** | Lanes on a track with ticks (`slate`/felt); one token per player; big plastic button with a 6 px ledge | Progress ticks = score; "3, 2, 1" countdown card; you = labelled "You"; finish line flag icon | Button reachable by Tab, **Space/Enter** both fire; `aria-label="Boost, 7 of 16"`; keeps focus across repaints (A6); `event.repeat` decision D5 | Button depresses 100 ms; token slides 180 ms (jump) |
| **rps / coin / dice** | Hand signs, a two-faced coin and pipped dice as inline SVG on felt | Three/two/six large choice buttons with icon + word; locked choice shows a check and "Locked in"; result card shows both picks, winner and a round history list | Radio-like group (arrows + Enter); result announced in the live region | Hands shake 3×, coin rotates, dice tumble ≤ 600 ms (swap to final face) |
| **quiz** | Question card on paper (`surface-1`), answer buttons with letter badges A–D | Countdown ring (text seconds inside it); per-player score strip; after reveal: correct = check icon + "Correct", yours-wrong = cross icon + "Your answer" (colour-blind safe: shapes differ, not just green/red) | Buttons keys **A–D** and 1–4 also answer; the reveal text goes to the live region; "Next question" gets focus after reveal | Ring drains linearly (static text only) |
| **maze** | Tiled floor, walls with top/side bevel, star at the exit (`slate` + stone) | Player tokens use shape+letter; footsteps counter per player; D-pad keys ≥ 56 px on touch (shown only on `pointer: coarse`) | Board is `tabindex="0"` with `aria-label` "Maze, use arrow keys"; **arrows** move (ignored while typing in an input); D-pad buttons duplicate; focus never leaves the board | Token slides 100 ms (jump) |
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

## 9. Decisions (owner answers, session 2)

| # | Decision | Status |
| --- | --- | --- |
| D1 | Branching | **Decided:** all phases stack as commits on PR #13's branch (`arena/01a0f6c5-psd-gaming`). |
| D2 | Imagery | **Decided:** a dedicated image for every game, generated by the agent, labelled `generated` in `CREDITS.md`. Faces avoided. |
| D3 | Fonts | Default stands: the three installed packages, no new dependency. |
| D4 | Brand "™" | Default stands: dropped. |
| D5 | Race Space-bar `event.repeat` | Default stands: repeats ignored. Say so if you want the old feel back. |
| D6 | Size | **Decided:** bigger text and bigger boxes for mobile and PC (see 3.2, 3.3). |
| D7 | Direction | First decided "game table" (warm, realistic). **Superseded by the owner's arcade request (§11):** neon, bold, playful, with the ideas from the owner's old Pixel Party Arcade codebase (section 10). |

## 10. What was taken from the owner's old codebase

Reviewed: `agon-agent_1-7f97644b.zip` on `main` (old React + Tailwind + Supabase "Pixel Party Arcade",
57 files, no photos). The owner confirmed the rights. Only *ideas* are reused; no code, framework, font
import or asset is copied.

| Idea in the old code | Adopted as |
| --- | --- |
| `.pixel-btn`: chunky button with a 4 px ledge that collapses on press | `--press` (3.3); every primary/secondary button and the race button |
| `MobileControls`: 56 px D-pad and round action keys, shown only for touch (`pointer: coarse`), hold-to-repeat | Maze D-pad and race button on touch (7.2); repeat is a UI concern and respects D5 |
| `TurnBanner`: pill with a dot that says whose turn it is | Board status line (7.1): a pill with icon + text, `aria-live`, **no** blinking under reduced motion |
| Score chips with "me" and "lead" states | Score strips (memory, rally, quiz): "You" and a trophy icon on the leader, not colour alone |
| `WinnerOverlay`: result card, scores, rematch button, confetti | Result card with replay (5); confetti only without reduced motion, and never over the board controls |
| `.stage`: one shared framed play area for every game | The board "table" surface (7.1): same frame, different material per engine |
| Bottom tab bar with `env(safe-area-inset-bottom)` | Mobile nav (5) |
| Category tiles with their own accent | Four category covers (6) |
| `prefers-reduced-motion` block | Kept and extended: every effect has a twin (3.3) |

Deliberately **not** taken: the Google Fonts `@import` (the CSP forbids it), the Arena recording and
element-picker scripts at the top of its `index.html` (they load `rrweb` from a CDN), Tailwind/React/lucide
(new frameworks are forbidden), 7–9 px "Press Start 2P" labels, and the
48-game list (Chess, Ludo, …): the engine baseline freezes exactly these 40 games.

## 11. Direction change: arcade (owner request, supersedes the warm draft)

The owner asked for a full arcade look: neon, bold, playful, never boring, on the images, the interface and the boards. Everything in §2, §3 (tokens), §6 (hero/covers) and §7 (materials) that says warm, wood, felt or brass is superseded by this section. Accessibility, performance, the engines and the catalog are unchanged.

### 11.1 Palette rationale

- **Surfaces** are deep indigo, not black (`--bg` #0B0720 up to `--surface-3` #2E2068), so neon has something to glow against and the page does not look like a plain dark mode.
- **One primary.** Yellow `--primary` #FFD23F with dark ink in the dark theme; violet #5B21D6 with white ink in the light theme. Primary buttons have a 4 px ledge (`--primary-ledge`) that collapses on `:active`.
- **Neon accents** `--neon-pink`, `--neon-cyan`, `--neon-lime`, `--neon-violet`, `--neon-yellow` are used for borders, glows, headings and category colours (Arcade pink, Party violet, Strategy cyan, Puzzle lime). In the light theme they are darkened until each one is at least 4.5:1 on `--surface-2` (the contrast table in §3.1 holds the measured values), so they are safe for text.
- **Status** colours (`--ok`, `--bad`, `--warn`, `--info`) are separate from the neon accents and are never the only signal.

### 11.2 Effects

- **Hard shadows**: `--shadow-1/2/3` are offset, not blurred. **Glows** (`--glow-*`, `--text-glow`, `--primary-glow`) exist in the dark theme only; in the light theme they become a solid outline or nothing, because blurred light on white reads as dirt.
- **Scanlines** (`--scanlines`) are a faint repeating gradient on the game stage and game photos, `none` in the light theme.
- **Backdrop**: `public/images/backdrop.webp` sits in a fixed `body::before`, washed with `--page-wash` (90 % indigo / 93 % lavender), so text contrast is measured against the wash, not the picture.
- **Motion** (each has a `prefers-reduced-motion` twin that stops it): the blinking "PRESS START" line, the scrolling marquee strip under the hero (decorative, `aria-hidden`), the pulsing turn chip, the pulsing win banner.

### 11.3 Boards

Boards are **theme-independent glass**: `--board-glass` #0D0826 with `--board-ink` text and the board player colours `--bp1..4` (the dark-theme `--p1..4` values, #FF5A7A / #FFD23F / #38C8FF / #5DFF9A), so a board looks the same in both themes. Board edges use the fixed `--bn-*` neons: line cyan, drop pink, memory violet, maze lime, battle radar green, rally court white, duel pink. Controls and score strips outside the glass keep the themed tokens. Piece edges and shapes are unchanged (colour is never the only signal), and the geometry, `data-action` names and `data-*` payloads are unchanged.

### 11.4 Images

New generated art (see `public/images/CREDITS.md`): hero, four category covers, social image, backdrop, trophy, favicon and touch icon, built by `scripts/build-arcade-art.sh`. Budgets are unchanged (full-size <= 150 KB; game-photo 640 px variants <= 36 KB, category-cover 640 px variants <= 40 KB, because the covers are denser).
