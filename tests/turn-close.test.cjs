// tests/turn-close.test.cjs — v-turn-close (لقطة المالك ١٥ أكتوبر: DeepSeek على «حط صور الستاير» فتح طلب السحب #1073 باختبار وحده،
// ثمّ «⚠️ ما قدرت أردّ الحين — ما وصل شي من الخادم» والإصلاح لم يُرفع): حارس الوقت كان للنداء وحده — أداة متأخّرة تعمل حتّى تقتل Vercel
// الدالّة عند ٣٠٠ ث فينقطع المقبس بلا كلمة، والعميل يقرأ الانقطاع «صمتًا» ويرمي سجلّ العمل؛ ورفعة سابقة كانت تُسقط سطر «كمل» من خروج
// المهلة وتضيف «أدمج وأنشر؟» على شغل ناقص؛ والمحاولة الفاشلة كانت تُعدّ رفعة. هنا بالمعالج الحقيقيّ chat.js وapp-18 وapp-06 الحقيقيّين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'turn-close-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.CHAT_KA_MS = '50'; // نبض سريع: حدّ الوقت يُفحص كلّ ٥٠ م.ث بدل ٤ ث
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'CHAT_STALL_FIRST_MS', 'CHAT_STALL_IDLE_MS', 'SITE_URL']) delete process.env[k];

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
stub('api/_lib/_vip.js', { isVip: async () => false });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
const logged = [];
le.logErrorAndFlush = async () => {}; le.logError = (tag) => { logged.push(tag); };
const OL = require(rp('api/_lib/owner-loop.js'));
const GW = require(rp('api/_lib/github-write.js'));
const GE = require(rp('api/_lib/github-edit.js'));
const GR = require(rp('api/_lib/github-read.js'));
const chat = require(rp('api/_lib/chat.js'));

// الوقت: انزياح يُضاف لـDate.now — «مرّت ٢٨١ ث» داخل الأداة بلا انتظار حقيقيّ
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tool = { read: async () => 'FILE js/x.js\n1| x', edit: async () => ({ error: 'لا' }) };
GR.readGithub = (...a) => tool.read(...a);
GE.editFiles = (...a) => tool.edit(...a);

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: realNow() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
// المالك على المسار المباشر (/v1/responses) — حلقة الأدوات نفسها لكلّ المزوّدين
const resp = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const fin = { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } };
const R = {
  text: (t) => resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } }, { type: 'response.output_text.delta', output_index: 0, delta: t }, fin]),
  call: (name, input) => {
    const id = 'call_' + Math.random().toString(36).slice(2, 8), args = JSON.stringify(input);
    return resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: args, status: 'completed' } }, fin]);
  },
};
// مجرى كـNode: بعد end يصير writableEnded، وكتابة بعده تُسجَّل (في Node حدث error بلا مستمع = سقوط العمليّة)
async function run(messages, script) {
  const calls = [], out = [], intervals = new Set();
  const save = global.fetch, si = global.setInterval, ci = global.clearInterval;
  global.setInterval = (...a) => { const h = si(...a); intervals.add(h); return h; };
  global.clearInterval = (h) => { intervals.delete(h); return ci(h); };
  let n = 0;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b });
    if (!/api\.openai\.com\/v1\/responses/.test(String(url))) return new Response('{}', { status: 404 });
    return script[Math.min(n++, script.length - 1)]();
  };
  const res = { writableEnded: false, afterEnd: [], endedAt: 0, setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; },
    write(c) { if (this.writableEnded) { this.afterEnd.push(String(c)); return false; } out.push(String(c)); return true; },
    end() { if (!this.writableEnded) { this.writableEnded = true; this.endedAt = realNow(); } }, flushHeaders() {} };
  const req = { method: 'POST', headers: {}, body: { token: token('omran'), provider: 'openai', model: 'openai/gpt-6-astra', messages } };
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  let live = 0;
  try { await chat(req, res); } finally {
    global.fetch = save; global.setInterval = si; global.clearInterval = ci; delete process.env.OPENAI_API_KEY; skew = 0;
    live = intervals.size; intervals.forEach((h) => ci(h));
  }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls: calls.filter((c) => /openai/.test(c.url)), events, res, liveIntervals: live, text: events.map((e) => e.delta || '').join(''), input: JSON.stringify(calls.map((c) => c.body && c.body.input)) };
}
const EDIT = { repo: 'OMRAN77/omran-ai-builder', edits: [{ path: 'js/design-sels.js', old: 'a', new: 'b' }], message: 'صور الستاير' };
const PUSHED = { repo: 'OMRAN77/omran-ai-builder', branch: 'omran-agent/v-decor-curtain-photos', commit: 'abcdef1234567', commitUrl: 'https://github.com/OMRAN77/omran-ai-builder/commit/abcdef1', files: 1, prUrl: 'https://github.com/OMRAN77/omran-ai-builder/pull/1073', prNumber: 1073 };
const ASK = [{ role: 'user', content: 'اريد تعديل في التطبيق شوف في الديكور قسم الستاير مافي صور حط صور على نفس الاسامي' }];

