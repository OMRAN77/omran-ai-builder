// api/_lib/owner-draw.js — v-img-token-write: رسم المالك يُحفظ في img-share بعمر قصير
// كي يُرفع بـwrite_github من الرمز __IMG_N__ أو رابط /i/ دون انتظار «عمّم».
'use strict';

const DRAW_TTL = 24 * 3600; // Redis قريب من الامتلاء — ٢٤ ساعة لا سبعة أيّام
const MAX_B64 = 3 * 1024 * 1024;
const MAX_ATTACH = 4;

function extOf(mime) {
  return mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : (mime === 'image/gif' ? 'gif' : 'jpg'));
}

/* يضع على رسالة المالك سطر رابط /i/ لكلّ صورة مرفقة (ومنها المرفقات التلقائيّة من ذاكرة المحادثة)
   ويحفظ البايتات بعمر DRAW_TTL. يُرجع خريطة فارغة إن فشل المخزن — الصورة تبقى مرئيّة بلا رابط. */
async function stampAttach(msg) {
  const tokens = Object.create(null);
  if (!msg || !Array.isArray(msg.content)) return { tokens };
  const share = require('./img-share.js');
  const notes = [];
  let n = 0;
  for (const b of msg.content) {
    if (!b || b.type !== 'image') continue;
    const src = b.source || {};
    let data = String(src.type === 'base64' ? (src.data || '') : (typeof src.data === 'string' ? src.data : ''));
    if (data.slice(0, 5) === 'data:') data = data.slice(data.indexOf(',') + 1);
    data = data.replace(/\s+/g, '');
    if (!data || data.length > MAX_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) continue;
    n++;
    if (n > MAX_ATTACH) break;
    const mime = /^image\/(png|jpeg|webp|gif)$/.test(String(src.media_type || '')) ? String(src.media_type) : 'image/jpeg';
    const id = await share.putImage(data, mime, 0, 0, DRAW_TTL);
    if (!id) continue;
    const url = '/i/' + id + '.' + extOf(mime);
    notes.push('[صورة مرفقة — رابطها في التطبيق: ' + url + ']');
    tokens['__ATT_' + n + '__'] = id;
  }
  if (notes.length) {
    msg.content = [{ type: 'text', text: notes.join('\n') + ' — ارفعها بـwrite_github حقل image بهذا الرابط.' }].concat(msg.content);
  }
  return { tokens };
}

module.exports = { DRAW_TTL, stampAttach, extOf, MAX_ATTACH };
