// tests/agent-delegate.test.cjs — v-agent-delegate: «أبي الوكيل نفسك بالضبط».
// وكيل التطبيق يسلّم المهمّة إلى Claude Code داخل GitHub Actions ويتحقّق منها. شبكة مزيّفة
// كاملة: يثبت فتح المسألة وتشغيل الورك فلو بمدخلاته، وقراءة الحالة من التعليقات، وفتح
// طلب السحب بمفتاح المالك عند اكتمال الدفع، والأداتين للمالك وحده، وسلامة الورك فلو.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-delegate';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const D = require('../api/_lib/agent-delegate.js');

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
  return { calls, opts: { fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' }, now: 1_700_000_000_000 } };
}

test('startTask: opens the task issue, then dispatches the workflow with task/branch/issue/base', async () => {
  const n = net([
    ['POST', /^\/repos\/OMRAN77\/omran-ai-builder\/issues$/, (u, b) => res({ number: 7, html_url: 'https://github.com/OMRAN77/omran-ai-builder/issues/7', title: b.title }, 201)],
    ['POST', /^\/repos\/OMRAN77\/omran-ai-builder\/actions\/workflows\/omran-agent\.yml\/dispatches$/, res(null, 204)],
  ]);
  const r = await D.startTask({ task: 'أصلح تحليل الصورة في api/_lib/chat.js: الصورة لا تصل النموذج' }, n.opts);
  assert.equal(r.ok, true);
  assert.equal(r.issue, 7);
  assert.match(r.branch, /^omran-agent\/[a-z0-9-]*-[a-z0-9]+$/, 'فرع بالبادئة omran-agent/');
  assert.equal(n.calls[0].method, 'POST'); assert.match(n.calls[0].body.title, /^🤖 مهمّة الوكيل: /);
  assert.ok(n.calls[0].body.body.includes('**الفرع:** `' + r.branch + '`') && n.calls[0].body.body.includes('**الأساس:** `main`'), 'المسألة تحمل الفرع والأساس لقراءتهما لاحقًا');
  const d = n.calls[1];
  assert.equal(d.method, 'POST');
  assert.deepEqual(d.body, { ref: 'main', inputs: { task: 'أصلح تحليل الصورة في api/_lib/chat.js: الصورة لا تصل النموذج', branch: r.branch, issue: '7', base: 'main' } });
  const txt = D.formatStart(r);
  assert.ok(txt.startsWith('🚀') && txt.includes(r.issueUrl) && txt.includes('check_code_task') && /لا يوجد طلب سحب بعد/.test(txt), 'الناتج: بدأت، الروابط، لا طلب سحب بعد');
  // مهمّة قصيرة مرفوضة قبل أيّ نداء
  const bad = await D.startTask({ task: 'أصلح' }, net([]).opts);
  assert.match(bad.error, /صف المهمّة/);
  // الورك فلو غائب على الفرع → خطأ واضح مع رابط المسألة المفتوحة
  const n2 = net([['POST', /\/issues$/, res({ number: 8, html_url: 'https://github.com/o/r/issues/8' }, 201)]]);
  const r2 = await D.startTask({ task: 'مهمّة طويلة بما يكفي للقبول', repo: 'o/r' }, n2.opts);
  assert.match(r2.error, /omran-agent\.yml/); assert.equal(r2.issue, 8);
  assert.match(D.formatStart(r2), /^✗ لم تبدأ المهمّة/);
});

test('checkTask: queued → running → done (opens the PR with the owner key, reads checks) → nochange', async () => {
  const issueBody = '**المهمّة:**\nx\n\n**الفرع:** `omran-agent/fix-abc`\n**الأساس:** `main`';
  const issue = { number: 7, html_url: 'https://github.com/OMRAN77/omran-ai-builder/issues/7', title: '🤖 مهمّة الوكيل: أصلح كذا', body: issueBody, state: 'open' };
  const mk = (comments, extra) => net([
    ['GET', /^\/repos\/OMRAN77\/omran-ai-builder\/issues\/7$/, res(issue)],
    ['GET', /^\/repos\/OMRAN77\/omran-ai-builder\/issues\/7\/comments/, res(comments)],
  ].concat(extra || []));
  // في الطابور
  let n = mk([]);
  let r = await D.checkTask({ issue: 7 }, n.opts);
  assert.equal(r.phase, 'queued'); assert.match(D.formatCheck(r), /لم يبدأ التشغيل بعد/);
  // قيد التنفيذ
  n = mk([{ body: '🏃 بدأ\n<!-- omran-agent {"phase":"start","run_id":"1","run_url":"https://github.com/OMRAN77/omran-ai-builder/actions/runs/1"} -->' }]);
  r = await D.checkTask({ issue: 7 }, n.opts);
  assert.equal(r.phase, 'running'); assert.match(D.formatCheck(r), /قيد التنفيذ.*runs\/1/s);
  // انتهى ودُفع → لا طلب سحب بعد → يُفتح بمفتاح المالك، ثمّ فحوصه
  n = mk([
    { body: '🏃 بدأ\n<!-- omran-agent {"phase":"start","run_id":"1","run_url":"https://x/runs/1"} -->' },
    { body: '✅ دُفع\n<!-- omran-agent {"phase":"done","pushed":true,"changed":2,"ci":"pass","sha":"abc1234567","claude":"success","run_id":"1","run_url":"https://x/runs/1"} -->' },
  ], [
    ['GET', /^\/repos\/OMRAN77\/omran-ai-builder\/pulls\?state=all&head=OMRAN77(%3A|:)omran-agent(%2F|\/)fix-abc/, res([])],
    ['POST', /^\/repos\/OMRAN77\/omran-ai-builder\/pulls$/, (u, b) => res({ number: 99, html_url: 'https://github.com/OMRAN77/omran-ai-builder/pull/99', state: 'open', head: { sha: 'abc1234567' }, title: b.title }, 201)],
    ['GET', /^\/repos\/OMRAN77\/omran-ai-builder\/commits\/abc1234567\/check-runs/, res({ check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }, { name: 'smoke', status: 'completed', conclusion: 'skipped' }, { name: 'gemini-task', status: 'in_progress', conclusion: null }] })],
  ]);
  r = await D.checkTask({ issue: 7 }, n.opts);
  assert.equal(r.phase, 'done'); assert.equal(r.prNumber, 99);
  const prCall = n.calls.find((c) => c.method === 'POST' && /\/pulls$/.test(c.url));
  assert.deepEqual([prCall.body.head, prCall.body.base, prCall.body.title], ['omran-agent/fix-abc', 'main', 'أصلح كذا'], 'الطلب من الفرع إلى الأساس بعنوان المهمّة');
  assert.ok(prCall.body.body.startsWith('يغلق #7'), 'يغلق المسألة عند الدمج');
  const txt = D.formatCheck(r);
  assert.ok(txt.includes('pull/99') && txt.includes('test ✅') && txt.includes('smoke ➖') && txt.includes('gemini-task ⏳') && /npm run ci داخل التشغيل: ✅/.test(txt), txt);
  // طلب موجود مسبقًا → لا يُفتح ثانية؛ وفشل ci يوسم العنوان
  n = mk([{ body: '<!-- omran-agent {"phase":"done","pushed":true,"changed":1,"ci":"fail","sha":"def","run_id":"2","run_url":"https://x/runs/2"} -->' }], [
    ['GET', /\/pulls\?state=all/, res([{ number: 100, html_url: 'https://github.com/OMRAN77/omran-ai-builder/pull/100', state: 'open', head: { sha: 'def' } }])],
    ['GET', /\/commits\/def\/check-runs/, res({ check_runs: [] })],
  ]);
  r = await D.checkTask({ issue: 7 }, n.opts);
  assert.equal(r.prNumber, 100);
  assert.ok(!n.calls.some((c) => c.method === 'POST'), 'لا نداء إنشاء');
  assert.match(D.formatCheck(r), /❌ فشل/);
  // بلا تغيير
  n = mk([{ body: '<!-- omran-agent {"phase":"done","pushed":false,"changed":0,"claude":"failure","run_id":"3","run_url":"https://x/runs/3"} -->' }]);
  r = await D.checkTask({ issue: 7 }, n.opts);
  assert.equal(r.phase, 'nochange'); assert.match(D.formatCheck(r), /بلا تغيير.*ANTHROPIC_API_KEY/s);
  // إدخال ناقص
  assert.match((await D.checkTask({}, n.opts)).error, /رقم مسألة/);
});

