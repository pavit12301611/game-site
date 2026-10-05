/**
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
export const PRACTICE_BANKS = {
  "retro-trivia": [
    {
      "id": "retro-1",
      "kind": "trivia",
      "prompt": "Which arcade mechanic rewards you for completing a full row of falling shapes?",
      "choices": [
        "A falling-block puzzle",
        "A paddle duel",
        "A maze chase",
        "A shoot-’em-up"
      ],
      "answer": 0
    },
    {
      "id": "retro-3",
      "kind": "trivia",
      "prompt": "Two paddles and one bouncing square: which early arcade format is that?",
      "choices": [
        "A paddle duel",
        "A maze chase",
        "A platform climber",
        "A racing dash"
      ],
      "answer": 0
    },
    {
      "id": "retro-5",
      "kind": "trivia",
      "prompt": "What is the usual goal in a brick-breaking arcade game?",
      "choices": [
        "Catch a ball",
        "Clear the bricks",
        "Find a word",
        "Race a car"
      ],
      "answer": 1
    },
    {
      "id": "retro-7",
      "kind": "trivia",
      "prompt": "In a growing-tail arcade game, what usually ends the run?",
      "choices": [
        "Hitting a wall or your own tail",
        "The timer running out",
        "Collecting too much food",
        "Pausing the game"
      ],
      "answer": 0
    },
    {
      "id": "retro-9",
      "kind": "trivia",
      "prompt": "In a shoot-em-up with an asteroid field, what do you usually dodge?",
      "choices": [
        "Traffic cones",
        "Tumbling rocks",
        "Falling blocks",
        "Ladders"
      ],
      "answer": 1
    },
    {
      "id": "retro-11",
      "kind": "trivia",
      "prompt": "Which pair of controls did the earliest arcade machines use most often?",
      "choices": [
        "A joystick and a button",
        "A mouse and a wheel",
        "Pedals and a horn",
        "A trackpad"
      ],
      "answer": 0
    }
  ],
  "emoji-decode": [
    {
      "id": "emoji-1",
      "kind": "emoji",
      "clue": "🎬🍿🎟️",
      "label": "Clapperboard, popcorn and cinema ticket",
      "prompt": "What kind of night is this?",
      "choices": [
        "Arcade night",
        "Movie night",
        "Game night",
        "Quiz night"
      ],
      "answer": 1
    },
    {
      "id": "emoji-3",
      "kind": "emoji",
      "clue": "⏰➡️💨",
      "label": "Alarm clock with movement lines",
      "prompt": "What is running out?",
      "choices": [
        "Lives",
        "Time",
        "Answers",
        "Coins"
      ],
      "answer": 1
    },
    {
      "id": "emoji-5",
      "kind": "emoji",
      "clue": "🔗👥🎮",
      "label": "Link, two people and a game controller",
      "prompt": "What is being shared?",
      "choices": [
        "An invite link",
        "A score",
        "A password",
        "A rule set"
      ],
      "answer": 0
    },
    {
      "id": "emoji-7",
      "kind": "emoji",
      "clue": "🚢🎯💥",
      "label": "Ship, target and explosion",
      "prompt": "Which of our games does this hint at?",
      "choices": [
        "Pong Rally",
        "Sea Battle",
        "Maze Runner",
        "Mastermind"
      ],
      "answer": 1
    },
    {
      "id": "emoji-9",
      "kind": "emoji",
      "clue": "🃏🔄👀",
      "label": "Card, repeat arrows and eyes",
      "prompt": "What does this describe?",
      "choices": [
        "A card memory game",
        "A dice duel",
        "A maze race",
        "A drop board"
      ],
      "answer": 0
    },
    {
      "id": "emoji-11",
      "kind": "emoji",
      "clue": "✊✋✌️",
      "label": "Rock, paper and scissors hand signs",
      "prompt": "Which game is this?",
      "choices": [
        "Dice Duel",
        "Rock Paper Scissors",
        "Coin Flip Clash",
        "Laser Duel"
      ],
      "answer": 1
    }
  ],
  "arcade-facts": [
    {
      "id": "facts-1",
      "kind": "trivia",
      "prompt": "What is a ROM in the context of classic arcade hardware?",
      "choices": [
        "A read-only memory chip",
        "A racing wheel",
        "A coin slot",
        "A screen type"
      ],
      "answer": 0
    },
    {
      "id": "facts-3",
      "kind": "trivia",
      "prompt": "What does \"sprite\" mean in 2D game graphics?",
      "choices": [
        "A moving drawn object",
        "A sound effect",
        "A level tile",
        "A score table"
      ],
      "answer": 0
    },
    {
      "id": "facts-5",
      "kind": "trivia",
      "prompt": "What is \"frame rate\" measuring?",
      "choices": [
        "Screens drawn per second",
        "Buttons pressed per minute",
        "Coins per hour",
        "Players per cabinet"
      ],
      "answer": 0
    },
    {
      "id": "facts-7",
      "kind": "trivia",
      "prompt": "What is the job of a \"hitbox\"?",
      "choices": [
        "Checking whether objects collide",
        "Storing high scores",
        "Driving the sound chip",
        "Timing the attract mode"
      ],
      "answer": 0
    },
    {
      "id": "facts-9",
      "kind": "trivia",
      "prompt": "What is a \"game cartridge\" for?",
      "choices": [
        "Holding the game data",
        "Cooling the console",
        "Storing coins",
        "Printing scores"
      ],
      "answer": 0
    },
    {
      "id": "facts-11",
      "kind": "trivia",
      "prompt": "Which of these is a turn-based game shape?",
      "choices": [
        "Grid or board play",
        "Simultaneous tapping races",
        "Live voice chat",
        "Video streaming"
      ],
      "answer": 0
    }
  ],
  "pixel-pop-quiz": [
    {
      "id": "pop-1",
      "kind": "trivia",
      "prompt": "Which decade first put arcade cabinets in shopping centres at scale?",
      "choices": [
        "1950s",
        "1970s",
        "1990s",
        "2010s"
      ],
      "answer": 1
    },
    {
      "id": "pop-3",
      "kind": "trivia",
      "prompt": "In the popular shape-fitting puzzle game, what does a single block-filled row do?",
      "choices": [
        "Disappears and scores points",
        "Turns into a wall",
        "Slows the game",
        "Spawns a coin"
      ],
      "answer": 0
    },
    {
      "id": "pop-5",
      "kind": "trivia",
      "prompt": "What is a speedrun?",
      "choices": [
        "Finishing a game as fast as possible",
        "Playing without sound",
        "Maxing out the score",
        "Finishing without moving"
      ],
      "answer": 0
    },
    {
      "id": "pop-7",
      "kind": "trivia",
      "prompt": "A \"respawn\" is where a player does what?",
      "choices": [
        "Comes back after being knocked out",
        "Leaves the match",
        "Levels up",
        "Changes the difficulty"
      ],
      "answer": 0
    },
    {
      "id": "pop-9",
      "kind": "trivia",
      "prompt": "What is a \"season pass\" usually sold with?",
      "choices": [
        "Extra content over time",
        "A better keyboard",
        "A faster wi-fi plan",
        "Extra controllers"
      ],
      "answer": 0
    },
    {
      "id": "pop-11",
      "kind": "trivia",
      "prompt": "What does \"meta\" describe in a competitive game?",
      "choices": [
        "The currently strongest strategies",
        "The game manual",
        "The final level",
        "The soundtrack"
      ],
      "answer": 0
    }
  ],
  "movie-mayhem": [
    {
      "id": "movie-1",
      "kind": "trivia",
      "prompt": "Which job decides how a film is shot and performed?",
      "choices": [
        "The director",
        "The gaffer",
        "The grip",
        "The colourist"
      ],
      "answer": 0
    },
    {
      "id": "movie-3",
      "kind": "trivia",
      "prompt": "What does \"post-production\" include?",
      "choices": [
        "Editing, sound and effects",
        "Casting the leads",
        "Shooting the scenes",
        "Writing the script"
      ],
      "answer": 0
    },
    {
      "id": "movie-5",
      "kind": "trivia",
      "prompt": "What does a \"montage\" usually show quickly?",
      "choices": [
        "Progress over time",
        "A single line of dialogue",
        "One camera angle",
        "The end credits"
      ],
      "answer": 0
    },
    {
      "id": "movie-7",
      "kind": "trivia",
      "prompt": "Which role writes the script?",
      "choices": [
        "The screenwriter",
        "The producer",
        "The editor",
        "The stunt coordinator"
      ],
      "answer": 0
    },
    {
      "id": "movie-9",
      "kind": "trivia",
      "prompt": "What is a \"teaser trailer\"?",
      "choices": [
        "A very short early trailer",
        "The full film",
        "A blooper reel",
        "A test screening form"
      ],
      "answer": 0
    },
    {
      "id": "movie-11",
      "kind": "trivia",
      "prompt": "What does \"in-camera\" effects mean?",
      "choices": [
        "Tricks captured on set rather than added later",
        "Effects made by the audience",
        "Sound recorded on a phone",
        "A film shot backwards"
      ],
      "answer": 0
    }
  ],
  "word-scramble": [
    {
      "id": "scramble-1",
      "kind": "scramble",
      "prompt": "Unscramble the arcade word.",
      "clue": "R E T O I S",
      "label": "Letters: R E T O I S",
      "choices": [
        "Sorter",
        "Sister",
        "Resort",
        "Toe sir"
      ],
      "answer": 0,
      "note": "It sorts the levels."
    },
    {
      "id": "scramble-3",
      "kind": "scramble",
      "prompt": "Unscramble the word for the hidden digits in Codebreaker.",
      "clue": "S E C E R T",
      "label": "Letters: S E C E R T",
      "choices": [
        "Secret",
        "Crests",
        "Sector",
        "Resect"
      ],
      "answer": 0
    },
    {
      "id": "scramble-5",
      "kind": "scramble",
      "prompt": "Unscramble the word for the extra turn a memory match earns.",
      "clue": "N U O B S",
      "label": "Letters: N U O B S",
      "choices": [
        "Bonus",
        "Bosun",
        "Buns",
        "Snub"
      ],
      "answer": 0
    },
    {
      "id": "scramble-7",
      "kind": "scramble",
      "prompt": "Unscramble the word for a fast button press.",
      "clue": "A T P",
      "label": "Letters: A T P",
      "choices": [
        "Tap",
        "Pat",
        "Apt",
        "Tapa"
      ],
      "answer": 0
    },
    {
      "id": "scramble-9",
      "kind": "scramble",
      "prompt": "Unscramble the word for a private invitation address.",
      "clue": "L I N K",
      "label": "Letters: L I N K",
      "choices": [
        "Link",
        "Klin",
        "Kiln",
        "Ink"
      ],
      "answer": 0
    },
    {
      "id": "scramble-11",
      "kind": "scramble",
      "prompt": "Unscramble the word for the player who opens the match.",
      "clue": "V R E S E",
      "label": "Letters: V R E S E",
      "choices": [
        "Serve",
        "Verse",
        "Sever",
        "Revs"
      ],
      "answer": 0
    }
  ],
  "number-chase": [
    {
      "id": "number-1",
      "kind": "number",
      "prompt": "What comes next in this sequence?",
      "clue": "2, 4, 6, 8, …",
      "label": "Sequence: two, four, six, eight",
      "choices": [
        "9",
        "10",
        "12",
        "11"
      ],
      "answer": 1
    },
    {
      "id": "number-3",
      "kind": "number",
      "prompt": "Three players each score 4 points. What is the total?",
      "clue": "3 × 4",
      "label": "Three times four",
      "choices": [
        "7",
        "12",
        "16",
        "9"
      ],
      "answer": 1
    },
    {
      "id": "number-5",
      "kind": "number",
      "prompt": "Which number is a perfect square?",
      "clue": "√ ? is a whole number",
      "label": "Which of these is a perfect square",
      "choices": [
        "15",
        "20",
        "25",
        "30"
      ],
      "answer": 2
    },
    {
      "id": "number-7",
      "kind": "number",
      "prompt": "A quiz has 5 rounds and each is worth 2 points. What is the maximum score?",
      "clue": "5 × 2",
      "label": "Five times two",
      "choices": [
        "7",
        "10",
        "12",
        "15"
      ],
      "answer": 1
    },
    {
      "id": "number-9",
      "kind": "number",
      "prompt": "You guess 4 digits and 2 are exactly right. How many are not in the right place?",
      "clue": "4 − 2",
      "label": "Four minus two",
      "choices": [
        "1",
        "2",
        "3",
        "4"
      ],
      "answer": 1
    },
    {
      "id": "number-11",
      "kind": "number",
      "prompt": "What is 7 more than 15?",
      "clue": "15 + 7",
      "label": "Fifteen plus seven",
      "choices": [
        "21",
        "22",
        "23",
        "24"
      ],
      "answer": 1
    }
  ],
  "brain-busters": [
    {
      "id": "brain-1",
      "kind": "riddle",
      "prompt": "I have keys but no locks, and space but no room. What am I?",
      "choices": [
        "A keyboard",
        "A piano",
        "A map",
        "A clock"
      ],
      "answer": 0
    },
    {
      "id": "brain-3",
      "kind": "riddle",
      "prompt": "I am full of holes but still hold water. What am I?",
      "choices": [
        "A sponge",
        "A net",
        "A basket",
        "A sieve"
      ],
      "answer": 0
    },
    {
      "id": "brain-5",
      "kind": "riddle",
      "prompt": "What has hands but cannot clap?",
      "choices": [
        "A clock",
        "A puppet",
        "A glove",
        "A statue"
      ],
      "answer": 0
    },
    {
      "id": "brain-7",
      "kind": "riddle",
      "prompt": "I have a face and two hands, but no arms or legs. What am I?",
      "choices": [
        "A clock",
        "A doll",
        "A coin",
        "A mirror"
      ],
      "answer": 0
    },
    {
      "id": "brain-9",
      "kind": "riddle",
      "prompt": "What has one eye but cannot see?",
      "choices": [
        "A needle",
        "A storm",
        "A window",
        "A camera"
      ],
      "answer": 0
    },
    {
      "id": "brain-11",
      "kind": "riddle",
      "prompt": "What runs around a field but never moves?",
      "choices": [
        "A fence",
        "A dog",
        "A stream",
        "A road"
      ],
      "answer": 0
    }
  ],
  "eight-bit-riddles": [
    {
      "id": "riddle-1",
      "kind": "riddle",
      "prompt": "I am a single binary digit. What am I?",
      "choices": [
        "A bit",
        "A byte",
        "A nibble",
        "A pixel"
      ],
      "answer": 0
    },
    {
      "id": "riddle-3",
      "kind": "riddle",
      "prompt": "Count in binary: after 1 comes what?",
      "clue": "1, 10, 11, …",
      "label": "Sequence in binary: one, one zero, one one",
      "choices": [
        "100",
        "111",
        "101",
        "12"
      ],
      "answer": 0
    },
    {
      "id": "riddle-5",
      "kind": "riddle",
      "prompt": "I am one small dot of colour on a screen. What am I?",
      "choices": [
        "A pixel",
        "A bit",
        "A frame",
        "A tile"
      ],
      "answer": 0
    },
    {
      "id": "riddle-7",
      "kind": "riddle",
      "prompt": "Which number system has exactly two symbols?",
      "choices": [
        "Binary",
        "Decimal",
        "Hex",
        "Roman"
      ],
      "answer": 0
    },
    {
      "id": "riddle-9",
      "kind": "riddle",
      "prompt": "What does 1111 equal in decimal?",
      "clue": "8 + 4 + 2 + 1",
      "label": "Eight plus four plus two plus one",
      "choices": [
        "12",
        "14",
        "15",
        "16"
      ],
      "answer": 2
    },
    {
      "id": "riddle-11",
      "kind": "riddle",
      "prompt": "Which value is a power of two?",
      "choices": [
        "12",
        "18",
        "32",
        "40"
      ],
      "answer": 2
    }
  ],
  "retro-rewind": [
    {
      "id": "rewind-1",
      "kind": "trivia",
      "prompt": "Which decade gave us the first home video game consoles people plugged into a TV?",
      "choices": [
        "1950s",
        "1970s",
        "1990s",
        "2000s"
      ],
      "answer": 1
    },
    {
      "id": "rewind-3",
      "kind": "trivia",
      "prompt": "Which connector name belongs to the 1990s-era TV aerial style used by many early consoles?",
      "choices": [
        "RF lead",
        "HDMI",
        "USB-C",
        "DisplayPort"
      ],
      "answer": 0
    },
    {
      "id": "rewind-5",
      "kind": "trivia",
      "prompt": "Which control layout did most 1980s consoles standardise on?",
      "choices": [
        "A direction pad plus two buttons",
        "A mouse and keyboard",
        "A touchscreen",
        "Two analogue sticks only"
      ],
      "answer": 0
    },
    {
      "id": "rewind-7",
      "kind": "trivia",
      "prompt": "Which colour palette limit is typical of 1980s consoles?",
      "choices": [
        "A handful of colours on screen",
        "Millions per sprite",
        "Unlimited gradients",
        "Full 4K detail"
      ],
      "answer": 0
    },
    {
      "id": "rewind-9",
      "kind": "trivia",
      "prompt": "Which decade brought widely available online console play to living rooms?",
      "choices": [
        "1970s",
        "1980s",
        "2000s",
        "1940s"
      ],
      "answer": 2
    },
    {
      "id": "rewind-11",
      "kind": "trivia",
      "prompt": "Which screen type did most 1990s arcade cabinets use?",
      "choices": [
        "CRT",
        "E-ink",
        "OLED",
        "Hologram"
      ],
      "answer": 0
    }
  ]
};

/** Every warm-up item id, so the backend can keep these out of online decks. */
export const PRACTICE_ITEM_IDS = (["retro-1","retro-3","retro-5","retro-7","retro-9","retro-11","emoji-1","emoji-3","emoji-5","emoji-7","emoji-9","emoji-11","facts-1","facts-3","facts-5","facts-7","facts-9","facts-11","pop-1","pop-3","pop-5","pop-7","pop-9","pop-11","movie-1","movie-3","movie-5","movie-7","movie-9","movie-11","scramble-1","scramble-3","scramble-5","scramble-7","scramble-9","scramble-11","number-1","number-3","number-5","number-7","number-9","number-11","brain-1","brain-3","brain-5","brain-7","brain-9","brain-11","riddle-1","riddle-3","riddle-5","riddle-7","riddle-9","riddle-11","rewind-1","rewind-3","rewind-5","rewind-7","rewind-9","rewind-11"]);

/** @param {string} itemId @returns {boolean} whether this id belongs to the shipped warm-up set. */
export function isPracticeItem(itemId) {
  return PRACTICE_ITEM_IDS.includes(itemId);
}

/** @param {string} gameId @returns {QuizItem[]} the browser-safe items for one game. */
export function practiceBankFor(gameId) {
  return PRACTICE_BANKS[gameId] ?? [];
}
