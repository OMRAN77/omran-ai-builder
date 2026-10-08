// tests/rename-move.test.cjs — v-rename-move (فحص الاشتراكات ٥ أكتوبر ٢٠٢٦): تغيير اسم المستخدم كان ينقل السجلّ ويترك
// العدّادات الحيّة على الاسم القديم — فالرجوع للاسم القديم يعيد الرصيد كاملًا بعد صرفه (٩٨٠ ← صرف ٨٢٥ ← رجوع ← ٩٨٠)،
// والاسم الجديد يبدأ بفيديوهات باقة وحصص يوم جديدة، ورصيد اشتراك الوسائط يختفي عنه. الآن كلّ عدّاد يتبع الحساب.
// يستعمل auth.js الحقيقيّ (changeUsername) وpoints.js الحقيقيّ؛ Redis وحده محاكى في الذاكرة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'rename-move-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const ttl = new Map();
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v, t) => { store.set(k, String(v)); if (t) ttl.set(k, t); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'GET') return store.has(k) ? store.get(k) : null;
    if (op === 'INCRBY') { const v = Number(store.get(k) || 0) + Number(a); store.set(k, String(v)); return v; }
    if (op === 'EXPIRE') { ttl.set(k, Number(a)); return 1; }
    if (op === 'DEL') { store.delete(k); return 1; }
    return null;
  }),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });

const auth = require(rp('api/_lib/auth.js'));
const points = require(rp('api/_lib/points.js'));
const call = (body) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } };
  auth({ method: 'POST', headers: {}, query: {}, body }, res);
});
const bal = async (u) => (await points.readPoints(u)).points;
const today = () => new Date().toISOString().slice(0, 10);
const tally = (u, b) => 'db/usage/tally/' + encodeURIComponent(u + '_' + today() + '_' + b) + '/' + today();
const cost = (u, kind) => 'cost:' + today().slice(0, 7) + ':' + u + ':' + kind;

test('١. الذهاب والإياب بين اسمين لا يعيد نقاطًا مصروفة (كان يعيدها كاملة)', async () => {
  await auth.putUser('alice', { username: 'alice', points: 1000, createdAt: Date.now() });
  await points.spendPoints('alice', 20, 'image');
  let r = await call({ action: 'changeUsername', token: auth.makeToken('alice'), newUsername: 'alice2' });
  assert.equal(r.status, 200);
  assert.equal(await bal('alice2'), 980);
  assert.equal(store.has('points:alice'), false, 'لا عدّاد يبقى تحت الاسم القديم');
  for (let i = 0; i < 3; i++) await points.spendPoints('alice2', 175, 'veo_video');
  assert.equal(await bal('alice2'), 455);
  r = await call({ action: 'changeUsername', token: r.body.token, newUsername: 'alice' });
  assert.equal(r.status, 200);
  assert.equal(await bal('alice'), 455, 'الرصيد الحقيقيّ لا ٩٨٠');
  const rec = await auth.getUser('alice');
  assert.deepEqual(rec.prevUsernames, ['alice2'], 'الأسماء السابقة محفوظة بلا الاسم الحاليّ');
});

test('٢. عدّاد يتيم تحت الاسم الجديد (من صاحب سابق) يُمحى ولا يُبعث', async () => {
  store.set('points:ghost', '5000'); // بقيّة حساب قديم بالاسم نفسه
  await auth.putUser('bob', { username: 'bob', points: 30, createdAt: Date.now() });
  const r = await call({ action: 'changeUsername', token: auth.makeToken('bob'), newUsername: 'ghost' });
  assert.equal(r.status, 200);
  assert.equal(await bal('ghost'), 30, 'لا ٥٠٠٠ من العدم');
});

