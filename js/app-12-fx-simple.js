/* ───────── v-fx-simple: تبسيط استوديو الأزياء ─────────
 * شكوى المالك: «في الأزياء كثر الاختيارات… الي يدخل يضيع فيه» — ~٧٠ خيارًا في ٩ أقسام قبل زرّ «صمم»،
 * وسؤالان عن الشيء نفسه (المناسبة ٨ + «النمط/المناسبة» ٣٦، بينهما زفاف وكاجوال بالنصّ نفسه)،
 * و«محرّك الصور: Gemini/ChatGPT» ظاهر لكلّ المستخدمين (يخالف قاعدة «لا اسم مزوّد»).
 *
 * الطبقة ١: يبقى ظاهرًا ثلاث خطوات — الصورة/الوصف، الفئة، المناسبة — ثمّ «صمم» و«اقترح لي إطلالة».
 * الطبقة ٢: الموسم والألوان والإضافات والنمط التفصيليّ والزوايا تُطوى تحت «🎨 خصّصها ▾».
 * كيف يعرف المستخدم ما في المطويّ (سؤال المالك):
 *   (١) الشريط نفسه يعرض محتواه وقيمه الحاليّة + دوائر الإضافات (ضغطة تفتح على العنصر نفسه)؛
 *   (٢) أوّل زيارة مفتوح، وبعدها مطويّ ما لم يفتحه المستخدم بيده (يُتذكّر آخر فعل له)؛
 *   (٣) بعد النتيجة «جرّب: 👜 حقيبة · ❄️ شتويّة · 🕶️ الزوايا · 🎨 لون آخر» — ضغطة تعيد التصميم بالتعديل.
 *
 * لا حذف ولا بناء: العقد تُنقل كما هي فيبقى كلّ مستمع قائم. design-gen.js يمسح عقده (.f417) ويعيد بناءها
 * بعد مرساته عند كلّ تغيير لغة — فالتخطيط هنا متساوي الأثر (idempotent) ويُعاد بعد كلّ إعادة بناء.
 * منتقي المحرّك: للمالك وحده، وغيره يبقى على الافتراضيّ (لا تغيّر كلفة). النصوص بالـ14 لغة هنا. */
