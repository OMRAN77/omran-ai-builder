// api/_lib/github-manage.js — v-agent-manage: إدارة المستودع للمالك (المالك ١٠ أكتوبر: «عطه صلاحيّة قويّة» ثمّ «صلح كل شي»).
//
// الوكيل كان يقرأ ويرفع ويعدّل ويدمج فقط. حين قال المالك «سكّر #959 و#954 و#956» لم تكن عنده أداة، فطلب من
// المالك أن يسكّرها بيده من PowerShell — وكذلك حذف تشغيلات CI الفاشلة. هذه الأداة تكمل الدائرة:
//   قراءة بلا إذن: حالة طلب/مسألة وفحوصه وتعارضه · قائمة تشغيلات Actions · مهامّ تشغيل وخطواته الفاشلة.
//   تعليق وإعادة تشغيل الفاشل: بلا إذن خاصّ (لا يحذفان ولا يغيّران كودًا).
//   تغيير لا يُنفَّذ إلّا بفعل صريح في آخر رسالة من المالك (الخادم يفحصه بـownerAllows، لا النموذج):
//     close/reopen («سكّر/اغلق» · «افتح») · delete_branch/delete_runs («احذف/امسح/نظّف») · cancel_run («وقّف/الغِ»).
//   main والفرع الافتراضيّ والفروع المحميّة لا تُحذف أبدًا.
'use strict';

const { ghFetch, parseTarget, resolveGithubToken } = require('./github-read.js');

const ACTIONS = ['status', 'deploy', 'ci', 'test', 'runs', 'run_jobs', 'run_log', 'shots', 'close', 'reopen', 'comment', 'delete_branch', 'rerun_failed', 'cancel_run', 'delete_runs'];
const GATE = { close: 'close', reopen: 'reopen', delete_branch: 'delete', delete_runs: 'delete', cancel_run: 'cancel' };
const VERBS = {
  close: /سكّ?ر|اغلق|أغلق|إغلاق|قفّ?ل|\bclose\b/i,
  reopen: /افتح|أعد\s*فتح|\breopen\b/i,
  delete: /احذف|إحذف|امسح|نظّ?ف|\bdelete\b|\bremove\b/i,
  cancel: /وقّ?ف|الغ|ألغ|إلغ|\bcancel\b|\bstop\b/i,
};
const NEG = /(?:^|[\s،.,!؟?])(?:لا|ما|مو|بدون)\s*(?:ت|ن)?(?:سكّ?ر|غلق|قفّ?ل|حذف|مسح|نظّ?ف|وقّ?ف|لغ|فتح)|don'?t\s+(?:close|delete|cancel|reopen)|do\s+not\s+(?:close|delete|cancel|reopen)/i;

/* إذن الإجراء من آخر رسالة للمالك — صرف بلا شبكة (يُختبر وحده). */
function ownerAllows(action, text) {
  const g = GATE[action];
  if (!g) return true;
  const s = String(text || '');
  if (NEG.test(s)) return false;
  return VERBS[g].test(s);
}

async function ghJson(pathname, o) {
  const r = await ghFetch(pathname, o);
  let j = null;
  try { j = r.status === 204 ? null : await r.json(); } catch (e) { j = null; }
  return { r, j };
}
const ghErr = (what, r, j) => ({ error: what + ' (GitHub HTTP ' + r.status + ')' + (j && j.message ? ': ' + String(j.message).slice(0, 160) : '') + (r.status === 403 || r.status === 404 ? ' — قد يكون مفتاح GitHub بلا صلاحيّة كافية (Issues · Pull requests · Actions: write).' : '') });
const posInt = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
const nums = (i) => (Array.isArray(i.numbers) ? i.numbers : [i.number]).map(posInt).filter(Boolean).slice(0, 10);
const post = (o, method, body) => Object.assign({}, o, { method, body });

async function itemStatus(R, n, o) {
  const { r, j } = await ghJson(R + '/issues/' + n, o);
  if (!r.ok || !j) return '#' + n + ': غير موجود (HTTP ' + r.status + ')';
  if (!j.pull_request) return '#' + n + ' مسألة · ' + (j.state === 'open' ? 'مفتوحة' : 'مغلقة') + ' · ' + String(j.title || '').slice(0, 90);
  const { j: p } = await ghJson(R + '/pulls/' + n, o);
  let line = '#' + n + ' طلب سحب · ' + (p && p.merged ? 'مدموج' : (j.state === 'open' ? 'مفتوح' : 'مغلق')) + ' · ' + String(j.title || '').slice(0, 90);
  if (p) {
    line += ' · الفرع ' + (p.head && p.head.ref) + (p.mergeable === false ? ' · فيه تعارض مع ' + (p.base && p.base.ref) : (p.mergeable_state ? ' · ' + p.mergeable_state : ''));
    const sha = p.head && p.head.sha;
    if (sha) {
      const { r: cr, j: cj } = await ghJson(R + '/commits/' + sha + '/check-runs?per_page=30', o);
      if (cr.ok && cj && Array.isArray(cj.check_runs) && cj.check_runs.length) line += '\n  الفحوص: ' + cj.check_runs.map((c) => c.name + ' ' + (c.conclusion || c.status)).join(' · ');
    }
  }
  return line;
}

