// tests/owner-inbox.test.cjs — v-owner-inbox (المالك ٢٠ أكتوبر «اريد كلام المستخدمين يكون الخطاء يحول عندي ولا فيه شتيمه ولا متضايق من
// التطبيق كيف اعرف» ← «نعم ابدا»): صندوق المالك. كلام غير المالك (شتيمة · تذمّر من التطبيق · فشل ردّ أمامه) يُحفظ بلاغًا بمقطع ≤٢٠٠ حرف،
// يصل المالك Push مرّة في الساعة لكلّ مستخدم ونوع، يُقرأ من لوحته (المالك وحده)، وإيميل يوميّ مجمّع من جرد البريد. المالك لا يُبلَّغ عن نفسه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'owner-inbox-secret';
process.env.OPENROUTER_API_KEY = 'test-or-key';
process.env.ANTHROPIC_API_KEY = 'test-anth-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'OWNER_USERNAMES', 'MONITOR_KEY', 'CRON_SECRET']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
const kvStub = {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async (k) => (db.has(k) ? db.get(k) : null), kvSetRaw: async (k, v) => { db.set(k, v); }, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async (k, v) => { if (db.has(k)) return false; db.set(k, v); return true; }, kvList: async () => [],
};
stub('api/_lib/kv.js', kvStub);
const pushes = [];
stub('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { pushes.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });
let usageUser = 'vipuser';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }) });
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const IB = require(rp('api/_lib/owner-inbox.js'));
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (evs) => new Response(evs.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'm', usage: { input_tokens: 1, output_tokens: 0 } } });
const textTurn = (t) => sse([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }]);
const fail500 = () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });

async function turn(user, provider, text, script) {
  usageUser = user;
  const save = global.fetch; let i = 0; const events = [];
  global.fetch = async (url, init) => {
    if (!/openrouter\.ai\/api\/v1\/messages|api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 404 });
    return (script[Math.min(i++, script.length - 1)])();
  };
  const req = { method: 'POST', headers: {}, body: { token: token(user), provider, messages: [{ role: 'user', content: text }] } };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write(s) { for (const l of String(s).split('\n')) if (l.startsWith('data: ')) { try { events.push(JSON.parse(l.slice(6))); } catch (e) { /* ليس JSON */ } } return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  await new Promise((r) => setTimeout(r, 30)); // بلاغ الخطأ يُكتب بعد send بلا انتظار
  return { events };
}
const items = () => ((db.get(IB.LIST_KEY) || {}).items || []);

test('١ — المصنّف: شتيمة وتذمّر عن التطبيق يُلتقطان، والكلام العاديّ وتذمّر عن غير التطبيق لا', () => {
  for (const t of ['يا غبي ما تفهم', 'انت كلب', 'حمار انت', 'this app is stupid', 'you are such an idiot', 'طز فيكم', 'what the fuck is this', 'ياحمار']) assert.equal(IB.classify(t), 'insult', t);
  for (const t of ['التطبيق خايس ما يرد', 'انت بطيء وايد', 'ضيعت وقتي معكم', 'الغوا اشتراكي', 'نفس الخطأ كل مرة', 'شو هذا التطبيق ما يرد', 'التطبيق زبالة', 'this app is useless', 'the bot keeps failing', 'متضايق من الردود', 'المساعد ما يفهم علي', 'this site is a scam']) assert.equal(IB.classify(t), 'complaint', t);
  for (const t of ['وش أفضل مطعم في العين؟', 'ابي كود يحسب الضريبة', 'المكيف ما يشتغل كيف أصلحه؟', 'my car is broken, how do I fix it', 'سؤال: ما الفرق بين الخطأ والغلط لغويًّا؟', 'هلا', 'اكتب لي قصة عن كلب وفيّ', '']) assert.equal(IB.classify(t), null, t || '(فارغ)');
  assert.equal(IB.excerpt('أ'.repeat(500)).length, 201, 'مقطع ٢٠٠ حرف + علامة القصّ');
  assert.equal(IB.excerpt('سطر\nثانٍ\t  ثالث'), 'سطر ثانٍ ثالث');
});

