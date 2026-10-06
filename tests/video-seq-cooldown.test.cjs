// tests/video-seq-cooldown.test.cjs — v-video-seq-cooldown + v-film-mode-gate (بلاغ «وكيل عمران» تحقّق منه
// v-video-trend-dl سطرًا بسطر، وأمر المالك «أصلح»): (١) قفل «فيديو واحد كلّ ٣ دقائق» يبدأ عند قبول المشهد ولا
// يُفكّ إلّا بالفشل، وسلسلة المشاهد (فيلم متكامل، ٢٠ ثانية، ترند بيكسار) كانت تطلب التالي فور جهوز الأوّل
// فتُرفض بـvideo_cooldown وتموت كلّها والمشهد الأوّل مدفوع — والخادم يعلن المهلة كاملة لا المتبقّي.
// (٢) فحص «فيلم متكامل» كان يسبق فحص الوضع فتذهب كانفا المجّانيّة وبقيّة الأوضاع بصمت إلى المحرّك
// الأساسيّ المدفوع. القاعدة نفسها (٣ دقائق) لم تُمسّ، ولا إعادة عمياء (v-video-refund).
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const VIDEO = read('js/app-11-video.js');
const TRENDS = read('js/app-11-video-trends.js');
const LANGS = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne', 'ml', 'fil', 'id', 'zh', 'ru', 'tr', 'es'];

/* كتلة متوازنة الأقواس بالعدّ لا بتخمين سطر نهايتها. */
function extractBlock(source, startNeedle) {
  const a = source.indexOf(startNeedle);
  assert.ok(a > 0, 'بداية الكتلة: ' + startNeedle);
  const braceStart = source.indexOf('{', a);
  let depth = 0, i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.equal(depth, 0, 'قوس المطابقة لم يُغلق: ' + startNeedle);
  return source.slice(a, i + 1);
}

test('١. abuse-guard: retryAfter = المتبقّي الفعليّ من المهلة لا ١٨٠ دائمًا، وبلا kvGetRaw أو بعطبها المهلة كاملة', async () => {
  const g = require('../api/_lib/abuse-guard.js');
  assert.equal(g.VIDEO_COOLDOWN_SEC, 180, 'طول المهلة نفسه لم يُمسّ — باب المالك');
  const m = new Map();
  const kv = {
    kvSetIfAbsent: async (k, v) => { if (m.has(k)) return false; m.set(k, String(v)); return true; },
    kvGetRaw: async (k) => (m.has(k) ? m.get(k) : null),
    kvDel: async (k) => { m.delete(k); },
  };
  assert.equal((await g.videoLock('sara', { kv })).ok, true);
  const now = await g.videoLock('sara', { kv });
  assert.deepEqual([now.ok, now.reason, now.retryAfter], [false, 'video_cooldown', 180], 'فورًا = المهلة كاملة');
  m.set('abuse:video:sara', String(Date.now() - 100_000));
  assert.equal((await g.videoLock('sara', { kv })).retryAfter, 80, 'قُفل قبل ١٠٠ ثانية ⇒ الباقي ٨٠');
  m.set('abuse:video:sara', String(Date.now() - 179_500));
  assert.equal((await g.videoLock('sara', { kv })).retryAfter, 1, 'آخر نصف ثانية ⇒ ١ لا صفر ولا سالب');
  m.set('abuse:video:sara', 'garbage');
  assert.equal((await g.videoLock('sara', { kv })).retryAfter, 180, 'قيمة تالفة = المهلة كاملة');
  const noGet = { kvSetIfAbsent: kv.kvSetIfAbsent };
  assert.equal((await g.videoLock('sara', { kv: noGet })).retryAfter, 180, 'kv بلا kvGetRaw (مثل اختبار plan-routing) = ١٨٠');
  const broken = { kvSetIfAbsent: kv.kvSetIfAbsent, kvGetRaw: async () => { throw new Error('redis down'); } };
  assert.equal((await g.videoLock('sara', { kv: broken })).retryAfter, 180, 'GET يعطب = المهلة كاملة، والرفض نفسه باقٍ');
  await g.releaseVideoLock('sara', { kv });
  assert.equal((await g.videoLock('sara', { kv })).ok, true, 'الفكّ عند الفشل كما كان');
});

