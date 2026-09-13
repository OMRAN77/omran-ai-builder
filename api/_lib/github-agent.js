'use strict';
// 🔗 وكيل GitHub للمالك — يتيح لوكيل عمران قراءة ملفات المستودع والالتزام
// (commit) بفرعٍ فقط، ولا يلمس الفرع الافتراضي (main) أبدًا: النشر/الدمج بيد
// المالك وحده («ما ينشر إلا بأمري»).
//
// الأمان: المفتاح والمستودع يأتيان من بيئة Vercel فقط — لا يُخزَّنان في التطبيق
// ولا يمرّان عبر قاعدة بياناته. والوصول محصور بالمالك (يُفحص في agent.js عبر
// جلسة المالك الموقَّعة قبل استدعاء أيّ دالة هنا).
//   GITHUB_OWNER_TOKEN — مفتاح fine-grained بصلاحيات Contents/PR (read&write).
//   GITHUB_OWNER_REPO  — "OWNER/repo" مثل "OMRAN77/omran-ai-builder".
const GH_API = 'https://api.github.com';

function ghConfig() {
  const token = String(process.env.GITHUB_OWNER_TOKEN || '').trim();
  const repo = String(process.env.GITHUB_OWNER_REPO || '').trim();
  return { token, repo, ok: !!(token && repo && repo.indexOf('/') > 0) };
}
function githubEnabled() { return ghConfig().ok; }

function encPath(p) {
  return String(p || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

async function ghFetch(path, init) {
  const cfg = ghConfig();
  const base = (init && init.headers) || {};
  return fetch(GH_API + path, Object.assign({}, init, {
    headers: Object.assign({
      Authorization: 'Bearer ' + cfg.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'omran-ai-builder-agent',
      'Content-Type': 'application/json',
    }, base),
    signal: AbortSignal.timeout(20000),
  }));
}

// فحص المفتاح والمستودع — للوحة المالك («GitHub متصل ✅»).
async function checkGithub() {
  const cfg = ghConfig();
  if (!cfg.ok) return { ok: false, reason: 'not_configured' };
  try {
    const r = await ghFetch('/repos/' + cfg.repo);
    if (!r.ok) return { ok: false, reason: 'http_' + r.status, repo: cfg.repo };
    const d = await r.json().catch(() => ({}));
    const perms = d.permissions || {};
    return { ok: true, repo: cfg.repo, default_branch: d.default_branch || 'main', canPush: !!perms.push };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e).slice(0, 80) }; }
}

async function defaultBranch(repo) {
  const c = await checkGithub();
  return (c.ok && c.default_branch) || 'main';
}

async function branchExists(repo, branch) {
  const r = await ghFetch('/repos/' + repo + '/git/ref/heads/' + encodeURIComponent(branch));
  return r.ok;
}

async function ensureBranch(repo, branch, base) {
  if (await branchExists(repo, branch)) return true;
  const br = await ghFetch('/repos/' + repo + '/git/ref/heads/' + encodeURIComponent(base));
  if (!br.ok) return false;
  const bd = await br.json().catch(() => null);
  const baseSha = bd && bd.object && bd.object.sha;
  if (!baseSha) return false;
  const cr = await ghFetch('/repos/' + repo + '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: baseSha }),
  });
  return cr.ok;
}

// قراءة ملف من المستودع (نصّ).
async function readFile(path, ref) {
  const cfg = ghConfig();
  if (!cfg.ok) return { ok: false, reason: 'not_configured' };
  if (!path) return { ok: false, reason: 'no_path' };
  try {
    const q = ref ? ('?ref=' + encodeURIComponent(ref)) : '';
    const r = await ghFetch('/repos/' + cfg.repo + '/contents/' + encPath(path) + q);
    if (!r.ok) return { ok: false, reason: 'http_' + r.status };
    const d = await r.json().catch(() => null);
    if (!d || typeof d.content !== 'string') return { ok: false, reason: 'no_content' };
    const text = Buffer.from(d.content, 'base64').toString('utf8');
    return { ok: true, path, sha: d.sha, text: text.slice(0, 60000) };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e).slice(0, 80) }; }
}

// التزام ملف/ملفات بفرعٍ — لا يلمس الفرع الافتراضي أبدًا.
async function commitFiles(opts) {
  const cfg = ghConfig();
  if (!cfg.ok) return { ok: false, reason: 'not_configured' };
  const files = (opts && Array.isArray(opts.files)) ? opts.files.filter((f) => f && f.path) : [];
  if (!files.length) return { ok: false, reason: 'no_files' };
  if (files.length > 20) return { ok: false, reason: 'too_many_files' };
  const base = await defaultBranch(cfg.repo);
  let branch = String((opts && opts.branch) || '').trim() || 'omran-agent';
  branch = branch.replace(/[^A-Za-z0-9._\/-]/g, '-').replace(/^-+|-+$/g, '') || 'omran-agent';
  // v-never-main: رفضٌ صريح لأيّ التزامٍ على الفرع الافتراضي — النشر بيد المالك.
  if (branch === base || /^(main|master)$/i.test(branch)) return { ok: false, reason: 'refuse_default_branch' };
  try {
    const ready = await ensureBranch(cfg.repo, branch, base);
    if (!ready) return { ok: false, reason: 'branch_create_failed' };
    const done = [];
    const message = String((opts && opts.message) || 'وكيل عمران: تحديث').slice(0, 240);
    for (const f of files) {
      let sha = null;
      const ex = await ghFetch('/repos/' + cfg.repo + '/contents/' + encPath(f.path) + '?ref=' + encodeURIComponent(branch));
      if (ex.ok) { const ed = await ex.json().catch(() => null); sha = ed && ed.sha; }
      const put = await ghFetch('/repos/' + cfg.repo + '/contents/' + encPath(f.path), {
        method: 'PUT',
        body: JSON.stringify({
          message: message,
          content: Buffer.from(String(f.content == null ? '' : f.content), 'utf8').toString('base64'),
          branch: branch,
          sha: sha || undefined,
        }),
      });
      if (!put.ok) {
        const pe = await put.text().catch(() => '');
        return { ok: false, reason: 'put_' + put.status, detail: pe.slice(0, 140), done };
      }
      const pd = await put.json().catch(() => null);
      done.push({ path: f.path, url: (pd && pd.content && pd.content.html_url) || null });
    }
    return {
      ok: true,
      repo: cfg.repo,
      branch,
      base,
      files: done,
      branchUrl: 'https://github.com/' + cfg.repo + '/tree/' + branch,
      compareUrl: 'https://github.com/' + cfg.repo + '/compare/' + base + '...' + branch,
    };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e).slice(0, 100) }; }
}

module.exports = { githubEnabled, checkGithub, readFile, commitFiles };
