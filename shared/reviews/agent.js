/**
 * The review assistant shared by the browser and Cloud Functions.
 *
 * Sentiment inference normally comes from the pretrained DistilBERT model running in the player's
 * browser. This module validates that model's small prediction envelope and combines it with an
 * inspectable lexicon, the star rating, and (when sufficiently confident) a first-party model trained
 * from human-labelled reviews. It has no model-provider inference call of its own.
 * Admins can correct real review labels and distill them into multinomial Naive Bayes weights; only
 * those weights are stored, never source review text.
 */

/** @typedef {'positive' | 'negative' | 'mixed' | 'neutral'} ReviewSentiment */
/** @type {ReadonlyArray<ReviewSentiment>} */
export const REVIEW_SENTIMENTS = Object.freeze(['positive', 'negative', 'mixed', 'neutral']);
export const REVIEW_AGENT_VERSION = 'local-review-agent-v3';
export const ON_DEVICE_REVIEW_MODEL_ID = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
export const ON_DEVICE_REVIEW_MODEL_REVISION = '0b6928efcb76139cae2c6881d49cda67fe119f42';
export const REVIEW_MESSAGE_MAX = 800;
export const REVIEW_TITLE_MAX = 80;
export const REVIEW_NAME_MAX = 24;

/** @param {unknown} value @returns {value is ReviewSentiment} */
function isReviewSentiment(value) {
  return value === 'positive' || value === 'negative' || value === 'mixed' || value === 'neutral';
}

const POSITIVE_WORDS = new Set([
  'addictive', 'amazing', 'awesome', 'beautiful', 'best', 'brilliant', 'charming', 'clear', 'creative',
  'delightful', 'easy', 'enjoy', 'enjoyable', 'engaging', 'excellent', 'exciting', 'fantastic', 'favorite',
  'fun', 'funny', 'good', 'great', 'helpful', 'impressive', 'intuitive', 'love', 'loved', 'lovely', 'nice',
  'perfect', 'polished', 'quick', 'recommend', 'relaxing', 'reliable', 'responsive', 'rewarding', 'satisfying',
  'seamless', 'smooth', 'snappy', 'solid', 'wonderful', 'works', 'well',
]);

const NEGATIVE_WORDS = new Set([
  'annoying', 'awkward', 'awful', 'bad', 'boring', 'broken', 'bug', 'bugs', 'cannot', 'clunky', 'confusing',
  'cramped', 'crash', 'crashes', 'crashed', 'difficult', 'disappointing', 'dislike', 'error', 'errors', 'fail',
  'failed', 'failing', 'fails', 'flaky', 'frustrating', 'freeze', 'freezing', 'frozen', 'glitch', 'glitches',
  'hard', 'hate', 'hated', 'inaccessible', 'issue', 'issues', 'lag', 'laggy', 'lacks', 'limited', 'lost',
  'missing', 'noisy', 'problem', 'problems', 'poor', 'repetitive', 'rough', 'slow', 'stale', 'stuck',
  'tedious', 'terrible', 'unfair', 'unplayable', 'unreliable', 'unresponsive', 'unusable', 'waste', 'wasted',
  'worse', 'worst',
]);

