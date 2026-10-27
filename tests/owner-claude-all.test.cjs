'use strict';
/* v-owner-claude-all (أمر عمران ١٠ أكتوبر، لقطتا منتقي تطبيق Claude: «نعم خلّه Opus 5.5 لي أنا بس… كل الانثروبك خلها لي المالك
   اختار… وتحطهم نفس المستويات»): للمالك وحده — (١) افتراضيّه Opus 5.5، (٢) كلّ نماذج كلود النشطة (الأربعة الرئيسيّة ثمّ «نماذج أخرى»)،
   (٣) «الجهد» Low/Medium/High/Extra/Max (+ تلقائي) يصل output_config.effort. غير المالك: طلبه بايتًا بايتًا كما كان.
   المعالج الحقيقيّ (api/_lib/chat.js) أمام مزوّد مزيّف يسجّل كلّ طلب، وأجزاء العميل الحقيقيّة في vm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.OWNER_CLAUDE_CHAT = 'on'; // v-claude-chat-off: ردّ Claude للمالك موقوف افتراضيًّا — هذا الاختبار يفحص مساره حين يُعاد تشغيله
process.env.AUTH_SECRET = 'owner-claude-all-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'CHAT_OPENAI_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_IMAGE_MODEL', 'CHAT_IMAGE_EFFORT', 'KIMI_API_KEY', 'MOONSHOT_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const db = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetJSON: async (key) => db.has(key) ? structuredClone(db.get(key)) : null,
  kvPutJSON: async (key, value) => { db.set(key, structuredClone(value)); },
  kvDel: async (key) => { db.delete(key); },
  kvExpire: async () => {},
} };
let usageUser = 'omran';
require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: usageUser }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const chat = require(rp('api/_lib/chat.js'));
const ot = require(rp('api/_lib/owner-think.js'));
const OL = require(rp('api/_lib/owner-loop.js'));

const ALL = [['claude-opus-5-5', 'Opus 5.5', 'anthropic/claude-opus-5.5'], ['claude-fable-5-1', 'Fable 5.1', 'anthropic/claude-fable-5.1'], ['claude-sonnet-5-5', 'Sonnet 5.5', 'anthropic/claude-sonnet-5.5'], ['claude-haiku-5-5', 'Haiku 5.5', 'anthropic/claude-haiku-5.5'],
  ['claude-haiku-4-5', 'Haiku 4.5', 'anthropic/claude-haiku-4.5'], ['claude-sonnet-5', 'Sonnet 5', 'anthropic/claude-sonnet-5'], ['claude-opus-5', 'Opus 5', 'anthropic/claude-opus-5'], ['claude-fable-5', 'Fable 5', 'anthropic/claude-fable-5'],
  ['claude-opus-4-8', 'Opus 4.8', 'anthropic/claude-opus-4.8'], ['claude-opus-4-7', 'Opus 4.7', 'anthropic/claude-opus-4.7'], ['claude-opus-4-6', 'Opus 4.6', 'anthropic/claude-opus-4.6'], ['claude-sonnet-4-6', 'Sonnet 4.6', 'anthropic/claude-sonnet-4.6']];
const IDS = ALL.map((m) => m[0]);

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
const sse = (chunks) => new Response(chunks.map((c) => 'data: ' + JSON.stringify(c) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const text = (t) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const err400 = (message) => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }), { status: 400 });
const ask = (t) => [{ role: 'user', content: t }];
const HARD = 'احسب الفائدة المركّبة على ١٠ آلاف';

function reset() { ot.__deadEffort.clear(); chat.__orQuick.level = 2; for (const k of [...db.keys()]) if (/deadpick/.test(k)) db.delete(k); if (OL.__deadPicks && OL.__deadPicks.clear) OL.__deadPicks.clear(); }
async function run(user, extra, script) {
  usageUser = user;
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    const step = script ? script[Math.min(i++, script.length - 1)] : null;
    return step ? (typeof step === 'function' ? step() : step) : text('تم');
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user), provider: 'claude' }, extra) };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {}, flush() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, events };
}
const withoutAnth = async (fn) => { const k = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; try { return await fn(); } finally { process.env.ANTHROPIC_API_KEY = k; } };

test('١. المالك بلا اختيار = Opus 5.5 على المفتاح المباشر وعلى الوسيط، باسمه في شارة الردّ', async () => {
  reset();
  let r = await run('omran', { messages: ask(HARD) });
  assert.equal(r.calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.calls[0].body.model, 'claude-opus-5-5');
  assert.ok(r.events.some((e) => e.modelLabel === 'Opus 5.5'), 'الشارة تسمّي الموديل');
  r = await withoutAnth(() => run('omran', { messages: ask(HARD) }));
  assert.equal(r.calls[0].url, 'https://openrouter.ai/api/v1/messages');
  assert.equal(r.calls[0].body.model, 'anthropic/claude-opus-5.5');
  assert.equal(r.calls[0].body.max_tokens, 128000, 'بلا جهد مختار: سقف المالك المفتوح (v-owner-cap-open)');
});

test('٢. النماذج الاثنا عشر كلّها للمالك بمعرّفاتها الرسميّة على المسارين، وOpus 5 مستقلّ', async () => {
  reset();
  assert.deepEqual(Object.keys(chat.__vmodels.CLAUDE_MODELS), IDS);
  for (const [id, label, or] of ALL) {
    let r = await run('omran', { model: id, messages: ask(HARD) });
    assert.equal(r.calls[0].body.model, id, id);
    assert.ok(r.events.some((e) => e.modelLabel === label), label);
    r = await withoutAnth(() => run('omran', { model: id, messages: ask(HARD) }));
    assert.equal(r.calls[0].body.model, or, or);
  }
});

test('٣. غير المالك: اختيار موديل وجهد يُتجاهلان — الطلب نفسه بايتًا بايتًا (Haiku 4.5، بلا effort ولا thinking، 16000)', async () => {
  reset();
  const norm = (b) => JSON.stringify(b).replace(/\d{1,2}:\d{2}/g, 'HH:MM');
  for (const q of [ask('السلام'), ask(HARD)]) {
    const a = await run('someone', { messages: q });
    const b = await run('someone', { messages: q, model: 'claude-opus-5-5', effort: 'max' });
    assert.ok(a.calls.length >= 1 && b.calls.length === a.calls.length);
    assert.equal(norm(b.calls[0].body), norm(a.calls[0].body));
    assert.equal(b.calls[0].body.model, 'claude-haiku-4-5');
    assert.equal(b.calls[0].body.output_config, undefined);
    assert.equal(b.calls[0].body.thinking, undefined);
    assert.ok(!('effort' in b.calls[0].body));
  }
});

test('٤. الوحدة claudeEffortFields: Extra = xhigh، سقف ٦٤ ألفًا عند xhigh/max، تكيّفيّ للجيل ٤، وبلا Haiku 4.5', () => {
  reset();
  const F = ot.claudeEffortFields;
  assert.deepEqual(F('claude-opus-5-5', 'low'), { output_config: { effort: 'low' } });
  assert.deepEqual(F('claude-opus-5-5', 'medium'), { output_config: { effort: 'medium' } });
  assert.deepEqual(F('claude-opus-5-5', 'high'), { output_config: { effort: 'high' } });
  assert.deepEqual(F('claude-opus-5-5', 'xhigh'), { output_config: { effort: 'xhigh' }, max_tokens: 64000 });
  assert.deepEqual(F('anthropic/claude-fable-5.1', 'max'), { output_config: { effort: 'max' }, max_tokens: 64000 }, 'صيغة الوسيط تُطبَّع');
  // مراجعة: الوسيط يحجز رصيد max_tokens كاملًا قبل التشغيل (رصيد قليل = 402) — سقفه يبقى ١٦٠٠٠
  assert.deepEqual(F('anthropic/claude-opus-5.5', 'max', true), { output_config: { effort: 'max' } });
  for (const id of ['claude-fable-5-1', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-sonnet-5', 'claude-opus-5', 'claude-fable-5']) assert.deepEqual(F(id, 'high'), { output_config: { effort: 'high' } }, id + ': الجيل ٥ يفكّر بلا الحقل');
  for (const id of ['claude-opus-4-8', 'claude-opus-4-7']) assert.deepEqual(F(id, 'xhigh'), { output_config: { effort: 'xhigh' }, max_tokens: 64000, thinking: { type: 'adaptive' } }, id);
  for (const id of ['claude-opus-4-6', 'claude-sonnet-4-6']) {
    assert.deepEqual(F(id, 'xhigh'), { output_config: { effort: 'high' }, thinking: { type: 'adaptive' } }, id + ': بلا xhigh');
    assert.deepEqual(F(id, 'max'), { output_config: { effort: 'max' }, max_tokens: 64000, thinking: { type: 'adaptive' } }, id);
  }
  for (const lvl of ['low', 'medium', 'high', 'xhigh', 'max']) assert.equal(F('claude-haiku-4-5', lvl), null, 'Haiku 4.5 بلا جهد');
  for (const bad of ['', null, undefined, 'ultra', 'extra', '__proto__']) assert.equal(F('claude-opus-5-5', bad), null, String(bad));
  assert.deepEqual(F('claude-opus-5-5', ' MAX '), { output_config: { effort: 'max' }, max_tokens: 64000 }, 'تطبيع المسافات والحالة');
  assert.equal(F('gpt-6-sol', 'high'), null, 'غير كلود');
  ot.forgetEffort('claude-opus-5-5');
  assert.equal(F('claude-opus-5-5', 'high'), null, 'موديل رفض الجهد لا يُرسل له ثانيةً');
  reset();
  assert.ok(OL.DISPLAY_RE.test('claude-sonnet-5-5') && OL.DISPLAY_RE.test('claude-opus-4-8') && OL.DISPLAY_RE.test('claude-haiku-5-5') && !OL.DISPLAY_RE.test('claude-haiku-4-5'));
});

test('٥. الجهد المختار يصل الطلب ويغلب التلقائيّ: التحيّة بجهد المالك، والصعب بعرض التفكير، والجيل ٤ تكيّفيًّا', async () => {
  reset();
  // Opus 5.5 + Extra على تحيّة: الجهد المختار لا low التلقائيّ، وبلا عرض (المجاملة لا تُظهر تفكيرًا)
  let r = await run('omran', { messages: ask('السلام'), effort: 'xhigh' });
  assert.equal(r.calls[0].body.model, 'claude-opus-5-5');
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'xhigh' });
  assert.equal(r.calls[0].body.max_tokens, 128000); // v-owner-cap-open
  assert.equal(r.calls[0].body.thinking, undefined);
  // سؤال صعب: الجهد + عرض التفكير الملخّص على المسار المباشر
  r = await run('omran', { messages: ask(HARD), effort: 'max' });
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'max' });
  assert.deepEqual(r.calls[0].body.thinking, { type: 'adaptive', display: 'summarized' });
  // Opus 4.8: تكيّفيّ مع الجهد في التحيّة، ومع العرض في الصعب
  r = await run('omran', { model: 'claude-opus-4-8', messages: ask('السلام'), effort: 'high' });
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'high' });
  assert.deepEqual(r.calls[0].body.thinking, { type: 'adaptive' });
  assert.equal(r.calls[0].body.max_tokens, 128000); // v-owner-cap-open: سقف المالك في كلّ جهد
  r = await run('omran', { model: 'claude-opus-4-8', messages: ask(HARD), effort: 'high' });
  assert.deepEqual(r.calls[0].body.thinking, { type: 'adaptive', display: 'summarized' });
  // Opus 4.6: Extra → high
  r = await run('omran', { model: 'claude-opus-4-6', messages: ask(HARD), effort: 'xhigh' });
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'high' });
  // Haiku 4.5: الجهد يُتجاهل كلّيًّا
  r = await run('omran', { model: 'claude-haiku-4-5', messages: ask(HARD), effort: 'max' });
  assert.equal(r.calls[0].body.output_config, undefined);
  assert.equal(r.calls[0].body.thinking, undefined);
  assert.equal(r.calls[0].body.max_tokens, 128000); // v-owner-cap-open
  // الوسيط: الجهد يصل بالحقل نفسه، والعرض الملخّص كالمباشر (v-or-display — كان بلا عرض فلا «↳ 💭» على الوسيط)
  r = await withoutAnth(() => run('omran', { model: 'claude-sonnet-5-5', messages: ask(HARD), effort: 'medium' }));
  assert.equal(r.calls[0].body.model, 'anthropic/claude-sonnet-5.5');
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'medium' });
  assert.deepEqual(r.calls[0].body.thinking, { type: 'adaptive', display: 'summarized' });
  // مراجعة GPT: السقف الكبير على الوسيط أيضًا (بدونه يأكل التفكير الردّ)، و402 «can only afford» = إعادة واحدة بالسقف العاديّ وسطر السبب
  r = await withoutAnth(() => run('omran', { messages: ask(HARD), effort: 'max' }));
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'max' });
  assert.equal(r.calls[0].body.max_tokens, 128000); // v-owner-cap-open
  r = await withoutAnth(() => run('omran', { messages: ask(HARD), effort: 'max' }, [() => new Response(JSON.stringify({ error: { message: 'This request requires more credits, or fewer max_tokens. You requested up to 64000 tokens, but can only afford 9000.', code: 402 } }), { status: 402 }), () => text('تم')]));
  assert.deepEqual(r.calls.map((c) => c.body.max_tokens), [128000, 9000]); // v-cap-not-credit: حدّ الرصيد من الرسالة لا ١٦ ألفًا
  assert.deepEqual(r.calls[1].body.output_config, { effort: 'max' }, 'الجهد نفسه');
  assert.ok(r.events.some((e) => /رصيد الوسيط لا يكفي/.test(e.status || '')));
  // مراجعة: دور صورة بموديل CHAT_IMAGE_MODEL آخر لا يأخذ جهدًا حُسب لموديل المحادثة (Haiku 4.5 يرفضه = 400)
  process.env.CHAT_IMAGE_MODEL = 'claude-haiku-4-5';
  try {
    r = await run('omran', { messages: [{ role: 'user', content: [{ type: 'text', text: 'وش في الصورة؟' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] }], effort: 'high' });
    assert.equal(r.calls[0].body.model, 'claude-haiku-4-5');
    assert.equal(r.calls[0].body.output_config, undefined, 'لا جهد لموديل الصورة المختلف');
    assert.equal(r.calls.length, 1, 'بلا 400 ولا إعادة');
  } finally { delete process.env.CHAT_IMAGE_MODEL; }
  // قيمة غير معروفة = التلقائيّ كما كان (التحيّة low)
  r = await run('omran', { messages: ask('السلام'), effort: 'ultra' });
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'low' });
  assert.equal(r.calls[0].body.max_tokens, 128000); // v-owner-cap-open
});

test('٦. 400 على الجهد = إعادة فوريّة بالموديل نفسه بلا الجهد، بلا رجوع للافتراضيّ، ويُذكر الرفض', async () => {
  reset();
  const r = await run('omran', { model: 'claude-opus-4-6', messages: ask(HARD), effort: 'max' }, [() => err400('effort max is not supported for this model'), () => text('تم')]);
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[1].body.model, 'claude-opus-4-6', 'الموديل نفسه');
  assert.equal(r.calls[1].body.output_config, undefined, 'بلا الجهد المرفوض');
  assert.ok(!r.events.some((e) => e.k === 'stModelFallback'), 'لا رجوع للافتراضيّ');
  assert.ok(ot.__deadEffort.has('claude-opus-4-6'));
  reset();
});

test('٦ب. افتراضيّ المالك غير موجود على المفتاح (404) يُذكر: الرسالة التالية Haiku مباشرة بلا نداء فاشل يتكرّر', async () => {
  reset();
  const notFound = () => new Response(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'model: claude-opus-5-5' } }), { status: 404 });
  let r = await run('omran', { messages: ask(HARD) }, [notFound, () => text('تم')]);
  assert.deepEqual(r.calls.map((c) => c.body.model), ['claude-opus-5-5', 'claude-haiku-4-5']);
  assert.ok(r.events.some((e) => e.k === 'stModelFallback'));
  r = await run('omran', { messages: ask(HARD) });
  assert.deepEqual(r.calls.map((c) => c.body.model), ['claude-haiku-4-5'], 'لا نداء فاشل ثانٍ');
  assert.ok(r.events.some((e) => e.k === 'stModelFallback'), 'السبب ظاهر');
  // اختيار صريح فشل بـ404: العميل يمسحه (deadModel) — لا يُذكر على الخادم (الذاكرة لرفض الصلاحيّة كما كانت)
  reset();
  r = await run('omran', { model: 'claude-fable-5', messages: ask(HARD) }, [() => new Response(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'model: claude-fable-5' } }), { status: 404 }), () => text('تم')]);
  assert.ok(r.events.some((e) => e.deadModel === 'claude-fable-5'));
  assert.equal(await OL.isDeadPick('claude-fable-5'), false);
  reset();
});

// ——— العميل ———
function appCtx(user, store) {
  const ls = { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const ctx = { localStorage: ls, document: { readyState: 'complete', addEventListener() {}, getElementById: () => null }, omranOwnerUi: () => user === 'omran' };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-29-claude-model.js'), ctx);
  return ctx;
}

test('٧. app-29: المالك يرى الاثني عشر ويحفظ أيّها (Opus 5 بلا ترقية) وجهده؛ غير المالك على قائمته القديمة وترقيتها', () => {
  let store = {};
  let w = appCtx('omran', store);
  assert.deepEqual(Array.from(w.CLAUDE_OWNER_MODEL_IDS), IDS);
  assert.equal(w.claudeModelGet(), '', 'بلا اختيار = الخادم يقرّر (Opus 5.5)');
  for (const id of IDS) { store.aiapp_claude_model = id; assert.equal(w.claudeModelGet(), id, id); }
  store.aiapp_claude_model = 'claude-opus-5';
  assert.equal(w.claudeModelGet(), 'claude-opus-5');
  assert.equal(store.aiapp_claude_model, 'claude-opus-5', 'لا ترقية للمالك');
  store.aiapp_claude_model = 'claude-opus-4-5'; assert.equal(w.claudeModelGet(), '', 'غير المعروف يسقط');
  // الجهد
  delete store.aiapp_claude_model;
  assert.equal(w.claudeEffortGet(), '', 'تلقائيّ افتراضيًّا');
  for (const v of ['low', 'medium', 'high', 'xhigh', 'max']) { assert.equal(w.claudeEffortSet(v), v); assert.equal(w.claudeEffortGet(), v); }
  assert.equal(w.claudeEffortSet('ultra'), ''); assert.equal(store.aiapp_claude_effort, undefined, 'قيمة غير معروفة تمسح');
  w.claudeEffortSet('xhigh');
  store.aiapp_claude_model = 'claude-opus-4-6'; assert.equal(w.claudeEffortGet(), 'high', 'Opus 4.6 بلا Extra');
  store.aiapp_claude_model = 'claude-haiku-4-5'; assert.equal(w.claudeEffortGet(), '', 'Haiku 4.5 بلا جهد');
  assert.equal(w.claudeEffortSaved(), 'xhigh', 'المحفوظ يبقى لموديل يدعمه');
  // ترحيل مرّة واحدة: المحفوظ قبل اليوم (Sonnet 5 الذي كان إغلاق الإعدادات يكتبه) يُمسح فيسري Opus 5.5؛ وبعدها يبقى الاختيار
  store = { aiapp_claude_model: 'claude-sonnet-5' };
  w = appCtx('omran', store);
  assert.equal(w.claudeModelGet(), '', 'الافتراضيّ الجديد');
  assert.equal(store.aiapp_owner_opus55_v1, '1');
  store.aiapp_claude_model = 'claude-sonnet-5';
  assert.equal(w.claudeModelGet(), 'claude-sonnet-5', 'اختيار بعد الترحيل يبقى');
  // غير المالك: الترقية القديمة قراءةً فقط (لا تمحو «Opus 5» المحفوظ للمالك على الجهاز نفسه)
  store = { aiapp_claude_model: 'claude-opus-5', aiapp_claude_effort: 'max' };
  w = appCtx('someone', store);
  assert.deepEqual(Array.from(w.CLAUDE_MODEL_IDS), ['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5-1']);
  assert.equal(w.claudeModelGet(), 'claude-opus-5-5', 'ترقيته القديمة كما كانت');
  assert.equal(store.aiapp_claude_model, 'claude-opus-5', 'بلا كتابة');
  store.aiapp_claude_model = 'claude-opus-4-8'; assert.equal(w.claudeModelGet(), '', 'الجديدة ليست له');
  assert.equal(w.claudeEffortGet(), '', 'لا جهد لغير المالك');
});

test('٨. app-18: حقل effort يُرسل حين يختاره المالك فقط، وإلّا يسقط من JSON (طلب غير المالك كما كان)', async () => {
  const core = read('js/app-18-chat-tools.js');
  const app18Core = core.slice(0, core.indexOf('// v478:'));
  async function body(eff) {
    let sent = null;
    const ctx = { window: { authGet: () => 'tok', claudeModelGet: () => 'claude-opus-5-5', claudeEffortGet: () => eff },
      fetch: async (u, init) => { sent = init.body; return new Response('data: {"done":true}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }); },
      TextDecoder, setTimeout, clearTimeout, Promise, Error, String, JSON, Date, Array, Math, console, Intl, Object, Number, RegExp };
    vm.runInNewContext(app18Core, ctx);
    try { await ctx.window.callChatWithTools([{ role: 'user', content: 'x' }], null, 'claude'); } catch (e) { /* الردّ المزيّف قصير — يكفينا الجسم المرسل */ }
    return sent;
  }
  assert.equal(JSON.parse(await body('xhigh')).effort, 'xhigh');
  const none = await body('');
  assert.ok(!/"effort"/.test(none), 'بلا جهد = لا مفتاح effort');
  assert.equal(JSON.parse(none).model, 'claude-opus-5-5');
});

