// The arcade shell: header, router views (library + game page), footer, toasts.
import { h, clear } from './core/dom.js';
import { prefs, stats } from './core/store.js';
import { sfx, unlockAudio } from './core/sound.js';
import { parseHash, navigate, subscribe, gamePath } from './core/router.js';
import { GAMES, GENRES, PLAYERS_LABEL, getGame, filterGames } from './games/registry.js';

const filters = { q: '', genre: 'All', players: 'All' };
let toastBox = null;

export function toast(msg) {
  if (!toastBox) return;
  const el = h('div', { class: 'toast', text: msg });
  toastBox.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2400);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'light' ? '#f4f2ff' : '#0b0e1a',
  );
}

function statSummary(id) {
  const s = stats.get(id);
  const parts = [];
  if (s.plays > 0) parts.push(`▶ ${s.plays}`);
  if (s.best > 0) parts.push(`★ ${s.best}`);
  const wins = s.p0 + s.p1;
  if (wins > 0) parts.push(`🏆 ${wins}`);
  return parts.join('  ·  ') || 'Unplayed — be the first';
}

function gameCard(game) {
  const card = h('button', {
    class: 'card',
    onclick: () => {
      sfx.play('click');
      navigate(gamePath(game.id, { mode: game.modes[0].id }));
    },
    'aria-label': `Play ${game.name}: ${game.tagline}`,
  });
  card.style.setProperty('--hue', String(game.hue ?? 220));
  card.append(
    h('div', { class: 'card-top' },
      h('span', { class: 'card-icon', text: game.icon }),
      h('span', { class: 'chip', text: game.genre })),
    h('h3', { text: game.name }),
    h('p', { class: 'card-tag', text: game.tagline }),
    h('div', { class: 'card-meta' },
      h('span', { text: PLAYERS_LABEL[game.players] }),
      h('span', { class: 'card-stats', text: statSummary(game.id) })),
    h('span', { class: 'card-play', text: 'Play →' }),
  );
  return card;
}

function homeView(view) {
  const totals = stats.totals();
  const hero = h('section', { class: 'hero' },
    h('p', { class: 'eyebrow', text: '🎮 Browser arcade · no downloads · no sign-up' }),
    h('h1', {}, 'Pick a game. ', h('span', { class: 'grad', text: 'Play in seconds.' })),
    h('p', { class: 'lede', text: 'Twelve original mini-games against the CPU or a friend. Your scores never leave this browser.' }),
    h('div', { class: 'hero-chips' },
      h('span', { class: 'chip big', text: `${GAMES.length} games` }),
      h('span', { class: 'chip big', text: `${totals.plays} plays` }),
      h('span', { class: 'chip big', text: 'Solo · CPU · 2P' })),
  );

  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: 'Search games…  ( / )',
    value: filters.q,
    'aria-label': 'Search games',
  });
  search.addEventListener('input', () => {
    filters.q = search.value;
    paintGrid();
  });

  const genreRow = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by genre' });
  for (const g of ['All', ...GENRES]) {
    genreRow.append(
      h('button', {
        class: `chip btn${filters.genre === g ? ' on' : ''}`,
        'aria-pressed': filters.genre === g ? 'true' : 'false',
        onclick: () => {
          filters.genre = g;
          sfx.play('click');
          renderHome();
        },
      }, g),
    );
  }
  const playerRow = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by players' });
  for (const p of ['All', 'Solo', '2P']) {
    playerRow.append(
      h('button', {
        class: `chip btn${filters.players === p ? ' on' : ''}`,
        'aria-pressed': filters.players === p ? 'true' : 'false',
        onclick: () => {
          filters.players = p;
          sfx.play('click');
          renderHome();
        },
      }, p === 'All' ? 'Any players' : p),
    );
  }

  const toolbar = h('section', { class: 'toolbar' }, search, genreRow, playerRow);
  const grid = h('section', { class: 'grid', 'aria-label': 'Games' });

  function paintGrid() {
    clear(grid);
    const list = filterGames(filters);
    if (list.length === 0) {
      grid.append(
        h('div', { class: 'empty' },
          h('p', { class: 'empty-emoji', text: '🕹️' }),
          h('p', { text: 'No games match that combo.' }),
          h('button', {
            class: 'btn btn-ghost', onclick: () => {
              filters.q = '';
              filters.genre = 'All';
              filters.players = 'All';
              renderHome();
            },
          }, 'Clear filters')),
      );
      return;
    }
    for (const g of list) grid.append(gameCard(g));
  }

  function renderHome() {
    clear(view);
    homeView(view);
    view.querySelector('.search')?.focus({ preventScroll: true });
    const s = view.querySelector('.search');
    if (s) s.setSelectionRange(s.value.length, s.value.length);
  }

  view.append(hero, toolbar, grid);
  paintGrid();
}

