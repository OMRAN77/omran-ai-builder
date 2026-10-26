/* v-video-edit (طلب عمران «كتابة وصوت على الفيديو — في المحادثة ومع الفيديوات»):
   محرّر يعمل داخل الجهاز (ffmpeg.wasm): كتابة بتوقيت فوق الفيديو، «اكتب الكلام تلقائيًا» (‎/api/stt‎ بمقاطع
   زمنيّة)، وصوت إضافيّ (ملف من الجهاز أو صوت يقرأ نصًّا ‎/api/tts‎) مزجًا أو استبدالًا.
   v2: إخفاء كتابة محروقة في الفيديو (مسح delogo / تمويه / تغطية بلون) والكتابة مكانها، خطوط التطبيق نفسها،
   وتحريك الكتابة بالسحب على المعاينة (أزرار تشغيل خاصّة بدل أزرار المتصفّح كي يستقبل الرسم اللمس).
   الكتابة تُرسَم على canvas (العربيّة تتشكّل صحيحة) ثمّ تُركَّب overlay — لا drawtext (النواة بلا harfbuzz).
   المعاينة والتصدير يرسمان بالدالّة نفسها فما تراه هو ما يخرج.
   v3 (المالك ١٧ أكتوبر «حق اهني» بصورته): مربّع اختيار الفيديو صورة المالك نظيفة بلا نصّ (css/ved-art.css تُحمَّل عند أوّل فتح)
   والنصّ فوقها HTML بالـ١٤ لغة في مواضع العربيّ المقيسة من صورته، والمربّع كلّه يضغط. */
