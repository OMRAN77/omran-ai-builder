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
