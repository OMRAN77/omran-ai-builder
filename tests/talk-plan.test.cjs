'use strict';
// v-talk-room-plan: خطّة «غرفة الربع» — ساعة مجّانيّة في اليوم (يوم دبي) وأربعة، أو اشتراك ٣٧ نقطة لثلاثين يومًا بتجديد كسول.
// مخزن في الذاكرة ونقاط مزيّفة (لا kv.js ولا points.js الحقيقيّان)، والمالك/VIP بلا أيّ أمر زائد.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { act } = require('../api/_lib/talk-room.js');
const plan = require('../api/_lib/talk-plan.js');

function memoryKV() {
  const data = new Map(), ttl = new Map(), log = [];
  let failSet = null;
  const set = (k, v, t) => { data.set(k, String(v)); if (t) ttl.set(k, Number(t)); else ttl.delete(k); };
  const run = ([cmd, key, ...a]) => {
    log.push(cmd);
    if (cmd === 'RPUSH') { const l = data.get(key) || []; l.push(a[0]); data.set(key, l); return l.length; }
    if (cmd === 'RPOP') { const l = data.get(key) || []; return l.pop() ?? null; }
    if (cmd === 'LPOP') { const l = data.get(key) || []; const out = l.splice(0, Number(a[0])); return out.length ? out : null; }
    if (cmd === 'EXPIRE') { if (data.has(key)) ttl.set(key, Number(a[0])); return 1; }
    if (cmd === 'DEL') { ttl.delete(key); return data.delete(key) ? 1 : 0; }
    if (cmd === 'INCRBY') { const n = Number(data.get(key) || 0) + Number(a[0]); data.set(key, String(n)); return n; }
    if (cmd === 'SET') {
      if (a.includes('XX') && !data.has(key)) return null;
      if (a.includes('NX') && data.has(key)) return null;
      const ex = a.indexOf('EX'); set(key, a[0], ex > 0 ? a[ex + 1] : 0); return 'OK';
    }
    throw new Error('unexpected command ' + cmd);
  };
  return {
    data, ttl, log, failSetOn: (fn) => { failSet = fn; },
    kvGetRaw: async (k) => { log.push('GET'); const v = data.get(k); return typeof v === 'string' ? v : null; },
    kvSetRaw: async (k, v, t) => { log.push('SET'); if (failSet && failSet(k)) throw new Error('store down'); set(k, v, t); },
    kvSetIfAbsent: async (k, v, t) => { log.push('SETNX'); if (data.has(k)) return false; set(k, v, t); return true; },
    kvIncr: async (k) => run(['INCRBY', k, '1']),
    kvIncrBy: async (k, n) => run(['INCRBY', k, String(n)]),
    kvExpire: async (k, t) => { log.push('EXPIRE'); if (data.has(k)) ttl.set(k, t); },
    kvDel: async (k) => { run(['DEL', k]); },
    kvList: async (p) => [...data.keys()].filter((k) => k.startsWith(p)),
    kvPipeline: async (cmds) => cmds.map(run),
  };
}

// نقاط مزيّفة بسلوك spendPoints: المالك/VIP بلا خصم، والرصيد لا يصير سالبًا، وتأخير يفتح باب السباق
function fakePoints(balances) {
  const bal = new Map(Object.entries(balances || {}));
  const spends = [], refunds = [];
  return {
    bal, spends, refunds,
    spendPoints: async (u, amt, reason) => {
      spends.push([u, amt, reason]);
      await new Promise((r) => setTimeout(r, 5));
      const b = Number(bal.get(u) || 0);
      if (b < amt) return { ok: false, reason: 'insufficient', points: b, needed: amt };
      bal.set(u, b - amt);
      return { ok: true, points: b - amt, spent: amt, reason };
    },
    refundPointsOnly: async (u, amt, mark) => { refunds.push([u, amt, mark]); bal.set(u, Number(bal.get(u) || 0) + amt); return true; },
    readPoints: async (u) => ({ points: Number(bal.get(u) || 0) }),
  };
}

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);      // ١٤:٠٠ في دبي
function world(balances, t0) {
  const K = memoryKV(), points = fakePoints(balances);
  const clock = { t: t0 || T0 };
  const o = { points, isOwner: (u) => u === 'omran', isVip: async (u) => u === 'vipper', now: () => clock.t };
  const call = (body, who) => act(body, 'ip-' + Math.random(), K, who || null, null, o);
  return { K, points, clock, o, call };
}
const DAY = (t) => plan.dubaiDay(t);
const SUB = (u) => 'talk/sub/' + u;
const FREE = (u, t) => 'talk/free/' + u + '/' + DAY(t);
const room = (K, code) => JSON.parse(K.data.get('talk/room/' + code));

