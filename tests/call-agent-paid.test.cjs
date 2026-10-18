'use strict';
// tests/call-agent-paid.test.cjs — v-call-agent-paid
// العرض: المالك ١٨ أكتوبر: «الاتصال الالي مايشتغل لي المستخدمين» — الخادم يردّ owner_only لكلّ أحد غيره، والأداة في أدوات المالك وحده.
// القرار (اختيار المالك): المشترك بباقة محادثة سارية وحده، بالنقاط (٥٠ أرضيّ · ٤٥ موبايل بالدقيقة المبدوءة)، والتجربة بنفس السعر.
//   الحجز = سقف المكالمة قبلها بعد تأكيد بالسعر، والتسوية مرّة واحدة بعدها، والفشل وما لم يُردّ عليه يُردّ كاملًا.
// الاختبار: المعالج الحقيقيّ api/_lib/call-agent.js مع points.js الحقيقيّ وtier.planActive الحقيقيّ — kv وauth وVIP مزيّفة.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
process.env.AUTH_SECRET = 'call-agent-paid-test-secret';
process.env.OWNER_USERNAME = 'omran';
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
const users = new Map();
const vip = new Set();
const fail = { pipe: false, get: null, lost: false }; // points.js يفكّك دوالّ kv عند التحميل — الحقن بعلامة داخل الدالّة نفسها
const KV = {
  kvGetRaw: async (k) => { if (fail.get && fail.get.test(k)) throw new Error('kv down'); return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }, kvList: async () => [],
  kvPipeline: async (cmds) => { if (fail.lost) { cmds.forEach(([op, k, v]) => { if (op === 'INCRBY') kv.set(k, String(Number(kv.get(k) || 0) + Number(v))); else kv.set(k, String(v)); }); throw new Error('reply lost'); } return fail.pipe ? cmds.map(() => null) : cmds.map(([op, k, v]) => { if (op === 'INCRBY') { const x = Number(kv.get(k) || 0) + Number(v); kv.set(k, String(x)); return x; } kv.set(k, String(v)); return 'OK'; }); },
};
mock('api/_lib/kv.js', KV);
mock('api/_lib/auth.js', {
  getUser: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false, verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async (u) => vip.has(u) });
const ca = require(rp('api/_lib/call-agent.js'));

const DAY = 86400000;
const NOON = Date.UTC(2026, 9, 17, 8, 0, 0); // ١٢ ظهرًا بتوقيت دبي — داخل ساعات الاتّصال
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + DAY })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const bal = (u) => Number(kv.get('points:' + u));
function person(u, plan, pts, paidAgoDays) {
  users.set(u, { username: u, plan, planUpdatedAt: plan === 'free' ? 0 : NOON - (paidAgoDays || 1) * DAY, points: pts });
  kv.set('points:' + u, String(pts));
}
const RELAY = { CALL_RELAY_URL: 'https://relay.test', CALL_RELAY_SECRET: 'rs', OPENAI_API_KEY: 'oa-test' };
// خدمة الاتّصال وخدمة الصوت مزيّفتان: حالة كلّ مكالمة من status (افتراضيّ: انتهت بعد ٩٥ ث)
const relay = { calls: [], status: {}, post: 202, mint: 200 };
async function fakeFetch(url, init) {
  const u = String(url);
  relay.calls.push({ u, method: init && init.method });
  if (/client_secrets/.test(u)) return relay.mint === 200 ? new Response(JSON.stringify({ value: 'ek_test' }), { status: 200 }) : new Response('{"error":{}}', { status: relay.mint });
  const m = u.match(/\/call(?:\/(cl[a-f0-9]+))?(\/cancel)?$/);
  if (!m) return new Response('{}', { status: 404 });
  if (!m[1]) return relay.post === 202 ? new Response('{"state":"queued"}', { status: 202 }) : new Response('{"error":"bad"}', { status: relay.post });
  const st = relay.status[m[1]] || { state: 'completed', durationSec: 95, ended: true };
  if (st === 404) return new Response('{"error":"not_found"}', { status: 404 });
  return new Response(JSON.stringify(Object.assign({ transcript: [], outcome: { status: 'booked', summary: 'تمّ' } }, st)), { status: 200 });
}
function res() { return { code: 0, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } }; }
async function hit(action, u, body, now) {
  const r = res();
  await ca.handler({ method: 'POST', query: { action }, body: Object.assign({ token: token(u) }, body || {}), headers: {} }, r, { kv: KV, env: RELAY, fetch: fakeFetch, now: now || NOON });
  return r;
}
async function card(u, opts) {
  const o = opts || {};
  const p = await ca.proposeCall({ business: 'عيادة ابتسامة', goal: 'حجز الأحد', phone: o.phone === '' ? '' : (o.phone || '0501234567') },
    { owner: u === 'omran', paid: u !== 'omran', user: u, lastUserText: o.phone === '' ? 'احجز لي' : (o.phone || '0501234567'), kv: KV });
  return p.event.cards.call;
}
function reset() { kv.clear(); users.clear(); vip.clear(); relay.calls.length = 0; relay.status = {}; relay.post = 202; relay.mint = 200; fail.pipe = false; fail.get = null; }

