// tests/fallback-limit-stop.test.cjs — v-limit-chain-stop (تدقيق ١٨–١٩ أكتوبر، g06 chat-build-app وreligion): طلب بناء بعد الحدّ
// أطلق ٤ طلبات كلّها 402، و«التفسير الديني» ٥ — callAIWithFallback يعلّم حدّنا planLimit (v-plans-gate) ثمّ يكمل للمزوّد التالي،
// والمزوّدون المجّانيّون في سلّة 'chat' واحدة فكلّ نداء بعد الأوّل 402 مضمون، ثمّ يُلصق «(الاحتياط فشل أيضًا…)» بالرسالة.
// الآن: 402 حدّنا بلا subscribeOnly ولا engine_limit (السلّة المشتركة امتلأت) يوقف السلسلة فورًا؛ وبعد 402 subscribeOnly (مزوّد
// مدفوع أمام مجّانيّ) تُتخطّى بقيّة المدفوعين فيصل المجّانيّ إلى المجّانيّين؛ وengine_limit يكمل كما كان (v-model-lock).
// وجسم 402 في gemini/groq/openai يحمل طبقة الحساب، فيعرف العميل أنّه حدّ المجّانيّ لا حدّ باقة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const a6 = read('js/app-06-checkout.js');
const slice = (from, to) => { const s = a6.indexOf(from); const e = a6.indexOf(to, s + from.length); assert.ok(s > 0 && e > s, from); return a6.slice(s, e); };

