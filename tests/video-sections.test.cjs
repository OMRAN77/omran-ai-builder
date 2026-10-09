// tests/video-sections.test.cjs — v-vmk-sections: شريط أقسام (الترندات + الأوضاع)، ٣ نماذج لكلّ وضع، وشخصيّات داخل الفيديو
// (المالك: «الترندات فوق وعقبها كانفا قسم وفيديو AI قسم… بلا تقسيم الترندات» + «٣ نماذج» + «نضيف شخصيّات والمتحدّث والكتابة»)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const js = read('js/video.js');

const MODES = ['Canvas', 'Runway', 'Minimax', 'Omni', 'Hybrid', 'Veo', 'Actor'];
const KEYS = ['vcTutorial', 'vcToExtra', 'vcMore', 'videoTabTrends', 'vcTitle', 'vcSub', 'vcAdd', 'vcName', 'vcLine', 'vcMale', 'vcFemale', 'vcRemove', 'vwToChars']
  .concat(MODES.reduce((a, m) => a.concat(['videoIdea' + m + '2', 'videoIdea' + m + '3']), []));
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

test('الأقسام: الترندات أوّلًا ثمّ كلّ وضع، والتبويب يبدّل الوضع ويخفي الاستوديو في الترندات', () => {
  assert.ok(js.includes("var TABS=['trend','canvas','runway','minimax','omni','hybrid','veo','actor']"));
  assert.ok(js.includes("var tab='trend'") && js.includes("if(open&&!wasOpen){ tab='trend'; }"));
  assert.ok(js.includes("sel.value=v; sel.dispatchEvent(new Event('change'))"));
  const css = read('css/modules.css');
  assert.ok(css.includes('.vmk-studio.vmk-tab-trend>.vmk-side'));
  assert.ok(css.includes('.vmk-studio:not(.vmk-tab-trend)>#vtRoot'));
  assert.ok(css.includes('.vmk-cards,#videoMakerModal .vmk-main label[data-i18n="videoModeLabel"]{display:none'));
});

test('النماذج: ثلاث بطاقات لكلّ وضع (فيديو تعليميّ + مثالان) من مفاتيح اللغة، والفيديو يُقرأ من الجدول بلا طلب شبكة، وبلا عنوان «نماذج جاهزة»', () => {
  assert.ok(js.includes("keys=['videoIdea'+c,'videoIdea'+c+'2']"));
  assert.ok(js.includes("var VIDEOS={}") && js.includes("/media/samples/"));
  assert.ok(!/نماذج جاهزة/.test(js) && !/نماذج جاهزة/.test(read('js/app-03-i18n-data.js')));
});

test('الشخصيّات: حتّى ثلاث، تُدمَج في الوصف عند «إنشاء» بلا تكرار، والكتابة تعرف أسماءها', () => {
  assert.ok(js.includes('var MAXCH=3'));
  assert.ok(js.includes("gb.addEventListener('click',compose,true)"));
  assert.ok(js.includes('v.slice(-lastBlock.length)===lastBlock'));
  assert.ok(js.includes("characters:chars.map(function(c){return c.name.trim();})"));
  assert.ok(js.includes("L('vwToChars')"));
});

test('النصوص الجديدة بالـ١٤ لغة (ar+en في القاموس الأساسيّ، و١٢ ملفّ لغة)', () => {
  const base = read('js/app-03-i18n-data.js');
  KEYS.forEach((k) => assert.equal((base.match(new RegExp('\\b' + k + ': "', 'g')) || []).length, 2, k));
  LANGS.forEach((lg) => { const s = read('i18n/' + lg + '.js'); KEYS.forEach((k) => assert.ok(new RegExp('^\\s*' + k + ': "[^"]+",', 'm').test(s), lg + ' ← ' + k)); });
});