test('١. بلا باقة سارية (مجّانيّ، منتهية منذ ٣٦ يومًا) = plan_required قبل أيّ نقاط أو خدمة', async () => {
  reset();
  person('free1', 'free', 1000); person('late1', 'pro', 1000, 36);
  for (const u of ['free1', 'late1']) {
    for (const a of ['call-start', 'call-session']) {
      const r = await hit(a, u, { id: 'cpx', confirmed: true });
      assert.equal(r.code, 403); assert.equal(r.body.error, 'plan_required', u + ' ' + a);
    }
    assert.equal(bal(u), 1000);
  }
  assert.equal(relay.calls.length, 0);
  const no = await ca.proposeCall({ business: 'X', goal: 'Y' }, { owner: false, paid: false, kv: KV });
  assert.equal(no.event, null); assert.match(no.result, /للمشتركين بباقة/);
});

test('٢. المشترك: بلا confirmed = 428 بسعر السقف (موبايل ١٨٠) ولا قفل ولا سجلّ ولا خصم ولا مفتاح جلسة', async () => {
  reset(); person('subby', 'pro', 1000);
  const c = await card('subby');
  assert.equal(c.ptsPerMin, 45); assert.equal(c.maxMin, 4);
  for (const a of ['call-start', 'call-session']) {
    const r = await hit(a, 'subby', { id: c.id });
    assert.equal(r.code, 428, a); assert.equal(r.body.error, 'confirm_required'); assert.equal(r.body.cost, 180); assert.equal(r.body.ptsPerMin, 45);
    assert.doesNotMatch(JSON.stringify(r.body), /OpenAI|Twilio|Realtime/i, 'لا اسم مزوّد في نصّ يراه المستخدم');
  }
  assert.equal(bal('subby'), 1000);
  assert.equal(kv.has('call/active/subby'), false);
  assert.equal([...kv.keys()].some((k) => k.startsWith('call/rec/')), false);
  assert.equal(relay.calls.length, 0);
});

test('٣. رصيد أقلّ من السقف = 402 points_insufficient بالمطلوب، ولا شيء آخر', async () => {
  reset(); person('poor', 'basic', 100);
  const c = await card('poor');
  const r = await hit('call-start', 'poor', { id: c.id, confirmed: true });
  assert.equal(r.code, 402); assert.deepEqual(r.body, { error: 'points_insufficient', needed: 180 });
  assert.equal(bal('poor'), 100); assert.equal(kv.has('call/active/poor'), false); assert.equal(relay.calls.length, 0);
});

