'use strict';
/* v-branch-ci + v-deploy-wait + v-code-rigor (المالك ١٥ أكتوبر: «كيف اخلي المزودين يتعمقون في التحليل الاكواد… ويكون متاكد نفسك بعد
   الدمج والنشر» ثمّ «أنفّذ الثلاثة»): ما ينقص المزوّدين عن Claude Code — (١) لا جهاز يشغّل npm run ci قبل الرفع: الآن ci.yml نفسه
   يُبدأ على فرعهم بـmanage_github action=ci ويرجع أخضر أو سطور الفشل نفسها؛ (٢) deploy كان نظرة واحدة «قيد البناء — أعد بعد قليل»
   فينتهي الردّ: الآن ينتظر بنفسه حتّى يستقرّ النشر ويظهر النصّ؛ (٣) تحليل الكود يذكر الدالّة ومن يستدعيها واختبارها بأرقام الأسطر. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const GM = require('../api/_lib/github-manage.js');
const PL = require('../api/_lib/provider-level.js');
const GE = require('../api/_lib/github-edit.js');

const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const res = (obj, status) => ({ ok: !status || status < 400, status: status || 200, headers: new Headers(), json: async () => obj, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
function net(routes, extra) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url).replace('https://api.github.com', '');
    calls.push({ u, method: (init && init.method) || 'GET', body: init && init.body ? JSON.parse(init.body) : null, auth: !!(init && init.headers && init.headers.Authorization) });
    for (const [re, r] of routes) if (re.test(u)) return typeof r === 'function' ? r(u) : r;
    return res({ message: 'Not Found' }, 404);
  };
  return { calls, opts: Object.assign({ fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' } }, extra || {}) };
}
const SHA = 'c0ffee1234567890abcdef1234567890abcdef12';
const LOG = ['2026-10-15T02:33:00.000Z ✔ ١. شيء', '2026-10-15T02:33:01.000Z not ok 12 - ٨. v-full-links: الرابط', '2026-10-15T02:33:01.000Z   error: \'الحزمة مطابقة\'', '2026-10-15T02:33:01.000Z   expected: true', '2026-10-15T02:33:01.000Z   actual: false', '2026-10-15T02:33:02.000Z ##[error]Process completed with exit code 1.'].join('\n');

test('١. action=ci: بلا تشغيل لالتزام الفرع ← يبدأ ci.yml عليه؛ قيد العمل ← ينتظر؛ أخضر ← «الآن طلب السحب»؛ أحمر ← سطور الفشل نفسها من المهمّة الفاشلة', async () => {
  let runs = [];
  const n = net([
    [/^\/repos\/o\/r\/pulls\/12$/, res({ head: { ref: 'omran-agent/fix-1', sha: SHA } })],
    [/^\/repos\/o\/r\/commits\/omran-agent%2Ffix-1$/, res({ sha: SHA })],
    [/^\/repos\/o\/r\/actions\/workflows\/ci\.yml\/runs\?/, () => res({ workflow_runs: runs })],
    [/^\/repos\/o\/r\/actions\/workflows\/ci\.yml\/dispatches$/, res(null, 204)],
    [/^\/repos\/o\/r\/actions\/runs\/77\/jobs\?/, res({ jobs: [{ id: 901, name: 'test', conclusion: 'failure' }] })],
    [/^\/repos\/o\/r\/actions\/jobs\/901\/logs$/, () => ({ ok: false, status: 302, headers: new Headers({ location: 'https://productionresults.blob.core.windows.net/logs/901?sig=x' }) })],
    [/blob\.core\.windows\.net\/logs\/901/, res(LOG)],
  ]);
  const ask = { repo: 'o/r', action: 'ci', number: 12 };
  let out = await GM.manage(ask, n.opts);
  assert.ok(out.ok, JSON.stringify(out));
  assert.match(out.text, /بدأتُ الفحص الكامل \(npm run ci[^)]*\) على الفرع omran-agent\/fix-1 \(c0ffee1\)/);
  assert.match(out.text, /أعد manage_github action=ci بالمدخلات نفسها في ردّك التالي/);
  const d = n.calls.find((c) => /dispatches$/.test(c.u));
  assert.deepEqual(d.body, { ref: 'omran-agent/fix-1' }, 'الورك فلو نفسه بلا مدخلات — الفرع هو المرجع');

  runs = [{ id: 76, head_sha: 'old', status: 'completed', conclusion: 'success', event: 'push' }, { id: 77, head_sha: SHA, status: 'in_progress', event: 'pull_request', html_url: 'https://github.com/o/r/actions/runs/77' }];
  n.calls.length = 0;
  out = await GM.manage(ask, n.opts);
  assert.match(out.text, /قيد العمل \(https:\/\/github\.com\/o\/r\/actions\/runs\/77\)/);
  assert.ok(!n.calls.some((c) => /dispatches$/.test(c.u)), 'تشغيل قائم لالتزام الفرع (من أيّ حدث) = لا تشغيل ثانٍ');

  runs[1].status = 'completed'; runs[1].conclusion = 'success';
  out = await GM.manage({ repo: 'o/r', action: 'ci', branch: 'omran-agent/fix-1' }, n.opts);
  assert.match(out.text, /✅ الفحص الكامل أخضر على الفرع omran-agent\/fix-1 \(c0ffee1\): https:\/\/github\.com\/o\/r\/actions\/runs\/77 — الآن طلب السحب/);

  runs[1].conclusion = 'failure';
  n.calls.length = 0;
  out = await GM.manage(ask, n.opts);
  assert.match(out.text, /^✗ الفحص الكامل فشل على الفرع omran-agent\/fix-1 \(c0ffee1\): https:\/\/github\.com\/o\/r\/actions\/runs\/77 — أصلح ما يلي قبل أيّ طلب سحب أو دمج\./);
  assert.match(out.text, /not ok 12 - ٨\. v-full-links/);
  assert.match(out.text, /expected: true\n\s*actual: false/, 'المتوقّع والفعليّ كما في السجلّ');
  assert.ok(!/2026-10-15T/.test(out.text), 'بلا طوابع زمن');
  assert.equal(n.calls.find((c) => /blob\.core/.test(c.u)).auth, false, 'الرابط الموقَّع بلا مفتاح GitHub');

  assert.match((await GM.manage({ repo: 'o/r', action: 'ci', branch: '../x' }, n.opts)).error, /أعطِ branch/);
  assert.ok(GM.ACTIONS.includes('ci') && GM.ownerAllows('ci', ''), 'قراءة بلا إذن');
});

test('٢. ci.yml: يقبل workflow_dispatch بلا مدخلات، والأوامر نفسها (npm run ci)، وقراءة فقط', () => {
  const y = read('.github/workflows/ci.yml');
  assert.match(y, /\n  workflow_dispatch:/);
  assert.ok(!/workflow_dispatch:\n\s+inputs:/.test(y), 'بلا مدخلات — لا نصّ من النموذج يدخل الجهاز');
  assert.match(y, /- run: npm run ci/);
  assert.match(y, /permissions:\n  contents: read/);
});

test('٣. deploy ينتظر بنفسه: قيد البناء ← ينام ١٥ ث ويعيد حتّى «نجح» والنصّ موجودًا في نداء واحد؛ wait=0 نظرة واحدة؛ ومهلة نفدت = «أعده في ردّك التالي»', async () => {
  const MSHA = 'f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b7c6d';
  let polls = 0, site = 'قديم';
  const slept = [];
  let now = 0;
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const n = net([
      [/^\/repos\/o\/r\/pulls\/77$/, res({ number: 77, merged: true, merge_commit_sha: MSHA })],
      [/\/status$/, () => { polls++; return res({ statuses: [{ context: 'Vercel', state: polls < 3 ? 'pending' : 'success', target_url: 'https://vercel.com/d/1' }] }); }],
      [/vercel\.app\/js\/app\.bundle\.js/, () => res(site)],
    ], { sleep: async (ms) => { slept.push(ms); now += ms; if (slept.length === 3) site = 'x omranChatFollow y'; } });
    const out = await GM.manage({ repo: 'o/r', action: 'deploy', number: 77, path: 'js/app.bundle.js', find: 'omranChatFollow' }, n.opts);
    assert.deepEqual(slept, [15000, 15000, 15000], 'نام حتّى استقرّت الحالة ثمّ حتّى ظهر النصّ');
    assert.match(out.text, /نشر الإنتاج — التزام دمج #77 \(f0e1d2c\) — انتظرتُ 45 ث/);
    assert.match(out.text, /Vercel: نجح/);
    assert.match(out.text, /✓ الموقع المنشور: «omranChatFollow» موجود/);
    assert.ok(!/أعد action=deploy/.test(out.text));

    // المهلة تنفد والنشر ما زال قيد البناء: يقولها ويطلب الإعادة في الردّ التالي، ولا ينام أكثر من المهلة
    polls = -100; slept.length = 0; now = 0;
    const out2 = await GM.manage({ repo: 'o/r', action: 'deploy', number: 77, wait: 40 }, n.opts);
    assert.deepEqual(slept, [15000, 15000], 'مهلة ٤٠ ث = نومتان');
    assert.match(out2.text, /Vercel: قيد البناء/);
    assert.match(out2.text, /ما زال قيد البناء بعد المهلة — أعد action=deploy بالمدخلات نفسها في ردّك التالي، ولا تقل «نُشر»/);

    // wait=0: نظرة واحدة بلا نوم (كما كان)
    slept.length = 0; polls = -100;
    const out3 = await GM.manage({ repo: 'o/r', action: 'deploy', number: 77, wait: 0, path: 'js/app.bundle.js', find: 'omranChatFollow' }, n.opts);
    assert.deepEqual(slept, []);
    assert.match(out3.text, /قيد البناء/);
    assert.match(out3.text, /الموقع المنشور/);
    assert.ok(/wait: \{ type: 'integer'/.test(read('api/_lib/github-manage.js')) && GM.MANAGE_TOOL.input_schema.properties.wait, 'wait في المخطّط');
    assert.match(GM.MANAGE_TOOL.description, /ينتظر بنفسه حتّى wait ثانية/);
  } finally { Date.now = realNow; }
});

test('٤. التعليمات: المنهج يأمر بـci قبل طلب السحب وبتحليل الدالّة ومستدعيها واختبارها بأرقام الأسطر؛ والقواعد تقول إنّ deploy ينتظر؛ والاختبار مسجّل', () => {
  assert.match(PL.OWNER_METHOD, /قبل طلب السحب manage_github action=ci branch=فرعك/);
  assert.match(PL.OWNER_METHOD, /أحمر يرجع سطور الفشل نفسها/);
  assert.match(PL.OWNER_METHOD, /تحليل كود = الدالّة \+ من يستدعيها \(query باسمها\) \+ اختبارها في tests\/، بأرقام أسطر الثلاثة، وإلّا فلا تحكم/);
  assert.ok(PL.OWNER_METHOD.length < 3200, 'سقف المنهج: ' + PL.OWNER_METHOD.length);
  assert.match(GE.WORK_NOTE, /- قبل طلب السحب: manage_github action=ci branch=فرعك حتّى أخضر \(أحمر يرجع لك سطور الفشل فأصلحها\) — لا طلب سحب بفحص أحمر\./);
  assert.match(GE.WORK_NOTE, /action=deploy number=رقمه[^\n]*ينتظر بنفسه حتّى دقيقة ونصف/);
  assert.match(GM.MANAGE_TOOL.description, /ci \(الفحص الكامل npm run ci على فرعك/);
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/branch-ci.test.cjs'));
});
