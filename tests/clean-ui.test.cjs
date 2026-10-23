// tests/clean-ui.test.cjs — v-clean-ui: واجهة رسميّة بلا إيموجي (أمر المالك «كلّ شيء نظيف… شغل رسميّ»)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-36-clean-ui.js'), 'utf8');

const m = src.match(/new RegExp\('((?:[^'\\]|\\.)*)', 'gu'\)/);
assert.ok(m, 'تعبير الإيموجي موجود');
const EMO = new RegExp(m[1].replace(/\\\\/g, '\\'), 'gu');
const clean = (s) => String(s).replace(EMO, '').replace(/[ \t]{2,}/g, ' ').trim();

test('يزيل الإيموجي ويبقي النصّ والأرقام', () => {
  assert.equal(clean('🎬 قصة بيكسار'), 'قصة بيكسار');
  assert.equal(clean('⚡ 400 نقطة'), '400 نقطة');
  assert.equal(clean('⚙️ خيارات متقدمة'), 'خيارات متقدمة');
  assert.equal(clean('✅ مفعّل'), 'مفعّل');
  assert.equal(clean('👨‍👩‍👧 العائلة'), 'العائلة');
  assert.equal(clean('👍🏽 تمّ'), 'تمّ');
});

test('لا يمسّ الأعلام ولا حقّ النشر ولا ZWJ اللازم لتشكيل الهنديّة والمالايالمية والعربيّة', () => {
  assert.equal(clean('🇦🇪 الإمارات'), '🇦🇪 الإمارات');
  assert.equal(clean('© 2026 عمران'), '© 2026 عمران');
  const ml = 'ക്‍ഷ'; // ZWJ بين حرفين مالايالميّين
  assert.equal(clean(ml), ml);
  assert.equal(clean('कर्‍म'), 'कर्‍म');
  assert.equal(clean('→ التالي'), '→ التالي');
  assert.equal(clean('4.5 ★'), '4.5 ★');
});

test('الحماية: كلّ الصفحة عدا المحادثة والكود والحقول مستثناة، والأيقونة الوحيدة في الزرّ تبقى', () => {
  assert.match(src, /var SKIP = '\.msg,pre,code,textarea,\[contenteditable\],\[data-keep-emoji\],script,style'/);
  assert.ok(!src.includes('p.closest(CHROME)'), 'لا قائمة بيضاء: بطاقات الواجهة divs عاديّة');
  assert.ok(src.includes('HAS_WORD.test(c) && c !== v'), 'عقدة كلّها إيموجي تبقى');
  assert.ok(src.includes("attributeFilter: ['placeholder', 'title', 'aria-label']"));
  assert.ok(src.includes('window.__noEmoji = clean'));
});

test('الحزمة تحوي الجزء، ونسخ التنظيف المحليّة في الفيديو والترندات بنفس التعبير الآمن (لا يحذف ZWJ عامًّا)', () => {
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.bundle.js'), 'utf8').includes('v-clean-ui'));
  ['js/video.js', 'js/app-11-video-trends.js'].forEach((f) => {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(s.includes('\\p{Extended_Pictographic}'), f);
    assert.ok(!/\\u\{200D\}\]/.test(s), f + ' لا يحذف ZWJ عامًّا');
  });
});

/* v-edu-hub-polish (تدقيق ١٨–١٩ أكتوبر): نزع الإيموجي كان يقصّ المسافة الطرفيّة من العقدة فيلتصق النصّ بالعنصر التالي —
   «Review:التمثيل» في شرح الاختبار و«أسئلة المستوىأساسي» في خطّة التعليم. fixText الحقيقيّ على عقد وهميّة. */
test('fixText: المسافة الطرفيّة تبقى إن كان للعقدة شقيق، والعقدة وحدها تُقصّ كما كانت', () => {
  const vm = require('node:vm');
  const nodes = [];
  const parent = { closest: () => null };
  const mk = (v, prev, next) => { const n = { nodeType: 3, nodeValue: v, parentElement: parent, previousSibling: prev || null, nextSibling: next || null }; nodes.push(n); return n; };
  const review = mk('📌 Review: ', null, { nodeType: 1 });
  const level = mk('🎯 أضعف نقطة عندك: أسئلة المستوى ', null, { nodeType: 1 });
  const lead = mk(' 🔥 متتالية', { nodeType: 1 }, null);
  const alone = mk('🔥 1');
  const onlyEmoji = mk('🔥 ', null, { nodeType: 1 });
  const body = { nodeType: 1, closest: () => null, getAttribute: () => null };
  const document = { readyState: 'complete', body, createTreeWalker: () => { let i = 0; return { nextNode: () => nodes[i++] || null }; } };
  vm.runInNewContext(src, { window: {}, document, NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 }, MutationObserver: function () { this.observe = () => {}; }, setTimeout, __swallow() {} });
  assert.equal(review.nodeValue, 'Review: ');
  assert.equal(level.nodeValue, 'أضعف نقطة عندك: أسئلة المستوى ');
  assert.equal(lead.nodeValue, ' متتالية');
  assert.equal(alone.nodeValue, '1', 'بلا أشقّاء: قصّ كما كان');
  assert.equal(onlyEmoji.nodeValue, '🔥 ', 'عقدة كلّها إيموجي تبقى');
});

test('v-no-emoji-flash: النصّ الذي يُكتب بإيموجي يُنظَّف داخل المراقب نفسه (قبل الرسم) لا بعد ٤٠ م.ث — فلا يقفز زرّ «جرّب على صورتك»', () => {
  const vm = require('node:vm');
  let cb = null; const timers = [];
  const parent = { closest: () => null };
  const node = { nodeType: 3, nodeValue: '✨ جرّب على صورتك', parentElement: parent, nextSibling: null, previousSibling: null };
  const body = { nodeType: 1, closest: () => null, getAttribute: () => null };
  const document = { readyState: 'complete', body, createTreeWalker: () => ({ nextNode: () => null }) };
  vm.runInNewContext(src, { window: {}, document, NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 }, MutationObserver: function (f) { cb = f; this.observe = () => {}; }, setTimeout: (f, ms) => { timers.push(ms); return 1; }, __swallow() {} });
  assert.equal(typeof cb, 'function');
  cb([{ type: 'characterData', target: node }]);
  assert.equal(node.nodeValue, 'جرّب على صورتك', 'نُظِّف قبل أن يعود المراقب — لا إطار يُرسم بالإيموجي');
  assert.deepEqual(timers, [], 'لا مؤقّت');
  // عنصر أُضيف بشجرته يُنظَّف كذلك في النداء نفسه
  const kid = { nodeType: 3, nodeValue: '🎬 قصة', parentElement: parent, nextSibling: null, previousSibling: null };
  const el = { nodeType: 1, closest: () => null, getAttribute: () => null };
  document.createTreeWalker = () => { let i = 0; return { nextNode: () => [kid][i++] || null }; };
  cb([{ type: 'childList', addedNodes: [el] }]);
  assert.equal(kid.nodeValue, 'قصة');
  assert.ok(!/setTimeout\(flush/.test(src) && src.includes('flush(); /* قبل الرسم */'));
});
