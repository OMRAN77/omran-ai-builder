// api/_lib/tier.js — v-tiers: طبقات المحادثة الثلاث (قرار المالك ١٢ سبتمبر).
//
//   ضيف بلا حساب      → لا شيء، GUEST_DAILY (٠): التسجيل أوّلًا (v-free-first-day)
//   مسجَّل بلا اشتراك  → سلسلة مجانية، FREE_DAILY يوميًّا (٢٠، v-free-20)
//   مشترك             → المحرّك الاحترافي بكل الأدوات، سقف حماية بحسب الباقة
//                        (SUB_DAILY_BASIC ٥٠ · SUB_DAILY_PRO ١٠٠ · SUB_DAILY_MAX ٢٥٠) — سلّة واحدة للتطبيق كلّه
//   VIP / المالك       → بلا حدود
//
// من هو المشترك؟ عضو قائمة VIP، أو حساب عليه `plan` مدفوعة و`planUpdatedAt`
// خلال آخر ٣٥ يومًا: التجديد الشهري عبر Stripe (invoice.paid) يحدّث التاريخ،
// فمن توقف عن الدفع يسقط إلى الطبقة المجانية وحده. «نقاط أكبر من صفر» ليست
// معيارًا — كل مسجَّل يبدأ بهدية ٧٠ نقطة.
//
// السلسلة المجانية: مزوّدات لها طبقة مجانية على مفتاح المالك (Gemini Flash ثم
// Groq ثم Mistral ثم OpenRouter). الحصة المجانية عند كل شركة محسوبة على المفتاح
// لا على المستخدم، فامتلاء واحد (429) يمرّر الطلب للتالي بصمت. FREE_CHAIN يغيّر
// الترتيب بلا نشر، ومزوّد بلا مفتاح يُتخطّى.
//
// كل الأرقام هنا متغيّرات بيئة كي يضبطها المالك من Vercel بلا نشر.
'use strict';

const { isVip } = require('./_vip.js');
const OWNER_LIST = require('./_owner.js').ownerList();

const PLAN_KEYS = ['basic', 'pro', 'max'];
const SUB_WINDOW_DAYS = 35;
const SUB_WINDOW_MS = SUB_WINDOW_DAYS * 86400000;

// مزوّدات تكلّف المالك مالًا لكل رسالة — للمشتركين فقط. الباقي (السلسلة
// المجانية والأدوات الصغيرة) يبقى على سقف الطبقة اليومي.
const PAID_PROVIDERS = ['claude', 'openai', 'deepseek', 'cohere', 'perplexity', 'agent'];

/* v-plan-models (قرار المالك ١٦ أكتوبر بعد خريطة «من المجّانيّ إلى ٣٧٥»: «Groq gpt-oss-20b بالمجان، Luna وHaiku 5.5 لـ37»): كلّ رسالة مشترك تُصنَّف
   وظيفةً (turnJob) وتذهب لموديلات باقته — Plus: ‏GPT-6 Luna وHaiku 5.5 (~٠٫٠٠١$ للرسالة)؛ Pro: ‏Gemini 3.8 Flash بحدّ يوميّ ثمّ موديلات Plus، والكود والملفّ
   الطويل Mistral Large 3؛ Max: ‏GPT-6 Sol وSonnet 5.5 بحدّ يوميّ مشترك ثمّ Gemini Flash. الصور Gemini كما كانت. كان Groq بمفتاحه المجّانيّ يحمل دردشة Plus/Pro
   فيُرفض 413 في كلّ دور بأدواته ويفيض بصمت على Gemini. بعد موديلات الوظيفة: Groq (مجّانيّ) ثمّ Gemini، قبل أوّل حرف. كلّ الحدود متغيّرات بيئة.
   direct = مفتاح المزوّد نفسه (oa-direct.js)؛ model = معرّف المزوّد، أو من CLAUDE_MODELS، أو slug الوسيط (Mistral). */
