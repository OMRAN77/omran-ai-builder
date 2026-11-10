'use strict';
/* v-video-durations (المالك ٢٧ أكتوبر: «ابداء فيهم كلهم وشيل الازرار الي مافيها التوقيت وافحص الفيديوهات من الصفر»):
   كلّ وضع يُظهر المدد التي يصنعها محرّكه فعلًا، والمدّة المختارة تصل كلّ محرّك، والمهمّة المدفوعة لا تُطلب مرّة ثانية عند
   طول الانتظار، والزحام العابر لا يُنهي الانتظار، والمشاهد المكتملة لا تضيع إن توقّف الفيلم. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const VJS = read('js/video.js');
const V = read('js/app-11-video.js');

/* بيئة صغيرة لحبّات المدّة: القائمة المخفيّة، وحبّات الصفّ الأساسيّ بعدها، وحبّات «خيارات إضافية» في #vmkMoreDur */
function durSandbox(mode, owner, value) {
  const vals = ['5', '8', '10', 'long20', 'film', 'adspot', 'reels'].concat(owner ? ['longMinutes'] : []);
  const col = { style: {} };
  const du = { id: 'videoMakerDuration', value, parentElement: col, options: vals.map((v) => ({ value: v })), changes: 0, dispatchEvent() { this.changes++; } };
  const g = { previousElementSibling: du, parentNode: col };
  const ex = { id: 'vmkMoreDur' };
  const box = { previousElementSibling: null, parentNode: ex };
  const pills = vals.map((v) => ({ dataset: { v }, hidden: false, style: {}, parentNode: ['5', '8', '10'].includes(v) ? g : box }));
  const ctx = {
    M: { querySelectorAll: () => pills },
    id: (x) => (x === 'videoMakerDuration' ? du : x === 'videoMakerMode' ? { value: mode } : null),
    ownerNow: () => owner, Event: function Event() {}, Object,
  };
  const a = VJS.indexOf('  var BASIC_DUR=');
  const b = VJS.indexOf('\n  }\n', VJS.indexOf('function syncDurations(')) + 4;
  assert.ok(a > 0 && b > a, 'BASIC_DUR وDUR_OK وsyncDurations في video.js');
  vm.runInNewContext(VJS.slice(a, b) + '\nthis.sync = syncDurations;', ctx);
  ctx.sync();
  const shown = pills.filter((p) => p.style.display !== 'none').map((p) => p.dataset.v);
  return { shown, du, col };
}

test('١. كلّ وضع يُظهر مدد محرّكه وحدها، والممثّل بلا مدّة أصلًا', () => {
  assert.deepEqual(durSandbox('runway', false, '5').shown, ['5', '8', '10', 'long20', 'film', 'adspot', 'reels']);
  assert.deepEqual(durSandbox('runway', true, '5').shown, ['5', '8', '10', 'long20', 'film', 'adspot', 'reels', 'longMinutes']);
  assert.deepEqual(durSandbox('canvas', false, '5').shown, ['5', '8', '10', 'long20', 'adspot', 'reels'], 'الفيلم موقوف في القوالب');
  assert.deepEqual(durSandbox('minimax', true, '5').shown, ['5', '8', '10'], '«سريع»: بلا ٢٠ ولا فيلم (كان Runway صامتًا) ولا إعلان بسرد لا يُطبَّق');
  assert.deepEqual(durSandbox('veo', false, '5').shown, ['5', '8', '10'], '«سينمائي» للزبون');
  assert.deepEqual(durSandbox('veo', true, '5').shown, ['5', '8', '10', 'film'], 'فيلم «سينمائي» للمالك وحده (بوّابته في app-11)');
  const ac = durSandbox('actor', true, '5');
  assert.deepEqual(ac.shown, []);
  assert.equal(ac.col.style.display, 'none', 'عمود المدّة يختفي: مدّة الممثّل كلامه');
  assert.equal(durSandbox('runway', false, '5').col.style.display, '');
});

test('٢. قيمة لا يدعمها الوضع الجديد ترجع إلى أوّل مدّة مدعومة بحدث change (مرّة واحدة)', () => {
  const r = durSandbox('minimax', true, 'long20');
  assert.equal(r.du.value, '5');
  assert.equal(r.du.changes, 1);
  const ok = durSandbox('runway', false, '8');
  assert.equal(ok.du.value, '8');
  assert.equal(ok.du.changes, 0);
});

