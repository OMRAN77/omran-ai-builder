// v-chat-fast (١٩ سبتمبر ٢٠٢٦): «سرعة الردود في المحادثة وتكون منتظمة — في كلّ المزوّدين بطيئة جدًّا».
// ثلاثة مواضع: (١) إطفاء التفكير لموديلات OpenRouter غير كلود مع رجوع عند 400، (٢) العرض بسرعة الشبكة بلا
// حركة كتابة مصطنعة، (٣) مصنّف الوسائط لا يُنادى إلّا لمرشّح إنشاء وبمهلة قصيرة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'chat-fast-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetJSON: async (key) => db.has(key) ? structuredClone(db.get(key)) : null,
  kvPutJSON: async (key, value) => { db.set(key, structuredClone(value)); },
  kvDel: async (key) => { db.delete(key); },
  kvExpire: async () => {},
} };
require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: 'fast-user' }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const chat = require(rp('api/_lib/chat.js'));

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function streamResponse(text) {
  const events = [
    { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text || 'تم' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
  ];
  return new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
async function ask(provider, script) {
  // script: قائمة ردود متتالية للطلبات المتتالية: 'ok' أو نصّ خطأ 400
  const bodies = [];
  const saveFetch = global.fetch;
  let i = 0;
  global.fetch = async (url, options) => {
    bodies.push({ url: String(url), body: JSON.parse(options.body) });
    const step = script[Math.min(i++, script.length - 1)];
    if (step === 'ok') return streamResponse();
    return new Response(step, { status: 400 });
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'اشرح لي الذكاء الاصطناعي باختصار' }], token: token('fast-user'), provider } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {} };
  try { await chat(req, res); } finally { global.fetch = saveFetch; }
  return { bodies, written };
}

test('١. الخادم: موديل OpenRouter غير كلود يطلب بلا تفكير (الصيغتان)، وكلود عبر الوسيط بلا الحقول', async () => {
  chat.__orQuick.level = 2;
  let r = await ask('deepseek', ['ok']);
  assert.equal(r.bodies.length, 1);
  assert.match(r.bodies[0].url, /openrouter\.ai\/api\/v1\/messages/);
  assert.equal(r.bodies[0].body.model, 'deepseek/deepseek-v4-pro');
  assert.deepEqual(r.bodies[0].body.thinking, { type: 'disabled' });
  assert.deepEqual(r.bodies[0].body.reasoning, { enabled: false });
  assert.match(r.written, /"delta":"تم"/);
  r = await ask('claude', ['ok']);
  assert.equal(r.bodies[0].body.thinking, undefined);
  assert.equal(r.bodies[0].body.reasoning, undefined);
  // كلود المباشر (مفتاح أنثروبيك) بلا الحقول أيضًا
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  try {
    r = await ask('claude', ['ok']);
    assert.match(r.bodies[0].url, /api\.anthropic\.com/);
    assert.equal(r.bodies[0].body.thinking, undefined);
    assert.equal(r.bodies[0].body.reasoning, undefined);
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});

test('٢. الخادم: 400 يذكر reasoning → إعادة بـthinking وحده وتُذكَر؛ 400 يذكر thinking → بلا الحقلين وتُذكَر', async () => {
  chat.__orQuick.level = 2;
  let r = await ask('openai', ['{"error":{"message":"Unrecognized request argument: reasoning"}}', 'ok']);
  assert.equal(r.bodies.length, 2, 'إعادة واحدة');
  assert.deepEqual(r.bodies[0].body.reasoning, { enabled: false });
  assert.equal(r.bodies[1].body.reasoning, undefined);
  assert.deepEqual(r.bodies[1].body.thinking, { type: 'disabled' });
  assert.equal(chat.__orQuick.level, 1);
  assert.match(r.written, /"delta":"تم"/);
  // الطلب التالي في الدالّة نفسها لا يعيد المحاولة الخاسرة
  r = await ask('openai', ['ok']);
  assert.equal(r.bodies.length, 1);
  assert.equal(r.bodies[0].body.reasoning, undefined);
  assert.deepEqual(r.bodies[0].body.thinking, { type: 'disabled' });
  // ثمّ رفض thinking → صفر
  r = await ask('gemini', ['{"error":{"message":"thinking is not supported"}}', 'ok']);
  assert.equal(r.bodies.length, 2);
  assert.equal(r.bodies[1].body.thinking, undefined);
  assert.equal(r.bodies[1].body.reasoning, undefined);
  assert.equal(chat.__orQuick.level, 0);
  r = await ask('gemini', ['ok']);
  assert.equal(r.bodies.length, 1);
  assert.equal(r.bodies[0].body.thinking, undefined);
  // 400 لا يذكر أيًّا منهما (مع الحقول) → إعادة واحدة بلا الحقلين ثمّ لا تكرار
  chat.__orQuick.level = 2;
  r = await ask('deepseek', ['{"error":"bad request"}', 'ok']);
  assert.equal(r.bodies.length, 2);
  assert.equal(r.bodies[1].body.thinking, undefined);
  assert.equal(chat.__orQuick.level, 0);
  chat.__orQuick.level = 2;
});

test('٣. الخادم: البنية — الحقول خارج تعريف callUpstream (اختبار v-claude-models يحرسه)، والإعادة بعد كاش-400 وقبل الفشل النهائيّ', () => {
  const s = read('api/_lib/chat.js');
  const i = s.indexOf('const callUpstream = (withImg) => __upFetch(CHAT_URL');
  const req = s.slice(i, s.indexOf('let upstream = await callUpstream(true);', i));
  assert.ok(req.includes('__quickFields()'), 'الدمج في الجسم');
  assert.ok(!/thinking|reasoning/.test(req), 'لا حرف من الحقول داخل التعريف');
  const qf = s.indexOf('const __quickFields = () => {');
  assert.ok(qf > 0 && qf < i, 'التعريف يسبق callUpstream');
  const cache400 = s.indexOf("await logErrorAndFlush('chat/prompt-cache-400'");
  const quick400 = s.indexOf("await logErrorAndFlush('chat/or-quick-400'");
  const finalFail = s.indexOf("await logErrorAndFlush('chat/upstream-fail'");
  assert.ok(cache400 > 0 && quick400 > cache400 && finalFail > quick400);
  assert.ok(s.includes("if (!viaOR || prov === 'claude' || __ownerReq) return {};"), 'كلود لا يُمسّ');
});

// ── العميل ──
const src = read('js/app-09-attach.js');
function rx(name, s) {
  const m = s.match(new RegExp('const ' + name + '\\s*=\\s*(/[\\s\\S]*?/[a-z]*);\\n'));
  assert.ok(m, name + ' موجود');
  return vm.runInNewContext(m[1]);
}

test('٤. العميل: العرض بسرعة الشبكة — كلّ نبضة تعرض كلّ ما وصل، ولا وتيرة مصطنعة', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    const i = s.indexOf('const __liveTimer = () => {');
    assert.ok(i > 0, f + ': المؤقّت موجود');
    const seg = s.slice(i, s.indexOf('const __liveFinish', i));
    assert.ok(seg.includes('__live.shown = __live.target.length;\n            __liveRender();'), f + ': لحاق كامل كلّ نبضة');
    assert.ok(!/Math\.ceil\(left \/ 120\)/.test(seg), f + ': وتيرة v-reveal-quick أُزيلت');
    assert.ok(seg.includes('}, 30);'), f + ': النبض ثابت ٣٠مل');
  }
});

