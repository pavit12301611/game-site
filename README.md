# PSD-gaming

A lightweight, responsive browser arcade for laptops and phones. The shelf contains **40 original retro-style mini-games** with ten compact rulesets, local practice against a browser rival, private 2–3 player rooms, username friends, direct game invites, optional email accounts, guest play, and a UID-gated admin area.

The games are original mini-games and variations, not bundled copyrighted ROMs or downloaded emulators. That keeps the app small, quick to load, and safe to deploy.

## Run it locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm test
npm run dev
```

Open the Vite URL printed in the terminal. **Without Firebase**, the home page, all 40 game cards, and local practice mode work, and the app says plainly why online play is off (see [Connection status](#connection-status-what-the-labels-mean)). Online rooms, accounts, usernames, friends, and admin data become active once Firebase is configured.

### Turn on online mode locally (`.env.local`)

Copy `.env.example` to a root-level `.env.local` (Git ignores it) and replace every placeholder with the values from your own Firebase Web app. There is **one variable per Firebase config field**:

```dotenv
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
```

| Variable | Firebase config field | Required |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` | yes |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` (bare host, no `https://`) | yes |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` | yes |
| `VITE_FIREBASE_APP_ID` | `appId` | yes |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` | optional |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | optional |
| `VITE_FIREBASE_MEASUREMENT_ID` | `measurementId` (Analytics is not used) | optional |

- Paste the **bare value**: no quotes, no trailing comma, no trailing `;`. (Vite's `.env` parser quietly strips quotes, but Vercel does not, so do not get used to them.)
- Restart `npm run dev` after editing the file. The terminal prints `[psd-gaming] ✔ The VITE_FIREBASE_* variables are set …` or names exactly which variable is missing or wrong.
- Copying `.env.example` unchanged is rejected on purpose (`placeholder text in: …`), so a file with unfilled required values never looks configured.
- **Older alternative (still supported):** a single `VITE_FIREBASE_CONFIG` variable holding the whole config as one line of raw JSON. It is only used when none of the `VITE_FIREBASE_*` variables above has a value; if both exist, the separate variables win.

To see both states: run `npm run dev` **without** `.env.local` and you get **Local practice mode** with an explanation banner and a console error. Add the file, restart, and the status becomes **Online rooms ready**.

### Run against the Firebase emulators (optional)

The Emulator Suite runs Firestore and Auth on your own machine, so rooms, profiles and friends can be exercised without touching the real project. It needs **Java 11+** (the emulator is a JVM app).

```bash
npm run emulators   # Firestore on 127.0.0.1:8080, Auth on 9099
npm run dev:emu     # starts the emulators, runs `npm run dev` against them, shuts them down after
```

Point the app at them by adding these lines to `.env.local` (all but the first are optional):

```dotenv
VITE_USE_FIREBASE_EMULATOR=1
VITE_FIREBASE_EMULATOR_HOST=127.0.0.1
VITE_FIRESTORE_EMULATOR_PORT=8080
VITE_FIREBASE_AUTH_EMULATOR_PORT=9099
```

Two things to know: the flag is **ignored by a production build** (`vite build`), so a deployment can never end up talking to `localhost`; and Firebase still needs a valid-looking `VITE_FIREBASE_*` config to start at all, because the emulator is only a different address for the same SDK.

## Project layout

`src/main.js` is only the entry point (stylesheet + app). Everything else is a module:

| Module | What it owns |
| --- | --- |
| `src/app.js` | Event handlers and the wiring of all modules. ~400 lines; used to be the whole app. |
| `src/boot.js` | Start-up: exactly one first paint, whatever the Firebase branch does (see below). |
| `src/state.js` | The one mutable `state` object and the derived getters (`currentGame`, `currentPlayers`, …). |
| `src/render.js` | `render()`: repaint `#app` from state, with a recovery screen if drawing ever throws. |
| `src/router.js` | The hash router (`#/home`, `#/room/<id>`, …) and what landing on a page means. |
| `src/errors.js` | Turns a Firebase error into a sentence a player can act on. |
| `src/connection.js` | The single connection verdict (Firebase setup + browser online) every view shows. |
| `src/accounts.js` | Guests, email/password, Google, the atomic username claim, the admin flag. |
| `src/social.js` | Friend search, requests, the live friend/invite listeners. |
| `src/cpu.js` | Local practice and the CPU opponent, using the same engines as online play. |
| `src/diagnostics.js` | The setup dialog's "Run check" button. |
| `src/online/session.js` | `ensureOnlineUser()`: guests are anonymous accounts, so a link never forces a sign-up. |
| `src/online/rooms.js` | Create a room, join by link, start the match, make a move (all transactional). |
| `src/online/presence.js` | "Who is still in this room": your heartbeat in `rooms/{roomId}/presence/{uid}`, everyone else's read back (see below). |
| `src/presence-status.js` | The pure half of presence: the here / away / left verdicts and the heartbeat loop, unit-tested with fake timers. |
| `src/online/admin.js` | The admin dashboard's reads. |
| `src/views/` | Pure "state in, HTML out": `shell`, `pages`, `modals`, `boards`, `fatal`. |
| `src/ui/` | Small pieces: `html` (icons, escaping), `players`, `toast`, `theme`, `sound`, `prefs`, `links`. |
| `src/engines/` | One module per game engine, with the catalog in `src/catalog.js`. |
| `src/firebase*.js` | Config parsing, validation, initialization, error wording, emulator switch. |
| `src/styles/` | The design system: `tokens`, `base`, `components`, `shell`, `home`, `rooms`, `boards`, `modals` (see below). |
| `src/a11y.js` | Live region, focus restore after a repaint, dialog focus and Tab trap, arrow keys in boards. |
| `docs/design-reboot.md` | The visual-reboot brief: audit, tokens with measured contrast, component list, per-game image brief and per-engine board spec. `tests/design-brief.test.js` recomputes its numbers. |

