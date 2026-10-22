// tests/provider-fail-rest.test.cjs — v-provider-fail-rest (بقيّة v-provider-fail، تدقيق الإنتاج ١٨–١٩ أكتوبر، والرصيد المدفوع مسبقًا عند المزوّد خلصان).
// العرض: «💡 اقترح لي إطلالة» (fashion-suggest) و«📷 شاهد المبنى من زوايا أخرى» / «🛋️ شاهد الغرف من الداخل» (construction-view) ما زالا
// يمرّران حالة المزوّد ونصّه الإنجليزيّ («Your prepayment credits are depleted… AI Studio» بروابط فوترته) و«Server is missing GEMINI_API_KEY»
// و«Proxy error: …»، والواجهة تعرضها «❌ خطأ: <النصّ>». الإصلاح: مصنّف v-provider-fail نفسه (_videoFail.toolFail) والنصّ التقنيّ للسجلّ،
// والواجهة تعرض svcPaused لـunavailable ونصًّا قائمًا بالـ١٤ لغة لـfailed.
// المعالجات الحقيقيّة؛ Redis والشبكة وحدهما محاكيان في الذاكرة، ومعالجات الواجهة تُشغَّل في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'provider-fail-rest-secret-' + 'x'.repeat(24);
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.OWNER_USERNAMES = 'omran';
delete process.env.OPENAI_API_KEY; // بلا مفتاح إنقاذ: فشل المزوّد الأوّل هو الردّ

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });

// نصّ المزوّد الحقيقيّ كما ظهر في لقطات التدقيق.
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. Learn more at https://ai.google.dev/gemini-api/docs/billing#prepay.';
const LEAK = /AI Studio|ai\.studio|ai\.google|gemini|google|prepay|billing|credits|depleted|https?:|Proxy error|GEMINI_API_KEY|Upstream|الموديل/i;
const resOf = (status, obj) => ({ ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj) });
const depleted = () => resOf(402, { error: { code: 402, message: DEPLETED, status: 'FAILED_PRECONDITION' } });
let geminiReply = depleted;
global.fetch = async (url) => {
  const u = String(url);
  if (/generativelanguage\.googleapis\.com/.test(u)) return geminiReply();
  return resOf(404, {});
};
const errLog = [];
const origErr = console.error;
console.error = (...a) => { errLog.push(a.join(' ')); };
test.after(() => { console.error = origErr; });

const auth = require(rp('api/_lib/auth.js'));
const call = (handler, body) => new Promise((resolve, reject) => {
  const res = {
    code: 200,
    setHeader() {},
    status(c) { this.code = c; return this; },
    json(j) { resolve({ code: this.code, j }); return this; },
    send(b) { let j = null; try { j = JSON.parse(b); } catch (e) { j = { raw: String(b) }; } resolve({ code: this.code, j }); return this; },
    end(b) { let j = null; try { j = JSON.parse(b); } catch (e) { j = { raw: String(b) }; } resolve({ code: this.code, j }); return this; },
  };
  Promise.resolve(handler({ method: 'POST', body, query: {}, headers: { 'x-forwarded-for': '203.0.113.9' } }, res)).catch(reject);
});
const IMG = Buffer.from('fake-image-bytes-'.repeat(12)).toString('base64');
const owner = () => auth.makeToken('omran');
const HANDLERS = () => [
  ['fashion-suggest', require(rp('api/_lib/fashion-suggest.js')), { imageBase64: IMG, mimeType: 'image/jpeg', occasion: 'wedding', season: 'summer', lang: 'ar' }],
  ['construction-view angle', require(rp('api/_lib/construction-view.js')), { mode: 'angle', angle: 'side', buildingType: 'villa', area: 300, floors: 2, style: 'modern' }],
  ['construction-view room', require(rp('api/_lib/construction-view.js')), { mode: 'room', room: 'majlis', color: 'بيج', buildingType: 'villa', area: 300, style: 'gulf' }],
];

