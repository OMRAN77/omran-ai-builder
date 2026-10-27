'use strict';
/* v-trend-one-confirm — فحص الترندات (المالك ٢٤ أكتوبر: «سويه في نفس الطلب»): قصّة بيكسار (٣ مشاهد) كانت تسأل «تخصم ١٧٥ نقطة» عند كلّ
   مشهد ولا تقول المجموع، وإلغاء المشهد الثاني يُضيع الأوّل المدفوع (المسبار: «تأكيدان ثمّ لا فيديو»). الآن:
   ١) veo-price بـtrend + scenes: المجموع بعد صلاحيّة فيديوهات الباقة، سؤال واحد (أو لا سؤال إن غطّتها الباقة أو VIP)، ورصيد ناقص
      ٤٠٢ بالمجموع قبل أيّ مشهد؛ ومهلة الثلاث دقائق لا ترفض القصّة (العميل ينتظرها بين المشاهد). الشخصيّة الناطقة كما كانت.
   ٢) الإنشاء بـconfirmed:true يخصم المشهد كما كان بلا سؤال ثانٍ.
   ٣) العميل: priceOnce قبل الأوّل، confirmed لكلّ مشهد، والمشاهد المكتملة تُعرض مع «اكتمل {k} من {n}» (١٤ لغة). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
process.env.AUTH_SECRET = 'trend-one-confirm-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.VIDEO_FIRST_FRAME = 'off';

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
const users = new Map();
const vip = new Set();
const locks = new Set();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null,
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }, kvList: async () => [],
  kvPipeline: async (cmds) => cmds.map(([op, k, v]) => { if (op === 'INCRBY') { const x = Number(kv.get(k) || 0) + Number(v); kv.set(k, String(x)); return x; } kv.set(k, String(v)); return 'OK'; }),
});
mock('api/_lib/auth.js', {
  getUser: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  getUserOnce: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false, verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async (u) => vip.has(u) });
mock('api/_lib/abuse-guard.js', {
  videoLock: async () => ({ ok: true }), releaseVideoLock: async () => {},
  videoCooldownLeft: async (u) => (locks.has(u) ? 150 : 0), imageHourlyGuard: async () => ({ ok: true }),
});
/* بوّابة «الفيديو للمشتركين» تُختبر في video-subs.test.cjs — هنا الكلّ مشترك */
mock('api/_lib/_videoSubs.js', { CODE: 'video_subscribers', videoAllowed: async () => true, denyFree: async () => false });

const veo = require(rp('api/_lib/veo-create.js'));
const COST = require(rp('api/_lib/points.js')).COSTS.veo_video;
const NOW = Date.now();
const DAY = 86400000;
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: NOW + DAY })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
function account(u, plan, pts) { users.set(u, { username: u, plan, planUpdatedAt: NOW - DAY, points: pts }); kv.set('points:' + u, String(pts)); }
account('plus1', 'basic', 1000);   // صلاحيّة فيديو واحد
account('max1', 'max', 1000);      // ثلاثة
account('none1', 'free', 1000);    // بلا صلاحيّة (مشترك بالحارس المزيّف)
account('poor1', 'basic', 100);    // صلاحيّة واحد ونقاط لا تكفي الباقي
account('vip1', 'free', 0); vip.add('vip1');
let upstream = 0;
/* الترند على Omni (v-trend-omni): ردّ الواجهة المتزامنة بفيديو؛ وغيره (Veo) اسم مهمّة */
global.fetch = async (url) => { upstream++; return /\/interactions$/.test(String(url))
  ? new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/v' + upstream + ':download?alt=media' }] }] }), { status: 200 })
  : new Response(JSON.stringify({ name: 'operations/v' + upstream }), { status: 200 }); };
async function serve(action, body) {
  const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } };
  await veo({ method: 'POST', query: { action }, body }, res);
  return res;
}
const story = (u, extra) => serve('veo-price', Object.assign({ trend: 'pixarstory', scenes: 3, params: {}, token: token(u) }, extra));

