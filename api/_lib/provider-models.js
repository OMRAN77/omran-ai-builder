'use strict';
/* v-provider-models (أمر المالك ٢٢ سبتمبر «كلّ واحد وموديله بالضبط — هذي الخاصيّة أنا الي أريدها»):
   موديلات المزوّدين غير كلود في شريط السهم كانت أسماء عرض لا تصل الخادم (chat.js يستعمل OR_MODELS
   ثابتة). الآن: (١) قائمة حيّة من OpenRouter لكلّ مزوّد — الأحدث ثمانية — تُخزَّن ستّ ساعات في
   الذاكرة وKV؛ (٢) الاختيار يصل chat.js في body.model ويُقبل للمالك إن كان معرّف OpenRouter
   بالبادئة الصحيحة لذلك المزوّد؛ رفضه الوسيط = رجوع للافتراضيّ مع سطر حالة (آليّة v-claude-models
   نفسها). كلود يبقى على قائمته الثابتة (المسار المباشر). للمالك وحده كالمنتقي نفسه. */
const { isOwner } = require('./_owner.js');

// مفتاح المزوّد في التطبيق ← بادئة الشركة عند OpenRouter.
const OR_VENDOR = { openai: 'openai', gemini: 'google', deepseek: 'deepseek', mistral: 'mistralai', cohere: 'cohere', groq: 'meta-llama', perplexity: 'perplexity' };
const OR_ID_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i;
const PER_PROVIDER = 8;
const TTL_MS = 6 * 60 * 60 * 1000;
const KV_KEY = 'provmodels:v2'; // v-owner-direct: v2 = قائمة Groq من Groq نفسه
const OR_MODELS_URL = 'https://openrouter.ai/api/v1/models';

function pickProviderModel(prov, requested, fallback) {
  const id = String(requested || '').trim();
  const vendor = OR_VENDOR[String(prov || '').toLowerCase()];
  const slash = id.indexOf('/');
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
      .sort((a, b) => (Number(b.created) || 0) - (Number(a.created) || 0))
      .slice(0, PER_PROVIDER)
      .map((m) => [m.id, String(m.name || m.id).replace(/^[^:]{1,40}:\s*/, '').trim() || m.id]);
    if (list.length) out[prov] = list;
  }
  return out;
}

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
      if (c && c.models && now - (Number(c.at) || 0) < TTL_MS) { __mem = { at: c.at, models: c.models }; return { models: c.models, source: 'kv', at: c.at }; }
    } catch (e) { /* KV غائب أو متعثّر — نكمل من الشبكة */ }
  }
  const f = o.fetch || fetch;
  const headers = {};
  if (process.env.OPENROUTER_API_KEY) headers.Authorization = 'Bearer ' + process.env.OPENROUTER_API_KEY;
  const r = await f(OR_MODELS_URL, { headers });
  if (!r.ok) throw new Error('openrouter models ' + r.status);
  const models = parseModels(await r.json());
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
  __mem = { at: now, models };
  if (kv) { try { await kv.kvPutJSON(KV_KEY, { at: now, models }); } catch (e) { /* التخزين تحسينيّ */ } }
  return { models, source: 'network', at: now };
}

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
module.exports.loadModels = loadModels;
module.exports.OR_VENDOR = OR_VENDOR;
