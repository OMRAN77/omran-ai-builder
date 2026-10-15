// tests/owner-like-me.test.cjs — v-owner-like-me (المالك ١٣ أكتوبر: «لا مااريد ان ادمج… اريد المزودين كلهم نفس الشي — كيف انته تجيني في
// النهاية تقولي ادمج وانشر، اريد كل المزودين نفسك»): نهاية شغل المزوّد على الكود كـClaude Code — طلب سحب، تقرير، وسؤال واحد «أدمج وأنشر؟»؛
// و«أدمج وأنشر» = دمج ثمّ تحقّق أنّ النشر وصل الموقع (manage_github deploy) قبل «نُشر». وفي الطريق عطبان في كلمة الدمج:
// «أدمج» بالهمزة كانت تُرفض، و«لا مااريد ان ادمج» كانت تُقبل إذنًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'owner-like-me-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'CHAT_STALL_FIRST_MS', 'CHAT_STALL_IDLE_MS', 'SITE_URL']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }),
});
stub('api/_lib/_vip.js', { isVip: async () => false });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const GE = require(rp('api/_lib/github-edit.js'));
const GM = require(rp('api/_lib/github-manage.js'));
const pushes = [], merges = [];
GE.editFiles = async (input) => { pushes.push(input); return { repo: 'OMRAN77/omran-ai-builder', branch: 'omran-agent/fix', commit: 'abcdef1234567', commitUrl: 'https://github.com/OMRAN77/omran-ai-builder/commit/abcdef1', files: 1, prUrl: 'https://github.com/OMRAN77/omran-ai-builder/pull/77', prNumber: 77 }; };
GE.mergePr = async (input) => { merges.push(input); return { number: input.number, base: 'main', sha: 'fedcba9876543', url: 'https://github.com/OMRAN77/omran-ai-builder/pull/' + input.number }; };
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
// المالك على GPT-6 Astra بمفتاح OpenAI المباشر (/v1/responses)
const resp = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const done = { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } };
const R = {
  text: (t) => resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } }, { type: 'response.output_text.delta', output_index: 0, delta: t }, done]),
  call: (name, input) => {
    const id = 'call_' + Math.random().toString(36).slice(2, 8), args = JSON.stringify(input);
    return resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: args, status: 'completed' } }, done]);
  },
};
async function run(messages, script) {
  const calls = [], out = [];
  const save = global.fetch;
  let n = 0;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b });
    if (!/api\.openai\.com\/v1\/responses/.test(String(url))) return new Response('{}', { status: 404 });
    return script[Math.min(n++, script.length - 1)]();
  };
  const req = { method: 'POST', headers: {}, body: { token: token('omran'), provider: 'openai', model: 'openai/gpt-6-astra', messages } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  try { await chat(req, res); } finally { global.fetch = save; delete process.env.OPENAI_API_KEY; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  const toolResults = JSON.stringify(calls.map((c) => c.body && c.body.input));
  return { calls, events, text: events.map((e) => e.delta || '').join(''), toolResults };
}
const EDIT = { repo: 'OMRAN77/omran-ai-builder', edits: [{ path: 'css/x.css', old: 'a', new: 'b' }], message: 'تعديل' };

test('١. كلمة الدمج: «أدمج وأنشر» بالهمزة إذن، والنفي قبل الفعل بكلمات (ومنه «لا مااريد ان ادمج») ليس إذنًا', () => {
  for (const s of ['أدمج وأنشر', 'ادمج وانشر', 'إدمج', 'أدمجه', 'تمام ادمجه', 'عدّل وادمج', 'ماشي ادمج', 'ادمج ولا تنتظر', 'merge it']) assert.equal(GE.ownerSaidMerge(s), true, s);
  for (const s of ['لا مااريد ان ادمج', 'ما ابي ادمج', 'ما اريد ان ادمج', 'لا ما اريد أدمج الحين', 'مب الحين، بعدين ادمج', 'لا تدمج', 'لا ادمج', "don't merge", 'ارفع بس', '']) assert.equal(GE.ownerSaidMerge(s), false, s);
});

test('٢. نهاية الشغل: رفع طلب سحب ولم يسأل المزوّد ← الخادم يختم بـ«أدمج وأنشر؟» مرّة واحدة؛ وإن سأل هو فلا تكرار', async () => {
  pushes.length = 0;
  let r = await run([{ role: 'user', content: 'شيل الخط بين النقاط والدائرة' }], [() => R.call('edit_github', EDIT), () => R.text('رفعت طلب السحب #77: https://github.com/OMRAN77/omran-ai-builder/pull/77')]);
  assert.equal(pushes.length, 1, 'رفع فعلًا');
  assert.ok(r.text.endsWith('\n\nأدمج وأنشر؟'), r.text);
  r = await run([{ role: 'user', content: 'شيل الخط' }], [() => R.call('edit_github', EDIT), () => R.text('رفعت #77. أدمج وأنشر؟')]);
  assert.equal((r.text.match(/أدمج وأنشر؟/g) || []).length, 1, 'لا تكرار: ' + r.text);
  r = await run([{ role: 'user', content: 'شو هذا الخط؟' }], [() => R.text('فاصل قبل زرّ القائمة.')]);
  assert.ok(!/أدمج/.test(r.text), 'لا سؤال دمج بلا رفع');
});

test('٣. «أدمج وأنشر» تدمج، ونتيجة الدمج تأمر بالتحقّق من النشر (deploy) لا «لم أتحقّق»؛ و«لا مااريد ان ادمج» تُرفض عند الخادم', async () => {
  merges.length = 0;
  let r = await run([{ role: 'user', content: 'شيل الخط' }, { role: 'assistant', content: 'رفعت #77. أدمج وأنشر؟' }, { role: 'user', content: 'أدمج وأنشر' }],
    [() => R.call('merge_github', { repo: 'OMRAN77/omran-ai-builder', number: 77 }), () => R.text('دمجت #77.')]);
  assert.equal(merges.length, 1, 'دُمج بالهمزة');
  assert.ok(r.toolResults.includes('manage_github action=deploy number=77'), 'النتيجة تأمر بالتحقّق من النشر');
  assert.ok(!r.text.includes('أدمج وأنشر؟'), 'لا سؤال بعد الدمج');
  r = await run([{ role: 'user', content: 'شيل الخط' }, { role: 'assistant', content: 'رفعت #77. أدمج وأنشر؟' }, { role: 'user', content: 'لا مااريد ان ادمج' }],
    [() => R.call('merge_github', { repo: 'OMRAN77/omran-ai-builder', number: 77 }), () => R.text('تمام، ما دمجت.')]);
  assert.equal(merges.length, 1, 'لم يُدمج');
  assert.ok(r.toolResults.includes('لا دمج بلا «ادمج» صريحة'), 'الخادم رفض');
});

// GitHub والموقع المنشور بـfetchImpl (نمط github-manage.test)
const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const res = (obj, status) => ({ ok: !status || status < 400, status: status || 200, headers: new Headers(), json: async () => obj, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
function net(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    const u = String(url).replace('https://api.github.com', '');
    calls.push(u);
    for (const [re, r] of routes) if (re.test(u)) return typeof r === 'function' ? r(u) : r;
    return res({ message: 'Not Found' }, 404);
  };
  return { calls, opts: { fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' } } };
}

test('٤. manage_github deploy: طلب مدموج = حالة Vercel على التزام الدمج، ومع path وfind يفتح الملفّ من الموقع المنشور ويقول هل التغيير فيه', async () => {
  const MSHA = 'f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b7c6d';
  let n = net([
    [/^\/repos\/o\/r\/pulls\/77$/, res({ number: 77, merged: true, merge_commit_sha: MSHA, head: { sha: 'aaa' } })],
    [new RegExp('^/repos/o/r/commits/' + MSHA + '/status$'), res({ state: 'success', statuses: [{ context: 'Vercel', state: 'success', target_url: 'https://vercel.com/d/1' }] })],
    [/^https:\/\/omran-ai-builder\.vercel\.app\/css\/tokens\.css\?_omran=\d+$/, res('.a{} /* v-no-more-sep (المالك) */ .b{}')],
  ]);
  let out = await GM.manage({ repo: 'o/r', action: 'deploy', number: 77, path: '/css/tokens.css', find: 'v-no-more-sep' }, n.opts);
  assert.ok(out.ok, JSON.stringify(out));
  assert.match(out.text, /نشر الإنتاج — التزام دمج #77 \(f0e1d2c\)/);
  assert.match(out.text, /Vercel: نجح · https:\/\/vercel\.com\/d\/1/);
  assert.match(out.text, /✓ الموقع المنشور: «v-no-more-sep» موجود في https:\/\/omran-ai-builder\.vercel\.app\/css\/tokens\.css/);
  // لم يصل بعد: قيد البناء والنصّ غائب — لا «✓»
  n = net([
    [/^\/repos\/o\/r\/pulls\/77$/, res({ number: 77, merged: true, merge_commit_sha: MSHA })],
    [/\/status$/, res({ statuses: [{ context: 'Vercel', state: 'pending' }] })],
    [/vercel\.app\/js\/app\.bundle\.js/, res('قديم')],
  ]);
  out = await GM.manage({ repo: 'o/r', action: 'deploy', number: 77, path: 'js/app.bundle.js', find: 'omranChatFollow', wait: 0 }, n.opts); // v-deploy-wait: wait=0 نظرة واحدة
  assert.match(out.text, /Vercel: قيد البناء/);
  assert.match(out.text, /✗ الموقع المنشور: «omranChatFollow» غير موجود/);
  // غير مدموج = معاينته لا الإنتاج؛ والمسار خارج الموقع مرفوض بلا طلب
  n = net([[/^\/repos\/o\/r\/pulls\/80$/, res({ number: 80, merged: false, head: { sha: 'bbbbbbbbbbbb' } })], [/\/status$/, res({ statuses: [] })]]);
  out = await GM.manage({ repo: 'o/r', action: 'deploy', number: 80, path: '../etc/passwd', find: 'x', wait: 0 }, n.opts);
  assert.match(out.text, /غير مدموج — هذه معاينته لا الإنتاج/);
  assert.match(out.text, /لا حالة نشر على هذا الالتزام بعد/);
  assert.match(out.text, /✗ مسار غير صالح/);
  assert.ok(!n.calls.some((u) => /vercel\.app/.test(u)), 'لا طلب للموقع بمسار غير صالح');
  assert.ok(GM.ACTIONS.includes('deploy') && GM.ownerAllows('deploy', 'أي شي'), 'قراءة بلا إذن');
});

test('٥. القواعد تصل كلّ مزوّد (WORK_NOTE في نظام المالك والوكيل): ختام «أدمج وأنشر؟» والتحقّق من النشر قبل «نُشر»', () => {
  assert.match(GE.WORK_NOTE, /- نهاية كلّ شغل على الكود: بعد طلب السحب افحص فحوصه بـmanage_github status[^\n]*واختم بسؤال واحد فقط: «أدمج وأنشر؟»/);
  assert.match(GE.WORK_NOTE, /- «أدمج وأنشر» أو «ادمج»: merge_github على الطلب نفسه، ثمّ manage_github action=deploy[^\n]*لا تقل «نُشر»|قيد البناء = قلها ولا تقل «نُشر»/);
  assert.ok(!/قل إنّ النشر تلقائيّ وإنّك لم تتحقّق من الموقع بنفسك/.test(GE.WORK_NOTE), 'السطر القديم أُزيل');
  assert.match(GE.formatMerge({ number: 5, base: 'main', sha: 'abc1234', url: 'u' }), /تحقّق منه الآن: manage_github action=deploy number=5/);
  assert.match(GM.MANAGE_TOOL.description, /deploy \(بعد الدمج: حالة نشر Vercel/);
  assert.ok(GM.MANAGE_TOOL.input_schema.properties.path && GM.MANAGE_TOOL.input_schema.properties.find);
  assert.match(fs.readFileSync(path.join(root, 'api/_lib/agent.js'), 'utf8'), /const OWNER_ENGINEERING_NOTE = githubEdit\.WORK_NOTE;/, 'الوكيل بالقواعد نفسها');
});
