/**
 * Curated question banks for the ten quiz-shaped games in the catalog — and the full answer keys.
 *
 * ⚠️ THIS MODULE IS SERVER-SIDE CONTENT. It contains the correct answer for every question, so it
 * must never be imported from `src/` (the browser bundle) or from anything the browser loads.
 * `src/engines/quiz.js` imports the generated `quiz-practice.js` warm-up subset instead; the Cloud
 * Functions load this file so online rooms deal questions whose answers are not in the browser.
 * The server additionally skips the warm-up items (shared/content/quiz-practice.js), because those
 * *are* shipped to the browser for local practice.
 *
 * Why this file exists separately from the engine: every themed quiz used to draw from one
 * ten-question generic bank, so "Word Scramble" asked general knowledge and "Emoji Decode" never
 * showed an emoji. Each bank below belongs to exactly one catalog game and uses the clues that
 * game's title, blurb and guide promise:
 *
 *   - `trivia`  a plain multiple-choice question (arcade, pop-culture or facts banks)
 *   - `emoji`   the clue is an emoji rebus; every clue carries a plain-text `label` for screen readers
 *   - `scramble` the clue is a scrambled word; the choices are candidate words
 *   - `riddle`  a short riddle, original text, no quoted material
 *   - `number`  arithmetic / sequence logic with numeric choices
 *
 * Nothing here is copyrighted material: the riddles and clues are written for this project, and the
 * remaining items are common facts about games, film and everyday maths.
 *
 * A bank must always hold at least as many items as its game deals (`options.rounds` in
 * shared/games.js). tests/catalog-integrity.test.js enforces that, so a shorter bank fails CI
 * instead of quietly repeating questions.
 */

/** @typedef {{ id: string, kind: 'trivia'|'emoji'|'scramble'|'riddle'|'number', prompt: string, clue?: string, label?: string, choices: string[], answer: number, note?: string }} QuizItem */

