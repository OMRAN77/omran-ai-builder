// tests/owner-problems.test.cjs — v-owner-problems (المالك ٩ نوفمبر: «واحد من المستخدمين يقول سويت فيديو وماحصلته… اريد كل المشاكل الي في
// التطبيق توصلي على الايميل»). قبل القرار: الفيديو المدفوع الذي فشل عند المزوّد أو لم يُسلَّم يُردّ خصمه بصمت (سطر في سجلّ Vercel)، وخطأ
// الخادم في أيّ أداة أمام مستخدم لا يصل المالك إلّا Push عامًّا بلا اسم المستخدم ولا طلبه، ولا إيميل لأيّ منهما.
// بعده: بلاغ «فشل أداة» في صندوق المالك بالاسم والأداة والطلب والسبب، Push وإيميل فوريّ (بسقف يوميّ)، والإيميل اليوميّ يحمل أخطاء الخادم الجديدة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'owner-problems-secret';
process.env.GEMINI_API_KEY = 'test-key';
for (const k of ['OWNER_USERNAMES', 'OWNER_NOTIFY_EMAIL', 'RESEND_API_KEY', 'OWNER_MAIL_DAY_CAP', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SENTRY_DSN']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };

const db = new Map();
const kv = {
  kvGetJSON: async (k) => { if (!db.has(k)) return null; const v = db.get(k); return typeof v === 'string' ? JSON.parse(v) : structuredClone(v); }, kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async (k) => (db.has(k) ? db.get(k) : null), kvSetRaw: async (k, v) => { db.set(k, v); },
  kvIncr: async (k) => { const n = (Number(db.get(k)) || 0) + 1; db.set(k, n); return n; }, kvIncrBy: async () => 1, kvDecrBy: async () => 0,
  kvSetIfAbsent: async (k, v) => { if (db.has(k)) return false; db.set(k, v); return true; }, kvList: async () => [],
  kvPipeline: async (cmds) => cmds.map((c) => (c[0] === 'HGETALL' ? [] : null)),
};
stub('api/_lib/kv.js', kv);
const pushes = [];
stub('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { pushes.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), alertOwnerMedia: async () => ({}), isCreditFailure: () => false });
const refunds = [];
stub('api/_lib/points.js', { refundPoints: async (u, c) => { refunds.push([u, c]); }, COSTS: { veo_video: 30, minimax_video: 20, runway_video: 25 } });
stub('api/_lib/abuse-guard.js', { releaseVideoLock: async () => {} });
stub('api/_lib/_videoUsage.js', { releaseVideo: async () => {} });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};

const IB = require(rp('api/_lib/owner-inbox.js'));
const job = require(rp('api/_lib/video-job.js'));
const errors = require(rp('api/_lib/_errors.js'));

// الوعود التي تكمل «بعد الردّ» (waitUntil المنصّة) تُجمع هنا وتُنتظر
const bg = [];
IB._seam.waitUntil = (p) => { bg.push(p); };
const settle = async () => { while (bg.length) await bg.shift(); };
const items = () => ((db.get(IB.LIST_KEY) || {}).items || []);
const reset = () => { db.clear(); pushes.length = 0; refunds.length = 0; bg.length = 0; };

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}

test('١ — فيديو Veo مدفوع اكتمل بلا ناتج (فلتر الأمان) عبر المعالج الحقيقيّ: الخصم يُردّ وبلاغ «فشل أداة» بالاسم والمحرّك والسبب وPush', async () => {
  reset();
  const op = 'models/veo-3/operations/abc';
  assert.equal(await job.rememberVideoJob(op, { username: 'sara', cost: 30, locked: false }), true);
  const handler = require(rp('api/_lib/veo-status.js'));
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ done: true, response: { raiMediaFilteredReasons: ['person generation blocked'] } }) });
  const res = { setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  try { await handler({ method: 'GET', query: { op } }, res); } finally { global.fetch = realFetch; }
  await settle();
  assert.equal(res.body.status, 'FAILED', 'المستخدم يرى الفشل كما كان');
  assert.deepEqual(refunds, [['sara', 30]], 'الخصم رُدّ كما كان');
  const list = items();
  assert.equal(list.length, 1, 'بلاغ واحد: ' + JSON.stringify(list));
  assert.equal(list[0].kind, 'tool'); assert.equal(list[0].user, 'sara'); assert.equal(list[0].via, 'tool');
  assert.equal(list[0].prov, 'video/veo');
  assert.match(list[0].text, /فيديو لم يصل/);
  assert.match(list[0].detail, /filtered: person generation blocked/, 'السبب الحقيقيّ يصل المالك');
  assert.equal(pushes.length, 1); assert.match(pushes[0].title, /أداة فشلت/); assert.ok(pushes[0].body.includes('sara'));
  // استطلاع ثانٍ للمهمّة نفسها لا يردّ ولا يبلّغ مرّتين
  global.fetch = async () => ({ ok: true, json: async () => ({ done: true, response: { raiMediaFilteredReasons: ['x'] } }) });
  try { await handler({ method: 'GET', query: { op } }, res); } finally { global.fetch = realFetch; }
  await settle();
  assert.equal(items().length, 1); assert.equal(refunds.length, 1);
});

