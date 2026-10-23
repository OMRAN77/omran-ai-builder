// tests/maha-dialect-probe.test.cjs — مسبار لهجة مها (أمر المالك ١٨ أكتوبر: «اكتب ٣٠ طلب بلهجة إماراتية… جرّبها كلها على مها»).
// المسبار نفسه يُشغَّل في Actions بمفتاح حقيقيّ؛ هنا: الطلبات صالحة لأدوات مها الفعليّة، والمسبار يبني الجلسة من معالج الإنتاج
// نفسه (لا نسخة مكتوبة باليد تنحرف عنه)، والورك فلو لا يصرف إلّا بطلب.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const REQ = JSON.parse(read('scripts/maha-dialect-requests.json'));

test('١. ثلاثون طلبًا إماراتيًّا بكلمات محلّيّة، وكلّ متوقَّع أداةٌ أو هدفٌ موجود فعلًا عند مها', () => {
  assert.equal(REQ.length, 30);
  assert.equal(new Set(REQ.map((r) => r.id)).size, 30);
  const all = REQ.map((r) => r.text).join(' ');
  for (const w of ['أبا', 'وايد', 'باچر', 'شحالج', 'سوّ لي', 'مب']) assert.ok(all.includes(w), 'كلمة محلّيّة: ' + w);
  for (const k of ['video', 'image', 'trend', 'email']) assert.ok(REQ.filter((r) => r.kind === k).length >= 3, 'فئة المالك: ' + k);
  const tools = require(path.join(ROOT, 'api/_lib/maha-app.js')).controlTools();
  const targets = tools.find((t) => t.name === 'open_in_app').parameters.properties.target.enum;
  const actions = tools.find((t) => t.name === 'app_action').parameters.properties.action.enum;
  const fns = ['generate_image', 'edit_image', 'find_real_photo', 'search_web', 'set_reminder', 'remember_info', 'look_camera', 'build_app'];
  for (const r of REQ) {
    const e = r.expect || {};
    assert.ok(/[؀-ۿ]/.test(r.text), r.id + ' عربيّ');
    (e.open || []).forEach((x) => assert.ok(targets.includes(x), r.id + ' هدف ' + x));
    (e.action || []).forEach((x) => assert.ok(actions.includes(x), r.id + ' فعل ' + x));
    (e.tool || []).forEach((x) => assert.ok(fns.includes(x), r.id + ' أداة ' + x));
    assert.ok(e.none || (e.open && e.open.length) || (e.action && e.action.length) || (e.tool && e.tool.length), r.id + ' له متوقَّع');
  }
});

test('٢. المسبار يبني الجلسة من معالج الإنتاج نفسه (--dry): النموذج والأدوات وكشف نهاية الكلام وتحكّم التطبيق', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/maha-dialect-probe.mjs'), '--dry'], {
    cwd: ROOT, env: Object.assign({}, process.env, { OPENAI_API_KEY: 'sk-test-dummy' }), timeout: 60000,
  }).toString();
  const dry = JSON.parse((out.match(/^MAHA_DRY (.+)$/m) || [])[1] || '{}');
  const sess = JSON.parse((out.match(/^MAHA_DRY_SESSION (.+)$/m) || [])[1] || '{}');
  const src = read('api/_lib/realtime-session.js');
  assert.ok(src.includes("model: '" + dry.model + "'"), 'نموذج الإنتاج: ' + dry.model);
  assert.ok(dry.tools.includes('open_in_app') && dry.tools.includes('app_action'), 'أدوات التطبيق للمشترك');
  assert.ok(dry.tools.includes('generate_image') && dry.tools.includes('search_web'));
  assert.equal(sess.appControl, true);
  assert.ok(dry.instructionsChars > 1000);
});

