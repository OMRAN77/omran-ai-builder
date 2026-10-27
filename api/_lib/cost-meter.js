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

// [نمط اسم النموذج، دخل، خرج، (مضاعف قراءة الكاش — الافتراضيّ ٠٫١)] بالدولار لكلّ مليون توكن (أسعار معلنة أكتوبر ٢٠٢٦؛ الأوّل المطابق يفوز).
/* v-meter-prices (المالك ١٠ أكتوبر: «اصلح»): كلود بأسعار Anthropic الرسميّة (مرجع claude-api، ٦ أكتوبر ٢٠٢٦) لكلّ موديل في المنتقي —
   كان Fable 5.1 لا يطابق شيئًا فيُحسب ١/٥ (حقيقته ١٠/٥٠، عُشر تكلفته)، وOpus 5.5 بسعر Opus القديم ٥/٢٥ (حقيقته ٤/٢٠)، وSonnet 5
   بسعر Sonnet 4.x ٣/١٥ (حقيقته ٢/١٠). وقراءة الكاش ليست ١٠٪ للكلّ: Opus 5.5 ‏٠٫٢٠$ (٥٪)، Fable 5.1 ‏٠٫٢٥$ (٢٫٥٪). المعرّفان
   المباشر (claude-opus-5-5) والوسيط (anthropic/claude-opus-5.5) يطابقان النمط نفسه. Haiku 5.5 بسعر ما دون ١٠٠ ألف توكن للطلب. */
const PRICES = [
  [/fable-5[-.]1/i, 10, 50, 0.025], [/fable/i, 10, 50] /* v-owner-claude-all: Fable 5 قراءة كاشه ١$ (١٠٪) لا ربع Fable 5.1 */, [/opus-5[-.]5/i, 4, 20, 0.05], [/opus/i, 5, 25],
  [/sonnet-5(?:[-.]5)?(?!\d)/i, 2, 10], [/sonnet/i, 3, 15],
  [/haiku-5[-.]5/i, 0.1, 0.5], [/haiku/i, 1, 5],
  [/deepseek.*(?:v4[-_.]?pro|reasoner|r1\b)/i, 0.66, 1.98, 0.033], [/deepseek/i, 0.15, 0.6, 0.02], [/gpt-oss/i, 0.15, 0.6], [/gemini|flash/i, 0.75, 3.75], /* v-deepseek-2026: أسعار DeepSeek الرسمية off-peak — flash 0.15/0.6 (قراءة كاش 2%)، pro 0.66/1.98 (3.3%) */
  [/command|cohere/i, 2.5, 10], [/sonar|perplexity/i, 1, 1], [/mistral|ministral/i, 0.4, 2], [/gpt|openai/i, 1.25, 10],
];
const FALLBACK = [null, 1, 5];

function tokenCostUsd(model, u) {
  const p = PRICES.find((x) => x[0].test(String(model || ''))) || FALLBACK;
  const x = u || {};
  return ((Number(x.input) || 0) * p[1] + (Number(x.cacheRead) || 0) * p[1] * (p[3] || 0.1)
    + (Number(x.cacheWrite) || 0) * p[1] * 1.25 + (Number(x.output) || 0) * p[2]) / 1e6;
}

const monthOf = (t) => new Date(typeof t === 'number' ? t : Date.now()).toISOString().slice(0, 7);
const norm = (u) => encodeURIComponent(String(u || '').trim().toLowerCase());
const keyOf = (month, user, kind) => 'cost:' + month + ':' + norm(user) + ':' + kind;

function costCmds(username, usd, kind, now) {
  const micros = Math.round((Number(usd) || 0) * 1e6);
  if (!username || !(micros > 0)) return [];
  const k = keyOf(monthOf(now), username, KINDS.includes(kind) ? kind : 'chat');
  return [['INCRBY', k, String(micros)], ['EXPIRE', k, String(MONTH_TTL_SEC)]];
}

async function addCost(username, usd, kind, opts) {
  const cmds = costCmds(username, usd, kind, opts && opts.now);
  if (!cmds.length) return;
  try {
    const kv = (opts && opts.kv) || require('./kv.js');
    if (typeof kv.kvPipeline !== 'function') return; // بيئة بلا Redis كامل (اختبارات) — لا قياس
    await kv.kvPipeline(cmds);
  } catch (e) { console.warn('[cost-meter] skipped:', e && e.message); }
}

