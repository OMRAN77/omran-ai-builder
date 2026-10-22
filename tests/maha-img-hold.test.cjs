// tests/maha-img-hold.test.cjs — v-maha-img-hold (تدقيق ١٨ أكتوبر «لو سكّرت قبل لا توصل الصورة تنخصم 20 نقطة وتضيع الصورة»،
// وأمر المالك ٢٠ أكتوبر، الدفعة ١: «لا تثبّت الخصم إلا بعد ما توصل الصورة وتنحفظ، وإذا ضاعت ترجع النقاط تلقائي»).
// ١) تذكرة الحجز في الخادم (image-hold.js) بمخزن مزيّف: التأكيد يثبت، وبلا تأكيد بعد ٥ دقائق يُردّ مرّة واحدة إلى نوع الخصم،
//    والسقف اليوميّ، والمالك بلا تذكرة. ٢) /api/points: image-ack، والرصيد يسوّي قبل قراءته. ٣) maha-image يحجز ويعيد المعرّف.
// ٤) العميل الحقيقيّ (app-08) في vm: الصورة تصل بعد إغلاق المكالمة ← تُحفظ في المحادثة ← ثمّ التأكيد؛ فشل الحفظ = لا تأكيد.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'maha-img-hold-secret';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
const kvApi = {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...kv.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => cmds.map(() => 1),
};
mock('api/_lib/kv.js', kvApi);
const users = new Map();
mock('api/_lib/auth.js', {
  getUser: async (u) => (users.has(u) ? structuredClone(users.get(u)) : null),
  putUser: async (u, r) => { users.set(u, structuredClone(r)); },
  isBanned: async () => false,
  verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const hold = require(rp('api/_lib/image-hold.js'));
const points = require(rp('api/_lib/points.js'));
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const MIN = 60000;

function fakePoints() {
  const refunds = [];
  return { refunds, refundPoints: async (u, c, how) => { refunds.push([u, c, how || null]); } };
}

test('١. الحجز ثمّ التأكيد: يثبت الخصم ولا ردّ بعده أبدًا', async () => {
  kv.clear();
  const P = fakePoints();
  const t0 = Date.UTC(2026, 9, 20, 10);
  assert.equal(await hold.holdImage('sara', 'h_aaaaaaaa1', 20, { ok: true, points: 50, spent: 20 }, { now: t0 }), true);
  assert.deepEqual(await hold.ackImage('sara', 'h_aaaaaaaa1'), { committed: true });
  assert.equal(await hold.ackImage('sara', 'h_aaaaaaaa1'), null, 'تأكيد ثانٍ لا أثر له');
  const r = await hold.settleStale('sara', { now: t0 + 60 * MIN, points: P });
  assert.deepEqual([r, P.refunds], [{ refunded: 0, points: 0 }, []]);
});

test('٢. بلا تأكيد: لا شيء قبل ٥ دقائق، وبعدها يُردّ مرّة واحدة إلى نوع الخصم نفسه (رصيد الاشتراك بخانته)', async () => {
  kv.clear();
  const P = fakePoints();
  const t0 = Date.UTC(2026, 9, 20, 10);
  await hold.holdImage('sara', 'h_bbbbbbbb1', 20, { ok: true, points: 0, spent: 0, media: 'image', pool: 'mix' }, { now: t0 });
  assert.deepEqual(await hold.settleStale('sara', { now: t0 + 4 * MIN, points: P }), { refunded: 0, points: 0 });
  assert.deepEqual(await hold.settleStale('sara', { now: t0 + 5 * MIN, points: P }), { refunded: 1, points: 20 });
  assert.deepEqual(P.refunds, [['sara', 20, { planVideo: false, media: true, pool: 'mix' }]]);
  assert.deepEqual(await hold.settleStale('sara', { now: t0 + 9 * MIN, points: P }), { refunded: 0, points: 0 }, 'لا ردّ مرّتين');
  assert.equal(await hold.ackImage('sara', 'h_bbbbbbbb1'), null, 'تأكيد متأخّر بعد الردّ لا يعيد الخصم ولا يردّ ثانية');
});

test('٣. التأكيد قبل التسوية يغلب: سباق التأكيد والتسوية لا يردّ', async () => {
  kv.clear();
  const P = fakePoints();
  const t0 = Date.UTC(2026, 9, 20, 10);
  await hold.holdImage('noor', 'h_cccccccc1', 35, { ok: true, points: 10, spent: 35 }, { now: t0 });
  await hold.ackImage('noor', 'h_cccccccc1');
  assert.deepEqual(await hold.settleStale('noor', { now: t0 + 10 * MIN, points: P }), { refunded: 0, points: 0 });
  assert.deepEqual(P.refunds, []);
});

test('٤. المالك وVIP بلا تذكرة، والمعرّف المشوّه مرفوض؛ وحارس الإساءة: ٣ ردود تلقائيّة في اليوم', async () => {
  kv.clear();
  assert.equal(await hold.holdImage('omran', 'h_dddddddd1', 20, { ok: true, owner: true }), false);
  assert.equal(await hold.holdImage('sara', 'x', 20, { ok: true }), false);
  assert.equal(await hold.holdImage('sara', 'h_bad id!!!', 20, { ok: true }), false);
  const P = fakePoints();
  const t0 = Date.UTC(2026, 9, 20, 10);
  for (let i = 0; i < 4; i++) await hold.holdImage('ali', 'h_eeeeeee' + i, 20, { ok: true, points: 80, spent: 20 }, { now: t0 });
  const r = await hold.settleStale('ali', { now: t0 + 6 * MIN, points: P });
  assert.equal(hold.REFUND_DAY_MAX, 3);
  assert.deepEqual([r.refunded, P.refunds.length], [3, 3], 'الرابعة يثبت خصمها');
  assert.deepEqual(await hold.settleStale('ali', { now: t0 + 7 * MIN, points: P }), { refunded: 0, points: 0 }, 'المحسومة لا تعود');
});

test('٥. /api/points: image-ack يثبت، وقراءة الرصيد تسوّي قبلها فيظهر الرقم بعد الردّ؛ والأسعار تصل الزائر أيضًا', async () => {
  kv.clear(); users.clear();
  const call = async (body) => {
    const res = { code: 200, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, end() { return res; } };
    await points({ method: 'POST', body }, res);
    return res;
  };
  users.set('sara', { username: 'sara', points: 30 });
  kv.set('points:sara', '30');
  // صورة خُصمت (٢٠) ولم تُؤكَّد قبل ١٠ دقائق
  await hold.holdImage('sara', 'h_ffffffff1', 20, { ok: true, points: 30, spent: 20 }, { now: Date.now() - 10 * MIN });
  const b = await call({ action: 'balance', token: token('sara') });
  assert.equal(b.j.points, 50, 'الرصيد بعد الردّ التلقائيّ');
  await hold.holdImage('sara', 'h_ffffffff2', 20, { ok: true, points: 50, spent: 20 }, { now: Date.now() - 10 * MIN });
  const a = await call({ action: 'image-ack', token: token('sara'), hold: 'h_ffffffff2' });
  assert.deepEqual([a.code, a.j], [200, { ok: true, committed: true }]);
  assert.equal((await call({ action: 'balance', token: token('sara') })).j.points, 50, 'المؤكَّدة لا تُردّ');
  assert.equal((await call({ action: 'image-ack', hold: 'h_ffffffff2' })).code, 401);
  const g = await call({ action: 'balance' });
  assert.equal(g.j.authed, false);
  assert.equal(g.j.costs.runway_video, points.COSTS.runway_video, 'الزائر يرى الأسعار من COSTS نفسه');
});

test('٦. maha-image: الخصم يُحفظ بنوعه، والردّ الناجح يحجز إن طلب العميل ويعيد المعرّف — والمحادثة بلا hold لا تتغيّر', () => {
  const src = read('api/_lib/maha-image.js');
  assert.match(src, /mahaImgCharged = mahaImgUser; mahaImgPay = pay;/);
  const i = src.indexOf('async function sendImg(');
  const send = src.slice(i, src.indexOf('res.status(200).json({', i));
  assert.match(send, /const __holdOut = await require\('\.\/image-hold\.js'\)\.holdFromRequest\(body\.hold, mahaImgCharged, mahaImgChargedAmount, mahaImgPay\);/);
  assert.match(src.slice(src.indexOf('res.status(200).json({', i), src.indexOf('res.status(200).json({', i) + 200), /hold: __holdOut,/);
});

test('٦ب. holdFromRequest: المعرّف إن حُجز، ولا شيء بلا معرّف أو بلا خصم أو للمالك — ولا يرمي', async () => {
  kv.clear();
  assert.equal(await hold.holdFromRequest('h_gggggggg1', 'sara', 20, { ok: true, spent: 20 }), 'h_gggggggg1');
  assert.equal(await hold.holdFromRequest(undefined, 'sara', 20, { ok: true }), undefined, 'المحادثة بلا hold');
  assert.equal(await hold.holdFromRequest('h_gggggggg2', null, 20, { ok: true }), undefined, 'لم يُخصم (ضيف)');
  assert.equal(await hold.holdFromRequest('h_gggggggg3', 'omran', 20, { ok: true, owner: true }), undefined);
  const broken = { kvGetJSON: async () => { throw new Error('down'); } };
  assert.equal(await hold.holdFromRequest('h_gggggggg4', 'sara', 20, { ok: true }, { kv: broken }), undefined, 'عطب المخزن = خصم ثابت كما كان');
});

// ── العميل: الدوالّ الحقيقيّة من app-08 في vm ──
function client(opts) {
  const o = opts || {};
  const a8 = read('js/app-08-maha.js');
  const s = a8.indexOf('let mahaLastImageBase64 = null;');
  const e = a8.indexOf('/* ---------- مها Realtime Voice');
  assert.ok(s > 0 && e > s, 'كتلة صور مها بحدودها');
  const calls = [];
  const proj = { id: 'p1', title: 'x', messages: [], code: '' };
  const ctx = {
    console, JSON, Object, Array, String, Number, Promise, Date, Math, setTimeout: (fn) => fn(), Error,
    window: { getGuestId: () => 'g1', crypto: { randomUUID: () => '11111111-2222-3333-4444-555555555555' } },
    document: { getElementById: () => null },
    authGet: (k) => (k === 'aiapp_auth_token' ? 'tok' : ''),
    t: (k) => k, __swallow: () => {},
    state: { projects: [proj], currentId: 'p1' },
    getCurrent: () => proj,
    saveState: () => { if (o.saveFails) throw new Error('quota'); calls.push('save'); },
    renderAll: () => calls.push('render'),
    mahaGoldWaveEl: null, mahaAvatarDisplay: () => {},
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push(url + (body.action ? ':' + body.action : ''));
      if (url === '/api/maha-image') { ctx.__sentHold = body.hold; return { ok: true, status: 200, json: async () => ({ imageBase64: 'QUJD', mimeType: 'image/png', hold: body.hold }) }; }
      if (url === '/api/points') { ctx.__ackHold = body.hold; return { ok: true, status: 200, json: async () => ({ ok: true, committed: true }) }; }
      throw new Error('unexpected ' + url);
    },
  };
  vm.createContext(ctx);
  // mahaCallMode معرَّف لاحقًا في الملفّ؛ المكالمة أُغلقت: mahaEndCall يعيده 'assistant'
  // v-maha-img-wait (الدفعة ٦): عدّاد طلبات الصورة الجارية وحالة المكالمة معرَّفان لاحقًا في الملفّ
  vm.runInContext("var mahaCallMode = 'assistant', mahaImgPending = 0, mahaCallActive = false, mahaLastActivity = 0;\n" + a8.slice(s, e).replace(/^let /gm, 'var '), ctx);
  return { ctx, calls, proj };
}

test('٧. العميل: صورة تصل بعد إغلاق المكالمة تُحفظ في المحادثة، والتأكيد بعد الحفظ وحده وبمعرّف الطلب نفسه', async () => {
  const c = client();
  const r = await c.ctx.mahaGenerateOrEditImage('قطّة في الفضاء', false, '', '', '', false, 'auto', false);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: true });
  assert.equal(c.ctx.__sentHold, '11111111222233334444555555555555', 'الطلب يحمل معرّف الحجز');
  const last = c.proj.messages[c.proj.messages.length - 1];
  assert.equal(last.role, 'assistant');
  assert.deepEqual(JSON.parse(JSON.stringify(last.attachments.map((x) => [x.isImage, x.dataUrl]))), [[true, 'data:image/png;base64,QUJD']]);
  await new Promise((res) => setImmediate(res));
  assert.deepEqual([...c.calls], ['/api/maha-image', 'save', 'render', '/api/points:image-ack'], 'الحفظ قبل التأكيد');
  assert.equal(c.ctx.__ackHold, c.ctx.__sentHold);
});

test('٨. العميل: فشل الحفظ = لا تأكيد (فيردّ الخادم النقاط تلقائيًّا)', async () => {
  const c = client({ saveFails: true });
  await c.ctx.mahaGenerateOrEditImage('قطّة', false, '', '', '', false, 'auto', false);
  await new Promise((res) => setImmediate(res));
  assert.ok(!c.calls.includes('/api/points:image-ack'), JSON.stringify(c.calls));
});
