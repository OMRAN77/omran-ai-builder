// api/_lib/free-chain.js — v-tiers: بثّ ردّ المحادثة للطبقة المجانية عبر سلسلة
// مزوّدات لها طبقة مجانية (Gemini Flash → Groq → Mistral → OpenRouter)، كلّها
// بصيغة OpenAI المتوافقة (chat/completions + SSE) فدالّة بثّ واحدة تكفي.
//
// بلا أدوات: لا بحث حي ولا توليد صور ولا وكيل — تلك للنسخة الاحترافية. الصور المرفقة
// تمرّ للمزوّد الذي يرى فقط، ولا يُستدعى مزوّد أعمى لدور الصورة.
// امتلاء حصة مزوّد (429) أو أي عطل يمرّر الطلب للتالي بصمت؛ فشل الجميع يرجع
// {ok:false, errors} والمستدعي يعرض رسالة «مشغول» لا خطأ تقنيًّا.
//
// v-free-models (المجسّ ١٢ سبتمبر: المزوّدات الأربعة ردّت 404/403 على أسماء
// نماذج قديمة): لكل مزوّد قائمة مرشّحين تُجرَّب بالترتيب، ثم استكشاف من /models،
// والناجح يُحفظ في ذاكرة العملية فلا تتكرّر المحاولات في كل رسالة.
'use strict';

const { freeChain } = require('./tier.js');

// ملاحظة النظام للطبقة المجانية — بلا اسم أي مزوّد (قرار المالك: «بدون اسم كلاود»).
const FREE_NOTE = '\n\n[الوضع المجاني — إلزامي]: أنت «عمران» مساعد التطبيق. في هذا الوضع تردّ نصًّا فقط: لا تملك بحثًا حيًّا ولا توليد صور ولا تشغيل كود، فلا تدّعِ أنك بحثت أو رسمت. ما يأتي في رسالة المستخدم تحت «[قرأ التطبيق هذا المحتوى الآن من …]» قُرئ فعلًا: اقرأه كاملًا وحلّله قبل أن تجيب، واستشهد بما فيه (اسم الملفّ أو السطر أو العبارة) دليلًا على كلامك، ولا تقل إنك لا تستطيع فتح الروابط. إن طلب المستخدم بحثًا حيًّا أو صورة أو بناء تطبيق فأجب بما تعرفه باختصار ثم قل بلطف إن هذه الميزة في النسخة الاحترافية. لا تذكر اسم النموذج أو الشركة المزوّدة أبدًا. أجب بلغة المستخدم ولهجته.'; /* v-plan-models (خريطة الباقات ١٥ أكتوبر، أُعيد إنتاجه محلّيًّا): هذه السلسلة احتياط المشترك وVIP أيضًا حين تسقط مسارات باقته قبل أوّل حرف (chat.js)،    فكانت FREE_NOTE تقول لمن يدفع إنّ البحث والصور «في النسخة الاحترافيّة». له صيغة محايدة: نصّ فقط مؤقّتًا، بلا ترقية ولا ادّعاء. */ const PAID_NOTE = '\n\n[تنبيه — إلزامي]: أنت «عمران» مساعد التطبيق. هذا الردّ نصّيّ فقط لتعذّر الأدوات مؤقّتًا: لا بحث حيّ ولا توليد صور ولا تشغيل كود في هذا الردّ، فلا تدّعِ أنك بحثت أو رسمت. ما يأتي في رسالة المستخدم تحت «[قرأ التطبيق هذا المحتوى الآن من …]» قُرئ فعلًا فحلّله واستشهد به. إن طلب المستخدم بحثًا أو صورة أو بناء فأجب بما تعرفه باختصار ثم قل بلطف إنّ هذه الميزة متعذّرة في هذه اللحظة وإنّه يستطيع إعادة المحاولة بعد قليل.';

function blockText(b) {
  if (!b) return '';
  if (typeof b === 'string') return b;
  if (b.type === 'text') return String(b.text || '');
  if (b.type === 'tool_result') return typeof b.content === 'string' ? b.content : '';
  return '';
}

