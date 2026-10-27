'use strict';
/* v-owner-direct (أمر المالك ٢٢ سبتمبر «اربط Groq مباشرة بمفتاحه… وGPT»): Groq وGPT في المحادثة كانا يمرّان
   بوسيط OpenRouter بمعرّف موديل Meta (Groq كان اسمًا فقط — الوسيط يختار من يشغّل Llama). للمالك الآن:
   مفتاح المزوّد نفسه (GROQ_API_KEY / OPENAI_API_KEY) على عنوانه الرسميّ بصيغة chat/completions.
   حلقة الأدوات في chat.js تتكلّم بروتوكول أنثروبيك (أحداث content_block_* و tool_use)، فهذا الملفّ جسر
   في الاتّجاهين: يحوّل جسم الطلب إلى صيغة OpenAI، ويحوّل بثّ الردّ إلى أحداث أنثروبيك — فلا يتغيّر في
   الحلقة شيء غير دالّة الإرسال. المفتاح يُقرأ عند النداء لا في نطاق الوحدة (بيئة عارية عند التحميل). */
const { rememberWorking, isModelErrorStatus } = require('./free-chain.js');

/* v-oa-responses (لقطة «فحص النظام» ٢٣ سبتمبر: «Function tools with reasoning_effort are not supported for
   gpt-5.6-terra in /v1/chat/completions» ×8): موديلات GPT الجديدة تفكّر افتراضيًّا، ولا تقبل الأدوات مع التفكير إلّا في
   /v1/responses — وأغلب أسئلة المحادثة تحمل الأدوات، فكان كلّ سؤال للمالك على GPT يسقط 400 ثمّ يهبط للوسيط (رصيده
   نفد: 402) ثمّ للسلسلة المجّانيّة. قرار المالك (v-owner-reason) أن يفكّر الموديل كما في تطبيقه الأصليّ، فلا إطفاء
   للتفكير: OpenAI يذهب إلى /v1/responses، ويبقى chat/completions احتياطًا إن رفض responses الطلب لسبب غير الموديل. */
const DIRECT = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', keyVar: 'GROQ_API_KEY', label: 'Groq' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', responses: 'https://api.openai.com/v1/responses', keyVar: 'OPENAI_API_KEY', label: 'OpenAI' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', keyVar: 'GEMINI_API_KEY', label: 'Gemini' }, // v-plus-haiku: احتياط باقة ١٠$
  /* v-kimi (أمر المالك ٣ أكتوبر «اريد إضافة kimi مزود جديد المفتاح موجود»): Moonshot بصيغة OpenAI (chat/completions + أدوات).
     اسم المتغيّر غير معروف لنا فيُقبل الشائعان: KIMI_API_KEY ثمّ MOONSHOT_API_KEY. */
  kimi: { url: 'https://api.moonshot.ai/v1/chat/completions', keyVar: 'KIMI_API_KEY', altKeyVars: ['MOONSHOT_API_KEY'], label: 'Kimi' },
  /* v-pplx-agent (المالك ١٥ أكتوبر «ابدا في Perplexity» بعد «اريدهم كل المزودين»): Sonar chat/completions تقاعد ٢٧ سبتمبر ٢٠٢٦،
     وبديله Agent API بصيغة OpenAI Responses (/v1/responses) بأدوات دوالّ أصليّة (function_call ↔ function_call_output بـcall_id) —
     المسار نفسه الذي يمرّ به GPT هنا، بلا بروتوكول نصّيّ. للمالك وحده (chat.js). لا احتياط chat/completions (تقاعد). */
  perplexity: { url: 'https://api.perplexity.ai/v1/responses', responses: 'https://api.perplexity.ai/v1/responses', keyVar: 'PERPLEXITY_API_KEY', label: 'Perplexity', noFallback: true },
};
const PPLX_NO_TOOLS = '[هذا الدور بلا أدوات: الموديل على واجهة Perplexity لم يقبل أدوات الدوالّ. أجب ممّا تعرفه، ولا تدّعِ قراءة ملفّ ولا تعديلًا ولا رفعًا؛ وإن طلب المالك تعديلًا على تطبيقه فقل له في سطر إنّ أدوات التعديل لم تُقبل على هذا الموديل.]'; // v-pplx-agent
/* v-pplx-names (لقطة المالك ١٥ أكتوبر، Perplexity Sonar: «أدوات قراءة المستودع وتعديله غير متاحة في هذه المحادثة»): واجهة Perplexity تحجز
   أسماء أدواتها المدمجة فترفض الطلب كلّه بـ400 «invalid tools in request: custom function name "web_search" is reserved»، وv-pplx-agent يعيده
   بلا أدوات — فلا قراءة ولا تعديل. على السلك وحده: الاسم المحجوز ← app_<الاسم> في الأدوات وفي نداءات التاريخ، ويعود إلى أصله في البثّ
   قبل أن تراه الحلقة. باقي الأسماء كما هي. */
// من دليل Perplexity الرسميّ للترحيل (api-platform-developers: integration-styles.md «RESERVED NAMES») ومن رفض حيّ موثَّق (search_files).
// «وقد تُحجز أسماء أخرى» — فاسم يرفضه لاحقًا يُضاف هنا تلقائيًّا (pplxReservedIn) ويُعاد الطلب بأدواته مرّة.
const PPLX_RESERVED = new Set(['web_search', 'search_web', 'people_search', 'search_people', 'fetch_url', 'finance_search', 'sandbox', 'image_search', 'search_files']);
const PPLX_PREFIX = 'app_';
const pplxOut = (n) => (PPLX_RESERVED.has(n) ? PPLX_PREFIX + n : n);
const pplxBack = (n) => (n.indexOf(PPLX_PREFIX) === 0 && PPLX_RESERVED.has(n.slice(PPLX_PREFIX.length)) ? n.slice(PPLX_PREFIX.length) : n);
// اسم أداة من رفض «custom function name "X" is reserved» (رسالة JSON أو نصّ خام بعلامات مهرَّبة)، إن كان من أدوات هذا الطلب.
function pplxReservedIn(text, rb) {
  let m = '';
  try { const j = JSON.parse(text); m = String((j && j.error && (j.error.message || j.error)) || (j && j.message) || ''); } catch (e) { m = String(text || '').replace(/\\"/g, '"'); }
  const hit = /custom function name "([^"]+)" is reserved/i.exec(m);
  const n = hit ? hit[1] : '';
  return n && Array.isArray(rb.tools) && rb.tools.some((t) => t && t.name === n) && !PPLX_RESERVED.has(n) ? n : '';
}
function pplxWire(rb) {
  if (Array.isArray(rb.tools)) rb.tools = rb.tools.map((t) => (t && t.type === 'function' ? Object.assign({}, t, { name: pplxOut(String(t.name || '')) }) : t));
  if (Array.isArray(rb.input)) rb.input = rb.input.map((it) => (it && it.type === 'function_call' ? Object.assign({}, it, { name: pplxOut(String(it.name || '')) }) : it));
  if (rb.tool_choice && rb.tool_choice.type === 'function' && rb.tool_choice.name) rb.tool_choice = Object.assign({}, rb.tool_choice, { name: pplxOut(String(rb.tool_choice.name)) });
  // التعليمات تسمّي الأداة باسمها الأصليّ (web_search…) — سطر واحد يربطه باسم السلك فلا ينادي الموديل اسمًا غير معلَن
  const ren = (rb.tools || []).map((t) => String((t && t.name) || '')).filter((n) => pplxBack(n) !== n).map((n) => pplxBack(n) + ' ← ' + n);
  const note = ren.length ? '[أسماء الأدوات على هذه الواجهة: ' + ren.join('، ') + ']' : '';
  if (note && String(rb.instructions || '').indexOf(note) === -1) rb.instructions = (rb.instructions ? rb.instructions + '\n\n' : '') + note;
  return rb;
}

