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
const WORKFLOW_KIMI = 'kimi-agent.yml';
// v-kimi-agent: سطر الحالة قد يكون من أيّ الأخوين — omran-agent (Claude) أو kimi-agent (Kimi)
const STATUS_RE = /<!--\s*(?:omran|kimi)-agent\s+(\{[\s\S]*?\})\s*-->/g;
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
const SELF_ENGINE = { kimi: 'kimi', claude: 'claude' }; // v-self-only: المزوّد ← نسخته الوحيدة في Actions
const SELF_ONLY_REFUSAL = 'لا تفويض لمزوّد آخر — كلّ مزوّد يشتغل بنفسه. نفّذ الآن بأدواتك: read_github ثمّ edit_github، وما لا تقدر عليه بأدواتك قله للمالك في سطر.';
async function startTask(input, opts) {
  const o = opts || {};
  const i = input && typeof input === 'object' ? input : {};
  const t = parseTarget({ url: String(i.repo || defaultRepo(o.env) || '').trim() });
  if (!t) return { error: 'حدّد المستودع بصيغة owner/repo.' };
  const task = String(i.task || '').replace(/\r/g, '').trim();
  if (task.length < 12) return { error: 'صف المهمّة بجملة واضحة (ماذا يتغيّر ولماذا وأين).' };
  if (task.length > 6000) return { error: 'المهمّة أطول من ٦٠٠٠ حرف — اختصرها أو قسّمها.' };
  const base = /^[A-Za-z0-9_.\/-]{1,100}$/.test(String(i.base || '')) ? String(i.base) : 'main';
  // v-kimi-agent: engine=kimi يسلّم المهمّة إلى Kimi Code (kimi-agent.yml) بدل Claude Code
  /* v-self-only (المالك ١٤ أكتوبر: «كودي مايتدخّل — كل واحد بروحه»): من المحادثة (o.prov = مزوّد المالك المختار) لا تسليم إلّا
     لنسخة المزوّد نفسه في Actions: Kimi ← Kimi Code، وClaude ← Claude Code (موقوف كما في v-cc-off). مزوّد بلا نسخة كود ينفّذ بأدواته. */
  const self = o.prov ? (SELF_ENGINE[String(o.prov).toLowerCase()] || '') : null;
  if (self === '' || (self && i.engine && String(i.engine).toLowerCase() !== self)) return { error: SELF_ONLY_REFUSAL };
  const engine = self || (String(i.engine || '').toLowerCase() === 'kimi' ? 'kimi' : 'claude');
  /* v-cc-off (المالك ١٤ أكتوبر: «وقف كودي من اي شي»): تسليم المهمّة إلى Claude Code في Actions موقوف حتّى يضع المالك CODE_DELEGATE_ENABLED=on */
  if (engine === 'claude' && String((o.env || process.env).CODE_DELEGATE_ENABLED || '').trim().toLowerCase() !== 'on') return { error: 'كودي (Claude Code) موقوف بأمر المالك — لم تُفتح مهمّة ولم يُشغَّل شيء. اعمل التغيير بأدواتك أنت (edit_github/write_github)، ويعود التفويض فقط بـCODE_DELEGATE_ENABLED=on.' };
  const workflow = engine === 'kimi' ? WORKFLOW_KIMI : WORKFLOW;
  const now = Number(o.now) || Date.now();
  const branch = (engine === 'kimi' ? 'kimi-agent/' : 'omran-agent/') + slug(task) + '-' + now.toString(36);
  const R = '/repos/' + t.owner + '/' + t.repo;

  const body = '**المهمّة:**\n' + task + '\n\n**الفرع:** `' + branch + '`\n**الأساس:** `' + base + '`\n\n— بدأها وكيل عمران من التطبيق بطلب المالك. التقدّم والنتيجة تُكتب هنا تعليقات، ثمّ يُفتح طلب سحب. الدمج والنشر بيد المالك.';
  const { r: ir, j: ij } = await ghJson(R + '/issues', Object.assign({}, o, { method: 'POST', body: { title: '🤖 مهمّة الوكيل: ' + task.split('\n')[0].slice(0, 90), body } }));
  if (!ir.ok || !ij || !ij.number) return { error: apiMsg(ir, ij, 'فتح مسألة المهمّة (يحتاج Issues: write)') };

  // v-agent-parity: نموذج مختار من القائمة نفسها التي في الإعدادات؛ خارجها = افتراضيّ الورك فلو (Fable 5.1)
  const modelIds = engine === 'kimi' ? KIMI_MODEL_IDS : CLAUDE_MODEL_IDS;
  const model = modelIds.includes(String(i.model || '').trim()) ? String(i.model).trim() : '';
  const { r: dr, j: dj } = await ghJson(R + '/actions/workflows/' + workflow + '/dispatches', Object.assign({}, o, { method: 'POST', body: { ref: base, inputs: Object.assign({ task, branch, issue: String(ij.number), base }, model ? { model } : {}) } }));
  if (dr.status !== 204 && !dr.ok) {
    return { error: apiMsg(dr, dj, 'تشغيل الورك فلو ' + workflow + ' (يحتاج Actions: write، والملفّ موجود على ' + base + ')'), issue: ij.number, issueUrl: ij.html_url };
  }
  return { ok: true, repo: t.owner + '/' + t.repo, issue: ij.number, issueUrl: ij.html_url, branch, base, engine, actionsUrl: 'https://github.com/' + t.owner + '/' + t.repo + '/actions/workflows/' + workflow };
}

