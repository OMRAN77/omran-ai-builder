'use strict';
/* v-gpu-lite (فيديو المالك ٢٣ سبتمبر «بعده في تشويش»): صور بطاقات الأدوات (1200×720 تُعرض 173×96) والشعار
   (1203×400 يُعرض 126×42) كانت تملأ ذاكرة الرسم في أندرويد (~99MB مفكوكة في شاشة الأدوات) — نسخ عرض بمقاس الشاشة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function dims(file) {
  const b = fs.readFileSync(file);
  if (b.slice(1, 4).toString() === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  let i = 2; // JPEG: ابحث عن SOFn
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('no size: ' + file);
}

test('١. كلّ بطاقة أداة تُحمَّل من نسخة العرض 600×360 (≤ 0.9MB مفكوكة) والأصل باقٍ', () => {
  const js = fs.readFileSync('js/tool-card-images.js', 'utf8');
  assert.match(js, /'\/assets\/tool-cards\/s\/' \+ id \+ '\.jpg\?v=' \+ CLEAN_V/);
  const ids = JSON.parse(js.match(/var IDS = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
  assert.equal(ids.length, 18);
  for (const id of ids) {
    const [w, h] = dims('assets/tool-cards/s/' + id + '.jpg');
    assert.deepEqual([w, h], [600, 360], id);
    assert.ok(w * h * 4 / 1048576 < 0.9, id);
    assert.ok(fs.existsSync('assets/tool-cards/clean/' + id + '.jpg'), 'الأصل باقٍ: ' + id);
  }
  assert.match(fs.readFileSync('js/ui-wiring.js', 'utf8'), /\/js\/tool-card-images\.js\?v=14/);
});

test('٢. الشعار العربيّ والإنجليزيّ بنسخة 3× لارتفاع 42 في الصفحة وفي مبدّل اللغة', () => {
  assert.deepEqual(dims('icons/brand-ar-s.png'), [379, 126]);
  assert.deepEqual(dims('icons/brand-en-s.png'), [483, 126]);
  const html = fs.readFileSync('index.html', 'utf8');
  assert.equal((html.match(/src="icons\/brand-ar-s\.png"/g) || []).length, 2);
  assert.doesNotMatch(html, /icons\/brand-(?:ar|en)\.png/);
  const a10 = fs.readFileSync('js/app-10-features.js', 'utf8');
  assert.match(a10, /imgSrc = 'icons\/brand-ar-s\.png'/);
  assert.match(a10, /imgSrc = 'icons\/brand-en-s\.png'/);
  assert.doesNotMatch(a10, /icons\/brand-(?:ar|en)\.png/);
  assert.match(html, /\/js\/ui-wiring\.js\?v=649/);
});
