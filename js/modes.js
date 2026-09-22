/* 🎯 v594 — الأوضاع الصريحة داخل قائمة + : صورة · بحث · تفكير */
(function(){
  'use strict';
  if(window.__omModesReady) return; window.__omModesReady = true;
  var AR = (document.documentElement.getAttribute('lang') || 'ar').indexOf('ar') === 0;
  var MODES = [
    { id:'image', ar:'إنشاء صورة',      en:'Create image', ic:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>' },
    { id:'web',   ar:'البحث على الويب', en:'Web search',   ic:'🌐' },
    { id:'think', ar:'التفكير العميق',  en:'Think deeper', ic:'🧠' },
    /* v-image-modes (أمر عمران «نانو/GPT في +، ولي أنا وحدي»): خيارات محرّك الصورة للمالك
       وحده أوّلًا — بالوظيفة لا بالاسم للعامّة لاحقًا. كلّها توليد جديد (لا مرفق):
       نصّ دقيق → مسار GPT الوفيّ، 4K → جودة أعلى، ونانو/GPT خام يفرضان المحرّك للمقارنة. */
    /* v-mode-icons: أيقونات SVG خطّيّة (لا إيموجي — الإيموجي لا يصمد في omModeIc
       فتبقى الأيقونة فارغة وتختلّ المحاذاة). تُطابق أسلوب أيقونة «إنشاء صورة». */
    { id:'image_text', ar:'صورة بنصّ دقيق', en:'Image · exact text', ic:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>', owner:true },
    { id:'image_hd',   ar:'صورة 4K',        en:'Image · 4K',         ic:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>', owner:true },
    { id:'image_nano', ar:'محرّك نانو (خام)', en:'Nano engine (raw)', ic:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>', owner:true },
    { id:'image_gpt',  ar:'محرّك GPT (خام)',  en:'GPT engine (raw)',  ic:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>', owner:true },
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
      // v-one-arrow (أمر عمران «الكل في سهم واحد»): زرّ واحد بسهم يفتح قائمة واحدة فيها
      // الوكيل + Claude Code + النموذج (Opus/Sonnet) — بلا شرائح متفرّقة ولا إيموجي.
      var bar = document.createElement('div');
      bar.id = 'omBottomBar';
      bar.style.cssText = 'align-self:flex-end; margin-top:-2px; display:' + (isOwner() ? 'inline-flex' : 'none') + '; align-items:center; justify-content:flex-end;';

      var wrap = document.createElement('div');
      wrap.id = 'omModelWrap';
      wrap.style.cssText = 'position:relative; display:inline-flex; align-items:center;';
      var chip = document.createElement('button');
      chip.id = 'omModelChip'; chip.type = 'button';
      chip.title = AR ? 'المزوّد والنموذج' : 'Provider & model';
      chip.style.cssText = CHIP_CSS;
      chip.innerHTML = '<span class="omModelName"></span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      var pop = document.createElement('div');
      pop.id = 'omModelPopup';
      pop.style.cssText = 'display:none; position:absolute; bottom:calc(100% + 6px); inset-inline-end:0; z-index:2200; max-height:70vh; overflow-y:auto; background:var(--panel,#161513); border:1px solid var(--border,rgba(255,255,255,.12)); border-radius:12px; box-shadow:0 12px 34px rgba(0,0,0,.5); padding:5px; min-width:210px;';
      function agentLabel(){ try{ if(typeof t === 'function'){ var v = t('premiumToggleLabel'); if(v && v !== 'premiumToggleLabel') return v; } }catch(e){ /* i18n لم يجهز — الاحتياط */ } return AR ? 'الوكيل' : 'Agent'; }

      /* v-provider-arrow (أمر عمران «كل المزودين ٩، كل شركة تفتح موديلاتها»): قائمة
         متداخلة للمالك وحده — كلّ مزوّد يفتح موديلاته، والاختيار يضبط aiapp_provider +
         مفتاح موديل المزوّد (عبر omranPickProviderModel). المعرّفات من إعدادات التطبيق نفسها. */
      var PROVS = [
        { key:'claude',     name:(AR?'كلود':'Claude'),      store:'aiapp_claude_model',     def:'claude-sonnet-5',     models:[['claude-opus-5','Opus 5'],['claude-sonnet-5','Sonnet 5'],['claude-haiku-4-5','Haiku 4.5'],['claude-fable-5-1','Fable 5.1']] },
        /* v-provider-models (أمر المالك ٢٢ سبتمبر «كلّ واحد وموديله بالضبط»): المعرّفات هنا معرّفات OpenRouter كما
           يستعملها الخادم (OR_MODELS في chat.js) — الافتراضيّ الواحد ثابت، والباقي يأتي حيًّا من /api/ai?action=models.
           الأسماء القديمة (Astra/Sol/Luna…) كانت عرضًا لا يصل الخادم فأُزيلت. */
        { key:'openai',     name:'OpenAI · GPT',             or:true, store:'aiapp_model',            def:'openai/gpt-5.6-terra',        models:[['openai/gpt-5.6-terra','GPT-5.6 Terra']] },
        { key:'gemini',     name:(AR?'جوجل جيميني':'Google Gemini'), or:true, store:'aiapp_gemini_model', def:'google/gemini-3.5-flash', models:[['google/gemini-3.5-flash','Gemini 3.5 Flash']] },
        { key:'groq',       name:'Groq',                     or:true, store:'aiapp_groq_model',       def:'meta-llama/llama-4-maverick', models:[['meta-llama/llama-4-maverick','Llama 4 Maverick']] },
        { key:'mistral',    name:'Mistral',                  or:true, store:'aiapp_mistral_model',    def:'mistralai/mistral-medium-3-5', models:[['mistralai/mistral-medium-3-5','Mistral Medium 3.5']] },
        { key:'deepseek',   name:'DeepSeek',                 or:true, store:'aiapp_deepseek_model',   def:'deepseek/deepseek-v3.2',      models:[['deepseek/deepseek-v3.2','DeepSeek V3.2']] },
        { key:'cohere',     name:'Cohere',                   or:true, store:'aiapp_cohere_model',     def:'cohere/command-a',            models:[['cohere/command-a','Command A']] },
        { key:'perplexity', name:'Perplexity',               store:'aiapp_perplexity_model', def:'sonar',               models:[['sonar','Sonar'],['sonar-pro','Sonar Pro'],['sonar-reasoning-pro','Sonar Reasoning']] },
        { key:'openrouter', name:'OpenRouter',               store:'aiapp_openrouter_model', def:'anthropic/claude-sonnet-5', models:[['anthropic/claude-opus-5','Claude Opus 5'],['anthropic/claude-sonnet-5','Claude Sonnet 5'],['openai/gpt-5.6-terra','GPT-5.6 Terra'],['google/gemini-3.5-flash','Gemini 3.5 Flash'],['deepseek/deepseek-v3.2','DeepSeek V3.2'],['mistralai/mistral-medium-3-5','Mistral Medium 3.5'],['meta-llama/llama-4-maverick','Llama 4 Maverick']] }
      ];
      function curProv(){ try{ return localStorage.getItem('aiapp_provider') || 'openai'; }catch(e){ return 'openai'; } }
      function provOf(k){ for(var i=0;i<PROVS.length;i++) if(PROVS[i].key===k) return PROVS[i]; return null; }
      function curModelId(pv){ try{ var v = localStorage.getItem(pv.store) || ''; if(pv.or && v && v.indexOf('/') === -1) v = ''; /* v-provider-models: معرّف قديم بلا بادئة = الافتراضيّ */ return v || pv.def; }catch(e){ return pv.def; } }
      /* v-provider-models: العميل يرسل الموديل المختار لكلّ مزوّد على وسيط OpenRouter (كلود له claudeModelGet). */
      window.omranModelFor = function(k){ try{ var pv = provOf(k); return (pv && pv.or) ? curModelId(pv) : ''; }catch(e){ return ''; } };
      function curProvModelLabel(){ var pv=provOf(curProv()); if(!pv) return curProv(); var mid=curModelId(pv); for(var i=0;i<pv.models.length;i++) if(pv.models[i][0]===mid) return pv.models[i][1]; return pv.name; }

      var ROW = 'display:block; width:100%; background:none; border:none; color:var(--text,#eee); font-size:13px; font-weight:600; text-align:start; padding:9px 12px; border-radius:8px; cursor:pointer;';
      function optRow(act, label, key){ var a = key ? ' data-i18n="' + key + '"' : ''; return '<button type="button" class="omModelOpt" data-act="' + act + '" style="' + ROW + '"><span' + a + '>' + label + '</span></button>'; }
      var divider = '<div style="height:1px; margin:5px 6px; background:var(--border,rgba(255,255,255,.12));"></div>';
      function provsHTML(){
        var out = '';
        for(var i=0;i<PROVS.length;i++){ var p = PROVS[i];
          out += '<button type="button" class="omProvHead" data-prov="' + p.key + '" style="' + ROW + ' display:flex; align-items:center; justify-content:space-between; gap:8px;"><span>' + p.name + '</span><span class="omProvChev" style="color:var(--muted,#9a958a); font-size:11px;">▸</span></button>';
          out += '<div class="omProvModels" data-for="' + p.key + '" hidden style="padding-inline-start:10px;">';
          for(var j=0;j<p.models.length;j++){ out += '<button type="button" class="omProvModel" data-prov="' + p.key + '" data-store="' + p.store + '" data-model="' + p.models[j][0] + '" style="' + ROW + ' font-weight:500; opacity:.9;">' + p.models[j][1] + '</button>'; }
          out += '</div>';
        }
        return out;
      }
      /* v-cc-remove (طلب المالك «شيله عشان ما يلخبط»): أُزيل زرّ «Claude Code» المربوط
         بجسر Railway المكسور — الوكيل يملك صلاحيات Claude Code الكاملة عبر GitHub Actions. */
      function renderPop(){ pop.innerHTML = optRow('agent', agentLabel(), 'premiumToggleLabel') + divider + provsHTML(); }
      renderPop();
      /* v-provider-models: القائمة الحيّة من الخادم (OpenRouter — الأحدث ثمانية لكلّ مزوّد) تُلحق بالافتراضيّ الثابت. */
      if(isOwner()){
        try{
          fetch('/api/ai?action=models', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ token: (window.authGet && window.authGet('aiapp_auth_token')) || '' }) })
            .then(function(r){ return r.ok ? r.json() : null; })
            .then(function(d){
              if(!d || !d.models) return;
              var changed = false;
              for(var i=0;i<PROVS.length;i++){ var p = PROVS[i]; var L = d.models[p.key];
                if(!p.or || !L || !L.length) continue;
                var has = false; for(var j=0;j<L.length;j++){ if(L[j][0] === p.def) has = true; }
                p.models = (has ? [] : [[p.def, p.models[0][1]]]).concat(L); changed = true;
              }
              if(changed){ renderPop(); refresh(); }
            }).catch(function(){ /* guard-ok: القائمة الحيّة تحسينيّة — الافتراضيّ الثابت يبقى */ });
        }catch(e){ /* guard-ok */ }
      }
      wrap.appendChild(pop); wrap.appendChild(chip);
      bar.appendChild(wrap);
      // v-model-under-send (طلب المالك): الشريط تحت صندوق الكتابة مباشرة (جهة زرّ الإرسال)
      // لا أسفل كلّ شيء — نضعه بعد صفّ الملحّن مباشرةً كي يتبع الصندوق.
      var __row = document.getElementById('composerRow');
      if(__row && __row.parentNode === host && __row.nextSibling){ host.insertBefore(bar, __row.nextSibling); }
      else { host.appendChild(bar); }

      var ACCENT = 'var(--accent,#f0c040)', INK = 'var(--text,#eee)';
      function refresh(){
        var nm = wrap.querySelector('.omModelName');
        if(nm) nm.textContent = (window.__omMode === 'cc') ? 'Claude Code' : (window.__agentModeOn === true) ? agentLabel() : curProvModelLabel();
        try{
          var pk = curProv(); var pv = provOf(pk); var mid = pv ? curModelId(pv) : '';
          var heads = pop.querySelectorAll('.omProvHead'); for(var i=0;i<heads.length;i++){ heads[i].style.color = (heads[i].getAttribute('data-prov') === pk) ? ACCENT : INK; }
          var ms = pop.querySelectorAll('.omProvModel'); for(i=0;i<ms.length;i++){ var on = ms[i].getAttribute('data-prov') === pk && ms[i].getAttribute('data-model') === mid; ms[i].style.color = on ? ACCENT : INK; }
        }catch(e){ /* guard-ok */ }
      }
      function setAgent(on){ if((window.__agentModeOn === true) !== on){ var tg = document.getElementById('btnPremiumToggle'); if(tg) tg.click(); } }
      function collapseAll(){ var g = pop.querySelectorAll('.omProvModels'); for(var i=0;i<g.length;i++) g[i].hidden = true; var c = pop.querySelectorAll('.omProvChev'); for(i=0;i<c.length;i++) c[i].textContent = '▸'; }

      chip.addEventListener('click', function(e){ e.stopPropagation(); var showing = pop.style.display !== 'none'; pop.style.display = showing ? 'none' : 'block'; if(!showing){ collapseAll(); refresh(); } });
      pop.addEventListener('click', function(e){
        var mo = e.target.closest('.omModelOpt');
        if(mo){ e.stopPropagation(); var act = mo.getAttribute('data-act');
          if(act === 'agent'){ var willOn = !(window.__agentModeOn === true); if(willOn && window.__omMode === 'cc') pick(null); setAgent(willOn); }
          else if(act === 'cc'){ if(window.__omMode === 'cc') pick(null); else { setAgent(false); pick('cc'); } }
          refresh(); pop.style.display = 'none'; return;
        }
        var head = e.target.closest('.omProvHead');
        if(head){ e.stopPropagation(); var key = head.getAttribute('data-prov'); var box = pop.querySelector('.omProvModels[data-for="' + key + '"]'); var open = box && !box.hidden; collapseAll(); if(box){ box.hidden = open; head.querySelector('.omProvChev').textContent = open ? '▸' : '▾'; } return; }
        var pm = e.target.closest('.omProvModel');
        if(pm){ e.stopPropagation();
          var prov = pm.getAttribute('data-prov'), store = pm.getAttribute('data-store'), model = pm.getAttribute('data-model');
          setAgent(false); if(window.__omMode === 'cc') pick(null);
          // موديل الوكيل يُزامَن مع Opus/Sonnet فقط (الوكيل يدعمهما)؛ Haiku/Fable موديلا محادثة.
          if(prov === 'claude'){ if(model === 'claude-opus-5') setModel('opus'); else if(model === 'claude-sonnet-5') setModel('sonnet'); }
          try{ if(window.omranPickProviderModel) window.omranPickProviderModel(prov, store, model); }catch(e2){ /* guard-ok */ }
          try{ if(prov === 'claude' && window.claudeModelSync) window.claudeModelSync(); }catch(e3){ /* guard-ok */ }
          refresh(); pop.style.display = 'none'; return;
        }
      });
      document.addEventListener('click', function(){ try{ pop.style.display = 'none'; }catch(e){ /* guard-ok */ } });
      window.omModelChipSync = refresh;
      window.omBottomSync = refresh;
      refresh();
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
    /* v-cc-nopill (أمر عمران «مااريد كودي يطلع هذا المكان، الصفحة نظيفة»): وضع
       Claude Code يشتغل من قائمة السهم فقط — بلا فقاعة داخل صندوق الكتابة؛
       القائمة تُبيّن أنّه مفعّل (تلوين البند)، والتبديل منها. */
    if(!m || m.id === 'cc'){
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
