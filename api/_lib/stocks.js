// Vercel Serverless Function: "📈 سوق الأسهم" (Stock Market).
// Proxies Twelve Data API with the owner's server-side key.
// Actions: quote (latest price) | series (time series for chart) | search (symbol lookup)
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const BASE = 'https://api.twelvedata.com';
const tickerCache = new Map();
let goldCache = { t: 0, j: null };
const learnCache = new Map(); // symbol -> { t, live } (60s cache to respect free-plan credits)

const tdCache = new Map(); // in-memory layer (per instance)
const TD_TTL = 600000; // 10 min shared cache

function cachePath(cKey) {
  let h = 0;
  for (let i = 0; i < cKey.length; i++) h = (h * 31 + cKey.charCodeAt(i)) >>> 0;
  return 'stocks-cache/' + h.toString(36) + '.json';
}

async function blobCacheGet(cKey, allowStale) {
  try {
    const d = await kvGetJSON(cachePath(cKey));
    if (d && d.k === cKey && (allowStale || Date.now() - d.t < TD_TTL)) return d.j;
  } catch (e) {}
  return null;
}

async function blobCachePut(cKey, j) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  try {
    await kvPutJSON(cachePath(cKey), { k: cKey, t: Date.now(), j });
  } catch (e) {}
}

async function td(path, params, apiKey) {
  const cKey = path + '|' + JSON.stringify(params);
  const hit = tdCache.get(cKey);
  if (hit && Date.now() - hit.t < TD_TTL) return hit.j;
  const shared = await blobCacheGet(cKey);
  if (shared) {
    tdCache.set(cKey, { t: Date.now(), j: shared });
    return shared;
  }
  const qs = new URLSearchParams({ ...params, apikey: apiKey }).toString();
  const r = await fetch(`${BASE}/${path}?${qs}`);
  const j = await r.json();
  if (j && (j.status === 'error' || j.code >= 400)) {
    // quota exhausted → serve last saved data (stale) instead of failing
    if (/credits|limit/i.test(j.message || '')) {
      const stale = await blobCacheGet(cKey, true);
      if (stale) { tdCache.set(cKey, { t: Date.now(), j: stale }); return stale; }
    }
    throw new Error(j.message || 'Twelve Data error');
  }
  tdCache.set(cKey, { t: Date.now(), j });
  if (tdCache.size > 200) { const k = tdCache.keys().next().value; tdCache.delete(k); }
  await blobCachePut(cKey, j);
  return j;
}

