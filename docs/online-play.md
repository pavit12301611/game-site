# Online play: the trusted backend

> **Status: the browser migration has landed; the backend itself is still not deployed.**
> `functions/` holds the callable API, the validation policy and the tests (43, green), and the
> browser now performs every online mutation through callables (`src/online/`,
> `src/social.js`, `src/accounts.js`) while `firestore.rules` denies it those writes — so the two
> sides have to be deployed **together**: rules without functions stop online play, functions
> without rules leave the old permissive rules in place. **Online play needs
> `firebase deploy --only functions` to have been run against the project the site was built with.**
> Verified 2026-10-06 against production: `https://us-central1-psd-gaming.cloudfunctions.net/createRoom`
> answers 404, so psd-gaming.vercel.app calls functions that do not exist. A 404 on the preflight
> carries no `Access-Control-Allow-Origin` header, so the browser console reports a CORS error that
> masks the missing deployment — the app's own message for that case lives in
> `src/online/callables.js`. Deploy with the runbook below, or with the manual
> **Deploy Cloud Functions backend** workflow (`.github/workflows/deploy-functions.yml`).

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
| `functions/src/index.js` | Callable wrappers (20 of them) plus the `cleanupExpired` schedule. Maps our error codes to `HttpsError` statuses. |
| `functions/src/handlers.js` | All policy: identity, social, rooms, moves, blocks, reports, deletion, admin. Pure functions of (payload, auth context, store). |
| `functions/src/store.js` | The narrow Firestore adapter the handlers use (`get`/`set`/`query`/`transaction`/`batch`/`recursiveDelete`). |
| `functions/src/cleanup.js` | Expired-room, finished-room, invite, request, rate-limit and report purging. Idempotent by construction. |
| `functions/test/` | The backend tests (in-memory `Store` double — no emulator, no Java, no network). |
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
npm ci                     # browser app
cd functions && npm ci     # backend (firebase-admin + firebase-functions)

node scripts/sync-shared.mjs         # refresh the mirror after editing shared/ or src/engines/
cd functions && npm test             # backend tests: no emulator, no Java, no network
node scripts/sync-shared.mjs --check # fail when the mirror is stale (CI does this)

firebase emulators:start --only functions,firestore,auth \
  --project psd-gaming-local         # functions on 127.0.0.1:5001
npm run test:rules                   # firestore.rules against the Firestore emulator
```

If Java is unavailable the rules suite is **skipped locally, never silently "passing"**; the
`FIRESTORE_EMULATOR_HOST` contract makes it fail instead of skipping inside `npm run test:rules`, so
the CI job is the real gate.

## Deploying (operator steps — not run here)

Raising a project from zero, in order:

1. **Upgrade the Firebase project to the Blaze (pay-as-you-go) plan.** Cloud Functions, Cloud
   Scheduler (`cleanupExpired` runs every 15 minutes) and outbound network calls are not available on
   the free Spark plan. Costs for a hobby deployment are normally inside the free monthly allowance,
   but a billing account and a budget alert are required; nothing in this repository can verify your
   actual usage.
2. Enable the sign-in providers you want in **Authentication → Sign-in method** (Google,
   Email/Password, Anonymous for guests).
3. Provision the first admin: create the account, then add `admins/{uid} = { admin: true }` in the
   Firebase console. Nobody can mint an admin flag from the client.
4. Deploy the rules and functions (the client migration has landed, so both belong together now):

   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only functions                # runs scripts/sync-shared.mjs as a predeploy hook
   firebase functions:log
   ```

   Or, without a local toolchain: add a `FIREBASE_SERVICE_ACCOUNT` secret (Firebase Console →
   Project settings → Service accounts → Generate new private key) to the GitHub repository, then
   run the manual **Deploy Cloud Functions backend** workflow (`.github/workflows/deploy-functions.yml`).
   It mirrors `shared/`, runs the backend suite, deploys, and then smoke-tests that the callable
   endpoints answer the CORS preflight and refuse an anonymous call with 401 — the two things a
   missing (or non-public) deployment gets wrong, and the exact failure the console otherwise shows
   only as a masked CORS error.

5. Optional second expiry mechanism: in the Firebase console, **Firestore → Time-to-live**, add a TTL
   policy on the `expiresAtDate` field. The store adapter writes it next to the numeric `expiresAt`
   the cleanup function queries, so the two never disagree.
6. App Check is not required by this design but is worth enabling: the functions are protected by
   Firebase Auth, and every rate limit is enforced per uid.

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
