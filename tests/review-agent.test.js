import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REVIEW_AGENT_VERSION,
  ON_DEVICE_REVIEW_MODEL_ID,
  ON_DEVICE_REVIEW_MODEL_REVISION,
  analyzeReview,
  buildImprovementIdeas,
  createAssistantReply,
  extractReviewTopics,
  reviewFeaturedScore,
  summarizeReviewSentiment,
  trainDistilledReviewModel,
} from '../shared/reviews/agent.js';

test('the no-network review agent classifies sentiment and respects obvious rating contradictions', () => {
  assert.equal(analyzeReview({ text: 'Great, fun and smooth to play', rating: 5 }).sentiment, 'positive');
  assert.equal(analyzeReview({ text: 'Broken, laggy and frustrating', rating: 1 }).sentiment, 'negative');
  assert.equal(analyzeReview({ text: 'Great game, but it is laggy', rating: 3 }).sentiment, 'mixed');
  assert.equal(analyzeReview({ text: 'Not fun and not smooth', rating: 2 }).sentiment, 'negative');
  assert.equal(analyzeReview({ text: 'A small thought about this game', rating: 3 }).sentiment, 'neutral');
  const seeded = analyzeReview({ text: 'I got hooked immediately and wanted another round', rating: 3 });
  assert.equal(seeded.sentiment, 'positive');
  assert.equal(seeded.source, 'curated-starter-model', 'the built-in seed model helps when the lexicon has no opinion');
  assert.equal(analyzeReview({ text: 'The game is fun, but rounds feel repetitive after a while', rating: 3 }).sentiment, 'mixed');
  assert.equal(analyzeReview({ text: 'I could not join my friend, but the game was fun', rating: 3 }).sentiment, 'mixed');
  assert.equal(analyzeReview({ text: 'Not only fun but wonderfully polished', rating: 3 }).sentiment, 'positive');
  assert.equal(REVIEW_AGENT_VERSION, 'local-review-agent-v3');
});

test('a version-pinned, confident on-device DistilBERT prediction drives review sentiment', () => {
  const prediction = { modelId: ON_DEVICE_REVIEW_MODEL_ID, revision: ON_DEVICE_REVIEW_MODEL_REVISION, sentiment: 'positive', confidence: 0.94 };
  const positive = analyzeReview({ text: 'A thoughtful note without obvious sentiment words', rating: 5, pretrainedPrediction: prediction });
  assert.equal(positive.sentiment, 'positive');
  assert.equal(positive.source, 'on-device-distilbert');

  const ratingConflict = analyzeReview({ text: 'A thoughtful note without obvious sentiment words', rating: 1, pretrainedPrediction: prediction });
  assert.equal(ratingConflict.sentiment, 'mixed', 'star/text disagreement remains visible');

  const mixed = analyzeReview({
    text: 'The game is great, but the room is broken and frustrating.',
    rating: 3,
    pretrainedPrediction: prediction,
  });
  assert.equal(mixed.sentiment, 'mixed', 'clear two-sided lexicon evidence is not flattened to binary');
  assert.equal(mixed.source, 'on-device-distilbert+lexicon');

  const lowConfidence = analyzeReview({
    text: 'Polished and delightful to play',
    rating: 5,
    pretrainedPrediction: { ...prediction, confidence: 0.58, sentiment: 'neutral' },
  });
  assert.notEqual(lowConfidence.source, 'on-device-distilbert', 'uncertain output falls back locally');
  const spoofed = analyzeReview({
    text: 'Broken laggy and frustrating',
    rating: 1,
    pretrainedPrediction: { ...prediction, modelId: 'unrecognized-model', sentiment: 'positive' },
  });
  assert.notEqual(spoofed.source, 'on-device-distilbert', 'unknown model ids are ignored');
});

test('every sentiment gets a contextual, respectful automatic reply', () => {
  const negative = createAssistantReply({ sentiment: 'negative', reviewerName: 'Pixel Pilot', gameTitle: 'Maze Runner', topics: ['mobile'] });
  const mixed = createAssistantReply({ sentiment: 'mixed', reviewerName: 'Player', topics: ['connection'] });
  const positive = createAssistantReply({ sentiment: 'positive', reviewerName: 'Arcade fan', gameTitle: 'the arcade' });
  const neutral = createAssistantReply({ sentiment: 'neutral', reviewerName: 'Guest' });
  assert.match(negative, /Pixel Pilot/);
  assert.match(negative, /Maze Runner/);
  assert.match(negative, /mobile controls/);
  assert.match(mixed, /connection & syncing/);
  assert.match(positive, /kind words/);
  assert.match(neutral, /Thanks for taking a moment/);
});

test('improvement ideas count recurring negative and mixed topics instead of inventing evidence', () => {
  assert.deepEqual(extractReviewTopics('The room link is confusing and mobile taps lag'), ['connection', 'mobile', 'instructions', 'multiplayer']);
  const ideas = buildImprovementIdeas([
    { sentiment: 'negative', message: 'Room invites are broken', topics: ['multiplayer'] },
    { sentiment: 'mixed', message: 'The room link needs work', topics: ['multiplayer'] },
    { sentiment: 'positive', message: 'Loved it', topics: ['variety'] },
  ]);
  assert.equal(ideas[0].id, 'multiplayer');
  assert.equal(ideas[0].evidence, 2);
  assert.match(ideas[0].note, /2 negative or mixed reviews/);
  assert.equal(buildImprovementIdeas([])[0].evidence, 0);
});

test('the featured score makes stars primary and detail a tie-breaker', () => {
  const detailedFourStar = reviewFeaturedScore({ rating: 4, title: 'A very detailed note', message: 'Specific useful details '.repeat(30), gameId: 'pixel-tac-toe', topics: ['mobile', 'stability'] });
  const shortFiveStar = reviewFeaturedScore({ rating: 5, message: 'Fun!', gameId: 'arcade' });
  assert.ok(shortFiveStar > detailedFourStar);
});

test('real admin-labelled review text distills to compact weights, with a safe fallback until ready', () => {
  const insufficient = trainDistilledReviewModel([{ text: 'Great game', label: 'positive' }]);
  assert.equal(insufficient.ok, false);
  const trained = trainDistilledReviewModel([
    { title: 'Loved it', text: 'Fun smooth polished and awesome', label: 'positive' },
    { title: 'Great round', text: 'Excellent responsive games are so enjoyable', label: 'positive' },
    { title: 'Broken room', text: 'Laggy slow and frustrating with errors', label: 'negative' },
    { title: 'Bad controls', text: 'Clunky confusing and crashes often', label: 'negative' },
  ]);
  assert.equal(trained.ok, true);
  assert.equal(trained.trainingSize, 4);
  assert.ok(trained.vocabularySize > 0);
  assert.equal(JSON.stringify(trained.model).includes('Fun smooth polished and awesome'), false, 'raw examples are not copied into the distilled model');
  const positive = analyzeReview({ text: 'Polished smooth enjoyable game', rating: 5, model: trained.model });
  assert.equal(positive.sentiment, 'positive');
  assert.equal(positive.source, 'distilled-model');
  assert.equal(summarizeReviewSentiment([{ sentiment: 'positive' }, { sentiment: 'negative' }, {}]).total, 3);
});
