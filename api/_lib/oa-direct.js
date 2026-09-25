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
};

// مسار مباشر لهذا المزوّد إن كان مفتاحه في البيئة، وإلّا null (يبقى على الوسيط كما كان).
function directRoute(prov, env) {
  const d = DIRECT[String(prov || '').toLowerCase()];
  const e = env || process.env;
  if (!d) return null;
  const key = String(e[d.keyVar] || '').trim();
  if (!key) return null;
  const r = { prov: String(prov).toLowerCase(), url: d.url, key, label: d.label };
  if (d.responses) r.responsesUrl = d.responses;
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
    const def = String(e.CHAT_OPENAI_MODEL || '').trim() || 'gpt-5.6-terra';
    return (id && DIRECT_ID_RE.test(id) && id.indexOf('/') === -1) ? { model: id, picked: true, def } : { model: def, picked: false, def };
  }
  if (prov === 'gemini') {
    const def = String(e.CHAT_GEMINI_MODEL || '').trim() || 'gemini-flash-latest';
    return { model: def, picked: false, def };
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

// جسم أنثروبيك ← جسم chat/completions. الكاش والتفكير وإعدادات الجهد لا مقابل لها فتُسقط.
function toOpenAIBody(ab, prov) {
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
  if (prov === 'openai') body.stream_options = { include_usage: true };
  if (Array.isArray(ab.tools) && ab.tools.length) {
    body.tools = ab.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } } }));
  }
  return body;
}

// v-oa-responses: جسم أنثروبيك ← جسم /v1/responses. النظام ← instructions؛ الرسائل ← عناصر input؛ نداء الأداة
// ← function_call ونتيجتها ← function_call_output بنفس call_id (بلا معرّفات fc_/rs_: لا يُطلب معها عنصر التفكير)؛
// الأدوات مسطّحة وstrict:false (الافتراضيّ هنا صارم ومخطّطاتنا غير صارمة)؛ store:false فلا تُحفظ محادثة المالك عند
// المزوّد؛ ولا reasoning: الموديل يفكّر بإعداده الافتراضيّ كما في تطبيقه. الكاش والتفكير وجهد أنثروبيك تُسقط.
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
  const sys = textOf(ab.system);
  if (sys) body.instructions = sys;
  if (ab.max_tokens) body.max_output_tokens = ab.max_tokens;
  if (Array.isArray(ab.tools) && ab.tools.length) {
    body.tools = ab.tools.map((t) => ({ type: 'function', name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} }, strict: false }));
  }
  return body;
}

