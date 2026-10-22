// tests/gen-image.test.cjs — v-gen-fix + v-gen-image (المالك ١٣ أكتوبر): «عمّم» على أيّ شي — كلام أو صورة — يصير عند المزوّدين العشرة
// داخل التطبيق نفسه، ومعلومات كلّ مزوّد محفوظة. قبل دمج #1022 قيس بالتشغيل: «لا تعمّم» لا تمسح ما حُفظ آخر الدور السابق (Groq يستلمه)،
// وحفظ المحادثات يدوّر المخزن فتضيع المعلومة الأحدث بعد ٥ حفظات، وكلّ رسالة تحمل ١٦٠ ألف توكن بكتابتين كاملتين لكلّ دور.
// يثبت بـchat.js وchats.js وgithub-write.js وجزء الواجهة app-18 الحقيقيّة (مزوّد وهميّ، Redis وهميّ، GitHub وهميّ).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.OWNER_AGENT_CLAUDE = 'on'; // v-agent-claude-off: الاختبار يفحص الوكيل وهو شغّال
process.env.AUTH_SECRET = 'gen-image-secret';
process.env.OPENROUTER_API_KEY = 'test-or-key';
process.env.ANTHROPIC_API_KEY = 'test-anth-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'OWNER_USERNAMES']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();   // JSON
const raw = new Map();  // نصّ خامّ (الصور) مع عمره
const puts = [];
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null),
  kvPutJSON: async (k, v) => { puts.push(k); db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); raw.delete(k); },
  kvGetRaw: async (k) => (raw.has(k) ? raw.get(k).v : null),
  kvSetIfAbsent: async (k, v, ttl) => { if (raw.has(k)) return false; raw.set(k, { v, ttl }); return true; },
  kvExpire: async () => {}, kvSetRaw: async () => {}, kvIncr: async () => 1, kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvList: async () => [],
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
const chats = require(rp('api/_lib/chats.js'));
const GW = require(rp('api/_lib/github-write.js'));

const GEN = 'db/owner-gen.json';
const items = () => ((db.get(GEN) || {}).items || []);
const has = (s) => items().some((x) => x.text.includes(s));
const reset = () => { db.clear(); raw.clear(); puts.length = 0; PS.__resetCache(); };

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (evs) => new Response(evs.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'm', usage: { input_tokens: 1, output_tokens: 0 } } });
const textTurn = (t) => sse([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }]);
const sysOf = (b) => (typeof b.system === 'string' ? b.system : Array.isArray(b.system) ? b.system.map((x) => x.text || '').join('') : '');

async function turn(user, provider, reply, history, extra) {
  usageUser = user;
  const bodies = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    if (!/openrouter\.ai\/api\/v1\/messages|api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 404 });
    bodies.push(JSON.parse(init.body));
    return textTurn(reply);
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user), provider, messages: history }, extra || {}) };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  return { sys: bodies[0] ? sysOf(bodies[0]) : '', body: bodies[0] || null };
}
async function agentTurn(history, extra) {
  const agent = require(rp('api/_lib/agent.js'));
  usageUser = 'omran';
  const bodies = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    if (!/api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 404 });
    bodies.push(JSON.parse(init.body));
    return textTurn('صارت عند العشرة.');
  };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() {}, flushHeaders() {} };
  try { await agent({ method: 'POST', headers: {}, body: Object.assign({ token: token('omran'), messages: history }, extra || {}) }, res); } finally { global.fetch = save; }
  return { sys: bodies[0] ? sysOf(bodies[0]) : '', body: bodies[0] || null };
}
// كتل الصور في آخر رسالة مستخدم أُرسلت للمزوّد
const imgBlocks = (body) => { const ms = (body && body.messages) || []; const last = ms[ms.length - 1]; return Array.isArray(last && last.content) ? last.content.filter((b) => b && b.type === 'image') : []; };
const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });

