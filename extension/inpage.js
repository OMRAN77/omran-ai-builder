// Runs in the casino page's own context so it can see the real traffic. It only
// observes: it wraps fetch, XHR and WebSocket to copy what passes, and posts a
// summary to the content script. It never changes a request, a response, or a
// message — the game behaves exactly as it would without the inspector.
(function () {
  if (window.__taryamHooked) return;
  window.__taryamHooked = true;

  const MAX = 20000; // cap copied bodies so a huge frame cannot freeze the panel
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

  // WebSocket (where live roulette results usually flow)
  const OrigWS = window.WebSocket;
  if (OrigWS) {
    const WS = function (url, protocols) {
      const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
      send({ kind: 'ws-open', url: String(url) });
      ws.addEventListener('message', (e) => {
        let data = e.data;
        if (typeof data !== 'string') { try { data = '[binary ' + (data.byteLength || data.size || '') + ']'; } catch (x) { data = '[binary]'; } }
        send({ kind: 'ws', url: String(url), body: clip(data) });
      });
      return ws;
    };
    WS.prototype = OrigWS.prototype;
    WS.CONNECTING = OrigWS.CONNECTING; WS.OPEN = OrigWS.OPEN; WS.CLOSING = OrigWS.CLOSING; WS.CLOSED = OrigWS.CLOSED;
    try { window.WebSocket = WS; } catch (e) { /* some pages freeze it; ignore */ }
  }

  send({ kind: 'ready', url: location.href });
})();
