/**
 * The game catalog: shared game list plus artwork and how-to-play copy.
 *
 * *The list of games lives in shared/games.js* (shared with the backend).
 * This file adds browser-only data: artwork, engine labels, and guide text.
 */

import {
  applyGameAction as applyEngineAction,
  createInitialGameState as createInitialEngineState,
  engineIds,
} from './engines/index.js';
import { memoryCardIcon } from './engines/memory.js';
import { CATEGORIES, GAMES, getGame } from '../shared/games.js';
import { practiceBankFor } from '../shared/content/quiz-practice.js';

/** @typedef {import('./types.js').Game} Game */
/** @typedef {import('./types.js').Player} Player */
/** @typedef {import('./types.js').GameState} GameState */
/** @typedef {import('./types.js').Action} Action */

export { CATEGORIES, GAMES, getGame };

function resolveGame(gameOrId) {
  return typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
}

export function createInitialGameState(gameOrId, players, seed = 'psd') {
  const game = resolveGame(gameOrId);
  if (!game) throw new Error('That game could not be found.');
  if (!Array.isArray(players) || players.length < 1) throw new Error('At least one player is required.');
  return createInitialEngineState(game, players, seed);
}

export function applyGameAction(gameOrId, currentState, uid, action, players) {
  const game = resolveGame(gameOrId);
  if (!game || !currentState || !players.some(p => p.uid === uid)) throw new Error('You are not in this game.');
  return applyEngineAction(game, currentState, uid, action, players);
}

export { engineIds };
export { practiceBankFor as getPracticeQuizBank };

export function getMemoryCardIcon(index) {
  return memoryCardIcon(index);
}

/** The landing hero. */
export const HERO_ARTWORK = Object.freeze({
  src: '/images/hero.webp',
  srcset: '/images/hero-800.webp 800w, /images/hero.webp 1600w',
  width: 1600,
  height: 900,
  alt: '',
  focal: '62% 50%',
  credit: 'Generated image (composite of generated game photos)',
});

/** One cover per category. */
export const CATEGORY_ARTWORK = Object.freeze(
  Object.fromEntries(
    ['Arcade', 'Party', 'Strategy', 'Puzzle'].map(name => {
      const slug = name.toLowerCase();
      return [name, Object.freeze({
        src: `/images/categories/${slug}.webp`,
        srcset: `/images/categories/${slug}-640.webp 640w, /images/categories/${slug}.webp 1280w`,
        width: 1280,
        height: 800,
        alt: '',
        focal: 'center center',
        credit: 'Generated image (composite of generated game photos)',
      })];
    }),
  ),
);

/** Engine labels shown on cards and in the lobby. */
export const ENGINE_LABELS = {
  line: 'Grid tactics',
  drop: 'Drop board',
  memory: 'Memory matrix',
  race: 'Speed sprint',
  rps: 'Quick duel',
  quiz: 'Brain round',
  maze: 'Labyrinth dash',
  battle: 'Fleet radar',
  rally: 'Court volley',
  code: 'Cipher logic',
};

/**
 * Games that have a photo: public/images/games/<id>.webp.
 */
