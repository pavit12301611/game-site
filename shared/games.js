/**
 * The game catalog data: one entry per playable game, shared by the browser app and the trusted
 * backend (Cloud Functions) so both sides validate the same catalog.
 *
 * This module is deliberately free of anything browser-facing (no artwork paths, no DOM, no
 * imports), which is why it lives outside src/: Cloud Functions load shared/games.js to check that
 * a requested game id exists and to read the rule options that a room was created with.
 *
 * Every entry must describe what the game actually does:
 *
 *   engine     which rule set plays it (see shared/engines/*)
 *   options    the rule knobs that engine reads — two games sharing an engine must differ in at
 *              least one option that changes how the game feels, not only in its title
 *   blurb      one sentence shown on the card, and it must match the engine's real behaviour
 *   duration   rough time for one full round, used by the library filters
 *   difficulty Easy | Medium | Tricky — how much thinking one turn needs
 *   input      Tap | Keys | Tap or keys — how you actually play it
 *
 * `src/catalog.js` adds the artwork and the how-to-play copy on top of this list, and
 * `tests/catalog-integrity.test.js` checks the promises above (distinct options per variant,
 * honest blurbs, quiz banks that are big enough for the rounds they deal).
 */

/** @typedef {'Arcade'|'Party'|'Strategy'|'Puzzle'} Category */
/** @typedef {'Easy'|'Medium'|'Tricky'} Difficulty */
/** @typedef {'Tap'|'Keys'|'Tap or keys'} InputStyle */
/**
 * @typedef {object} Game
 * @property {string} id
 * @property {string} title
 * @property {Category} category
 * @property {string} engine
 * @property {string} icon
 * @property {string} accent
 * @property {string} blurb
 * @property {Record<string, any>} options
 * @property {string} duration
 * @property {Difficulty} difficulty
 * @property {InputStyle} input
 */

export const CATEGORIES = ['All games', 'Arcade', 'Party', 'Strategy', 'Puzzle'];