/** @type {Record<string, QuizItem[]>} */
export const QUIZ_BANKS = {
  'retro-trivia': [
    { id: 'retro-1', kind: 'trivia', prompt: 'Which arcade mechanic rewards you for completing a full row of falling shapes?', choices: ['A falling-block puzzle', 'A paddle duel', 'A maze chase', 'A shoot-’em-up'], answer: 0 },
    { id: 'retro-2', kind: 'trivia', prompt: 'In a maze chase, what happens when the hunter catches the runner?', choices: ['The runner loses a life', 'The runner levels up', 'The maze opens', 'The hunter freezes'], answer: 0 },
    { id: 'retro-3', kind: 'trivia', prompt: 'Two paddles and one bouncing square: which early arcade format is that?', choices: ['A paddle duel', 'A maze chase', 'A platform climber', 'A racing dash'], answer: 0 },
    { id: 'retro-4', kind: 'trivia', prompt: 'What does a cartridge slot let a handheld console do?', choices: ['Swap the game', 'Charge the battery', 'Link two players', 'Add a second screen'], answer: 0 },
    { id: 'retro-5', kind: 'trivia', prompt: 'What is the usual goal in a brick-breaking arcade game?', choices: ['Catch a ball', 'Clear the bricks', 'Find a word', 'Race a car'], answer: 1 },
    { id: 'retro-6', kind: 'trivia', prompt: 'In a lane-crossing arcade game, what is the usual goal?', choices: ['Reach the far side', 'Collect every coin', 'Clear the bricks', 'Finish the lap'], answer: 0 },
    { id: 'retro-7', kind: 'trivia', prompt: 'In a growing-tail arcade game, what usually ends the run?', choices: ['Hitting a wall or your own tail', 'The timer running out', 'Collecting too much food', 'Pausing the game'], answer: 0 },
    { id: 'retro-8', kind: 'trivia', prompt: 'Which of these is a classic pinball goal?', choices: ['Sink every ship', 'Keep the ball from draining', 'Clear a maze', 'Type a word'], answer: 1 },
    { id: 'retro-9', kind: 'trivia', prompt: 'In a shoot-em-up with an asteroid field, what do you usually dodge?', choices: ['Traffic cones', 'Tumbling rocks', 'Falling blocks', 'Ladders'], answer: 1 },
    { id: 'retro-10', kind: 'trivia', prompt: 'What does a "score multiplier" do in an arcade game?', choices: ['Adds extra lives', 'Makes each point worth more', 'Slows the game down', 'Skips a level'], answer: 1 },
    { id: 'retro-11', kind: 'trivia', prompt: 'Which pair of controls did the earliest arcade machines use most often?', choices: ['A joystick and a button', 'A mouse and a wheel', 'Pedals and a horn', 'A trackpad'], answer: 0 },
    { id: 'retro-12', kind: 'trivia', prompt: 'What is a "high score table" for?', choices: ['Storing saved games', 'Showing the best runs', 'Choosing the level order', 'Tracking the timer'], answer: 1 },
    { id: 'retro-13', kind: 'trivia', prompt: 'What does a warp zone usually let a player do?', choices: ['Teleport ahead', 'Pause the clock', 'Restore health', 'Swap characters'], answer: 0 },
    { id: 'retro-14', kind: 'trivia', prompt: 'Which of these items usually grants an extra life in an arcade game?', choices: ['A coin', 'A key', 'A heart', 'A shield'], answer: 2 },
  ],

  'emoji-decode': [
    { id: 'emoji-1', kind: 'emoji', clue: '🎬🍿🎟️', label: 'Clapperboard, popcorn and cinema ticket', prompt: 'What kind of night is this?', choices: ['Arcade night', 'Movie night', 'Game night', 'Quiz night'], answer: 1 },
    { id: 'emoji-2', kind: 'emoji', clue: '🕹️👾👑', label: 'Joystick, space invader and crown', prompt: 'What is the leader of this game?', choices: ['Signed-in user', 'Lobby host', 'Admin', 'Spectator'], answer: 1, note: 'The joystick and crown point at whoever owns the room.' },
    { id: 'emoji-3', kind: 'emoji', clue: '⏰➡️💨', label: 'Alarm clock with movement lines', prompt: 'What is running out?', choices: ['Lives', 'Time', 'Answers', 'Coins'], answer: 1 },
    { id: 'emoji-4', kind: 'emoji', clue: '🔢🧠✅', label: 'Numbers, brain and check mark', prompt: 'Which of our games does this hint at?', choices: ['Word Scramble', 'Number Chase', 'Movie Mayhem', 'Emoji Flip'], answer: 1 },
    { id: 'emoji-5', kind: 'emoji', clue: '🔗👥🎮', label: 'Link, two people and a game controller', prompt: 'What is being shared?', choices: ['An invite link', 'A score', 'A password', 'A rule set'], answer: 0 },
    { id: 'emoji-6', kind: 'emoji', clue: '📝🔀🧩', label: 'Memo, shuffle arrows and puzzle piece', prompt: 'Which of our games does this hint at?', choices: ['Word Scramble', 'Retro Trivia', 'Sea Battle', 'Air Hockey'], answer: 0 },
    { id: 'emoji-7', kind: 'emoji', clue: '🚢🎯💥', label: 'Ship, target and explosion', prompt: 'Which of our games does this hint at?', choices: ['Pong Rally', 'Sea Battle', 'Maze Runner', 'Mastermind'], answer: 1 },
    { id: 'emoji-8', kind: 'emoji', clue: '🔒🔢🕵️', label: 'Padlock, numbers and detective', prompt: 'What is the player trying to do?', choices: ['Pick a lane', 'Break a code', 'Match cards', 'Reach the star'], answer: 1 },
    { id: 'emoji-9', kind: 'emoji', clue: '🃏🔄👀', label: 'Card, repeat arrows and eyes', prompt: 'What does this describe?', choices: ['A card memory game', 'A dice duel', 'A maze race', 'A drop board'], answer: 0 },
    { id: 'emoji-10', kind: 'emoji', clue: '🏆➕1️⃣', label: 'Trophy and the number one', prompt: 'What did someone just earn for their team?', choices: ['A penalty', 'A point', 'A rematch', 'A blocked seat'], answer: 1 },
    { id: 'emoji-11', kind: 'emoji', clue: '✊✋✌️', label: 'Rock, paper and scissors hand signs', prompt: 'Which game is this?', choices: ['Dice Duel', 'Rock Paper Scissors', 'Coin Flip Clash', 'Laser Duel'], answer: 1 },
    { id: 'emoji-12', kind: 'emoji', clue: '🕳️🐇⏱️', label: 'Hole, rabbit and stopwatch', prompt: 'What are you racing against?', choices: ['A rival only', 'The clock', 'A referee', 'A dealer'], answer: 1 },
    { id: 'emoji-13', kind: 'emoji', clue: '📵🌐🔌', label: 'No signal, globe and plug', prompt: 'What does this describe?', choices: ['A new upgrade', 'A connection problem', 'A game rule', 'A scoring bonus'], answer: 1 },
    { id: 'emoji-14', kind: 'emoji', clue: '🧩➡️⭐', label: 'Puzzle piece, arrow and star', prompt: 'What are you heading towards?', choices: ['The exit star gate', 'The final boss', 'The scoring line', 'The lobby'], answer: 0 },
  ],

  'arcade-facts': [
    { id: 'facts-1', kind: 'trivia', prompt: 'What is a ROM in the context of classic arcade hardware?', choices: ['A read-only memory chip', 'A racing wheel', 'A coin slot', 'A screen type'], answer: 0 },
    { id: 'facts-2', kind: 'trivia', prompt: 'Which display did the first arcade cabinets mostly use?', choices: ['CRT monitors', 'OLED panels', 'Projectors', 'E-ink screens'], answer: 0 },
    { id: 'facts-3', kind: 'trivia', prompt: 'What does "sprite" mean in 2D game graphics?', choices: ['A moving drawn object', 'A sound effect', 'A level tile', 'A score table'], answer: 0 },
    { id: 'facts-4', kind: 'trivia', prompt: 'Why did early arcade games use such small colour palettes?', choices: ['Hardware memory and colour limits', 'Bright rooms needed pale colours', 'Animators had few paints', 'The rules demanded it'], answer: 0 },
    { id: 'facts-5', kind: 'trivia', prompt: 'What is "frame rate" measuring?', choices: ['Screens drawn per second', 'Buttons pressed per minute', 'Coins per hour', 'Players per cabinet'], answer: 0 },
    { id: 'facts-6', kind: 'trivia', prompt: 'What makes 8-bit pixel sprites look blocky?', choices: ['They are drawn on a coarse grid', 'They are compressed', 'They are black and white', 'They are scaled by the monitor only'], answer: 0 },
    { id: 'facts-7', kind: 'trivia', prompt: 'What is the job of a "hitbox"?', choices: ['Checking whether objects collide', 'Storing high scores', 'Driving the sound chip', 'Timing the attract mode'], answer: 0 },
    { id: 'facts-8', kind: 'trivia', prompt: 'What does "attract mode" describe on an arcade cabinet?', choices: ['A looping demo that invites players', 'A free-play setting', 'A hidden boss fight', 'A coin refund'], answer: 0 },
    { id: 'facts-9', kind: 'trivia', prompt: 'What is a "game cartridge" for?', choices: ['Holding the game data', 'Cooling the console', 'Storing coins', 'Printing scores'], answer: 0 },
    { id: 'facts-10', kind: 'trivia', prompt: 'What did a "cheat code" let a player do?', choices: ['Change the game rules or unlock content', 'Fix a broken cabinet', 'Buy extra turns with coins', 'Add another player mid-game'], answer: 0 },
    { id: 'facts-11', kind: 'trivia', prompt: 'Which of these is a turn-based game shape?', choices: ['Grid or board play', 'Simultaneous tapping races', 'Live voice chat', 'Video streaming'], answer: 0 },
    { id: 'facts-12', kind: 'trivia', prompt: 'What does "netcode" usually refer to?', choices: ['How a game synchronises players over a network', 'The cabinet wiring', 'The sprite sheet layout', 'The sound mixer'], answer: 0 },
    { id: 'facts-13', kind: 'trivia', prompt: 'Why is a seeded random generator useful in games?', choices: ['Every player can compute the same result', 'It makes the game harder', 'It removes all randomness', 'It saves battery'], answer: 0 },
    { id: 'facts-14', kind: 'trivia', prompt: 'What is "latency" in an online game?', choices: ['The delay between action and result', 'The size of the download', 'The number of players', 'The screen brightness'], answer: 0 },
  ],

  'pixel-pop-quiz': [
    { id: 'pop-1', kind: 'trivia', prompt: 'Which decade first put arcade cabinets in shopping centres at scale?', choices: ['1950s', '1970s', '1990s', '2010s'], answer: 1 },
    { id: 'pop-2', kind: 'trivia', prompt: 'A "power-up" in a platform game usually does what?', choices: ['Makes the player stronger or faster', 'Resets the level', 'Adds a new player', 'Closes the cabinet'], answer: 0 },
    { id: 'pop-3', kind: 'trivia', prompt: 'In the popular shape-fitting puzzle game, what does a single block-filled row do?', choices: ['Disappears and scores points', 'Turns into a wall', 'Slows the game', 'Spawns a coin'], answer: 0 },
    { id: 'pop-4', kind: 'trivia', prompt: 'What is a "boss fight"?', choices: ['A tougher end-of-stage encounter', 'A practice room', 'A shopping screen', 'A scoring tie-breaker'], answer: 0 },
    { id: 'pop-5', kind: 'trivia', prompt: 'What is a speedrun?', choices: ['Finishing a game as fast as possible', 'Playing without sound', 'Maxing out the score', 'Finishing without moving'], answer: 0 },
    { id: 'pop-6', kind: 'trivia', prompt: 'What does "co-op" mean?', choices: ['Players work together', 'Players take turns offline', 'Players watch only', 'Players pay per round'], answer: 0 },
    { id: 'pop-7', kind: 'trivia', prompt: 'A "respawn" is where a player does what?', choices: ['Comes back after being knocked out', 'Leaves the match', 'Levels up', 'Changes the difficulty'], answer: 0 },
    { id: 'pop-8', kind: 'trivia', prompt: 'What is "couch multiplayer" describing?', choices: ['Players sharing one screen in the same room', 'Playing over a satellite link', 'Playing alone', 'Aspect ratio'], answer: 0 },
    { id: 'pop-9', kind: 'trivia', prompt: 'What is a "season pass" usually sold with?', choices: ['Extra content over time', 'A better keyboard', 'A faster wi-fi plan', 'Extra controllers'], answer: 0 },
    { id: 'pop-10', kind: 'trivia', prompt: 'What does "nerf" mean in game talk?', choices: ['Making something weaker', 'Making something stronger', 'Removing a level', 'Fixing a typo'], answer: 0 },
    { id: 'pop-11', kind: 'trivia', prompt: 'What does "meta" describe in a competitive game?', choices: ['The currently strongest strategies', 'The game manual', 'The final level', 'The soundtrack'], answer: 0 },
    { id: 'pop-12', kind: 'trivia', prompt: 'A "leaderboard" shows what?', choices: ['Top players or scores', 'The game rules', 'The credits', 'The server list'], answer: 0 },
    { id: 'pop-13', kind: 'trivia', prompt: 'What is a "loot box" in most games?', choices: ['A container of random rewards', 'A storage chest for saves', 'A tutorial panel', 'A chat channel'], answer: 0 },
    { id: 'pop-14', kind: 'trivia', prompt: 'What is "couch co-op with latency"?', choices: ['Playing together from different places', 'Playing with a broken controller', 'Playing in slow motion', 'Playing without the internet'], answer: 0, note: 'Which is exactly what an invite room is.' },
  ],

  'movie-mayhem': [
    { id: 'movie-1', kind: 'trivia', prompt: 'Which job decides how a film is shot and performed?', choices: ['The director', 'The gaffer', 'The grip', 'The colourist'], answer: 0 },
    { id: 'movie-2', kind: 'trivia', prompt: 'What is a "clapperboard" used for on set?', choices: ['Marking takes and sync', 'Blocking the light', 'Holding the script', 'Cooling the actors'], answer: 0 },
    { id: 'movie-3', kind: 'trivia', prompt: 'What does "post-production" include?', choices: ['Editing, sound and effects', 'Casting the leads', 'Shooting the scenes', 'Writing the script'], answer: 0 },
    { id: 'movie-4', kind: 'trivia', prompt: 'What is a "cameo"?', choices: ['A brief appearance by a known face', 'A deleted ending', 'A stunt double scene', 'A silent montage'], answer: 0 },
    { id: 'movie-5', kind: 'trivia', prompt: 'What does a "montage" usually show quickly?', choices: ['Progress over time', 'A single line of dialogue', 'One camera angle', 'The end credits'], answer: 0 },
    { id: 'movie-6', kind: 'trivia', prompt: 'What is a "green screen" for?', choices: ['Replacing the background later', 'Saving electricity', 'Making actors look pale', 'Filtering sunlight'], answer: 0 },
    { id: 'movie-7', kind: 'trivia', prompt: 'Which role writes the script?', choices: ['The screenwriter', 'The producer', 'The editor', 'The stunt coordinator'], answer: 0 },
    { id: 'movie-8', kind: 'trivia', prompt: 'What does a film "score" mean?', choices: ['Its original instrumental music', 'Its box-office total', 'Its star rating', 'Its age rating'], answer: 0 },
    { id: 'movie-9', kind: 'trivia', prompt: 'What is a "teaser trailer"?', choices: ['A very short early trailer', 'The full film', 'A blooper reel', 'A test screening form'], answer: 0 },
    { id: 'movie-10', kind: 'trivia', prompt: 'What is a "stunt double" for?', choices: ['Performing risky action for a role', 'Recording dialogue', 'Adjusting the lighting', 'Standing in for a photo only'], answer: 0 },
    { id: 'movie-11', kind: 'trivia', prompt: 'What does "in-camera" effects mean?', choices: ['Tricks captured on set rather than added later', 'Effects made by the audience', 'Sound recorded on a phone', 'A film shot backwards'], answer: 0 },
    { id: 'movie-12', kind: 'trivia', prompt: 'What is a "plot twist"?', choices: ['A turn the story was hiding', 'A reshoot', 'A loud sound cue', 'A genre label'], answer: 0 },
    { id: 'movie-13', kind: 'trivia', prompt: 'What is an "ensemble cast"?', choices: ['A group of leading performers', 'A crew of grips', 'A test audience', 'A set of cameras'], answer: 0 },
    { id: 'movie-14', kind: 'trivia', prompt: 'What does "PG" style rating information tell you?', choices: ['Who should watch with guidance', 'How long the film is', 'Who directed it', 'How much it earned'], answer: 0 },
  ],

  'word-scramble': [
    { id: 'scramble-1', kind: 'scramble', prompt: 'Unscramble the arcade word.', clue: 'R E T O I S', label: 'Letters: R E T O I S', choices: ['Sorter', 'Sister', 'Resort', 'Toe sir'], answer: 0, note: 'It sorts the levels.' },
    { id: 'scramble-2', kind: 'scramble', prompt: 'Unscramble the word for a line of three matching marks.', clue: 'R O W', label: 'Letters: R O W', choices: ['Row', 'War', 'Own', 'Raw'], answer: 0 },
    { id: 'scramble-3', kind: 'scramble', prompt: 'Unscramble the word for the hidden digits in Codebreaker.', clue: 'S E C E R T', label: 'Letters: S E C E R T', choices: ['Secret', 'Crests', 'Sector', 'Resect'], answer: 0 },
    { id: 'scramble-4', kind: 'scramble', prompt: 'Unscramble the word for a game board disguise in Sea Battle.', clue: 'F L E E T', label: 'Letters: F L E E T', choices: ['Fleet', 'Felt', 'Left', 'Fete'], answer: 0 },
    { id: 'scramble-5', kind: 'scramble', prompt: 'Unscramble the word for the extra turn a memory match earns.', clue: 'N U O B S', label: 'Letters: N U O B S', choices: ['Bonus', 'Bosun', 'Buns', 'Snub'], answer: 0 },
    { id: 'scramble-6', kind: 'scramble', prompt: 'Unscramble the word for the wall the maze refuses to cross.', clue: 'L A W L', label: 'Letters: L A W L', choices: ['Wall', 'Well', 'Will', 'Wail'], answer: 0 },
    { id: 'scramble-7', kind: 'scramble', prompt: 'Unscramble the word for a fast button press.', clue: 'A T P', label: 'Letters: A T P', choices: ['Tap', 'Pat', 'Apt', 'Tapa'], answer: 0 },
    { id: 'scramble-8', kind: 'scramble', prompt: 'Unscramble the word for the long stick that hits the puck or ball.', clue: 'D A L D E P', label: 'Letters: D A L D E P', choices: ['Paddle', 'Peddle', 'Plead', 'Apple'], answer: 0 },
    { id: 'scramble-9', kind: 'scramble', prompt: 'Unscramble the word for a private invitation address.', clue: 'L I N K', label: 'Letters: L I N K', choices: ['Link', 'Klin', 'Kiln', 'Ink'], answer: 0 },
    { id: 'scramble-10', kind: 'scramble', prompt: 'Unscramble the word for two cards that look the same.', clue: 'A R I P', label: 'Letters: A R I P', choices: ['Pair', 'Ripe', 'Pear', 'Airp'], answer: 0 },
    { id: 'scramble-11', kind: 'scramble', prompt: 'Unscramble the word for the player who opens the match.', clue: 'V R E S E', label: 'Letters: V R E S E', choices: ['Serve', 'Verse', 'Sever', 'Revs'], answer: 0 },
    { id: 'scramble-12', kind: 'scramble', prompt: 'Unscramble the word for the number of points a win is worth.', clue: 'R O C S E', label: 'Letters: R O C S E', choices: ['Score', 'Cores', 'Close', 'Roses'], answer: 0 },
    { id: 'scramble-13', kind: 'scramble', prompt: 'Unscramble the word for a shared private game space.', clue: 'R O O M', label: 'Letters: R O O M', choices: ['Room', 'Moor', 'Roam', 'Mor'], answer: 0 },
    { id: 'scramble-14', kind: 'scramble', prompt: 'Unscramble the word for the square pieces you flip.', clue: 'C A R D S', label: 'Letters: C A R D S', choices: ['Cards', 'Scard', 'Crass', 'Dracs'], answer: 0 },
    { id: 'scramble-15', kind: 'scramble', prompt: 'Unscramble the word for a full set of cards in play.', clue: 'D E K C', label: 'Letters: D E K C', choices: ['Deck', 'Dock', 'Duck', 'Decal'], answer: 0 },
    { id: 'scramble-16', kind: 'scramble', prompt: 'Unscramble the word for the tick of a countdown.', clue: 'R E M I T', label: 'Letters: R E M I T', choices: ['Timer', 'Merit', 'Miter', 'Remit'], answer: 0 },
    { id: 'scramble-17', kind: 'scramble', prompt: 'Unscramble the word for the teammate on your side.', clue: 'L A Y L', label: 'Letters: L A Y L', choices: ['Ally', 'Alloy', 'Lily', 'Loyal'], answer: 0 },
    { id: 'scramble-18', kind: 'scramble', prompt: 'Unscramble the word for a puzzle answer you pick from four.', clue: 'O N P I T O', label: 'Letters: O N P I T O', choices: ['Option', 'Opiton', 'Potions', 'Notion'], answer: 0 },
  ],

  'number-chase': [
    { id: 'number-1', kind: 'number', prompt: 'What comes next in this sequence?', clue: '2, 4, 6, 8, …', label: 'Sequence: two, four, six, eight', choices: ['9', '10', '12', '11'], answer: 1 },
    { id: 'number-2', kind: 'number', prompt: 'A boost meter needs 16 taps. You have 9. How many are left?', clue: '16 − 9', label: 'Sixteen minus nine', choices: ['5', '6', '7', '8'], answer: 2 },
    { id: 'number-3', kind: 'number', prompt: 'Three players each score 4 points. What is the total?', clue: '3 × 4', label: 'Three times four', choices: ['7', '12', '16', '9'], answer: 1 },
    { id: 'number-4', kind: 'number', prompt: 'A 6 by 6 board has how many squares in total?', clue: '6 × 6', label: 'Six times six', choices: ['12', '24', '36', '42'], answer: 2 },
    { id: 'number-5', kind: 'number', prompt: 'Which number is a perfect square?', clue: '√ ? is a whole number', label: 'Which of these is a perfect square', choices: ['15', '20', '25', '30'], answer: 2 },
    { id: 'number-6', kind: 'number', prompt: 'Halve 18, then add 5. What do you get?', clue: '18 ÷ 2 + 5', label: 'Eighteen divided by two plus five', choices: ['12', '14', '13', '16'], answer: 1 },
    { id: 'number-7', kind: 'number', prompt: 'A quiz has 5 rounds and each is worth 2 points. What is the maximum score?', clue: '5 × 2', label: 'Five times two', choices: ['7', '10', '12', '15'], answer: 1 },
    { id: 'number-8', kind: 'number', prompt: 'What is the next number?', clue: '3, 6, 12, 24, …', label: 'Sequence: three, six, twelve, twenty-four', choices: ['36', '42', '48', '54'], answer: 2 },
    { id: 'number-9', kind: 'number', prompt: 'You guess 4 digits and 2 are exactly right. How many are not in the right place?', clue: '4 − 2', label: 'Four minus two', choices: ['1', '2', '3', '4'], answer: 1 },
    { id: 'number-10', kind: 'number', prompt: 'A dice duel uses faces 1 to 6. How many different rolls exist?', clue: '1…6', label: 'Numbers one to six', choices: ['5', '6', '7', '12'], answer: 1 },
    { id: 'number-11', kind: 'number', prompt: 'What is 7 more than 15?', clue: '15 + 7', label: 'Fifteen plus seven', choices: ['21', '22', '23', '24'], answer: 1 },
    { id: 'number-12', kind: 'number', prompt: 'A maze is 7 tiles wide and 7 tiles tall. How many tiles is the floor?', clue: '7 × 7', label: 'Seven times seven', choices: ['14', '42', '49', '56'], answer: 2 },
    { id: 'number-13', kind: 'number', prompt: 'Which total is odd?', clue: 'even + even vs even + odd', label: 'Which total is odd', choices: ['2 + 2', '4 + 4', '6 + 5', '8 + 2'], answer: 2 },
    { id: 'number-14', kind: 'number', prompt: 'If one point is scored every 2 rounds, how many rounds for 6 points?', clue: '6 × 2', label: 'Six times two', choices: ['8', '10', '12', '14'], answer: 2 },
    { id: 'number-15', kind: 'number', prompt: 'A rally is first to 9. You lead 7 to 5. How many points do you still need?', clue: '9 − 7', label: 'Nine minus seven', choices: ['1', '2', '3', '4'], answer: 1 },
    { id: 'number-16', kind: 'number', prompt: 'How many cards are in a deck of 6 pairs?', clue: '6 × 2', label: 'Six times two', choices: ['8', '10', '12', '14'], answer: 2 },
    { id: 'number-17', kind: 'number', prompt: 'What comes next?', clue: '1, 1, 2, 3, 5, …', label: 'Sequence: one, one, two, three, five', choices: ['6', '7', '8', '9'], answer: 2 },
    { id: 'number-18', kind: 'number', prompt: 'Which of these adds up to 12?', clue: 'pick one pair', label: 'Which pair adds up to twelve', choices: ['4 + 6', '5 + 5', '7 + 6', '8 + 4'], answer: 3 },
  ],

  'brain-busters': [
    { id: 'brain-1', kind: 'riddle', prompt: 'I have keys but no locks, and space but no room. What am I?', choices: ['A keyboard', 'A piano', 'A map', 'A clock'], answer: 0 },
    { id: 'brain-2', kind: 'riddle', prompt: 'The more you take from me, the bigger I get. What am I?', choices: ['A hole', 'A pile', 'A coin', 'A shadow'], answer: 0 },
    { id: 'brain-3', kind: 'riddle', prompt: 'I am full of holes but still hold water. What am I?', choices: ['A sponge', 'A net', 'A basket', 'A sieve'], answer: 0 },
    { id: 'brain-4', kind: 'riddle', prompt: 'I go up but never come down. What am I?', choices: ['Your age', 'A lift', 'A kite', 'A balloon'], answer: 0 },
    { id: 'brain-5', kind: 'riddle', prompt: 'What has hands but cannot clap?', choices: ['A clock', 'A puppet', 'A glove', 'A statue'], answer: 0 },
    { id: 'brain-6', kind: 'riddle', prompt: 'What gets wetter the more it dries?', choices: ['A towel', 'A sponge', 'A river', 'A raincoat'], answer: 0 },
    { id: 'brain-7', kind: 'riddle', prompt: 'I have a face and two hands, but no arms or legs. What am I?', choices: ['A clock', 'A doll', 'A coin', 'A mirror'], answer: 0 },
    { id: 'brain-8', kind: 'riddle', prompt: 'What can you catch but never throw?', choices: ['A cold', 'A ball', 'A coin', 'A rope'], answer: 0 },
    { id: 'brain-9', kind: 'riddle', prompt: 'What has one eye but cannot see?', choices: ['A needle', 'A storm', 'A window', 'A camera'], answer: 0 },
    { id: 'brain-10', kind: 'riddle', prompt: 'The more of me there is, the less you see. What am I?', choices: ['Darkness', 'Fog only', 'A crowd', 'A wall'], answer: 0 },
    { id: 'brain-11', kind: 'riddle', prompt: 'What runs around a field but never moves?', choices: ['A fence', 'A dog', 'A stream', 'A road'], answer: 0 },
    { id: 'brain-12', kind: 'riddle', prompt: 'I am always in front of you but you can never see me. What am I?', choices: ['The future', 'The wind', 'Your nose', 'A shadow'], answer: 0 },
    { id: 'brain-13', kind: 'riddle', prompt: 'What has many teeth but cannot bite?', choices: ['A comb', 'A saw', 'A zipper', 'A key'], answer: 0 },
    { id: 'brain-14', kind: 'riddle', prompt: 'What can travel around the world while staying in one corner?', choices: ['A stamp', 'A coin', 'A map', 'A flag'], answer: 0 },
  ],

  'eight-bit-riddles': [
    { id: 'riddle-1', kind: 'riddle', prompt: 'I am a single binary digit. What am I?', choices: ['A bit', 'A byte', 'A nibble', 'A pixel'], answer: 0 },
    { id: 'riddle-2', kind: 'riddle', prompt: 'How many bits make one byte?', choices: ['4', '8', '16', '32'], answer: 1 },
    { id: 'riddle-3', kind: 'riddle', prompt: 'Count in binary: after 1 comes what?', clue: '1, 10, 11, …', label: 'Sequence in binary: one, one zero, one one', choices: ['100', '111', '101', '12'], answer: 0 },
    { id: 'riddle-4', kind: 'riddle', prompt: 'Which binary value equals 5 in decimal?', clue: '? = 4 + 1', label: 'Which equals four plus one', choices: ['100', '101', '110', '111'], answer: 1 },
    { id: 'riddle-5', kind: 'riddle', prompt: 'I am one small dot of colour on a screen. What am I?', choices: ['A pixel', 'A bit', 'A frame', 'A tile'], answer: 0 },
    { id: 'riddle-6', kind: 'riddle', prompt: 'I am the smallest whole unit most 8-bit games draw with. What am I?', choices: ['A pixel', 'A byte', 'A vector', 'A shader'], answer: 0 },
    { id: 'riddle-7', kind: 'riddle', prompt: 'Which number system has exactly two symbols?', choices: ['Binary', 'Decimal', 'Hex', 'Roman'], answer: 0 },
    { id: 'riddle-8', kind: 'riddle', prompt: 'A nibble is half a byte. How many bits is that?', choices: ['2', '4', '6', '8'], answer: 1 },
    { id: 'riddle-9', kind: 'riddle', prompt: 'What does 1111 equal in decimal?', clue: '8 + 4 + 2 + 1', label: 'Eight plus four plus two plus one', choices: ['12', '14', '15', '16'], answer: 2 },
    { id: 'riddle-10', kind: 'riddle', prompt: 'I am the package that carries a cartridge game. What am I?', choices: ['A ROM', 'A RAM', 'A GPU', 'A PSU'], answer: 0 },
    { id: 'riddle-11', kind: 'riddle', prompt: 'Which value is a power of two?', choices: ['12', '18', '32', '40'], answer: 2 },
    { id: 'riddle-12', kind: 'riddle', prompt: 'I store data while the power is on but forget it when it is off. What am I?', choices: ['RAM', 'A ROM chip', 'A hard drive', 'A cartridge'], answer: 0 },
    { id: 'riddle-13', kind: 'riddle', prompt: 'What is 0101 in decimal?', clue: '4 + 1', label: 'Four plus one', choices: ['4', '5', '6', '7'], answer: 1 },
    { id: 'riddle-14', kind: 'riddle', prompt: 'How many shades can one bit show?', choices: ['Two', 'Four', 'Eight', 'Sixteen'], answer: 0 },
  ],

  'retro-rewind': [
    { id: 'rewind-1', kind: 'trivia', prompt: 'Which decade gave us the first home video game consoles people plugged into a TV?', choices: ['1950s', '1970s', '1990s', '2000s'], answer: 1 },
    { id: 'rewind-2', kind: 'trivia', prompt: 'Which storage format did home computers of the 1980s commonly load games from?', choices: ['Compact cassette', 'Blu-ray', 'USB stick', 'Cloud storage'], answer: 0 },
    { id: 'rewind-3', kind: 'trivia', prompt: 'Which connector name belongs to the 1990s-era TV aerial style used by many early consoles?', choices: ['RF lead', 'HDMI', 'USB-C', 'DisplayPort'], answer: 0 },
    { id: 'rewind-4', kind: 'trivia', prompt: 'Which memory card did handhelds of the late 1990s and 2000s rely on?', choices: ['A small removable game card', 'A tape reel', 'A laser disc', 'A floppy drive'], answer: 0 },
    { id: 'rewind-5', kind: 'trivia', prompt: 'Which control layout did most 1980s consoles standardise on?', choices: ['A direction pad plus two buttons', 'A mouse and keyboard', 'A touchscreen', 'Two analogue sticks only'], answer: 0 },
    { id: 'rewind-6', kind: 'trivia', prompt: 'What did arcade players buy to keep playing?', choices: ['Tokens or coins', 'Season passes', 'DLC packs', 'Monthly plans'], answer: 0 },
    { id: 'rewind-7', kind: 'trivia', prompt: 'Which colour palette limit is typical of 1980s consoles?', choices: ['A handful of colours on screen', 'Millions per sprite', 'Unlimited gradients', 'Full 4K detail'], answer: 0 },
    { id: 'rewind-8', kind: 'trivia', prompt: 'Which of these was a common way to save progress in the 1980s?', choices: ['A password or code sheet', 'Cloud save', 'A USB key', 'An online account'], answer: 0 },
    { id: 'rewind-9', kind: 'trivia', prompt: 'Which decade brought widely available online console play to living rooms?', choices: ['1970s', '1980s', '2000s', '1940s'], answer: 2 },
    { id: 'rewind-10', kind: 'trivia', prompt: 'What did "insert coin" on an attract screen invite you to do?', choices: ['Start a game', 'Add graphics', 'Change the difficulty', 'Print a score'], answer: 0 },
    { id: 'rewind-11', kind: 'trivia', prompt: 'Which screen type did most 1990s arcade cabinets use?', choices: ['CRT', 'E-ink', 'OLED', 'Hologram'], answer: 0 },
    { id: 'rewind-12', kind: 'trivia', prompt: 'Which feature did game controllers of the late 1990s add widely?', choices: ['Analogue sticks', 'Touchscreens', 'Card readers', 'Sunlight sensors'], answer: 0 },
    { id: 'rewind-13', kind: 'trivia', prompt: 'Which item did players keep to remember a save code?', choices: ['A notebook', 'A router', 'A headset', 'A patch cable'], answer: 0 },
    { id: 'rewind-14', kind: 'trivia', prompt: 'Which of these was a real problem for early online play?', choices: ['Slow dial-up latency', 'Too many pixels', 'Surround sound limits', 'Wireless controllers'], answer: 0 },
  ],
};