test('١. الحدّ: غير المالك عند MAX_MS كما كان؛ المالك حيّ حتّى CLOSE_AT_MS، ثمّ أداة تعمل = ختام، ونداء جارٍ = نبض حتّى حدّ الدالّة، ثمّ صمت (#527)', () => {
  const now = Date.now();
  const o = (el) => ({ t0: now - el, MAX_MS: 240000 });
  const off = OL.state(false), on = OL.state(true);
  assert.equal(OL.pulse(off, o(239000)), 'ka'); assert.equal(OL.pulse(off, o(241000)), 'end', 'غير المالك كما كان');
  off.busy = true; assert.equal(OL.pulse(off, o(285000)), 'end', 'لا ختام لغير المالك');
  assert.equal(OL.CLOSE_AT_MS, OL.FN_BUDGET_MS - 10000);
  assert.equal(OL.pulse(on, o(250000)), 'ka', 'المالك بعد MAX_MS: خطوة الختام لا تصمت');
  assert.equal(OL.pulse(on, o(285000)), 'ka', 'نداء/بين خطوتين: حارس النداء يختم عند ٢٩٠');
  assert.equal(OL.pulse(on, o(291000)), 'end', 'بعد حدّ الدالّة لا نبض بلا نهاية');
  on.busy = true;
  assert.equal(OL.pulse(on, o(279000)), 'ka');
  assert.equal(OL.pulse(on, o(281000)), 'close', 'أداة ما زالت تعمل بعد CLOSE_AT_MS');
});

test('٢. سطر الختام يحمل مفتاح «كمل» ورابط آخر رفعة، و«كمل» بعده تكمل المهمّة نفسها', () => {
  const ok = GW.formatPush(PUSHED);
  assert.equal(OL.pushRef(ok), 'طلب السحب #1073: https://github.com/OMRAN77/omran-ai-builder/pull/1073');
  assert.equal(OL.pushRef(GW.formatPush(Object.assign({}, PUSHED, { prUrl: '', prNumber: 0, direct: true, base: 'main' }))), 'الفرع «omran-agent/v-decor-curtain-photos»');
  assert.equal(OL.pushRef(GW.formatPush({ error: 'x' })), '');
  const m = OL.closeMark(OL.pushRef(ok));
  assert.ok(m.includes(OL.RESUME_KEY) && m.endsWith('pull/1073'));
  assert.equal(OL.closeMark(''), OL.closeMark('').trimEnd(), 'بلا رفعة لا سطر فارغ');
  const convo = [ASK[0], { role: 'assistant', content: 'أقرأ design-sels.js' + m }, { role: 'user', content: 'كمل' }];
  assert.equal(OL.resume(convo, 'كمل'), true);
  assert.ok(convo[2].content.includes(OL.RESUME_NOTE));
});

