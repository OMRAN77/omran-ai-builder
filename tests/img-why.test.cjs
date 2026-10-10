// tests/img-why.test.cjs — v-img-why (لقطة المالك ٣ أكتوبر على «الكينج»: صورة كولاجين + «شو فوائد الكولاجين» ← «ما قدرت أقرأ
// الصورة الحين — المحرّك الذي يقرأ الصور غير متاح مؤقّتًا» مرّتين، بلا أيّ سبب ظاهر).
// السبب الحقيقيّ كان في سجلّ الخادم وحده، وخروج دور الصورة يسبق إشعار نفاد الرصيد فلا يصل المالك أبدًا.
// يثبّت على المعالج الحقيقيّ: المالك يرى سطر السبب (حالة المحرّك الأساسيّ ونصّه وأسباب الاحتياط، بلا مفاتيح)، وإشعار الرصيد
// يُطلق في دور الصورة، والمستخدم غير المالك يرى الرسالة الصادقة وحدها كما كانت.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'img-why-secret';
process.env.ANTHROPIC_API_KEY = 'sk-test-anthropic';
process.env.GEMINI_API_KEY = 'gm-test';
for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {}, kvExpire: async () => {}, kvIncr: async () => 1, kvSetIfAbsent: async () => true, kvGetRaw: async () => null, kvSetRaw: async () => {} });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '1.1.1.1', checkAndConsume: async () => ({ allowed: true, username: 'omran', remaining: Infinity }), checkAndConsumeCustom: async () => ({ allowed: true, remaining: Infinity }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });
const alerts = [];
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async (x) => { alerts.push(x); } });
const chat = require(rp('api/_lib/chat.js'));

const tok = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const IMG = Buffer.alloc(4000, 7).toString('base64');

let lastEvents = [];
async function turn(user) {
  const saved = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (/api\.anthropic\.com/.test(u)) return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }), { status: 400 });
    if (/generativelanguage\.googleapis\.com/.test(u)) return new Response(JSON.stringify({ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).' } }), { status: 429 });
    return new Response('{}', { status: 404 });
  };
  let out = '';
  const req = { method: 'POST', headers: {}, body: { provider: 'claude', token: tok(user), tz: 'Asia/Dubai', messages: [{ role: 'user', content: [{ type: 'text', text: 'شو فوائد الكولاجين' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMG } }] }] } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out += JSON.stringify(v); }, write(c) { out += String(c || ''); }, end() {}, flush() {} };
  try { await chat(req, res); } finally { global.fetch = saved; }
  lastEvents = out.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  const deltas = lastEvents.filter((e) => e.delta).map((e) => e.delta).join('');
  return deltas;
}

/* v-owner-solo (أمر المالك ٨ أكتوبر «أيّ واحد أختاره يكون نفسه، وإذا ما فيه رصيد يكتبلي»): المالك لا يهبط إلى الاحتياط المجّانيّ
   (Gemini) — يصله «ما عندي رصيد» وحده في حدث التوقّف (السبب الكامل في السجلّ والإشعار)، بلا ردّ من غيره. */
test('١. المالك على الكينج: «ما عندي رصيد» وحده بلا ردّ من الاحتياط، وإشعار الرصيد أُطلق', async () => {
  alerts.length = 0;
  const text = await turn('omran');
  assert.equal(text, '', 'لا ردّ من مزوّد آخر');
  const stop = lastEvents.find((e) => e.ownerStop === true);
  assert.ok(stop, 'حدث التوقّف');
  assert.equal(stop.error, 'ما عندي رصيد');
  assert.equal(alerts.length, 1, 'إشعار نفاد الرصيد يصل في دور الصورة أيضًا');
  assert.equal(alerts[0].status, 400);
  assert.match(alerts[0].text, /credit balance is too low/);
});

test('٢. صياغة السطر: طمس السلاسل الطويلة، وفارغ بلا معلومة', () => {
  const { ownerFailNote } = chat.__imgWhy;
  const fakeKey = ['sk', 'ant', 'api03', 'A'.repeat(32)].join('-'); // مفتاح وهميّ يُبنى وقت التشغيل — لا شكل مفتاح في المصدر
  const n = ownerFailNote(401, 'invalid x-api-key ' + fakeKey, ['gemini/gemini-flash-latest: 429']);
  assert.match(n, /^\n\n🔧 للمالك فقط — السبب: المحرّك الأساسيّ 401: invalid x-api-key …/, 'المفتاح كلّه يُطمس');
  assert.ok(!/AAAAAAAAAAAAAAAAAAAAAAAA/.test(n));
  assert.match(n, / · الاحتياط: gemini\/gemini-flash-latest: 429$/);
  assert.equal(ownerFailNote(0, '', []), '');
  assert.equal(ownerFailNote(0, 'no-vision-route', ['no-vision-provider']), '\n\n🔧 للمالك فقط — السبب: المحرّك الأساسيّ: no-vision-route · الاحتياط: no-vision-provider');
});

