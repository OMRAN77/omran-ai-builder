/* ───────── تنفيذ أدوات الوكيل في المتصفح ─────────
 *
 * الوكيل يطلب تشغيل كود؛ التنفيذ يجري هنا لا على الخادم — فالمتصفح عند
 * المستخدم وليس عندك، والفشل يكلّفه هو لا خادمك.
 *
 * SECURITY: نفس قرار «جرّبه لي» — sandbox بلا allow-same-origin. الكود الذي
 * يكتبه النموذج لا يصل إلى localStorage ولا الجلسة ولا الكوكيز. أُثبت هذا
 * عمليًا سابقًا: parent.localStorage → SecurityError.
 */
(function () {
  'use strict';

  function runInSandbox(html, timeoutMs) {
    return new Promise(function (resolve) {
      var token = 'ag_' + Math.random().toString(36).slice(2);
      var logs = [], errors = [], done = false;
      var probe = '<scr' + 'ipt>(function(){' +
        'var TK=' + JSON.stringify(token) + ';' +
        'function send(p){try{parent.postMessage(Object.assign({__agentRun:TK},p),"*");}catch(e){}}' +
        'var _l=console.log;console.log=function(){try{send({t:"log",v:Array.prototype.map.call(arguments,function(a){' +
        ' try{return typeof a==="object"?JSON.stringify(a):String(a);}catch(e){return String(a);}}).join(" ")});}catch(e){}' +
        ' return _l.apply(console,arguments);};' +
        'window.addEventListener("error",function(e){send({t:"err",v:(e.message||"Script error")+(e.lineno?" [line "+e.lineno+"]":"")});});' +
        'window.addEventListener("unhandledrejection",function(e){send({t:"err",v:"Unhandled rejection: "+((e.reason&&e.reason.message)||e.reason)});});' +
        'setTimeout(function(){send({t:"end"});},' + (timeoutMs - 300) + ');' +
        '})();</scr' + 'ipt>';

      var full = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + probe; }) : probe + html;
      var frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:900px;height:600px;visibility:hidden';

      function finish() {
        if (done) return; done = true;
        window.removeEventListener('message', onMsg);
        try { frame.remove(); } catch (e) { __swallow(e, 'misc:agentrun'); }
        resolve({ logs: logs.slice(0, 40), errors: errors.slice(0, 10) });
      }
      function onMsg(e) {
        var d = e.data;
        if (!d || d.__agentRun !== token) return;
        if (d.t === 'log' && logs.length < 40) logs.push(String(d.v).slice(0, 600));
        else if (d.t === 'err' && errors.indexOf(d.v) < 0 && errors.length < 10) errors.push(String(d.v).slice(0, 400));
        else if (d.t === 'end') finish();
      }
      window.addEventListener('message', onMsg);
      frame.srcdoc = full;
      document.body.appendChild(frame);
      setTimeout(finish, timeoutMs);
    });
  }

  /** ينفّذ أداة واحدة ويعيد نصًّا يفهمه النموذج. */
  window.omranAgentTools = {
    run: async function (name, args) {
      try {
        if (name === 'run_js') {
          var code = String((args && args.code) || '');
          var wrapped = '<!doctype html><html><head><meta charset="utf-8"></head><body><scr' + 'ipt>' +
            'try{ var __r = (function(){ ' + code + ' })(); if(__r !== undefined) console.log("→", __r); }' +
            'catch(e){ console.log("✗ " + (e && e.message || e)); }' +
            '</scr' + 'ipt></body></html>';
          var r = await runInSandbox(wrapped, 6000);
          if (!r.logs.length && !r.errors.length) return 'نُفِّذ بلا ناتج ولا أخطاء.';
          return (r.logs.length ? 'الناتج:\n' + r.logs.join('\n') : '') +
                 (r.errors.length ? '\nأخطاء:\n' + r.errors.join('\n') : '');
        }
        if (name === 'test_html') {
          var r2 = await runInSandbox(String((args && args.html) || ''), 4000);
          if (!r2.errors.length) return '✅ شُغِّل بلا أخطاء تشغيل.' + (r2.logs.length ? '\nالطرفية:\n' + r2.logs.join('\n') : '');
          return '⚠️ أخطاء تشغيل:\n' + r2.errors.join('\n');
        }
        // 🎨 صورة حقيقية بدل رابط عشوائي. تُخزَّن محليًّا ويُعاد للنموذج رمز قصير
        // (__IMG_n__) يضعه في src؛ العميل يستبدله بـdata URI قبل العرض — فلا
        // تدخل مئات الكيلوبايت في سياق النموذج ولا في سجلّ المحادثة.
        if (name === 'generate_image') {
          var prompt = String((args && args.prompt) || '').trim();
          if (!prompt) return 'وصف الصورة فارغ — لم تُرسم.';
          window.__genImages = window.__genImages || {};
          if (Object.keys(window.__genImages).length >= 4) {
            return 'بلغتَ حدّ أربع صور في هذا الردّ. أكمل الصفحة بخلفيات CSS بدل صور إضافية.';
          }
          var resp = await fetch('/api/media?action=maha-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: prompt,
              token: (window.authGet && window.authGet('aiapp_auth_token')) || '',
              guestId: window.getGuestId ? window.getGuestId() : '',
            }),
          });
          var j = null;
          try { j = await resp.json(); } catch (e) { j = null; }
          if (!resp.ok || !j || !j.imageBase64) {
            return 'تعذّر رسم الصورة: ' + (((j && j.error) || ('HTTP ' + resp.status)) + '').slice(0, 120) +
                   '. لا تخترع رابط صورة — استعمل خلفية CSS بدلها.';
          }
          var tok = '__IMG_' + (Object.keys(window.__genImages).length + 1) + '__';
          window.__genImages[tok] = 'data:' + (j.mimeType || 'image/png') + ';base64,' + j.imageBase64;
          return '✅ رُسمت الصورة. ضع هذا الرمز حرفيًّا في src بلا أي إضافة: ' + tok;
        }
        return 'أداة غير معروفة: ' + name;
      } catch (e) {
        return 'تعذّر التنفيذ: ' + String(e && e.message || e);
      }
    },
  };
})();