test('٩. modes.js: كلّ نماذج كلود بمجموعتيها، وصفّ «الجهد» بستّ قيم، و«نماذج أخرى» مطويّة؛ وافتراضيّ المالك Opus 5.5', () => {
  const m = read('js/modes.js');
  const i = m.indexOf('var PROVS = ['), j = m.indexOf('\n      ];', i);
  const PROVS = new Function('return ' + m.slice(i + 'var PROVS = '.length, j + '\n      ]'.length))();
  const cl = PROVS.find((p) => p.key === 'claude');
  assert.equal(cl.def, 'claude-opus-5-5');
  assert.equal(cl.effort, true);
  assert.deepEqual(cl.models.map((x) => x[0]), IDS);
  assert.deepEqual(cl.models.filter((x) => x[2] !== 1).map((x) => x[1]), ['Opus 5.5', 'Fable 5.1', 'Sonnet 5.5', 'Haiku 5.5'], 'الرئيسيّة كمنتقي Claude');
  assert.deepEqual(cl.models.filter((x) => x[2] === 1).map((x) => x[1]), ['Haiku 4.5', 'Sonnet 5', 'Opus 5', 'Fable 5', 'Opus 4.8', 'Opus 4.7', 'Opus 4.6', 'Sonnet 4.6'], '«نماذج أخرى»');
  // provsHTML الحقيقيّ
  const a = m.indexOf('      var ROW = '), b = m.indexOf('      /* v-cc-remove', a);
  const html = new Function('PROVS', 'AR', 't', m.slice(a, b) + '; return provsHTML();')(PROVS, true, (k) => k);
  const box = html.slice(html.indexOf('class="omProvModels" data-for="claude"'), html.indexOf('class="omProvHead" data-prov="openai"'));
  const effs = [...box.matchAll(/class="omEffortOpt" data-effort="([a-z]*)"/g)].map((x) => x[1]);
  assert.deepEqual(effs, ['', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.ok(/<span data-i18n="effortExtra">إضافيّ<\/span>/.test(box), 'Extra بالعربيّة');
  const more = box.slice(box.indexOf('class="omProvMore"'));
  assert.ok(/class="omProvMore" data-for="claude" hidden/.test(box), 'مطويّة');
  for (const id of ['claude-haiku-4-5', 'claude-opus-4-6', 'claude-sonnet-4-6']) assert.ok(more.includes('data-model="' + id + '"'), id);
  assert.ok(box.indexOf('omEffortHead') < box.indexOf('omMoreHead') && box.indexOf('data-model="claude-haiku-5-5"') < box.indexOf('omEffortHead'), 'الترتيب: الرئيسيّة ثمّ الجهد ثمّ نماذج أخرى');
  assert.ok(!/omEffortHead|omMoreHead/.test(html.slice(html.indexOf('class="omProvHead" data-prov="gemini"'))), 'بقيّة المزوّدين كما كانوا (GPT له صفّه — owner-gpt-all)');
  assert.ok(m.includes("querySelectorAll('.omProvModels, .omProvMore, .omEffortBox')"), 'الطيّ يشمل الصناديق الفرعيّة');
  assert.ok(m.includes("querySelectorAll('.omProvChev, .omMoreChev, .omEffortChev')") && /class="omEffortChev"[^>]*>▸</.test(box), 'سهم الجهد كبقيّة الصفوف (لا ‹ ثابت)');
  assert.ok(m.includes("if(isOwner()) renderPop();"), 'المنتقي يُبنى للمالك وحده');
});

test('١٠. الإعدادات لا تكتب فوق اختيار المالك، ونصوص المنتقي بالـ١٤ لغة والوسوم مرفوعة', () => {
  const a6 = read('js/app-06-checkout.js');
  assert.ok(a6.includes("if (!(typeof omranOwnerUi === 'function' && omranOwnerUi())) localStorage.setItem('aiapp_claude_model', $('#claudeModel').value.trim() || 'claude-sonnet-5');"));
  const K = ['effortLabel', 'effortAuto', 'effortLow', 'effortMedium', 'effortHigh', 'effortExtra', 'effortMax', 'otherModelsLabel'];
  const d = read('js/app-03-i18n-data.js');
  for (const k of K) assert.equal(d.split(k + ": '").length - 1, 2, k + ' عربيّ وإنجليزيّ');
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const f = read('i18n/' + lg + '.js');
    for (const k of K) assert.ok(f.includes('"' + k + '":'), lg + ' ' + k);
  }
  assert.ok(read('js/app-04-i18n-state.js').includes("sc.src = 'i18n/' + lg + '.js?v=775';"));
  assert.ok(read('index.html').includes('/js/modes.js?v=m211026'));
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('window.claudeEffortGet = effortGet;') && bundle.includes("return (__p === 'claude' && window.claudeEffortGet) ? (window.claudeEffortGet() || undefined)"), 'الحزمة أُعيد بناؤها');
});
