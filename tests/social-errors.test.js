import test from 'node:test';
import assert from 'node:assert/strict';
import { FirestoreError } from 'firebase/firestore';
import { describeFirebaseError } from '../src/firebase-errors.js';
import { unavailableSocialDocument } from '../src/social-errors.js';

test('missing and permission-denied social documents use the same friendly expired-link copy', () => {
  for (const error of [
    new FirestoreError('not-found', 'Document does not exist.'),
    new FirestoreError('permission-denied', 'Missing or insufficient permissions.'),
    { code: 'firestore/not-found', message: 'Document does not exist.' },
  ]) {
    const friendly = unavailableSocialDocument(error, 'This game invite is no longer valid.');
    assert.equal(describeFirebaseError(friendly), 'This game invite is no longer valid.');
  }
});

test('unrelated social errors keep their original troubleshooting message', () => {
  const error = new FirestoreError('unavailable', 'Connection unavailable.');
  assert.equal(unavailableSocialDocument(error, 'This game invite is no longer valid.'), error);
});
