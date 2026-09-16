'use strict';
/* v-agent-selfread (أمر عمران «كودي الي عندي ماعنده صلاحيّة — ليش يطلب مني ألصق الكود»):
   معرفة المالك تُحقن للمالك وحده، وتوجّه الوكيل أن يقرأ كود التطبيق بنفسه (read_github)
   ويسلّم التنفيذ لكودي (delegate_code_task) بدل أن يطلب من عمران لصق الكود، وأنّ Vercel
   مربوط بـGitHub الآن (نشر تلقائيّ) لا خطوتين منفصلتين. */
process.env.AUTH_SECRET = 'synthetic-test-secret-' + 'x'.repeat(40);
process.env.OWNER_USERNAME = 'omran';
const assert = require('node:assert');
const { ownerKnowledge } = require('../api/_lib/_knowledge.js');
const { makeToken } = require('../api/_lib/auth.js');

// ١) البوّابة: المالك يأخذ المعرفة، غيره نصّ فارغ
const forOwner = ownerKnowledge({ query: {}, body: {} }, makeToken('omran'));
const forGuest = ownerKnowledge({ query: {}, body: {} }, makeToken('guest'));
const forNone = ownerKnowledge({ query: {}, body: {} }, '');
assert.ok(forOwner.length > 500, 'المالك يأخذ المعرفة');
assert.strictEqual(forGuest, '', 'الضيف لا يأخذ شيئًا');
assert.strictEqual(forNone, '', 'بلا رمز لا شيء');

// ٢) المستودع معروف للوكيل ليقرأه بنفسه
assert.ok(forOwner.includes('OMRAN77/omran-ai-builder'), 'يعرف اسم المستودع');

// ٣) صلاحية القراءة الذاتيّة والتفويض بدل طلب اللصق
assert.ok(/لا تطلب منه أبدًا أن يلصق/.test(forOwner), 'ممنوع يطلب من عمران لصق الكود');
assert.ok(forOwner.includes('read_github'), 'يقرأ الملفّ بنفسه بـread_github');
assert.ok(forOwner.includes('delegate_code_task'), 'يسلّم التنفيذ لكودي');

// ٤) الحقيقة المصحّحة: Vercel مربوط بـGitHub (نشر تلقائيّ) — لا الجملة القديمة
assert.ok(/Vercel مربوط بـGitHub/.test(forOwner), 'Vercel مربوط بـGitHub الآن');
assert.ok(!/خطوتان منفصلتان/.test(forOwner), 'حُذفت جملة «خطوتان منفصلتان» القديمة');
assert.ok(!/لا ربط تلقائيّ/.test(forOwner), 'حُذفت جملة «لا ربط تلقائيّ» القديمة');

console.log('✓ owner-knowledge: الوكيل يقرأ كود التطبيق بنفسه ويسلّم لكودي، لا يطلب لصق الكود، وVercel مربوط بـGitHub');
