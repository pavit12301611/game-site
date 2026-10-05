#!/usr/bin/env node
/**
 * Generates shared/content/quiz-practice.js — the warm-up subset of every quiz bank that is allowed
 * to ship to the browser.
 *
 * The full banks (shared/content/quiz-banks.js) hold the answer keys and stay server-side. Local
 * practice still needs real questions, so this script copies the fixed warm-up positions
 * (PRACTICE_INDEXES) into a small module that `src/engines/quiz.js` imports. Online rooms deal from
 * the full bank *minus* these items, which is what keeps an online answer out of the browser.
 *
 * Run it after editing a bank:
 *   node scripts/build-quiz-practice.mjs
 *
 * tests/catalog-integrity.test.js re-runs this generator in memory and fails when the committed
 * file is stale, so the two can never drift apart.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../shared/games.js';
import { PRACTICE_INDEXES, QUIZ_BANKS, QUIZ_BANK_BY_GAME } from '../shared/content/quiz-banks.js';

export const GENERATED_PATH = fileURLToPath(new URL('../shared/content/quiz-practice.js', import.meta.url));

/** Reads the committed practice module, for the staleness test. */
export function readCommittedPracticeModule() {
  return readFileSync(GENERATED_PATH, 'utf8');
}

/** @returns {string} the exact file contents the committed practice module must have. */
export function renderPracticeModule() {
  /** @type {Record<string, any[]>} */
  const banks = {};
  /** @type {string[]} */
  const ids = [];
  for (const [gameId, bankId] of Object.entries(QUIZ_BANK_BY_GAME)) {
    if (!GAMES.some((game) => game.id === gameId)) throw new Error(`${gameId} has a question bank but is not in the catalog`);
    if (bankId !== gameId) throw new Error(`${gameId} points at the bank ${bankId}; keep one named bank per catalog game`);
  }
  for (const game of GAMES) {
    if (!QUIZ_BANK_BY_GAME[game.id]) continue;
    const bank = QUIZ_BANKS[game.id] ?? [];
    const items = PRACTICE_INDEXES.map((index) => bank[index]).filter(Boolean);
    const rounds = Number(game.options.rounds) || 5;
    if (items.length < rounds) {
      throw new Error(`${game.id} deals ${rounds} rounds but only ${items.length} warm-up questions exist`);
    }
    banks[game.id] = items;
    ids.push(...items.map((item) => item.id));
  }
  return `/**
 * GENERATED FILE — do not edit by hand.
 *
 * The warm-up subset of every quiz bank. This is the only quiz content that ships to the browser:
 * local practice deals from it, while online rooms are dealt by the trusted backend from the full,
 * server-only banks in shared/content/quiz-banks.js minus these items.
 *
 * Regenerate with: node scripts/build-quiz-practice.mjs
 */

/** @typedef {{ id: string, kind: 'emoji'|'number'|'riddle'|'scramble'|'trivia', prompt: string, clue?: string, label?: string, choices: string[], answer: number, note?: string }} QuizItem */

/** @type {Record<string, QuizItem[]>} */
export const PRACTICE_BANKS = ${JSON.stringify(banks, null, 2)};

/** Every warm-up item id, so the backend can keep these out of online decks. */
export const PRACTICE_ITEM_IDS = (${JSON.stringify(ids)});

/** @param {string} itemId @returns {boolean} whether this id belongs to the shipped warm-up set. */
export function isPracticeItem(itemId) {
  return PRACTICE_ITEM_IDS.includes(itemId);
}

/** @param {string} gameId @returns {QuizItem[]} the browser-safe items for one game. */
export function practiceBankFor(gameId) {
  return PRACTICE_BANKS[gameId] ?? [];
}
`;
}

if (process.argv[1]?.endsWith('build-quiz-practice.mjs')) {
  const source = renderPracticeModule();
  writeFileSync(GENERATED_PATH, source);
  console.log(`Wrote ${GENERATED_PATH} (${source.length} bytes)`);
}