test('٤. الحجز ثمّ التسوية بالدقيقة المبدوءة مرّة واحدة — استطلاع مكرّر ومتوازٍ ومن جهاز ثانٍ لا يردّ مرّتين', async () => {
  reset(); person('subby', 'pro', 1000);
  const c = await card('subby');
  const s = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  assert.equal(s.code, 200); const callId = s.body.callId;
  assert.equal(bal('subby'), 820, 'حُجز سقف ٤ دقائق موبايل');
  assert.equal(JSON.parse(kv.get('call/rec/' + callId)).held, 180);
  assert.deepEqual(JSON.parse(kv.get('call/open/subby')), [callId]);
  const st = await hit('call-status', 'subby', { callId });
  assert.equal(st.body.ended, true); assert.deepEqual(st.body.billing, { charged: 90, refunded: 90 }, '٩٥ ث = دقيقتان × ٤٥');
  assert.equal(bal('subby'), 910);
  const again = await Promise.all([hit('call-status', 'subby', { callId }), hit('call-status', 'subby', { callId })]);
  for (const a of again) assert.deepEqual(a.body.billing, { charged: 90, refunded: 90 });
  assert.equal(bal('subby'), 910, 'لا ردّ ثانٍ');
  assert.equal(kv.has('call/active/subby'), false, 'القفل فُكّ');
});

test('٥. ما لم يُردّ عليه (٠ ث) ورفض الخدمة الصريح وضياع المكالمة منها = ردّ كامل؛ والخصم لا يتجاوز الحجز', async () => {
  reset(); person('subby', 'pro', 1000);
  let c = await card('subby');
  let s = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  relay.status[s.body.callId] = { state: 'no-answer', durationSec: 0, ended: true };
  assert.deepEqual((await hit('call-status', 'subby', { callId: s.body.callId })).body.billing, { charged: 0, refunded: 180 });
  assert.equal(bal('subby'), 1000);

  relay.post = 400; c = await card('subby');
  s = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  assert.equal(s.code, 502); assert.equal(bal('subby'), 1000); assert.equal(kv.has('call/active/subby'), false);
  relay.post = 202;

  c = await card('subby');
  s = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  relay.status[s.body.callId] = 404;
  const lost = await hit('call-status', 'subby', { callId: s.body.callId });
  assert.equal(lost.body.state, 'failed'); assert.deepEqual(lost.body.billing, { charged: 0, refunded: 180 });
  assert.equal(bal('subby'), 1000);

  c = await card('subby');
  s = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  relay.status[s.body.callId] = { state: 'completed', durationSec: 245, ended: true }; // مدّة Twilio فوق السقف بثوانٍ
  assert.deepEqual((await hit('call-status', 'subby', { callId: s.body.callId })).body.billing, { charged: 180, refunded: 0 });
  assert.equal(bal('subby'), 820);
});

test('٦. حجز مكالمة لم يُستطلع آخرها يُسوّى عند بدء المكالمة التالية', async () => {
  reset(); person('subby', 'max', 1000);
  const c1 = await card('subby');
  const s1 = await hit('call-start', 'subby', { id: c1.id, confirmed: true });
  relay.status[s1.body.callId] = { state: 'completed', durationSec: 30, ended: true };
  kv.delete('call/active/subby'); // انتهت المكالمة وأُغلقت الصفحة قبل آخر استطلاع
  assert.equal(bal('subby'), 820);
  const c2 = await card('subby');
  const s2 = await hit('call-start', 'subby', { id: c2.id, confirmed: true });
  assert.equal(s2.code, 200);
  assert.equal(bal('subby'), 1000 - 45 - 180, 'الأولى سُوّيت بدقيقة (٤٥) والثانية محجوزة');
  assert.deepEqual(JSON.parse(kv.get('call/open/subby')), [s2.body.callId]);
});

