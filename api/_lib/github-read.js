// api/_lib/github-read.js — v-agent-github: قراءة GitHub عبر واجهته الرسميّة (api.github.com).
//
// يخدم أداة الوكيل read_github ومحلّل الكود (رابط مستودع → أرشيف zipball). لا يفتح
// صفحات HTML (JavaScript ثقيل ومحتوى مبتور) بل يسأل الواجهة: مستودع (وصف + شجرة +
// README)، مجلّد، ملفّ بأسطر مرقّمة ومقطّع (ناتج الأداة يُقصّ عند ٨ آلاف حرف فيعود
// الملفّ الطويل على دفعات بـfrom)، طلب سحب (وصف + ملفّاته)، ومسألة (نصّ + تعليقات).
// المضيف ثابت — لا رابط من النموذج يُفتح كما هو — والطلبات تمرّ بحارس safe-url.
// GITHUB_TOKEN اختياريّ: يرفع حدّ الطلبات (٦٠/ساعة بلا مفتاح) ويفتح المستودعات الخاصّة.
// v-secret-vault: المفتاح من البيئة أو من خزنة الأسرار المشفّرة (secrets.js) — لا من المحادثة أبدًا.
// v-secret-vault: kind=commits (رابط /commits أو what=commits) = آخر الدفعات على الفرع.
'use strict';

const { fetchPublicUrl } = require('./safe-url.js');
const zipLib = require('./analyze-zip.js');

const API = 'https://api.github.com';
const CHUNK = 7000;             // حروف الملفّ في الاستدعاء الواحد
const TREE_MAX = 300;           // مدخلات الشجرة المعروضة
const FILE_MAX = 1500000;       // بايت — فوقه لا يُقرأ الملفّ
const README_MAX = 2500;        // حروف README المعروضة في نظرة المستودع
/* v-claude-deep-github (طلب المالك: «كلود ٥ يقرا الجيت هب نفسك بالضبط»): قراءة أعمق
   (أسطر أكثر بالدفعة الواحدة، شجرة أوسع، README أطول، ملفّات أكبر).
   v-github-all-providers (٢٩ سبتمبر): لم تبقَ حصرًا على كلود — `opts.deep` يُرسل الآن لكلّ
   مزوّد في المحادثة والوكيل، والحصر صار على الطالب لا على المزوّد: المالك وحده. */
const DEEP_CHUNK = 48000; // v-deep-read (المالك ١٥ أكتوبر «أوصلهم لمستوى كودي»): كان ٢٤ ألفًا فيقرأ المزوّد نصف الملفّ ويحكم؛ الآن ~٨٠٠ سطر في النداء (سقف ناتج الأداة ٦٠ ألفًا في chat.js وagent.js)
const DEEP_TREE_MAX = 900;
const DEEP_FILE_MAX = 4000000;
const DEEP_README_MAX = 7000;
const ZIP_MAX = 8 * 1024 * 1024;
const NAME_RE = /^[A-Za-z0-9_.-]+$/;

/* ---------- فهم الهدف ---------- */
function parseTarget(input) {
  const o = input && typeof input === 'object' ? input : { url: input };
  const raw = String(o.url || o.repo || '').trim();
  let path = String(o.path || '').trim().replace(/^\/+|\/+$/g, '');
  let ref = String(o.ref || '').trim();
  let owner = '', repo = '', kind = null, number = null, m;
  if ((m = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i.exec(raw))) {
    owner = m[1]; repo = m[2]; ref = ref || m[3]; path = decodeURIComponent(m[4]); kind = 'file';
  } else if ((m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/#?]+)\/([^/#?]+)(?:\/(.*))?$/i.exec(raw))) {
    owner = m[1]; repo = m[2].replace(/\.git$/, '');
    const rest = (m[3] || '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    const seg = rest ? rest.split('/').map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } }) : [];
    if (!seg.length) kind = path ? 'path' : 'repo';
    else if ((seg[0] === 'tree' || seg[0] === 'blob') && seg.length >= 2) {
      ref = ref || seg[1]; path = path || seg.slice(2).join('/');
      kind = seg[0] === 'blob' ? 'file' : (path ? 'dir' : 'repo');
    } else if ((seg[0] === 'pull' || seg[0] === 'pulls') && /^\d+$/.test(seg[1] || '')) { kind = 'pr'; number = Number(seg[1]); }
    else if (seg[0] === 'issues' && /^\d+$/.test(seg[1] || '')) { kind = 'issue'; number = Number(seg[1]); }
    else if (seg[0] === 'commits') { kind = 'commits'; ref = ref || (seg[1] || ''); path = path || seg.slice(2).join('/'); } // v-secret-vault: آخر الدفعات
    else if (seg[0] === 'commit' && seg[1]) { kind = 'commit'; ref = ref || seg[1]; } // v-agent-deep: التزام واحد بفرقه
    else kind = path ? 'path' : 'repo';
  } else if ((m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.*))?$/.exec(raw))) {
    owner = m[1]; repo = m[2].replace(/\.git$/, '');
    if (m[3] && !path) path = m[3].replace(/\/+$/, '');
    kind = path ? 'path' : 'repo';
  } else return null;
  if (!NAME_RE.test(owner) || !NAME_RE.test(repo) || owner === '.' || owner === '..') return null;
  if (path && /(^|\/)\.\.(\/|$)/.test(path)) return null;
  if (ref && !/^[A-Za-z0-9_.\/-]{1,200}$/.test(ref)) return null;
  if (String(o.what || '').toLowerCase() === 'commits') kind = 'commits'; // v-secret-vault: what=commits
  if (String(o.what || '').toLowerCase() === 'commit' && ref) kind = 'commit'; // v-agent-deep: التزام واحد (ref = sha)
  const from = parseInt(o.from, 10);
  return { owner, repo, ref, path, kind, number, from: Number.isFinite(from) && from > 1 ? from : 1 };
}

/* ---------- المفتاح ---------- */
/* v-secret-vault: البيئة أوّلًا (GITHUB_TOKEN) ثمّ خزنة الأسرار المشفّرة التي يحفظها المالك
   من الإعدادات. opts.env صريح (الاختبارات والفحص) = البيئة المعطاة وحدها بلا خزنة. */
async function resolveGithubToken(opts) {
  const o = opts || {};
  if (o.anonymous) return ''; // v-owner-token: قارئ غير المالك بلا مفتاح — العامّ فقط
  const env = o.env || process.env;
  const fromEnv = env.GITHUB_TOKEN ? String(env.GITHUB_TOKEN).trim() : '';
  if (fromEnv) return fromEnv;
  if (o.env) return '';
  try { return String((await require('./secrets.js').getSecret('github_token')) || '').trim(); } catch (e) { return ''; }
}