(function(){
  'use strict';
  var TX = {
    custom: { ar:'🎨 خصّصها', en:'🎨 Customize', fr:'🎨 Personnaliser', es:'🎨 Personalizar', tr:'🎨 Özelleştir', ru:'🎨 Настроить', hi:'🎨 अपने हिसाब से बदलें', ur:'🎨 اپنی مرضی کا بنائیں', bn:'🎨 নিজের মতো সাজান', ne:'🎨 आफ्नो अनुसार मिलाउनुहोस्', fil:'🎨 I-customize', id:'🎨 Sesuaikan', zh:'🎨 自定义', ml:'🎨 ഇഷ്ടാനുസരണം മാറ്റൂ' },
    hide: { ar:'إخفاء', en:'Hide', fr:'Masquer', es:'Ocultar', tr:'Gizle', ru:'Скрыть', hi:'छिपाएँ', ur:'چھپائیں', bn:'লুকান', ne:'लुकाउनुहोस्', fil:'Itago', id:'Sembunyikan', zh:'收起', ml:'മറയ്ക്കുക' },
    styleLbl: { ar:'👗 النمط بالتفصيل', en:'👗 Detailed style', fr:'👗 Style détaillé', es:'👗 Estilo detallado', tr:'👗 Ayrıntılı stil', ru:'👗 Стиль подробно', hi:'👗 विस्तृत स्टाइल', ur:'👗 تفصیلی اسٹائل', bn:'👗 বিস্তারিত স্টাইল', ne:'👗 विस्तृत शैली', fil:'👗 Detalyadong istilo', id:'👗 Gaya terperinci', zh:'👗 详细风格', ml:'👗 വിശദമായ സ്റ്റൈൽ' },
    tryLbl: { ar:'جرّب:', en:'Try:', fr:'Essayez :', es:'Prueba:', tr:'Dene:', ru:'Попробуйте:', hi:'आज़माएँ:', ur:'آزمائیں:', bn:'চেষ্টা করুন:', ne:'प्रयास गर्नुहोस्:', fil:'Subukan:', id:'Coba:', zh:'试试：', ml:'ശ്രമിക്കൂ:' },
    bag: { ar:'👜 أضف حقيبة', en:'👜 Add a bag', fr:'👜 Ajouter un sac', es:'👜 Añadir bolso', tr:'👜 Çanta ekle', ru:'👜 Добавить сумку', hi:'👜 बैग जोड़ें', ur:'👜 بیگ شامل کریں', bn:'👜 ব্যাগ যোগ করুন', ne:'👜 झोला थप्नुहोस्', fil:'👜 Magdagdag ng bag', id:'👜 Tambah tas', zh:'👜 加个包', ml:'👜 ബാഗ് ചേർക്കൂ' },
    winter: { ar:'❄️ نسخة شتويّة', en:'❄️ Winter version', fr:'❄️ Version hiver', es:'❄️ Versión invierno', tr:'❄️ Kış versiyonu', ru:'❄️ Зимняя версия', hi:'❄️ सर्दियों वाला', ur:'❄️ سردیوں والا', bn:'❄️ শীতের সংস্করণ', ne:'❄️ जाडोको संस्करण', fil:'❄️ Pang-taglamig', id:'❄️ Versi musim dingin', zh:'❄️ 冬季版', ml:'❄️ ശൈത്യകാല പതിപ്പ്' },
    summer: { ar:'☀️ نسخة صيفيّة', en:'☀️ Summer version', fr:'☀️ Version été', es:'☀️ Versión verano', tr:'☀️ Yaz versiyonu', ru:'☀️ Летняя версия', hi:'☀️ गर्मियों वाला', ur:'☀️ گرمیوں والا', bn:'☀️ গ্রীষ্মের সংস্করণ', ne:'☀️ गर्मीको संस्करण', fil:'☀️ Pang-tag-init', id:'☀️ Versi musim panas', zh:'☀️ 夏季版', ml:'☀️ വേനൽക്കാല പതിപ്പ്' },
    angles: { ar:'🕶️ من كلّ الزوايا', en:'🕶️ All angles', fr:'🕶️ Tous les angles', es:'🕶️ Todos los ángulos', tr:'🕶️ Tüm açılar', ru:'🕶️ Со всех сторон', hi:'🕶️ सभी कोणों से', ur:'🕶️ ہر زاویے سے', bn:'🕶️ সব দিক থেকে', ne:'🕶️ सबै कोणबाट', fil:'🕶️ Lahat ng anggulo', id:'🕶️ Semua sudut', zh:'🕶️ 多角度', ml:'🕶️ എല്ലാ കോണുകളിലും' },
    color: { ar:'🎨 لون آخر', en:'🎨 Another colour', fr:'🎨 Autre couleur', es:'🎨 Otro color', tr:'🎨 Başka renk', ru:'🎨 Другой цвет', hi:'🎨 दूसरा रंग', ur:'🎨 دوسرا رنگ', bn:'🎨 অন্য রং', ne:'🎨 अर्को रङ', fil:'🎨 Ibang kulay', id:'🎨 Warna lain', zh:'🎨 换个颜色', ml:'🎨 മറ്റൊരു നിറം' },
  };
  var KEY = 'aiapp_fx_custom';               /* null=لم يزر · seen=رأى أوّل مرّة · 1/0 = آخر فعل يدويّ */
  var COLOR_CYCLE = ['Gold','Navy','Red','White','Black','Green','Beige'];

  var $ = function(id){ return document.getElementById(id); };
  function lg(){ try{ return (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar'; }catch(e){ return 'ar'; } }
  function T(o){ return (o && (o[lg()] || o.en || o.ar)) || ''; }
  function gt(k){ try{ if(typeof window.t === 'function'){ var v = window.t(k); if(v && v !== k) return v; } }catch(e){ /* guard-ok */ } return ''; }
  function optText(sel){
    if(!sel || sel.selectedIndex < 0) return '';
    var o = sel.options[sel.selectedIndex];
    try{ if(typeof window.__optT === 'function') return String(window.__optT(o) || '').trim(); }catch(e){ /* guard-ok */ }
    return String(o.textContent || '').trim();
  }
  function modal(){ return $('fashionAiModal'); }
  function q(sel){ var m = modal(); return m ? m.querySelector(sel) : null; }

  /* ── الكتل التي تُطوى، بمراسي ثابتة تُحسب في كلّ مرّة (design-gen يعيد بناء بعضها) ── */
  function customNodes(){
    var out = [];
    var push = function(n){ if(n && out.indexOf(n) < 0) out.push(n); };
    var sea = $('fashionAiSeason'); push(sea && sea.parentElement);
    var colors = q('.colorRow'); if(colors){ push(colors.previousElementSibling); push(colors); }
    var ext = q('.fxAccGrid');
    if(ext){ var hint = ext.previousElementSibling; var lbl = hint && hint.previousElementSibling; push(lbl); push(hint); push(ext); }
    var cards = $('fashionStyleCards'); push(cards && cards.parentElement);
    var ma = $('fashionAiMultiAngle'); push(ma && ma.closest('label'));
    var eng = $('fashionAiEngine'); push(eng && eng.parentElement);
    return out;
  }

  /* منتقي المحرّك: اسم المزوّد لا يُرى إلّا للمالك، وغيره على الافتراضيّ (الأدقّ للوجه) بلا تغيّر كلفة */
  function syncEngine(){
    var eng = $('fashionAiEngine'); if(!eng || !eng.parentElement) return;
    var owner = window.__omranPlan === 'owner';
    eng.parentElement.style.display = owner ? '' : 'none';
    if(!owner && eng.value) eng.value = '';
  }

  /* عنوان النمط داخل المطويّ: «النمط/المناسبة» كان يكرّر كلمة المناسبة الظاهرة فوقه */
  function relabelStyle(){
    var cards = $('fashionStyleCards'); var host = cards && cards.parentElement;
    var lab = host && host.querySelector('label'); if(!lab) return;
    lab.removeAttribute('data-i18n'); /* لا يعيده مُطبِّق اللغة إلى «النمط/المناسبة» */
    lab.textContent = T(TX.styleLbl);
  }

  function isOpen(){ var c = $('fxCustom'); return !!c && c.style.display !== 'none'; }
  function setOpen(open, byUser){
    var c = $('fxCustom'), b = $('fxCustomBtn'); if(!c || !b) return;
    c.style.display = open ? 'block' : 'none';
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if(byUser){ try{ localStorage.setItem(KEY, open ? '1' : '0'); }catch(e){ /* guard-ok */ } }
    refresh();
  }
  /* أوّل زيارة مفتوح، وبعدها مطويّ ما لم يكن آخر فعل يدويّ «فتح» */
  var firstApplied = false;
  function applyFirstVisit(){
    if(firstApplied || !$('fxCustom')) return;
    firstApplied = true;
    var v = null; try{ v = localStorage.getItem(KEY); }catch(e){ v = 'seen'; }
    if(v === null){ setOpen(true, false); try{ localStorage.setItem(KEY, 'seen'); }catch(e){ /* guard-ok */ } }
    else setOpen(v === '1', false);
  }

  /* ── الشريط: العنوان + ما في الداخل بقيمه الحاليّة + دوائر الإضافات ── */
  function peekText(){
    var parts = [];
    var s = optText($('fashionAiSeason')); if(s) parts.push(s);
    var sep = /^(ar|ur)/.test(lg()) ? '، ' : ', ';
    var cols = Array.prototype.map.call(document.querySelectorAll('#fashionAiModal .colorRow .cw.sel .cn'), function(n){ return (n.textContent || '').trim(); }).filter(Boolean);
    parts.push('🎨 ' + (cols.length ? (cols.slice(0, 2).join(sep) + (cols.length > 2 ? ' +' + (cols.length - 2) : '')) : (gt('fxColorsLbl') || '…')));
    var ex = Array.prototype.map.call(document.querySelectorAll('#fashionAiModal .fxAccCard.sel .oi'), function(n){ return (n.textContent || '').trim(); }).filter(Boolean);
    parts.push('💎 ' + (ex.length ? ex.join('') : (gt('fxAccLbl') || '…')));
    var st = optText($('fashionAiStyle')); if(st) parts.push(st);
    return parts.join(' · ');
  }
  function renderThumbs(){
    var box = $('fxCustomThumbs'); if(!box) return;
    var cards = document.querySelectorAll('#fashionAiModal .fxAccCard[data-ext]');
    if(box.childElementCount !== cards.length){
      box.innerHTML = '';
      Array.prototype.forEach.call(cards, function(card){
        var key = card.getAttribute('data-ext');
        var oi = card.querySelector('.oi');
        var b = document.createElement('button'); b.type = 'button';
        b.setAttribute('data-fx-thumb', key);
        b.textContent = oi ? (oi.textContent || '').trim() : '•';
        var ct = card.querySelector('.ct'); if(ct) b.title = (ct.textContent || '').trim();
        b.style.cssText = 'width:34px;height:34px;border-radius:50%;border:1px solid rgba(212,175,55,.45);background:rgba(255,255,255,.04);font-size:16px;line-height:1;padding:0;cursor:pointer;flex:none;';
        b.onclick = function(e){ e.stopPropagation(); openAt(key); };
        box.appendChild(b);
      });
    }
    Array.prototype.forEach.call(box.children, function(b){
      var card = q('.fxAccCard[data-ext="' + b.getAttribute('data-fx-thumb') + '"]');
      var on = !!(card && card.classList.contains('sel'));
      b.style.background = on ? 'rgba(212,175,55,.85)' : 'rgba(255,255,255,.04)';
      b.style.borderColor = on ? '#d4af37' : 'rgba(212,175,55,.45)';
    });
  }
  /* دائرة إضافة: تفتح المطويّ وتنزل إلى بطاقتها وتومضها — تعرّف ولا تختار نيابةً عنه */
  function openAt(key){
    setOpen(true, true);
    var card = q('.fxAccCard[data-ext="' + key + '"]'); if(!card) return;
    try{ card.scrollIntoView({ behavior:'smooth', block:'center' }); }catch(e){ /* guard-ok */ }
    var old = card.style.outline;
    card.style.outline = '2px solid #d4af37'; card.style.outlineOffset = '2px';
    setTimeout(function(){ card.style.outline = old || ''; }, 1400);
  }
  function refresh(){
    var t = $('fxCustomTitle'); if(t) t.textContent = T(TX.custom);
    var a = $('fxCustomArrow'); if(a) a.textContent = isOpen() ? ('▴ ' + T(TX.hide)) : '▾';
    var p = $('fxCustomPeek'); if(p) p.textContent = peekText();
    renderThumbs();
    renderTry();
  }

  /* ── بعد النتيجة: «جرّب» — ضغطة تعدّل وتعيد التصميم من الصورة نفسها ── */
  function resultShown(){ var w = $('fashionAiResultWrap'); return !!w && w.style.display === 'block'; }
  function busy(){ var g = $('fashionAiGenerateBtn'); return !g || g.disabled; }
  function regenerate(){ var g = $('fashionAiGenerateBtn'); if(g && !g.disabled) g.click(); }
  function chip(label, fn){
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn';
    b.textContent = label;
    b.style.cssText = 'width:auto;padding:7px 11px;font-size:12.5px;border-radius:999px;white-space:nowrap;';
    b.onclick = function(){ if(busy()) return; fn(); refresh(); regenerate(); };
    return b;
  }
  function renderTry(){
    var box = $('fxTry'); if(!box) return;
    if(!resultShown()){ box.style.display = 'none'; return; }
    box.innerHTML = '';
    var lab = document.createElement('span'); lab.textContent = T(TX.tryLbl);
    lab.style.cssText = 'font-size:12.5px;color:var(--muted,#999);align-self:center;';
    box.appendChild(lab);
    var bag = q('.fxAccCard[data-ext="Handbag"]');
    if(bag && !bag.classList.contains('sel')) box.appendChild(chip(T(TX.bag), function(){ bag.click(); }));
    var sea = $('fashionAiSeason');
    if(sea){
      var to = sea.value === 'winter' ? 'summer' : 'winter';
      box.appendChild(chip(T(TX[to]), function(){ sea.value = to; try{ sea.dispatchEvent(new Event('change', { bubbles:true })); }catch(e){ /* guard-ok */ } }));
    }
    var ma = $('fashionAiMultiAngle');
    if(ma && !ma.checked) box.appendChild(chip(T(TX.angles), function(){ ma.checked = true; }));
    box.appendChild(chip(T(TX.color), nextColor));
    var dis = busy();
    Array.prototype.forEach.call(box.querySelectorAll('button'), function(b){ b.disabled = dis; });
    box.style.display = 'flex';
  }
  /* «لون آخر»: لون واحد مختلف بالتدوير — يُطفأ المختار ويُشعل التالي (يظهر في الشريط) */
  function nextColor(){
    var sel = Array.prototype.filter.call(document.querySelectorAll('#fashionAiModal .colorRow .cw.sel'), function(){ return true; });
    var cur = sel.length ? sel[sel.length - 1].getAttribute('data-col') : '';
    var i = COLOR_CYCLE.indexOf(cur);
    var next = COLOR_CYCLE[(i + 1) % COLOR_CYCLE.length];
    sel.forEach(function(d){ d.click(); });
    var el = q('.colorRow .cw[data-col="' + next + '"]');
    if(el && !el.classList.contains('sel')) el.click();
  }

  /* ── التخطيط: متساوي الأثر، يُعاد بعد كلّ إعادة بناء من design-gen ── */
  function layout(){
    var m = modal(), gen = $('fashionAiGenerateBtn');
    if(!m || !gen || !gen.parentElement) return;
    var bar = $('fxCustomBar'), custom = $('fxCustom');
    if(!bar){
      bar = document.createElement('div'); bar.id = 'fxCustomBar';
      bar.style.cssText = 'margin-top:12px;border:1px solid rgba(212,175,55,.35);border-radius:14px;padding:10px 12px;background:rgba(212,175,55,.05);cursor:pointer;';
      bar.innerHTML = '<div style="display:flex;align-items:center;gap:8px;">' +
          '<button type="button" id="fxCustomBtn" aria-expanded="false" aria-controls="fxCustom" style="all:unset;flex:1;min-width:0;font-weight:800;font-size:13.5px;cursor:pointer;"><span id="fxCustomTitle"></span></button>' +
          '<span id="fxCustomArrow" style="font-size:12px;color:#d4af37;font-weight:700;white-space:nowrap;"></span>' +
        '</div>' +
        '<div id="fxCustomPeek" style="font-size:11.5px;color:var(--muted,#999);margin-top:4px;line-height:1.6;"></div>' +
        '<div id="fxCustomThumbs" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"></div>';
      bar.onclick = function(){ setOpen(!isOpen(), true); };
      custom = document.createElement('div'); custom.id = 'fxCustom'; custom.style.display = 'none';
      custom.style.cssText += 'border-inline-start:2px solid rgba(212,175,55,.25);padding-inline-start:10px;margin-top:6px;';
    }
    /* الشريط والمطويّ قبل «صمم» مباشرة: مطويًّا يصير الزرّ بعد المناسبة بسطر واحد */
    if(bar.nextElementSibling !== custom || custom.nextElementSibling !== gen){
      gen.insertAdjacentElement('beforebegin', bar);
      bar.insertAdjacentElement('afterend', custom);
    }
    customNodes().forEach(function(n){ custom.appendChild(n); });
    /* «اقترح لي إطلالة» جنب «صمم»: أسرع طريق لمن لا يدري ماذا يريد */
    var sug = $('fashionAiSuggestBtn'), sugList = $('fashionAiSuggestions');
    if(sug && gen.nextElementSibling !== sug){ gen.insertAdjacentElement('afterend', sug); }
    if(sug && sugList && sug.nextElementSibling !== sugList){ sug.insertAdjacentElement('afterend', sugList); }
    /* «جرّب» بعد النتيجة */
    var rw = $('fashionAiResultWrap');
    if(rw && !$('fxTry')){
      var tr = document.createElement('div'); tr.id = 'fxTry';
      tr.style.cssText = 'display:none;flex-wrap:wrap;gap:6px;margin-top:10px;';
      rw.insertAdjacentElement('afterend', tr);
      try{ new MutationObserver(renderTry).observe(rw, { attributes:true, attributeFilter:['style'] }); }catch(e){ /* guard-ok */ }
      try{ new MutationObserver(renderTry).observe(gen, { attributes:true, attributeFilter:['disabled'] }); }catch(e){ /* guard-ok */ }
    }
    relabelStyle();
    syncEngine();
    refresh();
  }

  var bound = false;
  function boot(){
    layout();
    if(bound || !modal()) return;
    bound = true;
    var m = modal();
    /* أيّ نقرة أو تغيير داخل النافذة قد يغيّر لونًا أو إضافة (design-gen لا يطلق أحداثًا) */
    m.addEventListener('click', function(){ requestAnimationFrame(refresh); });
    m.addEventListener('change', function(){ requestAnimationFrame(refresh); });
    var open = $('btnFashionAI');
    if(open) open.addEventListener('click', function(){ setTimeout(function(){ layout(); applyFirstVisit(); }, 0); });
    /* design-gen يعيد بناء عقده عند تغيير اللغة — نعيد التخطيط بعده */
    try{ new MutationObserver(function(){ setTimeout(layout, 0); }).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){ /* guard-ok */ }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 700);
  setTimeout(layout, 1800);
  window.__fxSimple = { layout: layout, applyFirstVisit: applyFirstVisit, setOpen: setOpen, KEY: KEY }; /* للاختبار والفحص */
})();
