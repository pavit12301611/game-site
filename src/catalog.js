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

export const QUIZ_QUESTIONS = [
  { prompt: 'Which classic game asks you to clear lines by fitting falling blocks?', choices: ['Tetris', 'Pong', 'Asteroids', 'Frogger'], answer: 0 },
  { prompt: 'In Pac-Man, what does the player collect through the maze?', choices: ['Rings', 'Pellets', 'Stars', 'Keys'], answer: 1 },
  { prompt: 'Which game is famous for two paddles and a bouncing square ball?', choices: ['Pong', 'Snake', 'Breakout', 'Space Invaders'], answer: 0 },
  { prompt: 'What does a chess knight move look like?', choices: ['A straight line', 'An L shape', 'A circle', 'A diagonal only'], answer: 1 },
  { prompt: 'Which animal is the hero of the classic game Frogger?', choices: ['A turtle', 'A rabbit', 'A frog', 'A duck'], answer: 2 },
  { prompt: 'In Space Invaders, what are you defending Earth from?', choices: ['Aliens', 'Pirates', 'Robots', 'Asteroids'], answer: 0 },
  { prompt: 'Which handheld console made its debut in 1989?', choices: ['Game Boy', 'PSP', 'Switch', 'Steam Deck'], answer: 0 },
  { prompt: 'In a standard deck, how many suits are there?', choices: ['Two', 'Three', 'Four', 'Five'], answer: 2 },
  { prompt: 'What is the usual goal in a game of Breakout?', choices: ['Catch a ball', 'Clear all the bricks', 'Find a hidden word', 'Race a car'], answer: 1 },
  { prompt: 'Which color is NOT on a standard traffic light?', choices: ['Red', 'Amber', 'Green', 'Purple'], answer: 3 },
];

const memoryIcons = ['✦', '☻', '♫', '◆', '⚡', '☾', '✿', '◉', '♜', '▲', '●', '▣'];
const mazeWalls = [8, 9, 11, 15, 18, 22, 24, 25, 29, 32, 33, 37, 38];

function copy(value) {
  return structuredClone(value);
}

