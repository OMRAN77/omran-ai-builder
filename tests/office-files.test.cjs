'use strict';
/* v-office-files (طلب المالك ٧ نوفمبر: «اطلب منه جدول حضور وانصراف… وهو يجهّزلي كل شي… فقط انا اطبع» ثمّ «في المحادثة… المجّاني مرّة
   وحدة بالشهر… التعديل يحتاج اشتراك»): ملفّ Excel/PowerPoint من المحادثة.
   ١–٦ وحدة الخادم office.js (النيّة، التنظيف، الحصّة الشهريّة، الكروت). ٧–١١ المعالج الحقيقيّ chat.js بـRedis ومزوّد مزيّفين:
   المجّانيّ بعد ملفّه = كرت اشتراك بلا نموذج، والضيف = كرت تسجيل، والمجّانيّ بحصّة = المسار المدفوع بأداة الملفّ وحدها، والأداة
   تبثّ الكرت وتعدّ الملفّ، والثاني يُرفض. ١٢–١٤ العميل (app-44 وخطّافاته) والنصوص بالـ١٤ لغة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'office-files-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };

const store = new Map();
const ttl = new Map();
let kvDown = false;
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { if (kvDown) throw new Error('down'); return store.has(k) ? String(store.get(k)) : null; },
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvIncr: async (k) => { if (kvDown) throw new Error('down'); await new Promise((r) => setImmediate(r)); const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async (k, s) => { ttl.set(k, Number(s)); },
  kvDel: async (k) => { store.delete(k); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
};
const kv = new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) });
stub('api/_lib/kv.js', kv);
let usage = { allowed: true, username: '' };
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => Object.assign({}, usage) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });

const O = require(rp('api/_lib/office.js'));
const chatHandler = require(rp('api/_lib/chat.js'));

const reset = () => { store.clear(); ttl.clear(); kvDown = false; };
const XL = { kind: 'xlsx', title: 'كشف الحضور', fileName: 'حضور', lang: 'ar', sheets: [{ name: 'يومي', columns: [{ header: 'م', type: 'index' }, { header: 'الاسم' }, { header: 'الحضور', type: 'time' }, { header: 'الانصراف', type: 'time' }, { header: 'الساعات', type: 'hours' }], blankRows: 25 }] };

// ── ١. النيّة ───────────────────────────────────────────────────────────────────────
test('١. طلب ملفّ: فعل صنع + Excel/PowerPoint أو جدول من مجال معروف — لا سؤال «كيف» ولا جدول مقارنة', () => {
  for (const s of ['اريد جدول حظور وانصراف من الاكسل', 'سوي لي جدول حضور وانصراف لـ 25 موظف', 'ابي عرض بوربوينت عن السلامة', 'سوّلي باوربوينت فيه صورة وجدول',
    'جهز لي كشف درجات للصف الثالث', 'make me an excel attendance sheet', 'create a powerpoint presentation about AI', 'أبغى شيت مصاريف شهرية', 'سو لي شرائح عن اليوم الوطني']) {
    assert.equal(O.isOfficeAsk(s), true, s);
  }
  for (const s of ['كيف اسوي معادلة في الاكسل', 'ما هو البوربوينت', 'وش الفرق بين اكسل وجوجل شيت', 'السلام عليكم', 'ابي صورة قطة', 'how to make a pivot table in excel',
    'اشرح لي جدول الضرب', 'ابي جدول مقارنة بين الايفون والسامسونج', '']) {
    assert.equal(O.isOfficeAsk(s), false, s);
  }
  // المرفق الملصوق ذيلًا ليس كلام المستخدم (PITFALLS: المرفق الملصوق داخل نصّ الرسالة)
  assert.equal(O.isOfficeAsk('لخّص هذا\n\n📄 notes.txt:\n```\nسوي لي جدول اكسل\n```'), false);
});

test('٢. التعديل يُعرف بملفّ في المحادثة فقط', () => {
  const ctx = { kind: 'xlsx' };
  for (const s of ['كبّر الخط', 'زد 10 اسامي', 'غيّر اللون للأزرق', 'add 5 more rows']) assert.equal(O.isOfficeEdit(s, ctx), true, s);
  for (const s of ['شكرا', 'حلو']) assert.equal(O.isOfficeEdit(s, ctx), false, s);
  assert.equal(O.isOfficeEdit('كبّر الخط', null), false, 'بلا ملفّ سابق لا تعديل');
});

// ── ٢. التنظيف ──────────────────────────────────────────────────────────────────────
test('٣. المخطّط يُنظَّف ويُقصّ: النوع، الأسماء، المعادلات الخطرة، الشهر، الحدود', () => {
  assert.ok(O.sanitizeSpec({ kind: 'docx', title: 'x' }).error);
  assert.ok(O.sanitizeSpec({ kind: 'xlsx', title: 'x', sheets: [] }).error);
  assert.ok(O.sanitizeSpec({ kind: 'pptx', title: 'x', slides: [] }).error);
  const r = O.sanitizeSpec({
    kind: 'XLSX', title: 'جدول', fileName: '../../etc/pass:wd.xlsx', lang: 'ar', theme: 'pink',
    sheets: [
      { name: 'ورقة[1]/؟', columns: [{ header: 'أ', type: 'formula', formula: '=HYPERLINK("http://x","y")' }, { header: 'ب', type: 'formula', formula: "='[book.xlsx]S'!A1" }, { header: 'ج', formula: '{c1}*2' }, { header: 'د', type: 'choice', choices: [] }],
        rows: Array.from({ length: 500 }, () => ['1', 2, true, '<b>x</b>']), blankRows: 999, days: { month: '2026-13' } },
      { name: 'ورقة[1]/؟', columns: Array.from({ length: 50 }, (_, i) => ({ header: 'c' + i })), days: { month: '2026-2', weekend: [5, 9] } },
    ],
  });
  assert.ok(r.spec, r.error);
  const s = r.spec;
  assert.equal(s.kind, 'xlsx'); assert.equal(s.theme, 'teal'); assert.equal(s.rtl, true);
  assert.ok(!/[\\/:*?"<>|]/.test(s.fileName) && !/\.xlsx$/.test(s.fileName), s.fileName);
  const a = s.sheets[0];
  assert.ok(!/[\[\]\/\\:*?]/.test(a.name), a.name);
  assert.equal(a.columns[0].type, 'text', 'HYPERLINK يُسقط');
  assert.equal(a.columns[1].type, 'text', 'مرجع ملفّ خارجيّ يُسقط');
  assert.equal(a.columns[2].formula, '={c1}*2');
  assert.equal(a.columns[3].type, 'text', 'اختيار بلا خيارات = نصّ');
  assert.equal(a.rows.length, 200); assert.equal(a.rows[0][2], '✓');
  assert.ok(a.rows.length + a.blankRows <= 300);
  assert.equal(a.days, undefined, 'شهر ١٣ مرفوض');
  const b = s.sheets[1];
  assert.notEqual(b.name, a.name, 'اسمان مكرّران يُميَّزان');
  assert.equal(b.columns.length, 30);
  assert.deepEqual(b.days, { month: '2026-02', weekend: [5] });
  const p = O.sanitizeSpec({ kind: 'pptx', title: 'Deck', slides: Array.from({ length: 30 }, () => ({ layout: 'warp', title: 't', chart: { type: 'bar', labels: ['a', 'b'], series: [{ name: 's', values: [1, 'x', 3] }] } })) }).spec;
  assert.equal(p.slides.length, 20); assert.equal(p.slides[0].layout, 'bullets'); assert.deepEqual(p.slides[0].chart.series[0].values, [1, 0]);
  assert.equal(p.rtl, false);
});

test('٤. سياق التعديل من العميل يُنظَّف كأنّه من النموذج، والتالف أو الضخم لا شيء', () => {
  assert.equal(O.contextSpec(null), null);
  assert.equal(O.contextSpec({ kind: 'xlsx' }), null);
  assert.equal(O.contextSpec({ kind: 'pptx', title: 'x', slides: [{ title: 'a'.repeat(70000) }] }), null);
  const c = O.contextSpec(XL);
  assert.equal(c.kind, 'xlsx'); assert.equal(c.free, undefined);
  assert.ok(O.systemNote({ ctx: c }).includes('"kind":"xlsx"'));
  assert.ok(!O.systemNote({}).includes('الملفّ الحاليّ'));
});

// ── ٣. الحصّة والكروت ───────────────────────────────────────────────────────────────
test('٥. المشترك بلا حدّ؛ المجّانيّ ملفّ واحد بالشهر (المتزامن لا يعبره)؛ الضيف كرت تسجيل؛ عطل KV مفتوح', async () => {
  reset();
  for (let i = 0; i < 3; i++) {
    const r = await O.createFile(XL, { user: 'subby', subscriber: true, kv });
    assert.equal(r.event.cards.kind, 'office'); assert.ok(r.event.cards.office.spec); assert.equal(r.event.cards.office.spec.free, undefined);
  }
  assert.equal([...store.keys()].filter((k) => k.includes('subby')).length, 0, 'المشترك لا يُعدّ');
  const both = await Promise.all([O.createFile(XL, { user: 'free1', subscriber: false, kv }), O.createFile(XL, { user: 'free1', subscriber: false, kv })]);
  const ok = both.filter((r) => r.event && r.event.cards.office.spec);
  const gated = both.filter((r) => r.event && r.event.cards.office.gate === 'plans');
  assert.equal(ok.length, 1); assert.equal(gated.length, 1);
  assert.equal(ok[0].event.cards.office.spec.free, true);
  assert.match(gated[0].result, /اشتراك/);
  assert.equal(store.get(O.monthKey('free1')), '1', 'المرفوض ردّ ما زاده');
  assert.ok(ttl.get(O.monthKey('free1')) >= 31 * 86400);
  const again = await O.createFile(XL, { user: 'free1', subscriber: false, kv });
  assert.equal(again.event.cards.office.gate, 'plans', 'التعديل ملفّ جديد = اشتراك');
  assert.notEqual(O.monthKey('free1', new Date(Date.UTC(2026, 11, 1))), O.monthKey('free1', new Date(Date.UTC(2026, 10, 30))), 'شهر جديد = مفتاح جديد');
  const guest = await O.createFile(XL, { user: null, subscriber: false, kv });
  assert.equal(guest.event.cards.office.gate, 'login');
  const bad = await O.createFile({ kind: 'xlsx', title: 'x' }, { user: 'free2', subscriber: false, kv });
  assert.equal(bad.event, null); assert.equal(store.has(O.monthKey('free2')), false, 'مخطّط تالف لا يأكل الحصّة');
  kvDown = true;
  assert.ok((await O.createFile(XL, { user: 'free3', subscriber: false, kv })).event.cards.office.spec, 'عطل KV = مفتوح كبقيّة الحصص');
  assert.equal(await O.usedThisMonth('free3', kv), 0);
});

test('٦. تغيير الاسم ينقل عدّاد الشهر (لا ملفّ مجّانيّ جديد بالاسم الجديد)', async () => {
  reset();
  await O.takeMonthly('oldname', kv);
  await O.moveMonth('oldname', 'newname', kv);
  assert.equal(await O.usedThisMonth('newname', kv), 1);
  assert.equal(store.has(O.monthKey('oldname')), false);
  assert.match(read('api/_lib/auth.js'), /office\.js'\)\.moveMonth\(oldKey, newKey/);
});

// ── ٤. المعالج الحقيقيّ chat.js ──────────────────────────────────────────────────────
const token = (u) => {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
};
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const textReply = (t) => sse([{ type: 'content_block_start', index: 0, content_block: { type: 'text' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);
const toolReply = (input) => sse([
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'create_office_file', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
]);
async function chatTurn(u, text, opts) {
  const o = opts || {};
  usage = Object.assign({ allowed: true, username: u || null, tier: u ? 'free' : 'guest', subscriber: false }, o.usage || {});
  const sent = [], events = [];
  const replies = (o.replies || [textReply('تفضّل 👇')]).slice();
  const save = global.fetch;
  global.fetch = async (url, init) => {
    if (!/openrouter|anthropic|groq|googleapis|openai|deepseek|mistral|cerebras|together/i.test(String(url))) return new Response('{}', { status: 404 });
    sent.push(JSON.parse(init.body));
    return replies.length > 1 ? replies.shift() : replies[0];
  };
  const res = { setHeader() {}, status() { return this; }, flushHeaders() {}, json(v) { throw new Error('json ' + JSON.stringify(v)); },
    write(s) { String(s).split('\n').forEach((l) => { if (l.indexOf('data: ') === 0) { try { events.push(JSON.parse(l.slice(6))); } catch (e) { /* سطر غير JSON */ } } }); return true; },
    end() { this.writableEnded = true; }, writableEnded: false };
  const body = Object.assign({ messages: [{ role: 'user', content: text }], provider: 'claude' }, u ? { token: token(u) } : {}, o.body || {});
  try { await chatHandler({ method: 'POST', body, headers: {} }, res); } finally { global.fetch = save; }
  return { sent, events, cards: events.filter((e) => e.cards).map((e) => e.cards), text: events.filter((e) => typeof e.delta === 'string').map((e) => e.delta).join('') };
}
const toolNames = (b) => (b && Array.isArray(b.tools) ? b.tools.map((t) => t.name) : []);

