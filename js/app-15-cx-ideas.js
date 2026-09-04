/* ───────── v-cx-ideas (طلب المالك): أفكار تصاميم جاهزة في المقاولات ─────────
 * نفس فكرة معرض الديكور، لكن كل شيء يخص الشيء نفسه: يختار المستخدم ما يريد
 * (واجهة خارجية / مخطط / داخلي…) وعدد الأدوار (أرضي / طابقين / ثلاثة) والطراز،
 * فتأتي الصور مطابقة لاختياره حرفيًا؛ والضغط على أي صورة يفتحها كبيرة داخل التطبيق. */
(function(){
  'use strict';
  var D = {"views":[{"v":"exterior","em":"🏠","t":{"ar":"واجهة خارجية","en":"Exterior facade","fr":"Façade extérieure","es":"Fachada exterior","tr":"Dış cephe","ru":"Фасад","hi":"बाहरी अग्रभाग","ur":"بیرونی فسادہ","bn":"বাহ্যিক সম্মুখভাগ","ne":"बाहिरी अग्रभाग","fil":"Panlabas na harapan","id":"Fasad luar","zh":"外立面","ml":"പുറംഭാഗം"}},{"v":"plan","em":"📐","t":{"ar":"مخطط أرضي","en":"Floor plan","fr":"Plan d'étage","es":"Plano de planta","tr":"Kat planı","ru":"План этажа","hi":"फ़्लोर प्लान","ur":"فلور پلان","bn":"ফ্লোর প্ল্যান","ne":"फ्लोर प्लान","fil":"Floor plan","id":"Denah lantai","zh":"平面图","ml":"ഫ്ലോർ പ്ലാൻ"}},{"v":"interior","em":"🛋️","t":{"ar":"داخلي","en":"Interior","fr":"Intérieur","es":"Interior","tr":"İç mekân","ru":"Интерьер","hi":"इंटीरियर","ur":"اندرونی","bn":"অভ্যন্তর","ne":"भित्री","fil":"Interior","id":"Interior","zh":"室内","ml":"ഇന്റീരിയർ"}},{"v":"majlis","em":"🪑","t":{"ar":"مجلس خارجي","en":"Outdoor majlis","fr":"Majlis extérieur","es":"Majlis exterior","tr":"Dış majlis","ru":"Наружный меджлис","hi":"बाहरी मजलिस","ur":"بیرونی مجلس","bn":"বাহ্যিক মজলিস","ne":"बाहिरी मजलिस","fil":"Panlabas na majlis","id":"Majlis luar","zh":"室外会客厅","ml":"പുറം മജ്‌ലിസ്"}},{"v":"garden","em":"🌳","t":{"ar":"حديقة ومسبح","en":"Garden & pool","fr":"Jardin et piscine","es":"Jardín y piscina","tr":"Bahçe ve havuz","ru":"Сад и бассейн","hi":"बगीचा और पूल","ur":"باغ اور پول","bn":"বাগান ও পুল","ne":"बगैंचा र पोखरी","fil":"Hardin at pool","id":"Taman & kolam","zh":"花园与泳池","ml":"പൂന്തോട്ടവും പൂളും"}},{"v":"entrance","em":"🚪","t":{"ar":"مدخل وبوابة","en":"Entrance & gate","fr":"Entrée et portail","es":"Entrada y portón","tr":"Giriş ve kapı","ru":"Вход и ворота","hi":"प्रवेश और गेट","ur":"داخلہ اور گیٹ","bn":"প্রবেশ ও গেট","ne":"प्रवेश र गेट","fil":"Entrada at gate","id":"Pintu masuk & gerbang","zh":"入口与大门","ml":"പ്രവേശനവും ഗേറ്റും"}}],"floors":[{"v":"g","em":"1️⃣","t":{"ar":"أرضي","en":"Ground floor only","fr":"Plain-pied","es":"Una planta","tr":"Tek kat","ru":"Одноэтажный","hi":"एक मंज़िल","ur":"ایک منزلہ","bn":"একতলা","ne":"एक तले","fil":"Isang palapag","id":"Satu lantai","zh":"单层","ml":"ഒറ്റനില"}},{"v":"g1","em":"2️⃣","t":{"ar":"طابقين","en":"Two floors","fr":"Deux étages","es":"Dos plantas","tr":"İki kat","ru":"Двухэтажный","hi":"दो मंज़िल","ur":"دو منزلہ","bn":"দোতলা","ne":"दुई तले","fil":"Dalawang palapag","id":"Dua lantai","zh":"两层","ml":"ഇരുനില"}},{"v":"g2","em":"3️⃣","t":{"ar":"ثلاثة طوابق","en":"Three floors","fr":"Trois étages","es":"Tres plantas","tr":"Üç kat","ru":"Трёхэтажный","hi":"तीन मंज़िल","ur":"تین منزلہ","bn":"তিনতলা","ne":"तीन तले","fil":"Tatlong palapag","id":"Tiga lantai","zh":"三层","ml":"മൂന്ന് നില"}}],"styles":[{"v":"modern","em":"✨","t":{"ar":"مودرن","en":"Modern","fr":"Moderne","es":"Moderno","tr":"Modern","ru":"Модерн","hi":"मॉडर्न","ur":"ماڈرن","bn":"আধুনিক","ne":"आधुनिक","fil":"Modern","id":"Modern","zh":"现代","ml":"മോഡേൺ"}},{"v":"classic","em":"🏛️","t":{"ar":"كلاسيك","en":"Classic","fr":"Classique","es":"Clásico","tr":"Klasik","ru":"Классика","hi":"क्लासिक","ur":"کلاسک","bn":"ক্লাসিক","ne":"क्लासिक","fil":"Classic","id":"Klasik","zh":"古典","ml":"ക്ലാസിക്"}},{"v":"najdi","em":"🏜️","t":{"ar":"نجدي","en":"Najdi","fr":"Najdi","es":"Najdi","tr":"Necd","ru":"Наджди","hi":"नज्दी","ur":"نجدی","bn":"নাজদি","ne":"नज्दी","fil":"Najdi","id":"Najdi","zh":"纳季德风格","ml":"നജ്ദി"}},{"v":"islamic","em":"🕌","t":{"ar":"إسلامي","en":"Islamic","fr":"Islamique","es":"Islámico","tr":"İslami","ru":"Исламский","hi":"इस्लामी","ur":"اسلامی","bn":"ইসলামি","ne":"इस्लामी","fil":"Islamic","id":"Islami","zh":"伊斯兰风格","ml":"ഇസ്ലാമിക്"}},{"v":"andalusian","em":"🏰","t":{"ar":"أندلسي","en":"Andalusian","fr":"Andalou","es":"Andaluz","tr":"Endülüs","ru":"Андалузский","hi":"अंडालूसी","ur":"اندلسی","bn":"আন্দালুসীয়","ne":"अन्दलुसी","fil":"Andalusian","id":"Andalusia","zh":"安达卢西亚","ml":"അൻഡലൂഷ്യൻ"}},{"v":"minimal","em":"🤍","t":{"ar":"بسيط","en":"Minimal","fr":"Minimal","es":"Minimalista","tr":"Minimal","ru":"Минимал","hi":"मिनिमल","ur":"سادہ","bn":"মিনিমাল","ne":"न्यूनतम","fil":"Minimal","id":"Minimalis","zh":"极简","ml":"മിനിമൽ"}}],"tx":{"title":{"ar":"💡 أفكار تصاميم جاهزة — اختر ما يخص مشروعك واضغط أي صورة لعرضها","en":"💡 Ready design ideas — pick what fits your project, tap any photo to open it","fr":"💡 Idées de design — choisissez, touchez une photo","es":"💡 Ideas de diseño — elige y toca una foto","tr":"💡 Hazır tasarım fikirleri — seç, fotoğrafa dokun","ru":"💡 Идеи дизайна — выберите и нажмите на фото","hi":"💡 डिज़ाइन विचार — चुनें, फोटो पर टैप करें","ur":"💡 ڈیزائن آئیڈیاز — منتخب کریں، تصویر پر ٹیپ کریں","bn":"💡 ডিজাইন আইডিয়া — বেছে নিন, ছবিতে ট্যাপ করুন","ne":"💡 डिजाइन विचार — छान्नुहोस्, फोटो थिच्नुहोस्","fil":"💡 Mga ideya sa disenyo — pumili, i-tap ang larawan","id":"💡 Ide desain — pilih, ketuk foto","zh":"💡 设计灵感 — 选择并点击图片查看","ml":"💡 ഡിസൈൻ ആശയങ്ങൾ — തിരഞ്ഞെടുത്ത് ഫോട്ടോയിൽ ടാപ്പ് ചെയ്യുക"},"go":{"ar":"✨ أعطني أفكارًا","en":"✨ Give me ideas","fr":"✨ Donnez-moi des idées","es":"✨ Dame ideas","tr":"✨ Fikir ver","ru":"✨ Дай идеи","hi":"✨ आइडिया दो","ur":"✨ آئیڈیاز دیں","bn":"✨ আইডিয়া দিন","ne":"✨ विचार दिनुहोस्","fil":"✨ Bigyan ng ideya","id":"✨ Beri ide","zh":"✨ 给我灵感","ml":"✨ ആശയങ്ങൾ തരൂ"},"ph":{"ar":"مثال: فيلا دورين واجهة حجر","en":"e.g. two-storey villa with stone facade","fr":"ex. villa deux étages en pierre","es":"ej. villa de dos plantas en piedra","tr":"örn. taş cepheli iki katlı villa","ru":"напр. двухэтажная вилла с каменным фасадом","hi":"जैसे दो मंज़िल पत्थर की विला","ur":"مثلاً دو منزلہ پتھر کا ولا","bn":"যেমন দোতলা পাথরের ভিলা","ne":"जस्तै दुई तले ढुङ्गाको भिल्ला","fil":"hal. dalawang palapag na villa na bato","id":"mis. vila dua lantai fasad batu","zh":"例：两层石材外墙别墅","ml":"ഉദാ: ഇരുനില കല്ല് വില്ല"},"wait":{"ar":"⏳ أجمع لك صورًا وتصاميم…","en":"⏳ Collecting photos and designs…","fr":"⏳ Collecte des photos…","es":"⏳ Recopilando fotos…","tr":"⏳ Fotoğraflar toplanıyor…","ru":"⏳ Собираю фото…","hi":"⏳ फोटो जुटा रहे हैं…","ur":"⏳ تصاویر جمع کر رہے ہیں…","bn":"⏳ ছবি সংগ্রহ হচ্ছে…","ne":"⏳ फोटो जम्मा गर्दै…","fil":"⏳ Kinokolekta ang mga larawan…","id":"⏳ Mengumpulkan foto…","zh":"⏳ 正在收集图片…","ml":"⏳ ഫോട്ടോകൾ ശേഖരിക്കുന്നു…"},"found":{"ar":"🖼️ {n} صورة وتصميم — اضغط أي صورة لعرضها كبيرة","en":"🖼️ {n} photos and designs — tap any to open it","fr":"🖼️ {n} photos — touchez pour agrandir","es":"🖼️ {n} fotos — toca para ampliar","tr":"🖼️ {n} fotoğraf — büyütmek için dokun","ru":"🖼️ {n} фото — нажмите, чтобы открыть","hi":"🖼️ {n} फोटो — बड़ा देखने के लिए टैप करें","ur":"🖼️ {n} تصاویر — بڑا دیکھنے کے لیے ٹیپ کریں","bn":"🖼️ {n} ছবি — বড় দেখতে ট্যাপ করুন","ne":"🖼️ {n} फोटो — ठूलो हेर्न थिच्नुहोस्","fil":"🖼️ {n} larawan — i-tap para palakihin","id":"🖼️ {n} foto — ketuk untuk memperbesar","zh":"🖼️ {n} 张图片 — 点击放大","ml":"🖼️ {n} ഫോട്ടോകൾ — വലുതാക്കാൻ ടാപ്പ് ചെയ്യുക"},"none":{"ar":"😕 ما حصلت صورًا لهذا الطلب — جرّب اختيارًا آخر.","en":"😕 No photos found — try another choice.","fr":"😕 Aucune photo — essayez autre chose.","es":"😕 Sin fotos — prueba otra opción.","tr":"😕 Fotoğraf bulunamadı — başka seçenek dene.","ru":"😕 Фото не найдены — попробуйте другое.","hi":"😕 फोटो नहीं मिली — दूसरा विकल्प आज़माएँ।","ur":"😕 تصاویر نہیں ملیں — دوسرا آپشن آزمائیں۔","bn":"😕 ছবি পাওয়া যায়নি — অন্য অপশন চেষ্টা করুন।","ne":"😕 फोटो भेटिएन — अर्को छान्नुहोस्।","fil":"😕 Walang larawan — subukan ang iba.","id":"😕 Tidak ada foto — coba pilihan lain.","zh":"😕 未找到图片 — 换个选择试试。","ml":"😕 ഫോട്ടോകൾ കിട്ടിയില്ല — മറ്റൊന്ന് ശ്രമിക്കൂ."},"err":{"ar":"⚠️ تعذّر جلب الصور الآن.","en":"⚠️ Could not fetch photos right now.","fr":"⚠️ Impossible de récupérer les photos.","es":"⚠️ No se pudieron cargar las fotos.","tr":"⚠️ Fotoğraflar alınamadı.","ru":"⚠️ Не удалось загрузить фото.","hi":"⚠️ फोटो नहीं ला सके।","ur":"⚠️ تصاویر حاصل نہیں ہو سکیں۔","bn":"⚠️ ছবি আনা যায়নি।","ne":"⚠️ फोटो ल्याउन सकिएन।","fil":"⚠️ Hindi makuha ang mga larawan.","id":"⚠️ Tidak dapat mengambil foto.","zh":"⚠️ 暂时无法获取图片。","ml":"⚠️ ഫോട്ടോകൾ ലഭ്യമാക്കാനായില്ല."}}};
  function lg(){ try{ return (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar'; }catch(e){ return 'ar'; } }
  function T(o){ return o[lg()] || o.en || o.ar; }
  var $ = function(id){ return document.getElementById(id); };

  /* معرض كبير داخل التطبيق — مشترك للديكور والمقاولات */
  if(!window.omranLightbox){
    window.omranLightbox = function(url){
      var box = $('omranLightbox');
      if(!box){
        box = document.createElement('div'); box.id = 'omranLightbox';
        box.style.cssText = 'position:fixed;inset:0;z-index:10095;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.94);padding:12px;';
        box.innerHTML = '<button type="button" id="omranLightboxX" aria-label="close" style="position:absolute;top:calc(12px + env(safe-area-inset-top,0px));inset-inline-start:12px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(20,20,26,.85);color:#fff;font-size:18px;">✕</button><img id="omranLightboxImg" alt="" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;">';
        document.body.appendChild(box);
        box.onclick = function(e){ if(e.target === box || e.target.id === 'omranLightboxX') box.style.display = 'none'; };
      }
      $('omranLightboxImg').src = url;
      box.style.display = 'flex';
    };
  }

  var sel = { view: 'exterior', floors: '', style: '' };
  function chip(label, on, fn){
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn';
    b.style.cssText = 'width:auto; padding:6px 11px; font-size:12.5px; border-radius:999px;' + (on ? 'border-color:#d4af37; background:rgba(212,175,55,.16); color:#d4af37;' : '');
    b.textContent = label; b.onclick = fn; return b;
  }
  var box, status, gallery, input, req = 0;
  function render(){
    if(!box) return;
    ['cxIdeaView','cxIdeaFloors','cxIdeaStyle'].forEach(function(id){ var el = $(id); if(el) el.innerHTML = ''; });
    D.views.forEach(function(o){ $('cxIdeaView').appendChild(chip(o.em + ' ' + T(o.t), sel.view === o.v, function(){ sel.view = o.v; render(); load(); })); });
    D.floors.forEach(function(o){ $('cxIdeaFloors').appendChild(chip(o.em + ' ' + T(o.t), sel.floors === o.v, function(){ sel.floors = (sel.floors === o.v) ? '' : o.v; render(); load(); })); });
    D.styles.forEach(function(o){ $('cxIdeaStyle').appendChild(chip(o.em + ' ' + T(o.t), sel.style === o.v, function(){ sel.style = (sel.style === o.v) ? '' : o.v; render(); load(); })); });
    $('cxIdeasTitle').textContent = T(D.tx.title);
    input.placeholder = T(D.tx.ph);
    $('cxIdeaGo').textContent = T(D.tx.go);
  }
  function setStatus(t){ status.textContent = t || ''; status.style.display = t ? 'block' : 'none'; }
  async function load(){
    var my = ++req;
    gallery.style.display = 'none'; gallery.innerHTML = '';
    setStatus(T(D.tx.wait));
    var type = ($('constructionType') || {}).value || 'villa';
    var floorsInput = $('constructionFloors');
    var floors = sel.floors || (floorsInput && floorsInput.value ? (parseInt(floorsInput.value, 10) >= 3 ? 'g2' : (parseInt(floorsInput.value, 10) === 2 ? 'g1' : 'g')) : '');
    try{
      var r = await fetch('/api/design-ideas', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mode:'construction', type: type, view: sel.view, floors: floors, style: sel.style, q: input.value.trim() }) });
      var d = await r.json();
      if(my !== req) return;
      var imgs = Array.isArray(d.images) ? d.images : [];
      if(!imgs.length){ setStatus(T(D.tx.none)); return; }
      imgs.forEach(function(u){
        var a = document.createElement('a'); a.href = u;
        a.style.cssText = 'display:block; break-inside:avoid; margin-bottom:6px; border-radius:12px; overflow:hidden; background:rgba(255,255,255,.04); cursor:zoom-in;';
        a.onclick = function(e){ e.preventDefault(); window.omranLightbox(u); };
        var im = document.createElement('img'); im.src = u; im.loading = 'lazy'; im.alt = '';
        im.style.cssText = 'display:block; width:100%; height:auto;';
        im.onerror = function(){ a.remove(); };
        a.appendChild(im); gallery.appendChild(a);
      });
      gallery.style.display = 'block';
      setStatus(T(D.tx.found).replace('{n}', imgs.length));
    }catch(e){ if(my === req) setStatus(T(D.tx.err)); }
  }
  function boot(){
    var modal = $('constructionModal'); if(!modal || $('cxIdeas')) return;
    var desc = modal.querySelector('[data-i18n="constructionDesc"]'); if(!desc) return;
    box = document.createElement('div'); box.id = 'cxIdeas'; box.className = 'cx-sec';
    box.style.cssText = 'border-color:var(--omGoldSoft,rgba(212,175,55,.35)); background:rgba(212,175,55,.06);';
    box.innerHTML = '<h4 class="cx-h" id="cxIdeasTitle"></h4>' +
      '<div id="cxIdeaView" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>' +
      '<div id="cxIdeaFloors" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>' +
      '<div id="cxIdeaStyle" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>' +
      '<div style="display:flex;gap:6px;align-items:stretch;"><input id="cxIdeaText" type="text" maxlength="200" style="flex:1;min-width:0;padding:9px 10px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.14));background:rgba(255,255,255,.04);color:inherit;font-family:inherit;"><button type="button" class="btn primary" id="cxIdeaGo" style="width:auto;white-space:nowrap;"></button></div>' +
      '<div id="cxIdeaStatus" style="display:none;font-size:12.5px;margin-top:8px;line-height:1.7;"></div>' +
      '<div id="cxIdeaGallery" style="display:none;columns:2;column-gap:6px;margin-top:8px;"></div>';
    desc.insertAdjacentElement('afterend', box);
    status = $('cxIdeaStatus'); gallery = $('cxIdeaGallery'); input = $('cxIdeaText');
    $('cxIdeaGo').onclick = load;
    input.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); load(); } });
    render();
    try{ new MutationObserver(render).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){ /* guard-ok */ }
    window.__cxIdeasLoad = load;
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 800);
})();
