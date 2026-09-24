'use strict';
/* v-health-split + v-err-deploy — لقطة «فحص النظام» (المالك ٢٣ سبتمبر ٢٣:٤٢، «شوف الأخطاء طلّعها من جذورها»):
   (١) «أخطاء مسجلة من المستخدمين: 3» كلّها أسطر مسبار الذاكرة v-mem-probe — أرقام جهاز المالك تُكتب في سجلّ الأخطاء
       عمدًا، فكانت تُعدّ أخطاءً. (٢) أخطاء الخادم لا تنتهي: 402 من ٢١ سبتمبر، وأخطاء أُصلحت، تُعرض كأنّها الآن؛
       وزرّ «مسح سجل الأخطاء» لا يمسح سجلّ الخادم أصلًا. هنا يُشغَّل المعالج الحقيقيّ ولوحة العميل الحقيقيّة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetJSON: async (k) => db.has(k) ? structuredClone(db.get(k)) : null,
  kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvIncr: async () => 1, kvExpire: async () => {},
} };
require.cache[rp('api/_lib/_owner.js')] = { id: rp('api/_lib/_owner.js'), filename: rp('api/_lib/_owner.js'), loaded: true, exports: {
  isOwner: () => true, isOwnerName: (u) => u === 'omran', ownerList: () => ['omran'],
} };
require.cache[rp('api/_lib/_owner-alert.js')] = { id: rp('api/_lib/_owner-alert.js'), filename: rp('api/_lib/_owner-alert.js'), loaded: true, exports: {
  alertOwnerError: async () => {}, isCreditFailure: () => false,
} };
const health = require(rp('api/_lib/health.js'));
const errors = require(rp('api/_lib/_errors.js'));

const call = (query) => new Promise((resolve) => {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, j }); }, end() { resolve({ code: this.code }); } };
  health({ method: 'GET', query: query || {}, headers: {} }, res);
});
const PROBE = (tag, n) => ({ message: 'v-mem-probe ' + tag + ': heap 12/1048MB · جهاز 8GB · شاشة 708x735@3.13 · صور ظاهرة ' + n, source: 'selfdiag.js', lastSeen: '2026-09-23T19:42:00Z', count: 1 });

test('١. المعالج: أسطر المسبار في clientDiag لا في الأخطاء، وأخطاء الخادم الأحدث أوّلًا ببصمة نشرها', async () => {
  process.env.VERCEL_DEPLOYMENT_ID = 'dpl_new';
  db.set('db/client-errors/log.json', [PROBE('٥ دقائق', 103), { message: 'Uncaught TypeError: boom', source: '/js/app.bundle.js', line: 9, lastSeen: '2026-09-23T19:40:00Z' }, PROBE('دقيقتان', 30), PROBE('٢٠ث', 1)]);
  db.set('db/server-errors/log.json', [
    { at: '2026-09-21T13:45:00Z', lastAt: '2026-09-23T19:16:00Z', route: 'swallowed:chat/upstream-fail', action: 'text-turn', message: '402: billing', count: 3, deploy: 'dpl_old' },
    { at: '2026-09-22T10:00:00Z', lastAt: '2026-09-23T19:50:00Z', route: 'swallowed:chat/upstream-fail', action: 'text-turn', message: '402 OpenRouter · openai/gpt-5.6-terra: billing', count: 1, deploy: 'dpl_new' },
    { at: '2026-09-20T10:00:00Z', route: 'swallowed:chat/model-pick-404', message: 'gpt-6-luna-pro', count: 4 },
  ]);
  try {
    const r = await call();
    assert.equal(r.code, 200);
    assert.equal(r.j.clientErrorsCount, 1, 'الخطأ الحقيقيّ وحده');
    assert.equal(r.j.clientErrors[0].message, 'Uncaught TypeError: boom');
    assert.equal(r.j.clientDiag.length, 3, 'القياسات الثلاث بعنوانها');
    assert.ok(r.j.clientDiag.every((e) => /^v-mem-probe/.test(e.message)));
    assert.equal(r.j.deploy, 'dpl_new');
    assert.deepEqual(r.j.serverErrors.map((e) => e.deploy), ['dpl_new', 'dpl_old', ''], 'الأحدث ظهورًا أوّلًا');
  } finally { delete process.env.VERCEL_DEPLOYMENT_ID; }
});

test('٢. reportError يختم النشر، والخطأ المتكرّر بعد نشر جديد ينتقل إليه', async () => {
  db.delete('db/server-errors/log.json');
  process.env.VERCEL_DEPLOYMENT_ID = 'dpl_a';
  await errors.reportError(new Error('same failure'), { route: 'r1' });
  assert.equal(db.get('db/server-errors/log.json')[0].deploy, 'dpl_a');
  process.env.VERCEL_DEPLOYMENT_ID = 'dpl_b';
  await errors.reportError(new Error('same failure'), { route: 'r1' });
  const log = db.get('db/server-errors/log.json');
  assert.equal(log.length, 1);
  assert.equal(log[0].count, 2);
  assert.equal(log[0].deploy, 'dpl_b');
  delete process.env.VERCEL_DEPLOYMENT_ID;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  assert.equal(errors.deployId(), '', 'بلا بيئة Vercel = بلا بصمة (يُعرض الكلّ كما كان)');
});

/* لوحة «فحص النظام» الحقيقيّة: window.runHealthCheck من app-11-video.js في بيئة مصغّرة */
function panel(healthJson) {
  const src = fs.readFileSync(path.join(root, 'js/app-11-video.js'), 'utf8');
  const a = src.indexOf('  window.runHealthCheck = async function(){');
  const b = src.indexOf('  function setStatus(text){', a);
  assert.ok(a > 0 && b > a);
  const box = { textContent: '' };
  const fetched = [];
  const ctx = {
    window: {}, document: { getElementById: (id) => id === 'adminHealthBox' ? box : null },
    ownerToken: () => 'tok', Date, Promise, Object, String, JSON, Array,
    fetch: async (url) => {
      fetched.push(String(url));
      if (/action=health/.test(url)) return { ok: true, status: 200, json: async () => healthJson };
      return { ok: true, status: 200, json: async () => ({}) };
    },
  };
  vm.runInNewContext(src.slice(a, b), ctx);
  return { run: ctx.window.runHealthCheck, clear: ctx.window.clearClientErrors, box, fetched };
}
const BASE = { redisOk: true, envKeys: { OpenAI: true }, clientErrorsCount: 0, clientErrors: [], serverErrorsCount: 0, serverErrors: [] };

