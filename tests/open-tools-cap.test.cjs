// tests/open-tools-cap.test.cjs — v-open-tools-cap (المالك ٨ أكتوبر: «مفتوحة على مفاتيحك بلا حدّ: حوالي ١٠ أدوات… ابدا فيهم كلهم»).
// أربع ثغرات تصرف من مفاتيح المالك بلا سقف:
//   ١) مصنّف البحث (search classify) يعود قبل العدّاد — نداء Groq ثمّ Mistral لكلّ طلب بلا رمز ولا IP.
//   ٢) معرض أفكار الديكور والمقاولات (design-ideas): بلا رمز ولا عدّاد؛ كلّ نصّ جديد يطلق استعلامات Google/Tavily.
//   ٣) معاينة الاستوديو (studio-preview): القائمة البيضاء تُتجاوز بأسماء النموذج الأوّليّ (toString · constructor · __proto__)
//      فكلّ واحد يولّد صورة مدفوعة.
//   ٤) اقتراحات الديكور والأزياء والاستوديو (*-suggest): ترفض غير المسجَّل وحده ولا تعدّ شيئًا — نداء رؤية بلا سقف.
// المعالجات الحقيقيّة و_usage.js وauth.js الحقيقيّان؛ Redis والشبكة وحدهما محاكيان في الذاكرة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'open-tools-cap-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.TAVILY_API_KEY = 'tv-test';
process.env.GROQ_API_KEY = 'gq-test';
process.env.MISTRAL_API_KEY = 'ms-test';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.OPENAI_API_KEY = 'oa-test';
process.env.GOOGLE_SEARCH_API_KEY = 'gs-test';
process.env.GOOGLE_SEARCH_CX = 'cx-test';
delete process.env.COHERE_API_KEY;
delete process.env.PEXELS_API_KEY;
delete process.env.UNSPLASH_ACCESS_KEY;

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
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; }, // v-atomic-quota: takeTally يُرجع زيادة ما تجاوز السقف
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });

