/* v412 — يحوّل نافذة الفيديو إلى استوديو غني. الكمبيوتر عمودان والهاتف عمود واحد (v-vmk-mobile). */
(function(){
  var M=document.getElementById('videoMakerModal'); if(!M) return;
  var G=[['videoMakerMode','card'],['videoMakerStyle','pill'],['videoMakerDuration','pill'],['videoMakerRatio','pill']];
  var PTS={canvas:0,runway:60,hybrid:60,veo:400,actor:400};
  var ICO=/^([\u200d\ufe0f\u2190-\u21ff\u2300-\u27bf\ud800-\udfff]+)\s*/;
  function ar(){var h=document.documentElement;return (h.lang||'ar').indexOf('ar')===0||h.dir==='rtl';}
  function on(){return true;} /* v-vmk-mobile: نفس استوديو الكمبيوتر على الهاتف */
  function id(x){return document.getElementById(x);}
  function short(t){return t.replace(/\s*\([^)]*\)\s*$/,'').trim();}
  function build(){
    var card=M.firstElementChild; if(!card||card.dataset.vmk) return;
    /* v-trends-top (المالك: «لو تخلي الفيديو تحت والترندات فوق أفضل»): الوصف كان «الابن الثاني» للبطاقة — وحين تُبنى
       الترندات قبل الاستوديو (فتح النافذة من الصانع) يصير الابن الثاني صندوقَ الترندات فيُنقل إلى أسفل عمود المعاينة.
       الوصف يُعرف بوسمه، وصندوق الترندات يبقى في مكانه: تحت الرأس مباشرة وفوق الاستوديو كلّه. */
    var kids=[].slice.call(card.children), vt=id('vtRoot'), desc=card.querySelector('[data-i18n="videoMakerDesc"]');
    var side=document.createElement('div'); side.className='vmk-side';
    var main=document.createElement('div'); main.className='vmk-main';
    side.innerHTML='<div class="vmk-stage"><div class="vmk-ph">🎬</div><span class="vmk-dim"></span></div><div class="vmk-chips"></div>';
    card.classList.add('vmk-studio'); card.appendChild(side); card.appendChild(main);
    kids.slice(1).forEach(function(k){ if(k!==vt) main.appendChild(k); });
    var stage=side.querySelector('.vmk-stage');
    if(id('videoMakerResult')) stage.appendChild(id('videoMakerResult'));
    [id('videoMakerStatus'),id('videoMakerDownloadLink'),desc].forEach(function(e){ if(e) side.appendChild(e); });
    var st=id('videoMakerStyle'); if(st&&st.parentElement&&st.parentElement.parentElement) st.parentElement.parentElement.classList.add('vmk-row3');
    var det=document.createElement('details'); det.className='vmk-adv';
    det.innerHTML='<summary>⚙️ '+((typeof window.t==='function'&&window.t('videoAdvanced')!=='videoAdvanced')?window.t('videoAdvanced'):(ar()?'خيارات متقدمة':'Advanced options'))+'</summary>';
    var nt=id('videoMakerNarrationToggle');
    [nt&&nt.closest('label'),id('videoMakerNarrationRow'),id('videoMakerQualityRow')].forEach(function(e){ if(e) det.appendChild(e); });
    main.appendChild(det);
    var go=id('videoMakerGenerateBtn'); if(go) main.appendChild(go);
    /* v-vmk-ideas: شريحة مثال واحدة لكلّ وضع تحت الوصف (تتبدّل مع الوضع) تعبّئ الوصف بضغطة — بلا مساحة إضافيّة */
    var pe=id('videoMakerPrompt'), prow=pe&&pe.parentElement;
    if(prow&&!id('vmkIdeas')){
      var ib=document.createElement('div'); ib.id='vmkIdeas'; ib.className='vmk-ideas';
      ib.innerHTML='<span class="vmk-ideas-l"></span><button type="button" class="vmk-idea"></button>';
      prow.parentNode.insertBefore(ib,prow.nextSibling);
      ib.querySelector('button').addEventListener('click',function(){
        var tx=this.dataset.txt; if(!tx||!pe) return;
        pe.value=tx; pe.dispatchEvent(new Event('input',{bubbles:true})); pe.focus();
      });
    }
    /* v-video-write: مساعد الكتابة داخل الصانع — يكتب القصّة/الحوار/الإعلان مضبوطًا على مدّة الفيديو بلا مغادرة النافذة */
    var ib2=id('vmkIdeas');
    if(ib2&&!id('vmkWrite')){
      var wd=document.createElement('details'); wd.id='vmkWrite'; wd.className='vmk-ai';
      wd.innerHTML='<summary></summary><div class="vmk-ai-body"><p class="vmk-ai-s"></p><div class="vmk-ai-m"></div><div class="vmk-ai-g"></div><div class="vmk-ai-i"><input type="text" maxlength="400"><button type="button" class="vmk-ai-go"></button></div></div>';
      ib2.parentNode.insertBefore(wd,ib2.nextSibling);
      wireWrite(wd);
    }
    card.dataset.vmk='1';
  }
  function L(k){ var v=(typeof window.t==='function')?window.t(k):k; return v&&v!==k?v:''; }
  var SECS={'5':5,'8':8,'10':10,long20:20,film:45,adspot:5,reels:10};
  function wireWrite(wd){
    var m=wd.querySelector('.vmk-ai-m'), inp=wd.querySelector('input'), go=wd.querySelector('.vmk-ai-go'), busy=false;
    function bubble(cls,node){ var b=document.createElement('div'); b.className='vmk-ai-b'+cls; if(typeof node==='string') b.textContent=node; else b.appendChild(node); m.appendChild(b); m.scrollTop=m.scrollHeight; return b; }
    function put(el,val){ if(!el) return; el.value=val; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
    function act(label,fn){ var a=document.createElement('button'); a.type='button'; a.textContent=label; a.addEventListener('click',fn); return a; }
    function show(r){
      var box=document.createElement('div'), txt=document.createElement('div'); txt.className='vmk-ai-t';
      var parts=[]; if(r.scene) parts.push(r.scene);
      r.lines.forEach(function(l){ parts.push((l.who?l.who+': ':'')+l.text); });
      if(r.narration) parts.push(r.narration);
      if(r.onScreen) parts.push('['+r.onScreen+']');
      txt.textContent=parts.join('\n'); box.appendChild(txt);
      var ac=document.createElement('div'); ac.className='vmk-ai-a';
      var speech=(r.lines.length?r.lines.map(function(l){return l.text;}).join(' '):r.narration);
      if(r.scene) ac.appendChild(act(L('vwToScene'),function(){ put(id('videoMakerPrompt'),r.scene); }));
      if(r.narration||r.lines.length) ac.appendChild(act(L('vwToNarr'),function(){
        var tg=id('videoMakerNarrationToggle'); if(tg&&!tg.checked){ tg.checked=true; tg.dispatchEvent(new Event('change',{bubbles:true})); }
        put(id('videoMakerNarrationText'),speech); }));
      if(speech&&(id('videoMakerMode')||{}).value==='actor') ac.appendChild(act(L('vwToActor'),function(){ put(id('videoMakerActorSpeech'),speech.slice(0,300)); }));
      box.appendChild(ac); return box;
    }
    function send(){
      var q=inp.value.trim(); if(!q||busy) return;
      var dv=(id('videoMakerDuration')||{}).value||'8', kind=/إعلان|اعلان|\bad\b|advert/i.test(q)?'ad':/حوار|dialog/i.test(q)?'dialogue':'story';
      busy=true; go.disabled=true; inp.value=''; bubble(' u',q); var wait=bubble(' w',L('vwBusy'));
      var tk=(typeof authGet==='function')?(authGet('aiapp_auth_token')||''):'';
      fetch('/api/tools?action=video-write',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request:q,kind:kind,duration:dv,token:tk})})
        .then(function(r){return r.json();}).then(function(d){
          wait.remove();
          if(d&&d.result){ var b=bubble(' a',show(d.result)); var f=document.createElement('div'); f.className='vmk-ai-f'; f.textContent=L('vwFit').replace('{n}',String(d.seconds||SECS[dv]||8)).replace('{w}',String(d.words||'')); b.appendChild(f); }
          else bubble(' e',L(d&&d.reason==='limit'?'vwLimit':d&&d.reason==='auth'?'vwLogin':'vwErr'));
        }).catch(function(){ wait.remove(); bubble(' e',L('vwErr')); })
        .then(function(){ busy=false; go.disabled=false; });
    }
    go.addEventListener('click',send);
    inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); send(); } });
    wd.querySelector('.vmk-ai-g').addEventListener('click',function(e){ var c=e.target.closest('span'); if(c){ inp.value=c.dataset.t; inp.focus(); } });
  }
  function syncWrite(){
    var wd=id('vmkWrite'); if(!wd) return;
    wd.querySelector('summary').textContent=L('vwTitle'); wd.querySelector('.vmk-ai-s').textContent=L('vwSub');
    wd.querySelector('input').placeholder=L('vwPh'); wd.querySelector('.vmk-ai-go').textContent=L('vwSend');
    var g=wd.querySelector('.vmk-ai-g'); g.innerHTML='';
    ['vwSug1','vwSug2'].forEach(function(k){ var c=document.createElement('span'); c.textContent=L(k); c.dataset.t=L(k).replace(/…$/,' '); g.appendChild(c); });
  }
  function group(sel,kind){
    var g=sel.nextElementSibling;
    if(!g||!g.classList.contains('vmk-g')){
      g=document.createElement('div'); g.className='vmk-g '+(kind==='card'?'vmk-cards':'vmk-pills');
      sel.parentNode.insertBefore(g,sel.nextSibling); sel.classList.add('vmk-hidden');
    }
    g.innerHTML='';
    [].slice.call(sel.options).forEach(function(o){
      var t=(o.textContent||'').trim(), m=t.match(ICO), ic=m?m[1]:'', tx=short(t.slice(ic.length))||o.value;
      var el=document.createElement('div'); el.className=(kind==='card'?'vmk-card':'vmk-pill');
      el.setAttribute('role','radio'); el.dataset.v=o.value;
      if(kind==='card'){
        var p=PTS[o.value];
        el.innerHTML='<i></i><b></b><s></s>';
        el.querySelector('i').textContent=ic||'🎬';
        el.querySelector('b').textContent=tx;
        el.querySelector('s').textContent=(p==null?'':p?p+(ar()?' نقطة':' pts'):(ar()?'مجاني':'Free'));
      } else { el.textContent=(ic?ic+' ':'')+tx; }
      el.addEventListener('click',function(){
        if(sel.value===o.value) return;
        sel.value=o.value; sel.dispatchEvent(new Event('change')); sync();
      });
      g.appendChild(el);
    });
  }
  function sync(){
    var chips=M.querySelector('.vmk-chips'); if(chips) chips.innerHTML='';
    G.forEach(function(d){
      var s=id(d[0]); if(!s) return;
      var g=s.nextElementSibling;
      if(g&&g.classList.contains('vmk-g')) [].forEach.call(g.children,function(c){ c.setAttribute('aria-checked',String(c.dataset.v===s.value)); });
      var o=s.options[s.selectedIndex];
      if(chips&&o){
        var c=document.createElement('span'); c.className='vmk-chip'+(d[0]==='videoMakerMode'?' gold':'');
        var t=short(o.textContent||''); c.textContent=t.length>24?t.slice(0,24)+'…':t; chips.appendChild(c);
      }
    });
    var p=PTS[(id('videoMakerMode')||{}).value];
    if(chips&&p!=null){
      var b=document.createElement('span'); b.className='vmk-chip gold';
      b.textContent=p?('⚡ '+p+(ar()?' نقطة':' pts')):(ar()?'🎁 مجاني':'🎁 Free'); chips.appendChild(b);
    }
    syncWrite();
    var ib=id('vmkIdeas'), md=(id('videoMakerMode')||{}).value, tf=(typeof window.t==='function')?window.t:null;
    if(ib&&md){
      var k='videoIdea'+md.charAt(0).toUpperCase()+md.slice(1), tx=tf?tf(k):k, lb=tf?tf('videoIdeaLbl'):'';
      ib.style.display=(tx&&tx!==k)?'':'none';
      ib.firstChild.textContent=(lb&&lb!=='videoIdeaLbl')?lb:'';
      var bt=ib.querySelector('button'); bt.dataset.txt=tx; bt.textContent=tx;
    }
    var r=((id('videoMakerRatio')||{}).value||'1280:720').split(':'), stage=M.querySelector('.vmk-stage');
    if(stage){
      stage.style.setProperty('--vmk-ar',r[0]+'/'+r[1]);
      stage.style.maxWidth=(+r[0]<+r[1])?'238px':'';
      var dm=stage.querySelector('.vmk-dim'); if(dm) dm.textContent=r[0]+'×'+r[1];
    }
  }
  /* v-trends-top: أيًّا كان ترتيب البناء (الترندات قبل الاستوديو أو بعده)، الصندوق تحت الرأس وفوق الاستوديو في كلّ فتح */
  function trendsTop(){
    var card=M.firstElementChild, vt=id('vtRoot'), side=card&&card.querySelector('.vmk-side');
    if(!vt||!side||!card.classList.contains('vmk-studio')) return;
    card.classList.add('vmk-trends-top');
    if(vt.parentElement!==card||vt.nextElementSibling!==side) card.insertBefore(vt,side);
  }
  function enhance(){ if(!on()) return; build(); trendsTop(); G.forEach(function(d){ var s=id(d[0]); if(s) group(s,d[1]); }); sync(); }
  new MutationObserver(function(){ if(M.style.display&&M.style.display!=='none') enhance(); }).observe(M,{attributes:true,attributeFilter:['style']});
  G.forEach(function(d){ var s=id(d[0]); if(s) s.addEventListener('change',sync); });
})();
