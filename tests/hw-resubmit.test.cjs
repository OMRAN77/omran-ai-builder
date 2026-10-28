// tests/hw-resubmit.test.cjs — v-hw-resubmit-1313: هواوي رفضت 1.3.13 (٢٢ أكتوبر ٢٠٢٦) بالقاعدتين 1.14/1.15 (معلومات التطبيق لا تطابقه،
// وكلمات «رسمي/موثوق»، وإيحاء بجهات أخرى) و4.1 (نوع محتوى واحد). لقطات ١٨ سبتمبر كانت تعرض التلفزيون والسيرة الذاتيّة وهما
// مخفيّتان منذ ١٠ أكتوبر (OMRAN_PAUSED_TOOLS)، والوصف يعدّ ١٩ أداة منها «خدمات حكوميّة» المخفيّة منذ v473.
// الاختبار يربط نصوص المتجر بالكود: الأدوات الظاهرة في حزمة هواوي تُحسب من مصدرها، فإخفاء أداة أو إظهارها يُسقطه حتّى تُحدَّث النصوص.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// الأدوات الظاهرة في مربّع الأدوات داخل حزمة هواوي لحساب غير المالك
function visibleHuaweiTools() {
  const feat = read('js/app-10-features.js');
  const ids = [];
  for (const g of ['grpCreate', 'grpBusiness', 'grpLife']) {
    const m = feat.match(new RegExp("title: '" + g + "', ids: \\[([^\\]]+)\\]"));
    assert.ok(m, 'مجموعة ' + g + ' في app-10');
    ids.push(...m[1].match(/'([A-Za-z]+)'/g).map((s) => s.slice(1, -1)));
  }
  const paused = read('js/app-05-ui.js').match(/var OMRAN_PAUSED_TOOLS = \[([^\]]*)\]/)[1].match(/'([A-Za-z]+)'/g).map((s) => s.slice(1, -1));
  const v473 = read('index.html').match(/\n(#btnTemplates[^{]*)\{ display: none !important; \}/)[1].match(/#(\w+)/g).map((s) => s.slice(1));
  const noMarkets = read('js/selfdiag.js').includes('html.store-nomarkets #btnStocks') ? ['btnStocks'] : [];
  const hidden = new Set([...paused, ...v473, ...noMarkets]);
  return { visible: ids.filter((id) => !hidden.has(id)), hidden: [...hidden].filter((id) => ids.includes(id)) };
}

// الاسم الإنجليزيّ في الواجهة (en) كما تكتبه الملاحظات
const EN = { btnPortraitStyle: 'Photo styles', btnVideoMaker: 'Video Maker', btnDesignAI: 'Design AI', btnFashionAI: 'Fashion AI', btnStudioAI: 'Style AI',
  btnAdStudio: 'Ad Studio', btnDocs: 'Document Assistant', btnEmailAssist: 'Smart Email Assistant', btnConstruction: 'Construction & Contracting Design',
  btnQibla: 'Qibla & Prayer', btnOmranEdu: 'Education', btnReligion: 'Religious Insights', btnFeedback: 'We value your feedback' };
// ما يدلّ على أداة مخفيّة في نصّ المتجر
// (v-hw-resubmit-2: والصينيّة — المراجع على هاتف صينيّ)
const HIDDEN_WORDS = { btnOmranTV: /\bTV\b|تلفزيون|قنوات|电视/, btnCV: /\bCV\b|سيرة|简历/, btnExpense: /expense|مصاريف|开支|支出/i, btnQuickTemplates: /suggestion|اقتراحات|建议/i,
  btnGov: /government|حكوم|政府/i, btnStocks: /stock|أسهم|股票|股市/i };
const BANNED = /official|trusted|preferred|featured|\bbest\b|\btop\b|#1|number one|رسمي|موثوق|مفضل|مفضّل|مميز|مميّز|الأفضل|官方|可靠|推荐|最佳|最好|精选|第一|最受欢迎/i;

const notes = read('store/huawei/REVIEW-NOTES.md');
const descriptions = notes.slice(notes.indexOf('## وصف المتجر (عربيّ)'));
const enToolList = notes.slice(notes.indexOf('It has '), notes.indexOf('The home screen also has'));
const arToolList = notes.slice(notes.indexOf('4.1: في كلّ تشغيل'), notes.indexOf('وكذلك على هاتف شغّله'));

test('١. الملاحظات تعدّ الأدوات الظاهرة في حزمة هواوي بعددها وأسمائها، ولا أداة مخفيّة', () => {
  const { visible, hidden } = visibleHuaweiTools();
  assert.equal(visible.length, 13, 'الأدوات الظاهرة اليوم ١٣ — تغيّر العدد؟ حدّث REVIEW-NOTES واللقطات');
  assert.ok(enToolList.includes('It has ' + visible.length + ' tools in three groups'), 'العدد في النصّ الإنجليزيّ');
  assert.ok(arToolList.includes('١٣ أداة في ثلاث مجموعات'), 'العدد في النصّ العربيّ');
  for (const id of visible) {
    assert.ok(EN[id], 'أداة ظاهرة جديدة بلا اسم في الملاحظات: ' + id);
    assert.ok(enToolList.includes(EN[id]), 'الملاحظات تذكر ' + EN[id]);
  }
  for (const id of hidden) {
    assert.ok(HIDDEN_WORDS[id], 'أداة مخفيّة جديدة: أضف كلماتها إلى HIDDEN_WORDS — ' + id);
    for (const [where, txt] of [['قائمة الأدوات الإنجليزيّة', enToolList], ['قائمة الأدوات العربيّة', arToolList], ['وصف المتجر', descriptions]]) {
      assert.doesNotMatch(txt, HIDDEN_WORDS[id], id + ' مخفيّة ولا تُذكر في ' + where);
    }
  }
});

test('٢. وصف المتجر بلا «رسمي/موثوق/مفضّل/مميّز»، واسم الهاتف «عمران AI» واسم الواجهة «om ai» معًا', () => {
  assert.ok(descriptions.length > 500, 'قسما الوصف موجودان');
  assert.doesNotMatch(descriptions, BANNED);
  assert.doesNotMatch(enToolList + arToolList, BANNED);
  // 1.3.14 (الحزمة نفسها برقم أكبر): اسم AGC كما هو (يطابق اسم الهاتف «عمران AI»)، والوصف يجمع اسم الهاتف واسم الواجهة «om ai» في أوّل سطر
  assert.ok(descriptions.includes('**اسم التطبيق:** كما هو في AGC') && descriptions.includes('**App name:** unchanged in AGC'));
  assert.ok(descriptions.includes('عمران AI (om ai) تطبيق واحد') && descriptions.includes('Omran AI (om ai) brings'));
  assert.ok(notes.startsWith('# ملاحظات المراجع ونصوص المتجر — om ai / عمران AI (AppGallery، 1.3.14)'));
  // 11.4 باقية صادقة (hw-nomarkets)، وحساب التجربة بلا كلمة مرور في المستودع
  assert.match(notes, /all market screens \(stock ticker, stock market, currency\/forex rates\) are removed from this package/);
  assert.ok(notes.includes('Test account: (username) / (password)'));
});

test('٣. اللقطات الثماني بثلاث لغات من store/huawei/shots.mjs: رابط الحزمة، حساب غير المالك، هاتف ٣٦٠×٦٤٠ ×٣، ولا تلفزيون', () => {
  const sh = read('store/huawei/shots.mjs');
  const names = [...sh.matchAll(/\{ name: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(names.length, 8, 'AppGallery: ثماني لقطات كحدّ أقصى');
  const { PNG } = require('pngjs');
  // v-hw-resubmit-2: العربيّة في المجلّد نفسه، والإنجليزيّة en/ والصينيّة zh/ — التطبيق يتبع لغة الهاتف
  for (const sub of ['', 'en', 'zh']) {
    const dir = path.join(root, 'store/huawei/screenshots', sub);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    assert.deepEqual(files, names.map((n) => n + '.png').sort(), (sub || 'ar') + ': الملفّات = قائمة المولّد (لا لقطة قديمة باقية)');
    assert.ok(!files.some((f) => /tv|cv|expense|gov|suggest|stock/i.test(f)), 'لا لقطة لأداة مخفيّة');
    for (const f of files) {
      const buf = fs.readFileSync(path.join(dir, f)); const p = PNG.sync.read(buf);
      assert.ok(p.width === 1080 && p.height === 1920, (sub || 'ar') + '/' + f + ' ١٠٨٠×١٩٢٠');
      assert.ok(buf.length < 2 * 1024 * 1024, (sub || 'ar') + '/' + f + ' أقلّ من ٢ م.ب');
    }
  }
  assert.ok(sh.includes("const LANGS = (opt('langs') || 'ar,en,zh')") && sh.includes("'--lang', lang"), 'المولّد يصوّر اللغات الثلاث');
  assert.match(read('scripts/ui-shot.mjs'), /localStorage\.setItem\('aiapp_lang', l\)/);
  assert.ok(sh.includes("'--path', s.path || '/?store=huawei'") && sh.includes("'--user', 'reviewer'") && !/'--user', 'omran'/.test(sh));
  assert.ok(sh.includes("'--viewport', '360x640', '--scale', '3'"), '١٠٨٠×١٩٢٠');
  assert.ok(sh.includes('scripts/ui-shot.mjs'));
  const { visible } = visibleHuaweiTools();
  for (const id of [...sh.matchAll(/open\('(\w+)'\)/g)].map((m) => m[1])) assert.ok(visible.includes(id), 'لقطة لأداة ظاهرة فقط: ' + id);
});

test('٤. v-hw-1314: 1.3.14 بأمر المالك («1.3.14 سو جديد») — الحزمة نفسها واسم الهاتف نفسه، والنصوص كلّها على الرقم الجديد', () => {
  const g = read('store/huawei/twa/app/build.gradle');
  assert.match(g, /name: 'Omran AI Builder',/); assert.match(g, /launcherName: 'عمران AI',/);
  assert.match(g, /versionName "1\.3\.14"/);
  assert.ok(notes.includes('new version 1.3.14') && notes.includes('launcher label stays "عمران AI"'), 'الملاحظات تقول الرقم واسم الهاتف الفعليّ');
  const readme = read('store/huawei/README.md');
  assert.ok(readme.includes('**1.3.14 (٢٨ أكتوبر): بناء جديد بأمر المالك**') && readme.includes('version_code=20261028') && readme.includes('v-hw-resubmit-1313'));
  // كلّ ما يقرؤه المراجع على 1.3.14: لا «version 1.3.13» ولا اسم AGC «في 1.3.13» باقٍ
  assert.doesNotMatch(notes, /version 1\.3\.13\b|الإصدار 1\.3\.13 |launcher label of 1\.3\.13|与 1\.3\.13/);
  assert.ok(!(readme + notes).includes('1.3.15'), 'لا رقم بعد 1.3.14');
});

test('٥. نسخة هواوي وحدها تخفي خيارات العلامات التجاريّة (1.15) ووصف «موثوقة»، والموقع كما هو', () => {
  const a05 = read('js/app-05-ui.js');
  const blk = a05.slice(a05.indexOf('var OMRAN_HW_BRAND_HIDE = {'), a05.indexOf('\n}', a05.indexOf('function omranHwHidden(')) + 2);
  assert.ok(blk.includes('function omranHwHidden('), 'القائمة والدالّة في app-05');
  const vm = require('node:vm');
  // safe = html.store-safe؛ pkg = علم الحزمة ?store=huawei في الجلسة (متصفّح هواوي على الموقع يأخذ store-safe بلا العلم)
  const run = (safe, pkg = safe) => {
    const cls = new Set(safe ? ['store-safe'] : []);
    const ctx = { document: { documentElement: { classList: { contains: (c) => cls.has(c) } } }, __swallow() {},
      sessionStorage: { getItem: (k) => (pkg && k === 'aiapp_store' ? 'huawei' : null) } };
    vm.runInNewContext(blk + '\nthis.H = omranHwHidden; this.L = OMRAN_HW_BRAND_HIDE;', ctx);
    return ctx;
  };
  const hw = run(true), web = run(false), hwBrowser = run(true, false);
  for (const [k, v] of [['portrait', 'lego'], ['portrait', 'disney'], ['portrait', 'ghibli'], ['trend', 'pixarstory'], ['trend', 'legofy'], ['studio', 'anime:ghibli'], ['stamps', 'ميكي ماوس']]) {
    assert.equal(hw.H(k, v), true, 'هواوي يخفي ' + k + ':' + v);
    assert.equal(web.H(k, v), false, 'الموقع يُبقي ' + k + ':' + v);
    assert.equal(hwBrowser.H(k, v), false, 'متصفّح هواوي على الموقع يُبقي ' + k + ':' + v);
  }
  assert.equal(hw.H('portrait', 'anime'), false, 'الأنماط العامّة باقية في هواوي');
  // المراجعة العدائيّة: «الدببة الثلاثة» (We Bare Bears) وكروس فت أيضًا
  assert.equal(hw.H('stamps', 'الدببة الثلاثة'), true); assert.equal(hw.H('studio', 'body:bdcrossfita'), true);
  // أداة الفيديو في المحادثة لا تشغّل ترندًا مخفيًّا، و«فاجئني» في الطوابع بلا علامات حين يرسل التطبيق noBrands
  assert.match(read('js/app-17-agent-tools.js'), /omranHwHidden\('trend', String\(va\.trend\)\)\) va\.trend = ''/);
  assert.equal((read('js/app-09-attach.js').match(/noBrands:\(typeof omranHwPackage==='function' && omranHwPackage\(\)\)/g) || []).length, 2, 'طلبا الطوابع');
  const stamps = read('api/_lib/stamps.js');
  assert.match(stamps, /if \(b\.noBrands === true\) \{ const nb = pool\.filter\(\(t\) => !STAMP_BRAND_RE\.test\(t\.d\)\)/);
  const RE = new RegExp(stamps.match(/const STAMP_BRAND_RE = \/(.+)\/;/)[1]);
  for (const d of ['MY MELODY SANRIO theme', 'SPONGEBOB cartoon theme', 'WE BARE BEARS theme', 'POKEMON cartoon theme']) assert.ok(RE.test(d), 'علامة: ' + d);
  for (const d of ['OUTER SPACE theme', 'DINOSAUR theme', 'UAE HERITAGE theme', 'RACE CARS theme']) assert.ok(!RE.test(d), 'عامّ: ' + d);
  // مثال الإعلان بلا اسم سيّارة تجاريّ
  assert.doesNotMatch(read('i18n/ad-studio.js'), /Land Cruiser|لاندكروزر|Toyota|巡洋舰|Крузер|लैंड क्रूज़र/);
  // كلّ قيمة مخفيّة موجودة فعلًا في مصدرها (لو تغيّر اسمها يسقط الاختبار بدل أن تعود العلامة بصمت)
  const pc = read('js/partials-core.js'), tr = read('js/app-11-video-trends-data.js');
  const st = read('js/app-13-stocks-init.js') + read('js/app-12-studio-more.js'), a09 = read('js/app-09-attach.js');
  for (const v of hw.L.portrait) assert.ok(pc.includes('value="' + v + '"'), 'نمط الصورة موجود: ' + v);
  for (const v of hw.L.trend) assert.ok(tr.includes('"key":"' + v + '"'), 'الترند موجود: ' + v);
  for (const fv of hw.L.studio) { const v = fv.split(':')[1]; assert.ok(st.includes("value:'" + v + "'") || st.includes('"value":"' + v + '"'), 'خيار الستايل موجود: ' + fv); }
  for (const k of hw.L.stamps) assert.ok(a09.includes("{k:'" + k + "'"), 'ثيم الطوابع موجود: ' + k);
  // مواضع العرض الأربعة تمرّ بالفلتر
  assert.match(read('js/app-12-studios.js'), /omranHwHidden\('portrait', v\)/);
  assert.match(read('js/app-12-studios.js'), /omranHwHidden\('portrait', o\.value\)/);
  assert.match(read('js/app-11-video-trends.js'), /omranHwHidden\('trend', t\.key\)/);
  assert.match(read('js/app-11-video-trends.js'), /omranHwHidden\('trend', x\.key\)/);
  assert.match(read('js/app-13-stocks-init.js'), /omranHwHidden\('studio', feature \+ ':' \+ o\.value\)/);
  assert.match(a09, /var __groups=\(typeof omranHwStampGroups==='function'\?omranHwStampGroups:function\(g\)\{return g;\}\)\(\[/); assert.match(a05, /omranHwHidden\('stamps', th\.k\)/);
  // وصف بطاقة التفسير «إجابات موثوقة / trusted / 可靠» لا يظهر في هواوي
  assert.match(read('css/redesign.css'), /html\.store-safe #btnReligion \.tcSub\{display:none !important;\}/);
});

test('٦. ما يظهر في اللقطة الصينيّة مترجم: أسطر «أفكار بلا صورة» في الديكور بالـ١٤ لغة، وبطاقات أنواع المقاولات تُعاد تسميتها بعد وصول القاموس', () => {
  const KEYS = ['decorIdeasTitlePoster', 'decorIdeaPh', 'decorIdeaGo'];
  const a03 = read('js/app-03-i18n-data.js');
  for (const L of ['ar', 'en']) {
    const m = a03.match(new RegExp('Object\\.assign\\(I18N\\.' + L + ', (\\{"decorIdeasTitlePoster"[^\\n]*\\})\\);'));
    assert.ok(m, L + ': كتلة المفاتيح الثلاثة');
    const o = JSON.parse(m[1]); for (const k of KEYS) assert.ok(o[k], L + ' ' + k);
  }
  const seen = new Set();
  for (const L of ['zh', 'fr', 'es', 'ru', 'tr', 'id', 'fil', 'hi', 'ur', 'bn', 'ne', 'ml']) {
    const m = read('i18n/' + L + '.js').match(new RegExp('Object\\.assign\\(I18N\\["' + L + '"\\], (\\{"decorIdeasTitlePoster"[^\\n]*\\})\\);'));
    assert.ok(m, L + ': كتلة المفاتيح الثلاثة');
    const o = JSON.parse(m[1]);
    for (const k of KEYS) { assert.ok(o[k] && !/^[\\x00-\\x7F]*$/.test(o[k]) || L === 'id' || L === 'fil' || L === 'fr' || L === 'es' || L === 'tr', L + ' ' + k); seen.add(o[k]); }
  }
  assert.equal(seen.size, 36, 'ترجمات لا نسخ');
  const a12 = read('js/app-12-studios.js');
  assert.match(a12, /__tk\('decorIdeaPh', /); assert.match(a12, /__tk\('decorIdeaGo', /);
  assert.match(a12, /window\.t\(__k\)/, 'العنوان يقرأ decorIdeasTitlePoster أصلًا');
  // وسم القواميس رُفع وسببه في رأس التعليق (رقمًا لا تثبيتًا)
  const tag = read('js/app-04-i18n-state.js').split('\n').find((l) => l.includes("sc.src = 'i18n/' + lg + '.js?v=")) || '';
  const tm = /\.js\?v=(\d+)'; \/\* v-hw-resubmit-2 \((\d+)\): /.exec(tag);
  assert.ok(tm && Number(tm[1]) >= Number(tm[2]) && Number(tm[2]) >= 774, 'وسم اللغات مرفوع وسبب الطلب في الرأس');
  // المقاولات: render يعيد اسم كلّ بطاقة من خيار النوع (القاموس الكسول يصل بعد بناء البطاقات)
  const cx = read('js/app-15-cx-simple.js');
  const render = (cx.match(/function render\(\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert.match(render, /#cxStartCards \[data-cx-preset\]/); assert.match(render, /cardLabel\(b\.getAttribute\('data-cx-preset'\)\)/);
  assert.match(cx, /function cardLabel\(type\)\{/); assert.match(cx, /var lb = cardLabel\(p\.type\);/);
});

test('٧. المراجعة العدائيّة: أوّل شاشة صينيّة بالمبسّطة، والتلميح يُترجم، و«按教材学习»، وخانة Remarks تدلّ على زرّ الأدوات بالأدوات الـ١٣', () => {
  // بطاقة الخصوصيّة (أوّل ما يراه مراجع صينيّ) بالصينيّة المبسّطة لا التقليديّة
  const zh = read('i18n/zh.js');
  const line = zh.split('\n').find((l) => l.includes('"privacyConsentTitle"')) || '';
  assert.ok(line.includes('隐私优先') && line.includes('同意并继续'), 'مبسّطة');
  assert.doesNotMatch(line, /隱|與|請|閱|說|資|權|條|並|繼/, 'بلا حروف تقليديّة');
  // تلميح الطلب الأوّل يحمل مفتاحه فيترجمه applyLanguage حين يصل القاموس الكسول
  assert.match(read('js/app-10-features.js'), /tip\.id = 'askAllHintTip'; tip\.setAttribute\('data-i18n', 'askAllHintText'\);/);
  // بطاقة التعليم الرئيسيّة بالصينيّة
  const edu = read('js/edu.js');
  assert.ok(edu.includes("zh:'按教材学习——选择国家、年级和科目'") && !edu.includes('课程中的课程'));
  assert.match(read('index.html'), /\/js\/edu\.js\?v=(\d+)"/);
  assert.ok(Number(read('index.html').match(/\/js\/edu\.js\?v=(\d+)"/)[1]) >= 673, 'وسم edu.js مرفوع');
  // خانة Remarks: ٣٠٠ حرف على الأكثر، الأدوات الـ١٣ بأسمائها، وأين زرّ الأدوات، وأنّ المربّع يُفتح في كلّ تشغيل (v-hw-tools-home)
  const r = (notes.match(/## خانة Remarks[^\n]*\n```\n([^\n]+)\n```/) || [])[1] || '';
  assert.ok(r.length > 200 && r.length <= 300, 'Remarks ≤ ٣٠٠: ' + r.length);
  const list = (r.match(/13 tools \(([^)]*)\)/) || [])[1] || '';
  assert.equal(list.split(',').length, 13, 'الأدوات الـ١٣ في القوس');
  assert.ok(r.includes('bottom bar > Tools'), 'مكان زرّ الأدوات');
  assert.ok(r.includes('opens on every launch'), 'العرض في كلّ تشغيل لا مرّة لكلّ جهاز');
  assert.doesNotMatch(notes, /does not open by itself again|فلن يفتح المربّع وحده/, 'لا ملاحظة قديمة تقول إنّه لا يعود');
});

test('٨. v-hw-tools-home: مربّع الأدوات شاشة البداية في كلّ فتح لحزمة هواوي — ينتظر المحادثة الجديدة الفارغة، ولا يعود مع التحديث داخل الفتح نفسه', () => {
  const sd = read('js/selfdiag.js');
  const a = sd.indexOf("if(!sessionStorage.getItem('aiapp_store_tour_s')){");
  const b = sd.indexOf('else setTimeout(__openTour, 1800);', a);
  assert.ok(a > sd.indexOf("=== 'huawei'){") && b > a, 'داخل فرع حزمة هواوي وحده');
  const src = sd.slice(a, sd.indexOf('}', b) + 1);
  assert.doesNotMatch(src, /localStorage\./, 'لا علم دائم: كلّ فتح جديد يعرضها');
  // فتح واحد: sessionStorage الفتح، ومحادثة حاليّة فيها رسائل لعدد من الدورات (قبل أن يبدّلها app-22)
  // o.typing: الصندوق مركّز/فيه نصّ · o.loadedAfter: لا محادثة حاليّة ولا تحميل حتّى الدورة n · o.toast: إشعار app-22 ظاهر
  const launch = (ss, busyTicks, o = {}) => {
    const timers = [], dcl = []; let calls = 0; const shown = [];
    const overlay = { classList: { add: (c) => shown.push(c) } };
    const prompt = { value: o.typing === 'text' ? 'ابغي' : '' };
    const toast = { removed: false, remove() { this.removed = true; } };
    const win = { __localChatsLoaded: !o.loadedAfter };
    const ids = { sectionsToolsOverlay: overlay, prompt, sessToast: o.toast ? toast : null };
    const env = {
      sessionStorage: { getItem: (k) => (k in ss ? ss[k] : null), setItem: (k, v) => { ss[k] = String(v); } },
      document: { readyState: o.ready || 'loading', activeElement: o.typing === 'focus' ? prompt : null,
        getElementById: (id) => ids[id] || null, addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') dcl.push(fn); } },
      setTimeout: (fn) => { timers.push(fn); },
      getCurrent: () => { const i = calls++; if (o.loadedAfter) { if (i < o.loadedAfter) return undefined; win.__localChatsLoaded = true; } return { messages: i < busyTicks ? [{ role: 'user' }] : [] }; },
    };
    new Function('sessionStorage', 'document', 'setTimeout', 'getCurrent', 'window', src)(env.sessionStorage, env.document, env.setTimeout, env.getCurrent, win);
    dcl.forEach((f) => f()); // المسار الفعليّ: selfdiag يُحمَّل قبل اكتمال الصفحة
    let n = 0; while (timers.length && n++ < 100) timers.shift()();
    return Object.defineProperties(shown, { toastRemoved: { value: toast.removed }, calls: { value: calls } }); // غير قابلة للعدّ: deepEqual يقارن العرض وحده
  };
  const ss1 = {};
  assert.deepEqual(launch(ss1, 3), ['show'], 'الفتح الأوّل: تنفتح بعد أن تصير المحادثة فارغة');
  assert.equal(ss1.aiapp_store_tour_s, '1');
  assert.deepEqual(launch(ss1, 0), [], 'تحديث داخل الفتح نفسه: لا تُفتح فوق ما يعمل عليه');
  assert.deepEqual(launch({}, 5), ['show'], 'الفتح الثاني (جلسة جديدة) على الجهاز نفسه: تنفتح من جديد');
  assert.deepEqual(launch({}, 1000), [], 'محادثة لا تفرغ: يتوقّف بعد عدد محدود من المحاولات بلا حلقة لا تنتهي');
  assert.deepEqual(launch({}, 0, { ready: 'complete' }), ['show'], 'الصفحة مكتملة قبل selfdiag: يعمل أيضًا');
  // مراجعة عدائيّة: من بدأ يكتب لا يُغطّى، ولا تعود في الفتح نفسه
  for (const typing of ['focus', 'text']) {
    const ss = {};
    assert.deepEqual([...launch(ss, 0, { typing })], [], 'بدأ يكتب (' + typing + '): لا يغطّي الصندوق');
    assert.equal(ss.aiapp_store_tour_s, '1', 'ولا تعود في هذا الفتح');
  }
  // قبل تحميل المحادثات المحفوظة: ينتظر بدل أن يفتح فيغلقه الإقلاع
  const late = launch({}, 0, { loadedAfter: 4 });
  assert.deepEqual([...late], ['show']); assert.ok(late.calls > 4, 'انتظر التحميل');
  // إشعار «جلسة جديدة» لا يبقى فوق شاشة الأدوات (عربيّ/إنجليزيّ فقط — الصينيّ يرى الإنجليزيّ)
  assert.equal(launch({}, 2, { toast: true }).toastRemoved, true);
});
