/* ───────── v-cx-simple: الطبقتان ٢ و٣ من تبسيط المقاولات ─────────
 * الطبقة ٢: ستّ بطاقات بدء (فيلا · استراحة · ملحق · عمارة · محل · مسجد) — ضغطة واحدة تملأ
 *   النوع والأدوار والمساحة والطراز والملاحق الشائعة، فلا يدور المستخدم في ١٢ نوعًا و١٠ طرز.
 * الطبقة ٣: كلّ الأقسام الثلاثة تُطوى تحت «⚙️ تفاصيل أكثر ▾»، ويبقى ظاهرًا ما يغيّره الناس
 *   فعلًا: عدد الأدوار والمساحة (تُنقل عقدتهما كما هي، بلا نسخ ولا حالة ثانية).
 *
 * لا يُحذف حقل ولا يُلمس منطق التوليد: العقد تُنقل لا تُبنى، والقيَم تُوضع بـchange، وزرّ
 * «ولّد» هو نفسه. أسماء البطاقات تُقرأ من خيارات `#constructionType` فتأتي بالـ14 لغة مجّانًا.
 * ما لم يُغيَّر عمدًا: افتراضات المخرجات (تغييرها يزيد كلفة كلّ توليد = باب المالك)، والميزانيّة. */
(function(){
  'use strict';
  var TX = {
    start: { ar:'🏗️ ابدأ من هنا — اختر نوع مشروعك', en:'🏗️ Start here — pick your project type', fr:'🏗️ Commencez ici — choisissez le type', es:'🏗️ Empieza aquí — elige el tipo', tr:'🏗️ Buradan başla — proje türünü seç', ru:'🏗️ Начните здесь — выберите тип проекта', hi:'🏗️ यहाँ से शुरू करें — प्रोजेक्ट का प्रकार चुनें', ur:'🏗️ یہاں سے شروع کریں — منصوبے کی قسم چنیں', bn:'🏗️ এখান থেকে শুরু করুন — প্রকল্পের ধরন বাছুন', ne:'🏗️ यहाँबाट सुरु गर्नुहोस् — परियोजनाको प्रकार छान्नुहोस्', fil:'🏗️ Magsimula dito — piliin ang uri ng proyekto', id:'🏗️ Mulai di sini — pilih jenis proyek', zh:'🏗️ 从这里开始 — 选择项目类型', ml:'🏗️ ഇവിടെ തുടങ്ങൂ — പദ്ധതിയുടെ തരം തിരഞ്ഞെടുക്കൂ' },
    more: { ar:'⚙️ تفاصيل أكثر', en:'⚙️ More details', fr:'⚙️ Plus de détails', es:'⚙️ Más detalles', tr:'⚙️ Daha fazla ayrıntı', ru:'⚙️ Больше деталей', hi:'⚙️ और विवरण', ur:'⚙️ مزید تفصیلات', bn:'⚙️ আরও বিবরণ', ne:'⚙️ थप विवरण', fil:'⚙️ Higit pang detalye', id:'⚙️ Detail lainnya', zh:'⚙️ 更多细节', ml:'⚙️ കൂടുതൽ വിശദാംശങ്ങൾ' },
    less: { ar:'إخفاء التفاصيل', en:'Hide details', fr:'Masquer les détails', es:'Ocultar detalles', tr:'Ayrıntıları gizle', ru:'Скрыть детали', hi:'विवरण छिपाएँ', ur:'تفصیلات چھپائیں', bn:'বিবরণ লুকান', ne:'विवरण लुकाउनुहोस्', fil:'Itago ang detalye', id:'Sembunyikan detail', zh:'隐藏细节', ml:'വിശദാംശങ്ങൾ മറയ്ക്കുക' },
    ready: { ar:'✅ جاهز: {s} — اضغط «ولّد التصميم»، أو افتح التفاصيل لتعديلها', en:'✅ Ready: {s} — press “Generate”, or open details to adjust', fr:'✅ Prêt : {s} — appuyez sur « Générer », ou ouvrez les détails', es:'✅ Listo: {s} — pulsa «Generar», o abre los detalles', tr:'✅ Hazır: {s} — “Oluştur”a bas veya ayrıntıları aç', ru:'✅ Готово: {s} — нажмите «Создать» или откройте детали', hi:'✅ तैयार: {s} — «बनाएं» दबाएँ, या विवरण खोलें', ur:'✅ تیار: {s} — «بنائیں» دبائیں، یا تفصیلات کھولیں', bn:'✅ প্রস্তুত: {s} — «তৈরি করুন» চাপুন, বা বিবরণ খুলুন', ne:'✅ तयार: {s} — «बनाउनुहोस्» थिच्नुहोस्, वा विवरण खोल्नुहोस्', fil:'✅ Handa: {s} — pindutin ang “Gumawa”, o buksan ang detalye', id:'✅ Siap: {s} — tekan “Buat”, atau buka detail', zh:'✅ 已就绪：{s} — 点击“生成”，或展开细节调整', ml:'✅ തയ്യാർ: {s} — “ഉണ്ടാക്കൂ” അമർത്തൂ, അല്ലെങ്കിൽ വിശദാംശങ്ങൾ തുറക്കൂ' },
  };
  /* القيَم الشائعة لكلّ نوع — تُملأ بضغطة، ويعدّلها من يريد من التفاصيل. */
  var PRESETS = [
    { type:'villa',     floors:2, area:400, style:'modern',  annexes:['majlis','carport','garden'] },
    { type:'rest',      floors:1, area:250, style:'gulf',    annexes:['majlis','pool','garden'] },
    { type:'annexhome', floors:1, area:80,  style:'modern',  annexes:[] },
    { type:'apartment', floors:4, area:800, style:'modern',  annexes:['elevator','carport'] },
    { type:'shop',      floors:1, area:120, style:'modern',  annexes:['carport'] },
    { type:'mosque',    floors:1, area:300, style:'islamic', annexes:['carport'] },
  ];
  var EMIRATE_KEY = 'aiapp_cx_emirate';

  var $ = function(id){ return document.getElementById(id); };
  function lg(){ try{ return (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar'; }catch(e){ return 'ar'; } }
  function T(o){ return (o && (o[lg()] || o.en || o.ar)) || ''; }

  function fire(el){ try{ el.dispatchEvent(new Event('change', { bubbles:true })); }catch(e){ /* guard-ok — القيمة وُضعت */ } }
  function setVal(id, v){ var el = $(id); if(!el || v === null || v === undefined || v === '') return; el.value = String(v); fire(el); }
  function setSelect(id, v){
    var el = $(id); if(!el || !v) return;
    if(!Array.prototype.some.call(el.options, function(o){ return o.value === v; })) return;
    el.value = v; fire(el);
  }
  /* اسم الخيار كما يراه المستخدم — مصدر أسماء البطاقات وملخّصها، فتأتي بالـ14 لغة بلا جدول جديد */
  function optText(selId, value){
    var el = $(selId); if(!el) return '';
    for(var i = 0; i < el.options.length; i++) if(el.options[i].value === value) return (el.options[i].text || '').trim();
    return '';
  }
  /* البطاقة بداية جديدة: ملاحقها هي المطلوبة، وما بقي من اختيار سابق يُطفأ */
  function applyAnnexes(list){
    var want = list || [];
    document.querySelectorAll('.constructionAnnex').forEach(function(box){
      var on = want.indexOf(box.value) !== -1;
      if(box.checked !== on){ box.checked = on; fire(box); }
    });
  }

  function apply(p, st){
    setSelect('constructionType', p.type);
    setSelect('constructionStyle', p.style);
    setVal('constructionFloors', p.floors);
    setVal('constructionArea', p.area);
    applyAnnexes(p.annexes);
    var bits = [optText('constructionType', p.type), optText('constructionStyle', p.style), p.floors + '×', p.area + ' m²'];
    if(p.annexes.length) bits.push('+' + p.annexes.length);
    st.textContent = T(TX.ready).replace('{s}', bits.filter(Boolean).join(' · '));
    st.style.display = 'block';
  }

  function card(p, st, all){
    var b = document.createElement('button'); b.type = 'button';
    b.setAttribute('data-cx-preset', p.type);
    b.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 6px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.14));background:rgba(255,255,255,.03);color:inherit;font-family:inherit;font-size:11.5px;font-weight:700;line-height:1.35;cursor:pointer;text-align:center;';
    var txt = optText('constructionType', p.type) || p.type;
    var m = txt.match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u);
    var em = document.createElement('span'); em.textContent = m ? m[1] : '🏗️'; em.style.cssText = 'font-size:22px;';
    var nm = document.createElement('span'); nm.textContent = m ? m[2] : txt;
    b.appendChild(em); b.appendChild(nm);
    b.onclick = function(){
      all.forEach(function(x){ x.style.borderColor = 'var(--border,rgba(255,255,255,.14))'; x.style.background = 'rgba(255,255,255,.03)'; });
      b.style.borderColor = 'var(--omGold,#d4af37)'; b.style.background = 'rgba(212,175,55,.14)';
      apply(p, st);
    };
    return b;
  }

  function render(){
    var t = $('cxStartTitle'); if(t) t.textContent = T(TX.start);
    var m = $('cxMoreBtn');
    if(m) m.textContent = ($('cxMore') && $('cxMore').style.display !== 'none') ? ('▴ ' + T(TX.less)) : (T(TX.more) + ' ▾');
  }

  function boot(){
    var modal = $('constructionModal'); if(!modal || $('cxStart')) return;
    var brief = $('cxBrief'); if(!brief) return; /* الطبقة ١ تُركّب أوّلًا (app-15-cx-brief.js) */
    var secs = Array.prototype.filter.call(modal.querySelectorAll('.cx-sec'), function(s){ return s.id !== 'cxBrief' && s.id !== 'cxIdeas'; });
    if(secs.length < 3) return; /* بنية غير متوقّعة: لا نلمس شيئًا */

    var box = document.createElement('div'); box.id = 'cxStart'; box.className = 'cx-sec';
    box.innerHTML = '<h4 class="cx-h" id="cxStartTitle"></h4>' +
      '<div id="cxStartCards" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;"></div>' +
      '<div id="cxStartQuick" style="margin-top:12px;"></div>' +
      '<div id="cxStartStatus" style="display:none;font-size:12.5px;margin-top:9px;line-height:1.7;"></div>' +
      '<button type="button" class="btn" id="cxMoreBtn" style="width:100%;margin-top:10px;" aria-expanded="false" aria-controls="cxMore"></button>';
    brief.insertAdjacentElement('afterend', box);

    var st = $('cxStartStatus'), cards = $('cxStartCards');
    var made = [];
    PRESETS.forEach(function(p){ var c = card(p, st, made); made.push(c); cards.appendChild(c); });

    /* عدد الأدوار والمساحة يبقيان ظاهرين: تُنقل عقدتهما كما هي (لا نسخة، لا حالة ثانية) */
    var fl = $('constructionFloors');
    var row = fl && fl.parentElement && fl.parentElement.parentElement;
    if(row && row.contains($('constructionArea'))) $('cxStartQuick').appendChild(row);
    else $('cxStartQuick').remove();

    /* الأقسام الثلاثة تُطوى كما هي بلا حذف حقل واحد */
    var more = document.createElement('div'); more.id = 'cxMore'; more.style.display = 'none';
    box.insertAdjacentElement('afterend', more);
    secs.forEach(function(s){ more.appendChild(s); });

    $('cxMoreBtn').onclick = function(){
      var open = more.style.display === 'none';
      more.style.display = open ? 'block' : 'none';
      $('cxMoreBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
      render();
      if(open) try{ more.scrollIntoView({ behavior:'smooth', block:'nearest' }); }catch(e){ /* guard-ok */ }
    };

    /* الإمارة: آخر اختيار يُحفظ ويعود — بدل إعادة اختيارها من سبعٍ كلّ مرّة */
    var em = $('constructionEmirate');
    if(em){
      try{
        var saved = localStorage.getItem(EMIRATE_KEY);
        if(saved && Array.prototype.some.call(em.options, function(o){ return o.value === saved; })) { em.value = saved; }
      }catch(e){ /* guard-ok — بلا تخزين تبقى الافتراضيّة */ }
      em.addEventListener('change', function(){ try{ localStorage.setItem(EMIRATE_KEY, em.value); }catch(e){ /* guard-ok */ } });
    }

    render();
    try{ new MutationObserver(render).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){ /* guard-ok */ }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 950);
})();