export const GAME_PHOTOS = {
  'air-hockey': 'Air-hockey table with a red puck and striker',
  'alien-skirmish': 'Retro toy spaceship beside a small green radar scope',
  'arcade-facts': 'Arcade joystick and round buttons on a dark wooden control panel',
  'arcade-pairs': 'Pairs of brass arcade tokens in a wooden grid tray',
  'brain-busters': 'Interlocking wooden brain-teaser puzzle on a table',
  'bug-blaster': 'Retro tin toy ray gun on a workbench',
  'button-masher': 'Oversized red push button with a finger above it',
  'byte-escape': 'Green circuit board whose traces read as a maze',
  'codebreaker': 'Brass combination padlock with number dials',
  'coin-flip-clash': 'Plain blank gold coin spinning mid-air',
  'connect-four': 'Upright blue four-in-a-row frame with red and yellow discs',
  'dice-duel': 'Two ivory dice tumbling on green felt',
  'eight-bit-riddles': 'Generic retro handheld console with blocky pixels on screen',
  'emoji-decode': 'Colourful generic smiley stickers on a wooden table',
  'emoji-flip': 'Cream cards with hand-drawn generic smiley faces',
  'five-in-row': 'Large wooden drop-frame with red and yellow discs',
  'laser-duel': 'Red and green laser beams crossing in fog',
  'mastermind': 'Coloured code pegs with black and white feedback pegs',
  'maze-runner': 'Aerial view of a green hedge maze in a garden',
  'memory-match': 'Face-down navy cards on a table, two turned up',
  'movie-mayhem': 'Blank clapperboard and a bowl of popcorn',
  'neon-gomoku': 'Go board with black and white stones, close crop',
  'neon-labyrinth': 'Narrow maze corridor lit by orange and cyan neon strips',
  'neon-pairs': 'Memory cards with glowing geometric backs on dark glass',
  'number-chase': 'Wooden number tiles and a small chalkboard',
  'paddle-wars': 'Two table-tennis paddles facing each other with a white ball',
  'pixel-fleet': 'Small toy wooden boats on a blue grid cloth',
  'pixel-pop-quiz': 'Four coloured plastic quiz buzzers on a wooden table',
  'pixel-tac-toe': 'Wooden tic-tac-toe board with turned X and O pieces',
  'pixel-tap': 'Big blue arcade push button on a metal panel',
  'pong-rally': 'Table-tennis paddles and orange ball on a blue table',
  'reaction-rush': 'Vintage stopwatch mid-run held in a hand',
  'retro-rewind': 'Audio cassette and blank video tape with plain labels',
  'retro-trivia': 'Vintage wood-cased television in a cosy room',
  'rock-paper-scissors': 'Three hands showing rock, paper and scissors',
  'sea-battle': 'Grey plastic peg board with toy ships and red and white pegs',
  'spacebar-showdown': 'Macro of a mechanical keyboard spacebar with blank keycaps',
  'star-runner': 'Wooden ball-maze labyrinth toy with a star hole',
  'turbo-charge': 'Boost gauge on a car dashboard, needle high',
  'word-scramble': 'Wooden letter tiles scattered on a table',
};

/** One dedicated picture per game. */
export const GAME_ARTWORK = Object.freeze(
  Object.fromEntries(
    Object.entries(GAME_PHOTOS).map(([id, alt]) => [id, Object.freeze({
      src: `/images/games/${id}.webp`,
      srcset: `/images/games/${id}-640.webp 640w, /images/games/${id}.webp 1280w`,
      width: 1280,
      height: 800,
      alt,
      focal: 'center center',
      credit: 'Generated image',
    })]),
  ),
);

/** Picture, srcset and engine badge for a game card. */
export function getGameArtwork(gameOrId) {
  const game = typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
  if (!game) return { ...CATEGORY_ARTWORK.Arcade, engineLabel: 'Arcade' };
  const engineLabel = ENGINE_LABELS[game.engine] || 'Arcade mode';
  const own = Object.hasOwn(GAME_ARTWORK, game.id) ? GAME_ARTWORK[game.id] : null;
  return { ...(own || CATEGORY_ARTWORK[game.category] || CATEGORY_ARTWORK.Arcade), engineLabel };
}

