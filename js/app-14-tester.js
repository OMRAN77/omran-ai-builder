/* js/app-14-tester.js — 🧪 «جرّبه لي»: الذكاء الاصطناعي يختبر التطبيق الذي بناه.
 *
 * لماذا: اليوم يسلّم النموذج كودًا *يظن* أنه يعمل. الإصلاح الذاتي الموجود
 * (testCodeInSandbox) يلتقط الأخطاء التي تنفجر تلقائيًا عند التحميل فقط —
 * لا يضغط زرًا ولا يملأ حقلًا، فالأعطال التفاعلية تمر كلها.
 *
 * SECURITY — the whole design turns on one decision:
 * the iframe is sandboxed WITHOUT allow-same-origin. That means the parent
 * page cannot read its DOM at all... so we don't try. Instead a small agent
 * script is injected INTO the page, and it does the clicking and reading and
 * reports back over postMessage. Model-generated code therefore never gets a
 * handle on the user's session, localStorage or account. Granting
 * allow-same-origin would have been three lines shorter and would have handed
 * AI-written code the keys to the app.
 *
 * CONSENT — nothing here runs on its own. Clicking blind on an app that may
 * contain a "delete everything" button is not a background task, it costs
 * points, and it makes the user wait. One button, every time.
 */
(function () {
  'use strict';

  var MAX_STEPS = 12;
  var STEP_TIMEOUT = 4000;

  function isAr() {
    try { return (typeof AL === 'function' ? AL() : 'ar') !== 'en'; } catch (e) { return true; }
  }
  function T(ar, en) { return isAr() ? ar : en; }

  // ---------------------------------------------------------------------
  // العميل الذي يُحقن داخل الإطار
  // ---------------------------------------------------------------------
  function agentScript(token) {
    return '<scr' + 'ipt>(function(){' +
      'var TK=' + JSON.stringify(token) + ';' +
      'function send(p){try{parent.postMessage(Object.assign({__omranTest:TK},p),"*");}catch(e){ __swallow(e, "misc:app-14-tester#1"); }}' +
      'window.addEventListener("error",function(e){send({type:"error",message:(e.message||"Script error")+(e.lineno?" [line "+e.lineno+"]":"")});});' +
      'window.addEventListener("unhandledrejection",function(e){send({type:"error",message:"Unhandled rejection: "+((e.reason&&e.reason.message)||e.reason)});});' +
      'function label(el){' +
      '  var t=(el.getAttribute("aria-label")||el.getAttribute("placeholder")||el.getAttribute("title")||el.value||el.textContent||"").trim();' +
      '  return t.replace(/\\s+/g," ").slice(0,60);' +
      '}' +
      'function sel(el){' +
      '  if(el.id) return "#"+el.id;' +
      '  var p=el.tagName.toLowerCase();' +
      '  if(el.className && typeof el.className==="string"){var c=el.className.trim().split(/\\s+/)[0]; if(c) p+="."+c;}' +
      '  var all=document.querySelectorAll(p);' +
      '  if(all.length===1) return p;' +
      '  for(var i=0;i<all.length;i++){ if(all[i]===el) return p+":nth-of-type("+(i+1)+")"; }' +
      '  return p;' +
      '}' +
      /* خريطة مبسّطة للعناصر التفاعلية فقط — النموذج لا يحتاج DOM كاملًا */
      'function outline(){' +
      '  var out=[];' +
      '  var nodes=document.querySelectorAll("button,a[href],input,select,textarea,[role=button],[onclick]");' +
      '  for(var i=0;i<nodes.length && out.length<40;i++){' +
      '    var el=nodes[i];' +
      '    if(!el.offsetParent && el.type!=="hidden") continue;' +
      '    out.push({tag:el.tagName.toLowerCase(),type:el.type||null,selector:sel(el),label:label(el)});' +
      '  }' +
      '  return {controls:out,title:document.title||"",text:(document.body?document.body.innerText:"").replace(/\\s+/g," ").slice(0,600)};' +
      '}' +
      'function run(cmd){' +
      '  try{' +
      '    if(cmd.cmd==="outline") return {ok:true,result:outline()};' +
      '    if(cmd.cmd==="read"){' +
      '      var r=document.querySelector(cmd.selector||"body");' +
      '      if(!r) return {ok:false,error:"العنصر غير موجود: "+cmd.selector};' +
      '      return {ok:true,result:{text:(r.innerText||r.value||"").replace(/\\s+/g," ").slice(0,600)}};' +
      '    }' +
      '    var el=document.querySelector(cmd.selector);' +
      '    if(!el) return {ok:false,error:"العنصر غير موجود: "+cmd.selector};' +
      '    if(cmd.cmd==="click"){ el.click(); return {ok:true,result:{clicked:label(el)}}; }' +
      '    if(cmd.cmd==="type"){' +
      '      el.focus();' +
      '      el.value=String(cmd.value==null?"":cmd.value);' +
      '      el.dispatchEvent(new Event("input",{bubbles:true}));' +
      '      el.dispatchEvent(new Event("change",{bubbles:true}));' +
      '      return {ok:true,result:{typed:String(cmd.value).slice(0,60)}};' +
      '    }' +
      '    return {ok:false,error:"أمر غير معروف: "+cmd.cmd};' +
      '  }catch(e){ return {ok:false,error:String(e&&e.message||e)}; }' +
      '}' +
      'window.addEventListener("message",function(ev){' +
      '  var d=ev.data;' +
      '  if(!d||d.__omranTestCmd!==TK) return;' +
      '  var r=run(d);' +
      '  setTimeout(function(){ send(Object.assign({type:"result",id:d.id},r)); },250);' +
      '});' +
      'send({type:"ready"});' +
      '})();</scr' + 'ipt>';
  }

  // ---------------------------------------------------------------------
  // الجلسة
  // ---------------------------------------------------------------------
  function TestSession(code) {
    this.code = String(code || '');
    this.token = 'tst_' + Math.random().toString(36).slice(2);
    this.frame = null;
    this.pending = {};
    this.seq = 0;
    this.errors = [];
    this.aborted = false;
    this._onMsg = null;
  }

  TestSession.prototype.start = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      var html = self.code;
      var inject = agentScript(self.token);
      if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, function (m) { return m + inject; });
      else html = inject + html;

      var f = document.createElement('iframe');
      // NO allow-same-origin — see the note at the top of this file.
      f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
      f.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1024px;height:768px;visibility:hidden;';
      self.frame = f;

      var settled = false;
      self._onMsg = function (ev) {
        var d = ev.data;
        if (!d || d.__omranTest !== self.token) return;
        if (d.type === 'ready') { if (!settled) { settled = true; resolve(); } return; }
        if (d.type === 'error') {
          if (self.errors.length < 8 && self.errors.indexOf(d.message) < 0) self.errors.push(d.message);
          return;
        }
        if (d.type === 'result' && self.pending[d.id]) {
          var p = self.pending[d.id];
          delete self.pending[d.id];
          clearTimeout(p.timer);
          p.resolve({ ok: d.ok, result: d.result, error: d.error });
        }
      };
      window.addEventListener('message', self._onMsg);
      f.srcdoc = html;
      document.body.appendChild(f);

      setTimeout(function () {
        if (!settled) { settled = true; reject(new Error(T('تعذّر تشغيل التطبيق في بيئة الاختبار.', 'Could not boot the app in the test sandbox.'))); }
      }, 6000);
    });
  };

  TestSession.prototype.send = function (cmd) {
    var self = this;
    return new Promise(function (resolve) {
      if (self.aborted || !self.frame || !self.frame.contentWindow) {
        resolve({ ok: false, error: T('توقف الاختبار.', 'Test stopped.') });
        return;
      }
      var id = ++self.seq;
      var payload = Object.assign({ __omranTestCmd: self.token, id: id }, cmd);
      self.pending[id] = {
        resolve: resolve,
        // A hung step must not hang the whole run.
        timer: setTimeout(function () {
          delete self.pending[id];
          resolve({ ok: false, error: T('لم يستجب التطبيق للخطوة.', 'The app did not respond to this step.') });
        }, STEP_TIMEOUT),
      };
      try { self.frame.contentWindow.postMessage(payload, '*'); }
      catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); }
    });
  };

  TestSession.prototype.stop = function () {
    this.aborted = true;
    try { window.removeEventListener('message', this._onMsg); } catch (e) { console.warn('[tester] listener cleanup failed', e); }
    try { if (this.frame) this.frame.remove(); } catch (e) { console.warn('[tester] frame cleanup failed', e); }
    this.frame = null;
  };

  // ---------------------------------------------------------------------
  // خطة الاختبار من النموذج
  // ---------------------------------------------------------------------
  function planPrompt(outline, codeHead) {
    return [
      'أنت مختبِر تطبيقات. لديك خريطة عناصر تطبيق ويب وجزء من كوده.',
      'أعد فقط JSON صالحًا بلا أي نص خارجه وبلا أسوار كود:',
      '{"steps":[{"cmd":"click|type|read","selector":"محدد CSS من الخريطة","value":"للكتابة فقط","expect":"ما الذي يجب أن يتغيّر بعد هذه الخطوة"}]}',
      'القواعد:',
      '- من 3 إلى ' + MAX_STEPS + ' خطوات، تختبر المسار الرئيسي للتطبيق (المهمة التي بُني من أجلها).',
      '- استخدم المحددات كما وردت في الخريطة حرفيًا — لا تخترع محددات.',
      '- ابدأ بإدخال بيانات ثم اضغط الزر ثم اقرأ النتيجة للتحقق.',
      '- ممنوع اختيار أي عنصر يبدو أنه يحذف أو يمسح أو يعيد الضبط (حذف، مسح، reset, clear, delete).',
      '- "expect" جملة قصيرة بالعربية تصف الدليل على النجاح.',
      '',
      'خريطة العناصر:',
      JSON.stringify(outline).slice(0, 4000),
      '',
      'مقتطف من الكود:',
      String(codeHead || '').slice(0, 3000),
    ].join('\n');
  }

  function extractJSON(text) {
    var s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(s); } catch (e) { /* keep going */ }
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { /* give up */ } }
    return null;
  }

  var DESTRUCTIVE = /(حذف|امسح|مسح|إعادة ضبط|اعادة ضبط|\bdelete\b|\bclear\b|\breset\b|\bwipe\b|\bremove all\b)/i;

  // ---------------------------------------------------------------------
  // التشغيل
  // ---------------------------------------------------------------------
  var current = null;

  async function runTest(code, opts) {
    opts = opts || {};
    var status = window.__chatStatus || null;
    function step(icon, text) {
      if (status && !status.isReleased()) return status.step(icon, text);
      return { done: function () {}, fail: function () {} };
    }

    var session = new TestSession(code);
    current = session;
    // notes = ما تخطّيناه عمدًا · errors = ما انكسر فعلًا. خلطهما يجعل
    // تقرير النموذج يطلب إصلاح شيء لم ينكسر أصلًا.
    var report = { steps: [], errors: [], notes: [], passed: 0, failed: 0 };

    var s0 = step('🧪', T('تشغيل التطبيق في بيئة اختبار…', 'Booting the app in a test sandbox…'));
    try {
      await session.start();
      s0.done();
    } catch (e) {
      s0.fail(e.message);
      session.stop(); current = null;
      report.errors.push(e.message);
      return report;
    }

    var sMap = step('🗺️', T('قراءة عناصر الواجهة…', 'Reading the interface…'));
    var out = await session.send({ cmd: 'outline' });
    if (!out.ok || !out.result || !out.result.controls || !out.result.controls.length) {
      sMap.fail(T('لا توجد عناصر تفاعلية', 'No interactive controls'));
      session.stop(); current = null;
      return report;
    }
    sMap.done(out.result.controls.length + T(' عنصرًا', ' controls'));

    var sPlan = step('📋', T('يجهّز خطة الاختبار…', 'Planning the test…'));
    var plan = null;
    try {
      var res = await callAIWithFallback(
        [{ role: 'user', content: planPrompt(out.result, code) }],
        function () {}
      );
      plan = extractJSON(res && res.reply);
    } catch (e) {
      sPlan.fail(String(e && e.message || e));
    }
    if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) {
      sPlan.fail(T('تعذّر تجهيز الخطة', 'Could not build a plan'));
      session.stop(); current = null;
      return report;
    }
    var steps = plan.steps.slice(0, MAX_STEPS).filter(function (st) {
      // Second line of defence: the prompt forbids destructive controls, but a
      // model instruction is not a guarantee — filter here too.
      var t = (st.selector || '') + ' ' + (st.expect || '') + ' ' + (st.value || '');
      if (DESTRUCTIVE.test(t)) { report.notes.push(T('تُخطّيت خطوة قد تحذف بيانات: ', 'Skipped a possibly destructive step: ') + (st.selector || '')); return false; }
      return true;
    });
    sPlan.done(steps.length + T(' خطوة', ' steps'));

    for (var i = 0; i < steps.length; i++) {
      if (session.aborted) break;
      var st = steps[i];
      var icon = st.cmd === 'click' ? '👆' : (st.cmd === 'type' ? '⌨️' : '👁️');
      var label = st.cmd === 'click'
        ? T('ضغط: ', 'Click: ') + (st.selector || '')
        : (st.cmd === 'type'
          ? T('كتابة «', 'Type "') + String(st.value || '').slice(0, 24) + T('» في ', '" into ') + (st.selector || '')
          : T('قراءة: ', 'Read: ') + (st.selector || ''));
      var handle = step(icon, label);
      var r = await session.send(st);
      report.steps.push({ step: st, result: r });
      if (r.ok) { report.passed++; handle.done(); }
      else { report.failed++; handle.fail(r.error); }
    }

    report.errors = report.errors.concat(session.errors);
    session.stop();
    current = null;

    report.notes.forEach(function (n) { step('⏭️', n).done(); });
    var sEnd = step(report.failed || report.errors.length ? '⚠️' : '✅',
      T('النتيجة', 'Result') + ': ' + report.passed + T(' نجحت، ', ' passed, ') + report.failed + T(' فشلت', ' failed')
      + (report.errors.length ? T(' — ', ' — ') + report.errors.length + T(' خطأ تشغيل', ' runtime errors') : ''));
    sEnd.done();

    return report;
  }

  function stopTest() {
    if (current) { current.stop(); current = null; }
  }

  /** ملخّص نصّي يُرسَل للنموذج ليصلح ما فشل. */
  function reportToPrompt(report) {
    var lines = [];
    report.steps.forEach(function (s) {
      lines.push((s.result.ok ? '✓' : '✗') + ' ' + s.step.cmd + ' ' + (s.step.selector || '')
        + (s.step.expect ? ' — المتوقع: ' + s.step.expect : '')
        + (s.result.ok ? '' : ' — الفعلي: ' + (s.result.error || 'فشل')));
    });
    if (report.errors.length) lines.push('أخطاء تشغيل: ' + report.errors.join(' | '));
    return lines.join('\n');
  }

  window.omranTester = { run: runTest, stop: stopTest, reportToPrompt: reportToPrompt, isRunning: function () { return !!current; } };
})();

