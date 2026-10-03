// v-guide-next (المالك ٣ أكتوبر: «أنا في الصفحة هذي وينقلني للي بعدها، وإذا ما أعرف يعطيني بالضبط وين أدخل المعلومات»):
// الكاشف فاته ١٤ من ٢٠ صيغة حقيقيّة، والمتابعة القصيرة كانت تُسقط الإرشاد وسط الخطوات.
// يشغّل api/_lib/chat.js الحقيقيّ بمخزن ذاكرة وfetch مزيّف يلتقط طلب الوسيط.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'guide-next-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.OWNER_USERNAMES = 'guide-owner';
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
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const chat = require(rp('api/_lib/chat.js'));
const g = require(rp('api/_lib/site-guide.js'));

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

async function sysFor(provider, user, messages) {
  const bodies = [];
  const saveFetch = global.fetch;
  global.fetch = async (url, options) => { bodies.push(JSON.parse(options.body)); return textStream('تمام'); };
  const req = { method: 'POST', headers: {}, body: { messages, token: token(user), provider, tz: 'Asia/Dubai' } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write() {}, end() {} };
  try { await chat(req, res); } finally { global.fetch = saveFetch; }
  const sys = bodies[0].system;
  return Array.isArray(sys) ? sys.map((b) => b.text).join('') : String(sys || '');
}
const U = (c) => ({ role: 'user', content: c });
const A = (c) => ({ role: 'assistant', content: c });

test('١. صيغ الإرشاد الحقيقيّة كلّها تُلتقط', () => {
  for (const q of ['انا في الصفحه هذي وين ادخل المعلومات', 'انا في هالصفحة، وش الخطوة الجاية؟', 'وين اكتب رقم الهوية', 'وين أحط رقم الجواز',
    'وين اعبي البيانات', 'تمام سويتها، بعدها وش اسوي', 'ما اعرف اكمل', 'وين اضغط', 'انقلني للصفحة اللي بعدها', 'وش الصفحة اللي بعدها',
    'كيف أكمل التسجيل', 'ما لقيته', 'what do I do next', 'where do I enter my ID', 'وين ادقل الرقم', 'كيف أعبي النموذج']) {
    assert.ok(g.SITE_GUIDE_RE.test(q), q);
  }
});

test('٢. غير الإرشاد لا يُلتقط', () => {
  for (const q of ['اشرح لي الذكاء الاصطناعي', 'كيف حالك', 'اكتب قصيدة', 'كيف اكتب قصيدة عن البحر', 'وش آخر الأخبار',
    'بعدين نكمل', 'ما اعرف ايش اطبخ', 'الحين كم الساعة', 'كم سعر الذهب']) {
    assert.ok(!g.SITE_GUIDE_RE.test(q), q);
  }
});

test('٣. المتابعة القصيرة أو اللقطة بعد سؤال إرشاد تبقى إرشادًا؛ بلا سؤال إرشاد قبلها أو برسالة طويلة لا', () => {
  const start = [U('كيف اجدد الاقامة؟'), A('١. ادخل «الخدمات»')];
  assert.ok(g.isGuideTurn(start.concat([U('خلصت هذي الصفحة وبعدين؟')])));
  assert.ok(g.isGuideTurn(start.concat([U('طيب والحين؟')])));
  assert.ok(g.isGuideTurn(start.concat([U([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' } }, { type: 'text', text: 'هنا' }])])));
  assert.ok(!g.isGuideTurn([U('اكتب قصيدة'), A('…'), U('طيب والحين؟')]));
  assert.ok(!g.isGuideTurn(start.concat([U('اشرح لي ' + 'تفاصيل كثيرة '.repeat(15))])));
});

test('٤. المعالج الحقيقيّ: «طيب والحين؟» بعد سؤال إرشاد تحمل القاعدة لكلّ مزوّد، للمالك ولغيره', async () => {
  const convo = [U('كيف اجدد الاقامة؟'), A('١. ادخل «الخدمات»'), U('طيب والحين؟')];
  for (const prov of ['claude', 'gemini', 'groq', 'mistral']) {
    for (const user of ['guide-owner', 'someone-else']) {
      assert.ok((await sysFor(prov, user, convo)).includes(g.SITE_GUIDE_MARK), prov + '/' + user);
    }
  }
  assert.ok(!(await sysFor('gemini', 'someone-else', [U('اكتب قصيدة'), A('…'), U('طيب والحين؟')])).includes(g.SITE_GUIDE_MARK));
});

test('٥. القاعدة تحمل الخطوة التالية من حيث يقف، وموضع الحقل بالضبط، والعميل نسخة مطابقة', () => {
  assert.ok(g.SITE_GUIDE_NOTE.includes('أعطه الخطوة التالية وحدها واضحة مع رابطها'));
  assert.ok(g.SITE_GUIDE_NOTE.includes('سمِّ الحقل حرفيًّا كما هو مكتوب في الصفحة'));
  assert.ok(g.SITE_GUIDE_NOTE.includes('خلف تسجيل دخول فلم تقرأها فقل ذلك واطلب لقطتها'));
  const a = fs.readFileSync(path.join(root, 'js/app-09-attach.js'), 'utf8');
  const ctx = {};
  vm.runInNewContext(a.slice(a.indexOf('const OMRAN_SITE_GUIDE_RE'), a.indexOf('\n', a.indexOf('const OMRAN_SITE_GUIDE_NOTE'))).replace(/const /g, 'this.'), ctx);
  assert.equal(ctx.OMRAN_SITE_GUIDE_NOTE, g.SITE_GUIDE_NOTE.trim());
  assert.equal(ctx.OMRAN_SITE_GUIDE_RE.source, g.SITE_GUIDE_RE.source);
});
