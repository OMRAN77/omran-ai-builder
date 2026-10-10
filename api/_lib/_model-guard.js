'use strict';
/* v-model-lock (فحص الاشتراكات ٥ أكتوبر): روابط المزوّدين المباشرة (/api/openrouter · gemini · groq · mistral ·
   perplexity · cohere · openai · claude) كانت تمرّر اسم النموذج الذي يرسله العميل كما هو — حساب مجّانيّ يقدر يشغّل
   أغلى نموذج في OpenRouter على مفتاح المالك بحدّ ٣٠ ألف توكن، ومشترك يطلب الاحترافيّ بلا خصم نقاط.
   لغير المالك وVIP: نموذج من قائمة رخيصة مسموحة وإلّا الافتراضيّ (الفارغ = افتراضيّ المعالج). المالك وVIP كما كانوا. */
const { FREE_PROVIDER_SPECS } = require('./tier.js');

// فلاش وحده (بلا نماذج الصور ولا Pro): gemini-flash-latest · gemini-3-flash · gemini-2.5-flash-lite · …-preview
const GEMINI_FLASH_RE = /^(?:models\/)?gemini-(?:[\d.]+-)?flash(?:-lite)?(?:-latest|-preview(?:-[\w.]+)?)?$/i;

function inSpec(spec, m) {
  if (!spec || !m) return false;
  return spec.models.includes(m) || (spec.visionModels || []).includes(m) || (spec.pick ? spec.pick.test(m) : false);
}

function isPrivileged(usage) {
  return !!usage && (usage.tier === 'owner' || usage.tier === 'vip');
}

function guardModel(provider, requested, privileged) {
  const m = typeof requested === 'string' ? requested.trim() : '';
  if (privileged) return m;
  switch (provider) {
    case 'gemini': return GEMINI_FLASH_RE.test(m) ? m : 'gemini-flash-latest';
    case 'groq': return inSpec(FREE_PROVIDER_SPECS.groq, m) ? m : '';
    case 'mistral': return inSpec(FREE_PROVIDER_SPECS.mistral, m) ? m : 'mistral-small-latest';
    case 'openrouter': return (/:free$/i.test(m) && inSpec(FREE_PROVIDER_SPECS.openrouter, m)) ? m : FREE_PROVIDER_SPECS.openrouter.models[0];
    case 'perplexity': return 'sonar';
    default: return ''; // cohere · openai: الافتراضيّ في المعالج
  }
}

module.exports = { guardModel, isPrivileged, GEMINI_FLASH_RE };