(function(){
  'use strict';
  var MAX_SEC = 180, MAX_TEXTS = 60, MAX_REGIONS = 10;

  /* ───────── دوالّ خالصة (تُختبر في node) ───────── */
  function r2(n){ return Math.round((+n || 0) * 100) / 100; }
  function r4(n){ return Math.round((+n || 0) * 10000) / 10000; }
  function isRtl(s){ return /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(String(s || '')); }
  function even(n){ n = Math.round(n); return n - (n % 2); }
  function clamp(n, a, b){ n = +n; if(!isFinite(n)) n = a; return Math.max(a, Math.min(b, n)); }

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

  /* خطوط التطبيق نفسها (js/app-19-fonts.js): الثلث والديواني مستضافان، والباقي من Google Fonts */
  var FONTS = [
    { id: 'default', ar: 'الافتراضي', en: 'Default', fam: 'IBM Plex Sans Arabic', line: 1.8 },
    { id: 'tajawal', ar: 'تجوال', en: 'Tajawal', fam: 'Tajawal', line: 1.7 },
    { id: 'cairo', ar: 'القاهرة', en: 'Cairo', fam: 'Cairo', g: 'Cairo:wght@400;600;700', line: 1.75 },
    { id: 'almarai', ar: 'المراعي', en: 'Almarai', fam: 'Almarai', g: 'Almarai:wght@400;700', line: 1.8 },
    { id: 'readex', ar: 'ريدكس', en: 'Readex Pro', fam: 'Readex Pro', g: 'Readex+Pro:wght@400;600;700', line: 1.75 },
    { id: 'notokufi', ar: 'كوفي نوتو', en: 'Noto Kufi', fam: 'Noto Kufi Arabic', g: 'Noto+Kufi+Arabic:wght@400;600;700', line: 1.85 },
    { id: 'vazir', ar: 'وزير', en: 'Vazirmatn', fam: 'Vazirmatn', g: 'Vazirmatn:wght@400;600;700', line: 1.8 },
    { id: 'messiri', ar: 'المسيري', en: 'El Messiri', fam: 'El Messiri', g: 'El+Messiri:wght@400;600;700', line: 1.8 },
    { id: 'kufi', ar: 'الكوفي', en: 'Kufi', fam: 'Reem Kufi', g: 'Reem+Kufi:wght@400..700', line: 1.85 },
    { id: 'naskh', ar: 'النسخ', en: 'Naskh', fam: 'Amiri', g: 'Amiri:ital,wght@0,400;0,700;1,400', line: 1.95 },
    { id: 'naskh2', ar: 'نسخ نوتو', en: 'Noto Naskh', fam: 'Noto Naskh Arabic', g: 'Noto+Naskh+Arabic:wght@400..700', line: 1.9 },
    { id: 'thuluth', ar: 'الثلث', en: 'Thuluth', fam: 'Tholoth', url: '/assets/fonts/tholoth.woff2', w: 400, line: 2.05 },
    { id: 'farsi', ar: 'الفارسي', en: 'Nastaliq', fam: 'Gulzar', g: 'Gulzar', w: 400, line: 2.45 },
    { id: 'diwani', ar: 'الديواني', en: 'Diwani', fam: 'UKIJ Diwani Tom', url: '/assets/fonts/ukij-diwani-tom.woff2', w: 400, line: 2.05 },
    { id: 'ruqaa', ar: 'الرقعة', en: 'Ruqaa', fam: 'Aref Ruqaa', g: 'Aref+Ruqaa:wght@400;700', line: 2.05 },
    { id: 'quran', ar: 'المصحف', en: 'Quranic', fam: 'Scheherazade New', g: 'Scheherazade+New:wght@400;700', line: 2.15 }
  ];
  function fontById(id){ for(var i = 0; i < FONTS.length; i++) if(FONTS[i].id === id) return FONTS[i]; return FONTS[0]; }
  /* ارتفاع السطر: الخطوط الزخرفيّة (الفارسي/الديواني/المصحف) أطول فلا تُقصّ حروفها */
  function lineK(id){ return 1.38 * fontById(id).line / 1.8; }
  function fontCss(px, id){
    var F = fontById(id);
    return (F.w || 700) + ' ' + px + 'px "' + F.fam + '", "IBM Plex Sans Arabic", Tajawal, "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  }

  /* measure(str, px, fontId) → عرض السطر بالبكسل. المكان: px/py (مركز نسبيّ بعد السحب) وإلّا pos */
  function layoutItem(it, W, H, measure){
    var fs = fontPx(it.size, W, H), fid = it.font || 'default';
    var lines, widths, maxW, tw, i;
    for(var pass = 0; pass < 2; pass++){
      maxW = Math.round(W * 0.88) - 2 * Math.round(fs * 0.45);
      lines = wrapLines(it.text, maxW, function(s){ return measure(s, fs, fid); });
      if(!lines.length) return null;
      widths = lines.map(function(l){ return measure(l, fs, fid); });
      tw = Math.max.apply(null, widths);
      if(tw <= maxW || pass) break;
      fs = Math.max(10, Math.floor(fs * maxW / tw)); /* كلمة طويلة واحدة: نصغّر الخطّ بدل أن تخرج من الإطار */
    }
    var lh = Math.round(fs * lineK(fid)), padX = Math.round(fs * 0.45), padY = Math.round(fs * 0.28);
    var bw = Math.min(even(W), Math.ceil(tw + 2 * padX)), bh = Math.min(even(H), Math.ceil(lines.length * lh + 2 * padY));
    bw += bw % 2; bh += bh % 2;
    var x, y;
    if(it.px != null && it.py != null && isFinite(it.px) && isFinite(it.py)){
      x = it.px * W - bw / 2; y = it.py * H - bh / 2;
    } else {
      x = (W - bw) / 2;
      if(it.pos === 'top') y = H * 0.07;
      else if(it.pos === 'mid') y = (H - bh) / 2;
      else y = H - bh - H * 0.09;
    }
    x = even(clamp(x, 0, W - bw)); y = even(clamp(y, 0, H - bh));
    for(i = 0; i < widths.length; i++) widths[i] = Math.round(widths[i]);
    return { fs: fs, lh: lh, padX: padX, padY: padY, lines: lines, x: x, y: y, w: bw, h: bh };
  }

  /* منطقة الكتابة القديمة (نسبيّة) → بكسلات المخرج: زوجيّة وداخل الإطار، ومع المسح هامش ٢px (delogo يحتاج حوافّ) */
  function regionPx(r, W, H){
    var m = r.kind === 'erase' ? 2 : 0;
    var x = even(clamp(r.x, 0, 1) * W), y = even(clamp(r.y, 0, 1) * H);
    var w = even(clamp(r.w, 0, 1) * W), h = even(clamp(r.h, 0, 1) * H);
    x = Math.max(m, Math.min(W - m - 4, x)); y = Math.max(m, Math.min(H - m - 4, y));
    w = Math.max(4, Math.min(W - m - x, w)); h = Math.max(4, Math.min(H - m - y, h));
    return { x: x, y: y, w: w, h: h };
  }
  function hexColor(c){ return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? '0x' + String(c).slice(1).toUpperCase() : 'black'; }
  function blurSigma(w, h){ return Math.round(clamp(Math.min(w, h) / 3, 4, 48)); }
  /* r: {x,y,w,h بالبكسل، a,b، kind، color} */
  function regionFilter(r, cur, nx){
    var en = ":enable='between(t," + r2(r.a) + ',' + r2(r.b) + ")'";
    var geo = 'x=' + r.x + ':y=' + r.y + ':w=' + r.w + ':h=' + r.h;
    if(r.kind === 'color') return ['[' + cur + ']drawbox=' + geo + ':color=' + hexColor(r.color) + ':t=fill' + en + '[' + nx + ']'];
    if(r.kind === 'blur') return [
      '[' + cur + ']split[' + nx + 'm][' + nx + 'c]',
      '[' + nx + 'c]crop=' + r.w + ':' + r.h + ':' + r.x + ':' + r.y + ',gblur=sigma=' + blurSigma(r.w, r.h) + '[' + nx + 'b]',
      '[' + nx + 'm][' + nx + 'b]overlay=' + r.x + ':' + r.y + en + '[' + nx + ']'
    ];
    return ['[' + cur + ']delogo=' + geo + en + '[' + nx + ']'];
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

  /* o: {inName, dur, W, H, fps, regions:[{x,y,w,h,a,b,kind,color}], overlays:[{name,x,y,a,b}],
         audio:{name,mode,loop,vol,origVol}|null, hasAudio, mute, copyVideo, vcodec, hq, out}
     الإخفاء أوّلًا ثمّ الكتابة فوقه، فتُكتب الجديدة مكان القديمة */
  function buildArgs(o){
    var ovs = o.overlays || [], regs = o.regions || [], A = o.audio || null;
    var T = Math.min(+o.dur || 0, MAX_SEC);
    var args = ['-hide_banner', '-y', '-i', o.inName];
    ovs.forEach(function(v){ args.push('-i', v.name); });
    var aIdx = -1;
    if(A){ if(A.loop) args.push('-stream_loop', '-1'); args.push('-i', A.name); aIdx = 1 + ovs.length; }
    var fc = [], copyV = !!o.copyVideo && !ovs.length && !regs.length;
    if(!copyV){
      var n = 0, cur = 'v0';
      fc.push('[0:v]scale=' + o.W + ':' + o.H + ',setsar=1' + ((+o.fps || 0) > 31 ? ',fps=30' : '') + '[v0]');
      regs.forEach(function(r){
        var nx = 'v' + (++n);
        regionFilter(r, cur, nx).forEach(function(f){ fc.push(f); });
        cur = nx;
      });
      ovs.forEach(function(v, i){
        var nx = 'v' + (++n);
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

  /* نصوص مربّع الاختيار بالـ١٤ لغة: [العنوان، الزرّ، الحدّ] — {n} = الحدّ بالميغا */
  var PICK = {
    ar: ['اختر الفيديو', 'اختر فيديو من جهازك', 'حتى {n} ميغا'],
    en: ['Choose video', 'Choose from your device', 'Up to {n} MB'],
    fr: ['Choisir la vidéo', 'Choisir sur l’appareil', 'Jusqu’à {n} Mo'],
    es: ['Elige el vídeo', 'Elegir del dispositivo', 'Hasta {n} MB'],
    tr: ['Videoyu seç', 'Cihazından seç', 'En fazla {n} MB'],
    ru: ['Выберите видео', 'Выбрать с устройства', 'До {n} МБ'],
    hi: ['वीडियो चुनें', 'डिवाइस से चुनें', '{n} MB तक'],
    ur: ['ویڈیو منتخب کریں', 'آلے سے منتخب کریں', '{n} MB تک'],
    bn: ['ভিডিও বেছে নিন', 'ডিভাইস থেকে বেছে নিন', '{n} MB পর্যন্ত'],
    ne: ['भिडियो छान्नुहोस्', 'डिभाइसबाट छान्नुहोस्', '{n} MB सम्म'],
    fil: ['Pumili ng video', 'Pumili sa device mo', 'Hanggang {n} MB'],
    id: ['Pilih video', 'Pilih dari perangkat', 'Hingga {n} MB'],
    zh: ['选择视频', '从设备中选择视频', '最大 {n} MB'],
    ml: ['വീഡിയോ തിരഞ്ഞെടുക്കുക', 'ഉപകരണത്തിൽ നിന്ന് എടുക്കുക', '{n} MB വരെ']
  };
  function pickText(l, i, n){ var a = PICK[l] || PICK.en; return String(a[i]).split('{n}').join(String(n)); }

  var pure = { pickText: pickText, PICK: PICK, outDims: outDims, parseProbe: parseProbe, wrapLines: wrapLines, layoutItem: layoutItem,
    segToTexts: segToTexts, buildArgs: buildArgs, fontPx: fontPx, isRtl: isRtl, regionPx: regionPx, hexColor: hexColor,
    FONTS: FONTS, fontById: fontById, lineK: lineK, fontCss: fontCss, MAX_SEC: MAX_SEC, MAX_TEXTS: MAX_TEXTS, MAX_REGIONS: MAX_REGIONS };
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
      capDone: 'انضاف {n} سطر — عدّلها لو تبي.', textPh: 'اكتب هنا…', dragHint: 'اسحب الكتابة على الفيديو وحطّها وين ما تبي.',
      font: 'الخط', size: 'الحجم', s: 'صغير', m: 'عادي', l: 'كبير', color: 'اللون', box: 'خلفية', from: 'من',
      to: 'إلى', now: 'الآن', del: 'حذف', applyAll: 'نفس الشكل للكل', maxTexts: 'وصلت الحد ({n}).',
      regs: 'إخفاء كتابة موجودة', regAdd: 'حدّد الكتابة القديمة', regCancel: 'إلغاء التحديد',
      regDrawing: 'ارسم مربّع فوق الكتابة القديمة على الفيديو…', regHint: 'المسح أنظف لما تكون الخلفية ورا الكتابة سادة.',
      region: 'منطقة {n}', kind: 'الطريقة', erase: 'مسح', blur: 'تمويه', fill: 'تغطية بلون', bgColor: 'لون الخلفية',
      writeHere: 'اكتب مكانها', play: 'تشغيل', pause: 'إيقاف',
      audio: 'الصوت', aNone: 'بدون صوت إضافي', aFile: 'ملف صوت من جهازك', aTts: 'صوت يقرأ نصّك',
      aFileHint: 'أغنية، موسيقى، قرآن، أو أي تسجيل.', aFilePick: 'اختر ملف الصوت', ttsPh: 'اكتب النص اللي تبيه ينقرأ…',
      spNormal: 'عادي', spFast: 'سريع', spXFast: 'سريع جدًا', spLabel: 'سرعة الصوت',
      female: 'صوت نسائي', male: 'صوت رجالي', ttsMake: 'جهّز الصوت', ttsBusy: 'جارٍ تجهيز الصوت…',
      mix: 'امزجه مع صوت الفيديو', replace: 'بدّل صوت الفيديو', volOrig: 'صوت الفيديو', volNew: 'الصوت الجديد',
      loop: 'كرّره لين آخر الفيديو', mute: 'اكتم صوت الفيديو الأصلي',
      rights: 'استخدم صوتًا من حقّك — بعض المنصّات تكتم الأغاني المحميّة.', exportT: 'التصدير',
      hq: 'جودة عالية 1080 (أبطأ)', exp: 'صدّر الفيديو', loading: 'جارٍ تجهيز المحرّر (أول مرة تاخذ وقت)…',
      working: 'جارٍ التصدير… {p}%', cancel: 'إلغاء', canceled: 'انلغى.', nothing: 'أضف كتابة أو صوت، أو حدّد كتابة قديمة أولًا.',
      done: 'جاهز.', save: 'حفظ', share: 'مشاركة', again: 'عدّل مرة ثانية', fail: 'ما قدرت أكمل: {e}',
      needAudio: 'اختر ملف الصوت أو جهّز الصوت أولًا.', sec: 'ث'
    },
    en: {
      title: 'Text & sound on video', menu: 'Text & sound on video', tab: 'Text & sound', close: 'Close',
      pick: 'Choose a video', pickHint: 'Up to {n} MB. Editing happens on your device.', change: 'Change video',
      longNote: 'Video is longer than 3 minutes — editing the first 3 minutes.', tooBig: 'Video too large — limit {n} MB.',
      notVideo: 'This file is not a video.', texts: 'Text', addText: 'Add text', autoCap: 'Auto-write the speech',
      autoBusy: 'Transcribing…', noSpeech: 'No clear speech found.', noAudio: 'This video has no sound.',
      capDone: 'Added {n} lines — edit them if needed.', textPh: 'Type here…', dragHint: 'Drag text on the video to place it anywhere.',
      font: 'Font', size: 'Size', s: 'Small', m: 'Normal', l: 'Large', color: 'Color', box: 'Background', from: 'From',
      to: 'To', now: 'Now', del: 'Delete', applyAll: 'Same style for all', maxTexts: 'Limit reached ({n}).',
      regs: 'Hide existing text', regAdd: 'Select old text', regCancel: 'Cancel selection',
      regDrawing: 'Draw a box over the old text on the video…', regHint: 'Erasing is cleanest when the background behind the text is plain.',
      region: 'Area {n}', kind: 'Method', erase: 'Erase', blur: 'Blur', fill: 'Cover with color', bgColor: 'Background color',
      writeHere: 'Write in its place', play: 'Play', pause: 'Pause',
      audio: 'Sound', aNone: 'No extra sound', aFile: 'Audio file from device', aTts: 'Voice reads your text',
      aFileHint: 'Song, music, Quran or any recording.', aFilePick: 'Choose audio file', ttsPh: 'Type the text to be read…',
      spNormal: 'Normal', spFast: 'Fast', spXFast: 'Very fast', spLabel: 'Voice speed',
      female: 'Female voice', male: 'Male voice', ttsMake: 'Make voice', ttsBusy: 'Making voice…',
      mix: 'Mix with video sound', replace: 'Replace video sound', volOrig: 'Video sound', volNew: 'New sound',
      loop: 'Repeat until the end', mute: 'Mute original sound',
      rights: 'Use audio you have rights to — some platforms mute protected songs.', exportT: 'Export',
      hq: 'High quality 1080 (slower)', exp: 'Export video', loading: 'Preparing editor (first time takes a while)…',
      working: 'Exporting… {p}%', cancel: 'Cancel', canceled: 'Canceled.', nothing: 'Add text or sound, or select old text first.',
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

  /* ───────── الخطوط: تحميل عند الطلب (نفس روابط ومعرّفات js/app-19-fonts.js فلا تتكرّر) ───────── */
  var fontP = {};
  function loadFont(id){
    var F = fontById(id);
    if(fontP[F.id]) return fontP[F.id];
    fontP[F.id] = new Promise(function(res){
      var done = false, fin = function(){ if(!done){ done = true; res(); } };
      try{
        if(F.url){
          var fid = 'ff-' + F.url.replace(/^.*\//, '').replace(/\W/g, '-');
          if(!document.getElementById(fid)){
            var face = document.createElement('style'); face.id = fid;
            face.textContent = '@font-face{font-family:"' + F.fam + '";src:url("' + F.url + '") format("woff2");font-display:swap;}';
            document.head.appendChild(face);
          }
          fin();
        } else if(F.g){
          var ex = document.querySelector('link[data-chat-font="' + F.id + '"],link[data-ved-font="' + F.id + '"]');
          if(ex && ex.sheet){ fin(); return; }
          if(!ex){
            ex = document.createElement('link'); ex.rel = 'stylesheet'; ex.setAttribute('data-ved-font', F.id);
            ex.crossOrigin = 'anonymous'; /* v-gfonts-cors: بلا CORS ترمي قراءة cssRules فيكتب html-to-image (تحويل PDF) خطأين في الكونسول */
            ex.href = 'https://fonts.googleapis.com/css2?family=' + F.g + '&display=swap';
            document.head.appendChild(ex);
          }
          ex.addEventListener('load', fin); ex.addEventListener('error', fin); setTimeout(fin, 8000);
        } else fin();
      }catch(e){ sw(e, 'ved:font-link'); fin(); }
    }).then(function(){
      if(!document.fonts || !document.fonts.load) return null;
      return Promise.race([document.fonts.load(fontCss(40, F.id), 'ابجد هوز abc'), new Promise(function(r){ setTimeout(r, 8000); })]);
    }).catch(function(e){ sw(e, 'ved:font'); });
    return fontP[F.id];
  }

  /* ───────── الرسم (المعاينة والتصدير بالدالّة نفسها) ───────── */
  var mctx = null;
  function measure(s, px, fid){
    if(!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = fontCss(px, fid);
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
    ctx.font = fontCss(L.fs, it.font); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
  /* معاينة الإخفاء: اللون مباشرة، التمويه بـfilter blur (أو تصغير/تكبير)، والمسح يقلّد delogo:
     يمدّ حوافّ المنطقة من فوق/تحت ويمين/يسار ويمزجها */
  var tmp = [];
  function tmpC(i, w, h){ var c = tmp[i] || (tmp[i] = document.createElement('canvas')); if(c.width !== w) c.width = w; if(c.height !== h) c.height = h; return c; }
  function drawRegion(ctx, r, W, H, v){
    var p = regionPx(r, W, H);
    if(r.kind === 'color'){ ctx.fillStyle = r.color || '#000000'; ctx.fillRect(p.x, p.y, p.w, p.h); return; }
    if(!v || !v.videoWidth || v.readyState < 2){ ctx.fillStyle = 'rgba(16,16,19,.85)'; ctx.fillRect(p.x, p.y, p.w, p.h); return; }
    var fx = v.videoWidth / W, fy = v.videoHeight / H;
    try{
      if(r.kind === 'blur'){
        var s = blurSigma(p.w, p.h);
        ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
        if(typeof ctx.filter === 'string'){
          ctx.filter = 'blur(' + s + 'px)';
          ctx.drawImage(v, p.x * fx, p.y * fy, p.w * fx, p.h * fy, p.x, p.y, p.w, p.h);
        } else {
          var k = Math.max(4, s), sm = tmpC(0, Math.max(1, Math.round(p.w / k)), Math.max(1, Math.round(p.h / k)));
          var sc = sm.getContext('2d'); sc.imageSmoothingEnabled = true;
          sc.drawImage(v, p.x * fx, p.y * fy, p.w * fx, p.h * fy, 0, 0, sm.width, sm.height);
          ctx.imageSmoothingEnabled = true; ctx.drawImage(sm, 0, 0, sm.width, sm.height, p.x, p.y, p.w, p.h);
        }
        ctx.restore();
        return;
      }
      var t = Math.max(0, p.y - 2), b = Math.min(H - 2, p.y + p.h), l = Math.max(0, p.x - 2), rt = Math.min(W - 2, p.x + p.w);
      var A = tmpC(1, p.w, p.h), B = tmpC(2, p.w, p.h), ac = A.getContext('2d'), bc = B.getContext('2d');
      function strip(c2, sx, sy, sw_, sh, grad){
        c2.globalCompositeOperation = 'source-over'; c2.clearRect(0, 0, p.w, p.h);
        c2.drawImage(v, sx * fx, sy * fy, sw_ * fx, sh * fy, 0, 0, p.w, p.h);
        if(grad){
          var g = grad === 'v' ? c2.createLinearGradient(0, 0, 0, p.h) : c2.createLinearGradient(0, 0, p.w, 0);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
          c2.globalCompositeOperation = 'destination-in'; c2.fillStyle = g; c2.fillRect(0, 0, p.w, p.h);
          c2.globalCompositeOperation = 'source-over';
        }
      }
      /* عموديّ: الحافّة العليا ثمّ السفلى بتدرّج */
      strip(ac, p.x, t, p.w, 2, null); strip(bc, p.x, b, p.w, 2, 'v'); ac.drawImage(B, 0, 0);
      ctx.drawImage(A, p.x, p.y);
      /* أفقيّ: اليسرى ثمّ اليمنى بتدرّج، ويُمزج بالنصف */
      strip(ac, l, p.y, 2, p.h, null); strip(bc, rt, p.y, 2, p.h, 'h'); ac.drawImage(B, 0, 0);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.drawImage(A, p.x, p.y); ctx.restore();
    }catch(e){ sw(e, 'ved:region-prev'); ctx.fillStyle = 'rgba(16,16,19,.85)'; ctx.fillRect(p.x, p.y, p.w, p.h); }
  }
  /* لون الخلفية حول المنطقة (من الإطار الحاليّ) — لتغطية بلون تشبه الخلفيّة */
  function sampleBg(r){
    var v = vid();
    if(!v || !v.videoWidth || v.readyState < 2) return null;
    try{
      var W = 96, H = Math.max(2, Math.round(96 * v.videoHeight / v.videoWidth));
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0, W, H);
      var d = x.getImageData(0, 0, W, H).data, sum = [0, 0, 0], n = 0;
      var x0 = Math.floor(r.x * W) - 1, y0 = Math.floor(r.y * H) - 1, x1 = Math.ceil((r.x + r.w) * W), y1 = Math.ceil((r.y + r.h) * H);
      function add(px, py){ if(px < 0 || py < 0 || px >= W || py >= H) return; var i = (py * W + px) * 4; sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++; }
      for(var i = x0; i <= x1; i++){ add(i, y0); add(i, y1); }
      for(var j = y0 + 1; j < y1; j++){ add(x0, j); add(x1, j); }
      if(!n) return null;
      return '#' + sum.map(function(s){ var h = Math.round(s / n).toString(16); return h.length < 2 ? '0' + h : h; }).join('');
    }catch(e){ sw(e, 'ved:sample'); return null; }
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
  function stInit(){ return { file: null, url: '', dur: 0, vw: 0, vh: 0, items: [], regions: [], nid: 1, written: false, inName: '', probe: null,
    aSrc: 'none', aFile: null, ttsBlob: null, aMode: 'mix', loop: true, vol: 0.45, origVol: 1, mute: false, hq: false,
    busy: false, outUrl: '', sel: null, drawMode: false, lastFont: 'default' }; }
  var st = stInit();
  var M = null, Q = function(s){ return M ? M.querySelector(s) : null; };
  var COLORS = ['#ffffff', '#ffd400', '#e8b04a', '#000000'];
  var GOLD = 'rgba(212,175,55,.85)';
  var ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="6" y1="15" x2="14" y2="15"></line><line x1="8" y1="11" x2="18" y2="11"></line><path d="M17 15.5v-2.5l2-.5"></path></svg>';
  var PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"></path></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"></rect><rect x="13.5" y="5" width="4" height="14" rx="1"></rect></svg>';
  var TAB_ART = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2140"/><stop offset="1" stop-color="#120f1c"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/><rect x="12" y="14" width="56" height="40" rx="5" fill="#0b0a12" stroke="#e8b04a" stroke-width="2"/><path d="M35 26v16l13-8z" fill="#e8b04a"/><rect x="18" y="58" width="44" height="5" rx="2.5" fill="#fff"/><rect x="26" y="66" width="28" height="4" rx="2" fill="#ffd400"/><path d="M60 22c3 2 3 8 0 10M64 19c5 4 5 12 0 16" stroke="#ffd400" stroke-width="2" fill="none" stroke-linecap="round"/></svg>');

  /* الشكل: بلا خطوط حدود (شفّافة)، الذهبيّ عند المرور/التركيز/التحديد فقط، وخلفيّتان فقط: #000 و#101013 */
  function css(){
    if(document.getElementById('vedCss')) return;
    var s = document.createElement('style'); s.id = 'vedCss';
    var hot = ['.ved-btn', '.ved-x', '.ved-item', '.ved-pick', '.ved-play', 'textarea', 'select', 'input[type=number]'];
    var on = function(suf){ return hot.map(function(h){ return '#vedModal ' + h + suf; }).join(','); };
    s.textContent = [
      '#vedModal{position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,.78);display:none;align-items:flex-start;justify-content:center;overflow-y:auto;padding:16px 10px 40px}',
      '#vedModal.open{display:flex}',
      '#vedModal .ved-card{width:100%;max-width:620px;background:#000;color:var(--text,#e9e7ef);border:1px solid transparent;border-radius:16px;padding:14px;box-shadow:0 20px 60px rgba(0,0,0,.6);font:inherit}',
      '#vedModal .ved-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}',
      '#vedModal .ved-head b{font-size:16px}',
      '#vedModal button{font:inherit;cursor:pointer}',
      '#vedModal .ved-x{background:#101013;border:1px solid transparent;border-radius:999px;color:inherit;font-size:20px;line-height:1;width:34px;height:34px;padding:0}',
      '#vedModal .ved-btn{background:#101013;color:inherit;border:1px solid transparent;border-radius:999px;padding:8px 14px;font-size:13.5px;transition:border-color .15s,box-shadow .15s}',
      '#vedModal .ved-pri{color:#e8b04a;font-weight:700}',
      '#vedModal .ved-hint{font-size:12px;opacity:.7;margin-top:6px}',
      /* صورة المالك 1280×585: المواضع مقيسة من نصّه العربيّ (px→٪)، والحجم بعرض المربّع (cqw) */
      '#vedModal .ved-pick{position:relative;aspect-ratio:1280/585;container-type:inline-size;background:#000 center/cover no-repeat;border:1px solid transparent;border-radius:14px;overflow:hidden;cursor:pointer;transition:border-color .15s,box-shadow .15s}',
      '#vedModal .ved-pick .ved-pt,#vedModal .ved-pick .ved-pb,#vedModal .ved-pick .ved-ph{position:absolute;margin:0;padding:0;white-space:nowrap;overflow:hidden;line-height:1.25;transform:translateY(-50%);' +
        'background:linear-gradient(180deg,#fff6cf 0%,#f3d77f 42%,#c9a12e 68%,#8a6612 100%) 0 0/100% 1.25em repeat-y;-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 1px rgba(0,0,0,.9)) drop-shadow(0 0 6px rgba(0,0,0,.5))}',
      '#vedModal .ved-pick .ved-pt{top:18.6%;left:61.5%;right:13.4%;text-align:right;font-weight:800;font-size:max(12px,4cqw)}',
      '#vedModal .ved-pick .ved-pb{top:53.3%;left:35%;right:35%;text-align:center;font-weight:800;font-size:max(10px,3cqw);border:0;border-radius:0;cursor:pointer}',
      '#vedModal .ved-pick .ved-ph{top:70.6%;left:22%;right:22%;text-align:center;font-weight:500;font-size:max(10px,2.3cqw)}',
      '#vedModal .ved-pick .ved-pb:focus-visible{outline:none}',
      '#vedModal .ved-pick:focus-within{box-shadow:0 4px 18px rgba(255,255,255,.35)}',
      '#vedModal .ved-stage{position:relative;margin:0 auto;background:#000;border-radius:10px;overflow:hidden}',
      '#vedModal .ved-stage video,#vedModal .ved-stage canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}',
      '#vedModal .ved-stage canvas{touch-action:none;cursor:pointer;-webkit-user-select:none;user-select:none}',
      '#vedModal .ved-stage.draw canvas{cursor:crosshair}',
      '#vedModal .ved-ctl{display:flex;align-items:center;gap:8px;margin:6px auto 0}',
      '#vedModal .ved-play{width:38px;height:38px;flex:0 0 auto;border-radius:50%;background:#101013;color:#e8b04a;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '#vedModal .ved-ctl input[type=range]{flex:1 1 auto;width:auto;min-width:0}',
      '#vedModal .ved-time{font-size:12px;opacity:.75;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '#vedModal .ved-sec{margin-top:18px}',
      '#vedModal .ved-sec h4{margin:0 0 8px;font-size:14px}',
      '#vedModal .ved-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
      '#vedModal .ved-item{background:#101013;border:1px solid transparent;border-radius:12px;padding:8px;margin-top:8px;transition:border-color .15s,box-shadow .15s}',
      '#vedModal .ved-item .ved-btn,#vedModal .ved-item textarea,#vedModal .ved-item select,#vedModal .ved-item input[type=number]{background:#000}',
      '#vedModal .ved-item b.ved-rt{font-size:13px;font-weight:600}',
      '#vedModal textarea,#vedModal select,#vedModal input[type=number]{font:inherit;font-size:14px;background:#101013;color:inherit;border:1px solid transparent;border-radius:8px;padding:6px 8px;outline:none}',
      '#vedModal textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:44px}',
      '#vedModal input[type=number]{width:72px}',
      on(':hover') + ',' + on(':focus-visible') + ',#vedModal textarea:focus,#vedModal select:focus,#vedModal input[type=number]:focus,#vedModal .ved-item.sel{border-color:transparent;box-shadow:0 4px 18px rgba(255,255,255,.35)}',
      '#vedModal .ved-btn:disabled{opacity:.5;cursor:default;border-color:transparent;box-shadow:none}',
      '#vedModal input[type=range],#vedModal input[type=checkbox],#vedModal input[type=radio]{accent-color:#e8b04a}',
      '#vedModal .ved-sw{width:24px;height:24px;border-radius:50%;border:2px solid transparent;padding:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}',
      '#vedModal .ved-sw.on,#vedModal .ved-sw:hover{box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 0 12px 2px rgba(255,255,255,.55)}',
      '#vedModal .ved-mini{font-size:12px;padding:4px 10px}',
      '#vedModal label{font-size:13px;display:inline-flex;align-items:center;gap:5px}',
      '#vedModal label input[type=range]{width:120px}',
      '#vedModal label b{font-weight:500;font-size:12px;opacity:.75;min-width:34px}',
      '#vedModal .ved-bar{height:8px;background:#101013;border-radius:8px;overflow:hidden;margin-top:8px}',
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
        '<div class="ved-pick"><div class="ved-pt" data-k="pickT" aria-hidden="true"></div><button type="button" class="ved-pb" data-k="pickBtn"></button><div class="ved-ph" data-k="pickHint"></div>' +
          '<input type="file" accept="video/*" data-k="vfile" hidden></div>' +
        '<div class="ved-main" hidden>' +
          '<div class="ved-stage"><video playsinline preload="auto"></video><canvas></canvas></div>' +
          '<div class="ved-ctl" dir="ltr"><button type="button" class="ved-play" data-k="play"></button><input type="range" min="0" max="0" step="0.01" value="0" data-k="seek"><span class="ved-time" data-k="time">0:00 / 0:00</span></div>' +
          '<div class="ved-row" style="justify-content:space-between;margin-top:4px"><span class="ved-hint" data-k="info"></span><button type="button" class="ved-btn ved-mini" data-k="change"></button></div>' +
          '<div class="ved-sec"><h4 data-k="hRegs"></h4><div class="ved-row"><button type="button" class="ved-btn" data-k="regAdd"></button></div>' +
            '<div class="ved-hint" data-k="regHint"></div><div class="ved-status" data-k="rStatus"></div><div data-k="rlist"></div></div>' +
          '<div class="ved-sec"><h4 data-k="hTexts"></h4><div class="ved-row"><button type="button" class="ved-btn" data-k="add"></button><button type="button" class="ved-btn" data-k="auto"></button></div>' +
            '<div class="ved-hint" data-k="dragHint"></div><div class="ved-status" data-k="tStatus"></div><div data-k="list"></div></div>' +
          '<div class="ved-sec"><h4 data-k="hAudio"></h4><div class="ved-row" data-k="aSrc"></div>' +
            '<div data-k="aFileBox" hidden><div class="ved-row"><button type="button" class="ved-btn" data-k="aPick"></button><span class="ved-hint" data-k="aName"></span></div>' +
              '<div class="ved-hint" data-k="aHint"></div><input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus" data-k="afile" hidden></div>' +
            '<div data-k="ttsBox" hidden><textarea data-k="ttsText" rows="3" maxlength="4000"></textarea><div class="ved-row" style="margin-top:6px"><select data-k="ttsGender"></select><select data-k="ttsSpeed"></select><button type="button" class="ved-btn" data-k="ttsMake"></button></div></div>' +
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
    artCss();
    /* المربّع كلّه يفتح الاختيار (الزرّ داخله يصعد إليه فلا فتح مرّتين، والملفّ نفسه مستثنى) */
    Q('.ved-pick').onclick = function(e){ if(e.target !== K('vfile')) K('vfile').click(); };
    K('change').textContent = T_('change'); K('change').onclick = function(){ if(!st.busy) K('vfile').click(); };
    K('vfile').onchange = function(){ var f = this.files && this.files[0]; this.value = ''; if(f) loadVideo(f); };
    K('hRegs').textContent = T_('regs'); K('regHint').textContent = T_('regHint');
    K('regAdd').textContent = T_('regAdd'); K('regAdd').onclick = function(){ setDrawMode(!st.drawMode); };
    K('hTexts').textContent = T_('texts'); K('add').textContent = T_('addText'); K('auto').textContent = T_('autoCap');
    K('dragHint').textContent = T_('dragHint');
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
    /* v-video-voice-speed: سرعة الصوت (الافتراضيّ «سريع») — تسميات الـ١٤ لغة من window.t ومفاتيح voiceSpeed* نفسها؛ التفضيل مشترك مع نموذج صانع الفيديو */
    var spLab = function(k, fb){ try{ if(typeof window.t === 'function'){ var v = window.t(k); if(v && v !== k) return v; } }catch(e){ sw(e, 'ved:spLab'); } return fb; };
    [['normal', 'voiceSpeedNormal', 'spNormal'], ['fast', 'voiceSpeedFast', 'spFast'], ['xfast', 'voiceSpeedXFast', 'spXFast']].forEach(function(o){ K('ttsSpeed').appendChild(el('option', { value: o[0], text: spLab(o[1], T_(o[2])) })); });
    var spV = 'fast'; try{ var spS = localStorage.getItem('aiapp_video_voice_speed'); if(spS === 'normal' || spS === 'fast' || spS === 'xfast') spV = spS; }catch(e){ sw(e, 'ved:spRead'); }
    K('ttsSpeed').value = spV; K('ttsSpeed').title = spLab('voiceSpeedLabel', T_('spLabel'));
    K('ttsSpeed').onchange = function(){ try{ localStorage.setItem('aiapp_video_voice_speed', this.value); }catch(e){ sw(e, 'ved:spSave'); } };
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
      K('info').textContent = st.dur > MAX_SEC ? T_('longNote') : ''; /* المدّة ظاهرة في شريط التشغيل */
      K('seek').max = String(r2(st.dur));
      sizeStage(); redraw();
    });
    ['timeupdate', 'seeked', 'loadeddata', 'pause'].forEach(function(ev){ v.addEventListener(ev, redraw); });
    v.addEventListener('play', function loop(){ redraw(); if(!v.paused && !v.ended && M && M.classList.contains('open')) requestAnimationFrame(loop); });
    K('play').onclick = togglePlay;
    K('seek').addEventListener('input', function(){ seekTo(+this.value || 0); });
    K('seek').addEventListener('pointerdown', function(){ seeking = true; });
    K('seek').addEventListener('change', function(){ seeking = false; syncCtl(); });
    bindCanvas(Q('.ved-stage canvas'));
    window.addEventListener('resize', function(){ if(M && M.classList.contains('open')){ sizeStage(); fitPick(); } }); /* v-audit-boot: النافذة قد تُزال (reset) */
    M.__K = K;
  }
  function K(k){ return M ? M.__K(k) : null; }
  function vid(){ return Q('.ved-stage video'); }
  function cnv(){ return Q('.ved-stage canvas'); }
  function maxMB(){ return isMobile() ? 80 : 200; }
  function fmt(s){ s = Math.max(0, Math.round(s || 0)); var m = Math.floor(s / 60), x = s % 60; return m + ':' + (x < 10 ? '0' : '') + x; }
  function setStatus(s, which){ var e = K(which || 'status'); if(e) e.textContent = s || ''; }
  function limitT(){ return Math.min(st.dur || MAX_SEC, MAX_SEC); }
  function togglePlay(){
    var v = vid(); if(!v || !st.file) return;
    if(v.paused || v.ended){ var p = v.play(); if(p && p.catch) p.catch(function(e){ sw(e, 'ved:play'); }); } else v.pause();
  }
  function seekTo(t){ var v = vid(); try{ v.currentTime = Math.max(0, Math.min(st.dur || 0, t)); }catch(e){ /* guard-ok — قبل البيانات */ } }
  function syncCtl(){
    var v = vid(), b = K('play'); if(!v || !b) return;
    var playing = !v.paused && !v.ended, want = playing ? 'pause' : 'play';
    if(b.getAttribute('data-s') !== want){ b.setAttribute('data-s', want); b.innerHTML = playing ? PAUSE : PLAY; b.setAttribute('aria-label', T_(want)); }
    if(!seeking) K('seek').value = String(r2(v.currentTime || 0));
    K('time').textContent = fmt(v.currentTime) + ' / ' + fmt(st.dur);
  }
  var seeking = false;

  /* صورة المربّع (data URI ‎~200KB‎) في ملفّ مستقلّ يُحمَّل عند أوّل فتح فقط — لا تثقل الصفحة */
  function artCss(){
    if(document.getElementById('vedArtCss')) return;
    var l = document.createElement('link'); l.id = 'vedArtCss'; l.rel = 'stylesheet'; l.href = '/css/ved-art.css?v=1';
    document.head.appendChild(l);
  }
  function pickTexts(){
    var l = lang(), n = maxMB(), t = Q('[data-k="pickT"]'), b = Q('[data-k="pickBtn"]'), h = Q('[data-k="pickHint"]');
    if(!t || !b || !h) return;
    t.textContent = pickText(l, 0, n); b.textContent = pickText(l, 1, n); h.textContent = pickText(l, 2, n);
    b.title = T_('pickHint', { n: n });
    fitPick();
  }
  /* النصّ داخل موضعه من الصورة: سطر واحد يصغر حتّى يتّسع، وإن ضاق جدًّا (لغات طويلة/جوال) فسطران داخل الحيّز نفسه */
  function fitOne(x, maxH){
    x.style.fontSize = ''; x.style.whiteSpace = '';
    var base = parseFloat(getComputedStyle(x).fontSize) || 12, fs = base, i = 0, min = Math.max(9, base * 0.7);
    var over = function(){ return x.scrollWidth > x.clientWidth + 1 || (maxH > 0 && x.scrollHeight > maxH + 1); };
    while(over() && fs > min && i++ < 60){ fs -= 0.5; x.style.fontSize = fs + 'px'; }
    if(!over()) return;
    if(maxH > 0){ x.style.whiteSpace = 'normal'; fs = base; x.style.fontSize = fs + 'px'; }
    i = 0; while(over() && fs > 7 && i++ < 80){ fs -= 0.5; x.style.fontSize = fs + 'px'; }
  }
  function fitPick(){
    var box = Q('.ved-pick'); if(!box || box.hidden || !box.clientWidth) return;
    var h = box.clientHeight;
    fitOne(box.querySelector('.ved-pt'), h * 0.2);   /* بين أعلى الصورة والزخرفة */
    fitOne(box.querySelector('.ved-pb'), h * 0.15);  /* داخل الزرّ الذهبيّ */
    fitOne(box.querySelector('.ved-ph'), 0);
  }
  function open(){
    if(!M) build();
    M.setAttribute('dir', dirRtl() ? 'rtl' : 'ltr');
    M.classList.add('open');
    pickTexts();
    try{ if(document.fonts && document.fonts.ready) document.fonts.ready.then(fitPick); }catch(e){ /* guard-ok — الحجم الأوّل يكفي */ }
    loadFont('default').then(redraw);
    if(st.file) sizeStage();
  }
  function close(){
    if(!M) return;
    if(st.busy) cancel();
    setDrawMode(false);
    var v = vid(); try{ v.pause(); }catch(e){ /* guard-ok */ }
    M.classList.remove('open');
  }
  /* v-audit-boot (cli-video-1): الخروج (chatsLogoutWipe في app-04) يفرّغ المحرّر — فيديو الحساب السابق ونصوصه وصوته ونتيجته لا تبقى
     لمن يدخل بعده في الجلسة نفسها (الخروج لا يعيد تحميل الصفحة). النافذة تُزال وتُبنى من جديد عند الفتح التالي، والحالة من أوّلها. */
  function reset(){
    if(!M) return;
    try{ close(); }catch(e){ sw(e, 'ved:reset-close'); }
    try{ var ap = K('aPrev'); if(ap && ap.src) URL.revokeObjectURL(ap.src); }catch(e){ sw(e, 'ved:reset-aprev'); }
    [st.url, st.outUrl].forEach(function(u){ if(u) try{ URL.revokeObjectURL(u); }catch(e){ sw(e, 'ved:reset-url'); } });
    if(ff && st.inName) rmf(st.inName);
    try{ M.remove(); }catch(e){ sw(e, 'ved:reset-remove'); }
    M = null;
    st = stInit();
  }

  function loadVideo(f){
    if(!/^video\//.test(f.type || '') && !/\.(mp4|mov|webm|mkv|3gp|m4v)$/i.test(f.name || '')){ alert(T_('notVideo')); return; }
    if(f.size > maxMB() * 1024 * 1024){ alert(T_('tooBig', { n: maxMB() })); return; }
    if(st.url) URL.revokeObjectURL(st.url);
    st.file = f; st.url = URL.createObjectURL(f); st.written = false; st.probe = null;
    st.items = st.items.filter(function(it){ return !it.auto; });
    st.regions = []; st.sel = null; setDrawMode(false); /* مناطق الكتابة القديمة تخصّ الفيديو السابق */
    if(ff) rmf(st.inName);
    Q('.ved-pick').hidden = true; Q('.ved-main').hidden = false; K('result').hidden = true; setStatus('');
    var v = vid(); v.src = st.url;
    renderList(); renderRegions(); syncAudio();
  }

  function dims(){ return outDims(st.vw, st.vh, st.hq); }
  function sizeStage(){
    var stg = Q('.ved-stage'); if(!stg) return;
    var d = dims(), par = Q('.ved-main').clientWidth || 360;
    var maxH = Math.min(window.innerHeight * 0.5, 560), w = Math.round(Math.min(par, maxH * d.w / d.h));
    stg.style.width = w + 'px'; stg.style.height = Math.round(w * d.h / d.w) + 'px';
    Q('.ved-ctl').style.width = Math.max(w, Math.min(par, 300)) + 'px';
    var c = cnv(); c.width = d.w; c.height = d.h;
    redraw();
  }
  function activeAt(o, t){ return t >= o.a && t < o.b; }
  function isSel(type, o){ return !!(st.sel && st.sel.type === type && st.sel.id === o.id); }
  function textShown(it, t, paused){ return !!String(it.text || '').trim() && (activeAt(it, t) || it.focus || (paused && isSel('t', it))); }
  function regShown(r, t, paused){ return activeAt(r, t) || (paused && isSel('r', r)); }
  function cssK(){ var c = cnv(), w = c.getBoundingClientRect().width || c.width; return c.width / w; }
  function redraw(){
    var c = cnv(); if(!c) return;
    var ctx = c.getContext('2d'), v = vid(), t = v.currentTime || 0, W = c.width, H = c.height, paused = v.paused || v.ended;
    ctx.clearRect(0, 0, W, H);
    st.regions.forEach(function(r){ if(regShown(r, t, paused)) drawRegion(ctx, r, W, H, v); });
    st.items.forEach(function(it){
      if(!textShown(it, t, paused)) return;
      var L = layoutItem(it, W, H, measure); if(L) drawItem(ctx, it, L, 0, 0);
    });
    if(paused || drag) drawGuides(ctx, W, H, t, paused);
    syncCtl();
  }
  /* إرشادات المعاينة فقط (لا تدخل التصدير): إطار متقطّع ذهبيّ للمحدَّد، ومقبض تكبير للمنطقة */
  function drawGuides(ctx, W, H, t, paused){
    var k = cssK();
    ctx.save(); ctx.lineWidth = Math.max(1, 2 * k); ctx.setLineDash([6 * k, 4 * k]);
    st.regions.forEach(function(r){
      if(!regShown(r, t, paused)) return;
      var p = regionPx(r, W, H), on = isSel('r', r);
      ctx.strokeStyle = on ? GOLD : 'rgba(255,255,255,.55)'; ctx.strokeRect(p.x, p.y, p.w, p.h);
      if(on){
        ctx.save(); ctx.setLineDash([]); ctx.fillStyle = '#e8b04a'; ctx.beginPath(); ctx.arc(p.x + p.w, p.y + p.h, 7 * k, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, 1.5 * k); ctx.stroke(); ctx.restore();
      }
    });
    st.items.forEach(function(it){
      if(!(isSel('t', it) || it.focus || (drag && drag.obj === it)) || !textShown(it, t, true)) return;
      var L = layoutItem(it, W, H, measure); if(!L) return;
      ctx.strokeStyle = GOLD; ctx.strokeRect(L.x - 3 * k, L.y - 3 * k, L.w + 6 * k, L.h + 6 * k);
    });
    if(drag && drag.mode === 'new' && drag.rect){
      var q = drag.rect; ctx.strokeStyle = GOLD; ctx.fillStyle = 'rgba(212,175,55,.12)';
      ctx.fillRect(q.x, q.y, q.w, q.h); ctx.strokeRect(q.x, q.y, q.w, q.h);
    }
    ctx.restore();
  }

  /* ───────── السحب على المعاينة: تحريك الكتابة والمناطق، رسم منطقة جديدة، ونقرة الفراغ تشغّل/توقف ───────── */
  var drag = null;
  function cpt(e){ var c = cnv(), rc = c.getBoundingClientRect(); return { x: (e.clientX - rc.left) * c.width / (rc.width || 1), y: (e.clientY - rc.top) * c.height / (rc.height || 1), k: c.width / (rc.width || 1) }; }
  function hitTest(p){
    var c = cnv(), W = c.width, H = c.height, v = vid(), t = v.currentTime || 0, paused = v.paused || v.ended, tol = 8 * p.k, i;
    if(st.sel && st.sel.type === 'r'){
      var R = findR(st.sel.id);
      if(R && regShown(R, t, paused)){
        var q = regionPx(R, W, H);
        if(Math.abs(p.x - (q.x + q.w)) <= 2.2 * tol && Math.abs(p.y - (q.y + q.h)) <= 2.2 * tol) return { mode: 'size', type: 'r', obj: R };
      }
    }
    for(i = st.items.length - 1; i >= 0; i--){
      var it = st.items[i]; if(!textShown(it, t, paused)) continue;
      var L = layoutItem(it, W, H, measure);
      if(L && p.x >= L.x - tol && p.x <= L.x + L.w + tol && p.y >= L.y - tol && p.y <= L.y + L.h + tol) return { mode: 'move', type: 't', obj: it, L: L };
    }
    for(i = st.regions.length - 1; i >= 0; i--){
      var r = st.regions[i]; if(!regShown(r, t, paused)) continue;
      var q2 = regionPx(r, W, H);
      if(p.x >= q2.x - tol && p.x <= q2.x + q2.w + tol && p.y >= q2.y - tol && p.y <= q2.y + q2.h + tol) return { mode: 'move', type: 'r', obj: r };
    }
    return null;
  }
  function bindCanvas(c){
    c.addEventListener('pointerdown', function(e){
      if(st.busy || !st.file || drag) return;
      var p = cpt(e), v = vid();
      drag = { sx: p.x, sy: p.y, k: p.k, moved: false, pid: e.pointerId, mode: 'tap' };
      if(st.drawMode){ drag.mode = 'new'; v.pause(); }
      else {
        var h = hitTest(p);
        if(h){
          drag.mode = h.mode; drag.type = h.type; drag.obj = h.obj;
          if(h.type === 't'){ drag.cx0 = h.L.x + h.L.w / 2; drag.cy0 = h.L.y + h.L.h / 2; }
          else { drag.ox = h.obj.x; drag.oy = h.obj.y; drag.ow = h.obj.w; drag.oh = h.obj.h; }
          select(h.type, h.obj, false);
          if(!v.paused) v.pause();
        }
      }
      try{ c.setPointerCapture(e.pointerId); }catch(x){ /* guard-ok */ }
      e.preventDefault();
    });
    c.addEventListener('pointermove', function(e){
      if(!drag || e.pointerId !== drag.pid) return;
      var p = cpt(e), W = c.width, H = c.height, dx = p.x - drag.sx, dy = p.y - drag.sy;
      if(!drag.moved && Math.abs(dx) < 5 * drag.k && Math.abs(dy) < 5 * drag.k) return;
      drag.moved = true;
      if(drag.mode === 'new'){
        drag.rect = { x: Math.min(drag.sx, p.x), y: Math.min(drag.sy, p.y), w: Math.abs(dx), h: Math.abs(dy) };
      } else if(drag.type === 't'){
        drag.obj.px = r4(clamp((drag.cx0 + dx) / W, 0, 1)); drag.obj.py = r4(clamp((drag.cy0 + dy) / H, 0, 1));
      } else if(drag.mode === 'size'){
        var r = drag.obj; r.w = r4(clamp(drag.ow + dx / W, 0.02, 1 - r.x)); r.h = r4(clamp(drag.oh + dy / H, 0.015, 1 - r.y));
      } else if(drag.type === 'r'){
        var g = drag.obj; g.x = r4(clamp(drag.ox + dx / W, 0, 1 - g.w)); g.y = r4(clamp(drag.oy + dy / H, 0, 1 - g.h));
      } else return;
      redraw();
      e.preventDefault();
    });
    function end(e){
      if(!drag || (e && e.pointerId !== drag.pid)) return;
      var d = drag, c2 = cnv(); drag = null;
      if(d.mode === 'new'){
        var W = c2.width, H = c2.height, q = d.rect;
        if(!d.moved || !q || q.w < 10 * d.k || q.h < 8 * d.k) q = { x: d.sx - W * 0.25, y: d.sy - H * 0.04, w: W * 0.5, h: H * 0.08 };
        addRegion({ x: q.x / W, y: q.y / H, w: q.w / W, h: q.h / H });
        setDrawMode(false);
      } else if(d.mode === 'tap' && !d.moved){
        if(e && e.type === 'pointerup') togglePlay();
      } else if(!d.moved && d.obj){
        var cardEl = Q('[data-' + (d.type === 'r' ? 'rid' : 'id') + '="' + d.obj.id + '"]');
        if(cardEl){ try{ cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }catch(x){ /* guard-ok */ } }
      }
      redraw();
    }
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }
  function select(type, o, seek){
    st.sel = o ? { type: type, id: o.id } : null;
    if(o && seek){
      var v = vid();
      if(!v.paused) v.pause();
      if(!activeAt(o, v.currentTime || 0)) seekTo(Math.min(o.a + 0.05, Math.max(0, o.b - 0.05)));
    }
    markSel(); redraw();
  }
  function markSel(){
    if(!M) return;
    [].forEach.call(M.querySelectorAll('.ved-item'), function(x){
      var on = st.sel && ((st.sel.type === 't' && x.getAttribute('data-id') === String(st.sel.id)) || (st.sel.type === 'r' && x.getAttribute('data-rid') === String(st.sel.id)));
      x.classList.toggle('sel', !!on);
    });
  }
  function setDrawMode(on){
    st.drawMode = !!on;
    if(!M) return;
    var stg = Q('.ved-stage'); if(stg) stg.classList.toggle('draw', st.drawMode);
    K('regAdd').textContent = T_(st.drawMode ? 'regCancel' : 'regAdd');
    setStatus(st.drawMode ? T_('regDrawing') : '', 'rStatus');
    if(st.drawMode){ var v = vid(); if(v && !v.paused) v.pause(); }
  }

  /* ───────── الكتابة ───────── */
  function addItem(p){
    if(st.items.length >= MAX_TEXTS){ setStatus(T_('maxTexts', { n: MAX_TEXTS }), 'tStatus'); return null; }
    var v = vid(), t = v ? (v.currentTime || 0) : 0, Tm = limitT();
    var a = p.a != null ? p.a : r2(Math.min(t, Math.max(0, Tm - 0.5)));
    var it = { id: st.nid++, text: p.text || '', pos: p.pos || (p.auto ? 'bottom' : 'top'), /* العنوان فوق والترجمة تحت فلا يتراكبان */
      px: p.px != null ? p.px : null, py: p.py != null ? p.py : null, font: p.font || st.lastFont || 'default',
      size: p.size || 'm', color: p.color || '#ffffff', box: p.box != null ? p.box : true,
      a: a, b: p.b != null ? p.b : r2(p.text ? Math.min(Tm, a + 3) : Tm), auto: !!p.auto };
    st.items.push(it);
    loadFont(it.font).then(redraw);
    if(!p.silent){ st.sel = { type: 't', id: it.id }; renderList(); var ta = K('list').querySelector('[data-id="' + it.id + '"] textarea'); if(ta) ta.focus(); }
    return it;
  }
  function renderList(){
    var box = K('list'); box.innerHTML = '';
    st.items.slice().sort(function(x, y){ return x.a - y.a; }).forEach(function(it){ box.appendChild(card(it)); });
    markSel(); redraw();
  }
  /* من/إلى + «الآن» — مشترك بين الكتابة ومناطق الإخفاء */
  function timeRow(o, rerender, extra){
    var v = vid();
    function num(key){
      var n = el('input', { type: 'number', step: '0.1', min: '0', max: String(r2(limitT())), 'aria-label': T_(key === 'a' ? 'from' : 'to') });
      n.value = String(o[key]);
      n.onchange = function(){ var x = Math.max(0, Math.min(limitT(), +n.value || 0)); o[key] = r2(x); if(o.b <= o.a) o.b = r2(Math.min(limitT(), o.a + 0.5)); rerender(); };
      return n;
    }
    function nowBtn(key){ return btn(T_('now'), function(){ o[key] = r2(Math.min(limitT(), v.currentTime || 0)); if(o.b <= o.a) o.b = r2(Math.min(limitT(), o.a + 0.5)); rerender(); }, 'ved-mini'); }
    return el('div', { 'class': 'ved-row', style: 'margin-top:6px' }, [el('span', { 'class': 'ved-hint', style: 'margin:0', text: T_('from') }), num('a'), nowBtn('a'),
      el('span', { 'class': 'ved-hint', style: 'margin:0', text: T_('to') }), num('b'), nowBtn('b')].concat(extra || []));
  }
  function swatches(list, cur, onPick, labelKey){
    var row = el('span', { 'class': 'ved-row', style: 'gap:4px' });
    list.forEach(function(c){
      var b = el('button', { type: 'button', 'class': 'ved-sw' + (cur === c ? ' on' : ''), style: 'background:' + c, 'aria-label': T_(labelKey || 'color') + ' ' + c });
      b.onclick = function(){ [].forEach.call(row.children, function(x){ x.classList.remove('on'); }); b.classList.add('on'); onPick(c); };
      row.appendChild(b);
    });
    return row;
  }
  function card(it){
    var v = vid();
    var ta = el('textarea', { rows: '2', placeholder: T_('textPh'), maxlength: '300' });
    ta.value = it.text; ta.dir = 'auto';
    ta.oninput = function(){ it.text = ta.value; redraw(); };
    ta.onfocus = function(){ it.focus = true; st.sel = { type: 't', id: it.id }; markSel(); if(!(v.currentTime >= it.a && v.currentTime < it.b)) seekTo(Math.min(it.a + 0.05, Math.max(0, it.b - 0.05))); redraw(); };
    ta.onblur = function(){ it.focus = false; redraw(); };
    ta.style.fontFamily = '"' + fontById(it.font).fam + '", inherit';
    var fsel = el('select', { 'aria-label': T_('font') });
    FONTS.forEach(function(F){ var op = el('option', { value: F.id, text: lang() === 'ar' ? F.ar : F.en }); if(it.font === F.id) op.selected = true; fsel.appendChild(op); });
    fsel.onchange = function(){ it.font = fsel.value; st.lastFont = it.font; ta.style.fontFamily = '"' + fontById(it.font).fam + '", inherit'; loadFont(it.font).then(redraw); redraw(); };
    var ssel = el('select', { 'aria-label': T_('size') });
    ['s', 'm', 'l'].forEach(function(o){ var op = el('option', { value: o, text: T_(o) }); if(it.size === o) op.selected = true; ssel.appendChild(op); });
    ssel.onchange = function(){ it.size = ssel.value; redraw(); };
    var sws = swatches(COLORS.indexOf(it.color) < 0 ? COLORS.concat([it.color]) : COLORS, it.color, function(c){ it.color = c; redraw(); });
    var bx = el('input', { type: 'checkbox' }); bx.checked = !!it.box; bx.onchange = function(){ it.box = bx.checked; redraw(); };
    var row1 = el('div', { 'class': 'ved-row', style: 'margin-top:6px' }, [fsel, ssel, sws, el('label', null, [bx, el('span', { text: T_('box') })])]);
    var row2 = timeRow(it, renderList, [
      btn(T_('applyAll'), function(){ st.items.forEach(function(x){ x.font = it.font; x.size = it.size; x.color = it.color; x.box = it.box; x.pos = it.pos; x.px = it.px; x.py = it.py; }); renderList(); }, 'ved-mini'),
      btn(T_('del'), function(){ st.items = st.items.filter(function(x){ return x !== it; }); if(isSel('t', it)) st.sel = null; renderList(); }, 'ved-mini')]);
    var c = el('div', { 'class': 'ved-item', 'data-id': String(it.id) }, [ta, row1, row2]);
    c.addEventListener('pointerdown', function(){ if(!isSel('t', it)) select('t', it, true); });
    return c;
  }

  /* ───────── إخفاء كتابة موجودة ───────── */
  function findR(id){ for(var i = 0; i < st.regions.length; i++) if(st.regions[i].id === id) return st.regions[i]; return null; }
  function addRegion(q){
    if(st.regions.length >= MAX_REGIONS){ setStatus(T_('maxTexts', { n: MAX_REGIONS }), 'rStatus'); return null; }
    var x = clamp(q.x, 0, 0.98), y = clamp(q.y, 0, 0.985);
    var r = { id: st.nid++, x: r4(x), y: r4(y), w: r4(clamp(q.w, 0.02, 1 - x)), h: r4(clamp(q.h, 0.015, 1 - y)), a: 0, b: r2(limitT()), kind: 'erase', color: '#000000' };
    r.color = sampleBg(r) || '#000000';
    st.regions.push(r); st.sel = { type: 'r', id: r.id };
    renderRegions();
    return r;
  }
  function renderRegions(){
    var box = K('rlist'); box.innerHTML = '';
    st.regions.forEach(function(r, i){ box.appendChild(regCard(r, i)); });
    markSel(); redraw();
  }
  function lum(hex){ var n = parseInt(String(hex || '#000000').slice(1), 16) || 0; return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
  function writeHere(r){
    var c = cnv(), W = c.width, H = c.height, q = regionPx(r, W, H);
    var size = q.h < fontPx('m', W, H) * 1.7 ? 's' : q.h > fontPx('l', W, H) * 2 ? 'l' : 'm';
    addItem({ text: '', a: r.a, b: r.b, px: r4((q.x + q.w / 2) / W), py: r4((q.y + q.h / 2) / H), size: size, box: false,
      color: r.kind === 'color' && lum(r.color) > 0.6 ? '#000000' : '#ffffff' });
  }
  function regCard(r, i){
    var ksel = el('select', { 'aria-label': T_('kind') });
    [['erase', 'erase'], ['blur', 'blur'], ['color', 'fill']].forEach(function(o){ var op = el('option', { value: o[0], text: T_(o[1]) }); if(r.kind === o[0]) op.selected = true; ksel.appendChild(op); });
    ksel.onchange = function(){ r.kind = ksel.value; renderRegions(); };
    var head = el('div', { 'class': 'ved-row' }, [el('b', { 'class': 'ved-rt', text: T_('region', { n: i + 1 }) }), ksel]);
    var kids = [head];
    if(r.kind === 'color'){
      var list = ['#000000', '#ffffff', '#101013'];
      if(list.indexOf(r.color) < 0) list.unshift(r.color);
      kids.push(el('div', { 'class': 'ved-row', style: 'margin-top:6px' }, [swatches(list, r.color, function(c){ r.color = c; redraw(); }),
        btn(T_('bgColor'), function(){ var s = sampleBg(r); if(s){ r.color = s; renderRegions(); } }, 'ved-mini')]));
    }
    kids.push(timeRow(r, renderRegions, [
      btn(T_('writeHere'), function(){ writeHere(r); }, 'ved-mini'),
      btn(T_('del'), function(){ st.regions = st.regions.filter(function(x){ return x !== r; }); if(isSel('r', r)) st.sel = null; renderRegions(); }, 'ved-mini')]));
    var c = el('div', { 'class': 'ved-item', 'data-rid': String(r.id) }, kids);
    c.addEventListener('pointerdown', function(){ if(!isSel('r', r)) select('r', r, true); });
    return c;
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
  /* v-video-voice-speed: تنظيف «...» والفواصل الزائدة من app-11-video.js (window.__vmkVoice)؛ لو غاب النصّ كما هو */
  function vvClean(t){ try{ var V = window.__vmkVoice; return (V && V.clean) ? V.clean(t) : t; }catch(e){ sw(e, 'ved:vvClean'); return t; } }
  async function makeTts(){
    var text = K('ttsText').value.trim(); if(!text || st.busy) return;
    K('ttsMake').disabled = true; setStatus(T_('ttsBusy'));
    try{
      var r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: 'maha', gender: K('ttsGender').value, lang: isRtl(text) ? 'ar' : 'en', text: vvClean(text).slice(0, 4000), speed: K('ttsSpeed').value || 'fast', token: tok(), guestId: gid() }) });
      if(!r.ok){ var j = null; try{ j = await r.json(); }catch(e){ j = null; } throw new Error((j && j.error) || ('tts ' + r.status)); }
      var b = await r.blob();
      if(!b || b.size < 200) throw new Error('tts empty');
      st.ttsBlob = b; setPrev(b); setStatus('');
    }catch(e){ setStatus(T_('fail', { e: (e && e.message) || e })); }
    finally{ K('ttsMake').disabled = false; }
  }

  function setBar(p){ var b = K('bar'); b.hidden = p == null; b.querySelector('i').style.width = Math.max(0, Math.min(100, p || 0)) + '%'; }
  function busyUI(on){
    st.busy = on; K('exp').disabled = on; K('cancel').hidden = !on; K('auto').disabled = on; K('change').disabled = on; K('regAdd').disabled = on;
    if(on) setDrawMode(false);
    if(!on) ffOnLog = null;
  }
  function cancel(){ if(!st.busy) return; killFF(); busyUI(false); setBar(null); setStatus(T_('canceled')); }

  async function doExport(){
    if(st.busy || !st.file) return;
    var texts = st.items.filter(function(it){ return String(it.text || '').trim() && it.b > it.a && it.a < limitT(); });
    var regs = st.regions.filter(function(r){ return r.b > r.a && r.a < limitT(); });
    var aBlob = st.aSrc === 'file' ? st.aFile : st.aSrc === 'tts' ? st.ttsBlob : null;
    if(st.aSrc !== 'none' && !aBlob){ setStatus(T_('needAudio')); return; }
    if(!texts.length && !regs.length && !aBlob && !st.mute){ setStatus(T_('nothing')); return; }
    K('result').hidden = true; busyUI(true); setBar(0); setStatus(T_('loading'));
    try{
      var f = await ensureInput();
      if(!st.busy) return;
      var P = st.probe, d = outDims(st.vw || P.w, st.vh || P.h, st.hq), Tm = limitT();
      var used = {}; texts.forEach(function(it){ used[it.font || 'default'] = 1; });
      await Promise.all(Object.keys(used).map(loadFont));
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
      var rpx = regs.map(function(r){ var q = regionPx(r, d.w, d.h); return { x: q.x, y: q.y, w: q.w, h: q.h, a: r.a, b: Math.min(r.b, Tm), kind: r.kind, color: r.color }; });
      var A = null;
      if(aBlob){
        var an = 'add.' + extOf(aBlob.name, aBlob.type, 'mp3');
        await f.writeFile(an, await u8(aBlob));
        A = { name: an, mode: P.hasAudio ? st.aMode : 'replace', loop: st.loop, vol: st.vol, origVol: st.origVol };
      }
      var vc = P.vcodec;
      var args = buildArgs({ inName: st.inName, dur: st.dur || P.dur, W: d.w, H: d.h, fps: P.fps, regions: rpx, overlays: ovs, audio: A,
        hasAudio: P.hasAudio, mute: st.mute && !A, copyVideo: !ovs.length && !rpx.length && (vc === 'h264' || vc === 'hevc'), vcodec: vc, hq: st.hq, out: 'out.mp4' });
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
      if(navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'om ai' });
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
    window.omranVideoEdit = { open: open, reset: reset };
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
