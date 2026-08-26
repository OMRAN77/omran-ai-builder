(function(){
  var GEN=[['women','\u{1F469}','fxGenWomen'],['men','\u{1F468}','fxGenMen'],['kids','\u{1F476}','fxGenKids']];
  var COL=[['Black','#000','fxColBlack'],['White','#fff','fxColWhite'],['Navy','#1a3a5c','fxColNavy'],['Red','#8B0000','fxColRed'],['Gold','#d4af37','fxColGold'],['Green','#2d5a27','fxColGreen'],['Beige','#F5F5DC','fxColBeige'],['Multicolour','linear-gradient(135deg,#ff6b6b,#feca57,#48dbfb,#ff9ff3)','fxColMulti']];
  var EXT=[['Glasses','\u{1F576}\uFE0F','fxAccGlasses'],['Watch','\u231A','fxAccWatch'],['Handbag','\u{1F45C}','fxAccHandbag'],['Shoes','\u{1F45F}','fxAccShoes'],['Scarf','\u{1F9E3}','fxAccScarf'],['Makeup','\u{1F484}','fxAccMakeup']];
  var st={gender:'women',colors:[],extras:[]};
  /* v603: النصوص من نطاق t() — ١٤ لغةً (كان ثنائيًا: إنجليزيٌ وإلّا عربيّ). القيم المُرسلة تبقى إنجليزيّة. */
  function T(k){ try{ return (typeof t==='function') ? t(k) : k; }catch(e){ return k; } }
  function lbl(icon,k){ var d=document.createElement('div'); d.className='optLbl f417'; d.textContent=icon+' '+T(k); return d; }
  function genderGrid(){
    var g=document.createElement('div'); g.className='optGrid f417'; g.style.gridTemplateColumns='repeat(3,1fr)';
    GEN.forEach(function(r){
      var c=document.createElement('div'); c.className='optCard'+(st.gender===r[0]?' sel':'');
      c.innerHTML='<span class="oi"></span><span class="ol"></span>';
      c.querySelector('.oi').textContent=r[1]; c.querySelector('.ol').textContent=T(r[2]);
      c.onclick=function(){ st.gender=r[0]; Array.prototype.forEach.call(g.children,function(x,i){ x.classList.toggle('sel',GEN[i][0]===st.gender); }); };
      g.appendChild(c);
    });
    return g;
  }
  function colorRow(){
    var w=document.createElement('div'); w.className='colorRow f417';
    COL.forEach(function(r){
      var d=document.createElement('div'); d.className='cw'+(st.colors.indexOf(r[0])>=0?' sel':'');
      d.innerHTML='<div class="cc"></div><div class="cn"></div>';
      d.querySelector('.cc').style.background=r[1];
      d.querySelector('.cn').textContent=T(r[2]);
      d.onclick=function(){ var i=st.colors.indexOf(r[0]); if(i>=0) st.colors.splice(i,1); else st.colors.push(r[0]); d.classList.toggle('sel',i<0); };
      w.appendChild(d);
    });
    return w;
  }
  function extrasRow(){
    var w=document.createElement('div'); w.className='chipGrid f417';
    EXT.forEach(function(r){
      var d=document.createElement('div'); d.className='optChip'+(st.extras.indexOf(r[0])>=0?' sel':'');
      d.innerHTML='<span class="ck"></span><span class="ct"></span>';
      d.querySelector('.ck').textContent='\u2713';
      d.querySelector('.ct').textContent=r[1]+' '+T(r[2]);
      d.onclick=function(){ var i=st.extras.indexOf(r[0]); if(i>=0) st.extras.splice(i,1); else st.extras.push(r[0]); d.classList.toggle('sel',i<0); };
      w.appendChild(d);
    });
    return w;
  }
  function build(){
    var U=window.__optUI, occ=document.getElementById('fashionAiOccasion'), sea=document.getElementById('fashionAiSeason'), sty=document.getElementById('fashionAiStyle');
    if(!U||!occ||!sea||!sty) return;
    // v-fashion-look: منطقة الرفع الذهبية في partials — لا dzArea هنا.
    Array.prototype.forEach.call(document.querySelectorAll('#fashionAiModal .f417'),function(x){ x.remove(); });
    // v-fashion-thumb-cards: النمط له بطاقات مصوّرة خاصة في app-12 — لا يُحوَّل هنا.
    [occ,sea].forEach(function(sel){
      var host=sel.parentElement; if(!host) return;
      var old=host.querySelector('.optGrid'); if(old) old.remove();
      sel.style.display='none';
      var g=U.buildGrid(sel); g.classList.add('f417'); host.appendChild(g);
      if(!sel.getAttribute('data-gridhook')){ sel.setAttribute('data-gridhook','1'); sel.addEventListener('change',function(){ var gg=host.querySelector('.optGrid'); if(gg) U.mark(gg,sel); }); }
    });
    var row=occ.parentElement.parentElement;
    row.style.gridTemplateColumns='1fr';
    row.parentElement.insertBefore(genderGrid(),row);
    row.parentElement.insertBefore(lbl('\u{1F464}','fxCatLbl'),row.previousSibling);
    row.insertAdjacentElement('afterend',extrasRow());
    row.insertAdjacentElement('afterend',lbl('\u{1F48E}','fxAccLbl'));
    row.insertAdjacentElement('afterend',colorRow());
    row.insertAdjacentElement('afterend',lbl('\u{1F3A8}','fxColorsLbl'));
  }
  window.omranFashionExtras=function(){
    var occ=document.getElementById('fashionAiOccasion'), sea=document.getElementById('fashionAiSeason');
    return { gender:st.gender, colors:st.colors.slice(), extras:st.extras.slice(),
      season:sea?sea.value:'', occasion:occ?occ.value:'' };
  };
  function boot(){
    try{ build(); }catch(e){ console.warn('[fashion v417] build failed:',e); }
    try{ new MutationObserver(function(){ try{ build(); }catch(e){ console.warn('[fashion v417] rebuild failed:',e); } }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']}); }catch(e){ console.warn('[fashion v417] observer failed:',e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
