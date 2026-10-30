const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { loadApi, callApi, createBlobFake, installFetch, STRONG_SECRET } = require('../helpers/harness');

function setup() {
  const blob = createBlobFake();
  const restore = installFetch(blob.fetchImpl());
  const auth = loadApi('auth', { AUTH_SECRET: STRONG_SECRET, BLOB_READ_WRITE_TOKEN: blob.token });
  const store = require('../../api/_store');
  store.config.retryDelayMs = 0;
  const call = (body, ip = '203.0.113.10') => callApi(auth, { body, headers: { 'x-forwarded-for': ip } });
  return { blob, restore, call, store };
}

// Moves both Date.now() and new Date() forward for the duration of fn.
async function withClock(t, offsetMs, fn) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + offsetMs });
  try { await fn(); } finally { t.mock.timers.reset(); }
}

test('new passwords need 8 characters; existing short passwords still log in', async () => {
  const { blob, restore, call } = setup();
  try {
    assert.strictEqual((await call({ action: 'signup', username: 'alice', password: '1234567' })).status, 400);
    assert.strictEqual((await call({ action: 'signup', username: 'alice', password: '12345678' })).status, 200);
    const salt = crypto.randomBytes(16).toString('hex');
    blob.files.set('taryam/db/users/oldie.json', JSON.stringify({ username: 'oldie', salt, hash: crypto.scryptSync('1234', salt, 64).toString('hex') }));
    assert.strictEqual((await call({ action: 'login', username: 'oldie', password: '1234' })).status, 200);
  } finally { restore(); }
});

test('5 wrong passwords lock the account for 15 minutes, even for the right password', async (t) => {
  const { restore, call } = setup();
  try {
    await call({ action: 'signup', username: 'bob', password: 'bobs-password' });
    for (let i = 0; i < 5; i++) assert.strictEqual((await call({ action: 'login', username: 'bob', password: 'guess-' + i })).status, 401);
    const locked = await call({ action: 'login', username: 'bob', password: 'bobs-password' });
    assert.strictEqual(locked.status, 429);
    assert.match(locked.body.error, /15/);
    await withClock(t, 14 * 60 * 1000, async () => {
      assert.strictEqual((await call({ action: 'login', username: 'bob', password: 'bobs-password' })).status, 429);
    });
    await withClock(t, 16 * 60 * 1000, async () => {
      assert.strictEqual((await call({ action: 'login', username: 'bob', password: 'bobs-password' })).status, 200);
      assert.strictEqual((await call({ action: 'login', username: 'bob', password: 'one-more-guess' })).status, 401);
    });
  } finally { restore(); }
});

test('a successful login resets the failure counter', async () => {
  const { restore, call } = setup();
  try {
    await call({ action: 'signup', username: 'carol', password: 'carols-password' });
    for (let i = 0; i < 4; i++) await call({ action: 'login', username: 'carol', password: 'nope-' + i });
    assert.strictEqual((await call({ action: 'login', username: 'carol', password: 'carols-password' })).status, 200);
    for (let i = 0; i < 4; i++) assert.strictEqual((await call({ action: 'login', username: 'carol', password: 'nope-' + i })).status, 401);
  } finally { restore(); }
});

test('wrong recovery codes count toward the same lock', async () => {
  const { restore, call } = setup();
  try {
    const s = await call({ action: 'signup', username: 'dave', password: 'daves-password' });
    for (let i = 0; i < 5; i++) {
      assert.strictEqual((await call({ action: 'reset', username: 'dave', recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAA' + i, newPassword: 'new-password' })).status, 401);
    }
    assert.strictEqual((await call({ action: 'reset', username: 'dave', recoveryCode: s.body.recoveryCode, newPassword: 'new-password' })).status, 429);
  } finally { restore(); }
});

test('guessing against a username that does not exist is limited the same way', async () => {
  const { restore, call } = setup();
  try {
    for (let i = 0; i < 5; i++) assert.strictEqual((await call({ action: 'login', username: 'ghost', password: 'x-' + i })).status, 401);
    assert.strictEqual((await call({ action: 'login', username: 'ghost', password: 'x' })).status, 429);
  } finally { restore(); }
});

test('at most 5 accounts per IP per day; failed signups do not count', async (t) => {
  const { restore, call } = setup();
  try {
    await call({ action: 'signup', username: 'taken', password: 'password-0' }, '198.51.100.1');
    assert.strictEqual((await call({ action: 'signup', username: 'taken', password: 'password-0' }, '198.51.100.2')).status, 409);
    for (let i = 1; i <= 5; i++) assert.strictEqual((await call({ action: 'signup', username: 'user' + i, password: 'password-' + i }, '198.51.100.2')).status, 200);
    assert.strictEqual((await call({ action: 'signup', username: 'user6', password: 'password-6' }, '198.51.100.2')).status, 429);
    assert.strictEqual((await call({ action: 'signup', username: 'user7', password: 'password-7' }, '198.51.100.3')).status, 200);
    await withClock(t, 24 * 60 * 60 * 1000, async () => {
      assert.strictEqual((await call({ action: 'signup', username: 'user8', password: 'password-8' }, '198.51.100.2')).status, 200);
    });
  } finally { restore(); }
});

test('changing the password revokes every older token and hands this session a new one', async () => {
  const { restore, call } = setup();
  try {
    await call({ action: 'signup', username: 'erin', password: 'erins-password' });
    const deviceA = (await call({ action: 'login', username: 'erin', password: 'erins-password' })).body.token;
    const deviceB = (await call({ action: 'login', username: 'erin', password: 'erins-password' })).body.token;
    const r = await call({ action: 'changePassword', token: deviceA, currentPassword: 'erins-password', newPassword: 'erins-new-password' });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.token);
    assert.strictEqual((await call({ action: 'verify', token: deviceA })).status, 401);
    assert.strictEqual((await call({ action: 'verify', token: deviceB })).status, 401);
    assert.strictEqual((await call({ action: 'setAvatar', token: deviceB, avatarDataUrl: 'data:image/png;base64,AA' })).status, 401);
    assert.strictEqual((await call({ action: 'verify', token: r.body.token })).status, 200);
  } finally { restore(); }
});

test('a recovery-code reset revokes older tokens', async () => {
  const { restore, call } = setup();
  try {
    const s = await call({ action: 'signup', username: 'fay', password: 'fays-password' });
    const stolen = s.body.token;
    const r = await call({ action: 'reset', username: 'fay', recoveryCode: s.body.recoveryCode, newPassword: 'fays-new-password' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await call({ action: 'verify', token: stolen })).status, 401);
    assert.strictEqual((await call({ action: 'verify', token: r.body.token })).status, 200);
  } finally { restore(); }
});

test('renaming keeps the session on the new name and retires the old name', async () => {
  const { restore, call } = setup();
  try {
    const s = await call({ action: 'signup', username: 'gus', password: 'guss-password' });
    const r = await call({ action: 'changeUsername', token: s.body.token, newUsername: 'gus2' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await call({ action: 'verify', token: r.body.token })).status, 200);
    assert.strictEqual((await call({ action: 'verify', token: s.body.token })).status, 401);
    assert.strictEqual((await call({ action: 'login', username: 'gus', password: 'guss-password' })).status, 401);
    assert.strictEqual((await call({ action: 'login', username: 'gus2', password: 'guss-password' })).status, 200);
  } finally { restore(); }
});