/* ---------- الطلب ---------- */
async function ghFetch(pathname, opts) {
  const o = opts || {};
  const headers = {
    'Accept': o.textMatch ? 'application/vnd.github.text-match+json' : (o.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json'),
    'User-Agent': 'OmranAgent/1.0 (+https://omran-ai-builder.vercel.app)',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = await resolveGithubToken(o);
  if (token) headers.Authorization = 'Bearer ' + token;
  const init = { headers, signal: undefined };
  if (o.method) init.method = o.method;
  if (o.body !== undefined) { init.body = JSON.stringify(o.body); headers['Content-Type'] = 'application/json'; }
  const ctrl = new AbortController();
  init.signal = ctrl.signal;
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs || 15000);
  try {
    return await fetchPublicUrl(API + pathname, init, { fetchFn: o.fetchImpl, lookup: o.lookup, maxRedirects: 3 });
  } finally { clearTimeout(timer); }
}

function ghError(r, what, env, anon) {
  const e = env || process.env;
  if (anon) { /* v-owner-token: غير المالك — لا إرشاد إلى خزنة لا يملكها */
    if (r.status === 404) return 'غير موجود أو خاصّ: ' + what + ' (المستودعات الخاصّة غير متاحة هنا).';
    if (r.status === 403 || r.status === 429) return 'GitHub رفض الطلب (حدّ الطلبات للقراءة بلا مفتاح). أعد المحاولة لاحقًا.';
  }
  if (r.status === 404) return 'غير موجود أو خاصّ: ' + what + (e.GITHUB_TOKEN ? '' : ' (المستودعات الخاصّة تحتاج مفتاح GitHub: خزنة الأسرار في الإعدادات أو GITHUB_TOKEN في البيئة)');
  if (r.status === 403 || r.status === 429) return 'GitHub رفض الطلب (حدّ الطلبات أو الصلاحيّات). أضف مفتاح GitHub (خزنة الأسرار في الإعدادات أو GITHUB_TOKEN في البيئة) لرفع الحدّ من ٦٠ إلى ٥٠٠٠ طلب في الساعة.';
  if (r.status === 401) return 'مفتاح GitHub غير صالح (الخزنة أو GITHUB_TOKEN).';
  return 'GitHub HTTP ' + r.status + ' عند ' + what;
}

const encPath = (p) => String(p || '').split('/').map(encodeURIComponent).join('/');
const repoOf = (t) => t.owner + '/' + t.repo;
const b = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : n >= 1024 ? Math.round(n / 1024) + 'KB' : n + 'B');

/* ---------- الملفّ: أسطر مرقّمة على دفعات ---------- */
function formatFile(name, ref, content, from, deep) {
  const text = String(content || '');
  if (text.indexOf(String.fromCharCode(0)) !== -1) return '📄 ' + name + ' — ملفّ ثنائيّ (' + b(text.length) + ')، لا يُقرأ نصًّا.';
  const lines = text.split('\n');
  const total = lines.length;
  const chunk = deep ? DEEP_CHUNK : CHUNK;
  let start = Math.max(1, Math.min(parseInt(from, 10) || 1, total));
  let acc = '', i = start - 1;
  for (; i < total; i++) {
    const ln = (i + 1) + '| ' + lines[i] + '\n';
    if (acc.length + ln.length > chunk && acc) break;
    acc += ln;
  }
  const end = i;
  return '📄 ' + name + (ref ? ' (' + ref + ')' : '') + ' · ' + total + ' سطر · الأسطر ' + start + '–' + end + '\n' + acc
    + (end < total ? '… يتبع من السطر ' + (end + 1) + ' — استدعِ الأداة نفسها مع from=' + (end + 1) + ' لقراءة التتمّة.' : '[نهاية الملفّ]');
}

/* v-read-panel (المالك ١٣ أكتوبر: «لوحة الكود + الأرقام»): ناتج formatFile مقطعًا منظّمًا للوحة «الكود المقروء» في الواجهة.
   formatFile يكتب اسم الملفّ وحده، فالمسار من المُدخل نفسه (parseTarget)، والأسطر كما قُرئت بأرقامها المتتالية.
   غير الملفّ (مجلّد، بحث، فشل، ثنائيّ) = null. السقف حروف الدفعة العميقة نفسها فلا يتجاوز ما قرأه المزوّد. */
const EXCERPT_HEAD_RE = /^📄 (.+?)(?: \(([^)\n]*)\))? · (\d+) سطر · الأسطر (\d+)–(\d+)\n/;
const EXCERPT_LINE_RE = /^(\d+)\| (.*)$/;
function fileExcerpt(input, result) {
  const r = String(result == null ? '' : result);
  const h = EXCERPT_HEAD_RE.exec(r);
  if (!h) return null;
  const t = parseTarget(input);
  const a = Number(h[4]);
  const l = [];
  let used = 0;
  const body = r.slice(h[0].length).split('\n');
  for (let i = 0; i < body.length; i++) {
    const m = EXCERPT_LINE_RE.exec(body[i]);
    if (!m || Number(m[1]) !== a + l.length || used + m[2].length > DEEP_CHUNK) break;
    used += m[2].length + 1;
    l.push(m[2]);
  }
  if (!l.length) return null;
  return { p: String((t && t.path) || h[1]).slice(0, 300), r: String(h[2] || '').slice(0, 80), a, b: a + l.length - 1, n: Number(h[3]), l };
}

