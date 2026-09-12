// api/_lib/_msgs.js — v-static-leak: تعقيم رسائل المحادثة قبل تمريرها لأيّ مزوّد.
//
// لقطة المالك ١٢ سبتمبر: Groq ردّ 400 «'messages.0' : for 'role:system' … property
// '__static' is unsupported». العميل يضع على رسالة النظام الثابتة علامة داخليّة
// (__static) ليرشّحها عن مسار الأدوات، والمسار الاحتياطيّ القديم كان يمرّرها كما هي إلى
// المزوّدات ذات المخطّط الصارم فترفض الطلب كلّه. العميل أُصلح أيضًا، لكنّ الحزم
// القديمة المخزّنة (APK/WebView) تبقى ترسلها — فالخادم يحذف كلّ مفتاح يبدأ بـ__ من
// كلّ رسالة ولا يمسّ الباقي (role وcontent وأيّ حقل شرعيّ).
'use strict';

function stripPrivateKeys(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((m) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
    let dirty = false;
    for (const k in m) if (k.indexOf('__') === 0) { dirty = true; break; }
    if (!dirty) return m;
    const out = {};
    for (const k in m) if (k.indexOf('__') !== 0) out[k] = m[k];
    return out;
  });
}

module.exports = { stripPrivateKeys };
