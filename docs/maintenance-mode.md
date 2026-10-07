# Maintenance mode

A switch that puts up a "this site is under maintenance and will be available soon" page for
everybody, while the admin who closed it keeps the whole arcade. It also mints a temporary 16-digit
access code, so the site can be tested on a phone or another laptop while everyone else is looking at
the notice.

Nothing here needs a second service, a Cloud Function or a deploy of anything but the Firestore rules.

## What it is for

The problem it solves is specific: the site has to be closed to the public while it is being worked
on, but the person working on it has to keep using it, and often a second device has to be checked
too. A web server that returns 503 for every request cannot do that — either everything is closed or
nothing is. This is a gate inside the app, which means it can be selective:

| Who | What they see while maintenance is on |
| --- | --- |
| Anyone without an account, or a signed-in non-admin | The maintenance notice, and nothing else |
| The admin who switched it on (or any verified admin) | The normal arcade, with a strip across the top saying the site is closed to visitors |
| A device that typed a valid access code | The normal arcade, with a strip saying it is open only here, until the code expires |

The notice is painted *instead of* the app shell, so there is no sidebar, no top bar, no half-working
page behind it. Routing is suppressed while it is up, `#/room` links do not join, and the document's
`<title>` and meta description change with it.

## Using it

All of it is in **Admin studio → Maintenance** (`#/admin`, the second tab).

1. **Write the reason** in the text area. Whatever you type is what visitors read, word for word
   (plain text, up to 500 characters, up to six lines — long enough for a real sentence, short enough
   that it is actually read). You can save it before closing the site: it is kept as the text for the
   next window.
2. **Pick how long a testing code should stay valid** (1 hour → 7 days). This is the lifetime of the
   access code, not of the maintenance window: the site stays closed until you open it again.
3. **Press "Close the site".** One Firestore batch writes the public notice and the admin-only code
   document together, and the new 16-digit code is copied to your clipboard as it appears on screen.
4. **Hand the code to whoever needs to test** — by chat, by text, across a desk. On the other device
   the notice has one box; typing or pasting the code there opens that device only.

To reopen: **Admin studio → Maintenance → "Open the site again"**, or the button in the strip at the
top of any page. That clears the notice, destroys the code and leaves every previously unlocked device
needing a code again on its next read.

### On the device doing the testing

The code box is one field with `inputmode="numeric"` (a phone shows the number pad), `autocomplete="one-time-code"`
(iOS offers a copied code back to you), and it reformats into `1234 5678 9012 3456` as you type.
Spaces, dashes and paste junk are ignored, so a code copied with its grouping works as is. A digit
tally under the box says `12 of 16 digits typed`, and the submit button stays disabled until all
sixteen are there.

Six wrong codes in a row puts a five-minute pause on that device, which is a nuisance for a guesser
and invisible for a typo.

Once accepted, the device is open **for as long as the code is valid** — it survives a reload, and the
banner at the top of the page says so and counts the time down, with an "End access" button that closes
this device again without touching anybody else's.

## What is written, and where

Two documents, both single-document, both fixed ids:

- **`siteStatus/maintenance`** — the public projection: `{ enabled, reason, updatedAtMs, updatedByUid,
  pinHash, pinSalt, pinExpiresAtMs, pinSetAtMs }`. Readable by the world (`allow get: if true`), because
  a locked-out visitor has no account. It cannot be listed and it is never deleted: switching maintenance
  off sets `enabled: false`.
- **`maintenanceAccess/active`** — `{ pin, pinHash, pinSalt, expiresAtMs, setAtMs, hours, updatedByUid }`,
  readable and writable **by an admin only**. The plain code lives here, and only here, so the studio can
  show it again after a reload. This is why the notice can ask for a code without being able to reveal it.

Both field lists are defined once, in `shared/online/maintenance.js`, and
`tests/firestore-rules.test.js` fails if the rules file and that list ever name different fields.

### Rotation *is* revocation

A visitor's browser never stores the code. It stores `localStorage["psd-maintenance-pass"]`, which is
the **digest** of the code, plus its expiry. The lock decision compares that digest with
`siteStatus/maintenance.pinHash`. So:

- right code → the digest is stored → this device is in;
- "New code" in the studio → a new digest in the status document → every device holding the old digest
  is out again on its next read, with no cleanup job, no revocation list and no per-device state on the
  server;
- opening the site → `pinHash` is cleared and the access document is deleted, so no stale code is left
  in the database.

The digest is `SHA-256("psd-maintenance-v1|" + pinSalt + "|" + code)`, computed with `crypto.subtle`.
The per-window salt is what stops two maintenance windows sharing a code, and it means the stored value
is useless without the code. On a plain-`http` origin (a LAN demo) `crypto.subtle` does not exist; the
same code falls back to a pure-JS FNV-1a digest and tags it `fnv1a8:` in every place the algorithm is
stored, so a device never compares a SHA-256 with something weaker by accident.

## Freshness: what updates when

- The **first paint never waits for the network.** The status is cached in
  `localStorage["psd-maintenance-status"]`, and `applyMaintenanceCache()` reads that cache synchronously
  before `boot()` renders. `tests/production-boot.test.js` fails if a first visit fetches anything
  before the shell is in the DOM.
- After the first paint the app reads `siteStatus/maintenance` once, and **keeps a live listener only
  while the site is closed**. That is the shape on purpose: a normal visitor of an open arcade holds no
  socket, while the people who actually care — a device staring at the notice, an admin's studio, a
  tester on a pass — see "it just reopened" or "the code just rotated" happen under them.
