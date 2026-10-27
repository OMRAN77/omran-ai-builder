// tests/code-not-primary.test.cjs — v-code-not-primary: Claude Code يبقى بصلاحيّاته لكنّه ليس الأساسيّ.
// المالك ١١ أكتوبر: «الفاتورة كلّها راحت في كودي… لا تشيله، خلّه صلاحيّات… يعني ما يكون الأساسيّ… أريد كلّ مزوّد يقرأ
// ويرفع ويدمج». المزوّدون كانوا يفوّضون من أنفسهم (حتّى إصلاح التمرير #982)، وكلّ تفويض تشغيل كامل على رصيد Anthropic.
// الآن: الخادم يرفض delegate_code_task ما لم يسمِّ المالك Claude Code في رسالته الأخيرة، والتعليمات تقول «عدّل أنت».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'code-not-primary-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const db = new Map();
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {} });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'omran' }) });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
// الوحدة الحقيقيّة (الحارس ونصّ الرفض) مع جاسوس بدل الإطلاق على GitHub
const realDelegate = require(rp('api/_lib/agent-delegate.js'));
const started = [];
stub('api/_lib/agent-delegate.js', Object.assign({}, realDelegate, { startTask: async (input) => { started.push(input); return { ok: true, issue: 1, issueUrl: 'https://github.com/OMRAN77/omran-ai-builder/issues/1' }; } }));
const chat = require(rp('api/_lib/chat.js'));
const D = realDelegate;

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const toolTurn = (name, input) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu-1', name } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
]);
const textTurn = (text) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
]);
async function ownerAsks(text) {
  const bodies = [];
  const save = global.fetch;
  global.fetch = async (url, o) => {
    bodies.push({ url: String(url), body: o && o.body ? JSON.parse(o.body) : null });
    return bodies.length === 1 ? toolTurn('delegate_code_task', { task: 'أصلح تمرير المحادثة في js/app-09-attach.js', title: 'تمرير' }) : textTurn('تمام.');
  };
  const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: text }], token: token('omran'), provider: 'claude' } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write() {}, end() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  return bodies;
}

test('the detector: the owner names Claude Code (with a hand-over verb, or "Claude Code", or "فوّض"); "كودي" meaning "my code" and negations do not count', () => {
  const yes = ['خلّ كودي يسويها', 'خل كودي يصلح التمرير', 'عطها كودي', 'سلّمها لكودي', 'سلم المهمة لكودي', 'حوّلها لكودي', 'كودي يسويها', 'كودي يصلحه', 'Claude Code يصلحها', 'claude code', 'كلود كود يشتغل عليها', 'فوّض المهمّة', 'فوضها', 'delegate it'];
  const no = ['عدّل كودي', 'شوف كودي', 'كودي فيه خطأ', 'كودي يسوي مشكلة', 'كودي يشتغل؟', 'خلني أشوف كودي', 'خليني اعدل كودي', 'عطني كودي', 'لا تفوّض', 'لا تعطيها كودي', 'بدون كودي', 'مااريد كودي يتدخل', 'لا تستخدم Claude Code', 'ادمج', 'شيل الزر', 'صلّح التمرير', ''];
  for (const t of yes) assert.equal(D.ownerAsksCode(t), true, 'يُعدّ طلبًا: ' + t);
  for (const t of no) assert.equal(D.ownerAsksCode(t), false, 'ليس طلبًا: ' + t);
});

test('real chat handler: the owner asks a fix without naming Claude Code → no dispatch, the model gets the refusal; naming it → dispatched once', async () => {
  started.length = 0;
  const b1 = await ownerAsks('صلّح تمرير المحادثة، ما يتبع تحت');
  assert.equal(started.length, 0, 'لا تشغيل لـClaude Code');
  const back = JSON.stringify(b1[1] && b1[1].body);
  assert.ok(back.includes('لا تفويض: أنت المنفّذ'), 'نتيجة الأداة للنموذج: الرفض وسببه');
  assert.ok(!/خلّ كودي يسويها|«Claude Code»/.test(back), 'v-self-only: الرفض لا يعلّم المزوّد كيف يطلب تسليمه لكودي');
  assert.ok(back.includes('read_github ثمّ edit_github'), 'وماذا يفعل بدلًا منه');

  const b2 = await ownerAsks('خلّ كودي يسويها');
  assert.equal(started.length, 1, 'بالاسم: يُسلَّم مرّة');
  assert.ok(!JSON.stringify(b2[1] && b2[1].body).includes('لا تفويض: أنت المنفّذ'));
});

test('instructions everywhere say "you edit"; delegation only when the owner names it — and the agent has the same guard', () => {
  const agent = read('api/_lib/agent.js');
  assert.match(agent, /cb\.name === 'delegate_code_task'[\s\S]{0,300}delegate\.ownerAsksCode\(living\.lastUserText\(messages\)\)\) result = delegate\.DELEGATE_REFUSAL/);
  assert.match(read('api/_lib/chat.js'), /cb\.name === 'delegate_code_task'[\s\S]{0,300}__dl\.ownerAsksCode\(lastUserText\)\) result = __dl\.DELEGATE_REFUSAL/);
  assert.match(agent, /25-ز\. delegate_code_task وcheck_code_task \(للمالك وحده\): Claude Code ليس طريقك الأساسيّ/);
  assert.ok(!agent.includes('سلّمه فورًا لكودي'), 'لا «سلّمه فورًا لكودي»');
  assert.match(D.START_TOOL.description, /^ليست طريقك الأساسيّ: استدعها فقط إذا طلب المالك/);
  const K = read('api/_lib/_knowledge.js');
  assert.match(K, /ثمّ عدّله أنت بـedit_github[^\n]*لا يُستدعى إلّا إذا طلبه عمران بالاسم/);
  assert.ok(!K.includes('سلّم التنفيذ لكودي'), 'لا «سلّم التنفيذ لكودي»');
  const GE = require(rp('api/_lib/github-edit.js'));
  assert.match(GE.WORK_NOTE, /- أنت من ينفّذ مهما كبرت المهمّة[^\n]*يرفضه الخادم إلّا إذا طلبه المالك بالاسم/);
  assert.ok(!/مهمّة كبيرة[^\n]*فوّضها/.test(GE.WORK_NOTE), 'لا «مهمّة كبيرة… فوّضها»');
  const PL = require(rp('api/_lib/provider-level.js'));
  assert.ok(!/فوّضه بـdelegate_code_task|يمرّ بـdelegate_code_task|عمل delegate_code_task/.test(PL.OWNER_METHOD), 'المنهج بلا إحالة إلى التفويض');
  assert.match(PL.OWNER_METHOD, /تُبنى إلى js\/app\.bundle\.js تلقائيًّا داخل edit_github وwrite_github في الالتزام نفسه/);
  // الصلاحيّة باقية: الأداتان في أدوات المالك كما هما
  assert.ok(read('api/_lib/chat.js').includes("require('./agent-delegate.js').START_TOOL, require('./agent-delegate.js').CHECK_TOOL"));
});
