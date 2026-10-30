// v-tts-no-markdown (المالك ٣٠ أكتوبر، لقطة ردّ فيه «**مسجّل الصوت**»: «المتحدّث الحين يقول كل مرّة نجمة نجمة… يردّد على هذا الكلام»):
// صوت مها يقرأ الكلام وحده: لا نجوم ولا # ولا | ولا روابط حرفًا حرفًا ولا رموز تعبيريّة. ما يراه المستخدم كما هو.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const { speechText } = require(rp('api/_lib/speech-text.js'));

test('ردّ المالك نفسه: «**مسجّل الصوت**» يُقرأ «مسجّل الصوت» بلا نجمة، والقائمة برقمها', () => {
  const reply = 'على هواوي تقدر تنظّف الصوت وإنت تسجّل، من تطبيق **مسجّل الصوت** نفسه:\n1. افتح **مسجّل الصوت** من مجلد **الأدوات**.\n2. اضغط زر التسجيل الأحمر.';
  const out = speechText(reply);
  assert.ok(!out.includes('*'));
  assert.equal(out, 'على هواوي تقدر تنظّف الصوت وإنت تسجّل، من تطبيق مسجّل الصوت نفسه:\n1. افتح مسجّل الصوت من مجلد الأدوات.\n2. اضغط زر التسجيل الأحمر.');
});

test('العناوين والنقاط والاقتباس والفاصل والكود والمائل والمشطوب بلا رموزها', () => {
  assert.equal(speechText('## ما أثبته\n- بند أوّل\n• بند ثاني\n> نصيحة: لا تغطّي *فتحة* الميكروفون\n---\n`npm run` و~~قديم~~ و__مهم__'),
    'ما أثبته\nبند أوّل\nبند ثاني\nنصيحة: لا تغطّي فتحة الميكروفون\nnpm run وقديم ومهم');
});

test('الرابط: نصّه بلا عنوانه، والعنوان المكشوف والصورة لا يُقرآن', () => {
  assert.equal(speechText('المصدر: [دويتشه فيله، 9 أبريل 2026](https://dw.com/x)'), 'المصدر: دويتشه فيله، 9 أبريل 2026');
  assert.equal(speechText('شوف https://npr.org/a?x=1 وهذا ![صورة](https://a.b/c.png) بس'), 'شوف وهذا بس');
});

test('الجدول خلاياه بفواصل وسطر فاصله لا يُقرأ، والرموز التعبيريّة والأعلام تُحذف والأرقام تبقى', () => {
  assert.equal(speechText('| الجائزة | التاريخ |\n|---|:---:|\n| البوكر | 9 أبريل 2026 |'), 'الجائزة، التاريخ\nالبوكر، 9 أبريل 2026');
  assert.equal(speechText('تبيه عربي؟ 😀👍🏽 🇦🇪 ✅'), 'تبيه عربي؟');
  assert.equal(speechText('نص عادي بلا تنسيق، 3 أشياء.'), 'نص عادي بلا تنسيق، 3 أشياء.');
});

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}

test('الخادم: SSML مها بلا نجوم (والردّ للمالك كذلك)، والأصوات الأخرى تُرسل كما هي، ونصّ رموز فقط = ناقص', async () => {
  const saved = { a: process.env.AZURE_SPEECH_KEY_FREE, b: process.env.AZURE_SPEECH_KEY, o: process.env.OPENAI_API_KEY };
  process.env.AZURE_SPEECH_KEY_FREE = 'free-key'; delete process.env.AZURE_SPEECH_KEY; process.env.OPENAI_API_KEY = 'k';
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsumeCustom: async () => ({ allowed: true, username: 'omran' }), clientIp: () => '127.0.0.1',
  } };
  delete require.cache[rp('api/_lib/tts.js')];
  const handler = require(rp('api/_lib/tts.js'));
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => { calls.push({ url: String(url), body: init && init.body }); return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); };
  try {
    const speak = async (body) => { const res = fakeRes(); await handler({ method: 'POST', body, headers: {}, socket: {} }, res); return res; };
    await speak({ text: 'من تطبيق **مسجّل الصوت** نفسه 👍', voice: 'maha', src: 'reply', lang: 'ar' });
    assert.match(calls[0].url, /tts\.speech\.microsoft\.com/);
    assert.ok(calls[0].body.includes('>من تطبيق مسجّل الصوت نفسه<'), calls[0].body);
    await speak({ text: '**bold** text', voice: 'nova' });
    assert.equal(JSON.parse(calls[1].body).input, '**bold** text', 'صوت الاستوديو كما هو');
    const empty = await speak({ text: '** 👍 **', voice: 'maha', lang: 'ar' });
    assert.equal(empty.code, 400);
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = realFetch;
    for (const [k, v] of [['AZURE_SPEECH_KEY_FREE', saved.a], ['AZURE_SPEECH_KEY', saved.b], ['OPENAI_API_KEY', saved.o]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    delete require.cache[rp('api/_lib/_usage.js')]; delete require.cache[rp('api/_lib/tts.js')];
  }
});

// v-hala-wallah (المالك ٣٠ أكتوبر: «الحين الصوت فيه تحسّن لكن أوّل كلمة هلا والله… ضعيفة»)
test('«هلا والله» يقولها الصوت «مرحبا» (كلّ تشكيل لها نطقه غلط) في التعريف والردود، و«أهلا» وما لُصق كما هو', () => {
  assert.equal(speechText('هلا والله، أنا عبدالله. كيف أقدر أساعدك اليوم؟'), 'مرحبا، أنا عبدالله. كيف أقدر أساعدك اليوم؟');
  assert.equal(speechText('يا هلا والله بك'), 'يا مرحبا بك');
  assert.equal(speechText('**هلا والله**\nشحالك'), 'مرحبا\nشحالك');
  for (const t of ['أهلا والله', 'هلاوالله', 'هلا واللهي']) assert.equal(speechText(t), t);
});
