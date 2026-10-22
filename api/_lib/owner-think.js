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

/* v-owner-light (المالك ١٣ أكتوبر: «اريد سرعة التفكير في الردود العاديه» — والبحث يبقى في كلّ سؤال باختياره): ثلاث درجات لدور المالك.
   quick: المجاملة القصيرة فوريّة (v-owner-auto). deep: الشغل الثقيل بتفكير الموديل الكامل — صورة، كود وبناء ورياضيّات ونصّ طويل
   (isStrongTurn)، تحليل ومقارنة، متابعة محادثة كود، وطلب شغل على التطبيق (صلّح، عدّل، ارفع، ادمج، كمّل…). light: الباقي — الردّ
   العاديّ يفكّر ويظهر تفكيره كما أراد في v-owner-think-all، لكن بالجهد الأدنى (low) فيبدأ الردّ في ثوانٍ. كروك/`x-ai/` high لا low
   (v-grok-high-feed: أمر المالك أن يطابق وكيل كروك هنا — low كان يتجاهل المنهج ويجيب كطفل بلا معلومات). جهد المنتقي يغلب الكلّ. */
const WORK_RE = /(?:^|[\s،,.:؛()"'«»-])(?:و|ف)?(?:صلّ?ح|صلّ?حه|صلّ?حها|صلّ?حهم|عدّ?ل|عدّ?له|عدّ?لها|غيّ?ر|غيّ?ره|غيّ?رها|بدّ?ل|أضف|اضف|ضيف|احذف|شيل|امسح|ارفع|ادمج|أدمج|انشر|نفّ?ذ|كمّ?ل|اكمل|أكمل|تابع|واصل|المستودع|مستودع|الجيت|جيت\s*هب|github|commit|التطبيق|الكود|الملفّ?|ملفّ?ات|الواجهة|الزرّ?|الصفحة|البطاقة|البطاقات)(?=$|[\s،,.:؛()"'«»?؟!-])/i;
/** درجة تفكير دور المالك: 'quick' | 'light' | 'deep'. opts كما في ownerThinks. */
function ownerThinkLevel(text, opts) {
  const o = opts || {};
  if (!ownerThinks(text, o)) return 'quick';
  const s = String(text || '');
  if (o.image || isStrongTurn(s) || ANALYSIS_RE.test(s) || s.split('\n').length >= 8) return 'deep';
  if (lastReplyHasCode(o.history) || WORK_RE.test(s)) return 'deep';
  return 'light';
}
/* حقول الجهد الأدنى لدور light: GPT وكلود بدوالّهما (المساران)، وبقيّة الوسيط (Gemini، DeepSeek، Qwen…) output_config.effort
   يترجمه الوسيط لتفكير المزوّد. كروك/`x-ai/` high لا low (v-grok-high-feed). موديل رفضه (400 ← forgetEffort في chat.js) لا يُرسل
   له ثانيةً. Cohere خارجها (v-cohere-reasoning)، والمسار المباشر لغير GPT (Groq/Kimi) كما كان. null = لا حقول (يبقى الافتراضيّ). */
function lightEffortFields(prov, model, viaOR, direct, noCap) {
  const raw = String(model || '');
  if (!raw || deadEffort.has(raw)) return null;
  if (prov === 'openai') return gptEffortFields(raw, 'low', noCap);
  if (prov === 'claude') return claudeEffortFields(raw, 'low', noCap);
  if (direct || !viaOR || prov === 'cohere' || /^(?:anthropic\/|claude-|openai\/)/.test(raw)) return null;
  if (/grok|^x-ai\//i.test(raw)) return { output_config: { effort: 'high' } }; // v-grok-high-feed: جهد وكيل كروك هنا؛ Qwen على الصفّ نفسه يبقى low
  return { output_config: { effort: 'low' } };
}

/* كلود المباشر: Sonnet 5 وOpus 5.x وFable يفكّرون تكيّفيًّا بلا حقل thinking، وOpus 5.5 وFable 5.1 يرفضان
   {type:'disabled'} (400) — فالتحكّم الوحيد الصالح للكلّ هو الجهد. Haiku 4.5 لا يفكّر أصلًا ويرفض effort. */
const EFFORT_MODEL_RE = /^claude-(?:sonnet-5|opus-5|opus-4-[678]|sonnet-4-6|fable|haiku-5-5)/; // v-owner-claude-all: Haiku 5.5 يقبل الجهد (low→max)
const deadEffort = new Set(); /* موديل رفض الجهد في هذه الدالّة الدافئة لا يُرسَل له ثانيةً */
function claudeQuickFields(model) {
  const m = String(model || '');
  return (EFFORT_MODEL_RE.test(m) && !deadEffort.has(m)) ? { output_config: { effort: 'low' } } : {};
}
function forgetEffort(model) { if (model) deadEffort.add(String(model)); }

/* v-owner-claude-all (أمر عمران ١٠ أكتوبر، لقطة «Effort» في تطبيق Claude: Low · Medium · High · Extra · Max): جهد يختاره المالك من
   المنتقي فيغلب التلقائيّ (claudeQuickFields) في كلّ دور. القيم كما في الواجهة الرسميّة (مهارة claude-api): Extra = xhigh.
   Haiku 4.5 بلا جهد ولا تفكير تكيّفيّ (400) → null فيبقى السلوك القائم. Opus 4.6 وSonnet 4.6 بلا xhigh → high.
   عند xhigh/max يوصي التوثيق بـmax_tokens ≥ 64000 كي لا ينقطع الردّ وسط التفكير (سقف لا إنفاق — يُفوتَر المولَّد فقط).
   Opus 4.8/4.7/4.6 وSonnet 4.6 لا يفكّرون بلا thinking:{type:'adaptive'} فيُرسل معه كي يحكم الجهد التفكير؛ والجيل ٥ يفكّر تكيّفيًّا
   بلا الحقل (ولا يُرسل له disabled أبدًا — Opus 5.5/Sonnet 5.5 يرفضانه). المعرّف يُطبَّع من صيغة الوسيط (anthropic/claude-opus-4.8). */
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const NO_XHIGH_RE = /^claude-(?:opus-4-6|sonnet-4-6)$/;
const ADAPTIVE_REQ_RE = /^claude-(?:opus-4-[678]|sonnet-4-6)$/;
// noCap: لا رفع للسقف — يمرّره chat.js بعد أن رفض الوسيط حجز رصيد السقف الكبير (402 «fewer max_tokens / can only afford»). السقف الكبير
// على المسارين: بدونه عند xhigh/max قد يستهلك التفكير السقف كلّه فلا يصل حرف، والإكمال على الوسيط يعيد التفكير من الصفر (لا تُعاد كتله).
function claudeEffortFields(model, effort, noCap) {
  const raw = String(model || '');
  const id = raw.replace(/^anthropic\//, '').replace(/\./g, '-');
  let lvl = String(effort == null ? '' : effort).trim().toLowerCase();
  if (EFFORT_LEVELS.indexOf(lvl) === -1 || !EFFORT_MODEL_RE.test(id) || deadEffort.has(raw)) return null;
  if (lvl === 'xhigh' && NO_XHIGH_RE.test(id)) lvl = 'high';
  const out = { output_config: { effort: lvl } };
  if ((lvl === 'xhigh' || lvl === 'max') && !noCap) out.max_tokens = 64000;
  if (ADAPTIVE_REQ_RE.test(id)) out.thinking = { type: 'adaptive' };
  return out;
}

/* v-owner-gpt-all (أمر عمران ١٠ أكتوبر «بعد ما تخلص الانثروبك ابدأ في GPT — كلهم نفس الموضوع»): مستويات reasoning.effort لكلّ
   موديل GPT في منتقي المالك، من صفحات موديلات OpenAI الرسميّة (developers.openai.com/api/docs/models/<id>، فُحصت ١١ أكتوبر):
   Astra و6.1 Sol بلا none (none = 400)، وGPT-5.5/5.4/5.2 بلا max. المفتاح المعرّف المباشر (بلا openai/). */
const GPT_EFFORTS = {
  'gpt-6-astra': ['low', 'medium', 'high', 'xhigh', 'max'], 'gpt-6.1-sol': ['low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-6-luna': ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'gpt-6-sol': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.6-sol': ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'gpt-5.6-terra': ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'gpt-5.6-luna': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.5': ['none', 'low', 'medium', 'high', 'xhigh'], 'gpt-5.4': ['none', 'low', 'medium', 'high', 'xhigh'], 'gpt-5.4-mini': ['none', 'low', 'medium', 'high', 'xhigh'], 'gpt-5.2': ['none', 'low', 'medium', 'high', 'xhigh'],
};
function gptId(model) { return String(model || '').trim().toLowerCase().replace(/^openai\//, ''); }
function gptEfforts(model) { return Object.prototype.hasOwnProperty.call(GPT_EFFORTS, gptId(model)) ? GPT_EFFORTS[gptId(model)] : null; }
/* جهد المالك المختار لـGPT ← output_config.effort (oa-direct يترجمه reasoning.effort، والوسيط يترجمه بنفسه). مستوى لا يدعمه
   الموديل ينزل لأقرب أدنى (max → xhigh على 5.5/5.4/5.2). سقف الخرج على المسار المباشر وحده (يشمل التفكير عند OpenAI، وتوصيتها
   ٢٥ ألفًا على الأقلّ للتفكير والردّ): high ‏٣٢٠٠٠، وxhigh/max ‏٦٤٠٠٠ على المسارين؛ noCap كما في claudeEffortFields. */
function gptEffortFields(model, effort, noCap) {
  const raw = String(model || '');
  const allowed = gptEfforts(raw);
  let lvl = String(effort == null ? '' : effort).trim().toLowerCase();
  if (!allowed || EFFORT_LEVELS.indexOf(lvl) === -1 || deadEffort.has(raw)) return null;
  while (allowed.indexOf(lvl) === -1 && EFFORT_LEVELS.indexOf(lvl) > 0) lvl = EFFORT_LEVELS[EFFORT_LEVELS.indexOf(lvl) - 1];
  if (allowed.indexOf(lvl) === -1) return null;
  const out = { output_config: { effort: lvl } };
  if (!noCap && lvl === 'high') out.max_tokens = 32000;
  if (!noCap && (lvl === 'xhigh' || lvl === 'max')) out.max_tokens = 64000;
  return out;
}

module.exports = { ownerThinks, ownerThinkLevel, lightEffortFields, WORK_RE, lastReplyHasCode, claudeQuickFields, claudeEffortFields, gptEffortFields, gptEfforts, forgetEffort, ANALYSIS_RE, EFFORT_LEVELS, GPT_EFFORTS, __deadEffort: deadEffort };
