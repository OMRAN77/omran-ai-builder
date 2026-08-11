/* v545: تسعة خيارات لخط رسائل المحادثة، بتحميل عند الطلب وحفظ محلي. */
(function(){
  'use strict';
  var KEY = 'omran_font';
  var loaded = Object.create(null);
  var fonts = [
    {id:'default', ar:'الافتراضي', en:'Default', family:"'Tajawal'", google:'', line:1.7},
    {id:'kufi', ar:'الكوفي', en:'Kufi', family:"'Reem Kufi'", google:'Reem+Kufi:wght@400..700', line:1.85},
    {id:'naskh', ar:'النسخ', en:'Naskh', family:"'Amiri'", google:'Amiri:ital,wght@0,400;0,700;1,400', line:1.95},
    {id:'naskh2', ar:'نسخ نوتو', en:'Noto Naskh', family:"'Noto Naskh Arabic'", google:'Noto+Naskh+Arabic:wght@400..700', line:1.9},
    {id:'thuluth', ar:'الثلث', en:'Thuluth', family:"'Aref Ruqaa'", google:'Aref+Ruqaa:wght@400;700', line:2.05, alt:true},
    {id:'farsi', ar:'الفارسي', en:'Nastaliq', family:"'Gulzar'", google:'Gulzar', line:2.45},
    {id:'diwani', ar:'الديواني', en:'Diwani', family:"'Katibeh'", google:'Katibeh', line:2.05, alt:true},
    {id:'ruqaa', ar:'الرقعة', en:'Ruqaa', family:"'Rakkas'", google:'Rakkas', line:1.95, alt:true},
    {id:'quran', ar:'المصحف', en:'Quranic', family:"'Scheherazade New'", google:'Scheherazade+New:wght@400;700', line:2.15}
  ];

  function report(e, ctx){
    try{ if(typeof window.__swallow === 'function') window.__swallow(e, ctx); else console.warn(ctx, e); }
    catch(_){ /* guard-ok: تعذّر التسجيل نفسه؛ لا نُسقط الواجهة. */ }
  }
  function byId(id){
    for(var i=0;i<fonts.length;i++) if(fonts[i].id === id) return fonts[i];
    return fonts[0];
  }
  function current(){
    try{ return byId(localStorage.getItem(KEY) || 'default').id; }
    catch(e){ report(e, 'fonts:read'); return 'default'; }
  }
  function isArabic(){ return (document.documentElement.lang || 'ar').toLowerCase() === 'ar'; }
  function load(font){
    if(!font.google || loaded[font.id]) return;
    loaded[font.id] = true;
    try{
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + font.google + '&display=swap';
      link.setAttribute('data-chat-font', font.id);
      link.onerror = function(){ loaded[font.id] = false; };
      document.head.appendChild(link);
    }catch(e){ loaded[font.id] = false; report(e, 'fonts:load'); }
  }
  function sync(){
    var ar = isArabic();
    var id = document.documentElement.getAttribute('data-omran-font') || current();
    document.querySelectorAll('#omranFontPicker .ofp-card').forEach(function(card){
      var font = byId(card.getAttribute('data-font-id'));
      var on = font.id === id;
      card.classList.toggle('is-active', on);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
      card.title = ar ? font.ar : font.en;
      var name = card.querySelector('.ofp-name');
      if(name) name.textContent = ar ? font.ar : font.en;
      var badge = card.querySelector('.ofp-badge');
      if(badge) badge.textContent = ar ? 'أقرب بديل' : 'closest match';
    });
  }
  function apply(id, save){
    var font = byId(id);
    load(font);
    var root = document.documentElement;
    root.style.setProperty('--omran-chat-font', font.family + ", 'Tajawal', 'Inter', Tahoma, Arial, sans-serif");
    root.style.setProperty('--omran-chat-line', String(font.line));
    root.setAttribute('data-omran-font', font.id);
    if(save){
      try{ localStorage.setItem(KEY, font.id); }
      catch(e){ report(e, 'fonts:save'); }
    }
    sync();
    try{ window.dispatchEvent(new CustomEvent('omran:fontchange', {detail:{id:font.id}})); }
    catch(e){ report(e, 'fonts:event'); }
    return font;
  }
  function render(){
    var mount = document.getElementById('omranFontPicker');
    if(!mount || mount.childElementCount) return;
    var reveal = null;
    try{
      if('IntersectionObserver' in window) reveal = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(!entry.isIntersecting) return;
          load(byId(entry.target.getAttribute('data-font-id')));
          reveal.unobserve(entry.target);
        });
      });
    }catch(e){ report(e, 'fonts:preview'); }
    fonts.forEach(function(font){
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'ofp-card';
      card.setAttribute('data-font-id', font.id);
      card.setAttribute('aria-pressed', 'false');
      var name = document.createElement('span');
      name.className = 'ofp-name';
      var preview = document.createElement('span');
      preview.className = 'ofp-preview';
      preview.textContent = 'عمران AI';
      preview.style.fontFamily = font.family + ", 'Tajawal', sans-serif";
      preview.style.lineHeight = String(font.line);
      card.appendChild(name);
      card.appendChild(preview);
      if(font.alt){
        var badge = document.createElement('span');
        badge.className = 'ofp-badge';
        card.appendChild(badge);
      }
      var warm = function(){ load(font); };
      card.addEventListener('pointerenter', warm, {once:true});
      card.addEventListener('focus', warm, {once:true});
      card.addEventListener('click', function(){ apply(font.id, true); });
      mount.appendChild(card);
      if(reveal) reveal.observe(card);
    });
    sync();
  }
  function init(){
    render();
    apply(current(), false);
    try{ new MutationObserver(sync).observe(document.documentElement, {attributes:true, attributeFilter:['lang']}); }
    catch(e){ report(e, 'fonts:language'); }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();

  window.Omran = window.Omran || {};
  window.Omran.fonts = {
    list:function(){ return fonts.slice(); },
    apply:function(id){ return apply(id, true); },
    current:current,
    reset:function(){ return apply('default', true); }
  };
})();
