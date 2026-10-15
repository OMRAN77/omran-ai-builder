'use strict';
/* v-branch-test (المالك ١٥ أكتوبر «أوصلهم لمستوى كودي»): Claude Code يشغّل اختبارًا واحدًا في ثوانٍ ويرى فشله بعينه؛ المزوّدون
   كان عندهم الفحص الكامل وحده (action=ci، ثلاث دقائق) فيتوقّفون عن التجريب. الآن جهاز GitHub (branch-test.yml) يشغّل ملفّ اختبار
   واحدًا على فرعهم في نحو دقيقة ويرجع أخضر أو سطور الفشل نفسها (manage_github action=test file=tests/x.test.cjs).
   كـbranch-shots: المدخل الوحيد (مسار ملفّ الاختبار) يمرّ بهذا الفاحص في الخادم وفي سكربت الجهاز نفسه، ويُمرَّر بيئةً لا نصّ صدفة،
   والسكربت لا يشغّل إلّا ملفًّا مسجّلًا في package.json (قائمة سماح من المستودع نفسه). دوالّ نقيّة بلا شبكة. */

const WORKFLOW = 'branch-test.yml';
// tests/<اسم>.test.cjs: حرف (لاتينيّ أو عربيّ — tests/خلفيات.test.cjs مسجّل) أو رقم أوّلًا ثمّ حروف/أرقام/._- فقط؛ لا / ولا مسافة ولا ..؛ ≤ ٨٠
const FILE_RE = /^tests\/(?!.*\.\.)[\p{L}\p{N}][\p{L}\p{N}._-]{0,80}\.test\.cjs$/u;

/** المدخل: ملفّ اختبار واحد. غير الصالح يُرفض بسببه (لا يُصحَّح بصمت). */
function fileOf(i) {
  const f = String((i && i.file) || '').trim();
  if (!FILE_RE.test(f)) return { error: 'file يقبل ملفّ اختبار واحد فقط بصيغة tests/x.test.cjs (حروف وأرقام و._-، بلا مسافات ولا مجلّدات فرعيّة).' };
  return { file: f };
}
function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
/** عنوان التشغيل كما يكتبه run-name في الورك فلو — به يُعرف تشغيل هذا الفرع وهذا الملفّ. */
function titleOf(ref, file) { return norm('test ' + ref + ' ' + file); }

module.exports = { WORKFLOW, FILE_RE, fileOf, titleOf, norm };
