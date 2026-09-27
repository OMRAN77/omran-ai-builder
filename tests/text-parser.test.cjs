'use strict';
/* v-text-parser (المالك ٢٧ سبتمبر: «اكتب على اليمين مشكور اخوي» طُبعت «على / اليمين / مشكور / آخوي» يسارًا —
   «عذبتني… صلح من الصفر»). المحلّل أُعيدت كتابته من الصفر: ما بين علامتي التنصيص حرفيّ، والباقي تُقشَّر حوافّه بجداول
   مسمّاة (حشو، موضع، تنسيق، رابط، وسم) حتّى يثبت، فعبارة الموضع تُقرأ في أيّ مكان ولا تُطبع. هنا صفوف العقد الجديدة
   وعيّنة من طبقات الأعطاب التي قيست على ٣٨٣ صيغة (٦١٫٤٪ قبل، ١٠٠٪ بعد) و١١٨ صيغة لم يرها المرشّحون. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseImageTextSpec: P, textRemoveIntent } = require('../js/app-08-image-text.js');

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
