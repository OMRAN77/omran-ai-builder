/* ───────── v-video-trends: «🔥 ترندات» — فيديو بلمسة واحدة داخل صانع الفيديو ─────────
 * بطاقات مصوّرة (معاينة تُولَّد وتُحفظ على الخادم)، يختار المستخدم بطاقة، يرفع صورة إن
 * لزم، يكتب كلمة، ويضغط «اصنع». المحرك والمدة والنسبة والأمر كلها من الترند نفسه.
 * لا يلمس خانات صانع الفيديو الحالية. النصوص بالـ14 لغة (app-11-video-trends-data.js). */
(function(){
  'use strict';
  var D = window.__VIDEO_TRENDS; if(!D) return;
  var $ = function(id){ return document.getElementById(id); };
  function lg(){ try{ return (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar'; }catch(e){ return 'ar'; } }
  function T(o){ return (o && (o[lg()] || o.en || o.ar)) || ''; }
  /* v-vmk-clean (المالك: «شيل الأيقونات… شغل نضيف ومرتب»): لا إيموجي في واجهة الترندات — الأسماء وحدها */
  function noEmoji(x){ return String(x == null ? '' : x).replace(/\u200D(?=\p{Extended_Pictographic})|(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u20E3/gu, '').replace(/\s{2,}/g, ' ').trim(); }
  function ui(k){ return noEmoji(T(D.ui[k])); }
  function tokenOf(){ try{ return (window.authGet && window.authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; } }
  var PREVIEW = function(k){ return '/api/studio-preview?feature=trend&value=' + encodeURIComponent(k); };

  var root, grid, panel, cur = null, photos = [], busy = false;
  /* v-trend-people: حتّى ثلاث شخصيّات في الفيديو الواحد — صورة لكلّ واحد، والكلّ يظهر معًا. */
  var MAX_PEOPLE = 3;
  /* v-trend-413 (المالك بلقطة «❌ تعذّر: HTTP 413» مع شخصيّتين): الصور كانت تُقرأ خامًا بـreadAsDataURL،
     وصورة جوّال واحدة ٣–١٢م تصير بـbase64 أكبر بالثلث — فيتجاوز الطلب حدّ حجم الجسم ويُرفض عند حافّة
     الاستضافة قبل أن يصل الخادم أصلًا. التصغير هنا بنفس وصفة __compressImg المثبَتة (v530) في مودالات
     الاستوديو، لكن بأطول ضلع ١٤٠٠ لا ١٠٢٤ (v-trend-identity): وجه الطفل في صورة واقف كامل ~١٢٪ من
     الإطار، فعند ١٠٢٤ يصل ~١٢٠ بكسل وتُعاد ملامحه تقريبًا. ١٤٠٠ ⇒ ~١٧٠ بكسل، والحمولة في أسوأ حال
     (ثلاث شخصيّات) ~١٫٩م وهو دون الحدّ بمريح. الملفّ الذي يتعذّر فكّه يُتخطّى. */
  var SHRINK_MAX = 1400, SHRINK_Q = 0.85;
  function shrink(file, done){
    var r = new FileReader();
    r.onload = function(){
      var img = new Image();
      img.onload = function(){
        try{
          var w = img.width, h = img.height;
          if(Math.max(w, h) > SHRINK_MAX){ var k = SHRINK_MAX / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          done(c.toDataURL('image/jpeg', SHRINK_Q));
        }catch(e){ done(''); }
      };
      img.onerror = function(){ done(''); };
      img.src = String(r.result || '');
    };
    r.onerror = function(){ done(''); };
    r.readAsDataURL(file);
  }

  /* بطاقة نظيفة: المعاينة تملأها والاسم فوقها في أسفلها — لا شيء تحتها، ولا أيقونة، ولا سطر وصف */
  function card(t){
    var c = document.createElement('div');
    c.setAttribute('role', 'button'); c.tabIndex = 0;
    c.style.cssText = 'position:relative;aspect-ratio:3/4;border-radius:14px;overflow:hidden;cursor:pointer;background:linear-gradient(160deg,#262a34,#12141a);border:1px solid var(--border,#2a2a30);';
    var im = document.createElement('img'); im.src = PREVIEW(t.key); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
    im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    im.onerror = function(){ im.remove(); };
    c.appendChild(im);
    var nm = document.createElement('div'); nm.textContent = noEmoji(T(t.title));
    nm.style.cssText = 'position:absolute;inset:auto 0 0 0;padding:26px 10px 10px;text-align:center;font-size:12.5px;font-weight:700;line-height:1.5;color:#fff;background:linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,0));';
    c.appendChild(nm);
    c.onclick = function(){ openTrend(t); };
    c.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openTrend(t); } };
    return c;
  }

  function renderGrid(){
    if(!grid) return;
    grid.innerHTML = '';
    D.trends.forEach(function(t){ grid.appendChild(card(t)); });
    $('vtTitle').textContent = ui('title');
    $('vtSub').textContent = ui('sub');
  }

  /* شريط الشخصيّات: مربّع لكلّ صورة مرفوعة، ثمّ مربّع «＋» واحد ما دام العدد دون الحدّ. */
  function renderPeople(strip, t){
    strip.innerHTML = '';
    var slot = function(){
      var s = document.createElement('div');
      s.style.cssText = 'position:relative;width:78px;height:100px;border-radius:12px;overflow:hidden;flex:none;';
      return s;
    };
    var tag = function(i){
      var b = document.createElement('div');
      b.textContent = ui('person').replace('{n}', String(i + 1));
      b.style.cssText = 'position:absolute;inset:auto 0 0 0;padding:3px 0;text-align:center;font-size:10.5px;font-weight:700;background:rgba(0,0,0,.62);';
      return b;
    };
    photos.forEach(function(p, i){
      var s = slot(); s.style.cssText += 'border:1px solid rgba(212,175,55,.5);background:#000;';
      var im = document.createElement('img'); im.src = p.dataUrl; im.alt = '';
      im.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', ui('person').replace('{n}', String(i + 1)));
      x.style.cssText = 'position:absolute;top:4px;inset-inline-end:4px;width:22px;height:22px;line-height:1;border:0;border-radius:50%;background:rgba(0,0,0,.66);color:#fff;font-size:12px;cursor:pointer;padding:0;';
      x.onclick = function(){ if(busy) return; photos.splice(i, 1); renderPeople(strip, t); };
      s.appendChild(im); s.appendChild(tag(i)); s.appendChild(x);
      strip.appendChild(s);
    });
    if(photos.length >= MAX_PEOPLE) return;
    var add = slot();
    add.style.cssText += 'border:1px dashed rgba(255,255,255,.28);background:rgba(255,255,255,.03);cursor:pointer;display:flex;align-items:center;justify-content:center;';
    /* صورة شخصيّة (ظلّ رأس وكتفين) + ＋ صغيرة — يُفهم من المربّع أنّه مكان إنسان لا ملفّ */
    var ghost = document.createElement('div');
    ghost.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" aria-hidden="true">'
      + '<circle cx="12" cy="8" r="4" fill="currentColor" opacity=".55"/>'
      + '<path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor" opacity=".55"/></svg>';
    ghost.style.cssText = 'color:#8b8b90;display:flex;flex-direction:column;align-items:center;margin-bottom:12px;';
    var plus = document.createElement('div'); plus.textContent = '＋'; plus.style.cssText = 'font-size:15px;line-height:1;color:var(--omGold,#d4af37);margin-top:-2px;';
    ghost.appendChild(plus);
    add.appendChild(ghost); add.appendChild(tag(photos.length));
    var fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true; fi.style.display = 'none';
    fi.onchange = function(){
      var files = Array.prototype.slice.call(fi.files || []).slice(0, MAX_PEOPLE - photos.length);
      var left = files.length; if(!left) return;
      files.forEach(function(f){
        shrink(f, function(dataUrl){
          if(dataUrl) photos.push({ dataUrl: dataUrl, mime: 'image/jpeg' });
          if(!--left) renderPeople(strip, t);
        });
      });
    };
    add.onclick = function(){ if(!busy) fi.click(); };
    strip.appendChild(add); strip.appendChild(fi);
  }

  /* مساعد الكتابة داخل نموذج الترند (المالك: «في الترندات المحادثة غير موجودة»): نفس إجراء video-write، ويضع الناتج في خانتَي الترند */
  function W(k){ var v = (typeof window.t === 'function') ? window.t(k) : ''; return v && v !== k ? noEmoji(v) : ''; }
  function assistant(t){
    var d = document.createElement('details'); d.open = true;
    d.style.cssText = 'margin-top:12px;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:0 12px 12px;background:rgba(255,255,255,.03);';
    var sm = document.createElement('summary'); sm.textContent = W('vwTitle'); sm.style.cssText = 'cursor:pointer;padding:11px 0;font-size:12.5px;font-weight:700;color:#e8c27a;list-style:none;';
    var msgs = document.createElement('div'); msgs.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:220px;overflow-y:auto;';
    var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    var inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 400; inp.placeholder = W('vwPh');
    inp.style.cssText = 'flex:1;min-width:0;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:inherit;font-family:inherit;';
    var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = W('vwSend');
    btn.style.cssText = 'padding:0 18px;border:0;border-radius:10px;background:linear-gradient(135deg,#e8c27a,#c9964a);color:#1a1408;font:inherit;font-weight:800;cursor:pointer;';
    var bubble = function(txt, own){ var b = document.createElement('div'); b.textContent = txt; b.style.cssText = 'padding:8px 11px;border-radius:12px;font-size:12.5px;line-height:1.8;white-space:pre-wrap;' + (own ? 'align-self:flex-start;background:rgba(232,194,122,.12);border:1px solid rgba(232,194,122,.3);' : 'align-self:flex-end;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);'); msgs.appendChild(b); msgs.scrollTop = msgs.scrollHeight; return b; };
    var put = function(el, v){ if(!el) return; el.value = String(v).slice(0, 400); el.dispatchEvent(new Event('input', { bubbles: true })); };
    var chip = function(label, fn){ var c = document.createElement('button'); c.type = 'button'; c.textContent = label; c.style.cssText = 'margin:8px 6px 0 0;padding:4px 11px;border-radius:99px;border:1px solid rgba(232,194,122,.55);background:none;color:#e8c27a;font:inherit;font-size:11.5px;cursor:pointer;'; c.onclick = fn; return c; };
    var busyA = false;
    var send = function(){
      var q = inp.value.trim(); if(!q || busyA) return; busyA = true; btn.disabled = true; inp.value = '';
      bubble(q, true); var wait = bubble(W('vwBusy'), false);
      var kind = /إعلان|اعلان|\bad\b|advert/i.test(q) ? 'ad' : /حوار|dialog/i.test(q) ? 'dialogue' : 'story';
      fetch('/api/tools?action=video-write', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ request:q, kind:kind, duration:'8', token:tokenOf(), characters:[] }) })
        .then(function(r){ return r.json(); }).then(function(r){
          wait.remove();
          var x = r && r.result;
          if(!x){ bubble(W(r && r.reason === 'limit' ? 'vwLimit' : r && r.reason === 'auth' ? 'vwLogin' : 'vwErr'), false); return; }
          var speech = (x.lines && x.lines.length) ? x.lines.map(function(l){ return l.text; }).join(' ') : x.narration;
          var all = [x.scene].concat((x.lines || []).map(function(l){ return (l.who ? l.who + ': ' : '') + l.text; }), x.narration ? [x.narration] : []).filter(Boolean).join('\n');
          var b = bubble(all, false);
          var main = $('vtText'), extra = $('vtExtra');
          if(main) b.appendChild(chip(W('vwToScene'), function(){ put(main, t.kind === 'sentence' ? (speech || x.scene) : (x.scene || speech)); }));
          if(extra) b.appendChild(chip(W('vcToExtra'), function(){ put(extra, all); }));
        }).catch(function(){ wait.remove(); bubble(W('vwErr'), false); })
        .then(function(){ busyA = false; btn.disabled = false; });
    };
    btn.onclick = send; inp.onkeydown = function(e){ if(e.key === 'Enter'){ e.preventDefault(); send(); } };
    row.appendChild(inp); row.appendChild(btn); d.appendChild(sm); d.appendChild(msgs); d.appendChild(row);
    return d;
  }

  function openTrend(t){
    cur = t; photos = [];
    grid.style.display = 'none'; panel.style.display = 'block'; panel.innerHTML = '';
    var back = document.createElement('button'); back.type = 'button'; back.className = 'btn'; back.style.cssText = 'width:auto;margin-bottom:8px;';
    back.textContent = ui('back'); back.onclick = function(){ if(busy) return; panel.style.display = 'none'; grid.style.display = 'grid'; };
    panel.appendChild(back);
    var head = document.createElement('div'); head.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;';
    var im = document.createElement('img'); im.src = PREVIEW(t.key); im.alt = ''; im.style.cssText = 'width:64px;height:84px;object-fit:cover;border-radius:10px;background:#17171b;flex:none;'; im.onerror = function(){ im.style.visibility = 'hidden'; };
    var ht = document.createElement('div'); ht.innerHTML = '<div style="font-size:15px;font-weight:800;">' + noEmoji(T(t.title)) + '</div><div style="font-size:12px;color:#9a9a9e;margin-top:3px;line-height:1.5;">' + T(t.sub) + '</div>';
    head.appendChild(im); head.appendChild(ht); panel.appendChild(head);
    if(t.photo !== 'none'){
      var plab = document.createElement('div'); plab.style.cssText = 'font-size:12px;color:#9a9a9e;margin:2px 0 7px;line-height:1.6;';
      plab.textContent = ui('people') + (t.photo === 'opt' ? '' : ' *');
      var strip = document.createElement('div'); strip.id = 'vtPeople'; strip.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
      panel.appendChild(plab); panel.appendChild(strip);
      renderPeople(strip, t);
    }
    if(t.kind !== 'none'){
      var lab = document.createElement('label'); lab.style.cssText = 'display:block;font-size:12px;color:#9a9a9e;margin:10px 0 4px;';
      lab.textContent = ui('k_' + t.kind) || ui('k_sentence');
      /* v-trend-extra: سطر واحد بحدّ ٢٤٠ ← خانة متعدّدة الأسطر بحدّ ٤٠٠ (أكثر من جملة) */
      var inp = document.createElement('textarea'); inp.rows = 2; inp.id = 'vtText'; inp.maxLength = 400;
      inp.style.cssText = 'width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:inherit;font-family:inherit;';
      panel.appendChild(lab); panel.appendChild(inp);
    }
    /* v-trend-extra (المالك: «ليش ما أقدر أكتب اللي أريده؟»): ٤٦ من ٥٥ ترندًا كانت بلا خانة كتابة —
       الآن لكلّ ترند «اكتب اللي تبيه» اختياريّة تُدمج في الأمر توجيهًا يعدّل الترند. */
    var xlab = document.createElement('label'); xlab.style.cssText = 'display:block;font-size:12px;color:#9a9a9e;margin:10px 0 4px;';
    xlab.textContent = ui('extra');
    var xinp = document.createElement('textarea'); xinp.rows = 2; xinp.id = 'vtExtra'; xinp.maxLength = 400; xinp.placeholder = ui('extraPh');
    xinp.style.cssText = 'width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:inherit;font-family:inherit;resize:vertical;';
    panel.appendChild(xlab); panel.appendChild(xinp);
    panel.appendChild(assistant(t));
    var go = document.createElement('button'); go.type = 'button'; go.className = 'btn primary'; go.id = 'vtGo'; go.style.cssText = 'width:100%;margin-top:12px;font-weight:800;';
    go.textContent = ui('make') + (t.scenes > 1 ? ' (' + t.scenes + ')' : '');
    go.onclick = function(){ make(t); };
    panel.appendChild(go);
    var st = document.createElement('div'); st.id = 'vtStatus'; st.style.cssText = 'display:none;margin-top:10px;font-size:13px;line-height:1.7;';
    var out = document.createElement('div'); out.id = 'vtOut'; out.style.cssText = 'margin-top:10px;';
    panel.appendChild(st); panel.appendChild(out);
    try{ panel.scrollIntoView({ behavior:'smooth', block:'start' }); }catch(e){ /* guard-ok */ }
  }

  function status(txt){ var s = $('vtStatus'); if(!s) return; s.textContent = txt || ''; s.style.display = txt ? 'block' : 'none'; }
  function post(url, payload){
    return window.postWithConfirm ? window.postWithConfirm(url, payload) : fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
  }
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

  async function oneClip(t, params, token){
    var payload = { trend: t.key, params: params, ratio: t.ratio, token: token };
    /* v-trend-people: الأولى في imageBase64 كما كانت (توافق)، وما زاد عنها في imagesBase64 للخادم. */
    if(photos.length){
      var raw = photos.map(function(p){ return { b64: p.dataUrl.slice(p.dataUrl.indexOf(',') + 1), mime: p.mime }; });
      payload.imageBase64 = raw[0].b64; payload.imageMime = raw[0].mime;
      if(raw.length > 1){ payload.imagesBase64 = raw.map(function(x){ return x.b64; }); payload.imagesMime = raw.map(function(x){ return x.mime; }); }
      payload.params = Object.assign({}, params, { people: raw.length });
    }
    var endpoint, statusUrl;
    if(t.engine === 'veo'){ endpoint = '/api/video?action=veo-create'; payload.quality = 'fast'; payload.durationSeconds = 8; }
    else { endpoint = '/api/video-create'; payload.duration = 5; payload.style = 'realistic'; payload.longMode = false; }
    var r = await post(endpoint, payload);
    var j = null; try{ j = await r.json(); }catch(e){ j = null; }
    if(r.status === 428) throw new Error('cancelled');
    if(r.status === 401 || (j && j.error === 'auth_required')) throw new Error(ui('login'));
    if(!r.ok || !j) throw Object.assign(new Error((j && j.error) || ('HTTP ' + r.status)), { code: (j && j.error) || '', retryAfter: (j && j.retryAfter) || 0 });
    for(var i = 0; i < 45; i++){
      await sleep(t.engine === 'veo' ? 8000 : 5000);
      var sr = await fetch(t.engine === 'veo' ? ('/api/video?action=veo-status&op=' + encodeURIComponent(j.op || '')) : ('/api/video-status?id=' + encodeURIComponent(j.id || '')));
      var sj = null; try{ sj = await sr.json(); }catch(e){ sj = null; }
      if(sj && sj.status === 'SUCCEEDED') return Array.isArray(sj.output) ? sj.output[0] : sj.output;
      if(sj && sj.status === 'FAILED') throw new Error(sj.failure || sj.error || 'failed');
    }
    throw new Error('timeout');
  }

  /* v-video-refund: رمز الخادم الخام كان يظهر للمستخدم («تعذّر: video_cooldown») — نترجمه. */
  function errText(e){
    if(e && e.code === 'video_cooldown'){
      var m = Math.max(1, Math.ceil((Number(e.retryAfter) || 180) / 60));
      return ui('cooldown').replace('{m}', String(m));
    }
    /* v-trend-413: «HTTP 413» رمز حافّة لا رسالة — الصور أثقل من أن تُرسَل */
    if(/\b413\b/.test(String((e && e.message) || ''))) return ui('tooBig');
    return ui('fail') + ': ' + String((e && e.message) || e).slice(0, 160);
  }

  /* v-video-seq-cooldown: ترند بأكثر من مشهد (قصّة بيكسار: ٣) كان يموت عند المشهد الثاني بـvideo_cooldown
     والأوّل مدفوع — ننتظر المتبقّي الذي يعلنه الخادم بعدّ تنازليّ ظاهر ثمّ نعيد المشهد نفسه (مرّتين على
     الأكثر). المشهد الوحيد كما كان: رسالة المهلة بلا انتظار. */
  var SEQ_WAITS_MAX = 2;
  async function clipInSequence(t, params, token, sceneNo, total){
    for(var waits = 0; ; waits++){
      try{ return await oneClip(t, params, token); }
      catch(e){
        if(total < 2 || !(e && e.code === 'video_cooldown') || waits >= SEQ_WAITS_MAX) throw e;
        var secs = Math.max(1, Math.ceil(Number(e.retryAfter) || 180));
        for(var left = secs; left > 0; left--){
          status(ui('waitNext').replace('{i}', String(sceneNo)).replace('{n}', String(total)).replace('{s}', String(left)));
          await sleep(1000);
        }
      }
    }
  }

  async function make(t){
    if(busy) return;
    var token = tokenOf();
    if(!token){ status(ui('login')); return; }
    if(t.photo === 'req' && !photos.length){ status(ui('photoReq')); return; }
    var txt = ($('vtText') ? $('vtText').value.trim() : '');
    var params = { name: txt, text: txt };
    /* v-trend-extra + v-trend-backdrops: ما كتبه المستخدم، ورقم خلفيّة جديد لكلّ فيديو من هذا الترند */
    var extra = ($('vtExtra') ? $('vtExtra').value.trim() : '');
    if(extra) params.extra = extra;
    try{
      var bk = 'aiapp_trend_bg_' + t.key;
      params.bg = (parseInt(localStorage.getItem(bk) || '0', 10) || 0) + 1;
      localStorage.setItem(bk, String(params.bg));
    }catch(e){ params.bg = Math.floor(Math.random() * 100000); } /* guard-ok — بلا تخزين: عشوائيّ */
    busy = true; $('vtGo').disabled = true; $('vtOut').innerHTML = '';
    status(ui('working'));
    try{
      var urls = [];
      var n = t.scenes || 1;
      for(var i = 0; i < n; i++){
        if(n > 1) status(ui('scene').replace('{i}', i + 1).replace('{n}', n) + ' ' + ui('working'));
        urls.push(await clipInSequence(t, Object.assign({ sceneIndex: i }, params), token, i + 1, n));
      }
      /* v-trend-dl-fix (بلاغ: تحميل الترند لا يعمل، ومشهد الدمج يظهر [object Blob]):
         __omranConcatScenes يرجّع Blob لا رابطًا — يلزمه URL.createObjectURL قبل أي src/href.
         ورابط خارجيّ خام (Runway/Veo) لا يُحمَّل بوسم download عبر أصل مختلف؛ يمرّ ببروكسي الخادم
         (نفس ما يفعله app-11-video.js دائمًا)، والزرّ يعمل افتراضيًّا بلا اعتراض نقرة. */
      var finalUrl = urls[0];
      var finalIsBlob = false;
      if(urls.length > 1 && window.__omranConcatScenes){
        try{ finalUrl = URL.createObjectURL(await window.__omranConcatScenes(urls)); finalIsBlob = true; }catch(e){ finalUrl = null; finalIsBlob = false; }
      }
      var out = $('vtOut');
      (finalUrl ? [finalUrl] : urls).forEach(function(u){
        var isBlobUrl = finalUrl ? finalIsBlob : false;
        var v = document.createElement('video'); v.src = u; v.controls = true; v.playsInline = true; v.style.cssText = 'width:100%;border-radius:12px;background:#000;margin-top:6px;';
        out.appendChild(v);
        var dl = document.createElement('a');
        dl.href = isBlobUrl ? u : (window.__omranProxyVideoUrl ? window.__omranProxyVideoUrl(u) : u);
        dl.download = 'omran-trend-' + t.key + '.mp4'; dl.className = 'btn'; dl.style.cssText = 'display:block;text-align:center;margin-top:6px;';
        dl.textContent = ui('download');
        out.appendChild(dl);
      });
      var again = document.createElement('button'); again.type = 'button'; again.className = 'btn'; again.style.cssText = 'width:100%;margin-top:8px;'; again.textContent = ui('retry'); again.onclick = function(){ make(t); };
      out.appendChild(again);
      status(ui('done'));
      try{ window.__chatVideoResult = { url: finalUrl || urls[0] }; }catch(e){ /* guard-ok */ }
    }catch(e){
      if(String(e && e.message) !== 'cancelled') status(errText(e));
      else status('');
    }finally{ busy = false; if($('vtGo')) $('vtGo').disabled = false; }
  }

  function boot(){
    var modal = $('videoMakerModal'); if(!modal || $('vtRoot')) return;
    /* أول ما يراه المستخدم: مباشرة تحت رأس النافذة، قبل المعاينة والخيارات */
    var h3 = modal.querySelector('h3'); var desc = (h3 && h3.parentElement) || modal.querySelector('[data-i18n="videoMakerDesc"]'); if(!desc) return;
    root = document.createElement('div'); root.id = 'vtRoot';
    root.style.cssText = 'margin:10px 0 6px;padding:10px 12px;border:1px solid var(--omGoldSoft,rgba(212,175,55,.35));border-radius:14px;background:rgba(212,175,55,.06);';
    root.innerHTML = '<div id="vtTitle" style="font-size:14px;font-weight:800;margin-bottom:2px;"></div><div id="vtSub" style="font-size:12px;color:#9a9a9e;margin-bottom:10px;line-height:1.6;"></div>' +
      '<div id="vtGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;"></div><div id="vtPanel" style="display:none;"></div>';
    desc.insertAdjacentElement('afterend', root);
    grid = $('vtGrid'); panel = $('vtPanel');
    renderGrid();
    try{ new MutationObserver(function(){ if(panel.style.display === 'none') renderGrid(); else { $('vtTitle').textContent = ui('title'); $('vtSub').textContent = ui('sub'); } }).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){ /* guard-ok */ }
    window.omranVideoTrends = { open: function(key){ var t = D.trends.filter(function(x){ return x.key === key; })[0]; if(t){ if(window.omranOpenVideoMaker) window.omranOpenVideoMaker(''); openTrend(t); } } };
  }
  // v-perf-idle-timers: boot() كانت تُستدعى عند DOMContentLoaded (مرّتين: فورًا و٩٠٠مل ثانية لاحقًا) فتبني
  // شبكة ٤٥ بطاقة (٤٥ صورة معاينة) داخل نافذة صانع الفيديو حتّى لو لم يفتحها المستخدم إطلاقًا في تلك
  // الجلسة. الآن تُبنى فقط عند أوّل فتح فعليّ لصانع الفيديو (omranOpenVideoMaker في app-11-video.js
  // يستدعي هذا المعرّف — نفس الحزمة، لا تحميل شبكة منفصل فلا سباق تزامن).
  window.__videoTrendsBoot = boot;
})();
