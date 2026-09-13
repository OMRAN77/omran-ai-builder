// tests/agent-claude-error.test.cjs — v-agent-report: أوّل تشغيل حقيقيّ للورك فلو انتهى بـ
// «result is_error:true» بلا سبب، لأنّ claude-code-action يخفي مخرجات Claude في السجلّ.
// يثبت: (١) استخراج السبب من ملفّ التنفيذ مع تنقيح المفاتيح، (٢) صمود السكربت على ملفّ
// ناقص أو تالف، (٣) check_code_task يعرض السبب من سطر الحالة، (٤) الورك فلو يفحص المفتاح
// قبل Claude ويمرّر ملفّ التنفيذ إلى خطوة التقرير.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-report';
const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts', 'agent-claude-error.cjs');
const { summarize } = require(script);
const D = require('../api/_lib/agent-delegate.js');

const sampleLog = [
  { type: 'system', subtype: 'init', model: 'claude-opus-5[1m]' },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your organization\'s rate limit"}} · key sk-ant-api03-abcdefghijklmnop' }] } },
  { type: 'result', subtype: 'success', is_error: true, num_turns: 1, total_cost_usd: 0, errors: ['rate limited'] },
];

test('١. summarize: آخر نتيجة + آخر نصّ للمساعد، والمفاتيح منقّحة والشرطات المائلة مُبدلة', () => {
  const out = summarize(JSON.stringify(sampleLog));
  assert.match(out, /rate limited/);
  assert.match(out, /API Error: 429/);
  assert.match(out, /rate_limit_error/);
  assert.doesNotMatch(out, /sk-ant-api03/);
  assert.match(out, /\[مفتاح محذوف\]/);
  assert.doesNotMatch(out, /`/);
  assert.ok(out.length <= 1500);
  // النتيجة الفاشلة بغير success تُذكر
  const out2 = summarize(JSON.stringify([{ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' }]));
  assert.match(out2, /subtype: error_during_execution/);
  assert.match(out2, /boom/);
});

test('٢. السكربت لا يسقط على ملفّ غائب أو تالف، ويكتب الملخّص لملفّ صالح', () => {
  const missing = execFileSync(process.execPath, [script, path.join(os.tmpdir(), 'no-such-log-' + Date.now() + '.json')], { encoding: 'utf8' });
  assert.equal(missing, '');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-report-'));
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{not json');
  assert.equal(execFileSync(process.execPath, [script, bad], { encoding: 'utf8' }), '');
  const good = path.join(dir, 'good.json');
  fs.writeFileSync(good, JSON.stringify(sampleLog));
  const out = execFileSync(process.execPath, [script, good], { encoding: 'utf8' });
  assert.match(out, /API Error: 429/);
  assert.equal(summarize('[]'), '');
});

test('٣. formatCheck يعرض سبب الفشل من سطر الحالة بدل التخمين', () => {
  const base = { ok: true, issue: 7, issueUrl: 'https://github.com/o/r/issues/7', phase: 'nochange' };
  const withErr = D.formatCheck(Object.assign({}, base, { status: { phase: 'done', pushed: false, claude: 'failure', error: 'فحص مفتاح Anthropic فشل (HTTP 401): authentication_error: invalid x-api-key', run_url: 'https://github.com/o/r/actions/runs/1' } }));
  assert.match(withErr, /السبب: فحص مفتاح Anthropic فشل \(HTTP 401\)/);
  assert.doesNotMatch(withErr, /تحقّق من ANTHROPIC_API_KEY/);
  assert.match(withErr, /actions\/runs\/1/);
  const noErr = D.formatCheck(Object.assign({}, base, { status: { phase: 'done', pushed: false, claude: 'failure' } }));
  assert.match(noErr, /تحقّق من ANTHROPIC_API_KEY/);
  assert.doesNotMatch(noErr, /السبب:/);
});

test('٤. الورك فلو: فحص المفتاح قبل Claude، وخطوة Claude مشروطة به، والتقرير يقرأ ملفّ التنفيذ', () => {
  const y = fs.readFileSync(path.join(root, '.github', 'workflows', 'omran-agent.yml'), 'utf8');
  const probe = y.indexOf('Check the Anthropic key');
  const claude = y.indexOf('uses: anthropics/claude-code-action@v1');
  assert.ok(probe > 0 && claude > probe, 'فحص المفتاح يسبق خطوة Claude');
  assert.match(y, /tr -d '\[:space:\]'/);
  assert.match(y, /::add-mask::\$KEY/);
  assert.match(y, /api\.anthropic\.com\/v1\/messages/);
  assert.match(y, /if: env\.KEY_OK == 'true'/);
  assert.match(y, /anthropic_api_key: \$\{\{ env\.ANTHROPIC_KEY_CLEAN \}\}/);
  assert.doesNotMatch(y, /anthropic_api_key: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/);
  assert.match(y, /CLAUDE_LOG: \$\{\{ steps\.claude\.outputs\.execution_file \}\}/);
  assert.match(y, /node scripts\/agent-claude-error\.cjs "\$LOG"/);
  assert.match(y, /"error":%s/);
  // سطر الحالة المخفيّ في الحالتين يحمل error
  assert.equal((y.match(/"claude":"%s","error":%s/g) || []).length, 2);
});
