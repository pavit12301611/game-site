/** Curated rule presets: shared engines, different goals. Not independent game engines. */
/** @type {[string, string, string, string, (i: number) => Record<string, any>][]} */
const families = [
  ['Orbit Boost', 'race', 'Arcade', 'ϟ', (i) => ({ target: 24 + i * 4, dimension: '3D' })],
  ['Prism Escape', 'maze', 'Arcade', '◇', (i) => ({ width: 7, height: 7, layout: i + 1, dimension: '3D' })],
  ['Grid Masters', 'line', 'Strategy', '✕', (i) => ({ size: 4 + i, connect: Math.min(3 + Math.floor(i / 2), 6) })],
  ['Gravity League', 'drop', 'Strategy', '●', (i) => ({ cols: 6 + i, rows: 6 + Math.floor(i / 2), connect: 4 + Math.floor(i / 4) })],
  ['Recall Lab', 'memory', 'Puzzle', '✦', (i) => ({ pairs: 3 + i })],
  ['Fleet Command', 'battle', 'Strategy', '▤', (i) => ({ board: 6 + Math.floor(i / 2), fleet: 3 + i })],
  ['Cipher Vault', 'code', 'Puzzle', '#', (i) => ({ digits: 4, maxGuesses: 5 + i })],
  ['Volley Club', 'rally', 'Arcade', '↔', (i) => ({ target: 3 + i })],
  ['Hand Clash', 'rps', 'Party', '✊', (i) => ({ mode: 'rps', target: 1 + i })],
  ['Lucky Circuit', 'rps', 'Party', '◉', (i) => ({ mode: 'coin', target: 1 + i })],
  ['Dice District', 'rps', 'Party', '⚄', (i) => ({ mode: 'dice', target: 1 + i })],
  ['Overdrive', 'race', 'Arcade', '↗', (i) => ({ target: 25 + i * 5 })],
];
const accents = ['cyan', 'violet', 'pink', 'orange', 'green', 'blue'];
export const EXPANSION_GAMES = families.flatMap(([title, engine, category, icon, preset], family) =>
  Array.from({ length: 10 }, (_, i) => ({
    id: `${String(title).toLowerCase().replaceAll(' ', '-')}-${i + 1}`,
    title: `${title} ${String(i + 1).padStart(2, '0')}`,
    engine, category, icon, accent: accents[family % accents.length],
    blurb: `${title} challenge ${i + 1}. ${engine === 'maze' ? 'A new route to the gate.' : 'A new target for your next rivalry.'}`,
    options: { ...preset(i), variant: true },
  })));