/* ---------- المحتويات (ملفّ أو مجلّد) ---------- */
async function getContents(t, o) {
  const q = t.ref ? '?ref=' + encodeURIComponent(t.ref) : '';
  const r = await ghFetch('/repos/' + repoOf(t) + '/contents/' + encPath(t.path) + q, o);
  if (!r.ok) return { error: ghError(r, repoOf(t) + '/' + t.path, o && o.env, o && o.anonymous) };
  const j = await r.json();
  if (Array.isArray(j)) return { type: 'dir', entries: j };
  if (j && j.type === 'file') {
    const fileMax = (o && o.deep) ? DEEP_FILE_MAX : FILE_MAX;
    if (Number(j.size) > fileMax) return { error: 'الملفّ أكبر من ' + b(fileMax) + ' — اختر ملفًّا أصغر.' };
    let content = '';
    if (j.encoding === 'base64' && typeof j.content === 'string') content = Buffer.from(j.content.replace(/\n/g, ''), 'base64').toString('utf8');
    else {
      const rr = await ghFetch('/repos/' + repoOf(t) + '/contents/' + encPath(t.path) + q, Object.assign({}, o, { raw: true }));
      if (!rr.ok) return { error: ghError(rr, t.path, o && o.env, o && o.anonymous) };
      content = await rr.text();
    }
    return { type: 'file', content, size: Number(j.size) || content.length, name: j.path || t.path };
  }
  if (j && (j.type === 'symlink' || j.type === 'submodule')) return { error: t.path + ' ' + (j.type === 'symlink' ? 'وصلة رمزيّة' : 'وحدة فرعيّة') + ' — افتح هدفها مباشرةً.' };
  return { error: 'ردّ غير مفهوم من GitHub.' };
}

function formatDir(t, entries, deep) {
  const treeMax = deep ? DEEP_TREE_MAX : TREE_MAX;
  const rows = entries.slice(0, treeMax).map((e) => '- ' + e.name + (e.type === 'dir' ? '/' : ' (' + b(Number(e.size) || 0) + ')'));
  return '📁 ' + repoOf(t) + '/' + t.path + (t.ref ? ' (' + t.ref + ')' : '') + ' · ' + entries.length + ' مدخلة\n' + rows.join('\n')
    + (entries.length > treeMax ? '\n… و' + (entries.length - treeMax) + ' أخرى' : '');
}

/* ---------- المستودع: وصف + شجرة + README ---------- */
async function readRepo(t, o) {
  const r = await ghFetch('/repos/' + repoOf(t), o);
  if (!r.ok) return ghError(r, repoOf(t), o && o.env, o && o.anonymous);
  const j = await r.json();
  const ref = t.ref || j.default_branch || 'main';
  const out = ['📦 ' + (j.full_name || repoOf(t)) + (j.description ? ' — ' + j.description : ''),
    'اللغة: ' + (j.language || '؟') + ' · نجوم: ' + (j.stargazers_count || 0) + ' · الفرع: ' + ref + (j.pushed_at ? ' · آخر دفع: ' + String(j.pushed_at).slice(0, 10) : '') + (j.private ? ' · خاصّ' : '')];
  const treeMax = (o && o.deep) ? DEEP_TREE_MAX : TREE_MAX;
  const readmeMax = (o && o.deep) ? DEEP_README_MAX : README_MAX;
  const tr = await ghFetch('/repos/' + repoOf(t) + '/git/trees/' + encodeURIComponent(ref) + '?recursive=1', o);
  if (tr.ok) {
    const tj = await tr.json();
    const blobs = (tj.tree || []).filter((e) => e.type === 'blob' && !zipLib.SKIP_DIR_PATTERNS.some((p) => p.test(e.path)));
    out.push('\nالملفّات (' + blobs.length + (tj.truncated ? '+' : '') + '):');
    out.push(blobs.slice(0, treeMax).map((e) => '- ' + e.path + ' (' + b(Number(e.size) || 0) + ')').join('\n'));
    if (blobs.length > treeMax) out.push('… و' + (blobs.length - treeMax) + ' ملفًّا آخر');
  } else out.push('\n(تعذّرت قراءة الشجرة: ' + ghError(tr, 'الشجرة', o && o.env, o && o.anonymous) + ')');
  const rd = await ghFetch('/repos/' + repoOf(t) + '/readme?ref=' + encodeURIComponent(ref), Object.assign({}, o, { raw: true }));
  if (rd.ok) { const txt = await rd.text(); out.push('\nREADME:\n' + txt.slice(0, readmeMax) + (txt.length > readmeMax ? '\n…' : '')); }
  out.push('\nلقراءة ملفّ: استدعِ read_github برابطه (blob) أو بـ' + repoOf(t) + ' مع path.');
  return out.join('\n');
}

/* ---------- طلب سحب ومسألة ---------- */
async function readPR(t, o) {
  const r = await ghFetch('/repos/' + repoOf(t) + '/pulls/' + t.number, o);
  if (!r.ok) return ghError(r, repoOf(t) + '#' + t.number, o && o.env, o && o.anonymous);
  const j = await r.json();
  const head = j.head || {}, base = j.base || {};
  const out = ['🔀 PR #' + j.number + ': ' + (j.title || '') + ' — ' + (j.merged ? 'مدموج' : j.state) + ' · ' + ((j.user && j.user.login) || '؟'),
    'من ' + ((head.repo && head.repo.full_name) || '') + ':' + (head.ref || '') + ' إلى ' + (base.ref || '') + ' · +' + (j.additions || 0) + '/−' + (j.deletions || 0) + ' في ' + (j.changed_files || 0) + ' ملفًّا' + (j.mergeable_state ? ' · ' + j.mergeable_state : ''),
    j.body ? '\n' + String(j.body).slice(0, 2500) : ''];
  const fr = await ghFetch('/repos/' + repoOf(t) + '/pulls/' + t.number + '/files?per_page=' + ((o && o.deep) ? 100 : 60), o);
  if (fr.ok) {
    const files = await fr.json();
    const list = Array.isArray(files) ? files : [];
    out.push('\nالملفّات المتغيّرة:');
    out.push(list.map((f) => '- ' + f.filename + ' (' + f.status + ' +' + (f.additions || 0) + '/−' + (f.deletions || 0) + ')').join('\n'));
    const diff = formatPatches(list, o && o.deep); // v-agent-deep: الفرق نفسه لا أسماء الملفّات وحدها
    if (diff) out.push(diff);
    if (head.ref) out.push('\nلقراءة ملفّ منها: read_github برابط blob على الفرع ' + head.ref + (head.repo && head.repo.full_name ? ' في ' + head.repo.full_name : '') + '.');
  }
  return out.join('\n');
}