test('الثوابت كما قرّرها المالك، والسبب خارج جداول الوسائط والأسعار', () => {
  assert.deepEqual([plan.FREE_SECONDS, plan.FREE_CAP, plan.SUB_CAP, plan.SUB_COST, plan.SUB_DAYS, plan.SPEND_REASON], [3600, 4, 10, 37, 30, 'talk_room_sub']);
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'api/_lib/points.js'), 'utf8');
  assert.ok(!/talk_room_sub/.test(src), 'لا في COSTS');
  assert.ok(!/talk_room_sub/.test(require('node:fs').readFileSync(path.join(__dirname, '..', 'api/_lib/_mediaPlans.js'), 'utf8')), 'لا في UNIT_COST');
});

test('المالك وVIP: بلا خصم أبدًا، وبلا أيّ أمر تخزين زائد في open وpending', async () => {
  for (const who of ['omran', 'vipper']) {
    const w = world({ [who]: 500 });
    const r = await w.call({ op: 'open' }, who);
    assert.equal(r.status, 200);
    assert.deepEqual([r.json.plan, r.json.cap, r.json.left], ['own', 10, null], who);
    assert.deepEqual(w.K.log, ['INCRBY', 'EXPIRE', 'SETNX'], who + ': حدّ الطلبات ثمّ الكتابة فقط');
    w.K.log.length = 0;
    await w.call({ op: 'pending', code: r.json.code, key: r.json.key });
    assert.deepEqual(w.K.log, ['GET', 'LPOP'], who);
    w.K.log.length = 0;
    w.clock.t += 14000;
    const p = await w.call({ op: 'pending', code: r.json.code, key: r.json.key, keep: 1 });
    assert.deepEqual(w.K.log, ['GET', 'LPOP', 'EXPIRE'], who + ': نبضة keep كما كانت');
    assert.deepEqual(p.json, { joins: [] });
    w.K.log.length = 0;
    const pl = await w.call({ op: 'plan' }, who);
    assert.deepEqual(pl.json, { plan: 'own', cap: 10, left: null, sub: null, cost: 37 });
    assert.equal((await w.call({ op: 'sub-buy', confirmed: true }, who)).json.charged, 0);
    assert.deepEqual(w.K.log, [], who + ': plan وsub-buy بلا تخزين');
    assert.deepEqual(w.points.spends, [], who + ': لا خصم');
  }
});

test('بلا جلسة: plan وsub-buy وsub-auto وopen تحتاج حسابًا', async () => {
  const w = world();
  for (const op of ['plan', 'sub-buy', 'sub-auto', 'open']) assert.equal((await w.call({ op, on: true })).status, 401, op);
});

test('المجّانيّ: يفتح ما بقي من الساعة شيء، وبعد ٣٦٠٠ ثانية 403 free-time', async () => {
  const w = world({ sara: 0 });
  const r = await w.call({ op: 'open' }, 'sara');
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.plan, r.json.cap, r.json.left], ['free', 4, 3600]);
  const rec = room(w.K, r.json.code);
  assert.deepEqual([rec.u, rec.p, rec.c, rec.m], ['sara', 'free', 4, T0]);
  w.K.data.set(FREE('sara', T0), '3599');
  assert.equal((await w.call({ op: 'open' }, 'sara')).json.left, 1);
  w.K.data.set(FREE('sara', T0), '3600');
  const no = await w.call({ op: 'open' }, 'sara');
  assert.deepEqual([no.status, no.json.error], [403, 'free-time']);
  assert.deepEqual((await w.call({ op: 'plan' }, 'sara')).json, { plan: 'free', cap: 4, left: 0, sub: null, cost: 37 });
});

