// v-hl-gold (طلب المالك ١٩ سبتمبر): روابط ردود المحادثة ذهبيّة بدل الفيروزيّ.
// أرقام النصّ العاديّ تبقى بلون النصّ نفسه (لا تلوين om-en) — قرار سابق v-hl-links-only.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('index.html: روابط .msg-text ذهبيّة (#d4af37 داكن / #b8860b فاتح) لا فيروزيّة', () => {
  const html = read('index.html');
  assert.match(html, /\.msg-text a\{ color:#d4af37 !important; \}/, 'الرابط ذهبيّ في الوضع الداكن');
  assert.match(html, /html\[data-mode="light"\] \.msg-text a\{ color:#b8860b !important; \}/, 'الرابط ذهبيّ مقروء في الوضع الفاتح');
  assert.doesNotMatch(html, /\.msg-text a\{ color:#2dd4bf/, 'لم يبقَ الفيروزيّ');
});

test('العميل: لا تلوين للأرقام في النصّ العاديّ (تبقى بلون النصّ، والأصفر للروابط فقط)', () => {
  const js = read('js/app-02-tts.js');
  // الرابط <a> وحده يأخذ لونًا؛ لا صنف om-en على الكلمات/الأرقام اللاتينيّة
  assert.doesNotMatch(js, /classList\.add\('om-en'\)/, 'لا يُضاف om-en يلوّن الأرقام');
  assert.match(js, /a\.style\.cssText = 'color:var\(--om-hl/, 'اللون محصور في وسم الرابط');
});

test('v-code-color-mobile-fix (بلاغ المالك: أرقام الكود صفراء): قاعدة CSS العالميّة لكتلة الكود محايدة لا صفراء', () => {
  const css = read('css/tokens.css');
  // القاعدة خارج أيّ @media (تشمل الجوّال) — كانت تفرض --om-hl (أصفر) على كتلة
  // الكود كاملة بالخطأ (نسخة عن v-hl-yellow القديمة قبل أن يحذفها v-code-color من
  // نسخة سطح المكتب)، فتظهر الأرقام صفراء أثناء بثّ ردّ يحوي كودًا. الآن نفس اللون
  // المحايد #e6edf3 الذي تستعمله نسخة سطح المكتب (سطر ٣٤١-٣٤٢).
  const i = css.indexOf('v-code-color-mobile-fix');
  assert.ok(i > 0, 'التعليق موجود');
  const block = css.slice(i, i + 700);
  assert.match(block, /\.chat-codeblock pre, \.chat-codeblock pre \.tts-word\{ color:#e6edf3 !important; \}/, 'محايد لا أصفر');
  assert.doesNotMatch(block, /color:var\(--om-hl/, 'لا يعود يستعمل متغيّر الروابط الأصفر لكتلة الكود كاملة');
  // نفس اللون المحايد في نسخة سطح المكتب — لا تناقض بين النسختين بعد الإصلاح
  const desktopRule = css.match(/\.chat-codeblock pre\{[^}]*color:(#[0-9a-f]{6})/i);
  assert.ok(desktopRule, 'قاعدة سطح المكتب موجودة');
  assert.equal(desktopRule[1].toLowerCase(), '#e6edf3');
});