async function readIssue(t, o) {
  const r = await ghFetch('/repos/' + repoOf(t) + '/issues/' + t.number, o);
  if (!r.ok) return ghError(r, repoOf(t) + '#' + t.number, o && o.env, o && o.anonymous);
  const j = await r.json();
  const labels = (j.labels || []).map((l) => (l && l.name) || '').filter(Boolean);
  const out = ['🐛 Issue #' + j.number + ': ' + (j.title || '') + ' — ' + j.state + ' · ' + ((j.user && j.user.login) || '؟') + (labels.length ? ' · ' + labels.join(', ') : ''),
    j.body ? '\n' + String(j.body).slice(0, 3000) : '(بلا نصّ)'];
  if (Number(j.comments) > 0) {
    const cr = await ghFetch('/repos/' + repoOf(t) + '/issues/' + t.number + '/comments?per_page=10', o);
    if (cr.ok) {
      const cs = await cr.json();
      out.push('\nالتعليقات (' + j.comments + '):');
      out.push((Array.isArray(cs) ? cs : []).map((c) => '— ' + ((c.user && c.user.login) || '؟') + ': ' + String(c.body || '').replace(/\s+/g, ' ').slice(0, 600)).join('\n'));
    }
  }
  return out.join('\n');
}

/* ---------- بحث نصّي حقيقيّ في محتوى الملفّات، محصور بمسار (v-github-code-search-2) ----------
   لقطة المالك: بحث GitHub الرسميّ (/search/code) رجع «لا نتائج» لـomranAgentTools رغم وجوده فعلًا في
   app-17-agent-tools.js — فهرسه (نسخة GitHub القديمة، لا محرّك الموقع الجديد) ناقص التغطية بإثبات حيّ،
   لا نظريّ. البديل «نزّل المستودع كلّه واغرب محليًّا» (نفس أسلوب fetchRepoZip) فُحص وفشل: أرشيف هذا
   المستودع ١٣٧م.ب (وسائط كبيرة غير مستخدمة تبقى — قرار مالك) مقابل ZIP_MAX ٨م.ب، فلا ينزل أصلًا.
   الحلّ العمليّ: شجرة الملفّات الكاملة نداء واحد رخيص (بلا محتوى)، ثمّ قراءة محتوى كلّ ملفّ **تحت
   المسار المطلوب فقط** بنداءات متوازية محدودة (لا حدّ جسم كنزول المستودع، فقط عدد ملفّات المسار —
   api/_lib مثلًا ١٦٢ ملفًّا، tests ١٩٨ — كلاهما دون السقف). مطابقة حرفيّة حسّاسة لحالة الأحرف، تمامًا
   كـGrep — موثوقة بلا فهرسة خارجيّة قد تتخلّف. */
/* v-deep-search (المالك ١٥ أكتوبر «يتعمّقون في تحليل الأكواد»): سطر المطابقة وحده لا يكفي للحكم — مع كلّ مطابقة في ملفّ JS
   رأس الدالّة الحاوية (بمطابقة الأقواس من الرأس حتّى يعود العمق صفرًا؛ ٣٠٠ سطر رجوعًا)، ولمعرّفٍ عدّ المستدعين في كلّ ملفّ معروض.
   من النصّ المجلوب نفسه — بلا نداء شبكة إضافيّ. */
