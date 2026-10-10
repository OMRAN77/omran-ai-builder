// api/_lib/github-edit.js — v-agent-surgical: تعديل جراحيّ ودمج بأمر المالك.
//
// طلب المالك ١٠ أكتوبر: «أريد الوكيل وكلاود يكون نفسك» — بعد جلسة عدّل فيها مساعدٌ سهم القائمة بسطور معدودة
// في ملفّ كبير، ورفع إلى فرع، وفتح طلب سحب، ودمجه حين قال «ادمج». الوكيل كان يقدر يرفع فقط بإعادة كتابة الملفّ
// كاملًا (write_github): ملفّ مثل index.html (١٢٦ ألف حرف) يُعاد توليده حرفًا حرفًا — مكلف، وأيّ زلّة تكسره.
//   ① edit_github: يقرأ الملفّ الحاليّ من GitHub، ويبدّل نصًّا محدّدًا بنصّ جديد (يجب أن يطابق مرّة واحدة بالضبط،
//      أو كلّ المطابقات بـall)، ثمّ يرفع عبر pushFiles نفسه — فرع جديد والتزام واحد وطلب سحب، لا دفع إلى الرئيسيّ.
//   ② merge_github: يدمج طلب سحب — للمالك وحده، وفقط إن كانت آخر رسالة منه فيها «ادمج» (agent.js يفحصها، لا النموذج).
'use strict';

const { ghFetch, parseTarget, resolveGithubToken } = require('./github-read.js');
const githubWrite = require('./github-write.js');

const EDIT_LIMITS = { edits: 30, files: 10, oldMax: 20000, newMax: 60000 };

async function ghJson(pathname, o) {
  const r = await ghFetch(pathname, o);
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { r, j };
}
function encPath(p) { return String(p).split('/').map(encodeURIComponent).join('/'); }
function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; } return n; }

/* يقرأ نصّ ملفّ من فرع (إن وُجد) وإلّا من الأساس. */
async function readText(R, path, ref, o) {
  const { r, j } = await ghJson(R + '/contents/' + encPath(path) + '?ref=' + encodeURIComponent(ref), o);
  if (!r.ok || !j || typeof j.content !== 'string') return { error: r.status === 404 ? 'الملفّ غير موجود: ' + path + ' (على ' + ref + ')' : 'تعذّرت قراءة ' + path + ' (GitHub HTTP ' + r.status + ')' };
  if (j.encoding && j.encoding !== 'base64') return { error: 'ترميز غير مدعوم لـ' + path };
  return { text: Buffer.from(j.content.replace(/\n/g, ''), 'base64').toString('utf8') };
}

/* يطبّق التعديلات على نصوص الملفّات — صرف، بلا شبكة (يُختبر وحده). */
function applyEdits(texts, edits) {
  const out = Object.assign({}, texts);
  for (let k = 0; k < edits.length; k++) {
    const e = edits[k];
    const cur = out[e.path];
    const n = countOf(cur, e.old);
    if (n === 0) return { error: 'التعديل ' + (k + 1) + ' (' + e.path + '): النصّ القديم غير موجود حرفيًّا — اقرأ الملفّ بـread_github وانسخ المقطع كما هو بمسافاته.' };
    if (n > 1 && !e.all) return { error: 'التعديل ' + (k + 1) + ' (' + e.path + '): النصّ القديم يطابق ' + n + ' مواضع — وسّعه بسطر قبله أو بعده ليصير فريدًا، أو أرسل all:true لتبديلها كلّها.' };
    out[e.path] = e.all ? cur.split(e.old).join(e.new) : cur.replace(e.old, () => e.new);
  }
  return { texts: out };
}