Rules for contributing to this layout: views never write to state and never talk to Firebase;
modules never import `src/app.js` (it is the wiring, so that would be a cycle); and every string
that came from another player goes through `esc()`.

### Start-up never leaves the page blank

`src/boot.js` owns the start-up sequence. In local practice mode it paints at once. With Firebase
configured it subscribes to the sign-in state, asks Firebase whether a Google redirect just finished,
and *then* paints - but the paint is guaranteed: a collaborator that throws, a rejected promise or a
misbehaving Firebase API is logged (and, for the redirect, shown in the sign-in dialog) and the shell
is drawn anyway. The collaborators are passed in from `src/app.js`, which is what lets
`tests/boot.test.js` run the Firebase branch in Node. The production outage that motivated this was
a `ReferenceError` in that branch: two functions called in `src/app.js` without an import, which
stopped the first paint on Vercel only - every local run has `firebaseReady === false`.

### Presence: who is still in the room

An online room shows, next to every player, whether they are still there. Each member writes a tiny heartbeat document, `rooms/{roomId}/presence/{uid}` = `{ status: 'here' | 'left', lastSeenAt: <server time> }`, every 25 seconds while their tab is visible, and every member listens to the room's heartbeats. Guests have no profile document, and the question is about *this* room, so presence lives with the room and not with the profile.

| You see | Meaning |
| --- | --- |
| **IN THE ROOM** (lobby) / the usual line (match rail) | A heartbeat in the last 60 seconds - or no heartbeat document at all. A missing document is shown exactly like "here": presence is advisory, and a client from before this feature must never read as an accusation. |
| **AWAY · 2 MIN** / *Away for 2 min* | The last heartbeat is older than 60 seconds: the tab is hidden, closed, or offline. Guests waiting for an away host are told so, with the option to leave. |
| **LEFT THE ROOM** / *Left the room* | The player used **Leave game** or navigated away on purpose. Closing the tab does *not* write "left" - it becomes "away" a minute later - so glancing at a message on a phone never brands anyone as having walked out. |

Design notes, so nobody undoes them by accident:

- The room re-renders only when a *verdict* changes, never on a heartbeat itself: a repaint every few seconds would reset the **How to play** panel and the scroll position mid-game. A timer re-checks the verdicts every 10 seconds, which is how a quiet player turns from "here" into "away" without any new data arriving.
- Heartbeats are compared with the *server* clock (`lastSeenAt` must be `request.time`, see `firestore.rules`), and each client measures its own clock offset from its own acknowledged heartbeat. A laptop whose clock is a minute slow does not see everyone as away.
- A hidden tab stops beating on purpose and beats the moment it is visible again, so coming back is noticed within a second.
- Leaving a waiting room deletes your heartbeat in the same transaction that gives the seat back (or deletes the room), so a deleted room leaves no documents behind. Nobody can write anyone else's heartbeat, and only the room's members can read them.
- **Cost:** a visible member writes about 144 heartbeats per hour, and each write costs one rules `get` of the room document on top. On the free Spark plan (20 000 writes a day) that is roughly 140 player-hours of open rooms per day, far above what casual rooms use, but keep it in mind before shortening `HEARTBEAT_MS`.
- If the deployed rules predate presence, the first heartbeat is denied: the app logs one `console.warn` with the fix (publish the latest `firestore.rules`) and turns presence off for that room. Rooms and moves keep working as before.

### Design system (`src/styles/*.css`)

Eight small stylesheets, imported in this order by `src/main.js`: `tokens` (every value), `base` (reset, type,
focus ring, `.sr-only`), `components` (buttons, chips, forms, cards), `shell` (sidebar, topbar, mobile nav),
`home` (landing and catalog), `rooms` (lobby, game screen, friends, admin), `boards` (the ten game boards) and
`modals`. The full reasoning, with measured contrast for every token pair, is in `docs/design-reboot.md`.

- **Tokens first.** Colours, sizes, spacing, radii, shadows and timings are custom properties in
  `tokens.css`. Dark is the default; `[data-theme='light']` swaps the same names. Both themes are first-class:
  the token pairs are measured in `docs/design-reboot.md` (text 4.5:1, controls 3:1) and recomputed by
  `tests/design-brief.test.js`. The board glass (`--board-glass`, `--board-ink`, `--bp1..4`, `--bn-*`) is theme-independent and
  defined as tokens too.
- **Arcade look.** Deep indigo surfaces (`--bg`, `--surface-1/2/3`), light-lavender ink (`--ink`, `--ink-muted`,
  `--ink-subtle`), one yellow primary (`--primary`; violet in the light theme) with a hard 4 px "ledge" under
  primary buttons, and neon pink, cyan, lime and violet accents for categories, boards and focus. Player colours
  (`--p1` ... `--p4`) are always paired with a shape and a letter, never colour alone. See `docs/design-reboot.md` §11.
