// tests/audit-fix-bridge.test.cjs — v-audit-bridge: سياج جسر Claude Code وأمان الدمج (cc-bridge).
// sat-bridges-1: الدفع إلى main كان يُحسم بمقارنة نصّيّة (HEAD:heads/main، ‎/usr/bin/git، الأسماء المستعارة،
//   remote.origin.push) ومفتاح الكتابة في بيئة Claude Code — الآن لا مفتاح كتابة في بيئته، ودفع فرعه يجريه الجسر
//   نفسه بوجهة refs/heads/<فرع> صريحة إلى عنوان origin المتوقّع، والفحص النصّيّ حاجز إضافيّ يعرف الصيغ.
// sat-bridges-2: منع الدمج عبر gh كان regex على صيغ بعينها — الآن تحليل رموز (‎-XPUT، ‎-fbase=main، ‎-iXPUT،
//   «gh pr -R x merge»، gh alias) والرمز الذي يصل Claude Code (CC_AGENT_GH_TOKEN) بلا صلاحيّة كتابة.
// sat-bridges-5: merge() كان يمسح نسخة العمل بعد كلّ دمج بلا فحص، ولا قفل بين انشر/ادمج/تراجع و/chat.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const policy = () => import(path.join(root, 'cc-bridge/policy.mjs'));
const gitMod = () => import(path.join(root, 'cc-bridge/git.mjs'));

const GENV = Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' });
const G = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: GENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** مستودع عارٍ (origin) ونسخة عمل على فرع طلب السحب cc/x مدفوع إليه التزام واحد فوق main. */
function makeRepo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'axbridge-'));
  const bare = path.join(d, 'origin.git');
  const work = path.join(d, 'repo');
  G(d, 'init', '-q', '--bare', '-b', 'main', bare);
  G(d, 'init', '-q', '-b', 'main', work);
  G(work, 'remote', 'add', 'origin', bare);
  fs.writeFileSync(path.join(work, 'a.txt'), 'one\n');
  G(work, 'add', '.'); G(work, 'commit', '-qm', 'one'); G(work, 'push', '-q', 'origin', 'main:refs/heads/main');
  G(work, 'fetch', '-q', 'origin');
  G(work, 'checkout', '-qb', 'cc/x');
  fs.writeFileSync(path.join(work, 'a.txt'), 'two\n');
  G(work, 'commit', '-qam', 'two'); G(work, 'push', '-q', 'origin', 'cc/x:refs/heads/cc/x');
  return { d, bare, work, head: G(work, 'rev-parse', 'HEAD'), mainSha: G(bare, 'rev-parse', 'refs/heads/main') };
}

/** GitHub مزيّف: طلب سحب مفتوح رأسه sha على الفرع ref، بلا فحوص، والدمج ينجح. */
function fakeGitHub(sha, ref, calls) {
  return async (url, init) => {
    const u = String(url), m = (init && init.method) || 'GET';
    if (calls) calls.push(m + ' ' + u);
    const J = (o, s) => ({ ok: (s || 200) < 300, status: s || 200, json: async () => o });
    if (/\/pulls\/9$/.test(u) && m === 'GET') return J({ number: 9, state: 'open', merged_at: null, mergeable_state: 'clean', head: { sha, ref }, html_url: 'https://github.com/o/r/pull/9' });
    if (/check-runs/.test(u)) return J({ check_runs: [] });
    if (/\/pulls\/9\/merge$/.test(u) && m === 'PUT') return J({ merged: true, sha: 'f'.repeat(40) });
    return J({ message: 'Not Found' }, 404);
  };
}

