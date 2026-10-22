// tests/owner-swap.test.cjs — v-owner-swap + v-providers-like-agent (أمر المالك ٤ أكتوبر: «إذا ما في رصيد، للمالك فقط يطلع
// تحت، وخلّهم كلّهم نفس الي عند الوكيل»؛ لقطاته: اختار كلود فأجاب Gemini، واختار الوكيل فأجاب «open» وقال «أدوات قراءة
// الكود مش متاحة عندي في هذا الرد»).
// على معالجَي المحادثة والوكيل الحقيقيّين بلا شبكة: فشل كلود (رصيد) → الدور نفسه بأدواته على كلود عبر الوسيط، وسطر السبب
// تحت الردّ للمالك وحده؛ الرسالة الطويلة تحمل أدوات القراءة للمالك؛ وأدوات الوكيل (الرفع والتفويض) في المحادثة له.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.OWNER_AGENT_CLAUDE = 'on'; // v-agent-claude-off: الاختبار يفحص الوكيل وهو شغّال
process.env.OWNER_CLAUDE_CHAT = 'on'; // v-claude-chat-off: ردّ Claude للمالك موقوف افتراضيًّا — هذا الاختبار يفحص مساره حين يُعاد تشغيله
process.env.AUTH_SECRET = 'owner-swap-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
let usageUser = 'omran';
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }),
});
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));
const agent = require(rp('api/_lib/agent.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (text) => new Response([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const credit = () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }), { status: 400 });

async function run(handler, user, body, route) {
  usageUser = user;
  const calls = [];
  const out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const b = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body: b });
    return route(String(url), b);
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(v); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await handler(req, res); } finally { global.fetch = save; }
  const text = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } })
    .map((e) => e.delta || '').join('');
  return { calls, text };
}
const viaClaudeDirect = (u) => /api\.anthropic\.com/.test(u);
const viaOR = (u) => /openrouter\.ai\/api\/v1\/messages/.test(u);

test('١. المحادثة: كلود المختار بلا رصيد → الدور نفسه بأدواته على كلود عبر الوسيط، والردّ وحده (v-owner-solo: بلا سطر سبب)', async () => {
  const { calls, text } = await run(chat, 'omran', { provider: 'claude', messages: [{ role: 'user', content: 'اقرأ ملفّ مها في الجيت هوب' }] },
    (u) => (viaClaudeDirect(u) ? credit() : viaOR(u) ? sse('قرأتُ الملفّ.') : new Response('{}', { status: 404 })));
  const direct = calls.find((c) => viaClaudeDirect(c.url));
  const or = calls.find((c) => viaOR(c.url));
  assert.ok(direct, 'جُرّب المباشر أوّلًا');
  assert.ok(or, 'ثمّ الوسيط');
  assert.match(or.body.model, /^anthropic\/claude/, 'كلود نفسه عبر الوسيط لا Gemini: ' + or.body.model);
  const names = (or.body.tools || []).map((t) => t.name);
  for (const n of ['read_github', 'web_search', 'write_github', 'delegate_code_task', 'check_code_task', 'read_app_errors']) assert.ok(names.includes(n), 'أداة ' + n + ' باقية');
  assert.equal(text, 'قرأتُ الملفّ.', 'المحادثة فقط — أمر المالك ٨ أكتوبر «أيّ شي زائد ما أريده»');
});

test('٢. غير المالك: لا سطر سبب ولا أدوات المالك (كما كان)', async () => {
  const { calls, text } = await run(chat, 'vipuser', { provider: 'openai', messages: [{ role: 'user', content: 'هلا كيف الحال' }] },
    (u) => (viaOR(u) ? sse('هلا.') : new Response('{}', { status: 404 })));
  const or = calls.find((c) => viaOR(c.url));
  assert.ok(or);
  const names = (or.body.tools || []).map((t) => t.name);
  assert.ok(!names.includes('write_github') && !names.includes('delegate_code_task') && !names.includes('read_app_errors'));
  assert.ok(!/للمالك فقط/.test(text));
});

