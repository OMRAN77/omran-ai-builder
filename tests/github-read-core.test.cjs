// tests/github-read-core.test.cjs — v-claude-code-level (A1، A2): read_github الحقيقيّ يقرأ قلب التطبيق.
// العرض: سأل المالك كلود عن المحادثة وزرّ الإرسال فلم يقرأ شيئًا — api/_lib/chat.js وgithub-write.js كانا
// «ملفّ ثنائيّ» (NUL خام في تعبير نمطيّ)، والبحث تخطّى js/app-09-attach.js (~٦٨٠ ألف بايت > سقف ٤٠٠ ألف).
// الطريقة: github-read.js الحقيقيّ (كما يستدعيه chat.js: deep:true) أمام GitHub مزيّف يخدم هذه النسخة المحلّيّة
// (الشجرة من git ls-files وأحجام الشجرة العاملة، والمحتوى من القرص).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const GH = require('../api/_lib/github-read.js');
const R = 'OMRAN77/omran-ai-builder';
const NUL = String.fromCharCode(0);

const tree = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\0').filter(Boolean).map((p) => {
    try { return { path: p, type: 'blob', size: fs.statSync(path.join(root, p)).size }; } catch (e) { return null; } // محذوف محلّيًّا
  }).filter(Boolean);

// GitHub مزيّف: overrides يستبدل محتوى مسار (نسخة مصلَحة مثلًا)؛ calls يسجّل كلّ مسار محتوى طُلب.
function fakeGithub(overrides) {
  const calls = [];
  const ov = overrides || {};
  const body = (p) => (Object.prototype.hasOwnProperty.call(ov, p) ? Buffer.from(ov[p], 'utf8') : fs.readFileSync(path.join(root, p)));
  const fetchImpl = async (url, init) => {
    const u = new URL(String(url));
    const p = decodeURIComponent(u.pathname);
    const raw = /raw/.test(String((init && init.headers && init.headers.Accept) || ''));
    if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
    if (/\/git\/trees\//.test(p)) return new Response(JSON.stringify({ tree, truncated: false }), { status: 200 });
    const m = /\/contents\/(.+)$/.exec(p);
    if (m) {
      calls.push(m[1]);
      let buf;
      try { buf = body(m[1]); } catch (e) { return new Response('{"message":"Not Found"}', { status: 404 }); }
      if (raw) return new Response(buf.toString('utf8'), { status: 200 });
      return new Response(JSON.stringify({ type: 'file', path: m[1], size: buf.length, encoding: 'base64', content: buf.toString('base64') }), { status: 200 });
    }
    return new Response('{"message":"Not Found"}', { status: 404 });
  };
  return { calls, opts: { deep: true, fetchImpl, lookup: async () => [{ address: '140.82.112.6', family: 4 }], env: { GITHUB_TOKEN: 'fake' } } };
}

test('read_github: github-write.js يُقرأ نصًّا بأسطر مرقّمة (CTRL_RE بهروب لا NUL خام)', async () => {
  const g = fakeGithub();
  const out = await GH.readGithub({ url: R, path: 'api/_lib/github-write.js' }, g.opts);
  assert.doesNotMatch(out, /^📄 [^\n]* — ملفّ ثنائيّ \(/, out.slice(0, 200)); // علامة formatFile لا كلمة في تعليق
  assert.match(out, /^📄 api\/_lib\/github-write\.js · \d+ سطر/);
  assert.match(out, /\d+\| const CTRL_RE = \/\[\\u0000-\\u001f\\u007f\]\/;/);
  // الهروب لم يغيّر المعنى: نفس المدى المرفوض (0x00–0x1f و0x7f)، والمسافة والعربيّة مقبولتان
  const GW = require('../api/_lib/github-write.js');
  for (const c of [0, 9, 10, 31, 127]) assert.equal(GW.validPath('a' + String.fromCharCode(c) + 'b'), false, 'محرف تحكّم ' + c);
  for (const ok of ['a b.js', 'docs/ملف.md', 'a~b']) assert.equal(GW.validPath(ok), true, ok);
});

test('read_github: chat.js (محرّك المحادثة) الحقيقيّ يُقرأ نصًّا، والماسح يعدّ أيّ ملفّ فيه NUL ثنائيًّا', async () => {
  const g = fakeGithub(); // الملفّ كما هو على القرص — بلا تنظيف
  const out = await GH.readGithub({ url: R, path: 'api/_lib/chat.js' }, g.opts);
  assert.doesNotMatch(out, /^📄 [^\n]* — ملفّ ثنائيّ \(/, out.slice(0, 200)); // علامة formatFile لا كلمة في تعليق
  assert.match(out, /^📄 api\/_lib\/chat\.js · \d+ سطر · الأسطر 1–\d+/);
  assert.match(out, /يتبع من السطر \d+ — استدعِ الأداة نفسها مع from=/, 'ملفّ طويل يُقرأ على دفعات');
  // السبب الذي يمنع NUL خامًا في الكود: formatFile والبحث يعاملان الملفّ ثنائيًّا.
  assert.match(GH.formatFile('x.js', '', 'const a = /' + NUL + '/g;\n', 1, true), /ملفّ ثنائيّ/);
  const g2 = fakeGithub({ 'api/_lib/chat.js': 'function customInstructionsBlock() {}\nconst x = /' + NUL + '/g;\n' });
  const hit = await GH.readGithub({ url: R, path: 'api/_lib', query: 'customInstructionsBlock' }, g2.opts);
  assert.ok(!/📄 api\/_lib\/chat\.js\n/.test(hit), 'الماسح يتخطّى ملفًّا فيه NUL خام: ' + hit.slice(0, 300));
});

test('read_github بحث: «__sendPromptCore» تحت js يجد js/app-09-attach.js (فوق ٤٠٠ ألف بايت)', async () => {
  const g = fakeGithub();
  const out = await GH.readGithub({ url: R, path: 'js', query: '__sendPromptCore' }, g.opts);
  assert.match(out, /^🔎 «__sendPromptCore» في OMRAN77\/omran-ai-builder\/js/);
  assert.match(out, /\n📄 js\/app-09-attach\.js\n {2}\d+\| /, out.slice(0, 600));
  // حارس الهامش: app-09 يكبر — إن تجاوز السقف سقط من البحث مجدّدًا
  const size = fs.statSync(path.join(root, 'js/app-09-attach.js')).size;
  assert.ok(size > 400000 && size <= GH.SEARCH_FILE_BYTES_MAX, 'app-09 بين السقف القديم والجديد: ' + size);
});

test('read_github بحث: الحزمة وjs/vendor و*.min.js تُتخطّى بلا تنزيل، إلّا إن طُلب مسارها صراحةً', async () => {
  const g = fakeGithub();
  const out = await GH.readGithub({ url: R, path: 'js', query: '__sendPromptCore' }, g.opts);
  assert.ok(!/js\/app\.bundle\.js/.test(out), 'الحزمة ليست نتيجة');
  assert.ok(!g.calls.some((p) => p === 'js/app.bundle.js' || /^js\/vendor\//.test(p) || /\.min\.js$/.test(p)), 'لا تنزيل لمولَّد أو مصغَّر: ' + g.calls.filter((p) => /vendor|min\.js|bundle/.test(p)).join(', '));
  assert.ok(g.calls.includes('js/app-09-attach.js'));
  // المتخطّى يُذكر صراحةً فلا تُقرأ النتيجة «غير موجود» في كلّ js
  assert.match(out, /\n— تخطّيت \d+ ملفًّا مصغّرًا\/مولَّدًا .*مرّر path داخله \(مثل js\/vendor\)/);
  // مكتبة مصغّرة دون السقف (hls.min.js) لا تُبحث تحت js…
  const hls = fs.statSync(path.join(root, 'js/vendor/hls.min.js')).size;
  assert.ok(hls <= GH.SEARCH_FILE_BYTES_MAX, 'hls.min.js دون السقف فالتخطّي بالنمط لا بالحجم');
  const g2 = fakeGithub();
  const viaJs = await GH.readGithub({ url: R, path: 'js', query: 'Hls' }, g2.opts);
  assert.ok(!/📄 js\/vendor\//.test(viaJs), viaJs.slice(0, 300));
  assert.match(viaJs, /تخطّيت \d+ ملفًّا مصغّرًا\/مولَّدًا/);
  // «لا نتائج» تحمل التنبيه نفسه: الرمز قد يكون في المتخطّى
  const none = await GH.readGithub({ url: R, path: 'js', query: 'zz_not_anywhere_' + Date.now() }, fakeGithub().opts);
  assert.match(none, /^لا نتائج لـ«zz_not_anywhere_\d+».*\n— تخطّيت \d+ ملفًّا مصغّرًا\/مولَّدًا/s);
  // …وتُبحث حين يكون المسار نفسه js/vendor.
  const g3 = fakeGithub();
  const viaVendor = await GH.readGithub({ url: R, path: 'js/vendor', query: 'Hls' }, g3.opts);
  assert.match(viaVendor, /\n📄 js\/vendor\/hls\.min\.js\n/, viaVendor.slice(0, 300));
  assert.doesNotMatch(viaVendor, /تخطّيت/, 'لا تخطّي حين يُطلب المسار نفسه');
});
