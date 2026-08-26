// scripts/fashion-thumbs-resize.mjs — تصغير صور النماذج الخام (thumbs-raw/*.png)
// إلى webp بطاقات خفيفة (عرض 360) في thumbs/. يتطلب sharp (يُثبّت في الووركفلو).
//
//   npm i --no-save sharp && node scripts/fashion-thumbs-resize.mjs
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import sharp from 'sharp';

mkdirSync('thumbs', { recursive: true });
for (const f of readdirSync('thumbs-raw').filter((x) => x.endsWith('.png'))) {
  const out = 'thumbs/' + f.replace(/\.png$/, '.webp');
  await sharp('thumbs-raw/' + f).resize({ width: 360 }).webp({ quality: 78 }).toFile(out);
  console.log('✓ ' + out + ' — ' + Math.round(statSync(out).size / 1024) + 'KB');
}
