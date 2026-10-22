// tests/money-gaps.test.cjs — ثغرات الفلوس الأربع (أمر المالك ٢١ أكتوبر، إصلاحات مسموحة في التجميد):
// ٤) «فيديو يسكّره المستخدم قبل ما يخلص: الخادم يرجّع نقاطه إذا ما انسلم الفيديو.» (v-video-sweep)
// ٥) «الطوابع والإعلان: المحاولة الفاشلة ما تنحسب من الحصة المجانية.» (v-quota-giveback)
// ٦) «عدّاد الصور بالساعة: ينقص لما ترجع النقاط.» (v-img-hour-giveback)
// ٧) «صورة مها اللي تطوّل أكثر من 300 ثانية: إذا ما وصلت، النقاط ترجع.» (v-img-deadline-refund)
// كلّها بالوحدات الحقيقيّة وتخزين مزيّف في الذاكرة — بلا شبكة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, 'api/_lib', f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

process.env.GEMINI_API_KEY = 'test-gemini'; process.env.OPENAI_API_KEY = 'test-openai';
process.env.IMAGE_UPSCALE = 'off'; process.env.IMAGE_CARDS = 'off';
delete process.env.IMAGE_FREE_FALLBACK; delete process.env.IMG_DIAG;

// تخزين واحد بعقد kv.js (JSON يُقرأ مفكوكًا)
const store = new Map();
const kv = {
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvGetJSON: async (k) => { if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return null; } },
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const n = Number(store.get(k) || 0) + 1; store.set(k, String(n)); return n; },
  kvIncrBy: async (k, by) => { const n = Number(store.get(k) || 0) + Number(by); store.set(k, String(n)); return n; },
  kvDecrBy: async (k, by) => { const n = Number(store.get(k) || 0) - Number(by); store.set(k, String(n)); return n; },
  kvExpire: async () => true,
  kvDel: async (k) => { store.delete(k); },
};
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('kv.js', kv);
const log = { refunds: [], custom: [] };
const PAY = { ok: true, owner: false, media: 'image', pool: 'img' };
stub('points.js', {
  COSTS: { image: 20, image_creative: 35, image_4k: 30 },
  verifyPointsToken: (t) => ({ sara: 'sara' })[t] || null,
  isOwnerUsername: () => false,
  spendPoints: async () => PAY,
  refundPoints: async (u, n, how) => { log.refunds.push([u, n, how]); },
});
stub('_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => null, checkAndConsume: async () => ({ allowed: true }),
  refundCustom: async (token, g, ip, bucket) => { log.custom.push([token, bucket]); },
});
stub('_planCap.js', { checkAndConsumePlanCustom: async () => ({ allowed: true, limit: 5 }) });
stub('_mediaPlans.js', { imageQuality: async () => null });
stub('tier.js', { resolveTier: async () => ({ tier: 'free' }) });
stub('log-error.js', { logErrorAndFlush: async () => {} });
stub('adtemplate.js', new Proxy({}, { get: () => () => '' }));

function resObj() {
  return { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end(s) { if (typeof s === 'string') { try { this.body = JSON.parse(s); } catch (e) { this.body = s; } } return this; } };
}
const quiet = async (fn) => { const e = console.error, w = console.warn, l = console.log; console.error = () => {}; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; console.log = l; } };