// ─────────────────────────── sat-bridges-1 ───────────────────────────
test('sat-bridges-1: سياج الدفع يحسم main بكلّ صيغه (heads/main، مسار git الكامل، الأسماء المستعارة، الدفع المركّب)', async () => {
  const P = await policy();
  const deny = [
    'git push origin HEAD:heads/main',        // يحدّث refs/heads/main فعلًا (DWIM عند git)
    'git push origin HEAD:refs/heads/main',
    '/usr/bin/git push origin HEAD:main',     // git باسمه الأساسيّ
    'git config alias.pp "push origin HEAD:main"',
    'git config --global alias.pp push',
    'git -c alias.pp=push pp origin HEAD:main',
    'npm run ci && git push -u origin cc/x',  // الدفع أمر مستقلّ يجريه الجسر
    'git push -u origin cc/x && gh pr create --title x --body y',
    'git push https://github.com/o/r.git cc/x', // إلى origin وحده
    'git push --dry-run origin cc/x',
    'git -c http.extraHeader=x push origin cc/x',
    'cat /proc/1/environ',                    // بيئة الجسر (فيها مفتاحه) لا تُقرأ
  ];
  for (const c of deny) assert.equal(P.decideTool('Bash', { command: c }).behavior, 'deny', 'يُرفض: ' + c);
  for (const c of ['git push -u origin cc/x', 'git push origin HEAD:cc/x', '/usr/bin/git push -u origin cc/x', 'git push origin feature:refs/heads/feature', 'git push -u origin cc/x 2>&1', 'git log --oneline']) {
    assert.equal(P.decideTool('Bash', { command: c }).behavior, 'allow', 'يُسمح: ' + c);
  }
  assert.equal(P.decideTool('Read', { file_path: '/proc/1/environ' }).behavior, 'deny', 'ولا بأداة القراءة');
  // ما يجيزه السياج من الدفع يُحلَّل إلى طلب واحد صريح ينفّذه الجسر
  assert.equal(JSON.stringify(P.pushRequest('git push -u origin cc/x')), JSON.stringify({ src: 'cc/x', branch: 'cc/x', upstream: true, dir: '' }));
  assert.equal(JSON.stringify(P.pushRequest('git -C /work/repo push origin HEAD:refs/heads/cc/y')), JSON.stringify({ src: 'HEAD', branch: 'cc/y', upstream: false, dir: '/work/repo' }));
  assert.equal(P.pushRequest('npm run ci'), null, 'ما ليس دفعًا لا يمسّه');
  assert.ok(P.pushRequest('npm run ci && git push origin cc/x').error, 'المركّب خطأ صريح');
});

test('sat-bridges-1: بيئة Claude Code بلا مفتاح الكتابة ولا سرّ الجسر', async () => {
  const P = await policy();
  const base = { PATH: '/bin', CC_BRIDGE_SECRET: 's'.repeat(24), GITHUB_TOKEN: 'ghp_WRITE', ANTHROPIC_API_KEY: 'k' };
  const e1 = P.agentEnv(base);
  assert.equal(e1.GITHUB_TOKEN, undefined, 'مفتاح الكتابة يبقى في الجسر');
  assert.equal(e1.GH_TOKEN, undefined, 'ولا يمرّ باسم gh');
  assert.equal(e1.CC_BRIDGE_SECRET, undefined, 'ولا سرّ الجسر');
  assert.equal(e1.ANTHROPIC_API_KEY, 'k', 'مفتاح المحرّك نفسه يبقى');
  const e2 = P.agentEnv(Object.assign({ GH_TOKEN: 'ghp_WRITE2', CC_AGENT_GH_TOKEN: 'github_pat_READ' }, base));
  assert.equal(e2.GH_TOKEN, 'github_pat_READ', 'رمز القراءة وفتح الطلبات وحده يصل gh');
  assert.equal(e2.CC_AGENT_GH_TOKEN, undefined);
  assert.equal(e2.GITHUB_TOKEN, undefined);
  assert.equal(P.redact('x github_pat_READ y', { CC_AGENT_GH_TOKEN: 'github_pat_READ' }), 'x [CC_AGENT_GH_TOKEN] y', 'ويُنقّح من السجلّ');
  const srv = read('cc-bridge/server.mjs');
  assert.ok(srv.includes('env: childEnv()') && srv.includes('return agentEnv(env);') && !srv.includes('e.GH_TOKEN = e.GITHUB_TOKEN'), 'الخادم يبني بيئة Claude Code من agentEnv');
  assert.ok(srv.includes('canUseTool: async (name, input) => bridgeTool(name, input)') && srv.includes('bridgeDecision(name, input, gitOps.pushBranch)'), 'الدفع الذي يجيزه السياج يجريه الجسر');
  assert.ok(!/حماية الفرع `main` على GitHub تمنع الدفع إليه من طبقة ثانية/.test(read('cc-bridge/README.md')), 'README لا يدّعي حماية غير موجودة');
});

