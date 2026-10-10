/* ───────── v-clean-ui: واجهة رسميّة بلا إيموجي (أمر المالك: «كلّ شيء نظيف… شغل رسميّ») ─────────
 * تنظيف وقت العرض بدل تحرير آلاف النصوص في ١٤ قاموسًا: تُزال الإيموجي من كلّ نصوص الصفحة
 * عدا المستثنى أدناه (بطاقات الستايلات والتسميات والأزرار كلّها divs عاديّة فلا قائمة بيضاء تصلح).
 * ما لا يُمَسّ: رسائل المحادثة والكود (.msg/pre/code)، حقول الكتابة، الأعلام (مؤشّرات المناطق)،
 *   وأيّ عنصر وُسم data-keep-emoji. وعقدة نصّية كلّها إيموجي (أيقونة زرّ بلا كلمة) تبقى كما هي كي لا يفرغ الزرّ.
 * ZWJ لا يُحذف إلّا قبل رمز تصويريّ — فهو لازم لتشكيل الهنديّة والمالايالمية والعربيّة. */
(function(){
  'use strict';
  var EMO;
  try{ EMO = new RegExp('\\u200D(?=\\p{Extended_Pictographic})|(?![\\u00A9\\u00AE\\u2122\\u2605])\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\uFE0F|\\u20E3', 'gu'); }
  catch(e){ return; /* guard-ok — متصفّح قديم بلا خصائص يونيكود: تبقى الواجهة كما هي */ }
  var SKIP = '.msg,pre,code,textarea,[contenteditable],[data-keep-emoji],script,style';
  var HAS_WORD = /[\p{L}\p{N}]/u;
  function clean(s){ return String(s).replace(EMO, '').replace(/[ \t]{2,}/g, ' ').trim(); }
  window.__noEmoji = clean;
  function fixText(n){
    var v = n.nodeValue; if(!v) return;
    EMO.lastIndex = 0; if(!EMO.test(v)) return; EMO.lastIndex = 0;
    var p = n.parentElement; if(!p || p.closest(SKIP)) return;
    var c = clean(v);
    if(HAS_WORD.test(c) && c !== v) n.nodeValue = c;
  }
  function fixAttrs(el){
    ['placeholder', 'title', 'aria-label'].forEach(function(a){
      var v = el.getAttribute && el.getAttribute(a); if(!v) return;
      EMO.lastIndex = 0; if(!EMO.test(v)) return; EMO.lastIndex = 0;
      if(el.closest && el.closest(SKIP)) return;
      var c = clean(v); if(HAS_WORD.test(c) && c !== v) el.setAttribute(a, c);
    });
  }
  function walk(root){
    if(!root) return;
    if(root.nodeType === 3){ fixText(root); return; }
    if(root.nodeType !== 1 || (root.closest && root.closest(SKIP))) return;
    fixAttrs(root);
    var t = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null), n;
    while((n = t.nextNode())){ if(n.nodeType === 3) fixText(n); else fixAttrs(n); }
  }
  var queue = [], timer = 0;
  function flush(){ timer = 0; var q = queue; queue = []; q.forEach(walk); }
  function schedule(n){ queue.push(n); if(!timer) timer = setTimeout(flush, 40); }
  function start(){
    if(!document.body) return;
    walk(document.body);
    try{
      new MutationObserver(function(list){
        list.forEach(function(m){
          if(m.type === 'childList') m.addedNodes.forEach(schedule);
          else if(m.type === 'characterData') schedule(m.target);
          else if(m.type === 'attributes') schedule(m.target);
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
    }catch(e){ __swallow(e, 'clean-ui:observer'); }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