- Coming back to the tab re-reads the status, so a browser that was asleep in a background tab catches
  up when you look at it again.
- A visitor who arrives while the site is closed and stays on the page is not pulled out from under
  their own game: the gate is decided when the app paints. Say so in the notice if that matters to you —
  it is why the reason text is worth writing.
- If the status read fails, the cached answer is kept and the notice says it could not double-check,
  instead of silently assuming either state.
- The flag on the notice names its own source — **Live status**, **From this device's last visit**,
  **Confirming the arcade is still closed…**, or **Could not reach the arcade to double-check** — because
  a page that tells you a site is closed should never overstate how sure it is.

## The honest caveat

**This is a soft gate, not a wall.** It is the right tool for "the site is being worked on, do not use
it yet", and it is what the admin panel and a visitor's browser can do without a backend deploy. It is
not a way to hide data.

- The maintenance notice does not stop the *app's own* Firestore rules from working: rooms, profiles,
  reviews and friends are still protected by `firestore.rules` exactly as they are with maintenance off.
  A determined visitor who has the JS bundle can still talk to Firestore; they can just not use the site
  as a site. That is by design — data safety comes from the rules, never from a page.
- A 16-digit code is unguessable at this scale (10^16) and it is rate-limited per device, but the code
  is a shared secret over a side channel (a chat message). Anyone who reads the message can use the site
  from anywhere until it expires. Rotate it when the testing is done, which is also how you kick people
  out.
- `localStorage` is per browser profile: the pass does not cross from a phone to a laptop, and it
  disappears with "clear site data". That is intended — it is a device pass, not an account.
- Nobody can lock themselves out. `isMaintenanceLocked()` lets every verified admin through — the only
  thing that puts an admin in front of the notice is the admin pressing "See the notice". If you lose
  admin access while the site is closed, the fix is in the Firebase console: set `siteStatus/maintenance`
  → `enabled: false`.

## Deploying

There is no new environment variable, no Cloud Function and no second collection to create.

1. Publish `firestore.rules` (`firebase deploy --only firestore:rules`, or paste the file into the
   console — the two `match` blocks are self-contained).
2. Deploy the app.

`siteStatus/maintenance` does not have to exist. A missing document reads as "no status", and the app
treats no status as *open*: a fresh project, or a project where the rules were rolled back, can never
lock the arcade out of existence.

## Where the code is

| Path | What lives there |
| --- | --- |
| `shared/online/maintenance.js` | The rules: code format, reason limits, document shapes, digest, lock decision, attempt throttle. Dependency-free, mirrored into `functions/vendor/shared/` by `scripts/sync-shared.mjs`, which `npm test` runs first (`pretest`). |
| `src/maintenance.js` | The client: cache, watch, pass storage, the three admin writes, the PIN check. |
| `src/state.js` | `state.maintenance` and `maintenanceBlocks()`, the one question the render path asks. |
| `src/views/maintenance.js` | The notice, the banner, the code display. |
| `src/views/shell.js` | Where the gate replaces the app, and where the banner goes. |
| `src/views/pages.js` | `renderAdminMaintenance()`, the studio panel. |
| `src/app.js` | Click and submit handlers for both sides. |
| `src/styles/maintenance.css` | The screen, the ticker, the PIN box (10px digit boxes on mobile), the studio panel. |
| `firestore.rules` | `siteStatus` (public read, admin write) and `maintenanceAccess` (admin only). |
| `tests/maintenance.test.js` | The shared rules, with no DOM and no Firebase. |
| `tests/app-render.test.js` | The lock, the code box, the pass, the banner, the admin's preview. |
| `tests/firestore-rules.test.js` | Structural checks on the two blocks, and the field lists that cannot drift. |
| `tests/rules-emulator.test.js` | Real rule evaluation (`npm run test:rules`, needs Java). |
| `tests/axe.test.js` | WCAG A/AA scans of the notice, the banner and the studio panel. |

## Looking at the notice without a Firebase project

The gate is decided by one cached object, so the screen can be seen with no backend at all — useful for
design review, and it is exactly the state a visitor's first paint is in:

```js
localStorage.setItem('psd-maintenance-status', JSON.stringify({
  enabled: true,
  reason: 'Scheduled maintenance: the arcade is being upgraded. Back within the hour.',
  updatedAtMs: Date.now() - 60000,
  pinHash: 'sha256:aa',
  pinSalt: 'bb',
  pinExpiresAtMs: Date.now() + 3_600_000,
}));
location.reload();
```

The notice paints (flagged as coming from this device's last visit), the code box accepts typing, and
every code fails the digest check — because there is no window to match. `localStorage.clear()` puts the
arcade back. `tests/app-render.test.js` covers this same path, including that a cache saying
`enabled: false` — or unreadable JSON — must never paint a notice.

## Checking it by hand

`npm run dev`, signed in as an admin:

1. Admin studio → Maintenance → write a reason → Close the site. The code appears and is copied.
2. Open the site in a private window (or another browser, or a phone on the same network): the notice,
   nothing else. `#/room/<anything>` still shows the notice.
3. Type the code on that second device: the arcade appears, with the "you are in with a temporary code"
   strip. Reload — still in.
4. Back in the admin tab: press "See the notice" (preview), then "Back to the arcade".
5. "New code" in the studio: the second device is locked out again on its next read, and its old code no
   longer works.
6. "Open the site again": both devices see the live site; the notice is gone; the code document is deleted.
7. On a phone (real touch, real keyboard) repeat step 3 — the number pad, the 4-digit grouping and the
   disabled submit button are the things worth looking at, and `#/admin`'s panel at 375px width is the
   other one.
