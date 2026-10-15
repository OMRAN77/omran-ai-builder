// v-default-provider-openai (طلب المالك: «حط GPT الرئيسي في المحادثة، بيني الصور» — نعم في
// الاثنين): افتراضي المحادثة لغير المالك openai. v-grok-first: المالك بلا اختيار = كروك (openrouter)
// عبر omranDefaultProv / isOwner في modes. لا سرّ مزوّد ولا اسم يراه المستخدم تغيّر.
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
  'js/app-06-checkout.js',
  'js/app-09-attach.js',
  'js/app-05-ui.js',
];

test('لا بقايا افتراضيّ "claude" لـaiapp_provider في أيّ ملفّ مصدر (لا الحزمة)', () => {
  for (const f of FILES.concat(['js/modes.js'])) {
    const src = read(f);
    assert.doesNotMatch(src, /getItem\('aiapp_provider'\)\s*\|\|\s*'claude'/, f + ': لا يزال يفترض claude');
  }
});

test('غير المالك يبقى openai: premium والمسارات التي ليست إرسال المالك', () => {
  assert.match(read('js/premium.js'), /getItem\('aiapp_provider'\)\s*\|\|\s*'openai'/);
  assert.match(read('js/app-09-attach.js'), /getItem\('aiapp_provider'\) \|\| 'openai'/);
});

test('المالك بلا اختيار = كروك في المسارات الحيّة، وغيره GPT', () => {
  assert.match(read('js/app-05-ui.js'), /function omranDefaultProv\(\)\{ return omranOwnerUi\(\) \? 'openrouter' : 'openai'; \}/);
  assert.match(read('js/modes.js'), /isOwner\(\) \? 'openrouter' : 'openai'/);
  // v-owner-solo-all: provEngine في app-17 للمالك وحده (غيره يرجع قبل القراءة) — جهاز جديد بلا اختيار = كروك لا GPT Image الخام
  for (const f of ['js/app-04-i18n-state.js', 'js/app-06-checkout.js', 'js/app-09-attach.js', 'js/app-22-session-new.js', 'js/app-17-agent-tools.js']) {
    assert.match(read(f), /typeof omranDefaultProv === 'function' \? omranDefaultProv\(\) : 'openai'/, f);
  }
});

test('حالتا catch الاحتياطيّتان (app-22-session-new وmodes) openai لغير المالك وكروك للمالك', () => {
  assert.match(read('js/app-22-session-new.js'), /catch\(e\)\{ \/\* guard-ok \*\/ provKey = \(typeof omranDefaultProv === 'function' \? omranDefaultProv\(\) : 'openai'\); \}/);
  assert.match(read('js/modes.js'), /catch\(e\)\{ return isOwner\(\) \? 'openrouter' : 'openai'; \}/);
});

test('ترحيل deepseek→openai القائم لم يُمَسّ (سلوك قديم منفصل تمامًا عن هذا التغيير)', () => {
  assert.match(read('js/app-05-ui.js'), /if\(localStorage\.getItem\('aiapp_provider'\) === 'deepseek'\) localStorage\.setItem\('aiapp_provider', 'openai'\);/);
});

console.log('✓ default-provider-openai: غير المالك GPT · المالك كروك إن لم يختر');
