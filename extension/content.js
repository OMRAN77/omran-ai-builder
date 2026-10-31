// TARYAM live inspector — the content script. It injects the page-world hook,
// listens to the real traffic it reports, and shows a floating panel over the
// casino: live roulette numbers, the balance before and now, where the game is
// served from, and a growing fairness read. It only reads; it changes nothing.
(function () {
  const T = window.TARYAM;
  const isExt = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;
  // The casino shell loads the live game in an iframe on another host. Every frame
  // captures its own traffic; child frames forward it up, and only the top frame
  // shows one aggregating panel.
  const isTop = (function () { try { return window.top === window; } catch (e) { return false; } })();
  // The panel shows on the casino shell, or on a licensed provider's page when the
  // game is opened on its own in a tab.
  const onCasinoShell = /dubibet/i.test(location.hostname) || T.classifyHost(location.href, location.hostname).kind === 'provider';
  const active = isTop && onCasinoShell; // only this frame aggregates and shows the panel
  const hookedFlag = () => { try { return document.documentElement.getAttribute('data-taryam-hooked') === '1'; } catch (e) { return false; } };

  // 1. The page-world hook normally runs from the manifest (world: MAIN) before any
  // page script, so no WebSocket is missed. Older Chrome: inject it as a fallback.
  if (isExt && !window.__taryamHooked && !hookedFlag()) {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('inpage.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  // 2. State.
  const state = {
    wheel: 'european',
    spins: [],          // winning numbers, oldest → newest
    startBalance: null,
    balance: null,
    hosts: new Map(),   // host → { kind, count }
    events: [],         // last raw captured payloads (for display)
    raw: [],            // last raw bodies (newest-first) for re-parsing on remap
    diag: new Map(),    // host → its own last frames, so one chatty socket cannot evict the rest
    seenRounds: new Set(), // round ids already counted, so re-sent history is not double-counted
    fieldMap: { result: '', balance: '' },
    startedAt: new Date(),
    min: false,
    snaps: {},          // history-list source → snapshot state (id-less "last results" lists)
    sources: new Map(), // source (host + path) → how many numbers it carried
    idSource: false,    // (kept for saved sessions from 1.1.0)
    idlessSrc: null,    // the primary source being counted (avoids double counting)
    srcInfo: new Map(), // other sources' rounds since the primary last spoke (for fail-over)
    primaryT: 0,
    lastSpinT: 0,
    forcedSrc: null,    // source picked by hand in «ضبط الحقول»
    base: null,         // what was saved from earlier page loads on this site
    loaded: false,
    fair: { seen: new Set(), rows: [] },
    ai: null,
    aiPending: false,
  };
  const MAX_EVENTS = 40;
  const MAX_RAW = 1500; // enough history to re-read a whole session when a field is picked later

  function noteHost(url) {
    const c = T.classifyHost(url, location.hostname);
    if (!c.host) return;
    const cur = state.hosts.get(c.host) || { kind: c.kind, count: 0, hint: c.hint || '' };
    cur.count++; cur.kind = c.kind; cur.hint = c.hint || cur.hint || '';
    state.hosts.set(c.host, cur);
  }
  // Extract the round numbers and the balance from one captured body. Frames are
  // unwrapped first (SignalR / socket.io / nested JSON / XML / protobuf), then the
  // mapped field names are used when given, otherwise the automatic heuristics.
  function parseBody(body, url) {
    const out = { items: [], lists: [], balance: null, fair: [] };
    if (!body) return out;
    const host = T.hostOf(url || '') || '';
    const objs = T.decodeFrames(body);
    if (objs.length) {
      for (const obj of objs) {
        const r = T.extractRounds(obj, state.fieldMap.result);
        for (const it of r.singles) out.items.push({ n: it.n, id: it.id, idn: it.idn, tn: it.tn, src: host + (it.path || '·') });
        if (!state.fieldMap.result) for (const f of T.fairRecords(obj)) out.fair.push(f);
        for (const l of r.lists) out.lists.push({ src: host + (l.path || '·'), items: l.items });
        const b = state.fieldMap.balance ? T.byKeyBalance(obj, state.fieldMap.balance) : T.guessBalance(obj);
        if (b !== null) out.balance = b;
      }
    } else {
      const r = T.scanText(body, state.fieldMap.result);
      const b = T.scanText(body, state.fieldMap.balance);
      out.items = r.numbers.map((n) => ({ n, id: null, src: host + '·text:' + state.fieldMap.result }));
      out.balance = b.balance;
    }
    return out;
  }
  function noteSource(src, k) { const c = state.sources.get(src) || 0; state.sources.set(src, c + k); }
  // Several sockets often carry the same rounds (a live result plus a re-sent
  // history, or a lobby feed). One primary source is counted, so nothing is doubled.
  // If it goes quiet while another source keeps reporting new rounds, the count
  // fails over to that source — a one-shot history frame can never freeze the count.
  const FAILOVER_MS = 75000;
  function srcInfo(src) { let x = state.srcInfo.get(src); if (!x) { x = { pending: [] }; state.srcInfo.set(src, x); } return x; }
  function addSpin(n, t) { state.spins.push(n); state.lastSpinT = t || Date.now(); if (state.ai && !state.aiPending) state.ai.observe(n); }
  function emit(src, recs, t) { // recs oldest → newest, already new for this source
    if (!recs.length) return;
    if (state.forcedSrc && src !== state.forcedSrc) return;
    if (!state.idlessSrc) state.idlessSrc = src;
    if (src === state.idlessSrc) {
      for (const r of recs) { if (r.id) state.seenRounds.add(r.id); addSpin(r.n, t); }
      state.primaryT = t;
      for (const x of state.srcInfo.values()) x.pending.length = 0;
      return;
    }
    const x = srcInfo(src);
    for (const r of recs) x.pending.push({ n: r.n, id: r.id, t });
    if (x.pending.length > 60) x.pending.splice(0, x.pending.length - 60);
    if (state.forcedSrc || t - (state.primaryT || 0) <= FAILOVER_MS || x.pending.length < 2) return;
    // Fail over. Drop the copies of rounds the old primary already counted.
    let pend = x.pending.filter((r) => !(r.id && state.seenRounds.has(r.id)));
    let j = 0;
    for (let k = Math.min(pend.length, state.spins.length); k > 0 && !j; k--) {
      let ok = true;
      for (let i = 0; i < k; i++) if (pend[i].n !== state.spins[state.spins.length - k + i] || pend[i].t - (state.primaryT || 0) > 30000) { ok = false; break; }
      if (ok) j = k;
    }
    pend = pend.slice(j);
    state.idlessSrc = src;
    x.pending.length = 0;
    state.failovers = (state.failovers || 0) + 1;
    emit(src, pend, t);
  }
  // Provably-fair audit. A published hash only proves something if it reached the
  // player BEFORE the bet (a commitment). For every newly finished round: check
  // SHA-512(resultKey + resultSalt) = resultHash, that resultKey names the same
  // pocket, and whether that hash was seen in any earlier frame.
  const hashFirst = new Map(); // 128-hex hash → sequence number of the first frame it appeared in
  let frameSeq = 0;
  function noteHashes(body) {
    const seq = ++frameSeq;
    const m = String(body).match(/\b[0-9a-fA-F]{128}\b/g);
    if (m) for (const h of m) { const k = h.toLowerCase(); if (!hashFirst.has(k)) hashFirst.set(k, seq); }
    if (hashFirst.size > 20000) hashFirst.delete(hashFirst.keys().next().value);
    return seq;
  }
  function auditFair(recs, seq) {
    const f = state.fair;
    for (const r of recs) {
      if (f.seen.has(r.id)) continue;
      f.seen.add(r.id);
      const first = hashFirst.get(r.hash.toLowerCase());
      const pre = first !== undefined && seq !== undefined && first < seq;
      const keyN = T.keyNum(r.key);
      const row = { id: r.id, n: r.n, pre, keyOk: keyN === undefined || keyN === r.n, hashOk: null };
      f.rows.push(row); if (f.rows.length > 2000) f.rows.shift();
      T.sha512Hex(r.key + r.salt).then((h) => { row.hashOk = h.toLowerCase() === r.hash.toLowerCase(); scheduleRender(); }).catch(() => { row.hashOk = null; });
    }
  }
  const IDS = '#ids'; // the virtual source of all rounds that carry a round id
  function applyParsed(p, t) {
    t = t || Date.now();
    const bySrc = new Map(); const ids = new Set();
    const push = (src, r) => { let a = bySrc.get(src); if (!a) { a = []; bySrc.set(src, a); } a.push(r); };
    // Rounds that carry an id are deduplicated by that id, so every id'd source (a
    // live result and its history list) is safe to merge: they form one source.
    const idRecs = [];
    for (const it of p.items) {
      noteSource(it.src, 1);
      if (it.id && !state.forcedSrc) {
        if (state.seenRounds.has(it.id) || ids.has(it.id)) continue;
        const x = state.srcInfo.get(IDS); if (x && x.pending.some((r) => r.id === it.id)) continue;
        ids.add(it.id); idRecs.push({ n: it.n, id: it.id, idn: it.idn, tn: it.tn });
        continue;
      }
      if (it.id) { if (state.seenRounds.has(it.id) || ids.has(it.id)) continue; ids.add(it.id); }
      push(it.src, { n: it.n, id: it.id });
    }
    if (idRecs.length) {
      const by = (k) => idRecs.length > 1 && idRecs.every((r) => Number.isFinite(r[k]));
      const sorted = by('idn') ? idRecs.slice().sort((a, b) => a.idn - b.idn) : by('tn') ? idRecs.slice().sort((a, b) => a.tn - b.tn) : idRecs;
      bySrc.set(IDS, sorted.map((r) => ({ n: r.n, id: r.id })));
    }
    for (const l of p.lists) {
      noteSource(l.src, l.items.length);
      const r = T.mergeSnapshot(state.snaps[l.src], l.items);
      state.snaps[l.src] = r.state;
      for (const n of r.added) push(l.src, { n, id: null });
    }
    const before = state.spins.length;
    for (const [src, recs] of bySrc) emit(src, recs, t);
    if (p.fair && p.fair.length) auditFair(p.fair, p.seq);
    if (p.balance !== null && Number.isFinite(p.balance)) {
      if (state.startBalance === null) state.startBalance = p.balance;
      if (state.balance !== p.balance) { state.balance = p.balance; schedulePersist(); }
    }
    if (state.spins.length !== before) schedulePersist();
  }
  // Rebuild everything from what was saved earlier plus this page's raw buffer —
  // used when the field mapping or the source changes, and after loading storage.
  function reparseAll() {
    const b = state.base;
    state.spins = b ? b.spins.slice() : [];
    state.seenRounds = new Set(b ? b.seen : []);
    state.snaps = b ? JSON.parse(JSON.stringify(b.snaps || {})) : {};
    state.startBalance = b && Number.isFinite(b.startBalance) ? b.startBalance : null;
    state.balance = b && Number.isFinite(b.balance) ? b.balance : null;
    const sameMap = b && (b.fieldResult || '') === state.fieldMap.result;
    state.idSource = false;
    state.idlessSrc = sameMap ? b.idlessSrc || null : null;
    state.srcInfo = new Map(); state.primaryT = b ? (b.loadedAt || 0) : 0; state.lastSpinT = 0;
    state.sources = new Map();
    for (let i = state.raw.length - 1; i >= 0; i--) { const p = parseBody(state.raw[i].body, state.raw[i].url); p.seq = state.raw[i].seq; applyParsed(p, state.raw[i].t); }
    rebuildAI();
    schedulePersist();
    render();
  }

  // 2-b. The AI learner. It learns incrementally; on a rebuild it replays the whole
  // session in small chunks so the page never freezes.
  let aiJob = 0;
  function rebuildAI() {
    if (!T.ai) return;
    const job = ++aiJob;
    const L = T.ai.createLearner();
    state.aiPending = true;
    const spins = state.spins.slice();
    let i = 0;
    (function step() {
      if (job !== aiJob) return;
      const end = Math.min(spins.length, i + 120);
      for (; i < end; i++) L.observe(spins[i]);
      if (i < spins.length) { setTimeout(step, 0); return; }
      for (let j = spins.length; j < state.spins.length; j++) L.observe(state.spins[j]);
      state.ai = L; state.aiPending = false; render();
    })();
  }

  // 2-c. Saved per site, so a page reload (very common in live casinos) does not
  // wipe the session the AI is learning from. «تصفير» deletes it.
  const store = isExt && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
  const SKEY = 'taryam:' + location.hostname;
  let persistTimer = null;
  function schedulePersist() {
    if (!store || !state.loaded || !isTop) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        store.set({ [SKEY]: {
          v: 1, spins: state.spins.slice(-6000), seen: [...state.seenRounds].slice(-6000), snaps: state.snaps,
          idSource: state.idSource, idlessSrc: state.idlessSrc, forcedSrc: state.forcedSrc, fieldResult: state.fieldMap.result,
          fieldMap: state.fieldMap, wheel: state.wheel, startBalance: state.startBalance, balance: state.balance,
          startedAt: state.startedAt.toISOString(),
        } });
      } catch (e) { /* storage full or context gone — keep running */ }
    }, 700);
  }
  function loadSaved() {
    const done = (saved) => {
      if (state.loaded) return;
      // A session counted from a junk field (e.g. "order" = 1,2,3 from site settings) is discarded.
      if (saved && saved.fieldResult && T.isNotPocketKey(saved.fieldResult)) saved = { v: 1, spins: [], deep: saved.deep, wheel: saved.wheel };
      if (saved && saved.v === 1 && Array.isArray(saved.spins)) {
        state.base = { spins: saved.spins.filter((n) => Number.isInteger(n) && n >= 0 && n <= 36), seen: saved.seen || [], snaps: saved.snaps || {},
          idSource: !!saved.idSource, idlessSrc: saved.idlessSrc || null, fieldResult: saved.fieldResult || '', startBalance: saved.startBalance, balance: saved.balance, loadedAt: Date.now() };
        if (saved.fieldMap) state.fieldMap = { result: saved.fieldMap.result || '', balance: saved.fieldMap.balance || '' };
        if (saved.wheel) state.wheel = saved.wheel;
        state.forcedSrc = saved.forcedSrc || null;
        if (saved.startedAt) { const d = new Date(saved.startedAt); if (!isNaN(d)) state.startedAt = d; }
      }
      state.loaded = true;
      reparseAll();
    };
    if (!store || !isTop) { done(null); return; }
    const t = setTimeout(() => done(null), 2500);
    try { store.get(SKEY, (r) => { clearTimeout(t); done(r && r[SKEY]); }); } catch (e) { clearTimeout(t); done(null); }
  }
  function resetAll() {
    aiJob++;
    Object.assign(state, { spins: [], events: [], raw: [], seenRounds: new Set(), startBalance: null, balance: null, startedAt: new Date(),
      snaps: {}, sources: new Map(), diag: new Map(), fair: { seen: new Set(), rows: [] }, idSource: false, idlessSrc: null, srcInfo: new Map(), primaryT: 0, lastSpinT: 0, forcedSrc: null, base: null, ai: T.ai ? T.ai.createLearner() : null, aiPending: false });
    state.hosts.clear();
    if (store) { try { store.remove(SKEY); } catch (e) { /* ignore */ } }
    render();
  }
  // Text frames are capped at 8 KB; binary (base64) frames are kept whole so they still decode.
  const rawCap = (b) => (b.startsWith('[binary ') ? b.slice(0, 20000) : b.slice(0, 12000));
  function ingest(ev) {
    if (ev.url) noteHost(ev.url);
    if (ev.body) {
      state.raw.unshift({ kind: ev.kind, url: ev.url || '', body: rawCap(String(ev.body)), t: Date.now() });
      if (state.raw.length > MAX_RAW) state.raw.length = MAX_RAW;
      const dh = T.hostOf(ev.url || '') || '?';
      let dq = state.diag.get(dh); if (!dq) { dq = []; state.diag.set(dh, dq); }
      dq.push({ t: Date.now(), kind: ev.kind, url: ev.url || '', body: String(ev.body).slice(0, 20000) });
      if (dq.length > 250) dq.shift();
      const seq = noteHashes(ev.body);
      state.raw[0].seq = seq;
      if (state.loaded) { const p = parseBody(ev.body, ev.url); p.seq = seq; applyParsed(p); } // before load, reparseAll replays it
      state.events.unshift({ kind: ev.kind, url: ev.url || '', body: String(ev.body).slice(0, 400), t: Date.now() });
    } else if (ev.kind !== 'ready') {
      state.events.unshift({ kind: ev.kind, url: ev.url || '', body: '', t: Date.now() });
    }
    if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
    scheduleRender();
  }
  // Live feeds send many frames a second: redraw at most ~3×/s, and never while
  // the user is typing in the panel (a redraw would steal the focus).
  let renderTimer = null;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => { renderTimer = null; if (root && root.activeElement && root.activeElement.tagName === 'INPUT') { scheduleRender(); return; } render(); }, 300);
  }
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d) return;
    if (d.__taryam && d.ev) {
      // Captured here in the page world. Top frame consumes it; a child frame
      // relays it up to the top so the one panel sees every frame's traffic.
      if (isTop) { if (active) ingest(d.ev); }
      else { try { window.top.postMessage({ __taryamFwd: true, ev: d.ev }, '*'); } catch (x) { /* guard-ok — cross-origin top may reject */ } }
    } else if (d.__taryamFwd && d.ev && active) {
      ingest(d.ev);
    }
  });

  // 3. Panel UI, isolated in a shadow root so the casino's CSS cannot touch it.
  let root, body;
  function build() {
    const host = document.createElement('div');
    host.id = 'taryam-inspector-host';
    host.style.cssText = 'position:fixed;z-index:2147483647;top:12px;inset-inline-end:12px;';
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    root.appendChild(style);
    const panel = document.createElement('div');
    panel.className = 'tp';
    panel.innerHTML = `
      <div class="tp-head" id="tp-drag">
        <span class="tp-dot"></span><strong>TARYAM — فاحص مباشر</strong>
        <span class="tp-sp"></span>
        <button class="tp-x" id="tp-min" title="طيّ">—</button>
      </div>
      <div class="tp-body" id="tp-body"></div>`;
    root.appendChild(panel);
    (document.body || document.documentElement).appendChild(host);
    body = root.getElementById('tp-body');
    root.getElementById('tp-min').addEventListener('click', () => { state.min = !state.min; render(); });
    dragify(host, root.getElementById('tp-drag'));
  }
  function dragify(host, handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('mousedown', (e) => { on = true; sx = e.clientX; sy = e.clientY; const r = host.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (!on) return; host.style.insetInlineEnd = 'auto'; host.style.left = (ox + e.clientX - sx) + 'px'; host.style.top = (oy + e.clientY - sy) + 'px'; });
    window.addEventListener('mouseup', () => { on = false; });
  }

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const money = (v) => (v === null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  const colorWord = (c) => (c === 'red' ? 'أحمر' : c === 'black' ? 'أسود' : 'أخضر');

  // The walk-forward backtest is O(n²); cache it by spin count so frequent renders
  // do not recompute it every captured message.
  let _btCache = { len: -1, val: null };
  function getBacktest(spins) {
    if (!T.predict || spins.length < 25) return null;
    if (_btCache.len === spins.length) return _btCache.val;
    _btCache = { len: spins.length, val: T.predict.backtest(spins, { k: 5 }) };
    return _btCache.val;
  }


  // Clickable suggestions for «ضبط الحقول»: keys that carry 0..36 numbers in the
  // captured traffic, and the sources the numbers came from (pick one by hand).
  let _fcCache = { len: -1, t: 0, val: [] };
  function fieldsHelp() {
    const now = Date.now();
    if (_fcCache.len !== state.raw.length && now - _fcCache.t > 1500) {
      _fcCache = { len: state.raw.length, t: now, val: T.fieldCandidates(state.raw.map((r) => r.body), { maxBodies: 250 }) };
    }
    const cands = _fcCache.val;
    const srcs = [...state.sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const active = state.forcedSrc || state.idlessSrc;
    return `<div class="tp-sub">حقول مقترحة (تحمل أرقام ٠–٣٦) — اضغط لاعتمادها:</div>
      <div class="tp-strip">${cands.length ? cands.map((c) => `<button class="tp-cbtn${state.fieldMap.result === c.key ? ' on' : ''}" data-fkey="${esc(c.key)}" title="${esc(c.sample.join(', '))}">${esc(c.key)} · ${c.distinct}</button>`).join('') : '<span class="tp-muted">لا اقتراح بعد — خلّ جولات تمرّ</span>'}</div>
      ${srcs.length ? `<div class="tp-sub">مصادر الأرقام — اضغط لحصر العدّ في واحد:</div>
      <div class="tp-srcs">${srcs.map(([src, c]) => `<button class="tp-sbtn${src === active ? ' on' : ''}" data-src="${esc(src)}">${esc(src.slice(-46))} · ${c}</button>`).join('')}</div>` : ''}`;
  }

  // The AI panel: next-spin top 5 from the learned mixture, how sure it is versus
  // chance, its honest walk-forward hit rate, the anytime-valid p-value, and which
  // expert currently leads. On a sound wheel «الصدفة» leads — that is the evidence.
  let _aiCache = { n: -1, val: null };
  function aiReport() {
    if (!state.ai) return null;
    if (_aiCache.n === state.ai.n && _aiCache.ref === state.ai) return _aiCache.val;
    _aiCache = { n: state.ai.n, ref: state.ai, val: state.ai.report() };
    return _aiCache.val;
  }
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + 'ث' : s < 3600 ? Math.round(s / 60) + 'د' : Math.round(s / 3600) + 'س'; };
  const pct = (v) => (v * 100).toFixed(1) + '٪';
  const pFmt = (p) => (p < 0.0001 ? '<0.0001' : p.toFixed(p < 0.01 ? 4 : 3));
  function fairStats() {
    const rows = state.fair.rows, n = rows.length;
    return { n, hashOk: rows.filter((r) => r.hashOk === true).length, hashBad: rows.filter((r) => r.hashOk === false).length,
      keyBad: rows.filter((r) => !r.keyOk).length, pre: rows.filter((r) => r.pre).length };
  }
  function fairVerdict(f) {
    if (f.hashBad || f.keyBad) return { cls: 'bad', text: '⚠ بصمة ما تطابق النتيجة — دليل تلاعب بالنتيجة بعد إعلان بصمتها' };
    if (!f.hashOk) return { cls: 'warn', text: typeof crypto !== 'undefined' && crypto.subtle ? 'جارٍ التحقّق من البصمة…' : 'تعذّر حساب البصمة في هذه الصفحة' };
    if (f.pre === f.n) return { cls: 'good', text: '✓ البصمة وصلت قبل الرهان ومطابقة — النتيجة كانت محدّدة مسبقًا ولم تتغيّر' };
    return { cls: 'warn', text: 'البصمة مطابقة، لكنها توصل مع النتيجة بعد الرهان — فهي ما تثبت إن النتيجة كانت محدّدة قبل رهانك' };
  }
  function fairSection() {
    const f = fairStats(); if (!f.n) return '';
    const v = fairVerdict(f);
    return `<div class="tp-sec">🔐 فحص «العدالة المُثبتة» (Provably Fair)</div>
      <div class="tp-verdict ${v.cls}">${v.text}<div class="s">SHA-512 ${f.hashOk}/${f.n} · resultKey ${f.n - f.keyBad}/${f.n} · before bet ${f.pre}/${f.n}</div></div>`;
  }
  function aiSection() {
    if (!T.ai) return '';
    const head = '<div class="tp-sec">🧠 الذكاء الاصطناعي — توقّع الجولة الجاية</div>';
    if (state.aiPending || !state.ai) return head + '<div class="tp-muted">يجهّز النموذج من الجولات المحفوظة…</div>';
    const r = aiReport();
    if (!r || !r.n) return head + '<div class="tp-verdict warn">التوقّع يطلع هنا بعد ١٠ جولات مُلتقطة — للحين ما وصلت نتائج من الطاولة (٠).</div>';
    if (r.n < 10) return head + `<div class="tp-muted">يتعلّم… يحتاج ١٠ جولات على الأقل (${r.n}).</div>`;
    const cls = r.predictable ? 'bad' : r.enough ? 'good' : 'warn';
    const verdict = r.predictable
      ? '⚠ نمط حقيقي: الذكاء الاصطناعي يتوقّع أفضل من الصدفة بفرق مؤكّد — خلل في المولّد أو العجلة'
      : r.enough ? 'لا نمط: الذكاء الاصطناعي ما يتفوّق على الصدفة — الجولة الجاية غير قابلة للتوقّع'
        : `يتعلّم ويقيس — ${r.n}/${r.minTrials} جولة قبل الحكم`;
    const bars = r.experts.map((e) => `<div class="tp-exp${e.id === r.leader.id ? ' lead' : ''}"><span class="nm">${esc(e.name)}</span><span class="bar"><i style="width:${Math.max(2, Math.round(e.weight * 100))}%"></i></span><span class="vv">${Math.round(e.weight * 100)}٪ · إصابة ${pct(e.hitRate)}</span></div>`).join('');
    return head + `
      <div class="tp-strip">${r.top.map((n) => `<span class="chip ${T.colorOf(n)}">${esc(n)}</span>`).join('')}</div>
      <div class="tp-muted" style="margin-bottom:6px">ثقة النموذج في الخمسة ${pct(r.mass)} مقابل صدفة ${pct(r.chance)} · القائد: ${esc(r.leader.name)}</div>
      <div class="tp-verdict ${cls}">${verdict}
        <div class="s">hit ${pct(r.rate)} (${r.hits}/${r.n}) vs ${pct(r.chance)} · p(live)=${pFmt(r.pAnytime)} · ${r.bitsPerSpin >= 0 ? '+' : ''}${r.bitsPerSpin.toFixed(3)} bit/spin</div>
      </div>
      <div class="tp-exps">${bars}</div>
      <div class="tp-foot">سبعة نماذج (منها شبكة عصبية) تتعلّم مباشرة، وكل توقّع يُسجَّل قبل ظهور نتيجته. الأوزان تتبع أداءها الفعلي؛ على عجلة سليمة تفوز «الصدفة». لا تراهن عليه.</div>`;
  }

  // No round counted yet: say why, and offer the detected fields right here.
  function noSpinsHint() {
    const frames = state.raw.length;
    if (!frames) return '';
    fieldsHelp(); // refresh the candidate cache
    const c = _fcCache.val;
    if (c.length) return `<div class="tp-verdict warn">ما انقرت نتيجة تلقائيًا — اضغط الحقل اللي فيه رقم الجولة:
      <div class="tp-strip" style="margin:6px 0 0">${c.slice(0, 5).map((x) => `<button class="tp-cbtn" data-fkey="${esc(x.key)}" title="${esc(x.sample.join(', '))}">${esc(x.key)} · ${x.distinct}</button>`).join('')}</div></div>`;
    return `<div class="tp-verdict warn">التقطت ${frames} إطار بس ما فيها رقم جولة. افتح طاولة الروليت وخلّ ٣ جولات تمرّ — وإذا بقى صفر اضغط «📦 صدّر الإطارات» وأرسل الملف.</div>`;
  }

  // Diagnostic export: every host's recent frames in full (tokens/session values
  // masked), plus what the parser saw — enough to tune the reader to this casino.
  const SECRET_KEY = '[\\w.-]*(?:token|auth|session|sess|password|passwd|pwd|jwt|secret|signature|sign|cookie|apikey|api_key|bearer|ticket)[\\w.-]*';
  const RX_JSON_SECRET = new RegExp('("' + SECRET_KEY + '"\\s*:\\s*")([^"]{4,})"', 'gi');
  const RX_ATTR_SECRET = new RegExp('(\\b' + SECRET_KEY + '\\s*=\\s*["\'])([^"\']{4,})(["\'])', 'gi');
  const RX_URL_SECRET = new RegExp('([?&]' + SECRET_KEY + '=)([^&#\\s"]{4,})', 'gi');
  const mask = (s) => String(s).replace(RX_JSON_SECRET, '$1***"').replace(RX_ATTR_SECRET, '$1***$3').replace(RX_URL_SECRET, '$1***');
  function exportDiag() {
    const frames = [];
    for (const [host, q] of state.diag) for (const f of q) frames.push({ host, t: f.t, kind: f.kind, url: mask(f.url), body: mask(f.body) });
    frames.sort((a, b) => a.t - b.t);
    const data = {
      tool: 'TARYAM diag', version: (isExt && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : ''), page: location.hostname,
      at: new Date().toISOString(), spins: state.spins.length, fieldMap: state.fieldMap, idSource: state.idSource, idlessSrc: state.idlessSrc,
      sources: [...state.sources.entries()], candidates: T.fieldCandidates(state.raw.map((r) => r.body), { maxBodies: 400 }),
      hosts: [...state.hosts.entries()], frames,
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'taryam-frames-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  function render() {
    if (!active) return;
    if (!root) build();
    const minBtn = root.getElementById('tp-min');
    if (minBtn) minBtn.textContent = state.min ? '+' : '—';
    if (state.min) { body.innerHTML = '<div class="tp-muted">مطويّ — اضغط + للعرض</div>'; return; }

    const a = T.analyze(state.spins, state.wheel);
    const net = (state.balance !== null && state.startBalance !== null) ? state.balance - state.startBalance : null;
    const hosts = [...state.hosts.entries()].sort((x, y) => y[1].count - x[1].count);
    const providerSeen = hosts.some(([, v]) => v.kind === 'provider' || v.kind === 'proxied');
    const proxied = hosts.some(([, v]) => v.kind === 'proxied');
    const casinoServes = hosts.some(([, v]) => v.kind === 'casino') && !providerSeen;
    const last = state.spins.slice(-16);

    body.innerHTML = `
      <div class="tp-row">
        <label>العجلة
          <select id="tp-wheel">
            <option value="european"${state.wheel === 'european' ? ' selected' : ''}>أوروبية</option>
            <option value="american"${state.wheel === 'american' ? ' selected' : ''}>أمريكية</option>
          </select>
        </label>
        <button class="tp-btn" id="tp-clear">تصفير</button>
      </div>
      <div class="tp-row">
        <button class="tp-btn hot" id="tp-report">صدّر تقرير اللجنة</button>
        <button class="tp-btn" id="tp-fields-toggle">ضبط الحقول</button>
      </div>
      <div class="tp-row"><button class="tp-btn wide" id="tp-diag">📦 صدّر الإطارات (للتشخيص)</button></div>
      <div class="tp-fields" id="tp-fields" style="display:${state.showFields ? 'block' : 'none'}">
        <label>اسم حقل الرقم <input id="tp-fr" value="${esc(state.fieldMap.result)}" placeholder="result"></label>
        <label>اسم حقل الرصيد <input id="tp-fb" value="${esc(state.fieldMap.balance)}" placeholder="balance"></label>
        <div class="tp-muted">اكتب اسم الحقل كما يظهر في «الدليل الخام» أدناه ثم اضغط Enter — يُعاد الحساب تلقائيًّا.</div>
        ${state.showFields ? fieldsHelp() : ''}
      </div>

      <div class="tp-cards">
        <div class="tp-card"><div class="k">دورات مُلتقطة</div><div class="v">${a.n}</div><div class="s">${state.lastSpinT ? 'آخر جولة قبل ' + ago(state.lastSpinT) : '—'}</div></div>
        <div class="tp-card"><div class="k">الرصيد الآن</div><div class="v ${net !== null && net < 0 ? 'bad' : 'good'}">${money(state.balance)}</div><div class="s">قبل: ${money(state.startBalance)}</div></div>
        <div class="tp-card"><div class="k">الصافي قبل/بعد</div><div class="v ${net !== null && net < 0 ? 'bad' : 'good'}">${net === null ? '—' : (net >= 0 ? '+' : '−') + money(Math.abs(net))}</div></div>
      </div>

      <div class="tp-strip">${last.length ? last.map((n) => `<span class="chip ${T.colorOf(n)}">${esc(n)}</span>`).join('') : '<span class="tp-muted">بانتظار أول دورة…</span>'}</div>
      ${!state.spins.length ? noSpinsHint() : ''}

      ${a.n ? `<div class="tp-verdict ${a.verdict === 'anomaly' ? 'bad' : a.verdict === 'fair' ? 'good' : 'warn'}">
        ${a.verdict === 'anomaly' ? 'شذوذ: الأرقام لا تتصرف كعجلة عادلة — راجع الأرقام المميّزة' : a.verdict === 'fair' ? 'ضمن العادل حتى الآن: لا نمط يُتوقّع؛ ما يأكل الرصيد هو أجر البيت' : `أرقام قليلة للحكم (${a.n})`}
        ${a.even.redBlack.trials ? `<div class="s">أحمر/أسود ${a.even.redBlack.hits}/${a.even.redBlack.trials - a.even.redBlack.hits} · p=${a.even.redBlack.pValue < 0.0001 ? '<0.0001' : a.even.redBlack.pValue.toFixed(3)}${a.bias.hot ? ` · الأكثر ${esc(a.bias.hot.pocket)} (z=${a.bias.hot.z.toFixed(2)})` : ''}</div>` : ''}
      </div>` : ''}

      ${aiSection()}
      ${fairSection()}

      ${(() => {
        const pred = (T.predict && state.spins.length >= 10) ? T.predict.predictNext(state.spins, 5) : null;
        const bt = getBacktest(state.spins);
        if (!pred && !bt) return '';
        return `<div class="tp-sec">النماذج البسيطة (اختبار رجعي)</div>
        ${pred ? `<div class="tp-strip">${pred.top.map((n) => `<span class="chip ${T.colorOf(n)}">${esc(n)}</span>`).join('')}</div>
          <div class="tp-muted" style="margin-bottom:6px">القطاع حول ${esc(pred.top[0])} · اللون ${colorWord(pred.color)} · دستة ${esc(pred.dozen)} · عمود ${esc(pred.column)}</div>` : '<div class="tp-muted">يحتاج جولات أكثر للتوقّع…</div>'}
        ${bt ? `<div class="tp-verdict ${bt.predictable ? 'bad' : bt.enough ? 'good' : 'warn'}">
            ${bt.predictable ? 'اللعبة متوقّعة — الإصابة أعلى من الصدفة بفرق مؤكّد (خلل في المولّد)' : bt.enough ? 'غير متوقّعة — الإصابة = الصدفة؛ لا يمكن التنبؤ (مولّد سليم)' : 'جارٍ القياس — جولات غير كافية للحكم'}
            <div class="s">إصابة ${(bt.rate * 100).toFixed(1)}٪ مقابل صدفة ${(bt.chance * 100).toFixed(1)}٪ · ${bt.hits}/${bt.trials} · p=${bt.pValue < 0.0001 ? '<0.0001' : bt.pValue.toFixed(3)}</div>
          </div>` : ''}
        <div class="tp-foot">اختبار قابلية التنبؤ فقط. على عجلة سليمة لا يتفوّق على الصدفة — لا تراهن عليه.</div>`;
      })()}

      <div class="tp-sec">من أين تُحمَّل اللعبة</div>
      <div class="tp-origin ${providerSeen ? (proxied ? 'warn' : 'good') : casinoServes ? 'bad' : 'warn'}">
        ${providerSeen ? (proxied ? '◐ مزوّد مرخّص لكن مُمرَّر عبر نطاق الموقع — تأكّد أنّ النتيجة تأتي من المزوّد لا من الموقع' : '✓ يظهر خادم مزوّد مرخّص') : casinoServes ? '⚠ تُخدَم من خادم الموقع نفسه — الموقع يتحكم بالنتيجة' : 'جارٍ جمع المصادر…'}
      </div>
      <div class="tp-hosts">
        ${hosts.slice(0, 8).map(([h, v]) => `<div class="hrow ${v.kind}"><span>${esc(h)}</span><span class="tag">${v.kind === 'provider' ? 'مزوّد' : v.kind === 'proxied' ? 'مزوّد (عبر الموقع' + (v.hint ? ' · ' + esc(v.hint) : '') + ')' : v.kind === 'casino' ? 'الموقع' : 'مجهول'} ·${v.count}</span></div>`).join('') || '<span class="tp-muted">—</span>'}
      </div>

      <div class="tp-sec">آخر ما التُقط (دليل خام)</div>
      <div class="tp-events">
        ${state.events.slice(0, 6).map((ev) => `<div class="erow"><span class="ek">${esc(ev.kind)}</span> <span class="eu">${esc((ev.url || '').replace(/^https?:\/\//, '').slice(0, 42))}</span>${ev.body ? `<div class="eb">${esc(ev.body.slice(0, 160))}</div>` : ''}</div>`).join('') || '<span class="tp-muted">لا شيء بعد</span>'}
      </div>
      <div class="tp-foot">يقرأ جلستك فقط — لا يعدّل أي طلب أو نتيجة أو رصيد.</div>`;

    root.getElementById('tp-wheel').addEventListener('change', (e) => { state.wheel = e.target.value; schedulePersist(); render(); });
    root.querySelectorAll('[data-fkey]').forEach((b) => b.addEventListener('click', () => { state.fieldMap.result = b.getAttribute('data-fkey'); state.forcedSrc = null; reparseAll(); }));
    root.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => { const v = b.getAttribute('data-src'); state.forcedSrc = state.forcedSrc === v ? null : v; reparseAll(); }));
    root.getElementById('tp-clear').addEventListener('click', resetAll);
    root.getElementById('tp-report').addEventListener('click', exportReport);
    root.getElementById('tp-diag').addEventListener('click', exportDiag);
    root.getElementById('tp-fields-toggle').addEventListener('click', () => { state.showFields = !state.showFields; render(); });
    const fr = root.getElementById('tp-fr'), fb = root.getElementById('tp-fb');
    const remap = () => { state.fieldMap.result = fr.value.trim(); state.fieldMap.balance = fb.value.trim(); state.forcedSrc = null; reparseAll(); };
    fr.addEventListener('change', remap); fb.addEventListener('change', remap);
    fr.addEventListener('keydown', (e) => { if (e.key === 'Enter') remap(); });
    fb.addEventListener('keydown', (e) => { if (e.key === 'Enter') remap(); });
  }

  // The committee report: a self-contained HTML page (print to PDF) with the session,
  // the rounds, the statistical verdict, where the game was served from, and a raw
  // evidence appendix sealed with a SHA-256 hash — change one byte and the hash moves.
  async function exportReport() {
    const a = T.analyze(state.spins, state.wheel);
    const net = (state.balance !== null && state.startBalance !== null) ? state.balance - state.startBalance : null;
    const hosts = [...state.hosts.entries()].sort((x, y) => y[1].count - x[1].count);
    const providerSeen = hosts.some(([, v]) => v.kind === 'provider' || v.kind === 'proxied');
    const proxied = hosts.some(([, v]) => v.kind === 'proxied');
    const casinoServes = hosts.some(([, v]) => v.kind === 'casino') && !providerSeen;
    const rawJson = JSON.stringify(state.raw);
    let hash = '—';
    try { hash = await T.sha256Hex(rawJson); } catch (e) { hash = 'تعذّر الحساب'; }
    const now = new Date();
    const rowsHtml = state.spins.map((n, k) => `<tr><td>${k + 1}</td><td class="c-${T.colorOf(n)}">${esc(n)} (${colorWord(T.colorOf(n))})</td></tr>`).join('');
    const hostsHtml = hosts.map(([h, v]) => `<tr><td dir="ltr">${esc(h)}</td><td>${v.kind === 'provider' ? 'مزوّد مرخّص' : v.kind === 'proxied' ? 'مزوّد مُمرَّر عبر نطاق الموقع' + (v.hint ? ' (' + esc(v.hint) + ')' : '') : v.kind === 'casino' ? 'خادم الموقع' : 'مجهول'}</td><td>${v.count}</td></tr>`).join('');
    const rawHtml = state.raw.slice(0, 120).map((r) => `<div class="raw"><span>${esc(r.kind)}</span> <span dir="ltr">${esc((r.url || '').replace(/^https?:\/\//, ''))}</span><pre dir="ltr">${esc(String(r.body).slice(0, 500))}</pre></div>`).join('');
    const originVerdict = providerSeen
      ? (proxied
        ? 'ظهرت خوادم بأسماء مزوّدين مرخّصين لكنها مُمرَّرة عبر نطاق الموقع نفسه. يجب التأكّد أنّ النتيجة تصدر فعلًا من المزوّد لا من الموقع (راجع الأدلّة الخام).'
        : 'ظهر خادم مزوّد مرخّص مستقل ضمن المصادر.')
      : casinoServes ? 'اللعبة تُخدَم من خادم الموقع نفسه — الموقع يتحكّم بتوليد النتيجة؛ ليست من بنية مزوّد مرخّص.' : 'لم تُجمع مصادر كافية بعد.';
    const verdictText = a.verdict === 'anomaly' ? 'شذوذ إحصائي: الأرقام لا تتصرّف كعجلة عادلة — انظر الأرقام المميّزة.' : a.verdict === 'fair' ? 'ضمن العادل: لا نمط يُستغل؛ ما يأكل الرصيد هو أجر البيت في كل دورة.' : `أرقام غير كافية للحكم الكامل (${a.n}).`;
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير TARYAM للّجنة</title>
<style>body{font:14px/1.6 system-ui,'Segoe UI',sans-serif;color:#111;max-width:820px;margin:24px auto;padding:0 18px}h1{color:#0b3}h2{border-bottom:2px solid #eee;padding-bottom:6px;margin-top:28px}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #ddd;padding:6px 8px;text-align:right}.k{color:#666}.big{font-size:22px;font-weight:700}.good{color:#0a7}.bad{color:#c33}.c-red{color:#c33}.c-black{color:#111}.c-green{color:#0a7}.seal{background:#f6f8fa;border:1px solid #ddd;border-radius:8px;padding:12px;word-break:break-all;font-family:ui-monospace,monospace}.raw{border-bottom:1px solid #eee;padding:6px 0;font-size:12px}.raw pre{background:#f6f8fa;padding:6px;border-radius:6px;overflow:auto;white-space:pre-wrap}.muted{color:#777;font-size:12px}@media print{.noprint{display:none}}</style></head>
<body>
<h1>تقرير فحص جلسة الكازينو — TARYAM</h1>
<p class="muted">الموقع: <b dir="ltr">${esc(location.hostname)}</b> · بدء الجلسة: ${esc(state.startedAt.toLocaleString('ar'))} · صدور التقرير: ${esc(now.toLocaleString('ar'))}</p>
<button class="noprint" onclick="print()">اطبع / احفظ PDF</button>

<h2>١. الرصيد قبل وبعد</h2>
<table>
<tr><td class="k">الرصيد قبل البدء</td><td dir="ltr">${money(state.startBalance)}</td></tr>
<tr><td class="k">الرصيد الآن</td><td dir="ltr" class="${net !== null && net < 0 ? 'bad' : 'good'}">${money(state.balance)}</td></tr>
<tr><td class="k">الصافي</td><td dir="ltr" class="big ${net !== null && net < 0 ? 'bad' : 'good'}">${net === null ? '—' : (net >= 0 ? '+' : '−') + money(Math.abs(net))}</td></tr>
<tr><td class="k">عدد الدورات المُلتقطة</td><td dir="ltr">${a.n}</td></tr>
</table>

<h2>٢. الحكم الإحصائي على الأرقام</h2>
<p>${esc(verdictText)}</p>
${a.even.redBlack.trials ? `<p class="muted">أحمر/أسود: ${a.even.redBlack.hits}/${a.even.redBlack.trials - a.even.redBlack.hits} · p=${a.even.redBlack.pValue < 0.0001 ? '<0.0001' : a.even.redBlack.pValue.toFixed(4)} · الأكثر تكرارًا ${a.bias.hot ? esc(a.bias.hot.pocket) + ' (z=' + a.bias.hot.z.toFixed(2) + ')' : '—'}</p>` : ''}

<h2>٢-ب. اختبار قابلية التنبؤ (نماذج ذكاء اصطناعي)</h2>
${(() => {
  const bt = (T.predict && state.spins.length >= 25) ? T.predict.backtest(state.spins, { k: 5 }) : null;
  const ss = T.predict ? T.predict.sampleSizeFor(5) : null;
  const method = '<p class="muted">دُرّبت أربعة نماذج (الأسخن، الانتقال، قطاع العجلة، اللون/الدستة/العمود) باختبار سيري أمامي (كل توقّع يُدرَّب على الجولات السابقة له فقط) وقِيست إصابة أقوى ٥ أرقام مقابل الصدفة (٥ من ٣٧ = 13.5٪) باختبار ذي الحدّين أحادي الجانب. القاعدة: النتيجة الصادقة على مولّد سليم هي «غير متوقّعة».</p>';
  if (!bt) return method + '<p>الجولات غير كافية بعد لإصدار حكم (الحدّ الأدنى ٢٥، والحكم الموثوق يبدأ من ~١٥٠).</p>';
  const v = bt.predictable ? 'اللعبة متوقّعة: إصابة النماذج أعلى من الصدفة بفرق مؤكّد — مؤشّر خلل في المولّد يستحق التوثيق.' : bt.enough ? 'غير متوقّعة: إصابة النماذج = الصدفة؛ لا يمكن التنبؤ بالجولة القادمة — المولّد سليم، وأي ادّعاء ببوت توقّع باطل.' : 'القياس جارٍ: الجولات دون العتبة الموثوقة (~١٥٠).';
  return method + `<p class="${bt.predictable ? 'bad' : 'good'}">${v}</p><p class="muted">الإصابة ${(bt.rate * 100).toFixed(1)}٪ مقابل صدفة ${(bt.chance * 100).toFixed(1)}٪ · ${bt.hits}/${bt.trials} · p=${bt.pValue < 0.0001 ? '<0.0001' : bt.pValue.toFixed(4)}${ss ? ` · لحكم موثوق: ~${ss.detectSmallEdge} جولة لكشف ميل صغير، ~${ss.confirmSound} لتأكيد السلامة` : ''}</p>`;
})()}

<h2>٢-ج. الذكاء الاصطناعي (تعلّم مباشر، تقييم سيري أمامي)</h2>
${(() => {
  const r = T.ai ? (state.ai && !state.aiPending ? state.ai.report() : T.ai.analyzeSession(state.spins)) : null;
  const method = '<p class="muted">سبعة نماذج تعطي احتمالًا كاملًا لكل رقم من ٣٧: الصدفة (عجلة سليمة)، الأرقام الأسخن، الانتقال من الرقم السابق، الانتقال من آخر رقمين، قطاع العجلة على ترتيبها الحقيقي، اللون/الدستة/العمود، وشبكة عصبية (MLP) تتدرّب مباشرة. يجمعها خليط بايزي يوزن كل نموذج بدقّته الفعلية. كل توقّع يُسجَّل قبل ظهور نتيجته، والدليل اختبار نسبة احتمال متتابع صالح حتى مع المراقبة المستمرة (متباينة Ville): p = exp(−max G) حيث G = Σ ln(37·p(x)).</p>';
  if (!r || !r.n) return method + '<p>لا جولات بعد.</p>';
  const v = r.predictable ? 'متوقّعة: الذكاء الاصطناعي تفوّق على الصدفة بفرق مؤكّد — مؤشّر خلل في المولّد أو العجلة يستحق التوثيق.' : r.enough ? 'غير متوقّعة: الذكاء الاصطناعي لم يتفوّق على الصدفة — لا يمكن التنبؤ بالجولة القادمة، وأي ادّعاء ببوت توقّع باطل.' : `القياس جارٍ: ${r.n} جولة من ${r.minTrials} اللازمة للحكم.`;
  const rows = r.experts.map((e) => `<tr><td>${esc(e.name)}</td><td dir="ltr">${(e.weight * 100).toFixed(1)}%</td><td dir="ltr">${(e.hitRate * 100).toFixed(1)}%</td><td dir="ltr">${(e.avgLoss / Math.LN2).toFixed(3)}</td></tr>`).join('');
  return method + `<p class="${r.predictable ? 'bad' : 'good'}">${v}</p>
<p class="muted">إصابة أقوى ٥: ${(r.rate * 100).toFixed(1)}٪ (${r.hits}/${r.n}) مقابل صدفة ${(r.chance * 100).toFixed(1)}٪ · p (ذو الحدّين)=${pFmt(r.pTop)} · p (مستمر)=${pFmt(r.pAnytime)} · ${r.bitsPerSpin.toFixed(4)} bit/spin (الصفر = لا معلومة) · القائد: ${esc(r.leader.name)}</p>
<table><thead><tr><th>النموذج</th><th>الوزن</th><th>إصابة أقوى ٥</th><th>الخسارة (bit/جولة، الصدفة = 5.209)</th></tr></thead><tbody>${rows}</tbody></table>`;
})()}

${(() => {
  const f = fairStats(); if (!f.n) return '';
  const v = fairVerdict(f);
  return `<h2>٢-د. فحص «العدالة المُثبتة» (Provably Fair)</h2>
<p class="muted">لكل جولة تنشر اللعبة resultKey وresultSalt وresultHash. فُحص لكل جولة جديدة: هل SHA-512(resultKey + resultSalt) يساوي resultHash، وهل resultKey يسمّي نفس الرقم، وهل وصلت البصمة في أي إطار قبل إطار النتيجة (التزام مسبق). البصمة لا تثبت شيئًا إلا إذا وصلت للاعب قبل رهانه.</p>
<p class="${v.cls === 'bad' ? 'bad' : v.cls === 'good' ? 'good' : ''}">${esc(v.text)}</p>
<table><tr><td class="k">جولات مفحوصة</td><td dir="ltr">${f.n}</td></tr><tr><td class="k">البصمة مطابقة (SHA-512)</td><td dir="ltr">${f.hashOk}/${f.n}</td></tr><tr><td class="k">resultKey يطابق الرقم</td><td dir="ltr">${f.n - f.keyBad}/${f.n}</td></tr><tr><td class="k">البصمة وصلت قبل الرهان</td><td dir="ltr">${f.pre}/${f.n}</td></tr></table>`;
})()}

<h2>٣. من أين تُحمَّل اللعبة</h2>
<p class="${providerSeen ? 'good' : casinoServes ? 'bad' : ''}">${esc(originVerdict)}</p>
<table><thead><tr><th>الخادم</th><th>التصنيف</th><th>عدد الطلبات</th></tr></thead><tbody>${hostsHtml || '<tr><td colspan="3">—</td></tr>'}</tbody></table>

<h2>٤. أرقام الجولات</h2>
<table><thead><tr><th>#</th><th>الرقم</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="2">—</td></tr>'}</tbody></table>

<h2>٥. ختم النزاهة (سلسلة العهدة)</h2>
<p class="muted">بصمة SHA-256 لكل الأدلّة الخام المُلتقطة في هذه الجلسة. أي تعديل على الأدلّة يغيّر هذه البصمة — فهي دليل على أنّ ما يلي لم يُمَسّ.</p>
<div class="seal">SHA-256 = ${esc(hash)}</div>

<h2>٦. الأدلّة الخام (حركة الشبكة كما وصلت)</h2>
${rawHtml || '<p class="muted">لا شيء.</p>'}
<p class="muted">أُنتج محليًّا في المتصفّح. الأداة تقرأ فقط ولا تعدّل أي طلب أو نتيجة أو رصيد.</p>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'taryam-committee-report-' + now.toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.html';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  const PANEL_CSS = `
  .tp{font:13px/1.4 system-ui,"Segoe UI",sans-serif;width:340px;max-height:86vh;overflow:auto;background:#0f1522;color:#e6eaf2;border:1px solid #28324a;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.5);direction:rtl}
  .tp-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#151d2e;border-bottom:1px solid #28324a;cursor:move;border-radius:14px 14px 0 0}
  .tp-dot{width:9px;height:9px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399}
  .tp-sp{flex:1}
  .tp-x{background:#223;border:1px solid #39456a;color:#cdd;border-radius:7px;width:26px;height:24px;cursor:pointer}
  .tp-body{padding:12px}
  .tp-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
  .tp-row label{display:flex;gap:6px;align-items:center;color:#9fb0cc}
  .tp-row select{background:#0b1120;color:#e6eaf2;border:1px solid #39456a;border-radius:8px;padding:4px 8px}
  .tp-btn{background:#1b2740;border:1px solid #39456a;color:#cdd;border-radius:8px;padding:5px 12px;cursor:pointer}
  .tp-btn.wide{flex:1}
  .tp-btn.hot{background:#0a5f46;border-color:#0f7a59;color:#d7ffee;font-weight:700}
  .tp-fields{background:#0b1120;border:1px solid #28324a;border-radius:10px;padding:10px;margin-bottom:10px}
  .tp-fields label{display:flex;justify-content:space-between;gap:8px;align-items:center;color:#9fb0cc;margin-bottom:6px}
  .tp-fields input{background:#0f1522;color:#e6eaf2;border:1px solid #39456a;border-radius:7px;padding:4px 8px;width:150px;direction:ltr}
  .tp-cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px}
  .tp-card{background:#0b1120;border:1px solid #28324a;border-radius:10px;padding:8px}
  .tp-card .k{font-size:11px;color:#8ea0bd}
  .tp-card .v{font-weight:700;font-size:16px;margin-top:3px;direction:ltr;text-align:right}
  .tp-card .s{font-size:10.5px;color:#8ea0bd;direction:ltr;text-align:right}
  .tp-card .v.good{color:#34d399}.tp-card .v.bad{color:#f87171}
  .tp-strip{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
  .chip{min-width:22px;text-align:center;padding:2px 6px;border-radius:6px;font-weight:700;direction:ltr}
  .chip.red{background:#7f1d1d;color:#fff}.chip.black{background:#1f2937;color:#fff;border:1px solid #39456a}.chip.green{background:#065f46;color:#fff}
  .tp-verdict{padding:9px 11px;border-radius:10px;margin-bottom:10px;border:1px solid}
  .tp-verdict.good{background:rgba(52,211,153,.08);border-color:rgba(52,211,153,.35);color:#34d399}
  .tp-verdict.bad{background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.35);color:#f87171}
  .tp-verdict.warn{background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.35);color:#fbbf24}
  .tp-verdict .s{color:#9fb0cc;font-size:11px;margin-top:4px;direction:ltr;text-align:right}
  .tp-sec{font-size:11px;color:#8ea0bd;margin:12px 0 6px;font-weight:700}
  .tp-origin{padding:8px 10px;border-radius:9px;border:1px solid;margin-bottom:6px}
  .tp-origin.good{background:rgba(52,211,153,.08);border-color:rgba(52,211,153,.35);color:#34d399}
  .tp-origin.bad{background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.35);color:#f87171}
  .tp-origin.warn{background:rgba(251,191,36,.06);border-color:rgba(251,191,36,.3);color:#fbbf24}
  .hrow{display:flex;justify-content:space-between;gap:8px;padding:4px 8px;border-radius:7px;background:#0b1120;margin-bottom:4px;direction:ltr}
  .hrow .tag{font-size:10.5px;color:#8ea0bd;white-space:nowrap}
  .hrow.casino{border:1px solid rgba(248,113,113,.4)}.hrow.provider{border:1px solid rgba(52,211,153,.4)}.hrow.proxied{border:1px solid rgba(251,191,36,.4)}
  .tp-events{max-height:150px;overflow:auto}
  .erow{padding:5px 7px;background:#0b1120;border-radius:7px;margin-bottom:4px;direction:ltr;font-size:11px}
  .erow .ek{color:#60a5fa;font-weight:700}.erow .eu{color:#9fb0cc}.erow .eb{color:#6b7a95;margin-top:3px;word-break:break-all;font-family:ui-monospace,monospace;font-size:10px}
  .tp-muted{color:#6b7a95}
  .tp-sub{font-size:11px;color:#9fb0cc;margin:8px 0 4px}
  .tp-cbtn,.tp-sbtn{background:#1b2740;border:1px solid #39456a;color:#cdd;border-radius:7px;padding:2px 8px;cursor:pointer;font-size:11px;direction:ltr}
  .tp-cbtn.on,.tp-sbtn.on{background:#0a5f46;border-color:#0f7a59;color:#d7ffee}
  .tp-srcs{display:flex;flex-direction:column;gap:4px}.tp-sbtn{text-align:left;word-break:break-all}
  .tp-exps{display:flex;flex-direction:column;gap:3px;margin-bottom:6px}
  .tp-exp{display:grid;grid-template-columns:118px 1fr 92px;gap:6px;align-items:center;font-size:11px;color:#9fb0cc}
  .tp-exp .bar{height:7px;background:#0b1120;border:1px solid #28324a;border-radius:4px;overflow:hidden}
  .tp-exp .bar i{display:block;height:100%;background:#60a5fa}
  .tp-exp.lead{color:#e6eaf2;font-weight:700}.tp-exp.lead .bar i{background:#34d399}
  .tp-exp .vv{direction:ltr;text-align:left;font-size:10.5px}
  .tp-foot{margin-top:10px;color:#6b7a95;font-size:10.5px;text-align:center}`;

  // 4. Go — only the casino shell's top frame shows the panel; child frames just
  // capture their traffic and forward it up.
  if (active) {
    state.ai = T.ai ? T.ai.createLearner() : null;
    const go = () => { render(); loadSaved(); };
    if (document.body) go(); else window.addEventListener('DOMContentLoaded', go);
  }
})();
