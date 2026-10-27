// api/_lib/github-edit.js — v-agent-surgical: تعديل جراحيّ ودمج بأمر المالك.
//
// طلب المالك ١٠ أكتوبر: «أريد الوكيل وكلاود يكون نفسك» — بعد جلسة عدّل فيها مساعدٌ سهم القائمة بسطور معدودة
// في ملفّ كبير، ورفع إلى فرع، وفتح طلب سحب، ودمجه حين قال «ادمج». الوكيل كان يقدر يرفع فقط بإعادة كتابة الملفّ
// كاملًا (write_github): ملفّ مثل index.html (١٢٦ ألف حرف) يُعاد توليده حرفًا حرفًا — مكلف، وأيّ زلّة تكسره.
//   ① edit_github: يقرأ الملفّ الحاليّ من GitHub، ويبدّل نصًّا محدّدًا بنصّ جديد (يجب أن يطابق مرّة واحدة بالضبط،
//      أو كلّ المطابقات بـall)، ثمّ يرفع عبر pushFiles نفسه — فرع جديد والتزام واحد وطلب سحب، لا دفع إلى الرئيسيّ.
//   ② merge_github: يدمج طلب سحب — للمالك وحده، وفقط إن كانت آخر رسالة منه فيها «ادمج» (agent.js يفحصها، لا النموذج).
'use strict';

const vm = require('vm');
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
  const url = R + '/contents/' + encPath(path) + '?ref=' + encodeURIComponent(ref);
  const { r, j } = await ghJson(url, o);
  /* v-claude-code-level (F2): فوق ١ م.ب تردّ واجهة contents بـencoding:"none" ومحتوى فارغ (DECISIONS.md
     ١٫٥ م.ب صار «ترميز غير مدعوم» فلا يُعدَّل) — نعيد الطلب بالنوع الخامّ كما يفعل getContents في القارئ. */
  if (r.ok && j && (j.type === 'file' || j.type === undefined) && (j.encoding === 'none' || (!j.content && Number(j.size) > 0))) { // وصلة رمزيّة لا تُستبدل بنصّ هدفها
    const rr = await ghFetch(url, Object.assign({}, o, { raw: true }));
    if (!rr.ok) return { error: 'تعذّرت قراءة ' + path + ' (GitHub HTTP ' + rr.status + ')' };
    return { text: await rr.text() };
  }
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

/* v-claude-code-level (A3): فحص صياغة قبل الرفع — تبديل مقطع واحد ناقص قوس كان يُرفع ويكسر الفرع وCI.
   .js/.cjs تُترجَم بـvm.Script (ترجمة بلا تشغيل)، و.json بـJSON.parse؛ .mjs ووحدات ESM (import/export
   في رأس سطر) لا تُفحص هنا. يُرفض التعديل فقط إن كسر ملفًّا كان سليمًا — ملفّ مكسور أصلًا لا يُسدّ عليه. */
