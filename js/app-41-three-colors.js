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
  function mark(el, inTool){
    if(!el || el.nodeType !== 1 || SKIP[el.tagName] || el.closest('.om3-skip')) return;
    el.classList.remove('om3-line', 'om3-fill', 'om3-hot');
    var cs = getComputedStyle(el);
    if(lineOf(cs)){ el.classList.add('om3-line'); if(cs.cursor === 'pointer' || /^(BUTTON|A|INPUT|TEXTAREA|SELECT|LABEL)$/.test(el.tagName)) el.classList.add('om3-hot'); }
    if(inTool){
      var bi = cs.backgroundImage;
      if((bi === 'none' && boxFill(rgba(cs.backgroundColor))) || (bi !== 'none' && gradBox(bi))) el.classList.add('om3-fill');
    }
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
    add(document.body);
    try{
      new MutationObserver(function(list){
        for(var i = 0; i < list.length; i++){
          var r = list[i];
          if(r.type === 'childList'){ for(var j = 0; j < r.addedNodes.length; j++) add(r.addedNodes[j]); }
          else add(r.target, true); /* style تغيّر (تبويب، حالة) */
        }
      }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
    }catch(e){ __swallow(e, "three-colors:observe"); }
  }
  window.__om3Mark = function(root){ add(root || document.body); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
