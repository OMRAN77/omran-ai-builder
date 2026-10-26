'use strict';
// tests/ai-video-speed.test.cjs — v-ai-video-speed (المالك ١٦ أكتوبر بلقطة «ما زال يتولّد… ١٥٦ث» في «فيديو AI فقط»: «شوف مشكلته طول كثير»)
// العرض: فيديو ٥ ثوانٍ من صورة عطر يأخذ دقائق. الجذور (مسح الخطّ من الضغطة إلى التشغيل، ثلاث عدسات):
//  ١) صورة بلا وجه كانت تمرّ بكشف الوجوه ثمّ رسم «إطار أوّل» كامل (١٥–٤٠ ث، حتّى ٩٠) قبل أن يبدأ المحرّك، وبمرساة «شخص حقيقيّ» لزجاجة.
//  ٢) «جودة أعلى» ترقية ثانية كاملة بعد اكتمال الفيديو والفيديو مخفيّ حتّى تنتهي (حتّى ربع ساعة، وفشلها مبلوع).
//  ٣) clearStuckTask يلغي «آخر مهمّة» على مفتاح مشترك — فيديو مستخدم آخر يتولّد الآن — وCANCELLED لم تكن نهائيّة (ربع ساعة استطلاع).
//  ٤) خطأ استطلاع عابر يرمي المهمّة الجارية ويعيدها من الصفر؛ والإلغاء ونفاد النقاط والرفض الدائم تُعاد بلا فائدة.
//  ٥) التعليق الصوتيّ يبدأ بعد الفيديو لا معه، وتحميل ffmpeg يتكرّر، وبطاقة الانتظار تُصفّر عدّادها عند ⬇️، وفحص رصيد المالك مفتاحًا بعد مفتاح.
// الاختبار: الوحدات الحقيقيّة (trend-people · merge-identity · video-create · runway-keys · video-balance) بشبكة مزيّفة، ودوالّ العميل
// بنصّها من app-11-video.js في vm بساعة افتراضيّة.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'ai-video-speed-test-secret-' + 'x'.repeat(24);
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-11-video.js');
const sliceFn = (head) => { const i = SRC.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head); const j = SRC.indexOf('\n  }\n', i); return SRC.slice(i, j + 4); };

test('١. صورة بلا وجه (عطر) في الوصف الحرّ: لا إطار مرسوم ولا نداء صورة — والوجه والأسلوب الفنّيّ وعطب الكشف كما كانت', async () => {
  const tp = require(rp('api/_lib/trend-people.js'));
  const run = async (faces, o) => {
    let calls = 0;
    const out = await tp.soloFirstFrame('k', { data: Buffer.from('x' + Math.random()).toString('base64'), mime: 'image/jpeg' }, 'زجاجة العطر تدور ببطء', '1280:720', Object.assign({
      budgetMs: 90000, needPerson: true,
      faceCrops: async (key, photos, opts) => { if (faces !== undefined) opts.stats.faces = faces; return []; },
      callImage: async () => { calls++; return { b64: 'RlJBTUU=', mime: 'image/png' }; },
    }, o || {}));
    return { out, calls };
  };
  const none = await run(0);
  assert.deepEqual(none.out, { error: 'no-person', noPerson: true });
  assert.equal(none.calls, 0, 'لا نداء رسم إطار لزجاجة');
  assert.equal((await run(1)).calls, 1, 'وجه (حتّى لو لم تُقصّ لقطته: صورة سيلفي تملأ الإطار) = الإطار كما كان');
  assert.equal((await run(undefined)).calls, 1, 'عطب الكشف لا يُقرأ «لا شخص»');
  assert.equal((await run(0, { style: 'anime' })).calls, 1, 'الأنمي يحتاج الإطار لتحويل الأسلوب');
  assert.equal((await run(0, { needPerson: false })).calls, 1, 'الترندات ومن لا يطلب needPerson كما كانوا');
});