// مسار مباشر لهذا المزوّد إن كان مفتاحه في البيئة، وإلّا null (يبقى على الوسيط كما كان).
function directRoute(prov, env) {
  const d = DIRECT[String(prov || '').toLowerCase()];
  const e = env || process.env;
  if (!d) return null;
  const key = [d.keyVar].concat(d.altKeyVars || []).map((v) => String(e[v] || '').trim()).find(Boolean) || '';
  if (!key) return null;
  const r = { prov: String(prov).toLowerCase(), url: d.url, key, label: d.label };
  if (d.responses) r.responsesUrl = d.responses;
  if (d.noFallback) r.noFallback = true; // v-pplx-agent
  return r;
}

// الموديل على المسار المباشر: اختيار المالك (معرّف المزوّد نفسه، أو معرّف الوسيط بعد قصّ بادئة الشركة لـOpenAI)،
// وإلّا الافتراضيّ (CHAT_OPENAI_MODEL / CHAT_GROQ_MODEL تغيّرانه بلا نشر).
const DIRECT_ID_RE = /^[a-z0-9][a-z0-9._:\/-]{0,99}$/i;
function directModel(prov, requested, env) {
  const e = env || process.env;
  let id = String(requested || '').trim();
  if (prov === 'openai') {
    if (/^openai\//i.test(id)) id = id.slice(7);
    const def = String(e.CHAT_OPENAI_MODEL || '').trim() || 'gpt-6-sol';
    return (id && DIRECT_ID_RE.test(id) && id.indexOf('/') === -1) ? { model: id, picked: true, def } : { model: def, picked: false, def };
  }
  if (prov === 'gemini') { // v-gemini-direct: اختيار المالك google/gemini-… → معرّف Google؛ بلا اختيار = flash-latest
    if (/^google\//i.test(id)) id = id.slice(7);
    if (/^models\//i.test(id)) id = id.slice(7);
    const def = String(e.CHAT_GEMINI_MODEL || '').trim() || 'gemini-flash-latest';
    return (id && /^gemini-[a-z0-9._-]{1,80}$/i.test(id)) ? { model: id, picked: true, def } : { model: def, picked: false, def };
  }
  if (prov === 'perplexity') { // v-pplx-agent: معرّفات الـAgent API (perplexity/sonar)؛ معرّفات Sonar القديمة (sonar، sonar-pro…) يرفضها فتُترك للافتراضيّ
    const def = String(e.CHAT_PERPLEXITY_MODEL || '').trim() || 'perplexity/sonar';
    return (id && /^perplexity\/[a-z0-9._-]{1,60}$/i.test(id)) ? { model: id, picked: true, def } : { model: def, picked: false, def };
  }
  if (prov === 'kimi') { // v-kimi: معرّفات Moonshot نفسها (kimi-k3، kimi-k2.6…)؛ بادئة الوسيط moonshotai/ تُقصّ
    if (/^moonshotai\//i.test(id)) id = id.slice(11);
    const def = String(e.CHAT_KIMI_MODEL || '').trim() || 'kimi-k3';
    return (id && /^(?:kimi|moonshot)-[a-z0-9._-]{1,60}$/i.test(id)) ? { model: id, picked: true, def } : { model: def, picked: false, def };
  }
  // افتراضيّ السهم «Llama 4 Maverick» معرّف الوسيط؛ عند Groq اسمه الكامل. تعطّله = مرشّحو السلسلة (directFetch).
  const def = String(e.CHAT_GROQ_MODEL || '').trim() || GROQ_ALIAS['meta-llama/llama-4-maverick'];
  const a = GROQ_ALIAS[id] || id;
  if (!a || a === def || !DIRECT_ID_RE.test(a)) return { model: def, picked: false, def };
  return { model: a, picked: true, def };
}
// v-models-latest: Groq أوقف Llama 4 Maverick (٩ مارس ٢٠٢٦) وScout (١٧ يوليو) وبديلهما الرسميّ gpt-oss —
// فمعرّف السهم الافتراضيّ يُترجم له مباشرةً بدل محاولة ضائعة على موديل ميّت ثمّ السلسلة.
const GROQ_ALIAS = {
  'meta-llama/llama-4-maverick': 'openai/gpt-oss-120b',
  'meta-llama/llama-4-scout': 'openai/gpt-oss-20b',
};

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (b && b.type === 'text') ? String(b.text || '') : '').filter(Boolean).join('\n');
}

/* v-pro-lanes (لقطة مشترك Pro ٧٥ ١٦ أكتوبر: «أسعار السياكل» ← «ما قدرت أجيب أسعار» بلا بحث): Gemini 3 على عنوان Google المتوافق
   يُلحق بأوّل نداء أداة في الخطوة توقيع تفكير (tool_calls[i].extra_content.google.thought_signature) ويرفض الخطوة التالية بـ400
   «Function call is missing a thought_signature» إن لم يعد كما وصل — كان يُسقط فيفشل كلّ دور بحث عند الخطوة الثانية. التوقيعات
   تُحفظ لكلّ دور في sigs (من chat.js) بمعرّف النداء وموديله، وتعود كما هي؛ نداء بلا توقيع منه (موديل آخر في الدور نفسه أو موديل
   Gemini غيره) يأخذ القيمة البديلة الموثّقة لنداءات لم يولّدها Gemini 3. وGemini يقبل enum نصوصًا فقط (enum أرقام = 400 قبل أوّل حرف):
   القيم تنتقل إلى الوصف. */
const GEM_SKIP_SIG = 'skip_thought_signature_validator';
function gemSigOf(tc) { const g = tc && tc.extra_content && tc.extra_content.google; return (g && typeof g.thought_signature === 'string') ? g.thought_signature : ''; }
function gemSchema(s) {
  if (Array.isArray(s)) return s.map(gemSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const k of Object.keys(s)) out[k] = (k === 'enum' || k === 'required') ? s[k] : gemSchema(s[k]);
  if (Array.isArray(out.enum) && out.enum.some((v) => typeof v !== 'string')) {
    out.description = (out.description ? out.description + ' ' : '') + '(' + out.enum.join(', ') + ')';
    delete out.enum;
  }
  return out;
}

// جسم أنثروبيك ← جسم chat/completions. الكاش والتفكير وإعدادات الجهد لا مقابل لها فتُسقط.
function toOpenAIBody(ab, prov, sigs) {
  const messages = [];
  const sys = textOf(ab.system);
  if (sys) messages.push({ role: 'system', content: sys });
  for (const m of ab.messages || []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (typeof m.content === 'string') { if (m.content) messages.push({ role: m.role, content: m.content }); continue; }
    if (!Array.isArray(m.content)) continue;
    if (m.role === 'assistant') {
      const text = textOf(m.content);
      const calls = m.content.filter((b) => b && b.type === 'tool_use').map((b) => ({
        id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
      }));
      if (prov === 'gemini' && calls.length) { // v-pro-lanes: التوقيع كما وصل من الموديل نفسه، وإلّا البديل على أوّل نداء
        for (const c of calls) { const g = sigs && sigs.get(c.id); if (g && g.sig && g.model === ab.model) c.extra_content = { google: { thought_signature: g.sig } }; }
        if (!calls[0].extra_content) calls[0].extra_content = { google: { thought_signature: GEM_SKIP_SIG } };
      }
      const out = { role: 'assistant', content: text || null };
      if (calls.length) out.tool_calls = calls;
      if (text || calls.length) messages.push(out);
      continue;
    }
    // المستخدم: نتائج الأدوات رسائل tool مستقلّة تلي نداءها مباشرةً، ثمّ النصّ والصور.
    for (const b of m.content) {
      if (b && b.type === 'tool_result') {
        const c = typeof b.content === 'string' ? b.content : textOf(b.content);
        messages.push({ role: 'tool', tool_call_id: b.tool_use_id, content: c || (b.is_error ? 'error' : 'ok') });
      }
    }
    const parts = [];
    for (const b of m.content) {
      if (!b) continue;
      if (b.type === 'text' && b.text) parts.push({ type: 'text', text: String(b.text) });
      else if (b.type === 'image' && b.source && b.source.type === 'base64' && b.source.data) {
        parts.push({ type: 'image_url', image_url: { url: 'data:' + (b.source.media_type || 'image/jpeg') + ';base64,' + b.source.data } });
      }
    }
    if (parts.length) messages.push({ role: 'user', content: parts.every((p) => p.type === 'text') ? parts.map((p) => p.text).join('\n') : parts });
  }
  const body = { model: ab.model, messages, stream: true };
  if (ab.max_tokens) body.max_completion_tokens = ab.max_tokens;
  // v-kimi-feed: Moonshot يحترم include_usage مثل OpenAI (قطعة الاستهلاك قبل [DONE])؛ والسقف يبقى
  // max_completion_tokens لأنّ وثائق Moonshot تعدّ max_tokens مهجورًا — وشبكة أمان الـ400 أدناه معلّقة به.
  if (prov === 'openai' || prov === 'kimi') body.stream_options = { include_usage: true };
  if (Array.isArray(ab.tools) && ab.tools.length) {
    body.tools = ab.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } } }));
    if (prov === 'gemini') for (const t of body.tools) t.function.parameters = gemSchema(t.function.parameters); // v-pro-lanes
    if (ab.tool_choice && ab.tool_choice.type === 'none' && prov !== 'groq') body.tool_choice = 'none'; // v-claude-code-level C1: الجواب الختاميّ بلا أدوات، والقائمة كما هي · v-groq-final: Groq يفرض none برفض التوليد (tool_use_failed) وgpt-oss يستدعي رغمه — يكفيه FINAL_NOTE
  }
  return body;
}

