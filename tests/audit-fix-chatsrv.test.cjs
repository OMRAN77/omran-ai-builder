// tests/audit-fix-chatsrv.test.cjs — v-audit-chatsrv (فحص التطبيق كاملًا، أكتوبر ٢٠٢٦، بموافقة المالك على إصلاح كلّ بند غير مقفل):
// خادم المحادثة والذاكرة. كلّ اختبار يستدعي الدالّة أو المعالج الحقيقيّ من المصدر بمخزن KV في الذاكرة وجلب مزيّف، بلا شبكة ولا مفاتيح:
//   srv-chat-1 صورة في منتصف المحادثة لا تمحو تاريخها (حجم الصورة لا يُحسب بطول base64)
//   srv-chat-2 استخراج روابط الصفحة خطّيّ (لا يحجز المعالج على صفحة فيها «<a» بلا إغلاق)
//   srv-chat-3 رابط كتبه المستخدم نفسه يبقى في الردّ النهائيّ
//   srv-chat-4 «حذف الكلّ» لا يمسح سجلّ المحذوفات، فلا تعود المحادثات من جهاز آخر
//   srv-chat-5 مسح الذاكرة أثناء نداء نموذج الدمج لا تلغيه كتابة الدمج
//   srv-chat-6 تفريغ بنك المعرفة الجماعيّة لا يحذف ما وافق عليه المالك
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'audit-chatsrv-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'COHERE_API_KEY', 'DEEPSEEK_API_KEY', 'PERPLEXITY_API_KEY', 'TAVILY_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'CHAT_PROMPT_CACHE', 'KNOWLEDGE_DISABLED']) delete process.env[k];
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };

const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null),
  kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvIncr: async () => 1, kvDecrBy: async () => 0,
  kvSetIfAbsent: async () => true, kvPipeline: async (cmds) => cmds.map(() => 1),
});
let who = 'sara';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: who }), checkAndConsumeCustom: async () => ({ allowed: true, remaining: 99 }), todayCount: async () => 0, takeMeter: async () => true, giveMeter: async () => {} });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });

const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const jsonRes = () => ({ setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.v = v; return this; }, end() { return this; } });

// ───────────────────────────── srv-chat-1 ─────────────────────────────
const chat = require(rp('api/_lib/chat.js'));
const { compactConversation } = chat.__tokens2;
const imgMsg = (b64Len, text) => ({ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'A'.repeat(b64Len) } }, { type: 'text', text }] });

test('srv-chat-1: لقطة شاشة (base64 كبير) في آخر المحادثة لا تمحو ما قبلها — بـhistOffset وبدونه وفي المسارين', () => {
  const convo = [
    { role: 'user', content: 'أحاول أربط بوابة الدفع في متجري' },
    { role: 'assistant', content: 'تمام، اتبع الخطوات: ١) الإعدادات ٢) طرق الدفع ٣) الصق المفتاح السري' },
    imgMsg(300000, 'طلع لي هذا الخطأ بعد الخطوة الثالثة، وش أسوي؟'),
  ];
  for (const win of [undefined, { histOffset: 0, lane: 'paid' }, { histOffset: 0, lane: 'free' }, { histOffset: 7, lane: 'paid' }]) {
    const out = compactConversation(convo, win);
    assert.equal(out.length, 3, 'وصلت المحادثة كاملة (' + JSON.stringify(win) + ')');
    assert.equal(out[2], convo[2], 'الصورة نفسها بلا مساس');
  }
});

