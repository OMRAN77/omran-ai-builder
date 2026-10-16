// tests/video-giveback.test.cjs — v-video-giveback (المالك ١٦ أكتوبر: «أصلحها الثلاث في طلب سحب واحد»):
// فيديو خُصم ثمنه ثمّ تعطّل قبل أن يقبله المزوّد (لا مفتاح، أو انقطاع/مهلة عند نداء الإنشاء) كان يحرق النقاط
// ويترك قفل الثلاث دقائق، فإعادة المحاولة (العميل يعيد تلقائيًّا بعد ٦ث) ترجع «video_cooldown».
// على المعالجات الحقيقيّة (Runway · Veo · الاقتصاديّ) مع points.js وabuse-guard.js و_dailyQuota.js الحقيقيّة فوق KV في
// الذاكرة، والشبكة مزيّفة: كلّ فشل بعد الخصم يردّ النقاط ويفكّ القفل وحصّة اليوم، ولا اسم مزوّد ولا مفتاح في الردّ؛
// والنجاح والمهلة كما كانا حرفيًّا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'video-giveback-test-secret-' + 'x'.repeat(24);
process.env.VIDEO_FIRST_FRAME = 'off';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.MINIMAX_API_KEY = 'mm-test';
process.env.RUNWAY_API_KEY = 'rw-test';
for (const k of ['RUNWAY_API_KEY_2', 'RUNWAY_API_KEY_3', 'RUNWAY_MODEL', 'UPSTASH_REDIS_REST_URL']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
const users = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {}, kvList: async () => [],
});
mock('api/_lib/auth.js', {
  getUser: async (u) => (users.has(u) ? structuredClone(users.get(u)) : null),
  getUserOnce: async (u) => (users.has(u) ? structuredClone(users.get(u)) : null),
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false,
  verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/cost-meter.js', { meterOp: async () => {}, addCost: async () => {} });

const points = require(rp('api/_lib/points.js'));
const runway = require(rp('api/_lib/video-create.js'));
const veo = require(rp('api/_lib/veo-create.js'));
const minimax = require(rp('api/_lib/minimax-create.js'));

const DAY = 86400000;
function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + DAY })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
function user(u, pts) { users.set(u, { username: u, points: pts }); kv.set('points:' + u, String(pts)); }
const bal = (u) => Number(kv.get('points:' + u));
const locked = (u) => kv.has('abuse:video:' + u);
const tally = (u) => Number(kv.get('db/video-usage/tally/' + u + '/' + new Date().toISOString().slice(0, 10)) || 0);
// لا اسم مزوّد ولا اسم مفتاح ولا نصّ تقنيّ خام في رسالة يراها المستخدم (قاعدة المالك الثابتة).
const LEAK_RE = /Runway|RUNWAY|Veo|VEO|Gemini|GEMINI|MiniMax|MINIMAX|Hailuo|Omni|_API_KEY|Proxy error|fetch failed|timed out/;

// الشبكة: كلّ مزوّد يقبل أو «يرمي» (انقطاع/مهلة TTFB من _fetch-timeout) حسب mode.
const mode = { runway: 'ok', veo: 'ok', minimax: 'ok', image: 'ok' };
const sent = [];
const boom = () => { const e = new TypeError('fetch failed'); e.cause = new Error('ECONNRESET'); throw e; };
global.fetch = async (url) => {
  const u = String(url);
  sent.push(u);
  if (/\/v1\/(text|image)_to_video$/.test(u)) { if (mode.runway === 'throw') boom(); return Response.json({ id: 'rw-task-' + sent.length }); }
  if (u.includes(':predictLongRunning')) { if (mode.veo === 'throw') boom(); return Response.json({ name: 'operations/veo-' + sent.length }); }
  if (u.includes('/v1/video_generation')) { if (mode.minimax === 'throw') boom(); return Response.json({ task_id: 'mm-' + sent.length, base_resp: { status_code: 0 } }); }
  if (u.includes('gemini-3-pro-image')) { if (mode.image === 'throw') { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; } return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'R1JPVVA=' } }] } }] }); }
  return Response.json({}, { status: 404 });
};

