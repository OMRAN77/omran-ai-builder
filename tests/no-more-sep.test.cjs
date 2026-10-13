'use strict';
/* v-no-more-sep (المالك ١٣ أكتوبر، لقطة شريط أزرار الردّ: «فيه خط صغير… بين 3 نقاط والدائرة» ← «نعم» شيله): الفاصل الرفيع قبل زرّ
   القائمة ⋮ أُزيل كلّيًّا — لا حدّ ولا الحشوة التي كانت تفسح له — فالمسافة بين ⋮ وما جاوره كبقيّة الأزرار (gap الشريط). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. لا فاصل قبل ⋮: لا حدّ جانبيّ ولا حشوة له على msgMoreTrigger في أيّ ملفّ أنماط', () => {
  const css = fs.readdirSync(path.join(root, 'css')).filter((f) => f.endsWith('.css')).map((f) => read('css/' + f)).join('\n');
  const rules = css.match(/[^{}]*msgMoreTrigger[^{}]*\{[^}]*\}/g) || [];
  for (const r of rules) assert.ok(!/border-(inline-start|left|right)\s*:|padding-inline-start\s*:/.test(r), 'فاصل باقٍ: ' + r.trim());
  assert.ok(read('css/tokens.css').includes('.msgReplyActions .msgMoreTrigger{ order:1; }'), 'ترتيب الزرّ كما كان');
  assert.ok(read('css/tokens.css').includes('.msgActionBar{ display:flex; align-items:center; gap:12px;'), 'المسافة الموحّدة بين الأزرار');
});

test('٢. وسم tokens.css مرفوع فوق 731 (وسم القاعدة المحذوفة) فلا يبقى الخطّ من النسخة المخزّنة', () => {
  const v = Number((read('index.html').match(/tokens\.css\?v=(\d+)/) || [])[1]); // يُقرأ من index.html لا يُثبَّت (سقّاطة vPinTests)
  assert.ok(v > 731, 'الوسم ' + v);
});
