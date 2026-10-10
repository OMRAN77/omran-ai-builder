#!/usr/bin/env node
// scripts/samples-ingest.mjs — يحوّل ما يرفعه المالك في media/samples/raw/ إلى نماذج جاهزة للصانع:
//   <الوضع>-<١|٢>.(mp4|mov|webm) ← media/samples/<الاسم>.mp4 بجودة عالية (عرض حتّى ١٩٢٠، H.264 crf 20، صوت AAC إن وُجد، faststart)
//   + غلاف .jpg + تسجيل في index.json (والعنوان من <الاسم>.txt إن وُجد) ثمّ يحذف الخام.
// الاستعمال: node scripts/samples-ingest.mjs [--dir media/samples]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--dir');
const DIR = path.resolve(ROOT, i > 0 ? process.argv[i + 1] : 'media/samples');
const RAW = path.join(DIR, 'raw');
const MODES = ['canvas', 'runway', 'minimax', 'omni', 'hybrid', 'veo', 'actor'];
const NAME = new RegExp('^(' + MODES.join('|') + ')-([12])\\.(mp4|mov|webm|m4v)$', 'i');

const indexFile = path.join(DIR, 'index.json');
const index = (() => { try { return JSON.parse(fs.readFileSync(indexFile, 'utf8')) || {}; } catch (e) { return {}; } })();
const files = fs.existsSync(RAW) ? fs.readdirSync(RAW) : [];
let done = 0; const skipped = [];
for (const f of files) {
  const m = f.match(NAME);
  if (!m) { if (!/\.(md|txt)$/i.test(f) && f !== '.gitkeep') skipped.push(f); continue; }
  const key = m[1].toLowerCase() + '-' + m[2];
  const src = path.join(RAW, f), out = path.join(DIR, key + '.mp4');
  const audio = /audio/.test(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', src], { encoding: 'utf8' }));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', "scale='min(1920,iw)':-2", '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
    .concat(audio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an'], [out]));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1', '-i', out, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '3', path.join(DIR, key + '.jpg')]);
  const txt = path.join(RAW, key + '.txt');
  const title = fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  index[key] = title ? { title } : true;
  fs.rmSync(src); if (fs.existsSync(txt)) fs.rmSync(txt);
  console.log('✓', key, (fs.statSync(out).size / 1048576).toFixed(1) + 'MB', audio ? 'مع صوت' : 'بلا صوت', title ? '— ' + title : '');
  done++;
}
fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');
if (skipped.length) console.log('⚠ أسماء غير معروفة (تُركت):', skipped.join('، '));
console.log('جاهز:', done);