/* v-owner-like-me (المالك ١٣ أكتوبر «اريد كل المزودين نفسك» — Claude Code يتحقّق بعد «ادمج وانشر» أنّ النشر وصل الموقع ويقول ما رأى):
   قراءة بلا إذن. طلب مدموج = حالة Vercel على التزام الدمج (الإنتاج)، وغير مدموج = معاينته؛ وبلا رقم = آخر التزام على main.
   ومع find: الملفّ نفسه من الموقع المنشور (siteUrl، لا عنوان من النموذج) وهل فيه النصّ الجديد. */
const STATE_AR = { success: 'نجح', pending: 'قيد البناء', failure: 'فشل', error: 'فشل' };
async function siteHas(p, find, o) {
  const base = require('./_site.js').siteUrl();
  const rel = String(p || '').trim().replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '').replace(/[?#].*$/, '');
  if (/\.\.|\\/.test(rel)) return '✗ مسار غير صالح: ' + rel;
  const url = base + '/' + encodeURI(rel);
  const f = String(find).slice(0, 200);
  try {
    const r = await require('./safe-url.js').fetchPublicUrl(url + '?_omran=' + Date.now(), { signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } }, { fetchFn: o && o.fetchImpl, lookup: o && o.lookup, maxRedirects: 3 });
    if (!r.ok) return '✗ الموقع المنشور: ' + url + ' ← HTTP ' + r.status;
    const txt = String(await r.text()).slice(0, 8000000);
    const at = txt.indexOf(f);
    if (at === -1) return '✗ الموقع المنشور: «' + f + '» غير موجود في ' + url + ' — إن كانت الحالة «قيد البناء» فأعد بعد قليل، وإلّا فالتغيير لم يصل.';
    return '✓ الموقع المنشور: «' + f + '» موجود في ' + url + ' — …' + txt.slice(Math.max(0, at - 60), at + f.length + 60).replace(/\s+/g, ' ') + '…';
  } catch (e) { return '✗ تعذّر فتح ' + url + ': ' + String((e && e.message) || e).slice(0, 120); }
}
/* v-deploy-wait (المالك ١٥ أكتوبر «يكون متأكّد نفسك بعد الدمج والنشر»): «قيد البناء — أعد بعد قليل» كانت نهاية ردّ المزوّد. الآن
   النداء نفسه ينتظر (wait ثوانٍ، الافتراضيّ ٩٠ والأقصى ٢٤٠، كلّ ١٥ ث) حتّى تستقرّ حالة النشر، ومع find حتّى يظهر النصّ في الموقع —
   فيرجع «نجح + موجود» في نداء واحد. wait=0 = نظرة واحدة كما كان. */
const WAIT_DEFAULT = 90, WAIT_MAX = 240, POLL_MS = 15000;
const waitOf = (i) => { const w = i.wait === undefined || i.wait === null || i.wait === '' ? WAIT_DEFAULT : Number(i.wait); return Number.isFinite(w) ? Math.max(0, Math.min(WAIT_MAX, w)) : WAIT_DEFAULT; };
const sleeper = (o) => (o && typeof o.sleep === 'function') ? o.sleep : ((ms) => new Promise((r) => setTimeout(r, ms)));
async function deployCheck(R, i, o) {
  const n = posInt(i.number);
  let sha = '', label = '';
  if (n) {
    const { r, j: p } = await ghJson(R + '/pulls/' + n, o);
    if (!r.ok || !p) return { error: '#' + n + ': طلب سحب غير موجود (HTTP ' + r.status + ')' };
    if (p.merged && p.merge_commit_sha) { sha = p.merge_commit_sha; label = 'نشر الإنتاج — التزام دمج #' + n + ' (' + sha.slice(0, 7) + ')'; }
    else { sha = (p.head && p.head.sha) || ''; label = 'طلب السحب #' + n + ' غير مدموج — هذه معاينته لا الإنتاج (' + sha.slice(0, 7) + ')'; }
  } else {
    const br = String(i.branch || 'main');
    const { r, j } = await ghJson(R + '/commits/' + encodeURIComponent(br), o);
    if (!r.ok || !j || !j.sha) return ghErr('تعذّرت قراءة آخر التزام', r, j);
    sha = j.sha; label = 'آخر التزام على ' + br + ' (' + sha.slice(0, 7) + ')';
  }
  const wait = waitOf(i), sleep = sleeper(o), t0 = Date.now();
  const left = () => wait * 1000 - (Date.now() - t0);
  let sts = [], site = '';
  for (;;) { // v-deploy-wait: حتّى تستقرّ الحالة (لا pending ولا فارغة) ومعها النصّ إن طُلب، أو تنفد المهلة
    const { r: sr, j: sj } = await ghJson(R + '/commits/' + sha + '/status', o);
    sts = (sr.ok && sj && Array.isArray(sj.statuses)) ? sj.statuses : [];
    const settled = sts.length && !sts.some((st) => st.state === 'pending');
    site = (i.find && settled) ? await siteHas(i.path, i.find, o) : '';
    const done = settled && (!i.find || site.charAt(0) === '✓');
    if (done || left() < POLL_MS) break;
    await sleep(Math.min(POLL_MS, left()));
  }
  const waited = Math.round((Date.now() - t0) / 1000);
  const lines = [label + (waited >= 5 ? ' — انتظرتُ ' + waited + ' ث' : '')];
  if (sts.length) for (const st of sts) lines.push('  ' + st.context + ': ' + (STATE_AR[st.state] || st.state) + (st.target_url ? ' · ' + st.target_url : ''));
  else lines.push('  لا حالة نشر على هذا الالتزام بعد — النشر لم يبدأ أو لم يُبلَغ؛ أعد بعد قليل.');
  if (i.find) lines.push(site || await siteHas(i.path, i.find, o));
  if (sts.some((st) => st.state === 'pending')) lines.push('  ما زال قيد البناء بعد المهلة — أعد action=deploy بالمدخلات نفسها في ردّك التالي، ولا تقل «نُشر».');
  return { ok: true, text: lines.join('\n') };
}

