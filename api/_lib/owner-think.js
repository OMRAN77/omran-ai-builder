'use strict';
/* v-owner-auto (المالك ٢٨ سبتمبر: «في المواقع الرسميّة الردّ في لمح البصر، وعندي السلام ياخذ ٣ إلى ٧ ثواني» —
   واختار «تلقائي مثل الرسمي»): منذ v-owner-reason (٢٢ سبتمبر) كلّ مزوّد يفكّر قبل أيّ ردّ للمالك، حتّى التحية.
   التطبيقات الرسميّة في وضعها التلقائيّ تردّ على الكلام العاديّ فورًا ولا تفكّر إلّا للصعب. هنا الحكم نفسه:
   الدور الصعب (كود/بناء/رياضيّات/نصّ طويل — isStrongTurn من tier.js — وتحليل، وصورة، ومتابعة محادثة كود)
   يفكّر كما كان؛ غيره بلا تفكير. غير المالك لا يمرّ هنا (v-chat-fast كما هو). */
const { isStrongTurn } = require('./tier.js');

const ANALYSIS_RE = /(?:^|[\s،,.:؛()"'«»-])(?:و|ف)?(?:ال|بال)?(?:حلّ?ل|حلّ?لي|تحليل|قارن|قارني|مقارنة|خطّ?ة|خطط|استراتيجيّ?ة|دراسة|بالتفصيل|تفصيليّ?ة?|مفصّ?لة?|خطوة\s+بخطوة|راجع|مراجعة|تقرير|جدوى|ميزانيّ?ة|إيجابيات|ايجابيات|سلبيات|analy[sz]e|analysis|compare|comparison|strategy|plan|step\s+by\s+step|in\s+detail|evaluate|review|report|pros\s+and\s+cons|feasibility)(?=$|[\s،,.:؛()"'«»?؟!-])/i;
const CODE_REPLY_RE = /```|<!DOCTYPE|<html[\s>]/i;

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

/* v-owner-think-all (أمر المالك ٩ أكتوبر: «شغّل التفكير… وتكون الأفكار في المزوّدين نفسهم»): فلتر الكلمات كان يرسل أغلب
   أسئلته («ليش…»، «وش رأيك…»، «اشرح…») بأمر «لا تفكّر» فيردّ المزوّد تحت مستواه في تطبيقه الأصليّ. الآن كلّ سؤال يفكّر
   فيه المزوّد بتفكيره هو؛ وحدها المجاملة القصيرة (تحيّة، سؤال حال، شكر، «تمام») فوريّة كما اختار في v-owner-auto. */
const SOCIAL_RE = /^(?:[\s،,.!~\-]*(?:شكرًا|شكرا|مشكور|يعطيك العافية|الله يعطيك العافية|تسلم|تسلم يدك|تمام|طيب|اوكي|أوكي|ok|okay|thanks|thank you|thx|👍|❤️|🌹|يا هلا|هلا|هلا والله|مرحبا|السلام|السلام عليكم|سلام|كيف حالك|كيف الحال|كيفك|شلونك|شحالك|شخبارك|وش أخبارك|وش اخبارك|شو أخبارك|حيّاك|حياك|الله يحييك|مساء النور|صباح النور|وعليكم السلام|ما قصّرت|ما قصرت|جزاك الله خير|بارك الله فيك))+[\s،,.!؟?~\-]*$/i;
function isSocial(s) { const t = String(s || '').trim(); return !!t && t.length <= 40 && SOCIAL_RE.test(t); }

/** هل يفكّر الموديل في دور المالك هذا؟ opts: { image, greeting, history } */
function ownerThinks(text, opts) {
  const o = opts || {};
  if (o.image) return true;
  const s = String(text || '');
  if (isStrongTurn(s) || ANALYSIS_RE.test(s) || s.split('\n').length >= 8) return true;
  if (o.greeting || isSocial(s) || !s.trim()) return false; /* «السلام» وسط شغل كود تبقى تحيّة */
  return true;
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
