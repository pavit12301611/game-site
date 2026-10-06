import test from 'node:test';
import assert from 'node:assert/strict';

import { createFirestoreStore, paths } from '../src/store.js';

function firestoreDouble() {
  const calls = {
    documents: [],
    collections: [],
    filters: [],
    orderings: [],
    limits: [],
    transactionReads: [],
    writes: [],
    batchDeletes: [],
  };
  const db = {
    doc(path) {
      calls.documents.push(path);
      return {
        path,
        async get() {
          return { exists: false, id: path.split('/').at(-1), data: () => undefined };
        },
        async set(data) {
          calls.writes.push([path, data]);
        },
      };
    },
    collection(path) {
      calls.collections.push(path);
      const query = {
        where(...args) {
          calls.filters.push(args);
          return query;
        },
        orderBy(...args) {
          calls.orderings.push(args);
          return query;
        },
        limit(count) {
          calls.limits.push(count);
          return query;
        },
        async get() {
          return { docs: [] };
        },
      };
      return query;
    },
    async runTransaction(work) {
      return work({
        async get(reference) {
          calls.transactionReads.push(reference.path);
          return reference.get();
        },
      });
    },
    batch() {
      return {
        delete(reference) {
          calls.batchDeletes.push(reference.path);
        },
        async commit() {},
      };
    },
  };
  return { db, calls };
}

test('Firestore store accepts valid document and collection paths across room and chat operations', async () => {
  const { db, calls } = firestoreDouble();
  const store = createFirestoreStore(db);
  const chatMessagePath = paths.chatMessage('room-1', 'message-1');

  await store.get(paths.room('room-1'));
  await store.get(paths.secret('room-1'));
  await store.transaction((tx) => tx.get(paths.rateLimit('player-1')));
  await store.set(chatMessagePath, { text: 'hello' });
  await store.batch([{ type: 'delete', path: chatMessagePath }]);
  await store.query('rooms', { limit: 3 });
  await store.query('rooms/room-1/presence', { limit: 5 });
  await store.query(paths.chatCollection('room-1'), {
    where: [['uid', '==', 'player-1']],
    orderBy: ['createdAtMs', 'asc'],
    limit: 100,
  });

  assert.deepEqual(calls.documents, [
    'rooms/room-1',
    'rooms/room-1/secrets/engine',
    'rateLimits/player-1',
    chatMessagePath,
    chatMessagePath,
  ]);
  assert.deepEqual(calls.transactionReads, ['rateLimits/player-1']);
  assert.deepEqual(calls.writes.map(([path]) => path), [chatMessagePath]);
  assert.deepEqual(calls.batchDeletes, [chatMessagePath]);
  assert.deepEqual(calls.collections, ['rooms', 'rooms/room-1/presence', 'rooms/room-1/chat']);
  assert.deepEqual(calls.filters, [['uid', '==', 'player-1']]);
  assert.deepEqual(calls.orderings, [['createdAtMs', 'asc']]);
  assert.deepEqual(calls.limits, [3, 5, 100]);
});

test('Firestore store rejects collection paths as documents and document paths as collections', async () => {
  const { db, calls } = firestoreDouble();
  const store = createFirestoreStore(db);

  await assert.rejects(store.get('rooms'), /not a document path/);
  await assert.rejects(store.query(paths.room('room-1'), { limit: 1 }), /not a collection path/);
  assert.deepEqual(calls.documents, []);
  assert.deepEqual(calls.collections, []);
});
