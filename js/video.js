/* v412 — يحوّل نافذة الفيديو إلى استوديو غني. الكمبيوتر عمودان والهاتف عمود واحد (v-vmk-mobile). */
(function(){
  /* v-vmk-clean-video (المالك: «كيف أضيف الفيديو إذا كان مغبّش؟ أريد تنظيفه»): تحسين فيديو المستخدم في جهازه بـffmpeg.wasm الموجود —
     مجّانيّ بلا خادم ولا مزوّد. تنقية التشويش (hqdn3d) + توضيح معتدل (cas) + لون وتباين (eq) [+ إزالة التدرّج deband في «قويّ»]
     [+ مضاعفة الدقّة lanczos للمصدر ≤ ٥٤٠]. لا يصلح الغبش الشديد ولا الاهتزاز — هذا للذكاء الاصطناعيّ المدفوع (قرار المالك). */
  function cleanArgs(o){
    o=o||{}; var vf=[], sh=(o.w&&o.h)?Math.min(o.w,o.h):0;
    /* سقف ١٠٨٠ على الضلع الأقصر (الطوليّ 1080×1920 يبقى كما هو) — تعبير داخل المرشّح فيعمل حتّى لو عجز المتصفّح عن قراءة الأبعاد */
    vf.push("scale='if(gt(iw,ih),-2,min(iw,1080))':'if(gt(iw,ih),min(ih,1080),-2)':flags=lanczos");
    vf.push(o.level==='strong'?'hqdn3d=4:3:6:4.5':'hqdn3d=1.5:1.5:4:4');
    if(o.level==='strong') vf.push('deband');
    if(o.upscale&&sh&&sh<=540) vf.push('scale=iw*2:ih*2:flags=lanczos');
    vf.push(o.level==='strong'?'cas=0.5':'cas=0.3');
    vf.push(o.level==='strong'?'eq=contrast=1.05:saturation=1.08':'eq=contrast=1.03:saturation=1.05');
    vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    /* -t: حدّ المدّة يُفرض في الأداة نفسها (ملفّ بلا مدّة مقروءة لا يفلت منه)، و0:a:0? أوّل مسار صوت فقط إن وُجد */
    return ['-i',o.input,'-t',String(o.maxSec||60),'-map','0:v:0','-map','0:a:0?','-vf',vf.join(','),'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',o.output||'out.mp4'];
  }
  try{ window.__vmkCleanArgs=cleanArgs; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:19'); /* guard-ok — بيئة بلا window */ }
  /* v-video-enhance-pro (المالك بعد تجربة المسار المجّانيّ: «مش قوي بما فيه الكفاية… مش الجودة المطلوبة» ثمّ «اريده في التطبيق»):
     زرّ «تحسين احترافي» في القسم نفسه — ترميم على الخادم بالنقاط (api/_lib/video-enhance.js). المسار المجّانيّ أعلاه لا يتغيّر ولا
     يمرّ بالخادم. هذه الدوالّ الصرفة تُكشف للاختبار: estimate تقدير النقاط قبل الرفع (الحكم لقياس الخادم)، check فحص محلّيّ يُرجع
     مفتاح نصّ الرفض أو فراغًا (فلا يُرفع ملفّ سيُرفض)، errKey رمز الخادم ← مفتاح النصّ.
     info.tall===false = الخادم يقول إنّ المخرج الأعلى من 1080 مغلق لهذا الحساب: قاعدته نفسها هنا (العرض ≤ 1920 والارتفاع ≤ 1080) قبل
     الرفع — المقطع الطوليّ كان يُرفع كاملًا ويأكل رفعة من حدّ اليوم ثمّ يُرفض. جواب بلا الحقل يبقى على القاعدة العامّة. */
  function proEstimate(info,sec){
    var r=info?+info.rate:0, mn=info?+info.minSec:0, s=+sec;
    return (r>0&&mn>0&&s>0)?r*Math.max(mn,Math.ceil(s-0.1)):0;
  }
  function proCheck(info,file,meta){
    if(!info||!file) return '';
    var ty=String(file.type||'').toLowerCase().split(';')[0].trim();
    if(!/\.(mp4|mov|m4v)$/i.test(file.name||'')&&!/^video\/(mp4|quicktime|x-m4v)$/.test(ty)) return 'vclProSpec';
    if(file.size>info.maxMB*1048576) return 'vclTooBig';
    if(meta&&meta.sec>info.maxSec+0.1) return 'vclProTooLong';
    if(meta&&meta.w&&meta.h&&info.tall===false&&(meta.w>1920||meta.h>1080)) return 'vclProSpec';
    if(meta&&meta.w&&meta.h&&(Math.min(meta.w,meta.h)>1080||Math.max(meta.w,meta.h)>1920)) return 'vclProSpec';
    return '';
  }
  var PRO_ERR={points_insufficient:'vclProNoPoints',too_big:'vclTooBig',too_long:'vclProTooLong',fps:'vclProSpec',resolution:'vclProSpec',format:'vclProSpec',
    limit:'vclProLimit',unavailable:'vclProUnavailable',upload:'vclProUploadFail',not_uploaded:'vclProUploadFail'};
  function proErrKey(code){ var c=String(code||''); return Object.prototype.hasOwnProperty.call(PRO_ERR,c)?PRO_ERR[c]:'vclProFail'; }
  try{ window.__vmkPro={estimate:proEstimate,check:proCheck,errKey:proErrKey}; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:43'); /* guard-ok — بيئة بلا window */ }
  var M=document.getElementById('videoMakerModal'); if(!M) return;
  var G=[['videoMakerMode','card'],['videoMakerStyle','pill'],['videoMakerDuration','pill'],['videoMakerRatio','pill']];
  /* v-vmk-price-src (تدقيق ١٨ أكتوبر، الدفعة ١ «الفلوس»: «الرقم اللي على الزر لازم يطلع من نفس المصدر اللي يخصم، ويطابقه بالضبط»):
     كان هنا جدول ثابت (فيديو AI ٦٠، السينمائيّ والممثّل ٤٠٠) والخادم يخصم من COSTS (٥٥ و١٧٥) — الزرّ ٦٠ والتأكيد ٥٥. الآن سعر المشهد
     من COSTS نفسه (window.__omranCosts من /api/points) × عدد المشاهد التي يطلبها هذا الاختيار فعلًا (app-11-video.js): «20 (مشهدين)»
     مشهدان، و«فيلم متكامل» ٣ (والمالك ٥)، وغيرها مشهد واحد — وكلّ مشهد يسأل تأكيد سعره هو. قبل وصول الأسعار لا رقم أبدًا (لا تخمين). */
  var PTS_KEY={runway:'runway_video',hybrid:'runway_video',veo:'veo_video',actor:'veo_video',minimax:'minimax_video',omni:'omni_video'};
  var costsAskedAt=0;
  function ownerNow(){ try{ return String((typeof authGet==='function'&&authGet('aiapp_username'))||'').trim().toLowerCase()==='omran'; }catch(e){ return false; } }
  function scenesFor(mode){
    var d=(document.getElementById('videoMakerDuration')||{}).value;
    if(d==='film') return (mode==='runway'||mode==='veo')?(ownerNow()?5:3):0;
    if(d==='longMinutes') return 0; /* عدد مشاهده من السكربت — لا يُعرف قبله (والمالك وحده) */
    return (d==='long20'&&mode==='runway')?2:1;
  }
  /* {total, per, n} أو null حين لا سعر معروفًا؛ القوالب مجّانيّة (total=0) */
  function priceOf(mode){
    if(mode==='canvas') return {total:0,per:0,n:1};
    var c=window.__omranCosts, k=PTS_KEY[mode], n=scenesFor(mode);
    if(!c||!k||typeof c[k]!=='number'||!n) return null;
    return {total:c[k]*n,per:c[k],n:n};
  }
  function priceLabel(p){
    if(!p) return '';
    if(!p.total) return ar()?'مجاني':'Free';
    return p.total+(ar()?' نقطة':' pts')+(p.n>1?(' · '+p.n+'×'+p.per):'');
  }
  function ensureCosts(){
    if(window.__omranCosts||typeof window.omranLoadCosts!=='function'||Date.now()-costsAskedAt<30000) return;
    costsAskedAt=Date.now();
    window.omranLoadCosts().then(function(c){ if(c) sync(); });
  }
  var ICO=/^([\u200d\ufe0f\u2190-\u21ff\u2300-\u27bf\ud800-\udfff]+)\s*/;
  function ar(){var h=document.documentElement;return (h.lang||'ar').indexOf('ar')===0||h.dir==='rtl';}
  function uiLang(){ return String(document.documentElement.lang||'ar').split('-')[0].toLowerCase(); } /* لغة الواجهة بالضبط: ar() صادقة للأردو أيضًا (rtl) — v-vmk-sample-lang */
  function on(){return true;} /* v-vmk-mobile: نفس استوديو الكمبيوتر على الهاتف */
  function id(x){return document.getElementById(x);}
  /* v-vmk-clean (المالك: «شيل الأيقونات… اسم رسميّ بلا إيموجي»): تنظيف نصوص النافذة من الإيموجي عند العرض بدل تعديل ١٤ قاموسًا */
  var EMO; try{ EMO=new RegExp('\\u200D(?=\\p{Extended_Pictographic})|(?![\\u00A9\\u00AE\\u2122])\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\uFE0F|\\u20E3','gu'); }catch(e){ EMO=/[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF\uFE0F\u20E3]/g; /* v-es-floor: محرّك قديم — تقريب بلا خصائص يونيكود */ }
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
    var rs=id('videoMakerResult');
    if(rs){
      stage.appendChild(rs);
      /* v-vmk-res-mode: وسم الوضع يُكتب عند «إنشاء» (app-11) فيُعاد الحساب فورًا — لا صنف قديم يخفي النتيجة الجديدة في وضعها؛ وautoplay في قسم آخر يتوقّف */
      try{ new MutationObserver(syncResult).observe(rs,{attributes:true,attributeFilter:['data-mode']}); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:110'); /* guard-ok — بلا مراقب يُحسب عند كلّ تبديل */ }
      rs.addEventListener('play',syncResult);
    }
    /* عارض قسم «تحسين فيديو» عنصر مستقلّ: لا يكتب فوق نتيجة المولّد ولا يظهر خارج قسمه */
    var clv=document.createElement('video'); clv.id='vmkClView'; clv.controls=true; clv.playsInline=true; clv.style.display='none'; stage.appendChild(clv);
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
      var cl=document.createElement('div'); cl.id='vmkClean'; cl.className='vmk-clean'; main.insertBefore(cl,main.firstChild);
      var gb=id('videoMakerGenerateBtn'); if(gb) gb.addEventListener('click',compose,true);
    }
    card.dataset.vmk='1';
  }
  /* ═══ v-vmk-sections: شريط الأقسام (الترندات + الأوضاع) ═══ */
  /* v-five-sections (المالك ٢٨ أكتوبر: «اخلي 5 فقط… الترندات، كتابة وصوت، تحسين… وانته قولي شو الاثنين الافضل»): للزبون خمسة —
     الترندات · تعديل الفيديو (video-edit يُدخله ثانيًا) · سينمائي · فيديو سريع · تحسين الجودة؛ «جودة عالية» و«بدون ذكاء» و«ممثل يتكلم» للمالك */
  var TABS=['trend','veo','minimax','runway','actor','canvas','clean']; /* v-video-modes-by-result: omni وhybrid خرجا منها */
  var tab='trend';
  /* v-owner-modes (المالك ١٧ أكتوبر: «أخفي الثلاثة وخلها لي المالك فقط»): «فيديو اقتصادي» و«فيديو سينمائي» (Omni) و«دمج الاثنين»
     تكرّر غيرها وتلخبط الزبون — تختفي لغير المالك (تبويب وبطاقة وخيار)، ويرجع وضعه إلى «فيديو AI» لو كان عليها */
  var OWNER_MODES={runway:1,canvas:1,omni:1,hybrid:1,actor:1}; /* v-video-durations: «ممثل يتكلم» للمالك حتّى تنجح تجربته · v-five-sections: «جودة عالية» (بلا صوت وبلا ربح بعشر ثوانٍ) و«بدون ذكاء» للمالك، و«فيديو سريع» للجميع */
  /* v-owner-modes: «ممثل يتكلم — لهجة إماراتية» كانت صورته وجوهًا لا تشبه أهل الإمارات — رجل بالغترة من صور التطبيق (أعلى الصورة) */
  var TAB_ART={actor:'/assets/studio/options/heritage-emirati.webp'};
  /* v-owner-five (المالك ٢٨ أكتوبر: «خل لي انا مخرج التطبيق 5 بس الحينه مؤقت»): المالك مؤقّتًا يرى ما يراه الزبون — الخمسة و«مخرج التطبيق» وحده؛
     الأوضاع الثلاثة مخفيّة عنه أيضًا (تبويب وخيار) وكودها باقٍ. OWNER_EXTRA=true يعيدها له */
  var OWNER_EXTRA=false;
  function ownExtra(){ return OWNER_EXTRA&&drOwner(); }
  function tabsFor(){ var own=ownExtra(); return TABS.filter(function(v){ return own||!OWNER_MODES[v]; }); }
  function guardModes(){
    var sel=id('videoMakerMode'), own=ownExtra(); if(!sel) return;
    [].slice.call(sel.options).forEach(function(o){ o.hidden=o.disabled=!own&&!!OWNER_MODES[o.value]; });
    if(!own&&OWNER_MODES[sel.value]){ sel.value='minimax'; sel.dispatchEvent(new Event('change')); } /* v-five-sections: افتراضيّ الزبون «فيديو سريع» */
  }
  /* v-vmk-tab-warm (تدقيق ١٨–١٩ أكتوبر، لقطة ٠٠١): صور التبويبات كانت فارغة ٢–٣ ثوانٍ عند الفتح — كسولة وتُنشأ لحظة الفتح بينما تبدأ
     شبكة الترندات ٤٥ صورة معها. رابط واحد يرسم به التبويب ويسخّن به الذاكرة عند مرور المؤشّر أو اللمس أو التركيز على زرّ الصانع
     (مرّة؛ لا تحميل لمن لا يقترب من الصانع) */
  function tabArt(v){ return TAB_ART[v]||'/assets/videos/tabs/'+v+'.jpg?v=2'; }
  /* v-tab-video (المالك ٢٨ أكتوبر: «الي اريده فيديو مصغر نفس المكان بجوده عاليه مش كانفا»): مربّع القسم فيديو قصير صامت يتكرّر حين يُرفع
     /media/samples/tab-<القسم>.mp4 (index.json «tab-<القسم>»، و«tab-edit» لتعديل الفيديو)، وصورته الحاليّة غلافه؛ بلا ملفّ تبقى الصورة
     كما كانت، ومع «تقليل الحركة» الصورة وحدها. */
  function tabVid(k){ return VIDEOS['tab-'+k] ? '/media/samples/tab-'+k+'.mp4' : ''; }
  function tabMedia(k,poster){
    var src=tabVid(k), rm=false, el;
    if(src) poster='/media/samples/tab-'+k+'.jpg'; /* غلاف من المقطع نفسه (لقطته الأولى) — ومع «تقليل الحركة» هو الصورة */
    try{ rm=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:172'); /* guard-ok — بلا matchMedia = حركة عاديّة */ }
    if(src&&!rm){
      el=document.createElement('video'); el.muted=true; el.defaultMuted=true; el.loop=true; el.autoplay=true; el.playsInline=true;
      el.setAttribute('muted',''); el.setAttribute('playsinline',''); el.setAttribute('aria-hidden','true'); el.preload='auto'; el.poster=poster; el.src=src;
      try{ var pr=el.play(); if(pr&&pr.catch) pr.catch(function(){ /* guard-ok — التشغيل التلقائيّ محجوب: يبقى الغلاف */ }); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:176'); /* guard-ok — كذلك */ }
    } else { el=document.createElement('img'); el.alt=''; el.loading='eager'; el.fetchPriority='high'; el.src=poster; }
    el.className='vmk-tab-img'; return el;
  }
  window.__vmkTabMedia=tabMedia; /* video-edit.js: مربّع «تعديل الفيديو» */
  var tabsWarm=false;
  function warmTabs(){
    if(tabsWarm) return; tabsWarm=true;
    tabsFor().forEach(function(v){ try{ var im=new Image(); im.src=tabArt(v); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:184'); /* guard-ok — التسخين تحسين، والتبويب يطلب صورته بنفسه */ } });
  }
  var bvm=id('btnVideoMaker'); if(bvm) ['pointerenter','pointerdown','focus'].forEach(function(ev){ bvm.addEventListener(ev,warmTabs); });
  /* ملفّات النماذج الجاهزة: '<الوضع>-<١..٣>': true حين يُرفع /media/samples/<الوضع>-<رقم>.mp4 — بلا ملفّ تظهر البطاقة بنصّ المثال فقط */
  var VIDEOS={};
  /* فيديو تعليميّ حقيقيّ مسجَّل من شاشة الصانع نفسه (scripts/video-tutorial.mjs) — عربيّ، والباقي بالإنجليزيّة */
  /* قائمة النماذج المولَّدة (scripts/video-samples.mjs يكتبها): {"omni-1":true,…} — بلا قائمة لا فيديو وتبقى البطاقة نصًّا */
  var manifestAsked=false;
  function loadManifest(){
    if(manifestAsked) return; manifestAsked=true;
    fetch('/media/samples/index.json',{cache:'no-cache'}).then(function(r){ return r.ok?r.json():{}; }).then(function(j){
      if(j&&typeof j==='object'&&Object.keys(j).length){ VIDEOS=j; sync(); if(Object.keys(j).some(function(k){ return k.indexOf('tab-')===0; })) buildTabs(); } /* v-tab-video: المربّعات تُبنى ثانيةً بفيديوهاتها */
    }).catch(function(){ /* guard-ok — لا قائمة = لا فيديوهات نماذج */ });
  }
  /* v-tab-tut (المالك ١٧ أكتوبر «حط الفيديوين»): «كيف تسوي فيديو» من محرّك القسم نفسه بصوت الراوي — '<الوضع>-tut' في index.json
     يغلب التعليميّ العامّ لذلك القسم (بالعربيّ فقط، فالراوي عربيّ)؛ بلا ملفّ أو بالإنجليزيّ يبقى العامّ */
  function tutUrl(m){ return (m&&VIDEOS[m+'-tut']&&ar())?'/media/samples/'+m+'-tut.mp4':'/media/samples/tutorial-'+(ar()?'ar':'en')+'.mp4'; }
  function openPlayer(src){
    var lb=document.createElement('div'); lb.className='vmk-lb';
    var vd=document.createElement('video'); vd.src=src; vd.controls=true; vd.autoplay=true; vd.playsInline=true;
    var x=document.createElement('button'); x.type='button'; x.className='vmk-lb-x'; x.textContent='×'; x.setAttribute('aria-label',L('vcRemove'));
    /* v-back-layers (تدقيق ١٨–١٩ أكتوبر: «Esc يسكّر فيديو المثال ويسكّر الصانع كلّه معاه»): مستمع الفقاعة هنا كان يأتي بعد
       معالج Esc العامّ (app-05-swipe-back) فيُغلق الصانع أوّلًا. الالتقاط + إيقاف الانتشار: Esc يغلق المشغّل وحده. */
    function close(){ try{ vd.pause(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:207'); /* guard-ok — العنصر يُزال */ } document.removeEventListener('keydown',esc,true); lb.remove(); }
    function esc(e){ if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); close(); } }
    lb.addEventListener('click',function(e){ if(e.target!==vd) close(); }); x.addEventListener('click',close);
    document.addEventListener('keydown',esc,true);
    lb.appendChild(vd); lb.appendChild(x); document.body.appendChild(lb);
  }
  var HUE={canvas:205,runway:28,minimax:165,omni:42,hybrid:262,veo:8,actor:335};
  var MAXCH=3, chars=[], lastBlock='';
  function Cap(m){ return m.charAt(0).toUpperCase()+m.slice(1); }
  function setVal(el,val){ if(!el) return; el.value=val; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
  function tabLabel(v){
    if(v==='trend') return L('videoTabTrends');
    if(v==='clean') return L('videoTabClean');
    if(v==='director') return L('vdTab')||'مخرج التطبيق';
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
    /* v-app-director: قسم «مخرج التطبيق» آخر الشريط للمالك وحده — لغير المالك لا زرّ ولا لوحة في DOM */
    tabsFor().concat(drOwner()?['director']:[]).forEach(function(v){
      var b=document.createElement('button'); b.type='button'; b.className='vmk-tab'; b.dataset.tab=v;
      b.setAttribute('role','tab'); b.setAttribute('aria-selected',String(v===tab));
      /* v-vmk-tab-art (المالك ١١ أكتوبر بلوحة التبويبات: «شوف الصور مقاس واحد كلهم»): صورة مربّعة واحدة المقاس فوق اسم كلّ قسم */
      /* v-app-director: قسم المخرج بلا صورة (طلب المالك «بدون أيقونات») — لا <img> فلا أيقونة مكسورة بجانب صور الأقسام */
      if(v==='director'){ var dlb=document.createElement('span'); dlb.className='vmk-tab-lbl'; dlb.textContent=tabLabel(v); b.classList.add('vmk-tab-noimg'); b.appendChild(dlb); tb.appendChild(b); return; }
      var im=tabMedia(v,tabArt(v)); if(TAB_ART[v]) im.style.objectPosition='50% 0'; /* v-vmk-tab-warm: ظاهرة دائمًا عند الفتح — لا كسل · v-tab-video: أو فيديو القسم */
      var lb=document.createElement('span'); lb.className='vmk-tab-lbl'; lb.textContent=tabLabel(v);
      b.appendChild(im); b.appendChild(lb); tb.appendChild(b);
    });
    card.classList.toggle('vmk-tab-trend',tab==='trend');
    card.classList.toggle('vmk-tab-clean',tab==='clean');
    card.classList.toggle('vmk-tab-director',tab==='director');
  }
  function setTab(v){
    if(tabsFor().indexOf(v)<0&&!(v==='director'&&drOwner())) return; tab=v;
    /* v-vmk-stale-status (تدقيق ١٨–١٩ أكتوبر): خطأ «سينمائي» («تعذّر توليد الفيديو الآن») كان يبقى تحت المعاينة بعد التبديل إلى قسم آخر.
       يُمسح سطر الحالة ما لم يكن توليد جاريًا — الزرّ معطَّل طواله، وسطر التقدّم تقرؤه بطاقة الانتظار (app-34) */
    var gb=id('videoMakerGenerateBtn'), st=id('videoMakerStatus');
    if(st&&!(gb&&gb.disabled)){ st.textContent=''; st.style.display='none'; }
    var sel=(v==='director')?null:id('videoMakerMode'); /* v-app-director: المخرج لا يمسّ الوضع */
    if(v!=='trend'&&v!=='clean'&&sel&&sel.value!==v){ sel.value=v; sel.dispatchEvent(new Event('change')); } /* «تحسين فيديو» لا يمسّ الوضع: زرّ الإنشاء المدفوع مخفيّ فيه */
    buildTabs(); sync(); scrub();
  }
  function syncSamples(){
    var box=id('vmkSamples'); if(!box) return;
    var md=(id('videoMakerMode')||{}).value||''; box.innerHTML='';
    box.dataset.mode=md; /* v-vmk-sample-play: ملصقات «القوالب» نصّها في وسط الإطار — الدائرة تنزل تحته (modules.css) */
    if(tab==='trend'||!md) return;
    var c=Cap(md), keys=['videoIdea'+c] /* v-vmk-light: بطاقتان — «كيف تسوي فيديو» ثمّ فيديو الجودة */;
    var tt0=L('vcTutorial');
    if(tt0){
      var te=document.createElement('div'); te.className='vmk-sm vmk-sm-tut'; te.setAttribute('role','button'); te.tabIndex=0;
      var tp=document.createElement('div'); tp.className='vmk-sm-p'; tp.style.backgroundImage='url('+tutUrl(md).replace('.mp4','.jpg')+')';
      var tpl=document.createElement('span'); tpl.className='vmk-sm-play'; tp.appendChild(tpl);
      var tb=document.createElement('b'); tb.textContent=tt0; te.classList.add('has-vid'); te.appendChild(tp); te.appendChild(tb);
      te.setAttribute('aria-label',tt0); te.title=tt0; /* v-photo-only: الشريط تحت الصورة مخفيّ — العنوان تلميح */
      var tgo=function(){ openPlayer(tutUrl(md)); };
      te.addEventListener('click',tgo); te.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); tgo(); } });
      box.appendChild(te);
    }
    box.style.setProperty('--h',String(HUE[md]==null?35:HUE[md]));
    /* v-vmk-sample-lang (تدقيق ١٨–١٩ أكتوبر، لقطة ٠١٨): مثال «القوالب» بالإنجليزيّ أظهر عنوانًا وملصقًا عربيّين — عنوان index.json يغلب
       L(k) والنصّ محروق في الفيديو. العنوان المرفوع عربيّ فيُعرض بالعربيّة وحدها، وفيديو بلغة غير لغة الواجهة ("lang" في index.json)
       تحلّ محلّه بطاقة المثال النصّيّة بلغة الواجهة. فيديو بلا نصّ (الصقر) يبقى لكلّ اللغات. */
    var ul=uiLang();
    keys.forEach(function(k,i){
      var vm=VIDEOS[md+'-'+(i+1)]; if(vm&&vm.lang&&vm.lang!==ul) vm=null;
      var tx=(vm&&vm.title&&ul==='ar')?vm.title:L(k); if(!tx) return; /* عنوان الفيديو المرفوع (من <الاسم>.txt) يغلب المثال بالعربيّة */
      var el=document.createElement('div'); el.className='vmk-sm'; el.setAttribute('role','button'); el.tabIndex=0;
      var pv=document.createElement('div'); pv.className='vmk-sm-p'; pv.style.setProperty('--i',String(i));
      var vsrc='';
      if(vm){
        vsrc='/media/samples/'+md+'-'+(i+1)+'.mp4';
        var vd=document.createElement('video'); vd.muted=true; vd.loop=true; vd.playsInline=true; vd.preload='none'; vd.poster='/media/samples/'+md+'-'+(i+1)+'.jpg'; vd.src=vsrc;
        /* v-vmk-play-catch (تدقيق ١٨–١٩ أكتوبر): مغادرة البطاقة أثناء التحميل ترفض وعد play() — كان بلا معالج فصار خطأ صفحة */
        el.addEventListener('mouseenter',function(){ try{ var pp=vd.play(); if(pp&&typeof pp.catch==='function') pp.catch(function(){ /* guard-ok — الإيقاف قبل بدء التشغيل ليس خطأ */ }); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:294'); /* guard-ok — المتصفّح قد يمنع التشغيل التلقائي */ } });
        el.addEventListener('mouseleave',function(){ try{ vd.pause(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:295'); /* guard-ok — لا أثر */ } });
        pv.appendChild(vd);
      }
      if(vm){ var pl=document.createElement('span'); pl.className='vmk-sm-play'; pv.appendChild(pl); }
      var tt=document.createElement('b'); tt.textContent=tx;
      if(vsrc){ el.classList.add('has-vid'); el.appendChild(pv); el.appendChild(tt); el.setAttribute('aria-label',tx); el.title=tx; } else { pv.appendChild(tt); el.appendChild(pv); }
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
  /* v-video-durations (المالك ٢٧ أكتوبر: «شيل الازرار الي مافيها التوقيت»): كلّ وضع يُظهر المدد التي يصنعها محرّكه فعلًا — كانت
     الحبّات واحدة للكلّ: «سريع» يعطي ٦ ثوانٍ لكلّ زرّ، و«٢٠ ثانية» و«فيلم» و«طويل» لا تعمل خارج «جودة عالية»، و«إعلان/ريلز» تعد بسرد
     لا يُطبَّق في «سريع» و«سينمائي». الممثّل مدّته كلامه فتختفي المدّة كلّها. 'owner' = للمالك وحده (فيلم «سينمائي»). */
  var DUR_OK={
    canvas:{'5':1,'8':1,'10':1,long20:1,adspot:1,reels:1},
    runway:{'5':1,'8':1,'10':1,long20:1,film:1,adspot:1,reels:1,longMinutes:1},
    minimax:{'5':1,'8':1,'10':1},
    veo:{'5':1,'8':1,'10':1,film:'owner'},
    actor:{}
  };
  function durOk(mode,v){ var m=DUR_OK[mode]; if(!m) return true; var x=m[v]; return x==='owner'?ownerNow():!!x; }
  function syncDurations(){
    var du=id('videoMakerDuration'); if(!du) return;
    var md=(id('videoMakerMode')||{}).value||'', col=du.parentElement;
    var pills=[].slice.call(M.querySelectorAll('.vmk-pill[data-v]')).filter(function(c){ var g=c.parentNode; return g&&(g.previousElementSibling===du||g.parentNode&&g.parentNode.id==='vmkMoreDur'); });
    pills.forEach(function(c){ var off=!durOk(md,c.dataset.v); c.hidden=off; c.style.display=off?'none':''; }); /* display صريح: صنف الحبّة يغلب [hidden] */
    var none=!!(DUR_OK[md]&&!Object.keys(DUR_OK[md]).length);
    if(col) col.style.display=none?'none':'';
    /* مراجعة ٢٧ أكتوبر: الممثّل بلا مدّة — قيمة «فيلم/٢٠/طويل» باقية من قسم آخر كانت توقف الإنشاء ببوّابة الفيلم والعمود مخفيّ؛ ترجع ٥ */
    if(none&&!BASIC_DUR[du.value]){ du.value='5'; du.dispatchEvent(new Event('change')); return; }
    if(!none&&!durOk(md,du.value)){
      var first=[].slice.call(du.options).map(function(o){ return o.value; }).filter(function(v){ return durOk(md,v); })[0];
      if(first&&first!==du.value){ du.value=first; du.dispatchEvent(new Event('change')); }
    }
  }
  function simplify(){
    var main=M.querySelector('.vmk-main'); if(!main) return;
    var more=id('vmkMore');
    if(!more){
      more=document.createElement('details'); more.id='vmkMore'; more.className='vmk-more';
      more.innerHTML='<summary></summary><div class="vmk-more-b"></div>';
      main.appendChild(more);
    }
    /* v-vmk-light (المالك ١٧ أكتوبر: «اريد ترتيب ثاني خفيف… اريد شي سهل»): الوصف ← مساعد الكتابة مفتوح ← المدّة والشكل ←
       زرّ الإنشاء ← «خيارات إضافية» مطويّة. والأمثلة («كيف تسوي فيديو» ثمّ فيديو الجودة) تحت المعاينة على الحاسوب
       (المالك: «خلها تحت الفيديوات توليد الفيديو») — وعلى الجوّال المعاينة فوق فتنزل الأمثلة آخر النموذج */
    var gob=id('videoMakerGenerateBtn'); if(gob&&gob.parentNode===main&&more.previousElementSibling!==gob) main.insertBefore(more,gob.nextSibling);
    var smp=id('vmkSamples'), sdx=M.querySelector('.vmk-side'), nrw=!!(window.matchMedia&&window.matchMedia('(max-width:860px)').matches), hst=nrw?main:sdx;
    if(smp&&hst&&hst.lastElementChild!==smp) hst.appendChild(smp);
    var body=more.querySelector('.vmk-more-b');
    more.querySelector('summary').textContent=L('vcMore');
    var st=id('videoMakerStyle'), stBox=st&&st.parentElement;
    var nt=id('videoMakerNarrationToggle'), ntLab=nt&&nt.closest('label');
    [id('vmkChars'),stBox,id('videoMakerWrapRow'),id('videoMakerSignatureRow'),id('videoMakerLongMinutesRow'),
     ntLab,id('videoMakerVoiceGenderRow'),id('videoMakerNarrationRow'),M.querySelector('details.vmk-adv')].forEach(function(e){
      if(e&&e.parentNode!==body) body.appendChild(e);
    });
    /* v-vmk-light: «خيارات متقدّمة» صارت فارغة بعد نقل محتواها (وكانت تُظهر نصّ لغة أخرى) — تختفي ما دامت فارغة */
    var adv=M.querySelector('details.vmk-adv'); if(adv) adv.hidden=adv.children.length<=1;
    /* صورة البطل ظاهرة تحت الوصف مباشرة (أمر المالك): بطاقة كبيرة بزرّ رفع واضح، لا مدفونة في «خيارات إضافية» */
    var hr=id('videoMakerHeroRow'), pw=id('videoMakerPrompt'), prw=pw&&pw.parentElement;
    if(hr&&prw&&hr.previousElementSibling!==prw){
      prw.parentNode.insertBefore(hr,prw.nextSibling);
      var hn=id('videoMakerHeroVeoNote'); if(hn) hr.appendChild(hn);
    }
    if(hr){ var hd=hr.querySelector('div'), np=hr.querySelector('p[data-i18n="videoMakerHeroNote"]'); if(hd&&np&&np.parentNode!==hd) hd.appendChild(np); }
    /* v-vmk-quality (المالك: «أريد خاصّيّة الوضوح عندي في التطبيق»): «جودة أعلى» كان مدفونًا في «خيارات متقدّمة» — يظهر الآن مفتاحًا واضحًا فوق المدّة،
       في الأوضاع التي يؤثّر فيها فقط (Runway ترقية 2K، Veo النموذج الكامل، الاقتصاديّ 1080، السينمائيّ 1080) */
    var qr=id('videoMakerQualityRow'), r3=M.querySelector('.vmk-row3');
    if(qr&&r3&&qr.nextElementSibling!==r3) r3.parentNode.insertBefore(qr,r3);
    if(qr){
      var qm=(id('videoMakerMode')||{}).value, paid=!!{owner:1,vip:1,basic:1,pro:1,max:1}[String(window.__omranPlan||'').toLowerCase()];
      qr.classList.toggle('vmk-q-off',!paid||!{runway:1,minimax:1,omni:1,veo:1}[qm]);
      var qt=id('videoMakerQualityToggle'); if(qt&&!paid&&qt.checked) qt.checked=false; /* v-quality-gate: للمشتركين والمالك فقط */
    }
    var du=id('videoMakerDuration'), g=du&&du.nextElementSibling, ex=id('vmkMoreDur');
    if(g&&g.classList.contains('vmk-g')){
      if(!ex){
        ex=document.createElement('div'); ex.id='vmkMoreDur'; ex.className='vmk-more-dur';
        ex.innerHTML='<label></label><div class="vmk-g vmk-pills"></div>'; body.insertBefore(ex,body.firstChild);
      }
      ex.querySelector('label').textContent=L('videoMakerDurationLabel')||'';
      /* v-vmk-more-dur (فحص الإنتاج ١٨ أكتوبر: بقيّة المدد و«طويل (دقائق)» للمالك لا تظهر أبدًا): sync() تنادي simplify() بعد كلّ تغيير
         (منذ v-vmk-quality)، وكان الصندوق يُفرَّغ في كلّ نداء بعد أن نُقلت إليه الحبّات فلا يبقى في المجموعة ما يُنقل — يُفرَّغ ويُملأ فقط
         حين أعادت group() بناء المجموعة (فتح النافذة)، وإلّا تبقى حبّاته كما هي */
      var box=ex.querySelector('.vmk-g');
      if([].some.call(g.children,function(c){ return !BASIC_DUR[c.dataset.v]; })){
        box.innerHTML='';
        [].slice.call(g.children).forEach(function(c){ if(!BASIC_DUR[c.dataset.v]) box.appendChild(c); });
      }
      syncDurations();
      ex.style.display=[].some.call(box.children,function(c){ return c.style.display!=='none'; })?'':'none';
    }
  }
  /* ═══ v-app-director (المالك: «سوّ لي أو عطني فكرة فيديو عن أنماط الصور ويعطيني فيديو عنه كامل… فيديو عن التطبيق ١٠ دقائق مع مها أو
     عبدالله وبأيّ لغة أريدها» — «نفس مكان الفيديوهات، مخرج التطبيق، بدون أيقونات، فقط للمالك»): قسم للمالك وحده يأخذ طلبًا بالكلام
     ويسلّم فيديو كاملًا عن التطبيق. المتصفّح يقود المسار: الخطّة من الخادم (action=app-director-plan) ← نماذج الأنماط بمسار الصور القائم
     ← التعليق بصوت مها/عبدالله (action=tts) ← رمز مهمّة (action=app-director-token) ← جسر Railway يصوّر الشاشات ويدمج (POST /render)
     ← استطلاع كلّ ٣ ثوانٍ ← معاينة وتحميل وحفظ. لا سرّ ولا عنوان جسر في العميل: يعودان مع الرمز. ═══ */
  function drOwner(){ try{ return String((typeof authGet==='function')?(authGet('aiapp_username')||''):(localStorage.getItem('aiapp_username')||'')).trim().toLowerCase()==='omran'; }catch(e){ return false; } }
  var DR_LANGS=[['ar','العربية'],['en','English'],['fr','Français'],['es','Español'],['tr','Türkçe'],['ru','Русский'],['zh','中文'],['hi','हिन्दी'],['ur','اردو'],['bn','বাংলা'],['ne','नेपाली'],['ml','മലയാളം'],['id','Bahasa Indonesia'],['fil','Filipino']];
  var DR={busy:false,run:0,ref:'',refMime:'',out:'',lang:''};
  function drTok(){ return (typeof authGet==='function')?(authGet('aiapp_auth_token')||''):''; }
  function drUiLang(){ try{ return localStorage.getItem('aiapp_lang')||'ar'; }catch(e){ return 'ar'; } }
  function drT(k,vars){ var v=L(k)||k; Object.keys(vars||{}).forEach(function(x){ v=v.split('{'+x+'}').join(String(vars[x])); }); return v; }
  function buildDirector(){
    var card=M.firstElementChild; if(!card||!drOwner()||id('vmkDirector')) return;
    var box=document.createElement('div'); box.id='vmkDirector'; box.className='vmk-dir';
    box.innerHTML='<div class="vmk-dir-head"><b></b><p></p></div>'
      +'<textarea id="vdReq" rows="3" maxlength="3000"></textarea>'
      +'<div class="vmk-dir-row"><label><span></span><select id="vdLang"></select></label><label><span></span><select id="vdSpeaker"><option value="female"></option><option value="male"></option></select></label><label><span></span><select id="vdMin"></select></label><label><span></span><select id="vdVoice"><option value="on"></option><option value="off"></option></select></label><label class="vmk-dir-kind"><span></span><select id="vdKind"><option value="app"></option><option value="story"></option></select></label></div>'
      +'<div class="vmk-tl" id="vdTl"></div>' /* v-director-timed: محرّر «بتوقيتي» — يظهر بالنوع الثالث وحده */
      +'<label class="vmk-dir-ref"><input type="file" accept="image/*" id="vdRef"><img id="vdRefImg" alt="" hidden><span></span></label>'
      +'<button type="button" id="vdGo"></button>'
      +'<div class="vmk-dir-stage" id="vdStage" hidden><div class="vmk-dir-stage-bg"></div><img id="vdStageImg" alt=""><div class="vmk-dir-stage-reel"></div>'
        +'<div class="vmk-dir-stage-cap" id="vdStageCap"></div><div class="vmk-dir-stage-hud"><span id="vdStageStep"></span><b id="vdStageTime">0:00</b></div><div class="vmk-dir-stage-bar"><i id="vdStageBar"></i></div></div>'
      +'<ol class="vmk-dir-steps" id="vdSteps">'+['plan','voice','samples','shots','join'].map(function(k){ return '<li data-step="'+k+'"><b></b><small></small><i class="vmk-dir-log" dir="ltr"></i></li>'; }).join('')+'</ol>'
      +'<p class="vmk-dir-msg" id="vdMsg"></p>'
      /* v-director-upload: صندوق «ارفع فيديو جاهز» — بشكل صندوق «تحسين الفيديو»، والفيديو المرفوع يأخذ مكان فيديو المخرج تحته */
      +'<label class="vmk-cl-drop vmk-dir-up" id="vdUp"><input type="file" accept="video/*" id="vdUpFile"><span class="vmk-cl-plus">+</span><span class="vmk-cl-pick"></span><small class="vmk-cl-lim"></small></label>'
      +'<label class="vmk-dir-ec" id="vdEcBox"><input type="checkbox" id="vdEc"><span></span></label>' /* v-director-endcard: «أضف باركود التطبيق في آخر الفيديو» */
      +'<div class="vmk-dir-er" id="vdErRow" hidden><button type="button" id="vdErBtn"></button><button type="button" id="vdErUndo" hidden></button><small class="vmk-er-note" id="vdErNote"></small></div>' /* v-director-erase */
      +'<p class="vmk-dir-msg" id="vdUpMsg"></p>'
      +'<div class="vmk-dir-res" id="vdRes"><video id="vdVideo" controls playsinline></video>'
        /* v-director-erase: محرّر المربّعات — لقطة من الأصل يُرسم عليها، وشريط لاختيار اللقطة */
        +'<div class="vmk-er" id="vdEr" hidden><p class="vmk-er-hint" id="vdErHint"></p><canvas id="vdErCv" width="16" height="9"></canvas><input type="range" id="vdErT" min="0" max="1000" value="0">'
        +'<div class="vmk-er-acts"><button type="button" class="vmk-er-go" id="vdErFree"></button><button type="button" class="vmk-er-go" id="vdErAi"></button><button type="button" id="vdErClear"></button><button type="button" id="vdErClose"></button></div></div>'
        +'<div class="vmk-dir-acts"><a class="vmk-dir-dl" id="vdDl" download="omran-app-director.mp4"></a><button type="button" class="vmk-dir-dl vmk-pub-btn" id="vdPubBtn"></button></div>'
        /* v-director-publish: لوحة «انشر في حساباتي» — النصّ والمنصّات الموصولة ثمّ «انشر الآن» */
        +'<div class="vmk-pub" id="vdPub" hidden><label class="vmk-pub-cap"><span></span><textarea id="vdPubCap" rows="3" maxlength="2200"></textarea></label>'
        +'<div class="vmk-pub-plats" id="vdPubPlats"></div><button type="button" class="vmk-pub-go" id="vdPubGo"></button><p class="vmk-pub-msg" id="vdPubMsg"></p><ul class="vmk-pub-res" id="vdPubRes"></ul></div></div>';
    var tabs=id('vmkTabs'); if(tabs&&tabs.parentNode===card) card.insertBefore(box,tabs.nextSibling); else card.appendChild(box);
    var ls=box.querySelector('#vdLang'); DR_LANGS.forEach(function(l){ var o=document.createElement('option'); o.value=l[0]; o.textContent=l[1]; ls.appendChild(o); });
    ls.value=DR_LANGS.some(function(l){ return l[0]===drUiLang(); })?drUiLang():'ar';
    var ms=box.querySelector('#vdMin'); for(var i=1;i<=10;i++){ var o=document.createElement('option'); o.value=String(i); o.textContent=String(i); ms.appendChild(o); } ms.value='2';
    box.querySelector('#vdRef').addEventListener('change',function(e){ var f=e.target.files&&e.target.files[0]; if(f) drPickRef(f); });
    box.querySelector('#vdGo').addEventListener('click',drRun);
    box.querySelector('#vdReq').addEventListener('keydown',function(e){ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); drRun(); } });
    box.querySelector('#vdVoice').addEventListener('change',syncDirector); /* بدون صوت: اختيار المتحدّث بلا معنى فيُعطَّل */
    var kT=document.createElement('option'); kT.value='timed'; box.querySelector('#vdKind').appendChild(kT); /* v-director-timed: النوع الثالث «بتوقيتي» */
    tlInit(box.querySelector('#vdTl'));
    box.querySelector('#vdPubBtn').addEventListener('click',pbToggle); box.querySelector('#vdPubGo').addEventListener('click',pbGo); /* v-director-publish */
    upBind(box.querySelector('#vdUp'),box.querySelector('#vdUpFile')); /* v-director-upload */
    box.querySelector('#vdEc').addEventListener('change',function(e){ ecToggle(!!e.target.checked); }); /* v-director-endcard */
    erBind(box); /* v-director-erase */
    box.querySelector('#vdKind').addEventListener('change',syncDirector); /* v-director-story: القصّة حدّها ٣٠٠٠ حرف وبلا مدّة ولا صورة مرجع */
  }
  function drStory(){ return ((id('vdKind')||{}).value==='story'); }
  /* v-director-timed (المالك ٧ نوفمبر: «اريده الشخص نفسه يحط التوقيت مع الملاحظات لين ٥ دقائق»، ثمّ «ابدأ… في المخرج» واختار «فيديو AI»):
     النوع الثالث «بتوقيتي»: مقاطع بمدّة (٥–٣٠ ث) وملاحظة لكلّ مقطع حتّى ٥ دقائق، وشريط زمنيّ يتعبّى. التوليد في app-11-video.js
     (window.__vmkTimelineRun: مشاهد ١٠/٥ ث بمحرّك «طويل (دقائق)» ثمّ لصق). المقاطع تُحفظ على الجهاز (راحة، لا حالة لازمة). */
  var TL_MAX=300, TL_DUR=[5,10,15,20,30], TL_KEY='aiapp_vd_timeline';
  var TL={segs:null};
  function drTimed(){ return ((id('vdKind')||{}).value==='timed'); }
  function tlFmt(s){ s=Math.max(0,Math.round(s)); return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
  function tlTotal(){ return (TL.segs||[]).reduce(function(a,s){ return a+s.d; },0); }
  function tlClipCount(){ return (typeof window.__vmkTimelinePlan==='function')?window.__vmkTimelinePlan(TL.segs||[]).length:(TL.segs||[]).reduce(function(a,s){ return a+Math.ceil(s.d/10); },0); }
  function tlSave(){ try{ localStorage.setItem(TL_KEY,JSON.stringify(TL.segs)); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:483'); /* guard-ok — بلا تخزين: تبقى المقاطع في الصفحة */ } }
  function tlLoad(){
    var v=null; try{ v=JSON.parse(localStorage.getItem(TL_KEY)||'null'); }catch(e){ v=null; /* guard-ok — قيمة تالفة: بداية جديدة */ }
    TL.segs=(Array.isArray(v)?v:[]).filter(function(s){ return s&&TL_DUR.indexOf(+s.d)>=0; }).map(function(s){ return {d:+s.d,n:String(s.n||'').slice(0,500)}; });
    while(tlTotal()>TL_MAX) TL.segs.pop();
    if(!TL.segs.length) TL.segs=[{d:10,n:''}];
  }
  function tlErr(t){ var e=id('vdTlErr'); if(e) e.textContent=t||''; }
  function tlInit(el){
    if(!el) return; tlLoad();
    el.innerHTML='<div class="vmk-tl-top"><span id="vdTlLeft"></span></div><div class="vmk-tl-bar" id="vdTlBar" dir="ltr"></div>'
      +'<div class="vmk-tl-scale" dir="ltr"><span>0:00</span><span>1:00</span><span>2:00</span><span>3:00</span><span>4:00</span><span>5:00</span></div>'
      +'<div class="vmk-tl-head"><span data-k="vdTlTime"></span><span data-k="vdTlNote"></span><span data-k="vdTlDur"></span><span></span></div>'
      +'<div class="vmk-tl-list" id="vdTlList"></div>'
      +'<div class="vmk-tl-add"><button type="button" id="vdTlAdd"></button><small data-k="vdTlSplit"></small></div>'
      +'<p class="vmk-tl-err" id="vdTlErr"></p><p class="vmk-tl-sum" id="vdTlSum"></p><div class="vmk-tl-links" id="vdTlLinks"></div>';
    el.querySelector('#vdTlAdd').addEventListener('click',function(){
      if(DR.busy) return;
      if(tlTotal()+5>TL_MAX){ tlErr(L('vdTlFull')); return; }
      TL.segs.push({d:Math.min(10,TL_MAX-tlTotal()),n:''}); tlErr(''); tlSave(); tlRender();
      var ts=el.querySelectorAll('#vdTlList textarea'); if(ts.length) ts[ts.length-1].focus();
    });
  }
  function tlRender(){
    var list=id('vdTlList'), bar=id('vdTlBar'); if(!list||!bar) return;
    list.innerHTML=''; bar.innerHTML=''; var t=0;
    TL.segs.forEach(function(s,i){
      var row=document.createElement('div'); row.className='vmk-tl-row';
      var tm=document.createElement('span'); tm.className='vmk-tl-time'; tm.dir='ltr'; tm.textContent=tlFmt(t)+' – '+tlFmt(t+s.d);
      var ta=document.createElement('textarea'); ta.rows=2; ta.maxLength=500; ta.value=s.n; ta.placeholder=L('vdTlPh'); ta.disabled=DR.busy;
      ta.addEventListener('input',function(){ s.n=ta.value; ta.classList.remove('err'); tlErr(''); tlSave(); });
      var sel=document.createElement('select'); sel.disabled=DR.busy;
      TL_DUR.forEach(function(d){ var o=document.createElement('option'); o.value=String(d); o.textContent=drT('vdTlSec',{n:d}); if(d===s.d) o.selected=true; sel.appendChild(o); });
      sel.addEventListener('change',function(){ var nd=+sel.value; if(tlTotal()-s.d+nd>TL_MAX){ tlErr(L('vdTlOver')); sel.value=String(s.d); return; } s.d=nd; tlErr(''); tlSave(); tlRender(); });
      var del=document.createElement('button'); del.type='button'; del.className='vmk-tl-del'; del.textContent='×'; del.title=L('vdTlDel'); del.setAttribute('aria-label',L('vdTlDel')); del.disabled=DR.busy;
      del.addEventListener('click',function(){ TL.segs.splice(i,1); if(!TL.segs.length) TL.segs.push({d:10,n:''}); tlErr(''); tlSave(); tlRender(); });
      row.appendChild(tm); row.appendChild(ta); row.appendChild(sel); row.appendChild(del); list.appendChild(row);
      var g=document.createElement('i'); g.className=i%2?'b':'a'; g.style.width=(s.d/TL_MAX*100)+'%'; g.textContent=s.d>=10?String(i+1):''; g.title=tlFmt(t)+' – '+tlFmt(t+s.d);
      g.addEventListener('click',function(){ ta.focus(); });
      bar.appendChild(g); t+=s.d;
    });
    var lf=id('vdTlLeft'); if(lf) lf.textContent=drT('vdTlLeft',{r:tlFmt(TL_MAX-tlTotal()),max:tlFmt(TL_MAX)});
    var sm=id('vdTlSum'); if(sm) sm.textContent=drT('vdTlSum',{k:TL.segs.length,t:tlFmt(tlTotal()),c:tlClipCount()});
  }
  function tlSync(){
    var el=id('vdTl'); if(!el) return; if(!TL.segs) tlLoad();
    [].forEach.call(el.querySelectorAll('[data-k]'),function(x){ x.textContent=L(x.getAttribute('data-k')); });
    var ad=id('vdTlAdd'); if(ad){ ad.textContent='+ '+L('vdTlAdd'); ad.disabled=DR.busy; }
    tlRender();
  }
  function tlLinks(urls){ /* إن تعذّر اللصق أو توقّف التوليد: المشاهد المكتملة روابط تحميل — لا يضيع ما دُفع */
    var box=id('vdTlLinks'); if(!box) return; box.innerHTML='';
    (urls||[]).forEach(function(u,i){
      var a=document.createElement('a'); a.href=(typeof window.__vmkProxyUrl==='function')?window.__vmkProxyUrl(u):u; a.download='scene-'+(i+1)+'.mp4'; a.target='_blank'; a.rel='noopener';
      a.textContent=drT('vdTlScenePart',{i:i+1}); box.appendChild(a);
    });
  }
  async function drTimedRun(){
    if(DR.busy||!drOwner()) return;
    var segs=TL.segs||[]; tlErr('');
    if(!segs.length){ tlErr(L('vdTlEmpty')); return; }
    for(var i=0;i<segs.length;i++){
      if(!String(segs[i].n||'').trim()){
        tlErr(drT('vdTlNeedNote',{i:i+1}));
        var tas=id('vdTlList')?id('vdTlList').querySelectorAll('textarea'):[]; if(tas[i]){ tas[i].classList.add('err'); tas[i].focus(); }
        return;
      }
    }
    if(tlTotal()>TL_MAX){ tlErr(L('vdTlOver')); return; }
    if(typeof window.__vmkTimelineRun!=='function'){ drMsg(L('vdFail'),true,'timeline engine missing'); return; }
    var clips=tlClipCount();
    if(ER.busy&&ER.paid&&!window.confirm(L('vdErLose'))) return; /* v-director-erase: التوليد يلغي المسح — والمدفوع الجاري لا يضيع بلا سؤال (مراجعة) */
    if(!window.confirm(drT('vdTlConfirm',{c:clips,t:tlFmt(tlTotal()),lo:clips*2,hi:clips*5}))) return; /* إنفاق حقيقيّ: موافقة لكلّ تشغيلة */
    var my=++DR.run, res=id('vdRes');
    DR.busy=true; upEnd(); syncDirector(); drMsg(''); if(res) res.classList.remove('has'); tlLinks([]);
    try{
      var out=await window.__vmkTimelineRun(segs.map(function(s){ return {d:s.d,n:String(s.n).trim()}; }),{
        status:function(kind,a,b){ if(my===DR.run) drMsg(kind==='join'?L('vdTlJoin'):drT('vdTlScene',{i:a,n:b})); }
      });
      if(my!==DR.run) return;
      if(out&&out.blob){
        if(DR.out){ try{ URL.revokeObjectURL(DR.out); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:563'); /* guard-ok — رابط زال */ } }
        DR.out=URL.createObjectURL(out.blob); pbNewVideo(); /* v-director-publish-guard */
        var vid=id('vdVideo'), dl=id('vdDl');
        if(vid) vid.src=DR.out;
        if(dl){ dl.href=DR.out; dl.setAttribute('download','omran-timeline.'+(/webm/i.test(out.blob.type||'')?'webm':'mp4')); }
        if(res) res.classList.add('has');
        drMsg(drT('vdTlDone',{t:tlFmt(tlTotal())}));
      } else { drMsg(L('vdTlNoJoin'),true); tlLinks(out&&out.urls); }
    }catch(err){
      if(my!==DR.run) return;
      var code=String((err&&err.code)||(err&&err.message)||'');
      if(code==='tl_credits') drMsg(drT('vdTlCredits',{c:err.credits,n:err.needed}),true);
      else drMsg(L('vdFail'),true,code.slice(0,300));
      if(err&&err.partial&&err.partial.length) tlLinks(err.partial);
      try{ __swallow(err,'director:timed'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:577'); /* guard-ok — لا مسجّل */ }
    }finally{
      if(my===DR.run){ DR.busy=false; syncDirector(); }
    }
  }
  /* ═══ v-director-publish (المالك ٧ نوفمبر: «اي فيديو الي اسويه اقدر ارسله الي اي مكان… في السوشيل ميديا هذي الخاصيه موجوده عندي لكن ضيفها عندي
     في المخرج»، واختار «انشر في حساباتي»): زرّ تحت الفيديو الجاهز يفتح لوحة — النصّ المرافق (فارغ عمدًا: ملاحظات التوليد ليست وصفًا للعامّة)
     والمنصّات الموصولة كما يراها الخادم، ثمّ «انشر الآن» بموافقة صريحة لكلّ نشر (علنيّ ولا يُسحب). الفيديو يُرفع من الجهاز مباشرة إلى هدف مؤقّت
     يصدره الخادم (مرّة لكلّ فيديو)، والخادم ينشر بخدمة النشر نفسها التي يستعملها بوت التسويق، ثمّ استطلاع حتّى تقول كلّ منصّة كلمتها. ═══ */
  var PB={busy:false,plats:null,reauth:[],loading:false,src:'',id:'',vid:'',at:0,reqs:{},rows:{},own:{},sent:{},poll:0,gen:0,ticking:false,xhr:null};
  var PB_NAMES={instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok',youtube:'YouTube',x:'X',threads:'Threads'};
  var PB_FRESH=5*3600*1000; /* v-director-publish-guard: الملفّ المرفوع يعيش ٦ ساعات عند الخادم وخدمة النشر تجلبه في الخلفيّة — بعد ٥ يُرفع من جديد */
  function pbApi(op,body){
    return fetch('/api/media?action=social-publish&op='+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({token:drTok()},body||{}))})
      .then(function(r){ return r.json().catch(function(){ return {ok:false,error:'http',status:r.status}; }); });
  }
  function pbMsg(t,err,why){
    var m=id('vdPubMsg'); if(!m) return;
    m.textContent=(t||'')+(why?' ('+String(why).slice(0,200)+')':''); /* السبب الحقيقيّ بين قوسين: اللوحة للمالك وحده */
    m.classList.toggle('err',!!err);
  }
  function pbWhy(d){ d=d||{}; return [d.error||d.message||'',d.status||'',d.detail||''].filter(Boolean).join(' '); }
  function pbErr(d){
    var e=String((d&&d.error)||'');
    return e==='no_key'?L('vdPubNoKey'):e==='limit'?L('vdPubLimit'):e==='too_big'?drT('vdPubBig',{n:(d&&d.maxMB)||500}):L('vdPubFail');
  }
  function pbNames(list){ return (list||[]).map(function(p){ return PB_NAMES[p]||p; }).join('، '); }
  function pbUnknown(d){ return !!d&&!d.ok&&(d.error==='net'||d.error==='http'||(d.error==='retry'&&!d.detail)); } /* لا نعرف هل حجز الخادم وأرسل (انقطاع أو خطأ بعد الإرسال) */
  /* v-director-publish-guard: فيديو جديد = لوحة من الصفر — نصّ السابق ونتيجته ومنصّاته لا تُعرض تحته (كان التصفير عند فتح اللوحة وحده،
     فلوحة مفتوحة تُبقي «نزل» ونصّ الفيديو السابق تحت الجديد). يُنادى حيث يتغيّر DR.out. */
  function pbNewVideo(keep){
    PB.gen++; PB.reqs={}; PB.rows={}; PB.own={}; PB.sent={}; PB.vid=''; clearTimeout(PB.poll);
    if(PB.xhr){ var x=PB.xhr; PB.xhr=null; try{ x.abort(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:609'); /* guard-ok — رفع انتهى أو لا يُلغى */ } } /* رفع الفيديو القديم يُلغى: «انشر الآن» لا يبقى مقفلًا عليه */
    pbRes([]); pbMsg(''); var c=id('vdPubCap'); if(c&&!keep) c.value='';
    var b=id('vdPubPlats'); if(b&&!keep) b.textContent=''; pbPlats(); /* المنصّات كلّها مؤشَّرة من جديد — إلّا الفيديو نفسه بالباركود أو بدونه
      (keep، v-director-endcard): نصّه وما شاله المالك من منصّاته يبقيان */
  }
  function pbToggle(){
    var p=id('vdPub'); if(!p) return;
    p.hidden=!p.hidden;
    if(!p.hidden){ pbLoad(); var c=id('vdPubCap'); if(c&&!PB.busy) c.focus(); }
  }
  function pbLoad(){
    if(PB.loading) return; /* سؤال واحد في الطريق */
    /* كلّ فتح يسأل من جديد: حساب أُعيد ربطه أو وُصل يظهر بلا إعادة تحميل (إعادة التحميل تضيّع الفيديو). القائمة الحاضرة تبقى أثناء السؤال */
    PB.loading=true; if(!PB.plats){ if(!pbKeep()) pbMsg(''); pbPlats(); } syncDirector();
    pbApi('accounts').then(function(d){
      PB.loading=false; var keep=pbKeep(); /* رسالة رفع أو نشر قائم أو منتهٍ لا تُمسح */
      if(d&&d.ok){ PB.plats=d.on||[]; PB.reauth=d.reauth||[]; if(!keep) pbMsg(PB.plats.length?'':L('vdPubNoAcc'),!PB.plats.length); }
      else if(!keep) pbMsg(pbErr(d),true,pbWhy(d)); /* القائمة السابقة تبقى؛ وبلا قائمة يعيد الفتح التالي السؤال (مفتاح أُضيف بعدها) */
      pbPlats(); syncDirector();
    }).catch(function(e){ PB.loading=false; if(!pbKeep()) pbMsg(L('vdPubFail'),true,String((e&&e.message)||e)); pbPlats(); syncDirector(); });
  }
  function pbKeep(){ return PB.busy||Object.keys(PB.reqs).length>0||Object.keys(PB.rows).length>0; }
  function pbPlats(){
    var box=id('vdPubPlats'); if(!box) return;
    var off={}; [].forEach.call(box.querySelectorAll('input[type=checkbox]'),function(c){ if(!c.checked) off[c.value]=1; }); /* ما شاله المالك يبقى مشالًا بعد التحديث */
    box.textContent='';
    if(PB.loading&&!PB.plats){ box.textContent=L('vdPubLoading'); return; }
    (PB.plats||[]).forEach(function(p){
      var l=document.createElement('label'), c=document.createElement('input'), st=PB.sent[p];
      c.type='checkbox'; c.value=p; c.checked=!st&&!off[p]; c.disabled=!!st; /* أخذ هذا الفيديو (نزل أو ينتظر): لا يُرسل له مرّة ثانية */
      if(st) l.className='is-sent';
      l.appendChild(c); l.appendChild(document.createTextNode((PB_NAMES[p]||p)+(st?' · '+L(st==='ok'?'vdPubOk':'vdPubWait'):''))); box.appendChild(l);
    });
    (PB.reauth||[]).forEach(function(p){ var s=document.createElement('span'); s.className='off'; s.textContent=drT('vdPubReauth',{p:PB_NAMES[p]||p}); box.appendChild(s); });
  }
  function pbPut(url,mime,blob,at){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(), bad=function(){ rej({error:'upload',status:x.status}); };
      x.open('PUT',url,true); x.timeout=1800000;
      x.setRequestHeader('Content-Type',mime); /* النوع الذي أصدر الخادم الهدف به حرفيًّا */
      x.upload.onprogress=function(e){ if(at===DR.out&&e.lengthComputable&&e.total>0) pbMsg(drT('vdPubUp',{p:Math.min(99,Math.round(e.loaded/e.total*100))})); };
      x.onload=function(){ if(x.status>=200&&x.status<300) res(); else bad(); };
      x.onerror=bad; x.ontimeout=bad; x.onabort=bad;
      PB.xhr=x; x.send(blob);
    });
  }
  function pbRes(list){
    var ul=id('vdPubRes'); if(!ul) return;
    ul.textContent='';
    (list||[]).forEach(function(r){
      var li=document.createElement('li'); li.className='is-'+r.state;
      var b=document.createElement('b'); b.textContent=PB_NAMES[r.platform]||r.platform; li.appendChild(b);
      var s=document.createElement('span'); s.textContent=L(r.state==='ok'?'vdPubOk':(r.state==='fail'?'vdPubNo':'vdPubWait')); li.appendChild(s);
      if(r.url){ var a=document.createElement('a'); a.href=r.url; a.target='_blank'; a.rel='noopener'; a.textContent=L('vdPubOpen'); li.appendChild(a); }
      if(r.error){ var sm=document.createElement('small'); sm.dir='auto'; sm.textContent=r.error; li.appendChild(sm); }
      ul.appendChild(li);
    });
  }
  async function pbGo(){
    if(PB.busy||EC.busy||ER.busy||!drOwner()||!DR.out) return; /* v-director-endcard: لا نشر أثناء إضافة الباركود (يُرفع الأصل بدلها) — ولا أثناء مسح الكتابة (v-director-erase) */
    var capEl=id('vdPubCap'), cap=String((capEl||{}).value||'').trim();
    var picked=[].map.call((id('vdPubPlats')||document).querySelectorAll('input:checked'),function(c){ return c.value; }).filter(function(p){ return !PB.sent[p]; });
    if(!cap){ pbMsg(L('vdPubNeedCap'),true); if(capEl) capEl.focus(); return; }
    if(!picked.length){ pbMsg(L('vdPubPick'),true); return; }
    if(!window.confirm(drT('vdPubConfirm',{p:pbNames(picked)}))) return; /* علنيّ ولا يُسحب: موافقة لكلّ نشر */
    var at=DR.out; /* الفيديو الذي وافق عليه: إن جاء فيديو جديد أثناء الرفع لا يُنشر القديم ولا تُرسم نتيجته تحت الجديد */
    PB.busy=true; syncDirector(); /* نتائج النشر السابق ومتابعته تبقى: النشر الجديد يضيف ولا يقطع */
    try{
      var d=null;
      for(var round=0;round<2;round++){
        var up=PB.src!==at||!PB.id||!(Date.now()-PB.at<PB_FRESH);
        if(up){ /* فيديو جديد أو ملفّ قارب عمره = رفع؛ الفيديو نفسه لمنصّات أخرى لا يُرفع مرّتين */
          pbMsg(drT('vdPubUp',{p:0}));
          var mine=(DR.file&&DR.fileUrl===at)?DR.file:null; /* v-director-upload: ملفّ الجهاز يُرفع نفسه — لا نسخة تُقرأ من رابطه (٥٠٠ ميغا على جوّال) */
          var blob=mine||await fetch(at).then(function(r){ return r.blob(); });
          if(at!==DR.out) return;
          var type=mine?DR.fileType:(/webm/i.test(blob.type||'')?'video/webm':(/quicktime/i.test(blob.type||'')?'video/quicktime':'video/mp4'));
          var t=await pbApi('target',{size:blob.size,type:type});
          if(at!==DR.out) return;
          if(!t||!t.ok) throw (t||{error:'target'});
          var t0=Date.now();
          await pbPut(t.up,t.ctype||type,blob,at);
          if(at!==DR.out) return;
          if(PB.src!==at||!PB.vid) PB.vid=t.id; /* أوّل رفع يسمّي الفيديو؛ إعادة رفعه تبقي اسمه فتبقى حجوزات منصّاته عند الخادم */
          PB.src=at; PB.id=t.id; PB.at=t0;
        }
        var pub=function(){ return pbApi('publish',{id:PB.id,vid:PB.vid||PB.id,caption:cap,platforms:picked}).catch(function(e){ return {ok:false,error:'net',detail:String((e&&e.message)||e)}; }); };
        d=await pub();
        if(at!==DR.out) return;
        if(pbUnknown(d)){ d=await pub(); if(at!==DR.out) return; } /* انقطاع بيننا وبين الخادم: الحجز لكلّ منصّة يجعل الإعادة آمنة — إن كان الأوّل وصل عادت «انرسل قبل» وتُوبع طلبه */
        if(d&&d.error==='no_file'&&!up){ PB.id=''; continue; } /* انتهى عمر الملفّ عند الخادم ولم يُنشر شيء: رفع واحد من جديد في الضغطة نفسها */
        break;
      }
      if(pbUnknown(d)){ pbMsg(L('vdPubSlow'),true,pbWhy(d)); return; } /* ما نعرف هل وصل: لا «ما قدر ينشر» ولا وعد بمتابعة بلا طلب — الضغطة التالية يحسمها حجز الخادم */
      if(!d||!d.ok) throw (d||{error:'publish'});
      var already=d.already||[], sent=d.again?[]:picked.filter(function(p){ return already.indexOf(p)<0; }), hold=d.held||{};
      sent.concat(already).forEach(function(p){ if(!PB.sent[p]) PB.sent[p]='wait'; });
      sent.forEach(function(p){ PB.rows[p]={platform:p,state:'wait',url:'',error:''}; }); /* ما أُرسل الآن ينتظر، لا نتيجة محاولته السابقة */
      var again=already.length?drT('vdPubAgain',{p:pbNames(already)}):'';
      pbMsg(d.again?again:(d.unsure?L('vdPubUnsure'):L('vdPubSent')+(again?' · '+again:''))); /* ما لم يُرسل لا يُقال عنه «انرسل» */
      pbRes(pbRowList()); pbPlats();
      Object.keys(hold).forEach(function(p){ pbTrack(String(hold[p]||''),[p]); }); /* من أخذه قبل: طلبه يُتابَع فيُعرف هل نزل */
      if(d.again&&!d.held) pbTrack(String(d.request||''),already);
      if(!d.again) pbTrack(String(d.request||''),sent);
    }catch(e){
      if(at!==DR.out) return;
      pbMsg(pbErr(e),true,pbWhy(e)||String((e&&e.message)||e));
      try{ __swallow(e,'director:publish'); }catch(x){ typeof __swallow === 'function' && __swallow(x, 'video:714'); /* guard-ok — لا مسجّل */ }
    }finally{ PB.busy=false; syncDirector(); }
  }
  /* v-director-publish-guard: كلّ طلب نشر يُتابَع حتّى تقول منصّاته كلمتها — نشرٌ ثانٍ (منصّة أخرى أو إعادة ما فشل) لا يقطع متابعة
     الأوّل (كانت منصّاته تبقى «ينتظر» معطّلة للأبد)، والنتيجة صفّ لكلّ منصّة من أيّ طلب. مؤقّت واحد يسأل عن المعلَّق كلّه. */
  function pbTrack(req,plats){
    if(!req) return;
    var r=PB.reqs[req]||(PB.reqs[req]={plats:[],n:0});
    (plats||[]).forEach(function(p){ if(r.plats.indexOf(p)<0) r.plats.push(p); PB.own[p]=req; }); /* المنصّة تتبع آخر طلب أُرسلت فيه */
    r.n=0; pbPoll();
  }
  function pbMine(req,p){ if(!PB.own[p]) PB.own[p]=req; return PB.own[p]===req; } /* طلب أقدم لا يغلب نتيجة الأحدث للمنصّة نفسها */
  /* المتابعة انتهت (حُسم الطلب أو بلغ حدّ الأسئلة) ومنصّة منه ما زالت «ينتظر»: لا تبقى قفلًا في اللوحة — الضغطة التالية يحسمها الخادم
     (يحرّر ما لم ينشر، أو يقول «انرسل قبل» ويعيد ربط المتابعة) */
  function pbFree(req,r){ r.plats.forEach(function(p){ if(PB.own[p]===req&&PB.sent[p]==='wait') delete PB.sent[p]; }); }
  function pbPoll(){
    clearTimeout(PB.poll);
    var keys=Object.keys(PB.reqs), gen=PB.gen; if(!keys.length) return;
    var young=keys.some(function(k){ return PB.reqs[k].n<6; });
    PB.poll=setTimeout(function(){ pbTick(gen); },young?5000:10000);
  }
  async function pbTick(gen){
    if(PB.ticking){ pbPoll(); return; } /* سؤال سابق ما خلص (شبكة بطيئة): الدور بعده، لا سؤالان متداخلان */
    PB.ticking=true;
    try{
      var lost=false, slow=false, keys=Object.keys(PB.reqs);
      for(var i=0;i<keys.length;i++){
        var req=keys[i], r=PB.reqs[req]; if(!r) continue;
        var d=await pbApi('status',{request:req}).catch(function(){ return null; });
        if(gen!==PB.gen) return; /* فيديو جديد أثناء السؤال: نتيجة القديم لا تُرسم تحته */
        if(PB.reqs[req]!==r) continue;
        r.n++;
        if(d&&d.ok){
          var rows=d.results||[];
          rows.forEach(function(x){ if(!pbMine(req,x.platform)) return; PB.rows[x.platform]=x; if(x.state==='fail') delete PB.sent[x.platform]; else PB.sent[x.platform]=x.state; }); /* ما لم ينزل يُختار من جديد */
          if(d.lost||(d.state==='fail'&&!rows.length)){ /* ما وصل الخدمة: لا شيء نزل، والنشر التالي يرسله */
            r.plats.forEach(function(p){ if(PB.own[p]!==req) return; delete PB.sent[p]; delete PB.rows[p]; delete PB.own[p]; }); delete PB.reqs[req]; lost=true; continue;
          }
          if(d.state==='fail') r.plats.forEach(function(p){ if(PB.own[p]===req&&!rows.some(function(x){ return x.platform===p; })){ delete PB.sent[p]; PB.rows[p]={platform:p,state:'fail',url:'',error:''}; } }); /* مهمّة فشلت قبل أن تبلغها */
          if(d.state!=='wait'){ pbFree(req,r); delete PB.reqs[req]; continue; }
        }
        if(r.n>=120){ pbFree(req,r); delete PB.reqs[req]; slow=true; }
      }
      pbRes(pbRowList()); pbPlats();
      if(!PB.busy){ /* رسالة الرفع الجاري لا تُغطّى */
        if(lost) pbMsg(L('vdPubLost'),true);
        else if(slow) pbMsg(L('vdPubSlow'));
        else if(!Object.keys(PB.reqs).length){ var all=pbRowList(), ok=all.filter(function(x){ return x.state==='ok'; }).length; pbMsg(drT('vdPubDone',{ok:ok,n:all.length}),!ok); }
      }
    }finally{ PB.ticking=false; pbPoll(); }
  }
  function pbRowList(){
    var order=Object.keys(PB_NAMES), rank=function(p){ var i=order.indexOf(p); return i<0?99:i; };
    return Object.keys(PB.rows).sort(function(a,b){ return rank(a)-rank(b); }).map(function(p){ return PB.rows[p]; });
  }
  /* ═══ v-director-upload (المالك ١٠ نوفمبر: «الي اريده في المخرج مثال مكان تحميل الفيديو واسوي نشر على التواصل الاجتماعي»، واختار «أرفع فيديو
     جاهز وأنشره»): صندوق في المخرج يأخذ فيديو جاهزًا من الجهاز ويضعه مكان فيديو المخرج، فتنشره لوحة «انشر في حساباتي» نفسها — الخادم كما هو
     (mp4/mov/webm حتّى ٥٠٠ ميغا). النوع من امتداد الملفّ حين يسكت المتصفّح عنه، والمرفوض يُقال قبل أيّ رفع. فيديو صنعه المخرج ومعروض لا
     يُستبدل بلا سؤال (مدفوع ولا مكتبة تحفظه)، والصندوق معطّل أثناء التوليد وأثناء رفع النشر (فيديو جديد يلغي رفع القديم). ═══ */
  var UP_MAX_MB=500, UP_TYPES={'video/mp4':1,'video/webm':1,'video/quicktime':1};
  function upType(f){
    var t=String((f&&f.type)||'').toLowerCase().split(';')[0].trim(), n=String((f&&f.name)||'').toLowerCase();
    if(UP_TYPES[t]) return t;
    if(t==='video/x-m4v') return 'video/mp4';
    if(!t||t==='application/octet-stream'){ if(/\.(mp4|m4v)$/.test(n)) return 'video/mp4'; if(/\.mov$/.test(n)) return 'video/quicktime'; if(/\.webm$/.test(n)) return 'video/webm'; }
    return '';
  }
  function upShown(){ var r=id('vdRes'); return !!(DR.out&&r&&r.classList.contains('has')); } /* فيديو معروض الآن (لا فيديو أخفاه توليد لاحق) */
  function upMine(){ return !!(DR.file&&DR.out===DR.fileUrl&&upShown()); }
  function upMsg(t,err){ var m=id('vdUpMsg'); if(!m) return; m.textContent=t||''; m.className='vmk-dir-msg'+(err?' err':''); }
  /* v-director-endcard: توليد جديد في المخرج يترك المرفوع (drReset يخفيه): إضافة الباركود الجارية تُلغى (كانت تقفل «انشر الآن» على فيديو
     المخرج ورسالتها تبقى تحت الصندوق)، وروابطه والملفّ المبنيّ في الذاكرة (حتّى ٥٠٠ ميغا) تُترك للتحرير؛ المعروض يحرّره التوليد حين ينتهي */
  function upEnd(){ erDrop(DR.out); ecDrop(DR.out); upMsg(''); DR.file=null; DR.fileUrl=''; } /* v-director-erase: المسح الجاري يُلغى والأصل المحفوظ يُحرَّر */
  function upPick(f){
    if(!f||!drOwner()||DR.busy||PB.busy) return;
    var type=upType(f);
    if(!type||!(f.size>0)){ upMsg(L('vdUpBadType'),true); return; }
    if(f.size>UP_MAX_MB*1048576){ upMsg(drT('vdPubBig',{n:UP_MAX_MB}),true); return; }
    if(upShown()&&DR.out!==DR.fileUrl&&!window.confirm(L('vdUpReplace'))) return; /* فيديو المخرج المعروض: يُحمَّل أوّلًا */
    if(ER.busy&&ER.paid&&!window.confirm(L('vdErLose'))) return; /* v-director-erase: مسح بالذكاء مدفوع وجارٍ لا يضيع بلا سؤال */
    erDrop(DR.out); /* v-director-erase: المسح الجاري يُلغى والأصل المحفوظ يُحرَّر */
    ecDrop(DR.out); /* v-director-endcard: إضافة جارية لملفّ سابق تُلغى وروابطه تُحرَّر */
    if(DR.out){ try{ URL.revokeObjectURL(DR.out); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:up-revoke'); /* guard-ok — رابط زال */ } }
    DR.file=f; DR.fileType=type; DR.fileUrl=DR.out=URL.createObjectURL(f); pbNewVideo();
    var vid=id('vdVideo'), dl=id('vdDl'), res=id('vdRes'), pub=id('vdPub');
    if(vid) vid.src=DR.out;
    if(dl){ dl.href=DR.out; dl.setAttribute('download',String(f.name||'').replace(/[\\/:*?"<>|]+/g,'_').slice(-120)||'video.mp4'); }
    if(res) res.classList.add('has');
    drMsg(''); upMsg('');
    if(pub&&pub.hidden){ pub.hidden=false; pbLoad(); } /* المقصود النشر: اللوحة تُفتح مع الفيديو (بلا تركيز — لوحة مفاتيح الجوّال تغطّي الفيديو) */
    EC.src={file:f,type:type,url:DR.out}; /* v-director-endcard: الأصل محفوظ — إطفاء الخيار يعيده */
    ER.orig=EC.src; /* v-director-erase: المسح من الأصل دائمًا، و«رجّع الأصل» يعيده */
    syncDirector();
    try{ if(res&&res.scrollIntoView) res.scrollIntoView({block:'nearest'}); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:up-scroll'); /* guard-ok — متصفّح بلا خيارات التمرير */ }
    if(ecPref()) ecStart(); /* v-director-endcard: الخيار مشغَّل = يُضاف الباركود فورًا والنشر ينتظره */
  }
  function upBind(zone,input){
    if(!zone||!input) return;
    input.addEventListener('change',function(e){ var f=e.target.files&&e.target.files[0]; e.target.value=''; if(f) upPick(f); }); /* التصفير: الملفّ نفسه يُختار مرّة ثانية */
    /* الإفلات على الصندوق له لا لمرفقات الدردشة (ملتقط الصفحة في app-09 يترك ما أُخذ — defaultPrevented) */
    zone.addEventListener('dragover',function(e){ e.preventDefault(); if(!input.disabled) zone.classList.add('over'); });
    zone.addEventListener('dragleave',function(){ zone.classList.remove('over'); });
    zone.addEventListener('drop',function(e){ e.preventDefault(); zone.classList.remove('over'); var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) upPick(f); });
  }
  /* ═══ v-director-endcard (المالك ١٠ نوفمبر: «اذا تحملة الفيديو كيف احط اسم الطبيق اخر شي الي هو الباركود»، ثمّ «ابدأ» على النموذج):
     خيار تحت صندوق «ارفع فيديو جاهز»: «أضف باركود التطبيق في آخر الفيديو» — ٤ ثوانٍ تُلصق بآخر الفيديو المرفوع: آخر لقطة منه تعتم
     تدريجيًّا ويظهر فوقها باركود رابط التطبيق و«حمّل تطبيق om ai» والرابط. كلّه في الجهاز بأداة الفيديو الموجودة (ffmpeg.wasm): بلا خادم
     ولا نقاط. السريع (H.264 وAAC — ما يخرجه الجوّال وكاب كات والتطبيق): البطاقة وحدها تُرمَّز بمقاس الفيديو وإطاراته ومقياس زمنه وترتيب
     دفقاته ودورانه ومداه اللونيّ، ثمّ لصق بلا إعادة ترميز (ثوانٍ لفيديو دقائق). غيره (HEVC، WebM…) يُعاد ترميزه كلّه إلى H.264 بحدّ
     مدّة وحجم (أصغر على الجوّال). الأصل يبقى: إطفاء الخيار يعيده، والنشر يرفع المعروض. الصور إلى الأداة PNG — مرمّز JPEG فيها يُسقطها. ═══ */
  var EC_SEC=4, EC_FADE=0.6, EC_KEY='aiapp_vd_endcard';
  var EC={run:0,busy:false,ff:null,src:null,out:null,skip:null};
  var EC_TRANS={90:'transpose=cclock',270:'transpose=clock',180:'hflip,vflip'}; /* البطاقة تُرسم كما تُعرض وتُدار إلى وضع التخزين: المشغّل يديرها مع الفيديو */
  /* رابط التطبيق العامّ من وسم canonical في الصفحة (لا عنوان نشر مكتوب في العميل — اختبار المخرج)، والاحتياط أصل الصفحة */
  function ecUrl(){ try{ var l=document.querySelector('link[rel="canonical"]'), h=String((l&&l.href)||''); if(/^https:\/\/[^/]+/.test(h)) return h.replace(/\/+$/,''); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:ec-url'); /* guard-ok — الأصل يكفي */ } return String(location.origin||''); }
  function ecMob(){ try{ return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||''); }catch(e){ return false; } }
  function ecPref(){ try{ return localStorage.getItem(EC_KEY)!=='0'; }catch(e){ return true; } } /* الافتراضيّ مشغَّل: طلب المالك */
  function ecSetPref(on){ try{ localStorage.setItem(EC_KEY,on?'1':'0'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:ec-pref'); /* guard-ok — بلا تخزين: يبقى للصفحة */ } }
  function ecSplit(s){ /* الفواصل العليا فقط: «yuvj420p(pc, bt709…)» جزء واحد */
    var out=[], depth=0, cur='';
    for(var i=0;i<s.length;i++){
      var c=s.charAt(i);
      if(c==='('||c==='[') depth++; else if(c===')'||c===']') depth=Math.max(0,depth-1);
      if(c===','&&depth===0){ out.push(cur.trim()); cur=''; } else cur+=c;
    }
    if(cur.trim()) out.push(cur.trim());
    return out;
  }
  function ecNum(s){ var m=/^([\d.]+)(k)?$/.exec(String(s||'').trim()); return m?(+m[1])*(m[2]?1000:1):0; } /* «30k tbn» = 30000 */
  /* ألوان الفيديو كما يطبعها «-i» بين قوسي الصيغة: «(pc, bt709/bt709/iec61966-2-1, progressive)» = المصفوفة/الأوّليّات/النقل،
     والاسم الواحد «bt709» = الثلاثة. الأرقام رموز VUI نفسها (H.273) — تُمرَّر أرقامًا لا أسماء (اسم النقل «bt470bg» لا تقبله الأداة) */
  var EC_SP={bt709:1,fcc:4,bt470bg:5,smpte170m:6,smpte240m:7,bt2020nc:9,bt2020c:10};
  var EC_PRI={bt709:1,bt470m:4,bt470bg:5,smpte170m:6,smpte240m:7,film:8,bt2020:9};
  var EC_TRC={bt709:1,bt470m:4,bt470bg:5,smpte170m:6,smpte240m:7,linear:8,'iec61966-2-4':11,bt1361e:12,'iec61966-2-1':13,'bt2020-10':14,'bt2020-12':15,smpte2084:16,'arib-std-b67':18};
  function ecColor(s){
    var c={sp:'',pri:'',trc:''};
    String(s||'').split(',').forEach(function(t){
      t=t.trim(); var m=/^([a-z0-9-]+)\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(t);
      if(m){ c.sp=m[1]; c.pri=m[2]; c.trc=m[3]; } else if(EC_SP[t]) c.sp=c.pri=c.trc=t;
    });
    return c;
  }
  /* سجلّ «ffmpeg -i» ← المدّة وكلّ دفق (نوعه وترميزه ومقاسه وإطاراته ومقياس زمنه وصوته) والدوران باتّجاه الساعة */
  function ecParse(log){
    var r={dur:0,streams:[],rot:0}, s=String(log||''), last=null;
    var m=/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
    if(m) r.dur=(+m[1])*3600+(+m[2])*60+(+m[3]);
    s.split(/\r?\n/).forEach(function(l){
      var st=/Stream #\d+:(\d+)(?:\[[^\]]*\])?(?:\([^)]*\))?: (Video|Audio|Data|Subtitle|Attachment): (.*)$/.exec(l);
      if(st){
        var parts=ecSplit(st[3]), head=/^([A-Za-z0-9_]+)(?: \(([^)]*)\))?/.exec(parts[0]||'')||[];
        var o={i:+st[1],kind:st[2].charAt(0).toLowerCase(),codec:String(head[1]||'').toLowerCase(),profile:String(head[2]||''),pic:/attached pic/.test(st[3])};
        if(o.kind==='v'){
          var px=/^([a-z0-9_]+)(?:\(([^)]*)\))?/.exec(parts[1]||'')||[];
          o.pix=String(px[1]||''); o.sar=1; o.color=ecColor(px[2]);
          parts.forEach(function(p){
            var d=/^(\d{2,5})x(\d{2,5})(?:\s|$)/.exec(p); if(d&&!o.w){ o.w=+d[1]; o.h=+d[2]; }
            var sar=/SAR (\d+):(\d+)/.exec(p); if(sar&&+sar[2]) o.sar=(+sar[1])/(+sar[2]);
            var f=/^([\d.]+k?) fps$/.exec(p); if(f) o.fps=ecNum(f[1]);
            var tb=/^([\d.]+k?) tbr$/.exec(p); if(tb) o.tbr=ecNum(tb[1]);
            var tn=/^([\d.]+k?) tbn\b/.exec(p); if(tn) o.tbn=ecNum(tn[1]);
          });
        } else if(o.kind==='a'){
          parts.forEach(function(p){
            var hz=/^(\d+) Hz$/.exec(p); if(hz) o.sr=+hz[1];
            if(/^(mono|stereo)$/.test(p)) o.layout=p;
            var ch=/^(\d+) channels$/.exec(p); if(ch) o.layout=(+ch[1]===1?'mono':(+ch[1]===2?'stereo':p));
          });
        }
        r.streams.push(o); last=o; return;
      }
      var dm=/displaymatrix: rotation of (-?[\d.]+) degrees/.exec(l);
      if(dm&&last&&last.kind==='v'){ last.dm=+dm[1]; return; }
      var rt=/^\s*rotate\s*:\s*(-?\d+)/.exec(l);
      if(rt&&last&&last.kind==='v'&&last.dm==null) last.rotTag=+rt[1];
    });
    var v=r.streams.filter(function(x){ return x.kind==='v'&&!x.pic; })[0];
    if(v){ var cw=v.dm!=null?-v.dm:(v.rotTag||0); r.rot=((Math.round(cw/90)*90)%360+360)%360; } /* «rotation of -90» = يُدار ٩٠ باتّجاه الساعة للعرض */
    return r;
  }
  /* معدّل الإطارات: المعيار الأقرب (29.97 ليس 30)، و«tbr» المضلِّل في فيديو الجوّال (30k) لا يُؤخذ */
  function ecFps(v){
    var f=+(v&&v.fps)||0, t=+(v&&v.tbr)||0, c=(f>=5&&f<=120)?f:((t>=5&&t<=120)?t:30), best=null;
    [[23.976,'24000/1001'],[24,'24'],[25,'25'],[29.97,'30000/1001'],[30,'30'],[50,'50'],[59.94,'60000/1001'],[60,'60']].forEach(function(x){ var d=Math.abs(c-x[0]); if(d<0.02&&(!best||d<best.d)) best={d:d,v:x[1]}; });
    return best?best.v:String(Math.max(10,Math.min(60,Math.round(c))));
  }
  function ecEven(n){ n=Math.round(n); return Math.max(2,n-(n%2)); }
  /* الخطّة: «سريع» = لصق بلا إعادة ترميز حين تطابق البطاقة الملفّ تمامًا، وإلّا إعادة ترميز كاملة بحدود الجهاز */
  function ecPlan(p,size,mob,slow){ /* slow (v-director-erase): المسح يعيد الترميز دائمًا — حدود البطيء ومقاس مخرجه */
    var v=p.streams.filter(function(x){ return x.kind==='v'&&!x.pic; })[0], a=p.streams.filter(function(x){ return x.kind==='a'; })[0]||null;
    if(!v||!v.w||!v.h) return {ok:false,why:'novideo'};
    var swap=(p.rot===90||p.rot===270), pl={ok:true,dur:p.dur,rot:p.rot,v:v,a:a,fps:ecFps(v),w:v.w,h:v.h,dw:swap?v.h:v.w,dh:swap?v.w:v.h,order:(a&&a.i<v.i)?'av':'va'};
    var why='';
    if(v.codec!=='h264') why='vcodec';
    else if(!/^yuvj?420p$/.test(v.pix||'')) why='pix';
    else if(Math.abs((v.sar||1)-1)>0.01) why='sar';
    else if(a&&!(a.codec==='aac'&&a.profile==='LC'&&a.sr>0&&/^(mono|stereo)$/.test(a.layout||''))) why='acodec';
    else if(a&&p.atb!==a.sr) why='atb'; /* مقياس زمن الصوت غير معدّل العيّنة (أو لم يُقرأ): اللصق يمدّ صوت البطاقة أضعافًا */
    else if(!((v.i===0&&(!a||a.i===1))||(a&&a.i===0&&v.i===1))) why='order'; /* الدمج يطابق الدفقات بترتيبها */
    else if(v.w%2||v.h%2) why='odd';
    if(!why&&slow) why='erase';
    pl.fast=!why; pl.why=why;
    var MB=1048576;
    if(pl.fast){ if(size>(mob?250:500)*MB) return {ok:false,why:'heavy'}; return pl; }
    if(!(p.dur>0)) return {ok:false,why:'nodur'}; /* مدّة مجهولة (WebM سجّله متصفّح): لا حدّ يُقاس — ليس «ثقيلًا» */
    if(size>(mob?100:300)*MB||p.dur>(mob?60:180)) return {ok:false,why:'heavy'};
    var dw=Math.abs((v.sar||1)-1)>0.01&&!swap?pl.dw*v.sar:pl.dw, k=Math.min(1,1080/Math.min(dw,pl.dh),1920/Math.max(dw,pl.dh));
    pl.ow=ecEven(dw*k); pl.oh=ecEven(pl.dh*k);
    return pl;
  }
  /* لماذا لا يُضاف (مراجعة مستقلّة): «ثقيل — جرّبه من الكمبيوتر» حين ينجح على الكمبيوتر فقط؛ ما فوق حدود الكمبيوتر «big» (لا جهاز يغيّره)
     ومدّة مجهولة وغيرها «probe» — وكلاهما «ما قدرت أضيفه — تقدر تنشره بدونه» */
  function ecWhy(pl,info,size,mob){ return pl.why!=='heavy'?'probe':((mob&&ecPlan(info,size,false).ok)?'heavy':'big'); }
  /* البطاقة تُحوَّل من RGB بمصفوفة الفيديو نفسها (المتصفّح فكّ آخر لقطة بها) وتُوسم بوسومه — كانت الأداة تحوّلها بـBT.601 بلا وسم والمسار
     يقول BT.709 فيقفز اللون عند الوصل. بلا وسم: تخمين Chromium مقيسًا — الارتفاع المرمَّز ٧٢٠ فأكثر = 709، وما دونه 601 */
  function ecMatrix(pl){
    var sp=(pl.v.color||{}).sp;
    if(sp==='bt709'||sp==='fcc'||sp==='smpte240m') return sp;
    if(sp==='bt470bg'||sp==='smpte170m') return 'bt601';
    if(sp==='bt2020nc'||sp==='bt2020c') return 'bt2020';
    return ((pl.fast?pl.h:pl.oh)>=720)?'bt709':'bt601';
  }
  function ecTags(pl){
    var c=pl.v.color||{}, a=[];
    if(EC_SP[c.sp]) a.push('-colorspace',String(EC_SP[c.sp]));
    if(EC_PRI[c.pri]) a.push('-color_primaries',String(EC_PRI[c.pri]));
    if(EC_TRC[c.trc]) a.push('-color_trc',String(EC_TRC[c.trc]));
    return a;
  }
  /* البطاقة: الصور الثلاث (آخر لقطة، الطبقة بشفافيّتها، والنهائيّة) تُدار وتُحجَّم وتُحوَّل مرّة واحدة ثمّ تتكرّر (loop) —
     التركيب إطارًا إطارًا في التلاشي وحده (xfade ودمج RGBA على كلّ الإطارات كانا ٣٫٥–٨ ث للبطاقة وحدها). صوتها صمت بخصائص الأصل. */
  function ecCardArgs(pl){
    var fast=pl.fast, fps=pl.fps, W=fast?pl.w:pl.ow, H=fast?pl.h:pl.oh, pix=(fast&&pl.v.pix==='yuvj420p')?'yuvj420p':'yuv420p';
    var a=fast?pl.a:{sr:48000,layout:'stereo'}, lp='loop=loop=-1:size=1:start=0';
    var args=['-hide_banner','-y','-framerate',fps,'-i','ec_last.png','-framerate',fps,'-i','ec_over.png','-framerate',fps,'-i','ec_end.png'];
    if(pl.a) args.push('-f','lavfi','-t',String(EC_SEC),'-i','anullsrc=r='+a.sr+':cl='+a.layout);
    var pre=((fast&&EC_TRANS[pl.rot])?EC_TRANS[pl.rot]+',':'')+'scale='+W+':'+H+':out_color_matrix='+ecMatrix(pl)+',setsar=1';
    args.push('-filter_complex','[0:v]'+pre+',format=yuv420p,'+lp+',trim=duration='+EC_FADE+'[b];'
      +'[1:v]'+pre+',format=yuva420p,'+lp+',trim=duration='+EC_FADE+',fade=t=in:st=0:d='+EC_FADE+':alpha=1[o];'
      +'[b][o]overlay=format=yuv420,format='+pix+'[f];'
      +'[2:v]'+pre+',format='+pix+','+lp+',trim=duration='+(EC_SEC-EC_FADE).toFixed(2)+'[h];[f][h]concat=n=2:v=1:a=0[v]');
    if(pl.a&&fast&&pl.order==='av') args.push('-map','3:a','-map','[v]');
    else { args.push('-map','[v]'); if(pl.a) args.push('-map','3:a'); }
    args.push('-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt',pix,'-r',fps); args.push.apply(args,ecTags(pl));
    if(fast&&pl.v.tbn>0&&pl.v.tbn===Math.round(pl.v.tbn)) args.push('-video_track_timescale',String(pl.v.tbn));
    if(pl.a) args.push('-c:a','aac','-b:a','128k','-ar',String(a.sr),'-ac',a.layout==='mono'?'1':'2');
    args.push('-t',String(EC_SEC),'ec_card.mp4');
    return args;
  }
  /* الدمج: السريع بقائمة ffconcat ونسخ الدفقات (المرمّزات المختلفة تتبدّل إعداداتها داخل الدفق)، والبطيء مرشّح concat وترميز واحد */
  function ecJoinArgs(pl,input){
    if(pl.fast) return ['-hide_banner','-y','-f','concat','-safe','0','-i','/ec_list.txt','-map','0:v:0','-map','0:a:0?','-c','copy','-movflags','+faststart','ec_out.mp4'];
    var W=pl.ow, H=pl.oh, fps=pl.fps, M=ecMatrix(pl); /* الأصل بمصفوفة البطاقة في الطرفين: YUV يمرّ كما هو، وRGB (Animation/PNG في mov) يُحوَّل بها لا بـ601 (مراجعة ثانية) */
    var fc=['[0:'+pl.v.i+']scale='+W+':'+H+':in_color_matrix='+M+':out_color_matrix='+M+',setsar=1,fps='+fps+',format=yuv420p[m]','[1:v]scale='+W+':'+H+',setsar=1,fps='+fps+',format=yuv420p[c]'];
    if(pl.a) fc.push('[0:'+pl.a.i+']aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[ma]','[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[ca]','[m][ma][c][ca]concat=n=2:v=1:a=1[v][a]');
    else fc.push('[m][c]concat=n=2:v=1:a=0[v]');
    var args=['-hide_banner','-y','-i',input,'-i','ec_card.mp4','-filter_complex',fc.join(';'),'-map','[v]'];
    if(pl.a) args.push('-map','[a]');
    args.push('-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p'); args.push.apply(args,ecTags(pl)); /* قيم الأصل تمرّ كما هي: وسومه معها */
    if(pl.a) args.push('-c:a','aac','-b:a','160k');
    args.push('-movflags','+faststart','ec_out.mp4');
    return args;
  }
  function ecName(n){ var b=String(n||'video').replace(/\.[A-Za-z0-9]{2,4}$/,'').replace(/[\\/:*?"<>|]+/g,'_').slice(-100)||'video'; return b+'-om-ai.mp4'; }
  /* الطبقة بمقاس العرض: تعتيم وظلّ أعمق في الوسط (كتابة الفيديو الأصليّة لا تزاحم السطرين)، لوح أبيض مدوّر فيه الباركود بوحدات صحيحة
     (بلا تنعيم)، ثمّ «حمّل تطبيق om ai» ذهبيًّا والرابط أبيض — كالنموذج الذي وافق عليه المالك. الباركود يحمل /app
     (صفحة التحميل) والمكتوب تحته النطاق وحده */
  function ecOverlay(dw,dh,line){
    var c=document.createElement('canvas'); c.width=dw; c.height=dh;
    var x=c.getContext('2d'), m=Math.min(dw,dh), FONT="Tajawal, 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif";
    var U=ecUrl(), Q=U+'/app', q=window.OmranQR.matrix(Q), n=q.size+8, unit=Math.max(2,Math.floor(m*(dw<dh?0.5:0.42)/n)), S=unit*n;
    var F1=Math.max(14,Math.round(m*0.058)), F2=Math.max(11,Math.round(m*0.036)), g1=Math.round(m*0.05), g2=Math.round(m*0.022);
    var top=Math.round((dh-(S+g1+F1+g2+F2))/2), qx=Math.round((dw-S)/2), r=Math.round(S*0.07), cy=top+(S+g1+F1+g2+F2)/2;
    x.fillStyle='rgba(0,0,0,.5)'; x.fillRect(0,0,dw,dh);
    var g=x.createRadialGradient(dw/2,cy,0,dw/2,cy,Math.max(dw,dh)*0.6); g.addColorStop(0,'rgba(0,0,0,.5)'); g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g; x.fillRect(0,0,dw,dh);
    var qc=document.createElement('canvas'); window.OmranQR.draw(qc,Q,{px:S}); /* رابط التحميل الواحد (v-qr-one): كلّ جهاز إلى متجره — لا الصفحة الرئيسيّة */
    x.save(); x.beginPath(); x.moveTo(qx+r,top); x.arcTo(qx+S,top,qx+S,top+S,r); x.arcTo(qx+S,top+S,qx,top+S,r); x.arcTo(qx,top+S,qx,top,r); x.arcTo(qx,top,qx+S,top,r); x.closePath();
    x.fillStyle='#fff'; x.fill(); x.clip(); x.imageSmoothingEnabled=false; x.drawImage(qc,qx,top,S,S); x.restore();
    x.textAlign='center'; x.textBaseline='alphabetic'; x.shadowColor='rgba(0,0,0,.7)'; x.shadowBlur=Math.round(m*0.012); x.shadowOffsetY=Math.round(m*0.003);
    var fit=function(t,size,w){ var s=size; x.font=w+' '+s+'px '+FONT; while(s>10&&x.measureText(t).width>dw*0.9){ s--; x.font=w+' '+s+'px '+FONT; } };
    x.direction=/[֐-ࣿיִ-﷿ﹰ-﻿]/.test(line)?'rtl':'ltr'; fit(line,F1,'700'); x.fillStyle='#f2d164'; x.fillText(line,dw/2,top+S+g1+F1*0.8);
    var url=U.replace(/^https?:\/\//,''); x.direction='ltr'; fit(url,F2,'700'); x.fillStyle='#ffffff'; x.fillText(url,dw/2,top+S+g1+F1+g2+F2*0.8);
    return c;
  }
  /* آخر لقطة كما تُعرض: مشغّل المتصفّح (فكّ بالعتاد والدوران مطبَّق). إطار لم يُرسم بعد يُرسم شفّافًا (كان يخرج أسود) — ننتظر أوّل
     بكسل معتم حتّى ثانيتين، وإلّا فالأداة تأخذه */
  function ecGrab(url,ms){
    return new Promise(function(res){
      var v=document.createElement('video'), done=false, tm=0;
      var fin=function(c){ if(done) return; done=true; clearTimeout(tm); v.onseeked=v.onerror=v.onloadedmetadata=null; v.removeAttribute('src'); try{ v.load(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:ec-grab'); /* guard-ok — بلا مصدر */ } res(c); };
      tm=setTimeout(function(){ fin(null); },ms||8000);
      v.muted=true; v.playsInline=true; v.preload='auto';
      v.onloadedmetadata=function(){
        var d=v.duration;
        if(!(isFinite(d)&&d>0)||!v.videoWidth){ fin(null); return; }
        v.onseeked=function(){
          var tries=0, pc=document.createElement('canvas'); pc.width=pc.height=8; var px=pc.getContext('2d',{willReadFrequently:true});
          (function look(){
            try{
              px.clearRect(0,0,8,8); px.drawImage(v,0,0,8,8);
              var a=px.getImageData(0,0,8,8).data;
              for(var i=3;i<a.length;i+=4) if(a[i]){ var c=document.createElement('canvas'); c.width=v.videoWidth; c.height=v.videoHeight; c.getContext('2d').drawImage(v,0,0,c.width,c.height); fin(c); return; }
            }catch(e){ fin(null); return; }
            if(++tries>40){ fin(null); return; }
            setTimeout(look,50);
          })();
        };
        v.currentTime=Math.max(0,d-0.02); /* داخل آخر إطار */
      };
      v.onerror=function(){ fin(null); };
      v.src=url;
    });
  }
  function ecQr(){
    if(window.OmranQR) return Promise.resolve();
    return new Promise(function(res,rej){ var s=document.createElement('script'); s.src='/js/qr.js?v=1'; s.onload=res; s.onerror=function(){ rej(new Error('qr')); }; document.head.appendChild(s); });
  }
  function ecFonts(t){
    try{
      if(!document.fonts||!document.fonts.load) return Promise.resolve();
      return Promise.race([document.fonts.load('700 40px Tajawal',String(t||'')+' عربي'),new Promise(function(r){ setTimeout(r,2500); })])
        .catch(function(e){ typeof __swallow === 'function' && __swallow(e, 'video:ec-font'); /* guard-ok — الخطّ البديل يكفي */ });
    }catch(e){ return Promise.resolve(); }
  }
  function ecPng(c){ return new Promise(function(res,rej){ c.toBlob(function(b){ if(!b) return rej(new Error('png')); b.arrayBuffer().then(function(ab){ res(new Uint8Array(ab)); },rej); },'image/png'); }); }
  function ecStale(my){ if(my!==EC.run) throw {code:'stale'}; }
  function ecKill(){ var f=EC.ff; EC.ff=null; if(f){ try{ f.terminate(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:ec-kill'); /* guard-ok — العامل انتهى */ } } }
  /* آخر لقطة بالأداة بمصفوفة البطاقة (مراجعة ثانية): PNG بلا وسوم ألوان — مرمّزه ينقل وسوم الأصل إلى gAMA/cHRM فيديره المتصفّح فتبدأ
     البطاقة أفتح بنحو ٨ درجات — وبدقّة التحويل الكاملة. النافذة من آخر الحاوية أوّلًا ثمّ من آخر دفق الفيديو نفسه: صوت أطول أو لقطة
     أخيرة ممدودة تترك نافذة الحاوية فارغة (كانت تفشل، أو ترمّز مئات اللقطات PNG). ولا ICC (iCCP) من بيانات الإطار: سفاري يتجاهل
     colorSpaceConversion (مراجعة ثالثة) */
  async function ecLast(ff,input,pl,my){
    var vf='scale=in_color_matrix='+ecMatrix(pl)+':flags=accurate_rnd+full_chroma_int,format=rgb24,setparams=color_primaries=unknown:color_trc=unknown,sidedata=mode=delete';
    var grab=async function(at){
      await ff.exec(['-hide_banner','-y'].concat(at,['-i',input,'-map','0:'+pl.v.i,'-an','-sn','-dn','-vf',vf,'-update','1','ec_last.png'])); ecStale(my);
      var bm=null;
      try{ var png=await ff.readFile('ec_last.png'); if(png&&png.length) bm=await createImageBitmap(new Blob([png],{type:'image/png'}),{colorSpaceConversion:'none'}); }catch(e){ bm=null; /* guard-ok — لا إطار في هذا المدى */ }
      ecStale(my); return bm;
    };
    var f=await grab(['-sseof','-0.3']), end=-1;
    if(f) return f;
    await ff.exec(['-hide_banner','-y','-i',input,'-map','0:'+pl.v.i,'-c','copy','-f','framecrc','ec_vts.txt']); ecStale(my); /* حزم الفيديو بلا فكّ: آخر توقيت عرض */
    try{ var t=new TextDecoder().decode(await ff.readFile('ec_vts.txt')), tb=/^#tb 0: (\d+)\/(\d+)\s*$/m.exec(t); if(tb) t.replace(/^0,\s*-?\d+,\s*(-?\d+),.*$/gm,function(m,p){ var fl=/F=0x([0-9a-f]+)/i.exec(m); if(!(fl&&parseInt(fl[1],16)&4)) end=Math.max(end,p*tb[1]/tb[2]); return m; }); }catch(e){ end=-1; /* guard-ok — بلا قراءة: نوافذ الحاوية كما كانت */ }
    ecStale(my); /* حزمة F=0x4 (مقصوصة بقائمة التحرير) يُفكّ إطارها ولا يُعرض: لا تُحسب */
    /* من آخر عرض ٠٫٣ و٣ و١٥ ث (الفيديو الأقصر منها من أوّله بلا قفز)، ثمّ نوافذ الحاوية كما كانت قبل المراجعتين؛ المكرّر لا يُعاد */
    for(var w=[0.3,3,15],tries=[],seen={},i=0,k;i<w.length&&end>=0;i++) tries.push(end>w[i]?['-ss',(end-w[i]).toFixed(3)]:[]);
    tries.push(['-sseof','-3'],['-sseof','-15']);
    for(i=0;i<tries.length&&!f;i++){ k=tries[i].join(' '); if(seen[k]) continue; seen[k]=1; f=await grab(tries[i]); }
    return f;
  }
  /* المسار كلّه لملفّ واحد ← File mp4 جاهز للعرض والنشر. نسخة أداة خاصّة به تُنهى بعده (الذاكرة على الجوّال) */
  async function ecMake(file,my,pct){
    var shown=0, up=function(v){ if(my===EC.run&&v>shown){ shown=v; pct(v); } }; /* الرقم لا يرجع، وعمل أُلغي لا يكتب (مراجعة ثانية) */
    var mod=await import('/ffmpeg/lib/index.js'); ecStale(my);
    var ff=new mod.FFmpeg(); EC.ff=ff; /* الإلغاء أثناء التحميل يُنهي هذه النسخة نفسها */
    await Promise.race([ff.load({coreURL:'/ffmpeg/core/ffmpeg-core.js',wasmURL:'/ffmpeg/core/ffmpeg-core.wasm',classWorkerURL:'/ffmpeg/lib/worker.js'}),
      new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('ffmpeg load timeout')); },120000); })]);
    ecStale(my); up(6);
    var log=[], span=[0,0,0]; /* قبل البطاقة لا تقدّم من الأداة: أخذ آخر لقطة كان يعيد الرقم إلى ٠٪ */
    ff.on('log',function(e){ log.push((e&&e.message)||''); if(log.length>400) log.shift(); });
    ff.on('progress',function(e){ var t=(+(e&&e.time)||0)/1e6; if(t>0&&t<1e9&&span[2]>0) up(span[0]+(span[1]-span[0])*Math.min(1,t/span[2])); }); /* وقت هائل = «لا حزمة بعد»: كان يقفز إلى آخر المرحلة ثمّ يرجع */
    await ff.createDir('/ecin');
    await ff.mount('WORKERFS',{blobs:[{name:'input',data:file}]},'/ecin'); /* يُقرأ من الملفّ مباشرة بلا نسخه في الذاكرة */
    var input='/ecin/input';
    log=[]; await ff.exec(['-hide_banner','-i',input]); ecStale(my); /* بلا مخرج: يفشل عمدًا ويطبع المعلومات */
    var info=ecParse(log.join('\n')), au=info.streams.filter(function(x){ return x.kind==='a'; })[0];
    if(au){ /* مقياس زمن الصوت لا يطبعه «-i»: حزمة واحدة إلى framecrc في ملفّ (لصق النسخ يفترضه معدّل العيّنة كما في البطاقة) */
      await ff.exec(['-hide_banner','-y','-i',input,'-map','0:'+au.i,'-c','copy','-frames:a','1','-f','framecrc','ec_tb.txt']); ecStale(my);
      try{ var tb=/^#tb 0: 1\/(\d+)\s*$/m.exec(new TextDecoder().decode(await ff.readFile('ec_tb.txt'))); info.atb=tb?+tb[1]:0; }catch(e){ info.atb=0; /* guard-ok — بلا قراءة: إعادة الترميز الكاملة آمنة */ }
    }
    ecStale(my); /* إلغاء أثناء القراءة تبتلعه القراءة: لا يكمل */
    var mob=ecMob(), pl=ecPlan(info,file.size,mob);
    if(!pl.ok) throw {code:ecWhy(pl,info,file.size,mob)};
    up(8);
    var line=L('vdEcLine')||'حمّل تطبيق om ai';
    await Promise.all([ecQr(),ecFonts(line)]); ecStale(my);
    var frame=null, bgrab=async function(){ var url=URL.createObjectURL(file); try{ return await ecGrab(url,8000); }finally{ URL.revokeObjectURL(url); } };
    /* H.264: المتصفّح يفكّه بالمصفوفة التي يحسبها ecMatrix (مقيسة). البطيء لا: فكّه لـVP9/HEVC بلا وسم بغيرها (VP9 = 601 مقيسًا) فتقفز
       ألوان البطاقة — الأداة تفكّ آخر لقطته بمصفوفة البطاقة نفسها، والمتصفّح آخر حلّ (لون يختلف قليلًا خير من لا بطاقة) */
    if(pl.fast){ frame=await bgrab(); ecStale(my); }
    if(!frame) frame=await ecLast(ff,input,pl,my);
    if(!frame&&!pl.fast){ frame=await bgrab(); ecStale(my); }
    if(!frame) throw {code:'frame'};
    var dw=pl.fast?pl.dw:pl.ow, dh=pl.fast?pl.dh:pl.oh, base=document.createElement('canvas'); /* السريع: كما يُعرض (يُدار للتخزين)؛ البطيء: مقاس المخرج نفسه */
    base.width=dw; base.height=dh; base.getContext('2d').drawImage(frame,0,0,dw,dh);
    var over=ecOverlay(dw,dh,line), end=document.createElement('canvas'); end.width=dw; end.height=dh;
    var ex=end.getContext('2d'); ex.drawImage(base,0,0); ex.drawImage(over,0,0);
    await ff.writeFile('ec_last.png',await ecPng(base)); await ff.writeFile('ec_over.png',await ecPng(over)); await ff.writeFile('ec_end.png',await ecPng(end));
    ecStale(my); up(12);
    var cut=pl.fast?40:20;
    span=[12,cut,EC_SEC]; if(await ff.exec(ecCardArgs(pl))!==0) throw {code:'card',log:log.slice(-6).join(' | ')};
    ecStale(my); up(cut);
    if(pl.fast) await ff.writeFile('/ec_list.txt',new TextEncoder().encode("ffconcat version 1.0\nfile '"+input+"'\nfile '/ec_card.mp4'\n"));
    span=[cut,99,(pl.dur||0)+EC_SEC]; if(await ff.exec(ecJoinArgs(pl,input))!==0) throw {code:'join',log:log.slice(-6).join(' | ')};
    ecStale(my);
    var data=await ff.readFile('ec_out.mp4'); ecStale(my);
    if(!(data&&data.length>1000)) throw {code:'empty'};
    if(data.length>UP_MAX_MB*1048576) throw {code:'big'}; /* فوق حدّ النشر بعد الإضافة — ولا جهاز آخر يغيّره */
    return new File([data],ecName(file.name),{type:'video/mp4'});
  }
  function ecMine(){ return !!(EC.src&&upShown()&&(DR.out===EC.src.url||(EC.out&&DR.out===EC.out.url))); } /* المعروض هو المرفوع (أصله أو بالباركود) */
  function ecPct(p){ upMsg(drT('vdEcWork',{p:Math.max(0,Math.min(99,Math.round(p)))})); }
  /* تبديل المعروض بين الأصل وما أُضيف له الباركود: ملفّ آخر عند الخادم (pbNewVideo)، والنصّ المكتوب وما شاله المالك من المنصّات أثناء
     الانتظار يبقيان (كانت المنصّات كلّها تُؤشَّر من جديد فيُنشر فيما شاله — مراجعة مستقلّة) */
  function ecShow(f,type,url){
    DR.file=f; DR.fileType=type; DR.fileUrl=DR.out=url; pbNewVideo(true);
    var vid=id('vdVideo'), dl=id('vdDl');
    if(vid) vid.src=url;
    if(dl){ dl.href=url; dl.setAttribute('download',String(f.name||'').replace(/[\\/:*?"<>|]+/g,'_').slice(-120)||'video.mp4'); }
    syncDirector();
  }
  function ecCancel(){ EC.run++; ecKill(); EC.busy=false; }
  function ecDrop(keep){ /* ملفّ جديد: ما سبق يُلغى وتُحرَّر روابطه (إلّا المعروض — upPick يحرّره) */
    ecCancel();
    [EC.src&&EC.src.url,EC.out&&EC.out.url].forEach(function(u){ if(u&&u!==keep){ try{ URL.revokeObjectURL(u); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:ec-revoke'); /* guard-ok — رابط زال */ } } });
    EC.src=null; EC.out=null; EC.skip=null;
  }
  async function ecStart(){
    var src=EC.src; if(!src||!drOwner()||!ecMine()||DR.busy||PB.busy||ER.busy) return; /* أثناء مسح الكتابة لا: يبدأ بعده على الممسوح */
    if(EC.out&&EC.out.of===src.file){ ecShow(EC.out.file,'video/mp4',EC.out.url); upMsg(L('vdEcDone')); return; } /* أُضيف قبل: بلا إعادة */
    ecCancel(); var my=++EC.run; EC.busy=true; EC.skip=null; ecPct(0); syncDirector();
    try{
      var f=await ecMake(src.file,my,ecPct);
      if(my!==EC.run||EC.src!==src||DR.out!==src.url) return; /* أُلغي أو تغيّر المعروض أثناء العمل */
      EC.out={of:src.file,file:f,url:URL.createObjectURL(f)};
      ecShow(f,'video/mp4',EC.out.url); upMsg(L('vdEcDone'));
    }catch(e){
      if(my!==EC.run||(e&&e.code==='stale')) return;
      var code=String((e&&e.code)||''), heavy=code==='heavy';
      EC.skip=src.file; upMsg(heavy?L('vdEcHeavy'):L('vdEcFail'),true); /* الأصل يبقى معروضًا والخيار يظهر مطفأً لهذا الملفّ */
      if(!heavy&&code!=='big'){ try{ __swallow(e,'director:endcard '+String((e&&(e.code||e.message))||'')+' '+String((e&&e.log)||'')); }catch(x){ typeof __swallow === 'function' && __swallow(x, 'video:ec-log'); /* guard-ok — لا مسجّل */ } }
    }finally{
      if(my===EC.run){ EC.busy=false; ecKill(); syncDirector(); }
    }
  }
  /* رُفع المعروض للنشر (له اسم عند الخادم): لا تبديل بعده — التبديل يبدأ لوحة جديدة فتعود منصّات أخذته مؤشَّرة ويُرفع الملفّ نفسه باسم
     جديد لا يمنعه حجز الخادم (نشر مكرّر). ملفّ جديد يفكّ القفل */
  function ecLocked(){ return ecMine()&&!!PB.vid; }
  function ecToggle(on){
    if(ecLocked()){ syncDirector(); return; }
    ecSetPref(on); EC.skip=null;
    if(!ecMine()||DR.busy||PB.busy||ER.busy){ syncDirector(); return; } /* أثناء المسح: التفضيل وحده، والمسح يبدأ الباركود بعده إن كان مشغَّلًا */
    if(on){ ecStart(); return; }
    ecCancel(); upMsg('');
    if(DR.out!==EC.src.url) ecShow(EC.src.file,EC.src.type,EC.src.url); else syncDirector();
  }
  /* ═══ v-director-erase (المالك ١١ نوفمبر: «تنضيف الفيديو قبل النشر يعني علي اسم ولا كتابه اي شي اقدر اشيلها»، ثمّ «شوف الارخص» و«ابد»):
     «امسح اسم أو كتابة» تحت صندوق الرفع: لقطة من الفيديو المرفوع يرسم عليها المالك مربّعات، فتُمسح من الفيديو كلّه قبل النشر —
     «مجانًا» في الجهاز (delogo يملأ المربّع من حوافه، بأداة الفيديو نفسها وفي ترميز واحد)، أو «بالذكاء»: شريط حول المربّعات يُقطَّع
     مقاطع ≤١٩٧ إطارًا ويُرفع مع قناعه (أسود = امسح) إلى نموذج مسح عند المزوّد بمفتاح التطبيق (٥ سنت للمقطع، بموافقة لكلّ تشغيل وسقف
     يوميّ في الخادم — api/_lib/video-erase.js)، ثمّ تُركَّب النتيجة داخل المربّعات وحدها بحواف ناعمة (النموذج يعيد رسم الشريط كلّه)،
     والمقطع الذي لا يرجع يُمسح مجانًا. الناتج H.264/AAC يصير مصدر الباركود (مساره السريع)، والأصل يبقى: «رجّع الأصل» يعيده. ═══ */
  var ER={run:0,busy:false,ff:null,xhr:null,boxes:[],orig:null,out:null,v:null,drag:null,t:0,dur:0,paid:false,note:null};
  var ER_MAXB=8, ER_CH=197, ER_CENTS=5, ER_MAXCH=30;
  function erStale(my){ if(my!==ER.run) throw {code:'stale'}; }
  function erKill(){
    var f=ER.ff, x=ER.xhr; ER.ff=null; ER.xhr=null;
    if(x){ try{ x.abort(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:er-abort'); /* guard-ok — رفع انتهى */ } }
    if(f){ try{ f.terminate(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:er-kill'); /* guard-ok — العامل انتهى */ } }
  }
  function erCancel(){ ER.run++; erKill(); ER.busy=false; ER.paid=false; }
  function erRevoke(u,keep){ if(u&&u!==keep){ try{ URL.revokeObjectURL(u); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:er-revoke'); /* guard-ok — رابط زال */ } } }
  /* ملفّ جديد أو توليد: المسح الجاري يُلغى والمحرّر يُغلق، والأصل المحفوظ يُحرَّر إن لم يكن مصدر الباركود (ecDrop يحرّر ذاك والممسوح) */
  function erDrop(keep){
    erCancel(); erShut();
    if(ER.orig&&!(EC.src&&EC.src.url===ER.orig.url)) erRevoke(ER.orig.url,keep);
    ER.orig=null; ER.out=null; ER.boxes=[]; ER.dur=0; ER.note=null;
  }
  function erShown(){ return !!(ER.orig&&ecMine()); } /* المعروض فيديو مرفوع: أصله أو ممسوحه، بالباركود أو بدونه */
  function erLock(){ return DR.busy||PB.busy||ER.busy||ecLocked(); } /* رُفع المعروض للنشر: لا تبديل بعده (كالباركود) */
  function erSay(k,p,x){ upMsg(drT(k,Object.assign({p:Math.max(0,Math.min(99,Math.round(p)))},x||{}))); }
  function erName(n){ var b=String(n||'video').replace(/\.[A-Za-z0-9]{2,4}$/,'').replace(/[\\/:*?"<>|]+/g,'_').slice(-100)||'video'; return b+'-clean.mp4'; }
  function erFpsNum(f){ var m=/^(\d+)\/(\d+)$/.exec(String(f)); return m?(+m[1])/(+m[2]):(+f||30); }
  function erPad(i){ return ('00'+i).slice(-3); }
  function erSleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  /* مربّع (نسب من اللقطة) ← بكسلات الإطار كما يدخل المرشّحات (بعد الدوران، قبل SAR) بهامش صغير يغطّي حواف الحروف المنعَّمة،
     وداخل الإطار ببكسل على الأقلّ من كلّ جهة — delogo على الحافّة نفسها يرفض السلسلة كلّها («Logo area is outside of the frame») */
  function erPx(b,W,H){
    var p=Math.max(2,Math.round(Math.min(W,H)*0.006));
    var x=Math.floor(b.x*W+1e-6)-p, y=Math.floor(b.y*H+1e-6)-p, x2=Math.ceil((b.x+b.w)*W-1e-6)+p, y2=Math.ceil((b.y+b.h)*H-1e-6)+p; /* ٠٫٥٥×٧٢٠ = ٣٩٦٫٠٠٠٠٠٠١ لا يصير ٣٩٧ */
    x=Math.max(1,Math.min(W-3,x)); y=Math.max(1,Math.min(H-3,y)); x2=Math.max(x+2,Math.min(W-1,x2)); y2=Math.max(y+2,Math.min(H-1,y2));
    return {x:x,y:y,w:x2-x,h:y2-y};
  }
  function erDelogo(rects){ return rects.map(function(r){ return 'delogo=x='+r.x+':y='+r.y+':w='+r.w+':h='+r.h; }).join(','); }
  /* المجّانيّ: ترميز واحد بمقاس البطيء ومصفوفته ووسومه (كالباركود)، والصوت AAC ستيريو ٤٨ك — فيأخذ الباركود بعده مساره السريع */
  function erFreeArgs(pl,input,boxes){
    var M=ecMatrix(pl), rects=boxes.map(function(b){ return erPx(b,pl.dw,pl.dh); });
    var args=['-hide_banner','-y','-i',input,'-filter_complex','[0:'+pl.v.i+']'+erDelogo(rects)+',scale='+pl.ow+':'+pl.oh+':in_color_matrix='+M+':out_color_matrix='+M+',setsar=1,fps='+pl.fps+',format=yuv420p[v]','-map','[v]'];
    if(pl.a) args.push('-map','0:'+pl.a.i);
    args.push('-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p'); args.push.apply(args,ecTags(pl));
    if(pl.a) args.push('-c:a','aac','-b:a','160k','-ar','48000','-ac','2');
    args.push('-movflags','+faststart','er_out.mp4');
    return args;
  }
  /* الشريط للذكاء: حول المربّعات بهامش سياق، بنسبة مقاس النموذج (٦٧٢×٣٨٤ أو مقلوبه) وأدنى ٤٤٨×٢٥٦، داخل الإطار وبأبعاد زوجيّة؛
     ومقاس الإرسال مضاعفات ١٦ بلا تكبير. المربّعات داخله بنسبه هو */
  function erBand(boxes,W,H){
    var px=boxes.map(function(b){ return erPx(b,W,H); });
    var x0=Math.min.apply(null,px.map(function(r){ return r.x; })), y0=Math.min.apply(null,px.map(function(r){ return r.y; }));
    var x1=Math.max.apply(null,px.map(function(r){ return r.x+r.w; })), y1=Math.max.apply(null,px.map(function(r){ return r.y+r.h; }));
    var tall=(y1-y0)>(x1-x0), ar=tall?384/672:672/384, m=Math.round(Math.max(24,0.06*Math.max(x1-x0,y1-y0))); /* هامش صغير: الشريط العريض تمدّه النسبة نفسها، وكلّ هامش زائد يصغّر ما يرجع داخل المربّع */
    var w=Math.max(x1-x0+2*m,tall?256:448), h=Math.max(y1-y0+2*m,tall?448:256);
    if(w/h<ar) w=Math.round(h*ar); else h=Math.round(w/ar);
    w=Math.min(W-(W%2),ecEven(w)); h=Math.min(H-(H%2),ecEven(h));
    var x=Math.round((x0+x1)/2-w/2), y=Math.round((y0+y1)/2-h/2);
    x=Math.max(0,Math.min(W-w,x)); y=Math.max(0,Math.min(H-h,y)); x-=x%2; y-=y%2;
    var k=Math.min(1,(tall?384:672)/w,(tall?672:384)/h), SW=Math.max(64,Math.round(w*k/16)*16), SH=Math.max(64,Math.round(h*k/16)*16);
    return {x:x,y:y,w:w,h:h,SW:SW,SH:SH,rects:px.map(function(r){ return {x:(r.x-x)/w,y:(r.y-y)/h,w:r.w/w,h:r.h/h}; })};
  }
  /* الشريط مقاطع بالضبط: مفتاح كلّ ١٩٧ إطارًا والمقسِّم يقطع عنده (هامش زمنيّ يمنع ضياع القطع بتقريب الوقت) */
  function erBandArgs(pl,input,B){
    var M=ecMatrix(pl), k=ER_CH;
    return ['-hide_banner','-y','-i',input,'-filter_complex','[0:'+pl.v.i+']crop='+B.w+':'+B.h+':'+B.x+':'+B.y+',scale='+B.SW+':'+B.SH+':in_color_matrix='+M+':out_color_matrix='+M+',setsar=1,fps='+pl.fps+',format=yuv420p[v]',
      '-map','[v]','-an','-c:v','libx264','-preset','ultrafast','-crf','12','-pix_fmt','yuv420p','-g',String(k),'-keyint_min',String(k),'-sc_threshold','0',
      '-force_key_frames','expr:eq(mod(n,'+k+'),0)','-f','segment','-segment_time',(k/erFpsNum(pl.fps)).toFixed(6),'-segment_time_delta','0.05','-reset_timestamps','1','erb_%03d.mp4'];
  }
  function erSnap(n){ return Math.min(197,Math.max(69,69+Math.ceil(Math.max(0,n-69)/8)*8)); } /* قيم النموذج: ٦٩، ٧٧ … ١٩٧ */
  /* قناع المقطع (أسود = امسح، أبيض = يبقى): صورة واحدة بمقاس الإرسال تتكرّر بعدد إطاراته، بلا فقد (qp 0) — رماديّ الحواف يقرؤه
     النموذج «منطقة متأثّرة» */
  function erMaskPng(B){
    var c=document.createElement('canvas'); c.width=B.SW; c.height=B.SH; var x=c.getContext('2d');
    x.fillStyle='#fff'; x.fillRect(0,0,B.SW,B.SH); x.fillStyle='#000';
    B.rects.forEach(function(r){ x.fillRect(Math.floor(r.x*B.SW),Math.floor(r.y*B.SH),Math.ceil(r.w*B.SW)+1,Math.ceil(r.h*B.SH)+1); });
    return ecPng(c);
  }
  function erMaskArgs(pl,L,name){ return ['-hide_banner','-y','-loop','1','-framerate',pl.fps,'-i','erm.png','-frames:v',String(L),'-vf','format=yuv420p','-c:v','libx264','-preset','ultrafast','-qp','0','-pix_fmt','yuv420p','-r',pl.fps,name]; }
  /* نتائج المقاطع شريطًا واحدًا بعدد إطارات الأصل: كلّ نتيجة تُقصّ إلى طول مقطعها (النموذج يكمّل القصير بتكرار آخر إطار)، والأقصر منه
     يُمدّ زمنيًّا؛ والمقطع الذي لم يرجع شريطه الأصليّ ممسوحًا مجانًا */
  function erJoinArgs(pl,segs,B){
    var args=['-hide_banner','-y'], fc=[], fpsN=erFpsNum(pl.fps);
    segs.forEach(function(s){ args.push('-i',s.r||s.n); });
    segs.forEach(function(s,j){
      var pre='['+j+':v]scale='+B.SW+':'+B.SH+',setsar=1,format=yuv420p,';
      if(!s.r) pre+=erDelogo(B.rects.map(function(r){ return erPx(r,B.SW,B.SH); }))+',';
      else if(s.rf<s.f) pre+='setpts=N*'+(s.f/s.rf/fpsN).toFixed(6)+'/TB,fps='+pl.fps+',';
      fc.push(pre+'trim=end_frame='+s.f+',setpts=PTS-STARTPTS[s'+j+']');
    });
    /* fps بعد setpts: concat يحمل معدّل مدخلاته إلى الوصلة (نتائج بـ١٢ إطارًا تبقى «١٢» بعد setpts) فيكرّر ‎-r‎ أوّل الإطارات ويتأخّر الممسوح
       ٢–٤ إطارات عن الفيديو كلّه — مقيس على النواة الحقيقيّة (مراجعة مستقلّة) */
    fc.push(segs.map(function(s,j){ return '[s'+j+']'; }).join('')+'concat=n='+segs.length+':v=1:a=0,setpts=N/('+fpsN.toFixed(6)+'*TB),fps='+pl.fps+'[v]');
    return args.concat(['-filter_complex',fc.join(';'),'-map','[v]','-c:v','libx264','-preset','ultrafast','-crf','12','-pix_fmt','yuv420p','-r',pl.fps,'erj.mp4']);
  }
  /* التركيب: الأصل بمقاس المخرج، والشريط فوقه بقناع ناعم داخل المربّعات وحدها (era.png — قناة الأخضر كاملة المدى ٠–٢٥٥ بلا تحويل) */
  /* القناع صورة تتكرّر أطول من الفيديو، وoverlay يكمل حتّى ينتهي آخر مدخلَيه (مقيس: ١٥ ث لفيديو ١٣) — alphamerge ينتهي بالشريط،
     والمخرج بعدد إطارات الأصل (n = مجموع المقاطع، من السلسلة نفسها) */
  function erCompArgs(pl,input,B,n){
    var qx=pl.ow/pl.dw, qy=pl.oh/pl.dh, bw=ecEven(B.w*qx), bh=ecEven(B.h*qy), bx=Math.round(B.x*qx), by=Math.round(B.y*qy), M=ecMatrix(pl);
    bx=Math.max(0,Math.min(pl.ow-bw,bx)); by=Math.max(0,Math.min(pl.oh-bh,by));
    var fc=['[0:'+pl.v.i+']scale='+pl.ow+':'+pl.oh+':in_color_matrix='+M+':out_color_matrix='+M+',setsar=1,fps='+pl.fps+',format=yuv420p[base]',
      '[1:v]scale='+bw+':'+bh+',setsar=1,format=yuva420p[b]','[2:v]scale='+bw+':'+bh+',format=gbrp,extractplanes=g[al]','[b][al]alphamerge=shortest=1[ba]',
      '[base][ba]overlay=x='+bx+':y='+by+':format=yuv420:eof_action=repeat,format=yuv420p[v]'];
    var args=['-hide_banner','-y','-i',input,'-i','erj.mp4','-loop','1','-framerate',pl.fps,'-t',String(Math.ceil((pl.dur||0)+1)),'-i','era.png','-filter_complex',fc.join(';'),'-map','[v]','-frames:v',String(n)];
    if(pl.a) args.push('-map','0:'+pl.a.i);
    args.push('-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p'); args.push.apply(args,ecTags(pl));
    if(pl.a) args.push('-c:a','aac','-b:a','160k','-ar','48000','-ac','2');
    args.push('-movflags','+faststart','er_out.mp4'); /* المخرج ينتهي بنهاية الأصل (overlay)، والصوت الأقصر لا يقصّ الصورة */
    return {args:args,w:bw,h:bh};
  }
  function erAlphaPng(B,w,h){
    var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'), f=Math.max(1,Math.round(Math.min(w,h)*0.012)), g=Math.ceil(f*2.5);
    x.fillStyle='#000'; x.fillRect(0,0,w,h); x.filter='blur('+f+'px)'; x.fillStyle='#fff';
    /* الحافّة الناعمة كلّها خارج المربّع: التعبئة تكبر ٢٫٥σ فأضلاع المربّع ≥ ٩٩٪ (وزواياه ≥ ٩٨٪) — كانت تكبر σ وحدها فحافّته ٨٤٪ وحرف عليها يطلّ (مراجعة) */
    B.rects.forEach(function(r){ x.fillRect(r.x*w-g,r.y*h-g,r.w*w+2*g,r.h*h+2*g); });
    return ecPng(c);
  }
  function erApi(op,body){
    return fetch('/api/media?action=video-erase&op='+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({token:drTok()},body||{}))})
      .then(function(r){ return r.json().catch(function(){ return {ok:false,error:'http',status:r.status}; }); });
  }
  function erPut(url,ctype,data,prog){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(), bad=function(){ rej({code:'upload',status:x.status}); };
      x.open('PUT',url,true); x.timeout=600000; x.setRequestHeader('Content-Type',ctype);
      x.upload.onprogress=function(e){ if(e.lengthComputable) prog(e.loaded); };
      x.onload=function(){ if(x.status>=200&&x.status<300) res(); else bad(); };
      x.onerror=bad; x.ontimeout=bad; x.onabort=bad;
      ER.xhr=x; x.send(new Blob([data],{type:ctype}));
    });
  }
  async function erFetch(u){ /* عبر وسيط التنزيل عندنا (كالتحسين الاحترافيّ): جلب رابط المزوّد مباشرة يخزّنه عامل الخدمة */
    var px=(typeof window.__omranProxyVideoUrl==='function')?window.__omranProxyVideoUrl(String(u||'')):'';
    if(!/^\/api\//.test(px||'')) throw new Error('no proxy');
    var tk=drTok(), r=await fetch(px,tk?{headers:{Authorization:'Bearer '+tk}}:undefined);
    if(!r.ok) throw new Error('proxy '+r.status);
    return new Uint8Array(await (await r.blob()).arrayBuffer());
  }
  /* عدد إطارات ملفّ بحزمه بلا فكّ. ملفّ تالف يفشل أمره فيبقى erc.txt السابق — كان يُعدّ إطاراته فيدخل التالف الدمج ويُسقطه (مقيس في
     التطبيق نفسه): الفشل صفر، والسطر المرفوض (DISCARD) لا يُعدّ */
  async function erFrames(ff,name,my){
    try{ await ff.deleteFile('erc.txt'); }catch(e){ e=null; /* guard-ok — أوّل عدّ: لا ملفّ سابق (لا يُسجَّل في ملاحظات النظام) */ }
    erStale(my);
    var ret=await ff.exec(['-hide_banner','-y','-i',name,'-map','0:v:0','-c','copy','-f','framecrc','erc.txt']); erStale(my);
    var n=0;
    if(ret===0){ try{ (new TextDecoder().decode(await ff.readFile('erc.txt')).match(/^0,.*$/gm)||[]).forEach(function(l){ var fl=/F=0x([0-9a-f]+)/i.exec(l); if(!(fl&&parseInt(fl[1],16)&4)) n++; }); }catch(e){ n=0; /* guard-ok — بلا إطارات */ } }
    erStale(my); return n;
  }
  /* مدّة دفق الفيديو وحده بلا فكّ (framecrc): Duration الحاوية يمتدّ بأطول دفق — صوت أطول من الفيديو كان يرفض فيديو يسعه الحدّ
     (مراجعة ثانية). 0 = لم تُعرف: الفحص بعد ترميز الشريط يكفي */
  async function erVidSpan(ff,input,vi,my){ /* vi: دفق الفيديو الذي يرمَّز منه الشريط (لا صورة غلاف) */
    try{ await ff.deleteFile('erc.txt'); }catch(e){ e=null; /* guard-ok — لا ملفّ سابق (لا يُسجَّل في ملاحظات النظام) */ }
    erStale(my);
    var ret=await ff.exec(['-hide_banner','-y','-i',input,'-map','0:'+vi,'-c','copy','-f','framecrc','erc.txt']); erStale(my);
    var tb=null, lo=Infinity, hi=-Infinity;
    if(ret===0){ try{
      var txt=new TextDecoder().decode(await ff.readFile('erc.txt'));
      tb=/^#tb 0: (\d+)\/(\d+)/m.exec(txt);
      (txt.match(/^0,.*$/gm)||[]).forEach(function(l){
        var fl=/F=0x([0-9a-f]+)/i.exec(l); if(fl&&parseInt(fl[1],16)&4) return; /* حزم القصّ لا تُعرض */
        var q=l.split(','), pts=+q[2], d=+q[3]; if(!isFinite(pts)||Math.abs(pts)>9e15) return; /* بلا توقيت */
        lo=Math.min(lo,pts); hi=Math.max(hi,pts+(d>0?d:0));
      });
    }catch(e){ tb=null; /* guard-ok — بلا عدّ: الفحص بعد الترميز */ } }
    erStale(my);
    return (tb&&+tb[2]>0&&hi>lo)?(hi-lo)*(+tb[1])/(+tb[2]):0;
  }
  async function erAi(ff,input,pl,boxes,my,up,setSpan,log){
    var B=erBand(boxes,pl.dw,pl.dh), segs=[], i;
    /* أكثر من ٣٠ مقطعًا (حدّ الخادم): يُقال قبل ترميز الشريط وبرسالته — كانت «ما قدرت» عامّة بعده (مراجعة). مدّة الحاوية حدّ أعلى بلا
       تكلفة، وإن تجاوزته فمدّة دفق الفيديو نفسه (الحاوية تمتدّ بأطول دفق — مراجعة ثانية)؛ وإطاران سماحًا لتقريب الطرفين: ما فات يقوله
       الفحص بعد الترميز */
    var fpsN=erFpsNum(pl.fps), over=function(sec){ return Math.ceil((Math.round(sec*fpsN)-2)/ER_CH)>ER_MAXCH; };
    if(over(pl.dur||0)&&over(await erVidSpan(ff,input,pl.v.i,my))) throw {code:'long'};
    setSpan([6,14,pl.dur||0,'vdErWork']);
    if(await ff.exec(erBandArgs(pl,input,B))!==0) throw {code:'band',log:log.slice(-6).join(' | ')};
    erStale(my);
    var names=((await ff.listDir('/'))||[]).map(function(d){ return d.name; }).filter(function(n){ return /^erb_\d{3}\.mp4$/.test(n); }).sort();
    erStale(my);
    for(i=0;i<names.length;i++){ var fr=await erFrames(ff,names[i],my); if(fr>0) segs.push({n:names[i],f:fr}); }
    if(!segs.length) throw {code:'band'};
    if(segs.length>ER_MAXCH) throw {code:'long'};
    var n=segs.length, cents=n*ER_CENTS;
    if(!window.confirm(drT('vdErConfirm',{n:n,c:cents}))) throw {code:'declined'}; /* إنفاق: موافقة لكلّ تشغيل بالعدد والسعر */
    erStale(my);
    await ff.writeFile('erm.png',await erMaskPng(B)); erStale(my);
    var masks={}, files=segs.map(function(s){ return s.n; }), mi={};
    for(i=0;i<segs.length;i++){ var L=segs[i].f; if(masks[L]) continue; masks[L]='erm_'+L+'.mp4'; if(await ff.exec(erMaskArgs(pl,L,masks[L]))!==0) throw {code:'mask'}; erStale(my); mi[L]=files.length; files.push(masks[L]); }
    var datas=[]; for(i=0;i<files.length;i++){ datas.push(await ff.readFile(files[i])); erStale(my); }
    var st=await erApi('start',{files:datas.map(function(d){ return {size:d.length,type:'video/mp4'}; }),chunks:segs.map(function(s,j){ return {v:j,m:mi[s.f],frames:s.f}; })});
    erStale(my);
    if(!st||!st.ok||!st.ups||st.ups.length!==datas.length) throw {code:(st&&st.error==='cap')?'cap':'ai',why:pbWhy(st)};
    var total=datas.reduce(function(a,d){ return a+d.length; },0)||1, sent=0;
    for(i=0;i<datas.length;i++){ await erPut(st.ups[i].put,st.ups[i].ctype||'video/mp4',datas[i],function(l){ up('vdErUp',15+20*(sent+l)/total); }); ER.xhr=null; sent+=datas[i].length; erStale(my); }
    /* الإرسال آمن تكراره: الخادم يحفظ «يُرسل» قبل الإرسال ويعيد حالته بعده بلا إرسال ثانٍ. فالجواب الضائع (انقطاع، صفحة خطأ، retry،
       busy) يُعاد، وما لم يُحسم يدخل الاستطلاع الذي يعيد الإرسال ما دامت «لم تُرسل» — كان يُرمى فيضيع ما دُفع (مراجعة مستقلّة).
       الحاسم بلا صرف يُقال ويرجع «غير مدفوع»: السقف والملفّات الغائبة (بعد إعادة) لا تصدر إلّا لمهمّة لم تُرسل، والمهمّة الغائبة لا شيء
       يُنتظر منها. ورفض الرمز أو الحساب أو الخدمة يصدر قبل قراءة المهمّة: حاسم ما لم يسبقه جواب ضائع، وبعده ربّما أرسلها الضائع فيُعاد
       كالانقطاع (مراجعة ثانية) */
    ER.paid=true; /* من هنا قد يُصرف: ملفّ جديد أو توليد في المخرج يسأل قبل أن يضيّعه */
    var res=null, tries=0, nu=0, unsure=false, dead=function(r){ ER.paid=false; return {code:(r&&r.error==='cap')?'cap':'ai',why:pbWhy(r)}; };
    var final=function(r){
      var e=String((r&&r.error)||'');
      if(e==='cap'||e==='not_found') return true;
      if(e==='not_uploaded'){ unsure=false; return ++nu>=2; } /* المهمّة لم تُرسل بعد: الضائع قبلها لم يرسل */
      if(!e||/^(retry|busy|http)$/.test(e)){ unsure=true; return false; }
      return !unsure;
    };
    for(;;){
      res=await erApi('submit',{id:st.id}).catch(function(){ return null; }); erStale(my);
      if(res&&res.ok) break;
      if(final(res)) throw dead(res);
      if(++tries>4){ res={ok:true,state:'upload'}; break; } /* لم يُحسم: الاستطلاع يسأل */
      await erSleep(String((res&&res.error)||'')==='not_uploaded'?3000:2500*tries); erStale(my); /* المرفوع للتوّ قد يتأخّر ظهوره عند المزوّد */
    }
    var t0=Date.now();
    while(!/^(done|partial|failed)$/.test(String(res&&res.state))&&Date.now()-t0<1800000){ /* نصف ساعة حدّ الانتظار: ما رجع يُستعمل والباقي يُمسح مجانًا */
      await erSleep(4000); erStale(my);
      var op=String(res&&res.state)==='upload'?'submit':'status'; /* لم يصل الإرسال بعد: يُعاد (آمن) */
      var r2=await erApi(op,{id:st.id}).catch(function(){ return null; }); erStale(my);
      /* أُرسل الآن (أو أرسله جواب ضائع قبله): نصف الساعة من الإرسال لا من قبله — المزوّد يكمل خلال ٣٠ د منه، وما أُرسل متأخّرًا كان يُدفع
         ثمّ يُترك (مراجعة ثانية) */
      if(r2&&r2.ok){ if(op==='submit') t0=Date.now(); res=r2; }
      else if(op==='submit'&&final(r2)) throw dead(r2);
      var fin=((res&&res.chunks)||[]).filter(function(c){ return c.state!=='running'&&c.state!=='unknown'; }).length;
      up('vdErWait',35+40*fin/n,{d:fin,n:n});
    }
    var urls={}; ((res&&res.chunks)||[]).forEach(function(c){ if(c&&c.state==='done'&&c.url) urls[c.i]=c.url; });
    for(i=0;i<n;i++){
      if(urls[i]){
        try{
          var nm='err_'+erPad(i)+'.mp4'; await ff.writeFile(nm,await erFetch(urls[i])); erStale(my);
          var rf=await erFrames(ff,nm,my); if(rf>0){ segs[i].r=nm; segs[i].rf=rf; }
        }catch(e){ if(e&&e.code==='stale') throw e; typeof __swallow === 'function' && __swallow(e, 'video:er-fetch'); /* guard-ok — هذا المقطع يُمسح مجانًا */ }
      }
      up('vdErJoin',75+5*(i+1)/n);
    }
    setSpan([80,86,pl.dur||0,'vdErJoin']);
    if(await ff.exec(erJoinArgs(pl,segs,B))!==0) throw {code:'join',log:log.slice(-6).join(' | ')};
    erStale(my);
    var cp=erCompArgs(pl,input,B,segs.reduce(function(a,s){ return a+s.f; },0));
    await ff.writeFile('era.png',await erAlphaPng(B,cp.w,cp.h)); erStale(my);
    setSpan([86,99,pl.dur||0,'vdErJoin']);
    if(await ff.exec(cp.args)!==0) throw {code:'comp',log:log.slice(-6).join(' | ')};
    return {some:segs.filter(function(s){ return !s.r; }).length,n:n};
  }
  /* المسار كلّه لملفّ واحد ← File mp4 ممسوح. نسخة أداة خاصّة به تُنهى بعده */
  async function erMake(file,boxes,mode,my,say){
    var shown=0, up=function(k,v,x){ if(my===ER.run&&v>=shown){ shown=v; say(k,v,x); } };
    var mod=await import('/ffmpeg/lib/index.js'); erStale(my);
    var ff=new mod.FFmpeg(); ER.ff=ff;
    await Promise.race([ff.load({coreURL:'/ffmpeg/core/ffmpeg-core.js',wasmURL:'/ffmpeg/core/ffmpeg-core.wasm',classWorkerURL:'/ffmpeg/lib/worker.js'}),
      new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('ffmpeg load timeout')); },120000); })]);
    erStale(my); up('vdErWork',3);
    var log=[], span=[0,0,0,'vdErWork'];
    ff.on('log',function(e){ log.push((e&&e.message)||''); if(log.length>400) log.shift(); });
    ff.on('progress',function(e){ var t=(+(e&&e.time)||0)/1e6; if(t>0&&t<1e9&&span[2]>0) up(span[3],span[0]+(span[1]-span[0])*Math.min(1,t/span[2])); });
    await ff.createDir('/erin');
    await ff.mount('WORKERFS',{blobs:[{name:'input',data:file}]},'/erin');
    var input='/erin/input';
    log=[]; await ff.exec(['-hide_banner','-i',input]); erStale(my);
    var info=ecParse(log.join('\n')), mob=ecMob(), pl=ecPlan(info,file.size,mob,true);
    if(!pl.ok) throw {code:pl.why!=='heavy'?'probe':((mob&&ecPlan(info,file.size,false,true).ok)?'heavy':'big')};
    up('vdErWork',5);
    var r={some:0,n:0};
    if(mode==='ai') r=await erAi(ff,input,pl,boxes,my,up,function(s){ span=s; },log);
    else { span=[5,99,pl.dur||0,'vdErWork']; if(await ff.exec(erFreeArgs(pl,input,boxes))!==0) throw {code:'enc',log:log.slice(-6).join(' | ')}; }
    erStale(my);
    var data=await ff.readFile('er_out.mp4'); erStale(my);
    if(!(data&&data.length>1000)) throw {code:'empty'};
    if(data.length>UP_MAX_MB*1048576) throw {code:'big'};
    return {file:new File([data],erName(file.name),{type:'video/mp4'}),some:r.some,n:r.n};
  }
  async function erStart(mode){
    var o=ER.orig; if(!o||!drOwner()||!erShown()||erLock()) return;
    if(!ER.boxes.length){ upMsg(L('vdErNeedBox'),true); return; }
    var boxes=ER.boxes.map(function(b){ return {x:b.x,y:b.y,w:b.w,h:b.h}; });
    ecCancel(); erCancel(); var my=++ER.run; ER.busy=true; ER.note=null; erShut(); erSay('vdErWork',0); syncDirector(); /* الباركود الجاري يتوقّف: يُضاف بعد المسح على الممسوح */
    try{
      var r=await erMake(o.file,boxes,mode,my,erSay);
      if(my!==ER.run||ER.orig!==o) return;
      var url=URL.createObjectURL(r.file), prev=ER.out, card=EC.out;
      ER.out={of:o.file,file:r.file,url:url}; EC.out=null; EC.src={file:r.file,type:'video/mp4',url:url}; EC.skip=null; /* الممسوح مصدر الباركود */
      ER.busy=false; erKill();
      ER.note=r.some?{t:drT('vdErSome',{f:r.some,n:r.n}),err:false}:null; /* الملاحظة تبقى تحت الزرّ: رسالة الباركود تغطّي رسالة المسح فورًا */
      ecShow(r.file,'video/mp4',url);
      if(prev) erRevoke(prev.url,url); if(card) erRevoke(card.url,url);
      upMsg(r.some?'':L('vdErDone')); /* النتيجة في الملاحظة وحدها — كانت مرّتين تحت الزرّ حين لا يغطّيها الباركود (مراجعة ثانية) */
      if(ecPref()) ecStart();
    }catch(e){
      if(my!==ER.run||(e&&e.code==='stale')) return;
      var code=String((e&&e.code)||''), msg=code==='declined'?'':(code==='heavy'?L('vdErHeavy'):(code==='cap'?L('vdErCap'):(code==='long'?L('vdErLong'):L('vdErFail'))));
      ER.note=msg?{t:msg,err:true}:null; upMsg(''); /* الخطأ في الملاحظة وحدها (مراجعة ثانية) */
      if(!/^(declined|heavy|big|cap|long)$/.test(code)){ try{ __swallow(e,'director:erase '+code+' '+String((e&&(e.why||e.message))||'')+' '+String((e&&e.log)||'')); }catch(x){ typeof __swallow === 'function' && __swallow(x, 'video:er-log'); /* guard-ok — لا مسجّل */ } }
      /* المسح أوقف الباركود الجاري (ecCancel أعلاه): يرجع على المعروض — كان يُنسى بعد الرفض أو الفشل والخيار مؤشَّر فيُنشر بدونه (مراجعة) */
      ER.busy=false; ER.paid=false; erKill();
      if(ecPref()&&EC.src&&!(EC.out&&EC.out.of===EC.src.file)&&EC.skip!==EC.src.file) ecStart();
    }finally{
      if(my===ER.run){ ER.busy=false; ER.paid=false; erKill(); syncDirector(); }
    }
  }
  function erUndo(){ /* «رجّع الأصل»: الأصل مصدر الباركود من جديد، والمربّعات تبقى لتعديلها */
    var o=ER.orig, cl=ER.out; if(!o||!cl||!erShown()||erLock()) return;
    ecCancel(); var card=EC.out; ER.out=null; ER.note=null; EC.out=null; EC.src=o; EC.skip=null; upMsg('');
    ecShow(o.file,o.type,o.url); erRevoke(cl.url,o.url); if(card) erRevoke(card.url,o.url);
    if(ecPref()) ecStart();
  }
  /* المحرّر: لقطة من الأصل (مشغّل خاصّ به لا المعروض — قد يتبدّل تحته) على لوحة، يُرسم عليها بالسحب، وزرّ الحذف في ركن كلّ مربّع */
  function erOpen(){
    var p=id('vdEr'); if(!p||!erShown()||erLock()) return;
    var vid=id('vdVideo'); try{ if(vid){ vid.pause(); ER.t=+vid.currentTime||0; } }catch(e){ ER.t=0; /* guard-ok — مشغّل بلا وقت */ }
    var h=id('vdErHint'); if(h) h.classList.remove('err');
    p.hidden=false; erFrame(); syncDirector();
  }
  function erShut(){
    var p=id('vdEr'); if(p) p.hidden=true; ER.drag=null;
    var v=ER.v; ER.v=null;
    if(v){ v.onseeked=v.onloadedmetadata=v.onerror=null; v.removeAttribute('src'); try{ v.load(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:er-shut'); /* guard-ok — بلا مصدر */ } if(v.parentNode) v.parentNode.removeChild(v); }
  }
  function erFrame(){
    var o=ER.orig; if(!o) return;
    var v=ER.v;
    var seek=function(){
      var d=+v.duration||0, t=Math.max(0,Math.min(Math.max(0,d-0.05),ER.t||0));
      v.onseeked=function(){ erPaint(0); };
      try{ v.currentTime=t; }catch(e){ erPaint(0); /* guard-ok — يرسم الحاضر */ }
    };
    if(v&&v.__src===o.url){ seek(); return; }
    if(v) erShut();
    v=ER.v=document.createElement('video'); v.__src=o.url; v.muted=true; v.playsInline=true; v.preload='auto';
    v.onloadedmetadata=function(){ if(ER.v!==v) return; ER.dur=+v.duration||0; var rg=id('vdErT'); if(rg) rg.value=String(Math.round(Math.min(1,(ER.t||0)/(ER.dur||1))*1000)); syncDirector(); seek(); };
    v.onerror=function(){ if(ER.v===v){ var h=id('vdErHint'); if(h){ h.textContent=L('vdErNoFrame'); h.classList.add('err'); } } };
    var p=id('vdEr'); if(p) p.appendChild(v); v.style.display='none'; /* بعض المتصفّحات لا تفكّ إطارًا لمشغّل خارج الصفحة */
    v.src=o.url;
  }
  function erPaint(tries){
    var cv=id('vdErCv'), v=ER.v; if(!cv||!v) return;
    var vw=v.videoWidth||0, vh=v.videoHeight||0; if(!vw||!vh) return;
    var k=Math.min(1,960/vw), cw=Math.max(2,Math.round(vw*k)), ch=Math.max(2,Math.round(vh*k));
    if(cv.width!==cw||cv.height!==ch){ cv.width=cw; cv.height=ch; }
    var x=cv.getContext('2d'); x.clearRect(0,0,cw,ch);
    try{ x.drawImage(v,0,0,cw,ch); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:er-draw'); /* guard-ok — لا إطار بعد */ }
    var ok=true; try{ ok=x.getImageData(cw>>1,ch>>1,1,1).data[3]>0; }catch(e){ ok=true; /* guard-ok — لوحة لا تُقرأ: يكفي ما رُسم */ }
    if(!ok&&(tries||0)<40){ setTimeout(function(){ erPaint((tries||0)+1); },50); return; } /* إطار لم يجهز يُرسم شفّافًا (درس الباركود) */
    erBoxes(x,cw,ch);
  }
  function erBoxes(x,cw,ch){
    var all=ER.boxes.slice(); if(ER.drag) all.push(erNorm(ER.drag));
    x.lineWidth=Math.max(2,Math.round(cw/320));
    all.forEach(function(b,i){
      var bx=b.x*cw, by=b.y*ch, bw=b.w*cw, bh=b.h*ch;
      x.fillStyle='rgba(232,194,122,.28)'; x.fillRect(bx,by,bw,bh);
      x.setLineDash([8,5]); x.strokeStyle='#f2d164'; x.strokeRect(bx,by,bw,bh); x.setLineDash([]);
      if(i<ER.boxes.length){ var r=erHandle(cw), hx=bx+bw, hy=by; /* زرّ الحذف: دائرة في الركن العلويّ */
        x.fillStyle='rgba(20,16,8,.85)'; x.beginPath(); x.arc(hx,hy,r,0,Math.PI*2); x.fill();
        x.strokeStyle='#fff'; x.beginPath(); x.moveTo(hx-r*0.45,hy-r*0.45); x.lineTo(hx+r*0.45,hy+r*0.45); x.moveTo(hx+r*0.45,hy-r*0.45); x.lineTo(hx-r*0.45,hy+r*0.45); x.stroke(); }
    });
  }
  function erHandle(cw){ return Math.max(9,Math.round(cw/48)); }
  function erNorm(d){ return {x:Math.min(d.x0,d.x1),y:Math.min(d.y0,d.y1),w:Math.abs(d.x1-d.x0),h:Math.abs(d.y1-d.y0)}; }
  function erPt(cv,e){ var r=cv.getBoundingClientRect(); return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/(r.width||1))),y:Math.max(0,Math.min(1,(e.clientY-r.top)/(r.height||1))),px:r.width||1}; }
  /* لمسة على زرّ حذف مربّع ← رقمه، وإلّا -1 (بنسب اللوحة؛ نصف القطر بالبكسل المعروض) */
  function erHit(pt,cw,ch){
    var r=erHandle(cw)*1.4;
    for(var i=ER.boxes.length-1;i>=0;i--){ var b=ER.boxes[i], dx=(pt.x-(b.x+b.w))*cw, dy=(pt.y-b.y)*ch; if(dx*dx+dy*dy<=r*r) return i; }
    return -1;
  }
  function erRedraw(){ var cv=id('vdErCv'); if(cv&&ER.v&&ER.v.videoWidth) erPaint(40); }
  function erBind(box){
    var cv=box.querySelector('#vdErCv'), rg=box.querySelector('#vdErT');
    box.querySelector('#vdErBtn').addEventListener('click',function(){ var p=id('vdEr'); if(p&&!p.hidden){ erShut(); syncDirector(); } else erOpen(); });
    box.querySelector('#vdErUndo').addEventListener('click',erUndo);
    box.querySelector('#vdErFree').addEventListener('click',function(){ erStart('free'); });
    box.querySelector('#vdErAi').addEventListener('click',function(){ erStart('ai'); });
    box.querySelector('#vdErClear').addEventListener('click',function(){ ER.boxes=[]; erRedraw(); syncDirector(); });
    box.querySelector('#vdErClose').addEventListener('click',function(){ erShut(); syncDirector(); });
    var tm=0; rg.addEventListener('input',function(){ ER.t=(+rg.value||0)/1000*(ER.dur||0); clearTimeout(tm); tm=setTimeout(erFrame,80); });
    cv.addEventListener('pointerdown',function(e){
      if(e.button>0||erLock()||!ER.v) return;
      var pt=erPt(cv,e), hit=erHit(pt,cv.width,cv.height);
      if(hit>=0){ ER.boxes.splice(hit,1); erRedraw(); syncDirector(); e.preventDefault(); return; }
      if(ER.boxes.length>=ER_MAXB) return;
      ER.drag={x0:pt.x,y0:pt.y,x1:pt.x,y1:pt.y}; try{ cv.setPointerCapture(e.pointerId); }catch(x){ typeof __swallow === 'function' && __swallow(x, 'video:er-cap'); /* guard-ok — بلا التقاط */ }
      e.preventDefault();
    });
    cv.addEventListener('pointermove',function(e){ if(!ER.drag) return; var pt=erPt(cv,e); ER.drag.x1=pt.x; ER.drag.y1=pt.y; erRedraw(); });
    var end=function(){ var d=ER.drag; if(!d) return; ER.drag=null; var b=erNorm(d); if(b.w>0.01&&b.h>0.01&&ER.boxes.length<ER_MAXB) ER.boxes.push(b); erRedraw(); syncDirector(); };
    cv.addEventListener('pointerup',end); cv.addEventListener('pointercancel',function(){ ER.drag=null; erRedraw(); });
  }
  function erSync(box){
    var row=box.querySelector('#vdErRow'), ed=box.querySelector('#vdEr'); if(!row||!ed) return;
    var shown=erShown(), lock=erLock(); row.hidden=!shown;
    if(!shown&&!ed.hidden) erShut();
    var b=box.querySelector('#vdErBtn'), u=box.querySelector('#vdErUndo');
    b.textContent=L('vdErBtn'); b.disabled=lock; u.textContent=L('vdErUndo'); u.hidden=!(ER.out&&EC.src&&EC.src.url===ER.out.url); u.disabled=lock;
    var h=box.querySelector('#vdErHint'); if(!h.classList.contains('err')) h.textContent=L('vdErHint');
    var nt=box.querySelector('#vdErNote'); if(nt){ nt.textContent=ER.note?ER.note.t:''; nt.className='vmk-er-note'+(ER.note&&ER.note.err?' err':''); }
    /* بلا سعر على الزرّ: الإطارات لا تُعرف قبل الفحص (٦٠ إطارًا = ضعف تقدير ٣٠)، والموافقة تقول العدد والسعر الحقيقيّين قبل أيّ صرف (مراجعة) */
    var nb=!ER.boxes.length, fr=box.querySelector('#vdErFree'), ai=box.querySelector('#vdErAi');
    fr.textContent=L('vdErFree'); fr.disabled=lock||nb; ai.textContent=L('vdErAi'); ai.disabled=lock||nb;
    box.querySelector('#vdErClear').textContent=L('vdErClear'); box.querySelector('#vdErClear').disabled=nb||lock;
    box.querySelector('#vdErClose').textContent=L('vdErClose');
  }
  function syncDirector(){
    var box=id('vmkDirector'); if(!box) return;
    box.querySelector('.vmk-dir-head b').textContent=L('vdTab'); box.querySelector('.vmk-dir-head p').textContent=drStory()?L('vdSubStory'):L('vdSub'); /* v-director-story: وصف القصّة لا «يصوّر شاشات التطبيق» */
    var story=drStory(), rq=box.querySelector('#vdReq');
    rq.placeholder=story?L('vdPhStory'):L('vdPh'); /* v-director-story: الحقل ٣٠٠٠ في النوعين — لصق قصّة قبل اختيار «قصة» كان يُقصّ عند ٦٠٠ ولا يرجع */
    var labs=box.querySelectorAll('.vmk-dir-row label>span'); labs[0].textContent=L('vdLang'); labs[1].textContent=L('vdSpeaker'); labs[2].textContent=L('vdMinutes'); labs[3].textContent=L('vdVoiceLabel');
    var vo=box.querySelector('#vdVoice'); vo.options[0].textContent=L('vdVoiceOn'); vo.options[1].textContent=L('vdVoiceOff'); box.querySelector('#vdSpeaker').disabled=(vo.value==='off');
    var sp=box.querySelector('#vdSpeaker'); sp.options[0].textContent=L('vdMaha')||'مها'; sp.options[1].textContent=L('vdAbdullah')||'عبدالله';
    box.querySelector('.vmk-dir-ref span').textContent=L('vdRef');
    var kd=box.querySelector('#vdKind'); box.querySelector('.vmk-dir-kind>span').textContent=L('vdKind'); kd.options[0].textContent=L('vdKindApp'); kd.options[1].textContent=L('vdKindStory');
    box.querySelector('#vdMin').disabled=story; box.querySelector('.vmk-dir-ref').hidden=story; /* القصّة: مدّتها من طولها، ونماذج الأنماط لا تدخلها */
    box.querySelector('#vdGo').textContent=L('vdGo'); box.querySelector('#vdGo').disabled=DR.busy;
    var names={plan:'vdStepPlan',shots:story?'vdStepFrames':'vdStepShots',samples:story?'vdStepDraw':'vdStepSamples',voice:'vdStepVoice',join:'vdStepJoin'};
    [].forEach.call(box.querySelectorAll('#vdSteps li'),function(li){ li.querySelector('b').textContent=L(names[li.dataset.step]); });
    box.querySelector('#vdDl').textContent=L('vdDownload');
    var timed=drTimed(); box.classList.toggle('vd-timed',timed); /* v-director-timed */
    if(kd.options[2]) kd.options[2].textContent=L('vdKindTimed');
    if(timed) box.querySelector('.vmk-dir-head p').textContent=L('vdSubTimed');
    tlSync();
    box.querySelector('#vdPubBtn').textContent=L('vdPubBtn'); box.querySelector('.vmk-pub-cap>span').textContent=L('vdPubCap'); /* v-director-publish */
    box.querySelector('#vdPubCap').placeholder=L('vdPubPh'); var pg=box.querySelector('#vdPubGo'); pg.textContent=L('vdPubGo'); pg.disabled=PB.busy||PB.loading||!(PB.plats&&PB.plats.length)||EC.busy;
    var uz=box.querySelector('#vdUp'), uf=box.querySelector('#vdUpFile'); /* v-director-upload */
    if(uz&&uf){
      var um=upMine(); uz.classList.toggle('has',um); uz.querySelector('.vmk-cl-pick').textContent=um?String(DR.file.name||''):L('vdUpBtn'); uz.querySelector('.vmk-cl-lim').textContent=drT('vdUpHint',{n:UP_MAX_MB});
      uf.disabled=DR.busy||PB.busy; uz.classList.toggle('off',uf.disabled); uf.setAttribute('aria-label',L('vdUpBtn'));
    }
    var eb=box.querySelector('#vdEcBox'), ec=box.querySelector('#vdEc'); /* v-director-endcard */
    if(eb&&ec){
      eb.querySelector('span').textContent=L('vdEcLabel');
      ec.checked=ecPref()&&!(EC.src&&EC.skip===EC.src.file); /* فشل أو ثقل لهذا الملفّ: يظهر مطفأً (التفضيل المحفوظ لا يتغيّر) */
      ec.disabled=DR.busy||PB.busy||ecLocked(); eb.classList.toggle('off',ec.disabled);
    }
    if(ER.busy){ pg.disabled=true; if(ec){ ec.disabled=true; eb.classList.add('off'); } } /* v-director-erase: لا نشر ولا تبديل أثناء المسح */
    erSync(box);
  }
  /* v-app-director-motion (المالك: «خل فيه حركة فيديو عشان اعرف ان الفيديو يتولد»): شاشة حيّة أثناء التوليد — ضوء يتحرّك وشريط لقطات،
     وما يكتبه المخرج مشهدًا مشهدًا، ونماذج الأنماط تظهر فيها بحركة كاميرا فور توليدها، مع عدّاد وقت وشريط تقدّم كلّيّ. تعمل أثناء التوليد فقط. */
  var ST={t0:0,iv:0,board:[],bi:0,creep:null};
  var DR_SPAN={plan:[0,14],voice:[14,30],samples:[30,58],shots:[58,84],join:[84,98]};
  function drStageShow(on){ var s=id('vdStage'); if(s) s.hidden=!on; }
  function drStagePct(p){ var b=id('vdStageBar'); if(b) b.style.width=Math.max(0,Math.min(100,p))+'%'; }
  function drStageNext(){
    if(!ST.board.length) return;
    var it=ST.board[ST.bi++%ST.board.length], cap=id('vdStageCap'), im=id('vdStageImg');
    if(cap){ cap.classList.remove('in'); void cap.offsetWidth; cap.textContent=it.text||''; cap.classList.add('in'); }
    if(im){ im.classList.remove('on'); if(it.img){ im.src=it.img; void im.offsetWidth; im.classList.add('on'); } }
  }
  function drStageTick(){
    var el=id('vdStageTime'); if(!el){ clearInterval(ST.iv); ST.iv=0; return; }
    var sec=Math.floor((Date.now()-ST.t0)/1000); el.textContent=Math.floor(sec/60)+':'+('0'+(sec%60)).slice(-2);
    if(ST.creep) drStagePct(ST.creep.lo+(ST.creep.hi-ST.creep.lo)*0.92*(1-Math.exp(-(Date.now()-ST.creep.t)/35000))); /* خطوة بلا عدّاد: الشريط يزحف بالوقت ولا يبلغ نهايتها */
    if(sec%4===0) drStageNext();
  }
  function drStageStart(){
    ST.t0=Date.now(); ST.board=[]; ST.bi=0; ST.creep=null; drStageShow(true); drStagePct(1);
    var im=id('vdStageImg'), cap=id('vdStageCap'); if(im){ im.classList.remove('on'); im.removeAttribute('src'); } if(cap){ cap.textContent=''; cap.classList.remove('in'); }
    if(DR.ref) ST.board.push({text:'',img:'data:'+(DR.refMime||'image/jpeg')+';base64,'+DR.ref});
    clearInterval(ST.iv); ST.iv=setInterval(drStageTick,1000); drStageTick();
  }
  function drStageStop(hide){ clearInterval(ST.iv); ST.iv=0; ST.creep=null; if(hide) drStageShow(false); }
  /* v-app-director-watchdog (لقطة المالك ١٢ أكتوبر: «المشهد ١ من ٤» ربع ساعة بلا أيّ جديد): الخطوة الجارية على الجسر تعرض منقضيها
     (mm:ss بساعة الخادم) وآخر سطر من سجلّ مهمّتها تحت اسمها — فيرى المالك أهو يصوّر أم يعلّق أم أعاد مقطعًا، لا عدّادًا جامدًا */
  function drMmss(ms){ var s=Math.max(0,Math.floor((Number(ms)||0)/1000)); return ('0'+Math.floor(s/60)).slice(-2)+':'+('0'+(s%60)).slice(-2); }
  function drStep(k,state,note,frac,log){
    var li=M.querySelector('#vdSteps li[data-step="'+k+'"]'); if(!li) return;
    li.classList.remove('on','ok','err'); if(state) li.classList.add(state); li.querySelector('small').textContent=note||'';
    var lg=li.querySelector('.vmk-dir-log'); if(lg){ lg.textContent=(state==='on'&&log)?String(log):''; lg.title=lg.textContent; } /* السطر كاملًا تلميحًا إن قُصّ */
    var sp=DR_SPAN[k]; if(!sp) return;
    if(state==='on'){
      var lb=id('vdStageStep'); if(lb) lb.textContent=li.querySelector('b').textContent+(note?' · '+note:'');
      if(frac==null){ if(!ST.creep||ST.creep.k!==k) ST.creep={k:k,lo:sp[0],hi:sp[1],t:Date.now()}; }
      else { ST.creep=null; drStagePct(sp[0]+(sp[1]-sp[0])*Math.max(0,Math.min(1,frac))); }
    } else { if(ST.creep&&ST.creep.k===k) ST.creep=null; if(state==='ok') drStagePct(sp[1]); }
  }
  function drMsg(t,err,diag){
    var m=id('vdMsg'); if(!m) return; m.textContent=t||''; m.className='vmk-dir-msg'+(err?' err':'');
    if(diag){ var d=document.createElement('code'); d.className='vmk-dir-diag'; d.dir='ltr'; d.textContent=diag; m.appendChild(d); } /* سبب الخادم كما هو، للمالك وحده */
    if(err){ try{ m.scrollIntoView({block:'end'}); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:833'); /* guard-ok — متصفّح بلا خيارات التمرير */ } } /* السبب كان أسفل النافذة مقصوصًا */
  }
  function drReset(){ ['plan','voice','samples','shots','join'].forEach(function(k){ drStep(k,'',''); }); drMsg(''); var r=id('vdRes'); if(r) r.classList.remove('has'); }
  function drPickRef(f){
    var r=new FileReader();
    r.onload=function(){
      var img=new Image();
      img.onload=function(){
        try{
          var w=img.width,h=img.height,MAX=1400; if(Math.max(w,h)>MAX){ var k=MAX/Math.max(w,h); w=Math.round(w*k); h=Math.round(h*k); }
          var c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h);
          var du=c.toDataURL('image/jpeg',0.86); DR.ref=du.split(',')[1]; DR.refMime='image/jpeg';
          var pv=id('vdRefImg'); if(pv){ pv.src=du; pv.hidden=false; }
        }catch(e){ DR.ref=''; try{ __swallow(e,'director:ref'); }catch(x){ typeof __swallow === 'function' && __swallow(x, 'video:846'); /* guard-ok — لا مسجّل */ } }
      };
      img.src=String(r.result||'');
    };
    r.readAsDataURL(f);
  }
  function drPool(items,n,fn){
    var next=0; function worker(){ if(next>=items.length) return Promise.resolve(); var i=next++; return Promise.resolve().then(function(){ return fn(items[i],i); }).then(worker); }
    var ws=[]; for(var k=0;k<Math.min(n,items.length);k++) ws.push(worker()); return Promise.all(ws);
  }
  function drB64(blob){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result||'').split(',')[1]||''); }; r.onerror=function(){ rej(r.error||new Error('read')); }; r.readAsDataURL(blob); }); }
  function drJson(url,body){
    return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return {ok:r.ok,status:r.status,json:j}; }); });
  }
  /* أسماء الشاشات باللغة المطلوبة من قاموس الواجهة نفسه (يُحمَّل ملفّ اللغة إن لزم) — الخادم يسمّي بها الميزات في السيناريو */
  function drLabels(lg){
    var p=(typeof loadLangFile==='function')?loadLangFile(lg):Promise.resolve();
    return Promise.resolve(p).catch(function(){ /* guard-ok — بلا ملفّ لغة تُستعمل الأسماء الاحتياطيّة في الخادم */ }).then(function(){
      var d=(typeof window.__i18nDict==='function')?window.__i18nDict(lg):((window.I18N&&window.I18N[lg])||{}); var out={};
      Object.keys(d||{}).forEach(function(k){ if(/Title$|^tcSub_|^videoTab|^videoMode|^themeSectionLabel$|^adStudioHint$|^religionModalTitle$|^mahaTitle$/.test(k)&&typeof d[k]==='string') out[k]=d[k].slice(0,120); });
      return out;
    });
  }
  /* v-app-director-voice: نصّ المشهد مرسومًا على نموذج النمط — لوحة ١٩٢٠×١٠٨٠ (خلفيّة مموّهة من الصورة نفسها، الصورة كاملة، شريط نصّ).
     الجسر يكتب النصّ على لقطات الشاشة وحدها (في الصفحة)، وصور النماذج تصله جاهزة؛ والنصّ العربيّ يرسمه المتصفّح بخطّ الواجهة.
     في الفيديو بلا صوت هذا هو ما يشرح المشهد. يعيد null إن تعذّر الرسم فتُرسل الصورة كما هي. */
  function drWrap(ctx,text,maxW){
    var words=String(text||'').split(/\s+/).filter(Boolean), lines=[], cur='';
    words.forEach(function(w){
      if(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(w)&&ctx.measureText(w).width>maxW){ /* مراجعة v-director-story: الصينيّة/اليابانيّة بلا مسافات كانت سطرًا يخرج عن الإطار — تُكسر بالحروف؛ والكلمة العربيّة الطويلة تبقى كاملة (لا تُقطع حروفها المتّصلة) */
        Array.from(w).forEach(function(g){ var t=cur+g; if(cur&&ctx.measureText(t).width>maxW){ lines.push(cur); cur=g; } else cur=t; }); return;
      }
      var t=cur?cur+' '+w:w; if(cur&&ctx.measureText(t).width>maxW){ lines.push(cur); cur=w; } else cur=t; });
    if(cur) lines.push(cur);
    return lines;
  }
  function drCaptionSample(b64,mime,text,dir){
    return new Promise(function(res){
      var img=new Image();
      img.onload=function(){
        try{
          var W=1920,H=1080,c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d');
          x.fillStyle='#07080c'; x.fillRect(0,0,W,H);
          var k=Math.max(W/img.width,H/img.height), bw=img.width*k, bh=img.height*k;
          try{ x.filter='blur(34px) brightness(0.78)'; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:890'); /* guard-ok — متصفّح بلا مرشّحات اللوحة: خلفيّة بلا تمويه */ }
          x.drawImage(img,(W-bw)/2,(H-bh)/2,bw,bh);
          try{ x.filter='none'; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:892'); /* guard-ok — كسابقه */ }
          var f=Math.min(W/img.width,H/img.height), fw=img.width*f, fh=img.height*f;
          x.drawImage(img,(W-fw)/2,(H-fh)/2,fw,fh);
          var fam='system-ui,sans-serif'; try{ fam=getComputedStyle(document.body).fontFamily||fam; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:895'); /* guard-ok — خطّ النظام */ }
          x.font='700 44px '+fam; x.direction=dir==='rtl'?'rtl':'ltr'; x.textAlign='center'; x.textBaseline='middle';
          var lines=drWrap(x,text,W*0.72).slice(0,3), lh=62, padX=46, padY=20, tw=0;
          lines.forEach(function(ln){ tw=Math.max(tw,x.measureText(ln).width); });
          var pw=tw+padX*2, ph=lines.length*lh+padY*2, px=(W-pw)/2, py=H-64-ph, rad=lines.length>1?26:ph/2;
          x.beginPath(); x.moveTo(px+rad,py); x.arcTo(px+pw,py,px+pw,py+ph,rad); x.arcTo(px+pw,py+ph,px,py+ph,rad); x.arcTo(px,py+ph,px,py,rad); x.arcTo(px,py,px+pw,py,rad); x.closePath();
          x.fillStyle='rgba(7,8,12,.84)'; x.fill(); x.lineWidth=2; x.strokeStyle='rgba(232,194,122,.6)'; x.stroke();
          x.fillStyle='#f6e7c3'; lines.forEach(function(ln,i){ x.fillText(ln,W/2,py+padY+lh*i+lh/2); });
          res({b64:c.toDataURL('image/jpeg',0.92).split(',')[1],mime:'image/jpeg'});
        }catch(e){ try{ __swallow(e,'director:caption'); }catch(z){ typeof __swallow === 'function' && __swallow(z, 'video:904'); /* guard-ok — لا مسجّل */ } res(null); }
      };
      img.onerror=function(){ res(null); };
      img.src='data:'+(mime||'image/png')+';base64,'+b64;
    });
  }
  /* v-director-story: مشهد القصّة لوحة كاملة 1920×1080 (الصورة 16:9 تُقصّ قصًّا لا تُمطّ)، وسطر الراوي ترجمةً على تدرّج داكن أسفلها —
     لا خلفيّة مموّهة ولا كبسولة ذهبيّة (شكل «كانفا» الذي رفضه المالك). النصّ يُرسم فوق الصورة لا داخل التوليد. */
  function drStoryFrame(b64,mime,text,dir){
    return new Promise(function(res){
      var img=new Image();
      img.onload=function(){
        try{
          var W=1920,H=1080,c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d');
          var k=Math.max(W/img.width,H/img.height), bw=img.width*k, bh=img.height*k;
          x.drawImage(img,(W-bw)/2,(H-bh)/2,bw,bh);
          if(text){
            var fam='system-ui,sans-serif'; try{ fam=getComputedStyle(document.body).fontFamily||fam; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:921'); /* guard-ok — خطّ النظام */ }
            x.direction=dir==='rtl'?'rtl':'ltr'; x.textAlign='center'; x.textBaseline='middle';
            /* مراجعة: قصّ الأسطر عند الثالث كان يُسقط آخر الجملة — الخطّ يصغر حتّى ٣٠ لتكفي ثلاثة أسطر، وما زاد بعدها يبقى ولا يُحذف */
            var fs=46, lines; for(;;){ x.font='700 '+fs+'px '+fam; lines=drWrap(x,text,W*0.8); if(lines.length<=3||fs<=30) break; fs-=2; }
            var lh=Math.round(fs*1.39), y0=H-70-lh*(lines.length-1), gy=Math.max(0,Math.min(H*0.56,y0-lh*1.6));
            var g=x.createLinearGradient(0,gy,0,H); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,.78)'); x.fillStyle=g; x.fillRect(0,gy,W,H-gy);
            x.shadowColor='rgba(0,0,0,.85)'; x.shadowBlur=14; x.fillStyle='#ffffff';
            lines.forEach(function(ln,i){ x.fillText(ln,W/2,y0+lh*i); });
          }
          res({b64:c.toDataURL('image/jpeg',0.92).split(',')[1],mime:'image/jpeg'});
        }catch(e){ try{ __swallow(e,'director:story-frame'); }catch(z){ typeof __swallow === 'function' && __swallow(z, 'video:931'); /* guard-ok — لا مسجّل */ } res(null); }
      };
      img.onerror=function(){ res(null); };
      img.src='data:'+(mime||'image/png')+';base64,'+b64;
    });
  }
  /* أمر صورة المشهد: الأسلوب الواحد + ورقة الشخصيّات + لقطة المشهد — 16:9 وبلا كتابة (قاعدة المالك: لا نصّ داخل صورة مولّدة) */
  /* مراجعة: مسار الصور يقصّ الأمر عند ١٨٠٠ حرف (فاللقطة في آخره تسقط)، وكلمات مثل screen/text/caption/menu/label/icon/app تحوّله
     لمسار الكتابة بمقاس 3:2 — اللقطة أوّلًا، والكلمات المحوِّلة تُستبدل، والشخصيّات المذكورة في اللقطة قبل غيرها حتّى الحدّ */
  function drStoryNeutral(t){ return String(t||'').replace(/\bscreens?\b/gi,'display').replace(/\binterfaces?\b/gi,'panel').replace(/\bmenus?\b/gi,'board').replace(/\blabels?\b/gi,'tag').replace(/\bicons?\b/gi,'symbol').replace(/\bapps?\b/gi,'').replace(/\btexts?\b/gi,'').replace(/captions?|lettering|typograph\w*/gi,'').replace(/\s{2,}/g,' ').trim(); }
  function drStoryPrompt(plan,visual){
    var p='Cinematic 16:9 film still. Shot: '+drStoryNeutral(visual)+' Clean frame with no writing, no signage and no watermark.'+(plan.style?' Style: '+drStoryNeutral(plan.style)+'.':'');
    var cs=(plan.characters||[]).slice(), low=String(visual||'').toLowerCase();
    cs.sort(function(a,b){ var na=String(a.name||'').split(' (')[0].toLowerCase(), nb=String(b.name||'').split(' (')[0].toLowerCase(); return (low.indexOf(nb)>=0)-(low.indexOf(na)>=0); });
    var head=' Characters (same faces, ages and clothes in every shot): ', cast='';
    cs.forEach(function(c){ var it=drStoryNeutral(c.name+': '+c.look)+'; '; if((p+head+cast+it).length<=1750) cast+=it; });
    return (cast?p+head+cast.replace(/;\s*$/,'.'):p).slice(0,1750);
  }
  function drFail(code){ return Object.assign(new Error(code),{code:code}); }
  function drPlanCall(body){ return drJson('/api/ai?action=app-director-plan',body); }
  async function drRun(){
    if(DR.busy||!drOwner()) return;
    if(drTimed()) return drTimedRun(); /* v-director-timed */
    var req=(id('vdReq').value||'').trim(); if(!req){ drMsg(L('vdEmpty'),true); return; }
    if(!drStory()&&req.length>600){ drMsg(L('vdTooLong'),true); return; } /* «عرض التطبيق» طلب قصير — الطويل قصّة، لا قصّ صامت عند ٦٠٠ */
    var lang=id('vdLang').value||'ar', speaker=id('vdSpeaker').value||'female', minutes=parseInt(id('vdMin').value,10)||2;
    var voiceOn=((id('vdVoice')||{}).value!=='off'), capDir=(lang==='ar'||lang==='ur')?'rtl':'ltr', story=drStory();
    if(ER.busy&&ER.paid&&!window.confirm(L('vdErLose'))) return; /* v-director-erase: الزرّ وCtrl+Enter — المسح المدفوع الجاري لا يضيع بلا سؤال (مراجعة) */
    var my=++DR.run, tk=drTok();
    DR.busy=true; DR.lang=lang; upEnd(); syncDirector(); drReset(); drStageStart();
    try{
      /* ٠) الجسر أوّلًا (v-app-director-bridge-check — لقطة المالك «bridge offline» بعد توليد النماذج): رمز المهمّة يُطلب قبل أيّ صرف،
         والخادم يفحص الجسر وهو يصدره؛ جسر منقطع أو بنسخة قديمة لا تعرف مسار الفيديو يُعلَن هنا لا بعد الخطّة والصوت والصور.
         الرمز ساعتان، يكفي أطول فيديو. */
      drStep('plan','on');
      var tr=await drJson('/api/ai?action=app-director-token',{token:tk}); if(my!==DR.run) return;
      if(!tr.ok||!tr.json||!tr.json.token||!tr.json.bridge){ drStep('plan',''); drStep('shots','err'); throw drFail('token '+tr.status+(tr.json&&tr.json.error?' '+tr.json.error:'')+(tr.json&&tr.json.why?' '+tr.json.why:'')); }
      var bridge=tr.json.bridge, jt=tr.json.token, auth={Authorization:'Bearer '+jt};
      /* ١) الفكرة والسيناريو — الفيديو الطويل يُكتب أجزاءً، كلّ جزء نداء مستقلّ على مخطّط الجزء الأوّل */
      var labels=await drLabels(lang); if(my!==DR.run) return;
      var base={request:req,lang:lang,speaker:speaker,minutes:minutes,voice:voiceOn,token:tk,labels:labels};
      if(story) base.kind='story'; /* v-director-story: القصّة كاملة بكلام المالك، والخادم يقسّمها حرفيًّا */
      var pr=await drPlanCall(base); if(my!==DR.run) return;
      if(!pr.ok||!pr.json||!pr.json.plan){ drStep('plan','err'); throw drFail('plan '+pr.status+(pr.json&&pr.json.error?' '+pr.json.error:'')+(pr.json&&pr.json.diag?' · '+pr.json.diag:'')); }
      var plan=pr.json.plan, parts=pr.json.parts||1, cat=pr.json.catalog||{screens:[],styles:{}}, screens={}; (cat.screens||[]).forEach(function(s){ screens[s.id]=s; });
      var backup=pr.json.fallback?String(pr.json.model||''):'';
      if(parts>1){
        var got={1:plan.scenes}, doneP=1, rest=[]; for(var pk=2;pk<=parts;pk++) rest.push(pk);
        drStep('plan','on',doneP+'/'+parts,doneP/parts);
        await drPool(rest,2,async function(k){
          if(my!==DR.run) return;
          var r=null;
          for(var a=1;a<=2&&my===DR.run&&!(r&&r.ok&&r.json&&r.json.plan);a++) r=await drPlanCall(Object.assign({},base,{part:k,outline:plan.outline,title:plan.title,idea:plan.idea}));
          if(my!==DR.run) return;
          if(!(r&&r.ok&&r.json&&r.json.plan)){ drStep('plan','err'); throw drFail('plan '+(r?r.status:0)+' '+k+'/'+parts+(r&&r.json&&r.json.diag?' · '+r.json.diag:'')); }
          got[k]=r.json.plan.scenes; if(r.json.fallback) backup=String(r.json.model||''); doneP++; drStep('plan','on',doneP+'/'+parts,doneP/parts);
        });
        if(my!==DR.run) return;
        var all=[]; for(var q=1;q<=parts;q++) all=all.concat(got[q]||[]); plan.scenes=all;
      }
      var scenes=plan.scenes.map(function(sc){
        var o={type:sc.type,target:sc.target,text:sc.text||'',sub:'',narration:sc.narration||'',seconds:sc.seconds||8,steps:null,image:'',mime:'',audio:'',prompt:''};
        if(o.type==='title'){ o.text=sc.text||plan.title; o.sub=voiceOn?(sc.highlight||''):(o.narration||sc.highlight||''); }
        o.cap=voiceOn?o.text:(o.narration||o.text); /* مع الصوت: الاسم القصير؛ بدونه: جملة المشهد كاملة */
        if(o.type==='screen'){ var scr=screens[o.target]||screens.home||{steps:[]}; o.steps=scr.steps||[]; }
        if(o.type==='style_sample'){ var st=(cat.styles||{})[o.target]; o.prompt=st?st.prompt:''; }
        if(story){ if(o.type==='title') o.sub=''; if(o.type==='story'){ o.prompt=drStoryPrompt(plan,sc.visual||sc.narration); o.cap=o.narration; } } /* لا عنوان فرعيّ ولا ملاحظات على الشاشة؛ سطر الراوي ترجمةً */
        o.board={text:o.text||o.narration.slice(0,110),img:''}; ST.board.push(o.board);
        return o;
      });
      drStep('plan','ok',plan.title+' · '+drT('vdScene',{i:scenes.length,n:scenes.length})+(backup?' · '+backup:''));
      /* ٢) التعليق أوّلًا (v-app-director-voice-first — لقطة المالك «voice 15/15 401» بعد أن وُلّدت النماذج): الصوت أرخص وأسرع من الصور،
         فمزوّد صوت يرفض (مفتاح مرفوض، رصيد منتهٍ) يُعلَن قبل الصرف على النماذج، ونصّ ردّ الخادم نفسه في سطر السبب.
         حدّ الطلبات في الدقيقة (فيديو ١٠ دقائق = ٧٥ طلبًا): الرفض العابر يوقف العاملَين معًا مهلة تتصاعد ثمّ يعيد حتّى ستّ مرّات؛
         والرفض النهائيّ (401/403/رصيد) يوقف الكلّ فورًا. مشهد بلا صوت يُعدّ؛ فوق خُمس المشاهد = فشل معلَن لا فيديو نصفه صامت.
         v-app-director-voice (المالك: «تمام ابدا فيه لكن حط ميزه مع صوت ولا بدون»): «بدون صوت» يتخطّى الخطوة ويصير التعليق نصًّا على الشاشة؛
         ومع الصوت، صوت مها/عبدالله العاجز (مرفوض نهائيًّا، أو صامت فوق خُمس المشاهد بعد كلّ الإعادات) يُستبدل للفيديو كلّه بالصوت
         الاحتياطيّ (لا خلط صوتين) ويُعلَن ذلك في الخطوة. */
      var voiced=voiceOn?scenes.filter(function(s){ return !!s.narration; }):[], vLimit=Math.max(1,Math.floor(voiced.length*0.2));
      /* v-video-voice-speed: speed وتنظيف النصّ من app-11-video.js (window.__vmkVoice)؛ لو غاب: «fast» والنصّ كما هو */
      var vvSpeed=function(){ if(story) return 'normal'; try{ var V=window.__vmkVoice; return (V&&V.speed&&V.speed())||'fast'; }catch(e){ return 'fast'; /* guard-ok — الافتراضيّ سريع */ } };
      var vvClean=function(t){ if(story) t=String(t).replace(/\s*(?:\.{2,}|…)\s*/g,'، '); try{ var V=window.__vmkVoice; return (V&&V.clean)?V.clean(t):t; }catch(e){ return t; /* guard-ok — النصّ كما هو */ } }; /* v-director-story: «عمّي.. ما عندي» وقفة الراوي — كانت تُحذف */
      var voiceRun=async function(backup){
        var done=0, miss=0, got=0, last='', cool=0, dead=false, vModel='';
        await drPool(voiced,2,async function(s){
          for(var att=1;att<=6&&!s.audio&&!dead&&my===DR.run;att++){
            var hold=cool-Date.now(); if(hold>0) await new Promise(function(x){ setTimeout(x,hold); });
            if(my!==DR.run) return;
            if(dead) break;
            try{
              if(backup){
                var br=await drJson('/api/ai?action=app-director-voice',{text:vvClean(s.narration),lang:lang,speaker:speaker,model:vModel||undefined,token:tk});
                if(br.ok&&br.json&&br.json.audio){ s.audio=br.json.audio; vModel=br.json.model||vModel; }
                else {
                  last=br.status+' '+((br.json&&(br.json.why||br.json.error))||'')+(br.json&&br.json.diag?' · '+br.json.diag:'');
                  if(br.status===502||br.status===401||br.status===403||(br.json&&br.json.error==='voice_unconfigured')) dead=true; /* الخادم جرّب نماذجه كلّها */
                }
              } else {
                var ctl=new AbortController(); var tm=setTimeout(function(){ ctl.abort(); },60000);
                var r=await fetch('/api/media?action=tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:vvClean(s.narration),voice:'maha',lang:lang,gender:speaker,speed:vvSpeed(),token:tk}),signal:ctl.signal});
                clearTimeout(tm);
                if(r.ok){ var b=await r.blob(); if(b.size>200) s.audio=await drB64(b); else last='empty'; }
                else {
                  var et=''; try{ var ej=await r.json(); et=String((ej&&ej.error)||'').replace(/\s+/g,' ').slice(0,140); }catch(e2){ et=''; /* ردّ بلا JSON: الحالة وحدها */ }
                  last=r.status+(et?' '+et:'');
                  if(r.status===401||r.status===403||/insufficient_quota|no credits|invalid subscription/i.test(et)) dead=true;
                }
              }
            }catch(e){ last='network'; try{ __swallow(e,'director:tts'); }catch(z){ typeof __swallow === 'function' && __swallow(z, 'video:1038'); /* guard-ok — لا مسجّل */ } }
            if(!s.audio&&!dead&&att<6) cool=Math.max(cool,Date.now()+Math.min(4000*att,20000));
          }
          /* مزوّد عاجز لا يُنتظر على كلّ مشهد: فوق الحدّ، أو مشهدان استنفدا إعاداتهما بلا نجاح واحد ← يتوقّف الكلّ (والاحتياطيّ يتولّى) */
          if(s.audio) got++; else { miss++; if(miss>vLimit||(!got&&miss>=2)) dead=true; }
          done++; if(my===DR.run&&!dead) drStep('voice','on',(backup?L('vdVoiceBackup')+' · ':'')+drT('vdScene',{i:done,n:voiced.length}),done/voiced.length);
        });
        return {miss:miss,last:last,dead:dead};
      };
      var backupVoice=false;
      if(!voiceOn) drStep('voice','ok',L('vdVoiceOff'));
      else {
        drStep('voice','on',drT('vdScene',{i:0,n:voiced.length}),0);
        var vres=await voiceRun(false); if(my!==DR.run) return;
        var mainWhy=vres.last;
        if(vres.dead||vres.miss>vLimit){
          scenes.forEach(function(s){ s.audio=''; }); backupVoice=true;
          drStep('voice','on',L('vdVoiceBackup'),0);
          vres=await voiceRun(true); if(my!==DR.run) return;
        }
        if(vres.dead||vres.miss>vLimit){ drStep('voice','err'); throw drFail('voice '+(voiced.length-vres.miss)+'/'+voiced.length+' '+(backupVoice?('main: '+mainWhy+' | backup: '+vres.last):vres.last)); }
        drStep('voice','ok',backupVoice?L('vdVoiceBackup'):(vres.miss?('−'+vres.miss):''));
      }
      /* ٣) نماذج الأنماط بمسار الصور القائم (صورة المالك مرجعًا إن أرفقها) — المالك بلا نقاط */
      var samples=scenes.filter(function(s){ return s.type==='style_sample'||s.type==='story'; });
      var failed=0;
      if(samples.length){
        drStep('samples','on',drT('vdScene',{i:0,n:samples.length}),0);
        var doneS=0;
        await drPool(samples,2,async function(s){
          if(my!==DR.run) return;
          var r=null;
          try{
            r=s.type==='story'?await drJson('/api/media?action=maha-image',{prompt:s.prompt,userText:'',token:tk,guestId:(window.getGuestId?window.getGuestId():'')})
             :DR.ref?await drJson('/api/portrait-style',{imageBase64:DR.ref,mimeType:DR.refMime,style:s.target,token:tk})
                    :await drJson('/api/media?action=maha-image',{prompt:s.prompt||('portrait in the '+s.target+' style'),userText:'',token:tk,guestId:(window.getGuestId?window.getGuestId():'')});
          }catch(e){ r=null; try{ __swallow(e,'director:sample'); }catch(z){ typeof __swallow === 'function' && __swallow(z, 'video:1074'); /* guard-ok — لا مسجّل */ } }
          if(my!==DR.run) return;
          if(r&&r.ok&&r.json&&r.json.imageBase64){
            s.image=r.json.imageBase64; s.mime=r.json.mimeType||'image/png';
            if(s.type==='story'){ var sf=await drStoryFrame(s.image,s.mime,s.cap,capDir); if(my!==DR.run) return; if(sf){ s.image=sf.b64; s.mime=sf.mime; } }
            else if(s.cap){ var cc=await drCaptionSample(s.image,s.mime,s.cap,capDir); if(my!==DR.run) return; if(cc){ s.image=cc.b64; s.mime=cc.mime; } }
            s.board.img='data:'+s.mime+';base64,'+s.image; ST.bi=ST.board.indexOf(s.board); drStageNext(); /* النموذج يظهر في الشاشة الحيّة فور توليده */
          } else if(s.type==='story'){ failed++; s.type='title'; s.text=plan.title; s.sub=s.narration; s.image=''; } /* مشهد قصّة لم يُرسم: بطاقة بسطره لا شاشة من التطبيق */
          else { failed++; s.type='screen'; s.target='portrait'; s.steps=(screens.portrait||{steps:[]}).steps; s.image=''; }
          doneS++; drStep('samples','on',drT('vdScene',{i:doneS,n:samples.length}),doneS/samples.length);
        });
        if(my!==DR.run) return;
        drStep('samples','ok',failed?drT(story?'vdWarnDraw':'vdWarnSamples',{n:failed}):'');
      } else drStep('samples','ok','');
      /* ٤) المانيفست إلى الجسر مباشرة (رمز المهمّة وعنوان الجسر أُخذا في الخطوة ٠) */
      drStep('shots','on');
      var manifest={lang:lang,title:plan.title,scenes:scenes.map(function(s){ return {type:(s.type==='story'?'style_sample':s.type),target:s.target,text:(s.type==='screen'?s.cap:s.text),sub:s.sub,steps:s.steps||undefined,image:s.image||undefined,mime:s.mime||undefined,audio:s.audio||undefined,seconds:s.seconds}; })};
      var post;
      try{ post=await fetch(bridge+'/render',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},auth),body:JSON.stringify(manifest)}); }
      catch(e){ drStep('shots','err'); throw drFail('bridge offline (browser)'); } /* الخادم وصله قبل قليل: المتصفّح هو من مُنع (أصل الصفحة أو الشبكة) */
      var pj=await post.json().catch(function(){ return null; }); if(my!==DR.run) return;
      if(!post.ok||!pj||!pj.jobId){ drStep('shots','err'); throw drFail('render '+post.status+(pj&&pj.error?' '+pj.error:'')); }
      var jobId=pj.jobId, st=pj, url='', lost=0;
      /* ٥) الاستطلاع كلّ ٣ ثوانٍ: التصوير ثمّ الدمج — جسر انقطع أو أُعيد تشغيله يُعلَن لا يُنتظر للأبد */
      while(my===DR.run){
        await new Promise(function(x){ setTimeout(x,3000); }); if(my!==DR.run) return;
        var sr=null, sj=null; try{ sr=await fetch(bridge+'/render/'+encodeURIComponent(jobId),{headers:auth}); sj=await sr.json(); }catch(e){ sj=null; }
        if(sr&&(sr.status===404||sr.status===401)){ drStep('shots','err'); throw drFail('render '+sr.status+' '+((sj&&sj.error)||'')); }
        if(!sr||!sr.ok||!sj||typeof sj!=='object'){ if(++lost>=20){ drStep('shots','err'); throw drFail('bridge offline'); } continue; }
        lost=0; st=sj;
        if(st.state==='queued'){ drStep('shots','on',L('vdQueued'),0.02); continue; }
        /* v-app-director-watchdog: المنقضي من الخطوة وآخر سطر من سجلّ الجسر؛ وما صار بطاقة عنوان أو مقطعًا ثابتًا يُعلَن لا يُخفى */
        var stLog=(st.lastLog&&st.lastLog.length)?String(st.lastLog[st.lastLog.length-1]||''):'', stT=drMmss(st.stepMs);
        var shotsNote=st.fallbacks?drT('vdWarnShots',{n:st.fallbacks}):'', joinNote=st.stills?drT('vdWarnStills',{n:st.stills}):'';
        if(st.step==='assets'||st.step==='capture'){ drStep('shots','on',(st.total?drT('vdScene',{i:st.done||0,n:st.total})+' · ':'')+stT,st.step==='capture'&&st.total?(st.done||0)/st.total:0.03,stLog); }
        if(st.step==='segments'||st.step==='join'){ drStep('shots','ok',shotsNote); drStep('join','on',(st.step==='segments'&&st.total?drT('vdScene',{i:st.done||0,n:st.total})+' · ':'')+stT,st.step==='segments'&&st.total?0.8*(st.done||0)/st.total:0.9,stLog); }
        if(st.state==='error'){ drStep(st.step==='capture'||st.step==='assets'?'shots':'join','err'); throw drFail('render '+(st.step||'')+' '+(st.message||'')+(stLog?' · '+stLog:'')); }
        if(st.state==='done'){ drStep('shots','ok',shotsNote); drStep('join','ok',joinNote); url=bridge+st.url; break; }
      }
      if(my!==DR.run||!url) return;
      /* ٦) الفيديو: معاينة وتحميل وحفظ */
      var vr=await fetch(url,{headers:auth}); if(!vr.ok) throw drFail('download '+vr.status);
      var blob=await vr.blob(); if(my!==DR.run) return;
      if(DR.out){ try{ URL.revokeObjectURL(DR.out); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1117'); /* guard-ok — رابط زال */ } }
      DR.out=URL.createObjectURL(blob); pbNewVideo(); /* v-director-publish-guard */
      var vid=id('vdVideo'), dl=id('vdDl'), res=id('vdRes');
      drStagePct(100); drStageStop(true);
      if(vid) vid.src=DR.out; if(dl){ dl.href=DR.out; dl.setAttribute('download','omran-app-director-'+lang+'.mp4'); } if(res) res.classList.add('has');
      /* لا «حُفظ في فيديوهاتي»: autoSaveVideo خطّاف فارغ اليوم ولا مكتبة فيديوهات في التطبيق — لا نعلن ما لم يحدث؛ الفيديو يبقى هنا للمعاينة والتحميل */
      var secs=Number(st.seconds)||0; drMsg(drT('vdDone',{m:Math.floor(secs/60),s:secs%60}));
      if(typeof window.autoSaveVideo==='function') window.autoSaveVideo(DR.out,'omran-app-director-'+lang+'.mp4');
    }catch(err){
      if(my!==DR.run) return;
      var code=String((err&&err.code)||(err&&err.message)||'');
      var key=/disk_full/.test(code)?'vdFailDisk':/bridge_outdated/.test(code)?'vdFailBridgeOld':/^plan/.test(code)?'vdFailPlan':/^voice/.test(code)?'vdFailVoice':(/^token|offline/.test(code)?'vdFailBridge':(/^(render|download|bridge)/.test(code)?'vdFailRender':'vdFail'));
      /* السبب الحقيقيّ بين قوسين (القسم للمالك وحده): ما قاله الخادم عن كلّ محاولة، لا رسالة عامّة */
      drMsg(key==='vdFail'?L('vdFail'):L('vdFail')+' — '+L(key),true,code.slice(0,520));
      drStageStop(true);
      try{ __swallow(err,'director:run'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1132'); /* guard-ok — لا مسجّل */ }
      DR.run++; DR.busy=false; syncDirector(); /* رفع الرمز يوقف ما بقي من نداءات الخلفيّة */
    }finally{ if(my===DR.run){ DR.busy=false; drStageStop(false); syncDirector(); } }
  }
  /* ═══ v-vmk-clean-video: قسم «تحسين فيديو» ═══ */
  var CL={file:null,orig:'',out:'',meta:null,level:'light',busy:false,ff:null,ffLoading:null,run:0,msg:null,view:null,showing:'after'};
  var CL_MAX_SEC=60;
  /* v-video-enhance-pro: حالة «تحسين احترافي» — info إعداد الخادم لهذا الحساب، stage ''|'up' (رفع وفحص، يُلغى)|'run' (أُرسل التأكيد، لا إلغاء)،
     id/up/quote مهمّة الملفّ المختار، parked مهمّة تُركت تكمل على الخادم، last آخر محاولة استئناف، job المهمّة المتابَعة الآن (ليست دائمًا
     مهمّة الملفّ المختار: مهمّة الحساب الجارية أو المستأنَفة)، who جلسة الدخول التي تخصّها هذه الحالة. التخزين المحلّيّ يحفظ معرّف آخر نتيجة عُرضت فقط. */
  var PRO={info:null,asked:false,stage:'',id:'',up:false,quote:null,xhr:null,parked:'',last:0,job:''}, PRO_SEEN='vmk_pro_seen';
  function clMaxMB(){ return (window.matchMedia&&matchMedia('(max-width:860px)').matches)?80:200; }
  function clRevoke(u){ try{ if(u) URL.revokeObjectURL(u); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1144'); /* guard-ok — رابط زال */ } }
  var clLoad=null;
  function clFF(){
    if(CL.ff) return Promise.resolve(CL.ff);
    if(clLoad) return clLoad; /* ضغطتان أثناء التحميل = تحميل واحد لا عاملان */
    var p=(async function(){
      var mod=await import('/ffmpeg/lib/index.js'); var ff=new mod.FFmpeg();
      CL.ffLoading=ff; /* الإلغاء أثناء التحميل يُنهي هذه النسخة نفسها */
      try{
        await Promise.race([
          ff.load({coreURL:'/ffmpeg/core/ffmpeg-core.js',wasmURL:'/ffmpeg/core/ffmpeg-core.wasm',classWorkerURL:'/ffmpeg/lib/worker.js'}),
          new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('ffmpeg load timeout')); },120000); })
        ]);
      }catch(e){ try{ ff.terminate(); }catch(x){ typeof __swallow === 'function' && __swallow(x, 'video:1157'); /* guard-ok — أُنهي بالإلغاء */ } throw e; }
      finally{ if(CL.ffLoading===ff) CL.ffLoading=null; }
      if(CL.ff&&CL.ff!==ff){ try{ ff.terminate(); }catch(x){ typeof __swallow === 'function' && __swallow(x, 'video:1159'); /* guard-ok — نسخة زائدة */ } return CL.ff; }
      CL.ff=ff; return ff;
    })();
    clLoad=p;
    var done=function(){ if(clLoad===p) clLoad=null; }; p.then(done,done);
    return p;
  }
  function stageDims(){
    var stage=M.querySelector('.vmk-stage'); if(!stage) return;
    var r=((id('videoMakerRatio')||{}).value||'1280:720').split(':'), w=+r[0], h=+r[1];
    if(tab==='clean'){ var d=(CL.view&&CL.view.w)?CL.view:CL.meta; if(d&&d.w){ w=d.w; h=d.h; } }
    stage.style.setProperty('--vmk-ar',w+'/'+h); stage.style.maxWidth=(w<h)?'238px':'';
    var dm=stage.querySelector('.vmk-dim'); if(dm) dm.textContent=w+'×'+h;
  }
  function clStage(url){
    var v=id('vmkClView'); if(!v) return;
    if(!url){ CL.view=null; v.removeAttribute('src'); try{ v.load(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1175'); /* guard-ok — بلا مصدر */ } v.style.display='none'; M.firstElementChild.classList.remove('vmk-cl-view'); stageDims(); return; }
    var t=v.currentTime||0;
    if(v.getAttribute('src')!==url){ CL.view=null; v.src=url; try{ v.currentTime=t; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1177'); /* guard-ok — قبل تحميل البيانات */ } }
    v.style.display='block'; M.firstElementChild.classList.add('vmk-cl-view');
    v.onloadedmetadata=function(){ if(v.videoWidth){ CL.view={w:v.videoWidth,h:v.videoHeight}; stageDims(); } }; /* أبعاد المعروض فعلًا (بعد المضاعفة أو لملفّ لم تُقرأ بياناته قبل التحسين) */
    stageDims();
  }
  function clMsg(text,err){ CL.msg=text?{text:text,err:!!err}:null; var m=id('vmkClMsg'); if(m){ m.textContent=text||''; m.className='vmk-cl-msg'+(err?' err':''); } }
  function clProgress(p){ var b=id('vmkClBar'), n=id('vmkClPct'); var v=Math.max(0,Math.min(100,Math.round(p*100))); if(b) b.style.width=v+'%'; if(n) n.textContent=v+'%'; }
  /* v-vmk-clean-prog (تدقيق ١٨–١٩ أكتوبر، لقطة ٠٢٣): WebM بلا مدّة مقروءة وقف على 0% نحو ثلاث دقائق ثمّ قفز إلى 100% — الأداة لا تحسب
     نسبة بلا مدّة، لكنّ الحدث نفسه يحمل الزمن المعالَج (time بالميكروثانية). بمدّة معروفة ونسبة موجبة: النسبة كما كانت؛ وغير ذلك
     (مدّة غير مقروءة، أو ملفّ يعرف المتصفّح مدّته ولا تعرفها الأداة فتبقى نسبتها صفرًا): الزمن المعالَج مكان النسبة والشريط بلمعة
     غير محدّدة (vmk-cl-ind) حتّى تصل نسبة حقيقيّة. بلا نصّ جديد. */
  function clProg(meta,ev){
    var p=+(ev&&ev.progress);
    if(meta&&meta.sec>0&&isFinite(p)&&p>0) return {pct:Math.max(0,Math.min(100,Math.round(p*100)))};
    var s=Math.floor((+(ev&&ev.time)||0)/1e6); if(!(s>0)) s=0;
    return {clock:Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60)};
  }
  try{ window.__vmkClProg=clProg; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1194'); /* guard-ok — بيئة بلا window */ }
  function clRender(){
    var box=id('vmkClean'); if(!box) return;
    var has=!!CL.file, done=!!CL.out;
    box.innerHTML='<div class="vmk-cl-head"><b></b><p></p></div>'
      +'<label class="vmk-cl-drop" id="vmkClDrop"><input type="file" accept="video/*" id="vmkClInput"><span class="vmk-cl-plus">+</span><span class="vmk-cl-pick"></span><small class="vmk-cl-lim"></small></label>'
      +'<div class="vmk-cl-file" id="vmkClFile"><video id="vmkClOrig" muted playsinline controls></video><div class="vmk-cl-info" id="vmkClInfo"></div></div>'
      +'<div class="vmk-cl-opts" id="vmkClOpts"><div class="vmk-pills vmk-cl-level"><span class="vmk-pill" data-lv="light"></span><span class="vmk-pill" data-lv="strong"></span></div>'
      +'<label class="vmk-cl-up"><input type="checkbox" id="vmkClUp"><span></span></label></div>'
      +'<button type="button" class="vmk-cl-go" id="vmkClGo"></button>'
      +'<button type="button" class="vmk-cl-go vmk-cl-pro" id="vmkClPro"></button><p class="vmk-cl-pnote" id="vmkClProNote"></p>'
      +'<div class="vmk-cl-prog" id="vmkClProg"><div class="vmk-cl-track"><i id="vmkClBar"></i></div><div class="vmk-cl-prow"><span id="vmkClPct">0%</span><span class="vmk-cl-wk"></span><button type="button" id="vmkClCancel"></button></div></div>'
      +'<div class="vmk-cl-done" id="vmkClDone"><div class="vmk-pills vmk-cl-ab"><span class="vmk-pill" data-ab="before"></span><span class="vmk-pill" data-ab="after"></span></div><a class="vmk-cl-dl" id="vmkClDl" download="video-clean.mp4"></a></div>'
      +'<p class="vmk-cl-msg" id="vmkClMsg"></p><p class="vmk-cl-note"></p>';
    box.querySelector('.vmk-cl-head b').textContent=L('vclTitle');
    box.querySelector('.vmk-cl-head p').textContent=L('vclSub');
    box.querySelector('.vmk-cl-pick').textContent=has?(CL.file.name):L('vclPick');
    box.querySelector('.vmk-cl-lim').textContent=L('vclDrop').replace('{s}',String(CL_MAX_SEC)).replace('{n}',String(clMaxMB()));
    box.querySelector('[data-lv="light"]').textContent=L('vclLight');
    box.querySelector('[data-lv="strong"]').textContent=L('vclStrong');
    box.querySelector('.vmk-cl-up span').textContent=L('vclUpscale');
    box.querySelector('#vmkClGo').textContent=L('vclStart');
    box.querySelector('.vmk-cl-wk').textContent=L('vclWorking');
    box.querySelector('#vmkClCancel').textContent=L('vclCancel');
    box.querySelector('[data-ab="before"]').textContent=L('vclBefore');
    box.querySelector('[data-ab="after"]').textContent=L('vclAfter');
    box.querySelector('#vmkClDl').textContent=L('vclDownload');
    box.querySelector('.vmk-cl-note').textContent=L('vclNote');
    /* v-video-enhance-pro: زرّ واحد وسطر تنبيه واحد تحت الزرّ المجّانيّ — يظهران فقط حين يفتح الخادم الميزة لهذا الحساب.
       فحص محلّيّ يفشل = الزرّ معطَّل والسطر يقول السبب (لا يُرفع ملفّ سيُرفض)؛ عرض تكلفة قائم = الزرّ يصير «تأكيد وخصم». */
    var pi=PRO.info, pb=id('vmkClPro'), pn=id('vmkClProNote'), pq=(PRO.quote&&PRO.id)?PRO.quote:null;
    var why=(has&&pi)?proCheck(pi,CL.file,CL.meta):'', est=(pi&&CL.meta&&!pq&&!why)?proEstimate(pi,CL.meta.sec):0;
    pb.textContent=pq?proText('vclProConfirm',{n:pq.cost}):L('vclPro'); pb.classList.toggle('ask',!!pq); pb.disabled=!!why;
    if(est>0) pb.setAttribute('data-cost',est+' '+L('pricingPointsUnit'));
    pn.textContent=why?proText(why,{n:pi.maxMB,s:pi.maxSec}):(pi?proText('vclProNotice',{n:pi.rate,m:pi.rate*pi.minSec,s:pi.maxSec}):'');
    var small=!!(CL.meta&&Math.min(CL.meta.w,CL.meta.h)<=540);
    id('vmkClFile').style.display=has?'':'none'; id('vmkClOpts').style.display=has?'':'none';
    id('vmkClGo').style.display=has&&!CL.busy?'':'none'; id('vmkClProg').style.display=CL.busy?'':'none';
    id('vmkClDone').style.display=done&&!CL.busy?'':'none'; id('vmkClDrop').classList.toggle('has',has);
    var proOn=has&&!CL.busy&&!!(pi&&pi.on); pb.style.display=proOn?'':'none'; pn.style.display=proOn?'':'none';
    box.querySelector('.vmk-cl-ab').style.display=CL.orig?'':'none'; /* نتيجة استُؤنفت بلا الملفّ الأصليّ: لا «قبل/بعد» */
    var up=id('vmkClUp'); up.disabled=!small; up.checked=small&&!!CL.upscale; up.parentElement.style.opacity=small?'1':'.45';
    [].forEach.call(box.querySelectorAll('[data-lv]'),function(p){ p.setAttribute('aria-checked',String(p.dataset.lv===CL.level)); p.onclick=function(){ if(!CL.busy){ CL.level=p.dataset.lv; clRender(); } }; });
    [].forEach.call(box.querySelectorAll('[data-ab]'),function(p){ p.setAttribute('aria-checked',String(p.dataset.ab===CL.showing)); p.onclick=function(){ CL.showing=p.dataset.ab; clStage(CL.showing==='before'?CL.orig:CL.out); clRender(); }; });
    up.onchange=function(){ CL.upscale=up.checked; };
    if(has){ var ov=id('vmkClOrig'); ov.src=CL.orig; id('vmkClInfo').textContent=(CL.meta?((CL.meta.sec>0?Math.round(CL.meta.sec)+'s · ':'')+CL.meta.w+'×'+CL.meta.h+' · '):'')+(CL.file.size/1048576).toFixed(1)+' MB'; }
    if(done){ id('vmkClDl').href=CL.out; }
    if(CL.msg) clMsg(CL.msg.text,CL.msg.err); /* الرسالة تبقى بعد إعادة الرسم (تغيير اللغة أو بدء التحميل) */
    id('vmkClInput').onchange=function(e){ var f=e.target.files&&e.target.files[0]; if(f) clPick(f); };
    var dz=id('vmkClDrop');
    dz.ondragover=function(e){ e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave=function(){ dz.classList.remove('over'); };
    dz.ondrop=function(e){ e.preventDefault(); dz.classList.remove('over'); var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) clPick(f); };
    id('vmkClGo').onclick=clRun;
    id('vmkClPro').onclick=clPro;
    id('vmkClCancel').onclick=clCancel;
  }
  function clPick(f){
    /* v-video-enhance-pro: مهمّة احترافيّة تُتابَع (بعد الخصم، بلا إلغاء) لا تقفل القسم — اختيار ملفّ يخرج من متابعتها (accept أدناه) */
    if(CL.busy&&PRO.stage!=='run') return;
    clMsg('');
    if(!/^video\//.test(f.type||'')&&!/\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(f.name||'')){ clMsg(L('vclFail'),true); return; }
    if(f.size>clMaxMB()*1048576){ clMsg(L('vclTooBig').replace('{n}',String(clMaxMB())),true); return; }
    var url=URL.createObjectURL(f), v=document.createElement('video'); v.preload='metadata'; v.muted=true; var settled=false;
    var accept=function(sec,w,h){
      if(settled) return; settled=true;
      /* v-video-enhance-pro: ملفّ اختير ثمّ بدأ «تحسين احترافي» لسابقه قبل أن تُقرأ بياناته — لا يُبدَّل الملفّ تحت رفع جارٍ (عرض تكلفة ملفّ على ملفّ آخر) */
      if(PRO.stage==='up'){ clRevoke(url); return; }
      if(sec>CL_MAX_SEC+0.5){ clRevoke(url); clMsg(L('vclTooLong').replace('{s}',String(CL_MAX_SEC)),true); return; }
      /* …وملفّ مقبول اختير أثناء متابعة مهمّة مدفوعة: المتابعة تُترك (المهمّة تكمل على الخادم وزرّ «تحسين احترافي» يعيدها) والمسار المجّانيّ يعود كما كان */
      if(PRO.stage==='run') proLeave();
      clRevoke(CL.orig); clRevoke(CL.out);
      CL.file=f; CL.orig=url; CL.out=''; CL.meta=w?{sec:sec,w:w,h:h}:null; CL.upscale=!!w&&Math.min(w,h)<=540; CL.showing='before';
      PRO.id=''; PRO.up=false; PRO.quote=null; /* ملفّ جديد = رفع وعرض تكلفة جديدان */
      clRender(); clStage(w?url:''); /* بلا معاينة يُفرَّغ العارض: لا يبقى على رابط ملفّ سابق أُلغي */
    };
    /* WebM من MediaRecorder يعطي مدّة Infinity حتّى يُقرأ كلّه: مدّة غير محدودة = غير معروفة، و-t في الأداة يحدّها */
    v.onloadedmetadata=function(){ var d=v.duration; accept(isFinite(d)&&d>0?d:0,v.videoWidth||0,v.videoHeight||0); };
    /* المتصفّح لا يقرأ كلّ ترميز (HEVC من الآيفون على كروم ويندوز مثلًا) بينما أداة التحسين تفكّه بنفسها:
       يُقبل الملفّ بلا بيانات (حدّ الحجم يكفي)، فلا يُرفض فيديو صالح لأنّ المعاينة وحدها عجزت */
    v.onerror=function(){ accept(0,0,0); };
    setTimeout(function(){ accept(0,0,0); },5000);
    v.src=url;
  }
  async function clRun(){
    if(!CL.file||CL.busy) return;
    /* رمز التشغيل: الإلغاء يرفعه، فكلّ ما يعود بعده من تشغيل قديم يُهمل ولا يمسّ الحالة */
    var my=++CL.run;
    CL.busy=true; clRender(); clMsg(L('vclLoading')); clProgress(0);
    var ff=null, mounted=false, inPath='', onProg=null;
    try{
      ff=await clFF(); if(my!==CL.run) return;
      clMsg('');
      onProg=function(e){
        if(my!==CL.run||!e) return;
        var r=clProg(CL.meta,e), tr=M.querySelector('#vmkClean .vmk-cl-track'), n=id('vmkClPct');
        if(tr) tr.classList.toggle('vmk-cl-ind',r.pct==null);
        if(r.pct!=null) clProgress(r.pct/100); else if(n) n.textContent=r.clock;
      };
      ff.on('progress',onProg);
      try{ await ff.createDir('/clin'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1294'); /* guard-ok — المجلّد موجود من مرّة سابقة */ }
      /* اسم ثابت داخل نظام ملفّات العامل: أسماء الملفّات العربيّة أو بمسافات قد تكسر المسار — ffmpeg يقرأ الصيغة من المحتوى */
      try{ await ff.mount('WORKERFS',{blobs:[{name:'input',data:CL.file}]},'/clin'); mounted=true; inPath='/clin/input'; }
      catch(e){ var buf=new Uint8Array(await CL.file.arrayBuffer()); await ff.writeFile('clin.bin',buf); inPath='clin.bin'; }
      if(my!==CL.run) return;
      var m=CL.meta||{};
      var code=await ff.exec(cleanArgs({input:inPath,output:'clout.mp4',level:CL.level,upscale:!!CL.upscale,w:m.w,h:m.h,maxSec:CL_MAX_SEC}));
      if(my!==CL.run) return;
      if(code!==0) throw new Error('ffmpeg exit '+code);
      var data=await ff.readFile('clout.mp4');
      try{ await ff.deleteFile('clout.mp4'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1304'); /* guard-ok — تنظيف */ }
      if(my!==CL.run) return;
      clRevoke(CL.out); CL.out=URL.createObjectURL(new Blob([data.buffer],{type:'video/mp4'})); CL.showing='after';
      CL.busy=false; clRender(); clStage(CL.out); clProgress(1);
    }catch(err){
      if(my!==CL.run) return; /* أُلغي: الإلغاء أعاد الرسم بنفسه */
      CL.busy=false; clRender(); clMsg(L('vclFail'),true);
      try{ __swallow(err,'video:clean'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1311'); /* guard-ok — لا مسجّل */ }
    }finally{
      if(ff&&onProg){ try{ ff.off('progress',onProg); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1313'); /* guard-ok — أُنهي */ } }
      if(ff&&mounted){ try{ await ff.unmount('/clin'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1314'); /* guard-ok — فُكّ أو أُنهي */ } }
      if(ff&&inPath==='clin.bin'){ try{ await ff.deleteFile('clin.bin'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1315'); /* guard-ok — تنظيف */ } }
    }
  }
  function clCancel(){
    if(!CL.busy) return;
    if(PRO.stage){ proCancel(); return; } /* v-video-enhance-pro: إلغاء الرفع الاحترافيّ لا يُنهي أداة التحسين المحمَّلة */
    CL.run++;
    [CL.ff,CL.ffLoading].forEach(function(f){ try{ if(f) f.terminate(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1322'); /* guard-ok — العامل انتهى */ } });
    CL.ff=null; CL.ffLoading=null; clLoad=null; CL.busy=false; clMsg(''); clRender();
  }
  function syncClean(){
    if(tab!=='clean'){ return; }
    proInfo();
    if(!CL.busy) clRender();
    proResume();
  }
  /* ═══ v-video-enhance-pro: «تحسين احترافي» — رفع ← فحص وعرض التكلفة ← تأكيد ← خصم وتشغيل على الخادم ← النتيجة في العارض نفسه ═══
     المال كلّه في الخادم (api/_lib/video-enhance.js): الواجهة لا تقرّر خصمًا ولا ردًّا، تعرض ما يجيب به فقط. قاعدتان هنا:
     «لم يُخصم شيء» لا تُكتب إلّا حين يُعرف ذلك (قبل إرسال التأكيد، أو برفض صريح من الخادم)؛ وبعد إرسال التأكيد أيّ جواب غير
     واضح (انقطاع، رمز مجهول) لا يُفسَّر — تُسأل الحالة، وهي الحقيقة. الإلغاء متاح قبل التأكيد فقط؛ بعده المهمّة تكمل على الخادم
     ولو أُغلقت النافذة، والنتيجة تنتظر صاحبها يومين ويجدها من أيّ جهاز (الخادم يحفظ مهمّة الحساب). */
  function proTok(){ try{ return (typeof authGet==='function')?(authGet('aiapp_auth_token')||''):''; }catch(e){ return ''; } }
  function proSleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  function proText(k,v){ var s=L(k); Object.keys(v||{}).forEach(function(x){ s=s.split('{'+x+'}').join(String(v[x])); }); return s; }
  /* سبب الفشل الحقيقيّ للمالك وحده (نمط v-video-watch-diag): الخادم لا يرسل __diag لغيره، وعطل الرفع أو الشبكة يُكتب هنا. نصّ الخادم لا يُعرض لمستخدم. */
  function proDiag(d,local){
    var own=false; try{ own=String(authGet('aiapp_username')||'').trim().toLowerCase()==='omran'; }catch(e){ own=false; }
    var s=(d&&d.__diag)||(local&&own?local:'');
    return s?' ['+String(s).slice(0,300)+']':'';
  }
  function proQuoteText(q){ return proText('vclProQuote',{s:q.sec,n:q.cost,p:q.points==null?'∞':q.points})+proDiag(q); }
  function proWallets(){ ['refreshPointsWallet','refreshPremiumPoints'].forEach(function(n){ try{ if(typeof window[n]==='function') window[n](); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1346'); /* guard-ok — الرصيد يتحدّث عند أوّل قراءة تالية */ } }); }
  function proSeenId(){ try{ return localStorage.getItem(PRO_SEEN)||''; }catch(e){ return ''; } }
  /* عُرضت نتيجتها (أو انتهت): لا تُستأنف ثانية — في التخزين للزيارة التالية، وفي الذاكرة إن تعذّر التخزين */
  function proForget(jid){ if(PRO.parked===jid) PRO.parked=''; if(PRO.info&&PRO.info.job===jid) PRO.info.job=null; }
  function proSeen(jid){
    proForget(jid);
    try{ localStorage.setItem(PRO_SEEN,jid); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1352'); /* guard-ok — بلا تخزين تُعرض النتيجة مرّة أخرى في زيارة تالية */ }
  }
  function proDrop(jid){ if(!jid||PRO.id===jid){ PRO.id=''; PRO.up=false; PRO.quote=null; } }
  function proIdle(){ PRO.stage=''; PRO.xhr=null; CL.busy=false; clRender(); }
  function proStage(text,cancelable){
    var w=M.querySelector('#vmkClean .vmk-cl-wk'), c=id('vmkClCancel');
    if(w) w.textContent=text; if(c) c.style.display=cancelable?'':'none';
  }
  function proBusy(stage,text,cancelable,p){
    PRO.stage=stage; if(!CL.busy){ CL.busy=true; clRender(); }
    clMsg(''); proStage(text,cancelable); clProgress(p);
  }
  function proClock(ms){ var n=id('vmkClPct'), s=Math.max(0,Math.floor(ms/1000)); if(n) n.textContent=Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60); }
  async function proApi(step,payload){
    /* POST دائمًا، حتّى للاستطلاع: عامل الخدمة يحوّل GET الفاشل إلى 503 مزيّف ولا يلمس POST؛ والرمز في الجسم كبقيّة خطوات الفيديو */
    var r=await fetch('/api/video?action=video-enhance&step='+step,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({token:proTok()},payload||{}))});
    var d=await r.json().catch(function(){ return null; });
    return {status:r.status,d:(d&&typeof d==='object')?d:{}};
  }
  function proInfo(){
    if(typeof fetch!=='function') return;
    /* مرّة لكلّ جلسة دخول: الجواب يخصّ الحساب (المالك وحده قبل الفتح للجميع، ومهمّته هو)، والدخول لا يعيد تحميل الصفحة.
       جواب حساب سابق يُنسى، وقراءة فشلت تُعاد عند أوّل فتح للقسم بعد نصف دقيقة. بلا جواب لا يظهر الزرّ والمسار المجّانيّ كما هو. */
    var tk=proTok(), who=tk||'-'; if(PRO.asked===who) return;
    /* جلسة أخرى في الصفحة نفسها (الخروج والدخول لا يعيدان تحميلها): مهمّة الحساب السابق وعرض تكلفته ومهمّته المركونة لا تُعرض لغيره ولا
       تُستطلع برمزه. مرحلة جارية تُترك: جواب الخادم برمز الجلسة الجديدة ينهيها. */
    if(PRO.who!==undefined&&PRO.who!==who&&!PRO.stage){ if(!CL.busy&&(PRO.id||PRO.parked||PRO.quote)) clMsg(''); PRO.id=''; PRO.up=false; PRO.quote=null; PRO.parked=''; }
    PRO.who=who; PRO.asked=who; PRO.info=null;
    var again=function(){ setTimeout(function(){ if(PRO.asked===who&&!PRO.info) PRO.asked=false; },30000); };
    /* GET لا POST: أيّ POST إلى /api/video يفتح شريط طلب الإشعارات، وقراءة الإعداد عند فتح التبويب لا تستحقّه */
    fetch('/api/video?action=video-enhance&step=info',tk?{headers:{Authorization:'Bearer '+tk}}:undefined)
      .then(function(r){ return r.json(); }).then(function(d){
        if(PRO.asked!==who) return;
        if(!d||d.ok!==true){ again(); return; }
        if(d.job&&d.job===proSeenId()) d.job=null;
        PRO.info=d; if(!CL.busy&&tab==='clean') clRender(); proResume();
      }).catch(again);
  }
  function proPut(url,mime,file,my){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(); PRO.xhr=x;
      var bad=function(){ rej({error:'upload',local:'http '+x.status}); };
      x.open('PUT',url,true); x.timeout=900000;
      x.setRequestHeader('Content-Type',mime); /* النوع الذي أصدر الخادم الهدف به حرفيًّا */
      x.upload.onprogress=function(e){ if(my===CL.run&&e.lengthComputable&&e.total>0) clProgress(e.loaded/e.total*0.9); };
      x.onload=function(){ if(x.status>=200&&x.status<300) res(); else bad(); };
      x.onerror=bad; x.ontimeout=bad; x.onabort=bad;
      x.send(file);
    });
  }
  function proFail(d,local,keep){
    d=d||{}; var pi=PRO.info||{}, k=proErrKey(d.error);
    if(!keep) proDrop('');
    proIdle();
    clMsg(proText(k,{p:d.points==null?0:d.points,n:k==='vclTooBig'?pi.maxMB:(d.needed==null?'':d.needed),s:pi.maxSec})+proDiag(d,local),true);
  }
  async function clPro(){
    var pi=PRO.info;
    if(!CL.file||CL.busy||!pi||!pi.on||proCheck(pi,CL.file,CL.meta)) return;
    if(!proTok()){ try{ if(typeof window.requireLogin==='function') window.requireLogin('guestLimit'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1411'); /* guard-ok — بلا شاشة دخول لا شيء يُرفع */ } return; }
    if(PRO.quote&&PRO.id){ proConfirm(PRO.quote); return; }
    /* مهمّة للحساب لم تُعرف نهايتها أو لم تُرَ نتيجتها (رُكنت، تُركت باختيار ملفّ آخر، أو بدأت من جهاز آخر): الزرّ يسأل الخادم عنها أوّلًا —
       لا رفع ثانٍ ولا عرض تكلفة ثانٍ لفيديو ربّما خُصم ثمنه، ولا مهمّة جديدة تكتب فوق نتيجة مدفوعة لم تُعرض */
    if(proResume(true)) return;
    var my=++CL.run, f=CL.file, q=null, step='start';
    proBusy('up',L('vclProUploading'),true,0);
    try{
      if(!PRO.up||!PRO.id){
        var s=await proApi('start',{size:f.size,mime:f.type||'',name:f.name||'',durationSec:(CL.meta&&CL.meta.sec)||0});
        if(my!==CL.run) return;
        if(s.d.error==='busy'&&s.d.job){ proBusy('run',L('vclProWorking'),false,1); proWatch(String(s.d.job),my); return; } /* مهمّة الحساب ما زالت جارية */
        if(!s.d.ok||!s.d.id||!s.d.upload){ proFail(s.d,'start '+s.status); return; }
        PRO.id=String(s.d.id); PRO.up=false; step='put';
        await proPut(String(s.d.upload),s.d.mime||f.type||'video/mp4',f,my);
        if(my!==CL.run) return;
        PRO.up=true; PRO.xhr=null;
      }
      step='run'; clProgress(0.95);
      /* الخادم ينسخ الملفّ ويقيسه: «لم يصل بعد» و«أعد» وعطل الشبكة أو البوّابة = انتظار ثمّ إعادة، ١٢ مرّة */
      for(var i=0;i<12;i++){
        try{ q=await proApi('run',{id:PRO.id}); }catch(e){ q=null; }
        if(my!==CL.run) return;
        if(q&&q.d.error!=='not_uploaded'&&q.d.error!=='retry'&&!(q.status>=500&&!q.d.error)) break;
        await proSleep(2000); if(my!==CL.run) return;
      }
      if(q&&q.d.ok&&q.d.quote){ PRO.quote=q.d; proIdle(); clMsg(proQuoteText(q.d)); return; }
      if(q&&q.d.ok&&q.d.state){ proBusy('run',L('vclProWorking'),false,1); proWatch(PRO.id,my); return; } /* أُكّدت من نافذة أخرى */
      proFail(q&&q.d.error?q.d:{error:q?'':'upload'},'run '+(q?q.status:'network'));
    }catch(err){
      if(my!==CL.run) return; /* أُلغي: الإلغاء أعاد الرسم بنفسه */
      proFail({error:'upload'},step+': '+((err&&(err.local||err.message))||'network'));
    }
  }
  async function proConfirm(q){
    var jid=PRO.id, my=++CL.run, r=null; PRO.job=jid;
    /* من هنا لا إلغاء: الطلب قد يخصم، وما لا يُعرف مصيره يُسأل عنه الخادم */
    PRO.quote=null; proBusy('run',L('vclProWorking'),false,1); proClock(0);
    try{ r=await proApi('run',{id:jid,confirmed:true,cost:q.cost}); }catch(e){ r=null; }
    if(my!==CL.run) return;
    var d=r?r.d:{};
    if(d.ok&&d.quote){ PRO.quote=d; proIdle(); clMsg(proQuoteText(d)); return; } /* التكلفة تغيّرت: عرض جديد بلا خصم */
    if(d.ok&&d.state){ proWallets(); proWatch(jid,my); return; }
    if(d.error==='busy'){ proWatch(String(d.job||jid),my); return; }
    if(d.refunded!=null){ /* خُصم ثمّ تعذّر الإرسال: الخادم ردّ النقاط في الجواب نفسه */
      proWallets();
      if(d.refunded>0){ proDrop(''); proIdle(); clMsg(proText('vclProRefunded',{n:d.refunded})+proDiag(d),true); }
      else proFail(d);
      return;
    }
    /* رفض صريح قبل الخصم. نقص الرصيد وتوقّف الخدمة يُبقيان العرض (صالح ربع ساعة) فيعيد المستخدم التأكيد بلا رفع ثانٍ */
    if({points_insufficient:1,unavailable:1}[d.error]===1){ PRO.quote=q; proFail(d,'',true); return; }
    if({banned:1,limit:1,not_found:1,resolution:1,auth:1}[d.error]===1){ proFail(d); return; }
    proWatch(jid,my);
  }
  /* استطلاع المهمّة: كلّ ٥ث في أوّل دقيقتين ثمّ ١٠ث، والوقت المنقضي مكان النسبة. خطأ الاستطلاع ليس فشل المهمّة أبدًا. */
  async function proWatch(jid,my){
    var t0=Date.now(), due=0, errs=0, miss=0, el=0, tk0=proTok(); PRO.job=jid;
    try{
      for(;;){
        if(my!==CL.run) return;
        el=Date.now()-t0; proClock(el);
        if(el>=due){
          var r=null; try{ r=await proApi('status',{id:jid}); }catch(e){ r=null; }
          if(my!==CL.run) return;
          el=Date.now()-t0; due=el+(el<120000?5000:10000);
          var d=r?r.d:{};
          if(d.ok===true){
            errs=0; miss=0;
            if(d.state==='done'){ proShow(jid,d,my); return; }
            if(d.state==='failed'){
              proSeen(jid); proWallets(); proDrop(jid); proIdle();
              clMsg(d.refunded>0?proText('vclProRefunded',{n:d.refunded}):L('vclProFail'),true); return;
            }
            if(d.state==='gone'){ proSeen(jid); proDrop(jid); proIdle(); clMsg(''); return; }
            if(d.state==='quoted'||d.state==='upload'){ /* لم يُخصم شيء: العرض من جديد إن كان لملفّنا، وإلّا رجوع صامت */
              proForget(jid);
              if(d.quote&&PRO.id===jid&&CL.file){ PRO.quote=d; proIdle(); clMsg(proQuoteText(d)); }
              else if(PRO.id===jid) proFail({error:'failed'});
              else { proIdle(); clMsg(''); }
              return;
            }
          } else {
            /* «غير موجودة» برمز جلسة أخرى (دخل حساب آخر أثناء المتابعة) ليست «شوهدت»: علامة الجهاز تبقى لصاحب المهمّة فيجد نتيجته حين يعود */
            if(d.error==='not_found'){ if(++miss>=3){ if(proTok()===tk0) proSeen(jid); else proForget(jid); proDrop(jid); proIdle(); clMsg(''); return; } } else miss=0;
            if(++errs>=6){ proPark(jid); return; }
          }
        }
        /* ٥٠ دقيقة: تُترك تكمل على الخادم. بعد الاستطلاع لا قبله: صفحة نامت (هاتف مقفل، تبويب في الخلفيّة) تسأل الخادم مرّة عند
           استيقاظها — المهمّة غالبًا انتهت — ولا تقول «ما زال جاريًا» بلا سؤال */
        if(el>=3000000){ proPark(jid); return; }
        await proSleep(1000);
      }
    }catch(err){
      /* عطل غير متوقَّع في الواجهة لا يحبس القسم في «جارٍ» بلا زرّ إلغاء: المهمّة تكمل على الخادم */
      try{ __swallow(err,'video:pro'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1506'); /* guard-ok — لا مسجّل */ }
      if(my===CL.run) proPark(jid);
    }
  }
  async function proShow(jid,d,my){
    try{
      /* عبر وسيط التنزيل عندنا دائمًا: جلب رابط المزوّد مباشرة يخزّنه عامل الخدمة (GET من أصل آخر) */
      var tk=proTok(), px=(typeof window.__omranProxyVideoUrl==='function')?window.__omranProxyVideoUrl(String(d.url||'')):'';
      if(!/^\/api\//.test(px||'')) throw new Error('no proxy');
      var r=await fetch(px,tk?{headers:{Authorization:'Bearer '+tk}}:undefined);
      if(!r.ok) throw new Error('proxy '+r.status);
      var blob=await r.blob();
      if(my!==CL.run) return;
      if(PRO.id!==jid){ clRevoke(CL.orig); CL.file=null; CL.orig=''; CL.meta=null; } /* ملفّ آخر مختار: «قبل/بعد» لا يقارن بأصل غير أصله */
      proDrop(''); PRO.stage=''; PRO.xhr=null;
      clRevoke(CL.out); CL.out=URL.createObjectURL(blob); CL.showing='after';
      CL.busy=false; clRender(); clStage(CL.out); clProgress(1);
      clMsg(proText('vclProDone',{n:d.cost==null?0:d.cost,s:d.sec==null?'':d.sec}));
      proSeen(jid);
      try{ if(typeof window.mediaReadyNotify==='function') window.mediaReadyNotify('video',true); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1525'); /* guard-ok — الإشعار تحسين */ }
    }catch(err){
      if(my!==CL.run) return;
      proPark(jid); /* النتيجة محفوظة على الخادم: تعذّر جلبها الآن ليس فشلًا */
    }
  }
  function proPark(jid){ PRO.parked=jid; PRO.last=Date.now(); proIdle(); clMsg(L('vclProLater')); }
  /* خروج المستخدم من متابعة مهمّة مدفوعة باختيار ملفّ: لا إلغاء (المهمّة تكمل على الخادم) ولا رسالة — تُركن بمعرّفها المتابَع، وجواب أيّ
     طلب جارٍ يُهمل برمز التشغيل (تأكيد في الطريق تُعرف حقيقته من الحالة عند العودة) */
  function proLeave(){ var jid=PRO.job||PRO.id; CL.run++; if(jid){ PRO.parked=jid; PRO.last=Date.now(); } proIdle(); }
  function proCancel(){
    if(PRO.stage==='run') return; /* بعد إرسال التأكيد لا إلغاء: المهمّة تكمل على الخادم، وإلغاء المزوّد لا يضمن ألّا يحاسبنا */
    CL.run++;
    try{ if(PRO.xhr) PRO.xhr.abort(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1538'); /* guard-ok — الرفع انتهى */ }
    proIdle(); clMsg('');
  }
  /* مهمّة تُركت تكمل (أو بدأت من جهاز آخر): العودة إلى القسم تتابعها — مرّة كلّ دقيقة على الأكثر (أو فورًا بنقرة المستخدم)، ولا تقاطع عملًا جاريًا.
     الاستئناف التلقائيّ لا يأخذ ما على الشاشة: نتيجة معروضة (المجّانيّة تُمحى بعرض غيرها) أو ملفّ مختار غير ملفّ المهمّة يبقيان، والمهمّة
     تنتظر نقرة «تحسين احترافي» أو فتح القسم فارغًا. مهمّة الملفّ المختار نفسه تُستأنف كما كانت. ترجع true حين بدأت متابعة. */
  function proResume(now){
    var jid=String(PRO.parked||(PRO.info&&PRO.info.job)||'');
    if(!/^[a-f0-9]{24}$/.test(jid)||tab!=='clean'||CL.busy||!proTok()||jid===proSeenId()||(now!==true&&Date.now()-PRO.last<60000)) return false;
    if(now!==true&&(CL.out||(CL.file&&PRO.id!==jid))) return false;
    PRO.last=Date.now();
    var my=++CL.run;
    proBusy('run',L('vclProWorking'),false,1);
    proWatch(jid,my);
    return true;
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
      /* v-video-durations (مراجعة ٢٧ أكتوبر): «للتعليق الصوتيّ» حيث يُدمج التعليق وحده — في «سريع» و«سينمائي» بلا «مقدّمة وخاتمة» مربّعه مخفيّ
         وكان الزرّ يفعّله فيُكتب تعليق لا يُطبَّق ولا يُطفأ */
      var ntg=id('videoMakerNarrationToggle'), ntl=ntg&&ntg.closest('label'), narrOn=!(ntl&&ntl.style.display==='none');
      if((r.narration||r.lines.length)&&narrOn) ac.appendChild(act(L('vwToNarr'),function(){
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
      if(o.hidden&&sel.id==='videoMakerMode') return; /* v-owner-modes */
      var t=(o.textContent||'').trim(), m=t.match(ICO), ic=m?m[1]:'', tx=short(t.slice(ic.length))||o.value;
      var el=document.createElement('div'); el.className=(kind==='card'?'vmk-card':'vmk-pill');
      el.setAttribute('role','radio'); el.dataset.v=o.value;
      if(kind==='card'){
        el.innerHTML='<i></i><b></b><s></s>';
        el.querySelector('i').textContent=ic||'🎬';
        el.querySelector('b').textContent=tx;
        el.querySelector('s').textContent=priceLabel(priceOf(o.value)); /* v-vmk-price-src — ويُحدَّث في sync() */
      } else { el.textContent=tx; }
      el.addEventListener('click',function(){
        if(sel.value===o.value) return;
        sel.value=o.value; sel.dispatchEvent(new Event('change')); sync();
      });
      g.appendChild(el);
    });
  }
  /* v-vmk-res-mode (تدقيق ١٨–١٩ أكتوبر، لقطة ٠٠٥): فيديو القوالب المجّانيّ و«تحميل الفيديو» بقيا ظاهرين ويشتغلان في تبويب «فيديو AI» المدفوع —
     runCanvasOnly يُظهر النتيجة ولا يخفيها إلّا «تحسين فيديو». النتيجة موسومة بالوضع الذي أنتجها: في غيره وفي الترندات والتحسين والمخرج
     تُخفى (modules.css) وتتوقّف، وترجع كما هي عند العودة إلى وضعها. بلا وسم (لم يُولَّد شيء) لا تُخفى في الأوضاع. */
  function syncResult(){
    var card=M.firstElementChild, rs=id('videoMakerResult'); if(!card||!rs) return;
    var md=(id('videoMakerMode')||{}).value||'', rm=(rs.dataset&&rs.dataset.mode)||'';
    var other=tab==='trend'||tab==='clean'||tab==='director'||!!(rm&&rm!==md);
    card.classList.toggle('vmk-res-other',other);
    if(other&&!rs.paused){ try{ rs.pause(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'video:1642'); /* guard-ok — مشغّل بلا مصدر */ } }
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
    /* v-vmk-price-src: الزرّ والشريحة وأسعار البطاقات من priceOf وحده (COSTS × مشاهد المدّة المختارة) */
    ensureCosts();
    var mg=id('videoMakerMode'), mg2=mg&&mg.nextElementSibling;
    if(mg2&&mg2.classList.contains('vmk-g')) [].forEach.call(mg2.children,function(c){ var s=c.querySelector('s'); if(s){ var l=priceLabel(priceOf(c.dataset.v)); if(s.textContent!==l) s.textContent=l; } });
    var gbn=id('videoMakerGenerateBtn'), pc=priceOf((mg||{}).value), pl=priceLabel(pc);
    if(gbn){ if(pl) gbn.setAttribute('data-cost',pl); else gbn.removeAttribute('data-cost'); }
    if(chips&&pl){
      var b=document.createElement('span'); b.className='vmk-chip gold pts';
      b.textContent=pl; chips.appendChild(b);
    }
    syncWrite(); syncChars(); syncSamples(); simplify(); syncClean(); syncDirector(); syncResult();
    var tbx=id('vmkTabs'); if(tbx) [].forEach.call(tbx.children,function(bt){ bt.setAttribute('aria-selected',String(bt.dataset.tab===tab)); });
    stageDims();
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
  function enhance(){ if(!on()) return; loadManifest(); guardModes(); build(); buildTabs(); buildDirector(); trendsTop(); syncTutLink(); G.forEach(function(d){ var s=id(d[0]); if(s) group(s,d[1]); }); simplify(); sync(); scrub(); }
  var wasOpen=false;
  new MutationObserver(function(){
    var open=!!(M.style.display&&M.style.display!=='none');
    /* v-vmk-chat-tab (تدقيق ١٨–١٩ أكتوبر، g05 لقطة ٠٣٢): طلب فيديو من المحادثة يملأ الوصف، والفتح على «الترندات» كان يخفيه في قسم آخر.
       omranOpenVideoMaker (app-11) يضع data-vmk-tab بالوضع حين يأتيه نصّ أو صورة: يُفتح عليه مرّة وتُمحى العلامة. الفتح العاديّ على الترندات كلّ مرّة (v-vmk-sections) */
    var want=M.getAttribute('data-vmk-tab'); if(want!=null) M.removeAttribute('data-vmk-tab');
    if(open&&!wasOpen){ tab=(want&&tabsFor().indexOf(want)>=0)?want:'trend'; }
    wasOpen=open;
    if(open) enhance();
  }).observe(M,{attributes:true,attributeFilter:['style']});
  G.forEach(function(d){ var s=id(d[0]); if(s) s.addEventListener('change',sync); });
})();
