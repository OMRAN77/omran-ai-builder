// tests/agent-context.test.cjs — v-agent-parity: «أبي الوكيل عنده كلّ صلاحيّاتك بالضبط».
// يثبت: (١) جامع السياق يكتب أقسام git وGitHub وVercel من شبكة مزيّفة وينقّح المفاتيح،
// (٢) بلا مفاتيح أو مع فشل الشبكة لا يرمي بل يكتب السبب ويكمل، (٣) الورك فلو: نموذج قابل
// للاختيار، Chromium، جمع السياق قبل Claude، أدوات الويب والوكلاء الفرعيّون، فتح طلب السحب
// برمز المالك إن وُجد، وحذف ملفّات السياق قبل الالتزام، (٤) CLAUDE.md موجود ويحمل الأساسيّات،
// (٥) delegate_code_task يمرّر النموذج إلى الورك فلو عند اختياره فقط.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-parity';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const IDS = ['claude-fable-5-1', 'claude-fable-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

const res = (obj, status) => ({ ok: !status || status < 400, status: status || 200, json: async () => obj });
function fakeNet(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, auth: (init && init.headers && (init.headers.Authorization || '')) || '' });
    for (const [re, r] of routes) if (re.test(u)) return typeof r === 'function' ? r(u) : r;
    return res({ message: 'Not Found' }, 404);
  };
  return { calls, fetchImpl };
}

