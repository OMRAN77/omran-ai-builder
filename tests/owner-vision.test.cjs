'use strict';
/* v-owner-vision (المالك ٦ أكتوبر: «كلّ واحد يحلّل ويفحص ويشوف كلّ شي… مش عند المشتركين… أنا المالك عند اختيار أيّ
   مزوّد»): صورة المالك تصل إلى المزوّد الذي اختاره بموديل رؤيته — لا تُحوَّل إلى كلود، ولا يصفها Gemini وحده.
   المشتركون وVIP والمجّانيّ كما كانوا. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
process.env.AUTH_SECRET = 'owner-vision-test';
const usage = { allowed: true, username: 'omran' };
require.cache[rp('api/_lib/_usage.js')] = { exports: {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => usage,
  todayCount: async () => 0, bumpCount: async () => {},
} };
require.cache[rp('api/_lib/_knowledge.js')] = { exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { exports: { fetchPlaces: async () => [] } };
require.cache[rp('api/_lib/kv.js')] = { exports: { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {} } };
require.cache[rp('api/_lib/_owner-alert.js')] = { exports: { alertOwnerCredit: async () => {} } };
const tier = require(rp('api/_lib/tier.js'));
const chat = require(rp('api/_lib/chat.js'));
const ov = require(rp('api/_lib/owner-vision.js'));
const realTier = tier.resolveTier;

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const anth = () => new Response([
  { type: 'message_start', message: { model: 'served', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'أرى الصورة' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
  { type: 'message_stop' },
].map((x) => 'data: ' + JSON.stringify(x) + '\n\n').join(''), { status: 200 });
const oa = () => new Response('data: ' + JSON.stringify({ model: 'served', choices: [{ delta: { content: 'أرى الصورة' } }] }) + '\n\ndata: '
  + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { status: 200 });
const KEYS = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'MISTRAL_API_KEY',
  'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_GROQ_MODEL', 'CHAT_KIMI_MODEL', 'CHAT_CLAUDE_MODEL'];
const OWNER = { tier: 'owner', subscriber: true };

async function ask({ keys = {}, provider, model = '', who = 'omran', account = OWNER, image = true, upstream }) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, keys);
  usage.allowed = true; usage.reason = '';
  usage.tier = account.tier; usage.subscriber = !!account.subscriber; usage.username = who;
  tier.resolveTier = async () => account;
  const calls = [];
  const prev = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    calls.push({ url: u, body: JSON.parse(opts.body) });
    const custom = upstream ? upstream(u, calls.length) : null;
    if (custom) return custom;
    return /api\.groq|googleapis|api\.moonshot/.test(u) ? oa() : anth();
  };
  let text = '';
  const res = { setHeader() {}, status() { return this; }, flushHeaders() {}, json() {}, write(x) { text += x; }, end() {}, flush() {} };
  const content = image
    ? [{ type: 'text', text: 'وش في الصورة؟' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }]
    : 'مرحبا';
  try { await chat({ method: 'POST', headers: {}, body: { token: token(who), provider, model, messages: [{ role: 'user', content }] } }, res); }
  finally { global.fetch = prev; tier.resolveTier = realTier; for (const k of KEYS) delete process.env[k]; }
  const events = text.split('\n\n').map((l) => l.replace(/^data: /, '')).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return {}; } });
  return { calls, text, events };
}
const anthImage = (call) => call.body.messages.at(-1).content.find((b) => b && b.type === 'image');
const oaImage = (call) => (call.body.messages.at(-1).content || []).find((b) => b && b.type === 'image_url');

test('visionPlan: كلّ مزوّد له موديل يرى على مساره، والمزوّد المجهول أو المسار الغائب = null', () => {
  assert.deepEqual(ov.visionPlan('deepseek', 'or', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-pro'),
    { model: 'deepseek/deepseek-v4-flash-vision-exp', def: 'deepseek/deepseek-v4-flash-vision-exp', forced: true });
  assert.equal(ov.visionPlan('cohere', 'or', 'cohere/command-a', 'cohere/command-a').model, 'cohere/command-a-plus');
  assert.equal(ov.visionPlan('groq', 'direct', 'openai/gpt-oss-120b', 'openai/gpt-oss-120b').model, 'qwen/qwen3.6-27b');
  assert.equal(ov.visionPlan('kimi', 'or', 'moonshotai/kimi-k2', 'moonshotai/kimi-k2').model, 'moonshotai/kimi-k3');
  // موديل يرى أصلًا: اختيار المالك يبقى، والافتراضيّ احتياطه
  assert.deepEqual(ov.visionPlan('openrouter', 'or', 'x-ai/grok-4.6', 'anthropic/claude-sonnet-5'),
    { model: 'x-ai/grok-4.6', def: 'anthropic/claude-sonnet-5', forced: false });
  assert.equal(ov.visionPlan('kimi', 'direct', 'kimi-k2.6', 'kimi-k3').model, 'kimi-k2.6');
  assert.equal(ov.visionPlan('mistral', 'or', 'mistralai/mistral-medium-3-5', 'mistralai/mistral-medium-3-5').forced, false);
  assert.equal(ov.visionPlan('perplexity', 'or', 'x', 'x'), null);
  assert.equal(ov.visionPlan('deepseek', 'direct', 'x', 'x'), null);
  assert.equal(ov.visionPlan('mistral', '', 'x', 'x'), null);
});

test('المالك عبر الوسيط: Mistral وCohere وDeepSeek يرون الصورة بأنفسهم — لا كلود', async () => {
  for (const [provider, want] of [['mistral', 'mistralai/mistral-medium-3-5'], ['cohere', 'cohere/command-a-plus'], ['deepseek', 'deepseek/deepseek-v4-flash-vision-exp']]) {
    const r = await ask({ provider, keys: { OPENROUTER_API_KEY: 'or', ANTHROPIC_API_KEY: 'a' } });
    assert.equal(r.calls.length, 1, provider + ': نداء واحد');
    assert.match(r.calls[0].url, /openrouter\.ai\/api\/v1\/messages/, provider);
    assert.equal(r.calls[0].body.model, want, provider + ': موديل رؤية المزوّد نفسه');
    assert.equal(anthImage(r.calls[0]).source.data, 'AAAA', provider + ': البكسلات نفسها');
    assert.match(r.text, /أرى الصورة/);
  }
});

test('المالك بالمفتاح المباشر: Groq بموديل رؤيته وKimi بموديله — الصورة data URI', async () => {
  const g = await ask({ provider: 'groq', keys: { GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'or' } });
  assert.match(g.calls[0].url, /api\.groq\.com/);
  assert.equal(g.calls[0].body.model, 'qwen/qwen3.6-27b');
  assert.equal(oaImage(g.calls[0]).image_url.url, 'data:image/png;base64,AAAA');
  assert.equal(g.calls.length, 1, 'لا سلسلة موديلات Groq النصّيّة');
  const k = await ask({ provider: 'kimi', keys: { KIMI_API_KEY: 'k' } });
  assert.match(k.calls[0].url, /api\.moonshot\.ai/);
  assert.equal(k.calls[0].body.model, 'kimi-k3');
  assert.equal(oaImage(k.calls[0]).image_url.url, 'data:image/png;base64,AAAA');
  const k2 = await ask({ provider: 'kimi', model: 'kimi-k2.6', keys: { KIMI_API_KEY: 'k' } });
  assert.equal(k2.calls[0].body.model, 'kimi-k2.6', 'اختيار المالك يبقى حين يرى');
  const ko = await ask({ provider: 'kimi', keys: { OPENROUTER_API_KEY: 'or' } });
  assert.match(ko.calls[0].url, /openrouter\.ai/);
  assert.equal(ko.calls[0].body.model, 'moonshotai/kimi-k3', 'بلا مفتاح Moonshot: K3 عند الوسيط لا K2 النصّيّ');
});

test('المفتاح المباشر سقط قبل أوّل حرف: الوسيط للمزوّد نفسه بموديل يرى', async () => {
  const down = (u) => (/api\.(groq|moonshot)/.test(u) ? new Response('{"error":{"message":"invalid api key"}}', { status: 401 }) : null);
  const k = await ask({ provider: 'kimi', keys: { KIMI_API_KEY: 'k', OPENROUTER_API_KEY: 'or' }, upstream: down });
  const kor = k.calls.find((c) => /openrouter/.test(c.url));
  assert.ok(kor, 'هبط للوسيط');
  assert.equal(kor.body.model, 'moonshotai/kimi-k3');
  assert.equal(anthImage(kor).source.data, 'AAAA');
  // v-owner-solo: Groq لا يهبط للوسيط (Maverick هناك ليس عند Groq) — يتوقّف بسببه
  const g = await ask({ provider: 'groq', keys: { GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'or' }, upstream: down });
  assert.ok(!g.calls.some((c) => /openrouter/.test(c.url)), 'لا وسيط لـGroq');
  assert.ok(g.events.some((e) => e.ownerStop === true), 'سبب الفشل للمالك');
});

/* v-owner-solo: صفّ الوسيط العامّ — Grok الذي لا يرى الصورة لا يجيب عنه كلود (الافتراضيّ) بل يتوقّف بسببه، والاختيار لا يُمسح */
test('اختيار المالك الذي لا يرى في صفّ الوسيط: لا يجيب عنه موديل شركة أخرى، والاختيار لا يُمسح', async () => {
  const blind = (u, n) => (n === 1 ? new Response('{"error":{"message":"No endpoints found that support image input"}}', { status: 404 }) : null);
  const r = await ask({ provider: 'openrouter', model: 'x-ai/grok-4.20', keys: { OPENROUTER_API_KEY: 'or' }, upstream: blind });
  assert.equal(r.calls[0].body.model, 'x-ai/grok-4.20', 'اختياره أوّلًا');
  assert.equal(r.calls.length, 1, 'لا نداء لكلود');
  assert.ok(!r.events.some((e) => e.deadModel), 'رفض الصورة لا يمسح اختيار المالك');
  assert.ok(r.events.some((e) => e.ownerStop === true && e.error === 'ما قدرت أردّ الحين — خطأ 404'));
});

