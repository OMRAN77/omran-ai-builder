'use strict';
/* v-text-parser (المالك ٢٧ سبتمبر: «اكتب على اليمين مشكور اخوي» طُبعت «على / اليمين / مشكور / آخوي» يسارًا —
   «عذبتني… صلح من الصفر»). المحلّل أُعيدت كتابته من الصفر: ما بين علامتي التنصيص حرفيّ، والباقي تُقشَّر حوافّه بجداول
   مسمّاة (حشو، موضع، تنسيق، رابط، وسم) حتّى يثبت، فعبارة الموضع تُقرأ في أيّ مكان ولا تُطبع. هنا صفوف العقد الجديدة
   وعيّنة من طبقات الأعطاب التي قيست على ٣٨٣ صيغة (٦١٫٤٪ قبل، ١٠٠٪ بعد) و١١٨ صيغة لم يرها المرشّحون. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseImageTextSpec: P, textRemoveIntent, textReplaceIntent, layerWordSwap, imageWriteIntent } = require('../js/app-08-image-text.js');

const eq = (input, want) => {
  const s = P(input);
  for (const [k, v] of Object.entries(want)) {
    const got = k.split('.').reduce((a, p) => (a == null ? undefined : a[p]), s);
    if (v === 'FALSY') assert.ok(!got, input + ' ← ' + k); else assert.equal(got, v, input + ' ← ' + k);
  }
};
const RC = { wantsText: true, exactText: 'مشكور اخوي', position: 'right-center', positionAuto: false, positionFlex: true };

test('لقطة المالك: عبارة الموضع قبل النصّ أو بعده أو قبل الفعل تُقرأ موضعًا ولا تُطبع', () => {
  for (const p of ['اكتب على اليمين مشكور اخوي', 'اكتب عليها على اليمين مشكور اخوي', 'اكتب مشكور اخوي على اليمين', 'اكتب عليها مشكور اخوي على اليمين',
    'على اليمين اكتب مشكور اخوي', 'اكتب باليمين مشكور اخوي', 'اكتب في اليمين مشكور اخوي', 'اكتب يمين مشكور اخوي', 'اكتب مشكور اخوي يمين',
    'اكتب مشكور اخوي في اليمين', 'اكتب مشكور اخوي يمين الصورة', 'اكتب مشكور اخوي على يمين الصورة', 'اكتب على يمين الصورة مشكور اخوي',
    'اكتب مشكور اخوي وحطه على اليمين', 'اكتب مشكور اخوي، على اليمين', 'اكتب مشكور اخوي (على اليمين)', 'اكتب عاليمين مشكور اخوي', 'اكتب «مشكور اخوي» على اليمين']) eq(p, RC);
  eq('اكتب على اليسار مشكور اخوي', { exactText: 'مشكور اخوي', position: 'left-center', positionAuto: false });
});

test('جهة + ارتفاع، والارتفاع وحده في الذيل، والإنجليزيّة', () => {
  eq('اكتب على اليمين فوق مشكور اخوي', { exactText: 'مشكور اخوي', position: 'right-top', positionFlex: false });
  eq('اكتب مشكور اخوي اعلى اليمين', { exactText: 'مشكور اخوي', position: 'right-top' });
  eq('اكتب مشكور اخوي تحت على اليسار', { exactText: 'مشكور اخوي', position: 'left-bottom' });
  eq('اكتب تحت على اليمين مشكور اخوي بالذهبي', { exactText: 'مشكور اخوي', position: 'right-bottom', color: '#f4cf65' });
  eq('اكتب مشكور اخوي تحت', { exactText: 'مشكور اخوي', position: 'bottom', positionAuto: false });
  eq('اكتب مشكور اخوي فوق', { exactText: 'مشكور اخوي', position: 'top' });
  eq('اكتب مشكور اخوي بالنص', { exactText: 'مشكور اخوي', position: 'center' });
  eq('اكتب في الأسفل: جميع الحقوق محفوظة', { exactText: 'جميع الحقوق محفوظة', position: 'bottom' });
  eq('أضف عبارة «معًا نصنع الفرق» أعلى الصورة', { exactText: 'معًا نصنع الفرق', position: 'top' });
  eq('write Omran at the bottom left', { exactText: 'Omran', position: 'left-bottom' });
});

test('الحرفيّ يبقى كما كُتب: اللهجة لا تُصحَّح، والتنصيص يغلب، والكلمات الداخليّة تبقى', () => {
  eq('اكتب مشكور اخوي', { exactText: 'مشكور اخوي', positionAuto: true });
  eq('اكتب مشكور أخوي', { exactText: 'مشكور أخوي' });
  eq('اكتب «على اليمين»', { exactText: 'على اليمين' });
  eq('اكتب ملك اليمين', { exactText: 'ملك اليمين' });
  eq('اكتب نور على نور', { exactText: 'نور على نور' });
  eq('اكتب الحب في القلب', { exactText: 'الحب في القلب' });
  eq('اكتب اسمي سماء فوق', { exactText: 'سماء', position: 'top' });
});

test('الموضع وحده بلا نصّ = نقل الكتابة القائمة، والحذف يستهدف الكتابة وحدها', () => {
  eq('اكتب على اليمين', { wantsText: false, exactText: null, styleOnlyWrite: true, 'styleEdit.position': 'right-center' });
  eq('حط الكتابة يمين', { wantsText: false, 'styleEdit.position': 'right-center' });
  eq('احذف هذي الشجرة', { removeText: 'FALSY' });
  eq('شيل هذا الكرسي', { removeText: 'FALSY' });
  eq('احذف الكلام', { removeText: true, wantsText: false });
  assert.equal(textRemoveIntent('حوز الكلام الي تحت'), true);
});

test('طلب تأليف يُكتب له نصّ لا يُطبع حرفيًّا، وتعديل المشهد لا يصير كتابة', () => {
  for (const p of ['اكتب تهنئة عيد', 'اكتب عبارة شكر', 'اكتب كلمة حلوة لأمي', 'اكتب لي شي حلو عن البحر', 'اكتب عليها كلا م حب زوجين']) eq(p, { wantsText: true, exactText: null, autoAuthored: true });
  eq('اكتب دعا «اللهم ارحمه»', { exactText: 'اللهم ارحمه', kind: 'prayer' });
  for (const p of ['ضيف عليها ثلج', 'حط فوقها شمس', 'حط عليها قلوب']) eq(p, { wantsText: false, exactText: null });
  for (const p of ['كبّر الصورة', 'خلها أبيض وأسود', 'خل الإضاءة ذهبية', 'ضيف قمر فوق']) eq(p, { wantsText: false, styleEditLoose: null });
});

test('صيغ فعل الكتابة الأوسع: تكتب/كتبلي/كتابة', () => {
  eq('ممكن تكتب عليها مشكور اخوي', { wantsText: true, exactText: 'مشكور اخوي' });
  eq('كتبلي مشكور اخوي على اليمين', { exactText: 'مشكور اخوي', position: 'right-center' });
  eq('الرجاء كتابة اسم «خالد» أسفل الصورة', { exactText: 'خالد', position: 'bottom' });
});

test('ذيل اللهجة القديم محفوظ (v-tail-dialect)، ولا تجمّد مع كلمات تنسيق متكرّرة', () => {
  eq('اكتب روضه عمري و ايكون بخط زخرفي بس اكتب روضه عمري لا تكتب شي و ألون ايكون ذهبي', { exactText: 'روضه عمري', fontKey: 'diwani', color: '#f4cf65', visualEdit: null });
  for (const unit of ['بالأحمر', 'وبالجهة اليمنى']) {
    const t0 = process.hrtime.bigint();
    P('اكتب مشكور ' + Array(24).fill(unit).join(' ') + ' x');
    assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 200, 'لا تراجع أُسّيّ (كانت ٢٫٤–٦٫٣ ثانية في المرشّح قبل التقييد)');
  }
});

/* v-parser-review: مراجعة عدائيّة لإعادة البناء أثبتت ١٩ عطبًا في المحلّل؛ كلّ صيغة أعادت إنتاجها مثبّتة هنا حرفيًّا. */
const PINK = '#ff4f9a', GOLD = '#f4cf65', WHITE = '#fdfdfd', BLACK = '#111111', RED = '#d32f2f';
const ISTIRJA = 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ';

