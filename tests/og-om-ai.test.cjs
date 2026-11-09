// tests/og-om-ai.test.cjs — v-og-om-ai: اسم التطبيق «OM Ai» في كلّ ما يُنشر على التواصل الاجتماعيّ
// (المالك ٩ نوفمبر: «التطبيق Om ai مش عمران ai — غيّر الاسم في كل التواصل الاجتماعي»): صورة معاينة الرابط، وتعليق الإعلانات،
// وبوت النشر، وفيديو الجولة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const OLD = /عمران ?(AI|Ai|إيه آي)|Omran AI|Omran Ai/;
const code = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); // التعليقات اقتباسات وتاريخ

function jpegSize(buf) { // أبعاد JPEG من مقطع SOF
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}

test('١. معاينة الرابط (og/twitter) في الصفحة الرئيسيّة وصفحة المشروع = og-om-ai.jpg، والقديمة لا تُشار', () => {
  for (const f of ['index.html', 'p.html']) {
    const h = read(f);
    assert.match(h, /<meta property="og:image" content="https:\/\/omran-ai-builder\.vercel\.app\/icons\/og-om-ai\.jpg">/, f);
    assert.ok(!h.includes('icons/og-omran.jpg'), f + ' ما زالت تشير إلى الصورة القديمة');
  }
  assert.match(read('index.html'), /<meta name="twitter:image" content="https:\/\/omran-ai-builder\.vercel\.app\/icons\/og-om-ai\.jpg">/);
});

test('٢. الصورة ١٢٠٠×٦٣٠، والاسم من brand-om-s.png بمقاسه الأصليّ (لا تكبير) بنجومه، والأصل لا يُحفظ فوقه', () => {
  const sz = jpegSize(fs.readFileSync(path.join(root, 'icons/og-om-ai.jpg')));
  assert.deepEqual(sz, { w: 1200, h: 630 });
  const png = fs.readFileSync(path.join(root, 'icons/brand-om-s.png'));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [422, 126]);
  const s = read('scripts/og-om-ai.mjs');
  assert.ok(s.includes("url('icons/brand-om-s.png')") && s.includes('#name img{position:absolute;left:0;top:0;width:422px;height:126px}'));
  assert.ok(s.includes('#04BAEC') && s.includes('#FEED01') && s.includes('#F049D7'), 'نجوم الشعار');
  assert.ok(s.includes("path.join(ROOT, 'icons/og-om-ai.jpg')") && !s.includes("'icons/og-omran.jpg'"));
});

test('٣. لا اسم قديم فيما يُنشر: تعليق الإعلانات، وبوت النشر، وفيديو الجولة (عدا التعليقات)', () => {
  for (const f of ['scripts/maha-narration.mjs', 'scripts/social-bot.mjs', 'scripts/social-bot-mira.mjs', 'scripts/video-anime-tour.mjs', 'scripts/og-om-ai.mjs']) {
    const hit = code(read(f)).split('\n').find((l) => OLD.test(l));
    assert.ok(!hit, f + ': ' + (hit || '').trim().slice(0, 120));
  }
  assert.ok(read('scripts/maha-narration.mjs').includes('هذا أوم إيه آي!'));
  assert.ok(read('scripts/social-bot.mjs').includes("'icons/brand-om-s.png'"), 'شعار البوت');
  const v = read('scripts/video-anime-tour.mjs');
  assert.ok(v.includes('src="/icons/brand-om-s.png"') && !v.includes('brand-ar.png'), 'شعار الفيديو');
});
