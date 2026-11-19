/* ---------- 🎬 AI Video Maker (Runway / Veo 3 / MiniMax, server-side owner key) ---------- */
(function(){
  const modal = $('#videoMakerModal');
  const btnOpen = $('#btnVideoMaker');
  const btnClose = $('#videoMakerCloseBtn');
  const btnGenerate = $('#videoMakerGenerateBtn');
  const promptEl = $('#videoMakerPrompt');
  const modeEl = $('#videoMakerMode');
  const signatureRow = $('#videoMakerSignatureRow');
  const signatureEl = $('#videoMakerSignature');
  const styleEl = $('#videoMakerStyle');
  const durationEl = $('#videoMakerDuration');
  const ratioEl = $('#videoMakerRatio');
  const statusEl = $('#videoMakerStatus');
  const resultEl = $('#videoMakerResult');
  const downloadEl = $('#videoMakerDownloadLink');
  /* v-vmk-dl-ext (تدقيق ١٨ أكتوبر + أمر المالك، الدفعة ١: «الفيديو ينزل باسم mp4 وهو webm: الامتداد لازم يطابق النوع»): الرابط يحمل
     download="omran-ai-video.mp4" ثابتًا من partials-core، وفيديو القوالب (المسجِّل) والدمج والصوت السريع WebM — فينزل WebM باسم mp4 ولا
     تفتحه بعض الأجهزة. الاسم من نوع الملفّ نفسه حيث الملفّ Blob في يدنا، ورابط المزوّد (MP4) يبقى بالاسم الافتراضيّ الذي يُعاد قبل كلّ توليد. */
  function dlName(base, type){ return base + '.' + (/webm/i.test(String(type || '')) ? 'webm' : 'mp4'); }
  // v291: تنزيل تلقائي للفيديو أول ما يجهز
  // v525: proxyVideoUrl — يمرّر رابط الفيديو عبر سيرفر عمران بدل جلبه مباشرة من المتصفح
  // يحل مشكلة CORS على الجوال وهواوي التي تمنع fetch() من مصادر خارجية
  function proxyVideoUrl(url){
    // روابط blob وروابط same-origin (تبدأ بـ /) لا تحتاج بروكسي
    if(!url || /^blob:/.test(url) || /^\//.test(url)) return url;
    /* v-dl-ticket (المراجعة المعاكسة): لا رمز جلسة في الرابط — كان يتسرّب من السجلّات وزرّ «فتح» والمشاركة. نقرة «تحميل»
       تمرّ بالحافظ الموحّد (app-05-save-media.js) فيجلب بالترويسة أو يصدر تذكرة تنزيل قصيرة لرابط ورقة الجوّال */
    return '/api/video-download?url=' + encodeURIComponent(url);
  }
  /* v-dl-ticket: الجلب نفسه يحمل الجلسة في ترويسة Authorization (البروكسي يقبلها) */
  function proxyFetch(url){
    const tk = (typeof authGet === 'function') ? (authGet('aiapp_auth_token') || '') : '';
    return fetch(proxyVideoUrl(url), tk ? { headers: { Authorization: 'Bearer ' + tk } } : undefined);
  }
  async function proxyBlob(url){
    const r = await proxyFetch(url);
    if(!r.ok) throw new Error('proxy ' + r.status);
    return r.blob();
  }
  // v-trend-dl-fix: تتيح لملفّ الترندات (app-11-video-trends.js، إغلاق مستقلّ) استخدام نفس البروكسي
  // بدل رابط Runway/Veo الخام — بلا هذا كان زرّ تحميل الترند يفشل صامتًا على الجوّال وهواوي.
  window.__omranProxyVideoUrl = proxyVideoUrl;

  /* v-video-poll (المالك: «⏳ يولّد الفيديو» ما ينتهي): حلقات الاستطلاع الأربع كانت بلا سقف عمر
     وتبتلع كلّ خطأ شبكة بصمت (`catch(e){ keep polling }`)، فأيّ فشل لا يُعلَن — أو حالة لا يعرفها
     الخادم فيردّها «لسّا شغّال» — يترك المستخدم ينتظر إلى الأبد. هذا الحارس يحدّ العمر ويحدّ
     الأخطاء المتتالية (العابر منها يُتسامح معه) ويعطي رسالة صريحة بدل الانتظار الصامت. */
  function makePollGuard(reject, everyMs, maxMs){
    const step = everyMs || 8000;
    const life = maxMs || 15 * 60 * 1000;
    let ticks = 0, errors = 0;
    return {
      // أوّل كلّ دورة: false = انتهى العمر وأُبلغ المستخدم
      tick(iv){
        if(++ticks * step < life) return true;
        clearInterval(iv);
        /* v-video-poll-transient: المهمّة قُبلت ودُفعت ولم تُسوَّ — لا تُعاد بطلب جديد مدفوع (createSceneWithRetry كان يعيدها فيُخصم مرّتين) */
        const te = new Error(bT('طال انتظار الفيديو بلا نتيجة — أعد المحاولة.','The video took too long with no result — please try again.'));
        te.code = 'poll_timeout'; te.noRetry = true; reject(te);
        return false;
      },
      ok(){ errors = 0; },
      // خطأ شبكة: نتسامح مع العابر ونستسلم بعد ستّ محاولات متتالية فاشلة
      fail(iv, msg){
        if(++errors < 6) return;
        clearInterval(iv);
        const fe = new Error(msg || bT('انقطع الاتّصال بخدمة الفيديو — تحقّق من الشبكة وأعد المحاولة.','Lost connection to the video service — check your connection and try again.')); /* v-ai-video-speed: نصّ الخادم إن جاء خطؤه منه */
        fe.noRetry = true; reject(fe); /* v-video-poll-transient: المهمّة المدفوعة ما زالت عند المزوّد — لا طلب جديد مدفوع فوقها */
      },
    };
  }

  /* v-video-partial (فحص ٢٧ أكتوبر): «فيلم متكامل» أو «٢٠ ثانية» يتوقّف في مشهد لاحق (حدّ اليوم، رصيد، إلغاء خصم، عطل) كان يرمي
     المشاهد المكتملة المدفوعة ويعرض الخطأ وحده — تُعرض الآن ورا بعض بروابط تحميلها مع سبب التوقّف ونصّ «اكتمل {k} من {n} مشاهد»
     (نصّ الترندات نفسه بالـ١٤ لغة — ui.partial). */
  function partialScenesNote(k, n){
    try{
      const P = window.__VIDEO_TRENDS && window.__VIDEO_TRENDS.ui && window.__VIDEO_TRENDS.ui.partial;
      const lg = (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar';
      const t = P && (P[lg] || P.en || P.ar);
      if(t) return String(t).replace('{k}', String(k)).replace('{n}', String(n));
    }catch(e){ __swallow(e, 'video:partial-note'); }
    return bT('اكتمل ' + k + ' من ' + n + ' مشاهد — الجاهز تحت.', 'Finished ' + k + ' of ' + n + ' scenes — the ready part is below.');
  }
  /* v-share-visible (فحص المتصفّح ٧ نوفمبر): video.js ينقل الفيديو إلى ‎.vmk-stage‎، وفيديوها مطلق inset:0 فوق ما بعده — فكان صفّ
     «مشهد N» المُدرج بعد الفيديو يُرسم تحته: لا تحميل ولا مشاركة تُرى ولا تُلمس. الصفّ مكان زرّ التحميل (يُخفى للمشاهد المتعدّدة). */
  function placeSceneLinks(linksEl){
    try{
      const inStage = !!(resultEl.closest && resultEl.closest('.vmk-stage'));
      const an = inStage ? (downloadEl.__omShareNext || downloadEl) : resultEl;
      if(an && an.parentNode && an.nextSibling !== linksEl) an.parentNode.insertBefore(linksEl, an.nextSibling);
    }catch(e){ __swallow(e, 'vmk:scene-links'); }
  }
  /* «مشهد N» و«مشاركة» زوج لا ينقسم على سطرين — بلا الإيموجي (v-clean-ui) كان الزرّان «مشهد N» و«مشهد N» */
  function scenePair(a){ const s = document.createElement('span'); s.style.cssText = 'display:inline-flex;gap:4px;align-items:center;'; s.appendChild(a); return s; }
  function showPartialScenes(urls, n, why){
    let idx = 0;
    resultEl.onended = () => { idx++; if(idx < urls.length){ resultEl.src = urls[idx]; resultEl.play().catch(() => {}); } };
    resultEl.src = urls[0];
    resultEl.style.display = 'block';
    downloadEl.href = proxyVideoUrl(urls[0]);
    downloadEl.download = 'scene-1.mp4';
    downloadEl.style.display = urls.length === 1 ? 'block' : 'none';
    let linksEl = document.getElementById('filmSceneLinks');
    if(!linksEl){
      linksEl = document.createElement('div');
      linksEl.id = 'filmSceneLinks';
      linksEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;justify-content:center;';
    }
    placeSceneLinks(linksEl);
    linksEl.innerHTML = '';
    if(urls.length > 1) urls.forEach((u, i) => {
      const a = document.createElement('a');
      a.href = proxyVideoUrl(u);
      a.download = 'scene-' + (i + 1) + '.mp4';
      a.textContent = (bT('⬇️ مشهد ','⬇️ Scene ')) + (i + 1);
      a.style.cssText = 'padding:6px 12px;border-radius:10px;background:rgba(139,92,246,.18);color:inherit;text-decoration:none;font-size:13px;';
      linksEl.appendChild(scenePair(a));
      /* v-share-next: «مشاركة» بجانب «⬇️ مشهد N» (زوج واحد، المفتاح shareNextBtn بلغات التطبيق) */
      if(typeof window.omranAddShareNextTo === 'function'){ try{ window.omranAddShareNextTo(a, { kind: 'video', style: a.style.cssText + 'border:0;cursor:pointer;font-family:inherit;', getSrc: function(){ return u; } }); }catch(e){ __swallow(e, 'vmk:scene-share'); } }
    });
    setStatus(why + ' ' + partialScenesNote(urls.length, n));
  }

  // v526: autoSaveVideo — النقر البرمجي محظور على هواوي/أندرويد
  // الزر يظهر للمستخدم ليضغط عليه بنفسه (رابط البروكسي مع Content-Disposition: attachment)
  function autoSaveVideo(url, name){
    // لا نفعل شيئاً — زر التحميل يُضبَط خارجياً قبل هذه الدالة
  }
  window.autoSaveVideo = autoSaveVideo;
  const narrationToggle = $('#videoMakerNarrationToggle');
  const narrationText = $('#videoMakerNarrationText');
  const qualityToggle = $('#videoMakerQualityToggle');
  const qualityRow = $('#videoMakerQualityRow');
  let longMinutesOpt = document.getElementById('videoMakerDurationLongMinutesOpt');
  const longMinutesRow = $('#videoMakerLongMinutesRow');
  const longMinutesInput = $('#videoMakerLongMinutesInput');
  if(!modal || !btnOpen) return;

  function isEn(){ return localStorage.getItem('aiapp_lang') === 'en'; }
  function bT(a,e){ return (typeof window!=='undefined'&&window.__bT) ? window.__bT(a,e) : (isEn()?e:a); }
  /* v-trends-lang (المالك ١٤ نوفمبر: «إذا أسوّي أيّ فيديو فقط بالعربي… أريده بكلّ اللغات الموجودة»): لغة الراوي وسيناريو الفيلم
     كانت bT('ar','en') — عربيّ أو إنجليزيّ فقط، فالفرنسيّ يُكتب سيناريوه بالإنجليزيّة ويُقرأ نصّه بصوت إنجليزيّ. الآن لغة الواجهة
     الأربع عشرة كما هي (الخادم يعرفها كلّها)، والراوي بلغة نصّه: حروف عربيّة = الصوت العربيّ (أو الأردو في واجهتها). */
  function uiLangCode(){ try{ return String((typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar').split('-')[0].toLowerCase(); }catch(e){ return 'ar'; } }
  function narrLang(text){ const L = uiLangCode(); return /[؀-ۿ]/.test(String(text || '')) ? (L === 'ur' ? 'ur' : 'ar') : L; }
  function isOwnerAccount(){
    const u = (typeof authGet === 'function') ? (authGet('aiapp_username') || '') : '';
    const key = String(u).trim().toLowerCase();
    return key === 'omran';
  }

  // 🩺 فحص تلقائي صامت عند فتح التطبيق (للمالك فقط، مرة كل 6 ساعات)
  setTimeout(async function autoOwnerHealthCheck(){
    try{
      if(!isOwnerAccount()) return;
      const last = parseInt(localStorage.getItem('aiapp_ownerHealthTs') || '0', 10);
      if(Date.now() - last < 6*60*60*1000) return;
      localStorage.setItem('aiapp_ownerHealthTs', String(Date.now()));
      const problems = [];
      const r = await fetch('/api/system?action=health&token=' + (typeof ownerToken === 'function' ? ownerToken() : '') + '', {cache:'no-store'});
      const d = await r.json();
      if(!r.ok) throw new Error(d.error || r.status);
      if(!d.redisOk) problems.push(oT('ownerDbDown') + (d.redisWhy ? ' — ' + oT('ownerWhy', { w: oLtr(String(d.redisWhy).slice(0, 200)) }) : '')); /* v-redis-why: للمالك وحده */
      const missing = Object.entries(d.envKeys || {}).filter(([,v]) => !v).map(([k]) => k);
      if(missing.length) problems.push(oT('ownerKeysMissing', { k: oLtr(missing.join(', ')) }));
      /* v-err-build: أخطاء النسخة الحاليّة فقط — ما أُصلح في نسخة سابقة لا يُنذر بعد
         نشر الإصلاح. ومع كلّ خطأ ملفّه وسطره، فاللقطة وحدها تكفي للتشخيص. */
      const __build = (typeof window.__omranBuild === 'function') ? window.__omranBuild() : '';
      const __live = (d.clientErrors || []).filter(e => (typeof window.__omranErrLive === 'function') ? window.__omranErrLive(e, __build, Date.now()) : true);
      if(__live.length > 0){
        const top = __live.slice(0,3).map(e => {
          const src = String(e.source || '').split('/').pop().split('?')[0].slice(0, 40);
          return '• ' + '\u2066' + String(e.message || '').slice(0,90) + (src ? ' — ' + src + (e.line ? ':' + e.line : '') : '') + (e.count > 1 ? ' (x' + e.count + ')' : '') + '\u2069'; /* v-err-ltr */
        }).join('\n');
        problems.push(oT('ownerUserErrors', { n: __live.length }) + '\n' + top);
      }
      if(!problems.length) return; // كل شيء سليم → لا إزعاج
      const bar = document.createElement('div');
      bar.id = 'ownerHealthBar'; // v-maha-dock-bar: ينزل تحت شريط «م» العلويّ أثناء نافذة مها (css/modules.css)
      /* v-ownerbar-pill (تدقيق ١٨ أكتوبر، لقطات ٠٠١ و٠٠٨ و٠٤٢ و٠٥٢): v-ownerbar-cover أنزل الشريط تحت الرأس، لكنّه بقي
         بعرض الشاشة (z ٩٩٩٩٩، نصّ pre-wrap بثلاثة أخطاء خامّة ≈١٢٤px) فغطّى صفّ «إبداع» في الأدوات و«محادثة جديدة»
         والبحث وزرّ إغلاق الشريط، وربع شاشة الجوّال، وكان عربيًّا بـdirection:rtl مفروض. صار كبسولة سطر واحد
         «ملاحظات النظام (N)» مع ✕ أسفل الطرف المقابل للشريط الجانبيّ (bottom-start يغطّي أزرار ذيله على الحاسوب)،
         وفوق صندوق الكتابة في الجوّال. التفاصيل الخامّة (v-err-build: الملفّ والسطر للتشخيص من لقطة) تُفتح بالنقر في
         لوحة بسقف 40vh تُمرَّر، ومعها زرّ يفتح «فحص النظام». الاتّجاه اتّجاه الصفحة، والمعرّف كما هو (قاعدة v-maha-dock-bar). */
      const mob = document.documentElement.classList.contains('mobile-ui') || (window.innerWidth || 1280) < 768;
      let bottom = 12;
      if(mob){
        try{
          let top = Infinity; // فوق الصندوق وفوق تلميحه الأوّل (askAllHintTip) إن ظهر
          ['askAllHintTip', 'composerBox'].forEach(function(id){
            const el = document.getElementById(id);
            const r = el && el.getBoundingClientRect();
            if(r && r.height > 0 && r.top > 0 && r.top < window.innerHeight) top = Math.min(top, r.top);
          });
          if(top < Infinity) bottom = Math.round(window.innerHeight - top + 10);
        }catch(e){ __swallow(e, 'owner:healthbar-pos'); }
      }
      bar.style.cssText = 'position:fixed;bottom:' + bottom + 'px;inset-inline-end:12px;z-index:99999;max-width:min(360px,calc(100vw - 24px));background:#3a1010;color:#ffd7d7;border-radius:12px;font-size:13px;line-height:1.5;box-shadow:0 2px 12px rgba(0,0,0,.5)';
      const head = document.createElement('div');
      head.setAttribute('role', 'button');
      head.style.cssText = 'display:flex;align-items:center;gap:6px;min-height:36px;padding:0 4px 0 12px;cursor:pointer;white-space:nowrap';
      const label = document.createElement('span');
      label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis';
      label.textContent = oT('ownerHealthPill', { n: problems.length });
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '✕';
      x.style.cssText = 'flex:none;background:none;border:none;color:#ffd7d7;font-size:15px;line-height:1;padding:8px;cursor:pointer';
      x.onclick = (ev) => { if(ev && ev.stopPropagation) ev.stopPropagation(); bar.remove(); };
      head.appendChild(label);
      head.appendChild(x);
      const det = document.createElement('div');
      det.hidden = true;
      det.style.cssText = 'max-height:40vh;overflow:auto;padding:6px 12px 10px;border-top:1px solid rgba(255,215,215,.2)';
      const txt = document.createElement('div');
      txt.style.cssText = 'white-space:pre-wrap;word-break:break-word';
      txt.textContent = problems.join('\n');
      const go = document.createElement('button');
      go.type = 'button';
      go.textContent = oT('ownerHealthOpen');
      go.style.cssText = 'margin-top:8px;background:none;border:1px solid rgba(255,215,215,.45);color:#ffd7d7;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer';
      go.onclick = () => {
        try{
          const sd = document.getElementById('settingsDialog');
          if(sd && typeof openDialogSafe === 'function') openDialogSafe(sd);
          if(typeof renderSettingsNavList === 'function') renderSettingsNavList();
          if(typeof showSettingsPage === 'function') showSettingsPage('ownerSection');
          if(typeof window.runHealthCheck === 'function') window.runHealthCheck();
        }catch(e){ __swallow(e, 'owner:healthbar-open'); }
      };
      det.appendChild(txt);
      det.appendChild(go);
      head.onclick = () => { det.hidden = !det.hidden; };
      bar.appendChild(head);
      bar.appendChild(det);
      document.body.appendChild(bar);
    }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:235'); /* فحص صامت — لا نزعج المستخدم إذا فشل */ }
  }, 6000);

  /* v-owner-i18n (تدقيق ١٨ أكتوبر، g14-owner): نصوص فحص النظام وكبسولة التنبيه من قاموس لغة الواجهة (كانت عربيّة ثابتة)،
     والحمولة التقنيّة (مسارات، مفاتيح، رسائل الأخطاء) معزولة \u2066…\u2069 كما في v-err-ltr. خطأ الشبكة = acctNetError. */
  function oT(k, p){
    let v = (typeof window.t === 'function') ? window.t(k) : k;
    v = (v == null || v === '') ? k : String(v);
    if(p) Object.keys(p).forEach(function(n){ v = v.split('{' + n + '}').join(String(p[n])); });
    return v;
  }
  function oLtr(s){ return '\u2066' + String(s == null ? '' : s) + '\u2069'; }
  function oIso(s){ return '\u2068' + String(s == null ? '' : s) + '\u2069'; }
  function oErr(e){
    const m = String((e && e.message) || e || '');
    return /Failed to fetch|NetworkError|Load failed|ERR_NETWORK|Network request failed/i.test(m) ? oT('acctNetError') : m;
  }
  /* v-owner-health-scroll: النتيجة تُكتب في صندوق تحت صفوف الأزرار — بلا تمرير لا يتغيّر شيء ظاهر بعد الضغط (لقطة ٠٢٠). */
  function oShow(box){
    try{ if(box && typeof box.scrollIntoView === 'function') box.scrollIntoView({ block: 'nearest' }); }
    catch(e){ if(typeof __swallow === 'function') __swallow(e, 'owner:health-scroll'); }
  }

  // 🩺 فحص النظام (لوحة المالك)
  window.runHealthCheck = async function(){
    const box = document.getElementById('adminHealthBox');
    if(!box) return;
    box.textContent = oT('ownerChecking');
    oShow(box);
    const lines = [];
    const mark = ok => ok ? '✅' : '❌';
    // 1) الصفحات الأساسية
    for(const [name, url] of [[oT('ownerHomePage'),'/'], ['manifest.json','/manifest.json'], ['sw.js','/sw.js']]){
      try{ const r = await fetch(url, {cache:'no-store'}); lines.push(mark(r.ok) + ' ' + name + ' (' + r.status + ')'); }
      catch(e){ lines.push('❌ ' + name + ' (' + oT('ownerConnFail') + ')'); }
    }
    // 2) فحص الخادم (مفاتيح + Blob + أخطاء المستخدمين)
    try{
      const r = await fetch('/api/system?action=health&token=' + (typeof ownerToken === 'function' ? ownerToken() : '') + '', {cache:'no-store'});
      const d = await r.json();
      if(!r.ok) throw new Error(d.error || r.status);
      lines.push(mark(d.redisOk) + ' ' + oT('ownerDbLabel') + (!d.redisOk && d.redisWhy ? ' — ' + oLtr(String(d.redisWhy).slice(0, 200)) : '')); /* v-redis-why */
      const missing = Object.entries(d.envKeys || {}).filter(([,v]) => !v).map(([k]) => k);
      lines.push(missing.length ? ('❌ ' + oT('ownerKeysMissing', { k: oLtr(missing.join(', ')) })) : '✅ ' + oT('ownerKeysAll'));
      if(d.clientErrorsCount > 0){
        lines.push('⚠️ ' + oT('ownerUserErrors', { n: d.clientErrorsCount }));
        /* v-err-date: بلا تاريخ لا نفرق خطأ اليوم عن خطأ الأسبوع الماضي */
        const __fmtD = (iso) => { try{ return iso ? new Date(iso).toLocaleString('en-GB', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : ''; }catch(_){ return ''; } };
        d.clientErrors.slice(0,10).forEach(e => {
          lines.push('   • ' + '\u2066' + String(e.message || '').slice(0,160) + (e.count > 1 ? ' (x' + e.count + ')' : '') + (__fmtD(e.lastSeen) ? ' — ' + __fmtD(e.lastSeen) : '') + '\u2069'); /* v-err-ltr */
          /* v-crash-stack: انهيارات غلاف الأندرويد تُعرض بمكدسها — التشخيص
             يحتاج اسم الصنف والسطر لا الرسالة وحدها. */
          if(/android/i.test(String(e.source || '')) && e.stack){
            String(e.stack).split('\n').slice(0,6).forEach(l => { if(l.trim()) lines.push('     ' + l.trim().slice(0,140)); });
          }
          /* v-vg-ua: أخطاء الكاميرا أيضًا تعرض الجهاز — ووسم OmranApp/N في
             آخر الـua يكشف نسخة تطبيق الأندرويد فنقدّمه قبل القص */
          if(e.ua && /android|visual-guide/i.test(String(e.source || ''))){
            const uaS = String(e.ua);
            const appTag = (uaS.match(/OmranApp\/\d+/) || [])[0] || '';
            lines.push('     📱 ' + (appTag ? appTag + ' — ' : '') + uaS.slice(0,80));
          }
        });
      } else {
        lines.push('✅ ' + oT('ownerUserErrorsNone'));
      }
      /* v-health-split: قياسات مسبار الذاكرة (v-mem-probe) أرقام من جهاز المالك لا أخطاء — بعنوانها، ولا تُحسب ملاحظة. */
      const __fmtT = (iso) => { try{ return iso ? new Date(iso).toLocaleString('en-GB', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : ''; }catch(_){ return ''; } };
      if((d.clientDiag || []).length){
        lines.push('📏 ' + oT('ownerDeviceDiag', { n: d.clientDiag.length }));
        d.clientDiag.forEach(e => { lines.push('   · ' + String(e.message || '').replace(/^v-mem-probe\s*/, '').slice(0,200) + (__fmtT(e.lastSeen) ? ' — ' + __fmtT(e.lastSeen) : '')); });
      }
      /* v-health-srv: أخطاء الخادم نفسها (نداءات النماذج، المسارات) — كانت
         تُسجّل في KV بلا أي نافذة عرض للمالك. v-err-deploy: النشر الحاليّ وحده «ملاحظة»؛ ما قبله يُعرض مطويًّا
         بعنوانه (أُصلح أو لم يتكرّر بعد التحديث) — كانت أخطاء ٢١ سبتمبر وما أُصلح تُعدّ كأنّها الآن. */
      const __srv = d.serverErrors || [];
      const __cur = String(d.deploy || '');
      const __now = __srv.filter(e => !__cur || e.deploy === __cur);
      const __old = __srv.filter(e => __cur && e.deploy !== __cur);
      /* v-err-ltr: السطر التقنيّ (مسار + JSON إنجليزيّ) داخل صندوق يمين-يسار كان يتبعثر («'>>' Uncaught…») — يُعزل يسار-يمين كتلةً واحدة */
      const __srvLine = (e) => '\u2066' + '[' + (e.route || '?') + (e.action ? '/' + e.action : '') + '] ' + String(e.message || '').slice(0,160) + (e.count > 1 ? ' (x' + e.count + ')' : '') + (__fmtT(e.lastAt || e.at) ? ' — ' + __fmtT(e.lastAt || e.at) : '') + '\u2069';
      if(__now.length){
        lines.push('⚠️ ' + oT(__cur ? 'ownerSrvErrorsNow' : 'ownerSrvErrors', { n: __now.length }));
        __now.forEach(e => { lines.push('   • ' + __srvLine(e)); });
      } else {
        lines.push('✅ ' + oT(__cur ? 'ownerSrvNoneSince' : 'ownerSrvNone'));
      }
      if(__old.length){
        lines.push('🗂️ ' + oT('ownerSrvOld', { n: __old.length }));
        __old.forEach(e => { lines.push('   · ' + __srvLine(e)); });
      }
    }catch(e){
      lines.push('❌ ' + oT('ownerSrvCheckFail', { e: oLtr(oErr(e)) }));
    }
    const allOk = !lines.some(l => l.startsWith('❌') || l.startsWith('⚠️'));
    lines.unshift((allOk ? '🟢 ' + oT('ownerSysOk') : '🔴 ' + oT('ownerSysNotes')) + ' — ' + new Date().toLocaleTimeString('en-GB'));
    box.textContent = lines.join('\n');
  };
  window.clearClientErrors = async function(){
    const box = document.getElementById('adminHealthBox');
    /* v-owner-clear-confirm (تدقيق ١٨ أكتوبر): المسح نهائيّ للسجلّين — يسأل أوّلًا كبقيّة أفعال المالك الهدّامة
       (حذف حساب، حذف حسابات الفحص، حذف مفتاح الخزنة). منطق المسح نفسه كما هو. */
    if(!confirm(oT('ownerClearErrorsConfirm'))) return;
    oShow(box);
    try{
      /* v-err-deploy: «مسح سجل الأخطاء» كان يمسح أخطاء المستخدمين وحدها — أخطاء الخادم لا تُمسح من التطبيق أبدًا
         (402 من ٢١ سبتمبر باقٍ). clear=errors في فحص الصحّة يمسح السجلّين معًا (للمالك وحده). */
      const r = await fetch('/api/system?action=health&clear=errors&token=' + (typeof ownerToken === 'function' ? ownerToken() : '') + '', {cache:'no-store'});
      if(box) box.textContent = r.ok ? oT('ownerClearDone') : '❌ ' + oT('ownerClearFail') + ' (' + r.status + ')';
    }catch(e){ if(box) box.textContent = '❌ ' + oT('ownerClearFail') + ': ' + oErr(e); }
  };
  /* v-redis-capacity: «ما يملأ القاعدة» — قياس بالقراءة فقط (SCAN + STRLEN) يعرض العائلات الأكبر وأكبر المفاتيح في صندوق الفحص. */
  window.redisUsageCheck = async function(){
    const box = document.getElementById('adminHealthBox');
    const mb = (n) => (n / 1048576).toFixed(1) + ' ' + oT('ownerMb');
    if(box) box.textContent = oT('ownerUsageRunning');
    oShow(box);
    try{
      const r = await fetch('/api/system?action=health&usage=1&token=' + (typeof ownerToken === 'function' ? ownerToken() : ''), { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if(!r.ok || !d.usage){ if(box) box.textContent = '❌ ' + oT('ownerUsageFail') + ' (' + r.status + ')' + (d && d.message ? ': ' + oLtr(d.message) : ''); return; }
      const u = d.usage;
      const lines = [oT('ownerUsageTotal', { size: mb(u.totalBytes), keys: u.totalKeys }) + (u.truncated ? ' — ' + oT('ownerUsageTrunc', { n: u.scanned }) : ''), '', oT('ownerUsageGroups')];
      (u.groups || []).forEach(function(g){ lines.push('• ' + oLtr(g.prefix) + ' — ' + mb(g.bytes) + ' · ' + oT('ownerUsageKeysN', { n: g.keys })); });
      lines.push('', oT('ownerUsageBiggest'));
      (u.biggest || []).forEach(function(b){ lines.push('• ' + oLtr(b.key) + ' — ' + mb(b.bytes)); });
      if(box) box.textContent = lines.join('\n');
    }catch(e){ if(box) box.textContent = '❌ ' + oT('ownerUsageFail') + ': ' + oErr(e); }
  };
  /* v-cost-meter: «تكلفة المشتركين» — تكلفة كلّ حساب علينا هذا الشهر مجمّعة لكلّ باقة، مقابل ما يدفعه (قراءة فقط). */
  window.subscriberCostsCheck = async function(){
    const box = document.getElementById('adminHealthBox');
    const usd = (n) => (Number(n) || 0).toFixed(2) + '$';
    const NAME = { basic: 'Plus', pro: 'Pro', max: 'Max', free: oT('ownerPlanFree'), vip: 'VIP', owner: oT('ownerPlanOwner') };
    const NET = { basic: 9.41, pro: 19.12, max: 96.80 }; // ما يصلك من الاشتراك الشهريّ بعد رسوم الدفع
    if(box) box.textContent = oT('ownerCostsRunning');
    oShow(box);
    try{
      const r = await fetch('/api/system?action=health&costs=1&token=' + (typeof ownerToken === 'function' ? ownerToken() : ''), { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if(!r.ok || !d.costs){ if(box) box.textContent = '❌ ' + oT('ownerCostsFail') + ' (' + r.status + ')' + (d && d.message ? ': ' + oLtr(d.message) : ''); return; }
      const c = d.costs;
      const lines = [oT('ownerCostsHead', { m: oLtr(c.month) }), oT('ownerCostsTotal', { total: usd(c.total), n: c.users }), ''];
      (c.byPlan || []).forEach(function(g){ lines.push('• ' + oT('ownerCostsPlan', { plan: NAME[g.plan] || oLtr(g.plan), users: g.users, avg: usd(g.avg), max: usd(g.max) }) + (NET[g.plan] ? ' · ' + oT('ownerCostsPays', { net: usd(NET[g.plan]) }) : '')); });
      lines.push('', oT('ownerCostsTop'));
      (c.top || []).forEach(function(u){ lines.push('• ' + oT('ownerCostsUser', { user: oIso(u.user), plan: NAME[u.plan] || oLtr(u.plan), total: usd(u.total), chat: usd(u.chat), media: usd(u.media), voice: usd(u.voice) })); });
      /* v-tokens-meter: نسبة قراءة الكاش في الإنتاج لكلّ مسار (آخر ٧ أيّام) — للمالك وحده بجانب التكلفة */
      const tk = d.tokens, kt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n || 0));
      const LANE = { paid: 'ownerLanePaid', free: 'ownerLaneFree', owner: 'ownerPlanOwner', pro: 'ownerLanePro' };
      if(tk && tk.byLane && tk.byLane.length){
        lines.push('', oT('ownerTokensHead', { d: tk.days }));
        tk.byLane.forEach(function(l){ lines.push('• ' + oT('ownerTokensLine', { lane: LANE[l.lane] ? oT(LANE[l.lane]) : oLtr(l.lane), turns: l.turns, read: l.readPct, input: kt(l.input), write: kt(l.cacheWrite), output: kt(l.output) })); });
      }
      if(box) box.textContent = lines.join('\n');
    }catch(e){ if(box) box.textContent = '❌ ' + oT('ownerCostsFail') + ': ' + oErr(e); }
  };
  /* v-media-purge: «تنظيف التطبيق» عند المالك — يحذف روابط المشاركة الأقدم من ٧ أيّام (الخادم يتحقّق من المالك). */
  window.purgeOldMedia = async function(){
    const btn = document.getElementById('acctCleanupBtnEl');
    if(!confirm('حذف صور وملفّات المشاركة الأقدم من ٧ أيّام؟ روابطها القديمة ستتوقّف — الحسابات والمحادثات لا تُمسّ.')) return;
    const label = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = '⏳ جارِ التنظيف…'; }
    let msg = '';
    try{
      const r = await fetch('/api/system?action=health&purge=media&token=' + (typeof ownerToken === 'function' ? ownerToken() : ''), { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if(r.ok && d && d.purged){
        const p = d.purged, b = p.byPrefix || {}, n = (k) => (b[k] && b[k].deleted) || 0;
        msg = '✅ حُذف ' + p.deleted + ' من ' + p.scanned + ' مفتاحًا\nصور: ' + n('db/img/') + ' · ملفّات: ' + n('db/file/') + ' · PDF: ' + n('db/pdf/');
      } else {
        msg = '❌ فشل التنظيف (' + r.status + ')' + (d && d.message ? ': ' + d.message : '');
      }
    }catch(e){ msg = '❌ فشل التنظيف: ' + e.message; }
    if(btn){ btn.disabled = false; btn.textContent = label; }
    alert(msg);
  };
  function setStatus(text){
    statusEl.style.display = text ? 'block' : 'none';
    statusEl.textContent = text || '';
  }
  /* v-actor-notice (تدقيق ١٨ أكتوبر video-mode-actor «تنبيه «اكتب أول شي…» يطلع فوق خارج الشاشة وما ينشاف»؛ قرار المالك ٢١ أكتوبر «صندوق
     الممثل في الجوال: إذا كان مخرّب أو مغطّى صلّحه، بدون ما تضيف شي جديد»): في الجوال (≤٨٦٠) عمود المعاينة — وفيه سطر الحالة — فوق الحقول،
     فالتنبيه يُكتب فوق الشاشة بمئات البكسلات والمستخدم عند زرّ الإنشاء. التنبيه نفسه يُمرَّر إلى العين؛ nearest لا يحرّك شيئًا حين يُرى (الحاسوب).
     لا في setStatus: تقدّم التوليد يكتب فيه كلّ ثوانٍ فيشدّ المستخدم للأعلى. */
  function showNotice(text){
    setStatus(text);
    try{ if(typeof statusEl.scrollIntoView === 'function') statusEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(e){ __swallow(e, 'video:notice-scroll'); }
  }
  function ensureLongMinutesOption(show){
    longMinutesOpt = document.getElementById('videoMakerDurationLongMinutesOpt');
    if(show){
      if(!longMinutesOpt){
        longMinutesOpt = document.createElement('option');
        longMinutesOpt.value = 'longMinutes';
        longMinutesOpt.id = 'videoMakerDurationLongMinutesOpt';
        longMinutesOpt.setAttribute('data-i18n', 'videoMakerDurationLongMinutes');
        longMinutesOpt.textContent = (typeof t === 'function' ? t('videoMakerDurationLongMinutes') : null) || '🎥 طويل (دقائق) - المالك فقط';
        durationEl.appendChild(longMinutesOpt);
      }
    } else {
      if(longMinutesOpt && longMinutesOpt.parentNode){
        longMinutesOpt.parentNode.removeChild(longMinutesOpt);
      }
      longMinutesOpt = null;
    }
  }

  btnOpen.onclick = () => {
    try{ if(typeof window.__videoTrendsBoot === 'function') window.__videoTrendsBoot(); }catch(e){ try{ __swallow(e,'video:trends-boot'); }catch(_){ typeof __swallow === 'function' && __swallow(_, 'app-11-video:443'); /* guard-ok */ } }
    modal.style.display = 'flex';
    closeHeaderMenu();
    const owner = isOwnerAccount();
    ensureLongMinutesOption(owner);
    if(!owner && durationEl.value === 'longMinutes'){
      durationEl.value = '5';
      durationEl.onchange();
    }
  };

  // v524: فتح صانع الفيديو من المحادثة — يقبل prompt اختياري + صورة hero اختيارية
  window.omranOpenVideoMaker = function(prompt, heroDataUrl, heroMimeType){
    try{ if(typeof window.__videoTrendsBoot === 'function') window.__videoTrendsBoot(); }catch(e){ try{ __swallow(e,'video:trends-boot'); }catch(_){ typeof __swallow === 'function' && __swallow(_, 'app-11-video:456'); /* guard-ok */ } }
    try{
      if(promptEl && prompt) promptEl.value = String(prompt).trim();
      // صورة hero — تُعرض في المعاينة وتُستخدم في الفيلم
      if(heroDataUrl){
        try{
          const prev = document.getElementById('videoMakerHeroPreview');
          const clr  = document.getElementById('videoMakerHeroClear');
          const heroRowEl = document.getElementById('videoMakerHeroRow');
          filmHeroBase64 = heroDataUrl.indexOf(',') !== -1 ? heroDataUrl.split(',')[1] : heroDataUrl;
          filmHeroMime   = heroMimeType || 'image/jpeg';
          if(prev){ prev.src = heroDataUrl; prev.style.display = 'inline-block'; }
          if(clr)  { clr.style.display = 'inline-block'; }
          if(heroRowEl){ syncFilmHeroRow(); } /* v-video-photo-identity: حسب الوضع لا إظهار أعمى */
          applyHeroRatioFromDataUrl(heroDataUrl);
          // v525: عند وجود صورة → واقعي تلقائياً لأن الأنيمي يُضيّع تفاصيل الصورة الأصلية
          if(styleEl && styleEl.value !== 'realistic') styleEl.value = 'realistic';
        }catch(he){ try{ __swallow(he,'video:open-hero'); }catch(_){ typeof __swallow === 'function' && __swallow(_, 'app-11-video:473'); /* guard-ok */ } }
      }
      /* v-vmk-chat-tab (تدقيق ١٨–١٩ أكتوبر): نصّ أو صورة من المحادثة مكانهما قسم الوضع (الوصف وصورة البطل) — كان يُفتح على «الترندات» وهما
         مخفيّان. video.js يقرأ العلامة عند الفتح مرّة ويمحوها؛ بلا نصّ ولا صورة (ترندات المحادثة، مها) يبقى على الترندات */
      /* v-video-durations: وضع للمالك وحده كان يفتح غير المالك على الترندات والوصف مخفيّ — قسمه الافتراضيّ «فيديو سريع» (v-five-sections) */
      if((prompt && String(prompt).trim()) || heroDataUrl){ if(modal.style.display !== 'flex'){ const om = (modeEl && modeEl.value) || 'minimax'; modal.dataset.vmkTab = (!isOwnerAccount() && { runway:1, canvas:1, omni:1, hybrid:1, actor:1 }[om]) ? 'minimax' : om; } }
      modal.style.display = 'flex';
      try{ closeHeaderMenu(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:480'); /* guard-ok — closeHeaderMenu اختيارية */ }
      const owner = isOwnerAccount();
      ensureLongMinutesOption(owner);
      if(!owner && durationEl.value === 'longMinutes'){
        durationEl.value = '5';
        if(typeof durationEl.onchange === 'function') durationEl.onchange();
      }
    }catch(e){ try{ __swallow(e,'video:open-from-chat'); }catch(_){ typeof __swallow === 'function' && __swallow(_, 'app-11-video:487'); /* guard-ok */ } }
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  /* v-video-photo-identity (المالك: «الفيديوات عامّة تغيّر الأشكال… مش ترندات، في الفيديوات العاديّة»):
     (١) كانت كلّ نقرة على وضع كانفا/المحترف/الممثّل تمسح صورة البطل المحفوظة نهائيًّا بلا إشعار — الآن
     تُخفى في كانفا وحده (لا يستعمل صورًا) وتبقى محفوظة. (٢) «المحترف لا يقبل صورًا» خطأ قديم: خادمه
     يحرّك الصورة إطارًا أوّل (veo-create: instance.image) — فالصورة تُرسل له وللممثّل أيضًا. */
  function syncFilmHeroRow(){
    const heroRowEl = document.getElementById('videoMakerHeroRow');
    const noteEl = document.getElementById('videoMakerHeroVeoNote');
    const heroSupported = (modeEl.value !== 'canvas');
    if(heroRowEl) heroRowEl.style.display = heroSupported ? 'block' : 'none';
    if(noteEl) noteEl.style.display = 'none';
  }
  /* v-video-photo-identity: المحرّك يقصّ الصورة من وسطها إلى نسبة الفيديو المطلوبة، والنسبة الافتراضيّة
     عرضيّة — فصورة جوّال طوليّة (سيلفي/وقوف كامل) تفقد أعلاها وأسفلها، والوجه غالبًا في الأعلى، فيخترع
     المحرّك وجهًا بدل وجه مقصوص. النسبة تتبع اتّجاه الصورة لحظة اختيارها (ظاهرة في الواجهة، ويغيّرها
     المستخدم إن شاء): الطوليّة والمربّعة ⇒ ٩:١٦ (القصّ من الجانبين لا من الرأس)، والعرضيّة ⇒ ١٦:٩. */
  function heroRatioFor(w, h){ return (h >= w) ? '720:1280' : '1280:720'; }
  function applyHeroRatio(w, h){
    if(!ratioEl || !(w > 0) || !(h > 0)) return;
    const want = heroRatioFor(w, h);
    if(ratioEl.value === want) return;
    ratioEl.value = want;
    try{ ratioEl.dispatchEvent(new Event('change')); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:513'); /* guard-ok — مزامنة حبّات العرض ترف */ }
  }
  function applyHeroRatioFromDataUrl(dataUrl){
    try{
      const probe = new Image();
      probe.onload = () => applyHeroRatio(probe.naturalWidth || probe.width, probe.naturalHeight || probe.height);
      probe.src = dataUrl;
    }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:520'); /* guard-ok — بلا أبعاد تبقى النسبة كما اختارها المستخدم */ }
  }
  // 📋 معاينة وتعديل السيناريو قبل التوليد
  function showScriptPreview(title, scenes){
    return new Promise(resolve => {
      const modal = document.getElementById('videoMakerModal');
      const wrap = modal ? modal.querySelector('div') : null;
      if(!wrap){ resolve(scenes); return; }
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;z-index:20;background:var(--bg,#111);overflow-y:auto;padding:16px;border-radius:inherit;';
      let html = `<h4 style="margin:0 0 10px;text-align:center;">📋 ${bT('راجع مشاهد الفيلم','Review Scenes')}</h4>`;
      html += `<p style="font-size:12px;color:var(--muted);margin-bottom:10px;">${bT('عدّل أو احذف أي مشهد قبل البدء — كل مشهد = كريدت واحد.','Edit or delete scenes before generating. Each scene = 1 video credit.')}</p>`;
      scenes.forEach((sc, i) => {
        html += `<div class="sp-scene" data-idx="${i}" style="margin-bottom:10px;border:1px solid rgba(139,92,246,.35);border-radius:8px;padding:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <b style="font-size:12px;">${bT('مشهد','Scene')} ${i+1}</b>
            <button type="button" class="sp-del" style="background:rgba(239,68,68,.15);border:none;color:#ef4444;border-radius:6px;padding:2px 10px;cursor:pointer;font-size:12px;">${bT('حذف','Remove')}</button>
          </div>
          <textarea rows="2" class="sp-txt" style="width:100%;font-size:12px;resize:none;box-sizing:border-box;">${(sc.visual||'').replace(/</g,'&lt;')}</textarea>
        </div>`;
      });
      html += `<div style="display:flex;gap:10px;justify-content:center;margin-top:12px;">
        <button type="button" id="spCancel" style="padding:8px 20px;border-radius:10px;background:rgba(239,68,68,.15);color:#ef4444;border:none;cursor:pointer;">${bT('❌ إلغاء','❌ Cancel')}</button>
        <button type="button" id="spGo" style="padding:8px 20px;border-radius:10px;background:rgba(139,92,246,.8);color:#fff;border:none;cursor:pointer;font-weight:bold;">${bT('✨ ابدأ التوليد','✨ Generate')}</button>
      </div>`;
      overlay.innerHTML = html;
      wrap.style.position = 'relative';
      wrap.appendChild(overlay);
      overlay.addEventListener('click', e => {
        const del = e.target.closest('.sp-del');
        if(del){ const row = del.closest('.sp-scene'); if(row){ row.style.opacity='.3'; row.style.pointerEvents='none'; row.dataset.deleted='1'; } }
      });
      overlay.querySelector('#spCancel').onclick = () => { overlay.remove(); resolve(null); };
      overlay.querySelector('#spGo').onclick = () => {
        const out = [];
        overlay.querySelectorAll('.sp-scene').forEach((row, i) => {
          if(row.dataset.deleted) return;
          const txt = row.querySelector('.sp-txt');
          out.push({ ...scenes[i], visual: (txt ? txt.value.trim() : '') || scenes[i].visual });
        });
        overlay.remove();
        resolve(out.length ? out : null);
      };
    });
  }

  /* v-video-modes-by-result (١٠ أكتوبر ٢٠٢٦): وضع «الدمج» خرج من القائمة وصار مربّع «مقدّمة وخاتمة بتوقيعك» يظهر لأوضاع
     الذكاء (سريع/جودة عالية/سينمائيّ) ويلتفّ بمقدّمة وخاتمة الكانفا حول لقطة المحرّك المختار (wrapWithCanvas). */
  const wrapRow = document.getElementById('videoMakerWrapRow');
  const wrapToggle = document.getElementById('videoMakerWrapToggle');
  function isAiMode(m){ return m === 'minimax' || m === 'runway' || m === 'veo'; }
  function wantCanvasWrap(){ return isAiMode(modeEl.value) && !!(wrapToggle && wrapToggle.checked); }
  function updateModeUI(){
    const m = modeEl.value;
    if(wrapRow) wrapRow.style.display = isAiMode(m) ? 'flex' : 'none';
    /* v-video-durations: التعليق الصوتيّ يُدمج في «جودة عالية» و«بدون ذكاء»، وفي غيرهما مع «مقدّمة وخاتمة» وحدها — كان ظاهرًا
       في «سريع» و«سينمائي» و«ممثل» ولا يُطبَّق (والسينمائيّ والممثّل بصوتهما) */
    const narrOk = m === 'runway' || m === 'canvas' || m === 'hybrid' || wantCanvasWrap();
    const narrLab = narrationToggle && narrationToggle.closest('label');
    if(narrLab) narrLab.style.display = narrOk ? '' : 'none';
    if(!narrOk && narrationToggle && narrationToggle.checked){ narrationToggle.checked = false; if(typeof narrationToggle.onchange === 'function') narrationToggle.onchange(); }
    signatureRow.style.display = (m === 'canvas' || m === 'hybrid' || wantCanvasWrap()) ? 'flex' : 'none';
    const actorRowEl = document.getElementById('videoMakerActorRow');
    if(actorRowEl) actorRowEl.style.display = (m === 'actor') ? 'flex' : 'none';
    const actorVoiceRowEl = document.getElementById('videoMakerActorVoiceRow'); /* v-actor-lipsync */
    if(actorVoiceRowEl) actorVoiceRowEl.style.display = (m === 'actor') ? 'block' : 'none';
    syncFilmHeroRow();
  }
  modeEl.onchange = updateModeUI;
  if(wrapToggle) wrapToggle.onchange = updateModeUI;
  updateModeUI();

  narrationToggle.onchange = () => {
    narrationText.style.display = narrationToggle.checked ? 'block' : 'none';
    const narrationRowEl0 = document.getElementById('videoMakerNarrationRow');
    if(narrationRowEl0) narrationRowEl0.style.display = narrationToggle.checked ? 'flex' : 'none';
    const genderRowEl = document.getElementById('videoMakerVoiceGenderRow');
    if(genderRowEl) genderRowEl.style.display = narrationToggle.checked ? 'flex' : 'none';
  };
  durationEl.onchange = () => {
    const dv = durationEl.value;
    const isLong = dv === 'long20';
    const isLongMinutes = dv === 'longMinutes';
    const isFilm = dv === 'film';
    const isAd    = dv === 'adspot';
    const isReels = dv === 'reels';

    // وضع الإعلان السريع: 9:16 + سرد + واقعي
    if(isAd || isReels){
      const ratioEl = document.getElementById('videoMakerRatio');
      if(ratioEl) ratioEl.value = '720:1280'; // طولي
      const styleEl = document.getElementById('videoMakerStyle');
      if(isAd && styleEl) styleEl.value = 'realistic';
      narrationToggle.checked = true;
      narrationToggle.disabled = false;
      narrationText.style.display = 'block';
      const narRow = document.getElementById('videoMakerNarrationRow');
      if(narRow) narRow.style.display = 'flex';
      const gRow = document.getElementById('videoMakerVoiceGenderRow');
      if(gRow) gRow.style.display = 'flex';
    }

    if(isLong || isLongMinutes || isFilm){
      qualityToggle.checked = false;
      qualityToggle.disabled = true;
      qualityRow.style.opacity = '0.5';
    } else {
      qualityToggle.disabled = false;
      qualityRow.style.opacity = '1';
    }
    longMinutesRow.style.display = isLongMinutes ? 'block' : 'none';
    syncFilmHeroRow();
    if(isLongMinutes || isFilm){
      narrationToggle.checked = false;
      narrationToggle.disabled = true;
      narrationText.style.display = 'none';
    } else if(!isAd && !isReels){
      narrationToggle.disabled = false;
    }
  };

  // Lazily loads ffmpeg.wasm (browser-side video processing) only when the
  // user actually requests scene-chaining or narration — most single-scene,
  // no-narration videos never need this, keeping the feature lightweight.
  let ffmpegInstance = null;
  /* v-ai-video-speed: التحميل يبدأ مبكّرًا بالتوازي مع الفيديو، فنداءان متزامنان ينتظران الوعد نفسه لا تحميلين (٣١ ميغا) */
  let ffmpegLoading = null;
  function getFFmpeg(){
    if (ffmpegInstance) return Promise.resolve(ffmpegInstance);
    if (!ffmpegLoading) ffmpegLoading = loadFFmpeg().catch((e) => { ffmpegLoading = null; throw e; });
    return ffmpegLoading;
  }
  async function loadFFmpeg(){
    const { FFmpeg } = await import('/ffmpeg/lib/index.js');
    const ffmpeg = new FFmpeg();
    try{
      await Promise.race([
        ffmpeg.load({
          coreURL: '/ffmpeg/core/ffmpeg-core.js',
          wasmURL: '/ffmpeg/core/ffmpeg-core.wasm',
          classWorkerURL: '/ffmpeg/lib/worker.js',
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('ffmpeg load timeout')), 90000)),
      ]);
    } catch(e){
      try{ ffmpeg.terminate(); }catch(e2){ __swallow(e2, 'video:ff-terminate'); } /* v-ai-video-speed: لا عاملين حيّين بعد مهلة التحميل المسبق */
      throw e;
    }
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  }

  window.__omranConcatScenes = function(urls){ return concatScenes(urls); }; /* v-video-trends: دمج مشاهد القصة */

  /* v-chat-ad-video (المالك ١٦ نوفمبر: «أحطّ حذاء ويطلع تصميم ٥ أو ١٠ ثواني… مع الصوت، وضيف الكتابة والاسم»): يُكمل فيديو إعلان المحادثة.
     الاسم والسطر يُرسمان على لوحة بمقاس الفيديو نفسه (حروف حادّة بأيّ لغة — CLAUDE.md: لا كتابة داخل الصورة المولَّدة) ويُركَّبان بـffmpeg
     من ٠٫٤ ث، والتعليق بصوت مها (/api/tts كتعليق صانع الفيديو، بجنسه وسرعته) يُدمج بطول الفيديو. كلّ خطوة مستقلّة: فشل الصوت يُبقي
     الكتابة، وفشل الكتابة يُبقي الصوت؛ لا شيء منهما = null فيبقى الأصليّ. يعيد { url, blob, text, voice }. */
  function adClip(s, n){ return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
  function videoDims(blob){
    return new Promise((resolve) => {
      const v = document.createElement('video'), u = URL.createObjectURL(blob);
      const done = (d) => { try{ URL.revokeObjectURL(u); }catch(e){ __swallow(e, 'video:ad-dims-revoke'); } resolve(d); };
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => done({ w: v.videoWidth || 1280, h: v.videoHeight || 720 });
      v.onerror = () => done({ w: 1280, h: 720 });
      setTimeout(() => done({ w: v.videoWidth || 1280, h: v.videoHeight || 720 }), 8000);
      v.src = u;
    });
  }
  /** لوحة شفّافة بمقاس الفيديو: تدرّج داكن في الأسفل، الاسم عريض أبيض، والسطر ذهبيّ تحته؛ يصغر الخطّ حتّى يتّسع، وسطران للاسم الطويل. */
  async function makeAdOverlayPng(title, line, w, h){
    try{ if(document.fonts && document.fonts.ready) await document.fonts.ready; }catch(e){ __swallow(e, 'video:ad-fonts'); }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const base = Math.min(w, h), maxW = w * 0.88, rtl = /[؀-ۿ]/.test(title + line);
    x.direction = rtl ? 'rtl' : 'ltr'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    const fit = (txt, size, min, weight) => { let s = size; x.font = weight + ' ' + s + 'px ' + CANVAS_FONT; while(s > min && x.measureText(txt).width > maxW){ s -= 2; x.font = weight + ' ' + s + 'px ' + CANVAS_FONT; } return s; };
    const wrap = (txt) => { const ws = txt.split(' '); if(ws.length < 2 || x.measureText(txt).width <= maxW) return [txt]; let best = 1, bw = Infinity; for(let i = 1; i < ws.length; i++){ const m = Math.max(x.measureText(ws.slice(0, i).join(' ')).width, x.measureText(ws.slice(i).join(' ')).width); if(m < bw){ bw = m; best = i; } } return [ws.slice(0, best).join(' '), ws.slice(best).join(' ')]; };
    let tSize = 0, tLines = [], lSize = 0;
    if(title){ tSize = fit(title, Math.round(base * 0.095), Math.round(base * 0.06), '800'); tLines = wrap(title); if(tLines.length > 1) tSize = Math.max(Math.round(base * 0.06), Math.min(...tLines.map((l) => fit(l, tSize, Math.round(base * 0.05), '800')))); }
    if(line){ lSize = fit(line, Math.round(base * 0.055), Math.round(base * 0.035), '700'); }
    const gap = Math.round(base * 0.025), pad = Math.round(h * 0.06);
    const blockH = tLines.length * tSize * 1.15 + (line ? lSize * 1.2 + (title ? gap : 0) : 0);
    const top = h - pad - blockH;
    const g = x.createLinearGradient(0, Math.max(0, top - h * 0.12), 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0.8)');
    x.fillStyle = g; x.fillRect(0, Math.max(0, top - h * 0.12), w, h - Math.max(0, top - h * 0.12));
    x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = Math.round(base * 0.012); x.shadowOffsetY = Math.round(base * 0.004);
    let y = top;
    if(title){ x.font = '800 ' + tSize + 'px ' + CANVAS_FONT; x.fillStyle = '#ffffff'; for(const l of tLines){ y += tSize * 1.15; x.fillText(l, w / 2, y - tSize * 0.15); } }
    if(line){ y += (title ? gap : 0) + lSize * 1.2; x.font = '700 ' + lSize + 'px ' + CANVAS_FONT; x.fillStyle = '#FFD36B'; x.fillText(line, w / 2, y - lSize * 0.2); }
    return await new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
  }
  async function overlayAdText(videoBlob, pngBlob){
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');
    const rm = async (n) => { try{ await ffmpeg.deleteFile(n); }catch(e){ __swallow(e, 'video:ad-clean'); } };
    try{
      await ffmpeg.writeFile('adin.mp4', await fetchFile(videoBlob));
      await ffmpeg.writeFile('adov.png', await fetchFile(pngBlob));
      if(await ffmpeg.exec(['-i', 'adin.mp4', '-i', 'adov.png', '-filter_complex', "[0:v][1:v]overlay=0:0:enable='gte(t,0.4)'", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', 'adout.mp4'], 180000) !== 0) throw new Error('ad overlay failed');
      const data = await ffmpeg.readFile('adout.mp4');
      return new Blob([data.buffer], { type: 'video/mp4' });
    } finally {
      for(const f of ['adin.mp4', 'adov.png', 'adout.mp4']) await rm(f);
    }
  }
  window.__omranAdFinish = async function(videoUrl, o){
    o = o || {};
    const title = adClip(o.title, 60), line = adClip(o.text, 90), voice = cleanNarrationText(adClip(o.voice, 260));
    if(!title && !line && !voice) return null;
    let blob = await proxyBlob(videoUrl), text = false, voiced = false;
    if(title || line){
      try{
        const d = await videoDims(blob);
        blob = await overlayAdText(blob, await makeAdOverlayPng(title, line, d.w, d.h));
        text = true;
      }catch(e){ __swallow(e, 'video:ad-text'); }
    }
    if(voice){
      try{
        const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: voice, voice: 'maha', lang: narrLang(voice), gender: getNarrationGender(), speed: getNarrationSpeed(), token: ttsAuthToken(), guestId: ttsGuestId() }) });
        if(r.ok){ blob = await muxNarrationAny(blob, await r.blob(), false); voiced = true; }
      }catch(e){ __swallow(e, 'video:ad-voice'); }
    }
    if(!text && !voiced) return null;
    return { url: URL.createObjectURL(blob), blob, text, voice: voiced };
  };
  window.__omranAdOverlayPng = makeAdOverlayPng; /* للتحقّق البصريّ (scripts/ui-shot.mjs --eval) */
  async function concatScenes(urls){
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');
    const rm = async (n) => { try{ await ffmpeg.deleteFile(n); } catch(e){ __swallow(e, "misc:app-11-video#1"); } };
    let listTxt = '';
    for(let i = 0; i < urls.length; i++){
      const name = 'scene' + i + '.mp4';
      await ffmpeg.writeFile(name, await fetchFile(await proxyBlob(urls[i])));
      listTxt += "file '" + name + "'\n";
    }
    await ffmpeg.writeFile('list.txt', listTxt);
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'out.mp4']);
    for(let i = 0; i < urls.length; i++) await rm('scene' + i + '.mp4');
    await rm('list.txt');
    const data = await ffmpeg.readFile('out.mp4');
    await rm('out.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  let muxN = 0;
  async function muxNarration(videoSrc, audioBlob){
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');
    /* v-ai-video-speed: أسماء ملفّات لكلّ دمج — ترقية الخلفية قد تدمج والطلب التالي يدمج على النسخة نفسها من المحرّك */
    const n = ++muxN, v = 'mxv' + n + '.mp4', a = 'mxa' + n + '.mp3', o = 'mxo' + n + '.mp4';
    try{
      await ffmpeg.writeFile(v, await fetchFile(videoSrc));
      await ffmpeg.writeFile(a, await fetchFile(audioBlob));
      /* v-video-partial: apad + shortest كـmuxNarrationAny — تعليق أطول من المقطع كان يمدّ الملفّ بإطار متجمّد */
      await ffmpeg.exec(['-i', v, '-i', a, '-c:v', 'copy', '-af', 'apad', '-map', '0:v:0', '-map', '1:a:0', '-shortest', o]);
      const data = await ffmpeg.readFile(o);
      return new Blob([data.buffer], { type: 'video/mp4' });
    } finally {
      for(const f of [v, a, o]){ try{ await ffmpeg.deleteFile(f); }catch(e){ __swallow(e, 'video:mux-clean'); } }
    }
  }

  // Builds one long final video out of many {videoUrl, audioBlob} scenes:
  // muxes each scene's own narration onto its own visuals first (so the
  // narration stays in sync per-scene), then concatenates all the muxed
  // scenes together into a single continuous video. Used only by the
  // owner-only "long video" (multi-minute) feature.
  async function buildLongVideo(scenes, onProgress){
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');
    const rm = async (n) => { try{ await ffmpeg.deleteFile(n); } catch(e){ __swallow(e, "misc:app-11-video#2"); } };
    let listTxt = '';
    for(let i = 0; i < scenes.length; i++){
      if(onProgress) onProgress(i, scenes.length);
      await ffmpeg.writeFile('v' + i + '.mp4', await fetchFile(await proxyBlob(scenes[i].videoUrl)));
      const hasAudio = scenes[i].audioBlob && scenes[i].audioBlob.size > 0;
      if(hasAudio){
        await ffmpeg.writeFile('a' + i + '.mp3', await fetchFile(scenes[i].audioBlob));
        await ffmpeg.exec(['-i', 'v' + i + '.mp4', '-i', 'a' + i + '.mp3', '-c:v', 'copy', '-af', 'apad', '-map', '0:v:0', '-map', '1:a:0', '-shortest', 'm' + i + '.mp4']); /* v-video-partial: مدد المشاهد لا تنحرف قبل الدمج */
        await rm('a' + i + '.mp3');
      } else {
        await ffmpeg.exec(['-i', 'v' + i + '.mp4', '-c', 'copy', 'm' + i + '.mp4']);
      }
      // Free memory scene-by-scene so phones don't run out of RAM and crash.
      await rm('v' + i + '.mp4');
      listTxt += "file 'm" + i + ".mp4'\n";
    }
    await ffmpeg.writeFile('list.txt', listTxt);
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'outlong.mp4']);
    for(let i = 0; i < scenes.length; i++) await rm('m' + i + '.mp4');
    await rm('list.txt');
    const data = await ffmpeg.readFile('outlong.mp4');
    await rm('outlong.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  function pollTaskOnce(id, quiet){
    return new Promise((resolve, reject) => {
      const guard = makePollGuard(reject, 5000);
      const iv = setInterval(async () => {
        if(!guard.tick(iv)) return;
        try{
          const res = await fetch('/api/video-status?id=' + encodeURIComponent(id));
          const data = await res.json();
          /* v-ai-video-speed: خطأ الاستطلاع عابر في الغالب (مهلة، ٥xx) — كان يرمي المهمّة الجارية فيُنشئ createSceneWithRetry مهمّة جديدة
             من الصفر (+٧٠ ث محاكاةً، وتذكرة ثانية). الآن يُعدّ كعطب شبكة على المهمّة نفسها: ستّ مرّات متتالية ثمّ رسالة صريحة. */
          if(data.error){
            /* v-credit-out: المزوّد رفض الاستطلاع لعطب عندنا (رصيده نفد…) — الخادم سوّى التذكرة وردّ النقاط؛ لا انتظار ولا مهمّة جديدة تخصم */
            if(data.error === 'unavailable'){ clearInterval(iv); reject(Object.assign(new Error('unavailable'), { code: 'unavailable', retryable: false })); return; }
            if(res.status >= 500 || res.status === 429){ guard.fail(iv, data.error); return; }
            clearInterval(iv); reject(new Error(data.error)); return; /* 4xx نهائيّ (مهمّة مجهولة…) لا يُنتظر ٣٠ ث */
          }
          guard.ok();
          if(data.status === 'SUCCEEDED'){
            clearInterval(iv);
            resolve(Array.isArray(data.output) ? data.output[0] : data.output);
          } else if(data.status === 'FAILED'){
            clearInterval(iv);
            let reason = data.failure || data.failureCode || (data.error) || '';
            const moderated = /moderation|SAFETY|content did not pass/i.test(reason);
            if(moderated){
              reason = bT('الرقابة رفضت المحتوى — جرّب وصفًا أهدأ (بدون عنف أو خطر)، أو شِل صورة الشخص وحاول من جديد.','Content was rejected by safety filters — try a calmer description, or remove the person photo.');
            }
            /* v-ai-video-speed: رفض الرقابة يتكرّر للطلب نفسه — لا يُعاد مرّتين بلا فائدة (noRetry) */
            reject(Object.assign(new Error((bT('فشل إنشاء الفيديو.','Video generation failed.')) + (reason ? (' — ' + reason) : '')), { noRetry: moderated }));
          } else if(data.status === 'CANCELLED'){
            /* v-ai-video-speed: الملغاة نهائيّة — كانت تُستطلع ربع ساعة حتّى الحارس ثمّ تُعاد مرّتين (٤٥ دقيقة محاكاةً) */
            clearInterval(iv);
            reject(Object.assign(new Error(bT('أُلغي الفيديو عند المحرّك — أعد المحاولة.','The video was cancelled by the engine — please try again.')), { code: 'cancelled' }));
          } else if(!quiet){
            setStatus((bT('⏳ الحالة: ','⏳ Status: ')) + (data.status || '...'));
          }
        } catch(e){ guard.fail(iv); }
      }, 5000);
    });
  }

  const SCENE_SECONDS_CONST = 10;

  /* ----- 🎨 Canvas-only clip engine (no AI, free, runs entirely in-browser) ----- */
  function ratioDims(ratio){
    return ratio === '720:1280' ? { w: 720, h: 1280 } : { w: 1280, h: 720 };
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight){
    const words = String(text).split(/\s+/);
    let line = '';
    const lines = [];
    for(const word of words){
      const test = line ? line + ' ' + word : word;
      if(ctx.measureText(test).width > maxWidth && line){
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if(line) lines.push(line);
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
  }

  /* v-canvas-font: «sans-serif» يقع على خطّ أحاديّ العرض في بعض الأجهزة فتتفكّك الحروف العربيّة في فيديو القوالب —
     Tajawal محمّل أصلًا في الموقع (Google Fonts)، ننتظر مجموعة الحروف العربيّة منه (مهلة ٢٫٥ث) قبل الرسم */
  const CANVAS_FONT = "Tajawal, 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif";
  function canvasFontsReady(text){
    try{
      if(!document.fonts || !document.fonts.load) return Promise.resolve();
      const sample = String(text || '') + ' عربي';
      return Promise.race([
        Promise.all([document.fonts.load('bold 40px Tajawal', sample), document.fonts.load('40px Tajawal', sample)]),
        new Promise((r) => setTimeout(r, 2500)),
      ]).catch((e) => { __swallow(e, 'video:canvas-font'); });
    }catch(e){ __swallow(e, 'video:canvas-font'); return Promise.resolve(); }
  }

  function recordCanvasClip({ title, signature, seconds, ratio }){
    return canvasFontsReady(String(title || '') + ' ' + String(signature || '')).then(() => new Promise((resolve, reject) => {
      const { w, h } = ratioDims(ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(30);
      let mimeType = 'video/webm;codecs=vp9';
      if(!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
      if(!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
      let recorder;
      try{ recorder = new MediaRecorder(stream, { mimeType }); }
      catch(e){ recorder = new MediaRecorder(stream); }
      const chunks = [];
      recorder.ondataavailable = (e) => { if(e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      recorder.onerror = (e) => reject((e && e.error) || new Error('recorder error'));
      const start = performance.now();
      let raf;
      function draw(){
        const elapsed = (performance.now() - start) / 1000;
        const hue = (elapsed * 40) % 360;
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, 'hsl(' + hue + ',70%,18%)');
        grad.addColorStop(1, 'hsl(' + ((hue + 80) % 360) + ',70%,10%)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        for(let i = 0; i < 14; i++){
          const px = (w * ((i * 71) % 100) / 100) + Math.sin(elapsed + i) * 20;
          const py = (h * ((i * 37) % 100) / 100) + Math.cos(elapsed * 0.7 + i) * 20;
          const r = 30 + 10 * Math.sin(elapsed * 2 + i);
          const pgrad = ctx.createRadialGradient(px, py, 0, px, py, r);
          pgrad.addColorStop(0, 'rgba(255,255,255,0.10)');
          pgrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = pgrad;
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
        }
        if(title){
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.font = 'bold ' + Math.round(w * 0.045) + 'px ' + CANVAS_FONT;
          wrapCanvasText(ctx, title, w / 2, h / 2, w * 0.8, Math.round(w * 0.06));
        }
        if(signature){
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.textAlign = 'center';
          ctx.font = Math.round(w * 0.028) + 'px ' + CANVAS_FONT;
          ctx.fillText(signature, w / 2, h - h * 0.08);
        }
        raf = requestAnimationFrame(draw);
      }
      draw();
      recorder.start();
      setTimeout(() => {
        cancelAnimationFrame(raf);
        recorder.stop();
      }, Math.max(800, seconds * 1000));
    }));
  }

  function makeWatermarkPng(signature, ratio){
    return new Promise((resolve) => {
      const { w } = ratioDims(ratio);
      const barH = Math.round(w * 0.06);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = barH;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = Math.round(barH * 0.5) + 'px ' + CANVAS_FONT;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      const textW = ctx.measureText(signature).width + 24;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(canvas.width - textW - 10, barH * 0.15, textW, barH * 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(signature, canvas.width - 20, barH / 2);
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  async function muxNarrationAny(videoSrc, audioBlob, isWebmSource){
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');
    const inName = isWebmSource ? 'vin.webm' : 'vin.mp4';
    await ffmpeg.writeFile(inName, await fetchFile(videoSrc));
    await ffmpeg.writeFile('ain.mp3', await fetchFile(audioBlob));
    /* v-canvas-mux-fast: إعادة ترميز libx264 داخل المتصفّح (خيط واحد) كانت تعلق دقائق عند «جاري دمج الصوت» لفيديو القوالب —
       الآن ننسخ صورة WebM كما هي ونضيف الصوت (opus) بأقلّ من ثانية؛ ترميز ultrafast احتياط فقط، وكلّ خطوة لها مهلة.
       apad + shortest: الفيديو يبقى بالمدّة المختارة (كان تعليق ٥ث يقصّ فيديو ١٠ث إلى ٥ث) والتعليق الأطول يُقصّ عند نهايته */
    const rm = async (n) => { try{ await ffmpeg.deleteFile(n); }catch(e){ __swallow(e, 'video:mux-any-clean'); } };
    try{
      if(isWebmSource){
        if(await ffmpeg.exec(['-i', inName, '-i', 'ain.mp3', '-c:v', 'copy', '-c:a', 'libopus', '-af', 'apad', '-map', '0:v:0', '-map', '1:a:0', '-shortest', 'muxout.webm'], 60000) === 0){
          const w = await ffmpeg.readFile('muxout.webm');
          if(w && w.length > 1000) return new Blob([w.buffer], { type: 'video/webm' });
        }
      }
      const vcodec = isWebmSource ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy'];
      if(await ffmpeg.exec(['-i', inName, '-i', 'ain.mp3', ...vcodec, '-af', 'apad', '-map', '0:v:0', '-map', '1:a:0', '-shortest', 'muxout.mp4'], 180000) !== 0) throw new Error('mux failed');
      const data = await ffmpeg.readFile('muxout.mp4');
      return new Blob([data.buffer], { type: 'video/mp4' });
    } finally {
      for(const f of [inName, 'ain.mp3', 'muxout.webm', 'muxout.mp4']) await rm(f);
    }
  }

  async function runCanvasOnly(text, ratio, seconds, signature, wantNarration, narrationVal){
    setStatus(bT('🎨 جاري إنشاء فيديو القوالب...','🎨 Rendering template video...')); /* v-no-provider-names: لا اسم مزوّد/أداة في نصّ يراه المستخدم */
    const clipBlob = await recordCanvasClip({ title: text, signature, seconds, ratio });
    let finalBlob = clipBlob;
    if(wantNarration){
      try{
        setStatus(bT('🎙️ جاري إنشاء التعليق الصوتي...','🎙️ Generating narration...'));
        const narrationInput = narrationVal || text;
        const ttsRes = await fetch('/api/tts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanNarrationText(narrationInput), voice: 'maha', lang: narrLang(narrationInput), gender: getNarrationGender(), speed: getNarrationSpeed(), token: ttsAuthToken(), guestId: ttsGuestId() }), /* v-audit-video (cli-video-2): الحساب لا عنوان IP */
        });
        if(ttsRes.ok){
          const audioBlob = await ttsRes.blob();
          setStatus(bT('🎚️ جاري دمج الصوت...','🎚️ Merging narration...'));
          finalBlob = await muxNarrationAny(clipBlob, audioBlob, true);
        }
      } catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:947'); /* keep silent clip on failure */ }
    }
    const finalUrl = URL.createObjectURL(finalBlob);
    setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
    resultEl.src = finalUrl;
    resultEl.style.display = 'block';
    downloadEl.href = finalUrl;
    downloadEl.download = dlName('omran-ai-video', finalBlob.type); // v-vmk-dl-ext
    downloadEl.style.display = 'block';
    autoSaveVideo(finalUrl);
  }

  async function runHybrid(text, style, ratio, durationVal, signature, token, wantNarration, narrationVal){
    const seconds = (durationVal === 'long20') ? 10 : (parseInt(durationVal, 10) || 5);
    setStatus(bT('🚀 جاري إرسال الطلب لمحرك الفيديو الذكي...','🚀 Sending request to the AI video engine...'));
    /* v-video-photo-identity: وضع الدمج يُظهر خانة صورة البطل لكنّه كان لا يرسلها — فيخترع المحرّك شخصًا. */
    const mainUrl = await createSceneWithRetry(text, style, seconds, ratio, token, false, (attempt, max) => {
      setStatus(busyRetryText(attempt, max)); // v-audit-video (cli-video-6)
    }, filmHeroBase64, filmHeroMime);
    await wrapWithCanvas(mainUrl, text, ratio, signature, wantNarration, narrationVal);
  }

  /* v-video-modes-by-result: «مقدّمة وخاتمة بتوقيعك» — ما كان وضع «الدمج» يفعله بعد لقطة المحرّك الأساسيّ صار يعمل على لقطة
     أيّ محرّك ذكاء (رابط أو Blob): مقدّمة كانفا بالعنوان + اللقطة (+ علامة التوقيع) + خاتمة كانفا + تعليق صوتيّ اختياريّ.
     صوت اللقطة نفسها (سريع بصوت / سينمائيّ) يبقى: يُؤخّر ثانيتَي المقدّمة ويُدمج؛ لقطة بلا مسار صوت تخرج صامتة كما كانت. */
  async function wrapWithCanvas(mainSrc, text, ratio, signature, wantNarration, narrationVal){
    setStatus(bT('🎨 جاري إنشاء المقدمة...','🎨 Building intro...'));
    const introBlob = await recordCanvasClip({ title: text, signature: '', seconds: 2, ratio });
    setStatus(bT('🎨 جاري إنشاء الخاتمة...','🎨 Building outro...'));
    const outroBlob = await recordCanvasClip({
      title: '',
      signature: signature ? ((bT('صُنع بواسطة: ','Made by: ')) + signature) : (bT('صُنع بواسطة om ai','Made with om ai Video')),
      seconds: 2, ratio,
    });
    setStatus(bT('🎬 جاري إنهاء الفيديو...','🎬 Finalizing your video...'));
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');

    await ffmpeg.writeFile('intro.webm', await fetchFile(introBlob));
    await ffmpeg.writeFile('outro.webm', await fetchFile(outroBlob));
    await ffmpeg.writeFile('main.mp4', await fetchFile(mainSrc));

    let mainForConcat = 'main.mp4';
    if(signature){
      setStatus(bT('✍️ جاري إضافة توقيعك على الفيديو...','✍️ Adding your signature watermark...'));
      const wmBlob = await makeWatermarkPng(signature, ratio);
      await ffmpeg.writeFile('wm.png', await fetchFile(wmBlob));
      /* v-video-first-frame (فيديو المالك ٣٫٩ث: مقدّمة + إطار واحد من الفيديو + خاتمة): «shortest=1» مع صورة ثابتة
         (wm.png إطار واحد) يُنهي الناتج عند أقصر الدخلين — فيُقصّ فيديو الذكاء كلّه إلى إطار واحد (قيس: ١٢٠ ← ١).
         بلا shortest يتكرّر آخر إطار للتوقيع (eof_action=repeat) طوال الفيديو، والطول طول الفيديو نفسه. */
      await ffmpeg.exec(['-i', 'main.mp4', '-i', 'wm.png', '-filter_complex', 'overlay=0:H-h', '-c:a', 'copy', 'main_wm.mp4']);
      mainForConcat = 'main_wm.mp4';
    }

    setStatus(bT('🔗 جاري دمج القوالب مع فيديو الذكاء الاصطناعي...','🔗 Merging template + AI video...'));
    const { w, h } = ratioDims(ratio);
    /* v-video-identity-pose (فحص الهويّة ٣ نوفمبر): scale=W:H كان يمطّ مقطع الذكاء إلى ١٢٨٠×٧٢٠ أو ٧٢٠×١٢٨٠ بالضبط — ومخرج «فيديو سريع»
       بصورة بنسبة الصورة نفسها (3:4، مربّعة…) فيطول الوجه أو يعرض. الآن بنسبته داخل الإطار وحواشٍ سوداء، والقالبان كما كانا. */
    const fit = (i, o) => '[' + i + ':v]scale=' + w + ':' + h + ':force_original_aspect_ratio=decrease:force_divisible_by=2,pad=' + w + ':' + h + ':(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[' + o + '];';
    await ffmpeg.exec([
      '-i', 'intro.webm', '-i', mainForConcat, '-i', 'outro.webm',
      '-filter_complex',
      fit(0, 'v0') +
      fit(1, 'v1') +
      fit(2, 'v2') +
      '[v0][v1][v2]concat=n=3:v=1:a=0[outv]',
      '-map', '[outv]', 'final.mp4',
    ]);
    let finalName = 'final.mp4';
    try{
      const rc = await ffmpeg.exec(['-i', 'final.mp4', '-i', 'main.mp4', '-filter_complex', '[1:a]adelay=2000|2000[a]', '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', 'final_a.mp4']);
      if(rc === 0) finalName = 'final_a.mp4';
    } catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:1019'); /* guard-ok — لقطة بلا مسار صوت: الناتج صامت كما كان في وضع الدمج */ }
    const data = await ffmpeg.readFile(finalName);
    let finalBlob = new Blob([data.buffer], { type: 'video/mp4' });

    if(wantNarration){
      try{
        setStatus(bT('🎙️ جاري إنشاء التعليق الصوتي...','🎙️ Generating narration...'));
        const narrationInput = narrationVal || text;
        const ttsRes = await fetch('/api/tts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanNarrationText(narrationInput), voice: 'maha', lang: narrLang(narrationInput), gender: getNarrationGender(), speed: getNarrationSpeed(), token: ttsAuthToken(), guestId: ttsGuestId() }), /* v-audit-video (cli-video-2): الحساب لا عنوان IP */
        });
        if(ttsRes.ok){
          const audioBlob = await ttsRes.blob();
          setStatus(bT('🎚️ جاري دمج الصوت...','🎚️ Merging narration...'));
          finalBlob = await muxNarrationAny(finalBlob, audioBlob, false);
        }
      } catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:1036'); /* keep video without narration */ }
    }

    const finalUrl = URL.createObjectURL(finalBlob);
    setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
    resultEl.src = finalUrl;
    resultEl.style.display = 'block';
    downloadEl.href = finalUrl;
    downloadEl.download = dlName('omran-ai-video', finalBlob.type); // v-vmk-dl-ext
    downloadEl.style.display = 'block';
    autoSaveVideo(finalUrl);
  }

  /* v-ai-video-speed (المالك ١٦ أكتوبر: «طول كثير»): «جودة أعلى» كانت ترقية ثانية كاملة عند المزوّد بعد اكتمال الفيديو، والفيديو الجاهز
     مخفيّ حتّى تنتهي (حتّى حارس الربع ساعة، وفشلها مبلوع). الآن يظهر الفيديو فور جاهزيّته، والترقية تجري في الخلفية بحالة هادئة
     (✅/✨ لا تُظهر بطاقة الانتظار فوق النتيجة) ثمّ تستبدل المشغّل ورابط التحميل — ومع التعليق الصوتيّ يُدمَج الصوت نفسه على النسخة
     الأعلى. runSeq: طلب أحدث بدأ = لا استبدال. */
  let genSeq = 0;
  async function upgradeInBackground(rawUrl, token, audioBlob, runSeq){
    setStatus(bT('✅ الفيديو جاهز — ✨ نجهّز نسخة أعلى جودة في الخلفية وتستبدله تلقائيًّا…','✅ Video ready — ✨ preparing a higher-quality version in the background…'));
    try{
      const upRes = await fetch('/api/video-upscale-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: rawUrl, token, resolution: '2k' }),
      });
      const upData = await upRes.json();
      if(!upRes.ok || upData.error || !upData.id) throw new Error(upData.error || 'upscale');
      const upUrl = await pollTaskOnce(upData.id, true);
      if(runSeq !== genSeq) return;
      let player, dl;
      if(audioBlob){
        const merged = await muxNarration(upUrl, audioBlob);
        player = URL.createObjectURL(merged); dl = player;
      } else {
        dl = proxyVideoUrl(upUrl);
        try{
          const vres = await proxyFetch(upUrl);
          if(!vres.ok) throw new Error('proxy ' + vres.status);
          player = URL.createObjectURL(await vres.blob());
        } catch(e){ player = upUrl; } // آخر ملاذ للمشغّل فقط (كالمسار الأساسيّ v525)
      }
      if(runSeq !== genSeq) return;
      const at = resultEl.currentTime || 0, wasPlaying = !resultEl.paused, old = resultEl.src;
      resultEl.src = player;
      try{ resultEl.currentTime = at; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:1081'); /* guard-ok — بعض المتصفّحات ترفض قبل التحميل؛ يبدأ من أوّله */ }
      /* المشغّل بخاصيّة autoplay: تبديل المصدر يشغّله ولو أوقفه المستخدم أو أغلق النافذة (صوت التعليق من نافذة مغلقة) */
      if(wasPlaying) resultEl.play().catch(function(){ /* autoplay may be blocked */ }); else resultEl.pause();
      downloadEl.href = dl;
      if(/^blob:/.test(old || '') && old !== dl && old !== player){ try{ URL.revokeObjectURL(old); }catch(e){ __swallow(e, 'video:revoke'); } }
      setStatus(bT('✅ تم — صار الفيديو بجودة أعلى.','✅ Done — upgraded to higher quality.'));
    } catch(e){
      if(runSeq === genSeq) setStatus(bT('✅ تم الانتهاء! (تعذّرت النسخة الأعلى جودة — فيديوك الحاليّ جاهز)','✅ Done! (The higher-quality version was unavailable — your video is ready)'));
    }
  }

  /* v-ai-video-speed: «إلغاء» في نافذة الخصم يرجع ردّ 428 نفسه مقروء الجسم — كان json() يرمي («body stream already read» خامًا في
     السينمائيّ والاقتصاديّ)، وفي createScene يُعاد الطلب بعد ٦ و١٢ ث وتُفتح النافذة ثانيةً */
  function throwIfDeclined(res){
    if(res && res.status === 428) throw Object.assign(new Error((typeof window.t === 'function' && window.t('vidCancelled') !== 'vidCancelled') ? window.t('vidCancelled') : 'cancelled'), { code: 'confirm_declined' });
  }

  async function createScene(text, style, duration, ratio, token, longMode, imageBase64, imageMime){
    const payload = { promptText: text, style, duration, ratio, token, longMode: !!longMode };
    if(imageBase64){ payload.imageBase64 = imageBase64; payload.imageMime = imageMime || 'image/jpeg'; }
    // v405: postWithConfirm يتعامل مع 428 confirm_required (تأكيد التكلفة)
    const res = await (window.postWithConfirm ? window.postWithConfirm('/api/video-create', payload) : fetch('/api/video-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));
    throwIfDeclined(res);
    const data = await res.json();
    if(!res.ok || data.error) throw Object.assign(new Error(data.error || 'unknown'), { code: data.error, retryAfter: data.retryAfter || 0, retryable: data.retryable });
    return data.id;
  }

  // Runway's engine allows only 1 generation running at a time on our plan.
  // If another request (from any user, or a stray earlier attempt) is
  // occupying that single slot, a new task can come back THROTTLED and
  // sometimes eventually FAILED — even though nothing is actually wrong
  // with the video description. To make this invisible to the user, we
  // automatically recreate and retry the task a couple of times (with a
  // short backoff) before giving up and showing a real error.
  async function createSceneWithRetry(text, style, duration, ratio, token, longMode, onRetryStatus, imageBase64, imageMime, onAccepted){
    const maxAttempts = 3;
    let lastErr;
    for(let attempt = 1; attempt <= maxAttempts; attempt++){
      try{
        const id = await createScene(text, style, duration, ratio, token, longMode, imageBase64, imageMime);
        if(onAccepted){ try{ onAccepted(id); }catch(e){ __swallow(e, 'video:accepted'); } } /* v-ai-video-speed: المزوّد قبِل — ما يُجهَّز بالتوازي يبدأ الآن */
        const url = await pollTaskOnce(id);
        return url;
      } catch(e){
        lastErr = e;
        if(e && e.code === 'auth_required') throw e;
        if(e && e.code === 'daily_limit_reached') throw e;
        if(e && e.code === 'owner_only') throw e;
        /* v-video-refund: مهلة الثلاث دقائق لا تُعالَج بإعادة بعد ٦ ثوانٍ — ارفعها للمستخدم برسالة مفهومة. */
        if(e && e.code === 'video_cooldown') throw e;
        /* v-ai-video-speed: ما لا تحلّه الإعادة لا يُعاد — إلغاء الخصم، نفاد النقاط، رفض دائم للطلب (retryable:false)، ورفض الرقابة */
        if(e && (e.code === 'confirm_declined' || e.code === 'points_insufficient' || e.retryable === false || e.noRetry)) throw e;
        if(attempt < maxAttempts){
          if(onRetryStatus) onRetryStatus(attempt, maxAttempts);
          await new Promise((r) => setTimeout(r, 6000 * attempt));
        }
      }
    }
    throw lastErr;
  }

  /* v-video-seq-cooldown (بلاغ مُثبَت: قفل «فيديو واحد كلّ ٣ دقائق» يبدأ عند قبول المشهد ولا يُفكّ إلّا
     بالفشل، وسلسلة المشاهد — فيلم متكامل، ٢٠ ثانية — كانت تطلب التالي فور جهوز الأوّل فيُرفض
     بـvideo_cooldown وتموت كلّها والمشهد الأوّل مدفوع). ليست إعادة عمياء (v-video-refund): ننتظر
     المتبقّي الذي يعلنه الخادم بعدّ تنازليّ ظاهر ثمّ نعيد المشهد نفسه، مرّتين على الأكثر. المشهد الوحيد
     كما كان (رسالة المهلة بلا انتظار)، والمالك وVIP بلا قفل أصلًا فلا ينتظرون شيئًا. */
  const SEQ_COOLDOWN_WAITS_MAX = 2;
  function sceneWaitText(sceneNo, total, secs){
    const tpl = (typeof window.t === 'function' && window.t('videoSceneWait') !== 'videoSceneWait') ? window.t('videoSceneWait')
      : bT('⏳ المشهد {i}/{n}: مهلة بين الفيديوهات — يبدأ تلقائيًا بعد {s} ثانية.', '⏳ Scene {i}/{n}: cooldown between videos — starting automatically in {s}s.');
    return String(tpl).replace('{i}', sceneNo).replace('{n}', total).replace('{s}', secs);
  }
  /* v-audit-video (cli-video-6): نصوص حدّ اليوم والمهلة و«المحرّك مزدحم» كانت isEn() — فكلّ لغة غير الإنجليزيّة تأخذ العربيّة.
     الآن مفتاح I18N بالـ١٤ لغة، والاحتياط bT (القاموس الثنائيّ ثمّ الإنجليزيّة — لا عربيّة لغير العربيّة). */
  /* v-video-dialogue-fit · v-video-dialogue-clips: نسختان حرفيّتان من dialogueTurns وfitDialogue في api/_lib/video-trends.js — الخادم يقصّ
     بهما ما لا يتّسع له المقطع (شبكة أمان)، والعميل يبني بالقارئ نفسه خطّة المقاطع فلا يُقصّ شيء. اختبار video-dialogue-fit يقارن
     النصّين: عدّل الاثنين معًا. */
  function dialogueTurns(desc) {
    const s = String(desc || '');
    const turns = [];
    if (/saying exactly these (?:Arabic )?words/i.test(s)) return turns; // «ممثل يتكلم»: كلامه بالحرف
    const words = (x) => String(x || '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    /* v-video-full-dialogue: عناوين المشهد («🇦🇪 مشهد قصير: أحب وطني»، «الشخصيات: طفلة وأمها») ليست كلامًا — كانت تُحسب أدوارًا فتأكل من
       ميزانيّة الكلام وتطيل التوليدة. العنوان يُقارن بحروفه وحدها (بلا رموز ولا تشكيل) */
    const notSpeaker = /^(?:المكان|(?:ال)?مشهد(?: \S+){0,2}|الزمان|الوقت|الكاميرا|التصوير|الأسلوب|الستايل|الإضاءة|الموسيقى|الخلفية|ملاحظة|(?:ال)?شخصيات|العنوان|الوصف|الفكرة|scene(?: \S+){0,2}|setting|location|place|time|camera|shot|style|lighting|music|background|note|characters?|cast|title|description)$/i;
    const label = (x) => String(x).replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    let off = 0;
    for (const line of s.split('\n')) {
      /* سطر فيه تنصيصان فأكثر («البنت تسأل: «…» والأم ترد: «…»») = عدّة أدوار تُعدّ بتنصيصاتها، لا دور واحد باسم قبل النقطتين */
      const m = (line.match(/«[^»]+»|"[^"]+"|“[^”]+”/g) || []).length < 2 && /^\s*([^\s:：][^:：]{0,24}?)\s*[:：]\s*(\S.*)$/.exec(line);
      if (m && !/\d$/.test(m[1]) && !notSpeaker.test(label(m[1]))) {
        turns.push({ a: off, b: Math.min(s.length, off + line.length + 1), w: words(m[2].replace(/[«»"“”]/g, ' ')), said: m[2].trim(), lead: m[1].trim() + ': ', open: '', close: '', line: true });
      } else {
        const re = /«([^»]+)»|"([^"]+)"|“([^”]+)”/g;
        let q, prev = off;
        while ((q = re.exec(line))) {
          const qa = off + q.index, before = s.slice(prev, qa);
          const cut = Math.max(before.lastIndexOf('.'), before.lastIndexOf('؟'), before.lastIndexOf('?'), before.lastIndexOf('!'), before.lastIndexOf('،'));
          const said = (q[1] || q[2] || q[3]).trim(), from = cut >= 0 ? prev + cut + 1 : prev;
          turns.push({ a: from, b: qa + q[0].length, w: words(said), said, lead: s.slice(from, qa).replace(/^\s+/, ''), open: q[0][0], close: q[0][q[0].length - 1], line: false });
          prev = qa + q[0].length;
        }
      }
      off += line.length + 1;
    }
    return turns;
  }
  function fitDialogue(desc, seconds, lead) {
    const s = String(desc || '');
    const sec = Math.max(3, Math.min(15, Math.round(Number(seconds) || 8)));
    const budget = Math.max(4, Math.floor((sec - (lead > 0 ? lead : 1)) * 1.7));
    const turns = dialogueTurns(s);
    const res = { text: s, budget, turns: turns.length, kept: 0, dropped: 0, words: turns.reduce((n, t) => n + t.w, 0), keptWords: 0, last: '' };
    let used = 0, kept = 0;
    for (const t of turns) { if (kept && used + t.w > budget) break; used += t.w; kept++; }
    res.kept = kept; res.keptWords = used; res.last = kept ? turns[kept - 1].said : '';
    if (kept === turns.length) return res;
    let out = s;
    for (let i = turns.length - 1; i >= kept; i--) out = out.slice(0, turns[i].a) + out.slice(turns[i].b);
    res.text = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    res.dropped = turns.length - kept;
    return res;
  }
  /* v-video-dialogue-clips (المالك ١٧ نوفمبر: «اريد فيديو يبني اقصى حده على نفس الكلمات مرتب ويكون على مستوى مش شغل عشوائي»): الحوار
     لا يُقصّ — يُوزَّع بكلماته وترتيبه على مقاطع متتالية، كلّ مقطع بما يتّسع له بنطق متّزن (١٥ كلمة في ١٠ث = wordBudget) ومدّته على قدّ
     كلامه، ثمّ تُلصق. التوزيع متوازن (أقلّ «أطول مقطع») لا «املأ الأوّل واترك للأخير جملة»، ودور أطول من مقطع يُقسم عند نهاية جملة ثمّ
     فاصلة. المشهد (كلّ ما ليس حوارًا) يتكرّر حول كلام كلّ مقطع. فوق DIALOGUE_CLIPS_MAX مقاطع = يُقال ما تتّسع له ويُنبَّه على الباقي. */
  const DIALOGUE_CLIPS_MAX = 4;
  /* v-video-one-shot (المالك ١٧ نوفمبر: «اريده فيديو كامل مره وحده مااريد فيديو مقاطع»): caps = أقصى ثواني كلّ مقطع بترتيبه (آخر قيمة
     تتكرّر). الافتراضيّ [10] كما كان؛ [15] = أقصى توليدة واحدة عند المحرّك (٢٣ كلمة) فالحوار الذي تتّسع له يخرج فيديو واحدًا بتوليدة واحدة؛
     و«سينمائي» [15, 10, …] = التوليدة ثمّ تمديدات المحرّك نفسه (planDialogueOne). */
  /* v-video-full-dialogue (المالك ١٩ نوفمبر: «الفيديو بني ١٤ ثانية ما كمل الي اخر شي» — حواره ٤٤ كلمة في سبعة أدوار، والخطّة كانت
     تُسقط آخر دورين حتّى لو مدّ المحرّك): one = فيديو واحد يمدّه المحرّك — توليدة حتّى first ثانية ثمّ تمديدات حتّى step ثانية، والفيديو
     كلّه حتّى total. التمديد يكمل مشهدًا جاريًا بلا ثانية افتتاح فميزانيّته بـlead صمتًا (١٦ كلمة في ١٠ث — كالخادم EXTEND_SAY_LEAD).
     التوزيع: أقلّ خطوات تقول الحوار كلّه داخل المجموع، ثمّ أكثرها توازنًا (السؤال مع جوابه)؛ وما لا يتّسع كلّه يُقال أطول ما يتّسع. */
  const DIALOGUE_ONE = { first: 15, step: 10, total: 30, lead: 0.5 };
  function planDialogue(desc, maxClips, caps, one) {
    const s = String(desc || '');
    const capS = one ? [one.first, one.step] : ((Array.isArray(caps) && caps.length) ? caps : [10]);
    const secCap = (k) => capS[Math.min(k, capS.length - 1)];
    const budgetOf = (sec, k) => Math.max(4, Math.floor((sec - ((one && k) ? one.lead : 1)) * 1.7));
    const wordCap = (k) => budgetOf(secCap(k), k);
    const B = Math.min(wordCap(0), wordCap(1)), cap = Math.max(1, maxClips || DIALOGUE_CLIPS_MAX);
    const secFor = (w, floor, max, k) => { for (let x = floor; x < max; x++) if (budgetOf(x, k) >= w) return x; return max; };
    const turns = dialogueTurns(s);
    const res = { clips: [], turns: turns.length, words: turns.reduce((n, t) => n + t.w, 0), dropped: 0, last: '', seconds: 0, need: 0 };
    if (!turns.length) return res;
    res.need = secFor(res.words, 4, secCap(0));
    /* المشهد: ما قبل أوّل دور وما بعده من غير الأدوار — يحيطان بكلام كلّ مقطع في مكانهما */
    const tidy = (x) => x.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    const t0 = turns[0].a;
    let rest = s.slice(t0);
    for (let i = turns.length - 1; i >= 0; i--) rest = rest.slice(0, turns[i].a - t0) + rest.slice(turns[i].b - t0);
    const before = tidy(s.slice(0, t0)), after = tidy(rest);
    /* دور أطول من مقطع: يُقسم جملًا (. ! ? ؟ …)، والجملة الأطول من مقطع عند فواصلها، ثمّ بالكلمات إن لزم — الكلمات نفسها بترتيبها،
       والتوزيع بعده يجمع الجمل في مقاطع فلا ينقطع الكلام وسط جملة ما أمكن */
    const count = (toks) => toks.filter((x) => /[\p{L}\p{N}]/u.test(x)).length;
    const cutAt = (toks, re) => { const out = []; let cur = []; for (const x of toks) { cur.push(x); if (re.test(x)) { out.push(cur); cur = []; } } if (cur.length) out.push(cur); return out; };
    const parts = [];
    turns.forEach((t, src) => {
      if (t.w <= B) { parts.push(Object.assign({ src }, t)); return; }
      let pieces = cutAt((t.line ? t.said.replace(/[«»"“”]/g, '') : t.said).split(/\s+/).filter(Boolean), /[.!?؟…]$/);
      pieces = [].concat(...pieces.map((x) => (count(x) > B ? cutAt(x, /[،,؛;]$/) : [x])));
      pieces = [].concat(...pieces.map((x) => {
        const w = count(x);
        if (w <= B) return [x];
        const size = Math.ceil(w / Math.ceil(w / B)), out = [];
        let cur = [], n = 0;
        for (const tok of x) { cur.push(tok); if (/[\p{L}\p{N}]/u.test(tok) && ++n >= size) { out.push(cur); cur = []; n = 0; } }
        if (cur.length) out.push(cur);
        return out;
      }));
      for (const x of pieces) {
        const w = count(x), last = parts[parts.length - 1];
        if (w) parts.push({ w, said: x.join(' '), lead: t.lead, open: t.open, close: t.close, line: t.line, src });
        else if (last && last.src === src) last.said += ' ' + x.join(' ');
      }
    });
    let kept = parts.length, K = 1, sum = 0;
    const pre = [0]; for (const p of parts) pre.push(pre[pre.length - 1] + p.w);
    let bounds = [];
    if (one) {
      /* كلّ تقسيم متتالٍ لأوّل m جملة: كلّ خطوة داخل ميزانيّتها، ومجموع الثواني داخل حدّ المحرّك */
      const fitOne = (m) => {
        let got = null;
        const walk = (from, cuts, secs, top) => {
          const k = cuts.length;
          for (let to = from + 1; to <= m; to++) {
            const w = pre[to] - pre[from];
            if (w > wordCap(k)) break;
            const total = secs + secFor(w, k ? 3 : 6, secCap(k), k);
            if (total > one.total) break;
            const next = cuts.concat([[from, to]]), t = Math.max(top, w);
            if (to < m) { if (next.length < cap) walk(to, next, total, t); }
            else if (!got || next.length < got.cuts.length || (next.length === got.cuts.length && t < got.top)) got = { cuts: next, top: t };
          }
        };
        walk(0, [], 0, 0);
        return got;
      };
      let got = null;
      while (kept > 1 && !(got = fitOne(kept))) kept--;
      bounds = (got || fitOne(1)).cuts;
    } else {
      for (let i = 0; i < parts.length; i++) {
        let k = K, cur = sum;
        if (cur && cur + parts[i].w > wordCap(k - 1)) { if (k === cap) { kept = i; break; } k++; cur = 0; }
        if (parts[i].w > wordCap(k - 1)) { kept = i; break; } /* مقطع لاحق أقصر لا يتّسع للجملة كاملةً: تقف الخطّة قبلها */
        K = k; sum = cur + parts[i].w;
      }
    }
    const keep = parts.slice(0, kept), n = keep.length;
    res.dropped = parts.length - kept;
    res.last = keep[n - 1].said;
    if (!one) {
      const best = [], cut = [];
      for (let k = 0; k <= K; k++) { best.push(new Array(n + 1).fill(Infinity)); cut.push(new Array(n + 1).fill(0)); }
      best[0][0] = 0;
      for (let k = 1; k <= K; k++) for (let i = k; i <= n; i++) for (let j = k - 1; j < i; j++) {
        const w = pre[i] - pre[j];
        if (w > wordCap(k - 1)) continue;
        const v = Math.max(best[k - 1][j], w);
        if (v < best[k][i]) { best[k][i] = v; cut[k][i] = j; }
      }
      for (let k = K, i = n; k >= 1; k--) { bounds.unshift([cut[k][i], i]); i = cut[k][i]; }
    }
    res.clips = bounds.map(([a, b], at) => {
      const g = keep.slice(a, b), w = pre[b] - pre[a];
      let said = '';
      g.forEach((p, i) => {
        const prev = g[i - 1];
        /* جملتان متتاليتان من الدور نفسه: كلام واحد بمتكلّمه مرّة واحدة */
        if (prev && prev.src === p.src) { said = (p.close ? said.slice(0, -p.close.length) : said) + ' ' + p.said + p.close; return; }
        said += (prev ? ((p.line || prev.line) ? '\n' : ' ') : '') + p.lead + p.open + p.said + p.close;
      });
      const text = (before ? before + (g[0].line ? '\n' : ' ') : '') + said + (after ? (g[g.length - 1].line ? '\n' : ' ') + after : '');
      /* fresh = مدّة الجزء نفسه مقطعًا جديدًا (ثانية افتتاح) — حين يُرفض التمديد فيُولَّد بلقطة مرجعيّة، فلا يقصّ الخادم آخر سطر فيه */
      return (one && at) ? { text, words: w, sec: secFor(w, 3, secCap(at), at), fresh: secFor(w, 6, one.first), last: g[g.length - 1].said }
        : { text, words: w, sec: secFor(w, 6, secCap(at)), last: g[g.length - 1].said };
    });
    res.seconds = res.clips.reduce((x, c) => x + c.sec, 0);
    return res;
  }
  /* v-video-one-shot: خطّة «سينمائي» — فيديو واحد: توليدة واحدة حتّى ١٥ ثانية، وما زاد يمدّه المحرّك نفسه في آخر الفيديو (٣–١٠ ثوانٍ
     للمرّة، والفيديو كلّه حتّى ٣٠ ثانية — توثيق المحرّك). v-video-full-dialogue: التوزيع بحدّ المجموع نفسه لا بثلاثة قوالب ثابتة
     (كانت تُسقط آخر دورين من حوار يتّسع له الفيديو). */
  function planDialogueOne(desc) { return planDialogue(desc, 0, null, DIALOGUE_ONE); }
  /* v-video-dialogue-clips: حوار لا تتّسع له المقاطع كلّها (فوق DIALOGUE_CLIPS_MAX) — يُنبَّه قبل أيّ نداء أو خصم: «سيُقال إلى …» */
  function dialogCapOk(plan){
    if(!plan.dropped) return true;
    const last = plan.last.length > 80 ? plan.last.slice(0, 80) + '…' : plan.last;
    const msg = String(vmkT('vmkDialogLong', '⚠️ الحوار أطول من أقصى مدّة للفيديو ({s} ثانية).\nسيُقال إلى: «{last}» — ويُحذف الباقي.\nمتابعة؟ أو ألغِ وقصّر الحوار.', '⚠️ The dialogue is longer than the longest video ({s} seconds).\nIt will be spoken up to: “{last}” — the rest is left out.\nContinue? Or cancel and shorten the dialogue.')).split('{s}').join(String(plan.seconds)).split('{last}').join(last);
    try{ return window.confirm(msg) !== false; }catch(e){ __swallow(e, 'vmk:dialog-cap'); return true; /* guard-ok — بلا نافذة تأكيد: يُقال ما تتّسع له المقاطع */ }
  }
  function dialogClipsText(i, n, secs){
    return String(vmkT('vmkDialogClips', '🎬 الحوار كامل على {n} مقاطع متتالية (~{s} ثانية) — يولّد المقطع {i} من {n}...', '🎬 The full dialogue runs across {n} back-to-back clips (~{s} seconds) — generating clip {i} of {n}...')).split('{i}').join(String(i)).split('{n}').join(String(n)).split('{s}').join(String(secs));
  }
  /* v-video-dialogue-reject: أسطر الإعادة بمرجع آخر، والمقطع بلا لقطة مرجعيّة، وتسليم ما اكتمل */
  function dialogNoteText(key, ar, en, vals){
    let s = String(vmkT(key, ar, en));
    for(const k of Object.keys(vals)) s = s.split('{' + k + '}').join(String(vals[k]));
    return s;
  }
  function dialogRetryText(i, n){ return dialogNoteText('vmkDialogRetry', '⏳ المقطع {i} من {n}: المحرّك رفض اللقطة المرجعيّة — يُعاد بمرجع آخر، والمرفوض لا يُخصم...', '⏳ Clip {i} of {n}: the engine refused the reference frame — retrying with another reference; the refused attempt is not charged...', { i, n }); }
  function dialogNoRefText(i){ return dialogNoteText('vmkDialogNoRef', '⚠️ المقطع {i} بلا لقطة مرجعيّة (رفضها المحرّك أو تعذّرت) — قد يختلف شكل الشخصيّات فيه.', '⚠️ Clip {i} has no reference frame (refused by the engine or unavailable) — the characters may look different in it.', { i }); }
  function dialogPartText(k, n){ return dialogNoteText('vmkDialogPart', 'اكتمل {k} من {n} مقاطع في فيديو واحد — والباقي لم يُخصم. اضغط زرّ الإنشاء مرّة ثانية ليكمل الباقي وحده.', 'Finished {k} of {n} clips as one video — the rest was not charged. Press the create button again to finish only the rest.', { k, n }); }
  /* v-video-one-shot: «سينمائي» — فيديو واحد يمدّه المحرّك: سطر التقدّم وسطر ما وصل إليه عند التوقّف (بلا «مقاطع») */
  function dialogOneText(i, n, secs){ return dialogNoteText('vmkDialogOne', '🎬 فيديو واحد متّصل بالحوار كاملًا (~{s} ثانية) — يُبنى الجزء {i} من {n}...', '🎬 One continuous video with the full dialogue (~{s} seconds) — building part {i} of {n}...', { i, n, s: secs }); }
  function dialogOnePartText(k, n){ return dialogNoteText('vmkDialogOnePart', 'الفيديو وصل إلى الجزء {k} من {n} — والباقي لم يُخصم. اضغط زرّ الإنشاء مرّة ثانية ليكمل الباقي وحده.', 'The video reached part {k} of {n} — the rest was not charged. Press the create button again to finish only the rest.', { k, n }); }
  /* v-video-dialogue-merge: استئناف سلسلة توقّفت، وتعذّر الدمج على الجهاز */
  function dialogResumeText(k, n){ return dialogNoteText('vmkDialogResume', '✅ {k} من {n} مقاطع جاهزة من المحاولة السابقة — بلا خصم ثانٍ. يكمل الباقي...', '✅ {k} of {n} clips are ready from the previous attempt — not charged again. Finishing the rest...', { k, n }); }
  function dialogJoinFailText(){ return dialogNoteText('vmkDialogJoin', '⚠️ تعذّر دمج المقاطع على هذا الجهاز — اضغط زرّ الإنشاء مرّة ثانية ليُعاد الدمج بلا خصم.', '⚠️ The clips could not be merged on this device — press the create button again to retry the merge at no charge.', {}); }
  /* v-video-dialogue-merge (المالك ١٧ نوفمبر: «الي اريده فيديو مدموج وليس مقاطع» — أمامه مشهدان متفرّقان من تشغيلة دُفع ثمنها ثمّ توقّفت):
     سلسلة الحوار تُحفظ في المتصفّح بعد كلّ مقطع (بصمة الخطّة والوضع والنسبة والأسلوب + روابط المقاطع المكتملة). إعادة الضغط بالحوار نفسه
     خلال ٢٠ ساعة تحمّل المكتمل (ما لا يُحمَّل يُسقط هو وما بعده) وتولّد الناقص وحده ثمّ تدمج — لا يُدفع مقطع مرّتين، وتعذّر الدمج يُعاد
     بلا خصم. تُمحى عند اكتمال الفيديو. */
  const DLG_CHAIN_KEY = 'omran_vmk_dlg_chain', DLG_CHAIN_TTL = 20 * 3600 * 1000;
  function dlgChainSig(parts){
    const s = parts.join('\u0001');
    let h = 5381;
    for(let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h >>> 0) + ':' + s.length;
  }
  function dlgChainLoad(sig, more){
    try{
      const j = JSON.parse(localStorage.getItem(DLG_CHAIN_KEY) || 'null');
      /* v-video-one-shot: more = معرّف كلّ خطوة عند المحرّك (يُمدّ منه) وأوّل خطوة يحويها فيديوها */
      if(more){ more.ops = (j && j.sig === sig && Array.isArray(j.ops)) ? j.ops : []; more.base = (j && j.sig === sig && Array.isArray(j.base)) ? j.base : []; }
      if(j && j.sig === sig && Array.isArray(j.urls) && (Date.now() - Number(j.at)) < DLG_CHAIN_TTL) return j.urls.filter((u) => typeof u === 'string' && u);
    }catch(e){ __swallow(e, 'vmk:chain-load'); }
    return [];
  }
  function dlgChainSave(sig, urls, ops, base){
    try{
      if(urls.length) localStorage.setItem(DLG_CHAIN_KEY, JSON.stringify(Object.assign({ sig, at: Date.now(), urls }, ops ? { ops, base } : {})));
      else localStorage.removeItem(DLG_CHAIN_KEY);
    }catch(e){ __swallow(e, 'vmk:chain-save'); }
  }
  /* مقاس مقطع (من بياناته الوصفيّة) — null إن تعذّر */
  function clipDims(blob, ms){
    return new Promise((res) => {
      const v = document.createElement('video'), url = URL.createObjectURL(blob);
      let done = false;
      const fin = (out) => { if(done) return; done = true; clearTimeout(tm); v.onloadedmetadata = v.onerror = null; v.removeAttribute('src'); try{ v.load(); }catch(e){ __swallow(e, 'vmk:dims-unload'); } URL.revokeObjectURL(url); res(out); };
      const tm = setTimeout(() => fin(null), ms || 6000);
      v.muted = true; v.preload = 'metadata';
      v.onerror = () => fin(null);
      v.onloadedmetadata = () => fin(v.videoWidth ? { w: v.videoWidth, h: v.videoHeight, d: isFinite(v.duration) ? v.duration : 0 } : null);
      v.src = url;
    });
  }
  /* لصق بإعادة الترميز: مقاطع اختلف مقاسها أو فشل لصقها بالنسخ — كلّها إلى مقاس الأوّل و٣٠ إطارًا وصوت ٤٨ك ستيريو، ملفّ واحد */
  async function concatScenesEncode(urls, w, h){
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');
    const rm = async (n) => { try{ await ffmpeg.deleteFile(n); } catch(e){ __swallow(e, 'vmk:join-enc-clean'); } };
    const args = [];
    let fc = '', tail = '';
    for(let i = 0; i < urls.length; i++){
      await ffmpeg.writeFile('enc' + i + '.mp4', await fetchFile(await proxyBlob(urls[i])));
      args.push('-i', 'enc' + i + '.mp4');
      fc += '[' + i + ':v]scale=' + w + ':' + h + ':force_original_aspect_ratio=decrease:force_divisible_by=2,pad=' + w + ':' + h + ':(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v' + i + '];'
        + '[' + i + ':a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a' + i + '];';
      tail += '[v' + i + '][a' + i + ']';
    }
    let rc = 1;
    try{
      rc = await ffmpeg.exec([...args, '-filter_complex', fc + tail + 'concat=n=' + urls.length + ':v=1:a=1[v][a]', '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', 'encout.mp4'], 480000);
    } finally { for(let i = 0; i < urls.length; i++) await rm('enc' + i + '.mp4'); }
    if(rc !== 0){ await rm('encout.mp4'); throw new Error('join encode failed'); }
    const data = await ffmpeg.readFile('encout.mp4');
    await rm('encout.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
  }
  /* دمج مقاطع الحوار في ملفّ واحد: النسخ السريع حين تتطابق المقاسات ويخرج الملفّ بحجم مدخلاته، وإلّا إعادة الترميز. null = تعذّر الاثنان */
  async function joinDialogClips(list, blobs){
    let dims = [];
    try{ dims = await Promise.all(blobs.map((b) => (b ? clipDims(b) : null))); }catch(e){ __swallow(e, 'vmk:join-dims'); dims = []; }
    const d0 = dims[0];
    const same = !dims.length || dims.every((d) => !d || !d0 || (d.w === d0.w && d.h === d0.h));
    const total = blobs.reduce((s, b) => s + (b ? b.size : 0), 0), known = blobs.every((b) => !!b);
    if(same){
      try{
        const out = await concatScenes(list);
        if(out && out.size > 1000 && (!known || out.size >= total * 0.9)) return out;
      }catch(e){ __swallow(e, 'vmk:join-copy'); }
    }
    try{
      const out = await concatScenesEncode(list, (d0 && d0.w) || 1280, (d0 && d0.h) || 720);
      if(out && out.size > 1000) return out;
    }catch(e){ __swallow(e, 'vmk:join-encode'); }
    return null;
  }
  /* لقطة من مقطع (JPEG base64) ليبدأ منها المقطع التالي — الوجوه والمكان نفسها: آخر لقطة ('last')، أو أوّل لقطة ('first') حين يرفض
     المحرّك الأخيرة (v-video-dialogue-reject). إطار لم يُرسم بعد يُرسم شفّافًا (PITFALLS): ننتظر أوّل بكسل معتم. null عند أيّ عطب. */
  function clipFrameB64(blob, where, ms){
    return new Promise((res) => {
      const v = document.createElement('video'), url = URL.createObjectURL(blob);
      let done = false, tm = 0;
      const fin = (out) => { if(done) return; done = true; clearTimeout(tm); v.onseeked = v.onerror = v.onloadedmetadata = null; v.removeAttribute('src'); try{ v.load(); }catch(e){ __swallow(e, 'vmk:frame-unload'); } URL.revokeObjectURL(url); res(out); };
      tm = setTimeout(() => fin(null), ms || 8000);
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onerror = () => fin(null);
      v.onloadedmetadata = () => {
        const d = v.duration;
        if(!(isFinite(d) && d > 0) || !v.videoWidth){ fin(null); return; }
        v.onseeked = () => {
          let tries = 0;
          const pc = document.createElement('canvas'); pc.width = pc.height = 8;
          const px = pc.getContext('2d', { willReadFrequently: true });
          (function look(){
            try{
              px.clearRect(0, 0, 8, 8); px.drawImage(v, 0, 0, 8, 8);
              const a = px.getImageData(0, 0, 8, 8).data;
              for(let i = 3; i < a.length; i += 4) if(a[i]){
                const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
                c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
                fin(String(c.toDataURL('image/jpeg', 0.92)).split(',')[1] || null); return;
              }
            }catch(e){ __swallow(e, 'vmk:frame-read'); fin(null); return; }
            if(++tries > 40){ fin(null); return; }
            setTimeout(look, 50);
          })();
        };
        v.currentTime = where === 'first' ? Math.min(0.05, d / 2) : Math.max(0, d - 0.02);
      };
      v.src = url;
    });
  }
  function vmkT(key, ar, en){
    const v = (typeof window.t === 'function') ? window.t(key) : key;
    return (v && v !== key) ? String(v) : bT(ar, en);
  }
  function busyRetryText(attempt, max, sceneNo){
    const tpl = sceneNo
      ? vmkT('axVideoBusyRetryScene', '⏳ محرك الفيديو مزدحم، جاري إعادة محاولة المشهد {i} ({a}/{m})...', '⏳ The AI engine is busy, retrying scene {i} ({a}/{m})...')
      : vmkT('axVideoBusyRetry', '⏳ محرك الفيديو مزدحم، جاري إعادة المحاولة ({a}/{m})...', '⏳ The AI engine is busy, retrying ({a}/{m})...');
    return String(tpl).replace('{i}', sceneNo).replace('{a}', attempt).replace('{m}', max);
  }
  /* v-audit-video (cli-video-2): مشهد سقط سرده (حدّ اليوم أو عطب) كان يُدمج بصوت فارغ بلا كلمة — فيلم مدفوع بلا سرد بصمت.
     يُقال في سطر النهاية: «السرد ناقص في {k} من {n} مشاهد». */
  function narrMissNote(miss, total){
    if(!miss) return '';
    const tpl = (typeof window.t === 'function' && window.t('axVideoNarrMissing') !== 'axVideoNarrMissing') ? window.t('axVideoNarrMissing')
      : bT('⚠️ السرد ناقص في {k} من {n} مشاهد.', '⚠️ Narration is missing from {k} of {n} scenes.');
    return ' ' + String(tpl).replace('{k}', miss).replace('{n}', total);
  }
  async function waitOutCooldown(err, sceneNo, total){
    const secs = Math.max(1, Math.ceil(Number(err && err.retryAfter) || 180));
    for(let left = secs; left > 0; left--){
      setStatus(sceneWaitText(sceneNo, total, left));
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  async function sceneInSequence(sceneNo, total, run){
    for(let waits = 0; ; waits++){
      try{ return await run(); }
      catch(e){
        if(!(e && e.code === 'video_cooldown') || waits >= SEQ_COOLDOWN_WAITS_MAX) throw e;
        await waitOutCooldown(e, sceneNo, total);
      }
    }
  }

  /* 📸 صورتك بطل الفيلم — hero photo state */
  let filmHeroBase64 = null, filmHeroMime = 'image/jpeg';

  // 🔊 جنس صوت السرد
  function getNarrationGender(){
    const el = document.querySelector('input[name="videoVoiceGender"]:checked');
    return el ? el.value : 'female';
  }

  /* v-video-voice-speed (المالك ١٨ أكتوبر: «التعليق الصوتي في صانع الفيديو بطيء — فحصت «جرّب التطبيق وشوفوه» أخذت 2.7 ثانية مع وقفات
     بين الكلمات والطبقة طبيعية؛ السبب إنّ صانع الفيديو ما يرسل speed لـ/api/tts فيطلع دائمًا normal»): كلّ نداء صوت في صانع الفيديو يرسل speed
     (الافتراضيّ «fast» = +١٠٪ native في Azure/OpenAI، لا playbackRate فلا تتغيّر الطبقة) من اختيار «سرعة الصوت» جنب «إضافة تعليق صوتي»،
     والنصّ يُنظَّف قبل الإرسال: «...» و«…» والفواصل المتتالية أو الزائدة تصنع وقفات في الصوت. window.__vmkVoice يشاركه video.js (المخرج) وvideo-edit.js. */
  const NARRATION_SPEEDS = ['normal', 'fast', 'xfast'];
  const NARRATION_SPEED_KEY = 'aiapp_video_voice_speed';
  function getNarrationSpeed(){
    const el = document.getElementById('videoMakerNarrationSpeed');
    const v = el ? el.value : '';
    return NARRATION_SPEEDS.indexOf(v) >= 0 ? v : 'fast';
  }
  function cleanNarrationText(t){
    let s = String(t == null ? '' : t);
    s = s.replace(/(?:\.{2,}|[…⋯])+/g, ' ');            // «...» و«…» ← مسافة (كانت وقفة طويلة)
    s = s.replace(/([,،])(?:\s*[,،])+/g, '$1');          // فواصل متتالية ← واحدة
    s = s.replace(/\s+([,،.!?؟:])/g, '$1');              // لا مسافة قبل العلامة
    s = s.replace(/[,،]+(\s*)([.!?؟])/g, '$2$1');        // فاصلة قبل نقطة/تعجّب/سؤال ← تسقط
    s = s.replace(/^[\s,،]+/, '');                        // فاصلة أو مسافة في الأوّل
    s = s.replace(/[ \t]{2,}/g, ' ');
    return s.trim();
  }
  (function(){
    const sel = document.getElementById('videoMakerNarrationSpeed');
    if(sel){
      try{ const saved = localStorage.getItem(NARRATION_SPEED_KEY); if(NARRATION_SPEEDS.indexOf(saved) >= 0) sel.value = saved; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:1228'); /* guard-ok — بلا تخزين: الافتراضيّ سريع */ }
      sel.addEventListener('change', () => { try{ localStorage.setItem(NARRATION_SPEED_KEY, getNarrationSpeed()); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:1229'); /* guard-ok — تفضيل فقط */ } });
    }
    window.__vmkVoice = { speed: getNarrationSpeed, clean: cleanNarrationText };
  })();

  (function(){
    const btn = document.getElementById('videoMakerHeroBtn');
    const inp = document.getElementById('videoMakerHeroInput');
    const prev = document.getElementById('videoMakerHeroPreview');
    const clr = document.getElementById('videoMakerHeroClear');
    if(!btn || !inp) return;

    // تحميل البطل المحفوظ من localStorage (أفاتار ثابت)
    try {
      const savedB64 = localStorage.getItem('omran_hero_b64');
      const savedMime = localStorage.getItem('omran_hero_mime') || 'image/jpeg';
      if(savedB64 && savedB64.length > 100){
        filmHeroBase64 = savedB64; filmHeroMime = savedMime;
        if(prev){ prev.src = 'data:' + savedMime + ';base64,' + savedB64; prev.style.display = 'inline-block'; }
        if(clr) clr.style.display = 'inline-block';
        applyHeroRatioFromDataUrl('data:' + savedMime + ';base64,' + savedB64);
      }
    } catch(_){ typeof __swallow === 'function' && __swallow(_, 'app-11-video:1251'); /* استعادة صورة البطل المحفوظة ترفٌ: تخزين محجوب أو قيمة تالفة
         يعني بلا معاينة سابقة فقط — لا يمنع اختيار صورة جديدة. */ }

    btn.onclick = () => inp.click();
    clr.onclick = window.__clearFilmHero = () => {
      filmHeroBase64 = null;
      inp.value = '';
      prev.style.display = 'none';
      clr.style.display = 'none';
      try { localStorage.removeItem('omran_hero_b64'); localStorage.removeItem('omran_hero_mime'); }
      catch(_){ typeof __swallow === 'function' && __swallow(_, 'app-11-video:1261'); /* المسح من التخزين ترفٌ — الصورة أُزيلت من الواجهة أصلًا فوقها. */ }
    };
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if(!f) return;
      const img = new Image();
      img.onload = () => {
        /* v-video-photo-identity: ٧٦٨ كانت أصغر من الحدّ الأدنى الموصى به عند المحرّك (٦٤٠×٦٤٠ بعد القصّ)،
           ووجه صورة الوقوف الكامل يصل بكسلات قليلة فيُعاد رسمه تقريبًا — ١٤٠٠ كالترندات (v-trend-identity). */
        const max = 1400;
        let w = img.width, h = img.height;
        applyHeroRatio(w, h);
        if(Math.max(w, h) > max){ const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
        // Runway requires width/height ratio between 0.5 and 2 — pad if outside
        let cw = w, ch = h;
        if(w / h < 0.5) cw = Math.ceil(h * 0.52);
        else if(w / h > 2) ch = Math.ceil(w * 0.52);
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const cx2 = c.getContext('2d');
        cx2.fillStyle = '#000';
        cx2.fillRect(0, 0, cw, ch);
        cx2.drawImage(img, Math.round((cw - w) / 2), Math.round((ch - h) / 2), w, h);
        const dataUrl = c.toDataURL('image/jpeg', 0.85);
        filmHeroBase64 = dataUrl.split(',')[1];
        filmHeroMime = 'image/jpeg';
        prev.src = dataUrl;
        prev.style.display = 'inline-block';
        clr.style.display = 'inline-block';
        URL.revokeObjectURL(img.src);
        // حفظ البطل في localStorage (أفاتار ثابت عبر الجلسات)
        try { localStorage.setItem('omran_hero_b64', filmHeroBase64); localStorage.setItem('omran_hero_mime', filmHeroMime); }
        catch(_){ /* الحصّة ممتلئة أو التخزين محجوب: البطل يبقى في الذاكرة لهذه
             الجلسة ولا يُحفظ عبرها — والفيديو يُبنى منه كما هو.
             v-video-photo-identity: ويُمحى المحفوظ القديم، وإلّا عاد بعد إعادة التحميل شخصٌ سابق بطلًا. */
          try { localStorage.removeItem('omran_hero_b64'); localStorage.removeItem('omran_hero_mime'); }
          catch(__){ typeof __swallow === 'function' && __swallow(__, 'app-11-video:1297'); /* guard-ok — التخزين محجوب أصلًا */ } }
      };
      img.src = URL.createObjectURL(f);
    };
  })();

  btnGenerate.onclick = async () => {
    const text = (promptEl.value || '').trim();
    if(!text && modeEl.value !== 'actor'){
      showNotice((typeof window.t === 'function' && window.t('videoNeedDesc') !== 'videoNeedDesc') ? window.t('videoNeedDesc') : (bT('⚠️ اكتب وصف الفيديو أولًا.','⚠️ Please describe the video first.'))); // v-actor-notice: كان يُكتب فوق الشاشة في الجوّال
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      showNotice(bT('🔑 يجب تسجيل الدخول أولًا لاستخدام صانع الفيديو.','🔑 Please log in first to use the Video Maker.')); // v-actor-notice
      return;
    }

    const style = styleEl.value;
    const ratio = ratioEl.value;
    // adspot=5ث، reels=10ث — ضبط مدة فعلية لـ Runway
    /* v-video-durations: المدّة الفعليّة في متغيّر — كانت تُكتب فوق القائمة نفسها فيضيع «إعلان سريع» أو «ريلز» بعد أوّل فيديو
       (الحبّة تبقى عليه والقيمة ٥) */
    const _dv = durationEl.value;
    const durVal = (_dv === 'adspot') ? '5' : (_dv === 'reels') ? '10' : _dv;
    const durSecs = parseInt(durVal, 10) || 0; /* v-video-durations: الثواني المختارة تصل كلّ محرّك (كانت لا تصل الاقتصاديّ والسينمائيّ) */
    const isLong = durVal === 'long20';
    const wantNarration = narrationToggle.checked;
    const wantQuality = qualityToggle.checked && !isLong;

    const runSeq = ++genSeq; /* v-ai-video-speed: ترقية الجودة في الخلفية لا تستبدل نتيجة طلب أحدث — يُعدّ هنا بعد التحقّق (نقرة بلا وصف لا تُسقط ترقية مدفوعة) */
    let scenesDone = 0; /* v-ai-video-speed: مشاهد اكتملت (وحُسبت) قبل إلغاء نافذة خصم مشهد لاحق */
    btnGenerate.disabled = true;
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';
    downloadEl.download = 'omran-ai-video.mp4'; // v-vmk-dl-ext: الافتراضيّ قبل كلّ توليد
    /* v-video-partial (مراجعة ٢٧ أكتوبر): قائمة مشاهد فيلم سابق (روابطها ومشغّل «التالي») لا تتسرّب إلى الفيديو الجديد */
    resultEl.onended = null;
    { const oldSceneLinks = document.getElementById('filmSceneLinks'); if(oldSceneLinks) oldSceneLinks.innerHTML = ''; }
    /* v-vmk-res-mode: النتيجة تُوسَم بالوضع الذي ينتجها — video.js يخفيها ويوقفها في غيره (كان فيديو القوالب المجّانيّ يظهر في «فيديو AI»). */
    resultEl.dataset.mode = modeEl.value;

    function friendlyError(err){
      const code = err && (err.code || err.message); // v-credit-out: استطلاعات المحرّكات ترمي الرمز رسالةً (new Error(d.error))
      /* v-credit-out (أمر المالك ٢١ أكتوبر): رصيد مزوّد الفيديو نفد أو عطب عندنا — النصّ القائم بالـ14 لغة، والنقاط رُدّت في الخادم */
      if(code === 'unavailable' && typeof window.t === 'function') return '⚠️ ' + window.t('svcPaused');
      if(code === 'video_subscribers' && typeof window.t === 'function') return '⚠️ ' + window.t('plansWhyVideoSubs'); // v-video-subs: الفيديو للمشتركين (والباقات تُفتح من app-33)
      if((code === 'video_busy' || code === 'video_rejected') && typeof window.t === 'function') return '⚠️ ' + window.t(code === 'video_busy' ? 'vidBusy' : 'vidRejected'); // v-vid-codes
      if(code === 'auth_required') return bT('🔑 يجب تسجيل الدخول أولًا لاستخدام صانع الفيديو.','🔑 Please log in first to use the Video Maker.');
      /* v-ai-video-speed: ⏳ «مشغول» في بطاقة الانتظار — رسالة الخطأ به كانت تُبقي بطاقة «يتولّد» وعدّادها فوق المشهد بلا نهاية → 🕒 */
      /* v-audit-video (cli-video-6): نصّ الباقات القائم بالـ١٤ لغة (plansWhyLimit) لا isEn() */
      if(code === 'daily_limit_reached') return '🕒 ' + vmkT('plansWhyLimit', 'لقد استهلكت حد الفيديوهات المجانية لليوم. حاول مرة أخرى غدًا.', "You have reached today's free video limit. Try again tomorrow.");
      /* v-video-refund: بدل رمز «video_cooldown» الخام — مهلة بين فيديو وآخر، والانتظار بالدقائق. */
      if(code === 'video_cooldown'){
        const m = Math.max(1, Math.ceil((Number(err && err.retryAfter) || 180) / 60));
        return String(vmkT('axVideoCooldown', '🕒 فيديو واحد كل بضع دقائق. جرّب بعد {m} دقيقة تقريبًا.', '🕒 One video every few minutes. Try again in about {m} min.')).replace('{m}', m);
      }
      /* v-ai-video-speed: الإلغاء سطر هادئ بلا ❌، ونفاد النقاط بنصّ الباقات القائم (١٤ لغة) لا الرمز الخامّ */
      if(code === 'confirm_declined') return scenesDone > 0 ? bT('⛔ توقّف الفيديو عند إلغائك — المشاهد التي اكتملت قبله حُسبت.','⛔ Stopped at your cancel — the scenes completed before it were charged.') : err.message;
      if(code === 'points_insufficient' && typeof window.t === 'function' && window.t('plansWhyPoints') !== 'plansWhyPoints') return '⚠️ ' + window.t('plansWhyPoints');
      return (bT('❌ خطأ: ','❌ Error: ')) + (err && err.message ? err.message : String(err));
    }

    const creationMode = modeEl.value;
    const signature = (signatureEl.value || '').trim().slice(0, 60);

    /* ---- 🎬 Full mini-film: idea -> AI script -> multiple scenes -> narration -> merged film.
       Available to ALL logged-in accounts (small scene count); owner gets more scenes. ---- */
    /* Helper: check Runway credits BEFORE starting so nothing is charged on doomed runs. */
    async function ensureRunwayCredits(needed){
      /* v-video-open-lock: الرصيد عند المزوّد وسطره (باسمه وموقع شحنه) للمالك وحده.
         v-balance-enough (المراجعة المعاكسة): وغير المالك يسأل «هل يكفي؟» بجلسته — الجواب {enough} وحده، ورسالته عامّة بلا مزوّد */
      const owner = isOwnerAccount();
      try{
        const tk = (typeof authGet === 'function') ? (authGet('aiapp_auth_token') || '') : '';
        const r = owner
          ? await fetch('/api/video?action=video-balance&token=' + (typeof ownerToken === 'function' ? ownerToken() : ''))
          : await fetch('/api/video?action=video-balance&needed=' + encodeURIComponent(needed), { headers: { Authorization: 'Bearer ' + tk } });
        const d = await r.json();
        if(!owner){
          if(d && d.enough === false){ setStatus(bT('فشل توليد الفيديو — أعد المحاولة.','Video generation failed — try again.')); return false; }
          return true;
        }
        if(typeof d.credits === 'number' && d.credits >= 0 && d.credits < needed){
          setStatus(isEn()
            ? '⛔ Not enough Runway credits (' + d.credits + ' left, ' + needed + ' needed). Nothing was charged. Top up at runwayml.com first.'
            : '⛔ رصيد Runway غير كافي (المتبقي ' + d.credits + '، المطلوب ' + needed + '). لم يُخصم أي شيء. اشحن الرصيد من runwayml.com أولًا.');
          return false;
        }
      } catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:1386'); /* balance check is best-effort; do not block on network errors */ }
      return true;
    }

    /* Helper: generate ONE scene via Google Veo 3 (create + poll) and return its video URL. */
    async function createVeoScene(prompt, sceneRatio, sceneToken, hq, heroB64, heroMime){
      const payload = { promptText: prompt, ratio: sceneRatio, token: sceneToken, quality: hq ? 'high' : 'fast', style: styleEl.value, durationSeconds: 8 }; /* v-video-first-frame: الأسلوب يصل كلّ محرّك · v-video-durations: مشهد الفيلم ٨ ثوانٍ */
      if(heroB64){ payload.imageBase64 = heroB64; payload.imageMime = heroMime || 'image/jpeg'; } /* v-video-photo-identity */
      const cr = await fetch('/api/video?action=veo-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const crData = await cr.json();
      /* v-video-seq-cooldown: الرمز والمهلة يصلان كما في createScene — فتعرفهما سلسلة المشاهد وfriendlyError. */
      if(!cr.ok || crData.error || !crData.op) throw Object.assign(new Error(crData.error || 'veo create failed'), { code: crData.error, retryAfter: crData.retryAfter || 0 });
      return await new Promise((resolve, reject) => {
        const guard = makePollGuard(reject, 8000);
        const iv = setInterval(async () => {
          if(!guard.tick(iv)) return;
          try{
            const st = await fetch('/api/video?action=veo-status&op=' + encodeURIComponent(crData.op));
            const d = await st.json();
            /* v-video-poll-transient: زحام المزوّد العابر (٤٢٩/٥xx — الخادم يُبقي التذكرة مفتوحة) يُتسامح معه كـRunway؛ «unavailable» نهائيّ */
            if(d.error && (st.status === 429 || st.status >= 500) && d.error !== 'unavailable'){ guard.fail(iv, d.error); return; }
            guard.ok();
            if(d.error){ clearInterval(iv); reject(new Error(d.error)); return; }
            if(d.status === 'SUCCEEDED'){ clearInterval(iv); resolve(d.output[0]); }
            else if(d.status === 'FAILED'){ clearInterval(iv); reject(new Error((bT('فشل المحرّك السينمائيّ.','The cinematic engine failed.')) + (d.failure ? ' — ' + d.failure : ''))); }
          } catch(e){ guard.fail(iv); }
        }, 8000);
      });
    }

    /* v-video-dialogue-clips: مقطع واحد عند المحرّك («سريع» أو «سينمائي») — إنشاء ثمّ استطلاع حتّى رابطه. confirmed:true يحمله المتّصل بعد
       سؤال السعر بالمجموع. الأخطاء برموزها (المهلة بين الفيديوهات، النقاط…) كما في المسار المفرد. */
    async function engineClip(mode, payload, onTick, meta){
      const mm = mode === 'minimax';
      const cr = await fetch('/api/video?action=' + (mm ? 'minimax-create' : 'veo-create'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const c0 = await cr.json().catch(() => ({}));
      const id = mm ? c0.task_id : c0.op;
      if(!cr.ok || c0.error || !id) throw Object.assign(new Error(c0.error || 'create failed'), { code: c0.error, retryAfter: c0.retryAfter || 0 });
      if(meta) meta.id = id; /* v-video-one-shot: رقم العمليّة — منه يُمدّ الفيديو */
      return await new Promise((resolve, reject) => {
        const guard = makePollGuard(reject, 8000);
        const iv = setInterval(async () => {
          if(!guard.tick(iv)) return;
          try{
            const st = await fetch('/api/video?action=' + (mm ? 'minimax-status&task_id=' : 'veo-status&op=') + encodeURIComponent(id));
            const d = await st.json();
            if(d.error && (st.status === 429 || st.status >= 500) && d.error !== 'unavailable'){ guard.fail(iv, d.error); return; }
            guard.ok();
            if(d.error){ clearInterval(iv); reject(Object.assign(new Error(d.error), { code: d.error })); return; }
            if(d.status === 'SUCCEEDED' && d.output && d.output[0]){ clearInterval(iv); resolve(d.output[0]); }
            else if(d.status === 'FAILED'){ clearInterval(iv); reject(new Error(bT('فشل توليد الفيديو — أعد المحاولة.','Video generation failed — try again.'))); }
            else if(onTick) onTick();
          } catch(e){ guard.fail(iv); }
        }, 8000);
      });
    }
    /* v-video-dialogue-clips: الحوار كلّه على مقاطع متتالية — السعر يُسأل مرّة بالمجموع قبل الأوّل (veo-price: لا خصم ولا قفل)، ثمّ كلّ مقطع
       بجمله ومدّته، والتالي يبدأ من آخر لقطة في سابقه (keepPhoto: الصورة نفسها أوّل إطار) بأمر «أكمل المشهد نفسه»، ثمّ تُلصق. توقّف
       مقطع لاحق = المكتمل المدفوع يُعرض بروابطه (v-video-partial). */
    async function runDialogueClips(plan, mode){
      const n = plan.clips.length;
      if(!dialogCapOk(plan)){ setStatus(''); return; }
      /* سطر مستقلّ أوّل الوصف وبلا نقطتين ولا تنصيص: ملتصقًا بآخر سطر حوار كان الخادم يعدّه من كلام المتكلّم فيحذف الجملة الأخيرة (كشفه المسبار) */
      const CONT = 'Continue the same scene from the attached first frame — the same people, voices, clothes and place; the conversation simply carries on.';
      /* v-video-dialogue-merge: «واقعي» بلا صورة بطل يُقال للمحرّك في كلّ مقطع — مقطع يُعاد بلا لقطة مرجعيّة لا ينقلب رسمًا بين مقاطع مصوَّرة.
         سطر مستقلّ بلا نقطتين ولا تنصيص (كـCONT). الأنمي له سطره على الخادم، وصورة البطل تبقى بأسلوبها */
      const LOOK = (!filmHeroBase64 && style === 'realistic') ? '\nPhotorealistic live-action footage with real-looking people, not animation.' : '';
      /* v-video-one-shot (المالك ١٧ نوفمبر: «اريده فيديو كامل مره وحده مااريد فيديو مقاطع»): «سينمائي» — الجزء التالي يمدّه المحرّك نفسه في
         آخر الفيديو (extendOp = رقم عمليّة سابقه): الوجوه والأصوات والمكان من الفيديو نفسه، والناتج فيديو واحد متّصل بلا لصق ولا لقطة
         مرجعيّة. base[i] = أوّل خطوة يحويها فيديو الخطوة i (التمديد يحوي ما قبله)؛ رفض التمديد أو تعذّره = المراجع القديمة بترتيبها
         (لقطة ثمّ لصق) فلا يضيع المدفوع. «سريع» لا تمديد عنده: مقاطعه كما كانت. */
      const ext = mode === 'veo';
      const sig = dlgChainSig([mode, ratio, style, wantQuality ? 'hq' : 'fast', filmHeroBase64 ? 'hero' + filmHeroBase64.length : ''].concat(plan.clips.map((x) => x.sec + '|' + x.text)));
      const urls = [], local = [], blobs = [], ops = [], base = [];
      let last = null, prevBlob = null, noRef = 0;
      const segs = () => { const idx = []; for(let k = urls.length - 1; k >= 0; k = base[k] - 1) idx.unshift(k); return idx; };
      const whole = async () => { const idx = segs(); return (idx.length === 1 && blobs[idx[0]]) ? blobs[idx[0]] : await joinDialogClips(idx.map((k) => local[k]), idx.map((k) => blobs[k])); };
      const show = (blob) => {
        const out = URL.createObjectURL(blob);
        resultEl.src = out;
        resultEl.style.display = 'block';
        downloadEl.href = out;
        downloadEl.download = dlName('omran-ai-video', blob.type);
        downloadEl.style.display = 'block';
      };
      /* مقاطع اكتملت في محاولة سابقة للحوار نفسه: تُحمَّل ولا تُولَّد (ولا تُدفع) ثانيةً */
      const more = {};
      for(const u of dlgChainLoad(sig, more).slice(0, n)){
        let b = null;
        try{ b = await proxyBlob(u); }catch(e){ __swallow(e, 'vmk:chain-fetch'); }
        if(!b || !(b.size > 1000)) break;
        urls.push(u); local.push(URL.createObjectURL(b)); blobs.push(b);
      }
      const done = urls.length;
      for(let k = 0; k < done; k++){ ops.push(typeof more.ops[k] === 'string' ? more.ops[k] : ''); base.push((Number.isInteger(more.base[k]) && more.base[k] >= 0 && more.base[k] <= k) ? more.base[k] : k); }
      if(done){
        setStatus(dialogResumeText(done, n));
        prevBlob = done < n ? blobs[done - 1] : null;
        last = prevBlob ? await clipFrameB64(prevBlob, 'last') : null;
      }
      if(done < n){
        const price = { clips: n - done, engine: mode, promptText: 'dialogue', token };
        if(done) price.resume = true;
        const pr = await (window.postWithConfirm ? window.postWithConfirm('/api/video?action=veo-price', price)
          : fetch('/api/video?action=veo-price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(price) }));
        throwIfDeclined(pr);
        const pj = await pr.json().catch(() => ({}));
        if(!pr.ok || pj.priceOk !== true) throw Object.assign(new Error(pj.error || ('HTTP ' + pr.status)), { code: pj.error, retryAfter: pj.retryAfter || 0 });
      }
      try{
        for(let i = done; i < n; i++){
          const clip = plan.clips[i];
          const say = () => setStatus(ext ? dialogOneText(i + 1, n, plan.seconds) : dialogClipsText(i + 1, n, plan.seconds));
          say();
          /* v-video-dialogue-reject (المالك ١٧ نوفمبر بعد #1344: مقطعان تولّدا والثالث رفضه المحرّك «أسماء أو ملامح أشخاص حقيقيّين»، فرأى
             مشهدين متفرّقين ورسالة رفض — «تريد ان تخسرني فقط»): الرفض جاء مع لقطة مرجعيّة (الوصف نفسه بلا صورة كان يمرّ). مراجع المقطع
             اللاحق بالترتيب: آخر لقطة في سابقه، ثمّ أوّل لقطة فيه (قبِلها المحرّك مدخلًا، أو هي افتتاح المشهد)، ثمّ صورة البطل، ثمّ بلا
             صورة. رفض المحرّك للطلب (video_rejected) لا يولّد ولا يُخصم (الخادم يردّ النقاط ويفكّ القفل) فيُعاد المقطع بالمرجع التالي؛
             وأيّ خطأ آخر يوقف كما كان. المقطع الأوّل بمحاولته الواحدة: صورة البطل المرفوضة لا تُستبدل بفيديو بلا وجه صاحبها. */
          const refs = [];
          if(ext && i > 0 && ops[i - 1]) refs.push({ ext: ops[i - 1] }); /* v-video-one-shot: المحرّك يمدّ فيديوه — قبل أيّ لقطة مرجعيّة */
          if(i > 0 && last) refs.push({ img: last, cont: true });
          if(i > 0 && prevBlob) refs.push({ first: true, cont: true });
          if(filmHeroBase64) refs.push({ img: filmHeroBase64, mime: filmHeroMime || 'image/jpeg' });
          if(i > 0 || !refs.length) refs.push({});
          let url = null, got = null, meta = {};
          for(let k = 0; k < refs.length && !url; k++){
            const r = refs[k];
            if(r.first){ r.img = await clipFrameB64(prevBlob, 'first'); if(!r.img || r.img === last) continue; }
            /* v-video-full-dialogue: جزء خُطّط تمديدًا ويُولَّد مقطعًا جديدًا (رُفض تمديده) بمدّته مقطعًا — ثانية الافتتاح */
            const payload = { promptText: r.ext ? clip.text : (r.cont ? CONT + '\n' : '') + clip.text + LOOK, ratio, token, quality: wantQuality ? 'high' : 'fast', style, durationSeconds: r.ext ? clip.sec : (clip.fresh || clip.sec), confirmed: true };
            if(r.ext) payload.extendOp = r.ext;
            else if(ext && i < n - 1) payload.extendable = true; /* سيُمدّ: على إصدار المحرّك الذي يمدّ */
            if(r.img){ payload.imageBase64 = r.img; payload.imageMime = r.mime || 'image/jpeg'; if(r.cont) payload.keepPhoto = true; }
            meta = {};
            try{ url = await sceneInSequence(i + 1, n, () => engineClip(mode, payload, say, meta)); got = r; }
            catch(e){
              /* رفض المحرّك (لا يُخصم) يُعاد بالمرجع التالي؛ وتعذّر التمديد وحده (unavailable) يُعاد بلقطة مرجعيّة كذلك */
              if(!(e && (e.code === 'video_rejected' || (r.ext && e.code === 'unavailable'))) || k === refs.length - 1) throw e;
              setStatus(dialogRetryText(i + 1, n));
              continue;
            }
            if(i > 0 && !r.img && !r.ext && !noRef) noRef = i + 1;
          }
          urls.push(url); scenesDone++;
          ops.push(String(meta.id || '')); base.push((got && got.ext) ? base[i - 1] : i);
          dlgChainSave(sig, urls, ops, base); /* v-video-dialogue-merge: المكتمل محفوظ من لحظته — توقّف لاحق لا يُدفع له ثانيةً */
          let blob = null;
          try{ blob = await proxyBlob(url); }catch(e){ __swallow(e, 'vmk:dialog-clip-dl'); }
          if(got && got.ext && blob){
            /* التمديد يعيد الفيديو كلّه (ما قبله + التكملة) فمدّته أطول من التكملة؛ بمدّة التكملة وحدها = يُلصق بما قبله كمقطع */
            const dm = await clipDims(blob);
            if(dm && dm.d > 0 && dm.d <= clip.sec + 2.5){ base[i] = i; dlgChainSave(sig, urls, ops, base); }
          }
          local.push(blob ? URL.createObjectURL(blob) : url); blobs.push(blob);
          prevBlob = (blob && i < n - 1) ? blob : null;
          last = prevBlob ? await clipFrameB64(prevBlob, 'last') : null;
        }
      }catch(e){
        if(!urls.length) throw e;
        /* ما اكتمل يُسلَّم فيديو واحدًا ملصوقًا لا مشاهد متفرّقة، مع السبب و«اكتمل k من n — والباقي لم يُخصم»، ويبقى محفوظًا ليُكمَل */
        const why = friendlyError(e);
        const part = (local.length > 1 || (ext && blobs[0])) ? await whole() : null;
        if(!part){ showPartialScenes(urls, n, why); return; }
        show(part);
        setStatus(why + ' ' + (ext ? dialogOnePartText(urls.length, n) : dialogPartText(urls.length, n)));
        return;
      }
      if(segs().length > 1) setStatus(bT('🔗 جاري دمج المشاهد معًا...','🔗 Joining scenes together...'));
      const joined = await whole(); /* v-video-one-shot: فيديو مدّه المحرّك = هو نفسه بلا لصق */
      if(!joined){ showPartialScenes(urls, n, dialogJoinFailText()); return; } /* السلسلة باقية محفوظة: إعادة الضغط تعيد الدمج بلا خصم */
      dlgChainSave(sig, []);
      if(wantCanvasWrap()){ await wrapWithCanvas(joined, text, ratio, signature, wantNarration, (narrationText.value || '').trim()); return; }
      show(joined);
      setStatus(bT('✅ تم الانتهاء!','✅ Done!') + (noRef ? ' ' + dialogNoRefText(noRef) : ''));
    }

    if(durVal === 'film'){
      let filmPartial = null, filmTotal = 0; /* v-video-partial */
      try{
        const filmUseVeo = (creationMode === 'veo');
        /* v-film-mode-gate (بلاغ مُثبَت: فحص «فيلم متكامل» يسبق فحص الوضع كلّه، فكانفا المجّانيّ والاقتصاديّ
           والسينمائيّ والدمج والممثّل كانت تُرسَل بصمت إلى محرّك الفيديو الأساسيّ المدفوع): الفيلم مبنيّ على
           محرّكين فقط — غيرهما يُوقَف هنا قبل أيّ نداء أو خصم، برسالة واضحة لا تحويل صامت. */
        /* v-video-modes-by-result: «سريع» صار الافتراضيّ — في الفيلم يسلك مسلك المحرّك الأساسيّ كما كان الافتراضيّ السابق (الفيلم
           مبنيّ على محرّكين: الأساسيّ والسينمائيّ)؛ «بدون ذكاء» و«ممثّل» يبقيان موقوفين برسالة. */
        /* v-video-durations: «سريع» خرج من الفيلم — كان يصنع مشاهده بمحرّك «جودة عالية» صامتًا وبلا سعر على الزرّ */
        if(creationMode !== 'runway' && !filmUseVeo){
          setStatus((typeof window.t === 'function' && window.t('videoFilmModeOnly') !== 'videoFilmModeOnly') ? window.t('videoFilmModeOnly')
            : bT('🎬 «فيلم متكامل» يعمل مع أوضاع الذكاء فقط (جودة عالية / سينمائيّ) — غيّر الوضع أو اختر مدّة أخرى. لم يُخصم شيء.',
                 '🎬 "Full mini-film" works with the AI modes only (High quality / Cinematic) — change the mode or pick another length. Nothing was charged.'));
          btnGenerate.disabled = false;
          return;
        }
        if(filmUseVeo && !isOwnerAccount()){
          setStatus(bT('🔒 المحرّك السينمائيّ مقتصر على حساب المالك حاليًا.','🔒 The cinematic engine is limited to the owner account for now.'));
          btnGenerate.disabled = false;
          return;
        }
        const filmScenes = isOwnerAccount() ? 5 : 3;
        setStatus(bT('✍️ جاري كتابة سيناريو الفيلم مشهد بمشهد...','✍️ Writing the film script scene by scene...'));
        const scriptRes = await fetch('/api/video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: text, mode: 'film', sceneCount: filmScenes, style, lang: uiLangCode(), hero: !!filmHeroBase64, token }),
        });
        const scriptData = await scriptRes.json();
        if(scriptRes.status === 401){ const e = new Error('auth'); e.code = 'auth_required'; throw e; }
        if(scriptRes.status === 403 && scriptData && scriptData.error === 'daily_limit_reached'){ const e = new Error('limit'); e.code = 'daily_limit_reached'; throw e; }
        if(!scriptRes.ok || scriptData.error || !Array.isArray(scriptData.scenes) || !scriptData.scenes.length){
          throw new Error(scriptData.error || (bT('تعذّر إنشاء سيناريو الفيلم.','Could not generate the film script.')));
        }
        let scenes = scriptData.scenes.slice(0, filmScenes);
        // 📋 معاينة السيناريو — يراجع المستخدم المشاهد ويعدّلها قبل التوليد
        setStatus(bT('📋 راجع السيناريو...','📋 Review the script...'));
        const approvedScenes = await showScriptPreview(scriptData.title || text, scenes);
        if(!approvedScenes || !approvedScenes.length){
          setStatus(bT('❌ تم الإلغاء.','❌ Cancelled.'));
          btnGenerate.disabled = false; return;
        }
        scenes = approvedScenes;
        if(!filmUseVeo){
          setStatus(bT('💳 جاري التأكد من رصيد الفيديو...','💳 Checking video credits...'));
          const ok = await ensureRunwayCredits(scenes.length * 50);
          if(!ok){ btnGenerate.disabled = false; return; }
        }
        const builtScenes = [];
        filmPartial = builtScenes; filmTotal = scenes.length; /* v-video-partial */
        for(let i = 0; i < scenes.length; i++){
          const sc = scenes[i];
          setStatus((bT('🎥 جاري توليد المشهد ','🎥 Generating scene ')) + (i + 1) + '/' + scenes.length + (filmUseVeo ? bT(' (سينمائي)',' (cinematic)') : '') + /* v-no-provider-names */ '...');
          /* v-video-photo-identity: كان يُلحق «ضعه في وسط الإطار بلقطة متوسّطة» — أمر إعادة تأطير يعاكس
             الإطار الأوّل (الصورة نفسها) فيُعاد رسم الوجه بمقاس آخر. قفل الهويّة يبنيه الخادم لكلّ محرّك. */
          const scenePromptWithHero = sc.visual || text;
          const videoUrl = await sceneInSequence(i + 1, scenes.length, () => filmUseVeo
            ? createVeoScene(scenePromptWithHero, ratio, token, wantQuality, filmHeroBase64, filmHeroMime)
            : createSceneWithRetry(scenePromptWithHero, style, SCENE_SECONDS_CONST, ratio, token, false, (attempt, max) => {
                setStatus(busyRetryText(attempt, max, i + 1)); // v-audit-video (cli-video-6)
              }, filmHeroBase64, filmHeroMime));
          scenesDone++;
          setStatus((bT('🎙️ جاري تسجيل سرد المشهد ','🎙️ Narrating scene ')) + (i + 1) + '/' + scenes.length + '...');
          let audioBlob = null;
          try{
            const ttsCtl = new AbortController();
            const ttsTimer = setTimeout(() => ttsCtl.abort(), 45000);
            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: cleanNarrationText(sc.narration || text), voice: 'maha', lang: narrLang(sc.narration || text), gender: getNarrationGender(), speed: getNarrationSpeed(), token: ttsAuthToken(), guestId: ttsGuestId() }), /* v-audit-video (cli-video-2): الحساب لا عنوان IP */
              signal: ttsCtl.signal,
            });
            clearTimeout(ttsTimer);
            if(ttsRes.ok) audioBlob = await ttsRes.blob();
          } catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:1496'); /* narration is best-effort per scene */ }
          builtScenes.push({ videoUrl, audioBlob: audioBlob || new Blob() });
        }
        // Sequential playlist fallback: plays scenes back-to-back in the player
        // and offers a download link per scene. Used on phones (where the
        // in-browser merge can exhaust memory and crash the tab) or whenever
        // the merge itself fails — so the user never loses generated scenes.
        const showScenesPlaylist = () => {
          let idx = 0;
          resultEl.onended = () => {
            idx++;
            if(idx < builtScenes.length){
              resultEl.src = builtScenes[idx].videoUrl;
              resultEl.play().catch(() => {});
              setStatus((bT('▶️ المشهد ','▶️ Scene ')) + (idx + 1) + '/' + builtScenes.length);
            } else {
              setStatus(bT('✅ انتهى عرض كل المشاهد.','✅ All scenes played.'));
            }
          };
          resultEl.src = builtScenes[0].videoUrl;
          resultEl.style.display = 'block';
          downloadEl.style.display = 'none';
          let linksEl = document.getElementById('filmSceneLinks');
          if(!linksEl){
            linksEl = document.createElement('div');
            linksEl.id = 'filmSceneLinks';
            linksEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;justify-content:center;';
          }
          placeSceneLinks(linksEl);
          linksEl.innerHTML = '';
          builtScenes.forEach((sc, i) => {
            const a = document.createElement('a');
            a.href = proxyVideoUrl(sc.videoUrl);
            a.download = 'scene-' + (i + 1) + '.mp4';
            a.textContent = (bT('⬇️ مشهد ','⬇️ Scene ')) + (i + 1);
            a.style.cssText = 'padding:6px 12px;border-radius:10px;background:rgba(139,92,246,.18);color:inherit;text-decoration:none;font-size:13px;';
            linksEl.appendChild(scenePair(a));
            /* v-share-next: «مشاركة» بجانب «⬇️ مشهد N» (زوج واحد، المفتاح shareNextBtn بلغات التطبيق) */
            if(typeof window.omranAddShareNextTo === 'function'){ try{ window.omranAddShareNextTo(a, { kind: 'video', style: a.style.cssText + 'border:0;cursor:pointer;font-family:inherit;', getSrc: function(){ return sc.videoUrl; } }); }catch(e){ __swallow(e, 'vmk:scene-share2'); } }
          });
          setStatus(bT('✅ فيلمك جاهز! المشاهد تُعرض ورا بعض تلقائيًا — وتقدر تحمّل كل مشهد من الأزرار تحت.','✅ Your film is ready! Scenes will play back-to-back — download each scene below.'));
        };
        const oldLinks = document.getElementById('filmSceneLinks');
        if(oldLinks) oldLinks.innerHTML = '';
        resultEl.onended = null;
        // دائماً ندمج — حتى على هواوي (الدمج يعمل بالجهاز لا بالسيرفر)
        setStatus(bT('🔗 جاري دمج كل المشاهد بالفيلم النهائي...','🔗 Merging all scenes into your final film...'));
        let finalUrl = null, finalType = ''; // v-vmk-dl-ext
        try{
          const finalBlob = await buildLongVideo(builtScenes, (i, total) => {
            setStatus((bT('🔗 جاري دمج المشهد ','🔗 Merging scene ')) + (i + 1) + '/' + total + '...');
          });
          finalUrl = URL.createObjectURL(finalBlob); finalType = finalBlob.type;
        } catch(e){
          try{
            const blob = await concatScenes(builtScenes.map(s => s.videoUrl));
            finalUrl = URL.createObjectURL(blob); finalType = blob.type;
            setStatus(bT('⚠️ تعذّر دمج السرد؛ تم دمج الفيلم بدون السرد.','⚠️ Narration merge failed; film merged without narration.'));
          } catch(e2){
            finalUrl = null;
          }
        }
        if(finalUrl){
          setStatus(bT('✅ فيلمك جاهز!','✅ Your film is ready!') + narrMissNote(builtScenes.filter((s) => !(s.audioBlob && s.audioBlob.size)).length, builtScenes.length)); // v-audit-video
          resultEl.src = finalUrl;
          resultEl.style.display = 'block';
          downloadEl.href = finalUrl;
          downloadEl.download = dlName('omran-film', finalType); // يجبر المتصفح على التحميل لا الفتح — v-vmk-dl-ext: والامتداد من نوع الملفّ
          downloadEl.style.display = 'block';
        } else {
          // آخر ملاذ: عرض المشاهد ورا بعض مع روابط تحميل منفصلة
          showScenesPlaylist();
        }
        filmPartial = null; /* v-video-partial: اكتمل الفيلم — ما بعده (الدمج) له مسلكه */
      } catch(e){
        if(filmPartial && filmPartial.length) showPartialScenes(filmPartial.map((sc) => sc.videoUrl), filmTotal, friendlyError(e));
        else setStatus(friendlyError(e));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    /* v-minimax-video: المحرّك الاقتصاديّ — إضافة بجانب Runway وVeo. غير متزامن:
       ينشئ مهمّة ويستطلعها حتى يجهز المقطع (نفس شكل استطلاع Runway). */
    /* v-omni-video: المحرّك السينمائيّ (Gemini Omni) — إضافة رابعة. متزامن:
       طلب واحد يرجّع رابط الفيديو مباشرة (بلا استطلاع). */
    if(creationMode === 'omni'){
      try{
        setStatus(bT('🎬 جاري توليد الفيديو السينمائيّ (قد يستغرق ١-٣ دقائق)...','🎬 Generating the cinematic video (may take 1-3 min)...'));
        const payload = { promptText: text, ratio, token, quality: wantQuality ? 'high' : 'fast', style }; /* v-video-first-frame: الأسلوب كان لا يصل */
        if(filmHeroBase64){ payload.imageBase64 = filmHeroBase64; payload.imageMime = filmHeroMime || 'image/jpeg'; }
        const cr = await (window.postWithConfirm
          ? window.postWithConfirm('/api/video?action=omni-create', payload)
          : fetch('/api/video?action=omni-create', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) }));
        throwIfDeclined(cr);
        const d = await cr.json();
        if(!cr.ok || d.error) throw Object.assign(new Error(d.error || 'omni failed'), { code: d.error });
        /* v-lock-vid (srv-video-5): الخادم يحفظ الناتج بمعرّف omni/… وتذكرة — الاستلام استطلاع veo-status يسوّيها (من أغلق التطبيق قبل الاستلام
           يردّ الكنس نقاطه). الرابط المباشر (d.url) يبقى لردّ خادم أقدم أو تعذّر الحفظ. */
        const videoUrl = d.op ? await new Promise((resolve, reject) => {
          const guard = makePollGuard(reject, 3000);
          const iv = setInterval(async () => {
            if(!guard.tick(iv)) return;
            try{
              const st = await fetch('/api/video?action=veo-status&op=' + encodeURIComponent(d.op));
              const s = await st.json();
              guard.ok();
              if(s.error){
                if(s.error !== 'unavailable' && (st.status >= 500 || st.status === 429)){ guard.fail(iv, s.error); return; } /* عابر: الفيديو جاهز ومدفوع — يُعاد */
                clearInterval(iv); reject(Object.assign(new Error(s.error), { code: s.error })); return;
              }
              if(s.status === 'SUCCEEDED' && s.output && s.output[0]){ clearInterval(iv); resolve(s.output[0]); }
              else if(s.status === 'FAILED'){ clearInterval(iv); reject(new Error(vmkT('axAttachVidFailed', 'فشل إنشاء الفيديو', 'Video generation failed'))); }
            } catch(e){ guard.fail(iv); }
          }, 3000);
        }) : (d.url || d.dataUrl);
        if(!videoUrl) throw new Error('no video');
        setStatus(bT('⬇️ جاري تحميل الفيديو...','⬇️ Downloading the video...'));
        let vurl;
        if(d.dataUrl){ vurl = d.dataUrl; }
        else {
          const vres = await fetch(videoUrl);
          if(!vres.ok) throw new Error('download failed ' + vres.status);
          vurl = URL.createObjectURL(await vres.blob());
        }
        setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
        resultEl.src = vurl;
        resultEl.style.display = 'block';
        downloadEl.href = d.dataUrl ? vurl : videoUrl; /* v-lock-vid: الرابط الموقّع المسلَّم (من الاستطلاع أو الردّ المباشر) */
        downloadEl.style.display = 'block';
        autoSaveVideo(vurl);
      } catch(e){
        setStatus(friendlyError(e));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    if(creationMode === 'minimax'){
      try{
        /* v-video-dialogue-clips: الحوار كامل — مقطع واحد إن اتّسع له (ومدّته لا تقلّ عن حاجة كلامه)، وإلّا مقاطع متتالية */
        const dlg = planDialogue(text, 0, isOwnerAccount() ? [15] : [10]); /* v-video-one-shot: حساب المالك حتّى ١٥ ثانية للتوليدة (الخادم يقبلها له وحده) */
        if(dlg.clips.length > 1){ await runDialogueClips(dlg, 'minimax'); return; }
        setStatus(bT('🚀 جاري إرسال الطلب لمحرك الفيديو...','🚀 Sending the request to the video engine...'));
        const payload = { promptText: text, ratio, token, quality: wantQuality ? 'high' : 'fast', style, durationSeconds: Math.max(durSecs, dlg.need) || undefined }; /* v-video-first-frame: الأسلوب كان لا يصل · v-video-durations: والمدّة */
        if(filmHeroBase64){ payload.imageBase64 = filmHeroBase64; payload.imageMime = filmHeroMime || 'image/jpeg'; }
        const cr = await (window.postWithConfirm
          ? window.postWithConfirm('/api/video?action=minimax-create', payload)
          : fetch('/api/video?action=minimax-create', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) }));
        throwIfDeclined(cr);
        const crData = await cr.json();
        if(!cr.ok || crData.error || !crData.task_id) throw Object.assign(new Error(crData.error || 'create failed'), { code: crData.error });
        const videoUrl = await new Promise((resolve, reject) => {
          const guard = makePollGuard(reject, 8000);
          const iv = setInterval(async () => {
            if(!guard.tick(iv)) return;
            try{
              const st = await fetch('/api/video?action=minimax-status&task_id=' + encodeURIComponent(crData.task_id));
              const d = await st.json();
              /* v-video-poll-transient: زحام المزوّد العابر (٤٢٩/٥xx — الخادم يُبقي التذكرة مفتوحة) يُتسامح معه كـRunway؛ «unavailable» نهائيّ */
              if(d.error && (st.status === 429 || st.status >= 500) && d.error !== 'unavailable'){ guard.fail(iv, d.error); return; }
              guard.ok();
              if(d.error){ clearInterval(iv); reject(new Error(d.error)); return; }
              if(d.status === 'SUCCEEDED' && d.output && d.output[0]){ clearInterval(iv); resolve(d.output[0]); }
              else if(d.status === 'FAILED'){ clearInterval(iv); reject(new Error(bT('فشل توليد الفيديو — أعد المحاولة.','Video generation failed — try again.'))); }
              else setStatus(bT('⏳ يولّد الفيديو (قد يستغرق ١-٣ دقائق)...','⏳ Generating the video (may take 1-3 min)...'));
            } catch(e){ guard.fail(iv); }
          }, 8000);
        });
        setStatus(bT('⬇️ جاري تحميل الفيديو...','⬇️ Downloading the video...'));
        /* v-dl-ours (المراجعة المعاكسة): فشل البروكسي (429/401) كان يرمي «download failed» فلا يظهر الفيديو المدفوع —
           المشغّل يأخذ رابطه الخامّ كفرع Runway */
        let vurl;
        try{ vurl = URL.createObjectURL(await proxyBlob(videoUrl)); }catch(e){ vurl = videoUrl; }
        if(wantCanvasWrap()){ await wrapWithCanvas(vurl, text, ratio, signature, wantNarration, (narrationText.value || '').trim()); return; } /* v-video-modes-by-result */
        setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
        resultEl.src = vurl;
        resultEl.style.display = 'block';
        downloadEl.href = proxyVideoUrl(videoUrl);
        downloadEl.style.display = 'block';
        autoSaveVideo(vurl);
      } catch(e){
        setStatus(friendlyError(e));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    if(creationMode === 'veo' || creationMode === 'actor'){
      try{
        /* v-cinema-omni (المالك ٢٧ أكتوبر): «سينمائي» صار على محرّك شغّال فيُفتح للجميع بسعره (١٧٥ وحارس المشتركين على الخادم)؛
           «ممثل يتكلم» يبقى للمالك حتّى تنجح تجربته (وتبويبه مخفيّ لغيره — OWNER_MODES في video.js) */
        if(creationMode === 'actor' && !isOwnerAccount()){
          showNotice(bT('🔒 المحرّك السينمائيّ مقتصر على حساب المالك حاليًا.','🔒 The cinematic engine is limited to the owner account for now.')); // v-actor-notice
          return;
        }
        let veoPrompt = text;
        if(creationMode === 'actor'){
          const speechEl = document.getElementById('videoMakerActorSpeech');
          const speech = speechEl ? speechEl.value.trim() : '';
          if(!speech){
            showNotice(bT('🗣️ اكتب أول شي وش يقول الممثل.','🗣️ Write what the actor should say first.')); // v-actor-notice
            return;
          }
          /* v-actor-lipsync (المالك ٢ أكتوبر: «الصوت المتحدث ليس دقيق في اللهجة الإماراتية والكلام عربي ضعيف جدًّا»): Veo يخترع
             الصوت من وصف إنجليزيّ. الآن الكلام بالحرف بصوت إماراتيّ أصيل (حمدان/فاطمة) والوجه يتحرّك عليه؛ Veo احتياط فقط
             حين يقول الخادم fallback (قبل أيّ خصم: لا مفتاح، أو تعذّر الصوت أو الوجه). */
          const actorVoiceEl = document.getElementById('videoMakerActorVoice');
          const actorGender = (actorVoiceEl && actorVoiceEl.value === 'female') ? 'female' : 'male';
          setStatus(bT('🎙️ يسجّل كلام الممثل بصوت إماراتي...','🎙️ Recording the actor\'s line in an Emirati voice...'));
          const acPayload = { speech, promptText: text, voiceGender: actorGender, ratio, token };
          if(filmHeroBase64){ acPayload.imageBase64 = filmHeroBase64; acPayload.imageMime = filmHeroMime || 'image/jpeg'; }
          const ac = await fetch('/api/video?action=actor-create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(acPayload) });
          const acData = await ac.json().catch(() => ({}));
          if(ac.ok && acData.id){
            setStatus(bT('🎬 يحرّك وجه الممثل على صوته (قد يستغرق ١-٣ دقائق)...','🎬 Animating the actor to the voice (may take 1-3 min)...'));
            const actorUrl = await new Promise((resolve, reject) => {
              const guard = makePollGuard(reject, 8000);
              const iv = setInterval(async () => {
                if(!guard.tick(iv)) return;
                try{
                  const st = await fetch('/api/video?action=actor-status&id=' + encodeURIComponent(acData.id));
                  const d = await st.json();
                  /* v-video-poll-transient: زحام المزوّد العابر (٤٢٩/٥xx — الخادم يُبقي التذكرة مفتوحة) يُتسامح معه كـRunway؛ «unavailable» نهائيّ */
                  if(d.error && (st.status === 429 || st.status >= 500) && d.error !== 'unavailable'){ guard.fail(iv, d.error); return; }
                  guard.ok();
                  if(d.error){ clearInterval(iv); reject(new Error(d.error)); return; }
                  if(d.status === 'SUCCEEDED'){ clearInterval(iv); resolve(d.output[0]); }
                  else if(d.status === 'FAILED'){ clearInterval(iv); reject(new Error(bT('تعذّر توليد الممثل — رجعت نقاطك، أعد المحاولة.','Actor generation failed — points refunded, try again.') + (d.failure ? ' — ' + d.failure : ''))); }
                } catch(e){ guard.fail(iv); }
              }, 8000);
            });
            setStatus(bT('⬇️ جاري تحميل الفيديو...','⬇️ Downloading the video...'));
            let avurl; /* v-dl-ours: فشل البروكسي لا يُخفي الناتج المدفوع — رابطه الخامّ للمشغّل */
            try{ avurl = URL.createObjectURL(await proxyBlob(actorUrl)); }catch(e){ avurl = actorUrl; }
            setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
            resultEl.src = avurl;
            resultEl.style.display = 'block';
            downloadEl.href = proxyVideoUrl(actorUrl);
            downloadEl.style.display = 'block';
            return;
          }
          if(!acData.fallback) throw new Error(acData.error || ('actor ' + ac.status));
          console.warn('[actor] lipsync path unavailable — Veo fallback:', acData.error);
          /* v-photo-as-is: مع صورة لا «الشخص الحقيقيّ» ولا «realistic» — الأفاتار والكرتون يتكلّمان كما هما */
          veoPrompt = (text || (filmHeroBase64 ? 'The person in the opening image' : 'An Emirati man in traditional white kandura and ghutra, warm friendly face'))
            + '. The person looks directly at the camera and speaks in Emirati Gulf Arabic dialect (لهجة إماراتية خليجية), saying exactly these Arabic words: "' + speech + '". '
            + 'Perfect accurate lip-sync matching the Arabic words, natural authentic Emirati voice and accent, natural hand gestures, cinematic lighting' + (filmHeroBase64 ? '' : ', realistic') + '. No subtitles, no captions, no text on screen.';
        }
        /* v-video-dialogue-clips: كـ«سريع» — والممثّل كلامه بالحرف فلا خطّة له */
        const dlg = creationMode === 'veo' ? planDialogueOne(veoPrompt) : { clips: [], need: 0 }; /* v-video-one-shot: توليدة واحدة حتّى ١٥ ثانية، وما زاد يمدّه المحرّك */
        if(dlg.clips.length > 1){ await runDialogueClips(dlg, 'veo'); return; }
        setStatus(bT('🚀 جاري الإرسال إلى المحرّك السينمائيّ...','🚀 Sending to the cinematic engine...')); /* v-no-provider-names */
        const veoPayload = { promptText: veoPrompt, ratio, token, quality: wantQuality ? 'high' : 'fast', style, durationSeconds: (creationMode === 'veo' && Math.max(durSecs, dlg.need)) || undefined }; /* v-video-first-frame · v-video-durations: مدّة «سينمائي» المختارة (الممثّل على قدّ كلامه) */
        if(filmHeroBase64){ veoPayload.imageBase64 = filmHeroBase64; veoPayload.imageMime = filmHeroMime || 'image/jpeg'; } /* v-video-photo-identity */
        /* v-cinema-omni (مراجعة ٢٧ أكتوبر): «سينمائي» صار للزبون — الطلب يمرّ بنافذة الخصم (١٧٥) كالاقتصاديّ؛ كان fetch خامًا بلا confirmed
           فيقف كلّ غير المالك عند ٤٢٨ «confirm_required». والرموز تُحفظ (المهلة، النقاط، المشتركون) لرسائلها. */
        const cr = await (window.postWithConfirm
          ? window.postWithConfirm('/api/video?action=veo-create', veoPayload)
          : fetch('/api/video?action=veo-create', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(veoPayload) }));
        throwIfDeclined(cr);
        const crData = await cr.json();
        if(!cr.ok || crData.error || !crData.op) throw Object.assign(new Error(crData.error || 'veo create failed'), { code: crData.error, retryAfter: crData.retryAfter || 0 });
        const videoUrl = await new Promise((resolve, reject) => {
          const guard = makePollGuard(reject, 8000);
          const iv = setInterval(async () => {
            if(!guard.tick(iv)) return;
            try{
              const st = await fetch('/api/video?action=veo-status&op=' + encodeURIComponent(crData.op));
              const d = await st.json();
              /* v-video-poll-transient: زحام المزوّد العابر (٤٢٩/٥xx — الخادم يُبقي التذكرة مفتوحة) يُتسامح معه كـRunway؛ «unavailable» نهائيّ */
              if(d.error && (st.status === 429 || st.status >= 500) && d.error !== 'unavailable'){ guard.fail(iv, d.error); return; }
              guard.ok();
              if(d.error){ clearInterval(iv); reject(new Error(d.error)); return; }
              if(d.status === 'SUCCEEDED'){ clearInterval(iv); resolve(d.output[0]); }
              else if(d.status === 'FAILED'){ clearInterval(iv); reject(new Error((bT('فشل المحرّك السينمائيّ.','The cinematic engine failed.')) + (d.failure ? ' — ' + d.failure : ''))); }
              else setStatus(bT('⏳ المحرّك السينمائيّ يولّد الفيديو (قد يستغرق ١-٣ دقائق)...','⏳ The cinematic engine is generating (may take 1-3 min)...'));
            } catch(e){ guard.fail(iv); }
          }, 8000);
        });
        setStatus(bT('⬇️ جاري تحميل الفيديو...','⬇️ Downloading the video...'));
        /* v-cinema-omni (مراجعة ٢٧ أكتوبر): الاستطلاع سوّى المهمّة «سُلّمت» — فشل التحميل العابر كان يرمي خطأً فيضيع فيديو مدفوع (١٧٥) بلا ردّ.
           ثلاث محاولات، ثمّ المشغّل ورابط التحميل على رابط الخادم نفسه كبقيّة الأوضاع (v-dl-ours) */
        let vres = null;
        for(let k = 0; k < 3 && !(vres && vres.ok); k++){
          if(k) await new Promise((r) => setTimeout(r, 2000 * k));
          try{ vres = await fetch(proxyVideoUrl(videoUrl)); }catch(de){ vres = null; __swallow(de, 'video:veo-dl'); }
        }
        if(!vres || !vres.ok){
          setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
          resultEl.src = proxyVideoUrl(videoUrl);
          resultEl.style.display = 'block';
          downloadEl.href = proxyVideoUrl(videoUrl);
          downloadEl.style.display = 'block';
          return;
        }
        const vblob = await vres.blob();
        if(creationMode === 'veo' && wantCanvasWrap()){ await wrapWithCanvas(vblob, text, ratio, signature, wantNarration, (narrationText.value || '').trim()); return; } /* v-video-modes-by-result */
        const vurl = URL.createObjectURL(vblob);
        setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
        resultEl.src = vurl;
        resultEl.style.display = 'block';
        // رابط التحميل = المسار المباشر للسيرفر (Content-Disposition: attachment)، يشتغل على هواوي
        downloadEl.href = proxyVideoUrl(videoUrl);
        downloadEl.style.display = 'block';
      } catch(e){
        setStatus(friendlyError(e));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    if(creationMode === 'canvas'){
      try{
        const secs = (durVal === 'long20') ? 20 : (durVal === 'longMinutes' ? 30 : (parseInt(durVal, 10) || 5));
        await runCanvasOnly(text, ratio, secs, signature, wantNarration, (narrationText.value || '').trim());
      } catch(e){
        setStatus(friendlyError(e));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    if(creationMode === 'hybrid'){
      try{
        await runHybrid(text, style, ratio, durVal, signature, token, wantNarration, (narrationText.value || '').trim());
      } catch(e){
        setStatus(friendlyError(e));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    if(durVal === 'longMinutes'){
      try{
        if(!isOwnerAccount()){
          setStatus(bT('🔒 هذه الميزة مقتصرة على حساب المالك.','🔒 This feature is limited to the owner account.'));
          btnGenerate.disabled = false;
          return;
        }
        const mins = Math.max(1, Math.min(10, parseInt(longMinutesInput.value, 10) || 1));
        setStatus(bT('✍️ جاري كتابة السكربت كامل مشهد بمشهد...','✍️ Writing the full scene-by-scene script...'));
        const scriptRes = await fetch('/api/video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: text, minutes: mins, style, lang: uiLangCode(), token }),
        });
        const scriptData = await scriptRes.json();
        if(!scriptRes.ok || scriptData.error || !Array.isArray(scriptData.scenes) || !scriptData.scenes.length){
          throw new Error(scriptData.error || (bT('تعذّر إنشاء السكربت.','Could not generate the script.')));
        }
        const scenes = scriptData.scenes;
        setStatus(bT('💳 جاري التأكد من رصيد الفيديو...','💳 Checking video credits...'));
        const okBal = await ensureRunwayCredits(scenes.length * 50);
        if(!okBal){ btnGenerate.disabled = false; return; }
        const estLow = (scenes.length * 2).toFixed(0);
        const estHigh = (scenes.length * 5).toFixed(0);
        const confirmMsg = isEn()
          ? `This video will generate ${scenes.length} scenes (~${(scenes.length * SCENE_SECONDS_CONST) / 60 | 0} min). Estimated real cost: about $${estLow}-$${estHigh} charged to the video engine account. Continue?` /* v-no-provider-names */
          : `هذا الفيديو راح يولّد ${scenes.length} مشهد (~${(scenes.length * SCENE_SECONDS_CONST / 60) | 0} دقيقة). التكلفة التقديرية الحقيقية: حوالي ${estLow}$-${estHigh}$ تُخصم من حساب محرّك الفيديو. تكمل؟`; /* v-no-provider-names */
        if(!window.confirm(confirmMsg)){
          setStatus(bT('❌ تم الإلغاء.','❌ Cancelled.'));
          btnGenerate.disabled = false;
          return;
        }

        const builtScenes = [];
        for(let i = 0; i < scenes.length; i++){
          const sc = scenes[i];
          setStatus((bT('🚀 جاري إرسال المشهد ','🚀 Sending scene ')) + (i + 1) + '/' + scenes.length + '...');
          const videoUrl = await createSceneWithRetry(sc.visual || text, style, SCENE_SECONDS_CONST, ratio, token, true, (attempt, max) => {
            setStatus(busyRetryText(attempt, max, i + 1)); // v-audit-video (cli-video-6)
          }, filmHeroBase64, filmHeroMime);
          setStatus((bT('🎙️ جاري تسجيل صوت المشهد ','🎙️ Narrating scene ')) + (i + 1) + '/' + scenes.length + '...');
          let audioBlob = null;
          try{
            const ttsCtl2 = new AbortController();
            const ttsTimer2 = setTimeout(() => ttsCtl2.abort(), 45000);
            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: cleanNarrationText(sc.narration || text), voice: 'maha', lang: narrLang(sc.narration || text), gender: getNarrationGender(), speed: getNarrationSpeed(), token: ttsAuthToken(), guestId: ttsGuestId() }), /* v-audit-video (cli-video-2): الحساب لا عنوان IP */
              signal: ttsCtl2.signal,
            });
            clearTimeout(ttsTimer2);
            if(ttsRes.ok) audioBlob = await ttsRes.blob();
          } catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-11-video:1864'); /* narration is best-effort */ }
          builtScenes.push({ videoUrl, audioBlob: audioBlob || new Blob() });
        }

        setStatus(bT('🔗 جاري دمج كل المشاهد مع السرد بالفيديو النهائي...','🔗 Joining all scenes with narration into the final video...'));
        const finalBlob = await buildLongVideo(builtScenes, (i, total) => {
          setStatus((bT('🔗 جاري دمج المشهد ','🔗 Joining scene ')) + (i + 1) + '/' + total + '...');
        });
        const finalUrl = URL.createObjectURL(finalBlob);
        setStatus(bT('✅ تم الانتهاء!','✅ Done!') + narrMissNote(builtScenes.filter((s) => !(s.audioBlob && s.audioBlob.size)).length, builtScenes.length)); // v-audit-video
        resultEl.src = finalUrl;
        resultEl.style.display = 'block';
        downloadEl.href = finalUrl;
        downloadEl.download = dlName('omran-ai-video', finalBlob.type); // v-vmk-dl-ext
        downloadEl.style.display = 'block';
      } catch(e){
        setStatus(friendlyError(e)); /* v-video-partial: الرسالة المترجمة كبقيّة الأوضاع لا نصّ الخطأ الخام */
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    let longPartial = null; /* v-video-partial: مشاهد «٢٠ ثانية» المكتملة إن توقّف الثاني */
    try{
      let sceneUrls = [];
      longPartial = isLong ? sceneUrls : null;
      /* v-ai-video-speed: التعليق الصوتيّ يتجهّز مع الفيديو لا بعده (كان يبدأ بعد اكتماله)، ومحرّك الدمج (٣١ ميغا) يُحمَّل بالتوازي —
         من لحظة قبول المزوّد (onAccepted) لا من الضغطة: إلغاء نافذة الخصم أو الرصيد أو المهلة لا يستهلك نداء صوت من السقف اليوميّ. */
      let ttsEarly = null;
      const startNarration = () => {
        if(!wantNarration || ttsEarly) return;
        ttsEarly = fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanNarrationText((narrationText.value || '').trim() || text), voice: 'maha', lang: narrLang((narrationText.value || '').trim() || text), gender: getNarrationGender(), speed: getNarrationSpeed(), token: ttsAuthToken(), guestId: ttsGuestId() }), /* v-audit-video (cli-video-2): الحساب لا عنوان IP */
        }).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
        getFFmpeg().catch(() => null);
      };
      const okBal2 = await ensureRunwayCredits(isLong ? 100 : 50);
      if(!okBal2){ btnGenerate.disabled = false; return; }
      if(isLong){
        const scenePrompts = [
          text + (bT(' (اللحظة الافتتاحية للمشهد)',' (opening moment of the scene)')),
          text + (bT(' (استكمال نفس المشهد، اللحظة التالية)',' (continuing the same scene, next moment)')),
        ];
        for(let i = 0; i < scenePrompts.length; i++){
          setStatus((bT('🚀 جاري إرسال المشهد ','🚀 Sending scene ')) + (i + 1) + '/' + scenePrompts.length + '...');
          const url = await sceneInSequence(i + 1, scenePrompts.length, () => createSceneWithRetry(scenePrompts[i], style, 10, ratio, token, false, (attempt, max) => {
            setStatus(busyRetryText(attempt, max)); // v-audit-video (cli-video-6)
          }, filmHeroBase64, filmHeroMime, startNarration));
          sceneUrls.push(url); scenesDone++;
        }
      } else {
        setStatus(bT('🚀 جاري إرسال الطلب...','🚀 Sending request...'));
        const url = await createSceneWithRetry(text, style, durVal, ratio, token, false, (attempt, max) => {
          setStatus(busyRetryText(attempt, max)); // v-audit-video (cli-video-6)
        }, filmHeroBase64, filmHeroMime, startNarration);
        sceneUrls.push(url);
      }

      longPartial = null; /* v-video-partial: المشاهد كلّها جاهزة */
      let finalSrc = sceneUrls[0];
      let finalIsBlob = false;

      if(sceneUrls.length > 1){
        setStatus(bT('🔗 جاري دمج المشاهد معًا...','🔗 Joining scenes together...'));
        try{
          const blob = await concatScenes(sceneUrls);
          finalSrc = blob;
          finalIsBlob = true;
        } catch(e){
          setStatus(bT('⚠️ تعذّر دمج المشاهد؛ سيتم عرض المشهد الأول فقط.','⚠️ Could not join scenes; showing the first scene only.'));
        }
      }

      let narrationBlob = null;
      if(wantNarration){
        try{
          setStatus(bT('🎙️ جاري إنشاء التعليق الصوتي...','🎙️ Generating narration...'));
          startNarration(); // احتياط: لم يُنادَ onAccepted (لا يحدث في هذا المسار)
          const audioBlob = await ttsEarly;
          if(audioBlob){
            setStatus(bT('🎚️ جاري إضافة التعليق الصوتي للفيديو...','🎚️ Adding narration to the video...'));
            const merged = await muxNarration(finalSrc, audioBlob);
            finalSrc = merged;
            finalIsBlob = true;
            narrationBlob = audioBlob;
          } else throw new Error('tts');
        } catch(e){
          setStatus(bT('⚠️ تعذّر إضافة التعليق الصوتي؛ سيتم عرض الفيديو بدونه.','⚠️ Could not add narration; showing the video without it.'));
        }
      }

      // v525: always serve a blob URL via server proxy — direct cross-origin fetch fails on mobile/Huawei
      let playerUrl; // رابط المشغّل (blob للتشغيل السلس)
      let dlUrl;     // رابط التحميل (proxy URL مع Content-Disposition: attachment)
      if(finalIsBlob){
        playerUrl = URL.createObjectURL(finalSrc);
        dlUrl = playerUrl;
      } else {
        // رابط التحميل = proxy URL (same-origin + Content-Disposition: attachment = يشتغل على هواوي)
        dlUrl = proxyVideoUrl(finalSrc);
        try{
          setStatus(bT('⬇️ جاري تحميل الفيديو...','⬇️ Downloading video...'));
          const vres = await proxyFetch(finalSrc); /* v-dl-ticket: الجلسة في الترويسة لا الرابط */
          if(!vres.ok) throw new Error('proxy ' + vres.status);
          playerUrl = URL.createObjectURL(await vres.blob());
        } catch(e){
          playerUrl = finalSrc; // آخر ملاذ للمشغّل فقط
        }
      }
      /* v-video-modes-by-result: التعليق الصوتيّ دُمج أعلاه إن طُلب — فلا يُعاد هنا */
      if(wantCanvasWrap()){ await wrapWithCanvas(finalIsBlob ? finalSrc : playerUrl, text, ratio, signature, false, ''); return; }
      setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
      resultEl.src = playerUrl;
      resultEl.style.display = 'block';
      resultEl.play().catch(function(){ /* autoplay may be blocked */ });
      downloadEl.href = dlUrl;
      downloadEl.download = finalIsBlob ? dlName('omran-ai-video', finalSrc && finalSrc.type) : 'omran-ai-video.mp4'; // v-vmk-dl-ext
      downloadEl.style.display = 'block';
      /* v-ai-video-speed: الترقية بعد ظهور الفيديو لا قبله (مشهد واحد؛ الطويل بلا ترقية أصلًا) */
      if(wantQuality && sceneUrls.length === 1) upgradeInBackground(sceneUrls[0], token, narrationBlob, runSeq);
    } catch(e){
      if(longPartial && longPartial.length) showPartialScenes(longPartial.slice(), 2, friendlyError(e));
      else setStatus(friendlyError(e));
    } finally {
      btnGenerate.disabled = false;
    }
  };
  /* v-director-timed (المالك ٧ نوفمبر: «اريده الشخص نفسه يحط التوقيت مع الملاحظات لين ٥ دقائق»، ثمّ «ابدأ… في المخرج» واختار «فيديو AI»):
     «بتوقيتي» في «مخرج التطبيق» (video.js) يرسل مقاطعه هنا: كلّ مقطع (٥–٣٠ ث + ملاحظة) يُقسَّم مشاهد ١٠/٥ ث بالمحرّك نفسه الذي يبني
     «طويل (دقائق)» (createSceneWithRetry بنمط الطويل)، بالتتابع، ثمّ تُلصق (concatScenes). بلا سيناريو آليّ ولا سرد. للمالك وحده،
     والرصيد يُفحص قبل أوّل مشهد فلا يُصرف على تشغيلة لا تكتمل؛ وما اكتمل قبل عطب يعود في e.partial فلا يضيع مدفوع. */
  window.__vmkProxyUrl = proxyVideoUrl;
  window.__vmkTimelinePlan = function(segs){
    /* v-director-steady (المالك ٧ نوفمبر: «عند توليد الفيديو فيه حركه كانه واحد ماسك الكاميره ويركض ويصور»): الخادم يختم كلّ وصف واقعيّ
       بـ«تصوير حيّ بكاميرا حقيقيّة» (RW_STYLE_REAL) بلا كلمة عن ثبات الكاميرا، فيميل المحرّك إلى كاميرا محمولة تهتزّ وتندفع. كلّ مشهد من
       «بتوقيتي» يُختم بأمر كاميرا ناعمة ثابتة — بالإنجليزيّة (المحرّك يطيع أوامر الكاميرا بها أدقّ) وبعد ملاحظة المالك. قصير عمدًا:
       ملاحظة ٥٠٠ + «استكمال» + هذا ≤ ٧٥٠ (حدّ الوصف ١٠٠٠ ناقص لاحقة الخادم) فلا يُقصّ شيء منهما. */
    const STEADY = ' — Camera: smooth stabilized cinematic move (gimbal, dolly or slow drone), level horizon; no handheld shake, no shaky or running camera, no whip pans.';
    const plan = [];
    (segs || []).forEach((s) => {
      let rem = Math.max(5, Math.min(30, Math.round((Number(s && s.d) || 0) / 5) * 5)), k = 0;
      const note = String((s && s.n) || '').trim();
      while(rem > 0){
        const d = rem >= SCENE_SECONDS_CONST ? SCENE_SECONDS_CONST : 5;
        plan.push({ prompt: note + (k ? bT(' (استكمال نفس المشهد، اللحظة التالية)', ' (continuing the same scene, next moment)') : '') + STEADY, d });
        rem -= d; k++;
      }
    });
    return plan;
  };
  window.__vmkTimelineRun = async function(segs, hooks){
    const hk = hooks || {};
    const say = (k, a, b) => { try{ if(hk.status) hk.status(k, a, b); }catch(e){ __swallow(e, 'video:timeline-status'); } };
    if(!isOwnerAccount()) throw Object.assign(new Error('owner_only'), { code: 'owner_only' });
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token) throw Object.assign(new Error('auth_required'), { code: 'auth_required' });
    const plan = window.__vmkTimelinePlan(segs);
    if(!plan.length) throw Object.assign(new Error('empty'), { code: 'empty' });
    try{
      const r = await fetch('/api/video?action=video-balance&token=' + (typeof ownerToken === 'function' ? ownerToken() : ''));
      const d = await r.json();
      const needed = plan.length * 50;
      if(d && typeof d.credits === 'number' && d.credits >= 0 && d.credits < needed) throw Object.assign(new Error('tl_credits'), { code: 'tl_credits', credits: d.credits, needed });
    }catch(e){ if(e && e.code === 'tl_credits') throw e; __swallow(e, 'video:timeline-balance'); /* فحص الرصيد اجتهاد — عطب الشبكة لا يوقف */ }
    const style = styleEl ? styleEl.value : '', ratio = ratioEl ? ratioEl.value : '1280:720';
    const urls = [];
    try{
      for(let i = 0; i < plan.length; i++){
        say('scene', i + 1, plan.length);
        const url = await sceneInSequence(i + 1, plan.length, () => createSceneWithRetry(plan[i].prompt, style, plan[i].d, ratio, token, true, () => say('scene', i + 1, plan.length)));
        urls.push(url);
      }
    }catch(e){ if(e && typeof e === 'object') e.partial = urls.slice(); throw e; }
    say('join');
    try{ return { blob: await concatScenes(urls), urls }; }
    catch(e){ __swallow(e, 'video:timeline-join'); return { blob: null, urls }; }
  };
  /* v-audit-video (cli-video-4): «إنشاء» يخفي الناتج السابق وزرّ تحميله قبل أيّ فحص — فإلغاء نافذة الخصم أو المهلة أو الرصيد يتركهما
     مخفيّين والفيديو المدفوع لا يُرى. الغلاف يعيدهما (والوضع واسم الملفّ) ما لم يظهر ناتج جديد. */
  { const __vmkGenRun = btnGenerate.onclick;
    btnGenerate.onclick = async function(ev){
      const prev = (resultEl.style.display !== 'none' && resultEl.getAttribute('src'))
        ? { src: resultEl.getAttribute('src'), mode: resultEl.dataset.mode, dl: downloadEl.style.display, name: downloadEl.download } : null;
      try{ return await __vmkGenRun.call(this, ev); }
      finally{
        if(prev && resultEl.style.display === 'none' && resultEl.getAttribute('src') === prev.src){
          if(prev.mode == null) delete resultEl.dataset.mode; else resultEl.dataset.mode = prev.mode;
          resultEl.style.display = 'block'; downloadEl.style.display = prev.dl; downloadEl.download = prev.name;
        }
      }
    };
  }
})();
