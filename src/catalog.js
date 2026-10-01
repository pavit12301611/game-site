/**
 * The game catalog: the list of playable games plus the artwork and how-to-play copy for each.
 *
 * *Game rules live in src/engines/*.js.* This file only describes the games; `createInitialGameState`
 * and `applyGameAction` are re-exported from the engine registry so callers (src/main.js, tests)
 * keep one stable import for the whole game API.
 */
import {
  applyGameAction as applyEngineAction,
  createInitialGameState as createInitialEngineState,
  engineIds,
} from './engines/index.js';
import { memoryCardIcon } from './engines/memory.js';
import { QUIZ_QUESTIONS, getQuizQuestion } from './engines/quiz.js';

/** @typedef {import('./types.js').Game} Game */
/** @typedef {import('./types.js').Player} Player */
/** @typedef {import('./types.js').GameState} GameState */
/** @typedef {import('./types.js').Action} Action */

export const CATEGORIES = ['All games', 'Arcade', 'Party', 'Strategy', 'Puzzle'];

export const GAMES = [
  { id: 'pixel-tac-toe', title: 'Pixel Tic-Tac-Toe', category: 'Strategy', engine: 'line', icon: '✕', accent: 'blue', blurb: 'The tiny-board classic, now with a third seat.', options: { size: 3, connect: 3 } },
  { id: 'neon-gomoku', title: 'Neon Gomoku', category: 'Strategy', engine: 'line', icon: '◎', accent: 'violet', blurb: 'Line up five on a glowing big board.', options: { size: 9, connect: 5 } },
  { id: 'connect-four', title: 'Connect Four', category: 'Strategy', engine: 'drop', icon: '●', accent: 'orange', blurb: 'Drop a disc. Block a friend. Make four.', options: { cols: 7, rows: 6, connect: 4 } },
  { id: 'five-in-row', title: 'Five in a Row', category: 'Strategy', engine: 'drop', icon: '▦', accent: 'pink', blurb: 'A roomier drop-board with a five-piece goal.', options: { cols: 8, rows: 7, connect: 5 } },
  { id: 'memory-match', title: 'Memory Match', category: 'Puzzle', engine: 'memory', icon: '▧', accent: 'cyan', blurb: 'Flip, remember, and claim the most pairs.', options: { pairs: 6 } },
  { id: 'neon-pairs', title: 'Neon Pairs', category: 'Puzzle', engine: 'memory', icon: '✦', accent: 'violet', blurb: 'A bright, quick-fire test of your memory.', options: { pairs: 8 } },
  { id: 'emoji-flip', title: 'Emoji Flip', category: 'Party', engine: 'memory', icon: '☺', accent: 'pink', blurb: 'Find the matching faces before your friends.', options: { pairs: 6 } },
  { id: 'arcade-pairs', title: 'Arcade Pairs', category: 'Puzzle', engine: 'memory', icon: '▣', accent: 'orange', blurb: 'Collect pixel pairs in a three-player shuffle.', options: { pairs: 8 } },
  { id: 'pixel-tap', title: 'Pixel Tap Sprint', category: 'Arcade', engine: 'race', icon: '↗', accent: 'blue', blurb: 'Mash the boost button. First to the finish wins.', options: { target: 16 } },
  { id: 'button-masher', title: 'Button Masher', category: 'Party', engine: 'race', icon: '⌁', accent: 'orange', blurb: 'A no-mercy button race for up to three players.', options: { target: 20 } },
  { id: 'turbo-charge', title: 'Turbo Charge', category: 'Arcade', engine: 'race', icon: 'ϟ', accent: 'cyan', blurb: 'Build a charge bar with every well-timed tap.', options: { target: 18 } },
  { id: 'reaction-rush', title: 'Reaction Rush', category: 'Party', engine: 'race', icon: '◉', accent: 'pink', blurb: 'Race your friends to a full combo.', options: { target: 15 } },
  { id: 'spacebar-showdown', title: 'Spacebar Showdown', category: 'Arcade', engine: 'race', icon: '▱', accent: 'violet', blurb: 'One key, one goal: out-click the whole lobby.', options: { target: 22 } },
  { id: 'bug-blaster', title: 'Bug Blaster', category: 'Arcade', engine: 'race', icon: '✣', accent: 'green', blurb: 'Zap the score meter before the timer runs out.', options: { target: 18 } },
  { id: 'rock-paper-scissors', title: 'Rock Paper Scissors', category: 'Party', engine: 'rps', icon: '✊', accent: 'orange', blurb: 'The timeless three-way showdown, best of five.', options: { target: 3, mode: 'rps' } },
  { id: 'laser-duel', title: 'Laser Duel', category: 'Arcade', engine: 'rps', icon: '⌁', accent: 'pink', blurb: 'Read the room and land a winning beam.', options: { target: 3, mode: 'rps' } },
  { id: 'coin-flip-clash', title: 'Coin Flip Clash', category: 'Party', engine: 'rps', icon: '◉', accent: 'gold', blurb: 'Call your side, then see who got lucky.', options: { target: 3, mode: 'coin' } },
  { id: 'dice-duel', title: 'Dice Duel', category: 'Party', engine: 'rps', icon: '⚄', accent: 'cyan', blurb: 'Roll high, talk big, and take the round.', options: { target: 3, mode: 'dice' } },
  { id: 'retro-trivia', title: 'Retro Trivia', category: 'Party', engine: 'quiz', icon: '?', accent: 'violet', blurb: 'Arcade-flavoured questions for the whole crew.', options: { rounds: 5 } },
  { id: 'emoji-decode', title: 'Emoji Decode', category: 'Party', engine: 'quiz', icon: '☺', accent: 'pink', blurb: 'Decode the clue before another player does.', options: { rounds: 5 } },
  { id: 'arcade-facts', title: 'Arcade Facts', category: 'Puzzle', engine: 'quiz', icon: '▣', accent: 'cyan', blurb: 'Put your old-school game knowledge to work.', options: { rounds: 5 } },
  { id: 'pixel-pop-quiz', title: 'Pixel Pop Quiz', category: 'Party', engine: 'quiz', icon: '✦', accent: 'orange', blurb: 'Five quick questions. One very smug winner.', options: { rounds: 5 } },
  { id: 'movie-mayhem', title: 'Movie Mayhem', category: 'Party', engine: 'quiz', icon: '▶', accent: 'pink', blurb: 'Guess the big-screen classics from a tiny clue.', options: { rounds: 5 } },
  { id: 'word-scramble', title: 'Word Scramble', category: 'Puzzle', engine: 'quiz', icon: 'Aa', accent: 'green', blurb: 'Pick the right word before the round moves on.', options: { rounds: 5 } },
  { id: 'number-chase', title: 'Number Chase', category: 'Puzzle', engine: 'quiz', icon: '#', accent: 'blue', blurb: 'Quick logic questions, no calculator needed.', options: { rounds: 5 } },
  { id: 'brain-busters', title: 'Brain Busters', category: 'Puzzle', engine: 'quiz', icon: '⌘', accent: 'violet', blurb: 'Short riddles for long-running rivalries.', options: { rounds: 5 } },
  { id: 'eight-bit-riddles', title: '8-Bit Riddles', category: 'Puzzle', engine: 'quiz', icon: '◈', accent: 'cyan', blurb: 'A few pixel-sized clues with big-brain answers.', options: { rounds: 5 } },
  { id: 'retro-rewind', title: 'Retro Rewind', category: 'Party', engine: 'quiz', icon: '↶', accent: 'gold', blurb: 'A nostalgic quiz night in five fast rounds.', options: { rounds: 5 } },
  { id: 'maze-runner', title: 'Maze Runner', category: 'Arcade', engine: 'maze', icon: '⌗', accent: 'green', blurb: 'Find the exit first in a shared little maze.', options: { width: 7, height: 7 } },
  { id: 'neon-labyrinth', title: 'Neon Labyrinth', category: 'Puzzle', engine: 'maze', icon: '╳', accent: 'violet', blurb: 'Take the clean route through the glowing grid.', options: { width: 7, height: 7 } },
  { id: 'byte-escape', title: 'Byte Escape', category: 'Arcade', engine: 'maze', icon: '↗', accent: 'cyan', blurb: 'A tiny escape race that fits in a browser tab.', options: { width: 7, height: 7 } },
  { id: 'star-runner', title: 'Star Runner', category: 'Arcade', engine: 'maze', icon: '✦', accent: 'gold', blurb: 'Dash between the blocks and tag the star gate.', options: { width: 7, height: 7 } },
  { id: 'sea-battle', title: 'Sea Battle', category: 'Strategy', engine: 'battle', icon: '▤', accent: 'blue', blurb: 'Take turns calling shots on your rivals’ fleets.', options: { board: 6, fleet: 4 } },
  { id: 'pixel-fleet', title: 'Pixel Fleet', category: 'Strategy', engine: 'battle', icon: '▥', accent: 'cyan', blurb: 'A compact, turn-based fleet hunt for 2–3.', options: { board: 6, fleet: 4 } },
  { id: 'alien-skirmish', title: 'Alien Skirmish', category: 'Arcade', engine: 'battle', icon: '✣', accent: 'green', blurb: 'Scout, aim, and clear every rival’s pixel base.', options: { board: 6, fleet: 4 } },
  { id: 'pong-rally', title: 'Pong Rally', category: 'Arcade', engine: 'rally', icon: '▰', accent: 'cyan', blurb: 'Trade volleys and be first to seven clean hits.', options: { target: 7 } },
  { id: 'paddle-wars', title: 'Paddle Wars', category: 'Party', engine: 'rally', icon: '▱', accent: 'pink', blurb: 'Choose a lane, return the volley, win the rally.', options: { target: 7 } },
  { id: 'air-hockey', title: 'Air Hockey', category: 'Party', engine: 'rally', icon: '◉', accent: 'blue', blurb: 'A turn-by-turn table duel with a quick puck.', options: { target: 7 } },
  { id: 'codebreaker', title: 'Codebreaker', category: 'Puzzle', engine: 'code', icon: '⌗', accent: 'green', blurb: 'Crack the hidden four-digit sequence in turns.', options: { digits: 4, maxGuesses: 10 } },
  { id: 'mastermind', title: 'Mastermind', category: 'Puzzle', engine: 'code', icon: '▦', accent: 'violet', blurb: 'Read the hints, beat the clock, break the code.', options: { digits: 4, maxGuesses: 10 } },
];

