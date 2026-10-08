// tests/gen-wait.test.cjs — v-gen-wait (أمر المالك: «الموجود فقط كلام يقول جاري توليد الصوره
// من غير اي شي — عطني فكره ذهبيه قويه ينتظر التوليد»، ثمّ «الميزه سويتها في الأنماط والفيديو
// والازياء الاستايل»): بطاقة انتظار ذهبيّة ذاتيّة بالكامل ترصد فقاعات «🎨 أرسم لك الصورة…»
// في المحادثة ولوحات الأدوات (الفيديو، أنماط الصور، الأزياء) وتركّب فيها إطارًا نابضًا ونسبة
// تتقدّم بلا توقّف ومراحل وعدّادًا مع توقّع صريح — بلا تعديل على العارض ولا مسارات التوليد.
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
  assert.match(src, /window\.omranGenWait = \{ render: render, scan: scan, _eased: eased, PHRASES: PHRASES, PANELS: PANELS, KINDS: KINDS \};/);
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

test('لوحات الأدوات: الفيديو والأنماط والأزياء ببادئات تطابق نصوصها الحقيقيّة', () => {
  const src = read('js/app-34-gen-wait.js');
  // العناصر الثلاثة نفسها التي تكتب فيها الأدوات حالاتها
  assert.match(src, /#videoMakerStatus/);
  assert.match(src, /#portraitStyleStatus/);
  assert.match(src, /#fashionAiStatus/);
  // الفيديو: مقاس عريض وشريط فلم ومدّة أطول
  assert.match(src, /genwFilm/, 'شريط الفلم المتحرّك');
  assert.match(src, /aspect-ratio:16\/10/, 'مقاس سينمائيّ عريض');
  assert.match(src, /نبني المشاهد…/, 'مراحل الفيديو');
  assert.match(src, /الفيديو ياخذ ١-٣ دقائق/, 'توقّع صريح لمدّة الفيديو');
  assert.match(src, /est: 120/, 'تقدير الفيديو دقيقتان');
  // الأنماط والأزياء: مراحل خاصّة
  assert.match(src, /نحلّل ملامح الصورة…/, 'مراحل الأنماط');
  assert.match(src, /نفهم ذوقك…/, 'مراحل الأزياء');

  // البادئات تطابق ما تكتبه الأدوات فعلًا — لو تغيّرت النصوص يصرخ الاختبار
  const video = read('js/app-11-video.js');
  assert.match(video, /#videoMakerStatus/, 'عنصر حالة الفيديو موجود');
  assert.match(video, /setStatus\(bT\('🚀 جاري إرسال الطلب لمحرك الفيديو الذكي/, 'بادئة 🚀');
  assert.match(video, /⏳ الحالة: /, 'بادئة ⏳ أثناء الاستطلاع');
  assert.match(video, /🎬 جاري إنهاء الفيديو/, 'بادئة 🎬');
  assert.match(video, /🎥 جاري توليد المشهد /, 'بادئة 🎥');
  const studios = read('js/app-12-studios.js');
  assert.match(studios, /#portraitStyleStatus/, 'عنصر حالة الأنماط موجود');
  assert.match(studios, /#fashionAiStatus/, 'عنصر حالة الأزياء موجود');
  const i18n = read('js/app-03-i18n-data.js');
  assert.match(i18n, /portraitGenerating: '⏳ جارٍ التحويل/, 'بادئة ⏳ للأنماط');
  assert.match(i18n, /portraitBuildingGif: '🎞️/, 'بادئة 🎞️ للأنماط');
  assert.match(i18n, /fashionAiGenerating: '🎨 جاري تصميم الزي/, 'بادئة 🎨 للأزياء');
  // حالات التمّ/الخطأ بادئاتها منفصلة فلا تُبقي البطاقة عالقة
  assert.match(i18n, /portraitDone: '✅/);
  assert.match(i18n, /fashionAiDone: '✅/);
});

test('منحنى التقدّم: يتسارع، يهدأ، ولا يتجاوز ٩٢٪ أبدًا', () => {
  const src = read('js/app-34-gen-wait.js');
  const scheduled = [];
  const sandbox = {
    window: {},
    document: { documentElement: {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null },
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
  assert.equal(w.PANELS.length, 3, 'ثلاث لوحات: فيديو، أنماط، أزياء');
  assert.equal(w.KINDS.video.est, 120, 'الفيديو ~دقيقتان');
  assert.ok(w.KINDS.video.film && w.KINDS.video.wide, 'الفيديو عريض بشريط فلم');
  assert.equal(w.KINDS.image.est, 30);
  assert.equal(w.KINDS.styles.est, 45);
  assert.equal(w.KINDS.fashion.est, 40);
});

test('الحزمة المبنيّة تحوي المكوّن (npm run bundle شُغّل)', () => {
  const bundle = read('js/app.bundle.js');
  assert.match(bundle, /window\.omranGenWait/, 'omranGenWait في الحزمة');
  assert.match(bundle, /genwSweep/, 'الحركات في الحزمة');
  assert.match(bundle, /genwFilm/, 'شريط الفلم في الحزمة');
  assert.match(bundle, /#videoMakerStatus/, 'لوحات الأدوات في الحزمة');
  assert.match(bundle, /chatvideo/, 'فيديو المحادثة في الحزمة');
});

test('فيديو المحادثة (v-gen-wait-chatvideo): سطر «🎬 جاري إنشاء الفيديو…» في شريط الحالة يركّب البطاقة العريضة', () => {
  const src = read('js/app-34-gen-wait.js');
  assert.match(src, /CHAT_VIDEO_RE = \/🎬 \(\?:جاري إنشاء الفيديو\|Creating video\)\//, 'كاشف سطر الفيديو');
  assert.match(src, /querySelectorAll\('\.chat-status-text'\)/, 'يرصد السطر الجاري في شريط الحالة');
  assert.match(src, /closest\('\.msg\.assistant'\)/, 'يركّب داخل فقاعة التفكير');
  assert.match(src, /data-genw-panel', 'chatvideo'/, 'بطاقة بوسم مستقلّ');
  assert.match(src, /'💳'/, 'فحص الرصيد 💳 ضمن بادئات انشغال الفيديو');
  // النصّان اللذان يكتبهما مسار الفيديو في المحادثة فعلًا (app-09) — لو تغيّرا يصرخ الاختبار
  const attach = read('js/app-09-attach.js');
  assert.match(attach, /chatPhase\('🎬', lang === 'ar' \? 'جاري إنشاء الفيديو…/, 'سطر بدء الفيديو');
  assert.match(attach, /chatPhase\('🎬', \(lang === 'ar' \? 'جاري إنشاء الفيديو… '/, 'سطر الاستطلاع');
  assert.match(attach, /'Creating video… this can take 1–3 minutes'/, 'الإنجليزيّ');
  assert.match(read('js/app-11-video.js'), /💳 جاري التأكد من رصيد الفيديو/, 'سطر فحص الرصيد في صانع الفيديو');
});
