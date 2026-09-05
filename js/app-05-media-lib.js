/* v-media-lib (فكرة المالك ٥ سبتمبر — بطاقات «آخر صورة / آخر فيديو / التشكيلة»):
   مكتبة خفيفة في IndexedDB لكل ما ينتجه المستخدم (صور الدردشة، الأنماط، الستايل، الأزياء،
   الديكور، المقاولات، صانع الفيديو) — تُلتقط تلقائيًا من عناصر النتائج، وتُعرض ثلاث بطاقات
   في أعلى محادثة جديدة فارغة. لا خادم، لا رفع: كل شيء على الجهاز. */
(function(){
  'use strict';
  var DB = 'omranLib', STORE = 'items', MAX = 60;
  function tt(k, ar, en){ try{ if(typeof window.t === 'function'){ var v = window.t(k); if(v && v !== k) return v; } }catch(e){ /* guard-ok */ } return ((document.documentElement.lang || 'ar').indexOf('ar') === 0) ? ar : en; }
  function openDb(){
    return new Promise(function(res, rej){
      try{
        var r = indexedDB.open(DB, 1);
        r.onupgradeneeded = function(){ var d = r.result; if(!d.objectStoreNames.contains(STORE)){ var s = d.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('ts', 'ts'); } };
        r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); };
      }catch(e){ rej(e); }
    });
  }
  function tx(mode, fn){ return openDb().then(function(d){ return new Promise(function(res, rej){ var t = d.transaction(STORE, mode); var s = t.objectStore(STORE); var out = fn(s); t.oncomplete = function(){ res(out && out.result !== undefined ? out.result : out); }; t.onerror = function(){ rej(t.error); }; }); }); }
  function all(){ return tx('readonly', function(s){ return s.getAll(); }).then(function(r){ return (r || []).sort(function(a, b){ return b.ts - a.ts; }); }).catch(function(){ return []; }); }
  function hashOf(str){ var h = 0, s = String(str || ''); for(var i = 0; i < s.length; i += 7) h = (h * 31 + s.charCodeAt(i)) | 0; return String(s.length) + ':' + h; }
  function thumbOf(url, cb){
    try{
      var im = new Image(); im.onload = function(){
        try{ var M = 360, k = Math.min(1, M / Math.max(im.naturalWidth || 1, im.naturalHeight || 1)); var c = document.createElement('canvas'); c.width = Math.max(1, Math.round((im.naturalWidth || 1) * k)); c.height = Math.max(1, Math.round((im.naturalHeight || 1) * k)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', .8)); }catch(e){ cb(null); }
      }; im.onerror = function(){ cb(null); };
      if(!/^data:/.test(url)) im.crossOrigin = 'anonymous';
      im.src = url;
    }catch(e){ cb(null); }
  }
  var seen = {};
  function add(item){
    try{
      if(!item || !item.url) return;
      if(/^blob:/.test(item.url) && item.type === 'video' && !item.thumb) return;
      var key = item.type + ':' + hashOf(item.url); if(seen[key]) return; seen[key] = 1;
      var finish = function(thumb){
        var rec = { id: Date.now() + Math.random().toString(36).slice(2, 6), type: item.type, url: /^blob:/.test(item.url) ? '' : item.url, thumb: thumb || (item.type === 'image' ? item.url : ''), tool: item.tool || '', ts: Date.now() };
        tx('readwrite', function(s){ s.put(rec); }).then(function(){ return all(); }).then(function(list){
          if(list.length > MAX){ tx('readwrite', function(s){ list.slice(MAX).forEach(function(x){ s.delete(x.id); }); }); }
          refresh();
        }).catch(function(){ /* guard-ok */ });
      };
      if(item.type === 'image') thumbOf(item.url, finish); else finish(item.thumb || null);
    }catch(e){ /* guard-ok */ }
  }
  window.omranLib = { add: add, all: all, refresh: function(){ refresh(); } };

  /* ── الالتقاط: عناصر النتائج في الأدوات + صور الدردشة ── */
  var RESULTS = { designAiResult: 'decor', fashionAiResult: 'fashion', studioAiResult: 'style', portraitStyleResult: 'portrait', constructionResultImage: 'construction', videoMakerResult: 'video' };
  var watched = {};
  function watchResults(){
    Object.keys(RESULTS).forEach(function(id){
      var el = document.getElementById(id); if(!el || watched[id]) return; watched[id] = 1;
      var note = function(){ try{ var u = el.currentSrc || el.src || ''; if(!u || u === location.href) return; if(el.tagName === 'VIDEO'){ if(/^blob:/.test(u)) return; add({ type: 'video', url: u, tool: 'video' }); } else add({ type: 'image', url: u, tool: RESULTS[id] }); }catch(e){ /* guard-ok */ } };
      try{ new MutationObserver(note).observe(el, { attributes: true, attributeFilter: ['src'] }); }catch(e){ /* guard-ok */ }
      el.addEventListener(el.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', note);
    });
    if(typeof window.__omranImgTools === 'function' && !window.__omranImgTools.__lib){
      var orig = window.__omranImgTools;
      var w = function(wrap, dataUrl){ try{ if(dataUrl && /^(data:|https?:|\/)/.test(dataUrl)) add({ type: 'image', url: dataUrl, tool: 'chat' }); }catch(e){ /* guard-ok */ } return orig.apply(this, arguments); };
      w.__lib = 1; window.__omranImgTools = w;
    }
  }

  /* ── البطاقات الثلاث في أعلى محادثة فارغة ── */
  function css(){
    if(document.getElementById('omranLibCss')) return;
    var st = document.createElement('style'); st.id = 'omranLibCss';
    st.textContent = '#omranHomeCards{display:none;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px 12px 2px;max-width:1100px;margin:0 auto;width:100%;}'
      + '#omranHomeCards.on{display:grid}'
      + '@media (max-width:600px){#omranHomeCards{grid-template-columns:1fr 1fr;} #omranHomeCards .hc:nth-child(3){grid-column:1 / -1;}}'
      + '.hc{background:#111114;border:1px solid rgba(212,175,55,.28);border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:8px;min-width:0;}'
      + '.hc h4{margin:0;font-size:13px;font-weight:800;color:#f3efe4;display:flex;align-items:center;gap:6px;}'
      + '.hc .hm{position:relative;height:118px;border-radius:12px;overflow:hidden;background:#0b0b0d;cursor:pointer;}'
      + '.hc .hm img,.hc .hm video{width:100%;height:100%;object-fit:cover;display:block;}'
      + '.hc .hm .pl{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);} .hc .hm .pl span{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.85);color:#111;display:flex;align-items:center;justify-content:center;font-weight:800;}'
      + '.hc .hg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;height:118px;} .hc .hg .hm{height:auto;}'
      + '.hc .he{height:118px;border-radius:12px;border:1px dashed rgba(212,175,55,.35);background:rgba(255,255,255,.02);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#9a9a9e;font-size:12px;cursor:pointer;text-align:center;padding:6px;}'
      + '.hc .he b{color:#d4af37;font-size:12px;font-weight:800;}'
      + 'html[data-mode="light"] .hc{background:#fff;} html[data-mode="light"] .hc h4{color:#14161a;} html[data-mode="light"] .hc .he{background:rgba(0,0,0,.03);color:#6b6657;}';
    document.head.appendChild(st);
  }
  function host(){
    var h = document.getElementById('omranHomeCards');
    if(h) return h;
    var col = document.getElementById('chatcol'), msgs = document.getElementById('messages'); if(!col || !msgs) return null;
    h = document.createElement('div'); h.id = 'omranHomeCards'; col.insertBefore(h, msgs); return h;
  }
  function openTool(id){ var b = document.getElementById(id); if(b){ try{ b.click(); return; }catch(e){ /* guard-ok */ } } var o = document.getElementById('sectionsToolsOverlay'); if(o) o.classList.add('show'); }
  function view(item){ try{ if(item.type === 'video' && item.url){ var a = document.createElement('a'); a.href = item.url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); return; } var u = item.url || item.thumb; if(typeof window.omranLightbox === 'function') window.omranLightbox(u); else window.open(u, '_blank'); }catch(e){ /* guard-ok */ } }
  function card(title, body){ var c = document.createElement('div'); c.className = 'hc'; var h = document.createElement('h4'); h.textContent = title; c.appendChild(h); c.appendChild(body); return c; }
  function media(item){ var m = document.createElement('div'); m.className = 'hm'; var im = document.createElement('img'); im.src = item.thumb || item.url; im.alt = ''; im.loading = 'lazy'; m.appendChild(im); if(item.type === 'video'){ var p = document.createElement('div'); p.className = 'pl'; p.innerHTML = '<span>▶</span>'; m.appendChild(p); } m.onclick = function(){ view(item); }; return m; }
  function empty(msg, cta, fn){ var e = document.createElement('div'); e.className = 'he'; var p = document.createElement('div'); p.textContent = msg; var b = document.createElement('b'); b.textContent = cta; e.appendChild(p); e.appendChild(b); e.onclick = fn; return e; }
  function chatEmpty(){ try{ var c = (typeof getCurrent === 'function') ? getCurrent() : null; return !c || !c.messages || !c.messages.length; }catch(e){ return false; } }
  var busy = false;
  function refresh(){
    if(busy) return; busy = true;
    setTimeout(function(){ busy = false; }, 250);
    css(); var h = host(); if(!h) return;
    if(!chatEmpty()){ h.classList.remove('on'); return; }
    all().then(function(list){
      var img = list.filter(function(x){ return x.type === 'image'; })[0];
      var vid = list.filter(function(x){ return x.type === 'video'; })[0];
      var three = list.slice(0, 3);
      h.innerHTML = '';
      h.appendChild(card(tt('homeLastImage', '🖼️ آخر صورة', '🖼️ Last image'), img ? media(img) : empty(tt('homeNoImage', 'لسا ما سويت شي هنا', 'Nothing here yet'), tt('homeTryNow', 'جرّب الآن ›', 'Try now ›'), function(){ openTool('btnPortraitStyle'); })));
      h.appendChild(card(tt('homeLastVideo', '🎬 آخر فيديو', '🎬 Last video'), vid ? media(vid) : empty(tt('homeNoVideo', 'لا يوجد فيديوهات بعد', 'No videos yet'), tt('homeMakeVideo', 'أنشئ أول فيديو ›', 'Make your first video ›'), function(){ openTool('btnVideoMaker'); })));
      var g; if(three.length){ g = document.createElement('div'); g.className = 'hg'; three.forEach(function(x){ g.appendChild(media(x)); }); }
      h.appendChild(card(tt('homeCollection', '✨ التشكيلة — آخر ٣ أعمال', '✨ Collection — last 3 works'), three.length ? g : empty(tt('homeEmptyLib', 'مكتبتك فارغة تمامًا', 'Your library is empty'), tt('homeStartCreating', 'ابدأ الإبداع ›', 'Start creating ›'), function(){ openTool(''); })));
      h.classList.add('on');
    });
  }
  function boot(){
    watchResults();
    try{ if(typeof window.renderAll === 'function' && !window.renderAll.__lib){ var r0 = window.renderAll; var r1 = function(){ var o = r0.apply(this, arguments); try{ refresh(); }catch(e){ /* guard-ok */ } return o; }; r1.__lib = 1; window.renderAll = r1; } }catch(e){ /* guard-ok */ }
    refresh();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 1500); setTimeout(watchResults, 4000); setInterval(watchResults, 5000);
})();
