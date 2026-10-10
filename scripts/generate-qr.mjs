// scripts/generate-qr.mjs — توليد باركود رسمي وبطاقة تحميل ذكية لتطبيق عمران AI
// مع شعار الأيقونة الذهبية في المنتصف ودعم تصحيح الخطأ الفائق (Level H).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const qrcode = require('./lib/qrcode.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_URL = 'https://omran-ai-builder.vercel.app/download';

export function generateQrWithCenterIcon({
  url = TARGET_URL,
  iconPath = path.join(ROOT, 'icons/ai-hub-mark.png'),
  outPath = path.join(ROOT, 'icons/omran-qr-code.png'),
  scale = 22,
  margin = 4,
  iconRatio = 0.22, // 22% of QR code width (safe for Level H which recovers 30%)
} = {}) {
  const qr = qrcode(0, 'H');
  qr.addData(url);
  qr.make();

  const count = qr.getModuleCount();
  const size = (count + margin * 2) * scale;
  const png = new PNG({ width: size, height: size });

  // 1) Fill with pure white #ffffff
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 255;
    png.data[i + 2] = 255;
    png.data[i + 3] = 255;
  }

  // 2) Draw dark modules #0d0f12
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        const startX = (c + margin) * scale;
        const startY = (r + margin) * scale;
        for (let y = 0; y < scale; y++) {
          for (let x = 0; x < scale; x++) {
            const idx = ((startY + y) * size + (startX + x)) << 2;
            png.data[idx] = 13;
            png.data[idx + 1] = 15;
            png.data[idx + 2] = 18;
            png.data[idx + 3] = 255;
          }
        }
      }
    }
  }

  // 3) Center icon badge
  if (fs.existsSync(iconPath)) {
    const iconSrc = PNG.sync.read(fs.readFileSync(iconPath));
    const iconSize = Math.round(size * iconRatio);
    const iconX = Math.round((size - iconSize) / 2);
    const iconY = Math.round((size - iconSize) / 2);

    const pad = Math.round(scale * 0.65);
    const boxX = iconX - pad;
    const boxY = iconY - pad;
    const boxSize = iconSize + pad * 2;
    const radius = Math.round(boxSize * 0.24);

    // Draw dark rounded container + golden hairline bezel
    for (let y = boxY - 3; y < boxY + boxSize + 3; y++) {
      for (let x = boxX - 3; x < boxX + boxSize + 3; x++) {
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const qx = Math.max(0, Math.max(boxX + radius - x, x - (boxX + boxSize - radius)));
        const qy = Math.max(0, Math.max(boxY + radius - y, y - (boxY + boxSize - radius)));
        const dist = Math.sqrt(qx * qx + qy * qy);

        const idx = (y * size + x) << 2;
        if (dist <= radius) {
          // Dark badge background #0c0d10
          png.data[idx] = 12;
          png.data[idx + 1] = 13;
          png.data[idx + 2] = 16;
          png.data[idx + 3] = 255;
        } else if (dist <= radius + 3) {
          // Gold ring #d4af37
          png.data[idx] = 212;
          png.data[idx + 1] = 175;
          png.data[idx + 2] = 55;
          png.data[idx + 3] = 255;
        }
      }
    }

    // Blit center icon
    for (let y = 0; y < iconSize; y++) {
      for (let x = 0; x < iconSize; x++) {
        const srcX = Math.floor(x * iconSrc.width / iconSize);
        const srcY = Math.floor(y * iconSrc.height / iconSize);
        const srcIdx = (iconSrc.width * srcY + srcX) << 2;
        const dstIdx = ((iconY + y) * size + (iconX + x)) << 2;

        const a = iconSrc.data[srcIdx + 3] / 255;
        if (a > 0) {
          png.data[dstIdx] = Math.round(iconSrc.data[srcIdx] * a + png.data[dstIdx] * (1 - a));
          png.data[dstIdx + 1] = Math.round(iconSrc.data[srcIdx + 1] * a + png.data[dstIdx + 1] * (1 - a));
          png.data[dstIdx + 2] = Math.round(iconSrc.data[srcIdx + 2] * a + png.data[dstIdx + 2] * (1 - a));
          png.data[dstIdx + 3] = 255;
        }
      }
    }
  }

  const buf = PNG.sync.write(png);
  fs.writeFileSync(outPath, buf);
  return { outPath, size, bytes: buf.length };
}