test('«لا تعمّم» في الدور التالي تمسح الحوار المحفوظ فلا يصل Groq، وما يُسأل بعدها يُحفظ', async () => {
  reset();
  const Q = 'وش رقم حسابي في البنك؟';
  const R = 'رقم حسابك ١٢٣٤٥٦٧٨٩ في بنك الإمارات دبي الوطني.';
  await turn('omran', 'claude', R, [u(Q)]);
  assert.ok(has(R) && has(Q), 'الدور الأوّل يُحفظ بعد الردّ');
  const neg = await turn('omran', 'claude', 'تمام، ما عمّمته.', [u(Q), a(R), u('لا تعمّم')]);
  assert.ok(!has(R) && !has(Q), 'النفي يمسح الردّ والسؤال من المخزن');
  assert.ok(!neg.sys.includes(R), 'ولا يُحقن في دور النفي نفسه');
  const groq = await turn('omran', 'groq', 'هلا', [u('هلا')]);
  assert.ok(!groq.sys.includes(R), 'Groq لا يستلمه في محادثة جديدة');
  await turn('omran', 'claude', 'سعر الغرام ٢٥٠ درهم.', [u(Q), a(R), u('لا تعمّم'), a('تمام، ما عمّمته.'), u('كم سعر الذهب اليوم؟')]);
  assert.ok(has('المالك: كم سعر الذهب اليوم؟') && has('سعر الغرام ٢٥٠ درهم.'), 'ما بعد النفي يُحفظ (كان #1022 يقطع ما بعده)');
  assert.ok(!has(R), 'والممسوح لا يرجع');
  // السؤال ونفي الماضي ليسا أمرًا: لا يمسحان شيئًا محفوظًا
  const KEEP = 'موعد الصيانة السنويّة يوم ١٥ نوفمبر في الفرع الرئيسيّ.';
  await turn('omran', 'claude', KEEP, [u('متى الصيانة؟')]);
  for (const q of ['ليش ما عمّمت؟', 'ما عممت شي', 'لا تعمّم؟']) {
    await turn('omran', 'claude', 'عمّمته الحين.', [u('متى الصيانة؟'), a(KEEP), u(q)]);
    assert.ok(has(KEEP), 'لا يمسح: ' + q);
  }
  // النصّ المحفوظ من الواجهة قد يختلف قليلًا عن المبثوث: الأوّل المطبَّع يكفي للمسح
  reset();
  await PS.absorbProjects([{ id: 'p1', provider: 'kimi', messages: [u(Q), a('**' + R + '**  ')] }]);
  await PS.forgetLastExchange([u(Q), a(R), u('ما تعمم')], 'gemini');
  assert.ok(!has(R), 'المسح بالأوّل المطبَّع ومن مزوّد آخر');
});

test('حفظ المحادثات يأخذ الجديد فقط: المعلومة الأحدث تبقى بعد عشر حفظات ولا كتابة بلا جديد', async () => {
  reset();
  const projects = [];
  for (let p = 0; p < 6; p++) {
    const messages = [];
    for (let i = 0; i < 40; i++) { messages.push(u('project ' + p + ' question ' + i)); messages.push(a('project ' + p + ' answer ' + i + ' ' + 'x'.repeat(1800))); }
    projects.push({ id: 'p_' + (1700000000000 + p), provider: 'claude', title: 't', messages, code: '', updatedAt: p });
  }
  async function save(ps) {
    usageUser = 'omran';
    const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json() { return this; }, end() {} };
    await chats({ method: 'POST', headers: {}, query: { action: 'chats_save' }, body: { token: token('omran'), projects: ps } }, res);
    assert.equal(res.statusCode, 200);
  }
  await save(projects);
  const total = items().reduce((n, x) => n + x.text.length, 0);
  assert.ok(total <= PS.GEN_CHARS && total > PS.GEN_CHARS - 5000, 'المخزن ممتلئ حتّى سقفه');
  const NEW = 'المعلومة الأحدث المهمّة: الاجتماع يوم الخميس الساعة ٩.';
  await turn('omran', 'claude', NEW, [u('متى الاجتماع؟')]);
  assert.ok(has(NEW));
  puts.length = 0;
  for (let s = 0; s < 10; s++) await save(projects);
  assert.ok(has(NEW), 'الأحدث باقٍ بعد عشر حفظات');
  assert.equal(puts.filter((k) => k === GEN).length, 0, 'لا كتابة للمخزن بلا رسائل جديدة');
  projects[0].messages.push(u('سؤال جديد في المشروع الأوّل'), a('جواب جديد في المشروع الأوّل'));
  await save(projects);
  assert.ok(has('جواب جديد في المشروع الأوّل') && has(NEW), 'الجديد وحده يدخل');
  assert.equal(puts.filter((k) => k === GEN).length, 1, 'كتابة واحدة');
});

