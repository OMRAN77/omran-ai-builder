// tests/minimax-video.test.cjs — v-minimax-video: المحرّك الاقتصاديّ (MiniMax Hailuo)
// أُضيف بجانب Runway وVeo. يثبت: (١) الموجّه يعرف المسارين، (٢) نقطة الحالة تُطبّع
// شكل MiniMax إلى {status, output} مثل Runway (نجاح/جارٍ/فشل)، (٣) الواجهة والعميل
// وترجمات كلّ اللغات موجودة، (٤) الإنشاء يبني الطلب الصحيح ويعتمد على المفتاح.
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

test('١. الموجّه يسجّل minimax-create وminimax-status', () => {
  const v = read('api/video.js');
  assert.ok(v.includes("case 'minimax-create': return require('./_lib/minimax-create.js');"));
  assert.ok(v.includes("case 'minimax-status': return require('./_lib/minimax-status.js');"));
});

test('٢. minimax-status: Success → SUCCEEDED مع رابط، Processing → RUNNING، Fail → FAILED', async () => {
  process.env.MINIMAX_API_KEY = 'test-key';
  const handler = require('../api/_lib/minimax-status.js');
  const realFetch = global.fetch;
  // نجاح: أوّل نداء = الاستعلام (Success + file_id)، الثاني = جلب الملفّ (download_url)
  global.fetch = async (url) => {
    if (/query\/video_generation/.test(url)) return { ok: true, json: async () => ({ status: 'Success', file_id: 'F1' }) };
    if (/files\/retrieve/.test(url)) return { ok: true, json: async () => ({ file: { download_url: 'https://cdn/x.mp4' } }) };
    return { ok: false, json: async () => ({}) };
  };
  let res = fakeRes();
  await handler({ method: 'GET', query: { task_id: 'T1' } }, res);
  assert.equal(res.body.status, 'SUCCEEDED');
  assert.equal(res.body.output[0], 'https://cdn/x.mp4');

  // جارٍ
  global.fetch = async () => ({ ok: true, json: async () => ({ status: 'Processing' }) });
  res = fakeRes();
  await handler({ method: 'GET', query: { task_id: 'T1' } }, res);
  assert.equal(res.body.status, 'RUNNING');

  // فشل
  global.fetch = async () => ({ ok: true, json: async () => ({ status: 'Fail' }) });
  res = fakeRes();
  await handler({ method: 'GET', query: { task_id: 'T1' } }, res);
  assert.equal(res.body.status, 'FAILED');

  global.fetch = realFetch;
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

test('٤. minimax-create: الطلب الصحيح (نقطة النهاية/النموذج/first_frame_image) والكلفة', () => {
  const c = read('api/_lib/minimax-create.js');
  assert.ok(c.includes('/v1/video_generation'), 'نقطة نهاية الإنشاء');
  assert.ok(/MiniMax-Hailuo/.test(c), 'نموذج Hailuo افتراضيّ');
  assert.ok(c.includes('first_frame_image'), 'صورة → تحريك الصورة');
  assert.ok(c.includes('MINIMAX_API_KEY'), 'يعتمد على مفتاح المالك');
  assert.ok(c.includes('minimax_video'), 'يخصم كلفة minimax_video');
  assert.ok(c.includes('refundPoints'), 'يُسترجع الرصيد عند الفشل');
  const p = read('api/_lib/points.js');
  assert.ok(/minimax_video:\s*\d+/.test(p), 'كلفة minimax_video معرّفة');
});

test('٥. الواجهة: خيار المحرّك في القائمة، وفرع العميل، وترجمة كلّ اللغات', () => {
  assert.ok(read('js/partials-core.js').includes('value="minimax"'), 'خيار minimax في القائمة');
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

/* v-video-poll (المالك: «⏳ يولّد الفيديو» ما ينتهي): رفض منطقيّ يرجع ٢٠٠ بلا حقل status وبـ
   base_resp.status_code≠0 كان يُقرأ «لسّا شغّال» فينتظر المستخدم للأبد ولا تُردّ نقاطه. */
test('٦. الرفض المنطقيّ (٢٠٠ بلا status وبـbase_resp) = FAILED وتسوية التذكرة، لا RUNNING أبديّ', async () => {
  process.env.MINIMAX_API_KEY = 'test-key';
  const jobPath = require.resolve('../api/_lib/video-job.js');
  const realJob = require.cache[jobPath];
  const settled = [];
  require.cache[jobPath] = { id: jobPath, filename: jobPath, loaded: true, exports: {
    settleVideoJob: async (id, ok) => { settled.push([id, ok]); },
    rememberVideoJob: async () => {},
  } };
  delete require.cache[require.resolve('../api/_lib/minimax-status.js')];
  const handler = require('../api/_lib/minimax-status.js');
  const realFetch = global.fetch;
  try {
    // رفض منطقيّ: ٢٠٠، لا حقل status إطلاقًا، وbase_resp.status_code ≠ 0
    global.fetch = async () => ({ ok: true, json: async () => ({ base_resp: { status_code: 1002, status_msg: 'rate limit' } }) });
    let res = fakeRes();
    await handler({ method: 'GET', query: { task_id: 'T9' } }, res);
    assert.equal(res.body.status, 'FAILED', 'الرفض المنطقيّ ما زال يُقرأ «لسّا شغّال»');
    assert.deepEqual(settled, [['T9', false]], 'التذكرة لم تُسوَّ فلا تُردّ النقاط');

    // نجاح فعليّ مع base_resp سليم لا يتأثّر
    settled.length = 0;
    global.fetch = async (url) => (/files\/retrieve/.test(String(url))
      ? { ok: true, json: async () => ({ file: { download_url: 'https://cdn/ok.mp4' } }) }
      : { ok: true, json: async () => ({ status: 'Success', file_id: 'F2', base_resp: { status_code: 0 } }) });
    res = fakeRes();
    await handler({ method: 'GET', query: { task_id: 'T8' } }, res);
    assert.equal(res.body.status, 'SUCCEEDED');
    assert.deepEqual(settled, [['T8', true]]);

    // حالة وسط سليمة تبقى RUNNING
    settled.length = 0;
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 'Queueing', base_resp: { status_code: 0 } }) });
    res = fakeRes();
    await handler({ method: 'GET', query: { task_id: 'T7' } }, res);
    assert.equal(res.body.status, 'RUNNING');
    assert.deepEqual(settled, []);
  } finally {
    global.fetch = realFetch;
    if (realJob) require.cache[jobPath] = realJob; else delete require.cache[jobPath];
    delete require.cache[require.resolve('../api/_lib/minimax-status.js')];
  }
});

