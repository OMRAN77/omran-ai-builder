'use strict';
/* api/_lib/_swallow.js — v-server-swallow (فحص Desloppify ٨ نوفمبر ٢٠٢٦: «Empty catch — swallows errors silently»، ٢٨٨ موضعًا في الخادم).
   نظير __swallow في الواجهة (js/app-00-swallow.js): الخطأ يبقى مبتلعًا كما كان — لا رمي ولا تغيير في مسار التنفيذ — لكنّه يُرى في
   سجلّ Vercel. ثلاث مرّات لكلّ موضع في عمر النسخة على الأكثر (موضع في حلقة لا يُغرق السجلّ)، وسقف للمواضع المتذكَّرة.
   لا أسرار ولا شبكة ولا KV: يُحمَّل في بيئة عارية (نقاط api/*.js). */
const MAX_PER_SITE = 3;
const MAX_SITES = 2000;
const seen = new Map();

/** يسجّل خطأً مبتلعًا مرّةً بعد مرّة حتّى السقف — ولا يرمي أبدًا. */
function swallow(err, ctx) {
  try {
    const k = String(ctx || 'unknown');
    if (!seen.has(k) && seen.size >= MAX_SITES) return;
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    if (n > MAX_PER_SITE) return;
    console.warn('[swallowed] ' + k + ': ' + String((err && err.message) || err).slice(0, 200));
  } catch (e) {
    /* guard-ok — المسجّل نفسه لا يرمي أبدًا: يُنادى من داخل catch */
  }
}

module.exports = { swallow, _seen: seen };