test('١. سؤال واحد بالمجموع: بلا صلاحيّة ٣ × ١٧٥، وPlus يُخصم منه مشهدان والثالث من فيديو باقته — ولا نداء مزوّد ولا خصم', async () => {
  const a = await story('none1');
  assert.equal(a.code, 428);
  assert.equal(a.body.cost, 3 * COST);
  assert.match(a.body.message_ar, new RegExp('تخصم ' + 3 * COST + ' نقطة \\(قصّة ترند بعدّة مشاهد'));
  const b = await story('plus1');
  assert.equal(b.code, 428);
  assert.equal(b.body.cost, 2 * COST);
  assert.match(b.body.message_ar, new RegExp('تخصم ' + 2 * COST + ' نقطة'), 'ما تغطّيه الباقة لا يُحسب');
  assert.equal(upstream, 0, 'لا مزوّد');
  assert.equal(kv.get('points:none1'), '1000', 'لا خصم');
  assert.equal((await story('none1', { confirmed: true })).body.priceOk, true, 'بعد الموافقة');
  /* عدد المشاهد بين ١ و٥ */
  assert.equal((await story('none1', { scenes: 9 })).body.cost, 5 * COST);
});

test('٢. لا سؤال حين لا خصم: Max (٣ فيديوهات باقة) وVIP — priceOk مباشرة', async () => {
  for (const u of ['max1', 'vip1']) {
    const r = await story(u);
    assert.equal(r.code, 200, u + ' ' + JSON.stringify(r.body));
    assert.equal(r.body.priceOk, true, u);
  }
});

test('٣. رصيد لا يكفي المجموع: ٤٠٢ بالمجموع قبل أيّ مشهد (كان يدفع المشهد الأوّل ثمّ يقف)', async () => {
  const r = await story('poor1');
  assert.equal(r.code, 402);
  assert.deepEqual(r.body, { error: 'points_insufficient', needed: 2 * COST });
});

test('٤. مهلة الثلاث دقائق لا ترفض القصّة (العميل ينتظرها بين المشاهد)، والشخصيّة الناطقة بلا trend كما كانت (٤٢٩)', async () => {
  locks.add('none1');
  assert.equal((await story('none1')).code, 428, 'القصّة');
  const talk = await serve('veo-price', { promptText: 'talking character', withCartoon: false, token: token('none1') });
  assert.equal(talk.code, 429);
  assert.equal(talk.body.error, 'video_cooldown');
  locks.delete('none1');
});

test('٥. الإنشاء بـconfirmed:true: المشهد يُخصم بسعره كما كان بلا سؤال ثانٍ، وبلا confirmed ما زال يسأل', async () => {
  const before = Number(kv.get('points:none1'));
  const ask = await serve('veo-create', { trend: 'pixarstory', params: { sceneIndex: 0 }, token: token('none1') });
  assert.equal(ask.code, 428, 'بلا موافقة يسأل كما كان');
  const go = await serve('veo-create', { trend: 'pixarstory', params: { sceneIndex: 1 }, token: token('none1'), confirmed: true });
  assert.equal(go.code, 200, JSON.stringify(go.body));
  assert.match(String(go.body.op), /^omni\//, 'الترند على Omni');
  assert.equal(Number(kv.get('points:none1')), before - COST, 'المشهد الواحد بسعره');
});

test('٦. العميل: سؤال واحد قبل الأوّل لقصّة Veo، confirmed لكلّ مشهد بعده يُمسح في finally، والمكتمل يُعرض مع «اكتمل {k} من {n}»', () => {
  const s = read('js/app-11-video-trends.js');
  assert.match(s, /if\(n > 1 && t\.engine === 'veo'\) await priceOnce\(t, n, token\);/);
  assert.match(s, /post\('\/api\/video\?action=veo-price', \{ trend: t\.key, scenes: n, params: \{\}, token: token \}\)/);
  assert.match(s, /if\(preConfirmed\) payload\.confirmed = true;/);
  assert.match(s, /\}finally\{ busy = false; setBusyFlag\(false\); preConfirmed = false;/);
  assert.match(s, /if\(urls\.length\)\{\n\s+try\{ await show\(t, urls\); \}/);
  assert.match(s, /ui\('partial'\)\.replace\('\{k\}', String\(urls\.length\)\)\.replace\('\{n\}', String\(n\)\)/);
  assert.ok(s.indexOf('await priceOnce(t, n, token)') < s.indexOf('urls.push(await clipInSequence('), 'قبل الأوّل');
  /* النصّ بالـ١٤ لغة وبمتغيّريه */
  const ctx = { window: {} };
  vm.runInNewContext(read('js/app-11-video-trends-data.js'), ctx);
  const p = ctx.window.__VIDEO_TRENDS.ui.partial;
  assert.equal(Object.keys(p).length, 14);
  for (const [l, v] of Object.entries(p)) assert.ok(v.includes('{k}') && v.includes('{n}'), l);
  assert.ok(read('js/app.bundle.js').includes('if(preConfirmed) payload.confirmed = true;'), 'npm run bundle');
});
