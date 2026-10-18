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

test('٣. الورك فلو لا يصرف إلّا بطلب: يدويّ، أو دفعة رسالتها [maha-probe] — والصوت مخبّأ فالقبل والبعد يسمعان الشيء نفسه', () => {
  const y = read('.github/workflows/maha-dialect-probe.yml');
  assert.ok(y.includes("if: github.event_name == 'workflow_dispatch' || contains(github.event.head_commit.message, '[maha-probe]')"));
  assert.ok(y.includes('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}'));
  assert.ok(/actions\/cache@v4[\s\S]*?path: \.maha-tts-cache/.test(y));
  const p = read('scripts/maha-dialect-probe.mjs');
  assert.ok(p.includes("require(lib('realtime-session.js'))"), 'المعالج الحقيقيّ');
  assert.ok(!/console\.log\([^)]*KEY/.test(p), 'لا طباعة للمفتاح');
});
