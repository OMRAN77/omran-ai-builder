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
