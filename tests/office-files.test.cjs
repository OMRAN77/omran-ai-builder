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

// ── ٦. v-office-image / v-office-spell / v-office-explicit (رسالة المالك ٨ نوفمبر «سولي راجعه بي  الباور بويت» مع لقطة شاشة: سؤال «قصدك…؟» بلا ملفّ؛ ومراجعة الإصلاح) ──
const SPELL_YES = ["سولي راجعه بي  الباور بويت", "ابي بوربويت عن السلامة المرورية", "سولي باوربويت عن اليوم الوطني", "سوي لي باور بويت للدرس الثالث", "جهز لي بور بويت عن الطاقة الشمسية", "سوي لي باور  بويت عن الماء", "ابي بوربونت عن الصحة النفسية", "سوي لي باوربونت فيه صور", "اريد بووربوينت عن الفضاء", "سوي لي باوور بوينت للمشروع", "ابغى بوير بوينت عن التلوث", "سويلي باوربوينط عن القراءة", "أبي ملف باور-بوينت للاجتماع", "سوي لي بوربوانت عن الذكاء الاصطناعي", "اعمل لي البوربويت", "ودي بالبوربونت مراجعة للوحدة الثانية", "جهزلي البور بوينت للمحاضرة", "سولي مراجعة بالباوربوينت", "سوي لي عرض بوربويت عن السلامة", "ابي ملف ايكسيل فيه اسماء الفريق", "سوي لي جدول بالإيكسل", "سوي لي ملف بالإكسل", "ابي الاكسيل للحسابات", "make me a powerpont about climate change", "create a powerpoit about AI", "make me a power poit on road safety", "i want a pwerpoint about space", "can you make a powepoint for my class", "make me a powerpiont about history", "make me an exel sheet for expenses", "I need an exel file with the team names", "سوي لي برزنتيشن عن الامن السيبراني", "ابي بريزنتيشن للمشروع", "make me a ppt about AI"];
const SPELL_NO = ["ابي اعرف كيف افتح البوربويت", "كيف أسترجع ملف بوربويت انحذف", "وين البوربويت في الكمبيوتر", "البوربويت ما يفتح عندي", "افتح لي البوربويت", "عندي بوربونت بكرة في الجامعة", "ارسلت لك البوربويت", "راجع لي البوربوينت", "راجعه لي ملف الاكسل", "مراجعة بالباوربويت للدرس الثالث", "سولي بيت", "ابي بور بيت", "ابي باور بانك", "عطني باوربانك زين", "سولي باور بانك من الكرتون", "ابي بوابة دفع لموقعي", "سولي بويضة مسلوقة", "سولي راي بالبور", "ابي رحلة الى بور سعيد", "ابي اعرف عن بورصة دبي", "سوي لي سبورة ذكية", "ابي سيارة بورش", "ابي كاس بوربون", "ابي بوت تيليجرام", "سوي لي باور بوت للديسكورد", "ابي صور طيارات بوينغ", "سولي طابور بنات", "ابي ابني يكون صبور بيني وبينه", "ابي فيلم عن العبور بين الحدود", "سوي لي سكربت PowerShell ينظف الجهاز", "ابي افتح powershell بدون ما يقفل", "انا أكسل واحد في البيت، ابي نصيحة", "هو الأكسل بيننا، ابي حل معاه", "ابي اصلح الخلل بالأكسل", "ابي ابدأ بالأكسل فيهم", "ابي صور أكسيل فيتسل", "ابي شي يخلي ولدي مايكسل", "ابي ولدي لايكسل عن الدراسة", "ابي صورة 4000 بيكسل", "ابي اكبر البكسل في الصورة", "ابي تاكسي للمطار", "ابي اكسسوارات للجوال", "ابي تلخص التقرير old-report.xls", "ابي شرايح لحم للشوي", "ابي شرايح بيانات زين", "I want photos from pexels of the sea", "give me a pexels link for a beach photo", "make me a power bank guide", "I want a powerful speech for graduation", "create a power plant diagram", "I want to make my point clear", "build me a pixel art image", "make me a PowerShell script to clean my disk"];
// نيّة الملفّ نصًّا (بلا صورة): البرنامج مفعول الفعل لا الفعل في أيّ مكان، والنصيحة ليست ملفًّا، والتحويل طلب ملفّ
const ASK_YES = ['ابي ملف اكسل اثبت فيه حضور الطلاب', 'ابي كشف اثبت فيه الحضور والانصراف للموظفين', 'اريد سجل أثبت فيه غياب الطلاب', 'ابي جدول حضور اكسل ثبت الصف الاول', 'ابي شيت مصاريف ارجع له نهاية الشهر', 'ابي ملف اكسل ارجع له كل شهر', 'create a powerpoint about backup and restore strategies', 'I want a powerpoint about backup and restore', 'make an excel checklist to install new servers', 'ابي بوربوينت: استعيد ثقتك بنفسك', 'ابي بوربوينت عن ارجع لربك', 'سوي لي بوربوينت يشرح كيف افتح حساب بنكي', 'make me a powerpoint on how to install python', 'سوي لي بوربوينت عشان افتح البوربوينت بالاجتماع', 'ابي بوربوينت فيه نصايح للمذاكرة', 'سوي لي بوربوينت فيه نصايح', 'ابي ملف بالشيت حق المصاريف', 'حوّل هذا الجدول إلى اكسل', 'convert this table to excel', 'turn this into a powerpoint'];
const ASK_NO = ['ابي نصايح للبرزنتيشن', 'ابي اتدرب على البرزنتيشن حقي بكره', 'عندي بوربويت بكرة ابي نصايح', 'give me tips for my presentation', 'ابي افكار لبوربوينت عن البيئة', 'make me an exelent essay about my mom', 'make me an exellent essay', 'تمشيت اليوم مع ابوي ابي اكتب عنها قصة', 'مشيت هنا امس ابي اعرف وين هذا المكان', 'كيف احول الملف الى اكسل', 'سؤال حول تحويل الملف الى اكسل', 'how to convert pdf to excel', 'حولت الملف الى اكسل امس', 'ابي انزل برنامج الاكسل', 'i want to install excel', 'ابي احمل البوربوينت مجانا'];
// مع صورة: الطلب الصريح وحده (الفعل مفعوله الملفّ، أو الملفّ صيغته، أو تحويل إليه)
const IMG_YES = ['سولي راجعه بي  الباور بويت', 'سوي لي اكسل من هذا الجدول', 'سولي اكسل من هالجدول', 'ابي ملف اكسل من هذي الصورة', 'make an excel sheet from this table', 'سولي مراجعة بالباوربوينت', 'سوي لي شيت للحضور', 'create a powerpoint from this', 'سوّ لي ملف إكسل من هذا الجدول', 'ابي عرض بوربوينت من هذي الصورة', 'سوي لي جدول بالإيكسل', 'سوي لي جدول حضور من هذي الصورة', 'سوي لي كشف درجات من هالصورة', 'سوي لي ملف للحضور من هالصورة', 'حوّل هذا الجدول إلى اكسل', 'حول الجدول لملف اكسل', 'convert this table to excel', 'turn this into a powerpoint', 'انقل الجدول اللي في الصورة الى اكسل', 'make me a powerpont about this', 'سوي لي برزنتيشن من هذي الصورة', 'سوي لي جدول باكسل من هالصورة', 'سوي لي عرض ببوربوينت عن هذي الصورة', 'make me an exel sheet from this photo', 'سوي لي بوربوينت فيه شعار الشركة', 'تقدر تسوي لي اكسل من هذا الجدول؟', 'can you make an excel from this?', 'ابي جدول مصاريف مثل هذا', 'اعمل لي عرض تقديمي عن الصورة', 'سوي لي بوربوينت بنفس ستايل هذي الصورة', 'سوي لي بوربوينت بخلفية زرقاء', 'ابي هذا الجدول بالاكسل', 'ابي الجدول هذا اكسل', 'سوي لي نفس هذا بالاكسل', 'I want this table in excel', 'make it in excel', 'حوّل الصورة الى اكسل', 'سوي لي اكسل من هذا الجدول\n\n[مرفقات: IMG_2231.jpg]'];
const IMG_NO = ['شيل الخلفية عشان احطها في البوربوينت', 'remove the background so I can paste it into powerpoint', 'make this logo transparent for my slides', 'سوي لي شيت ستيكر من صورتي', 'صمم بوستر لدورة اكسل من هالصورة', 'كبر الصورة عشان تناسب السلايد', 'اكتب على الصورة دورة الاكسل', 'add the text "PowerPoint Workshop" to this image', 'كبرها عشان السلايد', 'make it transparent for my slides', 'سوي منها شيت ستيكرات', 'make it look like a presentation cover', 'اكتب كلمة Excel على الصورة', 'شيل شعار PowerPoint من الصورة', 'remove the excel logo from this image', 'خل شرائح الطماطم أكبر في الصورة', 'غير لون الشيت للأزرق', 'خل السلايد أحمر في الصورة', 'make this photo look like a presentation slide', 'شيل الخلفية ابيها للبوربوينت', 'ابي اشيل الخلفية عشان احطها بالبوربوينت', 'remove the background, I need it for my presentation', 'سوي لي صورة احطها في البوربوينت', 'make me a picture for my presentation', 'صمم لي شعار للبوربوينت', 'make the slide background blue in this photo', 'الاكسل يطلع لي هالخطأ ابي حل', 'I need help with this excel error', 'I need help in excel', 'ابي رايك في البوربوينت حقي', 'مشيت هنا امس ابي اعرف وين هذا المكان', 'ابي شرائح زين مثل هذي', 'ابي اعرف وش المشكلة في الاكسل', 'ابي نصايح للبرزنتيشن', 'ابي اعرف وش هذا', 'ابي اعرف كم واحد غاب\n\n[مرفقات: جدول الحضور.jpg]', 'ابي هذا البوربوينت يكون احلى', 'ابي المساعدة بالاكسل', 'I want my logo in the presentation', 'make me a slideshow from these photos', 'حطها في سلايد'];
// لقطة المالك من تطبيقه: «ابي/ودي» كلام عن الواجهة، وعنصر واجهة في الطلب (زرّ، أيقونة، كرت، تبويب) ليس ملفًّا
const OWNER_NO = ['ابي زر اكسل هنا', 'ابي زر تصدير اكسل جنب المشاركة', 'ابي هنا خيار بوربوينت', 'ابي ايقونة اكسل فوق', 'ابي الاكسل يطلع في القائمة هنا', 'ودي زر بوربوينت في الشريط', 'ابي زر الباوربوينت يكون هنا', 'سو لي زر اكسل هنا', 'ابي شيت هنا بدال الجدول', 'ابي عرض بوربوينت لهذا القسم', 'ابي زر تحميل الاكسل يكون أوضح', 'ابي كرت الاكسل يكون اكبر', 'سوي زر بوربوينت هنا', 'سوي زر تصدير بالاكسل', 'سوي كرت الاكسل اكبر', 'حوّل الزر الى اكسل'];
const OWNER_YES = ['سولي راجعه بي  الباور بويت', 'سوي لي اكسل من هذا الجدول', 'حوّل هذا الجدول إلى اكسل', 'سوي لي بوربوينت يشرح التطبيق للمستثمرين', 'make me a powerpoint from this screenshot'];