test('٣. رسالة المالك الطويلة تحمل أدوات القراءة (بلا أدوات الصور) — كانت بلا أيّ أداة', async () => {
  const long = 'مها تنقطع بعد اقل من دقيقة ' + 'والمشكلة تتكرر كل مرة افتح المكالمة '.repeat(18) + ' افحص الكود';
  const { calls } = await run(chat, 'omran', { provider: 'claude', messages: [{ role: 'user', content: long }] },
    (u) => (viaClaudeDirect(u) ? sse('تمّ.') : new Response('{}', { status: 404 })));
  const c = calls.find((x) => viaClaudeDirect(x.url));
  const names = ((c && c.body.tools) || []).map((t) => t.name);
  assert.ok(names.includes('read_github') && names.includes('web_search'), 'القراءة والبحث: ' + names.join(','));
  // v-tokens-owner-tools: «بلا أدوات الصور» صار تنبيهًا في الذيل وحارسًا عند التنفيذ والقائمة كاملة (بادئة الكاش — tokens-share ٥)
  assert.ok(JSON.stringify(c.body.messages).includes(chat.__tokens2.OWNER_NO_MEDIA_NOTE), 'أدوات الصور مقفلة في هذا الدور');
});

test('٤. الوكيل: كلود المباشر بلا رصيد → كلود عبر الوسيط بأدواته (لا DeepSeek/Groq بلا أدوات)، وسطر السبب تحت الردّ', async () => {
  const { calls, text } = await run(agent, 'omran', { messages: [{ role: 'user', content: 'افحص مها في المستودع' }] },
    (u) => (viaClaudeDirect(u) ? credit() : viaOR(u) ? sse('فحصتُ.') : new Response('{}', { status: 500 })));
  const or = calls.find((c) => viaOR(c.url));
  assert.ok(or, 'الوسيط جُرّب');
  assert.match(or.body.model, /^anthropic\/claude-/);
  assert.ok((or.body.tools || []).some((t) => t.name === 'read_github'), 'بأدواته');
  assert.ok(!calls.some((c) => /deepseek|groq|mistral/.test(c.url)), 'لا هبوط بلا أدوات');
  assert.match(text, /فحصتُ\./);
  assert.match(text, /🔧 للمالك فقط — Anthropic مباشر · [^\n]* فشل: لا رصيد كافٍ [^\n]*· أجاب بدله: كلود عبر الوسيط · anthropic\/claude-/);
});

/* v-or-display (المالك ١٤ أكتوبر «صلّح الثلاثة الباقية»): بعد الهبوط إلى الوسيط كان الوكيل بلا عرض — كتل تفكيره فارغة فيبدو صامتًا.
   الآن العرض الملخّص على الوسيط للمالك على الجيل الخامس؛ ورفضه (400 بأيّ نصّ) = إعادة واحدة بلاه لبقيّة التشغيل. */
test('٥. الوكيل على الوسيط: العرض الملخّص يُطلب للمالك، ورفضه بنصّ المزوّد = إعادة واحدة بلاه والجواب يصل', async () => {
  const ok = await run(agent, 'omran', { messages: [{ role: 'user', content: 'افحص مها في المستودع' }] },
    (u) => (viaClaudeDirect(u) ? credit() : viaOR(u) ? sse('فحصتُ.') : new Response('{}', { status: 500 })));
  const or = ok.calls.find((c) => viaOR(c.url));
  assert.ok(/^anthropic\/claude-(?:opus-5|sonnet-5|fable)/.test(or.body.model), or.body.model);
  assert.deepEqual(or.body.thinking, { type: 'adaptive', display: 'summarized' });

  const no = await run(agent, 'omran', { messages: [{ role: 'user', content: 'افحص مها في المستودع' }] },
    (u, b) => (viaClaudeDirect(u) ? credit() : viaOR(u) ? ((b.thinking && b.thinking.display) ? new Response(JSON.stringify({ error: { message: 'Provider returned error' } }), { status: 400 }) : sse('فحصتُ بلا عرض.')) : new Response('{}', { status: 500 })));
  const ors = no.calls.filter((c) => viaOR(c.url));
  assert.equal(ors.length, 2, 'إعادة واحدة');
  assert.equal(ors[1].body.thinking, undefined, 'الإعادة بلا عرض');
  assert.match(no.text, /فحصتُ بلا عرض\./);
});
