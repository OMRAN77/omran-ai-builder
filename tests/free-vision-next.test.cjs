// tests/free-vision-next.test.cjs — v-free-vision-next (٢٢ أكتوبر، بأمر المالك «ابدأ الإصلاح بلا تكلفة»): الطبقة المجّانيّة تردّ على كلّ صورة
// «ما قدرت أقرأ الصورة الحين». سجلّ Vercel (المعاينة والإنتاج ١٩–٢٢ أكتوبر): Gemini ‏402 «prepayment credits are depleted»، ثمّ
// google/gemma-4-31b-it:free ‏429 «temporarily rate-limited upstream» — وكان 429 الوسيط يُنهي المزوّد كلّه (قاعدة «جرّب التالي» لـGroq وحده)،
// وفي visionModels نموذج واحد أصلًا. يثبّت على المعالج الحقيقيّ لحساب مجّانيّ: زحمة نموذج رؤية = التالي يقرأ الصورة نفسها، وكلّها مزدحمة =
// الرسالة الصادقة مع tierDiag، وحدّ الحساب اليوميّ لا يُكرَّر على كلّ نموذج، ودور النصّ كما كان.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'free-vision-next-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.OPENROUTER_API_KEY = 'or-test';
process.env.GROQ_API_KEY = 'gq-test';
for (const k of ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'FREE_CHAIN', 'FREE_OPENROUTER_MODEL', 'FREE_GEMINI_MODEL']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {}, kvExpire: async () => {}, kvIncr: async () => 1, kvSetIfAbsent: async () => true, kvGetRaw: async () => null, kvSetRaw: async () => {} });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '1.1.1.1', checkAndConsume: async () => ({ allowed: true, username: 'free-eye', tier: 'free', subscriber: false, remaining: 19 }), checkAndConsumeCustom: async () => ({ allowed: true, remaining: 19 }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {} });
const chat = require(rp('api/_lib/chat.js'));
const fc = require(rp('api/_lib/free-chain.js'));
const tier = require(rp('api/_lib/tier.js'));
const VISION = tier.FREE_PROVIDER_SPECS.openrouter.visionModels;

