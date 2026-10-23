/* v-three-colors (المالك ١٦ أكتوبر بلقطتي المقاولات والقبلة: «الأسطر كلّها خلّها لون واحد في التطبيق… أريد توحيد الألوان مستوي كأنه
   قوس قزح… فقط ٣ ألوان»؛ وعلى أسئلتي: «الحدود كلّها ذهبي»، «عند التضليل عليها: الحدّ يصير رماديّ أفتح»، الأزرار الذهبيّة الكبيرة باقية):
   في الوضع الأسود وحده (لا الفاتح ولا الثيمات html.skin) ثلاثة ألوان: أسود للخلفيّات، ذهبيّ للحدود، رماديّ فاتح للحدّ عند المرور أو الاختيار.
   الألوان مكتوبة داخل كلّ أداة سطرًا سطرًا (inline)، فلا تكفي قاعدة CSS واحدة: هذا يمرّ على العناصر حين تظهر ويصنّفها بأصنافٍ تلوّنها
   css/أدوات-أسود.css — حدّ ظاهر موحَّد الجوانب (لا الدوّارات والمثلّثات) → om3-line، وداخل نوافذ الأدوات تعبئة صندوق رماديّة أو بمسحة
   ذهبيّة خفيفة أو تدرّج منها → om3-fill (أسود). الأزرار الذهبيّة المصمتة والصور والألوان المشبعة (عيّنات الألوان) لا تُمسّ. */
