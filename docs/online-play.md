# Online play: the trusted backend

> **Status: the backend runs as Vercel serverless functions.** The policy and the tests live in
> [`functions/`](functions/) (`functions/src/handlers.js`, 36 tests, green); the HTTP surface lives in
> [`api/`](api/) — one route per action (e.g. [`api/createRoom.js`](api/createRoom.js)) plus the shared
> wiring in [`api/_backend.js`](api/_backend.js). The browser calls them as same-origin `/api/*` POSTs
> that carry its Firebase ID token, and each function verifies that token and runs the *same* handler
> the Cloud Functions used to. **The Firebase Cloud Functions deployment is disabled**
> ([`functions/src/index.js`](functions/src/index.js) exports nothing, and the `functions` block is gone
> from [`firebase.json`](../firebase.json)); `firebase deploy --only functions` is a no-op now. Nothing
> here has been deployed; the runbook below was never run from this repository.


## Why a backend at all

Room state, usernames, friendships, invites, blocks, reports and account deletion used to be written
by whichever browser cared. The rules made that mostly safe, but a client is still a client: it can
lie about whose turn it is, what the room's status is, how long it has been alive, or whether it is
allowed to read a document. The same is true of profile documents — any signed-in account could list
them and scrape usernames.

The backend moves the decisions to a place the browser cannot edit:

- every online mutation is a callable Cloud Function (`functions/src/index.js`) that re-checks uid,
  membership, room status, room lifetime, turn order, action shape and tap tempo against the stored
  document (`functions/src/handlers.js` and `shared/online/room.js`);
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
| `api/_backend.js` | The shared Vercel wiring: Admin-SDK init, ID-token verification, the Firestore store, dispatch and the error-code → HTTP-status map. Every route below is a one-line wrapper around `handleCallable(name)`. |
| `api/<name>.js` | One route per action (`createRoom`, `joinRoom`, `playMove`, …). Replaces the old `onCall` wrappers. |
| `api/cleanup.js` | The scheduled cleanup as a Vercel Cron route (replaces the `cleanupExpired` Cloud Scheduler function). |
| `functions/src/index.js` | **Disabled.** Exports no functions; the Cloud Functions entry point now only documents the move. |
| `functions/src/backend.js` | The handler binding (engine registry + `makeHandlers`) shared by the api routes and, if ever re-enabled, the Cloud Functions. |
| `functions/src/handlers.js` | All policy: identity, social, rooms, moves, blocks, reports, deletion, admin. Pure functions of (payload, auth context, store). |
| `functions/src/store.js` | The narrow Firestore adapter the handlers use (`get`/`set`/`query`/`transaction`/`batch`/`recursiveDelete`). |
| `functions/src/cleanup.js` | Expired-room, finished-room, invite, request, rate-limit and report purging. Idempotent by construction. |
| `functions/test/` | The backend tests (in-memory `Store` double — no emulator, no Java, no network). |
| `shared/online/` | Room transitions, projections, identity rules, rate limits and the maintenance switch. Imported by **both** the browser and the backend. |
| `functions/vendor/` | Generated mirror of `shared/**` and `src/engines/**`. Never edit; run `node scripts/sync-shared.mjs` (the api routes import it, and `npm run build` regenerates it via `prebuild`). |

### The one exception: maintenance mode writes Firestore directly

Everything above says an online mutation goes through a callable. **Maintenance mode does not**, and
that is deliberate: a soft "we are being worked on" gate has to work when the backend is exactly the
thing being worked on, and it protects no data — the notice is a *client-side* decision, and
`firestore.rules` is what keeps the two documents honest:

- `siteStatus/maintenance` — world-readable (`allow get: if true`, so a signed-out visitor can read the
  notice), admin-writable only, one fixed document id, never deletable, every field type-checked and the
  writer's UID pinned to `request.auth.uid`.
- `maintenanceAccess/active` — the 16-digit testing code, **admin-readable and admin-writable only**, so
  the person being asked for the code cannot read it, list it or guess their way into a second document.

A deploy of this feature is `firebase deploy --only firestore:rules` plus the app. No function, no new
environment variable, no index. The whole design — including what the gate does *not* protect — is in
[docs/maintenance-mode.md](maintenance-mode.md).

The mirror exists because `firebase deploy --only functions` uploads only `functions/`. The relative
imports (`../../shared/...`) resolve identically on both sides because the layout is preserved.
`firebase.json` runs the sync as a `predeploy` hook, `functions/npm test` runs it first, and CI runs
`node scripts/sync-shared.mjs --check` so a stale mirror cannot ship.

## Local development

