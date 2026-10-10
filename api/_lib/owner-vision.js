'use strict';
/* v-owner-vision (المالك ٦ أكتوبر: «كلّ واحد يحلّل ويفحص ويشوف كلّ شي… مش عند المشتركين… أنا المالك عند اختيار أيّ
   مزوّد»): صورة المالك كانت تُحوَّل إلى كلود متى اختار مزوّدًا غير كلود/GPT/Gemini (chat.js)، والواجهة لا تمرّرها لمسار
   الأدوات أصلًا — فيصفها Gemini وحده للباقين أو تُسقط. الآن المزوّد المختار نفسه يرى البكسلات على مساره (الوسيط أو مفتاحه
   المباشر): موديله الحاليّ إن كان يرى، وإلّا موديل الرؤية عند الشركة نفسها. للمالك وحده؛ المشتركون على PLAN_ROUTING كما هم. */

// المسار ← موديل دور الصورة. '' = الموديل الحاليّ يرى أصلًا (اختيار المالك يبقى، ورفضه = الافتراضيّ بآليّة v-claude-models).
const VISION = {
  openai: { direct: '', or: '' },
  gemini: { direct: '', or: '' },
  mistral: { or: '' }, // Mistral Medium 3.5: نصّ + صورة
  openrouter: { or: '' }, // اختيار المالك نفسه؛ الافتراضيّ Sonnet 5 يرى
  kimi: { direct: '', or: 'moonshotai/kimi-k3' }, // K3 وK2.6 يريان عند Moonshot؛ K2 عند الوسيط نصّيّ
  groq: { direct: 'qwen/qwen3.6-27b', or: '' }, // gpt-oss نصّيّ؛ Qwen3.6 27B رؤية + أدوات على Groq، وLlama 4 Maverick يرى عند الوسيط
  deepseek: { or: 'deepseek/deepseek-v4-flash-vision-exp' }, // V4 Pro نصّيّ؛ V4 Flash Vision أوّل موديل رؤية في V4، بأدوات
  cohere: { or: 'cohere/command-a-plus' }, // Command A نصّيّ؛ Command A+ نصّ + صورة + أدوات
};

// خطّة دور الصورة على المسار الحاليّ ('direct' | 'or'): { model, def, forced } — forced = موديل الرؤية حلّ محلّ الاختيار.
// null = لا رؤية معروفة لهذا المزوّد على هذا المسار (chat.js يرجع لكلود كما كان).
function visionPlan(prov, route, cur, def) {
  const v = VISION[String(prov || '').toLowerCase()];
  if (!v || !route || !Object.prototype.hasOwnProperty.call(v, route)) return null;
  const m = v[route];
  if (String(prov).toLowerCase() === 'kimi' && route === 'or' && /^moonshotai\/kimi-k(?:3|2\.6)\b/.test(String(cur || ''))) return { model: cur, def, forced: false }; // v-owner-solo: K3 وK2.6 يريان — الاختيار يبقى
  return m ? { model: m, def: m, forced: true } : { model: cur, def, forced: false };
}

module.exports = { VISION, visionPlan };
