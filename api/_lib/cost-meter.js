'use strict';
/* v-cost-meter (قرار المالك ٥ أكتوبر، الخطوة ٣: «Max لا تغيّر فيه شي — قِس أسبوعين وقرّر بالأرقام»): تكلفة كلّ حساب علينا
   لم تكن مقيسة — كانت تقديرًا من أسعار معلنة. الآن كلّ عمليّة تُسجَّل شهريًّا لكلّ حساب بالميكرو-دولار (INCRBY ذرّيّ في طلب
   مجمّع واحد، مدّة ١٠٠ يوم فلا تتراكم):
     • الرسائل (chat.js وclaude.js المباشر) بتوكنات المزوّد الفعليّة × سعر النموذج (قراءة الكاش ١٠٪، كتابته ١٢٥٪).
     • الصور والفيديو ودقائق مها بجدول تكلفتنا UNIT_COST (_mediaPlans.js، بالفلس) عند كلّ خصم ناجح.
   لوحة المالك (health&costs=1) تجمعها لكلّ باقة: العدد والمتوسّط والأعلى، وأعلى المستخدمين. القياس لا يوقف خدمة أبدًا. */

const MONTH_TTL_SEC = 100 * 86400;
const AED = 3.6725;
const KINDS = ['chat', 'media', 'voice'];

// [نمط اسم النموذج، دخل، خرج] بالدولار لكلّ مليون توكن (أسعار معلنة أكتوبر ٢٠٢٦؛ الأوّل المطابق يفوز).
const PRICES = [
  [/opus/i, 5, 25], [/sonnet/i, 3, 15], [/haiku/i, 1, 5],
  [/deepseek/i, 0.58, 1.16], [/gpt-oss/i, 0.15, 0.6], [/gemini|flash/i, 0.75, 3.75],
  [/command|cohere/i, 2.5, 10], [/sonar|perplexity/i, 1, 1], [/mistral|ministral/i, 0.4, 2], [/gpt|openai/i, 1.25, 10],
];
const FALLBACK = [null, 1, 5];

function tokenCostUsd(model, u) {
  const p = PRICES.find((x) => x[0].test(String(model || ''))) || FALLBACK;
  const x = u || {};
  return ((Number(x.input) || 0) * p[1] + (Number(x.cacheRead) || 0) * p[1] * 0.1
    + (Number(x.cacheWrite) || 0) * p[1] * 1.25 + (Number(x.output) || 0) * p[2]) / 1e6;
}

const monthOf = (t) => new Date(typeof t === 'number' ? t : Date.now()).toISOString().slice(0, 7);
const norm = (u) => encodeURIComponent(String(u || '').trim().toLowerCase());
const keyOf = (month, user, kind) => 'cost:' + month + ':' + norm(user) + ':' + kind;

async function addCost(username, usd, kind, opts) {
  const micros = Math.round((Number(usd) || 0) * 1e6);
  if (!username || !(micros > 0)) return;
  const k = keyOf(monthOf(opts && opts.now), username, KINDS.includes(kind) ? kind : 'chat');
  try {
    const kv = (opts && opts.kv) || require('./kv.js');
    if (typeof kv.kvPipeline !== 'function') return; // بيئة بلا Redis كامل (اختبارات) — لا قياس
    await kv.kvPipeline([['INCRBY', k, String(micros)], ['EXPIRE', k, String(MONTH_TTL_SEC)]]);
  } catch (e) { console.warn('[cost-meter] skipped:', e && e.message); }
}

// v-rename-move: تكلفة الشهر تتبع الحساب بعد تغيير اسمه — وإلّا انقسمت على صفّين وحُسب الاسم القديم (سجلّ محذوف) «مجّانيًّا».
async function moveMonthCosts(oldUser, newUser, opts) {
  if (!oldUser || !newUser || norm(oldUser) === norm(newUser)) return;
  try {
    const kv = (opts && opts.kv) || require('./kv.js');
    if (typeof kv.kvPipeline !== 'function') return;
    const m = monthOf(opts && opts.now);
    const from = KINDS.map((k) => keyOf(m, oldUser, k));
    const vals = await kv.kvPipeline(from.map((k) => ['GET', k]));
    const cmds = [];
    vals.forEach((v, i) => {
      const n = parseInt(v, 10);
      if (n > 0) { const to = keyOf(m, newUser, KINDS[i]); cmds.push(['INCRBY', to, String(n)], ['EXPIRE', to, String(MONTH_TTL_SEC)], ['DEL', from[i]]); }
    });
    if (cmds.length) await kv.kvPipeline(cmds);
  } catch (e) { console.warn('[cost-meter] rename move skipped:', e && e.message); }
}