test('٢ — الفيديو الناجح لا بلاغ، والمالك (لا تذكرة له) لا بلاغ، وكنس ما لم يُسلَّم بعد ٣٠ دقيقة يبلّغ بسببه', async () => {
  reset();
  await job.rememberVideoJob('models/v/operations/ok', { username: 'sara', cost: 30 });
  await job.settleVideoJob('models/v/operations/ok', true);
  await settle();
  assert.equal(items().length, 0, 'النجاح لا بلاغ');
  assert.equal(await job.rememberVideoJob('models/v/operations/own', { username: 'omran', cost: 0 }), false, 'المالك بلا تذكرة');
  // الكنس: مهمّة Omni عمرها ساعة لم يستطلعها أحد (أغلق التطبيق)
  const t0 = Date.now() - 3600000;
  await job.rememberVideoJob('omni/xyz', { username: 'noor', cost: 30 }, { now: t0 });
  const out = await job.sweepStaleVideoJobs('noor');
  await settle();
  assert.equal(out.refunded, 1);
  const list = items();
  assert.equal(list.length, 1); assert.equal(list[0].user, 'noor'); assert.equal(list[0].prov, 'video/omni');
  assert.match(list[0].detail, /لم يُسلَّم خلال ٣٠ دقيقة/);
  assert.equal(job.videoEngine('bk/1'), 'fal-backup'); assert.equal(job.videoEngine('actor:9'), 'actor');
  assert.equal(job.videoEngine('12:uuid'), 'runway'); assert.equal(job.videoEngine('4455'), 'minimax');
});

function mkRes() {
  return { statusCode: 200, headersSent: false, body: null, setHeader() {}, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; this.end(JSON.stringify(o)); return this; }, end() { this.headersSent = true; this.ended = true; } };
}
async function call(route, req, fn) {
  const res = mkRes();
  await errors.withErrorCapture(route, fn)(Object.assign({ method: 'POST', headers: {}, query: {} }, req), res);
  await settle();
  return res;
}