test('١٨. كتابة الناس لـPowerPoint/Excel تُعرف (٣٤ نعم و٥٣ لا)، وذيل «[مرفقات: …]» ليس كلام المستخدم، و«افتح/استرجع البرنامج» (البرنامج مفعوله) ليس طلب ملفّ ولا النصيحة، والتحويل طلب، وسطر الصورة في ملاحظة الدور', () => {
  for (const t of SPELL_YES) assert.equal(O.isOfficeAsk(t), true, 'طلب ملفّ: ' + t);
  for (const t of SPELL_NO) assert.equal(O.isOfficeAsk(t), false, 'ليس طلب ملفّ: ' + t);
  assert.equal(O.isOfficeAsk('سولي راجعه بي  الباور بويت\n\n[مرفقات: screen.png]'), true, 'رسالة المالك ومعها لقطة');
  assert.equal(O.isOfficeAsk('ابي اعرف كم واحد غاب\n\n[مرفقات: جدول الحضور.jpg]'), false, 'اسم المرفق ليس طلبًا');
  assert.equal(O.isOfficeAsk('ابي رايك\n\n[Attachments: presentation.png]'), false);
  assert.equal(O.isOfficeAsk('سوي لي اكسل من هذا الجدول\n\n[مرفقات: IMG_2231.jpg]'), true);
  for (const t of ['ابي افتح البوربوينت', 'ابغى استرجع ملف الاكسل اللي انحذف', 'ابي اثبت الاكسل', 'أبي أشغّل الباوربوينت', 'i want to recover my powerpoint']) assert.equal(O.isOfficeAsk(t), false, 'البرنامج نفسه: ' + t);
  for (const t of ['ابي عرض بوربوينت عن فتح مكة', 'ابي عرض بوربوينت عن شغل الفريق', 'ابي ملف اكسل احفظ فيه مصاريفي', 'i want a powerpoint for the open day', 'سوي لي بوربويت وافتحه']) assert.equal(O.isOfficeAsk(t), true, 'اسم لا فعل برنامج: ' + t);
  for (const t of ASK_YES) assert.equal(O.isOfficeAsk(t), true, 'طلب ملفّ (الفعل ليس مفعوله البرنامج): ' + t);
  for (const t of ASK_NO) assert.equal(O.isOfficeAsk(t), false, 'ليس طلب ملفّ: ' + t);
  assert.match(O.systemNote({ image: true }), /\[صورة مرفقة مع طلب الملفّ\]/);
  assert.match(O.systemNote({ image: true }), /لا edit_image ولا generate_image/);
  assert.doesNotMatch(O.systemNote({}), /صورة مرفقة/);
  // ذيل المرفقات يُحذف بعد القصّ: \n* في أوّل تعبيره تربيعيّ على سطور جديدة طويلة (المراجعة: ٨٠ ألفًا = ٥ ث لكلّ دور)
  const big = 'a' + '\n'.repeat(80000) + 'x', t0 = Date.now();
  const r = [O.isOfficeAsk(big), O.isOfficeAccept(big, []), O.isHintTopic(big), O.isOfficeEdit(big, { kind: 'xlsx' }), O.isOfficeImageAsk(big, false)];
  assert.ok(Date.now() - t0 < 300, 'أقلّ من ٣٠٠ م.ث — ' + (Date.now() - t0));
  assert.deepEqual(r, [false, false, false, false, false]);
});

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const IMG_BLOCK = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } };
const withImg = (text) => ({ messages: [{ role: 'user', content: [{ type: 'text', text }, IMG_BLOCK] }] });
const OWNER = { tier: 'owner', subscriber: true };
const SUB = { tier: 'sub', subscriber: true, plan: 'basic' };
const tail = (b) => JSON.stringify(b && b.messages);
const forced = (r) => r.sent.some((b) => /create_office_file مرّة واحدة/.test(tail(b)));

