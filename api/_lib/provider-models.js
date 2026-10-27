'use strict';
/* v-provider-models (أمر المالك ٢٢ سبتمبر «كلّ واحد وموديله بالضبط — هذي الخاصيّة أنا الي أريدها»):
   موديلات المزوّدين غير كلود في شريط السهم كانت أسماء عرض لا تصل الخادم (chat.js يستعمل OR_MODELS
   ثابتة). الآن: (١) قائمة حيّة من OpenRouter لكلّ مزوّد — الأحدث ثمانية — تُخزَّن ستّ ساعات في
   الذاكرة وKV؛ (٢) الاختيار يصل chat.js في body.model ويُقبل للمالك إن كان معرّف OpenRouter
   بالبادئة الصحيحة لذلك المزوّد؛ رفضه الوسيط = رجوع للافتراضيّ مع سطر حالة (آليّة v-claude-models
   نفسها). كلود يبقى على قائمته الثابتة (المسار المباشر). للمالك وحده كالمنتقي نفسه. */
const { isOwnerSession: isOwner } = require('./_owner.js'); // v-audit-agent (srv-agent-3): جلسة المالك وحدها — لا MONITOR_KEY

// مفتاح المزوّد في التطبيق ← بادئة الشركة عند OpenRouter.
const OR_VENDOR = { openai: 'openai', gemini: 'google', deepseek: 'deepseek', mistral: 'mistralai', cohere: 'cohere', groq: 'meta-llama', perplexity: 'perplexity', kimi: 'moonshotai' };
const OR_ID_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i;
const PER_PROVIDER = 8;
const TTL_MS = 6 * 60 * 60 * 1000;
const KV_KEY = 'provmodels:v5'; // v-model-card: v5 = مع بيانات الموديل الوصفيّة (meta) // v-owner-direct: v2 = قائمة Groq من Groq نفسه؛ v-oa-models: v3 = قائمة GPT من OpenAI نفسه (يُسقط المخزَّن وفيه gpt-6-luna-pro)؛ v-prov-tools-filter: v4 = فلترة الأدوات (يُسقط المخزَّن غير المفلتر)
const OR_MODELS_URL = 'https://openrouter.ai/api/v1/models';

function pickProviderModel(prov, requested, fallback) {
  const id = String(requested || '').trim();
  const key = String(prov || '').toLowerCase();
  const slash = id.indexOf('/');
  /* v-openrouter-tools: المزوّد العامّ ليس شركةً واحدة — أيّ معرّف صالح عند الوسيط يُقبل (كلود،
     GPT، Llama…) خلافًا لبقيّة المزوّدين المحصورين ببادئة شركتهم. البوّابة نفسها (المالك) في chat.js. */
  if (key === 'openrouter') {
    if (!OR_ID_RE.test(id)) return { model: fallback, picked: false, id: '', label: '' };
    return { model: id, picked: true, id, label: id.slice(slash + 1) };
  }
  const vendor = OR_VENDOR[key];
  if (!vendor || !OR_ID_RE.test(id) || id.slice(0, slash).toLowerCase() !== vendor) return { model: fallback, picked: false, id: '', label: '' };
  return { model: id, picked: true, id, label: id.slice(slash + 1) };
}

