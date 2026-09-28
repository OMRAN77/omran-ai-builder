'use strict';
/* قسم الخلفيات: تحليل الألوان واختيار الخلفيات بألوان متناسقة */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(p, 'utf8');

test('١. ملف مدير الخلفيات موجود ويحتوي على الدوال الأساسية', () => {
  const مدير = read('js/app-25-خلفيات-مدير.js');

  assert.match(مدير, /const خلفيات_جاهزة/);
  assert.match(مدير, /function احسب_لون_مهيمن/);
  assert.match(مدير, /function اختر_لون_نص/);
  assert.match(مدير, /function اختر_ألوان_متناسقة/);
  assert.match(مدير, /async function حضّر_خلفيات/);
  assert.match(مدير, /window\.خلفيات/);
});

test('٢. عدد الخلفيات ف٦ مع أسماء وصور وعلامات', () => {
  const مدير = read('js/app-25-خلفيات-مدير.js');
  const عدد = (مدير.match(/{ اسم:/g) || []).length;

  assert.equal(عدد, 16, `يجب أن تكون ١٦ خلفية لكن وجدنا ${عدد}`);

  // التحقق من أن كل خلفية لها اسم وصورة وعلامات
  for (const سطر of مدير.split('\n')) {
    if (سطر.includes('{ اسم:')) {
      assert.match(سطر, /اسم:/, 'كل خلفية يجب أن يكون لها اسم');
      assert.match(سطر, /صورة:/, 'كل خلفية يجب أن يكون لها صورة');
      assert.match(سطر, /علامات:/, 'كل خلفية يجب أن يكون لها علامات');
    }
  }
});

test('٣. ملف الواجهة موجود مع دوال الاختيار والعرض', () => {
  const واجهة = read('js/partials-خلفيات-قسم.js');

  assert.match(واجهة, /async function أظهر_قسم_الخلفيات/);
  assert.match(واجهة, /function اختر_خلفية/);
  assert.match(واجهة, /function استرجع_خلفية_المحفوظة/);
  assert.match(واجهة, /window\.خلفيات_واجهة/);
});

test('٤. ملف CSS موجود مع أنماط الشبكة والبطاقات', () => {
  const css = read('css/خلفيات.css');

  assert.match(css, /\.خلفيات-شبكة/);
  assert.match(css, /\.خلفية-بطاقة/);
  assert.match(css, /\.خلفية-زر-اختيار/);
  assert.match(css, /grid-template-columns/); // شبكة responsive
});

test('٥. الصور موجودة في المجلد', () => {
  const خلفيات = [
    'شاطئ-رصيف.jpg',
    'بنت-رسمة.jpg',
    'أحذية-مدينة.jpg',
    'جيتار-غروب.jpg',
    'كوكب-فضاء.jpg',
    'كنيسة-جبل.jpg',
    'شاطئ-غروب.jpg',
    'تاج-ذهب.jpg',
    'سيارة-رياضية.jpg',
    'سيارة-مصباح.jpg',
    'فورمولا-1.jpg',
    'جبل-فني.jpg',
    'رجل-قبعة.jpg',
    'فارس-سيف.jpg',
    'شطرنج-ليل.jpg',
    'رسمة-أنمي.jpg',
  ];

  for (const خ of خلفيات) {
    const مسار = `assets/خلفيات/${خ}`;
    assert.ok(fs.existsSync(مسار), `الصورة ${خ} يجب أن تكون موجودة`);
  }
});

test('٦. لا توجد أخطاء في الكود (لا يوجد console.error محاصر)', () => {
  const مدير = read('js/app-25-خلفيات-مدير.js');
  const واجهة = read('js/partials-خلفيات-قسم.js');

  // تحقق من عدم وجود catch فارغ
  assert.doesNotMatch(مدير, /catch\s*\(\s*\)\s*\{\s*\}/, 'لا catch فارغ');
  assert.doesNotMatch(واجهة, /catch\s*\(\s*\)\s*\{\s*\}/, 'لا catch فارغ');
});
