// tests/audit-fix-stud2.test.cjs — v-audit-stud2 (تدقيق التطبيق كاملًا، مجموعة stud2: الأنماط والأزياء والتصميم والإعلانات ومكتبة المقاولات).
// الخادم بمعالجاته الحقيقيّة: kv.js الحقيقيّ على Upstash وهميّ (على مستوى fetch — الأوامر نفسها التي تصل الإنتاج)، والمزوّد وهميّ.
// والواجهة بمقاطع من الأجزاء نفسها في node:vm.
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
process.env.UPSTASH_REDIS_REST_URL = 'https://kv.stud2.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'kv-token';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.PSTYLE_FACE_CROP = 'off';
delete process.env.OPENAI_API_KEY;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

/* ── Upstash وهميّ: نصّ الأوامر كما يرسلها kv.js ── */
const REST = process.env.UPSTASH_REDIS_REST_URL;
const R = { data: new Map(), log: [] };
function alive(k) {
  const e = R.data.get(k);
  if (!e) return null;
  if (e.exp && e.exp <= Date.now()) { R.data.delete(k); return null; }
  return e;
}
function redis(cmd) {
  const a = cmd.map(String);
  const c = a.shift().toUpperCase();
  R.log.push([c].concat(a));
  const at = (n, len) => { n = Number(n); return n < 0 ? len + n : n; };
  switch (c) {
    case 'GET': { const e = alive(a[0]); return e ? e.v : null; }
    case 'SET': {
      const up = a.map((x) => x.toUpperCase());
      if (up.includes('NX') && alive(a[0])) return null;
      const i = up.indexOf('EX');
      R.data.set(a[0], { v: a[1], exp: i > 1 ? Date.now() + Number(a[i + 1]) * 1000 : 0 });
      return 'OK';
    }
    case 'DEL': { let n = 0; for (const k of a) if (R.data.delete(k)) n++; return n; }
    case 'LPUSH': { const e = alive(a[0]) || { v: [], exp: 0 }; for (const x of a.slice(1)) e.v.unshift(x); R.data.set(a[0], e); return e.v.length; }
    case 'LRANGE': { const e = alive(a[0]); if (!e) return []; const L = e.v.length; const s = Math.max(0, at(a[1], L)), t = Math.min(L - 1, at(a[2], L)); return s > t ? [] : e.v.slice(s, t + 1); }
    case 'LTRIM': { const e = alive(a[0]); if (!e) return 'OK'; const L = e.v.length; const s = Math.max(0, at(a[1], L)), t = Math.min(L - 1, at(a[2], L)); e.v = s > t ? [] : e.v.slice(s, t + 1); return 'OK'; }
    case 'EXPIRE': { const e = alive(a[0]); if (!e) return 0; e.exp = Date.now() + Number(a[1]) * 1000; return 1; }
    case 'TTL': { const e = alive(a[0]); if (!e) return -2; return e.exp ? Math.ceil((e.exp - Date.now()) / 1000) : -1; }
    case 'INCR': { const e = alive(a[0]) || { v: '0', exp: 0 }; e.v = String(Number(e.v) + 1); R.data.set(a[0], e); return Number(e.v); }
    case 'SCAN': {
      const m = a[a.indexOf('MATCH') + 1];
      const prefix = m.slice(0, -1).replace(/\\(.)/g, '$1');
      return ['0', [...R.data.keys()].filter((k) => k.startsWith(prefix) && alive(k))];
    }
    default: throw new Error('أمر غير متوقّع ' + c);
  }
}
let net = null; // بقيّة الشبكة (المزوّد) يحدّدها كلّ اختبار
global.fetch = async (url, init) => {
  const u = String(url);
  if (u === REST) return Response.json({ result: redis(JSON.parse(init.body)) });
  if (u === REST + '/pipeline') return Response.json(JSON.parse(init.body).map((cmd) => ({ result: redis(cmd) })));
  if (net) return net(u, init);
  throw new Error('شبكة غير متوقّعة ' + u);
};

const tokenFor = (u) => {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 3600e3 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
function pngB64(w, h, seed) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0;
    p.data[i * 4] = (x * 3 + seed * 50) & 255; p.data[i * 4 + 1] = (y * 5) & 255; p.data[i * 4 + 2] = ((x ^ y) + seed * 7) & 255; p.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(p).toString('base64');
}
function resOf() {
  return { code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; }, end(s) { if (s != null) { try { this.body = JSON.parse(s); } catch (e) { this.body = s; } } return this; } };
}
const quiet = async (fn) => { const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; } };

