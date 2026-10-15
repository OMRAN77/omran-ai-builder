// v-branch-shots (المالك ١٤ أكتوبر: «يعني ماتقدر تعطيهم هذي. الجهاز الي عندك» ثمّ «ابدا»): المزوّدون يعدّلون عبر GitHub ولا يرون
// الشاشة، وClaude Code في جلسة الويب يصوّر قبل «تمّ». الآن جهاز GitHub (branch-shots.yml) يصوّر فرعهم حاسوبًا وجوّالًا بأوامر ثابتة،
// وmanage_github action=shots يبدأ التصوير ثمّ يرجع اللقطتين صورًا تصل المزوّد بعد نتائج خطوته. المدخلات لا تصير أمرًا على الجهاز.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const BS = require('../api/_lib/branch-shots.js');
const GM = require('../api/_lib/github-manage.js');

test('١. المدخلات: قسم إعدادات ومعرّف زرّ فقط — أيّ نصّ آخر يُرفض بسببه، والأمر وسائط بلا صدفة', () => {
  assert.deepEqual(BS.viewOf({}), { settings: '', click: '' });
  assert.deepEqual(BS.viewOf({ settings: 'accountSection', click: '#btnPortraitStyles' }), { settings: 'accountSection', click: '#btnPortraitStyles' });
  for (const bad of ['account; rm -rf /', 'accountSection && curl x', '$(id)Section', 'a'.repeat(50) + 'Section']) assert.ok(BS.viewOf({ settings: bad }).error, 'settings: ' + bad);
  for (const bad of ['#a b', '#x";alert(1);"', 'btn', '#1abc', '#' + 'a'.repeat(70), '.cls']) assert.ok(BS.viewOf({ click: bad }).error, 'click: ' + bad);
  const a = BS.shotArgs('.shots', { settings: 'designSection', click: '#btnX' });
  assert.deepEqual(a.slice(0, 6), ['scripts/ui-shot.mjs', '--out', '.shots', '--user', 'omran', '--both']);
  assert.deepEqual(a.slice(6, 8), ['--settings', 'designSection']);
  assert.equal(a[a.indexOf('--eval') + 1], '(function(){var el=document.querySelector("#btnX");if(el)el.click();})()');
  assert.deepEqual(BS.shotArgs('o', { settings: 'x;y', click: 'z' }), ['scripts/ui-shot.mjs', '--out', 'o', '--user', 'omran', '--both'], 'غير الصالح لا يدخل الأمر حتّى لو تجاوز الخادم');
  for (const b of ['main', 'omran-agent/fix-1', 'claude/x.y']) assert.ok(BS.BRANCH_RE.test(b), b);
  for (const b of ['', '../x', 'a..b', '-x', 'a b', 'x;y']) assert.ok(!BS.BRANCH_RE.test(b), 'فرع: ' + b);
});