// ─────────── ٤ ───────────
test('٤. فيديو أُغلق قبل التسليم: قراءة الرصيد بعد نصف ساعة تردّ نقاطه بنوع خصمه مرّة واحدة، والمسلَّم لا يُردّ', async () => {
  const job = require(rp('video-job.js'));
  assert.equal(typeof job.sweepStaleVideoJobs, 'function', 'لا كنس للتذاكر المفتوحة — كانت تُسوّى من الاستطلاع وحده');
  store.clear(); log.refunds.length = 0;
  const T = Date.parse('2026-10-21T10:00:00Z');
  const deps = { kv, points: { refundPoints: async (u, n, how) => { log.refunds.push([u, n, how]); } }, guard: { releaseVideoLock: async () => {} }, usage: { releaseVideo: async () => {} } };
  await job.rememberVideoJob('op-closed', { username: 'sara', cost: 275, pay: { ok: true, media: 'video', pool: 'mix' } }, { kv, now: T });
  await job.rememberVideoJob('op-delivered', { username: 'sara', cost: 55, pay: { ok: true } }, { kv, now: T });
  await job.settleVideoJob('op-delivered', true, deps); // استطلاع رجع SUCCEEDED = سُلِّم
  let r = await job.sweepStaleVideoJobs('sara', Object.assign({ now: T + 10 * 60000 }, deps));
  assert.equal(r.refunded, 0, 'قبل نصف ساعة قد يكون ما زال يُنتظر');
  r = await job.sweepStaleVideoJobs('sara', Object.assign({ now: T + 31 * 60000 }, deps));
  assert.deepEqual([r.refunded, r.points], [1, 275]);
  assert.equal(log.refunds.length, 1);
  assert.deepEqual(log.refunds[0], ['sara', 275, { planVideo: false, media: true, pool: 'mix' }], 'إلى رصيد الاشتراك نفسه');
  r = await job.sweepStaleVideoJobs('sara', Object.assign({ now: T + 40 * 60000 }, deps));
  assert.equal(r.refunded, 0, 'مرّة واحدة');
  assert.equal(await job.settleVideoJob('op-closed', false, deps), null, 'استطلاع متأخّر لا يردّ ثانية');
  assert.equal(log.refunds.length, 1);
  assert.ok(job.TICKET_TTL_SEC >= 86400, 'التذكرة تنتظر عودة صاحبها (كانت ساعتين)');
  // قراءة الرصيد تكنس
  assert.match(read('api/_lib/points.js'), /await require\('\.\/video-job\.js'\)\.sweepStaleVideoJobs\(username\);/);
});

// ─────────── ٥ ───────────
async function tool(file, fetchImpl, body) {
  log.custom.length = 0;
  const save = global.fetch; global.fetch = fetchImpl;
  const res = resObj();
  try { delete require.cache[rp(file)]; await quiet(() => require(rp(file))({ method: 'POST', headers: {}, body: Object.assign({ token: 'sara' }, body) }, res)); } finally { global.fetch = save; }
  return { code: res.code, body: res.body, custom: log.custom.slice() };
}
const B64 = Buffer.alloc(300, 1).toString('base64');
test('٥. الطوابع والإعلان: كلّ محاولة فاشلة بعد حجز الحصّة تردّها مرّة واحدة، والناجحة تُحسب', async () => {
  const quota = async () => Response.json({ error: { message: 'You exceeded your current quota, please check your plan and billing details.' } }, { status: 429 });
  const boom = async () => Response.json({ error: { message: 'Internal server error' } }, { status: 500 });
  const empty = async () => Response.json({ data: [{}] });
  const net = async () => { throw new Error('fetch failed'); };
  const ok = async () => Response.json({ data: [{ b64_json: B64 }] });
  for (const [what, f] of [['نفاد الرصيد', quota], ['عطل المزوّد', boom], ['بلا صورة', empty], ['انقطاع', net]]) {
    const st = await tool('stamps.js', f, { imageBase64: B64, mimeType: 'image/png' });
    assert.ok(st.code >= 400, 'الطوابع ' + what);
    assert.deepEqual(st.custom, [['sara', 'stamps']], 'الطوابع ' + what + ': الحصّة رُدّت مرّة');
  }
  assert.deepEqual((await tool('stamps.js', ok, { imageBase64: B64, mimeType: 'image/png' })).custom, [], 'الناجحة تُحسب');
  for (const [what, f] of [['نفاد الرصيد', quota], ['عطل المزوّد', boom], ['انقطاع', net]]) {
    const ad = await tool('adimage.js', f, { title: 'عرض', imageBase64: B64, mimeType: 'image/png' });
    assert.ok(ad.code >= 400, 'الإعلان ' + what);
    assert.deepEqual(ad.custom, [['sara', 'adimage']], 'الإعلان ' + what + ': الحصّة رُدّت مرّة');
  }
});

// ─────────── ٦ و٧: صورة مها بالمعالج الحقيقيّ ───────────
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.';
async function image(fetchImpl, opt) {
  log.refunds.length = 0;
  const save = global.fetch; global.fetch = fetchImpl;
  const res = resObj();
  const run = quiet(() => require(rp('maha-image.js'))({ method: 'POST', headers: {}, body: { prompt: 'A red apple on a wooden table, soft daylight', userText: 'ارسم تفاحة حمراء', token: 'sara' } }, res));
  if (opt && opt.noWait) { await new Promise((r) => setTimeout(r, 300)); global.fetch = save; return { res, run }; }
  try { await run; } finally { global.fetch = save; }
  return { res };
}
const hourKey = () => [...store.keys()].find((k) => k.startsWith('abuse:img:'));

