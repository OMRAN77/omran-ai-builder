// tests/chat-mail.test.cjs — v-chat-mail (المالك ٤ نوفمبر «اريد الدردشه الي في التطبيق تتحول كله على الايميل لكي اطور التطبيق من المستخدمين»):
// كلّ دور لغير المالك في المحادثة الرئيسيّة (كلامه + ردّ التطبيق + الخطأ) يُحفظ في قائمة يومه، ويصل المالك إيميل يوميّ بمحادثات الأمس كاملة
// مجمّعة بالمستخدم من جرد البريد. بلا صور ولا مفاتيح ولا أرقام بطاقات. المالك لا يُحفظ كلامه. بلا إيميل مالك أو مفتاح Resend لا يُحفظ شيء.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'chat-mail-secret';
process.env.OPENROUTER_API_KEY = 'test-or-key';
process.env.ANTHROPIC_API_KEY = 'test-anth-key';
process.env.OWNER_NOTIFY_EMAIL = 'owner@example.com';
process.env.RESEND_API_KEY = 'test-resend';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'OWNER_USERNAMES', 'OWNER_USERNAME', 'MONITOR_KEY', 'CRON_SECRET', 'CHAT_MAIL']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };

// KV مزيّف بالقوائم (RPUSH/LTRIM/LRANGE) كما يفعل Upstash
const db = new Map();
function cmd(c) {
  const [op, k] = c;
  if (op === 'RPUSH') { const l = db.get(k) || []; l.push(c[2]); db.set(k, l); return l.length; }
  if (op === 'LTRIM') { const l = db.get(k) || []; db.set(k, l.slice(Number(c[2]), Number(c[3]) + 1)); return 'OK'; }
  if (op === 'LRANGE') { const l = db.get(k); return Array.isArray(l) ? l.slice() : []; }
  if (op === 'EXPIRE') return 1;
  if (op === 'INCR') { const n = (Number(db.get(k)) || 0) + 1; db.set(k, String(n)); return n; }
  if (op === 'GET') { const v = db.get(k); return v == null || Array.isArray(v) ? null : v; }
  if (op === 'DEL') return db.delete(k) ? 1 : 0;
  throw new Error('op ' + op);
}
const kvStub = {
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {},
  kvIncr: async () => 1, kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
  kvPipeline: async (cmds) => cmds.map(cmd),
};
stub('api/_lib/kv.js', kvStub);
stub('api/_lib/_owner-alert.js', { pushToOwners: async () => ({ sent: 1 }), alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });
let usageUser = 'vipuser';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }) });
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
stub('api/_lib/owner-inbox.js', { scanTurn: async () => ({ kind: null }), noteFailure: async () => ({ kind: 'error' }) });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const CM = require(rp('api/_lib/chat-mail.js'));
const chat = require(rp('api/_lib/chat.js'));
const pending = [];
CM._seam.waitUntil = (p) => { pending.push(p); };

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (evs) => new Response(evs.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'm', usage: { input_tokens: 1, output_tokens: 0 } } });
const textTurn = (t) => sse([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }, { type: 'message_stop' }]);
const fail500 = () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });

async function turn(user, text, script, extra) {
  usageUser = user;
  const save = global.fetch; let i = 0;
  global.fetch = async (url) => {
    if (!/openrouter\.ai\/api\/v1\/messages|api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 404 });
    return (script[Math.min(i++, script.length - 1)])();
  };
  const req = { method: 'POST', headers: { 'x-vercel-ip-country': 'ae' }, body: Object.assign({ token: user ? token(user) : undefined, provider: 'gemini', messages: [{ role: 'user', content: text }] }, extra || {}) };
  let ends = 0;
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() { ends++; }, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  await Promise.all(pending.splice(0));
  return { ends };
}
const dayItems = (ms) => (db.get(CM.DAY_PREFIX + CM.uaeDay(ms == null ? Date.now() : ms)) || []).map((s) => JSON.parse(s));

test('١ — التعقيم: المفاتيح وأرقام البطاقات تُحذف، والأرقام العاديّة تبقى، والنصّ مقصوص', () => {
  const s = CM.scrub('مفتاحي sk-ant-api03-' + 'a'.repeat(40) + ' وتوكن ghp_' + 'b'.repeat(36) + ' وsk-or-v1-' + 'c'.repeat(64) + ' وبطاقتي 4111 1111 1111 1111 ورقمي 0501234567 والطلب 12345678901234', 5000);
  assert.ok(!/sk-ant-api03-a|ghp_b|sk-or-v1-c|4111 1111/.test(s), s);
  assert.ok(s.includes('[رقم بطاقة محذوف]'), 'بطاقة صالحة (لُون) تُحذف');
  assert.ok(s.includes('0501234567') && s.includes('12345678901234'), 'الأرقام التي ليست بطاقات تبقى');
  assert.equal(CM.scrub('أ'.repeat(3000), 1500).length, 1501, 'مقصوص + علامة القصّ');
  assert.equal(CM.scrub('سطر\n\n\n\nثانٍ\u0007', 100), 'سطر\n\nثانٍ');
});

