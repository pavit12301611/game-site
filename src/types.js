/**
 * Shared type definitions for JSDoc. No runtime code.
 */

/**
 * @typedef {object} Game
 * @property {string} id
 * @property {string} title
 * @property {string} category
 * @property {string} engine
 * @property {string} icon
 * @property {string} accent
 * @property {string} blurb
 * @property {Record<string, any>} options
 * @property {string} duration
 * @property {string} difficulty
 * @property {string} input
 */

/**
 * @typedef {object} Player
 * @property {string} uid
 * @property {string} [name]
 */

/**
 * @typedef {object} GameState
 * @property {string} engine
 * @property {string} status  'playing' | 'finished'
 * @property {string} winner
 * @property {number} turnIndex
 * @property {string} [seed]
 */

/**
 * @typedef {object} Action
 * @property {string} [type]
 * @property {number} [index]
 * @property {number} [col]
 * @property {string} [choice]
 * @property {number} [answer]
 * @property {string} [direction]
 * @property {string} [targetUid]
 * @property {number[]} [guess]
 * @property {number} [lane]
 */

/**
 * @typedef {object} Engine
 * @property {function} createInitialState
 * @property {function} applyAction
 */