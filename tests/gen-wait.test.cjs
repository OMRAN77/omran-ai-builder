// tests/gen-wait.test.cjs — v-gen-wait (أمر المالك: «الموجود فقط كلام يقول جاري توليد الصوره
// من غير اي شي — عطني فكره ذهبيه قويه ينتظر التوليد»): بطاقة انتظار ذهبيّة ذاتيّة بالكامل
// ترصد فقاعات «🎨 أرسم لك الصورة…» في المحادثة وتركّب فيها إطارًا نابضًا ونسبة تتقدّم بلا
// توقّف ومراحل وعدّادًا مع توقّع صريح — بلا تعديل على العارض ولا مسارات التوليد.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('المكوّن موجود ويعرّف window.omranGenWait بلا تصادم علويّ', () => {
  const src = read('js/app-34-gen-wait.js');
  assert.match(src, /window\.omranGenWait = \{ render: render, scan: scan, _eased: eased, PHRASES: PHRASES \};/);
  assert.match(src, /^\(function\(\)\{/m, 'ملفوف بـIIFE — لا أسماء علويّة تتسرب');
  assert.match(src, /prefers-reduced-motion/, 'يحترم تقليل الحركة');
  assert.match(src, /genwSweep/, 'حدّ ذهبيّ يدور');
  assert.match(src, /genwPulse/, 'نبض');
  assert.match(src, /genwShimmer/, 'شيمر');
  assert.match(src, /نفهم طلبك…/, 'مراحل عربيّة');
  assert.match(src, /Final touches ✨/, 'مراحل إنجليزيّة');
  assert.match(src, /الصور تاخذ ~٣٠ ثانية/, 'توقّع صريح للوقت');
});

test('ذاتيّ بالكامل: يرصد أسطر التوليد الحقيقيّة بلا لمس العارض ولا المسارات', () => {
  const src = read('js/app-34-gen-wait.js');
  assert.match(src, /MutationObserver/, 'رصد تلقائيّ');
  assert.match(src, /🎨 أرسم لك الصورة…/);
  assert.match(src, /🎨 Generating your image…/);
  assert.match(src, /🎨 أرسم لك نسخة ثانية…/);
  assert.match(src, /🎨 Creating another version…/);
  // الأسطر نفسها ما زالت في مسارات التوليد كما هي — الرصد يعتمد عليها
  const attach = read('js/app-09-attach.js');
  assert.equal((attach.match(/🎨 أرسم لك الصورة…/g) || []).length, 2, 'سطرا التوليد العاديّ والخام');
  assert.match(attach, /🎨 أرسم لك نسخة ثانية…/, 'سطر النسخة الثانية');
});

test('منحنى التقدّم: يتسارع، يهدأ، ولا يتجاوز ٩٢٪ أبدًا', () => {
  const src = read('js/app-34-gen-wait.js');
  const scheduled = [];
  const sandbox = {
    window: {},
    document: { documentElement: {}, querySelectorAll: () => [], getElementById: () => null },
    MutationObserver: function(){ return { observe(){} }; },
    setTimeout: (fn) => { scheduled.push(fn); return 0; },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox); // التحميل لا يلمس DOM حقيقيًّا — تعريف وجدولة فحسب
  const w = sandbox.window.omranGenWait;
  assert.equal(typeof w.render, 'function');
  assert.equal(typeof w.scan, 'function');
  assert.equal(w._eased(0), 0);
  assert.ok(w._eased(0.25) > 0.25, 'انطلاقة أسرع من الخطّ المستقيم');
  assert.ok(w._eased(0.9) < 0.92 && w._eased(0.9) > 0.8, 'يهدأ قرب النهاية');
  assert.equal(w._eased(1), 0.92);
  assert.equal(w._eased(5), 0.92, 'لا يعلق ولا يتجاوز ٩٢٪ مهما طال');
  assert.deepEqual(w.PHRASES.length, 4);
});

test('الحزمة المبنيّة تحوي المكوّن (npm run bundle شُغّل)', () => {
  const bundle = read('js/app.bundle.js');
  assert.match(bundle, /window\.omranGenWait/, 'omranGenWait في الحزمة');
  assert.match(bundle, /genwSweep/, 'الحركات في الحزمة');
});