test('كتابة واحدة لكلّ دور، وما يُرسل مع الرسالة أحدثه حتّى ٤٠ ألف توكن والمخزن ١٦٠ ألفًا', async () => {
  reset();
  await turn('omran', 'claude', 'ردّ قصير.', [u('سؤال قصير')]);
  assert.equal(puts.filter((k) => k === GEN).length, 1, 'دور = كتابة واحدة بعد الردّ (كانت اثنتين)');
  reset();
  const big = []; for (let i = 0; i < 100; i++) big.push({ id: 'g' + i, text: 'معلومة رقم ' + i + ' ' + 'م'.repeat(3990), at: i, by: 'claude' });
  db.set(GEN, { items: big });
  const r = await turn('omran', 'groq', 'هلا', [u('هلا')]);
  const at = r.sys.indexOf(PS.GEN_HEAD);
  assert.ok(at >= 0, 'الكتلة تصل');
  const blk = r.sys.slice(at, r.sys.indexOf('\n\n[', at + PS.GEN_HEAD.length) > 0 ? r.sys.indexOf('\n\n[', at + PS.GEN_HEAD.length) : undefined);
  assert.ok(blk.length <= PS.GEN_INJECT, 'الرسالة تحمل ٤٠ ألف توكن على الأكثر (' + blk.length + ' حرفًا)');
  assert.ok(blk.includes('معلومة رقم 99 ') && !blk.includes('معلومة رقم 0 '), 'الأحدث يُرسل والأقدم يبقى في المخزن');
  assert.ok(has('معلومة رقم 50 ') && !blk.includes('معلومة رقم 50 '), 'المخزن يحتفظ بما لا يُرسل');
  assert.equal(PS.GEN_INJECT, 100000);
  // v-talk-400 (ب): القصّ لا يترك نصف إيموجي في الطلب (المزوّد يرفضه 400)
  const lone = (s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
  const emo = 'أ'.repeat(10) + '🎨'.repeat(60000);
  for (const room of [1000, 1001, 1002]) assert.ok(!lone(PS.genBlock([{ text: emo }], PS.GEN_HEAD.length + room, '')), 'genBlock سليم · ' + room);
  assert.ok(!lone(PS.trimGen([{ text: emo }], 1001)[0].text), 'trimGen سليم');
});

const IMG = Buffer.from('fake-jpeg-bytes-' + 'z'.repeat(200)).toString('base64');

test('«عمّم» على صورة: تُحفظ برابط من التطبيق ويصل رابطها العشرة؛ لا مرّتين، ولا لغير المالك ولا بلا الكلمة', async () => {
  reset();
  const first = await turn('omran', 'gemini', 'صارت عند العشرة.', [a('هذي صورة البرج'), u('عمّمها')], { genImage: { data: IMG, mime: 'image/jpeg', w: 640, h: 480, note: 'برج زجاجي على البحر' } });
  const imgKeys = [...raw.keys()].filter((k) => /^db\/img\/[a-f0-9]{12}$/.test(k));
  assert.equal(imgKeys.length, 1, 'الصورة في مخزن التطبيق');
  const id = imgKeys[0].slice(7);
  assert.equal(raw.get(imgKeys[0]).ttl, 3650 * 86400, 'عمر طويل لا يمسّه تنظيف روابط المشاركة');
  assert.equal(raw.get(imgKeys[0]).v, 'image/jpeg:640:480:' + IMG, 'بالصيغة التي يقرؤها /i/<id>');
  const url = '/i/' + id + '.jpg';
  assert.ok(has('[صورة معمّمة] برج زجاجي على البحر — رابطها في التطبيق: ' + url), 'سطرها في المخزن المشترك');
  assert.ok(first.sys.includes('والصورة نفسها صارت عند العشرة برابطها في التطبيق: ' + url), 'المزوّد يُؤمر بذكر الرابط');
  for (const p of ['claude', 'groq', 'kimi', 'deepseek']) {
    const r = await turn('omran', p, '…', [u('حط الصورة في الواجهة')]);
    assert.ok(r.sys.includes(url) && r.sys.includes('write_github بملفّ {path, image: "' + url + '"}'), 'الرابط وطريقة وضعها في التطبيق · ' + p);
  }
  const got = await require(rp('api/_lib/img-share.js')).getImage(id);
  assert.deepEqual(got, { mime: 'image/jpeg', w: 640, h: 480, b64: IMG }, 'getImage يقرؤها كما حُفظت');
  await turn('omran', 'claude', 'صارت عند العشرة.', [u('عمّم')], { genImage: { data: IMG, mime: 'image/jpeg' } });
  assert.equal([...raw.keys()].filter((k) => k.startsWith('db/img/')).length, 1, 'الصورة نفسها لا تُحفظ مرّتين');
  await turn('vipuser', 'gemini', 'تم', [u('عمّم')], { genImage: { data: Buffer.from('other').toString('base64') + 'AAAA' } });
  await turn('omran', 'gemini', 'تم', [u('حلوة الصورة')], { genImage: { data: Buffer.from('other2').toString('base64') + 'AAAA' } });
  await turn('omran', 'gemini', 'تم', [u('لا تعمّمها')], { genImage: { data: Buffer.from('other3').toString('base64') + 'AAAA' } });
  assert.equal([...raw.keys()].filter((k) => k.startsWith('db/img/')).length, 1, 'لا حفظ لغير المالك ولا بلا «عمّم» ولا مع نفيها');
  assert.equal((await PS.noteGenImage({ data: 'not base64!!' }, 'claude')).error, 'bad_image');
  assert.equal((await PS.noteGenImage({ data: 'A'.repeat(700 * 1024 + 4) }, 'claude')).error, 'bad_image', 'فوق حدّ الطلب');
});

test('أحدث ٢٠ صورة معمّمة فقط: الأقدم تُحذف بايتاتها وسطرها', async () => {
  reset();
  const ids = [];
  for (let i = 0; i < 21; i++) ids.push((await PS.noteGenImage({ data: Buffer.from('img-' + i + '-' + 'q'.repeat(30)).toString('base64'), note: 'صورة ' + i }, 'claude')).id);
  assert.equal(PS.GEN_IMG_MAX, 20);
  assert.ok(!raw.has('db/img/' + ids[0]), 'بايتات الأقدم حُذفت');
  assert.ok(!has('/i/' + ids[0] + '.'), 'وسطرها');
  assert.ok(raw.has('db/img/' + ids[20]) && has('/i/' + ids[20] + '.') && raw.has('db/img/' + ids[1]));
  assert.equal(db.get(GEN).imgs.length, 20);
  await PS.clearGen();
  assert.equal([...raw.keys()].filter((k) => k.startsWith('db/img/')).length, 0, 'مسح المحادثات يحذف الصور المعمّمة');
});

// v-gen-image-agent (المالك ١٣ أكتوبر «اربط صورة عمّم بالوكيل»): الوكيل الحقيقيّ (agent.js) يحفظ الصورة ويؤمر بذكر رابطها كالمحادثة.
test('الوكيل: «عمّم» ومعها صورة تُحفظ برابط في التطبيق ويؤمر بذكره؛ بلا الكلمة لا شيء', async () => {
  reset();
  const IMG2 = Buffer.from('agent-jpeg-' + 'k'.repeat(120)).toString('base64');
  const r = await agentTurn([a('هذي صورة الشعار'), u('عمّمها')], { genImage: { data: IMG2, mime: 'image/jpeg', w: 300, h: 200, note: 'شعار عمران الذهبي' } });
  const keys = [...raw.keys()].filter((k) => /^db\/img\/[a-f0-9]{12}$/.test(k));
  assert.equal(keys.length, 1, 'الصورة في مخزن التطبيق');
  const url = '/i/' + keys[0].slice(7) + '.jpg';
  assert.ok(has('[صورة معمّمة] شعار عمران الذهبي — رابطها في التطبيق: ' + url), 'سطرها عند العشرة');
  assert.ok(r.sys.includes('والصورة نفسها صارت عند العشرة برابطها في التطبيق: ' + url), 'الوكيل يُؤمر بذكر الرابط');
  const g = await turn('omran', 'groq', '…', [u('وش الصورة اللي عمّمتها؟')]);
  assert.ok(g.sys.includes(url), 'Groq يستلم رابطها');
  await agentTurn([a('صورة'), u('حلوة')], { genImage: { data: Buffer.from('agent-other-' + 'p'.repeat(60)).toString('base64') } });
  assert.equal([...raw.keys()].filter((k) => k.startsWith('db/img/')).length, 1, 'بلا «عمّم» لا حفظ');
  const app09 = fs.readFileSync(path.join(root, 'js/app-09-attach.js'), 'utf8');
  const run = app09.slice(app09.indexOf('async function runOmranAgent('), app09.indexOf("const res = await fetch('/api/ai?action=agent'", app09.indexOf('async function runOmranAgent(')) + 900);
  assert.ok(/window\.omranGenImageFor\(String\(__lu\.content \|\| ''\), cur\)/.test(run) && /genImage: __genImg \|\| undefined/.test(run), 'واجهة الوكيل ترسل genImage بقاعدة المحادثة نفسها');
});

// v-gen-see (المالك ١٣ أكتوبر «خلّ الوكيل والمزوّدين يشوفون الصورة نفسها مو بس الرابط»): البايتات نفسها كتلة صورة مع رسالة المالك حين
// يكون الكلام عنها، للمزوّد الذي يرى (موديل رؤية شركته إن لزم) وللوكيل — لا في كلّ رسالة ولا في دور «عمّم» ولا لغير المالك.
test('المزوّدون والوكيل يرون الصورة المعمّمة نفسها حين يكون الكلام عنها', async () => {
  reset();
  const IMG3 = Buffer.from('see-jpeg-' + 'v'.repeat(150)).toString('base64');
  const { id, url } = await PS.noteGenImage({ data: IMG3, mime: 'image/jpeg', note: 'واجهة المتجر الجديدة' }, 'gemini');
  const age = (ms) => { const r = db.get(GEN); r.imgs[r.imgs.length - 1].at = Date.now() - ms; db.set(GEN, r); PS.__resetCache(); };
  age(2 * 3600 * 1000); // عُمّمت قبل ساعتين
  const see = await turn('omran', 'claude', 'أرى واجهة متجر.', [u('وش رأيك في الصورة؟')]);
  const blk = imgBlocks(see.body);
  assert.equal(blk.length, 1, 'كلود يرى الصورة نفسها');
  assert.deepEqual(blk[0].source, { type: 'base64', media_type: 'image/jpeg', data: IMG3 }, 'البايتات كما حُفظت');
  const last = see.body.messages[see.body.messages.length - 1].content;
  assert.ok(last.some((b) => b.type === 'text' && b.text.includes('واجهة المتجر الجديدة') && b.text.includes(url)), 'وصفها ورابطها معها');
  assert.ok(last.findIndex((b) => b.type === 'image') < last.findIndex((b) => b.type === 'text' && b.text.includes('وش رأيك')), 'الصورة قبل كلام المالك');
  assert.equal(imgBlocks((await turn('omran', 'claude', '…', [u('كم الساعة الحين؟')])).body).length, 0, 'لا كلام عن صورة وعُمّمت من زمان = لا صورة');
  assert.equal(imgBlocks((await turn('omran', 'claude', '…', [u('حطّ ' + url + ' في الصفحة الرئيسيّة')])).body).length, 1, 'رابطها في الرسالة = تُرفق');
  age(5 * 60 * 1000); // عُمّمت قبل ٥ دقائق
  assert.equal(imgBlocks((await turn('omran', 'claude', '…', [u('حطّها في الصفحة الرئيسيّة')])).body).length, 1, 'عُمّمت للتوّ = تُرفق بلا كلمة صورة');
  const dsCode = await turn('omran', 'deepseek', '…', [u('صلّح الدالّة هذي')]);
  assert.equal(imgBlocks(dsCode.body).length, 0, 'حديثة بلا ذكرها: DeepSeek لا يُبدَّل موديله إلى موديل الرؤية');
  assert.equal(dsCode.body.model, 'deepseek/deepseek-v4-pro');
  assert.equal(imgBlocks((await turn('omran', 'gemini', '…', [u('صلّح الدالّة هذي')])).body).length, 1, 'حديثة بلا ذكرها: Gemini يراها بموديله نفسه');
  const ds = await turn('omran', 'deepseek', '…', [u('وش في الصورة؟')]);
  assert.equal(imgBlocks(ds.body).length, 1, 'DeepSeek يراها');
  assert.equal(ds.body.model, 'deepseek/deepseek-v4-flash-vision-exp', 'بموديل الرؤية عند شركته (V4 Pro نصّيّ)');
  const gq = await turn('omran', 'groq', '…', [u('وش في الصورة؟')]);
  assert.equal(imgBlocks(gq.body).length, 1, 'Groq يراها على مساره');
  assert.equal(imgBlocks((await turn('omran', 'claude', 'صارت عند العشرة.', [u('عمّمها')])).body).length, 0, 'دور «عمّم» نفسه بلا إرفاق');
  assert.equal(imgBlocks((await turn('vipuser', 'claude', '…', [u('وش في الصورة؟')])).body).length, 0, 'غير المالك لا يراها');
  const ag = await agentTurn([u('وش في الصورة اللي عمّمتها؟')]);
  const agBlk = imgBlocks(ag.body);
  assert.equal(agBlk.length, 1, 'الوكيل يراها');
  assert.equal(agBlk[0].source.data, IMG3);
  age(2 * 3600 * 1000);
  assert.equal(imgBlocks((await agentTurn([u('كمّل الشغل على الكود')])).body).length, 0, 'الوكيل بلا كلام عنها (وعُمّمت من زمان) لا يأخذها');
  assert.ok(id);
});

const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const ghRes = (obj, status) => ({ ok: !status || status < 400, status: status || 200, headers: new Headers(), json: async () => obj, text: async () => JSON.stringify(obj) });
function net(extraOpts) {
  const calls = [];
  const routes = [
    ['GET', /^\/repos\/o\/r$/, ghRes({ default_branch: 'main' })],
    ['GET', /^\/repos\/o\/r\/git\/ref\/heads\/main$/, ghRes({ object: { sha: 'basesha' } })],
    ['GET', /^\/repos\/o\/r\/git\/commits\/basesha$/, ghRes({ tree: { sha: 'basetree' } })],
    ['POST', /^\/repos\/o\/r\/git\/blobs$/, ghRes({ sha: 'imgblob' }, 201)],
    ['POST', /^\/repos\/o\/r\/git\/trees$/, ghRes({ sha: 'newtree' })],
    ['POST', /^\/repos\/o\/r\/git\/commits$/, ghRes({ sha: 'abc1234567', html_url: 'https://github.com/o/r/commit/abc1234567' })],
    ['POST', /^\/repos\/o\/r\/git\/refs$/, ghRes({ ref: 'refs/heads/x' }, 201)],
    ['GET', /^\/repos\/o\/r\/pulls\?/, ghRes([])],
    ['POST', /^\/repos\/o\/r\/pulls$/, ghRes({ number: 7, html_url: 'https://github.com/o/r/pull/7' }, 201)],
  ];
  const fetchImpl = async (url, init) => {
    const p = String(url).replace('https://api.github.com', '');
    const method = (init && init.method) || 'GET';
    let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    calls.push({ method, url: p, body });
    for (const [m, re, r] of routes) if (m === method && re.test(p)) return r;
    return ghRes({ message: 'Not Found' }, 404);
  };
  return { calls, opts: Object.assign({ fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' } }, extraOpts || {}) };
}

test('write_github يرفع صورة من رابطها في التطبيق: blob ثنائيّ بايتاته كما خُزّنت، في التزام واحد مع النصوص وطلب سحب', async () => {
  const v = GW.validateInput({ files: [{ path: 'assets/hero.jpg', image: 'https://omran.app/i/abc123def456.raw.jpg' }, { path: 'a.txt', content: 'x' }] });
  assert.deepEqual(v.images, [{ path: 'assets/hero.jpg', id: 'abc123def456' }]);
  assert.match(GW.validateInput({ files: [{ path: 'hero.js', image: '/i/abc123def456.jpg' }] }).error, /بامتداد صورة/);
  assert.match(GW.validateInput({ files: [{ path: 'hero.png', image: 'https://evil.example/x.png' }] }).error, /ليس من التطبيق/);
  assert.equal(GW.imageIdOf('/i/ABC123def456.jpg'), 'abc123def456');
  assert.ok(!('images' in GW.validateInput({ files: [{ path: 'a.txt', content: 'x' }] })), 'رفعة النصوص كما كانت حرفيًّا');
  const B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  const n = net({ getImage: async (id) => (id === 'abc123def456' ? { mime: 'image/jpeg', b64: B64 } : null) });
  const out = await GW.pushFiles({ repo: 'o/r', message: 'بدّل صورة الواجهة', files: [{ path: 'assets/hero.jpg', image: '/i/abc123def456.jpg' }, { path: 'a.txt', content: 'نص' }] }, n.opts);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.files, 2);
  const blob = n.calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/blobs'));
  assert.deepEqual(blob.body, { content: B64, encoding: 'base64' }, 'البايتات كما هي');
  const tree = n.calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/trees')).body.tree;
  assert.ok(tree.some((e) => e.path === 'assets/hero.jpg' && e.sha === 'imgblob') && tree.some((e) => e.path === 'a.txt' && e.content === 'نص'));
  assert.equal(out.prNumber, 7, 'طلب سحب — الدمج بيد المالك');
  const gone = net({ getImage: async () => null });
  const miss = await GW.pushFiles({ repo: 'o/r', message: 'x', files: [{ path: 'a.png', image: '/i/0123456789ab.png' }] }, gone.opts);
  assert.match(miss.error, /غير موجودة في التطبيق/);
  assert.equal(gone.calls.length, 0, 'صورة مفقودة تُرفض قبل أيّ نداء لـGitHub');
  const schema = GW.TOOL.input_schema.properties.files.items;
  assert.ok(schema.properties.image && schema.required.length === 1 && /image/.test(GW.TOOL.description), 'الأداة تشرح حقل image');
});

// الواجهة (app-18 الحقيقيّ في VM): genImage يُرسل للمالك مع «عمّم» وصورة قريبة فقط، مضغوطًا دون ٦٤٠ ك.ب.
const app18 = fs.readFileSync(path.join(root, 'js/app-18-chat-tools.js'), 'utf8');
const app18Core = app18.slice(0, app18.indexOf('// v478:'));
async function client(text, curMessages, owner) {
  let sent = null;
  class FakeImage { set src(v) { this._s = v; this.naturalWidth = 3000; this.naturalHeight = 2000; setTimeout(() => this.onload && this.onload(), 0); } get src() { return this._s; } }
  const document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL() { return 'data:image/jpeg;base64,' + 'B'.repeat(this.width * 500); } }) };
  const ctx = { window: { authGet: () => 'tok', claudeModelGet: () => '' }, document, Image: FakeImage,
    omranOwnerUi: () => owner, getCurrent: () => ({ messages: curMessages }),
    fetch: async (url, init) => { sent = JSON.parse(init.body); return new Response('data: {"delta":"تم"}\n\ndata: {"done":true}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }); },
    TextDecoder, setTimeout, clearTimeout, Promise, Error, String, JSON, Date, Array, Math, console, Intl, Object, Number, RegExp };
  vm.runInNewContext(app18Core, ctx);
  try { await ctx.window.callChatWithTools([u(text)], null, 'gemini'); } catch (e) { /* الإرسال وحده ما نختبره */ }
  if (sent) sent.__direct = await ctx.window.omranGenImageFor(text, { messages: curMessages }); // v-gen-image-agent: ما يناديه الوكيل بمشروعه
  return sent;
}
const PIC = { role: 'assistant', content: 'هذي صورة البرج __IMG_1__', attachments: [{ isImage: true, mime: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }] };

test('الواجهة: «عمّم» من المالك ومعها صورة قريبة = genImage مضغوطًا؛ غير ذلك لا يُرسل شيء', async () => {
  const s = await client('عمّمها', [u('ارسم برج'), PIC, u('عمّمها'), { role: 'assistant', content: '', _loading: true }], true);
  assert.ok(s.genImage, 'أُرسلت');
  assert.equal(s.genImage.mime, 'image/jpeg');
  assert.equal(s.genImage.w, 1200, 'نزلت حتّى صارت دون ٦٤٠ ك.ب');
  assert.equal(s.genImage.h, 800);
  assert.ok(s.genImage.data.length <= 640 * 1024);
  assert.equal(s.genImage.note, 'هذي صورة البرج', 'الوصف من الرسالة بلا رمز الصورة');
  assert.deepEqual(JSON.parse(JSON.stringify(s.__direct)), s.genImage, 'الدالّة المكشوفة للوكيل تعطي الصورة نفسها');
  const cached = await client('عمم', [{ role: 'assistant', content: 'رسمتها', _imgCache: { __IMG_1__: 'data:image/png;base64,AAAA' } }, u('عمم')], true);
  assert.ok(cached && cached.genImage, 'صورة الردّ بالأدوات (_imgCache)');
  assert.equal((await client('عمّمها', [PIC, u('عمّمها')], false)).genImage, undefined, 'غير المالك');
  assert.equal((await client('لا تعمّمها', [PIC, u('لا تعمّمها')], true)).genImage, undefined, 'النفي');
  assert.equal((await client('حلوة', [PIC, u('حلوة')], true)).genImage, undefined, 'بلا الكلمة');
  assert.equal((await client('عمّم', [PIC, u('أ'), a('ب'), u('ج'), u('عمّم')], true)).genImage, undefined, 'صورة بعيدة لا تُسحب');
});