/* ── وحدات البورتريه والاقتراح بحصّة وحارس وهميّين (المزوّد وهميّ عبر net) ── */
const P = { checks: 0, consumed: [], guard: { ok: true } };
stub('api/_lib/_portraitUsage.js', {
  checkPortraitQuota: async () => { P.checks++; return { allowed: true, username: 'sara', limit: 3, remaining: 3 }; },
  consumePortrait: async (u) => { P.consumed.push(u); return 2; },
  PORTRAIT_DAILY_LIMIT: 3,
});
const realGuard = require(rp('api/_lib/image-edit-guard.js'));
stub('api/_lib/image-edit-guard.js', Object.assign({}, realGuard, { verifyLocalizedImageEdit: async () => P.guard }));
stub('api/_lib/image-giveback.js', { keepGuardCharge: async () => {} });
stub('api/_lib/_fashionUsage.js', { checkFashionQuota: async () => ({ allowed: true, username: 'sara' }), consumeFashion: async () => 1, FASHION_DAILY_LIMIT: 3 });
stub('api/_lib/_designUsage.js', { checkDesignQuota: async () => ({ allowed: true, username: 'sara' }), consumeDesign: async () => 1, DESIGN_DAILY_LIMIT: 3 });
stub('api/_lib/_usage.js', { checkAndConsumeCustom: async () => ({ allowed: true }), refundCustom: async () => {}, clientIp: () => '203.0.113.7', checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 20 });
const geminiImage = (data, mimeType) => Response.json({ candidates: [{ content: { parts: [{ inlineData: { data, mimeType: mimeType || 'image/png' } }] } }] });

/* ═════════════════ srv-studios-2-1 ═════════════════ */
test('srv-studios-2-1 مكتبة المقاولات: السجلّ بمدّة صلاحية ومخطّط مصغّر WebP، وسقف للعدد يحذف الأقدم، والتنظيف يشمل المكتبة ولا يمسّ القديم بلا عمر', async () => {
  R.data.clear(); R.log.length = 0;
  const lib = require(rp('api/_lib/_constructionLibrary.js'));
  const ic = require(rp('api/_lib/img-convert.js'));
  const plan = pngB64(1536, 1024, 1);
  const id = await lib.saveDesign({ buildingType: 'villa', floors: 2, area: 400, lang: 'ar', planImageBase64: plan, planMimeType: 'image/png' });
  assert.ok(id, 'حُفظ');
  const key = 'db/construction-library/' + id + '.json';
  const set = R.log.find((c) => c[0] === 'SET' && c[1] === key);
  assert.ok(set, 'السجلّ كُتب');
  assert.equal(String(set[3]).toUpperCase(), 'EX', 'SET بمدّة صلاحية في الأمر نفسه: ' + set.slice(0, 2).concat(set.slice(3)).join(' '));
  assert.equal(Number(set[4]), lib.LIB_TTL_SEC);
  assert.ok(redis(['TTL', key]) > 0, 'TTL موجب لا ‎-1');
  const rec = JSON.parse(set[2]);
  assert.equal(rec.planMimeType, 'image/webp', 'المخطّط المحفوظ WebP مصغّر');
  const webp = Buffer.from(rec.planImageBase64, 'base64');
  assert.equal(ic.sniff(webp), 'webp');
  const dec = await (await ic.__webpLib()).decode(new Uint8Array(webp));
  assert.ok(dec.width <= 1024 && dec.width >= 1000, 'عرض ' + dec.width);
  assert.equal(dec.height, Math.round(1024 * dec.width / 1536), 'النسبة كما هي');
  assert.ok(rec.planImageBase64.length < plan.length, 'أصغر من الأصل');

  // صورة أكبر من سقف السجلّ لا تُحفظ (لا شيء يملأ القاعدة)
  R.log.length = 0;
  assert.equal(await lib.saveDesign({ buildingType: 'villa', floors: 2, area: 400, lang: 'ar', planImageBase64: 'A'.repeat(lib.LIB_IMG_MAX + 4) }), null);
  assert.ok(!R.log.some((c) => c[0] === 'SET'), 'لا SET لسجلّ فوق السقف');

  // سقف العدد: الأقدم يُحذف حين يُتجاوز
  R.data.clear();
  const ids = [];
  for (let i = 0; i < lib.LIB_MAX + 3; i++) ids.push(await lib.saveDesign({ buildingType: 'villa', floors: 1, area: 200, lang: 'ar', planImageBase64: 'P' + i }));
  const left = [...R.data.keys()].filter((k) => k.startsWith('db/construction-library/'));
  assert.equal(left.length, lib.LIB_MAX, 'عدد السجلّات = السقف');
  for (const old of ids.slice(0, 3)) assert.equal(R.data.has('db/construction-library/' + old + '.json'), false, 'الأقدم حُذف ' + old);
  assert.ok(R.data.has('db/construction-library/' + ids[ids.length - 1] + '.json'), 'الأحدث باقٍ');

  // التنظيف عند امتلاء القاعدة يشمل المكتبة: القديم بعمره يُحذف، والحديث يبقى، والسجلّ القديم بلا عمر (قبل الإصلاح) لا يُمسّ
  const mp = require(rp('api/_lib/media-purge.js'));
  const g = mp.GROUPS.find((x) => x.prefix === 'db/construction-library/');
  assert.ok(g, 'المكتبة في GROUPS');
  assert.equal(g.ttlSec, lib.LIB_TTL_SEC, 'العمر نفسه');
  R.data.clear();
  R.data.set('db/construction-library/legacy.json', { v: '{}', exp: 0 });
  R.data.set('db/construction-library/old.json', { v: '{}', exp: Date.now() + (lib.LIB_TTL_SEC - 10 * 86400) * 1000 });
  R.data.set('db/construction-library/new.json', { v: '{}', exp: Date.now() + (lib.LIB_TTL_SEC - 86400) * 1000 });
  R.data.set('db/users/sara.json', { v: '{}', exp: 0 });
  const out = await mp.purgeOldShares(require(rp('api/_lib/kv.js')), { maxAgeDays: 7 });
  assert.deepEqual([...R.data.keys()].sort(), ['db/construction-library/legacy.json', 'db/construction-library/new.json', 'db/users/sara.json']);
  assert.deepEqual(out.byPrefix['db/construction-library/'], { scanned: 3, deleted: 1 });
});

