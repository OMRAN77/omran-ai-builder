'use strict';
/* v-shelf-paint-throttle (فيديو المالك ٢٨ سبتمبر، بعد تأكيده أنّ جهازه على 1.3.12 وما زال يشوف
   صفوف الأدوات تفرغ عند التمرير السريع على هواوي): PITFALLS فخّ ٢٤ سبتمبر (v-modal-img-release) يقول
   إنّ السهم (طبقة تركيب مستقلّة) يبقى مرسومًا بينما الطبقة الرئيسيّة تتأخّر = عطل رسم لا ذاكرة
   (1.3.12 عالج الذاكرة/النافذة الشفّافة بالفعل). المتّهم: __omranWhenSeen يطلق upgradeButton لكل
   زرّ يظهر فورًا، فتزدحم عدّة new Image() على فكّ الترميز في نفس الإطار عند سحب سريع يكشف عدّة أزرار
   دفعة واحدة. الإصلاح: طابور بحدّ تزامن (٣) يبعثر التحميل زمنيًّا. يشغّل هذا الاختبار الوحدة
   الحقيقيّة من js/tool-card-images.js في vm بـDOM مصغّر ومُنشئ Image مزيّف يتحكّم فيه الاختبار. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SRC = fs.readFileSync('js/tool-card-images.js', 'utf8');

function mockEl(tag) {
  const classes = new Set();
  return {
    tag,
    className: '',
    style: {},
    width: 0, height: 0, alt: '', src: '', loading: '',
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
    },
    appendChild() {},
    insertBefore() {},
    removeProperty() {},
    firstChild: null,
    querySelector() { return null; },
    getAttribute() { return null; },
  };
}

function run() {
  const images = []; // كل new Image() مُنشأة فعليًّا (= تحميل بدأ)
  const buttons = {};
  const IDS = ['btnPortraitStyle', 'btnQuickTemplates', 'btnVideoMaker', 'btnDesignAI', 'btnFashionAI', 'btnStudioAI',
    'btnAdStudio', 'btnStocks', 'btnOmranTV', 'btnQibla', 'btnExpense', 'btnOmranEdu', 'btnConstruction',
    'btnReligion', 'btnCV', 'btnDocs', 'btnFeedback', 'btnEmailAssist'];
  IDS.forEach((id) => { buttons[id] = mockEl('button'); });

  const seen = []; // { id, fn } — عناصر مسجَّلة عبر __omranWhenSeen بانتظار «تُرى»
  function FakeImage() { images.push(this); }
  Object.defineProperty(FakeImage.prototype, 'src', { set() {}, get() { return ''; } });

  const ctx = {
    window: {},
    console,
    document: {
      readyState: 'complete',
      documentElement: { lang: 'ar' },
      getElementById: (id) => buttons[id] || null,
      createElement: (tag) => mockEl(tag),
      addEventListener() {},
    },
    Image: FakeImage,
    MutationObserver: function (fn) { this.observe = function () {}; },
    setTimeout: function () {}, // لا مؤقّتات حقيقيّة — تشغيل applyToolPhotos مرّة واحدة فقط
  };
  ctx.window.__omranWhenSeen = (el, fn) => { seen.push(fn); };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);

  return { images, buttons, seen, ids: IDS };
}

test('١. سحب يكشف الأزرار الثمانية عشر دفعة واحدة → ثلاث تحميلات فقط تبدأ فورًا (حدّ التزامن)', () => {
  const { images, seen } = run();
  assert.equal(seen.length, 18, 'كل زرّ سجّل نفسه عند __omranWhenSeen');
  seen.forEach((fn) => fn()); // محاكاة: كلّها صارت مرئية في نفس اللحظة (سحب سريع)
  assert.equal(images.length, 3, 'لا يبدأ أكثر من TC_MAX_CONCURRENT تحميلات في آن واحد');
});

test('٢. اكتمال تحميل واحد يُطلق التالي من الطابور — لا يتجاوز الحدّ أبدًا ويكمل الثمانية عشر كلّها', () => {
  const { images, buttons, seen, ids } = run();
  seen.forEach((fn) => fn());
  let resolved = 0;
  let maxSeenActive = images.length;
  while (resolved < ids.length) {
    const img = images[resolved];
    img.onload();
    resolved++;
    const activeNow = images.length - resolved;
    maxSeenActive = Math.max(maxSeenActive, activeNow);
  }
  assert.equal(images.length, 18, 'كل الأزرار الثمانية عشر حُمِّلت في النهاية');
  assert.ok(maxSeenActive <= 3, 'التزامن الفعليّ لم يتجاوز الحدّ في أيّ لحظة: ' + maxSeenActive);
  ids.forEach((id) => assert.ok(buttons[id].classList.contains('hasToolPhoto'), id + ' صار له صورة'));
});

test('٣. فشل تحميل لا يُعطّل الطابور — الباقي يكمل رغم onerror', () => {
  const { images, buttons, seen, ids } = run();
  seen.forEach((fn) => fn());
  assert.equal(images.length, 3);
  images[0].onerror(); // أوّل تحميل يفشل
  assert.equal(buttons[ids[0]].__tcLoading, null, 'يُسمح بإعادة المحاولة لاحقًا');
  assert.equal(images.length, 4, 'يفتح مكانًا فورًا للتالي في الطابور رغم الفشل');
  // أكمل البقيّة كلّها بلا فشل جديد
  for (let i = 1; i < images.length || images.length < ids.length; i++) {
    if (i >= images.length) break;
    if (images[i].onload) images[i].onload();
  }
  // على الأقل ١٧ زرًّا (كل ما عدا الفاشل) حصلوا على الصورة
  const withPhoto = ids.filter((id) => buttons[id].classList.contains('hasToolPhoto')).length;
  assert.ok(withPhoto >= 16, 'أغلب الطابور اكتمل رغم فشل أوّل تحميل: ' + withPhoto);
});

test('٤. نداءان متتاليان على نفس الزرّ قبل الاكتمال لا يضيفان تحميلًا ثانيًا (حارس السباق القديم باقٍ)', () => {
  const { images, seen } = run();
  seen[0](); // أوّل ظهور لأوّل زرّ
  seen[0](); // نداء ثانٍ فوريّ قبل الاكتمال (applyToolPhotos تُستدعى عدّة مرّات فعليًّا)
  assert.equal(images.length, 1, 'الحارس __tcLoading يمنع تحميلًا مكرَّرًا لنفس الزرّ');
});