test('١) الكتابة أمرٌ للتطبيق فقط: «ولد يكتب»، «آلة كتابة»، «type fast» وصفُ مشهد لا نصّ يُطبع', () => {
  for (const p of ['ارسم ولد يكتب على السبورة', 'ارسم طفل يكتب واجبه', 'ارسم آلة كتابة قديمة', 'ابي صورة فيها كتابة بخط اليد', 'صورة بنت تكتب رسالة',
    'ارسم قطة تكتب', 'كبر كتابة التاريخ', 'صحح كتابة الاسم في البطاقة', 'draw a man who can type fast']) eq(p, { wantsText: false, exactText: null });
  for (const p of ['ارسم قطة تكتب', 'صورة بنت تكتب رسالة']) assert.equal(imageWriteIntent(p), false, p);
  assert.equal(textReplaceIntent('صحح كتابة الاسم في البطاقة'), null, '«كتابة الاسم» إضافة لا نصّ جديد');
  /* إطار الطلب يبقى كتابة */
  eq('ابي تكتب مرحبا يسار', { exactText: 'مرحبا', position: 'left-center' });
  eq('ابغاك تكتب مبروك المولود', { exactText: 'مبروك المولود' });
  eq('يا ليت تكتب عليها الله يرحم والديك', { exactText: 'الله يرحم والديك' });
  eq('أريد كتابة «مرحبًا» على الجانب الأيمن', { exactText: 'مرحبًا', position: 'right-center' });
  eq('ارسم كيكة مع كتابة عيد ميلاد سعيد', { exactText: 'عيد ميلاد سعيد' });
  eq('type «Eid Mubarak»', { exactText: 'Eid Mubarak' });
});

