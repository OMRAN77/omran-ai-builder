'use strict';
/* v-no-purge (المالك ٦ سبتمبر: «🗑️ تم حذف الصورة تلقائيًا لتوفير المساحة — شيل هذي الميزة… وأقدر أعدل حتى لو 1000 صورة ورا بعض») */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('js/app-04-i18n-state.js', 'utf8');
const flush = src.slice(src.indexOf('function __saveFlush('), src.indexOf('window.addEventListener(\'pagehide\', __saveFlush)'));

test('IndexedDB saves never purge images — large histories save less often instead', () => {
  assert.ok(!/purgeOldImages\(/.test(flush), 'لا حذف تلقائي للصور في مسار IndexedDB');
  assert.match(flush, /const __gap = __sz > 60000000 \? 30000 : \(__sz > 12000000 \? 10000 : 0\);/);
  assert.match(flush, /if\(__gap && __wait > 0\)\{ __saveDirty = true; __saveTimer = setTimeout\(__saveFlush, __wait\); return; \}/);
  assert.match(flush, /function __saveFlush\(force\)/);
  assert.match(flush, /if\(!force\)\{/);
  assert.match(src, /window\.addEventListener\('pagehide', __saveFlush\)/, 'مغادرة الصفحة تحفظ فورًا بلا تباعد');
});

test('the localStorage fallback keeps its progressive cleanup (5MB hard cap)', () => {
  const local = src.slice(src.indexOf('function saveStateLocal('), src.indexOf('/* ☁️ v306'));
  assert.match(local, /const steps = \[4, 2, 1\];/);
  assert.match(local, /purgeOldImages\(keepCount\)/);
});
