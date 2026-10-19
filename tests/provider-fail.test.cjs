// tests/provider-fail.test.cjs — v-provider-fail + v-cx-brief-fail + v-decor-suggest-msg
// (تدقيق الإنتاج ١٨–١٩ أكتوبر، والرصيد المدفوع مسبقًا عند المزوّد خلصان: 402 «Your prepayment credits are depleted… AI Studio»).
// العرض:
//   ١) «نفس المكتوب بس مرتب» و«اقترح لي ستايل» عرضا نصّ المزوّد الإنجليزيّ كما هو باسمه وروابط فوترته — card-extract وstudio-suggest
//      (ومثلهما design-suggest) كانت تمرّر error.message المزوّد وحالته 402.
//   ٢) «صف مشروعك بسطر واحد» قال «ما وضح لي الوصف» لوصف واضح: كلّ فشل للمزوّد صار reason:'unclear'.
//   ٣) «اقترح لي أفكار» في الديكور: الرسالة تحت «صمم الغرفة» خارج الشاشة، و«حاول مرة أخرى» على خدمة واقفة،
//      و«ارفع صورة الغرفة أولًا» لا يُمسح بعد رفعها.
// المعالجات الحقيقيّة؛ Redis والشبكة وحدهما محاكيان في الذاكرة، ودوالّ الواجهة تُشغَّل في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'provider-fail-test-secret-' + 'x'.repeat(24);
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.OWNER_USERNAMES = 'omran';

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

// نصّ المزوّد الحقيقيّ كما ظهر في لقطتي التدقيق ٠٦١ و٠١٩.
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. Learn more at https://ai.google.dev/gemini-api/docs/billing#prepay.';
const LEAK = /AI Studio|ai\.studio|ai\.google|gemini|google|prepay|billing|credits|depleted|https?:/i;
const resOf = (status, obj) => ({ ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj) });
const depleted = () => resOf(402, { error: { code: 402, message: DEPLETED, status: 'FAILED_PRECONDITION' } });
let geminiReply = depleted;
global.fetch = async (url) => {
  const u = String(url);
  if (/generativelanguage\.googleapis\.com/.test(u)) return geminiReply();
  return resOf(404, {});
};

const auth = require(rp('api/_lib/auth.js'));
const call = (handler, body) => new Promise((resolve, reject) => {
  const res = {
    code: 200,
    setHeader() {},
    status(c) { this.code = c; return this; },
    json(j) { resolve({ code: this.code, j }); return this; },
    end(b) { let j = null; try { j = JSON.parse(b); } catch (e) { j = { raw: String(b) }; } resolve({ code: this.code, j }); return this; },
  };
  Promise.resolve(handler({ method: 'POST', body, query: {}, headers: { 'x-forwarded-for': '203.0.113.9' } }, res)).catch(reject);
});
const IMG = Buffer.from('fake-image-bytes-'.repeat(12)).toString('base64');
const owner = () => auth.makeToken('omran');

test('١. toolFail: رصيد/فوترة/مفتاح/صلاحيّة/زحام = unavailable بـ503 (لا 402)، ورفض الطلب نفسه = failed، وبلا نصّ مزوّد', () => {
  const { toolFail } = require(rp('api/_lib/_videoFail.js'));
  assert.equal(typeof toolFail, 'function', 'toolFail غير موجودة في _videoFail.js');
  const cases = [
    [402, DEPLETED, 503, 'unavailable'],
    [429, 'Resource has been exhausted (e.g. check quota). billing', 503, 'unavailable'], // ٤٢٩ زحام وإن ذكر الفوترة
    [500, 'Internal error', 503, 'unavailable'],
    [503, 'The model is overloaded.', 503, 'unavailable'],
    [400, 'API key not valid. Please pass a valid API key.', 503, 'unavailable'],
    [403, 'Permission denied: Consumer has been suspended.', 503, 'unavailable'],
    [404, 'models/gemini-flash-latest is not found for API version v1beta', 503, 'unavailable'],
    [400, 'Unable to process input image. Please retry or report in https://developers.generativeai.google/guide/troubleshooting', 502, 'failed'],
    [400, 'Request contains an invalid argument.', 502, 'failed'],
  ];
  for (const [st, tech, code, err] of cases) {
    const f = toolFail(st, tech);
    assert.equal(f.code, code, st + ' ' + tech);
    assert.deepEqual(f.body, { error: err }, st + ' ' + tech);
    assert.doesNotMatch(JSON.stringify(f.body), LEAK);
  }
});