/* v-branch-ci (المالك ١٥ أكتوبر «كيف أخلّي المزوّدين… يكون متأكّد نفسك»): Claude Code يشغّل npm run ci قبل الرفع ويرى الفشل بعينه؛
   المزوّدون لا جهاز لهم. الآن ci.yml نفسه (الأوامر نفسها، بلا مدخلات) يُبدأ على فرعهم بـworkflow_dispatch، وكالتصوير: النداء الأوّل
   يبدؤه، واللاحق يقرأ تشغيل التزام الفرع الحاليّ (من أيّ حدث: push أو pull_request أو dispatch) — أخضر، أو أحمر مع سطور الفشل نفسها
   (failLines من سجلّ المهمّة الفاشلة) فلا يُرفع إصلاح أعمى. قراءة بلا إذن. */
const CI_WORKFLOW = 'ci.yml';
async function branchCi(R, i, o) {
  const b = await branchOf(R, i, o);
  if (b.error) return b;
  if (!BS.BRANCH_RE.test(b.branch)) return { error: 'أعطِ branch (فرعك بعد الرفع) أو number طلب السحب.' };
  const { r: cr, j: cj } = await ghJson(R + '/commits/' + encodeURIComponent(b.branch), o);
  if (!cr.ok || !cj || !cj.sha) return ghErr('تعذّرت قراءة آخر التزام على ' + b.branch, cr, cj);
  const sha = cj.sha, what = 'الفرع ' + b.branch + ' (' + sha.slice(0, 7) + ')';
  const { r: lr, j: lj } = await ghJson(R + '/actions/workflows/' + CI_WORKFLOW + '/runs?per_page=30&branch=' + encodeURIComponent(b.branch), o);
  if (lr.status === 404) return { error: 'ورك فلو CI (' + CI_WORKFLOW + ') غير موجود في المستودع.' };
  if (!lr.ok || !lj) return ghErr('تعذّرت قراءة تشغيلات CI', lr, lj);
  const run = (lj.workflow_runs || []).find((x) => x.head_sha === sha);
  if (!run) {
    const { r: dr, j: dj } = await ghJson(R + '/actions/workflows/' + CI_WORKFLOW + '/dispatches', post(o, 'POST', { ref: b.branch }));
    if (dr.status !== 204 && !dr.ok) return ghErr('تعذّر بدء الفحص (يحتاج مفتاح GitHub صلاحيّة Actions: write)', dr, dj);
    return { ok: true, text: '🧪 بدأتُ الفحص الكامل (npm run ci: الحارس والحزمة وكلّ الاختبارات) على ' + what + ' — يأخذ ثلاث دقائق تقريبًا. أعد manage_github action=ci بالمدخلات نفسها في ردّك التالي لترى النتيجة؛ لا تكرّره في الردّ نفسه ولا تقل «نجح» قبلها.' };
  }
  if (run.status !== 'completed') return { ok: true, text: '🧪 فحص ' + what + ' قيد العمل (' + run.html_url + ') — أعد action=ci بعد دقيقتين في ردّك التالي.' };
  if (run.conclusion === 'success') return { ok: true, text: '✅ الفحص الكامل أخضر على ' + what + ': ' + run.html_url + ' — الآن طلب السحب (أو الدمج إن أمر المالك).' };
  const { r: jr, j: jj } = await ghJson(R + '/actions/runs/' + run.id + '/jobs?per_page=30', o);
  const jobs = (jr.ok && jj && jj.jobs) || [];
  const bad = jobs.find((jb) => jb.conclusion === 'failure') || jobs[0];
  const head = '✗ الفحص الكامل ' + (STATE_AR[run.conclusion] || run.conclusion) + ' على ' + what + ': ' + run.html_url + ' — أصلح ما يلي قبل أيّ طلب سحب أو دمج.';
  if (!bad) return { ok: true, text: head };
  const log = await jobLog(R, bad.id, o);
  return { ok: true, text: head + '\n' + (log.ok ? log.text : '(تعذّرت قراءة السجلّ: ' + log.error + ' — اقرأه بـrun_log run_id=' + run.id + ')') };
}

async function deleteBranch(R, branch, o) {
  const b = String(branch || '').trim();
  if (!b || /^(?:main|master)$/i.test(b)) return '✗ لا يُحذف الفرع ' + (b || '(فارغ)');
  const { j: repo } = await ghJson(R, o);
  if (repo && repo.default_branch === b) return '✗ لا يُحذف الفرع الافتراضيّ';
  const { r: br, j: bj } = await ghJson(R + '/branches/' + encodeURIComponent(b), o);
  if (!br.ok) return '✗ الفرع ' + b + ' غير موجود';
  if (bj && bj.protected) return '✗ الفرع ' + b + ' محميّ';
  const { r, j } = await ghJson(R + '/git/refs/heads/' + b.split('/').map(encodeURIComponent).join('/'), post(o, 'DELETE'));
  return r.ok ? 'حُذف الفرع ' + b : '✗ ' + ghErr('لم يُحذف الفرع ' + b, r, j).error;
}

