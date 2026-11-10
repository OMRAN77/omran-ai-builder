// tests/audit-fix-prov.test.cjs — v-audit-prov (فحص التطبيق كاملًا، مجموعة «مزوّدو الذكاء»):
//   srv-providers-1: دور الصورة في /api/groq كان يذهب أوّلًا إلى نموذج نصّيّ (qwen/qwen3.8-27b في المرشّحين أصلًا فلا يتقدّمهم)،
//                    ونجاحه أو نجاح موديل يختاره العميل يُحفظ في ذاكرة 'groq' المشتركة فيصير أوّل المجّانيّ ستّ ساعات.
//   srv-providers-3: مصحّح التفريغ الصوتيّ يقبل ردًّا مقطوعًا (finish_reason=length) فيضيع ذيل الإملاء، ويصحّح كلام أيّ لغة بتعليمة خليجيّة.
//   srv-providers-4: ترجمة عناوين «استكشف» تعرف ٧ لغات من ١٤، والسبع الأخرى تُترجم إلى الإنجليزيّة وتُحفظ كذلك.
//   srv-providers-5: أخطاء الروابط المباشرة (/api/gemini · groq · mistral …) تحمل اسم المزوّد والموديل، والعميل يعرضها.
// المعالجات الحقيقيّة؛ الشبكة والعدّاد وحدهما محاكيان، ودالّة العميل تُشغَّل في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

Object.assign(process.env, {
  AUTH_SECRET: 'audit-fix-prov-secret-' + 'x'.repeat(24),
  GROQ_API_KEY: 'test-groq', GEMINI_API_KEY: 'test-gemini', MISTRAL_API_KEY: 'test-mistral', COHERE_API_KEY: 'test-cohere',
  DEEPSEEK_API_KEY: 'test-deepseek', PERPLEXITY_API_KEY: 'test-pplx', OPENROUTER_API_KEY: 'test-or', OPENAI_API_KEY: 'test-oa',
  ANTHROPIC_API_KEY: 'test-anthropic',
});
delete process.env.FREE_GROQ_MODEL;

const WHO = {
  free: { allowed: true, username: 'fay', tier: 'free', subscriber: false, plan: null },
  max: { allowed: true, username: 'max1', tier: 'sub', subscriber: true, plan: 'max' },
  vip: { allowed: true, username: 'vee', tier: 'vip', subscriber: true },
  owner: { allowed: true, username: 'omran', tier: 'owner', subscriber: true },
};
const counts = {};
mock('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '1.2.3.4',
  checkAndConsume: async (token) => WHO[token] || WHO.free,
  checkAndConsumeCustom: async () => ({ allowed: true, username: null, remaining: 99 }),
  todayCount: async (u, b) => counts[u + ':' + b] || 0,
  bumpCount: async () => {},
  takeMeter: async () => true,
  giveMeter: async () => {},
});
mock('api/_lib/kv.js', new Proxy({ kvPipeline: async (c) => c.map(() => null) }, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

function fakeRes() {
  const r = { code: 200, body: '', headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.send = (b) => { r.body = String(b); return r; };
  r.json = (o) => { r.body = JSON.stringify(o); return r; };
  r.write = () => true;
  r.flushHeaders = () => {};
  r.end = () => r;
  return r;
}
const mkResp = (status, text) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), text: async () => text, json: async () => JSON.parse(text), body: null });

async function callHandler(file, body, fetchImpl) {
  const realFetch = global.fetch;
  const realErr = console.error;
  global.fetch = fetchImpl;
  console.error = () => {};
  try {
    const h = require(rp('api/_lib/' + file));
    const res = fakeRes();
    await h({ method: 'POST', headers: {}, body }, res);
    return res;
  } finally {
    global.fetch = realFetch;
    console.error = realErr;
  }
}

