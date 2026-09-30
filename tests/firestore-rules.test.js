import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// These are structural guards for firestore.rules. They do NOT evaluate the rules: that is what
// tests/rules-emulator.test.js does against the Firestore emulator (`npm run test:rules`, needs Java).
// What they catch here is the cheap, costly mistakes: a typo that makes the Console reject the paste,
// a collection the app uses that has no rule, an accidentally open rule, or one of the specific
// behaviours the app depends on being edited away.

const root = fileURLToPath(new URL('..', import.meta.url));
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

/** Removes // comments (outside string literals) so the checks below only see executable rules. */
function stripComments(text) {
  let out = '';
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      out += char;
      if (char === quote) quote = '';
    } else if (char === "'" || char === '"') {
      quote = char;
      out += char;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
    } else {
      out += char;
    }
  }
  return out;
}

const code = stripComments(rules);

/** Returns the text between the braces of the first `match /<name>/{...} {` block. */
function matchBlock(name) {
  const start = code.indexOf(`match /${name}/{`);
  assert.notEqual(start, -1, `firestore.rules has no "match /${name}/{...}" block`);
  const open = code.indexOf('{', code.indexOf('}', start));
  let depth = 0;
  let quote = '';
  for (let i = open; i < code.length; i += 1) {
    const char = code[i];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced braces inside "match /${name}/"`);
}

/** Every `allow <methods>: if <condition>;` statement in the executable rules. */
function allowStatements(text = code) {
  return [...text.matchAll(/allow\s+([a-z, ]+?)\s*:\s*if\s+([^;]*);/g)].map((match) => ({
    methods: match[1].split(',').map((method) => method.trim()),
    condition: match[2].replace(/\s+/g, ' ').trim(),
  }));
}

test('the file is a Firestore rules_version 2 ruleset', () => {
  assert.match(code, /^\s*rules_version\s*=\s*'2'\s*;/);
  assert.match(code, /service cloud\.firestore\s*{/);
  assert.match(code, /match \/databases\/{database}\/documents\s*{/);
});

test('braces, parentheses and brackets are balanced, so the Firebase Console will accept the paste', () => {
  const pairs = { '}': '{', ')': '(', ']': '[' };
  const stack = [];
  let quote = '';
  for (const char of code) {
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if ('{(['.includes(char)) {
      stack.push(char);
    } else if (char in pairs) {
      assert.equal(stack.pop(), pairs[char], `unbalanced "${char}" in firestore.rules`);
    }
  }
  assert.equal(quote, '', 'a string literal is never closed');
  assert.deepEqual(stack, [], 'an opening bracket is never closed');
});

test('every Firestore collection the app touches has a rule', () => {
  const used = new Set();
  for (const file of readdirSync(`${root}src`).filter((name) => name.endsWith('.js'))) {
    const text = readFileSync(`${root}src/${file}`, 'utf8');
    for (const match of text.matchAll(/\b(?:collection|doc)\(\s*db\s*,\s*'([A-Za-z0-9_]+)'/g)) used.add(match[1]);
  }
  // A floor so the scan cannot silently match nothing if the call style ever changes.
  for (const known of ['admins', 'profiles', 'usernames', 'friendRequests', 'friendships', 'gameInvites', 'rooms']) {
    assert.ok(used.has(known), `expected src/ to use the "${known}" collection`);
  }
  const uncovered = [...used].filter((name) => !code.includes(`match /${name}/{`));
  assert.deepEqual(uncovered, [], 'collections used by src/ but missing from firestore.rules (Firestore denies them by default)');
});

test('no rule is open to the world and none can be used without signing in', () => {
  assert.doesNotMatch(code, /{\s*document\s*=\s*\*\*\s*}/, 'no recursive wildcard match');
  const offenders = allowStatements()
    .filter(({ condition }) => condition !== 'false')
    .filter(({ condition }) => !/\bsignedIn\(\)|\bisAdmin\(\)|request\.auth\b/.test(condition))
    .map(({ methods, condition }) => `${methods.join(', ')}: if ${condition}`);
  assert.deepEqual(offenders, [], 'allow rules that do not require an authenticated user');
  assert.ok(allowStatements().length > 20, 'the statement parser must see the rules');
});

test('admin flags are readable only by their owner and never writable from the client', () => {
  const statements = allowStatements(matchBlock('admins'));
  assert.ok(statements.length >= 2);
  for (const { methods, condition } of statements) {
    if (methods.includes('get')) {
      assert.deepEqual(methods, ['get'], 'the admins collection must not be listable');
      assert.match(condition, /request\.auth\.uid == uid/);
    } else {
      assert.equal(condition, 'false', `"${methods.join(', ')}" on admins must be denied`);
    }
  }
  const isAdmin = code.slice(code.indexOf('function isAdmin()'), code.indexOf('function isRoomMember'));
  assert.match(isAdmin, /admins\/\$\(request\.auth\.uid\)/);
  assert.match(isAdmin, /\.data\.admin == true/);
});

test('rooms: unlistable except for admins, and a missing room reads as "not found" instead of permission-denied', () => {
  const statements = allowStatements(matchBlock('rooms'));
  const get = statements.find(({ methods }) => methods.length === 1 && methods[0] === 'get');
  assert.ok(get, 'rooms needs a dedicated get rule');
  assert.match(get.condition, /resource == null/, 'reading a room that does not exist must not throw permission-denied');
  assert.match(get.condition, /resource\.data\.status == 'waiting'/);
  assert.match(get.condition, /isRoomMember\(resource\.data\)/);
  const list = statements.find(({ methods }) => methods.includes('list'));
  assert.equal(list?.condition, 'isAdmin()', 'only admins may list rooms');
});

test('friendships: members read their own, admins may read all (the admin dashboard counts them)', () => {
  const read = allowStatements(matchBlock('friendships')).find(({ methods }) => methods.includes('list'));
  assert.ok(read, 'friendships needs a list rule');
  assert.ok(read.methods.includes('get'));
  assert.match(read.condition, /request\.auth\.uid in resource\.data\.memberUids/);
  assert.match(read.condition, /isAdmin\(\)/);
  assert.ok(read.condition.indexOf('memberUids') < read.condition.indexOf('isAdmin()'), 'check membership before the billed admin lookup');
});

test('friendships and usernames are immutable once created, and profiles cannot be deleted', () => {
  const immutable = { friendships: ['update', 'delete'], usernames: ['update', 'delete'], profiles: ['delete'] };
  for (const [name, methods] of Object.entries(immutable)) {
    const denied = allowStatements(matchBlock(name)).filter(({ condition }) => condition === 'false').flatMap((item) => item.methods);
    for (const method of methods) assert.ok(denied.includes(method), `${name}: ${method} must be denied`);
  }
});
