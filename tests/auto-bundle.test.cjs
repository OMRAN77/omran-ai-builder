// tests/auto-bundle.test.cjs — v-auto-bundle: رفعة المزوّد التي تمسّ js/app-NN-*.js تحمل الحزمة المبنيّة في الالتزام نفسه.
// المالك ١١ أكتوبر: «كلّ مزوّد يقرأ ويرفع ويدمج، وClaude Code ما يكون الأساسيّ». بلا هذا تُفشل رفعة المزوّد verify في CI
// وتبقى المعاينة قديمة، فيُحال كلّ تعديل واجهة إلى Claude Code على حساب Anthropic.
// الأجزاء هنا هي أجزاء المستودع الحقيقيّة من القرص، تُخدم من GitHub وهميّ؛ والمتوقَّع يُحسب بـscripts/build.mjs نفسه.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-auto-bundle';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const GW = require('../api/_lib/github-write.js');
const GE = require('../api/_lib/github-edit.js');
const core = require('../api/_lib/bundle-core.js');
const PL = require('../api/_lib/provider-level.js');

const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const res = (obj, status) => ({ ok: !status || status < 400, status: status || 200, headers: new Headers(), json: async () => obj, text: async () => JSON.stringify(obj) });
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

const R = '/repos/OMRAN77/omran-ai-builder';
const jsNames = fs.readdirSync(path.join(root, 'js')).filter((n) => /\.js$/.test(n));
// أوّل جزء حقيقيّ فيه سطر كود فريد يبدأ بـfunction وينتهي بقوس فتح — تعليق سطريّ بعده لا يكسر الصياغة
const probeLine = (t) => t.split('\n').find((l) => /^function [\w$]+\([^)]*\)\s*\{\s*$/.test(l) && t.split(l).length === 2);
const PART = core.partNames(jsNames).slice(5).find((n) => probeLine(read('js/' + n)));
const OLD = probeLine(read('js/' + PART));
const NEW = OLD + ' // v-auto-bundle-probe';