test('٣. رصيد اشتراك الوسائط وفيديوهات الباقة وحصص اليوم وتكلفة الشهر تنتقل مع الحساب', async () => {
  const at = Date.now() - 2 * 86400000;
  await auth.putUser('cara', { username: 'cara', points: 70, plan: 'pro', planUpdatedAt: at, media: { video: { plan: 'vid_basic', at } }, createdAt: Date.now() });
  store.set('media:video:cara', '1100');
  store.set('planvid:cara:' + at, '2');
  store.set(tally('cara', 'plan'), '40');
  store.set(cost('cara', 'chat'), '2500000');
  const r = await call({ action: 'changeUsername', token: auth.makeToken('cara'), newUsername: 'cara2' });
  assert.equal(r.status, 200);
  assert.equal(store.get('media:video:cara2'), '1100');
  assert.ok(ttl.get('media:video:cara2') > 30 * 86400 && ttl.get('media:video:cara2') <= 33 * 86400, 'بما بقي من النافذة');
  assert.equal(store.has('media:video:cara'), false);
  assert.equal(store.get('planvid:cara2:' + at), '2', 'لا فيديوهات باقة جديدة بالاسم الجديد');
  assert.equal(store.get(tally('cara2', 'plan')), '40', 'حدّ اليوم لا يتصفّر');
  assert.equal(store.get(cost('cara2', 'chat')), '2500000', 'تكلفة الشهر صفّ واحد للحساب');
  assert.equal(store.has(cost('cara', 'chat')), false);
});

test('٤. الأسلاك: النقل بعد كتابة السجلّين، وفشله يُسجَّل ولا يُسقط تغيير الاسم', () => {
  const src = require('node:fs').readFileSync(path.join(root, 'api/_lib/auth.js'), 'utf8');
  assert.match(src, /await putUser\(oldKey, \{ deleted: true, movedTo: newKey \}\);\n\s+try \{ await moveLiveCounters\(oldKey, newKey, movedUser\); \} catch \(e\) \{ logError\('auth:rename-move'/);
  assert.match(src, /movedUser\.prevUsernames = /);
});

test('٥. اسم يساوي القديم بعد التطبيع لا يمحو الرصيد (النقل إلى المفتاح نفسه = نسخ ثمّ حذف)', async () => {
  await auth.putUser('Dana', { username: 'Dana', points: 500, createdAt: Date.now() });
  store.set('points:dana', '500');
  const r = await call({ action: 'changeUsername', token: auth.makeToken('Dana'), newUsername: 'dana' });
  assert.equal(r.status, 200);
  assert.equal(store.get('points:dana'), '500');
});

// ── v-move-buckets (المراجعة المعاكسة): سقوف الأدوات (checkAndConsumeCustom) لم تكن في MOVE_BUCKETS — تغيير الاسم يصفّرها بلا حدّ ──
const fs = require('node:fs');
function walkJs(d, out) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walkJs(p, out); else if (/\.js$/.test(f)) out.push(p); } return out; }
function callArgs(src, name) { // نصّ معاملات كلّ نداء بأقواسه المتداخلة (clientIp(req)…)
  const out = []; const re = new RegExp('\\b' + name + '\\(', 'g'); let m;
  while ((m = re.exec(src))) {
    let j = m.index + m[0].length, depth = 1, q = null;
    for (; j < src.length && depth; j++) { const c = src[j]; if (q) { if (c === '\\') j++; else if (c === q) q = null; } else if (c === "'" || c === '"' || c === '`') q = c; else if (c === '(') depth++; else if (c === ')') depth--; }
    out.push(src.slice(m.index + m[0].length, j - 1));
  }
  return out;
}
/** كلّ سلّة يعدّها checkAndConsumeCustom في الكود: حرفيّة في النداء (ومعابر البوّابة gateShare/uploadPlan، وغلاف الباقة
    checkAndConsumePlanCustom — v-plan-caps) أو ثابت مسمّى، وسلال الحفظ في SAVE_PLANS (v-media-save-split). */
