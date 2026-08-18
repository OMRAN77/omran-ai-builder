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
    if(!url || /^blob:/.test(url)) return url;
    return '/api/video-download?url=' + encodeURIComponent(url);
  }

  async function autoSaveVideo(url, name){
    try{
      let href = url;
      if(!/^blob:/.test(String(url))){
        const b = await fetch(proxyVideoUrl(url)).then(r => r.blob());
        href = URL.createObjectURL(b);
      }
      const a = document.createElement('a');
      a.href = href; a.download = name || 'omran-ai-video.mp4';
      document.body.appendChild(a); a.click(); a.remove();
    }catch(_){ /* فشل صامت — زر التحميل اليدوي موجود */ }
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
        d.clientErrors.slice(0,5).forEach(e => {
          lines.push('   • ' + String(e.message || '').slice(0,120) + (e.count > 1 ? ' (x' + e.count + ')' : ''));
        });
      } else {
        lines.push('✅ لا توجد أخطاء مسجلة من المستخدمين');
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
    const isFilm = durationEl.value === 'film';
    const isVeo = modeEl.value === 'veo';
    if(heroRowEl) heroRowEl.style.display = (isFilm && !isVeo) ? 'block' : 'none';
    if(noteEl) noteEl.style.display = (isFilm && isVeo) ? 'block' : 'none';
    if(isVeo && window.__clearFilmHero) window.__clearFilmHero();
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
  };
  durationEl.onchange = () => {
    const isLong = durationEl.value === 'long20';
    const isLongMinutes = durationEl.value === 'longMinutes';
    const isFilm = durationEl.value === 'film';
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
    } else {
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
      ffmpeg.writeFile(name, await fetchFile(proxyVideoUrl(urls[i])));
      listTxt += "file '" + name + "'\n";
    }
    ffmpeg.writeFile('list.txt', listTxt);
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
    ffmpeg.writeFile('v.mp4', await fetchFile(videoSrc));
    ffmpeg.writeFile('a.mp3', await fetchFile(audioBlob));
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
      ffmpeg.writeFile('v' + i + '.mp4', await fetchFile(proxyVideoUrl(scenes[i].videoUrl)));
      const hasAudio = scenes[i].audioBlob && scenes[i].audioBlob.size > 0;
      if(hasAudio){
        ffmpeg.writeFile('a' + i + '.mp3', await fetchFile(scenes[i].audioBlob));
        await ffmpeg.exec(['-i', 'v' + i + '.mp4', '-i', 'a' + i + '.mp3', '-c:v', 'copy', '-map', '0:v:0', '-map', '1:a:0', 'm' + i + '.mp4']);
        await rm('a' + i + '.mp3');
      } else {
        await ffmpeg.exec(['-i', 'v' + i + '.mp4', '-c', 'copy', 'm' + i + '.mp4']);
      }
      // Free memory scene-by-scene so phones don't run out of RAM and crash.
      await rm('v' + i + '.mp4');
      listTxt += "file 'm" + i + ".mp4'\n";
    }
    ffmpeg.writeFile('list.txt', listTxt);
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
              reason = isEn()
                ? 'Content was rejected by safety filters — try a calmer description, or remove the person photo.'
                : 'الرقابة رفضت المحتوى — جرّب وصفًا أهدأ (بدون عنف أو خطر)، أو شِل صورة الشخص وحاول من جديد.';
            }
            reject(new Error((isEn() ? 'Video generation failed.' : 'فشل إنشاء الفيديو.') + (reason ? (' — ' + reason) : '')));
          } else {
            setStatus((isEn() ? '⏳ Status: ' : '⏳ الحالة: ') + (data.status || '...'));
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
    ffmpeg.writeFile(inName, await fetchFile(videoSrc));
    ffmpeg.writeFile('ain.mp3', await fetchFile(audioBlob));
    const vcodec = isWebmSource ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy'];
    await ffmpeg.exec(['-i', inName, '-i', 'ain.mp3', ...vcodec, '-map', '0:v:0', '-map', '1:a:0', '-shortest', 'muxout.mp4']);
    const data = await ffmpeg.readFile('muxout.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  async function runCanvasOnly(text, ratio, seconds, signature, wantNarration, narrationVal){
    setStatus(isEn() ? '🎨 Rendering canvas video...' : '🎨 جاري إنشاء فيديو الكانفا...');
    const clipBlob = await recordCanvasClip({ title: text, signature, seconds, ratio });
    let finalBlob = clipBlob;
    if(wantNarration){
      try{
        setStatus(isEn() ? '🎙️ Generating narration...' : '🎙️ جاري إنشاء التعليق الصوتي...');
        const narrationInput = narrationVal || text;
        const ttsRes = await fetch('/api/tts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: narrationInput, voice: 'maha', lang: isEn() ? 'en' : 'ar' }),
        });
        if(ttsRes.ok){
          const audioBlob = await ttsRes.blob();
          setStatus(isEn() ? '🎚️ Merging narration...' : '🎚️ جاري دمج الصوت...');
          finalBlob = await muxNarrationAny(clipBlob, audioBlob, true);
        }
      } catch(e){ /* keep silent clip on failure */ }
    }
    const finalUrl = URL.createObjectURL(finalBlob);
    setStatus(isEn() ? '✅ Done!' : '✅ تم الانتهاء!');
    resultEl.src = finalUrl;
    resultEl.style.display = 'block';
    downloadEl.href = finalUrl;
    downloadEl.style.display = 'block';
    autoSaveVideo(finalUrl);
  }

  async function runHybrid(text, style, ratio, durationVal, signature, token, wantNarration, narrationVal){
    const seconds = (durationVal === 'long20') ? 10 : (parseInt(durationVal, 10) || 5);
    setStatus(isEn() ? '🎨 Building intro...' : '🎨 جاري إنشاء المقدمة...');
    const introBlob = await recordCanvasClip({ title: text, signature: '', seconds: 2, ratio });
    setStatus(isEn() ? '🎨 Building outro...' : '🎨 جاري إنشاء الخاتمة...');
    const outroBlob = await recordCanvasClip({
      title: '',
      signature: signature ? ((isEn() ? 'Made by: ' : 'صُنع بواسطة: ') + signature) : (isEn() ? 'Made with Omran AI Video' : 'صُنع بواسطة صانع فيديو عمران'),
      seconds: 2, ratio,
    });

    setStatus(isEn() ? '🚀 Sending request to the AI video engine...' : '🚀 جاري إرسال الطلب لمحرك الفيديو الذكي...');
    const mainUrl = await createSceneWithRetry(text, style, seconds, ratio, token, false, (attempt, max) => {
      setStatus(isEn()
        ? '⏳ The AI engine is busy, retrying (' + attempt + '/' + max + ')...'
        : '⏳ محرك الفيديو مزدحم، جاري إعادة المحاولة (' + attempt + '/' + max + ')...');
    });
    setStatus(isEn() ? '🎬 Finalizing your video...' : '🎬 جاري إنهاء الفيديو...');

    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('/ffmpeg/util/index.js');

    ffmpeg.writeFile('intro.webm', await fetchFile(introBlob));
    ffmpeg.writeFile('outro.webm', await fetchFile(outroBlob));
    ffmpeg.writeFile('main.mp4', await fetchFile(mainUrl));

    let mainForConcat = 'main.mp4';
    if(signature){
      setStatus(isEn() ? '✍️ Adding your signature watermark...' : '✍️ جاري إضافة توقيعك على الفيديو...');
      const wmBlob = await makeWatermarkPng(signature, ratio);
      ffmpeg.writeFile('wm.png', await fetchFile(wmBlob));
      await ffmpeg.exec(['-i', 'main.mp4', '-i', 'wm.png', '-filter_complex', 'overlay=0:H-h:shortest=1', '-c:a', 'copy', 'main_wm.mp4']);
      mainForConcat = 'main_wm.mp4';
    }

    setStatus(isEn() ? '🔗 Merging canvas + AI video...' : '🔗 جاري دمج الكانفا مع فيديو الذكاء الاصطناعي...');
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
        setStatus(isEn() ? '🎙️ Generating narration...' : '🎙️ جاري إنشاء التعليق الصوتي...');
        const narrationInput = narrationVal || text;
        const ttsRes = await fetch('/api/tts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: narrationInput, voice: 'maha', lang: isEn() ? 'en' : 'ar' }),
        });
        if(ttsRes.ok){
          const audioBlob = await ttsRes.blob();
          setStatus(isEn() ? '🎚️ Merging narration...' : '🎚️ جاري دمج الصوت...');
          finalBlob = await muxNarrationAny(finalBlob, audioBlob, false);
        }
      } catch(e){ /* keep video without narration */ }
    }

    const finalUrl = URL.createObjectURL(finalBlob);
    setStatus(isEn() ? '✅ Done!' : '✅ تم الانتهاء!');
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
  (function(){
    const btn = document.getElementById('videoMakerHeroBtn');
    const inp = document.getElementById('videoMakerHeroInput');
    const prev = document.getElementById('videoMakerHeroPreview');
    const clr = document.getElementById('videoMakerHeroClear');
    if(!btn || !inp) return;
    btn.onclick = () => inp.click();
    clr.onclick = window.__clearFilmHero = () => {
      filmHeroBase64 = null;
      inp.value = '';
      prev.style.display = 'none';
      clr.style.display = 'none';
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
      };
      img.src = URL.createObjectURL(f);
    };
  })();

  btnGenerate.onclick = async () => {
    const text = (promptEl.value || '').trim();
    if(!text && modeEl.value !== 'actor'){
      setStatus(isEn() ? '⚠️ Please describe the video first.' : '⚠️ اكتب وصف الفيديو أولًا.');
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      setStatus(isEn() ? '🔑 Please log in first to use the Video Maker.' : '🔑 يجب تسجيل الدخول أولًا لاستخدام صانع الفيديو.');
      return;
    }

    const style = styleEl.value;
    const ratio = ratioEl.value;
    const isLong = durationEl.value === 'long20';
    const wantNarration = narrationToggle.checked;
    const wantQuality = qualityToggle.checked && !isLong;

    btnGenerate.disabled = true;
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';

    function friendlyError(err){
      const code = err && err.code;
      if(code === 'auth_required') return isEn() ? '🔑 Please log in first to use the Video Maker.' : '🔑 يجب تسجيل الدخول أولًا لاستخدام صانع الفيديو.';
      if(code === 'daily_limit_reached') return isEn() ? "⏳ You have reached today's free video limit. Try again tomorrow." : '⏳ لقد استهلكت حد الفيديوهات المجانية لليوم. حاول مرة أخرى غدًا.';
      return (isEn() ? '❌ Error: ' : '❌ خطأ: ') + (err && err.message ? err.message : String(err));
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
            else if(d.status === 'FAILED'){ clearInterval(iv); reject(new Error((isEn() ? 'Veo failed.' : 'فشل Veo.') + (d.failure ? ' — ' + d.failure : ''))); }
          } catch(e){ /* keep polling */ }
        }, 8000);
      });
    }

    if(durationEl.value === 'film'){
      try{
        const filmUseVeo = (creationMode === 'veo');
        if(filmUseVeo && !isOwnerAccount()){
          setStatus(isEn() ? '🔒 Veo 3 is limited to the owner account for now.' : '🔒 Veo 3 مقتصر على حساب المالك حاليًا.');
          btnGenerate.disabled = false;
          return;
        }
        const filmScenes = isOwnerAccount() ? 5 : 3;
        setStatus(isEn() ? '✍️ Writing the film script scene by scene...' : '✍️ جاري كتابة سيناريو الفيلم مشهد بمشهد...');
        const scriptRes = await fetch('/api/video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: text, mode: 'film', sceneCount: filmScenes, style, lang: (isEn() ? 'en' : 'ar'), hero: !!filmHeroBase64, token }),
        });
        const scriptData = await scriptRes.json();
        if(scriptRes.status === 401){ const e = new Error('auth'); e.code = 'auth_required'; throw e; }
        if(scriptRes.status === 403 && scriptData && scriptData.error === 'daily_limit_reached'){ const e = new Error('limit'); e.code = 'daily_limit_reached'; throw e; }
        if(!scriptRes.ok || scriptData.error || !Array.isArray(scriptData.scenes) || !scriptData.scenes.length){
          throw new Error(scriptData.error || (isEn() ? 'Could not generate the film script.' : 'تعذّر إنشاء سيناريو الفيلم.'));
        }
        const scenes = scriptData.scenes.slice(0, filmScenes);
        if(!filmUseVeo){
          setStatus(isEn() ? '💳 Checking video credits...' : '💳 جاري التأكد من رصيد الفيديو...');
          const ok = await ensureRunwayCredits(scenes.length * 50);
          if(!ok){ btnGenerate.disabled = false; return; }
        }
        if(filmUseVeo && filmHeroBase64){
          setStatus(isEn() ? 'ℹ️ Hero photo is supported with Runway only; continuing without it...' : 'ℹ️ صورة البطل مدعومة مع Runway فقط؛ سيتم المتابعة بدونها...');
        }
        const confirmMsg = isEn()
          ? `🎬 "${scriptData.title || text}" — ${scenes.length} scenes (~${scenes.length * SCENE_SECONDS_CONST}s) with narration will be generated and merged. This uses ${scenes.length} of your daily video allowance. Continue?`
          : `🎬 «${scriptData.title || text}» — راح نولّد ${scenes.length} مشاهد (~${scenes.length * SCENE_SECONDS_CONST} ثانية) مع سرد صوتي وندمجها بفيلم واحد. هذا يستهلك ${scenes.length} من حصتك اليومية للفيديو. تكمل؟`;
        if(!window.confirm(confirmMsg)){
          setStatus(isEn() ? '❌ Cancelled.' : '❌ تم الإلغاء.');
          btnGenerate.disabled = false;
          return;
        }
        const builtScenes = [];
        for(let i = 0; i < scenes.length; i++){
          const sc = scenes[i];
          setStatus((isEn() ? '🎥 Generating scene ' : '🎥 جاري توليد المشهد ') + (i + 1) + '/' + scenes.length + (filmUseVeo ? ' (Veo 3)' : '') + '...');
          const videoUrl = filmUseVeo
            ? await createVeoScene(sc.visual || text, ratio, token, wantQuality)
            : await createSceneWithRetry(sc.visual || text, style, SCENE_SECONDS_CONST, ratio, token, false, (attempt, max) => {
                setStatus(isEn()
                  ? '⏳ The AI engine is busy, retrying scene ' + (i + 1) + ' (' + attempt + '/' + max + ')...'
                  : '⏳ محرك الفيديو مزدحم، جاري إعادة محاولة المشهد ' + (i + 1) + ' (' + attempt + '/' + max + ')...');
              }, filmHeroBase64, filmHeroMime);
          setStatus((isEn() ? '🎙️ Narrating scene ' : '🎙️ جاري تسجيل سرد المشهد ') + (i + 1) + '/' + scenes.length + '...');
          let audioBlob = null;
          try{
            const ttsCtl = new AbortController();
            const ttsTimer = setTimeout(() => ttsCtl.abort(), 45000);
            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: sc.narration || text, voice: 'onyx' }),
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
              setStatus((isEn() ? '▶️ Scene ' : '▶️ المشهد ') + (idx + 1) + '/' + builtScenes.length);
            } else {
              setStatus(isEn() ? '✅ All scenes played.' : '✅ انتهى عرض كل المشاهد.');
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
            a.textContent = (isEn() ? '⬇️ Scene ' : '⬇️ مشهد ') + (i + 1);
            a.style.cssText = 'padding:6px 12px;border-radius:10px;background:rgba(139,92,246,.18);color:inherit;text-decoration:none;font-size:13px;';
            linksEl.appendChild(a);
          });
          setStatus(isEn()
            ? '✅ Your film is ready! Scenes will play back-to-back — download each scene below.'
            : '✅ فيلمك جاهز! المشاهد تُعرض ورا بعض تلقائيًا — وتقدر تحمّل كل مشهد من الأزرار تحت.');
        };
        const oldLinks = document.getElementById('filmSceneLinks');
        if(oldLinks) oldLinks.innerHTML = '';
        resultEl.onended = null;
        const isPhone = /Android|iPhone|iPad|iPod|Mobile|Huawei|HarmonyOS/i.test(navigator.userAgent) && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
        if(isPhone && builtScenes.length > 2){
          // Skip the heavy in-browser merge entirely on phones — it crashes the tab.
          showScenesPlaylist();
        } else {
          setStatus(isEn() ? '🔗 Merging all scenes into your final film...' : '🔗 جاري دمج كل المشاهد بالفيلم النهائي...');
          let finalUrl = null;
          try{
            const finalBlob = await buildLongVideo(builtScenes, (i, total) => {
              setStatus((isEn() ? '🔗 Merging scene ' : '🔗 جاري دمج المشهد ') + (i + 1) + '/' + total + '...');
            });
            finalUrl = URL.createObjectURL(finalBlob);
          } catch(e){
            try{
              const blob = await concatScenes(builtScenes.map(s => s.videoUrl));
              finalUrl = URL.createObjectURL(blob);
              setStatus(isEn() ? '⚠️ Narration merge failed; film merged without narration.' : '⚠️ تعذّر دمج السرد؛ تم دمج الفيلم بدون السرد.');
            } catch(e2){
              finalUrl = null;
            }
          }
          if(finalUrl){
            setStatus(isEn() ? '✅ Your film is ready!' : '✅ فيلمك جاهز!');
            resultEl.src = finalUrl;
            resultEl.style.display = 'block';
            downloadEl.href = finalUrl;
            downloadEl.style.display = 'block';
            autoSaveVideo(finalUrl);
          } else {
            // Merge failed — never lose the scenes: play them back-to-back instead.
            showScenesPlaylist();
          }
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
          setStatus(isEn() ? '🔒 Veo 3 is limited to the owner account for now.' : '🔒 Veo 3 مقتصر على حساب المالك حاليًا.');
          return;
        }
        let veoPrompt = text;
        if(creationMode === 'actor'){
          const speechEl = document.getElementById('videoMakerActorSpeech');
          const speech = speechEl ? speechEl.value.trim() : '';
          if(!speech){
            setStatus(isEn() ? '🗣️ Write what the actor should say first.' : '🗣️ اكتب أول شي وش يقول الممثل.');
            return;
          }
          veoPrompt = (text || 'An Emirati man in traditional white kandura and ghutra, warm friendly face')
            + '. The person looks directly at the camera and speaks in Emirati Gulf Arabic dialect (لهجة إماراتية خليجية), saying exactly these Arabic words: "' + speech + '". '
            + 'Perfect accurate lip-sync matching the Arabic words, natural authentic Emirati voice and accent, natural hand gestures, cinematic lighting, realistic. No subtitles, no captions, no text on screen.';
        }
        setStatus(isEn() ? '🚀 Sending to Google Veo 3...' : '🚀 جاري الإرسال إلى Google Veo 3...');
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
              else if(d.status === 'FAILED'){ clearInterval(iv); reject(new Error((isEn() ? 'Veo failed.' : 'فشل Veo.') + (d.failure ? ' — ' + d.failure : ''))); }
              else setStatus(isEn() ? '⏳ Veo 3 is generating (may take 1-3 min)...' : '⏳ Veo 3 يولّد الفيديو (قد يستغرق ١-٣ دقائق)...');
            } catch(e){ /* keep polling */ }
          }, 8000);
        });
        setStatus(isEn() ? '⬇️ Downloading the video...' : '⬇️ جاري تحميل الفيديو...');
        const vres = await fetch(proxyVideoUrl(videoUrl));
        if(!vres.ok) throw new Error('download failed ' + vres.status);
        const vblob = await vres.blob();
        const vurl = URL.createObjectURL(vblob);
        setStatus(isEn() ? '✅ Done!' : '✅ تم الانتهاء!');
        resultEl.src = vurl;
        resultEl.style.display = 'block';
        downloadEl.href = vurl;
        downloadEl.style.display = 'block';
        autoSaveVideo(vurl);
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
          setStatus(isEn() ? '🔒 This feature is limited to the owner account.' : '🔒 هذه الميزة مقتصرة على حساب المالك.');
          btnGenerate.disabled = false;
          return;
        }
        const mins = Math.max(1, Math.min(10, parseInt(longMinutesInput.value, 10) || 1));
        setStatus(isEn() ? '✍️ Writing the full scene-by-scene script...' : '✍️ جاري كتابة السكربت كامل مشهد بمشهد...');
        const scriptRes = await fetch('/api/video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: text, minutes: mins, style, lang: (isEn() ? 'en' : 'ar'), token }),
        });
        const scriptData = await scriptRes.json();
        if(!scriptRes.ok || scriptData.error || !Array.isArray(scriptData.scenes) || !scriptData.scenes.length){
          throw new Error(scriptData.error || (isEn() ? 'Could not generate the script.' : 'تعذّر إنشاء السكربت.'));
        }
        const scenes = scriptData.scenes;
        setStatus(isEn() ? '💳 Checking video credits...' : '💳 جاري التأكد من رصيد الفيديو...');
        const okBal = await ensureRunwayCredits(scenes.length * 50);
        if(!okBal){ btnGenerate.disabled = false; return; }
        const estLow = (scenes.length * 2).toFixed(0);
        const estHigh = (scenes.length * 5).toFixed(0);
        const confirmMsg = isEn()
          ? `This video will generate ${scenes.length} scenes (~${(scenes.length * SCENE_SECONDS_CONST) / 60 | 0} min). Estimated real cost: about $${estLow}-$${estHigh} charged to your Runway account. Continue?`
          : `هذا الفيديو راح يولّد ${scenes.length} مشهد (~${(scenes.length * SCENE_SECONDS_CONST / 60) | 0} دقيقة). التكلفة التقديرية الحقيقية: حوالي ${estLow}$-${estHigh}$ تُخصم من حساب Runway. تكمل؟`;
        if(!window.confirm(confirmMsg)){
          setStatus(isEn() ? '❌ Cancelled.' : '❌ تم الإلغاء.');
          btnGenerate.disabled = false;
          return;
        }

        const builtScenes = [];
        for(let i = 0; i < scenes.length; i++){
          const sc = scenes[i];
          setStatus((isEn() ? '🚀 Sending scene ' : '🚀 جاري إرسال المشهد ') + (i + 1) + '/' + scenes.length + '...');
          const videoUrl = await createSceneWithRetry(sc.visual || text, style, SCENE_SECONDS_CONST, ratio, token, true, (attempt, max) => {
            setStatus(isEn()
              ? '⏳ The AI engine is busy, retrying scene ' + (i + 1) + ' (' + attempt + '/' + max + ')...'
              : '⏳ محرك الفيديو مزدحم، جاري إعادة محاولة المشهد ' + (i + 1) + ' (' + attempt + '/' + max + ')...');
          });
          setStatus((isEn() ? '🎙️ Narrating scene ' : '🎙️ جاري تسجيل صوت المشهد ') + (i + 1) + '/' + scenes.length + '...');
          let audioBlob = null;
          try{
            const ttsCtl2 = new AbortController();
            const ttsTimer2 = setTimeout(() => ttsCtl2.abort(), 45000);
            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: sc.narration || text, voice: 'onyx' }),
              signal: ttsCtl2.signal,
            });
            clearTimeout(ttsTimer2);
            if(ttsRes.ok) audioBlob = await ttsRes.blob();
          } catch(e){ /* narration is best-effort */ }
          builtScenes.push({ videoUrl, audioBlob: audioBlob || new Blob() });
        }

        setStatus(isEn() ? '🔗 Joining all scenes with narration into the final video...' : '🔗 جاري دمج كل المشاهد مع السرد بالفيديو النهائي...');
        const finalBlob = await buildLongVideo(builtScenes, (i, total) => {
          setStatus((isEn() ? '🔗 Joining scene ' : '🔗 جاري دمج المشهد ') + (i + 1) + '/' + total + '...');
        });
        const finalUrl = URL.createObjectURL(finalBlob);
        setStatus(isEn() ? '✅ Done!' : '✅ تم الانتهاء!');
        resultEl.src = finalUrl;
        resultEl.style.display = 'block';
        downloadEl.href = finalUrl;
        downloadEl.style.display = 'block';
      } catch(e){
        setStatus((isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e)));
      } finally {
        btnGenerate.disabled = false;
      }
      return;
    }

    try{
      let sceneUrls = [];
      const okBal2 = await ensureRunwayCredits(isLong ? 100 : 50);
      if(!okBal2){ btnGenerate.disabled = false; return; }
      if(isLong){
        const scenePrompts = [
          text + (isEn() ? ' (opening moment of the scene)' : ' (اللحظة الافتتاحية للمشهد)'),
          text + (isEn() ? ' (continuing the same scene, next moment)' : ' (استكمال نفس المشهد، اللحظة التالية)'),
        ];
        for(let i = 0; i < scenePrompts.length; i++){
          setStatus((isEn() ? '🚀 Sending scene ' : '🚀 جاري إرسال المشهد ') + (i + 1) + '/' + scenePrompts.length + '...');
          const url = await createSceneWithRetry(scenePrompts[i], style, 10, ratio, token, false, (attempt, max) => {
            setStatus(isEn()
              ? '⏳ The AI engine is busy, retrying (' + attempt + '/' + max + ')...'
              : '⏳ محرك الفيديو مزدحم، جاري إعادة المحاولة (' + attempt + '/' + max + ')...');
          });
          sceneUrls.push(url);
        }
      } else {
        setStatus(isEn() ? '🚀 Sending request...' : '🚀 جاري إرسال الطلب...');
        const url = await createSceneWithRetry(text, style, durationEl.value, ratio, token, false, (attempt, max) => {
          setStatus(isEn()
            ? '⏳ The AI engine is busy, retrying (' + attempt + '/' + max + ')...'
            : '⏳ محرك الفيديو مزدحم، جاري إعادة المحاولة (' + attempt + '/' + max + ')...');
        });
        sceneUrls.push(url);
      }

      let finalSrc = sceneUrls[0];
      let finalIsBlob = false;

      if(sceneUrls.length > 1){
        setStatus(isEn() ? '🔗 Joining scenes together...' : '🔗 جاري دمج المشاهد معًا...');
        try{
          const blob = await concatScenes(sceneUrls);
          finalSrc = blob;
          finalIsBlob = true;
        } catch(e){
          setStatus(isEn() ? '⚠️ Could not join scenes; showing the first scene only.' : '⚠️ تعذّر دمج المشاهد؛ سيتم عرض المشهد الأول فقط.');
        }
      }

      if(wantQuality){
        try{
          setStatus(isEn() ? '🔎 Upscaling video quality...' : '🔎 جاري ترقية جودة الفيديو...');
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
          setStatus(isEn() ? '🎙️ Generating narration...' : '🎙️ جاري إنشاء التعليق الصوتي...');
          const narrationInput = (narrationText.value || '').trim() || text;
          const ttsRes = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: narrationInput, voice: 'onyx' }),
          });
          if(ttsRes.ok){
            const audioBlob = await ttsRes.blob();
            setStatus(isEn() ? '🎚️ Adding narration to the video...' : '🎚️ جاري إضافة التعليق الصوتي للفيديو...');
            const merged = await muxNarration(finalSrc, audioBlob);
            finalSrc = merged;
            finalIsBlob = true;
          }
        } catch(e){
          setStatus(isEn() ? '⚠️ Could not add narration; showing the video without it.' : '⚠️ تعذّر إضافة التعليق الصوتي؛ سيتم عرض الفيديو بدونه.');
        }
      }

      // v525: always serve a blob URL via server proxy — direct cross-origin fetch fails on mobile/Huawei
      let finalUrl;
      if(finalIsBlob){
        finalUrl = URL.createObjectURL(finalSrc);
      } else {
        try{
          setStatus(isEn() ? '⬇️ Downloading video...' : '⬇️ جاري تحميل الفيديو...');
          const vres = await fetch(proxyVideoUrl(finalSrc));
          if(!vres.ok) throw new Error('proxy ' + vres.status);
          finalUrl = URL.createObjectURL(await vres.blob());
        } catch(e){
          // آخر ملاذ: رابط مباشر (قد لا يعمل زر التحميل لكن الفيديو يُشغَّل)
          finalUrl = finalSrc;
        }
      }
      setStatus(isEn() ? '✅ Done!' : '✅ تم الانتهاء!');
      resultEl.src = finalUrl;
      resultEl.style.display = 'block';
      resultEl.play().catch(function(){ /* autoplay may be blocked — user can tap to play */ });
      downloadEl.href = finalUrl;
      downloadEl.style.display = 'block';
      autoSaveVideo(finalUrl);
    } catch(e){
      setStatus(friendlyError(e));
    } finally {
      btnGenerate.disabled = false;
    }
  };
})();