// v-oa-responses: جسم أنثروبيك ← جسم /v1/responses. النظام ← instructions؛ الرسائل ← عناصر input؛ نداء الأداة
// ← function_call ونتيجتها ← function_call_output بنفس call_id (بلا معرّفات fc_/rs_: لا يُطلب معها عنصر التفكير)؛
// الأدوات مسطّحة وstrict:false (الافتراضيّ هنا صارم ومخطّطاتنا غير صارمة)؛ store:false فلا تُحفظ محادثة المالك عند
// المزوّد؛ ولا reasoning: الموديل يفكّر بإعداده الافتراضيّ كما في تطبيقه — إلّا دور المالك العاديّ (v-owner-auto أدناه).
// الكاش والتفكير تُسقط؛ output_config.effort لا يصل إلّا من جهد المالك المختار لـGPT (v-owner-gpt-all) ← reasoning.effort.
function toResponsesBody(ab) {
  const input = [];
  for (const m of ab.messages || []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (typeof m.content === 'string') { if (m.content) input.push({ role: m.role, content: m.content }); continue; }
    if (!Array.isArray(m.content)) continue;
    if (m.role === 'assistant') {
      const text = textOf(m.content);
      if (text) input.push({ role: 'assistant', content: text });
      for (const b of m.content) {
        if (b && b.type === 'tool_use') input.push({ type: 'function_call', call_id: String(b.id || ''), name: String(b.name || ''), arguments: JSON.stringify(b.input || {}) });
      }
      continue;
    }
    for (const b of m.content) {
      if (b && b.type === 'tool_result') {
        const c = typeof b.content === 'string' ? b.content : textOf(b.content);
        input.push({ type: 'function_call_output', call_id: String(b.tool_use_id || ''), output: c || (b.is_error ? 'error' : 'ok') });
      }
    }
    const parts = [];
    for (const b of m.content) {
      if (!b) continue;
      if (b.type === 'text' && b.text) parts.push({ type: 'input_text', text: String(b.text) });
      else if (b.type === 'image' && b.source && b.source.type === 'base64' && b.source.data) {
        parts.push({ type: 'input_image', image_url: 'data:' + (b.source.media_type || 'image/jpeg') + ';base64,' + b.source.data });
      }
    }
    if (parts.length) input.push({ role: 'user', content: parts.every((p) => p.type === 'input_text') ? parts.map((p) => p.text).join('\n') : parts });
  }
  const body = { model: ab.model, input, stream: true, store: false };
  /* v-owner-auto: دور المالك العاديّ يصل بـthinking:{type:'disabled'} (صيغة أنثروبيك) ← أدنى جهد تفكير يقبله
     الموديل. الأسماء تختلف بين أجيال GPT فالسلّم none → minimal → low، وما رفضه الموديل يُذكَر (quickEffortFor). */
  const qe = (ab.thinking && ab.thinking.type === 'disabled') ? quickEffortFor(ab.model) : '';
  const oe = ab.output_config && ab.output_config.effort; // v-owner-gpt-all: جهد المالك المختار (owner-think.gptEffortFields) يغلب السلّم
  // v-think-talk-all: الملخّص لا يُبثّ إلّا بطلبه. الجهد يبقى كما هو (الافتراضيّ بلا effort). التحيّة (disabled) بلا ملخّص.
  const sum = summaryWanted(ab.model) ? { summary: 'auto' } : null;
  if (oe) body.reasoning = Object.assign({ effort: String(oe) }, sum);
  else if (qe) body.reasoning = { effort: qe };
  else if (sum && !(ab.thinking && ab.thinking.type === 'disabled')) body.reasoning = sum;
  const sys = textOf(ab.system);
  if (sys) body.instructions = sys;
  if (ab.max_tokens) body.max_output_tokens = ab.max_tokens;
  if (Array.isArray(ab.tools) && ab.tools.length) {
    body.tools = ab.tools.map((t) => ({ type: 'function', name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} }, strict: false }));
    if (ab.tool_choice && ab.tool_choice.type === 'none') body.tool_choice = 'none'; // v-claude-code-level C1
  }
  return body;
}