/* ينفّذ مساعدات السلسلة الحقيقيّة من app-11-video.js: setTimeout فوريّ فنعدّ رسائل العدّ التنازليّ بدل الثواني. */
function seqSandbox() {
  const statuses = [];
  const ctx = {
    window: {},
    setStatus: (s) => statuses.push(s),
    setTimeout: (fn) => { fn(); return 1; },
    bT: (a) => a,
  };
  const body = [
    (VIDEO.match(/const SEQ_COOLDOWN_WAITS_MAX = \d+;/) || [''])[0],
    extractBlock(VIDEO, 'function sceneWaitText(sceneNo, total, secs){'),
    extractBlock(VIDEO, 'async function waitOutCooldown(err, sceneNo, total){'),
    extractBlock(VIDEO, 'async function sceneInSequence(sceneNo, total, run){'),
    'this.sceneInSequence = sceneInSequence;',
  ].join('\n');
  assert.ok(body.startsWith('const SEQ_COOLDOWN_WAITS_MAX = 2;'), 'حدّ الانتظار مرّتان');
  vm.runInNewContext(body, ctx);
  return { ctx, statuses };
}
const cooldownErr = (retryAfter) => Object.assign(new Error('video_cooldown'), retryAfter === undefined ? { code: 'video_cooldown' } : { code: 'video_cooldown', retryAfter });

test('٢. سلسلة المشاهد: video_cooldown = انتظار المتبقّي المعلَن بعدّ تنازليّ ظاهر ثمّ إعادة المشهد نفسه — لا موت', async () => {
  const { ctx, statuses } = seqSandbox();
  let calls = 0;
  const out = await ctx.sceneInSequence(2, 3, async () => { calls++; if (calls === 1) throw cooldownErr(7); return 'https://cdn/scene2.mp4'; });
  assert.equal(out, 'https://cdn/scene2.mp4');
  assert.equal(calls, 2, 'نداء ثانٍ واحد بعد الانتظار');
  assert.equal(statuses.length, 7, 'ثانية بثانية بقدر المتبقّي المعلَن (٧) لا ١٨٠');
  assert.match(statuses[0], /المشهد 2\/3/); assert.match(statuses[0], /7 ثانية/);
  assert.match(statuses[6], /1 ثانية/);
  assert.doesNotMatch(statuses.join(' '), /veo|runway|minimax|gemini|claude/i, 'لا اسم مزوّد في نصّ المستخدم');
});

test('٣. خطأ غير المهلة يُرفع فورًا بلا انتظار؛ المهلة المتكرّرة تنتظر مرّتين كحدّ ثمّ تُرفع؛ بلا retryAfter = ١٨٠', async () => {
  const { ctx, statuses } = seqSandbox();
  await assert.rejects(ctx.sceneInSequence(1, 2, async () => { throw Object.assign(new Error('x'), { code: 'daily_limit_reached' }); }), /x/);
  assert.equal(statuses.length, 0, 'لا انتظار لغير المهلة');
  let n = 0;
  await assert.rejects(ctx.sceneInSequence(1, 2, async () => { n++; throw cooldownErr(2); }), (e) => e.code === 'video_cooldown');
  assert.equal(n, 3, 'محاولة + انتظاران بمحاولتين + الثالثة تُرفع');
  assert.equal(statuses.length, 4, 'انتظاران × ثانيتان');
  const s2 = seqSandbox();
  let k = 0;
  assert.equal(await s2.ctx.sceneInSequence(1, 2, async () => { if (k++ === 0) throw cooldownErr(); return 'ok'; }), 'ok');
  assert.equal(s2.statuses.length, 180, 'بلا retryAfter = المهلة كاملة لا صفر');
});

