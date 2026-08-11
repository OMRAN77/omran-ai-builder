/* 🎯 v527 — الأوضاع الصريحة داخل قائمة + : صورة · بحث · تفكير · تعلّم */
(function(){
  'use strict';
  if(window.__omModesReady) return; window.__omModesReady = true;
  var AR = (document.documentElement.getAttribute('lang') || 'ar').indexOf('ar') === 0;
  var MODES = [
    { id:'image', ar:'إنشاء صورة',      en:'Create image', ic:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>' },
    { id:'web',   ar:'البحث على الويب', en:'Web search',   ic:'🌐' },
    { id:'think', ar:'التفكير العميق',  en:'Think deeper', ic:'🧠' },
    { id:'learn', ar:'تعلّم',            en:'Learn',        ic:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>' }
  ];
  window.__omMode = null;
  var chipWrap, popup, ta;
  function lbl(m){ return AR ? m.ar : m.en; }
  function build(){
    var box = document.getElementById('composerBox');
    ta      = document.getElementById('prompt');
    popup   = document.getElementById('plusToolsPopup');
    if(!box || !ta || !popup || document.getElementById('omModeChip')) return;
    chipWrap = document.createElement('div');
    chipWrap.id = 'omModeChip';
    chipWrap.style.display = 'none';
    box.insertBefore(chipWrap, ta);
    var anchor = popup.firstChild;
    MODES.forEach(function(m){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn omModeItem'; b.setAttribute('data-mode', m.id);
      b.title = lbl(m);
      b.innerHTML = '<span class="omModeIc">' + m.ic + '</span><span class="btnLabel">' + lbl(m) + '</span>';
      b.addEventListener('click', function(e){ e.stopPropagation(); pick(m.id); });
      popup.insertBefore(b, anchor);
    });
    var sep = document.createElement('div');
    sep.className = 'omModeSep';
    popup.insertBefore(sep, anchor);
    var old = document.getElementById('omModeBtn');
    if(old) old.style.display = 'none';
    ta.addEventListener('input', function(){
      var v = ta.value;
      if(v === '@' || v === '@ '){ ta.value = ''; popup.classList.add('show'); }
    });
    ta.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && window.__omMode){ pick(null); }
      if(e.key === 'Backspace' && !ta.value && window.__omMode){ pick(null); }
    });
  }
  function pick(id){
    try{ popup.classList.remove('show'); }catch(e){ /* guard-ok: an absent optional popup needs no cleanup. */ }
    window.__omMode = id;
    var m = null; for(var i=0;i<MODES.length;i++){ if(MODES[i].id === id) m = MODES[i]; }
    if(!m){
      chipWrap.style.display = 'none'; chipWrap.innerHTML = '';
    } else {
      chipWrap.style.display = 'flex';
      chipWrap.innerHTML = '<span class="omModePill"><span class="omModeIc">' + m.ic + '</span>' +
        '<span>' + lbl(m) + '</span><button type="button" class="omModeX" aria-label="x">&times;</button></span>';
      var x = chipWrap.querySelector('.omModeX');
      if(x) x.addEventListener('click', function(){ pick(null); });
    }
    try{
      var w = document.getElementById('omranBtnWeb');
      if(w){
        var on = w.classList.contains('active') || w.getAttribute('aria-pressed') === 'true';
        if(id === 'web' && !on) w.click();
        else if(id !== 'web' && on) w.click();
      }
    }catch(e){ /* guard-ok: optional web-mode mirroring must not block mode selection. */ }
    try{ if(ta){ ta.focus(); } }catch(e){ /* guard-ok: focus restoration is best-effort. */ }
  }
  window.__omSetMode = pick;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