// ─── srv-providers-1 ─────────────────────────────────────────────────────────────
const QWEN = 'qwen/qwen3.8-27b'; // GROQ_VISION_MODEL في app-06 — وهو في مرشّحي tier.js أصلًا
const MUST_STRING = '{"error":{"message":"messages[1].content must be a string","type":"invalid_request_error"}}';
const IMG_TURN = [
  { role: 'system', content: 'نظام' },
  { role: 'user', content: [{ type: 'text', text: 'شوف الصورة' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
];
const fc = () => require(rp('api/_lib/free-chain.js'));
function groqFetch(calls, opts) {
  const o = opts || {};
  return async (url, init) => {
    const u = String(url);
    if (/\/models$/.test(u)) { calls.push('/models'); return { ok: true, status: 200, json: async () => ({ data: [{ id: 'openai/gpt-oss-120b' }] }), text: async () => '' }; }
    const b = JSON.parse(init.body);
    calls.push(b.model);
    if (o.qwenStatus && b.model === QWEN) return mkResp(o.qwenStatus, o.qwenText || '');
    const vision = b.model === QWEN || b.model === 'meta-llama/llama-4-scout-17b-16e-instruct';
    if (b.messages.some((m) => Array.isArray(m.content)) && !vision) return mkResp(400, MUST_STRING);
    return mkResp(200, '{"choices":[{"message":{"content":"تمام"}}]}');
  };
}

test('srv-providers-1 أ: دور الصورة بالمعرّف الحيّ qwen/qwen3.8-27b يذهب إلى نموذج الرؤية وحده، ولا يُحفظ في ذاكرة المجّانيّ', async () => {
  fc().__workingModel.clear();
  const calls = [];
  const res = await callHandler('groq.js', { model: QWEN, messages: IMG_TURN, token: 'free', guestId: 'g' }, groqFetch(calls));
  assert.equal(res.code, 200, res.body);
  assert.deepEqual(calls, [QWEN], 'لا نموذج نصّيّ يستلم الصورة');
  assert.equal(fc().__workingModel.get('groq'), undefined, 'نجاح الرؤية لا يغيّر أوّل المجّانيّ');
  const calls2 = [];
  await callHandler('groq.js', { model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'هلا' }], token: 'free', guestId: 'g' }, groqFetch(calls2));
  assert.equal(calls2[0], 'openai/gpt-oss-20b', 'الدور النصّيّ بعده يبدأ بـ20b (قرار المالك)');
});

test('srv-providers-1 ب: نموذج الرؤية غائب (404) — يُعاد خطؤه بلا نماذج نصّيّة ولا استكشاف، فيهبط العميل إلى «الوصف ثمّ النصّ»', async () => {
  fc().__workingModel.clear();
  const calls = [];
  const gone = '{"error":{"message":"The model `' + QWEN + '` does not exist","code":"model_not_found"}}';
  const res = await callHandler('groq.js', { model: QWEN, messages: IMG_TURN, token: 'free', guestId: 'g' }, groqFetch(calls, { qwenStatus: 404, qwenText: gone }));
  assert.deepEqual(calls, [QWEN]);
  assert.equal(res.code, 404);
  assert.equal(fc().__workingModel.get('groq'), undefined);
});

test('srv-providers-1 ب٢: دور صورة بموديل لا يسمح به الحارس — لا نموذج نصّيّ يستلم الصورة، وخطأ نموذج (404) يهبط به العميل إلى «الوصف ثمّ النصّ»', async () => {
  fc().__workingModel.clear();
  const calls = [];
  const res = await callHandler('groq.js', { model: 'some/unknown-vision', messages: IMG_TURN, token: 'free', guestId: 'g' }, groqFetch(calls));
  assert.deepEqual(calls, [], 'لا gpt-oss بصورة');
  assert.equal(res.code, 404);
  assert.deepEqual(JSON.parse(res.body), { error: 'provider_failed', code: 'model_not_found' });
  assert.equal(fc().__workingModel.get('groq'), undefined);
});

test('srv-providers-1 ج: موديل يختاره العميل خارج المرشّحين (kimi-k2) ينجح ولا يصير أوّل المجّانيّ للجميع', async () => {
  fc().__workingModel.clear();
  const calls = [];
  const res = await callHandler('groq.js', { model: 'moonshotai/kimi-k2-instruct', messages: [{ role: 'user', content: 'هلا' }], token: 'free', guestId: 'g' }, groqFetch(calls));
  assert.equal(res.code, 200);
  assert.equal(calls[0], 'moonshotai/kimi-k2-instruct', 'اختيار العميل يُجرَّب أوّلًا كما كان');
  assert.equal(fc().__workingModel.get('groq'), undefined, 'لا يُحفظ في ذاكرة السلسلة المشتركة');
  const calls2 = [];
  await callHandler('groq.js', { messages: [{ role: 'user', content: 'هلا' }], token: 'free', guestId: 'g2' }, groqFetch(calls2));
  assert.equal(calls2[0], 'openai/gpt-oss-20b');
});

test('srv-providers-1 د: نجاح مرشّح السلسلة نفسها (20b فشل نموذجًا ← 120b) ما زال يُحفظ كما كان', async () => {
  fc().__workingModel.clear();
  const calls = [];
  const f = groqFetch(calls);
  const res = await callHandler('groq.js', { messages: [{ role: 'user', content: 'هلا' }], token: 'free', guestId: 'g' }, async (url, init) => {
    if (!/\/models$/.test(String(url)) && JSON.parse(init.body).model === 'openai/gpt-oss-20b') { calls.push('openai/gpt-oss-20b'); return mkResp(404, '{"error":{"message":"model does not exist"}}'); }
    return f(url, init);
  });
  assert.equal(res.code, 200);
  assert.deepEqual(calls, ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);
  assert.equal(fc().__workingModel.get('groq').model, 'openai/gpt-oss-120b');
  fc().__workingModel.clear();
});

// ─── srv-providers-3 ─────────────────────────────────────────────────────────────
const LONG_AR = Array.from({ length: 50 }, (_, i) => 'أبغي أروح السوق بكرة الصبح عشان أشتري خضار وفواكه رقم ' + (i + 1) + '،').join(' ');
async function runStt(whisper, fix, extraBody) {
  const chat = [];
  const realFetch = global.fetch;
  const realErr = console.error;
  console.error = () => {};
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/audio\/transcriptions/.test(u)) return mkResp(200, JSON.stringify(whisper));
    chat.push(JSON.parse(init.body));
    return mkResp(200, JSON.stringify(fix(JSON.parse(init.body))));
  };
  try {
    delete require.cache[rp('api/_lib/stt.js')];
    const h = require(rp('api/_lib/stt.js'));
    const res = fakeRes();
    await h({ method: 'POST', headers: {}, body: Object.assign({ audioBase64: 'YQ==', mimeType: 'audio/webm' }, extraBody || {}) }, res);
    return { out: JSON.parse(res.body), chat };
  } finally {
    global.fetch = realFetch;
    console.error = realErr;
  }
}
const seg = [{ no_speech_prob: 0.01, avg_logprob: -0.1 }];

