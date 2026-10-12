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
async function turn(user, provider, text, script) {
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
  const req = { method: 'POST', headers: {}, body: { token: token(user), provider, messages: [{ role: 'user', content: text }] } };
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
  assert.ok(!/بالتأكيد/.test(other.sys), 'Mistral لا يرى ملفّ DeepSeek');
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
  assert.ok(agentSrc.includes("system += await require('./prov-self.js').systemBlocks(isOwner(runUser), 'claude')"), 'الوكيل لكلّ مستخدم');
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
