// tests/video-refund.test.cjs — v-video-refund: الفيديو الذي يفشل **بعد** قبول المزوّد لا
// يكلّف المستخدم شيئًا. الجذر: قفل الثلاث دقائق وخصم النقاط كانا يُفكّان عند الفشل المتزامن
// وحده؛ والمحرّكات غير المتزامنة (Runway · Veo · الاقتصاديّ) تفشل عند الاستطلاع (فلتر أمان
// غالبًا) فيخسر مشترك الفيديو واحدًا من فيديوهاته القليلة ثمّ يرى «video_cooldown» عند
// المحاولة التالية. يثبّت: التذكرة، والتسوية مرّة واحدة، وتوصيل المسارات الستّة، ونصّ الواجهة.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const job = require('../api/_lib/video-job.js');

function fakeKv() {
  const m = new Map();
  return {
    m,
    kvSetRaw: async (k, v) => { m.set(k, String(v)); },
    kvGetJSON: async (k) => { const v = m.get(k); if (v === undefined) return null; try { return JSON.parse(v); } catch (e) { return null; } },
    kvSetIfAbsent: async (k, v) => { if (m.has(k)) return false; m.set(k, String(v)); return true; },
    kvDel: async (k) => { m.delete(k); },
  };
}
function fakeDeps() {
  const log = { refunds: [], unlocks: [], quotas: [] };
  return {
    log,
    points: { refundPoints: async (u, n) => { log.refunds.push([u, n]); } },
    guard: { releaseVideoLock: async (u) => { log.unlocks.push(u); } },
    usage: { releaseVideo: async (u) => { log.quotas.push(u); } },
  };
}

test('١. التذكرة تُسجَّل لمن خُصم منه وحده، والمالك (بلا خصم) بلا تذكرة', async () => {
  const kv = fakeKv();
  assert.equal(await job.rememberVideoJob('op/123', { username: 'sara', cost: 275, locked: true }, { kv }), true);
  assert.equal(kv.m.size, 1);
  const stored = JSON.parse([...kv.m.values()][0]);
  assert.deepEqual(stored, { u: 'sara', c: 275, l: true, q: false });
  // المالك: chargedUser = null ⇒ لا تذكرة. وكذلك تكلفة صفر أو معرّف فارغ.
  assert.equal(await job.rememberVideoJob('op/9', { username: null, cost: 275 }, { kv }), false);
  assert.equal(await job.rememberVideoJob('op/9', { username: 'sara', cost: 0 }, { kv }), false);
  assert.equal(await job.rememberVideoJob('', { username: 'sara', cost: 275 }, { kv }), false);
  assert.equal(kv.m.size, 1, 'لا مفتاح زائد');
});

test('٢. الفشل يردّ الخصم ويفكّ القفل ويعيد حصّة اليوم — والنجاح لا يردّ شيئًا', async () => {
  const kv = fakeKv(); const d = fakeDeps();
  await job.rememberVideoJob('op/A', { username: 'sara', cost: 275, locked: true }, { kv });
  const out = await job.settleVideoJob('op/A', false, { kv, points: d.points, guard: d.guard, usage: d.usage });
  assert.deepEqual([out.settled, out.refunded, out.username, out.cost], [true, true, 'sara', 275]);
  assert.deepEqual(d.log.refunds, [['sara', 275]]);
  assert.deepEqual(d.log.unlocks, ['sara']);
  assert.deepEqual(d.log.quotas, [], 'Veo/الاقتصاديّ بلا حصّة يوميّة');

  const kv2 = fakeKv(); const d2 = fakeDeps();
  await job.rememberVideoJob('1:task', { username: 'sara', cost: 55, locked: true, quota: true }, { kv: kv2 });
  await job.settleVideoJob('1:task', false, { kv: kv2, points: d2.points, guard: d2.guard, usage: d2.usage });
  assert.deepEqual(d2.log.quotas, ['sara'], 'Runway يعيد حصّة اليوم أيضًا');

  const kv3 = fakeKv(); const d3 = fakeDeps();
  await job.rememberVideoJob('op/B', { username: 'sara', cost: 275, locked: true }, { kv: kv3 });
  const ok = await job.settleVideoJob('op/B', true, { kv: kv3, points: d3.points, guard: d3.guard, usage: d3.usage });
  assert.deepEqual([ok.settled, ok.refunded], [true, false]);
  assert.deepEqual([d3.log.refunds, d3.log.unlocks, d3.log.quotas], [[], [], []]);
});

