'use strict';
/* v-trend-codes — فحص الترندات من الصفر (المالك ٢٤ أكتوبر: «أبدأ في ٣ و٤»):
   ٣) ترند بشخصين أو ثلاثة: فشل إطار المجموعة كان نصًّا عربيًّا ثابتًا «تعذّر تجهيز الأشخاص معًا الآن. أعد المحاولة» بـ٥٠٢ لكلّ سبب —
      فنفاد رصيد المزوّد لا يُعرض «الخدمة متوقّفة مؤقّتًا» (أمر v-credit-out)، والواجهة تعرض «تعذّر: تعذّر…» وبالعربيّة في كلّ اللغات.
   ٤) سبب رفض الفيديو (veo-status: failure عربيّ + failureCode) كان يظهر في الواجهة الإنجليزيّة «Failed: الرقابة رفضت المحتوى…».
   المعالج الحقيقيّ بمالك (بلا خصم) ومزوّد مزيّف، وerrText الحقيقيّة في vm. */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-11-video-trends.js'), 'utf8');

function fakeRes() {
  return { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
}
function ownerToken() {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.OWNER_USERNAMES = 'omran';
  const payload = Buffer.from(JSON.stringify({ u: 'omran', exp: Date.now() + 60000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
/* ترند بشخصين — إطار المجموعة يردّ بما يُعطى، ولا يصل نداء المحرّك أبدًا */
async function groupFail(frameReply) {
  const token = ownerToken();
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    calls.push(String(url));
    if (/gemini-3-pro-image/.test(url)) return frameReply();
    return { ok: true, json: async () => ({ name: 'operations/should-not-start' }) };
  };
  const res = fakeRes();
  try {
    await require('../api/_lib/veo-create.js')({ method: 'POST', body: {
      trend: 'heritagesing', params: { text: 'يا هلا', people: 2 }, token,
      imageBase64: 'AAAA', imageMime: 'image/png', imagesBase64: ['AAAA', 'BBBB'], imagesMime: ['image/png', 'image/png'],
    } }, res);
  } finally { global.fetch = realFetch; }
  assert.ok(!calls.some((u) => /predictLongRunning/.test(u)), 'لا يبدأ الفيديو بعد فشل الإطار');
  return res;
}

test('١. إطار المجموعة ورصيد المزوّد نافد (٤٢٩ «prepayment credits are depleted»): unavailable بـ٥٠٣ بلا إعادة — لا «أعد المحاولة»', async () => {
  const res = await groupFail(() => ({ ok: false, status: 429, json: async () => ({ error: { message: 'Your prepayment credits are depleted. Please go to AI Studio to manage your billing.' } }) }));
  assert.equal(res.code, 503);
  assert.deepEqual(res.body, { error: 'unavailable', retryable: false });
});

test('٢. إطار المجموعة وزحام عابر (٥٠٣ من المزوّد): video_busy يُعاد، والعربيّ في message_ar لا في error', async () => {
  const res = await groupFail(() => ({ ok: false, status: 503, json: async () => ({ error: { message: 'The model is overloaded. Please try again later.' } }) }));
  assert.equal(res.code, 503);
  assert.equal(res.body.error, 'video_busy');
  assert.equal(res.body.retryable, true);
  assert.ok(!/[؀-ۿ]/.test(res.body.error), 'الرمز بلا عربيّ');
});

test('٣. إطار المجموعة وصورة محجوبة (لا صورة في الردّ): video_rejected بلا إعادة، وmessage_ar بلا رمز المزوّد الخامّ', async () => {
  const res = await groupFail(() => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }) }));
  assert.equal(res.code, 502);
  assert.equal(res.body.error, 'video_rejected');
  assert.equal(res.body.retryable, false);
  assert.match(res.body.message_ar, /ما قدرت أجمع الأشخاص في مشهد واحد/);
  assert.ok(!/IMAGE_SAFETY/.test(res.body.message_ar), 'لا رمز خامّ');
});