// v-oa-responses: بثّ /v1/responses (أحداث response.*) ← أحداث أنثروبيك بالأسطر نفسها التي تقرؤها الحلقة.
// ملخّص التفكير (reasoning_summary) يُترجم كتلة thinking كي يظهر كلام المزوّد مع نفسه في الفقاعة (v-think-talk-all).
// نصّ التفكير الخام لا يُمرَّر (ليس الملخّص المعروض). وسائط النداء تصل دلتا أو كاملةً عند done — مرّة واحدة.
// رفض البثّ عبر reader.read() يصل إلى catch المحادثة كـ chat error؛ لا تُنهِ رسالةً ناجحةً عند سقوط المزوّد.
function streamProtocolError(reason, detail) {
  const err = new Error('OA_STREAM_PROTOCOL_ERROR: ' + reason + (detail ? ' — ' + String(detail).slice(0, 240) : ''));
  err.code = 'OA_STREAM_PROTOCOL_ERROR';
  return err;
}
function providerStreamError(error) {
  const e = error || {};
  return streamProtocolError('provider error', [e.type, e.code, e.message].filter(Boolean).join(': ') || 'unknown error');
}
function validToolArguments(args) {
  try {
    const input = JSON.parse(args);
    return !!input && typeof input === 'object' && !Array.isArray(input);
  } catch (e) { return false; }
}
function responsesToAnthropicStream(upstreamBody, fallbackModel, nameBack) { // nameBack: أسماء السلك ← أسماء الحلقة (v-pplx-names)
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return new ReadableStream({
    async start(controller) {
      let lastOut = Date.now();
      const emit = (ev) => { lastOut = Date.now(); controller.enqueue(enc.encode('data: ' + JSON.stringify(ev) + '\n\n')); };
      /* v-claude-code-level C5: تفكير المزوّد الصامت (أحداث لا تُترجم) يبقى بايتات عند حارس الصمت في chat.js — تعليق SSE كلّ ٥ ث على الأكثر، لا يصل العميل */
      const alive = () => { if (Date.now() - lastOut > 5000) { lastOut = Date.now(); controller.enqueue(enc.encode(': up\n\n')); } };
      const reader = upstreamBody.getReader();
      let buf = '';
      let started = false;
      let next = 0;
      let textIdx = -1;
      const calls = new Map(); // output_index ← { idx, sent, args, done }
      let stop = null;
      let usage = null;
      let terminal = false;
      const begin = (model) => { if (!started) { started = true; emit({ type: 'message_start', message: { model: model || fallbackModel, usage: { input_tokens: 0, output_tokens: 0 } } }); } };
      let thinkIdx = -1, thinkHad = false;
      const closeThink = () => { if (thinkIdx >= 0) { emit({ type: 'content_block_stop', index: thinkIdx }); thinkIdx = -1; } };
      const pushThink = (text) => {
        const s = typeof text === 'string' ? text : '';
        if (!s) return;
        if (thinkIdx < 0) {
          if (textIdx >= 0) { emit({ type: 'content_block_stop', index: textIdx }); textIdx = -1; }
          thinkIdx = next++;
          emit({ type: 'content_block_start', index: thinkIdx, content_block: { type: 'thinking', thinking: '', signature: '' } });
        }
        emit({ type: 'content_block_delta', index: thinkIdx, delta: { type: 'thinking_delta', thinking: s } });
        thinkHad = true;
      };
      const closeText = () => { if (textIdx >= 0) { emit({ type: 'content_block_stop', index: textIdx }); textIdx = -1; } };
      const openCall = (oi, item) => {
        closeThink();
        closeText();
        const idx = next++;
        const c = { idx, sent: false, args: '', done: false };
        calls.set(oi, c);
        emit({ type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: String(item.call_id || item.id || ('call_' + idx)), name: nameBack ? nameBack(String(item.name || '')) : String(item.name || ''), input: {} } });
        return c;
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          alive();
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let ev;
            try { ev = JSON.parse(payload); } catch (e) { throw streamProtocolError('invalid SSE JSON'); }
            const t = String(ev.type || '');
            if (t === 'error' || t === 'response.failed') throw providerStreamError((ev.response && ev.response.error) || ev.error || ev);
            if (terminal) continue;
            if (t === 'response.created' || t === 'response.in_progress') { begin(ev.response && ev.response.model); continue; }
            begin('');
            if (t === 'response.reasoning_summary_text.delta' && typeof ev.delta === 'string') { pushThink(ev.delta); }
            else if (t === 'response.reasoning_summary_text.done' && !thinkHad && typeof ev.text === 'string') { pushThink(ev.text); }
            else if (t === 'response.output_item.done' && ev.item && ev.item.type === 'reasoning') {
              if (!thinkHad && Array.isArray(ev.item.summary)) for (const p of ev.item.summary) if (p && typeof p.text === 'string') pushThink(p.text);
              closeThink();
            } else if (t === 'response.output_text.delta' && typeof ev.delta === 'string' && ev.delta) {
              closeThink();
              if (textIdx < 0) { textIdx = next++; emit({ type: 'content_block_start', index: textIdx, content_block: { type: 'text', text: '' } }); }
              emit({ type: 'content_block_delta', index: textIdx, delta: { type: 'text_delta', text: ev.delta } });
            } else if (t === 'response.output_item.added' && ev.item && ev.item.type === 'function_call') {
              const c = openCall(ev.output_index, ev.item);
              if (ev.item.arguments) { c.args = String(ev.item.arguments); emit({ type: 'content_block_delta', index: c.idx, delta: { type: 'input_json_delta', partial_json: c.args } }); c.sent = true; }
            } else if (t === 'response.function_call_arguments.delta' && ev.delta) {
              const c = calls.get(ev.output_index);
              if (c) { c.args += String(ev.delta); emit({ type: 'content_block_delta', index: c.idx, delta: { type: 'input_json_delta', partial_json: String(ev.delta) } }); c.sent = true; }
            } else if (t === 'response.output_item.done' && ev.item && ev.item.type === 'function_call') {
              const c = calls.get(ev.output_index) || openCall(ev.output_index, ev.item);
              if (!c.sent && ev.item.arguments) { c.args = String(ev.item.arguments); emit({ type: 'content_block_delta', index: c.idx, delta: { type: 'input_json_delta', partial_json: c.args } }); c.sent = true; }
              c.done = !ev.item.status || ev.item.status === 'completed';
            } else if (t === 'response.output_item.done' && ev.item && ev.item.type === 'message') {
              closeText();
            } else if (t === 'response.completed' || t === 'response.incomplete') {
              const r = ev.response || {};
              if (r.usage) usage = r.usage;
              const why = r.incomplete_details && r.incomplete_details.reason;
              if (t === 'response.incomplete') {
                if (why !== 'max_output_tokens' || calls.size) throw streamProtocolError('response.incomplete', why || 'unknown reason');
                stop = 'max_tokens';
              }
              terminal = true;
            }
          }
        }
        if (!terminal) throw streamProtocolError('stream ended without response terminal event');
        for (const c of calls.values()) {
          if (!c.done || !validToolArguments(c.args)) throw streamProtocolError('incomplete function_call arguments');
        }
        begin('');
        closeThink();
        closeText();
        for (const c of calls.values()) emit({ type: 'content_block_stop', index: c.idx });
        if (usage) {
          const cached = Number(usage.input_tokens_details && usage.input_tokens_details.cached_tokens) || 0;
          emit({ type: 'message_start', message: { usage: { input_tokens: Math.max(0, (Number(usage.input_tokens) || 0) - cached), cache_read_input_tokens: cached } } });
        }
        emit({ type: 'message_delta', delta: { stop_reason: stop || (calls.size ? 'tool_use' : 'end_turn') }, usage: { output_tokens: Number(usage && usage.output_tokens) || 0 } });
        emit({ type: 'message_stop' });
      } catch (e) {
        controller.error(e);
        return;
      }
      controller.close();
    },
  });
}

// v-oa-responses: موديل غير موجود أو لا يملكه المفتاح (نصّ OpenAI المعتاد) — غير ذلك من 404/400 رفضٌ للطلب لا للموديل.
const OA_MODEL_MISSING_RE = /model_not_found|does not exist|do not have access|not have access to (?:the )?model/i;

const STOP = { tool_calls: 'tool_use', function_call: 'tool_use', length: 'max_tokens', content_filter: 'refusal' }; // مراجعة v-pro-lanes: حجب الرقابة رفض لا «ختام فارغ» يُعاد على مسار آخر