const NEGATIONS = new Set([
  'cannot', "can't", 'cant', 'couldnt', "couldn't", 'dont', "don't", 'doesnt', "doesn't", 'hardly',
  'isnt', "isn't", 'never', 'no', 'not', 'wasnt', "wasn't", 'without', 'wont', "won't", 'wouldnt', "wouldn't",
]);
const INTENSIFIERS = new Set(['extremely', 'incredibly', 'really', 'so', 'super', 'too', 'very']);
const PHRASE_CUES = Object.freeze([
  { pattern: /\b(?:can't|cannot|couldn't|could not|unable to|won't|will not|wouldn't|would not)\s+(?:join|connect|reconnect|load|start|play|save)\b/i, sentiment: 'negative', weight: 1.2 },
  { pattern: /\b(?:lost|losing)\s+(?:my\s+)?(?:progress|save|score)\b/i, sentiment: 'negative', weight: 1.2 },
  { pattern: /\b(?:keeps?|kept|starts?)\s+(?:crashing|freezing|failing)\b/i, sentiment: 'negative', weight: 1 },
  { pattern: /\b(?:would|will)\s+play\s+again\b/i, sentiment: 'positive', weight: 1 },
  { pattern: /\bkeep(?:s)?\s+coming\s+back\b/i, sentiment: 'positive', weight: 1 },
  { pattern: /\bcan't\s+stop\s+playing\b/i, sentiment: 'positive', weight: 1 },
]);
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'all', 'also', 'and', 'are', 'because', 'been', 'but', 'can', 'did',
  'does', 'for', 'from', 'had', 'has', 'have', 'how', 'into', 'its', 'just', 'like', 'more', 'most',
  'not', 'our', 'out', 'over', 'play', 'played', 'playing', 'really', 'some', 'than', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'too', 'very', 'was',
  'were', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'you', 'your',
]);

const TOPICS = Object.freeze([
  { id: 'connection', label: 'connection & syncing', words: ['connect', 'connected', 'connecting', 'connection', 'disconnect', 'disconnected', 'lag', 'laggy', 'load', 'loading', 'network', 'online', 'reconnect', 'reconnecting', 'slow', 'sync', 'syncing'] },
  { id: 'stability', label: 'stability & bugs', words: ['bug', 'bugs', 'crash', 'crashed', 'crashes', 'error', 'errors', 'fail', 'failed', 'failing', 'freeze', 'freezing', 'frozen', 'glitch', 'issue', 'problem', 'stuck'] },
  { id: 'mobile', label: 'mobile controls', words: ['mobile', 'phone', 'responsive', 'screen', 'small', 'tap', 'touch'] },
  { id: 'instructions', label: 'rules & instructions', words: ['confusing', 'instructions', 'learn', 'rules', 'tutorial', 'unclear', 'understand'] },
  { id: 'multiplayer', label: 'rooms & invites', words: ['friend', 'friends', 'invite', 'invites', 'join', 'link', 'lobby', 'match', 'room', 'rooms'] },
  { id: 'variety', label: 'game variety', words: ['catalog', 'games', 'more', 'new', 'options', 'variety'] },
  { id: 'difficulty', label: 'game difficulty', words: ['challenging', 'difficulty', 'difficult', 'easy', 'hard', 'unfair'] },
  { id: 'accessibility', label: 'accessibility', words: ['accessibility', 'accessible', 'contrast', 'keyboard', 'reader', 'screenreader'] },
  { id: 'audio', label: 'sound & music', words: ['audio', 'music', 'sound', 'volume'] },
]);

const TOPIC_ID_TO_LABEL = new Map(TOPICS.map((topic) => [topic.id, topic.label]));
const IMPROVEMENT_IDEAS = Object.freeze({
  connection: {
    title: 'Make room syncing feel more reliable',
    action: 'Audit reconnect, loading and retry states in online rooms; make it obvious when a move is still syncing.',
  },
  stability: {
    title: 'Triage the reported bugs before adding more features',
    action: 'Group crash, freeze and error reports by game, reproduce the most-mentioned case, then add a regression test for its fix.',
  },
  mobile: {
    title: 'Tune the arcade for touch screens',
    action: 'Check board sizing and tap targets on narrow phones, and make sure no game needs a keyboard-only action.',
  },
  instructions: {
    title: 'Make the rules easier to learn in the moment',
    action: 'Tighten the first-play instructions and add one short example where players are getting stuck.',
  },
  multiplayer: {
    title: 'Smooth out the invite-to-match path',
    action: 'Walk through creating a room, sharing a link or code, joining and rematching; clarify the step with the most friction.',
  },
  variety: {
    title: 'Use player requests to guide the next game batch',
    action: 'Collect named game ideas and look for repeated genres before choosing what to build next.',
  },
  difficulty: {
    title: 'Review the difficulty curve',
    action: 'Compare the games players call too easy, too hard or unfair, then tune the steepest outlier first.',
  },
  accessibility: {
    title: 'Recheck keyboard and readable-colour support',
    action: 'Test focus visibility, contrast and screen-reader names on the most-used screens and boards.',
  },
  audio: {
    title: 'Give players clearer control over sound',
    action: 'Check that sound stays optional, the mute setting is easy to find, and effects do not mask game feedback.',
  },
  general: {
    title: 'Ask for one concrete example',
    action: 'Invite a short reproduction step or a game name in the next feedback prompt before committing to a larger redesign.',
  },
});