test('٧. التجربة بنفس السعر: حجز عند فتح الجلسة، وتسوية call-trial-end بحدّ الوقت الفعليّ مرّة واحدة، وفشل الفتح يردّ', async () => {
  reset(); person('subby', 'pro', 1000);
  const c = await card('subby', { phone: '' }); // بلا رقم = سعر الأرضيّ ٥٠ (تجربة فقط)
  assert.equal(c.ptsPerMin, 50); assert.equal(c.phoneReady, false);
  relay.mint = 500;
  const bad = await hit('call-session', 'subby', { id: c.id, confirmed: true });
  assert.equal(bad.code, 502); assert.equal(bal('subby'), 1000, 'لم تُفتح جلسة = ردّ كامل');
  relay.mint = 200;
  const ok = await hit('call-session', 'subby', { id: c.id, confirmed: true });
  assert.equal(ok.code, 200); assert.ok(/^ct[a-f0-9]+$/.test(ok.body.trialId)); assert.equal(ok.body.maxSec, 240);
  assert.equal(bal('subby'), 800);
  const t = ok.body.trialId;
  const end = await hit('call-trial-end', 'subby', { trialId: t, durationSec: 70 }, NOON + 90000);
  assert.deepEqual(end.body.billing, { charged: 100, refunded: 100 }, '٧٠ ث = دقيقتان × ٥٠');
  assert.equal(bal('subby'), 900);
  assert.deepEqual((await hit('call-trial-end', 'subby', { trialId: t, durationSec: 5 }, NOON + 99000)).body.billing, { charged: 100, refunded: 100 }, 'التسوية الأولى تحكم');
  assert.equal(bal('subby'), 900);
  assert.equal((await hit('call-trial-end', 'other', { trialId: t, durationSec: 0 })).code, 404, 'تجربة غيره لا تُسوّى');

  const ok2 = await hit('call-session', 'subby', { id: c.id, confirmed: true });
  const lie = await hit('call-trial-end', 'subby', { trialId: ok2.body.trialId, durationSec: 999 }, NOON + 30000);
  assert.deepEqual(lie.body.billing, { charged: 50, refunded: 150 }, 'مدّة المتصفّح بحدّ الوقت منذ فتح الجلسة (٣٠ ث = دقيقة)');
  assert.equal(bal('subby'), 850);
});

test('٨. المالك بلا تأكيد ولا نقاط ولا حجز؛ وVIP بباقة لا يُخصم منه (سياسة spendPoints للـVIP)', async () => {
  reset(); person('subvip', 'pro', 500); vip.add('subvip');
  const co = await card('omran');
  const so = await hit('call-start', 'omran', { id: co.id });
  assert.equal(so.code, 200); assert.equal(JSON.parse(kv.get('call/rec/' + so.body.callId)).held, 0);
  assert.equal(kv.has('points:omran'), false); assert.equal(kv.has('call/open/omran'), false);
  const tr = await hit('call-session', 'omran', { id: co.id });
  assert.equal(tr.code, 200); assert.equal(tr.body.trialId, undefined, 'لا حجز للمالك فلا تسوية');

  const cv = await card('subvip');
  const sv = await hit('call-start', 'subvip', { id: cv.id, confirmed: true });
  assert.equal(sv.code, 200); assert.equal(bal('subvip'), 500);
  assert.deepEqual((await hit('call-status', 'subvip', { callId: sv.body.callId })).body.billing, { charged: 0, refunded: 0 });
  assert.equal(bal('subvip'), 500, 'الردّ لا يهدي VIP نقاطًا');
});

test('٩. ردّ فشل ومصيره مجهول لا يُضيّع ولا يُضاعف: المطالبة تُحذف ويعيدها الاستطلاع التالي', async () => {
  reset(); person('subby', 'pro', 1000);
  const c = await card('subby');
  const s = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  fail.pipe = true; // القيد لم يقع
  const first = await hit('call-status', 'subby', { callId: s.body.callId });
  assert.equal(first.body.billing, null, 'لم تُحسم بعد');
  assert.equal(kv.has('call/settled/' + s.body.callId), false, 'المطالبة حُذفت');
  assert.equal(bal('subby'), 820);
  fail.pipe = false;
  const second = await hit('call-status', 'subby', { callId: s.body.callId });
  assert.deepEqual(second.body.billing, { charged: 90, refunded: 90 });
  assert.equal(bal('subby'), 910);
});

const TID = (n) => 'ct' + String(n).repeat(18).slice(0, 18);

