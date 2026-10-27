// tests/prov-self-files.test.cjs — v-prov-self (٢): ملفّ لكلّ مزوّد يصلح فيه نفسه، ودروس عامّة بـ«عمّم».
// المالك ١١ أكتوبر: «تقدر تعطي كلّ واحد صلاحيّات يصلح نفسه من غير تدخّلك… فقط للمالك… كلّ واحد يتصرّف في ملفّه»، ثمّ
// «زوّدت كلاود بمعلومة عامّة… تنتقل للمستخدمين؟» — قبلها: لا مخزن مشترك، كلّ ما يُقال يبقى في ذاكرة قائله.
// يثبت بـchat.js وai.js الحقيقيّين (مزوّد وهميّ يسجّل النظام المرسَل): الملفّ يُكتب بأداة المزوّد ويصل نظامه هو وحده، والدرس يُجرَّب
// على المالك وحده ثمّ «عمّم» تنشره لمستخدم عاديّ في المسارين؛ وبلا «عمّم» لا نشر؛ وغير المالك لا يكتب شيئًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'prov-self-files-secret';
process.env.OPENROUTER_API_KEY = 'test-or-key';
process.env.ANTHROPIC_API_KEY = 'test-anth-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'OWNER_USERNAMES']) delete process.env[k];

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
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }) });
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const PS = require(rp('api/_lib/prov-self.js'));
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (evs) => new Response(evs.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'm', usage: { input_tokens: 1, output_tokens: 0 } } });
const toolTurn = (name, input) => sse([start(), { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name, input: {} } }, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } }]);
const textTurn = (t) => sse([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }]);
const sysOf = (b) => (typeof b.system === 'string' ? b.system : Array.isArray(b.system) ? b.system.map((x) => x.text || '').join('') : '');

// دور محادثة: script = دوال تُرجع ردّ المزوّد بالترتيب؛ يرجع الأجسام المرسَلة ونتائج الأدوات العائدة
async function turn(user, provider, text, script, history) {
  usageUser = user;
  const bodies = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (!/openrouter\.ai\/api\/v1\/messages|api\.anthropic\.com\/v1\/messages/.test(u)) return new Response('{}', { status: 404 });
    bodies.push(JSON.parse(init.body));
    return (script[Math.min(i++, script.length - 1)])();
  };
  const req = { method: 'POST', headers: {}, body: { token: token(user), provider, messages: history || [{ role: 'user', content: text }] } };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const toolResults = bodies.slice(1).map((b) => JSON.stringify(b.messages)).join(' ');
  return { bodies, sys: bodies[0] ? sysOf(bodies[0]) : '', toolResults };
}

test('each provider writes its own file with its own tool; it reaches that provider only, and undo brings the last version back', async () => {
  db.clear(); PS.__resetCache();
  const w = await turn('omran', 'deepseek', 'احفظ في ملفّك: لا تبدأ ردودك بـ«بالتأكيد»', [() => toolTurn('edit_self', { action: 'write', text: 'لا أبدأ ردودي بـ«بالتأكيد».' }), () => textTurn('حفظت.')]);
  assert.ok(w.bodies[0].tools.some((t) => t.name === 'edit_self') && w.bodies[0].tools.some((t) => t.name === 'teach_users'), 'الأداتان للمالك');
  assert.match(w.toolResults, /حُفظ ملفّك/);
  assert.equal(db.get('db/prov-self/deepseek.json').text, 'لا أبدأ ردودي بـ«بالتأكيد».', 'ملفّ DeepSeek نفسه');
  assert.ok(!db.has('db/prov-self/claude.json'), 'لا ملفّ لغيره');
  const next = await turn('omran', 'deepseek', 'هلا', [() => textTurn('هلا')]);
  assert.match(next.sys, /\[ملفّك — تعليماتك لنفسك[^\]]*\]:\nلا أبدأ ردودي بـ«بالتأكيد»\./, 'يصل نظام DeepSeek في الدور التالي');
  const other = await turn('omran', 'mistral', 'هلا', [() => textTurn('هلا')]);
  assert.ok(!/\[ملفّك — تعليماتك لنفسك[^\]]*\]:\nلا أبدأ ردودي بـ«بالتأكيد»\./.test(other.sys), 'ملفّ DeepSeek لا يُحقن عند Mistral');
  await turn('omran', 'deepseek', 'غيّره', [() => toolTurn('edit_self', { action: 'write', text: 'نسخة ثانية.' }), () => textTurn('تمام')]);
  assert.equal(db.get('db/prov-self/deepseek.json').text, 'نسخة ثانية.');
  const u = await turn('omran', 'deepseek', 'رجّعه', [() => toolTurn('edit_self', { action: 'undo' }), () => textTurn('رجعته')]);
  assert.match(u.toolResults, /رجع ملفّك للنسخة السابقة/);
  assert.equal(db.get('db/prov-self/deepseek.json').text, 'لا أبدأ ردودي بـ«بالتأكيد».');
});