function gameView(view, id, params) {
  const game = getGame(id);
  if (!game) {
    view.append(
      h('div', { class: 'empty' },
        h('p', { class: 'empty-emoji', text: '👾' }),
        h('h1', { text: 'That game escaped the arcade' }),
        h('button', { class: 'btn btn-primary', onclick: () => navigate('/') }, 'Back to the library')),
    );
    return () => {};
  }

  document.title = `${game.name} — PSD Gaming`;

  const mode = game.modes.some((m) => m.id === params.mode) ? params.mode : game.modes[0].id;
  const diffs = game.difficulties || [];
  const difficulty = diffs.some((d) => d.id === params.diff)
    ? params.diff
    : diffs.some((d) => d.id === prefs.get().difficulty)
      ? prefs.get().difficulty
      : diffs[0]?.id || 'medium';

  const head = h('div', { class: 'game-head' },
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => navigate('/') }, '← Library'),
    h('div', { class: 'game-title', style: '' },
      h('span', { class: 'game-icon', text: game.icon }),
      h('div', {},
        h('h1', { text: game.name }),
        h('p', { class: 'muted', text: `${game.tagline} · ${game.genre} · ${PLAYERS_LABEL[game.players]}` }))),
  );
  head.style.setProperty('--hue', String(game.hue ?? 220));

  // Controls
  const controls = h('div', { class: 'game-controls' });
  if (game.modes.length > 1) {
    const tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Game mode' });
    for (const m of game.modes) {
      tabs.append(
        h('button', {
          class: `seg-btn${m.id === mode ? ' on' : ''}`,
          role: 'tab',
          'aria-selected': m.id === mode ? 'true' : 'false',
          onclick: () => {
            sfx.play('click');
            navigate(gamePath(id, { mode: m.id, diff: difficulty }));
          },
        }, m.label),
      );
    }
    controls.append(h('label', { class: 'ctl' }, h('span', { text: 'Mode' }), tabs));
  }
  if (diffs.length > 0) {
    const sel = h('select', {
      class: 'select',
      'aria-label': 'Difficulty',
      onchange: (e) => {
        sfx.play('click');
        prefs.set({ difficulty: e.target.value });
        navigate(gamePath(id, { mode, diff: e.target.value }));
      },
    });
    for (const d of diffs) {
      const opt = h('option', { value: d.id, text: d.label });
      if (d.id === difficulty) opt.selected = true;
      sel.append(opt);
    }
    controls.append(h('label', { class: 'ctl' }, h('span', { text: 'Level' }), sel));
  }

  const needsP2 = mode === 'local';
  const needsP1 = mode === 'cpu' || mode === 'local';
  const p = prefs.get();
  if (needsP1) {
    const n1 = h('input', {
      class: 'input name', value: mode === 'cpu' ? (p.name1 === 'Player 1' ? 'You' : p.name1) : p.name1,
      maxlength: '14', 'aria-label': 'Player 1 name',
      onchange: (e) => {
        prefs.set({ name1: e.target.value.trim() || 'Player 1' });
        remount();
      },
    });
    controls.append(h('label', { class: 'ctl' }, h('span', { text: mode === 'cpu' ? 'Your name' : 'Player 1' }), n1));
  }
  if (needsP2) {
    const n2 = h('input', {
      class: 'input name', value: p.name2, maxlength: '14', 'aria-label': 'Player 2 name',
      onchange: (e) => {
        prefs.set({ name2: e.target.value.trim() || 'Player 2' });
        remount();
      },
    });
    controls.append(h('label', { class: 'ctl' }, h('span', { text: 'Player 2' }), n2));
  }

  // Arena + side panel
  const arena = h('section', { class: 'arena', 'aria-label': `${game.name} play area` });
  const side = h('aside', { class: 'side' });
  const howTo = h('section', { class: 'panel' },
    h('h2', { text: 'How to play' }),
    h('ol', { class: 'howto' }, ...game.howTo.map((t) => h('li', { text: t }))));

  const s = stats.get(id);
  const statPanel = h('section', { class: 'panel' },
    h('h2', { text: 'Your table stats' }),
    h('div', { class: 'stat-rows' },
      h('div', {}, h('span', { text: 'Plays' }), h('strong', { text: String(s.plays) })),
      (s.p0 + s.p1 > 0 || s.draws > 0)
        ? h('div', {}, h('span', { text: 'W / D' }), h('strong', { text: `${s.p0 + s.p1} / ${s.draws}` }))
        : null,
      s.best > 0 ? h('div', {}, h('span', { text: 'Best' }), h('strong', { text: String(s.best) })) : null,
      h('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: () => {
          stats.reset(id);
          sfx.play('click');
          toast('Stats cleared for this game');
          navigate(gamePath(id, { mode, diff: difficulty }));
        },
      }, 'Reset stats')),
  );

  const related = [
    ...GAMES.filter((g) => g.genre === game.genre && g.id !== game.id),
    ...GAMES.filter((g) => g.genre !== game.genre && g.id !== game.id),
  ].slice(0, 3);
  const morePanel = h('section', { class: 'panel' },
    h('h2', { text: 'Keep playing' }),
    h('div', { class: 'related' },
      ...related.map((g) =>
        h('button', {
          class: 'rel',
          onclick: () => {
            sfx.play('click');
            navigate(gamePath(g.id, { mode: g.modes[0].id }));
          },
        }, h('span', { text: g.icon }), h('span', { text: g.name }), h('span', { text: '→' })))),
  );
  side.append(howTo, statPanel, morePanel);

  const layout = h('div', { class: 'game-layout' }, arena, side);
  view.append(head, controls, layout);

  let cleanup = null;
  function remount() {
    try {
      cleanup?.();
    } catch (err) {
      console.error('Game cleanup failed', err);
    }
    clear(arena);
    const names = [prefs.get().name1 || 'Player 1', prefs.get().name2 || 'Player 2'];
    try {
      cleanup = game.mount(arena, { mode, difficulty, names, stats, sfx, toast, prefs }) || (() => {});
    } catch (err) {
      console.error(`Game "${id}" crashed`, err);
      arena.append(
        h('div', { class: 'empty' },
          h('p', { class: 'empty-emoji', text: '💥' }),
          h('p', { text: 'This game glitched. Try another cabinet!' }),
          h('button', { class: 'btn btn-primary', onclick: () => navigate('/') }, 'Back to library')),
      );
      cleanup = () => {};
    }
  }
  remount();
  return () => {
    try {
      cleanup?.();
    } catch {
      /* already gone */
    }
  };
}

