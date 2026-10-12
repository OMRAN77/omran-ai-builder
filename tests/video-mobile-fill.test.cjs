// tests/video-mobile-fill.test.cjs — v-vmk-mobile-fill (١٢ أكتوبر ٢٠٢٦): المالك بلقطتَي هاتف وتابلت من صانع الفيديو:
// «شوف مكان الفيديو، رتّبهم في الهاتف والتابلت». بالمسبار: قاعدة شبكة الحاسوب align-items:start تسري على عمود الهاتف (flex ≤٨٦٠)
// فينكمش كلّ ابن إلى عرض محتواه ويلتصق باليمين — صندوق الترندات ٢٤٥ بكسل من ٦٧٨، وشاشة المعاينة ٧٤×٤٢.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const CSS = read('css/modules.css');

/* يستخرج قواعد كتلة @media بنصّ شرطها (الأولى المطابقة بعد موضع from) */
function mediaBlock(cond, from) {
  const head = '@media ' + cond + '{';
  const a = CSS.indexOf(head, from || 0);
  assert.ok(a >= 0, 'كتلة ' + cond + ' موجودة');
  let depth = 0, i = a + head.length - 1;
  for (; i < CSS.length; i++) { if (CSS[i] === '{') depth++; else if (CSS[i] === '}') { depth--; if (depth === 0) break; } }
  return { at: a, body: CSS.slice(a + head.length, i) };
}
const MARK = CSS.indexOf('/* v-vmk-mobile-fill');

