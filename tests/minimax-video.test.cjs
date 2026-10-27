// tests/minimax-video.test.cjs — v-minimax-video: المحرّك الاقتصاديّ أُضيف بجانب Runway وVeo. يثبت: (١) الموجّه يعرف
// المسارين، (٢) نقطة الحالة تُطبّع شكل المزوّد إلى {status, output} مثل Runway (نجاح/جارٍ/فشل)، (٣) الواجهة والعميل
// وترجمات كلّ اللغات موجودة، (٤) الإنشاء يبني الطلب الصحيح ويعتمد على المفتاح.
// v-minimax-h3 (١٠ أكتوبر ٢٠٢٦، قرار المالك: «رفع الاقتصاديّ لإصداره الجديد بصوت بضعف التكلفة»): واجهة v2 بنموذج
// MiniMax-H3 — الإنشاء POST /v2/video_generation بجسم content[] ونسبة 16:9 ودقّة 768P/2K، والاستطلاع
// GET /v2/query/video_generation/{task_id} يردّ { task: { status, content:{url}, error } } بلا file_id ولا files/retrieve.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function fakeRes() {
  return { headers: {}, code: 0, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
}
const QUERY = /\/v2\/query\/video_generation\//;

/* يركّب بدائل في require.cache (video-job لرصد التسوية، _videoUsage لتجاوز المالك)، يشغّل المعالج الحقيقيّ، ويعيد كلّ شيء كما كان. */
async function runHandler(modRel, stubs, req, fetchImpl) {
  const saved = {};
  for (const [rel, exp] of Object.entries(stubs)) {
    const p = require.resolve(path.join(root, rel));
    saved[p] = require.cache[p];
    require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
  }
  const hp = require.resolve(path.join(root, modRel));
  delete require.cache[hp];
  const handler = require(hp);
  const realFetch = global.fetch;
  global.fetch = fetchImpl;
  const res = fakeRes();
  try { await handler(req, res); }
  finally {
    global.fetch = realFetch;
    delete require.cache[hp];
    for (const [p, v] of Object.entries(saved)) { if (v) require.cache[p] = v; else delete require.cache[p]; }
  }
  return res;
}
const settled = [];
const jobSpy = { settleVideoJob: async (id, ok) => { settled.push([id, ok]); return { settled: true, refunded: !ok }; }, rememberVideoJob: async () => true };
const ownerUsage = { checkOwnerBypass: async () => ({ allowed: true }), checkVideoQuota: async () => ({ allowed: true, username: 'omran' }), consumeVideo: async () => 3 };
const statusReq = (id) => ({ method: 'GET', query: { task_id: id } });
const taskReply = (task) => async (url) => (QUERY.test(String(url)) ? { ok: true, status: 200, json: async () => ({ task }) } : { ok: false, status: 404, json: async () => ({}) });

test('١. الموجّه يسجّل minimax-create وminimax-status', () => {
  const v = read('api/video.js');
  assert.ok(v.includes("case 'minimax-create': return require('./_lib/minimax-create.js');"));
  assert.ok(v.includes("case 'minimax-status': return require('./_lib/minimax-status.js');"));
});

test('٢. minimax-status (v2): succeeded → SUCCEEDED مع content.url، queued/running → RUNNING، failed → FAILED؛ المسار v2 بمعرّف المهمّة', async () => {
  process.env.MINIMAX_API_KEY = 'test-key';
  const urls = [];
  let res = await runHandler('api/_lib/minimax-status.js', { 'api/_lib/video-job.js': jobSpy }, statusReq('T1'),
    async (url, init) => { urls.push(String(url)); assert.equal(init.headers.Authorization, 'Bearer test-key'); return taskReply({ id: 'T1', status: 'succeeded', content: { url: 'https://cdn/x.mp4' } })(url); });
  assert.equal(res.body.status, 'SUCCEEDED');
  assert.equal(res.body.output[0], 'https://cdn/x.mp4');
  assert.deepEqual(urls, ['https://api.minimax.io/v2/query/video_generation/T1'], 'نداء واحد: لا files/retrieve في v2');
  for (const st of ['queued', 'running']) {
    res = await runHandler('api/_lib/minimax-status.js', { 'api/_lib/video-job.js': jobSpy }, statusReq('T1'), taskReply({ id: 'T1', status: st }));
    assert.equal(res.body.status, 'RUNNING', st);
  }
  res = await runHandler('api/_lib/minimax-status.js', { 'api/_lib/video-job.js': jobSpy }, statusReq('T1'), taskReply({ id: 'T1', status: 'failed', error: { code: 1, message: 'bad' } }));
  assert.equal(res.body.status, 'FAILED');
});

