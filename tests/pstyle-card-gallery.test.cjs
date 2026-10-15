'use strict';
/* v-pstyle-card-gallery (المالك ١٥ أكتوبر، أرسل صورة: قاعة فاخرة برخام عاكس، أسطوانة زجاجيّة مضيئة في الوسط تدور حولها بطاقات
   بورتريه للشخص نفسه، وشارة «12» ذهبيّة فوقها: «شو هذي؟ حطّها في أنماط الصور لكن خذ الفكرة من الستايل، سوّ نفسها بالضبط»).
   نمط جديد cardGallery بالخطوات الأربع التي ثبّتها v-pstyle-batch-2 (خيار، وصف، تسمية بالـ١٤ لغة، أمر الخادم) + بطاقة المعاينة
   ومولّد الصور المصغّرة ورفع وسمَي الإصدار (partials-core وملفّات اللغات). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'pstyle-card-gallery-test'; // portrait-style.js يرفض التحميل بلا سرّ الجلسات
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const ID = 'cardGallery', KEY = 'portraitStyleCardGallery', AR = 'معرض بطاقات زجاجي فاخر';

test('١. الخيار في قائمة «أنماط الصور» (أوّل «🆕 ستايلات جديدة»)، والوصف في PSTYLE_SUBS بترجمته في STU_XL بالـ١٢ لغة', () => {
  const p = read('js/partials-core.js');
  assert.match(p, /<optgroup label="🆕 ستايلات جديدة" data-i18n="\[label\]portraitGrpNew">\n\s*<option value="cardGallery" data-i18n="portraitStyleCardGallery">🏛️ معرض البطاقات الفاخر<\/option>/);
  const s = read('js/app-12-studios.js');
  assert.ok(s.includes("cardGallery: '" + AR + "',"), 'PSTYLE_SUBS');
  const m = new RegExp("'" + AR + "': \\{([^}]*)\\}").exec(s);
  assert.ok(m, 'STU_XL');
  for (const lg of ['en', 'fr', 'hi', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml']) assert.match(m[1], new RegExp("(?:^|,)" + lg + ":'[^']+'"), 'STU_XL ' + lg);
  assert.ok(s.includes("const PSTYLE_IMG_V = '16';"), 'وسم صور الأنماط مرفوع');
});

test('٢. التسمية بالـ١٤ لغة: app-03 (عربيّ وإنجليزيّ) و١٢ ملفّ لغة، ووسم ملفّات اللغات مرفوع', () => {
  const ar = read('js/app-03-i18n-data.js');
  assert.ok(ar.includes(KEY + ": '🏛️ معرض البطاقات الفاخر',") && ar.includes(KEY + ": '🏛️ Luxury Card Gallery',"));
  for (const f of fs.readdirSync(path.join(root, 'i18n')).filter((n) => n !== 'ad-studio.js')) assert.match(read('i18n/' + f), new RegExp(KEY + ": '🏛️ [^']+',"), f);
  // الرقم يُقرأ لا يُثبَّت (سقّاطة vPinTests في arch-ratchet): يكفي أنّه رُفع فوق ما كان قبل النمط (744 و657)
  const i18nTag = Number((read('js/app-04-i18n-state.js').match(/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]);
  assert.ok(i18nTag >= 745, 'وسم i18n مرفوع: ' + i18nTag);
  const coreTag = Number((read('index.html').match(/\/js\/partials-core\.js\?v=(\d+)/) || [])[1]);
  assert.ok(coreTag >= 658, 'وسم partials-core مرفوع: ' + coreTag);
});

test('٣. أمر الخادم يصف المشهد المرجعيّ نفسه (أسطوانة زجاجيّة، بطاقات الشخص نفسه، شارة 12، رخام عاكس)، وهو إعادة رسم فنّيّة لا تعديلًا موضعيًّا', () => {
  const P = require('../api/_lib/portrait-style.js');
  const d = P.STYLE_PROMPTS[ID];
  assert.ok(d, 'STYLE_PROMPTS.cardGallery');
  for (const re of [/glass cylinder vitrine/, /ring of about twelve framed vertical portrait cards/, /this same person/, /number "12"/, /mirror-like marble floor/, /golden/]) assert.match(d, re);
  assert.ok(!/isLocalizedEdit = \[[^\]]*'cardGallery'/.test(read('api/_lib/portrait-style.js')), 'ليس تعديلًا موضعيًّا');
  assert.ok(Object.keys(P.STYLE_PROMPTS).includes(ID));
});

test('٤. بطاقة المعاينة بمقاس البطاقات (٣٦٠×٥٣٧ webp)، ومولّد الصور المصغّرة يعرف النمط', () => {
  const b = fs.readFileSync(path.join(root, 'assets/portrait/styles/cardGallery.webp'));
  assert.equal(b.slice(0, 4).toString('latin1'), 'RIFF'); assert.equal(b.slice(8, 12).toString('latin1'), 'WEBP');
  // VP8/VP8L/VP8X: الأبعاد من رأس الصورة
  const vp8x = b.slice(12, 16).toString('latin1') === 'VP8X';
  let w, h;
  if (vp8x) { w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16)); h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16)); }
  else if (b.slice(12, 16).toString('latin1') === 'VP8 ') { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
  else { const bits = b.readUInt32LE(21); w = (bits & 0x3fff) + 1; h = ((bits >> 14) & 0x3fff) + 1; }
  assert.deepEqual([w, h], [360, 537]);
  const t = read('scripts/portrait-thumbs.mjs');
  assert.ok(/'flagday',\n\s*'cardGallery',/.test(t) && t.includes("cardGallery: 'm4',"), 'في قائمة التوليد وخريطة الوجه المصدر');
});
