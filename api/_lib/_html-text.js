'use strict';
/* api/_lib/_html-text.js — v-sec-fetchpage: قراءة صفحة ويب خارجيّة بأمان.
 *
 * الجذر: fetchPage في live-deps/chat/agent كان (١) يوقف مؤقّت القطع فور وصول الترويسة، فـr.text()
 * بلا مهلة ولا سقف حجم — خادمٌ يبثّ بلا نهاية يعلّق الدالّة ويملأ الذاكرة؛ (٢) ينظّف الوسوم بتعابير
 * تربيعيّة (/<[^>]+>/ و<script[\s\S]*?>) فمدخلٌ فيه كثير من «<» يأخذ دقائق. هنا:
 *   readCappedText — يقرأ الجسم من التدفّق حتّى سقف بايت ثمّ يقطع (مع إشارة القطع سارية طوال القراءة).
 *   htmlToText     — تجريد خطّيّ: إزالة script/style بالبحث لا بالتعبير، ووسم واحد بـ/<[^<>]*>/.
 */

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // ٢ م.ب تكفي لنصّ صفحة، وتمنع البثّ اللانهائيّ.

// يقرأ جسم استجابة fetch حتّى maxBytes ثمّ يتوقّف (يقطع الباقي). لا يرمي إلّا ما يرميه التدفّق.
async function readCappedText(r, maxBytes) {
  const cap = Math.max(1, Number(maxBytes) || DEFAULT_MAX_BYTES);
  // بلا جسم قابل للتدفّق (polyfill): نقرأ النصّ كاملًا ثمّ نقصّه — أضعف لكنّه نادر.
  if (!r || !r.body || typeof r.body.getReader !== 'function') {
    const s = await r.text();
    return s.length > cap ? s.slice(0, cap) : s;
  }
  const reader = r.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        chunks.push(value);
        total += value.length;
        if (total >= cap) { try { await reader.cancel(); } catch (e) { /* أفضل جهد */ } break; }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (e) { /* أفضل جهد */ }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).slice(0, cap).toString('utf8');
}

// إزالة كتلة بين وسمَي فتح/إغلاق بالبحث الخطّيّ (بدل تعبير تربيعيّ).
function stripBlock(html, openTag, closeTag) {
  let out = '';
  let i = 0;
  const lower = html.toLowerCase();
  for (;;) {
    const start = lower.indexOf(openTag, i);
    if (start === -1) { out += html.slice(i); break; }
    out += html.slice(i, start) + ' '; // مسافة مكان الكتلة المحذوفة كي لا تلتصق الكلمات
    const end = lower.indexOf(closeTag, start + openTag.length);
    if (end === -1) { break; } // وسم غير مغلق: نُسقِط الباقي
    i = end + closeTag.length;
  }
  return out;
}

// تحويل HTML إلى نصّ بتعابير خطّيّة فقط.
function htmlToText(html) {
  let s = String(html || '');
  s = stripBlock(s, '<script', '</script>');
  s = stripBlock(s, '<style', '</style>');
  s = s.replace(/<[^<>]*>/g, ' ')      // وسم واحد — خطّيّ (لا /<[^>]+>/ التربيعيّ)
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
  return s;
}

module.exports = { readCappedText, htmlToText, DEFAULT_MAX_BYTES };