The emulator suite needs **Java 11 or newer** (the Firestore emulator is a JVM app) and the Firebase
CLI (`firebase-tools`, already a dev dependency). No real Firebase project is touched.

```bash
npm ci                     # browser app
cd functions && npm ci     # backend (firebase-admin + firebase-functions)

node scripts/sync-shared.mjs         # refresh the mirror after editing shared/ or src/engines/
cd functions && npm test             # backend tests: no emulator, no Java, no network
node scripts/sync-shared.mjs --check # fail when the mirror is stale (CI does this)

firebase emulators:start --only firestore,auth \
  --project psd-gaming-local         # Firestore + Auth only; the Cloud Functions emulator is gone
npm run test:rules                   # firestore.rules against the Firestore emulator
```

The `api/` routes are Vercel functions. To exercise them locally, run `vercel dev` (the Vercel CLI), which serves the SPA and the `api/` routes together and reads `FIREBASE_SERVICE_ACCOUNT` from your environment; otherwise point the browser at a deployed Vercel environment.

If Java is unavailable the rules suite is **skipped locally, never silently "passing"**; the
`FIRESTORE_EMULATOR_HOST` contract makes it fail instead of skipping inside `npm run test:rules`, so
the CI job is the real gate.

## Deploying (operator steps — not run here)

The backend is now Vercel serverless functions, so it deploys with the site — no Blaze plan, no
`firebase deploy --only functions`. Raising a project from zero, in order:

1. **Set the Admin SDK credentials for the api functions.** On Vercel → Settings → Environment
   Variables, add `FIREBASE_SERVICE_ACCOUNT` (the service-account JSON, minified onto one line; see
   `.env.example`) for **Production** and **Preview**. On Vercel there are no Application Default
   Credentials, so without it the api functions cannot reach Firestore or verify tokens.
2. Enable the sign-in providers you want in **Authentication → Sign-in method** (Google,
   Email/Password, Anonymous for guests).
3. Provision the first admin: create the account, then add `admins/{uid} = { admin: true }` in the
   Firebase console. Nobody can mint an admin flag from the client.
4. Deploy the site (which builds and ships the api routes with it):

   ```bash
   git push                       # Vercel builds `npm run build` and deploys dist/ + api/
   firebase deploy --only firestore:rules   # publish the locked rules from firestore.rules
   ```

   The `api/` routes are ordinary Vercel functions; the build's `prebuild` step regenerates
   `functions/vendor/` so the routes can import the shared handlers. The scheduled cleanup runs from
   `vercel.json`'s `crons` (`/api/cleanup`, every 15 minutes) — note Vercel Cron's frequency depends on
   the plan.
5. Optional second expiry mechanism: in the Firebase console, **Firestore → Time-to-live**, add a TTL
   policy on the `expiresAtDate` field. The store adapter writes it next to the numeric `expiresAt`
   the cleanup route queries, so the two never disagree.
6. App Check is not required by this design but is worth enabling: the routes are protected by Firebase
   Auth (the ID token is verified on every call), and every rate limit is enforced per uid.

> To go back to Firebase Cloud Functions instead, restore the `callableFor(name)` wrappers in
> `functions/src/index.js`, re-add the `functions` block to `firebase.json`, and point
> `src/online/callables.js` back at `httpsCallable`.

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

Run this against a staging project after deploying functions (and after the rules migration, if you
are publishing the locked rules). Every line is something the automated suites cannot check for you.

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
- [ ] Maintenance mode end to end: in the admin studio, write a reason and close the site; in a private
      window (and on a phone, over the network) confirm the notice replaces the site, `#/room/<id>` does
      not join, and the reason text is what visitors read. Type the 16-digit code on the second device and
      confirm it opens that device only; "New code" locks it again; "Open the site again" clears the
      notice, and `maintenanceAccess/active` is gone from the database.
- [ ] With maintenance on, confirm a non-admin signed-in player cannot write `siteStatus/maintenance`
      or read `maintenanceAccess/active` (the rules, not the UI, are the boundary), and that the admin's
      own tab is never locked out.
- [ ] Local practice still works with the Firebase config removed (and says why online is off).
- [ ] The api routes are deployed and reachable: creating a room POSTs to same-origin `/api/createRoom`
      and succeeds (or fails with a readable message). `connect-src 'self'` in `vercel.json` covers
      them (asserted by `tests/vercel-headers.test.js`); a CSP that blocks `'self'` shows up as a
      violation in the browser console and breaks every online action. A missing `FIREBASE_SERVICE_ACCOUNT`
      makes every route answer `internal` — set it in the Vercel environment and redeploy.
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