test('١. 402 المزوّد (رصيده خلصان): 503 unavailable بلا اسمه ولا روابط فوترته ولا حالته — والنصّ التقنيّ في السجلّ وحده', async () => {
  for (const [name, h, body] of HANDLERS()) {
    errLog.length = 0;
    const r = await call(h, Object.assign({ token: owner() }, body));
    assert.equal(r.code, 503, name + ': الحالة ' + r.code + ' ' + JSON.stringify(r.j));
    assert.deepEqual(r.j, { error: 'unavailable' }, name);
    assert.doesNotMatch(JSON.stringify(r.j), LEAK, name + ': نصّ المزوّد وصل العميل');
    assert.ok(errLog.some((l) => l.includes('402') && l.includes('prepayment credits')), name + ': النصّ التقنيّ يُسجَّل — ' + errLog.join(' | '));
  }
});

test('٢. رفض الطلب نفسه (صورة لا تُقرأ) = failed بـ502، والنصّ الخام لا يصل', async () => {
  geminiReply = () => resOf(400, { error: { code: 400, message: 'Unable to process input image. Please retry or report in https://developers.generativeai.google/guide/troubleshooting', status: 'INVALID_ARGUMENT' } });
  try {
    for (const [name, h, body] of HANDLERS()) {
      const r = await call(h, Object.assign({ token: owner() }, body));
      assert.deepEqual([r.code, r.j], [502, { error: 'failed' }], name + ': ' + JSON.stringify(r.j));
    }
  } finally { geminiReply = depleted; }
});

test('٣. غياب المفتاح والاستثناء والمهلة: unavailable بـ503 — لا «Server is missing GEMINI_API_KEY» ولا «Proxy error: …»', async () => {
  delete process.env.GEMINI_API_KEY;
  try {
    for (const [name, h, body] of HANDLERS()) {
      const r = await call(h, Object.assign({ token: owner() }, body));
      assert.deepEqual([r.code, r.j], [503, { error: 'unavailable' }], name + ' بلا مفتاح: ' + JSON.stringify(r.j));
    }
  } finally { process.env.GEMINI_API_KEY = 'gm-test'; }
  geminiReply = () => { throw new Error('The operation was aborted due to timeout'); };
  try {
    for (const [name, h, body] of HANDLERS()) {
      const r = await call(h, Object.assign({ token: owner() }, body));
      assert.deepEqual([r.code, r.j], [503, { error: 'unavailable' }], name + ' عند المهلة/الانقطاع: ' + JSON.stringify(r.j));
    }
  } finally { geminiReply = depleted; }
  // جسم طلب تالف يرمي داخل المعالج: الاستثناء نفسه لا يصل نصّه
  for (const [name, h] of HANDLERS()) {
    const r = await call(h, '{not json');
    assert.deepEqual([r.code, r.j], [503, { error: 'unavailable' }], name + ' عند الاستثناء: ' + JSON.stringify(r.j));
  }
});

test('٤. زوايا/غرف المقاولات: المزوّد ردّ ٢٠٠ بلا صورة = failed (لا «لم يرجع الموديل صورة» العربيّ وحده)، والنجاح كما كان', async () => {
  const cv = require(rp('api/_lib/construction-view.js'));
  geminiReply = () => resOf(200, { candidates: [{ content: { parts: [{ text: 'I cannot draw that.' }] }, finishReason: 'STOP' }] });
  try {
    const r = await call(cv, { token: owner(), mode: 'angle', angle: 'front', buildingType: 'villa', area: 200 });
    assert.deepEqual([r.code, r.j], [502, { error: 'failed' }]);
    geminiReply = () => resOf(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: IMG } }] } }] });
    const ok = await call(cv, { token: owner(), mode: 'room', room: 'living', buildingType: 'villa', area: 200 });
    assert.equal(ok.code, 200);
    assert.equal(ok.j.imageBase64, IMG);
  } finally { geminiReply = depleted; }
});

