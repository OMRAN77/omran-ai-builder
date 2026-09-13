'use strict';
/* v-cc-bridge — Claude Code الخام لمالك التطبيق (أمر عمران ١٣ سبتمبر): الجسر لا يبني
   وكيلًا؛ يشغّل query() من حزمة الوكيل الرسميّة ويزيد سياج الأدوات وأمري «انشر» و«ادمج».
   الاختبار: قواعد السياج (policy.mjs)، وسجلّ الأحداث، وأنّ الخادم يستعمل الحزمة كما هي
   (استئناف، بثّ جزئيّ، acceptEdits، canUseTool)، وأنّ مرحّل التطبيق للمالك وحده. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = (p) => path.join(__dirname, '..', p);

(async () => {
  const P = await import('../cc-bridge/policy.mjs');
  // سياج الأدوات: العمل المحلّيّ مسموح، والدفع/النشر/الدمج/الشبكة/الأسرار مرفوضة
  assert.strictEqual(P.decideTool('Bash', { command: 'npm run ci' }).behavior, 'allow');
  assert.strictEqual(P.decideTool('Bash', { command: 'git commit -m "x"' }).behavior, 'allow');
  assert.strictEqual(P.decideTool('Edit', { file_path: 'js/app-05-ui.js' }).behavior, 'allow');
  for (const cmd of ['git push origin main', 'gh pr create', 'curl https://x', 'git fetch origin', 'vercel deploy', 'npm publish', 'git reset --hard', 'sudo rm -rf /', 'cat .env', 'echo $GITHUB_TOKEN']) {
    assert.strictEqual(P.decideTool('Bash', { command: cmd }).behavior, 'deny', 'يُرفض: ' + cmd);
  }
  assert.strictEqual(P.decideTool('Read', { file_path: '.env' }).behavior, 'deny', 'ملفّ البيئة لا يُقرأ');
  assert.strictEqual(P.decideTool('WebFetch', { url: 'https://x' }).behavior, 'deny', 'الويب معطّل');
  assert.ok(!P.ALLOWED_TOOLS.some((t) => /push|gh |curl|WebFetch/.test(t)), 'القائمة المسموحة بلا دفع ولا شبكة');
  assert.ok(/لا تدفع إلى GitHub/.test(P.RULES_APPEND) && /npm run ci/.test(P.RULES_APPEND), 'الإضافة الوحيدة على التعليمات: الحدود وقاعدة البناء');
  // الأوامر والكلمات
  assert.strictEqual(P.commandWord('انشر'), 'publish'); assert.strictEqual(P.commandWord('ادمج!'), 'merge'); assert.strictEqual(P.commandWord('تراجع'), 'reset');
  assert.strictEqual(P.commandWord('ادمج هذا الملف'), '', 'الكلمة ضمن جملة ليست أمرًا');
  assert.strictEqual(P.slugBranch('Fix header bug', 1000), 'cc/fix-header-bug-rs');
  assert.ok(P.slugBranch('مهمّة عربيّة', 1).startsWith('cc/task-'), 'العربيّة تصير task');
  // التنقيح
  assert.strictEqual(P.redact('key=sk-ant-abcdefghijklmnop', {}), 'key=[key]');
  assert.strictEqual(P.redact('x SECRETVALUE123 y', { GITHUB_TOKEN: 'SECRETVALUE123' }), 'x [GITHUB_TOKEN] y');
  // سجلّ التشغيل يُستعاد من أيّ نقطة
  const log = new P.RunLog('r1'); log.push({ a: 1 }); log.push({ b: 2 });
  assert.deepStrictEqual(log.since(1), [{ b: 2 }]); assert.strictEqual(log.done, false); log.end(); assert.strictEqual(log.done, true);
  assert.strictEqual(P.briefTool('Bash', { command: 'npm test' }), '$ npm test');

  // الخادم: Claude Code كما هو — لا حلقة يدويّة
  const srv = fs.readFileSync(R('cc-bridge/server.mjs'), 'utf8');
  assert.ok(srv.includes("await import('@anthropic-ai/claude-agent-sdk')") && srv.includes('query({ prompt: message, options })'), 'query() من الحزمة الرسميّة');
  assert.ok(!/api\.anthropic\.com\/v1\/messages/.test(srv), 'لا نداء مباشر لواجهة الرسائل — لا وكيل مركّب');
  for (const k of ["permissionMode: 'acceptEdits'", 'canUseTool: async (name, input) => decideTool(name, input)', 'includePartialMessages: true', "systemPrompt: { type: 'append', text: RULES_APPEND }", 'options.resume = opts.sessionId', 'allowedTools: ALLOWED_TOOLS', 'disallowedTools: DENIED_TOOLS', "settingSources: ['project']"]) {
    assert.ok(srv.includes(k), 'خيار الحزمة: ' + k);
  }
  assert.ok(srv.includes('timingSafeEqual') && srv.includes("'/publish'") && srv.includes("'/merge'") && srv.includes("'/reset'"), 'السرّ والأوامر الثلاثة');
  assert.ok(srv.includes('if (current && !current.done) return json(res, 409'), 'تشغيل واحد في كلّ مرّة');
  const git = fs.readFileSync(R('cc-bridge/git.mjs'), 'utf8');
  assert.ok(git.includes("await git(['checkout', '-b', branch])") && git.includes("'/pulls'") && git.includes("'/merge', { method: 'PUT'"), 'انشر = فرع + طلب سحب، ادمج = دمج الطلب');
  assert.ok(git.includes('GIT_ASKPASS') && !/x-access-token:\$\{?token/.test(git), 'الرمز عبر GIT_ASKPASS لا في سطر الأمر');
  assert.ok(git.includes("if (st.failing.length && !i.force)"), 'فحص أحمر يمنع الدمج إلّا بالقوّة');
  const pkg = JSON.parse(fs.readFileSync(R('cc-bridge/package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@anthropic-ai/claude-agent-sdk'], 'الحزمة الرسميّة هي التبعيّة');
  assert.ok(fs.existsSync(R('cc-bridge/Dockerfile')) && fs.existsSync(R('cc-bridge/README.md')) && fs.existsSync(R('cc-bridge/entrypoint.sh')), 'ملفّات التشغيل');
  assert.ok(fs.readFileSync(R('.vercelignore'), 'utf8').includes('cc-bridge/'), 'الجسر لا يُنشر على Vercel');

  // مرحّل التطبيق: للمالك وحده، وبالسرّ من البيئة، وبلا سرّ في المتصفّح
  const cc = require('../api/_lib/cc.js');
  const { OPS, config, forwardBody } = cc.__test;
  assert.ok(OPS.chat.stream && OPS.attach.stream && !OPS.merge.stream, 'البثّ للمحادثة والاستئناف فقط');
  assert.strictEqual(config({}).ok, false); assert.strictEqual(config({ CC_BRIDGE_URL: 'https://cc.example', CC_BRIDGE_SECRET: 'x'.repeat(24) }).ok, true);
  assert.deepStrictEqual(Object.keys(forwardBody('chat', { message: 'hi', token: 'SESSION', sessionId: 's1' })).sort(), ['message', 'model', 'newSession', 'sessionId'], 'رمز الجلسة لا يُمرَّر إلى الجسر');
  assert.strictEqual(forwardBody('merge', { prNumber: '12', force: 'yes' }).prNumber, 12);
  const res = () => { const r = { code: 0, body: null, headers: {} }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = (b) => { r.ended = b; return r; }; return r; };
  let r = res(); await cc({ method: 'POST', body: { op: 'status', token: 'not-owner' }, query: {} }, r);
  assert.strictEqual(r.code, 401, 'غير المالك يُرفض قبل أيّ اتّصال');
  const sys = fs.readFileSync(R('api/system.js'), 'utf8');
  assert.ok(sys.includes("case 'cc': return require('./_lib/cc.js');"), 'المسار مسجّل');
  const ui = fs.readFileSync(R('js/app-29-cc.js'), 'utf8');
  assert.ok(ui.includes("=== 'omran'") && ui.includes("action=cc") && ui.includes("window.confirm('تدمج طلب السحب #'"), 'الشاشة للمالك، والدمج بتأكيد صريح');
  assert.ok(!/CC_BRIDGE_SECRET|CC_BRIDGE_URL/.test(ui), 'لا سرّ ولا عنوان جسر في المتصفّح');
  assert.ok(fs.readFileSync(R('.env.example'), 'utf8').includes('CC_BRIDGE_SECRET'), 'المتغيّران موثّقان');
  console.log('✓ cc-bridge: Claude Code خام مع سياج، والنشر والدمج بأمر المالك وحده');
})().catch((e) => { console.error(e); process.exit(1); });