/** @type {Game[]} */
export const GAMES = [
  // ── Grid tactics ────────────────────────────────────────────────────────────────────────────────
  { id: 'pixel-tac-toe', title: 'Pixel Tic-Tac-Toe', category: 'Strategy', engine: 'line', icon: '✕', accent: 'blue', blurb: 'The three-by-three classic, with a third seat on the board.', options: { size: 3, connect: 3 }, duration: '2 min', difficulty: 'Easy', input: 'Tap' },
  { id: 'neon-gomoku', title: 'Neon Gomoku', category: 'Strategy', engine: 'line', icon: '◎', accent: 'violet', blurb: 'A nine-by-nine board where the first five in a row takes it.', options: { size: 9, connect: 5 }, duration: '8 min', difficulty: 'Tricky', input: 'Tap' },

  // ── Drop boards ─────────────────────────────────────────────────────────────────────────────────
  { id: 'connect-four', title: 'Connect Four', category: 'Strategy', engine: 'drop', icon: '●', accent: 'orange', blurb: 'Drop a disc, block a friend, and line up four in a row.', options: { cols: 7, rows: 6, connect: 4 }, duration: '5 min', difficulty: 'Medium', input: 'Tap' },
  { id: 'five-in-row', title: 'Five in a Row', category: 'Strategy', engine: 'drop', icon: '▦', accent: 'pink', blurb: 'A taller, wider drop board where the goal is five in a row.', options: { cols: 8, rows: 7, connect: 5 }, duration: '10 min', difficulty: 'Tricky', input: 'Tap' },

  // ── Memory decks ────────────────────────────────────────────────────────────────────────────────
  { id: 'memory-match', title: 'Memory Match', category: 'Puzzle', engine: 'memory', icon: '▧', accent: 'cyan', blurb: 'Flip two cards at a time; a match scores and keeps your turn.', options: { pairs: 6, openPairs: 0, matchKeepsTurn: true }, duration: '4 min', difficulty: 'Easy', input: 'Tap' },
  { id: 'neon-pairs', title: 'Neon Pairs', category: 'Puzzle', engine: 'memory', icon: '✦', accent: 'violet', blurb: 'Eight pairs on one board — twice the deck, twice the remembering.', options: { pairs: 8, openPairs: 0, matchKeepsTurn: true }, duration: '6 min', difficulty: 'Medium', input: 'Tap' },
  { id: 'emoji-flip', title: 'Emoji Flip', category: 'Party', engine: 'memory', icon: '☺', accent: 'pink', blurb: 'Two pairs start face-up and every match passes the turn on — quick, noisy rounds.', options: { pairs: 6, openPairs: 2, matchKeepsTurn: false }, duration: '3 min', difficulty: 'Easy', input: 'Tap' },
  { id: 'arcade-pairs', title: 'Arcade Pairs', category: 'Puzzle', engine: 'memory', icon: '▣', accent: 'orange', blurb: 'Eight pairs with one already turned over, built for three players.', options: { pairs: 8, openPairs: 1, matchKeepsTurn: true }, duration: '7 min', difficulty: 'Medium', input: 'Tap' },

  // ── Tap races (a shorter tap gap means the game plays faster) ───────────────────────────────────
  { id: 'pixel-tap', title: 'Pixel Tap Sprint', category: 'Arcade', engine: 'race', icon: '↗', accent: 'blue', blurb: 'A flat-out sprint: 16 taps, no measured tempo, fastest fingers win.', options: { target: 16, tapGapMs: 0 }, duration: '1 min', difficulty: 'Easy', input: 'Tap or keys' },
  { id: 'button-masher', title: 'Button Masher', category: 'Party', engine: 'race', icon: '⌁', accent: 'orange', blurb: 'Twenty taps at a brisk 90 ms pace — mash, but the game makes you keep rhythm.', options: { target: 20, tapGapMs: 90 }, duration: '1 min', difficulty: 'Easy', input: 'Tap or keys' },
  { id: 'turbo-charge', title: 'Turbo Charge', category: 'Arcade', engine: 'race', icon: 'ϟ', accent: 'cyan', blurb: 'A steadier race: 18 charge taps accepted at one every 140 ms.', options: { target: 18, tapGapMs: 140 }, duration: '2 min', difficulty: 'Easy', input: 'Tap or keys' },
  { id: 'reaction-rush', title: 'Reaction Rush', category: 'Party', engine: 'race', icon: '◉', accent: 'pink', blurb: 'A short, sharp burst: reach 12 points with only 60 ms between accepted taps.', options: { target: 12, tapGapMs: 60 }, duration: '1 min', difficulty: 'Easy', input: 'Tap or keys' },
  { id: 'spacebar-showdown', title: 'Spacebar Showdown', category: 'Arcade', engine: 'race', icon: '▱', accent: 'violet', blurb: 'Twenty-two spacebar hits at a 110 ms tempo, so spamming faster does not help.', options: { target: 22, tapGapMs: 110 }, duration: '2 min', difficulty: 'Easy', input: 'Keys' },
  { id: 'bug-blaster', title: 'Bug Blaster', category: 'Arcade', engine: 'race', icon: '✣', accent: 'green', blurb: 'A calm zap-along: 18 hits, one accepted every 250 ms.', options: { target: 18, tapGapMs: 250 }, duration: '3 min', difficulty: 'Easy', input: 'Tap or keys' },

  // ── Simultaneous duels ──────────────────────────────────────────────────────────────────────────
  { id: 'rock-paper-scissors', title: 'Rock Paper Scissors', category: 'Party', engine: 'rps', icon: '✊', accent: 'orange', blurb: 'Hidden picks revealed together; first to three rounds wins.', options: { target: 3, mode: 'rps' }, duration: '2 min', difficulty: 'Easy', input: 'Tap' },
  { id: 'laser-duel', title: 'Laser Duel', category: 'Arcade', engine: 'rps', icon: '⌁', accent: 'pink', blurb: 'The same hidden picks, but a longer best-of series — five rounds to win.', options: { target: 5, mode: 'rps' }, duration: '4 min', difficulty: 'Medium', input: 'Tap' },
  { id: 'coin-flip-clash', title: 'Coin Flip Clash', category: 'Party', engine: 'rps', icon: '◉', accent: 'gold', blurb: 'Call heads or tails in secret; the flip is fixed per round, not per player.', options: { target: 3, mode: 'coin' }, duration: '2 min', difficulty: 'Easy', input: 'Tap' },
  { id: 'dice-duel', title: 'Dice Duel', category: 'Party', engine: 'rps', icon: '⚄', accent: 'cyan', blurb: 'Lock in a die face and hope it is the highest; four wins takes the duel.', options: { target: 4, mode: 'dice' }, duration: '3 min', difficulty: 'Easy', input: 'Tap' },

  // ── Quiz rounds (every one draws from its own curated bank) ─────────────────────────────────────
  { id: 'retro-trivia', title: 'Retro Trivia', category: 'Party', engine: 'quiz', icon: '?', accent: 'violet', blurb: 'Five arcade-history questions before the reveal.', options: { rounds: 5 }, duration: '4 min', difficulty: 'Medium', input: 'Tap' },
  { id: 'emoji-decode', title: 'Emoji Decode', category: 'Party', engine: 'quiz', icon: '☺', accent: 'pink', blurb: 'Read an emoji clue and decode what it means before anyone else.', options: { rounds: 5 }, duration: '4 min', difficulty: 'Easy', input: 'Tap' },
  { id: 'arcade-facts', title: 'Arcade Facts', category: 'Puzzle', engine: 'quiz', icon: '▣', accent: 'cyan', blurb: 'How the old cabinets actually worked: sprites, hitboxes and ROMs.', options: { rounds: 5 }, duration: '5 min', difficulty: 'Tricky', input: 'Tap' },
  { id: 'pixel-pop-quiz', title: 'Pixel Pop Quiz', category: 'Party', engine: 'quiz', icon: '✦', accent: 'orange', blurb: 'Five questions about the words gamers actually use.', options: { rounds: 5 }, duration: '4 min', difficulty: 'Easy', input: 'Tap' },
  { id: 'movie-mayhem', title: 'Movie Mayhem', category: 'Party', engine: 'quiz', icon: '▶', accent: 'pink', blurb: 'Five questions about how films get made, from clapperboard to score.', options: { rounds: 5 }, duration: '4 min', difficulty: 'Medium', input: 'Tap' },
  { id: 'word-scramble', title: 'Word Scramble', category: 'Puzzle', engine: 'quiz', icon: 'Aa', accent: 'green', blurb: 'Every round shows a scrambled arcade word — six rounds, no repeats.', options: { rounds: 6 }, duration: '5 min', difficulty: 'Medium', input: 'Tap' },
  { id: 'number-chase', title: 'Number Chase', category: 'Puzzle', engine: 'quiz', icon: '#', accent: 'blue', blurb: 'Six arithmetic and sequence puzzles with numeric answers.', options: { rounds: 6 }, duration: '5 min', difficulty: 'Medium', input: 'Tap' },
  { id: 'brain-busters', title: 'Brain Busters', category: 'Puzzle', engine: 'quiz', icon: '⌘', accent: 'violet', blurb: 'Five short riddles, written for this arcade, with no wordplay traps.', options: { rounds: 5 }, duration: '4 min', difficulty: 'Tricky', input: 'Tap' },
  { id: 'eight-bit-riddles', title: '8-Bit Riddles', category: 'Puzzle', engine: 'quiz', icon: '◈', accent: 'cyan', blurb: 'Bits, bytes and binary — five puzzles in machine arithmetic.', options: { rounds: 5 }, duration: '5 min', difficulty: 'Tricky', input: 'Tap' },
  { id: 'retro-rewind', title: 'Retro Rewind', category: 'Party', engine: 'quiz', icon: '↶', accent: 'gold', blurb: 'Five questions looking back at the decades that made the arcade.', options: { rounds: 5 }, duration: '4 min', difficulty: 'Medium', input: 'Tap' },

  // ── Maze races (a different wall layout each time, not a different label) ───────────────────────
  { id: 'maze-runner', title: 'Maze Runner', category: 'Arcade', engine: 'maze', icon: '⌗', accent: 'green', blurb: 'A seven-by-seven hedge maze; everyone moves at once towards the star.', options: { width: 7, height: 7, layout: 'classic' }, duration: '2 min', difficulty: 'Easy', input: 'Keys' },
  { id: 'neon-labyrinth', title: 'Neon Labyrinth', category: 'Puzzle', engine: 'maze', icon: '╳', accent: 'violet', blurb: 'A spiral of neon walls that keeps pulling you off the straight line.', options: { width: 7, height: 7, layout: 'spiral' }, duration: '3 min', difficulty: 'Medium', input: 'Keys' },
  { id: 'byte-escape', title: 'Byte Escape', category: 'Arcade', engine: 'maze', icon: '↗', accent: 'cyan', blurb: 'A circuit-board pillar maze: short diagonal routes past regular blocks.', options: { width: 7, height: 7, layout: 'pillars' }, duration: '3 min', difficulty: 'Medium', input: 'Keys' },
  { id: 'star-runner', title: 'Star Runner', category: 'Arcade', engine: 'maze', icon: '✦', accent: 'gold', blurb: 'A bigger nine-by-nine zigzag maze for longer escape runs.', options: { width: 9, height: 9, layout: 'zigzag' }, duration: '5 min', difficulty: 'Tricky', input: 'Keys' },

  // ── Fleet radar ─────────────────────────────────────────────────────────────────────────────────
  { id: 'sea-battle', title: 'Sea Battle', category: 'Strategy', engine: 'battle', icon: '▤', accent: 'blue', blurb: 'A six-by-six radar with four hidden cells per player.', options: { board: 6, fleet: 4 }, duration: '6 min', difficulty: 'Medium', input: 'Tap' },
  { id: 'pixel-fleet', title: 'Pixel Fleet', category: 'Strategy', engine: 'battle', icon: '▥', accent: 'cyan', blurb: 'A smaller five-by-five radar with three hidden cells — a quick hunt.', options: { board: 5, fleet: 3 }, duration: '4 min', difficulty: 'Easy', input: 'Tap' },
  { id: 'alien-skirmish', title: 'Alien Skirmish', category: 'Arcade', engine: 'battle', icon: '✣', accent: 'green', blurb: 'A seven-by-seven sweep with five dispersed targets to clear.', options: { board: 7, fleet: 5 }, duration: '9 min', difficulty: 'Tricky', input: 'Tap' },

  // ── Court volleys (more lanes means more guessing) ──────────────────────────────────────────────
  { id: 'pong-rally', title: 'Pong Rally', category: 'Arcade', engine: 'rally', icon: '▰', accent: 'cyan', blurb: 'Three return lanes on your turn; first to seven clean volleys wins.', options: { target: 7, lanes: 3 }, duration: '4 min', difficulty: 'Easy', input: 'Tap or keys' },
  { id: 'paddle-wars', title: 'Paddle Wars', category: 'Party', engine: 'rally', icon: '▱', accent: 'pink', blurb: 'Two lanes and five points — a short, read-your-rival duel.', options: { target: 5, lanes: 2 }, duration: '3 min', difficulty: 'Easy', input: 'Tap or keys' },
  { id: 'air-hockey', title: 'Air Hockey', category: 'Party', engine: 'rally', icon: '◉', accent: 'blue', blurb: 'Five lanes and a nine-point table: the longest volley game in the arcade.', options: { target: 9, lanes: 5 }, duration: '8 min', difficulty: 'Medium', input: 'Tap or keys' },

  // ── Cipher logic (digits and the size of the digit alphabet both change) ────────────────────────
  { id: 'codebreaker', title: 'Codebreaker', category: 'Puzzle', engine: 'code', icon: '⌗', accent: 'green', blurb: 'Break a four-digit code from 0–5 in ten turned-based guesses.', options: { digits: 4, maxGuesses: 10, symbols: 6 }, duration: '6 min', difficulty: 'Medium', input: 'Tap' },
  { id: 'mastermind', title: 'Mastermind', category: 'Puzzle', engine: 'code', icon: '▦', accent: 'violet', blurb: 'Five digits, but only four choices each and eight guesses — fewer options, tighter clues.', options: { digits: 5, maxGuesses: 8, symbols: 4 }, duration: '8 min', difficulty: 'Tricky', input: 'Tap' },
];

/** @param {string} gameId @returns {Game | null} */
export function getGame(gameId) {
  return GAMES.find((game) => game.id === gameId) ?? null;
}

/** @param {string} gameId @returns {string} the engine that plays this game, or '' when unknown. */
export function engineForGame(gameId) {
  return getGame(gameId)?.engine ?? '';
}

/** Every engine id used by the catalog, in first-appearance order. */
export function catalogEngineIds() {
  return [...new Set(GAMES.map((game) => game.engine))];
}

/** Every filter value the library offers, derived from the catalog rather than hard-coded. */
export const FILTERS = Object.freeze({
  players: Object.freeze([2, 3]),
  durations: Object.freeze([...new Set(GAMES.map((game) => game.duration))]),
  difficulties: Object.freeze([...new Set(GAMES.map((game) => game.difficulty))]),
  inputs: Object.freeze([...new Set(GAMES.map((game) => game.input))]),
});
