'use strict';
/* v-email-safe: نصّ الرسائل لمساعد البريد — مشترك بين email-list.js وemail-calendar.js.
   (١) رسالة HTML وحدها كانت تمرّ بـ«احذف الوسوم» فيبقى نصّ <style> و<script> داخل الجسم (CSS يصل الموديل
       على أنّه كلام المرسل)، والرسالة النصّيّة كانت تمرّ بالمنظّف نفسه فيضيع منها كلّ ما بين < و> (عناوين البريد).
   (٢) مقتطف Gmail يصل بكيانات HTML (&#39; &amp;) — يُفكّ هنا فتعرضه الواجهة نصًّا (textContent) لا HTML.
   (٣) المنطقة الزمنيّة كانت دبي ثابتة في البرومبت والتقويم — الآن منطقة جهاز المستخدم إن كانت اسمًا صالحًا. */

const TZ_DEFAULT = 'Asia/Dubai';

function safeTz(tz) {
  const s = String(tz || '').trim();
  if (!s || s.length > 64 || !/^[A-Za-z]+(?:[\/_+-][A-Za-z0-9]+)*$/.test(s)) return TZ_DEFAULT;
  try { new Intl.DateTimeFormat('en-US', { timeZone: s }); return s; } catch (e) { return TZ_DEFAULT; } // اسم لا يعرفه Intl = الافتراضيّ
}

const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', zwnj: '‌', zwj: '‍', rlm: '‏', lrm: '‎' };

function decodeEntities(s) {
  return String(s == null ? '' : s).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : m;
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function stripHtml(s) {
  const noTags = String(s == null ? '' : s)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(style|script|head|title|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return tidy(decodeEntities(noTags));
}

function tidy(s) {
  return String(s).replace(/\r/g, '').replace(/[ \t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function b64urlDecode(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function findPart(payload, mime) {
  if (!payload) return null;
  if (payload.mimeType === mime && payload.body && payload.body.data) return payload;
  for (const p of payload.parts || []) {
    const f = findPart(p, mime);
    if (f) return f;
  }
  return null;
}

// جسم الرسالة نصًّا: text/plain كما هو (بلا حذف ما بين < و>)، وإلّا text/html منظَّفًا، وإلّا الجسم الخام منظَّفًا.
function extractBodyText(payload) {
  if (!payload) return '';
  const plain = findPart(payload, 'text/plain');
  if (plain) return tidy(b64urlDecode(plain.body.data));
  const html = findPart(payload, 'text/html');
  if (html) return stripHtml(b64urlDecode(html.body.data));
  if (payload.body && payload.body.data) return stripHtml(b64urlDecode(payload.body.data));
  return '';
}

module.exports = { TZ_DEFAULT, safeTz, decodeEntities, stripHtml, extractBodyText, b64urlDecode };
