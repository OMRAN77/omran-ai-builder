/* v619: مولّد التوقيع العربيّ — يكتب اسمه، يختار خطًّا، يشارك الصورة فورًا.
   صفر استدعاء AI · صفر نقاط · صفر خادم. الرسم محليّ على canvas بخلفيّة شفافة.
   المخرج الرئيسيّ = مشاركة (navigator.share) والتنزيل ثانويّ. */
(function(){
  'use strict';

  var FONTS = [
    { id:'ruqaa',   ar:'الرقعة',   en:'Ruqaa',    family:"'Rakkas'",      g:'Rakkas',                    w:'400' },
    { id:'thuluth', ar:'الثلث',    en:'Thuluth',  family:"'Aref Ruqaa'",  g:'Aref+Ruqaa:wght@400;700',   w:'700' },
    { id:'diwani',  ar:'الديواني', en:'Diwani',   family:"'Katibeh'",     g:'Katibeh',                   w:'400' },
    { id:'naskh',   ar:'النسخ',    en:'Naskh',    family:"'Amiri'",       g:'Amiri:wght@400;700',        w:'700' },
    { id:'kufi',    ar:'الكوفي',   en:'Kufi',     family:"'Reem Kufi'",   g:'Reem+Kufi:wght@400..700',   w:'600' },
    { id:'farsi',   ar:'الفارسي',  en:'Nastaliq', family:"'Gulzar'",      g:'Gulzar',                    w:'400' }
  ];
  var INKS = [
    { id:'white', v:'#ffffff', ar:'أبيض',  en:'White' },
    { id:'ink',   v:'#111111', ar:'أسود',  en:'Black' },
    { id:'gold',  v:'#c8a24a', ar:'ذهبيّ', en:'Gold'  }
  ];
  var KEY = 'omran_sig';
  var linked = Object.create(null);
  var state = { font:'thuluth', size:96, slant:0, ink:'white', flourish:true, name:'' };

  function tell(e, ctx){
    try{ if(typeof window.__swallow === 'function') window.__swallow(e, ctx); else console.warn(ctx, e); }
    catch(_){ /* guard-ok: تعذّر التسجيل نفسه؛ لا نُسقط الواجهة. */ }
  }
  function isAr(){
    try{ return (document.documentElement.lang || 'ar').toLowerCase() !== 'en'; }
    catch(e){ tell(e, 'sig:lang'); return true; }
  }
  function T(a, b){ return isAr() ? a : b; }
  function fontById(id){
    for(var i=0;i<FONTS.length;i++) if(FONTS[i].id === id) return FONTS[i];
    return FONTS[0];
  }
  function inkVal(id){
    for(var i=0;i<INKS.length;i++) if(INKS[i].id === id) return INKS[i].v;
    return INKS[0].v;
  }
  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }
    catch(e){ tell(e, 'sig:save'); }
  }
  function restore(){
    try{
      var raw = localStorage.getItem(KEY);
      if(!raw) return;
      var o = JSON.parse(raw);
      if(o && typeof o === 'object'){
        if(o.font) state.font = fontById(o.font).id;
        if(typeof o.size === 'number') state.size = Math.min(200, Math.max(40, o.size));
        if(typeof o.slant === 'number') state.slant = Math.min(20, Math.max(-20, o.slant));
        if(o.ink) state.ink = o.ink;
        if(typeof o.flourish === 'boolean') state.flourish = o.flourish;
        if(typeof o.name === 'string') state.name = o.name.slice(0, 40);
      }
    }catch(e){ tell(e, 'sig:restore'); }
  }

  /* الخطوط تُحمّل عند الطلب من Google Fonts — CSP يسمح بـfont-src/style-src https:. */
  function link(f){
    if(linked[f.id]) return;
    linked[f.id] = true;
    try{
      var el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = 'https://fonts.googleapis.com/css2?family=' + f.g + '&display=swap';
      el.setAttribute('data-sig-font', f.id);
      el.onerror = function(){ linked[f.id] = false; };
      document.head.appendChild(el);
    }catch(e){ linked[f.id] = false; tell(e, 'sig:font'); }
  }
  function ready(f, px){
    link(f);
    try{
      if(!document.fonts || !document.fonts.load) return Promise.resolve();
      return document.fonts.load(f.w + ' ' + (px || 96) + 'px ' + f.family).catch(function(){ return null; });
    }catch(e){ tell(e, 'sig:fontload'); return Promise.resolve(); }
  }

  /* الرسم: خلفيّة شفافة، ميل بـshear، وذيل منحنٍ اختياريّ. */
  function paint(canvas, txt, scale){
    var f = fontById(state.font);
    var size = state.size;
    var name = String(txt || '').trim() || T('اسمك', 'Your name');
    var dpr = scale || 3;
    var pad = Math.round(size * 0.5);
    var probe = document.createElement('canvas').getContext('2d');
    if(!probe || !canvas.getContext) return null;
    probe.font = f.w + ' ' + size + 'px ' + f.family + ', Tahoma, Arial, sans-serif';
    var shear = Math.tan(state.slant * Math.PI / 180);
    var w = Math.ceil(probe.measureText(name).width + pad * 2 + Math.abs(shear) * size * 1.8);
    var h = Math.ceil(size * (state.flourish ? 2.12 : 1.85));
    canvas.width = Math.max(2, w * dpr);
    canvas.height = Math.max(2, h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var x = canvas.getContext('2d');
    if(!x) return null;
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.scale(dpr, dpr);
    x.transform(1, 0, -shear, 1, 0, 0);
    x.translate(shear * h * 0.5, 0);
    x.font = f.w + ' ' + size + 'px ' + f.family + ', Tahoma, Arial, sans-serif';
    x.fillStyle = inkVal(state.ink);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.direction = 'rtl';
    x.fillText(name, w / 2, size * 1.02);
    if(state.flourish){
      x.strokeStyle = inkVal(state.ink);
      x.lineWidth = Math.max(2, size * 0.042);
      x.lineCap = 'round';
      x.beginPath();
      var y = size * 1.5;
      x.moveTo(pad * 0.95, y);
      x.quadraticCurveTo(w / 2, y + size * 0.36, w - pad * 0.95, y - size * 0.05);
      x.stroke();
    }
    return { w:w, h:h };
  }

  function blobOf(canvas){
    return new Promise(function(res){
      try{ canvas.toBlob(function(b){ res(b); }, 'image/png'); }
      catch(e){ tell(e, 'sig:blob'); res(null); }
    });
  }
  function toast(msg){
    try{ if(typeof window.settingsToast === 'function'){ window.settingsToast(msg); return; } }
    catch(e){ tell(e, 'sig:toast'); }
  }

  /* المشاركة أوّلًا: ورقة النظام بالملفّ · ثمّ الحافظة · ثمّ التنزيل. */
  function shareCanvas(canvas){
    return blobOf(canvas).then(function(blob){
      if(!blob){ toast(T('تعذّر توليد الصورة.', 'Could not build the image.')); return; }
      var file = null;
      try{ file = new File([blob], 'omran-signature.png', { type:'image/png' }); }
      catch(e){ tell(e, 'sig:file'); }
      if(file && navigator.canShare && navigator.canShare({ files:[file] })){
        return navigator.share({ files:[file], title:'Omran AI', text:T('توقيعي ✍️', 'My signature ✍️') })
          .catch(function(err){
            if(err && err.name === 'AbortError') return;
            tell(err, 'sig:share');
            return clip(blob);
          });
      }
      return clip(blob);
    });
  }
  function clip(blob){
    try{
      if(navigator.clipboard && window.ClipboardItem && navigator.clipboard.write){
        return navigator.clipboard.write([new window.ClipboardItem({ 'image/png':blob })])
          .then(function(){ toast(T('نُسخ التوقيع — الصقه في أي محادثة.', 'Copied — paste it in any chat.')); })
          .catch(function(err){ tell(err, 'sig:clip'); grab(blob); });
      }
    }catch(e){ tell(e, 'sig:clipboard'); }
    grab(blob);
    return Promise.resolve();
  }
  function grab(blob){
    try{
      var u = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = u; a.download = 'omran-signature.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(u); }, 4000);
    }catch(e){ tell(e, 'sig:download'); }
  }

  var BTN = 'flex:1; min-width:120px; border:none; border-radius:12px; padding:12px 16px; font-size:14px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:7px;';

  function open(){
    var ar = isAr();
    var old = document.getElementById('sigOverlay');
    if(old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'sigOverlay';
    ov.dir = ar ? 'rtl' : 'ltr';
    ov.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,.62); backdrop-filter:blur(4px); display:flex; align-items:flex-start; justify-content:center; padding:6vh 14px 20px; overflow:auto;';
    var card = document.createElement('div');
    card.style.cssText = 'width:100%; max-width:620px; background:var(--panel,#0b0b0f); border:1px solid rgba(128,128,128,.26); border-radius:18px; box-shadow:0 22px 64px rgba(0,0,0,.55); overflow:hidden;';
    var head = document.createElement('div');
    head.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 16px; border-bottom:1px solid rgba(128,128,128,.22);';
    var ttl = document.createElement('div');
    ttl.style.cssText = 'font-size:15.5px; font-weight:800; color:var(--text,#fff);';
    ttl.textContent = T('توقيعي', 'My Signature');
    var xb = document.createElement('button');
    xb.type = 'button';
    xb.setAttribute('aria-label', T('إغلاق', 'Close'));
    xb.style.cssText = 'background:none; border:none; color:#8b8ba7; font-size:22px; line-height:1; cursor:pointer; padding:2px 6px;';
    xb.textContent = '×';
    xb.onclick = function(){ ov.remove(); };
    head.appendChild(ttl); head.appendChild(xb);

    var body = document.createElement('div');
    body.style.cssText = 'padding:14px 16px 18px;';

    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 40;
    input.autocomplete = 'off';
    input.value = state.name;
    input.placeholder = T('اكتب اسمك…', 'Type your name…');
    input.style.cssText = 'width:100%; box-sizing:border-box; background:rgba(128,128,128,.12); border:1px solid rgba(128,128,128,.3); border-radius:12px; color:var(--text,#fff); font-size:16px; padding:12px 14px; outline:none;';

    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit,minmax(96px,1fr)); gap:8px; margin-top:12px;';

    var stage = document.createElement('div');
    stage.style.cssText = 'margin-top:14px; border:1px solid rgba(128,128,128,.24); border-radius:14px; padding:12px; display:flex; align-items:center; justify-content:center; min-height:130px; overflow:auto;';
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'max-width:100%; height:auto;';
    stage.appendChild(canvas);

    var rows = document.createElement('div');
    rows.style.cssText = 'margin-top:12px; display:grid; gap:9px;';

    function slider(label, min, max, val, step, on){
      var wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex; align-items:center; gap:10px; font-size:12.5px; color:#8b8ba7;';
      var s = document.createElement('span');
      s.style.cssText = 'min-width:58px;';
      s.textContent = label;
      var r = document.createElement('input');
      r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step || 1);
      r.value = String(val);
      r.style.cssText = 'flex:1; accent-color:var(--accent,#c8a24a);';
      r.addEventListener('input', function(){ on(Number(r.value)); });
      wrap.appendChild(s); wrap.appendChild(r);
      return wrap;
    }

    var inkRow = document.createElement('div');
    inkRow.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:12.5px; color:#8b8ba7;';
    var inkLbl = document.createElement('span');
    inkLbl.style.cssText = 'min-width:58px;';
    inkLbl.textContent = T('اللون', 'Ink');
    inkRow.appendChild(inkLbl);
    INKS.forEach(function(k){
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-sig-ink', k.id);
      b.title = ar ? k.ar : k.en;
      b.style.cssText = 'width:26px; height:26px; border-radius:50%; cursor:pointer; background:' + k.v + '; border:2px solid ' + (state.ink === k.id ? '#c8a24a' : 'rgba(128,128,128,.4)') + ';';
      b.onclick = function(){
        state.ink = k.id;
        inkRow.querySelectorAll('[data-sig-ink]').forEach(function(o){
          o.style.borderColor = (o.getAttribute('data-sig-ink') === k.id) ? '#c8a24a' : 'rgba(128,128,128,.4)';
        });
        render();
      };
      inkRow.appendChild(b);
    });
    var flo = document.createElement('label');
    flo.style.cssText = 'display:inline-flex; align-items:center; gap:6px; margin-inline-start:auto; cursor:pointer;';
    var floBox = document.createElement('input');
    floBox.type = 'checkbox';
    floBox.checked = state.flourish;
    floBox.style.cssText = 'accent-color:var(--accent,#c8a24a);';
    floBox.onchange = function(){ state.flourish = floBox.checked; render(); };
    var floTxt = document.createElement('span');
    floTxt.textContent = T('ذيل التوقيع', 'Flourish');
    flo.appendChild(floBox); flo.appendChild(floTxt);
    inkRow.appendChild(flo);

    rows.appendChild(slider(T('الحجم', 'Size'), 40, 200, state.size, 2, function(v){ state.size = v; render(); }));
    rows.appendChild(slider(T('الميل', 'Slant'), -20, 20, state.slant, 1, function(v){ state.slant = v; render(); }));
    rows.appendChild(inkRow);

    var acts = document.createElement('div');
    acts.style.cssText = 'display:flex; gap:9px; margin-top:14px; flex-wrap:wrap;';
    var shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.style.cssText = BTN + 'background:linear-gradient(135deg,#d8b45c,#b8912f); color:#14161a; box-shadow:0 6px 18px rgba(184,145,47,.28);';
    shareBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg><span>' + T('مشاركة', 'Share') + '</span>';
    shareBtn.onclick = function(){
      shareBtn.disabled = true;
      Promise.resolve(shareCanvas(canvas)).then(function(){ shareBtn.disabled = false; }, function(e){ tell(e, 'sig:shareclick'); shareBtn.disabled = false; });
    };
    var dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.style.cssText = BTN + 'flex:0 0 auto; min-width:0; background:rgba(128,128,128,.16); color:var(--text,#cfcfe0);';
    dlBtn.title = T('تنزيل PNG شفّاف', 'Download transparent PNG');
    dlBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
    dlBtn.onclick = function(){ blobOf(canvas).then(function(b){ if(b) grab(b); }); };
    acts.appendChild(shareBtn); acts.appendChild(dlBtn);

    var note = document.createElement('div');
    note.style.cssText = 'margin-top:10px; color:#8b8ba7; font-size:12px; line-height:1.7;';
    note.textContent = T('خلفيّة شفافة · يعمل بلا اتصال بعد تحميل الخطّ · بلا نقاط.', 'Transparent background · works offline once the font loads · no credits.');

    body.appendChild(input); body.appendChild(grid); body.appendChild(stage); body.appendChild(rows); body.appendChild(acts); body.appendChild(note);
    card.appendChild(head); card.appendChild(body);
    ov.appendChild(card);
    document.body.appendChild(ov);

    ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
    document.addEventListener('keydown', function esc(e){
      if(e.key === 'Escape'){ var n = document.getElementById('sigOverlay'); if(n) n.remove(); document.removeEventListener('keydown', esc); }
    });

    /* بطاقات الخطوط — معاينة الاسم نفسه بكلّ خطّ. */
    FONTS.forEach(function(f){
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-sig-font', f.id);
      b.style.cssText = 'display:grid; gap:2px; padding:8px 6px; border-radius:11px; cursor:pointer; background:rgba(128,128,128,.1); border:1.5px solid ' + (state.font === f.id ? '#c8a24a' : 'rgba(128,128,128,.24)') + ';';
      var pv = document.createElement('span');
      pv.className = 'sigCardPv';
      pv.style.cssText = 'font-family:' + f.family + ", 'Tajawal', sans-serif; font-size:19px; color:var(--text,#fff); line-height:1.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
      pv.textContent = state.name || T('اسمك', 'Name');
      var nm = document.createElement('span');
      nm.style.cssText = 'font-size:11px; color:#8b8ba7;';
      nm.textContent = ar ? f.ar : f.en;
      b.appendChild(pv); b.appendChild(nm);
      b.onclick = function(){
        state.font = f.id;
        grid.querySelectorAll('[data-sig-font]').forEach(function(o){
          o.style.borderColor = (o.getAttribute('data-sig-font') === f.id) ? '#c8a24a' : 'rgba(128,128,128,.24)';
        });
        render();
      };
      link(f);
      grid.appendChild(b);
    });

    var pending = 0;
    function render(){
      state.name = input.value.slice(0, 40);
      grid.querySelectorAll('.sigCardPv').forEach(function(p){ p.textContent = state.name || T('اسمك', 'Name'); });
      stage.style.background = (state.ink === 'ink' ? '#f2f2f4' : '#17171c');
      var mine = ++pending;
      var f = fontById(state.font);
      paint(canvas, state.name, 3);
      ready(f, state.size).then(function(){
        if(mine !== pending) return;
        paint(canvas, state.name, 3);
        save();
      }, function(e){ tell(e, 'sig:render'); });
    }
    input.addEventListener('input', render);
    render();
    setTimeout(function(){ try{ input.focus(); }catch(e){ tell(e, 'sig:focus'); } }, 60);
  }

  /* الزرّ يُدسّ في قائمة ⋮ بلا لمس index.html — ويبقى بعد إعادة ترتيب app-10. */
  function mount(){
    var dd = document.getElementById('headerMenuDropdown');
    if(!dd || document.getElementById('btnSignature')) return;
    var b = document.createElement('button');
    b.className = 'btn';
    b.id = 'btnSignature';
    b.title = T('توقيعي — اصنع توقيعك وشاركه', 'My Signature — craft and share it');
    b.innerHTML = '<svg class="hmIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17c3.5 0 5-8 8-8s2.5 8 6 8h4"></path><path d="M14 21h7"></path></svg> <span class="btnLabel">' + T('توقيعي', 'My Signature') + '</span>';
    b.onclick = function(){ open(); };
    var logout = document.getElementById('btnMenuLogout');
    if(logout && logout.parentElement === dd) dd.insertBefore(b, logout);
    else dd.appendChild(b);
    try{
      new MutationObserver(function(){
        var lbl = b.querySelector('.btnLabel');
        if(lbl) lbl.textContent = T('توقيعي', 'My Signature');
        b.title = T('توقيعي — اصنع توقيعك وشاركه', 'My Signature — craft and share it');
      }).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] });
    }catch(e){ tell(e, 'sig:langwatch'); }
  }

  function init(){ restore(); mount(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.Omran = window.Omran || {};
  window.Omran.signature = { open:open, fonts:function(){ return FONTS.slice(); } };
})();
