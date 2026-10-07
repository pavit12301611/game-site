// The catalog. Adding a game to the arcade = adding ONE import + ONE line below.
// Everything else (cards, filters, pages, stats) reads from here.
import tictactoe from './tictactoe.js';
import connect4 from './connect4.js';
import dotsboxes from './dotsboxes.js';
import memory from './memory.js';
import minesweeper from './minesweeper.js';
import g2048 from './g2048.js';
import codebreaker from './codebreaker.js';
import quiz from './quiz.js';
import rps from './rps.js';
import whack from './whack.js';
import snake from './snake.js';
import pong from './pong.js';

const DEFS = [
  tictactoe,
  connect4,
  dotsboxes,
  memory,
  minesweeper,
  g2048,
  codebreaker,
  quiz,
  rps,
  whack,
  snake,
  pong,
];

const REQUIRED = ['id', 'name', 'tagline', 'genre', 'players', 'icon', 'modes', 'howTo', 'mount'];

function validate(def) {
  for (const key of REQUIRED) {
    if (def[key] === undefined || def[key] === null) {
      throw new Error(`Game "${def.id || '?'}' is missing required field: ${key}`);
    }
  }
  if (typeof def.mount !== 'function') throw new Error(`Game "${def.id}" mount must be a function`);
  if (!Array.isArray(def.modes) || def.modes.length === 0) {
    throw new Error(`Game "${def.id}" needs at least one mode`);
  }
  if (!Array.isArray(def.howTo) || def.howTo.length === 0) {
    throw new Error(`Game "${def.id}" needs howTo instructions`);
  }
  if (!['solo', '2p', 'both'].includes(def.players)) {
    throw new Error(`Game "${def.id}" players must be solo, 2p or both`);
  }
  return Object.freeze(def);
}

export const GAMES = Object.freeze(DEFS.map(validate));

const ids = new Set();
for (const g of GAMES) {
  if (ids.has(g.id)) throw new Error(`Duplicate game id: ${g.id}`);
  ids.add(g.id);
}

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}

export const GENRES = Object.freeze([...new Set(GAMES.map((g) => g.genre))]);

export const PLAYERS_LABEL = { solo: 'Solo', '2p': '2 players', both: 'Solo · 2P' };

export function filterGames({ q = '', genre = 'All', players = 'All' } = {}) {
  const needle = q.trim().toLowerCase();
  return GAMES.filter((g) => {
    if (genre !== 'All' && g.genre !== genre) return false;
    if (players !== 'All') {
      if (players === 'Solo' && g.players === '2p') return false;
      if (players === '2P' && g.players === 'solo') return false;
    }
    if (needle && !`${g.name} ${g.tagline} ${g.genre}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}