/** Convert review text into stable, lowercase tokens (no browser or Node APIs required). */
export function reviewTokens(text = '') {
  return String(text ?? '').toLowerCase().match(/[a-z0-9']+/g) || [];
}

/** A stable topic list shared by review replies, the featured card and admin insights. */
export function extractReviewTopics(text = '') {
  const words = new Set(reviewTokens(text).map((word) => word.replace(/^'+|'+$/g, '')));
  return TOPICS.filter((topic) => topic.words.some((word) => words.has(word))).map((topic) => topic.id);
}

function lexiconScores(text) {
  const source = String(text ?? '').toLowerCase().replace(/[’‘]/g, "'");
  let positive = 0;
  let negative = 0;
  for (const sentence of source.split(/[\n.!?;]+/)) {
    const tokens = reviewTokens(sentence).map((word) => word.replace(/^'+|'+$/g, ''));
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      let score = POSITIVE_WORDS.has(token) ? 1 : NEGATIVE_WORDS.has(token) ? -1 : 0;
      if (!score) continue;
      const before = tokens.slice(Math.max(0, index - 3), index);
      const contrast = Math.max(before.lastIndexOf('but'), before.lastIndexOf('however'), before.lastIndexOf('although'), before.lastIndexOf('yet'), before.lastIndexOf('though'));
      const scope = before.slice(contrast + 1);
      const notOnly = scope.some((word, position) => word === 'not' && scope[position + 1] === 'only');
      if (!notOnly && scope.some((word) => NEGATIONS.has(word))) score *= -1;
      if (scope.some((word) => INTENSIFIERS.has(word))) score *= 1.5;
      if (score > 0) positive += score;
      else negative += Math.abs(score);
    }
  }
  for (const cue of PHRASE_CUES) {
    if (!cue.pattern.test(source)) continue;
    if (cue.sentiment === 'positive') positive += cue.weight;
    else negative += cue.weight;
  }
  return { positive, negative };
}

function classifyWithLexicon(text, rating) {
  const { positive, negative } = lexiconScores(text);
  let sentiment = 'neutral';
  if (positive >= 0.8 && negative >= 0.8) sentiment = 'mixed';
  else if (positive > negative) sentiment = 'positive';
  else if (negative > positive) sentiment = 'negative';

  // A star rating is useful signal when the written comment is short, but an obvious contradiction
  // between the words and the stars is marked mixed rather than silently overwritten.
  const stars = Number(rating);
  if (sentiment === 'neutral') {
    if (stars >= 4) sentiment = 'positive';
    else if (stars > 0 && stars <= 2) sentiment = 'negative';
  } else if ((sentiment === 'negative' && stars >= 4) || (sentiment === 'positive' && stars > 0 && stars <= 2)) {
    sentiment = 'mixed';
  }

  const evidence = positive + negative;
  const margin = Math.abs(positive - negative);
  const confidence = evidence ? Math.min(0.94, 0.48 + (margin / evidence) * 0.38 + Math.min(evidence, 3) * 0.025) : 0.42;
  return { sentiment, confidence: Number(confidence.toFixed(2)), source: 'local-lexicon' };
}

function classifyWithModel(text, model) {
  const classes = Array.isArray(model?.classes)
    ? model.classes.filter((label) => REVIEW_SENTIMENTS.includes(label))
    : [];
  if (classes.length < 2 || !model?.weights || typeof model.weights !== 'object') return null;
  const tokens = reviewTokens(text).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  if (!tokens.length) return null;
  const scores = {};
  for (const label of classes) {
    const weights = model.weights[label] || {};
    scores[label] = Number(model.logPriors?.[label]) || 0;
    for (const token of tokens) scores[label] += Number(weights[token]) || 0;
  }
  const max = Math.max(...Object.values(scores));
  const exponentials = Object.fromEntries(classes.map((label) => [label, Math.exp(Math.max(-40, scores[label] - max))]));
  const total = Object.values(exponentials).reduce((sum, value) => sum + value, 0) || 1;
  const best = classes.reduce((winner, label) => exponentials[label] > exponentials[winner] ? label : winner, classes[0]);
  const source = model.source === 'curated-synthetic-starter' ? 'curated-starter-model' : 'distilled-model';
  return { sentiment: best, confidence: exponentials[best] / total, source };
}

function validatePretrainedPrediction(prediction) {
  if (!prediction || typeof prediction !== 'object'
    || prediction.modelId !== ON_DEVICE_REVIEW_MODEL_ID
    || prediction.revision !== ON_DEVICE_REVIEW_MODEL_REVISION
    || !['positive', 'negative', 'neutral'].includes(prediction.sentiment)) return null;
  const confidence = Number(prediction.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return { sentiment: prediction.sentiment, confidence, source: 'on-device-distilbert' };
}

/**
 * Score one actual review. The pretrained DistilBERT classifier runs in the browser before submit;
 * a confident human-distilled first-party model can specialize it, while the lexicon and curated
 * starter remain available when the download is unavailable or the model is unsure.
 * @param {{ text?: string, title?: string, rating?: number, model?: Record<string, any> | null, pretrainedPrediction?: Record<string, any> | null }} input
 */
export function analyzeReview({ text = '', title = '', rating = 0, model = null, pretrainedPrediction = null } = {}) {
  const content = `${String(title || '')} ${String(text || '')}`.trim();
  const lexicon = classifyWithLexicon(content, rating);
  const activeModel = model || BUILT_IN_STARTER_MODEL;
  const learned = classifyWithModel(content, activeModel);
  const pretrained = validatePretrainedPrediction(pretrainedPrediction);
  const fallback = model
    ? (learned && learned.confidence >= 0.48 ? learned : lexicon)
    : (lexicon.sentiment === 'neutral' && learned && learned.confidence >= 0.6 ? learned : lexicon);
  // A confident admin-trained model can specialize the general pretrained model; otherwise the
  // pretrained transformer is the day-one primary classifier. Uncertain outputs fall back locally.
  let selected = learned && model && learned.confidence >= 0.78
    ? learned
    : pretrained && pretrained.confidence >= 0.65
      ? pretrained
      : fallback;

  // A binary model can miss genuinely mixed copy. Preserve clear two-sided evidence from the
  // transparent lexicon rather than forcing such feedback into positive or negative.
  if (selected.source === 'on-device-distilbert') {
    const textOnly = classifyWithLexicon(content, 3);
    const opposingText = (selected.sentiment === 'positive' && textOnly.sentiment === 'negative')
      || (selected.sentiment === 'negative' && textOnly.sentiment === 'positive');
    if ((textOnly.sentiment === 'mixed' && textOnly.confidence >= 0.58)
      || (opposingText && textOnly.confidence >= 0.7)) {
      selected = { ...selected, sentiment: 'mixed', source: 'on-device-distilbert+lexicon' };
    }
  }

  const stars = Number(rating);
  if ((selected.sentiment === 'negative' && stars >= 4) || (selected.sentiment === 'positive' && stars > 0 && stars <= 2)) {
    selected = { ...selected, sentiment: 'mixed' };
  } else if (selected.sentiment === 'neutral') {
    if (stars >= 4) selected = { ...selected, sentiment: 'positive' };
    else if (stars > 0 && stars <= 2) selected = { ...selected, sentiment: 'negative' };
  }
  return {
    sentiment: selected.sentiment,
    confidence: Number(Math.max(0.35, Math.min(0.99, selected.confidence)).toFixed(2)),
    source: selected.source,
    topics: extractReviewTopics(content),
  };
}

/**
 * One automatic, human-readable reply for every accepted review.
 * @param {{ sentiment?: ReviewSentiment, topics?: string[], reviewerName?: string, gameTitle?: string }} [options]
 */
export function createAssistantReply({ sentiment, topics = [], reviewerName = 'Player', gameTitle = 'the arcade' } = {}) {
  const name = String(reviewerName || 'Player').slice(0, 24);
  const title = String(gameTitle || 'the arcade').slice(0, 48);
  const firstTopic = TOPIC_ID_TO_LABEL.get(topics[0]) || 'the overall experience';
  if (sentiment === 'positive') {
    return `Thanks for the kind words, ${name}! We’re glad ${title} made your session a good one. Your note is now part of the public arcade wall.`;
  }
  if (sentiment === 'negative') {
    return `Thanks for being honest, ${name}. We’re sorry ${title} missed the mark. The review agent flagged ${firstTopic} in the admin improvement ideas so the team can decide what to tackle.`;
  }
  if (sentiment === 'mixed') {
    return `Thanks for the balanced feedback, ${name}. We hear the concern about ${firstTopic} and added it to the admin improvement ideas for a human to prioritize.`;
  }
  return `Thanks for taking a moment to leave a note, ${name}. It is visible to the community, and a specific game or example can help the team spot what to improve next.`;
}

/**
 * The ranking is intentionally easy to explain: stars lead, then detail and a useful game/topic
 * context break ties. It cannot promote a 4-star note above a 5-star note.
 */
export function reviewFeaturedScore({ rating = 0, title = '', message = '', gameId = 'arcade', topics = [] } = {}) {
  const detail = Math.min(600, reviewTokens(`${title} ${message}`).filter((word) => word.length > 2).length * 8);
  const context = gameId && gameId !== 'arcade' ? 24 : 0;
  const topicBonus = Math.min(4, Array.isArray(topics) ? topics.length : 0) * 12;
  return (Math.max(1, Math.min(5, Number(rating) || 1)) * 1000) + detail + context + topicBonus;
}

/**
 * Summarize sentiment counts without changing or re-labelling source reviews.
 * @param {Array<Record<string, any>>} reviews
 * @returns {{ positive: number, negative: number, mixed: number, neutral: number, total: number }}
 */
export function summarizeReviewSentiment(reviews = []) {
  const counts = { positive: 0, negative: 0, mixed: 0, neutral: 0 };
  for (const review of reviews) {
    const label = isReviewSentiment(review?.sentiment) ? review.sentiment : 'neutral';
    counts[label] += 1;
  }
  return { ...counts, total: reviews.length };
}

/**
 * Grounded next-step ideas based on recurring negative and mixed review topics, not generated text.
 * @param {Array<Record<string, any>>} reviews
 */
export function buildImprovementIdeas(reviews = []) {
  if (!reviews.length) return [{ id: 'general', ...IMPROVEMENT_IDEAS.general, evidence: 0, note: 'No community reviews yet.' }];
  const evidence = new Map();
  for (const review of reviews) {
    if (!['negative', 'mixed'].includes(review?.sentiment)) continue;
    const topics = Array.isArray(review.topics) && review.topics.length
      ? review.topics
      : extractReviewTopics(`${review.title || ''} ${review.message || ''}`);
    for (const topic of topics) evidence.set(topic, (evidence.get(topic) || 0) + 1);
  }
  const ideas = [...evidence.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([id, count]) => ({ id, ...IMPROVEMENT_IDEAS[id], evidence: count, note: `Mentioned in ${count} negative or mixed ${count === 1 ? 'review' : 'reviews'}.` }));
  if (ideas.length) return ideas;
  return [{
    id: 'general',
    ...IMPROVEMENT_IDEAS.general,
    evidence: 0,
    note: 'No recurring negative theme in the reviews analyzed so far; keep collecting real feedback before prioritizing a change.',
  }];
}

/**
 * Distill human-corrected first-party reviews into small word-weight tables.
 *
 * It is a compact multinomial Naive Bayes student, not a hosted LLM. At least two human-labelled
 * examples in each of two sentiment classes are required. The returned model contains no examples,
 * names, UIDs, or raw text—only class priors and up to `maxVocabulary` token log-likelihoods.
 * @param {ReadonlyArray<{ text?: string, title?: string, label?: string }>} examples
 * @param {{ maxVocabulary?: number }} [options]
 */
export function trainDistilledReviewModel(examples = [], { maxVocabulary = 400 } = {}) {
  /** @type {Array<{ text?: string, title?: string, label: ReviewSentiment }>} */
  const usable = [];
  for (const example of examples) {
    const label = example?.label;
    if (!isReviewSentiment(label) || !`${example?.title || ''} ${example?.text || ''}`.trim()) continue;
    usable.push({ ...example, label });
  }
  /** @type {Record<ReviewSentiment, number>} */
  const classCounts = { positive: 0, negative: 0, mixed: 0, neutral: 0 };
  for (const example of usable) classCounts[example.label] += 1;
  const classes = REVIEW_SENTIMENTS.filter((label) => classCounts[label] >= 2);
  const selected = usable.filter((example) => classes.includes(example.label));
  if (classes.length < 2 || selected.length < 4) {
    return {
      ok: false,
      error: 'Label at least two real reviews in each of two sentiment classes (four reviews minimum) before training.',
      classCounts,
      trainingSize: selected.length,
    };
  }

  const wordCounts = Object.fromEntries(classes.map((label) => [label, new Map()]));
  const tokenTotals = Object.fromEntries(classes.map((label) => [label, 0]));
  const documentFrequency = new Map();
  for (const example of selected) {
    const label = example.label;
    const unique = new Set(reviewTokens(`${example.title || ''} ${example.text || ''}`)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
    for (const token of unique) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    for (const token of reviewTokens(`${example.title || ''} ${example.text || ''}`)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))) {
      const counts = wordCounts[label];
      counts.set(token, (counts.get(token) || 0) + 1);
      tokenTotals[label] += 1;
    }
  }

  const candidates = [...documentFrequency.keys()];
  const vocabSize = Math.max(1, candidates.length);
  const logProbabilities = Object.fromEntries(classes.map((label) => {
    const counts = wordCounts[label];
    const denominator = tokenTotals[label] + vocabSize;
    return [label, Object.fromEntries(candidates.map((token) => [token, Math.log(((counts.get(token) || 0) + 1) / denominator)]))];
  }));
  const discriminative = candidates.map((token) => {
    const values = classes.map((label) => logProbabilities[label][token]);
    return { token, score: Math.max(...values) - Math.min(...values) };
  }).sort((a, b) => b.score - a.score || a.token.localeCompare(b.token));
  const vocabulary = discriminative.slice(0, Math.max(32, Math.min(800, Number(maxVocabulary) || 400))).map(({ token }) => token);
  const weights = {};
  const logPriors = {};
  for (const label of classes) {
    weights[label] = Object.fromEntries(vocabulary.map((token) => [token, Number(logProbabilities[label][token].toFixed(4))]));
    logPriors[label] = Number(Math.log(classCounts[label] / selected.length).toFixed(4));
  }
  return {
    ok: true,
    model: {
      version: 1,
      kind: 'multinomial-naive-bayes',
      classes,
      classCounts: Object.fromEntries(classes.map((label) => [label, classCounts[label]])),
      logPriors,
      weights,
      vocabularySize: vocabulary.length,
      trainingSize: selected.length,
      source: 'first-party admin-labelled reviews',
    },
    trainingSize: selected.length,
    vocabularySize: vocabulary.length,
    classCounts: Object.fromEntries(classes.map((label) => [label, classCounts[label]])),
  };
}

/**
 * Small, locally generated examples provide a cold-start baseline when the project has no real
 * reviews yet. These are synthetic patterns based on common game-review language, not gameplay
 * experience or PSD-gaming user feedback; the Admin panel keeps first-party training separate.
 */
const STARTER_REVIEW_EXAMPLES = Object.freeze([
  { label: 'positive', text: 'I keep coming back for one more round; it feels rewarding and satisfying.' },
  { label: 'positive', text: 'The controls are responsive and the rules are easy to learn. I would recommend it.' },
  { label: 'positive', text: 'A lovely little puzzle with charming presentation; I want to play again.' },
  { label: 'positive', text: 'Quick to start, smooth to play, and a great way to pass a few minutes.' },
  { label: 'positive', text: 'Friends and I had a blast; the match setup was seamless.' },
  { label: 'positive', text: 'It feels polished, fair, and thoughtful without getting in the way.' },
  { label: 'positive', text: 'I got hooked immediately and wanted another round.' },
  { label: 'negative', text: 'It feels tedious and repetitive; I have no reason to play another round.' },
  { label: 'mixed', text: 'I got hooked by the puzzle, but the hint system is frustrating.' },
  { label: 'neutral', text: 'I selected the game, viewed its instructions, and played two rounds.' },
  { label: 'negative', text: 'I lost my progress twice after reopening the game. That was extremely frustrating.' },
  { label: 'negative', text: 'I could not join my friend; the room link keeps failing and wastes time.' },
  { label: 'negative', text: 'The controls are awkward on a phone and the buttons are too small.' },
  { label: 'negative', text: 'The game freezes mid-round and sometimes crashes on launch.' },
  { label: 'negative', text: 'The rules are unclear and I cannot tell how the puzzle works.' },
  { label: 'negative', text: 'It takes forever to load, and after waiting the game still will not start.' },
  { label: 'mixed', text: 'The puzzles are delightful, although the room link is confusing.' },
  { label: 'mixed', text: 'I like the game, but rounds feel repetitive after a while.' },
  { label: 'mixed', text: 'It loads quickly and looks polished, yet playing on a phone feels cramped.' },
  { label: 'mixed', text: 'The idea is fun, though the controls occasionally miss my taps.' },
  { label: 'mixed', text: 'Great with friends when it works; reconnecting after a disconnect is a pain.' },
  { label: 'mixed', text: 'I enjoyed the challenge, but the tutorial leaves out an important rule.' },
  { label: 'neutral', text: 'I tried one round of the puzzle this afternoon.' },
  { label: 'neutral', text: 'There are several game types in the catalog.' },
  { label: 'neutral', text: 'I played on my phone for about ten minutes.' },
  { label: 'neutral', text: 'The review is about the memory game, not the other games.' },
  { label: 'neutral', text: 'A short game was available in the menu.' },
  { label: 'neutral', text: 'I opened the catalog, selected a game, and played one session.' },
]);

const BUILT_IN_STARTER_MODEL = (() => {
  const starter = trainDistilledReviewModel(STARTER_REVIEW_EXAMPLES);
  return starter.ok ? { ...starter.model, source: 'curated-synthetic-starter' } : null;
})();

/** Human-readable topic strings for public replies and admin insights. */
export function reviewTopicLabel(topicId) {
  return TOPIC_ID_TO_LABEL.get(topicId) || 'the overall experience';
}