const ESM_RE = /^[ \t]*(?:import[\s{*'"]|export[\s{*])/m;
function syntaxError(path, text) {
  const p = String(path).toLowerCase();
  const isJson = /\.json$/.test(p);
  if (!isJson && (!/\.c?js$/.test(p) || ESM_RE.test(text))) return null;
  try {
    if (isJson) JSON.parse(text);
    else {
      try { new vm.Script(text, { filename: path }); } catch (e) {
        // return في نطاق الوحدة مشروع في CommonJS (كما يقبله node --check في npm run check) — نترجمه بغلاف الوحدة
        if (!/Illegal return/.test(String(e && e.message))) throw e;
        vm.compileFunction(text, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: path });
      }
    }
    return null;
  } catch (e) {
    const msg = String((e && e.message) || e);
    // صياغة وحدات (import.meta، await في الرأس) في .js بلا import/export في رأس سطر: ESM لا كسر — لا نرفض زورًا
    if (!isJson && /outside a module|top level bodies of modules/.test(msg)) return null;
    let line = 0, m;
    if (isJson) {
      if ((m = /line (\d+)/.exec(msg))) line = Number(m[1]);
      else if ((m = /position (\d+)/.exec(msg))) line = text.slice(0, Number(m[1])).split('\n').length;
    } else if ((m = /:(\d+)\s*$/.exec(String((e && e.stack) || '').split('\n')[0]))) line = Number(m[1]);
    return { line, msg: msg.slice(0, 160) };
  }
}
function checkSyntax(before, after) {
  for (const p of Object.keys(after)) {
    if (after[p] === before[p]) continue;
    const bad = syntaxError(p, after[p]);
    if (!bad || syntaxError(p, before[p])) continue;
    const src = bad.line ? String(after[p].split('\n')[bad.line - 1] || '').trim().slice(0, 160) : '';
    return { error: 'التعديل يكسر صياغة ' + p + (bad.line ? ' عند السطر ' + bad.line : '') + ': ' + bad.msg
      + (src ? '\n' + bad.line + '| ' + src : '') + '\nاقرأ المقطع بـread_github وصحّح old/new ثمّ أعد الاستدعاء.' };
  }
  return null;
}

function validateEdits(input) {
  const i = input && typeof input === 'object' ? input : {};
  const edits = Array.isArray(i.edits) ? i.edits : [];
  /* v-agent-img: صور تُستبدل مع التعديل في الالتزام نفسه — {path, image} (رمز الرسمة __IMG_N__ أو رابط /i/)؛ يتحقّق منها write_github */
  const images = (Array.isArray(i.images) ? i.images : []).filter((x) => x && typeof x === 'object').map((x) => ({ path: String(x.path || ''), image: String(x.image || '') }));
  if (images.length > 10) return { error: 'الحدّ ١٠ صور في الرفعة الواحدة.' };
  if (!edits.length && !images.length) return { error: 'لا تعديلات: أعطِ edits [{path, old, new}] أو images [{path, image}].' };
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
  for (const im of images) if (out.some((e) => e.path === im.path)) return { error: 'المسار في التعديل والصور معًا: ' + im.path };
  return images.length ? { edits: out, images } : { edits: out };
}

async function editFiles(input, opts) {
  const o = opts || {};
  if (!(await resolveGithubToken(o))) return { error: 'لا مفتاح GitHub — احفظه في خزنة الأسرار أو GITHUB_TOKEN؛ التعديل يحتاج صلاحيّة كتابة المحتوى وطلبات السحب.' };
  const i = input && typeof input === 'object' ? input : {};
  const t = parseTarget({ url: i.repo || i.url || '' });
  if (!t) return { error: 'حدّد المستودع بصيغة owner/repo أو برابطه.' };
  const v = validateEdits(i);
  if (v.error) return Object.assign(v, { local: true }); // v-edit-refund: لم يُكتب شيء — لا يُعدّ من سقف الرفعات
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
    if (got.error) return Object.assign(got, { local: true });
    texts[p] = got.text;
  }
  const applied = applyEdits(texts, v.edits);
  if (applied.error) return Object.assign(applied, { local: true });
  const broken = checkSyntax(texts, applied.texts); // v-claude-code-level (A3)
  if (broken) return Object.assign(broken, { local: true });
  const files = Object.keys(applied.texts).map((p) => ({ path: p, content: applied.texts[p] })).concat(v.images || []); // v-agent-img
  // v-claude-code-level (F1): fromEdit = سقف الملفّ ١٫٥ مليون حرف لمسار التعديل وحده (write_github يبقى ٢٠٠ ألف)
  const res = await githubWrite.pushFiles({ repo: t.owner + '/' + t.repo, files, message: i.message, title: i.title, body: i.body, branch: i.branch, base }, Object.assign({}, o, { fromEdit: true }));
  if (res && res.ok) res.edits = v.edits.length;
  return res;
}

/* «ادمج» في آخر رسالة من المالك — الإذن الوحيد للدمج. نفي صريح («لا تدمج») يُسقطه. */
/* v-owner-like-me (المالك ١٣ أكتوبر «اريد كل المزودين نفسك»): «أدمج وأنشر» بالهمزة كانت تُرفض، و«لا مااريد ان ادمج» و«ما ابي ادمج»
   كانت تُقبل إذنًا لأنّ النفي ليس ملاصقًا للفعل. الآن الهمزات الثلاث، والنفي قبل الفعل بثلاث كلمات أو أقلّ (ومنه «مااريد/مابي» الملصوقة) يمنع. */
const MERGE_NEG_TOK = '(?:لا|ما|مو|مب|مش|بدون|بلا|ماا?(?:ريد|بي|بغى|بغي))';
const MERGE_NEG_RE = new RegExp('(?:^|[\\s،.,!؟?])' + MERGE_NEG_TOK + '(?:\\s+\\S+){0,3}?\\s*(?:ت|ن|ي)?[اأإ]?دمج|don\'?t\\s+merge|do\\s+not\\s+merge', 'i');
/* v-audit-agent (تدقيق ٢٦ أكتوبر، srv-agent-5): «متى ادمج؟» و«نشوف ادمج او لا» و«فيه merge conflict… صلحه» كانت تُقبل إذنًا بالدمج والنشر.
   «ادمج» حرفيّة وأمر صريح: «merge conflict» ليست فعلًا، والجملة التي فيها الفعل لا تكون سؤالًا (تنتهي بـ؟) ولا يسبقه فيها شرط أو تأجيل
   أو سؤال (متى، إذا، لو، نشوف، بعدين، ليش…)، ولا يتلوه «او لا». الجمل بالنقطة والسطر والاستفهام، والفاصلة داخل الجملة. */
const MERGE_VERB_RE = /[اأإ]دمج|\bmerge\b/i;
const MERGE_ASK_RE = /(?:^|[\s،,!«(])(?:و|ف)?(?:متى|متي|وقت\s+ما|إذا|اذا|لو|هل|نشوف|بنشوف|بعدين|بعد\s+ما|عقب\s+ما|لين|لما|يمكن|ليش|ليه|لماذا)(?=$|[\s،,!»)])|\b(?:when|if|whether|should|shall|maybe|later|why)\b/i;
const MERGE_OR_NOT_RE = /(?:^|\s)(?:[اأ]و|ولا)\s+(?:لا|ما)(?=$|[\s،,.!؟?])|\bor\s+not\b/i;
function ownerSaidMerge(text) {
  const s = String(text || '').replace(/\n*\[[^\[\]\n]*\]\s*$/, '').replace(/\bmerge[\s_-]*conflicts?\b/gi, ' ').replace(/لو\s+سمحت|لو\s+تكرّ?مت/g, ' ');
  if (MERGE_NEG_RE.test(s)) return false;
  const parts = s.split(/([.!؟?\n؛;]+)/);
  for (let k = 0; k < parts.length; k += 2) {
    const c = parts[k] || '', at = c.search(MERGE_VERB_RE);
    if (at === -1 || /[؟?]/.test(parts[k + 1] || '')) continue; // بلا فعل، أو سؤال
    if (MERGE_ASK_RE.test(c.slice(0, at)) || MERGE_OR_NOT_RE.test(c.slice(at))) continue; // شرط أو تأجيل قبله، أو «ادمج او لا»
    return true;
  }
  return false;
}

/* v-img-with-edit (المالك ١٣ أكتوبر «ويختبر قبل ما يدمج»): الدمج بلا فحص أخضر كان يمرّ حتى والفحوص حمراء أو ما بدأت. صرف بلا شبكة. */
function ciBlock(runs, repo) {
  const list = Array.isArray(runs) ? runs : [];
  const pending = list.filter((c) => c && String(c.status || '') !== 'completed');
  const failed = list.filter((c) => c && c.status === 'completed' && !/^(success|skipped|neutral)$/.test(String(c.conclusion || '')));
  const ok = list.filter((c) => c && c.status === 'completed' && c.conclusion === 'success');
  if (pending.length) return 'الفحوص لسه ما خلصت (' + pending.map((c) => c.name || 'فحص').join('، ') + ') — ما يندمج قبل ما تخضر.';
  if (failed.length) return 'فحص فشل: ' + failed.map((c) => (c.name || 'فحص') + ' ' + c.conclusion).join(' · ') + ' — أصلحه قبل الدمج.';
  if (/omran-ai-builder/i.test(String(repo || '')) && !ok.length) return 'ما بدأت الفحوص بعد أو ما نجح منها شي — ما يندمج قبل اختبار أخضر.';
  return '';
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
  const sha = pj.head && pj.head.sha;
  if (sha) {
    const { r: cr, j: cj } = await ghJson(R + '/commits/' + sha + '/check-runs?per_page=30', o);
    const blocked = ciBlock((cr && cr.ok && cj && cj.check_runs) || [], t.owner + '/' + t.repo);
    if (blocked) return { error: blocked };
  } else if (/omran-ai-builder/i.test(t.repo)) return { error: 'ما بدأت الفحوص بعد أو ما نجح منها شي — ما يندمج قبل اختبار أخضر.' };
  const method = ['merge', 'squash', 'rebase'].includes(i.method) ? i.method : 'squash';
  const { r: mr, j: mj } = await ghJson(R + '/pulls/' + n + '/merge', Object.assign({}, o, { method: 'PUT', body: { merge_method: method, sha: pj.head && pj.head.sha } }));
  if (!mr.ok || !mj || !mj.merged) return { error: 'GitHub رفض الدمج (HTTP ' + mr.status + ')' + (mj && mj.message ? ': ' + String(mj.message).slice(0, 160) : '') };
  return { ok: true, number: n, url: pj.html_url, sha: mj.sha, base: pj.base && pj.base.ref };
}

function formatMerge(res) {
  if (!res || res.error) return '✗ لم يُدمج: ' + ((res && res.error) || 'سبب غير معروف');
  if (res.already) return '✅ طلب السحب #' + res.number + ' مدموج من قبل: ' + res.url;
  return '✅ دُمج طلب السحب #' + res.number + ' في ' + (res.base || 'main') + ' (' + String(res.sha || '').slice(0, 7) + '): ' + res.url + '\nالنشر التلقائيّ يبدأ من الفرع الرئيسيّ — تحقّق منه الآن: manage_github action=deploy number=' + res.number + ' مع path (ملفّ تغيّر) وfind (نصّ جديد فيه)، وقل للمالك ما رأيت بالضبط؛ لا تقل «نُشر» قبل أن تراه.'; // v-owner-like-me
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
      images: { type: 'array', description: 'صور تُستبدل في الالتزام نفسه (اختياريّ): {path, image} — image رمز رسمتك __IMG_1__ أو رابطها /i/…؛ تُحوَّل لصيغة امتداد المسار', items: { type: 'object', properties: { path: { type: 'string' }, image: { type: 'string' } }, required: ['path', 'image'] } },
      branch: { type: 'string', description: 'فرع رفعتَ إليه سابقًا في هذا الحوار لإضافة التزام (اختياريّ)' },
      base: { type: 'string', description: 'الفرع الأساس (اختياريّ)' },
    },
    required: ['repo', 'edits', 'message'],
  },
};

