// tests/sidebar-projmenu-hide.test.cjs — v-sidebar-projmenu-hide (طلب المالك ١٠ أكتوبر ٢٠٢٦ بلقطة): حذف البلوك
// الظاهر في الشريط الجانبيّ (قائمة المشاريع المطوية: عنوان «المشاريع» + زرّ طيّ + «بحث عن مشروع» + «حذف الكل»
// الأحمر). الوظيفة تبقى: btnNew/btnDeleteAll/projSearchInput في الـDOM مخفية (ui-wiring.js وapp-31-إطارات.js
// ودelete-confirm.js تعتمد عليها)، وخانة البحث الظاهرة #sbSearchWrap و«محادثة جديدة» و#omranFootDelete كما هم.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');

for (const file of ['index.html', 'src/index.html']) {
  test(`${file}: لا عنوان «المشاريع» ولا زرّ طيّ ولا «بحث عن مشروع» ولا محدِّدات الطيّ`, () => {
    const html = rd(file);
    for (const id of ['btnProjMenuToggle', 'projMenuPanel', 'projMenuChevron', 'btnProjSearch']) {
      assert.ok(!html.includes(`id="${id}"`), `${id} يجب ألّا يظهر`);
    }
    assert.ok(!html.includes('sbProjectsTitle'), 'عنوان «المشاريع» حُذف من الواجهة');
  });

  test(`${file}: btnNew وbtnDeleteAll وprojSearchInput باقون في الـDOM مخفيّين، والوعاء مخفيّ`, () => {
    const html = rd(file);
    const wrap = html.slice(html.indexOf('<div id="projMenuWrap"'), html.indexOf('<div id="history">'));
    assert.match(wrap, /<div id="projMenuWrap" style="display:none;">/, 'الوعاء display:none مباشر (لا hidden — .btn بلا !important تكسره)');
    assert.match(wrap, /id="btnNew"[^>]*style="display:none;"/, 'مشروع جديد مخفيّ');
    assert.match(wrap, /id="projSearchInput"[^>]*style="display:none;"/, 'خانة البحث القديمة مخفيّة');
    assert.match(wrap, /id="btnDeleteAll"[^>]*style="display:none;"/, 'حذف الكل مخفيّ');
  });
}

test('index.html: خانة البحث الظاهرة وزرّ محادثة جديدة وسلّة التذييل باقون كما هم', () => {
  const html = rd('index.html');
  assert.ok(html.includes('id="sbSearchWrap"'), '#sbSearchWrap يبقى');
  assert.ok(html.includes('id="omranNewChatBtn"'), 'محادثة جديدة تبقى');
  assert.ok(html.includes('id="omranFootDelete"'), 'سلّة التذييل تبقى');
});

test('index.html: وسوم ?v= ارتفعت للأوراق الأربع المعدَّلة', () => {
  const html = rd('index.html');
  assert.ok(html.includes('css/redesign.css?v=690'));
  assert.ok(html.includes('css/إطارات.css?v=6'));
  assert.ok(html.includes('css/ثيم-خشبي.css?v=4'));
  assert.ok(html.includes('css/ثيمات.css?v=9'));
});

test('CSS: لا محدِّد ميّت لـ#projMenuWrap أو#btnProjMenuToggle في الأوراق الأربع', () => {
  for (const f of ['css/redesign.css', 'css/إطارات.css', 'css/ثيمات.css', 'css/ثيم-خشبي.css']) {
    const css = rd(f);
    assert.ok(!css.includes('#projMenuWrap'), `${f}: لا #projMenuWrap`);
    assert.ok(!css.includes('#btnProjMenuToggle'), `${f}: لا #btnProjMenuToggle`);
  }
  // القاعدة المشتركة مع #omranHistTitle بقيت بعد حذف الاسمين من قائمة المحدِّدات
  assert.match(rd('css/ثيمات.css'), /html\.skin #omranHistTitle\{color:var\(--th-side-ink\) !important;\}/);
  assert.match(rd('css/ثيم-خشبي.css'), /html\.skin-wood #omranHistTitle\{color:var\(--wood-ink\) !important;\}/);
});

test('js/app-05-ui.js: منطق الطيّ (toggle/panel/chev/searchBtn) محذوف، وfilterProjects وrefreshProjMenuLabels باقيان بحراسة', () => {
  const src = rd('js/app-05-ui.js');
  for (const name of ['btnProjMenuToggle', 'projMenuPanel', 'projMenuChevron', 'btnProjSearch']) {
    assert.ok(!src.includes(name), `${name} محذوف من app-05-ui.js`);
  }
  assert.match(src, /function filterProjects\(q\)\{/, 'filterProjects باقية');
  assert.match(src, /searchInput\.addEventListener\('input', \(\) => filterProjects\(searchInput\.value\)\);/, 'مستمع البحث باقٍ');
  assert.match(src, /window\.__refreshProjMenuLabels = function\(\)\{/, 'تحديث التسميات باقٍ');
  // لا يخرج مبكرًا لغياب عناصر الطيّ المحذوفة
  assert.doesNotMatch(src, /if\(!toggle \|\| !panel\) return;/);
});

test('js/app-04-i18n-state.js: ما زال ينادي __refreshProjMenuLabels عند تغيّر اللغة', () => {
  assert.match(rd('js/app-04-i18n-state.js'), /window\.__refreshProjMenuLabels/);
});