test('نظافة الواجهة (طلب المالك «شيل الأيقونات… شغل نضيف»): بطاقة الترند بلا إيموجي ولا سطر وصف تحتها، والنافذة تُنظَّف عند العرض', () => {
  const tr = read('js/app-11-video-trends.js');
  assert.ok(!/t\.em\b/.test(tr), 'لا إيموجي الترند في البطاقة ولا في الرأس');
  assert.ok(!/T\(t\.sub\)/.test(tr.slice(tr.indexOf('function card('), tr.indexOf('function renderGrid('))), 'لا سطر وصف تحت البطاقة');
  assert.ok(tr.includes('function noEmoji(') && tr.includes('return noEmoji(T(D.ui[k]))'));
  assert.ok(js.includes('function scrub()') && js.includes('sync(); scrub(); }'));
  assert.ok(!/'⚡ '|'🎁|⚙️/.test(js), 'شارات النقاط والخيارات المتقدّمة بلا إيموجي');
  // الدالّة نفسها: تزيل الإيموجي وتبقي النصّ والأرقام
  const re = /[\u{1F000}-\u{1FFFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  assert.equal('🎬 قصة بيكسار ٣ ⚡ 60 نقطة ✨'.replace(re, '').replace(/\s{2,}/g, ' ').trim(), 'قصة بيكسار ٣ 60 نقطة');
});

test('البساطة (طلب المالك «أبسّط للجمهور»): الظاهر الوصف والمدّة الأساسيّة والشكل وزرّ الإنشاء، والباقي مطويّ في «خيارات إضافية»', () => {
  assert.ok(js.includes("var BASIC_DUR={'5':1,'8':1,'10':1}"));
  assert.ok(js.includes("if(!BASIC_DUR[c.dataset.v]) box.appendChild(c)"));
  ['vmkWrite', 'vmkChars', 'videoMakerSignatureRow', 'videoMakerHeroRow', 'videoMakerNarrationRow'].forEach((x) => assert.ok(js.includes("id('" + x + "')"), x));
  const css = read('css/modules.css');
  assert.ok(css.includes('.vmk-side>p{display:none!important}') && css.includes('.vmk-chips .vmk-chip:not(.pts){display:none}'));
});

test('الفيديو التعليميّ (طلب المالك): أوّل بطاقة في كلّ وضع وزرّ في الترندات، والملفّات مسجَّلة من الصانع نفسه، والمساعد داخل نموذج الترند', () => {
  const fs2 = require('node:fs');
  assert.ok(js.includes("te.className='vmk-sm vmk-sm-tut'") && js.includes("function openPlayer(src)") && js.includes("id='vmkTutLink'") || js.includes("b.id='vmkTutLink'"));
  assert.ok(js.includes("'/media/samples/tutorial-'+(ar()?'ar':'en')+'.mp4'"));
  ['ar', 'en'].forEach((l) => {
    ['mp4', 'jpg'].forEach((x) => assert.ok(fs2.existsSync(path.join(root, 'media/samples/tutorial-' + l + '.' + x)), l + '.' + x));
    assert.ok(fs2.statSync(path.join(root, 'media/samples/tutorial-' + l + '.mp4')).size < 10 * 1024 * 1024, 'حجم معقول (١٠٨٠ مُمنتَج، يُحمَّل عند الضغط فقط)');
  });
  assert.ok(fs2.existsSync(path.join(root, 'scripts/video-tutorial.mjs')), 'سكربت التسجيل يُعيد إنتاج الفيديو');
  const tr = read('js/app-11-video-trends.js');
  assert.ok(tr.includes('function assistant(t)') && tr.includes("action=video-write") && tr.includes('panel.appendChild(assistant(t))'));
});

test('نماذج الجودة (طلب المالك «سوّ الفيديوهات من نفس المحرّكات»): الصانع يقرأ قائمة الملفّات، والبطاقة تفتح الفيديو، والتوليد بأمر صريح فقط', () => {
  assert.ok(js.includes("/media/samples/index.json") && js.includes('function loadManifest()'));
  assert.ok(js.includes("if(vsrc) openPlayer(vsrc)") && js.includes("vd.poster='/media/samples/'"));
  assert.deepEqual(JSON.parse(read('media/samples/index.json')) && typeof JSON.parse(read('media/samples/index.json')), 'object');
  const wf = read('.github/workflows/video-samples.yml');
  assert.ok(wf.includes("on:\n  workflow_dispatch:") && !/\n\s+(push|schedule|pull_request):/.test(wf), 'يدويّ فقط');
  assert.ok(wf.includes("if: ${{ inputs.confirm == 'yes' }}"), 'تأكيد الصرف صريح');
  assert.ok(wf.includes('secrets.SAMPLE_TOKEN'));
  const sc = read('scripts/video-samples.mjs');
  assert.ok(sc.includes('--dry') && sc.includes("SAMPLE_TOKEN مفقود") && sc.includes("index[key] = true"));
  assert.ok(!/(sk-|AIza|ghp_|github_pat_)[A-Za-z0-9_-]{16,}/.test(sc + wf), 'لا أسرار');
});

test('نماذج الكانفا (مجّانيّة، مولَّدة من الصانع نفسه): ملفّان مسجَّلان في القائمة وبحجم معقول', () => {
  const idx = JSON.parse(read('media/samples/index.json'));
  ['canvas-1', 'canvas-2'].forEach((k) => {
    assert.equal(idx[k], true, k + ' في القائمة');
    ['mp4', 'jpg'].forEach((x) => assert.ok(fs.existsSync(path.join(root, 'media/samples/' + k + '.' + x)), k + '.' + x));
    assert.ok(fs.statSync(path.join(root, 'media/samples/' + k + '.mp4')).size < 4 * 1024 * 1024, 'حجم معقول');
  });
  assert.ok(read('scripts/video-samples.mjs').includes("document.getElementById('videoMakerResult')"), 'العنصر نفسه هو <video>');
});

test('رفع فيديوهات المالك (طلبه: «كيف أرفع الفيديوهات… بجودة عالية»): مجلّد raw ومسار يضغط ويسجّل وينشر، والعنوان يغلب المثال', () => {
  const ing = read('scripts/samples-ingest.mjs');
  assert.ok(ing.includes("'canvas', 'runway', 'minimax', 'omni', 'hybrid', 'veo', 'actor'") && ing.includes("(mp4|mov|webm|m4v)$"));
  assert.ok(ing.includes("'-crf', '20'") && ing.includes("min(1920,iw)") && ing.includes("index[key] = title ? { title } : true") && ing.includes('fs.rmSync(src)'));
  const wf = read('.github/workflows/samples-ingest.yml');
  assert.ok(wf.includes("paths: ['media/samples/raw/**']") && wf.includes('git push origin HEAD:main'));
  assert.ok(fs.existsSync(path.join(root, 'media/samples/raw/README.md')));
  assert.ok(js.includes('tx=(vm&&vm.title)||L(k)'), 'عنوان الفيديو المرفوع يغلب المثال');
  const tut = read('scripts/video-tutorial.mjs');
  assert.ok(tut.includes('deviceScaleFactor: 2') && tut.includes('window.R = function (t)') && tut.includes("viewport: { width: 1920, height: 1080 }"), 'التعليميّ مُمنتَج: لقطات بدقّة مضاعفة وتركيب يُرسم إطارًا إطارًا ١٠٨٠');
  const sm = read('scripts/video-samples.mjs');
  assert.ok(sm.includes("'.vmk-lb .vmk-lb-x'") && !sm.includes("keyboard.press('Escape')"), 'يُغلق المشغّل بزرّه لا بـEscape (يُغلق الصانع)');
});

test('«جودة أعلى» ظاهر (طلب المالك): يخرج من «خيارات متقدّمة» إلى فوق المدّة، ويظهر فقط حيث يؤثّر', () => {
  assert.ok(js.includes("var qr=id('videoMakerQualityRow'), r3=M.querySelector('.vmk-row3')") && js.includes("r3.parentNode.insertBefore(qr,r3)"));
  assert.ok(js.includes("{runway:1,minimax:1,omni:1,veo:1}[qm]"));
  assert.ok(read('css/modules.css').includes('#videoMakerQualityRow.vmk-q-off{display:none!important}'));
  const v = read('js/app-11-video.js');
  assert.ok(v.includes("quality: wantQuality ? 'high' : 'fast'") && v.includes("resolution: '2k'"), 'المنطق نفسه لم يتغيّر');
});
