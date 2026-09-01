/* ---------- 🎬 AI Video Maker (Runway / Veo 3, server-side owner key) ---------- */
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
  // v291: تنزيل تلقائي للفيديو أول ما يجهز
  // v525: proxyVideoUrl — يمرّر رابط الفيديو عبر سيرفر عمران بدل جلبه مباشرة من المتصفح
  // يحل مشكلة CORS على الجوال وهواوي التي تمنع fetch() من مصادر خارجية
  function proxyVideoUrl(url){
    // روابط blob وروابط same-origin (تبدأ بـ /) لا تحتاج بروكسي
    if(!url || /^blob:/.test(url) || /^\//.test(url)) return url;
    return '/api/video-download?url=' + encodeURIComponent(url);
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
      if(!d.redisOk) problems.push('قاعدة البيانات (Redis) لا تستجيب');
      const missing = Object.entries(d.envKeys || {}).filter(([,v]) => !v).map(([k]) => k);
      if(missing.length) problems.push('مفاتيح ناقصة: ' + missing.join(', '));
      if(d.clientErrorsCount > 0){
        const top = (d.clientErrors || []).slice(0,3).map(e => '• ' + String(e.message || '').slice(0,90)).join('\n');
        problems.push('أخطاء مسجلة من المستخدمين: ' + d.clientErrorsCount + '\n' + top);
      }
      if(!problems.length) return; // كل شيء سليم → لا إزعاج
      const bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#3a1010;color:#ffd7d7;padding:10px 44px 10px 14px;font-size:13px;line-height:1.6;white-space:pre-wrap;direction:rtl;box-shadow:0 2px 12px rgba(0,0,0,.5)';
      bar.textContent = '🩺 تنبيه للمالك — توجد ملاحظات في النظام:\n' + problems.join('\n');
      const x = document.createElement('button');
      x.textContent = '✕';
      x.style.cssText = 'position:absolute;top:8px;left:10px;background:none;border:none;color:#ffd7d7;font-size:16px;cursor:pointer';
      x.onclick = () => bar.remove();
      bar.appendChild(x);
      document.body.appendChild(bar);
    }catch(e){ /* فحص صامت — لا نزعج المستخدم إذا فشل */ }
  }, 6000);

  // 🩺 فحص النظام (لوحة المالك)
  window.runHealthCheck = async function(){
    const box = document.getElementById('adminHealthBox');
    if(!box) return;
    box.textContent = '⏳ جاري الفحص...';
    const lines = [];
    const mark = ok => ok ? '✅' : '❌';
    // 1) الصفحات الأساسية
    for(const [name, url] of [['الصفحة الرئيسية','/'], ['manifest.json','/manifest.json'], ['sw.js','/sw.js']]){
      try{ const r = await fetch(url, {cache:'no-store'}); lines.push(mark(r.ok) + ' ' + name + ' (' + r.status + ')'); }
      catch(e){ lines.push('❌ ' + name + ' (فشل الاتصال)'); }
    }
    // 2) فحص الخادم (مفاتيح + Blob + أخطاء المستخدمين)
    try{
      const r = await fetch('/api/system?action=health&token=' + (typeof ownerToken === 'function' ? ownerToken() : '') + '', {cache:'no-store'});
      const d = await r.json();
      if(!r.ok) throw new Error(d.error || r.status);
      lines.push(mark(d.redisOk) + ' قاعدة البيانات (Redis)');
      const missing = Object.entries(d.envKeys || {}).filter(([,v]) => !v).map(([k]) => k);
      lines.push(missing.length ? ('❌ مفاتيح ناقصة: ' + missing.join(', ')) : '✅ كل مفاتيح API موجودة');
      if(d.clientErrorsCount > 0){
        lines.push('⚠️ أخطاء مسجلة من المستخدمين: ' + d.clientErrorsCount);
        /* v-err-date: بلا تاريخ لا نفرق خطأ اليوم عن خطأ الأسبوع الماضي */
        const __fmtD = (iso) => { try{ return iso ? new Date(iso).toLocaleString('en-GB', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : ''; }catch(_){ return ''; } };
        d.clientErrors.slice(0,5).forEach(e => {
          lines.push('   • ' + String(e.message || '').slice(0,160) + (e.count > 1 ? ' (x' + e.count + ')' : '') + (__fmtD(e.lastSeen) ? ' — ' + __fmtD(e.lastSeen) : ''));
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
        lines.push('✅ لا توجد أخطاء مسجلة من المستخدمين');
      }
      /* v-health-srv: أخطاء الخادم نفسها (نداءات النماذج، المسارات) — كانت
         تُسجّل في KV بلا أي نافذة عرض للمالك. */
      if(d.serverErrorsCount > 0){
        lines.push('⚠️ أخطاء الخادم: ' + d.serverErrorsCount);
        (d.serverErrors || []).slice(0,5).forEach(e => {
          const __d2 = (() => { try{ const v = e.lastAt || e.at; return v ? new Date(v).toLocaleString('en-GB', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : ''; }catch(_){ return ''; } })();
          lines.push('   • [' + (e.route || '?') + (e.action ? '/' + e.action : '') + '] ' + String(e.message || '').slice(0,110) + (e.count > 1 ? ' (x' + e.count + ')' : '') + (__d2 ? ' — ' + __d2 : ''));
        });
      } else {
        lines.push('✅ لا توجد أخطاء في الخادم');
      }
    }catch(e){
      lines.push('❌ فحص الخادم فشل: ' + e.message);
    }
    const allOk = !lines.some(l => l.startsWith('❌') || l.startsWith('⚠️'));
    lines.unshift((allOk ? '🟢 النظام سليم' : '🔴 توجد ملاحظات') + ' — ' + new Date().toLocaleTimeString('en-GB'));
    box.textContent = lines.join('\n');
  };
  window.clearClientErrors = async function(){
    const box = document.getElementById('adminHealthBox');
    try{
      const r = await fetch('/api/system?action=client-errors&token=' + (typeof ownerToken === 'function' ? ownerToken() : '') + '', {method:'DELETE'});
      if(box) box.textContent = r.ok ? '🧹 تم مسح سجل الأخطاء ✅' : '❌ فشل المسح (' + r.status + ')';
    }catch(e){ if(box) box.textContent = '❌ فشل المسح: ' + e.message; }
  };
  function setStatus(text){
    statusEl.style.display = text ? 'block' : 'none';
    statusEl.textContent = text || '';
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
          if(heroRowEl){ heroRowEl.style.display = ''; }
          // v525: عند وجود صورة → واقعي تلقائياً لأن الأنيمي يُضيّع تفاصيل الصورة الأصلية
          if(styleEl && styleEl.value !== 'realistic') styleEl.value = 'realistic';
        }catch(he){ try{ __swallow(he,'video:open-hero'); }catch(_){ /* guard-ok */ } }
      }
      modal.style.display = 'flex';
      try{ closeHeaderMenu(); }catch(e){ /* guard-ok — closeHeaderMenu اختيارية */ }
      const owner = isOwnerAccount();
      ensureLongMinutesOption(owner);
      if(!owner && durationEl.value === 'longMinutes'){
        durationEl.value = '5';
        if(typeof durationEl.onchange === 'function') durationEl.onchange();
      }
    }catch(e){ try{ __swallow(e,'video:open-from-chat'); }catch(_){ /* guard-ok */ } }
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  function syncFilmHeroRow(){
    const heroRowEl = document.getElementById('videoMakerHeroRow');
    const noteEl = document.getElementById('videoMakerHeroVeoNote');
    const modeVal = modeEl.value;
    // البطل مدعوم في كل الأوضاع ما عدا: veo (لا يقبل صور)، actor (veo-based)، canvas (مبني على التوقيع)
    const heroSupported = (modeVal !== 'veo' && modeVal !== 'actor' && modeVal !== 'canvas');
    if(heroRowEl) heroRowEl.style.display = heroSupported ? 'block' : 'none';
    if(noteEl) noteEl.style.display = (modeVal === 'veo') ? 'block' : 'none';
    if(!heroSupported && window.__clearFilmHero) window.__clearFilmHero();
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

  function updateModeUI(){
    const m = modeEl.value;
    signatureRow.style.display = (m === 'canvas' || m === 'hybrid') ? 'flex' : 'none';
    const actorRowEl = document.getElementById('videoMakerActorRow');
    if(actorRowEl) actorRowEl.style.display = (m === 'actor') ? 'flex' : 'none';
    syncFilmHeroRow();
  }
  modeEl.onchange = updateModeUI;
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
  async function getFFmpeg(){
    if (ffmpegInstance) return ffmpegInstance;
    const { FFmpeg } = await import('/ffmpeg/lib/index.js');
    const ffmpeg = new FFmpeg();
    await Promise.race([
      ffmpeg.load({
        coreURL: '/ffmpeg/core/ffmpeg-core.js',
        wasmURL: '/ffmpeg/core/ffmpeg-core.wasm',
        classWorkerURL: '/ffmpeg/lib/worker.js',
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('ffmpeg load timeout')), 90000)),
    ]);
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  }

  async function concatScenes(urls){
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');
    const rm = async (n) => { try{ await ffmpeg.deleteFile(n); } catch(e){ __swallow(e, "misc:app-11-video#1"); } };
    let listTxt = '';
    for(let i = 0; i < urls.length; i++){
      const name = 'scene' + i + '.mp4';
      await ffmpeg.writeFile(name, await fetchFile(proxyVideoUrl(urls[i])));
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

  async function muxNarration(videoSrc, audioBlob){
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');
    await ffmpeg.writeFile('v.mp4', await fetchFile(videoSrc));
    await ffmpeg.writeFile('a.mp3', await fetchFile(audioBlob));
    await ffmpeg.exec(['-i', 'v.mp4', '-i', 'a.mp3', '-c:v', 'copy', '-map', '0:v:0', '-map', '1:a:0', 'out2.mp4']);
    const data = await ffmpeg.readFile('out2.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
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
      await ffmpeg.writeFile('v' + i + '.mp4', await fetchFile(proxyVideoUrl(scenes[i].videoUrl)));
      const hasAudio = scenes[i].audioBlob && scenes[i].audioBlob.size > 0;
      if(hasAudio){
        await ffmpeg.writeFile('a' + i + '.mp3', await fetchFile(scenes[i].audioBlob));
        await ffmpeg.exec(['-i', 'v' + i + '.mp4', '-i', 'a' + i + '.mp3', '-c:v', 'copy', '-map', '0:v:0', '-map', '1:a:0', 'm' + i + '.mp4']);
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

  function pollTaskOnce(id){
    return new Promise((resolve, reject) => {
      const iv = setInterval(async () => {
        try{
          const res = await fetch('/api/video-status?id=' + encodeURIComponent(id));
          const data = await res.json();
          if(data.error){ clearInterval(iv); reject(new Error(data.error)); return; }
          if(data.status === 'SUCCEEDED'){
            clearInterval(iv);
            resolve(Array.isArray(data.output) ? data.output[0] : data.output);
          } else if(data.status === 'FAILED'){
            clearInterval(iv);
            let reason = data.failure || data.failureCode || (data.error) || '';
            if(/moderation|SAFETY|content did not pass/i.test(reason)){
              reason = bT('الرقابة رفضت المحتوى — جرّب وصفًا أهدأ (بدون عنف أو خطر)، أو شِل صورة الشخص وحاول من جديد.','Content was rejected by safety filters — try a calmer description, or remove the person photo.');
            }
            reject(new Error((bT('فشل إنشاء الفيديو.','Video generation failed.')) + (reason ? (' — ' + reason) : '')));
          } else {
            setStatus((bT('⏳ الحالة: ','⏳ Status: ')) + (data.status || '...'));
          }
        } catch(e){ /* transient network hiccup; keep polling */ }
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

  function recordCanvasClip({ title, signature, seconds, ratio }){
    return new Promise((resolve, reject) => {
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
          ctx.font = 'bold ' + Math.round(w * 0.045) + 'px sans-serif';
          wrapCanvasText(ctx, title, w / 2, h / 2, w * 0.8, Math.round(w * 0.06));
        }
        if(signature){
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.textAlign = 'center';
          ctx.font = Math.round(w * 0.028) + 'px sans-serif';
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
    });
  }

  function makeWatermarkPng(signature, ratio){
    return new Promise((resolve) => {
      const { w } = ratioDims(ratio);
      const barH = Math.round(w * 0.06);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = barH;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = Math.round(barH * 0.5) + 'px sans-serif';
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
    const vcodec = isWebmSource ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy'];
    await ffmpeg.exec(['-i', inName, '-i', 'ain.mp3', ...vcodec, '-map', '0:v:0', '-map', '1:a:0', '-shortest', 'muxout.mp4']);
    const data = await ffmpeg.readFile('muxout.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  async function runCanvasOnly(text, ratio, seconds, signature, wantNarration, narrationVal){
    setStatus(bT('🎨 جاري إنشاء فيديو الكانفا...','🎨 Rendering canvas video...'));
    const clipBlob = await recordCanvasClip({ title: text, signature, seconds, ratio });
    let finalBlob = clipBlob;
    if(wantNarration){
      try{
        setStatus(bT('🎙️ جاري إنشاء التعليق الصوتي...','🎙️ Generating narration...'));
        const narrationInput = narrationVal || text;
        const ttsRes = await fetch('/api/tts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: narrationInput, voice: 'maha', lang: bT('ar','en'), gender: getNarrationGender() }),
        });
        if(ttsRes.ok){
          const audioBlob = await ttsRes.blob();
          setStatus(bT('🎚️ جاري دمج الصوت...','🎚️ Merging narration...'));
          finalBlob = await muxNarrationAny(clipBlob, audioBlob, true);
        }
      } catch(e){ /* keep silent clip on failure */ }
    }
    const finalUrl = URL.createObjectURL(finalBlob);
    setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
    resultEl.src = finalUrl;
    resultEl.style.display = 'block';
    downloadEl.href = finalUrl;
    downloadEl.style.display = 'block';
    autoSaveVideo(finalUrl);
  }

  async function runHybrid(text, style, ratio, durationVal, signature, token, wantNarration, narrationVal){
    const seconds = (durationVal === 'long20') ? 10 : (parseInt(durationVal, 10) || 5);
    setStatus(bT('🎨 جاري إنشاء المقدمة...','🎨 Building intro...'));
    const introBlob = await recordCanvasClip({ title: text, signature: '', seconds: 2, ratio });
    setStatus(bT('🎨 جاري إنشاء الخاتمة...','🎨 Building outro...'));
    const outroBlob = await recordCanvasClip({
      title: '',
      signature: signature ? ((bT('صُنع بواسطة: ','Made by: ')) + signature) : (bT('صُنع بواسطة صانع فيديو عمران','Made with Omran AI Video')),
      seconds: 2, ratio,
    });

    setStatus(bT('🚀 جاري إرسال الطلب لمحرك الفيديو الذكي...','🚀 Sending request to the AI video engine...'));
    const mainUrl = await createSceneWithRetry(text, style, seconds, ratio, token, false, (attempt, max) => {
      setStatus(isEn()
        ? '⏳ The AI engine is busy, retrying (' + attempt + '/' + max + ')...'
        : '⏳ محرك الفيديو مزدحم، جاري إعادة المحاولة (' + attempt + '/' + max + ')...');
    });
    setStatus(bT('🎬 جاري إنهاء الفيديو...','🎬 Finalizing your video...'));

    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');

    await ffmpeg.writeFile('intro.webm', await fetchFile(introBlob));
    await ffmpeg.writeFile('outro.webm', await fetchFile(outroBlob));
    await ffmpeg.writeFile('main.mp4', await fetchFile(mainUrl));

    let mainForConcat = 'main.mp4';
    if(signature){
      setStatus(bT('✍️ جاري إضافة توقيعك على الفيديو...','✍️ Adding your signature watermark...'));
      const wmBlob = await makeWatermarkPng(signature, ratio);
      await ffmpeg.writeFile('wm.png', await fetchFile(wmBlob));
      await ffmpeg.exec(['-i', 'main.mp4', '-i', 'wm.png', '-filter_complex', 'overlay=0:H-h:shortest=1', '-c:a', 'copy', 'main_wm.mp4']);
      mainForConcat = 'main_wm.mp4';
    }

    setStatus(bT('🔗 جاري دمج الكانفا مع فيديو الذكاء الاصطناعي...','🔗 Merging canvas + AI video...'));
    const { w, h } = ratioDims(ratio);
    await ffmpeg.exec([
      '-i', 'intro.webm', '-i', mainForConcat, '-i', 'outro.webm',
      '-filter_complex',
      '[0:v]scale=' + w + ':' + h + ',fps=30,format=yuv420p[v0];' +
      '[1:v]scale=' + w + ':' + h + ',fps=30,format=yuv420p[v1];' +
      '[2:v]scale=' + w + ':' + h + ',fps=30,format=yuv420p[v2];' +
      '[v0][v1][v2]concat=n=3:v=1:a=0[outv]',
      '-map', '[outv]', 'final.mp4',
    ]);
    const data = await ffmpeg.readFile('final.mp4');
    let finalBlob = new Blob([data.buffer], { type: 'video/mp4' });

    if(wantNarration){
      try{
        setStatus(bT('🎙️ جاري إنشاء التعليق الصوتي...','🎙️ Generating narration...'));
        const narrationInput = narrationVal || text;
        const ttsRes = await fetch('/api/tts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: narrationInput, voice: 'maha', lang: bT('ar','en'), gender: getNarrationGender() }),
        });
        if(ttsRes.ok){
          const audioBlob = await ttsRes.blob();
          setStatus(bT('🎚️ جاري دمج الصوت...','🎚️ Merging narration...'));
          finalBlob = await muxNarrationAny(finalBlob, audioBlob, false);
        }
      } catch(e){ /* keep video without narration */ }
    }

    const finalUrl = URL.createObjectURL(finalBlob);
    setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
    resultEl.src = finalUrl;
    resultEl.style.display = 'block';
    downloadEl.href = finalUrl;
    downloadEl.style.display = 'block';
    autoSaveVideo(finalUrl);
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
    const data = await res.json();
    if(!res.ok || data.error) throw Object.assign(new Error(data.error || 'unknown'), { code: data.error });
    return data.id;
  }

  // Runway's engine allows only 1 generation running at a time on our plan.
  // If another request (from any user, or a stray earlier attempt) is
  // occupying that single slot, a new task can come back THROTTLED and
  // sometimes eventually FAILED — even though nothing is actually wrong
  // with the video description. To make this invisible to the user, we
  // automatically recreate and retry the task a couple of times (with a
  // short backoff) before giving up and showing a real error.
  async function createSceneWithRetry(text, style, duration, ratio, token, longMode, onRetryStatus, imageBase64, imageMime){
    const maxAttempts = 3;
    let lastErr;
    for(let attempt = 1; attempt <= maxAttempts; attempt++){
      try{
        const id = await createScene(text, style, duration, ratio, token, longMode, imageBase64, imageMime);
        const url = await pollTaskOnce(id);
        return url;
      } catch(e){
        lastErr = e;
        if(e && e.code === 'auth_required') throw e;
        if(e && e.code === 'daily_limit_reached') throw e;
        if(e && e.code === 'owner_only') throw e;
        if(attempt < maxAttempts){
          if(onRetryStatus) onRetryStatus(attempt, maxAttempts);
          await new Promise((r) => setTimeout(r, 6000 * attempt));
        }
      }
    }
    throw lastErr;
  }

  /* 📸 صورتك بطل الفيلم — hero photo state */
  let filmHeroBase64 = null, filmHeroMime = 'image/jpeg';

  // 🔊 جنس صوت السرد
  function getNarrationGender(){
    const el = document.querySelector('input[name="videoVoiceGender"]:checked');
    return el ? el.value : 'female';
  }

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
      }
    } catch(_){ /* استعادة صورة البطل المحفوظة ترفٌ: تخزين محجوب أو قيمة تالفة
         يعني بلا معاينة سابقة فقط — لا يمنع اختيار صورة جديدة. */ }

    btn.onclick = () => inp.click();
    clr.onclick = window.__clearFilmHero = () => {
      filmHeroBase64 = null;
      inp.value = '';
      prev.style.display = 'none';
      clr.style.display = 'none';
      try { localStorage.removeItem('omran_hero_b64'); localStorage.removeItem('omran_hero_mime'); }
      catch(_){ /* المسح من التخزين ترفٌ — الصورة أُزيلت من الواجهة أصلًا فوقها. */ }
    };
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if(!f) return;
      const img = new Image();
      img.onload = () => {
        const max = 768;
        let w = img.width, h = img.height;
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
             الجلسة ولا يُحفظ عبرها — والفيديو يُبنى منه كما هو. */ }
      };
      img.src = URL.createObjectURL(f);
    };
  })();

  btnGenerate.onclick = async () => {
    const text = (promptEl.value || '').trim();
    if(!text && modeEl.value !== 'actor'){
      setStatus((typeof window.t === 'function' && window.t('videoNeedDesc') !== 'videoNeedDesc') ? window.t('videoNeedDesc') : (bT('⚠️ اكتب وصف الفيديو أولًا.','⚠️ Please describe the video first.')));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      setStatus(bT('🔑 يجب تسجيل الدخول أولًا لاستخدام صانع الفيديو.','🔑 Please log in first to use the Video Maker.'));
      return;
    }

    const style = styleEl.value;
    const ratio = ratioEl.value;
    // adspot=5ث، reels=10ث — ضبط مدة فعلية لـ Runway
    const _dv = durationEl.value;
    if(_dv === 'adspot') durationEl.value = '5';
    else if(_dv === 'reels') durationEl.value = '10';
    const isLong = durationEl.value === 'long20';
    const wantNarration = narrationToggle.checked;
    const wantQuality = qualityToggle.checked && !isLong;

    btnGenerate.disabled = true;
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';

    function friendlyError(err){
      const code = err && err.code;
      if(code === 'auth_required') return bT('🔑 يجب تسجيل الدخول أولًا لاستخدام صانع الفيديو.','🔑 Please log in first to use the Video Maker.');
      if(code === 'daily_limit_reached') return isEn() ? "⏳ You have reached today's free video limit. Try again tomorrow." : '⏳ لقد استهلكت حد الفيديوهات المجانية لليوم. حاول مرة أخرى غدًا.';
      return (bT('❌ خطأ: ','❌ Error: ')) + (err && err.message ? err.message : String(err));
    }

    const creationMode = modeEl.value;
    const signature = (signatureEl.value || '').trim().slice(0, 60);

    /* ---- 🎬 Full mini-film: idea -> AI script -> multiple scenes -> narration -> merged film.
       Available to ALL logged-in accounts (small scene count); owner gets more scenes. ---- */
    /* Helper: check Runway credits BEFORE starting so nothing is charged on doomed runs. */
    async function ensureRunwayCredits(needed){
      try{
        const r = await fetch('/api/video?action=video-balance');
        const d = await r.json();
        if(typeof d.credits === 'number' && d.credits >= 0 && d.credits < needed){
          setStatus(isEn()
            ? '⛔ Not enough Runway credits (' + d.credits + ' left, ' + needed + ' needed). Nothing was charged. Top up at runwayml.com first.'
            : '⛔ رصيد Runway غير كافي (المتبقي ' + d.credits + '، المطلوب ' + needed + '). لم يُخصم أي شيء. اشحن الرصيد من runwayml.com أولًا.');
          return false;
        }
      } catch(e){ /* balance check is best-effort; do not block on network errors */ }
      return true;
    }

    /* Helper: generate ONE scene via Google Veo 3 (create + poll) and return its video URL. */
    async function createVeoScene(prompt, sceneRatio, sceneToken, hq){
      const cr = await fetch('/api/video?action=veo-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptText: prompt, ratio: sceneRatio, token: sceneToken, quality: hq ? 'high' : 'fast' }),
      });
      const crData = await cr.json();
      if(!cr.ok || crData.error || !crData.op) throw new Error(crData.error || 'veo create failed');
      return await new Promise((resolve, reject) => {
        const iv = setInterval(async () => {
          try{
            const st = await fetch('/api/video?action=veo-status&op=' + encodeURIComponent(crData.op));
            const d = await st.json();
            if(d.error){ clearInterval(iv); reject(new Error(d.error)); return; }
            if(d.status === 'SUCCEEDED'){ clearInterval(iv); resolve(d.output[0]); }
            else if(d.status === 'FAILED'){ clearInterval(iv); reject(new Error((bT('فشل Veo.','Veo failed.')) + (d.failure ? ' — ' + d.failure : ''))); }
          } catch(e){ /* keep polling */ }
        }, 8000);
      });
    }

    if(durationEl.value === 'film'){
      try{
        const filmUseVeo = (creationMode === 'veo');
        if(filmUseVeo && !isOwnerAccount()){
          setStatus(bT('🔒 Veo 3 مقتصر على حساب المالك حاليًا.','🔒 Veo 3 is limited to the owner account for now.'));
          btnGenerate.disabled = false;
          return;
        }
        const filmScenes = isOwnerAccount() ? 5 : 3;
        setStatus(bT('✍️ جاري كتابة سيناريو الفيلم مشهد بمشهد...','✍️ Writing the film script scene by scene...'));
        const scriptRes = await fetch('/api/video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: text, mode: 'film', sceneCount: filmScenes, style, lang: (bT('ar','en')), hero: !!filmHeroBase64, token }),
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
        if(filmUseVeo && filmHeroBase64){
          setStatus(bT('ℹ️ صورة البطل مدعومة مع Runway فقط؛ سيتم المتابعة بدونها...','ℹ️ Hero photo is supported with Runway only; continuing without it...'));
        }
        const builtScenes = [];
        for(let i = 0; i < scenes.length; i++){
          const sc = scenes[i];
          setStatus((bT('🎥 جاري توليد المشهد ','🎥 Generating scene ')) + (i + 1) + '/' + scenes.length + (filmUseVeo ? ' (Veo 3)' : '') + '...');
          // إذا كان هناك بطل: نثبّت موضعه في كل prompt حتى يبدو بنفس المكان عبر المشاهد
          const baseScenePrompt = sc.visual || text;
          const heroAnchor = filmHeroBase64
            ? 'Hero centered in frame, medium shot, consistent camera angle. '
            : '';
          const scenePromptWithHero = heroAnchor + baseScenePrompt;
          const videoUrl = filmUseVeo
            ? await createVeoScene(scenePromptWithHero, ratio, token, wantQuality)
            : await createSceneWithRetry(scenePromptWithHero, style, SCENE_SECONDS_CONST, ratio, token, false, (attempt, max) => {
                setStatus(isEn()
                  ? '⏳ The AI engine is busy, retrying scene ' + (i + 1) + ' (' + attempt + '/' + max + ')...'
                  : '⏳ محرك الفيديو مزدحم، جاري إعادة محاولة المشهد ' + (i + 1) + ' (' + attempt + '/' + max + ')...');
              }, filmHeroBase64, filmHeroMime);
          setStatus((bT('🎙️ جاري تسجيل سرد المشهد ','🎙️ Narrating scene ')) + (i + 1) + '/' + scenes.length + '...');
          let audioBlob = null;
          try{
            const ttsCtl = new AbortController();
            const ttsTimer = setTimeout(() => ttsCtl.abort(), 45000);
            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: sc.narration || text, voice: 'maha', lang: bT('ar','en'), gender: getNarrationGender() }),
              signal: ttsCtl.signal,
            });
            clearTimeout(ttsTimer);
            if(ttsRes.ok) audioBlob = await ttsRes.blob();
          } catch(e){ /* narration is best-effort per scene */ }
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
            resultEl.parentNode.insertBefore(linksEl, resultEl.nextSibling);
          }
          linksEl.innerHTML = '';
          builtScenes.forEach((sc, i) => {
            const a = document.createElement('a');
            a.href = proxyVideoUrl(sc.videoUrl);
            a.download = 'scene-' + (i + 1) + '.mp4';
            a.textContent = (bT('⬇️ مشهد ','⬇️ Scene ')) + (i + 1);
            a.style.cssText = 'padding:6px 12px;border-radius:10px;background:rgba(139,92,246,.18);color:inherit;text-decoration:none;font-size:13px;';
            linksEl.appendChild(a);
          });
          setStatus(bT('✅ فيلمك جاهز! المشاهد تُعرض ورا بعض تلقائيًا — وتقدر تحمّل كل مشهد من الأزرار تحت.','✅ Your film is ready! Scenes will play back-to-back — download each scene below.'));
        };
        const oldLinks = document.getElementById('filmSceneLinks');
        if(oldLinks) oldLinks.innerHTML = '';
        resultEl.onended = null;
        // دائماً ندمج — حتى على هواوي (الدمج يعمل بالجهاز لا بالسيرفر)
        setStatus(bT('🔗 جاري دمج كل المشاهد بالفيلم النهائي...','🔗 Merging all scenes into your final film...'));
        let finalUrl = null;
        try{
          const finalBlob = await buildLongVideo(builtScenes, (i, total) => {
            setStatus((bT('🔗 جاري دمج المشهد ','🔗 Merging scene ')) + (i + 1) + '/' + total + '...');
          });
          finalUrl = URL.createObjectURL(finalBlob);
        } catch(e){
          try{
            const blob = await concatScenes(builtScenes.map(s => s.videoUrl));
            finalUrl = URL.createObjectURL(blob);
            setStatus(bT('⚠️ تعذّر دمج السرد؛ تم دمج الفيلم بدون السرد.','⚠️ Narration merge failed; film merged without narration.'));
          } catch(e2){
            finalUrl = null;
          }
        }
        if(finalUrl){
          setStatus(bT('✅ فيلمك جاهز!','✅ Your film is ready!'));
          resultEl.src = finalUrl;
          resultEl.style.display = 'block';
          downloadEl.href = finalUrl;
          downloadEl.download = 'omran-film.mp4'; // يجبر المتصفح على التحميل لا الفتح
          downloadEl.style.display = 'block';
        } else {
          // آخر ملاذ: عرض المشاهد ورا بعض مع روابط تحميل منفصلة
          showScenesPlaylist();
        }
      } catch(e){
        setStatus(friendlyError(e));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    if(creationMode === 'veo' || creationMode === 'actor'){
      try{
        if(!isOwnerAccount()){
          setStatus(bT('🔒 Veo 3 مقتصر على حساب المالك حاليًا.','🔒 Veo 3 is limited to the owner account for now.'));
          return;
        }
        let veoPrompt = text;
        if(creationMode === 'actor'){
          const speechEl = document.getElementById('videoMakerActorSpeech');
          const speech = speechEl ? speechEl.value.trim() : '';
          if(!speech){
            setStatus(bT('🗣️ اكتب أول شي وش يقول الممثل.','🗣️ Write what the actor should say first.'));
            return;
          }
          veoPrompt = (text || 'An Emirati man in traditional white kandura and ghutra, warm friendly face')
            + '. The person looks directly at the camera and speaks in Emirati Gulf Arabic dialect (لهجة إماراتية خليجية), saying exactly these Arabic words: "' + speech + '". '
            + 'Perfect accurate lip-sync matching the Arabic words, natural authentic Emirati voice and accent, natural hand gestures, cinematic lighting, realistic. No subtitles, no captions, no text on screen.';
        }
        setStatus(bT('🚀 جاري الإرسال إلى Google Veo 3...','🚀 Sending to Google Veo 3...'));
        const cr = await fetch('/api/video?action=veo-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ promptText: veoPrompt, ratio, token, quality: wantQuality ? 'high' : 'fast' }),
        });
        const crData = await cr.json();
        if(!cr.ok || crData.error || !crData.op) throw new Error(crData.error || 'veo create failed');
        const videoUrl = await new Promise((resolve, reject) => {
          const iv = setInterval(async () => {
            try{
              const st = await fetch('/api/video?action=veo-status&op=' + encodeURIComponent(crData.op));
              const d = await st.json();
              if(d.error){ clearInterval(iv); reject(new Error(d.error)); return; }
              if(d.status === 'SUCCEEDED'){ clearInterval(iv); resolve(d.output[0]); }
              else if(d.status === 'FAILED'){ clearInterval(iv); reject(new Error((bT('فشل Veo.','Veo failed.')) + (d.failure ? ' — ' + d.failure : ''))); }
              else setStatus(bT('⏳ Veo 3 يولّد الفيديو (قد يستغرق ١-٣ دقائق)...','⏳ Veo 3 is generating (may take 1-3 min)...'));
            } catch(e){ /* keep polling */ }
          }, 8000);
        });
        setStatus(bT('⬇️ جاري تحميل الفيديو...','⬇️ Downloading the video...'));
        const vres = await fetch(proxyVideoUrl(videoUrl));
        if(!vres.ok) throw new Error('download failed ' + vres.status);
        const vblob = await vres.blob();
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
        const secs = (durationEl.value === 'long20') ? 20 : (durationEl.value === 'longMinutes' ? 30 : (parseInt(durationEl.value, 10) || 5));
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
        await runHybrid(text, style, ratio, durationEl.value, signature, token, wantNarration, (narrationText.value || '').trim());
      } catch(e){
        setStatus(friendlyError(e));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    if(durationEl.value === 'longMinutes'){
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
          body: JSON.stringify({ topic: text, minutes: mins, style, lang: (bT('ar','en')), token }),
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
          ? `This video will generate ${scenes.length} scenes (~${(scenes.length * SCENE_SECONDS_CONST) / 60 | 0} min). Estimated real cost: about $${estLow}-$${estHigh} charged to your Runway account. Continue?`
          : `هذا الفيديو راح يولّد ${scenes.length} مشهد (~${(scenes.length * SCENE_SECONDS_CONST / 60) | 0} دقيقة). التكلفة التقديرية الحقيقية: حوالي ${estLow}$-${estHigh}$ تُخصم من حساب Runway. تكمل؟`;
        if(!window.confirm(confirmMsg)){
          setStatus(bT('❌ تم الإلغاء.','❌ Cancelled.'));
          btnGenerate.disabled = false;
          return;
        }

        const builtScenes = [];
        for(let i = 0; i < scenes.length; i++){
          const sc = scenes[i];
          setStatus((bT('🚀 جاري إرسال المشهد ','🚀 Sending scene ')) + (i + 1) + '/' + scenes.length + '...');
          const lmHeroAnchor = filmHeroBase64 ? 'Hero centered in frame, medium shot, consistent camera angle. ' : '';
          const videoUrl = await createSceneWithRetry(lmHeroAnchor + (sc.visual || text), style, SCENE_SECONDS_CONST, ratio, token, true, (attempt, max) => {
            setStatus(isEn()
              ? '⏳ The AI engine is busy, retrying scene ' + (i + 1) + ' (' + attempt + '/' + max + ')...'
              : '⏳ محرك الفيديو مزدحم، جاري إعادة محاولة المشهد ' + (i + 1) + ' (' + attempt + '/' + max + ')...');
          }, filmHeroBase64, filmHeroMime);
          setStatus((bT('🎙️ جاري تسجيل صوت المشهد ','🎙️ Narrating scene ')) + (i + 1) + '/' + scenes.length + '...');
          let audioBlob = null;
          try{
            const ttsCtl2 = new AbortController();
            const ttsTimer2 = setTimeout(() => ttsCtl2.abort(), 45000);
            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: sc.narration || text, voice: 'maha', lang: bT('ar','en'), gender: getNarrationGender() }),
              signal: ttsCtl2.signal,
            });
            clearTimeout(ttsTimer2);
            if(ttsRes.ok) audioBlob = await ttsRes.blob();
          } catch(e){ /* narration is best-effort */ }
          builtScenes.push({ videoUrl, audioBlob: audioBlob || new Blob() });
        }

        setStatus(bT('🔗 جاري دمج كل المشاهد مع السرد بالفيديو النهائي...','🔗 Joining all scenes with narration into the final video...'));
        const finalBlob = await buildLongVideo(builtScenes, (i, total) => {
          setStatus((bT('🔗 جاري دمج المشهد ','🔗 Joining scene ')) + (i + 1) + '/' + total + '...');
        });
        const finalUrl = URL.createObjectURL(finalBlob);
        setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
        resultEl.src = finalUrl;
        resultEl.style.display = 'block';
        downloadEl.href = finalUrl;
        downloadEl.style.display = 'block';
      } catch(e){
        setStatus((bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e)));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    try{
      let sceneUrls = [];
      const okBal2 = await ensureRunwayCredits(isLong ? 100 : 50);
      if(!okBal2){ btnGenerate.disabled = false; return; }
      const singleHeroAnchor = filmHeroBase64 ? 'Hero centered in frame, medium shot, consistent camera angle. ' : '';
      if(isLong){
        const scenePrompts = [
          singleHeroAnchor + text + (bT(' (اللحظة الافتتاحية للمشهد)',' (opening moment of the scene)')),
          singleHeroAnchor + text + (bT(' (استكمال نفس المشهد، اللحظة التالية)',' (continuing the same scene, next moment)')),
        ];
        for(let i = 0; i < scenePrompts.length; i++){
          setStatus((bT('🚀 جاري إرسال المشهد ','🚀 Sending scene ')) + (i + 1) + '/' + scenePrompts.length + '...');
          const url = await createSceneWithRetry(scenePrompts[i], style, 10, ratio, token, false, (attempt, max) => {
            setStatus(isEn()
              ? '⏳ The AI engine is busy, retrying (' + attempt + '/' + max + ')...'
              : '⏳ محرك الفيديو مزدحم، جاري إعادة المحاولة (' + attempt + '/' + max + ')...');
          }, filmHeroBase64, filmHeroMime);
          sceneUrls.push(url);
        }
      } else {
        setStatus(bT('🚀 جاري إرسال الطلب...','🚀 Sending request...'));
        const url = await createSceneWithRetry(singleHeroAnchor + text, style, durationEl.value, ratio, token, false, (attempt, max) => {
          setStatus(isEn()
            ? '⏳ The AI engine is busy, retrying (' + attempt + '/' + max + ')...'
            : '⏳ محرك الفيديو مزدحم، جاري إعادة المحاولة (' + attempt + '/' + max + ')...');
        }, filmHeroBase64, filmHeroMime);
        sceneUrls.push(url);
      }

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

      if(wantQuality){
        try{
          setStatus(bT('🔎 جاري ترقية جودة الفيديو...','🔎 Upscaling video quality...'));
          const upRes = await fetch('/api/video-upscale-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoUrl: sceneUrls[0], token, resolution: '2k' }),
          });
          const upData = await upRes.json();
          if(upRes.ok && !upData.error){
            const upUrl = await pollTaskOnce(upData.id);
            finalSrc = upUrl;
            finalIsBlob = false;
          }
        } catch(e){ /* upscale is a best-effort enhancement; ignore failures */ }
      }

      if(wantNarration){
        try{
          setStatus(bT('🎙️ جاري إنشاء التعليق الصوتي...','🎙️ Generating narration...'));
          const narrationInput = (narrationText.value || '').trim() || text;
          const ttsRes = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: narrationInput, voice: 'maha', lang: bT('ar','en'), gender: getNarrationGender() }),
          });
          if(ttsRes.ok){
            const audioBlob = await ttsRes.blob();
            setStatus(bT('🎚️ جاري إضافة التعليق الصوتي للفيديو...','🎚️ Adding narration to the video...'));
            const merged = await muxNarration(finalSrc, audioBlob);
            finalSrc = merged;
            finalIsBlob = true;
          }
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
          const vres = await fetch(dlUrl);
          if(!vres.ok) throw new Error('proxy ' + vres.status);
          playerUrl = URL.createObjectURL(await vres.blob());
        } catch(e){
          playerUrl = finalSrc; // آخر ملاذ للمشغّل فقط
        }
      }
      setStatus(bT('✅ تم الانتهاء!','✅ Done!'));
      resultEl.src = playerUrl;
      resultEl.style.display = 'block';
      resultEl.play().catch(function(){ /* autoplay may be blocked */ });
      downloadEl.href = dlUrl;
      downloadEl.style.display = 'block';
    } catch(e){
      setStatus(friendlyError(e));
    } finally {
      btnGenerate.disabled = false;
    }
  };
})();