export function start(root) {
  applyTheme(prefs.get().theme || 'dark');
  window.addEventListener('pointerdown', () => unlockAudio(), { once: true });
  window.addEventListener('keydown', () => unlockAudio(), { once: true });

  const shell = h('div', { class: 'shell' });
  const skip = h('a', { class: 'skip', href: '#view', text: 'Skip to games' });

  const themeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Toggle theme' });
  const paintThemeBtn = () => {
    themeBtn.textContent = prefs.get().theme === 'light' ? '🌙' : '☀️';
  };
  paintThemeBtn();
  themeBtn.addEventListener('click', () => {
    const next = prefs.get().theme === 'light' ? 'dark' : 'light';
    prefs.set({ theme: next });
    applyTheme(next);
    paintThemeBtn();
    sfx.play('click');
  });

  const soundBtn = h('button', { class: 'icon-btn', 'aria-label': 'Toggle sound' });
  const paintSoundBtn = () => {
    soundBtn.textContent = prefs.get().sound ? '🔊' : '🔇';
  };
  paintSoundBtn();
  soundBtn.addEventListener('click', () => {
    prefs.set({ sound: !prefs.get().sound });
    paintSoundBtn();
    sfx.play('click');
  });

  const header = h('header', { class: 'topbar' },
    h('button', {
      class: 'logo', onclick: () => navigate('/'), 'aria-label:': 'PSD Gaming home',
      'aria-label': 'PSD Gaming home',
    }, h('span', { class: 'logo-mark', text: '🎮' }), h('span', { text: 'PSD·GAMING' })),
    h('nav', { class: 'topnav' },
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => navigate('/') }, 'Library'),
      themeBtn,
      soundBtn),
  );

  const view = h('main', { class: 'view', id: 'view', tabindex: '-1' });
  const footer = h('footer', { class: 'footer' },
    h('p', {}, h('strong', { text: 'PSD Gaming v2' }), ' — twelve original mini-games. Local-first: scores live in your browser, nothing needs an account.'),
    h('p', { class: 'muted', text: 'Built to grow: every game is one file. See docs/ADDING_A_GAME.md to add yours.' }),
  );
  toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' });

  shell.append(header, view, footer);
  root.append(skip, shell, toastBox);

  let cleanupView = () => {};
  function render() {
    try {
      cleanupView();
    } catch {
      /* ignore */
    }
    cleanupView = () => {};
    clear(view);
    document.title = 'PSD Gaming — Browser Arcade';
    const route = parseHash();
    if (route.name === 'home') homeView(view);
    else if (route.name === 'game') cleanupView = gameView(view, route.id, route.params);
    else {
      view.append(
        h('div', { class: 'empty' },
          h('p', { class: 'empty-emoji', text: '👾' }),
          h('h1', { text: 'Level not found' }),
          h('button', { class: 'btn btn-primary', onclick: () => navigate('/') }, 'Back to the library')),
      );
    }
    window.scrollTo({ top: 0 });
  }

  subscribe(render);
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && parseHash().name === 'home' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      document.querySelector('.search')?.focus();
    }
  });
  render();
}
