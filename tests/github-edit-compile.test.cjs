// tests/github-edit-compile.test.cjs — v-claude-code-level (A3، F1، F2): edit_github كما يحتاجه كلود على كود المالك.
// العرض: «ما يعدّل» — edit_github رفض app-09 (~٥٧٧ ألف حرف > سقف ٢٠٠ ألف)، وDECISIONS.md (فوق ١ م.ب) رجع
// «ترميز غير مدعوم»، وتبديل مقطع ناقص قوس كان يُرفع كما هو فيكسر الفرع وCI.
// الطريقة: github-edit.js وgithub-write.js الحقيقيّان أمام GitHub مزيّف يسجّل كلّ نداء.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-github-edit-compile';
const GE = require('../api/_lib/github-edit.js');
const GW = require('../api/_lib/github-write.js');

const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const res = (obj, status) => ({ ok: !status || status < 400, status: status || 200, headers: new Headers(), json: async () => obj, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// files: { path: text }؛ big: مسارات تردّ عليها contents كما يردّ GitHub فوق ١ م.ب (encoding:none ومحتوى فارغ)؛
// links: مسارات وصلات رمزيّة (type:symlink بلا content).
function repo(files, big, links) {
  const calls = [];
  const bigSet = new Set(big || []);
  const linkSet = new Set(links || []);
  let blobN = 0;
  const fetchImpl = async (url, init) => {
    const u = String(url).replace('https://api.github.com', '');
    const method = (init && init.method) || 'GET';
    const accept = String((init && init.headers && init.headers.Accept) || '');
    let body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    calls.push({ method, url: u, accept, body });
    let m;
    if (method === 'GET' && u === '/repos/o/r') return res({ default_branch: 'main' });
    if (method === 'GET' && (m = /^\/repos\/o\/r\/contents\/(.+)\?ref=main$/.exec(u))) {
      const p = decodeURIComponent(m[1]);
      if (!Object.prototype.hasOwnProperty.call(files, p)) return res({ message: 'Not Found' }, 404);
      if (/raw/.test(accept)) return res(files[p]);
      if (linkSet.has(p)) return res({ type: 'symlink', path: p, size: Buffer.byteLength(files[p]), target: 'elsewhere.js' });
      if (bigSet.has(p)) return res({ type: 'file', path: p, size: Buffer.byteLength(files[p]), encoding: 'none', content: '' });
      return res({ type: 'file', path: p, size: Buffer.byteLength(files[p]), encoding: 'base64', content: b64(files[p]) });
    }
    if (method === 'GET' && /^\/repos\/o\/r\/git\/ref\/heads\/main$/.test(u)) return res({ object: { sha: 'basesha' } });
    if (method === 'GET' && /^\/repos\/o\/r\/git\/commits\/basesha$/.test(u)) return res({ tree: { sha: 'basetree' } });
    if (method === 'POST' && /^\/repos\/o\/r\/git\/blobs$/.test(u)) return res({ sha: 'blob' + (++blobN) }, 201);
    if (method === 'POST' && /^\/repos\/o\/r\/git\/trees$/.test(u)) return res({ sha: 'newtree' });
    if (method === 'POST' && /^\/repos\/o\/r\/git\/commits$/.test(u)) return res({ sha: 'abc1234567', html_url: 'https://github.com/o/r/commit/abc1234567' });
    if (method === 'POST' && /^\/repos\/o\/r\/git\/refs$/.test(u)) return res({ ref: 'refs/heads/x' }, 201);
    if (method === 'GET' && /^\/repos\/o\/r\/pulls\?/.test(u)) return res([]);
    if (method === 'POST' && /^\/repos\/o\/r\/pulls$/.test(u)) return res({ number: 9, html_url: 'https://github.com/o/r/pull/9' }, 201);
    return res({ message: 'Not Found' }, 404);
  };
  const pushedTree = () => { const c = calls.find((x) => x.method === 'POST' && /git\/trees$/.test(x.url)); return c ? c.body.tree : null; };
  const blobs = () => calls.filter((x) => x.method === 'POST' && /git\/blobs$/.test(x.url)).map((x) => x.body);
  return { calls, pushedTree, blobs, opts: { fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' } } };
}
const edit = (path, old, nw) => ({ repo: 'o/r', message: 'تعديل', edits: [{ path, old, new: nw }] });

const JS = 'const a = 1;\nfunction f() {\n  return a + 1;\n}\nmodule.exports = { f };\n';

test('edit_github: تعديل يكسر صياغة .js يُرفض بسطره ونصّه ولا يُرفع شيء؛ ESM و.mjs والملفّ المكسور أصلًا لا يُسدّ عليها', async () => {
  const g = repo({ 'api/_lib/x.js': JS });
  const out = await GE.editFiles(edit('api/_lib/x.js', 'return a + 1;', 'return a +;'), g.opts);
  assert.ok(out && out.error, 'يُرفض: ' + JSON.stringify(out).slice(0, 200));
  assert.match(out.error, /التعديل يكسر صياغة api\/_lib\/x\.js عند السطر 3: Unexpected token ';'/);
  assert.match(out.error, /\n3\| return a \+;/, 'السطر المكسور نفسه يُعرض');
  assert.match(GW.formatPush(out), /^✗ لم يُرفع شيء: التعديل يكسر صياغة/);
  assert.equal(g.pushedTree(), null, 'لا شجرة ولا التزام');
  assert.ok(!g.calls.some((c) => c.method !== 'GET'), 'لا كتابة على GitHub إطلاقًا');

  // .cjs: قوس مفتوح
  const g2 = repo({ 'scripts/y.cjs': JS });
  const out2 = await GE.editFiles(edit('scripts/y.cjs', 'return a + 1;\n}', 'return a + 1;\n'), g2.opts);
  assert.match(out2.error, /يكسر صياغة scripts\/y\.cjs/);
  assert.equal(g2.pushedTree(), null);

  // ESM: .mjs ووحدة import/export في .js لا تُترجَم كسكربت فلا تُرفض زورًا
  const ESM = "import fs from 'node:fs';\nexport const n = 1;\n";
  for (const p of ['scripts/z.mjs', 'js/esm.js']) {
    const g3 = repo({ [p]: ESM });
    const ok = await GE.editFiles(edit(p, 'n = 1', 'n = 2'), g3.opts);
    assert.equal(ok.ok, true, p + ': ' + JSON.stringify(ok).slice(0, 200));
    assert.equal(g3.pushedTree()[0].content, ESM.replace('n = 1', 'n = 2'));
  }

  // صياغة وحدات بلا import/export في رأس سطر (import.meta، await في الرأس) ليست كسرًا
  for (const add of ['const u = import.meta.url;', 'await Promise.resolve(1);']) {
    const gm = repo({ 'js/mod.js': 'const n = 1;\n' });
    const okm = await GE.editFiles(edit('js/mod.js', 'const n = 1;', 'const n = 1;\n' + add), gm.opts);
    assert.equal(okm.ok, true, add + ': ' + JSON.stringify(okm).slice(0, 200));
  }

  // return في نطاق وحدة CommonJS مشروع (node --check يقبله) فلا يُرفض
  const g6 = repo({ 'tests/skip.test.cjs': "const t = 1;\nmodule.exports = t;\n" });
  const ok6 = await GE.editFiles(edit('tests/skip.test.cjs', 'const t = 1;', 'if (!process.env.X) return;\nconst t = 1;'), g6.opts);
  assert.equal(ok6.ok, true, JSON.stringify(ok6).slice(0, 200));

  // ملفّ مكسور أصلًا: التعديل لا يُسدّ عليه (قد يكون هو الإصلاح التالي) — الرفض لمن يكسر السليم فقط
  const g4 = repo({ 'js/broken.js': 'const a = ;\nconst b = 1;\n' });
  const ok4 = await GE.editFiles(edit('js/broken.js', 'const b = 1;', 'const b = 2;'), g4.opts);
  assert.equal(ok4.ok, true, JSON.stringify(ok4).slice(0, 200));

  // تعديل سليم يمرّ ويُرفع كما هو
  const g5 = repo({ 'api/_lib/x.js': JS });
  const ok5 = await GE.editFiles(edit('api/_lib/x.js', 'return a + 1;', 'return a + 2;'), g5.opts);
  assert.equal(ok5.ok, true);
  assert.deepEqual(g5.pushedTree(), [{ path: 'api/_lib/x.js', mode: '100644', type: 'blob', content: JS.replace('a + 1', 'a + 2') }]);
});

test('edit_github: JSON مكسور يُرفض بسطره، والسليم يمرّ', async () => {
  const PKG = '{\n  "name": "x",\n  "version": "1.0.0"\n}\n';
  const g = repo({ 'package.json': PKG });
  const out = await GE.editFiles(edit('package.json', '"version": "1.0.0"', '"version": "1.0.0",'), g.opts);
  assert.match(out.error, /التعديل يكسر صياغة package\.json عند السطر 4/);
  assert.equal(g.pushedTree(), null);
  const g2 = repo({ 'package.json': PKG });
  assert.equal((await GE.editFiles(edit('package.json', '1.0.0', '1.0.1'), g2.opts)).ok, true);
});

test('edit_github: ملفّ بحجم app-09 (~٥٧٧ ألف حرف) يمرّ سقف الحجم؛ write_github يبقى على ٢٠٠ ألف', async () => {
  const line = '  x = x + 1; // سطر عربيّ لملء الحجم\n';
  const big = 'let x = 0;\n' + line.repeat(Math.ceil(577000 / line.length)) + 'const END = 1;\n';
  assert.ok(big.length > 570000 && big.length > GW.LIMITS.perFile);
  const g = repo({ 'js/app-09-attach.js': big });
  const out = await GE.editFiles(edit('js/app-09-attach.js', 'const END = 1;', 'const END = 2;'), g.opts);
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 200));
  // فوق سقف write_github: blob أوّلًا (/git/blobs موثّق حتّى ١٠٠ م.ب) والشجرة تشير إلى sha لا محتوى مضمَّن
  assert.deepEqual(g.blobs(), [{ content: big.replace('const END = 1;', 'const END = 2;'), encoding: 'utf-8' }]);
  assert.deepEqual(g.pushedTree(), [{ path: 'js/app-09-attach.js', mode: '100644', type: 'blob', sha: 'blob1' }]);
  // ملفّان كبيران معًا (مجموع فوق مليون) في تعديل واحد
  const g2 = repo({ 'js/a.js': big, 'js/b.js': big });
  const two = await GE.editFiles({ repo: 'o/r', message: 'م', edits: [{ path: 'js/a.js', old: 'const END = 1;', new: 'const END = 3;' }, { path: 'js/b.js', old: 'const END = 1;', new: 'const END = 4;' }] }, g2.opts);
  assert.equal(two.ok, true, JSON.stringify(two).slice(0, 200));
  assert.equal(g2.blobs().length, 2);
  assert.ok(g2.pushedTree().every((e) => /^blob\d$/.test(e.sha) && e.content === undefined), JSON.stringify(g2.pushedTree()).slice(0, 200));
  // الصغير يبقى مضمَّنًا كما كان (لا blob)
  const g4 = repo({ 'js/s.js': JS });
  assert.equal((await GE.editFiles(edit('js/s.js', 'a + 1', 'a + 5'), g4.opts)).ok, true);
  assert.deepEqual(g4.blobs(), []);
  assert.equal(g4.pushedTree()[0].content, JS.replace('a + 1', 'a + 5'));
  // write_github (محتوى يولّده النموذج كاملًا) لم يتغيّر
  assert.equal(GW.LIMITS.perFile, 200000);
  assert.match(GW.validateInput({ files: [{ path: 'js/app-09-attach.js', content: big }] }).error, /أكبر من 200000 حرفًا/);
  const g3 = repo({});
  const w = await GW.pushFiles({ repo: 'o/r', message: 'm', files: [{ path: 'js/app-09-attach.js', content: big }] }, g3.opts);
  assert.match(w.error, /أكبر من 200000/);
  // ولا يرفع النموذج السقف من مدخله: fromEdit في المدخل لا أثر له
  const w2 = await GW.pushFiles({ repo: 'o/r', message: 'm', fromEdit: true, files: [{ path: 'js/app-09-attach.js', content: big }] }, repo({}).opts);
  assert.match(w2.error, /أكبر من 200000/);
});

test('edit_github: ملفّ فوق ١ م.ب (encoding:none) يُقرأ بالنوع الخامّ ويُعدَّل', async () => {
  const head = '# سجلّ القرارات\n\n## v-new\n';
  const decisions = head + ('- قرار قديم بالعربيّة يملأ الملفّ حتّى يتجاوز الميغابايت.\n').repeat(12000);
  assert.ok(Buffer.byteLength(decisions) > 1048576);
  const g = repo({ 'knowledge/DECISIONS.md': decisions }, ['knowledge/DECISIONS.md']);
  const out = await GE.editFiles(edit('knowledge/DECISIONS.md', '## v-new\n', '## v-claude-code-level\n'), g.opts);
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 200));
  const reads = g.calls.filter((c) => /\/contents\/knowledge%2FDECISIONS\.md|\/contents\/knowledge\/DECISIONS\.md/.test(c.url));
  assert.equal(reads.length, 2, 'نداء JSON ثمّ نداء خامّ');
  assert.match(reads[1].accept, /application\/vnd\.github\.raw/);
  assert.equal(g.blobs()[0].content, decisions.replace('## v-new\n', '## v-claude-code-level\n'));
  // وصلة رمزيّة (بلا content) لا تُقرأ خامًا فتُستبدل بنصّ هدفها كملفّ عاديّ
  const gl = repo({ 'js/link.js': 'const a = 1;\n' }, [], ['js/link.js']);
  const lk = await GE.editFiles(edit('js/link.js', 'a = 1', 'a = 2'), gl.opts);
  assert.ok(lk && lk.error, JSON.stringify(lk).slice(0, 200));
  assert.ok(!gl.calls.some((c) => /raw/.test(c.accept)), 'لا نداء خامّ للوصلة');
  assert.equal(gl.pushedTree(), null);
});