test('٢ — المحادثة الحقيقيّة: كلام مستخدم بشتيمة يصير بلاغًا ويدفع للمالك مرّة في الساعة؛ المالك لا يُبلَّغ عن نفسه؛ الكلام العاديّ لا يُحفظ', async () => {
  db.clear(); pushes.length = 0;
  await turn('vipuser', 'gemini', 'التطبيق خايس ما يرد عليّ', [() => textTurn('أعتذر…')]);
  let list = items();
  assert.equal(list.length, 1);
  assert.equal(list[0].user, 'vipuser'); assert.equal(list[0].kind, 'complaint'); assert.equal(list[0].prov, 'gemini'); assert.equal(list[0].via, 'chat');
  assert.equal(list[0].text, 'التطبيق خايس ما يرد عليّ');
  assert.equal(pushes.length, 1); assert.match(pushes[0].title, /متضايق/); assert.ok(pushes[0].body.includes('vipuser') && pushes[0].body.includes('خايس'));
  await turn('vipuser', 'gemini', 'التطبيق خايس ما يرد عليّ', [() => textTurn('…')]);
  assert.equal(items().length, 1, 'نفس النصّ خلال ١٠ دقائق لا يتكرّر');
  await turn('vipuser', 'gemini', 'يا غبي ليش ما تفهم', [() => textTurn('…')]);
  assert.equal(items().length, 2, 'بلاغ ثانٍ يُحفظ'); assert.equal(items()[1].kind, 'insult');
  assert.equal(pushes.length, 2, 'نوع آخر = إشعار'); assert.match(pushes[1].title, /شتيمة/);
  await turn('vipuser', 'gemini', 'انت بطيء وايد اليوم', [() => textTurn('…')]);
  assert.equal(items().length, 3); assert.equal(items()[2].kind, 'complaint');
  assert.equal(pushes.length, 2, 'لا إشعار ثانٍ لنفس المستخدم والنوع خلال ساعة');
  await turn('vipuser', 'gemini', 'وش أفضل مطعم في العين؟', [() => textTurn('…')]);
  assert.equal(items().length, 3, 'الكلام العاديّ لا يُحفظ');
  await turn('omran', 'gemini', 'التطبيق خايس ما يرد', [() => textTurn('…')]);
  assert.equal(items().length, 3, 'المالك لا يُبلَّغ عن كلامه');
  assert.equal(pushes.length, 2);
});

test('٣ — فشل ردّ أمام مستخدم (حدث error من الخادم) = بلاغ error بمقطع رسالته ونصّ الخطأ؛ وفشل أمام المالك لا', async () => {
  db.clear(); pushes.length = 0;
  const r = await turn('vipuser', 'gemini', 'اشرح لي الضريبة', [fail500, fail500, fail500, fail500]);
  assert.ok(r.events.some((e) => e.error), 'الخادم أرسل error للمستخدم: ' + JSON.stringify(r.events.slice(-2)));
  const list = items();
  assert.ok(list.length >= 1, 'بلاغ محفوظ');
  assert.equal(list[0].kind, 'error'); assert.equal(list[0].user, 'vipuser'); assert.equal(list[0].text, 'اشرح لي الضريبة'); assert.ok(list[0].detail && list[0].detail.length > 0, 'نصّ الخطأ محفوظ');
  assert.equal(pushes.filter((p) => /فشل ردّ/.test(p.title)).length, 1, 'إشعار واحد');
  db.clear(); pushes.length = 0;
  await turn('omran', 'gemini', 'اشرح لي الضريبة', [fail500, fail500, fail500, fail500]);
  assert.equal(items().length, 0, 'فشل أمام المالك ليس بلاغًا');
});

test('٤ — المسار: GET للمالك وحده (الأحدث أوّلًا) وPOST clear يمسح؛ غير المالك ٤٠٣', async () => {
  db.clear();
  await IB.record({ user: 'a', prov: 'groq', kind: 'insult', text: 'قديم' }, { kv: kvStub, now: 1000, push: async () => ({}) });
  await IB.record({ user: 'b', prov: 'groq', kind: 'complaint', text: 'جديد' }, { kv: kvStub, now: 2000, push: async () => ({}) });
  const call = async (method, query, body) => { let code = 0, out = null; const res = { setHeader() {}, status(c) { code = c; return this; }, json(o) { out = o; return this; }, end() {} }; await IB({ method, query, body, headers: {} }, res); return { code, out }; };
  assert.equal((await call('GET', {})).code, 403);
  assert.equal((await call('GET', { token: token('vipuser') })).code, 403);
  const ok = await call('GET', { token: token('omran') });
  assert.equal(ok.code, 200); assert.equal(ok.out.count, 2); assert.equal(ok.out.items[0].text, 'جديد', 'الأحدث أوّلًا');
  const cl = await call('POST', {}, { action: 'clear', token: token('omran') });
  assert.equal(cl.code, 200); assert.equal(items().length, 0);
  assert.ok(read('api/system.js').includes("case 'owner-inbox': return require('./_lib/owner-inbox.js');"), 'المسار مسجَّل');
});