test('a user cannot touch any file or lesson: the tools are not offered, and the executor refuses anyway', async () => {
  const r = await turn('vipuser', 'deepseek', 'هلا', [() => textTurn('هلا')]);
  assert.ok(!(r.bodies[0].tools || []).some((t) => t.name === 'edit_self' || t.name === 'teach_users'), 'لا أدوات للمستخدم');
  assert.equal(await PS.runSelf('deepseek', { action: 'write', text: 'x' }, false), '✗ ملفّ المزوّد للمالك وحده.');
  assert.equal(await PS.runTeach({ action: 'add', text: 'x' }, 'عمّم', false), '✗ الدروس العامّة للمالك وحده.');
});

test('a lesson: tried on the owner first, not on users; no «عمّم» = refused; «عمّم» = every user on every provider, in both the tool path and the legacy path', async () => {
  db.clear(); PS.__resetCache();
  const LESSON = 'إذا سأل المستخدم عن سعر الذهب فاذكر سعر الغرام بالدرهم أوّلًا.';
  await turn('omran', 'claude', 'علّم هذا للناس: ' + LESSON, [() => toolTurn('teach_users', { action: 'add', text: LESSON }), () => textTurn('حفظته')]);
  const items = db.get('db/lessons.json').items;
  assert.equal(items.length, 1);
  assert.equal(items[0].scope, 'owner');
  const ownerSees = await turn('omran', 'gemini', 'هلا', [() => textTurn('هلا')]);
  assert.ok(ownerSees.sys.includes(LESSON + ' (تجربة — للمالك وحده)'), 'المالك يجرّبه');
  const userBefore = await turn('vipuser', 'gemini', 'كم سعر الذهب', [() => textTurn('…')]);
  assert.ok(!userBefore.sys.includes(LESSON), 'المستخدم لا يراه قبل «عمّم»');
  const noWord = await turn('omran', 'claude', 'تمام انشره', [() => toolTurn('teach_users', { action: 'publish' }), () => textTurn('…')]);
  assert.match(noWord.toolResults, /لا نشر بلا «عمّم»/);
  assert.equal(db.get('db/lessons.json').items[0].scope, 'owner');
  const pub = await turn('omran', 'claude', 'عمّم', [() => toolTurn('teach_users', { action: 'publish' }), () => textTurn('نشرته')]);
  assert.match(pub.toolResults, /نُشر الدرس/);
  assert.equal(db.get('db/lessons.json').items[0].scope, 'all');
  for (const p of ['gemini', 'deepseek', 'claude', 'openrouter']) {
    const r = await turn('vipuser', p, 'كم سعر الذهب', [() => textTurn('…')]);
    assert.ok(r.sys.includes('[دروس عمران العامّة — طبّقها في ردودك]:\n- ' + LESSON), 'مسار الأدوات · ' + p);
  }
  // المسار القديم (api/ai.js → مزوّد بملفّه): ملاحظة الخادم ثمّ الدرس
  let seen = null;
  stub('api/_lib/gemini.js', async (req, res) => { seen = req.body; res.status(200).json({ ok: true }); });
  delete require.cache[rp('api/ai.js')];
  const ai = require(rp('api/ai.js'));
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, end() {}, getHeader() { return null; } };
  await ai({ method: 'POST', headers: { host: 'x' }, query: { action: 'gemini' }, body: { contents: [{ role: 'user', parts: [{ text: 'كم سعر الذهب' }] }], systemInstruction: 'أنت مساعد.' } }, res);
  const si = seen && (typeof seen.systemInstruction === 'string' ? seen.systemInstruction : JSON.stringify(seen.systemInstruction));
  assert.ok(si && si.includes(LESSON), 'المسار القديم: ' + String(si).slice(-200));
});