/**
 * How the warm-up subset is chosen: fixed positions in every bank, so the selection is reviewable
 * and stable, and `scripts/build-quiz-practice.mjs` can regenerate the client file from these rules.
 * Six items keep a five- or six-round practice match varied; the remaining items stay online-only.
 */
export const PRACTICE_INDEXES = Object.freeze([0, 2, 4, 6, 8, 10]);

/** @param {string} gameId @returns {QuizItem[]} the items that are safe to ship to the browser. */
export function practiceItemsForGame(gameId) {
  const bank = bankForGame(gameId);
  return PRACTICE_INDEXES.map((index) => bank[index]).filter(Boolean);
}

/** @param {string} gameId @returns {QuizItem[]} the items online rooms may deal (never client-shipped). */
export function onlineItemsForGame(gameId) {
  const practiceIds = new Set(practiceItemsForGame(gameId).map((item) => item.id));
  return bankForGame(gameId).filter((item) => !practiceIds.has(item.id));
}

/** Which bank belongs to which catalog game. Keys are catalog game ids. */
export const QUIZ_BANK_BY_GAME = Object.freeze({
  'retro-trivia': 'retro-trivia',
  'emoji-decode': 'emoji-decode',
  'arcade-facts': 'arcade-facts',
  'pixel-pop-quiz': 'pixel-pop-quiz',
  'movie-mayhem': 'movie-mayhem',
  'word-scramble': 'word-scramble',
  'number-chase': 'number-chase',
  'brain-busters': 'brain-busters',
  'eight-bit-riddles': 'eight-bit-riddles',
  'retro-rewind': 'retro-rewind',
});