const LANES = {
  groq: { prov: 'groq', direct: true }, gemini: { prov: 'gemini', direct: true }, deepseek: { prov: 'deepseek' },
  haiku: { prov: 'claude', model: 'claude-haiku-4-5', meter: 'haiku' }, sonnet: { prov: 'claude', model: 'claude-sonnet-5', meter: 'sonnet' },
  luna: { prov: 'openai', model: 'gpt-6-luna', direct: true }, haiku55: { prov: 'claude', model: 'claude-haiku-5-5' }, // Plus
  flash40: { prov: 'gemini', model: 'gemini-3.8-flash', direct: true, meter: 'gemini' }, flash: { prov: 'gemini', model: 'gemini-3.8-flash', direct: true }, large3: { prov: 'mistral', model: 'mistralai/mistral-large-2512' }, // Pro
  sol: { prov: 'openai', model: 'gpt-6-sol', direct: true, meter: 'premium' }, sonnet55: { prov: 'claude', model: 'claude-sonnet-5-5', meter: 'premium' }, // Max
};
const PLAN_FALLBACK = ['groq', 'gemini']; // v-plan-models: بعد موديلات الوظيفة — Groq المجّانيّ ثمّ Gemini
const PLAN_ROUTING = {
  basic: { chat: ['luna', 'haiku55'], code: ['haiku55', 'luna'], math: ['luna', 'haiku55'], image: ['gemini'], meters: {}, allowed: [] },
  pro: { chat: ['flash40', 'luna', 'haiku55'], code: ['large3', 'haiku55', 'luna'], math: ['large3', 'luna'], image: ['gemini'], meters: { gemini: ['SUB_GEMINI_PRO', 40] }, allowed: [] },
  max: { chat: ['sol', 'flash', 'luna'], code: ['sonnet55', 'flash', 'haiku55'], math: ['sol', 'flash'], image: ['gemini'], meters: { premium: ['SUB_PREMIUM_MAX', 100] }, allowed: [] /* v-providers-owner (أمر المالك ٤ أكتوبر): المنتقي للمالك وحده — Max يُوجَّه بجدوله، لا باختيار قديم محفوظ */ },
};
// الدور القويّ: نصّ طويل (وثيقة/ملفّ) أو كتلة كود أو كلمات برمجة/بناء/رياضيات.
const STRONG_TURN_RE = /```|(?:^|[\s،,.:؛()"'«»-])(?:ال|بال|وال|لل|فال|كال)?(?:كود|كودي|برمج|برمجة|سكربت|سكريبت|دالة|دوال|خوارزميّ?ة|bug|error|exception|debug|api|json|sql|regex|html|css|javascript|typescript|python|react|node|docker|ابنِ|ابني|اعمل(?:\s+لي)?\s+(?:موقع|تطبيق|صفحة|برنامج|بوت|لعبة)|صمّ?م(?:\s+لي)?\s+(?:موقع|تطبيق|صفحة)|احسب|معادلة|معادلات|مشتقّ?ة|تكامل|مصفوفة|احتمال|إحصاء|جبر|ضريبة|فائدة\s+مركّ?بة|نسبة\s+مئويّ?ة|calculate|solve|equation|integral|derivative|matrix|probability|statistics|function|class|compile)(?=$|[\s،,.:؛()"'«»?؟!-])/i;
const MATH_TURN_RE = /(?:^|[\s،,.:؛()"'«»-])(?:ال|بال|وال|لل|فال|كال)?(?:احسب|معادلة|معادلات|مشتقّ?ة|تكامل|مصفوفة|احتمال|إحصاء|جبر|ضريبة|فائدة\s+مركّ?بة|نسبة\s+مئويّ?ة|calculate|solve|equation|integral|derivative|matrix|probability|statistics)(?=$|[\s،,.:؛()"'«»?؟!-])/i;
function isStrongTurn(text) {
  const s = String(text || '');
  if (s.length >= 600) return true;
  return STRONG_TURN_RE.test(s);
}
// وظيفة الرسالة: image (صورة مرفقة) · code (كود/بناء) · math (حساب، أو نصّ طويل بلا كود = ملفّ) · chat.
function turnJob(text, hasImage) {
  if (hasImage) return 'image';
  const s = String(text || '');
  if (!isStrongTurn(s)) return 'chat';
  if (s.indexOf('```') !== -1) return 'code';
  if (MATH_TURN_RE.test(s)) return 'math';
  const codeOnly = STRONG_TURN_RE.test(s);
  return (s.length >= 600 && !codeOnly) ? 'math' : 'code';
}
/* قرار التوجيه لطلب مشترك: أوّل مزوّد في قائمة الوظيفة لم يبلغ حدّه اليوميّ (used = { haiku, sonnet })؛ ومنتقي
   Max يُقبل للدردشة إن كان مسموحًا (كلود = Haiku بحدّه). الالتقاط بلا المختار. غير المشترك → null. */