test('٣ — أيّ موجّه: ردّ 5xx أو رفض بدء فيديو أمام مستخدم = بلاغ بالأداة والطلب والسبب؛ المالك والنجاح وحدّ المستخدم والاستطلاع لا', async () => {
  reset();
  const r1 = await call('media', { query: { action: 'studio-create' }, body: { token: token('sara'), prompt: 'صورة لي بثوب أبيض' } },
    async (req, res) => { res.status(503).json({ error: 'unavailable', retryable: false }); });
  assert.equal(r1.statusCode, 503); assert.deepEqual(r1.body, { error: 'unavailable', retryable: false }, 'الردّ نفسه لم يتغيّر');
  let list = items();
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, 'tool'); assert.equal(list[0].user, 'sara'); assert.equal(list[0].prov, 'media?studio-create');
  assert.equal(list[0].text, 'صورة لي بثوب أبيض'); assert.equal(list[0].detail, 'HTTP 503 · unavailable');
  // رفض بدء الفيديو (4xx برمزه) بلاغ أيضًا
  await call('video', { query: { action: 'veo-create' }, body: { token: token('noor'), prompt: 'دخلة سلو موشن' } },
    async (req, res) => { res.status(400).json({ error: 'video_rejected', message_ar: 'تعذّر بدء الفيديو بهذا الطلب', retryable: false }); });
  list = items();
  assert.equal(list.length, 2); assert.equal(list[1].user, 'noor'); assert.match(list[1].detail, /HTTP 400 · video_rejected · تعذّر بدء الفيديو/);
  // خطأ مرميّ داخل المعالج = 500 أمام المستخدم = بلاغ (وسجلّ الخادم كما كان)
  await call('tools', { query: { action: 'office' }, headers: { authorization: 'Bearer ' + token('ali') }, body: { text: 'سوّ لي بوربوينت' } },
    async () => { throw new Error('boom inside tool'); });
  list = items();
  assert.equal(list.length, 3); assert.equal(list[2].user, 'ali'); assert.equal(list[2].prov, 'tools?office'); assert.match(list[2].detail, /HTTP 500/);
  // زائر بمعرّفه = اسم مستعار لا المعرّف
  await call('media', { query: { action: 'x' }, body: { guestId: 'g-123', prompt: 'p' } }, async (req, res) => { res.status(502).json({ error: 'failed' }); });
  list = items();
  assert.equal(list.length, 4); assert.match(list[3].user, /^زائر-[0-9a-f]{6}$/); assert.ok(!JSON.stringify(list[3]).includes('g-123'));
  // لا بلاغ: المالك، النجاح، حدّ المستخدم (429/402/401)، استطلاع الفيديو، بلا مستخدم، Telegram
  const none = [
    ['media', { body: { token: token('omran'), prompt: 'p' } }, 500, { error: 'x' }],
    ['media', { body: { token: token('sara'), prompt: 'p' } }, 200, { ok: true }],
    ['video', { query: { action: 'veo-create' }, body: { token: token('sara') } }, 429, { error: 'video_cooldown', retryAfter: 60 }],
    ['media', { body: { token: token('sara') } }, 402, { error: 'plan_required' }],
    ['video', { query: { action: 'veo-status' }, body: { token: token('sara') } }, 500, { error: 'تعذّر متابعة الفيديو الآن.' }],
    ['media', { body: { prompt: 'بلا جلسة' } }, 500, { error: 'x' }],
    ['telegram', { body: { token: token('sara') } }, 500, { error: 'x' }],
  ];
  for (const [route, req, code, body] of none) await call(route, req, async (rq, res) => { res.status(code).json(body); });
  assert.equal(items().length, 4, 'لا بلاغ لغير المشاكل: ' + JSON.stringify(items().slice(4)));
});

