'use strict';
/* v-poster-notext (أمر المالك ١٧ أكتوبر «أولّده»): بوستر الديكور مولَّد بمولّد الموقع المدفوع بلا أيّ نصّ،
   الغرف الـ١٢ شبكة ٤×٣ بمواضع مقيسة، والأسماء HTML لكلّ اللغات وتُعاد عند تبديل اللغة. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = (p) => path.join(__dirname, '..', p);
const read = (p) => fs.readFileSync(R(p), 'utf8');

test('١. الصورة: WebP 1640×1230 (ضعفا عرض العرض ٨٢٠، نسبة 4:3) بحجم معقول', () => {
  const buf = fs.readFileSync(R('assets/decor/chips/poster.webp'));
  assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(buf.toString('ascii', 8, 12), 'WEBP');
  // VP8X: الأبعاد في البايتات 24..29 (24-bit little-endian − 1)
  const chunk = buf.toString('ascii', 12, 16);
  let w, h;
  if (chunk === 'VP8X') { w = (buf.readUIntLE(24, 3)) + 1; h = (buf.readUIntLE(27, 3)) + 1; }
  else if (chunk === 'VP8 ') { w = buf.readUInt16LE(26) & 0x3fff; h = buf.readUInt16LE(28) & 0x3fff; }
  else if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); w = (b & 0x3fff) + 1; h = ((b >> 14) & 0x3fff) + 1; }
  assert.deepStrictEqual([w, h], [1640, 1230]);
  assert.ok(buf.length > 150000 && buf.length < 900000, 'الحجم ' + buf.length);
});

test('٢. المصدر يشير إلى البوستر الجديد، والنقاط الـ١٢ داخل الصورة بلا تداخل، ولا «مخ»', () => {
  const src = read('js/app-12-studios.js');
  assert.ok(src.includes("const POSTER_SRC = 'assets/decor/chips/poster.webp'"));
  assert.ok(!/POSTER_BRAIN/.test(src), 'لا نقطة مخ');
  const m = src.match(/const POSTER_HOT = \{([\s\S]*?)\n  \};/);
  assert.ok(m);
  const hot = new Function('return {' + m[1] + '}')();
  const keys = Object.keys(hot);
  assert.deepStrictEqual(keys.sort(), ['bath', 'bedroom', 'cafe', 'entrance', 'garden', 'kids', 'kitchen', 'living', 'majlis', 'office', 'restaurant', 'shop']);
  const boxes = keys.map((k) => hot[k]);
  for (const [l, t, w, h] of boxes) assert.ok(l >= 0 && t >= 0 && l + w <= 100 && t + h <= 100 && w > 15 && h > 20, String([l, t, w, h]));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i], boxes[j]];
    const overlap = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    assert.ok(!overlap, keys[i] + ' يتداخل مع ' + keys[j]);
  }
});

test('٣. الأسماء HTML لكلّ اللغات (لا شرط isAr)، وتُعاد عند تغيّر html.lang، وزرّ «أعطني أفكارًا» ظاهر', () => {
  const src = read('js/app-12-studios.js');
  const chips = src.slice(src.indexOf('function buildIdeaChips'), src.indexOf('buildIdeaChips();'));
  assert.ok(!/isAr/.test(chips), 'لا تمييز للعربيّة');
  assert.ok(/cap\.textContent = name/.test(chips) && /text-shadow/.test(chips) && !/background:rgba\(0,0,0,\.75\)/.test(chips), 'اسم ذهبيّ بظلّ بلا صندوق');
  assert.ok(/attributeFilter: \['lang'\]/.test(src), 'إعادة البناء عند تبديل اللغة');
  assert.ok(/ideaGo\.style\.display = ''/.test(chips), 'الزرّ الحقيقيّ ظاهر');
});

test('٤. المولّد المدفوع: وضع poster بنسبة 4:3 وسقف 1640 بلا نصّ، والورك فلو ينسخه إلى assets/decor/chips', () => {
  const s = read('scripts/thumbs-paid.mjs');
  assert.ok(/isMode\('poster'\)/.test(s) && /poster: 1640/.test(s) && /gemini\(j\.prompt, '4:3', '4K'\)/.test(s));
  assert.ok(/three rows and four columns/.test(s) && /no labels on the plinths/.test(s) && /Absolutely no text/.test(s));
  assert.ok(/copy poster assets\/decor\/chips/.test(read('.github/workflows/design-thumbs.yml')));
});

test('٥. اسم المكان فوق البوستر يلتفّ سطرين بدل القصّ («Living ro…» على جوّال ٣٩٠، والفرنسيّة والروسيّة أطول)', () => {
  const src = read('js/app-12-studios.js');
  const chips = src.slice(src.indexOf('function buildIdeaChips'), src.indexOf('buildIdeaChips();'));
  const m = chips.match(/cap\.style\.cssText = ('[^\n]*'\s*\+\s*'[^\n]*');/);
  assert.ok(m, 'نمط الاسم');
  const css = new Function('return ' + m[1])();
  assert.ok(!/white-space:\s*nowrap/.test(css) && !/text-overflow:\s*ellipsis/.test(css), 'لا nowrap ولا ellipsis: ' + css);
  assert.ok(/white-space:\s*normal/.test(css) && /overflow-wrap:\s*anywhere/.test(css), 'يلتفّ');
  assert.ok(/[;\s]width:\s*96%/.test(css) && /text-align:\s*center/.test(css) && /line-height:\s*1\.1/.test(css), 'بعرض الخانة وموسَّط بسطرين متقاربين');
  assert.ok(/font-size:clamp\(10px, 1\.5cqw, 14px\)/.test(css), 'المقاس كما هو (الحاسوب بلا تغيير)');
});
