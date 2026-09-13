// tests/github-read.test.cjs — v-agent-github: قراءة GitHub للوكيل ولمحلّل الكود.
// شبكة مزيّفة كاملة (fetch + DNS) فلا طلب حقيقيّ؛ يثبت فهم الروابط، والملفّ المقطّع
// بأسطر مرقّمة، والمجلّد، والمستودع، وطلب السحب، والمسألة، ورسائل الفشل، والأرشيف.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeZip } = require('./_zip.cjs');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-github';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const GH = require('../api/_lib/github-read.js');

const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
function jsonRes(obj, status) { return { ok: !status || status < 400, status: status || 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => obj, text: async () => JSON.stringify(obj) }; }
function textRes(txt) { return { ok: true, status: 200, headers: new Headers(), json: async () => { throw new Error('not json'); }, text: async () => txt }; }
// مجرى جديد في كلّ نداء: ReadableStream يُقرأ مرّة واحدة فقط.
function bytesRes(buf) {
  return () => ({ ok: true, status: 200, headers: new Headers(), body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(buf)); c.close(); } }) });
}
function fakeNet(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, accept: init && init.headers && init.headers.Accept, auth: init && init.headers && init.headers.Authorization });
    for (const [re, res] of routes) if (re.test(u)) return typeof res === 'function' ? res(u, init) : res;
    return jsonRes({ message: 'Not Found' }, 404);
  };
  return { calls, opts: { fetchImpl, lookup, env: {} } };
}

test('parseTarget: every GitHub link shape', () => {
  assert.deepEqual(GH.parseTarget({ url: 'https://github.com/OMRAN77/omran-ai-builder' }), { owner: 'OMRAN77', repo: 'omran-ai-builder', ref: '', path: '', kind: 'repo', number: null, from: 1 });
  assert.equal(GH.parseTarget({ url: 'github.com/a/b.git/' }).repo, 'b');
  const blob = GH.parseTarget({ url: 'https://github.com/a/b/blob/main/src/x%20y.js', from: '40' });
  assert.deepEqual([blob.kind, blob.ref, blob.path, blob.from], ['file', 'main', 'src/x y.js', 40]);
  const tree = GH.parseTarget({ url: 'https://github.com/a/b/tree/dev/api/_lib?tab=x' });
  assert.deepEqual([tree.kind, tree.ref, tree.path], ['dir', 'dev', 'api/_lib']);
  assert.equal(GH.parseTarget({ url: 'https://github.com/a/b/tree/dev' }).kind, 'repo');
  const pr = GH.parseTarget({ url: 'https://github.com/a/b/pull/538' });
  assert.deepEqual([pr.kind, pr.number], ['pr', 538]);
  assert.deepEqual([GH.parseTarget('https://github.com/a/b/issues/7').kind, GH.parseTarget('https://github.com/a/b/issues/7').number], ['issue', 7]);
  const raw = GH.parseTarget({ url: 'https://raw.githubusercontent.com/a/b/main/js/app.js' });
  assert.deepEqual([raw.kind, raw.ref, raw.path], ['file', 'main', 'js/app.js']);
  const short = GH.parseTarget({ url: 'a/b', path: 'api/tools.js', ref: 'main' });
  assert.deepEqual([short.kind, short.path, short.ref], ['path', 'api/tools.js', 'main']);
  assert.equal(GH.parseTarget({ url: 'a/b/README.md' }).kind, 'path');
  assert.equal(GH.parseTarget({ url: 'https://github.com/a/b/actions' }).kind, 'repo', 'صفحة فرعيّة مجهولة = المستودع');
  assert.equal(GH.parseTarget({ url: 'https://evil.com/a/b' }), null);
  assert.equal(GH.parseTarget({ url: 'a/b', path: '../secret' }), null, 'لا صعود في المسار');
  assert.equal(GH.parseTarget({ url: 'a/b', ref: 'x;rm' }), null);
  assert.equal(GH.parseTarget({ url: '' }), null);
});