// بثّ chat/completions ← بثّ أحداث أنثروبيك بالأسطر نفسها التي تقرؤها الحلقة (data: {...}).
function toAnthropicStream(upstreamBody, fallbackModel, sigs) { // sigs: v-pro-lanes — توقيعات Gemini 3 لهذا الدور (معرّف النداء ← {sig, model})
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return new ReadableStream({
    async start(controller) {
      let lastOut = Date.now();
      const emit = (ev) => { lastOut = Date.now(); controller.enqueue(enc.encode('data: ' + JSON.stringify(ev) + '\n\n')); };
      /* v-claude-code-level C5: تفكير المزوّد الصامت (أحداث لا تُترجم) يبقى بايتات عند حارس الصمت في chat.js — تعليق SSE كلّ ٥ ث على الأكثر، لا يصل العميل */
      const alive = () => { if (Date.now() - lastOut > 5000) { lastOut = Date.now(); controller.enqueue(enc.encode(': up\n\n')); } };
      const reader = upstreamBody.getReader();
      let buf = '';
      let started = false;
      let next = 0;          // فهرس الكتلة التالية
      let textIdx = -1;      // كتلة النصّ المفتوحة
      const toolIdx = new Map(); // فهرس نداء OpenAI ← فهرس كتلة أنثروبيك
      const toolArgs = new Map();
      const toolIds = new Map(); // v-pro-lanes: معرّف كلّ نداء كما بُثّ (مفتاح التوقيع)
      let stop = null;
      let usage = null;
      let doneMarker = false;
      const begin = (model) => { if (!started) { started = true; emit({ type: 'message_start', message: { model: model || fallbackModel, usage: { input_tokens: 0, output_tokens: 0 } } }); } };
      let thinkIdx = -1;
      const closeThink = () => { if (thinkIdx >= 0) { emit({ type: 'content_block_stop', index: thinkIdx }); thinkIdx = -1; } };
      const pushThink = (text) => {
        const s = typeof text === 'string' ? text : '';
        if (!s) return;
        if (thinkIdx < 0) {
          if (textIdx >= 0) { emit({ type: 'content_block_stop', index: textIdx }); textIdx = -1; }
          thinkIdx = next++;
          emit({ type: 'content_block_start', index: thinkIdx, content_block: { type: 'thinking', thinking: '', signature: '' } });
        }
        emit({ type: 'content_block_delta', index: thinkIdx, delta: { type: 'thinking_delta', thinking: s } });
      };
      const reasonPiece = (d) => {
        if (!d || typeof d !== 'object') return '';
        if (Array.isArray(d.reasoning_details) && d.reasoning_details.length) {
          return d.reasoning_details.map((p) => {
            if (!p || p.type === 'reasoning.encrypted') return '';
            if (typeof p.summary === 'string') return p.summary;
            if (typeof p.text === 'string' && p.text !== '[REDACTED]') return p.text;
            return '';
          }).join('');
        }
        if (typeof d.reasoning_content === 'string') return d.reasoning_content;
        if (typeof d.reasoning === 'string') return d.reasoning;
        return '';
      };
      const closeText = () => { closeThink(); if (textIdx >= 0) { emit({ type: 'content_block_stop', index: textIdx }); textIdx = -1; } };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          alive();
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            if (payload === '[DONE]') { doneMarker = true; continue; }
            let ch;
            try { ch = JSON.parse(payload); } catch (e) { throw streamProtocolError('invalid SSE JSON'); }
            if (ch.error || ch.type === 'error') throw providerStreamError(ch.error || ch);
            if (doneMarker) continue;
            begin(ch.model);
            const u = ch.usage || (ch.x_groq && ch.x_groq.usage);
            if (u) usage = u;
            const c = ch.choices && ch.choices[0];
            if (!c) continue;
            const d = c.delta || {};
            const rt = reasonPiece(d) || ((d.reasoning_content == null && d.reasoning == null && !d.reasoning_details && c.message) ? reasonPiece(c.message) : '');
            if (rt) pushThink(rt);
            if (typeof d.content === 'string' && d.content) {
              closeThink();
              if (textIdx < 0) { textIdx = next++; emit({ type: 'content_block_start', index: textIdx, content_block: { type: 'text', text: '' } }); }
              emit({ type: 'content_block_delta', index: textIdx, delta: { type: 'text_delta', text: d.content } });
            }
            for (const tc of (Array.isArray(d.tool_calls) ? d.tool_calls : [])) {
              const k = typeof tc.index === 'number' ? tc.index : toolIdx.size;
              if (!toolIdx.has(k)) {
                closeText();
                const idx = next++;
                toolIdx.set(k, idx);
                toolArgs.set(k, '');
                let id = tc.id || ('call_' + idx);
                if (sigs) { const b = id; for (let n = 2; sigs.has(id); n++) id = b + '_' + n; sigs.set(id, { sig: '', model: fallbackModel }); } // v-pro-lanes: معرّف مكرّر بين الخطوات لا يأخذ توقيع غيره
                toolIds.set(k, id);
                emit({ type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id, name: (tc.function && tc.function.name) || '', input: {} } });
              }
              if (sigs) { const g = gemSigOf(tc); if (g) sigs.get(toolIds.get(k)).sig = g; }
              const args = tc.function && tc.function.arguments;
              if (args) {
                toolArgs.set(k, toolArgs.get(k) + String(args));
                emit({ type: 'content_block_delta', index: toolIdx.get(k), delta: { type: 'input_json_delta', partial_json: String(args) } });
              }
            }
            if (c.finish_reason) stop = STOP[c.finish_reason] || 'end_turn';
          }
        }
        if (!doneMarker || !stop) throw streamProtocolError('stream ended without [DONE] and finish_reason');
        if (stop === 'end_turn' && toolIdx.size) stop = 'tool_use'; // v-pro-lanes: نداءات كاملة مع finish_reason «stop» (عنوان Google المتوافق) نداءات لا جواب فارغ
        if (stop === 'tool_use') {
          for (const args of toolArgs.values()) {
            if (!validToolArguments(args)) throw streamProtocolError('incomplete tool arguments JSON');
          }
        }
        begin('');
        closeText();
        for (const idx of toolIdx.values()) emit({ type: 'content_block_stop', index: idx });
        // عدّاد التوكنات يصل في آخر البثّ عند هذا البروتوكول؛ الحلقة تجمع المدخل من message_start
        // فيُبعث حدث ثانٍ بالمدخل وحده (بلا موديل كي لا يُمسّ اسم الموديل الذي خدم).
        if (usage) {
          const cached = Number(usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || 0;
          emit({ type: 'message_start', message: { usage: { input_tokens: Math.max(0, (Number(usage.prompt_tokens) || 0) - cached), cache_read_input_tokens: cached } } });
        }
        emit({ type: 'message_delta', delta: { stop_reason: stop || (toolIdx.size ? 'tool_use' : 'end_turn') }, usage: { output_tokens: Number(usage && usage.completion_tokens) || 0 } });
        emit({ type: 'message_stop' });
      } catch (e) {
        controller.error(e);
        return;
      }
      controller.close();
    },
  });
}

/* v-groq-tpm (لقطة المالك ١١ أكتوبر: Groq «qwen/qwen3.8-27b» و«مرحبا» → «ما قدرت أردّ الحين — خطأ 413»): مفتاح Groq المجّانيّ حدّه
   ٨ آلاف توكن في الدقيقة للموديل، ويعدّ الطلب = المدخل + سقف الخرج (طلب شبه فارغ بسقف ٣٢ ألفًا يُرفض «Requested 33128»). دور المالك
   وحده ~١١ ألف توكن (نظام ١٨ ألف حرف + ١٦ أداة ١٦ ألف حرف) وسقفه ١٦ ألفًا، فيُرفض 413 قبل أوّل حرف مهما قصرت الرسالة.
   الآن: 413 «tokens per minute» = إعادة واحدة بجسم يتّسع للحدّ الذي ذكره Groq نفسه — (١) السقف وحده إن كفى، (٢) وإلّا بلا أدوات
   مع سطر يقول للموديل ذلك، (٣) وإلّا النظام مقصوصًا (أوّله وهويّته ثمّ ما يتّسع بترتيبه). التقدير من رقم Groq نفسه (توكن/حرف لهذا
   الطلب)، لا تخمين. لا يتّسع حتّى أقصره = يبقى 413 كما هو. المفتاح المدفوع (حدّ أعلى) لا يصل هنا أصلًا. */