const MERGE_TOOL = {
  name: 'merge_github',
  description: 'ادمج طلب سحب في مستودع المالك (والنشر التلقائيّ يتبعه). لا تستدعها إلّا إذا كتب المالك في رسالته الأخيرة «ادمج» صراحةً — وإلّا تُرفض. يرفض الطلب المغلق أو المتعارض، وترفض إن كانت الفحوص قيد العمل أو حمراء — لا دمج قبل اختبار أخضر.',
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
  /* v-owner-like-me (المالك ١٣ أكتوبر «كيف انته تجيني في النهاية تقولي ادمج وانشر — اريد كل المزودين نفسك»): نهاية الشغل كـClaude Code. */
  '- قبل طلب السحب: manage_github action=ci branch=فرعك حتّى أخضر (أحمر يرجع لك سطور الفشل فأصلحها) — لا طلب سحب بفحص أحمر.\n' +
  '- أثناء الشغل: manage_github action=test file=tests/x.test.cjs branch=فرعك يشغّل اختبارًا واحدًا في نحو دقيقة ويرجع نتيجته — جرّب به كلّ خطوة قبل ci الكامل، كما يشغّل Claude Code اختبارًا واحدًا بعد كلّ تعديل.\n' +
  '- نهاية كلّ شغل على الكود: بعد طلب السحب افحص فحوصه بـmanage_github status (وللتغيير المرئيّ لقطة فرعك بـaction=shots وانظر إليها)، ثمّ التقرير — ما تغيّر في سطر، كيف تحقّقت (الفحوص كما ظهرت)، ما لم تتحقّق منه، رابط الطلب — واختم بسؤال واحد فقط: «أدمج وأنشر؟». لا تسأل أدمج قبل أن تخضر الفحوص، ولا تدمج قبل أن يقولها — merge_github ترفض إن كانت قيد العمل أو حمراء.\n' +
  '- «أدمج وأنشر» أو «ادمج»: merge_github على الطلب نفسه، ثمّ manage_github action=deploy number=رقمه مع path (ملفّ تغيّر) وfind (نصّ جديد فيه) — ينتظر بنفسه حتّى دقيقة ونصف — حتّى ترى «نجح» والتغيير في الموقع المنشور، وقل ما رأيت بالضبط؛ ما زال قيد البناء = قلها وأعده في ردّك التالي ولا تقل «نُشر». و«انشر» وحدها بعد دمج = التحقّق نفسه. و«لا تدمج» أو «ما أبي أدمج» = فرع وطلب سحب فقط.\n' +
  '- لا تكرار: لا تعِد في ردّك ما قلته في ردودك السابقة (أين هو المالك، شرح الشاشة، تحذير سبق مثل «لا تدمج #…»). كلّ ردّ يبدأ بالجديد فقط، والمالك يرى ما فوقه.\n' +
  '- لا تقسّم العمل عليه خطوة خطوة («ابحث في السجلّ وأرسل لقطة»): ما يمكن قراءته اقرأه بنفسك (read_github للكود والاختبارات، read_app_errors، manage_github run_log لسطور فشل CI)، وأصلح كلّ الأعطال المعروفة معًا في تشغيل واحد وطلب سحب واحد. اسأله فقط عمّا لا تصل إليه أدواتك، سؤالًا واحدًا.\n' +
  '- لا تخترع ولا تربط بلا دليل: كلّ ملفّ أو سطر أو دالّة أو متغيّر تذكره يجب أن تكون قرأته بأداة في هذا الحوار (لا user.role ولا is_admin من الخيال). لا تربط مشكلتين إلّا إن أراك الكود الصلة. وإن لم تعرف مصدر نصّ ملصوق أو لم تصلك لقطة فقل ذلك صراحةً بدل الافتراض.\n' +
  '- الحالة تُفحص لا تُفترض: «مفتوح/مدموج/فشل/نجح» لطلب سحب أو مسألة أو تشغيل CI = manage_github (status · runs · run_jobs) أوّلًا. «سكّر» = manage_github close، «احذف التشغيلات الفاشلة» = delete_runs — نفّذها بنفسك ولا تعطِ المالك أوامر PowerShell ما دامت أداتك تفعلها. ولا «تمّ» قبل أن ترى نتيجة الأداة.\n' +
  '- الصور: لا generate_image ولا edit_image في طلب عن الكود أو GitHub أو الإعدادات؛ لقطة من التطبيق مع «احذف/غيّر/صلّح» طلبُ كود (read_github ثمّ edit_github) لا تعديل صورة — فقط إن طلب صورة أو تعديل الصورة نفسها صراحةً.\n' +
  /* v-prov-self (المالك ١١ أكتوبر «كلّ واحد ونفسه… ما أريد كلمة ما أقدر»): طلبات الصور تصل المزوّد المختار نفسه لا محرّكًا بالخفاء */
  '- أنت من يرسم ويعدّل الصور حين تُطلب: بأداتَي generate_image وedit_image بنفسك، بلا «ما أقدر» ولا تحويل لغيرك؛ واذكر في سطر المحرّك الذي نفّذها كما جاء في نتيجة الأداة (engine: …).\n' +
  '- أنت من ينفّذ مهما كبرت المهمّة: اقرأ ثمّ عدّل بـedit_github على الفرع نفسه (حتّى ثلاث رفعات في الردّ، وأكمل في الردّ التالي إن لزم) — الحزمة تُبنى تلقائيًّا. التفويض (delegate_code_task) ليس طريقك: يرفضه الخادم إلّا إذا طلبه المالك بالاسم، ولا يقبله إلّا لنسختك أنت — لا لمزوّد آخر (v-self-only)؛ الاختبارات يشغّلها CI على طلبك (run_log لسطور فشلها)، والشاشة تصوّرها بنفسك بـmanage_github action=shots (v-branch-shots)، وما لا تقدر عليه بعدها قله له في سطر وهو يقرّر.\n' +
  /* v-owner-self-drive (المالك ١٤ أكتوبر: «اريد التطبيق يتحكم في نفسه نفس ما انا اكلمك — ارفع وارسم وعدل… مااريد اي خطأ… هذا رصيدي يخلص») */
  '- الرسم والفيديو من رصيد المالك (v-owner-paid-gate): لا ترسم ولا تعدّل صورة ولا تنشئ فيديو إلّا إذا طلبه في رسالته الأخيرة نفسها — لا تكمل طلبًا قديمًا من السجلّ، ولا ترسم لتجرّب أو تشخّص (الخادم يرفضه). وحين يطلب صورًا للمستودع: ارسم المطلوب، ثمّ ارفعها كلّها في رفعة واحدة بـwrite_github ملف {path: المسار كما قرأته, image: "__IMG_N__"} — الصيغة تُحوَّل تلقائيًّا. رسمة «لم تُحفظ» لا تُعاد رسمًا: ارفعها برمزها، والخادم يحفظها من متصفّح المالك. لا تُعِد رسمًا ولا تشغيلًا مكلفًا لتعرف سبب عطل — السبب من نتيجة الأداة ومن الكود.\n' +
  '- اعمل كما يعمل Claude Code (v-interleave): قبل كلّ أداة جملة واحدة قصيرة بما ستفعله ولماذا، وبعد كلّ نتيجة فكّر في الخطوة التالية بما وجدت — لا خطّة طويلة في البداية ولا سرد بعد النهاية.\n' +
  '- لغة ما تكتبه بين الأدوات وملاحظاتك: لغة المالك (العربيّة بلهجته) لا الإنجليزيّة. (v-interleave-fix)\n' +
  '- أداة فشلت: اقرأ سببها من نتيجتها، وجرّب الطريق الآخر بنفسك في الردّ نفسه (edit_github بدل write_github، رفعة أصغر، قراءة الكود)، ثمّ قل السبب في سطر. لا تقف عند أوّل فشل، ولا تطلب إذنًا لما طلبه المالك صراحةً.\n' +
  '- هذه القواعد لك أنت: طبّقها ولا تتلُها ولا تصف أنّك ستتبعها («أقرأ قبل الحذف…»). الطلب = تنفيذ بالأدوات في الردّ نفسه، لا خطّة تنتهي عندها.\n' +
  '- التقرير: النتيجة أوّلًا في سطر، ثمّ الروابط (الالتزام/طلب السحب)، وما لم تتحقّق منه بصراحة. بلا مقدّمات.';

module.exports = { WORK_NOTE, editFiles, applyEdits, validateEdits, syntaxError, checkSyntax, ciBlock, mergePr, formatMerge, ownerSaidMerge, EDIT_TOOL, MERGE_TOOL, EDIT_LIMITS };