async function call(handler, body, query) {
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, send(v) { this.body = v; return this; }, end() { return this; } };
  await handler({ method: 'POST', query: query || {}, body }, res);
  // حجز حصّة اليوم (v-atomic-quota) يُردّ قبل خروج الردّ — الردّ نفسه قد يتأجّل دورة.
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
  return res;
}
const rw = (u, extra) => call(runway, Object.assign({ token: token(u), promptText: 'قطّة تلعب على الشاطئ', confirmed: true }, extra || {}));
const vo = (u, extra) => call(veo, Object.assign({ token: token(u), promptText: 'غروب فوق البحر', confirmed: true }, extra || {}));
const vp = (u, extra) => call(veo, Object.assign({ token: token(u), promptText: 'talking character' }, extra || {}), { action: 'veo-price' }); // v-talkchar-confirm
const mm = (u, extra) => call(minimax, Object.assign({ token: token(u), promptText: 'قطّة تلعب على الشاطئ', confirmed: true }, extra || {}));
function reset() { Object.assign(mode, { runway: 'ok', veo: 'ok', minimax: 'ok', image: 'ok' }); process.env.RUNWAY_API_KEY = 'rw-test'; process.env.MINIMAX_API_KEY = 'mm-test'; }

test('١. «فيديو بالذكاء» بلا مفتاح: لا نقطة تذهب ولا قفل ولا اسم مزوّد — والمحاولة التالية لا تُصدّ بالمهلة', async () => {
  reset(); user('rw-nokey', 500);
  delete process.env.RUNWAY_API_KEY;
  const r = await rw('rw-nokey');
  assert.equal(r.code, 500);
  assert.equal(bal('rw-nokey'), 500, 'النقاط احترقت: ' + bal('rw-nokey'));
  assert.equal(locked('rw-nokey'), false, 'قفل الثلاث دقائق بقي');
  assert.equal(tally('rw-nokey'), 0, 'حصّة اليوم أُكلت');
  assert.doesNotMatch(String(r.body.error), LEAK_RE, r.body.error);
  process.env.RUNWAY_API_KEY = 'rw-test';
  const again = await rw('rw-nokey');
  assert.equal(again.code, 200, 'المحاولة التالية: ' + JSON.stringify(again.body));
  assert.equal(bal('rw-nokey'), 500 - points.COSTS.runway_video, 'خصم واحد للفيديو الذي بدأ');
});

test('٢. «فيديو بالذكاء»: انقطاع/مهلة عند نداء الإنشاء ← النقاط تعود والقفل يُفكّ وحصّة اليوم ترجع، بلا نصّ تقنيّ', async () => {
  reset(); user('rw-throw', 500);
  mode.runway = 'throw';
  const r = await rw('rw-throw');
  assert.equal(r.code, 500);
  assert.equal(bal('rw-throw'), 500, 'النقاط احترقت: ' + bal('rw-throw'));
  assert.equal(locked('rw-throw'), false, 'قفل الثلاث دقائق بقي');
  assert.equal(tally('rw-throw'), 0);
  assert.doesNotMatch(String(r.body.error), LEAK_RE, r.body.error);
  mode.runway = 'ok';
  assert.equal((await rw('rw-throw')).code, 200, 'إعادة المحاولة لا تُصدّ بـvideo_cooldown');
});