test('٣. أداة تجاوزت CLOSE_AT_MS: الدور يُختم نظيفًا قبل قتل الدالّة — سطر «كمل» ورابط الطلب ثمّ done ونهاية المجرى والأداة ما زالت تعمل؛ ولا كتابة بعده ولا جولة', async () => {
  let toolDone = 0;
  tool.edit = async () => PUSHED;
  tool.read = async () => { skew = 281000; await sleep(400); toolDone = realNow(); return 'FILE js/design-sels.js\n1| var X = 1;'; };
  logged.length = 0;
  const r = await run(ASK, [() => R.call('edit_github', EDIT), () => R.call('read_github', { url: 'OMRAN77/omran-ai-builder', path: 'js/design-sels.js' }), () => R.text('ما يُفترض أن يُطلب')]);
  assert.ok(r.res.endedAt && r.res.endedAt < toolDone, 'المجرى انتهى والأداة ما زالت تعمل');
  assert.ok(r.text.endsWith(OL.closeMark('طلب السحب #1073: https://github.com/OMRAN77/omran-ai-builder/pull/1073')), 'سطر الختام ومعه رابط الرفعة السابقة');
  assert.ok(r.events.some((e) => e.done === true));
  assert.deepEqual(r.res.afterEnd, [], 'لا كتابة بعد end (في Node تُسقط العمليّة)');
  assert.equal(r.calls.length, 2, 'الحلقة وقفت بعد الأداة — لا نداء ثالث بعد الختام');
  assert.ok(!r.events.some((e) => e.error), 'لا خطأ بعد الختام');
  assert.equal(r.liveIntervals, 0);
  assert.ok(logged.includes('chat/owner-turn-close'), 'يُسجَّل للتشخيص');
});

test('٤. الوقت انتهى قبل الختام بعد رفعة سابقة: السبب بـ«كمل» ورابط الطلب — لا صمت ولا «أدمج وأنشر؟» على شغل ناقص', async () => {
  tool.edit = async () => { skew = 278000; return PUSHED; };
  const r = await run(ASK, [() => R.call('edit_github', EDIT), () => R.text('لا يُطلب')]);
  assert.equal(r.calls.length, 1, 'لا وقت لخطوة ختام (أقلّ من ١٥ ث لحدّ الدالّة)');
  const err = r.events.find((e) => e.error);
  assert.ok(err && err.ownerStop, 'سبب ظاهر');
  assert.match(err.error, /انتهت مهلة الردّ \(240 ث\) قبل الجواب النهائيّ/);
  assert.ok(err.error.includes(OL.RESUME_KEY) && err.error.endsWith('طلب السحب #1073: https://github.com/OMRAN77/omran-ai-builder/pull/1073'));
  assert.ok(!/أدمج وأنشر/.test(r.text), 'لا سؤال دمج لشغل لم يُختم');
  assert.equal(r.liveIntervals, 0);
});

test('٥. رفعة فاشلة لا تُعدّ رفعة: ختام التعديل يبقى «نفّذ الآن» وسطر «كمل» يظهر', async () => {
  process.env.CHAT_MAX_STEPS = '2';
  tool.edit = async () => ({ error: 'النصّ القديم غير موجود في js/design-sels.js' });
  try {
    const r = await run(ASK, [() => R.call('edit_github', EDIT), () => R.text('ما قدرت أعدّل: النصّ القديم غير موجود.')]);
    assert.equal(r.calls.length, 2);
    const b1 = JSON.stringify(r.calls[1].body);
    assert.ok(b1.includes('انتهت ميزانيّة القراءة') && !b1.includes('انتهت ميزانيّة الأدوات'), 'ختام التعديل (FINAL_EDIT_NOTE) لا ختام الجواب');
    assert.ok(r.text.endsWith(OL.resumeMark()), '«كمل» بعده تكمل');
  } finally { delete process.env.CHAT_MAX_STEPS; }
});