test('٣. minimax-status بلا task_id = 400، وبلا مفتاح = 500', async () => {
  const handler = require('../api/_lib/minimax-status.js');
  let res = fakeRes();
  await handler({ method: 'GET', query: {} }, res);
  assert.equal(res.code, 400);
  const saved = process.env.MINIMAX_API_KEY; delete process.env.MINIMAX_API_KEY;
  res = fakeRes();
  await handler({ method: 'GET', query: { task_id: 'T' } }, res);
  assert.equal(res.code, 500);
  if (saved) process.env.MINIMAX_API_KEY = saved;
});

test('٤. minimax-create: الطلب الصحيح (نقطة النهاية v2 / النموذج H3 / content + first_frame) والكلفة، ولا بقايا v1', () => {
  const c = read('api/_lib/minimax-create.js');
  assert.ok(c.includes("'/v2/video_generation'"), 'نقطة نهاية الإنشاء v2');
  assert.ok(c.includes("process.env.MINIMAX_VIDEO_MODEL || 'MiniMax-H3'"), 'نموذج H3 افتراضيّ (قابل للضبط من البيئة)');
  assert.ok(c.includes("role: 'first_frame'") && c.includes("type: 'image_url'"), 'صورة → تحريك الصورة (أوّل إطار) بصيغة content');
  assert.ok(c.includes("quality === 'high' ? '2K' : '768P'"), 'لا 1080P في H3: العالية 2K');
  for (const old of ['/v1/video_generation', 'first_frame_image', 'base_resp', '1080P', 'Hailuo']) assert.ok(!c.includes(old), 'بقايا v1: ' + old);
  assert.ok(c.includes('MINIMAX_API_KEY'), 'يعتمد على مفتاح المالك');
  assert.ok(c.includes('minimax_video'), 'يخصم كلفة minimax_video');
  assert.ok(c.includes('refundPoints'), 'يُسترجع الرصيد عند الفشل');
  const s = read('api/_lib/minimax-status.js');
  for (const old of ['files/retrieve', 'file_id', 'base_resp', 'MINIMAX_GROUP_ID', '/v1/']) assert.ok(!s.includes(old), 'بقايا v1 في الاستطلاع: ' + old);
  const p = read('api/_lib/points.js');
  assert.match(p, /minimax_video:\s*55,/, 'نقاط الاقتصاديّ بقرار المالك (v-minimax-h3)');
  assert.equal(require('../api/_lib/_mediaPlans.js').UNIT_COST.minimax_video, 176, 'تكلفتنا: ٦ث × $0.08 × ٣٫٦٧٢٥ (قرار المالك بمضاعفة التكلفة)');
});

test('٥. الواجهة: خيار المحرّك في القائمة (الافتراضيّ)، وفرع العميل، وترجمة كلّ اللغات', () => {
  assert.ok(read('js/partials-core.js').includes('<option value="minimax" selected'), 'خيار minimax في القائمة مختارًا افتراضيًّا (v-video-modes-by-result)');
  const client = read('js/app-11-video.js');
  assert.ok(client.includes("creationMode === 'minimax'"), 'فرع العميل للمحرّك الاقتصاديّ');
  assert.ok(client.includes('action=minimax-create') && client.includes('action=minimax-status'), 'العميل ينادي المسارين');
  // الترجمة موجودة في الحزمة (عربي + إنجليزي) وكلّ ملفّات i18n
  const i18n = read('js/app-03-i18n-data.js');
  assert.ok((i18n.match(/videoModeMinimax/g) || []).length >= 2, 'مفتاح الترجمة في الحزمة (عربي+إنجليزي)');
  // ملفّات اللغات هي التي تحمل بقيّة أوضاع الفيديو — كلّها يجب أن تحمل الترجمة الجديدة.
  const langs = fs.readdirSync(path.join(root, 'i18n')).filter((f) => f.endsWith('.js') && read('i18n/' + f).includes('videoModeRunwayOnly'));
  assert.ok(langs.length >= 12, 'كلّ ملفّات اللغات ممسوحة');
  for (const f of langs) assert.ok(read('i18n/' + f).includes('videoModeMinimax'), 'ترجمة videoModeMinimax في ' + f);
});