test('١٠. التجربة بمعرّف العميل: نهاية سبقت طلبها تختمه فلا يُحجز بعدها؛ وتجربة حيّة واحدة لكلّ مستخدم حتّى تصل نهايتها', async () => {
  reset(); person('subby', 'pro', 1000);
  const c = await card('subby', { phone: '' });
  const early = await hit('call-trial-end', 'subby', { trialId: TID('a'), durationSec: 0 });
  assert.deepEqual(early.body.billing, { charged: 0, refunded: 0 });
  const late = await hit('call-session', 'subby', { id: c.id, confirmed: true, trialId: TID('a') });
  assert.equal(late.code, 409); assert.equal(late.body.error, 'trial_exists');
  assert.equal(bal('subby'), 1000, 'لا حجز لتجربة خُتمت نهايتها');
  assert.equal(relay.calls.length, 0, 'ولا مفتاح جلسة');

  const one = await hit('call-session', 'subby', { id: c.id, confirmed: true, trialId: TID('b') });
  assert.equal(one.code, 200); assert.equal(one.body.trialId, TID('b'), 'معرّف العميل نفسه');
  const two = await hit('call-session', 'subby', { id: c.id, confirmed: true, trialId: TID('c') });
  assert.equal(two.code, 409); assert.equal(two.body.error, 'busy', 'تجربة حيّة واحدة');
  assert.equal(bal('subby'), 800);
  await hit('call-trial-end', 'subby', { trialId: TID('b'), durationSec: 30 }, NOON + 40000);
  assert.equal(bal('subby'), 950);
  const three = await hit('call-session', 'subby', { id: c.id, confirmed: true, trialId: TID('c') });
  assert.equal(three.code, 200, 'بعد النهاية تُفتح التالية');
  const junk = await hit('call-session', 'subby', { id: c.id, confirmed: true, trialId: 'x' });
  assert.equal(junk.code, 409, 'معرّف بغير صيغته يولّده الخادم — والتجربة الحيّة ما زالت قائمة');
});

test('١١. فشل فتح الجلسة يردّ الحجز ويعيد المعرّف ويفكّ التجربة؛ ونهاية تصل بعده لا تخصم', async () => {
  reset(); person('subby', 'pro', 1000);
  const c = await card('subby', { phone: '' });
  relay.mint = 503;
  const bad = await hit('call-session', 'subby', { id: c.id, confirmed: true, trialId: TID('d') });
  assert.equal(bad.code, 502); assert.equal(bad.body.trialId, TID('d'));
  assert.equal(bal('subby'), 1000);
  const end = await hit('call-trial-end', 'subby', { trialId: TID('d'), durationSec: 0 });
  assert.deepEqual(end.body.billing, { charged: 0, refunded: 200 }, 'التسوية الأولى (ردّ كامل) تحكم');
  assert.equal(bal('subby'), 1000);
  relay.mint = 200;
  assert.equal((await hit('call-session', 'subby', { id: c.id, confirmed: true, trialId: TID('e') })).code, 200, 'لا قفل تجربة عالق');
});

test('١٢. عطل KV عابر = 503 يُعاد لا 404 يُنهي: المتابعة ونهاية التجربة', async () => {
  reset(); person('subby', 'pro', 1000);
  const c = await card('subby');
  const s = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  fail.get = /^call\/rec\//;
  const st = await hit('call-status', 'subby', { callId: s.body.callId });
  assert.equal(st.code, 503);
  fail.get = /^call\/trial\//;
  assert.equal((await hit('call-trial-end', 'subby', { trialId: TID('f'), durationSec: 0 })).code, 503);
  fail.get = null;
  assert.deepEqual((await hit('call-status', 'subby', { callId: s.body.callId })).body.billing, { charged: 90, refunded: 90 });
});

test('١٣. ردّ سابق يصل قبل فحص الرصيد: حجز مكالمة لم يُستطلع آخرها لا يمنع التالية بـ402', async () => {
  reset(); person('subby', 'pro', 250);
  const c1 = await card('subby');
  const s1 = await hit('call-start', 'subby', { id: c1.id, confirmed: true });
  assert.equal(bal('subby'), 70);
  relay.status[s1.body.callId] = { state: 'completed', durationSec: 30, ended: true };
  kv.delete('call/active/subby');
  const c2 = await card('subby');
  const s2 = await hit('call-start', 'subby', { id: c2.id, confirmed: true });
  assert.equal(s2.code, 200, 'الأولى سُوّيت (+١٣٥) قبل فحص الرصيد');
  assert.equal(bal('subby'), 250 - 45 - 180);
});