// v-lessons-all (المالك ١٢ أكتوبر «اريدهم كلهم»): الدروس المنشورة تصل المسار المجّانيّ (ومعه المدفوع بصورة بلا مسار رؤية) ووكيل غير المالك.
test('published lessons reach the free chain and the non-owner agent; the agent gives a user published lessons only', async () => {
  const fs = require('node:fs');
  const chatSrc = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');
  const agentSrc = fs.readFileSync(path.join(root, 'api/_lib/agent.js'), 'utf8');
  assert.ok(chatSrc.includes("const __fr = await streamFreeChain({ system: __rawOwner && !__freeLane ? '' : PERSONA_NOTE + '\\n' + baseSystem + nowNote(body && body.tz) + __provSelfSys"), 'السلسلة المجّانيّة تأخذ الدروس');
  assert.ok(/system \+= await require\('\.\/prov-self\.js'\)\.systemBlocks\(isOwner\(runUser\), 'claude'/.test(agentSrc), 'الوكيل لكلّ مستخدم');
  assert.ok(!/if \(isOwner\(runUser\)\) \{ try \{ system \+= await require\('\.\/prov-self\.js'\)/.test(agentSrc), 'لا شرط مالك على الدروس في الوكيل');
  db.clear(); PS.__resetCache();
  db.set('db/lessons.json', { items: [{ id: 'a', text: 'منشور', scope: 'all' }, { id: 'b', text: 'تجربة', scope: 'owner' }] });
  const u = await PS.systemBlocks(false, 'claude');
  assert.ok(u.includes('- منشور') && !u.includes('تجربة'), 'المستخدم: المنشور وحده');
  const o = await PS.systemBlocks(true, 'claude');
  assert.ok(o.includes('- منشور') && o.includes('تجربة (تجربة — للمالك وحده)'), 'المالك: الكلّ');
});

// v-liked-all (أمر المالك ١٢ أكتوبر «اريد تعميم — اذا عجبني شي يتعمم على الجميع»): «عجبني» = حفظ ونشر بخطوة واحدة لكلّ مستخدم على كلّ مزوّد؛
// بلا كلمته أو مع نفيها يبقى تجربة ويُسأل؛ و«عجبني» تنشر درسًا سابقًا كـ«عمّم».
test('«عجبني» generalizes in one step: saved and published to every user on every provider; negated or absent = trial only', async () => {
  db.clear(); PS.__resetCache();
  const WAY = 'ابدأ الجواب بالخلاصة في سطر ثمّ التفاصيل نقاطًا قصيرة.';
  const liked = await turn('omran', 'claude', 'عجبني هالأسلوب', [() => toolTurn('teach_users', { action: 'generalize', text: WAY }), () => textTurn('عمّمته')]);
  assert.match(liked.toolResults, /عُمِّم الدرس L\w+ على الجميع/);
  let items = db.get('db/lessons.json').items;
  assert.equal(items.length, 1); assert.equal(items[0].scope, 'all'); assert.ok(items[0].publishedAt > 0);
  for (const p of ['gemini', 'deepseek', 'openrouter']) {
    const r = await turn('vipuser', p, 'اشرح لي الضريبة', [() => textTurn('…')]);
    assert.ok(r.sys.includes('[دروس عمران العامّة — طبّقها في ردودك]:\n- ' + WAY), 'يصل المستخدم فورًا · ' + p);
  }
  const no = await turn('omran', 'claude', 'ما عجبني هالأسلوب', [() => toolTurn('teach_users', { action: 'generalize', text: 'درس ثانٍ' }), () => textTurn('…')]);
  assert.match(no.toolResults, /لم يُعمَّم لأنّ رسالته الأخيرة بلا «عجبني» أو «عمّم»/);
  items = db.get('db/lessons.json').items;
  assert.equal(items.length, 2); assert.equal(items[1].scope, 'owner', 'النفي = تجربة');
  const user = await turn('vipuser', 'gemini', 'هلا', [() => textTurn('…')]);
  assert.ok(!user.sys.includes('درس ثانٍ'), 'التجربة لا تصل المستخدم');
  const later = await turn('omran', 'claude', 'عجبني، خلّه للكل', [() => toolTurn('teach_users', { action: 'publish' }), () => textTurn('…')]);
  assert.match(later.toolResults, /نُشر الدرس/);
  assert.equal(db.get('db/lessons.json').items[1].scope, 'all', '«عجبني» تنشر درسًا سابقًا كـ«عمّم»');
  const desc = liked.bodies[0].tools.find((t) => t.name === 'teach_users');
  assert.ok(desc.input_schema.properties.action.enum.includes('generalize') && /«عجبني» = تعميم بخطوة واحدة/.test(desc.description), 'الأداة تشرح الخطوة الواحدة');
  assert.match(desc.description, /«عمّم» ليست هذه الأداة/, '«عمّم» لا تستخرج درسًا');
});

// v-owner-gen (المالك ١٣ أكتوبر): «عمّم» من أي مزوّد يحفظ الردّ كما هو (قصير وطويل وكود) عند العشرة في محادثات المالك فقط.
// v-prov-one: المحادثة نفسها (كلامه والردّ) تنتقل بلا الكلمة. «لا تعمّم» لا تحفظ. المفتاح يُحذف. فوق السقف يسقط الأقدم. السقف ١٦٠ ألف توكن.
test('«عمّم» copies that provider’s replies to every provider for the owner only, within 160k tokens', async () => {
  db.clear(); PS.__resetCache();
  const CODE = 'function add(a, b) {\n  return a + b;\n}';
  const FACT = 'سعر الغرام ٤٢٠ درهم.';
  const REPLY = CODE + '\n' + FACT + '\nالمفتاح sk-ant-api03-abcdefghijklmnop';
  const hist = [
    { role: 'user', content: 'سرّ المستخدم الخاص لا يُحفظ' },
    { role: 'assistant', content: REPLY },
    { role: 'user', content: 'عمّم على الجميع' },
  ];
  const first = await turn('omran', 'deepseek', '', [() => textTurn('تم')], hist);
  assert.ok(first.sys.includes('لا تسأل') && first.sys.includes('صارت عند العشرة') && first.sys.includes('لا تستدعِ teach_users'), 'الأمر يمنع السؤال');
  const saved = db.get('db/owner-gen.json').items;
  const fact = saved.find((x) => x.text.includes(CODE));
  assert.ok(fact, 'الكود محفوظ');
  assert.equal(fact.by, 'deepseek');
  assert.ok(fact.text.includes(FACT), 'المعلومة كما هي');
  assert.ok(saved.some((x) => x.text.includes('سرّ المستخدم')), 'كلام المحادثة ينتقل مع الردّ');
  assert.ok(!fact.text.includes('sk-ant-'), 'المفتاح يُحذف');
  assert.ok(fact.text.includes('خزنة الأسرار'), 'علامة حذف السرّ تبقى');
  for (const p of ['claude', 'gemini', 'openai', 'groq', 'mistral', 'kimi', 'cohere', 'openrouter']) {
    const r = await turn('omran', p, 'كمّل', [() => textTurn('…')]);
    assert.ok(r.sys.includes(CODE) && r.sys.includes(FACT) && r.sys.includes('[معلومات معمّمة'), 'تصل المالك · ' + p);
  }
  const tenth = await PS.systemBlocks(true, 'perplexity');
  assert.ok(tenth.includes(CODE), 'المزوّد العاشر يقرأ المخزن نفسه');
  const user = await turn('vipuser', 'gemini', 'كمّل', [() => textTurn('…')]);
  assert.ok(!user.sys.includes(CODE) && !user.sys.includes(FACT), 'المستخدم لا يراها');
  const neg = await turn('omran', 'openai', '', [() => textTurn('…')], [
    { role: 'assistant', content: 'لا تحفظ هذي الجملة.' },
    { role: 'user', content: 'لا تعمّم' },
  ]);
  assert.ok(!neg.sys.includes('لا تحفظ هذي الجملة'));
  const n0 = db.get('db/owner-gen.json').items.length;
  assert.ok(!db.get('db/owner-gen.json').items.some((x) => x.text.includes('لا تحفظ هذي الجملة')), 'النفي لا يضيف');
  await turn('omran', 'groq', '', [() => textTurn('…')], hist);
  assert.equal(db.get('db/owner-gen.json').items.filter((x) => x.text.includes(CODE)).length, 1, 'التكرار لا يُضاعف');
  assert.equal(db.get('db/owner-gen.json').items.length, n0, 'إعادة «عمّم» لا تضاعف المخزن');
  assert.equal(PS.GEN_CHARS, 400000);
  assert.equal(PS.ownerSaidGeneralize('عمّم على الجميع'), true);
  assert.equal(PS.ownerSaidGeneralize('عمم'), true);
  assert.equal(PS.ownerSaidGeneralize('لا تعمّم'), false);
  assert.equal(PS.ownerSaidGeneralize('عجبني الأسلوب'), false, '«عجبني» وحدها لا تنسخ الردّ');
  const trimmed = PS.trimGen([{ text: 'قديم' }, { text: 'جديد' }], 4);
  assert.deepEqual(trimmed.map((x) => x.text), ['جديد']);
  assert.equal(PS.trimGen([{ text: 'ABCDEFGH' }], 4)[0].text, 'EFGH');
  const blk = PS.genBlock([{ text: 'أ'.repeat(80) }, { text: 'ب'.repeat(80) }], PS.GEN_HEAD.length + 80, '');
  assert.ok(blk.includes('ب'.repeat(40)) && !blk.includes('أ'.repeat(40)), 'الأقدم يُنقص والأجدد يبقى');
  const huge = 'س'.repeat(300000);
  assert.equal(PS.genBudget([{ role: 'assistant', content: huge }]), 100000, 'المحادثة تبقى والباقي للمعمّم');
  db.clear(); PS.__resetCache();
  const refused = await PS.runTeach({ action: 'generalize', text: 'بيانات الاستهلاك تنعرض كبطاقة فيها شريط تقدّم.' }, 'عمّم', true, 'grok');
  assert.match(refused, /لا درس/);
  assert.ok(!db.has('db/lessons.json'), '«عمّم» لا تحفظ درسًا');
  const shot = 'الاشتراك ستون دولارًا في الشهر وينلغي في ٢٧ أكتوبر. النماذج الأخرى مستهلكة ١٠٠٪.';
  const bare = await PS.captureBareReply([{ role: 'user', content: 'عمّم' }], shot + ' صارت عند العشرة.', 'grok');
  assert.equal(bare.added, 1);
  assert.ok(db.get('db/owner-gen.json').items[0].text.includes('ستون دولارًا'));
  assert.equal((await PS.captureBareReply([{ role: 'user', content: 'عمّم' }], 'صارت عند العشرة.', 'grok')).added, 0, 'سطر التأكيد لا يُحفظ');
  assert.equal((await PS.captureBareReply([{ role: 'user', content: 'عمّم' }], 'ما عمّمت شي. وش تقصد بـ«عمّم»؟ اللقطة ما فيها أسلوب ردّ واضح.', 'grok')).added, 0, 'سؤال المعنى لا يُحفظ');
  assert.equal((await PS.captureBareReply([{ role: 'assistant', content: 'رد سابق' }, { role: 'user', content: 'عمّم' }], shot, 'grok')).added, 0, 'مع ردّ سابق لا يُعاد حفظ الجواب');
});

test('كل محادثات المالك وبناء صوره تصل أي مزوّد بلا «عمّم»، ومحادثات غيره لا', async () => {
  db.clear(); PS.__resetCache();
  await turn('omran', 'claude', '', [() => textTurn('البرج في دبي.')], [
    { role: 'user', content: 'وين البرج؟' },
    { role: 'assistant', content: 'البرج في المارينا.' },
  ]);
  const grok = await turn('omran', 'groq', 'كمّل من هناك', [() => textTurn('في المارينا')]);
  assert.ok(grok.sys.includes('البرج في المارينا') && grok.sys.includes('وين البرج') && grok.sys.includes('[معلومات معمّمة'), 'كروك يقرأ محادثة كلود');
  const img = await PS.noteImage('ارسم برجًا زجاجيًا sk-ant-api03-abcdefghijklmnop');
  assert.equal(img.added, 2);
  const gem = await PS.systemBlocks(true, 'gemini', { messages: [{ role: 'user', content: 'وش الصورة؟' }], lastUserText: 'وش الصورة؟' });
  assert.ok(gem.includes('[بُنيت صورة]') && gem.includes('ارسم برجًا زجاجيًا') && !gem.includes('sk-ant-'), 'بناء الصورة يصل والمفتاح لا');
  await PS.absorbProjects([
    { id: 'p1', provider: 'claude', messages: [
      { role: 'user', content: 'ارسم بيتًا' },
      { role: 'assistant', content: '', code: 'function house(){ return 1 }\nالمفتاح sk-or-abcdefghijklmnop', attachments: [{ isImage: true, dataUrl: 'data:image/png;base64,' + 'A'.repeat(80) }] },
    ] },
    { id: 'p2', provider: 'groq', messages: [
      { role: 'user', content: 'المعادلة النهائية س=١٢' },
      { role: 'assistant', content: 'س = ١٢' },
    ] },
  ]);
  const all = await PS.systemBlocks(true, 'openai', { messages: [{ role: 'user', content: 'كمّل' }], lastUserText: 'كمّل' });
  assert.ok(all.includes('function house') && all.includes('[بُنيت صورة]') && all.includes('س = ١٢') && all.includes('المعادلة النهائية') && !all.includes('base64') && !all.includes('sk-or-'), 'محادثتان وصورة وكود بلا بايتات ولا مفتاح');
  const chats = require(rp('api/_lib/chats.js'));
  async function save(user, projects, action) {
    const res = { statusCode: 200, body: null, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() {} };
    await chats({ method: 'POST', headers: {}, query: { action: action || 'chats_save' }, body: { token: token(user), projects: projects || [] } }, res);
    return res;
  }
  db.set('db/owner-gen.json', { items: [{ id: 'keep', text: 'سرّ المالك القديم', at: 1, by: 'claude' }] });
  PS.__resetCache();
  await save('vipuser', [{ id: 'p9', provider: 'gemini', title: 'x', messages: [{ role: 'user', content: 'سرّ المستخدم العادي لا يصل' }, { role: 'assistant', content: 'رد المستخدم العادي' }], code: '', updatedAt: 1 }]);
  const afterUser = await PS.systemBlocks(true, 'claude', { messages: [{ role: 'user', content: 'هلا' }], lastUserText: 'هلا' });
  assert.ok(!afterUser.includes('سرّ المستخدم العادي') && !afterUser.includes('رد المستخدم العادي'), 'حفظ مستخدم لا يدخل مخزن المالك');
  await save('omran', [{ id: 'p8', provider: 'kimi', title: 'x', messages: [{ role: 'user', content: 'حقيقة من المحادثة المحفوظة' }, { role: 'assistant', content: 'القمر يبعد ٣٨٤ ألف كيلومتر.' }], code: '', updatedAt: 2 }]);
  const afterOwner = await PS.systemBlocks(true, 'mistral', { messages: [{ role: 'user', content: 'كم يبعد؟' }], lastUserText: 'كم يبعد؟' });
  assert.ok(afterOwner.includes('القمر يبعد'), 'حفظ محادثات المالك يدخل المخزن');
  await save('omran', [], 'chats_wipe');
  PS.__resetCache();
  const wiped = await PS.systemBlocks(true, 'claude', { messages: [{ role: 'user', content: 'بعد المسح' }], lastUserText: 'بعد المسح' });
  assert.ok(!wiped.includes('القمر يبعد') && !wiped.includes('سرّ المالك القديم'), 'مسح المحادثات يمسح المخزن المشترك');
});

test('the module: «عمّم» and its negation, no personal data in a lesson, no keys in a file, caps', async () => {
  assert.equal(PS.ownerSaidPublish('عمّم'), true);
  assert.equal(PS.ownerSaidPublish('تمام عممه للكل'), true);
  assert.equal(PS.ownerSaidPublish('لا تعمم'), false);
  assert.equal(PS.ownerSaidPublish('انشر'), false, '«انشر» تخصّ طلبات السحب لا الدروس');
  // v-liked-all: «عجبني» بأشكالها ونفيها
  for (const t of ['عجبني', 'عجبتني الطريقة خلّها كذا', 'حلو أعجبني هالأسلوب', 'ممتاز، للجميع']) assert.equal(PS.ownerSaidPublish(t), true, t);
  for (const t of ['ما عجبني', 'مو عاجبني', 'مش عاجبني الأسلوب', 'لا يعجبني']) assert.equal(PS.ownerSaidPublish(t), false, t);
  // فوق سقف الكتلة يسقط الأقدم لا الأحدث
  const many = []; for (let i = 0; i < 40; i++) many.push({ text: 'درس رقم ' + i + ' ' + 'x'.repeat(90), scope: 'all' });
  const blk = PS.lessonsBlock(many, false);
  assert.ok(blk.length <= 2500 && blk.includes('- درس رقم 39 ') && !blk.includes('- درس رقم 0 '), 'الأحدث يبقى');
  assert.ok(blk.indexOf('درس رقم 38 ') < blk.indexOf('درس رقم 39 '), 'بترتيبه الزمنيّ');
  assert.match(await PS.runTeach({ action: 'add', text: 'راسلوا ali@example.com' }, '', true), /بيانات شخصيّة/);
  assert.match(await PS.runSelf('groq', { action: 'write', text: 'المفتاح sk-ant-api03-abcdefghijklmnop' }, true), /لا أسرار/);
  assert.match(await PS.runSelf('groq', { action: 'write', text: 'ك'.repeat(4001) }, true), /الحدّ 4000/);
  assert.equal(await PS.runSelf('nope', { action: 'read' }, true), '✗ لا ملفّ لهذا المزوّد.');
  assert.equal(PS.lessonsBlock([{ text: 'أ', scope: 'owner' }], false), '', 'التجربة لا تصل المستخدم');
  assert.match(PS.lessonsBlock([{ text: 'أ', scope: 'owner' }], true), /أ \(تجربة — للمالك وحده\)/);
});