/** How-to-play copy derived from engine options. */
export function getGameGuide(gameOrId) {
  const game = typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
  if (!game) return null;
  const opts = game.options || {};

  switch (game.engine) {
    case 'line':
      return {
        mode: `${opts.size}×${opts.size} Tactical Grid`,
        goal: `Line up ${opts.connect} of your marks horizontally, vertically, or diagonally.`,
        controls: 'Click or tap any empty grid cell when it is your turn.',
        rules: `2–3 players rotate turns. Filling every cell without ${opts.connect} in a row is a draw.`,
        shortcut: 'Tap / Click cell',
      };
    case 'drop':
      return {
        mode: `${opts.cols}×${opts.rows} Gravity Board`,
        goal: `Connect ${opts.connect} of your tokens in a row.`,
        controls: 'Click a column drop arrow at the top to drop a token.',
        rules: 'Players alternate turns. Full columns lock automatically.',
        shortcut: 'Tap / Click column ↓',
      };
    case 'memory':
      return {
        mode: `${opts.pairs} Pairs (${opts.pairs * 2} Cards)`,
        goal: 'Uncover and collect the most matching symbol pairs.',
        controls: 'Click two face-down cards to reveal them.',
        rules: opts.matchKeepsTurn === false ? 'Scoring a match awards +1 point, then the turn passes.' : 'A match awards +1 point and grants a bonus turn!',
        shortcut: 'Tap / Click 2 cards',
      };
    case 'race':
      return {
        mode: `First to ${opts.target} Boosts`,
        goal: `Sprint ahead and fill your meter to ${opts.target}.`,
        controls: 'Click BOOST or press Spacebar repeatedly.',
        rules: opts.tapGapMs ? `Taps closer together than ${opts.tapGapMs} ms do not score.` : 'Simultaneous real-time race — no turn waiting.',
        shortcut: 'Spacebar or Tap BOOST',
      };
    case 'rps':
      return {
        mode: opts.mode === 'coin' ? `Coin Clash (first to ${opts.target})` : opts.mode === 'dice' ? `High-Roll Duel (first to ${opts.target})` : `Hidden Picks (first to ${opts.target})`,
        goal: 'Outread your opponents.',
        controls: opts.mode === 'coin' ? 'Tap Heads or Tails.' : opts.mode === 'dice' ? 'Tap a die value (1–6).' : 'Tap Rock, Paper, or Scissors.',
        rules: 'Picks reveal simultaneously. Highest/unique score wins the round.',
        shortcut: 'Tap',
      };
    case 'quiz':
      return {
        mode: `${opts.rounds}-Round Quiz`,
        goal: `Score the most correct answers across ${opts.rounds} questions.`,
        controls: 'Tap A, B, C, or D (or press 1–4).',
        rules: 'Everyone answers before answers and scores are revealed.',
        shortcut: 'Tap A / B / C / D',
      };
    case 'maze':
      return {
        mode: `${opts.width}×${opts.height} Labyrinth Race`,
        goal: 'Navigate to the glowing star gate (✦) first.',
        controls: 'Use Arrow keys or on-screen directional buttons.',
        rules: 'Simultaneous movement — no turn waiting.',
        shortcut: 'Arrow keys ↑ ← ↓ →',
      };
    case 'battle':
      return {
        mode: `${opts.board}×${opts.board} Radar, ${opts.fleet} Fleet Cells`,
        goal: `Find all ${opts.fleet} hidden fleet cells on every rival's radar.`,
        controls: 'Select a rival, then click an untargeted radar square.',
        rules: 'Turns rotate after each shot. Hits (✹) and misses (·) are published.',
        shortcut: 'Select target + Tap cell',
      };
    case 'rally':
      return {
        mode: `Court Rally, ${opts.lanes} Lanes (first to ${opts.target})`,
        goal: `Trade volleys and be the first to ${opts.target} points.`,
        controls: `Click one of ${opts.lanes} return lanes.`,
        rules: 'Every return scores +1 for the returning player.',
        shortcut: 'Tap lane buttons',
      };
    case 'code':
      return {
        mode: `${opts.digits}-Digit Cipher, 0–${opts.symbols - 1} (${opts.maxGuesses} guesses)`,
        goal: `Crack the secret ${opts.digits}-digit code.`,
        controls: `Click each digit to cycle 0–${opts.symbols - 1}, then Try code.`,
        rules: 'EXACT = right digit right position; NEAR = right digit wrong position.',
        shortcut: `Cycle digits + Try code`,
      };
    default:
      return { mode: 'Arcade Match', goal: game.blurb, controls: 'Use on-screen controls.', rules: 'Follow the turn indicator.', shortcut: 'Tap / Click' };
  }
}