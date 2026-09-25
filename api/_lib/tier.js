// api/_lib/tier.js — v-tiers: طبقات المحادثة الثلاث (قرار المالك ١٢ سبتمبر).
//
//   ضيف بلا حساب      → سلسلة مجانية، GUEST_DAILY رسائل يوميًّا (٣)
//   مسجَّل بلا اشتراك  → سلسلة مجانية، FREE_DAILY رسائل يوميًّا (١٠)
//   مشترك             → المحرّك الاحترافي بكل الأدوات، سقف حماية بحسب الباقة
//                        (SUB_DAILY_BASIC ٥٠ · SUB_DAILY_PRO ١٥٠ · SUB_DAILY_MAX ٤٠٠)
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

/* v-plan-routing (قرار المالك ٢٠ سبتمبر — جدول الباقات النهائيّ): لكلّ باقة مزوّد للدردشة والأسئلة
   العاديّة، ومزوّد أقوى لأدوار البرمجة/البناء/الرياضيات/الملفّ الطويل، وقائمة مسموح بها في المنتقي،
   وسلسلة التقاط داخل الباقة (أرخص فأرخص) تسبق السلسلة المجّانيّة. المالك وVIP والمجّانيّ خارج الجدول.
   model = موديل كلود من CLAUDE_MODELS في chat.js؛ بلا model = افتراضيّ المزوّد (OR_MODELS). */
