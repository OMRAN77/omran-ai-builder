// tests/share-guard.test.cjs — v-share-guard (فحص الحدود ٨ أكتوبر ٢٠٢٦): روابط المشاركة وصور الضيف كانت مفتوحة.
// (١) POST /api/media?action=img|pdf|file يخزّن حتّى ٣–٤ م.ب في Redis سبعة أيّام بلا هويّة ولا حدّ — نحو ٨٦ طلبًا
//     تملأ القاعدة (٢٥٦ م.ب) فتفشل الكتابة في التطبيق كلّه؛ و«ملفّ» يقبل text/html فيُقدَّم من نطاق التطبيق نفسه.
// (٢) POST /api/share ينشر حتّى ٢ م.ب بلا عمر وبلا رمز، واسم الناشر حقل يكتبه العميل كما يشاء.
// (٣) صور الضيف تُعدّ على guestId يولّده المتصفّح — تغييره يعطي ثلاث صور جديدة كلّ مرّة على مفاتيح المالك.
// المعالجات الحقيقيّة (و_usage.js وauth.js الحقيقيّان)؛ Redis والشبكة وحدهما محاكيان في الذاكرة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'share-guard-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'offline-gemini';
process.env.OPENAI_API_KEY = 'offline-openai';
process.env.IMAGE_UPSCALE = 'off';
process.env.IMAGE_CARDS = 'off';
delete process.env.OWNER_USERNAMES;
delete process.env.OWNER_USERNAME;
delete process.env.IMAGE_VERIFY;

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
let scans = 0;
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async () => {},
  kvDel: async (k) => { store.delete(k); },
  kvList: async (prefix) => { scans++; return [...store.keys()].filter((k) => k.startsWith(prefix)); },
  kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });
// صورة الضيف: الحساب المسجَّل غير مقصود هنا — النقاط والخطط والحارس الساعيّ خارج الاختبار.
mock('api/_lib/points.js', { COSTS: { image: 20, image_4k: 30 }, verifyPointsToken: () => null, isOwnerUsername: () => false });
mock('api/_lib/_mediaPlans.js', { imageQuality: async () => null });
mock('api/_lib/abuse-guard.js', { imageHourlyGuard: async () => ({ ok: true }) });

const { makeToken } = require(rp('api/_lib/auth.js'));
const img = require(rp('api/_lib/img-share.js'));
const pdf = require(rp('api/_lib/pdf-share.js'));
const file = require(rp('api/_lib/file-share.js'));
const share = require(rp('api/_lib/share.js'));
const maha = require(rp('api/_lib/maha-image.js'));

function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      _s: 200, headers: {},
      setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
      status(c) { this._s = c; return this; },
      json(b) { resolve({ status: this._s, body: b, headers: this.headers }); return this; },
      send(b) { resolve({ status: this._s, body: b, headers: this.headers }); return this; },
      end(b) { resolve({ status: this._s, body: b, headers: this.headers }); return this; },
    };
    Promise.resolve(handler(Object.assign({ headers: {}, query: {} }, req), res)).catch(reject);
  });
}
const keysOf = (prefix) => [...store.keys()].filter((k) => k.startsWith(prefix));
const B64 = Buffer.from('omran share guard').toString('base64');
const PDF_B64 = Buffer.from('%PDF-1.4 tiny').toString('base64');

test('١. روابط المشاركة الثلاث: بلا رمز جلسة = 401 ولا بايت في Redis', async () => {
  for (const [h, body, prefix] of [
    [img, { data: B64, mime: 'image/jpeg' }, 'db/img/'],
    [pdf, { data: PDF_B64, name: 'a.pdf' }, 'db/pdf/'],
    [file, { data: B64, name: 'a.txt', mime: 'text/plain' }, 'db/file/'],
  ]) {
    for (const token of [undefined, '', 'forged.token']) {
      const r = await call(h, { method: 'POST', body: Object.assign({ token }, body) });
      assert.equal(r.status, 401, prefix + ' token=' + token);
      assert.equal(r.body.error, 'auth_required');
    }
    assert.equal(keysOf(prefix).length, 0, prefix + ': لا تخزين بلا هويّة');
  }
});