/* ═════════════════ srv-studios-2-2 ═════════════════ */
test('srv-studios-2-2 ‏/api/construction-library: بلا جلسة 401 بلا أيّ قراءة KV، وبها فهرس صغير لا مسح ولا جلب لكلّ السجلّات، والردّ تحت حدّ الدالّة، وسقف يوميّ', async () => {
  R.data.clear();
  const lib = require(rp('api/_lib/_constructionLibrary.js'));
  for (let i = 0; i < 16; i++) await lib.saveDesign({ buildingType: 'villa', floors: 2, area: 400, lang: 'ar', planImageBase64: 'IMG' + i });
  for (let i = 0; i < 4; i++) await lib.saveDesign({ buildingType: 'mosque', floors: 1, area: 900, lang: 'ar', planImageBase64: 'M' + i });
  for (let i = 0; i < 3; i++) await lib.saveDesign({ buildingType: 'villa', floors: 2, area: 400, lang: 'es', planImageBase64: 'E' + i });
  const handler = require(rp('api/_lib/construction-library.js'));
  const call = async (body) => { const res = resOf(); await handler({ method: 'POST', body, headers: {} }, res); return res; };

  R.log.length = 0;
  let r = await call({ buildingType: 'villa', floors: '2', area: '400', lang: 'ar' });
  assert.equal(r.code, 401, JSON.stringify(r.body));
  assert.deepEqual(r.body, { error: 'auth_required' });
  assert.equal(R.log.length, 0, 'طلب مجهول لا يلمس KV: ' + JSON.stringify(R.log.slice(0, 3)));
  r = await call({ buildingType: 'villa', floors: '2', area: '400', lang: 'ar', token: 'forged.sig' });
  assert.equal(r.code, 401, 'رمز مزوّر');

  R.log.length = 0;
  const tok = tokenFor('sara');
  r = await call({ buildingType: 'villa', floors: '2', area: '400', lang: 'ar', token: tok });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.items.length, 12, 'أحدث ١٢ مطابقًا');
  assert.deepEqual(r.body.items.map((d) => d.planImageBase64), Array.from({ length: 12 }, (_, i) => 'IMG' + (15 - i)), 'الأحدث أوّلًا، لغة الطالب ونوعه وحده');
  assert.ok(!R.log.some((c) => c[0] === 'SCAN'), 'لا SCAN على مساحة المفاتيح');
  const gets = R.log.filter((c) => c[0] === 'GET' && c[1].startsWith('db/construction-library/'));
  assert.equal(gets.length, 12, 'تُجلب سجلّات المختارة وحدها لا الـ٢٣: ' + gets.length);

  // ميزانيّة الردّ: سجلّات كبيرة لا تتجاوز حدّ ردّ الدالّة (٤٫٥ م.ب)
  R.data.clear();
  for (let i = 0; i < 12; i++) await lib.saveDesign({ buildingType: 'villa', floors: 2, area: 400, lang: 'ar', planImageBase64: String(i % 10).repeat(lib.LIB_IMG_MAX - 10) });
  r = await call({ buildingType: 'villa', floors: '2', area: '400', lang: 'ar', token: tok });
  assert.equal(r.code, 200);
  assert.ok(r.body.items.length >= 1, 'شيء يُعرض');
  assert.ok(JSON.stringify(r.body).length < 4.2e6, 'حجم الردّ ' + JSON.stringify(r.body).length);

  // سقف يوميّ لكلّ حساب
  R.data.clear();
  const tok2 = tokenFor('loop-user');
  let last = null;
  for (let i = 0; i < handler.LIB_VIEWS_DAILY; i++) { last = await call({ buildingType: 'villa', token: tok2 }); assert.equal(last.code, 200, 'الطلب ' + (i + 1)); }
  R.log.length = 0;
  last = await call({ buildingType: 'villa', token: tok2 });
  assert.equal(last.code, 429);
  assert.deepEqual(last.body, { error: 'daily_limit_reached' });
  assert.ok(!R.log.some((c) => c[0] === 'GET' || c[0] === 'LRANGE'), 'فوق السقف لا قراءة للمكتبة');
});