// خصم ناجح بالنقاط/رصيد الاشتراك/فيديو الباقة: تكلفتنا من جدول الوسائط (لا شيء لما ليس فيه، كالردّ الاحترافيّ).
function opCostUsd(reason) {
  const f = require('./_mediaPlans.js').UNIT_COST[String(reason || '')];
  return f ? f / 100 / AED : 0;
}
async function meterOp(username, reason, opts) {
  const usd = opCostUsd(reason);
  if (usd > 0) await addCost(username, usd, reason === 'maha_minute' ? 'voice' : 'media', opts);
}

// عدّاد توكنات من بثّ Anthropic (SSE) يمرّ كما هو: message_start يحمل الدخل والكاش، وmessage_delta الخرج التراكميّ.
function anthropicUsageTap() {
  const u = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let tail = '';
  const num = (s, re) => { const m = re.exec(s); return m ? Number(m[1]) || 0 : 0; };
  const scan = (s) => {
    if (s.indexOf('usage') === -1) return;
    u.input = Math.max(u.input, num(s, /"input_tokens"\s*:\s*(\d+)/));
    u.cacheRead = Math.max(u.cacheRead, num(s, /"cache_read_input_tokens"\s*:\s*(\d+)/));
    u.cacheWrite = Math.max(u.cacheWrite, num(s, /"cache_creation_input_tokens"\s*:\s*(\d+)/));
    u.output = Math.max(u.output, num(s, /"output_tokens"\s*:\s*(\d+)/));
  };
  return {
    push(text) {
      const lines = (tail + String(text || '')).split('\n');
      tail = lines.pop();
      for (const l of lines) scan(l);
    },
    usage() { if (tail) { scan(tail); tail = ''; } return u; },
  };
}

// تقرير الشهر للمالك: لكلّ باقة العدد والمجموع والمتوسّط والأعلى، وأعلى ١٥ حسابًا.
async function monthReport(month, deps) {
  const d = deps || {};
  const kv = d.kv || require('./kv.js');
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : monthOf(d.now);
  const prefix = 'cost:' + m + ':';
  const keys = await kv.kvList(prefix);
  const vals = keys.length ? await kv.kvPipeline(keys.map((k) => ['GET', k])) : [];
  const per = new Map();
  keys.forEach((k, i) => {
    const rest = k.slice(prefix.length);
    const j = rest.lastIndexOf(':');
    const user = decodeURIComponent(rest.slice(0, j));
    const kind = rest.slice(j + 1);
    const usd = (Number(vals[i]) || 0) / 1e6;
    const e = per.get(user) || { user, chat: 0, media: 0, voice: 0, total: 0 };
    if (KINDS.includes(kind)) e[kind] += usd;
    e.total += usd;
    per.set(user, e);
  });
  const tier = require('./tier.js');
  const getUser = d.getUser || ((u) => require('./auth.js').getUser(u, 1));
  const isVip = d.isVip || require('./_vip.js').isVip;
  const users = [...per.values()];
  for (const e of users) {
    let plan = 'free';
    try {
      if (tier.isOwnerUsername(e.user)) plan = 'owner';
      else if (await isVip(e.user)) plan = 'vip';
      else { const rec = await getUser(e.user); if (tier.planActive(rec, d.now)) plan = String(rec.plan).toLowerCase(); }
    } catch (err) { plan = 'free'; }
    e.plan = plan;
  }
  const groups = {};
  for (const e of users) {
    const g = groups[e.plan] || (groups[e.plan] = { plan: e.plan, users: 0, total: 0, max: 0 });
    g.users++; g.total += e.total; g.max = Math.max(g.max, e.total);
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const byPlan = Object.values(groups).map((g) => ({ plan: g.plan, users: g.users, total: r2(g.total), avg: r2(g.total / g.users), max: r2(g.max) }))
    .sort((a, b) => b.total - a.total);
  const top = users.sort((a, b) => b.total - a.total).slice(0, 15)
    .map((e) => ({ user: e.user, plan: e.plan, total: r2(e.total), chat: r2(e.chat), media: r2(e.media), voice: r2(e.voice) }));
  return { month: m, users: users.length, total: r2(users.reduce((s, e) => s + e.total, 0)), byPlan, top };
}

module.exports = { tokenCostUsd, addCost, meterOp, opCostUsd, anthropicUsageTap, monthReport, moveMonthCosts, PRICES };