test('٢) «غيرها الى كرتون/ليل/رسم زيتي» تحويلٌ للصورة لا استبدالٌ للنصّ', () => {
  for (const p of ['غيرها الى كرتون', 'غيرها الى ليل', 'بدلها الى رسم زيتي']) assert.equal(textReplaceIntent(p), null, p);
  assert.equal(textReplaceIntent('غيرها لـ شكراً جزيلاً'), 'شكراً جزيلاً');
  assert.equal(textReplaceIntent('غيره الى تسلم يدك'), 'تسلم يدك');
  assert.equal(textReplaceIntent('غيرها الى «ليل»'), 'ليل', 'المنصَّص نصّ دائمًا');
});

test('٣) «بدون كتابة» حذفٌ لطبقتنا فقط حين لا يبقى غيره — لا صورة جديدة ولا طلب محادثة', () => {
  for (const p of ['سو لي صورة قطة بدون كتابة', 'ما ابي كلام كثير اختصر', 'جاوبني بدون كلام كثير', 'غير الخلفية لبحر بدون كتابة']) {
    assert.equal(textRemoveIntent(p), false, p);
    eq(p, { removeText: 'FALSY' });
  }
  for (const p of ['ابيها بدون كتابة', 'رجعها بدون الكلام', 'ما ابي الكلام', 'بدون كلام']) assert.equal(textRemoveIntent(p), true, p);
});

test('٤) النفي لا يكتب: «ما ابيك تكتب عليها شي»، «لا تكتب شي وخلها ليل»', () => {
  for (const p of ['ما ابيك تكتب عليها شي', 'لا تكتب شي وخلها ليل', 'لا تكتب اسمي، بس خل الجو مغيم']) {
    eq(p, { wantsText: false, exactText: null, autoAuthored: 'FALSY' });
    assert.equal(imageWriteIntent(p), false, p);
  }
});

test('٥) «الاسم» يُنسَّق ويُنقل ولا يُستبدل بكلمة الحجم؛ «غير الاسم لسارة» على الاسم وحده', () => {
  eq('خلي الاسم أكبر', { wantsText: false, 'styleEdit.size': 'larger' });
  eq('خلي الاسم أصغر', { 'styleEdit.size': 'smaller' });
  eq('خل الاسم يمين', { 'styleEdit.position': 'right-center', positionFlex: true });
  for (const p of ['خلي الاسم أكبر', 'خلي الاسم أصغر', 'غير الاسم لسارة', 'غير الاسم الى سارة']) assert.equal(textReplaceIntent(p), null, p);
  assert.equal(layerWordSwap('غير الاسم لسارة', 'احمد'), 'سارة');
  assert.equal(layerWordSwap('بدل الاسم الى محمد', 'عمران'), 'محمد');
  assert.equal(layerWordSwap('غير الاسم الى سارة', 'مبروك يا احمد'), null, 'العبارة الأطول لمسار تبديل الاسم داخل الصورة');
});