function validateEdits(input) {
  const i = input && typeof input === 'object' ? input : {};
  const edits = Array.isArray(i.edits) ? i.edits : [];
  if (!edits.length) return { error: 'لا تعديلات: أعطِ edits [{path, old, new}].' };
  if (edits.length > EDIT_LIMITS.edits) return { error: 'الحدّ ' + EDIT_LIMITS.edits + ' تعديلًا في الرفعة الواحدة.' };
  const out = [];
  for (const e of edits) {
    if (!e || typeof e !== 'object' || !githubWrite.validPath(e.path)) return { error: 'مسار غير صالح: ' + String(e && e.path).slice(0, 80) };
    if (typeof e.old !== 'string' || !e.old) return { error: 'old في ' + e.path + ' يجب أن يكون نصًّا غير فارغ.' };
    if (typeof e.new !== 'string') return { error: 'new في ' + e.path + ' يجب أن يكون نصًّا (فارغًا للحذف).' };
    if (e.old === e.new) return { error: 'old وnew متطابقان في ' + e.path + ' — لا تغيير.' };
    if (e.old.length > EDIT_LIMITS.oldMax || e.new.length > EDIT_LIMITS.newMax) return { error: 'تعديل ' + e.path + ' أطول من الحدّ — قسّمه.' };
    out.push({ path: String(e.path), old: e.old, new: e.new, all: e.all === true });
  }
  if (new Set(out.map((e) => e.path)).size > EDIT_LIMITS.files) return { error: 'الحدّ ' + EDIT_LIMITS.files + ' ملفّات في الرفعة الواحدة.' };
  return { edits: out };
}

async function editFiles(input, opts) {
  const o = opts || {};
  if (!(await resolveGithubToken(o))) return { error: 'لا مفتاح GitHub — احفظه في خزنة الأسرار أو GITHUB_TOKEN؛ التعديل يحتاج صلاحيّة كتابة المحتوى وطلبات السحب.' };
  const i = input && typeof input === 'object' ? input : {};
  const t = parseTarget({ url: i.repo || i.url || '' });
  if (!t) return { error: 'حدّد المستودع بصيغة owner/repo أو برابطه.' };
  const v = validateEdits(i);
  if (v.error) return v;
  const R = '/repos/' + t.owner + '/' + t.repo;
  const { r: rr, j: repo } = await ghJson(R, o);
  if (!rr.ok) return { error: 'تعذّر الوصول إلى ' + t.owner + '/' + t.repo + ' (GitHub HTTP ' + rr.status + ')' };
  const base = String(i.base || (repo && repo.default_branch) || 'main');
  // اقرأ من الفرع إن كان قائمًا (تعديل ثانٍ على الفرع نفسه)، وإلّا من الأساس.
  let ref = base;
  if (i.branch) { const { r: br } = await ghJson(R + '/git/ref/heads/' + String(i.branch), o); if (br.ok) ref = String(i.branch); }
  const texts = {};
  for (const p of new Set(v.edits.map((e) => e.path))) {
    const got = await readText(R, p, ref, o);
    if (got.error) return got;
    texts[p] = got.text;
  }
  const applied = applyEdits(texts, v.edits);
  if (applied.error) return applied;
  const files = Object.keys(applied.texts).map((p) => ({ path: p, content: applied.texts[p] }));
  const res = await githubWrite.pushFiles({ repo: t.owner + '/' + t.repo, files, message: i.message, title: i.title, body: i.body, branch: i.branch, base }, o);
  if (res && res.ok) res.edits = v.edits.length;
  return res;
}