test('parseStatuses tolerates junk and picks every status line in order', () => {
  const s = D.parseStatuses('a <!-- omran-agent {"phase":"start"} --> b <!-- omran-agent {bad json} --> <!-- omran-agent {"phase":"done","pushed":true} -->');
  assert.deepEqual(s, [{ phase: 'start' }, { phase: 'done', pushed: true }]);
  assert.deepEqual(D.parseStatuses(''), []);
});

test('agent wiring: both tools for the owner only, dispatched with a per-run limit, rule 25-ز present', () => {
  const agent = read('api/_lib/agent.js');
  assert.ok(agent.includes('TOOLS.concat([githubWrite.TOOL, delegate.START_TOOL, delegate.CHECK_TOOL])'), 'الأداتان مع أدوات المالك فقط');
  assert.ok(agent.includes("cb.name === 'delegate_code_task'") && agent.includes('run.delegates > 1'), 'تسليم واحد في التشغيل');
  assert.ok(agent.includes("cb.name === 'check_code_task'") && agent.includes("isOwner(runUser) ? delegate.formatCheck(await delegate.checkTask(input))"), 'التحقّق للمالك وحده');
  assert.ok(agent.includes('25-ز. delegate_code_task وcheck_code_task'), 'قاعدة النظام');
  const { toolsFor } = require('../api/_lib/agent.js').__test;
  const names = (u) => toolsFor(u).map((t) => t.name);
  assert.ok(names('omran').includes('delegate_code_task') && names('omran').includes('check_code_task'));
  assert.ok(!names('guest').includes('delegate_code_task') && !names('guest').includes('check_code_task'));
});

test('workflow: dispatch inputs, Claude Code action with the repo key, ci before push, report line, guards', () => {
  const wf = read('.github/workflows/omran-agent.yml');
  for (const frag of ['workflow_dispatch:', 'task:', 'branch:', 'issue:', 'base:', 'anthropics/claude-code-action@v1', 'anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}', '${{ inputs.task }}', '${{ inputs.branch }}', 'npm run ci', 'git push -u origin "$TASK_BRANCH"', '<!-- omran-agent {"phase":"start"', '<!-- omran-agent {"phase":"done"', 'concurrency:', 'timeout-minutes:', 'if: always()', 'gh issue comment "$TASK_ISSUE"']) {
    assert.ok(wf.includes(frag), 'الورك فلو يحوي: ' + frag);
  }
  assert.ok(/permissions:\n\s+contents: write\n\s+pull-requests: write\n\s+issues: write/.test(wf), 'الصلاحيّات');
  assert.ok(!/gh pr create/.test(wf), 'الورك فلو لا يفتح الطلب — وكيل التطبيق يفتحه بمفتاح المالك حتّى تعمل فحوص CI');
  assert.ok(read('.env.example').includes('AGENT_REPO'), 'موثّق');
});