test('٧. مجّانيّ استعمل ملفّ شهره يطلب ملفًّا: كرت اشتراك وسطر قصير — بلا نداء نموذج', async () => {
  reset();
  store.set(O.monthKey('usedup'), '1');
  const r = await chatTurn('usedup', 'سوي لي جدول حضور وانصراف من الاكسل');
  assert.equal(r.sent.length, 0, 'لا نموذج');
  assert.equal(r.cards.length, 1); assert.equal(r.cards[0].kind, 'office'); assert.equal(r.cards[0].office.gate, 'plans');
  assert.match(r.text, /🔒/);
});

test('٨. «كبّر الخط» على ملفّ المحادثة من مجّانيّ استعمل ملفّه = كرت اشتراك (التعديل بالاشتراك)', async () => {
  reset();
  store.set(O.monthKey('editor'), '1');
  const r = await chatTurn('editor', 'كبّر الخط وزد 10 أسامي', { body: { office: XL } });
  assert.equal(r.sent.length, 0);
  assert.equal(r.cards[0].office.gate, 'plans');
  const plain = await chatTurn('editor', 'شكرا', { body: { office: XL } });
  assert.equal(plain.cards.length, 0, 'كلام عاديّ بعد الملفّ لا يُحجب');
});

test('٩. الضيف يطلب ملفًّا: كرت تسجيل بلا نموذج', async () => {
  reset();
  const r = await chatTurn(null, 'ابي عرض بوربوينت عن السلامة المهنية');
  assert.equal(r.sent.length, 0);
  assert.equal(r.cards[0].office.gate, 'login');
});