test('٢. كشف الوجوه يعلن العدد حين ينجح فقط (stats.faces)، ولا يعلنه عند العطب', async () => {
  const mi = require(rp('api/_lib/merge-identity.js'));
  const img = { w: 64, h: 64, data: new Uint8Array(64 * 64 * 4) };
  const okEmpty = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"faces":[]}' }] } }] }) });
  const s1 = {}; await mi.detectFaces('k', img, { fetchImpl: okEmpty, stats: s1 });
  assert.equal(s1.faces, 0);
  const two = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"faces":[{"box_2d":[100,100,400,300]},{"box_2d":[100,600,400,800]}]}' }] } }] }) });
  const s2 = {}; await mi.detectFaces('k', img, { fetchImpl: two, stats: s2 });
  assert.equal(s2.faces, 2);
  const s3 = {}; await mi.detectFaces('k', img, { fetchImpl: async () => ({ ok: false, status: 503 }), stats: s3 });
  assert.equal(s3.faces, undefined, '٥٠٣ ليس «لا وجوه»');
  // مراجعة: ٢٠٠ بلا جواب فعليّ = عطب لا «صفر وجوه» (كان يُسقط قفل الهويّة عن صورة شخص)
  for (const [what, body] of [
    ['حجب الطلب', { promptFeedback: { blockReason: 'OTHER' } }],
    ['SAFETY بلا محتوى', { candidates: [{ finishReason: 'SAFETY' }] }],
    ['أفكار فقط', { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }] } }] }],
    ['جسم لا يُقرأ', null],
  ]) {
    const st = {};
    try { await mi.detectFaces('k', img, { fetchImpl: async () => ({ ok: true, json: async () => { if (body === null) throw new Error('bad'); return body; } }), stats: st }); } catch (e) { /* لا يعني شيئًا هنا */ }
    assert.equal(st.faces, undefined, what);
  }
});

test('٣. video-create بصورة عطر: الصورة نفسها أوّل إطار، ومرساة «الشيء كما هو» لا «شخص حقيقيّ»', async () => {
  const stub = (f, exports) => { require.cache[rp('api/_lib/' + f)] = { id: rp('api/_lib/' + f), filename: rp('api/_lib/' + f), loaded: true, exports }; };
  const realTp = require(rp('api/_lib/trend-people.js'));
  const saved = {};
  ['trend-people.js', '_videoUsage.js', 'points.js', 'abuse-guard.js', 'video-job.js', 'runway-keys.js', 'kv.js'].forEach((f) => { saved[f] = require.cache[rp('api/_lib/' + f)]; });
  let soloOpts = null;
  stub('trend-people.js', Object.assign({}, realTp, { firstFrameOn: () => true, soloFirstFrame: async (k, p, s, r, o) => { soloOpts = o; return { error: 'no-person', noPerson: true }; } }));
  stub('_videoUsage.js', { checkVideoQuota: async () => ({ allowed: true, username: 'omran' }), consumeVideo: async () => 1, checkOwnerBypass: async () => ({ allowed: true }), isOwner: () => true, bindToResponse: () => {} });
  const realPoints = require(rp('api/_lib/points.js'));
  stub('points.js', Object.assign({}, realPoints, { isOwnerUsername: () => true }));
  stub('abuse-guard.js', { videoLock: async () => ({ ok: true }), releaseVideoLock: async () => {} });
  stub('video-job.js', { rememberVideoJob: async () => true, settleVideoJob: async () => null });
  stub('runway-keys.js', { pickKey: () => ({ key: 'rk', index: 0 }), encodeTaskId: (i, id) => i + ':' + id, clearStuckTask: async () => {}, saveLastTask: async () => {}, RUNWAY_API_BASE: 'https://rw.test' });
  stub('kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => true, kvGetRaw: async () => null, kvSetRaw: async () => true });
  process.env.GEMINI_API_KEY = 'g';
  delete require.cache[rp('api/_lib/video-create.js')];
  const V = require(rp('api/_lib/video-create.js'));
  const PHOTO = Buffer.from('perfume-photo-'.repeat(8)).toString('base64'); // أطول من ٥٠ (useImage)
  let sent = null;
  const realFetch = global.fetch;
  global.fetch = async (url, init) => { if (/image_to_video|text_to_video/.test(url)) { sent = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ id: 'task-1' }), { status: 200 }); } return new Response('{}', { status: 404 }); };
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  try {
    await V({ method: 'POST', body: { promptText: 'زجاجة العطر تدور ببطء مع إضاءة ذهبية ودخان خفيف', token: 't', ratio: '1280:720', duration: '5', style: 'realistic', imageBase64: PHOTO, imageMime: 'image/jpeg' } }, res);
  } finally {
    global.fetch = realFetch;
    Object.keys(saved).forEach((f) => { if (saved[f]) require.cache[rp('api/_lib/' + f)] = saved[f]; else delete require.cache[rp('api/_lib/' + f)]; });
    delete require.cache[rp('api/_lib/video-create.js')];
  }
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(soloOpts && soloOpts.needPerson, true, 'الوصف الحرّ يطلب needPerson');
  assert.ok(/image_to_video/.test(sent.url));
  assert.ok(String(sent.body.promptImage).endsWith(PHOTO), 'الصورة الأصليّة نفسها أوّل إطار');
  assert.doesNotMatch(sent.body.promptText, /real person|same face|IDENTITY/, 'لا مرساة شخص لزجاجة: ' + sent.body.promptText.slice(0, 120));
  assert.match(sent.body.promptText, /^The opening frame is the user's own photo of this subject\./);
  assert.match(sent.body.promptText, /SUBJECT \(mandatory\)/);
  assert.equal(V.buildRunwayPrompt('x', 'realistic', true, false, 0, false).startsWith('The opening frame is a real photo of a real person.'), true, 'صورة شخص كما كانت');
});