test('٢ — الحفظ: دور المستخدم يُحفظ بحقوله؛ المالك لا؛ الزائر باسم مستعار؛ بلا إيميل مالك أو CHAT_MAIL=off لا شيء؛ وسقف اليوم يُعدّ', async () => {
  db.clear();
  const env = { OWNER_NOTIFY_EMAIL: 'o@x.com', RESEND_API_KEY: 'k' };
  const now = Date.UTC(2026, 10, 3, 10, 0);
  assert.equal(await CM.noteTurn({ user: 'zayed', prov: 'gemini', text: 'كيف أسوي فيديو؟', reply: 'اضغط على…', image: true, country: 'ae' }, { env, kv: kvStub, now }), 'saved');
  assert.equal(await CM.noteTurn({ user: 'Omran', text: 'تجربة' }, { env, kv: kvStub, now }), 'owner');
  assert.equal(await CM.noteTurn({ guestId: 'g-123456', text: 'هلا' }, { env, kv: kvStub, now }), 'saved');
  assert.equal(await CM.noteTurn({ user: 'zayed', text: 'x' }, { env: {}, kv: kvStub, now }), 'off');
  assert.equal(await CM.noteTurn({ user: 'zayed', text: 'x' }, { env: Object.assign({ CHAT_MAIL: 'off' }, env), kv: kvStub, now }), 'off');
  assert.equal(await CM.noteTurn({ text: 'بلا هويّة' }, { env, kv: kvStub, now }), 'skip');
  const l = dayItems(now);
  assert.equal(l.length, 2);
  assert.deepEqual([l[0].u, l[0].p, l[0].q, l[0].a, l[0].i, l[0].c], ['zayed', 'gemini', 'كيف أسوي فيديو؟', 'اضغط على…', 1, 'AE']);
  assert.ok(/^زائر-[0-9a-f]{6}$/.test(l[1].u) && l[1].g === 1 && !JSON.stringify(l[1]).includes('g-123456'), 'الزائر بلا معرّفه');
  db.set(CM.DAY_PREFIX + CM.uaeDay(now), new Array(CM.DAY_MAX).fill('{"u":"a","q":"b","t":1}'));
  assert.equal(await CM.noteTurn({ user: 'zayed', text: 'بعد السقف' }, { env, kv: kvStub, now }), 'capped');
  assert.equal(dayItems(now).length, CM.DAY_MAX, 'لا يتجاوز السقف');
  assert.equal(db.get(CM.DROP_PREFIX + CM.uaeDay(now)), '1', 'الزائد يُعدّ');
});

test('٣ — المحادثة الحقيقيّة (chat.js): كلام المستخدم وردّ التطبيق يُحفظان عند نهاية الردّ؛ المالك لا؛ والفشل يُحفظ بخطئه', async () => {
  db.clear();
  const r = await turn('vipuser', 'وش أفضل مطعم في العين؟', [() => textTurn('أنصحك بمطعم الريف.')]);
  assert.ok(r.ends >= 1, 'الردّ انتهى');
  let l = dayItems();
  assert.equal(l.length, 1, 'دور واحد: ' + JSON.stringify(l));
  assert.equal(l[0].u, 'vipuser'); assert.equal(l[0].q, 'وش أفضل مطعم في العين؟'); assert.equal(l[0].p, 'gemini'); assert.equal(l[0].c, 'AE');
  assert.ok(l[0].a && l[0].a.includes('أنصحك بمطعم الريف'), 'ردّ التطبيق محفوظ: ' + l[0].a);
  await turn('omran', 'تجربة المالك', [() => textTurn('تمام')]);
  assert.equal(dayItems().length, 1, 'المالك لا يُحفظ');
  await turn('vipuser', 'اشرح لي الضريبة', [fail500, fail500, fail500, fail500]);
  l = dayItems();
  assert.equal(l.length, 2);
  assert.equal(l[1].q, 'اشرح لي الضريبة'); assert.ok(l[1].e && l[1].e.length > 0, 'الخطأ الذي رآه محفوظ');
  await turn('vipuser', 'توكني ghp_' + 'z'.repeat(36), [() => textTurn('لا تشارك التوكن')]);
  assert.ok(!JSON.stringify(dayItems()).includes('ghp_zzz'), 'السرّ لا يُحفظ');
});