test('٣. المحرّك الناطق (Veo): انقطاع عند الإنشاء، وتعطّل إطار المجموعة في ترند الشخصين ← ردّ كامل وفكّ القفل', async () => {
  reset(); user('veo-throw', 500);
  mode.veo = 'throw';
  const r = await vo('veo-throw');
  assert.equal(r.code, 500);
  assert.equal(bal('veo-throw'), 500, 'النقاط احترقت: ' + bal('veo-throw'));
  assert.equal(locked('veo-throw'), false, 'قفل الثلاث دقائق بقي');
  assert.doesNotMatch(String(r.body.error), LEAK_RE, r.body.error);

  reset(); user('veo-group', 500);
  mode.image = 'throw';
  const g = await vo('veo-group', { promptText: undefined, trend: 'heritagesing', params: { text: 'يا هلا', people: 2 }, imageBase64: 'AAAA', imageMime: 'image/png', imagesBase64: ['AAAA', 'BBBB'], imagesMime: ['image/png', 'image/png'] });
  assert.notEqual(g.code, 200);
  assert.equal(bal('veo-group'), 500, 'النقاط احترقت: ' + bal('veo-group'));
  assert.equal(locked('veo-group'), false, 'قفل الثلاث دقائق بقي');
  assert.doesNotMatch(String(g.body.error), LEAK_RE, g.body.error);
});

test('٤. المحرّك الاقتصاديّ: بلا مفتاح لا خصم أصلًا ولا اسم مزوّد؛ والانقطاع عند الإنشاء يردّ ويفكّ', async () => {
  reset(); user('mm-nokey', 500);
  delete process.env.MINIMAX_API_KEY;
  const n = await mm('mm-nokey');
  assert.equal(n.code, 500);
  assert.equal(bal('mm-nokey'), 500);
  assert.equal(locked('mm-nokey'), false);
  assert.doesNotMatch(String(n.body.error), LEAK_RE, n.body.error);

  reset(); user('mm-throw', 500);
  mode.minimax = 'throw';
  const r = await mm('mm-throw');
  assert.equal(r.code, 500);
  assert.equal(bal('mm-throw'), 500, 'النقاط احترقت: ' + bal('mm-throw'));
  assert.equal(locked('mm-throw'), false, 'قفل الثلاث دقائق بقي');
  assert.doesNotMatch(String(r.body.error), LEAK_RE, r.body.error);
});

test('٥. النجاح والمهلة كما كانا حرفيًّا: خصم واحد وقفل وتذكرة؛ والثاني فورًا ٤٢٩ بالمتبقّي بلا خصم ثانٍ', async () => {
  for (const [name, fn, cost, idOf] of [
    ['runway', rw, points.COSTS.runway_video, (b) => b.id],
    ['veo', vo, points.COSTS.veo_video, (b) => b.op],
    ['minimax', mm, points.COSTS.minimax_video, (b) => b.task_id],
  ]) {
    reset(); const u = 'ok-' + name; user(u, 1000);
    const ok = await fn(u);
    assert.equal(ok.code, 200, name + ': ' + JSON.stringify(ok.body));
    assert.ok(idOf(ok.body), name + ': معرّف المهمّة');
    assert.equal(bal(u), 1000 - cost, name + ': خصم واحد');
    assert.equal(locked(u), true, name + ': المهلة بدأت');
    assert.ok(kv.has(require(rp('api/_lib/video-job.js')).ticketKey(idOf(ok.body))), name + ': تذكرة التسوية');
    const cd = await fn(u);
    assert.equal(cd.code, 429, name);
    assert.equal(cd.body.error, 'video_cooldown');
    assert.ok(cd.body.retryAfter >= 1 && cd.body.retryAfter <= 180, name + ': المتبقّي ' + cd.body.retryAfter);
    assert.equal(bal(u), 1000 - cost, name + ': المهلة لا تخصم');
    assert.equal(locked(u), true, name + ': المهلة لا تفكّ قفل الفيديو الجاري');
  }
});