/* v-tokens-meter (التقييم ١١ أكتوبر: نسبة قراءة الكاش لم تكن تُقاس في الإنتاج — حالات الصفر وجدها مسبار التدقيق وحده): عدّادات توكنات
   لكلّ يوم ومسار (paid · free · owner · pro) وموديل — دخل، قراءة كاش، كتابة كاش، خرج، أدوار — HINCRBY في طلب Redis المجمّع نفسه الذي
   يسجّل التكلفة حين يُسجَّل (لا رحلة إضافيّة لدور حساب يدفع)؛ أمّا دور المالك والزائر وVIP فلا تكلفة له، فالتوكنات طلب Redis جديد
   (حتّى ٦ أوامر) بعد done لا قبله (cross-2/tok-3، مراجعة الدفعة A). EXPIRE في كلّ دور كنمط costCmds: ضبطه مرّة يكلّف رحلة ثانية.
   مدّة ١٠٠ يوم. تقرير للمالك (tokenReport) بنسبة القراءة. لا حصّة تقرؤها؛ والفشل لا يوقف ردًّا. */
const dayOf = (t) => new Date(typeof t === 'number' ? t : Date.now()).toISOString().slice(0, 10);
const TOK_FIELDS = [['input', 'in'], ['cacheRead', 'cr'], ['cacheWrite', 'cw'], ['output', 'out']];
function tokenKey(day, lane, model) {
  return 'tok:' + day + ':' + (String(lane || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'paid') + ':' + encodeURIComponent(String(model || '?').trim().toLowerCase().slice(0, 80));
}
function tokenCmds(t, now) {
  if (!t || typeof t !== 'object') return [];
  const k = tokenKey(dayOf(now), t.lane, t.model);
  const cmds = [];
  for (const [f, h] of TOK_FIELDS) { const n = Math.max(0, Math.round(Number(t[f]) || 0)); if (n) cmds.push(['HINCRBY', k, h, String(n)]); }
  cmds.push(['HINCRBY', k, 'turns', '1'], ['EXPIRE', k, String(MONTH_TTL_SEC)]);
  return cmds;
}
// نهاية دور محادثة: التكلفة (إن كان حساب غير المالك) والتوكنات معًا في طلب واحد.
async function meterTurn(username, usd, kind, tokens, opts) {
  const now = opts && opts.now;
  const cmds = costCmds(username, usd, kind, now).concat(tokenCmds(tokens, now));
  if (!cmds.length) return;
  try {
    const kv = (opts && opts.kv) || require('./kv.js');
    if (typeof kv.kvPipeline !== 'function') return; // بيئة بلا Redis كامل (اختبارات) — لا قياس
    await kv.kvPipeline(cmds);
  } catch (e) { console.warn('[cost-meter] skipped:', e && e.message); }
}
// تقرير المالك: آخر N يوم لكلّ مسار وموديل، ونسبة القراءة = قراءة الكاش ÷ كلّ الدخل (جديد + قراءة + كتابة).
async function tokenReport(days, deps) {
  const d = deps || {};
  const kv = d.kv || require('./kv.js');
  const n = Math.max(1, Math.min(100, Math.trunc(Number(days) || 7)));
  const end = typeof d.now === 'number' ? d.now : Date.now();
  const want = new Set(Array.from({ length: n }, (_, i) => dayOf(end - i * 86400000)));
  const keys = (await kv.kvList('tok:')).filter((k) => want.has(String(k).split(':')[1]));
  const vals = keys.length ? await kv.kvPipeline(keys.map((k) => ['HGETALL', k])) : [];
  const rows = new Map();
  keys.forEach((k, i) => {
    const [, , lane, model] = String(k).split(':');
    const v = vals[i];
    const h = {}; // HGETALL من Upstash REST: [حقل، قيمة، حقل، قيمة…]
    if (Array.isArray(v)) { for (let j = 0; j + 1 < v.length; j += 2) h[v[j]] = v[j + 1]; } else Object.assign(h, v || {});
    const id = lane + ':' + model;
    const r = rows.get(id) || { lane, model: decodeURIComponent(model || ''), turns: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
    r.turns += Number(h.turns) || 0;
    for (const [f, hk] of TOK_FIELDS) r[f] += Number(h[hk]) || 0;
    rows.set(id, r);
  });
  const share = (r) => { const all = r.input + r.cacheRead + r.cacheWrite; return all ? Math.round(1000 * r.cacheRead / all) / 10 : 0; };
  const list = [...rows.values()].map((r) => Object.assign(r, { readPct: share(r) })).sort((a, b) => b.turns - a.turns);
  const lanes = {};
  for (const r of list) {
    const l = lanes[r.lane] || (lanes[r.lane] = { lane: r.lane, turns: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
    l.turns += r.turns; for (const [f] of TOK_FIELDS) l[f] += r[f];
  }
  return { days: n, byLane: Object.values(lanes).map((l) => Object.assign(l, { readPct: share(l) })).sort((a, b) => b.turns - a.turns), rows: list };
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
      else { const rec = await getUser(e.user); const cp = tier.chatPeriod(rec, d.now); if (cp) plan = cp.plan; } // v-lock-subs (srv-money-4): الفترة الفعليّة
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

module.exports = { tokenCostUsd, addCost, meterOp, opCostUsd, anthropicUsageTap, monthReport, moveMonthCosts, PRICES, meterTurn, tokenCmds, tokenKey, tokenReport };
