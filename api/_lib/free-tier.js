'use strict';
/* api/_lib/free-tier.js — v-farm-gate (مزرعة الحسابات، موافقة المالك): ما يأخذه الحساب المجّانيّ بلا نقطة واحدة.
   حساب فوق سقف هديّة الترحيب (welcome-gift.js) رصيده 0 لكنّه كان يأخذ أدوات الصور اليوميّة (~٦٣ صورة ≈ ٧٫٨ دولار يوميًّا)
   وتجربة مها — والحسابات بلا حدّ، فالمزرعة تفتح منها ما تشاء.
   (١) giftCapped(user): الحساب سُجّل وسقف **شبكته** (IPv4، أو IPv6 بشبكته /64) رفض هديّته — giftCapped:true صريحًا في السجلّ،
       والمسارات الثلاثة تكتبه (كلمة المرور، رمز البريد، Google). لا السقف العامّ (استنزافه لا يحرم الأمين على شبكة أخرى)، ولا
       هديّة أطفأتها البيئة، ولا عطب KV. السجلّ القديم بلا الحقل حرّ كما كان. والدافع حرّ دائمًا (payingCustomer).
   (٢) takeDailySlot(name): سقف يوميّ كلّيّ ذرّيّ (يوم UTC) — 'media' = FREE_MEDIA_DAILY لطلبات أدوات الصور من المجّانيّ غير
       الدافع (مطفأ افتراضيًّا: فارغ = بلا سقف كلّيّ)، و'maha-trial' = MAHA_TRIAL_DAILY لتجارب مها (١٠٠ افتراضيًّا). عطب KV مع سقف
       مضبوط = لا مقعد (مال). البيئة تُقرأ داخل الدوالّ (قاعدة الإقلاع البارد). */
const DAY_TTL_SEC = 172800; // يومان: عدّاد اليوم مؤرَّخ فيسقط وحده
const SLOTS = { media: ['FREE_MEDIA_DAILY', null], 'maha-trial': ['MAHA_TRIAL_DAILY', 100] }; // null = مطفأ
// أثر دفعة على السجلّ (grantPlanToUser): من اشترى نقاطًا أو باقة مرّة لا يُعامَل مزرعة.
const PURCHASE_MARKERS = ['lastStripeSessionId', 'lastStripePaymentIntentId', 'lastPaypalOrderId', 'lastStripeInvoiceId'];

function envInt(name, def) {
  const raw = String(process.env[name] == null ? '' : process.env[name]).trim();
  const n = raw === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : def;
}

/** عميل يدفع: باقة محادثة سارية، أو أيّ باقة وسائط سارية، أو أثر شراء على السجلّ. */
function payingCustomer(user, now) {
  if (!user || user.deleted) return false;
  if (PURCHASE_MARKERS.some((f) => !!user[f])) return true;
  try {
    if (require('./tier.js').planActive(user, now)) return true;
    const media = require('./_mediaPlans.js');
    return media.MEDIA_KINDS.some((k) => media.mediaActive(user, k, now));
  } catch (e) {
    console.warn('[free-tier] plan read failed: ' + (e && e.message)); // قراءة الباقة فشلت: الحكم على ما سبق
    return false;
  }
}

/** حساب فوق سقف هديّة شبكته ولم يدفع: أدوات الصور المجّانيّة بحدّ 0 ولا تجربة مها. FREE_TOOLS_GIFT_GATE=off يعيد السابق. */
function giftCapped(user, now) {
  if (String(process.env.FREE_TOOLS_GIFT_GATE || '').trim().toLowerCase() === 'off') return false;
  if (!user || user.deleted || user.giftCapped !== true) return false;
  return !payingCustomer(user, now);
}

const slotCap = (name) => envInt(SLOTS[name][0], SLOTS[name][1]);
/** السقف الكلّيّ لأدوات الصور مضبوط؟ (FREE_MEDIA_DAILY عدد صحيح ≥ 0) */
function mediaBudgetOn() { return slotCap('media') !== null; }

/** يحجز مقعدًا من سقف اليوم الكلّيّ: { ok, key, kv } — سقف مطفأ = { ok:true, off:true } بلا عدّ؛ 0 أو ممتلئ أو عطب = { ok:false }. */
async function takeDailySlot(name, kvOpt) {
  const cap = slotCap(name);
  if (cap === null) return { ok: true, off: true };
  if (cap === 0) return { ok: false };
  const key = 'db/free-' + name + '/all/' + new Date().toISOString().slice(0, 10);
  try {
    const kv = kvOpt || require('./kv.js');
    await kv.kvSetIfAbsent(key, 0, DAY_TTL_SEC);
    const n = Number(await kv.kvIncrBy(key, 1));
    if (n >= 1 && n <= cap) return { ok: true, key, kv };
    if (n >= 1) await kv.kvDecrBy(key, 1);
    return { ok: false };
  } catch (e) {
    console.warn('[free-tier] ' + name + ' slot unavailable: ' + (e && e.message));
    return { ok: false };
  }
}

/** يردّ مقعدًا أخذه takeDailySlot (جلسة لم تُفتح). أفضل جهد ولا يرمي. */
async function giveDailySlot(slot) {
  if (!slot || !slot.ok || !slot.key) return;
  try { await slot.kv.kvDecrBy(slot.key, 1); } catch (e) { console.warn('[free-tier] give back failed: ' + (e && e.message)); }
}

module.exports = { giftCapped, payingCustomer, mediaBudgetOn, takeDailySlot, giveDailySlot, PURCHASE_MARKERS };