const JS_FILE_RE = /\.(?:c|m)?js$|\.ts$/i;
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
const FN_HEAD_RE = /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*[\w$]+\s*\(|^\s*(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)|^\s*(?:async\s+)?(?:static\s+)?(?!(?:if|for|while|switch|catch|with|return|else|do|try|function)\b)[\w$]+\s*\([^)]*\)\s*\{\s*$|^\s*[\w$'"]+\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/;
const ENCLOSE_LOOKBACK = 300;
const STR_RE = /(["'`])(?:\\.|(?!\1).)*\1/g;
function enclosingHead(lines, li) {
  for (let h = li - 1, back = 0; h >= 0 && back < ENCLOSE_LOOKBACK; h--, back++) {
    if (!FN_HEAD_RE.test(lines[h])) continue;
    let depth = 0, opened = false, closedAt = -1;
    for (let k = h; k < lines.length && k - h < 6000; k++) {
      const t = lines[k].replace(STR_RE, '""').replace(/\/\/.*$/, '');
      for (const ch of t) { if (ch === '{') { depth++; opened = true; } else if (ch === '}') depth--; }
      if (k === h && !opened) break; // سطر رأس بلا قوس فتح (سهم بتعبير واحد) ليس جسمًا يحوي شيئًا
      if (opened && depth <= 0) { closedAt = k; break; }
    }
    if (closedAt >= li) return { n: h + 1, text: lines[h] };
  }
  return null;
}
const SEARCH_MAX_FILES = 400;   // أكثر من api/_lib (١٦٢) وtests (١٩٨) بمريح؛ أكبر يُطلب تضييق المسار
const SEARCH_MAX_FILES_DEEP = 700;
const SEARCH_CONCURRENCY = 15;  // نداءات متوازية — لا تُغرق GitHub ولا الدالّة
const SEARCH_FILE_BYTES_MAX = 800000; // فوقه ليس كودًا منطقيًّا (صورة/بيانات) — يُتخطّى بلا تنزيله
/* v-claude-code-level (A2): كان ٤٠٠ ألف بايت فسقط js/app-09-attach.js (~٦٨٠ ألفًا، قلب الإرسال) من كلّ بحث —
   «__sendPromptCore» يرجع «لا نتائج» وهو موجود. ٨٠٠ ألف لا ١٫٥ مليون: المكتبات المصغّرة تأكل مهلة البحث،
   فالمولَّد والمصغَّر (js/vendor، *.min.js، الحزمة) يُتخطّى إلّا إن كان مسار البحث نفسه داخله. */
const SEARCH_SKIP_RE = /^js\/vendor\/|\.min\.js$|^js\/app\.bundle\.js$/;
const SEARCH_BUDGET_MS = 25000;

async function resolveDefaultRef(t, o) {
  if (t.ref) return t.ref;
  const r = await ghFetch('/repos/' + repoOf(t), o);
  if (!r.ok) return 'main';
  const j = await r.json().catch(() => ({}));
  return j.default_branch || 'main';
}

async function readContentSearch(t, o, query, limit) {
  const deep = !!(o && o.deep);
  const n = Math.max(1, Math.min(deep ? 40 : 15, parseInt(limit, 10) || (deep ? 40 : 15)));
  const ref = await resolveDefaultRef(t, o);
  const tr = await ghFetch('/repos/' + repoOf(t) + '/git/trees/' + encodeURIComponent(ref) + '?recursive=1', o);
  if (!tr.ok) return ghError(tr, 'شجرة ' + repoOf(t), o && o.env, o && o.anonymous);
  const tj = await tr.json().catch(() => ({}));
  const prefix = t.path.replace(/\/+$/, '') + '/';
  const askedSkipped = SEARCH_SKIP_RE.test(prefix) || SEARCH_SKIP_RE.test(t.path); // طلب المصغَّر صراحةً
  const inScope = (tj.tree || []).filter((e) => e.type === 'blob' && (e.path + '/').indexOf(prefix) === 0
    && Number(e.size) > 0 && Number(e.size) <= SEARCH_FILE_BYTES_MAX
    && !zipLib.SKIP_DIR_PATTERNS.some((p) => p.test(e.path)));
  const candidates = askedSkipped ? inScope : inScope.filter((e) => !SEARCH_SKIP_RE.test(e.path));
  // المتخطّى يُذكر صراحةً: «لا نتائج» لا تعني أنّ الرمز غير موجود في ملفّ مصغّر/مولَّد لم يُبحث
  const skipped = inScope.length - candidates.length;
  const skipNote = skipped ? '\n— تخطّيت ' + skipped + ' ملفًّا مصغّرًا/مولَّدًا (js/vendor، *.min.js، الحزمة)؛ للبحث فيه مرّر path داخله (مثل js/vendor).' : '';
  if (!candidates.length) return 'لا ملفّات كود تحت ' + repoOf(t) + '/' + t.path + ' (أو المسار غير موجود على ' + ref + ').' + skipNote;
  const cap = deep ? SEARCH_MAX_FILES_DEEP : SEARCH_MAX_FILES;
  if (candidates.length > cap) return 'المسار ' + t.path + ' فيه ' + candidates.length + ' ملفًّا — أكثر من حدّ البحث الواحد (' + cap + '). ضيّق المسار لمجلّد أصغر داخله.';

  const deadline = Date.now() + SEARCH_BUDGET_MS;
  const hits = [];
  let cursor = 0;
  const ident = IDENT_RE.test(query); // v-deep-search: معرّف ← عدّ المستدعين في كلّ ملفّ معروض
  const callRe = ident ? new RegExp('(?<![\\w$])' + query.replace(/\$/g, '\\$') + '\\s*\\(') : null;
  const defRe = ident ? new RegExp('function\\s*\\*?\\s*' + query.replace(/\$/g, '\\$') + '\\s*\\(|(?:const|let|var)\\s+' + query.replace(/\$/g, '\\$') + '\\s*=|^\\s*' + query.replace(/\$/g, '\\$') + '\\s*[:=](?!=)') : null; // تعريف: function q( · const q = · q: / q = — لا نداء q( في أوّل السطر
  async function worker() {
    while (cursor < candidates.length && hits.length < n && Date.now() < deadline) {
      const e = candidates[cursor++];
      let text;
      try {
        const fr = await ghFetch('/repos/' + repoOf(t) + '/contents/' + encPath(e.path) + '?ref=' + encodeURIComponent(ref),
          Object.assign({}, o, { raw: true, timeoutMs: 8000 }));
        if (!fr.ok) continue;
        text = await fr.text();
      } catch (err) { continue; } // ملفّ واحد فشل لا يوقف البحث كلّه
      if (text.indexOf(String.fromCharCode(0)) !== -1 || text.indexOf(query) === -1) continue;
      const lines = text.split('\n');
      const matchLines = [];
      const isJs = JS_FILE_RE.test(e.path);
      for (let li = 0; li < lines.length && matchLines.length < 3; li++) if (lines[li].indexOf(query) !== -1) matchLines.push({ n: li + 1, text: lines[li], fn: isJs ? enclosingHead(lines, li) : null }); // v-deep-search: رأس الدالّة الحاوية
      let calls = 0;
      if (callRe && isJs) for (const ln of lines) if (callRe.test(ln) && !defRe.test(ln)) calls++;
      hits.push({ path: e.path, lines: matchLines, calls });
    }
  }
  await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, candidates.length) }, worker));

  if (!hits.length) return 'لا نتائج لـ«' + query + '» في ' + repoOf(t) + '/' + t.path + ' (بحث فعليّ في محتوى ' + candidates.length + ' ملفًّا — لا فهرسة). جرّب كلمة أدقّ أو أقصر، أو تأكّد من التهجئة.' + skipNote;
  const shown = hits.slice(0, n).sort((a, b) => (a.path < b.path ? -1 : 1));
  const out = ['🔎 «' + query + '» في ' + repoOf(t) + '/' + t.path + ' — ' + shown.length + (hits.length > shown.length ? '+' : '') + ' ملفّ (بحث فعليّ في محتوى ' + candidates.length + ' ملفًّا):'];
  for (const h of shown) {
    out.push('\n📄 ' + h.path);
    const seenFn = new Set();
    for (const l of h.lines) {
      out.push('  ' + l.n + '| ' + l.text.trim().slice(0, 200));
      if (l.fn && l.fn.n !== l.n && !seenFn.has(l.fn.n)) { seenFn.add(l.fn.n); out.push('     ↳ داخل ' + l.fn.n + '| ' + l.fn.text.trim().slice(0, 160)); } // v-deep-search
    }
  }
  if (ident) { // v-deep-search: المستدعون من الملفّات المعروضة (المقروءة فعلًا) — قاعدة «الدالّة ومن يستدعيها واختبارها» بنداء واحد
    const callers = shown.filter((h) => h.calls).map((h) => h.path + ' (' + h.calls + ')');
    out.push(callers.length ? '\nالمستدعون لـ' + query + '( في الملفّات المعروضة: ' + callers.join('، ') : '\nلا مستدعين لـ' + query + '( في الملفّات المعروضة — تعريف أو ذكر فقط.');
  }
  out.push('\nلقراءة ملفّ كاملًا: read_github بمساره (from= للبقيّة).' + skipNote);
  return out.join('\n');
}

/* ---------- بحث بفهرس GitHub الرسميّ (/search/code) — بلا مسار محدَّد فقط ---------- */
/* المسار المحدَّد يذهب لـreadContentSearch (فوق) الموثوقة دائمًا؛ بلا مسار لا بديل غير هذا الفهرس (تنزيل
   المستودع كلّه للبحث بلا حصر مستحيل هنا — ١٣٧م.ب). فهرسه قد ينقص رموزًا موجودة فعلًا (مُثبَت حيًّا)،
   فالرسالة عند «لا نتائج» توجّه صراحةً لتضييق المسار بدل الإيحاء بأنّ الرمز غير موجود. */