function planRoute(tier, requestedProv, lastUserText, used, env, hasImage) {
  const plan = (tier && tier.tier === 'sub') ? String(tier.plan || '').toLowerCase() : '';
  const r = PLAN_ROUTING[plan];
  if (!r) return null;
  const e = env || process.env;
  const u = used || {};
  const open = (name) => { const m = LANES[name].meter; if (!m) return true; const lim = r.meters[m]; return !!lim && (Number(u[m]) || 0) < envInt(e, lim[0], lim[1]); };
  const job = turnJob(lastUserText, hasImage);
  const req = String(requestedProv || '').toLowerCase();
  let names = r[job].filter(open);
  if (job === 'chat' && req && r.allowed.includes(req)) {
    const reqName = req === 'claude' ? 'haiku' : req;
    if (LANES[reqName] ? open(reqName) : true) names = [reqName];
  }
  if (!names.length) names = ['groq'];
  const lane = LANES[names[0]] || { prov: names[0] };
  const lk = (l) => l.prov + '|' + (l.model || ''), seen = new Set([lk(lane)]); /* v-plan-models: باقي موديلات الوظيفة (بلا مقياس — لا حجز لها) ثمّ Groq ثمّ Gemini */ const fallback = names.slice(1).concat(PLAN_FALLBACK).map((n) => LANES[n]).filter((l) => l && !l.meter && !seen.has(lk(l)) && !!seen.add(lk(l))).map((l) => Object.assign({}, l));
  return { plan, job, strong: job === 'code' || job === 'math', prov: lane.prov, model: lane.model || '', direct: !!lane.direct, meter: lane.meter || '', meterCap: lane.meter && r.meters[lane.meter] ? envInt(e, r.meters[lane.meter][0], r.meters[lane.meter][1]) : 0 /* v-meter-atomic: سقف المقياس — يحجزه المنادي ذرّيًّا (takeMeter) */, fallback, allowed: r.allowed.slice(), bucket: 'plan' };
}