function hashNumber(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed) {
  let state = hashNumber(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, seed) {
  const items = [...values];
  const random = makeRandom(seed);
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function nextPlayer(players, uid) {
  const index = players.findIndex((player) => player.uid === uid);
  return players[(index + 1 + players.length) % players.length]?.uid ?? uid;
}

function winnerFromScores(players, scores) {
  const highScore = Math.max(0, ...players.map((player) => scores[player.uid] ?? 0));
  const winners = players.filter((player) => (scores[player.uid] ?? 0) === highScore);
  return winners.length === 1 ? winners[0].uid : null;
}

function newBase(players, firstUid) {
  return {
    phase: 'playing',
    turnUid: firstUid ?? players[0]?.uid ?? null,
    winnerUid: null,
    result: null,
    moves: 0,
  };
}

export function getGame(gameId) {
  return GAMES.find((game) => game.id === gameId) ?? null;
}

export function createInitialGameState(gameOrId, players, seed = 'psd') {
  const game = typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
  if (!game) throw new Error('That game could not be found.');
  if (!Array.isArray(players) || players.length < 1) throw new Error('At least one player is required.');
  const base = newBase(players);
  const ids = players.map((player) => player.uid);

  switch (game.engine) {
    case 'line': {
      const size = game.options.size;
      return { ...base, board: Array(size * size).fill(null), size, connect: game.options.connect };
    }
    case 'drop': {
      const { cols, rows } = game.options;
      return { ...base, board: Array(cols * rows).fill(null), cols, rows, connect: game.options.connect };
    }
    case 'memory': {
      const pairs = Math.min(game.options.pairs, memoryIcons.length);
      const icons = shuffled(memoryIcons, `${seed}:${game.id}`).slice(0, pairs);
      const cards = shuffled([...icons, ...icons], `${seed}:${game.id}:deck`);
      return {
        ...base,
        turnUid: ids[0],
        cards,
        opened: [],
        matched: [],
        scores: Object.fromEntries(ids.map((uid) => [uid, 0])),
        round: 1,
      };
    }
    case 'race':
    case 'rally':
      return {
        ...base,
        turnUid: game.engine === 'race' ? null : ids[0],
        scores: Object.fromEntries(ids.map((uid) => [uid, 0])),
        target: game.options.target,
        lastAction: null,
      };
    case 'rps':
      return {
        ...base,
        turnUid: null,
        mode: game.options.mode,
        picks: {},
        scores: Object.fromEntries(ids.map((uid) => [uid, 0])),
        target: game.options.target,
        round: 1,
        lastRound: null,
      };
    case 'quiz':
      return {
        ...base,
        turnUid: null,
        questionIndex: 0,
        answers: {},
        scores: Object.fromEntries(ids.map((uid) => [uid, 0])),
        rounds: game.options.rounds,
        lastRound: null,
      };
    case 'maze': {
      const width = game.options.width;
      const height = game.options.height;
      const starts = players.map((_, index) => ({ x: index * 2, y: height - 1 }));
      return {
        ...base,
        turnUid: null,
        width,
        height,
        walls: [...mazeWalls],
        positions: Object.fromEntries(players.map((player, index) => [player.uid, starts[index]])),
        goal: { x: width - 1, y: 0 },
        scores: Object.fromEntries(ids.map((uid) => [uid, 0])),
      };
    }
    case 'battle': {
      const boardSize = game.options.board;
      const random = makeRandom(`${seed}:${game.id}:fleet`);
      const ships = {};
      for (const player of players) {
        const positions = new Set();
        while (positions.size < game.options.fleet) positions.add(Math.floor(random() * boardSize * boardSize));
        ships[player.uid] = [...positions];
      }
      return {
        ...base,
        turnUid: ids[0],
        boardSize,
        ships,
        shots: Object.fromEntries(ids.map((uid) => [uid, []])),
        lastShot: null,
      };
    }
    case 'code': {
      const random = makeRandom(`${seed}:${game.id}:code`);
      const digits = game.options.digits;
      const secret = Array.from({ length: digits }, () => Math.floor(random() * 6));
      return {
        ...base,
        secret,
        guesses: [],
        digits,
        maxGuesses: game.options.maxGuesses,
        turnIndex: 0,
      };
    }
    default:
      throw new Error(`The ${game.engine} game mode is not available.`);
  }
}

function isFinished(state) {
  if (state.phase !== 'playing') throw new Error('This round is already over.');
}

function isTurn(state, uid) {
  if (state.turnUid && state.turnUid !== uid) throw new Error('Wait for your turn.');
}

function advanceTurn(state, players, uid) {
  state.turnUid = nextPlayer(players, uid);
}

function resolveLineWinner(board, size, index, uid, connect) {
  const row = Math.floor(index / size);
  const col = index % size;
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of directions) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let x = col + dx * sign;
      let y = row + dy * sign;
      while (x >= 0 && x < size && y >= 0 && y < size && board[y * size + x] === uid) {
        count += 1;
        x += dx * sign;
        y += dy * sign;
      }
    }
    if (count >= connect) return true;
  }
  return false;
}

function finishByScore(state, players, scoreMap) {
  const winnerUid = winnerFromScores(players, scoreMap);
  state.phase = 'finished';
  state.winnerUid = winnerUid;
  state.result = winnerUid ? 'winner' : 'draw';
}