// العميل: app-18 الحقيقيّ في vm (الشريحة نفسها في chat-owner-errors) ومجرى ينقطع بعد بدئه
const app18Core = read('js/app-18-chat-tools.js').slice(0, read('js/app-18-chat-tools.js').indexOf('// v478:'));
function cutStream(lines) {
  let n = 0;
  return new ReadableStream({ pull(c) { if (n++ === 0) c.enqueue(new TextEncoder().encode(lines.map((l) => 'data: ' + JSON.stringify(l) + '\n\n').join(''))); else c.error(new TypeError('network error')); } });
}
async function client(lines) {
  const ctx = { window: { authGet: () => 'tok', claudeModelGet: () => '' }, fetch: async () => new Response(cutStream(lines), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    TextDecoder, setTimeout, clearTimeout, Promise, Error, String, JSON, Date, Array, Math, console, Intl, Object, Number, RegExp };
  vm.runInNewContext(app18Core, ctx);
  try { return { reply: (await ctx.window.callChatWithTools([{ role: 'user', content: 'x' }], null, 'deepseek')).reply }; }
  catch (e) { return { error: e.message, ownerStop: !!e.ownerStop, log: e.log }; }
}

test('٦. العميل: انقطاع المجرى بعد عمل ليس «ما وصل شي» — سببه «انقطع الاتّصال»، وسجلّ العمل يبقى مع الخطأ، وسبب الخادم وعلامته كما هما', async () => {
  const c = await client([{ delta: 'أكتب الاختبار أوّلًا.' }, { status: '↳ ✅ رُفع commit abc · طلب السحب #1073' }]);
  assert.match(c.error, /^chat: cut — network error$/);
  assert.equal(c.ownerStop, false);
  assert.ok(Array.isArray(c.log), 'السجلّ مع الخطأ');
  assert.ok(c.log.some((x) => x.t === 'text' && x.s === 'أكتب الاختبار أوّلًا.'), 'الجملة المنقولة للسجلّ لا تضيع');
  assert.ok(c.log.some((x) => x.t === 'tool' && /#1073/.test(x.title)), 'خطوة فتح الطلب ظاهرة');
  const s = await client([{ error: 'انتهت مهلة الردّ (240 ث) قبل الجواب النهائيّ — ' + OL.RESUME_KEY, ownerStop: true }]);
  assert.equal(s.error, 'انتهت مهلة الردّ (240 ث) قبل الجواب النهائيّ — ' + OL.RESUME_KEY);
  assert.equal(s.ownerStop, true, 'علامة سبب الخادم تبقى فلا يُمحى إلى «ما قدرت أردّ الحين»');
  // التحويل للمالك (app-06): «cut» = انقطع الاتّصال، والصمت كما كان
  const checkout = read('js/app-06-checkout.js');
  const a = checkout.indexOf('var __FALLBACK_IDLE_MS'), b = checkout.indexOf('// ⚠️ ٦ أغسطس — سجل الأخطاء الحقيقي');
  const msg = async (err) => {
    const ctx = { localStorage: { getItem: () => 'openai' }, FUNCTIONAL_GROUPS: {}, AUTO_FALLBACK_ORDER: ['claude'], TOOL_PROVIDERS: ['claude', 'openai'],
      window: { callChatWithTools: async () => { throw err; } }, functionalLabel: (k) => k, t: (k) => k, __swallow() {}, console,
      isRefusalReply: () => false, setInterval, clearInterval, Date, Promise, Error, String, Number, callProviderAI: async () => 'x' };
    vm.runInNewContext(checkout.slice(a, b) + '\nthis.fb = callAIWithFallback;', ctx);
    try { await ctx.fb([{ role: 'user', content: 'x' }], null, ['openai'], { solo: true }); } catch (e) { return { m: e.message, log: e.log }; }
    return { m: 'no-throw' };
  };
  const cut = await msg(Object.assign(new Error('chat: cut — terminated'), { log: [{ t: 'tool', title: 'x' }] }));
  assert.equal(cut.m, 'ما قدرت أردّ الحين — انقطع الاتّصال');
  assert.deepEqual(cut.log, [{ t: 'tool', title: 'x' }], 'السجلّ يمرّ إلى فقاعة الخطأ (_agParts)');
  assert.equal((await msg(new Error('chat: stalled — no response'))).m, 'ما قدرت أردّ الحين — ما وصل شي من الخادم', 'الصمت الظاهر كما كان');
  assert.ok(read('js/app.bundle.js').includes("'chat: cut — ' + String((e && e.message) || e).slice(0, 80)"), 'الحزمة مبنيّة');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/turn-close.test.cjs'));
});
