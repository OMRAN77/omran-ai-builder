'use strict';
/* v-strong-rules (المالك ١٤ أكتوبر: «اريد شي قوي تعليمات قويه نفسك… واذا سوى شي يخرب الدنيا»، وجوابه: «كل واحد ونفسه»): منهج المزوّدين
   (OWNER_METHOD — يصل كلّ مزوّد عند المالك، provider-level ١٠) صار يحمل ما ينقصه من CLAUDE.md: قواعد CI التي تُفشل الرفعة، وثابت أسماء
   المزوّدين في الواجهة. كلّ قاعدة هنا لها فاحص حقيقيّ في المستودع — فلا تبقى تعليمة بلا مقابل. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const PL = require('../api/_lib/provider-level.js');

test('١. المنهج يحمل قواعد CI الخمس وما يفعله حين يفشل CI، وثابت الأسماء — بلا تفويض', () => {
  const m = PL.OWNER_METHOD;
  const r8 = m.split('\n').find((l) => l.startsWith('٨) قبل الرفع، ما يُفشل CI'));
  assert.ok(r8, 'البند ٨');
  for (const k of ['لا catch فارغ', '__swallow(e, "سبب")', 'لا سرّ ولا مفتاح في ملفّات العميل', 'siteUrl() من api/_lib/_site.js', 'غلّف بـIIFE', 'اقرأ الأسرار داخل المعالج', 'manage_github run_jobs', 'قبل أيّ «أدمج»']) assert.ok(r8.includes(k), k);
  assert.ok(m.split('\n').some((l) => l.startsWith('٩) لا اسم مزوّد ولا نموذج')), 'البند ٩');
  assert.ok(!/delegate_code_task/.test(m), '«كل واحد ونفسه»: لا تفويض');
  assert.ok(m.length < 3200, 'سقف الحجم في provider-level وgrok-first: ' + m.length);
});

test('٢. لكلّ قاعدة فاحص حقيقيّ: الحارس (catch · السرّ · SITE_URL · تصادم الأسماء) والإقلاع البارد واختبار الأسماء', () => {
  const g = read('scripts/guard.mjs');
  for (const k of ['catch', 'SITE_URL', '__swallow']) assert.ok(g.includes(k), 'guard: ' + k);
  assert.ok(fs.existsSync(path.join(root, 'scripts/cold-start.mjs')), 'الإقلاع البارد: api/*.js بلا متغيّرات');
  assert.ok(fs.existsSync(path.join(root, 'tests/no-provider-names.test.cjs')), 'لا اسم مزوّد في الواجهة');
  assert.match(JSON.parse(read('package.json')).scripts.ci, /guard/);
});