// قائمة OpenRouter الخام → { prov: [[id, name], …] }: بالبادئة، نصّ الخرج فقط، بلا متغيّرات (:free/:thinking…)،
// الأحدث أوّلًا، ثمانية كحدّ، والاسم بلا «الشركة: ».
function parseModels(payload) {
  const rows = (payload && Array.isArray(payload.data)) ? payload.data : [];
  const out = {};
  for (const prov of Object.keys(OR_VENDOR)) {
    const v = OR_VENDOR[prov] + '/';
    const list = rows
      .filter((m) => m && typeof m.id === 'string' && m.id.indexOf(v) === 0 && m.id.indexOf(':') === -1 && OR_ID_RE.test(m.id))
      .filter((m) => { const om = m.architecture && m.architecture.output_modalities; return !Array.isArray(om) || om.indexOf('text') !== -1; })
      /* v-prov-tools-filter (لقطة المالك ٦ أكتوبر — 404 على موديل مختار من القائمة الحيّة): مسار
         المحادثة يرسل tools لكلّ مزوّد على TOOL_PROVIDERS، والوسيط قد يردّ 404 «No endpoints»
         لموديل بلا endpoint يدعمها — فلا نعرض إلّا ما يعلن tools في supported_parameters.
         الفلترة بالقدرة لا بقائمة «متقاعدة» ثابتة، فلا تُخفى موديلات شغّالة ولا يتكرّر الخلل
         مع موديل جديد بلا أدوات. Perplexity مستثنى: مساره بلا أدوات أصلًا (بحث Sonar مدمج)
         والفلترة تفرّغ قائمته. */
      .filter((m) => prov === 'perplexity' || (Array.isArray(m.supported_parameters) && m.supported_parameters.indexOf('tools') !== -1))
      .sort((a, b) => (Number(b.created) || 0) - (Number(a.created) || 0))
      .slice(0, PER_PROVIDER)
      .map((m) => [m.id, String(m.name || m.id).replace(/^[^:]{1,40}:\s*/, '').trim() || m.id]);
    if (list.length) out[prov] = list;
  }
  return out;
}

/* v-model-card (المالك ١٥ أكتوبر «أوصلهم بمعلوماتهم»): البيانات الوصفيّة التي كان parseModels يُسقطها — نافذة السياق وأقصى خرج
   والرؤية والأدوات — تُحفظ لكلّ موديل (شركات التطبيق وكلود وxAI وQwen) بمفتاح مطبَّع يطابق المعرّف المباشر والوسيط معًا
   (بلا بادئة الشركة، والنقطة شرطة)، وتُقرأ متزامنةً من الذاكرة الدافئة (metaOf) لبطاقة الموديل في provider-level. */