test('srv-providers-3 أ: ردّ تصحيح مقطوع (finish_reason=length) لا يُقبل — الإملاء الطويل يرجع كاملًا', async () => {
  fc().__workingModel.clear();
  assert.ok(LONG_AR.length > 2500, 'إملاء دقيقتين تقريبًا');
  const { out, chat } = await runStt({ text: LONG_AR, language: 'ar', segments: seg },
    () => ({ choices: [{ message: { content: LONG_AR.slice(0, Math.round(LONG_AR.length * 0.45)) }, finish_reason: 'length' }] }));
  assert.equal(chat.length, 1, 'المصحّح نودي');
  assert.equal(out.text, LONG_AR, 'لا يضيع ذيل النصّ');
  assert.ok(chat[0].max_tokens > 1024, 'السقف يتّسع للنصّ الطويل (والتفكير يُحسب منه)');
});

test('srv-providers-3 ب: كلام بغير العربيّة لا يمرّ بالمصحّح الخليجيّ (لا ترجمة ولا جواب بدل النصّ)', async () => {
  fc().__workingModel.clear();
  const EN = 'I want to go to the market tomorrow morning to buy some vegetables and fruit for the family.';
  for (const lang of ['en', 'english', 'English']) {
    const { out, chat } = await runStt({ text: EN, language: lang, segments: seg },
      () => ({ choices: [{ message: { content: 'أبغي أروح السوق بكرة الصبح أشتري خضار وفواكه للعائلة.' }, finish_reason: 'stop' }] }));
    assert.equal(chat.length, 0, 'لا نداء تصحيح للغة ' + lang);
    assert.equal(out.text, EN);
  }
});

test('srv-providers-3 ج: العربيّة بردّ مكتمل (stop) تُصحَّح كما كانت', async () => {
  fc().__workingModel.clear();
  for (const lang of ['ar', 'arabic', 'Arabic']) {
    const { out, chat } = await runStt({ text: 'وين همارة دبي اقدد', language: lang, segments: seg },
      () => ({ choices: [{ message: { content: 'وين إمارة دبي أقصد' }, finish_reason: 'stop' }] }));
    assert.equal(chat.length, 1);
    assert.equal(out.text, 'وين إمارة دبي أقصد', lang);
  }
});

