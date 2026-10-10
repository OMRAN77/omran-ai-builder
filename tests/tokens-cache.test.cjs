// tests/tokens-cache.test.cjs — v-tokens-cache · v-tokens-close · v-tokens-dedupe (تدقيق التوكنز ١٠ أكتوبر).
// العرض: قيس بمعالج chat.js الحقيقيّ أنّ الكاش «يخسر بدل أن يوفّر»: سطر الوقت بالدقيقة وملاحظات الدور قبل التاريخ
// فتُكتب البادئة بسعر ١٫٢٥ كلّ دور ولا يقرؤها التالي؛ وزرّ الإيقاف لا يوقف نداءات المزوّد؛ وقاعدة الموضوع تُرسل مرّتين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { EventEmitter } = require('node:events');

process.env.AUTH_SECRET = 'tokens-cache-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CHAT_PROMPT_CACHE;
const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const db = new Map();
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? db.get(k) : null), kvPutJSON: async (k, v) => { db.set(k, v); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {} });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'u' }) });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));
const T = chat.__tokens;

const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const textReply = (t) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const toolReply = () => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu-1', name: 'web_search' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"رسوم الرخصة"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
]);
const TOPIC = 'قاعدة الموضوع (أولوية قصوى): رسالة المستخدم الأخيرة تحدّد الموضوع الحاليّ.';
function fakeRes() {
  const r = new EventEmitter();
  r.writableEnded = false;
  r.setHeader = () => {}; r.status = () => r; r.json = () => r; r.write = () => true; r.flushHeaders = () => {};
  r.end = () => { r.writableEnded = true; r.emit('close'); return r; };
  return r;
}
const modelCalls = (bodies) => bodies.filter((b) => b && Array.isArray(b.messages) && b.max_tokens);
const strip = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'cache_control' ? undefined : x)));
const blocks = (m) => (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content);

async function turn(messages, opts) {
  const o = opts || {};
  const bodies = [];
  const save = global.fetch;
  const res = fakeRes();
  global.fetch = async (url, init) => {
    let b = {}; try { b = JSON.parse(init.body); } catch (e) { /* ليس JSON — نداء جانبيّ */ }
    bodies.push(b);
    if (o.onModel && b.max_tokens) return o.onModel(res, modelCalls(bodies).length);
    return textReply('تمام');
  };
  try { await chat({ method: 'POST', headers: {}, body: { messages, token: token(o.user || 'sara-t'), provider: 'claude', tz: 'Asia/Dubai' } }, res); }
  finally { global.fetch = save; }
  return modelCalls(bodies);
}

test('١. بادئة الكاش متطابقة بين دورين: النظام والأدوات ورسالة الدور الأوّل كما خُزّنت تُقرأ في الدور الثاني', async () => {
  const q1 = 'وش أفضل طريقة أسجل رخصة تجارية في أبوظبي؟';
  const t1 = (await turn([{ role: 'system', content: TOPIC }, { role: 'user', content: q1 }]))[0];
  const t2 = (await turn([{ role: 'system', content: TOPIC }, { role: 'user', content: q1 }, { role: 'assistant', content: 'الجواب الأوّل' }, { role: 'user', content: 'وكم الرسوم؟' }]))[0];
  assert.ok(t1 && t2, 'نداءان للمزوّد');
  assert.ok(Array.isArray(t1.system) && t1.system.some((b) => b.cache_control), 'النظام كتل معلَّمة');
  assert.equal(JSON.stringify(t2.system), JSON.stringify(t1.system), 'النظام بايت ببايت بين الدورين');
  assert.equal(JSON.stringify(t2.tools), JSON.stringify(t1.tools), 'الأدوات نفسها');
  // الدور الأوّل: العلامة على كلام المستخدم، وذيل الدور (الوقت والموقع) كتلة بعدها خارج البادئة
  const u1 = blocks(t1.messages[t1.messages.length - 1]);
  const mark = u1.findIndex((b) => b.cache_control);
  assert.ok(mark >= 0 && mark < u1.length - 1, 'ذيل الدور بعد علامة الكاش');
  assert.match(u1[u1.length - 1].text, /التاريخ والوقت الآن/);
  assert.ok(!JSON.stringify(t1.system).includes('التاريخ والوقت الآن'), 'لا وقت بالدقيقة في النظام');
  // الدور الثاني: رسالة الدور الأوّل في التاريخ = ما خُزّن حتّى العلامة حرفيًّا (بلا ذيل)
  assert.deepEqual(strip(blocks(t2.messages[0])), strip(u1.slice(0, mark + 1)));
});

test('٢. قاعدة الموضوع مرّة واحدة: نسخة العميل لا تتكرّر بجانب نسخة النظام', async () => {
  const t = (await turn([{ role: 'system', content: TOPIC }, { role: 'user', content: 'اشرح لي الذكاء الاصطناعي ببساطة' }]))[0];
  const sys = JSON.stringify(t.system);
  assert.equal(sys.split('قاعدة الموضوع (أولوية قصوى)').length - 1, 1, 'مرّة واحدة (نسخة PERSONA_NOTE الأشمل) — كانت مرّتين');
  assert.equal(T.isClientTopicRule(TOPIC), true);
  assert.equal(T.isClientTopicRule('ملاحظة أخرى'), false);
});

test('٣. رحيل العميل أثناء الردّ: لا جولة أدوات ولا نداء مزوّد بعده', async () => {
  const calls = await turn([{ role: 'user', content: 'كم رسوم الرخصة التجارية في دبي؟' }], {
    onModel: (res, n) => { if (n === 1) res.emit('close'); return n === 1 ? toolReply() : textReply('لن يصل'); },
  });
  assert.equal(calls.length, 1, 'نداء واحد للمزوّد ثمّ توقّف — كان يكمل البحث والجولة التالية');
});

test('٤. بلا رحيل: الجولة نفسها تكمل كما كانت (أداة ثمّ ردّ)', async () => {
  const calls = await turn([{ role: 'user', content: 'كم رسوم الرخصة التجارية في دبي؟' }], {
    onModel: (res, n) => (n === 1 ? toolReply() : textReply('الرسوم كذا')),
  });
  assert.ok(calls.length >= 2, 'الجولة الثانية بعد الأداة وصلت المزوّد');
});

test('٥. المساعدات: withTurnTail نسخة لا تعديل، وإغلاق بعد الإنهاء ليس رحيلًا', () => {
  const list = [{ role: 'user', content: 'سؤال' }];
  const out = T.withTurnTail(list, 0, '\n\n[ذيل]');
  assert.notEqual(out, list);
  assert.equal(list[0].content, 'سؤال', 'الأصل لم يُمسّ');
  assert.deepEqual(out[0].content, [{ type: 'text', text: 'سؤال' }, { type: 'text', text: '\n\n[ذيل]' }]);
  assert.equal(T.withTurnTail(list, 0, ''), list, 'بلا ذيل = كما هي');
  const r = fakeRes(); const st = T.watchClientGone(r);
  r.end();
  assert.equal(st.gone, false, 'close بعد end طبيعيّ');
  const r2 = fakeRes(); const st2 = T.watchClientGone(r2);
  r2.emit('close');
  assert.equal(st2.gone, true); assert.equal(st2.signal.aborted, true);
});
