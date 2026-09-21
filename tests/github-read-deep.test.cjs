// tests/github-read-deep.test.cjs — v-claude-deep-github (٢١ سبتمبر ٢٠٢٦): طلب المالك «خلّ كلاود ٥
// يقرى الجيت هب نفسك بالضبط» — قراءة أعمق (ملفّ أوسع بالدفعة، شجرة أوسع، README أطول، حدّ حجم
// ملفّ أعلى) عبر opts.deep، تُستخدم على مسار كلود حصرًا (السلك في chat.js، مختبر منفصلًا).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GH = require('../api/_lib/github-read.js');

const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
function jsonRes(obj, status) { return { ok: !status || status < 400, status: status || 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => obj, text: async () => JSON.stringify(obj) }; }
function textRes(txt) { return { ok: true, status: 200, headers: new Headers(), json: async () => { throw new Error('not json'); }, text: async () => txt }; }
function fakeNet(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    calls.push(u);
    for (const [re, res] of routes) if (re.test(u)) return typeof res === 'function' ? res(u) : res;
    return jsonRes({ message: 'Not Found' }, 404);
  };
  return { calls, opts: { fetchImpl, lookup, env: {} } };
}

test('formatFile: deep=true يقرأ دفعة أكبر بكثير من العادية بنفس المحتوى', () => {
  const lines = []; for (let i = 1; i <= 5000; i++) lines.push('line ' + i);
  const src = lines.join('\n');
  const shallow = GH.formatFile('a.js', 'main', src, 1, false);
  const deep = GH.formatFile('a.js', 'main', src, 1, true);
  const shallowEnd = Number(/الأسطر 1–(\d+)/.exec(shallow)[1]);
  const deepEnd = Number(/الأسطر 1–(\d+)/.exec(deep)[1]);
  assert.ok(deepEnd > shallowEnd * 2, 'العمق يقرأ أضعاف الأسطر بالدفعة الواحدة: ' + shallowEnd + ' مقابل ' + deepEnd);
});

test('readGithub: deep=true يوسّع شجرة المستودع وREADME في نظرة المستودع', async () => {
  const manyFiles = Array.from({ length: 500 }, (_, i) => ({ path: 'src/f' + i + '.js', type: 'blob', size: 10 }));
  const longReadme = 'مرحبا '.repeat(2000); // أطول من README_MAX الشحيح
  const net = fakeNet([
    [/\/repos\/a\/b$/, jsonRes({ full_name: 'a/b', default_branch: 'main' })],
    [/\/git\/trees\/main\?recursive=1$/, jsonRes({ tree: manyFiles, truncated: false })],
    [/\/readme\?ref=main$/, textRes(longReadme)],
  ]);
  const shallow = await GH.readGithub({ url: 'a/b' }, net.opts);
  const deep = await GH.readGithub({ url: 'a/b' }, Object.assign({}, net.opts, { deep: true }));
  assert.match(shallow, /و\d+ ملفًّا آخر/, 'الشجرة الضحلة مقصوصة (٣٠٠)');
  assert.doesNotMatch(deep, /و\d+ ملفًّا آخر/, 'العميقة تعرض الـ٥٠٠ كاملة');
  assert.ok(shallow.length < deep.length, 'README الأطول يظهر كاملًا في العميقة فقط');
});

test('readGithub: deep=true يرفع سقف حجم الملفّ المسموح قراءته', async () => {
  const bigSize = 2000000; // بين FILE_MAX العاديّ (1.5MB) وDEEP_FILE_MAX (4MB)
  const net = fakeNet([
    [/\/contents\/big\.txt\?ref=main$/, jsonRes({ type: 'file', path: 'big.txt', size: bigSize, encoding: 'base64', content: Buffer.from('x'.repeat(100)).toString('base64') })],
  ]);
  const url = 'https://github.com/a/b/blob/main/big.txt';
  const shallow = await GH.readGithub({ url }, net.opts);
  assert.match(shallow, /أكبر من/, 'يُرفض في الوضع العاديّ');
  const deep = await GH.readGithub({ url }, Object.assign({}, net.opts, { deep: true }));
  assert.doesNotMatch(deep, /أكبر من/, 'يُقرأ في الوضع العميق');
});

console.log('✓ github-read-deep: opts.deep يوسّع الملفّ والشجرة وREADME وحدّ الحجم بلا أثر حين يُترك افتراضيًّا');