test('يوم المجّانيّ بتوقيت دبي (UTC+4): ٢٠:٣٠ UTC يوم ٢٤ = يوم ٢٥ هناك', async () => {
  assert.equal(plan.dubaiDay(Date.UTC(2026, 10, 24, 19, 59, 59)), '2026-11-24');
  assert.equal(plan.dubaiDay(Date.UTC(2026, 10, 24, 20, 0, 0)), '2026-11-25');
  const t = Date.UTC(2026, 10, 24, 20, 30);
  const w = world({}, t);
  const { code, key } = (await w.call({ op: 'open' }, 'sara')).json;
  w.clock.t += 14000;
  await w.call({ op: 'pending', code, key, keep: 1 });
  assert.equal(w.K.data.get('talk/free/sara/2026-11-25'), '14');
  assert.equal(w.K.ttl.get('talk/free/sara/2026-11-25'), 172800, 'عمر يومين عند أوّل كتابة');
});

test('نبضات keep تعدّ min(الفرق، ٦٠) ثانية، وتجدّد الغرفة، وtimeUp عند الساعة ويبقى', async () => {
  const w = world();
  const { code, key } = (await w.call({ op: 'open' }, 'sara')).json;
  w.K.log.length = 0;
  await w.call({ op: 'pending', code, key });
  assert.deepEqual(w.K.log, ['GET', 'LPOP'], 'بلا keep: الأمران كما كانا');
  w.clock.t += 14000;
  let p = await w.call({ op: 'pending', code, key, keep: 1 });
  assert.equal(w.K.data.get(FREE('sara', T0)), '14');
  assert.deepEqual([p.json.left, p.json.timeUp], [3586, undefined]);
  assert.equal(room(w.K, code).m, w.clock.t);
  assert.equal(w.K.ttl.get('talk/room/' + code), 900, 'عمر الغرفة يتجدّد مع الكتابة');
  w.clock.t += 200000;      // التبويب نام: لا يُحسب أكثر من ٦٠
  await w.call({ op: 'pending', code, key, keep: 1 });
  assert.equal(w.K.data.get(FREE('sara', T0)), '74');
  w.K.data.set(FREE('sara', T0), '3590');
  w.clock.t += 14000;
  p = await w.call({ op: 'pending', code, key, keep: 1 });
  assert.equal(p.json.timeUp, true);
  assert.equal(p.json.left, 0);
  w.clock.t += 14000;
  assert.equal((await w.call({ op: 'pending', code, key, keep: 1 })).json.timeUp, true, 'ويبقى');
  await w.call({ op: 'close', code, key });
  await w.call({ op: 'pending', code, key, keep: 1 });
  assert.ok(!w.K.data.has('talk/room/' + code), 'غرفة أُغلقت لا تُبعث');
});

test('الشراء يحتاج تأكيدًا: 428 بالسعر ٣٧ والرصيد، ثمّ خصم ٣٧ مرّة واحدة؛ والنقر المزدوج والمتزامن لا يخصم مرّتين', async () => {
  const w = world({ sara: 100 });
  const q = await w.call({ op: 'sub-buy' }, 'sara');
  assert.equal(q.status, 428);
  assert.equal(q.json.error, 'confirm_required'); assert.equal(q.json.cost, 37); assert.equal(q.json.points, 100);
  assert.deepEqual(w.points.spends, [], 'العرض لا يخصم');
  const [a, b] = await Promise.all([w.call({ op: 'sub-buy', confirmed: true }, 'sara'), w.call({ op: 'sub-buy', confirmed: true }, 'sara')]);
  const ok = [a, b].filter((r) => r.status === 200), other = [a, b].find((r) => r.status !== 200);
  assert.equal(ok.length, 1);
  assert.deepEqual([other.status, other.json.error], [409, 'busy'], 'المتزامن تحت القفل');
  assert.equal(ok[0].json.charged, 37); assert.equal(ok[0].json.points, 63);
  assert.deepEqual([ok[0].json.plan, ok[0].json.cap, ok[0].json.left], ['sub', 10, null]);
  assert.deepEqual(ok[0].json.sub, { active: true, until: T0 + 30 * 86400000, auto: true });
  assert.deepEqual(JSON.parse(w.K.data.get(SUB('sara'))), { until: T0 + 30 * 86400000, auto: true, at: T0 });
  assert.ok(!w.K.ttl.has(SUB('sara')), 'بلا عمر');
  assert.ok(!w.K.data.has('talk/sub/lock/sara'), 'القفل يُفكّ');
  const again = await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  assert.deepEqual([again.status, again.json.error], [409, 'active'], 'شراء وهو ساري');
  assert.deepEqual([(await w.call({ op: 'sub-buy' }, 'sara')).status], [409]);
  assert.deepEqual(w.points.spends, [['sara', 37, 'talk_room_sub']], 'خصم واحد');
  assert.equal(w.points.bal.get('sara'), 63);
  // القفل مأخوذ (تجديد يجري): شراء صريح = busy بلا خصم
  w.K.data.delete(SUB('sara')); w.K.data.set('talk/sub/lock/sara', '1');
  for (const k of [...w.K.data.keys()]) if (k.startsWith('talk/sub/paid/')) w.K.data.delete(k);      // القفل وحده يمنع هنا
  assert.deepEqual((await w.call({ op: 'sub-buy', confirmed: true }, 'sara')).json, { error: 'busy' });
  assert.equal(w.points.spends.length, 1);
});