async function closeOrReopen(R, n, state, i, o) {
  const { r: ir, j: ij } = await ghJson(R + '/issues/' + n, o);
  if (!ir.ok || !ij) return '✗ #' + n + ': غير موجود (HTTP ' + ir.status + ')';
  const isPr = !!ij.pull_request;
  const body = { state };
  if (state === 'closed' && !isPr) body.state_reason = i.reason === 'completed' ? 'completed' : 'not_planned';
  if (i.comment) await ghJson(R + '/issues/' + n + '/comments', post(o, 'POST', { body: String(i.comment).slice(0, 4000) }));
  const { r, j } = await ghJson(R + (isPr ? '/pulls/' : '/issues/') + n, post(o, 'PATCH', body));
  if (!r.ok) return '✗ #' + n + ': ' + ghErr('رُفض', r, j).error;
  let line = '✅ #' + n + (state === 'closed' ? ' سُكّر' : ' فُتح من جديد');
  if (state === 'closed' && isPr && i.delete_branch === true && j && j.head && j.base && j.head.repo && j.base.repo && j.head.repo.full_name === j.base.repo.full_name) line += ' · ' + await deleteBranch(R, j.head.ref, o);
  return line;
}

/* v-run-log (المالك ١٤ أكتوبر: «اريد يكون عندهم معلومات تصحيح الاخطاء»): run_jobs يعطي اسم الخطوة الفاشلة فقط، فيخمّن المزوّد سبب فشل
   CI ويرفع إصلاحًا أعمى. هنا سطور الفشل نفسها من سجلّ المهمّة (الاختبار والتأكيد والمتوقّع والفعليّ) — قراءة بلا إذن مثل
   gh run view --log-failed عند Claude Code. السجلّ يحوّله GitHub إلى رابط موقَّع على مخزن آخر: مفتاح GitHub لا يُرسل إليه. */