test('٣. غير المالك: الرسالة الصادقة وحدها كما كانت، بلا سطر السبب', async () => {
  const text = await turn('someuser');
  assert.match(text, /^ما قدرت أقرأ الصورة الحين/);
  assert.ok(!/🔧|المحرّك الأساسيّ|credit|gemini/i.test(text), text);
});

/* v-img-why: Gemini وحده كان يرى في الاحتياط المجّانيّ. نماذج OpenRouter المجّانيّة التي ترى الصور تأتي بعده في دور الصورة وحده. */
const fc = require('../api/_lib/free-chain.js');
const IMG_CONVO = [{ role: 'user', content: [{ type: 'text', text: 'شو فوائد الكولاجين' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }] }];
const sse = (d) => d.map((x) => 'data: ' + JSON.stringify({ choices: [{ delta: { content: x } }] }) + '\n').join('') + 'data: [DONE]\n';

test('٤. Gemini معطّل (429) في دور الصورة: نموذج OpenRouter مجّانيّ يرى يقرأ الصورة نفسها، لا نموذج أعمى', async () => {
  fc.__workingModel.clear();
  const calls = [];
  const fetchImpl = async (url, init) => {
    const b = init && init.body ? JSON.parse(init.body) : null; calls.push({ url: String(url), b });
    if (/googleapis/.test(url)) return new Response('quota', { status: 429 });
    return new Response(sse(['قرأت العلبة']), { status: 200 });
  };
  const sent = [];
  const r = await fc.streamFreeChain({ system: 'SYS', convo: IMG_CONVO, send: (e) => sent.push(e), env: { GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', GROQ_API_KEY: 'q' }, fetchImpl, log: () => {}, requireVision: true });
  assert.equal(r.ok, true, r.errors.join('|'));
  assert.equal(r.provider, 'openrouter'); assert.equal(r.model, 'google/gemma-3-27b-it:free');
  const orCall = calls.find((c) => /openrouter/.test(c.url));
  const last = orCall.b.messages[orCall.b.messages.length - 1];
  assert.equal(last.content[1].type, 'image_url', 'الصورة نفسها تصل');
  assert.ok(!calls.some((c) => /groq/.test(c.url)), 'Groq الأعمى لا يُنادى');
  assert.deepEqual(sent, [{ delta: 'قرأت العلبة' }]);
  fc.__workingModel.clear();
});

test('٥. نموذج OpenRouter النصّيّ الناجح لا يُقدَّم لدور صورة، وكلّ نماذج الرؤية «غير موجودة» = فشل صريح بلا استكشاف', async () => {
  fc.__workingModel.clear();
  const env = { OPENROUTER_API_KEY: 'o' };
  // دور نصّيّ ينجح بنموذج نصّيّ فيُحفظ
  await fc.streamFreeChain({ system: 'S', convo: [{ role: 'user', content: 'هلا' }], send: () => {}, env, fetchImpl: async () => new Response(sse(['هلا']), { status: 200 }), log: () => {} });
  const models = [];
  const r = await fc.streamFreeChain({ system: 'S', convo: IMG_CONVO, send: () => {}, env, log: () => {}, requireVision: true,
    fetchImpl: async (url, init) => { if (/\/models/.test(url)) { models.push('DISCOVERY'); return new Response('{"data":[]}', { status: 200 }); } models.push(JSON.parse(init.body).model); return new Response(JSON.stringify({ error: { message: 'No endpoints found for model' } }), { status: 404 }); } });
  assert.equal(r.ok, false);
  assert.deepEqual(models, ['google/gemma-3-27b-it:free', 'meta-llama/llama-4-maverick:free', 'mistralai/mistral-small-3.2-24b-instruct:free', 'qwen/qwen2.5-vl-72b-instruct:free'], 'نماذج الرؤية وحدها وبترتيبها، بلا استكشاف');
  assert.ok(r.errors.includes('openrouter: no vision model answered'), r.errors.join('|'));
  fc.__workingModel.clear();
});
