/**
 * The game catalog: the shared game list plus the artwork and how-to-play copy for each entry.
 *
 * *The list of games itself lives in shared/games.js*, because the trusted backend validates the
 * same catalog (game ids, engine names and rule options) and must not import anything
 * browser-facing. This file adds what only the browser needs:
 *
 *   - one generated photograph per game (public/images/games/<id>.webp) and the alt text
 *   - the guide text shown in the "How to play" panel, derived from the engine and its options so a
 *     rule change cannot silently leave the instructions behind
 *
 * *Game rules live in src/engines/*.js.* `createInitialGameState` and `applyGameAction` are
 * re-exported from the engine registry so callers (src/main.js, tests) keep one stable import for
 * the whole game API.
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

/**
 * @param {string | Game} gameOrId
 * @returns {Game | null}
 */
function resolveGame(gameOrId) {
  return typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
}

/**
 * @param {string | Game} gameOrId
 * @param {Player[]} players
 * @param {string} [seed]
 * @returns {GameState}
 */
export function createInitialGameState(gameOrId, players, seed = 'psd') {
  const game = resolveGame(gameOrId);
  if (!game) throw new Error('That game could not be found.');
  if (!Array.isArray(players) || players.length < 1) throw new Error('At least one player is required.');
  return createInitialEngineState(game, players, seed);
}

/**
 * @param {string | Game} gameOrId
 * @param {GameState} currentState
 * @param {string} uid
 * @param {Action} action
 * @param {Player[]} players
 * @returns {GameState}
 */
export function applyGameAction(gameOrId, currentState, uid, action, players) {
  const game = resolveGame(gameOrId);
  if (!game || !currentState || !players.some((player) => player.uid === uid)) throw new Error('You are not in this game.');
  return applyEngineAction(game, currentState, uid, action, players);
}

export { engineIds };

/** Re-exported so callers can name the practice bank explicitly when they need it. */
export { practiceBankFor as getPracticeQuizBank };

/** @param {number} index @returns {string} the symbol printed on a revealed memory card. */
export function getMemoryCardIcon(index) {
  return memoryCardIcon(index);
}

/** The landing hero: a composite of the generated game photos (see scripts/build-composites.sh). */
export const HERO_ARTWORK = Object.freeze({
  src: '/images/hero.webp',
  srcset: '/images/hero-800.webp 800w, /images/hero.webp 1600w',
  width: 1600,
  height: 900,
  alt: '',
  focal: '62% 50%',
  credit: 'Generated image (composite of generated game photos)',
});

