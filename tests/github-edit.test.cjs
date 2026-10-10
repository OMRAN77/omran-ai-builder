// tests/github-edit.test.cjs — v-agent-surgical: تعديل جراحيّ بمقطع قديم ← جديد، ودمج بأمر «ادمج» وحده.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-github-edit';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const GE = require('../api/_lib/github-edit.js');

const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const res = (obj, status) => ({ ok: !status || status < 400, status: status || 200, headers: new Headers(), json: async () => obj, text: async () => JSON.stringify(obj) });
function net(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url).replace('https://api.github.com', '');
    const method = (init && init.method) || 'GET';
    let body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    calls.push({ method, url: u, body });
    for (const [m, re, r] of routes) if (m === method && re.test(u)) return typeof r === 'function' ? r(u, body) : r;
    return res({ message: 'Not Found' }, 404);
  };
  return { calls, opts: { fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' } } };
}
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const FILE = 'a{color:red}\n#btn{color:gold}\nb{x:1}\nb{x:1}\n';
const routes = [
  ['GET', /^\/repos\/o\/r$/, res({ default_branch: 'main' })],
  ['GET', /^\/repos\/o\/r\/contents\/css\/x\.css\?ref=main$/, res({ content: b64(FILE), encoding: 'base64' })],
  ['GET', /^\/repos\/o\/r\/git\/ref\/heads\/main$/, res({ object: { sha: 'basesha' } })],
  ['GET', /^\/repos\/o\/r\/git\/commits\/basesha$/, res({ tree: { sha: 'basetree' } })],
  ['POST', /^\/repos\/o\/r\/git\/trees$/, res({ sha: 'newtree' })],
  ['POST', /^\/repos\/o\/r\/git\/commits$/, res({ sha: 'abc1234567', html_url: 'https://github.com/o/r/commit/abc1234567' })],
  ['POST', /^\/repos\/o\/r\/git\/refs$/, res({ ref: 'refs/heads/x' }, 201)],
  ['GET', /^\/repos\/o\/r\/pulls\?/, res([])],
  ['POST', /^\/repos\/o\/r\/pulls$/, res({ number: 7, html_url: 'https://github.com/o/r/pull/7' }, 201)],
];

test('applyEdits: فريد يُبدَّل، الغائب والمكرّر يُرفضان بإرشاد، all يبدّل الكلّ', () => {
  assert.equal(GE.applyEdits({ f: FILE }, [{ path: 'f', old: '#btn{color:gold}', new: '#btn{color:#2b1d02}' }]).texts.f, FILE.replace('gold', '#2b1d02'));
  assert.match(GE.applyEdits({ f: FILE }, [{ path: 'f', old: 'nope', new: 'x' }]).error, /غير موجود حرفيًّا/);
  assert.match(GE.applyEdits({ f: FILE }, [{ path: 'f', old: 'b{x:1}', new: 'b{x:2}' }]).error, /يطابق 2 مواضع/);
  assert.equal(GE.applyEdits({ f: FILE }, [{ path: 'f', old: 'b{x:1}', new: 'b{x:2}', all: true }]).texts.f.includes('b{x:1}'), false);
  // $ في النصّ الجديد يبقى حرفيًّا (لا أنماط replace)
  assert.ok(GE.applyEdits({ f: FILE }, [{ path: 'f', old: 'a{color:red}', new: 'a{content:"$&"}' }]).texts.f.startsWith('a{content:"$&"}'));
});

test('validateEdits: مسارات آمنة ونصوص وسقوف', () => {
  assert.match(GE.validateEdits({}).error, /لا تعديلات/);
  assert.match(GE.validateEdits({ edits: [{ path: '../x', old: 'a', new: 'b' }] }).error, /مسار/);
  assert.match(GE.validateEdits({ edits: [{ path: 'a.js', old: '', new: 'b' }] }).error, /غير فارغ/);
  assert.match(GE.validateEdits({ edits: [{ path: 'a.js', old: 'a', new: 'a' }] }).error, /لا تغيير/);
});

test('editFiles: يقرأ الملفّ من GitHub ويرفع النصّ المعدّل كاملًا إلى فرع جديد ويفتح طلب سحب', async () => {
  const n = net(routes);
  const out = await GE.editFiles({ repo: 'o/r', message: 'توضيح السهم', edits: [{ path: 'css/x.css', old: '#btn{color:gold}', new: '#btn{color:#2b1d02}' }] }, n.opts);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.prNumber, 7);
  assert.ok(out.branch.startsWith('omran-agent/'));
  const tree = n.calls.find((c) => c.method === 'POST' && /git\/trees$/.test(c.url)).body.tree;
  assert.deepEqual(tree, [{ path: 'css/x.css', mode: '100644', type: 'blob', content: FILE.replace('gold', '#2b1d02') }]);
  const bad = await GE.editFiles({ repo: 'o/r', message: 'x', edits: [{ path: 'css/x.css', old: 'nope', new: 'y' }] }, net(routes).opts);
  assert.match(bad.error, /غير موجود حرفيًّا/);
});

test('ownerSaidMerge: «ادمج» تأذن، و«لا تدمج» لا', () => {
  for (const s of ['ادمج', 'تمام ادمجه', 'merge it']) assert.equal(GE.ownerSaidMerge(s), true, s);
  for (const s of ['لا تدمج', 'لا ادمج', 'ارفع بس', "don't merge", '']) assert.equal(GE.ownerSaidMerge(s), false, s);
});

test('mergePr: يدمج المفتوح بـsquash ورأسه، ويرفض المتعارض والمغلق', async () => {
  const n = net([
    ['GET', /^\/repos\/o\/r\/pulls\/5$/, res({ state: 'open', mergeable: true, head: { sha: 'h1' }, base: { ref: 'main' }, html_url: 'https://github.com/o/r/pull/5' })],
    ['PUT', /^\/repos\/o\/r\/pulls\/5\/merge$/, res({ merged: true, sha: 'm123456789' })],
  ]);
  const ok = await GE.mergePr({ repo: 'o/r', number: 5 }, n.opts);
  assert.equal(ok.ok, true);
  assert.deepEqual(n.calls.find((c) => c.method === 'PUT').body, { merge_method: 'squash', sha: 'h1' });
  assert.match(GE.formatMerge(ok), /دُمج طلب السحب #5/);
  const c = await GE.mergePr({ repo: 'o/r', number: 6 }, net([['GET', /pulls\/6$/, res({ state: 'open', mergeable: false })]]).opts);
  assert.match(c.error, /تعارض/);
  const cl = await GE.mergePr({ repo: 'o/r', number: 8 }, net([['GET', /pulls\/8$/, res({ state: 'closed' })]]).opts);
  assert.match(cl.error, /مغلق/);
});

test('agent.js: الأداتان للمالك وحده، والدمج يفحص «ادمج» في الخادم، وطريقة العمل في نظام المالك', () => {
  const A = require('../api/_lib/agent.js').__test;
  const ownerNames = A.toolsFor('__nobody__').map((t) => t.name);
  assert.ok(!ownerNames.includes('edit_github') && !ownerNames.includes('merge_github'));
  const src = read('api/_lib/agent.js');
  assert.match(src, /cb\.name === 'merge_github'[\s\S]{0,200}githubEdit\.ownerSaidMerge\(living\.lastUserText\(messages\)\)/);
  assert.match(src, /cb\.name === 'edit_github'[\s\S]{0,200}isOwner\(runUser\)/);
  assert.match(src, /system \+= OWNER_ENGINEERING_NOTE \+ OWNER_COMMAND_NOTE/);
  assert.match(src, /عدّل الملفّات القائمة بـedit_github/);
});
