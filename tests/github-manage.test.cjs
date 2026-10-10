// tests/github-manage.test.cjs — v-agent-manage: حالة الطلبات والتشغيلات وإدارتها، والتسكير والحذف بفعل صريح من المالك.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-github-manage';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const GM = require('../api/_lib/github-manage.js');

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
const repo = { full_name: 'o/r' };

test('الإذن: التسكير والحذف والإلغاء بفعل صريح، والنفي يمنع، والقراءة بلا إذن', () => {
  assert.equal(GM.ownerAllows('close', 'سكّر #959 و#954'), true);
  assert.equal(GM.ownerAllows('close', 'سكر الطلبات الزايدة'), true);
  assert.equal(GM.ownerAllows('close', 'لا تسكّر #959'), false);
  assert.equal(GM.ownerAllows('close', 'شو حالة #959؟'), false);
  assert.equal(GM.ownerAllows('delete_runs', 'احذف التشغيلات الفاشلة'), true);
  assert.equal(GM.ownerAllows('delete_branch', 'ما تحذف الفرع'), false);
  assert.equal(GM.ownerAllows('cancel_run', 'وقّف التشغيل'), true);
  assert.equal(GM.ownerAllows('reopen', 'افتح #954 مرة ثانية'), true);
  for (const a of ['status', 'runs', 'run_jobs', 'comment', 'rerun_failed']) assert.equal(GM.ownerAllows(a, ''), true, a);
});