test('srv-studios-2-2 الواجهة: زرّ المكتبة يرسل رمز الجلسة، وبلاها يطلب الدخول بلا طلب، والسقف برسالته', async () => {
  const S = read('js/app-13-stocks-init.js');
  const a = S.indexOf('  if(libraryBtn){');
  const b = S.indexOf('\n  const showGenerationFailure', a);
  assert.ok(a > 0 && b > a, 'معالج المكتبة');
  const mk = (token, reply) => {
    const st = { sent: null, status: [] };
    const ctx = {
      lang: 'ar', localStorage: { getItem: () => null },
      authGet: (k) => (k === 'aiapp_auth_token' ? token : null),
      t: (k) => '[' + k + ']',
      setStatus: (s) => st.status.push(s),
      libraryBtn: { disabled: false }, libraryEmptyEl: { style: {} },
      libraryWrap: { style: {}, innerHTML: '', appendChild() {} },
      typeEl: { value: 'villa' }, floorsEl: { value: '2' }, areaEl: { value: '400' },
      document: { createElement: () => ({ style: {} }) }, window: {},
      fetch: async (url, init) => { st.sent = [url, JSON.parse(init.body)]; return reply; },
    };
    vm.runInNewContext(S.slice(a, b), ctx);
    return { ctx, st };
  };
  let m = mk('tok-1', { ok: true, status: 200, json: async () => ({ items: [] }) });
  await m.ctx.libraryBtn.onclick();
  assert.deepEqual(m.st.sent, ['/api/construction-library', { buildingType: 'villa', floors: '2', area: '400', lang: 'ar', token: 'tok-1' }]);
  m = mk(null, { ok: true, status: 200, json: async () => ({ items: [] }) });
  await m.ctx.libraryBtn.onclick();
  assert.equal(m.st.sent, null, 'بلا جلسة لا طلب');
  assert.deepEqual(m.st.status, ['[portraitNeedLogin]']);
  assert.equal(m.ctx.libraryBtn.disabled, false);
  m = mk('tok-1', { ok: false, status: 429, json: async () => ({ error: 'daily_limit_reached' }) });
  await m.ctx.libraryBtn.onclick();
  assert.deepEqual(m.st.status, ['[portraitLimitReached]']);
  assert.equal(m.ctx.libraryEmptyEl.style.display, 'none', 'لا «لا توجد تصاميم» للسقف');
  m = mk('expired', { ok: false, status: 401, json: async () => ({ error: 'auth_required' }) });
  await m.ctx.libraryBtn.onclick();
  assert.deepEqual(m.st.status, ['[portraitNeedLogin]']);
});

/* ═════════════════ srv-studios-2-4 ═════════════════ */
test('srv-studios-2-4 أفاتار متحرّك: إطارات 1K تُصغَّر PNG إلى عرض ٥١٢ قبل الإرسال، والردّ الكبير لا يُحتسب', async () => {
  const handler = require(rp('api/_lib/portrait-style.js'));
  const SRC = pngB64(64, 64, 9);
  const reqs = [];
  net = async (u, init) => {
    if (u.includes('gemini-3-pro-image')) { const b = JSON.parse(init.body); reqs.push(b.generationConfig); return geminiImage(pngB64(1024, 1024, reqs.length)); }
    throw new Error('unexpected ' + u);
  };
  P.consumed.length = 0; P.guard = { ok: true };
  let res = resOf();
  await quiet(() => handler({ method: 'POST', body: { imageBase64: SRC, mimeType: 'image/png', style: 'avatargif', token: 't' } }, res));
  assert.equal(res.code, 200, JSON.stringify(res.body).slice(0, 200));
  assert.equal(reqs.length, 3);
  for (const c of reqs) assert.equal(c.imageConfig.imageSize, '1K', 'الإطار بمقاس 1K لا 2K');
  assert.equal(res.body.frames.length, 3);
  for (const f of res.body.frames) {
    const p = PNG.sync.read(Buffer.from(f, 'base64'));
    assert.equal(p.width, 512, 'إطار PNG بعرض ٥١٢ (العميل يبني GIF بعرض ٤٨٠)');
    assert.equal(p.height, 512);
  }
  assert.ok(JSON.stringify(res.body).length < 4e6);
  assert.deepEqual(P.consumed, ['sara'], 'احتُسب مرّة');

  // ناتج لا يُصغَّر (ليس صورة معروفة) وأكبر من حدّ الردّ: خطأ برمز بلا احتساب
  net = async (u) => (u.includes('gemini-3-pro-image') ? geminiImage('A'.repeat(1600000)) : null);
  P.consumed.length = 0;
  res = resOf();
  await quiet(() => handler({ method: 'POST', body: { imageBase64: SRC, mimeType: 'image/png', style: 'avatargif', token: 't' } }, res));
  assert.equal(res.code, 502);
  assert.deepEqual(res.body, { error: 'image_generation_failed' });
  assert.deepEqual(P.consumed, [], 'لا احتساب لردّ لن يصل');
  net = null;
});

/* ═════════════════ srv-studios-2-5 ═════════════════ */
test('srv-studios-2-5 الخادم: «دمج شخصين» و«ستايل عائلي» بلا صورة إضافيّة = 400 برمز قبل حجز الحصّة وبلا نداء مزوّد', async () => {
  const handler = require(rp('api/_lib/portrait-style.js'));
  let calls = 0;
  net = async () => { calls++; throw new Error('لا نداء'); };
  P.checks = 0; P.consumed.length = 0;
  for (const style of ['merge2', 'familystyle']) {
    for (const extraImages of [undefined, [], [''], [null], 'x']) {
      const res = resOf();
      await quiet(() => handler({ method: 'POST', body: { imageBase64: 'SRC', style, extraImages, token: 't' } }, res));
      assert.equal(res.code, 400, style + ' ' + JSON.stringify(extraImages) + ': ' + JSON.stringify(res.body));
      assert.deepEqual(res.body, { error: 'missing_extra_images' });
    }
  }
  assert.equal(P.checks, 0, 'لا حجز للحصّة');
  assert.equal(calls, 0, 'لا نداء مزوّد');
  assert.deepEqual(P.consumed, []);
  // بصورة إضافيّة: يمضي كما كان والصورتان في النداء
  const SRC = pngB64(48, 64, 1), EXTRA = pngB64(64, 48, 2);
  const proParts = [];
  net = async (u, init) => {
    if (u.includes('gemini-3-pro-image')) { proParts.push(JSON.parse(init.body).contents[0].parts); return geminiImage(pngB64(32, 32, 3)); }
    return new Response('x', { status: 500 }); // كشف الوجوه متعطّل = بلا لقطات (لا يُسقط الطلب)
  };
  const res = resOf();
  await quiet(() => handler({ method: 'POST', body: { imageBase64: SRC, mimeType: 'image/png', style: 'merge2', extraImages: [EXTRA], token: 't' } }, res));
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const imgs = proParts[0].filter((p) => p.inlineData).map((p) => p.inlineData.data);
  assert.ok(imgs.includes(SRC) && imgs.includes(EXTRA), 'الصورتان في النداء');
  assert.deepEqual(P.consumed, ['sara']);
  net = null;
});