test('sat-bridges-1: الجسر يدفع فرع Claude Code بوجهة صريحة — remote.origin.push والخطّافات وعنوان الدفع لا تغيّرها', async () => {
  const { makeGit } = await gitMod();
  const r = makeRepo();
  const env = Object.assign({}, GENV, { GITHUB_TOKEN: 'test-token', CC_REPO: 'o/r' });
  const g = makeGit({ cwd: r.work, env, originUrl: r.bare });
  fs.writeFileSync(path.join(r.work, 'a.txt'), 'three\n'); G(r.work, 'commit', '-qam', 'three');
  // فخّ: remote.origin.push يحوّل «git push origin cc/x» إلى main، وخطّاف pre-push يسرق البيئة
  G(r.work, 'config', 'remote.origin.push', 'refs/heads/cc/x:refs/heads/main');
  const marker = path.join(r.d, 'hook-ran');
  fs.writeFileSync(path.join(r.work, '.git/hooks/pre-push'), '#!/bin/sh\necho "$GITHUB_TOKEN" > ' + marker + '\n', { mode: 0o755 });
  const ok = await g.pushBranch({ src: 'cc/x', branch: 'cc/x', upstream: true });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(G(r.bare, 'rev-parse', 'refs/heads/cc/x'), G(r.work, 'rev-parse', 'HEAD'), 'وصل الفرع المسمّى');
  assert.equal(G(r.bare, 'rev-parse', 'refs/heads/main'), r.mainSha, 'main لم يتحرّك');
  assert.ok(!fs.existsSync(marker), 'خطّافات المستودع لا تعمل بمفتاح الجسر');
  assert.equal(G(r.work, 'rev-parse', '--abbrev-ref', 'cc/x@{upstream}'), 'origin/cc/x', '‎-u يضبط المتعقَّب');
  for (const bad of [{ src: 'HEAD', branch: 'main' }, { src: 'HEAD', branch: 'MASTER' }, { src: 'HEAD', branch: '-f' }, { src: 'nope', branch: 'cc/z' }, { src: 'HEAD', branch: 'cc/z', dir: '/elsewhere' }]) {
    const x = await g.pushBranch(bad);
    assert.ok(x.error, 'يُرفض: ' + JSON.stringify(bad));
  }
  // canUseTool: الأمر الذي يكتبه Claude Code يدفعه الجسر نفسه ويُستبدل بطباعة النتيجة
  const P = await policy();
  fs.writeFileSync(path.join(r.work, 'a.txt'), 'four\n'); G(r.work, 'commit', '-qam', 'four');
  const dec = await P.bridgeDecision('Bash', { command: 'git push -u origin cc/x', description: 'd' }, g.pushBranch);
  assert.equal(dec.behavior, 'allow');
  assert.equal(G(r.bare, 'rev-parse', 'refs/heads/cc/x'), G(r.work, 'rev-parse', 'HEAD'), 'دفعه الجسر نفسه');
  assert.equal(G(r.bare, 'rev-parse', 'refs/heads/main'), r.mainSha);
  assert.match(execFileSync('sh', ['-c', dec.updatedInput.command], { encoding: 'utf8' }), /الجسر دفع cc\/x إلى origin\/cc\/x/, 'Claude Code يرى النتيجة ناتجَ أمره');
  assert.equal(dec.updatedInput.description, 'd', 'بقيّة المدخل كما هي');
  let called = 0;
  const no = await P.bridgeDecision('Bash', { command: 'git push origin HEAD:heads/main' }, async () => { called++; return { ok: true }; });
  assert.equal(no.behavior, 'deny'); assert.equal(called, 0, 'المرفوض لا يصل الدافع');
  const fail = await P.bridgeDecision('Bash', { command: 'git push origin cc/x' }, async () => { throw new Error('rejected ghp_' + 'a'.repeat(30)); });
  assert.equal(fail.behavior, 'deny'); assert.ok(!/ghp_a/.test(fail.message), 'خطأ الدفع منقّح');
  const plain = await P.bridgeDecision('Bash', { command: 'npm run ci' }, async () => { called++; });
  assert.equal(plain.behavior, 'allow'); assert.equal(plain.updatedInput.command, 'npm run ci'); assert.equal(called, 0, 'ما ليس دفعًا يمرّ كما هو');
  G(r.work, 'config', 'remote.origin.pushurl', path.join(r.d, 'evil.git'));
  const ev = await g.pushBranch({ src: 'HEAD', branch: 'cc/x' });
  assert.ok(ev.error && /origin/.test(ev.error), 'عنوان دفع مُحوَّل = لا دفع (المفتاح لا يذهب لغير مستودع المالك)');
  assert.equal(G(r.bare, 'rev-parse', 'refs/heads/main'), r.mainSha);
  // «انشر» يمرّ من الطريق نفسه
  assert.ok(read('cc-bridge/git.mjs').includes("const pushed = await pushBranch({ src: branch, branch, upstream: true });"), 'انشر يدفع عبر pushBranch');
});