function checkRpsRound(game, state, players, uid, action) {
  const picks = { ...state.picks };
  if (Object.hasOwn(picks, uid)) throw new Error('Your choice is already locked in.');
  const choice = action.choice;
  const available = state.mode === 'rps' ? ['rock', 'paper', 'scissors'] : state.mode === 'coin' ? ['heads', 'tails'] : ['1', '2', '3', '4', '5', '6'];
  if (!available.includes(String(choice))) throw new Error('Choose one of the options on screen.');
  picks[uid] = String(choice);
  state.picks = picks;
  state.moves += 1;
  if (players.every((player) => Object.hasOwn(picks, player.uid))) {
    const scoreMap = { ...state.scores };
    let winners = [];
    if (state.mode === 'rps') {
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const points = Object.fromEntries(players.map((player) => [player.uid, 0]));
      for (const player of players) {
        for (const opponent of players) {
          if (player.uid !== opponent.uid && beats[picks[player.uid]] === picks[opponent.uid]) points[player.uid] += 1;
        }
      }
      const max = Math.max(...Object.values(points));
      if (max > 0) winners = players.filter((player) => points[player.uid] === max);
    } else if (state.mode === 'dice') {
      const max = Math.max(...players.map((player) => Number(picks[player.uid])));
      winners = players.filter((player) => Number(picks[player.uid]) === max);
    } else {
      const result = hashNumber(`${game.id}:${state.round}:${players.map((player) => picks[player.uid]).join(':')}`) % 2 === 0 ? 'heads' : 'tails';
      winners = players.filter((player) => picks[player.uid] === result);
    }
    if (winners.length === 1) scoreMap[winners[0].uid] = (scoreMap[winners[0].uid] ?? 0) + 1;
    state.scores = scoreMap;
    state.lastRound = { picks, winnerUids: winners.map((player) => player.uid), round: state.round };
    state.picks = {};
    state.round += 1;
    if (Math.max(...Object.values(scoreMap)) >= state.target) finishByScore(state, players, scoreMap);
  }
  return state;
}

