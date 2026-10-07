/**
 * Quiz question banks: one bank per quiz game, shared between browser and backend.
 *
 * Each bank is an array of { question, options, answer, kind } objects.
 * `kind` is one of: emoji, scramble, trivia, riddle, number.
 * The backend can deal from these banks without ever sending them to the browser.
 */

const banks = {
  'retro-trivia': [
    { question: 'What year was Pong first released?', options: ['1972', '1975', '1978', '1980'], answer: 0, kind: 'trivia' },
    { question: 'Which company created the Game Boy?', options: ['Sega', 'Nintendo', 'Atari', 'Sony'], answer: 1, kind: 'trivia' },
    { question: 'What is the highest score possible in a single game of Pac-Man?', options: ['3,333,360', '1,000,000', '999,999', '5,000,000'], answer: 0, kind: 'trivia' },
    { question: 'Which arcade game popularized the term "high score"?', options: ['Space Invaders', 'Asteroids', 'Pong', 'Donkey Kong'], answer: 0, kind: 'trivia' },
    { question: 'What does the "8-bit" in retro gaming refer to?', options: ['Screen resolution', 'Processor data width', 'Number of colours', 'Sound channels'], answer: 1, kind: 'trivia' },
    { question: 'Which console introduced cartridges to home gaming?', options: ['Atari 2600', 'NES', 'ColecoVision', 'Intellivision'], answer: 0, kind: 'trivia' },
    { question: 'What was Mario originally called?', options: ['Jumpman', 'Plumber Pete', 'Stomper', 'Block Man'], answer: 0, kind: 'trivia' },
  ],

  'emoji-decode': [
    { question: '🎮🕹️👾 = ?', options: ['Arcade gaming', 'Alien invasion', 'Retro controller', 'Game shop'], answer: 0, kind: 'emoji' },
    { question: '🧩🧠💡 = ?', options: ['Lightbulb moment', 'Puzzle solved', 'Brain teaser', 'Eureka!'], answer: 2, kind: 'emoji' },
    { question: '🚀🌌⭐ = ?', options: ['Space adventure', 'Star runner', 'Galaxy quest', 'Night sky'], answer: 0, kind: 'emoji' },
    { question: '🎯🏹🏆 = ?', options: ['Competition', 'Archery contest', 'Bullseye champion', 'Target practice'], answer: 2, kind: 'emoji' },
    { question: '🔑🗝️🚪 = ?', options: ['Secret room', 'Key to success', 'Mystery unlock', 'Open door'], answer: 0, kind: 'emoji' },
    { question: '⚡🕹️🏅 = ?', options: ['Power play', 'Arcade champion', 'Electric game', 'Speed run'], answer: 1, kind: 'emoji' },
    { question: '🌊🏄🦈 = ?', options: ['Shark attack', 'Ocean race', 'Surf challenge', 'Beach party'], answer: 2, kind: 'emoji' },
  ],

  'arcade-facts': [
    { question: 'What is a "sprite" in retro gaming?', options: ['A ghost character', 'A 2D image that can move', 'A type of power-up', 'A game cartridge chip'], answer: 1, kind: 'trivia' },
    { question: 'What does ROM stand for?', options: ['Read-Only Memory', 'Random Output Module', 'Retro Operating Machine', 'Raster Object Map'], answer: 0, kind: 'trivia' },
    { question: 'What is a "hitbox" in game design?', options: ['A cheat code', 'An invisible collision area', 'A scoring mechanism', 'A type of enemy'], answer: 1, kind: 'trivia' },
    { question: 'Which resolution is standard for classic 8-bit consoles?', options: ['256×224', '640×480', '1920×1080', '320×240'], answer: 0, kind: 'trivia' },
    { question: 'What is "pixel art" rendering called when scaled up?', options: ['Nearest-neighbour', 'Bilinear', 'Anti-aliasing', 'Ray tracing'], answer: 0, kind: 'trivia' },
    { question: 'How many bits did the original NES CPU process at once?', options: ['4 bits', '8 bits', '16 bits', '32 bits'], answer: 1, kind: 'trivia' },
  ],

  'pixel-pop-quiz': [
    { question: 'What does "GG" mean in gaming?', options: ['Good Going', 'Good Game', 'Great Graphics', 'Got Gold'], answer: 1, kind: 'trivia' },
    { question: 'What is a "speedrun"?', options: ['Running in a game', 'Completing a game as fast as possible', 'A racing game', 'Fast internet'], answer: 1, kind: 'trivia' },
    { question: 'What does "AFK" stand for?', options: ['Also For Kids', 'Away From Keyboard', 'A Free Kill', 'Always Find Key'], answer: 1, kind: 'trivia' },
    { question: 'What is a "nerf" in gaming?', options: ['A foam weapon', 'Making something weaker', 'A type of shield', 'Speed boost'], answer: 1, kind: 'trivia' },
    { question: 'What does "buff" mean in games?', options: ['A strong character', 'Making something stronger', 'A visual effect', 'Extra health'], answer: 1, kind: 'trivia' },
    { question: 'What is "lag"?', options: ['A cheat code', 'A delay between input and response', 'A game bug', 'Low battery'], answer: 1, kind: 'trivia' },
  ],

  'movie-mayhem': [
    { question: 'What is the small board with numbers on a film set called?', options: ['Clapperboard', 'Storyboard', 'Shot list', 'Call sheet'], answer: 0, kind: 'trivia' },
    { question: 'What does "CGI" stand for?', options: ['Computer Generated Imagery', 'Cinema Graphics Interface', 'Creative Game Illustration', 'Coded Graphic Input'], answer: 0, kind: 'trivia' },
    { question: 'Who is in charge of the camera on a film set?', options: ['Director', 'Cinematographer', 'Producer', 'Editor'], answer: 1, kind: 'trivia' },
    { question: 'What is a "score" in filmmaking?', options: ['The rating', 'The music soundtrack', 'The budget', 'The number of takes'], answer: 1, kind: 'trivia' },
    { question: 'What is "post-production"?', options: ['Filming scenes', 'Editing after filming', 'Writing the script', 'Marketing the film'], answer: 1, kind: 'trivia' },
    { question: 'What frame rate is standard for cinema?', options: ['15 fps', '24 fps', '30 fps', '60 fps'], answer: 1, kind: 'trivia' },
  ],

  'word-scramble': [
    { question: 'Unscramble: CERADE', options: ['ARCDEC', 'ACREED', 'ARCADE', 'CEDAR'], answer: 2, kind: 'scramble' },
    { question: 'Unscramble: EGMA', options: ['GAME', 'MEGA', 'GEMA', 'MAGE'], answer: 0, kind: 'scramble' },
    { question: 'Unscramble: DREOP', options: ['DOPER', 'PORED', 'ROPED', 'All valid'], answer: 3, kind: 'scramble' },
    { question: 'Unscramble: NEOP', options: ['OPEN', 'PEON', 'PONE', 'All valid'], answer: 3, kind: 'scramble' },
    { question: 'Unscramble: TSYRP', options: ['TRYST', 'TYPERS', 'PYRITES', 'CRYPTS'], answer: 0, kind: 'scramble' },
    { question: 'Unscramble: LEVLI', options: ['LIVE', 'EVIL', 'VEIL', 'All valid'], answer: 3, kind: 'scramble' },
    { question: 'Unscramble: RECW', options: ['CREW', 'WREN', 'Both A and B', 'SCREW'], answer: 2, kind: 'scramble' },
  ],

  'number-chase': [
    { question: 'What comes next: 2, 4, 8, 16, ...?', options: ['20', '24', '32', '48'], answer: 2, kind: 'number' },
    { question: 'What is 7 × 8?', options: ['54', '56', '58', '63'], answer: 1, kind: 'number' },
    { question: 'If a maze has 49 cells in a 7×7 grid, how many are on the border?', options: ['24', '28', '32', '20'], answer: 0, kind: 'number' },
    { question: 'What is the next prime after 7?', options: ['8', '9', '10', '11'], answer: 3, kind: 'number' },
    { question: 'In binary, what is 1010 in decimal?', options: ['8', '10', '12', '15'], answer: 1, kind: 'number' },
    { question: 'What is 15% of 200?', options: ['25', '30', '35', '20'], answer: 1, kind: 'number' },
    { question: 'How many diagonals does a pentagon have?', options: ['3', '5', '7', '10'], answer: 1, kind: 'number' },
  ],

  'brain-busters': [
    { question: 'I have keys but no locks. I have space but no room. You can enter but cannot go inside. What am I?', options: ['A house', 'A keyboard', 'A car', 'A dream'], answer: 1, kind: 'riddle' },
    { question: 'What has a head and a tail but no body?', options: ['A snake', 'A coin', 'An arrow', 'A comet'], answer: 1, kind: 'riddle' },
    { question: 'The more you take, the more you leave behind. What are they?', options: ['Memories', 'Footsteps', 'Photos', 'Breaths'], answer: 1, kind: 'riddle' },
    { question: 'What can travel around the world while staying in a corner?', options: ['A radio signal', 'A stamp', 'A shadow', 'A thought'], answer: 1, kind: 'riddle' },
    { question: 'I speak without a mouth and hear without ears. What am I?', options: ['An echo', 'A wind', 'A dream', 'A telepath'], answer: 0, kind: 'riddle' },
    { question: 'What gets wetter the more it dries?', options: ['A sponge', 'A towel', 'Paper', 'Sand'], answer: 1, kind: 'riddle' },
  ],

  'eight-bit-riddles': [
    { question: 'What is 1010 + 0110 in binary?', options: ['10000', '11100', '10001', '11000'], answer: 0, kind: 'number' },
    { question: 'How many values can a byte represent?', options: ['128', '256', '512', '1024'], answer: 1, kind: 'number' },
    { question: 'What is hexadecimal FF in decimal?', options: ['128', '200', '255', '256'], answer: 2, kind: 'number' },
    { question: 'How many bits are in a nibble?', options: ['2', '4', '8', '16'], answer: 1, kind: 'number' },
    { question: 'What is 2 to the power of 10?', options: ['512', '1000', '1024', '2048'], answer: 2, kind: 'number' },
    { question: 'In ASCII, what number is the letter A?', options: ['32', '65', '97', '128'], answer: 1, kind: 'number' },
  ],

  'retro-rewind': [
    { question: 'What decade saw the birth of the first commercial arcade game?', options: ['1960s', '1970s', '1980s', '1990s'], answer: 1, kind: 'trivia' },
    { question: 'Which console generation introduced 3D graphics to homes?', options: ['4th (SNES)', '5th (N64/PS1)', '6th (PS2)', '3rd (NES)'], answer: 1, kind: 'trivia' },
    { question: 'What was the best-selling console of the 1990s?', options: ['Sega Genesis', 'SNES', 'PlayStation', 'N64'], answer: 2, kind: 'trivia' },
    { question: 'When was the "Golden Age of Arcade Games"?', options: ['1975–1980', '1978–1986', '1985–1995', '1990–2000'], answer: 1, kind: 'trivia' },
    { question: 'What replaced cartridges as the main game medium in the 2000s?', options: ['Floppy disks', 'CDs/DVDs', 'USB drives', 'Downloads'], answer: 1, kind: 'trivia' },
    { question: 'Which handheld sold over 118 million units worldwide?', options: ['Game Gear', 'Game Boy', 'PSP', 'DS'], answer: 1, kind: 'trivia' },
  ],
};

/**
 * Returns the practice question bank for a given quiz game.
 * @param {string} gameId
 * @returns {Array<{ question: string, options: string[], answer: number, kind: string }>}
 */
export function practiceBankFor(gameId) {
  return banks[gameId] || banks['retro-trivia'];
}

/** All quiz game IDs that have dedicated banks. */
export function quizGameIds() {
  return Object.keys(banks);
}