/* «ادمج» في آخر رسالة من المالك — الإذن الوحيد للدمج. نفي صريح («لا تدمج») يُسقطه. */
function ownerSaidMerge(text) {
  const s = String(text || '');
  if (/(?:^|[\s،.,!؟?])(?:لا|ما|مو|بدون)\s*(?:ت|ن|ا|أ|إ)?دمج|don'?t\s+merge|do\s+not\s+merge/i.test(s)) return false;
  return /ادمج|إدمج|ادمجه|ادمجها|\bmerge\b/i.test(s);
}

async function mergePr(input, opts) {
  const o = opts || {};
  if (!(await resolveGithubToken(o))) return { error: 'لا مفتاح GitHub للدمج.' };
  const i = input && typeof input === 'object' ? input : {};
  const t = parseTarget({ url: i.repo || i.url || '' });
  if (!t) return { error: 'حدّد المستودع بصيغة owner/repo أو برابطه.' };
  const n = Number(i.number);
  if (!Number.isInteger(n) || n <= 0) return { error: 'رقم طلب السحب غير صالح.' };
  const R = '/repos/' + t.owner + '/' + t.repo;
  const { r: pr, j: pj } = await ghJson(R + '/pulls/' + n, o);
  if (!pr.ok || !pj) return { error: 'طلب السحب #' + n + ' غير موجود (GitHub HTTP ' + pr.status + ').' };
  if (pj.merged) return { ok: true, already: true, number: n, url: pj.html_url };
  if (pj.state !== 'open') return { error: 'طلب السحب #' + n + ' مغلق.' };
  if (pj.mergeable === false) return { error: 'طلب السحب #' + n + ' فيه تعارض مع الفرع الرئيسيّ — يحتاج حلّ التعارض قبل الدمج.' };
  const method = ['merge', 'squash', 'rebase'].includes(i.method) ? i.method : 'squash';
  const { r: mr, j: mj } = await ghJson(R + '/pulls/' + n + '/merge', Object.assign({}, o, { method: 'PUT', body: { merge_method: method, sha: pj.head && pj.head.sha } }));
  if (!mr.ok || !mj || !mj.merged) return { error: 'GitHub رفض الدمج (HTTP ' + mr.status + ')' + (mj && mj.message ? ': ' + String(mj.message).slice(0, 160) : '') };
  return { ok: true, number: n, url: pj.html_url, sha: mj.sha, base: pj.base && pj.base.ref };
}

function formatMerge(res) {
  if (!res || res.error) return '✗ لم يُدمج: ' + ((res && res.error) || 'سبب غير معروف');
  if (res.already) return '✅ طلب السحب #' + res.number + ' مدموج من قبل: ' + res.url;
  return '✅ دُمج طلب السحب #' + res.number + ' في ' + (res.base || 'main') + ' (' + String(res.sha || '').slice(0, 7) + '): ' + res.url + '\nالنشر التلقائيّ يبدأ من الفرع الرئيسيّ؛ قل للمالك إنّك لم تتحقّق من الموقع المنشور بنفسك.';
}

const EDIT_TOOL = {
  name: 'edit_github',
  description: 'عدّل ملفّات موجودة في مستودع المالك جراحيًّا: لكلّ تعديل نصّ قديم يُنسخ حرفيًّا من الملفّ (بمسافاته) ونصّ جديد يحلّ محلّه. يقرأ الأداة الملفّ الحاليّ بنفسها، فلا تعِد كتابة الملفّ كاملًا — هذه الطريقة المفضّلة لأيّ تعديل على ملفّ قائم (write_github للملفّات الجديدة فقط). القديم يجب أن يطابق مرّة واحدة (أو all:true). النتيجة: فرع جديد omran-agent/… والتزام واحد وطلب سحب، لا دفع إلى الرئيسيّ. اقرأ الملفّ بـread_github أوّلًا. أعد الاستدعاء بنفس branch لإضافة التزام على الفرع نفسه.',
  input_schema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'owner/repo أو رابطه' },
      edits: { type: 'array', description: 'التعديلات بالترتيب', items: { type: 'object', properties: {
        path: { type: 'string', description: 'مسار الملفّ مثل css/x.css' },
        old: { type: 'string', description: 'المقطع الحاليّ حرفيًّا (فريد في الملفّ)' },
        new: { type: 'string', description: 'المقطع الجديد (فارغ = حذف)' },
        all: { type: 'boolean', description: 'بدّل كلّ المطابقات (اختياريّ)' },
      }, required: ['path', 'old', 'new'] } },
      message: { type: 'string', description: 'رسالة الالتزام بالعربيّة: ما تغيّر ولماذا' },
      title: { type: 'string', description: 'عنوان طلب السحب (اختياريّ)' },
      body: { type: 'string', description: 'وصف طلب السحب (اختياريّ)' },
      branch: { type: 'string', description: 'فرع رفعتَ إليه سابقًا في هذا الحوار لإضافة التزام (اختياريّ)' },
      base: { type: 'string', description: 'الفرع الأساس (اختياريّ)' },
    },
    required: ['repo', 'edits', 'message'],
  },
};

const MERGE_TOOL = {
  name: 'merge_github',
  description: 'ادمج طلب سحب في مستودع المالك (والنشر التلقائيّ يتبعه). لا تستدعها إلّا إذا كتب المالك في رسالته الأخيرة «ادمج» صراحةً — وإلّا تُرفض. يرفض الطلب المغلق أو المتعارض.',
  input_schema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'owner/repo أو رابطه' },
      number: { type: 'integer', description: 'رقم طلب السحب' },
      method: { type: 'string', enum: ['squash', 'merge', 'rebase'], description: 'طريقة الدمج (الافتراضيّ squash)' },
    },
    required: ['repo', 'number'],
  },
};