export function applyGameAction(gameOrId, currentState, uid, action, players) {
  const game = typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
  if (!game || !currentState || !players.some((player) => player.uid === uid)) throw new Error('You are not in this game.');
  const state = copy(currentState);
  isFinished(state);

  switch (game.engine) {
    case 'line': {
      isTurn(state, uid);
      const index = Number(action.index);
      if (!Number.isInteger(index) || index < 0 || index >= state.board.length || state.board[index] !== null) throw new Error('That square is not available.');
      state.board[index] = uid;
      state.moves += 1;
      if (resolveLineWinner(state.board, state.size, index, uid, state.connect)) {
        state.phase = 'finished'; state.winnerUid = uid; state.result = 'winner';
      } else if (state.board.every(Boolean)) {
        state.phase = 'finished'; state.result = 'draw';
      } else advanceTurn(state, players, uid);
      return state;
    }
    case 'drop': {
      isTurn(state, uid);
      const col = Number(action.col);
      if (!Number.isInteger(col) || col < 0 || col >= state.cols) throw new Error('That column is not available.');
      let row = state.rows - 1;
      while (row >= 0 && state.board[row * state.cols + col] !== null) row -= 1;
      if (row < 0) throw new Error('That column is full.');
      const index = row * state.cols + col;
      state.board[index] = uid;
      state.moves += 1;
      if (resolveLineWinner(state.board, state.cols, index, uid, state.connect)) {
        state.phase = 'finished'; state.winnerUid = uid; state.result = 'winner';
      } else if (state.board.every(Boolean)) {
        state.phase = 'finished'; state.result = 'draw';
      } else advanceTurn(state, players, uid);
      return state;
    }
    case 'memory': {
      isTurn(state, uid);
      const index = Number(action.index);
      if (!Number.isInteger(index) || index < 0 || index >= state.cards.length || state.matched.includes(index)) throw new Error('That card is not available.');
      if (state.opened.length === 1 && state.opened[0] === index) throw new Error('Flip a different card.');
      const opened = state.opened.length >= 2 ? [] : [...state.opened];
      opened.push(index);
      state.opened = opened;
      state.moves += 1;
      if (opened.length === 2) {
        const [first, second] = opened;
        if (state.cards[first] === state.cards[second]) {
          state.matched = [...state.matched, first, second];
          state.scores[uid] = (state.scores[uid] ?? 0) + 1;
          if (state.matched.length === state.cards.length) finishByScore(state, players, state.scores);
        } else {
          advanceTurn(state, players, uid);
        }
      }
      return state;
    }
    case 'race': {
      if (action.type !== 'tap') throw new Error('Tap the boost button to score.');
      const scoreMap = { ...state.scores, [uid]: (state.scores[uid] ?? 0) + 1 };
      state.scores = scoreMap;
      state.moves += 1;
      state.lastAction = { uid, time: state.moves };
      if (scoreMap[uid] >= state.target) { state.phase = 'finished'; state.winnerUid = uid; state.result = 'winner'; }
      return state;
    }
    case 'rps':
      return checkRpsRound(game, state, players, uid, action);
    case 'quiz': {
      const ids = players.map((player) => player.uid);
      if (action.type === 'next') {
        const allAnswered = ids.every((playerUid) => Object.hasOwn(state.answers, playerUid));
        if (!allAnswered) throw new Error('Wait for everyone to answer first.');
        if (state.questionIndex + 1 >= state.rounds) { finishByScore(state, players, state.scores); return state; }
        state.questionIndex += 1;
        state.answers = {};
        state.lastRound = null;
        return state;
      }
      if (Object.hasOwn(state.answers, uid)) throw new Error('You have already answered this round.');
      const question = QUIZ_QUESTIONS[state.questionIndex % QUIZ_QUESTIONS.length];
      const answer = Number(action.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= question.choices.length) throw new Error('Choose one of the answers.');
      const answers = { ...state.answers, [uid]: answer };
      state.answers = answers;
      state.moves += 1;
      if (ids.every((playerUid) => Object.hasOwn(answers, playerUid))) {
        const scores = { ...state.scores };
        for (const player of players) if (answers[player.uid] === question.answer) scores[player.uid] = (scores[player.uid] ?? 0) + 1;
        state.scores = scores;
        state.lastRound = { answers, correct: question.answer, questionIndex: state.questionIndex };
      }
      return state;
    }
    case 'maze': {
      const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const delta = directions[action.direction];
      if (!delta) throw new Error('Choose a direction to move.');
      const position = state.positions[uid];
      const x = position.x + delta[0];
      const y = position.y + delta[1];
      const index = y * state.width + x;
      if (x < 0 || x >= state.width || y < 0 || y >= state.height || state.walls.includes(index)) throw new Error('There is a wall in the way.');
      state.positions[uid] = { x, y };
      state.scores[uid] = (state.scores[uid] ?? 0) + 1;
      state.moves += 1;
      if (x === state.goal.x && y === state.goal.y) { state.phase = 'finished'; state.winnerUid = uid; state.result = 'winner'; }
      return state;
    }
    case 'battle': {
      isTurn(state, uid);
      const targetUid = String(action.targetUid ?? '');
      const index = Number(action.index);
      if (!players.some((player) => player.uid === targetUid) || targetUid === uid) throw new Error('Choose another player’s board.');
      if (!Number.isInteger(index) || index < 0 || index >= state.boardSize * state.boardSize) throw new Error('Choose a square on the board.');
      const key = `${targetUid}:${index}`;
      if (state.shots[uid].includes(key)) throw new Error('You have already fired at that square.');
      state.shots[uid] = [...state.shots[uid], key];
      const hit = state.ships[targetUid].includes(index);
      state.lastShot = { shooterUid: uid, targetUid, index, hit };
      state.moves += 1;
      const allSunk = players.filter((player) => player.uid !== uid).every((opponent) =>
        state.ships[opponent.uid].every((shipIndex) => state.shots[uid].includes(`${opponent.uid}:${shipIndex}`))
      );
      if (allSunk) { state.phase = 'finished'; state.winnerUid = uid; state.result = 'winner'; }
      else advanceTurn(state, players, uid);
      return state;
    }
    case 'rally': {
      isTurn(state, uid);
      const lane = Number(action.lane);
      if (!Number.isInteger(lane) || lane < 0 || lane > 2) throw new Error('Choose a volley lane.');
      const scoreMap = { ...state.scores, [uid]: (state.scores[uid] ?? 0) + 1 };
      state.scores = scoreMap;
      state.moves += 1;
      state.lastAction = { uid, lane, move: state.moves };
      if (scoreMap[uid] >= state.target) { state.phase = 'finished'; state.winnerUid = uid; state.result = 'winner'; }
      else advanceTurn(state, players, uid);
      return state;
    }
    case 'code': {
      isTurn(state, uid);
      const guess = Array.isArray(action.guess) ? action.guess.map(Number) : [];
      if (guess.length !== state.digits || guess.some((digit) => !Number.isInteger(digit) || digit < 0 || digit > 5)) throw new Error('Enter a valid sequence of four digits.');
      const exact = guess.reduce((count, digit, index) => count + (digit === state.secret[index] ? 1 : 0), 0);
      const unmatchedSecret = [];
      const unmatchedGuess = [];
      for (let index = 0; index < state.digits; index += 1) {
        if (guess[index] !== state.secret[index]) { unmatchedGuess.push(guess[index]); unmatchedSecret.push(state.secret[index]); }
      }
      let misplaced = 0;
      for (const digit of unmatchedGuess) {
        const found = unmatchedSecret.indexOf(digit);
        if (found !== -1) { misplaced += 1; unmatchedSecret.splice(found, 1); }
      }
      state.guesses = [...state.guesses, { uid, guess, exact, misplaced }];
      state.moves += 1;
      if (exact === state.digits) { state.phase = 'finished'; state.winnerUid = uid; state.result = 'winner'; }
      else if (state.guesses.length >= state.maxGuesses) { state.phase = 'finished'; state.result = 'draw'; }
      else advanceTurn(state, players, uid);
      return state;
    }
    default:
      throw new Error('This game mode is not ready yet.');
  }
}

