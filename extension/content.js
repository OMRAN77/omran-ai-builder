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
  const onCasinoShell = /dubibet/i.test(location.hostname);

  // 1. Inject the page-world hook (skipped when a test injected it already).
  if (isExt && !window.__taryamHooked) {
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
    seenRounds: new Set(), // round ids already counted, so re-sent history is not double-counted
    fieldMap: { result: '', balance: '' },
    startedAt: new Date(),
    min: false,
  };
  const MAX_EVENTS = 40;
  const MAX_RAW = 400;

  function noteHost(url) {
    const c = T.classifyHost(url, location.hostname);
    if (!c.host) return;
    const cur = state.hosts.get(c.host) || { kind: c.kind, count: 0, hint: c.hint || '' };
    cur.count++; cur.kind = c.kind; cur.hint = c.hint || cur.hint || '';
    state.hosts.set(c.host, cur);
  }
  // Extract the round numbers and the balance from one captured body, using the
  // mapped field names when given, otherwise the automatic heuristics.
  function parseBody(body) {
    const out = { numbers: [], balance: null };
    if (!body) return out;
    let obj = null;
    try { obj = JSON.parse(body); } catch (e) { obj = null; }
    if (obj) {
      out.numbers = state.fieldMap.result ? T.byKeyNumbers(obj, state.fieldMap.result) : T.guessNumbers(obj);
      out.balance = state.fieldMap.balance ? T.byKeyBalance(obj, state.fieldMap.balance) : T.guessBalance(obj);
    } else {
      const r = T.scanText(body, state.fieldMap.result);
      const b = T.scanText(body, state.fieldMap.balance);
      out.numbers = r.numbers.map((n) => ({ n, id: null }));
      out.balance = b.balance;
    }
    return out;
  }
  function applyParsed(p) {
    for (const item of p.numbers) {
      const n = (item && typeof item === 'object') ? item.n : item;
      const id = (item && typeof item === 'object') ? item.id : null;
      if (id) { if (state.seenRounds.has(id)) continue; state.seenRounds.add(id); }
      state.spins.push(n);
    }
    if (p.balance !== null && Number.isFinite(p.balance)) {
      if (state.startBalance === null) state.startBalance = p.balance;
      state.balance = p.balance;
    }
  }
  // Rebuild everything from the raw buffer — used when the field mapping changes.
  function reparseAll() {
    state.spins = []; state.startBalance = null; state.balance = null; state.seenRounds = new Set();
    for (let i = state.raw.length - 1; i >= 0; i--) applyParsed(parseBody(state.raw[i].body));
    render();
  }
  function ingest(ev) {
    if (ev.url) noteHost(ev.url);
    if (ev.body) {
      state.raw.unshift({ kind: ev.kind, url: ev.url || '', body: String(ev.body).slice(0, 8000), t: Date.now() });
      if (state.raw.length > MAX_RAW) state.raw.length = MAX_RAW;
      applyParsed(parseBody(ev.body));
      state.events.unshift({ kind: ev.kind, url: ev.url || '', body: String(ev.body).slice(0, 400), t: Date.now() });
    } else if (ev.kind !== 'ready') {
      state.events.unshift({ kind: ev.kind, url: ev.url || '', body: '', t: Date.now() });
    }
    if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
    render();
  }
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d) return;
    if (d.__taryam && d.ev) {
      // Captured here in the page world. Top frame consumes it; a child frame
      // relays it up to the top so the one panel sees every frame's traffic.
      if (isTop) ingest(d.ev);
      else { try { window.top.postMessage({ __taryamFwd: true, ev: d.ev }, '*'); } catch (x) { /* guard-ok — cross-origin top may reject */ } }
    } else if (d.__taryamFwd && d.ev && isTop) {
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

  function render() {
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
      <div class="tp-fields" id="tp-fields" style="display:${state.showFields ? 'block' : 'none'}">
        <label>اسم حقل الرقم <input id="tp-fr" value="${esc(state.fieldMap.result)}" placeholder="result"></label>
        <label>اسم حقل الرصيد <input id="tp-fb" value="${esc(state.fieldMap.balance)}" placeholder="balance"></label>
        <div class="tp-muted">اكتب اسم الحقل كما يظهر في «الدليل الخام» أدناه ثم اضغط Enter — يُعاد الحساب تلقائيًّا.</div>
      </div>

      <div class="tp-cards">
        <div class="tp-card"><div class="k">دورات مُلتقطة</div><div class="v">${a.n}</div></div>
        <div class="tp-card"><div class="k">الرصيد الآن</div><div class="v ${net !== null && net < 0 ? 'bad' : 'good'}">${money(state.balance)}</div><div class="s">قبل: ${money(state.startBalance)}</div></div>
        <div class="tp-card"><div class="k">الصافي قبل/بعد</div><div class="v ${net !== null && net < 0 ? 'bad' : 'good'}">${net === null ? '—' : (net >= 0 ? '+' : '−') + money(Math.abs(net))}</div></div>
      </div>

      <div class="tp-strip">${last.length ? last.map((n) => `<span class="chip ${T.colorOf(n)}">${esc(n)}</span>`).join('') : '<span class="tp-muted">بانتظار أول دورة…</span>'}</div>

      ${a.n ? `<div class="tp-verdict ${a.verdict === 'anomaly' ? 'bad' : a.verdict === 'fair' ? 'good' : 'warn'}">
        ${a.verdict === 'anomaly' ? 'شذوذ: الأرقام لا تتصرف كعجلة عادلة — راجع الأرقام المميّزة' : a.verdict === 'fair' ? 'ضمن العادل حتى الآن: لا نمط يُتوقّع؛ ما يأكل الرصيد هو أجر البيت' : `أرقام قليلة للحكم (${a.n})`}
        ${a.even.redBlack.trials ? `<div class="s">أحمر/أسود ${a.even.redBlack.hits}/${a.even.redBlack.trials - a.even.redBlack.hits} · p=${a.even.redBlack.pValue < 0.0001 ? '<0.0001' : a.even.redBlack.pValue.toFixed(3)}${a.bias.hot ? ` · الأكثر ${esc(a.bias.hot.pocket)} (z=${a.bias.hot.z.toFixed(2)})` : ''}</div>` : ''}
      </div>` : ''}

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

    root.getElementById('tp-wheel').addEventListener('change', (e) => { state.wheel = e.target.value; render(); });
    root.getElementById('tp-clear').addEventListener('click', () => { state.spins = []; state.events = []; state.raw = []; state.hosts.clear(); state.seenRounds = new Set(); state.startBalance = null; state.balance = null; state.startedAt = new Date(); render(); });
    root.getElementById('tp-report').addEventListener('click', exportReport);
    root.getElementById('tp-fields-toggle').addEventListener('click', () => { state.showFields = !state.showFields; render(); });
    const fr = root.getElementById('tp-fr'), fb = root.getElementById('tp-fb');
    const remap = () => { state.fieldMap.result = fr.value.trim(); state.fieldMap.balance = fb.value.trim(); reparseAll(); };
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
  .tp-foot{margin-top:10px;color:#6b7a95;font-size:10.5px;text-align:center}`;

  // 4. Go — only the casino shell's top frame shows the panel; child frames just
  // capture their traffic and forward it up.
  if (isTop && onCasinoShell) {
    if (document.body) render(); else window.addEventListener('DOMContentLoaded', render);
  }
})();