test('٢. القراءة والاقتراحات على 402 المزوّد: 503 unavailable بلا اسم مزوّد ولا روابط فوترته — لا 402 ولا نصّه', async () => {
  const handlers = [
    ['card-extract', require(rp('api/_lib/card-extract.js')), { imageBase64: IMG, mimeType: 'image/jpeg', hint: 'نفس المكتوب بس مرتب' }],
    ['studio-suggest', require(rp('api/_lib/studio-suggest.js')), { imageBase64: IMG, mimeType: 'image/jpeg', feature: 'hair', occasion: 'evening', lang: 'ar' }],
    ['design-suggest', require(rp('api/_lib/design-suggest.js')), { imageBase64: IMG, mimeType: 'image/jpeg', lang: 'ar' }],
  ];
  for (const [name, h, body] of handlers) {
    const r = await call(h, Object.assign({ token: owner() }, body));
    assert.equal(r.code, 503, name + ': الحالة ' + r.code + ' ' + JSON.stringify(r.j));
    assert.equal(r.j.error, 'unavailable', name);
    assert.doesNotMatch(JSON.stringify(r.j), LEAK, name + ': نصّ المزوّد وصل العميل');
  }
  // رفضٌ للطلب نفسه (صورة لا تُقرأ) = failed، والنصّ الخام لا يصل أيضًا
  geminiReply = () => resOf(400, { error: { code: 400, message: 'Unable to process input image.', status: 'INVALID_ARGUMENT' } });
  try {
    const r = await call(require(rp('api/_lib/card-extract.js')), { token: owner(), imageBase64: IMG, mimeType: 'image/jpeg' });
    assert.equal(r.code, 502);
    assert.equal(r.j.error, 'failed');
    assert.doesNotMatch(JSON.stringify(r.j), /Unable to process/);
  } finally {
    geminiReply = depleted;
  }
  // غياب المفتاح والاستثناء: لا «no key» ولا «Server is missing GEMINI_API_KEY» ولا «Proxy error: …»
  delete process.env.GEMINI_API_KEY;
  try {
    for (const [name, h, body] of handlers) {
      const r = await call(h, Object.assign({ token: owner() }, body));
      assert.deepEqual([r.code, r.j.error], [503, 'unavailable'], name + ' بلا مفتاح: ' + JSON.stringify(r.j));
    }
  } finally {
    process.env.GEMINI_API_KEY = 'gm-test';
  }
  geminiReply = () => { throw new Error('getaddrinfo ENOTFOUND generativelanguage.googleapis.com'); };
  try {
    for (const [name, h, body] of handlers) {
      const r = await call(h, Object.assign({ token: owner() }, body));
      assert.deepEqual([r.code, r.j.error], [503, 'unavailable'], name + ' عند الاستثناء: ' + JSON.stringify(r.j));
    }
  } finally {
    geminiReply = depleted;
  }
});

