(function(){
  var GEN=[['women','\u{1F469}','\u0646\u0633\u0627\u0626\u064A','Women'],['men','\u{1F468}','\u0631\u062C\u0627\u0644\u064A','Men'],['kids','\u{1F476}','\u0623\u0637\u0641\u0627\u0644','Kids']];
  var COL=[['\u0623\u0633\u0648\u062F','Black','#000'],['\u0623\u0628\u064A\u0636','White','#fff'],['\u0643\u062D\u0644\u064A','Navy','#1a3a5c'],['\u0623\u062D\u0645\u0631','Red','#8B0000'],['\u0630\u0647\u0628\u064A','Gold','#d4af37'],['\u0623\u062E\u0636\u0631','Green','#2d5a27'],['\u0628\u064A\u062C','Beige','#F5F5DC'],['\u0645\u062A\u0639\u062F\u062F','Multicolour','linear-gradient(135deg,#ff6b6b,#feca57,#48dbfb,#ff9ff3)']];
  var EXT=[['\u0646\u0638\u0627\u0631\u0627\u062A','Glasses','\u{1F576}\uFE0F'],['\u0633\u0627\u0639\u0629','Watch','\u231A'],['\u062D\u0642\u064A\u0628\u0629','Handbag','\u{1F45C}'],['\u0623\u062D\u0630\u064A\u0629','Shoes','\u{1F45F}'],['\u0648\u0634\u0627\u062D','Scarf','\u{1F9E3}'],['\u0645\u0643\u064A\u0627\u062C','Makeup','\u{1F484}']];
  var st={gender:'women',colors:[],extras:[]};
  function en(){ return (document.documentElement.lang||'ar')==='en'; }
  function L(a,b){ return en()?b:a; }
  function lbl(a,b){ var d=document.createElement('div'); d.className='optLbl f417'; d.textContent=L(a,b); return d; }
  function genderGrid(){
    var g=document.createElement('div'); g.className='optGrid f417'; g.style.gridTemplateColumns='repeat(3,1fr)';
    GEN.forEach(function(r){
      var c=document.createElement('div'); c.className='optCard'+(st.gender===r[0]?' sel':'');
      c.innerHTML='<span class="oi"></span><span class="ol"></span>';
      c.querySelector('.oi').textContent=r[1]; c.querySelector('.ol').textContent=L(r[2],r[3]);
      c.onclick=function(){ st.gender=r[0]; Array.prototype.forEach.call(g.children,function(x,i){ x.classList.toggle('sel',GEN[i][0]===st.gender); }); };
      g.appendChild(c);
    });
    return g;
  }
  function colorRow(){
    var w=document.createElement('div'); w.className='colorRow f417';
    COL.forEach(function(r){
      var d=document.createElement('div'); d.className='cw'+(st.colors.indexOf(r[1])>=0?' sel':'');
      d.innerHTML='<div class="cc"></div><div class="cn"></div>';
      d.querySelector('.cc').style.background=r[2];
      d.querySelector('.cn').textContent=L(r[0],r[1]);
      d.onclick=function(){ var i=st.colors.indexOf(r[1]); if(i>=0) st.colors.splice(i,1); else st.colors.push(r[1]); d.classList.toggle('sel',i<0); };
      w.appendChild(d);
    });
    return w;
  }
  function extrasRow(){
    var w=document.createElement('div'); w.className='chipGrid f417';
    EXT.forEach(function(r){
      var d=document.createElement('div'); d.className='optChip'+(st.extras.indexOf(r[1])>=0?' sel':'');
      d.innerHTML='<span class="ck"></span><span class="ct"></span>';
      d.querySelector('.ck').textContent='\u2713';
      d.querySelector('.ct').textContent=r[2]+' '+L(r[0],r[1]);
      d.onclick=function(){ var i=st.extras.indexOf(r[1]); if(i>=0) st.extras.splice(i,1); else st.extras.push(r[1]); d.classList.toggle('sel',i<0); };
      w.appendChild(d);
    });
    return w;
  }
  function build(){
    var U=window.__optUI, occ=document.getElementById('fashionAiOccasion'), sea=document.getElementById('fashionAiSeason'), sty=document.getElementById('fashionAiStyle');
    if(!U||!occ||!sea||!sty) return;
    U.dropZone('fashionAiModal','fashionAi');
    Array.prototype.forEach.call(document.querySelectorAll('#fashionAiModal .f417'),function(x){ x.remove(); });
    [occ,sea,sty].forEach(function(sel){
      var host=sel.parentElement; if(!host) return;
      var old=host.querySelector('.optGrid'); if(old) old.remove();
      sel.style.display='none';
      var g=U.buildGrid(sel); g.classList.add('f417'); host.appendChild(g);
      if(!sel.getAttribute('data-gridhook')){ sel.setAttribute('data-gridhook','1'); sel.addEventListener('change',function(){ var gg=host.querySelector('.optGrid'); if(gg) U.mark(gg,sel); }); }
    });
    var row=occ.parentElement.parentElement;
    row.style.gridTemplateColumns='1fr';
    row.parentElement.insertBefore(genderGrid(),row);
    row.parentElement.insertBefore(lbl('\u{1F464} \u0627\u0644\u0641\u0626\u0629','\u{1F464} Category'),row.previousSibling);
    row.insertAdjacentElement('afterend',extrasRow());
    row.insertAdjacentElement('afterend',lbl('\u{1F48E} \u0625\u0636\u0627\u0641\u0627\u062A','\u{1F48E} Accessories'));
    row.insertAdjacentElement('afterend',colorRow());
    row.insertAdjacentElement('afterend',lbl('\u{1F3A8} \u0627\u0644\u0623\u0644\u0648\u0627\u0646 \u0627\u0644\u0645\u0641\u0636\u0651\u0644\u0629','\u{1F3A8} Preferred colours'));
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
