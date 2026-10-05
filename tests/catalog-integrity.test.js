/**
 * Catalog integrity: the forty entries, their wording and the content behind the quiz games must
 * describe what the engines actually do.
 *
 * The catalog is the product surface: a card that promises "20 taps" for a game whose engine target
 * is 16 is a bug even though no code throws. These tests read the same options the engines read and
 * fail when the copy, the artwork or the question banks drift away from them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CATEGORIES, ENGINE_LABELS, GAME_PHOTOS, GAMES, getGameArtwork, getGameGuide, engineIds, getMemoryCardIcon } from '../src/catalog.js';
import { MEMORY_ICONS } from '../src/engines/memory.js';
import { PRACTICE_INDEXES, QUIZ_BANK_BY_GAME, practiceItemsForGame, onlineItemsForGame } from '../shared/content/quiz-banks.js';
import { readCommittedPracticeModule, renderPracticeModule } from '../scripts/build-quiz-practice.mjs';

/** The kind of question each quiz game is allowed to ask. */
const EXPECTED_QUIZ_KIND = {
  'word-scramble': 'scramble',
  'number-chase': 'number',
  'emoji-decode': 'emoji',
  'brain-busters': 'riddle',
  'eight-bit-riddles': 'riddle',
};
const DEFAULT_QUIZ_KIND = 'trivia';

/** Words that would make a quiz item depend on somebody else's brand or copyrighted work. */
const BRAND_WORDS = ['Nintendo', 'Sega', 'Atari', 'PlayStation', 'Xbox', 'Mario', 'Sonic', 'Zelda', 'Pokémon', 'Pokemon', 'Pac-Man', 'Pacman', 'Tetris', 'Pong', 'Asteroids', 'Frogger', 'Space Invaders', 'Donkey Kong', 'Game Boy', 'Steam Deck', 'PSP', 'Disney', 'Marvel', 'Star Wars', 'Netflix'];

const guideText = (game) => JSON.stringify(getGameGuide(game));

test('the catalog holds forty unique, fully described games', () => {
  assert.equal(GAMES.length, 40);
  assert.equal(new Set(GAMES.map((game) => game.id)).size, 40, 'ids are unique');
  assert.equal(new Set(GAMES.map((game) => game.title)).size, 40, 'titles are unique');
  assert.equal(new Set(GAMES.map((game) => game.blurb)).size, 40, 'blurbs are unique');
  for (const game of GAMES) {
    assert.ok(game.title.trim(), `${game.id} has a title`);
    assert.ok(game.blurb.length > 30, `${game.id} has a real blurb`);
    assert.ok(CATEGORIES.includes(game.category), `${game.id} category "${game.category}" is a known category`);
    assert.ok(engineIds().includes(game.engine), `${game.id} engine "${game.engine}" exists`);
    assert.ok(ENGINE_LABELS[game.engine], `${game.id} engine has a display label`);
    assert.ok(game.icon.trim(), `${game.id} has an icon`);
    assert.ok(['Easy', 'Medium', 'Tricky', 'Hard'].includes(game.difficulty), `${game.id} difficulty "${game.difficulty}" is a known word`);
    assert.match(game.duration, /^\d+ min$/, `${game.id} duration "${game.duration}"`);
    assert.ok(['Tap', 'Keys', 'Tap or keys'].includes(game.input), `${game.id} input "${game.input}"`);
  }
});

test('every game has its own picture with descriptive alt text', () => {
  for (const game of GAMES) {
    const artwork = getGameArtwork(game);
    assert.ok(artwork.src.startsWith('/images/'), `${game.id} artwork path`);
    assert.ok(artwork.alt.trim().length > 20, `${game.id} artwork alt text describes the picture`);
    assert.equal(artwork.alt.includes('<'), false, `${game.id} alt text is plain text`);
    assert.ok(GAME_PHOTOS[game.id], `${game.id} has a dedicated photo`);
    assert.ok(artwork.engineLabel, `${game.id} names its engine`);
  }
});