const META_VENDOR_RE = /^(?:anthropic|openai|google|deepseek|mistralai|cohere|meta-llama|perplexity|moonshotai|x-ai|qwen)\//;
function metaKey(id) { return String(id || '').trim().toLowerCase().replace(/^[a-z0-9._-]+\//, '').replace(/\./g, '-'); }
function parseMeta(payload) {
  const rows = (payload && Array.isArray(payload.data)) ? payload.data : [];
  const out = {};
  for (const m of rows) {
    if (!m || typeof m.id !== 'string' || !META_VENDOR_RE.test(m.id) || m.id.indexOf(':') !== -1) continue;
    const a = m.architecture || {}, tp = m.top_provider || {};
    const e = {};
    if (Number(m.context_length) > 0) e.ctx = Number(m.context_length);
    if (Number(tp.max_completion_tokens) > 0) e.out = Number(tp.max_completion_tokens);
    if (Array.isArray(a.input_modalities)) e.vision = a.input_modalities.indexOf('image') !== -1;
    if (Array.isArray(m.supported_parameters)) e.tools = m.supported_parameters.indexOf('tools') !== -1;
    const k = metaKey(m.id);
    if (!out[k]) out[k] = e; // الأوّل يفوز (الوسيط يرتّب الأساسيّ قبل المتغيّرات)
  }
  return out;
}
function metaOf(id) { return (__mem.meta && __mem.meta[metaKey(id)]) || null; }

// قائمة Groq: موديلات المحادثة النشطة (بلا صوت/تفريغ/حرّاس/أنظمة مركّبة)، الأحدث أوّلًا، ثمانية كحدّ، والاسم هو المعرّف.
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
function parseGroqModels(payload) {
  const rows = (payload && Array.isArray(payload.data)) ? payload.data : [];
  return rows
    .filter((m) => m && typeof m.id === 'string' && m.active !== false && /^[a-z0-9][a-z0-9._\/-]{0,99}$/i.test(m.id) && !/whisper|tts|playai|orpheus|guard|compound|distil/i.test(m.id))
    .sort((a, b) => (Number(b.created) || 0) - (Number(a.created) || 0))
    .slice(0, PER_PROVIDER)
    .map((m) => [m.id, m.id]);
}

/* v-oa-models (لقطة «فحص النظام» ٢٣ سبتمبر: «The model `gpt-6-luna-pro` does not exist or you do not have access to it» ×4):
   قائمة GPT في السهم كانت من كتالوج الوسيط، والمحادثة ترسل الاختيار إلى OpenAI مباشرةً بمفتاح المالك — فيظهر في القائمة
   موديل لا يملكه المفتاح، وكلّ رسالة عليه = 404 ثمّ الافتراضيّ بسطر «غير متاح». بمفتاح OpenAI تأتي القائمة من OpenAI نفسه
   (/v1/models لا يعرض إلّا ما يملكه المفتاح): موديلات المحادثة فقط (بلا صوت/صورة/تضمين/بحث/فوري/نسخ مؤرَّخة)،
   الموصى بها أولًا ثمّ الأحدث، ثمانية، والمعرّف ببادئة الوسيط كما يتوقّعه العميل وpickProviderModel (directModel يقصّها). */
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const OPENAI_PREFERRED = ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'];
function parseOpenAIModels(payload) {
  const rows = (payload && Array.isArray(payload.data)) ? payload.data : [];
  return rows
    .filter((m) => m && typeof m.id === 'string' && /^(?:gpt-|o\d|chatgpt-)/i.test(m.id) && /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(m.id))
    .filter((m) => !/audio|realtime|tts|transcribe|image|dall-e|whisper|embedding|moderation|search|instruct|codex|computer-use|deep-research/i.test(m.id))
    .filter((m) => !/-\d{4}-\d{2}-\d{2}$|-\d{4}$/.test(m.id))
    // v-openai-pick: «الأحدث» زمنيًّا قد يكون موديلًا تخصّصيًّا؛ أبقِ الثلاثة
    // العامّة الموصى بها في رأس قائمة المالك إن كان مفتاحه يملكها، ثمّ الأحدث.
    .sort((a, b) => {
      const ai = OPENAI_PREFERRED.indexOf(a.id), bi = OPENAI_PREFERRED.indexOf(b.id);
      if (ai !== -1 || bi !== -1) return ai === -1 ? 1 : (bi === -1 ? -1 : ai - bi);
      return (Number(b.created) || 0) - (Number(a.created) || 0);
    })
    .slice(0, PER_PROVIDER)
    .map((m) => ['openai/' + m.id, m.id]);
}

let __mem = { at: 0, models: null };
async function loadModels(opts) {
  const o = opts || {};
  const now = Date.now();
  if (__mem.models && now - __mem.at < TTL_MS) return { models: __mem.models, source: 'memory', at: __mem.at };
  let kv = null;
  if (!o.noKv) { try { kv = require('./kv.js'); } catch (e) { kv = null; } }
  if (kv) {
    try {
      const c = await kv.kvGetJSON(KV_KEY);
      if (c && c.models && now - (Number(c.at) || 0) < TTL_MS) { __mem = { at: c.at, models: c.models, meta: c.meta || null }; return { models: c.models, source: 'kv', at: c.at }; }
    } catch (e) { /* KV غائب أو متعثّر — نكمل من الشبكة */ }
  }
  const f = o.fetch || fetch;
  const headers = {};
  if (process.env.OPENROUTER_API_KEY) headers.Authorization = 'Bearer ' + process.env.OPENROUTER_API_KEY;
  const r = await f(OR_MODELS_URL, { headers });
  if (!r.ok) throw new Error('openrouter models ' + r.status);
  const __raw = await r.json();
  const models = parseModels(__raw);
  const meta = parseMeta(__raw); // v-model-card
  if (!Object.keys(models).length) throw new Error('openrouter models: empty');
  /* v-owner-direct: بمفتاح Groq تتّصل المحادثة بـGroq مباشرةً (oa-direct.js)، فقائمة السهم لـGroq تأتي من Groq
     نفسه لا من موديلات Meta عند الوسيط. تعثّرها يبقي قائمة الوسيط. */
  const gk = String(process.env.GROQ_API_KEY || '').trim();
  if (gk) {
    try {
      const g = await f(GROQ_MODELS_URL, { headers: { Authorization: 'Bearer ' + gk } });
      const gl = g && g.ok ? parseGroqModels(await g.json()) : [];
      if (gl.length) models.groq = gl;
    } catch (e) { /* قائمة الوسيط تبقى */ }
  }
  // v-oa-models: بمفتاح OpenAI قائمة GPT من OpenAI نفسه (ما يملكه المفتاح فقط)؛ تعثّرها يبقي قائمة الوسيط.
  const ok = String(process.env.OPENAI_API_KEY || '').trim();
  if (ok) {
    try {
      const g = await f(OPENAI_MODELS_URL, { headers: { Authorization: 'Bearer ' + ok } });
      const ol = g && g.ok ? parseOpenAIModels(await g.json()) : [];
      if (ol.length) models.openai = ol;
    } catch (e) { /* قائمة الوسيط تبقى */ }
  }
  __mem = { at: now, models, meta };
  if (kv) { try { await kv.kvPutJSON(KV_KEY, { at: now, models, meta }); } catch (e) { /* التخزين تحسينيّ */ } }
  return { models, source: 'network', at: now };
}

/* v-live-default (لقطة المالك ١٥ أكتوبر: Cohere «خطأ 404» — cohere/command-a لم يعد عند الوسيط): الافتراضيّ الثابت في OR_MODELS يموت
   مع الزمن (v-models-latest رفعه مرّات بيد). رفض الوسيط له = أحدث موديل بأدوات لشركته من القائمة الحيّة نفسها التي يعرضها المنتقي
   (الأحدث أوّلًا، بفلترة الأدوات)، ويُحفظ في الذاكرة الدافئة فتبدأ به الرسائل التالية بلا جولة 404. */
const __live = {};
async function liveDefault(prov, dead, opts) {
  const key = String(prov || '').toLowerCase();
  if (!OR_VENDOR[key]) return '';
  let list = [];
  try { list = ((await loadModels(opts)).models || {})[key] || []; } catch (e) { list = []; } // guard-ok — بلا قائمة = بلا بديل، والفشل الأصليّ يصل المالك
  const alt = list.map((x) => x && x[0]).find((id) => id && id !== dead) || '';
  if (alt) __live[key] = alt;
  return alt;
}
function liveDefaultOf(prov) { return __live[String(prov || '').toLowerCase()] || ''; }

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  if (!isOwner({ query: req.query, body })) { res.status(403).json({ error: 'owner_only' }); return; }
  try {
    const r = await loadModels();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, at: r.at, source: r.source, models: r.models });
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) });
  }
};
module.exports.pickProviderModel = pickProviderModel;
module.exports.parseModels = parseModels;
module.exports.parseGroqModels = parseGroqModels;
module.exports.parseOpenAIModels = parseOpenAIModels;
module.exports.loadModels = loadModels;
module.exports.OR_VENDOR = OR_VENDOR;
module.exports.liveDefault = liveDefault; // v-live-default
module.exports.liveDefaultOf = liveDefaultOf;
module.exports.__live = __live; // للاختبار
module.exports.__resetCache = () => { __mem = { at: 0, models: null, meta: null }; }; // للاختبار
module.exports.parseMeta = parseMeta; // v-model-card
module.exports.metaOf = metaOf;
module.exports.metaKey = metaKey;