const TPM_NOTE = '[هذا الدور بلا أدوات: حدّ مفتاح Groq في الدقيقة لا يتّسع لها مع هذا السياق. أجب ممّا تعرفه، ولا تدّعِ بحثًا ولا قراءة ملفّ ولا تعديلًا؛ وإن طلب عمران شيئًا منها فقل في سطر إنّه يحتاج موديلًا آخر أو مفتاح Groq بحدّ أعلى.]';
/* v-prov-self (٣): «ما أريد كلمة ما أقدر» — في الجسم المقصوص تبقى الأدوات الصغيرة ذات الصلة بالرسالة الأخيرة إن اتّسعت: صورة مرفقة أو رسم ←
   أداتا الصور (نتيجتهما رمز قصير)، وسؤال معلومة ← البحث. أدوات GitHub نتائجها عشرات الآلاف من الحروف فلا تتّسع لحدّ الدقيقة أصلًا. */
const LEAN_IMG_RE = /(?:ارسم|أرسم|ارسمي|رسمة|صور[ةه]|لوحة|شعار|لوجو|بوستر|image|draw|picture|logo|poster)/i;
const LEAN_VID_RE = /(?:فيديو|ڤيديو|مقطع|كليب|حرّ?ك|video|animate)/i; // v-owner-solo-all: طلب فيديو يُبقي أداته إن اتّسعت (كانت تُسقط فيقول «ما أقدر»)
const LEAN_Q_RE = /[؟?]|(?:^|[\s،,])(?:كم|متى|وين|فين|من هو|من هي|ما هو|ما هي|ايش|إيش|شو|وش|أخبار|اخبار|سعر|أسعار|اسعار|طقس|نتيجة|مباراة|who|what|when|where|price|news|weather)(?=$|[\s،,؟?])/i;
const TPM_NOTE_TOOLS = (names) => '[هذا الدور بأدوات محدودة لضيق حدّ مفتاح Groq في الدقيقة: ' + names.join('، ') + ' فقط. استعملها بنفسك حين تلزم؛ وما ليس معك في هذا الدور فلا تدّعِه — قل في سطر إنّه يحتاج رسالة أقصر أو مفتاح Groq بحدّ أعلى.]';
/* v-plan-models (خريطة الباقات ١٥ أكتوبر): الملاحظتان أعلاه للمالك — تسمّيان المزوّد و«عمران» وتأمران الموديل بأن يقول «مفتاح Groq»، وكانتا تُحقنان
   في إعادة المشترك المقصوصة أيضًا (قاعدة المالك: لا اسم مزوّد في نصّ يراه المستخدم). لغير المالك صيغة محايدة بلا اسم ولا وعد. */
const TPM_NOTE_USER = '[هذا الدور بلا أدوات لضيق السياق المتاح الآن. أجب ممّا تعرفه، ولا تدّعِ بحثًا ولا قراءة ملفّ ولا تعديلًا؛ وإن طُلب شيء منها فقل في سطر إنّه غير متاح في هذه اللحظة ويمكن إعادة المحاولة بعد قليل.]';
const TPM_NOTE_TOOLS_USER = (names) => '[هذا الدور بأدوات محدودة لضيق السياق المتاح الآن: ' + names.join('، ') + ' فقط. استعملها حين تلزم؛ وما ليس معك فلا تدّعِه — قل في سطر إنّه غير متاح في هذه اللحظة.]';
function fitGroqTpm(body, errText, owner) {
  const t = String(errText || '');
  const m = /Limit\s+(\d+)\s*,\s*Requested\s+(\d+)/i.exec(t);
  if (!m || !/tokens per minute|\bTPM\b/i.test(t)) return null;
  const limit = Number(m[1]), requested = Number(m[2]);
  if (!(limit > 0) || !(requested > limit)) return null;
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  // صورة base64 لا تُعدّ حروفًا عند Groq — تُحسب كثلاثة آلاف حرف (≈ ألف توكن) في القياسين معًا
  const size = (b) => JSON.stringify(b.messages || []).replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, 'x'.repeat(3000)).length + (b.tools ? JSON.stringify(b.tools).length : 0);
  const chars = size(body);
  if (!chars) return null;
  const cap = Number(body.max_completion_tokens) || 0;
  // السقف داخل الرقم إن بقي للمدخل نصيب معقول من الحروف (أقلّ من توكن لكلّ ٨ حروف لا يكون نصًّا)؛ وإلّا الرقم مدخل وحده.
  const prompt = (cap && (requested - cap) / chars >= 0.12) ? requested - cap : requested;
  const room = Math.max(256, Math.min(2048, Math.floor(limit / 4))); // مساحة الجواب
  if (cap && prompt + room + 64 <= limit) return Object.assign({}, body, { max_completion_tokens: Math.min(cap, limit - prompt - 64, 4096) }); // (١) السقف وحده
  const perChar = (prompt / chars) * 1.1; // توكن/حرف لهذا الطلب كما قاسه Groq، بهامش لاختلاف تقطيع الأجزاء
  const est = (b) => Math.ceil(size(b) * perChar);
  const sysIdx = msgs.findIndex((x) => x && x.role === 'system' && typeof x.content === 'string');
  const sys = sysIdx >= 0 ? msgs[sysIdx].content : '';
  const lean = (s, tools) => {
    const ms = msgs.slice();
    if (sysIdx >= 0) ms[sysIdx] = { role: 'system', content: s }; else ms.unshift({ role: 'system', content: s });
    const out = Object.assign({}, body, { messages: ms }); delete out.tools; delete out.tool_choice;
    if (tools && tools.length) out.tools = tools;
    return out;
  };
  const lastUser = (() => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i] && msgs[i].role === 'user') return msgs[i]; return null; })();
  const luRaw = !lastUser ? '' : (typeof lastUser.content === 'string' ? lastUser.content : (Array.isArray(lastUser.content) ? lastUser.content.map((x) => (x && x.text) || '').join(' ') : ''));
  /* tok-2 (مراجعة الدفعة A): ذيل الدور من النظام ليس كلام المستخدم — تنبيه «أدوات الصور مقفلة» يذكر generate_image بالاسم فكان
     LEAN_IMG_RE يختار الأدوات المقفلة نفسها. الاختيار من نصّ المستخدم وحده، والذيل المقفل يُسقط أداتَي الصور. */
  const TAIL_HEAD = '\n\n[سياق هذا الدور من النظام', tailAt = luRaw.indexOf(TAIL_HEAD);
  const luText = tailAt >= 0 ? luRaw.slice(0, tailAt) : luRaw, mediaLocked = tailAt >= 0 && /لا تستدعِ generate_image/.test(luRaw.slice(tailAt));
  const luImg = !!(lastUser && Array.isArray(lastUser.content) && lastUser.content.some((x) => x && x.type === 'image_url'));
  const want = (!mediaLocked && LEAN_VID_RE.test(luText) ? ['generate_video'] : []).concat(!mediaLocked && (luImg || LEAN_IMG_RE.test(luText)) ? ['edit_image', 'generate_image'] : []).concat(LEAN_Q_RE.test(luText) ? ['web_search'] : []);
  const wantTools = (body.tools || []).filter((x) => x && x.function && want.indexOf(x.function.name) !== -1);
  /* (٢) بلا أدوات، والنظام: الفقرة الأولى (الهويّة والأسلوب) و[هويّتك] إن كانت آخرها، ثمّ الباقي بترتيبه ما اتّسع لـ٤٠٪ من الحدّ —
     الحدّ للدقيقة كلّها لا للطلب: جسم بستّة آلاف من ثمانية يردّ «مرحبا» ثمّ يرفض الرسالة التالية 429 (لقطة المالك الثانية). */
  const fitsAll = (b) => est(b) + room + 64 <= limit;
  const budget = Math.floor(limit * 0.4);
  const paras = sys.split(/\n{2,}/);
  const idLast = paras.length > 1 && /^\[هويّتك\]/.test(paras[paras.length - 1]);
  const mid = paras.slice(1, idLast ? -1 : undefined);
  let tools = wantTools.slice();
  const build = (k) => lean([paras[0] || ''].concat(mid.slice(0, k), idLast ? [paras[paras.length - 1]] : [], [tools.length ? (owner ? TPM_NOTE_TOOLS : TPM_NOTE_TOOLS_USER)(tools.map((x) => x.function.name)) : (owner ? TPM_NOTE : TPM_NOTE_USER)]).filter(Boolean).join('\n\n'), tools);
  while (tools.length && est(build(0)) > budget) tools = tools.slice(0, -1); // الأدوات ذات الصلة ما اتّسعت لأقصر نظام، من الآخر
  if (!fitsAll(build(0))) return null;
  let k = 0;
  while (k < mid.length && est(build(k + 1)) <= budget) k++;
  const out = build(k);
  out.max_completion_tokens = Math.max(256, Math.min(cap || Infinity, room, limit - est(out) - 64));
  return out;
}
/* v-groq-tpm: «Please try again in 25.7s» / «1m12.5s» / «450ms» ← ثوانٍ؛ لا رقم = null. حدّ الدقيقة (TPM/RPM) يُنتظر داخل الطلب حتّى
   ٤٠ ث (حارس الصمت ٧٥ ث)، وحدّ اليوم أو أطول من ذلك يصل المالكَ سطرًا بموعده. */
