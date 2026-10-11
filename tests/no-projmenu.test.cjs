// tests/no-projmenu.test.cjs — v-no-projmenu: قائمة «المشاريع / بحث عن مشروع / حذف الكل» مخفيّة، وما يعتمد عليها باقٍ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('القائمة مخفيّة على الكمبيوتر والجوّال، وعناصرها باقية لمن يعتمد عليها', () => {
  const css = rd('css/redesign.css');
  assert.match(css, /\n#projMenuWrap\{display:none !important;\}/, 'قاعدة عامّة خارج أيّ media');
  const html = rd('index.html');
  for (const id of ['projMenuWrap', 'btnNew', 'projSearchInput', 'btnDeleteAll']) assert.ok(html.includes('id="' + id + '"'), id + ' باقٍ في الصفحة');
  assert.ok(rd('js/ui-wiring.js').includes("tap('#btnNew')"), '«محادثة جديدة» ما زالت تنقر #btnNew');
  assert.ok(rd('js/app-31-إطارات.js').includes("getElementById('projSearchInput')"), 'خانة البحث العلويّة ما زالت تكتب في بحث المشاريع');
});