test('formatFile: numbered lines, chunking with from, binary detection', () => {
  const lines = []; for (let i = 1; i <= 400; i++) lines.push('line ' + i + ' ' + 'x'.repeat(30));
  const src = lines.join('\n');
  const first = GH.formatFile('a.js', 'main', src, 1);
  assert.ok(first.startsWith('📄 a.js (main) · 400 سطر · الأسطر 1–'));
  assert.ok(first.includes('1| line 1 ') && !first.includes('400| line 400'));
  const m = /from=(\d+)/.exec(first);
  assert.ok(m, 'يعلن سطر التتمّة');
  const next = GH.formatFile('a.js', 'main', src, Number(m[1]));
  assert.ok(next.includes(m[1] + '| line ' + m[1] + ' '));
  assert.ok(next.length <= GH.CHUNK + 400);
  const last = GH.formatFile('a.js', '', 'one\ntwo', 5);
  assert.ok(last.includes('الأسطر 2–2') && last.includes('[نهاية الملفّ]'), 'from بعد النهاية = آخر سطر');
  assert.ok(/ثنائيّ/.test(GH.formatFile('x.bin', '', 'ab' + String.fromCharCode(0) + 'c', 1)));
});

test('readGithub: repo overview = description + tree (node_modules skipped) + README', async () => {
  const net = fakeNet([
    [/\/repos\/a\/b$/, jsonRes({ full_name: 'a/b', description: 'demo', language: 'JavaScript', stargazers_count: 12, default_branch: 'main', pushed_at: '2026-09-01T00:00:00Z' })],
    [/\/git\/trees\/main\?recursive=1$/, jsonRes({ tree: [{ path: 'src/app.js', type: 'blob', size: 900 }, { path: 'node_modules/x/i.js', type: 'blob', size: 5 }, { path: 'src', type: 'tree' }], truncated: false })],
    [/\/readme\?ref=main$/, textRes('# Demo\nhello')],
  ]);
  const out = await GH.readGithub({ url: 'https://github.com/a/b' }, net.opts);
  assert.ok(out.includes('📦 a/b — demo') && out.includes('الفرع: main'));
  assert.ok(out.includes('- src/app.js (900B)') && !out.includes('node_modules'));
  assert.ok(out.includes('README:\n# Demo'));
  assert.equal(net.calls.length, 3);
  assert.ok(net.calls.every((c) => c.url.startsWith('https://api.github.com/')), 'المضيف ثابت');
  assert.equal(net.calls[2].accept, 'application/vnd.github.raw+json');
});

test('readGithub: file via contents API (base64), dir listing, token header', async () => {
  const content = Buffer.from('const a = 1;\nconst b = 2;\n').toString('base64');
  const net = fakeNet([
    [/\/contents\/src\/app\.js\?ref=main$/, jsonRes({ type: 'file', path: 'src/app.js', size: 26, encoding: 'base64', content })],
    [/\/contents\/src$/, jsonRes([{ name: 'app.js', type: 'file', size: 26 }, { name: 'lib', type: 'dir', size: 0 }])],
  ]);
  net.opts.env = { GITHUB_TOKEN: 'tok' };
  const f = await GH.readGithub({ url: 'https://github.com/a/b/blob/main/src/app.js' }, net.opts);
  assert.ok(f.includes('📄 src/app.js (main) · 3 سطر') && f.includes('1| const a = 1;') && f.includes('[نهاية الملفّ]'));
  assert.equal(net.calls[0].auth, 'Bearer tok');
  const d = await GH.readGithub({ url: 'a/b', path: 'src' }, net.opts);
  assert.ok(d.includes('📁 a/b/src · 2 مدخلة') && d.includes('- lib/') && d.includes('- app.js (26B)'));
});

test('readGithub: pull request and issue', async () => {
  const net = fakeNet([
    [/\/pulls\/5$/, jsonRes({ number: 5, title: 'Fix', state: 'open', merged: false, user: { login: 'omran' }, head: { ref: 'fix', repo: { full_name: 'a/b' } }, base: { ref: 'main' }, additions: 10, deletions: 2, changed_files: 1, mergeable_state: 'clean', body: 'why' })],
    [/\/pulls\/5\/files/, jsonRes([{ filename: 'x.js', status: 'modified', additions: 10, deletions: 2 }])],
    [/\/issues\/9$/, jsonRes({ number: 9, title: 'Bug', state: 'open', user: { login: 'u' }, labels: [{ name: 'bug' }], body: 'it breaks', comments: 1 })],
    [/\/issues\/9\/comments/, jsonRes([{ user: { login: 'v' }, body: 'me  too\nplease' }])],
  ]);
  const pr = await GH.readGithub({ url: 'https://github.com/a/b/pull/5' }, net.opts);
  assert.ok(pr.includes('🔀 PR #5: Fix — open · omran') && pr.includes('a/b:fix إلى main') && pr.includes('- x.js (modified +10/−2)'));
  const is = await GH.readGithub({ url: 'https://github.com/a/b/issues/9' }, net.opts);
  assert.ok(is.includes('🐛 Issue #9: Bug — open · u · bug') && is.includes('it breaks') && is.includes('— v: me too please'));
});