// أسماء النماذج تتغيّر باستمرار (المجسّ ١٢ سبتمبر: gemini-2.5-flash «لم يعد
// متاحًا للمستخدمين الجدد»، llama-3.3-70b حُذف من Groq، mistral-large خارج
// الطبقة المجانية، ونسخة OpenRouter المجانية أُزيلت). لذلك لكل مزوّد قائمة
// مرشّحين تُجرَّب بالترتيب (خطأ «النموذج غير موجود» رخيص وفوري)، وإن سقطت كلها
// يُستكشف نموذج من قائمة /models عند المزوّد بمرشّح انتقاء (pick). النموذج
// الناجح يُحفظ في ذاكرة العملية. FREE_<المزوّد>_MODEL يُجرَّب أولًا.
const FREE_PROVIDER_SPECS = {
  gemini: {
    name: 'Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
    keyVar: 'GEMINI_API_KEY',
    modelVar: 'FREE_GEMINI_MODEL',
    models: ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'], // v-dead-models: «gemini-3-flash» لا وجود له (المعتمد 3.5/3.6/3.8)
    pick: /^(?:models\/)?gemini-[\d.]+-flash(?:-lite)?(?:-preview[\w-]*)?$/i,
    vision: true,
  },
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    keyVar: 'GROQ_API_KEY',
    modelVar: 'FREE_GROQ_MODEL',
    models: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'], // v-plan-models: المجّانيّ على 20b (قرار المالك)، وحدود Groq لكلّ موديل فـ120b بعده؛ v-dead-models: Maverick أُوقف ٩ مارس وllama-3.1-8b-instant ١٦ أغسطس (للمجانيّ) — كانا طلبين ضائعين؛ // v-models-latest: Groq أوقف Llama 4/3.x وqwen3-32b (مارس–أغسطس ٢٠٢٦) للمجانيّ والمطوّرين — الحيّ أوّلًا، والميّتان ذيلٌ لحسابات المؤسّسات
    pick: /gpt-oss-120b|qwen3\.8-27b|llama-4-maverick|llama-4-scout|llama-3\.3-70b|qwen3-32b|kimi-k2|gpt-oss-20b|llama-3\.1-8b/i,
    vision: false,
  },
  mistral: {
    name: 'Mistral',
    url: 'https://api.mistral.ai/v1/chat/completions',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    keyVar: 'MISTRAL_API_KEY',
    modelVar: 'FREE_MISTRAL_MODEL',
    models: ['mistral-small-latest', 'mistral-medium-latest', 'ministral-8b-latest', 'ministral-14b-latest'], // v-dead-models: open-mistral-nemo أُوقف ٣١ يوليو ٢٠٢٦، بديله الرسميّ ministral-8b-latest
    pick: /^mistral-small-latest$|^mistral-medium-latest$|^ministral-(?:8|14)b-latest$|^mistral-small/i,
    vision: false,
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    keyVar: 'OPENROUTER_API_KEY',
    modelVar: 'FREE_OPENROUTER_MODEL',
    models: ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'nvidia/nemotron-3.5-lightning:free'], // v-plan-models: Llama 4 وLlama 3.3 وQwen3-235B (أُوقف ٩ أكتوبر) وGemma 3 خرجت من قائمة الوسيط المجّانيّة، وGLM 5.2 وMistral Small 3.2 المجّانيّان ميّتان في فحص ١٦ أكتوبر الحيّ (v-models-live)
    pick: /^(?:google\/gemma-[34]|nvidia\/nemotron|z-ai\/glm|meta-llama\/llama-4|meta-llama\/llama-3\.3|qwen\/qwen3|deepseek\/deepseek-chat|mistralai\/mistral-small)[\w.-]*:free$/i,
    vision: false,
    /* v-img-why (لقطة المالك ٣ أكتوبر: «ما قدرت أقرأ الصورة الحين» مرّتين): Gemini كان وحده من يرى في الاحتياط المجّانيّ،
       فتعثّره مع تعثّر المحرّك الأساسيّ = لا قراءة. هذه نماذج مجّانيّة ترى الصور (نصّ + صورة) — تُجرَّب في دور الصورة وحده
       وبعد Gemini، ولا يُرسَل إليها غيرها في هذا الدور (لا نموذج أعمى يستلم صورة). */
    visionModels: ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free'], // v-plan-models: Gemma 3 وMistral Small 3.2 وQwen2.5-VL المجّانيّة ميّتة في فحص ١٦ أكتوبر الحيّ؛ v-free-vision-next (٢٢ أكتوبر، بأمر المالك): Gemma 4 31B وحده كان 429 «rate-limited upstream» في كلّ دور صورة بالسجلّ (١٩–٢٢ أكتوبر) — بعده Gemma 4 26B (Nemotron Nano Omni ٠٪ فلم يُضَف). وNemotron 3.5 Super VL أُزيل بأمر المالك بعد ثلاث تجارب حيّة: يقرأ الأرقام ويخربط الكلام العربيّ (١ من ٣ صحيح) — جواب واثق خاطئ أسوأ من «ما قدرت أقرأ الصورة»
  },
};
// v-plan-routing (قرار المالك ٢٠ سبتمبر: «المجّاني ٥ رسائل على Groq من غير أيّ شي»): Groq أوّلًا،
// والباقون التقاطٌ عند تعطّله فقط (429/5xx). FREE_CHAIN في البيئة يغيّر الترتيب بلا نشر.
const DEFAULT_CHAIN = ['groq', 'gemini', 'mistral', 'openrouter'];

