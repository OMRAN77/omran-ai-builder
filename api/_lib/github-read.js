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
const DEEP_CHUNK = 24000;
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
const SEARCH_MAX_FILES = 400;   // أكثر من api/_lib (١٦٢) وtests (١٩٨) بمريح؛ أكبر يُطلب تضييق المسار
const SEARCH_MAX_FILES_DEEP = 700;
const SEARCH_CONCURRENCY = 15;  // نداءات متوازية — لا تُغرق GitHub ولا الدالّة
const SEARCH_FILE_BYTES_MAX = 400000; // فوقه ليس كودًا منطقيًّا (صورة/بيانات) — يُتخطّى بلا تنزيله
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
  const candidates = (tj.tree || []).filter((e) => e.type === 'blob' && (e.path + '/').indexOf(prefix) === 0
    && Number(e.size) > 0 && Number(e.size) <= SEARCH_FILE_BYTES_MAX
    && !zipLib.SKIP_DIR_PATTERNS.some((p) => p.test(e.path)));
  if (!candidates.length) return 'لا ملفّات كود تحت ' + repoOf(t) + '/' + t.path + ' (أو المسار غير موجود على ' + ref + ').';
  const cap = deep ? SEARCH_MAX_FILES_DEEP : SEARCH_MAX_FILES;
  if (candidates.length > cap) return 'المسار ' + t.path + ' فيه ' + candidates.length + ' ملفًّا — أكثر من حدّ البحث الواحد (' + cap + '). ضيّق المسار لمجلّد أصغر داخله.';

  const deadline = Date.now() + SEARCH_BUDGET_MS;
  const hits = [];
  let cursor = 0;
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
      for (let li = 0; li < lines.length && matchLines.length < 3; li++) if (lines[li].indexOf(query) !== -1) matchLines.push({ n: li + 1, text: lines[li] });
      hits.push({ path: e.path, lines: matchLines });
    }
  }
  await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, candidates.length) }, worker));

  if (!hits.length) return 'لا نتائج لـ«' + query + '» في ' + repoOf(t) + '/' + t.path + ' (بحث فعليّ في محتوى ' + candidates.length + ' ملفًّا — لا فهرسة). جرّب كلمة أدقّ أو أقصر، أو تأكّد من التهجئة.';
  const shown = hits.slice(0, n).sort((a, b) => (a.path < b.path ? -1 : 1));
  const out = ['🔎 «' + query + '» في ' + repoOf(t) + '/' + t.path + ' — ' + shown.length + (hits.length > shown.length ? '+' : '') + ' ملفّ (بحث فعليّ في محتوى ' + candidates.length + ' ملفًّا):'];
  for (const h of shown) {
    out.push('\n📄 ' + h.path);
    for (const l of h.lines) out.push('  ' + l.n + '| ' + l.text.trim().slice(0, 200));
  }
  out.push('\nلقراءة ملفّ كاملًا: read_github بمساره.');
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

async function readGithub(input, opts) {
  const t = parseTarget(input);
  if (!t) return 'رابط GitHub غير مفهوم. أعطِ رابط مستودع أو مجلّد أو ملفّ أو pull أو issue أو commits، أو owner/repo مع path (وwhat=commits لآخر الدفعات)، أو مع query للبحث.';
  const query = input && typeof input === 'object' ? String(input.query || '').trim() : '';
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

module.exports = { parseTarget, readGithub, readSearch, readCommits, readCommit, formatPatches, getContents, fetchRepoZip, formatFile, ghFetch, resolveGithubToken, CHUNK, ZIP_MAX, DEEP_CHUNK, DEEP_TREE_MAX, DEEP_FILE_MAX, DEEP_README_MAX, readContentSearch, SEARCH_MAX_FILES, SEARCH_MAX_FILES_DEEP };