console.log('✓ minimax-video: المحرّك الاقتصاديّ مضاف بجانب Runway/Veo — موجّه، تطبيع حالة، واجهة، وترجمات');

/* v-video-poll (المالك: «⏳ يولّد الفيديو» ما ينتهي): الرفض كان يُقرأ «لسّا شغّال» فينتظر المستخدم للأبد ولا تُردّ نقاطه.
   في v2 الرفض = status failed/cancelled أو خطأ HTTP بجسم { type:'error' }: النهائيّ يسوّي التذكرة، والعابر (٤٢٩/٥xx) يبقى خطأً
   يحتمله حارس الاستطلاع في العميل. */
test('٦. v2: failed/cancelled وخطأ نهائيّ (٤٠٤ بجسم error) = FAILED وتسوية التذكرة؛ ٤٢٩/٥٢٩ عابران بلا تسوية؛ النجاح يسوّي بـtrue', async () => {
  process.env.MINIMAX_API_KEY = 'test-key';
  const stubs = { 'api/_lib/video-job.js': jobSpy };
  settled.length = 0;
  let res = await runHandler('api/_lib/minimax-status.js', stubs, statusReq('T9'), taskReply({ id: 'T9', status: 'failed', error: { code: 2013, message: 'content rejected' } }));
  assert.equal(res.body.status, 'FAILED', 'الفشل ما زال يُقرأ «لسّا شغّال»');
  assert.deepEqual(settled, [['T9', false]], 'التذكرة لم تُسوَّ فلا تُردّ النقاط');

  settled.length = 0;
  res = await runHandler('api/_lib/minimax-status.js', stubs, statusReq('T8'), taskReply({ id: 'T8', status: 'cancelled' }));
  assert.equal(res.body.status, 'FAILED');
  assert.deepEqual(settled, [['T8', false]]);

  // خطأ نهائيّ من المزوّد (مهمّة غير موجودة / مفتاح / رصيد): المستخدم دفع ولن يستلم ⇒ FAILED وتسوية
  settled.length = 0;
  res = await runHandler('api/_lib/minimax-status.js', stubs, statusReq('T7'), async () => ({ ok: false, status: 404, json: async () => ({ type: 'error', error: { type: 'not_found', message: 'task not found', http_code: 404 }, request_id: 'r1' }) }));
  assert.equal(res.body.status, 'FAILED');
  assert.deepEqual(settled, [['T7', false]]);

  // عابر: المزوّد مشغول — خطأ للعميل (حارسه يحتمل ستّة متتالية) ولا تسوية
  for (const code of [429, 529, 500]) {
    settled.length = 0;
    res = await runHandler('api/_lib/minimax-status.js', stubs, statusReq('T6'), async () => ({ ok: false, status: code, json: async () => ({ type: 'error', error: { type: 'busy', message: 'rate limit', http_code: code } }) }));
    assert.equal(res.code, code, String(code));
    assert.doesNotMatch(String(res.body.error), /MiniMax|rate limit|HTTP/, 'رمز تقنيّ في رسالة المستخدم');
    assert.deepEqual(settled, [], code + ': عابر لا يُسوّى');
  }

  // نجاح سليم يسوّي بـtrue بلا استرجاع، وحالة وسطى بلا تسوية
  settled.length = 0;
  res = await runHandler('api/_lib/minimax-status.js', stubs, statusReq('T5'), taskReply({ id: 'T5', status: 'succeeded', content: { url: 'https://cdn/ok.mp4' } }));
  assert.equal(res.body.status, 'SUCCEEDED');
  assert.deepEqual(settled, [['T5', true]]);
  settled.length = 0;
  res = await runHandler('api/_lib/minimax-status.js', stubs, statusReq('T4'), taskReply({ id: 'T4', status: 'running' }));
  assert.equal(res.body.status, 'RUNNING');
  assert.deepEqual(settled, []);
});

