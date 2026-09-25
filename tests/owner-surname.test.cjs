'use strict';
/* v-owner-surname: الاسم العائلي الملصوق بعمران لا يبقى في أي ملفّ متتبَّع.
   الإبرة تُركَّب من نصفين حتى لا يحتوي هذا الاختبار العبارة نفسها. */
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const needle = 'عمران ' + 'الشامسي';
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const hits = [];
for (const rel of files) {
  const buf = fs.readFileSync(path.join(root, rel));
  if (buf.includes(0)) continue;
  if (buf.toString('utf8').includes(needle)) hits.push(rel);
}

assert.deepStrictEqual(hits, [], 'الاسم العائلي ما زال في: ' + hits.join(', '));
console.log('✓ owner-surname: لا وجود للاسم العائلي في الملفّات المتتبَّعة');