// v-refund-kind (مراجعة باب المال ١٦ أكتوبر): الاسترجاع كان يُطابَق بالمبلغ وحده، وتذكرة صلاحيّة الباقة لا تُمحى عند نجاح الفيديو —
// فمشترك Pro صرف صلاحيّتيه (فيديوان نجحا) ثمّ دفع الثالث نقاطًا وتعطّل: ردّه يطابق تذكرة قديمة بالمبلغ نفسه فيعيد صلاحيّة لم تُصرف له
// ويترك ٤٠ نقطة مخصومة (الشيء نفسه للتسوية عند الاستطلاع). الآن الردّ يعود إلى نوع الخصم نفسه (نتيجة spendPoints).
test('٦. الردّ بنوع الخصم: فيديو مدفوع نقاطًا بعد نفاد الصلاحيّة يعيد نقاطه لا صلاحيّة قديمة؛ وفيديو الصلاحيّة يعيد صلاحيّته', async () => {
  const pv = require(rp('api/_lib/_planVideos.js'));
  const job = require(rp('api/_lib/video-job.js'));
  const MM = points.COSTS.minimax_video;
  const pro = (u) => { user(u, 1000); users.set(u, Object.assign(users.get(u), { plan: 'pro', planUpdatedAt: Date.now() - 3 * DAY })); };
  const unlock = (u) => kv.delete('abuse:video:' + u);
  const left = async (u) => (await pv.planVideoStatus(u)).left;

  reset(); pro('pro-a');
  assert.equal((await mm('pro-a')).code, 200); unlock('pro-a');
  assert.equal((await mm('pro-a')).code, 200); unlock('pro-a');
  assert.equal(await left('pro-a'), 0, 'الصلاحيّتان صُرفتا');
  assert.equal(bal('pro-a'), 1000, 'الصلاحيّة لا تخصم نقاطًا');
  mode.minimax = 'throw';
  const r = await mm('pro-a');
  assert.equal(r.code, 500);
  assert.equal(bal('pro-a'), 1000, 'النقاط عادت: ' + bal('pro-a'));
  assert.equal(await left('pro-a'), 0, 'لا صلاحيّة هديّة من تذكرة قديمة');
  assert.equal(locked('pro-a'), false);

  // التسوية عند الاستطلاع: المهمّة المدفوعة نقاطًا تُردّ نقاطًا رغم تذاكر الصلاحيّة الباقية.
  mode.minimax = 'ok';
  const paid = await mm('pro-a');
  assert.equal(paid.code, 200);
  assert.equal(bal('pro-a'), 1000 - MM);
  const s = await job.settleVideoJob(paid.body.task_id, false);
  assert.equal(s && s.refunded, true);
  assert.equal(bal('pro-a'), 1000, 'التسوية ردّت النقاط');
  assert.equal(await left('pro-a'), 0, 'والصلاحيّة كما هي');

  // فيديو الصلاحيّة نفسه يتعطّل: تعود الصلاحيّة لا النقاط.
  reset(); pro('pro-b');
  mode.minimax = 'throw';
  assert.equal((await mm('pro-b')).code, 500);
  assert.equal(await left('pro-b'), 2, 'الصلاحيّة عادت');
  assert.equal(bal('pro-b'), 1000, 'بلا نقاط هديّة');

  // تذكرة مهمّة قديمة (قبل هذا الإصلاح، بلا k) تبقى على المطابقة بالمبلغ كما كانت.
  reset(); pro('pro-c');
  const okc = await mm('pro-c');
  assert.equal(await left('pro-c'), 1);
  const tk = job.ticketKey(okc.body.task_id);
  const old = JSON.parse(kv.get(tk)); assert.equal(old.k, 'v', 'نوع الخصم في التذكرة'); delete old.k; kv.set(tk, JSON.stringify(old));
  await job.settleVideoJob(okc.body.task_id, false);
  assert.equal(await left('pro-c'), 2, 'المطابقة بالمبلغ للتذكرة القديمة');
});