test('٢. سقف يوميّ ثابت لكلّ حساب: صورة ٣٠، PDF ٢٠، ملفّ ١٠ — وما بعده 429 بلا تخزين', async () => {
  for (const [h, body, prefix, cap, user] of [
    [img, { data: B64, mime: 'image/jpeg' }, 'db/img/', 30, 'imgUser'],
    [pdf, { data: PDF_B64, name: 'a.pdf' }, 'db/pdf/', 20, 'pdfUser'],
    [file, { data: B64, name: 'a.txt', mime: 'text/plain' }, 'db/file/', 10, 'fileUser'],
  ]) {
    const token = makeToken(user);
    const before = keysOf(prefix).length;
    for (let i = 0; i < cap; i++) {
      const r = await call(h, { method: 'POST', body: Object.assign({ token }, body) });
      assert.equal(r.status, 200, prefix + ' #' + (i + 1));
      assert.ok(r.body.url);
    }
    const over = await call(h, { method: 'POST', body: Object.assign({ token }, body) });
    assert.equal(over.status, 429, prefix + ': الطلب ' + (cap + 1));
    assert.equal(over.body.error, 'daily_limit');
    assert.equal(keysOf(prefix).length - before, cap, prefix + ': التخزين توقّف عند السقف');
    // الرمز في ترويسة Authorization مقبول أيضًا (والسقف نفسه)
    const hdr = await call(h, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body });
    assert.equal(hdr.status, 429);
  }
  // المالك معفى (حسابه وفاتورته)
  const owner = makeToken('omran');
  for (let i = 0; i < 31; i++) assert.equal((await call(img, { method: 'POST', body: { token: owner, data: B64 } })).status, 200);
});

test('٣. الرابط العامّ GET يبقى بلا رمز كما كان', async () => {
  const token = makeToken('viewerTest');
  const up = await call(img, { method: 'POST', body: { token, data: B64, mime: 'image/png' } });
  const id = up.body.id;
  const got = await call(img, { method: 'GET', query: { id: id + '.raw.png' } });
  assert.equal(got.status, 200);
  assert.equal(got.headers['content-type'], 'image/png');
  const p = await call(pdf, { method: 'POST', body: { token, data: PDF_B64, name: 'r.pdf' } });
  assert.equal((await call(pdf, { method: 'GET', query: { id: p.body.id } })).status, 200);
});

test('٤. نقطة الملفّات: أنواع تُنفَّذ في المتصفّح (HTML/SVG/XML/JS) تُقدَّم تنزيلًا بنوع آمن — والقديم المخزَّن أيضًا', async () => {
  const token = makeToken('htmlUser');
  for (const mime of ['text/html', 'text/html;charset=utf-8', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml', 'text/javascript', 'application/javascript']) {
    const up = await call(file, { method: 'POST', body: { token, data: B64, name: 'x.html', mime } });
    assert.equal(up.status, 200, mime);
    const got = await call(file, { method: 'GET', query: { id: up.body.id } });
    assert.equal(got.headers['content-type'], 'application/octet-stream', mime);
    assert.match(got.headers['content-disposition'], /^attachment;/);
    assert.equal(got.headers['x-content-type-options'], 'nosniff');
  }
  // الأنواع المستعملة فعلًا تبقى كما هي (Word/TXT/Markdown/صورة/فيديو)
  for (const mime of ['text/plain;charset=utf-8', 'application/msword', 'text/markdown;charset=utf-8', 'image/png', 'video/mp4']) {
    const up = await call(file, { method: 'POST', body: { token: makeToken('keep' + mime.length), data: B64, name: 'a.txt', mime } });
    const got = await call(file, { method: 'GET', query: { id: up.body.id } });
    assert.equal(got.headers['content-type'], mime);
  }
  // سجلّ خُزِّن قبل الإصلاح بنوع text/html
  store.set('db/file/abcdef123456', 'text/html:evil.html:' + Buffer.from('<script>alert(1)</script>').toString('base64'));
  const legacy = await call(file, { method: 'GET', query: { id: 'abcdef123456' } });
  assert.equal(legacy.status, 200);
  assert.equal(legacy.headers['content-type'], 'application/octet-stream');
});

test('٥. /api/share: رمز إلزاميّ، والناشر من الرمز لا من الجسم، وسقف ٣٠ يوميًّا', async () => {
  const anon = await call(share, { method: 'POST', body: { title: 't', code: '<p>x</p>', username: 'omran', isPublic: true } });
  assert.equal(anon.status, 401);
  assert.equal(anon.body.error, 'auth_required');
  assert.equal(keysOf('db/shares/').length, 0);
  assert.equal(keysOf('db/explore/').length, 0);

  const token = makeToken('sara');
  const r = await call(share, { method: 'POST', body: { token, title: 't', code: '<p>x</p>', username: 'omran', isPublic: true } });
  assert.equal(r.status, 200);
  const rec = JSON.parse(store.get('db/shares/' + r.body.id + '.json'));
  assert.equal(rec.username, 'sara', 'لا انتحال باسم المالك');
  const idx = keysOf('db/explore/').map((k) => JSON.parse(store.get(k)));
  assert.deepEqual(idx.map((x) => x.username), ['sara']);
  // ترويسة Authorization (كما يرسلها DELETE في explore.html) مقبولة أيضًا
  const viaHdr = await call(share, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: { title: 't', code: 'x' } });
  assert.equal(viaHdr.status, 200);
  for (let i = 2; i < 30; i++) assert.equal((await call(share, { method: 'POST', body: { token, code: 'x' + i } })).status, 200, '#' + (i + 1));
  const over = await call(share, { method: 'POST', body: { token, code: 'x31' } });
  assert.equal(over.status, 429);
  assert.equal(over.body.error, 'daily_limit');
  assert.equal(keysOf('db/shares/').length, 30);
  // صاحب المشاركة يحذفها برمزه كما كان
  const del = await call(share, { method: 'DELETE', query: { id: r.body.id }, headers: { authorization: 'Bearer ' + token } });
  assert.equal(del.status, 200);
});

