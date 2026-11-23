'use strict';
// tests/call-link.test.cjs — v-call-link
// العرض: المالك ٢٣ نوفمبر ضغط «اتّصل فعليًّا» فرأى «الاتّصال الفعليّ غير مفعّل بعد»، ولا يريد خطًّا مدفوعًا («لا الي اريده من رصيدي»)؛ ثمّ
//   سأل «كيف من داخل التطبيق بي النت» وقال «ابدأ» على: زرّ «أرسل رابط» ← الواتساب برسالة جاهزة ← الطرف الآخر يفتح الرابط ويكلّم المساعد
//   من متصفّحه ← النتيجة ترجع في المحادثة.
// القرار: call-link (المالك وحده، ٢٠ رابطًا في اليوم) ينشئ رابطًا سرّه ١٢٨ بتًّا؛ الضيف بلا حساب: call-guest-info/session/end (جلستان على
//   الأكثر لكلّ رابط)؛ والكرت يتابع call-link-status ويحفظ المعرّف وحده. لا نقاط تُمسّ.
// الاختبار: المعالج الحقيقيّ api/_lib/call-agent.js فوق KV في الذاكرة، والجزء الحقيقيّ js/app-42 مع app-37 في vm، وسكربت talk.html في vm.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
process.env.AUTH_SECRET = 'call-link-test-secret';
process.env.OWNER_USERNAME = 'omran';
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

/* ── الخادم: KV في الذاكرة (مع المدد)، وخدمة الصوت مزيّفة ── */
const kv = new Map(), ttl = new Map(), users = new Map();
const fail = { set: null };
const KV = {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v, t) => { if (fail.set && fail.set.test(k)) throw new Error('kv down'); kv.set(k, String(v)); ttl.set(k, t); },
  kvSetIfAbsent: async (k, v, t) => { if (kv.has(k)) return false; kv.set(k, String(v)); ttl.set(k, t); return true; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kv.delete(k); },
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; },
  kvExpire: async (k, t) => { ttl.set(k, t); },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvList: async () => [], kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', KV);
mock('api/_lib/auth.js', { getUser: async (u) => (users.has(u) ? structuredClone(users.get(u)) : null), putUser: async () => {}, isBanned: async () => false, verifyToken: () => null });
mock('api/_lib/_vip.js', { isVip: async () => false });
const ca = require(rp('api/_lib/call-agent.js'));

const DAY = 86400000;
const NOON = Date.UTC(2026, 10, 23, 8, 0, 0); // ١٢ ظهرًا بتوقيت دبي
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + DAY })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const ENV = { OPENAI_API_KEY: 'oa-test' };
const voice = { calls: [], mint: 200 };
async function fakeFetch(url, init) {
  voice.calls.push({ u: String(url), headers: init && init.headers, body: init && init.body ? JSON.parse(init.body) : null });
  if (/client_secrets/.test(String(url))) return voice.mint === 200 ? new Response(JSON.stringify({ value: 'ek_guest' }), { status: 200 }) : new Response('{"error":{}}', { status: voice.mint });
  return new Response('{}', { status: 404 });
}
function res() { return { code: 0, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } }; }
async function hit(action, u, body, now, env) {
  const r = res();
  await ca.handler({ method: 'POST', query: { action }, body: Object.assign(u ? { token: token(u) } : {}, body || {}), headers: {} }, r, { kv: KV, env: env || ENV, fetch: fakeFetch, now: now || NOON });
  return r;
}
async function propose(u, phone, extra) {
  const p = await ca.proposeCall(Object.assign({ business: 'سالم', goal: 'متى يناسبه العشاء هذا الأسبوع', phone: phone || '', details: 'العشاء لشخصين' }, extra || {}),
    { owner: u === 'omran', paid: u !== 'omran', user: u, lastUserText: 'اسأل سالم ' + (phone || ''), kv: KV });
  return p;
}
const reset = () => { kv.clear(); ttl.clear(); users.clear(); voice.calls.length = 0; voice.mint = 200; fail.set = null; };
const tOf = (url) => new URL(url).searchParams.get('t');
async function link(phone) {
  const p = await propose('omran', phone === undefined ? '0508989838' : phone);
  const r = await hit('call-link', 'omran', { id: p.event.cards.call.id });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  return { card: p.event.cards.call, linkId: r.body.linkId, url: r.body.url, t: tOf(r.body.url), body: r.body };
}
const recOf = (id) => JSON.parse(kv.get('call/link/' + id));