const FAIL_RE = /✗|✖|not ok|AssertionError|Error:|ERR_[A-Z_]{3,}|expected|actual|##\[error\]|failing|فشل [1-9١-٩]/;
const NOISE_RE = /Node\.js 20 is deprecated|^Post job|##\[(?:end)?group\]/;
function failLines(raw) {
  const L = String(raw || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, '').replace(/\x1b\[[0-9;]*m/g, ''));
  const keep = new Set();
  L.forEach((l, k) => { if (FAIL_RE.test(l) && !NOISE_RE.test(l) && keep.size < 400) for (let d = -2; d <= 6; d++) if (L[k + d] !== undefined && !NOISE_RE.test(L[k + d])) keep.add(k + d); });
  let prev = -1;
  const out = keep.size ? [...keep].sort((a, b) => a - b).reduce((a, k) => { if (k !== prev + 1) a.push('…'); a.push(L[k]); prev = k; return a; }, []) : ['(لا سطر فشل ظاهر — آخر السجلّ:)'].concat(L.slice(-60));
  let t = out.join('\n').replace(/sk-[A-Za-z0-9_*\-]{8,}/g, 'sk-…').replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, 'gh…').replace(/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_…');
  if (t.length > 6000) t = t.slice(0, 6000) + '\n… (قُصّ — أوّل الفشل أهمّه)';
  return t;
}
async function jobLog(R, jobId, o) {
  const f = o.fetchImpl || fetch;
  const noKey = (url, init) => f(url, /^https:\/\/api\.github\.com\//.test(String(url)) ? init : Object.assign({}, init, { headers: { 'User-Agent': 'OmranAgent/1.0' } }));
  const r = await ghFetch(R + '/actions/jobs/' + jobId + '/logs', Object.assign({}, o, { fetchImpl: noKey, timeoutMs: 20000 }));
  if (!r.ok) return ghErr('تعذّرت قراءة سجلّ المهمّة ' + jobId, r, null);
  return { ok: true, text: 'سجلّ المهمّة ' + jobId + ' — سطور الفشل:\n' + failLines(String(await r.text()).slice(-3000000)) };
}

/* v-branch-shots (المالك: «الجهاز الي عندك… ابدا»): لقطة الفرع — قراءة بلا إذن. نداء أوّل يبدأ branch-shots.yml على الفرع (أوامر
   ثابتة: ui-shot حاسوبًا وجوّالًا)، ونداء لاحق بالمدخلات نفسها يقرأ ملفّ التشغيل نفسه (التزام الفرع الحاليّ والعرض نفسه) فيرجع
   اللقطتين صورًا وأخطاء الصفحة. ملفّ التشغيل على مخزن GitHub آخر — مفتاح GitHub لا يُرسل إليه (كسجلّ run_log). */
const BS = require('./branch-shots.js');
async function branchOf(R, i, o) {
  const n = posInt(i.number);
  if (!n) return { branch: String(i.branch || '').trim() };
  const { r, j: p } = await ghJson(R + '/pulls/' + n, o);
  if (!r.ok || !p || !p.head) return { error: '#' + n + ': طلب سحب غير موجود (HTTP ' + r.status + ')' };
  return { branch: String(p.head.ref || '') };
}
async function branchShots(R, i, o) {
  const b = await branchOf(R, i, o);
  if (b.error) return b;
  if (!BS.BRANCH_RE.test(b.branch)) return { error: 'أعطِ branch (فرعك بعد الرفع، أو main للحال قبل التعديل) أو number طلب السحب.' };
  const v = BS.viewOf(i);
  if (v.error) return v;
  const { r: cr, j: cj } = await ghJson(R + '/commits/' + encodeURIComponent(b.branch), o);
  if (!cr.ok || !cj || !cj.sha) return ghErr('تعذّرت قراءة آخر التزام على ' + b.branch, cr, cj);
  const sha = cj.sha, want = BS.titleOf(b.branch, v);
  const { r: lr, j: lj } = await ghJson(R + '/actions/workflows/' + BS.WORKFLOW + '/runs?event=workflow_dispatch&per_page=20&branch=' + encodeURIComponent(b.branch), o);
  if (lr.status === 404) return { error: 'أداة التصوير (' + BS.WORKFLOW + ') غير موجودة في المستودع بعد — تصل مع دمج v-branch-shots.' };
  if (!lr.ok || !lj) return ghErr('تعذّرت قراءة تشغيلات التصوير', lr, lj);
  const run = (lj.workflow_runs || []).find((x) => x.head_sha === sha && BS.norm(x.display_title) === want);
  const what = 'الفرع ' + b.branch + ' (' + sha.slice(0, 7) + ')' + (v.settings ? ' · قسم ' + v.settings : '') + (v.click ? ' · بعد الضغط على ' + v.click : '');
  if (!run) {
    const { r: dr, j: dj } = await ghJson(R + '/actions/workflows/' + BS.WORKFLOW + '/dispatches', post(o, 'POST', { ref: b.branch, inputs: { ref: b.branch, settings: v.settings, click: v.click } }));
    if (dr.status !== 204 && !dr.ok) return ghErr('تعذّر بدء التصوير (يحتاج مفتاح GitHub صلاحيّة Actions: write)', dr, dj);
    return { ok: true, text: '📸 بدأت تصوير ' + what + ' حاسوبًا وجوّالًا — يأخذ دقيقتين تقريبًا. أعد manage_github action=shots بالمدخلات نفسها في ردّك التالي لترى اللقطتين؛ لا تكرّره في الردّ نفسه.' };
  }
  if (run.status !== 'completed') return { ok: true, text: '📸 تصوير ' + what + ' قيد العمل (' + run.html_url + ') — أعد action=shots بعد دقيقة في ردّك التالي.' };
  const { r: ar, j: aj } = await ghJson(R + '/actions/runs/' + run.id + '/artifacts?per_page=10', o);
  const art = ar.ok && aj && (aj.artifacts || []).find((x) => x.name === BS.ARTIFACT && !x.expired);
  if (!art) return { error: 'تشغيل التصوير انتهى (' + (run.conclusion || run.status) + ') بلا لقطات: ' + run.html_url + ' — اقرأ سببه بـrun_log run_id=' + run.id + '.' };
  const f = o.fetchImpl || fetch;
  const noKey = (url, init) => f(url, /^https:\/\/api\.github\.com\//.test(String(url)) ? init : Object.assign({}, init, { headers: { 'User-Agent': 'OmranAgent/1.0' } }));
  const zr = await ghFetch(R + '/actions/artifacts/' + art.id + '/zip', Object.assign({}, o, { fetchImpl: noKey, timeoutMs: 30000 }));
  if (!zr.ok) return ghErr('تعذّر تنزيل اللقطات', zr, null);
  let got;
  try { got = BS.pickShots(require('./analyze-zip.js').unzip(Buffer.from(await zr.arrayBuffer()))); } catch (e) { return { error: 'ملفّ اللقطات تالف: ' + String((e && e.message) || e).slice(0, 120) }; }
  if (!got.images.length) return { error: 'لا لقطات في التشغيل ' + run.html_url + (got.summary && got.summary.note ? ' — ' + got.summary.note : '') };
  const sm = got.summary || {};
  const lines = ['📸 لقطتا ' + what + ' — مرفقتان بعد نتائج هذه الخطوة: انظر إليهما بنفسك وقل للمالك ما تراه بالضبط قبل أيّ «تمّ».'];
  if (sm.rejected) lines.push('⚠️ مدخل مرفوض (' + sm.rejected + ') — صُوّرت الصفحة الرئيسيّة.');
  lines.push((sm.pageErrors && sm.pageErrors.length) ? '✗ أخطاء الصفحة (' + sm.pageErrors.length + '): ' + sm.pageErrors.slice(0, 8).join(' | ') : '✓ لا أخطاء في الصفحة.');
  if (sm.consoleErrors && sm.consoleErrors.length) lines.push('أخطاء الكونسول: ' + sm.consoleErrors.slice(0, 5).join(' | '));
  lines.push('التشغيل: ' + run.html_url);
  return { ok: true, text: lines.join('\n'), runUrl: run.html_url, images: got.images.map((x) => ({ path: 'لقطة ' + (x.name === 'mobile.png' ? 'الجوّال' : 'الحاسوب') + ' — ' + what, label: 'لقطة ' + (x.name === 'mobile.png' ? 'الجوّال' : 'الحاسوب') + ' من ' + what, mime: 'image/png', b64: x.b64, bytes: x.bytes })) };
}

/* v-branch-test (المالك ١٥ أكتوبر «أوصلهم لمستوى كودي»): اختبار واحد على جهاز GitHub في نحو دقيقة — كالتصوير: النداء الأوّل يبدأ
   branch-test.yml على الفرع بالملفّ، واللاحق بالمدخلات نفسها يقرأ تشغيل التزام الفرع الحاليّ والعنوان نفسه: أخضر، أو أحمر مع
   سطور الفشل نفسها من سجلّ المهمّة. المدخل يمرّ بفاحص branch-test.js هنا وفي الجهاز. قراءة بلا إذن. */
const BT = require('./branch-test.js');
async function branchTest(R, i, o) {
  const b = await branchOf(R, i, o);
  if (b.error) return b;
  if (!BS.BRANCH_RE.test(b.branch)) return { error: 'أعطِ branch (فرعك بعد الرفع) أو number طلب السحب.' };
  const v = BT.fileOf(i);
  if (v.error) return v;
  const { r: cr, j: cj } = await ghJson(R + '/commits/' + encodeURIComponent(b.branch), o);
  if (!cr.ok || !cj || !cj.sha) return ghErr('تعذّرت قراءة آخر التزام على ' + b.branch, cr, cj);
  const sha = cj.sha, want = BT.titleOf(b.branch, v.file), what = v.file + ' على الفرع ' + b.branch + ' (' + sha.slice(0, 7) + ')';
  const { r: lr, j: lj } = await ghJson(R + '/actions/workflows/' + BT.WORKFLOW + '/runs?event=workflow_dispatch&per_page=30&branch=' + encodeURIComponent(b.branch), o);
  if (lr.status === 404) return { error: 'أداة الاختبار الواحد (' + BT.WORKFLOW + ') غير موجودة في المستودع بعد — تصل مع دمج v-branch-test.' };
  if (!lr.ok || !lj) return ghErr('تعذّرت قراءة تشغيلات الاختبار', lr, lj);
  const run = (lj.workflow_runs || []).find((x) => x.head_sha === sha && BT.norm(x.display_title) === want);
  if (!run) {
    const { r: dr, j: dj } = await ghJson(R + '/actions/workflows/' + BT.WORKFLOW + '/dispatches', post(o, 'POST', { ref: b.branch, inputs: { ref: b.branch, file: v.file } }));
    if (dr.status !== 204 && !dr.ok) return ghErr('تعذّر بدء الاختبار (يحتاج مفتاح GitHub صلاحيّة Actions: write)', dr, dj);
    return { ok: true, text: '🧪 بدأتُ اختبار ' + what + ' — يأخذ نحو دقيقة. أعد manage_github action=test بالمدخلات نفسها في ردّك التالي لترى النتيجة؛ لا تكرّره في الردّ نفسه ولا تقل «نجح» قبلها.' };
  }
  if (run.status !== 'completed') return { ok: true, text: '🧪 اختبار ' + what + ' قيد العمل (' + run.html_url + ') — أعد action=test بعد نصف دقيقة في ردّك التالي.' };
  if (run.conclusion === 'success') return { ok: true, text: '✅ ' + what + ' أخضر: ' + run.html_url };
  const { r: jr, j: jj } = await ghJson(R + '/actions/runs/' + run.id + '/jobs?per_page=30', o);
  const jobs = (jr.ok && jj && jj.jobs) || [];
  const bad = jobs.find((jb) => jb.conclusion === 'failure') || jobs[0];
  const head = '✗ ' + what + ' ' + (STATE_AR[run.conclusion] || run.conclusion) + ': ' + run.html_url + ' — أصلح ما يلي ثمّ أعد الاختبار.';
  if (!bad) return { ok: true, text: head };
  const log = await jobLog(R, bad.id, o);
  return { ok: true, text: head + '\n' + (log.ok ? log.text : '(تعذّرت قراءة السجلّ: ' + log.error + ' — اقرأه بـrun_log run_id=' + run.id + ')') };
}

async function listRuns(R, i, o) {
  const q = ['per_page=' + Math.min(posInt(i.limit) || 15, 50)];
  if (i.status) q.push('status=' + encodeURIComponent(String(i.status)));
  if (i.branch) q.push('branch=' + encodeURIComponent(String(i.branch)));
  const { r, j } = await ghJson(R + '/actions/runs?' + q.join('&'), o);
  if (!r.ok || !j) return ghErr('تعذّرت قراءة التشغيلات', r, j);
  let runs = j.workflow_runs || [];
  if (i.workflow) runs = runs.filter((x) => String(x.name || '').toLowerCase() === String(i.workflow).toLowerCase());
  return { runs, total: j.total_count };
}

async function manage(input, opts) {
  const o = opts || {};
  const i = input && typeof input === 'object' ? input : {};
  const action = String(i.action || '');
  if (ACTIONS.indexOf(action) === -1) return { error: 'إجراء غير معروف: ' + action + ' — المتاح: ' + ACTIONS.join(' · ') };
  const t = parseTarget({ url: i.repo || i.url || '' });
  if (!t) return { error: 'حدّد المستودع بصيغة owner/repo أو برابطه.' };
  if (!(await resolveGithubToken(o))) return { error: 'لا مفتاح GitHub — احفظه في خزنة الأسرار أو GITHUB_TOKEN.' };
  const R = '/repos/' + t.owner + '/' + t.repo;
  const lines = [];

  if (action === 'deploy') return deployCheck(R, i, o); // v-owner-like-me
  if (action === 'shots') return branchShots(R, i, o); // v-branch-shots
  if (action === 'ci') return branchCi(R, i, o); // v-branch-ci
  if (action === 'test') return branchTest(R, i, o); // v-branch-test
  if (action === 'status' || action === 'close' || action === 'reopen' || action === 'comment') {
    const ns = nums(i);
    if (!ns.length) return { error: 'أعطِ number أو numbers (حتّى ١٠).' };
    if (action === 'comment' && !i.comment) return { error: 'نصّ التعليق comment مطلوب.' };
    for (const n of ns) {
      if (action === 'status') lines.push(await itemStatus(R, n, o));
      else if (action === 'comment') {
        const { r, j } = await ghJson(R + '/issues/' + n + '/comments', post(o, 'POST', { body: String(i.comment).slice(0, 4000) }));
        lines.push(r.ok ? '✅ علّقت على #' + n + ': ' + (j && j.html_url) : '✗ #' + n + ': ' + ghErr('رُفض التعليق', r, j).error);
      } else lines.push(await closeOrReopen(R, n, action === 'close' ? 'closed' : 'open', i, o));
    }
    return { ok: true, text: lines.join('\n') };
  }
  if (action === 'delete_branch') {
    const bs = (Array.isArray(i.branches) ? i.branches : [i.branch]).filter(Boolean).slice(0, 10);
    if (!bs.length) return { error: 'أعطِ branch أو branches.' };
    for (const b of bs) lines.push(await deleteBranch(R, b, o));
    return { ok: true, text: lines.join('\n') };
  }
  if (action === 'runs') {
    const lr = await listRuns(R, i, o);
    if (lr.error) return lr;
    if (!lr.runs.length) return { ok: true, text: 'لا تشغيلات مطابقة.' + (lr.total != null ? ' (المجموع قبل التصفية: ' + lr.total + ')' : '') };
    return { ok: true, text: 'المجموع: ' + lr.total + '\n' + lr.runs.map((x) => x.id + ' · ' + x.name + ' · ' + (x.conclusion || x.status) + ' · ' + x.head_branch + ' · ' + String(x.created_at || '').replace('T', ' ').slice(0, 16) + ' · ' + String((x.head_commit && x.head_commit.message) || '').split('\n')[0].slice(0, 70)).join('\n') };
  }
  const id = posInt(i.run_id);
  if (action === 'run_jobs') {
    if (!id) return { error: 'run_id مطلوب.' };
    const { r, j } = await ghJson(R + '/actions/runs/' + id + '/jobs?per_page=30', o);
    if (!r.ok || !j) return ghErr('تعذّرت قراءة مهامّ التشغيل', r, j);
    return { ok: true, text: (j.jobs || []).map((jb) => jb.name + ' (job_id ' + jb.id + '): ' + (jb.conclusion || jb.status) + (jb.steps || []).filter((s) => s.conclusion === 'failure').map((s) => '\n  ✗ خطوة فاشلة: ' + s.name).join('') + ' · ' + jb.html_url).join('\n') || 'لا مهامّ.' };
  }
  if (action === 'run_log') { // v-run-log
    let jid = posInt(i.job_id);
    if (!jid) {
      if (!id) return { error: 'job_id (من run_jobs) أو run_id مطلوب.' };
      const { r, j } = await ghJson(R + '/actions/runs/' + id + '/jobs?per_page=30', o);
      if (!r.ok || !j) return ghErr('تعذّرت قراءة مهامّ التشغيل', r, j);
      const jobs = j.jobs || [];
      const bad = jobs.find((jb) => jb.conclusion === 'failure') || jobs[0];
      if (!bad) return { ok: true, text: 'لا مهامّ في التشغيل ' + id + '.' };
      jid = bad.id;
    }
    return jobLog(R, jid, o);
  }
  if (action === 'rerun_failed' || action === 'cancel_run') {
    if (!id) return { error: 'run_id مطلوب.' };
    const { r, j } = await ghJson(R + '/actions/runs/' + id + (action === 'rerun_failed' ? '/rerun-failed-jobs' : '/cancel'), post(o, 'POST', {}));
    return r.ok ? { ok: true, text: '✅ ' + (action === 'rerun_failed' ? 'أُعيد تشغيل المهامّ الفاشلة في ' : 'أُلغي التشغيل ') + id } : ghErr('رُفض', r, j);
  }
  // delete_runs: المعرّفات المعطاة، وإلّا المكتمل من التشغيلات المطابقة (الفاشلة افتراضيًّا) — ٥٠ في الاستدعاء.
  let targets = Array.isArray(i.run_ids) ? i.run_ids.map(posInt).filter(Boolean) : [];
  if (!targets.length) {
    const lr = await listRuns(R, { status: i.status || 'failure', workflow: i.workflow, branch: i.branch, limit: 50 }, o);
    if (lr.error) return lr;
    targets = lr.runs.filter((x) => x.status === 'completed').map((x) => x.id);
  }
  targets = targets.slice(0, 50);
  let ok = 0; const bad = [];
  for (const rid of targets) {
    const { r } = await ghJson(R + '/actions/runs/' + rid, post(o, 'DELETE'));
    if (r.ok) ok++; else bad.push(rid + ' (HTTP ' + r.status + ')');
  }
  return { ok: true, text: (targets.length ? '✅ حُذف ' + ok + ' من ' + targets.length + ' تشغيلًا' : 'لا تشغيلات مطابقة للحذف.') + (bad.length ? ' · فشل: ' + bad.slice(0, 5).join('، ') : '') + (targets.length === 50 ? '\nالحدّ ٥٠ في الاستدعاء — استدعِ مرّة ثانية للباقي.' : '') };
}

function formatManage(res) {
  if (!res || res.error) return '✗ ' + ((res && res.error) || 'سبب غير معروف');
  return res.text;
}

const MANAGE_TOOL = {
  name: 'manage_github',
  description: 'أدِر مستودع المالك: status (حالة طلبات سحب/مسائل: مفتوح أو مغلق أو مدموج، والتعارض، والفحوص) · deploy (بعد الدمج: حالة نشر Vercel للطلب number، ومع path وfind هل التغيير في الموقع المنشور — ينتظر بنفسه حتّى wait ثانية (الافتراضيّ ٩٠) فيرجع «نجح» والنصّ موجودًا في نداء واحد؛ قبل أن تقول «نُشر») · ci (الفحص الكامل npm run ci على فرعك branch أو number في جهاز GitHub — الأوامر نفسها التي تفشل رفعتك عند الدمج: النداء الأوّل يبدؤه (~٣ دقائق)، والنداء في ردّك التالي يرجع أخضر أو أحمر مع سطور الفشل نفسها فتصلحها — قبل طلب السحب، وقبل «تمّ») · test (اختبار واحد file=tests/x.test.cjs على فرعك في جهاز GitHub — نحو دقيقة: النداء الأوّل يبدؤه، والنداء في ردّك التالي يرجع أخضر أو سطور الفشل نفسها؛ للتجربة السريعة أثناء الشغل قبل ci الكامل) · runs (تشغيلات Actions؛ status=failure للفاشلة، workflow=CI) · run_jobs (مهامّ تشغيل وخطواته الفاشلة) · run_log (سطور الفشل نفسها من سجلّ مهمّة: job_id من run_jobs، أو run_id فتُقرأ أوّل مهمّة فاشلة — اقرأه قبل أيّ إصلاح لفشل CI، لا تخمّن السبب من اسم الخطوة) · shots (لقطة شاشة لفرعك حاسوبًا وجوّالًا على جهاز GitHub — branch أو number، وsettings قسم إعدادات مثل accountSection أو click معرّف زرّ مثل #btnX يُفتح قبل اللقطة: النداء الأوّل يبدأ التصوير (~دقيقتان)، والنداء في ردّك التالي بالمدخلات نفسها يرجع اللقطتين صورًا وأخطاء الصفحة — انظر قبل أيّ «تمّ» لتغيير مرئيّ) · close/reopen (طلبات ومسائل؛ delete_branch=true يحذف فرع الطلب) · comment · delete_branch · rerun_failed · cancel_run · delete_runs (يحذف تشغيلات مكتملة، الفاشلة افتراضيًّا، ٥٠ في الاستدعاء). close وreopen والحذف والإلغاء تُرفض إلّا إن قالها المالك صراحةً في رسالته الأخيرة («سكّر»، «افتح»، «احذف»، «وقّف») — الخادم يفحص. افحص بـstatus قبل أن تقول إنّ شيئًا مفتوح أو مدموج، ولا تقل «تمّ» قبل نتيجة الأداة.',
  input_schema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'owner/repo أو رابطه' },
      action: { type: 'string', enum: ACTIONS },
      number: { type: 'integer', description: 'رقم طلب سحب أو مسألة' },
      numbers: { type: 'array', items: { type: 'integer' }, description: 'عدّة أرقام (حتّى ١٠)' },
      comment: { type: 'string', description: 'نصّ تعليق (لـcomment، أو يُكتب قبل التسكير)' },
      reason: { type: 'string', enum: ['not_planned', 'completed'], description: 'سبب تسكير المسألة (الافتراضيّ not_planned)' },
      delete_branch: { type: 'boolean', description: 'مع close: احذف فرع طلب السحب' },
      branch: { type: 'string', description: 'فرع (delete_branch، أو تصفية runs، أو الفرع المصوَّر في shots، أو المفحوص في ci وtest)' },
      file: { type: 'string', description: 'test: ملفّ اختبار واحد مسجّل في package.json مثل tests/work-log.test.cjs' },
      wait: { type: 'integer', description: 'deploy: ثوانٍ ينتظرها النداء حتّى يستقرّ النشر ويظهر النصّ (الافتراضيّ ٩٠، الأقصى ٢٤٠، و0 نظرة واحدة)' },
      settings: { type: 'string', description: 'shots: قسم إعدادات يُفتح قبل اللقطة مثل accountSection (اختياريّ)' },
      click: { type: 'string', description: 'shots: معرّف زرّ يُضغط قبل اللقطة مثل #btnPortraitStyles (اختياريّ)' },
      branches: { type: 'array', items: { type: 'string' } },
      run_id: { type: 'integer' },
      job_id: { type: 'integer', description: 'run_log: رقم المهمّة كما في run_jobs' },
      run_ids: { type: 'array', items: { type: 'integer' } },
      status: { type: 'string', description: 'تصفية التشغيلات: failure · success · in_progress · cancelled' },
      workflow: { type: 'string', description: 'اسم الـworkflow مثل CI' },
      limit: { type: 'integer' },
      path: { type: 'string', description: 'deploy: ملفّ في الموقع المنشور تغيّر، مثل css/tokens.css أو js/app.bundle.js' },
      find: { type: 'string', description: 'deploy: نصّ جديد أضافه التغيير في ذلك الملفّ (حتّى ٢٠٠ حرف)' },
    },
    required: ['repo', 'action'],
  },
};

module.exports = { MANAGE_TOOL, manage, formatManage, ownerAllows, ACTIONS, GATE, failLines };