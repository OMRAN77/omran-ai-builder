'use strict';
/* v-owner-auto (المالك ٢٨ سبتمبر: «في المواقع الرسميّة الردّ في لمح البصر، وعندي السلام ياخذ ٣ إلى ٧ ثواني» —
   واختار «تلقائي مثل الرسمي»): منذ v-owner-reason (٢٢ سبتمبر) كلّ مزوّد يفكّر قبل أيّ ردّ للمالك، حتّى التحية.
   التطبيقات الرسميّة في وضعها التلقائيّ تردّ على الكلام العاديّ فورًا ولا تفكّر إلّا للصعب. هنا الحكم نفسه:
   الدور الصعب (كود/بناء/رياضيّات/نصّ طويل — isStrongTurn من tier.js — وتحليل، وصورة، ومتابعة محادثة كود)
   يفكّر كما كان؛ غيره بلا تفكير. غير المالك لا يمرّ هنا (v-chat-fast كما هو). */
const { isStrongTurn } = require('./tier.js');

const ANALYSIS_RE = /(?:^|[\s،,.:؛()"'«»-])(?:و|ف)?(?:ال|بال)?(?:حلّ?ل|حلّ?لي|تحليل|قارن|قارني|مقارنة|خطّ?ة|خطط|استراتيجيّ?ة|دراسة|بالتفصيل|تفصيليّ?ة?|مفصّ?لة?|خطوة\s+بخطوة|راجع|مراجعة|تقرير|جدوى|ميزانيّ?ة|إيجابيات|ايجابيات|سلبيات|analy[sz]e|analysis|compare|comparison|strategy|plan|step\s+by\s+step|in\s+detail|evaluate|review|report|pros\s+and\s+cons|feasibility)(?=$|[\s،,.:؛()"'«»?؟!-])/i;
const CODE_REPLY_RE = /```|<!DOCTYPE|<html[\s>]/i;
// Diagnose requests in ordinary Arabic too, not only formal "حلّل/قارن".
const CHECK_RE = /(?:^|[\s،,.:؛()"'«»-])(?:و|ف)?(?:افحص|إفحص|دقّ?ق|تأكّ?د|تاكّ?د|تحقّ?ق|شخّ?ص|تتبّ?ع|استنتج|استخرج|اختبر|فحص|تدقيق|تشخيص|verify|inspect|investigate|diagnose|audit|validate|trace)(?=$|[\s،,.:؛()"'«»?؟!-])/i;
const FOLLOW_RE = /^(?:طيب\s+)?(?:كمّ?ل|تابع|ليش|لماذا|كيف عرفت|وش السبب|ما السبب|متأكد|متاكّد|متاكد|وبعدين|continue|why|are you sure)[؟?!. ]*$/i;
const PROBLEM_RE = /(?:ما\s*(?:يشتغل|يفتح|يحفظ|يرد)|لا\s*(?:يعمل|يستجيب)|يفشل|تعطّل|عطل|خطأ|خلل|crash|not working|fails?|broken)/i;
function substantive(text) {
  return isStrongTurn(text) || ANALYSIS_RE.test(text) || CHECK_RE.test(text) || PROBLEM_RE.test(text);
}
function followsAnalysis(text, history) {
  if (!FOLLOW_RE.test(text)) return false;
  const users = (Array.isArray(history) ? history : []).filter((m) => m && m.role === 'user');
  if (users.length && textOf(users[users.length - 1].content).trim() === text.trim()) users.pop();
  const previous = users[users.length - 1];
  return !!previous && substantive(textOf(previous.content).slice(-6000));
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text').map((b) => String(b.text || '')).join('\n');
}
// آخر ردّ للمساعد فيه كود (أو كود المشروع الذي يرسله العميل رسالةَ مساعد) = المالك في شغل برمجيّ.
function lastReplyHasCode(history) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m && m.role === 'assistant') return CODE_REPLY_RE.test(textOf(m.content));
  }
  return false;
}

/** هل يفكّر الموديل في دور المالك هذا؟ opts: { image, greeting, history } */
function ownerThinks(text, opts) {
  const o = opts || {};
  if (o.image) return true;
  const s = String(text || '');
  if (substantive(s) || s.split('\n').length >= 8) return true;
  if (o.greeting) return false; /* «السلام» وسط شغل كود تبقى تحيّة */
  if (followsAnalysis(s.trim(), o.history)) return true;
  return lastReplyHasCode(o.history);
}

/* كلود المباشر: Sonnet 5 وOpus 5.x وFable يفكّرون تكيّفيًّا بلا حقل thinking، وOpus 5.5 وFable 5.1 يرفضان
   {type:'disabled'} (400) — فالتحكّم الوحيد الصالح للكلّ هو الجهد. Haiku 4.5 لا يفكّر أصلًا ويرفض effort. */
const EFFORT_MODEL_RE = /^claude-(?:sonnet-5|opus-5|opus-4-[678]|sonnet-4-6|fable)/;
const deadEffort = new Set(); /* موديل رفض الجهد في هذه الدالّة الدافئة لا يُرسَل له ثانيةً */
function claudeQuickFields(model) {
  const m = String(model || '');
  return (EFFORT_MODEL_RE.test(m) && !deadEffort.has(m)) ? { output_config: { effort: 'low' } } : {};
}
function forgetEffort(model) { if (model) deadEffort.add(String(model)); }

module.exports = { ownerThinks, lastReplyHasCode, claudeQuickFields, forgetEffort, ANALYSIS_RE, __deadEffort: deadEffort };
