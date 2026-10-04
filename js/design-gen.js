(function(){
  var GEN=[['women','\\u{1F469}','fxGenWomen'],['men','\\u{1F468}','fxGenMen'],['kids','\\u{1F476}','fxGenKids']];
  var COL=[['Black','#000','fxColBlack'],['White','#fff','fxColWhite'],['Navy','#1a3a5c','fxColNavy'],['Red','#8B0000','fxColRed'],['Gold','#d4af37','fxColGold'],['Green','#2d5a27','fxColGreen'],['Beige','#F5F5DC','fxColBeige'],['Multicolour','linear-gradient(135deg,#ff6b6b,#feca57,#48dbfb,#ff9ff3)','fxColMulti']];
  var EXT=[['Glasses','\\u{1F576}\\uFE0F','fxAccGlasses'],['Watch','\\u231A','fxAccWatch'],['Handbag','\\u{1F45C}','fxAccHandbag'],['Shoes','\\u{1F45F}','fxAccShoes'],['Scarf','\\u{1F9E3}','fxAccScarf'],['Makeup','\\u{1F484}','fxAccMakeup']];
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
    im.loading='lazy'; im.alt='';
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
    /* v-art-defer: البطاقة داخل #fashionAiModal المغلق — الصورة كانت تُحمَّل عند الإقلاع
       (eager يتجاوز display:none أصلًا). تُحمَّل الآن حين تدخل الشاشة، أي عند فتح النافذة. */
    if(window.__omranWhenSeen) window.__omranWhenSeen(im,function(){ im.src=url; });
    else im.src=url;
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
      d.setAttribute('data-col',r[0]); /* v-fx-simple: مرساة ثابتة للشريط المطويّ واقتراحات ما بعد النتيجة */
      d.onclick=function(){ var i=st.colors.indexOf(r[0]); if(i>=0) st.colors.splice(i,1); else st.colors.push(r[0]); d.classList.toggle('sel',i<0); };
      w.appendChild(d);
    });
    return w;
  }
  /* v-fashion-acc-cards (\\u0627\\u0644\\u0645\\u0627\\u0644\\u0643 \\u0628\\u0644\\u0642\\u0637\\u0629\\u060c \\u0662\\u0668 \\u0633\\u0628\\u062a\\u0645\\u0628\\u0631: \\u00ab\\u0627\\u0644\\u0625\\u0636\\u0627\\u0641\\u0627\\u062a \\u0645\\u0634 \\u0648\\u0627\\u0636\\u062d\\u0647\\u00bb): \\u0627\\u0644\\u0631\\u0642\\u0627\\u0642\\u0629 \\u0643\\u0627\\u0646\\u062a flex \\u0641\\u064a \\u0635\\u0641\\u0651 \\u064a\\u0644\\u062a\\u0641\\u0651\\u060c
     \\u0648photoize \\u064a\\u062c\\u0639\\u0644 \\u0627\\u0633\\u0645\\u0647\\u0627 \\u0648\\u0639\\u0644\\u0627\\u0645\\u062a\\u0647\\u0627 absolute \\u0628\\u0639\\u062f \\u062a\\u062d\\u0645\\u064a\\u0644 \\u0627\\u0644\\u0635\\u0648\\u0631\\u0629 \\u0641\\u0644\\u0627 \\u064a\\u0628\\u0642\\u0649 \\u0641\\u064a \\u062a\\u062f\\u0641\\u0651\\u0642\\u0647\\u0627 \\u0634\\u064a\\u0621 \\u2014 \\u0641\\u0627\\u0646\\u0643\\u0645\\u0634\\u062a \\u0625\\u0644\\u0649 \\u0639\\u0631\\u0636
     \\u062d\\u0634\\u0648\\u0647\\u0627 (~\\u0663\\u0660 \\u0628\\u0643\\u0633\\u0644) \\u0648\\u0642\\u064f\\u0635\\u0651 \\u0627\\u0644\\u0627\\u0633\\u0645 \\u062a\\u062d\\u062a \\u062f\\u0627\\u0626\\u0631\\u0629 \\u0627\\u0644\\u0627\\u062e\\u062a\\u064a\\u0627\\u0631. \\u0627\\u0644\\u0622\\u0646 \\u0634\\u0628\\u0643\\u0629 \\u0628\\u0637\\u0627\\u0642\\u0627\\u062a: \\u0635\\u0648\\u0631\\u0629 \\u0645\\u0631\\u0628\\u0651\\u0639\\u0629 \\u0645\\u0642\\u0631\\u0651\\u0628\\u0629 \\u0639\\u0644\\u0649 \\u0627\\u0644\\u0625\\u0636\\u0627\\u0641\\u0629
     \\u0646\\u0641\\u0633\\u0647\\u0627 (\\u0627\\u0644\\u0635\\u0648\\u0631 \\u0644\\u0642\\u0637\\u0627\\u062a \\u0643\\u0627\\u0645\\u0644\\u0629 \\u0662:\\u0663 \\u2014 \\u0627\\u0644\\u0633\\u0627\\u0639\\u0629 \\u0648\\u0627\\u0644\\u062d\\u0630\\u0627\\u0621 \\u0648\\u0627\\u0644\\u0645\\u0643\\u064a\\u0627\\u062c \\u0644\\u0627 \\u062a\\u064f\\u0631\\u0649 \\u0641\\u064a \\u0642\\u0635\\u0651 \\u0627\\u0644\\u0648\\u0633\\u0637) \\u0648\\u0627\\u0644\\u0627\\u0633\\u0645 \\u062a\\u062d\\u062a\\u0647\\u0627 \\u0644\\u0627 \\u0641\\u0648\\u0642\\u0647\\u0627.
     EXT_FOCUS: [x, y] \\u0645\\u0648\\u0636\\u0639 \\u0627\\u0644\\u0625\\u0636\\u0627\\u0641\\u0629 \\u0641\\u064a \\u0627\\u0644\\u0635\\u0648\\u0631\\u0629 (\\u0646\\u0633\\u0628\\u0629) \\u0648[z] \\u0627\\u0644\\u062a\\u0643\\u0628\\u064a\\u0631. */
  var EXT_FOCUS={Glasses:[.56,.17,2],Watch:[.46,.53,2.4],Handbag:[.44,.49,2],Shoes:[.46,.93,2],Scarf:[.49,.37,1.6],Makeup:[.48,.11,2.4]};
  function focusCss(f){
    var z=f[2], l=.5-f[0]*z, tp=.5-f[1]*1.5*z;
    l=Math.min(0,Math.max(1-z,l)); tp=Math.min(0,Math.max(1-1.5*z,tp)); // \\u0644\\u0627 \\u0641\\u0631\\u0627\\u063a \\u062f\\u0627\\u062e\\u0644 \\u0627\\u0644\\u0645\\u0631\\u0628\\u0651\\u0639
    return 'position:absolute;z-index:1;max-width:none;height:auto;aspect-ratio:2/3;width:'+(z*100)+'%;left:'+(l*100).toFixed(1)+'%;top:'+(tp*100).toFixed(1)+'%;';
  }
  function paintAcc(d,on){
    d.classList.toggle('sel',on);
    var ck=d.querySelector('.ck');
    ck.style.background=on?'#d4af37':'rgba(0,0,0,.45)'; ck.style.color=on?'#141414':'transparent'; ck.style.borderColor=on?'#d4af37':'rgba(212,175,55,.7)';
    d.style.boxShadow=on?'0 0 0 1px #d4af37,0 6px 18px -8px rgba(212,175,55,.6)':'none';
  }
  function extrasRow(){
    var w=document.createElement('div'); w.className='fxAccGrid f417';
    w.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px;margin-top:6px;';
    EXT.forEach(function(r){
      var d=document.createElement('div'); d.className='optChip fxAccCard';
      d.style.cssText='display:flex;flex-direction:column;align-items:stretch;gap:0;padding:0;min-width:0;border-radius:12px;overflow:hidden;';
      d.innerHTML='<div class="fxAccPic"><span class="oi"></span><span class="ck"></span></div><div class="ct"></div>';
      var pic=d.querySelector('.fxAccPic'), oi=d.querySelector('.oi'), ck=d.querySelector('.ck'), ct=d.querySelector('.ct');
      pic.style.cssText='position:relative;aspect-ratio:1;overflow:hidden;background:linear-gradient(160deg,#23232a,#101014);';
      oi.textContent=r[1]; oi.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:30px;';
      ck.textContent='\\u2713'; ck.style.cssText='position:absolute;top:6px;inset-inline-end:6px;z-index:2;width:22px;height:22px;border-radius:50%;border:1.5px solid;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;';
      ct.textContent=r[1]+' '+T(r[2]); ct.style.cssText='padding:7px 4px 8px;font-size:12.5px;font-weight:700;text-align:center;line-height:1.25;overflow-wrap:anywhere;';
      var im=document.createElement('img'); im.alt=''; im.loading='lazy';
      im.style.cssText=focusCss(EXT_FOCUS[r[0]]||[.5,.5,1]);
      im.onerror=function(){ im.remove(); };
      pic.insertBefore(im,ck);
      /* التأجيل على المربّع لا على الصورة: الصورة المزاحة للتقريب تقع خارج قصّ المربّع قبل تحميلها فلا تتقاطع أبدًا */
      var url=LOOKS+'extras/'+r[0].toLowerCase()+'.webp';
      if(window.__omranWhenSeen) window.__omranWhenSeen(pic,function(){ im.src=url; });
      else im.src=url;
      d.setAttribute('data-ext',r[0]); /* v-fx-simple: مرساة ثابتة للشريط المطويّ واقتراحات ما بعد النتيجة */
      paintAcc(d,st.extras.indexOf(r[0])>=0);
      d.onclick=function(){ var i=st.extras.indexOf(r[0]); if(i>=0) st.extras.splice(i,1); else st.extras.push(r[0]); paintAcc(d,i<0); };
      w.appendChild(d);
    });
    return w;
  }
  /* v-fashion-variety: \\u0633\\u0637\\u0631 \\u064a\\u0634\\u0631\\u062d \\u0627\\u0644\\u0625\\u0636\\u0627\\u0641\\u0627\\u062a \\u2014 \\u0634\\u0643\\u0644\\u0647\\u0627 \\u064a\\u062a\\u063a\\u064a\\u0651\\u0631 \\u0645\\u0639 \\u0643\\u0644\\u0651 \\u062a\\u0635\\u0645\\u064a\\u0645 (\\u0627\\u0644\\u062e\\u0627\\u062f\\u0645 \\u064a\\u062e\\u062a\\u0627\\u0631 \\u0646\\u0648\\u0639\\u064b\\u0627 \\u0645\\u0646 \\u0643\\u062a\\u0627\\u0644\\u0648\\u062c\\u0647\\u0627). */
  function hint(k){ var d=document.createElement('div'); d.className='f417'; d.style.cssText='font-size:11.5px;color:var(--muted);margin:-2px 0 2px;'; d.textContent=T(k); return d; }
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
      function optTxt(o){ return (typeof window.__optT==='function')?window.__optT(o):(((o&&o.textContent)||'')+'').trim(); } /* v657 */
      function cur(){ var os=sel.options; for(var i=0;i<os.length;i++) if(os[i].value===sel.value) return os[i]; return os[0]; }
      var tr=window.omranPicker.trigger(function(){
        var o=cur();
        return o && { name:optTxt(o), img:o.value?LOOKS+kind+'/'+o.value+'.webp':'',
          sub:sel.options.length+' '+(typeof window.t==='function'&&window.t('pickerOptsWord')!=='pickerOptsWord'?window.t('pickerOptsWord'):((((document.documentElement.lang||'ar')==='en')?'options':'خيارًا'))) };
      }, function(){
        return {
          title: labTxt,
          /* v657: العدّاد يتبع اللغة كما في design-sels. */
          count: sel.options.length+' '+((typeof window.t==='function'&&window.t('pickerOptsPick')!=='pickerOptsPick')?window.t('pickerOptsPick'):(((document.documentElement.lang||'ar')==='en')?'options — pick yours':'خيارًا — اختر ما يناسبك')),
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
    row.parentElement.insertBefore(lbl('\\u{1F464}','fxCatLbl'),row.previousSibling);
    row.insertAdjacentElement('afterend',extrasRow());
    row.insertAdjacentElement('afterend',hint('fxAccHint'));
    row.insertAdjacentElement('afterend',lbl('\\u{1F48E}','fxAccLbl'));
    row.insertAdjacentElement('afterend',colorRow());
    row.insertAdjacentElement('afterend',lbl('\\u{1F3A8}','fxColorsLbl'));
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

/* v-media-notify (طلب المالك ٤ أكتوبر: «إذا طلعت من التطبيق وأنا أسوي صورة يعطيني تنبيه أنها جاهزة»):
   محمّل وحدة التنبيهات — يجلب js/media-notify.js المستقلّ فيلتفّ على fetch ويرصد اكتمال توليد
   الصور والفيديو من كلّ المسارات، فإن كان المستخدم خارج التطبيق أظهر إشعار نظام يعيده إليها.
   وحدة مستقلّة حتى لا تُعاد كتابة الحزمة، وهذا الملف يُحمَّل قبلها (index.html). */
(function(){
  try{
    if (document.querySelector('script[data-media-notify]')) return;
    var s = document.createElement('script');
    s.src = '/js/media-notify.js?v=1';
    s.charset = 'utf-8';
    s.setAttribute('data-media-notify', '1');
    document.head.appendChild(s);
  }catch(e){ /* guard-ok: تعثّر محمّل التنبيهات يجب ألّا يُسقط شيئًا */ }
})();