export function generatePosterCard({
  qrPath = path.join(ROOT, 'icons/omran-qr-code.png'),
  outPath = path.join(ROOT, 'assets/omran-qr-card.png'),
  width = 1200,
  height = 1200,
} = {}) {
  const card = new PNG({ width, height });

  // 1) Fill dark metallic gradient #0a0b0e -> #141720
  for (let y = 0; y < height; y++) {
    const ratio = y / height;
    const r = Math.round(10 + ratio * 8);
    const g = Math.round(11 + ratio * 10);
    const b = Math.round(14 + ratio * 14);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) << 2;
      card.data[idx] = r;
      card.data[idx + 1] = g;
      card.data[idx + 2] = b;
      card.data[idx + 3] = 255;
    }
  }

  // 2) Outer golden border (4px inside margin 24px)
  const borderM = 24;
  const radius = 32;
  for (let y = borderM; y < height - borderM; y++) {
    for (let x = borderM; x < width - borderM; x++) {
      const qx = Math.max(0, Math.max(borderM + radius - x, x - (width - borderM - radius)));
      const qy = Math.max(0, Math.max(borderM + radius - y, y - (height - borderM - radius)));
      const dist = Math.sqrt(qx * qx + qy * qy);
      if (dist >= radius - 3 && dist <= radius) {
        const idx = (y * width + x) << 2;
        card.data[idx] = 212;
        card.data[idx + 1] = 175;
        card.data[idx + 2] = 55;
        card.data[idx + 3] = 255;
      }
    }
  }

  // 3) Stamp QR code in the card center
  if (fs.existsSync(qrPath)) {
    const qrImg = PNG.sync.read(fs.readFileSync(qrPath));
    const qrDisplaySize = 660; // 660x660 in center
    const qrX = Math.round((width - qrDisplaySize) / 2);
    const qrY = 270;

    // White backing box with rounded corners
    const qrBoxPad = 16;
    const bx = qrX - qrBoxPad;
    const by = qrY - qrBoxPad;
    const bsize = qrDisplaySize + qrBoxPad * 2;
    const brad = 28;

    for (let y = by - 4; y < by + bsize + 4; y++) {
      for (let x = bx - 4; x < bx + bsize + 4; x++) {
        const qx = Math.max(0, Math.max(bx + brad - x, x - (bx + bsize - brad)));
        const qy = Math.max(0, Math.max(by + brad - y, y - (by + bsize - brad)));
        const dist = Math.sqrt(qx * qx + qy * qy);
        const idx = (y * width + x) << 2;
        if (dist <= brad) {
          card.data[idx] = 255;
          card.data[idx + 1] = 255;
          card.data[idx + 2] = 255;
          card.data[idx + 3] = 255;
        } else if (dist <= brad + 4) {
          // Golden outer glow/ring
          card.data[idx] = 212;
          card.data[idx + 1] = 175;
          card.data[idx + 2] = 55;
          card.data[idx + 3] = 255;
        }
      }
    }

    // Copy QR pixels
    for (let y = 0; y < qrDisplaySize; y++) {
      for (let x = 0; x < qrDisplaySize; x++) {
        const srcX = Math.floor(x * qrImg.width / qrDisplaySize);
        const srcY = Math.floor(y * qrImg.height / qrDisplaySize);
        const srcIdx = (qrImg.width * srcY + srcX) << 2;
        const dstIdx = ((qrY + y) * width + (qrX + x)) << 2;

        card.data[dstIdx] = qrImg.data[srcIdx];
        card.data[dstIdx + 1] = qrImg.data[srcIdx + 1];
        card.data[dstIdx + 2] = qrImg.data[srcIdx + 2];
        card.data[dstIdx + 3] = 255;
      }
    }
  }

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const buf = PNG.sync.write(card);
  fs.writeFileSync(outPath, buf);
  return { outPath, width, height, bytes: buf.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const qrRes = generateQrWithCenterIcon();
  console.log(`Generated official QR code: ${qrRes.outPath} (${qrRes.size}x${qrRes.size}px, ${qrRes.bytes} bytes)`);
  const cardRes = generatePosterCard();
  console.log(`Generated poster card: ${cardRes.outPath} (${cardRes.width}x${cardRes.height}px, ${cardRes.bytes} bytes)`);
}
