// tests/kimi-agent.test.cjs — v-kimi-agent: «الأخ الثالث». delegate_code_task تقبل
// engine=kimi فيسلّم المهمّة إلى Kimi Code عبر kimi-agent.yml: فرع kimi-agent/،
// نماذج Kimi، وأسطر حالة <!-- kimi-agent … --> تُقرأ بنفس parseStatuses. شبكة مزيّفة
// كاملة كما في agent-delegate.test.cjs، وفحص ملفّ الورك فلو نفسه.
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

test('engine=kimi: يشغّل kimi-agent.yml بفرع kimi-agent/ ونموذج kimi صالح', async () => {
  const n = net([
    ['POST', /^\/repos\/OMRAN77\/omran-ai-builder\/issues$/, (u, b) => res({ number: 42, html_url: 'https://github.com/OMRAN77/omran-ai-builder/issues/42', title: b.title }, 201)],
    ['POST', /^\/repos\/OMRAN77\/omran-ai-builder\/actions\/workflows\/kimi-agent\.yml\/dispatches$/, res(null, 204)],
  ]);
  const r = await D.startTask({ task: 'أضف زرّ تصدير المحادثة نصًّا في شريط الأدوات', engine: 'kimi', model: 'kimi-k2.5' }, n.opts);
  assert.equal(r.ok, true);
  assert.equal(r.engine, 'kimi');
  assert.match(r.branch, /^kimi-agent\/[a-z0-9-]*-[a-z0-9]+$/, 'فرع بالبادئة kimi-agent/');
  assert.ok(r.actionsUrl.endsWith('/kimi-agent.yml'), 'رابط التشغيلات يشير إلى kimi-agent.yml');
  const d = n.calls[1];
  assert.equal(d.method, 'POST');
  assert.deepEqual(d.body, { ref: 'main', inputs: { task: 'أضف زرّ تصدير المحادثة نصًّا في شريط الأدوات', branch: r.branch, issue: '42', base: 'main', model: 'kimi-k2.5' } });
  const txt = D.formatStart(r);
  assert.ok(txt.startsWith('🚀') && txt.includes('Kimi Code'), 'الناتج يسمّي Kimi Code');
});

test('engine=kimi: نموذج غير معروف يُسقط (لا يُمرَّر للورك فلو)، ونموذج claude لا يُقبل لكيمي', async () => {
  const n = net([
    ['POST', /\/issues$/, res({ number: 43, html_url: 'https://github.com/OMRAN77/omran-ai-builder/issues/43' }, 201)],
    ['POST', /kimi-agent\.yml\/dispatches$/, res(null, 204)],
  ]);
  const r = await D.startTask({ task: 'أصلح شيئًا ما في مكان ما بالتفصيل', engine: 'kimi', model: 'claude-opus-5' }, n.opts);
  assert.equal(r.ok, true);
  assert.equal(n.calls[1].body.inputs.model, undefined, 'نموذج كلود لا يُمرَّر إلى كيمي');
});

