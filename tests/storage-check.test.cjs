// tests/storage-check.test.cjs — v-storage-check (لقطة المالك ٩ أكتوبر: «Auth error» عند إنشاء حساب).
// الفحص كان يكتب سجلّ مشاركة بلا رمز، وv-share-guard جعل النشر برمز إلزاميّ — فصار يحكم بعطل التخزين أيًّا كانت الحال.
// الآن يكتب عبر سجلّ أخطاء المتصفّح العامّ بمصدر diag: ويصنّف رفض Upstash بنصّه الحقيقيّ (من تشغيل الإنتاج نفسه).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'storage-check.mjs');
// نصّ الإنتاج الحرفيّ (تشغيل Storage check رقم ٤، ٩ أكتوبر ٠٤:٣١) — لا ما نتوقّعه (PITFALLS: «quota» قد تكون السعة).
const PROD_FULL = 'Upstash error: ERR DB capacity quota exceeded. Threshold: 268435456 bytes, Usage: 268447091 bytes. See https://upstash.com/docs/redis/troubleshooting/db_capacity_quota_exceeded for details';

test('١. التصنيف بنصّ الإنتاج: السعة غير حدّ الطلبات، والسليم بلا سبب', async () => {
  const { why } = await import(SCRIPT);
  assert.match(why(PROD_FULL), /سعة قاعدة Upstash امتلأت/);
  assert.match(why('Upstash error: ERR max requests limit exceeded. Limit: 500000, Usage: 500000'), /حدّ الطلبات/);
  assert.match(why('Upstash error: WRONGPASS invalid password'), /رمز Upstash مرفوض/);
  assert.equal(why('{"ok":true}'), '');
});

test('٢. يكتب عبر سجلّ الأخطاء العامّ بمصدر diag: (لا يُعدّ خطأً عند المالك) ولا يطرق المشاركة المقفلة', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.match(src, /\/api\/system\?action=client-errors/);
  assert.doesNotMatch(src, /action=share/, 'النشر صار برمز (v-share-guard) — الكتابة بلا رمز تُرفض بـ٤٠١');
  const source = (src.match(/source: '([^']+)'/) || [])[1];
  const { isDiag } = require('../api/_lib/app-errors.js');
  assert.ok(source && isDiag({ source, message: 'storage-check write probe' }), 'سطر التشخيص لا يُحسب خطأً: ' + source);
});

function serve(status, body) {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      let b = ''; req.on('data', (c) => { b += c; });
      req.on('end', () => { seen.push({ url: req.url, method: req.method, body: b }); res.writeHead(status, { 'content-type': 'application/json' }); res.end(body); });
    }).listen(0, '127.0.0.1', () => resolve({ srv, seen, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}
const runAgainst = (base) => new Promise((resolve) => {
  const p = spawn(process.execPath, [SCRIPT, base], { env: { ...process.env, MONITOR_KEY: '' } });
  let out = ''; p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { out += c; });
  p.on('close', (code) => resolve({ code, out }));
});

test('٣. قاعدة ممتلئة → يفشل ويقول السبب؛ قاعدة سليمة → ينجح ويوجّه لفحص الحساب', async () => {
  const full = await serve(500, JSON.stringify({ error: PROD_FULL }));
  const a = await runAgainst(full.base);
  full.srv.close();
  assert.equal(a.code, 1);
  assert.match(a.out, /سعة قاعدة Upstash امتلأت/);
  assert.match(a.out, /كلّ حساب جديد يفشل/);
  assert.equal(full.seen[0].method, 'POST');
  assert.equal(JSON.parse(full.seen[0].body).source, 'diag:storage-check');

  const okSrv = await serve(200, '{"ok":true}');
  const b = await runAgainst(okSrv.base);
  okSrv.srv.close();
  assert.equal(b.code, 0, b.out);
  assert.match(b.out, /تقبل الكتابة/);
  assert.match(b.out, /account=true/);
});
