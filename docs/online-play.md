# Online play: the trusted backend

> **Status: the backend ships with the site and needs no paid Firebase plan.**
> The site is hosted on Vercel, and the trusted backend runs there too — as same-origin serverless
> functions in [`api/`](../api/) (`POST /api/backend/<name>`), built on the same handlers as the
> Firebase-callable transport in `functions/src/index.js`. Everything runs on free tiers: Vercel
> Hobby (serverless functions + a once-a-day cron), Firebase Spark (Auth, Firestore, rules and
> index deploys). The one server-side setup step is the `FIREBASE_SERVICE_ACCOUNT` environment
> variable in Vercel; until it exists, every online action fails with the exact fix in the message
> (see "Deploying" below). Why same-origin matters: the browser calls its own origin, so there is no
> CORS preflight at all — the earlier production breakage (`createRoom` blocked by CORS) was an
> undeployed Firebase function whose 404 carried no `Access-Control-Allow-Origin` header, which the
> console reported as a CORS error while the real problem was that the function did not exist.

## Why a backend at all

Room state, usernames, friendships, invites, blocks, reports and account deletion used to be written
by whichever browser cared. The rules made that mostly safe, but a client is still a client: it can
lie about whose turn it is, what the room's status is, how long it has been alive, or whether it is
allowed to read a document. The same is true of profile documents — any signed-in account could list
them and scrape usernames.

The backend moves the decisions to a place the browser cannot edit:

- every online mutation is one backend call (same-origin `/api/backend/<name>` by default, or a
  Firebase callable when `VITE_BACKEND_URL=firebase`) that re-checks uid, membership, room status,
  room lifetime, turn order, action shape and tap tempo against the stored document
  (`functions/src/handlers.js` and `shared/online/room.js`);
- secret state (codebreaker codes, fleets, quiz answer keys, unopened card faces, locked picks) is
  written only to `rooms/{roomId}/secrets/engine`, which no client rule ever allows reading;
- usernames are claimed through one transaction that the caller cannot win by racing;
- friend lookup is an exact `usernames/{usernameLower}` lookup with a per-user rate limit — there is
  no way to page the profile directory;
- account deletion, rate limits and expiry are server-side, so a closed tab cannot leave data behind
  and a script cannot spend the day creating rooms;
- the scheduled `cleanupExpired` function deletes expired rooms with their secrets, views and
  heartbeats every 15 minutes.

## Layout

| Path | What it is |
| --- | --- |
| `api/backend/[[...name]].js` | The Vercel serverless route the browser calls by default: `POST /api/backend/<callable>`, same-origin, one function for the whole surface. |
| `api/cron/cleanup.js` | The Vercel serverless route for the expiry sweep: `/api/cron/cleanup`, guarded by `CRON_SECRET`. |
| `functions/src/index.js` | The *optional* Firebase-callable transport (needs Blaze): `onCall` wrappers plus the `cleanupExpired` Cloud Scheduler. |
| `functions/src/http-backend.js` | The HTTP transport behind `api/`: verifies the Firebase ID token, dispatches to the handlers, maps errors to the same wire shape as the callable SDK, checks the cron secret. |
| `functions/src/backend.js` | The runtime shared by both transports: handlers + store + error codes. Only the transport differs. |
| `functions/src/handlers.js` | All policy: identity, social, rooms, moves, blocks, reports, deletion, admin. Pure functions of (payload, auth context, store). |
| `functions/src/store.js` | The narrow Firestore adapter the handlers use (`get`/`set`/`query`/`transaction`/`batch`/`recursiveDelete`). |
| `functions/src/cleanup.js` | Expired-room, finished-room, invite, request, rate-limit and report purging. Idempotent by construction, and one failed step does not abort the sweep. |
| `functions/test/` | The backend tests (in-memory `Store` double — no emulator, no Java, no network), covering both transports. |
| `shared/online/` | Room transitions, projections, identity rules and rate limits. Imported by **both** the browser and the functions. |
| `functions/vendor/` | Generated mirror of `shared/**` and `src/engines/**`. Never edit; run `node scripts/sync-shared.mjs`. |

The mirror exists because `firebase deploy --only functions` uploads only `functions/`. The relative
imports (`../../shared/...`) resolve identically on both sides because the layout is preserved.
`firebase.json` runs the sync as a `predeploy` hook, `functions/npm test` runs it first, and CI runs
`node scripts/sync-shared.mjs --check` so a stale mirror cannot ship.

