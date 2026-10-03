// tests/free-first-day.test.cjs — v-free-first-day (قرار المالك ٢٦ سبتمبر):
// الضيف لا يرسل شيئًا، والمسجَّل المجاني ٢٠ رسالة في يوم تسجيله ثمّ ٣ يوميًّا.
// v-free-20 (٣ أكتوبر): اليوميّ صار ٢٠ — «في اليوم ٢٠ رسالة» بلا تكلفة على السلسلة المجّانيّة.
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

test('من اليوم الثاني ٢٠ رسالة كلّ يوم (v-free-20)', async () => {
  assert.equal((await run({ createdAt: Date.UTC(2026, 8, 25, 23, 59) })).cap, 20, 'أمس قبل منتصف الليل');
  assert.equal((await run({ createdAt: now - 30 * 24 * H })).cap, 20);
});

test('حساب قديم بلا تاريخ تسجيل أو بتاريخ تالف = ٢٠', async () => {
  assert.equal((await run({})).cap, 20);
  assert.equal((await run({ createdAt: 'x' })).cap, 20);
  assert.equal((await run(null)).cap, 20);
});

test('الأرقام من البيئة، ويوم التسجيل لا يقلّ عن اليوميّ', async () => {
  const fresh = { createdAt: now - H };
  assert.equal((await run(fresh, { FREE_FIRST_DAY: '30' })).cap, 30);
  assert.equal((await run(fresh, { FREE_FIRST_DAY: '2', FREE_DAILY: '8' })).cap, 8);
  assert.equal((await run({ createdAt: now - 48 * H }, { FREE_FIRST_DAY: '30', FREE_DAILY: '7' })).cap, 7);
});

test('الضيف صفر والمشترك لا يتأثّر', async () => {
  assert.deepEqual(await run({ createdAt: now - H, plan: 'pro', planUpdatedAt: now - H }), { tier: 'sub', plan: 'pro', cap: 100, subscriber: true });
  assert.equal((await tier.resolveTier(null, { now, noCache: true, env: {} })).cap, 0);
  assert.equal(tier.caps({}).guest, 0);
});

test('الخادم يرفض الضيف قبل أيّ عدّ', () => {
  const u = read('api/_lib/_usage.js');
  assert.match(u, /const guestLimit = tierLib\.caps\(\)\.guest;[\s\S]*?if \(count >= guestLimit\) \{[\s\S]*?await addTally\(key\);/);
});

test('الواجهة: الضيف يُحوَّل للتسجيل من أوّل رسالة', () => {
  const a = read('js/app-01-boot-auth.js');
  assert.match(a, /const GUEST_MSG_LIMIT = 0;/);
  assert.match(a, /if\(reason === 'guestLimit'\)\{ setMode\('signup'\); errBox\.textContent = ''; \}/, 'بلا نصّ فوق زرّ التسجيل (طلب المالك)');
  assert.match(read('js/app-09-attach.js'), /if\(window\.getGuestMsgCount\(\) >= window\.GUEST_MSG_LIMIT\)\{\s*window\.requireLogin\('guestLimit'\);\s*return;/);
});

test('النصوص بالـ١٤ لغة تذكر ٢٠ يوميًّا بلا «ثمّ ٣»، والمتغيّرات موثّقة (v-free-20)', () => {
  assert.match(tier.FREE_TEXT.guestLimit, /^سجّل حسابًا مجانيًّا لتبدأ الدردشة: 20 رسالة يوميًّا، و٧٠ نقطة ترحيب\.$/);
  const ar = read('js/app-03-i18n-data.js');
  assert.ok(ar.includes("guestLimitMsg: 'سجّل حسابًا مجانيًّا لتبدأ الدردشة: 20 رسالة يوميًّا.'"));
  assert.ok(ar.includes("guestLimitMsg: 'Create a free account to start chatting: 20 messages a day.'"));
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const s = read('i18n/' + l + '.js');
    for (const k of ['guestLimitMsg', 'plFreeMsgs']) {
      const m = s.match(new RegExp(k + `"?\\s*:\\s*'([^']*)'`));
      assert.ok(m && /20/.test(m[1]) && !/3|5/.test(m[1]), l + ': ' + k);
    }
    assert.ok(/planFreeFeats"?\s*:\s*["']<li>[^<3]*20[^<3]*<\/li>/.test(s), l + ': planFreeFeats');
  }
  assert.ok(read('pricing.html').includes('</svg>20 رسالة يوميًّا</li>') && read('js/partials-settings.js').includes('<li data-i18n="plFreeMsgs">20 رسالة يوميًّا</li>'));
  assert.ok(read('api/_lib/env.js').includes('FREE_FIRST_DAY:'));
  // أوّل يوم أكبر من اليوميّ (لو رفعه المالك من البيئة) يعود للصيغة القديمة
  const old = { a: process.env.FREE_FIRST_DAY, b: process.env.FREE_DAILY };
  process.env.FREE_FIRST_DAY = '30'; process.env.FREE_DAILY = '5';
  assert.match(tier.FREE_TEXT.guestLimit, /30 رسالة في أوّل يوم، ثمّ 5 يوميًّا/);
  for (const [k, v] of [['FREE_FIRST_DAY', old.a], ['FREE_DAILY', old.b]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const ex = read('.env.example');
  assert.ok(ex.includes('# FREE_FIRST_DAY=20 ') && ex.includes('# FREE_DAILY=20 ') && ex.includes('# GUEST_DAILY=0 '));
});
