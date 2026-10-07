const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('v-engine-verify: سطر تحقّق محرّك Claude Code أعلى app-05-ui.js وفي الحزمة المبنيّة', () => {
  const part = fs.readFileSync(path.join(__dirname, '..', 'js/app-05-ui.js'), 'utf8');
  assert.ok(part.startsWith('// test: claude code engine verification\n'), 'السطر أعلى الجزء');
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'js/app.bundle.js'), 'utf8');
  assert.ok(bundle.includes('// test: claude code engine verification'), 'السطر منقول إلى الحزمة المبنيّة');
});