const PAID = ['claude', 'openai', 'deepseek', 'cohere', 'perplexity'];
// خادم مزيّف: حساب بطبقته وهل بلغ سلّته اليوميّة — كما _usage.js (المدفوع لغير المشترك يُرفض قبل أيّ عدّ)
function makeCtx(who, plan) {
  const calls = [];
  const ctx = {
    console: { warn() {}, log() {} }, JSON, Object, String, Number, Array, Error, Promise, Date, Math,
    t: (k) => k, __swallow() {},
    localStorage: { getItem: () => null },
    omranOwnerUi: () => false, omranDefaultProv: () => 'openai',
    FUNCTIONAL_GROUPS: { claude: ['claude'], gemini: ['gemini', 'groq'], openai: ['openai', 'perplexity'] },
    AUTO_FALLBACK_ORDER: ['claude', 'gemini', 'openai', 'groq'],
    TOOL_PROVIDERS: ['claude', 'openai', 'gemini', 'deepseek'],
    window: { __omranPlan: plan },
    functionalLabel: (k) => k, isRefusalReply: () => false,
    __idleGuard: (p) => p, __FALLBACK_IDLE_MS: 1000,
    callProviderAI: async (prov) => {
      calls.push(prov);
      const r = who(prov);
      if (r.ok) return r.ok;
      ctx.throwProviderError(r.status, r.body);
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(slice('function throwProviderError(', 'function toOpenAIVisionMessages(') + '\n' + slice('async function callAIWithFallback(', '\n// ⚠️ ٦ أغسطس'), ctx);
  return { ctx, calls };
}
const lim = (tier, subscribeOnly) => ({ status: 402, body: JSON.stringify({ error: 'وصلت للحد', subscribeOnly, tier }) });
async function run(who, plan, preferred, opts) {
  const { ctx, calls } = makeCtx(who, plan);
  try { const r = await ctx.callAIWithFallback([{ role: 'user', content: 'ابني آلة حاسبة' }], null, preferred, opts); return { r, calls }; }
  catch (err) { return { err, calls }; }
}

test('١. مجّانيّ بلغ حدّه: نداءان لا خمسة (المدفوع يرفضه، أوّل مجّانيّ يقول «السلّة امتلأت» فتقف السلسلة)', async () => {
  const freeCapped = (p) => PAID.includes(p) ? lim('free', true) : lim('free', false);
  for (const [preferred, opts, want] of [
    [null, { taskPrompt: true }, ['openai', 'gemini']], // التفسير الديني: openai, perplexity, claude, gemini, groq = ٥ قبل الإصلاح
    [['claude', 'openai', 'gemini', 'groq'], undefined, ['claude', 'gemini']], // طلب البناء: ٤ قبل الإصلاح
  ]) {
    const { err, calls } = await run(freeCapped, 'free', preferred, opts);
    assert.deepEqual(calls, want, 'النداءات');
    assert.ok(err && err.planLimit, 'planLimit');
    assert.equal(err.limitTier, 'free');
    assert.equal(err.status, 402);
    assert.doesNotMatch(String(err.message), /الاحتياط فشل أيضًا|fallback failed too/, 'لا ذيل «الاحتياط فشل»');
  }
});

test('٢. مشترك بلغ سلّة باقته: نداء واحد', async () => {
  const { err, calls } = await run(() => lim('sub', false), 'pro', ['claude', 'openai', 'gemini', 'groq']);
  assert.deepEqual(calls, ['claude']);
  assert.ok(err.planLimit);
  assert.equal(err.limitTier, 'sub');
  // جسم قديم بلا طبقة: الحدّ نفسه ونداء واحد
  const old = await run(() => ({ status: 402, body: '{"subscribeOnly":false}' }), '', ['gemini', 'groq']);
  assert.deepEqual(old.calls, ['gemini']);
  assert.ok(old.err.planLimit);
});

test('٣. مجّانيّ تحت حدّه: بعد رفض المدفوع تُتخطّى بقيّة المدفوعين ويجيب المجّانيّ', async () => {
  const who = (p) => PAID.includes(p) ? lim('free', true) : p === 'gemini' ? { status: 503, body: 'busy' } : { ok: 'أهلًا' };
  const { r, calls } = await run(who, 'free', null, { taskPrompt: true });
  assert.deepEqual(calls, ['openai', 'gemini', 'groq'], 'perplexity وclaude لا يُسألان بعد رفض المدفوع');
  assert.equal(r.reply, 'أهلًا');
  assert.equal(r.providerKey, 'groq');
});

test('٤. engine_limit (حدّ محرّك الكود في الباقة) يكمل للتالي كما كان', async () => {
  const who = (p) => p === 'claude' ? { status: 402, body: JSON.stringify({ error: 'x', reason: 'engine_limit' }) } : { ok: 'تم' };
  const { r, calls } = await run(who, 'pro', ['claude', 'openai']);
  assert.deepEqual(calls, ['claude', 'openai']);
  assert.equal(r.providerKey, 'openai');
});

test('٥. قائمة المدفوعين في العميل مرآة PAID_PROVIDERS في الخادم', () => {
  const m = a6.match(/const __paidProv = (\[[^\]]*\]);/);
  assert.ok(m, '__paidProv في callAIWithFallback');
  const client = JSON.parse(m[1].replace(/'/g, '"'));
  const server = require(path.join(root, 'api/_lib/tier.js')).PAID_PROVIDERS;
  assert.deepEqual(client.slice().sort(), server.filter((p) => p !== 'agent').sort());
});

// المعالجات الحقيقيّة مع checkAndConsume مزيّف: جسم 402 يحمل الطبقة
process.env.AUTH_SECRET = 'limit-chain-secret';
process.env.GEMINI_API_KEY = 'g-test';
process.env.GROQ_API_KEY = 'gq-test';
process.env.OPENAI_API_KEY = 'oa-test';
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
let USAGE = null;
mock('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => USAGE, todayCount: async () => 0, bumpCount: async () => {} });
mock('api/_lib/kv.js', { kvGetRaw: async () => null, kvGetJSON: async () => null, kvPutJSON: async () => {}, kvPipeline: async (c) => c.map(() => null) });
global.fetch = async () => { throw new Error('لا نداء للمزوّد بعد الحدّ'); };
async function hit(file, body) {
  const h = require(rp('api/_lib/' + file));
  const res = { code: 200, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, send(b) { res.j = b; return res; }, end() { return res; }, write() {}, flushHeaders() {} };
  await h({ method: 'POST', headers: {}, body: Object.assign({ messages: [{ role: 'user', content: 'هلا' }], contents: [{ role: 'user', parts: [{ text: 'هلا' }] }] }, body) }, res);
  return res;
}

test('٦. gemini وgroq وopenai: جسم 402 يحمل tier بجانب subscribeOnly ونصّ الخادم كما هو', async () => {
  for (const f of ['gemini.js', 'groq.js', 'openai.js']) {
    USAGE = { allowed: false, reason: 'limit', username: 'fay', tier: 'free', subscriber: false, limit: 3, message: 'انتهت رسائلك المجانية لليوم.' };
    let res = await hit(f, { token: 't' });
    assert.equal(res.code, 402, f);
    assert.deepEqual(res.j, { error: 'انتهت رسائلك المجانية لليوم.', subscribeOnly: false, tier: 'free' }, f);
    USAGE = { allowed: false, reason: 'limit', subscribeOnly: true, username: null, tier: 'guest', subscriber: false, message: 'x' };
    res = await hit(f, { token: 't' });
    assert.deepEqual([res.code, res.j.subscribeOnly, res.j.tier], [402, true, 'guest'], f + ': الضيف');
  }
});