function groqRetryAfter(text) {
  const m = /try again in\s+((?:\d+h)?(?:\d+m(?!s))?(?:[\d.]+s)?(?:[\d.]+ms)?)/i.exec(String(text || ''));
  if (!m || !m[1]) return null;
  const g = (re) => { const x = re.exec(m[1]); return x ? Number(x[1]) : 0; };
  const sec = g(/(\d+)h/) * 3600 + g(/(\d+)m(?!s)/) * 60 + g(/([\d.]+)s/) + g(/([\d.]+)ms/) / 1000;
  return sec > 0 ? sec : null;
}
const GROQ_WAIT_MAX = 40;
/* v-direct-429 (لقطة المالك ١٥ أكتوبر: Perplexity «ما قدرت أردّ الحين — خطأ 429» على طلب الكود، وطلبه «أريد أن أنسى هذه الأخطاء»):
   انتظار الحدّ كان لـGroq وحده وبنصّ «try again in». الآن كلّ مزوّد مباشر وعلى المسارين (responses وchat): إن حدّد المزوّد موعدًا
   (Retry-After ثوانٍ أو تاريخ، أو نصّ الجسم) لا يتجاوز CFG.waitMax (= GROQ_WAIT_MAX، تحت حارس الصمت) نُنتظره مرّة واحدة ونعيد النداء
   نفسه. بلا موعد = لا انتظار هنا: طبقة C4 في owner-loop تعيد مرّتين بانتظار قصير متدرّج. موعد أبعد من الحدّ = لا نوم (كما كان لـGPT
   وGroq اليوميّ) فيصل الموعد للمالك سطرًا. نصّ عن الرصيد أو الحصّة (quota/credit) لا يُنتظر عليه — ليس عابرًا. */
const CFG = { waitMax: GROQ_WAIT_MAX };
const NOT_TRANSIENT_RE = /quota|credit|balance|insufficient|billing|payment/i;
function retryAfterOf(headers, text) {
  let h = '';
  try { h = (headers && typeof headers.get === 'function') ? String(headers.get('retry-after') || '') : ''; } catch (e) { h = ''; }
  if (h) {
    const n = Number(h);
    if (Number.isFinite(n) && n > 0) return n;
    const d = Date.parse(h);
    if (Number.isFinite(d) && d - Date.now() > 0) return (d - Date.now()) / 1000;
  }
  const g = groqRetryAfter(text);
  if (g) return g;
  const m = /retry[_ -]?after["':\s]+([\d.]+)|retry (?:in|after)\s+([\d.]+)\s*s/i.exec(String(text || ''));
  const n = m ? Number(m[1] || m[2]) : 0;
  return n > 0 ? n : null;
}
/** الانتظار بالملّي ثانية قبل إعادة الـ429 رقم nth (الأولى فقط)، أو 0 = لا انتظار (بلا موعد، أو موعد أبعد من الحدّ، أو رصيد). */
function wait429Ms(headers, text, nth) {
  if (nth >= 1 || NOT_TRANSIENT_RE.test(String(text || ''))) return 0;
  const hint = retryAfterOf(headers, text);
  return (hint && hint <= CFG.waitMax) ? Math.ceil(hint * 1000) + 300 : 0;
}
const pause = (ms, signal) => new Promise((res) => { const id = setTimeout(res, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(id); res(); }, { once: true }); });

