// Runs in the casino page's own context so it can see the real traffic. It only
// observes: it wraps fetch, XHR and WebSocket to copy what passes, and posts a
// summary to the content script. It never changes a request, a response, or a
// message — the game behaves exactly as it would without the inspector.
(function () {
  if (window.__taryamHooked) return;
  window.__taryamHooked = true;
  // Shared DOM flag: the isolated content script cannot see page JS globals, so it
  // reads this to skip the fallback <script> injection when the manifest already ran us.
  try { document.documentElement.setAttribute('data-taryam-hooked', '1'); } catch (e) { /* ignore */ }

  // Cap copied bodies so a pathological frame cannot freeze the panel. Live games
  // send big frames (one Turbo roulette result carries ~60 KB of statistics), so
  // the cap must be well above that or the JSON arrives cut and cannot be read.
  const MAX = 1000000;
  function send(ev) {
    try { window.postMessage({ __taryam: true, ev }, '*'); } catch (e) { /* never break the page */ }
  }
  const clip = (s) => (typeof s === 'string' && s.length > MAX ? s.slice(0, MAX) : s);

  // fetch
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const url = (args[0] && args[0].url) || args[0];
      return origFetch.apply(this, args).then((res) => {
        try {
          res.clone().text().then((body) => send({ kind: 'fetch', url: String(url), status: res.status, body: clip(body) })).catch(() => {});
        } catch (e) { /* ignore */ }
        return res;
      });
    };
  }

  // XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__taryamUrl = url; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      let body = '';
      try { body = this.responseType === '' || this.responseType === 'text' ? this.responseText : '[' + this.responseType + ']'; } catch (e) { body = ''; }
      send({ kind: 'xhr', url: String(this.__taryamUrl || ''), status: this.status, body: clip(body) });
    });
    return origSend.apply(this, arguments);
  };

  // Binary frames: readable UTF-8 (JSON/XML sent as bytes) becomes text; anything
  // else is passed on as base64 so the analyser can try a protobuf decode.
  const MAXB = 12000;
  function bytesOf(data) {
    if (data instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) return Promise.resolve(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    if (typeof Blob !== 'undefined' && data instanceof Blob) return data.arrayBuffer().then((b) => new Uint8Array(b));
    return Promise.reject(new Error('unknown'));
  }
  function binaryToText(data) {
    return bytesOf(data).then((u) => {
      const n = u.byteLength;
      let text = '';
      try { text = new TextDecoder('utf-8').decode(u.subarray(0, MAX)); } catch (e) { text = ''; }
      let bad = 0;
      for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if ((c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 30) || c === 0xfffd) bad++; }
      if (text && bad / text.length < 0.05) return text;
      let bin = ''; const m = Math.min(n, MAXB);
      for (let i = 0; i < m; i++) bin += String.fromCharCode(u[i]);
      return '[binary ' + n + '] b64:' + btoa(bin);
    });
  }

  // Server-sent events (some lobbies stream results this way).
  const OrigES = window.EventSource;
  if (OrigES) {
    const ES = function (url, cfg) {
      const es = new OrigES(url, cfg);
      es.addEventListener('message', (e) => send({ kind: 'sse', url: String(url), body: clip(String(e.data)) }));
      return es;
    };
    ES.prototype = OrigES.prototype;
    ES.CONNECTING = OrigES.CONNECTING; ES.OPEN = OrigES.OPEN; ES.CLOSED = OrigES.CLOSED;
    try { window.EventSource = ES; } catch (e) { /* ignore */ }
  }

  // WebSocket (where live roulette results usually flow)
  const OrigWS = window.WebSocket;
  if (OrigWS) {
    const WS = function (url, protocols) {
      const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
      send({ kind: 'ws-open', url: String(url) });
      ws.addEventListener('message', (e) => {
        const data = e.data;
        if (typeof data === 'string') { send({ kind: 'ws', url: String(url), body: clip(data) }); return; }
        binaryToText(data).then((body) => send({ kind: 'ws', url: String(url), body: clip(body) })).catch(() => {});
      });
      return ws;
    };
    WS.prototype = OrigWS.prototype;
    WS.CONNECTING = OrigWS.CONNECTING; WS.OPEN = OrigWS.OPEN; WS.CLOSING = OrigWS.CLOSING; WS.CLOSED = OrigWS.CLOSED;
    try { window.WebSocket = WS; } catch (e) { /* some pages freeze it; ignore */ }
  }

  send({ kind: 'ready', url: location.href });
})();