// v-oa-responses: بثّ /v1/responses (أحداث response.*) ← أحداث أنثروبيك بالأسطر نفسها التي تقرؤها الحلقة.
// عناصر التفكير لا تُمرَّر (لا يُبثّ منها شيء للمستخدم)؛ وسائط النداء تصل دلتا أو كاملةً عند done — مرّة واحدة.
function responsesToAnthropicStream(upstreamBody, fallbackModel) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return new ReadableStream({
    async start(controller) {
      const emit = (ev) => controller.enqueue(enc.encode('data: ' + JSON.stringify(ev) + '\n\n'));
      const reader = upstreamBody.getReader();
      let buf = '';
      let started = false;
      let next = 0;
      let textIdx = -1;
      const calls = new Map(); // output_index ← { idx, sent }
      let stop = null;
      let usage = null;
      const begin = (model) => { if (!started) { started = true; emit({ type: 'message_start', message: { model: model || fallbackModel, usage: { input_tokens: 0, output_tokens: 0 } } }); } };
      const closeText = () => { if (textIdx >= 0) { emit({ type: 'content_block_stop', index: textIdx }); textIdx = -1; } };
      const openCall = (oi, item) => {
        closeText();
        const idx = next++;
        const c = { idx, sent: false };
        calls.set(oi, c);
        emit({ type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: String(item.call_id || item.id || ('call_' + idx)), name: String(item.name || ''), input: {} } });
        return c;
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let ev;
            try { ev = JSON.parse(payload); } catch (e) { continue; }
            const t = String(ev.type || '');
            if (t === 'response.created' || t === 'response.in_progress') { begin(ev.response && ev.response.model); continue; }
            begin('');
            if (t === 'response.output_text.delta' && typeof ev.delta === 'string' && ev.delta) {
              if (textIdx < 0) { textIdx = next++; emit({ type: 'content_block_start', index: textIdx, content_block: { type: 'text', text: '' } }); }
              emit({ type: 'content_block_delta', index: textIdx, delta: { type: 'text_delta', text: ev.delta } });
            } else if (t === 'response.output_item.added' && ev.item && ev.item.type === 'function_call') {
              const c = openCall(ev.output_index, ev.item);
              if (ev.item.arguments) { emit({ type: 'content_block_delta', index: c.idx, delta: { type: 'input_json_delta', partial_json: String(ev.item.arguments) } }); c.sent = true; }
            } else if (t === 'response.function_call_arguments.delta' && ev.delta) {
              const c = calls.get(ev.output_index);
              if (c) { emit({ type: 'content_block_delta', index: c.idx, delta: { type: 'input_json_delta', partial_json: String(ev.delta) } }); c.sent = true; }
            } else if (t === 'response.output_item.done' && ev.item && ev.item.type === 'function_call') {
              const c = calls.get(ev.output_index) || openCall(ev.output_index, ev.item);
              if (!c.sent && ev.item.arguments) { emit({ type: 'content_block_delta', index: c.idx, delta: { type: 'input_json_delta', partial_json: String(ev.item.arguments) } }); c.sent = true; }
            } else if (t === 'response.output_item.done' && ev.item && ev.item.type === 'message') {
              closeText();
            } else if (t === 'response.completed' || t === 'response.incomplete' || t === 'response.failed') {
              const r = ev.response || {};
              if (r.usage) usage = r.usage;
              const why = r.incomplete_details && r.incomplete_details.reason;
              if (t === 'response.incomplete' && /max_output_tokens/.test(String(why || ''))) stop = 'max_tokens';
            }
          }
        }
        begin('');
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

const STOP = { tool_calls: 'tool_use', function_call: 'tool_use', length: 'max_tokens' };

// بثّ chat/completions ← بثّ أحداث أنثروبيك بالأسطر نفسها التي تقرؤها الحلقة (data: {...}).
function toAnthropicStream(upstreamBody, fallbackModel) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return new ReadableStream({
    async start(controller) {
      const emit = (ev) => controller.enqueue(enc.encode('data: ' + JSON.stringify(ev) + '\n\n'));
      const reader = upstreamBody.getReader();
      let buf = '';
      let started = false;
      let next = 0;          // فهرس الكتلة التالية
      let textIdx = -1;      // كتلة النصّ المفتوحة
      const toolIdx = new Map(); // فهرس نداء OpenAI ← فهرس كتلة أنثروبيك
      let stop = null;
      let usage = null;
      const begin = (model) => { if (!started) { started = true; emit({ type: 'message_start', message: { model: model || fallbackModel, usage: { input_tokens: 0, output_tokens: 0 } } }); } };
      const closeText = () => { if (textIdx >= 0) { emit({ type: 'content_block_stop', index: textIdx }); textIdx = -1; } };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let ch;
            try { ch = JSON.parse(payload); } catch (e) { continue; }
            begin(ch.model);
            const u = ch.usage || (ch.x_groq && ch.x_groq.usage);
            if (u) usage = u;
            const c = ch.choices && ch.choices[0];
            if (!c) continue;
            const d = c.delta || {};
            if (typeof d.content === 'string' && d.content) {
              if (textIdx < 0) { textIdx = next++; emit({ type: 'content_block_start', index: textIdx, content_block: { type: 'text', text: '' } }); }
              emit({ type: 'content_block_delta', index: textIdx, delta: { type: 'text_delta', text: d.content } });
            }
            for (const tc of (Array.isArray(d.tool_calls) ? d.tool_calls : [])) {
              const k = typeof tc.index === 'number' ? tc.index : toolIdx.size;
              if (!toolIdx.has(k)) {
                closeText();
                const idx = next++;
                toolIdx.set(k, idx);
                emit({ type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: tc.id || ('call_' + idx), name: (tc.function && tc.function.name) || '', input: {} } });
              }
              const args = tc.function && tc.function.arguments;
              if (args) emit({ type: 'content_block_delta', index: toolIdx.get(k), delta: { type: 'input_json_delta', partial_json: String(args) } });
            }
            if (c.finish_reason) stop = STOP[c.finish_reason] || 'end_turn';
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

// يرسل جسم أنثروبيك إلى المزوّد مباشرةً ويرجع كائنًا بشكل Response تقرؤه الحلقة (ok · status · text · body).
// نموذج مرفوض على الافتراضيّ = المرشّح التالي عند Groq؛ سقف خرج مرفوض = إعادة بلا السقف.
async function directFetch(route, anthropicBody, opts) {
  const o = opts || {};
  const f = o.fetchImpl || fetch;
  if (route.responsesUrl) {
    let rb = toResponsesBody(anthropicBody);
    let rl = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await f(route.responsesUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + route.key }, body: JSON.stringify(rb) });
      if (r.ok && r.body) return { ok: true, status: r.status, model: rb.model, api: 'responses', text: async () => '', body: responsesToAnthropicStream(r.body, rb.model) };
      const t = await r.text().catch(() => '');
      rl = { ok: false, status: r.status, model: rb.model, api: 'responses', text: async () => t };
      if (attempt === 0 && r.status === 400 && rb.max_output_tokens && /max_output_tokens/i.test(t)) { rb = Object.assign({}, rb); delete rb.max_output_tokens; continue; }
      break;
    }
    // موديل مرفوض = يُعاد كما هو فيرجع chat.js للافتراضيّ بسطر حالة؛ مفتاح/رصيد/حدّ (401/402/403/429/5xx) = كذلك
    // (المسار القديم بالمفتاح نفسه سيرفض مثله). غير ذلك (400/404 على شكل الطلب) = المسار القديم أدناه، ويُسجَّل السبب.
    const rt = await rl.text();
    if (OA_MODEL_MISSING_RE.test(rt) || (rl.status !== 400 && rl.status !== 404)) return rl;
    try { require('./log-error.js').logError('oa-direct/responses-' + rl.status, new Error(rt.slice(0, 280) || ('responses ' + rl.status)), { action: 'responses-fallback', model: rb.model }); } catch (e) { /* التسجيل تحسين */ }
  }
  const base = toOpenAIBody(anthropicBody, route.prov);
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
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await f(route.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + route.key }, body: JSON.stringify(body) });
      if (r.ok && r.body) {
        if (route.prov === 'groq') rememberWorking('groq', model);
        return { ok: true, status: r.status, model, text: async () => '', body: toAnthropicStream(r.body, model) };
      }
      const t = await r.text().catch(() => '');
      last = { ok: false, status: r.status, model, text: async () => t };
      if (attempt === 0 && r.status === 400 && body.max_completion_tokens && /max_(?:completion_)?tokens/i.test(t)) { body = Object.assign({}, body); delete body.max_completion_tokens; continue; }
      break;
    }
    if (!isModelErrorStatus(last.status, await last.text())) break;
    if (route.prov === 'groq' && o.fallbackModels) deadModels.add(model);
  }
  return last;
}
const deadModels = new Set();

module.exports = { directRoute, directModel, directFetch, toOpenAIBody, toAnthropicStream, toResponsesBody, responsesToAnthropicStream, DIRECT, GROQ_ALIAS, __deadModels: deadModels };