test('رصيد لا يكفي: 402 points_insufficient ولا اشتراك ولا خصم', async () => {
  const w = world({ sara: 36 });
  const r = await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  assert.deepEqual([r.status, r.json], [402, { error: 'points_insufficient', needed: 37, points: 36 }]);
  assert.ok(!w.K.data.has(SUB('sara')));
  assert.equal(w.points.bal.get('sara'), 36);
  assert.ok(!w.K.data.has('talk/sub/lock/sara'));
  w.points.bal.set('sara', 40);      // شحن ثمّ شراء: لا ختم عالق من المحاولة التي لم تخصم
  const again = await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  assert.deepEqual([again.status, again.json.charged, w.points.bal.get('sara')], [200, 37, 3]);
});

test('الخصم نجح وكتابة الاشتراك فشلت: تُردّ النقاط مرّة واحدة بختم، ويُبلَّغ الفشل', async () => {
  const w = world({ sara: 100 });
  w.K.failSetOn((k) => k === SUB('sara'));
  const r = await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  assert.deepEqual([r.status, r.json], [503, { error: 'store', refunded: true }]);
  assert.deepEqual(w.points.refunds, [['sara', 37, ['talk/sub/refund/sara/' + T0, '1', 86400]]]);
  assert.equal(w.points.bal.get('sara'), 100);
  assert.ok(!w.K.data.has(SUB('sara')));
  assert.ok(!w.K.data.has('talk/sub/lock/sara'));
});

test('التجديد الكسول: بعد الانتهاء والتجديد مفعّل يُخصم ٣٧ مرّة وتبدأ ٣٠ يومًا من الآن', async () => {
  const w = world({ sara: 100 });
  w.K.data.set(SUB('sara'), JSON.stringify({ until: T0 - 5 * 86400000, auto: true, at: T0 - 35 * 86400000 }));
  const r = await w.call({ op: 'plan' }, 'sara');
  assert.deepEqual(r.json, { plan: 'sub', cap: 10, left: null, sub: { active: true, until: T0 + 30 * 86400000, auto: true }, cost: 37 });
  assert.deepEqual(JSON.parse(w.K.data.get(SUB('sara'))), { until: T0 + 30 * 86400000, auto: true, at: T0 }, 'من الآن لا من النهاية القديمة');
  await w.call({ op: 'plan' }, 'sara');
  await w.call({ op: 'open' }, 'sara');
  assert.deepEqual(w.points.spends, [['sara', 37, 'talk_room_sub']], 'مرّة واحدة');
  assert.equal(w.points.bal.get('sara'), 63);
  // تجديدان متزامنان: واحد يخصم
  const w2 = world({ sara: 100 });
  w2.K.data.set(SUB('sara'), JSON.stringify({ until: T0 - 1, auto: true, at: 1 }));
  await Promise.all([w2.call({ op: 'plan' }, 'sara'), w2.call({ op: 'plan' }, 'sara'), w2.call({ op: 'open' }, 'sara')]);
  assert.equal(w2.points.spends.length, 1);
  assert.equal(w2.points.bal.get('sara'), 63);
});

test('التجديد برصيد قاصر: ينتهي الاشتراك (لا سالب ولا جزئيّ) ولا يُعاد الخصم لاحقًا بلا شراء', async () => {
  const w = world({ sara: 20 });
  w.K.data.set(SUB('sara'), JSON.stringify({ until: T0 - 1000, auto: true, at: 1 }));
  const r = await w.call({ op: 'plan' }, 'sara');
  assert.deepEqual(r.json, { plan: 'free', cap: 4, left: 3600, sub: { active: false, until: T0 - 1000, auto: false }, cost: 37 });
  assert.equal(w.points.bal.get('sara'), 20);
  w.points.bal.set('sara', 500);      // شحن نقاطًا لغرض آخر
  await w.call({ op: 'plan' }, 'sara');
  assert.equal(w.points.spends.length, 1, 'المحاولة الأولى وحدها');
  assert.equal(w.points.bal.get('sara'), 500);
  assert.deepEqual((await w.call({ op: 'sub-auto', on: true }, 'sara')).json, { error: 'expired' }, 'تشغيل التجديد على منتهٍ لا يخصم بلا تأكيد');
  const buy = await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  assert.equal(buy.json.charged, 37, 'منتهٍ + شراء = مدّة جديدة');
});