test('٣. المدّة تصل كلّ محرّك من متغيّر واحد، و«إعلان/ريلز» لا تُكتب فوق القائمة', () => {
  assert.match(V, /const durVal = \(_dv === 'adspot'\) \? '5' : \(_dv === 'reels'\) \? '10' : _dv;/);
  assert.match(V, /const durSecs = parseInt\(durVal, 10\) \|\| 0;/);
  const g0 = V.indexOf('const _dv = durationEl.value;') + 'const _dv = durationEl.value;'.length; // قراءتها الوحيدة
  const gen = V.slice(g0, V.indexOf('/* v-audit-video (cli-video-4)', g0));
  assert.doesNotMatch(gen, /durationEl\.value\s*=/, 'لا كتابة فوق القائمة داخل الإنشاء');
  assert.doesNotMatch(gen, /durationEl\.value/, 'القراءة من durVal وحده');
  assert.match(gen, /durationSeconds: durSecs \|\| undefined/, 'الاقتصاديّ');
  assert.match(gen, /durationSeconds: \(creationMode === 'veo' && durSecs\) \|\| undefined/, '«سينمائي» (والممثّل على قدّ كلامه)');
  assert.match(V, /style: styleEl\.value, durationSeconds: 8 \}/, 'مشهد فيلم «سينمائي»');
  /* الخوادم: Runway ٢–١٠ كما هي (كانت ٥/١٠)، والاقتصاديّ ٤–١٥ (مختبَر في minimax-video ١٠)، و«سينمائي» ٣–١٠ (cinema-omni ٢) */
  assert.match(read('api/_lib/video-create.js'), /finalDuration = Math\.min\(10, Math\.max\(2, finalDuration\)\);/);
  assert.doesNotMatch(read('api/_lib/video-create.js'), /finalDuration <= 7 \? 5 : 10/);
});

test('٤. طول الانتظار وانقطاع الشبكة لا يطلبان المهمّة المدفوعة مرّة ثانية (كان createSceneWithRetry يعيدها فيُخصم مرّتين)', () => {
  const body = V.slice(V.indexOf('function makePollGuard('), V.indexOf('\n  }', V.indexOf('fail(iv, msg){')) + 4);
  const ctx = { bT: (a) => a, clearInterval: () => {} };
  vm.runInNewContext(body + '\nthis.mk = makePollGuard;', ctx);
  let err = null;
  const g = ctx.mk((e) => { err = e; }, 1000, 2000);
  g.tick(1); g.tick(1);
  assert.ok(err && err.noRetry === true && err.code === 'poll_timeout', 'المهلة');
  err = null;
  const g2 = ctx.mk((e) => { err = e; }, 1000, 60000);
  for (let i = 0; i < 6; i++) g2.fail(1);
  assert.ok(err && err.noRetry === true, 'انقطاع الشبكة');
  const retry = V.slice(V.indexOf('async function createSceneWithRetry('), V.indexOf('const SEQ_COOLDOWN_WAITS_MAX'));
  assert.match(retry, /e\.retryable === false \|\| e\.noRetry\)\) throw e;/, 'لا إعادة لما وُسم noRetry');
});

test('٥. الزحام العابر (٤٢٩/٥xx) لا يُنهي انتظار «سريع» و«سينمائي» والممثّل؛ «unavailable» نهائيّ', () => {
  const n = (V.match(/if\(d\.error && \(st\.status === 429 \|\| st\.status >= 500\) && d\.error !== 'unavailable'\)\{ guard\.fail\(iv, d\.error\); return; \}/g) || []).length; // بنصّ الخادم (مراجعة ٢٧ أكتوبر)
  assert.equal(n, 4, 'الحلقات الأربع: الاقتصاديّ، «سينمائي»، مشهد الفيلم، الممثّل');
  for (const action of ['minimax-status', 'veo-status', 'actor-status']) {
    const at = V.indexOf("action=" + action);
    const seg = V.slice(at, at + 700);
    assert.ok(seg.indexOf("d.error !== 'unavailable'") > 0 && seg.indexOf("d.error !== 'unavailable'") < seg.indexOf('guard.ok()'), action + ': العابر قبل النهائيّ');
  }
});