test('١٠. مجّانيّ بحصّته: المسار المدفوع بأداة الملفّ وحدها + ملاحظة الدور؛ الأداة تبثّ الكرت وتعدّ؛ والطلب الثاني كرت اشتراك', async () => {
  reset();
  const r = await chatTurn('fresh', 'سوي لي جدول حضور وانصراف من الاكسل', { replies: [toolReply(XL), textReply('جهّزت لك الملف 👇')] });
  assert.ok(r.sent.length >= 1, 'نُودي النموذج');
  assert.deepEqual(toolNames(r.sent[0]), ['create_office_file'], 'أداة الملفّ وحدها');
  assert.match(JSON.stringify(r.sent[0].messages), /create_office_file مرّة واحدة/, 'ملاحظة الدور في الذيل');
  const card = r.cards.find((c) => c.office && c.office.spec);
  assert.ok(card, 'كرت الملفّ بُثّ'); assert.equal(card.office.spec.free, true); assert.equal(card.office.spec.kind, 'xlsx');
  assert.equal(await O.usedThisMonth('fresh', kv), 1);
  assert.ok(r.events.some((e) => e.k === 'stOffice'), 'سطر الحالة بمفتاح ترجمة');
  assert.ok(r.events.some((e) => e.k === 'trOfficeOk'), 'سطر الأثر بمفتاح ترجمة');
  const again = await chatTurn('fresh', 'ابي ملف اكسل للمخزون');
  assert.equal(again.sent.length, 0); assert.equal(again.cards[0].office.gate, 'plans');
});