/** One cover per category, also composites of generated photos. Keys match CATEGORIES (minus "All games"). */
export const CATEGORY_ARTWORK = Object.freeze(
  Object.fromEntries(
    ['Arcade', 'Party', 'Strategy', 'Puzzle'].map((name) => {
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

/** Engine names shown on cards and in the lobby. */
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
 * Games that have a photo of their own: `public/images/games/<id>.webp` (1280x800) and
 * `<id>-640.webp`, generated for this project (see public/images/CREDITS.md). The value is the
 * photo's subject, used as its alt text where the picture is not purely decorative.
 * @type {Record<string, string>}
 */
export const GAME_PHOTOS = {
  'air-hockey': "Air-hockey table with a red puck and striker, a hand on the striker, no face",
  'alien-skirmish': "Retro toy spaceship beside a small green radar scope",
  'arcade-facts': "Arcade joystick and round buttons on a dark wooden control panel, no logo",
  'arcade-pairs': "Pairs of brass arcade tokens in a wooden grid tray",
  'brain-busters': "Interlocking wooden brain-teaser puzzle on a table",
  'bug-blaster': "Retro tin toy ray gun on a workbench",
  'button-masher': "Oversized red push button with a finger above it",
  'byte-escape': "Green circuit board whose traces read as a maze, macro",
  'codebreaker': "Brass combination padlock with number dials, no brand",
  'coin-flip-clash': "Plain blank gold coin spinning mid-air",
  'connect-four': "Upright blue four-in-a-row frame with red and yellow discs, no logo",
  'dice-duel': "Two ivory dice tumbling on green felt",
  'eight-bit-riddles': "Generic retro handheld console with abstract blocky pixels on its screen, no logo",
  'emoji-decode': "Colourful generic smiley stickers on a wooden table",
  'emoji-flip': "Cream cards with hand-drawn generic smiley faces",
  'five-in-row': "Large wooden drop-frame with red and yellow discs, side light",
  'laser-duel': "Red and green laser beams crossing in fog",
  'mastermind': "Coloured code pegs with black and white feedback pegs on a plain wooden board",
  'maze-runner': "Aerial view of a green hedge maze in a garden",
  'memory-match': "Face-down navy cards on a table, two turned up",
  'movie-mayhem': "Blank clapperboard and a bowl of popcorn, no writing, no poster",
  'neon-gomoku': "Go board with black and white stones, close crop",
  'neon-labyrinth': "Narrow maze corridor lit by orange and cyan neon strips",
  'neon-pairs': "Memory cards with glowing geometric backs on dark glass",
  'number-chase': "Wooden number tiles and a small chalkboard with chalk numerals",
  'paddle-wars': "Two table-tennis paddles facing each other with a white ball",
  'pixel-fleet': "Small toy wooden boats on a blue grid cloth",
  'pixel-pop-quiz': "Four coloured plastic quiz buzzers on a wooden table, no logo",
  'pixel-tac-toe': "Wooden tic-tac-toe board with turned X and O pieces",
  'pixel-tap': "Big blue arcade push button on a metal panel",
  'pong-rally': "Table-tennis paddles and orange ball on a blue table with a net",
  'reaction-rush': "Vintage stopwatch mid-run held in a hand",
  'retro-rewind': "Audio cassette and blank video tape with plain labels, no branding",
  'retro-trivia': "Vintage wood-cased television in a cosy room, no brand",
  'rock-paper-scissors': "Three hands showing rock, paper and scissors",
  'sea-battle': "Grey plastic peg board with toy ships and red and white pegs, no box art",
  'spacebar-showdown': "Macro of a mechanical keyboard spacebar with blank keycaps",
  'star-runner': "Wooden ball-maze labyrinth toy with a star hole",
  'turbo-charge': "Boost gauge on a car dashboard, needle high, no numbers",
  'word-scramble': "Wooden letter tiles scattered on a table, no brand, no board",
};

/**
 * One dedicated picture per game: `{ src, srcset, width, height, alt, focal, credit }`, built from the subject text in
 * GAME_PHOTOS. The files live in public/images/games/<id>.webp (1280x800) and <id>-640.webp.
 */
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

/** Picture, srcset and engine badge for a game card, lobby banner or game dialog. */
export function getGameArtwork(gameOrId) {
  const game = typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
  if (!game) return { ...CATEGORY_ARTWORK.Arcade, engineLabel: 'Arcade' };
  const engineLabel = ENGINE_LABELS[game.engine] || 'Arcade mode';
  const own = Object.hasOwn(GAME_ARTWORK, game.id) ? GAME_ARTWORK[game.id] : null;
  return { ...(own || CATEGORY_ARTWORK[game.category] || CATEGORY_ARTWORK.Arcade), engineLabel };
}

/**
 * How-to-play copy shown in the game stage and the game modal.
 *
 * Every line is derived from the same options the engine reads, so the instructions cannot drift
 * away from the rules: a game whose board size, lane count or tap tempo changes gets new copy the
 * same render. tests/catalog-integrity.test.js checks the resulting text against the options.
 */
export function getGameGuide(gameOrId) {
  const game = typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
  if (!game) return null;
  const opts = game.options || {};
  const pace = Number(opts.tapGapMs) || 0;

  switch (game.engine) {
    case 'line':
      return {
        mode: `${opts.size}×${opts.size} Tactical Grid`,
        goal: `Line up ${opts.connect} of your marks horizontally, vertically, or diagonally before your rivals.`,
        controls: 'Click or tap any empty grid cell when it is your turn.',
        rules: `2–3 players rotate turns on the shared board. Filling every cell without ${opts.connect} in a row results in a draw.`,
        shortcut: 'Tap / Click cell',
      };
    case 'drop':
      return {
        mode: `${opts.cols}×${opts.rows} Gravity Board`,
        goal: `Connect ${opts.connect} of your tokens in a row (horizontal, vertical, or diagonal).`,
        controls: 'Click or tap a column drop arrow (↓) at the top to drop a token into the lowest open slot.',
        rules: 'Players alternate turns. Full columns lock automatically.',
        shortcut: 'Tap / Click column ↓',
      };
    case 'memory':
      return {
        mode: `${opts.pairs} Pairs (${opts.pairs * 2} Cards)${opts.openPairs ? `, ${opts.openPairs} Started Face-up` : ''}`,
        goal: `Uncover and collect the most matching symbol pairs${opts.openPairs ? ` from the ${opts.pairs - opts.openPairs} pairs still in play` : ' by the time the deck is cleared'}.`,
        controls: 'Click or tap two face-down (?) cards on your turn to reveal them.',
        rules: opts.matchKeepsTurn === false
          ? 'Scoring a match awards +1 point, then the turn passes on. Mismatches also pass the turn. Highest pair count wins.'
          : 'Scoring a match awards +1 point and grants an immediate bonus turn! Mismatches pass the turn.',
        shortcut: 'Tap / Click 2 cards',
      };
    case 'race':
      return {
        mode: `First to ${opts.target} Boosts${pace ? ` (one accepted tap every ${pace} ms)` : ' (no tap limit)'}`,
        goal: `Sprint ahead of the lobby and be the first player to fill your meter to ${opts.target}.`,
        controls: 'Click or tap the BOOST button repeatedly, or press the Spacebar on your keyboard.',
        rules: pace
          ? `Real-time race with a tempo: taps closer together than ${pace} ms do not score, so a steady rhythm beats hammering.`
          : 'Simultaneous real-time race — no turns and no tempo limit on taps. Every tap adds +1 boost.',
        shortcut: 'Spacebar or Tap BOOST',
      };
    case 'rps':
      if (opts.mode === 'coin') {
        return {
          mode: `Coin Clash (first to ${opts.target})`,
          goal: `Be the first player to score ${opts.target} round points by calling the coin correctly.`,
          controls: 'Click or tap Heads or Tails to lock in your hidden call for the round.',
          rules: 'The flip is fixed for the round by the room, not per player. A sole correct caller scores +1; matching callers nobody scores.',
          shortcut: 'Tap Heads / Tails',
        };
      }
      if (opts.mode === 'dice') {
        return {
          mode: `High-Roll Duel (first to ${opts.target})`,
          goal: `Reach ${opts.target} points by locking in the highest die face in each showdown.`,
          controls: 'Click or tap a die value (1–6) to lock in your roll for the round.',
          rules: 'Picks reveal simultaneously. A sole highest roll scores +1; a tie scores nobody.',
          shortcut: 'Tap Roll 1–6',
        };
      }
      return {
        mode: `Hidden Picks (first to ${opts.target} rounds)`,
        goal: `Outread your opponents and be the first to win ${opts.target} rounds.`,
        controls: 'Click or tap Rock (✊), Paper (✋), or Scissors (✌) to lock in your hidden move.',
        rules: 'Rock beats Scissors, Scissors beats Paper, Paper beats Rock. Picks are revealed only when everyone has locked in.',
        shortcut: 'Tap Rock / Paper / Scissors',
      };
    case 'quiz': {
      const kindCopy = {
        emoji: 'Read the emoji clue, then pick the meaning that fits.',
        scramble: 'Each round shows scrambled letters — pick the word they spell.',
        riddle: 'Each round is a short riddle from this arcade’s own collection.',
        number: 'Each round is an arithmetic or sequence puzzle with numeric answers.',
        trivia: 'Each round is a multiple-choice question on the game’s own subject.',
      };
      return {
        mode: `${opts.rounds}-Round Quiz (its own ${opts.rounds >= 6 ? 'large' : 'curated'} question set)`,
        goal: `Score the most correct answers across ${opts.rounds} questions. Every round comes from this game's own bank, not a shared one.`,
        controls: 'Click or tap answer choice A, B, C, or D (or press 1–4 / A–D), then press Next question once everyone has answered.',
        rules: `${kindCopy[firstQuizKind(game.id)] || kindCopy.trivia} Everyone answers before the answers and scores are revealed; each correct pick is +1 point.`,
        shortcut: 'Tap A / B / C / D',
      };
    }
    case 'maze':
      return {
        mode: `${opts.width}×${opts.height} ${layoutLabel(opts.layout)}`,
        goal: 'Navigate around the walls and be the first player to tag the glowing star gate (✦).',
        controls: 'Use the on-screen directional buttons (↑ ← ↓ →) or your keyboard Arrow keys.',
        rules: 'Simultaneous movement — no turn waiting. Every starting tile can reach the star, and the step counter shows who took the shorter route.',
        shortcut: 'Arrow keys ↑ ← ↓ →',
      };
    case 'battle':
      return {
        mode: `${opts.board}×${opts.board} Radar, ${opts.fleet} Fleet Cells Each`,
        goal: `Find and hit all ${opts.fleet} hidden fleet cells on every rival's radar before they clear yours.`,
        controls: 'Select a rival under FIRE AT, then click or tap an untargeted radar square on your turn.',
        rules: 'Turns rotate after each shot. Hits (✹) and misses (·) are published by the server; only you can see your own fleet on the "Your waters" map.',
        shortcut: 'Select target + Tap cell',
      };
    case 'rally':
      return {
        mode: `Court Rally, ${opts.lanes} Lanes (first to ${opts.target})`,
        goal: `Trade clean volleys and be the first player to reach ${opts.target} points.`,
        controls: `On your turn, click or tap one of the ${opts.lanes} return lanes (keys 1–${opts.lanes}).`,
        rules: `Every volley scores the returning player a point, so the rally alternates. More lanes means more guessing for your rival.`,
        shortcut: 'Tap lane buttons',
      };
    case 'code':
      return {
        mode: `${opts.digits}-Digit Cipher, digits 0–${opts.symbols - 1} (${opts.maxGuesses} Max Guesses)`,
        goal: `Crack the secret ${opts.digits}-digit code before the ${opts.maxGuesses}-guess limit runs out.`,
        controls: `Click or tap each digit slot to cycle 0–${opts.symbols - 1}, then press Try code on your turn.`,
        rules: 'EXACT = right digit in the right position; NEAR = right digit in a different position. The code is only revealed once the round is over.',
        shortcut: `Cycle digits 0–${opts.symbols - 1} + Try code`,
      };
    default:
      return {
        mode: 'Arcade Match',
        goal: game.blurb,
        controls: 'Use the on-screen controls to make your move.',
        rules: 'Follow the turn indicator at the top of the stage.',
        shortcut: 'Tap / Click',
      };
  }
}

/** The question kind of a quiz game, read from the shipped warm-up bank (first item). */
function firstQuizKind(gameId) {
  return practiceBankFor(gameId)[0]?.kind || 'trivia';
}

/** A human name for a maze layout option. */
function layoutLabel(layout) {
  return { classic: 'Classic Hedge Maze', spiral: 'Spiral Labyrinth', pillars: 'Pillar Circuit', zigzag: 'Zigzag Run' }[layout] || 'Labyrinth Race';
}