// ─── srv-providers-4 ─────────────────────────────────────────────────────────────
const EXPLORE_LANGS = (() => {
  const src = read('explore.html');
  const block = src.slice(src.indexOf('const EXPLORE_STR = {'), src.indexOf('};', src.indexOf('const EXPLORE_STR = {')));
  return [...block.matchAll(/^\s*([a-z]{2,3}):\s*\{/gm)].map((m) => m[1]);
})();
const LANG_EN = { ar: 'Arabic', en: 'English', fr: 'French', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali', es: 'Spanish', tr: 'Turkish', ru: 'Russian', zh: 'Chinese', id: 'Indonesian', fil: 'Filipino', ml: 'Malayalam' };
async function runTranslate(targetLang) {
  const sent = [];
  const res = await callHandler('translate.js', { texts: ['My Game', 'Todo App'], targetLang }, async (url, init) => {
    const b = JSON.parse(init.body);
    sent.push(b.messages[0].content);
    return mkResp(200, JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translations: ['X1', 'X2'] }) } }] }));
  });
  return { out: JSON.parse(res.body), sent };
}

test('srv-providers-4 أ: كلّ لغات صفحة «استكشف» الأربع عشرة تُترجم إلى لغتها لا إلى الإنجليزيّة', async () => {
  assert.equal(EXPLORE_LANGS.length, 14, 'EXPLORE_STR بالـ١٤ لغة: ' + EXPLORE_LANGS.join(','));
  for (const lg of EXPLORE_LANGS) {
    const { sent } = await runTranslate(lg);
    assert.equal(sent.length, 1, lg);
    assert.match(sent[0], new RegExp('into ' + LANG_EN[lg]), lg + ' → ' + LANG_EN[lg]);
    if (lg !== 'en') assert.doesNotMatch(sent[0], /into English\b/, lg + ' لا يُترجم إلى الإنجليزيّة');
  }
});

test('srv-providers-4 ب: لغة غير معروفة تُعاد عناوينها كما هي بلا نداء ترجمة (لا إنجليزيّة تُحفظ تحت id_lang)', async () => {
  const { out, sent } = await runTranslate('de');
  assert.equal(sent.length, 0);
  assert.deepEqual(out.translations, ['My Game', 'Todo App']);
});

// ─── srv-providers-5 ─────────────────────────────────────────────────────────────
const LEAK = /gemini|groq|mistral|cohere|deepseek|perplexity|openrouter|openai|anthropic|claude|gpt|llama|qwen|sonar|google|project/i;
const BAD_ARG = JSON.stringify({ error: { code: 400, message: 'Request contains an invalid argument. Gemini project 1234567890 / openai/gpt-oss-20b / claude-sonnet-5', status: 'INVALID_ARGUMENT' } });
const ROUTES = [
  ['gemini.js', { contents: [{ role: 'user', parts: [{ text: 'هلا' }] }] }],
  ['groq.js', {}], ['mistral.js', {}], ['cohere.js', {}], ['deepseek.js', {}], ['perplexity.js', {}], ['openrouter.js', {}], ['openai.js', {}],
  ['claude.js', {}],
];
const baseBody = (extra, token) => Object.assign({ messages: [{ role: 'user', content: 'هلا' }], token, guestId: 'g' }, extra);
const failFetch = (status, text) => async (url) => (/\/models(\?|$)/.test(String(url)) ? mkResp(200, '{"data":[]}') : mkResp(status, text));

test('srv-providers-5 أ: خطأ المزوّد لغير المالك رمز ثابت بلا اسم مزوّد ولا موديل — في الروابط التسعة، بثًّا وبلا بثّ', async () => {
  for (const [file, extra] of ROUTES) {
    for (const stream of [false, true]) {
      for (const who of ['free', 'vip', 'max']) {
        if (who === 'max' && file !== 'claude.js') continue;
        if (who === 'free' && file === 'claude.js') continue; // المجّانيّ بلا كلود (402 الباقة قبل المزوّد)
        const res = await callHandler(file, baseBody(Object.assign({ stream }, extra), who), failFetch(400, BAD_ARG));
        assert.equal(res.code, 400, file + ' الحالة نفسها (الاحتياط في العميل يقرّر بها)');
        assert.doesNotMatch(res.body, LEAK, file + '/' + who + ' stream=' + stream + ': ' + res.body);
        const j = JSON.parse(res.body);
        assert.equal(j.error, 'provider_failed', file);
        assert.equal(j.code, 'upstream_error', file);
      }
    }
  }
});

