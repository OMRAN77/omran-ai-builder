#!/usr/bin/env node
// scripts/extension-zip.mjs — يحزم إضافة المتصفّح (store/browser-extension) في ملفّ zip واحد يُرفع كما هو
// إلى Chrome Web Store وEdge Add-ons وFirefox Add-ons. الناتج: store/browser-extension/dist/om-ai-<الإصدار>.zip
// (*.zip في .gitignore — لا يدخل المستودع). بلا تبعيّات: zlib المدمج في Node.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'store/browser-extension');
const SKIP = new Set(['dist', 'README.md', 'LISTING.md', '.DS_Store']);

function walk(dir, rel = '') {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (SKIP.has(name)) continue;
    const abs = path.join(dir, name);
    const r = rel ? rel + '/' + name : name;
    if (fs.statSync(abs).isDirectory()) out.push(...walk(abs, r));
    else out.push({ name: r, data: fs.readFileSync(abs) });
  }
  return out;
}

export function buildZip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  // تاريخ ثابت (١ يناير ٢٠٢٦) كي يكون الناتج نفسه بايتًا بايتًا لكلّ بناء.
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const deflated = zlib.deflateRawSync(f.data, { level: 9 });
    const crc = zlib.crc32(f.data) >>> 0;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(deflated.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, nameBuf, deflated);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(deflated.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += h.length + nameBuf.length + deflated.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
  const files = walk(SRC);
  const outDir = path.join(SRC, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'om-ai-' + manifest.version + '.zip');
  fs.writeFileSync(out, buildZip(files));
  console.log('✓ ' + path.relative(ROOT, out) + ' · ' + files.length + ' ملفًّا · ' + fs.statSync(out).size + ' بايت');
}
