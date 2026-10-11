// tests/no-nul-source.test.cjs — v-claude-code-level (A1): لا بايت NUL خام في كود التطبيق.
// العرض: read_github (أداة المالك) رأى api/_lib/chat.js وapi/_lib/github-write.js «ملفّ ثنائيّ — لا يُقرأ نصًّا»
// لأنّ في كلّ منهما بايت 0x00 خامًا داخل تعبير نمطيّ؛ فلم يقرأ كلود محرّك المحادثة نفسه. الهروب (\u0000) يحفظ
// المعنى حرفيًّا ويُبقي الملفّ نصًّا. tests/github-write.test.cjs يحمل NUL عمدًا (يختبر رفض المسار) فيُستثنى.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const TEXT_RE = /\.(?:js|cjs|mjs|json|css|html?|md|txt)$/i;
const EXCLUDE = new Set(['tests/github-write.test.cjs']);

function tracked() {
  const out = execFileSync('git', ['ls-files', '-z', '--', 'api', 'js', 'tests'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  return out.split('\0').filter(Boolean)
    .filter((f) => TEXT_RE.test(f) && !EXCLUDE.has(f))
    .filter((f) => /^(?:api|js)\//.test(f) || /^tests\/[^/]+\.(?:c|m)?js$/.test(f));
}

test('لا بايت 0x00 خام في ملفّات api/** وjs/** وtests/*.cjs المتتبَّعة (المكسور = يُقرأ ثنائيًّا)', () => {
  const files = tracked();
  assert.ok(files.length > 100 && files.includes('api/_lib/chat.js') && files.includes('api/_lib/github-write.js'), 'المسح يشمل ملفّات الخادم');
  const bad = [];
  for (const f of files) {
    let buf;
    try { buf = fs.readFileSync(path.join(root, f)); } catch (e) { continue; } // محذوف من الشجرة العاملة
    const i = buf.indexOf(0);
    if (i !== -1) bad.push(f + ':' + buf.slice(0, i).toString('utf8').split('\n').length);
  }
  assert.deepEqual(bad, [], 'NUL خام (اكتبه \\u0000 بدلًا منه): ' + bad.join(', '));
});
