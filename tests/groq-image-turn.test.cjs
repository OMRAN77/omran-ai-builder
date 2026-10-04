// tests/groq-image-turn.test.cjs — v-groq-image-turn (لقطة المالك ٤ أكتوبر على الجوّال: دور بعد صورة في المحادثة انتهى بـ
// «الاحتياط فشل أيضًا — Groq: 400 messages[3].content must be a string»). السلسلة:
//   ١. أيّ صورة في تاريخ المحادثة تجعل callGroq يرسل الرسائل بصيغة الرؤية (content مصفوفة) إلى llama-4-scout؛
//   ٢. Groq أوقف Llama 4 (tier.js v-models-latest) فيردّ 404 «does not exist»؛
//   ٣. الخادم (/api/groq) يعامله خطأ نموذج فيجرّب المرشّحين النصّيّين بالرسائل نفسها ← 400 «content must be a string»؛
//   ٤. العميل لا يعدّ هذا خطأ نموذج فلا يهبط إلى «وصف الصورة ثمّ النصّيّ» — فيسقط الاحتياط كلّه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SCOUT = 'meta-llama/llama-4-scout-17b-16e-instruct';
const MUST_STRING = '{"error":{"message":"messages[3].content must be a string","type":"invalid_request_error","param":"messages[3].content"}}';
const GONE = '{"error":{"message":"The model `' + SCOUT + '` does not exist or you do not have access to it.","type":"invalid_request_error","code":"model_not_found"}}';

function loadGroq() {
  const usagePath = require.resolve(path.join(root, 'api/_lib/_usage.js'));
  require.cache[usagePath] = { id: usagePath, filename: usagePath, loaded: true, exports: { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 20, clientIp: () => '1.2.3.4' } };
  const p = require.resolve(path.join(root, 'api/_lib/groq.js'));
  delete require.cache[p];
  delete require.cache[require.resolve(path.join(root, 'api/_lib/free-chain.js'))];
  return require(p);
}
function fakeRes() {
  const r = { code: 0, body: '', headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.send = (b) => { r.body = String(b); return r; };
  r.json = (o) => { r.body = JSON.stringify(o); return r; };
  r.end = () => r;
  return r;
}
async function run(messages, model) {
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/\/models$/.test(u)) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'openai/gpt-oss-120b' }] }), text: async () => '' };
    const b = JSON.parse(init.body);
    calls.push(b.model);
    if (b.model === SCOUT) return { ok: false, status: 404, text: async () => GONE };
    if (b.messages.some((m) => Array.isArray(m.content))) return { ok: false, status: 400, text: async () => MUST_STRING };
    return { ok: true, status: 200, text: async () => '{"choices":[{"message":{"content":"تمام"}}]}' };
  };
  const prevKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-key';
  try {
    const handler = loadGroq();
    const res = fakeRes();
    await handler({ method: 'POST', headers: {}, body: { model, messages, token: '', guestId: 'g' } }, res);
    return { res, calls };
  } finally {
    global.fetch = realFetch;
    if (prevKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = prevKey;
  }
}
const IMG_HISTORY = [
  { role: 'system', content: 'نظام' },
  { role: 'user', content: 'هلا' },
  { role: 'assistant', content: 'هلا والله' },
  { role: 'user', content: [{ type: 'text', text: 'شوف الصورة' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
  { role: 'assistant', content: 'شفتها' },
  { role: 'user', content: 'قولي شو أسوي' },
];

test('١. الخادم: دور فيه صورة لا يُرسَل بمصفوفته إلى النماذج النصّيّة — يُعاد خطأ نموذج الرؤية نفسه (404) فيهبط العميل إلى الوصف', async () => {
  const { res, calls } = await run(IMG_HISTORY, SCOUT);
  assert.deepEqual(calls, [SCOUT], 'نموذج الرؤية المطلوب وحده — لا gpt-oss بصورة');
  assert.equal(res.code, 404);
  assert.match(res.body, /does not exist/);
  assert.doesNotMatch(res.body, /must be a string/);
});

test('٢. الخادم: الدور النصّيّ كما كان — اسم متقاعد يُستبدل بالمرشّحين وينجح', async () => {
  const { res, calls } = await run([{ role: 'user', content: 'هلا' }], 'llama-3.3-70b-versatile');
  assert.equal(res.code, 200);
  assert.equal(calls[0], 'openai/gpt-oss-120b');
});

test('٣. العميل: «content must be a string» من Groq يُعامَل كغياب الرؤية فيهبط إلى «وصف الصورة ثمّ النصّيّ»', () => {
  const src = fs.readFileSync(path.join(root, 'js/app-06-checkout.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function callGroq(messages, onDelta){'), src.indexOf('async function __groqSend(model, msgsOut, onDelta){'));
  const m = fn.match(/const __modelErr = !!\(e && \(e\.status === 404 \|\| (\/[^\n]+\/i)\.test\(__t\)\)\);/);
  assert.ok(m, 'تمييز خطأ النموذج في callGroq');
  const re = eval(m[1]); // eslint-disable-line no-eval
  assert.ok(re.test('خطأ 400 - ' + MUST_STRING), 'لقطة المالك');
  assert.ok(re.test(GONE));
  assert.ok(!re.test('invalid image'), 'صورة تالفة ليست غياب رؤية');
  assert.ok(!re.test('rate limit'), 'ولا حدّ الطلبات');
  assert.ok(fn.includes('return await __groqSend(textModel, await stripImagesWithDescription(messages), onDelta);'));
});