test('٣. الورك فلو لا يصرف إلّا بطلب: يدويّ وحده — والصوت مخبّأ فالقبل والبعد يسمعان الشيء نفسه', () => {
  const y = read('.github/workflows/maha-dialect-probe.yml');
  // وسم في رسالة الالتزام كان يشغّله ولو اقتُبس في شرح (6a8ff8f، أُلغي في الاستنساخ)، ودمج squash يحمله إلى main
  assert.ok(/\non:\n  workflow_dispatch:\n/.test(y) && !/^  push:/m.test(y) && !y.includes('head_commit'), 'يدويّ وحده');
  assert.ok(y.includes("MAHA_TOKEN: ${{ github.ref == 'refs/heads/main' && inputs.patch == '' && inputs.code_ref == '' && (secrets.SAMPLE_TOKEN || secrets.EVAL_TOKEN || secrets.PROBE_TOKEN) || '' }}"), 'المنشور (main) يُقاس من main وبلا تجربة فقط');
  assert.ok(/async function mintSession\(\) \{\n  if \(MODE === 'prod'\) \{\n    await ownerCheck\(\);/.test(read('scripts/maha-dialect-probe.mjs')), 'صاحب الرمز قبل أيّ جلسة (لا دقائق تُخصم من غير المالك)');
  assert.ok(/actions\/cache@v4[\s\S]*?path: \.maha-tts-cache/.test(y));
  const p = read('scripts/maha-dialect-probe.mjs');
  assert.ok(p.includes("require(lib('realtime-session.js'))"), 'المعالج الحقيقيّ');
  assert.ok(!/console\.log\([^)]*(KEY|TOKEN)/.test(p), 'لا طباعة للمفتاح ولا للرمز');
  assert.ok(p.includes("if (!(j.mahaBudget && j.mahaBudget.unlimited) && process.env.MAHA_ALLOW_PAID !== '1')"), 'يتوقّف إن كانت الجلسة تُخصم');
  // في الإنتاج: كلامها ومعاملات أدواتها مختومة — السجلّ العامّ يرى الأرقام وأسماء الأدوات وحدها
  assert.ok(p.includes("console.log((MODE === 'prod' ? 'MAHA_ROW ' + JSON.stringify(brief(res)) : 'MAHA_RESULT ' + JSON.stringify(res)))"));
  assert.ok(/^-----BEGIN PUBLIC KEY-----/.test(read('scripts/maha-probe-seal.pub.pem')), 'مفتاح الختم العامّ وحده في المستودع');
});

test('٤. طلبات الحارس (--requests): لهجات أخرى وصوت امرأة — كلّ طلب بصوته وتعليمته، والأهداف موجودة فعلًا', () => {
  const G = JSON.parse(read('scripts/maha-dialect-guard.json'));
  const targets = require(path.join(ROOT, 'api/_lib/maha-app.js')).OPEN_TARGETS;
  assert.ok(G.length >= 4 && new Set(G.map((r) => r.id)).size === G.length && G.every((r) => r.id > 100), 'أرقام لا تتداخل مع الثلاثين');
  for (const r of G) {
    assert.ok(r.tts && r.tts.voice && /native/.test(r.tts.instructions), r.id + ' صوته');
    (r.expect.open || []).forEach((x) => assert.ok(targets.includes(x), r.id + ' هدف ' + x));
  }
  assert.ok(G.some((r) => /woman/.test(r.tts.instructions)) && G.some((r) => /Saudi|Kuwaiti|Egyptian|Lebanese/.test(r.tts.instructions)));
  const p = read('scripts/maha-dialect-probe.mjs');
  assert.ok(p.includes("arg('requests', 'scripts/maha-dialect-requests.json')") && p.includes('await speech(reqItem.text, reqItem.tts)'));
});

test('٥. مراجعة: لا تشغيلة مدفوعة بالخطأ — طابور «قبل» ثمّ «بعد»، و--only الفاسد يوقف المسبار لا يشغّل الثلاثين، والتجربة لا تُسقط بصمت', () => {
  const y = read('.github/workflows/maha-dialect-probe.yml');
  assert.ok(/\n  probe:\n(?: +#.*\n)*    concurrency:\n      group: maha-dialect-probe\n      cancel-in-progress: false\n/.test(y), 'تشغيلة واحدة في وقتها');
  assert.ok(y.includes('${ONLY_INPUT:+--only "$ONLY_INPUT"}'), 'only كما كُتب يصل المسبار ليحكم عليه');
  const run = (only, extra) => {
    try {
      const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/maha-dialect-probe.mjs'), '--dry', '--only', only].concat(extra || []), {
        cwd: ROOT, env: Object.assign({}, process.env, { OPENAI_API_KEY: 'sk-test-dummy' }), timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'],
      }).toString();
      return { code: 0, out };
    } catch (e) { return { code: e.status, out: String(e.stderr) }; }
  };
  for (const ok of ['1,9', '1, 9', '١,٩', '1،9']) assert.equal(run(ok).code, 0, 'مقبول: ' + ok);
  for (const bad of ['1-3', '0', 'abc', '31']) {
    const r = run(bad);
    assert.equal(r.code, 2, 'يوقف: ' + bad);
    assert.ok(r.out.includes('✗ --only'), bad);
  }
  assert.equal(run('105', ['--requests', 'scripts/maha-dialect-guard.json']).code, 0, 'أرقام الحارس في ملفّها');
  // التجربة في الوضع المنشور كانت تُسقط بصمت فيُقاس main كأنّه التجربة
  // (عنوان لا يُوصل إليه: لو تقدّم نداءٌ ما على الرفض لفشل هنا لا على الموقع المنشور)
  let refused = null;
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/maha-dialect-probe.mjs'), '--only', '1'], {
      cwd: ROOT, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { MAHA_TOKEN: 'dummy', MAHA_BASE: 'http://127.0.0.1:9', OPENAI_API_KEY: '', MAHA_SESSION_PATCH: '{"reasoning":{"effort":"minimal"}}' }),
    });
  } catch (e) { refused = { code: e.status, err: String(e.stderr) }; }
  assert.ok(refused && refused.code === 2 && refused.err.includes('✗ MAHA_SESSION_PATCH للوضع المحلّيّ وحده'), JSON.stringify(refused));
});