test('الافتراضيّ يبقى claude: omran-agent.yml وفرع omran-agent/', async () => {
  const n = net([
    ['POST', /\/issues$/, res({ number: 44, html_url: 'https://github.com/OMRAN77/omran-ai-builder/issues/44' }, 201)],
    ['POST', /omran-agent\.yml\/dispatches$/, res(null, 204)],
  ]);
  const r = await D.startTask({ task: 'أصلح شيئًا ما في مكان ما بالتفصيل' }, n.opts);
  assert.equal(r.ok, true);
  assert.equal(r.engine, 'claude');
  assert.match(r.branch, /^omran-agent\//);
});

test('parseStatuses: يقرأ أسطر kimi-agent وomran-agent معًا وبالترتيب', () => {
  const s = D.parseStatuses('a <!-- omran-agent {"phase":"start"} --> b <!-- kimi-agent {"phase":"done","pushed":true,"kimi":"success"} -->');
  assert.deepEqual(s, [{ phase: 'start' }, { phase: 'done', pushed: true, kimi: 'success' }]);
});

test('checkTask: يقرأ حالة kimi-agent ويفتح الطلب باسم Kimi', async () => {
  const issueBody = '**المهمّة:**\nx\n\n**الفرع:** `kimi-agent/fix-abc`\n**الأساس:** `main`';
  const issue = { number: 45, html_url: 'https://github.com/OMRAN77/omran-ai-builder/issues/45', title: '🤖 مهمّة الوكيل: أصلح كذا', body: issueBody, state: 'open' };
  const n = net([
    ['GET', /\/issues\/45$/, res(issue)],
    ['GET', /\/issues\/45\/comments/, res([
      { body: '🏃 بدأ\n<!-- kimi-agent {"phase":"start","run_id":"9","run_url":"https://x/runs/9"} -->' },
      { body: '✅ دُفع\n<!-- kimi-agent {"phase":"done","pushed":true,"changed":1,"ci":"pass","sha":"abc1234567","kimi":"success","run_id":"9","run_url":"https://x/runs/9"} -->' },
    ])],
    ['GET', /\/pulls\?state=all/, res([{ number: 100, html_url: 'https://github.com/OMRAN77/omran-ai-builder/pull/100', state: 'open', head: { sha: 'abc1234567' } }])],
    ['GET', /\/commits\/abc1234567\/check-runs/, res({ check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }] })],
  ]);
  const r = await D.checkTask({ issue: 45 }, n.opts);
  assert.equal(r.phase, 'done');
  assert.equal(r.branch, 'kimi-agent/fix-abc');
  assert.equal(r.prNumber, 100);
  const txt = D.formatCheck(r);
  assert.ok(txt.includes('pull/100') && /npm run ci داخل التشغيل: ✅/.test(txt), txt);
});

test('ورك فلو kimi-agent.yml: المدخلات، التثبيت، kimi -p، الفحص قبل الدفع، سطرا الحالة', () => {
  const wf = read('.github/workflows/kimi-agent.yml');
  for (const frag of ['workflow_dispatch:', 'task:', 'branch:', 'issue:', 'base:', 'model:', 'merge:',
    '@moonshot-ai/kimi-code', 'kimi -p', 'KIMI_MODEL_API_KEY', 'secrets.KIMI_API_KEY || secrets.MOONSHOT_API_KEY',
    'api.moonshot.ai/v1/models', '::add-mask::', 'node scripts/agent-context.mjs', 'npm run ci',
    'git remote set-url origin "https://github.com/${GITHUB_REPOSITORY}.git"',
    'git push -u origin "$TASK_BRANCH"',
    '<!-- kimi-agent {"phase":"start"', '<!-- kimi-agent {"phase":"done"',
    'concurrency:', 'timeout-minutes:', 'if: always()', 'gh issue comment "$TASK_ISSUE"',
    'AGENT_SUMMARY.md', 'kimi-k2.5']) {
    assert.ok(wf.includes(frag), 'الورك فلو يحوي: ' + frag);
  }
  assert.ok(/permissions:\n\s+contents: write\n\s+pull-requests: write\n\s+issues: write/.test(wf), 'الصلاحيّات');
  assert.ok(!/gh pr create/.test(wf), 'الورك فلو لا يفتح الطلب بـgh — يفتحه بمفتاح المالك أو وكيل التطبيق');
});

test('package.json يسجّل الاختبار بأمر node خاصّ به', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(/node tests\/kimi-agent\.test\.cjs/.test(pkg.scripts.test), 'الاختبار مسجّل في سكربت test');
});

test('الأداة تعرّف engine وتصدّر الثوابت الجديدة', () => {
  assert.equal(D.WORKFLOW_KIMI, 'kimi-agent.yml');
  assert.ok(Array.isArray(D.KIMI_MODEL_IDS) && D.KIMI_MODEL_IDS.includes('kimi-k2.5'));
  const props = D.START_TOOL.input_schema.properties;
  assert.deepEqual(props.engine.enum, ['claude', 'kimi']);
});