test('٧. حلقات الاستطلاع (خمس منذ v-actor-lipsync) محروسة بعمر وبأخطاء متتالية، ولا ابتلاع صامت', () => {
  const src = read('js/app-11-video.js');
  assert.equal((src.match(/guard\.tick\(iv\)/g) || []).length, 5, 'حلقة استطلاع بلا حارس');
  assert.equal((src.match(/guard\.fail\(iv\)/g) || []).length, 5, 'خطأ شبكة ما زال يُبتلع بصمت');
  assert.equal((src.match(/guard\.ok\(\)/g) || []).length, 5, 'عدّاد الأخطاء لا يُصفَّر عند نجاح دورة');
  assert.doesNotMatch(src, /catch\(e\)\{ \/\* keep polling \*\/ \}/, 'بقي ابتلاع صامت');
  assert.equal((src.match(/setInterval\(async \(\) => \{/g) || []).length, 5, /* v-actor-lipsync: حلقة الممثّل */ 'عدد الحلقات تغيّر — راجع الحراسة');
  assert.match(src, /function makePollGuard\(reject, everyMs, maxMs\)/);
  assert.ok(read('js/app.bundle.js').includes('function makePollGuard('), 'الحارس ليس في الحزمة — شغّل npm run bundle');
  // سلوك الحارس نفسه: العمر ينتهي، والأخطاء المتتالية تُنهي، والنجاح يصفّرها
  const vm = require('node:vm');
  const body = src.slice(src.indexOf('function makePollGuard('), src.indexOf('\n  }', src.indexOf('fail(iv){')) + 4);
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

test('٨. لا اسم مزوّد ولا مفتاح في رسائل المستخدم من نقطة الحالة', () => {
  const src = read('api/_lib/minimax-status.js');
  const shown = src.match(/error: '[^']*'/g) || [];
  for (const m of shown) assert.doesNotMatch(m, /MiniMax|MINIMAX|Proxy error|Veo|Gemini/, m);
  assert.ok(shown.length >= 3, 'لم تُقرأ رسائل المستخدم');
});

/* v-video-retrieve-refund (المالك: «نعم ترد عادي»): التوليد نجح ورابط الملفّ لم يصل —
   المستخدم دفع ولم يستلم، فتُسوّى التذكرة فشلًا وتُردّ النقاط. */
test('٩. فشل جلب الملفّ بعد نجاح التوليد يردّ النقاط، ومرّة واحدة لا مرّتين', async () => {
  process.env.MINIMAX_API_KEY = 'test-key';
  const jobPath = require.resolve('../api/_lib/video-job.js');
  const realJob = require.cache[jobPath];
  const settled = [];
  require.cache[jobPath] = { id: jobPath, filename: jobPath, loaded: true, exports: {
    settleVideoJob: async (id, ok) => { settled.push([id, ok]); return { settled: true, refunded: !ok }; },
    rememberVideoJob: async () => {},
  } };
  delete require.cache[require.resolve('../api/_lib/minimax-status.js')];
  const handler = require('../api/_lib/minimax-status.js');
  const realFetch = global.fetch;
  try {
    // الاستعلام ينجح ومعه file_id، وجلب الملفّ يفشل
    global.fetch = async (url) => (/files\/retrieve/.test(String(url))
      ? { ok: false, status: 502, json: async () => ({ base_resp: { status_code: 2013 } }) }
      : { ok: true, json: async () => ({ status: 'Success', file_id: 'F9', base_resp: { status_code: 0 } }) });
    let res = fakeRes();
    await handler({ method: 'GET', query: { task_id: 'T5' } }, res);
    assert.equal(res.code, 502);
    assert.deepEqual(settled, [['T5', false]], 'لم تُسوَّ التذكرة فشلًا فلا تُردّ النقاط');
    assert.doesNotMatch(String(res.body.error), /MiniMax|2013|HTTP/, 'رمز تقنيّ في رسالة المستخدم');

    // ردّ ٢٠٠ بلا رابط تنزيل = نفس المعاملة
    settled.length = 0;
    global.fetch = async (url) => (/files\/retrieve/.test(String(url))
      ? { ok: true, json: async () => ({ file: {} }) }
      : { ok: true, json: async () => ({ status: 'Success', file_id: 'F9' }) });
    res = fakeRes();
    await handler({ method: 'GET', query: { task_id: 'T6' } }, res);
    assert.equal(res.code, 502);
    assert.deepEqual(settled, [['T6', false]]);

    // والنجاح الكامل ما زال يسوّي بـtrue (لا استرجاع)
    settled.length = 0;
    global.fetch = async (url) => (/files\/retrieve/.test(String(url))
      ? { ok: true, json: async () => ({ file: { download_url: 'https://cdn/ok.mp4' } }) }
      : { ok: true, json: async () => ({ status: 'Success', file_id: 'F9' }) });
    res = fakeRes();
    await handler({ method: 'GET', query: { task_id: 'T7' } }, res);
    assert.equal(res.body.status, 'SUCCEEDED');
    assert.deepEqual(settled, [['T7', true]]);
  } finally {
    global.fetch = realFetch;
    if (realJob) require.cache[jobPath] = realJob; else delete require.cache[jobPath];
    delete require.cache[require.resolve('../api/_lib/minimax-status.js')];
  }
  // حارس «مرّة واحدة» في الوحدة نفسها، لا في المتّصل
  assert.match(read('api/_lib/video-job.js'), /kvSetIfAbsent\(key \+ ':done'/, 'حارس الاسترجاع المزدوج');
});
