// v-maha-short-cmd: كانت كلّ كلمة واحدة تُعلَّم منخفضة الثقة دائمًا في api/_lib/stt.js،
// فردّ المستخدم بـ"نعم" أو "لا" أو "stop" في مكالمة مها الصوتيّة كان يصير دومًا "أعد من
// فضلك" رغم أنّه أمر/إجابة مشروعة وشائعة جدًّا. هذا الاختبار يستخرج منطق الثقة فعليًّا من
// الملفّ المصدر (بلا محاكاة شبكة) ويشغّله بمدخلات Whisper مزيَّفة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'api/_lib/stt.js'), 'utf8');

const whitelistStart = src.indexOf('const SHORT_COMMANDS_RAW');
const whitelistEnd = src.indexOf('module.exports');
const whitelistBlock = src.slice(whitelistStart, whitelistEnd);
assert.ok(whitelistStart > 0 && whitelistEnd > whitelistStart, 'كتلة القائمة البيضاء موجودة');

const confStart = src.indexOf('// Compute a simple confidence score');
const confEnd = src.indexOf("// Whisper's own detected spoken language");
const confBlock = src.slice(confStart, confEnd);
assert.ok(confStart > 0 && confEnd > confStart, 'كتلة حساب الثقة موجودة');

const harness = whitelistBlock + '\nfunction computeLowConfidence(parsed){\n' + confBlock + '\n  return lowConfidence;\n}\nthis.computeLowConfidence = computeLowConfidence;\nthis.normalizeShortWord = normalizeShortWord;\nthis.SHORT_COMMANDS = SHORT_COMMANDS;\n';
const ctx = {};
vm.runInNewContext(harness, ctx);

test('كلمة واحدة من القائمة البيضاء لا تُعلَّم منخفضة الثقة أبدًا، حتى بلا segments', () => {
  for (const w of ['نعم', 'لا', 'stop', 'شكراً', 'أوكي', 'كمّل']) {
    assert.equal(ctx.computeLowConfidence({ text: w }), false, w + ' يجب ألا يُعلَّم');
  }
});

test('كلمة واحدة من القائمة البيضاء لا تُعلَّم منخفضة الثقة حتى مع segments ضعيفة جدًّا', () => {
  const weakSegments = [{ no_speech_prob: 0.9, avg_logprob: -2 }];
  assert.equal(ctx.computeLowConfidence({ text: 'نعم', segments: weakSegments }), false);
  assert.equal(ctx.computeLowConfidence({ text: 'stop', segments: weakSegments }), false);
});

test('كلمة واحدة خارج القائمة مع segments ضعيفة = منخفضة الثقة', () => {
  const weakSegments = [{ no_speech_prob: 0.5, avg_logprob: -0.9 }];
  assert.equal(ctx.computeLowConfidence({ text: 'همارة', segments: weakSegments }), true);
});

test('كلمة واحدة خارج القائمة بلا segments = لا تُعلَّم (لا معلومات كافية)', () => {
  assert.equal(ctx.computeLowConfidence({ text: 'همارة' }), false);
});

test('كلمة واحدة خارج القائمة مع segments قويّة = لا تُعلَّم', () => {
  const strongSegments = [{ no_speech_prob: 0.05, avg_logprob: -0.1 }];
  assert.equal(ctx.computeLowConfidence({ text: 'همارة', segments: strongSegments }), false);
});

test('النصوص الأطول: سلوك العتبة العامّة (0.5 / -1.0) لم يتغيّر', () => {
  const barelyOk = [{ no_speech_prob: 0.5, avg_logprob: -1.0 }];
  assert.equal(ctx.computeLowConfidence({ text: 'هذا كلام طويل جدًّا فعلًا', segments: barelyOk }), false);
  const bad = [{ no_speech_prob: 0.51, avg_logprob: -1.0 }];
  assert.equal(ctx.computeLowConfidence({ text: 'هذا كلام طويل جدًّا فعلًا', segments: bad }), true);
});

test('تطبيع الترقيم والتشكيل والهمزات: "نعم." و"شكرا" و"شكراً" و"أوك" كلها في القائمة', () => {
  assert.ok(ctx.SHORT_COMMANDS.has(ctx.normalizeShortWord('نعم.')));
  assert.ok(ctx.SHORT_COMMANDS.has(ctx.normalizeShortWord('شكرا')));
  assert.ok(ctx.SHORT_COMMANDS.has(ctx.normalizeShortWord('شكراً')));
  assert.ok(ctx.SHORT_COMMANDS.has(ctx.normalizeShortWord('أوك')));
  assert.ok(ctx.SHORT_COMMANDS.has(ctx.normalizeShortWord('OK')));
});

console.log('✓ maha-short-word-confidence: أوامر/إجابات قصيرة معروفة لا تُرفض دائمًا في مها');
