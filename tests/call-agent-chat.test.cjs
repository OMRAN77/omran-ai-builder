// tests/call-agent-chat.test.cjs — v-call-agent: المعالج الحقيقيّ للمحادثة — أداة propose_call عند المالك وحده، واستدعاؤها يرسل حدث
// cards بنوع call (الكرت) وتصل الموديل نتيجة «لم يُتّصل بأحد»؛ والرقم الذي لم يكتبه المالك لا يدخل الاقتراح.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'call-chat-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.OWNER_USERNAME = 'omran';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'GOOGLE_PLACES_API_KEY', 'TAVILY_API_KEY', 'GOOGLE_SEARCH_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async (k) => (db.has(k) ? db.get(k) : null),
  kvSetRaw: async (k, v) => { db.set(k, String(v)); }, kvSetIfAbsent: async (k, v) => { if (db.has(k)) return false; db.set(k, String(v)); return true; },
  kvIncr: async () => 1, kvIncrBy: async () => 1, kvList: async () => [],
});
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async (tok) => ({ allowed: true, username: 'x' }),
  checkAndConsumeCustom: async () => ({ allowed: true, username: 'x', remaining: 9 }),
});
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
const realSearch = require(rp('api/_lib/search.js'));
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: realSearch.regionOf, hasRegion: realSearch.hasRegion });
const chat = require(rp('api/_lib/chat.js'));

function token(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); }
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const toolTurn = (name, input) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name, input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 1 } },
]);
const textTurn = (t) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
async function ask(user, question, turns) {
  const log = { model: [] };
  const saved = global.fetch;
  let turn = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/openrouter\.ai/.test(u)) { log.model.push(JSON.parse(init.body)); const t = turns[Math.min(turn++, turns.length - 1)]; return t(); }
    return new Response('{}', { status: 404 });
  };
  let written = '';
  const msgs = Array.isArray(question) ? question : [{ role: 'user', content: question }]; // v-call-agent-r2: محادثة بعدّة رسائل
  const req = { method: 'POST', headers: {}, body: { messages: msgs, token: token(user), provider: 'deepseek' } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {}, writableEnded: false };
  try { await chat(req, res); } finally { global.fetch = saved; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  const second = log.model[1];
  const tr = second && second.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((c) => c && c.type === 'tool_result');
  return { log, events, toolResult: tr ? String(tr.content) : '' };
}

test('١. المالك: propose_call في أدواته، واستدعاؤها يرسل كرت call بلا الرقم كاملًا، والموديل يستلم «لم يُتّصل بأحد»', async () => {
  const r = await ask('omran', 'اتصل على عيادة ابتسامة ٠٥٠١٢٣٤٥٦٧ واحجز لي تنظيف الأحد العصر', [
    () => toolTurn('propose_call', { business: 'عيادة ابتسامة', phone: '0501234567', goal: 'حجز تنظيف أسنان الأحد بعد العصر', caller_name: 'عمران' }),
    () => textTurn('جهّزت كرت الاتّصال، اضغط «جرّب عليّ» أو «اتّصل فعليًّا».'),
  ]);
  assert.ok(r.log.model.length >= 2, 'دوران: الأداة ثمّ الجواب');
  assert.ok(r.log.model[0].tools.some((t) => t.name === 'propose_call'), 'الأداة عند المالك');
  const card = r.events.find((e) => e.cards && e.cards.kind === 'call');
  assert.ok(card, 'حدث الكرت وصل العميل');
  assert.equal(card.cards.call.phoneMasked, '+971 50 *** 4567');
  assert.equal(card.cards.call.phoneReady, true);
  assert.doesNotMatch(JSON.stringify(card), /501234567/);
  assert.match(r.toolResult, /لم يُتّصل بأحد/);
  const stored = [...db.entries()].find(([k]) => k.startsWith('call/prop/'));
  assert.ok(stored && JSON.parse(stored[1]).phone === '+971501234567', 'الاقتراح محفوظ بالرقم الكامل في الخادم');
});

