// tests/i18n-syntax.test.cjs — v-i18n-check (٢١ سبتمبر ٢٠٢٦): i18n/zh.js (الصينية) كان فيه ٢١ مفتاحًا
// (religionTab*/religionInputLabel*/religionInputPlaceholder*، من دفعة "تفسير الأديان الأربع الجديدة")
// محاطة بعلامتَي اقتباس منحنيتين (" ") بدل مستقيمتين — كسر الملفّ كجافاسكربت صالح تمامًا، لكن npm run check
// لم يكن يفحص i18n/*.js إطلاقًا فمرّ العطب صامتًا عبر كل تشغيلة CI حتى اكتُشف يدويًّا. أُصلح المحتوى
// (تحويل علامتَي الإحاطة فقط إلى مستقيمتين، مع إبقاء أي علامات منحنية متداخلة داخل النصّ كما هي — جزء
// من المحتوى الصينيّ الطبيعيّ لا خطأ) ووُسِّع npm run check ليشمل i18n/*.js فلا يتكرّر العطب صامتًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('package.json: سكربت check يفحص i18n/*.js أيضًا لا الأجزاء الأربعة القديمة فقط', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.check, /i18n\/\*\.js/, 'i18n/*.js مذكور صراحة في سكربت check');
});

test('كل ملفّات i18n/*.js تمرّ node --check (بلا استثناء)', () => {
  const dir = path.join(root, 'i18n');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 12, 'توقّعت ١٢ ملفّ لغة على الأقلّ، وجدت ' + files.length);
  for (const f of files) {
    assert.doesNotThrow(() => execSync('node --check ' + JSON.stringify(path.join(dir, f)), { stdio: 'pipe' }), f + ' يجب أن يمرّ node --check');
  }
});

test('i18n/zh.js: مفاتيح الأديان الأربعة الجديدة سليمة بعلامات اقتباس مستقيمة، بلا بقايا علامات منحنية كإحاطة', () => {
  const src = fs.readFileSync(path.join(root, 'i18n/zh.js'), 'utf8');
  assert.match(src, /"religionTabBible": "/, 'المفتاح موجود بعلامات مستقيمة');
  assert.match(src, /"religionTabTorah": "/);
  assert.match(src, /"religionTabBuddhism": "/);
  assert.match(src, /"religionTabHinduism": "/);
  // لا سطر يبدأ بعلامة اقتباس منحنية كإحاطة مفتاح (السبب الجذريّ الأصليّ)
  assert.doesNotMatch(src, /^\s*[“‘]\w/m, 'لا مفتاح مُحاط بعلامة اقتباس منحنية بعد الآن');
});