test('٤. clearStuckTask: لا يلغي فيديو مستخدم آخر يتولّد الآن — العالق فوق عمر الحارس وحده', async () => {
  const kvKey = rp('api/_lib/kv.js');
  const savedKv = require.cache[kvKey];
  require.cache[kvKey] = { id: kvKey, filename: kvKey, loaded: true, exports: { kvGetJSON: async () => ({ id: 'prev-task' }), kvPutJSON: async () => true } };
  delete require.cache[rp('api/_lib/runway-keys.js')];
  const RK = require(rp('api/_lib/runway-keys.js'));
  const realFetch = global.fetch;
  const run = async (task) => {
    const del = [];
    global.fetch = async (url, init) => { if (init && init.method === 'DELETE') { del.push(url); return new Response('', { status: 204 }); } return new Response(JSON.stringify(task), { status: 200 }); };
    await RK.clearStuckTask(0, 'k');
    return del.length;
  };
  try {
    const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
    assert.equal(await run({ status: 'RUNNING', createdAt: iso(60 * 1000) }), 0, 'فيديو حيّ عمره دقيقة لا يُلغى');
    assert.equal(await run({ status: 'THROTTLED', createdAt: iso(5 * 60 * 1000) }), 0, 'في الطابور لا يُلغى');
    assert.equal(await run({ status: 'RUNNING' }), 0, 'عمر مجهول لا يُلغى');
    assert.equal(await run({ status: 'CANCELLED', createdAt: iso(40 * 60 * 1000) }), 0);
    assert.equal(await run({ status: 'PENDING', createdAt: iso(RK.STUCK_MS + 60 * 1000) }), 1, 'العالق فوق ربع ساعة يُلغى كما كان');
  } finally {
    global.fetch = realFetch;
  }
  // مراجعة: المهمّة العالقة لا تضيع حين تأتي بعدها مهمّة خلال ربع ساعة (كانت تُكتب فوقها فيبقى المفتاح مسدودًا) — hold يراقبها حتّى تنتهي
  const store = {};
  require.cache[kvKey] = { id: kvKey, filename: kvKey, loaded: true, exports: { kvGetJSON: async (k) => (store[k] ? JSON.parse(store[k]) : null), kvPutJSON: async (k, v) => { store[k] = JSON.stringify(v); return true; } } };
  delete require.cache[rp('api/_lib/runway-keys.js')];
  const RK2 = require(rp('api/_lib/runway-keys.js'));
  const upEnv = process.env.UPSTASH_REDIS_REST_URL; process.env.UPSTASH_REDIS_REST_URL = 'https://kv.test';
  const tasks = {}; const deleted = [];
  global.fetch = async (url, init) => {
    const id = String(url).split('/').pop();
    if (init && init.method === 'DELETE') { deleted.push(id); tasks[id].status = 'CANCELLED'; return new Response('', { status: 204 }); }
    return new Response(JSON.stringify(tasks[id] || {}), { status: tasks[id] ? 200 : 404 });
  };
  try {
    const t0 = Date.now();
    tasks.A = { status: 'RUNNING', createdAt: new Date(t0 - 60 * 1000).toISOString() }; // A تعلق لاحقًا
    await RK2.saveLastTask(0, 'A');
    await RK2.clearStuckTask(0, 'k'); // طلب B بعد دقيقة: A حيّة → تبقى، وتُحفظ في hold
    tasks.B = { status: 'RUNNING', createdAt: new Date(t0).toISOString() };
    await RK2.saveLastTask(0, 'B');
    assert.deepEqual(deleted, [], 'لا يُلغى فيديو حيّ');
    tasks.A.createdAt = new Date(t0 - RK2.STUCK_MS - 60 * 1000).toISOString(); // مرّ ربع ساعة وA ما زالت معلّقة
    tasks.B.status = 'SUCCEEDED';
    await RK2.clearStuckTask(0, 'k'); // طلب C: A عالقة رغم أنّ «آخر مهمّة» صارت B
    assert.deepEqual(deleted, ['A'], 'العالقة تُلغى ولو كُتبت فوقها مهمّة أحدث');
  } finally {
    global.fetch = realFetch;
    if (upEnv === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = upEnv;
    if (savedKv) require.cache[kvKey] = savedKv; else delete require.cache[kvKey];
    delete require.cache[rp('api/_lib/runway-keys.js')];
  }
});

test('٥. رصيد المالك: المفاتيح معًا لا واحدًا بعد واحد', async () => {
  const ownKey = rp('api/_lib/_owner.js');
  const savedOwn = require.cache[ownKey];
  require.cache[ownKey] = { id: ownKey, filename: ownKey, loaded: true, exports: Object.assign({}, savedOwn ? savedOwn.exports : {}, { isOwner: () => true, isOwnerSession: () => true }) }; // v-audit-agent (srv-agent-3): الرصيد صار على جلسة المالك
  const env = { RUNWAY_API_KEY: process.env.RUNWAY_API_KEY, RUNWAY_API_KEY_2: process.env.RUNWAY_API_KEY_2, RUNWAY_API_KEY_3: process.env.RUNWAY_API_KEY_3 };
  Object.assign(process.env, { RUNWAY_API_KEY: 'a', RUNWAY_API_KEY_2: 'b', RUNWAY_API_KEY_3: 'c' });
  delete require.cache[rp('api/_lib/video-balance.js')];
  const B = require(rp('api/_lib/video-balance.js'));
  const realFetch = global.fetch;
  let inFlight = 0, peak = 0;
  global.fetch = async (url, init) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 80));
    inFlight--;
    const k = String(init.headers.Authorization).slice(7);
    return new Response(JSON.stringify({ creditBalance: { a: 10, b: 900, c: 50 }[k] }), { status: 200 });
  };
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; } };
  const t0 = Date.now();
  try { await B({ method: 'GET', query: {}, headers: {} }, res); } finally {
    global.fetch = realFetch;
    Object.keys(env).forEach((k) => { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; });
    if (savedOwn) require.cache[ownKey] = savedOwn; else delete require.cache[ownKey];
    delete require.cache[rp('api/_lib/video-balance.js')];
  }
  assert.equal(peak, 3, 'النداءات الثلاثة متزامنة');
  assert.ok(Date.now() - t0 < 200, 'زمن مفتاح واحد لا ثلاثة: ' + (Date.now() - t0) + 'ms');
  assert.equal(res.body.credits, 900, 'أعلى رصيد كما كان');
});

