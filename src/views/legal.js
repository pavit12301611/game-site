/**
 * The two pages that answer "what do you do with my data?" and "what am I agreeing to?".
 *
 * They are plain, static prose on purpose: no marketing, no promises the operator has not made, and
 * nothing that reads as legal advice. Everything the app really does is described in terms of the
 * Firestore collections and Cloud Functions in this repository, and everything that depends on the
 * *operator* (who they are, how to reach them, which law applies, how long they keep reports) is
 * printed as a labelled launch-checklist item instead of being invented.
 *
 * Pure "state in, HTML string out", like every other view: `src/app.js` handles the clicks.
 */

import { icon } from '../ui/html.js';
import {
  CLEANUP_INTERVAL_MS,
  FRIEND_REQUEST_MAX_AGE_MS,
  INVITE_MAX_AGE_MS,
  RATE_LIMIT_MAX_AGE_MS,
  RECENT_AUTH_WINDOW_MS,
  FINISHED_ROOM_GRACE_MS,
  REPORT_MAX_AGE_MS,
  REVIEW_MAX_AGE_MS,
  ROOM_TTL_MS,
} from '../data-policy.js';

const minutes = (ms) => Math.round(ms / 60000);
const hours = (ms) => Math.round(ms / (60 * 60 * 1000));
const days = (ms) => Math.round(ms / (24 * 60 * 60 * 1000));

/** One question-and-answer row, so both pages read the same way. */
function qa(question, answer) {
  return `<div class="legal-row"><b>${question}</b><p>${answer}</p></div>`;
}

/** A launch-checklist item: a fact only the operator can fill in, never guessed here. */
function todo(item) {
  return `<li class="legal-todo">${icon('spark')}<span>${item}</span></li>`;
}

/**
 * The privacy page. Kept in sync with `firestore.rules`, `functions/src/cleanup.js` and
 * `functions/src/handlers.js`: every retention window below is the one those files actually use.
 */
