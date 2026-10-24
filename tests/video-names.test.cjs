// tests/video-names.test.cjs — v-video-names (المالك ١٦ أكتوبر: «أصلحها الثلاث في طلب سحب واحد»).
// العرض: نافذة تأكيد الخصم تقول «هذه العملية تخصم 55 نقطة (فيديو Runway)» و«(فيديو Veo 3)»، وأخطاء الفيديو المدفوع تصل
// المستخدم خامًا: «Server is missing RUNWAY_API_KEY»، «Veo error: models/veo-3.1-…»، «Runway error: {…}»، «Proxy error: …»،
// وذيل المزوّد بين قوسين بعد الرسالة العربيّة («… (gemini-omni-1.1-flash is not found)»، «(MiniMax-Hailuo-02 …)») —
// يخالف قاعدة المالك «لا اسم مزوّد أو نموذج في نصّ يراه المستخدم». القرار: أسماء وظيفيّة في التأكيد، ورسائل عربيّة قائمة
// في الأخطاء، والتفصيل التقنيّ إلى console.error وحده. المعالجون الحقيقيّون بتبعيّات مزيّفة وfetch مزيّف — بلا شبكة.
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
/* v-video-subs: بوّابة «الفيديو للمشتركين» تُختبر وحدها في video-subs.test.cjs — مستخدمو هذا الاختبار يمرّون بها كما قبلها */
{ const __vs = require('path').join(__dirname, '..', 'api', '_lib', '_videoSubs.js'); require.cache[__vs] = { id: __vs, filename: __vs, loaded: true, exports: { CODE: 'video_subscribers', videoAllowed: async () => true, denyFree: async () => false } }; }
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, 'api/_lib', f));

// أسماء المزوّدين ونماذجهم وأسماء مفاتيحهم، والنصّ التقنيّ الخام — لا شيء منها في ما يراه المستخدم
const BANNED = /Runway|runwayml|Veo|Gemini|Google|googleapis|Omni|MiniMax|Hailuo|Kling|Sora|GPT|OpenAI|Nano\s?Banana|Flux|Topaz|Magnific|Replicate|Azure|fal\.run|fal-ai|bytedance|gen4|veo-?3|seedance|_API_KEY|FAL_KEY|Proxy error/i;

