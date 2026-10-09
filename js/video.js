/* v412 — يحوّل نافذة الفيديو إلى استوديو غني. الكمبيوتر عمودان والهاتف عمود واحد (v-vmk-mobile). */
(function(){
  var M=document.getElementById('videoMakerModal'); if(!M) return;
  var G=[['videoMakerMode','card'],['videoMakerStyle','pill'],['videoMakerDuration','pill'],['videoMakerRatio','pill']];
  var PTS={canvas:0,runway:60,hybrid:60,veo:400,actor:400};
  var ICO=/^([\u200d\ufe0f\u2190-\u21ff\u2300-\u27bf\ud800-\udfff]+)\s*/;
  function ar(){var h=document.documentElement;return (h.lang||'ar').indexOf('ar')===0||h.dir==='rtl';}
  function on(){return true;} /* v-vmk-mobile: نفس استوديو الكمبيوتر على الهاتف */
  function id(x){return document.getElementById(x);}
  /* v-vmk-clean (المالك: «شيل الأيقونات… اسم رسميّ بلا إيموجي»): تنظيف نصوص النافذة من الإيموجي عند العرض بدل تعديل ١٤ قاموسًا */
  var EMO=/\u200D(?=\p{Extended_Pictographic})|(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u20E3/gu;
  function noEmoji(x){ return String(x==null?'':x).replace(EMO,'').replace(/\s{2,}/g,' ').trim(); }
  function scrub(){
    var w=document.createTreeWalker(M,NodeFilter.SHOW_TEXT,null), n, list=[];
    while((n=w.nextNode())){
      var pe=n.parentElement; if(!pe||/^(SCRIPT|STYLE|TEXTAREA)$/.test(pe.tagName)) continue;
      if(pe.closest('.mini-mic-btn,#videoMakerResult,#videoMakerStatus')) continue;
      if(EMO.test(n.nodeValue)){ EMO.lastIndex=0; list.push(n); } EMO.lastIndex=0;
    }
    list.forEach(function(t){ var v=noEmoji(t.nodeValue); if(v||!t.nodeValue.trim()) t.nodeValue=v; });
  }
  function short(t){return t.replace(/\s*\([^)]*\)\s*$/,'').trim();}
  function build(){
    var card=M.firstElementChild; if(!card||card.dataset.vmk) return;
    /* v-trends-top (المالك: «لو تخلي الفيديو تحت والترندات فوق أفضل»): الوصف كان «الابن الثاني» للبطاقة — وحين تُبنى
       الترندات قبل الاستوديو (فتح النافذة من الصانع) يصير الابن الثاني صندوقَ الترندات فيُنقل إلى أسفل عمود المعاينة.
       الوصف يُعرف بوسمه، وصندوق الترندات يبقى في مكانه: تحت الرأس مباشرة وفوق الاستوديو كلّه. */
    var kids=[].slice.call(card.children), vt=id('vtRoot'), desc=card.querySelector('[data-i18n="videoMakerDesc"]');
    var side=document.createElement('div'); side.className='vmk-side';
    var main=document.createElement('div'); main.className='vmk-main';
    side.innerHTML='<div class="vmk-stage"><div class="vmk-ph"></div><span class="vmk-dim"></span></div><div class="vmk-chips"></div>';
    card.classList.add('vmk-studio'); card.appendChild(side); card.appendChild(main);
    kids.slice(1).forEach(function(k){ if(k!==vt) main.appendChild(k); });
    var stage=side.querySelector('.vmk-stage');
    if(id('videoMakerResult')) stage.appendChild(id('videoMakerResult'));
    [id('videoMakerStatus'),id('videoMakerDownloadLink'),desc].forEach(function(e){ if(e) side.appendChild(e); });
    var st=id('videoMakerStyle'); if(st&&st.parentElement&&st.parentElement.parentElement) st.parentElement.parentElement.classList.add('vmk-row3');
    var det=document.createElement('details'); det.className='vmk-adv';
    det.innerHTML='<summary>'+((typeof window.t==='function'&&window.t('videoAdvanced')!=='videoAdvanced')?window.t('videoAdvanced'):(ar()?'خيارات متقدمة':'Advanced options'))+'</summary>';
    var nt=id('videoMakerNarrationToggle');
    [nt&&nt.closest('label'),id('videoMakerNarrationRow'),id('videoMakerQualityRow')].forEach(function(e){ if(e) det.appendChild(e); });
    main.appendChild(det);
    var go=id('videoMakerGenerateBtn'); if(go) main.appendChild(go);
    /* v-vmk-sections: كلّ وضع قسمٌ بنماذجه الثلاثة، ثمّ مساعد الكتابة، ثمّ الشخصيّات — تحت الوصف مباشرة */
    var pe=id('videoMakerPrompt'), prow=pe&&pe.parentElement;
    if(prow&&!id('vmkWrite')){
      var wd=document.createElement('details'); wd.id='vmkWrite'; wd.className='vmk-ai'; wd.open=true;
      wd.innerHTML='<summary></summary><div class="vmk-ai-body"><p class="vmk-ai-s"></p><div class="vmk-ai-m"></div><div class="vmk-ai-g"></div><div class="vmk-ai-i"><input type="text" maxlength="400"><button type="button" class="vmk-ai-go"></button></div></div>';
      prow.parentNode.insertBefore(wd,prow.nextSibling);
      wireWrite(wd);
      var cd=document.createElement('details'); cd.id='vmkChars'; cd.className='vmk-ai vmk-chars';
      cd.innerHTML='<summary></summary><div class="vmk-ai-body"><p class="vmk-ai-s"></p><div class="vmk-cl"></div><button type="button" class="vmk-ch-add"></button></div>';
      wd.parentNode.insertBefore(cd,wd.nextSibling);
      cd.querySelector('.vmk-ch-add').addEventListener('click',function(){ if(chars.length<MAXCH){ chars.push({name:'',voice:'male',line:''}); renderChars(); } });
      var sm=document.createElement('div'); sm.id='vmkSamples'; sm.className='vmk-samples';
      main.insertBefore(sm,main.firstChild);
      var gb=id('videoMakerGenerateBtn'); if(gb) gb.addEventListener('click',compose,true);
    }
    card.dataset.vmk='1';
  }
  /* ═══ v-vmk-sections: شريط الأقسام (الترندات + الأوضاع) ═══ */
  var TABS=['trend','canvas','runway','minimax','omni','hybrid','veo','actor'];
  var tab='trend';
  /* ملفّات النماذج الجاهزة: '<الوضع>-<١..٣>': true حين يُرفع /media/samples/<الوضع>-<رقم>.mp4 — بلا ملفّ تظهر البطاقة بنصّ المثال فقط */
  var VIDEOS={};
  /* فيديو تعليميّ حقيقيّ مسجَّل من شاشة الصانع نفسه (scripts/video-tutorial.mjs) — عربيّ، والباقي بالإنجليزيّة */
  /* قائمة النماذج المولَّدة (scripts/video-samples.mjs يكتبها): {"omni-1":true,…} — بلا قائمة لا فيديو وتبقى البطاقة نصًّا */
  var manifestAsked=false;
  function loadManifest(){
    if(manifestAsked) return; manifestAsked=true;
    fetch('/media/samples/index.json',{cache:'no-cache'}).then(function(r){ return r.ok?r.json():{}; }).then(function(j){
      if(j&&typeof j==='object'&&Object.keys(j).length){ VIDEOS=j; sync(); }
    }).catch(function(){ /* guard-ok — لا قائمة = لا فيديوهات نماذج */ });
  }
  function tutUrl(){ return '/media/samples/tutorial-'+(ar()?'ar':'en')+'.mp4'; }
  function openPlayer(src){
    var lb=document.createElement('div'); lb.className='vmk-lb';
    var vd=document.createElement('video'); vd.src=src; vd.controls=true; vd.autoplay=true; vd.playsInline=true;
    var x=document.createElement('button'); x.type='button'; x.className='vmk-lb-x'; x.textContent='×'; x.setAttribute('aria-label',L('vcRemove'));
    function close(){ try{ vd.pause(); }catch(e){ /* guard-ok — العنصر يُزال */ } document.removeEventListener('keydown',esc); lb.remove(); }
    function esc(e){ if(e.key==='Escape') close(); }
    lb.addEventListener('click',function(e){ if(e.target!==vd) close(); }); x.addEventListener('click',close);
    document.addEventListener('keydown',esc);
    lb.appendChild(vd); lb.appendChild(x); document.body.appendChild(lb);
  }
  var HUE={canvas:205,runway:28,minimax:165,omni:42,hybrid:262,veo:8,actor:335};
  var MAXCH=3, chars=[], lastBlock='';
  function Cap(m){ return m.charAt(0).toUpperCase()+m.slice(1); }
  function setVal(el,val){ if(!el) return; el.value=val; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
  function tabLabel(v){
    if(v==='trend') return L('videoTabTrends');
    var sel=id('videoMakerMode'); if(!sel) return v;
    for(var i=0;i<sel.options.length;i++) if(sel.options[i].value===v){
      var t=(sel.options[i].textContent||'').trim(), m=t.match(ICO); t=short(t.slice(m?m[1].length:0));
      return t.split(/\s+[—–-]\s+/)[0].trim()||t;
    }
    return v;
  }
  function buildTabs(){
    var card=M.firstElementChild; if(!card) return;
    var tb=id('vmkTabs');
    if(!tb){
      tb=document.createElement('div'); tb.id='vmkTabs'; tb.className='vmk-tabs'; tb.setAttribute('role','tablist');
      tb.addEventListener('click',function(e){ var b=e.target.closest('[data-tab]'); if(b) setTab(b.dataset.tab); });
    }
    if(tb.previousElementSibling!==card.firstElementChild) card.insertBefore(tb,card.firstElementChild.nextSibling);
    tb.innerHTML='';
    TABS.forEach(function(v){
      var b=document.createElement('button'); b.type='button'; b.className='vmk-tab'; b.dataset.tab=v;
      b.setAttribute('role','tab'); b.setAttribute('aria-selected',String(v===tab)); b.textContent=tabLabel(v); tb.appendChild(b);
    });
    card.classList.toggle('vmk-tab-trend',tab==='trend');
  }
  function setTab(v){
    if(TABS.indexOf(v)<0) return; tab=v;
    var sel=id('videoMakerMode');
    if(v!=='trend'&&sel&&sel.value!==v){ sel.value=v; sel.dispatchEvent(new Event('change')); }
    buildTabs(); sync(); scrub();
  }
  function syncSamples(){
    var box=id('vmkSamples'); if(!box) return;
    var md=(id('videoMakerMode')||{}).value||''; box.innerHTML='';
    if(tab==='trend'||!md) return;
    var c=Cap(md), keys=['videoIdea'+c,'videoIdea'+c+'2'];
    var tt0=L('vcTutorial');
    if(tt0){
      var te=document.createElement('div'); te.className='vmk-sm vmk-sm-tut'; te.setAttribute('role','button'); te.tabIndex=0;
      var tp=document.createElement('div'); tp.className='vmk-sm-p'; tp.style.backgroundImage='url('+tutUrl().replace('.mp4','.jpg')+')';
      var tpl=document.createElement('span'); tpl.className='vmk-sm-play'; tp.appendChild(tpl);
      var tb=document.createElement('b'); tb.textContent=tt0; te.classList.add('has-vid'); te.appendChild(tp); te.appendChild(tb);
      var tgo=function(){ openPlayer(tutUrl()); };
      te.addEventListener('click',tgo); te.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); tgo(); } });
      box.appendChild(te);
    }
    box.style.setProperty('--h',String(HUE[md]==null?35:HUE[md]));
    keys.forEach(function(k,i){
      var tx=L(k); if(!tx) return;
      var el=document.createElement('div'); el.className='vmk-sm'; el.setAttribute('role','button'); el.tabIndex=0;
      var pv=document.createElement('div'); pv.className='vmk-sm-p'; pv.style.setProperty('--i',String(i));
      var vsrc='';
      if(VIDEOS[md+'-'+(i+1)]){
        vsrc='/media/samples/'+md+'-'+(i+1)+'.mp4';
        var vd=document.createElement('video'); vd.muted=true; vd.loop=true; vd.playsInline=true; vd.preload='none'; vd.poster='/media/samples/'+md+'-'+(i+1)+'.jpg'; vd.src=vsrc;
        el.addEventListener('mouseenter',function(){ try{ vd.play(); }catch(e){ /* guard-ok — المتصفّح قد يمنع التشغيل التلقائي */ } });
        el.addEventListener('mouseleave',function(){ try{ vd.pause(); }catch(e){ /* guard-ok — لا أثر */ } });
        pv.appendChild(vd);
      }
      if(VIDEOS[md+'-'+(i+1)]){ var pl=document.createElement('span'); pl.className='vmk-sm-play'; pv.appendChild(pl); }
      var tt=document.createElement('b'); tt.textContent=tx;
      if(vsrc){ el.classList.add('has-vid'); el.appendChild(pv); el.appendChild(tt); } else { pv.appendChild(tt); el.appendChild(pv); }
      var pick=function(){ var pe=id('videoMakerPrompt'); setVal(pe,tx); if(pe) pe.focus(); if(vsrc) openPlayer(vsrc); };
      el.addEventListener('click',pick);
      el.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); } });
      box.appendChild(el);
    });
  }
  /* ═══ الشخصيّات: اسم وصوت وكلام لكلّ شخصيّة (حتّى ٣) تُدمَج في الوصف عند «إنشاء» ═══ */
  function charBlock(){
    var rows=chars.filter(function(c){ return c.name.trim()||c.line.trim(); }); if(!rows.length) return '';
    var A=ar();
    return '\n\n'+(A?'الشخصيات:':'Characters:')+'\n'+rows.map(function(c,i){
      var f=c.voice==='female', who=c.name.trim()||((A?'شخصية ':'Character ')+(i+1));
      var v=f?(A?'امرأة إماراتية':'Emirati woman'):(A?'رجل إماراتي':'Emirati man');
      return '- '+who+' ('+v+')'+(c.line.trim()?(A?(f?' تقول: «':' يقول: «'):' says: “')+c.line.trim()+(A?'»':'”'):'');
    }).join('\n');
  }
  function compose(){
    if(tab==='trend') return;
    var pe=id('videoMakerPrompt'); if(!pe) return;
    var v=pe.value; if(lastBlock&&v.slice(-lastBlock.length)===lastBlock) v=v.slice(0,v.length-lastBlock.length);
    var b=charBlock(); pe.value=v+b; lastBlock=b;
  }
  function renderChars(){
    var cd=id('vmkChars'); if(!cd) return;
    var list=cd.querySelector('.vmk-cl'); list.innerHTML='';
    chars.forEach(function(c,i){
      var row=document.createElement('div'); row.className='vmk-ch';
      row.innerHTML='<div class="vmk-ch-h"><input class="n" type="text" maxlength="30"><select class="v"><option value="male"></option><option value="female"></option></select><button type="button" class="x"></button></div><textarea rows="2" maxlength="200"></textarea>';
      var n=row.querySelector('.n'), v=row.querySelector('.v'), t=row.querySelector('textarea'), x=row.querySelector('.x');
      n.placeholder=L('vcName'); n.value=c.name; t.placeholder=L('vcLine'); t.value=c.line;
      v.options[0].textContent=L('vcMale'); v.options[1].textContent=L('vcFemale'); v.value=c.voice;
      x.textContent='×'; x.title=L('vcRemove'); x.setAttribute('aria-label',L('vcRemove'));
      n.addEventListener('input',function(){ c.name=n.value; });
      t.addEventListener('input',function(){ c.line=t.value; });
      v.addEventListener('change',function(){ c.voice=v.value; });
      x.addEventListener('click',function(){ chars.splice(i,1); renderChars(); });
      list.appendChild(row);
    });
    var add=cd.querySelector('.vmk-ch-add'); add.textContent='+ '+L('vcAdd'); add.style.display=chars.length>=MAXCH?'none':'';
  }
  function syncChars(){
    var cd=id('vmkChars'); if(!cd) return;
    cd.querySelector('summary').textContent=L('vcTitle'); cd.querySelector('.vmk-ai-s').textContent=L('vcSub');
    renderChars();
  }
  /* ═══ v-vmk-simple (المالك: «أبسّط للجمهور… ما أريد شي معقّد»): الظاهر الوصف والمدّة (٥/٨/١٠) والشكل وزرّ الإنشاء — والباقي مطويّ في «خيارات إضافية» ═══ */
  var BASIC_DUR={'5':1,'8':1,'10':1};
  function simplify(){
    var main=M.querySelector('.vmk-main'); if(!main) return;
    var more=id('vmkMore');
    if(!more){
      more=document.createElement('details'); more.id='vmkMore'; more.className='vmk-more';
      more.innerHTML='<summary></summary><div class="vmk-more-b"></div>';
      var go=id('videoMakerGenerateBtn'); main.insertBefore(more,go||null);
    }
    var body=more.querySelector('.vmk-more-b');
    more.querySelector('summary').textContent=L('vcMore');
    var st=id('videoMakerStyle'), stBox=st&&st.parentElement;
    var nt=id('videoMakerNarrationToggle'), ntLab=nt&&nt.closest('label');
    [id('vmkChars'),stBox,id('videoMakerSignatureRow'),id('videoMakerLongMinutesRow'),
     ntLab,id('videoMakerVoiceGenderRow'),id('videoMakerNarrationRow'),M.querySelector('details.vmk-adv')].forEach(function(e){
      if(e&&e.parentNode!==body) body.appendChild(e);
    });
    /* صورة البطل ظاهرة تحت الوصف مباشرة (أمر المالك): بطاقة كبيرة بزرّ رفع واضح، لا مدفونة في «خيارات إضافية» */
    var hr=id('videoMakerHeroRow'), pw=id('videoMakerPrompt'), prw=pw&&pw.parentElement;
    if(hr&&prw&&hr.previousElementSibling!==prw){
      prw.parentNode.insertBefore(hr,prw.nextSibling);
      var hn=id('videoMakerHeroVeoNote'); if(hn) hr.appendChild(hn);
    }
    if(hr){ var hd=hr.querySelector('div'), np=hr.querySelector('p[data-i18n="videoMakerHeroNote"]'); if(hd&&np&&np.parentNode!==hd) hd.appendChild(np); }
    var du=id('videoMakerDuration'), g=du&&du.nextElementSibling, ex=id('vmkMoreDur');
    if(g&&g.classList.contains('vmk-g')){
      if(!ex){
        ex=document.createElement('div'); ex.id='vmkMoreDur'; ex.className='vmk-more-dur';
        ex.innerHTML='<label></label><div class="vmk-g vmk-pills"></div>'; body.insertBefore(ex,body.firstChild);
      }
      ex.querySelector('label').textContent=L('videoMakerDurationLabel')||'';
      var box=ex.querySelector('.vmk-g'); box.innerHTML='';
      [].slice.call(g.children).forEach(function(c){ if(!BASIC_DUR[c.dataset.v]) box.appendChild(c); });
      ex.style.display=box.children.length?'':'none';
    }
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
      if(r.lines.length&&chars.length) ac.appendChild(act(L('vwToChars'),function(){
        r.lines.forEach(function(l,i){
          var c=chars.filter(function(x){ return x.name.trim()===l.who; })[0]||chars[i%chars.length]; c.line=l.text;
        });
        renderChars(); var cd=id('vmkChars'); if(cd) cd.open=true; }));
      if(speech&&(id('videoMakerMode')||{}).value==='actor') ac.appendChild(act(L('vwToActor'),function(){ put(id('videoMakerActorSpeech'),speech.slice(0,300)); }));
      box.appendChild(ac); return box;
    }
    function send(){
      var q=inp.value.trim(); if(!q||busy) return;
      var dv=(id('videoMakerDuration')||{}).value||'8', kind=/إعلان|اعلان|\bad\b|advert/i.test(q)?'ad':/حوار|dialog/i.test(q)?'dialogue':'story';
      busy=true; go.disabled=true; inp.value=''; bubble(' u',q); var wait=bubble(' w',L('vwBusy'));
      var tk=(typeof authGet==='function')?(authGet('aiapp_auth_token')||''):'';
      fetch('/api/tools?action=video-write',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request:q,kind:kind,duration:dv,token:tk,characters:chars.map(function(c){return c.name.trim();}).filter(Boolean)})})
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
      } else { el.textContent=tx; }
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
      if(d[0]==='videoMakerDuration'&&id('vmkMoreDur')) [].forEach.call(id('vmkMoreDur').querySelectorAll('[data-v]'),function(c){ c.setAttribute('aria-checked',String(c.dataset.v===s.value)); });
      var o=s.options[s.selectedIndex];
      if(chips&&o){
        var c=document.createElement('span'); c.className='vmk-chip'+(d[0]==='videoMakerMode'?' gold':'');
        var t=noEmoji(short(o.textContent||'')); c.textContent=t.length>24?t.slice(0,24)+'…':t; chips.appendChild(c);
      }
    });
    var gbn=id('videoMakerGenerateBtn'), pc=PTS[(id('videoMakerMode')||{}).value];
    if(gbn){ if(pc!=null) gbn.setAttribute('data-cost',pc?(pc+(ar()?' نقطة':' pts')):(ar()?'مجاني':'Free')); else gbn.removeAttribute('data-cost'); }
    var p=PTS[(id('videoMakerMode')||{}).value];
    if(chips&&p!=null){
      var b=document.createElement('span'); b.className='vmk-chip gold pts';
      b.textContent=p?(p+(ar()?' نقطة':' pts')):(ar()?'مجاني':'Free'); chips.appendChild(b);
    }
    syncWrite(); syncChars(); syncSamples();
    var tbx=id('vmkTabs'); if(tbx) [].forEach.call(tbx.children,function(bt){ bt.setAttribute('aria-selected',String(bt.dataset.tab===tab)); });
    var r=((id('videoMakerRatio')||{}).value||'1280:720').split(':'), stage=M.querySelector('.vmk-stage');
    if(stage){
      stage.style.setProperty('--vmk-ar',r[0]+'/'+r[1]);
      stage.style.maxWidth=(+r[0]<+r[1])?'238px':'';
      var dm=stage.querySelector('.vmk-dim'); if(dm) dm.textContent=r[0]+'×'+r[1];
    }
  }
  /* v-trends-top: أيًّا كان ترتيب البناء (الترندات قبل الاستوديو أو بعده)، الصندوق تحت الرأس وفوق الاستوديو في كلّ فتح */
  function syncTutLink(){
    var vt=id('vtRoot'); if(!vt) return;
    var b=id('vmkTutLink');
    if(!b){ b=document.createElement('button'); b.type='button'; b.id='vmkTutLink'; b.className='vmk-tutlink'; b.addEventListener('click',function(){ openPlayer(tutUrl()); });
      var sub=id('vtSub'); if(sub&&sub.parentNode) sub.parentNode.insertBefore(b,sub.nextSibling); else vt.insertBefore(b,vt.firstChild); }
    b.textContent=L('vcTutorial'); b.style.display=b.textContent?'':'none';
  }
  function trendsTop(){
    var card=M.firstElementChild, vt=id('vtRoot'), side=card&&card.querySelector('.vmk-side');
    if(!vt||!side||!card.classList.contains('vmk-studio')) return;
    card.classList.add('vmk-trends-top');
    if(vt.parentElement!==card||vt.nextElementSibling!==side) card.insertBefore(vt,side);
  }
  function enhance(){ if(!on()) return; loadManifest(); build(); buildTabs(); trendsTop(); syncTutLink(); G.forEach(function(d){ var s=id(d[0]); if(s) group(s,d[1]); }); simplify(); sync(); scrub(); }
  var wasOpen=false;
  new MutationObserver(function(){
    var open=!!(M.style.display&&M.style.display!=='none');
    if(open&&!wasOpen){ tab='trend'; }
    wasOpen=open;
    if(open) enhance();
  }).observe(M,{attributes:true,attributeFilter:['style']});
  G.forEach(function(d){ var s=id(d[0]); if(s) s.addEventListener('change',sync); });
})();