test('١٩. طلب ملفّ صريح مع صورة: المالك والمشترك يأخذان الأداة وملاحظة الدور وسطر الصورة؛ و«ابي» مع صورة أو مفعول غير الملفّ (بوستر، شعار، سؤال) ليس ملفًّا؛ والمجّانيّ والضيف كما كانا', async () => {
  for (const t of IMG_YES) assert.equal(O.isOfficeImageAsk(t, false), true, 'صريح مع صورة: ' + t);
  for (const t of IMG_NO) { assert.equal(O.isOfficeImageAsk(t, false), false, 'ليس ملفًّا مع صورة: ' + t); assert.equal(O.isOfficeImageAsk(t, true), false, 'المالك: ' + t); }
  reset();
  const own = await chatTurn('omran', '', { usage: OWNER, body: withImg('سولي راجعه بي  الباور بويت'), replies: [toolReply({ kind: 'pptx', title: 'مراجعة', slides: [{ layout: 'title', title: 'مراجعة' }] }), textReply('جهّزت العرض 👇')] });
  assert.ok(own.sent.length >= 1, 'نُودي النموذج');
  assert.ok(toolNames(own.sent[0]).includes('create_office_file'), 'المالك: أداة الملفّ مع الصورة — ' + toolNames(own.sent[0]).join(','));
  assert.match(tail(own.sent[0]), /create_office_file مرّة واحدة/, 'ملاحظة الدور الإلزاميّة');
  assert.match(tail(own.sent[0]), /صورة مرفقة مع طلب الملفّ/, 'سطر الصورة');
  assert.ok(own.cards.find((c) => c.office && c.office.spec), 'كرت الملفّ');
  const sub = await chatTurn('subimg', '', { usage: SUB, body: withImg('سوي لي ملف اكسل من هذا الجدول'), replies: [toolReply(XL), textReply('تفضّل 👇')] });
  assert.ok(toolNames(sub.sent[0]).includes('create_office_file'), 'المشترك: ' + toolNames(sub.sent[0]).join(','));
  assert.match(tail(sub.sent[0]), /صورة مرفقة مع طلب الملفّ/);
  const conv = await chatTurn('subimg', '', { usage: SUB, body: withImg('حوّل هذا الجدول إلى اكسل'), replies: [toolReply(XL), textReply('تفضّل 👇')] });
  assert.ok(forced(conv), 'التحويل إلى اكسل مع صورة الجدول = ملفّ');
  for (const t of ['صمم بوستر لدورة اكسل من هالصورة', 'ابي رايك في البوربوينت حقي', 'I need help with this excel error', 'سوي لي شيت ستيكر من صورتي']) {
    const r = await chatTurn('subimg', '', { usage: SUB, body: withImg(t) });
    assert.equal(forced(r), false, 'المشترك مع صورة — ليس ملفًّا إجباريًّا: ' + t);
  }
  const free = await chatTurn('freeimg', '', { body: withImg('سوي لي ملف اكسل من هذا الجدول') });
  assert.ok(free.sent.every((b) => !toolNames(b).includes('create_office_file')), 'المجّانيّ مع صورة: لا مسار مدفوع (إنفاق — بإذن المالك)');
  assert.equal(free.cards.filter((c) => c.office).length, 0, 'ولا كرت حصّة');
  assert.equal(await O.usedThisMonth('freeimg', kv), 0, 'ولا يُعدّ من ملفّ شهره');
  const guest = await chatTurn(null, '', { body: withImg('ابي عرض بوربوينت من هذي الصورة') });
  assert.equal(guest.cards.filter((c) => c.office).length, 0, 'الضيف مع صورة: لا كرت تسجيل، المحادثة كما كانت');
});

