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
  try{ window.__vmkCleanArgs=cleanArgs; }catch(e){ /* guard-ok — بيئة بلا window */ }
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
  try{ window.__vmkPro={estimate:proEstimate,check:proCheck,errKey:proErrKey}; }catch(e){ /* guard-ok — بيئة بلا window */ }
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
    if(id('videoMakerResult')) stage.appendChild(id('videoMakerResult'));
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
  var TABS=['trend','canvas','runway','minimax','omni','hybrid','veo','actor','clean'];
  var tab='trend';
  /* v-owner-modes (المالك ١٧ أكتوبر: «أخفي الثلاثة وخلها لي المالك فقط»): «فيديو اقتصادي» و«فيديو سينمائي» (Omni) و«دمج الاثنين»
     تكرّر غيرها وتلخبط الزبون — تختفي لغير المالك (تبويب وبطاقة وخيار)، ويرجع وضعه إلى «فيديو AI» لو كان عليها */
  var OWNER_MODES={minimax:1,omni:1,hybrid:1};
  /* v-owner-modes: «ممثل يتكلم — لهجة إماراتية» كانت صورته وجوهًا لا تشبه أهل الإمارات — رجل بالغترة من صور التطبيق (أعلى الصورة) */
  var TAB_ART={actor:'/assets/studio/options/heritage-emirati.webp'};
  function tabsFor(){ var own=drOwner(); return TABS.filter(function(v){ return own||!OWNER_MODES[v]; }); }
  function guardModes(){
    var sel=id('videoMakerMode'), own=drOwner(); if(!sel) return;
    [].slice.call(sel.options).forEach(function(o){ o.hidden=o.disabled=!own&&!!OWNER_MODES[o.value]; });
    if(!own&&OWNER_MODES[sel.value]){ sel.value='runway'; sel.dispatchEvent(new Event('change')); }
  }
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
  /* v-tab-tut (المالك ١٧ أكتوبر «حط الفيديوين»): «كيف تسوي فيديو» من محرّك القسم نفسه بصوت الراوي — '<الوضع>-tut' في index.json
     يغلب التعليميّ العامّ لذلك القسم (بالعربيّ فقط، فالراوي عربيّ)؛ بلا ملفّ أو بالإنجليزيّ يبقى العامّ */
  function tutUrl(m){ return (m&&VIDEOS[m+'-tut']&&ar())?'/media/samples/'+m+'-tut.mp4':'/media/samples/tutorial-'+(ar()?'ar':'en')+'.mp4'; }
  function openPlayer(src){
    var lb=document.createElement('div'); lb.className='vmk-lb';
    var vd=document.createElement('video'); vd.src=src; vd.controls=true; vd.autoplay=true; vd.playsInline=true;
    var x=document.createElement('button'); x.type='button'; x.className='vmk-lb-x'; x.textContent='×'; x.setAttribute('aria-label',L('vcRemove'));
    /* v-back-layers (تدقيق ١٨–١٩ أكتوبر: «Esc يسكّر فيديو المثال ويسكّر الصانع كلّه معاه»): مستمع الفقاعة هنا كان يأتي بعد
       معالج Esc العامّ (app-05-swipe-back) فيُغلق الصانع أوّلًا. الالتقاط + إيقاف الانتشار: Esc يغلق المشغّل وحده. */
    function close(){ try{ vd.pause(); }catch(e){ /* guard-ok — العنصر يُزال */ } document.removeEventListener('keydown',esc,true); lb.remove(); }
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
      var im=document.createElement('img'); im.className='vmk-tab-img'; im.alt=''; im.loading='lazy'; im.src=TAB_ART[v]||'/assets/videos/tabs/'+v+'.jpg?v=2'; if(TAB_ART[v]) im.style.objectPosition='50% 0';;
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
        el.addEventListener('mouseenter',function(){ try{ var pp=vd.play(); if(pp&&typeof pp.catch==='function') pp.catch(function(){ /* guard-ok — الإيقاف قبل بدء التشغيل ليس خطأ */ }); }catch(e){ /* guard-ok — المتصفّح قد يمنع التشغيل التلقائي */ } });
        el.addEventListener('mouseleave',function(){ try{ vd.pause(); }catch(e){ /* guard-ok — لا أثر */ } });
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
    [id('vmkChars'),stBox,id('videoMakerSignatureRow'),id('videoMakerLongMinutesRow'),
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
      ex.style.display=box.children.length?'':'none';
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
      +'<textarea id="vdReq" rows="3" maxlength="600"></textarea>'
      +'<div class="vmk-dir-row"><label><span></span><select id="vdLang"></select></label><label><span></span><select id="vdSpeaker"><option value="female"></option><option value="male"></option></select></label><label><span></span><select id="vdMin"></select></label><label><span></span><select id="vdVoice"><option value="on"></option><option value="off"></option></select></label></div>'
      +'<label class="vmk-dir-ref"><input type="file" accept="image/*" id="vdRef"><img id="vdRefImg" alt="" hidden><span></span></label>'
      +'<button type="button" id="vdGo"></button>'
      +'<div class="vmk-dir-stage" id="vdStage" hidden><div class="vmk-dir-stage-bg"></div><img id="vdStageImg" alt=""><div class="vmk-dir-stage-reel"></div>'
        +'<div class="vmk-dir-stage-cap" id="vdStageCap"></div><div class="vmk-dir-stage-hud"><span id="vdStageStep"></span><b id="vdStageTime">0:00</b></div><div class="vmk-dir-stage-bar"><i id="vdStageBar"></i></div></div>'
      +'<ol class="vmk-dir-steps" id="vdSteps">'+['plan','voice','samples','shots','join'].map(function(k){ return '<li data-step="'+k+'"><b></b><small></small></li>'; }).join('')+'</ol>'
      +'<p class="vmk-dir-msg" id="vdMsg"></p>'
      +'<div class="vmk-dir-res" id="vdRes"><video id="vdVideo" controls playsinline></video><a class="vmk-dir-dl" id="vdDl" download="omran-app-director.mp4"></a></div>';
    var tabs=id('vmkTabs'); if(tabs&&tabs.parentNode===card) card.insertBefore(box,tabs.nextSibling); else card.appendChild(box);
    var ls=box.querySelector('#vdLang'); DR_LANGS.forEach(function(l){ var o=document.createElement('option'); o.value=l[0]; o.textContent=l[1]; ls.appendChild(o); });
    ls.value=DR_LANGS.some(function(l){ return l[0]===drUiLang(); })?drUiLang():'ar';
    var ms=box.querySelector('#vdMin'); for(var i=1;i<=10;i++){ var o=document.createElement('option'); o.value=String(i); o.textContent=String(i); ms.appendChild(o); } ms.value='2';
    box.querySelector('#vdRef').addEventListener('change',function(e){ var f=e.target.files&&e.target.files[0]; if(f) drPickRef(f); });
    box.querySelector('#vdGo').addEventListener('click',drRun);
    box.querySelector('#vdReq').addEventListener('keydown',function(e){ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); drRun(); } });
    box.querySelector('#vdVoice').addEventListener('change',syncDirector); /* بدون صوت: اختيار المتحدّث بلا معنى فيُعطَّل */
  }
  function syncDirector(){
    var box=id('vmkDirector'); if(!box) return;
    box.querySelector('.vmk-dir-head b').textContent=L('vdTab'); box.querySelector('.vmk-dir-head p').textContent=L('vdSub');
    box.querySelector('#vdReq').placeholder=L('vdPh');
    var labs=box.querySelectorAll('.vmk-dir-row label>span'); labs[0].textContent=L('vdLang'); labs[1].textContent=L('vdSpeaker'); labs[2].textContent=L('vdMinutes'); labs[3].textContent=L('vdVoiceLabel');
    var vo=box.querySelector('#vdVoice'); vo.options[0].textContent=L('vdVoiceOn'); vo.options[1].textContent=L('vdVoiceOff'); box.querySelector('#vdSpeaker').disabled=(vo.value==='off');
    var sp=box.querySelector('#vdSpeaker'); sp.options[0].textContent=L('vdMaha')||'مها'; sp.options[1].textContent=L('vdAbdullah')||'عبدالله';
    box.querySelector('.vmk-dir-ref span').textContent=L('vdRef');
    box.querySelector('#vdGo').textContent=L('vdGo'); box.querySelector('#vdGo').disabled=DR.busy;
    var names={plan:'vdStepPlan',shots:'vdStepShots',samples:'vdStepSamples',voice:'vdStepVoice',join:'vdStepJoin'};
    [].forEach.call(box.querySelectorAll('#vdSteps li'),function(li){ li.querySelector('b').textContent=L(names[li.dataset.step]); });
    box.querySelector('#vdDl').textContent=L('vdDownload');
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
  function drStep(k,state,note,frac){
    var li=M.querySelector('#vdSteps li[data-step="'+k+'"]'); if(!li) return;
    li.classList.remove('on','ok','err'); if(state) li.classList.add(state); li.querySelector('small').textContent=note||'';
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
    if(err){ try{ m.scrollIntoView({block:'end'}); }catch(e){ /* guard-ok — متصفّح بلا خيارات التمرير */ } } /* السبب كان أسفل النافذة مقصوصًا */
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
        }catch(e){ DR.ref=''; try{ __swallow(e,'director:ref'); }catch(x){ /* guard-ok — لا مسجّل */ } }
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
    words.forEach(function(w){ var t=cur?cur+' '+w:w; if(cur&&ctx.measureText(t).width>maxW){ lines.push(cur); cur=w; } else cur=t; });
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
          try{ x.filter='blur(34px) brightness(0.78)'; }catch(e){ /* guard-ok — متصفّح بلا مرشّحات اللوحة: خلفيّة بلا تمويه */ }
          x.drawImage(img,(W-bw)/2,(H-bh)/2,bw,bh);
          try{ x.filter='none'; }catch(e){ /* guard-ok — كسابقه */ }
          var f=Math.min(W/img.width,H/img.height), fw=img.width*f, fh=img.height*f;
          x.drawImage(img,(W-fw)/2,(H-fh)/2,fw,fh);
          var fam='system-ui,sans-serif'; try{ fam=getComputedStyle(document.body).fontFamily||fam; }catch(e){ /* guard-ok — خطّ النظام */ }
          x.font='700 44px '+fam; x.direction=dir==='rtl'?'rtl':'ltr'; x.textAlign='center'; x.textBaseline='middle';
          var lines=drWrap(x,text,W*0.72).slice(0,3), lh=62, padX=46, padY=20, tw=0;
          lines.forEach(function(ln){ tw=Math.max(tw,x.measureText(ln).width); });
          var pw=tw+padX*2, ph=lines.length*lh+padY*2, px=(W-pw)/2, py=H-64-ph, rad=lines.length>1?26:ph/2;
          x.beginPath(); x.moveTo(px+rad,py); x.arcTo(px+pw,py,px+pw,py+ph,rad); x.arcTo(px+pw,py+ph,px,py+ph,rad); x.arcTo(px,py+ph,px,py,rad); x.arcTo(px,py,px+pw,py,rad); x.closePath();
          x.fillStyle='rgba(7,8,12,.84)'; x.fill(); x.lineWidth=2; x.strokeStyle='rgba(232,194,122,.6)'; x.stroke();
          x.fillStyle='#f6e7c3'; lines.forEach(function(ln,i){ x.fillText(ln,W/2,py+padY+lh*i+lh/2); });
          res({b64:c.toDataURL('image/jpeg',0.92).split(',')[1],mime:'image/jpeg'});
        }catch(e){ try{ __swallow(e,'director:caption'); }catch(z){ /* guard-ok — لا مسجّل */ } res(null); }
      };
      img.onerror=function(){ res(null); };
      img.src='data:'+(mime||'image/png')+';base64,'+b64;
    });
  }
  function drFail(code){ return Object.assign(new Error(code),{code:code}); }
  function drPlanCall(body){ return drJson('/api/ai?action=app-director-plan',body); }
  async function drRun(){
    if(DR.busy||!drOwner()) return;
    var req=(id('vdReq').value||'').trim(); if(!req){ drMsg(L('vdEmpty'),true); return; }
    var lang=id('vdLang').value||'ar', speaker=id('vdSpeaker').value||'female', minutes=parseInt(id('vdMin').value,10)||2;
    var voiceOn=((id('vdVoice')||{}).value!=='off'), capDir=(lang==='ar'||lang==='ur')?'rtl':'ltr';
    var my=++DR.run, tk=drTok();
    DR.busy=true; DR.lang=lang; syncDirector(); drReset(); drStageStart();
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
      var vvSpeed=function(){ try{ var V=window.__vmkVoice; return (V&&V.speed&&V.speed())||'fast'; }catch(e){ return 'fast'; /* guard-ok — الافتراضيّ سريع */ } };
      var vvClean=function(t){ try{ var V=window.__vmkVoice; return (V&&V.clean)?V.clean(t):t; }catch(e){ return t; /* guard-ok — النصّ كما هو */ } };
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
            }catch(e){ last='network'; try{ __swallow(e,'director:tts'); }catch(z){ /* guard-ok — لا مسجّل */ } }
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
      var samples=scenes.filter(function(s){ return s.type==='style_sample'; });
      var failed=0;
      if(samples.length){
        drStep('samples','on',drT('vdScene',{i:0,n:samples.length}),0);
        var doneS=0;
        await drPool(samples,2,async function(s){
          if(my!==DR.run) return;
          var r=null;
          try{
            r=DR.ref?await drJson('/api/portrait-style',{imageBase64:DR.ref,mimeType:DR.refMime,style:s.target,token:tk})
                    :await drJson('/api/media?action=maha-image',{prompt:s.prompt||('portrait in the '+s.target+' style'),userText:'',token:tk,guestId:(window.getGuestId?window.getGuestId():'')});
          }catch(e){ r=null; try{ __swallow(e,'director:sample'); }catch(z){ /* guard-ok — لا مسجّل */ } }
          if(my!==DR.run) return;
          if(r&&r.ok&&r.json&&r.json.imageBase64){
            s.image=r.json.imageBase64; s.mime=r.json.mimeType||'image/png';
            if(s.cap){ var cc=await drCaptionSample(s.image,s.mime,s.cap,capDir); if(my!==DR.run) return; if(cc){ s.image=cc.b64; s.mime=cc.mime; } }
            s.board.img='data:'+s.mime+';base64,'+s.image; ST.bi=ST.board.indexOf(s.board); drStageNext(); /* النموذج يظهر في الشاشة الحيّة فور توليده */
          } else { failed++; s.type='screen'; s.target='portrait'; s.steps=(screens.portrait||{steps:[]}).steps; s.image=''; }
          doneS++; drStep('samples','on',drT('vdScene',{i:doneS,n:samples.length}),doneS/samples.length);
        });
        if(my!==DR.run) return;
        drStep('samples','ok',failed?drT('vdWarnSamples',{n:failed}):'');
      } else drStep('samples','ok','');
      /* ٤) المانيفست إلى الجسر مباشرة (رمز المهمّة وعنوان الجسر أُخذا في الخطوة ٠) */
      drStep('shots','on');
      var manifest={lang:lang,title:plan.title,scenes:scenes.map(function(s){ return {type:s.type,target:s.target,text:(s.type==='screen'?s.cap:s.text),sub:s.sub,steps:s.steps||undefined,image:s.image||undefined,mime:s.mime||undefined,audio:s.audio||undefined,seconds:s.seconds}; })};
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
        if(st.step==='assets'||st.step==='capture'){ drStep('shots','on',st.total?drT('vdScene',{i:st.done||0,n:st.total}):'',st.step==='capture'&&st.total?(st.done||0)/st.total:0.03); }
        if(st.step==='segments'||st.step==='join'){ drStep('shots','ok',''); drStep('join','on',st.step==='segments'&&st.total?drT('vdScene',{i:st.done||0,n:st.total}):'',st.step==='segments'&&st.total?0.8*(st.done||0)/st.total:0.9); }
        if(st.state==='error'){ drStep(st.step==='capture'||st.step==='assets'?'shots':'join','err'); throw drFail('render '+(st.step||'')+' '+(st.message||'')); }
        if(st.state==='done'){ drStep('shots','ok',''); drStep('join','ok',''); url=bridge+st.url; break; }
      }
      if(my!==DR.run||!url) return;
      /* ٦) الفيديو: معاينة وتحميل وحفظ */
      var vr=await fetch(url,{headers:auth}); if(!vr.ok) throw drFail('download '+vr.status);
      var blob=await vr.blob(); if(my!==DR.run) return;
      if(DR.out){ try{ URL.revokeObjectURL(DR.out); }catch(e){ /* guard-ok — رابط زال */ } }
      DR.out=URL.createObjectURL(blob);
      var vid=id('vdVideo'), dl=id('vdDl'), res=id('vdRes');
      drStagePct(100); drStageStop(true);
      if(vid) vid.src=DR.out; if(dl){ dl.href=DR.out; dl.setAttribute('download','omran-app-director-'+lang+'.mp4'); } if(res) res.classList.add('has');
      /* لا «حُفظ في فيديوهاتي»: autoSaveVideo خطّاف فارغ اليوم ولا مكتبة فيديوهات في التطبيق — لا نعلن ما لم يحدث؛ الفيديو يبقى هنا للمعاينة والتحميل */
      var secs=Number(st.seconds)||0; drMsg(drT('vdDone',{m:Math.floor(secs/60),s:secs%60}));
      if(typeof window.autoSaveVideo==='function') window.autoSaveVideo(DR.out,'omran-app-director-'+lang+'.mp4');
    }catch(err){
      if(my!==DR.run) return;
      var code=String((err&&err.code)||(err&&err.message)||'');
      var key=/bridge_outdated/.test(code)?'vdFailBridgeOld':/^plan/.test(code)?'vdFailPlan':/^voice/.test(code)?'vdFailVoice':(/^token|offline/.test(code)?'vdFailBridge':(/^(render|download|bridge)/.test(code)?'vdFailRender':'vdFail'));
      /* السبب الحقيقيّ بين قوسين (القسم للمالك وحده): ما قاله الخادم عن كلّ محاولة، لا رسالة عامّة */
      drMsg(key==='vdFail'?L('vdFail'):L('vdFail')+' — '+L(key),true,code.slice(0,520));
      drStageStop(true);
      try{ __swallow(err,'director:run'); }catch(e){ /* guard-ok — لا مسجّل */ }
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
  function clRevoke(u){ try{ if(u) URL.revokeObjectURL(u); }catch(e){ /* guard-ok — رابط زال */ } }
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
      }catch(e){ try{ ff.terminate(); }catch(x){ /* guard-ok — أُنهي بالإلغاء */ } throw e; }
      finally{ if(CL.ffLoading===ff) CL.ffLoading=null; }
      if(CL.ff&&CL.ff!==ff){ try{ ff.terminate(); }catch(x){ /* guard-ok — نسخة زائدة */ } return CL.ff; }
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
    if(!url){ CL.view=null; v.removeAttribute('src'); try{ v.load(); }catch(e){ /* guard-ok — بلا مصدر */ } v.style.display='none'; M.firstElementChild.classList.remove('vmk-cl-view'); stageDims(); return; }
    var t=v.currentTime||0;
    if(v.getAttribute('src')!==url){ CL.view=null; v.src=url; try{ v.currentTime=t; }catch(e){ /* guard-ok — قبل تحميل البيانات */ } }
    v.style.display='block'; M.firstElementChild.classList.add('vmk-cl-view');
    v.onloadedmetadata=function(){ if(v.videoWidth){ CL.view={w:v.videoWidth,h:v.videoHeight}; stageDims(); } }; /* أبعاد المعروض فعلًا (بعد المضاعفة أو لملفّ لم تُقرأ بياناته قبل التحسين) */
    stageDims();
  }
  function clMsg(text,err){ CL.msg=text?{text:text,err:!!err}:null; var m=id('vmkClMsg'); if(m){ m.textContent=text||''; m.className='vmk-cl-msg'+(err?' err':''); } }
  function clProgress(p){ var b=id('vmkClBar'), n=id('vmkClPct'); var v=Math.max(0,Math.min(100,Math.round(p*100))); if(b) b.style.width=v+'%'; if(n) n.textContent=v+'%'; }
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
      onProg=function(e){ if(my===CL.run&&e&&typeof e.progress==='number') clProgress(e.progress); };
      ff.on('progress',onProg);
      try{ await ff.createDir('/clin'); }catch(e){ /* guard-ok — المجلّد موجود من مرّة سابقة */ }
      /* اسم ثابت داخل نظام ملفّات العامل: أسماء الملفّات العربيّة أو بمسافات قد تكسر المسار — ffmpeg يقرأ الصيغة من المحتوى */
      try{ await ff.mount('WORKERFS',{blobs:[{name:'input',data:CL.file}]},'/clin'); mounted=true; inPath='/clin/input'; }
      catch(e){ var buf=new Uint8Array(await CL.file.arrayBuffer()); await ff.writeFile('clin.bin',buf); inPath='clin.bin'; }
      if(my!==CL.run) return;
      var m=CL.meta||{};
      var code=await ff.exec(cleanArgs({input:inPath,output:'clout.mp4',level:CL.level,upscale:!!CL.upscale,w:m.w,h:m.h,maxSec:CL_MAX_SEC}));
      if(my!==CL.run) return;
      if(code!==0) throw new Error('ffmpeg exit '+code);
      var data=await ff.readFile('clout.mp4');
      try{ await ff.deleteFile('clout.mp4'); }catch(e){ /* guard-ok — تنظيف */ }
      if(my!==CL.run) return;
      clRevoke(CL.out); CL.out=URL.createObjectURL(new Blob([data.buffer],{type:'video/mp4'})); CL.showing='after';
      CL.busy=false; clRender(); clStage(CL.out); clProgress(1);
    }catch(err){
      if(my!==CL.run) return; /* أُلغي: الإلغاء أعاد الرسم بنفسه */
      CL.busy=false; clRender(); clMsg(L('vclFail'),true);
      try{ __swallow(err,'video:clean'); }catch(e){ /* guard-ok — لا مسجّل */ }
    }finally{
      if(ff&&onProg){ try{ ff.off('progress',onProg); }catch(e){ /* guard-ok — أُنهي */ } }
      if(ff&&mounted){ try{ await ff.unmount('/clin'); }catch(e){ /* guard-ok — فُكّ أو أُنهي */ } }
      if(ff&&inPath==='clin.bin'){ try{ await ff.deleteFile('clin.bin'); }catch(e){ /* guard-ok — تنظيف */ } }
    }
  }
  function clCancel(){
    if(!CL.busy) return;
    if(PRO.stage){ proCancel(); return; } /* v-video-enhance-pro: إلغاء الرفع الاحترافيّ لا يُنهي أداة التحسين المحمَّلة */
    CL.run++;
    [CL.ff,CL.ffLoading].forEach(function(f){ try{ if(f) f.terminate(); }catch(e){ /* guard-ok — العامل انتهى */ } });
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
  function proWallets(){ ['refreshPointsWallet','refreshPremiumPoints'].forEach(function(n){ try{ if(typeof window[n]==='function') window[n](); }catch(e){ /* guard-ok — الرصيد يتحدّث عند أوّل قراءة تالية */ } }); }
  function proSeenId(){ try{ return localStorage.getItem(PRO_SEEN)||''; }catch(e){ return ''; } }
  /* عُرضت نتيجتها (أو انتهت): لا تُستأنف ثانية — في التخزين للزيارة التالية، وفي الذاكرة إن تعذّر التخزين */
  function proForget(jid){ if(PRO.parked===jid) PRO.parked=''; if(PRO.info&&PRO.info.job===jid) PRO.info.job=null; }
  function proSeen(jid){
    proForget(jid);
    try{ localStorage.setItem(PRO_SEEN,jid); }catch(e){ /* guard-ok — بلا تخزين تُعرض النتيجة مرّة أخرى في زيارة تالية */ }
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
    if(!proTok()){ try{ if(typeof window.requireLogin==='function') window.requireLogin('guestLimit'); }catch(e){ /* guard-ok — بلا شاشة دخول لا شيء يُرفع */ } return; }
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
      try{ __swallow(err,'video:pro'); }catch(e){ /* guard-ok — لا مسجّل */ }
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
      try{ if(typeof window.mediaReadyNotify==='function') window.mediaReadyNotify('video',true); }catch(e){ /* guard-ok — الإشعار تحسين */ }
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
    try{ if(PRO.xhr) PRO.xhr.abort(); }catch(e){ /* guard-ok — الرفع انتهى */ }
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
    syncWrite(); syncChars(); syncSamples(); simplify(); syncClean(); syncDirector();
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
    if(open&&!wasOpen){ tab='trend'; }
    wasOpen=open;
    if(open) enhance();
  }).observe(M,{attributes:true,attributeFilter:['style']});
  G.forEach(function(d){ var s=id(d[0]); if(s) s.addEventListener('change',sync); });
})();
