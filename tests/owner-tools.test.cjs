'use strict';
/* tests/owner-tools.test.cjs — v-owner-i18n + v-owner-health-scroll + v-owner-clear-confirm (تدقيق ١٨ أكتوبر، لقطتا ٠٢٠ و٠٤٥).
   العرض: أزرار «فحص النظام» ونتائجها عربيّة في الواجهة الإنجليزيّة، والنتيجة تُكتب تحت الشاشة فلا يتغيّر شيء ظاهر بعد
   الضغط، و«مسح سجل الأخطاء» (يمسح سجلّي المستخدمين والخادم نهائيًّا) بلا تأكيد.
   هنا: الدوالّ الأربع الحقيقيّة من app-11 في vm بقاموس اللغة الحقيقيّ وصندوق يسجّل scrollIntoView. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { dictFor, tFor, AR_RE, visibleOutsideIso, clientSlice } = require('./_owner-vm.cjs');

const HEALTH = {
  redisOk: false, redisWhy: 'ECONNRESET by peer', envKeys: { OPENAI_API_KEY: true, GEMINI_API_KEY: false },
  clientErrorsCount: 1, clientErrors: [{ message: 'TypeError: x is undefined', count: 2, lastSeen: '2026-10-19T08:00:00Z' }],
  clientDiag: [{ message: 'v-mem-probe 5min: heap 12/1048MB', lastSeen: '2026-10-19T08:00:00Z' }],
  deploy: 'dpl_new',
  serverErrors: [
    { route: 'swallowed:chat/upstream-fail', action: 'text-turn', message: '402 billing', count: 1, lastAt: '2026-10-19T07:50:00Z', deploy: 'dpl_new' },
    { route: 'r-old', message: 'old thing', count: 3, lastAt: '2026-10-01T07:50:00Z', deploy: 'dpl_old' },
  ],
};
const USAGE = { totalBytes: 1572864, totalKeys: 420, truncated: true, scanned: 400, groups: [{ prefix: 'db/img', bytes: 1048576, keys: 12 }], biggest: [{ key: 'db/img/abc', bytes: 524288 }] };
const COSTS = {
  month: '2026-10', total: 12.5, users: 4,
  byPlan: [{ plan: 'pro', users: 2, avg: 3.1, max: 4 }, { plan: 'free', users: 1, avg: 0.5, max: 0.5 }, { plan: 'owner', users: 1, avg: 9, max: 9 }],
  top: [{ user: 'سارة', plan: 'free', total: 0.5, chat: 0.5, media: 0, voice: 0 }],
};
const TOKENS = { days: 7, byLane: [{ lane: 'paid', turns: 40, readPct: 61, input: 120000, cacheWrite: 30000, output: 9000 }, { lane: 'free', turns: 9, readPct: 12, input: 3000, cacheWrite: 0, output: 800 }] };

function tools(lang, opts) {
  const o = opts || {};
  const box = { textContent: '', scrolls: [], scrollIntoView(a) { this.scrolls.push(a); } };
  const fetched = [];
  const asked = [];
  const ctx = {
    document: { getElementById: (id) => (id === 'adminHealthBox' ? box : null) },
    ownerToken: () => 'tok', __swallow() {},
    confirm: (m) => { asked.push(m); return o.confirm !== false; },
    fetch: async (url) => {
      fetched.push(String(url));
      if (o.down) throw new TypeError('Failed to fetch');
      const j = (b) => ({ ok: true, status: 200, json: async () => b });
      if (/usage=1/.test(url)) return j({ ok: true, usage: USAGE });
      if (/costs=1/.test(url)) return j({ ok: true, costs: COSTS, tokens: TOKENS });
      if (/clear=errors/.test(url)) return j({ ok: true, cleared: true });
      if (/action=health/.test(url)) return j(HEALTH);
      return j({});
    },
  };
  ctx.window = { t: tFor(lang) };
  clientSlice('js/app-11-video.js', '  /* v-owner-i18n', '  /* v-media-purge', ctx);
  return { w: ctx.window, box, fetched, asked };
}

test('١. الدوالّ الأربع تمرّر صندوق النتيجة إلى الشاشة (scrollIntoView nearest)', async () => {
  for (const fn of ['runHealthCheck', 'redisUsageCheck', 'subscriberCostsCheck', 'clearClientErrors']) {
    const p = tools('ar');
    await p.w[fn]();
    assert.deepEqual(JSON.parse(JSON.stringify(p.box.scrolls)), [{ block: 'nearest' }], fn); // كائن من سياق vm آخر
  }
});

test('٢. «مسح سجل الأخطاء» يسأل أوّلًا: الرفض لا يطلب الخادم، والقبول يطلب clear=errors', async () => {
  const no = tools('en', { confirm: false });
  await no.w.clearClientErrors();
  assert.deepEqual(no.fetched, [], 'لا طلب بلا تأكيد');
  assert.deepEqual(no.asked, [dictFor('en').ownerClearErrorsConfirm]);
  const yes = tools('en');
  await yes.w.clearClientErrors();
  assert.ok(yes.fetched.some((u) => /action=health&clear=errors&token=tok/.test(u)));
  assert.equal(yes.box.textContent, '🧹 Error log cleared ✅');
  const ar = tools('ar', { confirm: false });
  await ar.w.clearClientErrors();
  assert.match(ar.asked[0], /نهائيًّا/);
});

test('٣. فحص النظام بالإنجليزيّة: لا عربيّ خارج الحمولات المعزولة، والملخّص والعناوين بلغة الواجهة', async () => {
  const p = tools('en');
  await p.w.runHealthCheck();
  const t = p.box.textContent;
  assert.ok(!AR_RE.test(visibleOutsideIso(t)), visibleOutsideIso(t));
  assert.match(t, /^🔴 There are notes — /);
  assert.match(t, /✅ Home page \(200\)/);
  assert.match(t, /❌ Database \(Redis\) — \u2066ECONNRESET by peer\u2069/);
  assert.match(t, /❌ Missing keys: \u2066GEMINI_API_KEY\u2069/);
  assert.match(t, /⚠️ Errors logged from users: 1/);
  assert.match(t, /📏 Your device measurements \(not errors\): 1/);
  assert.match(t, /⚠️ Server errors in the current deploy: 1\n {3}• \u2066\[swallowed:chat\/upstream-fail\/text-turn\]/);
  assert.match(t, /🗂️ From a previous deploy \(fixed, or not repeated since the update\): 1/);
});

test('٤. «ما يملأ القاعدة» و«تكلفة المشتركين» بالإنجليزيّة بلا عربيّ خارج الحمولات، والأرقام كما هي', async () => {
  const u = tools('en');
  await u.w.redisUsageCheck();
  const ut = u.box.textContent;
  assert.ok(!AR_RE.test(visibleOutsideIso(ut)), ut);
  assert.match(ut, /^💾 Values ≈ 1\.5 MB in 420 keys \(limit 256 MB\) — only the first 400 scanned/);
  assert.match(ut, /Largest families:\n• \u2066db\/img\u2069 — 1\.0 MB · 12 keys/);
  assert.match(ut, /Largest keys:\n• \u2066db\/img\/abc\u2069 — 0\.5 MB/);
  const c = tools('en');
  await c.w.subscriberCostsCheck();
  const ct = c.box.textContent;
  assert.ok(!AR_RE.test(visibleOutsideIso(ct)), visibleOutsideIso(ct));
  assert.match(ct, /• Pro: 2 · average 3\.10\$ · highest 4\.00\$ · pays 19\.12\$/, 'صافي الباقة كما كان (باب المال: نصّ فقط)');
  assert.match(ct, /• Free: 1 · average 0\.50\$ · highest 0\.50\$\n/);
  assert.match(ct, /• Owner: 1/);
  assert.match(ct, /• \u2068سارة\u2069 \(Free\) — 0\.50\$ {2}\[messages 0\.50\$ · media 0\.00\$ · voice 0\.00\$\]/);
  assert.match(ct, /• Subscribers: 40 turns · read 61% · new 120k · write 30k · output 9k/);
  assert.match(ct, /• Free \(estimated\): 9 turns/);
  // بالعربيّة يبقى النصّ كما كان حرفيًّا
  const ar = tools('ar');
  await ar.w.subscriberCostsCheck();
  assert.match(ar.box.textContent, /• Pro: 2 · متوسّط 3\.10\$ · الأعلى 4\.00\$ · يدفع 19\.12\$/);
  assert.match(ar.box.textContent, /• المجّانيّ \(تقديريّ\): 9 دورًا · قراءة 12% · جديد 3k · كتابة 0 · خرج 800/);
});

test('٥. انقطاع الشبكة في أدوات الفحص = acctNetError بلغة الواجهة لا «Failed to fetch»', async () => {
  for (const lg of ['en', 'ar']) {
    const net = dictFor(lg).acctNetError;
    for (const fn of ['redisUsageCheck', 'subscriberCostsCheck', 'clearClientErrors', 'runHealthCheck']) {
      const p = tools(lg, { down: true });
      await p.w[fn]();
      assert.ok(p.box.textContent.includes(net), lg + ' ' + fn + ': ' + p.box.textContent);
      assert.ok(!p.box.textContent.includes('Failed to fetch'), lg + ' ' + fn);
    }
  }
});