test('التجديد مطفأ: ينتهي بلا خصم، والتبديل بلا خصم', async () => {
  const w = world({ sara: 100 });
  await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  const off = await w.call({ op: 'sub-auto', on: false }, 'sara');
  assert.deepEqual(off.json.sub, { active: true, until: T0 + 30 * 86400000, auto: false });
  assert.deepEqual((await w.call({ op: 'sub-auto', on: true }, 'sara')).json.sub.auto, true);
  await w.call({ op: 'sub-auto', on: false }, 'sara');
  assert.equal((await w.call({ op: 'sub-auto', on: 'yes' }, 'sara')).status, 400);
  assert.equal((await w.call({ op: 'sub-auto', on: true }, 'bob')).status, 404, 'بلا اشتراك');
  w.clock.t = T0 + 30 * 86400000 + 1;
  const r = await w.call({ op: 'plan' }, 'sara');
  assert.deepEqual([r.json.plan, r.json.cap, r.json.sub.active], ['free', 4, false]);
  assert.equal(w.points.spends.length, 1, 'الشراء وحده');
  assert.equal(w.points.bal.get('sara'), 63);
});

test('غرفة الاشتراك: ساريًا لا أمر زائد، وانتهاؤه برصيد قاصر يحوّلها للعدّ المجّانيّ وسط الغرفة (حدّ ٤ للقادمين)', async () => {
  const w = world({ sara: 37 });
  await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  const o = await w.call({ op: 'open' }, 'sara');
  assert.deepEqual([o.json.plan, o.json.cap, o.json.left], ['sub', 10, null]);
  const { code, key } = o.json;
  assert.deepEqual([room(w.K, code).p, room(w.K, code).e], ['sub', T0 + 30 * 86400000]);
  w.K.log.length = 0;
  w.clock.t += 14000;
  assert.deepEqual((await w.call({ op: 'pending', code, key, keep: 1 })).json, { joins: [] });
  assert.deepEqual(w.K.log, ['GET', 'LPOP', 'EXPIRE'], 'ساري: كما كان');
  w.clock.t = T0 + 30 * 86400000 + 1000;      // الرصيد صفر الآن
  const p = await w.call({ op: 'pending', code, key, keep: 1 });
  assert.deepEqual(p.json, { joins: [], plan: 'free', cap: 4, left: 3600 });
  const rec = room(w.K, code);
  assert.deepEqual([rec.p, rec.c, rec.m, rec.e], ['free', 4, w.clock.t, undefined]);
  w.clock.t += 14000;
  await w.call({ op: 'pending', code, key, keep: 1 });
  assert.equal(w.K.data.get(FREE('sara', w.clock.t)), '14', 'صار يُعدّ');
  assert.equal(w.points.bal.get('sara'), 0, 'لا سالب');
  // والتجديد الناجح في الغرفة يمدّها بلا تحويل
  const w2 = world({ sara: 74 });
  await w2.call({ op: 'sub-buy', confirmed: true }, 'sara');
  const r2 = (await w2.call({ op: 'open' }, 'sara')).json;
  w2.clock.t = T0 + 30 * 86400000 + 1000;
  assert.deepEqual((await w2.call({ op: 'pending', code: r2.code, key: r2.key, keep: 1 })).json, { joins: [] });
  assert.equal(room(w2.K, r2.code).e, w2.clock.t + 30 * 86400000);
  assert.equal(w2.points.bal.get('sara'), 0);
});

test('غرفة اشتراك انتهى وتجديده عند غيره (القفل مأخوذ): تبقى اشتراكًا ولا تُحوَّل مجّانيّة في تلك النبضة', async () => {
  const w = world({ sara: 100 });
  await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  const { code, key } = (await w.call({ op: 'open' }, 'sara')).json;
  w.clock.t = T0 + 30 * 86400000 + 1000;
  w.K.data.set('talk/sub/lock/sara', '1');
  const p = await w.call({ op: 'pending', code, key, keep: 1 });
  assert.deepEqual(p.json, { joins: [] });
  assert.equal(room(w.K, code).p, 'sub');
  assert.equal(w.points.spends.length, 1);
});

