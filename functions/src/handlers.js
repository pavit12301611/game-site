/**
 * The trusted backend's logic, written against the narrow `Store` interface so it can be unit
 * tested without an emulator, a JVM or the network.
 *
 * Every online mutation the browser used to perform with a Firestore transaction happens here
 * instead. The rules file denies those client writes outright (`allow write: if false` on rooms,
 * profiles, usernames, requests, invites, friendships, blocks and reports), so this module is not a
 * second line of defence — it is the only writer. The Admin SDK bypasses security rules, which is
 * why nothing below may trust the payload: uid, room membership, room status, room lifetime, turn
 * order, action shape, tap tempo, block lists and per-user rate limits are all re-checked here.
 *
 * Handlers are pure functions of (payload, context, deps) and return plain objects. `index.js`
 * wraps them in `onCall`, converts errors to `HttpsError` and writes the authoritative room views.
 */

import {
  RATE_LIMITS,
  ROOM_TTL_MS,
  checkRateLimit,
  pruneRateRecord,
} from '../vendor/shared/online/policy.js';
import {
  RoomError,
  createRoom as createRoomState,
  handoffHost,
  isRoomExpired,
  joinRoom as joinRoomState,
  leaveRoom as leaveRoomState,
  privateStatesFor,
  publicStateFor,
  rematchRoom as rematchRoomState,
  roomPlayers,
  startRoom as startRoomState,
  playMove as playMoveState,
} from '../vendor/shared/online/room.js';
import { MAX_STATE_BYTES, jsonBytes, roomCode } from '../vendor/shared/online/view.js';
import {
  DISPLAY_NAME_MAX,
  REPORT_MESSAGE_MAX,
  safeDisplayName,
  safeMessage,
  suggestUsername,
  validateUsername,
} from '../vendor/shared/online/identity.js';
import { RECENT_AUTH_WINDOW_MS } from '../vendor/shared/online/retention.js';
import {
  REVIEW_AGENT_VERSION,
  REVIEW_MESSAGE_MAX,
  REVIEW_NAME_MAX,
  REVIEW_SENTIMENTS,
  REVIEW_TITLE_MAX,
  analyzeReview,
  createAssistantReply,
  reviewFeaturedScore,
  trainDistilledReviewModel,
} from '../vendor/shared/reviews/agent.js';
import { paths, text } from './store.js';

export { RoomError };

/** A failure the caller can map to an HTTP status, with a code the browser turns into a sentence. */
export class PolicyError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, any>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
    this.details = details;
  }
}

// Retention windows come from the shared table so the privacy notice and the cleanup query cannot
// drift apart. Re-exported here because the tests and `cleanup.js` read them from this module.
export { RECENT_AUTH_WINDOW_MS, REPORT_MAX_AGE_MS } from '../vendor/shared/online/retention.js';

/** Maintenance mode: what the admin may put in front of the arcade, and how testers get in. */
export const MAINTENANCE_MESSAGE_MAX = 280;
/** The tester PIN is exactly this many decimal digits (generated server-side, never shipped to a client). */
export const MAINTENANCE_PIN_LENGTH = 16;
/** A PIN-verified tester stays in until the maintenance window ends, with a hard 24h ceiling. */
export const MAINTENANCE_BYPASS_TTL_MS = 24 * 60 * 60 * 1000;

/** Constant-time string compare for the tester PIN (equal lengths, XOR-accumulated: no early exit). */
function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * @typedef {{
 *   store: import('./store.js').Store,
 *   games: Array<Record<string, any>>,
 *   engines: { createInitialGameState: Function, applyGameAction: Function },
 *   onlineBankFor: (gameId: string) => Array<Record<string, any>>,
 *   randomId: (length?: number) => string,
 *   randomDigits: (length: number) => string,
 *   timestampMs: number,
 *   deleteAuthUser?: (uid: string) => Promise<void>,
 * }} BackendDeps
 */

/** @param {any[]} games @param {string} gameId */
function findGame(games, gameId) {
  return games.find((game) => game.id === gameId) ?? null;
}

/**
 * Builds every handler once, bound to the production dependencies.
 * @param {BackendDeps} deps
 */