function envInt(env, name, def) {
  const raw = env && env[name] !== undefined && env[name] !== null ? String(env[name]).trim() : '';
  if (!raw) return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

// السقوف اليومية بحسب الطبقة — تُقرأ عند كل نداء كي يسري تغيير البيئة فورًا.
function caps(env) {
  const e = env || process.env;
  return {
    // v-free-20 (٣ أكتوبر): ضيف ٠ · مجّاني ٢٠ يوميًّا على السلسلة المجّانيّة · Plus ٥٠ · Pro ١٠٠ · Max ٢٥٠.
    guest: envInt(e, 'GUEST_DAILY', 0),
    free: envInt(e, 'FREE_DAILY', 20),
    basic: envInt(e, 'SUB_DAILY_BASIC', 50),
    pro: envInt(e, 'SUB_DAILY_PRO', 100),
    max: envInt(e, 'SUB_DAILY_MAX', 250),
  };
}

function isOwnerUsername(username) {
  return !!username && OWNER_LIST.includes(String(username).trim().toLowerCase());
}

// خطة مدفوعة سارية: اسم خطة معروف + تاريخ آخر دفع/تجديد خلال ٣٥ يومًا.
function planActive(user, now) {
  // v-lock-subs (srv-money-4، موافقة المالك ٢٧ أكتوبر): بالفترة الفعليّة (chatPeriod تحت freeChain أدناه) — الرئيسيّة
  // (plan · planUpdatedAt)، أو فترة باقة أدنى دُفعت تحت أعلى سارية (user.planNext) فتسري حين تنتهي الأعلى. كانت تلك
  // الفترة تُرمى: يسقط إلى المجّانيّ حتّى التجديد التالي وهو يدفعها. النافذة كما كانت: ٣٥ يومًا من الدفع، ولا تاريخ
  // في المستقبل أبعد من دقيقة. يقرؤها أيضًا resolveTier و_planVideos وpoints.subsOf وcost-meter وpay-refund.priorOf.
  // (هذا السطر وresolveTier بعده مرساتان في knowledge/ROUTING.md، فالتعريف نفسه تحت freeChain.)
  // النتيجة للمنتهية والمحذوف وغير المعروفة كما كانت: false.
  return !!chatPeriod(user, now);
}

// ذاكرة قصيرة داخل العملية: قراءة سجلّ الحساب لكل رسالة نداء Redis إضافي —
// دقيقة واحدة كافية، وتغيّر الاشتراك يظهر خلالها.
const TIER_CACHE_MS = 60000;
const tierCache = new Map();

async function resolveTier(username, opts) {
  const o = opts || {};
  const now = typeof o.now === 'number' ? o.now : Date.now();
  const c = caps(o.env);
  if (!username) return { tier: 'guest', plan: null, cap: c.guest, subscriber: false };
  const uname = String(username).trim().toLowerCase();
  if (isOwnerUsername(uname)) return { tier: 'owner', plan: null, cap: Infinity, subscriber: true };

  if (!o.noCache) {
    const hit = tierCache.get(uname);
    if (hit && now - hit.at < TIER_CACHE_MS) return Object.assign({}, hit.value);
  }

  let vip = false;
  try { vip = await (o.isVip || isVip)(uname); } catch (e) { vip = false; }
  let value;
  if (vip) {
    value = { tier: 'vip', plan: null, cap: Infinity, subscriber: true };
  } else {
    let user = null;
    try {
      const getUser = o.getUser || require('./auth.js').getUser;
      user = await getUser(uname);
    } catch (e) { user = null; }
    if (planActive(user, now)) {
      const plan = chatPeriod(user, now).plan; // v-lock-subs (srv-money-4): الفعليّة — بعد انتهاء الأعلى تسري الأدنى المدفوعة تحتها
      value = { tier: 'sub', plan, cap: c[plan], subscriber: true };
    } else {
      // v-free-first-day (قرار المالك ٢٦ سبتمبر): يوم التسجيل (بتوقيت UTC كعدّاد اليوم) FREE_FIRST_DAY رسالة، ثمّ FREE_DAILY.
      const born = Number(user && user.createdAt) || 0;
      const firstDay = born > 0 && new Date(born).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
      value = { tier: 'free', plan: null, cap: firstDay ? Math.max(c.free, envInt(o.env || process.env, 'FREE_FIRST_DAY', 20)) : c.free, subscriber: false };
    }
  }
  if (!o.noCache) tierCache.set(uname, { at: now, value: Object.assign({}, value) });
  return value;
}

function invalidateTier(username) {
  if (username) tierCache.delete(String(username).trim().toLowerCase());
  else tierCache.clear();
}

function isPaidProvider(provider) {
  return PAID_PROVIDERS.includes(String(provider || '').toLowerCase());
}

// السلسلة المجانية الفعلية: الترتيب من FREE_CHAIN، والمزوّد بلا مفتاح يُستبعد.
function freeChain(env) {
  const e = env || process.env;
  const order = String(e.FREE_CHAIN || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const names = (order.length ? order : DEFAULT_CHAIN).filter((n) => FREE_PROVIDER_SPECS[n]);
  const out = [];
  for (const n of names) {
    const spec = FREE_PROVIDER_SPECS[n];
    const key = e[spec.keyVar];
    if (!key) continue;
    const pref = e[spec.modelVar] && String(e[spec.modelVar]).trim();
    const models = (pref ? [pref] : []).concat(spec.models.filter((m) => m !== pref));
    out.push({ id: n, name: spec.name, url: spec.url, modelsUrl: spec.modelsUrl, key, model: models[0], models, pick: spec.pick, vision: !!spec.vision, visionModels: spec.visionModels || [] });
  }
  return out;
}

/* v-lock-subs (srv-money-4، موافقة المالك ٢٧ أكتوبر): دفعة باقة أدنى تصل وأعلى سارية (تجديد اشتراك Plus بعد شراء Max لمرّة بـApple/Google Pay
   أو PayPal، أو جلسة قديمة) لا تُنزل الأعلى، وفترتها كانت تُرمى — فحين تنتهي الأعلى يسقط إلى المجّانيّ حتّى التجديد التالي (~٣٠ يومًا) وهو
   يدفع Plus. فترتها الآن في user.planNext (قائمة { plan, at, payId }، create-checkout-session.js). الفعليّة: أعلى درجة سارية بين الرئيسيّة
   (plan · planUpdatedAt · planPayId) وفترات planNext، والتعادل للرئيسيّة ثمّ للأحدث. يرجع { plan, at, payId, next } أو null.
   تحت freeChain لأنّ أسطر ما فوقها مراسٍ في knowledge/ROUTING.md (الدالّة مرفوعة، والثابت يُقرأ عند النداء لا عند التحميل). */
const CHAT_RANK = { basic: 1, pro: 2, max: 3 };
function chatPeriod(user, now) {
  if (!user || user.deleted) return null;
  const t = typeof now === 'number' ? now : Date.now();
  const live = (p) => PLAN_KEYS.includes(p.plan) && p.at > 0 && t - p.at <= SUB_WINDOW_MS && p.at <= t + 60000;
  const all = [{ plan: String(user.plan || '').toLowerCase(), at: Number(user.planUpdatedAt || 0), payId: user.planPayId ? String(user.planPayId) : null, next: false }]
    .concat((Array.isArray(user.planNext) ? user.planNext : []).filter(Boolean)
      .map((n) => ({ plan: String(n.plan || '').toLowerCase(), at: Number(n.at || 0), payId: n.payId ? String(n.payId) : null, next: true })));
  let best = null;
  for (const p of all) {
    if (!live(p)) continue;
    if (!best || CHAT_RANK[p.plan] > CHAT_RANK[best.plan] || (CHAT_RANK[p.plan] === CHAT_RANK[best.plan] && best.next && p.at > best.at)) best = p;
  }
  return best;
}

// نصوص تراها الطبقة المجانية — بلا اسم أي مزوّد (قرار المالك: «بدون اسم كلاود»).
const FREE_TEXT = {
  // v-honest-cards (فحص الاشتراكات ٥ أكتوبر): كانت «بلا حدود» والباقات لها سقف يوميّ.
  get freeLimit() { const c = caps(); return 'انتهت رسائلك المجانية لليوم. اشترك لترفع حدّك إلى ' + c.basic + '–' + c.max + ' رسالة يوميًّا بالنسخة الاحترافية.'; },
  get guestLimit() {
    const daily = caps().free, first = envInt(process.env, 'FREE_FIRST_DAY', 20);
    const msgs = first > daily ? first + ' رسالة في أوّل يوم، ثمّ ' + daily + ' يوميًّا' : daily + ' رسالة يوميًّا';
    return 'سجّل حسابًا مجانيًّا لتبدأ الدردشة: ' + msgs + '، و٧٠ نقطة ترحيب.';
  },
  subLimit: (cap) => 'وصلت سقف باقتك اليومي (' + cap + ' رسالة). يتجدد غدًا.',
  busy: 'الوضع المجاني مشغول الآن. جرّب بعد قليل، أو اشترك للنسخة الاحترافية.',
  // v-img-no-blind: اعتراف صريح بدل تأليف «الصورة غير واضحة» حين لا يتوفّر محرّك يرى الصور.
  imageBusy: 'ما قدرت أقرأ الصورة الحين — المحرّك الذي يقرأ الصور غير متاح مؤقّتًا. أعد إرسالها بعد قليل.',
  subscribeOnly: 'هذه الميزة للنسخة الاحترافية. اشترك لتفعيلها.',
  // v-model-lock: حدّ محرّك الكود اليوميّ في الباقة انتهى على الرابط المباشر (المزوّدون الآخرون يكملون).
  engineLimit: 'وصلت حدّ اليوم لهذا المحرّك في باقتك. يتجدّد غدًا.',
};

// v-plan-models: عدّادات اليوم لمقاييس الباقة أيًّا كانت (haiku/sonnet قديمًا، gemini لـPro وpremium لـMax) — قراءة تقريبيّة قبل الحجز الذرّيّ (takeMeter).
async function planUsedCounts(user, plan, todayCount) {
  const r = PLAN_ROUTING[String(plan || '').toLowerCase()];
  const out = {};
  for (const m of Object.keys((r && r.meters) || {})) out[m] = await todayCount(user, 'plan-' + m);
  return out;
}

module.exports = {
  PLAN_KEYS, SUB_WINDOW_DAYS, PAID_PROVIDERS, FREE_PROVIDER_SPECS, DEFAULT_CHAIN, FREE_TEXT,
  caps, planActive, chatPeriod /* v-lock-subs (srv-money-4) */, resolveTier, invalidateTier, isPaidProvider, freeChain, isOwnerUsername,
  PLAN_ROUTING, LANES, isStrongTurn, turnJob, planRoute, planUsedCounts, // v-plan-routing · v-plan-jobs · v-plan-models
};