test('٢٠. حراسة الصورة بما يرسله العميل فعلًا: لقطة المالك لواجهة تطبيقه (ownerUiShot:false كما يرسله app-18 لـ«ابي زر اكسل هنا»)، وسؤال عن الصورة، و«إيه سوّه» مع صورة — لا ملفّ إجباريّ', async () => {
  for (const t of OWNER_NO) assert.equal(O.isOfficeImageAsk(t, true), false, 'لقطة المالك: ' + t);
  for (const t of OWNER_YES) assert.equal(O.isOfficeImageAsk(t, true), true, 'طلب المالك الصريح: ' + t);
  reset();
  for (const t of ['ابي زر اكسل هنا', 'سو لي زر اكسل هنا', 'ابي شيت هنا بدال الجدول']) {
    const r = await chatTurn('omran', '', { usage: OWNER, body: Object.assign(withImg(t + '\n\n[مرفقات: Screenshot 2026-11-08.png]'), { ownerUiShot: false }) });
    assert.equal(forced(r), false, 'لقطة واجهة التطبيق ليست طلب ملفّ: ' + t);
  }
  // بلا علامة العميل يُقرأ النصّ (uiEditTurn): «وضيفه هنا» تعديل واجهة — ومع ownerUiShot:false قرار العميل يغلب
  const noFlag = await chatTurn('omran', '', { usage: OWNER, body: withImg('سوي لي اكسل من هذا الجدول وضيفه هنا') });
  assert.equal(forced(noFlag), false, 'بلا علامة: تعابير الخادم (uiEditTurn) تمنع الملفّ');
  const flagFalse = await chatTurn('omran', '', { usage: OWNER, body: Object.assign(withImg('سوي لي اكسل من هذا الجدول وضيفه هنا'), { ownerUiShot: false }) });
  assert.equal(forced(flagFalse), true, 'قرار العميل (ليست لقطة واجهة) يغلب التعابير');
  const ask = await chatTurn('omran', '', { usage: OWNER, body: withImg('ابي اعرف وش هذا') });
  assert.equal(forced(ask), false, 'سؤال عن الصورة');
  const named = await chatTurn('omran', '', { usage: OWNER, body: withImg('ابي اعرف كم واحد غاب\n\n[مرفقات: جدول الحضور.jpg]') });
  assert.equal(forced(named), false, 'اسم المرفق ليس طلبًا');
  store.set(O.monthKey('editimg'), '1');
  const edit = await chatTurn('editimg', '', { body: Object.assign(withImg('ابي اعرف وش هذا'), { office: XL }) });
  assert.equal(edit.cards.filter((c) => c.office && c.office.gate).length, 0, 'المجّانيّ مع صورة وملفّ في المحادثة: لا كرت اشتراك على سؤال');
  const offer = [{ role: 'user', content: 'كيف أرتّب رواتب الموظفين' }, { role: 'assistant', content: 'أقدر أسوي لك ملف Excel جاهز للطباعة إذا تبي 📄' }, { role: 'user', content: [{ type: 'text', text: 'ايه سوه' }, IMG_BLOCK] }];
  const acc = await chatTurn('acceptimg', '', { body: { messages: offer } });
  assert.ok(acc.sent.every((b) => !toolNames(b).includes('create_office_file')), '«إيه سوّه» مع صورة: لا مسار الملفّ المدفوع للمجّانيّ');
  assert.equal(await O.usedThisMonth('acceptimg', kv), 0);
});

