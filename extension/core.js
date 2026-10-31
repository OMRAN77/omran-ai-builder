// Analysis helpers for the TARYAM live inspector, shared by the content script.
// Plain script (no modules): everything hangs off window.TARYAM. It only reads and
// measures; it never changes a request, a result or a balance.
(function () {
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

  function colorOf(n) {
    if (n === 0 || n === '00') return 'green';
    return RED.has(Number(n)) ? 'red' : 'black';
  }

  // Abramowitz & Stegun 7.1.26: erfc to ~1e-7, enough for a live z-test readout.
  function erfc(x) {
    const z = Math.abs(x);
    const t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
      t * (-0.82215223 + t * 0.17087277))))))))); 
    return x >= 0 ? r : 2 - r;
  }
  const pFromZ = (z) => erfc(Math.abs(z) / Math.SQRT2);

  // The true house edge of every bet, per wheel. On a single-zero wheel every bet
  // returns 36/37 (2.70% edge); double-zero returns 36/38 (5.26%).
  function houseEdge(wheel) {
    const K = wheel === 'american' ? 38 : 37;
    const def = [['straight', 35, 1], ['split', 17, 2], ['street', 11, 3], ['corner', 8, 4], ['line', 5, 6], ['column', 2, 12], ['dozen', 2, 12], ['even', 1, 18]];
    if (wheel === 'american') def.splice(4, 0, ['basket', 6, 5]);
    return def.map(([bet, payout, ways]) => {
      const p = ways / K;
      const rtp = (payout + 1) * p;
      return { bet, payout, ways, winProb: p, rtp, edge: 1 - rtp };
    });
  }

  // Red/black (and other even-money) binomial z, zeroes excluded.
  function evenTest(spins, pick) {
    let hits = 0, trials = 0;
    for (const s of spins) { const v = pick(s); if (v === null) continue; trials++; if (v) hits++; }
    if (!trials) return { hits, trials, share: 0, z: 0, pValue: 1, pass: true };
    const z = (hits - trials * 0.5) / Math.sqrt(trials * 0.25);
    return { hits, trials, share: hits / trials, z, pValue: pFromZ(z), pass: pFromZ(z) >= 0.01 };
  }

  // Each pocket's z against 1/K, with a hottest number and a Bonferroni flag.
  function bias(spins, wheel) {
    const K = wheel === 'american' ? 38 : 37;
    const n = spins.length;
    const e = n / K;
    const sd = Math.sqrt(n * (1 / K) * (1 - 1 / K));
    const c = new Map();
    for (const s of spins) c.set(String(s), (c.get(String(s)) || 0) + 1);
    const rows = [...c.entries()].map(([pocket, observed]) => {
      const z = sd > 0 ? (observed - e) / sd : 0;
      return { pocket, observed, expected: e, z, pValue: pFromZ(z), color: colorOf(pocket === '00' ? '00' : Number(pocket)) };
    }).sort((a, b) => b.z - a.z);
    const threshold = 0.01 / K;
    return { rows, hot: rows[0], flagged: rows.filter((r) => r.pValue < threshold), threshold, expected: e, enough: e >= 5 };
  }

  function analyze(spins, wheel) {
    const red = (s) => (s === 0 || s === '00' ? null : RED.has(Number(s)));
    const odd = (s) => (s === 0 || s === '00' ? null : Number(s) % 2 === 1);
    const high = (s) => (s === 0 || s === '00' ? null : Number(s) >= 19);
    const even = { redBlack: evenTest(spins, red), oddEven: evenTest(spins, odd), highLow: evenTest(spins, high) };
    const b = bias(spins, wheel);
    const K = wheel === 'american' ? 38 : 37;
    const enoughEven = even.redBlack.trials >= 30;
    let verdict = 'insufficient';
    if (enoughEven) verdict = (!even.redBlack.pass || b.flagged.length) ? 'anomaly' : 'fair';
    return { n: spins.length, wheel, pockets: K, even, bias: b, verdict, enoughPocket: spins.length >= 5 * K };
  }

  // Certified provider host fragments. A roulette served from one of these is the
  // genuine, licensed game; served from the casino's own domain or an unknown host,
  // it is the casino that controls the outcome — the central forensic question.
  const PROVIDERS = [
    'evolution.com', 'evo-games.com', 'egcvx.com', 'netent.com', 'netentstatic.com',
    'pragmaticplay.net', 'ppgames.net', 'pragmaticplay.com', 'pragmaticplaylive.net',
    'playtech.com', 'ptitv.com', 'microgaming', 'quickfire', 'games-cdn', 'ezugi.com',
    'hacksawgaming.com', 'nolimitcity.com', 'redtiger', 'relaxg.com', 'playngonetwork.com',
    'authenticgaming', 'vivogaming', 'luckystreak', 'absolutelivegaming',
  ];
  function hostOf(url) { try { return new URL(url, location.href).hostname.toLowerCase(); } catch (e) { return ''; } }
  function registrable(host) { const p = host.split('.'); return p.slice(-2).join('.'); }

  // Many casinos proxy a licensed provider's feed through their own domain, so the
  // registrable domain reads as the casino while a subdomain label still names the
  // provider (pg = Pragmatic, swarm/evo = Evolution, …). Catch that hint.
  const PROVIDER_HINTS = ['pragmatic', 'pg', 'evolution', 'evo', 'swarm', 'netent', 'playtech', 'ptlive', 'ezugi', 'vivo', 'hacksaw', 'nolimit', 'redtiger', 'relax', 'playngo', 'authentic'];
  function providerHint(host) {
    for (const label of host.split('.')) {
      for (const h of PROVIDER_HINTS) {
        if (label === h || label.startsWith(h + '-') || label.endsWith('-' + h) || label.includes('-' + h + '-')) return h;
      }
    }
    return '';
  }
  function classifyHost(url, casinoHost) {
    const host = hostOf(url);
    if (!host) return { host: '', kind: 'unknown', hint: '' };
    if (PROVIDERS.some((p) => host.includes(p))) return { host, kind: 'provider', hint: '' };
    const casinoReg = registrable(casinoHost || hostOf(location.href));
    const onCasino = casinoReg && (host === casinoReg || host.endsWith('.' + casinoReg) || registrable(host) === casinoReg);
    if (onCasino) {
      const hint = providerHint(host);
      // A provider-named subdomain on the casino's own domain: the feed is a
      // licensed provider's, but served (proxied) through the casino's domain.
      if (hint) return { host, kind: 'proxied', hint };
      return { host, kind: 'casino', hint: '' };
    }
    return { host, kind: 'unknown', hint: '' };
  }

  // Heuristics over a captured JSON/text payload: pull plausible roulette results
  // (0..36) and a balance-like number, so the panel can work before it is tuned to
  // the exact field names of a given casino.
  // A roulette pocket is an integer 0..36; a boolean is never one, even though
  // Number(true) === 1 — that is exactly what produced spurious 0/1 "results".
  function asPocket(v) {
    if (typeof v === 'boolean') return null;
    const n = Number(v);
    return (Number.isInteger(n) && n >= 0 && n <= 36) ? n : null;
  }
  // The winning number lives inside a round record alongside color/gameId/time
  // (Pragmatic's last20Results[].result). A bare scalar is trusted ONLY for an
  // unambiguous winning-number key — never bare "result"/"outcome", which are
  // routinely status codes (result:0 = OK) and produced the all-zero readout.
  const SCALAR_RESULT_KEYS = /^(winningnumber|winning_number|winnumber|winnum|luckynumber|resultnumber|pocket|slotresult)$/;
  function isRoundObj(o) {
    return o && typeof o === 'object' && !Array.isArray(o) &&
      ('color' in o || 'gameId' in o || 'gameid' in o || 'roundId' in o || 'roundid' in o || 'time' in o);
  }
  // XML <result score="17" color="red"/> carries the pocket in "score".
  function roundNum(o) { return o.result ?? o.number ?? o.outcome ?? o.winningNumber ?? o.winningnumber ?? o.winNumber ?? o.score; }
  function roundId(o) { return String(o.gameId ?? o.gameid ?? o.roundId ?? o.roundid ?? o.id ?? o.time ?? '') || null; }
  // Returns round records { n, id }; id lets the caller drop re-sent history.
  function guessNumbers(obj) {
    const out = [];
    const takeRound = (o) => {
      const r = asPocket(roundNum(o));
      if (r !== null) out.push({ n: r, id: roundId(o) });
    };
    const walk = (v, key) => {
      if (v === null || v === undefined || typeof v === 'boolean') return;
      if (Array.isArray(v)) { for (const x of v) { if (isRoundObj(x)) takeRound(x); else walk(x, key); } return; }
      if (typeof v === 'object') { if (isRoundObj(v)) takeRound(v); for (const k of Object.keys(v)) walk(v[k], k.toLowerCase()); return; }
      if (SCALAR_RESULT_KEYS.test(key || '')) { const n = asPocket(v); if (n !== null) out.push({ n, id: null }); }
    };
    walk(obj, '');
    return out;
  }
  function guessBalance(obj) {
    let best = null;
    const walk = (v, key) => {
      if (v === null || v === undefined || typeof v === 'boolean') return;
      if (Array.isArray(v)) { for (const x of v) walk(x, key); return; }
      if (typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], k.toLowerCase()); return; }
      const n = Number(v);
      // Balance-named fields only (not bet "amount"); keep the most recent.
      if (Number.isFinite(n) && n > 0 && /balance|wallet|cash|credit|funds/.test(key || '')) best = n;
    };
    walk(obj, '');
    return best;
  }

  // When the user maps an exact field name (for a casino whose keys we do not guess,
  // e.g. a WebSocket protocol), pull numbers / balance from that key by name.
  function byKeyNumbers(obj, name) {
    const out = []; const key = String(name || '').toLowerCase();
    const walk = (v, k) => {
      if (v === null || v === undefined || typeof v === 'boolean') return;
      if (Array.isArray(v)) { for (const x of v) walk(x, k); return; }
      if (typeof v === 'object') { for (const kk of Object.keys(v)) walk(v[kk], kk.toLowerCase()); return; }
      const n = asPocket(v);
      if (k === key && n !== null) out.push({ n, id: null });
    };
    walk(obj, '');
    return out;
  }
  function byKeyBalance(obj, name) {
    let best = null; const key = String(name || '').toLowerCase();
    const walk = (v, k) => {
      if (v === null || v === undefined) return;
      if (Array.isArray(v)) { for (const x of v) walk(x, k); return; }
      if (typeof v === 'object') { for (const kk of Object.keys(v)) walk(v[kk], kk.toLowerCase()); return; }
      const n = Number(v);
      if (k === key && Number.isFinite(n)) best = n;
    };
    walk(obj, '');
    return best;
  }

  // Non-JSON frames (many live protocols): scan the text for "name": value.
  function scanText(body, name) {
    const out = { numbers: [], balance: null };
    if (!name) return out;
    const re = new RegExp('"?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"?\\s*[:=]\\s*"?(-?\\d+(?:\\.\\d+)?)', 'gi');
    let m;
    while ((m = re.exec(body))) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n >= 0 && n <= 36) out.numbers.push(n);
      if (Number.isFinite(n)) out.balance = n;
    }
    return out;
  }


  // ---- Frame decoding. Live games wrap JSON in transport envelopes: SignalR ends
  // each record with \x1e, socket.io prefixes a packet number (42[...]), SockJS
  // sends a[...] of strings, and many feeds put JSON inside a JSON string. Some use
  // XML (<gameresult score="17" .../>) or protobuf binaries. Returns plain objects.
  const MAX_DEPTH = 6;
  function unwrapStrings(v, depth) {
    if (depth > MAX_DEPTH) return v;
    if (typeof v === 'string') {
      const t = v.trim();
      if ((t[0] === '{' && t[t.length - 1] === '}') || (t[0] === '[' && t[t.length - 1] === ']')) {
        try { return unwrapStrings(JSON.parse(t), depth + 1); } catch (e) { return v; }
      }
      if (t[0] === '<' && t[t.length - 1] === '>') { const x = parseXml(t); if (x.length) return x.length === 1 ? x[0] : x; }
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => unwrapStrings(x, depth + 1));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = unwrapStrings(v[k], depth + 1); return o; }
    return v;
  }
  function parseXml(text) {
    const out = []; const stack = [];
    const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let m, guard = 0;
    while ((m = re.exec(text)) && guard++ < 5000) {
      if (m[5] !== undefined) { const t = m[5].trim(); if (t && stack.length) stack[stack.length - 1]._text = t; continue; }
      const [, close, tag, attrs, self] = m;
      if (close) {
        const el = stack.pop(); if (!el) continue;
        if (el._text !== undefined && Object.keys(el).length === 2) el[el._tag] = el._text; // <number>17</number>
        attach(el); continue;
      }
      const el = { _tag: tag };
      const ar = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let a;
      while ((a = ar.exec(attrs))) el[a[1]] = a[2] !== undefined ? a[2] : a[3];
      if (self) attach(el); else stack.push(el);
    }
    while (stack.length) attach(stack.pop());
    function attach(el) {
      const parent = stack[stack.length - 1];
      if (!parent) { out.push(el); return; }
      const k = el._tag;
      if (parent[k] === undefined) parent[k] = el;
      else if (Array.isArray(parent[k])) parent[k].push(el);
      else parent[k] = [parent[k], el];
    }
    return out;
  }
  // Minimal protobuf wire decoder for binary frames (field n → "f<n>"). Rejects
  // anything that is not a clean message so random bytes do not become "fields".
  function decodeProto(bytes, depth) {
    const o = {}; let i = 0, fields = 0;
    const varint = () => { let r = 0, mul = 1, b; do { if (i >= bytes.length) throw 0; b = bytes[i++]; r += (b & 0x7f) * mul; mul *= 128; if (mul > 2 ** 56) throw 0; } while (b & 0x80); return r; };
    const put = (k, v) => { if (o[k] === undefined) o[k] = v; else if (Array.isArray(o[k])) o[k].push(v); else o[k] = [o[k], v]; };
    while (i < bytes.length) {
      const key = varint(); const fn = Math.floor(key / 8), wt = key % 8;
      if (fn < 1 || fn > 536870911) throw 0;
      const k = 'f' + fn;
      if (wt === 0) put(k, varint());
      else if (wt === 1) { if (i + 8 > bytes.length) throw 0; i += 8; }
      else if (wt === 5) { if (i + 4 > bytes.length) throw 0; i += 4; }
      else if (wt === 2) {
        const len = varint(); if (i + len > bytes.length) throw 0;
        const sub = bytes.subarray(i, i + len); i += len;
        let v = null;
        if (depth < MAX_DEPTH && len) { try { v = decodeProto(sub, depth + 1); } catch (e) { v = null; } }
        if (v === null) { let txt = ''; for (const b of sub) txt += String.fromCharCode(b); v = /^[\x20-\x7e]*$/.test(txt) ? txt : '[' + len + 'b]'; }
        put(k, v);
      } else throw 0;
      fields++;
    }
    if (!fields) throw 0;
    return o;
  }
  function b64bytes(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

  function decodeFrames(body) {
    if (body === null || body === undefined) return [];
    if (typeof body === 'object') return [unwrapStrings(body, 0)];
    const text = String(body);
    const b64 = /^\[binary \d+\] b64:([A-Za-z0-9+/=]+)/.exec(text);
    if (b64) { try { return [decodeProto(b64bytes(b64[1]), 0)]; } catch (e) { return []; } }
    const out = [];
    for (let part of text.split('\x1e')) {
      part = part.trim(); if (!part) continue;
      if (part[0] === '<') { const x = parseXml(part); for (const el of x) out.push(unwrapStrings(el, 0)); continue; }
      const m = /^(\d+)(?=[[{])/.exec(part); if (m) part = part.slice(m[1].length); // socket.io / engine.io
      else if (/^a\[/.test(part)) part = part.slice(1);                         // SockJS
      if (part[0] !== '{' && part[0] !== '[') continue;
      try { out.push(unwrapStrings(JSON.parse(part), 0)); } catch (e) { /* not JSON */ }
    }
    return out;
  }

  function ordOf(o) {
    const t = o.time ?? o.timestamp ?? o.ts ?? o.date;
    if (t !== undefined && t !== null && t !== '') { const v = typeof t === 'number' ? t : (/^\d+$/.test(String(t)) ? Number(t) : Date.parse(t)); if (Number.isFinite(v)) return v; }
    const m = /(\d+)$/.exec(String(o.gameId ?? o.gameid ?? o.roundId ?? o.roundid ?? o.id ?? ''));
    return m ? Number(m[1]) : NaN;
  }
  // ---- Round extraction with a source path, so the inspector can tell a live
  // result from a re-sent history list and keep one source per table.
  const HISTORY_KEYS = /result|history|last|recent|number|win|spin|outcome|stat|roulette|score/;
  function extractRounds(obj, name) {
    const key0 = String(name || '').toLowerCase();
    const singles = [], lists = [];
    const walk = (v, key, path, parent, depth) => {
      if (depth > 12 || v === null || v === undefined || typeof v === 'boolean') return;
      if (Array.isArray(v)) {
        const pockets = v.map(asPocket);
        const allPockets = v.length >= 2 && v.every((x) => typeof x !== 'object' && typeof x !== 'boolean') && pockets.every((n) => n !== null);
        if (key0) {
          if (key === key0 && allPockets) { lists.push({ path, items: pockets }); return; }
        } else {
          const rounds = v.filter(isRoundObj);
          if (rounds.length && rounds.length === v.length) {
            let recs = rounds.map((o) => ({ n: asPocket(roundNum(o)), id: roundId(o), ord: ordOf(o) })).filter((r) => r.n !== null);
            // History arrays are often newest-first: put them oldest → newest by their
            // time (or numeric round id) so the learner sees the real sequence.
            if (recs.length > 1 && recs.every((r) => Number.isFinite(r.ord)) && new Set(recs.map((r) => r.ord)).size > 1) recs = recs.slice().sort((a, b) => a.ord - b.ord);
            if (recs.length >= 3 && recs.some((r) => !r.id)) { lists.push({ path, items: recs.map((r) => r.n) }); return; }
            for (const r of recs) singles.push({ n: r.n, id: r.id, path });
            for (const o of rounds) for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') walk(o[k], k.toLowerCase(), path + '[].' + k, o, depth + 1);
            return;
          }
          if (allPockets && v.length >= 3 && HISTORY_KEYS.test(key || '')) { lists.push({ path, items: pockets }); return; }
        }
        for (const x of v) walk(x, key, path + '[]', parent, depth + 1);
        return;
      }
      if (typeof v === 'object') {
        if (!key0 && isRoundObj(v)) {
          const n = asPocket(roundNum(v));
          if (n !== null) singles.push({ n, id: roundId(v), path });
          for (const k of Object.keys(v)) if (v[k] && typeof v[k] === 'object') walk(v[k], k.toLowerCase(), path + '.' + k, v, depth + 1);
          return;
        }
        for (const k of Object.keys(v)) walk(v[k], k.toLowerCase(), path + '.' + k, v, depth + 1);
        return;
      }
      const hit = key0 ? key === key0 : SCALAR_RESULT_KEYS.test(key || '');
      if (hit) {
        const n = asPocket(v);
        const id = parent && key0 && ('gameId' in parent || 'gameid' in parent || 'roundId' in parent || 'roundid' in parent || 'id' in parent) ? roundId(parent) : null;
        if (n !== null) singles.push({ n, id, path });
      }
    };
    walk(obj, '', '', null, 0);
    return { singles, lists };
  }

  // ---- Field discovery: which keys carry integers that look like pockets (0..36,
  // several distinct values, never out of range) across the captured bodies.
  const NOT_POCKET_KEY = /(^|_)(status|code|type|seq|sequence|time|timestamp|ts|ms|id|uid|version|ver|count|total|index|idx|len|length|size|err|error|ok|state|step|ack|ping|pong|op|cmd|event|msgtype|level|limit|min|max|page|currency|lang|delay|timeout|interval|duration|percent|pct)$|(id|time|seq|count|status|code|type|stamp|limit|timeout)$/;
  function fieldCandidates(bodies, opts) {
    const maxBodies = (opts && opts.maxBodies) || 300;
    const stats = new Map();
    const note = (key, v) => {
      if (!key || NOT_POCKET_KEY.test(key)) return;
      let s = stats.get(key); if (!s) { s = { key, count: 0, distinct: new Set(), bad: false, sample: [] }; stats.set(key, s); }
      if (s.bad) return;
      const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN);
      if (!Number.isFinite(n)) { if (typeof v === 'string' && v !== '') s.bad = true; return; }
      if (!Number.isInteger(n) || n < 0 || n > 36) { s.bad = true; return; }
      s.count++; s.distinct.add(n); s.sample.push(n); if (s.sample.length > 8) s.sample.shift();
    };
    const walk = (v, key, depth) => {
      if (depth > 12 || v === null || v === undefined || typeof v === 'boolean') return;
      if (Array.isArray(v)) { for (const x of v) walk(x, key, depth + 1); return; }
      if (typeof v === 'object') { for (const k of Object.keys(v)) if (k !== '_tag' && k !== '_text') walk(v[k], k.toLowerCase(), depth + 1); return; }
      note(key, v);
    };
    let used = 0;
    for (const b of bodies) {
      if (used++ >= maxBodies) break;
      for (const o of decodeFrames(b)) walk(o, '', 0);
    }
    return [...stats.values()].filter((s) => !s.bad && s.distinct.size >= 3)
      .map((s) => ({ key: s.key, count: s.count, distinct: s.distinct.size, sample: s.sample.slice() }))
      .sort((a, b) => b.distinct - a.distinct || b.count - a.count).slice(0, 8);
  }

  // ---- History snapshots without round ids ("last 12 results" lists re-sent with
  // every update). The first snapshot only records; the second reveals whether new
  // numbers enter at the front (newest-first) or the back (oldest-first) and seeds
  // the history; later snapshots add only the numbers that are actually new.
  function overlapNewestFirst(prev, arr, minOv) {
    for (let k = 0; k <= arr.length; k++) {
      const ov = Math.min(prev.length, arr.length - k);
      if (ov < minOv) break;
      let ok = true; for (let i = 0; i < ov; i++) if (arr[k + i] !== prev[i]) { ok = false; break; }
      if (ok) return k;
    }
    return -1;
  }
  function overlapOldestFirst(prev, arr, minOv) {
    for (let k = 0; k <= prev.length; k++) {
      const ov = Math.min(prev.length - k, arr.length);
      if (ov < minOv) break;
      let ok = true; for (let i = 0; i < ov; i++) if (prev[k + i] !== arr[i]) { ok = false; break; }
      if (ok) return prev.length - k; // arr.slice(this) is new
    }
    return -1;
  }
  function mergeSnapshot(st, arr) {
    arr = (arr || []).map(Number);
    const added = [];
    if (!st || !st.prev) return { state: { prev: arr, orient: st ? st.orient || null : null }, added };
    const prev = st.prev;
    const minOv = Math.max(1, Math.min(3, prev.length - 1, arr.length - 1));
    const kN = overlapNewestFirst(prev, arr, minOv);
    const cO = overlapOldestFirst(prev, arr, minOv);
    const newN = kN >= 0 ? arr.slice(0, kN).reverse() : null;
    const newO = cO >= 0 ? arr.slice(cO) : null;
    let orient = st.orient;
    if (!orient) {
      const nN = newN ? newN.length : Infinity, nO = newO ? newO.length : Infinity;
      if (nN === 0 || nO === 0 || (nN === Infinity && nO === Infinity)) return { state: { prev: arr, orient: null }, added };
      orient = nN <= nO ? 'newest' : 'oldest';
      // Seed: the whole known history, oldest → newest.
      if (orient === 'newest') added.push(...prev.slice().reverse(), ...newN);
      else added.push(...prev, ...newO);
      return { state: { prev: arr, orient }, added };
    }
    const fresh = orient === 'newest' ? newN : newO;
    if (fresh) added.push(...fresh);
    return { state: { prev: arr, orient }, added };
  }

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  window.TARYAM = { RED, colorOf, erfc, pFromZ, houseEdge, analyze, bias, classifyHost, hostOf, registrable, guessNumbers, guessBalance, byKeyNumbers, byKeyBalance, scanText, sha256Hex, PROVIDERS, decodeFrames, parseXml, decodeProto, extractRounds, fieldCandidates, mergeSnapshot, asPocket };
})();