// ─────────────────────────── sat-bridges-2 ───────────────────────────
test('sat-bridges-2: gh — الدمج والكتابة مرفوضان بكلّ صيغ الخيارات، والقراءة مسموحة', async () => {
  const P = await policy();
  const deny = [
    'gh api -XPUT repos/o/r/pulls/12/merge',
    'gh api repos/o/r/merges -fbase=main -fhead=cc/x',
    'gh api -iXPUT repos/o/r/pulls/12/merge',
    'gh api -X=PUT repos/o/r/pulls/12/merge',
    'gh api --method=PATCH repos/o/r/git/refs/heads/main',
    'gh api --method PUT repos/o/r/pulls/12/merge',
    'gh api repos/o/r/merges --field=base=main',
    'gh api repos/o/r/merges -Fhead=cc/x',
    'gh api graphql --input=q.json',
    '/usr/bin/gh api -XPOST repos/o/r/merges',
    'gh alias set m "pr merge"',
    'gh alias import x.yml',
    'gh pr -R o/r merge 5',
    'gh pr --repo=o/r merge 5',
  ];
  for (const c of deny) assert.equal(P.decideTool('Bash', { command: c }).behavior, 'deny', 'يُرفض: ' + c);
  const allow = ['gh api -XGET repos/o/r', 'gh api -X GET repos/o/r', 'gh api repos/o/r/pulls/5', 'gh api repos/o/r/pulls -q .[].number', 'gh pr view 5', 'gh pr create --title merge --body x', 'gh pr checks 5', 'gh alias list'];
  for (const c of allow) assert.equal(P.decideTool('Bash', { command: c }).behavior, 'allow', 'يُسمح: ' + c);
  assert.ok(/CC_AGENT_GH_TOKEN/.test(read('cc-bridge/README.md')), 'README يوثّق رمز Claude Code بلا كتابة');
});