export function renderPrivacy() {
  const authWindow = minutes(RECENT_AUTH_WINDOW_MS);
  return `<section class="legal-heading"><div><div class="eyebrow">What the arcade knows</div><h1>Privacy notice<span>.</span></h1><p>A plain-language list of what PSD-gaming stores, who can see it, how long it stays, and how to remove it. No legalese, no hidden analytics, and no claims about laws this project cannot verify.</p></div><span class="legal-stamp">Written for this codebase</span></section>

  <section class="legal-card"><h2>What is stored, and where</h2>
    ${qa('Firebase Authentication', 'A user id (UID), and nothing else for guests. Email/password accounts also store the email address; Google accounts store the email address and display name Google returns. Passwords are handled by Firebase Authentication and never reach this app.')}
    ${qa('Your profile', 'The username you claim, stored at <code>profiles/{your-uid}</code>. Usernames are reserved in <code>usernames/{name}</code> so two people cannot hold the same name; the backend owns both documents and no browser can write them.')}
    ${qa('Friends and invites', '<code>friendRequests</code>, <code>friendships</code> and <code>gameInvites</code> hold the two UIDs involved, the display name shown in the UI, a status and a timestamp. Only the two participants (and a signed-in admin, for tidying up abuse) can read them.')}
    ${qa('Rooms', 'A room document holds the game id, the players in it, whose turn it is, the public board, and a heartbeat of who is present. Private game state — the codebreaker code, fleet positions, quiz answer keys — lives in <code>rooms/{id}/secrets</code>, which no browser can read, and your own private view lives in <code>rooms/{id}/views/{your-uid}</code>, which only you can read.')}
    ${qa('Rate-limit counters', 'One small document per account at <code>rateLimits/{your-uid}</code> counts recent friend requests, invites, room creations, reports and review submissions so one account cannot flood the service. It is readable by nobody in the browser and is deleted by cleanup.')}
    ${qa('Blocks and reports', 'A block is stored at <code>blocks/{you}_{them}</code> and is only readable by you (and admins). A report stores your UID, the reported player or room, your message and a timestamp, and is readable only by the operator in the admin studio.')}
    ${qa('Player reviews and the review agent', 'Reviews are public to signed-out visitors and contain the display name you choose, star rating, game, title, review text, a sentiment estimate and an automatic public reply. A private backend-only owner record lets account deletion remove your reviews. Before submission, a quantized DistilBERT classifier ([model card](https://huggingface.co/Xenova/distilbert-base-uncased-finetuned-sst-2-english)) runs in your browser; its public weights are pretrained on Stanford Sentiment Treebank movie-review sentences, not PSD-gaming reviews or game reviews. The first use downloads about 67 MB of static model files from the public Hugging Face model repository (and its file CDN); the browser caches them for later, subject to browser cache eviction. The app also loads its on-demand ONNX WebAssembly runtime from this site (about 27 MB uncompressed, roughly 6.7 MB gzip in the current build). The model-file request sends normal connection metadata such as your IP address to Hugging Face, but never sends your review text. There is no inference API call or provider API key. When you post, the review text is sent to this project’s Firebase function for publication and its automatic reply. If the transformer cannot load, the backend uses the transparent lexicon and a small synthetic starter fallback; neither is a claim of real player training. An admin can label real reviews and distill them into a compact first-party word-weight model; it stores weights, not source review text.')}
    ${qa('This device', 'Favorites, recent games, theme, sound and your display name live in this browser’s <code>localStorage</code>. Clearing site data removes them; they are never sent anywhere as a list.')}
  </section>

  <section class="legal-card"><h2>What other players can see</h2>
    <p>Inside a shared room, the people in that room can see your chosen display name, the public board, whose turn it is, and a presence line (in the room / away / left). They cannot read your profile document, your email, your friend list or any other room. Username search answers with one exact match or nothing: nobody can page through the player directory, and the rules deny <code>list</code> on <code>profiles</code> outright.</p>
    <p>What no version of this app can promise: a person who holds a working invite link can join that room and can pass the link on. Casual rooms are <b>not cheat-proof</b> — the trusted backend validates every move and keeps secrets server-side, but a determined player can still collude, stall or share screens. Treat a room like a table in an arcade, not a ranked ladder.</p>
  </section>

  <section class="legal-card"><h2>How long it stays</h2>
    <p>A scheduled Cloud Function (<code>cleanupExpired</code>, every ${minutes(CLEANUP_INTERVAL_MS)} minutes) deletes expired data server-side, so a browser tab does not have to be open for cleanup to happen:</p>
    <ul class="legal-list">
      <li>Rooms stop working <b>${minutes(ROOM_TTL_MS)} minutes</b> after creation and are deleted by the next cleanup pass, together with their private views, secrets and presence documents.</li>
      <li>Game invites are cleared after <b>${hours(INVITE_MAX_AGE_MS)} hours</b>; finished rooms after <b>${minutes(FINISHED_ROOM_GRACE_MS)} minutes</b> of inactivity.</li>
      <li>Friend requests are cleared after <b>${days(FRIEND_REQUEST_MAX_AGE_MS)} days</b>; rate-limit counters after <b>${days(RATE_LIMIT_MAX_AGE_MS)} days</b>; reports after <b>${days(REPORT_MAX_AGE_MS)} days</b>; public reviews after <b>${days(REVIEW_MAX_AGE_MS)} days</b>.</li>
      <li>Unanswered requests, blocks and your profile stay until you remove them or delete the account.</li>
    </ul>
    <p>These windows are the defaults in this repository. An operator who changes their Firebase project can adjust them in <code>functions/src/cleanup.js</code>; the numbers above describe the code as it ships.</p>
  </section>

  <section class="legal-card"><h2>Deleting your account</h2>
    <p>Signed-in accounts can delete themselves from the account menu. The backend deletes your profile, releases your username reservation, removes your friendships, requests, invites, public reviews and review-training annotations, leaves or closes the rooms you were in, and finally deletes the Firebase Authentication user. If your reviews were used in a distilled model, that model is cleared so it can be retrained without those examples. If a room still needs another player to finish, deletion stops and tells you exactly what to do instead of pretending it worked.</p>
    <p>For safety, deletion asks you to have signed in within the last <b>${authWindow} minutes</b>. If you have not, it tells you to sign in again rather than failing silently. The single admin account cannot delete itself while it is the only admin: promote another player first.</p>
  </section>

  <section class="legal-card"><h2>Cookies, analytics, advertising</h2>
    <p>There are none. This app sets no cookies of its own, includes no analytics package, no advertising pixels and no third-party telemetry, and sends nothing to a server except the Firebase reads and writes the features need. Theme and sound preferences are off by default and stay in this browser.</p>
  </section>

  <section class="legal-card legal-operator"><h2>Operator details — launch checklist</h2>
    <p>These are facts about whoever deploys this app, so this repository deliberately does not invent them. Publish them before inviting real players:</p>
    <ul class="legal-todo-list">
      ${todo('Operator / data controller: legal name and a postal or contact address.')}
      ${todo('Contact for privacy questions and deletion requests, e.g. a dedicated email address.')}
      ${todo('Which jurisdiction and privacy regime applies to the deployment, reviewed by someone qualified — this page makes no compliance claim.')}
      ${todo('Whether the retention windows above are changed, and where that change is documented.')}
      ${todo('Which third parties process data (for example Google Firebase) and where their data is located.')}
      ${todo('The minimum age for players, and how that is enforced — this project does not collect ages and makes no child-directed claim.')}
    </ul>
    <p class="legal-note">Nothing on this page is legal advice, and the project does not claim GDPR, COPPA or any other compliance.</p>
  </section>

  <section class="legal-foot"><button class="button button-outline" data-action="navigate" data-page="safety">Terms &amp; safety ${icon('arrow')}</button><button class="button button-quiet" data-action="open-friends">Back to friends</button></section>`;
}

