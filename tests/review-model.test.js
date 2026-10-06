import test from 'node:test';
import assert from 'node:assert/strict';

import { ON_DEVICE_REVIEW_MODEL_ID, ON_DEVICE_REVIEW_MODEL_REVISION } from '../shared/reviews/agent.js';
import { interpretReviewModelOutput } from '../src/review-model-output.js';

test('the browser-model adapter maps a confident positive result to the pinned classifier envelope', () => {
  assert.deepEqual(interpretReviewModelOutput([
    { label: 'NEGATIVE', score: 0.04 },
    { label: 'POSITIVE', score: 0.96 },
  ]), {
    modelId: ON_DEVICE_REVIEW_MODEL_ID,
    revision: ON_DEVICE_REVIEW_MODEL_REVISION,
    sentiment: 'positive',
    confidence: 0.96,
  });
});

test('the browser-model adapter accepts a nested pipeline result and abstains on low confidence', () => {
  const result = interpretReviewModelOutput([[
    { label: 'NEGATIVE', score: 0.51 },
    { label: 'POSITIVE', score: 0.49 },
  ]]);
  assert.equal(result.sentiment, 'neutral');
  assert.equal(result.confidence, 0.51);
});

test('unexpected outputs fail closed so the review can use its local fallback', () => {
  assert.throws(() => interpretReviewModelOutput(null), /no class scores/);
  assert.throws(() => interpretReviewModelOutput([{ label: 'LABEL_1', score: 0.9 }]), /unexpected class labels/);
});
