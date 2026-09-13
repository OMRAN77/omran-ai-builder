// api/_lib/agent-delegate.js — v-agent-delegate: «أبي الوكيل نفسك بالضبط».
//
// وكيل التطبيق يعمل على خادم بلا بيئة تشغيل: لا يقدر أن يشغّل الاختبارات ولا المتصفّح.
// فبدل تقليد ذلك، يسلّم المهمّة إلى Claude Code نفسه داخل GitHub Actions على مستودع
// المالك (.github/workflows/omran-agent.yml): هناك يقرأ المستودع كاملًا، يعدّل، يعيد
// بناء الحزمة، يشغّل npm run ci حتّى يمرّ، ويلتزم على فرع تدفعه خطوة الورك فلو.
//
//   startTask: يفتح مسألة للمهمّة (سجلّ مرئيّ للمالك) ثمّ يشغّل الورك فلو بمدخلاتها.
//   checkTask: يقرأ حالة المهمّة من تعليقات المسألة (سطر حالة مخفيّ يكتبه الورك فلو)،
//              وعند اكتمال الدفع يفتح طلب السحب بمفتاح المالك (لا بمفتاح Actions، حتّى
//              تعمل فحوص CI على الطلب) ويعيد حالة الفحوص.
//
// كلاهما للمالك وحده (agent.js يخفي الأداتين عن غيره ويرفض تنفيذهما)، والمفتاح من
// خزنة الأسرار أو البيئة (github-read.js → resolveGithubToken). لا دفع إلى الفرع
// الرئيسيّ أبدًا؛ الدمج والنشر بيد المالك.
'use strict';

const { ghFetch, parseTarget } = require('./github-read.js');