function validImageSource(b) {
  return b && b.source && b.source.type === 'base64'
    && typeof b.source.data === 'string' && !!b.source.data.trim();
}

function hasUnsupportedImage(convo) {
  return (Array.isArray(convo) ? convo : []).some((m) => m && m.role === 'user' && Array.isArray(m.content)
    && m.content.some((b) => b && b.type === 'image' && !validImageSource(b)));
}

// تحويل محادثة بصيغة Anthropic إلى صيغة OpenAI. المصدر غير المدعوم خطأ صريح لا صورة محذوفة.
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
      if (b && b.type === 'image') {
        if (!validImageSource(b)) throw new Error('unsupported-image-source');
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
  /* v-free-vision-next (تجربة المعاينة ٢٢ أكتوبر: Nemotron بلا حرف ٦٠ ثانية ثمّ «aborted»، والمستخدم ينتظر دقيقة ليرى «ما قدرت أقرأ الصورة»):
     firstTextMs = مهلة أوّل حرف — إن لم يصل نصّ قبلها يُقطع النداء بخطأ slow فيُجرَّب النموذج التالي؛ وreqExtra حقول إضافيّة للطلب. */
  let slow = false;
  const firstTimer = spec.firstTextMs ? setTimeout(() => { slow = true; ctrl.abort(); }, spec.firstTextMs) : null;
  let text = '';
  try {
    const r = await fetchImpl(spec.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + spec.key },
      body: JSON.stringify(Object.assign({ model, messages, max_tokens: opts.maxTokens || 4000, temperature: 0.7, stream: true }, spec.reqExtra || {})),
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
        if (d) { if (firstTimer) clearTimeout(firstTimer); text += d; send({ delta: d }); }
      }
    }
    return text;
  } catch (e) {
    if (slow && !text) { const er = new Error('free-chain ' + spec.id + ' no text in ' + spec.firstTextMs + 'ms'); er.slow = true; er.model = model; throw er; }
    throw e;
  } finally {
    clearTimeout(timer);
    if (firstTimer) clearTimeout(firstTimer);
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
  const hit = workingModel.get(spec.cacheId || spec.id); // v-img-why: نماذج الرؤية لها ذاكرتها — لا يُقدَّم ناجح نصّيّ أعمى لدور صورة
  const cached = hit && now - hit.at < MODEL_CACHE_MS ? hit.model : null;
  return (cached ? [cached] : []).concat(spec.models.filter((m) => m !== cached));
}