// ساعة افتراضيّة: setInterval حلقة متتابعة، وsetTimeout فوريّ — دوالّ العميل بنصّها.
function clientBox(net) {
  const timers = new Map(); let nid = 1;
  const sb = {
    bT: (a) => a, isEn: () => false, console, Response, Promise, Object, Error, JSON, encodeURIComponent, Array, String, Number, Math,
    setStatus: (s) => { sb.statuses.push(s); }, statuses: [],
    window: { t: (k) => ({ vidCancelled: 'أُلغي إنشاء الفيديو — لم تُخصم أيّ نقاط.', plansWhyPoints: 'نقاطك خلصت' })[k] || k },
    setInterval: (fn) => { const id = nid++; timers.set(id, 1); (async () => { await new Promise((r) => setImmediate(r)); while (timers.has(id)) { await fn(); await new Promise((r) => setImmediate(r)); } })(); return id; },
    clearInterval: (id) => timers.delete(id),
    setTimeout: (fn) => { setImmediate(fn); return 0; },
    fetch: net, creates: 0, polls: 0, accepted: [], __swallow() {},
  };
  sb.window.postWithConfirm = undefined;
  const code = [sliceFn('function makePollGuard('), sliceFn('function pollTaskOnce('), sliceFn('function throwIfDeclined('), sliceFn('async function createScene('), sliceFn('async function createSceneWithRetry(')].join('\n');
  sb.sb = sb;
  vm.runInNewContext(code + '\nthis.cswr = function(){ var a = [].slice.call(arguments); while (a.length < 9) a.push(undefined); a.push(function(id){ sb.accepted.push(id); }); return createSceneWithRetry.apply(null, a); }; this.poll = pollTaskOnce;', sb);
  return sb;
}

