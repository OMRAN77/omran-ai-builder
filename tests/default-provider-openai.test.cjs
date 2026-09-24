// v-default-provider-openai (طلب المالك: «حط GPT الرئيسي في المحادثة، بيني الصور» — نعم في
// الاثنين): افتراضي المحادثة (ولا يوجد مسار صور منفصل — الصور تمرّ بنفس aiapp_provider الحاليّ،
// راجع imageTurnConfig في api/_lib/chat.js) كان "claude" في ١٤ موضعًا مكرّرًا عبر ٧ ملفّات
// (localStorage.getItem('aiapp_provider') || 'claude') — كلّها صارت "openai". لا سرّ مزوّد
// ولا اسم يراه المستخدم تغيّر — هذا تغيير افتراضيّ داخليّ بحت.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const FILES = [
  'js/premium.js',
  'js/app-22-session-new.js',
  'js/app-04-i18n-state.js',
  'js/modes.js',
  'js/app-06-checkout.js',
  'js/app-09-attach.js',
  'js/app-05-ui.js',
];

test('لا بقايا افتراضيّ "claude" لـaiapp_provider في أيّ ملفّ مصدر (لا الحزمة)', () => {
  for (const f of FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /getItem\('aiapp_provider'\)\s*\|\|\s*'claude'/, f + ': لا يزال يفترض claude');
  }
});

test('كل موضع سابق أصبح صراحة "openai" — عدد المواضع لم ينقص (١٤ موضعًا نُقلت لا حُذفت)', () => {
  let total = 0;
  for (const f of FILES) {
    const src = read(f);
    const n = (src.match(/getItem\('aiapp_provider'\)\s*\|\|\s*'openai'/g) || []).length;
    total += n;
    assert.ok(n > 0, f + ': لا يوجد افتراضيّ openai إطلاقًا');
  }
  assert.equal(total, 14, 'مجموع كلّ المواضع الأربعة عشر عبر الملفّات السبعة');
});

test('حالتا catch الاحتياطيّتان (app-22-session-new وmodes) أيضًا openai لا claude', () => {
  assert.match(read('js/app-22-session-new.js'), /catch\(e\)\{ \/\* guard-ok \*\/ provKey = 'openai'; \}/);
  assert.match(read('js/modes.js'), /catch\(e\)\{ return 'openai'; \}/);
});

test('ترحيل deepseek→openai القائم لم يُمَسّ (سلوك قديم منفصل تمامًا عن هذا التغيير)', () => {
  assert.match(read('js/app-05-ui.js'), /if\(localStorage\.getItem\('aiapp_provider'\) === 'deepseek'\) localStorage\.setItem\('aiapp_provider', 'openai'\);/);
});

console.log('✓ default-provider-openai: GPT صار الافتراضيّ في كلّ مسارات المحادثة (والصور تتبعها تلقائيًا لعدم وجود مسار منفصل)');
