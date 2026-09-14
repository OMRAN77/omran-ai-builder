/* 🎯 v594 — الأوضاع الصريحة داخل قائمة + : صورة · بحث · تفكير */
(function(){
  'use strict';
  if(window.__omModesReady) return; window.__omModesReady = true;
  var AR = (document.documentElement.getAttribute('lang') || 'ar').indexOf('ar') === 0;
  var MODES = [
    { id:'image', ar:'إنشاء صورة',      en:'Create image', ic:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>' },
    { id:'web',   ar:'البحث على الويب', en:'Web search',   ic:'🌐' },
    { id:'think', ar:'التفكير العميق',  en:'Think deeper', ic:'🧠' },
    /* v-models-two (أمر عمران ١٤ سبتمبر «هذيل ٣ فقط»): الوكيل من قائمة «+» أيضًا.
       ليس وضعًا بل تبديل موكَّل لمفتاح الوكيل القديم (btnPremiumToggle) فتبقى كلّ
       أسلاك النقاط والدخول والخصم كما هي بلا تكرار. */
    { id:'agent', ar:'الوكيل', en:'Agent', ic:'👑', agent:true },
    /* v-cc-chat (أمر عمران ١٤ سبتمبر «الي أريده في المحادثة»): Claude Code الخام على خادم
       المالك من الصندوق نفسه — البند يظهر لحساب المالك وحده (الخادم يتحقّق بالتوقيع). */
    { id:'cc',    ar:'Claude Code',      en:'Claude Code',  ic:'🧑‍💻', owner:true },
    /* v-models-two (أمر عمران): مبدّل النموذج Sonnet⇄Opus من قائمة «+» — للمالك
       وحده، يخدم المحادثة والوكيل معًا. ليس وضعًا، بل تبديل يُحفظ محلّيًّا. */
    { id:'__model', ar:'النموذج', en:'Model', ic:'⚙️', owner:true, model:true }
  ];
  window.__omMode = null;
  /* aiapp_claude_model يستعمل المعرّف الكامل (claude-opus-5)، وaiapp_agent_model
     يستعمل المفتاح القصير (opus-5) — نضبط الاثنين معًا. */
  function curModel(){ try{ return (localStorage.getItem('aiapp_claude_model') === 'claude-opus-5') ? 'opus' : 'sonnet'; }catch(e){ return 'sonnet'; } }
  function setModel(which){
    try{
      if(which === 'opus'){ localStorage.setItem('aiapp_claude_model','claude-opus-5'); localStorage.setItem('aiapp_agent_model','opus-5'); }
      else { localStorage.setItem('aiapp_claude_model','claude-sonnet-5'); localStorage.setItem('aiapp_agent_model','sonnet-5'); }
    }catch(e){ /* guard-ok: التخزين المحلّيّ قد يكون مقفلًا */ }
    try{ if(window.claudeModelSync) window.claudeModelSync(); }catch(e){ /* guard-ok */ }
  }
  function modelLabel(){ return (AR ? 'النموذج: ' : 'Model: ') + (curModel() === 'opus' ? 'Opus 5' : 'Sonnet 5'); }
  /* الوكيل: تبديل موكَّل لمفتاح النقاط القديم — لا منطق مال هنا. */
  function agentOn(){ return window.__agentModeOn === true; }
  function syncAgentItem(b){
    try{
      var l = b.querySelector('.btnLabel'); if(l) l.textContent = (AR ? 'الوكيل' : 'Agent') + (agentOn() ? ' ✓' : '');
      b.classList.toggle('omModeOn', agentOn());
    }catch(e){ /* guard-ok: تحديث تجميليّ */ }
  }
  function syncAgentItems(){ try{ var it = document.querySelectorAll('.omModeItem[data-mode="agent"]'); for(var i=0;i<it.length;i++) syncAgentItem(it[i]); }catch(e){ /* guard-ok */ } }
  function isOwner(){ try{ return String((window.authGet && window.authGet('aiapp_username')) || '').trim().toLowerCase() === 'omran'; }catch(e){ return false; } }
  function refreshOwnerItems(){
    try{
      var on = isOwner();
      var items = document.querySelectorAll('.omModeItem[data-owner="1"]');
      for(var i = 0; i < items.length; i++) items[i].style.display = on ? '' : 'none';
    }catch(e){ /* guard-ok: optional owner items */ }
  }
  var chipWrap, popup, ta;
  /* v-modes-i18n (شكوى المالك ٢٩ أغسطس): البنود كانت تُبنى مرة واحدة بلغة
     لحظة التحميل (عربي غالبًا) ولا تتبدل مع اللغة — الآن مفاتيح ترجمة
     تُقرأ حيًّا وتُوسم data-i18n فيعيد مبدّل اللغة ترجمتها. */
  var MODE_KEYS = { image:'modeCreateImage', web:'modeWebSearch', think:'modeThinkDeeper' };
  function lbl(m){
    try{
      if(MODE_KEYS[m.id] && typeof t === 'function'){ var v = t(MODE_KEYS[m.id]); if(v && v !== MODE_KEYS[m.id]) return v; }
    }catch(e){ /* i18n لم يجهز بعد — الاحتياط أدناه */ }
    return AR ? m.ar : m.en;
  }
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
      if(MODE_KEYS[m.id]) b.setAttribute('data-i18n-title', MODE_KEYS[m.id]);
      b.innerHTML = '<span class="omModeIc">' + m.ic + '</span><span class="btnLabel"' + (MODE_KEYS[m.id] ? ' data-i18n="' + MODE_KEYS[m.id] + '"' : '') + '>' + lbl(m) + '</span>';
      if(m.owner){ b.setAttribute('data-owner', '1'); b.style.display = isOwner() ? '' : 'none'; }
      if(m.model){
        var __lb = b.querySelector('.btnLabel'); if(__lb) __lb.textContent = modelLabel();
        b.addEventListener('click', function(e){ e.stopPropagation(); setModel(curModel() === 'opus' ? 'sonnet' : 'opus'); var __l2 = b.querySelector('.btnLabel'); if(__l2) __l2.textContent = modelLabel(); });
      } else if(m.agent){
        syncAgentItem(b);
        b.addEventListener('click', function(e){ e.stopPropagation(); var tg = document.getElementById('btnPremiumToggle'); if(tg) tg.click(); syncAgentItem(b); });
      } else {
        b.addEventListener('click', function(e){ e.stopPropagation(); pick(m.id); });
      }
      popup.insertBefore(b, anchor);
    });
    /* البند الخاصّ بالمالك يُعاد فحصه عند كلّ فتح للقائمة: الدخول قد يتمّ بعد التحميل. */
    try{ if(window.MutationObserver) new MutationObserver(function(){ refreshOwnerItems(); syncAgentItems(); }).observe(popup, { attributes: true, attributeFilter: ['class'] }); }catch(e){ /* guard-ok */ }
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