test('٦) متابعة بضمير المؤنّث أو غيره تعيد تنسيق الكتابة القائمة ولا تذهب للمولّد', () => {
  const L = (p, k, v) => eq(p, { wantsText: false, ['styleEditLoose.' + k]: v });
  L('خلها على اليمين', 'position', 'right-center'); L('خلها يمين', 'position', 'right-center'); L('حطها فوق', 'position', 'top');
  L('نزلها تحت', 'position', 'bottom'); L('وديه يسار', 'position', 'left-center'); L('رجعه تحت', 'position', 'bottom');
  L('خليها وردي', 'color', PINK); L('خلها بالأبيض', 'color', WHITE); L('خلها اكبر', 'size', 'larger');
  L('اللون ذهبي', 'color', GOLD); L('بدل اللون للأسود', 'color', BLACK);
  for (const p of ['خلها أبيض وأسود', 'غير لون السيارة للأحمر', 'خلها أوضح', 'غيرها الى كرتون']) eq(p, { styleEditLoose: null });
});

test('٧) دعاء على صورة المستخدم مع ذيل مشهد: الذيل يذهب للمولّد لا يضيع', () => {
  eq('اكتب عليها دعاء للوالدين وخل الخلفية بحر', { autoAuthored: true, kind: 'prayer', visualEdit: 'خل الخلفية بحر' });
  eq('اكتب دعاء للوالدين والخلفية بحر', { autoAuthored: true, visualEdit: 'الخلفية بحر' });
  assert.match(P('اكتب شعر عن الام والصورة تعبر عن الحنان').visualEdit, /تعبر عن الحنان/);
  assert.match(P('صورة فيها دعاء يوم الجمعة مع خلفية مسجد').visualEdit, /خلفية مسجد/);
});

test('٨) الجهة وحدها في المتابعة مرنة (positionFlex) كصيغة «خل الكتابة يمين» — لا تُثبَّت في الوسط فوق الأجسام', () => {
  for (const p of ['لا، على اليمين', 'خله يمين', 'على اليمين', 'يمين']) eq(p, { 'styleEditLoose.position': 'right-center', positionFlex: true });
  eq('حطه يسار', { 'styleEditLoose.position': 'left-center', positionFlex: true });
  eq('خله تحت يمين', { 'styleEditLoose.position': 'right-bottom', positionFlex: false });
  eq('حطه فوق', { 'styleEditLoose.position': 'top', positionFlex: false });
});

test('٩) الاسترجاع المنصَّص برسم المصحف في كلّ المسارات (مسار «إنشاء صورة» لا يمرّ بالمدقّق)', () => {
  for (const p of ['صمم صورة عزاء واكتب «انا لله وانا اليه راجعون»', 'اكتب "ان الله وانه اليه راجعون"', 'ارسم بحر واكتب عليه «ان الله و ان اليه راجعون»']) eq(p, { exactText: ISTIRJA });
});

test('١٠) ذيل كلاميّ أو إيموجي أو علامة بعد الموضع لا يحجبه — جملة المالك تبقى «مشكور اخوي» يمينًا', () => {
  const tails = ['تكفى', '🙏', '❤️', '😍😍', '؟', '.', '!!', '…', 'لو سمحت', 'لو تكرمت', 'الله يعافيك', 'الله يخليك', 'يا الغالي', 'بس', 'شوي',
    'ولا تغير الصورة', 'بدون ما تغير الصورة', 'وشكرا', 'pls', 'plz', 'وخلاص', 'مثل ما قلت لك', 'عشان تكون واضحة'];
  for (const t of tails) eq('اكتب مشكور اخوي على اليمين ' + t, RC);
  for (const t of ['تكفى', '🙏', '؟', '!', 'لو سمحت', 'وخلاص']) eq('اكتب على اليمين مشكور اخوي ' + t, RC);
  eq('اكتب على اليمين مشكور اخوي!', RC);
  eq('اكتب مشكور اخوي على اليمين🙏', RC);
  eq('اكتب مشكور اخوي على اليمين والصورة لا تغيرها', RC);
  eq('ممكن تكتب مشكور اخوي؟ على اليمين', RC);
  eq('اكتب مبروك على اليمين يالطيب', { exactText: 'مبروك يالطيب', position: 'right-center' });   /* الجهة تُقرأ والكلمة المجهولة تبقى نصًّا */
  eq('اكتب الجنة تحت اقدام الامهات', { exactText: 'الجنة تحت اقدام الامهات', positionAuto: true });
  eq('اكتب يمين الله', { exactText: 'يمين الله', positionAuto: true });
  eq('اكتب كيف حالك؟', { exactText: 'كيف حالك؟' });
});