test('١. buildContext: أقسام git وGitHub وVercel من شبكة مزيّفة، والمفاتيح منقّحة، والرموز لا تظهر', async () => {
  const { buildContext } = await import('../scripts/agent-context.mjs');
  const { calls, fetchImpl } = fakeNet([
    [/\/repos\/o\/r\/issues\/560\/comments/, res([{ user: { login: 'omran' }, created_at: '2026-09-13T10:00:00Z', body: 'خلّه بسيط' }, { user: { login: 'github-actions[bot]' }, body: 'bot noise' }])],
    [/\/repos\/o\/r\/issues\/560$/, res({ title: 'مهمّة تجريبيّة', body: 'أضف اختبارًا. مفتاح مسرّب sk-ant-api03-abcdefghijklmnopqrstu' })],
    [/\/repos\/o\/r\/issues\?state=open/, res([{ number: 560, title: 'self', updated_at: '2026-09-13T10:00:00Z' }, { number: 12, title: 'مسألة أخرى', updated_at: '2026-09-12T10:00:00Z' }, { number: 13, title: 'pr', pull_request: {}, updated_at: '' }])],
    [/\/repos\/o\/r\/pulls\?state=open/, res([{ number: 99, title: 'طلب مفتوح', head: { ref: 'x' }, base: { ref: 'main' }, draft: false }])],
    [/\/repos\/o\/r\/actions\/workflows\/ci\.yml\/runs/, res({ workflow_runs: [{ conclusion: 'success', head_sha: 'abcdef1234', created_at: '2026-09-13T09:00:00Z', html_url: 'https://github.com/o/r/actions/runs/1' }] })],
    [/api\.vercel\.com\/v9\/projects\/omran-ai-builder/, res({ name: 'omran-ai-builder', id: 'prj_1', link: { org: 'o', repo: 'r' } })],
    [/api\.vercel\.com\/v6\/deployments/, res({ deployments: [{ uid: 'dpl_bad', readyState: 'ERROR', target: 'production', meta: { githubCommitSha: '1234567890', githubCommitRef: 'main' }, created: 1757757600000, url: 'bad.vercel.app' }, { uid: 'dpl_ok', readyState: 'READY', target: 'production', meta: { githubCommitSha: 'aaaaaaa', githubCommitRef: 'main' }, created: 1757750000000, url: 'ok.vercel.app' }] })],
    [/api\.vercel\.com\/v3\/deployments\/dpl_bad\/events/, res([{ payload: { text: 'Build failed: Cannot find module x' } }, { payload: { text: 'Error: exit 1' } }])],
  ]);
  const exec = (cmd, args) => (cmd === 'git' ? 'abc1234 التزام أخير\ndef5678 قبله\n' : '');
  const md = await buildContext({ issue: '560', base: 'main', env: { GITHUB_REPOSITORY: 'o/r', GH_TOKEN: 'ghp_' + 'A'.repeat(36), VERCEL_TOKEN: 'vtoken', VERCEL_TEAM_ID: 'team_x' }, fetchImpl, exec });
  assert.match(md, /abc1234 التزام أخير/);
  assert.match(md, /مسألة المهمّة #560/);
  assert.match(md, /العنوان: مهمّة تجريبيّة/);
  assert.match(md, /omran \(2026-09-13 10:00\): خلّه بسيط/);
  assert.doesNotMatch(md, /bot noise/, 'تعليقات البوتات لا تُنقل');
  assert.match(md, /- #12 مسألة أخرى/);
  assert.doesNotMatch(md, /- #560 self/, 'مسألة المهمّة نفسها لا تُكرَّر');
  assert.doesNotMatch(md, /- #13 pr/, 'الطلبات لا تُعدّ مسائل');
  assert.match(md, /- #99 طلب مفتوح — x → main/);
  assert.match(md, /- success · abcdef1 · 2026-09-13 09:00/);
  assert.match(md, /المشروع: omran-ai-builder \(prj_1\) · مربوط بـGitHub: o\/r/);
  assert.match(md, /- ERROR · production · 1234567 main/);
  assert.match(md, /سجلّ بناء آخر نشرة فاشلة \(1234567\)/);
  assert.match(md, /Build failed: Cannot find module x/);
  assert.doesNotMatch(md, /sk-ant-api03-abcdefghijklmnopqrstu/);
  assert.match(md, /\[مفتاح محذوف\]/);
  assert.doesNotMatch(md, /vtoken|ghp_AAAA/, 'لا رمز في الملفّ');
  assert.ok(calls.some((c) => /api\.vercel\.com/.test(c.url) && c.auth === 'Bearer vtoken'));
  assert.ok(calls.some((c) => /api\.github\.com/.test(c.url) && /^Bearer ghp_/.test(c.auth)));
  assert.ok(calls.every((c) => !/api\.vercel\.com/.test(c.url) || /teamId=team_x/.test(c.url)), 'معرّف الفريق على كلّ نداء Vercel');
});

test('٢. بلا مفاتيح أو مع فشل الشبكة: لا يرمي، يكتب السبب ويكمل', async () => {
  const { buildContext } = await import('../scripts/agent-context.mjs');
  const boom = async () => { throw new Error('ECONNRESET'); };
  const md = await buildContext({ issue: '1', base: 'main', env: { GITHUB_REPOSITORY: 'o/r' }, fetchImpl: boom, exec: () => { throw new Error('no git'); } });
  assert.match(md, /\(تعذّر قراءة git log: no git\)/);
  assert.match(md, /\(تعذّر قراءة المسألة: ECONNRESET\)/);
  assert.match(md, /\(لا VERCEL_TOKEN في أسرار المستودع/);
  assert.match(md, /## كيف تستعمل هذا/);
  const md2 = await buildContext({ env: { GITHUB_REPOSITORY: 'o/r', VERCEL_TOKEN: 't' }, fetchImpl: async () => res({ error: 'forbidden' }, 403), exec: () => '' });
  assert.match(md2, /\(تعذّر قراءة Vercel: \/v9\/projects\/omran-ai-builder → 403/);
  assert.doesNotMatch(md2, /مسألة المهمّة #/);
});

test('٣. الورك فلو: نموذج مختار، Chromium، السياق قبل Claude، الأدوات، طلب السحب برمز المالك، حذف ملفّات السياق', () => {
  const y = read('.github/workflows/omran-agent.yml');
  assert.match(y, /model:\n\s+description:[^\n]*\n\s+required: false\n\s+default: 'claude-fable-5-1'/);
  assert.match(y, /--model \$\{\{ inputs\.model \}\}/);
  assert.match(y, /npx playwright install --with-deps chromium/);
  assert.match(y, /node scripts\/agent-context\.mjs --issue "\$TASK_ISSUE" --base "\$TASK_BASE" --out AGENT_CONTEXT\.md/);
  assert.match(y, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/);
  assert.match(y, /--allowedTools "Bash,Read,Edit,MultiEdit,Write,Glob,Grep,WebFetch,WebSearch,Task,Agent,TodoWrite,NotebookEdit"/);
  assert.match(y, /--max-turns 200/);
  assert.match(y, /timeout-minutes: 90/);
  assert.match(y, /AGENT_GITHUB_TOKEN: \$\{\{ secrets\.AGENT_GITHUB_TOKEN \}\}/);
  assert.match(y, /git rm -q --cached --ignore-unmatch AGENT_SUMMARY\.md AGENT_CONTEXT\.md/);
  assert.match(y, /rm -f AGENT_SUMMARY\.md AGENT_CONTEXT\.md/);
  assert.match(y, /"pr":%s/);
  // جمع السياق يسبق Claude ويتبع فحص المفتاح، ولا يوقف التشغيل إن فشل
  const key = y.indexOf('Check the Anthropic key');
  const ctx = y.indexOf('name: Collect context');
  const claude = y.indexOf('uses: anthropics/claude-code-action@v1');
  assert.ok(key > 0 && ctx > key && claude > ctx);
  assert.match(y.slice(ctx, claude), /continue-on-error: true/);
  // القواعد: لا دفع ولا طلب ولا دمج، مع gh للقراءة والتعليق
  assert.match(y, /AGENT_CONTEXT\.md/);
  assert.match(y, /gh issue comment/);
  assert.match(y, /لا تدفع \(push\) ولا تفتح/);
});

test('٤. CLAUDE.md موجود ويحمل الأساسيّات', () => {
  const c = read('CLAUDE.md');
  for (const frag of ['npm run ci', 'npm run bundle', 'knowledge/DECISIONS.md', 'AGENT_CONTEXT.md', 'AGENT_SUMMARY.md', 'sk-or-', 'لا تدفع', 'js/app.bundle.js', 'guard-ok']) assert.ok(c.includes(frag), 'CLAUDE.md يذكر: ' + frag);
  assert.ok(c.length > 2000 && c.length < 12000, 'حجم معقول');
});

test('٥. delegate_code_task: النموذج اختياريّ من القائمة نفسها ويُمرَّر إلى الورك فلو عند اختياره فقط', async () => {
  const D = require('../api/_lib/agent-delegate.js');
  const m = D.START_TOOL.input_schema.properties.model;
  assert.ok(m && Array.isArray(m.enum));
  assert.deepEqual(m.enum, IDS);
  assert.ok(!D.START_TOOL.input_schema.required.includes('model'));
  const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
  const bodies = [];
  const fetchImpl = async (url, init) => {
    const u = String(url);
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (/\/issues$/.test(u)) return { ok: true, status: 201, headers: new Headers(), json: async () => ({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), text: async () => '' };
    if (/\/dispatches$/.test(u)) { bodies.push(body); return { ok: true, status: 204, headers: new Headers(), json: async () => null, text: async () => '' }; }
    return { ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => '' };
  };
  const opts = { fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' }, now: 1_700_000_000_000 };
  const TASK = 'أصلح تحليل الصورة في api/_lib/chat.js: الصورة لا تصل النموذج';
  const r1 = await D.startTask({ task: TASK, repo: 'o/r', model: 'claude-opus-5' }, opts);
  assert.equal(r1.ok, true);
  assert.equal(bodies[0].inputs.model, 'claude-opus-5');
  await D.startTask({ task: TASK, repo: 'o/r', model: 'gpt-5' }, opts);
  assert.ok(!('model' in bodies[1].inputs), 'نموذج خارج القائمة = الافتراضيّ في الورك فلو');
  await D.startTask({ task: TASK, repo: 'o/r' }, opts);
  assert.ok(!('model' in bodies[2].inputs));
});