test('٣. التسوية مرّة واحدة: استطلاعان متزامنان لا يردّان مرّتين، ولا تسوية بلا تذكرة', async () => {
  const kv = fakeKv(); const d = fakeDeps();
  await job.rememberVideoJob('op/C', { username: 'sara', cost: 275, locked: true }, { kv });
  const dep = { kv, points: d.points, guard: d.guard, usage: d.usage };
  const [a, b] = await Promise.all([job.settleVideoJob('op/C', false, dep), job.settleVideoJob('op/C', false, dep)]);
  assert.equal([a, b].filter(Boolean).length, 1, 'واحد فقط يسوّي');
  assert.deepEqual(d.log.refunds, [['sara', 275]], 'ردّ واحد لا اثنان');
  // نداء ثالث بعد الانتهاء، ومهمّة بلا تذكرة أصلًا (مالك أو تذكرة سقطت بالمهلة)
  assert.equal(await job.settleVideoJob('op/C', false, dep), null);
  assert.equal(await job.settleVideoJob('op/unknown', false, dep), null);
  assert.equal(await job.settleVideoJob('', false, dep), null);
  assert.deepEqual(d.log.refunds, [['sara', 275]]);
});

test('٤. تخزين معطّل = لا تسوية ولا انفجار (سلوك ما قبل الإصلاح بالضبط)', async () => {
  const dead = { kvGetJSON: async () => null, kvSetRaw: async () => { throw new Error('redis down'); }, kvSetIfAbsent: async () => { throw new Error('redis down'); }, kvDel: async () => {} };
  const d = fakeDeps();
  assert.equal(await job.rememberVideoJob('op/D', { username: 'sara', cost: 275 }, { kv: dead }), false);
  assert.equal(await job.settleVideoJob('op/D', false, { kv: dead, points: d.points, guard: d.guard, usage: d.usage }), null);
  assert.deepEqual(d.log.refunds, []);
});

test('٥. التوصيل: المحرّكات الثلاثة تسجّل التذكرة عند القبول', () => {
  const veo = read('api/_lib/veo-create.js');
  assert.match(veo, /rememberVideoJob\(data\.name, \{ username: chargedUser, cost: pointsLib\.COSTS\.veo_video, locked: !!videoLocked \}\)/);
  assert.ok(veo.indexOf('rememberVideoJob') < veo.indexOf("res.status(200).json({ op: data.name })"), 'قبل الردّ');
  const mm = read('api/_lib/minimax-create.js');
  assert.match(mm, /rememberVideoJob\(data\.task_id, \{ username: chargedUser, cost: pointsLib\.COSTS\.minimax_video, locked: !!videoLocked \}\)/);
  const rw = read('api/_lib/video-create.js');
  assert.match(rw, /rememberVideoJob\(clientTaskId, \{ username: chargedUser, cost: pointsLib\.COSTS\.runway_video, locked: !!videoLocked, quota: longMode !== true \}\)/);
  assert.match(rw, /res\.status\(200\)\.json\(\{ id: clientTaskId, remaining \}\)/);
});

test('٦. التوصيل: نقاط الحالة الثلاث تسوّي عند الانتهاء — والفشل الصامت عند Veo منها', async () => {
  const veo = read('api/_lib/veo-status.js');
  assert.ok(veo.includes("const settle = (ok) => require('./video-job.js').settleVideoJob(op, ok);"));
  assert.equal((veo.match(/await settle\(false\)/g) || []).length, 2, 'خطأ العمليّة + اكتمال بلا فيديو (فلتر الأمان)');
  assert.equal((veo.match(/await settle\(true\)/g) || []).length, 1);
  const mm = read('api/_lib/minimax-status.js');
  assert.match(mm, /settleVideoJob\(taskId, false\)/);
  assert.match(mm, /settleVideoJob\(taskId, true\)/);
  const rw = read('api/_lib/video-status.js');
  assert.match(rw, /if \(st === 'FAILED' \|\| st === 'CANCELLED'\) await require\('\.\/video-job\.js'\)\.settleVideoJob\(id, false\);/);
  assert.match(rw, /else if \(st === 'SUCCEEDED'\) await require\('\.\/video-job\.js'\)\.settleVideoJob\(id, true\);/);

  // نقطة حالة Veo فعليًّا: اكتمال بلا فيديو = FAILED (المسار الذي كان يحرق فيديو المشترك).
  process.env.GEMINI_API_KEY = 'test-key';
  const handler = require('../api/_lib/veo-status.js');
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ done: true, response: { raiMediaFilteredReasons: ['blocked'] } }) });
  const res = { headers: {}, code: 0, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  await handler({ method: 'GET', query: { op: 'models/veo/operations/X' } }, res);
  global.fetch = realFetch;
  assert.equal(res.body.status, 'FAILED');
  assert.match(res.body.failure, /filtered: blocked/);
});