/* مقطع الأنماط في app-12: الصور الإضافيّة وزرّ «حوّلها» */
const A12 = read('js/app-12-studios.js');
function portraitCtx(opts) {
  const o = opts || {};
  const a = A12.indexOf('  let extraImagesB64 = [];');
  const end = A12.indexOf('\n/* ---------- 👗 AI Fashion Design');
  const b = A12.lastIndexOf('})();', end);
  assert.ok(a > 0 && b > a, 'مقطع الأنماط');
  const st = { status: [], sent: [], readers: [] };
  const el = (x) => Object.assign({ style: {}, setAttribute() {}, click() {}, appendChild() {}, innerHTML: '' }, x || {});
  const els = { '#portraitMultiFileInput': el({ files: [] }), '#portraitMultiFileBtn': el(), '#portraitMultiPreviewWrap': el() };
  const ctx = {
    console, lang: o.lang || 'ar', localStorage: { getItem: (k) => (k === 'aiapp_lang' ? (o.lang || 'ar') : null) },
    $: (s) => els[s] || null,
    styleEl: { value: o.style || 'merge2' }, selectedBase64: 'SRC', selectedMime: 'image/jpeg',
    setStatus: (s) => st.status.push(s), t: o.t || ((k) => '[' + k + ']'), bT: (ar, en) => (ctx.lang === 'ar' ? ar : en),
    authGet: () => 'tok', btnGenerate: { disabled: false }, resultEl: el(), compareWrap: null, compareBefore: null, downloadEl: el(), shareBtn2: null,
    backdropEl: null, beautifySkinEl: null, beautifyLightEl: null, beautifyTeethEl: null, setComparePct() {},
    document: { createElement: () => el() },
    FileReader: class { readAsDataURL(f) { this.file = f; st.readers.push(this); } },
    /* بعد دمج v-audit-studcli: الصور الإضافيّة تمرّ بـ__compressImg (تصغير + HEIC) — القراءة الجارية = نداء لم يُستدعَ ردّه بعد */
    __compressImg: (file, cb) => { st.readers.push({ file, cb }); },
    __safeJson: async (r) => r.json(),
    __swallow() {},
    fetch: async (url, init) => { st.sent.push(JSON.parse(init.body)); return o.reply ? o.reply() : { ok: true, json: async () => ({ imageBase64: 'OUT', mimeType: 'image/png' }) }; },
  };
  if (o.withErrHelpers) {
    const t2 = read('js/app-02-tts.js');
    const f1 = t2.slice(t2.indexOf('function imgErrFriendly('), t2.indexOf('\n}\n', t2.indexOf('function imgErrFriendly(')) + 3);
    const s = A12.indexOf('function stud2ErrText(');
    assert.ok(s > 0, 'stud2ErrText في app-12');
    const f2 = A12.slice(s, A12.indexOf('\n}\n', s) + 3);
    vm.runInNewContext(f1 + f2 + '\nthis.imgErrFriendly = imgErrFriendly; this.stud2ErrText = stud2ErrText;', ctx);
  }
  vm.runInNewContext(A12.slice(a, b), ctx);
  return { ctx, st, els };
}