test('٢. غير المالك: لا أداة propose_call في قائمته (القائمة ثابتة لكلّ فئة)', async () => {
  const r = await ask('sara', 'اتصل على العيادة', [() => textTurn('حاضر')]);
  assert.ok(r.log.model[0], 'نداء موديل واحد على الأقلّ');
  const tools = r.log.model[0].tools || [];
  assert.ok(!tools.some((t) => t.name === 'propose_call'));
});

/* ── v-call-agent-r2 (مراجعة الخصم) ── */

test('٣. «سوي لي حجز…»: بعد كرت الاتّصال لا «نفّذ الآن» — نداءان للموديل بالضبط، وسطر الحالة بمفتاح ترجمة', async () => {
  for (const q of ['سوي لي حجز في عيادة ابتسامة ٠٥٠١٢٣٤٥٦٧ الأحد العصر', 'حط لي موعد عند صالون ليلى بكرة ٥ رقمهم 0501234567']) {
    db.clear();
    const r = await ask('omran', q, [
      () => toolTurn('propose_call', { business: 'عيادة ابتسامة', phone: '0501234567', goal: 'حجز الأحد العصر' }),
      () => textTurn('جهّزت كرت الاتّصال، ما اتّصلت بأحد بعد. اضغط «جرّب عليّ» أو «اتّصل فعليًّا»'),
      () => textTurn('(نداء زائد)'),
    ]);
    assert.ok(r.events.some((e) => e.cards && e.cards.kind === 'call'), 'الكرت وصل');
    assert.ok(!r.events.some((e) => e.k === 'stCarry'), 'لا «🛠️ ينفّذ…» بعد الكرت: ' + q);
    assert.equal(r.log.model.length, 2, 'نداءان بالضبط: ' + q);
    const st = r.events.find((e) => typeof e.status === 'string' && /كرت الاتّصال/.test(e.status));
    assert.ok(st, 'سطر الحالة وصل');
    assert.equal(st.k, 'stCall', 'سطر الحالة يُترجم في اللغات الأربع عشرة');
  }
});

test('٤. رقم كتبه المالك في رسالة سابقة يُقبل: المحادثة كلّها مصدر لا آخر رسالة وحدها', async () => {
  db.clear();
  const r = await ask('omran', [
    { role: 'user', content: 'ابي احجز في عيادة ابتسامة، رقمهم 0501234567' },
    { role: 'assistant', content: 'متى يناسبك؟' },
    { role: 'user', content: 'الأحد بعد العصر' },
  ], [
    () => toolTurn('propose_call', { business: 'عيادة ابتسامة', phone: '0501234567', goal: 'حجز الأحد بعد العصر' }),
    () => textTurn('جهّزت كرت الاتّصال، ما اتّصلت بأحد بعد.'),
  ]);
  const card = r.events.find((e) => e.cards && e.cards.kind === 'call');
  assert.ok(card);
  assert.equal(card.cards.call.phoneReady, true, 'الرقم من الرسالة الأولى قُبل');
  assert.equal(card.cards.call.phoneMasked, '+971 50 *** 4567');
  const stored = [...db.entries()].find(([k]) => k.startsWith('call/prop/'));
  assert.equal(JSON.parse(stored[1]).from, 'user');
});

test('٥. نصّ المساعد ليس مصدرًا: رقم في ردّ سابق للمساعد لا يُقبل', async () => {
  db.clear();
  const r = await ask('omran', [
    { role: 'user', content: 'احجز لي في عيادة ابتسامة' },
    { role: 'assistant', content: 'لقيت رقمهم في موقعهم: 0501234567' },
    { role: 'user', content: 'تمام الأحد العصر' },
  ], [
    () => toolTurn('propose_call', { business: 'عيادة ابتسامة', phone: '0501234567', goal: 'حجز الأحد' }),
    () => textTurn('جهّزت كرت التجربة.'),
  ]);
  const card = r.events.find((e) => e.cards && e.cards.kind === 'call');
  assert.ok(card);
  assert.equal(card.cards.call.phoneReady, false, 'الرقم من كلام المساعد لا من المالك');
});