/* errText الحقيقيّة (ومعها W) في vm، بلغة واجهة تُختار */
function errText(uiLang) {
  const a = SRC.indexOf('  function errText(e){');
  const b = SRC.indexOf('\n  }\n', a);
  const w = SRC.indexOf('  function W(k){');
  assert.ok(a > 0 && w > 0);
  const dict = uiLang === 'ar'
    ? { svcPaused: 'الخدمة متوقّفة مؤقّتًا — جرّب بعد قليل.', vidBusy: 'تعذّر بدء الفيديو مؤقتًا — أعد المحاولة بعد لحظات.', vidRejected: 'تعذّر بدء الفيديو بهذا الطلب — غيّر الوصف أو الصورة وأعد المحاولة.' }
    : { svcPaused: 'This service is temporarily unavailable — please try again shortly.', vidBusy: 'Couldn\'t start the video right now — try again in a moment.', vidRejected: 'This request couldn\'t start a video — change the description or photo and try again.' };
  const UI = uiLang === 'ar' ? { fail: 'تعذّر' } : { fail: 'Failed' };
  const ctx = { window: { t: (k) => (k in dict ? dict[k] : k) }, ui: (k) => UI[k] || k, noEmoji: (x) => String(x), lg: () => uiLang };
  vm.createContext(ctx);
  vm.runInContext(SRC.slice(w, SRC.indexOf('\n', w)) + '\n' + SRC.slice(a, b + 4), ctx);
  return { f: ctx.errText, dict, UI };
}
/* كما يرميها oneClip عند FAILED من veo-status */
const failed = (failure, failureCode) => Object.assign(new Error(failure), { failureCode });
const SAFETY_AR = 'الرقابة رفضت المحتوى — جرّب صورة أو وصفًا آخر.';
const OTHER_AR = 'أعد المحاولة، وإن تكرّر فجرّب صورة أو وصفًا آخر.';

test('٤. الواجهة الإنجليزيّة: سبب الرفض بنصّها لا بالعربيّ — الرقابة vidRejected، وغيرها vidBusy، وأيّ نصّ خادم عربيّ آخر «Failed»', () => {
  const { f, dict, UI } = errText('en');
  assert.equal(f(failed(SAFETY_AR, 'safety')), dict.vidRejected);
  assert.equal(f(failed(OTHER_AR, 'failed')), dict.vidBusy);
  assert.equal(f(new Error('تعذّر بدء الفيديو مؤقتًا — أعد المحاولة بعد لحظات.')), UI.fail, 'خطأ إنشاء عربيّ');
  for (const out of [f(failed(SAFETY_AR, 'safety')), f(failed(OTHER_AR, 'failed')), f(new Error('تعذّر'))]) assert.ok(!/[؀-ۿ]/.test(out), out);
  /* الرموز المعروفة كما كانت */
  assert.equal(f(Object.assign(new Error('unavailable'), { code: 'unavailable' })), dict.svcPaused);
  assert.equal(f(Object.assign(new Error('video_rejected'), { code: 'video_rejected' })), dict.vidRejected);
});

test('٥. الواجهة العربيّة كما كانت حرفًا: «تعذّر: » + سبب الخادم', () => {
  const { f } = errText('ar');
  assert.equal(f(failed(SAFETY_AR, 'safety')), 'تعذّر: ' + SAFETY_AR);
  assert.equal(f(failed(OTHER_AR, 'failed')), 'تعذّر: ' + OTHER_AR);
});

test('٦. oneClip يحمل failureCode من الاستطلاع إلى errText، والحزمة مبنيّة من الجزء', () => {
  assert.match(SRC, /if\(sj && sj\.status === 'FAILED'\) throw Object\.assign\(new Error\(sj\.failure \|\| sj\.error \|\| 'failed'\), \{ failureCode: sj\.failureCode \|\| '' \}\);/);
  const bundle = fs.readFileSync(path.join(ROOT, 'js', 'app.bundle.js'), 'utf8');
  assert.ok(bundle.includes("return (fc === 'safety' && W('vidRejected')) || (fc === 'failed' && W('vidBusy')) || ui('fail');"), 'npm run bundle');
});
