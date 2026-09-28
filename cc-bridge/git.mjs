// cc-bridge/git.mjs — v-cc-bridge: ما يفعله الجسر وحده بأمر المالك: الرفع، طلب السحب، الدمج، التراجع.
//
// Claude Code يلتزم محلّيًّا فقط (policy.mjs يرفض git push من داخله). الجسر هو الذي
// يدفع الفرع ويفتح طلب السحب بمفتاح GitHub للمالك — عبر أمر «انشر» — ويدمجه عبر
// أمر «ادمج». لا دفع إلى الفرع الرئيسيّ أبدًا: كلّ نشر فرع cc/… وطلب سحب.
'use strict';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, chmod, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { slugBranch } from './policy.mjs';

const execFileP = promisify(execFile);

export function makeGit(opts) {
  const cwd = opts.cwd;
  const env = opts.env || process.env;
  const repo = String(env.CC_REPO || 'OMRAN77/omran-ai-builder');
  const base = String(env.CC_BASE_BRANCH || 'main');
  const token = String(env.GITHUB_TOKEN || '').trim();
  const fetchImpl = opts.fetchImpl || fetch;

  async function git(args, extraEnv) {
    const { stdout } = await execFileP('git', args, { cwd, env: Object.assign({}, env, { GIT_TERMINAL_PROMPT: '0' }, extraEnv || {}), maxBuffer: 8 * 1024 * 1024 });
    return String(stdout || '').trim();
  }

  /** بيانات الدخول للدفع: سكربت GIT_ASKPASS مؤقّت بدل وضع الرمز في سطر الأمر. */
  async function askpass() {
    if (!token) throw new Error('لا مفتاح GitHub (GITHUB_TOKEN) في بيئة الجسر.');
    const dir = await mkdtemp(join(tmpdir(), 'ccgit-'));
    const file = join(dir, 'askpass.sh');
    await writeFile(file, '#!/bin/sh\ncase "$1" in *sername*) echo x-access-token;; *) echo "$CC_GH_TOKEN";; esac\n');
    await chmod(file, 0o700);
    return { GIT_ASKPASS: file, CC_GH_TOKEN: token };
  }

  async function gh(pathname, init) {
    if (!token) throw new Error('لا مفتاح GitHub (GITHUB_TOKEN) في بيئة الجسر.');
    const r = await fetchImpl('https://api.github.com' + pathname, Object.assign({
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'omran-cc-bridge/1.0', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    }, init || {}));
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    return { ok: r.ok, status: r.status, json: j };
  }

  async function status() {
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '');
    const porcelain = await git(['status', '--porcelain']).catch(() => '');
    const dirty = porcelain ? porcelain.split('\n').filter(Boolean).length : 0;
    let ahead = 0;
    try { ahead = Number(await git(['rev-list', '--count', 'origin/' + base + '..HEAD'])) || 0; } catch (e) { ahead = 0; }
    const head = await git(['rev-parse', '--short', 'HEAD']).catch(() => '');
    return { repo, base, branch, dirty, ahead, head };
  }

  /** «انشر»: فرع عمل إن كنّا على الأساس، التزام لما بقي، دفع، وطلب سحب (أو الموجود). */
  async function publish(input) {
    const i = input && typeof input === 'object' ? input : {};
    const st = await status();
    let branch = st.branch;
    if (!branch || branch === 'HEAD' || branch === base) {
      branch = slugBranch(i.title || 'task', Date.now());
      await git(['checkout', '-b', branch]);
    }
    if (st.dirty) {
      await git(['add', '-A']);
      const msg = String(i.message || i.title || '').trim().slice(0, 300) || 'تعديلات Claude Code بأمر المالك';
      await git(['-c', 'user.name=Claude Code (omran-cc)', '-c', 'user.email=noreply@anthropic.com', 'commit', '-q', '-m', msg]);
    }
    const ahead = Number(await git(['rev-list', '--count', 'origin/' + base + '..HEAD']).catch(() => '0')) || 0;
    if (!ahead) return { error: 'لا التزامات جديدة فوق ' + base + ' — لا شيء يُنشر.' };
    const creds = await askpass();
    await git(['push', '-u', 'origin', branch + ':refs/heads/' + branch], creds);
    const sha = await git(['rev-parse', 'HEAD']);
    // طلب السحب: الموجود المفتوح لهذا الفرع، وإلّا جديد
    const owner = repo.split('/')[0];
    const list = await gh('/repos/' + repo + '/pulls?state=open&head=' + encodeURIComponent(owner + ':' + branch) + '&base=' + encodeURIComponent(base));
    let pr = list.ok && Array.isArray(list.json) && list.json.length ? list.json[0] : null;
    if (!pr) {
      const title = String(i.title || '').trim().slice(0, 200) || ('Claude Code: ' + branch);
      const body = (String(i.body || '').trim().slice(0, 6000) || 'تغييرات نفّذها Claude Code داخل التطبيق بأمر المالك، ورُفعت بأمره «انشر». الدمج بأمره «ادمج».')
        + '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)';
      const made = await gh('/repos/' + repo + '/pulls', { method: 'POST', body: JSON.stringify({ title, head: branch, base, body }) });
      if (!made.ok) return { error: 'رُفع الفرع لكن تعذّر فتح طلب السحب: HTTP ' + made.status + ' ' + String(made.json && made.json.message || '').slice(0, 120), branch, sha };
      pr = made.json;
    }
    return { ok: true, branch, sha, prNumber: pr.number, prUrl: pr.html_url };
  }

  /** حالة طلب سحب وفحوصه — يعرضها الجسر قبل الدمج. */
  async function prState(number) {
    const pr = await gh('/repos/' + repo + '/pulls/' + number);
    if (!pr.ok) return { error: 'طلب السحب #' + number + ' غير موجود (HTTP ' + pr.status + ').' };
    const p = pr.json;
    const checks = await gh('/repos/' + repo + '/commits/' + p.head.sha + '/check-runs?per_page=30');
    const runs = checks.ok && checks.json && Array.isArray(checks.json.check_runs) ? checks.json.check_runs.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion || null })) : [];
    return { number, state: p.state, merged: !!p.merged_at, mergeable_state: p.mergeable_state, head: p.head.sha, url: p.html_url, checks: runs,
      failing: runs.filter((c) => c.status === 'completed' && !['success', 'skipped', 'neutral'].includes(c.conclusion)).map((c) => c.name),
      pending: runs.filter((c) => c.status !== 'completed').map((c) => c.name) };
  }

  /** «ادمج»: يرفض إن كان فحص أحمر (إلّا بـforce)، يدمج، ثمّ يعيد نسخة العمل إلى الأساس. */
  async function merge(input) {
    const i = input && typeof input === 'object' ? input : {};
    const n = parseInt(i.prNumber, 10);
    if (!Number.isFinite(n) || n <= 0) return { error: 'حدّد رقم طلب السحب.' };
    const st = await prState(n);
    if (st.error) return st;
    if (st.merged) return { ok: true, already: true, url: st.url };
    if (st.state !== 'open') return { error: 'طلب السحب #' + n + ' مغلق.' };
    if (st.mergeable_state === 'dirty') return { error: 'طلب السحب #' + n + ' فيه تعارض مع ' + base + ' — يحتاج حلًّا أوّلًا.', pr: st };
    if (st.failing.length && !i.force) return { error: 'فحوص حمراء: ' + st.failing.join('، ') + ' — أصلحها أو أرسل «ادمج بالقوّة».', pr: st };
    const done = await gh('/repos/' + repo + '/pulls/' + n + '/merge', { method: 'PUT', body: JSON.stringify({ merge_method: 'merge', sha: st.head }) });
    if (!done.ok) return { error: 'رفض GitHub الدمج: HTTP ' + done.status + ' ' + String(done.json && done.json.message || '').slice(0, 160), pr: st };
    await resetToBase().catch(() => {});
    return { ok: true, sha: done.json && done.json.sha, url: st.url, pendingChecks: st.pending };
  }

  /** «تراجع»: إسقاط التغييرات المحلّيّة والعودة إلى أحدث الأساس. */
  async function resetToBase() {
    const creds = token ? await askpass() : {};
    await git(['checkout', '--', '.']).catch(() => {});
    await git(['clean', '-fdq']).catch(() => {});
    await git(['fetch', '--quiet', 'origin', base], creds);
    await git(['checkout', '-q', base]).catch(async () => { await git(['checkout', '-q', '-B', base, 'origin/' + base]); });
    await git(['reset', '-q', '--hard', 'origin/' + base]);
    return status();
  }

  return { git, gh, status, publish, prState, merge, resetToBase, repo, base };
}
