(function(){
  var GEN=[['women','👩','fxGenWomen'],['men','👨','fxGenMen'],['kids','👶','fxGenKids']];
  var COL=[['Black','#000','fxColBlack'],['White','#fff','fxColWhite'],['Navy','#1a3a5c','fxColNavy'],['Red','#8B0000','fxColRed'],['Gold','#d4af37','fxColGold'],['Green','#2d5a27','fxColGreen'],['Beige','#F5F5DC','fxColBeige'],['Multicolour','linear-gradient(135deg,#ff6b6b,#feca57,#48dbfb,#ff9ff3)','fxColMulti']];
  var EXT=[['Glasses','🕶️','fxAccGlasses'],['Watch','⌚','fxAccWatch'],['Handbag','👜','fxAccHandbag'],['Shoes','👟','fxAccShoes'],['Scarf','🧣','fxAccScarf'],['Makeup','💄','fxAccMakeup']];
  var st={gender:'women',colors:[],extras:[]};
  /* v-fx-gender-pics: الفئة تُتذكَّر — كانت ترجع «نسائي» مع كلّ فتح للتطبيق («يثبت نسائي»). تُقرأ هنا قبل الحزمة فيبدأ app-12 بها. */
  var GKEY='aiapp_fashion_gender';
  try{ var g0=localStorage.getItem(GKEY); if(g0==='men'||g0==='kids') st.gender=g0; }catch(e){ /* guard-ok: بلا تخزين تبدأ نسائيّة كما كانت */ }
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
  var LOOKS='assets/fashion/looks/'; /* v-sharp: صور الأزياء أُعيد توضيحها — ?v=2 على كلّ رابط منها يكسر الكاش */
  // صور مخصّصة للفئات (بورتريه) — لا تعيد صور بطاقات الأنماط.
  var GENDER_FACE={women:'category/women',men:'category/men',kids:'category/kids'};
  /* v-fx-gender-pics (المالك ١٧ أكتوبر: «اختار نسائي يكون كجول والموسم نسائي واذا ختار رجالي ولا اطفال يثبت نسائي»):
     صور occasion/ وseason/ كلّها لامرأة، فبقيت بطاقتا المناسبة والموسم ومعرضاهما نسائيّة مهما تغيّرت الفئة. للرجال والأطفال
     صورة من looks/<الفئة>/ تطابق المعنى (ما يختاره FX_OCC_STYLE في app-12 للمناسبة، والأقرب للموسم)؛ النساء على صورهنّ كما هي. */
  var KIND_LOOK={
    men:{ occasion:{wedding:'wedding',work:'office',casual:'casual',sport:'sporty',travel:'smartcasual',formal:'formal',graduation:'threepiece',religious:'traditional'},
          season:{summer:'summer',autumn:'leather',winter:'winterlux',spring:'oldmoney'} },
    kids:{ occasion:{wedding:'wedding',work:'school',casual:'casual',sport:'sporty',travel:'denim',formal:'formal',graduation:'preppy',religious:'eidkids'},
          season:{summer:'summer',autumn:'vintage',winter:'winterlux',spring:'floral'} }
  };
  function kindImg(kind,v){
    if(!v) return '';
    var g=KIND_LOOK[st.gender], s=g&&g[kind]&&g[kind][v];
    return s ? LOOKS+st.gender+'/'+s+'.webp?v=3' : LOOKS+kind+'/'+v+'.webp?v=3';
  }
  var kindTriggers=[]; /* بطاقتا المناسبة والموسم — تُعاد رسمًا عند تغيّر الفئة */
  /* صور الإضافات الستّ (extras/<القطعة>) كلّها لامرأة. للرجال والأطفال صورهم من مولّد الموقع (extras/<الفئة>-<القطعة>، موافقة المالك
     على الكلفة ١٨ أكتوبر، بلا نصّ ومراجَعة مكبّرة؛ القطعة الأولى من كتالوج الخادم: نظارة طيّار، ساعة بميناء خالٍ، حقيبة أوراق،
     حذاء أكسفورد، وشاح كشمير، عناية للرجل؛ نظارة دائريّة، ساعة ملوّنة، حقيبة صغيرة، حذاء رياضيّ، وشاح صوف، لمعة على الخدّ للطفل).
     لا امرأة لرجل أو طفل، ومربّع الإيموجي يبقى البديل إن غابت صورة. [المصدر، [x, y, تكبير, نسبة الطول للعرض]] — موضع القطعة في الصورة. */
  var R34=1371/1024, XG=LOOKS+'extras/';
  var EXT_PIC={
    men:{ Glasses:[XG+'men-glasses.webp?v=3',[.64,.22,1.7,R34]], Watch:[XG+'men-watch.webp?v=3',[.5,.5,2.1,R34]], Handbag:[XG+'men-handbag.webp?v=3',[.53,.63,1.35,R34]],
          Shoes:[XG+'men-shoes.webp?v=3',[.5,.79,1.5,R34]], Scarf:[XG+'men-scarf.webp?v=3',[.52,.42,1.45,R34]], Makeup:[XG+'men-makeup.webp?v=3',[.46,.27,1.8,R34]] },
    kids:{ Glasses:[XG+'kids-glasses.webp?v=3',[.65,.17,1.6,R34]], Watch:[XG+'kids-watch.webp?v=3',[.51,.5,1.6,R34]], Handbag:[XG+'kids-handbag.webp?v=3',[.5,.6,2,R34]],
           Shoes:[XG+'kids-shoes.webp?v=3',[.76,.7,1.8,R34]], Scarf:[XG+'kids-scarf.webp?v=3',[.5,.6,1.35,R34]], Makeup:[XG+'kids-makeup.webp?v=3',[.5,.33,1.9,R34]] }
  };
  var EXT_ICON={ men:{Handbag:'💼',Makeup:'🧴'}, kids:{Makeup:'✨'} };
  /* نصوص الفئة بالـ١٤ لغة هنا (كما في app-12-fx-simple.js). مفتاح بلا لغة = يبقى نصّ المفتاح الأصليّ (محايد في تلك اللغة). */
  var TXG={
    grooming:{ ar:'عناية', en:'Grooming', fr:'Soins', es:'Cuidado personal', tr:'Bakım', ru:'Уход', hi:'ग्रूमिंग', ur:'گرومنگ', bn:'গ্রুমিং', ne:'ग्रुमिङ', fil:'Pag-aayos', id:'Perawatan', zh:'仪容打理', ml:'ഗ്രൂമിങ്' },
    sparkle:{ ar:'لمعة خفيفة', en:'Light sparkle', fr:'Touche scintillante', es:'Toque de brillo', tr:'Hafif ışıltı', ru:'Лёгкий блеск', hi:'हल्की चमक', ur:'ہلکی چمک', bn:'হালকা ঝিলিক', ne:'हल्का चमक', fil:'Kaunting kinang', id:'Kilau ringan', zh:'一点闪亮', ml:'ചെറിയ തിളക്കം' },
    bag:{ ar:'حقيبة', en:'Bag', fr:'Sac', es:'Bolsa', tr:'Çanta', ru:'Сумка', hi:'बैग', ur:'بیگ', bn:'ব্যাগ', ne:'झोला', fil:'Bag', id:'Tas', zh:'包', ml:'ബാഗ്' },
    dropMen:{ ar:'ارفع صورتك كاملة' },
    dropKids:{ ar:'ارفع صورة طفلك كاملة', en:"Upload your child's full-body photo", fr:'Téléchargez une photo en pied de votre enfant', es:'Sube una foto de cuerpo entero de tu hijo', tr:'Çocuğunuzun boydan fotoğrafını yükleyin', ru:'Загрузите фото ребёнка в полный рост', hi:'अपने बच्चे की पूरे शरीर की फोटो अपलोड करें', ur:'اپنے بچے کی پورے قد کی تصویر اپ لوڈ کریں', bn:'আপনার শিশুর সম্পূর্ণ দেহের ছবি আপলোড করুন', ne:'आफ्नो बच्चाको पूरै शरीरको फोटो अपलोड गर्नुहोस्', fil:'Mag-upload ng buong-katawang litrato ng iyong anak', id:'Unggah foto seluruh badan anak Anda', zh:'上传孩子的全身照片', ml:'കുട്ടിയുടെ മുഴുനീള ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യൂ' },
    descMen:{ ar:'مثال: بدلة كحلية مع قميص أبيض وحذاء بني', en:'e.g. A navy suit with a white shirt and brown loafers', fr:'ex. : Un costume bleu marine avec une chemise blanche et des mocassins marron', es:'p. ej.: Un traje azul marino con camisa blanca y mocasines marrones', tr:'örn. Beyaz gömlek ve kahverengi loaferlarla lacivert takım elbise', ru:'напр.: тёмно-синий костюм с белой рубашкой и коричневыми лоферами', hi:'उदा.: सफ़ेद शर्ट और भूरे लोफ़र्स के साथ नेवी सूट', ur:'مثال: سفید قمیص اور بھورے لوفرز کے ساتھ نیوی سوٹ', bn:'যেমন: সাদা শার্ট ও বাদামি লোফারের সাথে নেভি স্যুট', ne:'जस्तै: सेतो सर्ट र खैरो लोफरसहित नेभी सुट', fil:'hal. Navy na suit na may puting polo at kayumangging loafers', id:'mis. Setelan jas biru dongker dengan kemeja putih dan loafer cokelat', zh:'例如：海军蓝西装配白衬衫和棕色乐福鞋', ml:'ഉദാ: വെള്ള ഷർട്ടും ബ്രൗൺ ലോഫറുകളും ചേർന്ന നേവി സ്യൂട്ട്' },
    descKids:{ ar:'مثال: قميص كاروهات مع جينز وحذاء رياضي أبيض', en:'e.g. A checked shirt with jeans and white sneakers', fr:'ex. : Une chemise à carreaux avec un jean et des baskets blanches', es:'p. ej.: Una camisa a cuadros con vaqueros y zapatillas blancas', tr:'örn. Kot pantolon ve beyaz spor ayakkabıyla ekose gömlek', ru:'напр.: рубашка в клетку с джинсами и белыми кроссовками', hi:'उदा.: जींस और सफ़ेद स्नीकर्स के साथ चेक वाली शर्ट', ur:'مثال: جینز اور سفید جوگرز کے ساتھ چیک والی قمیص', bn:'যেমন: জিন্স ও সাদা স্নিকারের সাথে চেক শার্ট', ne:'जस्तै: जिन्स र सेतो स्निकरसहित चेक सर्ट', fil:'hal. Checkered na polo na may maong at puting sneakers', id:'mis. Kemeja kotak-kotak dengan jins dan sneaker putih', zh:'例如：格子衬衫配牛仔裤和白色运动鞋', ml:'ഉദാ: ജീൻസും വെള്ള സ്നീക്കറുകളും ചേർന്ന ചെക്ക് ഷർട്ട്' }
  };
  function curLang(){ try{ return (typeof lang!=='undefined'&&lang)||localStorage.getItem('aiapp_lang')||'ar'; }catch(e){ return 'ar'; } }
  function pickTx(o){ return (o&&o[curLang()])||''; }
  function extIcon(k,def){ var m=EXT_ICON[st.gender]; return (m&&m[k])||def; }
  function extLabel(r){
    if(st.gender!=='women'){
      var o=r[0]==='Makeup' ? (st.gender==='men'?TXG.grooming:TXG.sparkle) : (r[0]==='Handbag' ? TXG.bag : null);
      var v=pickTx(o); if(v) return v;
    }
    return T(r[2]);
  }
  /* نصّ يتبع الفئة: نصّ الفئة إن وُجد للغة (ويُنزع المفتاح فلا يعيده مُطبِّق اللغة)، وإلّا يعود المفتاح الأصليّ بنصّه */
  function swapI18n(el,attr,key,o){
    if(!el) return;
    var v=pickTx(o), set=function(s){ if(attr==='data-i18n') el.textContent=s; else el.placeholder=s; };
    if(v){ el.removeAttribute(attr); set(v); return; }
    if(el.getAttribute(attr)!==key){ el.setAttribute(attr,key); var d=T(key); if(d&&d!==key) set(d); }
  }
  function applyGenderTexts(){
    var g=st.gender;
    swapI18n(document.querySelector('#fashionAiDropZone .omUpT'),'data-i18n','fashionDropTitle', g==='men'?TXG.dropMen:(g==='kids'?TXG.dropKids:null));
    swapI18n(document.getElementById('fashionAiDescription'),'data-i18n-placeholder','fashionAiDescPlaceholder', g==='men'?TXG.descMen:(g==='kids'?TXG.descKids:null));
    /* «💍 فستان زفاف» تحت صورة عريس: لغير النساء اسم المناسبة نفسه «💍 زفاف» (مفتاح قائم بالـ١٤ لغة) */
    var wo=document.querySelector('#fashionAiStyle option[value="wedding"]'), wk=(g==='women')?'fashionAiStyleWedding':'fashionOccasionWedding';
    if(wo&&wo.getAttribute('data-i18n')!==wk){ wo.setAttribute('data-i18n',wk); var wv=T(wk); if(wv&&wv!==wk) wo.textContent=wv; }
  }
  function genderGrid(){
    var g=document.createElement('div'); g.className='optGrid f417'; g.style.gridTemplateColumns='repeat(3,1fr)';
    GEN.forEach(function(r){
      var c=document.createElement('div'); c.className='optCard'+(st.gender===r[0]?' sel':'');
      c.innerHTML='<span class="oi"></span><span class="ol"></span>';
      c.querySelector('.oi').textContent=r[1]; c.querySelector('.ol').textContent=T(r[2]);
      photoize(c,LOOKS+GENDER_FACE[r[0]]+'.webp?v=3',true);
      c.onclick=function(){ st.gender=r[0]; Array.prototype.forEach.call(g.children,function(x,i){ x.classList.toggle('sel',GEN[i][0]===st.gender); }); kindTriggers.forEach(function(tr){ tr.refresh(); });
        try{ localStorage.setItem(GKEY,st.gender); }catch(e){ /* guard-ok: بلا تخزين تبقى للجلسة وحدها */ }
        var og=document.querySelector('#fashionAiModal .fxAccGrid'); if(og) og.replaceWith(extrasRow()); /* المختار في st.extras يبقى */
        applyGenderTexts();
        try{ window.dispatchEvent(new CustomEvent('fashion-gender-change',{detail:{gender:st.gender}})); }catch(e){ /* guard-ok: بثّ تجميلي — فشله لا يمسّ اختيار الفئة نفسه */ } };
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
  /* v-fashion-acc-cards (المالك بلقطة، ٢٨ سبتمبر: «الإضافات مش واضحه»): الرقاقة كانت flex في صفّ يلتفّ،
     وphotoize يجعل اسمها وعلامتها absolute بعد تحميل الصورة فلا يبقى في تدفّقها شيء — فانكمشت إلى عرض
     حشوها (~٣٠ بكسل) وقُصّ الاسم تحت دائرة الاختيار. الآن شبكة بطاقات: صورة مربّعة مقرّبة على الإضافة
     نفسها (الصور لقطات كاملة ٢:٣ — الساعة والحذاء والمكياج لا تُرى في قصّ الوسط) والاسم تحتها لا فوقها.
     EXT_FOCUS: [x, y] موضع الإضافة في الصورة (نسبة) و[z] التكبير. */
  var EXT_FOCUS={Glasses:[.56,.17,2],Watch:[.46,.53,2.4],Handbag:[.44,.49,2],Shoes:[.46,.93,2],Scarf:[.49,.37,1.6],Makeup:[.48,.11,2.4]};
  function focusCss(f){
    var z=f[2], r=f[3]||1.5, l=.5-f[0]*z, tp=.5-f[1]*r*z; /* r: طول الصورة إلى عرضها — صور الفئات ٣:٤ بنسبتها لا ممطوطة */
    l=Math.min(0,Math.max(1-z,l)); tp=Math.min(0,Math.max(1-r*z,tp)); // لا فراغ داخل المربّع
    return 'position:absolute;z-index:1;max-width:none;height:auto;aspect-ratio:'+(f[3]?'1/'+r:'2/3')+';width:'+(z*100)+'%;left:'+(l*100).toFixed(1)+'%;top:'+(tp*100).toFixed(1)+'%;';
  }
  function paintAcc(d,on){
    d.classList.toggle('sel',on);
    var ck=d.querySelector('.ck');
    ck.style.background=on?'#d4af37':'rgba(0,0,0,.45)'; ck.style.color=on?'#141414':'transparent'; ck.style.borderColor=on?'#d4af37':'rgba(212,175,55,.7)';
    d.style.boxShadow=on?'0 0 0 1px #d4af37,0 6px 18px -8px rgba(212,175,55,.6)':'none';
    var ct=d.querySelector('.ct'); if(ct) ct.style.color=on?'#d4af37':'#fff'; /* v-photo-only: لون الاسم مضمَّن فوق الصورة فلا يرث ذهب .sel */
  }
  function extrasRow(){
    var w=document.createElement('div'); w.className='fxAccGrid f417';
    w.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px;margin-top:6px;';
    EXT.forEach(function(r){
      var d=document.createElement('div'); d.className='optChip fxAccCard';
      d.style.cssText='display:flex;flex-direction:column;align-items:stretch;gap:0;padding:0;min-width:0;border-radius:12px;overflow:hidden;';
      /* v-photo-only (المالك ١٧ أكتوبر: «اي صوره تحتها احذفها نهائي»): الاسم .ct داخل المربّع فوق أسفل الصورة بتدرّج، لا شريط تحتها
         (يبقى عقدةً: app-12-fx-simple.js يقرأ نصّه لتلميح الأزرار) */
      d.innerHTML='<div class="fxAccPic"><span class="oi"></span><span class="ck"></span><div class="ct"></div></div>';
      var pic=d.querySelector('.fxAccPic'), oi=d.querySelector('.oi'), ck=d.querySelector('.ck'), ct=d.querySelector('.ct');
      pic.style.cssText='position:relative;aspect-ratio:1;overflow:hidden;background:linear-gradient(160deg,#23232a,#101014);';
      var icon=extIcon(r[0],r[1]);
      oi.textContent=icon; oi.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:30px;';
      ck.textContent='✓'; ck.style.cssText='position:absolute;top:6px;inset-inline-end:6px;z-index:2;width:22px;height:22px;border-radius:50%;border:1.5px solid;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;';
      ct.textContent=icon+' '+extLabel(r); ct.style.cssText='position:absolute;inset:auto 0 0 0;z-index:2;pointer-events:none;padding:18px 4px 6px;font-size:12.5px;font-weight:700;text-align:center;line-height:1.25;overflow-wrap:anywhere;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9);background:linear-gradient(0deg,rgba(0,0,0,.85),rgba(0,0,0,0));';
      /* v-fx-gender-pics: صورة النساء من extras/، ولغيرهنّ صورة فئتهم إن وُجدت وإلّا لا صورة (يبقى الإيموجي) */
      var gp=EXT_PIC[st.gender], ap=gp&&gp[r[0]];
      var url=(st.gender==='women'||!EXT_PIC[st.gender]) ? LOOKS+'extras/'+r[0].toLowerCase()+'.webp?v=3' : (ap?ap[0]:'');
      if(url){
        var im=document.createElement('img'); im.alt=''; im.loading='lazy';
        im.style.cssText=focusCss(ap?ap[1]:(EXT_FOCUS[r[0]]||[.5,.5,1]));
        im.onerror=function(){ im.remove(); };
        pic.insertBefore(im,ck);
        /* التأجيل على المربّع لا على الصورة: الصورة المزاحة للتقريب تقع خارج قصّ المربّع قبل تحميلها فلا تتقاطع أبدًا */
        if(window.__omranWhenSeen) window.__omranWhenSeen(pic,function(){ im.src=url; });
        else im.src=url;
      }
      d.setAttribute('data-ext',r[0]); /* v-fx-simple: مرساة ثابتة للشريط المطويّ واقتراحات ما بعد النتيجة */
      paintAcc(d,st.extras.indexOf(r[0])>=0);
      d.onclick=function(){ var i=st.extras.indexOf(r[0]); if(i>=0) st.extras.splice(i,1); else st.extras.push(r[0]); paintAcc(d,i<0); };
      w.appendChild(d);
    });
    return w;
  }
  /* v-fashion-variety: سطر يشرح الإضافات — شكلها يتغيّر مع كلّ تصميم (الخادم يختار نوعًا من كتالوجها). */
  function hint(k){ var d=document.createElement('div'); d.className='f417'; d.style.cssText='font-size:11.5px;color:var(--muted);margin:-2px 0 2px;'; d.textContent=T(k); return d; }
  function build(){
    var U=window.__optUI, occ=document.getElementById('fashionAiOccasion'), sea=document.getElementById('fashionAiSeason'), sty=document.getElementById('fashionAiStyle');
    if(!U||!occ||!sea||!sty) return;
    // v-fashion-look: منطقة الرفع الذهبية في partials — لا dzArea هنا.
    Array.prototype.forEach.call(document.querySelectorAll('#fashionAiModal .f417'),function(x){ x.remove(); });
    kindTriggers=[];
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
        return o && { name:optTxt(o), img:kindImg(kind,o.value),
          sub:sel.options.length+' '+(typeof window.t==='function'&&window.t('pickerOptsWord')!=='pickerOptsWord'?window.t('pickerOptsWord'):((((document.documentElement.lang||'ar')==='en')?'options':'خيارًا'))) };
      }, function(){
        return {
          title: labTxt,
          /* v657: العدّاد يتبع اللغة كما في design-sels. */
          count: sel.options.length+' '+((typeof window.t==='function'&&window.t('pickerOptsPick')!=='pickerOptsPick')?window.t('pickerOptsPick'):(((document.documentElement.lang||'ar')==='en')?'options — pick yours':'خيارًا — اختر ما يناسبك')),
          items: Array.prototype.map.call(sel.options,function(o){
            return { v:o.value, title:optTxt(o), active:o.value===sel.value, img:kindImg(kind,o.value) };
          }),
          onPick: function(v){ sel.value=v; sel.dispatchEvent(new Event('change',{bubbles:true})); tr.refresh(); }
        };
      });
      tr.el.classList.add('optGrid','f417');
      host.appendChild(tr.el);
      kindTriggers.push(tr);
      if(!sel.getAttribute('data-gridhook')){ sel.setAttribute('data-gridhook','1'); sel.addEventListener('change',function(){ tr.refresh(); }); }
    });
    var row=occ.parentElement.parentElement;
    row.style.gridTemplateColumns='1fr';
    row.parentElement.insertBefore(genderGrid(),row);
    row.parentElement.insertBefore(lbl('👤','fxCatLbl'),row.previousSibling);
    row.insertAdjacentElement('afterend',extrasRow());
    row.insertAdjacentElement('afterend',hint('fxAccHint'));
    row.insertAdjacentElement('afterend',lbl('💎','fxAccLbl'));
    row.insertAdjacentElement('afterend',colorRow());
    row.insertAdjacentElement('afterend',lbl('🎨','fxColorsLbl'));
    applyGenderTexts(); /* الإقلاع بفئة محفوظة، وكلّ تغيير لغة */
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
    s.src = '/js/media-notify.js?v=2';
    s.charset = 'utf-8';
    s.setAttribute('data-media-notify', '1');
    document.head.appendChild(s);
  }catch(e){ /* guard-ok: تعثّر محمّل التنبيهات يجب ألّا يُسقط شيئًا */ }
})();
