/**
 * Quiz practice bank: selects a warm-up subset from the main bank for local practice.
 */

import { practiceBankFor as _bankFor } from './quiz-banks.js';

/**
 * Returns the practice bank for a game (a warm-up subset).
 * @param {string} gameId
 * @returns {Array<{ question: string, options: string[], answer: number, kind: string }>}
 */
export function practiceBankFor(gameId) {
  return _bankFor(gameId);
}