'use strict';
/* v-ideas-hosts (تدقيق ١٨ أكتوبر، معرض أفكار الديكور): الخادم كان يمرّر روابط مواقع تمنع الربط المباشر (tiktok.com/api/img،
   cdninstagram، fbcdn…) فتعود 403 في المتصفّح وأخطاء في الكونسول ويُعدّ ما لا يظهر. تُرفض بمضيفها عند الجمع، وتُصفّى عند القراءة
   من الذاكرة المؤقّتة أيضًا بلا رفع مفتاح ideas:v3 (فلا تُستهلك حصص بحث جديدة)؛ والمخبوء الذي لا يبقى منه شيء يُجمع من جديد.
   المعالج الحقيقيّ، وKV والعدّاد والشبكة محاكاة في الذاكرة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

process.env.AUTH_SECRET = 'ideas-hosts-test-secret';
process.env.GOOGLE_SEARCH_API_KEY = 'gs-test';
process.env.GOOGLE_SEARCH_CX = 'cx-test';
delete process.env.TAVILY_API_KEY;
delete process.env.PEXELS_API_KEY;
delete process.env.UNSPLASH_ACCESS_KEY;

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const store = new Map();
mock('api/_lib/kv.js', new Proxy({
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
}, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/_usage.js', { checkAndConsumeCustom: async () => ({ allowed: true }), refundCustom: async () => {}, clientIp: () => '1.1.1.1' });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const BLOCKED = [
  'https://www.tiktok.com/api/img/?itemId=1&location=0',
  'https://p16-sign-va.tiktokcdn.com/obj/x.jpeg',
  'https://p19-sign.tiktokcdn-us.com/tos/y.jpeg',
  'https://scontent-fra5-1.cdninstagram.com/v/t51/z.jpg',
  'https://www.instagram.com/p/abc/media/?size=l',
  'https://scontent.fdxb1-1.fna.fbcdn.net/v/t39/q.jpg',
  'https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=1',
  'https://www.facebook.com/photo.php?fbid=1',
];
const GOOD = Array.from({ length: 14 }, (_, i) => 'https://i.pinimg.com/736x/aa/' + i + '.jpg');
const calls = [];
global.fetch = async (url) => {
  const u = String(url);
  calls.push(u);
  if (/googleapis\.com\/customsearch/.test(u)) return { ok: true, status: 200, json: async () => ({ items: BLOCKED.concat(GOOD).map((link) => ({ link })) }) };
  return { ok: true, status: 200, json: async () => ({ results: [] }), text: async () => '' };
};

const auth = require(rp('api/_lib/auth.js'));
const ideas = require(rp('api/_lib/design-ideas.js'));
const call = async (body) => {
  const r = { code: 0, j: null, setHeader() {}, status(c) { r.code = c; return r; }, json(j) { r.j = j; return r; } };
  await ideas({ method: 'POST', headers: {}, body: Object.assign({ token: auth.makeToken('dana') }, body) }, r);
  return r;
};
const keyFor = (parts) => 'ideas:v3:' + crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex');
const isBlocked = (u) => BLOCKED.includes(u);

test('١ الجمع: روابط تيك توك وإنستغرام وفيسبوك تُرفض بمضيفها، وPinterest يبقى', async () => {
  const r = await call({ place: 'majlis' });
  assert.equal(r.code, 200);
  assert.ok(r.j.images.length >= GOOD.length, 'الصالحة كلّها باقية');
  assert.equal(r.j.images.filter(isBlocked).length, 0, 'لا مضيف ممنوع: ' + r.j.images.filter(isBlocked).join(' '));
  assert.ok(r.j.images.includes(GOOD[0]));
  const cached = JSON.parse(store.get(keyFor(['decor', 'arabic majlis', 'مجلس عربي', ''])));
  assert.equal(cached.images.filter(isBlocked).length, 0, 'المخبوء نظيف');
});

test('٢ المخبوء القديم يُصفّى عند القراءة بلا نداء جديد، وإن لم يبقَ منه شيء يُجمع من جديد', async () => {
  const k = keyFor(['decor', 'kitchen', 'مطبخ', '']);
  store.set(k, JSON.stringify({ images: BLOCKED.concat(GOOD.slice(0, 3)), count: 11, source: 'google' }));
  let n = calls.length;
  let r = await call({ place: 'kitchen' });
  assert.equal(r.code, 200);
  assert.deepEqual(r.j.images, GOOD.slice(0, 3), 'المخبوء بلا الممنوعة');
  assert.equal(r.j.count, 3, 'والعدد عددها');
  assert.equal(calls.length, n, 'بلا نداء بحث (المفتاح ideas:v3 كما هو)');

  const k2 = keyFor(['decor', 'bathroom', 'حمام', '']);
  store.set(k2, JSON.stringify({ images: BLOCKED.slice(0, 3), count: 3, source: 'google' }));
  n = calls.length;
  r = await call({ place: 'bath' });
  assert.ok(calls.length > n, 'مخبوء كلّه ممنوع = جمع جديد');
  assert.equal(r.j.images.filter(isBlocked).length, 0);
  assert.ok(r.j.images.length >= GOOD.length);

  const kc = keyFor(['cx', 'villa', '', 'exterior facade elevation design', '', '']);
  store.set(kc, JSON.stringify({ images: [BLOCKED[0], GOOD[5]], count: 2, source: 'google' }));
  n = calls.length;
  r = await call({ mode: 'construction', type: 'villa', view: 'exterior' });
  assert.deepEqual(r.j.images, [GOOD[5]], 'معرض المقاولات يقرأ المخبوء بالتصفية نفسها');
  assert.equal(calls.length, n);
});
