(function(){
  var SELS=['designAiPlace','designAiStyle','designAiLighting','designAiFurniture','designAiFlooring','designAiFabric','designAiWallColor','designAiCurtains'];
  var CBS=['designAiRearrange','designAiDecorPlants','designAiDecorArt','designAiDecorAccessories'];
  var ICONS={
    designAiLighting:{'':'\u2298',warm:'\u{1F305}',cool:'\u2744\uFE0F',bright:'\u2600\uFE0F',dim:'\u{1F319}',natural:'\u{1F324}\uFE0F',neutral:'\u26AA',golden:'\u2728',purple:'\u{1F49C}',sunset:'\u{1F307}',moon:'\u{1F315}'},
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
      /* v657: النصّ بلغة المستخدم — لا إجبار على data-en. */
      var txt=(typeof window.__optT==='function'?window.__optT(o):((o.textContent||'')+'').trim()), m=txt.match(EMO);
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
    dz.className='dzArea omUpArt omUpDecor om3-skip'; /* v-upload-art: صورة المالك خلفيّةً والنصّ فوقها مترجمًا (العربيّة بصورتها المكتوبة) */
    dz.innerHTML='<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><b class="omUpT" data-i18n="designDropTitle">ارفع صورة غرفتك</b><small class="omUpH" data-i18n="designDropHint">تأكّد من وضوح الصورة وجودتها</small><div class="dzT"><b class="omUpB" data-i18n="uploadPlateBtn"></b><br><span class="dzN omUpN"></span></div>';
    dz.querySelector('.dzT b').textContent=(fb.textContent||'').trim();
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
      garden:['#2e5f2e','#6ea54a','#d7e8b0'],
      /* v-decor-outdoor (طلب المالك ١٥ أكتوبر ٢٠٢٦): لوحات ألوان الديكور الخارجي */
      facade:['#3a3530','#8a795f','#e8dcc8'], pool:['#1f6e8a','#4ab5d7','#e0f4fa'],
      pergola:['#5a3f28','#9a744a','#e8d9c0'], bbq:['#3d2418','#8a4a23','#f0a52f'],
      rooftop:['#222730','#4a5a70','#d4af37'], pathway:['#3a4a35','#7a8a70','#d8d2c4']
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
  window.__decorPal=roomBg;
  /* v-decor-rooms: غرفة مرسومة فعلًا داخل كل بطاقة — جدار ونافذة وكنبة وسجادة
     ولوحة ونبتة وإضاءة بألوان النمط، والأقواس للعربي والثريا للفخم والنيون
     للسايبربانك. تصاميم لا ألوان، والصور المولّدة تركب فوقها لاحقًا. */
  function shade(hex,f){
    var n=parseInt(hex.slice(1),16), r=Math.min(255,Math.round(((n>>16)&255)*f)), g=Math.min(255,Math.round(((n>>8)&255)*f)), b=Math.min(255,Math.round((n&255)*f));
    return '#'+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
  }
  var ROOM_KIND={
    arabic:'arch', moroccan:'arch', andalusi:'arch', islamic:'arch', turkish:'arch',
    persian:'arch', najdi:'arch', emirati:'arch', indian:'arch', majlis:'arch',
    gothic:'gothic', darkacademia:'gothic',
    industrial:'grid', loft:'grid',
    cyberpunk:'neon', gamer:'neon', futuristic:'neon', smart:'neon',
    luxury:'lux', baroque:'lux', hollywood:'lux', artdeco:'lux', victorian:'lux', classic:'lux', neoclassic:'lux'
  };
  function roomSvg(c,kind){
    var wallA=c[1], wallB=shade(c[1],.72), floor=shade(c[0],.55), floor2=shade(c[0],.42);
    var sofa=c[0], sofaBack=shade(c[0],.8), cush=c[2], rug=c[2], art=c[2], curt=shade(c[2],.85);
    var win;
    if(kind==='arch') win='<path d="M36 212 v-82 a42 52 0 0 1 84 0 v82 z" fill="#f5e6c8" stroke="'+shade(c[0],.5)+'" stroke-width="6"/><path d="M78 212 v-118 M52 160 h52" stroke="'+shade(c[0],.5)+'" stroke-width="4" fill="none"/>';
    else if(kind==='gothic') win='<path d="M36 212 v-88 q42 -58 84 0 v88 z" fill="#efe2c4" stroke="'+shade(c[0],.5)+'" stroke-width="6"/><path d="M78 212 v-128" stroke="'+shade(c[0],.5)+'" stroke-width="4"/>';
    else if(kind==='grid') win='<rect x="34" y="104" width="90" height="108" fill="#e8e4d6" stroke="'+shade(c[0],.45)+'" stroke-width="6"/><path d="M64 104 v108 M94 104 v108 M34 140 h90 M34 176 h90" stroke="'+shade(c[0],.45)+'" stroke-width="4"/>';
    else win='<rect x="36" y="106" width="86" height="106" rx="4" fill="#f5e8cc" stroke="'+shade(c[0],.5)+'" stroke-width="6"/><path d="M79 106 v106 M36 159 h86" stroke="'+shade(c[0],.5)+'" stroke-width="4"/>';
    var light;
    if(kind==='neon'){
      light='<rect x="150" y="66" width="118" height="7" rx="3.5" fill="'+c[2]+'"/><rect x="150" y="60" width="118" height="19" rx="9" fill="'+c[2]+'" opacity=".28"/><rect x="30" y="230" width="240" height="4" fill="'+c[2]+'" opacity=".5"/>';
    } else if(kind==='lux'){
      light='<path d="M150 0 v34" stroke="#d4af37" stroke-width="3"/><path d="M118 52 q32 -26 64 0" fill="none" stroke="#d4af37" stroke-width="4"/><circle cx="118" cy="56" r="7" fill="#f3d98b"/><circle cx="150" cy="44" r="7" fill="#f3d98b"/><circle cx="182" cy="56" r="7" fill="#f3d98b"/><circle cx="150" cy="66" r="30" fill="#f3d98b" opacity=".16"/>';
    } else {
      light='<path d="M150 0 v40" stroke="'+shade(c[0],.5)+'" stroke-width="3"/><path d="M132 40 h36 l-6 16 h-24 z" fill="#d4af37"/><circle cx="150" cy="72" r="26" fill="#f3d98b" opacity=".2"/>';
    }
    var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">'+
      '<defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+wallA+'"/><stop offset="1" stop-color="'+wallB+'"/></linearGradient>'+
      '<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+floor+'"/><stop offset="1" stop-color="'+floor2+'"/></linearGradient></defs>'+
      '<rect width="300" height="286" fill="url(#w)"/>'+
      '<rect y="278" width="300" height="8" fill="'+shade(c[1],.55)+'"/>'+
      '<rect y="286" width="300" height="114" fill="url(#f)"/>'+
      light+ win+
      '<rect x="28" y="120" width="9" height="96" rx="4" fill="'+curt+'"/><rect x="122" y="120" width="9" height="96" rx="4" fill="'+curt+'"/>'+
      '<rect x="188" y="108" width="76" height="92" fill="'+shade(art,.92)+'" stroke="#d4af37" stroke-width="5"/>'+
      '<path d="M196 184 l22 -34 14 18 12 -22 20 38 z" fill="'+shade(c[0],.7)+'"/><circle cx="212" cy="130" r="8" fill="#d4af37" opacity=".85"/>'+
      '<ellipse cx="150" cy="352" rx="104" ry="26" fill="'+rug+'" opacity=".85"/><ellipse cx="150" cy="352" rx="76" ry="17" fill="none" stroke="'+shade(rug,.7)+'" stroke-width="3"/>'+
      '<rect x="84" y="238" width="132" height="46" rx="14" fill="'+sofaBack+'"/>'+
      '<rect x="72" y="272" width="156" height="44" rx="14" fill="'+sofa+'"/>'+
      '<rect x="94" y="252" width="42" height="34" rx="9" fill="'+cush+'"/><rect x="164" y="252" width="42" height="34" rx="9" fill="'+shade(cush,.8)+'"/>'+
      '<rect x="84" y="314" width="10" height="14" fill="'+shade(c[0],.4)+'"/><rect x="206" y="314" width="10" height="14" fill="'+shade(c[0],.4)+'"/>'+
      '<path d="M262 262 q-14 -34 6 -52 q4 26 10 34 q2 -30 16 -38 q6 30 -2 50 z" fill="#57895a"/>'+
      '<path d="M252 262 h44 l-7 40 h-30 z" fill="'+shade(c[2],.75)+'"/>'+
      '</svg>';
    return 'url("data:image/svg+xml,'+encodeURIComponent(svg)+'") center/cover no-repeat';
  }
  /* v-lighting-3d: صور منفصلة حادّة؛ لا قصّ من لوحة مجمّعة ولا أشرطة تخفي الغرفة.
     v-decor-18 (المالك ١٦ أكتوبر بلقطة الأقسام: «بدون تغيير» رسمة كرتونيّة، والأقمشة والحوائط والستائر بلا صور):
     الأقسام الستّة كلّها صورة حقيقيّة لكلّ خيار، و«بدون تغيير» علامة ⊘ واحدة كالإضاءة. */
  var NONE_BG='url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="none" stroke="#7d7d86" stroke-width="3"/><path d="M15 49L49 15" stroke="#7d7d86" stroke-width="3"/></svg>')+'") center /48px 48px no-repeat, #141418';
  var OPT_FILE={designAiFurniture:'furniture',designAiFlooring:'flooring',designAiFabric:'fabric',designAiWallColor:'wallcolor',designAiCurtains:'curtains'};
  var OPT6=['designAiLighting','designAiFurniture','designAiFlooring','designAiFabric','designAiWallColor','designAiCurtains'];
  /* غلاف البطاقة حين لا اختيار: صورة خيار يمثّل القسم — كلّ بطاقة فيها صورة كالترندات. */
  var COVER={designAiLighting:'natural',designAiFurniture:'modern',designAiFlooring:'herringbone',designAiFabric:'cream',designAiWallColor:'sage',designAiCurtains:'sheer'};
  function roomBg(id,v){
    if(OPT6.indexOf(id)!==-1) return v ? '#141418' : NONE_BG;
    var c=(PALS[id]||{})[v]; if(!c) return '';
    return roomSvg(c, ROOM_KIND[v]||'');
  }
  /* v-decor-subs: وصف عربي قصير تحت كل اسم — تعرفين الكلاسيكي من العصري من
     أول نظرة، نفس فكرة أنماط الصور بالضبط. */
  var SUBS={
    designAiStyle:{
      modern:'خطوط نظيفة وألوان محايدة', simple:'هدوء وبساطة بلا زحمة',
      bohemian:'ألوان دافئة ونسيج وخوص', luxury:'فخامة سوداء بلمسات ذهبية',
      arabic:'مجلس عربي أصيل بنقوش تراثية', classic:'أثاث خشبي فخم وتفاصيل كلاسيكية',
      najdi:'جبس منحوت وألوان الصحراء', islamic:'زخارف هندسية بروح معاصرة',
      andalusi:'أقواس وزليج أندلسي', emirati:'رمل وكريم بلمسة إماراتية',
      scandinavian:'أبيض وخشب فاتح ودفء شمالي', japandi:'ياباني وسكندنافي — دفء وبساطة',
      industrial:'طوب وحديد وأسقف مكشوفة', midcentury:'خردل وأزرق بطابع الستينات',
      artdeco:'هندسة ذهبية وفخامة العشرينات', neoclassic:'أعمدة وتيجان بروح حديثة',
      victorian:'فخامة إنجليزية عتيقة', baroque:'ذهب وزخارف ملكية',
      gothic:'دراما داكنة وأقواس عالية', rustic:'خشب طبيعي وريف دافئ',
      farmhouse:'بياض المزرعة وخشبها', coastal:'أزرق البحر ورمال الشاطئ',
      mediterranean:'شمس المتوسط وألوانه', moroccan:'زليج وفوانيس مغربية',
      turkish:'عثماني فاخر بنقوش تركية', persian:'سجاد فارسي وألوان ملكية',
      indian:'ألوان هندية غنية وتطريز', japanese:'تاتامي وخشب وسكينة يابانية',
      zen:'هدوء تام وتوازن', wabisabi:'جمال البساطة غير المكتملة',
      tropical:'نخيل وخضرة استوائية', desert:'رمال ودفء صحراوي',
      loft:'مساحات مفتوحة بروح المدينة', futuristic:'انحناءات وإضاءة المستقبل',
      cyberpunk:'نيون بنفسجي وأجواء ليلية', gamer:'إضاءة RGB وأجواء اللعب',
      darkacademia:'مكتبات وخشب داكن وكتب', chalet:'دفء جبلي وخشب ومدفأة',
      provence:'لافندر وريف فرنسي', hollywood:'بريق ومخمل هوليوودي',
      monochrome:'أبيض وأسود صارم', earthy:'طين وتراب وفخار',
      pastel:'ألوان حالمة ناعمة', smart:'تقنية مدمجة وإضاءة ذكية',
      eco:'مواد طبيعية ونباتات', retro70s:'برتقالي السبعينات وموجاتها',
      popart:'ألوان صاخبة وفن البوب', minimalwhite:'أبيض متحفي نقي'
    },
    designAiPlace:{
      '':'صمّم على صورتك المرفوعة', restaurant:'قاعة طعام وطاولات أنيقة',
      cafe:'ركن قهوة دافئ', bedroom:'راحة وهدوء النوم', majlis:'ضيافة عربية أصيلة',
      living:'قلب البيت وجلسته', kitchen:'عملية وأنيقة', office:'تركيز وإنتاجية',
      shop:'واجهة تجارية جذابة', bath:'رخام ونقاء', kids:'مرح آمن وألوان',
      entrance:'أول انطباع لضيوفك', garden:'جلسة خارجية خضراء',
      facade:'واجهة خارجية فخمة وإضاءة معمارية', pool:'مسبح عصري وجلسة استرخاء',
      pergola:'مظلة خشبية وجلسة حديقة مريحة', bbq:'ركن شواء وجلسة نار مسائية',
      rooftop:'تراس سطح بإطلالة وإضاءة ساحرة', pathway:'ممر حجري وتشجير مدخل البيت'
    },
    designAiLighting:{ warm:'أصفر دافئ مريح', cool:'أبيض بارد منعش', bright:'نهاري ساطع', dim:'خافتة هادئة للمساء',
      natural:'ضوء نهار طبيعي من النافذة', neutral:'أبيض محايد متوازن', golden:'وهج ذهبي دافئ',
      purple:'أجواء ليلية بنفسجية', sunset:'دفء الغروب الوردي', moon:'ضوء قمر أزرق هادئ',
      emerald:'أخضر فاخر ومريح', turquoise:'انتعاش بأجواء بحرية', rose:'وردي بودري لطيف',
      burgundy:'أحمر عميق وأجواء مسائية', neon:'سماوي وفوشي بإضاءة متقابلة',
      cinematic:'أزرق بارد وكهرماني دافئ', aurora:'أخضر زمردي وبنفسجي هادئ' },
    designAiFurniture:{ modern:'قطع عصرية أنيقة', classic:'خشب فخم تقليدي', simple:'عملي بلا تكلّف', luxury:'فخامة في كل قطعة', bohemian:'قطع حرة متنوعة' },
    designAiFlooring:{ parquet:'خشب دافئ تحت قدميك', marble:'رخام لامع فاخر', ceramic:'عملي سهل التنظيف', carpet:'سجاد وثير مريح' },
    designAiFabric:{ light:'أقمشة فاتحة مشرقة', dark:'أقمشة داكنة فخمة', neutral:'درجات هادئة محايدة', bold:'ألوان جريئة لافتة' },
    designAiWallColor:{ white:'نقاء يوسّع المكان', beige:'دفء هادئ', gray:'حياد عصري', bold:'جدار مميز جريء' },
    designAiCurtains:{ simple:'ستائر خفيفة أنيقة', luxury:'ستائر فخمة ثقيلة', remove:'نوافذ مكشوفة مضيئة' }
  };
  function palSub(id,v){
    /* v-psub-ar-only: الوصف عربي للعربي فقط — بقية اللغات كانت تأخذ العربي. */
    if(((document.documentElement.lang||'ar')+'').indexOf('ar')!==0) return '';
    return (SUBS[id]||{})[v]||'';
  }
  /* v-decor-toggles: النباتات واللوحات والإكسسوارات وإعادة الترتيب بطاقات
     احترافية بلوحات ألوانها — نفس فكرة الأنماط والستايل، والصح ✓ ذهبي. */
  var CBPAL={
    designAiRearrange:['#3a3f47','#6e737d','#a5abb5'],
    designAiDecorPlants:['#2e5f2e','#6ea54a','#d7e8b0'],
    designAiDecorArt:['#4a2f5f','#8a5f9e','#d4af37'],
    designAiDecorAccessories:['#1a1a1f','#d4af37','#8a6d2f']
  };
  /* v-decor-photos (طلب المالك ١٤ أكتوبر ٢٠٢٦ «شو فقط فيه صور… ليش الحينه غير موجوده»):
     الصور الحقيقيّة من لوحته (#1024) وجه البطاقة. رسمة SVG (#1021) أُزيلت من الوجه. */
  var CBIMG={
    designAiRearrange:'assets/design/decor/rearrange.webp',
    designAiDecorPlants:'assets/design/decor/plants.webp',
    designAiDecorArt:'assets/design/decor/art.webp',
    designAiDecorAccessories:'assets/design/decor/accessories.webp'
  };
  function cbName(cb,sp){
    var key=sp?sp.getAttribute('data-i18n'):'';
    var tx=(key&&typeof window.t==='function')?window.t(key):'';
    if(!tx||tx===key) tx=sp?(sp.textContent||''):cb.id;
    return (tx+'').trim().replace(EMO,'');
  }
  function proToggle(cb){
    var lab=cb.parentElement, sp=lab?lab.querySelector('span'):null;
    var txt=cbName(cb,sp);
    var c=CBPAL[cb.id]||['#2a2a30','#3d3d45','#55555f'];
    var img=CBIMG[cb.id];
    var d=document.createElement('div');
    d.setAttribute('data-dtoggle',cb.id);
    /* v-decor-names-only (طلب المالك ١٣ أكتوبر ٢٠٢٦): الاسم وحده بلا وصف.
       v-decor-toggle-img (طلبه: «الصورة واضحة وضوح الشمس»): الصورة صافية بلا تظليل ولا نصّ فوقها، والاسم المترجم سطر تحتها.
       v-decor-photos (١٤ أكتوبر): وجه البطاقة الصورة الحقيقيّة لا الرسمة. */
    d.style.cssText='position:relative;border-radius:12px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;';
    var pic=document.createElement('div');
    pic.setAttribute('data-dimg','1');
    pic.style.cssText='position:relative;width:100%;aspect-ratio:8/3;min-height:48px;'+
      'background:'+(img?'url("'+img+'") center/cover no-repeat,':'')+
      'linear-gradient(155deg,'+c[0]+' 0%,'+c[1]+' 55%,'+c[2]+' 120%);';
    var nm=document.createElement('div');
    nm.textContent=txt;
    /* v-photo-only (المالك ١٧ أكتوبر: «اي صوره تحتها احذفها نهائي» — أحدث من «الاسم سطر تحتها» في v-decor-toggle-img):
       البطاقة صورتها وحدها، والاسم المترجم فوق أسفلها بتدرّج كبقيّة معارض التطبيق. */
    nm.style.cssText='position:absolute;inset:auto 0 0 0;pointer-events:none;padding:16px 9px 6px;font-size:12.5px;font-weight:800;color:#fff;line-height:1.3;text-shadow:0 1px 3px rgba(0,0,0,.9);background:linear-gradient(0deg,rgba(0,0,0,.8),rgba(0,0,0,0));';
    var tk=document.createElement('div'); tk.textContent='✓';
    tk.style.cssText='position:absolute;top:7px;inset-inline-start:8px;width:22px;height:22px;border-radius:50%;background:#d4af37;color:#141414;font-weight:800;font-size:14px;display:none;align-items:center;justify-content:center;';
    function paint(){
      d.style.outline=cb.checked?'2px solid #d4af37':'1px solid rgba(127,127,127,.25)';
      d.style.outlineOffset='-2px';
      d.style.boxShadow=cb.checked?'0 0 12px rgba(212,175,55,.35)':'none';
      tk.style.display=cb.checked?'flex':'none';
      nm.style.color=cb.checked?'#d4af37':'#fff';
    }
    paint();
    pic.appendChild(tk); pic.appendChild(nm); d.appendChild(pic);
    d.onclick=function(){ cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true})); paint(); };
    return d;
  }
  /* v-decor-full-page: كل قوائم الديكور الثماني بطاقة مصغّرة «عرض الكل ›» تفتح
     معرضًا ملء الشاشة — نفس نظام أنماط الصور (طلب المالك: كلهم مرة وحدة). */
  function selImg(id,v){
    if(!v) return '';
    if(id==='designAiLighting') return 'assets/design/opts/lighting-'+v+'.webp';
    /* v-decor-18: الأقسام الخمسة الأخرى صورة لكلّ خيار من assets/design/decor-opts (الغرفة نفسها والمتغيّر الخيار وحده).
       كان الأثاث يستعير صور الأنماط (v-decor-furn-photos) والأرضيات صور قريبة عموديّة — صارت كلّها بمقاس الإضاءة. */
    if(OPT_FILE[id]) return 'assets/design/decor-opts/'+OPT_FILE[id]+'-'+v+'.webp?v=3';
    if(id==='designAiStyle') return 'assets/design/styles/'+v+'.webp?v=3'; /* قواعد الصور ١٧ أكتوبر: أُعيد توليدها بدقّتها الأصليّة (لا تكبير) */
    return 'assets/design/opts/'+id.replace('designAi','').toLowerCase()+'-'+v+'.webp?v=3';
  }
  function optTxt(o){ return (typeof window.__optT==='function')?window.__optT(o):(((o&&o.textContent)||'')+'').trim(); } /* v657 */
  function curOpt(s){ var os=s.options; for(var i=0;i<os.length;i++) if(os[i].value===s.value) return os[i]; return os[0]; }
  function secTitle(s){ var lab=s.parentElement.querySelector('label'); return ((lab?lab.textContent:'')+'').trim().replace(EMO,''); }
  /* إعدادات المعرض لقائمة واحدة — يشترك فيها صفّ «عرض الكل ›» وبطاقات الأقسام. */
  function openCfg(s,after){
    var ien=(document.documentElement.lang||'ar')==='en';
    var six=OPT6.indexOf(s.id)!==-1;
    return {
      title: secTitle(s),
      /* v-decor-18: الأقسام الستّة صور أفقيّة 16:9 والاسم فوق الصورة كبطاقات الترندات، عمودان على الجوّال. */
      landscape: six, overlay: six,
      count: s.options.length+' '+(typeof window.t==='function'&&window.t('pickerOptsPick')!=='pickerOptsPick'?window.t('pickerOptsPick'):(ien?'options — pick yours':'خيارًا — اختر ما يناسبك')),
      items: Array.prototype.map.call(s.options,function(o){
        return { v:o.value, title:optTxt(o)||(ien?'None':'بدون'), active:o.value===s.value,
          img:selImg(s.id,o.value), bg:roomBg(s.id,o.value), sub:palSub(s.id,o.value) };
      }),
      /* اختيار البطاقة يحفظ القيمة فقط — التوليد لا يبدأ إلّا بزرّ «صمم الغرفة». */
      onPick: function(v){ s.value=v; s.dispatchEvent(new Event('change',{bubbles:true})); if(after) after(); }
    };
  }
  function selTrigger(s){
    var ien=(document.documentElement.lang||'ar')==='en';
    var tr=window.omranPicker.trigger(function(){
      var o=curOpt(s);
      return o && { name:optTxt(o), img:selImg(s.id,o.value), bg:roomBg(s.id,o.value),
        sub:palSub(s.id,o.value)||s.options.length+' '+(typeof window.t==='function'&&window.t('pickerOptsWord')!=='pickerOptsWord'?window.t('pickerOptsWord'):(ien?'options':'خيارًا')) };
    }, function(){ return openCfg(s,function(){ tr.refresh(); }); });
    tr.el.classList.add('optGrid');
    /* v-decor-place-sync (تدقيق ١٨ أكتوبر؛ الدفعة ٤): البطاقة كانت تتحدّث من المعرض وحده — نقاط البوستر تكتب «نوع المكان» فتبقى «من صورتي».
       تُحفظ على القائمة (app-12 يحدّثها بلا change)، ومستمع change واحد يتبع البطاقة الأحدث بعد إعادة البناء عند تبديل اللغة. */
    s.__tr=tr;
    if(!s.getAttribute('data-trhook')){ s.setAttribute('data-trhook','1'); s.addEventListener('change',function(){ if(s.__tr) s.__tr.refresh(); }); }
    return tr.el;
  }
  /* v-decor-18 (المالك ١٦ أكتوبر: «رتّبهم على شكل الفيديوهات مش بالطول»): الأقسام الستّة شبكة بطاقات صور كترندات الفيديو —
     الصورة تملأ البطاقة واسم القسم والاختيار فوقها في أسفلها — بدل ستّة صفوف طويلة متراصّة. */
  function secCard(s){
    var c=document.createElement('div');
    c.setAttribute('role','button'); c.tabIndex=0; c.setAttribute('data-dsec',s.id);
    c.style.cssText='position:relative;aspect-ratio:3/4;border-radius:14px;overflow:hidden;cursor:pointer;background:#141418;';
    var im=document.createElement('img'); im.alt=''; im.decoding='async';
    im.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    im.onerror=function(){ im.style.visibility='hidden'; };
    var tk=document.createElement('div'); tk.textContent='\u2713';
    tk.style.cssText='position:absolute;top:6px;inset-inline-start:7px;width:22px;height:22px;border-radius:50%;background:#d4af37;color:#141414;font-weight:800;font-size:14px;display:none;align-items:center;justify-content:center;';
    var cap=document.createElement('div');
    cap.style.cssText='position:absolute;inset:auto 0 0 0;padding:22px 8px 8px;text-align:center;line-height:1.35;background:linear-gradient(0deg,rgba(0,0,0,.85),rgba(0,0,0,0));';
    var sec=document.createElement('div'); sec.style.cssText='font-size:11px;font-weight:700;color:#e9d58f;';
    var nm=document.createElement('div'); nm.style.cssText='font-size:12.5px;font-weight:800;color:#fff;';
    cap.appendChild(sec); cap.appendChild(nm);
    /* حلقة الاختيار طبقة فوق الصورة لا outline — فيبقى outline لإطار تركيز لوحة المفاتيح (:focus-visible) كبقيّة التطبيق. */
    var ring=document.createElement('div'); ring.style.cssText='position:absolute;inset:0;border-radius:inherit;pointer-events:none;';
    c.appendChild(im); c.appendChild(tk); c.appendChild(cap); c.appendChild(ring);
    function refresh(){
      var o=curOpt(s), v=o?o.value:'';
      var src=selImg(s.id, v||COVER[s.id]);
      if(window.__omranWhenSeen) window.__omranWhenSeen(im,function(){ im.src=src; }); else im.src=src;
      im.style.visibility='visible';
      im.style.filter=v?'none':'saturate(.55) brightness(.6)';
      sec.textContent=secTitle(s); nm.textContent=o?optTxt(o):'';
      ring.style.boxShadow=v?'inset 0 0 0 2px #d4af37':'inset 0 0 0 1px rgba(127,127,127,.25)';
      tk.style.display=v?'flex':'none';
    }
    function open(){ window.omranPicker.open(openCfg(s,refresh)); }
    c.onclick=open;
    c.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } };
    if(!s.getAttribute('data-sechook')){ s.setAttribute('data-sechook','1'); s.addEventListener('change',function(){ var cc=document.querySelector('[data-dsec="'+s.id+'"]'); if(cc&&cc.__refresh) cc.__refresh(); }); }
    c.__refresh=refresh; refresh();
    return c;
  }
  function secGrid(){
    var first=document.getElementById(OPT6[0]); if(!first||!first.parentElement||!window.omranPicker) return;
    var host=first.parentElement.parentElement;
    var old=host.querySelector('.decorSecGrid'); if(old) old.remove();
    var g=document.createElement('div'); g.className='decorSecGrid';
    /* عمودان على الجوّال وصفّ واحد على الحاسوب — بطاقة 3:4 كبطاقات الترندات (auto-fit يملأ الصفّ بلا خانة فارغة). */
    g.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:8px;';
    OPT6.forEach(function(id){
      var s=document.getElementById(id); if(!s||!s.parentElement) return;
      s.style.display='none'; s.parentElement.style.display='none';
      g.appendChild(secCard(s));
    });
    host.insertBefore(g, first.parentElement);
  }
  function build(){
    if(!document.getElementById('designAiModal')) return;
    dropZone('designAiModal','designAi');
    SELS.forEach(function(id){
      if(OPT6.indexOf(id)!==-1&&window.omranPicker) return; /* v-decor-18: الأقسام الستّة في شبكة البطاقات تحت */
      var s=document.getElementById(id); if(!s||!s.parentElement) return;
      var old=s.parentElement.querySelector('.optGrid'); if(old) old.remove();
      s.style.display='none';
      var g=(window.omranPicker&&window.omranPicker.trigger)?selTrigger(s):buildGrid(s); s.parentElement.appendChild(g);
      if(!s.getAttribute('data-gridhook')){ s.setAttribute('data-gridhook','1'); s.addEventListener('change',function(){ var gg=s.parentElement.querySelector('.optGrid'); if(gg) mark(gg,s); }); }
    });
    secGrid();
    var nt=document.getElementById('designAiNotes');
    /* v-notes-no-clobber: هذه الكتابة كانت تمحو ترجمة data-i18n (المليالم
       ترجع عربيًا) — المترجم العام أولًا، والثنائي احتياط فقط. */
    if(nt){ var ien=(document.documentElement.lang||'ar')==='en';
      var __gph=(typeof window.t==='function'&&window.t('dsNotesPh')!=='dsNotesPh')?window.t('dsNotesPh'):null;
      var __glb=(typeof window.t==='function'&&window.t('dsNotesLabel')!=='dsNotesLabel')?window.t('dsNotesLabel'):null;
      nt.placeholder=__gph||(ien?'e.g. Italian restaurant, 40 seats, high ceiling, industrial vibe':'\u0645\u062B\u0627\u0644: \u0645\u0637\u0639\u0645 \u0625\u064A\u0637\u0627\u0644\u064A \u0664\u0660 \u0643\u0631\u0633\u064A\u060C \u0633\u0642\u0641 \u0639\u0627\u0644\u064A\u060C \u0637\u0627\u0628\u0639 \u0635\u0646\u0627\u0639\u064A');
      var nl=document.getElementById('designAiNotesLbl'); if(nl) nl.textContent=__glb||(ien?'\u270D\uFE0F Describe it in your own words (optional)':'\u270D\uFE0F \u0627\u0643\u062A\u0628 \u062A\u0641\u0627\u0635\u064A\u0644\u0643 \u0628\u0643\u0644\u0645\u0627\u062A\u0643 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)');
    }
    var anchor=document.getElementById('designAiDecorPlants');
    if(anchor&&anchor.parentElement&&anchor.parentElement.parentElement){
      var wrap=anchor.parentElement.parentElement, host=wrap.parentElement;
      var oldc=host.querySelector('.chipGrid'); if(oldc) oldc.remove();
      var cg=document.createElement('div'); cg.className='chipGrid';
      /* v-decor-names-only: شبكة مرتّبة ببطاقات أقصر — ٢×٢ على الجوّال. */
      cg.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px;';
      CBS.forEach(function(id){ var cb=document.getElementById(id); if(!cb) return; if(cb.parentElement) cb.parentElement.style.display='none'; cg.appendChild(proToggle(cb)); });
      wrap.style.display='none'; host.appendChild(cg);
    }
  }
  function boot(){ try{ build(); }catch(e){ __swallow(e,'design-sels:boot'); }
    try{ new MutationObserver(function(){ try{ build(); }catch(e){ __swallow(e,'design-sels:lang'); } }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']}); }catch(e){ __swallow(e,'design-sels:observe'); }
  }
  window.__optUI={buildGrid:buildGrid,buildChip:buildChip,dropZone:dropZone,mark:mark};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