test('١١. المجّانيّ في كلام عاديّ يبقى على السلسلة المجّانيّة بلا أدوات؛ والمشترك يأخذ أداة الملفّ مع أدواته حين يطلبه', async () => {
  reset();
  const plain = await chatTurn('chatty', 'السلام عليكم كيف الحال');
  assert.ok(plain.sent.every((b) => !toolNames(b).includes('create_office_file')));
  const sub = await chatTurn('subuser', 'ابي عرض بوربوينت عن الذكاء الاصطناعي', { usage: { tier: 'sub', subscriber: true, plan: 'basic' }, replies: [toolReply({ kind: 'pptx', title: 'AI', slides: [{ layout: 'title', title: 'AI' }] }), textReply('تفضّل')] });
  const names = toolNames(sub.sent[0]);
  assert.ok(names.includes('create_office_file') && names.length > 1, names.join(','));
  const card = sub.cards.find((c) => c.office && c.office.spec);
  assert.ok(card); assert.equal(card.office.spec.free, undefined, 'المشترك بلا شارة المجّانيّ');
  assert.equal(await O.usedThisMonth('subuser', kv), 0, 'المشترك لا يُعدّ');
  const subPlain = await chatTurn('subuser', 'ما عاصمة فرنسا؟', { usage: { tier: 'sub', subscriber: true, plan: 'basic' } });
  assert.ok(!toolNames(subPlain.sent[0]).includes('create_office_file'), 'لا أداة ملفّ في دور لا يطلبه (لا تكلفة على كلّ رسالة)');
});