/* الشبكة: كلّ نداء خارجيّ يُعدّ بمضيفه، ويُجاب بردّ ناجح واقعيّ الشكل. */
const calls = [];
const jsonRes = (obj) => ({ ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });
global.fetch = async (url, init) => {
  const u = String(url);
  calls.push(u);
  if (/api\.groq\.com|api\.mistral\.ai/.test(u)) return jsonRes({ choices: [{ message: { content: 'YES' } }] });
  if (/googleapis\.com\/customsearch/.test(u)) {
    const q = new URL(u).searchParams.get('q') || '';
    return jsonRes({ items: Array.from({ length: 14 }, (_, i) => ({ link: 'https://img.example/' + encodeURIComponent(q) + '/' + i + '.jpg' })) });
  }
  if (/api\.tavily\.com/.test(u)) return jsonRes({ images: [], results: [] });
  if (/generativelanguage\.googleapis\.com/.test(u)) {
    const txt = /Suggest exactly 3 short, specific/.test(String(init && init.body)) ? '["a","b","c"]' : '[{"title":"t","clothing":"c","description":"d","colors":"x","accessories":"y","matchPercent":90}]';
    return jsonRes({ candidates: [{ content: { parts: [{ text: txt }] } }] });
  }
  if (/api\.openai\.com\/v1\/images/.test(u)) return jsonRes({ data: [{ b64_json: Buffer.from('webp').toString('base64') }] });
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const callsSince = (n) => calls.slice(n);

const auth = require(rp('api/_lib/auth.js'));
const search = require(rp('api/_lib/search.js'));
const ideas = require(rp('api/_lib/design-ideas.js'));
const preview = require(rp('api/_lib/studio-preview.js'));
const designSuggest = require(rp('api/_lib/design-suggest.js'));
const fashionSuggest = require(rp('api/_lib/fashion-suggest.js'));
const studioSuggest = require(rp('api/_lib/studio-suggest.js'));

const call = (handler, { method = 'POST', body, query, ip = '203.0.113.7' } = {}) => new Promise((resolve, reject) => {
  const headers = {};
  const res = {
    code: 200,
    setHeader(k, v) { headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(j) { resolve({ code: this.code, j, headers }); return this; },
    end(b) { resolve({ code: this.code, body: b, headers }); return this; },
  };
  Promise.resolve(handler({ method, body, query: query || {}, headers: { 'x-forwarded-for': ip } }, res)).catch(reject);
});
const today = () => new Date().toISOString().slice(0, 10);
const tally = (id, bucket) => 'db/usage/tally/' + encodeURIComponent(id + '_' + today() + '_' + bucket) + '/' + today();
const IMG = Buffer.from('fake-image').toString('base64');

test('١. مصنّف البحث يُعدّ قبل نداء النموذج: ٢٠٠ يوميًّا لكلّ IP بلا رمز، والـ٢٠١ لا يلمس Groq ولا Mistral', async () => {
  const ip = '198.51.100.21';
  for (let i = 0; i < 200; i++) {
    const n = calls.length;
    const r = await call(search, { body: { query: 'من فاز بالمباراة أمس ' + i, classify: true }, ip });
    assert.equal(r.code, 200, 'الطلب ' + (i + 1));
    assert.equal(r.j.search, true);
    assert.equal(callsSince(n).filter((u) => /groq|mistral/.test(u)).length, 1, 'نداء نموذج واحد للطلب ' + (i + 1));
  }
  const n = calls.length;
  const r = await call(search, { body: { query: 'من فاز بالمباراة أمس', classify: true }, ip });
  assert.equal(callsSince(n).length, 0, 'بعد السقف: لا نداء خارجيّ');
  assert.equal(r.j.search, false, 'الواجهة تكمل بلا بحث كما في أيّ خطأ');
  assert.notEqual(r.code, 200);
  assert.notEqual(r.code, 402, 'ليس جدار باقة (402 يفتح «الباقات» في الواجهة)');
  assert.notEqual(r.code, 403);
  assert.equal(store.get(tally('ip_' + ip, 'search-classify')), '200', 'سلّة منفصلة باسم search-classify على IP');
  assert.equal(store.has(tally('ip_' + ip, 'search')), false, 'لا يأكل من حصّة البحث نفسه');
});

test('٢. مصنّف البحث بالرمز يُعدّ على الحساب في سلّته وحدها، وسؤال «عن التطبيق» المحسوم محلّيًّا لا يُعدّ', async () => {
  const tok = auth.makeToken('sara');
  const n = calls.length;
  const r = await call(search, { body: { query: 'كم سعر الذهب اليوم', classify: true, token: tok } });
  assert.equal(r.code, 200);
  assert.equal(callsSince(n).length, 1);
  assert.equal(store.get(tally('sara', 'search-classify')), '1');
  assert.equal(store.has(tally('sara', 'search')), false, 'لا يأكل من حصّة البحث نفسه');
  const r2 = await call(search, { body: { query: 'من صنعك؟', classify: true, token: tok } });
  assert.equal(r2.j.search, false);
  assert.equal(store.get(tally('sara', 'search-classify')), '1', 'المحسوم بلا نموذج لا يُعدّ');
  const maha = read('js/app-08-maha.js');
  const m = maha.match(/body: JSON\.stringify\(\{ query: text, classify: true[^\n]*/);
  assert.ok(m, 'نداء المصنّف في مها');
  assert.match(m[0], /token: authGet\('aiapp_auth_token'\)/, 'مها ترسل رمز الجلسة فيُعدّ على الحساب لا على IP البيت كلّه');
});

test('٣. معرض الأفكار يشترط الجلسة: بلا رمز ← 401 بلا أيّ نداء خارجيّ (الديكور والمقاولات)', async () => {
  const n = calls.length;
  const a = await call(ideas, { body: { place: 'majlis' } });
  assert.equal(a.code, 401);
  assert.equal(a.j.error, 'auth_required');
  const b = await call(ideas, { body: { mode: 'construction', type: 'villa', view: 'exterior' } });
  assert.equal(b.code, 401);
  const c = await call(ideas, { body: { q: 'مجلس فخم', token: 'forged.token' } });
  assert.equal(c.code, 401, 'رمز مزوّر = بلا جلسة');
  assert.equal(callsSince(n).length, 0);
});

test('٤. معرض الأفكار: ٣٠ طلبًا جديدًا يوميًّا للحساب (ديكور ومقاولات معًا)، والمخبوء لا يُعدّ ويُخدم حتّى بعد السقف', async () => {
  const tok = auth.makeToken('dana');
  for (let i = 0; i < 29; i++) {
    const n = calls.length;
    const r = await call(ideas, { body: { q: 'غرفة رقم ' + i, token: tok } });
    assert.equal(r.code, 200, 'الطلب ' + (i + 1));
    assert.ok(r.j.images.length >= 12);
    assert.ok(callsSince(n).length > 0, 'طلب جديد يجمع من الويب');
  }
  const cx = await call(ideas, { body: { mode: 'construction', type: 'villa', view: 'exterior', q: 'حجر', token: tok } });
  assert.equal(cx.code, 200);
  assert.equal(store.get(tally('dana', 'design-ideas')), '30');

  let n = calls.length;
  const again = await call(ideas, { body: { q: 'غرفة رقم 0', token: tok } });
  assert.equal(again.code, 200, 'المخبوء يُخدم');
  assert.equal(callsSince(n).length, 0, 'المخبوء بلا نداء خارجيّ');
  assert.equal(store.get(tally('dana', 'design-ideas')), '30', 'المخبوء لا يُعدّ');

  n = calls.length;
  const over = await call(ideas, { body: { q: 'غرفة جديدة تمامًا', token: tok } });
  assert.equal(over.code, 429);
  assert.equal(over.j.error, 'daily_limit_reached');
  const overCx = await call(ideas, { body: { mode: 'construction', type: 'mosque', view: 'interior', token: tok } });
  assert.equal(overCx.code, 429, 'المقاولات في السلّة نفسها');
  assert.equal(callsSince(n).length, 0, 'بعد السقف: لا Google ولا Tavily');

  // الحساب الآخر لا يتأثّر، والمالك بلا سقف.
  const other = await call(ideas, { body: { q: 'غرفة جديدة تمامًا', token: auth.makeToken('lina') } });
  assert.equal(other.code, 200);
  const owner = auth.makeToken('omran');
  for (let i = 0; i < 31; i++) {
    const r = await call(ideas, { body: { q: 'مالك ' + i, token: owner } });
    assert.equal(r.code, 200, 'المالك ' + (i + 1));
  }
});

test('٥. واجهتا المعرض ترسلان رمز الجلسة وتقولان رسالة الدخول والحدّ الموجودتين بالـ١٤ لغة', () => {
  const st = read('js/app-12-studios.js');
  const s = st.slice(st.indexOf("fetch('/api/design-ideas'"), st.indexOf("fetch('/api/design-ideas'") + 900);
  assert.match(s.split('\n')[0], /token/, 'الديكور يرسل الرمز');
  assert.match(s, /designAiNeedLogin/);
  assert.match(s, /designAiLimitReached/);
  const cx = read('js/app-15-cx-ideas.js');
  const c = cx.slice(cx.indexOf("fetch('/api/design-ideas'"), cx.indexOf("fetch('/api/design-ideas'") + 900);
  assert.match(c.split('\n')[0], /token/, 'المقاولات ترسل الرمز');
  assert.match(c, /designAiNeedLogin/);
  assert.match(c, /designAiLimitReached/);
  const ar = read('js/app-03-i18n-data.js');
  for (const k of ['designAiNeedLogin', 'designAiLimitReached']) {
    assert.ok((ar.match(new RegExp('\\b' + k + ':', 'g')) || []).length >= 2, k + ' عربيّ وإنجليزيّ');
    for (const f of fs.readdirSync(path.join(root, 'i18n')).filter((x) => /^[a-z]{2,3}\.js$/.test(x))) {
      assert.match(read('i18n/' + f), new RegExp('\\b' + k + '\\b'), k + ' في ' + f);
    }
  }
});

test('٦. معاينة الاستوديو: أسماء النموذج الأوّليّ لا تعبر القائمة البيضاء ولا تولّد صورة', async () => {
  const bad = [
    ['hair', 'toString'], ['hair', 'constructor'], ['hair', '__proto__'], ['hair', 'hasOwnProperty'],
    ['constructor', 'keys'], ['constructor', 'name'], ['__proto__', 'hasOwnProperty'], ['toString', 'name'],
    ['trend', 'toString'], ['trend', 'constructor'], ['henna', 'valueOf'],
  ];
  for (const [feature, value] of bad) {
    const n = calls.length;
    const r = await call(preview, { method: 'GET', query: { feature, value } });
    assert.equal(r.code, 404, feature + '/' + value);
    assert.equal(callsSince(n).length, 0, 'لا توليد: ' + feature + '/' + value);
  }
  // الخيار الحقيقيّ ما زال يولّد (فالرفض أعلاه ليس عطلًا في المحاكاة).
  const n = calls.length;
  const ok = await call(preview, { method: 'GET', query: { feature: 'hair', value: 'black' } });
  assert.equal(ok.code, 200);
  assert.equal(callsSince(n).filter((u) => /api\.openai\.com/.test(u)).length, 1);
  const tab = await call(preview, { method: 'GET', query: { feature: 'henna', value: '__tab' } });
  assert.equal(tab.code, 200, 'صورة التبويب كما كانت');
});

const SUGGEST = [
  ['design-suggest', designSuggest, { imageBase64: IMG, mimeType: 'image/jpeg', lang: 'ar' }],
  ['fashion-suggest', fashionSuggest, { description: 'عباية سوداء', occasion: 'wedding', season: 'summer', lang: 'ar' }],
  ['studio-suggest', studioSuggest, { imageBase64: IMG, mimeType: 'image/jpeg', feature: 'hair', occasion: 'daily', lang: 'ar' }],
];

test('٧. الاقتراحات الثلاثة: ٣٠ يوميًّا لكلّ أداة في سلّتها، والـ٣١ ← 429 بلا نداء رؤية، والأدوات مستقلّة', async () => {
  const tok = auth.makeToken('eve');
  for (const [bucket, handler, body] of SUGGEST) {
    for (let i = 0; i < 30; i++) {
      const n = calls.length;
      const r = await call(handler, { body: Object.assign({ token: tok }, body) });
      assert.equal(r.code, 200, bucket + ' ' + (i + 1));
      assert.ok(Array.isArray(r.j.suggestions) && r.j.suggestions.length > 0, bucket);
      assert.equal(callsSince(n).length, 1, bucket + ': نداء رؤية واحد');
    }
    const n = calls.length;
    const over = await call(handler, { body: Object.assign({ token: tok }, body) });
    assert.equal(over.code, 429, bucket + ' بعد السقف');
    assert.equal(over.j.error, 'daily_limit_reached');
    assert.equal(callsSince(n).length, 0, bucket + ': لا نداء بعد السقف');
    assert.equal(store.get(tally('eve', bucket)), '30');
  }
});

test('٨. الاقتراحات: غير المسجَّل 401 كما كان ولا يُعدّ، والمالك بلا سقف', async () => {
  for (const [bucket, handler, body] of SUGGEST) {
    const n = calls.length;
    const r = await call(handler, { body: Object.assign({}, body) });
    assert.equal(r.code, 401, bucket);
    assert.equal(r.j.error, 'auth_required');
    assert.equal(callsSince(n).length, 0);
  }
  const owner = auth.makeToken('omran');
  for (const [bucket, handler, body] of SUGGEST) {
    for (let i = 0; i < 31; i++) {
      const r = await call(handler, { body: Object.assign({ token: owner }, body) });
      assert.equal(r.code, 200, bucket + ' المالك ' + (i + 1));
    }
  }
});

test('٩. واجهات الاقتراحات تقول رسالة الحدّ الموجودة بدل «تعذّر» العامّة', () => {
  const pick = (src, needle) => { const i = src.indexOf(needle); assert.ok(i > 0, needle); return src.slice(i, i + 900); };
  const st = read('js/app-12-studios.js');
  assert.match(pick(st, "fetch('/api/design-suggest'"), /data\.error === 'daily_limit_reached'\)\{ setStatus\(t\('designAiLimitReached'\)\)/);
  assert.match(pick(st, "fetch('/api/fashion-suggest'"), /data\.error === 'daily_limit_reached'\)\{ setStatus\(t\('fashionAiLimitReached'\)\)/);
  assert.match(pick(read('js/app-13-stocks-init.js'), "fetch('/api/studio-suggest'"), /data\.error === 'daily_limit_reached'\)\{ setStatus\(t\('studioAiLimitReached'\)\)/);
});