## Local development

The emulator suite needs **Java 11 or newer** (the Firestore emulator is a JVM app) and the Firebase
CLI (`firebase-tools`, already a dev dependency). No real Firebase project is touched.

```bash
npm ci                     # browser app + the backend's serverless dependencies (firebase-admin)
cd functions && npm ci     # the backend package (its own lockfile)

node scripts/sync-shared.mjs         # refresh the mirror after editing shared/ or src/engines/
cd functions && npm test             # backend tests: no emulator, no Java, no network
node scripts/sync-shared.mjs --check # fail when the mirror is stale (CI does this)

firebase emulators:start --only firestore,auth \
  --project psd-gaming-local         # Firestore on 127.0.0.1:8080, Auth on 9099
npm run test:rules                   # firestore.rules against the Firestore emulator
```

Online play in local development needs the backend too, and the backend needs admin credentials:
run `vercel dev` (serves the site *and* the `api/` functions on one port, with
`FIREBASE_SERVICE_ACCOUNT` and `CRON_SECRET` read from `.env.local` or `vercel env pull`), and
point the Vite dev server's proxy at it — `npm run dev` already forwards `/api` to
`http://127.0.0.1:3000` (override with `API_PROXY_TARGET`). With `FIREBASE_AUTH_EMULATOR_HOST` and
`FIRESTORE_EMULATOR_HOST` set, the Admin SDK talks to the local emulator suite instead of the real
project. Plain `npm run dev` without `vercel dev` still serves local practice; online actions then
report the backend as not answering, which is the honest answer.

If Java is unavailable the rules suite is **skipped locally, never silently "passing"**; the
`FIRESTORE_EMULATOR_HOST` contract makes it fail instead of skipping inside `npm run test:rules`, so
the CI job is the real gate.

## Deploying (operator steps — the free plan path)

Everything below runs on free tiers: **Vercel Hobby** (serverless functions, one daily cron) and
**Firebase Spark** (Auth, Firestore, rules and index deploys). No Blaze plan, no credit card.

1. **Enable the sign-in providers** you want in Firebase Console → Authentication → Sign-in method
   (Google, Email/Password, Anonymous for guests).
2. **Give the backend its credentials.** Firebase Console → Project settings → Service accounts →
   *Generate new private key*, then in Vercel → Settings → Environment Variables add:
   - `FIREBASE_SERVICE_ACCOUNT` — the contents of that JSON key file, pasted as one value
     (raw JSON or base64). Server-side only; it is never sent to the browser, and the repository's
     secret scan refuses to let one be committed.
   - `CRON_SECRET` — any long random string, so only your schedulers can trigger the cleanup.
   Enable both for **Production** and **Preview**, then **redeploy** (a running deployment never
   sees a changed variable).
3. **Publish the rules and the one composite index** (both free on Spark; `.firebaserc` already
   points at the project):

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

   Without the rules the locked-down client permissions are not in force; without the index the
   finished-rooms step of the cleanup is skipped (the sweep records it and continues).
4. **Push to `main`.** Vercel builds the site *and* the backend together — the same deployment now
   carries both, so the two can never drift apart again.
