(function(){
  var SELS=['designAiStyle','designAiLighting','designAiFurniture','designAiFlooring','designAiFabric','designAiWallColor','designAiCurtains'];
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
  function build(){
    if(!document.getElementById('designAiModal')) return;
    dropZone('designAiModal','designAi');
    SELS.forEach(function(id){
      var s=document.getElementById(id); if(!s||!s.parentElement) return;
      var old=s.parentElement.querySelector('.optGrid'); if(old) old.remove();
      s.style.display='none';
      var g=buildGrid(s); s.parentElement.appendChild(g);
      if(!s.getAttribute('data-gridhook')){ s.setAttribute('data-gridhook','1'); s.addEventListener('change',function(){ var gg=s.parentElement.querySelector('.optGrid'); if(gg) mark(gg,s); }); }
    });
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
