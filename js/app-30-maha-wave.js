/* v-maha-goldwave (طلب المالك ٢٢ سبتمبر، بعد خمسة نماذج راجعها بنفسه): «حطها في التطبيق» — صورة الموجة الذهبية
   نفسها مكان دائرة مها في نافذة المكالمة. تمشي باستمرار مثل شريط الأسهم (٣٦ بكسل/ث من اليمين لليسار — سرعة
   #stockTickerTrack نفسها)، والصورة موصولة بنسختها المعكوسة فلا يبان لها طرف. ومع صوت مها يتنفّس شريطها بخفّة
   (سماكة حول خطّه وانسياب صغير) — بلا وميض ولا قفز، وطلبها «بلا كانفا»: شرائح عموديّة تعرض مقطعها من الصورة.
   مصدر الصوت: المكالمة المباشرة من مجرى صوتها نفسه (طيف ترددات، الغليظ في الوسط والحادّ نحو الأطراف)،
   والوضع الأساسيّ من نسخة مفكوكة من مقطع النطق نفسه متزامنة مع وقت تشغيله — عنصر الصوت الذي يُسمع لا يُمسّ.
   v-maha-band (أمر المالك بعد اللقطات: «من أوّل الشريط لنهايته مش في المنتصف — نفس شريط الأسهم»): العنصر صار شريطًا
   بعرض الشاشة. في الشريط العريض تُعرض الصورة بارتفاعها الطبيعيّ مقصوصةً على نصفها الأوسط حول خطّ الموجة، وتتكرّر
   (الصورة + المعكوسة) على العرض كلّه؛ وعدد الشرائح يتبع العرض (شريحة لكلّ ~١٠ بكسل) فلا تظهر درجات. */