// v-talkchar-confirm (مراجعة باب المال): سؤال السعر قبل الكرتنة على المعالج وabuse-guard الحقيقيّين — قراءة فقط.
test('٧. veo-price: المهلة والرصيد قبل السؤال، والسعر يشمل الكرتون؛ لا خصم ولا قفل ولا نداء مزوّد', async () => {
  const guard = require(rp('api/_lib/abuse-guard.js'));
  reset(); user('pc-a', 1000);
  assert.equal(await guard.videoCooldownLeft('pc-a'), 0, 'لا قفل = ٠');
  const before = sent.length;
  const q = await vp('pc-a', { withCartoon: true });
  assert.equal(q.code, 428);
  assert.equal(q.body.cost, points.COSTS.veo_video + points.COSTS.image_creative, 'الكرتنة إبداعيّة: ٢٠ ثمّ فرق ١٥');
  const ok = await vp('pc-a', { withCartoon: true, confirmed: true });
  assert.equal(ok.code, 200);
  assert.equal(sent.length, before, 'لا نداء مزوّد');
  assert.equal(bal('pc-a'), 1000);
  assert.equal(locked('pc-a'), false);
  assert.equal((await vo('pc-a')).code, 200, 'الفيديو نفسه');
  const left = await guard.videoCooldownLeft('pc-a');
  assert.ok(left >= 1 && left <= guard.VIDEO_COOLDOWN_SEC, 'المتبقّي ' + left);
  const cd = await vp('pc-a', { withCartoon: true, confirmed: true });
  assert.equal(cd.code, 429);
  assert.equal(cd.body.error, 'video_cooldown');
  assert.equal(bal('pc-a'), 1000 - points.COSTS.veo_video, 'المهلة لا تخصم');
  user('pc-b', points.COSTS.veo_video); // يكفي الفيديو وحده لا الفيديو + الكرتون
  const lo = await vp('pc-b', { withCartoon: true, confirmed: true });
  assert.equal(lo.code, 402);
  assert.equal(lo.body.error, 'points_insufficient');
  assert.equal((await vp('pc-b', { confirmed: true })).code, 200, 'بلا كرتون يكفي');
  assert.equal(bal('pc-b'), points.COSTS.veo_video);
});

// v-refund-kind (مراجعة ٢): ردّ رصيد الاشتراك بالمبلغ جشعًا كان يعيد صورًا ناجحة أحدث بدل الفيديو المتعطّل، ويترك فلسه مخصومًا،
// ويردّ الفرق نقاطًا لم تُدفع. الآن الخانة نفسها من نتيجة الخصم (وتذكرة المهمّة pl).
test('٨. فيديو من رصيد الاشتراك يتعطّل عند الاستطلاع بعد صور أحدث: يعود فلسه إلى خانته بالضبط، والصور والنقاط كما هي', async () => {
  const job = require(rp('api/_lib/video-job.js'));
  reset(); user('med-a', 1000);
  users.set('med-a', Object.assign(users.get('med-a'), { media: { mix: { plan: 'media_pro', at: Date.now() - 3 * DAY } } }));
  kv.set('media:mix:med-a', '2500');
  const v = await vo('med-a');
  assert.equal(v.code, 200);
  assert.equal(Number(kv.get('media:mix:med-a')), 2060, 'الفيديو من الاشتراك (٤٤٠ فلسًا)');
  assert.equal(bal('med-a'), 1000);
  const t = JSON.parse(kv.get(job.ticketKey(v.body.op)));
  assert.equal(t.k, 'm'); assert.equal(t.pl, 'mix');
  for (let i = 0; i < 2; i++) assert.equal((await points.spendPoints('med-a', points.COSTS.image, 'image')).media, 'image');
  assert.equal(Number(kv.get('media:mix:med-a')), 1960);
  await job.settleVideoJob(v.body.op, false);
  assert.equal(Number(kv.get('media:mix:med-a')), 2400, 'فلس الفيديو وحده عاد: ' + kv.get('media:mix:med-a'));
  assert.equal(bal('med-a'), 1000, 'بلا نقاط هديّة');
});