const tok = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const IMG = Buffer.alloc(3000, 9).toString('base64');
const IMG_MSG = [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMG } }, { type: 'text', text: 'وش المكتوب في اللقطة؟' }] }];
const sse = (parts) => new Response(parts.map((x) => 'data: ' + JSON.stringify({ choices: [{ delta: { content: x } }] }) + '\n').join('') + 'data: [DONE]\n', { status: 200 });
// نصوص الأخطاء بصيغتها في سجلّ Vercel (٢٢ أكتوبر)، مكمّلة بما قصّه السجلّ عند ١٦٠ حرفًا.
const GEMINI_402 = () => new Response(JSON.stringify([{ error: { code: 402, message: 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.', status: 'RESOURCE_EXHAUSTED' } }]), { status: 402 });
const UPSTREAM_429 = (m) => new Response(JSON.stringify({ error: { message: 'Provider returned error', code: 429, metadata: { raw: m + ' is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations', provider_name: 'Google AI Studio' } } }), { status: 429 });
const ACCOUNT_429 = () => new Response(JSON.stringify({ error: { message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', code: 429 } }), { status: 429 });

// دور واحد على المعالج الحقيقيّ. route(url, body) يقرّر ردّ كلّ نداء؛ يرجع النصّ والأحداث والنداءات.
async function turn(route, messages) {
  const calls = [];
  const saved = global.fetch;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; } // نداء جانبيّ ليس JSON
    calls.push({ url: String(url), body: b });
    return route(String(url), b) || new Response('{}', { status: 404 });
  };
  let out = '';
  const req = { method: 'POST', headers: {}, body: { provider: 'claude', token: tok('free-eye'), tz: 'Asia/Dubai', messages: messages || IMG_MSG } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out += JSON.stringify(v); }, write(c) { out += String(c || ''); }, end() {}, flush() {}, on() {} };
  try { await chat(req, res); } finally { global.fetch = saved; }
  const events = out.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { text: events.filter((e) => e.delta).map((e) => e.delta).join(''), events, calls };
}
const orModels = (calls) => calls.filter((c) => /openrouter\.ai\/api\/v1\/chat/.test(c.url)).map((c) => c.body.model);

test('١. حساب مجّانيّ + صورة: Gemini ‏402 وGemma 4 31B ‏429 ← نموذج الرؤية التالي يقرأ الصورة نفسها، لا «ما قدرت أقرأ الصورة»', async () => {
  fc.__workingModel.clear();
  const r = await turn((url, b) => {
    if (/generativelanguage\.googleapis\.com/.test(url)) return GEMINI_402();
    if (/openrouter\.ai/.test(url)) return b.model === VISION[0] ? UPSTREAM_429(b.model) : sse(['المكتوب: ', 'النسخ الاحتياطي متوقّف']);
    return null;
  });
  assert.equal(r.text, 'المكتوب: النسخ الاحتياطي متوقّف', r.text);
  assert.ok(!r.text.includes(tier.FREE_TEXT.imageBusy));
  assert.deepEqual(orModels(r.calls), [VISION[0], VISION[1]], 'زحمة الأوّل لا تُنهي الوسيط — الثاني بعده مباشرة');
  const second = r.calls.filter((c) => /openrouter\.ai/.test(c.url))[1].body;
  const last = second.messages[second.messages.length - 1];
  assert.ok(last.content.some((p) => p.type === 'image_url' && p.image_url.url === 'data:image/png;base64,' + IMG), 'الصورة نفسها تصل النموذج التالي');
  assert.ok(!r.calls.some((c) => /groq|mistral/.test(c.url)), 'لا مزوّد أعمى في دور الصورة');
  assert.ok(!r.calls.some((c) => /\/models$/.test(c.url)), 'بلا استكشاف /models');
  assert.ok(!r.events.some((e) => e.tierDiag), 'نجاح = بلا تشخيص فشل');
  fc.__workingModel.clear();
});

test('٢. كلّ نماذج الرؤية مزدحمة: كلّ نموذج مرّة واحدة بالترتيب، ثمّ الرسالة الصادقة وtierDiag بالأسباب بلا مفاتيح', async () => {
  fc.__workingModel.clear();
  const r = await turn((url, b) => {
    if (/generativelanguage\.googleapis\.com/.test(url)) return GEMINI_402();
    if (/openrouter\.ai/.test(url)) return UPSTREAM_429(b.model);
    return null;
  });
  assert.equal(r.text, tier.FREE_TEXT.imageBusy);
  assert.deepEqual(orModels(r.calls), VISION, 'كلّ نماذج الرؤية بترتيبها، كلّ واحد مرّة');
  const diag = (r.events.find((e) => e.tierDiag) || {}).tierDiag || [];
  assert.match(diag[0], /^gemini: .*http 402/);
  for (const m of VISION) assert.ok(diag.some((d) => d.startsWith('openrouter/' + m + ': ') && / 429 /.test(d)), m + ' في التشخيص: ' + diag.join(' | '));
  assert.ok(!/gm-test|or-test|gq-test/.test(JSON.stringify(r.events)), 'لا مفتاح في الأحداث');
  fc.__workingModel.clear();
});

test('٣. حدّ الحساب نفسه (free-models-per-day) لا يُكرَّر على كلّ نموذج — نداء واحد للوسيط', async () => {
  fc.__workingModel.clear();
  const models = [];
  const r = await fc.streamFreeChain({ system: 'S', convo: IMG_MSG, send: () => {}, log: () => {}, requireVision: true, env: { OPENROUTER_API_KEY: 'o' },
    fetchImpl: async (url, init) => { models.push(JSON.parse(init.body).model); return ACCOUNT_429(); } });
  assert.equal(r.ok, false);
  assert.deepEqual(models, [VISION[0]]);
  assert.ok(r.errors.some((e) => /^openrouter: .*free-models-per-day/.test(e)), r.errors.join(' | '));
  fc.__workingModel.clear();
});

test('٤. الناجح بعد الزحمة يُحفظ لدور الصورة القادم، ودور النصّ كما كان (429 الوسيط يُنهيه، بلا نماذج الرؤية)', async () => {
  fc.__workingModel.clear();
  const env = { OPENROUTER_API_KEY: 'o' };
  const logs = [];
  const first = await fc.streamFreeChain({ system: 'S', convo: IMG_MSG, send: () => {}, log: (m) => logs.push(m), requireVision: true, env, now: 1000,
    fetchImpl: async (url, init) => { const m = JSON.parse(init.body).model; return m === VISION[2] ? sse(['تمام']) : UPSTREAM_429(m); } });
  assert.equal(first.ok, true); assert.equal(first.model, VISION[2]);
  assert.equal(logs.length, 1, 'سطر واحد في سجلّ الخادم لنجاح دور الصورة');
  assert.ok(logs[0].startsWith('vision openrouter/' + VISION[2] + ' after openrouter/' + VISION[0] + ': '), logs[0]);
  assert.ok(logs[0].includes('openrouter/' + VISION[1] + ': '), 'والمزدحم الثاني قبله');
  const again = [];
  await fc.streamFreeChain({ system: 'S', convo: IMG_MSG, send: () => {}, log: () => {}, requireVision: true, env, now: 2000,
    fetchImpl: async (url, init) => { again.push(JSON.parse(init.body).model); return sse(['تمام']); } });
  assert.deepEqual(again, [VISION[2]], 'الذاكرة تبدأ بالناجح فلا يُضرب المزدحم في كلّ دور');
  fc.__workingModel.clear();
  const text = [];
  const t = await fc.streamFreeChain({ system: 'S', convo: [{ role: 'user', content: 'هلا' }], send: () => {}, log: () => {}, env,
    fetchImpl: async (url, init) => { text.push(JSON.parse(init.body).model); return UPSTREAM_429('x'); } });
  assert.equal(t.ok, false);
  assert.equal(text.length, 1, 'دور النصّ: قاعدة «التالي عند 429» لنماذج الرؤية وحدها');
  fc.__workingModel.clear();
});

test('٥. قائمة الرؤية: Gemma 4 31B أوّلًا ثمّ عينان مجّانيّتان، كلّها :free بلا تكرار، والحارس يقبلها', () => {
  assert.deepEqual(VISION, ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-super-vl:free']);
  assert.equal(new Set(VISION).size, VISION.length);
  for (const m of VISION) assert.ok(/:free$/.test(m), 'مجّانيّ: ' + m);
  const { guardModel } = require(rp('api/_lib/_model-guard.js'));
  for (const m of VISION) assert.equal(guardModel('openrouter', m, false), m, 'حارس الموديلات لا يستبدله: ' + m);
});