// يرسل جسم أنثروبيك إلى المزوّد مباشرةً ويرجع كائنًا بشكل Response تقرؤه الحلقة (ok · status · text · body).
// نموذج مرفوض على الافتراضيّ = المرشّح التالي عند Groq؛ سقف خرج مرفوض = إعادة بلا السقف.
async function directFetch(route, anthropicBody, opts) {
  const o = opts || {};
  const f = o.fetchImpl || fetch;
  const sig = o.signal ? { signal: o.signal } : {}; // v-claude-code-level C5: حارس صمت المالك يقطع النداء المباشر أيضًا
  if (route.responsesUrl) {
    let rb = toResponsesBody(anthropicBody);
    if (route.prov === 'perplexity') { delete rb.store; delete rb.reasoning; pplxWire(rb); } // v-pplx-agent: حقلا OpenAI وحده · v-pplx-names: الأسماء المحجوزة
    let rl = null;
    let capDropped = false, waits = 0; // v-direct-429
    let ownerEff = !!(anthropicBody.output_config && anthropicBody.output_config.effort); // v-owner-gpt-all
    for (let attempt = 0; attempt < 4 + QUICK_EFFORTS.length; attempt++) {
      const r = await f(route.responsesUrl, Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + route.key }, body: JSON.stringify(rb) }, sig));
      if (r.ok && r.body) return { ok: true, status: r.status, model: rb.model, api: 'responses', text: async () => '', body: responsesToAnthropicStream(r.body, rb.model, route.prov === 'perplexity' ? pplxBack : null) };
      const t = await r.text().catch(() => '');
      rl = { ok: false, status: r.status, model: rb.model, api: 'responses', text: async () => t, headers: r.headers || null }; // v-groq-tpm: retry-after يصل إعادة C4 (GPT كان يعيد 429 ثلاثًا بلا انتظار)
      if (r.status === 429) { const w = wait429Ms(r.headers, t, waits); if (w) { waits++; await pause(w, o.signal); if (o.signal && o.signal.aborted) break; continue; } break; } // v-direct-429
      // v-owner-auto: جهد مرفوض = الدرجة التالية من السلّم، وبعد آخرها بلا reasoning (سلوك ما قبل الإصلاح).
      /* v-owner-gpt-all: جهد اختاره المالك ورُفض = إعادة واحدة بلا reasoning (افتراضيّ الموديل) ويُذكر — لا يُحسب درجة من
         سلّم «بلا تفكير» (كان max المرفوض يقفز إلى none، عكس ما اختاره). */
      if (r.status === 400 && rb.reasoning && rb.reasoning.summary && /summary/i.test(t)) {
        summaryDrop(rb.model);
        rb = Object.assign({}, rb);
        const rest = Object.assign({}, rb.reasoning);
        delete rest.summary;
        if (Object.keys(rest).length) rb.reasoning = rest; else delete rb.reasoning;
        continue;
      }
      if (r.status === 400 && rb.reasoning && ownerEff && /reasoning|effort/i.test(t)) {
        ownerEff = false;
        try { require('./owner-think.js').forgetEffort(anthropicBody.model); } catch (e) { /* guard-ok — الذاكرة تحسين */ }
        rb = Object.assign({}, rb); delete rb.reasoning;
        continue;
      }
      if (r.status === 400 && rb.reasoning && /reasoning|effort/i.test(t)) {
        quickEffortRejected(rb.model, rb.reasoning.effort);
        rb = Object.assign({}, rb);
        const next = quickEffortFor(rb.model);
        if (next) rb.reasoning = { effort: next }; else delete rb.reasoning;
        continue;
      }
      if (!capDropped && r.status === 400 && rb.max_output_tokens && /max_output_tokens/i.test(t)) { capDropped = true; rb = Object.assign({}, rb); delete rb.max_output_tokens; continue; }
      /* v-pplx-names: اسم محجوز جديد لم نعرفه = يُضاف للمجموعة ويُعاد الطلب بأدواته (مرّة لكلّ اسم) — لا إسقاط الأدوات كلّها */
      if (route.prov === 'perplexity' && r.status === 400 && rb.tools) { const nr = pplxReservedIn(t, rb); if (nr) { PPLX_RESERVED.add(nr); rb = pplxWire(Object.assign({}, rb)); continue; } }
      /* v-pplx-agent: موديل Perplexity رفض أدوات الدوالّ = إعادة واحدة بلاها وبسطر يقول ذلك للموديل — جواب صادق لا «ما قدرت أردّ» */
      if (route.prov === 'perplexity' && r.status === 400 && rb.tools && /tool|function/i.test(t)) { rb = Object.assign({}, rb, { instructions: (rb.instructions ? rb.instructions + '\n\n' : '') + PPLX_NO_TOOLS }); delete rb.tools; delete rb.tool_choice; continue; }
      break;
    }
    if (route.noFallback) return rl; // v-pplx-agent: لا chat/completions بعدها (تقاعد) — الفشل وسببه للمالك (v-owner-solo)
    // موديل مرفوض = يُعاد كما هو فيرجع chat.js للافتراضيّ بسطر حالة؛ مفتاح/رصيد/حدّ (401/402/403/429/5xx) = كذلك
    // (المسار القديم بالمفتاح نفسه سيرفض مثله). غير ذلك (400/404 على شكل الطلب) = المسار القديم أدناه، ويُسجَّل السبب.
    const rt = await rl.text();
    if (OA_MODEL_MISSING_RE.test(rt) || (rl.status !== 400 && rl.status !== 404)) return rl;
    try { require('./log-error.js').logError('oa-direct/responses-' + rl.status, new Error(rt.slice(0, 280) || ('responses ' + rl.status)), { action: 'responses-fallback', model: rb.model }); } catch (e) { /* التسجيل تحسين */ }
  }
  const gSigs = route.prov === 'gemini' ? (o.sigs || null) : null; // v-pro-lanes
  const base = toOpenAIBody(anthropicBody, route.prov, gSigs);
  let models = [base.model];
  if (route.prov === 'groq' && o.fallbackModels) {
    // موديل رفضه Groq في هذه الدالّة الدافئة لا يُعاد تجريبه أوّلًا في كلّ رسالة.
    models = models.concat(o.fallbackModels.filter((m) => m !== base.model));
    const live = models.filter((m) => !deadModels.has(m));
    models = (live.length ? live : models).slice(0, 4);
  }
  let last = null;
  for (const model of models) {
    let body = Object.assign({}, base, { model });
    let capDropped = false, tpmFitted = false, waits = 0; // v-direct-429
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await f(route.url, Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + route.key }, body: JSON.stringify(body) }, sig));
      if (r.ok && r.body) {
        if (route.prov === 'groq') rememberWorking('groq-direct', model); // v-plan-models: لا يغيّر ترتيب المجّانيّ (20b أوّلًا) — كان المباشر (120b) يقدّم موديله ستّ ساعات
        return { ok: true, status: r.status, model, text: async () => '', body: toAnthropicStream(r.body, model, gSigs) };
      }
      const t = await r.text().catch(() => '');
      last = { ok: false, status: r.status, model, text: async () => t, headers: r.headers || null }; // v-groq-tpm: retry-after يصل إعادة C4 (owner-loop) فلا تعيد بعد ٠٫٨ ث ما قال Groq إنّه بعد ٣٠
      if (!capDropped && r.status === 400 && body.max_completion_tokens && /max_(?:completion_)?tokens/i.test(t)) { capDropped = true; body = Object.assign({}, body); delete body.max_completion_tokens; continue; }
      if (!tpmFitted && route.prov === 'groq' && r.status === 413) { const fit = fitGroqTpm(body, t, !!o.owner); if (fit) { tpmFitted = true; body = fit; continue; } }
      if (r.status === 429) { const w = wait429Ms(r.headers, t, waits); if (w) { waits++; await pause(w, o.signal); if (o.signal && o.signal.aborted) break; continue; } } // v-direct-429: كلّ مزوّد لا Groq وحده
      break;
    }
    /* v-plan-models: حدود Groq لكلّ موديل — 429/413 على موديل (حدّ دقيقة أو يوم) يجرّب التالي في القائمة قبل أن يخرج من Groq، ولا يُعدّ ميّتًا */
    const busy = route.prov === 'groq' && o.fallbackModels && (last.status === 429 || last.status === 413);
    { const lt = await last.text(); if ((!busy && !isModelErrorStatus(last.status, lt)) || /tool_use_failed/.test(lt)) break; } // v-groq-final: «model called a tool» رفضٌ للتوليد لا موديل ميّت
    if (route.prov === 'groq' && o.fallbackModels && !busy) deadModels.add(model);
  }
  return last;
}
const deadModels = new Set();

// v-owner-auto: سلّم «بلا تفكير» لكلّ موديل في هذه الدالّة الدافئة: أوّل درجة لم يرفضها. '' = الموديل رفضها كلّها.
const summaryOff = new Set();
function summaryWanted(model) { return !summaryOff.has(String(model || '')); }
function summaryDrop(model) { if (model) summaryOff.add(String(model)); }
const QUICK_EFFORTS = ['none', 'minimal', 'low'];
const quickRejected = new Map();
function quickEffortFor(model) {
  const bad = quickRejected.get(String(model || '')) || [];
  let ok = null; try { ok = require('./owner-think.js').gptEfforts(model); } catch (e) { /* guard-ok — بلا الجدول السلّم كما كان */ }
  return QUICK_EFFORTS.find((e) => bad.indexOf(e) === -1 && (!ok || ok.indexOf(e) !== -1)) || ''; // v-owner-gpt-all: Astra و6.1 Sol يبدآن من low (none/minimal = 400 موثَّق)
}
function quickEffortRejected(model, effort) {
  const k = String(model || '');
  const bad = quickRejected.get(k) || [];
  if (effort && bad.indexOf(effort) === -1) bad.push(effort);
  quickRejected.set(k, bad);
}

module.exports = { PPLX_NO_TOOLS, PPLX_RESERVED, pplxWire, pplxBack, pplxReservedIn, directRoute, directModel, directFetch, fitGroqTpm, groqRetryAfter, retryAfterOf, wait429Ms, __cfg: CFG, GROQ_WAIT_MAX, toOpenAIBody, toAnthropicStream, toResponsesBody, gemSchema, GEM_SKIP_SIG, responsesToAnthropicStream, DIRECT, GROQ_ALIAS, __deadModels: deadModels, __quickRejected: quickRejected, __summaryOff: summaryOff };