const CUSTOM_WRAPPERS = ['checkAndConsumeCustom', 'checkAndConsumePlanCustom', 'gateShare', 'uploadPlan'];
function customBuckets() {
  const found = new Set();
  for (const f of walkJs(path.join(root, 'api'), [])) {
    if (/_usage\.js$/.test(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    for (const n of CUSTOM_WRAPPERS) for (const a of callArgs(s, n)) (a.match(/'([a-z0-9-]+)'/g) || []).forEach((x) => found.add(x.slice(1, -1)));
    const qb = s.match(/QUOTA_BUCKET = '([a-z0-9-]+)'/); if (qb) found.add(qb[1]);
    const sp = s.match(/SAVE_PLANS = \{[\s\S]*?\n\};/); if (sp) (sp[0].match(/bucket: '([a-z0-9-]+)'/g) || []).forEach((x) => found.add(x.match(/'([a-z0-9-]+)'/)[1]));
  }
  return [...found];
}
/** أيّ دالّة في api/_lib تنادي checkAndConsumeCustom بسلّة ممرَّرة (لا حرفيّة) غلافٌ يجب أن يراه المستخرج. */
function unseenWrappers() {
  const out = [];
  for (const f of walkJs(path.join(root, 'api'), [])) {
    if (/_usage\.js$/.test(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    for (const a of callArgs(s, 'checkAndConsumeCustom')) {
      if (/'[a-z0-9-]+'/.test(a)) continue;
      const before = s.slice(0, s.indexOf(a));
      const fn = (before.match(/(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{(?![\s\S]*\bfunction\s+[A-Za-z0-9_]+\s*\()/) || [])[1];
      if (!fn || !CUSTOM_WRAPPERS.includes(fn)) out.push(path.relative(root, f) + ':' + (fn || '?'));
    }
  }
  return out;
}

test('٦. كلّ سلال checkAndConsumeCustom في MOVE_BUCKETS، واستهلاك السقف ثمّ تغيير الاسم ← الطلب التالي مرفوض لا سقف جديد', async () => {
  const usage = require(rp('api/_lib/_usage.js'));
  const buckets = customBuckets();
  for (const b of ['search', 'search-classify', 'chat-search', 'design-ideas', 'design-suggest', 'video-download', 'share-img', 'media-save-img', 'media-save-pdf', 'media-save-file', 'stocks-ai', 'stocks-pf', 'adchat', 'adimage', 'stamps', 'cx-brief', 'translate', 'tts']) assert.ok(buckets.includes(b), 'المستخرج يرى ' + b);
  assert.deepEqual(unseenWrappers(), [], 'غلاف لـcheckAndConsumeCustom بسلّة ممرَّرة لا يراه المستخرج');
  const missing = buckets.filter((b) => !usage.MOVE_BUCKETS.includes(b));
  assert.deepEqual(missing, [], 'سلال تتصفّر بتغيير الاسم');
  await auth.putUser('erin', { username: 'erin', points: 10, createdAt: Date.now() });
  const old = auth.makeToken('erin');
  for (const b of buckets) assert.equal((await usage.checkAndConsumeCustom(old, null, null, b, 1)).allowed, true, b);
  const r = await call({ action: 'changeUsername', token: old, newUsername: 'erin2' });
  assert.equal(r.status, 200);
  for (const b of buckets) {
    const g = await usage.checkAndConsumeCustom(r.body.token, null, null, b, 1);
    assert.equal(g.allowed, false, b + ': السقف انتقل مع الحساب');
    assert.equal(g.reason, 'limit', b);
  }
});

test('٦ب. المعالج الحقيقيّ: نشر حتّى السقف (٣٠) ثمّ تغيير الاسم ← النشر التالي 429', async () => {
  const share = require(rp('api/_lib/share.js'));
  const post = (token, code) => new Promise((resolve, reject) => {
    const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, end() { resolve({ status: this._s }); return this; } };
    Promise.resolve(share({ method: 'POST', headers: {}, query: {}, body: { token, title: 't', code } }, res)).catch(reject);
  });
  await auth.putUser('fred', { username: 'fred', points: 10, createdAt: Date.now() });
  const old = auth.makeToken('fred');
  for (let i = 0; i < 30; i++) assert.equal((await post(old, 'x' + i)).status, 200, '#' + (i + 1));
  assert.equal((await post(old, 'over')).status, 429);
  const r = await call({ action: 'changeUsername', token: old, newUsername: 'fred2' });
  assert.equal(r.status, 200);
  const next = await post(r.body.token, 'after-rename');
  assert.equal(next.status, 429, 'كان يمرّ: الاسم الجديد يبدأ بسقف جديد');
  assert.equal(next.body.error, 'daily_limit');
});
