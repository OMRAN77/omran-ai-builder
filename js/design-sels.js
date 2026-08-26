(function(){
  var SELS=['designAiPlace','designAiStyle','designAiLighting','designAiFurniture','designAiFlooring','designAiFabric','designAiWallColor','designAiCurtains'];
  var CBS=['designAiRearrange','designAiDecorPlants','designAiDecorArt','designAiDecorAccessories'];
  var ICONS={
    designAiLighting:{'':'\u2298',warm:'\u{1F305}',cool:'\u2744\uFE0F',bright:'\u2600\uFE0F',dim:'\u{1F319}'},
    designAiFurniture:{'':'\u2298',modern:'\u{1F532}',classic:'\u{1FAB5}',simple:'\u{1F90D}',luxury:'\u{1F48E}',bohemian:'\u{1F33F}'},
    designAiFlooring:{'':'\u2298',parquet:'\u{1FAB5}',marble:'\u{1FAA8}',ceramic:'\u{1F9F1}',carpet:'\u{1F9F6}'},
    designAiFabric:{'':'\u2298',light:'\u{1F90D}',dark:'\u{1F5A4}',neutral:'\u{1FA76}',bold:'\u{1F534}'},
    designAiWallColor:{'':'\u2298',white:'\u2B1C',beige:'\u{1F7EB}',gray:'\u{1FA76}',bold:'\u{1F3A8}'},
    designAiCurtains:{'':'\u2298',simple:'\u{1F90D}',luxury:'\u{1F451}',remove:'\u{1F6AB}'},
    designAiDecorPlants:'\u{1F331}',designAiDecorArt:'\u{1F5BC}\uFE0F',designAiDecorAccessories:'\u{1F48D}'
  };
  var EMO=/^([\u200D\uFE0F\u2190-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]+)\s*/u;
  function mark(g,sel){ g.querySelectorAll('.optCard').forEach(function(c){ c.classList.toggle('sel', c.getAttribute('data-v')===sel.value); }); }
  function buildGrid(sel){
    var opts=Array.prototype.slice.call(sel.options);
    var g=document.createElement('div'); g.className='optGrid';
    g.style.gridTemplateColumns='repeat('+(opts.length<=4?opts.length:3)+',1fr)';
    opts.forEach(function(o){
      var den=(document.documentElement.lang||'ar')==='en'&&o.getAttribute('data-en');
      var txt=((den||o.textContent)||'').trim(), m=txt.match(EMO);
      var ic=m?m[1]:(((ICONS[sel.id]||{})[o.value])||'');
      if(m) txt=txt.replace(EMO,'');
      var c=document.createElement('div');
      c.className='optCard'+(o.value===sel.value?' sel':'');
      c.setAttribute('data-v',o.value);
      c.innerHTML=(ic?'<span class="oi"></span>':'')+'<span class="ol"></span>';
      if(ic) c.querySelector('.oi').textContent=ic;
      c.querySelector('.ol').textContent=txt;
      c.onclick=function(){ sel.value=o.value; sel.dispatchEvent(new Event('change',{bubbles:true})); mark(g,sel); };
      g.appendChild(c);
    });
    return g;
  }
  function buildChip(cb){
    var lab=cb.parentElement, sp=lab?lab.querySelector('span'):null;
    var txt=sp?(sp.textContent||'').trim():cb.id, ic='';
    if(!EMO.test(txt)) ic=(ICONS[cb.id]||'')+' ';
    var d=document.createElement('div');
    d.className='optChip'+(cb.checked?' sel':'');
    d.innerHTML='<span class="ck"></span><span class="ct"></span>';
    d.querySelector('.ck').textContent='\u2713';
    d.querySelector('.ct').textContent=ic+txt;
    d.onclick=function(){ cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true})); d.classList.toggle('sel',cb.checked); };
    return d;
  }
  function dropZone(mid,pfx){
    var fb=document.getElementById(pfx+'FileBtn'), fi=document.getElementById(pfx+'FileInput'), fn=document.getElementById(pfx+'FileName');
    if(!fb||!fi||document.querySelector('#'+mid+' .dzArea')) return;
    var row=fb.parentElement, dz=document.createElement('div');
    dz.className='dzArea';
    dz.innerHTML='<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><div class="dzT"><b data-i18n="fileChooseBtn"></b><br><span class="dzN"></span></div>';
    dz.querySelector('b').textContent=(fb.textContent||'').trim();
    row.parentElement.insertBefore(dz,row);
    if(fn) dz.querySelector('.dzN').appendChild(fn);
    row.style.display='none';
    dz.onclick=function(){ fi.click(); };
    dz.addEventListener('dragover',function(e){ e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave',function(){ dz.classList.remove('over'); });
    dz.addEventListener('drop',function(e){
      e.preventDefault(); dz.classList.remove('over');
      try{ if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){ fi.files=e.dataTransfer.files; fi.dispatchEvent(new Event('change',{bubbles:true})); } }catch(_){ fi.click(); }
    });
  }
  /* v-decor-swatch: لوحة ألوان حقيقية لكل خيار — بطاقة احترافية بألوان النمط
     نفسه (النجدي رملي، السايبربانك نيون…) بدل شارة إيموجي، إلى أن تحلّ الصور
     المولّدة محلّها. الموقع رسمي — لا شكل ألعاب أطفال. */
  var PALS={
    designAiStyle:{
      modern:['#2e3440','#81858f','#d8dce3'], simple:['#f2efe9','#d8d2c6','#b8b0a1'],
      bohemian:['#a5673f','#c89b6d','#5f7150'], luxury:['#1a1a1f','#d4af37','#4a3f2a'],
      arabic:['#6b3f23','#b07d3f','#3d2413'], classic:['#5a4632','#8a6d4e','#cdb891'],
      najdi:['#b7854f','#8a5a33','#e0c9a0'], islamic:['#1f4d3f','#2e7d5f','#d4af37'],
      andalusi:['#28527a','#c76b3f','#e8d9b0'], emirati:['#d9c39a','#a6774a','#f0e6cf'],
      scandinavian:['#e8e6e1','#b9c4bf','#8d9b94'], japandi:['#d9cfbf','#8f8574','#4a453c'],
      industrial:['#3d3d3d','#6e5b4a','#9aa0a6'], midcentury:['#c97f3d','#3f6f64','#e0b64f'],
      artdeco:['#0f1c2e','#d4af37','#2e4a3f'], neoclassic:['#e5ded2','#b9a582','#6e6250'],
      victorian:['#4a2c3a','#7a4a5a','#c9a86a'], baroque:['#3a2418','#8a5a23','#d4af37'],
      gothic:['#14121a','#3a2f4a','#6a5a7a'], rustic:['#6e4a2f','#9a744a','#c9b394'],
      farmhouse:['#f0ece3','#c9bfa8','#8a795f'], coastal:['#3f7fa5','#a5cfe0','#f0e9d8'],
      mediterranean:['#2e6f9e','#e8dcc0','#c76b3f'], moroccan:['#28527a','#c7572f','#d4af37'],
      turkish:['#7a1f2b','#2e527a','#d4af37'], persian:['#5a1f2b','#8a2f3f','#caa353'],
      indian:['#8a2f5f','#c7572f','#e0a52f'], japanese:['#3d3a35','#8a2f2f','#e8e2d2'],
      zen:['#dcd7cb','#a5a08f','#6e6a5a'], wabisabi:['#c9beac','#8f8674','#5a5346'],
      tropical:['#1f6e4a','#4aa56e','#e0c94f'], desert:['#d9b380','#a5744a','#f0dfc0'],
      loft:['#4a4a4a','#7a6a5a','#b0b4ba'], futuristic:['#1a2330','#3f6e9e','#c9d7e8'],
      cyberpunk:['#1a0f2e','#7a2f9e','#2fd7e8'], gamer:['#14141f','#5f2fd7','#2fe87a'],
      darkacademia:['#2e2318','#5f4a2f','#9a8560'], chalet:['#5f4530','#8f7050','#e8e2d8'],
      provence:['#8a7fb0','#c9c2e0','#e8e2c9'], hollywood:['#1a1418','#8a1f3f','#d4af37'],
      monochrome:['#111111','#777777','#eeeeee'], earthy:['#8a6a4a','#b09070','#6e5a3f'],
      pastel:['#f0c9d7','#c9dff0','#f0ecc9'], smart:['#22272e','#3f5f8a','#9ab0c9'],
      eco:['#2e6e3f','#7aa55f','#d7e8c9'], retro70s:['#b0642f','#d7a52f','#6e4a2f'],
      popart:['#e02f5f','#2f6ee0','#f0d72f'], minimalwhite:['#ffffff','#e8e8e8','#cfcfcf']
    },
    designAiPlace:{
      '':['#2a2a30','#4a4a52','#6e6e78'], restaurant:['#5a2f23','#8a5a3f','#d4af37'],
      cafe:['#4a3423','#8a6a4a','#d9c3a0'], bedroom:['#3f3a4a','#8a7fa5','#e0d8e8'],
      majlis:['#6b3f23','#b07d3f','#d4af37'], living:['#3f4a45','#7a8a80','#d0d8d2'],
      kitchen:['#e8e2d2','#a5a08a','#5f5a4a'], office:['#2e3a4a','#5f7085','#c9d2dc'],
      shop:['#4a2f4a','#8a5f8a','#e0c9e0'], bath:['#3f7f8a','#a5d0d7','#f0f0ea'],
      kids:['#4a7fc9','#e0c94f','#c95f7a'], entrance:['#3a3530','#6e675f','#c9c2b4'],
      garden:['#2e5f2e','#6ea54a','#d7e8b0']
    },
    designAiLighting:{ '':['#2a2a30','#3d3d45','#55555f'], warm:['#8a5f23','#e0a52f','#f0d7a0'],
      cool:['#2e527a','#5f9ec9','#c9e0f0'], bright:['#c9c2a5','#e0dcc9','#f5f2e8'], dim:['#141218','#2a2530','#4a4052'] },
    designAiFurniture:{ '':['#2a2a30','#3d3d45','#55555f'], modern:['#3a3f47','#8a929e','#d7dbe0'],
      classic:['#5a4632','#8a6d4e','#cdb891'], simple:['#e8e4dc','#c9c2b6','#a5a094'],
      luxury:['#1a1a1f','#d4af37','#4a3f2a'], bohemian:['#a5673f','#c89b6d','#5f7150'] },
    designAiFlooring:{ '':['#2a2a30','#3d3d45','#55555f'], parquet:['#5f3f23','#8a5f3a','#b0855a'],
      marble:['#a5a5b0','#c9c9d0','#e8e8ea'], ceramic:['#7a8585','#a5b0b0','#d2d7d7'], carpet:['#4a1f2a','#7a2f3f','#a55a6a'] },
    designAiFabric:{ '':['#2a2a30','#3d3d45','#55555f'], light:['#c9beaa','#e0d8c9','#f0ece0'],
      dark:['#23232a','#3f3f4a','#5f5f6e'], neutral:['#8a8474','#a59e8f','#c9c2b4'], bold:['#c92f4a','#2f5fc9','#e0a52f'] },
    designAiWallColor:{ '':['#2a2a30','#3d3d45','#55555f'], white:['#f5f5f5','#e8e8e8','#d7d7d7'],
      beige:['#e0d2b4','#cdbb96','#b8a67e'], gray:['#8a8a92','#a5a5ad','#c9c9d0'], bold:['#c92f4a','#2f8a5f','#2f5fc9'] },
    designAiCurtains:{ '':['#2a2a30','#3d3d45','#55555f'], simple:['#e8e4da','#c9c2b0','#a5a08f'],
      luxury:['#4a2f3f','#8a5f7a','#d4af37'], remove:['#2a2a30','#3f3f47','#5a5a63'] }
  };
  function palBg(id,v){
    var c=(PALS[id]||{})[v]; if(!c) return '';
    return 'linear-gradient(90deg,'+c[0]+' 0 33.4%,'+c[1]+' 33.4% 66.7%,'+c[2]+' 66.7% 100%) bottom/100% 26% no-repeat,'+
      'linear-gradient(155deg,'+c[0]+' 0%,'+c[1]+' 55%,'+c[2]+' 120%)';
  }
  window.__decorPal=palBg;
  /* v-decor-full-page: كل قوائم الديكور الثماني بطاقة مصغّرة «عرض الكل ›» تفتح
     معرضًا ملء الشاشة — نفس نظام أنماط الصور (طلب المالك: كلهم مرة وحدة). */
  function selImg(id,v){
    if(!v) return '';
    return id==='designAiStyle' ? 'assets/design/styles/'+v+'.webp'
      : 'assets/design/opts/'+id.replace('designAi','').toLowerCase()+'-'+v+'.webp';
  }
  function selTrigger(s){
    var ien=(document.documentElement.lang||'ar')==='en';
    function optTxt(o){ var den=ien&&o.getAttribute('data-en'); return ((den||o.textContent)||'').trim(); }
    function cur(){ var os=s.options; for(var i=0;i<os.length;i++) if(os[i].value===s.value) return os[i]; return os[0]; }
    var lab=s.parentElement.querySelector('label');
    var labTxt=(lab?lab.textContent:'').trim();
    var tr=window.omranPicker.trigger(function(){
      var o=cur();
      return o && { name:optTxt(o), img:selImg(s.id,o.value), bg:palBg(s.id,o.value),
        sub:s.options.length+(ien?' options':' خيارًا') };
    }, function(){
      return {
        title: labTxt,
        count: s.options.length+(ien?' options — pick yours':' خيارًا — اختر ما يناسبك'),
        items: Array.prototype.map.call(s.options,function(o){
          return { v:o.value, title:optTxt(o)||(ien?'None':'بدون'), active:o.value===s.value,
            img:selImg(s.id,o.value), bg:palBg(s.id,o.value) };
        }),
        onPick: function(v){ s.value=v; s.dispatchEvent(new Event('change',{bubbles:true})); tr.refresh(); }
      };
    });
    tr.el.classList.add('optGrid');
    return tr.el;
  }
  function build(){
    if(!document.getElementById('designAiModal')) return;
    dropZone('designAiModal','designAi');
    SELS.forEach(function(id){
      var s=document.getElementById(id); if(!s||!s.parentElement) return;
      var old=s.parentElement.querySelector('.optGrid'); if(old) old.remove();
      s.style.display='none';
      var g=(window.omranPicker&&window.omranPicker.trigger)?selTrigger(s):buildGrid(s); s.parentElement.appendChild(g);
      if(!s.getAttribute('data-gridhook')){ s.setAttribute('data-gridhook','1'); s.addEventListener('change',function(){ var gg=s.parentElement.querySelector('.optGrid'); if(gg) mark(gg,s); }); }
    });
    var nt=document.getElementById('designAiNotes');
    if(nt){ var ien=(document.documentElement.lang||'ar')==='en';
      nt.placeholder=ien?'e.g. Italian restaurant, 40 seats, high ceiling, industrial vibe':'\u0645\u062B\u0627\u0644: \u0645\u0637\u0639\u0645 \u0625\u064A\u0637\u0627\u0644\u064A \u0664\u0660 \u0643\u0631\u0633\u064A\u060C \u0633\u0642\u0641 \u0639\u0627\u0644\u064A\u060C \u0637\u0627\u0628\u0639 \u0635\u0646\u0627\u0639\u064A';
      var nl=document.getElementById('designAiNotesLbl'); if(nl) nl.textContent=ien?'\u270D\uFE0F Describe it in your own words (optional)':'\u270D\uFE0F \u0627\u0643\u062A\u0628 \u062A\u0641\u0627\u0635\u064A\u0644\u0643 \u0628\u0643\u0644\u0645\u0627\u062A\u0643 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)';
    }
    var anchor=document.getElementById('designAiDecorPlants');
    if(anchor&&anchor.parentElement&&anchor.parentElement.parentElement){
      var wrap=anchor.parentElement.parentElement, host=wrap.parentElement;
      var oldc=host.querySelector('.chipGrid'); if(oldc) oldc.remove();
      var cg=document.createElement('div'); cg.className='chipGrid';
      CBS.forEach(function(id){ var cb=document.getElementById(id); if(!cb) return; if(cb.parentElement) cb.parentElement.style.display='none'; cg.appendChild(buildChip(cb)); });
      wrap.style.display='none'; host.appendChild(cg);
    }
  }
  function boot(){ try{ build(); }catch(e){ __swallow(e,'design-sels:boot'); }
    try{ new MutationObserver(function(){ try{ build(); }catch(e){ __swallow(e,'design-sels:lang'); } }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']}); }catch(e){ __swallow(e,'design-sels:observe'); }
  }
  window.__optUI={buildGrid:buildGrid,buildChip:buildChip,dropZone:dropZone,mark:mark};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
