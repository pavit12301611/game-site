/**
 * The real Firestore store adapter: its path guards must match Firestore's own model, or every
 * handler crashes the moment it talks to a real database instead of the in-memory fake.
 *
 * Firestore paths alternate collection/document: document references have an EVEN number of
 * segments ('profiles/uid', 'rooms/r1/secrets/engine') and collection paths an ODD one
 * ('admins', 'maintenance/status/bypasses'). These tests pin that down with a stub db so a
 * flipped guard fails loudly here, not in production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFirestoreStore, paths } from '../src/store.js';

/** A stub Firestore that records every reference it is asked for instead of hitting the network. */
function stubDb() {
  const docs = [];
  const collections = [];
  const docRef = () => ({
    async get() { return { exists: false, id: '', data: () => ({}) }; },
    set() { return Promise.resolve(); },
    update() { return Promise.resolve(); },
    delete() { return Promise.resolve(); },
  });
  const collectionRef = {
    where() { return collectionRef; },
    orderBy() { return collectionRef; },
    limit() { return collectionRef; },
    async get() { return { docs: [] }; },
  };
  return {
    docs,
    collections,
    db: {
      doc: (path) => { docs.push(path); return docRef(); },
      collection: (path) => { collections.push(path); return collectionRef; },
      batch: () => ({ set() {}, update() {}, delete() {}, commit: () => Promise.resolve() }),
    },
  };
}

test('document paths must have an even number of segments, collection paths an odd one', async () => {
  const { db, docs, collections } = stubDb();
  const store = createFirestoreStore(db);
  await store.get('profiles/uid1');
  await store.set('rooms/r1/secrets/engine', {});
  await store.query('admins');
  await store.query('maintenance/status/bypasses');
  assert.deepEqual(docs, ['profiles/uid1', 'rooms/r1/secrets/engine']);
  assert.deepEqual(collections, ['admins', 'maintenance/status/bypasses']);
  await assert.rejects(() => store.get('admins'), /not a document path/, 'a bare collection is not a document');
  await assert.rejects(() => store.query('profiles/uid1'), /not a collection path/, 'a document path is not a collection');
});

test('every maintenance path the handlers use is a legal Firestore reference', async () => {
  const { db, docs, collections } = stubDb();
  const store = createFirestoreStore(db);
  await store.get(paths.maintenanceStatus());
  await store.get(paths.maintenanceSecret());
  await store.set(paths.maintenanceBypass('tok123'), {});
  await store.query('maintenance/status/bypasses');
  assert.deepEqual(docs, [
    'maintenance/status',
    'maintenance/status/secrets/pin',
    'maintenance/status/bypasses/tok123',
  ], 'status, the PIN secret and a bypass token are all resolvable document references');
  assert.deepEqual(collections, ['maintenance/status/bypasses'], 'and the pass list is a legal collection path');
});
