// api/_lib/free-chain.js — v-tiers: بثّ ردّ المحادثة للطبقة المجانية عبر سلسلة
// مزوّدات لها طبقة مجانية (Gemini Flash → Groq → Mistral → OpenRouter)، كلّها
// بصيغة OpenAI المتوافقة (chat/completions + SSE) فدالّة بثّ واحدة تكفي.
//
// بلا أدوات: لا بحث حي ولا صور ولا وكيل — تلك للنسخة الاحترافية. الصور المرفقة
// تمرّ للمزوّد الذي يرى (Gemini) وتُستبدل بملاحظة نصّية عند الباقين.
// امتلاء حصة مزوّد (429) أو أي عطل يمرّر الطلب للتالي بصمت؛ فشل الجميع يرجع
// {ok:false, errors} والمستدعي يعرض رسالة «مشغول» لا خطأ تقنيًّا.
//
// v-free-models (المجسّ ١٢ سبتمبر: المزوّدات الأربعة ردّت 404/403 على أسماء
// نماذج قديمة): لكل مزوّد قائمة مرشّحين تُجرَّب بالترتيب، ثم استكشاف من /models،
// والناجح يُحفظ في ذاكرة العملية فلا تتكرّر المحاولات في كل رسالة.
'use strict';

const { freeChain } = require('./tier.js');

// ملاحظة النظام للطبقة المجانية — بلا اسم أي مزوّد (قرار المالك: «بدون اسم كلاود»).
const FREE_NOTE = '\n\n[الوضع المجاني — إلزامي]: أنت «عمران» مساعد التطبيق. في هذا الوضع تردّ نصًّا فقط: لا تملك بحثًا حيًّا ولا توليد صور ولا تشغيل كود، فلا تدّعِ أنك بحثت أو رسمت. إن طلب المستخدم بحثًا حيًّا أو صورة أو بناء تطبيق فأجب بما تعرفه باختصار ثم قل بلطف إن هذه الميزة في النسخة الاحترافية. لا تذكر اسم النموذج أو الشركة المزوّدة أبدًا. أجب بلغة المستخدم ولهجته.';

function blockText(b) {
  if (!b) return '';
  if (typeof b === 'string') return b;
  if (b.type === 'text') return String(b.text || '');
  if (b.type === 'tool_result') return typeof b.content === 'string' ? b.content : '';
  return '';
}

// تحويل محادثة بصيغة Anthropic إلى صيغة OpenAI. vision=false يستبدل الصور بنصّ.
function toOpenAIMessages(system, convo, vision) {
  const out = [];
  if (system) out.push({ role: 'system', content: String(system) });
  for (const m of convo || []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (typeof m.content === 'string') { if (m.content) out.push({ role: m.role, content: m.content }); continue; }
    if (!Array.isArray(m.content)) continue;
    const texts = [];
    const images = [];
    for (const b of m.content) {
      if (b && b.type === 'image' && b.source && b.source.type === 'base64' && b.source.data) {
        images.push('data:' + (b.source.media_type || 'image/jpeg') + ';base64,' + b.source.data);
      } else {
        const t = blockText(b);
        if (t) texts.push(t);
      }
    }
    const text = texts.join('\n').trim();
    if (m.role === 'user' && images.length && vision) {
      const parts = [];
      if (text) parts.push({ type: 'text', text });
      for (const u of images) parts.push({ type: 'image_url', image_url: { url: u } });
      out.push({ role: 'user', content: parts });
    } else {
      const note = images.length ? (text ? text + '\n' : '') + '[صورة مرفقة — قراءة الصور في النسخة الاحترافية]' : text;
      if (note) out.push({ role: m.role, content: note });
    }
  }
  // OpenAI-compatible providers reject a conversation that ends with the assistant.
  while (out.length && out[out.length - 1].role === 'assistant') out.pop();
  return out;
}

// خطأ HTTP يحمل الحالة والجسم كي يميّز المستدعي «النموذج غير موجود» عن الباقي.
function httpError(spec, model, status, body) {
  const e = new Error('free-chain ' + spec.id + ' http ' + status + ' ' + String(body || '').slice(0, 160));
  e.status = status;
  e.body = String(body || '');
  e.model = model;
  return e;
}

// «النموذج غير موجود/غير متاح لهذه الطبقة» → جرّب المرشّح التالي عند المزوّد نفسه.
function isModelError(e) {
  if (!e || !e.status) return false;
  if (e.status === 404) return true;
  if (e.status === 400 || e.status === 403) return /model|tier_not_allowed|not available|no longer available|does not exist/i.test(e.body || '');
  return false;
}

