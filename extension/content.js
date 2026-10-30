// TARYAM live inspector — the content script. It injects the page-world hook,
// listens to the real traffic it reports, and shows a floating panel over the
// casino: live roulette numbers, the balance before and now, where the game is
// served from, and a growing fairness read. It only reads; it changes nothing.
(function () {
  const T = window.TARYAM;
  const isExt = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;

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
    events: [],         // last raw captured payloads
    min: false,
  };
  const MAX_EVENTS = 40;

  function noteHost(url) {
    const c = T.classifyHost(url, location.hostname);
    if (!c.host) return;
    const cur = state.hosts.get(c.host) || { kind: c.kind, count: 0 };
    cur.count++; cur.kind = c.kind;
    state.hosts.set(c.host, cur);
  }
  function ingest(ev) {
    if (ev.url) noteHost(ev.url);
    if (ev.body) {
      let obj = null;
      try { obj = JSON.parse(ev.body); } catch (e) { obj = null; }
      if (obj) {
        for (const n of T.guessNumbers(obj)) state.spins.push(n);
        const b = T.guessBalance(obj);
        if (b !== null && Number.isFinite(b)) {
          if (state.startBalance === null) state.startBalance = b;
          state.balance = b;
        }
      }
      state.events.unshift({ kind: ev.kind, url: ev.url || '', body: String(ev.body).slice(0, 400), t: Date.now() });
      if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
    } else if (ev.kind !== 'ready') {
      state.events.unshift({ kind: ev.kind, url: ev.url || '', body: '', t: Date.now() });
      if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
    }
    render();
  }
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.__taryam && d.ev) ingest(d.ev);
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
    const providerSeen = hosts.some(([, v]) => v.kind === 'provider');
    const casinoServes = hosts.some(([, v]) => v.kind === 'casino');
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
      <div class="tp-origin ${providerSeen ? 'good' : casinoServes ? 'bad' : 'warn'}">
        ${providerSeen ? '✓ يظهر خادم مزوّد مرخّص' : casinoServes ? '⚠ تُخدَم من خادم الموقع نفسه — الموقع يتحكم بالنتيجة' : 'جارٍ جمع المصادر…'}
      </div>
      <div class="tp-hosts">
        ${hosts.slice(0, 8).map(([h, v]) => `<div class="hrow ${v.kind}"><span>${esc(h)}</span><span class="tag">${v.kind === 'provider' ? 'مزوّد' : v.kind === 'casino' ? 'الموقع' : 'مجهول'} ·${v.count}</span></div>`).join('') || '<span class="tp-muted">—</span>'}
      </div>

      <div class="tp-sec">آخر ما التُقط (دليل خام)</div>
      <div class="tp-events">
        ${state.events.slice(0, 6).map((ev) => `<div class="erow"><span class="ek">${esc(ev.kind)}</span> <span class="eu">${esc((ev.url || '').replace(/^https?:\/\//, '').slice(0, 42))}</span>${ev.body ? `<div class="eb">${esc(ev.body.slice(0, 160))}</div>` : ''}</div>`).join('') || '<span class="tp-muted">لا شيء بعد</span>'}
      </div>
      <div class="tp-foot">يقرأ جلستك فقط — لا يعدّل أي طلب أو نتيجة أو رصيد.</div>`;

    root.getElementById('tp-wheel').addEventListener('change', (e) => { state.wheel = e.target.value; render(); });
    root.getElementById('tp-clear').addEventListener('click', () => { state.spins = []; state.events = []; state.hosts.clear(); state.startBalance = state.balance; render(); });
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
  .hrow.casino{border:1px solid rgba(248,113,113,.4)}.hrow.provider{border:1px solid rgba(52,211,153,.4)}
  .tp-events{max-height:150px;overflow:auto}
  .erow{padding:5px 7px;background:#0b1120;border-radius:7px;margin-bottom:4px;direction:ltr;font-size:11px}
  .erow .ek{color:#60a5fa;font-weight:700}.erow .eu{color:#9fb0cc}.erow .eb{color:#6b7a95;margin-top:3px;word-break:break-all;font-family:ui-monospace,monospace;font-size:10px}
  .tp-muted{color:#6b7a95}
  .tp-foot{margin-top:10px;color:#6b7a95;font-size:10.5px;text-align:center}`;

  // 4. Go.
  if (document.body) render(); else window.addEventListener('DOMContentLoaded', render);
})();