test('٣. سطر المقاولات: فشل المزوّد = unavailable («تعذّرت القراءة الآن») لا unclear («ما وضح لي الوصف»)، والغامض فعلًا يبقى unclear', async () => {
  const brief = require(rp('api/_lib/construction-brief.js'));
  const text = 'فيلا دور واحد ١٥٠ متر مودرن';
  let r = await call(brief, { token: owner(), text });
  assert.deepEqual([r.code, r.j.fields, r.j.reason], [200, null, 'unavailable'], '402 المزوّد');
  geminiReply = () => { throw new Error('The operation was aborted due to timeout'); };
  r = await call(brief, { token: owner(), text });
  assert.equal(r.j.reason, 'unavailable', 'المهلة/الانقطاع');
  geminiReply = () => resOf(200, { promptFeedback: { blockReason: 'OTHER' } });
  r = await call(brief, { token: owner(), text });
  assert.equal(r.j.reason, 'unavailable', 'ردّ بلا مرشّح');
  geminiReply = () => resOf(200, { candidates: [{ content: { parts: [{ text: '{}' }] } }] });
  r = await call(brief, { token: owner(), text: 'مرحبا كيف الحال' });
  assert.equal(r.j.reason, 'unclear', 'المزوّد أجاب ولم يُفهم شيء = غامض فعلًا');
  geminiReply = () => resOf(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ buildingType: 'villa', floors: 1, area: 150, style: 'modern' }) }] } }] });
  r = await call(brief, { token: owner(), text });
  assert.equal(r.j.fields.area, 150, 'الوصف الواضح يعبّئ المساحة');
  geminiReply = depleted;
  // والواجهة تعرض لغير unclear/auth نصّها القائم «تعذّرت القراءة الآن — عبّي النموذج تحت» (١٤ لغة)
  const cx = read('js/app-15-cx-brief.js');
  assert.match(cx, /\(j && j\.reason === 'unclear'\) \? T\(TX\.unclear\) : \(j && j\.reason === 'auth'\) \? T\(TX\.login\) : T\(TX\.busy\)/);
});

test('٤. «اقترح لي ستايل»: unavailable ← «الخدمة متوقّفة مؤقّتًا» وfailed ← رسالة الاقتراح العامّة، لا «خطأ: <رمز>»', async () => {
  const S = read('js/app-13-stocks-init.js');
  const a = S.indexOf('  if(suggestBtn) suggestBtn.onclick = async () => {');
  const b = S.indexOf('\n  /* ---- 📊 compare 2-3 styles ---- */', a);
  assert.ok(a > 0 && b > a, 'معالج الاقتراح');
  const run = async (error) => {
    const shown = [];
    const ctx = {
      suggestBtn: { disabled: false }, selectedBase64A: 'QUJD', selectedMimeA: 'image/jpeg', authGet: () => 'tok',
      suggestionsEl: { style: {}, innerHTML: '', appendChild() {} }, setStatus: (x) => shown.push(x),
      t: (k) => '[' + k + ']', t2: (k) => '[' + k + ']', feature: 'hair', occasionEl: { value: 'evening' },
      loadProfile: () => ({}), lang7: () => 'ar', studioErrText: (e) => 'RAW:' + (e && e.message),
      fetch: async () => resOf(503, { error }), console,
    };
    vm.runInNewContext(S.slice(a, b), ctx);
    await ctx.suggestBtn.onclick();
    return shown[shown.length - 1];
  };
  assert.equal(await run('unavailable'), '[svcPaused]');
  assert.equal(await run('failed'), '[designAiSuggestError]');
});