test('no two games in the same engine are the same options in different paint', () => {
  const byEngine = new Map();
  for (const game of GAMES) {
    const signature = game.engine === 'quiz'
      ? `${QUIZ_BANK_BY_GAME[game.id]}:${JSON.stringify(game.options)}`
      : JSON.stringify(game.options);
    const seen = byEngine.get(game.engine) ?? new Map();
    assert.equal(seen.has(signature), false, `${game.id} repeats the options of ${seen.get(signature) ?? ''} exactly`);
    seen.set(signature, game.id);
    byEngine.set(game.engine, seen);
  }
});

test('the how-to-play copy repeats the real options', () => {
  for (const game of GAMES) {
    const text = guideText(game);
    const opts = game.options;
    assert.ok(text.length > 120, `${game.id} guide has real content`);
    switch (game.engine) {
      case 'line':
        assert.ok(text.includes(`${opts.size}×${opts.size}`), `${game.id} guide names the ${opts.size}x${opts.size} grid`);
        assert.ok(text.includes(String(opts.connect)), `${game.id} guide names the run length`);
        break;
      case 'drop':
        assert.ok(text.includes(`${opts.cols}×${opts.rows}`), `${game.id} guide names the board size`);
        assert.ok(text.includes(String(opts.connect)), `${game.id} guide names the run length`);
        break;
      case 'memory':
        assert.ok(text.includes(String(opts.pairs)), `${game.id} guide names the pair count`);
        assert.ok(text.includes(String(opts.pairs * 2)), `${game.id} guide names the card count`);
        assert.ok(opts.pairs <= MEMORY_ICONS.length, `${game.id} has enough card faces`);
        assert.ok((opts.openPairs || 0) <= opts.pairs - 1, `${game.id} cannot open every pair at the start`);
        break;
      case 'race':
        assert.ok(text.includes(String(opts.target)), `${game.id} guide names the target score`);
        assert.ok(text.includes(opts.tapGapMs > 0 ? String(opts.tapGapMs) : 'no tap limit'), `${game.id} guide states the tempo rule`);
        break;
      case 'rps':
        assert.ok(text.includes(String(opts.target)), `${game.id} guide names the round target`);
        assert.ok(['rps', 'coin', 'dice'].includes(opts.mode), `${game.id} picks a real duel mode`);
        break;
      case 'quiz': {
        const bank = onlineItemsForGame(game.id);
        assert.ok(text.includes(String(opts.rounds)), `${game.id} guide names the round count`);
        assert.ok(bank.length >= opts.rounds, `${game.id} has more online questions than rounds`);
        assert.ok(text.includes('own bank'), `${game.id} says it has its own bank`);
        break;
      }
      case 'maze':
        assert.ok(text.includes(`${opts.width}×${opts.height}`), `${game.id} guide names the maze size`);
        assert.ok(['classic', 'spiral', 'pillars', 'zigzag'].includes(opts.layout), `${game.id} has a real layout`);
        break;
      case 'battle':
        assert.ok(text.includes(`${opts.board}×${opts.board}`), `${game.id} guide names the radar size`);
        assert.ok(text.includes(String(opts.fleet)), `${game.id} guide names the fleet size`);
        assert.ok(opts.fleet < opts.board * opts.board, `${game.id} fleet fits on its board`);
        break;
      case 'rally':
        assert.ok(text.includes(String(opts.lanes)), `${game.id} guide names the lane count`);
        assert.ok([2, 3, 5].includes(opts.lanes), `${game.id} uses a lane count the court supports`);
        assert.ok(text.includes(String(opts.target)), `${game.id} guide names the target`);
        break;
      case 'code':
        assert.ok(text.includes(String(opts.digits)), `${game.id} guide names the digit count`);
        assert.ok(text.includes(String(opts.symbols - 1)), `${game.id} guide names the highest symbol`);
        assert.ok(text.includes(String(opts.maxGuesses)), `${game.id} guide names the guess limit`);
        break;
      default:
        assert.fail(`${game.id} uses an engine with no integrity check`);
    }
  }
});

