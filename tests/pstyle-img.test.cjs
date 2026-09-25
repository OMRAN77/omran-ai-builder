'use strict';
/* v-pstyle-img (المالك ٢٥ سبتمبر، لقطة «أنماط الصور»: بطاقات كثيرة نفس الرجل بنفس البدلة).
   استُبدلت صور خمسة أنماط. لكنّ /assets/ في vercel.json مخبّأة max-age=86400 مع
   stale-while-revalidate أسبوعًا: استبدال الملفّ وحده يُبقي الصورة القديمة عند من فتح
   التطبيق أمس — فالمصدر كلّه صار يمرّ بـpstyleImg() بوسم إصدار يُرفع مع كلّ استبدال. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const js = fs.readFileSync('js/app-12-studios.js', 'utf8');

test('١. كلّ مصادر صور الأنماط تمرّ بـpstyleImg بوسم إصدار', () => {
  assert.match(js, /const PSTYLE_IMG_V = '\d+';/);
  assert.match(js, /function pstyleImg\(v\)\{ return 'assets\/portrait\/styles\/' \+ v \+ '\.webp\?v=' \+ PSTYLE_IMG_V; \}/);
  const raw = js.match(/'assets\/portrait\/styles\/' \+ [^;]*\+ '\.webp'/g) || [];
  assert.deepEqual(raw, [], 'مصدر صورة بلا وسم إصدار: ' + raw.join(' | '));
  assert.ok((js.match(/pstyleImg\(/g) || []).length >= 5, 'عدد مواضع الاستعمال نقص');
});

test('٢. كلّ نمط في القائمة صورته موجودة أو غيابها معروف', () => {
  let src = '';
  for (const f of fs.readdirSync('js')) if (/^partials-/.test(f)) src += fs.readFileSync('js/' + f, 'utf8');
  const m = src.match(/id=\\?"portraitStyleSelect[\s\S]*?<\/select>/);
  assert.ok(m, 'قائمة الأنماط غير موجودة');
  const keys = [...new Set([...m[0].matchAll(/value=\\?"([a-z0-9_-]+)\\?"/gi)].map((x) => x[1]))];
  const have = new Set(fs.readdirSync('assets/portrait/styles').map((f) => f.replace(/\.webp$/, '')));
  assert.ok(keys.length >= 90, 'عدد الأنماط نقص: ' + keys.length);
  // الخمسة المستبدلة لها صور فعلًا
  ['pixel', 'sketch', 'oil', 'cartoon', 'anime'].forEach((k) =>
    assert.ok(have.has(k), 'صورة ناقصة بعد الاستبدال: ' + k));
  // لا صورة يتيمة بلا نمط
  assert.deepEqual([...have].filter((k) => !keys.includes(k)), [], 'صورة بلا نمط في القائمة');
});
