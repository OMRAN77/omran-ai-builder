// نافذة خام (v615) — Claude بلا توجيه ولا أدوات ولا قوالب.
// غير مربوطة بالتطبيق: لا تستوردها أي وحدة، ولا يشير إليها أي رابط.
// الغرض: خطّ أساس للمقارنة — كيف يحاور النموذج حين لا يُملى عليه شكل الردّ.
// محميّة برمز بوابة (RAW_GATE) حتّى لا يستنزف غريبٌ رصيد المفاتيح.
require('./_lib/_fetch-timeout.js');

const MODELS = {
  opus: { direct: 'claude-opus-5', or: 'anthropic/claude-opus-5' },
  sonnet: { direct: 'claude-sonnet-5', or: 'anthropic/claude-sonnet-5' },
};

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') { resolve(req.body); return; }
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function call(url, headers, payload) {
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify(payload),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const gate = process.env.RAW_GATE || '';
  if (!gate || (req.headers['x-gate'] || '') !== gate) { res.status(403).json({ error: 'gate' }); return; }

  const body = await readBody(req);
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) { res.status(400).json({ error: 'Missing messages' }); return; }

  const m = MODELS[body.model] || MODELS.opus;
  const sys = (typeof body.system === 'string' && body.system.trim()) ? body.system.trim() : undefined;
  const payload = { max_tokens: 8000, system: sys, messages, stream: true };

  // نفس طريق الإنتاج: OpenRouter إن وُجد مفتاحه، وإلّا Anthropic مباشرةً.
  // نفس ترويسة x-api-key ونفس أحداث البثّ على الطريقين (مُتحقَّق في api/_lib/chat.js).
  const routes = [];
  if (process.env.ANTHROPIC_API_KEY) {
    routes.push({ via: 'anthropic', url: 'https://api.anthropic.com/v1/messages', key: process.env.ANTHROPIC_API_KEY, model: m.direct });
  }
  if (process.env.OPENROUTER_API_KEY) {
    routes.push({ via: 'openrouter', url: 'https://openrouter.ai/api/v1/messages', key: process.env.OPENROUTER_API_KEY, model: m.or });
  }

  let r = null; let via = ''; let detail = 'no key';
  for (const route of routes) {
    r = await call(route.url, { 'x-api-key': route.key, 'anthropic-version': '2023-06-01' },
      Object.assign({}, payload, { model: route.model })).catch(() => null);
    if (r && r.ok) { via = route.via; break; }
    detail = r ? (route.via + ' ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200)) : (route.via + ' network');
    r = null;
  }
  if (!r) { res.status(502).json({ error: 'upstream', detail }); return; }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Raw-Via', via);

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const step = await reader.read().catch(() => ({ done: true }));
    if (step.done) break;
    buf += dec.decode(step.value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line.slice(0, 5) !== 'data:') continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      let ev = null;
      try { ev = JSON.parse(raw); } catch (_) { continue; }
      const t = (ev && ev.delta && typeof ev.delta.text === 'string') ? ev.delta.text : '';
      if (t) res.write(t);
    }
  }
  res.end();
};
