// tests/tv-owner.test.cjs — v-tv-owner (المالك ٣ نوفمبر ٢٠٢٦: «ضيفه فقط لي المالك»): التلفزيون موقوف للجميع ويظهر لحساب المالك وحده.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ui = read('js/app-05-ui.js');
const block = ui.slice(ui.indexOf('var OMRAN_PAUSED_TOOLS'), ui.indexOf('/* v-hw-resubmit-2'));
const run = (owner) => new Function('omranOwnerUi', block + '; return { OMRAN_PAUSED_TOOLS };')(owner === undefined ? undefined : () => owner);

test('١. المالك يرى التلفزيون، وغيره لا — والأدوات الموقوفة الأخرى موقوفة للجميع', () => {
  assert.deepEqual(run(true).OMRAN_PAUSED_TOOLS, ['btnExpense', 'btnCV', 'btnQuickTemplates'], 'المالك: التلفزيون خرج من الموقوفة وحده');
  assert.deepEqual(run(false).OMRAN_PAUSED_TOOLS, ['btnExpense', 'btnCV', 'btnOmranTV', 'btnQuickTemplates'], 'غير المالك: كما كان');
  assert.deepEqual(run(undefined).OMRAN_PAUSED_TOOLS, ['btnExpense', 'btnCV', 'btnOmranTV', 'btnQuickTemplates'], 'بلا دالّة المالك (بيئة أخرى): موقوف');
  assert.ok(ui.includes(".filter(function(id){ return !(['btnOmranTV'].indexOf(id) >= 0 && typeof omranOwnerUi === 'function' && omranOwnerUi()); });"), 'قائمة المالك داخل السطر نفسه (الاختبارات الأخرى تقصّ من var OMRAN_PAUSED_TOOLS)');
});

test('٢. المالك = حساب omran نفسه، والقائمة الحرفيّة التي تقرؤها الاختبارات الأخرى باقية', () => {
  assert.ok(ui.includes("function omranOwnerUi(){\n  try{ return String((typeof authGet === 'function' && authGet('aiapp_username')) || '').trim().toLowerCase() === 'omran'; }"));
  assert.match(ui, /var OMRAN_PAUSED_TOOLS = \['btnExpense', 'btnCV', 'btnOmranTV', 'btnQuickTemplates'\]\.filter\(/, 'hw-resubmit وmaha-app يقرآن القائمة الحرفيّة');
  // شاشة الأدوات تخفي ما في القائمة وحدها (لا قائمة أخرى للتلفزيون)
  const feat = read('js/app-10-features.js');
  assert.ok(feat.includes("if(OMRAN_PAUSED_TOOLS.indexOf(id) >= 0){ b.hidden = true;"));
  assert.ok(!/btnOmranTV[^\n]*hidden/.test(feat), 'لا إخفاء ثانٍ للتلفزيون');
  assert.ok(read('js/app.bundle.js').includes("return !(['btnOmranTV'].indexOf(id) >= 0 && typeof omranOwnerUi === 'function' && omranOwnerUi());"), 'شغّل npm run bundle');
});