test('srv-studios-2-5 الواجهة: «حوّلها» لا يرسل الدمج قبل أن تُقرأ الصورة الإضافيّة، ولا بلاها', async () => {
  const tick = () => new Promise((r) => setImmediate(r));
  let m = portraitCtx({ style: 'merge2' });
  await m.ctx.btnGenerate.onclick();
  assert.equal(m.st.sent.length, 0, 'بلا صورة إضافيّة لا طلب');
  assert.deepEqual(m.st.status, ['[portraitMultiLabelMerge]']);
  // الصورة اختيرت والقراءة لم تكتمل بعد: «حوّلها» ينتظرها (v-audit-studcli) ولا يرسل بصورة واحدة
  m.els['#portraitMultiFileInput'].files = [{ type: 'image/jpeg' }];
  m.els['#portraitMultiFileInput'].onchange();
  assert.equal(m.st.readers.length, 1);
  let p = m.ctx.btnGenerate.onclick();
  await tick();
  assert.equal(m.st.sent.length, 0, 'القراءة جارية — لا طلب بصورة واحدة');
  m.st.readers[0].cb('data:image/jpeg;base64,EXTRA');
  await p;
  assert.equal(m.st.sent.length, 1);
  assert.deepEqual(m.st.sent[0].extraImages, ['EXTRA']);
  // العائلي: ما دامت قراءة واحدة جارية لا طلب، وبعد اكتمالهما تُرسلان بترتيبهما
  m = portraitCtx({ style: 'familystyle' });
  m.els['#portraitMultiFileInput'].files = [{ type: 'image/jpeg' }, { type: 'image/png' }];
  m.els['#portraitMultiFileInput'].onchange();
  m.st.readers[0].cb('data:image/jpeg;base64,F1');
  p = m.ctx.btnGenerate.onclick();
  await tick();
  assert.equal(m.st.sent.length, 0, 'صورة من اثنتين قُرئت');
  m.st.readers[1].cb('data:image/jpeg;base64,F2');
  await p;
  assert.deepEqual(m.st.sent[0].extraImages, ['F1', 'F2']);
  // قراءة فشلت (ردّ فارغ) = بلا صورة إضافيّة: لا طلب، ونصّ خانة الرفع
  m = portraitCtx({ style: 'familystyle' });
  m.els['#portraitMultiFileInput'].files = [{ type: 'image/jpeg' }];
  m.els['#portraitMultiFileInput'].onchange();
  m.st.readers[0].cb('');
  await m.ctx.btnGenerate.onclick();
  assert.equal(m.st.sent.length, 0);
  assert.deepEqual(m.st.status, ['[portraitMultiLabelFamily]']);
  // رمز الخادم نفسه برسالة الواجهة
  m = portraitCtx({ style: 'merge2', reply: () => ({ ok: false, json: async () => ({ error: 'missing_extra_images' }) }) });
  m.els['#portraitMultiFileInput'].files = [{ type: 'image/jpeg' }];
  m.els['#portraitMultiFileInput'].onchange();
  m.st.readers[0].cb('data:image/jpeg;base64,X');
  await m.ctx.btnGenerate.onclick();
  assert.equal(m.st.status[m.st.status.length - 1], '[portraitMultiLabelMerge]');
  // نمط عاديّ لا يتأثّر
  m = portraitCtx({ style: 'anime' });
  await m.ctx.btnGenerate.onclick();
  assert.equal(m.st.sent.length, 1);
});

