// tests/repo-map-cap.test.cjs — v-repo-map-cap: الخريطة المولَّدة (api/_lib/repo-map.js) تبقى تحت MAX_CHARS.
// العرض: `npm run ci` لا يشغّل scripts/repo-map.mjs (الخريطة تُبنى في `npm run bundle` وحده)، فدرجت الخريطة
// فوق السقف على main بلا أيّ إنذار في CI حتّى فشل `npm run bundle` محلّيًّا (7076 > 7000). هذا الحارس يمسكه في CI.
// القصّ: LIB_PURPOSE أو PITFALLS_N في scripts/repo-map.mjs — لا رفع السقف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const load = () => import(pathToFileURL(path.join(root, 'scripts', 'repo-map.mjs')).href);

test('خريطة المستودع تبقى تحت السقف MAX_CHARS', async () => {
  const m = await load();
  const len = m.buildMap().note.length;
  assert.ok(len <= m.MAX_CHARS,
    'الخريطة ' + len + ' حرفًا > السقف ' + m.MAX_CHARS + ' — قصّ LIB_PURPOSE أو PITFALLS_N في scripts/repo-map.mjs (لا ترفع السقف)');
});
