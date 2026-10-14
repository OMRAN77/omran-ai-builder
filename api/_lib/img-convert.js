'use strict';
/* img-convert.js — v-agent-img (المالك ١٣ أكتوبر: «الوكيل يرسم صورة ويرفعها للمستودع مباشرة… وإذا المسار .webp والبايتات PNG أو JPEG
   تتحوّل لـWebP قبل الرفع»): امتداد الملفّ في المستودع يطابق محتواه دائمًا. الصيغة الفعليّة من أوّل البايتات لا من mime المخزّن؛
   PNG وJPEG بـpngjs وjpeg-js (قائمتان)، وWebP بـ@jsquash/webp (WASM بلا مكوّن أصليّ) يُحمَّل عند الحاجة وحدها. GIF لا يُحوَّل. */
const fs = require('fs');
const path = require('path');

const EXT_FMT = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', gif: 'gif' };
const NAME = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP', gif: 'GIF' };

/** الصيغة من أوّل البايتات: png | jpeg | webp | gif | '' */
function sniff(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (b.length >= 8 && b[0] === 0x89 && b.slice(1, 4).toString('latin1') === 'PNG') return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.slice(0, 6).toString('latin1'))) return 'gif';
  return '';
}
function extFormat(p) { const m = String(p || '').toLowerCase().match(/\.([a-z]+)$/); return m ? (EXT_FMT[m[1]] || '') : ''; }

let webpP = null;
function webpLib() {
  if (!webpP) {
    webpP = (async () => {
      const dir = path.dirname(require.resolve('@jsquash/webp/package.json'));
      const url = (f) => require('url').pathToFileURL(path.join(dir, f)).href; // ESM من CJS: رابط file:// لا مسار خام
      const enc = await import(url('encode.js'));
      const dec = await import(url('decode.js'));
      await enc.init(await WebAssembly.compile(fs.readFileSync(path.join(dir, 'codec/enc/webp_enc.wasm'))));
      await dec.init(await WebAssembly.compile(fs.readFileSync(path.join(dir, 'codec/dec/webp_dec.wasm'))));
      return { encode: enc.default, decode: dec.default };
    })();
    webpP.catch(() => { webpP = null; }); // فشل التحميل لا يُحفظ — المحاولة التالية تعيده
  }
  return webpP;
}

async function decodeRGBA(buf, fmt) {
  if (fmt === 'png') { const p = require('pngjs').PNG.sync.read(buf); return { data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length), width: p.width, height: p.height }; }
  if (fmt === 'jpeg') { const j = require('jpeg-js').decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 }); return { data: j.data, width: j.width, height: j.height }; }
  if (fmt === 'webp') { const w = await (await webpLib()).decode(new Uint8Array(buf)); return { data: new Uint8Array(w.data.buffer, w.data.byteOffset, w.data.length), width: w.width, height: w.height }; }
  throw new Error('لا يُفكّ ' + (NAME[fmt] || 'هذا النوع'));
}
async function encodeRGBA(img, fmt) {
  if (fmt === 'png') { const { PNG } = require('pngjs'); const p = new PNG({ width: img.width, height: img.height }); Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length).copy(p.data); return PNG.sync.write(p); }
  if (fmt === 'jpeg') return require('jpeg-js').encode({ data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height }, 88).data;
  if (fmt === 'webp') return Buffer.from(await (await webpLib()).encode({ data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height, colorSpace: 'srgb' }, { quality: 85 }));
  throw new Error('لا يُكتب ' + (NAME[fmt] || 'هذا النوع'));
}

/** بايتات base64 بصيغة امتداد المسار: { b64, from, to, converted } أو { error } واضح. */
async function toPathFormat(b64, filePath) {
  const target = extFormat(filePath);
  if (!target) return { error: filePath + ': امتداد ليس صورة (png أو jpg أو jpeg أو webp أو gif).' };
  const buf = Buffer.from(String(b64 || ''), 'base64');
  const from = sniff(buf);
  if (!from) return { error: 'بايتات الصورة لـ' + filePath + ' ليست PNG ولا JPEG ولا WebP ولا GIF — لم تُرفع.' };
  if (from === target) return { b64: String(b64), from, to: target, converted: false };
  if (from === 'gif' || target === 'gif') return { error: filePath + ': الصورة ' + NAME[from] + ' والمسار ' + NAME[target] + ' — GIF لا يُحوَّل؛ غيّر امتداد المسار إلى .' + (from === 'jpeg' ? 'jpg' : from) + '.' };
  try {
    const out = await encodeRGBA(await decodeRGBA(buf, from), target);
    return { b64: Buffer.from(out).toString('base64'), from, to: target, converted: true };
  } catch (e) {
    return { error: 'تعذّر تحويل الصورة من ' + NAME[from] + ' إلى ' + NAME[target] + ' لـ' + filePath + ': ' + String((e && e.message) || e).slice(0, 120) + ' — غيّر امتداد المسار إلى .' + (from === 'jpeg' ? 'jpg' : from) + ' أو أعد المحاولة.' };
  }
}

module.exports = { sniff, extFormat, toPathFormat, __webpLib: webpLib };
