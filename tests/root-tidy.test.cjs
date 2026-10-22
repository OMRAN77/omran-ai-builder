// tests/root-tidy.test.cjs — v-root-tidy: جذر المستودع بلا لقطات تشخيص ولا أرشيفات، والمنقول إلى archive/ محفوظ ولا يُنشر.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('الجذر: لا صور إلّا صورتي «مها»، ولا zip، ولا مجلّد videos_tmp', () => {
  const top = fs.readdirSync(root);
  const pngs = top.filter((n) => /\.(png|jpe?g)$/i.test(n)).sort();
  assert.deepEqual(pngs, ['maha-icon-v2.png', 'maha-icon.png'], 'صورة جديدة في الجذر؟ مكانها assets/ أو archive/');
  assert.deepEqual(top.filter((n) => /\.zip$/i.test(n)), []);
  assert.ok(!top.includes('videos_tmp'));
});

test('archive/ محفوظ ولا يُنشر', () => {
  for (const f of ['diag-1.png', 'source-code.zip', 'videos_tmp/designai_ar.mp4']) assert.ok(fs.existsSync(path.join(root, 'archive', f)), f);
  const vi = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim());
  assert.ok(vi.includes('archive/'));
});
