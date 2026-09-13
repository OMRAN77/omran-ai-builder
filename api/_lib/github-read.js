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
  const from = parseInt(o.from, 10);
  return { owner, repo, ref, path, kind, number, from: Number.isFinite(from) && from > 1 ? from : 1 };
}

/* ---------- المفتاح ---------- */
/* v-secret-vault: البيئة أوّلًا (GITHUB_TOKEN) ثمّ خزنة الأسرار المشفّرة التي يحفظها المالك
   من الإعدادات. opts.env صريح (الاختبارات والفحص) = البيئة المعطاة وحدها بلا خزنة. */
async function resolveGithubToken(opts) {
  const o = opts || {};
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
    'Accept': o.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
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

function ghError(r, what, env) {
  const e = env || process.env;
  if (r.status === 404) return 'غير موجود أو خاصّ: ' + what + (e.GITHUB_TOKEN ? '' : ' (المستودعات الخاصّة تحتاج مفتاح GitHub: خزنة الأسرار في الإعدادات أو GITHUB_TOKEN في البيئة)');
  if (r.status === 403 || r.status === 429) return 'GitHub رفض الطلب (حدّ الطلبات أو الصلاحيّات). أضف مفتاح GitHub (خزنة الأسرار في الإعدادات أو GITHUB_TOKEN في البيئة) لرفع الحدّ من ٦٠ إلى ٥٠٠٠ طلب في الساعة.';
  if (r.status === 401) return 'مفتاح GitHub غير صالح (الخزنة أو GITHUB_TOKEN).';
  return 'GitHub HTTP ' + r.status + ' عند ' + what;
}

const encPath = (p) => String(p || '').split('/').map(encodeURIComponent).join('/');
const repoOf = (t) => t.owner + '/' + t.repo;
const b = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : n >= 1024 ? Math.round(n / 1024) + 'KB' : n + 'B');