test('غرفة أُغلقت بين القراءة والنبضة: SET XX لا يبعثها', async () => {
  const w = world();
  const { code, key } = (await w.call({ op: 'open' }, 'sara')).json;
  const pipe = w.K.kvPipeline;
  w.K.kvPipeline = async (cmds) => { w.K.data.delete('talk/room/' + code); return pipe(cmds); };
  w.clock.t += 14000;
  await w.call({ op: 'pending', code, key, keep: 1 });
  assert.ok(!w.K.data.has('talk/room/' + code));
});

test('خوادم الترحيل لغرفة مجّانيّة: عمرها ما بقي من الساعة', async () => {
  const w = world();
  const { code } = (await w.call({ op: 'open' }, 'sara')).json;
  w.K.data.set(FREE('sara', T0), '3000');
  let got = 'x';
  const fake = async (K, ttl) => { got = ttl; return { iceServers: [] }; };
  await act({ op: 'ice', code }, 'g', w.K, null, fake, w.o);
  assert.equal(got, 600);
  const own = (await act({ op: 'open' }, 'h', w.K, 'omran', null, w.o)).json.code;
  await act({ op: 'ice', code: own }, 'g', w.K, null, fake, w.o);
  assert.equal(got, undefined, 'المالك: العمر كما كان');
});

test('تغيير الاسم ينقل الاشتراك وثواني اليوم، وحذف الحساب يمحوهما', async () => {
  const K = memoryKV();
  const sub = JSON.stringify({ until: T0 + 86400000, auto: true, at: T0 });
  K.data.set(SUB('sara'), sub); K.data.set(FREE('sara', T0), '1200');
  await plan.moveOnRename('Sara', 'noor', K, T0);
  assert.equal(K.data.get(SUB('noor')), sub);
  assert.equal(K.data.get(FREE('noor', T0)), '1200');
  assert.equal(K.ttl.get(FREE('noor', T0)), 172800);
  assert.ok(!K.data.has(SUB('sara')), 'الاشتراك لا يبقى تحت القديم');
  assert.equal(K.data.get(FREE('sara', T0)), '3600', 'واليوم بالقديم ممتلئ (غرفة مفتوحة به لا تعدّ من صفر)');
  assert.match(require('node:fs').readFileSync(path.join(__dirname, '..', 'api/_lib/auth.js'), 'utf8'), /step\('talk-plan', \(\) => require\('\.\/talk-plan\.js'\)\.moveOnRename\(oldKey, newKey, require\('\.\/kv\.js'\)\)\)/);

  const { deleteAccount } = require('../api/_lib/account-delete.js');
  const users = new Map([['sara', { username: 'sara' }]]);
  const D = memoryKV();
  D.data.set(SUB('sara'), sub); D.data.set(FREE('sara', T0), '10'); D.data.set('talk/free/sara/2026-11-23', '5');
  D.data.set(SUB('sarah'), sub); D.data.set('talk/free/sarah/2026-11-24', '7');
  D.kvGetJSON = async (k) => { const v = D.data.get(k); return v ? JSON.parse(v) : null; };
  const auth = { getUser: async (u) => (users.has(u) ? users.get(u) : null), putUser: async (u, r) => { users.set(u, r); } };
  const r = await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'sara' }, { kv: D, auth, now: 1, autoRenewToggle: async (req, res) => res.status(200).json({ ok: true }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const k of [SUB('sara'), FREE('sara', T0), 'talk/free/sara/2026-11-23']) assert.ok(!D.data.has(k), 'باقٍ: ' + k);
  assert.ok(D.data.has(SUB('sarah')) && D.data.has('talk/free/sarah/2026-11-24'), 'غيره لا يُمسّ');
});

