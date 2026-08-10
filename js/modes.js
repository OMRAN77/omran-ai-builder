/* 🎯 v527 — الأوضاع الصريحة داخل قائمة + : صورة · بحث · تفكير · تعلّم */
(function(){
  'use strict';
  if(window.__omModesReady) return; window.__omModesReady = true;
  var AR = (document.documentElement.getAttribute('lang') || 'ar').indexOf('ar') === 0;
  var MODES = [
    { id:'image', ar:'إنشاء صورة',      en:'Create image', ic:'🎨' },
    { id:'web',   ar:'البحث على الويب', en:'Web search',   ic:'🌐' },
    { id:'think', ar:'التفكير العميق',  en:'Think deeper', ic:'🧠' },
    { id:'learn', ar:'تعلّم',            en:'Learn',        ic:'📚' }
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
