// tests/skin-wood.test.cjs — v-skin-wood (أمر المالك ٤ أكتوبر بصورة: «أعطني بالضبط مرتّبة نفس هذي، تخلّيها في الخلفيّات، إذا
// اختارها يستوي نفسها»). سلوك الاختيار والحفظ في tests/خلفيات.test.cjs (١٠ و١١)؛ هنا: CSS الثيم محصور تحت html.skin-wood فلا
// يمسّ من لم يختره، وكلّ خامة يشير إليها موجودة وخفيفة، والربط والترجمة، و«بيت» لوحة المعاينة من القائمة نفسها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const CSS = 'css/ثيم-خشبي.css';
const DIR = path.join(root, 'assets', 'ثيمات', 'خشبي');
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

function jpegWidth(file) {
  const b = fs.readFileSync(file);
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xC0 || m === 0xC1 || m === 0xC2) return b.readUInt16BE(i + 7);
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return 0;
}

test('١. كلّ قاعدة محصورة: html.skin-wood أو أصناف الثيم الجديدة وحدها — من لم يختر الثيم لا يتغيّر عنده شيء', () => {
  const css = rd(CSS).replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(sels.length > 40, 'القواعد قُرئت: ' + sels.length);
  for (const list of sels) {
    for (const sel of list.split(',').map((s) => s.trim())) {
      assert.match(sel, /^(html\.skin-wood\b|\.bgImgOpt\.bgImgTheme\b)/, 'قاعدة غير محصورة: ' + sel);
    }
  }
});

test('٢. الخامات: كلّ url في CSS موجود وخفيف، والمصغّر ٣٦٠ عرضًا، والمولّد مسجَّل', () => {
  const css = rd(CSS);
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:'));
  assert.ok(urls.length >= 6);
  for (const u of urls) {
    const f = path.join(root, 'css', decodeURIComponent(u));
    assert.ok(fs.existsSync(f), 'مفقود: ' + decodeURIComponent(u));
    assert.ok(fs.statSync(f).size < 30 * 1024, 'ثقيل: ' + decodeURIComponent(u));
  }
  for (const f of ['خشب.jpg', 'رق.jpg', 'كتان.jpg', 'كتان-بني.jpg', 'رق-ممزق.webp', 'سنابل.svg', 'مصغّر.jpg']) assert.ok(fs.existsSync(path.join(DIR, f)), f);
  assert.equal(jpegWidth(path.join(DIR, 'مصغّر.jpg')), 360, 'مصغّر الشبكة بمقاس مصغّرات الخلفيّات');
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'ثيم-خشبي.mjs')), 'الخامات تُعاد توليدًا بالسكربت');
});

test('٣. الربط والترجمة: CSS بعد خلفيات.css، واسم الثيم بالـ١٤ لغة، ووسم اللغات مرفوع', () => {
  const html = rd('index.html');
  const a = html.indexOf('css/خلفيات.css?v='), b = html.indexOf('css/ثيم-خشبي.css?v=');
  assert.ok(a > 0 && b > a, 'يُحمَّل بعد خلفيات.css فيعلو عليه');
  const data = rd('js/app-03-i18n-data.js');
  for (const k of ['bgThemeWood']) {
    assert.equal((data.match(new RegExp('^    ' + k + ': ', 'gm')) || []).length, 2, 'ar+en: ' + k);
    for (const lg of LANGS) assert.ok(rd('i18n/' + lg + '.js').includes('"' + k + '":'), lg + ': ' + k);
  }
  assert.match(data, /bgThemeWood: 'خشبي'/);
  assert.ok(rd('js/app-04-i18n-state.js').includes(".js?v=732'"));
});

test('٤. «بيت» لوحة المعاينة الفارغة شيل (أمر المالك بعد الثيمات: «شيل هذا من البنّيّ»): لا دالّة ولا مراقب ولا CSS ولا نصّ', () => {
  const src = rd('js/app-25-خلفيات.js');
  assert.doesNotMatch(src, /function بيت\(|MutationObserver|woodHome|woodRecentTitle/);
  assert.match(src, /ثيم: ثيم \};/, 'لا «بيت» في window.خلفيات');
  assert.doesNotMatch(rd(CSS).replace(/\/\*[\s\S]*?\*\//g, ''), /\.wood(Home|Logo|Plus|Round)/);
  assert.doesNotMatch(rd('js/app-03-i18n-data.js'), /woodRecentTitle/);
  for (const lg of LANGS) assert.doesNotMatch(rd('i18n/' + lg + '.js'), /woodRecentTitle/, lg);
});

// أمر المالك بعد الثيمات («الخشبي»): المشروع المفتوح بلا لوحه، و«محادثة جديدة» بيضاء في الوضع الفاتح — قاعدتا التطبيق كانتا أعلى
test('٥. المختارة بلوحها و«محادثة جديدة» نحاسيّة في الوضعين: محدِّد ثانٍ يغلب redesign.css والوضع الفاتح', () => {
  const css = rd(CSS);
  assert.match(css, /html\.skin-wood \.hist-item\.active, html\.skin-wood:not\(\.mobile-ui\) #history \.hist-item\.active\{background:var\(--wood-plank\) !important;/);
  assert.match(css, /html\.skin-wood #omranNewChatBtn, html\.skin-wood:not\(\.mobile-ui\) #omranNewChatBtn, html\.skin-wood:not\(\.mobile-ui\) #omranNewChatBtn:hover\{[^}]*background:var\(--wood-copper\) !important;/);
  // القاعدتان اللتان كانتا تغلبان ما زالتا هناك — فالمحدِّد الثاني لازم
  assert.match(rd('css/redesign.css'), /html:not\(\.mobile-ui\) \.hist-item\.active\{background:transparent !important;/);
  assert.match(rd('css/tokens.css'), /html\[data-mode="light"\]:not\(\.mobile-ui\) #omranNewChatBtn/);
});