test('١. الجلسة بطريقها الثالث «link»: الإفصاح كامل كما هو، وفقرة «ليس خطّ هاتف… قد يكون شخصًا»، وصوت المتصفّح لا الهاتف', () => {
  const brief = { callerName: 'omran', business: 'سالم', goal: 'متى يناسبه العشاء', details: '' };
  const s = ca.buildSession(brief, 'link', NOON);
  assert.match(s.instructions, /# Link call\nThis is not a phone line/);
  assert.match(s.instructions, /may simply be a person/);
  assert.match(s.instructions, /clear answer to the goal, call report_outcome with status "booked"/);
  assert.match(s.instructions, /معك مساعد آلي من تطبيق om ai، أتّصل نيابةً عن omran بخصوص متى يناسبه العشاء\. المكالمة تُعالَج آليًّا ولا تُسجَّل\. تسمح لي أكمل؟/);
  assert.doesNotMatch(s.instructions, /# Rehearsal/);
  assert.equal(s.audio.input.format, undefined, 'لا G.711 — صوت المتصفّح');
  assert.deepEqual(s.tools.map((t) => t.name), ['report_outcome', 'end_call']);
  // الطريقان القائمان كما كانا
  assert.match(ca.buildSession(brief, 'webrtc', NOON).instructions, /# Rehearsal/);
  assert.doesNotMatch(ca.buildSession(brief, 'webrtc', NOON).instructions, /# Link call/);
  assert.doesNotMatch(ca.buildSession(brief, 'phone', NOON).instructions, /# Link call|# Rehearsal/);
});

test('٢. call-link للمالك وحده: مشترك بباقة ← owner_only بلا سجلّ؛ بلا حساب ← 401؛ اقتراح غير موجود أو لغيره ← 404', async () => {
  reset();
  users.set('sara', { username: 'sara', plan: 'pro', planUpdatedAt: NOON - DAY, points: 900 });
  const ps = await propose('sara', '0508989838');
  const r1 = await hit('call-link', 'sara', { id: ps.event.cards.call.id });
  assert.equal(r1.code, 403); assert.equal(r1.body.error, 'owner_only');
  assert.equal((await hit('call-link-status', 'sara', { linkId: 'lk' + 'a'.repeat(18) })).body.error, 'owner_only');
  assert.equal((await hit('call-link', '', { id: ps.event.cards.call.id })).code, 401);
  const r2 = await hit('call-link', 'omran', { id: ps.event.cards.call.id }); // اقتراح سارة
  assert.equal(r2.code, 404); assert.equal(r2.body.error, 'proposal_not_found');
  assert.equal((await hit('call-link', 'omran', { id: 'cpnope' })).code, 404);
  assert.equal([...kv.keys()].filter((k) => k.startsWith('call/link/')).length, 0, 'لا رابط كُتب');
  // نصّ الأداة: المالك يعرف نموذجُه الزرّ الثالث، وغيره لا
  const po = await propose('omran', '0508989838');
  assert.match(po.result, /«أرسل رابط»/); assert.match(po.result, /لم يُتّصل بأحد/);
  assert.doesNotMatch(ps.result, /أرسل رابط/);
});

test('٣. المالك: رابط ‎/talk?t=المعرّف.السرّ (١٢٨ بتًّا)، واتساب للموبايل وحده، وسجلّ يوم واحد يحمل الموجز نسخةً — والكرت لا يحمل السرّ', async () => {
  reset();
  const a = await link('0508989838');
  assert.match(a.linkId, /^lk[a-f0-9]{18}$/);
  assert.match(a.url, /^https:\/\/[^/]+\/talk\?t=lk[a-f0-9]{18}\.[a-f0-9]{32}$/);
  assert.equal(a.body.wa, '971508989838');
  assert.equal(a.body.state, 'sent'); assert.equal(a.body.callerName, 'omran');
  assert.deepEqual(Object.keys(a.body).sort(), ['callerName', 'linkId', 'state', 'url', 'wa']);
  const rec = recOf(a.linkId);
  assert.equal(ttl.get('call/link/' + a.linkId), 86400);
  assert.equal(rec.owner, 'omran'); assert.equal(rec.goal, 'متى يناسبه العشاء هذا الأسبوع'); assert.equal(rec.details, 'العشاء لشخصين');
  assert.equal(rec.mints, 0); assert.equal(rec.state, 'sent');
  assert.ok(!JSON.stringify(a.card).includes(a.t.split('.')[1]), 'كرت المحادثة بلا سرّ الرابط');
  // سرّان مختلفان لرابطين
  const b = await link('0508989838');
  assert.notEqual(a.t, b.t);
  // أرضيّ أو بلا رقم: الرابط يُنشأ، والمالك يختار جهة الاتّصال بنفسه
  assert.equal((await link('042345678')).body.wa, '');
  assert.equal((await link('')).body.wa, '');
});

test('٤. إعادة الإرسال: الرابط القائم نفسه بلا عدّ جديد (ولو انتهى الاقتراح)؛ رابط غيري أو منتهٍ ← جديد من الاقتراح؛ والحدّ ٢٠ في اليوم', async () => {
  reset();
  const a = await link('0508989838');
  const dayKey = [...kv.keys()].find((k) => k.startsWith('call/link-day/omran/'));
  assert.equal(kv.get(dayKey), '1');
  kv.delete('call/prop/' + a.card.id); // الاقتراح يعيش ٣٠ دقيقة — الرابط القائم لا يحتاجه
  const again = await hit('call-link', 'omran', { id: a.card.id, linkId: a.linkId });
  assert.equal(again.code, 200); assert.equal(again.body.url, a.url);
  assert.equal(kv.get(dayKey), '1', 'بلا عدّ جديد');
  // منتهٍ والاقتراح انتهى ← «انتهت صلاحيّة البطاقة»
  const rec = recOf(a.linkId); rec.state = 'ended'; kv.set('call/link/' + a.linkId, JSON.stringify(rec));
  assert.equal((await hit('call-link', 'omran', { id: a.card.id, linkId: a.linkId })).body.error, 'proposal_not_found');
  // الحدّ اليوميّ
  reset();
  const p = await propose('omran', '0508989838');
  for (let i = 0; i < ca.LINK_DAY_MAX; i++) assert.equal((await hit('call-link', 'omran', { id: p.event.cards.call.id })).code, 200);
  const over = await hit('call-link', 'omran', { id: p.event.cards.call.id });
  assert.equal(over.code, 429); assert.equal(over.body.error, 'link_limit');
  assert.equal([...kv.keys()].filter((k) => k.startsWith('call/link/')).length, ca.LINK_DAY_MAX);
  assert.equal((await hit('call-link', 'omran', { id: p.event.cards.call.id }, NOON + DAY)).code, 200, 'غدًا عدّاد جديد');
});

test('٥. الضيف بلا حساب: رابط خاطئ أو سرّ خاطئ ← 404؛ الصحيح ← اسم من أرسله وحده، والمالك يرى «فتح الرابط»', async () => {
  reset();
  const a = await link('0508989838');
  assert.equal((await hit('call-guest-info', '', { t: '' })).code, 404);
  assert.equal((await hit('call-guest-info', '', { t: a.linkId + '.' + '0'.repeat(32) })).code, 404, 'سرّ خاطئ');
  assert.equal((await hit('call-guest-info', '', { t: 'lk' + '1'.repeat(18) + '.' + a.t.split('.')[1] })).code, 404, 'معرّف آخر');
  assert.equal((await hit('call-guest-session', '', { t: a.linkId })).code, 404, 'المعرّف وحده (ما يحفظه الكرت) لا يفتح جلسة');
  assert.equal((await hit('call-link-status', 'omran', { linkId: a.linkId })).body.state, 'sent');
  const g = await hit('call-guest-info', '', { t: a.t });
  assert.equal(g.code, 200);
  assert.deepEqual(g.body, { state: 'ready', callerName: 'omran', maxSec: 240 }, 'لا هدف ولا رقم ولا تفاصيل في الردّ');
  const st = await hit('call-link-status', 'omran', { linkId: a.linkId });
  assert.deepEqual(st.body, { state: 'opened', ended: false, durationSec: 0, outcome: null });
  assert.equal(voice.calls.length, 0, 'فتح الصفحة لا يفتح جلسة صوت');
});

test('٦. جلسة الضيف: تُفتح بتعليمات الرابط وموجز المالك، مفتاح مؤقّت ٦٠ ث، وجلستان على الأكثر — والفشل يُحسب ويعيد الحالة', async () => {
  reset();
  const a = await link('0508989838');
  await hit('call-guest-info', '', { t: a.t });
  const s1 = await hit('call-guest-session', '', { t: a.t });
  assert.equal(s1.code, 200);
  assert.deepEqual(s1.body, { clientSecret: 'ek_guest', model: ca.MODEL, maxSec: 240, callerName: 'omran' });
  const sent = voice.calls[0];
  assert.match(sent.u, /realtime\/client_secrets$/);
  assert.equal(sent.headers.Authorization, 'Bearer oa-test');
  assert.deepEqual(sent.body.expires_after, { anchor: 'created_at', seconds: 60 });
  assert.match(sent.body.session.instructions, /# Link call/);
  assert.match(sent.body.session.instructions, /- goal: "متى يناسبه العشاء هذا الأسبوع"/);
  assert.match(sent.body.session.instructions, /- caller \(the call is on behalf of\): "omran"/);
  assert.equal(recOf(a.linkId).state, 'live'); assert.equal(recOf(a.linkId).mints, 1);
  assert.equal((await hit('call-link-status', 'omran', { linkId: a.linkId })).body.state, 'live');
  // ضغطتان معًا (طلب ثانٍ والأوّل ما زال عند خدمة الصوت): القفل قائم ← busy بلا عدّ ولا نداء؛ وبعد انتهاء الأوّل القفل مفكوك
  assert.equal(kv.has('call/link-mint/' + a.linkId), false, 'القفل فُكّ بعد النداء');
  kv.set('call/link-mint/' + a.linkId, '1');
  assert.equal((await hit('call-guest-session', '', { t: a.t })).body.error, 'busy');
  assert.equal(recOf(a.linkId).mints, 1); assert.equal(voice.calls.length, 1);
  kv.delete('call/link-mint/' + a.linkId);
  // المحاولة الثانية تفشل عند خدمة الصوت: تُحسب، والحالة تعود «فتح الرابط»
  voice.mint = 500;
  const s2 = await hit('call-guest-session', '', { t: a.t });
  assert.equal(s2.code, 502); assert.equal(s2.body.error, 'upstream');
  assert.equal(recOf(a.linkId).mints, 2); assert.equal(recOf(a.linkId).state, 'opened');
  assert.equal(kv.has('call/link-mint/' + a.linkId), false, 'محاولة تالية لا تنتظر القفل');
  // رابط استُنفدت جلستاه لا يُعاد إرساله: المالك يأخذ رابطًا جديدًا من الاقتراح
  const fresh = await hit('call-link', 'omran', { id: a.card.id, linkId: a.linkId });
  assert.equal(fresh.code, 200); assert.notEqual(fresh.body.linkId, a.linkId);
  voice.mint = 200;
  const s3 = await hit('call-guest-session', '', { t: a.t });
  assert.equal(s3.code, 410); assert.equal(s3.body.error, 'link_used');
  assert.equal(voice.calls.length, 2, 'لا نداء ثالث لخدمة الصوت');
  assert.equal((await hit('call-guest-info', '', { t: a.t })).body.state, 'done');
  // بلا مفتاح الصوت: لا عدّ ولا قفل
  const b = await link('0508989838');
  const nk = await hit('call-guest-session', '', { t: b.t }, NOON, {});
  assert.equal(nk.code, 500); assert.equal(recOf(b.linkId).mints, 0);
  // عطل التخزين: لا جلسة بلا سجلّ
  fail.set = /^call\/link\//;
  const before = voice.calls.length;
  assert.equal((await hit('call-guest-session', '', { t: b.t })).code, 503);
  assert.equal(voice.calls.length, before);
});

test('٧. النتيجة: تُحفظ حين تُعرف (والجلسة ما زالت جارية)، ثمّ النهاية مرّة — منظَّفة ومقصوصة، والمدّة بحدّ السقف والوقت الفعليّ', async () => {
  reset();
  const a = await link('0508989838');
  assert.equal((await hit('call-guest-end', '', { t: a.t, final: true })).body.error, 'not_started');
  await hit('call-guest-session', '', { t: a.t });
  const dirty = { status: 'hacked', summary: 'قال: الخميس <b>الساعة ٨</b>\n`x`' + 'ا'.repeat(900), confirmed_details: 'الخميس ٨ مساءً', follow_up: '', extra: 'x' };
  const r1 = await hit('call-guest-end', '', { t: a.t, outcome: dirty, final: false }, NOON + 40000);
  assert.equal(r1.code, 200);
  let st = (await hit('call-link-status', 'omran', { linkId: a.linkId }, NOON + 41000)).body;
  assert.equal(st.state, 'live'); assert.equal(st.ended, false);
  assert.equal(st.outcome.status, 'failed', 'حالة خارج القائمة ← failed');
  assert.ok(!/[<>`\n]/.test(st.outcome.summary)); assert.equal(st.outcome.summary.length, 600);
  assert.deepEqual(Object.keys(st.outcome), ['status', 'summary', 'confirmed_details', 'follow_up']);
  // النهاية: نتيجة أحدث تحلّ، والمدّة ≤ الوقت الفعليّ ≤ السقف
  const good = { status: 'booked', summary: 'يناسبه الخميس الساعة ٨ مساءً.', confirmed_details: 'الخميس ٨ مساءً', follow_up: '' };
  const r2 = await hit('call-guest-end', '', { t: a.t, outcome: good, final: true, durationSec: 9999 }, NOON + 65000);
  assert.equal(r2.code, 200);
  st = (await hit('call-link-status', 'omran', { linkId: a.linkId }, NOON + 66000)).body;
  assert.deepEqual(st, { state: 'ended', ended: true, durationSec: 65, outcome: good });
  assert.equal(ttl.get('call/link/' + a.linkId), 7 * 86400, 'بعد النهاية يبقى أسبوعًا ليقرأه المالك');
  // بعد النهاية: لا كتابة فوقها، ولا جلسة جديدة
  assert.equal((await hit('call-guest-end', '', { t: a.t, outcome: { status: 'declined', summary: 'غيّرت رأيي' }, final: true }, NOON + 70000)).code, 200);
  assert.equal((await hit('call-link-status', 'omran', { linkId: a.linkId })).body.outcome.status, 'booked');
  assert.equal((await hit('call-guest-session', '', { t: a.t })).code, 410);
  assert.equal((await hit('call-guest-info', '', { t: a.t })).body.state, 'done');
  // نهاية بلا نتيجة = لا نتيجة (الكرت يقول «بلا نتيجة مسجّلة»)
  const b = await link('0508989838');
  await hit('call-guest-session', '', { t: b.t });
  await hit('call-guest-end', '', { t: b.t, final: true, durationSec: 12 }, NOON + 20000);
  assert.deepEqual((await hit('call-link-status', 'omran', { linkId: b.linkId })).body, { state: 'ended', ended: true, durationSec: 12, outcome: null });
});

test('٨. صفحة أُغلقت بلا نهاية: «جارية» فات سقفها بدقيقة ونصف = انتهت عند المالك والضيف، بما وصل من نتيجة', async () => {
  reset();
  const a = await link('0508989838');
  await hit('call-guest-session', '', { t: a.t });
  await hit('call-guest-end', '', { t: a.t, outcome: { status: 'needs_user', summary: 'يردّ عليك لاحقًا' }, final: false }, NOON + 30000);
  const within = NOON + (240 + 80) * 1000, after = NOON + (240 + 95) * 1000;
  assert.equal((await hit('call-link-status', 'omran', { linkId: a.linkId }, within)).body.state, 'live');
  const st = (await hit('call-link-status', 'omran', { linkId: a.linkId }, after)).body;
  assert.equal(st.ended, true); assert.equal(st.outcome.status, 'needs_user');
  assert.equal((await hit('call-guest-info', '', { t: a.t }, after)).body.state, 'done');
  assert.equal((await hit('call-guest-end', '', { t: a.t, final: true }, after)).body.error, 'not_live');
  // والرابط كلّه ينتهي بعمره: السجلّ مدّته ما بقي من اليوم
  const b = await link('0508989838');
  await hit('call-guest-info', '', { t: b.t }, NOON + 3600000);
  assert.equal(ttl.get('call/link/' + b.linkId), 86400 - 3600);
});

test('٩. الموجّه: إجراءات الرابط في system.js على call-agent نفسه — لا دالّة Vercel جديدة ولا ملفّ جديد في api/_lib', () => {
  const sys = read('api/system.js');
  assert.match(sys, /case 'call-link': case 'call-link-status': case 'call-guest-info': case 'call-guest-session': case 'call-guest-end': return require\('\.\/_lib\/call-agent\.js'\);/);
  assert.ok(!fs.existsSync(path.join(root, 'api/_lib/call-link.js')));
  const v = JSON.parse(read('vercel.json'));
  assert.ok(v.rewrites.some((r) => r.source === '/talk' && r.destination === '/talk.html'));
});

/* ══ العميل: js/app-42 الحقيقيّ مع app-37 في صفحة مصغّرة ══ */
const PART = read('js/app-42-call-agent.js');
const CARDS = read('js/app-37-cards.js');
function dict() {
  const src = read('js/app-03-i18n-data.js'), ar = {};
  const rx = /(callAgent\w+):\s*("(?:\\.|[^"\\])*")/g;
  let m;
  while ((m = rx.exec(src))) if (!(m[1] in ar)) ar[m[1]] = JSON.parse(m[2]);
  return ar;
}
const AR = dict();
function makeDom() {
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.parentNode = null; this.className = ''; this._text = ''; this.attrs = {}; this.listeners = {}; this.disabled = false; this.id = ''; }
    get firstChild() { return this.childNodes[0] || null; }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i < 0) throw new Error('removeChild'); this.childNodes.splice(i, 1); c.parentNode = null; return c; }
    insertBefore(c, ref) { if (!ref) return this.appendChild(c); if (c.parentNode) c.parentNode.removeChild(c); const i = this.childNodes.indexOf(ref); c.parentNode = this; this.childNodes.splice(i, 0, c); return c; }
    replaceChild(nu, old) { const i = this.childNodes.indexOf(old); if (i < 0) throw new Error('replaceChild'); this.childNodes[i] = nu; nu.parentNode = this; old.parentNode = null; return old; }
    get scrollHeight() { return this.childNodes.length * 20; } get clientHeight() { return 60; }
    get scrollTop() { return 0; } set scrollTop(v) { /* لا تمرير هنا */ }
    get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(''); }
    set textContent(v) { this.childNodes = []; this._text = String(v); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    click() { if (this.disabled) return; (this.listeners.click || []).forEach((f) => f({ stopPropagation() {} })); }
    get isConnected() { let n = this; while (n) { if (n.isRoot) return true; n = n.parentNode; } return false; }
    all() { const out = []; const w = (n) => n.childNodes.forEach((c) => { out.push(c); w(c); }); w(this); return out; }
    q(cls) { return this.all().filter((n) => (' ' + n.className + ' ').includes(' ' + cls + ' ')); }
  }
  const head = new El('head'); head.isRoot = true;
  const body = new El('body'); body.isRoot = true;
  return { head, body, documentElement: { classList: { contains: () => false } }, createElement: (t) => new El(t), getElementById: (id) => [...head.all(), ...body.all()].find((n) => n.id === id) || null };
}
const flush = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)); };
const plain = (x) => JSON.parse(JSON.stringify(x));
const LID = 'lk' + 'ab12'.repeat(4) + 'cd', TALK = 'https://omran-ai-builder.vercel.app/talk?t=' + LID + '.' + '9f'.repeat(16);
function sandbox(opts = {}) {
  const clock = { now: 5_000_000, timers: [], seq: 0 };
  const ctx = { console: { warn() {}, error() {}, log() {}, info() {} } };
  ctx.window = ctx;
  ctx.Date = { now: () => clock.now };
  ctx.setTimeout = (fn, ms) => { const t = { id: ++clock.seq, at: clock.now + (Number(ms) || 0), fn, live: true }; clock.timers.push(t); return t; };
  ctx.clearTimeout = (t) => { if (t) t.live = false; };
  ctx.document = makeDom();
  ctx.t = (k) => (k in AR ? AR[k] : k);
  ctx.swallowed = []; ctx.__swallow = (e, where) => { ctx.swallowed.push(where); };
  ctx.authGet = (k) => (k === 'aiapp_auth_token' ? 'tok-owner' : null);
  ctx.omranOwnerUi = () => opts.owner !== false;
  const call = Object.assign({ id: 'cp1', business: 'سالم', phoneMasked: '+971 50 *** 9838', kind: 'mobile', goal: 'متى يناسبه العشاء', maxMin: 4, ptsPerMin: 45, phoneReady: true, callerName: 'omran' }, opts.call || {});
  ctx.state = { currentId: 'p1', projects: [{ id: 'p1', messages: [{ role: 'user', content: 'اسأل سالم' }, { role: 'assistant', content: 'الكرت جاهز.', cards: { kind: 'call', q: call.business, chips: [], items: [], call } }] }] };
  ctx.msgs = () => ctx.state.projects[0].messages;
  ctx.call = () => ctx.msgs()[1].cards.call;
  ctx.getCurrent = () => ctx.state.projects[0];
  ctx.saves = 0; ctx.saveState = () => { ctx.saves++; };
  const host = ctx.document.createElement('div'); host.className = 'msg assistant'; ctx.document.body.appendChild(host);
  let sig = null;
  const sigOf = () => { let n = 0; for (const m of ctx.msgs()) if (m && typeof m.content === 'string') n += m.content.length; return ctx.msgs().length + '|' + n; };
  ctx.renderAll = () => { const s = sigOf(); if (s === sig && host.firstChild) return; sig = s; while (host.firstChild) host.removeChild(host.firstChild); host.appendChild(ctx.omranRenderCards(ctx.msgs()[1].cards)); };
  ctx.card = () => host.firstChild;
  ctx.btn = (cls) => ctx.card().q(cls)[0];
  ctx.fetchLog = [];
  ctx.routes = Object.assign({ 'call-link': () => [200, { linkId: LID, url: TALK, wa: '971508989838', state: 'sent', callerName: 'omran' }], 'call-link-status': () => [200, { state: 'sent', ended: false, durationSec: 0, outcome: null }] }, opts.routes || {});
  ctx.fetch = async (url, init) => {
    const action = (/[?&]action=([\w-]+)/.exec(String(url)) || [])[1];
    const body = init && init.body ? JSON.parse(init.body) : null;
    ctx.fetchLog.push({ action, body, at: clock.now });
    const h = ctx.routes[action];
    if (!h) return new Response('{}', { status: 404 });
    const [status, payload] = await h(body);
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };
  ctx.calls = (a) => ctx.fetchLog.filter((f) => f.action === a);
  ctx.wins = [];
  ctx.open = opts.blocked ? () => null : (u, target) => { const w = { first: u, target, opener: ctx, closed: false, order: ctx.fetchLog.length, location: { replace(x) { w.went = x; } }, close() { w.closed = true; } }; ctx.wins.push(w); return w; };
  ctx.RTCPeerConnection = class {}; ctx.navigator = { mediaDevices: {} };
  ctx.confirm = () => true;
  ctx.addEventListener = () => {};
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  vm.createContext(ctx);
  vm.runInContext(CARDS, ctx, { filename: 'app-37-cards.js' });
  vm.runInContext(PART, ctx, { filename: 'app-42-call-agent.js' });
  ctx.renderAll();
  ctx.advance = async (ms) => {
    const end = clock.now + ms;
    for (;;) {
      await flush();
      const due = clock.timers.filter((t) => t.live && t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      due.live = false; clock.now = Math.max(clock.now, due.at); due.fn();
    }
    clock.now = end; await flush();
  };
  ctx.clock = clock;
  return ctx;
}

test('١٠. الكرت: «🔗 أرسل رابط» للمالك وحده بجانب الزرّين، ولغيره الزرّان كما كانا', () => {
  const c = sandbox();
  assert.deepEqual(c.card().q('omCallBtn').map((b) => b.textContent), ['🎧 جرّب عليّ', '📞 اتّصل فعليًّا', '🔗 أرسل رابط']);
  const u = sandbox({ owner: false });
  assert.deepEqual(u.card().q('omCallBtn').map((b) => b.textContent), ['🎧 جرّب عليّ', '📞 اتّصل فعليًّا']);
  // بلا رقم جاهز: الرابط يبقى (المالك يختار جهة الاتّصال في الواتساب)
  const n = sandbox({ call: { phoneReady: false, phoneMasked: '' } });
  assert.deepEqual(n.card().q('omCallBtn').map((b) => b.textContent), ['🎧 جرّب عليّ', '🔗 أرسل رابط']);
});

test('١١. الضغطة: نافذة تُفتح قبل الطلب ثمّ تُوجَّه للواتساب برسالة فيها الرابط، والكرت «أُرسل الرابط» ويحفظ المعرّف وحده', async () => {
  const c = sandbox();
  c.btn('omCallLink').click();
  assert.equal(c.wins.length, 1); assert.equal(c.wins[0].first, 'about:blank'); assert.equal(c.wins[0].order, 0, 'النافذة قبل أيّ طلب — داخل الضغطة');
  assert.equal(c.btn('omCallTry').disabled, true, 'تدفّق واحد: الأزرار معطّلة أثناء التجهيز');
  await flush();
  assert.deepEqual(plain(c.calls('call-link')[0].body), { token: 'tok-owner', id: 'cp1', linkId: '' });
  const went = c.wins[0].went;
  assert.ok(went.startsWith('https://wa.me/971508989838?text='), went);
  const msg = decodeURIComponent(went.split('?text=')[1]);
  assert.equal(msg, 'السلام عليكم، omran يسألك سؤالًا سريعًا عبر مساعده الآليّ في om ai. افتح الرابط وردّ بصوتك: ' + TALK);
  assert.equal(c.wins[0].opener, null, 'النافذة بلا مرجع لصفحتنا');
  const card = plain(c.call());
  assert.equal(card.transport, 'link'); assert.equal(card.linkId, LID); assert.equal(card.state, 'sent');
  assert.ok(!JSON.stringify(card).includes('9f9f') && !JSON.stringify(card).includes('971508989838'), 'المحفوظ بلا سرّ الرابط ولا الرقم كاملًا');
  assert.ok(c.saves >= 1);
  assert.match(c.card().textContent, /أُرسل الرابط — بانتظار أن يفتحه/);
  // زرّ «افتح واتساب» بالرابط نفسه (إعادة الإرسال من هذه الصفحة)
  const wa = c.btn('omCallWa');
  assert.equal(wa.tagName, 'A'); assert.equal(wa.textContent, 'افتح واتساب'); assert.equal(wa.href, went); assert.equal(wa.target, '_blank'); assert.match(wa.rel, /noopener/);
  // ضغطة ثانية: الرابط القائم نفسه (linkId) لا رابط جديد، والحالة لا تُصفَّر
  c.call().state = 'opened';
  c.btn('omCallLink').click(); await flush();
  assert.equal(c.calls('call-link')[1].body.linkId, LID);
  assert.equal(c.call().state, 'opened');
});

test('١٢. المتابعة: «فتح الرابط» ← «المكالمة جارية» ← النتيجة رسالة واحدة في المحادثة، ويتوقّف السؤال', async () => {
  let step = 0;
  const outcome = { status: 'booked', summary: 'يناسبه الخميس الساعة ٨ مساءً.', confirmed_details: 'الخميس ٨ مساءً', follow_up: '' };
  const c = sandbox({ routes: { 'call-link-status': () => { step++; return [200, step === 1 ? { state: 'opened', ended: false, durationSec: 0, outcome: null } : step === 2 ? { state: 'live', ended: false, durationSec: 0, outcome: null } : { state: 'ended', ended: true, durationSec: 72, outcome }]; } } });
  c.btn('omCallLink').click(); await flush();
  assert.equal(c.calls('call-link-status').length, 0);
  await c.advance(5000);
  assert.deepEqual(plain(c.calls('call-link-status')[0].body), { token: 'tok-owner', linkId: LID });
  assert.match(c.card().textContent, /فتح الرابط/);
  await c.advance(5000);
  assert.match(c.card().textContent, /المكالمة جارية/);
  assert.equal(c.msgs().length, 2);
  await c.advance(5000);
  assert.equal(c.call().state, 'completed'); assert.equal(c.call().durationSec, 72);
  assert.equal(c.msgs().length, 3, 'رسالة نتيجة واحدة');
  assert.equal(c.msgs()[2].role, 'assistant');
  assert.equal(c.msgs()[2].content, '📞 نتيجة المكالمة مع «سالم»: وصل الردّ\nيناسبه الخميس الساعة ٨ مساءً.\nالمؤكَّد: الخميس ٨ مساءً\nالمدّة: 1:12', 'سؤال لشخص: «وصل الردّ» لا «تمّ الحجز»');
  assert.equal(c.card().q('omCallOcHead')[0].textContent, 'وصل الردّ');
  assert.match(c.card().textContent, /يناسبه الخميس الساعة ٨ مساءً\./);
  assert.equal(c.btn('omCallWa'), undefined, 'انتهى الرابط — لا زرّ واتساب');
  const n = c.calls('call-link-status').length;
  await c.advance(10 * 60000);
  assert.equal(c.calls('call-link-status').length, n, 'لا سؤال بعد النهاية');
  assert.equal(c.msgs().length, 3);
});

test('١٣. الإيقاع والنهايات: ٥ ث في أوّل عشر دقائق ثمّ كلّ دقيقة؛ 404 ← «انتهت صلاحيّة الرابط»؛ وتجربة على الكرت توقف متابعة الرابط', async () => {
  const c = sandbox();
  c.btn('omCallLink').click(); await flush();
  await c.advance(10 * 60000);
  const fast = c.calls('call-link-status').length;
  assert.ok(fast >= 110 && fast <= 121, 'كلّ ٥ ث: ' + fast);
  await c.advance(10 * 60000);
  const slow = c.calls('call-link-status').length - fast;
  assert.ok(slow >= 9 && slow <= 11, 'كلّ دقيقة: ' + slow);
  c.routes['call-link-status'] = () => [404, { error: 'link_not_found' }];
  await c.advance(60000);
  assert.equal(c.call().state, 'expired');
  assert.match(c.card().textContent, /انتهت صلاحيّة الرابط/);
  const n = c.calls('call-link-status').length;
  await c.advance(5 * 60000);
  assert.equal(c.calls('call-link-status').length, n);
  assert.equal(c.msgs().length, 2, 'لا رسالة نتيجة لرابط انتهى بلا مكالمة');
  // الكرت انتقل (تجربة أو اتّصال): نتيجة الرابط لا تكتب فوقه
  const d = sandbox({ routes: { 'call-link-status': () => [200, { state: 'ended', ended: true, durationSec: 9, outcome: { status: 'declined', summary: 'x' } }] } });
  d.btn('omCallLink').click(); await flush();
  Object.assign(d.call(), { transport: 'trial', state: 'completed' });
  await d.advance(6000);
  assert.equal(d.call().state, 'completed'); assert.equal(d.call().outcome, null); assert.equal(d.msgs().length, 2);
});

test('١٤. الأعطال: رفض الخادم ← ملاحظته على الكرت والنافذة تُغلق؛ نافذة محجوبة ← زرّ «افتح واتساب» يكفي؛ وبعد إعادة التحميل تُستأنف المتابعة', async () => {
  const c = sandbox({ routes: { 'call-link': () => [429, { error: 'link_limit', max: 20 }] } });
  c.btn('omCallLink').click(); await flush();
  assert.equal(c.wins[0].closed, true); assert.equal(c.wins[0].went, undefined);
  assert.match(c.card().textContent, /وصلت حدّ روابط اليوم — جرّب غدًا\./);
  assert.equal(c.call().transport, undefined); assert.equal(c.btn('omCallWa'), undefined);
  const e = sandbox({ routes: { 'call-link': () => [404, { error: 'proposal_not_found' }] } });
  e.btn('omCallLink').click(); await flush();
  assert.match(e.card().textContent, /انتهت صلاحيّة هذه البطاقة — اطلب المكالمة من جديد\./);
  // ردّ بلا رابط صالح (عنوان ليس http) لا يفتح شيئًا
  const bad = sandbox({ routes: { 'call-link': () => [200, { linkId: LID, url: 'javascript:alert(1)', wa: '', state: 'sent' }] } });
  bad.btn('omCallLink').click(); await flush();
  assert.equal(bad.wins[0].went, undefined); assert.equal(bad.call().transport, undefined);
  // النافذة محجوبة: الكرت يحمل الزرّ
  const b = sandbox({ blocked: true });
  b.btn('omCallLink').click(); await flush();
  assert.equal(b.call().state, 'sent');
  assert.ok(b.btn('omCallWa').href.startsWith('https://wa.me/971508989838?text='));
  // أرضيّ أو بلا رقم: واتساب بلا رقم (المالك يختار جهة الاتّصال)
  const l = sandbox({ routes: { 'call-link': () => [200, { linkId: LID, url: TALK, wa: '', state: 'sent', callerName: 'omran' }] } });
  l.btn('omCallLink').click(); await flush();
  assert.ok(l.wins[0].went.startsWith('https://wa.me/?text='));
  // «التحميل التالي»: كرت محفوظ بانتظار ← المتابعة تُستأنف بلا ضغطة، ولا زرّ واتساب (الرابط لم يُحفظ)
  const r = sandbox({ call: { transport: 'link', linkId: LID, state: 'sent', startedAt: 5_000_000 } });
  assert.equal(r.btn('omCallWa'), undefined);
  await r.advance(2000);
  assert.equal(r.calls('call-link-status').length, 1);
  assert.equal(r.calls('call-link').length, 0);
});

test('١٥. النصوص الثمانية بالـ١٤ لغة بمواضعها، والجزء بلا innerHTML، والحزمة تحمل الزرّ', () => {
  const KEYS = ['callAgentLink', 'callAgentLinkWa', 'callAgentLinkMsg', 'callAgentStSent', 'callAgentStOpened', 'callAgentStExpired', 'callAgentErrLinkLimit', 'callAgentOcAnswered'];
  const ph = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join();
  for (const k of KEYS) assert.ok(AR[k], 'ar:' + k);
  assert.equal(ph(AR.callAgentLinkMsg), '{n},{u}');
  for (const lg of ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml']) {
    const x = { I18N: {}, window: {}, document: { documentElement: {} }, localStorage: { getItem: () => null } };
    x.I18N[lg] = {}; x.window.I18N = x.I18N;
    vm.runInNewContext(read('i18n/' + lg + '.js'), x);
    for (const k of KEYS) { assert.ok(typeof x.I18N[lg][k] === 'string' && x.I18N[lg][k].trim(), lg + ':' + k); assert.equal(ph(x.I18N[lg][k]), ph(AR[k]), lg + ':' + k); }
  }
  const tag = Number((read('js/app-04-i18n-state.js').match(/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]);
  assert.ok(tag >= 808, 'وسم ملفّات اللغات رُفع: ' + tag);
  assert.doesNotMatch(PART, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.ok(read('js/app.bundle.js').includes("btn('omCallBtn omCallLink', tt('callAgentLink')"), 'الحزمة مبنيّة من الجزء');
});

/* ══ الصفحة التي يفتحها الطرف الآخر: سكربت talk.html في vm ══ */
const PAGE = read('talk.html');
const SCRIPT = PAGE.slice(PAGE.lastIndexOf('<script>') + 8, PAGE.lastIndexOf('</script>'));
const T_OK = 'lk' + 'ab12'.repeat(4) + 'cd.' + '9f'.repeat(16);
function page(opts = {}) {
  const clock = { now: 9_000_000, timers: [], seq: 0 };
  const ids = {};
  const mk = (id) => (ids[id] = ids[id] || { id, textContent: '', hidden: id === 'go' || id === 'end' || id === 'timer', className: id === 'card' ? 'card' : '', attrs: {}, l: {}, srcObject: undefined,
    setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }, click() { (this.l.click || []).forEach((f) => f({})); }, play() { ctx.plays++; return Promise.resolve(); } });
  const ctx = { plays: 0, console: { log() {}, warn() {} } };
  ctx.window = ctx;
  ctx.Date = { now: () => clock.now };
  ctx.setTimeout = (fn, ms) => { const t = { id: ++clock.seq, at: clock.now + (Number(ms) || 0), fn, live: true }; clock.timers.push(t); return t; };
  ctx.clearTimeout = (t) => { if (t) t.live = false; };
  ctx.document = { documentElement: { lang: 'ar', dir: 'rtl' }, title: '', getElementById: mk };
  ctx.location = { search: opts.search === undefined ? '?t=' + T_OK : opts.search, hash: opts.hash || '' };
  ctx.fetchLog = [];
  ctx.routes = Object.assign({ 'call-guest-info': () => [200, { state: 'ready', callerName: 'omran', maxSec: 240 }], 'call-guest-session': () => [200, { clientSecret: 'ek_guest', maxSec: 240, callerName: 'omran' }], 'call-guest-end': () => [200, { ok: true }] }, opts.routes || {});
  ctx.fetch = async (url, init) => {
    url = String(url);
    const action = (/[?&]action=([\w-]+)/.exec(url) || [])[1];
    let body = init && init.body;
    if (typeof body === 'string' && body[0] === '{') body = JSON.parse(body);
    ctx.fetchLog.push({ url, action, body, headers: (init && init.headers) || {}, keepalive: !!(init && init.keepalive) });
    if (!action) return new Response('v=0 answer', { status: 201 });
    const [status, payload] = await ctx.routes[action](body);
    return new Response(JSON.stringify(payload), { status });
  };
  ctx.calls = (a) => ctx.fetchLog.filter((f) => f.action === a);
  ctx.track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  ctx.pcs = [];
  ctx.RTCPeerConnection = opts.noRtc ? undefined : class {
    constructor() { ctx.pcs.push(this); this.connectionState = 'new'; this.l = {}; this.closed = false; }
    addTrack() {}
    createDataChannel() { const dc = this.dc = { readyState: 'open', sent: [], l: {}, addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }, send(m) { this.sent.push(JSON.parse(m)); }, close() { this.readyState = 'closed'; }, emit(ev) { (this.l.message || []).forEach((f) => f({ data: JSON.stringify(ev) })); } }; return dc; }
    async createOffer() { return { type: 'offer', sdp: 'v=0 offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { this.connectionState = 'connected'; }
    addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }
    close() { this.closed = true; }
  };
  ctx.navigator = { languages: opts.langs || ['ar-AE'], language: (opts.langs || ['ar-AE'])[0], mediaDevices: { getUserMedia: async () => { if (opts.micDenied) { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; } return { getAudioTracks: () => [ctx.track], getTracks: () => [ctx.track] }; } } };
  ctx.listeners = {}; ctx.addEventListener = (t, f) => { (ctx.listeners[t] = ctx.listeners[t] || []).push(f); };
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx, { filename: 'talk.html' });
  ctx.el = (id) => ids[id];
  ctx.advance = async (ms) => {
    const end = clock.now + ms;
    for (;;) {
      await flush();
      const due = clock.timers.filter((t) => t.live && t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      due.live = false; clock.now = Math.max(clock.now, due.at); due.fn();
    }
    clock.now = end; await flush();
  };
  return ctx;
}

test('١٦. الصفحة: مسارها، noindex وبلا مُحيل، عربيّ/إنجليزيّ بالمفاتيح نفسها، ولا اسم مزوّد في نصّ ظاهر', () => {
  assert.match(PAGE, /<meta name="robots" content="noindex">/);
  assert.match(PAGE, /<meta name="referrer" content="no-referrer">/);
  const dicts = {};
  for (const lg of ['AR', 'EN']) {
    const m = new RegExp('var ' + lg + ' = (\\{[\\s\\S]*?\\n  \\});').exec(SCRIPT);
    dicts[lg] = vm.runInNewContext('(' + m[1].replace(/;$/, '') + ')');
  }
  assert.deepEqual(Object.keys(dicts.AR).sort(), Object.keys(dicts.EN).sort());
  assert.ok(Object.keys(dicts.AR).length >= 20);
  const BANNED = /OpenAI|Open AI|Twilio|GPT|Realtime|Gemini|ChatGPT|Claude|Anthropic|أوبن|تويليو|كلود|جيمناي/i;
  for (const lg of ['AR', 'EN']) for (const k of Object.keys(dicts[lg])) assert.doesNotMatch(dicts[lg][k], BANNED, lg + ':' + k);
  const visible = PAGE.replace(/<script>[\s\S]*<\/script>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<style>[\s\S]*?<\/style>/, '');
  assert.doesNotMatch(visible, BANNED);
  assert.match(visible, /مساعد آليّ وليس شخصًا، ولا يُسجَّل الصوت/);
  assert.doesNotMatch(SCRIPT, /innerHTML|insertAdjacentHTML|document\.write/, 'اسم المرسل يدخل textContent فقط');
  assert.doesNotMatch(SCRIPT, /catch\s*\([^)]*\)\s*\{\s*\}/, 'لا كتمة صامتة');
});

test('١٧. الرحلة كاملة: الاسم ← الزرّ ← المايك ← الجلسة ← المساعد يبدأ ← النتيجة تُرسل حين تُعرف ← النهاية بعد الوداع ← «وصل ردّك»', async () => {
  const p = page();
  await flush();
  assert.deepEqual(plain(p.calls('call-guest-info')[0].body), { t: T_OK });
  assert.equal(p.el('title').textContent, 'omran يسألك سؤالًا سريعًا');
  assert.equal(p.el('go').hidden, false); assert.equal(p.el('go').textContent, '🎙️ ردّ بصوتك');
  assert.equal(p.calls('call-guest-session').length, 0, 'لا جلسة قبل الضغطة');
  p.el('go').click();
  p.el('go').click(); // ضغطتان = جلسة واحدة
  assert.equal(p.plays, 1, 'فتح الصوت داخل الضغطة');
  await flush();
  assert.equal(p.calls('call-guest-session').length, 1);
  const sdp = p.fetchLog.find((f) => !f.action);
  assert.equal(sdp.headers.Authorization, 'Bearer ek_guest'); assert.equal(sdp.body, 'v=0 offer');
  const pc = p.pcs[0];
  assert.equal(p.track.enabled, false, 'المايك مكتوم حتّى الجاهزيّة');
  pc.dc.emit({ type: 'session.created' });
  await flush();
  assert.equal(p.track.enabled, true);
  assert.equal(p.el('status').textContent, 'المساعد معك الآن — تكلّم'); assert.equal(p.el('card').className, 'card live');
  assert.equal(p.el('end').hidden, false); assert.equal(p.el('go').hidden, true);
  await p.advance(1300);
  assert.deepEqual(pc.dc.sent.map((m) => m.type), ['response.create'], 'المساعد يبدأ بجملة التعريف');
  // النتيجة قبل الوداع
  pc.dc.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
  pc.dc.emit({ type: 'response.function_call_arguments.done', name: 'report_outcome', call_id: 'f1', arguments: JSON.stringify({ status: 'booked', summary: 'يناسبه الخميس ٨', confirmed_details: 'الخميس ٨', follow_up: '' }) });
  pc.dc.emit({ type: 'response.done', response: { output: [{ type: 'function_call', name: 'report_outcome', call_id: 'f1', arguments: '{}' }] } }); // مكرّر بالمعرّف نفسه
  await flush();
  const ends = p.calls('call-guest-end');
  assert.equal(ends.length, 1);
  assert.deepEqual(plain(ends[0].body), { t: T_OK, outcome: { status: 'booked', summary: 'يناسبه الخميس ٨', confirmed_details: 'الخميس ٨', follow_up: '' }, final: false });
  assert.equal(ends[0].keepalive, true);
  assert.deepEqual(pc.dc.sent[1].item, { type: 'function_call_output', call_id: 'f1', output: '{"ok":true}' });
  // الإنهاء ينتظر الوداع
  pc.dc.emit({ type: 'response.function_call_arguments.done', name: 'end_call', call_id: 'f2', arguments: '{"reason":"done"}' });
  await p.advance(3000);
  assert.equal(pc.closed, false, 'الوداع ما زال يُسمع');
  pc.dc.emit({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
  await p.advance(500);
  assert.equal(pc.closed, true); assert.equal(p.track.stopped, true);
  const fin = p.calls('call-guest-end')[1];
  assert.equal(fin.body.final, true); assert.equal(fin.body.outcome.status, 'booked'); assert.ok(fin.body.durationSec >= 4 && fin.body.durationSec <= 6);
  assert.equal(p.el('status').textContent, 'وصل ردّك، شكرًا لك. يمكنك إغلاق الصفحة.');
  assert.equal(p.el('go').hidden, true); assert.equal(p.el('end').hidden, true);
  await p.advance(300000);
  assert.equal(p.calls('call-guest-end').length, 2, 'لا إرسال بعد النهاية');
});

test('١٨. الحدود: رابط ناقص بلا أيّ طلب، مستعمَل، مايك مرفوض (محاولة ثانية)، السقف، زرّ الإنهاء بلا نتيجة، والإنجليزيّة', async () => {
  const none = page({ search: '?t=lkshort' });
  await flush();
  assert.equal(none.fetchLog.length, 0); assert.equal(none.el('status').textContent, 'الرابط غير صحيح أو انتهت صلاحيّته.'); assert.equal(none.el('go').hidden, true);
  const used = page({ routes: { 'call-guest-info': () => [200, { state: 'done', callerName: 'omran' }] } });
  await flush();
  assert.equal(used.el('status').textContent, 'هذا الرابط استُعمل أو انتهى. اطلب رابطًا جديدًا ممّن أرسله.'); assert.equal(used.el('go').hidden, true);
  const gone = page({ routes: { 'call-guest-info': () => [404, { error: 'link_not_found' }] } });
  await flush();
  assert.equal(gone.el('status').textContent, 'الرابط غير صحيح أو انتهت صلاحيّته.');
  // مايك مرفوض: لا جلسة تُفتح (لا تُحرق محاولة)، والزرّ يعود
  const mic = page({ micDenied: true });
  await flush(); mic.el('go').click(); await flush();
  assert.equal(mic.calls('call-guest-session').length, 0);
  assert.equal(mic.el('status').textContent, 'تعذّر فتح المايك. اسمح له من إعدادات المتصفّح ثمّ جرّب مرّة ثانية.');
  assert.equal(mic.el('go').hidden, false); assert.equal(mic.el('go').textContent, '🎙️ جرّب مرّة ثانية');
  assert.equal(mic.calls('call-guest-end').length, 0, 'لم تبدأ — لا نهاية تُرسل');
  // الرابط استُهلك عند طلب الجلسة
  const spent = page({ routes: { 'call-guest-session': () => [410, { error: 'link_used' }] } });
  await flush(); spent.el('go').click(); await flush();
  assert.equal(spent.el('status').textContent, 'هذا الرابط استُعمل أو انتهى. اطلب رابطًا جديدًا ممّن أرسله.'); assert.equal(spent.track.stopped, true);
  // متصفّح بلا مكالمات
  const old = page({ noRtc: true });
  await flush(); old.el('go').click(); await flush();
  assert.equal(old.el('status').textContent, 'هذا المتصفّح لا يدعم المكالمات الصوتيّة. افتح الرابط في Chrome أو Safari.');
  // زرّ الإنهاء قبل أيّ نتيجة: نهاية بلا outcome، ونصّ لا يدّعي وصول ردّ
  const cut = page();
  await flush(); cut.el('go').click(); await flush(); cut.pcs[0].dc.emit({ type: 'session.created' }); await flush();
  await cut.advance(10000);
  cut.el('end').click(); await flush();
  const e = cut.calls('call-guest-end');
  assert.equal(e.length, 1); assert.equal(e[0].body.final, true); assert.equal('outcome' in e[0].body, false); assert.equal(e[0].body.durationSec, 10);
  assert.equal(cut.el('status').textContent, 'انتهت المكالمة. يمكنك إغلاق الصفحة.');
  // السقف: تذكير قبل عشرين ثانية ثمّ إغلاق
  const cap = page();
  await flush(); cap.el('go').click(); await flush(); cap.pcs[0].dc.emit({ type: 'session.created' }); await flush();
  await cap.advance(221000);
  assert.ok(cap.pcs[0].dc.sent.some((m) => m.type === 'conversation.item.create' && m.item.role === 'system'));
  assert.equal(cap.pcs[0].closed, false);
  await cap.advance(20000);
  assert.equal(cap.pcs[0].closed, true);
  // إغلاق الصفحة أثناء المكالمة يرسل النهاية
  const hide = page();
  await flush(); hide.el('go').click(); await flush(); hide.pcs[0].dc.emit({ type: 'session.created' }); await flush();
  hide.listeners.pagehide.forEach((f) => f());
  await flush();
  assert.equal(hide.calls('call-guest-end')[0].body.final, true); assert.equal(hide.calls('call-guest-end')[0].keepalive, true);
  // الإنجليزيّة بلغة الجهاز أو ?lang=en، ورابط تبديل اللغة يحفظ الرابط
  for (const en of [page({ langs: ['en-US'] }), page({ search: '?t=' + T_OK + '&lang=en' })]) {
    await flush();
    assert.equal(en.document.documentElement.dir, 'ltr');
    assert.equal(en.el('title').textContent, 'omran has a quick question for you');
    assert.equal(en.el('go').textContent, '🎙️ Answer by voice');
    assert.equal(en.el('langSwitch').attrs.href, '?t=' + T_OK + '&lang=ar');
  }
});
