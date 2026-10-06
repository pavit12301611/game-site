import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let pages;
let state;

before(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://psd-gaming.test/' });
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('window', dom.window);
  define('document', dom.window.document);
  define('navigator', dom.window.navigator);
  define('localStorage', dom.window.localStorage);
  define('location', dom.window.location);
  define('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  pages = await import('../src/views/pages.js');
  ({ state } = await import('../src/state.js'));
});

const sampleReview = {
  id: 'review-1',
  reviewerName: 'Player <one>',
  title: 'A fun little game',
  message: 'Great fun, but the room link was confusing.',
  rating: 4,
  gameId: 'pixel-tac-toe',
  sentiment: 'mixed',
  topics: ['multiplayer'],
  assistantName: 'Arcade Review Agent',
  assistantReply: 'Thanks for the balanced feedback. We hear you about rooms.',
  createdAtMs: Date.now() - 60_000,
  featuredScore: 4500,
};

test('the public reviews page has an accessible review form, public-reply wall and latest-first feed', () => {
  state.page = 'reviews';
  state.user = null;
  state.profile = null;
  state.displayName = '';
  state.reviews = [sampleReview];
  state.reviewsLoading = false;
  state.reviewsHasMore = false;
  state.reviewsError = '';
  state.featuredReview = sampleReview;
  const html = pages.renderReviews();
  assert.match(html, /Player reviews/);
  assert.match(html, /Public to everyone/);
  assert.match(html, /name="rating" type="radio"/);
  assert.match(html, /name="message" type="textarea"|name="message" rows="5"/);
  assert.match(html, /value="pixel-tac-toe"/);
  assert.match(html, /All player reviews/);
  assert.match(html, /Arcade Review Agent/);
  assert.match(html, /sentiment-mixed/);
  assert.match(html, /Player &lt;one&gt;/, 'user-written display names are escaped');
  assert.match(html, /The review itself is sent to Firebase when you post/);
  assert.match(html, /pretrained DistilBERT model classifies it in this browser/);
  assert.match(html, /about 67 MB of public weights/);
  assert.match(html, /not game reviews/);
  assert.match(html, /Your review text is not sent to Hugging Face/);
  assert.match(html, /no inference API or API key is used/);
  assert.doesNotMatch(html, /data-action="load-more-reviews"/, 'there is no next page when the query has fewer than a page');
});

test('the home spotlight presents the top community review with a path to all reviews', () => {
  state.featuredReview = sampleReview;
  const html = pages.renderHome();
  assert.match(html, /Top community review/);
  assert.match(html, /A fun little game/);
  assert.match(html, /data-page="reviews"/);
  assert.match(html, /Arcade Review Agent/);
});

test('the admin review-agent tab shows sentiment, evidence-backed ideas and training labels', () => {
  state.isAdmin = true;
  state.adminTab = 'reviews';
  state.adminLoading = false;
  state.user = { uid: 'admin-1' };
  state.adminData = {
    rooms: [], profiles: [], admins: [], friendships: [], requests: [], invites: [],
    reviews: [sampleReview, { ...sampleReview, id: 'review-2', sentiment: 'negative', topics: ['multiplayer'] }],
    reviewAnnotations: [{ id: 'review-1', sentiment: 'mixed' }],
    reviewAgentModel: null,
    error: '',
  };
  const html = pages.renderAdmin();
  assert.match(html, /Arcade Review Agent/);
  assert.match(html, /On-device transformer · no inference API/);
  assert.match(html, /first use downloads about 67 MB/);
  assert.match(html, /first-party specialist/);
  assert.match(html, /Improvement ideas/);
  assert.match(html, /mentioned in/i);
  assert.match(html, /admin-label-review/);
  assert.match(html, /admin-train-review-agent/);
  assert.match(html, /Human training label/);
  assert.match(html, /review-1/);
});