export function getQuizQuestion(index) {
  return QUIZ_QUESTIONS[index % QUIZ_QUESTIONS.length];
}

export function getMemoryCardIcon(index) {
  return memoryIcons[index % memoryIcons.length];
}

export const GAME_COVERS = {
  Arcade: '/images/cover-arcade.jpg',
  Strategy: '/images/cover-strategy.jpg',
  Puzzle: '/images/cover-puzzle.jpg',
  Party: '/images/cover-party.jpg',
  Multiplayer: '/images/cover-multiplayer.jpg',
  Hero: '/images/hero-arcade.jpg',
};

const ENGINE_LABELS = {
  line: 'GRID TACTICS',
  drop: 'DROP BOARD',
  memory: 'MEMORY MATRIX',
  race: 'SPEED SPRINT',
  rps: 'QUICK DUEL',
  quiz: 'BRAIN ROUND',
  maze: 'LABYRINTH DASH',
  battle: 'FLEET RADAR',
  rally: 'COURT VOLLEY',
  code: 'CIPHER LOGIC',
};

const FOCAL_POSITIONS = [
  'center 40%',
  '35% 50%',
  '65% 45%',
  '50% 62%',
  '42% 35%',
  '58% 58%',
];

export function getGameArtwork(gameOrId) {
  const game = typeof gameOrId === 'string' ? getGame(gameOrId) : gameOrId;
  if (!game) {
    return {
      src: GAME_COVERS.Arcade,
      focal: 'center center',
      engineLabel: 'ARCADE',
    };
  }
  const index = Math.max(0, GAMES.findIndex((entry) => entry.id === game.id));
  let src = GAME_COVERS[game.category] || GAME_COVERS.Arcade;
  if (game.engine === 'rally' || (game.engine === 'battle' && game.category === 'Arcade')) {
    src = index % 2 === 0 ? GAME_COVERS.Multiplayer : src;
  }
  return {
    src,
    focal: FOCAL_POSITIONS[index % FOCAL_POSITIONS.length],
    engineLabel: ENGINE_LABELS[game.engine] || 'ARCADE MODE',
  };
}

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
    case 'rps': {
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
    }
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