- **Type.** Chakra Petch for headings and buttons, Inter for reading, JetBrains Mono for labels and room
  codes, all installed from npm (`@fontsource/*`) so the strict CSP (`font-src 'self' data:`) holds. Body text
  is 17 px (`--fs-3`), the smallest text anywhere is 13 px (`--fs-1`), the landing headline is fluid up to 68 px.
- **Targets and spacing.** Every control is at least 44 px and normally 48 px (`--target`). Spacing is the
  `--sp-1` ... `--sp-9` scale (4 to 96 px). Radii: `--r-1` 4 px (pieces), `--r-2` 8, `--r-3` 12 (cards),
  `--r-4` 20 (hero, dialogs), `--r-pill`. Elevation is three hard-edged offset shadows; neon glows are an extra layer in the dark theme only.
- **Pictures.** Every image sits in a box with a fixed `aspect-ratio` and carries `width`/`height`, so loading
  cannot shift the page. Each game has its own generated photo (`public/images/games/<id>.webp`, 1280x800, plus
  a 640 px `srcset` variant); the hero, the four category covers (`public/images/categories/`), the social image,
  the page backdrop, the trophy and the icons are neon arcade art generated for this project and sized by
  `scripts/build-arcade-art.sh`. Every file is listed in
  `public/images/CREDITS.md`. Only the hero is eager (`fetchpriority="high"`, preloaded from `index.html`);
  everything else is `loading="lazy"` and `decoding="async"`.
- **Boards are cabinet screens.** Every board is a dark neon glass panel in both themes, with its own edge
  colour (cyan line board, pink drop frame, violet memory grid, lime maze, green radar, court-white rally). Colour is never the only signal: wins, last
  moves, hits and misses also change shape, icon or text.
- **Keyboard and screen readers** live in `src/a11y.js`: one persistent `aria-live="polite"` region outside
  `#app` (the turn, the result and toasts), focus that survives `render()` repainting the page, dialog focus
  (in, trapped, returned to the opener on Escape), arrow keys inside grid-like boards (`data-nav="grid"` /
  `"row"`), and number keys for quiz answers (1-4, A-D) and rally lanes (1-3).
- **Motion is optional.** `prefers-reduced-motion: reduce` removes every transition and animation; the markers
  that motion would have drawn (last move, win line, hit) stay.
- **Dev-only image scripts** (not part of the app, not dependencies; they need ImageMagick):
  `scripts/build-images.sh <dir> [ids]` turns a source picture into the two budgeted WebP files for a game
  (<= 150 KB and <= 36 KB); `scripts/build-arcade-art.sh <dir>` turns the arcade source pictures into the hero, covers, social image,
  backdrop, trophy and icons. To replace a game's picture with a real photo, keep the file names and fix its line in
  `CREDITS.md`; `tests/artwork.test.js` checks sizes, uniqueness and credits.

The fonts are imported in `src/main.js`, so Vite hashes them into `dist/assets/` with the rest of the bundle.

## Tests and CI

```bash
npm test            # unit tests: no network, no Firebase credentials, no Java
npm run typecheck   # tsc --checkJs over every module under src/ (JSDoc types)
npm run test:rules  # firestore.rules against the Firestore emulator (needs Java)
npm run audit       # npm audit --omit=dev --audit-level=high: only what ships to the browser
```

- `.github/workflows/ci.yml` runs `npm ci`, `npm test`, `npm run typecheck` and `npm run build` on every push and pull request, a `firestore-rules` job that installs Java and runs the emulator rules tests, and an informational `npm audit` job.
- `npm run audit` checks **what ships to the browser** (`--omit=dev`): the app has one runtime dependency, `firebase`. Advisories in the build and emulator tooling never reach a player, are not part of the deployed bundle, and are tracked by Dependabot instead, which opens grouped weekly pull requests - forcing them to block a release would only train everyone to ignore the job. The one production advisory found so far (`@firebase/firestore` pinning an old `@grpc/grpc-js`) is fixed with an npm `overrides` entry rather than by downgrading Firebase.
- Dependabot (`.github/dependabot.yml`) opens one grouped pull request for patch and minor updates every week. Major upgrades, such as `firebase` 12 or `vite` 8, arrive alone so they can be reviewed and tested on their own.
- `tests/app-render.test.js` boots the real UI in jsdom with no Firebase configured and walks the local-practice flow. Its first test is the start-up contract: `.app-shell`, the sidebar brand and the hero are in `#app`, the recovery screen is not, and nothing was written to `console.error` while the app loaded.
- `tests/unresolved-identifiers.test.js` runs `tsc` from `src/main.js` (via `tests/tsconfig.entry-point.json`), following every import like the bundler does, and fails on any name or export that does not exist (TS2304/2552/2305/2724). Rollup treats an unknown identifier as a global and builds happily; this test is what turns a missing import into a red CI run. It also checks that `jsconfig.json` never excludes a `src/` file again.
- `tests/boot.test.js` runs the start-up sequence with stand-ins for Firebase and asserts that the page is painted exactly once in every failure mode.
- `tests/presence-status.test.js` drives the presence verdicts and the heartbeat loop with fake timers (away after 60 s, hidden tabs pause, a failing beat is only a missed beat); `tests/presence-render.test.js` renders the lobby, the host-wait line and the match rail in jsdom with faked heartbeat documents and checks what each verdict looks like, including that a missing document reads exactly as before. The presence rules are executed by `tests/rules-emulator.test.js` (CI) and guarded structurally by `tests/firestore-rules.test.js`.
- `tests/production-boot.test.js` is the one test that runs with `firebaseReady === true`: it builds the real bundle into a temporary directory with fake but well-formed `VITE_FIREBASE_*` values, loads it in jsdom with the network refused, and asserts that the shell is painted, that the sidebar says online rooms are ready (so the Firebase branch really ran), and that nothing was fetched, logged to `console.error` or left as an unhandled rejection. Against the pre-fix `src/app.js` it reports the two `ReferenceError`s the Vercel console showed. It adds a few seconds to `npm test`; that is the price of testing what actually ships.
- The game rules are locked by `tests/fixtures/engine-baseline.json`, which fingerprints every state of all 40 games and replays them on every run. If you change a rule on purpose, regenerate it with `node tests/fixtures/generate-engine-baseline.mjs` and say so in the pull request.