/** The terms and safety page: acceptable use, reporting, blocking, and what the software promises. */
export function renderSafety() {
  return `<section class="legal-heading"><div><div class="eyebrow">Behaviour, reports and limits</div><h1>Terms &amp; safety<span>.</span></h1><p>Short and honest: how to use the arcade, how reporting and blocking work, and what this project does <em>not</em> promise. Read it as house rules, not a contract drafted by a lawyer.</p></div><span class="legal-stamp">House rules</span></section>

  <section class="legal-card"><h2>The short version</h2>
    <p>Be a decent human, play the games, don’t attack the service or the people on it. Online features are provided as-is for casual play between people who already know each other. Local practice and the whole single-device arcade work with no account and no Firebase project at all.</p>
  </section>

  <section class="legal-card"><h2>Play fair</h2>
    ${qa('No harassment or abuse', 'Do not use names, reports, invites or room links to harass, impersonate or threaten anyone. Usernames are unique and reserved so impersonation is visible, not impossible — report it if you see it.')}
    ${qa('No automated abuse', 'Do not scrape, spam invites or friend requests, or script room creation. The backend applies per-account rate limits to friend requests, invites, room creation, lookups, moves and reports, and the rules deny browser writes to every social and room collection.')}
    ${qa('No breaking the service', 'Do not attempt to reach other players’ private state, interfere with rooms you are not in, or work around the trusted backend. Moves and room transitions are validated server-side; forged ones are rejected.')}
    ${qa('No pirate content', 'Game titles, art and question banks in this repository are original or generic. Do not add copyrighted trivia, branded logos or third-party assets you do not have the right to ship.')}
  </section>

  <section class="legal-card"><h2>Reporting and blocking</h2>
    <p>Two tools exist, and it matters what each one really does:</p>
    ${qa('Block', 'Blocking is immediate and local to the arcade: the blocked player disappears from your search results and cannot send you a friend request, invite or challenge. Pending requests and invites between the two of you are cleared. You can unblock them again from the same place. It does not remove either account’s history with anyone else.')}
    ${qa('Report', 'A report is stored for the operator to read in the admin studio, along with your UID, the player or room you named and your message. Nothing about it is shown to the reported player and there is no automatic moderation: a human has to look. The report path is rate-limited, and reports are deleted by the scheduled cleanup after the retention window. If nobody operates this deployment, nobody reads them — check the operator details on the privacy page.')}
    ${qa('Safety first', 'If someone is in danger, contact the platform or the authorities directly. This hobby arcade has no emergency response and no way to identify people behind a guest link.')}
  </section>

  <section class="legal-card"><h2>Accounts and availability</h2>
    ${qa('Your account, your responsibility', 'Keep control of your email or Google account: whoever can sign in as you can change your username and delete the account. Guest accounts are bound to this browser’s storage; clearing site data loses them.')}
    ${qa('No uptime promise', 'The arcade is offered as-is, without warranty. Firebase quotas, an operator’s billing state, a browser update or a deploy can interrupt or permanently end online play. Rooms expire after 60 minutes by design.')}
    ${qa('Changes', 'Features, game rules and these pages can change between deployments. The repository’s history is the record of what changed.')}
    ${qa('Ending access', 'An operator may remove rooms, players or admin access to keep the arcade usable. Self-service account deletion is always available to the account owner.')}
  </section>

  <section class="legal-card legal-operator"><h2>Before opening the doors — launch checklist</h2>
    <ul class="legal-todo-list">
      ${todo('Decide who answers reports and how quickly, and put that in the operator details.')}
      ${todo('Confirm the deployment’s Firebase project, billing account and admin list are the ones you expect.')}
      ${todo('Have the privacy notice’s operator section filled in and reviewed by someone qualified for your jurisdiction.')}
      ${todo('Keep the README’s honesty: casual rooms are not cheat-proof and a valid invite link is a valid invite.')}
    </ul>
    <p class="legal-note">These house rules are not legal advice and make no compliance claim.</p>
  </section>

  <section class="legal-foot"><button class="button button-outline" data-action="navigate" data-page="privacy">Privacy notice ${icon('arrow')}</button><button class="button button-quiet" data-action="open-friends">Back to friends</button></section>`;
}
