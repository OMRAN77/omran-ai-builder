// v-special-tokens (لقطة المالك ٤ أكتوبر ٩:٤٣: ردّ Cohere يبدأ بـ«<EOS_TOKEN>» حرفيًّا): رموز النموذج الخاصّة (نهاية/بداية التسلسل، رموز الأدوار
// <|…|>) تتسرّب أحيانًا نصًّا من الوسيط، ولا مكان لها في ردّ يقرؤه مستخدم. تُحذف أثناء البثّ بمُرشِّح بحالة: رمز انقسم بين دلتا
// («<EOS_» ثمّ «TOKEN>») لا يفلت ولا يُعرض نصفه. المحصور حرفيًّا: <EOS_TOKEN> وأخواته، و<|اسم|> بحروف لاتينيّة — لا وسوم HTML ولا <s>.
'use strict';
const FIXED = ['<EOS_TOKEN>', '<BOS_TOKEN>', '<PAD_TOKEN>', '<UNK_TOKEN>', '<CLS_TOKEN>', '<SEP_TOKEN>', '<MASK_TOKEN>'];
const TOKEN_RE = /<(?:EOS|BOS|PAD|UNK|CLS|SEP|MASK)_TOKEN>|<\|[A-Za-z0-9_]{3,40}\|>/g;
// ذيل قد يكتمل رمزًا في الدلتا التالية: «<» وحدها، أو بداية <|…، أو بداية أحد الثابتة
function couldBeToken(tail) {
  if (tail === '<') return true;
  if (tail.length > 44 || tail.indexOf('>') >= 0) return false;
  if (tail.startsWith('<|')) return /^<\|[A-Za-z0-9_]*\|?$/.test(tail);
  return FIXED.some((t) => t.startsWith(tail));
}
function stripSpecialTokens(text) { return String(text == null ? '' : text).replace(TOKEN_RE, ''); }
function makeTokenStripper() {
  let held = '';
  return {
    push(chunk) {
      const s = stripSpecialTokens(held + String(chunk == null ? '' : chunk));
      held = '';
      const i = s.lastIndexOf('<');
      if (i >= 0 && couldBeToken(s.slice(i))) { held = s.slice(i); return s.slice(0, i); }
      return s;
    },
    flush() { const r = stripSpecialTokens(held); held = ''; return r; }, // ما بقي محجوزًا ولم يكتمل رمزًا يُعرض كما هو
  };
}
module.exports = { stripSpecialTokens, makeTokenStripper };
