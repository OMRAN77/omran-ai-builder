'use strict';
/* api/_lib/our-media.js — v-dl-ours (المراجعة المعاكسة على v-video-open-lock): نواتج سلّمها خادمنا بعد نجاح الاستطلاع
   (فيديو Runway — ومعه ترقية الجودة لأنّها تُستطلع بـvideo-status — والفيديو الاقتصاديّ والممثّل). بروكسي التنزيل يمرّرها بلا عدّ
   على سقف الوسائط الخارجيّة (٢٠ يوميًّا): المستخدم دفع ثمنها، وكانت تُعدّ معها فتردّ 429 ويختفي الفيديو المدفوع.
   مفتاح منفصل عن runway:out (ترقية الجودة تقبل مخرجات Runway وحدها). أفضل جهد ولا يرمي. */
const crypto = require('crypto');

const TTL_SEC = 2 * 86400; // روابط المزوّدين الموقّعة تنتهي خلال يوم أو يومين
const keyOf = (url) => 'dl:ours:' + crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 40);

/** يسجّل روابط نواتج مهمّة نجحت — أفضل جهد، لا يرمي. */
async function rememberOurMedia(urls) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter((u) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4);
  if (!list.length) return;
  try {
    const { kvSetRaw } = require('./kv.js');
    for (const u of list) await kvSetRaw(keyOf(u), '1', TTL_SEC);
  } catch (e) { console.warn('[our-media] outputs not remembered:', e && e.message); }
}

/** هل سلّم خادمنا هذا الرابط ناتجًا؟ تعذّر التحقّق = لا (يُعدّ كأيّ وسيط). */
async function isOurMedia(url) {
  try { return !!(await require('./kv.js').kvGetRaw(keyOf(url))); } catch (e) { return false; } // تعذّر القراءة — يُعامل كوسيط خارجيّ
}

module.exports = { rememberOurMedia, isOurMedia };