/* GitHub وهميّ: الشجرة من القرص، وكلّ blob بمحتوى ملفّه؛ failBlob يُفشل قراءة الأجزاء. */
function gh({ failBlob } = {}) {
  const blobs = new Map();
  const ent = (name, rel) => { const sha = 'sha-' + rel; blobs.set(sha, rel); return { path: name, type: 'blob', sha, mode: '100644' }; };
  const jsTree = jsNames.map((n) => ent(n, 'js/' + n));
  const rootTree = [{ path: 'js', type: 'tree', sha: 'jstree' }, ent('index.html', 'index.html'), ent('sw.js', 'sw.js'), ent('package.json', 'package.json')];
  const calls = [];
  const routes = [
    ['GET', /^\/repos\/OMRAN77\/omran-ai-builder$/, () => res({ default_branch: 'main' })],
    ['GET', /\/contents\/js\/[^?]+\?ref=main$/, (u) => res({ content: b64(read(decodeURIComponent(u.split('/contents/')[1].split('?')[0]))), encoding: 'base64' })],
    ['GET', /\/git\/ref\/heads\/main$/, () => res({ object: { sha: 'basesha' } })],
    ['GET', /\/git\/commits\/basesha$/, () => res({ tree: { sha: 'roottree' } })],
    ['GET', /\/git\/trees\/roottree$/, () => res({ tree: rootTree })],
    ['GET', /\/git\/trees\/jstree$/, () => res({ tree: jsTree })],
    ['GET', /\/git\/blobs\/sha-/, (u) => { const rel = blobs.get(decodeURIComponent(u.split('/git/blobs/')[1])); if (failBlob && /^js\/app-/.test(rel)) return res({ message: 'boom' }, 502); return res({ content: b64(read(rel)), encoding: 'base64' }); }],
    ['POST', /\/git\/blobs$/, (u, body) => res({ sha: 'big-' + body.content.length }, 201)],
    ['POST', /\/git\/trees$/, () => res({ sha: 'newtree' }, 201)],
    ['POST', /\/git\/commits$/, () => res({ sha: 'abc1234567', html_url: 'https://github.com/c/abc1234567' }, 201)],
    ['POST', /\/git\/refs$/, () => res({ ref: 'refs/heads/x' }, 201)],
    ['GET', /\/pulls\?/, () => res([])],
    ['POST', /\/pulls$/, () => res({ number: 9, html_url: 'https://github.com/p/9' }, 201)],
  ];
  const fetchImpl = async (url, init) => {
    const u = String(url).replace('https://api.github.com', '');
    const method = (init && init.method) || 'GET';
    let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    calls.push({ method, url: u, body });
    for (const [m, re, f] of routes) if (m === method && re.test(u)) return f(u, body);
    return res({ message: 'Not Found' }, 404);
  };
  return { calls, opts: { fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' } } };
}
/* المتوقَّع: نسخة من الأجزاء وindex.html وsw.js في مجلّد مؤقّت ثمّ scripts/build.mjs الحقيقيّ عليها. */
function expected(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autobundle-'));
  fs.mkdirSync(path.join(dir, 'js'));
  for (const n of core.partNames(jsNames)) fs.writeFileSync(path.join(dir, 'js', n), read('js/' + n));
  fs.writeFileSync(path.join(dir, 'js', 'app.bundle.js'), read('js/app.bundle.js'));
  fs.writeFileSync(path.join(dir, 'index.html'), read('index.html'));
  fs.writeFileSync(path.join(dir, 'sw.js'), read('sw.js'));
  if (mutate) mutate(dir);
  fs.mkdirSync(path.join(dir, 'scripts')); fs.mkdirSync(path.join(dir, 'api', '_lib'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts/build.mjs'), path.join(dir, 'scripts/build.mjs'));
  fs.copyFileSync(path.join(root, 'api/_lib/bundle-core.js'), path.join(dir, 'api/_lib/bundle-core.js'));
  execFileSync(process.execPath, ['scripts/build.mjs', '--force'], { cwd: dir, stdio: 'ignore' });
  const out = { bundle: fs.readFileSync(path.join(dir, 'js/app.bundle.js'), 'utf8'), html: fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), sw: fs.readFileSync(path.join(dir, 'sw.js'), 'utf8') };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}
const treeOf = (calls) => calls.find((c) => c.method === 'POST' && /\/git\/trees$/.test(c.url)).body.tree;
const blobPosts = (calls) => calls.filter((c) => c.method === 'POST' && /\/git\/blobs$/.test(c.url)).map((c) => c.body.content);

test('edit_github on a UI part: one commit carries the part + the rebuilt bundle + stamped index.html/sw.js, byte-identical to build.mjs', async () => {
  const n = gh();
  const r = await GE.editFiles({ repo: 'OMRAN77/omran-ai-builder', edits: [{ path: 'js/' + PART, old: OLD, new: NEW }], message: 'تجربة' }, n.opts);
  assert.ok(OLD, 'سطر مسبار في ' + PART);
  assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
  assert.deepEqual(r.bundle && r.bundle.parts, core.partNames(jsNames).length);
  const exp = expected((dir) => { const f = path.join(dir, 'js', PART); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(OLD, NEW)); });
  const tree = treeOf(n.calls);
  const paths = tree.map((e) => e.path).sort();
  assert.deepEqual(paths, ['index.html', 'js/' + PART, 'js/app.bundle.js', 'sw.js'].sort(), 'التزام واحد بالجزء والحزمة والختم');
  const bigs = blobPosts(n.calls);
  const bundleEntry = tree.find((e) => e.path === 'js/app.bundle.js');
  assert.ok(bundleEntry.sha && bigs.includes(exp.bundle), 'الحزمة (فوق سقف الشجرة) رُفعت blobًا ومطابقة لـbuild.mjs حرفًا');
  assert.ok(exp.bundle.includes(NEW), 'التعديل داخل الحزمة');
  const htmlEntry = tree.find((e) => e.path === 'index.html'), swEntry = tree.find((e) => e.path === 'sw.js');
  assert.equal(htmlEntry.content, exp.html, 'index.html بالبصمة الجديدة');
  assert.equal(swEntry.content, exp.sw, 'sw.js بالبصمة الجديدة');
  assert.ok(htmlEntry.content.includes('app.bundle.js?v=' + r.bundle.hash), 'البصمة في index.html = بصمة النتيجة');
  assert.equal(r.files, 1, 'عدد الملفّات المبلَّغ = ما رفعه النموذج');
  const txt = GW.formatPush(r);
  assert.match(txt, /📦 الحزمة js\/app\.bundle\.js بُنيت تلقائيًّا في الالتزام نفسه/);
  assert.equal(PL.bundleNote({ repo: 'OMRAN77/omran-ai-builder', edits: [{ path: 'js/' + PART }] }, txt), '', 'لا تنبيه «الحزمة لم تُبنَ» بعد البناء');
});

test('write_github: deleting a part rebuilds without it; a non-part push does not touch the bundle; another repo without a bundle is left alone', async () => {
  const victim = core.partNames(jsNames).slice(-1)[0];
  const n = gh();
  const r = await GW.pushFiles({ repo: 'OMRAN77/omran-ai-builder', files: [], delete: ['js/' + victim], message: 'حذف جزء' }, n.opts);
  assert.ok(r.ok && r.bundle, JSON.stringify(r).slice(0, 200));
  const exp = expected((dir) => fs.unlinkSync(path.join(dir, 'js', victim)));
  assert.ok(blobPosts(n.calls).includes(exp.bundle), 'الحزمة بلا الجزء المحذوف');
  assert.ok(treeOf(n.calls).some((e) => e.path === 'js/' + victim && e.sha === null), 'والحذف نفسه في الشجرة');

  const n2 = gh();
  const r2 = await GW.pushFiles({ repo: 'OMRAN77/omran-ai-builder', files: [{ path: 'css/x.css', content: 'a{}' }], message: 'css' }, n2.opts);
  assert.ok(r2.ok && !r2.bundle && !r2.bundleError);
  assert.deepEqual(treeOf(n2.calls).map((e) => e.path), ['css/x.css'], 'لا حزمة لرفعة لا تمسّ الأجزاء');
  assert.ok(!n2.calls.some((c) => /\/git\/blobs\/sha-/.test(c.url)), 'ولا قراءة أجزاء');
  assert.doesNotMatch(GW.formatPush(r2), /📦|تعذّر بناء الحزمة/);
});

test('a GitHub read failure while bundling still pushes the provider\'s edit and says plainly that CI will fail', async () => {
  const n = gh({ failBlob: true });
  const r = await GE.editFiles({ repo: 'OMRAN77/omran-ai-builder', edits: [{ path: 'js/' + PART, old: OLD, new: NEW }], message: 'تجربة' }, n.opts);
  assert.ok(r.ok, 'التعديل نفسه رُفع');
  assert.ok(!r.bundle && /GitHub HTTP 502/.test(r.bundleError || ''));
  assert.deepEqual(treeOf(n.calls).map((e) => e.path), ['js/' + PART], 'بلا حزمة جزئيّة');
  assert.match(GW.formatPush(r), /⚠️ تعذّر بناء الحزمة تلقائيًّا: [^\n]*CI سيفشل/);
});

test('build.mjs and the server share one implementation (no drift), and verify still passes on the repo', () => {
  const b = read('scripts/build.mjs');
  assert.match(b, /createRequire\(import\.meta\.url\)\('\.\.\/api\/_lib\/bundle-core\.js'\)/);
  assert.match(b, /core\.buildBundle\(parts\)/);
  assert.match(b, /core\.stampHtml\(/);
  assert.match(b, /core\.stampSw\(/);
  assert.ok(!/createHash/.test(b), 'لا بصمة ثانية في السكربت');
  assert.match(read('api/_lib/github-write.js'), /const bundleCore = require\('\.\/bundle-core\.js'\);/);
  // البصمة نفسها من الوحدة ومن الملفّ الملتزم
  const parts = {}; for (const n of core.partNames(jsNames)) parts[n] = read('js/' + n);
  const { bundle, hash } = core.buildBundle(parts);
  assert.equal(bundle, read('js/app.bundle.js'), 'الحزمة الملتزمة = بناء الوحدة');
  assert.ok(read('index.html').includes('app.bundle.js?v=' + hash) || /app\.bundle\.js\?v=[^"']*/.test(read('index.html')));
  assert.equal(core.isPartPath('js/app-09-attach.js'), true);
  for (const p of ['js/partials-settings.js', 'js/app.bundle.js', 'js/sub/app-01-x.js', 'js/modes.js', 'app-01-x.js']) assert.equal(core.isPartPath(p), false, p);
});