test('١١) «بيضا/حمرا/سودا» بلا همزة ألوانٌ للكتابة لا نصٌّ يحلّ محلّها', () => {
  eq('خل الكتابة بيضا', { 'styleEdit.color': WHITE });
  eq('خل الكلام حمرا', { 'styleEdit.color': RED });
  eq('الكتابة ما تبان، خلها سودا', { 'styleEdit.color': BLACK });
  for (const p of ['خل الكتابة بيضا', 'خل الكلام حمرا']) assert.equal(textReplaceIntent(p), null, p);
});

test('١٢) كتابة مع «خل الكتابة يمين» كتابةٌ بموضع — لا نقلٌ للقديم يُسقط الجديد', () => {
  for (const p of ['خل الكتابة يمين واكتب مشكور اخوي', 'اكتب مشكور اخوي وخل الكتابة على اليمين', 'اكتب مشكور اخوي وحط الكتابة على اليمين']) eq(p, Object.assign({ styleEdit: 'FALSY' }, RC));
  eq('خل الكتابة يمين واكتب يعطيك العافية', { wantsText: true, exactText: 'يعطيك العافية', position: 'right-center', styleEdit: 'FALSY' });
  eq('الكلام يكون يمين، اكتب مشكور اخوي', RC);
  eq('اكتب الحب والكلام', { exactText: 'الحب والكلام' });
});

test('١٣) الوسم والمستلِم لا يُطبعان، والاسم الذي يشبه الموضع يبقى اسمًا', () => {
  eq('اكتب اسم بنتي يمنى', { exactText: 'يمنى', positionAuto: true });
  eq('اكتب اسمها وسن بالوسط', { exactText: 'وسن', position: 'center' });
  eq('اكتب اسم المحل مطعم الريف فوق', { exactText: 'مطعم الريف', position: 'top' });
  eq('اكتب لها مبروك فوق', { exactText: 'مبروك', position: 'top' });
  eq('اكتب اسمي يسرى على اليسار', { wantsText: true, exactText: 'يسرى', position: 'left-center' });
  eq('اكتب يمنى على اليمين', { wantsText: true, exactText: 'يمنى', position: 'right-center' });
  eq('اكتب وسط البلد تحت', { exactText: 'وسط البلد', position: 'bottom' });
  eq('اكتب لك الله يا غزة', { exactText: 'لك الله يا غزة' });
});

test('١٤) كلمات الحجم والخطّ والدرجة تُقرأ ولا تُطبع', () => {
  eq('اكتب مبروك يا عريس بالديواني', { exactText: 'مبروك يا عريس', fontKey: 'diwani' });
  eq('اكتب مبروك بحجم كبير', { exactText: 'مبروك', size: 'large' });
  eq('اكتب مبروك وخليه كبير', { exactText: 'مبروك', size: 'large' });
  eq('اكتب مبروك وخله صغير تحت', { exactText: 'مبروك', size: 'small', position: 'bottom' });
  eq('اكتب مبروك احمر غامق', { exactText: 'مبروك', color: RED });
  eq('اكتب مشكور بالفوشي', { exactText: 'مشكور', color: PINK });
  eq('اكتب ولد الديرة خط كوفي', { exactText: 'ولد الديرة', fontKey: 'kufi' });
  eq('اكتب Eid Mubarak بالنص كبير', { exactText: 'Eid Mubarak', position: 'center', size: 'large' });
  eq('اكتب عمران بلون الذهب', { exactText: 'عمران', color: GOLD });
  eq('اكتب عيد سعيد بالأزرق الفاتح', { exactText: 'عيد سعيد', color: '#5ec8ff' });
  eq('اكتب «أهلًا رمضان» بالنص وكبير', { exactText: 'أهلًا رمضان', position: 'center', size: 'large', visualEdit: null });
  for (const p of ['اكتب الله اكبر', 'اكتب خلها على الله', 'اكتب ربي كبير']) eq(p, { exactText: p.replace(/^اكتب /, '') });
});

test('١٥) «آية/حديث/ذكر/كابشن» و«اكتب لها كلام…» طلب تأليف لا جملة تُطبع', () => {
  eq('اكتب آية عن الصبر فوق', { exactText: null, autoAuthored: true, kind: 'prayer', position: 'top' });
  for (const p of ['اكتب آية قرآنية', 'اكتب حديث عن الأم', 'اكتب ذكر صباحي', 'اكتب كابشن حلو للصورة', 'اكتب لها كلام حلو بمناسبة عيد ميلادها']) eq(p, { wantsText: true, exactText: null, autoAuthored: true });
  eq('اكتب ذكر الله يطمئن القلوب', { exactText: 'ذكر الله يطمئن القلوب' });
});

