'use strict';
/* v-smoke-skip-railway (المالك ١٤ أكتوبر بعد #1061: دخان Railway أحمر والتطبيق حيّ):
   لوحة railway.com ليست التطبيق — الدخان يتخطّاها، ويبقى على vercel.app. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('١. الورك فلو لا يدخّن إلّا نشرة Vercel؛ السكربت يتخطّى لوحة Railway', () => {
  const y = read('.github/workflows/smoke.yml');
  assert.match(y, /contains\(github\.event\.deployment_status\.environment_url, 'vercel\.app'\)/, 'شرط التشغيل على vercel.app');
  assert.match(y, /v-smoke-skip-railway/);
  const s = read('scripts/smoke.mjs');
  assert.match(s, /function isSmokeableUrl/);
  assert.match(s, /h\.endsWith\('\.vercel\.app'\)/);
  assert.match(s, /تُخطّى: العنوان ليس نشرة التطبيق/);
});

test('٢. تشغيل السكربت على railway.com يخرج 0 بلا فحص شبكة', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/smoke.mjs'), 'https://railway.com/project/a87bf595-f7a9-406f-9b7d-023976da4b65?environmentId=x'], {
    encoding: 'utf8', timeout: 5000, cwd: root,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /تُخطّى/);
  assert.doesNotMatch(r.stdout, /الدخان أحمر/);
});