export function createHandlers(deps) {
  const { store, games, engines, randomId, randomDigits } = deps;

  /** A registry that keeps the engines module's API shape for the shared room transitions. */
  const engineRegistry = {
    createInitialGameState: engines.createInitialGameState,
    applyGameAction: engines.applyGameAction,
    gameById: (gameId) => findGame(games, gameId),
  };

  /** @param {string} uid */
  const requireUser = (uid) => {
    if (!uid) throw new PolicyError('unauthenticated', 'Sign in (or continue as a guest) before using online features.');
    return uid;
  };

  /** @param {any} context */
  const tokenOf = (context) => context?.token ?? {};

  /**
   * @param {string} uid
   * @param {keyof typeof RATE_LIMITS} key
   * @returns {Promise<void>}
   */
  async function spendRateLimit(uid, key) {
    const policy = RATE_LIMITS[key];
    await store.transaction(async (tx) => {
      const snapshot = await tx.get(paths.rateLimit(uid));
      const record = snapshot.exists ? snapshot.data.buckets ?? {} : {};
      const result = checkRateLimit(record, key, policy, deps.timestampMs);
      if (!result.ok) {
        const minutes = Math.max(1, Math.ceil(result.retryAfterMs / 60000));
        throw new PolicyError('rate-limited', `Too many ${policy.label}. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, {
          retryAfterMs: result.retryAfterMs,
          limit: policy.label,
        });
      }
      // `updatedAtMs` lets the scheduled cleanup drop documents that only hold long-expired buckets.
      tx.set(paths.rateLimit(uid), { buckets: pruneRateRecord(result.next, deps.timestampMs), updatedAtMs: deps.timestampMs });
    });
  }

  /** @param {string} uid */
  async function loadProfile(uid) {
    const snapshot = await store.get(paths.profile(uid));
    if (!snapshot.exists) throw new PolicyError('profile-required', 'Choose a username before using friends, invites and rooms.');
    return snapshot.data;
  }

  /** @param {string} a @param {string} b */
  async function assertNotBlocked(a, b) {
    const [forward, backward] = await Promise.all([store.get(paths.block(a, b)), store.get(paths.block(b, a))]);
    if (forward.exists || backward.exists) {
      throw new PolicyError('blocked', 'That player is not available for requests or invites.');
    }
  }

  /** @param {string} roomId @param {number} now */
  async function loadRoom(roomId, now) {
    const snapshot = await store.get(paths.room(roomId));
    if (!snapshot.exists) throw new RoomError('room-not-found', 'That room does not exist.');
    const room = { id: roomId, ...snapshot.data };
    if (isRoomExpired(room, now)) throw new RoomError('room-expired', 'This room expired after 1 hour and was automatically deleted.');
    return room;
  }

  /** @param {string} roomId */
  async function loadSecret(roomId) {
    const snapshot = await store.get(paths.secret(roomId));
    if (!snapshot.exists) return null;
    return snapshot.data;
  }

  /**
   * Writes the authoritative room document, its server-only state and the per-player private views
   * in one batch, so a player can never read a room whose secret has not landed yet.
   * @param {Record<string, any>} room
   * @param {Record<string, any>} secret
   * @param {Record<string, any>} [extras]
   */
  async function persistRoom(room, secret, extras = {}) {
    const publicState = publicStateFor(engineRegistry.gameById(room.gameId), secret);
    if (jsonBytes(publicState) > MAX_STATE_BYTES) throw new PolicyError('state-too-large', 'This game state is too large to store.');
    const roomDocument = {
      hostUid: room.hostUid,
      hostName: room.hostName,
      gameId: room.gameId,
      playerUids: room.playerUids,
      playerNames: room.playerNames,
      maxPlayers: room.maxPlayers,
      status: room.status,
      state: publicState,
      winnerUid: room.winnerUid ?? null,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      expiresAt: room.createdAt + ROOM_TTL_MS,
      code: roomCode(room.id || secret.roomId || ''),
      backend: 1,
      revision: secret.revision,
      ...extras,
    };
    const ops = [
      { type: 'set', path: paths.room(room.id), data: roomDocument },
      { type: 'set', path: paths.secret(room.id), data: { ...secret, updatedAt: room.updatedAt } },
    ];
    for (const [uid, view] of Object.entries(privateStatesFor(engineRegistry.gameById(room.gameId), secret, room))) {
      ops.push({ type: 'set', path: paths.view(room.id, uid), data: view });
    }
    for (const uid of room.playerUids) {
      if (!room.playerNames?.[uid]) ops.push({ type: 'delete', path: paths.presence(room.id, uid) });
    }
    await store.batch(ops);
  }

  /** @param {Record<string, any>} room */
  function seedFor(room) {
    return `${room.id}:${deps.timestampMs}`;
  }

  /**
   * The payload shape the browser needs to render a room without a second read: the public state
   * every member may see, plus this player's own private view (Sea Battle fleets). A player's view
   * never contains another player's private fields.
   */
  async function roomPayload(room, uid) {
    const view = await store.get(paths.view(room.id, uid));
    return {
      roomId: room.id,
      code: roomCode(room.id),
      status: room.status,
      gameId: room.gameId,
      playerUids: room.playerUids,
      playerNames: room.playerNames,
      hostUid: room.hostUid,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      revision: room.revision ?? null,
      publicState: room.state ?? null,
      privateState: view.exists ? view.data : null,
    };
  }

  // ── Identity ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Claim a username. The reservation document and the profile are written in one transaction, so
   * two people racing for the same name cannot both win, and the profile can never point at a
   * reservation that belongs to someone else.
   * @param {Record<string, any>} payload
   * @param {any} context
   */
  async function claimUsername(payload, context) {
    const uid = requireUser(context.uid);
    if (tokenOf(context).firebase?.sign_in_provider === 'anonymous') {
      throw new PolicyError('account-required', 'Sign in with a full account to claim a username. Guests can still play with a temporary name.');
    }
    const validation = validateUsername(payload?.username);
    if (!validation.ok) throw new PolicyError('invalid-username', validation.error);
    await spendRateLimit(uid, 'claimUsername');

    await store.transaction(async (tx) => {
      const [claim, profile] = await Promise.all([tx.get(paths.username(validation.usernameLower)), tx.get(paths.profile(uid))]);
      if (claim.exists && claim.data.uid !== uid) throw new PolicyError('username-taken', 'That username is already taken. Try another one.');
      if (profile.exists && profile.data.usernameLower !== validation.usernameLower) {
        throw new PolicyError('profile-exists', 'This account already has a username. Usernames cannot be changed.');
      }
      const now = deps.timestampMs;
      tx.set(paths.username(validation.usernameLower), { uid, username: validation.username, createdAtMs: now });
      tx.set(paths.profile(uid), {
        uid,
        username: validation.username,
        usernameLower: validation.usernameLower,
        createdAtMs: profile.exists ? (profile.data.createdAtMs ?? now) : now,
      });
    });
    return { username: validation.username, usernameLower: validation.usernameLower };
  }

  /**
   * Exact username lookup for the friend search. Returns one match or nothing: there is no way to
   * page the directory, and anonymous guests are refused outright, so the player list cannot be
   * scraped through this call.
   * @param {Record<string, any>} payload
   * @param {any} context
   */
  async function lookupUser(payload, context) {
    const uid = requireUser(context.uid);
    if (tokenOf(context).firebase?.sign_in_provider === 'anonymous') {
      throw new PolicyError('account-required', 'Create an account with a username to search for players.');
    }
    await loadProfile(uid);
    const validation = validateUsername(payload?.username);
    if (!validation.ok) throw new PolicyError('invalid-username', validation.error);
    await spendRateLimit(uid, 'lookupUser');
    const claim = await store.get(paths.username(validation.usernameLower));
    if (!claim.exists) return { found: false };
    const targetUid = claim.data.uid;
    if (targetUid === uid) return { found: false, self: true };
    await assertNotBlocked(uid, targetUid);
    const profile = await store.get(paths.profile(targetUid));
    if (!profile.exists) return { found: false };
    const friend = await store.get(paths.friendship(uid, targetUid));
    return {
      found: true,
      uid: targetUid,
      username: profile.data.username,
      alreadyFriends: friend.exists,
    };
  }

  // ── Social ──────────────────────────────────────────────────────────────────────────────────────

  /**
   * @param {Record<string, any>} payload
   * @param {any} context
   */
  async function sendFriendRequest(payload, context) {
    const uid = requireUser(context.uid);
    if (tokenOf(context).firebase?.sign_in_provider === 'anonymous') {
      throw new PolicyError('account-required', 'Sign in with an account to add friends.');
    }
    const profile = await loadProfile(uid);
    const validation = validateUsername(payload?.username);
    if (!validation.ok) throw new PolicyError('invalid-username', validation.error);
    await spendRateLimit(uid, 'friendRequest');

    const claim = await store.get(paths.username(validation.usernameLower));
    if (!claim.exists) throw new PolicyError('user-not-found', 'No player has that username.');
    const toUid = claim.data.uid;
    if (toUid === uid) throw new PolicyError('self-request', 'That is your own username.');
    await assertNotBlocked(uid, toUid);
    const toProfile = await store.get(paths.profile(toUid));
    if (!toProfile.exists) throw new PolicyError('user-not-found', 'No player has that username.');

    const friendship = await store.get(paths.friendship(uid, toUid));
    if (friendship.exists) throw new PolicyError('already-friends', 'You are already friends with that player.');

    // One request per direction at a time: the document id is deterministic, so a repeated tap
    // updates the same request instead of filling the other player's inbox.
    const requestId = `${uid}_${toUid}`;
    const existing = await store.get(paths.friendRequest(requestId));
    if (existing.exists && existing.data.status === 'pending') {
      return { requestId, status: 'pending', alreadySent: true };
    }
    await store.set(paths.friendRequest(requestId), {
      fromUid: uid,
      toUid,
      fromName: safeDisplayName(profile.username, 'A player'),
      toName: safeDisplayName(toProfile.data.username, 'A player'),
      status: 'pending',
      createdAt: deps.timestampMs,
      createdAtMs: deps.timestampMs,
    });
    return { requestId, status: 'pending', alreadySent: false };
  }

  /**
   * Accept or decline a request. Accepting writes the friendship in the same transaction as the
   * status change, so a friendship can never exist without an accepted request behind it.
   * @param {Record<string, any>} payload
   * @param {any} context
   */
  async function respondFriendRequest(payload, context) {
    const uid = requireUser(context.uid);
    await spendRateLimit(uid, 'respondFriendRequest');
    const requestId = text(payload, 'requestId');
    if (!requestId) throw new PolicyError('invalid-request', 'That friend request could not be found.');
    const accept = payload?.accept === true;
    let friendshipId = '';
    await store.transaction(async (tx) => {
      const request = await tx.get(paths.friendRequest(requestId));
      if (!request.exists) throw new PolicyError('request-missing', 'That friend request is no longer available.');
      const data = request.data;
      if (data.toUid !== uid) throw new PolicyError('not-your-request', 'That request was not addressed to you.');
      if (data.status !== 'pending') throw new PolicyError('request-handled', 'This request has already been answered.');
      if (!accept) {
        tx.update(paths.friendRequest(requestId), { status: 'declined', respondedAt: deps.timestampMs });
        return;
      }
      const [fromProfile, toProfile] = await Promise.all([tx.get(paths.profile(data.fromUid)), tx.get(paths.profile(uid))]);
      if (!fromProfile.exists || !toProfile.exists) throw new PolicyError('profile-missing', 'One of these accounts no longer exists.');
      const memberUids = [data.fromUid, uid].sort();
      friendshipId = paths.friendship(data.fromUid, uid).replace('friendships/', '');
      tx.update(paths.friendRequest(requestId), { status: 'accepted', respondedAt: deps.timestampMs });
      tx.set(paths.friendship(data.fromUid, uid), {
        memberUids,
        memberNames: {
          [data.fromUid]: safeDisplayName(fromProfile.data.username, 'A player'),
          [uid]: safeDisplayName(toProfile.data.username, 'A player'),
        },
        requestId,
        createdAtMs: deps.timestampMs,
      });
    });
    return { requestId, accepted: accept, friendshipId };
  }

  /**
   * @param {Record<string, any>} payload
   * @param {any} context
   */
  async function cancelFriendRequest(payload, context) {
    const uid = requireUser(context.uid);
    const requestId = text(payload, 'requestId');
    const request = await store.get(paths.friendRequest(requestId));
    if (!request.exists) return { cancelled: true };
    if (request.data.fromUid !== uid) throw new PolicyError('not-your-request', 'Only the sender can withdraw a friend request.');
    if (request.data.status !== 'pending') throw new PolicyError('request-handled', 'This request has already been answered.');
    await store.delete(paths.friendRequest(requestId));
    return { cancelled: true };
  }

  /**
   * Invite a friend into a room you host. The rules used to check the friendship and the room in the
   * client; now the server reads both.
   * @param {Record<string, any>} payload
   * @param {any} context
   */
  async function createGameInvite(payload, context) {
    const uid = requireUser(context.uid);
    const profile = await loadProfile(uid);
    await spendRateLimit(uid, 'gameInvite');
    const roomId = text(payload, 'roomId');
    const toUid = text(payload, 'toUid');
    const room = await loadRoom(roomId, deps.timestampMs);
    if (room.hostUid !== uid) throw new PolicyError('host-only', 'Only the room host can invite players.');
    if (room.playerUids.includes(toUid)) throw new PolicyError('already-in-room', 'That player is already in the room.');
    if (room.playerUids.length >= room.maxPlayers) throw new PolicyError('room-full', 'This room is full.');
    const friendship = await store.get(paths.friendship(uid, toUid));
    if (!friendship.exists) throw new PolicyError('not-friends', 'You can only invite players on your friends list.');
    await assertNotBlocked(uid, toUid);
    const toProfile = await store.get(paths.profile(toUid));
    const inviteId = `${roomId}_${uid}_${toUid}`;
    await store.set(paths.gameInvite(inviteId), {
      fromUid: uid,
      toUid,
      fromName: safeDisplayName(profile.username, 'A friend'),
      toName: safeDisplayName(toProfile.exists ? toProfile.data.username : '', 'A friend'),
      friendshipId: paths.friendship(uid, toUid).replace('friendships/', ''),
      roomId,
      gameId: room.gameId,
      status: 'pending',
      createdAt: deps.timestampMs,
      createdAtMs: deps.timestampMs,
    });
    return { inviteId, roomId };
  }

  /**
   * @param {Record<string, any>} payload
   * @param {any} context
   */
  async function respondGameInvite(payload, context) {
    const uid = requireUser(context.uid);
    const inviteId = text(payload, 'inviteId');
    const invite = await store.get(paths.gameInvite(inviteId));
    if (!invite.exists) throw new PolicyError('invite-missing', 'This game invite is no longer valid.');
    if (invite.data.toUid !== uid) throw new PolicyError('not-your-invite', 'That invite was not addressed to you.');
    if (invite.data.status !== 'pending') {
      if (payload?.accept !== true) return { inviteId, status: invite.data.status };
    }
    await store.update(paths.gameInvite(inviteId), {
      status: payload?.accept === true ? 'accepted' : 'declined',
      respondedAt: deps.timestampMs,
    });
    return { inviteId, status: payload?.accept === true ? 'accepted' : 'declined', roomId: invite.data.roomId };
  }

  // ── Rooms ───────────────────────────────────────────────────────────────────────────────────────

  /** @param {Record<string, any>} payload @param {any} context */
  async function createRoom(payload, context) {
    const uid = requireUser(context.uid);
    const game = findGame(games, text(payload, 'gameId'));
    if (!game) throw new PolicyError('unknown-game', 'Choose one of the games in the catalog.');
    const maxPlayers = Number(payload?.maxPlayers);
    if (![2, 3].includes(maxPlayers)) throw new PolicyError('bad-room-size', 'Choose a room size of 2 or 3 players.');
    await spendRateLimit(uid, 'createRoom');
    const profile = await store.get(paths.profile(uid));
    const name = safeDisplayName(
      text(payload, 'displayName') || (profile.exists ? profile.data.username : '') || suggestUsername('guest'),
      'Player',
    );
    const roomId = randomId(20);
    const created = createRoomState({
      roomId: `${roomId}`, // used only as a seed and for the display code below
      game,
      host: { uid, name },
      maxPlayers,
      seed: `${roomId}:${deps.timestampMs}:${uid}`,
      nowMs: deps.timestampMs,
      engines: engineRegistry,
    });
    const room = { id: roomId, ...created.room };
    await persistRoom(room, created.secret);
    return { ...(await roomPayload(room, uid)), code: roomCode(roomId) };
  }

  /**
   * Join by room id or by the 7-character code, and take over a lobby whose host has gone.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function joinRoom(payload, context) {
    const uid = requireUser(context.uid);
    await spendRateLimit(uid, 'joinRoom');
    const code = text(payload, 'code').toUpperCase();
    let roomId = text(payload, 'roomId');
    if (!roomId && code) {
      const matches = await store.query('rooms', { where: [['code', '==', code]], limit: 3 });
      if (!matches.length) throw new PolicyError('room-not-found', `No room matches the code ${code}.`);
      if (matches.length > 1) throw new PolicyError('code-ambiguous', 'More than one room uses that code. Ask for the full invite link.');
      roomId = matches[0].id;
    }
    const room = await loadRoom(roomId, deps.timestampMs);
    const secret = await loadSecret(roomId);
    if (!secret) throw new PolicyError('room-not-ready', 'This room is not ready yet. Ask the host to resend the invite.');
    const profile = await store.get(paths.profile(uid));
    const name = safeDisplayName(text(payload, 'displayName') || (profile.exists ? profile.data.username : ''), 'Guest');
    const joined = joinRoomState({ room, secret, user: { uid, name }, nowMs: deps.timestampMs, engines: engineRegistry });
    if (!joined.rejoined) {
      joined.room.id = roomId;
      await persistRoom(joined.room, joined.secret);
    }
    return roomPayload({ id: roomId, ...joined.room }, uid);
  }

  /** @param {Record<string, any>} payload @param {any} context */
  async function leaveRoom(payload, context) {
    const uid = requireUser(context.uid);
    const roomId = text(payload, 'roomId');
    const room = await loadRoom(roomId, deps.timestampMs);
    const secret = await loadSecret(roomId);
    if (!secret) throw new PolicyError('room-not-ready', 'This room is not ready.');
    const result = leaveRoomState({ room, secret, uid, nowMs: deps.timestampMs, engines: engineRegistry });
    if (result.deleted) {
      await store.recursiveDelete(paths.room(roomId));
      return { roomId, deleted: true };
    }
    result.room.id = roomId;
    await persistRoom(result.room, result.secret);
    await store.delete(paths.presence(roomId, uid));
    await store.delete(paths.view(roomId, uid));
    return { roomId, deleted: false };
  }

  /** @param {Record<string, any>} payload @param {any} context */
  async function startRoom(payload, context) {
    const uid = requireUser(context.uid);
    const roomId = text(payload, 'roomId');
    const room = await loadRoom(roomId, deps.timestampMs);
    const secret = await loadSecret(roomId);
    if (!secret) throw new PolicyError('room-not-ready', 'This room is not ready yet.');
    // Starting a match never moves the host: the host is the one pressing start, and a lobby whose
    // host really has gone is taken over through `claimHost`, which checks the heartbeat itself.
    const started = startRoomState({ room, secret, uid, nowMs: deps.timestampMs });
    started.room.id = roomId;
    await persistRoom(started.room, started.secret);
    return roomPayload({ id: roomId, ...started.room }, uid);
  }

  /**
   * A deliberate host takeover, used by the "Take over as host" button when the host is gone. The
   * server decides whether the host really is gone; the button cannot force anything.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function claimHost(payload, context) {
    const uid = requireUser(context.uid);
    const roomId = text(payload, 'roomId');
    const room = await loadRoom(roomId, deps.timestampMs);
    if (!room.playerUids.includes(uid)) throw new RoomError('not-in-room', 'You are not in this room.');
    if (room.hostUid === uid) return { roomId, hostUid: uid, changed: false };
    const presence = await loadPresence(roomId);
    const handoff = handoffHost({ room: { id: roomId, ...room }, nowMs: deps.timestampMs, presence, graceMs: 75 * 1000 });
    if (!handoff.changed) {
      throw new PolicyError('host-still-here', 'The host is still in the room. Handing over is only possible once they are away.');
    }
    handoff.room.id = roomId;
    await store.update(paths.room(roomId), {
      hostUid: handoff.room.hostUid,
      hostName: handoff.room.hostName,
      updatedAt: handoff.room.updatedAt,
    });
    return { roomId, hostUid: handoff.room.hostUid, changed: true };
  }

  /**
   * One online move. The engine runs on the server against the stored state; `clientActionId` makes
   * a retry safe.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function playMove(payload, context) {
    const uid = requireUser(context.uid);
    const roomId = text(payload, 'roomId');
    await spendRateLimit(uid, 'playMove');
    const room = await loadRoom(roomId, deps.timestampMs);
    const secret = await loadSecret(roomId);
    if (!secret) throw new PolicyError('room-not-ready', 'This room is not ready yet.');
    const result = playMoveState({
      room,
      secret,
      uid,
      action: payload?.action,
      nowMs: deps.timestampMs,
      engines: engineRegistry,
      clientActionId: text(payload, 'clientActionId'),
    });
    if (result.duplicate) return { ...(await roomPayload({ id: roomId, ...room }, uid)), duplicate: true };
    if (!result.applied) {
      return {
        ...(await roomPayload({ id: roomId, ...room }, uid)),
        applied: false,
        accepted: result.accepted ?? 0,
        rejected: result.rejected ?? 0,
        reason: 'tempo',
      };
    }
    result.room.id = roomId;
    await persistRoom(result.room, result.secret);
    return {
      ...(await roomPayload({ id: roomId, ...result.room }, uid)),
      applied: true,
      accepted: result.accepted ?? 1,
      rejected: result.rejected ?? 0,
    };
  }

  /** @param {Record<string, any>} payload @param {any} context */
  async function rematch(payload, context) {
    const uid = requireUser(context.uid);
    const roomId = text(payload, 'roomId');
    await spendRateLimit(uid, 'rematch');
    const room = await loadRoom(roomId, deps.timestampMs);
    const secret = await loadSecret(roomId);
    if (!secret) throw new PolicyError('room-not-ready', 'This room is not ready yet.');
    const rematched = rematchRoomState({
      room,
      secret,
      uid,
      nowMs: deps.timestampMs,
      seed: seedFor({ id: roomId }),
      engines: engineRegistry,
    });
    rematched.room.id = roomId;
    await persistRoom(rematched.room, rematched.secret);
    return roomPayload({ id: roomId, ...rematched.room }, uid);
  }

  /**
   * @param {string} roomId
   * @returns {Promise<Record<string, { status?: string, lastSeenAtMs?: number }>>}
   */
  async function loadPresence(roomId) {
    const docs = await store.query(`rooms/${roomId}/presence`, { limit: 5 });
    const presence = {};
    for (const doc of docs) presence[doc.id] = { status: doc.data.status, lastSeenAtMs: doc.data.lastSeenAtMs ?? doc.data.lastSeenAt };
    return presence;
  }

  // ── Blocks, reports, deletion, moderation ───────────────────────────────────────────────────────

  /** @param {Record<string, any>} payload @param {any} context */
  async function blockUser(payload, context) {
    const uid = requireUser(context.uid);
    const blockedUid = text(payload, 'uid');
    if (!blockedUid || blockedUid === uid) throw new PolicyError('invalid-block', 'Choose another player to block.');
    await store.set(paths.block(uid, blockedUid), { blockerUid: uid, blockedUid, createdAtMs: deps.timestampMs });
    // A block also clears anything already waiting between the two players.
    await store.batch([
      { type: 'delete', path: paths.friendRequest(`${uid}_${blockedUid}`) },
      { type: 'delete', path: paths.friendRequest(`${blockedUid}_${uid}`) },
    ]);
    const requests = await store.query('friendRequests', { where: [['toUid', '==', blockedUid], ['fromUid', '==', uid]], limit: 5 });
    for (const request of requests) await store.delete(paths.friendRequest(request.id));
    const invites = await store.query('gameInvites', { where: [['fromUid', '==', uid], ['toUid', '==', blockedUid]], limit: 5 });
    for (const invited of invites) await store.delete(paths.gameInvite(invited.id));
    return { blocked: blockedUid };
  }

  /** @param {Record<string, any>} payload @param {any} context */
  async function unblockUser(payload, context) {
    const uid = requireUser(context.uid);
    const blockedUid = text(payload, 'uid');
    if (!blockedUid) throw new PolicyError('invalid-block', 'Choose the player to unblock.');
    await store.delete(paths.block(uid, blockedUid));
    return { unblocked: blockedUid };
  }

  /**
   * A problem report. It is stored for the operator to read in the admin studio; nothing about it is
   * shown to the reported player and there is no automatic moderation.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function reportProblem(payload, context) {
    const uid = requireUser(context.uid);
    await spendRateLimit(uid, 'report');
    const kind = ['player', 'room', 'bug', 'content', 'other'].includes(text(payload, 'kind')) ? text(payload, 'kind') : 'other';
    const message = safeMessage(payload?.message, REPORT_MESSAGE_MAX);
    if (message.length < 5) throw new PolicyError('report-too-short', 'Describe the problem in a few words first.');
    const targetUid = text(payload, 'targetUid').slice(0, 64);
    const roomId = text(payload, 'roomId').slice(0, 64);
    const reportId = randomId(20);
    await store.set(paths.report(reportId), {
      reporterUid: uid,
      kind,
      targetUid,
      roomId,
      message,
      status: 'open',
      createdAtMs: deps.timestampMs,
    });
    return { reportId, kind };
  }

  /**
   * Publish a player review and its automatic reply as one trusted backend operation. The public
   * document contains no Firebase UID; a separate, backend-only owner record lets account deletion
   * remove the review without exposing identity to other readers.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function createReview(payload, context) {
    const uid = requireUser(context.uid);
    const rating = Number(payload?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new PolicyError('invalid-review-rating', 'Choose a star rating from 1 to 5.');
    }
    const title = safeMessage(payload?.title, REVIEW_TITLE_MAX);
    const message = safeMessage(payload?.message, REVIEW_MESSAGE_MAX);
    if (message.length < 8) throw new PolicyError('review-too-short', 'Add a little more detail (at least 8 characters) before posting.');
    const requestedGameId = text(payload, 'gameId') || 'arcade';
    const game = requestedGameId === 'arcade' ? null : findGame(games, requestedGameId);
    if (requestedGameId !== 'arcade' && !game) throw new PolicyError('invalid-review-game', 'Choose a game from the list or review the whole arcade.');
    await spendRateLimit(uid, 'review');

    const profile = await store.get(paths.profile(uid));
    const proposedName = profile.exists ? profile.data.username : payload?.reviewerName;
    const reviewerName = safeDisplayName(proposedName, 'Guest player').slice(0, REVIEW_NAME_MAX);
    const modelSnapshot = await store.get(paths.reviewAgentModel('active'));
    const model = modelSnapshot.exists ? modelSnapshot.data : null;
    // Only the tiny, version-pinned classifier result crosses this boundary; analyzeReview validates
    // its model id, revision, sentiment and confidence. Review text is never sent to a model host.
    const analysis = analyzeReview({ title, text: message, rating, model, pretrainedPrediction: payload?.pretrainedPrediction });
    const assistantReply = createAssistantReply({
      ...analysis,
      reviewerName,
      gameTitle: game?.title || 'the arcade',
    });
    const reviewId = randomId(20);
    const createdAtMs = deps.timestampMs;
    const review = {
      reviewerName,
      title,
      message,
      rating,
      gameId: requestedGameId,
      sentiment: analysis.sentiment,
      sentimentConfidence: analysis.confidence,
      topics: analysis.topics,
      assistantReply,
      assistantName: 'Arcade Review Agent',
      assistantMode: analysis.source,
      assistantVersion: REVIEW_AGENT_VERSION,
      featuredScore: reviewFeaturedScore({ rating, title, message, gameId: requestedGameId, topics: analysis.topics }),
      createdAtMs,
    };
    await store.batch([
      { type: 'set', path: paths.review(reviewId), data: review },
      { type: 'set', path: paths.reviewOwner(reviewId), data: { ownerUid: uid, createdAtMs } },
    ]);
    return { reviewId, sentiment: analysis.sentiment, assistantReply, assistantName: review.assistantName };
  }

  /** Admin correction label used as human supervision for the local review model. */
  async function adminLabelReview(payload, context) {
    const adminUid = await requireAdmin(context);
    const reviewId = text(payload, 'reviewId').slice(0, 64);
    const label = text(payload, 'sentiment');
    if (!reviewId || !REVIEW_SENTIMENTS.includes(label)) {
      throw new PolicyError('invalid-review-label', 'Choose a review and one of the supported sentiment labels.');
    }
    const review = await store.get(paths.review(reviewId));
    if (!review.exists) throw new PolicyError('review-not-found', 'That review is no longer available. Refresh the review list.');
    await store.set(paths.reviewAnnotation(reviewId), {
      reviewId,
      sentiment: label,
      createdByUid: adminUid,
      createdAtMs: deps.timestampMs,
    });
    return { reviewId, sentiment: label };
  }

  /**
   * Train the compact no-key model from actual community reviews after an admin has checked their
   * sentiment labels. The review text is read for training but never copied into the model document.
   */
  async function adminTrainReviewAgent(payload, context) {
    const adminUid = await requireAdmin(context);
    const [reviews, annotations] = await Promise.all([
      store.query('reviews', { limit: 500 }),
      store.query('reviewAnnotations', { limit: 500 }),
    ]);
    const reviewById = new Map(reviews.map((review) => [review.id, review.data]));
    const examples = annotations.flatMap((annotation) => {
      const review = reviewById.get(annotation.id);
      if (!review || !REVIEW_SENTIMENTS.includes(annotation.data.sentiment)) return [];
      return [{ text: review.message, title: review.title, label: annotation.data.sentiment }];
    });
    const distilled = trainDistilledReviewModel(examples);
    if (!distilled.ok) throw new PolicyError('review-agent-needs-labels', distilled.error, { classCounts: distilled.classCounts });
    await store.set(paths.reviewAgentModel('active'), {
      ...distilled.model,
      trainedAtMs: deps.timestampMs,
      trainedByUid: adminUid,
    });
    return {
      trainingSize: distilled.trainingSize,
      vocabularySize: distilled.vocabularySize,
      classCounts: distilled.classCounts,
      trainedAtMs: deps.timestampMs,
    };
  }

  /**
   * Self-service account deletion.
   *
   * The data is removed in one transaction plus a bounded sweep, the Firebase Auth user is deleted
   * with the Admin SDK, and the last admin of the installation can never delete themselves by
   * accident: they are told to promote someone else first.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function deleteAccount(payload, context) {
    const uid = requireUser(context.uid);
    if (payload?.confirm !== true) throw new PolicyError('confirm-required', 'Confirm the deletion before it runs.');
    const authTime = Number(tokenOf(context).auth_time) * 1000;
    if (Number.isFinite(authTime) && deps.timestampMs - authTime > RECENT_AUTH_WINDOW_MS) {
      throw new PolicyError('recent-login-required', 'For safety, sign in again and then delete the account within 10 minutes.');
    }
    await spendRateLimit(uid, 'deleteAccount');
    const [profile, adminFlag, admins] = await Promise.all([
      store.get(paths.profile(uid)),
      store.get(paths.admin(uid)),
      store.query('admins', { where: [['admin', '==', true]], limit: 20 }),
    ]);
    if (adminFlag.exists && adminFlag.data.admin === true && admins.length <= 1) {
      throw new PolicyError('last-admin', 'This is the only admin account. Promote another player first, then delete this one.');
    }

    const deleted = {
      profile: profile.exists,
      friendships: 0,
      requests: 0,
      invites: 0,
      rooms: 0,
      blocks: 0,
      reviews: 0,
    };

    // Rooms first: a waiting room gives the seat back, a running room keeps its seats and expires.
    const rooms = await store.query('rooms', { where: [['playerUids', 'array-contains', uid]], limit: 50 });
    for (const listed of rooms) {
      const room = { id: listed.id, ...listed.data };
      if (!room.playerUids.includes(uid)) continue;
      const secret = await loadSecret(room.id);
      if (!secret) continue;
      if (room.status === 'waiting') {
        const left = leaveRoomState({ room, secret, uid, nowMs: deps.timestampMs, engines: engineRegistry });
        if (left.deleted) await store.recursiveDelete(paths.room(room.id));
        else {
          left.room.id = room.id;
          await persistRoom(left.room, left.secret);
        }
      } else if (room.playerUids.length === 1) {
        await store.recursiveDelete(paths.room(room.id));
      }
      await store.delete(paths.presence(room.id, uid));
      await store.delete(paths.view(room.id, uid));
      deleted.rooms += 1;
    }

    const [friendships, fromRequests, toRequests, fromInvites, toInvites, outgoingBlocks, incomingBlocks, ownedReviews] = await Promise.all([
      store.query('friendships', { where: [['memberUids', 'array-contains', uid]], limit: 200 }),
      store.query('friendRequests', { where: [['fromUid', '==', uid]], limit: 200 }),
      store.query('friendRequests', { where: [['toUid', '==', uid]], limit: 200 }),
      store.query('gameInvites', { where: [['fromUid', '==', uid]], limit: 200 }),
      store.query('gameInvites', { where: [['toUid', '==', uid]], limit: 200 }),
      store.query('blocks', { where: [['blockerUid', '==', uid]], limit: 200 }),
      store.query('blocks', { where: [['blockedUid', '==', uid]], limit: 200 }),
      store.query('reviewOwners', { where: [['ownerUid', '==', uid]], limit: 1200 }),
    ]);

    const ops = [];
    for (const doc of friendships) { ops.push({ type: 'delete', path: `friendships/${doc.id}` }); deleted.friendships += 1; }
    for (const doc of [...fromRequests, ...toRequests]) {
      if (!ops.some((op) => op.path === `friendRequests/${doc.id}`)) ops.push({ type: 'delete', path: `friendRequests/${doc.id}` });
      deleted.requests += 1;
    }
    for (const doc of [...fromInvites, ...toInvites]) {
      if (!ops.some((op) => op.path === `gameInvites/${doc.id}`)) ops.push({ type: 'delete', path: `gameInvites/${doc.id}` });
      deleted.invites += 1;
    }
    for (const doc of [...outgoingBlocks, ...incomingBlocks]) { ops.push({ type: 'delete', path: `blocks/${doc.id}` }); deleted.blocks += 1; }
    for (const owned of ownedReviews) {
      ops.push({ type: 'delete', path: paths.review(owned.id) });
      ops.push({ type: 'delete', path: paths.reviewOwner(owned.id) });
      ops.push({ type: 'delete', path: paths.reviewAnnotation(owned.id) });
      deleted.reviews += 1;
    }
    if (ownedReviews.length) ops.push({ type: 'delete', path: paths.reviewAgentModel('active') });
    ops.push({ type: 'delete', path: paths.profile(uid) });
    ops.push({ type: 'delete', path: paths.rateLimit(uid) });
    if (adminFlag.exists) ops.push({ type: 'delete', path: paths.admin(uid) });
    if (profile.exists && profile.data.usernameLower) ops.push({ type: 'delete', path: paths.username(profile.data.usernameLower) });
    // `store.batch` runs in chunks: Firestore caps a batch at 500 writes.
    for (let index = 0; index < ops.length; index += 400) await store.batch(ops.slice(index, index + 400));

    if (deps.deleteAuthUser) await deps.deleteAuthUser(uid);
    return { deleted: true, ...deleted };
  }

  /** @param {string} uid @returns {Promise<'admin'|'player'>} */
  async function roleOf(uid) {
    const flag = await store.get(paths.admin(uid));
    return flag.exists && flag.data.admin === true ? 'admin' : 'player';
  }

  /**
   * @param {Record<string, any>} payload @param {any} context
   */
  async function requireAdmin(context) {
    const uid = requireUser(context.uid);
    if (await roleOf(uid) !== 'admin') throw new PolicyError('admin-only', 'This action is only available to admins.');
    return uid;
  }

  /**
   * Admin moderation of one room: kick a waiting player, or close the room for everyone.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function adminRoomAction(payload, context) {
    await requireAdmin(context);
    const roomId = text(payload, 'roomId');
    const action = text(payload, 'action');
    const targetUid = text(payload, 'uid');
    const room = await loadRoom(roomId, deps.timestampMs);
    if (action === 'close') {
      await store.recursiveDelete(paths.room(roomId));
      return { roomId, closed: true };
    }
    if (action !== 'kick') throw new PolicyError('unknown-admin-action', 'That admin action does not exist.');
    if (room.status !== 'waiting') throw new PolicyError('room-started', 'Only a waiting lobby can be changed; this match already started.');
    if (!room.playerUids.includes(targetUid)) throw new PolicyError('not-in-room', 'That player is not in this room.');
    const secret = await loadSecret(roomId);
    if (!secret) throw new PolicyError('room-not-ready', 'This room has no stored state.');
    const left = leaveRoomState({ room, secret, uid: targetUid, nowMs: deps.timestampMs, engines: engineRegistry });
    if (left.deleted) await store.recursiveDelete(paths.room(roomId));
    else {
      left.room.id = roomId;
      await persistRoom(left.room, left.secret);
      await store.delete(paths.presence(roomId, targetUid));
      await store.delete(paths.view(roomId, targetUid));
    }
    return { roomId, kicked: targetUid };
  }

  /**
   * Remove a player's account data (the admin studio's "remove player"), without touching the
   * Firebase Auth user, so a repeat offender's username becomes available again.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function adminRemovePlayer(payload, context) {
    const adminUid = await requireAdmin(context);
    const targetUid = text(payload, 'uid');
    if (!targetUid) throw new PolicyError('missing-uid', 'Choose the player to remove.');
    if (targetUid === adminUid) throw new PolicyError('self-remove', 'Use the account page to delete your own account.');
    const profile = await store.get(paths.profile(targetUid));
    const ops = [{ type: 'delete', path: paths.profile(targetUid) }];
    if (profile.exists && profile.data.usernameLower) ops.push({ type: 'delete', path: paths.username(profile.data.usernameLower) });
    await store.batch(ops);
    return { removed: targetUid, hadProfile: profile.exists };
  }

  /**
   * Every pass issued in an earlier moment is a pass into this one only while it matches what
   * the operator just saved: maintenance saves (on or off) therefore clear the bypass tokens,
   * and a tester who was previewing re-enters with the current PIN.
   * @returns {Promise<void>}
   */
  async function clearMaintenanceBypasses() {
    const tokens = await store.query('maintenance/bypasses', { limit: 1000 });
    if (tokens.length) await store.batch(tokens.map((record) => ({ type: 'delete', path: paths.maintenanceBypass(record.id) })));
  }

  /**
   * Toggle maintenance mode and edit the visitor message. Admin-only.
   *
   * A maintenance WINDOW (disabled -> enabled) always gets a FRESH 16-digit tester PIN, stored
   * in `maintenance/secrets/status` - a document no client can read. Re-saving inside the same
   * window (editing the message, or re-showing the PIN) keeps the active PIN. The public
   * `maintenance/status` document gets only the safe fields, so a signed-out visitor can read
   * "closed + message" without ever learning the PIN. The current PIN is returned to this one
   * admin caller so it can be shared out-of-band with testers; it is never logged and never
   * stored anywhere a client can reach.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function adminSetMaintenance(payload, context) {
    const adminUid = await requireAdmin(context);
    const enabled = payload?.enabled;
    if (enabled !== true && enabled !== false) {
      throw new PolicyError('invalid-maintenance', 'Maintenance mode must be turned on or off, nothing else.');
    }
    const message = safeMessage(payload?.message, MAINTENANCE_MESSAGE_MAX);
    let pin = '';
    if (enabled) {
      const secret = await store.get(paths.maintenanceSecret());
      pin = secret.exists && typeof secret.data.pin === 'string' && secret.data.pin
        ? secret.data.pin
        : randomDigits(MAINTENANCE_PIN_LENGTH);
    }
    const ops = [{
      type: 'set',
      path: paths.maintenanceStatus(),
      data: { enabled, message, updatedAtMs: deps.timestampMs, updatedBy: adminUid },
    }];
    if (enabled) {
      ops.push({ type: 'set', path: paths.maintenanceSecret(), data: { pin, updatedAtMs: deps.timestampMs } });
    } else {
      // The secret goes with the window: an old PIN must never open a later one.
      ops.push({ type: 'delete', path: paths.maintenanceSecret() });
    }
    await clearMaintenanceBypasses();
    await store.batch(ops);
    return { enabled, message, pin };
  }

  /**
   * The maintenance screen's only door: a visitor (signed in or not) submits the 16-digit
   * tester PIN. The comparison happens here, against the client-invisible secret, behind a tight
   // per-person rate limit (signed-in: per UID, anonymous: per IP), so the PIN cannot be
   * brute-forced. A correct PIN is exchanged for a short random bypass token that this same
   * backend later re-checks - the PIN itself never has to travel again.
   * @param {Record<string, any>} payload @param {any} context
   */
  async function verifyMaintenancePin(payload, context) {
    const key = context.uid ? context.uid : `ip:${text(context, 'ip') || 'anonymous'}`;
    await spendRateLimit(key, 'maintenancePin');
    const status = await store.get(paths.maintenanceStatus());
    if (!status.exists || status.data.enabled !== true) return { valid: false, reason: 'not-in-maintenance' };
    const secret = await store.get(paths.maintenanceSecret());
    const expected = secret.exists && typeof secret.data.pin === 'string' ? secret.data.pin : '';
    const pin = text(payload, 'pin');
    if (!expected || !constantTimeEquals(pin, expected)) return { valid: false, reason: 'wrong-pin' };
    const token = randomId(32);
    const expiresAtMs = deps.timestampMs + MAINTENANCE_BYPASS_TTL_MS;
    await store.set(paths.maintenanceBypass(token), { createdAtMs: deps.timestampMs, expiresAtMs });
    return { valid: true, token, expiresAtMs };
  }

  /**
   * Re-check a stored bypass token server-side before the browser trusts it on a later load.
   * The token is the credential: anyone may ask, but only a live, unexpired, still-in-maintenance
   * pass answers true. Expired passes are pruned on the way out.
   * @param {Record<string, any>} payload
   */
  async function checkMaintenanceBypass(payload) {
    const token = text(payload, 'token');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return { valid: false, reason: 'bad-token' };
    const status = await store.get(paths.maintenanceStatus());
    if (!status.exists || status.data.enabled !== true) return { valid: false, reason: 'not-in-maintenance' };
    const record = await store.get(paths.maintenanceBypass(token));
    if (!record.exists) return { valid: false, reason: 'unknown-token' };
    const expiresAtMs = Number(record.data.expiresAtMs);
    if (!Number.isFinite(expiresAtMs) || deps.timestampMs > expiresAtMs) {
      await store.delete(paths.maintenanceBypass(token));
      return { valid: false, reason: 'expired' };
    }
    return { valid: true, expiresAtMs };
  }

  return {
    claimUsername,
    lookupUser,
    sendFriendRequest,
    respondFriendRequest,
    cancelFriendRequest,
    createGameInvite,
    respondGameInvite,
    createRoom,
    joinRoom,
    leaveRoom,
    startRoom,
    claimHost,
    playMove,
    rematch,
    blockUser,
    unblockUser,
    reportProblem,
    createReview,
    adminLabelReview,
    adminTrainReviewAgent,
    deleteAccount,
    adminRoomAction,
    adminRemovePlayer,
    adminSetMaintenance,
    verifyMaintenancePin,
    checkMaintenanceBypass,
    // exported for the scheduled cleanup and the tests
    loadPresence,
    persistRoom,
    loadSecret,
    roomPayload,
    engineRegistry,
    spendRateLimit,
    roleOf,
  };
}

export { ROOM_TTL_MS, roomPlayers, DISPLAY_NAME_MAX };
