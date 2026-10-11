// tests/vercelignore-parts.test.cjs — كلّ جزء js/app-NN-*.js مستثنى من النشر في .vercelignore.
// العرض (تدقيق البنية ١١ أكتوبر): .vercelignore يذكر ٢٠ جزءًا من ٥٣، فالـ٣٣ الباقية تُنشر على الـCDN مرّتين —
// مفردةً وداخل js/app.bundle.js — مع أنّ لا صفحة ولا عامل خدمة ولا دالّة خادم تطلب جزءًا مفردًا (الحزمة وحدها).
// القرار: كلّ اسم يعدّه bundle-core.partNames سطرٌ في .vercelignore، وهذا الاختبار يمنع جزءًا جديدًا بلا سطره.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const core = require(path.join(root, 'api', '_lib', 'bundle-core.js'));
const ignore = new Set(fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim()));
const parts = core.partNames(fs.readdirSync(path.join(root, 'js')));

test('١. كلّ جزء من أجزاء الحزمة سطرٌ في .vercelignore', () => {
  assert.ok(parts.length >= core.MIN_PARTS);
  const shipped = parts.filter((n) => !ignore.has('js/' + n));
  assert.deepEqual(shipped, [], 'أجزاء تُنشر مفردةً بجانب الحزمة — أضف سطرها في .vercelignore');
});

test('٢. الحزمة نفسها وما تحمّله الصفحات منفصلًا لا يُستثنى', () => {
  assert.ok(!ignore.has('js/app.bundle.js'));
  for (const l of ignore) assert.ok(!/^js\/(partials-|modes\.js|ui-wiring|tool-card-images)/.test(l), 'ملفّ تحمّله الصفحة لا يُستثنى: ' + l);
  // لا صفحة تحمّل جزءًا مفردًا بوسم <script> — وإلّا لكان استثناؤه يكسرها.
  for (const page of fs.readdirSync(root).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const direct = [...html.matchAll(/<script[^>]+src=["']\/?(js\/app-\d\d[^"'?]*)/g)].map((m) => m[1]);
    assert.deepEqual(direct, [], page + ' يحمّل جزءًا مفردًا');
  }
});
