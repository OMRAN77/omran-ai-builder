/* js/app-22-screen-guide-ui.js — واجهة المرشد البصري في عمران AI
 *
 * يحمل زر «المرشد البصري» في القائمة، يفتح منتقي الصورة، يعرض مربع الهدف،
 * يستدعي window.__screenGuide.guide()، ويدمج النتيجة في المحادثة الحالية.
 *
 * يستخدم نفس أنماط app-16-snapbuild.js:
 *  - يصل لـ state وrenderMessages وsaveState مباشرة (globals من app-09-attach.js)
 *  - يُغلق plusToolsPopup بعد الضغط
 *  - يعرض حالة التقدم في العنصر نفسه (رسالة مؤقتة ثم رسالة نهائية)
 */
(function () {
  'use strict';

  // -------- أدوات مساعدة --------

  function currentProject() {
    if (typeof state === 'undefined' || !state) return null;
    if (!state.currentId) return null;
    return (state.projects || []).find(function (p) { return p.id === state.currentId; }) || null;
  }

  function ensureProject() {
    var p = currentProject();
    if (p) return p;
    // أنشئ محادثة جديدة إن لم تكن هناك واحدة
    if (typeof newProject === 'function') { newProject(); return currentProject(); }
    return null;
  }

  function addMsg(role, content, extra) {
    var p = ensureProject();
    if (!p) return null;
    if (!Array.isArray(p.messages)) p.messages = [];
    var msg = Object.assign({ role: role, content: content }, extra || {});
    p.messages.push(msg);
    if (typeof renderMessages === 'function') renderMessages(true);
    if (typeof saveState === 'function') saveState();
    return msg;
  }

  function updateMsg(msg, patch) {
    if (!msg) return;
    Object.assign(msg, patch);
    if (typeof renderMessages === 'function') renderMessages(true);
    if (typeof saveState === 'function') saveState();
  }

  function closePlusPopup() {
    try {
      var ptp = document.getElementById('plusToolsPopup');
      if (ptp) { ptp.classList.remove('show'); ptp.classList.remove('open'); }
    } catch (e) { /* صامت */ }
  }

  function isAr() {
    return !(typeof AL === 'function' && AL() === 'en');
  }

  // -------- مربع الهدف (overlay بسيط) --------

  function showGoalDialog(onConfirm) {
    var ar = isAr();
    var ov = document.createElement('div');
    ov.id = 'sgGoalOverlay';
    ov.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;',
      'display:flex;align-items:center;justify-content:center;',
      'padding:20px;box-sizing:border-box;'
    ].join('');

    var box = document.createElement('div');
    box.style.cssText = [
      'background:var(--bg-card,#1a1a2e);border-radius:16px;padding:24px 20px 20px;',
      'max-width:480px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.6);',
      'display:flex;flex-direction:column;gap:14px;',
      'border:1px solid rgba(255,255,255,.08);'
    ].join('');

    var title = document.createElement('p');
    title.style.cssText = 'margin:0;font-size:15px;font-weight:600;color:var(--text,#f0f0f0);' + (ar ? 'direction:rtl;text-align:right;' : '');
    title.textContent = ar ? 'ماذا تريد أن تفعل في هذا التطبيق؟' : 'What do you want to do in this app?';

    var sub = document.createElement('p');
    sub.style.cssText = 'margin:0;font-size:12px;color:var(--text-dim,#888);' + (ar ? 'direction:rtl;text-align:right;' : '');
    sub.textContent = ar
      ? 'مثال: "أبي أجدد رخصة قيادتي" أو "كيف أرجّع طلب من تطبيق نون"'
      : 'Example: "I want to renew my driving license" or "how to return an order on noon"';

    var inp = document.createElement('textarea');
    inp.rows = 3;
    inp.style.cssText = [
      'width:100%;box-sizing:border-box;background:var(--bg-input,#111);',
      'border:1px solid rgba(255,255,255,.15);border-radius:10px;',
      'padding:10px 12px;font-size:14px;color:var(--text,#f0f0f0);',
      'resize:none;outline:none;font-family:inherit;',
      (ar ? 'direction:rtl;text-align:right;' : '')
    ].join('');
    inp.placeholder = ar ? 'اكتب هنا…' : 'Type here…';

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

    var btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.textContent = ar ? 'إلغاء' : 'Cancel';
    btnCancel.style.cssText = 'padding:9px 18px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:transparent;color:var(--text-dim,#888);cursor:pointer;font-size:13px;';

    var btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.textContent = ar ? 'ابدأ' : 'Start';
    btnOk.style.cssText = 'padding:9px 22px;border-radius:8px;border:none;background:var(--accent,#e3b341);color:#111;font-weight:700;cursor:pointer;font-size:13px;';

    function close() { try { document.body.removeChild(ov); } catch (e) { /* صامت */ } }

    btnCancel.onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    btnOk.onclick = function () {
      var goal = inp.value.trim();
      if (!goal) { inp.focus(); return; }
      close();
      onConfirm(goal);
    };

    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btnOk.click(); }
      if (e.key === 'Escape') close();
    });

    row.appendChild(btnCancel);
    row.appendChild(btnOk);
    box.appendChild(title);
    box.appendChild(sub);
    box.appendChild(inp);
    box.appendChild(row);
    ov.appendChild(box);
    document.body.appendChild(ov);
    setTimeout(function () { inp.focus(); }, 80);
  }

  // -------- عرض نتيجة الخطوة في المحادثة --------

  function stepToMarkdown(data, goal) {
    var ar = isAr();
    if (data.kind === 'ask') return (ar ? '🔍 ' : '🔍 ') + (data.message || '');
    if (data.kind === 'blocked') return '🔒 ' + (data.message || '');
    if (data.kind === 'done') return '✅ ' + (data.message || (ar ? 'تم! وصلت للهدف.' : 'Done!'));
    if (data.kind === 'error') return '⚠️ ' + (data.message || 'error');

    // kind === 'step'
    var lines = [];
    if (data.screen) lines.push((ar ? '**الشاشة الحالية:** ' : '**Screen:** ') + data.screen);
    if (data.stepNumber && data.totalSteps) {
      lines.push((ar ? '**الخطوة ' : '**Step ') + data.stepNumber + (ar ? ' من ' : ' of ') + data.totalSteps + '**');
    }
    lines.push('');
    lines.push(data.instruction || '');
    if (data.label && data.label.exact) {
      lines.push('');
      lines.push((ar ? '> اضغط على: **' : '> Tap: **') + data.label.exact + '**');
    }
    if (data.stuck) {
      lines.push('');
      lines.push(ar ? '*لاحظتُ أنك أرسلت نفس الشاشة — جرّبتُ مسارًا مختلفًا.*' : '*Noticed same screen — trying a different path.*');
    }
    if (data.usedFallback) {
      lines.push('');
      lines.push(ar ? '*استخدمتُ نموذجًا أدق للتحقق.*' : '*Used higher-precision model.*');
    }
    return lines.join('\n');
  }

  // -------- تشغيل المرشد --------

  function runGuide(file, goal) {
    var ar = isAr();
    var sg = window.__screenGuide;
    if (!sg) { alert(ar ? 'المرشد البصري غير محمّل — حدّث الصفحة.' : 'Screen guide not loaded — please refresh.'); return; }

    var loadingMsg = addMsg('assistant', ar ? '🔭 يحلل الشاشة…' : '🔭 Analyzing screen…', { _loading: true });

    // حفظ shot للرسم لاحقًا
    sg.prepareShot(file).then(function (shot) {
      window.__sgLastShot = shot;
    }).catch(function () { /* صامت */ });

    sg.guide(file, goal, {
      lang: ar ? 'ar' : 'en',
      onLoading: function (v) {
        if (!v && loadingMsg) updateMsg(loadingMsg, { _loading: false });
      },
      onStep: function (data) {
        var text = stepToMarkdown(data, goal);

        // إذا الخطوة فيها صورة مظللة
        var highlighted = null;
        if (data.kind === 'step' && data.box && window.__sgLastShot) {
          try { highlighted = sg.drawHighlight(window.__sgLastShot, data.box); } catch (e) { /* صامت */ }
        }

        if (loadingMsg) {
          updateMsg(loadingMsg, {
            content: text,
            _loading: false,
            _sgHighlight: highlighted || undefined,
          });
          loadingMsg = null;
        } else {
          addMsg('assistant', text, { _sgHighlight: highlighted || undefined });
        }

        // إذا الهدف تحقق أو نقاط ناقصة → أنهِ الجلسة
        if (data.kind === 'done' || data.error === 'no_points') {
          sg.resetSession();
        }

        // إذا طُلب خطوة تالية (المستخدم يصل إلى الهدف) → اقترح المتابعة
        if (data.kind === 'step' && !data.done) {
          var hint = addMsg('assistant',
            ar ? '📷 أرسل لقطة الشاشة التالية وسأعطيك الخطوة التالية.' : '📷 Send the next screenshot and I\'ll guide you further.',
            { _sgContinueHint: true }
          );
          // أزل التلميح عند أي رسالة قادمة
          var cleanup = function () {
            window.removeEventListener('sg:step-sent', cleanup);
            var p = currentProject();
            if (p && hint) {
              p.messages = p.messages.filter(function (m) { return m !== hint; });
              if (typeof renderMessages === 'function') renderMessages(true);
            }
          };
          window.addEventListener('sg:step-sent', cleanup, { once: true });
        }
      },
      onError: function (err) {
        var msg = ar ? '⚠️ تعذّر تحليل الصورة — تأكد من اتصالك وحاول ثانية.' : '⚠️ Could not analyze the screenshot — check your connection and try again.';
        if (loadingMsg) { updateMsg(loadingMsg, { content: msg, _loading: false }); loadingMsg = null; }
        else addMsg('assistant', msg);
      },
    });
  }

  // -------- تسجيل الزر ومنتقي الملف --------

  function boot() {
    // منتقي الصور الخاص بالمرشد (منفصل عن attachInput الرئيسي)
    var sgInput = document.createElement('input');
    sgInput.type = 'file';
    sgInput.accept = 'image/jpeg,image/png,image/webp';
    sgInput.style.display = 'none';
    sgInput.id = 'sgFileInput';
    document.body.appendChild(sgInput);

    var pendingGoal = null;

    sgInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      sgInput.value = '';
      if (!file) return;
      var goal = pendingGoal;
      pendingGoal = null;
      if (!goal) { showGoalDialog(function (g) { runGuide(file, g); }); return; }
      runGuide(file, goal);
    });

    var btn = document.getElementById('btnScreenGuide');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        closePlusPopup();
        pendingGoal = null;
        // اسأل عن الهدف أولاً، ثم افتح المنتقي
        showGoalDialog(function (goal) {
          pendingGoal = goal;
          sgInput.click();
        });
      });
    }

    // -------- مشاركة مباشرة من هاتف (Share Target) --------
    window.addEventListener('sg:shared-screenshot', function (ev) {
      var file = ev.detail && ev.detail.file;
      if (!file) return;
      closePlusPopup();
      // الهدف غير معروف من المشاركة المباشرة → اسأل
      showGoalDialog(function (goal) {
        window.__sgLastShot = null;
        runGuide(file, goal);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
