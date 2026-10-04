'use strict';
/* v-studio-slots (أمر المالك ٣٠ سبتمبر «ترتيب تسهيل للمستخدم في إضافة الصور — في ستايل»):
   نافذة «💄 ستايل الذكاء الاصطناعي»: الصورة أوّلًا في خانة كبيرة (كاميرا/معرض/آخر صوري، سحب وإفلات ولصق، حذف وتبديل)،
   الدمج خانتان، الاختياريّ مطويّ قبل الزرّ، والزرّ يرشد إلى الخانة الناقصة؛ والصورة الثانية تُضغط كالأولى. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const html = (() => { const s = read('js/partials-core.js'); const a = s.indexOf('<div id="studioAiModal"'); return s.slice(a, s.indexOf('<div id="religionModal"', a)); })();
const js = (() => { const s = read('js/app-13-stocks-init.js'); const a = s.indexOf('/* ---------- 💄 AI Style Studio'); return s.slice(a); })();
const pos = (k) => { const i = html.indexOf(k); assert.ok(i !== -1, k); return i; };

test('١. الترتيب: صورتك ← الميزة والخيار ← الخيارات الإضافيّة المطويّة ← الزرّ', () => {
  assert.ok(pos('data-i18n="studioStepPhoto"') < pos('id="studioAiSlotA"'));
  assert.ok(pos('id="studioAiSlotB"') < pos('data-i18n="studioStepWhat"'));
  assert.ok(pos('data-i18n="studioStepWhat"') < pos('id="studioAiTabs"'));
  assert.ok(pos('id="studioAiTabs"') < pos('id="studioStyleCards"'));
  const more = pos('<details id="studioAiMore">'), end = html.indexOf('</details>\n\n    <button type="button" class="btn primary" id="studioAiGenerateBtn"');
  assert.ok(more > pos('id="studioStyleCards"') && end > more, 'الخيارات الإضافيّة مطويّة قبل الزرّ');
  for (const id of ['studioProfileSaveBtn', 'studioAiOccasion', 'studioAiSuggestBtn', 'studioAiDescription', 'studioAiMultiAngle']) {
    const i = pos('id="' + id + '"'); assert.ok(i > more && i < end, id + ' داخل «خيارات إضافيّة»');
  }
  const opens = (html.replace(/<style[\s\S]*?<\/style>/, '').match(/<div\b/g) || []).length;
  assert.equal(opens, (html.match(/<\/div>/g) || []).length, 'الوسوم متوازنة');
  for (const id of ['studioAiFileInputA', 'studioAiFileInputB', 'studioAiFileBtnA', 'studioAiFileNameA', 'studioAiSourcePreviewA', 'studioAiImageBWrap', 'studioAiImageALabelEl']) pos('id="' + id + '"');
});

test('٢. الخانة: كاميرا (للّمس) ومعرض — بلا «آخر صوري» (أمر المالك) — وسحب وإفلات ولصق، حذف وتبديل', () => {
  assert.match(js, /if\(coarse\) add\(t\('studioSrcCamera'\), \(\) => studioCamera\(which\)\);/);
  assert.match(js, /studioCam\.setAttribute\('capture', 'user'\)/);
  assert.match(js, /add\(t\('studioSrcGallery'\), \(\) => \(which === 'A' \? fileInputA : fileInputB\)\.click\(\)\);/);
  assert.doesNotMatch(js, /studioRecent|studioRemember|studioSrcRecent|dataUrlToFile/, 'لا «آخر صوري» ولا حفظ للصور');
  assert.match(js, /try\{ localStorage\.removeItem\('omStudioRecent'\); \}/, 'المحفوظ سابقًا يُمسح');
  assert.doesNotMatch(html, /stRecent/);
  assert.match(js, /el\.addEventListener\('drop', \(e\) => \{/);
  assert.match(js, /document\.addEventListener\('paste', \(e\) => \{/);
  assert.match(js, /if\(act === 'remove'\)\{ studioClearPhoto\(which\); return; \}/);
});

test('٣. الصورتان تُضغطان، والزرّ يرشد إلى الخانة الناقصة', () => {
  assert.match(js, /fileInputB\.onchange = \(\) => \{ const f = fileInputB\.files && fileInputB\.files\[0\]; if\(f\) studioSetPhoto\('B', f\); \};/);
  assert.match(js, /function studioSetPhoto\(which, file\)\{[\s\S]*?normalizeStudioPhoto\(file\)/);
  assert.doesNotMatch(js.slice(js.indexOf('fileInputB.onchange'), js.indexOf('btnGenerate.onclick')), /FileReader/, 'لا رفع خام للصورة الثانية');
  assert.match(js, /studioOpenMenu\(studioMissing\(\)\); \/\* v-studio-slots/);
  assert.match(js, /btnGenerate\.textContent = studioMissing\(\) \? t\('studioAddPhotoCta'\) : t\('studioAiGenerateBtn'\);/);
  assert.match(js, /slotsRow\.classList\.toggle\('two', feature === 'merge'\)/);
});

test('٤. النصوص الجديدة بالـ١٤ لغة، والحزمة والوسوم', () => {
  for (const f of ['js/app-03-i18n-data.js', 'i18n/fr.js']) assert.ok(!read(f).includes('studioSrcRecent'), 'مفتاح «آخر صوري» حُذف');
  const K = ['studioStepPhoto', 'studioStepWhat', 'studioSlotAdd', 'studioSlotDropHint', 'studioSlotChange', 'studioSrcCamera', 'studioSrcGallery', 'studioMoreOptions', 'studioAddPhotoCta'];
  const d = read('js/app-03-i18n-data.js');
  for (const k of K) assert.equal((d.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, k + ' ar+en');
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const s = read('i18n/' + lg + '.js');
    for (const k of K) assert.ok(new RegExp('"?' + k + '"?:').test(s), lg + ' ' + k);
  }
  assert.ok(read('js/app.bundle.js').includes("function studioSetPhoto(which, file){"), 'الحزمة أُعيد بناؤها');
  assert.ok(read('index.html').includes('/js/partials-core.js?v=654'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=716'"));
});

test('٥. المقارنة (لقطة المالك «كيف الشخص يعرف الشكل»): بطاقات مصوّرة مطويّة، وثلاثة كحدّ أقصى', () => {
  assert.ok(pos('<details id="studioAiCompareMore"') < pos('id="studioAiCompareChecks" class="stCmpGrid"'), 'القائمة مطويّة');
  assert.ok(pos('id="studioAiCompareBtn"') < html.indexOf('</details>', pos('id="studioAiCompareMore"')));
  assert.ok(pos('id="studioAiCompareResults"') > html.indexOf('</details>', pos('id="studioAiCompareMore"')), 'النتائج ظاهرة خارج الطيّ');
  const b = js.slice(js.indexOf('function buildCompareChecks(){'), js.indexOf('const studioCardsEl'));
  assert.match(b, /const srcs = optionImgs\(feature, opt\.value\);/, 'صورة الخيار نفسها');
  assert.match(b, /window\.__omranWhenSeen\(img,/, 'تُحمَّل عند ظهورها');
  assert.match(b, /querySelectorAll\('\.studioCompareCheck:checked'\)\.length > 3\)\{ cb\.checked = false; return; \}/);
  assert.doesNotMatch(b, /innerHTML = '<input type="checkbox"/, 'لا مربّعات نصّيّة');
  assert.match(js, /compareChecksEl\.querySelectorAll\('\.studioCompareCheck:checked'\)/, 'قارئ المقارنة كما هو');
  assert.ok(read('index.html').includes('/js/partials-core.js?v=654'));
});

test('٦. قائمة المصدر (لقطة المالك «شوف وين تتحرك عند الإضافة»): ورقة من الأسفل للّمس، وتحت الخانة للحاسوب', () => {
  assert.match(js, /if\(coarse\)\{\n\s+menu\.classList\.add\('sheet'\);/);
  assert.match(js, /bd\.id = 'studioSrcBackdrop'/, 'خلفيّة معتمة تُغلق باللمس');
  assert.match(js, /const below = r\.bottom \+ 8, above = r\.top - mh - 8;/, 'تحت الخانة، وفوقها إن ضاق ما تحتها');
  assert.doesNotMatch(js, /r\.top \+ r\.height \/ 2/, 'لا وسط الخانة فوق الميزات');
  assert.match(html, /\.stSrcMenu\.sheet\{left:0; right:0; bottom:0;/);
  assert.ok(read('index.html').includes('/js/partials-core.js?v=654'));
});