function formatStart(res) {
  if (!res || res.error) {
    return '✗ لم تبدأ المهمّة: ' + ((res && res.error) || 'سبب غير معروف') + (res && res.issueUrl ? '\n(فُتحت المسألة ' + res.issueUrl + ' لكن الورك فلو لم يُشغَّل.)' : '');
  }
  const who = (res && res.engine === 'kimi') ? 'Kimi Code' : 'Claude Code';
  return ['🚀 سُلّمت المهمّة إلى ' + who + ' في GitHub Actions على ' + res.repo + '.',
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
  if (res.phase === 'nochange') {
    const st = res.status || {};
    const err = String(st.error || '').trim(); // v-agent-report: سبب الفشل من الورك فلو (فحص المفتاح أو ملفّ تنفيذ Claude)
    return head + '\n⚠️ انتهى التشغيل بلا تغيير في الكود' + (st.claude && st.claude !== 'success' ? ' (خطوة Claude: ' + st.claude + (err ? '' : ' — تحقّق من ANTHROPIC_API_KEY وتطبيق Claude على المستودع') + ')' : '') + '.' + (err ? '\nالسبب: ' + err.slice(0, 300) : '') + '\nالتفاصيل في تعليقات المسألة' + (st.run_url ? ': ' + st.run_url : '.');
  }
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
/* v-kimi-k3-delegate (فحص المزوّدين ١٥ أكتوبر): Moonshot أوقف kimi-k2.5 (٣١ أغسطس ٢٠٢٦، 404) وسلسلة kimi-k2 (٢٥ مايو)،
   وkimi-for-coding موديل اشتراك Kimi Code على api.kimi.com/coding لا على api.moonshot.ai الذي يناديه الورك فلو — فكلّ تفويض
   بالافتراضيّ كان يسقط. الحيّة على المنصّة المفتوحة: kimi-k3 (الافتراضيّ) وkimi-k2.7-code للكود الأرخص وkimi-k2.6. */
const KIMI_MODEL_IDS = ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'];
const CLAUDE_MODEL_IDS = ['claude-fable-5-1', 'claude-fable-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
/* v-code-not-primary (المالك ١١ أكتوبر: «الفاتورة كلّها راحت في كودي… خلّه صلاحيّات بس ما يكون الأساسيّ»): التسليم إلى
   Claude Code يشغّل تشغيلًا كاملًا في GitHub Actions على رصيد Anthropic، والمزوّدون كانوا يفوّضون من أنفسهم حتّى إصلاحًا صغيرًا.
   الأداة باقية، لكنّ الخادم لا ينفّذها إلّا إذا سمّاه المالك في رسالته الأخيرة («كودي» مع فعل تسليم، أو «Claude Code»، أو
   «فوّض») — كحارس «ادمج». «كودي» وحدها قد تعني «الكود حقّي»، فلا تكفي بلا فعل تسليم. النفي («لا تفوّض»، «بدون كودي») يُسقطه. */
const ASK_CODE_NEG_RE = /(?:^|[\s،.,!؟?])(?:لا|ما|مو|بدون|بلاش|بلا)\s*(?:ت|ن)?(?:فوّ?ض|سلّ?م|عط|حوّ?ل|تدخّ?ل|يتدخّ?ل)?\S*\s*(?:ل|ال)?(?:كودي|claude\s*code|كلو?ا?د\s*كود)|don'?t\s+delegate|do\s+not\s+delegate/i;
const ASK_CODE_RE = /claude\s*code|كلاود\s*كود|كلود\s*كود|(?:^|[\s،.,!؟?«])(?:فوّ?ض|delegate)|(?:خلّ?|خلّ?ي|عط|اعط|أعط|سلّ?م|حوّ?ل|ارسل|أرسل|ودّ?)(?:ها|ه|يها|يه)?\s+(?:\S+\s+){0,2}(?:ل|ال)?كودي|كودي\s+ي\S*(?:ها|ه)(?=$|[\s،.,!؟?])/i;
function ownerAsksCode(text) {
  const s = String(text || '');
  if (ASK_CODE_NEG_RE.test(s)) return false;
  return ASK_CODE_RE.test(s);
}
const DELEGATE_REFUSAL = '✗ لا تفويض: أنت المنفّذ. نفّذ الآن: read_github ثمّ edit_github (الحزمة تُبنى تلقائيًّا في الالتزام نفسه)، وما لا تقدر عليه بأدواتك قله للمالك في سطر وهو يقرّر.'; // v-self-only: بلا عبارات تعلّم المزوّد كيف يطلب من المالك تسليمه لغيره

const START_TOOL = {
  name: 'delegate_code_task',
  description: 'ليست طريقك الأساسيّ: استدعها فقط إذا طلب المالك في رسالته الأخيرة «فوّض» — وإلّا يرفضها الخادم؛ التعديلات تعملها أنت بـread_github ثمّ edit_github. تسلّم مهمّة كود على مستودع المالك إلى نسختك أنت داخل GitHub Actions وحدها (Kimi ← Kimi Code؛ Claude ← Claude Code وهو موقوف ما لم يفعّله المالك) — لا لمزوّد آخر (v-self-only): تقرأ المستودع كاملًا، تعدّل، تعيد بناء الحزمة، تشغّل npm run ci حتّى يمرّ، وتدفع فرعًا. للمالك وحده؛ لا للقراءة ولا للأسئلة. اكتب المهمّة كما تكتبها لمهندس زميل: ماذا يتغيّر ولماذا وأين (مسارات الملفّات) وما معيار النجاح. تعود فورًا برقم مسألة وروابط، والتنفيذ يأخذ دقائق — تحقّق لاحقًا بـcheck_code_task.',
  input_schema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'وصف المهمّة الكامل (بلا أسرار)' },
      engine: { type: 'string', enum: ['claude', 'kimi'], description: 'نسختك أنت في Actions وحدها (v-self-only): kimi لـKimi (Kimi Code، يحتاج KIMI_API_KEY في أسرار المستودع)، وclaude لـClaude (Claude Code — موقوف ما لم يفعّله المالك). لا تفويض لمزوّد آخر' },
      model: { type: 'string', description: 'نموذج المهمّة: من موديلات Claude لـengine=claude (الافتراضيّ Sonnet 5) أو موديلات Kimi لـengine=kimi (الافتراضيّ kimi-k3؛ للكود الأرخص kimi-k2.7-code)' },
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

module.exports = { ownerAsksCode, DELEGATE_REFUSAL, SELF_ONLY_REFUSAL, SELF_ENGINE, startTask, checkTask, formatStart, formatCheck, parseStatuses, START_TOOL, CHECK_TOOL, WORKFLOW, WORKFLOW_KIMI, KIMI_MODEL_IDS, defaultRepo, slug };