/* طريقة العمل على كود المالك — نظام الوكيل (agent.js) والمحادثة (chat.js) معًا، للمالك وحده. */
const WORK_NOTE = '\n\n[طريقة العمل على كود المالك]:\n' +
  '- لقطة شاشة أو وصف لعنصر في الواجهة: حدّد العنصر في الكود فعلًا (read_github بـquery عن نصّه أو معرّفه ثمّ قراءة القواعد التي تلوّنه وتضعه في كلّ وضع وثيم) قبل أن تقترح أيّ حلّ. لا تطلب من المالك رابط المستودع — هو OMRAN77/omran-ai-builder.\n' +
  '- عدّل الملفّات القائمة بـedit_github (مقطع قديم حرفيّ ← جديد)، لا بإعادة كتابة الملفّ كاملًا؛ write_github للملفّات الجديدة. أصغر تغيير يحلّ الجذر، مع تعليق قصير بالعربيّة يذكر طلب المالك وتاريخه كما في بقيّة الكود.\n' +
  '- فكّر في كلّ الحالات قبل الرفع: الأسود والعاجيّ والخلفيّات وكلّ الثيمات (html.skin و skin-wood)، وسطح المكتب دون الجوّال إلّا بطلب. إن تغيّر ملفّ يُحمَّل بوسم ?v= فارفع الرقم في index.html.\n' +
  '- أعطِ المالك معاينة صادقة لما سيراه إن أمكن (test_html بنموذج مصغّر بالألوان الحقيقيّة) وقل إنّها معاينة لا التطبيق نفسه.\n' +
  '- إن رفض المالك شكلًا («بدون دائرة») فأزله تمامًا وابحث عن طريق آخر يحقّق الهدف نفسه. وإن قال «لا تدمج» فالعمل على فرع وطلب سحب فقط.\n' +
  '- الدمج بـmerge_github فقط حين يكتب «ادمج». بعد الدمج: قل إنّ النشر تلقائيّ وإنّك لم تتحقّق من الموقع بنفسك، واقترح تحديثًا قويًّا.\n' +
  '- لا تكرار: لا تعِد في ردّك ما قلته في ردودك السابقة (أين هو المالك، شرح الشاشة، تحذير سبق مثل «لا تدمج #…»). كلّ ردّ يبدأ بالجديد فقط، والمالك يرى ما فوقه.\n' +
  '- لا تقسّم العمل عليه خطوة خطوة («ابحث في السجلّ وأرسل لقطة»): ما يمكن قراءته اقرأه بنفسك (read_github للكود والاختبارات، read_app_errors، check_code_task لسجلّ المهمّة)، وأصلح كلّ الأعطال المعروفة معًا في تشغيل واحد وطلب سحب واحد. اسأله فقط عمّا لا تصل إليه أدواتك، سؤالًا واحدًا.\n' +
  '- لا تخترع ولا تربط بلا دليل: كلّ ملفّ أو سطر أو دالّة أو متغيّر تذكره يجب أن تكون قرأته بأداة في هذا الحوار (لا user.role ولا is_admin من الخيال). لا تربط مشكلتين إلّا إن أراك الكود الصلة. وإن لم تعرف مصدر نصّ ملصوق أو لم تصلك لقطة فقل ذلك صراحةً بدل الافتراض.\n' +
  '- الحالة تُفحص لا تُفترض: «مفتوح/مدموج/فشل/نجح» لطلب سحب أو مسألة أو تشغيل CI = manage_github (status · runs · run_jobs) أوّلًا. «سكّر» = manage_github close، «احذف التشغيلات الفاشلة» = delete_runs — نفّذها بنفسك ولا تعطِ المالك أوامر PowerShell ما دامت أداتك تفعلها. ولا «تمّ» قبل أن ترى نتيجة الأداة.\n' +
  '- الصور: لا generate_image في طلب عن الكود أو GitHub أو الإعدادات — فقط إن طلب صورة صراحةً.\n' +
  '- مهمّة كبيرة (ملفّات كثيرة، أو تحتاج npm run ci أو متصفّحًا أو أكثر من مهلتك): فوّضها بـdelegate_code_task — Claude Code الأصليّ في GitHub Actions يقرأ المستودع كلّه ويشغّل الاختبارات — ثمّ تابعها بـcheck_code_task وأعطِ المالك رابط طلب السحب.\n' +
  '- التقرير: النتيجة أوّلًا في سطر، ثمّ الروابط (الالتزام/طلب السحب)، وما لم تتحقّق منه بصراحة. بلا مقدّمات.';

module.exports = { WORK_NOTE, editFiles, applyEdits, validateEdits, mergePr, formatMerge, ownerSaidMerge, EDIT_TOOL, MERGE_TOOL, EDIT_LIMITS };