test('٦. الاستطلاع: خطأ عابر لا يرمي الفيديو الجاري، والملغاة نهائيّة، وما لا تحلّه الإعادة لا يُعاد', async () => {
  // (أ) RUNNING ثمّ خطأ عابر ثمّ SUCCEEDED: مهمّة واحدة لا اثنتان
  let seq = ['RUNNING', 'ERR', 'RUNNING', 'SUCCEEDED'];
  let sb = clientBox(async (url, init) => {
    if (String(url).startsWith('/api/video-create')) { sb.creates++; return new Response(JSON.stringify({ id: 'T' + sb.creates }), { status: 200 }); }
    sb.polls++; const s = seq.shift() || 'SUCCEEDED';
    return new Response(JSON.stringify(s === 'ERR' ? { error: 'تعذّر متابعة الفيديو الآن.' } : { status: s, output: ['https://cdn/v.mp4'] }), { status: s === 'ERR' ? 503 : 200 });
  });
  assert.equal(await sb.cswr('قطّة', 'realistic', '5', '1280:720', 't', false, null), 'https://cdn/v.mp4');
  assert.equal(sb.creates, 1, 'العابر كان يُنشئ مهمّة ثانية من الصفر');
  assert.deepEqual(sb.accepted, ['T1'], 'onAccepted مرّة لمّا قبِل المزوّد (يبدأ التعليق الصوتيّ وقتها لا قبل)');

  // (أ٢) 4xx من الاستطلاع نهائيّ: لا ٣٠ ث انتظار ثمّ «تحقّق من الشبكة»
  sb = clientBox(async (url) => {
    if (String(url).startsWith('/api/video-create')) { sb.creates++; return new Response(JSON.stringify({ id: 'N' + sb.creates }), { status: 200 }); }
    sb.polls++; return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  });
  await assert.rejects(sb.cswr('قطّة', 'realistic', '5', '1280:720', 't', false, null), /Missing id/);
  assert.ok(sb.polls <= 3, 'استطلاع واحد لكلّ محاولة: ' + sb.polls);

  // (ب) CANCELLED نهائيّة: لا ربع ساعة استطلاع (١٨٠ دورة)
  sb = clientBox(async (url) => {
    if (String(url).startsWith('/api/video-create')) { sb.creates++; return new Response(JSON.stringify({ id: 'C' + sb.creates }), { status: 200 }); }
    sb.polls++; return new Response(JSON.stringify({ status: 'CANCELLED' }), { status: 200 });
  });
  await assert.rejects(sb.cswr('قطّة', 'realistic', '5', '1280:720', 't', false, null), (e) => e.code === 'cancelled');
  assert.ok(sb.polls <= 3, 'استطلاع واحد لكلّ محاولة: ' + sb.polls);

  // (ج) إلغاء نافذة الخصم (428 مقروء الجسم) ونفاد النقاط والرفض الدائم ورفض الرقابة: محاولة واحدة
  const once = async (createRes, statusBody) => {
    const b = clientBox(async (url) => {
      if (String(url).startsWith('/api/video-create')) { b.creates++; return createRes(); }
      return new Response(JSON.stringify(statusBody), { status: 200 });
    });
    let err = null; try { await b.cswr('قطّة', 'realistic', '5', '1280:720', 't', false, null); } catch (e) { err = e; }
    return { b, err };
  };
  let r = await once(() => { const x = new Response('{"error":"confirm_required"}', { status: 428 }); x.json(); return x; }, {});
  assert.equal(r.err.code, 'confirm_declined'); assert.equal(r.b.creates, 1, 'كانت تُفتح النافذة ثانيةً بعد ٦ و١٢ ث');
  assert.deepEqual(r.b.accepted, [], 'إلغاء النافذة لا يبدأ التعليق الصوتيّ');
  r = await once(() => new Response('{"error":"points_insufficient"}', { status: 402 }), {});
  assert.equal(r.err.code, 'points_insufficient'); assert.equal(r.b.creates, 1);
  r = await once(() => new Response('{"error":"تعذّر بدء الفيديو بهذا الطلب — غيّر الوصف أو الصورة وأعد المحاولة.","retryable":false}', { status: 400 }), {});
  assert.equal(r.b.creates, 1, 'الرفض الدائم لا يُعاد');
  r = await once(() => new Response('{"id":"M"}', { status: 200 }), { status: 'FAILED', failure: 'SAFETY: content did not pass moderation' });
  assert.equal(r.b.creates, 1, 'رفض الرقابة يتكرّر للطلب نفسه');
  r = await once(() => new Response('{"id":"F"}', { status: 200 }), { status: 'FAILED', failure: 'internal' });
  assert.equal(r.b.creates, 3, 'الفشل العابر عند المزوّد يُعاد كما كان');
});