// يبثّ من مزوّد واحد بنموذج واحد. يرجع النصّ المرسَل، أو يرمي عند أي عطل قبل أول حرف.
async function streamOne(spec, model, messages, send, opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 60000);
  let text = '';
  try {
    const r = await fetchImpl(spec.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + spec.key },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens || 4000, temperature: 0.7, stream: true }),
      signal: ctrl.signal,
    });
    if (!r.ok || !r.body) {
      const errText = r && r.text ? await r.text().catch(() => '') : '';
      throw httpError(spec, model, r && r.status, errText);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
        const d = ev.choices && ev.choices[0] && ev.choices[0].delta && ev.choices[0].delta.content;
        if (d) { text += d; send({ delta: d }); }
      }
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// استكشاف نموذج متاح من قائمة /models عند المزوّد: أوّل مرشّح من القائمة موجود
// فيها، وإلا أوّل معرّف يطابق مرشّح الانتقاء (pick). يرجع null عند التعذّر.
async function discoverModel(spec, opts) {
  if (!spec.modelsUrl) return null;
  const fetchImpl = opts.fetchImpl || fetch;
  try {
    const r = await fetchImpl(spec.modelsUrl, {
      headers: { 'Authorization': 'Bearer ' + spec.key },
      signal: AbortSignal.timeout(opts.discoverMs || 8000),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const list = (j && Array.isArray(j.data) ? j.data : Array.isArray(j) ? j : []).map((m) => String((m && (m.id || m.name)) || '')).filter(Boolean);
    if (!list.length) return null;
    const norm = (s) => s.replace(/^models\//, '');
    const ids = list.map(norm);
    for (const c of spec.models) if (ids.includes(norm(c))) return norm(c);
    if (spec.pick) {
      const hit = ids.find((id) => spec.pick.test(id));
      if (hit) return hit;
    }
  } catch (e) { /* الاستكشاف تحسين لا شرط */ }
  return null;
}

// النموذج الذي نجح آخر مرة عند كل مزوّد (ذاكرة العملية) — يُجرَّب أولًا.
const MODEL_CACHE_MS = 6 * 3600000;
const workingModel = new Map();

function candidateModels(spec, now) {
  const hit = workingModel.get(spec.id);
  const cached = hit && now - hit.at < MODEL_CACHE_MS ? hit.model : null;
  return (cached ? [cached] : []).concat(spec.models.filter((m) => m !== cached));
}

// يجرّب السلسلة بالترتيب. {ok:true, provider, model, text} عند أوّل نجاح؛ وإن فشل
// مزوّد بعد أن بثّ نصًّا جزئيًّا لا ننتقل (لئلّا يتكرّر الردّ) بل نرجع ما وصل.
async function streamFreeChain(args) {
  const chain = freeChain(args.env || process.env);
  const log = args.log || ((m) => { try { console.warn('[free-chain] ' + m); } catch (e) { /* لا شيء */ } });
  const now = typeof args.now === 'number' ? args.now : Date.now();
  const system = String(args.system || '') + FREE_NOTE;
  let attempts = 0;
  // أسباب الفشل (بلا مفاتيح) — تُعاد للمستدعي ليسجّلها ويبثّها كتشخيص للمالك.
  const errors = [];
  if (!chain.length) errors.push('no-provider-keys');
  const scrub = (s) => String(s || '').replace(/[A-Za-z0-9_-]{24,}/g, '…').replace(/\s+/g, ' ').slice(0, 160);
  for (const spec of chain) {
    attempts++;
    const messages = toOpenAIMessages(system, args.convo, spec.vision);
    if (!messages.some((m) => m.role === 'user')) return { ok: false, provider: null, model: null, text: '', attempts, errors: ['no-user-message'] };
    let partial = '';
    const send = (ev) => { partial += ev.delta || ''; args.send(ev); };
    const tryModel = async (model) => {
      const text = await streamOne(spec, model, messages, send, args);
      if (text && text.trim()) {
        workingModel.set(spec.id, { model, at: now });
        return { ok: true, provider: spec.id, model, text, attempts, errors };
      }
      errors.push(spec.id + '/' + model + ': empty');
      return null;
    };
    let providerDead = false;
    const models = candidateModels(spec, now);
    const tried = [];
    for (const model of models) {
      try {
        const res = await tryModel(model);
        if (res) return res;
      } catch (e) {
        if (partial.trim()) return { ok: true, provider: spec.id, model, text: partial, attempts, truncated: true, errors };
        if (isModelError(e)) { tried.push(model); errors.push(spec.id + '/' + model + ': ' + scrub(e.message)); continue; }
        log(spec.id + ' failed: ' + scrub(e.message));
        errors.push(spec.id + ': ' + scrub(e.message));
        providerDead = true;
        break;
      }
    }
    if (providerDead) continue;
    // كل المرشّحين «غير موجود» → اسأل المزوّد نفسه عن نماذجه.
    const found = await discoverModel(spec, args);
    if (found && !tried.includes(found)) {
      try {
        const res = await tryModel(found);
        if (res) { log(spec.id + ' discovered model ' + found); return res; }
      } catch (e) {
        if (partial.trim()) return { ok: true, provider: spec.id, model: found, text: partial, attempts, truncated: true, errors };
        errors.push(spec.id + '/' + found + ': ' + scrub(e.message));
      }
    } else if (!found) {
      errors.push(spec.id + ': no usable model in /models');
    }
  }
  return { ok: false, provider: null, model: null, text: '', attempts, errors };
}

module.exports = { streamFreeChain, toOpenAIMessages, streamOne, discoverModel, isModelError, FREE_NOTE, __workingModel: workingModel };