test('٧. حصّة اليوم تُعاد لليوم نفسه فقط ولا تنزل تحت الصفر', () => {
  const u = read('api/_lib/_videoUsage.js');
  assert.match(u, /async function releaseVideo\(username\)/);
  assert.match(u, /if \(!usage \|\| usage\.date !== today \|\| !\(usage\.count > 0\)\) return;/);
  assert.match(u, /module\.exports = \{ checkVideoQuota, consumeVideo, releaseVideo,/);
});

test('٨. الواجهة: رمز video_cooldown الخام لا يظهر — رسالة بالدقائق في الـ14 لغة', () => {
  const data = read('js/app-11-video-trends-data.js');
  const ctx = { window: {} };
  vm.runInNewContext(data, ctx);
  const ui = ctx.window.__VIDEO_TRENDS.ui;
  const langs = Object.keys(ui.fail);
  assert.equal(langs.length, 14);
  for (const l of langs) {
    assert.ok(ui.cooldown && ui.cooldown[l], 'ناقصة: ' + l);
    assert.ok(ui.cooldown[l].includes('{m}'), 'بلا {m}: ' + l);
    assert.ok(!/veo|runway|minimax|gemini|claude/i.test(ui.cooldown[l]), 'اسم مزوّد في نصّ المستخدم: ' + l);
  }

  // errText الحقيقيّة: الرمز يصير دقائق، وغيره يبقى كما كان.
  const src = read('js/app-11-video-trends.js');
  const i = src.indexOf('function errText(e){');
  const j = src.indexOf('async function make(t){', i);
  assert.ok(i > 0 && j > i);
  const sandbox = { ui: (k) => (k === 'cooldown' ? ui.cooldown.ar : ui.fail.ar) };
  vm.runInNewContext(src.slice(i, j) + '\nthis.errText = errText;', sandbox);
  assert.equal(sandbox.errText({ code: 'video_cooldown', retryAfter: 180 }), ui.cooldown.ar.replace('{m}', '3'));
  assert.equal(sandbox.errText({ code: 'video_cooldown', retryAfter: 40 }), ui.cooldown.ar.replace('{m}', '1'));
  assert.equal(sandbox.errText({ code: 'video_cooldown' }), ui.cooldown.ar.replace('{m}', '3'), 'بلا retryAfter = المهلة الكاملة');
  assert.equal(sandbox.errText(new Error('boom')), ui.fail.ar + ': boom');
  assert.match(src, /code: \(j && j\.error\) \|\| '', retryAfter: \(j && j\.retryAfter\) \|\| 0/, 'الرمز والمهلة يصلان من الخادم');

  // صانع الفيديو الرئيسيّ: رسالة مفهومة، وبلا إعادة محاولة عمياء على مهلة الثلاث دقائق.
  const v = read('js/app-11-video.js');
  assert.match(v, /if\(code === 'video_cooldown'\)\{/);
  assert.match(v, /if\(e && e\.code === 'video_cooldown'\) throw e;/);
  assert.match(v, /retryAfter: data\.retryAfter \|\| 0/);
});

test('٩. الحزمة مبنيّة من الأجزاء (لا تحرير يدويّ)', () => {
  const b = read('js/app.bundle.js');
  assert.ok(b.includes('function errText(e){'), 'جزء الترندات داخل الحزمة');
  assert.ok(b.includes("if(code === 'video_cooldown'){"), 'جزء صانع الفيديو داخل الحزمة');
});