(function(){
  'use strict';
  var TOOLS = '#portraitStyleSheet,#inspireScreen,#videoMakerModal,#designAiModal,#fashionAiModal,#studioAiModal,#stocksModal,#omranTvShell,#omranQiblaShell,#expModal,#eduHubModal,#omranEduModal,#constructionModal,#religionModal,#cvModal,#docModal,#fbOverlay,#emailAssistModal,#pickerSheet';
  var SKIP = { IMG:1, VIDEO:1, CANVAS:1, IFRAME:1, svg:1, SVG:1, path:1, SCRIPT:1, STYLE:1, OPTION:1, BR:1, SOURCE:1 };
  function rgba(s){ var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; }
  /* تعبئة «صندوق»: رماديّ/أبيض شفيف، أو داكن محايد، أو مسحة ذهبيّة/بنّيّة خفيفة — لا لون مشبع ولا ذهبيّ مصمت */
  function boxFill(c){
    if(!c || c[3] === 0) return false;
    if(c[3] < 0.2) return true; /* مسحة خافتة بأيّ لون فوق الأسود (نيليّة .08 في زرّ «ارفع محاضرة») — المالك: «أسود داخل» */
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    if(mx - mn <= 16 && (c[3] < 0.36 || mx < 64)) return true;
    var goldish = c[0] > c[1] && c[1] > c[2] && c[0] - c[2] > 60;
    return goldish && (c[3] < 0.36 || mx < 70);
  }
  function gradBox(bi){
    if(!/gradient\(/.test(bi) || /url\(/.test(bi)) return false;
    var stops = bi.match(/rgba?\([^)]+\)/g) || [];
    if(!stops.length) return false;
    for(var i = 0; i < stops.length; i++){ var c = rgba(stops[i]); if(c && c[3] > 0 && !boxFill(c)) return false; }
    return true;
  }
  /* v-photo-only (المالك ١٧ أكتوبر: «اي صوره تحتها احذفها نهائي»): طبقة مطلقة فوق صورة أخيها (img/video أو خلفيّة url لأبيها) —
     تظليل اسم أو شارة على الصورة لا صندوق؛ تسويدها كان يجعل التدرّج شريطًا أسود صلبًا على أسفل كلّ صورة (أزياء، ديكور، ترندات،
     ستايل، «عرض الكل»)، ومناطق بوستر الديكور مربّعات سوداء بعد المرور عليها. */
  function overImage(el, cs){
    var p = cs.position === 'absolute' && el.parentElement;
    if(!p) return false;
    for(var k = p.firstElementChild; k; k = k.nextElementSibling){ if(k !== el && (k.tagName === 'IMG' || k.tagName === 'VIDEO')) return true; }
    return /url\(/.test(getComputedStyle(p).backgroundImage);
  }
  function lineOf(cs){
    if(cs.animationName && cs.animationName !== 'none') return false;
    var sides = ['Top', 'Right', 'Bottom', 'Left'], col = null, any = false;
    for(var i = 0; i < 4; i++){
      var w = parseFloat(cs['border' + sides[i] + 'Width']) || 0;
      if(!w || cs['border' + sides[i] + 'Style'] === 'none') continue;
      var c = cs['border' + sides[i] + 'Color'];
      if(col !== null && c !== col) return false; /* جوانب مختلفة = دوّار أو مثلّث أو تبويب */
      col = c; any = true;
    }
    var rc = any && rgba(col);
    return !!(rc && rc[3] > 0.04);
  }
  /* v-black-surfaces (تدقيق ١٨–١٩ أكتوبر): خانة الكتابة التي اعتمدت على حدّها وحده — شفّافة أو بلون سطحها — صارت بعد v-no-lines-2
     أسود على أسود (حقلا الدخول، كلمة المرور والإيميل في الإعدادات، خانات المحفظة والمقاولات والتعليم). om3-field يعطيها درجة المالك
     المقابلة لسطحها (css/بلا-خطوط.css)، في الأدوات ودرج الإعدادات وشاشة الدخول ونافذة الدفع. الداكن المحايد يُعدّ حقلًا أيضًا: هو ما
     نرسمه نحن (#101013 / #000)، فيُقرأ هكذا حين يعاد التصنيف في منتصف انتقال ولا يومض (كالحدّ الشبح). */
  var FIELDS = '#settingsDialog,#authOverlay,#checkoutModalOverlay';
  var NOFIELD = { checkbox:1, radio:1, range:1, file:1, color:1, hidden:1, button:1, submit:1, reset:1, image:1 };
  function surfaceOf(el){
    for(var p = el.parentElement; p && p.nodeType === 1; p = p.parentElement){
      var ps = getComputedStyle(p), pc = rgba(ps.backgroundColor);
      if(ps.backgroundImage !== 'none' || (pc && pc[3] > 0)) return ps;
    }
    return null;
  }
  function fieldOf(el, bg){
    if(el.tagName === 'INPUT' && NOFIELD[String(el.type || '').toLowerCase()]) return false;
    var c = rgba(bg);
    if(!c || c[3] === 0) return true;
    var mx = Math.max(c[0], c[1], c[2]);
    if(mx <= 24 && mx - Math.min(c[0], c[1], c[2]) <= 8) return true;
    var s = surfaceOf(el);
    return !!s && s.backgroundImage === 'none' && s.backgroundColor === bg;
  }
  /* v-om3-still (المالك ٢١ أكتوبر: «صفحة الفيديوات فيها وميض»): التصنيف يزيل الأصناف ثمّ يقرأ الأسلوب ثمّ يعيدها، والقراءة تُثبّت
     الحالة بلا أصناف — فعنصر له انتقال (تبويبات صانع الفيديو: حدّ .15s) يبدأ انتقالًا إلى حدّه الأصليّ ثمّ يعود، وtransitionend يعيد
     تصنيفه فيبدأ انتقالًا جديدًا: حلقة لا تنتهي (قيس في الإنتاج: ٢٤٤ transitionend و٢٤٤ تبديل صنف في ٥ ث، والحدّ يومض بين الشفّاف
     والظاهر). om3-still (transition:none) طوال القياس، ثمّ تثبيت الأسلوب النهائيّ قبل إزالته — فلا انتقال يبدأ ولا حلقة. */
  function mark(el, inTool){
    if(!el || el.nodeType !== 1 || SKIP[el.tagName] || el.closest('.om3-skip')) return;
    var cs = getComputedStyle(el), still = /[1-9]/.test(cs.transitionDuration || '');
    if(still) el.classList.add('om3-still');
    el.classList.remove('om3-line', 'om3-fill', 'om3-hot', 'om3-field');
    var bg0 = cs.backgroundColor; /* قبل om3-fill: التصنيف يقرأ لون الخانة نفسها (cs حيّ: يُقرأ بعد الإزالة) */
    try{ classify(el, inTool, cs, bg0); }
    finally{ if(still){ void cs.borderTopColor; el.classList.remove('om3-still'); } } /* الأسلوب النهائيّ يُثبَّت والانتقال معطَّل */
  }
  function classify(el, inTool, cs, bg0){
    if(lineOf(cs)){ el.classList.add('om3-line'); if(cs.cursor === 'pointer' || /^(BUTTON|A|INPUT|TEXTAREA|SELECT|LABEL)$/.test(el.tagName)) el.classList.add('om3-hot'); }
    if(inTool && !overImage(el, cs)){
      var bi = cs.backgroundImage;
      if((bi === 'none' && boxFill(rgba(cs.backgroundColor))) || (bi !== 'none' && gradBox(bi))) el.classList.add('om3-fill');
    }
    if(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && (inTool || el.closest(FIELDS)) && fieldOf(el, bg0)) el.classList.add('om3-field');
  }
  /* طابور عناصر مسطّح يُعالَج على دفعات في وقت فراغ المتصفّح (لا مهمّة طويلة على أندرويد الضعيف): كلّ عقدة جديدة تُفرد بشجرتها */
  var items = [], seen = (typeof WeakSet === 'function') ? new WeakSet() : null, busy = false;
  function pump(deadline){
    var n = 0;
    while(items.length && (n < 150 || (deadline && deadline.timeRemaining && deadline.timeRemaining() > 3))){
      var el = items.shift(); n++;
      if(seen) seen.delete(el);
      if(el.isConnected) mark(el, !!el.closest(TOOLS));
    }
    busy = false;
    if(items.length) schedule();
  }
  function schedule(){ if(busy) return; busy = true; (window.requestIdleCallback || function(f){ return setTimeout(f, 60); })(pump, { timeout: 500 }); }
  function push(el){ if(seen){ if(seen.has(el)) return; seen.add(el); } items.push(el); }
  function add(node, shallow){
    if(!node || node.nodeType !== 1) return;
    push(node);
    if(!shallow){ var all = node.getElementsByTagName('*'); for(var i = 0; i < all.length; i++) push(all[i]); }
    schedule();
  }
  function start(){
    /* v-om3-still: قاعدة القياس هنا لا في أدوات-أسود.css (ذاك للوضع الأسود وألوانه وحدها) — في head فلا يراها المراقب */
    try{ var st = document.createElement('style'); st.id = 'om3StillCss'; st.textContent = '.om3-still{transition:none !important}'; document.head.appendChild(st); }catch(e){ __swallow(e, "three-colors:still-css"); }
    add(document.body);
    try{
      new MutationObserver(function(list){
        for(var i = 0; i < list.length; i++){
          var r = list[i];
          if(r.type === 'childList'){ for(var j = 0; j < r.addedNodes.length; j++) add(r.addedNodes[j]); }
          else add(r.target, true); /* style تغيّر (تبويب، حالة) */
        }
      }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
      /* لقطة المالك ١٧ أكتوبر (مربّعات سوداء بحدّ ذهبيّ فوق ملصق الديكور): زرّ شفّاف يتلوّن عند المرور بانتقال .15s — تغيّر style
         يُقرأ في منتصف الانتقال (خلفيّة .05 وحدّ ذهبيّ باهت) فيُصنَّف تعبئةً وحدًّا ويعلق أسود بعد مغادرة الفأرة. نعيد التصنيف
         عند انتهاء كلّ انتقال فتُقرأ الحالة الساكنة. */
      document.addEventListener('transitionend', function(e){ if(e.target && e.target.nodeType === 1) add(e.target, true); }, true);
    }catch(e){ __swallow(e, "three-colors:observe"); }
  }
  window.__om3Mark = function(root){ add(root || document.body); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