test('status: يميّز المسألة من طلب السحب، ويذكر التعارض والفحوص', async () => {
  const n = net([
    ['GET', /\/issues\/956$/, res({ state: 'open', title: 'مهمّة' })],
    ['GET', /\/issues\/959$/, res({ state: 'open', title: 'إصلاح', pull_request: {} })],
    ['GET', /\/pulls\/959$/, res({ merged: false, mergeable: false, head: { ref: 'b1', sha: 's1' }, base: { ref: 'main' } })],
    ['GET', /\/commits\/s1\/check-runs/, res({ check_runs: [{ name: 'Vercel', conclusion: 'success' }] })],
  ]);
  const r = await GM.manage({ repo: 'o/r', action: 'status', numbers: [956, 959] }, n.opts);
  assert.match(r.text, /#956 مسألة · مفتوحة/);
  assert.match(r.text, /#959 طلب سحب · مفتوح[\s\S]*تعارض مع main[\s\S]*Vercel success/);
});

test('close: الطلب يُسكّر عبر pulls بلا سبب، والمسألة عبر issues بسبب not_planned، والفرع يُحذف عند الطلب', async () => {
  const n = net([
    ['GET', /\/issues\/959$/, res({ state: 'open', pull_request: {} })],
    ['PATCH', /\/pulls\/959$/, res({ state: 'closed', head: { ref: 'omran-agent/x', repo }, base: { repo } })],
    ['GET', /\/issues\/956$/, res({ state: 'open' })],
    ['PATCH', /\/issues\/956$/, res({ state: 'closed' })],
    ['GET', /^\/repos\/o\/r$/, res({ default_branch: 'main' })],
    ['GET', /\/branches\/omran-agent%2Fx$/, res({ protected: false })],
    ['DELETE', /\/git\/refs\/heads\/omran-agent\/x$/, res(null, 204)],
  ]);
  const r = await GM.manage({ repo: 'o/r', action: 'close', numbers: [959, 956], delete_branch: true }, n.opts);
  assert.match(r.text, /✅ #959 سُكّر · حُذف الفرع omran-agent\/x/);
  assert.match(r.text, /✅ #956 سُكّر/);
  assert.deepEqual(n.calls.find((c) => c.method === 'PATCH' && /pulls/.test(c.url)).body, { state: 'closed' });
  assert.deepEqual(n.calls.find((c) => c.method === 'PATCH' && /issues/.test(c.url)).body, { state: 'closed', state_reason: 'not_planned' });
});

test('delete_branch: main والافتراضيّ والمحميّ لا تُحذف', async () => {
  const n = net([
    ['GET', /^\/repos\/o\/r$/, res({ default_branch: 'dev' })],
    ['GET', /\/branches\/keep$/, res({ protected: true })],
  ]);
  const r = await GM.manage({ repo: 'o/r', action: 'delete_branch', branches: ['main', 'dev', 'keep'] }, n.opts);
  assert.match(r.text, /✗ لا يُحذف الفرع main/);
  assert.match(r.text, /✗ لا يُحذف الفرع الافتراضيّ/);
  assert.match(r.text, /✗ الفرع keep محميّ/);
  assert.ok(!n.calls.some((c) => c.method === 'DELETE'));
});

test('runs وdelete_runs: الفاشلة المكتملة فقط، بتصفية الـworkflow', async () => {
  const runs = { total_count: 3, workflow_runs: [
    { id: 1, name: 'CI', status: 'completed', conclusion: 'failure', head_branch: 'main', created_at: '2026-10-10T08:00:00Z', head_commit: { message: 'x' } },
    { id: 2, name: 'Smoke after deploy', status: 'completed', conclusion: 'failure', head_branch: 'main' },
    { id: 3, name: 'CI', status: 'in_progress', conclusion: null, head_branch: 'main' },
  ] };
  const n = net([
    ['GET', /\/actions\/runs\?per_page=50&status=failure$/, res(runs)],
    ['GET', /\/actions\/runs\?per_page=15&status=failure$/, res(runs)],
    ['DELETE', /\/actions\/runs\/1$/, res(null, 204)],
  ]);
  const l = await GM.manage({ repo: 'o/r', action: 'runs', status: 'failure' }, n.opts);
  assert.match(l.text, /^المجموع: 3\n1 · CI · failure · main · 2026-10-10 08:00 · x/);
  const d = await GM.manage({ repo: 'o/r', action: 'delete_runs', workflow: 'CI' }, n.opts);
  assert.match(d.text, /✅ حُذف 1 من 1/);
  assert.deepEqual(n.calls.filter((c) => c.method === 'DELETE').map((c) => c.url), ['/repos/o/r/actions/runs/1']);
});

test('مدخلات خاطئة تُرفض بسبب واضح', async () => {
  const n = net([]);
  assert.match((await GM.manage({ repo: 'o/r', action: 'nuke' }, n.opts)).error, /إجراء غير معروف/);
  assert.match((await GM.manage({ action: 'status', number: 1 }, n.opts)).error, /حدّد المستودع/);
  assert.match((await GM.manage({ repo: 'o/r', action: 'close' }, n.opts)).error, /number/);
  assert.match((await GM.manage({ repo: 'o/r', action: 'run_jobs' }, n.opts)).error, /run_id/);
  assert.match(GM.formatManage({ error: 'x' }), /^✗ x/);
});

test('الربط: الأداة للمالك وحده في الوكيل والمحادثة، والإذن يفحصه الخادم من آخر رسالة', () => {
  const A = require('../api/_lib/agent.js').__test;
  assert.ok(!A.toolsFor('__nobody__').map((t) => t.name).includes('manage_github'));
  const agent = read('api/_lib/agent.js');
  assert.match(agent, /githubEdit\.MERGE_TOOL, githubManage\.MANAGE_TOOL\]/);
  assert.match(agent, /cb\.name === 'manage_github'[\s\S]{0,300}isOwner\(runUser\)[\s\S]{0,200}githubManage\.ownerAllows\(act, living\.lastUserText\(messages\)\)/);
  const chat = read('api/_lib/chat.js');
  assert.match(chat, /const OWNER_TOOLS = \[[^\n]*require\('\.\/github-manage\.js'\)\.MANAGE_TOOL\]/);
  assert.match(chat, /cb\.name === 'manage_github'[\s\S]{0,300}__ownerReq[\s\S]{0,200}__gm\.ownerAllows\(__act, lastUserText\)/);
  const GE = require('../api/_lib/github-edit.js');
  assert.match(GE.WORK_NOTE, /الحالة تُفحص لا تُفترض/);
  assert.match(GE.WORK_NOTE, /لا تخترع ولا تربط بلا دليل/);
  assert.match(read('api/_lib/_knowledge.js'), /خريطة المستودع/);
});