test('srv-chat-1: محادثة طويلة آخرها صورة ١٫٥ م.ب تبقي نافذتها كما لو كانت نصًّا قصيرًا', () => {
  const long = [];
  for (let i = 0; i < 20; i++) long.push({ role: i % 2 ? 'assistant' : 'user', content: (i % 2 ? 'ردّ ' : 'سؤال ') + i + ' ' + 'ن'.repeat(400) });
  const withImg = long.concat([imgMsg(1_500_000, 'وش هذا؟')]);
  const withText = long.concat([{ role: 'user', content: 'وش هذا؟' }]);
  for (const win of [undefined, { histOffset: 0, lane: 'paid' }, { histOffset: 0, lane: 'free' }]) {
    const a = compactConversation(withImg, win), b = compactConversation(withText, win);
    assert.ok(a.length > 1, 'لم تبقَ رسالة الصورة وحدها (' + JSON.stringify(win) + ')');
    assert.equal(a.length, b.length, 'طول النافذة نفسه كما لو كانت الرسالة نصًّا');
  }
});

// ───────────────────────────── srv-chat-2 ─────────────────────────────
// الدالّة الحقيقيّة من المصدر (acorn) في سياق معزول — تعمل على الكود قبل الإصلاح وبعده.
function sourceFn(file, name) {
  const acorn = require('acorn');
  const src = read(file);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
  let node = null;
  (function walk(n) { if (!n || node) return; if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) { node = n; return; } for (const k in n) { const v = n[k]; if (v && typeof v === 'object') { if (Array.isArray(v)) v.forEach(walk); else if (typeof v.type === 'string') walk(v); } } })(ast);
  assert.ok(node, 'الدالّة ' + name + ' موجودة في ' + file);
  return src.slice(node.start, node.end);
}
const pageLinksSrc = sourceFn('api/_lib/chat.js', 'pageLinks');
const ctx = vm.createContext({ URL });
vm.runInContext(pageLinksSrc + '\n;this.pageLinks = pageLinks;', ctx);
const pageLinks = ctx.pageLinks;
// النسخة السابقة حرفيًّا (التعبير التربيعيّ) — مرجع السلوك على صفحات عاديّة
function oldPageLinks(html, base) {
  const out = [], seen = new Set();
  let host = '';
  try { host = new URL(base).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  const re = /<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ''))) && out.length < 200) {
    const label = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!label) continue;
    let abs;
    try { abs = new URL(m[1].replace(/&amp;/g, '&'), base); } catch (e) { continue; }
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = '';
    const key = abs.href;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, href: key, same: abs.hostname.replace(/^www\./, '') === host });
  }
  if (!out.length) return '';
  out.sort((a, b) => (b.same ? 1 : 0) - (a.same ? 1 : 0));
  return '\n\nروابط الصفحة (نصّ الزرّ ← الرابط):\n' + out.slice(0, 40).map((l) => '- ' + l.label + ' ← ' + l.href).join('\n');
}

test('srv-chat-2: صفحة ٢ م.ب من «<a href> بلا إغلاق» تُمسح في أقلّ من ثانية (كانت ~٥٠ ثانية)', () => {
  const unit = '<a href="x">a';
  const evil = unit.repeat(Math.ceil((2 * 1024 * 1024) / unit.length));
  for (const html of [evil, '<a '.repeat(700000), '<a href="/ok">' + '<'.repeat(2 * 1024 * 1024) + '</a>']) {
    const t0 = Date.now();
    pageLinks(html, 'https://example.com/');
    const dt = Date.now() - t0;
    assert.ok(dt < 1000, 'المسح خطّيّ (' + dt + 'ms)');
  }
});

test('srv-chat-2: الروابط المستخرجة من صفحات عاديّة كما كانت', () => {
  const pages = [
    '<html><body><nav><a href="/renew" class="btn">تجديد <b>الرخصة</b></a> <a href="https://other.org/x#top">خارجيّ</a></nav>'
      + '<A HREF=\'/fees?a=1&amp;b=2\'>الرسوم&nbsp;والمدّة</A><a name="anchor">لا رابط</a><a href="#top">أعلى</a><a href="javascript:void(0)">زر</a>'
      + '<a href="/renew">تجديد مكرّر</a><a href="/empty"><img src="i.png"></a><abbr href="/no">لا</abbr><a data-x="1" href="/d" title="t">د</a></body></html>',
    Array.from({ length: 260 }, (_, i) => '<li><a href="/p/' + i + '">صفحة ' + i + '</a></li>').join(''),
    '<a href="/a">أ<a href="/b">ب</a> نصّ <a href="/c" >ج</a  >',
  ];
  for (const html of pages) assert.equal(pageLinks(html, 'https://www.example.com/start'), oldPageLinks(html, 'https://www.example.com/start'));
  assert.equal(pageLinks('<a href="/x">x</a>', 'not a url'), '');
});