test('the memory deck helper stays inside the icon list', () => {
  assert.ok(MEMORY_ICONS.length >= 8, 'the biggest deck needs eight faces');
  for (let index = 0; index < MEMORY_ICONS.length * 3; index += 1) {
    assert.ok(MEMORY_ICONS.includes(getMemoryCardIcon(index)), `icon ${index} comes from the icon list`);
  }
});

test('each quiz game has its own bank, its own kind and enough questions for its rounds', () => {
  const quizGames = GAMES.filter((game) => game.engine === 'quiz');
  assert.equal(quizGames.length, 10);
  const allPrompts = new Map();
  for (const game of quizGames) {
    assert.ok(QUIZ_BANK_BY_GAME[game.id], `${game.id} maps to a bank`);
    const bank = onlineItemsForGame(game.id);
    assert.ok(bank.length >= game.options.rounds, `${game.id} deals from ${bank.length} online items for ${game.options.rounds} rounds`);
    const expectedKind = EXPECTED_QUIZ_KIND[game.id] ?? DEFAULT_QUIZ_KIND;
    const ids = new Set();
    const prompts = new Set();
    const promptTexts = new Set();
    for (const item of bank) {
      assert.match(item.id, /^[a-z0-9-]+$/, `${game.id} item id "${item.id}"`);
      assert.equal(ids.has(item.id), false, `${game.id} id ${item.id} is unique`);
      ids.add(item.id);
      assert.equal(item.kind, expectedKind, `${game.id}/${item.id} is a ${expectedKind} question, not ${item.kind}`);
      assert.ok(String(item.prompt ?? '').trim().length > 10, `${game.id}/${item.id} has a real prompt`);
      const visible = `${item.prompt}|${item.clue ?? ''}|${item.label ?? ''}`;
      assert.equal(prompts.has(visible), false, `${game.id}/${item.id} repeats another item’s question and clue`);
      prompts.add(visible);
      if (['trivia', 'riddle', 'scramble'].includes(item.kind)) {
        assert.equal(promptTexts.has(item.prompt), false, `${game.id}/${item.id} reuses a prompt verbatim`);
        promptTexts.add(item.prompt);
      }
      assert.ok(Array.isArray(item.choices) && item.choices.length >= 3 && item.choices.length <= 4, `${game.id}/${item.id} offers 3-4 choices`);
      assert.equal(new Set(item.choices).size, item.choices.length, `${game.id}/${item.id} choices are distinct`);
      assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.choices.length, `${game.id}/${item.id} answer points at a choice`);
      if (['emoji', 'number', 'scramble'].includes(item.kind)) {
        assert.ok(String(item.label ?? '').trim().length > 5, `${game.id}/${item.id} gives the clue a text alternative`);
        assert.ok(String(item.clue ?? '').trim().length > 0, `${game.id}/${item.id} has a clue to show`);
      }
      // Our own catalog titles are allowed to appear (an emoji clue may point at "Pong Rally");
      // anything else that names a real product is not.
      let text = [item.prompt, item.clue, item.label, ...(item.choices ?? []), item.note].filter(Boolean).join(' ');
      for (const title of GAMES.map((entry) => entry.title)) text = text.split(title).join(' ');
      for (const word of BRAND_WORDS) {
        assert.equal(text.includes(word), false, `${game.id}/${item.id} names the real product "${word}"`);
      }
      assert.equal(allPrompts.has(visible), false, `${game.id}/${item.id} repeats a question from ${allPrompts.get(visible)}`);
      allPrompts.set(visible, `${game.id}/${item.id}`);
    }
    const practice = practiceItemsForGame(game.id);
    assert.equal(practice.length, PRACTICE_INDEXES.length, `${game.id} ships a warm-up subset`);
    const practiceIds = new Set(practice.map((item) => item.id));
    for (const item of bank) assert.equal(practiceIds.has(item.id), false, `${game.id}/${item.id} is online-only`);
  }
});

test('the committed warm-up module matches the generator', () => {
  assert.equal(readCommittedPracticeModule(), renderPracticeModule(), 'run `node scripts/build-quiz-practice.mjs`');
});