// يجرّب السلسلة بالترتيب. {ok:true, provider, model, text} عند أوّل نجاح؛ وإن فشل
// مزوّد بعد أن بثّ نصًّا جزئيًّا لا ننتقل (لئلّا يتكرّر الردّ) بل نرجع ما وصل.
async function streamFreeChain(args) {
  // قبل أيّ طلب شبكة: URL أو كتلة بلا بيانات لا تملك بكسلات نمرّرها إلى المزوّد.
  if (hasUnsupportedImage(args.convo)) return { ok: false, provider: null, model: null, text: '', attempts: 0, errors: ['unsupported-image-source'] };
  const all = freeChain(args.env || process.env);
  // v-img-no-blind (شكوى المالك ١٨ سبتمبر: عند نفاد رصيد المحرّك الاحترافيّ يردّ الاحتياط
  // «الصورة غير واضحة، أرسل لقطة أوضح» على صورة سليمة): مزوّد بلا رؤية يستلم بدل الصورة
  // سطرًا نصّيًّا ثمّ يؤلّف حكمًا عليها. أيّ دور فيه صورة يستبعد المزوّدات
  // العمياء كلّها؛ ولا مزوّد يرى = فشل صريح (no-vision-provider) يقوله المستدعي بصدق.
  const needVision = convoHasImage(args.convo);
  /* v-img-why: مزوّد أعمى له نماذج ترى (visionModels) يدخل دور الصورة بها وحدها، بعد من يرى أصلًا، وبلا استكشاف /models
     (قد يلتقط نموذجًا أعمى). v-free-vision-next: بلا «تفكير» قبل الردّ (reasoning.enabled=false في توثيق الوسيط)، ومهلة أوّل حرف
     FREE_VISION_FIRST_MS (١٥ ثانية) لكلّ نموذج — البطيء يُترك للتالي. Gemini لم يُمسّ. */
  const visionFirstMs = Number((args.env || process.env).FREE_VISION_FIRST_MS) > 0 ? Number((args.env || process.env).FREE_VISION_FIRST_MS) : 15000;
  const chain = needVision
    ? all.filter((s) => s.vision).concat(all.filter((s) => !s.vision && Array.isArray(s.visionModels) && s.visionModels.length)
      .map((s) => Object.assign({}, s, { vision: true, visionOnly: true, models: s.visionModels.slice(), model: s.visionModels[0], cacheId: s.id + ':vision', reqExtra: { reasoning: { enabled: false } }, firstTextMs: visionFirstMs })))
    : all;
  const log = args.log || ((m) => { try { console.warn('[free-chain] ' + m); } catch (e) { /* لا شيء */ } });
  const now = typeof args.now === 'number' ? args.now : Date.now();
  const system = args.raw ? '' : String(args.system || '') + (args.paid ? PAID_NOTE : FREE_NOTE); // v-owner-free: raw للمالك المتحقَّق منه فقط (chat.js)؛ v-plan-models: paid = مشترك/VIP
  let attempts = 0;
  // أسباب الفشل (بلا مفاتيح) — تُعاد للمستدعي ليسجّلها ويبثّها كتشخيص للمالك.
  const errors = [];
  if (!all.length) errors.push('no-provider-keys');
  else if (!chain.length) errors.push('no-vision-provider');
  const scrub = (s) => String(s || '').replace(/[A-Za-z0-9_-]{24,}/g, '…').replace(/\s+/g, ' ').slice(0, 160);
  // v-free-vision-next: سبب الفشل كاملًا لسجلّ الخادم (المقصوص عند ١٦٠ حرفًا أخفى سبب Gemma 26B) — جسم الردّ بلا مفاتيح.
  const detail = (e) => String(e && e.status ? 'http ' + e.status + ' ' + (e.body || '') : (e && e.message) || e).replace(/[A-Za-z0-9_-]{24,}/g, '…').replace(/\s+/g, ' ').slice(0, 800);
  for (const spec of chain) {
    attempts++;
    const messages = toOpenAIMessages(system, args.convo, spec.vision);
    if (!messages.some((m) => m.role === 'user')) return { ok: false, provider: null, model: null, text: '', attempts, errors: ['no-user-message'] };
    let partial = '';
    const send = (ev) => { partial += ev.delta || ''; args.send(ev); };
    const tryModel = async (model) => {
      const text = await streamOne(spec, model, messages, send, args);
      if (text && text.trim()) {
        workingModel.set(spec.cacheId || spec.id, { model, at: now });
        if (needVision) log('vision ' + spec.id + '/' + model + (errors.length ? ' after ' + errors.join(' | ') : '')); // v-free-vision-next: النجاح كان صامتًا — من قرأ الصورة ومن زحم قبله، في سجلّ الخادم وحده
        return { ok: true, provider: spec.id, model, text, attempts, errors };
      }
      errors.push(spec.id + '/' + model + ': empty');
      return null;
    };
    let providerDead = false, busyN = 0;
    const models = candidateModels(spec, now);
    const tried = [];
    for (const model of models) {
      try {
        const res = await tryModel(model);
        if (res) return res;
      } catch (e) {
        if (partial.trim()) return { ok: true, provider: spec.id, model, text: partial, attempts, truncated: true, errors };
        if (needVision) log(spec.id + '/' + model + ' ' + detail(e)); // v-free-vision-next: كلّ محاولة فاشلة في دور الصورة بسببها كاملًا
        if (isModelError(e)) { tried.push(model); errors.push(spec.id + '/' + model + ': ' + scrub(e.message)); continue; } if ((spec.id === 'groq' && (e.status === 429 || e.status === 413)) || (spec.visionOnly && ((e.status === 429 && !/free-models-per-/i.test(e.body || '')) || e.slow))) { busyN++; tried.push(model); errors.push(spec.id + '/' + model + ': ' + scrub(e.message)); continue; } // v-plan-models: حدود Groq لكلّ موديل — المزدحم يجرّب التالي قبل الخروج من Groq؛ v-free-vision-next: ونماذج الرؤية المجّانيّة في الوسيط كذلك (429 «rate-limited upstream» زحمة نموذج واحد)، إلّا حدّ الحساب نفسه (free-models-per-day/min) فلا فائدة من التالي
        if (!needVision) log(spec.id + ' failed: ' + scrub(e.message)); // دور الصورة سجّله كاملًا أعلاه
        errors.push(spec.id + ': ' + scrub(e.message));
        providerDead = true;
        break;
      }
    }
    if (providerDead || (busyN && busyN === tried.length)) continue; // v-plan-models: كلّها مزدحمة — لا استكشاف
    if (spec.visionOnly) { errors.push(spec.id + ': no vision model answered'); continue; } // v-img-why: لا استكشاف قد يلتقط أعمى
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

// آخر دور للمستخدم يحمل صورة؟ (كتلة image بصيغة Anthropic)
function convoHasImage(convo) {
  const last = (Array.isArray(convo) ? convo : []).slice().reverse().find((m) => m && m.role === 'user');
  return !!(last && Array.isArray(last.content) && last.content.some((b) => b && b.type === 'image'));
}

// ─── مساعدات مشتركة لبقية الخادم (groq.js, memory.js, stt.js, live-deps.js, agent.js) ───
// أسماء متقاعدة يرسلها عميل قديم أو إعداد محفوظ — تُستبدل بالمرشّحين الحاليين.
const RETIRED_MODELS = new Set(['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama3-70b-8192', 'mixtral-8x7b-32768', 'gemini-2.5-flash', 'gemini-1.5-flash', 'mistral-large-latest']);

// مواصفة مزوّد بمفتاح صريح (لا من البيئة بالضرورة) — نفس شكل عناصر freeChain().
function providerSpec(id, key, env) {
  const { FREE_PROVIDER_SPECS } = require('./tier.js');
  const spec = FREE_PROVIDER_SPECS[id];
  if (!spec) return null;
  const e = env || process.env;
  const pref = e[spec.modelVar] && String(e[spec.modelVar]).trim();
  const models = (pref ? [pref] : []).concat(spec.models.filter((m) => m !== pref));
  return { id, name: spec.name, url: spec.url, modelsUrl: spec.modelsUrl, key: key || e[spec.keyVar] || '', model: models[0], models, pick: spec.pick, vision: !!spec.vision };
}

// النماذج التي تُجرَّب بالترتيب: المفضّل (إن لم يكن متقاعدًا) ثم الناجح المحفوظ ثم المرشّحون.
function modelsToTry(spec, preferred, now) {
  const list = candidateModels(spec, typeof now === 'number' ? now : Date.now());
  const p = typeof preferred === 'string' ? preferred.trim() : '';
  if (p && !RETIRED_MODELS.has(p) && !list.includes(p)) list.unshift(p);
  return list;
}

function rememberWorking(id, model, now) { if (id && model) workingModel.set(id, { model, at: typeof now === 'number' ? now : Date.now() }); }
function isModelErrorStatus(status, body) { return isModelError({ status, body: String(body || '') }); }
function defaultModel(id, env) { const spec = providerSpec(id, '', env); return spec ? modelsToTry(spec, '')[0] : ''; }

// إكمال غير متدفّق (JSON) بمرشّحين: {ok:true, json, model} أو {ok:false, status, body, model}.
async function completeJson(id, opts) {
  const o = opts || {};
  const spec = providerSpec(id, o.key, o.env);
  if (!spec || !spec.key) return { ok: false, status: 0, body: 'no-key', model: null };
  const fetchImpl = o.fetchImpl || fetch;
  const now = typeof o.now === 'number' ? o.now : Date.now();
  const models = modelsToTry(spec, o.model, now);
  let last = { ok: false, status: 0, body: '', model: null };
  const tryOne = async (model) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeoutMs || 20000);
    try {
      const r = await fetchImpl(spec.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + spec.key },
        body: JSON.stringify(Object.assign({ model, messages: o.messages, temperature: typeof o.temperature === 'number' ? o.temperature : 0.2, max_tokens: o.max_tokens || 1024 }, o.extra || {})),
        signal: ctrl.signal,
      });
      if (r.ok) {
        const json = await r.json().catch(() => null);
        rememberWorking(id, model, now);
        return { ok: true, json, model };
      }
      const body = await r.text().catch(() => '');
      return { ok: false, status: r.status, body, model };
    } finally { clearTimeout(timer); }
  };
  let busy = 0;
  for (const model of models) {
    last = await tryOne(model);
    if (last.ok) return last;
    if (id === 'groq' && (last.status === 429 || last.status === 413)) { busy++; continue; } // v-plan-models: حدود Groq لكلّ موديل (الذاكرة وتيليجرام والأسهم)
    if (!isModelErrorStatus(last.status, last.body)) return last;
  }
  if (busy) return last; // مزدحمة — لا استكشاف /models
  const found = await discoverModel(spec, o);
  if (found && !models.includes(found)) last = await tryOne(found);
  return last;
}

