/**
 * Shared JSDoc types for the app. This module is types only: it exports nothing at runtime, so it
 * costs nothing in the bundle and is never imported by the browser.
 *
 * It exists so `npm run typecheck` (tsc --checkJs) has one place to name the shapes that every
 * engine, view and helper passes around.
 *
 * @typedef {Object} Game
 * @property {string} id          catalog id, e.g. "pixel-tac-toe"
 * @property {string} title       display name
 * @property {string} category    one of CATEGORIES
 * @property {string} engine      which src/engines module runs it
 * @property {string} icon        one-glyph sigil
 * @property {string} accent      colour token, e.g. "violet"
 * @property {string} blurb       one-line description
 * @property {string} duration    shown duration label, e.g. "3 min"
 * @property {string} difficulty  shown difficulty label: Easy | Medium | Hard
 * @property {string} input       shown input style, e.g. "Tap or keys"
 * @property {Record<string, any>} options  engine settings (size, target, rounds, ...)
 */

/**
 * @typedef {Object} Player
 * @property {string} uid   Firestore uid, or "local-you" / "local-cpu" in practice mode
 * @property {string} [name]
 */

/**
 * The five fields every engine state carries.
 * @typedef {Object} BaseState
 * @property {'playing' | 'finished'} phase
 * @property {string | null} turnUid    null for engines where everyone moves at once
 * @property {string | null} winnerUid
 * @property {'winner' | 'draw' | null} result
 * @property {number} moves
 */

/**
 * A full engine state: the base fields plus whatever the engine adds.
 * @typedef {BaseState & Record<string, any>} GameState
 */

/**
 * A move. Each engine documents the shape it accepts: { index }, { col }, { choice },
 * { type: 'tap' | 'next' }, { direction }, { targetUid, index }, { lane }, { guess }.
 * @typedef {Record<string, any>} Action
 */

/**
 * @typedef {Object} Engine
 * @property {(game: Game, players: Player[], seed?: string, deps?: Record<string, any>) => GameState} createInitialState
 * @property {(game: Game, state: GameState, uid: string, action: Action, players: Player[]) => GameState} applyAction
 */

/**
 * What the connection status is derived from.
 * @typedef {Object} FirebaseSetup
 * @property {'ok' | 'missing' | 'invalid'} status
 * @property {string} code
 * @property {string} message
 * @property {string} hint
 * @property {string} projectId
 * @property {string} authDomain
 */

export {};