test('٧. «جودة أعلى» بعد ظهور الفيديو لا قبله: الترقية في الخلفية تستبدل المشغّل بلا بطاقة انتظار، ولا تستبدل طلبًا أحدث', async () => {
  const runway = SRC.slice(SRC.indexOf('      let finalSrc = sceneUrls[0];'));
  const shown = runway.indexOf('resultEl.src = playerUrl;'), up = runway.indexOf('upgradeInBackground(sceneUrls[0]');
  assert.ok(shown > 0 && up > shown, 'الترقية تُستدعى بعد عرض الفيديو');
  assert.ok(!/await pollTaskOnce\(upData\.id\)/.test(runway.slice(0, shown)), 'لا انتظار ترقية قبل العرض');
  const fnSrc = SRC.slice(SRC.indexOf('  let genSeq = 0;'), SRC.indexOf('  async function createScene('));
  const mk = (upFail, bump) => {
    const sb = {
      bT: (a) => a, console, Promise, JSON, URL: { createObjectURL: () => 'blob:up' }, statuses: [],
      setStatus: (s) => sb.statuses.push(s),
      fetch: async () => new Response(JSON.stringify(upFail ? { error: 'x' } : { id: 'U' }), { status: upFail ? 500 : 200 }),
      pollTaskOnce: async (id, quiet) => { sb.quiet = quiet; if (bump) sb.bump(); return 'https://cdn/up.mp4'; },
      proxyVideoUrl: (u) => '/api/video-download?u=' + u, proxyFetch: async () => new Response('vid', { status: 200 }),
      muxNarration: async () => new Blob(['m']), Blob,
      resultEl: { src: 'blob:raw', currentTime: 3, paused: true, play: () => { sb.played = true; return Promise.resolve(); }, pause: () => { sb.paused = true; } }, downloadEl: { href: '/dl/raw' },
      __swallow() {}, revoked: [],
    };
    sb.URL.revokeObjectURL = (u) => sb.revoked.push(u);
    vm.runInNewContext(fnSrc + '\nthis.go = upgradeInBackground; this.bump = function(){ genSeq++; }; this.seq = function(){ return ++genSeq; };', sb);
    return sb;
  };
  let sb = mk(false, false);
  await sb.go('https://cdn/raw.mp4', 't', null, sb.seq());
  assert.equal(sb.resultEl.src, 'blob:up'); assert.equal(sb.downloadEl.href, '/api/video-download?u=https://cdn/up.mp4');
  assert.equal(sb.quiet, true, 'استطلاع هادئ — «⏳ الحالة» كانت ستُظهر بطاقة الانتظار فوق النتيجة');
  assert.equal(sb.played, undefined, 'لا تشغيل لفيديو أوقفه المستخدم أو أغلق نافذته'); assert.equal(sb.paused, true, 'autoplay يُلغى بالإيقاف');
  assert.deepEqual(sb.revoked, ['blob:raw'], 'النسخة القديمة تُحرَّر من الذاكرة');
  assert.ok(sb.statuses.every((s) => /^✅/.test(s)), 'حالات الخلفية ليست «مشغول»: ' + sb.statuses.join(' | '));
  sb = mk(false, true);
  await sb.go('https://cdn/raw.mp4', 't', null, sb.seq());
  assert.equal(sb.resultEl.src, 'blob:raw', 'طلب أحدث بدأ = لا استبدال');
  sb = mk(true, false);
  await sb.go('https://cdn/raw.mp4', 't', null, sb.seq());
  assert.equal(sb.resultEl.src, 'blob:raw'); assert.match(sb.statuses.pop(), /^✅ تم الانتهاء! \(تعذّرت/);
});

test('٨. التعليق الصوتيّ مع الفيديو لا بعده، وffmpeg يُحمَّل مرّة لنداءين متزامنين، وعدّاد الانتظار لا يُصفَّر عند ⬇️', async () => {
  const runway = SRC.slice(SRC.indexOf('      let ttsEarly = null;'), SRC.indexOf('      let finalSrc = sceneUrls[0];'));
  assert.ok(runway.indexOf("ttsEarly = fetch('/api/tts'") > 0 && runway.indexOf("ttsEarly = fetch('/api/tts'") < runway.indexOf('const okBal2'), 'TTS معرّف داخل startNarration');
  assert.ok(!/^\s*ttsEarly = fetch/m.test(runway.slice(runway.indexOf('const okBal2'))), 'لا TTS قبل قبول المزوّد');
  assert.equal((runway.match(/filmHeroBase64, filmHeroMime, startNarration\)/g) || []).length, 2, 'يبدأ من onAccepted في المشهد الواحد والمشهدين');
  const after = SRC.slice(SRC.indexOf('      let finalSrc = sceneUrls[0];'), SRC.indexOf('upgradeInBackground(sceneUrls[0]'));
  assert.ok(after.includes('await ttsEarly') && !after.includes("fetch('/api/tts'"), 'لا نداء TTS ثانٍ بعد الفيديو');
  const memo = SRC.slice(SRC.indexOf('  let ffmpegLoading = null;'), SRC.indexOf('  async function loadFFmpeg(){'));
  let loads = 0;
  const sb = { Promise, loadFFmpeg: async () => { loads++; await new Promise((r) => setImmediate(r)); return { ok: 1 }; }, ffmpegInstance: null };
  vm.runInNewContext(memo + '\nthis.get = getFFmpeg;', sb);
  const [a, b] = await Promise.all([sb.get(), sb.get()]);
  assert.equal(loads, 1, 'تحميل واحد (٣١ ميغا) لا اثنان'); assert.equal(a, b);
  const gw = read('js/app-34-gen-wait.js');
  const vrow = gw.slice(gw.indexOf("{ id: 'video', sel: '#videoMakerStatus'"), gw.indexOf("top: ['🚀'", gw.indexOf("{ id: 'video', sel: '#videoMakerStatus'")) + 80);
  assert.ok(/busy: \[[^\]]*'⬇️'/.test(vrow) && /top: \[[^\]]*'⬇️'/.test(vrow), 'تحميل الناتج جزء من الانتظار');
  assert.ok(!/busy: \[[^\]]*'✅'/.test(vrow) && !/busy: \[[^\]]*'✨'/.test(vrow), 'حالة الترقية في الخلفية ليست انتظارًا');
});