const WORKFLOW = 'omran-agent.yml';
const STATUS_RE = /<!--\s*omran-agent\s+(\{[\s\S]*?\})\s*-->/g;
const BRANCH_RE = /\*\*الفرع:\*\*\s*`([^`]+)`/;
const BASE_RE = /\*\*الأساس:\*\*\s*`([^`]+)`/;

function defaultRepo(env) { return String((env || process.env).AGENT_REPO || 'OMRAN77/omran-ai-builder'); }
function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/[؀-ۿ]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'task'; }
function short(sha) { return String(sha || '').slice(0, 7); }

async function ghJson(pathname, o) {
  const r = await ghFetch(pathname, o);
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { r, j };
}
function apiMsg(r, j, what) {
  const m = j && j.message ? String(j.message).slice(0, 160) : '';
  if (r.status === 401) return 'مفتاح GitHub غير صالح (الخزنة أو GITHUB_TOKEN).';
  if (r.status === 403) return 'GitHub رفض ' + what + ' — المفتاح يحتاج صلاحيّة أعلى' + (m ? ': ' + m : '');
  if (r.status === 404) return what + ' غير موجود، أو المفتاح لا يملك صلاحيّته.';
  if (r.status === 422) return what + ' مرفوض (422)' + (m ? ': ' + m : '');
  return 'GitHub HTTP ' + r.status + ' عند ' + what + (m ? ': ' + m : '');
}

/* ---------- بدء المهمّة ---------- */
async function startTask(input, opts) {
  const o = opts || {};
  const i = input && typeof input === 'object' ? input : {};
  const t = parseTarget({ url: String(i.repo || defaultRepo(o.env) || '').trim() });
  if (!t) return { error: 'حدّد المستودع بصيغة owner/repo.' };
  const task = String(i.task || '').replace(/\r/g, '').trim();
  if (task.length < 12) return { error: 'صف المهمّة بجملة واضحة (ماذا يتغيّر ولماذا وأين).' };
  if (task.length > 6000) return { error: 'المهمّة أطول من ٦٠٠٠ حرف — اختصرها أو قسّمها.' };
  const base = /^[A-Za-z0-9_.\/-]{1,100}$/.test(String(i.base || '')) ? String(i.base) : 'main';
  const now = Number(o.now) || Date.now();
  const branch = 'omran-agent/' + slug(task) + '-' + now.toString(36);
  const R = '/repos/' + t.owner + '/' + t.repo;

  const body = '**المهمّة:**\n' + task + '\n\n**الفرع:** `' + branch + '`\n**الأساس:** `' + base + '`\n\n— بدأها وكيل عمران من التطبيق بطلب المالك. التقدّم والنتيجة تُكتب هنا تعليقات، ثمّ يُفتح طلب سحب. الدمج والنشر بيد المالك.';
  const { r: ir, j: ij } = await ghJson(R + '/issues', Object.assign({}, o, { method: 'POST', body: { title: '🤖 مهمّة الوكيل: ' + task.split('\n')[0].slice(0, 90), body } }));
  if (!ir.ok || !ij || !ij.number) return { error: apiMsg(ir, ij, 'فتح مسألة المهمّة (يحتاج Issues: write)') };

  const { r: dr, j: dj } = await ghJson(R + '/actions/workflows/' + WORKFLOW + '/dispatches', Object.assign({}, o, { method: 'POST', body: { ref: base, inputs: { task, branch, issue: String(ij.number), base } } }));
  if (dr.status !== 204 && !dr.ok) {
    return { error: apiMsg(dr, dj, 'تشغيل الورك فلو ' + WORKFLOW + ' (يحتاج Actions: write، والملفّ موجود على ' + base + ')'), issue: ij.number, issueUrl: ij.html_url };
  }
  return { ok: true, repo: t.owner + '/' + t.repo, issue: ij.number, issueUrl: ij.html_url, branch, base, actionsUrl: 'https://github.com/' + t.owner + '/' + t.repo + '/actions/workflows/' + WORKFLOW };
}

function formatStart(res) {
  if (!res || res.error) {
    return '✗ لم تبدأ المهمّة: ' + ((res && res.error) || 'سبب غير معروف') + (res && res.issueUrl ? '\n(فُتحت المسألة ' + res.issueUrl + ' لكن الورك فلو لم يُشغَّل.)' : '');
  }
  return ['🚀 سُلّمت المهمّة إلى Claude Code في GitHub Actions على ' + res.repo + '.',
    'مسألة المهمّة #' + res.issue + ': ' + res.issueUrl,
    'الفرع الذي سيُدفع: ' + res.branch + ' (الأساس: ' + res.base + ')',
    'التشغيلات: ' + res.actionsUrl,
    'يستغرق التشغيل دقائق (قراءة، تعديل، npm run ci، دفع). لا يوجد طلب سحب بعد. قل للمستخدم ذلك وأعطه الروابط حرفًا بحرف، واطلب منه أن يسأل «شو صار» لاحقًا لتتحقّق بـcheck_code_task برقم المسألة ' + res.issue + '.'].join('\n');
}

/* ---------- التحقّق من المهمّة ---------- */
function parseStatuses(text) {
  const out = [];
  let m;
  STATUS_RE.lastIndex = 0;
  while ((m = STATUS_RE.exec(String(text || ''))) !== null) {
    try { out.push(JSON.parse(m[1])); } catch (e) { /* سطر حالة تالف — يُتجاهل */ }
  }
  return out;
}

async function checkTask(input, opts) {
  const o = opts || {};
  const i = input && typeof input === 'object' ? input : {};
  const t = parseTarget({ url: String(i.repo || defaultRepo(o.env) || '').trim() });
  if (!t) return { error: 'حدّد المستودع بصيغة owner/repo.' };
  const n = parseInt(i.issue, 10);
  if (!Number.isFinite(n) || n <= 0) return { error: 'حدّد رقم مسألة المهمّة.' };
  const R = '/repos/' + t.owner + '/' + t.repo;

  const { r: ir, j: ij } = await ghJson(R + '/issues/' + n, o);
  if (!ir.ok || !ij) return { error: apiMsg(ir, ij, 'مسألة المهمّة #' + n) };
  const bm = BRANCH_RE.exec(String(ij.body || ''));
  const sm = BASE_RE.exec(String(ij.body || ''));
  const branch = bm ? bm[1] : '';
  const base = sm ? sm[1] : 'main';
  const { r: cr, j: cj } = await ghJson(R + '/issues/' + n + '/comments?per_page=50', o);
  const comments = cr.ok && Array.isArray(cj) ? cj : [];
  const statuses = [];
  for (const c of comments) statuses.push(...parseStatuses(c && c.body));
  const last = statuses[statuses.length - 1] || null;
  const out = { ok: true, repo: t.owner + '/' + t.repo, issue: n, issueUrl: ij.html_url, title: String(ij.title || ''), branch, base, state: ij.state, status: last };

  if (!last) { out.phase = 'queued'; return out; }
  if (last.phase === 'start') { out.phase = 'running'; return out; }
  out.phase = 'done';
  if (!last.pushed) { out.phase = 'nochange'; return out; }

  // الفرع مدفوع → طلب السحب بمفتاح المالك (فحوص CI تعمل على طلب يفتحه هو لا Actions)
  const { r: pl, j: plj } = await ghJson(R + '/pulls?state=all&head=' + encodeURIComponent(t.owner + ':' + branch) + '&base=' + encodeURIComponent(base) + '&per_page=1', o);
  let pr = pl.ok && Array.isArray(plj) && plj.length ? plj[0] : null;
  if (!pr) {
    const title = String(ij.title || '').replace(/^🤖\s*مهمّة الوكيل:\s*/, '').slice(0, 200) || ('مهمّة الوكيل #' + n);
    const body = 'يغلق #' + n + '\n\n' + (last.ci === 'pass' ? '✅ npm run ci نجح داخل التشغيل.' : '⚠️ npm run ci فشل داخل التشغيل — راجع تعليقات المسألة.') + '\nالتشغيل: ' + (last.run_url || '') + '\n\n— نفّذها Claude Code في GitHub Actions بتفويض من وكيل عمران. المراجعة والدمج والنشر بيد المالك.';
    const { r: pc, j: pcj } = await ghJson(R + '/pulls', Object.assign({}, o, { method: 'POST', body: { title: (last.ci === 'pass' ? '' : '⚠️ ') + title, head: branch, base, body } }));
    if (pc.ok && pcj && pcj.html_url) pr = pcj; else out.prError = apiMsg(pc, pcj, 'فتح طلب السحب');
  }
  if (pr) {
    out.prUrl = pr.html_url; out.prNumber = pr.number; out.prState = pr.merged_at ? 'merged' : pr.state;
    const headSha = (pr.head && pr.head.sha) || last.sha;
    if (headSha) {
      const { r: kr, j: kj } = await ghJson(R + '/commits/' + headSha + '/check-runs?per_page=20', o);
      if (kr.ok && kj && Array.isArray(kj.check_runs)) out.checks = kj.check_runs.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion || null }));
    }
  }
  return out;
}

