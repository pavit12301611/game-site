// Local-first store: preferences + per-game stats in localStorage.
// Works in Node too (memory fallback) so game logic stays testable.

const mem = new Map();

function storage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode etc. */
  }
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}

function read(key, fallback) {
  try {
    const raw = storage().getItem(key);
    if (!raw) return structuredCloneFallback(fallback);
    return { ...structuredCloneFallback(fallback), ...JSON.parse(raw) };
  } catch {
    return structuredCloneFallback(fallback);
  }
}

function structuredCloneFallback(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function write(key, value) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    /* storage full/blocked — the arcade still plays */
  }
}

const DEFAULT_PREFS = {
  theme: 'dark',
  sound: true,
  name1: 'Player 1',
  name2: 'Player 2',
  difficulty: 'medium',
};

export const prefs = {
  _key: 'psd2.prefs',
  _subs: new Set(),
  get() {
    return read(this._key, DEFAULT_PREFS);
  },
  set(patch) {
    const next = { ...this.get(), ...patch };
    write(this._key, next);
    for (const fn of this._subs) fn(next);
    return next;
  },
  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  },
};

function blankStat() {
  return { plays: 0, p0: 0, p1: 0, draws: 0, best: 0 };
}

export const stats = {
  _key: 'psd2.stats',
  _all() {
    try {
      return JSON.parse(storage().getItem(this._key) || '{}');
    } catch {
      return {};
    }
  },
  get(gameId) {
    return { ...blankStat(), ...(this._all()[gameId] || {}) };
  },
  /** winner: 0 | 1 | 'draw' | null (solo/unranked). score: optional numeric best (higher = better). */
  record(gameId, { winner = null, score = null } = {}) {
    const all = this._all();
    const s = { ...blankStat(), ...(all[gameId] || {}) };
    s.plays += 1;
    if (winner === 0) s.p0 += 1;
    else if (winner === 1) s.p1 += 1;
    else if (winner === 'draw') s.draws += 1;
    if (typeof score === 'number' && Number.isFinite(score) && score > s.best) s.best = score;
    all[gameId] = s;
    write(this._key, all);
    return s;
  },
  totals() {
    const all = this._all();
    let plays = 0;
    for (const s of Object.values(all)) plays += s.plays || 0;
    return { plays, gamesPlayed: Object.keys(all).length };
  },
  reset(gameId) {
    const all = this._all();
    delete all[gameId];
    write(this._key, all);
  },
};