### Type checking is JSDoc, not a rewrite

`jsconfig.json` runs `tsc --checkJs` over **every** module under `src/`, the entry point and the
wiring layer included, with the shared shapes named once in `src/types.js`. `src/vite-env.d.ts`
pulls in Vite's ambient types so the stylesheet imports in `src/main.js` and `import.meta.env` are
known to `tsc`. `noImplicitAny` is off and gets switched on per module once the annotations are in
place.

Nothing under `src/` may be excluded from the typecheck (a test enforces it): `src/app.js` used to be,
and that is how six calls to functions it never imported reached production as a blank page.

`src/app.js` (about 400 lines, down from 1622) is what is left of the old single file: the event
handlers and the wiring. Every feature it used to hold now lives in a module of its own - see
[Project layout](#project-layout).

## Connection status: what the labels mean

The sidebar, top bar, home hero, friends page, and dialogs all show the same status. It is computed from two real facts: did Firebase start from a valid config, and does the browser report that it is online? Nothing is hard-coded.

| Label | When you see it | What to do |
| --- | --- | --- |
| **Online rooms ready** | The Firebase config was found and validated, Firebase initialized, **and** the browser is online. | Nothing. This does **not** prove the Firebase project has its sign-in methods enabled or its rules published. Use **Setup guide → Run check**, or try a guest room. |
| **Offline · local play** | The config is fine, but the browser is offline. | Reconnect. Local practice keeps working and the online buttons stay disabled until you are back. |
| **Local practice mode** (plus a setup banner) | The config is missing or invalid, or Firebase refused to start with it. The banner states the exact reason. | Fix the `VITE_FIREBASE_*` variables and redeploy (or restart `npm run dev`). |

A config problem always wins over "offline": without a valid config the app cannot go online at all, so it never pretends otherwise.

What the setup banner can say:

| Banner text | Meaning and fix |
| --- | --- |
| `Firebase config is missing from this deployment. Add the VITE_FIREBASE_* variables (…) in Vercel and redeploy.` | None of the variables existed when this deployment was **built**: they were never added, they are not enabled for this environment (Production vs Preview), or they were added after the build without a redeploy. |
| `Missing required Firebase variable(s): VITE_FIREBASE_APP_ID, …` | Only some variables are set. The message lists exactly the required ones still missing (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`). |
| `VITE_FIREBASE_API_KEY is wrapped in extra quotes …` | Remove the quotes around the value. |
| `Firebase variables still contain placeholder text in: …` | Replace `...` / `YOUR_…` / `your-project` with the real values. |
| `VITE_FIREBASE_AUTH_DOMAIN must be a bare host name …` | Use `your-project.firebaseapp.com`, without `https://` and without a path. |
| Messages starting with `VITE_FIREBASE_CONFIG …` (empty, extra quotes, JavaScript instead of JSON, missing field) | You are using the older one-line JSON variable. Either fix it, or switch to the separate `VITE_FIREBASE_*` variables. |
| `The VITE_FIREBASE_* variables contain credential-like data …` | A service-account key or OAuth client secret was pasted. See [what must never go in `VITE_*`](#is-the-firebase-config-secret). The build refuses to continue. |
| `Firebase could not start with the config … (auth/invalid-api-key)` | The values have the right shape but Firebase rejected them. Copy the Web app config again. |

The **Setup guide** dialog (home banner, **Game library → How online play works**, or any "Setup guide" link) also lists the live facts: config state, project, auth domain, browser state, the site host to authorize, and which deployment you are looking at (environment, commit, build time). It never shows the API key.

## Exact Firebase + Vercel setup

### 1. Create a Firebase project and Web app

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
2. In **Project settings → General → Your apps**, add a **Web app**. Hosting through Vercel does not require Firebase Hosting.
3. Under **SDK setup and configuration**, choose **Config**. Firebase shows a JavaScript object. Each line becomes its own environment variable:

   ```js
   // what Firebase shows (JavaScript - do NOT paste this as a whole)
   const firebaseConfig = {
     apiKey: "AIza...",                              // -> VITE_FIREBASE_API_KEY
     authDomain: "your-project.firebaseapp.com",     // -> VITE_FIREBASE_AUTH_DOMAIN
     projectId: "your-project",                      // -> VITE_FIREBASE_PROJECT_ID
     storageBucket: "your-project.firebasestorage.app", // -> VITE_FIREBASE_STORAGE_BUCKET
     messagingSenderId: "123456789012",              // -> VITE_FIREBASE_MESSAGING_SENDER_ID
     appId: "1:123456789012:web:abcdef123456"        // -> VITE_FIREBASE_APP_ID
   };
   ```

   Copy only what is **between the quotes** of each line. `measurementId` may stay or go; this app does not use Analytics.

### Is the Firebase config secret?

No. The Firebase Web config (`apiKey`, `authDomain`, `projectId`, `appId`, …) is public browser configuration: Vite copies it into the JavaScript the browser downloads, so anyone can read it. Your data is protected by Firebase Authentication and the Firestore rules below, not by hiding this value.

**Never** put any of these in a `VITE_*` variable, because it would be published with the site:

- a service-account JSON file or an Admin SDK private key,
- an OAuth client secret (Google sign-in through Firebase Auth does not need one in this repository),
- any other real credential.

The app refuses to use such a value, the build stops with an error if it detects one (for example a `private_key`, `client_email` or `client_secret` field, `type: service_account`, a PEM private key block, or a `GOCSPX-` secret), and the repository's tests fail if a Firebase API key or private key is ever committed. If one was pasted somewhere public, rotate it.

### 2. Enable the sign-in choices

In Firebase Console open **Build → Authentication → Get started → Sign-in method**, then click each provider below, switch **Enable** on, and **Save**:

1. **Anonymous**. This lets a person join a shared online room as a guest without creating an account. Firebase creates an anonymous identity in the background so Firestore can enforce room membership.
2. **Email/Password**. This is optional for play; it is needed to keep a username and use the friend list.
3. **Google**. In the Google provider panel, turn on **Enable**, choose a **Project support email** (the support email associated with the Firebase/Google project), and save. The app uses Firebase Auth's `GoogleAuthProvider`; it does not contain a Google OAuth client secret.

If one is missing, the app says which one instead of failing silently: `auth/operation-not-allowed` (and, for a disabled Anonymous provider, `auth/admin-restricted-operation`) is shown as, for example, "Guest play needs Anonymous sign-in, which is not enabled for this Firebase project. In Firebase Console → Authentication → Sign-in method, enable Anonymous."

Local practice needs no Firebase account at all. Online guests do not need to type an email, username, or password. Friend search is for players who chose to create an account and a username.

#### Google sign-in behavior

- **Desktop popup:** the app waits for Firebase to confirm `signInWithPopup` before changing the account UI.
- **Blocked popups and mobile browsers:** the app falls back to Firebase redirect sign-in and processes `getRedirectResult` on startup.
- **Anonymous guest linking:** when a guest chooses **Link Google and keep this guest identity**, the app calls `linkWithPopup`/`linkWithRedirect`. A successful link keeps the same Firebase UID, room membership, and current identity.
- **Already-linked Google account:** Firebase’s `auth/credential-already-in-use` error is handled without deleting either account. The app offers to sign in to the existing Google account; choosing that option switches the browser to that account, while the old anonymous account remains untouched.
- **First Google login:** a Google display name is converted into a suggested 3–18 character PSD-gaming username. The player can edit it, and the claim is made atomically in `usernames/{usernameLower}` plus `profiles/{uid}`. Friend features remain unavailable until a unique name is claimed.

#### Authorized domains

Google sign-in (popup or redirect) only works on hosts Firebase knows about. On any other host it fails with `auth/unauthorized-domain`, and the app answers with the exact host to add, for example: "This site (psd-gaming-git-fix-you.vercel.app) is not an authorized domain for Firebase sign-in. Add psd-gaming-git-fix-you.vercel.app in Firebase Console → Authentication → Settings → Authorized domains, then try again."

1. Firebase Console → **Build → Authentication → Settings → Authorized domains → Add domain**.
2. Add the bare host, without `https://` and without a path: your production host (for example `psd-gaming.vercel.app`) and every custom domain. `localhost` and your `<project>.firebaseapp.com` host are there by default; use `localhost` rather than `127.0.0.1` for local testing.
3. Add each Vercel **Preview** host where you want to test Google sign-in. Firebase needs the exact host (no wildcards), and every preview deployment has its own URL, so the easiest approach is to test Google sign-in on production or on one stable branch alias.
4. The **Setup guide** dialog shows the host of the page you are on under **This site**, so you can copy it exactly.

### 3. Create Firestore and publish the rules

1. Open **Build → Firestore Database → Create database**. Choose a region near your players. Create it in production/locked mode.
2. Open the **Rules** tab.
3. Replace the starter rules with the complete contents of this repository’s [`firestore.rules`](./firestore.rules) file, then click **Publish**.

The rules keep room documents unlistable, limit rooms to their invite link, require Firebase Auth for writes, constrain joining to waiting rooms with open seats, let each member write only their own presence heartbeat under the room (and only members read them), protect friend requests, and make admin flags console-managed only. A link to a room that does not exist reads as "not found" (so players see *invite link is invalid or has expired* rather than a permission error), and admins can additionally list rooms and read `friendships` (the admin dashboard shows both counts). They intentionally do **not** make game outcomes cheat-proof: these are casual peer rooms, not ranked or prize games. For a competitive leaderboard, move authoritative game actions into Cloud Functions / a trusted server. Google accounts use the same authenticated UID checks and existing atomic `usernames`/`profiles` claim rules; no Firestore rule change is required for Google sign-in.

After you click **Publish**, check the rules against the real app once. It takes about two minutes and exercises every rule the game uses:

1. **Setup guide → Run check** passes (guest sign-in and a Firestore read).
2. Browser A: create a room as a guest and copy the invite link. Browser B (or a private window): open the link. Both players appear in the lobby, each marked **IN THE ROOM**. Switch browser B to another tab for a bit over a minute: browser A shows that player as **AWAY**, and the moment B comes back, as **IN THE ROOM** again. (If the browser console warns that *Presence is off*, the published rules are older than the `firestore.rules` in this repository - publish it again.)
3. Browser A starts the match and either player makes a move. The move shows up in the other browser.
4. Sign in with a username on two accounts, send a friend request, accept it, and check that the friend appears. Add `admins / <uid> / admin: true` for one account and open **Admin studio**: rooms, players and friend connections should all load.

If a step reports *permission-denied*, the rules were not published as-is. Paste the whole file again; partial copies are the usual cause. The Firebase Console **Rules → Rules Playground** can replay a single request if you need to dig deeper.

There are no composite indexes to create for the current queries. `firebase.json` and `firestore.indexes.json` are included if you later choose to manage Firebase from the CLI.

### 4. Add the Vercel environment variables, then redeploy

1. Import this GitHub repository into Vercel (or open the project) and go to **Settings → Environment Variables**.
2. Add **one variable per Firebase field** (the `VITE_` prefix is mandatory: Vite only exposes variables that start with it). Key on the left, Firebase value on the right:

   | Key | Value (from the Firebase config) | Required |
   | --- | --- | --- |
   | `VITE_FIREBASE_API_KEY` | `apiKey` | yes |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain`, e.g. `your-project.firebaseapp.com` | yes |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` | yes |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` | optional |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | optional |
   | `VITE_FIREBASE_APP_ID` | `appId` | yes |
   | `VITE_FIREBASE_MEASUREMENT_ID` | `measurementId` | optional |

   - Paste the bare value only: no quotes, no trailing comma, no `KEY=` in front.
   - **Environments:** tick **Production** and **Preview** for every variable. A deployment only receives a variable if its own environment is ticked, and a site showing "Local practice mode" on a Preview URL while Production works is usually exactly this. (**Development** only matters for `vercel dev`.)
   - It is public configuration, not a secret, so normal (non-sensitive) variables are fine. Do not store anything secret here.
   - Vercel's **Import .env** option also works: paste the filled-in lines of your `.env.local`.
   - Already using the older single `VITE_FIREBASE_CONFIG` JSON variable? It keeps working until you add any `VITE_FIREBASE_*` variable, which then takes over. You can delete the old one afterwards.

3. Use Vercel's normal Vite settings (also recorded in [`vercel.json`](./vercel.json)): build command `npm run build`, output directory `dist`.
4. **Redeploy.** Vite copies `VITE_*` values into the JavaScript at build time. A deployment that was built before the variables existed (or before you fixed it) keeps the old, empty values forever; changing the variable does not change existing deployments. Open **Deployments → ⋯ on the latest deployment → Redeploy** (or push a commit). If in doubt, untick **Use existing Build Cache**.
5. Add the deployed host under **Authorized domains** (see above).

#### Check that the deployment picked it up

1. **Build log** (Vercel → Deployments → the deployment → Build Logs). Look for one of:
   - `[psd-gaming] ✔ The VITE_FIREBASE_* variables are set for this Vercel production (project "…", authDomain "…")`: good.
   - `[psd-gaming] ⚠ The Firebase config (VITE_FIREBASE_* variables) is not set for this Vercel preview.`: not set for this environment. Fix it and redeploy.
   - `[psd-gaming] ⚠ The Firebase config (VITE_FIREBASE_* variables) is invalid …: Missing required Firebase variable(s): …`: add or fix the named variable(s) and redeploy.
2. **The site.** The sidebar, top bar, and home hero read **Online rooms ready**, and there is no setup banner.
3. **Setup guide dialog** (Game library → *How online play works*): **Firebase config: Loaded**, your **Project**, and a **Build** row naming the environment, commit, and build time, which tells you which deployment you are looking at.
4. **Run check** in the same dialog: it signs in as a guest and reads one Firestore document. A pass proves the API key, Anonymous sign-in, the Firestore database, and the published rules all work for this deployment; a failure names the missing piece. Google sign-in, Email/Password, and Authorized domains can only be confirmed by using them once.
5. Browser console: no `[PSD-gaming] …` lines.

Optional strictness: set `REQUIRE_FIREBASE_CONFIG=1` (a plain build variable, **not** a `VITE_` one) for the Production environment to make a missing or invalid config fail the build instead of only warning. Local-only hosting without Firebase stays supported when it is unset.

> Firebase Web config is designed to be present in browser code. Do not put service-account JSON, Admin SDK credentials, private keys, OAuth client secrets, or Firestore rules in any of these variables. The rules are published in Firebase Console, not stored as an environment variable. If a true server-side secret is ever needed, add a separate Vercel Functions/Admin SDK architecture; do not put it in a `VITE_*` variable.

Google's Firebase-managed provider setup does not require adding a Google client secret to this repository. The selected support email is shown to users in Google's consent flow and must be configured in the provider panel.

### 5. Give your own account admin access

1. Open the deployed PSD-gaming site and choose **Sign in → Create account**, or use **Continue with Google** and finish the suggested username setup. Register/choose the account you want to use as the owner.
2. In Firebase Console, go to **Authentication → Users**, find that account, and copy its **UID**. Google accounts have their own Google Firebase UID; it is not automatically the same as an email account with a similar address.
3. Go to **Firestore Database → Data → Start collection**. Use collection ID `admins`.
4. Set the document ID to your copied UID. Add one field:

   - Field: `admin`
   - Type: `boolean`
   - Value: `true`

5. Refresh the site (or sign out and in). **Admin studio** will appear in the sidebar. The rules permit reading only your own admin document and deny all client writes to the `admins` collection; add or revoke an admin manually in the Firebase Console.

A new Google account needs its own `admins/{googleUid}` document if it should be an administrator. The client never treats a Google display name, email, or a hidden UI button as authorization; Firestore evaluates `admins/{uid}.admin == true` on protected reads and writes.

### 6. Invite friends and test the full flow

- Open a game card, choose **Create online room**, select 2 or 3 seats, and send the generated invite link. A guest can join the link without creating an account. The host presses **Start match** when everyone is ready.
- For username friends, both players create an account. Open **Friends → Add by username**, send a request, and have the other player accept it. Use **Challenge** to create a room and deliver an in-app direct invite.
- Use a second browser profile or an incognito window to test another player. To test a three-player room, select **3 players** and join from two separate browser profiles.
- The app supports browser-native share when available and always provides a copyable room link.

## Security headers (Vercel)

`vercel.json` sets the response headers for every deployment: a Content-Security-Policy, HSTS,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` and
`Cross-Origin-Opener-Policy: same-origin-allow-popups` (plain `same-origin` would break the Google
sign-in popup). Hashed files under `/assets/` are cached for a year. `tests/vercel-headers.test.js`
guards them, so a future edit cannot quietly drop the Firebase origins.

Two deliberate `'unsafe-inline'` entries, and why:

- `script-src 'unsafe-inline'` — `index.html` applies the saved theme in a tiny inline bootstrap
  script before the bundle loads, and the game cards use `onerror` fallbacks for their artwork.
- `style-src 'unsafe-inline'` — cards and progress bars set CSS custom properties through `style`
  attributes, which no nonce can cover for DOM built at runtime.

The CSP allows `https://*.googleapis.com`, `https://*.firebaseapp.com`, `https://*.firebaseio.com`
(plus `wss://`) and `https://apis.google.com`, which is what Firebase Auth and Firestore need.

If a deployment ever loses Google sign-in or goes quiet on Firestore, open the browser console: a CSP
violation names the exact directive and origin, and the fix is one word in `vercel.json` (then
redeploy). Headers only apply to Vercel deployments, never to `npm run dev`.

## Troubleshooting

| What you see | Likely cause | Fix |
| --- | --- | --- |
| Deployed site shows **Local practice mode** and "Firebase config is missing from this deployment…" | The `VITE_FIREBASE_*` variables were not present when this deployment was built. They were never added, are not ticked for this environment, or were added after the build. | Vercel → Settings → Environment Variables → add them for **Production** and **Preview**, then **Redeploy**. |
| The build log says `Found other Firebase-looking variable name(s): FIREBASE_API_KEY …` | A variable is misnamed (missing the `VITE_` prefix, wrong capitals, or a stray space), so Vite never exposes it to the app. Only the exact names in the table in step 4 (and the older `VITE_FIREBASE_CONFIG`) are read. | Rename it to exactly e.g. `VITE_FIREBASE_API_KEY` and redeploy. |
| It works on Production but a Preview URL shows **Local practice mode** | The variables are not enabled for the **Preview** environment. | Tick **Preview** for each variable, then redeploy that preview. |
| It works locally but not on Vercel | `.env.local` is ignored by Git, so Vercel never sees it. | Add the variables in Vercel (step 4) and redeploy. |
| The banner names a format problem (quotes, `const`, JavaScript object, missing field, placeholder) | A value is not the bare text described in step 1, or a required variable is missing. | Fix the named variable and redeploy (or restart `npm run dev`). |
| **Online rooms ready**, but starting a guest room says "Guest play needs Anonymous sign-in…" | The **Anonymous** provider is off (`auth/operation-not-allowed` or `auth/admin-restricted-operation`). | Firebase Console → Authentication → Sign-in method → enable **Anonymous**. If it is on, check Authentication → Settings → User actions allows sign-ups. |
| "Email/Password sign-in is not enabled…" or "Google sign-in is not enabled…" | That provider is off. | Enable it in Authentication → Sign-in method (Google also needs a support email). |
| "This site (…) is not an authorized domain for Firebase sign-in…" | The host is not under Authorized domains (`auth/unauthorized-domain`). | Add exactly that host (see [Authorized domains](#authorized-domains)). |
| "Firebase denied this action (permission-denied)…" | The rules are not published, the signed-in identity is missing (Anonymous is off), or the rule genuinely forbids the action. | Publish [`firestore.rules`](./firestore.rules) (step 3) and enable Anonymous. |
| Console: "Presence is off: the deployed Firestore rules do not allow rooms/{roomId}/presence yet." | The published rules are older than this repository's `firestore.rules`. Rooms still work; only the here / away / left labels are missing. | Publish [`firestore.rules`](./firestore.rules) again (step 3). |
| "Cloud Firestore is not enabled for this Firebase project…" | The Firestore API or database has not been created. | Firebase Console → Firestore Database → Create database (step 3). |
| "Firebase rejected the API key in VITE_FIREBASE_API_KEY…" | A mistyped key, or an API key restricted to other sites (`auth/invalid-api-key`). | Copy the Web app config again; in Google Cloud Console → APIs & Services → Credentials check the key's website restrictions include your host. |
| "Could not reach Firebase…" or "You appear to be offline…" | The network, a VPN, or an ad/privacy blocker is cutting off Firebase (`auth/network-request-failed`). | Reconnect, or allow `*.googleapis.com`, `*.firebaseapp.com`, and `apis.google.com`. |
| **Online rooms ready**, yet something online fails | "Ready" means configured and browser online; it is not a server check. | Open **Setup guide → Run check** and follow the message it gives. |

Developer console: a missing or invalid config is always logged (`console.error` in development; `console.error` for an invalid value and `console.warn` for a never-set config in a production build). The raw value is never logged.

## What is included

- **40 games:** Pixel Tic-Tac-Toe, Neon Gomoku, Connect Four, Five in a Row, Memory Match, Neon Pairs, Emoji Flip, Arcade Pairs, Pixel Tap Sprint, Button Masher, Turbo Charge, Reaction Rush, Spacebar Showdown, Bug Blaster, Rock Paper Scissors, Laser Duel, Coin Flip Clash, Dice Duel, Retro Trivia, Emoji Decode, Arcade Facts, Pixel Pop Quiz, Movie Mayhem, Word Scramble, Number Chase, Brain Busters, 8-Bit Riddles, Retro Rewind, Maze Runner, Neon Labyrinth, Byte Escape, Star Runner, Sea Battle, Pixel Fleet, Alien Skirmish, Pong Rally, Paddle Wars, Air Hockey, Codebreaker, and Mastermind.
- **Ten lightweight shared engines:** line boards, drop boards, memory pairs, tap races, simultaneous duels, quiz rounds, maze races, hidden-grid battles, volley scoring, and codebreaking. Each engine is one module in `src/engines/` with its own unit tests; `src/catalog.js` holds the catalog, artwork and how-to-play copy. Each catalog entry can be opened, practiced locally, or used to create an online room.
- **Firebase:** Auth (Anonymous + Email/Password + Google) and Cloud Firestore. Multiplayer moves use Firestore transactions so concurrent turns do not silently overwrite one another. Google popup/redirect handling, guest linking, first-login username setup, and friendly provider/network errors are included.
- **Setup diagnostics:** one honest connection status everywhere (**Online rooms ready**, **Offline · local play**, **Local practice mode**), a precise setup banner for a missing or invalid `VITE_FIREBASE_*` config, a build-time check that prints the same verdict in the Vercel build log (and refuses secrets), Firebase errors worded as instructions, and an in-app **Run check** for a deployed project.
- **Local personalization:** Favorites, recently played games, theme preference, subtle sound preference, and guest display name live in localStorage; no extra Firebase collection is required.
- **Original artwork:** one optimized hero illustration and five reusable category/multiplayer covers live under `public/images/`. Cards use responsive `object-fit: cover`, lazy loading below the first shelf, and CSS artwork fallbacks if an image cannot load.
- **Theme / accessibility:** an OS-aware light/dark theme toggle with persistence, visible keyboard focus, reduced-motion support, semantic controls, keyboard arrows in maze games, Space for tap races, and responsive layouts down to 320px wide. Every game screen includes a concise controls/rules panel generated from its engine.
- **Admin:** `admins/{authUid}` with `admin: true`. The client hides the admin page unless the signed-in UID is approved; Firestore rules separately enforce admin-only room listing, let admins read `friendships` for the dashboard count, and deny client-side admin edits.

## Notes

- The browser must allow JavaScript. Online features require a network connection and a configured Firebase project.
- A room invite is a private-by-ID link, not a password-protected secret. Anyone holding it may join while it is waiting and has capacity. Do not put sensitive data in rooms.
- Anonymous Firebase accounts can be cleaned up periodically from Firebase Console if you want to limit unused guest accounts. Linking a guest to Google is the preferred way to preserve a guest’s UID and identity.
- Live Google, popup/redirect, guest-linking, Firestore-permission, and room synchronization flows still need a smoke test in your deployed Firebase project. `npm test` covers helpers, catalog integrity, the pure game engines (including a state-by-state baseline of all 40 games), the rendered UI in jsdom (shell, catalog, search, practice match, dialogs, theme), the config parser/validator, the status logic, the emulator switch, the wording of Firebase errors (using the real SDK error classes), Firebase initialization with the real SDK (no network), the build-time check, and structural checks of `firestore.rules` (balanced syntax, a rule for every collection the app uses, nothing open to signed-out users, admin flags not client-writable). None of that needs Firebase credentials or an emulator, and none of it talks to a real Firebase project.

The rules themselves are executed by `npm run test:rules`, which runs `firestore.rules` against the Firestore emulator (Java required) and covers profiles, usernames, rooms, joins, moves, presence heartbeats, friend requests, friendships and invites. CI runs it on every pull request; locally it is skipped with a clear message when no emulator is reachable. Under `firebase emulators:exec` (which sets `FIRESTORE_EMULATOR_HOST`) an unreachable emulator fails the suite instead, so the CI job can never pass because everything skipped. The setup dialog's **Run check** is the quickest way to smoke-test a real deployment.
