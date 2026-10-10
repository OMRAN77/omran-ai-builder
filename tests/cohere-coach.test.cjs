// v-cohere-coach (أمر المالك ٢٧ سبتمبر: «غذّه بمعلومات عامّة وآخر التحديثات والبحث في الويب… كأنّه طفلي
// وأعلّمه ما هو الأفضل»): المالك خام (v-owner-raw2) فكان Cohere يصله بلا نظام أصلًا — بلا تاريخ ولا
// توجيه للبحث ولا تعليماته المخصّصة. الآن Cohere وحده للمالك يحمل ملاحظة التوجيه + تعليماته + التاريخ،
// وبقيّة المزوّدين للمالك خام كما كانوا، وغير المالك بلا تغيير.
//
// يشغّل api/_lib/chat.js الحقيقيّ بمخزن ذاكرة وfetch مزيّف يلتقط طلب الوسيط.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'cohere-coach-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.OWNER_USERNAMES = 'coach-owner';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

const root = path.join(__dirname, '..');
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
  checkAndConsume: async () => ({ allowed: true, username: 'x' }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '\n\n[ملفّ-المالك-للفحص]' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const chat = require(rp('api/_lib/chat.js'));

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
const textStream = (text) => new Response([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
].map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

async function ask(provider, user, raw, text) {
  const bodies = [];
  const saveFetch = global.fetch;
  global.fetch = async (url, options) => { bodies.push(JSON.parse(options.body)); return textStream('تمام'); };
  const req = { method: 'POST', headers: {}, body: {
    messages: [{ role: 'user', content: text || 'وش آخر تحديثات الهواتف هالشهر؟' }],
    token: token(user), provider, tz: 'Asia/Dubai',
    customInstructions: 'علّمتك: قارن دائمًا بالسعر قبل المواصفات.',
    ...(raw ? { raw: true } : {}),
  } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write() {}, end() {} };
  try { await chat(req, res); } finally { global.fetch = saveFetch; }
  const sys = bodies[0].system;
  return { body: bodies[0], sysText: Array.isArray(sys) ? sys.map((b) => b.text).join('') : String(sys || '') };
}

test('١. المالك على Cohere: توجيه + بحث + تعليماته + ملفّه + التاريخ', async () => {
  const r = await ask('cohere', 'coach-owner', true); // v-owner-full: الخام/التوجيه صار اختياريًّا
  assert.equal(r.body.model, 'cohere/command-a');
  assert.ok(r.body.tools.some((t) => t.name === 'web_search'), 'أداة البحث موصولة');
  assert.match(r.sysText, /بيانات تدريبك قديمة/);
  assert.match(r.sysText, /استدعِ web_search أوّلًا/);
  assert.match(r.sysText, /اختر واحدًا وقل لماذا/);
  assert.ok(r.sysText.includes('علّمتك: قارن دائمًا بالسعر قبل المواصفات.'), 'ما علّمه المالك يصل');
  assert.ok(r.sysText.includes('[ملفّ-المالك-للفحص]'), 'ملفّ المالك يصل');
  assert.match(r.sysText, /التاريخ والوقت الآن/);
  assert.ok(!r.sysText.includes('أنت «عمران»'), 'بلا بصمة الشخصيّة العامّة — التوجيه خاصّ بالمالك');
  const sys = r.body.system;
  assert.ok(Array.isArray(sys) && sys.length === 2 && sys[0].cache_control && !/التاريخ والوقت الآن/.test(sys[0].text), 'الثابت مخزّن والتاريخ خارج الكاش');
});

test('٢. المالك على غير Cohere مع raw:true: خام كما كان (v-owner-raw2)', async () => {
  const r = await ask('mistral', 'coach-owner', true);
  assert.equal(r.sysText, '');
});

test('٣. غير المالك على Cohere: النظام العامّ كما كان بلا توجيه المالك', async () => {
  const r = await ask('cohere', 'someone-else');
  assert.ok(r.sysText.includes('أنت «عمران»'));
  assert.ok(!/بيانات تدريبك قديمة/.test(r.sysText));
});

/* v-owner-full (أمر المالك ٢ أكتوبر: «رجع كل شي القديم مع الجديد»): الخام كان يحرم المالك من التاريخ
   وقاعدة «ابحث أوّلًا» فصار المحرّك يطلب منه الأسماء بدل أن يبحث. الافتراضيّ الآن النظام الكامل. */
test('٤. المالك افتراضيًّا: النظام الكامل — البصمة + البحث أوّلًا + التاريخ + قواعد الصور + تعليماته', async () => {
  for (const prov of ['cohere', 'mistral']) {
    const r = await ask(prov, 'coach-owner');
    // v-owner-identity (المالك ٨ أكتوبر): النظام الكامل كما هو، إلّا الهويّة — اسم المزوّد الحقيقيّ بدل «أنت عمران» وقاعدة الإخفاء
    assert.match(r.sysText, prov === 'cohere' ? /أنت Command من Cohere/ : /أنت Mistral من Mistral AI/, prov + ': البصمة بهويّته الحقيقيّة');
    assert.ok(!r.sysText.includes('أنت «عمران»'), prov + ': لا «أنت عمران» للمالك');
    assert.ok(r.sysText.includes('[البحث]: لأيّ سؤال يطلب معلومة أو حقيقة استدعِ web_search أوّلًا'), prov + ': ابحث أوّلًا');
    // v-tokens-cache: التاريخ يصل الموديل في ذيل رسالة المستخدم الأخيرة (خارج بادئة الكاش)، لا في النظام
    const lastU = r.body.messages[r.body.messages.length - 1];
    const tailText = Array.isArray(lastU.content) ? lastU.content.map((b) => b.text || '').join('') : String(lastU.content);
    assert.match(tailText, /التاريخ والوقت الآن/, prov);
    assert.ok(!/التاريخ والوقت الآن/.test(r.sysText), prov + ': لا وقت بالدقيقة في النظام');
    assert.ok(r.sysText.includes('generate_image للرسم'), prov + ': رسم الصور من الكلام');
    assert.ok(r.sysText.includes('علّمتك: قارن دائمًا بالسعر قبل المواصفات.'), prov + ': تعليماته');
    const d = await ask(prov, 'coach-owner', false, 'ارسم لي صورة قطة على شاطئ وقت الغروب');
    assert.ok(d.body.tools.some((t) => t.name === 'generate_image'), prov + ': بناء الصورة من الكلام — أداة الرسم موصولة');
    assert.ok(d.sysText.includes('فأجب بصدق باسمك الحقيقيّ'), prov + ': والنظام الكامل في دور الرسم');
  }
});
