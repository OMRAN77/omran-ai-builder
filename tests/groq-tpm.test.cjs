// tests/groq-tpm.test.cjs — لقطتا المالك ١١ أكتوبر:
//  (١) v-groq-tpm: Groq «qwen/qwen3.8-27b» و«مرحبا» → «ما قدرت أردّ الحين — خطأ 413». مفتاح Groq المجّانيّ حدّه ٨ آلاف توكن في الدقيقة
//      للموديل ويعدّ الطلب = المدخل + سقف الخرج؛ دور المالك (نظام ١٨ ألف حرف + ١٦ أداة + سقف ١٦ ألفًا) يُرفض قبل أوّل حرف دائمًا.
//      أُعيد إنتاجه بـchat.js الحقيقيّ ومفتاح Groq وهميّ يردّ 413 بنصّ Groq نفسه: الرسالة حرفيًّا. بعد الإصلاح: إعادة واحدة تتّسع للحدّ.
//  (٢) v-name-below: «ليش يطلع الاسم فوق المزوّدين كلّهم… كلّ واحد واسمه تحت بس» — سطر الموديل فوق ردّ المحادثة رُفع.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'groq-tpm-test-secret';
process.env.GROQ_API_KEY = 'test-groq-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_GROQ_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }),
});
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const OD = require(rp('api/_lib/oa-direct.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
// نصّ 413 كما يكتبه Groq حرفيًّا (الحدّ والمطلوب يُحسبان هنا: ٣ حروف للتوكن + السقف)
const tpm413 = (model, limit, requested) => new Response(JSON.stringify({ error: { message: 'Request too large for model `' + model + '` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit ' + limit + ', Requested ' + requested + ', please reduce your message size and try again. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing', type: 'tokens', code: 'rate_limit_exceeded' } }), { status: 413 });
const groqOk = (model, text) => new Response(['data: ' + JSON.stringify({ model, choices: [{ delta: { content: text } }] }), 'data: ' + JSON.stringify({ model, choices: [{ delta: {}, finish_reason: 'stop' }] }), 'data: [DONE]', ''].join('\n\n'), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const tokensOf = (b) => Math.ceil((JSON.stringify(b.messages).length + (b.tools ? JSON.stringify(b.tools).length : 0)) / 3);

async function ownerOnGroq(limit, messages, after413) {
  const calls = [], out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    let b = null; try { b = JSON.parse(init.body); } catch (e) { b = null; }
    calls.push({ url: u, body: b });
    if (!/api\.groq\.com/.test(u)) return new Response('{}', { status: 404 });
    const req = tokensOf(b) + (b.max_completion_tokens || 0);
    if (req > limit) return tpm413(b.model, limit, req);
    return (after413 && after413(b, calls.filter((c) => /api\.groq\.com/.test(c.url)).length)) || groqOk(b.model, 'هلا والله');
  };
  const req = { method: 'POST', headers: {}, body: { token: token('omran'), provider: 'groq', model: 'qwen/qwen3.8-27b', messages } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { groq: calls.filter((c) => /api\.groq\.com/.test(c.url)), others: calls.filter((c) => !/api\.groq\.com/.test(c.url)), text: events.map((e) => e.delta || '').join(''), errors: events.filter((e) => e.error).map((e) => e.error) };
}

test('real chat handler: owner says «مرحبا» on Groq with an 8K-per-minute key → one refit retry that fits, and the reply arrives (was: «خطأ 413»)', async () => {
  const r = await ownerOnGroq(8000, [{ role: 'user', content: 'مرحبا' }]);
  assert.equal(r.groq.length, 2, 'الأصل ثمّ إعادة واحدة');
  const [first, second] = r.groq.map((c) => c.body);
  assert.ok(first.tools && first.tools.length > 5 && first.max_completion_tokens === 128000, 'الأصل بأدوات المالك وسقفه (v-owner-cap-open: ١٢٨ ألفًا) — هذا ما رُفض');
  assert.ok(tokensOf(first) + 128000 > 8000);
  assert.equal(second.model, 'qwen/qwen3.8-27b', 'الموديل الذي اختاره المالك نفسه — لا موديل آخر');
  assert.ok(!second.tools, 'بلا أدوات: لا تتّسع لحدّ الدقيقة');
  assert.ok(tokensOf(second) + second.max_completion_tokens <= 8000, 'الإعادة داخل الحدّ');
  assert.ok(second.max_completion_tokens >= 1000 && second.max_completion_tokens <= 2000, 'مساحة جواب حقيقيّة بلا حجز الدقيقة كلّها');
  assert.ok(tokensOf(second) <= 8000 * 0.4, 'المدخل ≤ ٤٠٪ من حدّ الدقيقة — فتتّسع الرسالة التالية (كان ~٦ آلاف من ٨ فرُفضت التالية 429)');
  const sys = second.messages.find((m) => m.role === 'system').content;
  assert.match(sys, /^أنت موديل يعمل على خوادم Groq/, 'أوّل النظام (الهويّة والأسلوب) باقٍ');
  assert.match(sys, /\[هويّتك\]/, 'و[هويّتك]');
  assert.ok(sys.includes(OD.__TPM_NOTE || 'هذا الدور بلا أدوات'), 'والموديل يعرف أنّه بلا أدوات فلا يدّعي بحثًا ولا تعديلًا');
  assert.match(sys, /حدّ مفتاح Groq في الدقيقة/, 'v-plan-models: للمالك ملاحظته التي تسمّي السبب (owner يصل directFetch من chat.js)');
  assert.equal(r.text, 'هلا والله');
  assert.deepEqual(r.errors, []);
  assert.equal(r.others.length, 0, 'لا مزوّد آخر يجيب مكانه (v-owner-solo)');
});

test('a key with room (paid tier) is untouched: one call, full tools and cap', async () => {
  const r = await ownerOnGroq(300000, [{ role: 'user', content: 'مرحبا' }]);
  assert.equal(r.groq.length, 1);
  assert.ok(r.groq[0].body.tools.length > 5 && r.groq[0].body.max_completion_tokens === 128000); // v-owner-cap-open
  assert.equal(r.text, 'هلا والله');
});

test('a conversation too long even for the shortest form: no loop, and the owner gets the reason in one line', async () => {
  const long = [];
  for (let i = 0; i < 30; i++) long.push({ role: 'user', content: 'سؤال ' + i + ' ' + 'ك'.repeat(900) }, { role: 'assistant', content: 'جواب ' + 'ج'.repeat(900) });
  long.push({ role: 'user', content: 'مرحبا' });
  const r = await ownerOnGroq(8000, long);
  // الأصل، ثمّ ضغط المحادثة القديم للمالك (v-owner-memory) — ولا إعادة قصّ لا تتّسع بعدهما
  assert.equal(r.groq.length, 2, 'الأصل + المحادثة المضغوطة');
  assert.ok(r.groq[1].body.messages.length < r.groq[0].body.messages.length, 'الثانية هي الضغط القديم');
  assert.ok(r.groq.every((c) => c.body.tools && c.body.tools.length), 'لا جسم مقصوص أُرسل: أقصره لا يتّسع');
  assert.equal(r.text, '');
  assert.deepEqual(r.errors, ['ما قدرت أردّ الحين — المحادثة أكبر من حدّ المفتاح في الدقيقة؛ افتح محادثة جديدة']);
});

test('fitGroqTpm: cap alone when the input fits; tools off next; trimmed system last; nothing for other errors', () => {
  const sys = 'أنت موديل يعمل على خوادم Groq.\nأسلوب.\n\n' + 'أ'.repeat(3000) + '\n\n' + 'ب'.repeat(3000) + '\n\n[هويّتك]: موديل على Groq.';
  const tools = Array.from({ length: 10 }, (_, i) => ({ type: 'function', function: { name: 't' + i, description: 'd'.repeat(600), parameters: { type: 'object', properties: {} } } }));
  const body = { model: 'm', stream: true, max_completion_tokens: 16000, messages: [{ role: 'system', content: sys }, { role: 'user', content: 'مرحبا' }], tools };
  const P = tokensOf(body);
  const msg = (limit, req) => 'on tokens per minute (TPM): Limit ' + limit + ', Requested ' + req + ', please reduce';
  // (١) المدخل يتّسع، والسقف وحده زاد: يبقى كلّ شيء، والسقف = الحدّ − المدخل
  const a = OD.fitGroqTpm(body, msg(P + 4000, P + 16000));
  assert.ok(a.tools && a.messages[0].content === sys, 'لا شيء يُقصّ');
  assert.equal(a.max_completion_tokens, P + 4000 - P - 64);
  // (٢) المدخل نفسه أكبر من الحدّ: بلا أدوات، وأوّل النظام و[هويّتك] وما اتّسع بينهما لـ٤٠٪ من الحدّ
  const b = OD.fitGroqTpm(body, msg(4200, P + 16000));
  assert.ok(!b.tools && !('tool_choice' in b), 'بلا أدوات');
  const bs = b.messages[0].content;
  assert.ok(bs.startsWith('أنت موديل يعمل على خوادم Groq.') && bs.includes('[هويّتك]'));
  assert.ok(bs.includes('أ'.repeat(3000)) && !bs.includes('ب'.repeat(3000)), 'الفقرة الأولى من الوسط اتّسعت والثانية لا');
  assert.ok(tokensOf(b) * 1.1 <= 4200 * 0.4 + 5 && b.max_completion_tokens <= 1050);
  // (٣) حتّى بلا أدوات لا يتّسع: أوّل النظام و[هويّتك] وما اتّسع بينهما
  const c = OD.fitGroqTpm(body, msg(2500, P + 16000));
  const cs = c.messages[0].content;
  assert.ok(cs.startsWith('أنت موديل يعمل على خوادم Groq.') && cs.includes('[هويّتك]') && cs.length < sys.length, 'مقصوص بترتيبه');
  assert.ok(tokensOf(c) * 1.1 + c.max_completion_tokens <= 2500 + 5);
  // لا يتّسع أقصره = null (يبقى 413 كما هو)
  assert.equal(OD.fitGroqTpm(body, msg(300, P + 16000)), null);
  // ليس 413 حدّ الدقيقة = null
  assert.equal(OD.fitGroqTpm(body, 'Request Entity Too Large'), null);
  assert.equal(OD.fitGroqTpm(body, msg(9000, 8000)), null, 'المطلوب داخل الحدّ = ليس هذا السبب');
  // Groq لا يعدّ السقف (الرقم = المدخل وحده): لا «السقف وحده»، بل بلا أدوات
  const d = OD.fitGroqTpm(body, msg(P - 1000, P));
  assert.ok(d && !d.tools, 'الرقم مدخل وحده → القصّ لا السقف');
  // v-plan-models: ملاحظة الضيق للمالك تسمّي Groq و«عمران»؛ لغيره (المشترك على Groq) محايدة بلا اسم مزوّد ولا «عمران»
  const own = OD.fitGroqTpm(body, msg(4200, P + 16000), true).messages[0].content;
  const usr = b.messages[0].content;
  assert.match(own, /\[هذا الدور بلا أدوات: حدّ مفتاح Groq في الدقيقة/, 'المالك: السبب باسمه');
  assert.match(usr, /\[هذا الدور بلا أدوات لضيق السياق المتاح الآن/, 'غير المالك: صيغة محايدة');
  assert.ok(!/Groq|عمران/.test(usr.slice(usr.lastIndexOf('[هذا الدور'))), 'لا اسم مزوّد ولا «عمران» في ملاحظة غير المالك');
});

test('429 per-minute right after (the owner\'s second screenshot: «مرحبا» answered, then «تقدر تفحص التطبيق» → «خطأ 429»): wait what Groq says, retry once, the reply arrives', async () => {
  const t0 = Date.now();
  const r = await ownerOnGroq(8000, [{ role: 'user', content: 'تقدر تفحص التطبيق' }], (b, n) => (n === 2 ? new Response(JSON.stringify({ error: { message: 'Rate limit reached for model `' + b.model + '` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6123, Requested 5234. Please try again in 0.3s. Need more tokens?', type: 'tokens', code: 'rate_limit_exceeded' } }), { status: 429, headers: { 'retry-after': '1' } }) : null));
  assert.equal(r.groq.length, 3, 'الأصل 413، ثمّ المقصوص 429، ثمّ المقصوص نفسه بعد الانتظار');
  assert.deepEqual(r.groq[2].body, r.groq[1].body, 'الجسم نفسه');
  assert.ok(Date.now() - t0 >= 300, 'انتظر ما قاله Groq');
  assert.equal(r.text, 'هلا والله');
  assert.deepEqual(r.errors, []);
});

test('a wait longer than 40 s (or a per-day limit) is not slept on: the owner gets the time in one line', async () => {
  const r = await ownerOnGroq(8000, [{ role: 'user', content: 'مرحبا' }], (b) => new Response(JSON.stringify({ error: { message: 'Rate limit reached for model `' + b.model + '` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199500, Requested 3000. Please try again in 12m3.5s. Need more tokens?', type: 'tokens', code: 'rate_limit_exceeded' } }), { status: 429, headers: { 'retry-after': '724' } }));
  assert.equal(r.groq.length, 2, 'لا انتظار ولا إعادة — وretry-after يصل إعادة المالك (C4) فلا تعيد هي أيضًا');
  assert.deepEqual(r.errors, ['ما قدرت أردّ الحين — وصلت حدّ المفتاح؛ جرّب بعد 13 دقيقة']);
  assert.equal(OD.groqRetryAfter('Please try again in 25.7s.'), 25.7);
  assert.equal(OD.groqRetryAfter('try again in 1m12.5s'), 72.5);
  assert.equal(OD.groqRetryAfter('try again in 450ms'), 0.45);
  assert.equal(OD.groqRetryAfter('Request too large'), null);
  assert.equal(OD.GROQ_WAIT_MAX, 40, 'تحت حارس الصمت (٧٥ ث)');
});

test('the retry lives in directFetch for Groq only, once, after the cap retry; and the stop note names the reason', () => {
  const src = read('api/_lib/oa-direct.js');
  assert.match(src, /if \(!tpmFitted && route\.prov === 'groq' && r\.status === 413\) \{ const fit = fitGroqTpm\(body, t, !!o\.owner\); if \(fit\) \{ tpmFitted = true; body = fit; continue; \} \}/);
  const { ownerStopNote } = chat.__imgWhy;
  assert.equal(ownerStopNote({ status: 413, text: 'Request too large for model `x` on tokens per minute (TPM): Limit 8000, Requested 9000' }), 'ما قدرت أردّ الحين — المحادثة أكبر من حدّ المفتاح في الدقيقة؛ افتح محادثة جديدة');
  assert.equal(ownerStopNote({ status: 413, text: 'Request Entity Too Large' }), 'ما قدرت أردّ الحين — خطأ 413: Request Entity Too Large', 'غير حدّ الدقيقة كما كان');
  assert.equal(ownerStopNote({ status: 402, text: '' }), 'ما عندي رصيد');
});

test('v-name-below: no model line above a chat reply for any provider; the agent badge and «ask all» keep theirs', () => {
  for (const f of ['js/app-04-i18n-state.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(!s.includes('m.served'), f + ': سطر «المزوّد · الموديل» فوق ردّ المحادثة لا يُرسم');
    assert.ok(s.includes('if(isAskAllReply || (__ownerBadge && __plbl && m.agentBadge)) div.appendChild(label);'), f + ': الوكيل و«اسأل الكل» كما كانا');
  }
  // الشريحة تحت الصندوق هي من يقول من يردّ
  assert.match(read('js/modes.js'), /window\.omModelChipSync = refresh;/);
});