test('٤ — الإيميل الفوريّ: كلّ بلاغ يدفع Push يصل إيميلًا (مرّة لكلّ مستخدم ونوع في الساعة) بسقف يوميّ، وبلا إعداد لا شيء', async () => {
  reset();
  const mails = [];
  const env = { OWNER_NOTIFY_EMAIL: 'owner@example.com', RESEND_API_KEY: 'k', OWNER_MAIL_DAY_CAP: '2' };
  const o = (now) => ({ kv, env, now, push: async () => ({}), sendMail: async (to, subject, html) => { mails.push({ to, subject, html }); return true; } });
  const a = await IB.noteTool({ user: 'sara', tool: 'video/veo', text: 'فيديو لم يصل للمستخدم — رُدّ له الخصم (30)', detail: 'filtered: <blocked> & co' }, o(1000));
  assert.equal(a.mailed, 'sent');
  assert.equal(mails.length, 1); assert.equal(mails[0].to, 'owner@example.com');
  assert.match(mails[0].subject, /فشل أداة أمامه — sara · video\/veo/);
  assert.ok(mails[0].html.includes('filtered: &lt;blocked&gt; &amp; co'), 'السبب مهرَّب');
  assert.ok(mails[0].html.includes('إيميل فوريّ 1 من 2'));
  const b = await IB.noteTool({ user: 'sara', tool: 'media?x', text: 'ثانٍ', detail: 'HTTP 503' }, o(2000));
  assert.equal(b.saved, true); assert.equal(b.mailed, 'skip', 'نفس المستخدم والنوع خلال ساعة: يُحفظ ولا إيميل'); assert.equal(mails.length, 1);
  const c = await IB.record({ user: 'zayed', prov: 'groq', kind: 'complaint', text: 'التطبيق خايس' }, o(3000));
  assert.equal(c.mailed, 'sent', 'التذمّر والشتيمة وفشل الردّ يصلون إيميلًا أيضًا'); assert.match(mails[1].subject, /متضايق من التطبيق — zayed/);
  const d = await IB.noteTool({ user: 'noor', tool: 'media?y', text: 'ثالث' }, o(4000));
  assert.equal(d.mailed, 'capped', 'فوق السقف اليوميّ لا إيميل فوريّ'); assert.equal(mails.length, 2);
  assert.equal(items().length, 4, 'كلّها محفوظة للإيميل اليوميّ واللوحة');
  // السقف صفر يطفئ، وبلا إيميل مالك لا شيء، والافتراضيّ ٢٠
  assert.equal(await IB.mailNow({ at: 1, user: 'u', kind: 'tool', text: 't' }, { kv, env: Object.assign({}, env, { OWNER_MAIL_DAY_CAP: '0' }) }), 'off');
  assert.equal(await IB.mailNow({ at: 1, user: 'u', kind: 'tool', text: 't' }, { kv, env: {} }), 'off');
  assert.equal(IB.mailCap({}), 20); assert.equal(IB.mailCap({ OWNER_MAIL_DAY_CAP: 'abc' }), 20); assert.equal(IB.mailCap({ OWNER_MAIL_DAY_CAP: '5' }), 5);
  // بلا sendMail محقون يكمل بعد الردّ (waitUntil) فلا يؤخّر دور المحادثة
  reset();
  const e = await IB.noteTool({ user: 'huda', tool: 't', text: 'x' }, { kv, env, push: async () => ({}) });
  assert.equal(e.mailed, 'background'); assert.equal(bg.length, 1);
  await settle();
  // المالك لا يُبلَّغ عن نفسه
  assert.deepEqual(await IB.noteTool({ user: 'omran', tool: 't', text: 'x' }, { kv }), { kind: null });
});

test('٥ — الإيميل اليوميّ يضمّ أخطاء الخادم الجديدة منذ آخر إرسال، ويُرسل بها وحدها إن لم يكن بلاغ', async () => {
  reset();
  const mails = [];
  const env = { OWNER_NOTIFY_EMAIL: 'owner@example.com', RESEND_API_KEY: 'k' };
  const sendMail = async (to, subject, html) => { mails.push({ subject, html }); return true; };
  const iso = (ms) => new Date(ms).toISOString();
  db.set(IB.SERVER_LOG_KEY, [
    { at: iso(9000), lastAt: iso(9500), route: 'video', action: 'veo-create', message: 'Gemini 429 <quota>', count: 3 },
    { at: iso(1000), route: 'swallowed:fal-backup/x', message: 'قديم', count: 1 },
  ]);
  await IB.record({ user: 'sara', prov: 'media?x', kind: 'tool', text: 'صورة', detail: 'HTTP 503' }, { kv, now: 8000, push: async () => ({}) });
  const d1 = await IB.dailyDigest({ kv, env, sendMail, now: 10000 });
  assert.equal(d1.sent, true); assert.equal(d1.count, 1); assert.equal(d1.errors, 2);
  assert.ok(mails[0].html.includes('فشل أداة أمامه') && mails[0].html.includes('أخطاء الخادم الجديدة (2)') && mails[0].html.includes('video?veo-create') && mails[0].html.includes('Gemini 429 &lt;quota&gt;') && mails[0].html.includes('×3'));
  assert.match(mails[0].subject, /بلاغًا جديدًا .* أخطاء خادم: 2/);
  assert.equal((await IB.dailyDigest({ kv, env, sendMail, now: 20000 })).reason, 'empty', 'بلا جديد لا إيميل');
  const log = db.get(IB.SERVER_LOG_KEY); log[0].lastAt = iso(25000); log[0].count = 4; db.set(IB.SERVER_LOG_KEY, log); // الخطأ نفسه تكرّر بعد الإرسال
  const d3 = await IB.dailyDigest({ kv, env, sendMail, now: 30000 });
  assert.equal(d3.sent, true); assert.equal(d3.count, 0); assert.equal(d3.errors, 1, 'المتكرّر بعد آخر إيميل وحده');
  assert.match(mails[1].subject, /أخطاء خادم جديدة: 1/);
});