test('readGithub: failures are messages, never throws', async () => {
  const net = fakeNet([[/\/repos\/a\/private$/, jsonRes({}, 404)], [/\/repos\/a\/limited$/, jsonRes({}, 403)]]);
  assert.match(await GH.readGithub({ url: 'a/private' }, net.opts), /غير موجود أو خاصّ.*GITHUB_TOKEN/);
  assert.match(await GH.readGithub({ url: 'a/limited' }, net.opts), /حدّ الطلبات/);
  assert.match(await GH.readGithub({ url: 'not a link' }, net.opts), /غير مفهوم/);
  const boom = { fetchImpl: async () => { throw new Error('ECONNRESET'); }, lookup, env: {} };
  assert.match(await GH.readGithub({ url: 'a/b' }, boom), /تعذّر الوصول إلى GitHub: ECONNRESET/);
  assert.match(await GH.readGithub({ url: 'a/b' }, { fetchImpl: async () => jsonRes({}), lookup: async () => [{ address: '10.0.0.1', family: 4 }], env: {} }), /blocked_outbound_host/, 'حارس safe-url يعمل');
});

test('fetchRepoZip: default branch, redirect to codeload, top folder stripped, path prefix filter, size cap', async () => {
  const zip = makeZip([
    { name: 'a-b-abc123/README.md', data: '# hi' },
    { name: 'a-b-abc123/src/app.js', data: 'x' },
    { name: 'a-b-abc123/src/lib/u.js', data: 'y' },
  ]);
  const net = fakeNet([
    [/\/repos\/a\/b$/, jsonRes({ default_branch: 'dev' })],
    [/api\.github\.com\/repos\/a\/b\/zipball\/dev$/, { ok: false, status: 302, headers: new Headers({ location: 'https://codeload.github.com/a/b/legacy.zip/dev' }) }],
    [/codeload\.github\.com/, bytesRes(zip)],
  ]);
  const all = await GH.fetchRepoZip(GH.parseTarget({ url: 'a/b' }), net.opts);
  assert.equal(all.ref, 'dev');
  assert.deepEqual(all.entries.map((e) => e.name), ['README.md', 'src/app.js', 'src/lib/u.js']);
  const sub = await GH.fetchRepoZip(GH.parseTarget({ url: 'https://github.com/a/b/tree/dev/src' }), net.opts);
  assert.deepEqual(sub.entries.map((e) => e.name), ['app.js', 'lib/u.js']);
  assert.equal(sub.entries[0].data.toString(), 'x');
  const big = fakeNet([[/zipball/, bytesRes(Buffer.alloc(GH.ZIP_MAX + 1))]]);
  await assert.rejects(() => GH.fetchRepoZip(GH.parseTarget({ url: 'a/b', ref: 'main' }), big.opts), /أكبر من/);
});

test('wiring: agent tool + dispatch, analyzer accepts githubUrl, UI has the GitHub input, env doc', () => {
  const agent = read('api/_lib/agent.js');
  assert.ok(agent.includes("name: 'read_github'"), 'الأداة مُعرَّفة للوكيل');
  assert.ok(agent.includes("cb.name === 'read_github'") && agent.includes('readGithub(input'), 'الأداة تُنفَّذ');
  assert.ok(agent.includes('read_github') && /25-د\./.test(agent), 'قاعدة النظام تذكرها');
  const ca = read('api/_lib/code-analyze.js');
  assert.ok(ca.includes('githubUrl') && ca.includes('fetchRepoZip') && ca.includes('_zipEntries'));
  const ui = read('js/app-27-codescore.js');
  assert.ok(ui.includes('csGh') && ui.includes('githubUrl'));
  assert.ok(read('.env.example').includes('GITHUB_TOKEN'));
});