test('١٦) «…وخل الصورة زي ما هي» إبقاءٌ لا مشهدٌ يُرسل للمولّد', () => {
  for (const p of ['اكتب مشكور اخوي على اليمين وخل الصورة زي ما هي', 'اكتب مشكور اخوي على اليمين وخل الخلفية مثل ما هي', 'اكتب مشكور اخوي على اليمين وخل الصورة على حالها',
    'اكتب مشكور اخوي على اليمين وخلي الصورة نفسها']) eq(p, Object.assign({ visualEdit: null }, RC));
  eq('اكتب مبروك وخل الصورة ليلية', { exactText: 'مبروك', visualEdit: 'خل الصورة ليلية' });
});

test('١٧) «غير اخوي للغالي» يبدّل الكلمة في الطبقة', () => {
  assert.equal(layerWordSwap('غير اخوي للغالي', 'مشكور اخوي'), 'مشكور الغالي');
  assert.equal(layerWordSwap('غير اخوي لـ الغالي', 'مشكور اخوي'), 'مشكور الغالي');
  assert.equal(layerWordSwap('بدل مشكور لله الحمد', 'مشكور اخوي'), 'لله الحمد اخوي', '«لله» تبقى كما هي');
});

test('١٨) «شيل الكتابة اللي على التيشيرت» كتابةٌ في الصورة لا طبقتنا', () => {
  for (const p of ['شيل الكتابة اللي على التيشيرت', 'امسح الكتابة اللي بالخلفية', 'remove the text on the shirt']) {
    assert.equal(textRemoveIntent(p), false, p);
    eq(p, { removeText: 'FALSY' });
  }
  for (const p of ['امسح الكتابة اللي تحت', 'امسح الكتابة اللي على الصورة', 'امسح الكتابة اللي كتبتها', 'remove the text on top']) assert.equal(textRemoveIntent(p), true, p);
});

/* v-parser-review-2: الجولة الثانية من المراجعة العدائيّة — تراجعات أدخلها إصلاح الجولة الأولى، وبقيّة F5. كلّ صيغة مثبّتة حرفيًّا. */
test('١٩) الحذف الموصوف بلون كتابتنا أو حجمها أو لغتها أو زاويتها يحذف طبقتنا ولا يعيد تلوينها؛ والموصوف بشيء آخر تعديلٌ للصورة', () => {
  for (const p of ['شيل الكتابة اللي بالأحمر', 'شيل الكتابة اللي بالذهبي', 'امسح الكتابة اللي بالأبيض', 'احذف الكلام اللي بالخط الكبير',
    'امسح الكلام اللي بالعربي', 'شيل الكتابة اللي بالانجليزي', 'شيل الكتابة اللي بالزاوية']) {
    assert.equal(textRemoveIntent(p), true, p);
    eq(p, { removeText: true, styleEdit: 'FALSY', styleEditLoose: 'FALSY' });
  }
  for (const p of ['شيل الكتابة اللي على التيشيرت', 'امسح الكتابة اللي بالخلفية', 'remove the text on the shirt', 'شيل الكتابة اللي بالأحمر على التيشيرت']) {
    assert.equal(textRemoveIntent(p), false, p);
    eq(p, { removeText: 'FALSY', styleEdit: 'FALSY', styleEditLoose: 'FALSY' });
  }
});

test('٢٠) «وتكتب» المعطوفة على أمرٍ للتطبيق و«صورة عليها كتابة X» كتابة؛ ومشاهد الكتابة تبقى مشاهد', () => {
  eq('ارسم قمر وتكتب تحته مبروك', { wantsText: true, exactText: 'مبروك', position: 'bottom', positionAuto: false });
  eq('سو لي صورة ورد وتكتب صباح الخير', { wantsText: true, exactText: 'صباح الخير' });
  for (const p of ['ممكن ترسم وردة وتكتب مبروك', 'عطني صورة وتكتب مبروك', 'ابيك تسوي صورة وتكتب مبروك', 'ابي صورة عليها كتابة مبروك']) eq(p, { wantsText: true, exactText: 'مبروك' });
  for (const p of ['ارسم ولد يكتب على السبورة', 'ارسم آلة كتابة قديمة', 'صورة بنت تكتب رسالة', 'ابي صورة فيها كتابة بخط اليد',
    'ارسم بنت تقرأ وتكتب رسالة', 'ارسم معلمة وتكتب على السبورة']) eq(p, { wantsText: false, exactText: null });
});