async function readSearch(t, o, query, limit) {
  const q = String(query || '').trim();
  if (!q) return 'أعطِ نصّ البحث (query) — اسم دالّة أو ثابت أو رسالة خطأ تريد إيجاد كلّ الملفّات التي تذكره.';
  if (t.path) return readContentSearch(t, o, q, limit);
  const n = Math.max(1, Math.min((o && o.deep) ? 40 : 15, parseInt(limit, 10) || ((o && o.deep) ? 40 : 15)));
  const scoped = q + ' repo:' + repoOf(t);
  const r = await ghFetch('/search/code?per_page=' + n + '&q=' + encodeURIComponent(scoped), Object.assign({}, o, { textMatch: true }));
  if (!r.ok) {
    if (r.status === 403 || r.status === 422 || r.status === 429) return 'حدّ البحث في GitHub وصل حدّه (عشرة طلبات بالدقيقة) أو الطلب مرفوض — أعد المحاولة بعد قليل، أو ضيّق البحث بمسار (path) فيبحث في المحتوى الفعليّ بدل الفهرس.';
    return ghError(r, 'بحث «' + q + '» في ' + repoOf(t), o && o.env, o && o.anonymous);
  }
  const j = await r.json().catch(() => ({}));
  const items = Array.isArray(j.items) ? j.items : [];
  if (!items.length) return 'لا نتائج لـ«' + q + '» في ' + repoOf(t) + ' — تنبيه: هذا فهرس بحث GitHub وقد لا يشمل كلّ رمز موجود فعلًا. للتأكّد: كرّر النداء مع path لمجلّد محدَّد (مثل api/_lib أو js أو tests) فيبحث في المحتوى الفعليّ حرفيًّا لا فهرسًا.';
  const total = Number(j.total_count) || items.length;
  const out = ['🔎 «' + q + '» في ' + repoOf(t) + ' — ' + total + (j.incomplete_results ? '+' : '') + ' نتيجة'
    + (items.length < total ? '، أوّل ' + items.length : '') + ' (فهرس GitHub — للتأكّد الكامل كرّر مع path):'];
  for (const it of items) {
    out.push('\n📄 ' + (it.path || it.name || '؟'));
    const matches = Array.isArray(it.text_matches) ? it.text_matches : [];
    for (const m of matches.slice(0, 3)) {
      const frag = String(m.fragment || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      if (frag) out.push('  … ' + frag + ' …');
    }
  }
  out.push('\nلقراءة ملفّ كاملًا: read_github بمساره.');
  return out.join('\n');
}

/* ---------- v-agent-deep: الفرق (diff) والتزام واحد ---------- */
/* طلب المالك ٢٩ سبتمبر «تقوّي الوكيل يقرأ الجيت هوب — تحليل قويّ، يتعمّق في حلّ المسائل»: كان يرى أسماء الملفّات
   المتغيّرة في طلب السحب بلا الفرق، ولا يفتح التزامًا واحدًا — فيحكم على تغيير لم يره. */
const PATCH_FILE = 1500, PATCH_TOTAL = 6000;
const DEEP_PATCH_FILE = 6000, DEEP_PATCH_TOTAL = 20000;
function formatPatches(files, deep) {
  const perFile = deep ? DEEP_PATCH_FILE : PATCH_FILE, total = deep ? DEEP_PATCH_TOTAL : PATCH_TOTAL;
  const parts = [];
  let used = 0, skipped = 0;
  for (const f of files || []) {
    if (!f || typeof f.patch !== 'string' || !f.patch) continue;
    if (used >= total) { skipped++; continue; }
    const room = Math.min(perFile, total - used);
    const p = f.patch.length > room ? f.patch.slice(0, room) + '\n… (الفرق أطول — اقرأ الملفّ نفسه)' : f.patch;
    parts.push('### ' + f.filename + '\n```diff\n' + p + '\n```');
    used += p.length;
  }
  if (!parts.length) return '';
  return '\nالفرق (diff):\n' + parts.join('\n') + (skipped ? '\n… و' + skipped + ' ملفًّا آخر بلا فرق معروض (السقف) — اقرأه بـread_github.' : '');
}

async function readCommit(t, o) {
  const r = await ghFetch('/repos/' + repoOf(t) + '/commits/' + encodeURIComponent(t.ref), o);
  if (!r.ok) return ghError(r, 'التزام ' + t.ref + ' في ' + repoOf(t), o && o.env, o && o.anonymous);
  const j = await r.json();
  const cm = (j && j.commit) || {};
  const st = (j && j.stats) || {};
  const files = Array.isArray(j && j.files) ? j.files : [];
  const out = ['🔖 التزام ' + String(j.sha || t.ref).slice(0, 12) + ' في ' + repoOf(t) + ' · ' + ((j.author && j.author.login) || (cm.author && cm.author.name) || '؟') + ' · ' + String((cm.author && cm.author.date) || '').replace('T', ' ').replace(/:\d\dZ$/, ''),
    String(cm.message || '').slice(0, 2000),
    '+' + (st.additions || 0) + '/−' + (st.deletions || 0) + ' في ' + files.length + ' ملفًّا:',
    files.map((f) => '- ' + f.filename + ' (' + f.status + ' +' + (f.additions || 0) + '/−' + (f.deletions || 0) + ')').join('\n')];
  const diff = formatPatches(files, o && o.deep);
  if (diff) out.push(diff);
  return out.join('\n');
}

/* ---------- الواجهة الموحّدة للأداة ---------- */
/* ---------- آخر الدفعات (v-secret-vault) ---------- */
async function readCommits(t, o, limit) {
  const n = Math.max(1, Math.min(30, parseInt(limit, 10) || 15));
  const q = '?per_page=' + n + (t.ref ? '&sha=' + encodeURIComponent(t.ref) : '') + (t.path ? '&path=' + encodeURIComponent(t.path) : '');
  const r = await ghFetch('/repos/' + repoOf(t) + '/commits' + q, o);
  if (!r.ok) return ghError(r, 'دفعات ' + repoOf(t), o && o.env, o && o.anonymous);
  let list = null;
  try { list = await r.json(); } catch (e) { list = null; }
  if (!Array.isArray(list) || !list.length) return 'لا التزامات في ' + repoOf(t) + (t.ref ? ' (' + t.ref + ')' : '') + '.';
  const out = ['آخر الدفعات (الالتزامات) في ' + repoOf(t) + (t.ref ? ' على ' + t.ref : '') + (t.path ? ' لمسار ' + t.path : '') + ' — ' + list.length + ':'];
  for (const c of list) {
    const cm = (c && c.commit) || {};
    const sha = String((c && c.sha) || '').slice(0, 7);
    const when = String((cm.author && cm.author.date) || (cm.committer && cm.committer.date) || '').replace('T', ' ').replace(/:\d\dZ$/, '');
    const who = (c && c.author && c.author.login) || (cm.author && cm.author.name) || '';
    const title = String(cm.message || '').split('\n')[0].slice(0, 120);
    out.push('- ' + sha + ' · ' + when + ' · ' + who + ' · ' + title);
  }
  out.push('(تفاصيل التزام: https://github.com/' + repoOf(t) + '/commit/<sha>)');
  return out.join('\n');
}

/* v-owner-see-repo-img (المالك ١٣ أكتوبر، ردّ GPT-6 Astra على بطاقات الأزياء: «الصور البديلة الموجودة بالمستودع ما قدرت أعاينها»): مسار
   صورة في المستودع كان يعود «ملفّ ثنائيّ، لا يُقرأ نصًّا». الآن بايتاتها (حتّى ٣٫٥ م.ب، بترويسة raw) لتُرفق للمزوّد الذي يرى — chat.js يقرّر. */
const IMG_FILE_RE = /\.(png|jpe?g|webp|gif)$/i;
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const IMG_SEE_MAX = 3500000;
function imagePathOf(input) {
  if (input && typeof input === 'object' && String(input.query || '').trim()) return null;
  const t = parseTarget(input);
  return (t && t.path && IMG_FILE_RE.test(t.path) && ['file', 'path'].indexOf(t.kind) !== -1) ? t : null;
}
async function readImageFile(input, opts) {
  const t = imagePathOf(input);
  if (!t) return { error: 'ليس مسار صورة في مستودع' };
  const o = Object.assign({}, opts || {}, { raw: true, timeoutMs: 30000 });
  try {
    const r = await ghFetch('/repos/' + repoOf(t) + '/contents/' + encPath(t.path) + (t.ref ? '?ref=' + encodeURIComponent(t.ref) : ''), o);
    if (!r.ok) return { error: ghError(r, repoOf(t) + '/' + t.path, o.env) };
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return { error: 'الصورة ' + t.path + ' فارغة' };
    if (buf.length > IMG_SEE_MAX) return { error: 'الصورة ' + t.path + ' ' + b(buf.length) + ' أكبر من حدّ الرؤية (' + b(IMG_SEE_MAX) + ')' };
    return { path: t.path, mime: IMG_MIME[t.path.split('.').pop().toLowerCase()] || 'image/png', b64: buf.toString('base64'), bytes: buf.length };
  } catch (e) { return { error: 'تعذّر جلب الصورة: ' + String((e && e.message) || e).slice(0, 120) }; }
}

/* ---------- خريطة الكود (v-codemap) ----------
   طلب المالك ١٠ أكتوبر: «المزوّدون يكون عندهم كافّة المعلومات… معلومات الكود من الصفر». الخريطة api/_lib/codemap.json
   يولّدها scripts/codemap.mjs من الملفّات نفسها ويعيد توليدها codemap.yml بعد كلّ دمج: لكلّ ملفّ غرضه وحجمه ودوالّه
   وصادراته وأدواته. what=map: بلا path = كلّ المجلّدات بملفّاتها · path=مجلّد = ملفّاته بأغراضها · path=ملفّ = دوالّه
   · query = بحث في الخريطة. محلّيّة بلا نداء GitHub — فلا حدّ معدّل ولا مفتاح. */
const MAP_MAX = 28000;
const MAP_REPO_RE = /^omran-ai-builder$/i;
let __codemap = null;
function loadCodemap() {
  if (__codemap) return __codemap;
  try { __codemap = require('./codemap.json'); } catch (e) { __codemap = { files: [] }; }
  return __codemap;
}
const mapGroup = (p) => { const s = p.split('/'); return s.length === 1 ? '(الجذر)' : (s[0] === 'api' && s[1] === '_lib' && s.length > 2) ? 'api/_lib' : s[0] === '.github' ? '.github/workflows' : s[0]; };
const mapLine = (e) => e.p + ' (~' + e.n + ' سطر)' + (e.d ? ' — ' + e.d : '') + (e.t && e.t.length ? ' · أدوات: ' + e.t.join(', ') : '');
function mapEntry(e) {
  const out = ['### ' + e.p, 'الحجم: ~' + e.n + ' سطر', 'الغرض: ' + (e.d || '(بلا تعليق رأس — اقرأ الملفّ)')];
  if (e.t && e.t.length) out.push('أدوات معرّفة فيه: ' + e.t.join(', '));
  if (e.x && e.x.length) out.push('الصادرات: ' + e.x.join(', '));
  if (e.f && e.f.length) out.push('الدوالّ (' + e.f.length + '): ' + e.f.join(', '));
  if (e.u && e.u.length) out.push('عناصر الواجهة (' + e.u.length + ' — id«نصّه»): ' + e.u.join(' · '));
  out.push('', 'الموضع الدقيق: read_github مع path=' + e.p + ' وquery=اسم الدالّة، ثمّ from= السطر.');
  return out.join('\n');
}
function codeMap(t, input) {
  const m = loadCodemap();
  if (!t || !MAP_REPO_RE.test(t.repo || '')) return 'خريطة الكود لمستودع التطبيق وحده (OMRAN77/omran-ai-builder) — لغيره اقرأ الشجرة بلا what.';
  if (!m.files || !m.files.length) return 'خريطة الكود غير موجودة في هذا النشر — اقرأ الشجرة بلا what=map.';
  const files = m.files;
  const p = String(t.path || '').replace(/^\/+|\/+$/g, '');
  const q = String((input && input.query) || '').trim().toLowerCase();
  const head = 'خريطة الكود — ' + files.length + ' ملفًّا' + (m.tests ? ' + ' + m.tests + ' اختبارًا في tests/' : '') + ' (مولَّدة آليًّا من main بعد كلّ دمج؛ الأحجام تقريبيّة).';
  let list = p ? files.filter((e) => e.p === p || e.p.indexOf(p + '/') === 0) : files;
  if (p && !list.length) return head + '\nلا شيء في الخريطة تحت «' + p + '» — ملفّ جديد لم تُعِد الخريطة توليده بعد، أو المسار خطأ: اقرأه بلا what.';
  if (q) {
    const all = q.split(/\s+/).filter(Boolean).slice(0, 8);
    const long = all.filter((w) => w.length >= 3); // «عن» و«في» تطابق كلّ شيء
    const words = long.length ? long : all;
    const scored = list.map((e) => {
      const hay = (e.p + ' ' + (e.d || '') + ' ' + (e.t || []).join(' ') + ' ' + (e.x || []).join(' ') + ' ' + (e.f || []).join(' ') + ' ' + (e.u || []).join(' ')).toLowerCase();
      return { e, s: (all.length > 1 && hay.indexOf(q) !== -1 ? 10 : 0) + words.filter((w) => hay.indexOf(w) !== -1).length };
    }).filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
    if (!scored.length) return head + '\nلا تطابق في الخريطة لـ«' + q + '» — ابحث في محتوى الملفّات: read_github مع query بلا what.';
    const out = [head, 'نتائج «' + q + '» (' + scored.length + '):'];
    for (const r of scored.slice(0, 30)) {
      const e = r.e;
      const names = [].concat(e.t || [], e.x || [], e.f || [], e.u || []);
      const exact = names.filter((n) => n.toLowerCase().indexOf(q) !== -1);
      const hits = exact.length ? exact : names.filter((n) => words.some((w) => n.toLowerCase().indexOf(w) !== -1));
      out.push('- ' + mapLine(e) + (hits.length ? ' · يطابق: ' + Array.from(new Set(hits)).slice(0, 12).join(', ') : ''));
    }
    return out.join('\n').slice(0, MAP_MAX);
  }
  if (list.length === 1 && list[0].p === p) return head + '\n\n' + mapEntry(list[0]);
  const groups = new Map();
  for (const e of list) { const g = mapGroup(e.p); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(e); }
  const full = [head];
  for (const [g, es] of groups) { full.push('', '## ' + g + ' (' + es.length + ')'); for (const e of es) full.push('- ' + mapLine(e)); }
  const text = full.join('\n');
  if (text.length <= MAP_MAX) return text;
  // كبيرة على ردّ واحد: الملفّات المحوريّة بأغراضها، والبقيّة بأسمائها — والتفصيل بـpath=المجلّد.
  const short = [head, 'كبيرة على ردّ واحد: المحوريّة بأغراضها والبقيّة بأسمائها — path=المجلّد يعطي أغراض ملفّاته، وpath=الملفّ دوالّه.'];
  for (const [g, es] of groups) {
    short.push('', '## ' + g + ' (' + es.length + ')');
    for (const e of es.filter((x) => x.k)) short.push('- ' + mapLine(e));
    const rest = es.filter((x) => !x.k).map((x) => x.p.split('/').pop());
    if (rest.length) short.push('  ' + rest.join(' · '));
  }
  return short.join('\n').slice(0, MAP_MAX);
}

async function readGithub(input, opts) {
  const t = parseTarget(input);
  if (!t) return 'رابط GitHub غير مفهوم. أعطِ رابط مستودع أو مجلّد أو ملفّ أو pull أو issue أو commits، أو owner/repo مع path (وwhat=commits لآخر الدفعات)، أو مع query للبحث.';
  const query = input && typeof input === 'object' ? String(input.query || '').trim() : '';
  if (input && typeof input === 'object' && String(input.what || '').toLowerCase() === 'map') return codeMap(t, input); // v-codemap
  try {
    if (query) return await readSearch(t, opts, query, input && input.limit);
    if (t.kind === 'pr') return await readPR(t, opts);
    if (t.kind === 'issue') return await readIssue(t, opts);
    if (t.kind === 'commits') return await readCommits(t, opts, input && typeof input === 'object' ? input.limit : undefined); // v-secret-vault
    if (t.kind === 'commit') return await readCommit(t, opts); // v-agent-deep
    if (t.kind === 'repo' && !t.path) return await readRepo(t, opts);
    const c = await getContents(t, opts);
    if (c.error) return c.error;
    if (c.type === 'dir') return formatDir(t, c.entries, opts && opts.deep);
    return formatFile(c.name, t.ref, c.content, t.from, opts && opts.deep);
  } catch (e) {
    return 'تعذّر الوصول إلى GitHub: ' + String((e && e.message) || e).slice(0, 120);
  }
}

/* ---------- المستودع كأرشيف (لمحلّل الكود) ---------- */
async function fetchRepoZip(target, opts) {
  const o = opts || {};
  const t = target;
  let ref = t.ref;
  if (!ref) {
    const r = await ghFetch('/repos/' + repoOf(t), o);
    if (!r.ok) throw new Error(ghError(r, repoOf(t), o.env));
    ref = (await r.json()).default_branch || 'main';
  }
  const r = await ghFetch('/repos/' + repoOf(t) + '/zipball/' + encodeURIComponent(ref), Object.assign({}, o, { timeoutMs: o.timeoutMs || 40000 }));
  if (!r.ok || !r.body) throw new Error(ghError(r, 'zipball ' + repoOf(t), o.env));
  const declared = Number(r.headers && r.headers.get ? r.headers.get('content-length') : 0) || 0;
  if (declared > ZIP_MAX) throw new Error('المستودع أكبر من ' + b(ZIP_MAX) + ' — أعطِ رابط مجلّد أو ملفّ بدل المستودع كلّه.');
  const reader = r.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > ZIP_MAX) { try { await reader.cancel(); } catch (e) { /* المجرى أُغلق */ } throw new Error('المستودع أكبر من ' + b(ZIP_MAX) + ' — أعطِ رابط مجلّد أو ملفّ بدل المستودع كلّه.'); }
    chunks.push(Buffer.from(value));
  }
  const all = zipLib.unzip(Buffer.concat(chunks)).map((e) => ({ name: e.name.replace(/^[^/]+\//, ''), data: e.data })).filter((e) => e.name);
  const prefix = t.path ? t.path + '/' : '';
  const entries = prefix ? all.filter((e) => e.name.indexOf(prefix) === 0).map((e) => ({ name: e.name.slice(prefix.length), data: e.data })) : all;
  return { ref, entries, total: all.length };
}

module.exports = { imagePathOf, readImageFile, // v-owner-see-repo-img
  codeMap, loadCodemap, // v-codemap
  parseTarget, readGithub, readSearch, readCommits, readCommit, formatPatches, getContents, fetchRepoZip, formatFile, fileExcerpt, ghFetch, resolveGithubToken, CHUNK, ZIP_MAX, DEEP_CHUNK, DEEP_TREE_MAX, DEEP_FILE_MAX, DEEP_README_MAX, readContentSearch, enclosingHead, SEARCH_MAX_FILES, SEARCH_MAX_FILES_DEEP, SEARCH_FILE_BYTES_MAX, SEARCH_SKIP_RE };