/* ───────── ربط زر «جرّبه لي 🧪» ─────────
   يظهر فقط حين يوجد كود HTML قابل للمعاينة، ويحتاج ضغطة صريحة في كل مرة. */
(function () {
  function code() {
    try {
      var cur = (typeof state !== 'undefined' && state.projects)
        ? state.projects.find(function (p) { return p.id === state.currentId; }) : null;
      return (cur && cur.code) || '';
    } catch (e) { return ''; }
  }
  function refreshTestBar() {
    var bar = document.getElementById('omranTestBar');
    if (!bar) return;
    var c = code();
    bar.style.display = (c && /<\w+[^>]*>/.test(c)) ? 'flex' : 'none';
  }
  window.refreshTestBar = refreshTestBar;
  setInterval(refreshTestBar, 1500);

  document.addEventListener('click', async function (e) {
    var stopBtn = e.target && e.target.closest && e.target.closest('#btnTestStop');
    if (stopBtn) { try { window.omranTester.stop(); } catch (err) { console.warn('[tester] stop failed', err); } return; }

    var btn = e.target && e.target.closest && e.target.closest('#btnTestApp');
    if (!btn) return;

    var c = code();
    if (!c) return;
    if (window.omranTester.isRunning()) return;

    var stop = document.getElementById('btnTestStop');
    btn.disabled = true;
    var prev = btn.textContent;
    btn.textContent = '🧪 جارٍ الاختبار…';
    if (stop) stop.style.display = '';

    // The run reports every step into the chat status bar, so the user watches
    // it happen and can stop mid-way.
    var thinking = document.createElement('div');
    thinking.className = 'msg assistant';
    try { document.getElementById('messages').appendChild(thinking); } catch (err) { console.warn('[tester] no message list', err); }
    window.__chatStatus = makeChatStatus(thinking);

    var report = null;
    try { report = await window.omranTester.run(c); }
    catch (err) { console.warn('[tester] run failed', err); }

    btn.disabled = false;
    btn.textContent = prev;
    if (stop) stop.style.display = 'none';

    if (report && (report.failed || report.errors.length)) {
      // Hand the failures back to the model with their context so it can fix
      // what the test actually broke — not what it guesses might be wrong.
      try {
        var summary = window.omranTester.reportToPrompt(report);
        if (typeof sendMessageProgrammatically === 'function') {
          sendMessageProgrammatically('اختبرتُ التطبيق ووجدت هذه المشاكل — أصلحها:\n' + summary);
        } else {
          var box = document.getElementById('input') || document.querySelector('textarea');
          if (box) { box.value = 'اختبرتُ التطبيق ووجدت هذه المشاكل — أصلحها:\n' + summary; box.focus(); }
        }
      } catch (err) { console.warn('[tester] handoff failed', err); }
    }
  });
})();
