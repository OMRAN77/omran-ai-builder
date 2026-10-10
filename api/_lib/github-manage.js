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

const ACTIONS = ['status', 'runs', 'run_jobs', 'close', 'reopen', 'comment', 'delete_branch', 'rerun_failed', 'cancel_run', 'delete_runs'];
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
    return { ok: true, text: (j.jobs || []).map((jb) => jb.name + ': ' + (jb.conclusion || jb.status) + (jb.steps || []).filter((s) => s.conclusion === 'failure').map((s) => '\n  ✗ خطوة فاشلة: ' + s.name).join('') + ' · ' + jb.html_url).join('\n') || 'لا مهامّ.' };
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
  description: 'أدِر مستودع المالك: status (حالة طلبات سحب/مسائل: مفتوح أو مغلق أو مدموج، والتعارض، والفحوص) · runs (تشغيلات Actions؛ status=failure للفاشلة، workflow=CI) · run_jobs (مهامّ تشغيل وخطواته الفاشلة) · close/reopen (طلبات ومسائل؛ delete_branch=true يحذف فرع الطلب) · comment · delete_branch · rerun_failed · cancel_run · delete_runs (يحذف تشغيلات مكتملة، الفاشلة افتراضيًّا، ٥٠ في الاستدعاء). close وreopen والحذف والإلغاء تُرفض إلّا إن قالها المالك صراحةً في رسالته الأخيرة («سكّر»، «افتح»، «احذف»، «وقّف») — الخادم يفحص. افحص بـstatus قبل أن تقول إنّ شيئًا مفتوح أو مدموج، ولا تقل «تمّ» قبل نتيجة الأداة.',
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
      branch: { type: 'string', description: 'فرع (delete_branch، أو تصفية runs)' },
      branches: { type: 'array', items: { type: 'string' } },
      run_id: { type: 'integer' },
      run_ids: { type: 'array', items: { type: 'integer' } },
      status: { type: 'string', description: 'تصفية التشغيلات: failure · success · in_progress · cancelled' },
      workflow: { type: 'string', description: 'اسم الـworkflow مثل CI' },
      limit: { type: 'integer' },
    },
    required: ['repo', 'action'],
  },
};

module.exports = { MANAGE_TOOL, manage, formatManage, ownerAllows, ACTIONS, GATE };