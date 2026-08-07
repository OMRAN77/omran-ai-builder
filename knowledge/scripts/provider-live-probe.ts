// 🩺 فحص صلاحية مفاتيح المزوّدين عبر نقاط الإنتاج نفسها. قياس فقط — لا يطبع أي مفتاح.
const S = 'https://omran-ai-builder.vercel.app';
const msg = [{ role: 'user', content: '1' }];
type P = { name: string; url: string; body?: any; method?: string };
const probes: P[] = [
  { name: 'Claude (Anthropic)', url: '/api/claude', body: { messages: msg, max_tokens: 5 } },
  { name: 'OpenAI', url: '/api/openai', body: { messages: msg, max_tokens: 5 } },
  { name: 'Gemini', url: '/api/gemini', body: { messages: msg, max_tokens: 5 } },
  { name: 'Groq', url: '/api/groq', body: { messages: msg, max_tokens: 5 } },
  { name: 'Mistral', url: '/api/mistral', body: { messages: msg, max_tokens: 5 } },
  { name: 'DeepSeek', url: '/api/deepseek', body: { messages: msg, max_tokens: 5 } },
  { name: 'OpenRouter', url: '/api/openrouter', body: { messages: msg, max_tokens: 5 } },
  { name: 'Perplexity', url: '/api/perplexity', body: { messages: msg, max_tokens: 5 } },
  { name: 'Cohere', url: '/api/cohere', body: { messages: msg, max_tokens: 5 } },
  { name: 'Search (Tavily/Google)', url: '/api/search', body: { query: 'dubai weather' } },
  { name: 'Stocks (Finnhub/TwelveData)', url: '/api/stocks', body: { mode: 'quote', symbol: 'AAPL' } },
  { name: 'TTS (OpenAI/Azure)', url: '/api/tts', body: { text: 'مرحبا', lang: 'ar' } },
  { name: 'Runway balance', url: '/api/video?action=video-balance', method: 'GET' },
];
for (const p of probes) {
  const t0 = Date.now();
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 30000);
    const r = await fetch(S + p.url, {
      method: p.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: p.method === 'GET' ? undefined : JSON.stringify(p.body),
      signal: ac.signal,
    });
    clearTimeout(to);
    const ct = r.headers.get('content-type') || '';
    let note = '';
    if (ct.includes('json') || ct.includes('text')) {
      const t = await r.text();
      note = t.replace(/\s+/g, ' ').slice(0, 200);
    } else {
      const b = await r.arrayBuffer();
      note = `[${ct} ${b.byteLength}b]`;
    }
    console.log(`${r.status} | ${((Date.now() - t0) / 1000).toFixed(1)}s | ${p.name} | ${note}`);
  } catch (e: any) {
    console.log(`ERR  | ${((Date.now() - t0) / 1000).toFixed(1)}s | ${p.name} | ${String(e.message).slice(0, 120)}`);
  }
  await new Promise(r => setTimeout(r, 700));
}
