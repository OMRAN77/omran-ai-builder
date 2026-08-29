(function(){
  var GEN=[['women','\u{1F469}','fxGenWomen'],['men','\u{1F468}','fxGenMen'],['kids','\u{1F476}','fxGenKids']];
  var COL=[['Black','#000','fxColBlack'],['White','#fff','fxColWhite'],['Navy','#1a3a5c','fxColNavy'],['Red','#8B0000','fxColRed'],['Gold','#d4af37','fxColGold'],['Green','#2d5a27','fxColGreen'],['Beige','#F5F5DC','fxColBeige'],['Multicolour','linear-gradient(135deg,#ff6b6b,#feca57,#48dbfb,#ff9ff3)','fxColMulti']];
  var EXT=[['Glasses','\u{1F576}\uFE0F','fxAccGlasses'],['Watch','\u231A','fxAccWatch'],['Handbag','\u{1F45C}','fxAccHandbag'],['Shoes','\u{1F45F}','fxAccShoes'],['Scarf','\u{1F9E3}','fxAccScarf'],['Makeup','\u{1F484}','fxAccMakeup']];
  var st={gender:'women',colors:[],extras:[]};
  /* v603: النصوص من نطاق t() — ١٤ لغةً (كان ثنائيًا: إنجليزيٌ وإلّا عربيّ). القيم المُرسلة تبقى إنجليزيّة. */
  function T(k){ try{ return (typeof t==='function') ? t(k) : k; }catch(e){ return k; } }
  function lbl(icon,k){ var d=document.createElement('div'); d.className='optLbl f417'; d.textContent=icon+' '+T(k); return d; }
  /* v-fashion-photo-all: كل بطاقات الاستوديو صور حقيقية — الصورة تغطي
     البطاقة والاسم شريط سفلي، وعند غيابها يبقى شكل الإيموجي كما هو. */
  function photoize(card,url,tall){
    card.style.position='relative'; card.style.overflow='hidden'; card.style.borderRadius='12px';
    if(tall) card.style.aspectRatio='3/4';
    var im=document.createElement('img');
    im.src=url; im.loading='eager'; im.alt='';
    im.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;';
    im.onerror=function(){ im.remove(); };
    im.onload=function(){
      var oi=card.querySelector('.oi'); if(oi) oi.style.display='none';
      var ol=card.querySelector('.ol')||card.querySelector('.ct');
      if(ol) ol.style.cssText='position:absolute;left:0;right:0;bottom:0;z-index:1;padding:14px 4px 5px;font-size:11px;font-weight:700;text-align:center;color:#eef0f6;background:linear-gradient(transparent,rgba(0,0,0,.85));';
      var ck=card.querySelector('.ck');
      if(ck) ck.style.cssText='position:absolute;top:6px;inset-inline-end:6px;z-index:2;width:20px;height:20px;border-radius:50%;border:1.5px solid rgba(212,175,55,.6);display:flex;align-items:center;justify-content:center;font-size:11px;background:rgba(0,0,0,.45);';
    };
    card.insertBefore(im,card.firstChild);
  }
  var LOOKS='assets/fashion/looks/';
  // صور مخصّصة للفئات (بورتريه) — لا تعيد صور بطاقات الأنماط.
  var GENDER_FACE={women:'category/women',men:'category/men',kids:'category/kids'};
  function genderGrid(){
    var g=document.createElement('div'); g.className='optGrid f417'; g.style.gridTemplateColumns='repeat(3,1fr)';
    GEN.forEach(function(r){
      var c=document.createElement('div'); c.className='optCard'+(st.gender===r[0]?' sel':'');
      c.innerHTML='<span class="oi"></span><span class="ol"></span>';
      c.querySelector('.oi').textContent=r[1]; c.querySelector('.ol').textContent=T(r[2]);
      photoize(c,LOOKS+GENDER_FACE[r[0]]+'.webp',true);
      c.onclick=function(){ st.gender=r[0]; Array.prototype.forEach.call(g.children,function(x,i){ x.classList.toggle('sel',GEN[i][0]===st.gender); }); try{ window.dispatchEvent(new CustomEvent('fashion-gender-change',{detail:{gender:st.gender}})); }catch(e){ /* guard-ok: بثّ تجميلي — فشله لا يمسّ اختيار الفئة نفسه */ } };
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
      photoize(d,LOOKS+'extras/'+r[0].toLowerCase()+'.webp',false);
      d.style.aspectRatio='1'; d.style.minWidth='0';
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
    // v-fashion-full-page: المناسبة والموسم بطاقة مصغّرة «عرض الكل ›» تفتح
    // معرضًا ملء الشاشة بصور occasion/ وseason/ — نفس نظام أنماط الصور.
    [occ,sea].forEach(function(sel){
      var host=sel.parentElement; if(!host) return;
      var old=host.querySelector('.optGrid'); if(old) old.remove();
      sel.style.display='none';
      var kind=(sel===occ)?'occasion':'season';
      var lab=host.querySelector('label'), labTxt=(lab?lab.textContent:'').trim();
      function optTxt(o){ var l0=(document.documentElement.lang||'ar')+''; var den=(l0.indexOf('ar')!==0&&l0.indexOf('ur')!==0)&&o.getAttribute('data-en'); return ((den||o.textContent)||'').trim(); } /* v-look-labels */
      function cur(){ var os=sel.options; for(var i=0;i<os.length;i++) if(os[i].value===sel.value) return os[i]; return os[0]; }
      var tr=window.omranPicker.trigger(function(){
        var o=cur();
        return o && { name:optTxt(o), img:o.value?LOOKS+kind+'/'+o.value+'.webp':'',
          sub:sel.options.length+' '+(typeof window.t==='function'&&window.t('pickerOptsWord')!=='pickerOptsWord'?window.t('pickerOptsWord'):((((document.documentElement.lang||'ar')==='en')?'options':'خيارًا'))) };
      }, function(){
        return {
          title: labTxt,
          count: sel.options.length+(((document.documentElement.lang||'ar')==='en')?' options — pick yours':' خيارًا — اختر ما يناسبك'),
          items: Array.prototype.map.call(sel.options,function(o){
            return { v:o.value, title:optTxt(o), active:o.value===sel.value, img:o.value?LOOKS+kind+'/'+o.value+'.webp':'' };
          }),
          onPick: function(v){ sel.value=v; sel.dispatchEvent(new Event('change',{bubbles:true})); tr.refresh(); }
        };
      });
      tr.el.classList.add('optGrid','f417');
      host.appendChild(tr.el);
      if(!sel.getAttribute('data-gridhook')){ sel.setAttribute('data-gridhook','1'); sel.addEventListener('change',function(){ tr.refresh(); }); }
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
