// v-media-gate (١٩ سبتمبر ٢٠٢٦): بوّابة نيّة قبل مسارات الوسائط الكلماتيّة — تضييق التعابير + مصنّف رخيص على الخادم.
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-media-gate';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mi = require('../api/_lib/media-intent.js');

test('parseMediaIntentReply: مسار من القائمة وثقة رقميّة؛ إنشاء بثقة ضعيفة = none؛ المعطوب = null', () => {
  assert.deepEqual(mi.parseMediaIntentReply('{"lane":"video","confidence":0.92}'), { lane: 'video', confidence: 0.92 });
  assert.deepEqual(mi.parseMediaIntentReply({ lane: 'image', confidence: 0.4 }), { lane: 'none', confidence: 0.4 });
  assert.deepEqual(mi.parseMediaIntentReply('نصّ قبل {"lane":"none","confidence":0.9} وبعد'), { lane: 'none', confidence: 0.9 });
  assert.equal(mi.parseMediaIntentReply('{"lane":"audio","confidence":0.9}'), null);
  assert.equal(mi.parseMediaIntentReply('{"lane":"image"}'), null);
  assert.equal(mi.parseMediaIntentReply(''), null);
  assert.match(mi.buildMediaIntentPrompt('سوّ لي فيديو'), /lane=none: everything else/);
  assert.doesNotMatch(mi.buildMediaIntentPrompt('a"b\nc'), /"b\n/);
});

test('classifyMediaIntentLLM: حرارة صفر وJSON، والفشل null', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"lane":"image","confidence":0.88}' }] } }] }), { status: 200 });
  };
  const r = await mi.classifyMediaIntentLLM({ apiKey: 'k', text: 'ارسم لي شعار مطعم', fetchImpl });
  assert.deepEqual(r, { lane: 'image', confidence: 0.88 });
  assert.equal(calls[0].body.generationConfig.temperature, 0);
  assert.equal(calls[0].body.generationConfig.responseMimeType, 'application/json');
  assert.match(calls[0].url, /gemini-flash-latest:generateContent\?key=k$/);
  assert.equal(await mi.classifyMediaIntentLLM({ apiKey: 'k', text: 'x', fetchImpl: async () => { throw new Error('down'); } }), null);
  assert.equal(await mi.classifyMediaIntentLLM({ apiKey: '', text: 'x', fetchImpl }), null);
});

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

test('المعالج: بلا مفتاح = unavailable (لا خطأ)، وبمفتاح وجواب صحيح = llm، ونصّ فارغ = 400', async () => {
  const saveKey = process.env.GEMINI_API_KEY; const saveFetch = global.fetch;
  try {
    delete process.env.GEMINI_API_KEY;
    let res = fakeRes();
    await mi({ method: 'POST', body: { text: 'سوّ لي فيديو عن مطعمي' }, headers: {}, socket: {} }, res);
    assert.equal(res.code, 200); assert.deepEqual(res.body, { lane: null, source: 'unavailable' });
    res = fakeRes();
    await mi({ method: 'POST', body: { text: '   ' }, headers: {}, socket: {} }, res);
    assert.equal(res.code, 400);
    process.env.GEMINI_API_KEY = 'k';
    global.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"lane":"video","confidence":0.95}' }] } }] }), { status: 200 });
    res = fakeRes();
    await mi({ method: 'POST', body: { text: 'سوّ لي فيديو عن مطعمي', guestId: 'g-test-' + Date.now() }, headers: {}, socket: {} }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.lane, 'video'); assert.equal(res.body.source, 'llm');
  } finally {
    if (saveKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saveKey;
    global.fetch = saveFetch;
  }
});

test('tools.js يوجّه media-intent، ولا قراءة للبيئة في نطاق الوحدة', () => {
  assert.ok(read('api/tools.js').includes("case 'media-intent': return require('./_lib/media-intent.js');"));
  assert.doesNotMatch(read('api/_lib/media-intent.js'), /^const .*process\.env/m);
});

