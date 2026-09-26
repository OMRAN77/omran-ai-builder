'use strict';
/**
 * v-regen-fullfile: المرفق النصّيّ المحفوظ في الرسالة معاينة ٦٠٠٠ حرف (v-attach-light)،
 * والكامل في IndexedDB. إعادة التوليد والتحرير كانتا ترسلان المعاينة للنموذج
 * فيجيب «الملفّ مقطوع»، والبطاقة تعرض حجم المعاينة لا حجم الملفّ.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');

test('إعادة التوليد تستعيد النصّ الكامل من المخزن قبل بناء apiText', () => {
  const restore = src.indexOf('v-regen-fullfile');
  const build = src.indexOf("apiText += (apiText ? '\\n\\n' : '') + '📄 '");
  assert.ok(restore > 0 && build > restore, 'الاستعادة قبل بناء نصّ الإرسال');
  const block = src.slice(restore, restore + 900);
  assert.ok(block.includes('await idbGet(__a.textFullId)'), 'يقرأ الكامل من IndexedDB');
  assert.ok(block.includes('Object.assign({}, __a, { text: __full })'), 'نسخة — لا يُمسّ المرفق المحفوظ');
});

test('التخفيف لا يكرّر التخزين ويحفظ الحجم الحقيقيّ', () => {
  const i = src.indexOf("a.text = a.text.slice(0, 6000) + '\\n… (اختُصر للعرض");
  assert.ok(i > 0);
  const block = src.slice(i - 900, i);
  assert.ok(block.includes('if(!a.textFullId){'), 'معرّف موجود = لا نسخة ثانية في المخزن');
  assert.ok(block.includes('a.fullBytes =') && block.includes('a.fullLines ='), 'الحجم والأسطر قبل القصّ');
});

test('البطاقة تعرض حجم الملفّ الكامل', () => {
  const i = src.indexOf('function omranGoldBadgeFill');
  const fn = src.slice(i, src.indexOf('window.omranGoldBadgeFill', i));
  assert.ok(fn.includes('if(a.fullBytes > __bytes) __bytes = a.fullBytes;'));
  assert.ok(fn.includes('const ln = a.fullLines ||'));
});
