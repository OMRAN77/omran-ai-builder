const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { loadApi, callApi, createBlobFake, installFetch, STRONG_SECRET } = require('../helpers/harness');

function setup() {
  const blob = createBlobFake();
  const restore = installFetch(blob.fetchImpl());
  const env = { AUTH_SECRET: STRONG_SECRET, BLOB_READ_WRITE_TOKEN: blob.token };
  const auth = loadApi('auth', env);
  return { blob, restore, auth, env };
}

// A record in the format older versions wrote to taryam/db/users/<name>.json.
function legacyRecord(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const rsalt = crypto.randomBytes(16).toString('hex');
  return { username, salt, hash, recoverySalt: rsalt, recoveryHash: crypto.scryptSync('AAAA-BBBB-CCCC-DDDD-EEEE', rsalt, 64).toString('hex'), avatar: null, createdAt: 1 };
}

test('signup stores only an encrypted record at an unguessable path', async () => {
  const { blob, restore, auth } = setup();
  try {
    const r = await callApi(auth, { body: { action: 'signup', username: 'Alice', password: 'correct horse battery' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const paths = [...blob.files.keys()];
    assert.strictEqual(paths.length, 1);
    assert.match(paths[0], /^taryam\/s\/users\/[0-9a-f]{64}\.json$/);
    const raw = blob.files.get(paths[0]);
    for (const leak of ['alice', 'Alice', '"salt"', '"hash"', 'recovery']) assert.ok(!raw.includes(leak), 'stored blob leaks ' + leak);
    assert.deepStrictEqual(Object.keys(JSON.parse(raw)).sort(), ['ct', 'iv', 'tag', 'v']);
  } finally { restore(); }
});

test('the storage path depends on the server secret', () => {
  const a = loadApi('_store', { AUTH_SECRET: STRONG_SECRET }).secretPath('users', 'alice');
  const b = loadApi('_store', { AUTH_SECRET: STRONG_SECRET + '-other' }).secretPath('users', 'alice');
  assert.notStrictEqual(a, b);
});

test('login works against the encrypted record', async () => {
  const { restore, auth } = setup();
  try {
    await callApi(auth, { body: { action: 'signup', username: 'alice', password: 'correct horse battery' } });
    const ok = await callApi(auth, { body: { action: 'login', username: 'ALICE', password: 'correct horse battery' } });
    assert.strictEqual(ok.status, 200);
    const bad = await callApi(auth, { body: { action: 'login', username: 'alice', password: 'wrong password!' } });
    assert.strictEqual(bad.status, 401);
  } finally { restore(); }
});

test('a legacy public record is migrated on first login and its public copy wiped', async () => {
  const { blob, restore, auth } = setup();
  try {
    blob.files.set('taryam/db/users/bob.json', JSON.stringify(legacyRecord('Bob', 'old-password')));
    const r = await callApi(auth, { body: { action: 'login', username: 'bob', password: 'old-password' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.deepStrictEqual(JSON.parse(blob.files.get('taryam/db/users/bob.json')), { migrated: true });
    assert.ok([...blob.files.keys()].some((p) => p.startsWith('taryam/s/users/')));
    const again = await callApi(auth, { body: { action: 'login', username: 'bob', password: 'old-password' } });
    assert.strictEqual(again.status, 200);
  } finally { restore(); }
});

test('signup cannot take over a username that only exists as a legacy record', async () => {
  const { blob, restore, auth } = setup();
  try {
    blob.files.set('taryam/db/users/carol.json', JSON.stringify(legacyRecord('Carol', 'carols-password')));
    const r = await callApi(auth, { body: { action: 'signup', username: 'carol', password: 'attacker-password' } });
    assert.strictEqual(r.status, 409);
    const login = await callApi(auth, { body: { action: 'login', username: 'carol', password: 'carols-password' } });
    assert.strictEqual(login.status, 200);
  } finally { restore(); }
});

test('a tampered or moved encrypted record is an error, never treated as a free username', async () => {
  const { blob, restore, auth, env } = setup();
  try {
    await callApi(auth, { body: { action: 'signup', username: 'dave', password: 'daves-password' } });
    const [p] = [...blob.files.keys()];
    const box = JSON.parse(blob.files.get(p));
    box.ct = Buffer.from('{"username":"dave","salt":"x","hash":"y"}').toString('base64');
    blob.files.set(p, JSON.stringify(box));
    const signup = await callApi(auth, { body: { action: 'signup', username: 'dave', password: 'attacker-password' } });
    assert.strictEqual(signup.status, 500);
    const store = loadApi('_store', env);
    const other = store.secretPath('users', 'eve');
    await store.writeSecret(store.secretPath('users', 'mallory'), { username: 'mallory' });
    blob.files.set(other, blob.files.get(store.secretPath('users', 'mallory')));
    await assert.rejects(store.readSecret(other));
  } finally { restore(); }
});

test('a failed Blob write makes signup fail instead of reporting success', async () => {
  const blob = createBlobFake();
  const restore = installFetch(blob.fetchImpl());
  try {
    const auth = loadApi('auth', { AUTH_SECRET: STRONG_SECRET, BLOB_READ_WRITE_TOKEN: 'wrong-token' });
    const r = await callApi(auth, { body: { action: 'signup', username: 'frank', password: 'franks-password' } });
    assert.strictEqual(r.status, 500);
  } finally { restore(); }
});

test('migration script: dry run writes nothing, --apply migrates users and audit logs once', async () => {
  const blob = createBlobFake();
  const restore = installFetch(blob.fetchImpl());
  try {
    loadApi('_store', { AUTH_SECRET: STRONG_SECRET, BLOB_READ_WRITE_TOKEN: blob.token });
    const { migrate } = require('../../scripts/migrate-legacy-blobs');
    blob.files.set('taryam/db/users/gina.json', JSON.stringify(legacyRecord('Gina', 'ginas-password')));
    blob.files.set('taryam/db/users/hank.json', JSON.stringify({ migrated: true }));
    blob.files.set('taryam/db/dehashed_audit/gina.json', JSON.stringify([{ ts: 't', field: 'email', value: 'x@example.com' }]));
    const before = new Map(blob.files);

    const dry = await migrate({ apply: false, log: () => {} });
    assert.deepStrictEqual(dry, { migrated: 2, alreadyMigrated: 1, unreadable: 0 });
    assert.deepStrictEqual(blob.files, before);

    const done = await migrate({ apply: true, log: () => {} });
    assert.deepStrictEqual(done, { migrated: 2, alreadyMigrated: 1, unreadable: 0 });
    assert.deepStrictEqual(JSON.parse(blob.files.get('taryam/db/users/gina.json')), { migrated: true });
    assert.deepStrictEqual(JSON.parse(blob.files.get('taryam/db/dehashed_audit/gina.json')), { migrated: true });
    const store = require('../../api/_store');
    assert.strictEqual((await store.readSecret(store.secretPath('users', 'gina'))).username, 'Gina');
    assert.strictEqual((await store.readSecret(store.secretPath('dehashed-audit', 'gina')))[0].value, 'x@example.com');

    const auth = require('../../api/auth');
    const login = await callApi(auth, { body: { action: 'login', username: 'gina', password: 'ginas-password' } });
    assert.strictEqual(login.status, 200);

    const rerun = await migrate({ apply: true, log: () => {} });
    assert.deepStrictEqual(rerun, { migrated: 0, alreadyMigrated: 3, unreadable: 0 });
  } finally { restore(); }
});