test('٧. حلقات الاستطلاع (خمس منذ v-actor-lipsync) محروسة بعمر وبأخطاء متتالية، ولا ابتلاع صامت', () => {
  const src = read('js/app-11-video.js');
  assert.equal((src.match(/guard\.tick\(iv\)/g) || []).length, 5, 'حلقة استطلاع بلا حارس');
  /* v-video-poll-transient: والزحام العابر (٤٢٩/٥xx) في حلقات الاقتصاديّ والسينمائيّ (اثنتان) والممثّل يمرّ بالحارس بنصّ الخادم
     guard.fail(iv, d.error) — مختبَر في video-durations ٥ */
  assert.equal((src.match(/guard\.fail\(iv\)/g) || []).length, 5, 'خطأ شبكة ما زال يُبتلع بصمت'); // v-ai-video-speed: وpollTaskOnce يعدّ خطأ الخادم ٥xx عابرًا بنصّه guard.fail(iv, data.error)
  assert.equal((src.match(/guard\.ok\(\)/g) || []).length, 5, 'عدّاد الأخطاء لا يُصفَّر عند نجاح دورة');
  assert.doesNotMatch(src, /catch\(e\)\{ \/\* keep polling \*\/ \}/, 'بقي ابتلاع صامت');
  assert.equal((src.match(/setInterval\(async \(\) => \{/g) || []).length, 5, /* v-actor-lipsync: حلقة الممثّل */ 'عدد الحلقات تغيّر — راجع الحراسة');
  assert.match(src, /function makePollGuard\(reject, everyMs, maxMs\)/);
  assert.ok(read('js/app.bundle.js').includes('function makePollGuard('), 'الحارس ليس في الحزمة — شغّل npm run bundle');
  // سلوك الحارس نفسه: العمر ينتهي، والأخطاء المتتالية تُنهي، والنجاح يصفّرها
  const vm = require('node:vm');
  const body = src.slice(src.indexOf('function makePollGuard('), src.indexOf('\n  }', src.indexOf('fail(iv, msg){')) + 4);
  const ctx = { bT: (a) => a, clearInterval: () => { ctx.cleared++; }, cleared: 0 };
  vm.runInNewContext(body + '\nglobalThis.__g = makePollGuard;', ctx);
  let err = null;
  let g = ctx.__g((e) => { err = e; }, 1000, 3000);
  assert.equal(g.tick(1), true); assert.equal(g.tick(1), true);
  assert.equal(g.tick(1), false, 'العمر لم ينتهِ عند السقف');
  assert.match(String(err.message), /طال انتظار الفيديو/);
  err = null;
  g = ctx.__g((e) => { err = e; }, 8000, 900000);
  for (let i = 0; i < 5; i++) g.fail(1);
  assert.equal(err, null, 'استسلم قبل ستّ محاولات — العابر لا يُحتمل');
  g.fail(1);
  assert.match(String(err.message), /انقطع الاتّصال/);
  err = null;
  g = ctx.__g((e) => { err = e; }, 8000, 900000);
  for (let i = 0; i < 5; i++) g.fail(1);
  g.ok();
  for (let i = 0; i < 5; i++) g.fail(1);
  assert.equal(err, null, 'نجاح دورة لا يصفّر عدّاد الأخطاء');
});

test('٨. لا اسم مزوّد ولا مفتاح في رسائل المستخدم من نقطتَي الحالة والإنشاء', () => {
  for (const f of ['api/_lib/minimax-status.js', 'api/_lib/minimax-create.js']) {
    const src = read(f);
    const shown = src.match(/error: '[^']*'/g) || [];
    for (const m of shown) assert.doesNotMatch(m, /MiniMax|MINIMAX|Hailuo|H3|Proxy error|Veo|Gemini/, f + ': ' + m);
    assert.ok(shown.length >= 3, f + ': لم تُقرأ رسائل المستخدم');
  }
});

/* v-video-retrieve-refund (المالك: «نعم ترد عادي»): التوليد نجح ورابط الملفّ لم يصل — المستخدم دفع ولم يستلم،
   فتُسوّى التذكرة فشلًا وتُردّ النقاط. في v2 الرابط في task.content.url نفسه. */
test('٩. succeeded بلا content.url يردّ النقاط (FAILED وتسوية)، ومرّة واحدة لا مرّتين', async () => {
  process.env.MINIMAX_API_KEY = 'test-key';
  const stubs = { 'api/_lib/video-job.js': jobSpy };
  settled.length = 0;
  let res = await runHandler('api/_lib/minimax-status.js', stubs, statusReq('T5'), taskReply({ id: 'T5', status: 'succeeded' }));
  assert.equal(res.body.status, 'FAILED');
  assert.deepEqual(settled, [['T5', false]], 'لم تُسوَّ التذكرة فشلًا فلا تُردّ النقاط');
  settled.length = 0;
  res = await runHandler('api/_lib/minimax-status.js', stubs, statusReq('T6'), taskReply({ id: 'T6', status: 'succeeded', content: {} }));
  assert.equal(res.body.status, 'FAILED');
  assert.deepEqual(settled, [['T6', false]]);
  // والنجاح الكامل ما زال يسوّي بـtrue (لا استرجاع)
  settled.length = 0;
  res = await runHandler('api/_lib/minimax-status.js', stubs, statusReq('T7'), taskReply({ id: 'T7', status: 'succeeded', content: { url: 'https://cdn/ok.mp4' } }));
  assert.equal(res.body.status, 'SUCCEEDED');
  assert.deepEqual(settled, [['T7', true]]);
  // حارس «مرّة واحدة» في الوحدة نفسها، لا في المتّصل
  assert.match(read('api/_lib/video-job.js'), /kvSetIfAbsent\(key \+ ':done'/, 'حارس الاسترجاع المزدوج');
});

/* v-minimax-h3: شكل الطلب الفعليّ على المعالج الحقيقيّ (تجاوز المالك: لا نقاط ولا قفل؛ بلا مفتاح Gemini فلا أوّل إطار). */
async function create(body, fetchImpl) {
  const savedG = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  process.env.MINIMAX_API_KEY = 'test-key';
  try { return await runHandler('api/_lib/minimax-create.js', { 'api/_lib/_videoUsage.js': ownerUsage, 'api/_lib/video-job.js': jobSpy }, { method: 'POST', body }, fetchImpl); }
  finally { if (savedG) process.env.GEMINI_API_KEY = savedG; }
}
const capture = (reply) => { const out = {}; out.fetch = async (url, init) => { out.url = String(url); out.init = init; out.body = JSON.parse(init.body); return reply || { ok: true, status: 200, json: async () => ({ task_id: 'mm-1' }) }; }; return out; };
const PHOTO = Buffer.from('fake-jpeg-bytes-'.repeat(8)).toString('base64');

test('١٠. الإنشاء (v2): المسار والترويسة والجسم — content نصّ، النسبة 16:9/9:16 (وغيرها 16:9)، ومع صورة adaptive + first_frame، والدقّة 768P/2K، والمدّة المختارة ٤–١٠', async () => {
  let c = capture();
  let res = await create({ promptText: 'قطّة تلعب في حديقة', ratio: '720:1280', token: 't' }, c.fetch);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.task_id, 'mm-1');
  assert.equal(c.url, 'https://api.minimax.io/v2/video_generation');
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.headers.Authorization, 'Bearer test-key');
  assert.equal(c.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(c.body, { model: 'MiniMax-H3', content: [{ type: 'text', text: 'قطّة تلعب في حديقة' }], duration: 6, resolution: '768P', ratio: '9:16' });
  for (const [ratio, want] of [['1280:720', '16:9'], ['720:1280', '9:16'], ['1:1', '16:9'], ['', '16:9'], [undefined, '16:9']]) {
    c = capture();
    await create({ promptText: 'x', ratio, token: 't' }, c.fetch);
    assert.equal(c.body.ratio, want, 'ratio ' + ratio);
  }
  // الجودة العالية 2K (لا 1080P)، والمدّة المختارة كما هي ضمن ٤–١٠ (v-video-durations: كانت تُقرَّب إلى ٦/١٠)
  c = capture();
  await create({ promptText: 'x', ratio: '1280:720', token: 't', quality: 'high', durationSeconds: 10 }, c.fetch);
  assert.equal(c.body.resolution, '2K');
  assert.equal(c.body.duration, 10);
  for (const [d, want] of [[5, 5], [8, 8], ['10', 10], [2, 4], [30, 10], [undefined, 6]]) { // السقف ١٠ = أطول زرّ (باب المال)
    c = capture();
    await create({ promptText: 'x', token: 't', durationSeconds: d }, c.fetch);
    assert.equal(c.body.duration, want, 'المدّة ' + d);
  }
  // صورة أوّل إطار: عنصر image_url بدور first_frame، والنسبة adaptive تتبع الصورة
  c = capture();
  await create({ promptText: 'يلوّح للكاميرا', ratio: '720:1280', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' }, c.fetch);
  assert.equal(c.body.ratio, 'adaptive');
  assert.equal(c.body.content.length, 2);
  assert.deepEqual(c.body.content[1], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + PHOTO }, role: 'first_frame' });
  assert.match(c.body.content[0].text, /^MAIN SUBJECT: whoever or whatever is in the attached image/, 'v-photo-as-is: الصورة نفسها بقفل محايد');
  assert.doesNotMatch(c.body.content[0].text, /real person|photorealistic|ultra-realistic/i, 'لا «شخص حقيقيّ» يحوّل الأفاتار إنسانًا');
  for (const k of ['prompt', 'first_frame_image']) assert.ok(!(k in c.body), 'حقل v1 في الجسم: ' + k);
  // النموذج قابل للضبط من البيئة
  process.env.MINIMAX_VIDEO_MODEL = 'MiniMax-H3-Max';
  c = capture();
  await create({ promptText: 'x', token: 't' }, c.fetch);
  delete process.env.MINIMAX_VIDEO_MODEL;
  assert.equal(c.body.model, 'MiniMax-H3-Max');
});

test('١١. الإنشاء (v2): خطأ المزوّد يُقرأ من error.message ويُصنَّف برموز _videoFail (بلا نصّ مزوّد ولا اسمه)، و٢٠٠ بلا task_id = زحام 502', async () => {
  /* دمج main (v-credit-out + v-vid-codes): رصيد المزوّد ليس رصيد المستخدم — ٤٠٢ = unavailable بـ503 لا يُمرَّر نصّه ولا حالته */
  let res = await create({ promptText: 'x', token: 't' }, async () => ({ ok: false, status: 402, json: async () => ({ type: 'error', error: { type: 'insufficient_balance', message: 'insufficient balance, please top up', http_code: 402 }, request_id: 'r' }) }));
  assert.equal(res.code, 503);
  assert.deepEqual(res.body, { error: 'unavailable', retryable: false });
  // ٤٠٠ وحدها رفضٌ للطلب — فنصّ error.message هو الذي يحوّلها إلى «عطب عندنا» (يُقرأ من جسم v2)
  res = await create({ promptText: 'x', token: 't' }, async () => ({ ok: false, status: 400, json: async () => ({ type: 'error', error: { type: 'auth', message: 'invalid api key' } }) }));
  assert.equal(res.code, 503);
  assert.equal(res.body.error, 'unavailable');
  res = await create({ promptText: 'x', token: 't' }, async () => ({ ok: false, status: 400, json: async () => ({ type: 'error', error: { type: 'invalid_request', message: 'prompt rejected by content policy' } }) }));
  assert.equal(res.code, 400);
  assert.equal(res.body.error, 'video_rejected');
  assert.equal(res.body.retryable, false);
  assert.doesNotMatch(JSON.stringify(res.body), /test-key|MiniMax|Hailuo|H3|content policy/);
  res = await create({ promptText: 'x', token: 't' }, async () => ({ ok: true, status: 200, json: async () => ({}) }));
  assert.equal(res.code, 502);
  assert.equal(res.body.error, 'video_busy');
  assert.equal(res.body.retryable, true);
  res = await create({ promptText: 'x', token: 't' }, async () => ({ ok: false, status: 500, json: async () => { throw new Error('not json'); } }));
  assert.equal(res.code, 500);
  assert.equal(res.body.error, 'video_busy');
});