test('٦. «استكشف» لا يمسح القاعدة كلّها مع كلّ زيارة: ذاكرة قصيرة، والنشر العامّ الجديد يظهر فورًا', async () => {
  scans = 0;
  const a = await call(share, { method: 'GET', query: { explore: '1' } });
  const b = await call(share, { method: 'GET', query: { explore: '1' } });
  assert.equal(a.status, 200);
  assert.deepEqual(b.body, a.body);
  assert.equal(scans, 1, 'زيارتان = مسح واحد');
  const made = await call(share, { method: 'POST', body: { token: makeToken('nour'), title: 'new', code: 'y', isPublic: true } });
  const c = await call(share, { method: 'GET', query: { explore: '1' } });
  assert.ok(c.body.items.some((x) => x.id === made.body.id), 'النشر العامّ يُبطل الذاكرة');
});

// ── صور الضيف ──────────────────────────────────────────────────────────────
const SRC = fs.readFileSync(path.join(root, 'tests/fixtures/styles-grid-source.jpg')).toString('base64');
let engineUp = true;
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('gemini-flash-latest')) return Response.json({ error: 'offline judge' }, { status: 503 });
  if (u.includes('api.openai.com')) return Response.json({ error: { message: 'offline' } }, { status: 500 });
  assert.match(u, /generativelanguage\.googleapis\.com/, 'لا نداء خارجيّ يفلت من المحاكاة');
  return engineUp
    ? Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: SRC, mimeType: 'image/jpeg' } }] } }] })
    : Response.json({ error: 'offline' }, { status: 400 });
};
const guestDraw = (guestId, ip) => call(maha, { method: 'POST', headers: ip ? { 'x-forwarded-for': ip } : {}, body: { prompt: 'ارسم قطة على كرسي', guestId } });

test('٧. صور الضيف: تغيير guestId من الشبكة نفسها لا يعطي صورًا جديدة بلا حدّ', async () => {
  const ip = '203.0.113.7';
  for (let i = 1; i <= 3; i++) {
    const r = await guestDraw('guestA' + i + 'xyz', ip);
    assert.equal(r.status, 200, 'صورة ' + i);
    assert.ok(r.body.imageBase64);
  }
  const fourth = await guestDraw('guestFresh999', ip);
  assert.equal(fourth.status, 402, 'معرّف جديد من الـIP نفسه بعد ثلاث');
  assert.equal(fourth.body.error, 'guest_image_used', 'الرمز نفسه — الواجهة تفتح التسجيل كما كانت');
  assert.equal(store.get('db/points/guest-image/guestFresh999/count'), '0', 'المرفوض لا يحرق محاولة المعرّف');
  // شبكة أخرى لها حصّتها
  assert.equal((await guestDraw('guestOther01', '198.51.100.9')).status, 200);
  // حدّ المعرّف القديم (٣ مدى الحياة) باقٍ كما هو ولو تغيّرت الشبكة
  for (let i = 0; i < 2; i++) assert.equal((await guestDraw('guestOther01', '198.51.100.' + (20 + i))).status, 200);
  assert.equal((await guestDraw('guestOther01', '198.51.100.30')).status, 402);
});