test('٦. فيلم أو «٢٠ ثانية» يتوقّف: المشاهد المكتملة تُعرض بروابطها ونصّ «اكتمل k من n» بلغة الواجهة', () => {
  assert.match(V, /if\(filmPartial && filmPartial\.length\) showPartialScenes\(filmPartial\.map\(\(sc\) => sc\.videoUrl\), filmTotal, friendlyError\(e\)\);/);
  assert.match(V, /if\(longPartial && longPartial\.length\) showPartialScenes\(longPartial\.slice\(\), 2, friendlyError\(e\)\);/);
  assert.match(V, /filmPartial = builtScenes; filmTotal = scenes\.length;/);
  assert.match(V, /longPartial = null; \/\* v-video-partial: المشاهد كلّها جاهزة \*\//);
  const fn = V.slice(V.indexOf('function partialScenesNote('), V.indexOf('function showPartialScenes('));
  const tr = JSON.parse(read('js/app-11-video-trends-data.js').match(/window\.__VIDEO_TRENDS = (\{[\s\S]*\});?\s*$/)[1]);
  const ctx = { window: { __VIDEO_TRENDS: tr }, localStorage: { getItem: () => 'fr' }, bT: (a) => a, __swallow() {} };
  vm.runInNewContext(fn + '\nthis.note = partialScenesNote;', ctx);
  assert.equal(ctx.note(1, 3), tr.ui.partial.fr.replace('{k}', '1').replace('{n}', '3'));
  assert.equal(Object.keys(tr.ui.partial).length, 14, 'النصّ بالـ١٤ لغة');
});

test('٧. الفتح من المحادثة لغير المالك على قسم يراه («فيديو سريع» — v-five-sections) لا الترندات، و«سينمائي» للجميع', () => {
  assert.match(V, /modal\.dataset\.vmkTab = \(!isOwnerAccount\(\) && \{ runway:1, canvas:1, omni:1, hybrid:1, actor:1 \}\[om\]\) \? 'minimax' : om;/);
  assert.match(V, /if\(creationMode === 'actor' && !isOwnerAccount\(\)\)\{/);
  assert.doesNotMatch(V, /if\(creationMode === 'veo' \|\| creationMode === 'actor'\)\{\n\s+try\{\n\s+if\(!isOwnerAccount\(\)\)\{/, '«سينمائي» لم يعد للمالك وحده');
  assert.match(VJS, /var OWNER_MODES=\{runway:1,canvas:1,omni:1,hybrid:1,actor:1\};/);
});

test('٨. لا اسم مزوّد في نافذة الوضع الطويل للمالك، والحزمة مبنيّة', () => {
  assert.ok(!V.includes('حساب Runway') && !V.includes('your Runway account'));
  const b = read('js/app.bundle.js');
  assert.ok(b.includes('function showPartialScenes(') && b.includes("const durVal = (_dv === 'adspot')"), 'شغّل npm run bundle');
  const vTag = Number((read('index.html').match(/\/js\/video\.js\?v=(\d+)/) || [])[1]);
  assert.ok(vTag >= 460, 'وسم video.js مرفوع (≥ ٤٦٠) — يُقرأ من index.html لا يُثبَّت (سقّاطة البنية vPinTests)');
});

test('٩. (مراجعة ٢٧ أكتوبر) «سينمائي» للزبون يمرّ بنافذة الخصم، والتحميل لا يُضيع فيديو مدفوعًا، والممثّل لا يرث «فيلم»، ولا تسرّب لقائمة مشاهد', () => {
  const a = V.indexOf("const veoPayload = ");
  const seg = V.slice(a, a + 1600);
  assert.match(seg, /window\.postWithConfirm\('\/api\/video\?action=veo-create', veoPayload\)/, 'كان fetch خامًا بلا confirmed ⇒ ٤٢٨ لكلّ زبون');
  assert.match(seg, /throwIfDeclined\(cr\);/);
  assert.match(seg, /\{ code: crData\.error, retryAfter: crData\.retryAfter \|\| 0 \}/, 'الرموز محفوظة لرسائلها');
  assert.match(V, /for\(let k = 0; k < 3 && !\(vres && vres\.ok\); k\+\+\)\{/, 'ثلاث محاولات للتحميل');
  assert.match(V, /if\(!vres \|\| !vres\.ok\)\{\n\s+setStatus\(bT\('✅ تم الانتهاء!','✅ Done!'\)\);\n\s+resultEl\.src = proxyVideoUrl\(videoUrl\);/, 'ثمّ رابط الخادم نفسه');
  const r = durSandbox('actor', true, 'film');
  assert.equal(r.du.value, '5', 'قيمة «فيلم» الباقية ترجع ٥ في الممثّل');
  assert.equal(r.du.changes, 1);
  assert.match(V, /resultEl\.onended = null;\n\s+\{ const oldSceneLinks = document\.getElementById\('filmSceneLinks'\); if\(oldSceneLinks\) oldSceneLinks\.innerHTML = ''; \}/);
  assert.match(VJS, /if\(\(r\.narration\|\|r\.lines\.length\)&&narrOn\) ac\.appendChild\(act\(L\('vwToNarr'\)/, '«للتعليق الصوتيّ» حيث يُدمج وحده');
  const A = read('js/app-17-agent-tools.js');
  assert.match(A, /var vReady = engine === 'veo' && \/\^omni\\\/\/\.test\(String\(vjson\.op \|\| ''\)\);\n\s+while \(vReady \|\| Date\.now\(\) \+ vStep <= vT0 \+ 280000\) \{/, 'الوكيل: استطلاع فوريّ لناتج Omni الجاهز');
});

console.log('✓ video-durations: مدد كلّ وضع، والمدّة تصل كلّ محرّك، ولا خصم مرّتين، والزحام العابر، والمشاهد المكتملة لا تضيع');
