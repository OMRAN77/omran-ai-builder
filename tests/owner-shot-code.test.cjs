// tests/owner-shot-code.test.cjs — v-owner-shot-code: لقطة التطبيق + «احذف هذا المكان» من المالك = تعديل في الكود لا تعديل صورة.
// المالك ١٠ أكتوبر («نعم انه كان يبني صوره»): ملاحظة الصورة المرفقة كانت تأمر بـedit_image فورًا لأيّ تغيير، وقواعد
// عمل المالك تمنع generate_image وحده — فبدأ النموذج يرسم صورة بدل أن يحدّد العنصر في الكود ويعدّله.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const chat = read('api/_lib/chat.js');
const GE = require(path.join(root, 'api/_lib/github-edit.js'));

/* يستخرج تعبير IMAGE_TURN_NOTE كما هو في المصدر ويقيّمه بقيم المدخلات الثلاث. */
function noteFor({ hasImage, ownerKnowledge, ownerReq }) {
  const i = chat.indexOf('const IMAGE_TURN_NOTE = lastUserHasImage');
  assert.ok(i > 0, 'الملاحظة موجودة');
  const j = chat.indexOf("\n      : '';\n", i);
  assert.ok(j > i, 'نهاية التعبير');
  const expr = chat.slice(i + 'const IMAGE_TURN_NOTE = '.length, j + "\n      : ''".length);
  // eslint-disable-next-line no-new-func
  return new Function('lastUserHasImage', 'ownerKnowledge', '__ownerReq', 'return (' + expr + ');')(hasImage, ownerKnowledge, ownerReq);
}

test('owner tool turn with an attached image: app screenshot + request = code edit, image tools forbidden unless asked for explicitly', () => {
  const n = noteFor({ hasImage: true, ownerKnowledge: 'خريطة', ownerReq: true });
  assert.match(n, /المالك/);
  assert.match(n, /read_github/);
  assert.match(n, /edit_github/);
  assert.match(n, /ممنوع edit_image وممنوع generate_image/);
  assert.match(n, /فقط إن طلب المالك صراحةً تعديل الصورة نفسها/, 'تعديل الصورة يبقى ممكنًا بطلب صريح');
  assert.doesNotMatch(n, /استدعِ edit_image فورًا/, 'أمر «فورًا» لا يصل المالك');
  assert.doesNotMatch(n, /لا تسأل قبل التنفيذ/);
});

test('regular user and non-tool owner turns keep the old note verbatim; no image = no note', () => {
  const user = noteFor({ hasImage: true, ownerKnowledge: '', ownerReq: false });
  assert.equal(user, '\n[صورة مرفقة في هذا الدور]: أي طلب تغيير أو تحسين أو ترقية أو «نسخة أقوى/أفخم» أو أسلوب جديد على هذه الصورة = استدعِ edit_image فورًا بتعليمة إنجليزية دقيقة — لا generate_image (edit_image يبني على صورته مصدرًا، وgenerate_image يرسم من الوصف وحده صورة بلا علاقة). لا تسأل قبل التنفيذ؛ ضع رمز الصورة العائد وحده في سطر ثم جملة قصيرة واحدة.');
  assert.equal(noteFor({ hasImage: true, ownerKnowledge: '', ownerReq: true }), user, 'المالك بلا دور أدوات = ملاحظة المستخدم (كما كان)');
  assert.equal(noteFor({ hasImage: false, ownerKnowledge: 'خريطة', ownerReq: true }), '');
  // الملاحظة ما زالت تُحقن قبل قواعد المالك وفي الفرع بلا أدوات كما كانت
  assert.match(chat, /ownerKnowledge \+ SEARCH_RULE_NOTE \+ IMAGE_TURN_NOTE/);
  assert.match(chat, /\(ownerKnowledge && __ownerReq \? require\('\.\/github-edit\.js'\)\.WORK_NOTE : ''\)/);
});

test('shared owner work rules (chat + agent) forbid edit_image too and name the app-screenshot case', () => {
  const line = GE.WORK_NOTE.split('\n').filter((l) => /^- الصور:/.test(l))[0];
  assert.ok(line, 'سطر الصور موجود');
  assert.match(line, /لا generate_image ولا edit_image/);
  assert.match(line, /لقطة من التطبيق/);
  assert.match(line, /edit_github/);
  assert.match(read('api/_lib/agent.js'), /const OWNER_ENGINEERING_NOTE = githubEdit\.WORK_NOTE;/, 'الوكيل يأخذ السطر نفسه');
});