// ───────────────────────────── srv-chat-3 ─────────────────────────────
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const textStream = (texts) => sse([{ type: 'message_start', message: { model: 'anthropic/claude-haiku-4.5', usage: { input_tokens: 1, output_tokens: 0 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'text' } }]
  .concat(texts.map((t) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })))
  .concat([{ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }]));
async function chatTurn(user, messages, reply) {
  who = user;
  const sent = [];
  const save = global.fetch;
  global.fetch = async (url) => (/openrouter\.ai\/api\/v1\/messages/.test(String(url)) ? textStream(reply) : new Response('{}', { status: 404 }));
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { sent.push(String(c)); }, end() { this.ended = true; }, on() {}, flush() {}, get writableEnded() { return !!this.ended; } };
  try { await chat({ method: 'POST', body: { messages, provider: 'claude', token: token(user) }, headers: {} }, res); } finally { global.fetch = save; }
  const events = sent.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  const text = events.filter((e) => typeof e.delta === 'string').map((e) => e.delta).join('');
  const patches = events.filter((e) => typeof e.patch === 'string').map((e) => e.patch);
  return { final: patches.length ? patches[patches.length - 1] : text, patches };
}

test('srv-chat-3: الرابط الذي كتبه المستخدم يبقى في الردّ النهائيّ (نصًّا ورابط ماركداون)', async () => {
  const r = await chatTurn('sara', [{ role: 'user', content: 'اكتب لي بايو انستقرام قصير لمتجري، رابطه https://sara-abayas.example/shop' }],
    ['بايو: عبايات سارة ✨ اطلبي الحين: https://sara-abayas.example/shop أو [المتجر](https://www.sara-abayas.example/shop?ref=bio)']);
  assert.match(r.final, /اطلبي الحين: https:\/\/sara-abayas\.example\/shop/, 'الرابط النصّيّ باقٍ');
  assert.match(r.final, /\[المتجر\]\(https:\/\/www\.sara-abayas\.example\/shop\?ref=bio\)/, 'رابط الماركداون باقٍ رابطًا');
});

test('srv-chat-3: رابط من ذاكرة النموذج (لا في رسائل المستخدم ولا في الأدوات) يُحذف كما كان — وردّ المساعد السابق لا يزكّي رابطًا', async () => {
  const r = await chatTurn('sara', [
    { role: 'user', content: 'وين أقدر أتعلّم تصميم؟ موقعي https://sara-abayas.example' },
    { role: 'assistant', content: 'جرّبي https://made-up-course.example/learn' },
    { role: 'user', content: 'زين، أعطني رابط ثاني' },
  ], ['شوفي https://made-up-course.example/learn و https://invented.example/path ومتجرك https://sara-abayas.example/new']);
  assert.ok(!/made-up-course\.example|invented\.example/.test(r.final), 'روابط بلا مصدر حُذفت: ' + r.final);
  assert.match(r.final, /https:\/\/sara-abayas\.example\/new/, 'نطاق كتبه المستخدم باقٍ');
});

// ───────────────────────────── srv-chat-4 ─────────────────────────────
const chats = require(rp('api/_lib/chats.js'));
const chatsCall = async (user, action, extra) => { const res = jsonRes(); await chats({ method: 'POST', query: { action }, body: Object.assign({ token: token(user) }, extra) }, res); return res.v; };