/** @param {string} gameId @returns {QuizItem[]} the bank for a game (empty when the game is not a quiz). */
export function bankForGame(gameId) {
  const bankId = QUIZ_BANK_BY_GAME[gameId] ?? gameId;
  return QUIZ_BANKS[bankId] ?? [];
}

/** @param {string} gameId @param {string} itemId @returns {QuizItem | null} */
export function findItem(gameId, itemId) {
  return bankForGame(gameId).find((item) => item.id === itemId) ?? null;
}

/**
 * The item ids one match deals, in order.
 *
 * Deterministic in (gameId, seed), so the server, every client and a replayed test all agree on the
 * round list without shipping it to the browser before it is needed. `rounds` is the number of
 * questions the game asks; a bank smaller than `rounds` repeats from the top only after the whole
 * bank is used, and tests/catalog-integrity.test.js fails when that can happen.
 *
 * @param {string} gameId
 * @param {string} seed
 * @param {number} rounds
 * @param {{ shuffle?: (values: string[], seed: string) => string[], bank?: QuizItem[] }} [options]
 *   `bank` deals from a specific item list (the backend passes the full server-only bank), and
 *   `shuffle` reuses an engine's own deterministic shuffle so every caller agrees.
 * @returns {string[]}
 */
export function quizDeck(gameId, seed, rounds, options = {}) {
  const bank = options.bank ?? bankForGame(gameId);
  if (!bank.length) return [];
  const shuffle = options.shuffle ?? deterministicShuffle;
  const order = shuffle(bank.map((item) => item.id), `${seed}:${gameId}:quiz`);
  const total = Math.max(1, Math.min(Number(rounds) || order.length, order.length));
  return order.slice(0, total);
}

/**
 * A dependency-free Fisher-Yates shuffle. The engines have their own (`shuffled`), but this module is
 * also loaded by Cloud Functions, which must not import anything browser-facing; keeping the copy
 * here means this file has zero imports.
 *
 * @template T @param {T[]} values @param {string} seed @returns {T[]}
 */
export function deterministicShuffle(values, seed) {
  const random = mulberry32(fnv1a(seed) || 0x9e3779b9);
  const items = [...values];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

/** @param {string} text @returns {number} */
export function fnv1a(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** @param {number} seed @returns {() => number} mulberry32, the same generator the engines use. */
export function mulberry32(seed) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
