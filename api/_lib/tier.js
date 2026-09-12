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

const FREE_PROVIDER_SPECS = {
  gemini: {
    name: 'Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyVar: 'GEMINI_API_KEY',
    modelVar: 'FREE_GEMINI_MODEL',
    model: 'gemini-2.5-flash',
    vision: true,
  },
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyVar: 'GROQ_API_KEY',
    modelVar: 'FREE_GROQ_MODEL',
    model: 'llama-3.3-70b-versatile',
    vision: false,
  },
  mistral: {
    name: 'Mistral',
    url: 'https://api.mistral.ai/v1/chat/completions',
    keyVar: 'MISTRAL_API_KEY',
    modelVar: 'FREE_MISTRAL_MODEL',
    model: 'mistral-large-latest',
    vision: false,
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyVar: 'OPENROUTER_API_KEY',
    modelVar: 'FREE_OPENROUTER_MODEL',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    vision: false,
  },
};
const DEFAULT_CHAIN = ['gemini', 'groq', 'mistral', 'openrouter'];

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
    guest: envInt(e, 'GUEST_DAILY', 3),
    free: envInt(e, 'FREE_DAILY', 10),
    basic: envInt(e, 'SUB_DAILY_BASIC', 50),
    pro: envInt(e, 'SUB_DAILY_PRO', 150),
    max: envInt(e, 'SUB_DAILY_MAX', 400),
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
    const model = (e[spec.modelVar] && String(e[spec.modelVar]).trim()) || spec.model;
    out.push({ id: n, name: spec.name, url: spec.url, key, model, vision: !!spec.vision });
  }
  return out;
}

// نصوص تراها الطبقة المجانية — بلا اسم أي مزوّد (قرار المالك: «بدون اسم كلاود»).
const FREE_TEXT = {
  freeLimit: 'انتهت رسائلك المجانية لليوم. اشترك للنسخة الاحترافية بلا حدود.',
  get guestLimit() { return 'انتهت رسائل التجربة. سجّل حسابًا مجانيًّا لتكمل: ' + caps().free + ' رسائل يوميًّا و٧٠ نقطة ترحيب.'; },
  subLimit: (cap) => 'وصلت سقف باقتك اليومي (' + cap + ' رسالة). يتجدد غدًا.',
  busy: 'الوضع المجاني مشغول الآن. جرّب بعد قليل، أو اشترك للنسخة الاحترافية.',
  subscribeOnly: 'هذه الميزة للنسخة الاحترافية. اشترك لتفعيلها.',
};

module.exports = {
  PLAN_KEYS, SUB_WINDOW_DAYS, PAID_PROVIDERS, FREE_PROVIDER_SPECS, DEFAULT_CHAIN, FREE_TEXT,
  caps, planActive, resolveTier, invalidateTier, isPaidProvider, freeChain, isOwnerUsername,
};
