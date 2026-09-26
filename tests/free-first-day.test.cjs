// tests/free-first-day.test.cjs — v-free-first-day (قرار المالك ٢٦ سبتمبر):
// المسجَّل المجاني ٢٠ رسالة في يوم تسجيله، ثمّ ٥ يوميًّا.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-first-day';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tier = require('../api/_lib/tier.js');

const now = Date.UTC(2026, 8, 26, 10, 0, 0);
const H = 3600000;
const run = (user, env, at) => tier.resolveTier('ali', { now: at || now, noCache: true, env: env || {}, getUser: async () => user, isVip: async () => false });

test('يوم التسجيل ٢٠ رسالة', async () => {
  assert.equal((await run({ createdAt: now - 2 * H })).cap, 20);
  assert.equal((await run({ createdAt: Date.UTC(2026, 8, 26, 0, 0, 1) })).cap, 20, 'أوّل ثانية من اليوم');
});

test('من اليوم الثاني ٥ رسائل', async () => {
  assert.equal((await run({ createdAt: Date.UTC(2026, 8, 25, 23, 59) })).cap, 5, 'أمس قبل منتصف الليل');
  assert.equal((await run({ createdAt: now - 30 * 24 * H })).cap, 5);
});

test('حساب قديم بلا تاريخ تسجيل أو بتاريخ تالف = ٥', async () => {
  assert.equal((await run({})).cap, 5);
  assert.equal((await run({ createdAt: 'x' })).cap, 5);
  assert.equal((await run(null)).cap, 5);
});

test('الأرقام من البيئة، ويوم التسجيل لا يقلّ عن اليوميّ', async () => {
  const fresh = { createdAt: now - H };
  assert.equal((await run(fresh, { FREE_FIRST_DAY: '30' })).cap, 30);
  assert.equal((await run(fresh, { FREE_FIRST_DAY: '2', FREE_DAILY: '8' })).cap, 8);
  assert.equal((await run({ createdAt: now - 48 * H }, { FREE_FIRST_DAY: '30', FREE_DAILY: '7' })).cap, 7);
});

test('المشترك والضيف لا يتأثّران', async () => {
  assert.deepEqual(await run({ createdAt: now - H, plan: 'pro', planUpdatedAt: now - H }), { tier: 'sub', plan: 'pro', cap: 100, subscriber: true });
  assert.equal((await tier.resolveTier(null, { now, noCache: true, env: {} })).cap, 3);
});

test('رسالة الضيف تذكر أوّل يوم ثمّ اليوميّ، والمتغيّر موثّق', () => {
  assert.match(tier.FREE_TEXT.guestLimit, /20 رسالة في أوّل يوم، ثمّ 5 رسائل يوميًّا/);
  assert.ok(read('api/_lib/env.js').includes('FREE_FIRST_DAY:'));
  assert.ok(read('.env.example').includes('# FREE_FIRST_DAY=20 '));
});