test('٢١) فلتر الأبيض والأسود والخلفية و«الصورة كبرها» تعديلٌ للصورة لا تنسيقٌ للكتابة', () => {
  for (const p of ['خليها بالأبيض والأسود', 'خلها بالابيض والاسود', 'خليها بخلفية بيضاء', 'الصورة كبرها', 'كبّر الصورة']) eq(p, { wantsText: false, styleEdit: 'FALSY', styleEditLoose: null });
});

test('٢٢) الكلام بعد الجهة بـ«و» نصٌّ للمستخدم تُقرأ جهته، إلّا أن يكون هو أمرًا للتطبيق', () => {
  eq('اكتب الله أكبر على اليمين ولله الحمد', { exactText: 'الله أكبر ولله الحمد', position: 'right-center' });
  eq('اكتب صباح الخير على اليسار وأحلى صباح', { exactText: 'صباح الخير وأحلى صباح', position: 'left-center' });
  eq('اكتب مشكور على اليمين والله يعطيك العافية', { exactText: 'مشكور والله يعطيك العافية', position: 'right-center' });
  eq('اكتب مبروك على اليمين والخط كبير', { exactText: 'مبروك', position: 'right-center', size: 'large' });
  eq('اكتب مبروك على اليمين وكبره', { exactText: 'مبروك', position: 'right-center', size: 'larger' });
  eq('اكتب مشكور اخوي على اليمين ولا تغير الصورة', RC);
});

test('٢٣) «لل» + اسمٍ أوّله لام يبقى الاسم («لليلى» = «ليلى» لا «اليلى»)', () => {
  assert.equal(layerWordSwap('غير احمد لليلى', 'مبروك احمد'), 'مبروك ليلى');
  assert.equal(layerWordSwap('غير احمد للمى', 'مبروك احمد'), 'مبروك لمى');
  assert.equal(layerWordSwap('غير احمد لليث', 'مبروك احمد'), 'مبروك ليث');
  assert.equal(layerWordSwap('غير الاسم لليلى', 'احمد'), 'ليلى');
  assert.equal(layerWordSwap('غير اخوي للغالي', 'مشكور اخوي'), 'مشكور الغالي');
});

test('٢٤) «له/لها/لك/لكم» في أوّل النصّ تُقشَّر قبل إطار كتابة فقط، وإلّا فهي من كلام المستخدم', () => {
  eq('اكتب له الجنة', { exactText: 'له الجنة' });
  eq('اكتب لك وحشة', { exactText: 'لك وحشة' });
  eq('اكتب لكم منا أجمل التهاني', { exactText: 'لكم منا أجمل التهاني' });
  eq('اكتب لك الله يا غزة', { exactText: 'لك الله يا غزة' });
  eq('اكتب لها مبروك فوق', { exactText: 'مبروك', position: 'top' });
  eq('اكتب لها عيد ميلاد سعيد', { exactText: 'عيد ميلاد سعيد' });
  eq('اكتب لهم الله يحفظكم', { exactText: 'الله يحفظكم' });
});

test('٢٥) «.» و«؟» الملاصقتان من نصّ المستخدم؛ «؟» الطلب («ممكن تكتب مبروك؟») و«!» والإيموجي تُنزع', () => {
  eq('اكتب صباح الخير.', { exactText: 'صباح الخير' }); // الجولة ٣: نقطة الختام لا تُطبع، و«؟» السؤال تبقى
  eq('ممكن تكتب كيف حالك؟', { exactText: 'كيف حالك؟' });
  eq('تقدر تكتب وش اخبارك؟', { exactText: 'وش اخبارك؟' });
  eq('ممكن تكتب مشكور اخوي؟', { exactText: 'مشكور اخوي' });
  eq('اكتب مشكور اخوي!', { exactText: 'مشكور اخوي' });
  eq('اكتب مشكور اخوي 🙏', { exactText: 'مشكور اخوي' });
});

test('٢٦) متابعة الحجم أو اللون المجرّدة («كبر شوي»، «أصغر»، «لون ابيض») تنسيقٌ مرن يطبّقه العميل على الطبقة القائمة', () => {
  const L = (p, k, v) => eq(p, { wantsText: false, styleEdit: 'FALSY', ['styleEditLoose.' + k]: v });
  for (const p of ['كبر', 'كبر شوي', 'اكبر شوي', 'أكبر', 'كبّر']) L(p, 'size', 'larger');
  for (const p of ['صغر', 'صغر شوي', 'أصغر', 'اصغر شوي']) L(p, 'size', 'smaller');
  L('انزله تحت', 'position', 'bottom');
  L('لون ابيض', 'color', WHITE);
});