test('٥ — الإيميل اليوميّ: ما جدّ منذ آخر إرسال وحده، مرّة؛ بلا جديد لا إيميل؛ ومربوط بجرد البريد', async () => {
  db.clear();
  const mails = [];
  const env = { OWNER_NOTIFY_EMAIL: 'owner@example.com', RESEND_API_KEY: 'k' };
  const sendMail = async (to, subject, html) => { mails.push({ to, subject, html }); return true; };
  await IB.record({ user: 'zayed', prov: 'groq', kind: 'complaint', text: 'ضيعت وقتي معكم' }, { kv: kvStub, now: 5000, push: async () => ({}) });
  await IB.record({ user: 'noor', prov: 'gemini', kind: 'error', text: 'اشرح لي', detail: 'HTTP 500' }, { kv: kvStub, now: 6000, push: async () => ({}) });
  const d1 = await IB.dailyDigest({ kv: kvStub, env, sendMail, now: 10000 });
  assert.equal(d1.sent, true); assert.equal(d1.count, 2); assert.equal(mails.length, 1);
  assert.ok(mails[0].to === 'owner@example.com' && mails[0].subject.includes('2') && mails[0].html.includes('zayed') && mails[0].html.includes('ضيعت وقتي') && mails[0].html.includes('HTTP 500') && mails[0].html.includes('متضايق من التطبيق'), 'الإيميل يحمل البلاغات');
  const d2 = await IB.dailyDigest({ kv: kvStub, env, sendMail, now: 20000 });
  assert.equal(d2.sent, false); assert.equal(mails.length, 1, 'بلا جديد لا إيميل');
  await IB.record({ user: 'zayed', prov: 'groq', kind: 'insult', text: 'كلب' }, { kv: kvStub, now: 30000, push: async () => ({}) });
  const d3 = await IB.dailyDigest({ kv: kvStub, env, sendMail, now: 40000 });
  assert.equal(d3.count, 1, 'الجديد وحده');
  assert.equal((await IB.dailyDigest({ kv: kvStub, env: {}, sendMail, now: 50000 })).reason, 'off', 'بلا إيميل مالك = لا شيء');
  assert.ok(read('api/_lib/email-sweep.js').includes("require('./owner-inbox.js').dailyDigest()"), 'جرد البريد يستدعيه');
});

test('٦ — الربط والواجهة: المحادثة والوكيل يمرّران كلام غير المالك، والزرّ والقائمة في لوحة المالك، والمفاتيح بالـ١٤ لغة والوسم مرفوع', () => {
  const chatSrc = read('api/_lib/chat.js');
  assert.ok(chatSrc.includes("require('./owner-inbox.js').scanTurn({ user: usage.username, prov: reqProv || prov, text: lastUserText })"), 'المحادثة');
  assert.ok(chatSrc.includes("if (obj && obj.error && !__ownerReq) { try { require('./owner-inbox.js').noteFailure("), 'حدث الخطأ');
  assert.ok(read('api/_lib/agent.js').includes("require('./owner-inbox.js').scanTurn({ user: runUser, prov: 'claude', via: 'agent'"), 'الوكيل');
  const ui = read('js/app-05-ui.js');
  assert.ok(ui.includes('<button id="inboxOwnerBtn" type="button" style="display:none;"></button>') && ui.includes("ib.textContent = t('inboxOwnerBtn')") && ui.includes("action=owner-inbox&token=") && ui.includes("fbEsc(t('inboxEmpty'))"), 'زرّ المالك والقائمة');
  assert.ok(ui.includes("fbEsc(it.text||'')") && ui.includes('fbEsc(it.user||'), 'كلّ حقل مهرَّب');
  const keys = ['inboxOwnerBtn', 'inboxEmpty', 'inboxKindInsult', 'inboxKindComplaint', 'inboxKindError'];
  const data = read('js/app-03-i18n-data.js');
  for (const k of keys) assert.ok((data.match(new RegExp(k + ': "')) || []).length && data.split(k + ': "').length - 1 === 2, 'ar+en · ' + k);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) { const src = read('i18n/' + lg + '.js'); for (const k of keys) assert.ok(src.includes(k + ': "'), lg + ' · ' + k); }
  // الرقم يُقرأ من الملفّ لا يُثبَّت (سقّاطة vPinTests). v-plans-real-balance (764): رفعٌ لاحق يضع سببه في الرأس، فالشرط وجود السبب
  // والوسم الحاليّ ≥ رقمه (كان: سببه هو الرأس — فيفشل مع كلّ رفع بعده)
  const st4 = read('js/app-04-i18n-state.js');
  const cur = Number((/'\.js\?v=(\d+)'/.exec(st4) || [])[1]);
  const tag = st4.match(/v-owner-inbox \((\d+)\): خمسة مفاتيح لصندوق المالك/);
  assert.ok(tag && cur >= Number(tag[1]), 'الوسم مرفوع وسببه في التعليق');
  assert.ok(read('js/app.bundle.js').includes('inboxOwnerBtn'), 'الحزمة مبنيّة');
});
