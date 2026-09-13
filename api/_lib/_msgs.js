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

/* v-secret-vault: سرّ ملصوق في رسالة (توكن GitHub، مفتاح Anthropic/OpenAI/Google) لا يصل
   النموذج ولا سجلّ التشغيل — يُستبدل بعلامة قبل أيّ استعمال. الأنماط نفسها في العميل
   (app-09) الذي يعترض اللصق ويعرض على المالك حفظه في الخزنة. */
const SECRET_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-ant-[A-Za-z0-9_\-]{20,}|sk-[A-Za-z0-9_\-]{32,}|AIza[0-9A-Za-z_\-]{30,})\b/g;
const SECRET_MARK = '[سرّ محذوف — يُحفظ في خزنة الأسرار من الإعدادات لا في المحادثة]';
function redactSecrets(text) {
  if (typeof text !== 'string' || !text) return text;
  SECRET_RE.lastIndex = 0;
  return SECRET_RE.test(text) ? text.replace(SECRET_RE, SECRET_MARK) : text;
}
function redactMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((m) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
    if (typeof m.content === 'string') {
      const c = redactSecrets(m.content);
      return c === m.content ? m : Object.assign({}, m, { content: c });
    }
    if (Array.isArray(m.content)) {
      let changed = false;
      const content = m.content.map((b) => {
        if (b && typeof b === 'object' && typeof b.text === 'string') {
          const t = redactSecrets(b.text);
          if (t !== b.text) { changed = true; return Object.assign({}, b, { text: t }); }
        }
        return b;
      });
      return changed ? Object.assign({}, m, { content }) : m;
    }
    return m;
  });
}

module.exports = { stripPrivateKeys, redactSecrets, redactMessages, SECRET_RE, SECRET_MARK };