/* ═════════════════ srv-studios-2-7 ═════════════════ */
test('srv-studios-2-7 «اقترح لي إطلالة» و«اقترح أفكار الديكور»: لغة الردّ للغات الـ١٤ كلّها، والعربيّة للعربيّة وحدها', async () => {
  const WANT = { ar: 'Arabic', en: 'English', fr: 'French', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali', ml: 'Malayalam', fil: 'Filipino', id: 'Indonesian', zh: 'Chinese', ru: 'Russian', tr: 'Turkish', es: 'Spanish' };
  const fx = require(rp('api/_lib/fashion-suggest.js'));
  const ds = require(rp('api/_lib/design-suggest.js'));
  let prompt = '';
  net = async (u, init) => {
    prompt = JSON.parse(init.body).contents[0].parts[0].text;
    return Response.json({ candidates: [{ content: { parts: [{ text: '[]' }] } }] });
  };
  for (const [name, h, base] of [['fashion-suggest', fx, { occasion: 'wedding', season: 'summer', description: 'x' }], ['design-suggest', ds, { imageBase64: 'IMG' }]]) {
    for (const [lg, want] of Object.entries(WANT)) {
      const res = resOf();
      await h({ method: 'POST', body: Object.assign({ lang: lg, token: 't' }, base), headers: {} }, res);
      assert.equal(res.code, 200, name + ' ' + lg);
      const m = prompt.match(/Respond in ([^.]+)\./);
      assert.ok(m, name + ' ' + lg);
      assert.ok(m[1].startsWith(want), name + ' ' + lg + ': «Respond in ' + m[1] + '»');
      if (lg !== 'ar') assert.ok(!/Arabic/.test(m[1]), name + ' ' + lg + ' لا عربيّة');
    }
    // لغة غير معروفة لا تصير عربيّة، والطلب بلا لغة (عميل قديم) عربيّ كما كان
    for (const [lg, want] of [['xx', 'English'], [undefined, 'Arabic']]) {
      const res = resOf();
      await h({ method: 'POST', body: Object.assign({ lang: lg, token: 't' }, base), headers: {} }, res);
      assert.equal(prompt.match(/Respond in ([^.]+)\./)[1], want, name + ' ' + lg);
    }
  }
  net = null;
});

/* ═════════════════ srv-studios-2-8 ═════════════════ */
test('srv-studios-2-8 الخادم: البورتريه والأزياء يردّان رموزًا لا نصوصًا عربيّة ثابتة', async () => {
  for (const f of ['api/_lib/portrait-style.js', 'api/_lib/fashion-create.js']) {
    const src = read(f);
    const bad = src.match(/json\(\{ error: '[^']*[؀-ۿ][^']*'/g) || [];
    assert.deepEqual(bad, [], f + ': نصّ عربيّ ثابت في error');
  }
  const handler = require(rp('api/_lib/portrait-style.js'));
  const run = async (body) => { const res = resOf(); await quiet(() => handler({ method: 'POST', body }, res)); return res; };
  const SRC = pngB64(32, 32, 4);
  // بلا مفتاح
  delete process.env.GEMINI_API_KEY;
  try { const r = await run({ imageBase64: SRC, style: 'anime', token: 't' }); assert.deepEqual([r.code, r.body], [503, { error: 'unavailable' }]); }
  finally { process.env.GEMINI_API_KEY = 'gm-test'; }
  // المزوّد رفض بلا إنقاذ: رمز في error (detail المنقّح باقٍ للتشخيص كما قرّر v-fashion-diag، والواجهة لا تعرضه)
  net = async () => Response.json({ error: { message: 'Your prepayment credits are depleted. https://ai.studio/billing key=SECRET' } }, { status: 402 });
  let r = await run({ imageBase64: SRC, style: 'anime', token: 't' });
  assert.equal(r.body.error, 'unavailable', JSON.stringify(r.body));
  assert.doesNotMatch(JSON.stringify(r.body), /SECRET/, 'المفتاح منقّح');
  net = async () => Response.json({ error: { message: 'Unable to process input image' } }, { status: 400 });
  r = await run({ imageBase64: SRC, style: 'anime', token: 't' });
  assert.equal(r.body.error, 'image_generation_failed', JSON.stringify(r.body));
  // بلا صورة في الردّ
  net = async () => Response.json({ candidates: [{ content: { parts: [{ text: 'no' }] } }] });
  r = await run({ imageBase64: SRC, style: 'anime', token: 't' });
  assert.deepEqual(r.body, { error: 'image_generation_failed' });
  // الحارس رفض: الرمز كما هو (تترجمه الواجهة)
  net = async () => geminiImage(pngB64(32, 32, 5));
  P.guard = { ok: false, reason: 'identity_or_scope_mismatch' };
  r = await run({ imageBase64: SRC, style: 'anime', token: 't' });
  assert.deepEqual([r.code, r.body], [422, { error: 'image_edit_identity_mismatch', retryable: false }]);
  P.guard = { ok: true };
  net = null;
});

test('srv-studios-2-8 الواجهة: رمز الحارس وغيره بنصّ imgErrFriendly لا «❌ خطأ: image_edit_identity_mismatch»، والأردو لا يرى عربيًّا', async () => {
  for (const lg of ['ar', 'en', 'ur']) {
    const m = portraitCtx({ style: 'anime', lang: lg, withErrHelpers: true, reply: () => ({ ok: false, json: async () => ({ error: 'image_edit_identity_mismatch', retryable: false }) }) });
    await m.ctx.btnGenerate.onclick();
    const last = m.st.status[m.st.status.length - 1];
    assert.doesNotMatch(last, /image_edit_identity_mismatch/, lg + ': ' + last);
    assert.equal(last, '⚠️ ' + m.ctx.imgErrFriendly('image_edit_identity_mismatch', lg === 'ar'), lg);
    if (lg === 'ur') assert.doesNotMatch(last, /[؀-ۿ]/, 'الأردو: لا نصّ عربيّ');
  }
  // unavailable = svcPaused بلغة الواجهة
  const m = portraitCtx({ style: 'anime', lang: 'fr', withErrHelpers: true, t: (k) => '[' + k + ']', reply: () => ({ ok: false, json: async () => ({ error: 'unavailable' }) }) });
  await m.ctx.btnGenerate.onclick();
  assert.equal(m.st.status[m.st.status.length - 1], '⚠️ [svcPaused]');
  // رمز لا ترجمة له يبقى كما كان
  assert.equal(m.ctx.stud2ErrText(new Error('weird_code'), '❌ Error: '), '❌ Error: weird_code');
  // مواضع الأزياء الثلاثة (التوليد، التعديل، الاقتراح) تمرّ بالمترجم نفسه
  const fx = A12.slice(A12.indexOf('/* ---------- 👗 AI Fashion Design'), A12.indexOf('/* ---------- 🕌 Religious Insights'));
  const sites = fx.match(/setStatus\(stud2ErrText\(e, bT\('❌ خطأ: ','❌ Error: '\)(?:, '[A-Za-z]+')?\)\);/g) || [];
  assert.equal(sites.length, 3, 'التوليد والتعديل والاقتراح');
  assert.doesNotMatch(fx, /setStatus\(\(bT\('❌ خطأ: ','❌ Error: '\)\) \+ \(e && e\.message/, 'لا عرض خام باقٍ في الأزياء');
});

/* ═════════════════ srv-studios-2-9 ═════════════════ */
test('srv-studios-2-9 صورة الإعلان: الرموز بنصّ للغة غير العربيّة، ولا «unavailable» حرفيًّا في الصفحة', async () => {
  const gate = { allowed: true, limit: 8 };
  stub('api/_lib/_planCap.js', { checkAndConsumePlanCustom: async () => gate });
  stub('api/_lib/points.js', { verifyPointsToken: (t) => (t ? 'sara' : null) });
  stub('api/_lib/adtemplate.js', { TEMPLATE_B64: null, ESTATE_B64: null });
  const ad = require(rp('api/_lib/adimage.js'));
  const run = async (body) => { const res = resOf(); await quiet(() => ad({ method: 'POST', body, headers: {} }, res)); return res; };
  // السقف اليوميّ
  gate.allowed = false;
  let r = await run({ token: 't', lang: 'fr', title: 'X' });
  assert.equal(r.code, 429);
  assert.equal(r.body.error, 'limit');
  assert.equal(r.body.limit, 8);
  assert.ok(r.body.message && !/[؀-ۿ]/.test(r.body.message), 'نصّ غير عربيّ للفرنسيّة: ' + r.body.message);
  r = await run({ token: 't', lang: 'ar', title: 'X' });
  assert.equal(r.body.message, undefined, 'العربيّة: message_ar وحده كما كان');
  assert.match(r.body.message_ar, /حدّ اليوم/);
  gate.allowed = true;
  // بلا مفتاح الصور: unavailable لا «no key»
  r = await run({ token: 't', lang: 'en', title: 'X' });
  assert.equal(r.body.error, 'unavailable', JSON.stringify(r.body));
  assert.ok(r.body.message, 'نصّ');
  // نفاد رصيد المزوّد مع فشل الإنقاذ
  process.env.OPENAI_API_KEY = 'oa-test';
  try {
    net = async (u) => (u.includes('api.openai.com') ? Response.json({ error: { message: 'Billing hard limit has been reached' } }, { status: 402 }) : new Response('x', { status: 500 }));
    r = await run({ token: 't', lang: 'hi', title: 'X' });
    assert.equal(r.code, 503);
    assert.equal(r.body.error, 'unavailable');
    assert.ok(r.body.message && !/[؀-ۿ]/.test(r.body.message), 'الهنديّة: نصّ غير عربيّ');
    assert.match(r.body.message_ar, /متوقّفة مؤقّتًا/);
    // رفض عابر (upstream) واستثناء (proxy): message لغير العربيّة، وmessage_ar كما كان
    net = async (u) => (u.includes('api.openai.com') ? Response.json({ error: { message: 'bad request' } }, { status: 400 }) : new Response('x', { status: 500 }));
    r = await run({ token: 't', lang: 'ur', title: 'X' });
    assert.equal(r.body.error, 'upstream');
    assert.ok(r.body.message && !/[؀-ۿ]/.test(r.body.message), 'الأردو: لا عربيّ');
    assert.match(r.body.message_ar, /حاول مرّة أخرى/);
    net = async () => { throw new Error('socket hang up'); };
    r = await run({ token: 't', lang: 'es', title: 'X' });
    assert.equal(r.body.error, 'proxy');
    assert.ok(r.body.message && !/socket/.test(r.body.message));
  } finally { delete process.env.OPENAI_API_KEY; net = null; }

  // الصفحة: الرموز بمفاتيح قاموسها، وبلاها نصّ الخادم بلغته — لا الرمز الخامّ
  const html = read('ad-studio.html');
  const s = html.indexOf('const GEN_ERR=');
  assert.ok(s > 0, 'خريطة الرموز في ad-studio.html');
  const fn = html.slice(s, html.indexOf('\n', html.indexOf('function genErrMsg(', s)) + 1);
  const page = (AL, dict) => {
    const ADD = dict || {}, ADE = {};
    const ctx = { AL, ADD, ADE, NU: (n) => String(n), T: (k, v) => { let x = ADD[k] !== undefined ? ADD[k] : (ADE[k] !== undefined ? ADE[k] : (k === 'genErrCode' ? 'Error {code}' : k)); if (v) for (const p in v) x = String(x).split('{' + p + '}').join(v[p]); return x; } };
    vm.runInNewContext(fn + '\nthis.genErrMsg = genErrMsg;', ctx);
    return ctx.genErrMsg;
  };
  let g = page('en');
  assert.equal(g({ error: 'unavailable' }, 503), 'Error 503', 'لا «unavailable» حرفيًّا');
  assert.equal(g({ error: 'unavailable', message: 'Paused', message_ar: 'متوقّفة' }, 503), 'Paused');
  g = page('ur');
  assert.equal(g({ error: 'limit', message_ar: 'بلغتَ حدّ اليوم' }, 429), 'Error 429', 'الأردو لا يرى العربيّ');
  g = page('ar');
  assert.equal(g({ error: 'limit', message_ar: 'بلغتَ حدّ اليوم', message: 'x' }, 429), 'بلغتَ حدّ اليوم');
  g = page('tr', { axStud2AdPaused: 'Hizmet geçici olarak kullanılamıyor', axStud2AdLimit: 'Günlük sınır ({n})', axStud2AdFailed: 'Oluşturulamadı' });
  assert.equal(g({ error: 'unavailable', message: 'Paused' }, 503), 'Hizmet geçici olarak kullanılamıyor', 'المفتاح أوّلًا حين يوجد في القاموس');
  assert.equal(g({ error: 'limit', limit: 8, message: 'x' }, 429), 'Günlük sınır (8)');
  assert.equal(g({ error: 'upstream' }, 502), 'Oluşturulamadı');
  assert.equal(g({ error: 'proxy' }, 500), 'Oluşturulamadı');
  assert.match(html, /genOut\.innerHTML='<div class="gwait">⚠️ '\+esc\(genErrMsg\(j,r\.status\)\)\+'<\/div>';/, 'سطر العرض يمرّ بالخريطة');
  assert.doesNotMatch(html, /esc\(j\.message\|\|j\.message_ar\|\|j\.error/, 'لا عرض للرمز الخامّ');
});