// تعابير العميل تُستخرج من المصدر وتُشغَّل معزولة.
function rx(name, src) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*(/[\\s\\S]*?/[a-z]*);\\n'));
  assert.ok(m, name + ' موجود');
  return vm.runInNewContext(m[1]);
}
const src = read('js/app-09-attach.js');
const TALK = rx('__MEDIA_TALK_RE', src);
const WORD = rx('__MEDIA_WORD_RE', src);
const VID = rx('__VID_MAKE_RE', src);
const VIDQ = rx('__VID_Q_RE', src);

test('كلام «عن» الوسائط لا يُعدّ إنشاءً؛ أمر الإنشاء الصريح يبقى مرشّحًا', () => {
  const talk = ['كيف أسوي فيديو للتيك توك', 'اكتب لي سكربت فيديو عن مطعمي', 'أفضل برنامج تعديل صور', 'وش أحسن تطبيق مونتاج فيديو', 'شرح طريقة رفع فيديو على يوتيوب', 'هل تقدر تسوي فيديو؟', 'عطني فكرة فيديو لقناتي'];
  for (const t of talk) { assert.ok(WORD.test(t) && TALK.test(t), 'كلام: ' + t); }
  const create = ['سوّ لي فيديو عن مطعمي', 'ارسم لي شعار مطعم', 'أبغى فيديو قصير يعرض المنتج', 'اعمل لي بوستر للعيد'];
  for (const t of create) { assert.ok(WORD.test(t) && !TALK.test(t), 'مرشّح: ' + t); }
  assert.ok(!WORD.test('كم سعر الذهب اليوم'), 'بلا كلمة وسائط: لا بوّابة أصلًا');
});

test('__VID_MAKE_RE مضيَّق بحدود عربيّة: «تسوي فيديو» لم يعد يطابق «سوي»، والأمر الصريح يطابق', () => {
  assert.equal(VID.test('شرح لي طريقة تسوي فيديو للتيك توك'), false);
  assert.equal(VID.test('سوي لي فيديو عن مطعمي'), true);
  assert.equal(VID.test('أبغى فيديو عن المنتج'), true);
  assert.equal(VIDQ.test('كيف اسوي فيديو'), true, 'السؤال يُستثنى كما كان');
});

test('كلّ مسار إنشاء كلماتيّ يحمل شرط البوّابة، في الجزء والحزمة', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("__mediaLane = __MEDIA_TALK_RE.test(text) ? 'none' : await omranMediaIntent(text);"), f + ': البوّابة تُحسب أوّل الإرسال');
    assert.ok(s.includes("&& __mediaLane !== 'none' && __mediaLane !== 'image' /* v-media-gate */ && typeof window.omranOpenVideoMaker === 'function'"), f + ': فتح الصانع');
    assert.ok(s.includes("__mediaLane !== 'none' && __mediaLane !== 'image' /* v-media-gate */ && (\n"), f + ': __wantsVideo');
    assert.ok(s.includes("__adIntentRe.test(text) && !__blockAutoImage && __mediaLane !== 'none' /* v-media-gate */"), f + ': الإعلان');
    assert.ok(s.includes("!__isSupportQ && !__blockAutoImage && __mediaLane !== 'none' /* v-media-gate */ && ("), f + ': التعديل/التوليد');
    assert.ok(s.includes("!__blockAutoImage && __mediaLane !== 'none' /* v-media-gate */ && !__followUp && !__codeWordRe.test(text) && !__designDocRe.test(text) &&"), f + ': المعماريّ');
    assert.ok(s.includes("!__blockAutoImage && __mediaLane !== 'none' && __mediaLane !== 'video' /* v-media-gate */ && (!__srcImg || __freshGenWins)"), f + ': الصورة من نصّ');
    assert.ok(s.includes("fetch('/api/tools?action=media-intent'"), f + ': نداء المصنّف');
  }
});
