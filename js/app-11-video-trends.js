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
  function ui(k){ return T(D.ui[k]); }
  function tokenOf(){ try{ return (window.authGet && window.authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; } }
  var PREVIEW = function(k){ return '/api/studio-preview?feature=trend&value=' + encodeURIComponent(k); };

  var root, grid, panel, cur = null, photo = null, busy = false;

  function card(t){
    var c = document.createElement('div');
    c.style.cssText = 'border-radius:14px;overflow:hidden;cursor:pointer;background:#17171b;border:1px solid #2a2a30;';
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;aspect-ratio:3/4;background:linear-gradient(160deg,#23232a,#101014);display:flex;align-items:center;justify-content:center;';
    var badge = document.createElement('div'); badge.textContent = t.em;
    badge.style.cssText = 'font-size:34px;';
    wrap.appendChild(badge);
    var im = document.createElement('img'); im.src = PREVIEW(t.key); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
    im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    im.onerror = function(){ im.remove(); };
    wrap.appendChild(im);
    var info = document.createElement('div'); info.style.cssText = 'padding:8px 9px 10px;text-align:center;';
    var nm = document.createElement('div'); nm.textContent = t.em + ' ' + T(t.title); nm.style.cssText = 'font-size:12.5px;font-weight:700;';
    var sb = document.createElement('div'); sb.textContent = T(t.sub); sb.style.cssText = 'font-size:10.5px;color:#9a9a9e;margin-top:3px;line-height:1.5;';
    info.appendChild(nm); info.appendChild(sb);
    c.appendChild(wrap); c.appendChild(info);
    c.onclick = function(){ openTrend(t); };
    return c;
  }

  function renderGrid(){
    if(!grid) return;
    grid.innerHTML = '';
    D.trends.forEach(function(t){ grid.appendChild(card(t)); });
    $('vtTitle').textContent = ui('title');
    $('vtSub').textContent = ui('sub');
  }

  function openTrend(t){
    cur = t; photo = null;
    grid.style.display = 'none'; panel.style.display = 'block'; panel.innerHTML = '';
    var back = document.createElement('button'); back.type = 'button'; back.className = 'btn'; back.style.cssText = 'width:auto;margin-bottom:8px;';
    back.textContent = ui('back'); back.onclick = function(){ if(busy) return; panel.style.display = 'none'; grid.style.display = 'grid'; };
    panel.appendChild(back);
    var head = document.createElement('div'); head.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;';
    var im = document.createElement('img'); im.src = PREVIEW(t.key); im.alt = ''; im.style.cssText = 'width:64px;height:84px;object-fit:cover;border-radius:10px;background:#17171b;flex:none;'; im.onerror = function(){ im.style.visibility = 'hidden'; };
    var ht = document.createElement('div'); ht.innerHTML = '<div style="font-size:15px;font-weight:800;">' + t.em + ' ' + T(t.title) + '</div><div style="font-size:12px;color:#9a9a9e;margin-top:3px;line-height:1.5;">' + T(t.sub) + '</div>';
    head.appendChild(im); head.appendChild(ht); panel.appendChild(head);
    if(t.photo !== 'none'){
      var pb = document.createElement('button'); pb.type = 'button'; pb.className = 'btn'; pb.style.cssText = 'width:100%;';
      pb.textContent = ui('photo') + (t.photo === 'opt' ? '' : ' *');
      var fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
      var pv = document.createElement('img'); pv.style.cssText = 'display:none;width:100%;max-height:220px;object-fit:contain;border-radius:12px;margin-top:8px;background:#000;';
      fi.onchange = function(){
        var f = fi.files && fi.files[0]; if(!f) return;
        var r = new FileReader();
        r.onload = function(){ photo = { dataUrl: String(r.result), mime: f.type || 'image/jpeg' }; pv.src = photo.dataUrl; pv.style.display = 'block'; };
        r.readAsDataURL(f);
      };
      pb.onclick = function(){ fi.click(); };
      panel.appendChild(pb); panel.appendChild(fi); panel.appendChild(pv);
    }
    if(t.kind !== 'none'){
      var lab = document.createElement('label'); lab.style.cssText = 'display:block;font-size:12px;color:#9a9a9e;margin:10px 0 4px;';
      lab.textContent = ui('k_' + t.kind) || ui('k_sentence');
      var inp = document.createElement('input'); inp.type = 'text'; inp.id = 'vtText'; inp.maxLength = 240;
      inp.style.cssText = 'width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:inherit;font-family:inherit;';
      panel.appendChild(lab); panel.appendChild(inp);
    }
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
    if(photo && photo.dataUrl){ var c = photo.dataUrl.indexOf(','); payload.imageBase64 = photo.dataUrl.slice(c + 1); payload.imageMime = photo.mime; }
    var endpoint, statusUrl;
    if(t.engine === 'veo'){ endpoint = '/api/video?action=veo-create'; payload.quality = 'fast'; payload.durationSeconds = 8; }
    else { endpoint = '/api/video-create'; payload.duration = 5; payload.style = 'realistic'; payload.longMode = false; }
    var r = await post(endpoint, payload);
    var j = null; try{ j = await r.json(); }catch(e){ j = null; }
    if(r.status === 428) throw new Error('cancelled');
    if(r.status === 401 || (j && j.error === 'auth_required')) throw new Error(ui('login'));
    if(!r.ok || !j) throw new Error((j && j.error) || ('HTTP ' + r.status));
    for(var i = 0; i < 45; i++){
      await sleep(t.engine === 'veo' ? 8000 : 5000);
      var sr = await fetch(t.engine === 'veo' ? ('/api/video?action=veo-status&op=' + encodeURIComponent(j.op || '')) : ('/api/video-status?id=' + encodeURIComponent(j.id || '')));
      var sj = null; try{ sj = await sr.json(); }catch(e){ sj = null; }
      if(sj && sj.status === 'SUCCEEDED') return Array.isArray(sj.output) ? sj.output[0] : sj.output;
      if(sj && sj.status === 'FAILED') throw new Error(sj.failure || sj.error || 'failed');
    }
    throw new Error('timeout');
  }

  async function make(t){
    if(busy) return;
    var token = tokenOf();
    if(!token){ status(ui('login')); return; }
    if(t.photo === 'req' && !photo){ status(ui('photoReq')); return; }
    var txt = ($('vtText') ? $('vtText').value.trim() : '');
    var params = { name: txt, text: txt };
    busy = true; $('vtGo').disabled = true; $('vtOut').innerHTML = '';
    status(ui('working'));
    try{
      var urls = [];
      var n = t.scenes || 1;
      for(var i = 0; i < n; i++){
        if(n > 1) status(ui('scene').replace('{i}', i + 1).replace('{n}', n) + ' ' + ui('working'));
        urls.push(await oneClip(t, Object.assign({ sceneIndex: i }, params), token));
      }
      var finalUrl = urls[0];
      if(urls.length > 1 && window.__omranConcatScenes){
        try{ finalUrl = await window.__omranConcatScenes(urls); }catch(e){ finalUrl = null; }
      }
      var out = $('vtOut');
      (finalUrl ? [finalUrl] : urls).forEach(function(u){
        var v = document.createElement('video'); v.src = u; v.controls = true; v.playsInline = true; v.style.cssText = 'width:100%;border-radius:12px;background:#000;margin-top:6px;';
        out.appendChild(v);
        var dl = document.createElement('a'); dl.href = u; dl.download = 'omran-trend-' + t.key + '.mp4'; dl.className = 'btn'; dl.style.cssText = 'display:block;text-align:center;margin-top:6px;';
        dl.textContent = ui('download');
        dl.onclick = function(e){ if(window.autoSaveVideo){ e.preventDefault(); window.autoSaveVideo(u, 'omran-trend-' + t.key + '.mp4'); } };
        out.appendChild(dl);
      });
      var again = document.createElement('button'); again.type = 'button'; again.className = 'btn'; again.style.cssText = 'width:100%;margin-top:8px;'; again.textContent = ui('retry'); again.onclick = function(){ make(t); };
      out.appendChild(again);
      status(ui('done'));
      try{ window.__chatVideoResult = { url: finalUrl || urls[0] }; }catch(e){ /* guard-ok */ }
    }catch(e){
      if(String(e && e.message) !== 'cancelled') status(ui('fail') + ': ' + String((e && e.message) || e).slice(0, 160));
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
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 900);
})();