// v-cheap-lanes (أمر المالك ١٨ سبتمبر «وزّع المهام بالاشتراكات الأقلّ»): إكمال غير متدفّق على
// السلسلة الرخيصة بترتيبها (Gemini → Groq → Mistral → OpenRouter) للمسارات العامّة التي كانت
// تضرب مفتاح المحرّك الاحترافيّ بلا اشتراك (تيليجرام، الأسهم). {ok:true, text, provider, model}
// عند أوّل نصّ، وإلّا {ok:false, errors} فيقرّر المستدعي احتياطه.
async function completeFreeChain(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const errors = [];
  for (const spec of freeChain(env)) {
    if (o.requireVision && !spec.vision) continue;
    let r;
    try { r = await completeJson(spec.id, { env, messages: o.messages, max_tokens: o.max_tokens || 1500, temperature: typeof o.temperature === 'number' ? o.temperature : 0.5, timeoutMs: o.timeoutMs, fetchImpl: o.fetchImpl, now: o.now }); }
    catch (e) { errors.push(spec.id + ': ' + String((e && e.message) || e).slice(0, 120)); continue; }
    const text = r && r.ok && r.json && r.json.choices && r.json.choices[0] && r.json.choices[0].message && String(r.json.choices[0].message.content || '').trim();
    /* v-write-fix: «accept» اختياريّ — نصّ لا يقبله المستدعي (JSON مقطوع لأنّ موديلًا مفكّرًا صرف ميزانيّته في التفكير)
       لا يوقف السلسلة؛ يُسجَّل «rejected» ويُجرَّب المزوّد التالي بدل أن يرجع للمستخدم «تعذّرت الكتابة». */
    if (text && (typeof o.accept !== 'function' || o.accept(text))) return { ok: true, text, provider: spec.id, model: r.model, errors };
    if (text) { errors.push(spec.id + ': rejected (' + String((r.json.choices[0].finish_reason) || '?') + ', ' + text.length + ' chars)'); continue; }
    errors.push(spec.id + ': ' + (r && r.ok ? 'empty' : ('http ' + (r && r.status) + ' ' + String((r && r.body) || '').replace(/[A-Za-z0-9_-]{24,}/g, '…').slice(0, 120))));
  }
  return { ok: false, text: '', provider: null, model: null, errors };
}

module.exports = { streamFreeChain, completeFreeChain, toOpenAIMessages, convoHasImage, streamOne, discoverModel, isModelError, isModelErrorStatus, providerSpec, modelsToTry, rememberWorking, defaultModel, completeJson, RETIRED_MODELS, FREE_NOTE, __workingModel: workingModel };
