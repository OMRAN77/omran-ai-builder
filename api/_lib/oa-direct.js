'use strict';
/* v-owner-direct (أمر المالك ٢٢ سبتمبر «اربط Groq مباشرة بمفتاحه… وGPT»): Groq وGPT في المحادثة كانا يمرّان
   بوسيط OpenRouter بمعرّف موديل Meta (Groq كان اسمًا فقط — الوسيط يختار من يشغّل Llama). للمالك الآن:
   مفتاح المزوّد نفسه (GROQ_API_KEY / OPENAI_API_KEY) على عنوانه الرسميّ بصيغة chat/completions.
   حلقة الأدوات في chat.js تتكلّم بروتوكول أنثروبيك (أحداث content_block_* و tool_use)، فهذا الملفّ جسر
   في الاتّجاهين: يحوّل جسم الطلب إلى صيغة OpenAI، ويحوّل بثّ الردّ إلى أحداث أنثروبيك — فلا يتغيّر في
   الحلقة شيء غير دالّة الإرسال. المفتاح يُقرأ عند النداء لا في نطاق الوحدة (بيئة عارية عند التحميل). */
const { rememberWorking, isModelErrorStatus } = require('./free-chain.js');

const DIRECT = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', keyVar: 'GROQ_API_KEY', label: 'Groq' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', keyVar: 'OPENAI_API_KEY', label: 'OpenAI' },
};

// مسار مباشر لهذا المزوّد إن كان مفتاحه في البيئة، وإلّا null (يبقى على الوسيط كما كان).
function directRoute(prov, env) {
  const d = DIRECT[String(prov || '').toLowerCase()];
  const e = env || process.env;
  if (!d) return null;
  const key = String(e[d.keyVar] || '').trim();
  if (!key) return null;
  return { prov: String(prov).toLowerCase(), url: d.url, key, label: d.label };
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
  // افتراضيّ السهم «Llama 4 Maverick» معرّف الوسيط؛ عند Groq اسمه الكامل. تعطّله = مرشّحو السلسلة (directFetch).
  const def = String(e.CHAT_GROQ_MODEL || '').trim() || GROQ_ALIAS['meta-llama/llama-4-maverick'];
  const a = GROQ_ALIAS[id] || id;
  if (!a || a === def || !DIRECT_ID_RE.test(a)) return { model: def, picked: false, def };
  return { model: a, picked: true, def };
}
const GROQ_ALIAS = {
  'meta-llama/llama-4-maverick': 'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
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

module.exports = { directRoute, directModel, directFetch, toOpenAIBody, toAnthropicStream, DIRECT, GROQ_ALIAS, __deadModels: deadModels };
