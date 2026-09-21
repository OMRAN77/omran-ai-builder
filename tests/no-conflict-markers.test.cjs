// tests/no-conflict-markers.test.cjs — v-hotfix-conflict-markers (٢١ سبتمبر ٢٠٢٦): دمج فرع
// claude/eager-dirac-1qdfr3 في main تُرك بعلامات تعارض git (<<<<<<</=======/>>>>>>>) غير محلولة داخل
// js/app-12-studios.js (قسم "🕌 Religious Insights"، مفتاح dream)، ثمّ أُعيد بناء الحزمة وأُعيد نشرها
// [skip ci] — فكسر app.bundle.js بالكامل في الإنتاج (Uncaught SyntaxError: Unexpected token '<<' على
// كل مستخدم، أبلغه المالك بلقطة شاشة). لا اختبار كان يفحص هذا لأنّ node --check نفسه (المُشغَّل في
// npm run check) لم يُشغَّل على تلك الالتزامات (وسم [skip ci] يتجاوز npm run ci كاملًا لا node --check
// وحده). هذا الاختبار يفحص علامات التعارض مباشرة بلا انتظار CI عاديّ، ويعمل حتى لو أُهمل تشغيل ci.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const MARKER_RE = /^(<{7}|={7}|>{7})(?![<=>])/m;

function walk(dir, out, skipDirs) {
  for (const name of fs.readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out, skipDirs);
    else if (/\.(js|mjs|cjs|html|css|json)$/.test(name)) out.push(full);
  }
}

test('لا علامات تعارض git (<<<<<<</=======/>>>>>>>) غير محلولة في أيّ ملفّ مصدر أو حزمة', () => {
  const files = [];
  walk(root, files, new Set(['.git', 'node_modules', 'thumbs-raw', '.vercel']));
  const offenders = [];
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    if (MARKER_RE.test(content)) offenders.push(path.relative(root, f));
  }
  assert.deepEqual(offenders, [], 'ملفّات فيها علامات تعارض git غير محلولة: ' + offenders.join(', '));
});