test('١٤. مكالمة تبدأ الآن (تملك القفل) لا تُقرأ ضائعة: بدء ثانٍ متزامن = 409 بلا لمس حجز الأولى', async () => {
  reset(); person('subby', 'pro', 1000);
  const c = await card('subby');
  const s1 = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  relay.status[s1.body.callId] = 404; // الخدمة لم تسجّلها بعد
  const s2 = await hit('call-start', 'subby', { id: (await card('subby')).id, confirmed: true });
  assert.equal(s2.code, 409);
  assert.equal(bal('subby'), 820, 'حجز الأولى باقٍ');
  assert.equal(kv.has('call/settled/' + s1.body.callId), false);
});

test('١٥. إعادة تشغيل الخدمة أثناء المكالمة = فشل من جهتنا ← ردّ كامل؛ ورفض الخدمة مع تعذّر الردّ يُبقي السجلّ فيُسوّى لاحقًا', async () => {
  reset(); person('subby', 'pro', 1000);
  let c = await card('subby');
  let s = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  relay.status[s.body.callId] = { state: 'failed', durationSec: 200, ended: true, endReason: 'relay_restart' };
  assert.deepEqual((await hit('call-status', 'subby', { callId: s.body.callId })).body.billing, { charged: 0, refunded: 180 });
  assert.equal(bal('subby'), 1000);

  relay.post = 400; fail.pipe = true;
  c = await card('subby');
  s = await hit('call-start', 'subby', { id: c.id, confirmed: true });
  assert.equal(s.code, 502);
  assert.equal(bal('subby'), 820, 'الردّ لم يقع');
  const kept = [...kv.keys()].filter((k) => k.startsWith('call/rec/'));
  assert.equal(kept.length, 2, 'السجلّ باقٍ ليُعاد');
  relay.post = 202; fail.pipe = false;
  const refused = JSON.parse(kv.get('call/open/subby')).slice(-1)[0];
  relay.status[refused] = 404;
  const s3 = await hit('call-start', 'subby', { id: (await card('subby')).id, confirmed: true });
  assert.equal(s3.code, 200);
  assert.equal(bal('subby'), 1000 - 180, 'المرفوضة رُدّت كاملة قبل حجز الجديدة');
});

test('١٦. ردّ وقع وضاع جوابه والقراءة بعده متعذّرة: المطالبة لا تُحذف — فلا ردّ ثانٍ، والختم يحكم بعدها', async () => {
  reset(); person('subby', 'pro', 1000);
  const P = require(rp('api/_lib/points.js'));
  const tr = { id: TID('9'), user: 'subby', kind: 'landline', held: 200 };
  kv.set('points:subby', '800');
  fail.lost = true; fail.get = /^call\/settled\//;
  assert.equal(await ca.settleHold(KV, P, tr, 0, NOON), null, 'المصير مجهول');
  fail.lost = false; fail.get = null;
  assert.equal(bal('subby'), 1000, 'القيد وقع');
  assert.equal(kv.get('call/settled/' + tr.id), 'd:0', 'وختمه معه');
  assert.deepEqual(await ca.settleHold(KV, P, tr, 0, NOON + 300000), { charged: 0, refunded: 200 });
  assert.equal(bal('subby'), 1000, 'لا ردّ ثانٍ ولو بعد مدّة المطالبة القديمة');
  // ردّ ثبت أنّه لم يقع (القيد أجاب null): المطالبة تُحذف فيعيده الاستطلاع التالي
  const t2 = { id: TID('8'), user: 'subby', kind: 'landline', held: 200 };
  kv.set('points:subby', '800');
  fail.pipe = true;
  assert.equal(await ca.settleHold(KV, P, t2, 0, NOON), null);
  assert.equal(kv.has('call/settled/' + t2.id), false);
  fail.pipe = false;
  assert.deepEqual(await ca.settleHold(KV, P, t2, 0, NOON + 1000), { charged: 0, refunded: 200 });
  assert.equal(bal('subby'), 1000);
});