test('٦ — الربط: نقاط استطلاع الفيديو تمرّر السبب، والكنس يمرّره، والموجّهات كلّها تمرّ بالمراقب، والسقف في فهرس البيئة', () => {
  const veo = read('api/_lib/veo-status.js');
  assert.ok(veo.includes("const settle = (ok, why) => require('./video-job.js').settleVideoJob(op, ok, { why });"));
  assert.ok(veo.includes("const settleFal = (ok, why) => require('./video-job.js').settleVideoJob(op, ok, { why });"));
  assert.equal((veo.match(/settleVideoJob\(op, false\)|settle\(false\)|settleFal\(false\)/g) || []).length, 0, 'لا فشل بلا سبب');
  for (const f of ['minimax-status.js', 'video-status.js', 'actor-status.js']) {
    const src = read('api/_lib/' + f);
    assert.equal((src.match(/settleVideoJob\([^,]+, false\)|settle\(false\)/g) || []).length, 0, f + ': لا فشل بلا سبب');
  }
  const vj = read('api/_lib/video-job.js');
  assert.ok(vj.includes("require('./owner-inbox.js').noteToolLater") && vj.includes("Object.assign({}, opt, { why })"));
  assert.ok(read('api/_lib/_errors.js').includes('watchToolFailure(routeName, req, res); // v-owner-problems'));
  for (const r of ['account', 'ai', 'edu', 'media', 'system', 'tools', 'video']) assert.ok(read('api/' + r + '.js').includes("withErrorCapture('" + r + "'"), r);
  assert.ok(read('api/_lib/env.js').includes('OWNER_MAIL_DAY_CAP:'));
  assert.ok(read('api/_lib/email-sweep.js').includes("require('./owner-inbox.js').dailyDigest()"), 'الإيميل اليوميّ من جرد البريد كما كان');
});

test('٧ — لوحة المالك: «فشل أداة أمامه» نوعًا رابعًا بالـ١٤ لغة، والوسم مرفوع بسببه، والحزمة مبنيّة', () => {
  const ui = read('js/app-05-ui.js');
  assert.ok(ui.includes("tool: ['inboxKindTool', '#c58cff', '🧰']"));
  const data = read('js/app-03-i18n-data.js');
  assert.equal(data.split('inboxKindTool: "').length - 1, 2, 'ar+en');
  assert.ok(data.includes('inboxKindTool: "فشل أداة أمامه"') && data.includes('inboxKindTool: "Tool failed"'));
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) assert.ok(read('i18n/' + lg + '.js').includes('inboxKindTool: "'), lg);
  const st4 = read('js/app-04-i18n-state.js');
  const cur = Number((/'\.js\?v=(\d+)'/.exec(st4) || [])[1]);
  const tag = st4.match(/v-owner-problems \((\d+)\): «فشل أداة أمامه»/);
  assert.ok(tag && cur >= Number(tag[1]) && Number(tag[1]) >= 794, 'الوسم مرفوع وسببه في التعليق');
  assert.ok(read('js/app.bundle.js').includes("inboxKindTool"), 'الحزمة مبنيّة');
});