test('٣. اللوحة: القياسات بعنوانها ولا تُحسب، وأخطاء النشر الحاليّ وحدها «ملاحظة»، وما قبله مطويّ بعنوانه', async () => {
  const p = panel(Object.assign({}, BASE, {
    deploy: 'dpl_new',
    clientDiag: [PROBE('٥ دقائق', 103), PROBE('دقيقتان', 30)],
    serverErrorsCount: 2,
    serverErrors: [
      { route: 'swallowed:chat/upstream-fail', action: 'text-turn', message: '402 OpenRouter · openai/gpt-5.6-terra: billing', count: 1, lastAt: '2026-09-23T19:50:00Z', deploy: 'dpl_new' },
      { route: 'swallowed:chat/direct-fail-400', action: 'owner-direct', message: 'Function tools with reasoning_effort…', count: 8, lastAt: '2026-09-23T19:21:00Z', deploy: 'dpl_old' },
    ],
  }));
  await p.run();
  const t = p.box.textContent;
  assert.match(t, /📏 قياسات جهازك \(ليست أخطاء\): 2/);
  assert.match(t, /· ٥ دقائق: heap 12\/1048MB/, 'السطر بلا بادئة المسبار');
  assert.match(t, /✅ لا توجد أخطاء مسجلة من المستخدمين/);
  // v-err-ltr: السطر التقنيّ معزول يسار-يمين (\u2066…\u2069) فلا يتبعثر في الصندوق العربيّ
  assert.match(t, /⚠️ أخطاء الخادم في النشر الحاليّ: 1\n   • \u2066\[swallowed:chat\/upstream-fail\/text-turn\] 402 OpenRouter[^\n]*\u2069/);
  assert.match(t, /🗂️ من نشر سابق \(أُصلحت أو لم تتكرّر بعد التحديث\): 1\n   · \u2066\[swallowed:chat\/direct-fail-400/);
  assert.match(t, /^🔴 توجد ملاحظات/, 'خطأ النشر الحاليّ ملاحظة حقيقيّة');
});

test('٤. اللوحة: لا خطأ في النشر الحاليّ ⇒ 🟢 رغم القياسات وأخطاء ما قبل التحديث', async () => {
  const p = panel(Object.assign({}, BASE, {
    deploy: 'dpl_new',
    clientDiag: [PROBE('٢٠ث', 1)],
    serverErrorsCount: 1,
    serverErrors: [{ route: 'swallowed:chat/model-pick-404', message: 'gpt-6-luna-pro', count: 4, lastAt: '2026-09-23T19:21:00Z', deploy: '' }],
  }));
  await p.run();
  assert.match(p.box.textContent, /^🟢 النظام سليم/);
  assert.match(p.box.textContent, /✅ لا توجد أخطاء في الخادم منذ آخر تحديث/);
});

test('٥. «مسح سجل الأخطاء» يمسح السجلّين (المستخدمين والخادم) عبر فحص الصحّة', async () => {
  const p = panel(BASE);
  await p.clear();
  assert.ok(p.fetched.some((u) => /\/api\/system\?action=health&clear=errors&token=tok/.test(u)), p.fetched.join(' '));
  db.set('db/client-errors/log.json', [PROBE('x', 1)]);
  db.set('db/server-errors/log.json', [{ route: 'r', message: 'm' }]);
  const r = await call({ clear: 'errors' });
  assert.deepEqual(r.j, { ok: true, cleared: true });
  assert.deepEqual(db.get('db/client-errors/log.json'), []);
  assert.deepEqual(db.get('db/server-errors/log.json'), []);
});