test('٥. العميل: المصنّف لمرشّح الإنشاء فقط وبمهلة ٢٫٥ث، والخادم تحتها', () => {
  const WORD = rx('__MEDIA_WORD_RE', src);
  const TALK = rx('__MEDIA_TALK_RE', src);
  const MAKE = rx('__MEDIA_MAKE_RE', src);
  const calls = (t) => WORD.test(t) && !TALK.test(t) && MAKE.test(t);
  // كلمة وسائط بلا طلب إنشاء: لا انتظار
  for (const t of ['أتصور إنّ السوق بيرتفع', 'رأيك في فيلم الأمس', 'لخّص لي هذا المقطع من الكتاب', 'الخطاب الرسمي وصل أمس', 'شفت صورة حلوة اليوم']) {
    assert.ok(WORD.test(t), 'كلمة وسائط: ' + t);
    assert.equal(calls(t), false, 'لا نداء: ' + t);
  }
  // طلب إنشاء أو ما يطلق مسارًا وحده: المصنّف يُنادى
  for (const t of ['سوّ لي فيديو عن مطعمي', 'ارسم لي شعار مطعم', 'ممكن فيديو عن مطعمي', 'فيديو عن مطعمي قصير', 'اكتب لي إعلان وظيفة للمحاسب', 'عندي شقة للبيع كم أحطّ سعرها', 'أبغى بوستر للعيد']) {
    assert.equal(calls(t), true, 'نداء: ' + t);
  }
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("const tm = setTimeout(() => ctrl.abort(), 2500);"), f + ': مهلة العميل');
    assert.ok(s.includes("(__MEDIA_MAKE_RE.test(text) ? await omranMediaIntent(text) : null); /* v-chat-fast */"), f + ': الشرط');
  }
  assert.ok(read('api/_lib/media-intent.js').includes('timeoutMs: 2200'), 'مهلة الخادم');
});