test('٩. رسائل لا تعلّق بطاقة الانتظار، وإلغاء مشهد لاحق لا يقول «لم تُخصم أيّ نقاط»، والسينمائيّ والاقتصاديّ يعرفان إلغاء النافذة', () => {
  assert.ok(!/'⏳ One video every few minutes|"⏳ You have reached today/.test(SRC) && SRC.includes("'🕒 One video every few minutes"), 'المهلة وحدّ اليوم ببادئة ليست «مشغول»');
  const busy = (read('js/app-34-gen-wait.js').match(/\{ id: 'video'[\s\S]*?busy: \[([^\]]*)\]/) || [])[1] || '';
  assert.ok(busy && !busy.includes('🕒') && !busy.includes('⛔'));
  assert.match(SRC, /if\(code === 'confirm_declined'\) return scenesDone > 0 \? bT\('⛔ /);
  assert.equal((SRC.match(/scenesDone\+\+/g) || []).length, 2, 'الفيلم والمشهدان يعدّان ما اكتمل');
  assert.equal((SRC.match(/throwIfDeclined\(cr\);/g) || []).length, 2, 'السينمائيّ والاقتصاديّ (كان «body stream already read» خامًا)');
  const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
  const KEYS = ['✅ Video ready — ✨ preparing a higher-quality version in the background…', '✅ Done — upgraded to higher quality.', '✅ Done! (The higher-quality version was unavailable — your video is ready)', 'The video was cancelled by the engine — please try again.', '⛔ Stopped at your cancel — the scenes completed before it were charged.'];
  KEYS.forEach((k) => assert.ok(SRC.includes("'" + k + "'"), 'النصّ في الكود: ' + k));
  LANGS.forEach((lg) => { const t = read('i18n/' + lg + '.js'); KEYS.forEach((k) => assert.ok(t.includes(JSON.stringify(k)), lg + ' ← ' + k)); });
  // وسم اللغات مرفوع عن ٧٤٨ (الرقم يُقرأ من الكود لا يُثبَّت — سقّاطة vPinTests)
  const iv = Number((read('js/app-04-i18n-state.js').match(/'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]);
  assert.ok(iv > 748, 'وسم اللغات: ' + iv);
});
