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

/** The statements of one collection's block, without those of sub-collections nested inside it. */
function ownStatements(name) {
  const block = matchBlock(name);
  const nested = block.indexOf('match /');
  return allowStatements(nested === -1 ? block : block.slice(0, nested));
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
  // Walk every .js file under src/: the app is no longer one file, and each module that talks to
  // Firestore names its collections the same way (the handle is `db`, or a cast local to a module).
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
      else if (entry.name.endsWith('.js')) {
        const text = readFileSync(`${dir}/${entry.name}`, 'utf8');
        for (const match of text.matchAll(/\b(?:collection|doc)\(\s*[A-Za-z_$][\w$]*\s*,\s*'([A-Za-z0-9_]+)'/g)) used.add(match[1]);
      }
    }
  };
  walk(`${root}src`);
  // A floor so the scan cannot silently match nothing if the call style ever changes. `usernames`,
  // `blocks`, `reports` and `rateLimits` are deliberately absent: the browser no longer touches
  // them at all (they belong to the trusted backend), and the rules still describe every one.
  for (const known of ['admins', 'profiles', 'friendRequests', 'friendships', 'gameInvites', 'rooms']) {
    assert.ok(used.has(known), `expected src/ to use the "${known}" collection`);
  }
  for (const backendOnly of ['usernames', 'blocks', 'reports', 'rateLimits', 'secrets', 'views']) {
    assert.ok(code.includes(`match /${backendOnly}/{`), `${backendOnly} must still be described in firestore.rules`);
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

test('admin flags: owners read theirs, admins manage access, and nobody mints a first flag from the client', () => {
  const statements = allowStatements(matchBlock('admins'));
  const get = statements.find(({ methods }) => methods.length === 1 && methods[0] === 'get');
  assert.ok(get, 'admins needs a dedicated get rule');
  assert.match(get.condition, /request\.auth\.uid == uid/, 'the owner reads their own flag');
  assert.match(get.condition, /isAdmin\(\)/, 'admins may read each flag (the studio lists who has access)');
  const list = statements.find(({ methods }) => methods.includes('list'));
  assert.equal(list?.condition, 'isAdmin()', 'only admins may list the admins collection');
  const write = statements.find(({ methods }) => methods.includes('create') && methods.includes('update'));
  assert.ok(write, 'admins can grant/update flags from the admin studio');
  assert.match(write.condition, /isAdmin\(\)/, 'only someone who already IS an admin can write a flag (a first flag cannot be minted from the client)');
  assert.match(write.condition, /hasOnly\(\['admin'\]\)/, 'a flag document holds exactly the admin field');
  assert.match(write.condition, /\.admin is bool/, 'and it is a boolean');
  const remove = statements.find(({ methods }) => methods.includes('delete'));
  assert.match(remove.condition, /isAdmin\(\)/, 'only admins revoke flags');
  assert.match(remove.condition, /request\.auth\.uid != uid/, 'a flag cannot lock itself out by deleting its own document');
  for (const { condition } of statements) {
    assert.notEqual(condition, 'true', 'no admin statement may be unconditional');
  }
  const isAdmin = code.slice(code.indexOf('function isAdmin()'), code.indexOf('function isRoomMember'));
  assert.match(isAdmin, /admins\/\$\(request\.auth\.uid\)/);
  assert.match(isAdmin, /\.data\.admin == true/);
});

test('rooms: unlistable, member-readable, and a missing room reads as "not found"', () => {
  const statements = ownStatements('rooms');
  const get = statements.find(({ methods }) => methods.length === 1 && methods[0] === 'get');
  assert.ok(get, 'rooms needs a dedicated get rule');
  assert.match(get.condition, /resource == null/, 'reading a room that does not exist must not throw permission-denied');
  assert.match(get.condition, /isRoomMember\(resource\.data\)/, 'members read their own room');
  assert.match(get.condition, /isAdmin\(\)/, 'the admin studio reads any room');
  assert.doesNotMatch(get.condition, /status == 'waiting'/, 'a waiting room is not public: joining goes through the backend');
  const list = statements.find(({ methods }) => methods.includes('list'));
  assert.equal(list?.condition, 'isAdmin()', 'only admins may list rooms');
});

test('no client can write a room, its secret state or its private views', () => {
  const rooms = ownStatements('rooms').filter(({ methods }) => methods.some((method) => ['create', 'update', 'delete'].includes(method)));
  assert.ok(rooms.length > 0, 'rooms must say what is denied, not stay silent');
  for (const { methods, condition } of rooms) {
    assert.equal(condition, 'false', `rooms ${methods.join(', ')} must be denied for every client: the trusted backend writes rooms`);
  }
  const secretStatements = allowStatements(matchBlock('secrets'));
  assert.equal(secretStatements.length, 1, 'secrets have exactly one statement');
  assert.deepEqual(secretStatements[0].methods.sort(), ['read', 'write'], 'secrets deny both halves for everyone, admins included');
  assert.equal(secretStatements[0].condition, 'false');
  const views = allowStatements(matchBlock('views'));
  const viewRead = views.find(({ methods: m }) => m.includes('get'));
  assert.match(viewRead.condition, /request\.auth\.uid == uid/, 'a player reads only their own private view');
  for (const { methods, condition } of views.filter(({ methods: m }) => m.some((method) => ['create', 'update', 'delete'].includes(method)))) {
    assert.equal(condition, 'false', `views ${methods.join(', ')} must be denied: only the backend writes them`);
  }
});

test('friend requests and game invites are participant-readable and never client-writable', () => {
  for (const name of ['friendRequests', 'gameInvites']) {
    const statements = allowStatements(matchBlock(name));
    const get = statements.find(({ methods }) => methods.length === 1 && methods[0] === 'get');
    assert.ok(get, `${name} needs a dedicated get rule`);
    assert.match(get.condition, /resource == null/, `${name}: a missing document should read as not-found`);
    assert.match(get.condition, /resource\.data\.fromUid == request\.auth\.uid/);
    assert.match(get.condition, /resource\.data\.toUid == request\.auth\.uid/);
    const list = statements.find(({ methods }) => methods.length === 1 && methods[0] === 'list');
    assert.match(list.condition, /resource\.data\.fromUid == request\.auth\.uid/, `${name}: a listener stays scoped to the caller`);
    assert.match(list.condition, /isAdmin\(\)/);
    const writes = statements.filter(({ methods }) => methods.some((method) => ['create', 'update'].includes(method)));
    for (const { methods, condition } of writes) {
      assert.equal(condition, 'false', `${name} ${methods.join(', ')} must be denied: the backend owns these writes`);
    }
    const remove = statements.find(({ methods }) => methods.includes('delete'));
    assert.match(remove.condition, /isAdmin\(\)/, `${name}: only an admin may clean up a stale row from the studio`);
  }
});

test('blocks are private to their owner and reports are for the operator', () => {
  const blocks = allowStatements(matchBlock('blocks'));
  const read = blocks.find(({ methods }) => methods.includes('get'));
  assert.match(read.condition, /resource\.data\.blockerUid/, 'only the person who blocked someone sees the row');
  for (const { condition } of blocks.filter(({ methods }) => methods.some((method) => ['create', 'update'].includes(method)))) {
    assert.equal(condition, 'false', 'blocking is a backend call (it also clears pending requests and invites)');
  }
  const reports = allowStatements(matchBlock('reports'));
  for (const statement of reports) {
    if (statement.condition === 'false') continue;
    assert.match(statement.condition, /isAdmin\(\)/, 'reports are readable by the operator only');
  }
  assert.ok(reports.some(({ condition }) => condition === 'false'), 'no client writes reports');
  const rateLimits = allowStatements(matchBlock('rateLimits'));
  assert.equal(rateLimits.length, 1, 'rateLimits have exactly one statement');
  assert.deepEqual(rateLimits[0].methods.sort(), ['read', 'write'], 'both halves of every rate-limit document are denied');
  assert.equal(rateLimits[0].condition, 'false', 'rate-limit bookkeeping is invisible to clients');
});

test('friendships: members read their own, admins may read all (the admin dashboard counts them)', () => {
  const read = allowStatements(matchBlock('friendships')).find(({ methods }) => methods.includes('list'));
  assert.ok(read, 'friendships needs a list rule');
  assert.ok(read.methods.includes('get'));
  assert.match(read.condition, /request\.auth\.uid in resource\.data\.memberUids/);
  assert.match(read.condition, /isAdmin\(\)/);
  assert.ok(read.condition.indexOf('memberUids') < read.condition.indexOf('isAdmin()'), 'check membership before the billed admin lookup');
});

test('profiles and usernames are backend-only: no client write survives at any privilege level', () => {
  // Claiming a name, editing a profile and removing an account all moved into the trusted backend
  // (`claimUsername`, `deleteAccount`, `adminRemovePlayer`). Nothing about a profile or a username
  // reservation is client-writable, so a username cannot be renamed, spoofed or duplicated.
  const profiles = allowStatements(matchBlock('profiles'));
  const profileWrite = profiles.filter(({ methods }) => methods.some((method) => ['create', 'update', 'delete'].includes(method)));
  assert.ok(profileWrite.length > 0, 'profiles must say that writes are denied');
  for (const { methods, condition } of profileWrite) {
    assert.equal(condition, 'false', `profiles ${methods.join(', ')} must be denied for every client`);
  }
  const profileRead = profiles.find(({ methods }) => methods.includes('get'));
  assert.match(profileRead.condition, /request\.auth\.uid == uid/, 'you read your own profile');
  assert.match(profileRead.condition, /isAdmin\(\)/, 'and an admin reads any (the dashboard lists players)');
  const profileList = profiles.find(({ methods }) => methods.includes('list'));
  assert.equal(profileList.condition, 'isAdmin()', 'only an admin may list profiles: the directory is not browsable');
  const usernames = allowStatements(matchBlock('usernames'));
  assert.equal(usernames.length, 1, 'usernames have exactly one statement');
  assert.deepEqual(usernames[0].methods.sort(), ['read', 'write'], 'both halves of a reservation are closed');
  assert.equal(usernames[0].condition, 'false', 'username reservations are server-only');
});

test('the player directory cannot be queried by anyone but an admin', () => {
  // The old design let any signed-in client run `where('usernameLower', '==', …)` against
  // `profiles`, which also allowed listing the collection. The rules now deny both, and friend
  // search is the `lookupUser` callable instead (tested in functions/test/handlers.test.js).
  const profileRead = allowStatements(matchBlock('profiles')).filter(({ methods }) => methods.includes('get'));
  assert.equal(profileRead.length, 1, 'profiles have one get rule');
  assert.doesNotMatch(profileRead[0].condition, /list/, 'get and list are separate rules with different audiences');
  assert.match(matchBlock('usernames'), /allow read, write: if false;/);
});

test('presence: heartbeats live with the room, are written only by their owner and read only by members', () => {
  assert.ok(matchBlock('rooms').includes('match /presence/{uid}'), 'presence is a sub-collection of the room: guests have no profile document to put it on');
  const statements = allowStatements(matchBlock('presence'));
  const read = statements.find(({ methods }) => methods.includes('get') && methods.includes('list'));
  assert.ok(read, 'members need get and list (the lobby watches the whole sub-collection)');
  assert.match(read.condition, /isRoomMember\(roomData\(\)\)/, 'only members of that room may see who is in it');
  const write = statements.find(({ methods }) => methods.includes('create') && methods.includes('update'));
  assert.ok(write, 'the heartbeat is a create the first time and an update after that');
  assert.match(write.condition, /request\.auth\.uid == uid/, 'you may only write your own heartbeat');
  assert.match(write.condition, /isRoomMember\(roomData\(\)\)/, 'and only while you are in the room');
  assert.match(write.condition, /hasOnly\(\['status', 'lastSeenAt'\]\)/, 'exactly two fields: nothing else can be smuggled in');
  assert.match(write.condition, /status in \['here', 'left'\]/);
  assert.match(write.condition, /lastSeenAt == request\.time/, 'server time only, so a wrong clock cannot fake "here"');
  const remove = statements.find(({ methods }) => methods.includes('delete'));
  assert.match(remove.condition, /request\.auth\.uid == uid/, 'your heartbeat is yours to remove');
  assert.doesNotMatch(remove.condition, /roomData\(\)/, 'deleting must not look the room up: the last player deletes room and heartbeat in one transaction');
  assert.ok(matchBlock('presence').indexOf('function roomData') < matchBlock('presence').indexOf('allow'), 'one named lookup, so every rule reads the same room document');
});