// ── ٥. العميل ───────────────────────────────────────────────────────────────────────
function fakeDom() {
  const mk = (tag) => {
    const n = { tagName: String(tag).toUpperCase(), children: [], className: '', textContent: '', style: {}, dataset: {}, listeners: {}, type: '',
      appendChild(c) { this.children.push(c); return c; }, addEventListener(t, f) { this.listeners[t] = f; }, remove() {}, setAttribute() {},
      click() { if (this.listeners.click) this.listeners.click({ stopPropagation() {} }); } };
    return n;
  };
  return { createElement: mk, getElementById: () => null, head: mk('head'), body: mk('body') };
}
function loadClient(extra) {
  const ls = new Map();
  const ctx = Object.assign({ console, Promise, Object, Array, String, Number, Math, Date, JSON, Intl, Blob, URL,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {}, /* مؤقّتات التعريف لا تعمل في الاختبار — hintTick يُنادى يدويًّا */
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); } } }, extra || {});
  ctx.window = ctx; ctx.document = fakeDom();
  if (ctx.prompt) ctx.document.getElementById = (id) => (id === 'prompt' ? ctx.prompt : null);
  ctx.__swallow = (e, w) => { (ctx.swallowed = ctx.swallowed || []).push(w + ':' + (e && e.message)); };
  if (!ctx.t) ctx.t = (k) => k;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-44-office.js'), ctx, { filename: 'app-44-office.js' });
  return ctx;
}
const walk = (n, out) => { out.push(n); (n.children || []).forEach((c) => walk(c, out)); return out; };

