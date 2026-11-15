// v-tools-mouse (المالك ١٥ نوفمبر: «الماوس في الادوات ثقيل جدا»): مسبار بمقاس شاشته (1412x733 ‎@1.36) يمرّر الفأرة فوق البطاقات —
// التغبيش خلف صفحة الأدوات ونافذة صانع الفيديو لا يُرى (المعتم يغطّيه، فرق البكسل صفر) ويُعاد رسمه مع كلّ إطار متحرّك:
// الأدوات ٣٩–٥٤ إطارًا فوق ٣٣ م‌ث ← صفر، وصانع الفيديو ٥٦٤ ← ٢٢٨. على الحاسوب وحده؛ الجوّال كما هو.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('١. صفحة الأدوات بلا تغبيش على الحاسوب، والجوّال على حاله', () => {
  const css = strip(read('css/redesign.css'));
  assert.match(css, /html:not\(\.mobile-ui\) #sectionsToolsOverlay\{backdrop-filter:none; -webkit-backdrop-filter:none;\}/);
  assert.match(strip(read('css/tokens.css')), /#sectionsToolsOverlay\{[^}]*backdrop-filter:blur\(4px\)/, 'القاعدة العامّة (الجوّال) كما هي');
});

test('٢. نافذة صانع الفيديو على الحاسوب بلا تغبيش، وخلفيّتها كما هي', () => {
  const css = strip(read('css/redesign.css'));
  const r = css.match(/html:not\(\.mobile-ui\) #videoMakerModal\{([^}]*)\}/);
  assert.ok(r, 'القاعدة موجودة');
  assert.match(r[1], /background:rgba\(0,0,0,\.78\) !important/);
  assert.match(r[1], /backdrop-filter:none/);
  assert.ok(!/blur\(/.test(r[1]));
});

test('٣. وسم redesign.css رُفع، والمدخل في السجلّ، والاختبار مسجَّل', () => {
  const v = Number((read('index.html').match(/css\/redesign\.css\?v=(\d+)/) || [])[1]);
  assert.ok(v >= 701, 'redesign.css ' + v);
  assert.ok(read('knowledge/DECISIONS.md').includes('v-tools-mouse'));
  assert.ok(read('package.json').includes('node tests/tools-mouse.test.cjs'));
});