test('٤. التوصيل: حلقتا الفيلم والـ٢٠ ثانية تمرّان بالسلسلة، وcreateVeoScene ينقل الرمز والمهلة، والمشهد الوحيد كما كان', () => {
  assert.match(VIDEO, /const videoUrl = await sceneInSequence\(i \+ 1, scenes\.length, \(\) => filmUseVeo\n\s+\? createVeoScene\(/, 'حلقة الفيلم');
  assert.match(VIDEO, /const url = await sceneInSequence\(i \+ 1, scenePrompts\.length, \(\) => createSceneWithRetry\(scenePrompts\[i\]/, 'حلقة ٢٠ ثانية');
  assert.match(VIDEO, /throw Object\.assign\(new Error\(crData\.error \|\| 'veo create failed'\), \{ code: crData\.error, retryAfter: crData\.retryAfter \|\| 0 \}\)/, 'المحرّك الاحترافيّ ينقل الرمز والمهلة كالأساسيّ');
  assert.match(VIDEO, /if\(e && e\.code === 'video_cooldown'\) throw e;/, 'المشهد الوحيد: لا إعادة عمياء (v-video-refund)');
  const a = VIDEO.indexOf("setStatus(bT('🚀 جاري إرسال الطلب...'");
  const single = VIDEO.slice(a, VIDEO.indexOf('sceneUrls.push(url);', a));
  assert.ok(a > 0 && single.length > 0);
  assert.doesNotMatch(single, /sceneInSequence/, 'المشهد الوحيد لا يمرّ بالسلسلة — رسالة المهلة بلا انتظار');
});

/* ينفّذ بوّابة «فيلم متكامل» الحقيقيّة: يخرج قبل السيناريو لكلّ وضع غير مدعوم، ويمرّ للمدعومين. */
function gateSandbox(creationMode) {
  const needle = "        if(creationMode !== 'runway' && !filmUseVeo){";
  const block = extractBlock(VIDEO, needle);
  const statuses = [];
  const ctx = { creationMode, filmUseVeo: creationMode === 'veo', setStatus: (s) => statuses.push(s), btnGenerate: { disabled: true }, window: {}, bT: (a) => a };
  const returned = vm.runInNewContext('(function(){ ' + block + ' return "passed"; })()', ctx);
  return { returned, statuses, btn: ctx.btnGenerate };
}

test('٥. بوّابة «فيلم متكامل»: كانفا/الاقتصاديّ/السينمائيّ/الدمج/الممثّل تُوقَف برسالة «لم يُخصم شيء» قبل أيّ نداء، والأساسيّ والاحترافيّ يمرّان', () => {
  for (const mode of ['canvas', 'minimax', 'omni', 'hybrid', 'actor']) {
    const r = gateSandbox(mode);
    assert.equal(r.returned, undefined, mode + ': يخرج قبل السيناريو');
    assert.equal(r.statuses.length, 1, mode);
    assert.match(r.statuses[0], /لم يُخصم شيء/, mode);
    assert.equal(r.btn.disabled, false, mode + ': الزرّ يعود');
  }
  for (const mode of ['runway', 'veo']) assert.equal(gateSandbox(mode).returned, 'passed', mode + ': يمرّ');
  const gateAt = VIDEO.indexOf("if(creationMode !== 'runway' && !filmUseVeo){");
  const filmAt = VIDEO.indexOf("if(durationEl.value === 'film'){");
  const scriptAt = VIDEO.indexOf("fetch('/api/video-script'");
  assert.ok(filmAt < gateAt && gateAt < scriptAt, 'البوّابة داخل فرع الفيلم وقبل أوّل نداء شبكة فيه');
  // قيم القائمة الحقيقيّة: runway هو الأساسيّ (المختار افتراضيًّا) وveo الاحترافيّ
  const sel = read('js/partials-core.js');
  assert.match(sel, /<option value="runway" selected/);
  assert.match(sel, /<option value="canvas"/);
  assert.match(sel, /<option value="veo"/);
});

test('٦. الترندات: المشاهد المتعدّدة تمرّ بـclipInSequence بعدّ تنازليّ، والمشهد الوحيد يُرفع فورًا؛ waitNext بالـ١٤ لغة', async () => {
  assert.match(TRENDS, /urls\.push\(await clipInSequence\(t, Object\.assign\(\{ sceneIndex: i \}, params\), token, i \+ 1, n\)\);/);
  const ctx = { statuses: [], ui: (k) => (k === 'waitNext' ? 'W {i}/{n} {s}' : k), sleep: async () => {}, oneClip: null };
  ctx.status = (s) => ctx.statuses.push(s);
  const body = (TRENDS.match(/var SEQ_WAITS_MAX = \d+;/) || [''])[0] + '\n' + extractBlock(TRENDS, 'async function clipInSequence(t, params, token, sceneNo, total){') + '\nthis.clipInSequence = clipInSequence;';
  assert.ok(body.startsWith('var SEQ_WAITS_MAX = 2;'));
  vm.runInNewContext(body, ctx);
  let n = 0;
  ctx.oneClip = async () => { if (n++ === 0) throw cooldownErr(3); return 'u2'; };
  assert.equal(await ctx.clipInSequence({}, {}, 'tok', 2, 3), 'u2');
  assert.deepEqual(ctx.statuses, ['W 2/3 3', 'W 2/3 2', 'W 2/3 1'], 'عدّ تنازليّ بالمتبقّي المعلَن');
  n = 0; ctx.statuses.length = 0;
  await assert.rejects(ctx.clipInSequence({}, {}, 'tok', 1, 1), (e) => e.code === 'video_cooldown');
  assert.equal(ctx.statuses.length, 0, 'مشهد وحيد: بلا انتظار — errText تعرض المهلة كما كانت');
  const c = { window: {} }; vm.runInNewContext(read('js/app-11-video-trends-data.js'), c);
  const ui = c.window.__VIDEO_TRENDS.ui;
  assert.deepEqual(Object.keys(ui.waitNext).sort(), Object.keys(ui.cooldown).sort(), 'نفس الـ١٤ لغة');
  for (const l of Object.keys(ui.waitNext)) {
    for (const p of ['{i}', '{n}', '{s}']) assert.ok(ui.waitNext[l].includes(p), l + ': بلا ' + p);
    assert.doesNotMatch(ui.waitNext[l], /veo|runway|minimax|gemini|claude/i, l + ': اسم مزوّد');
  }
  assert.ok(c.window.__VIDEO_TRENDS.trends.some((t) => t.scenes > 1), 'يوجد ترند متعدّد المشاهد فعلًا (بيكسار)');
});

test('٧. المفتاحان الجديدان في الـ١٤ لغة (app-03 + i18n/*.js) بالمتغيّرات وبلا اسم مزوّد، ووسم ?v= مرفوع', () => {
  const base = read('js/app-03-i18n-data.js');
  const a = base.indexOf('const I18N = {');
  const b = base.indexOf('};window.I18N = I18N;', a);
  assert.ok(a >= 0 && b > a, 'قاموس ar/en');
  const ctx = { window: {}, document: {} };
  vm.createContext(ctx);
  vm.runInContext(base.slice(a, b + 2), ctx);
  for (const l of LANGS.filter((x) => x !== 'ar' && x !== 'en')) vm.runInContext(read('i18n/' + l + '.js'), ctx, { filename: l + '.js' });
  const I18N = vm.runInContext('I18N', ctx);
  for (const l of LANGS) {
    const w = I18N[l] && I18N[l].videoSceneWait, g = I18N[l] && I18N[l].videoFilmModeOnly;
    assert.ok(typeof w === 'string' && w.trim(), l + ': videoSceneWait');
    for (const p of ['{i}', '{n}', '{s}']) assert.ok(w.includes(p), l + ': videoSceneWait بلا ' + p);
    assert.ok(typeof g === 'string' && g.trim().length > 20, l + ': videoFilmModeOnly');
    assert.doesNotMatch(w + g, /veo|runway|minimax|gemini|claude/i, l + ': اسم مزوّد في نصّ المستخدم');
    assert.ok(![...(w + g)].some((ch) => /\p{Cf}|\p{Co}|\p{Cc}/u.test(ch)), l + ': حرف خفيّ');
  }
  assert.match(read('js/app-04-i18n-state.js'), /sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=723'/, 'الوسم مرفوع لملفّات اللغات المحمّلة منفصلة');
  // الواجهة تقرأ المفتاحين عبر t() مع احتياط ثنائيّ اللغة (نمط videoNeedDesc نفسه)
  assert.match(VIDEO, /window\.t\('videoSceneWait'\) !== 'videoSceneWait'/);
  assert.match(VIDEO, /window\.t\('videoFilmModeOnly'\) !== 'videoFilmModeOnly'/);
});

test('٨. الحزمة مبنيّة من الأجزاء (لا تحرير يدويّ)', () => {
  const b = read('js/app.bundle.js');
  assert.ok(b.includes('async function sceneInSequence(sceneNo, total, run){'), 'جزء صانع الفيديو');
  assert.ok(b.includes('async function clipInSequence(t, params, token, sceneNo, total){'), 'جزء الترندات');
  assert.ok(b.includes('"waitNext":{'), 'بيانات الترندات');
});

console.log('✓ video-seq-cooldown: سلسلة المشاهد تنتظر المتبقّي الفعليّ من المهلة بدل أن تموت، و«فيلم متكامل» لا يحوّل الأوضاع بصمت');