/** @param {string} gameId @returns {Game | null} */
export function getGame(gameId) {
  return GAMES.find((game) => game.id === gameId) ?? null;
}

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

export { engineIds, QUIZ_QUESTIONS, getQuizQuestion };

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

/** How-to-play copy shown in the game stage and the game modal. */
export function getGameGuide(gameOrId) {
  const game = typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
  if (!game) return null;
  const opts = game.options || {};

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
        mode: `${opts.pairs} Pairs (${opts.pairs * 2} Cards)`,
        goal: 'Uncover and collect the most matching symbol pairs by the time the deck is cleared.',
        controls: 'Click or tap two face-down (?) cards on your turn to reveal them.',
        rules: 'Scoring a match awards +1 point and grants an immediate bonus turn! Mismatches pass the turn.',
        shortcut: 'Tap / Click 2 cards',
      };
    case 'race':
      return {
        mode: `First to ${opts.target} Boosts`,
        goal: `Sprint ahead of the lobby and be the first player to fill your meter to ${opts.target}.`,
        controls: 'Click or tap the BOOST button rapidly, or press the Spacebar on your keyboard.',
        rules: 'Simultaneous real-time race—no turns! Every tap adds +1 boost to your lane.',
        shortcut: 'Spacebar or Tap BOOST',
      };
    case 'rps':
      if (opts.mode === 'coin') {
        return {
          mode: `Best-of Coin Clash (First to ${opts.target})`,
          goal: `Be the first player to score ${opts.target} round points by calling the coin flip.`,
          controls: 'Click or tap Heads or Tails to lock in your secret call for the round.',
          rules: 'Reveals once all players lock in. A sole correct caller wins +1 point for the round.',
          shortcut: 'Tap Heads / Tails',
        };
      }
      if (opts.mode === 'dice') {
        return {
          mode: `High-Roll Duel (First to ${opts.target})`,
          goal: `Reach ${opts.target} points by locking in the highest die face in each showdown.`,
          controls: 'Click or tap a die value (1–6) to lock in your roll for the round.',
          rules: 'Choices reveal simultaneously once everyone locks in. An uncontested high roll scores +1 point.',
          shortcut: 'Tap Roll 1–6',
        };
      }
      return {
        mode: `Simultaneous Duel (First to ${opts.target})`,
        goal: `Outread your opponents and be the first to win ${opts.target} rounds.`,
        controls: 'Click or tap Rock (✊), Paper (✋), or Scissors (✌) to lock in your hidden move.',
        rules: 'Rock beats Scissors, Scissors beats Paper, Paper beats Rock. Reveals when all players lock in.',
        shortcut: 'Tap Rock / Paper / Scissors',
      };
    case 'quiz':
      return {
        mode: `${opts.rounds}-Round Trivia Showdown`,
        goal: `Score the most correct answers across ${opts.rounds} fast-paced questions.`,
        controls: 'Click or tap answer choice A, B, C, or D, then press Next question once all answers reveal.',
        rules: 'Everyone answers each question before results reveal. Each correct pick earns +1 point.',
        shortcut: 'Tap A / B / C / D',
      };
    case 'maze':
      return {
        mode: `${opts.width}×${opts.height} Labyrinth Race`,
        goal: 'Navigate around the walls and be the first player to tag the glowing star gate (✦).',
        controls: 'Use the on-screen directional buttons (↑ ← ↓ →) or your keyboard Arrow keys.',
        rules: 'Simultaneous movement—no turn waiting! Dark tiles are solid walls.',
        shortcut: 'Arrow keys ↑ ← ↓ →',
      };
    case 'battle':
      return {
        mode: `${opts.board}×${opts.board} Radar (${opts.fleet} Fleet Units)`,
        goal: `Locate and sink all ${opts.fleet} hidden fleet cells on every rival's radar grid.`,
        controls: 'Select a rival under FIRE AT, then click or tap an untargeted radar square on your turn.',
        rules: 'Turns rotate after each shot. Direct hits mark ✹ and misses mark ·.',
        shortcut: 'Select target + Tap cell',
      };
    case 'rally':
      return {
        mode: `Court Rally (First to ${opts.target})`,
        goal: `Trade clean volleys and be the first player to reach ${opts.target} points.`,
        controls: 'On your turn, click or tap UP (↗), CENTER (→), or DOWN (↘) to return the puck.',
        rules: 'Players alternate volleys in turn order until one player hits the target score.',
        shortcut: 'Tap UP / CENTER / DOWN',
      };
    case 'code':
      return {
        mode: `${opts.digits}-Digit Cipher (${opts.maxGuesses} Max Guesses)`,
        goal: `Crack the secret ${opts.digits}-digit code (digits 0–5) before the ${opts.maxGuesses}-guess limit runs out.`,
        controls: 'Click or tap each digit slot to cycle 0–5, then press Try code on your turn.',
        rules: 'EXACT = right digit in the right position; NEAR = right digit in a different position.',
        shortcut: 'Cycle digits 0–5 + Try code',
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