test('٨. فشل التوليد يردّ محاولة الضيف على المعرّف وعلى الـIP معًا', async () => {
  const ip = '192.0.2.44';
  engineUp = false;
  try {
    const r = await guestDraw('guestFail01', ip);
    assert.notEqual(r.status, 200);
  } finally { engineUp = true; }
  const ipKeys = keysOf('db/points/guest-image-ip/').filter((k) => k.includes(encodeURIComponent(ip)));
  assert.equal(ipKeys.length, 1);
  assert.equal(store.get(ipKeys[0]), '0', 'حصّة الشبكة رجعت');
  assert.equal(store.get('db/points/guest-image/guestFail01/count'), '0', 'حصّة المعرّف رجعت');
  for (let i = 1; i <= 3; i++) assert.equal((await guestDraw('guestAfter' + i + 'x', ip)).status, 200);
});

test('٩. الواجهة ترسل رمز الجلسة مع كلّ رفع مشاركة، وتفتح التسجيل عند 401 في نافذة المشاركة', () => {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const tok = /token: \(typeof authGet === 'function' \? \(authGet\('aiapp_auth_token'\) \|\| ''\) : ''\)/;
  assert.match(read('js/app-05-ui.js').slice(read('js/app-05-ui.js').indexOf('async function omranBlobToServerLink')).slice(0, 1600), tok, 'PDF/ملفّ');
  for (const f of ['js/app-05-img-save.js', 'js/app-05-save-media.js', 'js/app-09-attach.js']) {
    const s = read(f);
    const at = s.indexOf("fetch('/api/media?action=img'");
    assert.ok(at > 0, f);
    assert.match(s.slice(at, at + 400), tok, f);
  }
  const feat = read('js/app-10-features.js');
  const sh = feat.slice(feat.indexOf("const resp = await fetch('/api/share'"), feat.indexOf("const resp = await fetch('/api/share'") + 900);
  assert.match(sh, tok);
  assert.doesNotMatch(sh, /\busername,/, 'الاسم لا يُرسَل — الخادم يأخذه من الرمز');
  assert.match(sh, /resp\.status === 401\)\{ closeModal\(\);[^\n]*requireLogin\('guestLimit'\)/, 'نافذة المشاركة (z-index 10000) تُغلق قبل شاشة الدخول (9999)');
});

test('١٠. v-share-bytes: ميزانيّة بايت يوميّة واحدة لكلّ حساب عبر الصورة والـPDF والملفّ والمشروع — عدد الطلبات وحده لا يحمي القاعدة', async () => {
  const prev = process.env.SHARE_BYTES_DAILY;
  process.env.SHARE_BYTES_DAILY = String(B64.length * 2 + 4); // تتّسع لرفعين بحجم B64
  try {
    const token = makeToken('bytesUser');
    const tally = () => keysOf('db/usage/tally/').filter((k) => k.includes('bytesUser')).map((k) => Number(store.get(k) || 0)).reduce((a, b) => a + b, 0);
    assert.equal((await call(img, { method: 'POST', body: { token, data: B64, mime: 'image/jpeg' } })).status, 200);
    assert.equal((await call(file, { method: 'POST', body: { token, data: B64, name: 'a.txt', mime: 'text/plain' } })).status, 200);
    const stored = () => keysOf('db/').filter((k) => !k.startsWith('db/usage/')).length; // المحتوى لا العدّادات
    const before = stored();
    const counted = tally();
    const over = await call(img, { method: 'POST', body: { token, data: B64, mime: 'image/jpeg' } });
    assert.deepEqual([over.status, over.body.error], [429, 'daily_bytes'], 'الثالث يتجاوز الميزانيّة وسقف الصور (٣٠) بعيد');
    assert.equal(tally(), counted, 'عدّ السلّة يُردّ — الرفض بالبايت لا يأكل من سقف الطلبات');
    const pdfOver = await call(pdf, { method: 'POST', body: { token, data: PDF_B64, name: 'a.pdf' } });
    assert.equal(pdfOver.status, 429, 'الميزانيّة واحدة عبر النقاط كلّها');
    const shareOver = await call(share, { method: 'POST', body: { token, title: 't', code: 'x'.repeat(B64.length) } });
    assert.equal(shareOver.status, 429, 'والمشروع المنشور منها');
    assert.equal(stored() - before, 0, 'لا شيء خُزّن بعد الرفض');
    // المالك معفى من الميزانيّة كما هو معفى من السقف
    const owner = makeToken('omran');
    for (let i = 0; i < 5; i++) assert.equal((await call(img, { method: 'POST', body: { token: owner, data: B64 } })).status, 200);
  } finally {
    if (prev === undefined) delete process.env.SHARE_BYTES_DAILY; else process.env.SHARE_BYTES_DAILY = prev;
  }
});