const PLAN_ROUTING = {
  basic: { chat: { prov: 'deepseek' }, strong: { prov: 'deepseek' }, allowed: ['deepseek', 'groq'], fallback: [{ prov: 'groq' }] },
  pro: { chat: { prov: 'deepseek' }, strong: { prov: 'claude', model: 'claude-haiku-4-5' }, allowed: ['deepseek', 'groq', 'gemini', 'mistral'], fallback: [{ prov: 'gemini' }, { prov: 'deepseek' }] },
  max: { chat: { prov: 'claude', model: 'claude-haiku-4-5' }, strong: { prov: 'claude', model: 'claude-sonnet-5' }, allowed: ['claude', 'openai', 'gemini', 'mistral', 'deepseek', 'groq', 'cohere'], fallback: [{ prov: 'openai' }, { prov: 'gemini' }, { prov: 'deepseek' }] },
};
// الدور القويّ: نصّ طويل (وثيقة/ملفّ) أو كتلة كود أو كلمات برمجة/بناء/رياضيات.
const STRONG_TURN_RE = /```|(?:^|[\s،,.:؛()"'«»-])(?:ال|بال|وال|لل|فال|كال)?(?:كود|كودي|برمج|برمجة|سكربت|سكريبت|دالة|دوال|خوارزميّ?ة|bug|error|exception|debug|api|json|sql|regex|html|css|javascript|typescript|python|react|node|docker|ابنِ|ابني|اعمل(?:\s+لي)?\s+(?:موقع|تطبيق|صفحة|برنامج|بوت|لعبة)|صمّ?م(?:\s+لي)?\s+(?:موقع|تطبيق|صفحة)|احسب|معادلة|معادلات|مشتقّ?ة|تكامل|مصفوفة|احتمال|إحصاء|جبر|ضريبة|فائدة\s+مركّ?بة|نسبة\s+مئويّ?ة|calculate|solve|equation|integral|derivative|matrix|probability|statistics|function|class|compile)(?=$|[\s،,.:؛()"'«»?؟!-])/i;
function isStrongTurn(text) {
  const s = String(text || '');
  if (s.length >= 600) return true;
  return STRONG_TURN_RE.test(s);
}
/* قرار التوجيه لطلب مشترك: الدور القويّ → strong؛ وإلّا المزوّد المطلوب إن كان مسموحًا؛ وإلّا افتراضيّ
   الباقة. الالتقاط = سلسلة الباقة بلا المزوّد المختار. غير المشترك (مالك/VIP/مجّانيّ/ضيف) → null. */
function planRoute(tier, requestedProv, lastUserText) {
  const plan = (tier && tier.tier === 'sub') ? String(tier.plan || '').toLowerCase() : '';
  const r = PLAN_ROUTING[plan];
  if (!r) return null;
  const strong = isStrongTurn(lastUserText);
  const req = String(requestedProv || '').toLowerCase();
  const pick = (strong && r.strong) ? r.strong : ((req && r.allowed.includes(req)) ? (req === r.chat.prov ? r.chat : { prov: req }) : r.chat);
  return { plan, strong, prov: pick.prov, model: pick.model || '', fallback: r.fallback.filter((f) => f.prov !== pick.prov), allowed: r.allowed.slice() };
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
    models: ['gemini-flash-latest', 'gemini-3-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'],
    pick: /^(?:models\/)?gemini-[\d.]+-flash(?:-lite)?(?:-preview[\w-]*)?$/i,
    vision: true,
  },
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    keyVar: 'GROQ_API_KEY',
    modelVar: 'FREE_GROQ_MODEL',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'llama-3.1-8b-instant'], // v-models-latest: Groq أوقف Llama 4/3.x وqwen3-32b (مارس–أغسطس ٢٠٢٦) للمجانيّ والمطوّرين — الحيّ أوّلًا، والميّتان ذيلٌ لحسابات المؤسّسات
    pick: /gpt-oss-120b|llama-4-maverick|llama-4-scout|llama-3\.3-70b|qwen3-32b|kimi-k2|gpt-oss-20b|llama-3\.1-8b/i,
    vision: false,
  },
  mistral: {
    name: 'Mistral',
    url: 'https://api.mistral.ai/v1/chat/completions',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    keyVar: 'MISTRAL_API_KEY',
    modelVar: 'FREE_MISTRAL_MODEL',
    models: ['mistral-small-latest', 'mistral-medium-latest', 'open-mistral-nemo', 'ministral-8b-latest'],
    pick: /^mistral-small-latest$|^mistral-medium-latest$|^open-mistral-nemo$|^ministral-8b-latest$|^mistral-small/i,
    vision: false,
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    keyVar: 'OPENROUTER_API_KEY',
    modelVar: 'FREE_OPENROUTER_MODEL',
    models: ['meta-llama/llama-4-maverick:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-235b-a22b:free', 'google/gemma-3-27b-it:free', 'deepseek/deepseek-chat-v3-0324:free', 'mistralai/mistral-small-3.2-24b-instruct:free'],
    pick: /^(?:meta-llama\/llama-4|meta-llama\/llama-3\.3|qwen\/qwen3|google\/gemma-3|deepseek\/deepseek-chat|mistralai\/mistral-small)[\w.-]*:free$/i,
    vision: false,
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
    // v-plan-routing: الأسقف النهائيّة (قرار المالك ٢٠ سبتمبر): مجّاني ٥ · Plus ٥٠ · Pro ١٠٠ · Max ٢٥٠.
    guest: envInt(e, 'GUEST_DAILY', 3),
    free: envInt(e, 'FREE_DAILY', 5),
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
  if (!user || user.deleted) return false;
  const plan = String(user.plan || '').toLowerCase();
  if (!PLAN_KEYS.includes(plan)) return false;
  const at = Number(user.planUpdatedAt || 0);
  if (!(at > 0)) return false;
  const t = typeof now === 'number' ? now : Date.now();
  return t - at <= SUB_WINDOW_MS && at <= t + 60000;
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
      const plan = String(user.plan).toLowerCase();
      value = { tier: 'sub', plan, cap: c[plan], subscriber: true };
    } else {
      value = { tier: 'free', plan: null, cap: c.free, subscriber: false };
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
    out.push({ id: n, name: spec.name, url: spec.url, modelsUrl: spec.modelsUrl, key, model: models[0], models, pick: spec.pick, vision: !!spec.vision });
  }
  return out;
}

// نصوص تراها الطبقة المجانية — بلا اسم أي مزوّد (قرار المالك: «بدون اسم كلاود»).
const FREE_TEXT = {
  freeLimit: 'انتهت رسائلك المجانية لليوم. اشترك للنسخة الاحترافية بلا حدود.',
  get guestLimit() { return 'انتهت رسائل التجربة. سجّل حسابًا مجانيًّا لتكمل: ' + caps().free + ' رسائل يوميًّا و٧٠ نقطة ترحيب.'; },
  subLimit: (cap) => 'وصلت سقف باقتك اليومي (' + cap + ' رسالة). يتجدد غدًا.',
  busy: 'الوضع المجاني مشغول الآن. جرّب بعد قليل، أو اشترك للنسخة الاحترافية.',
  // v-img-no-blind: اعتراف صريح بدل تأليف «الصورة غير واضحة» حين لا يتوفّر محرّك يرى الصور.
  imageBusy: 'ما قدرت أقرأ الصورة الحين — المحرّك الذي يقرأ الصور غير متاح مؤقّتًا. أعد إرسالها بعد قليل.',
  subscribeOnly: 'هذه الميزة للنسخة الاحترافية. اشترك لتفعيلها.',
};

module.exports = {
  PLAN_KEYS, SUB_WINDOW_DAYS, PAID_PROVIDERS, FREE_PROVIDER_SPECS, DEFAULT_CHAIN, FREE_TEXT,
  caps, planActive, resolveTier, invalidateTier, isPaidProvider, freeChain, isOwnerUsername,
  PLAN_ROUTING, isStrongTurn, planRoute, // v-plan-routing
};
