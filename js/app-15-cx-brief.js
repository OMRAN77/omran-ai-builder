/* ───────── v-cx-brief: «صف مشروعك بسطر واحد» في أعلى المقاولات ─────────
 * شكوى المالك: «في المقاولات كثر الاختيارات… الي يدخل يضيع فيه» — النموذج ٧٧ خيارًا في
 * أربعة أقسام قبل أن يضغط زرًّا واحدًا. هذه الطبقة الأولى: خانة واحدة + زرّ. الجملة تُقرأ
 * على الخادم (`construction-brief`) وتُعبّئ حقول النموذج نفسها، ثمّ يُضغط «ولّد» آليًّا.
 * النموذج الكامل باقٍ تحته كما هو للتدقيق — لا شيء حُذف ولا منطق توليد لُمس.
 * النصوص بالـ14 لغة في هذا الملفّ (نفس نمط app-15-cx-ideas.js). */
(function(){
  'use strict';
  var TX = {
    title: { ar:'⚡ صف مشروعك بسطر واحد — ونعبّي الباقي عنك', en:'⚡ Describe your project in one line — we fill the rest', fr:'⚡ Décrivez votre projet en une ligne — on remplit le reste', es:'⚡ Describe tu proyecto en una línea — llenamos el resto', tr:'⚡ Projenizi tek satırda anlatın — gerisini biz dolduralım', ru:'⚡ Опишите проект одной строкой — остальное заполним мы', hi:'⚡ अपना प्रोजेक्ट एक लाइन में बताएं — बाकी हम भर देंगे', ur:'⚡ اپنا منصوبہ ایک سطر میں بتائیں — باقی ہم بھر دیں گے', bn:'⚡ এক লাইনে আপনার প্রকল্প বলুন — বাকিটা আমরা পূরণ করব', ne:'⚡ आफ्नो परियोजना एक हरफमा भन्नुहोस् — बाँकी हामी भर्छौं', fil:'⚡ Ilarawan ang proyekto sa isang linya — kami na ang bahala sa iba', id:'⚡ Jelaskan proyek Anda dalam satu baris — sisanya kami isi', zh:'⚡ 一句话描述你的项目 — 其余我们来填', ml:'⚡ നിങ്ങളുടെ പദ്ധതി ഒരു വരിയിൽ പറയൂ — ബാക്കി ഞങ്ങൾ പൂരിപ്പിക്കാം' },
    ph: { ar:'مثال: فيلا دورين ٤٠٠ متر مودرن بمسبح ومجلس في دبي', en:'e.g. two-storey 400 m² modern villa with pool and majlis in Dubai', fr:'ex. villa moderne 400 m² à deux étages avec piscine à Dubaï', es:'ej. villa moderna de 400 m², dos plantas, con piscina en Dubái', tr:'örn. Dubai\'de havuzlu 400 m² iki katlı modern villa', ru:'напр. двухэтажная вилла 400 м² с бассейном в Дубае', hi:'जैसे दुबई में पूल के साथ 400 म² दो मंज़िला मॉडर्न विला', ur:'مثلاً دبئی میں پول کے ساتھ 400 م² دو منزلہ ماڈرن ولا', bn:'যেমন দুবাইয়ে পুলসহ ৪০০ বর্গমিটার দোতলা মডার্ন ভিলা', ne:'जस्तै दुबईमा पोखरीसहित ४०० म² दुई तले मोडर्न भिल्ला', fil:'hal. dalawang palapag na 400 m² modernong villa na may pool sa Dubai', id:'mis. vila modern dua lantai 400 m² dengan kolam di Dubai', zh:'例：迪拜 400 平米两层现代别墅，带泳池和majlis', ml:'ഉദാ: ദുബായിൽ പൂളുള്ള 400 m² ഇരുനില മോഡേൺ വില്ല' },
    go: { ar:'✨ ولّد التصميم', en:'✨ Generate the design', fr:'✨ Générer le design', es:'✨ Generar el diseño', tr:'✨ Tasarımı oluştur', ru:'✨ Создать проект', hi:'✨ डिज़ाइन बनाएं', ur:'✨ ڈیزائن بنائیں', bn:'✨ ডিজাইন তৈরি করুন', ne:'✨ डिजाइन बनाउनुहोस्', fil:'✨ Gumawa ng disenyo', id:'✨ Buat desain', zh:'✨ 生成设计', ml:'✨ ഡിസൈൻ ഉണ്ടാക്കൂ' },
    reading: { ar:'⏳ أقرأ وصفك…', en:'⏳ Reading your description…', fr:'⏳ Lecture de votre description…', es:'⏳ Leyendo tu descripción…', tr:'⏳ Açıklamanız okunuyor…', ru:'⏳ Читаю описание…', hi:'⏳ आपका विवरण पढ़ रहे हैं…', ur:'⏳ آپ کی تفصیل پڑھ رہے ہیں…', bn:'⏳ আপনার বর্ণনা পড়ছি…', ne:'⏳ तपाईंको विवरण पढ्दै…', fil:'⏳ Binabasa ang paglalarawan…', id:'⏳ Membaca deskripsi Anda…', zh:'⏳ 正在阅读你的描述…', ml:'⏳ നിങ്ങളുടെ വിവരണം വായിക്കുന്നു…' },
    got: { ar:'✅ فهمت: {s} — عدّلها من النموذج تحت إن أردت', en:'✅ Understood: {s} — adjust below if you like', fr:'✅ Compris : {s} — ajustez ci-dessous si besoin', es:'✅ Entendido: {s} — ajústalo abajo si quieres', tr:'✅ Anladım: {s} — istersen aşağıdan düzenle', ru:'✅ Понял: {s} — можно поправить ниже', hi:'✅ समझ गए: {s} — नीचे से बदल सकते हैं', ur:'✅ سمجھ گیا: {s} — نیچے سے تبدیل کریں', bn:'✅ বুঝেছি: {s} — নিচে থেকে বদলাতে পারেন', ne:'✅ बुझें: {s} — तल परिवर्तन गर्न सक्नुहुन्छ', fil:'✅ Naintindihan: {s} — baguhin sa ibaba kung gusto', id:'✅ Dimengerti: {s} — ubah di bawah bila perlu', zh:'✅ 已理解：{s} — 可在下方调整', ml:'✅ മനസ്സിലായി: {s} — താഴെ മാറ്റാം' },
    unclear: { ar:'🤔 ما وضح لي الوصف — اكتب تفاصيل أكثر، أو عبّي النموذج تحت.', en:'🤔 I could not read that — add more detail, or use the form below.', fr:'🤔 Description peu claire — précisez, ou utilisez le formulaire.', es:'🤔 No lo entendí — añade detalles o usa el formulario.', tr:'🤔 Anlayamadım — daha fazla ayrıntı yazın veya aşağıdaki formu kullanın.', ru:'🤔 Не понял — добавьте деталей или заполните форму ниже.', hi:'🤔 समझ नहीं आया — और विवरण दें, या नीचे का फ़ॉर्म भरें।', ur:'🤔 سمجھ نہیں آیا — مزید تفصیل لکھیں یا نیچے فارم بھریں۔', bn:'🤔 বুঝতে পারিনি — আরও বিস্তারিত লিখুন, বা নিচের ফর্ম ব্যবহার করুন।', ne:'🤔 बुझिनँ — थप विवरण लेख्नुहोस्, वा तलको फारम भर्नुहोस्।', fil:'🤔 Hindi ko naintindihan — magdagdag ng detalye, o gamitin ang form sa ibaba.', id:'🤔 Tidak terbaca — tambah detail, atau isi formulir di bawah.', zh:'🤔 没读懂 — 请补充细节，或使用下方表单。', ml:'🤔 മനസ്സിലായില്ല — കൂടുതൽ വിശദാംശം ചേർക്കൂ, അല്ലെങ്കിൽ താഴെയുള്ള ഫോം ഉപയോഗിക്കൂ.' },
    login: { ar:'🔑 سجّل الدخول أولًا.', en:'🔑 Please log in first.', fr:'🔑 Connectez-vous d\'abord.', es:'🔑 Inicia sesión primero.', tr:'🔑 Önce giriş yapın.', ru:'🔑 Сначала войдите.', hi:'🔑 पहले लॉग इन करें।', ur:'🔑 پہلے لاگ اِن کریں۔', bn:'🔑 আগে লগ ইন করুন।', ne:'🔑 पहिले लगइन गर्नुहोस्।', fil:'🔑 Mag-log in muna.', id:'🔑 Masuk dulu.', zh:'🔑 请先登录。', ml:'🔑 ആദ്യം ലോഗിൻ ചെയ്യൂ.' },
    busy: { ar:'⚠️ تعذّرت القراءة الآن — عبّي النموذج تحت.', en:'⚠️ Could not read it now — use the form below.', fr:'⚠️ Lecture impossible — utilisez le formulaire.', es:'⚠️ No se pudo leer — usa el formulario.', tr:'⚠️ Şu an okunamadı — aşağıdaki formu kullanın.', ru:'⚠️ Сейчас не получилось — заполните форму ниже.', hi:'⚠️ अभी नहीं पढ़ सके — नीचे का फ़ॉर्म भरें।', ur:'⚠️ ابھی نہیں پڑھ سکے — نیچے فارم بھریں۔', bn:'⚠️ এখন পড়া গেল না — নিচের ফর্ম ব্যবহার করুন।', ne:'⚠️ अहिले पढ्न सकिएन — तलको फारम भर्नुहोस्।', fil:'⚠️ Hindi mabasa ngayon — gamitin ang form sa ibaba.', id:'⚠️ Tidak terbaca sekarang — isi formulir di bawah.', zh:'⚠️ 暂时读不了 — 请使用下方表单。', ml:'⚠️ ഇപ്പോൾ വായിക്കാനായില്ല — താഴെയുള്ള ഫോം ഉപയോഗിക്കൂ.' },
  };
  var $ = function(id){ return document.getElementById(id); };
  function lg(){ try{ return (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar'; }catch(e){ return 'ar'; } }
  function T(o){ return (o && (o[lg()] || o.en || o.ar)) || ''; }
  function tokenOf(){ try{ return (window.authGet && window.authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; } }

  var busy = false;

  /* يضع القيمة في الحقل ويُطلق change كي يسمعه أيّ مستمع قائم (لا نلمس منطق النموذج) */
  function setVal(id, v){
    var el = $(id); if(!el || v === null || v === undefined || v === '') return false;
    el.value = String(v);
    try{ el.dispatchEvent(new Event('change', { bubbles:true })); }catch(e){ /* guard-ok — القيمة وُضعت */ }
    return true;
  }
  function setSelect(id, v){
    var el = $(id); if(!el || !v) return false;
    var ok = Array.prototype.some.call(el.options, function(o){ return o.value === v; });
    if(!ok) return false;
    return setVal(id, v);
  }
  /* الملاحق: المذكورة تُفعَّل، وغير المذكورة تبقى كما هي (المستخدم قد يكون أشّرها بيده) */
  function setAnnexes(list){
    var on = [];
    (list || []).forEach(function(k){
      var box = document.querySelector('.constructionAnnex[value="' + k + '"]');
      if(box && !box.checked){ box.checked = true; try{ box.dispatchEvent(new Event('change', { bubbles:true })); }catch(e){ /* guard-ok */ } }
      if(box) on.push(box);
    });
    return on.length;
  }
  /* ملخّص ما فُهم بلغة المستخدم: نقرأ نصّ الخيار المختار من النموذج نفسه فيأتي مترجمًا مجّانًا */
  function summarize(f){
    var out = [];
    var opt = function(id){ var e = $(id); return (e && e.selectedIndex >= 0) ? (e.options[e.selectedIndex].text || '').trim() : ''; };
    if(f.buildingType) out.push(opt('constructionType'));
    if(f.floors) { var fl = $('constructionFloors'); if(fl) out.push((fl.previousElementSibling ? fl.previousElementSibling.textContent.trim() : '') + ' ' + f.floors); }
    if(f.area) out.push(f.area + ' m²');
    if(f.style) out.push(opt('constructionStyle'));
    if(f.budget) out.push(opt('constructionBudget'));
    if(f.emirate) out.push(opt('constructionEmirate'));
    if(f.annexes && f.annexes.length) out.push('+' + f.annexes.length);
    return out.filter(Boolean).join(' · ');
  }

  function status(el, txt){ el.textContent = txt || ''; el.style.display = txt ? 'block' : 'none'; }

  async function run(input, st){
    if(busy) return;
    var text = (input.value || '').trim();
    if(!text) { input.focus(); return; }
    var token = tokenOf();
    if(!token){ status(st, T(TX.login)); return; }
    busy = true; var go = $('cxBriefGo'); if(go) go.disabled = true;
    status(st, T(TX.reading));
    try{
      var r = await fetch('/api/tools?action=construction-brief', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ text: text.slice(0, 240), token: token }),
      });
      var j = null; try{ j = await r.json(); }catch(e){ j = null; }
      var f = j && j.fields;
      if(!f){
        status(st, (j && j.reason === 'unclear') ? T(TX.unclear) : (j && j.reason === 'auth') ? T(TX.login) : T(TX.busy));
        return;
      }
      setSelect('constructionType', f.buildingType);
      setSelect('constructionStyle', f.style);
      setSelect('constructionBudget', f.budget);
      setSelect('constructionEmirate', f.emirate);
      setVal('constructionFloors', f.floors);
      setVal('constructionArea', f.area);
      setVal('constructionPlot', f.plotArea);
      setAnnexes(f.annexes);
      if(f.notes){ var n = $('constructionNotes'); if(n && !n.value.trim()) setVal('constructionNotes', f.notes); }
      status(st, T(TX.got).replace('{s}', summarize(f)));
      var btn = $('constructionRunBtn');
      if(btn && !btn.disabled) btn.click();
    }catch(e){
      status(st, T(TX.busy));
    }finally{ busy = false; var g = $('cxBriefGo'); if(g) g.disabled = false; }
  }

  function render(){
    var t = $('cxBriefTitle'); if(t) t.textContent = T(TX.title);
    var i = $('cxBriefText'); if(i) i.placeholder = T(TX.ph);
    var g = $('cxBriefGo'); if(g) g.textContent = T(TX.go);
  }

  function boot(){
    var modal = $('constructionModal'); if(!modal || $('cxBrief')) return;
    var desc = modal.querySelector('[data-i18n="constructionDesc"]'); if(!desc) return;
    var box = document.createElement('div'); box.id = 'cxBrief'; box.className = 'cx-sec';
    box.style.cssText = 'border-color:var(--omGoldSoft,rgba(212,175,55,.45)); background:rgba(212,175,55,.08);';
    box.innerHTML = '<h4 class="cx-h" id="cxBriefTitle" style="font-weight:800;"></h4>' +
      '<div class="mini-mic-field-row" style="display:flex;gap:6px;align-items:stretch;">' +
        '<input id="cxBriefText" type="text" maxlength="240" style="flex:1;min-width:0;padding:11px 12px;border-radius:10px;border:1px solid rgba(212,175,55,.35);background:rgba(255,255,255,.04);color:inherit;font-family:inherit;font-size:13.5px;">' +
        '<button type="button" class="mini-mic-btn" data-target="cxBriefText" title="🎤" data-i18n-title="micTitle" style="flex:none;">🎤</button>' +
      '</div>' +
      '<button type="button" class="btn primary" id="cxBriefGo" style="width:100%;margin-top:8px;font-weight:800;"></button>' +
      '<div id="cxBriefStatus" style="display:none;font-size:12.5px;margin-top:8px;line-height:1.7;"></div>';
    desc.insertAdjacentElement('afterend', box);
    var input = $('cxBriefText'); var st = $('cxBriefStatus');
    $('cxBriefGo').onclick = function(){ run(input, st); };
    input.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); run(input, st); } });
    render();
    try{ new MutationObserver(render).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){ /* guard-ok */ }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 900);
})();