test('٢٧) «بدون كتابة احسن»، «الصورة احلى بدون كتابة»، «سويها بدون كتابة» تحذف طبقتنا', () => {
  for (const p of ['بدون كتابة احسن', 'الصورة احلى بدون كتابة', 'سويها بدون كتابة']) assert.equal(textRemoveIntent(p), true, p);
  assert.equal(textRemoveIntent('سو لي صورة قطة بدون كتابة'), false);
});

test('الجولة ٣ من المراجعة: شخص يكتب في المشهد ليس أمرًا، والحذف بكلّ صيغه، وذيول «و…» تعليمات، و«الصورة» في المدح لا تجعلها المفعول', () => {
  for (const p of ['ارسم بنت جالسة وتكتب رسالة', 'ارسم ولد وتكتب واجبه', 'ارسم طفلة سعيدة وتكتب رسالة لامها', 'ارسم ورقة عليها كتابة بالرصاص', 'ارسم سبورة عليها كتابة طباشير']) eq(p, { wantsText: false, exactText: null });
  eq('ارسم قمر وتكتب تحته مبروك', { wantsText: true, exactText: 'مبروك' });
  eq('ابي صورة عليها كتابة مبروك', { wantsText: true, exactText: 'مبروك' });
  for (const p of ['ممكن تشيل الكتابة اللي بالأحمر', 'شيل كل الكتابة اللي بالأحمر', 'امسحي الكتابة اللي بالأحمر', 'احذفي الكلام اللي بالأبيض', 'remove the red text']) { assert.equal(textRemoveIntent(p), true, p); eq(p, { styleEdit: 'FALSY' }); }
  assert.equal(textRemoveIntent('شيل الكتابة اللي بالعربي من الشعار'), false, 'كتابة الشعار ليست كتابتنا');
  eq('اكتب مشكور اخوي على اليمين وحجمه كبير', { exactText: 'مشكور اخوي', position: 'right-center', size: 'large' });
  eq('اكتب مشكور اخوي على اليمين ومزخرف', { exactText: 'مشكور اخوي', fontKey: 'diwani' });
  for (const t of ['ولا تكبره', 'وتكفى', 'وواضح', 'ونفس الخط']) eq('اكتب مشكور اخوي على اليمين ' + t, { exactText: 'مشكور اخوي', position: 'right-center' });
  eq('اكتب الله أكبر على اليمين ولله الحمد', { exactText: 'الله أكبر ولله الحمد', position: 'right-center' });
  eq('الصورة حلوة بس خلها يمين', { wantsText: false, 'styleEditLoose.position': 'right-center' });
  eq('خلها ذهبي عشان الصورة غامقة', { 'styleEditLoose.color': '#f4cf65' });
  eq('كبّر الصورة', { styleEditLoose: 'FALSY' });
  eq('اكتب مشكور اخوي. على اليمين', { exactText: 'مشكور اخوي', position: 'right-center' });
});

test('لقطة المالك «غيرالخلفيه واكتب دعاء الاولاد»: المشهد يصل المحرّر نظيفًا بأيّ ترتيب، والدعاء يؤلَّف', () => {
  for (const p of ['غيرالخلفيه واكتب دعاء الاولاد', 'غير الخلفيه واكتب دعاء الاولاد', 'اكتب دعاء الاولاد وغير الخلفيه']) eq(p, { wantsText: true, exactText: null, autoAuthored: true, kind: 'prayer', visualEdit: 'غير الخلفيه' });
  eq('اكتب عليها دعاء للوالدين وخل الخلفية بحر', { visualEdit: 'خل الخلفية بحر' });
  eq('اكتب دعاء للأولاد', { visualEdit: 'FALSY' });
  const a9 = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js/app-09-attach.js'), 'utf8');
  assert.match(a9, /__visEdit = 'غيّر الخلفية بالكامل وراء الأشخاص إلى ' \+ \(__planVisual \|\| /, '«غير الخلفية» بلا هدف = أمر صريح بهدف من المخطّط');
  assert.match(a9, /content: __visFailed \? \(lang === 'ar' \? 'كتبت على صورتك، بس تغيير الخلفية ما نجح هالمرة/, 'فشل تعديل الخلفيّة يُقال ولا يُسكَت عنه');
});