/* ── الواجهة: المعالجات الحقيقيّة في vm ── */
test('٥. «💡 اقترح لي إطلالة»: unavailable ← «الخدمة متوقّفة مؤقّتًا»، failed ← رسالة الاقتراح العامّة، لا «❌ خطأ: <رمز>»', async () => {
  const S = read('js/app-12-studios.js');
  const a = S.indexOf('  /* ---- 💡 suggest a look ---- */');
  const b = S.indexOf('\n  /* ---- 📊 compare 2-3 looks ---- */', a);
  assert.ok(a > 0 && b > a, 'معالج اقتراح الإطلالة');
  const run = async (status, error) => {
    const shown = [];
    const ctx = {
      suggestBtn: { disabled: false }, mode: 'image', selectedBase64: 'QUJD', selectedMime: 'image/jpeg', descriptionEl: { value: '' },
      authGet: () => 'tok', suggestionsEl: { style: {}, innerHTML: '', appendChild() {} }, setStatus: (x) => shown.push(x),
      t: (k) => '[' + k + ']', bT: (ar) => ar, occasionEl: { value: 'wedding' }, seasonEl: { value: 'summer' },
      loadProfile: () => ({}), lang7: () => 'ar', currentGender: () => 'women', setMode() {},
      fetch: async () => resOf(status, { error }), __safeJson: async (res) => JSON.parse(await res.text()),
      document: { createElement: () => ({ style: {}, querySelector: () => ({}) }) }, console,
    };
    vm.runInNewContext(S.slice(a, b), ctx);
    await ctx.suggestBtn.onclick();
    return shown[shown.length - 1];
  };
  assert.equal(await run(503, 'unavailable'), '[svcPaused]');
  assert.equal(await run(502, 'failed'), '[designAiSuggestError]');
  assert.equal(await run(429, 'daily_limit_reached'), '[fashionAiLimitReached]', 'الحدّ اليوميّ كما كان');
});

test('٦. زوايا المبنى وغرفه: unavailable ← «الخدمة متوقّفة مؤقّتًا»، failed ← «ما قدرت أسوي الصورة» (١٤ لغة)، لا «❌ خطأ: <رمز>»', async () => {
  const S = read('js/app-13-stocks-init.js');
  const a = S.indexOf('  angleBtns.forEach((btn) => {');
  const r0 = S.indexOf('  roomViewBtn.onclick = async () => {', a);
  const b = S.indexOf('\n})();', r0);
  assert.ok(a > 0 && r0 > a && b > r0, 'معالجا الزوايا والغرف');
  const run = async (which, status, error) => {
    const el = () => ({ style: {}, textContent: '' });
    const btn = { disabled: false, getAttribute: () => 'side' };
    const ctx = {
      angleBtns: [btn], authGet: () => 'tok', angleImageWrap: el(), angleStatusEl: el(), angleImageEl: {}, angleDownloadLink: {},
      roomViewBtn: { disabled: false }, roomImageWrap: el(), roomStatusEl: el(), roomSelectEl: { value: 'majlis' }, roomColorEl: { value: '' },
      roomImageEl: {}, roomDownloadLink: {}, currentParams: () => ({ buildingType: 'villa', area: 300 }), refImage: null, showQuota() {},
      t: (k) => '[' + k + ']', bT: (ar) => ar, fetch: async () => resOf(status, { error }), console,
    };
    vm.runInNewContext(S.slice(a, b), ctx);
    if (which === 'angle') { await btn.onclick(); return ctx.angleStatusEl.textContent; }
    await ctx.roomViewBtn.onclick(); return ctx.roomStatusEl.textContent;
  };
  for (const which of ['angle', 'room']) {
    assert.equal(await run(which, 503, 'unavailable'), '[svcPaused]', which);
    assert.equal(await run(which, 502, 'failed'), '❌ [voiceImageFailed]', which);
    assert.equal(await run(which, 402, 'daily_limit_reached'), '[designAiLimitReached]', which + ': الحدّ اليوميّ كما كان');
  }
  // النصّ المستعمل لـfailed موجود بالـ١٤ لغة
  const core = read('js/app-03-i18n-data.js');
  assert.equal((core.match(/\bvoiceImageFailed\s*:/g) || []).length, 2, 'العربيّة والإنجليزيّة');
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    assert.match(read('i18n/' + lg + '.js'), /["']?\bvoiceImageFailed["']?\s*:/, lg);
  }
});

test('٧. الحزمة مبنيّة من الأجزاء', () => {
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("if(data.error === 'unavailable'){ setStatus(t('svcPaused')); return; } /* v-provider-fail-rest */"), 'app-12 داخل الحزمة');
  assert.ok(bundle.includes("else if(data.error === 'unavailable') angleStatusEl.textContent = t('svcPaused');"), 'app-13 زوايا داخل الحزمة');
  assert.ok(bundle.includes("else if(data.error === 'unavailable') roomStatusEl.textContent = t('svcPaused');"), 'app-13 غرف داخل الحزمة');
});
