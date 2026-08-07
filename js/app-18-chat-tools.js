/* ───────── 💬 المحادثة بأدوات — عميل الواجهة ─────────
 *
 * يستهلك بثّ /api/ai?action=chat بنفس بروتوكول وكيل عمران (status · delta ·
 * clientTool · done)، ويعيد نفس شكل callAIWithFallback تمامًا — فمُستدعيه لا
 * يعرف أنّ شيئًا تغيّر.
 *
 * أي فشل هنا = رمية واحدة، والمستدعي يهبط إلى المسار القديم كما كان. الميزة
 * التي تُسقط المحادثة عند أوّل عثرة ليست ميزة.
 */
(function () {
  'use strict';

  if (typeof window.__chatToolsOn === 'undefined') window.__chatToolsOn = true;

  var _step = null;
  function note(txt) {
    try {
      var s = window.__chatStatus;
      if (!s || (typeof s.isReleased === 'function' && s.isReleased()) || typeof s.step !== 'function') return;
      if (_step && typeof _step.done === 'function') _step.done();
      _step = s.step('•', String(txt).replace(/^[^\u0600-\u06FFa-zA-Z0-9]+/, '').trim() || String(txt));
    } catch (e) { /* شريط الحالة ترفٌ لا يُسقط ردًّا */ }
  }
  function noteEnd() {
    try { if (_step && typeof _step.done === 'function') _step.done(); } catch (e) { /* كسابقه */ }
    _step = null;
  }

  /** ينفّذ أداة طلبها الخادم داخل متصفّح المستخدم ويعيد ناتجها عبر نقطة منفصلة. */
  function serveClientTool(ct) {
    (async function () {
      var out;
      try {
        out = window.omranAgentTools
          ? await window.omranAgentTools.run(ct.name, ct.input)
          : 'أداة التنفيذ غير متاحة في هذا المتصفّح.';
      } catch (err) { out = 'تعذّر التنفيذ: ' + ((err && err.message) || err); }
      try {
        await fetch('/api/agent-tool-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ct.id, output: out }),
        });
      } catch (err) { if (window.__swallow) window.__swallow(err, 'chatTools:result'); }
    })();
  }

  /**
   * @param {Array} messages رسائل المحادثة كما تُبنى للمزوّد (تشمل رسائل system).
   * @param {Function} onDelta تُستدعى بالنصّ المتراكم كلّما وصلت قطعة.
   * @returns {{reply:string, providerKey:string, switched:boolean, requestedKey:string}}
   */
  window.callChatWithTools = async function (messages, onDelta) {
    var res = await fetch('/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      body: JSON.stringify({
        messages: messages,
        token: (window.authGet && window.authGet('aiapp_auth_token')) || '',
        guestId: window.getGuestId ? window.getGuestId() : '',
      }),
    });
    if (!res.ok || !res.body) {
      var errText = '';
      try { errText = await res.text(); } catch (e) { /* لا جسم للخطأ */ }
      throw new Error('chat ' + res.status + ': ' + String(errText).slice(0, 200));
    }

    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = '', full = '', serverErr = null;

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('data: ') !== 0) continue;
        var ev;
        try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
        if (ev.status) note(ev.status);
        if (ev.clientTool) serveClientTool(ev.clientTool);
        if (ev.delta) {
          noteEnd();
          full += ev.delta;
          if (onDelta) { try { onDelta(full); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:delta'); } }
        }
        if (ev.error) serverErr = ev.error;
      }
    }
    noteEnd();

    // لا نصّ = لم يحدث شيء يُعرض؛ نرمي ليهبط المستدعي إلى مساره القديم.
    if (!full.trim()) throw new Error(serverErr || 'chat: empty reply');
    return { reply: full, providerKey: 'claude', switched: false, requestedKey: 'claude' };
  };
})();
