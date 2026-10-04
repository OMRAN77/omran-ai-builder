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
      assert.match(sel, /^(html\.skin-wood\b|\.wood[A-Z]|\.bgImgOpt\.bgImgTheme\b)/, 'قاعدة غير محصورة: ' + sel);
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

test('٣. الربط والترجمة: CSS بعد خلفيات.css، والنصّان بالـ١٤ لغة، ووسم اللغات مرفوع', () => {
  const html = rd('index.html');
  const a = html.indexOf('css/خلفيات.css?v=3'), b = html.indexOf('css/ثيم-خشبي.css?v=2');
  assert.ok(a > 0 && b > a, 'يُحمَّل بعد خلفيات.css فيعلو عليه');
  const data = rd('js/app-03-i18n-data.js');
  for (const k of ['bgThemeWood', 'woodRecentTitle']) {
    assert.equal((data.match(new RegExp('^    ' + k + ': ', 'gm')) || []).length, 2, 'ar+en: ' + k);
    for (const lg of LANGS) assert.ok(rd('i18n/' + lg + '.js').includes('"' + k + '":'), lg + ': ' + k);
  }
  assert.match(data, /bgThemeWood: 'خشبي'/);
  assert.match(data, /woodRecentTitle: 'المحادثات الجديدة'/);
  assert.ok(rd('js/app-04-i18n-state.js').includes(".js?v=715'"));
});

test('٤. «بيت» لوحة المعاينة الفارغة كما في الصورة: من صفوف القائمة نفسها وأزرار الشريط السفليّ، والنقر يمرّ إلى الأصل', () => {
  const src = rd('js/app-25-خلفيات.js');
  const body = src.slice(src.indexOf('function بيت()'), src.indexOf('function حمّل()'));
  assert.match(body, /getElementById\('emptyState'\)/, 'داخل حالة اللوحة الفارغة');
  assert.match(body, /querySelectorAll\('#history \.hist-item'\)/);
  assert.match(body, /i < rows\.length && i < 5/, 'آخر خمس محادثات');
  assert.match(body, /b\.onclick = function\(\)\{ title\.click\(\); \};/, 'فتح المحادثة بمنطق القائمة');
  assert.match(body, /'#omranSidebarFoot \.omNavBtn, #omranSidebarFoot \.omModeNav'/, 'الأدوات والملفات والإعدادات والوضع الفاتح');
  assert.match(body, /getElementById\('omranNewChatBtn'\); if\(b\) b\.click\(\);/, 'زرّ + = محادثة جديدة');
  const css = rd(CSS);
  assert.match(css, /\.woodHome\{display:none;\}/, 'مخفيّ بلا الثيم');
  assert.match(css, /html\.skin-wood #emptyState \.woodHome\{display:flex;/);
});