// Finnhub: unlimited daily quota (60 req/min) — used for live quotes
async function fhQuote(symbol) {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) return null;
  const cKey = 'fh|quote|' + symbol;
  const hit = tdCache.get(cKey);
  if (hit && Date.now() - hit.t < TD_TTL) return hit.j;
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${k}`);
  const j = await r.json();
  if (!j || typeof j.c !== 'number' || j.c === 0) return null;
  const out = { symbol, price: j.c, open: j.o, high: j.h, low: j.l, prevClose: j.pc, change: j.d, changePct: j.dp };
  tdCache.set(cKey, { t: Date.now(), j: out });
  return out;
}

async function yahooSeries(symbol, outputsize) {
  // Free daily candles from Yahoo Finance; returns TD-shaped { values: [...] } newest-first
  const cKey = 'yh|series|' + symbol + '|' + outputsize;
  const hit = tdCache.get(cKey);
  if (hit && Date.now() - hit.t < TD_TTL) return hit.j;
  const range = outputsize > 60 ? '6mo' : '3mo';
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const j = await r.json();
  const res0 = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res0 || !res0.timestamp) return null;
  const q = res0.indicators.quote[0];
  const values = [];
  for (let i = res0.timestamp.length - 1; i >= 0 && values.length < outputsize; i--) {
    if (q.close[i] == null) continue;
    values.push({
      datetime: new Date(res0.timestamp[i] * 1000).toISOString().slice(0, 10),
      open: String(q.open[i]), high: String(q.high[i]), low: String(q.low[i]),
      close: String(q.close[i]), volume: String(q.volume[i] || 0),
    });
  }
  const out = { values };
  tdCache.set(cKey, { t: Date.now(), j: out });
  return out;
}

async function anySeries(symbol, outputsize, apiKey) {
  // Yahoo first (free, no quota) then Twelve Data as fallback
  let s = await yahooSeries(symbol, outputsize).catch(() => null);
  if (s && s.values && s.values.length) return s;
  s = await td('time_series', { symbol, interval: '1day', outputsize }, apiKey).catch(() => null);
  return s;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Server is missing TWELVEDATA_API_KEY' }); return; }

  try {
    const body = req.body || {};
    const mode = body.mode || 'quote';
    const symbol = String(body.symbol || '').trim().toUpperCase();

    if (mode === 'search') {
      const q = String(body.query || '').trim();
      if (!q) { res.status(400).json({ error: 'query required' }); return; }
      const j = await td('symbol_search', { symbol: q, outputsize: 10 }, apiKey);
      const items = (j.data || []).map(d => ({
        symbol: d.symbol, name: d.instrument_name, exchange: d.exchange,
        country: d.country, currency: d.currency, type: d.instrument_type,
      }));
      res.status(200).json({ items });
      return;
    }

    if (mode === 'gold') {
      // Live gold price (Yahoo GC=F futures) + AED gram prices (USD peg 3.6725)
      if (goldCache.t && Date.now() - goldCache.t < 900000) { res.status(200).json(goldCache.j); return; }
      const gr = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=1d&interval=5m', { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const gy = await gr.json();
      const gm = gy && gy.chart && gy.chart.result && gy.chart.result[0] && gy.chart.result[0].meta;
      if (!gm || !gm.regularMarketPrice) {
        if (goldCache.j) { res.status(200).json(goldCache.j); return; }
        res.status(502).json({ error: 'gold unavailable' }); return;
      }
      const ozUsd = gm.regularMarketPrice;
      const prev = gm.chartPreviousClose || gm.previousClose || ozUsd;
      const g24 = ozUsd / 31.1034768 * 3.6725;
      const out = {
        ozUsd: +ozUsd.toFixed(2), change: +(ozUsd - prev).toFixed(2), changePct: +(((ozUsd - prev) / prev) * 100).toFixed(2),
        gram24: +g24.toFixed(2), gram22: +(g24 * 22 / 24).toFixed(2), gram21: +(g24 * 21 / 24).toFixed(2), gram18: +(g24 * 18 / 24).toFixed(2), ozAed: +(ozUsd * 3.6725).toFixed(2),
      };
      goldCache = { t: Date.now(), j: out };
      res.status(200).json(out);
      return;
    }

    if (mode === 'ticker') {
      // Batch quotes for the live ticker bar (comma-separated symbols, max 8 per free-plan credit rules)
      const syms = String(body.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 5);
      if (!syms.length) { res.status(400).json({ error: 'symbols required' }); return; }
      const tKey = syms.join(',');
      const tc = tickerCache.get(tKey);
      if (tc && Date.now() - tc.t < 900000) { res.status(200).json({ items: tc.items }); return; }
      // Prefer Finnhub (no daily quota)
      if (process.env.FINNHUB_API_KEY) {
        const NAMES = { AAPL: 'Apple', TSLA: 'Tesla', MSFT: 'Microsoft', NVDA: 'NVIDIA', AMZN: 'Amazon', GOOGL: 'Alphabet', META: 'Meta' };
        const fq = await Promise.all(syms.map(s => fhQuote(s).catch(() => null)));
        const fItems = [];
        for (let i = 0; i < syms.length; i++) {
          const q = fq[i];
          if (!q) continue;
          fItems.push({ symbol: syms[i], name: NAMES[syms[i]] || syms[i], price: q.price, change: q.change, changePct: q.changePct, isOpen: true });
        }
        if (fItems.length) {
          tickerCache.set(tKey, { t: Date.now(), items: fItems });
          res.status(200).json({ items: fItems });
          return;
        }
      }
      const j = await td('quote', { symbol: tKey }, apiKey);
      // Twelve Data returns an object keyed by symbol when multiple, or a single object
      const raw = syms.length === 1 ? { [syms[0]]: j } : j;
      const items = [];
      for (const s of syms) {
        const q = raw[s];
        if (!q || q.status === 'error') continue;
        items.push({
          symbol: q.symbol || s, name: q.name || s,
          price: +q.close, change: +q.change, changePct: +q.percent_change,
          isOpen: !!q.is_market_open,
        });
      }
      tickerCache.set(tKey, { t: Date.now(), items });
      res.status(200).json({ items });
      return;
    }

    if (mode === 'learn') {
      const lang = body.lang || 'ar';
      const topic = String(body.topic || '').slice(0, 300);
      const userQ = String(body.question || '').slice(0, 500);
      if (!topic && !userQ) { res.status(400).json({ error: 'topic or question required' }); return; }
      const exSym = symbol || 'AAPL';
      // Live example data — ONE API call only (time_series); indicators computed locally; cached 60s
      let live = null;
      const cached = learnCache.get(exSym);
      if (cached && Date.now() - cached.t < 60000) {
        live = cached.live;
      } else {
        const series = await anySeries(exSym, 60, apiKey);
        const vals = (series && series.values || []).slice().reverse(); // oldest -> newest
        const closes = vals.map(v => +v.close);
        if (closes.length >= 2) {
          const last = vals[vals.length - 1];
          const prevClose = closes[closes.length - 2];
          const price = closes[closes.length - 1];
          const sma20 = closes.length >= 20 ? (closes.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(2) : null;
          // RSI14 (Wilder)
          let rsiVal = null;
          if (closes.length >= 15) {
            let g = 0, l = 0;
            for (let i = 1; i <= 14; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d; }
            let ag = g / 14, al = l / 14;
            for (let i = 15; i < closes.length; i++) {
              const d = closes[i] - closes[i - 1];
              ag = (ag * 13 + Math.max(d, 0)) / 14;
              al = (al * 13 + Math.max(-d, 0)) / 14;
            }
            rsiVal = al === 0 ? '100.0' : (100 - 100 / (1 + ag / al)).toFixed(1);
          }
          // MACD (12,26,9)
          let macdOut = null;
          if (closes.length >= 35) {
            const ema = (arr, p) => {
              const k = 2 / (p + 1); const out = [arr[0]];
              for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
              return out;
            };
            const e12 = ema(closes, 12), e26 = ema(closes, 26);
            const macdLine = closes.map((_, i) => e12[i] - e26[i]);
            const sig = ema(macdLine.slice(25), 9);
            const m = macdLine[macdLine.length - 1], s = sig[sig.length - 1];
            macdOut = { macd: m.toFixed(3), signal: s.toFixed(3), hist: (m - s).toFixed(3) };
          }
          live = {
            symbol: exSym, price, prevClose,
            change: +(price - prevClose).toFixed(2),
            changePct: +(((price - prevClose) / prevClose) * 100).toFixed(2),
            dayHigh: +last.high, dayLow: +last.low, volume: +last.volume,
            sma20, rsi14: rsiVal, macd: macdOut,
            last10Closes: closes.slice(-10),
          };
          learnCache.set(exSym, { t: Date.now(), live });
        }
      }

      const aKey = process.env.ANTHROPIC_API_KEY;
      if (!aKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }
      const langNames = { ar: 'Arabic', en: 'English', fr: 'French', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali' };
      const prompt = `You are a friendly, expert trading TEACHER for complete beginners.\n\n${topic ? `LESSON TOPIC: ${topic}\n` : ''}${userQ ? `STUDENT QUESTION: ${userQ}\n` : ''}\nLIVE MARKET DATA RIGHT NOW for ${exSym} (use it as the real example throughout the lesson):\n${JSON.stringify(live)}\n\nRules:\n- Reply in ${langNames[lang] || 'Arabic'} with simple, clear language for beginners.\n- ALWAYS teach using the live numbers above (real price, real RSI, real MACD, real SMA) — say "الآن سعر ... فعليًا" style so the student learns on the real market.\n- Structure: short intro → explanation with the live example → 💡 practical tip → ❓ one quick self-check question for the student.\n- Keep it focused (~250-400 words). No investment advice, education only.\n- End with exactly: "⚠️ بيانات تقريبية وقد تتأخر — ليست نصيحة استثمارية." (translated to the reply language).`;
      const callClaude = (m) => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, max_tokens: 1600, messages: [{ role: 'user', content: prompt }] }),
      });
      let ar = await callClaude('claude-sonnet-4-20250514');
      if (ar.status === 404) {
        const lr = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
          headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01' },
        });
        if (lr.ok) {
          const ld = await lr.json();
          const ids = (ld.data || []).map((mm) => mm.id);
          const preferred = ids.find((id) => /sonnet/i.test(id)) || ids.find((id) => /haiku/i.test(id)) || ids[0];
          if (preferred) ar = await callClaude(preferred);
        }
      }
      const aj = await ar.json();
      const txtBlock = Array.isArray(aj.content) ? aj.content.find((c) => c && c.type === 'text' && c.text) : null;
      const lesson = (txtBlock && txtBlock.text) || null;
      const claudeError = lesson ? undefined : ((aj.error && aj.error.message) || ('HTTP ' + ar.status));
      res.status(200).json({ live, lesson, claudeError });
      return;
    }

    if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }

    if (mode === 'analyze') {
      const lang = body.lang || 'ar';
      // 1) live data: quote + daily series only (2 credits); RSI/MACD computed locally
      let [quote, series] = await Promise.all([
        fhQuote(symbol).then(fq => fq ? { symbol, name: symbol, close: fq.price, change: fq.change, percent_change: fq.changePct, high: fq.high, low: fq.low, previous_close: fq.prevClose, volume: 0, currency: 'USD', is_market_open: true } : td('quote', { symbol }, apiKey)).catch(() => null),
        anySeries(symbol, 60, apiKey),
      ]);
      if (!quote || quote.status === 'error') {
        const fq = await fhQuote(symbol).catch(() => null);
        if (fq) quote = { symbol, name: symbol, close: fq.price, change: fq.change, percent_change: fq.changePct, high: fq.high, low: fq.low, previous_close: fq.prevClose, volume: 0, currency: 'USD', is_market_open: true };
      }
      if (!quote) { res.status(502).json({ error: 'no quote data' }); return; }
      // local indicators from series closes (oldest -> newest)
      const cAsc = (series && series.values || []).map(v => +v.close).reverse();
      let rsiLocal = null;
      if (cAsc.length >= 15) {
        let g = 0, l = 0;
        for (let i = 1; i <= 14; i++) { const d = cAsc[i] - cAsc[i - 1]; if (d > 0) g += d; else l -= d; }
        let ag = g / 14, al = l / 14;
        for (let i = 15; i < cAsc.length; i++) {
          const d = cAsc[i] - cAsc[i - 1];
          ag = (ag * 13 + Math.max(d, 0)) / 14;
          al = (al * 13 + Math.max(-d, 0)) / 14;
        }
        rsiLocal = al === 0 ? '100.0' : (100 - 100 / (1 + ag / al)).toFixed(1);
      }
      let macdLocal = null;
      if (cAsc.length >= 35) {
        const ema = (arr, p) => {
          const k = 2 / (p + 1); const out = [arr[0]];
          for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
          return out;
        };
        const e12 = ema(cAsc, 12), e26 = ema(cAsc, 26);
        const line = cAsc.map((_, i) => e12[i] - e26[i]);
        const sig = ema(line.slice(25), 9);
        const m = line[line.length - 1], s = sig[sig.length - 1];
        macdLocal = { macd: m.toFixed(3), macd_signal: s.toFixed(3), macd_hist: (m - s).toFixed(3) };
      }

      // 2) latest news via Tavily (best-effort)
      let news = [];
      try {
        const tKey = process.env.TAVILY_API_KEY;
        if (tKey) {
          const nr = await fetch('https://api.tavily.com/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: tKey, query: `${quote.name || symbol} stock latest news`, max_results: 4, days: 7, topic: 'news' }),
          });
          const nj = await nr.json();
          news = (nj.results || []).map(x => ({ title: x.title, snippet: (x.content || '').slice(0, 200) }));
        }
      } catch (_) {}

      const closes = (series && series.values || []).map(v => +v.close).reverse();
      const sma20 = closes.length >= 20 ? (closes.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(2) : null;
      const sma50 = closes.length >= 50 ? (closes.slice(-50).reduce((a, b) => a + b, 0) / 50).toFixed(2) : null;
      const hi60 = closes.length ? Math.max(...closes).toFixed(2) : null;
      const lo60 = closes.length ? Math.min(...closes).toFixed(2) : null;
      const rsiVal = rsiLocal;
      const macdVal = macdLocal;

      const facts = {
        symbol: quote.symbol, name: quote.name, price: +quote.close,
        change: +quote.change, changePct: +quote.percent_change,
        dayHigh: +quote.high, dayLow: +quote.low, prevClose: +quote.previous_close,
        volume: +quote.volume, currency: quote.currency, marketOpen: !!quote.is_market_open,
        sma20, sma50, high60d: hi60, low60d: lo60, rsi14: rsiVal,
        macd: macdVal ? { macd: (+macdVal.macd).toFixed(3), signal: (+macdVal.macd_signal).toFixed(3), hist: (+macdVal.macd_hist).toFixed(3) } : null,
        news,
      };

      // 3) Claude analysis
      const aKey = process.env.ANTHROPIC_API_KEY;
      if (!aKey) { res.status(200).json({ facts, analysis: null }); return; }
      const userQ = String(body.question || '').slice(0, 500);
      const langNames = { ar: 'Arabic', en: 'English', fr: 'French', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali' };
      const prompt = `You are an expert stock market analyst. Analyze this stock using ONLY the real data below.\n\nDATA:\n${JSON.stringify(facts)}\n\n${userQ ? `USER QUESTION: ${userQ}\n\n` : ''}Reply in ${langNames[lang] || 'Arabic'}. Structure (use these exact section emojis):\n📊 نظرة عامة — trend direction (up/down/sideways) in 1-2 sentences\n📈 التحليل الفني — interpret RSI, MACD, SMA20/50, 60-day high/low; give support & resistance levels with numbers\n📰 الأخبار — link recent news to price action (skip if no news)\n⚖️ نقاط القوة والضعف — 2-3 bullets each\n👁️ مستويات للمراقبة — key numeric levels\n\nBe concise, numeric, professional. End with exactly: "⚠️ تحليل تقريبي — ليس نصيحة استثمارية" (translated to the reply language).`;
      const callClaude = (m) => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      });
      let ar = await callClaude('claude-sonnet-4-20250514');
      if (ar.status === 404) {
        // model unavailable on this key — pick best available sonnet/haiku
        const lr = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
          headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01' },
        });
        if (lr.ok) {
          const ld = await lr.json();
          const ids = (ld.data || []).map((mm) => mm.id);
          const preferred = ids.find((id) => /sonnet/i.test(id)) || ids.find((id) => /haiku/i.test(id)) || ids[0];
          if (preferred) ar = await callClaude(preferred);
        }
      }
      const aj = await ar.json();
      const txtBlock = Array.isArray(aj.content) ? aj.content.find((c) => c && c.type === 'text' && c.text) : null;
      const analysis = (txtBlock && txtBlock.text) || null;
      const claudeError = analysis ? undefined : ((aj.error && aj.error.message) || ('HTTP ' + ar.status + ' :: ' + JSON.stringify(aj).slice(0, 300)));
      res.status(200).json({ facts, analysis, claudeError });
      return;
    }

    if (mode === 'series') {
      const interval = ['5min', '15min', '1h', '1day', '1week'].includes(body.interval) ? body.interval : '1day';
      const j = interval === '1day' ? (await anySeries(symbol, 90, apiKey) || {}) : await td('time_series', { symbol, interval, outputsize: 90 }, apiKey);
      const values = (j.values || []).map(v => ({
        t: v.datetime, o: +v.open, h: +v.high, l: +v.low, c: +v.close,
      })).reverse();
      res.status(200).json({ symbol, interval, values, currency: (j.meta && j.meta.currency) || '' });
      return;
    }

    // default: quote (Finnhub fallback if Twelve Data fails)
    let j;
    try { j = await td('quote', { symbol }, apiKey); }
    catch (e) {
      const fq = await fhQuote(symbol).catch(() => null);
      if (!fq) throw e;
      j = { symbol, name: symbol, close: fq.price, open: fq.open, high: fq.high, low: fq.low, previous_close: fq.prevClose, change: fq.change, percent_change: fq.changePct, volume: 0, currency: 'USD', is_market_open: true };
    }
    res.status(200).json({
      symbol: j.symbol, name: j.name, exchange: j.exchange, currency: j.currency,
      price: +j.close, open: +j.open, high: +j.high, low: +j.low,
      prevClose: +j.previous_close, change: +j.change, changePct: +j.percent_change,
      volume: +j.volume, isOpen: !!j.is_market_open, datetime: j.datetime,
    });
  } catch (err) {
    res.status(502).json({ error: String((err && err.message) || err) });
  }
};