(function(){
  const host = document.getElementById('mahaGoldWave');
  if(!host) return;
  const TILE = '/assets/maha/maha-wave-tile.webp';
  const SPEED = 36, BANDS = 24, RATE = 60;
  const VIS = 0.5, CY = 0.46, ASPECT = 1534 / 1235; // الشريط يعرض نصف ارتفاع الصورة حول خطّ الموجة (٤٦٪)
  let reduce = false;
  try{ reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ __swallow(e, 'maha:goldwave-rm'); }

  // الشرائح تُبنى عند أوّل إطار ظاهر بعدد يتبع العرض، وتُعاد إن تغيّر العرض كثيرًا (تدوير الجوّال)
  const strips = [];
  let N = 0, en = [], tmp = [];
  function build(n){
    while(strips.length){ host.removeChild(strips.pop()); }
    N = n; en = new Array(N).fill(0); tmp = new Array(N).fill(0);
    for(let i = 0; i < N; i++){
      const s = document.createElement('div');
      s.style.cssText = 'position:absolute; top:0; height:100%; left:' + (i * 100 / N) + '%; width:calc(' + (100 / N) + '% + 1px); background-image:url(' + TILE + '); background-repeat:repeat-x; transform-origin:50% 50%; will-change:transform;';
      host.appendChild(s);
      strips.push(s);
    }
    host.style.backgroundImage = 'none'; // الخلفيّة الثابتة للإطار الأوّل فقط؛ الشرائح تتولّى الصورة بعدها
    lastW = 0; lastH = 0; still = true;
  }
  const bands = new Array(BANDS).fill(0);
  const PROFILE = []; // الوضع الأساسيّ بلا طيف: شكل ثابت الغليظ فيه أقوى، يضربه مستوى الصوت
  for(let b = 0; b < BANDS; b++) PROFILE.push(1 - 0.65 * b / (BANDS - 1));

  let raf = 0, last = 0, scroll = 0, phase = 0, level = 0, still = true, lastW = 0, lastH = 0;
  let ctx = null, an = null, srcNode = null, freq = null, wave = null, edges = null;
  let tracked = null, env = null;

  function ensureCtx(){
    try{
      if(!ctx){
        const C = window.AudioContext || window.webkitAudioContext;
        if(!C) return null;
        ctx = new C();
      }
      if(ctx.state === 'suspended'){ const p = ctx.resume(); if(p && p.catch) p.catch(e => __swallow(e, 'maha:goldwave-resume')); }
    }catch(e){ __swallow(e, 'maha:goldwave-ctx'); return null; }
    return ctx;
  }

  // حدود الأشرطة لوغاريتميّة بين ٩٠ و٥٠٠٠ هرتز — مجال الكلام
  function bandEdges(sampleRate, bins){
    const out = [], nyq = sampleRate / 2;
    for(let b = 0; b <= BANDS; b++){
      const bin = Math.round(90 * Math.pow(5000 / 90, b / BANDS) / nyq * bins);
      out.push(Math.max(b ? out[b - 1] + 1 : 1, bin));
    }
    return out;
  }

  // المكالمة المباشرة: المحلّل على مجرى صوت مها — لا يوصل بالسمّاعة (الصوت يُسمع من عنصره كما كان)
  function attachStream(stream){
    detachStream();
    const c = ensureCtx();
    if(!c || !stream) return;
    try{
      an = c.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.5;
      an.minDecibels = -85;
      an.maxDecibels = -22;
      srcNode = c.createMediaStreamSource(stream);
      srcNode.connect(an);
      freq = new Uint8Array(an.frequencyBinCount);
      wave = new Uint8Array(an.fftSize);
      edges = bandEdges(c.sampleRate, freq.length);
    }catch(e){ __swallow(e, 'maha:goldwave-stream'); an = null; srcNode = null; }
  }
  function detachStream(){
    if(srcNode){ try{ srcNode.disconnect(); }catch(e){ __swallow(e, 'maha:goldwave-detach'); } }
    srcNode = null; an = null;
  }

  // الوضع الأساسيّ: غلاف مستوى الصوت (٦٠ في الثانية) من نسخة مفكوكة من المقطع نفسه، يُقرأ بوقت تشغيله
  function trackAudio(audio, blob){
    tracked = audio; env = null;
    const c = ensureCtx();
    if(!c || !blob || !blob.arrayBuffer) return;
    blob.arrayBuffer()
      .then(ab => new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if(p && p.then) p.then(res, rej); }))
      .then(buf => {
        if(tracked !== audio) return;
        const ch = buf.getChannelData(0), win = Math.max(1, Math.round(buf.sampleRate / RATE));
        const out = new Float32Array(Math.ceil(ch.length / win));
        for(let w = 0; w < out.length; w++){
          const a = w * win, z = Math.min(ch.length, a + win);
          let s = 0;
          for(let i = a; i < z; i++) s += ch[i] * ch[i];
          out[w] = Math.sqrt(s / Math.max(1, z - a));
        }
        env = out;
      })
      .catch(e => __swallow(e, 'maha:goldwave-decode'));
  }

  const norm = (rms) => Math.pow(Math.max(0, Math.min(1, (rms - 0.012) / 0.2)), 0.75);

  function sample(){
    let target = 0;
    if(an){
      an.getByteTimeDomainData(wave);
      let sum = 0;
      for(let i = 0; i < wave.length; i++){ const v = (wave[i] - 128) / 128; sum += v * v; }
      target = norm(Math.sqrt(sum / wave.length));
      an.getByteFrequencyData(freq);
      for(let b = 0; b < BANDS; b++){
        let s = 0, c = 0;
        for(let j = edges[b]; j < edges[b + 1] && j < freq.length; j++){ s += freq[j]; c++; }
        const bt = Math.pow(Math.max(0, (c ? s / c / 255 : 0) - 0.12) / 0.88, 1.25);
        bands[b] += (bt - bands[b]) * (bt > bands[b] ? 0.35 : 0.18);
      }
    }else{
      if(tracked && env && !tracked.paused && !tracked.ended){
        const i = Math.floor((tracked.currentTime || 0) * RATE);
        if(i >= 0 && i < env.length) target = norm(env[i]);
      }
      for(let b = 0; b < BANDS; b++){
        const bt = target * PROFILE[b];
        bands[b] += (bt - bands[b]) * (bt > bands[b] ? 0.35 : 0.18);
      }
    }
    level += (target - level) * (target > level ? 0.35 : 0.18);
    if(level < 0.002 && target === 0) level = 0;
  }

  function render(){
    const W = host.clientWidth, h = host.clientHeight;
    if(!W || !h) return;
    const want = Math.min(160, Math.max(40, Math.round(W / 10)));
    if(want !== N) build(want);
    const band = W > h * 2;
    const imgH = band ? h / VIS : h, imgW = band ? imgH * ASPECT : W;
    const tileW = 2 * imgW, posY = band ? -(CY * imgH - h / 2) : 0;
    if(W !== lastW || h !== lastH){
      for(let z = 0; z < N; z++) strips[z].style.backgroundSize = tileW.toFixed(2) + 'px ' + imgH.toFixed(2) + 'px';
      lastW = W; lastH = h;
    }
    const off = scroll % tileW;
    for(let q = 0; q < N; q++) strips[q].style.backgroundPosition = (-(q * W / N + off)).toFixed(2) + 'px ' + posY.toFixed(2) + 'px';
    if(level < 0.002){
      if(!still){ for(let j = 0; j < N; j++) strips[j].style.transform = ''; still = true; }
      return;
    }
    still = false;
    const lastB = BANDS - 1;
    for(let k = 0; k < N; k++){
      const d = Math.abs(k / (N - 1) - 0.5) * 2;
      const p = d * lastB, b0 = Math.floor(p), f = p - b0;
      en[k] = bands[b0] * (1 - f) + bands[Math.min(lastB, b0 + 1)] * f;
    }
    for(let pass = 0; pass < 2; pass++){
      for(let m = 0; m < N; m++) tmp[m] = (en[Math.max(0, m - 1)] + 2 * en[m] + en[Math.min(N - 1, m + 1)]) / 4;
      for(let m = 0; m < N; m++) en[m] = tmp[m];
    }
    for(let k = 0; k < N; k++){
      const e = en[k];
      const x = Math.sin((k / N) * Math.PI * 4 - phase * 2) * h * 0.004 * e;
      const y = Math.sin((k / N) * Math.PI * 3 + phase) * h * 0.005 * e;
      strips[k].style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) scaleY(' + (1 + 0.14 * e).toFixed(4) + ')';
    }
  }

  function frame(t){
    raf = 0;
    if(host.style.display === 'none' || !host.isConnected) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    sample();
    scroll += dt * SPEED;
    phase += dt * 0.6;
    render();
    raf = requestAnimationFrame(frame);
  }

  function start(){ if(!reduce && !raf){ last = 0; raf = requestAnimationFrame(frame); } }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }
  function end(){
    stop();
    detachStream();
    tracked = null; env = null; level = 0;
    bands.fill(0);
    for(let j = 0; j < strips.length; j++) strips[j].style.transform = '';
    still = true;
  }

  window.mahaGoldWave = { prime: ensureCtx, start, stop, end, attachStream, detachStream, trackAudio };
})();
