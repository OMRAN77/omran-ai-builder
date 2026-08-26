// scripts/fashion-thumbs-resize.mjs — تصغير صور النماذج الخام (thumbs-raw/*.png)
// إلى webp بطاقات خفيفة (عرض 360) في thumbs/. يتطلب sharp (يُثبّت في الووركفلو).
//
//   npm i --no-save sharp && node scripts/fashion-thumbs-resize.mjs
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import sharp from 'sharp';

for (const f of readdirSync('thumbs-raw').filter((x) => x.endsWith('.png'))) {
  // «فئة-نمط.png» → thumbs/<فئة>/<نمط>.webp؛ وبلا فئة يبقى مسطّحًا كما كان.
  const m = f.match(/^(women|men|kids|category|occasion|season|extras|portrait|studiofeat|studioopt|dstyle|dplace)-(.+)\.png$/);
  const out = m ? 'thumbs/' + m[1] + '/' + m[2] + '.webp' : 'thumbs/' + f.replace(/\.png$/, '.webp');
  mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
  await sharp('thumbs-raw/' + f).resize({ width: 360 }).webp({ quality: 78 }).toFile(out);
  console.log('✓ ' + out + ' — ' + Math.round(statSync(out).size / 1024) + 'KB');
}
