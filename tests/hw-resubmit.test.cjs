// tests/hw-resubmit.test.cjs — v-hw-resubmit-1314: هواوي رفضت 1.3.13 (٢٢ أكتوبر ٢٠٢٦) بالقاعدتين 1.14/1.15 (معلومات التطبيق لا تطابقه،
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
const EN = { btnPortraitStyle: 'Photo Style', btnVideoMaker: 'Video Maker', btnDesignAI: 'Design AI', btnFashionAI: 'Fashion AI', btnStudioAI: 'Style AI',
  btnAdStudio: 'Ad Studio', btnDocs: 'Document Assistant', btnEmailAssist: 'Smart Email Assistant', btnConstruction: 'Construction & Contracting Design',
  btnQibla: 'Qibla & Prayer', btnOmranEdu: 'Education', btnReligion: 'Religious Insights', btnFeedback: 'Feedback' };
// ما يدلّ على أداة مخفيّة في نصّ المتجر
const HIDDEN_WORDS = { btnOmranTV: /\bTV\b|تلفزيون|قنوات/, btnCV: /\bCV\b|سيرة/, btnExpense: /expense|مصاريف/i, btnQuickTemplates: /suggestion|اقتراحات/i,
  btnGov: /government|حكوم/i, btnStocks: /stock|أسهم/i };
const BANNED = /official|trusted|preferred|featured|\bbest\b|\btop\b|#1|number one|رسمي|موثوق|مفضل|مفضّل|مميز|مميّز|الأفضل/i;

const notes = read('store/huawei/REVIEW-NOTES.md');
const descriptions = notes.slice(notes.indexOf('## وصف المتجر (عربيّ)'));
const enToolList = notes.slice(notes.indexOf('It has '), notes.indexOf('The home screen also has'));
const arToolList = notes.slice(notes.indexOf('4.1: عند أوّل تشغيل'), notes.indexOf('إن شُغّل التطبيق'));

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

test('٢. وصف المتجر بلا «رسمي/موثوق/مفضّل/مميّز» والاسم «om ai» وحده', () => {
  assert.ok(descriptions.length > 500, 'قسما الوصف موجودان');
  assert.doesNotMatch(descriptions, BANNED);
  assert.doesNotMatch(enToolList + arToolList, BANNED);
  assert.ok(descriptions.includes('**اسم التطبيق:** om ai') && descriptions.includes('**App name:** om ai'));
  assert.doesNotMatch(descriptions, /Omran AI|عمران AI|Omran Ai/);
  assert.match(notes, /^# ملاحظات المراجع ونصوص المتجر — om ai/);
  // 11.4 باقية صادقة (hw-nomarkets)، وحساب التجربة بلا كلمة مرور في المستودع
  assert.match(notes, /all market screens \(stock ticker, stock market, currency\/forex rates\) are removed from this package/);
  assert.ok(notes.includes('Test account: (username) / (password)'));
});

test('٣. اللقطات الثماني من store/huawei/shots.mjs: رابط الحزمة، حساب غير المالك، هاتف ٣٦٠×٦٤٠ ×٣، ولا تلفزيون', () => {
  const sh = read('store/huawei/shots.mjs');
  const names = [...sh.matchAll(/\{ name: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(names.length, 8, 'AppGallery: ثماني لقطات كحدّ أقصى');
  const files = fs.readdirSync(path.join(root, 'store/huawei/screenshots')).filter((f) => f.endsWith('.png')).sort();
  assert.deepEqual(files, names.map((n) => n + '.png').sort(), 'الملفّات = قائمة المولّد (لا لقطة قديمة باقية)');
  assert.ok(!files.some((f) => /tv|cv|expense|gov|suggest|stock/i.test(f)), 'لا لقطة لأداة مخفيّة');
  assert.ok(sh.includes("'--path', s.path || '/?store=huawei'") && sh.includes("'--user', 'reviewer'") && !/'--user', 'omran'/.test(sh));
  assert.ok(sh.includes("'--viewport', '360x640', '--scale', '3'"), '١٠٨٠×١٩٢٠');
  assert.ok(sh.includes('scripts/ui-shot.mjs'));
  const { visible } = visibleHuaweiTools();
  for (const id of [...sh.matchAll(/open\('(\w+)'\)/g)].map((m) => m[1])) assert.ok(visible.includes(id), 'لقطة لأداة ظاهرة فقط: ' + id);
});

test('٤. الاسم على الهاتف «om ai» في مشروع الحزمة والمولّد، والبناء يحتاج أمر المالك (لا يُبنى هنا)', () => {
  const g = read('store/huawei/twa/app/build.gradle');
  assert.match(g, /name: 'om ai',/); assert.match(g, /launcherName: 'om ai',/);
  assert.ok(read('scripts/twa-generate.mjs').includes('launcherName: web.short_name,'), 'إعادة التوليد لا ترجع «عمران AI»');
  const readme = read('store/huawei/README.md');
  assert.ok(readme.includes('**`1.3.14`**') && readme.includes('**`20261022`**'), 'خانتا الإصدار للبناء التالي');
  assert.ok(readme.includes('v-hw-resubmit-1314'));
});
