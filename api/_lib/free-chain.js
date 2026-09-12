// api/_lib/free-chain.js — v-tiers: بثّ ردّ المحادثة للطبقة المجانية عبر سلسلة
// مزوّدات لها طبقة مجانية (Gemini Flash → Groq → Mistral → OpenRouter)، كلّها
// بصيغة OpenAI المتوافقة (chat/completions + SSE) فدالّة بثّ واحدة تكفي.
//
// بلا أدوات: لا بحث حي ولا صور ولا وكيل — تلك للنسخة الاحترافية. الصور المرفقة
// تمرّ للمزوّد الذي يرى (Gemini) وتُستبدل بملاحظة نصّية عند الباقين.
// امتلاء حصة مزوّد (429) أو أي عطل يمرّر الطلب للتالي بصمت؛ فشل الجميع يرجع
// {ok:false} والمستدعي يعرض رسالة «مشغول» لا خطأ تقنيًّا.
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

// يبثّ من مزوّد واحد. يرجع النصّ المرسَل، أو يرمي عند أي عطل قبل أول حرف.
async function streamOne(spec, messages, send, opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 60000);
  let text = '';
  try {
    const r = await fetchImpl(spec.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + spec.key },
      body: JSON.stringify({ model: spec.model, messages, max_tokens: opts.maxTokens || 4000, temperature: 0.7, stream: true }),
      signal: ctrl.signal,
    });
    if (!r.ok || !r.body) {
      const errText = r && r.text ? await r.text().catch(() => '') : '';
      throw new Error('free-chain ' + spec.id + ' http ' + (r && r.status) + ' ' + String(errText).slice(0, 160));
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

// يجرّب السلسلة بالترتيب. {ok:true, provider, text} عند أوّل نجاح؛ وإن فشل مزوّد
// بعد أن بثّ نصًّا جزئيًّا لا ننتقل (لئلّا يتكرّر الردّ) بل نرجع ما وصل.
async function streamFreeChain(args) {
  const chain = freeChain(args.env || process.env);
  const log = args.log || ((m) => { try { console.warn('[free-chain] ' + m); } catch (e) { /* لا شيء */ } });
  const system = String(args.system || '') + FREE_NOTE;
  let attempts = 0;
  for (const spec of chain) {
    attempts++;
    const messages = toOpenAIMessages(system, args.convo, spec.vision);
    if (!messages.some((m) => m.role === 'user')) return { ok: false, provider: null, text: '', attempts };
    let partial = '';
    try {
      const text = await streamOne(spec, messages, (ev) => { partial += ev.delta || ''; args.send(ev); }, args);
      if (text && text.trim()) return { ok: true, provider: spec.id, text, attempts };
      log(spec.id + ' returned empty text');
    } catch (e) {
      log(spec.id + ' failed: ' + String((e && e.message) || e).slice(0, 200));
      if (partial.trim()) return { ok: true, provider: spec.id, text: partial, attempts, truncated: true };
    }
  }
  return { ok: false, provider: null, text: '', attempts };
}

module.exports = { streamFreeChain, toOpenAIMessages, streamOne, FREE_NOTE };