test('٢. الورك فلو: قراءة فقط، المدخلات بيئةً لا داخل run، والسكربت ينتهي بنجاح دائمًا (تشغيل أحمر يوقف الدمج)', () => {
  const y = read('.github/workflows/branch-shots.yml');
  assert.match(y, /permissions:\n  contents: read/);
  assert.match(y, /persist-credentials: false/);
  assert.match(y, /workflow_dispatch:/);
  for (const l of y.split('\n').filter((x) => x.includes('${{'))) assert.match(l, /^(?:run-name:|\s+group:|\s+ref: \$\{\{ inputs\.ref \}\}$|\s+SHOT_(?:SETTINGS|CLICK): )/, 'المدخلات في الأسماء والبيئة وحدها، لا داخل أوامر الصدفة: ' + l);
  assert.match(y, /SHOT_SETTINGS: \$\{\{ inputs\.settings \}\}\n\s+SHOT_CLICK: \$\{\{ inputs\.click \}\}\n\s+run: node scripts\/branch-shots\.mjs/);
  // عنوان التشغيل = ما يطابقه الخادم
  const rn = (y.match(/^run-name: "(.*)"$/m) || [])[1];
  const render = (ref, s, c) => rn.replace('${{ inputs.ref }}', ref).replace('${{ inputs.settings }}', s).replace('${{ inputs.click }}', c);
  assert.equal(BS.norm(render('omran-agent/x', '', '')), BS.titleOf('omran-agent/x', { settings: '', click: '' }));
  assert.equal(BS.norm(render('main', 'accountSection', '#b')), BS.titleOf('main', { settings: 'accountSection', click: '#b' }));
  const sc = read('scripts/branch-shots.mjs');
  assert.ok(sc.includes('process.exit(0);') && !/process\.exit\(1\)/.test(sc), 'لا تشغيل أحمر');
  assert.ok(sc.includes('spawnSync(process.execPath, BS.shotArgs(') && !/shell:\s*true|execSync|exec\(/.test(sc), 'بلا صدفة');
  assert.ok(read('.gitignore').includes('.shots/'));
});

// أرشيف zip صغير بطريقة store/deflate — كما يرفعه upload-artifact
function zip(files) {
  const locals = [], central = [];
  let off = 0;
  for (const [name, data] of files) {
    const nm = Buffer.from(name), comp = zlib.deflateRawSync(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    locals.push(lh, nm, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(files.length, 8); eo.writeUInt16LE(files.length, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
  return Buffer.concat(locals.concat([cd, eo]));
}

test('٣. manage shots: بلا تشغيل ← يبدأ التصوير؛ قيد العمل ← ينتظر؛ انتهى ← اللقطتان صورًا وأخطاء الصفحة، والمخزن بلا مفتاح GitHub', async () => {
  const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
  const SHA = 'abc1234def5678';
  const PNG = Buffer.from('89504e470d0a1a0a' + '00'.repeat(40), 'hex');
  const ZIP = zip([['desktop.png', PNG], ['mobile.png', PNG], ['summary.json', Buffer.from(JSON.stringify({ ok: true, pageErrors: ['desktop: x is not defined'], consoleErrors: [] }))]]);
  let runs = [];
  const seen = [];
  const fetchImpl = async (url, init) => {
    const u = String(url);
    const auth = !!(init && init.headers && init.headers.Authorization);
    seen.push({ u, method: (init && init.method) || 'GET', body: init && init.body ? JSON.parse(init.body) : null, auth });
    if (/\/pulls\/12$/.test(u)) return new Response(JSON.stringify({ head: { ref: 'omran-agent/portrait-1', sha: SHA } }), { status: 200 });
    if (/\/commits\/omran-agent%2Fportrait-1$/.test(u)) return new Response(JSON.stringify({ sha: SHA }), { status: 200 });
    if (/\/actions\/workflows\/branch-shots\.yml\/runs\?/.test(u)) return new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 });
    if (/\/actions\/workflows\/branch-shots\.yml\/dispatches$/.test(u)) return new Response(null, { status: 204 });
    if (/\/actions\/runs\/55\/artifacts/.test(u)) return new Response(JSON.stringify({ artifacts: [{ id: 9, name: 'shots', expired: false }] }), { status: 200 });
    if (/\/actions\/artifacts\/9\/zip$/.test(u)) return { ok: false, status: 302, headers: new Headers({ location: 'https://pipelines.actions.githubusercontent.com/zip/9?sig=abc' }) };
    if (/githubusercontent\.com\/zip\/9/.test(u)) return new Response(ZIP, { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const opts = { fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' } };
  const ask = { repo: 'o/r', action: 'shots', number: 12, settings: 'designSection' };

  const start = await GM.manage(ask, opts);
  assert.match(start.text, /بدأت تصوير الفرع omran-agent\/portrait-1/);
  const d = seen.find((c) => /dispatches$/.test(c.u));
  assert.deepEqual(d.body, { ref: 'omran-agent/portrait-1', inputs: { ref: 'omran-agent/portrait-1', settings: 'designSection', click: '' } });

  const title = BS.titleOf('omran-agent/portrait-1', { settings: 'designSection', click: '' });
  runs = [{ id: 54, head_sha: 'old', display_title: title, status: 'completed' }, { id: 55, head_sha: SHA, display_title: title + '  ', status: 'in_progress', html_url: 'https://github.com/o/r/actions/runs/55' }];
  seen.length = 0;
  const wait = await GM.manage(ask, opts);
  assert.match(wait.text, /قيد العمل/);
  assert.ok(!seen.some((c) => /dispatches$/.test(c.u)), 'لا تشغيل ثانٍ');

  runs[1].status = 'completed'; runs[1].conclusion = 'success';
  seen.length = 0;
  const done = await GM.manage(ask, opts);
  assert.equal(done.images.length, 2);
  assert.match(done.images[0].label, /لقطة الحاسوب/); assert.match(done.images[1].label, /لقطة الجوّال/);
  assert.equal(done.images[0].mime, 'image/png'); assert.equal(done.images[0].b64, PNG.toString('base64'));
  assert.match(done.text, /أخطاء الصفحة \(1\): desktop: x is not defined/);
  assert.equal(seen.find((c) => /githubusercontent\.com\/zip/.test(c.u)).auth, false, 'الرابط الموقَّع بلا مفتاح GitHub');

  // عرض آخر (قسم آخر) = تشغيل جديد، لا لقطة القسم القديم
  seen.length = 0;
  const other = await GM.manage(Object.assign({}, ask, { settings: 'accountSection' }), opts);
  assert.match(other.text, /بدأت/);
  assert.match((await GM.manage(Object.assign({}, ask, { click: 'x;rm' }), opts)).error, /click يقبل معرّف زرّ فقط/);
  assert.equal(GM.ownerAllows('shots', ''), true, 'قراءة بلا إذن');
});

test('٤. الأسلاك: اللقطتان تصلان المزوّد صورًا لمن يرى، والمنهج والقواعد تأمرهم بالنظر قبل «تمّ»', () => {
  const chat = read('api/_lib/chat.js');
  assert.ok(chat.includes('if (__vs) __seeImgs.push(...__mr.images.slice(0, 2));'), 'بعد نتائج الخطوة كصور المستودع');
  assert.ok(chat.includes("(__im.label || ('صورة من المستودع: ' + __im.path))"));
  assert.ok(GM.MANAGE_TOOL.description.includes('shots (لقطة شاشة لفرعك') && GM.MANAGE_TOOL.input_schema.properties.click);
  assert.match(require('../api/_lib/provider-level.js').OWNER_METHOD, /manage_github action=shots/);
  assert.match(require('../api/_lib/github-edit.js').WORK_NOTE, /والشاشة تصوّرها بنفسك بـmanage_github action=shots/);
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/branch-shots.test.cjs'));
});