test('CHAT_IMAGE_MODEL لا يحوّل صورة المالك عن مزوّده — وكلود يبقى عليه كما كان', async () => {
  const g = await ask({ provider: 'gemini', keys: { OPENROUTER_API_KEY: 'or', CHAT_IMAGE_MODEL: 'claude-opus-5-5' } });
  assert.equal(g.calls[0].body.model, 'google/gemini-3.8-flash');
  const d = await ask({ provider: 'deepseek', keys: { OPENROUTER_API_KEY: 'or', CHAT_IMAGE_MODEL: 'claude-opus-5-5' } });
  assert.equal(d.calls[0].body.model, 'deepseek/deepseek-v4-flash-vision-exp');
  const c = await ask({ provider: 'claude', keys: { ANTHROPIC_API_KEY: 'a', CHAT_IMAGE_MODEL: 'claude-opus-5-5' } });
  assert.equal(c.calls[0].body.model, 'claude-opus-5-5', 'دور صورة كلود كما كان');
});

test('غير المالك لا يتغيّر: VIP إلى GPT/كلود، والمشترك على باقته، والنصّ بلا صورة كما كان', async () => {
  const vip = await ask({ who: 'sara', account: { tier: 'vip', subscriber: true }, provider: 'deepseek', keys: { OPENROUTER_API_KEY: 'or' } });
  assert.notEqual(vip.calls[0].body.model, 'deepseek/deepseek-v4-flash-vision-exp');
  assert.match(vip.calls[0].body.model, /^(openai|anthropic)\//);
  const sub = await ask({ who: 'sara', account: { tier: 'sub', plan: 'basic', subscriber: true }, provider: 'mistral', keys: { OPENROUTER_API_KEY: 'or', GEMINI_API_KEY: 'g' } });
  assert.ok(sub.calls.length);
  assert.ok(sub.calls.every((c) => !/mistral|deepseek|cohere|qwen/.test(String(c.body.model))), 'باقة المشترك: الصورة على Gemini');
  const txt = await ask({ provider: 'deepseek', image: false, keys: { OPENROUTER_API_KEY: 'or' } });
  assert.equal(txt.calls[0].body.model, 'deepseek/deepseek-v4-pro', 'النصّ على موديله المعتاد');
});

test('الواجهة: صورة المالك تمرّ بمسار الأدوات لأيّ مزوّد، وPerplexity يراها بنفسه للمالك', () => {
  const attach = fs.readFileSync(path.join(root, 'js/app-09-attach.js'), 'utf8');
  assert.ok(attach.includes("&& (__ownerFree || (!imageAttachments.length || (__effProv === 'claude' || __effProv === 'openai')))"),
    'شرط الصورة في مسار الأدوات يستثني المالك، وقاعدة غيره كما هي');
  const co = fs.readFileSync(path.join(root, 'js/app-06-checkout.js'), 'utf8');
  const fn = co.slice(co.indexOf('async function callPerplexity(messages, onDelta){'), co.indexOf('async function callGroq(messages, onDelta){'));
  assert.ok(fn.includes("omranOwnerUi()") && fn.includes('toOpenAIVisionMessages(messages)'), 'المالك: الصورة نفسها إلى Sonar');
  assert.ok(fn.includes('await stripImagesWithDescription(messages)'), 'غير المالك كما كان');
});
