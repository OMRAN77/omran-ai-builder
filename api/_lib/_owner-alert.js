// api/_lib/_owner-alert.js — v-credit-alert: إشعار فوريّ للمالك عند نفاد رصيد المحرّك الاحترافيّ.
//
// المشكلة (١٨ سبتمبر): لا شيء يراقب الرصيد؛ أوّل من يعرف هو المستخدم حين يهبط الردّ بصمت
// إلى الاحتياط. الحلّ: أوّل 402 (أو نصّ «credit balance / too low / insufficient») يدفع
// إشعار Web Push إلى كلّ مالك له اشتراك دفع محفوظ (db/push-subs/{owner}.json)، مرّة واحدة
// كلّ ٦ ساعات (مفتاح KV بمهلة). كلّ الاعتماديّات قابلة للحقن كي يُختبر بلا شبكة.
'use strict';

const CREDIT_RE = /credit balance|too low|insufficient|billing|purchase credits/i;
const ALERT_KEY = 'db/alerts/credit-402';
const ALERT_TTL_S = 6 * 3600;

function isCreditFailure(status, text) {
  if (Number(status) === 402) return true;
  return CREDIT_RE.test(String(text || ''));
}

async function alertOwnerCredit(opts) {
  const o = opts || {};
  if (!isCreditFailure(o.status, o.text)) return { sent: 0, reason: 'not-credit' };
  const env = o.env || process.env;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0, reason: 'no-vapid' };
  const kv = o.kv || require('./kv.js');
  // مرّة كلّ ٦ ساعات: SET NX مع مهلة؛ إن كان المفتاح موجودًا فالإشعار أُرسل قريبًا.
  const fresh = await kv.kvSetIfAbsent(ALERT_KEY, String(o.now || Date.now()), ALERT_TTL_S);
  if (!fresh) return { sent: 0, reason: 'recent' };
  const owners = o.owners || require('./_owner.js').ownerList();
  const webpush = o.webpush || require('web-push');
  webpush.setVapidDetails('mailto:ommntr77@gmail.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  // مسار اشتراك الدفع كما في push-subscribe.js (لا يُستورد: ذلك الملفّ يقرأ AUTH_SECRET عند التحميل).
  const subPath = (u) => 'db/push-subs/' + encodeURIComponent(u) + '.json';
  let sent = 0;
  for (const u of owners) {
    let sub = null;
    try { sub = await kv.kvGetJSON(subPath(u)); } catch (e) { sub = null; }
    if (!sub || !sub.endpoint) continue;
    try {
      await webpush.sendNotification(sub, JSON.stringify({
        title: '⚠️ رصيد المحرّك الاحترافيّ نفد',
        body: 'الردود تهبط الآن إلى المحرّك الاحتياطيّ (بلا أدوات). اشحن الرصيد.',
        url: '/',
      }));
      sent++;
    } catch (e) { /* اشتراك منتهٍ — نتابع للمالك التالي */ }
  }
  return { sent, reason: sent ? 'ok' : 'no-subscription' };
}

module.exports = { alertOwnerCredit, isCreditFailure, ALERT_KEY, ALERT_TTL_S };