test('١٢. العميل: آخر ملفّ في المحادثة يُرسل بلا علامة free، وتخطيط شبكة الأيّام (عطلة وعدّادات)، وزرّ كرت الاشتراك يفتح الباقات بسبب office', () => {
  const opened = [];
  const c = loadClient({ omranOpenPlans: (why, tab) => { opened.push(why + '/' + tab); return true; } });
  const spec = O.sanitizeSpec(XL).spec; spec.free = true;
  const chat = { messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y', cards: { kind: 'office', office: { spec } } }, { role: 'user', content: 'z' }] };
  const last = c.omranOfficeLast(chat);
  assert.equal(last.kind, 'xlsx'); assert.equal(last.free, undefined); assert.equal(spec.free, true, 'الأصل لا يُمسّ');
  assert.equal(c.omranOfficeLast({ messages: [] }), undefined);
  const sh = O.sanitizeSpec({ kind: 'xlsx', title: 't', sheets: [{ columns: [{ header: 'م', type: 'index' }, { header: 'الاسم' }], days: { month: '2026-11', weekend: [5, 6], choices: ['ح', 'غ'] } }] }).spec;
  const plan = c.omranOffice.sheetPlan(sh.sheets[0], sh);
  assert.equal(plan.days.n, 30); assert.equal(plan.cols.length, 2 + 30 + 2);
  assert.equal(plan.cols[2].header, '1'); assert.equal(plan.cols[2].weekend, false, '١ نوفمبر ٢٠٢٦ أحد');
  assert.equal(plan.cols[2 + 5].weekend, true, '٦ نوفمبر جمعة'); assert.equal(plan.cols[2 + 6].weekend, true, '٧ نوفمبر سبت');
  assert.deepEqual(plan.cols.slice(-2).map((x) => x.type + ':' + x.choice), ['count:ح', 'count:غ']);
  assert.deepEqual(plan.hl.map((h) => h.color), ['green', 'red'], 'ألوان تلقائيّة للاختيارات');
  assert.equal(plan.orient, 'landscape');
  const gate = c.omranOfficeCard({ gate: 'plans', used: 1, limit: 1 });
  const btn = walk(gate, []).find((n) => n.tagName === 'BUTTON');
  btn.click();
  assert.deepEqual(opened, ['office/chat']);
  const card = c.omranOfficeCard({ id: 'x', spec });
  const texts = walk(card, []).map((n) => n.textContent).join('|');
  // بلا ترجمة للمفتاح (t يعيده كما هو) يظهر النصّ العربيّ الاحتياطيّ لا اسم المفتاح
  assert.match(texts, /ملفّك المجّانيّ لهذا الشهر/); assert.match(texts, /تحميل/); assert.ok(!/office[A-Z]/.test(texts), texts);
  assert.match(texts, /حضور\u2066\.xlsx\u2069/, 'الامتداد معزول');
  assert.equal((c.swallowed || []).length, 0, (c.swallowed || []).join(';'));
});

test('١٣. الخطّافات: app-37 يرسم office، app-18 يرسل body.office، app-33 سبب office، وكلّ أجزاء البناء والمكتبات في مكانها', () => {
  assert.match(read('js/app-37-cards.js'), /cards\.kind === 'office'[^\n]*omranOfficeCard\(cards\.office\)/);
  assert.match(read('js/app-18-chat-tools.js'), /office: \(function \(\) \{ try \{ return window\.omranOfficeLast \? window\.omranOfficeLast\(__rcChat\)/);
  assert.match(read('js/app-33-plans-gate.js'), /office: 'plansWhyOffice'/);
  for (const f of ['js/vendor/exceljs.min.js', 'js/vendor/pptxgen.bundle.js', 'js/vendor/exceljs.LICENSE.txt', 'js/vendor/pptxgen.LICENSE.txt']) assert.ok(fs.existsSync(path.join(root, f)), f);
  assert.ok(!/sourceMappingURL/.test(read('js/vendor/pptxgen.bundle.js')), 'لا خرائط مصدر مفقودة (٤٠٤)');
  const a44 = read('js/app-44-office.js');
  assert.ok(/'\/js\/vendor\/exceljs\.min\.js\?v=\w+'/.test(a44) && /'\/js\/vendor\/pptxgen\.bundle\.js\?v=\w+'/.test(a44), 'المكتبتان من js/vendor'); // الوسم يُقرأ لا يُثبَّت
  assert.ok(!/claude|anthropic|openai|gemini|groq|gpt/i.test(a44.replace(/\/\*[\s\S]*?\*\//g, '')), 'لا اسم مزوّد في العميل');
  assert.ok(read('js/app.bundle.js').includes('window.omranOfficeCard'), 'الحزمة مبنيّة بالجزء الجديد');
});

test('١٤. نصوص الكرت والحالة بالـ١٤ لغة، ووسم ملفّات اللغة مرفوع', () => {
  const keys = ['stOffice', 'trOfficeOk', 'trOfficeFail', 'officeDownload', 'officePdf', 'officeSheets', 'officeSlides', 'officeFreeBadge', 'officeBuilding', 'officeFail',
    'officeGatePlans', 'officeGateLogin', 'officeSubscribe', 'officeLogin', 'officeEditHint', 'officeFreeHint', 'officeTotal', 'plansWhyOffice', 'officeHint1', 'officeHint2', 'officeHint3'];
  const ctx = { I18N: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  const data = read('js/app-03-i18n-data.js');
  for (const k of keys) assert.equal((data.match(new RegExp('[\\s{,"\']' + k + '["\']?\\s*:', 'g')) || []).length, 2, 'ar+en مرّة لكلّ لغة (لا تصادم مع مفتاح قائم): ' + k);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) { const f = read('i18n/' + lg + '.js'); for (const k of keys) assert.equal((f.match(new RegExp('[\\s{,"\']' + k + '["\']?\\s*:', 'g')) || []).length, 1, lg + ' مرّة واحدة: ' + k); }
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    ctx.I18N[lg] = {};
    vm.runInContext(read('i18n/' + lg + '.js'), ctx);
    for (const k of keys) assert.ok(typeof ctx.I18N[lg][k] === 'string' && ctx.I18N[lg][k].length > 0, lg + ': ' + k);
    for (const k of ['officeSheets', 'officeSlides']) assert.ok(ctx.I18N[lg][k].includes('{n}'), lg + ': ' + k + ' بلا {n}');
  }
  const vm1 = /i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js')); // الرقم يُقرأ لا يُثبَّت (arch-ratchet vPinTests)
  assert.ok(vm1 && Number(vm1[1]) > 783, 'وسم ملفّات اللغة رُفع بعد إضافة النصوص');
});

// ── ٦. التعريف بالميزة: أمثلة خانة الكتابة + سطر الاقتراح من النموذج، ويتوقّفان بعد أوّل ملفّ ─────────────────
test('١٥. الاقتراح: موضوع ينفعه جدول، لم يُعرض في المحادثة؛ و«إيه سوّه» بعد العرض = طلب ملفّ', () => {
  for (const s of ['عندي 20 موظف وابي انظم دوامهم', 'ابي انظم مصاريفي هالشهر', 'I need to track my students grades']) assert.equal(O.isHintTopic(s), true, s);
  for (const s of ['السلام عليكم', 'ما عاصمة فرنسا', 'ابي صورة قطة', 'سوي لي جدول حضور من الاكسل']) assert.equal(O.isHintTopic(s), false, s);
  const offer = { role: 'assistant', content: 'هذي طريقة… أقدر أسوي لك هذا ملف Excel جاهز للطباعة إذا تبي 📄' };
  assert.equal(O.alreadyOffered([{ role: 'user', content: 'x' }, offer]), true);
  assert.equal(O.alreadyOffered([{ role: 'assistant', content: 'هلا' }]), false);
  assert.equal(O.isOfficeAccept('ايه سوه', [offer, { role: 'user', content: 'ايه سوه' }]), true);
  assert.equal(O.isOfficeAccept('yes please', [offer, { role: 'user', content: 'yes please' }]), true);
  assert.equal(O.isOfficeAccept('ايه', [{ role: 'assistant', content: 'تبي قهوة؟' }, { role: 'user', content: 'ايه' }]), false, 'موافقة على شيء آخر');
  assert.equal(O.isOfficeAccept('ايه بس قبلها قل لي كيف أحسب الضريبة على الفواتير بالتفصيل', [offer, { role: 'user', content: 'x' }]), false, 'كلام طويل ليس موافقة');
});

test('١٦. المعالج: سطر الاقتراح يصل النموذج (المجّانيّ والمشترك) ما دام العميل يطلبه، ومرّة في المحادثة، ولا لمن خلص ملفّ شهره', async () => {
  reset();
  const HINT = '[اقتراح ملفّ';
  const seen = (r) => JSON.stringify(r.sent).includes(HINT);
  assert.ok(seen(await chatTurn('hinty', 'عندي 20 موظف وابي انظم دوامهم', { body: { officeHint: true } })), 'المجّانيّ: في نظام السلسلة المجّانيّة');
  assert.ok(seen(await chatTurn('hintsub', 'عندي 20 موظف وابي انظم دوامهم', { body: { officeHint: true }, usage: { tier: 'sub', subscriber: true, plan: 'basic' } })), 'المشترك: في ذيل الدور');
  assert.ok(!seen(await chatTurn('hinty', 'عندي 20 موظف وابي انظم دوامهم')), 'صنع ملفًّا على جهازه (لا officeHint) = لا اقتراح');
  assert.ok(!seen(await chatTurn('hinty', 'ما عاصمة فرنسا؟', { body: { officeHint: true } })), 'موضوع لا ينفعه جدول');
  const offered = { messages: [{ role: 'user', content: 'كيف أرتّب رواتب الموظفين' }, { role: 'assistant', content: 'كذا… أقدر أسوي لك ملف Excel جاهز للطباعة إذا تبي 📄' }, { role: 'user', content: 'وكيف أحسب الإضافي للموظفين؟' }], officeHint: true };
  assert.ok(!seen(await chatTurn('hinty', 'وكيف أحسب الإضافي للموظفين؟', { body: offered })), 'عُرض في المحادثة = لا يتكرّر');
  store.set(O.monthKey('spent'), '1');
  assert.ok(!seen(await chatTurn('spent', 'عندي 20 موظف وابي انظم دوامهم', { body: { officeHint: true } })), 'المجّانيّ الذي خلص ملفّ شهره لا يُعرض عليه ما لا يقدر عليه');
  // «إيه سوّه» بعد العرض: مجّانيّ بحصّته ← المسار المدفوع بأداة الملفّ
  const acc = await chatTurn('accepter', 'ايه سوه', { body: { messages: [{ role: 'user', content: 'كيف أرتّب رواتب الموظفين' }, { role: 'assistant', content: 'كذا… أقدر أسوي لك ملف Excel جاهز للطباعة إذا تبي 📄' }, { role: 'user', content: 'ايه سوه' }] } });
  assert.deepEqual(toolNames(acc.sent[0]), ['create_office_file']);
});

test('١٧. العميل: أمثلة خانة الكتابة تتبدّل حتّى أوّل ملفّ ثمّ تتوقّف نهائيًّا، ولا تمسّ نصًّا باهتًا لغيرها؛ وapp-18 يرسل officeHint', () => {
  const attrs = { placeholder: 'اكتب رسالتك هنا ...' };
  const prompt = { getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = v; } };
  const dict = { promptPlaceholder: 'اكتب رسالتك هنا ...', officeHint1: 'H1', officeHint2: 'H2', officeHint3: 'H3' };
  const c = loadClient({ prompt, t: (k) => (k in dict ? dict[k] : k) });
  assert.equal(c.omranOfficeHintWanted(), true);
  c.omranOffice.hintTick(); assert.equal(attrs.placeholder, 'H1');
  c.omranOffice.hintTick(); assert.equal(attrs.placeholder, 'H2');
  attrs.placeholder = 'وضع آخر'; c.omranOffice.hintTick(); assert.equal(attrs.placeholder, 'وضع آخر', 'نصّ وضع آخر لا يُلمس');
  attrs.placeholder = 'H3';
  c.omranOfficeCard({ id: 'x', spec: O.sanitizeSpec(XL).spec });
  assert.equal(c.omranOfficeHintWanted(), false, 'أوّل ملفّ يوقف التعريف');
  assert.equal(attrs.placeholder, 'اكتب رسالتك هنا ...', 'النصّ الأصليّ يعود');
  c.omranOffice.hintTick(); assert.equal(attrs.placeholder, 'اكتب رسالتك هنا ...', 'ولا يعود للتبدّل بعدها');
  const c2 = loadClient({ prompt });
  c2.omranOfficeCard({ gate: 'plans' });
  assert.equal(c2.omranOfficeHintWanted(), false, 'كرت «خلص ملفّ الشهر» (ملفّ من جهاز آخر) يوقفه أيضًا');
  assert.match(read('js/app-18-chat-tools.js'), /officeHint: \(function \(\) \{ try \{ return \(window\.omranOfficeHintWanted && window\.omranOfficeHintWanted\(\)\) \? true : undefined;/);
});

