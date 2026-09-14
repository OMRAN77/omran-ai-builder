/* 🎯 v594 — الأوضاع الصريحة داخل قائمة + : صورة · بحث · تفكير */
(function(){
  'use strict';
  if(window.__omModesReady) return; window.__omModesReady = true;
  var AR = (document.documentElement.getAttribute('lang') || 'ar').indexOf('ar') === 0;
  var MODES = [
    { id:'image', ar:'إنشاء صورة',      en:'Create image', ic:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>' },
    { id:'web',   ar:'البحث على الويب', en:'Web search',   ic:'🌐' },
    { id:'think', ar:'التفكير العميق',  en:'Think deeper', ic:'🧠' },
    /* v-bottom-bar (أمر عمران ١٤ سبتمبر «حط الوكيل وكودي وياهم»): الوكيل وClaude Code
       نُقلا من قائمة «+» إلى الشريط أسفل الصندوق مع مؤشّر النموذج (bottom:true) —
       للمالك وحده. الوكيل تبديل موكَّل لمفتاح النقاط القديم (btnPremiumToggle) فتبقى
       أسلاك النقاط والدخول والخصم كما هي؛ وClaude Code وضعٌ يُختار كبقيّة الأوضاع. */
    { id:'agent', ar:'الوكيل', en:'Agent', ic:'👑', agent:true, owner:true, bottom:true },
    { id:'cc',    ar:'Claude Code', en:'Claude Code', ic:'🧑‍💻', owner:true, bottom:true }
    /* v-model-chip: اختيار النموذج مؤشّر في الشريط نفسه (Sonnet/Opus) — انظر buildBottomBar. */
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
    try{ if(window.omModelChipSync) window.omModelChipSync(); }catch(e){ /* guard-ok */ }
  }
  function modelName(){ return curModel() === 'opus' ? 'Opus 5' : 'Sonnet 5'; }
  function isOwner(){ try{ return String((window.authGet && window.authGet('aiapp_username')) || '').trim().toLowerCase() === 'omran'; }catch(e){ return false; } }
  function refreshOwnerItems(){
    try{
      var on = isOwner();
      var items = document.querySelectorAll('.omModeItem[data-owner="1"]');
      for(var i = 0; i < items.length; i++) items[i].style.display = on ? '' : 'none';
      var bar = document.getElementById('omBottomBar');
      if(bar) bar.style.display = on ? 'flex' : 'none';
    }catch(e){ /* guard-ok: optional owner items */ }
  }
  /* v-bottom-bar: شريط أسفل الصندوق يجمع الوكيل + Claude Code + مؤشّر النموذج (نفس فكرة
     قائمة نماذج Claude Code التي أشار إليها المالك) — للمالك وحده، ظاهر دائمًا. */
  var CHIP_CSS = 'display:inline-flex; align-items:center; gap:5px; background:none; border:none; color:var(--muted,#9a958a); font-size:12px; font-weight:600; cursor:pointer; padding:3px 8px; border-radius:8px; line-height:1;';
  function buildBottomBar(){
    try{
      // المضيف = #inputbar (عمود مرن ظاهر دائمًا: ترحيب ومحادثة، حاسوب وجوّال) كي
      // لا يختفي الشريط أثناء المحادثة كما يحدث في #omranBelowComposer (ترحيب فقط).
      var host = document.getElementById('inputbar');
      if(!host || document.getElementById('omBottomBar')) return;
      // v-bottom-clean (أمر عمران «مع كلاود في مكان واحد… شيل صورة الكمبيوتر والولد، مااريد شي زياده»):
      // مجموعة واحدة متلاصقة بلا إيموجي — نصّ فقط.
      var bar = document.createElement('div');
      bar.id = 'omBottomBar';
      bar.style.cssText = 'align-self:flex-end; margin-top:-2px; display:' + (isOwner() ? 'inline-flex' : 'none') + '; align-items:center; gap:0; justify-content:flex-end;';

      // الوكيل — تبديل موكَّل لمفتاح النقاط القديم (لا منطق مال هنا)
      var agentBtn = document.createElement('button');
      agentBtn.id = 'omAgentChip'; agentBtn.type = 'button'; agentBtn.style.cssText = CHIP_CSS;
      agentBtn.innerHTML = '<span class="omAgentLbl"></span>';
      agentBtn.addEventListener('click', function(e){ e.stopPropagation(); var tg = document.getElementById('btnPremiumToggle'); if(tg) tg.click(); syncBar(); });

      // Claude Code — وضعٌ يُختار كبقيّة الأوضاع (pick)
      var ccBtn = document.createElement('button');
      ccBtn.id = 'omCcChip'; ccBtn.type = 'button'; ccBtn.style.cssText = CHIP_CSS;
      ccBtn.innerHTML = '<span>Claude Code</span>';
      ccBtn.addEventListener('click', function(e){ e.stopPropagation(); pick(window.__omMode === 'cc' ? null : 'cc'); syncBar(); });

      // ⌄ النموذج الشغّال + قائمة تبديله
      var wrap = document.createElement('div');
      wrap.id = 'omModelWrap';
      wrap.style.cssText = 'position:relative; display:inline-flex; align-items:center;';
      var chip = document.createElement('button');
      chip.id = 'omModelChip'; chip.type = 'button';
      chip.title = AR ? 'النموذج الشغّال — اضغط للتبديل' : 'Active model — tap to switch';
      chip.style.cssText = CHIP_CSS;
      chip.innerHTML = '<span class="omModelName"></span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      var pop = document.createElement('div');
      pop.id = 'omModelPopup';
      pop.style.cssText = 'display:none; position:absolute; bottom:calc(100% + 6px); inset-inline-end:0; z-index:2200; background:var(--panel,#161513); border:1px solid var(--border,rgba(255,255,255,.12)); border-radius:12px; box-shadow:0 12px 34px rgba(0,0,0,.5); padding:5px; min-width:150px;';
      var opts = [['opus','Opus 5'],['sonnet','Sonnet 5']];
      pop.innerHTML = opts.map(function(o){
        return '<button type="button" class="omModelOpt" data-m="' + o[0] + '" style="display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; background:none; border:none; color:var(--text,#eee); font-size:13px; text-align:start; padding:8px 10px; border-radius:8px; cursor:pointer;"><span>' + o[1] + '</span><span class="omModelTick" aria-hidden="true" style="opacity:0;">✓</span></button>';
      }).join('');
      wrap.appendChild(pop); wrap.appendChild(chip);

      bar.appendChild(agentBtn); bar.appendChild(ccBtn); bar.appendChild(wrap);
      host.appendChild(bar);

      var ACCENT = 'var(--accent,#f0c040)', MUTED = 'var(--muted,#9a958a)';
      function refreshModel(){
        var nm = wrap.querySelector('.omModelName'); if(nm) nm.textContent = modelName();
        var cur = curModel(); var os = pop.querySelectorAll('.omModelOpt');
        for(var i = 0; i < os.length; i++){
          var sel = os[i].getAttribute('data-m') === cur;
          var tick = os[i].querySelector('.omModelTick'); if(tick) tick.style.opacity = sel ? '1' : '0';
          os[i].style.background = sel ? 'var(--panel2,rgba(255,255,255,.07))' : 'none';
        }
      }
      function syncBar(){
        try{
          var al = agentBtn.querySelector('.omAgentLbl');
          var aon = window.__agentModeOn === true;
          if(al) al.textContent = (AR ? 'الوكيل' : 'Agent') + (aon ? ' ✓' : '');
          agentBtn.style.color = aon ? ACCENT : MUTED;
          ccBtn.style.color = (window.__omMode === 'cc') ? ACCENT : MUTED;
        }catch(e){ /* guard-ok: تحديث تجميليّ */ }
        refreshModel();
      }
      chip.addEventListener('click', function(e){ e.stopPropagation(); pop.style.display = (pop.style.display === 'none') ? 'block' : 'none'; refreshModel(); });
      pop.addEventListener('click', function(e){ var b = e.target.closest('.omModelOpt'); if(!b) return; e.stopPropagation(); setModel(b.getAttribute('data-m')); refreshModel(); pop.style.display = 'none'; });
      document.addEventListener('click', function(){ try{ pop.style.display = 'none'; }catch(e){ /* guard-ok */ } });
      window.omModelChipSync = refreshModel;
      window.omBottomSync = syncBar;
      syncBar();
    }catch(e){ /* guard-ok: الشريط السفليّ تحسينيّ */ }
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
      if(m.bottom) return; // الوكيل وClaude Code في الشريط السفليّ لا في قائمة «+»
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn omModeItem'; b.setAttribute('data-mode', m.id);
      b.title = lbl(m);
      if(MODE_KEYS[m.id]) b.setAttribute('data-i18n-title', MODE_KEYS[m.id]);
      b.innerHTML = '<span class="omModeIc">' + m.ic + '</span><span class="btnLabel"' + (MODE_KEYS[m.id] ? ' data-i18n="' + MODE_KEYS[m.id] + '"' : '') + '>' + lbl(m) + '</span>';
      if(m.owner){ b.setAttribute('data-owner', '1'); b.style.display = isOwner() ? '' : 'none'; }
      b.addEventListener('click', function(e){ e.stopPropagation(); pick(m.id); });
      popup.insertBefore(b, anchor);
    });
    /* الدخول قد يتمّ بعد التحميل — نعيد فحص المالك والشريط عند كلّ فتح للقائمة. */
    try{ if(window.MutationObserver) new MutationObserver(function(){ refreshOwnerItems(); try{ if(window.omBottomSync) window.omBottomSync(); }catch(e){ /* guard-ok */ } }).observe(popup, { attributes: true, attributeFilter: ['class'] }); }catch(e){ /* guard-ok */ }
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
    buildBottomBar();
    /* الدخول قد يتمّ بعد بناء الصندوق — نعيد فحص المالك مرّاتٍ قصيرة وعند عودة التركيز
       كي يظهر الشريط والبنود الخاصّة بلا انتظار فتح قائمة «+». */
    [500, 1500, 3500, 7000].forEach(function(ms){ setTimeout(refreshOwnerItems, ms); });
    try{ window.addEventListener('focus', refreshOwnerItems); }catch(e){ /* guard-ok */ }
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
    try{ if(window.omBottomSync) window.omBottomSync(); }catch(e){ /* guard-ok: تحديث تجميليّ للشريط */ }
  }
  window.__omSetMode = pick;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