function formatCheck(res) {
  if (!res || res.error) return '✗ تعذّر التحقّق: ' + ((res && res.error) || 'سبب غير معروف');
  const head = 'المهمّة #' + res.issue + ' (' + res.issueUrl + ')';
  if (res.phase === 'queued') return head + '\n⏳ لم يبدأ التشغيل بعد (في الطابور أو الورك فلو غير مثبّت). أعد التحقّق بعد دقيقة، أو افتح صفحة التشغيلات.';
  if (res.phase === 'running') return head + '\n🏃 قيد التنفيذ: ' + (res.status && res.status.run_url ? res.status.run_url : '') + '\nالقراءة والتعديل وnpm run ci قد تأخذ دقائق. لا طلب سحب بعد — لا تدّعِ وجوده.';
  if (res.phase === 'nochange') return head + '\n⚠️ انتهى التشغيل بلا تغيير في الكود' + (res.status && res.status.claude && res.status.claude !== 'success' ? ' (خطوة Claude: ' + res.status.claude + ' — تحقّق من ANTHROPIC_API_KEY وتطبيق Claude على المستودع)' : '') + '. التفاصيل في تعليقات المسألة' + (res.status && res.status.run_url ? ': ' + res.status.run_url : '.');
  const lines = [head, '✅ الفرع مدفوع: ' + res.branch + (res.status && res.status.sha ? ' (' + short(res.status.sha) + ')' : ''), 'npm run ci داخل التشغيل: ' + (res.status && res.status.ci === 'pass' ? '✅ نجح' : '❌ فشل — راجع تعليقات المسألة')];
  if (res.prUrl) lines.push('طلب السحب #' + res.prNumber + (res.prState === 'merged' ? ' (مدموج)' : res.prState === 'closed' ? ' (مغلق)' : '') + ': ' + res.prUrl);
  else if (res.prError) lines.push('لم يُفتح طلب سحب: ' + res.prError + ' — الفرع مرفوع ويمكن فتحه يدويًّا.');
  if (Array.isArray(res.checks) && res.checks.length) {
    lines.push('فحوص الطلب: ' + res.checks.map((c) => c.name + ' ' + (c.status !== 'completed' ? '⏳' : c.conclusion === 'success' ? '✅' : c.conclusion === 'skipped' || c.conclusion === 'neutral' ? '➖' : '❌')).join(' · '));
  } else if (res.prUrl) lines.push('فحوص الطلب: لم تُسجَّل بعد.');
  lines.push('أعطِ المستخدم الروابط حرفًا بحرف. الدمج والنشر بيده لا بيدك.');
  return lines.join('\n');
}