const realPoints = require(rp('points.js'));
const log = { refunds: [], unlocks: [], errors: [] };
const state = { key: true };
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('points.js', Object.assign({}, realPoints, {
  isOwnerUsername: () => false,
  verifyPointsToken: () => 'sara',
  spendPoints: async () => ({ ok: true, owner: false }),
  refundPoints: async (u, n) => { log.refunds.push([u, n]); },
}));
stub('_videoUsage.js', {
  checkVideoQuota: async () => ({ allowed: true, username: 'sara' }),
  consumeVideo: async () => 1,
  checkOwnerBypass: async () => ({ allowed: false, reason: 'not_owner' }),
  isOwner: () => false,
});
stub('abuse-guard.js', { videoLock: async () => ({ ok: true }), releaseVideoLock: async (u) => { log.unlocks.push(u); } });
stub('video-job.js', { rememberVideoJob: async () => true, settleVideoJob: async () => null });
stub('_qualityGate.js', { gateQuality: async (u, q) => q, allowHigh: async () => true });
stub('_planVideos.js', { planVideoLeft: async () => 0 });
stub('kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => true, kvSetRaw: async () => true, kvGetRaw: async () => null });
stub('our-media.js', { rememberOurMedia: async () => {} });
stub('runway-keys.js', {
  pickKey: () => (state.key ? { key: 'k', index: 0 } : null),
  resolveTaskId: () => (state.key ? { key: 'k', rawId: 'raw' } : { key: null }),
  encodeTaskId: (i, id) => i + ':' + id,
  clearStuckTask: async () => {}, saveLastTask: async () => {},
  RUNWAY_API_BASE: 'https://api.dev.runwayml.com',
});

function resObj() {
  return { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
}
const shown = (b) => (b ? [b.message_ar, b.label, b.error, b.failure].filter((x) => typeof x === 'string') : []);
const KEYS = ['GEMINI_API_KEY', 'MINIMAX_API_KEY', 'FAL_KEY', 'OPENAI_API_KEY'];

async function call(file, req, fetchImpl, opt) {
  const o = opt || {};
  state.key = o.key !== false;
  const saved = {}; for (const k of KEYS) { saved[k] = process.env[k]; if (state.key) process.env[k] = 'test-key'; else delete process.env[k]; }
  delete require.cache[rp(file)];
  const h = require(rp(file));
  const realFetch = global.fetch, realErr = console.error, realWarn = console.warn, realLog = console.log;
  global.fetch = fetchImpl || (async () => { throw new Error('unexpected network call'); });
  log.refunds.length = 0; log.unlocks.length = 0; log.errors.length = 0;
  console.error = (...a) => { log.errors.push(a.map(String).join(' ')); }; console.warn = () => {}; console.log = () => {};
  const res = resObj();
  try { await h(req, res); } finally {
    global.fetch = realFetch; console.error = realErr; console.warn = realWarn; console.log = realLog;
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
  return { code: res.code, body: res.body, texts: shown(res.body), errors: log.errors.slice() };
}
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const offline = async () => { throw new Error('getaddrinfo ENOTFOUND api.dev.runwayml.com'); };
const POST = (body) => ({ method: 'POST', body: Object.assign({ promptText: 'قطة تلعب', token: 't' }, body || {}) });
const GET = (query) => ({ method: 'GET', query });
const clean = (r, what) => { assert.ok(r.texts.length, what + ': لا نصّ للمستخدم'); for (const s of r.texts) assert.doesNotMatch(s, BANNED, what + ': ' + s); };

test('١. كلّ تسمية تأكيد خصم في الخادم اسم وظيفيّ لا اسم مزوّد (فحص ثابت لكلّ مستدعٍ)', () => {
  const files = fs.readdirSync(path.join(root, 'api/_lib')).filter((f) => f.endsWith('.js')).map((f) => 'api/_lib/' + f)
    .concat(fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).map((f) => 'api/' + f));
  const labels = [];
  for (const f of files) {
    const src = read(f);
    const rx = /requireConfirmation\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g; let m;
    while ((m = rx.exec(src))) {
      if (/function requireConfirmation/.test(src.slice(Math.max(0, m.index - 9), m.index + 20))) continue; // التعريف نفسه
      const lab = m[1].match(/,\s*(['"])((?:\\.|(?!\1).)*)\1\s*$/);
      assert.ok(lab, f + ': تسمية التأكيد ليست نصًّا حرفيًّا فلا تُفحص: ' + m[0]);
      labels.push([f, lab[2]]);
    }
  }
  assert.ok(labels.length >= 5, 'قُرئت تسميات التأكيد كلّها (' + labels.length + ')');
  for (const [f, l] of labels) { assert.doesNotMatch(l, BANNED, f + ': ' + l); assert.match(l, /[؀-ۿ]/, f + ': عربيّة'); }
});

test('٢. نافذة التأكيد نفسها (message_ar وlabel) من المعالجات الخمسة الحقيقيّة', async () => {
  for (const f of ['video-create.js', 'veo-create.js', 'omni-create.js', 'minimax-create.js', 'actor-create.js']) {
    const r = await call(f, POST({ speech: 'هلا والله' }));
    assert.equal(r.code, 428, f + ': بلا تأكيد = عرض سعر لا خصم');
    assert.equal(r.body.error, 'confirm_required');
    assert.match(r.body.message_ar, /تخصم \d+ نقطة/);
    clean(r, f);
  }
});

test('٣. أخطاء الإنشاء المدفوع: المفتاح المفقود، رفض المزوّد بنصّه، والانقطاع — رسالة عربيّة والتفصيل في السجلّ', async () => {
  const cases = [
    ['video-create.js', 'بلا مفتاح', null, { key: false }],
    ['minimax-create.js', 'بلا مفتاح', null, { key: false }],
    // نصّ لقطة المالك نفسه (video-create.js، v-runway-model): أسماء النماذج في خطأ المزوّد
    ['video-create.js', 'رفض', reply(400, { error: 'Model gen4.5 is not available. Expected one of gen4.5 | kling3.0_pro | veo3.1' })],
    ['veo-create.js', 'رفض', reply(400, { error: { message: 'models/veo-3.1-fast-generate-preview is not found for API version v1beta' } })],
    ['omni-create.js', 'رفض', reply(404, { error: { message: 'models/gemini-omni-1.1-flash is not found for API version v1beta' } })],
    ['minimax-create.js', 'رفض', reply(200, { base_resp: { status_code: 2013, status_msg: 'MiniMax-Hailuo-02 does not support 1080P with 10s' } })],
    ['video-create.js', 'انقطاع', offline], ['veo-create.js', 'انقطاع', offline], ['minimax-create.js', 'انقطاع', offline],
    ['omni-create.js', 'انقطاع', offline],
  ];
  for (const [f, what, net, opt] of cases) {
    const r = await call(f, POST({ confirmed: true, speech: 'هلا والله' }), net, opt);
    assert.ok(r.code >= 400, f + ' ' + what + ': فشل');
    clean(r, f + ' ' + what);
    // v-credit-out: العطب عندنا (النموذج/المفتاح/الرصيد) رمز unavailable يترجمه العميل «الخدمة متوقّفة مؤقّتًا» (svcPaused، ١٤ لغة)
    assert.ok(/تعذّر/.test(r.texts.join(' ')) || (r.body && r.body.error === 'unavailable'), f + ' ' + what + ': رسالة عربيّة مفهومة أو رمز يترجمه العميل');
    assert.ok(r.errors.length > 0, f + ' ' + what + ': التفصيل التقنيّ لم يُسجَّل — يضيع التشخيص');
  }
});

test('٤. أخطاء الاستطلاع (Runway · Veo · الممثّل): بلا اسم مزوّد ولا مفتاح ولا «Proxy error»', async () => {
  const cases = [
    ['video-status.js', GET({ id: '0:x' }), null, { key: false }],
    ['video-status.js', GET({ id: '0:x' }), reply(500, { error: 'Runway internal' })],
    ['video-status.js', GET({ id: '0:x' }), offline],
    ['veo-status.js', GET({ op: 'models/veo/operations/1' }), null, { key: false }],
    ['veo-status.js', GET({ op: 'models/veo/operations/1' }), reply(429, { error: { message: 'Quota exceeded for veo-3.1 on Gemini API' } })],
    ['veo-status.js', GET({ op: 'models/veo/operations/1' }), offline],
    ['actor-status.js', GET({ id: 'abcdefgh12' }), offline],
  ];
  for (const [f, req, net, opt] of cases) {
    const r = await call(f, req, net, opt);
    assert.ok(r.code >= 400, f + ': فشل');
    clean(r, f);
    assert.ok(r.errors.length > 0, f + ': التفصيل لم يُسجَّل');
  }
  // اكتمال Veo بلا فيديو ولا سبب حجب: الردّ الخامّ (فيه @type type.googleapis.com/google.ai…) كان يُلحق بسبب الفشل الظاهر
  const done = await call('veo-status.js', GET({ op: 'models/veo/operations/2' }), reply(200, { done: true, response: { '@type': 'type.googleapis.com/google.ai.generativelanguage.v1beta.PredictLongRunningResponse', generateVideoResponse: {} } }));
  assert.equal(done.body.status, 'FAILED');
  clean(done, 'veo-status بلا فيديو');
  assert.ok(done.errors.some((e) => /googleapis/.test(e)), 'الخامّ في السجلّ للتشخيص');
});

test('٥. لا رسالة مستخدم خامّة في ملفّات الفيديو المدفوع (حارس ثابت ضدّ العودة)', () => {
  for (const f of ['video-create', 'veo-create', 'omni-create', 'minimax-create', 'actor-create', 'video-status', 'veo-status', 'actor-status', 'video-script']) {
    const src = read('api/_lib/' + f + '.js');
    assert.doesNotMatch(src, /error: '(?:Server is missing|Proxy error|Runway error|Veo error|OpenAI error|Server error)/, f);
    assert.doesNotMatch(src, /failure: String\(data\.error/, f + ': سبب الفشل بنصّ المزوّد');
    assert.doesNotMatch(src, /error: '[^']*\(' \+ (?:tech|String\(msg\))/, f + ': ذيل المزوّد بين قوسين في رسالة المستخدم');
  }
});

test('٦. مراجعة باب المال: سبب فشل Veo عند الاستطلاع، وخطوة سيناريو الفيلم — عربيّ ثابت بلا اسم مزوّد، والنصّ للسجلّ', async () => {
  const op = GET({ op: 'models/veo/operations/3' });
  const err = await call('veo-status.js', op, reply(200, { done: true, error: { code: 3, message: 'models/veo-3.1-fast-generate-preview: Veo could not process the input image (Gemini API).' } }));
  assert.equal(err.body.status, 'FAILED');
  assert.equal(err.body.failureCode, 'failed');
  clean(err, 'veo-status خطأ العمليّة');
  assert.ok(err.errors.some((e) => /could not process/.test(e)), 'النصّ في السجلّ للتشخيص');
  const safe = await call('veo-status.js', op, reply(200, { done: true, error: { code: 3, message: 'Video generation failed due to Responsible AI safety filters on Vertex AI.' } }));
  assert.equal(safe.body.failureCode, 'safety', 'الرقابة يعرفها العميل بالرمز فيترجمها');
  clean(safe, 'veo-status رقابة');
  const rai = await call('veo-status.js', op, reply(200, { done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ['Gemini blocked this: celebrity likeness (Veo policy)'] } } }));
  assert.equal(rai.body.failureCode, 'safety');
  clean(rai, 'veo-status حجب بسبب');

  const script = (net, opt) => call('video-script.js', POST({ topic: 'رحلة إلى البحر', mode: 'film' }), net, opt);
  const replyT = (status, body) => async () => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) });
  for (const [what, r] of [
    ['بلا مفتاح', await script(null, { key: false })],
    ['رفض المزوّد باسم النموذج', await script(replyT(429, { error: { message: 'Rate limit reached for gpt-5.5-mini in organization org-x on OpenAI' } }))],
    ['انقطاع', await script(offline)],
  ]) {
    assert.ok(r.code >= 400, 'video-script ' + what);
    clean(r, 'video-script ' + what);
    assert.match(r.texts.join(' '), /سيناريو الفيلم/, what);
    assert.ok(r.errors.length > 0, 'video-script ' + what + ': التفصيل لم يُسجَّل');
  }
});

test('٧. مراجعة ٢: رفض المزوّد عند البدء ثلاثة — مؤقّت يُعاد، وعطب عندنا (مفتاح/صلاحيّة/نموذج) لا يُلام عليه المستخدم ولا يُمرَّر ٤٠١، ورفض للطلب نفسه', () => {
  /* v-credit-out (أمر المالك ٢١ أكتوبر): العطب عندنا (مفتاح/صلاحيّة/نموذج/رصيد المزوّد) رمز unavailable بـ503 — العميل يعرض «الخدمة متوقّفة
     مؤقّتًا» بلغة واجهته — بدل نصّ OURS العربيّ الثابت؛ ولا يُمرَّر ٤٠١ كما كان. */
  const { startFail, TEMP, BAD } = require(path.join(root, 'api/_lib/_videoFail.js'));
  const OURS = 'unavailable';
  const cases = [
    [503, 'Service Unavailable', 503, TEMP, true],
    [429, 'Resource has been exhausted (e.g. check quota).', 429, TEMP, true],
    [400, 'API key not valid. Please pass a valid API key.', 503, OURS, false],
    [401, 'Unauthorized', 503, OURS, false], // كان يُمرَّر ٤٠١ فتفتح الترندات «سجّل الدخول»
    [403, 'The caller does not have permission', 503, OURS, false],
    [404, 'models/veo-3.1-fast-generate-preview is not found for API version v1beta', 503, OURS, false],
    [400, 'Model gen4.5 is not available. Expected one of gen4.5 | kling3.0_pro', 503, OURS, false],
    [400, 'Your prompt was flagged by our content moderation system.', 400, BAD, false],
    [422, 'Invalid asset: image could not be decoded', 422, BAD, false],
  ];
  for (const [st, tech, code, text, retry] of cases) {
    const f = startFail(st, tech);
    assert.equal(f.code, code, st + ' ' + tech);
    assert.equal(f.body.message_ar || f.body.error, text, st + ' ' + tech); // v-vid-codes: الزحام والرفض رمزٌ في error والنصّ نفسه في message_ar
    if (text !== OURS) assert.equal(f.body.error, text === TEMP ? 'video_busy' : 'video_rejected');
    assert.equal(f.body.retryable, retry, st + ' ' + tech);
    assert.doesNotMatch(f.body.error, BANNED);
  }
});