/* ---------- الملفّ: أسطر مرقّمة على دفعات ---------- */
function formatFile(name, ref, content, from) {
  const text = String(content || '');
  if (text.indexOf(String.fromCharCode(0)) !== -1) return '📄 ' + name + ' — ملفّ ثنائيّ (' + b(text.length) + ')، لا يُقرأ نصًّا.';
  const lines = text.split('\n');
  const total = lines.length;
  let start = Math.max(1, Math.min(parseInt(from, 10) || 1, total));
  let acc = '', i = start - 1;
  for (; i < total; i++) {
    const ln = (i + 1) + '| ' + lines[i] + '\n';
    if (acc.length + ln.length > CHUNK && acc) break;
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
  if (!r.ok) return { error: ghError(r, repoOf(t) + '/' + t.path, o && o.env) };
  const j = await r.json();
  if (Array.isArray(j)) return { type: 'dir', entries: j };
  if (j && j.type === 'file') {
    if (Number(j.size) > FILE_MAX) return { error: 'الملفّ أكبر من ' + b(FILE_MAX) + ' — اختر ملفًّا أصغر.' };
    let content = '';
    if (j.encoding === 'base64' && typeof j.content === 'string') content = Buffer.from(j.content.replace(/\n/g, ''), 'base64').toString('utf8');
    else {
      const rr = await ghFetch('/repos/' + repoOf(t) + '/contents/' + encPath(t.path) + q, Object.assign({}, o, { raw: true }));
      if (!rr.ok) return { error: ghError(rr, t.path, o && o.env) };
      content = await rr.text();
    }
    return { type: 'file', content, size: Number(j.size) || content.length, name: j.path || t.path };
  }
  if (j && (j.type === 'symlink' || j.type === 'submodule')) return { error: t.path + ' ' + (j.type === 'symlink' ? 'وصلة رمزيّة' : 'وحدة فرعيّة') + ' — افتح هدفها مباشرةً.' };
  return { error: 'ردّ غير مفهوم من GitHub.' };
}

function formatDir(t, entries) {
  const rows = entries.slice(0, TREE_MAX).map((e) => '- ' + e.name + (e.type === 'dir' ? '/' : ' (' + b(Number(e.size) || 0) + ')'));
  return '📁 ' + repoOf(t) + '/' + t.path + (t.ref ? ' (' + t.ref + ')' : '') + ' · ' + entries.length + ' مدخلة\n' + rows.join('\n')
    + (entries.length > TREE_MAX ? '\n… و' + (entries.length - TREE_MAX) + ' أخرى' : '');
}

/* ---------- المستودع: وصف + شجرة + README ---------- */
async function readRepo(t, o) {
  const r = await ghFetch('/repos/' + repoOf(t), o);
  if (!r.ok) return ghError(r, repoOf(t), o && o.env);
  const j = await r.json();
  const ref = t.ref || j.default_branch || 'main';
  const out = ['📦 ' + (j.full_name || repoOf(t)) + (j.description ? ' — ' + j.description : ''),
    'اللغة: ' + (j.language || '؟') + ' · نجوم: ' + (j.stargazers_count || 0) + ' · الفرع: ' + ref + (j.pushed_at ? ' · آخر دفع: ' + String(j.pushed_at).slice(0, 10) : '') + (j.private ? ' · خاصّ' : '')];
  const tr = await ghFetch('/repos/' + repoOf(t) + '/git/trees/' + encodeURIComponent(ref) + '?recursive=1', o);
  if (tr.ok) {
    const tj = await tr.json();
    const blobs = (tj.tree || []).filter((e) => e.type === 'blob' && !zipLib.SKIP_DIR_PATTERNS.some((p) => p.test(e.path)));
    out.push('\nالملفّات (' + blobs.length + (tj.truncated ? '+' : '') + '):');
    out.push(blobs.slice(0, TREE_MAX).map((e) => '- ' + e.path + ' (' + b(Number(e.size) || 0) + ')').join('\n'));
    if (blobs.length > TREE_MAX) out.push('… و' + (blobs.length - TREE_MAX) + ' ملفًّا آخر');
  } else out.push('\n(تعذّرت قراءة الشجرة: ' + ghError(tr, 'الشجرة', o && o.env) + ')');
  const rd = await ghFetch('/repos/' + repoOf(t) + '/readme?ref=' + encodeURIComponent(ref), Object.assign({}, o, { raw: true }));
  if (rd.ok) { const txt = await rd.text(); out.push('\nREADME:\n' + txt.slice(0, 2500) + (txt.length > 2500 ? '\n…' : '')); }
  out.push('\nلقراءة ملفّ: استدعِ read_github برابطه (blob) أو بـ' + repoOf(t) + ' مع path.');
  return out.join('\n');
}

/* ---------- طلب سحب ومسألة ---------- */
async function readPR(t, o) {
  const r = await ghFetch('/repos/' + repoOf(t) + '/pulls/' + t.number, o);
  if (!r.ok) return ghError(r, repoOf(t) + '#' + t.number, o && o.env);
  const j = await r.json();
  const head = j.head || {}, base = j.base || {};
  const out = ['🔀 PR #' + j.number + ': ' + (j.title || '') + ' — ' + (j.merged ? 'مدموج' : j.state) + ' · ' + ((j.user && j.user.login) || '؟'),
    'من ' + ((head.repo && head.repo.full_name) || '') + ':' + (head.ref || '') + ' إلى ' + (base.ref || '') + ' · +' + (j.additions || 0) + '/−' + (j.deletions || 0) + ' في ' + (j.changed_files || 0) + ' ملفًّا' + (j.mergeable_state ? ' · ' + j.mergeable_state : ''),
    j.body ? '\n' + String(j.body).slice(0, 2500) : ''];
  const fr = await ghFetch('/repos/' + repoOf(t) + '/pulls/' + t.number + '/files?per_page=60', o);
  if (fr.ok) {
    const files = await fr.json();
    out.push('\nالملفّات المتغيّرة:');
    out.push((Array.isArray(files) ? files : []).map((f) => '- ' + f.filename + ' (' + f.status + ' +' + (f.additions || 0) + '/−' + (f.deletions || 0) + ')').join('\n'));
    if (head.ref) out.push('\nلقراءة ملفّ منها: read_github برابط blob على الفرع ' + head.ref + (head.repo && head.repo.full_name ? ' في ' + head.repo.full_name : '') + '.');
  }
  return out.join('\n');
}

async function readIssue(t, o) {
  const r = await ghFetch('/repos/' + repoOf(t) + '/issues/' + t.number, o);
  if (!r.ok) return ghError(r, repoOf(t) + '#' + t.number, o && o.env);
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

/* ---------- الواجهة الموحّدة للأداة ---------- */
/* ---------- آخر الدفعات (v-secret-vault) ---------- */
async function readCommits(t, o, limit) {
  const n = Math.max(1, Math.min(30, parseInt(limit, 10) || 15));
  const q = '?per_page=' + n + (t.ref ? '&sha=' + encodeURIComponent(t.ref) : '') + (t.path ? '&path=' + encodeURIComponent(t.path) : '');
  const r = await ghFetch('/repos/' + repoOf(t) + '/commits' + q, o);
  if (!r.ok) return ghError(r, 'دفعات ' + repoOf(t), o && o.env);
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
  if (!t) return 'رابط GitHub غير مفهوم. أعطِ رابط مستودع أو مجلّد أو ملفّ أو pull أو issue أو commits، أو owner/repo مع path (وwhat=commits لآخر الدفعات).';
  try {
    if (t.kind === 'pr') return await readPR(t, opts);
    if (t.kind === 'issue') return await readIssue(t, opts);
    if (t.kind === 'commits') return await readCommits(t, opts, input && typeof input === 'object' ? input.limit : undefined); // v-secret-vault
    if (t.kind === 'repo' && !t.path) return await readRepo(t, opts);
    const c = await getContents(t, opts);
    if (c.error) return c.error;
    if (c.type === 'dir') return formatDir(t, c.entries);
    return formatFile(c.name, t.ref, c.content, t.from);
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

module.exports = { parseTarget, readGithub, readCommits, getContents, fetchRepoZip, formatFile, ghFetch, resolveGithubToken, CHUNK, ZIP_MAX };
