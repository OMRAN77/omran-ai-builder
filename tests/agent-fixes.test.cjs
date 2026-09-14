'use strict';
/* أمر عمران ١٣ سبتمبر — أربعة إصلاحات على الوكيل:
   ① النموذج الذي يعمل فعلًا يُبثّ للمالك في أوّل خطوة (لا رجوع صامت).
   ② الافتراضيّ Opus 5، ورفض النموذج (stop_reason=refusal) يخرج رسالة واضحة لا ردًّا فارغًا.
   ③ لا اسم مزوّد في حالات الوكيل التي يراها كل مستخدم ولا في تعليماته عن التطبيق.
   ④ مفتاح GitHub (البيئة أو الخزنة) للمالك وحده — غيره يقرأ العامّ بلا مفتاح. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const agent = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'agent.js'), 'utf8');

// ② الافتراضيّ
assert.ok(agent.includes("const AGENT_DEFAULT = 'claude-opus-5';"), 'الافتراضيّ Opus 5');
assert.ok(agent.includes("ids.find((id) => /^claude-opus-5$/.test(id)) ||"), 'الرجوع عند 404 يفضّل Opus 5');
assert.ok(!/'claude-sonnet-5'\s*;\s*\n\s*let steps/.test(agent), 'لا افتراضيّ Sonnet قديم');
// ① الإعلان عن النموذج للمالك
assert.ok(agent.includes("if (upstream.ok && !modelAnnounced && isOwner(runUser)) {"), 'يُعلن مرّة واحدة وللمالك وحده');
assert.ok(agent.includes("'🎛️ النموذج: ' + modelLabel(model)"), 'الاسم الودّيّ للنموذج الفعليّ');
assert.ok(agent.includes("غير متاح على مفتاحك"), 'يذكر أنّ المختار غير متاح عند الرجوع');
// ② الرفض
assert.ok(agent.includes("if (stopReason === 'refusal') {"), 'فرع الرفض موجود');
assert.ok(agent.includes("رفض المحرّك هذا الطلب بضوابط الأمان"), 'رسالة الرفض واضحة');
assert.ok(agent.includes("run.status = 'refused';"), 'الدفتر يسجّل الرفض');
// ③ لا أسماء مزوّدين في الحالات العامّة
const publicStatuses = agent.split('\n').filter((l) => /send\(\{ (status|error):/.test(l) && !/delegate_code_task|check_code_task/.test(l));
for (const l of publicStatuses) assert.ok(!/Claude|DeepSeek|Mistral|Groq|Anthropic|Gemini|OpenAI/.test(l), 'حالة عامّة بلا اسم مزوّد: ' + l.trim().slice(0, 100));
assert.ok(agent.includes("تسعة محرّكات ذكاء اصطناعي تعمل كلّها بمفاتيح الخادم"), 'تعليمات التطبيق بلا أسماء');
assert.ok(!agent.includes("المزودون التسعة (كلهم يعملون بمفاتيح السيرفر"), 'السطر القديم بالأسماء حُذف');
// ④ مفتاح GitHub للمالك وحده
assert.ok(agent.includes("readGithub(input, isOwner(runUser) ? undefined : { anonymous: true })"), 'غير المالك يقرأ بلا مفتاح');
const GH = require('../api/_lib/github-read.js');
(async () => {
  assert.strictEqual(await GH.resolveGithubToken({ anonymous: true, env: { GITHUB_TOKEN: 'tok' } }), '', 'anonymous يتجاهل مفتاح البيئة');
  assert.strictEqual(await GH.resolveGithubToken({ env: { GITHUB_TOKEN: 'tok' } }), 'tok', 'المالك يأخذ مفتاح البيئة');
  // رسائل الخطأ لغير المالك لا تُرشد إلى خزنة لا يملكها
  const gr = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'github-read.js'), 'utf8');
  assert.ok(gr.includes("function ghError(r, what, env, anon) {") && gr.includes("(المستودعات الخاصّة غير متاحة هنا)"), 'رسالة 404 لغير المالك');
  assert.ok((gr.match(/o && o\.env, o && o\.anonymous\)/g) || []).length >= 6, 'كل نداءات ghError في مسار القراءة تمرّر anonymous');
  // v-models-two: منتقي موديل الوكيل انتقل من الإعدادات إلى قائمة «+» (modes.js)
  const prem = fs.readFileSync(path.join(__dirname, '..', 'js', 'premium.js'), 'utf8');
  assert.ok(!prem.includes("'تلقائي (Opus 5)'"), 'منتقي الإعدادات القديم حُذف من premium.js');
  const modes = fs.readFileSync(path.join(__dirname, '..', 'js', 'modes.js'), 'utf8');
  // v-model-chip: اختيار النموذج مؤشّر أسفل الصندوق لا بند في «+».
  assert.ok(modes.includes("chip.id = 'omModelChip'"), 'مؤشّر النموذج أسفل الصندوق');
  assert.ok(modes.includes("'Opus 5'") && modes.includes("'Sonnet 5'"), 'المؤشّر يعرض Opus 5 / Sonnet 5');
  console.log('✓ agent-fixes: Opus 5 افتراضيًّا ومُعلَنًا، الرفض واضح، بلا أسماء مزوّدين، ومفتاح GitHub للمالك وحده');
})().catch((e) => { console.error(e); process.exit(1); });
