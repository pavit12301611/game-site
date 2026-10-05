/**
 * An in-memory implementation of `functions/src/store.js` for the backend unit tests.
 *
 * It exists because the security-critical logic must be testable everywhere — CI, a laptop without
 * Java, this repository's own sandbox — and the Firestore emulator needs a JVM that is not always
 * available. The fake implements exactly the interface the handlers use (no more), so a change to
 * that interface breaks the tests loudly instead of silently skipping them.
 */

/** Sorts documents the way Firestore's orderBy does, for the fields the tests use. */
function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function matches(data, [field, op, value]) {
  const actual = data?.[field];
  switch (op) {
    case '==': return actual === value;
    case '!=': return actual !== value;
    case '<': return actual < value;
    case '<=': return actual <= value;
    case '>': return actual > value;
    case '>=': return actual >= value;
    case 'array-contains': return Array.isArray(actual) && actual.includes(value);
    default: throw new Error(`fake store cannot filter with "${op}"`);
  }
}

/**
 * @param {{ now?: () => number }} [options]
 * @returns {import('../src/store.js').Store & { dump: () => Record<string, any>, seed: (path: string, data: Record<string, any>) => void, countWrites: () => number }}
 */
export function createFakeStore({ now = () => 1_700_000_000_000 } = {}) {
  /** @type {Map<string, Record<string, any>>} */
  const docs = new Map();
  let writes = 0;

  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const read = (path) => ({ exists: docs.has(path), id: path.split('/').pop() ?? '', data: clone(docs.get(path) ?? {}) });

  /** Paths under a prefix, deepest first, so children go before their parent. */
  const descendants = (path) => [...docs.keys()].filter((key) => key.startsWith(`${path}/`)).sort((a, b) => b.length - a.length);

  return {
    now,
    async get(path) {
      return read(path);
    },
    async set(path, data) {
      writes += 1;
      docs.set(path, clone(data));
    },
    async update(path, data) {
      writes += 1;
      if (!docs.has(path)) throw new Error(`fake store update on a missing document: ${path}`);
      docs.set(path, { ...docs.get(path), ...clone(data) });
    },
    async delete(path) {
      writes += 1;
      docs.delete(path);
    },
    async query(collectionPath, { where = [], limit = 50, orderBy } = {}) {
      const prefix = `${collectionPath}/`;
      let rows = [...docs.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path, data]) => ({ exists: true, id: path.slice(prefix.length), data: clone(data) }));
      for (const filter of where) rows = rows.filter((row) => matches(row.data, filter));
      if (orderBy) {
        const [field, direction] = orderBy;
        rows.sort((a, b) => (direction === 'desc' ? -1 : 1) * compareValues(a.data[field], b.data[field]));
      }
      return rows.slice(0, limit);
    },
    async transaction(work) {
      const tx = {
        get: async (path) => read(path),
        set: (path, data) => { writes += 1; tx.ops.push({ type: 'set', path, data: clone(data) }); },
        update: (path, data) => { writes += 1; tx.ops.push({ type: 'update', path, data: clone(data) }); },
        delete: (path) => { writes += 1; tx.ops.push({ type: 'delete', path }); },
        ops: [],
      };
      const result = await work(tx);
      for (const op of tx.ops) {
        if (op.type === 'delete') docs.delete(op.path);
        else if (op.type === 'update') docs.set(op.path, { ...docs.get(op.path), ...op.data });
        else docs.set(op.path, op.data);
      }
      return result;
    },
    async batch(ops) {
      for (const op of ops) {
        writes += 1;
        if (op.type === 'delete') docs.delete(op.path);
        else if (op.type === 'update') docs.set(op.path, { ...docs.get(op.path), ...clone(op.data) });
        else docs.set(op.path, clone(op.data));
      }
    },
    async recursiveDelete(path) {
      docs.delete(path);
      for (const child of descendants(path)) docs.delete(child);
    },
    /** Test helpers. */
    dump: () => Object.fromEntries([...docs.entries()].map(([path, data]) => [path, clone(data)])),
    seed: (path, data) => { docs.set(path, clone(data)); },
    countWrites: () => writes,
  };
}
