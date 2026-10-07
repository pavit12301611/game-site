/**
 * The narrow data-access layer the backend handlers use.
 *
 * Handlers never touch the Firebase Admin SDK directly: they call `get`, `set`, `update`, `delete`,
 * `query`, `transaction` and `recursiveDelete` on this store. Two things follow from that:
 *
 *   - the security logic can be tested without an emulator or a Java runtime (functions/test ships
 *     an in-memory store with exactly these methods), and
 *   - every Firestore write the backend makes goes through one place that always sets the server
 *     timestamp and never sends a client-supplied time.
 *
 * Paths are plain strings: 'rooms/abc', 'rooms/abc/secrets/engine', 'rateLimits/uid'.
 */

/**
 * @typedef {{ exists: boolean, id: string, data: Record<string, any> }} StoredDocument
 * @typedef {{
 *   get: (path: string) => Promise<StoredDocument>,
 *   set: (path: string, data: Record<string, any>) => Promise<void>,
 *   update: (path: string, data: Record<string, any>) => Promise<void>,
 *   delete: (path: string) => Promise<void>,
 *   query: (collectionPath: string, options: { where?: Array<[string, string, any]>, limit?: number, orderBy?: [string, 'asc'|'desc'] }) => Promise<StoredDocument[]>,
 *   transaction: <T>(work: (tx: StoreTransaction) => Promise<T>) => Promise<T>,
 *   batch: (ops: Array<{ type: 'set'|'update'|'delete', path: string, data?: Record<string, any> }>) => Promise<void>,
 *   recursiveDelete: (path: string) => Promise<void>,
 *   now: () => number,
 * }} Store
 *
 * @typedef {{
 *   get: (path: string) => Promise<StoredDocument>,
 *   set: (path: string, data: Record<string, any>) => void,
 *   update: (path: string, data: Record<string, any>) => void,
 *   delete: (path: string) => void,
 * }} StoreTransaction
 */

/**
 * Builds a store from a Firestore instance (`firebase-admin/firestore`).
 *
 * `toTimestamp` converts milliseconds into whatever Firestore accepts as a timestamp. Production
 * passes `Timestamp.fromMillis`; room documents then carry a native `expiresAtDate` twin next to the
 * numeric `expiresAt` so the operator can switch on a Firestore TTL policy. Tests omit it and see
 * only the numeric field. Keeping the conversion out of this module means the handler logic can be
 * unit tested without the Admin SDK installed at all.
 *
 * @param {any} db
 * @param {{ now?: () => number, toTimestamp?: (ms: number) => any }} [options]
 * @returns {Store}
 */
export function createFirestoreStore(db, { now = () => Date.now(), toTimestamp } = {}) {
  /** Room documents get a Firestore-timestamp twin of `expiresAt` when the caller can make one. */
  const withExpiryDate = (data) => {
    const expiresAt = Number(data?.expiresAt);
    if (!Number.isFinite(expiresAt) || typeof toTimestamp !== 'function') return data;
    return { ...data, expiresAtDate: toTimestamp(expiresAt) };
  };
  const documentPath = (path) => path.split('/');
  // Firestore paths start with a collection: documents have an even number of segments, while
  // collections (including nested ones such as rooms/{id}/chat) have an odd number.
  const refOf = (path) => {
    const parts = documentPath(path);
    if (parts.length % 2 !== 0) throw new Error(`"${path}" is not a document path (it has ${parts.length} segments)`);
    return db.doc(path);
  };
  const collectionOf = (path) => {
    const parts = documentPath(path);
    if (parts.length % 2 === 0) throw new Error(`"${path}" is not a collection path (it has ${parts.length} segments)`);
    return db.collection(path);
  };
  const read = async (snapshot) => ({
    exists: Boolean(snapshot?.exists),
    id: snapshot?.id ?? '',
    data: snapshot?.exists ? (snapshot.data() ?? {}) : {},
  });

  /** @type {any} */
  const store = {
    now,
    async get(path) {
      return read(await refOf(path).get());
    },
    async set(path, data) {
      await refOf(path).set(withExpiryDate({ ...data, updatedAtMs: now() }));
    },
    async update(path, data) {
      await refOf(path).update(withExpiryDate({ ...data, updatedAtMs: now() }));
    },
    async delete(path) {
      await refOf(path).delete();
    },
    async query(collectionPath, { where = [], limit = 50, orderBy } = {}) {
      let query = collectionOf(collectionPath);
      for (const [field, op, value] of where) query = query.where(field, op, value);
      if (orderBy) query = query.orderBy(orderBy[0], orderBy[1]);
      const snapshot = await query.limit(limit).get();
      return snapshot.docs.map((doc) => ({ exists: true, id: doc.id, data: doc.data() ?? {} }));
    },
    async transaction(work) {
      return db.runTransaction(async (tx) => work({
        get: async (path) => read(await tx.get(refOf(path))),
        set: (path, data) => tx.set(refOf(path), withExpiryDate({ ...data, updatedAtMs: now() })),
        update: (path, data) => tx.update(refOf(path), withExpiryDate({ ...data, updatedAtMs: now() })),
        delete: (path) => tx.delete(refOf(path)),
      }));
    },
    async batch(ops) {
      const batch = db.batch();
      for (const op of ops) {
        if (op.type === 'delete') batch.delete(refOf(op.path));
        else if (op.type === 'update') batch.update(refOf(op.path), withExpiryDate({ ...op.data, updatedAtMs: now() }));
        else batch.set(refOf(op.path), withExpiryDate({ ...op.data, updatedAtMs: now() }));
      }
      await batch.commit();
    },
    async recursiveDelete(path) {
      await db.recursiveDelete(refOf(path));
    },
  };
  return store;
}

/**
 * Path helpers, so a typo cannot quietly address the wrong collection.
 * @param {string} roomId
 */
export const paths = Object.freeze({
  profile: (uid) => `profiles/${uid}`,
  username: (usernameLower) => `usernames/${usernameLower}`,
  admin: (uid) => `admins/${uid}`,
  room: (roomId) => `rooms/${roomId}`,
  secret: (roomId) => `rooms/${roomId}/secrets/engine`,
  view: (roomId, uid) => `rooms/${roomId}/views/${uid}`,
  presence: (roomId, uid) => `rooms/${roomId}/presence/${uid}`,
  chatMessage: (roomId, messageId) => `rooms/${roomId}/chat/${messageId}`,
  chatCollection: (roomId) => `rooms/${roomId}/chat`,
  friendRequest: (requestId) => `friendRequests/${requestId}`,
  friendship: (a, b) => `friendships/${[a, b].sort().join('_')}`,
  gameInvite: (inviteId) => `gameInvites/${inviteId}`,
  rateLimit: (uid) => `rateLimits/${uid}`,
  block: (blockerUid, blockedUid) => `blocks/${blockerUid}_${blockedUid}`,
  report: (reportId) => `reports/${reportId}`,
  review: (reviewId) => `reviews/${reviewId}`,
  reviewOwner: (reviewId) => `reviewOwners/${reviewId}`,
  reviewAnnotation: (reviewId) => `reviewAnnotations/${reviewId}`,
  reviewAgentModel: (modelId = 'active') => `reviewAgentModels/${modelId}`,
});

/** @param {Record<string, any>} payload @param {string} key @returns {string} */
export function text(payload, key) {
  const value = payload?.[key];
  return typeof value === 'string' ? value.trim() : '';
}