test('١. الجذر: شبكة الحاسوب تضبط align-items:start، وعمود الهاتف (≤٨٦٠) لم يكن يعيدها — الآن الأبناء يملؤون العرض', () => {
  assert.ok(MARK > 0, 'تعليق الإصلاح موجود');
  // القاعدتان اللتان تصنعان العطب ما زالتا كما هما (الحاسوب لا يُمسّ)
  assert.ok(CSS.includes('#videoMakerModal .vmk-studio{max-width:1000px!important;display:grid;grid-template-columns:minmax(0,400px) minmax(0,1fr);gap:24px;align-items:start;'), 'شبكة الحاسوب');
  const col = mediaBlock('(max-width:860px)', CSS.indexOf('/* v-vmk-mobile:'));
  assert.ok(col.body.includes('#videoMakerModal .vmk-studio{display:flex!important;flex-direction:column;'), 'عمود الهاتف والتابلت');
  assert.ok(!/align-items/.test(col.body), 'ولم يكن يضبط المحاذاة — فورثها من الشبكة');
  // الإصلاح: بعد كلّ قاعدة تضبط محاذاة الاستوديو، وبالشرط نفسه
  const fix = mediaBlock('(max-width:860px)', MARK);
  assert.equal(fix.body.trim(), '#videoMakerModal .vmk-studio{align-items:stretch}');
  const lastStart = CSS.lastIndexOf('align-items:start', CSS.indexOf('#videoMakerModal .vmk-tab-lbl'));
  assert.ok(fix.at > lastStart && fix.at > col.at, 'يأتي بعد قاعدتَي الشبكة والعمود فيغلبهما بالترتيب');
  // لا قاعدة لاحقة تعيد المحاذاة
  assert.ok(!/#videoMakerModal \.vmk-studio\{[^}]*align-items:start/.test(CSS.slice(fix.at)), 'ولا شيء بعده يعيدها');
});

test('٢. التابلت (٦٤١–٨٦٠): بطاقات الأوضاع شبكة خمسة أعمدة تملأ العرض — لا صفّ يلتفّ ملتصقًا باليمين', () => {
  const tab = mediaBlock('(min-width:641px) and (max-width:860px)', MARK);
  assert.ok(tab.body.includes('#videoMakerModal .vmk-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));width:100%}'));
  assert.ok(tab.body.includes('#videoMakerModal .vmk-tab{min-width:0;max-width:none}'), 'البطاقة تملأ خانتها (كان لها حدّان ٩٢–١١٢)');
  // عشرة أوضاع = صفّان كاملان؛ بعد v-video-modes-by-result سبعة (omni وhybrid خرجا) = صفّ كامل وصفّ ناقص في الشبكة نفسها
  const tabs = JSON.parse(read('js/video.js').match(/var TABS=(\[[^\]]+\]);/)[1].replace(/'/g, '"'));
  assert.ok(tabs.length >= 7 && tabs.length <= 10, 'عدد الأوضاع: ' + tabs.length);
  // الصور بمقاسها الواحد كما قرّر المالك (v-vmk-tab-art)، والهاتف بصفّه المتمرّر كما هو
  assert.ok(CSS.includes('#videoMakerModal .vmk-tab-img{display:block;width:80px;height:80px;object-fit:cover'));
  assert.ok(CSS.includes('@media (max-width:640px){#videoMakerModal .vmk-tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;min-height:max-content;flex-shrink:0;width:100%}}'));
  assert.ok(tab.at > CSS.indexOf('#videoMakerModal .vmk-tab{display:flex;flex-direction:column;align-items:center'), 'بعد قاعدة البطاقة الأساسيّة');
});

test('٣. من ٥٦١: الترندات أعمدة تلقائيّة، وعمود المعاينة بعرض الحاسوب في الوسط', () => {
  const wide = mediaBlock('(min-width:561px) and (max-width:860px)', MARK);
  assert.ok(wide.body.includes('#videoMakerModal .vmk-studio>#vtRoot #vtGrid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))!important}'), 'كانت عمودين حتى ٨٦٠');
  assert.ok(wide.body.includes('#videoMakerModal .vmk-side{width:100%;max-width:400px;align-self:center}'), 'وإلّا صارت شاشة المعاينة ٦٧٨×٣٨١ فارغة');
  // الشبكة تُبنى في JS بعمودين سطريًّا — فلا بدّ من !important ليغلبها
  assert.ok(read('js/app-11-video-trends.js').includes('<div id="vtGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">'));
  // الحاسوب بقاعدته كما هي
  assert.ok(CSS.includes('@media (min-width:861px){#videoMakerModal .vmk-studio>#vtRoot #vtGrid{grid-template-columns:repeat(auto-fill,minmax(170px,1fr))!important}}'));
  // مشهد التوليد في الصانع بعرض عمود المعاينة — فيتبعه على الهاتف والتابلت
  assert.ok(read('js/app-34-gen-wait.js').includes(".vmk-side .genw--scene{width:100%;margin:0 0 10px}"));
});

test('٤. لا أثر على الحاسوب: كلّ القواعد الجديدة داخل كتل ≤٨٦٠، والوسم مرفوع', () => {
  const end = CSS.indexOf('html[data-mode="light"] #videoMakerModal .vmk-main #videoMakerPrompt{background:#ffffff', MARK);
  assert.ok(end > MARK);
  const block = CSS.slice(CSS.indexOf('*/', MARK) + 2, end).trim();
  // كلّ سطر قاعدة خارج @media ممنوع
  const outside = block.replace(/@media \([^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').trim();
  assert.equal(outside, '', 'لا قاعدة خارج استعلامات المقاس');
  for (const m of block.match(/@media [^{]+/g)) assert.match(m, /max-width:860px\)$/, m);
  const vTag = Number((read('index.html').match(/css\/modules\.css\?v=(\d+)/) || [])[1]); // يُقرأ لا يُثبَّت (سقّاطة vPinTests)
  assert.ok(vTag >= 681, 'وسم الملفّ المحمَّل منفصلًا مرفوع (كان 680 قبل v-vmk-mobile-fill)');
  assert.ok(read('package.json').includes('node tests/video-mobile-fill.test.cjs'), 'الاختبار مسجَّل');
  assert.ok(read('knowledge/DECISIONS.md').includes('— v-vmk-mobile-fill:'), 'مدخل القرار في السجلّ');
});