5. **Restore the 15-minute cleanup cadence** (optional but recommended). Vercel's Hobby cron runs
   once a day (`vercel.json`); rooms are *refused* at their 1-hour expiry regardless (the backend
   checks `expiresAt` on every read and move), but physical deletion waits for the sweep. For the
   original cadence, add two repository secrets — `PSD_CLEANUP_ENDPOINT`
   (`https://psd-gaming.vercel.app/api/cron/cleanup`) and `PSD_CLEANUP_SECRET` (the same value as
   Vercel's `CRON_SECRET`) — and the free **Expiry sweep** GitHub Actions workflow
   (`.github/workflows/cleanup.yml`) calls the endpoint every 15 minutes.

### What still needs the Blaze plan (and only then)

- `firebase deploy --only functions` — the *optional* Firebase-callable transport
  (`functions/src/index.js`) plus its Cloud Scheduler. Point the browser at it by setting
  `VITE_BACKEND_URL=firebase` in Vercel and redeploying. There is no reason to do this while the
  same-origin backend ships with the site; the transport exists so the choice stays open.
- Firestore TTL policies: a native TTL on `expiresAtDate` (the store adapter writes it next to the
  numeric `expiresAt`) would be a second, independent expiry mechanism — but TTL itself requires
  billing, so on Spark the cleanup sweep is the one mechanism.

### What the operator must still decide (labelled, not invented here)

- **Retention beyond room lifetime.** Rooms and their secrets live at most one hour, finished rooms
  ten minutes longer, presence heartbeats with their room, invites two hours, friend requests thirty
  days, rate-limit buckets two days, reports 180 days. These are the defaults in
  `shared/online/retention.js` (the single table the cleanup function, the browser and the in-app
  privacy notice all read); change them deliberately, in that one place.
- **Reports.** A report is stored for the operator to read; it does not automatically punish anyone.
  The in-app privacy and safety pages (`src/views/legal.js`, routes `#/privacy` and `#/safety`) say
  plainly that a report only reaches the operator, that nothing is automatic, and how long reports are
  kept. Fill in the labelled launch-checklist block on the privacy page (operator name, contact,
  jurisdiction, ages) before inviting real players; the repository deliberately does not invent it.
- **Deletion.** Account deletion is self-service and requires a sign-in within the last ten minutes.
  It removes the profile, the username reservation, friendships, requests, invites, blocks, presence
  and waiting-room seats, and deletes the Firebase Auth user. The last admin cannot delete their own
  account until another admin exists.

## Staging smoke-test checklist

Run this against a staging project once it is deployed (the backend ships with the site, so a
Vercel preview URL with `FIREBASE_SERVICE_ACCOUNT` enabled for **Preview** is enough). Every line is
something the automated suites cannot check for you.

- [ ] Google sign-in and Email/Password sign-in both complete; a guest link stays anonymous.
- [ ] Host a 2-player room, join by invite link **and** by the 7-character code; start it; finish it;
      press Play again.
- [ ] The same with 3 players, including one guest with a temporary name.
- [ ] A paced race (Bug Blaster) accepts a burst then moderates; a fast script gains nothing.
- [ ] A hidden-information game (Codebreaker, Sea Battle, Word Scramble) never shows the secret in
      the browser's Firestore snapshot, and each player sees only their own fleet.
- [ ] Close the host's tab mid-lobby: the other player can take the room over after ~75 seconds. A
      running match does not hand over.
- [ ] Reload mid-match: the seat, score and state come back; a rejected move shows the server's
      sentence.
- [ ] Friend request → accept → game invite → room; block a player and confirm neither side can
      invite the other.
- [ ] Delete an account with a fresh sign-in: the profile and username are gone, the Auth user is
      gone, and no waiting-room seat is left behind. Confirm the last-admin refusal.
- [ ] Hit the create-room limit (20/hour) and confirm the error says how long to wait.
- [ ] Leave a room and wait for the scheduled cleanup: room, secrets, views and presence documents
      are deleted within the 15-minute window.
- [ ] Local practice still works with the Firebase config removed (and says why online is off).
- [ ] The deployment's CSP allows callable endpoints: `https://*.cloudfunctions.net` is in
      `connect-src` in `vercel.json` (asserted by `tests/vercel-headers.test.js`). A missing wildcard
      shows up as a CSP violation in the browser console and breaks every online action.
- [ ] The privacy and safety pages are reachable from the sidebar, the sign-in dialog, the account
      menu and settings; the operator launch-checklist block is actually filled in for this deployment.
- [ ] Block a player from the friends page: they vanish from search, their pending requests and
      invites disappear, and unblocking restores nothing automatically.
- [ ] Send a report: it appears in the admin studio's social section, the reporting player sees an
      honest "the operator reads it by hand" message, and the reported player sees nothing.
- [ ] Delete an account whose sign-in is older than ten minutes: the app asks for a fresh sign-in
      instead of claiming the deletion happened.
- [ ] Run a real-browser accessibility pass (axe DevTools or Lighthouse) on the home, library,
      privacy, room and report screens in both themes, plus keyboard-only, 320 px width,
      reduced-motion and 200% zoom. jsdom cannot judge layout, focus order or colour contrast; the
      automated axe suite in `tests/axe.test.js` covers structure only.
- [ ] Verify the social preview: paste the deployed URL into a link preview and confirm the title,
      description and image come from `index.html` (per-route tags are applied by `src/seo.js`).
