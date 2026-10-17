/* v-video-edit (طلب عمران «كتابة وصوت على الفيديو — في المحادثة ومع الفيديوات»):
   محرّر يعمل داخل الجهاز (ffmpeg.wasm): كتابة بتوقيت فوق الفيديو، «اكتب الكلام تلقائيًا» (‎/api/stt‎ بمقاطع
   زمنيّة)، وصوت إضافيّ (ملف من الجهاز أو صوت يقرأ نصًّا ‎/api/tts‎) مزجًا أو استبدالًا.
   الكتابة تُرسَم على canvas (العربيّة تتشكّل صحيحة) ثمّ تُركَّب overlay — لا drawtext (النواة بلا harfbuzz).
   المعاينة والتصدير يرسمان بالدالّة نفسها فما تراه هو ما يخرج. */
(function(){
  'use strict';
  var MAX_SEC = 180, MAX_TEXTS = 60;

  /* ───────── دوالّ خالصة (تُختبر في node) ───────── */
  function r2(n){ return Math.round((+n || 0) * 100) / 100; }
  function isRtl(s){ return /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(String(s || '')); }
  function even(n){ n = Math.round(n); return n - (n % 2); }

  function outDims(w, h, hq){
    w = +w || 0; h = +h || 0;
    if(!(w > 0 && h > 0)){ w = 720; h = 1280; }
    var cap = hq ? 1080 : 720, longCap = hq ? 1920 : 1280;
    var k = Math.min(1, cap / Math.min(w, h), longCap / Math.max(w, h));
    return { w: Math.max(2, even(w * k)), h: Math.max(2, even(h * k)) };
  }

  function parseProbe(log){
    var r = { dur: 0, vcodec: '', hasAudio: false, w: 0, h: 0, fps: 0 };
    var s = String(log || '');
    var m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
    if(m) r.dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    var v = /Stream #\d+:\d+[^\n]*?: Video: ([A-Za-z0-9_]+)([^\n]*)/.exec(s);
    if(v){
      r.vcodec = v[1].toLowerCase();
      var d = /[\s,](\d{2,5})x(\d{2,5})(?=[\s,\[]|$)/.exec(v[2]);
      if(d){ r.w = +d[1]; r.h = +d[2]; }
      var f = /([\d.]+) fps/.exec(v[2]);
      if(f) r.fps = +f[1];
    }
    r.hasAudio = /Stream #\d+:\d+[^\n]*?: Audio: /.test(s);
    return r;
  }

  function wrapLines(text, maxW, measure, maxLines){
    maxLines = maxLines || 8;
    var out = [];
    String(text || '').replace(/\r/g, '').split('\n').forEach(function(p){
      var words = p.trim().split(/\s+/).filter(Boolean), cur = '';
      words.forEach(function(w){
        var t = cur ? cur + ' ' + w : w;
        if(!cur || measure(t) <= maxW) cur = t; else { out.push(cur); cur = w; }
      });
      if(cur) out.push(cur);
    });
    if(out.length > maxLines){ out = out.slice(0, maxLines); out[maxLines - 1] += '…'; }
    return out;
  }

  function fontPx(size, W, H){
    var k = size === 's' ? 0.045 : size === 'l' ? 0.078 : 0.06;
    return Math.max(12, Math.round(Math.min(W, H) * k));
  }

  /* measure(str, px) → عرض السطر بالبكسل */
  function layoutItem(it, W, H, measure){
    var fs = fontPx(it.size, W, H);
    var lines, widths, maxW, tw, i;
    for(var pass = 0; pass < 2; pass++){
      maxW = Math.round(W * 0.88) - 2 * Math.round(fs * 0.45);
      lines = wrapLines(it.text, maxW, function(s){ return measure(s, fs); });
      if(!lines.length) return null;
      widths = lines.map(function(l){ return measure(l, fs); });
      tw = Math.max.apply(null, widths);
      if(tw <= maxW || pass) break;
      fs = Math.max(10, Math.floor(fs * maxW / tw)); /* كلمة طويلة واحدة: نصغّر الخطّ بدل أن تخرج من الإطار */
    }
    var lh = Math.round(fs * 1.38), padX = Math.round(fs * 0.45), padY = Math.round(fs * 0.28);
    var bw = Math.min(even(W), Math.ceil(tw + 2 * padX)), bh = Math.min(even(H), Math.ceil(lines.length * lh + 2 * padY));
    bw += bw % 2; bh += bh % 2;
    var x = even((W - bw) / 2), y;
    if(it.pos === 'top') y = H * 0.07;
    else if(it.pos === 'mid') y = (H - bh) / 2;
    else y = H - bh - H * 0.09;
    y = even(Math.max(0, Math.min(H - bh, y)));
    for(i = 0; i < widths.length; i++) widths[i] = Math.round(widths[i]);
    return { fs: fs, lh: lh, padX: padX, padY: padY, lines: lines, x: x, y: y, w: bw, h: bh };
  }

  /* مقاطع Whisper → أسطر ترجمة: المقطع الطويل يُقسَم (٨ كلمات تقريبًا) والوقت يُوزَّع بعدد الكلمات */
  function segToTexts(segs, T){
    var out = [];
    (segs || []).forEach(function(s){
      var a = +s.start || 0, b = +s.end || 0, t = String(s.text || '').replace(/\s+/g, ' ').trim();
      if(!t || a >= T) return;
      if(b <= a) b = a + 1.5;
      b = Math.min(b, T);
      var words = t.split(' '), n = Math.ceil(words.length / 8);
      if(n <= 1){ out.push({ text: t, a: r2(a), b: r2(Math.max(b, Math.min(T, a + 0.4))) }); return; }
      var per = Math.ceil(words.length / n), span = b - a, used = 0;
      for(var i = 0; i < words.length; i += per){
        var chunk = words.slice(i, i + per), ca = a + span * used / words.length;
        used += chunk.length;
        out.push({ text: chunk.join(' '), a: r2(ca), b: r2(a + span * used / words.length) });
      }
    });
    return out.slice(0, MAX_TEXTS);
  }

  /* o: {inName, dur, W, H, fps, overlays:[{name,x,y,a,b}], audio:{name,mode,loop,vol,origVol}|null,
         hasAudio, mute, copyVideo, vcodec, hq, out} */
  function buildArgs(o){
    var ovs = o.overlays || [], A = o.audio || null;
    var T = Math.min(+o.dur || 0, MAX_SEC);
    var args = ['-hide_banner', '-y', '-i', o.inName];
    ovs.forEach(function(v){ args.push('-i', v.name); });
    var aIdx = -1;
    if(A){ if(A.loop) args.push('-stream_loop', '-1'); args.push('-i', A.name); aIdx = 1 + ovs.length; }
    var fc = [], copyV = !!o.copyVideo && !ovs.length;
    if(!copyV){
      var cur = 'b0';
      fc.push('[0:v]scale=' + o.W + ':' + o.H + ',setsar=1' + ((+o.fps || 0) > 31 ? ',fps=30' : '') + '[b0]');
      ovs.forEach(function(v, i){
        var nx = 'b' + (i + 1);
        fc.push('[' + cur + '][' + (i + 1) + ':v]overlay=' + (v.x || 0) + ':' + (v.y || 0) +
          ":enable='between(t," + r2(v.a) + ',' + r2(v.b) + ")'[" + nx + ']');
        cur = nx;
      });
      fc.push('[' + cur + ']format=yuv420p[vout]');
    }
    var aMap = null;
    if(A){
      var nv = r2(A.vol == null ? 1 : A.vol), ov = r2(A.origVol == null ? 1 : A.origVol);
      if(A.mode === 'mix' && o.hasAudio){
        fc.push('[0:a]volume=' + ov + '[a0]', '[' + aIdx + ':a]volume=' + nv + '[a1]',
          '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]');
      } else {
        fc.push('[' + aIdx + ':a]volume=' + nv + '[aout]');
      }
      aMap = '[aout]';
    }
    if(fc.length) args.push('-filter_complex', fc.join(';'));
    args.push('-map', copyV ? '0:v:0' : '[vout]');
    if(aMap) args.push('-map', aMap);
    else if(!o.mute) args.push('-map', '0:a?');
    if(copyV){
      args.push('-c:v', 'copy');
      if(o.vcodec === 'hevc') args.push('-tag:v', 'hvc1');
    } else {
      args.push('-c:v', 'libx264', '-preset', o.hq ? 'veryfast' : 'ultrafast', '-crf', o.hq ? '20' : '22', '-pix_fmt', 'yuv420p');
    }
    if(aMap || !o.mute) args.push('-c:a', 'aac', '-b:a', '160k');
    else args.push('-an');
    if(T > 0) args.push('-t', String(r2(T)));
    args.push('-movflags', '+faststart', o.out || 'out.mp4');
    return args;
  }

  var pure = { outDims: outDims, parseProbe: parseProbe, wrapLines: wrapLines, layoutItem: layoutItem,
    segToTexts: segToTexts, buildArgs: buildArgs, fontPx: fontPx, isRtl: isRtl, MAX_SEC: MAX_SEC, MAX_TEXTS: MAX_TEXTS };
  if(typeof window !== 'undefined') window.__ved = pure;
  if(typeof module !== 'undefined' && module.exports) module.exports = pure;
  if(typeof document === 'undefined') return;

  /* ───────── النصوص ───────── */
  var S = {
    ar: {
      title: 'كتابة وصوت على الفيديو', menu: 'كتابة وصوت على فيديو', tab: 'كتابة وصوت', close: 'إغلاق',
      pick: 'اختر فيديو من جهازك', pickHint: 'حتى {n} ميغا. التعديل يصير داخل جهازك.', change: 'غيّر الفيديو',
      longNote: 'الفيديو أطول من ٣ دقائق — التعديل على أول ٣ دقائق.', tooBig: 'الفيديو كبير — الحد {n} ميغا.',
      notVideo: 'هذا الملف مو فيديو.', texts: 'الكتابة', addText: 'أضف كتابة', autoCap: 'اكتب الكلام تلقائيًا',
      autoBusy: 'جارٍ تفريغ الكلام…', noSpeech: 'ما لقيت كلام واضح في الفيديو.', noAudio: 'الفيديو ما فيه صوت.',
      capDone: 'انضاف {n} سطر — عدّلها لو تبي.', textPh: 'اكتب هنا…', pos: 'المكان', top: 'فوق', mid: 'الوسط',
      bottom: 'تحت', size: 'الحجم', s: 'صغير', m: 'عادي', l: 'كبير', color: 'اللون', box: 'خلفية', from: 'من',
      to: 'إلى', now: 'الآن', del: 'حذف', applyAll: 'نفس الشكل للكل', maxTexts: 'وصلت الحد ({n}).',
      audio: 'الصوت', aNone: 'بدون صوت إضافي', aFile: 'ملف صوت من جهازك', aTts: 'صوت يقرأ نصّك',
      aFileHint: 'أغنية، موسيقى، قرآن، أو أي تسجيل.', aFilePick: 'اختر ملف الصوت', ttsPh: 'اكتب النص اللي تبيه ينقرأ…',
      female: 'صوت نسائي', male: 'صوت رجالي', ttsMake: 'جهّز الصوت', ttsBusy: 'جارٍ تجهيز الصوت…',
      mix: 'امزجه مع صوت الفيديو', replace: 'بدّل صوت الفيديو', volOrig: 'صوت الفيديو', volNew: 'الصوت الجديد',
      loop: 'كرّره لين آخر الفيديو', mute: 'اكتم صوت الفيديو الأصلي',
      rights: 'استخدم صوتًا من حقّك — بعض المنصّات تكتم الأغاني المحميّة.', exportT: 'التصدير',
      hq: 'جودة عالية 1080 (أبطأ)', exp: 'صدّر الفيديو', loading: 'جارٍ تجهيز المحرّر (أول مرة تاخذ وقت)…',
      working: 'جارٍ التصدير… {p}%', cancel: 'إلغاء', canceled: 'انلغى.', nothing: 'أضف كتابة أو صوت أولًا.',
      done: 'جاهز.', save: 'حفظ', share: 'مشاركة', again: 'عدّل مرة ثانية', fail: 'ما قدرت أكمل: {e}',
      needAudio: 'اختر ملف الصوت أو جهّز الصوت أولًا.', sec: 'ث'
    },
    en: {
      title: 'Text & sound on video', menu: 'Text & sound on video', tab: 'Text & sound', close: 'Close',
      pick: 'Choose a video', pickHint: 'Up to {n} MB. Editing happens on your device.', change: 'Change video',
      longNote: 'Video is longer than 3 minutes — editing the first 3 minutes.', tooBig: 'Video too large — limit {n} MB.',
      notVideo: 'This file is not a video.', texts: 'Text', addText: 'Add text', autoCap: 'Auto-write the speech',
      autoBusy: 'Transcribing…', noSpeech: 'No clear speech found.', noAudio: 'This video has no sound.',
      capDone: 'Added {n} lines — edit them if needed.', textPh: 'Type here…', pos: 'Position', top: 'Top', mid: 'Middle',
      bottom: 'Bottom', size: 'Size', s: 'Small', m: 'Normal', l: 'Large', color: 'Color', box: 'Background', from: 'From',
      to: 'To', now: 'Now', del: 'Delete', applyAll: 'Same style for all', maxTexts: 'Limit reached ({n}).',
      audio: 'Sound', aNone: 'No extra sound', aFile: 'Audio file from device', aTts: 'Voice reads your text',
      aFileHint: 'Song, music, Quran or any recording.', aFilePick: 'Choose audio file', ttsPh: 'Type the text to be read…',
      female: 'Female voice', male: 'Male voice', ttsMake: 'Make voice', ttsBusy: 'Making voice…',
      mix: 'Mix with video sound', replace: 'Replace video sound', volOrig: 'Video sound', volNew: 'New sound',
      loop: 'Repeat until the end', mute: 'Mute original sound',
      rights: 'Use audio you have rights to — some platforms mute protected songs.', exportT: 'Export',
      hq: 'High quality 1080 (slower)', exp: 'Export video', loading: 'Preparing editor (first time takes a while)…',
      working: 'Exporting… {p}%', cancel: 'Cancel', canceled: 'Canceled.', nothing: 'Add text or sound first.',
      done: 'Ready.', save: 'Save', share: 'Share', again: 'Edit again', fail: 'Could not finish: {e}',
      needAudio: 'Choose an audio file or make the voice first.', sec: 's'
    }
  };
  function lang(){ var l = 'ar'; try{ l = localStorage.getItem('aiapp_lang') || 'ar'; }catch(e){ /* guard-ok — بلا تخزين = عربي */ } return l; }
  function T_(k, rep){
    var d = S[lang()] || S.en, s = (d[k] != null ? d[k] : S.en[k]) || k;
    if(rep) Object.keys(rep).forEach(function(r){ s = s.split('{' + r + '}').join(String(rep[r])); });
    return s;
  }
  function dirRtl(){ var l = lang(); return l === 'ar' || l === 'ur'; }
  function sw(e, tag){ try{ if(typeof window.__swallow === 'function') window.__swallow(e, tag); }catch(x){ /* guard-ok — المسجّل نفسه ترف */ } }
  function tok(){ try{ return (typeof window.authGet === 'function' && window.authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; } }
  function gid(){ try{ return (typeof window.getGuestId === 'function' && window.getGuestId()) || ''; }catch(e){ return ''; } }
  function isMobile(){ return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent || ''); }

  /* ───────── الرسم (المعاينة والتصدير بالدالّة نفسها) ───────── */
  var FONT = '"IBM Plex Sans Arabic", Tajawal, "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  function fontStr(px){ return '700 ' + px + 'px ' + FONT; }
  var mctx = null;
  function measure(s, px){
    if(!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = fontStr(px);
    return mctx.measureText(s).width;
  }
  function rr(ctx, x, y, w, h, r){
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function drawItem(ctx, it, L, ox, oy){
    var x0 = L.x + ox, y0 = L.y + oy, dark = it.color === '#000000';
    ctx.save();
    if(it.box){ ctx.fillStyle = dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.58)'; rr(ctx, x0, y0, L.w, L.h, Math.round(L.fs * 0.32)); ctx.fill(); }
    ctx.font = fontStr(L.fs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if('direction' in ctx) ctx.direction = isRtl(it.text) ? 'rtl' : 'ltr';
    var cx = x0 + L.w / 2;
    L.lines.forEach(function(line, i){
      var cy = y0 + L.padY + L.lh * i + L.lh / 2;
      if(!it.box){
        ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.round(L.fs * 0.14));
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)'; ctx.strokeText(line, cx, cy);
      }
      ctx.fillStyle = it.color; ctx.fillText(line, cx, cy);
    });
    ctx.restore();
  }

  /* ───────── ffmpeg ───────── */
  var ff = null, ffLoading = null, ffLog = [], ffOnLog = null;
  function getFF(){
    if(ff) return Promise.resolve(ff);
    if(!ffLoading) ffLoading = (async function(){
      var mod = await import('/ffmpeg/lib/index.js');
      var f = new mod.FFmpeg();
      f.on('log', function(e){ var m = e && e.message || ''; ffLog.push(m); if(ffLog.length > 400) ffLog.shift(); if(ffOnLog) ffOnLog(m); });
      try{
        await Promise.race([
          f.load({ coreURL: '/ffmpeg/core/ffmpeg-core.js', wasmURL: '/ffmpeg/core/ffmpeg-core.wasm', classWorkerURL: '/ffmpeg/lib/worker.js' }),
          new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('ffmpeg load timeout')); }, 120000); })
        ]);
      }catch(e){ try{ f.terminate(); }catch(e2){ sw(e2, 'ved:ff-term'); } throw e; }
      ff = f; st.written = false; return f;
    })().catch(function(e){ ffLoading = null; throw e; });
    return ffLoading;
  }
  function killFF(){ try{ if(ff) ff.terminate(); }catch(e){ sw(e, 'ved:kill'); } ff = null; ffLoading = null; st.written = false; }
  async function rmf(n){ try{ await ff.deleteFile(n); }catch(e){ /* guard-ok — ملف غير موجود */ } }
  async function u8(blob){
    if(blob.arrayBuffer) return new Uint8Array(await blob.arrayBuffer());
    return await new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(new Uint8Array(fr.result)); }; fr.onerror = rej; fr.readAsArrayBuffer(blob); });
  }
  function b64(bytes){
    var s = '', CH = 0x8000;
    for(var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function extOf(name, type, dflt){
    var m = /\.([a-z0-9]{2,4})$/i.exec(String(name || ''));
    if(m) return m[1].toLowerCase();
    var t = String(type || '');
    if(/mpeg|mp3/.test(t)) return 'mp3';
    if(/mp4|m4a|aac/.test(t)) return t.indexOf('video') === 0 ? 'mp4' : 'm4a';
    if(/webm/.test(t)) return 'webm';
    if(/ogg|opus/.test(t)) return 'ogg';
    if(/wav/.test(t)) return 'wav';
    if(/quicktime/.test(t)) return 'mov';
    return dflt;
  }
  async function ensureInput(){
    var f = await getFF();
    if(!st.written){
      setStatus(T_('loading'));
      st.inName = 'in.' + extOf(st.file.name, st.file.type, 'mp4');
      await f.writeFile(st.inName, await u8(st.file));
      st.written = true;
    }
    if(!st.probe){
      ffLog = [];
      await f.exec(['-hide_banner', '-i', st.inName]); /* بلا مخرج: يفشل عمدًا ويطبع المعلومات */
      st.probe = parseProbe(ffLog.join('\n'));
    }
    return f;
  }

  /* ───────── الحالة والواجهة ───────── */
  var st = { file: null, url: '', dur: 0, vw: 0, vh: 0, items: [], nid: 1, written: false, inName: '', probe: null,
    aSrc: 'none', aFile: null, ttsBlob: null, aMode: 'mix', loop: true, vol: 0.45, origVol: 1, mute: false, hq: false,
    busy: false, outUrl: '' };
  var M = null, Q = function(s){ return M ? M.querySelector(s) : null; };
  var COLORS = ['#ffffff', '#ffd400', '#e8b04a', '#000000'];
  var ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="6" y1="15" x2="14" y2="15"></line><line x1="8" y1="11" x2="18" y2="11"></line><path d="M17 15.5v-2.5l2-.5"></path></svg>';
  var TAB_ART = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2140"/><stop offset="1" stop-color="#120f1c"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/><rect x="12" y="14" width="56" height="40" rx="5" fill="#0b0a12" stroke="#e8b04a" stroke-width="2"/><path d="M35 26v16l13-8z" fill="#e8b04a"/><rect x="18" y="58" width="44" height="5" rx="2.5" fill="#fff"/><rect x="26" y="66" width="28" height="4" rx="2" fill="#ffd400"/><path d="M60 22c3 2 3 8 0 10M64 19c5 4 5 12 0 16" stroke="#ffd400" stroke-width="2" fill="none" stroke-linecap="round"/></svg>');

  function css(){
    if(document.getElementById('vedCss')) return;
    var s = document.createElement('style'); s.id = 'vedCss';
    s.textContent = [
      '#vedModal{position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,.72);display:none;align-items:flex-start;justify-content:center;overflow-y:auto;padding:16px 10px 40px}',
      '#vedModal.open{display:flex}',
      '#vedModal .ved-card{width:100%;max-width:620px;background:var(--bg-2,#16151c);color:var(--text,#e9e7ef);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);font:inherit}',
      '#vedModal .ved-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}',
      '#vedModal .ved-head b{font-size:16px}',
      '#vedModal button{font:inherit;cursor:pointer}',
      '#vedModal .ved-x{background:none;border:0;color:inherit;font-size:22px;line-height:1;padding:4px 8px}',
      '#vedModal .ved-btn{background:rgba(255,255,255,.07);color:inherit;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:8px 14px;font-size:13.5px}',
      '#vedModal .ved-btn:disabled{opacity:.5;cursor:default}',
      '#vedModal .ved-pri{background:linear-gradient(180deg,#f2c46a,#e0a43c);color:#17140f;border-color:transparent;font-weight:700}',
      '#vedModal .ved-hint{font-size:12px;opacity:.7;margin-top:6px}',
      '#vedModal .ved-pick{text-align:center;padding:26px 8px;border:1.5px dashed rgba(255,255,255,.18);border-radius:14px}',
      '#vedModal .ved-stage{position:relative;margin:0 auto 6px;background:#000;border-radius:10px;overflow:hidden}',
      '#vedModal .ved-stage video,#vedModal .ved-stage canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}',
      '#vedModal .ved-stage canvas{pointer-events:none}',
      '#vedModal .ved-sec{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)}',
      '#vedModal .ved-sec h4{margin:0 0 8px;font-size:14px}',
      '#vedModal .ved-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
      '#vedModal .ved-item{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:8px;margin-top:8px}',
      '#vedModal textarea,#vedModal select,#vedModal input[type=number]{font:inherit;font-size:14px;background:rgba(0,0,0,.25);color:inherit;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:6px 8px}',
      '#vedModal textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:44px}',
      '#vedModal input[type=number]{width:72px}',
      '#vedModal .ved-sw{width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.25);padding:0}',
      '#vedModal .ved-sw.on{border-color:#e8b04a;box-shadow:0 0 0 2px rgba(232,176,74,.45)}',
      '#vedModal .ved-mini{font-size:12px;padding:4px 10px}',
      '#vedModal label{font-size:13px;display:inline-flex;align-items:center;gap:5px}',
      '#vedModal input[type=range]{width:120px}',
      '#vedModal label b{font-weight:500;font-size:12px;opacity:.75;min-width:34px}',
      '#vedModal .ved-bar{height:8px;background:rgba(255,255,255,.1);border-radius:8px;overflow:hidden;margin-top:8px}',
      '#vedModal .ved-bar i{display:block;height:100%;width:0;background:#e8b04a;transition:width .3s}',
      '#vedModal .ved-status{font-size:13px;margin-top:6px;min-height:18px}',
      '#vedModal .ved-result video{width:100%;max-height:60vh;border-radius:10px;background:#000;margin-top:8px}',
      '#vedModal [hidden]{display:none!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function el(tag, attrs, kids){
    var e = document.createElement(tag);
    if(attrs) Object.keys(attrs).forEach(function(k){
      if(k === 'text') e.textContent = attrs[k];
      else if(k === 'html') e.innerHTML = attrs[k];
      else if(k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function(c){ if(c) e.appendChild(c); });
    return e;
  }
  function btn(label, onclick, cls){ return el('button', { type: 'button', 'class': 'ved-btn' + (cls ? ' ' + cls : ''), text: label, onclick: onclick }); }

  function build(){
    css();
    M = el('div', { id: 'vedModal', role: 'dialog', 'aria-modal': 'true', 'aria-label': T_('title'), dir: dirRtl() ? 'rtl' : 'ltr' });
    M.innerHTML =
      '<div class="ved-card">' +
        '<div class="ved-head"><b></b><button type="button" class="ved-x" aria-label="">×</button></div>' +
        '<div class="ved-pick"><button type="button" class="ved-btn ved-pri" data-k="pickBtn"></button><div class="ved-hint" data-k="pickHint"></div>' +
          '<input type="file" accept="video/*" data-k="vfile" hidden></div>' +
        '<div class="ved-main" hidden>' +
          '<div class="ved-stage"><video playsinline controls preload="metadata"></video><canvas></canvas></div>' +
          '<div class="ved-row" style="justify-content:space-between"><span class="ved-hint" data-k="info"></span><button type="button" class="ved-btn ved-mini" data-k="change"></button></div>' +
          '<div class="ved-sec"><h4 data-k="hTexts"></h4><div class="ved-row"><button type="button" class="ved-btn" data-k="add"></button><button type="button" class="ved-btn" data-k="auto"></button></div>' +
            '<div class="ved-status" data-k="tStatus"></div><div data-k="list"></div></div>' +
          '<div class="ved-sec"><h4 data-k="hAudio"></h4><div class="ved-row" data-k="aSrc"></div>' +
            '<div data-k="aFileBox" hidden><div class="ved-row"><button type="button" class="ved-btn" data-k="aPick"></button><span class="ved-hint" data-k="aName"></span></div>' +
              '<div class="ved-hint" data-k="aHint"></div><input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus" data-k="afile" hidden></div>' +
            '<div data-k="ttsBox" hidden><textarea data-k="ttsText" rows="3" maxlength="4000"></textarea><div class="ved-row" style="margin-top:6px"><select data-k="ttsGender"></select><button type="button" class="ved-btn" data-k="ttsMake"></button></div></div>' +
            '<audio data-k="aPrev" controls hidden style="width:100%;margin-top:8px"></audio>' +
            '<div data-k="mixBox" hidden><div class="ved-row" style="margin-top:8px" data-k="modeRow"></div>' +
              '<div class="ved-row" style="margin-top:6px"><label data-k="lOrig"><span></span><input type="range" min="0" max="100" data-k="vOrig"><b data-k="pOrig"></b></label><label><span data-k="lNew"></span><input type="range" min="0" max="150" data-k="vNew"><b data-k="pNew"></b></label></div>' +
              '<div class="ved-row" style="margin-top:6px"><label><input type="checkbox" data-k="loop"><span data-k="lLoop"></span></label></div>' +
              '<div class="ved-hint" data-k="rights"></div></div>' +
            '<div data-k="muteBox"><label style="margin-top:8px"><input type="checkbox" data-k="mute"><span data-k="lMute"></span></label></div>' +
          '</div>' +
          '<div class="ved-sec"><h4 data-k="hExp"></h4><label><input type="checkbox" data-k="hq"><span data-k="lHq"></span></label>' +
            '<div class="ved-row" style="margin-top:8px"><button type="button" class="ved-btn ved-pri" data-k="exp"></button><button type="button" class="ved-btn" data-k="cancel" hidden></button></div>' +
            '<div class="ved-bar" hidden data-k="bar"><i></i></div><div class="ved-status" data-k="status"></div>' +
            '<div class="ved-result" hidden data-k="result"><video controls playsinline data-k="outVid"></video><div class="ved-row" style="margin-top:8px"><button type="button" class="ved-btn ved-pri" data-k="save"></button><button type="button" class="ved-btn" data-k="share"></button></div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(M);
    var K = function(k){ return M.querySelector('[data-k="' + k + '"]'); };
    M.querySelector('.ved-head b').textContent = T_('title');
    M.querySelector('.ved-x').setAttribute('aria-label', T_('close'));
    M.querySelector('.ved-x').onclick = close;
    M.addEventListener('click', function(e){ if(e.target === M && !st.busy) close(); });
    K('pickBtn').textContent = T_('pick');
    K('pickHint').textContent = T_('pickHint', { n: maxMB() });
    K('pickBtn').onclick = function(){ K('vfile').click(); };
    K('change').textContent = T_('change'); K('change').onclick = function(){ if(!st.busy) K('vfile').click(); };
    K('vfile').onchange = function(){ var f = this.files && this.files[0]; this.value = ''; if(f) loadVideo(f); };
    K('hTexts').textContent = T_('texts'); K('add').textContent = T_('addText'); K('auto').textContent = T_('autoCap');
    K('add').onclick = function(){ addItem({}); };
    K('auto').onclick = autoCaptions;
    K('hAudio').textContent = T_('audio');
    ['none', 'file', 'tts'].forEach(function(v){
      var lb = el('label', null, [el('input', { type: 'radio', name: 'vedASrc', value: v }), el('span', { text: T_(v === 'none' ? 'aNone' : v === 'file' ? 'aFile' : 'aTts') })]);
      lb.querySelector('input').checked = st.aSrc === v;
      lb.querySelector('input').onchange = function(){ st.aSrc = v; if(v === 'tts'){ st.origVol = 0.25; st.vol = 1; st.loop = false; } else if(v === 'file'){ st.origVol = 1; st.vol = 0.45; st.loop = true; } syncAudio(); };
      K('aSrc').appendChild(lb);
    });
    K('aPick').textContent = T_('aFilePick'); K('aHint').textContent = T_('aFileHint');
    K('aPick').onclick = function(){ K('afile').click(); };
    K('afile').onchange = function(){ var f = this.files && this.files[0]; this.value = ''; if(f){ st.aFile = f; K('aName').textContent = f.name; setPrev(f); syncAudio(); } };
    K('ttsText').placeholder = T_('ttsPh');
    [['female', 'female'], ['male', 'male']].forEach(function(g){ K('ttsGender').appendChild(el('option', { value: g[0], text: T_(g[1]) })); });
    K('ttsMake').textContent = T_('ttsMake'); K('ttsMake').onclick = makeTts;
    ['mix', 'replace'].forEach(function(v){
      var lb = el('label', null, [el('input', { type: 'radio', name: 'vedAMode', value: v }), el('span', { text: T_(v) })]);
      lb.querySelector('input').onchange = function(){ st.aMode = v; syncAudio(); };
      K('modeRow').appendChild(lb);
    });
    K('lOrig').querySelector('span').textContent = T_('volOrig'); K('lNew').textContent = T_('volNew');
    K('vOrig').oninput = function(){ st.origVol = (+this.value || 0) / 100; K('pOrig').textContent = this.value + '%'; };
    K('vNew').oninput = function(){ st.vol = (+this.value || 0) / 100; K('pNew').textContent = this.value + '%'; };
    K('lLoop').textContent = T_('loop'); K('loop').onchange = function(){ st.loop = this.checked; };
    K('rights').textContent = T_('rights');
    K('lMute').textContent = T_('mute'); K('mute').onchange = function(){ st.mute = this.checked; };
    K('hExp').textContent = T_('exportT'); K('lHq').textContent = T_('hq');
    K('hq').onchange = function(){ st.hq = this.checked; sizeStage(); redraw(); };
    K('exp').textContent = T_('exp'); K('exp').onclick = doExport;
    K('cancel').textContent = T_('cancel'); K('cancel').onclick = cancel;
    K('save').textContent = T_('save'); K('save').onclick = saveOut;
    K('share').textContent = T_('share'); K('share').onclick = shareOut;
    var v = Q('.ved-stage video');
    v.addEventListener('loadedmetadata', function(){
      st.dur = v.duration && isFinite(v.duration) ? v.duration : 0; st.vw = v.videoWidth; st.vh = v.videoHeight;
      K('info').textContent = fmt(st.dur) + (st.dur > MAX_SEC ? ' — ' + T_('longNote') : '');
      sizeStage(); redraw();
    });
    v.addEventListener('timeupdate', redraw);
    v.addEventListener('seeked', redraw);
    v.addEventListener('play', function loop(){ redraw(); if(!v.paused && !v.ended && M.classList.contains('open')) requestAnimationFrame(loop); });
    window.addEventListener('resize', function(){ if(M.classList.contains('open')) sizeStage(); });
    M.__K = K;
  }
  function K(k){ return M.__K(k); }
  function maxMB(){ return isMobile() ? 80 : 200; }
  function fmt(s){ s = Math.max(0, Math.round(s || 0)); var m = Math.floor(s / 60), x = s % 60; return m + ':' + (x < 10 ? '0' : '') + x; }
  function setStatus(s, which){ var e = K(which || 'status'); if(e) e.textContent = s || ''; }
  function limitT(){ return Math.min(st.dur || MAX_SEC, MAX_SEC); }

  function open(){
    if(!M) build();
    M.setAttribute('dir', dirRtl() ? 'rtl' : 'ltr');
    M.classList.add('open');
    try{ document.fonts && document.fonts.load(fontStr(40), 'ابج abc'); }catch(e){ /* guard-ok — الخطّ الاحتياطيّ يكفي */ }
    if(st.file) sizeStage();
  }
  function close(){
    if(!M) return;
    if(st.busy) cancel();
    var v = Q('.ved-stage video'); try{ v.pause(); }catch(e){ /* guard-ok */ }
    M.classList.remove('open');
  }

  function loadVideo(f){
    if(!/^video\//.test(f.type || '') && !/\.(mp4|mov|webm|mkv|3gp|m4v)$/i.test(f.name || '')){ alert(T_('notVideo')); return; }
    if(f.size > maxMB() * 1024 * 1024){ alert(T_('tooBig', { n: maxMB() })); return; }
    if(st.url) URL.revokeObjectURL(st.url);
    st.file = f; st.url = URL.createObjectURL(f); st.written = false; st.probe = null;
    st.items = st.items.filter(function(it){ return !it.auto; });
    if(ff) rmf(st.inName);
    Q('.ved-pick').hidden = true; Q('.ved-main').hidden = false; K('result').hidden = true; setStatus('');
    var v = Q('.ved-stage video'); v.src = st.url;
    renderList(); syncAudio();
  }

  function dims(){ return outDims(st.vw, st.vh, st.hq); }
  function sizeStage(){
    var stg = Q('.ved-stage'); if(!stg) return;
    var d = dims(), par = Q('.ved-main').clientWidth || 360;
    var maxH = Math.min(window.innerHeight * 0.5, 560), w = Math.min(par, maxH * d.w / d.h);
    stg.style.width = Math.round(w) + 'px'; stg.style.height = Math.round(w * d.h / d.w) + 'px';
    var c = Q('.ved-stage canvas'); c.width = d.w; c.height = d.h;
    redraw();
  }
  function activeAt(it, t){ return t >= it.a && t < it.b; }
  function redraw(){
    var c = Q('.ved-stage canvas'); if(!c) return;
    var ctx = c.getContext('2d'), v = Q('.ved-stage video'), t = v.currentTime || 0;
    ctx.clearRect(0, 0, c.width, c.height);
    st.items.forEach(function(it){
      if(!String(it.text || '').trim() || !(activeAt(it, t) || it.focus)) return;
      var L = layoutItem(it, c.width, c.height, measure); if(L) drawItem(ctx, it, L, 0, 0);
    });
  }

  function addItem(p){
    if(st.items.length >= MAX_TEXTS){ setStatus(T_('maxTexts', { n: MAX_TEXTS }), 'tStatus'); return null; }
    var v = Q('.ved-stage video'), t = v ? (v.currentTime || 0) : 0, Tm = limitT();
    var a = p.a != null ? p.a : r2(Math.min(t, Math.max(0, Tm - 0.5)));
    var it = { id: st.nid++, text: p.text || '', pos: p.pos || (p.auto ? 'bottom' : 'top'), /* العنوان فوق والترجمة تحت فلا يتراكبان */ size: p.size || 'm', color: p.color || '#ffffff',
      box: p.box != null ? p.box : true, a: a, b: p.b != null ? p.b : r2(p.text ? Math.min(Tm, a + 3) : Tm), auto: !!p.auto };
    st.items.push(it);
    if(!p.silent){ renderList(); var ta = K('list').querySelector('[data-id="' + it.id + '"] textarea'); if(ta) ta.focus(); }
    return it;
  }
  function renderList(){
    var box = K('list'); box.innerHTML = '';
    st.items.slice().sort(function(x, y){ return x.a - y.a; }).forEach(function(it){ box.appendChild(card(it)); });
    redraw();
  }
  function card(it){
    var v = Q('.ved-stage video');
    var ta = el('textarea', { rows: '2', placeholder: T_('textPh'), maxlength: '300' });
    ta.value = it.text; ta.dir = 'auto';
    ta.oninput = function(){ it.text = ta.value; redraw(); };
    ta.onfocus = function(){ it.focus = true; if(!(v.currentTime >= it.a && v.currentTime < it.b)){ try{ v.currentTime = Math.min(it.a + 0.05, Math.max(0, it.b - 0.05)); }catch(e){ /* guard-ok */ } } redraw(); };
    ta.onblur = function(){ it.focus = false; redraw(); };
    function sel(key, opts){
      var s = el('select', { 'aria-label': T_(key) });
      opts.forEach(function(o){ var op = el('option', { value: o, text: T_(o) }); if(it[key] === o) op.selected = true; s.appendChild(op); });
      s.onchange = function(){ it[key] = s.value; redraw(); };
      return s;
    }
    var sws = el('span', { 'class': 'ved-row', style: 'gap:4px' });
    COLORS.forEach(function(c){
      var b = el('button', { type: 'button', 'class': 'ved-sw' + (it.color === c ? ' on' : ''), style: 'background:' + c, 'aria-label': T_('color') + ' ' + c });
      b.onclick = function(){ it.color = c; [].forEach.call(sws.children, function(x){ x.classList.remove('on'); }); b.classList.add('on'); redraw(); };
      sws.appendChild(b);
    });
    var bx = el('input', { type: 'checkbox' }); bx.checked = !!it.box; bx.onchange = function(){ it.box = bx.checked; redraw(); };
    function num(key){
      var n = el('input', { type: 'number', step: '0.1', min: '0', max: String(r2(limitT())), 'aria-label': T_(key === 'a' ? 'from' : 'to') });
      n.value = String(it[key]);
      n.onchange = function(){ var x = Math.max(0, Math.min(limitT(), +n.value || 0)); it[key] = r2(x); if(it.b <= it.a) it.b = r2(Math.min(limitT(), it.a + 0.5)); renderList(); };
      return n;
    }
    function nowBtn(key){ return btn(T_('now'), function(){ it[key] = r2(Math.min(limitT(), v.currentTime || 0)); if(it.b <= it.a) it.b = r2(Math.min(limitT(), it.a + 0.5)); renderList(); }, 'ved-mini'); }
    var row1 = el('div', { 'class': 'ved-row', style: 'margin-top:6px' }, [sel('pos', ['top', 'mid', 'bottom']), sel('size', ['s', 'm', 'l']), sws,
      el('label', null, [bx, el('span', { text: T_('box') })])]);
    var row2 = el('div', { 'class': 'ved-row', style: 'margin-top:6px' }, [el('span', { 'class': 'ved-hint', style: 'margin:0', text: T_('from') }), num('a'), nowBtn('a'),
      el('span', { 'class': 'ved-hint', style: 'margin:0', text: T_('to') }), num('b'), nowBtn('b'),
      btn(T_('applyAll'), function(){ st.items.forEach(function(x){ x.pos = it.pos; x.size = it.size; x.color = it.color; x.box = it.box; }); renderList(); }, 'ved-mini'),
      btn(T_('del'), function(){ st.items = st.items.filter(function(x){ return x !== it; }); renderList(); }, 'ved-mini')]);
    return el('div', { 'class': 'ved-item', 'data-id': String(it.id) }, [ta, row1, row2]);
  }

  async function autoCaptions(){
    if(st.busy || !st.file) return;
    st.busy = true; K('auto').disabled = true; setStatus(T_('loading'), 'tStatus');
    try{
      var f = await ensureInput();
      if(!st.probe.hasAudio){ setStatus(T_('noAudio'), 'tStatus'); return; }
      setStatus(T_('autoBusy'), 'tStatus');
      await rmf('stt.mp3');
      var code = await f.exec(['-hide_banner', '-y', '-i', st.inName, '-t', String(r2(limitT())), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', 'stt.mp3']);
      if(code !== 0) throw new Error('audio ' + code);
      var data = await f.readFile('stt.mp3'); await rmf('stt.mp3');
      var r = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: b64(data), mimeType: 'audio/mpeg', segments: true, token: tok(), guestId: gid() }) });
      var j = null; try{ j = await r.json(); }catch(e){ j = null; }
      if(!r.ok) throw new Error((j && j.error) || ('stt ' + r.status));
      var rows = segToTexts(j && j.segments, limitT());
      if(!rows.length){ setStatus(T_('noSpeech'), 'tStatus'); return; }
      st.items = st.items.filter(function(it){ return !it.auto; });
      var n = 0;
      rows.forEach(function(x){ if(addItem({ text: x.text, a: x.a, b: x.b, auto: true, silent: true })) n++; });
      renderList(); setStatus(T_('capDone', { n: n }), 'tStatus');
    }catch(e){ if(st.busy) setStatus(T_('fail', { e: (e && e.message) || e }), 'tStatus'); }
    finally{ st.busy = false; K('auto').disabled = false; }
  }

  function setPrev(blob){
    var a = K('aPrev'); if(a.src) URL.revokeObjectURL(a.src);
    if(!blob){ a.hidden = true; a.removeAttribute('src'); return; }
    a.src = URL.createObjectURL(blob); a.hidden = false;
  }
  function syncAudio(){
    var src = st.aSrc;
    K('aFileBox').hidden = src !== 'file'; K('ttsBox').hidden = src !== 'tts';
    K('mixBox').hidden = src === 'none'; K('muteBox').hidden = src !== 'none';
    var cur = src === 'file' ? st.aFile : src === 'tts' ? st.ttsBlob : null;
    if(src === 'none') setPrev(null); else setPrev(cur);
    var hasA = !st.probe || st.probe.hasAudio;
    [].forEach.call(K('modeRow').querySelectorAll('input'), function(i){ i.checked = i.value === st.aMode; });
    K('modeRow').hidden = !hasA; K('lOrig').hidden = !hasA || st.aMode !== 'mix';
    K('vOrig').value = String(Math.round(st.origVol * 100)); K('vNew').value = String(Math.round(st.vol * 100));
    K('pOrig').textContent = K('vOrig').value + '%'; K('pNew').textContent = K('vNew').value + '%';
    K('loop').checked = st.loop; K('mute').checked = st.mute;
  }
  async function makeTts(){
    var text = K('ttsText').value.trim(); if(!text || st.busy) return;
    K('ttsMake').disabled = true; setStatus(T_('ttsBusy'));
    try{
      var r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: 'maha', gender: K('ttsGender').value, lang: isRtl(text) ? 'ar' : 'en', text: text.slice(0, 4000), token: tok(), guestId: gid() }) });
      if(!r.ok){ var j = null; try{ j = await r.json(); }catch(e){ j = null; } throw new Error((j && j.error) || ('tts ' + r.status)); }
      var b = await r.blob();
      if(!b || b.size < 200) throw new Error('tts empty');
      st.ttsBlob = b; setPrev(b); setStatus('');
    }catch(e){ setStatus(T_('fail', { e: (e && e.message) || e })); }
    finally{ K('ttsMake').disabled = false; }
  }

  function setBar(p){ var b = K('bar'); b.hidden = p == null; b.querySelector('i').style.width = Math.max(0, Math.min(100, p || 0)) + '%'; }
  function busyUI(on){
    st.busy = on; K('exp').disabled = on; K('cancel').hidden = !on; K('auto').disabled = on; K('change').disabled = on;
    if(!on) ffOnLog = null;
  }
  function cancel(){ if(!st.busy) return; killFF(); busyUI(false); setBar(null); setStatus(T_('canceled')); }

  async function doExport(){
    if(st.busy || !st.file) return;
    var texts = st.items.filter(function(it){ return String(it.text || '').trim() && it.b > it.a && it.a < limitT(); });
    var aBlob = st.aSrc === 'file' ? st.aFile : st.aSrc === 'tts' ? st.ttsBlob : null;
    if(st.aSrc !== 'none' && !aBlob){ setStatus(T_('needAudio')); return; }
    if(!texts.length && !aBlob && !st.mute){ setStatus(T_('nothing')); return; }
    K('result').hidden = true; busyUI(true); setBar(0); setStatus(T_('loading'));
    try{
      var f = await ensureInput();
      if(!st.busy) return;
      var P = st.probe, d = outDims(st.vw || P.w, st.vh || P.h, st.hq), Tm = limitT();
      try{ if(document.fonts && document.fonts.load) await document.fonts.load(fontStr(40), 'ابج abc'); }catch(e){ /* guard-ok — الخطّ الاحتياطيّ */ }
      var ovs = [];
      for(var i = 0; i < texts.length; i++){
        var it = texts[i], L = layoutItem(it, d.w, d.h, measure); if(!L) continue;
        var c = document.createElement('canvas'); c.width = L.w; c.height = L.h;
        drawItem(c.getContext('2d'), it, L, -L.x, -L.y);
        var blob = await new Promise(function(res){ c.toBlob(res, 'image/png'); });
        var nm = 't' + i + '.png';
        await f.writeFile(nm, await u8(blob));
        ovs.push({ name: nm, x: L.x, y: L.y, a: it.a, b: Math.min(it.b, Tm) });
      }
      var A = null;
      if(aBlob){
        var an = 'add.' + extOf(aBlob.name, aBlob.type, 'mp3');
        await f.writeFile(an, await u8(aBlob));
        A = { name: an, mode: P.hasAudio ? st.aMode : 'replace', loop: st.loop, vol: st.vol, origVol: st.origVol };
      }
      var vc = P.vcodec;
      var args = buildArgs({ inName: st.inName, dur: st.dur || P.dur, W: d.w, H: d.h, fps: P.fps, overlays: ovs, audio: A,
        hasAudio: P.hasAudio, mute: st.mute && !A, copyVideo: !ovs.length && (vc === 'h264' || vc === 'hevc'), vcodec: vc, hq: st.hq, out: 'out.mp4' });
      ffOnLog = function(m){
        var x = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(m);
        if(x){ var p = Math.round(((+x[1]) * 3600 + (+x[2]) * 60 + (+x[3])) / Tm * 100); setBar(p); setStatus(T_('working', { p: Math.min(99, p) })); }
      };
      ffLog = [];
      setStatus(T_('working', { p: 0 }));
      var code = await f.exec(args);
      ffOnLog = null;
      if(!st.busy) return;
      if(code !== 0) throw new Error(ffLog.slice(-3).join(' ').slice(0, 200) || ('ffmpeg ' + code));
      var out = await f.readFile('out.mp4');
      for(var k = 0; k < ovs.length; k++) await rmf(ovs[k].name);
      if(A) await rmf(A.name);
      await rmf('out.mp4');
      if(st.outUrl) URL.revokeObjectURL(st.outUrl);
      st.outBlob = new Blob([out], { type: 'video/mp4' }); st.outUrl = URL.createObjectURL(st.outBlob);
      K('outVid').src = st.outUrl; K('result').hidden = false;
      K('share').hidden = !(navigator.canShare && navigator.share);
      setBar(100); setStatus(T_('done'));
      try{ K('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }catch(e){ /* guard-ok */ }
    }catch(e){
      if(st.busy) setStatus(T_('fail', { e: (e && e.message) || e }));
      setBar(null);
    }finally{ busyUI(false); }
  }
  var OUT_NAME = 'omran-video-edit.mp4';
  async function saveOut(){
    if(!st.outUrl) return;
    if(typeof window.omranSaveMedia === 'function'){ try{ if(await window.omranSaveMedia(st.outUrl, OUT_NAME)) return; }catch(e){ sw(e, 'ved:save'); } }
    var a = document.createElement('a'); a.href = st.outUrl; a.download = OUT_NAME; a.dataset.nativeDownload = '1'; document.body.appendChild(a); a.click(); a.remove();
  }
  async function shareOut(){
    if(!st.outBlob) return;
    try{
      var file = new File([st.outBlob], OUT_NAME, { type: 'video/mp4' });
      if(navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Omran AI' });
      else saveOut();
    }catch(e){ if(!(e && e.name === 'AbortError')) sw(e, 'ved:share'); }
  }

  /* ───────── نقاط الدخول: قائمة + في المحادثة، وشريط أقسام صانع الفيديو ───────── */
  function addMenuBtn(){
    var pop = document.getElementById('plusToolsPopup');
    if(!pop || document.getElementById('btnVideoEdit')) return;
    var b = document.createElement('button');
    b.className = 'btn'; b.id = 'btnVideoEdit'; b.type = 'button'; b.title = T_('menu');
    b.innerHTML = ICON + ' <span class="btnLabel"></span>';
    b.querySelector('.btnLabel').textContent = T_('menu');
    b.addEventListener('click', function(e){ e.stopPropagation(); pop.classList.remove('show'); pop.classList.remove('open'); open(); });
    var ref = document.getElementById('btnImgToPdf');
    if(ref && ref.parentNode === pop) pop.insertBefore(b, ref); else pop.appendChild(b);
  }
  function addVmkTab(){
    var tb = document.getElementById('vmkTabs');
    if(!tb || tb.querySelector('#vedTabBtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'vmk-tab'; b.id = 'vedTabBtn'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', 'false');
    var im = document.createElement('img'); im.className = 'vmk-tab-img'; im.alt = ''; im.src = TAB_ART;
    var lb = document.createElement('span'); lb.className = 'vmk-tab-lbl'; lb.textContent = T_('tab');
    b.appendChild(im); b.appendChild(lb);
    b.addEventListener('click', function(e){ e.stopPropagation(); open(); });
    tb.insertBefore(b, tb.children[1] || null); /* ثاني الأقسام: يُرى بلا تمرير */
  }
  function watchVmk(){
    var vm = document.getElementById('videoMakerModal');
    if(!vm){ return false; }
    addVmkTab();
    try{ new MutationObserver(function(){ addVmkTab(); }).observe(vm, { childList: true, subtree: true }); }catch(e){ sw(e, 'ved:mo'); }
    return true;
  }
  function init(){
    addMenuBtn();
    var tries = 0;
    (function poll(){ if(watchVmk() || ++tries > 60) return; setTimeout(poll, 1000); })();
    window.omranVideoEdit = { open: open };
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