test('srv-chat-4: «حذف الكلّ الآن» ثمّ مزامنة جهاز آخر بنسخته المحلّيّة لا تعيد المحادثات', async () => {
  db.clear();
  const old = [{ id: 'p_1760000000000', title: 'سرّي', messages: [{ role: 'user', content: 'معلومة خاصة' }], updatedAt: 1 },
    { id: 'p_1760000000001', title: 'ثاني', messages: [{ role: 'user', content: 'ب' }], updatedAt: 2 }];
  await chatsCall('nora', 'chats_delete', { ids: ['p_1700000000000'] }); // محذوف سابق — يبقى في السجلّ
  await chatsCall('nora', 'chats_save', { projects: old });
  await chatsCall('nora', 'chats_wipe');
  const afterWipe = await chatsCall('nora', 'chats_load');
  assert.equal(afterWipe.projects.length, 0);
  assert.ok(afterWipe.deletedIds.includes('p_1760000000000') && afterWipe.deletedIds.includes('p_1760000000001'), 'المحذوف بالمسح الكامل في سجلّ المحذوفات');
  assert.ok(afterWipe.deletedIds.includes('p_1700000000000'), 'السجلّ السابق لم يُمسح');
  await chatsCall('nora', 'chats_save', { projects: old }); // الحاسوب: المزامنة الدوريّة
  assert.equal((await chatsCall('nora', 'chats_load')).projects.length, 0, 'لم تعد المحادثات من الجهاز الثاني');
  // مشروع جديد بعد المسح يُحفظ كالعادة
  await chatsCall('nora', 'chats_save', { projects: [{ id: 'p_1770000000000', title: 'جديد', messages: [{ role: 'user', content: 'ج' }], updatedAt: 3 }] });
  assert.deepEqual((await chatsCall('nora', 'chats_load')).projects.map((p) => p.title), ['جديد']);
});

// ───────────────────────────── srv-chat-5 ─────────────────────────────
const memory = require(rp('api/_lib/memory.js'));
const FC = require(rp('api/_lib/free-chain.js'));
const memCall = async (user, body) => { const res = jsonRes(); await memory({ method: 'POST', body: Object.assign({ token: token(user) }, body) }, res); return res.v; };
async function withMergeModel(fn, during) {
  const save = FC.completeJson;
  process.env.GROQ_API_KEY = 'test-groq-key';
  let first = true; // نداء الدمج وحده (لا نداء المعرفة الجماعيّة الذي يليه)
  FC.completeJson = async () => { if (during && first) { first = false; await during(); } return { ok: true, json: { choices: [{ message: { content: '[عن المستخدم]\n- اسمها سارة\n- تتابع علاج السكري\n- تحب الرياضة' } }] } }; };
  try { return await fn(); } finally { FC.completeJson = save; delete process.env.GROQ_API_KEY; }
}

test('srv-chat-5: «مسح الذاكرة» أثناء نداء نموذج الدمج يبقى مسحًا (op:update لا يكتب نسخة مبنيّة على القديم)', async () => {
  db.clear();
  db.set('db/memory/sara.json', { memory: '[عن المستخدم]\n- اسمها سارة\n- تتابع علاج السكري', updatedAt: 1, topics: [{ id: 'c1', title: 't', snip: 's', at: 1 }], pending: [] });
  await withMergeModel(() => memCall('sara', { op: 'update', userText: 'أحب الرياضة الصباحية', aiText: 'رائع' }), () => memCall('sara', { op: 'clear' }));
  const rec = db.get('db/memory/sara.json');
  assert.equal(rec.memory, '', 'المسح باقٍ');
  assert.ok(!/السكري/.test(JSON.stringify(rec)), 'لا أثر للذاكرة الممسوحة');
});