// ---- المراجعة المعاكسة (باب المال): ما كان يخصم مرّتين أو يمنح بلا خصم أو يفتح ساعة مجّانيّة ثانية
// خصمٌ يُمسك حتّى يُطلق (لفتح نافذة بين الخصم والكتابة)
function holdSpends(points) {
  const real = points.spendPoints, gates = [];
  points.spendPoints = async (...a) => { await new Promise((r) => gates.push(r)); return real(...a); };
  return { release: () => { while (gates.length) gates.shift()(); }, waiting: () => gates.length };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(fn) { for (let i = 0; i < 200 && !fn(); i++) await tick(); assert.ok(fn(), 'timeout'); }

test('قفلٌ انتهى عمره وسط الخصم: الثاني لا يخصم مرّة أخرى لنفس المدّة (ختم المدّة)', async () => {
  const w = world({ sara: 200 });
  w.K.data.set(SUB('sara'), JSON.stringify({ until: T0 - 1, auto: true, at: 1 }));
  const h = holdSpends(w.points);
  const first = w.call({ op: 'plan' }, 'sara');
  await until(() => h.waiting() === 1);
  w.K.data.delete('talk/sub/lock/sara');      // ٢٠ ثانية مضت والخصم الأوّل لم يرجع بعد
  const second = w.call({ op: 'plan' }, 'sara');
  await tick(); await tick(); await tick();
  h.release(); await until(() => h.waiting() === 0);
  h.release();
  await Promise.all([first, second]);
  h.release();
  assert.equal(w.points.bal.get('sara'), 163, 'خصم واحد لا اثنان');
  assert.equal(JSON.parse(w.K.data.get(SUB('sara'))).until, T0 + 30 * 86400000);
  // والشراء الصريح كذلك: قفل انتهى وسط الخصم
  const w2 = world({ sara: 200 });
  const h2 = holdSpends(w2.points);
  const a = w2.call({ op: 'sub-buy', confirmed: true }, 'sara');
  await until(() => h2.waiting() === 1);
  w2.K.data.delete('talk/sub/lock/sara');
  const b = w2.call({ op: 'sub-buy', confirmed: true }, 'sara');
  await tick(); await tick(); await tick();
  h2.release();
  const [ra, rb] = await Promise.all([a, b]);
  h2.release();
  assert.equal(w2.points.bal.get('sara'), 163, 'شراء واحد');
  assert.deepEqual([ra.status, rb.status].sort(), [200, 409]);
});

test('قراءة أولى قديمة (تجديد غيره كتب بعدها): القراءة الثانية داخل القفل تمنع الخصم', async () => {
  const w = world({ sara: 100 });
  const fresh = JSON.stringify({ until: T0 + 30 * 86400000, auto: true, at: T0 });
  w.K.data.set(SUB('sara'), fresh);
  const get = w.K.kvGetRaw;
  w.K.kvGetRaw = async (k, opts) => (k === SUB('sara') && !(opts && opts.strict) ? JSON.stringify({ until: T0 - 1, auto: true, at: 1 }) : get(k, opts));
  const r = await w.call({ op: 'plan' }, 'sara');
  assert.equal(r.json.plan, 'sub');
  assert.deepEqual(w.points.spends, []);
  const b = await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  assert.deepEqual([b.status, b.json.error], [409, 'active']);
  assert.deepEqual(w.points.spends, []);
});

test('التأكيد true حرفيًّا: قيمة أخرى تعطي العرض لا الخصم', async () => {
  const w = world({ sara: 100 });
  for (const confirmed of ['true', 1, 'yes', {}]) assert.equal((await w.call({ op: 'sub-buy', confirmed }, 'sara')).status, 428, String(confirmed));
  assert.deepEqual(w.points.spends, []);
});

test('كتابة التجديد فشلت: ردّ واحد بختم ولا اشتراك، والتقييم التالي يخصم مرّة واحدة فقط', async () => {
  const w = world({ sara: 100 });
  w.K.data.set(SUB('sara'), JSON.stringify({ until: T0 - 1, auto: true, at: 1 }));
  w.K.failSetOn((k) => k === SUB('sara'));
  const r = await w.call({ op: 'plan' }, 'sara');
  assert.equal(r.json.plan, 'free');
  assert.deepEqual(w.points.refunds, [['sara', 37, ['talk/sub/refund/sara/' + T0, '1', 86400]]]);
  assert.equal(w.points.bal.get('sara'), 100);
  w.K.failSetOn(null);
  assert.equal((await w.call({ op: 'plan' }, 'sara')).json.plan, 'sub');
  await w.call({ op: 'plan' }, 'sara');
  assert.equal(w.points.bal.get('sara'), 63);
  assert.equal(w.points.refunds.length, 1);
});

test('كتابة رمت لكنّها وقعت (ضاع الجواب): لا ردّ — وإلّا مُنح الاشتراك بلا خصم', async () => {
  const w = world({ sara: 100 });
  const set = w.K.kvSetRaw;
  w.K.kvSetRaw = async (k, v, t) => { await set(k, v, t); if (k === SUB('sara')) throw new Error('reply lost'); };
  const b = await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  assert.equal(b.status, 200);
  assert.equal(b.json.charged, 37);
  assert.deepEqual(w.points.refunds, []);
  assert.equal(w.points.bal.get('sara'), 63);
  w.clock.t = T0 + 30 * 86400000 + 1;
  assert.equal((await w.call({ op: 'plan' }, 'sara')).json.plan, 'sub', 'التجديد أيضًا');
  assert.deepEqual(w.points.refunds, []);
  assert.equal(w.points.bal.get('sara'), 26);
});

test('حساب موقوف عند التجديد: لا خصم، وغرفة الاشتراك تصير مجّانيّة لا اشتراكًا بلا حدّ يُعاد تقييمه كلّ نبضة', async () => {
  const w = world({ sara: 100 });
  await w.call({ op: 'sub-buy', confirmed: true }, 'sara');
  const { code, key } = (await w.call({ op: 'open' }, 'sara')).json;
  w.points.spendPoints = async (u, amt, reason) => { w.points.spends.push([u, amt, reason]); return { ok: false, reason: 'auth', banned: true, points: 0 }; };
  w.clock.t = T0 + 30 * 86400000 + 1000;
  const p = await w.call({ op: 'pending', code, key, keep: 1 });
  assert.equal(p.json.plan, 'free');
  assert.equal(room(w.K, code).p, 'free');
  assert.equal(w.points.bal.get('sara'), 63);
});

test('تجديد جارٍ بالاسم القديم وقت تغيير الاسم: يُنتظر فيُنقل الاشتراك المدفوع، ولا خصم ثانٍ بالاسم الجديد', async () => {
  const w = world({ sara: 200, noor: 0 });
  w.K.data.set(SUB('sara'), JSON.stringify({ until: T0 - 1, auto: true, at: 1 }));
  const h = holdSpends(w.points);
  const renew = w.call({ op: 'plan' }, 'sara');
  await until(() => h.waiting() === 1);
  const move = plan.moveOnRename('sara', 'noor', w.K, T0);
  await new Promise((r) => setTimeout(r, 60));
  h.release();
  await renew; await move;
  assert.equal(JSON.parse(w.K.data.get(SUB('noor'))).until, T0 + 30 * 86400000, 'المدفوع انتقل');
  assert.ok(!w.K.data.has(SUB('sara')), 'لا اشتراك يتيم تحت الاسم الميّت');
  w.points.bal.set('noor', w.points.bal.get('sara')); w.points.bal.delete('sara');      // الرصيد ينتقل في auth.js
  assert.equal((await w.call({ op: 'plan' }, 'noor')).json.plan, 'sub');
  assert.equal(w.points.spends.length, 1, 'خصم واحد');
});

test('تغيير الاسم لا يعطي ساعة مجّانيّة ثانية: غرفة مفتوحة بالقديم تنتهي، والعودة للاسم القديم تحفظ ما استُعمل', async () => {
  const w = world();
  const { code, key } = (await w.call({ op: 'open' }, 'sara')).json;
  w.K.data.set(FREE('sara', T0), '1800');
  await plan.moveOnRename('sara', 'noor', w.K, T0);
  assert.equal(w.K.data.get(FREE('noor', T0)), '1800');
  w.clock.t += 14000;
  assert.equal((await w.call({ op: 'pending', code, key, keep: 1 })).json.timeUp, true, 'الغرفة بالاسم الميّت لا تعدّ من صفر');
  assert.equal((await w.call({ op: 'open' }, 'noor')).json.left, 1800);
  await plan.moveOnRename('noor', 'sara', w.K, T0);
  assert.equal((await w.call({ op: 'open' }, 'sara')).json.left, 1800, 'العودة للاسم القديم: لا صفر ولا ساعة جديدة');
});

test('الملفّ: لا طباعة ولا أسرار، والخصم بـspendPoints وحده', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'api/_lib/talk-plan.js'), 'utf8');
  assert.ok(!/console\.|process\.env/.test(src));
  assert.ok(!/'DECRBY'|kvDecrBy/.test(src), 'لا خصم يدويّ');
  assert.equal((src.match(/\.spendPoints\(/g) || []).length, 2, 'الشراء والتجديد');
});