/* ---------- تعريف الأداتين (للمالك وحده) ---------- */
const START_TOOL = {
  name: 'delegate_code_task',
  description: 'سلّم مهمّة كود على مستودع المالك إلى Claude Code داخل GitHub Actions (يقرأ المستودع كاملًا، يعدّل، يعيد بناء الحزمة، يشغّل npm run ci حتّى يمرّ، ويدفع فرعًا). للمالك وحده. تُستخدم للتغييرات الحقيقيّة (إصلاح، ميزة، إعادة هيكلة) التي تحتاج اختبارًا؛ لا للقراءة ولا للأسئلة. اكتب المهمّة كما تكتبها لمهندس زميل: ماذا يتغيّر ولماذا وأين (مسارات الملفّات) وما معيار النجاح. تعود فورًا برقم مسألة وروابط، والتنفيذ يأخذ دقائق — تحقّق لاحقًا بـcheck_code_task.',
  input_schema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'وصف المهمّة الكامل (بلا أسرار)' },
      base: { type: 'string', description: 'الفرع الأساس (الافتراضيّ main)' },
      repo: { type: 'string', description: 'owner/repo (الافتراضيّ مستودع التطبيق)' },
    },
    required: ['task'],
  },
};
const CHECK_TOOL = {
  name: 'check_code_task',
  description: 'تحقّق من حالة مهمّة سُلّمت بـdelegate_code_task برقم مسألتها: في الطابور، قيد التنفيذ، أو انتهت. عند اكتمال الدفع تفتح طلب السحب بمفتاح المالك (إن لم يكن مفتوحًا) وتعيد رابطه وحالة فحوصه. للمالك وحده.',
  input_schema: {
    type: 'object',
    properties: {
      issue: { type: 'integer', description: 'رقم مسألة المهمّة' },
      repo: { type: 'string', description: 'owner/repo (الافتراضيّ مستودع التطبيق)' },
    },
    required: ['issue'],
  },
};

module.exports = { startTask, checkTask, formatStart, formatCheck, parseStatuses, START_TOOL, CHECK_TOOL, WORKFLOW, defaultRepo, slug };