test('٦. عدّاد الصور بالساعة يُنقص حين تُردّ النقاط (المحاولة الفاشلة لا تأكل سقف العشرين)، ويبقى للناجحة', async () => {
  store.clear();
  const failed = await image(async () => Response.json({ error: { code: 429, message: DEPLETED } }, { status: 429 }));
  assert.ok(failed.res.code >= 400);
  assert.equal(log.refunds.length, 1, 'النقاط رُدّت');
  assert.ok(hourKey(), 'العدّاد زاد عند الخصم');
  assert.equal(Number(store.get(hourKey())), 0, 'وأُنقص عند الردّ — كان يبقى ١');
  const ag = require(rp('abuse-guard.js'));
  const g = await ag.imageHourlyGuard('nora', { kv, now: Date.now() });
  assert.equal(typeof g.bucket, 'number', 'الحارس يعيد خانة ساعته');
  assert.equal(await ag.imageHourlyGiveBack('nora', g.bucket, { kv }), true);
  assert.equal(Number(store.get('abuse:img:nora:' + g.bucket)), 0);
});

test('٧. صورة مها قُتلت دالّتها قبل الردّ (٣٠٠ث): التذكرة المفتوحة تُردّ بنوع خصمها عند قراءة الرصيد، مرّة واحدة؛ والمسلَّمة والمردودة مباشرة لا تُردّ', async () => {
  const hold = require(rp('image-hold.js'));
  assert.equal(typeof hold.openTicket, 'function', 'لا تذكرة خادم — الدالّة المقتولة لا تردّ شيئًا');
  const pointsSpy = { refundPoints: async (u, n, how) => { log.refunds.push([u, n, how]); } };
  // أ) المحرّك لا يردّ أبدًا والدالّة «تُقتل» (لا ننتظرها)
  store.clear();
  const hung = await image(() => new Promise(() => {}), { noWait: true });
  assert.equal(hung.res.code, 0, 'لم يُرسل ردّ');
  assert.equal(log.refunds.length, 0);
  let r = await hold.settleStale('sara', { kv, points: pointsSpy, now: Date.now() + 2 * 60000 });
  assert.equal(r.refunded, 0, 'الدالّة قد تكون ما زالت ترسم — لا ردّ قبل عمرها كلّه');
  r = await hold.settleStale('sara', { kv, points: pointsSpy, now: Date.now() + 7 * 60000 });
  assert.deepEqual([r.refunded, r.points], [1, 20], 'ما لم يصل رُدّ');
  assert.deepEqual(log.refunds[0], ['sara', 20, { planVideo: false, media: true, pool: 'img' }], 'إلى رصيد الاشتراك نفسه');
  r = await hold.settleStale('sara', { kv, points: pointsSpy, now: Date.now() + 9 * 60000 });
  assert.equal(r.refunded, 0, 'مرّة واحدة');
  // ب) فشل عاديّ: ردّ مباشر واحد، والكنس لا يردّ ثانية
  store.clear();
  await image(async () => Response.json({ error: { code: 429, message: DEPLETED } }, { status: 429 }));
  assert.equal(log.refunds.length, 1);
  r = await hold.settleStale('sara', { kv, points: pointsSpy, now: Date.now() + 7 * 60000 });
  assert.equal(r.refunded, 0, 'لا ردّ مزدوج');
  // ج) تسليم: لا ردّ
  store.clear();
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc0000001549444154789c63f8ffff3f0305a3f81f0e0058be0ffe8a2a39a10000000049454e44ae426082', 'hex').toString('base64');
  const done = await image(async (url) => (String(url).includes('openai')
    ? Response.json({ data: [{ b64_json: PNG }] })
    : Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG } }] }, finishReason: 'STOP' }] })));
  assert.equal(done.res.code, 200, JSON.stringify(done.res.body).slice(0, 200));
  assert.equal(log.refunds.length, 0);
  r = await hold.settleStale('sara', { kv, points: pointsSpy, now: Date.now() + 7 * 60000 });
  assert.equal(r.refunded, 0, 'الصورة وصلت — لا ردّ');
});