test('٢١. العميل: فيتو الطلب الصريح في مدخل مسار تعديل الصورة نسخة حرفيّة من الخادم — صورة + «سوّ لي اكسل من هذا الجدول» للمحادثة، و«شيل الخلفية عشان احطها في البوربوينت» تعديل', () => {
  const src = read('js/app-09-attach.js');
  const names = { STICKER_RE: 'OMRAN_OFFICE_STICKER_RE', CONV_RE: 'OMRAN_OFFICE_CONV_RE', NOT_OBJ_RE: 'OMRAN_OFFICE_NOT_RE', OBJ_RE: 'OMRAN_OFFICE_OBJ_RE', MED_RE: 'OMRAN_OFFICE_MED_RE' };
  const lines = [];
  for (const [k, n] of Object.entries(names)) {
    const line = src.split('\n').find((l) => l.startsWith('const ' + n + ' = '));
    assert.ok(line, 'تعبير العميل خارج __sendPromptCore: ' + n);
    const re = vm.runInNewContext(line.replace('const ' + n + ' = ', '').replace(/;\s*$/, ''));
    assert.equal(re.source, O.EXPLICIT[k].source, 'نسخة حرفيّة من office.js: ' + n);
    assert.equal(re.flags, O.EXPLICIT[k].flags);
    assert.doesNotMatch(line, /\(\?<[=!]/, 'بلا lookbehind (سفاري قبل 16.4)');
    lines.push(line);
  }
  const fnLine = src.split('\n').find((l) => l.startsWith('function omranOfficeFileAsk(text){'));
  assert.ok(fnLine, 'الدالّة خارج __sendPromptCore');
  const C = {}; vm.runInNewContext(lines.join('\n') + '\n' + fnLine + '\nthis.ask = omranOfficeFileAsk;', C);
  const all = [].concat(IMG_YES, IMG_NO, ASK_YES, ASK_NO, SPELL_YES, SPELL_NO);
  for (const t of all) assert.equal(C.ask(t), O.explicitFileAsk(t, false), 'العميل = الخادم: ' + t);
  for (const t of IMG_YES.filter((x) => x.indexOf('[مرفقات') === -1)) assert.equal(C.ask(t), true, 'فيتو: ' + t);
  for (const t of IMG_NO.filter((x) => x.indexOf('[مرفقات') === -1 && !/وش هذا|حل$|error|help|رايك|اعرف|مشكلة|زين|نصايح|احلى|المساعدة/.test(x))) assert.equal(C.ask(t), false, 'تعديل صورة: ' + t);
  assert.ok(src.includes('&& !__codeWordRe.test(text) && !omranOfficeFileAsk(text) && !__ATT_VISION_RE.test(text)'), 'الفيتو في مدخل مسار التعديل نفسه');
  // السلوك نفسه من سطر المدخل الحقيقيّ (tests/_route-src.cjs يستخرج الدالّة وتعابيرها ويعرف الفيتو بوجوده في السطر)
  const h = require('./_route-src.cjs').load(path.join(__dirname, '..'));
  for (const t of ['سوي لي اكسل من هذا الجدول', 'حوّل هذا الجدول إلى اكسل', 'make an excel sheet from this table', 'سولي راجعه بي  الباور بويت']) assert.equal(h.after(t).edit, false, 'بعد صورة مولَّدة — ملفّ لا تعديل: ' + t);
  for (const t of ['سوي منها شيت ستيكرات', 'كبرها عشان السلايد', 'make it transparent for my slides', 'make it look like a presentation cover']) assert.equal(h.after(t).edit, true, 'بعد صورة مولَّدة — تعديل كما كان: ' + t);
});