test('srv-chat-5: التحديث العاديّ يكتب كما كان، وكتابة موضوع متزامنة (op:topic) لا تلغيه', async () => {
  db.clear();
  db.set('db/memory/sara.json', { memory: '[عن المستخدم]\n- اسمها سارة', updatedAt: 1, topics: [], pending: [] });
  const out = await withMergeModel(() => memCall('sara', { op: 'update', userText: 'أحب الرياضة الصباحية', aiText: 'رائع' }),
    () => memCall('sara', { op: 'topic', id: 'c1', title: 'رياضة', snip: 'أحب الرياضة' }));
  assert.match(out.memory, /تحب الرياضة/);
  const rec = db.get('db/memory/sara.json');
  assert.match(rec.memory, /تحب الرياضة/, 'الدمج كُتب');
  assert.equal(rec.topics.length, 1, 'الموضوع المتزامن باقٍ');
  // مستخدم جديد بلا ذاكرة + موضوع متزامن: الدمج الأوّل يُكتب أيضًا
  db.clear();
  await withMergeModel(() => memCall('newbie', { op: 'update', userText: 'أنا مها وأحب الرياضة', aiText: 'هلا' }),
    () => memCall('newbie', { op: 'topic', id: 'c2', title: 'تعارف', snip: 'هلا' }));
  assert.match(db.get('db/memory/newbie.json').memory, /الرياضة/, 'أوّل دمج لمستخدم جديد كُتب');
});

test('srv-chat-5: «مسح الذاكرة الحيّة» أثناء استخراج الحقائق لا تعيده كتابة التعلّم — والحقيقة الجديدة وحدها تُحفظ', async () => {
  db.clear();
  const L = require(rp('api/_lib/living-memory.js'));
  await L.writeFacts('sara', [{ kind: 'interest', subject: 'صحة', text: 'تتابع علاج السكري عند طبيب خاص', at: 1 }, { kind: 'project', subject: 'متجر', text: 'عندها متجر عبايات اسمه سارة', at: 2 }]);
  const out = await L.learn('sara', [{ role: 'user', content: 'أنا أحب الرياضة الصباحية' }], { callModel: async () => {
    await L.clearFacts('sara');
    return JSON.stringify([{ kind: 'interest', subject: 'رياضة', text: 'تحب الرياضة الصباحية' }]);
  } });
  const stored = (db.get('db/living/sara.json') || { facts: [] }).facts.map((f) => f.text);
  assert.deepEqual(stored, ['تحب الرياضة الصباحية'], 'الممسوح لم يعد');
  assert.deepEqual(out.facts.map((f) => f.text), ['تحب الرياضة الصباحية']);
});

// ───────────────────────────── srv-chat-6 ─────────────────────────────
test('srv-chat-6: حقيقة وافق عليها المالك تبقى بعد ٦٠ مرشّحًا أحدث، والمرشّحون محدودون بسقفهم', async () => {
  db.clear();
  const C = require(rp('api/_lib/collective.js'));
  const realNow = Date.now; let tick = 1_800_000_000_000; Date.now = () => (tick += 1000); // طوابع زمنيّة متمايزة: «الأحدث» حتميّ
  try {
  await C.addFact('u0', 'رسوم تجديد رخصة القيادة في دبي معلنة على موقع الهيئة');
  const k = db.get('db/knowledge/global.json').facts[0].k;
  assert.equal(await C.approveFact(k), true);
  const letters = 'ابجدهوزحطيكلمنسعفصقرشتثخذضظغ';
  for (let i = 1; i <= 75; i++) await C.addFact('u' + i, 'حقيقة عامة مرشحة ' + letters[i % 28] + letters[(i * 7) % 28] + ' رقم ' + i);
  const l = await C.listFacts();
  assert.equal(l.approved.length, 1, 'المعتمد باقٍ');
  assert.equal(l.approved[0].k, k);
  assert.ok(l.pending.length <= 60, 'المرشّحون تحت السقف (' + l.pending.length + ')');
  assert.ok(l.pending.some((f) => / رقم 75$/.test(f.t)), 'الأحدث بين المرشّحين');
  assert.match(C.__render(db.get('db/knowledge/global.json')), /رخصة القيادة/, 'المعتمد ما زال يُحقن');
  } finally { Date.now = realNow; }
});
