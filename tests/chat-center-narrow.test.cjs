// v-chat-center-narrow (١٩ سبتمبر ٢٠٢٦): «المحادثة كأنّها مسطرة… أريدها في الوسط عندما أغلق الطرفين».
// نافذة الكمبيوتر الضيّقة (≤ ٨٦٠px، تأخذ فئة mobile-ui تلقائيًّا) كانت بلا عمود موسّط؛ الكتلة تعطيها
// العمود بهامش نسبيّ، والتمييز بالمؤشّر: فأرة = كمبيوتر، لمس = جوّال حقيقيّ خارج الكتلة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('<style>\n/* v-chat-center-narrow');
const block = start > 0 ? html.slice(start, html.indexOf('</style>', start)) : '';

test('الكتلة موجودة بعد v-frame-c (فوز بالترتيب) ومحصورة بالنافذة الضيّقة ذات المؤشّر الدقيق', () => {
  assert.ok(start > 0, 'كتلة v-chat-center-narrow في index.html');
  assert.ok(html.indexOf('/* v-frame-c') < start, 'بعد v-frame-c');
  assert.match(block, /@media \(max-width: 860px\) and \(hover: hover\) and \(pointer: fine\)\{/, 'نافذة ضيّقة + فأرة فقط');
  assert.ok(!/min-width/.test(block), 'لا تمسّ الشبكة العريضة');
  // الفئة mobile-ui تُضاف تلقائيًّا للنافذة الضيّقة (isNarrow) — الكتلة تعتمد على ذلك
  assert.ok(html.includes("var isNarrow = window.matchMedia('(max-width:860px)').matches;"), 'حدّ الضيق في index.html كما تفترضه الكتلة');
});

test('كلّ محدّد بوزن html.mobile-ui[dir] body — يغلب حشوة الجوّال ولا يسري بلا المؤشّر الدقيق', () => {
  // رأس كلّ قاعدة = ما قبل «{» بعد آخر «}»؛ قد يضمّ عدّة محدّدات مفصولة بفاصلة.
  const css = block.replace(/\/\*[\s\S]*?\*\//g, ''); // التعليق يذكر المحدّدات فيُستبعد
  const heads = css.split('{').slice(0, -1).map((s) => s.split('}').pop().trim()).filter((s) => /html/.test(s));
  assert.ok(heads.length >= 3, 'قواعد كافية (وُجد ' + heads.length + ')');
  for (const h of heads) for (const sel of h.split(',')) assert.ok(sel.trim().startsWith('html.mobile-ui[dir] body '), 'محدّد بغير الوزن المطلوب: ' + sel.trim());
  // الوزن (1,2,2) يغلب html.mobile-ui[dir="rtl"] #messages (1,2,1) الذي يحشو 56px بـ!important
  const tokens = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8');
  assert.ok(tokens.includes('html.mobile-ui[dir="rtl"] #messages{padding-left:56px !important;}'), 'القاعدة المنافسة ما زالت كما افترضنا');
});

test('العمود الموسّط: الهامش نسبيّ من عرض النافذة، على الرسائل والترحيب وصندوق الكتابة معًا', () => {
  assert.match(block, /:root\{ --om-chat-narrow-inset: 12%; \}/, 'الهامش النسبيّ متغيّر واحد');
  assert.match(block, /margin-inline: max\(var\(--om-chat-pad, 32px\), var\(--om-chat-narrow-inset\)\) !important;/, 'لا يهبط تحت الهامش الثابت');
  for (const el of ['#omranHero', '#messages > *', '#askAllHintTip', '#composerRow', '#omranBelowComposer']) {
    assert.ok(block.includes('html.mobile-ui[dir] body ' + el), 'العنصر في العمود: ' + el);
  }
  assert.match(block, /html\.mobile-ui\[dir\] body #messages\{ padding-inline: 0 !important; \}/, 'أساس النسبة عرض القائمة كاملًا');
  assert.match(block, /html\.mobile-ui\[dir\] body #inputbar\{ padding-inline: 0 !important; \}/, 'صندوق الكتابة على المحور نفسه');
  assert.match(block, /max-width: none !important;/, 'حدّ .msg 92% لا يزاحم الهامش');
});