test('srv-providers-5 ب: المالك يرى نصّ المزوّد كما هو للتشخيص', async () => {
  for (const [file, extra] of ROUTES) {
    const res = await callHandler(file, baseBody(extra, 'owner'), failFetch(400, BAD_ARG));
    assert.equal(res.code, 400, file);
    assert.match(res.body, /invalid argument/, file);
  }
});

test('srv-providers-5 ج: خطأ النموذج = model_not_found (يهبط به دور صورة Groq)، ورصيد مزوّدنا/مفتاحه = 503 unavailable لا 402 «حدّك اليوميّ»', async () => {
  const gone = JSON.stringify({ error: { message: 'The model `openai/gpt-oss-20b` does not exist', code: 'model_not_found' } });
  let res = await callHandler('mistral.js', baseBody({}, 'free'), failFetch(404, gone));
  assert.equal(res.code, 404);
  assert.deepEqual(JSON.parse(res.body), { error: 'provider_failed', code: 'model_not_found' });
  res = await callHandler('groq.js', baseBody({ model: QWEN, messages: IMG_TURN }, 'free'), failFetch(404, gone));
  assert.equal(res.code, 404);
  assert.deepEqual(JSON.parse(res.body), { error: 'provider_failed', code: 'model_not_found' });
  const depleted = JSON.stringify({ error: { code: 402, message: 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects' } });
  for (const st of [401, 402, 403]) {
    res = await callHandler('openrouter.js', baseBody({}, 'free'), failFetch(st, depleted));
    assert.equal(res.code, 503, 'حالة ' + st);
    assert.deepEqual(JSON.parse(res.body), { error: 'provider_failed', code: 'unavailable' });
  }
  res = await callHandler('perplexity.js', baseBody({}, 'free'), failFetch(429, '{"error":{"message":"Rate limit reached for model sonar"}}'));
  assert.equal(res.code, 429, '429 كما هو — العميل يحوّل ويقول «انتهت مؤقتًا»');
  assert.doesNotMatch(res.body, LEAK);
});

function loadThrowProviderError() {
  const src = read('js/app-06-checkout.js');
  const start = src.indexOf('function throwProviderError(status, errText){');
  const end = src.indexOf('function toOpenAIVisionMessages(messages){');
  assert.ok(start > 0 && end > start, 'throwProviderError في app-06');
  const T = { providerError: 'Error from AI provider: ', dailyLimitError: 'DAILY', quotaError: 'QUOTA', authError: 'AUTH', plansWhyLimit: 'PLAN' };
  const ctx = { t: (k) => T[k] || k, __swallow: () => {}, JSON, String, Object, Error, Number };
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end) + '\nthis.throwProviderError = throwProviderError;', ctx);
  return (status, text) => { try { ctx.throwProviderError(status, text); } catch (e) { return e; } throw new Error('لم يرمِ'); };
}

test('srv-providers-5 د: العميل يترجم الرمز الثابت (providerError) ولا يعرض JSON الخادم في الفقاعة ولا في سطر الحالة', () => {
  const tpe = loadThrowProviderError();
  let e = tpe(400, '{"error":"provider_failed","code":"upstream_error"}');
  assert.equal(e.message, 'Error from AI provider: 400');
  assert.equal(e.status, 400);
  assert.equal(e.upstreamText, '', 'سطر الحالة «HTTP 400» وحده');
  e = tpe(503, '{"error":"provider_failed","code":"unavailable"}');
  assert.equal(e.message, 'Error from AI provider: 503');
  e = tpe(429, '{"error":"provider_failed","code":"upstream_error"}');
  assert.equal(e.message, 'QUOTA');
  assert.equal(e.upstreamText, '');
  e = tpe(404, '{"error":"provider_failed","code":"model_not_found"}');
  assert.equal(e.upstreamText, 'model_not_found', 'callGroq يهبط به إلى «الوصف ثمّ النصّ»');
  const fn = read('js/app-06-checkout.js');
  const re = eval(fn.match(/const __modelErr = !!\(e && \(e\.status === 404 \|\| (\/[^\n]+\/i)\.test\(__t\)\)\);/)[1]); // eslint-disable-line no-eval
  assert.ok(re.test(e.upstreamText));
  // نصّ المالك الخامّ كما كان (للتشخيص)
  e = tpe(400, '{"error":{"message":"Request contains an invalid argument."}}');
  assert.match(e.message, /invalid argument/);
  assert.match(e.upstreamText, /invalid argument/);
});
