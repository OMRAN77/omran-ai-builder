// api/_lib/_owner-alert.js — v-credit-alert + v-error-push: إشعار Web Push فوريّ للمالك
// عند نفاد رصيد المحرّك الاحترافيّ، وعند أيّ خطأ خادم جديد لا يتكرّر خلال ٦ ساعات.
//
// المشكلة (١٨ سبتمبر): لا شيء يراقب الرصيد؛ أوّل من يعرف هو المستخدم حين يهبط الردّ بصمت
// إلى الاحتياط. الحلّ: أوّل 402 (أو نصّ «credit balance / too low / insufficient») يدفع
// إشعار Web Push إلى كلّ مالك له اشتراك دفع محفوظ (db/push-subs/{owner}.json)، مرّة واحدة
// كلّ ٦ ساعات (مفتاح KV بمهلة).
//
// طلب المالك (٢١ سبتمبر «أي خطأ يبلغني على طول»): عُمِّم نفس مسار الإرسال (`pushToOwners`)
// ليغطّي كلّ خطأ خادم جديد يمرّ بـ`_errors.js#reportError` — لا كلّ تكرار لخطأ معروف، حتى لا
// يتحوّل عطل متكرّر إلى وابل إشعارات. `isCreditFailure` يستثني رسائل الرصيد من هذا المسار
// العامّ فلا يصل المالك إشعاران مختلفان لنفس السبب.
//
// كلّ الاعتماديّات قابلة للحقن كي يُختبر بلا شبكة.
'use strict';

const CREDIT_RE = /credit balance|too low|insufficient|billing|purchase credits/i;
const ALERT_KEY = 'db/alerts/credit-402';
const ALERT_TTL_S = 6 * 3600;

function isCreditFailure(status, text) {
  if (Number(status) === 402) return true;
  return CREDIT_RE.test(String(text || ''));
}

// إرسال إشعار Web Push فعليّ لكلّ مالك له اشتراك محفوظ. لا throttle هنا —
// throttle مسؤوليّة المستدعي (كلّ حالة استخدام لها إيقاعها الخاصّ).
async function pushToOwners(payload, opts) {
  const o = opts || {};
  const env = o.env || process.env;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0, reason: 'no-vapid' };
  const kv = o.kv || require('./kv.js');
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
    try { await webpush.sendNotification(sub, JSON.stringify(payload)); sent++; }
    catch (e) { /* اشتراك منتهٍ — نتابع للمالك التالي */ }
  }
  return { sent, reason: sent ? 'ok' : 'no-subscription' };
}

async function alertOwnerCredit(opts) {
  const o = opts || {};
  if (!isCreditFailure(o.status, o.text)) return { sent: 0, reason: 'not-credit' };
  const kv = o.kv || require('./kv.js');
  // مرّة كلّ ٦ ساعات: SET NX مع مهلة؛ إن كان المفتاح موجودًا فالإشعار أُرسل قريبًا.
  const fresh = await kv.kvSetIfAbsent(ALERT_KEY, String(o.now || Date.now()), ALERT_TTL_S);
  if (!fresh) return { sent: 0, reason: 'recent' };
  return pushToOwners({
    title: '⚠️ رصيد المحرّك الاحترافيّ نفد',
    body: 'الردود تهبط الآن إلى المحرّك الاحتياطيّ (بلا أدوات). اشحن الرصيد.',
    url: '/',
  }, o);
}

// v-error-push: يُنادى من `_errors.js#reportError` لكلّ خطأ خادم جديد (لا تكرار). entry
// كما يبنيه reportError: { route, action, method, message, name }.
async function alertOwnerError(entry, opts) {
  const e = entry || {};
  if (isCreditFailure(null, e.message)) return { sent: 0, reason: 'not-credit' }; // v-credit-alert يغطّيها بمسارها الخاصّ
  const where = e.route + (e.action ? '?' + e.action : '');
  return pushToOwners({
    title: '🛑 خطأ جديد في الخادم',
    body: where + ': ' + String(e.message || 'unknown').slice(0, 150),
    url: '/',
  }, opts);
}

module.exports = { alertOwnerCredit, alertOwnerError, pushToOwners, isCreditFailure, ALERT_KEY, ALERT_TTL_S };