test('٥. «اقترح لي أفكار» في الديكور: كلّ رسائله في سطر تحت زرّه لا في #designAiStatus تحت «صمم الغرفة»، و503 ← «متوقّفة مؤقّتًا»، والرفع يمسح «ارفع الصورة أولًا»', async () => {
  const S = read('js/app-12-studios.js');
  const a = S.indexOf('  let suggestStatusEl = null;');
  const b = S.indexOf('\n  /* ---- v-decor-ba:', a);
  assert.ok(a > 0 && b > a, 'سطر حالة الاقتراح تحت زرّه غير موجود');
  const main = [];
  const made = [];
  const ctx = {
    btnSuggest: { disabled: false, insertAdjacentElement(pos, el) { this.pos = pos; this.after = el; } },
    suggestBox: { style: {} }, suggestList: { innerHTML: '' }, selectedBase64: '', selectedMime: 'image/jpeg',
    authGet: () => 'tok', isEn: () => false, localStorage: { getItem: () => 'ar' },
    fetch: async () => resOf(503, { error: 'unavailable' }), __safeJson: async (res) => JSON.parse(await res.text()),
    t: (k) => '[' + k + ']', setStatus: (x) => main.push(x), console,
    document: { createElement: (tag) => { const el = { tag, style: {}, attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; } }; made.push(el); return el; } },
  };
  vm.runInNewContext(S.slice(a, b), ctx);
  await ctx.btnSuggest.onclick(); // بلا صورة
  const line = ctx.btnSuggest.after;
  assert.ok(line, 'سطر يُنشأ بعد الزرّ');
  assert.equal(ctx.btnSuggest.pos, 'afterend');
  assert.equal(line.textContent, '[designAiNeedImage]');
  assert.equal(line.style.display, 'block');
  ctx.selectedBase64 = 'QUJD';
  await ctx.btnSuggest.onclick(); // 503 unavailable
  assert.equal(line.textContent, '[svcPaused]');
  assert.equal(made.length, 1, 'سطر واحد يُعاد استعماله');
  assert.deepEqual(main, [], 'لا شيء في #designAiStatus البعيد');
  ctx.fetch = async () => resOf(502, { error: 'failed' });
  await ctx.btnSuggest.onclick();
  assert.equal(line.textContent, '[designAiSuggestError]');
  // رفع صورة جديدة يمسح «ارفع صورة الغرفة أولًا» من تحت الزرّ (كانت تبقى ظاهرة بعد الرفع)
  assert.match(S, /if\(!file\) return;\n    if\(suggestStatusEl\) suggestStatus\(''\);[^\n]*\n    selectedFile = file;/);
  // الرسائل المثبّتة (open-tools-cap ٩) بنصّها: الاسم setStatus نفسه مظلَّل داخل المعالج
  assert.match(S.slice(a, b), /const setStatus = suggestStatus;/);
});

test('٦. «نفس المكتوب بس مرتب»: unavailable ← نصّ الواجهة لا الرمز، والنصّ الجديد بالـ١٤ لغة بلا اسم مزوّد ولا رمز في أوّله، ووسم اللغات مرفوع', () => {
  const core = read('js/app-09-attach.js');
  const i = core.indexOf("fetch('/api/tools?action=card-extract'");
  assert.ok(i > 0);
  const seg = core.slice(i, i + 1400);
  assert.match(seg, /__ceSpec\.error === 'unavailable' \? t\('svcPaused'\)/, 'card-extract: رمز unavailable يُترجم');
  assert.match(seg, /imgErrFriendly\('image_generation_failed'/, 'card-extract: failed برسالة الصور القائمة');
  const BANNED = /Gemini|Google|جوجل|AI Studio|Veo|Runway|ChatGPT|GPT|OpenAI|Claude|كلود|Groq|DeepSeek/i;
  const valuesOf = (src) => {
    const rx = /["']?svcPaused["']?\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/g;
    const out = []; let m;
    while ((m = rx.exec(src))) out.push(vm.runInNewContext(m[1] + m[2] + m[1]));
    return out;
  };
  const coreVals = valuesOf(read('js/app-03-i18n-data.js'));
  assert.equal(coreVals.length, 2, 'العربيّة والإنجليزيّة');
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const v = valuesOf(read('i18n/' + lg + '.js'));
    assert.equal(v.length, 1, lg);
    coreVals.push(v[0]);
  }
  for (const s of coreVals) {
    assert.ok(s.trim().length > 8, s);
    assert.doesNotMatch(s, BANNED, s);
    assert.doesNotMatch(s, /^\p{Extended_Pictographic}/u, 'بلا رمز في أوّله — سطر «نفس المكتوب بس مرتب» يسبقه ⚠️: ' + s);
  }
  const m = /i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js'));
  assert.ok(m && Number(m[1]) > 760, 'وسم ملفّات اللغات مرفوع عن ٧٦٠ (النسخة المخبّأة بلا svcPaused)');
  // الحزمة مبنيّة من الأجزاء
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("__ceSpec.error === 'unavailable' ? t('svcPaused')"), 'app-09 داخل الحزمة');
  assert.ok(bundle.includes("suggestStatusEl.id = 'designAiSuggestStatus';"), 'app-12 داخل الحزمة');
  assert.ok(bundle.includes("if(data.error === 'unavailable'){ setStatus(t2('svcPaused')); return; }"), 'app-13 داخل الحزمة');
});