// ─────────────────────────── sat-bridges-5 ───────────────────────────
test('sat-bridges-5: الدمج لا يمسح نسخة عمل فيها عمل غير ملتزم أو غير مدفوع، ويعيدها إلى main حين تكون نظيفة', async () => {
  const { makeGit } = await gitMod();
  const env = Object.assign({}, GENV, { GITHUB_TOKEN: 'test-token', CC_REPO: 'o/r' });
  // (أ) تعديل غير ملتزم + ملفّ جديد على فرع الطلب → يبقيان، والفرع يبقى
  const a = makeRepo();
  fs.writeFileSync(path.join(a.work, 'a.txt'), 'wip\n');
  fs.writeFileSync(path.join(a.work, 'new.txt'), 'new\n');
  const ra = await makeGit({ cwd: a.work, env, fetchImpl: fakeGitHub(a.head, 'cc/x'), originUrl: a.bare }).merge({ prNumber: 9 });
  assert.ok(ra.ok && ra.kept === true, JSON.stringify(ra));
  assert.equal(fs.readFileSync(path.join(a.work, 'a.txt'), 'utf8'), 'wip\n', 'التعديل غير الملتزم باقٍ');
  assert.ok(fs.existsSync(path.join(a.work, 'new.txt')), 'الملفّ الجديد باقٍ');
  assert.equal(G(a.work, 'rev-parse', '--abbrev-ref', 'HEAD'), 'cc/x');
  // (ب) التزام محلّيّ غير مدفوع على فرع الطلب → لا انتقال إلى main
  const b = makeRepo();
  fs.writeFileSync(path.join(b.work, 'b.txt'), 'local\n'); G(b.work, 'add', '.'); G(b.work, 'commit', '-qm', 'local only');
  const rb = await makeGit({ cwd: b.work, env, fetchImpl: fakeGitHub(b.head, 'cc/x'), originUrl: b.bare }).merge({ prNumber: 9 });
  assert.ok(rb.ok && rb.kept === true, JSON.stringify(rb));
  assert.equal(G(b.work, 'rev-parse', '--abbrev-ref', 'HEAD'), 'cc/x', 'الالتزام المحلّيّ يبقى في نسخة العمل');
  // (ج) فرع آخر غير الطلب المدموج → يبقى
  const c = makeRepo();
  G(c.work, 'checkout', '-qb', 'cc/other');
  const rc = await makeGit({ cwd: c.work, env, fetchImpl: fakeGitHub(c.head, 'cc/x'), originUrl: c.bare }).merge({ prNumber: 9 });
  assert.ok(rc.ok && rc.kept === true, JSON.stringify(rc));
  assert.equal(G(c.work, 'rev-parse', '--abbrev-ref', 'HEAD'), 'cc/other');
  // (د) نظيفة على فرع الطلب المدموج نفسه → تعود إلى main كما كانت
  const dd = makeRepo();
  const rd = await makeGit({ cwd: dd.work, env, fetchImpl: fakeGitHub(dd.head, 'cc/x'), originUrl: dd.bare }).merge({ prNumber: 9 });
  assert.ok(rd.ok && !rd.kept, JSON.stringify(rd));
  assert.equal(G(dd.work, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main', 'العودة إلى الأساس بعد الدمج');
  // الإشعار: الدمج التلقائيّ يحمل «بقيت نسخة العمل» إلى الإشعار، والعميل يعرضها بمفتاح ترجمة
  assert.ok(read('cc-bridge/watch.mjs').includes("r.kept ? { kept: true } : undefined"), 'إشعار الدمج التلقائيّ يحمل kept');
});

test('sat-bridges-5: العميل يعرض «بقيت نسخة العمل» و«عمليّة git جارية» بمفاتيح الترجمة', async () => {
  const T = { axBridgeMergeKept: 'KEPT-TXT', axBridgeGitBusy: 'BUSY-TXT' };
  const win = { localStorage: { getItem: () => '', setItem() {}, removeItem() {} }, t: (k) => T[k] || k, confirm: () => true, authGet: (k) => (k === 'aiapp_username' ? 'omran' : 'tok') };
  new Function('window', 'localStorage', read('js/app-29-cc.js'))(win, win.localStorage);
  const save = global.fetch;
  const replies = [];
  global.fetch = async () => { const x = replies.shift(); return { ok: x.status < 300, status: x.status, json: async () => x.body }; };
  const status = { step: () => ({ done() {} }), release() {} };
  try {
    const cur = { messages: [] };
    replies.push({ status: 200, body: { ok: true, sha: 'abcdef1234', kept: true } });
    await win.omranCC.runInChat(cur, 'ادمج 9', {}, status);
    assert.match(cur.messages[0].content, /KEPT-TXT/, 'الدمج اليدويّ يذكر بقاء نسخة العمل');
    replies.push({ status: 409, body: { error: 'عربيّ خام', code: 'git_busy' } });
    await win.omranCC.runInChat(cur, 'تراجع', {}, status);
    assert.match(cur.messages[1].content, /BUSY-TXT/, 'الرمز الثابت يُترجم ولا يُعرض النصّ الخام');
    replies.push({ status: 200, body: { ok: true, notes: [{ id: 3, at: 0, title: '✅ دُمج #9', kept: true }] } });
    replies.push({ status: 200, body: { ok: true } });
    await win.omranCC.runInChat(cur, 'افتح 3', {}, status);
    assert.match(cur.messages[2].content, /KEPT-TXT/, 'إشعار الدمج التلقائيّ يذكرها');
  } finally { global.fetch = save; }
});

test('sat-bridges-5: قفل git واحد — /chat و/publish و/reset تردّ 409 أثناء الدمج، والدمج التلقائيّ يمرّ من القفل', { timeout: 60000 }, async () => {
  const r = makeRepo();
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'axbridge-state-'));
  const stub = path.join(state, 'stub-fetch.mjs');
  // GitHub مزيّف داخل عمليّة الجسر: الدمج يتأخّر ١٫٥ث ليُرى ما يحدث أثناءه
  fs.writeFileSync(stub, [
    "const real = globalThis.fetch;",
    "globalThis.fetch = async (url, init) => {",
    "  const u = String(url), m = (init && init.method) || 'GET';",
    "  if (!u.startsWith('https://api.github.com')) return real(url, init);",
    "  const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json' } });",
    "  if (/\\/pulls\\/9$/.test(u)) return J({ number: 9, state: 'open', merged_at: null, mergeable_state: 'clean', head: { sha: " + JSON.stringify(r.head) + ", ref: 'cc/x' }, html_url: 'https://github.com/o/r/pull/9' });",
    "  if (/check-runs/.test(u)) return J({ check_runs: [] });",
    "  if (/\\/merge$/.test(u) && m === 'PUT') { await new Promise((res) => setTimeout(res, 1500)); return J({ merged: true, sha: 'f'.repeat(40) }); }",
    "  return J({ message: 'Not Found' }, 404);",
    "};",
  ].join('\n'));
  const port = 21000 + Math.floor(Math.random() * 20000);
  const secret = 'axbridge-secret-0123456789abcdef';
  const child = spawn(process.execPath, ['--import', 'file://' + stub, path.join(root, 'cc-bridge/server.mjs')], {
    env: Object.assign({}, GENV, { PORT: String(port), CC_BRIDGE_SECRET: secret, ANTHROPIC_API_KEY: 'test', CC_ENABLED: 'on', CC_REPO_DIR: r.work, CC_STATE_DIR: state, GITHUB_TOKEN: 'test-token', CC_REPO: 'o/r', CC_PULSE_URL: 'off' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = ''; child.stdout.on('data', (b) => { out += b; }); child.stderr.on('data', (b) => { out += b; });
  const call = (p, body) => new Promise((res, rej) => {
    const data = JSON.stringify(body || {});
    const q = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (s) => {
      let t = ''; s.on('data', (c) => { t += c; }); s.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { j = { raw: t.slice(0, 200) }; } res({ code: s.statusCode, j }); });
    });
    q.on('error', rej); q.end(data);
  });
  try {
    for (let i = 0; i < 100 && !/listening/.test(out); i++) await new Promise((res) => setTimeout(res, 100));
    assert.match(out, /listening/, 'الجسر بدأ: ' + out.slice(0, 300));
    const merging = call('/merge', { prNumber: 9, force: true });
    await new Promise((res) => setTimeout(res, 400));
    const chat = await call('/chat', { message: 'مهمّة جديدة' });
    assert.equal(chat.code, 409, '/chat أثناء الدمج: ' + JSON.stringify(chat.j));
    assert.equal(chat.j.code, 'git_busy');
    for (const p of ['/publish', '/reset', '/merge']) {
      const x = await call(p, { prNumber: 9, force: true });
      assert.equal(x.code, 409, p + ' أثناء الدمج: ' + JSON.stringify(x.j));
      assert.equal(x.j.code, 'git_busy');
    }
    const m = await merging;
    assert.equal(m.code, 200, JSON.stringify(m.j));
    assert.ok(m.j.ok);
  } finally { child.kill('SIGKILL'); }
  const srv = read('cc-bridge/server.mjs');
  assert.ok(srv.includes(': autoMerge(n),') && srv.includes("const r = await withGit('merge', () => gitOps.merge({ prNumber: n }));"), 'الدمج التلقائيّ في الخلفيّة يأخذ القفل نفسه');
  assert.ok(/if \(!wakeQueue\.length \|\| \(current && !current\.done\) \|\| gitBusy\) return;/.test(srv), 'ولا إيقاظ أثناء عمليّة git');
});