test('٤ — الإيميل اليوميّ: محادثات الأمس كاملة مجمّعة بالمستخدم ومهرَّبة، تُحذف بعد الإرسال، اليوم الجاري ينتظر، والفشل يبقيها', async () => {
  db.clear();
  const env = { OWNER_NOTIFY_EMAIL: 'o@x.com', RESEND_API_KEY: 'k' };
  const now = Date.UTC(2026, 10, 4, 3, 23); // ٧:٢٣ الإمارات — موعد الجرد
  const y = now - 86400000;
  await CM.noteTurn({ user: 'zayed', prov: 'gemini', text: 'سوّ لي صورة <script>alert(1)</script>', reply: 'تفضّل' }, { env, kv: kvStub, now: y });
  await CM.noteTurn({ user: 'noor', prov: 'openai', text: 'ما يفتح الفيديو', error: 'HTTP 500' }, { env, kv: kvStub, now: y + 60000 });
  await CM.noteTurn({ user: 'zayed', prov: 'gemini', text: 'شكرًا', reply: 'العفو' }, { env, kv: kvStub, now: y + 120000 });
  await CM.noteTurn({ user: 'today', text: 'اليوم' }, { env, kv: kvStub, now });
  const mails = [];
  let ok = false;
  const sendMail = async (to, subject, html) => { mails.push({ to, subject, html }); return ok; };
  const fail = await CM.dailyDigest({ env, kv: kvStub, now, sendMail });
  assert.equal(fail.sent, 0); assert.equal(dayItems(y).length, 3, 'فشل الإرسال يبقي القائمة');
  ok = true; mails.length = 0;
  const d = await CM.dailyDigest({ env, kv: kvStub, now, sendMail });
  assert.equal(d.sent, 1); assert.equal(mails.length, 1);
  const m = mails[0];
  assert.equal(m.to, 'o@x.com');
  assert.ok(m.subject.includes(CM.uaeDay(y)) && m.subject.includes('الرسائل: 3') && m.subject.includes('المستخدمون: 2'), m.subject);
  assert.ok(m.html.includes('zayed') && m.html.includes('noor') && m.html.includes('تفضّل') && m.html.includes('HTTP 500') && m.html.includes('شكرًا'), 'كلّ المحادثة');
  assert.ok(!m.html.includes('<script>') && m.html.includes('&lt;script&gt;'), 'مهرَّب');
  assert.ok(m.html.indexOf('شكرًا') < m.html.indexOf('noor', m.html.indexOf('<h3')), 'مجمّعة بالمستخدم: دورا zayed معًا قبل noor');
  assert.ok(!m.html.includes('اليوم</div>') && dayItems(now).length === 1, 'اليوم الجاري ينتظر الغد');
  assert.equal(dayItems(y).length, 0, 'حُذفت بعد الإرسال');
  assert.equal((await CM.dailyDigest({ env, kv: kvStub, now, sendMail })).reason, 'empty', 'لا تكرار');
  assert.equal((await CM.dailyDigest({ env: {}, kv: kvStub, now, sendMail })).reason, 'off');
});

test('٥ — الربط: chat.js يجمع الردّ ويحفظ عند res.end، وجرد البريد يرسل، وسياسة الخصوصيّة تذكرها بالعربيّة والإنجليزيّة', () => {
  const chatSrc = read('api/_lib/chat.js');
  assert.ok(chatSrc.includes("if (!__ownerReq && usage) require('./chat-mail.js').noteTurnLater({ user: usage.username, guestId,"), 'الحفظ عند نهاية الردّ');
  assert.ok(chatSrc.includes("if (typeof obj.patch === 'string') __mailReply = obj.patch.slice(0, 4000); else if (typeof obj.delta === 'string'"), 'جمع الردّ');
  assert.ok(read('api/_lib/email-sweep.js').includes("require('./chat-mail.js').dailyDigest()"), 'جرد البريد');
  const pv = read('privacy.html');
  assert.ok(pv.includes('نراجع نصوص المحادثات') && pv.includes('we review chat transcripts'), 'الإفصاح للمستخدم');
});

test('٦ — مواصفات ملصوقة ٤ ك.ب (luki، ٤ نوفمبر) تُحفظ كاملة لا مقطع ٢٠٠ حرف (v-inbox-own-words)', async () => {
  db.clear();
  const env = { OWNER_NOTIFY_EMAIL: 'o@x.com', RESEND_API_KEY: 'k' };
  const now = Date.UTC(2026, 10, 4, 18, 56);
  const spec = 'Build a complete app called GameTracker. ' + 'Feature line for the tracker screen. '.repeat(110) + 'END-OF-SPEC';
  assert.ok(spec.length > 4000);
  await CM.noteTurn({ user: 'luki', prov: 'openai', text: '📄 Pasted code · 4 KB:\n```\n' + spec + '\n```' }, { env, kv: kvStub, now });
  assert.ok(dayItems(now)[0].q.includes('END-OF-SPEC'), 'آخر المواصفات وصل');
  assert.ok(CM.USER_MAX >= 6000);
});
