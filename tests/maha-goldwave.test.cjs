'use strict';
/* v-maha-goldwave (طلب المالك ٢٢ سبتمبر بعد خمسة نماذج: «حطها في التطبيق»): صورة الموجة الذهبيّة نفسها مكان دائرة
   مها في نافذة المكالمة — تمشي مثل شريط الأسهم (٣٦ بكسل/ث من اليمين لليسار، موصولة بنسختها المعكوسة)، ويتنفّس
   شريطها بخفّة مع صوتها، بلا وميض ولا قفز ولا canvas. المكالمة المباشرة من مجرى صوتها، والأساسيّ من نسخة مفكوكة
   من مقطع النطق متزامنة مع وقت تشغيله — عنصر الصوت الذي يُسمع لا يُمسّ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-30-maha-wave.js');

function el() {
  return { style: { cssText: '', setProperty(k, v) { this[k] = v; } }, children: [], attrs: {}, isConnected: true, clientWidth: 200, clientHeight: 161,
    appendChild(c) { this.children.push(c); }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); },
    setAttribute(k, v) { this.attrs[k] = v; } };
}
// بيئة صفحة مصغّرة: rAF يُدار يدويًّا بزمن نحدّده
function load(opts) {
  const o = opts || {};
  const host = el();
  host.style.display = 'none';
  const queue = [];
  const audioNodes = [];
  function FakeCtx() {
    this.state = 'running'; this.sampleRate = 48000;
    this.createAnalyser = () => {
      const a = { fftSize: 0, frequencyBinCount: 512, connected: [],
        getByteTimeDomainData(arr) { for (let i = 0; i < arr.length; i++) arr[i] = 128 + (i % 2 ? 60 : -60); },
        getByteFrequencyData(arr) { for (let i = 0; i < arr.length; i++) arr[i] = i < 60 ? 230 : 40; } };
      audioNodes.push(a); return a;
    };
    this.createMediaStreamSource = (s) => { const n = { stream: s, to: [], connect(x) { this.to.push(x); }, disconnect() { this.to = []; this.disconnected = true; } }; audioNodes.push(n); return n; };
    this.decodeAudioData = (ab, ok) => {
      // ثانية واحدة: نصفها الأوّل صامت والثاني كلام عالٍ
      const sr = 6000, ch = new Float32Array(sr);
      for (let i = sr / 2; i < sr; i++) ch[i] = (i % 2 ? 0.5 : -0.5);
      const buf = { sampleRate: sr, getChannelData: () => ch };
      if (ok) ok(buf);
      return Promise.resolve(buf);
    };
    this.resume = () => Promise.resolve();
  }
  const body = el();
  const ctx = {
    document: { body, getElementById: (id) => (id === 'mahaGoldWave' ? host : null), createElement: () => el() },
    window: { matchMedia: () => ({ matches: !!o.reduce }), AudioContext: FakeCtx, innerWidth: o.w || 1280, innerHeight: o.h || 900 },
    requestAnimationFrame: (f) => { queue.push(f); return queue.length; },
    cancelAnimationFrame: () => { queue.length = 0; },
    __swallow() {},
    Uint8Array, Float32Array, Math, Promise,
  };
  vm.runInNewContext(SRC, ctx);
  const tick = (t) => { const fs2 = queue.splice(0); fs2.forEach((f) => f(t)); };
  return { host, body, api: ctx.window.mahaGoldWave, tick, queue, audioNodes };
}
const posX = (s) => parseFloat(String(s.style.backgroundPosition).split('px')[0]);

test('١. الشرائح: تُبنى عند أوّل إطار ظاهر (٤٠ على الأقلّ) من الصورة المعكوسة المتكرّرة، والخلفيّة الثابتة تُزال', () => {
  const { host, api, tick } = load();
  assert.equal(host.children.length, 0, 'لا شيء قبل الظهور');
  host.style.display = 'block';
  api.start();
  tick(0);
  assert.equal(host.children.length, 40);
  assert.match(host.children[0].style.cssText, /background-image:url\(\/assets\/maha\/maha-wave-tile\.webp\); background-repeat:repeat-x;/);
  assert.equal(host.style.backgroundImage, 'none');
  for (const k of ['prime', 'start', 'stop', 'end', 'attachStream', 'detachStream', 'trackAudio']) assert.equal(typeof api[k], 'function', k);
  assert.ok(fs.existsSync(path.join(root, 'assets/maha/maha-wave-tile.webp')), 'الصورة موجودة');
});

test('٢. تمشي مثل شريط الأسهم: ٣٦ بكسل في الثانية نحو اليسار حتّى في السكوت، بلا أيّ تحويل', () => {
  const { host, api, tick, queue } = load();
  host.style.display = 'block';
  api.start();
  tick(1000); // الإطار الأوّل
  const a = posX(host.children[10]);
  for (let t = 1016; t <= 2000; t += 16) tick(t);
  const moved = a - posX(host.children[10]);
  assert.ok(Math.abs(moved - 36) < 2, 'تحرّك ' + moved.toFixed(2) + ' بكسل في ثانية');
  assert.ok(host.children.every((s) => !s.style.transform), 'السكوت = الصورة كما هي، بلا تحويل');
  assert.equal(host.children[0].style.backgroundSize, '400.00px 161.00px', 'بطاقة ضيّقة: البلاطة (الصورة + المعكوسة) ضعف العرض');
  host.style.display = 'none';
  tick(2016);
  assert.equal(queue.length, 0, 'مخفيّة = تتوقّف الحلقة (لا بطّاريّة مهدرة)');
});

test('٢-ب. الشريط بعرض الشاشة (v-maha-band): شريحة لكلّ ~١٠ بكسل، والصورة بارتفاعها الطبيعيّ مقصوصة حول خطّ الموجة ومتكرّرة', () => {
  const { host, api, tick } = load();
  host.clientWidth = 1280; host.clientHeight = 150;
  host.style.display = 'block';
  api.start();
  tick(0);
  assert.equal(host.children.length, 128);
  const [bw, bh] = host.children[0].style.backgroundSize.split(' ').map(parseFloat);
  assert.equal(bh, 300, 'نصف ارتفاع الصورة ظاهر (الارتفاع ضعف الشريط)');
  assert.ok(Math.abs(bw - 2 * 300 * 1534 / 1235) < 0.01, 'البلاطة صورتان بنسبتهما الطبيعيّة: ' + bw);
  const y = parseFloat(host.children[0].style.backgroundPosition.split(' ')[1]);
  assert.equal(y, -(0.46 * 300 - 75), 'خطّ الموجة (٤٦٪) في منتصف الشريط');
  assert.ok(bw < 1280, 'البلاطة أقصر من الشاشة = تتكرّر من أوّل الشريط لنهايته');
  host.clientWidth = 390; host.clientHeight = 120;
  tick(16);
  assert.equal(host.children.length, 40, 'الجوّال: تُعاد الشرائح بعدد يناسب العرض');
});

test('٣. الوضع الأساسيّ: الموجة تتبع مستوى مقطع النطق بوقت تشغيله — صامت ثمّ كلام — وعنصر الصوت لا يُمسّ', async () => {
  const { host, api, tick } = load();
  host.style.display = 'block';
  const audio = { paused: false, ended: false, currentTime: 0.1 };
  api.trackAudio(audio, { arrayBuffer: async () => new ArrayBuffer(8) });
  await new Promise((r) => setImmediate(r));
  api.start();
  for (let t = 0; t <= 400; t += 16) tick(t);
  assert.ok(host.children.every((s) => !s.style.transform), 'النصف الصامت: بلا حركة');
  audio.currentTime = 0.7;
  for (let t = 416; t <= 800; t += 16) tick(t);
  const tr = host.children[20].style.transform;
  assert.match(tr, /^translate\(-?[\d.]+px,-?[\d.]+px\) scaleY\(1\.\d+\)$/, 'الكلام: تنفّس خفيف');
  const sy = parseFloat(tr.split('scaleY(')[1]);
  assert.ok(sy > 1.02 && sy <= 1.14, 'خفيف بلا قفز: ' + sy);
  assert.deepEqual(Object.keys(audio).sort(), ['currentTime', 'ended', 'paused'], 'لا خاصّيّة جديدة على عنصر الصوت');
  audio.paused = true;
  for (let t = 816; t <= 2400; t += 16) tick(t);
  assert.ok(host.children.every((s) => !s.style.transform), 'انتهى الكلام = رجعت كما هي');
});

test('٤. المكالمة المباشرة: المحلّل على مجرى صوتها بلا توصيل بالسمّاعة، والإنهاء يفكّه ويصفّر', () => {
  const { host, api, tick, audioNodes, queue } = load();
  host.style.display = 'block';
  const stream = { id: 'remote' };
  api.attachStream(stream);
  const srcNode = audioNodes.find((n) => n.stream === stream);
  assert.ok(srcNode, 'مصدر من المجرى');
  assert.equal(srcNode.to.length, 1, 'يوصل بالمحلّل وحده');
  assert.ok(srcNode.to[0].getByteFrequencyData, 'والموصول محلّل لا سمّاعة');
  api.start();
  for (let t = 0; t <= 600; t += 16) tick(t);
  assert.ok(host.children.some((s) => s.style.transform), 'صوتها يحرّك الشريط');
  api.end();
  assert.ok(srcNode.disconnected, 'فُكّ المجرى');
  assert.equal(queue.length, 0, 'توقّفت الحلقة');
  assert.ok(host.children.every((s) => !s.style.transform), 'رجعت كما هي');
});

test('٥. تقليل الحركة من الجهاز: الصورة ثابتة كما هي بلا شرائح ولا حلقة', () => {
  const { host, api, queue } = load({ reduce: true });
  assert.equal(host.children.length, 0);
  assert.notEqual(host.style.backgroundImage, 'none', 'الخلفيّة الثابتة تبقى');
  host.style.display = 'block';
  api.start();
  assert.equal(queue.length, 0);
});

test('٦. الربط في مها: مكان الدائرة في مكالمتها لا في البنّاء، والصوت من مصدريه، والإنهاء، والحزمة', () => {
  const html = read('index.html');
  assert.match(html, /<div id="mahaGoldWave" aria-hidden="true" style="display:none; position:relative; width:100vw; max-width:none; height:clamp\(110px, 18vh, 170px\);[^"]*url\('\/assets\/maha\/maha-wave-tile\.webp'\) 0 46% \/ auto 200% repeat-x;"><\/div>/);
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("if(mahaOrbEl) mahaOrbEl.style.display = (show && !mahaGoldWaveEl) ? 'flex' : 'none';"), f + ': الدائرة مخفيّة ما دامت الموجة');
    assert.equal((s.match(/mahaAvatarDisplay\(mahaCallMode !== 'builder'\);/g) || []).length, 2, f + ': موضعا بداية المكالمة');
    assert.ok(s.includes("if(mahaWaveEl) mahaWaveEl.style.display = mahaCallMode === 'builder' ? 'flex' : 'none';"), f + ': البنّاء كما كان');
    assert.equal((s.match(/if\(mahaGoldWaveEl\) mahaAvatarDisplay\(false\); \/\/ v-maha-goldwave/g) || []).length, 2, f + ': الصورة المعروضة تخفي الموجة');
    assert.ok(s.includes("window.mahaGoldWave.prime(); }catch(e){ __swallow(e, 'maha:goldwave-prime'); }"), f + ': السياق داخل الضغطة');
    const speak = s.slice(s.indexOf('async function mahaSpeak('), s.indexOf('async function mahaRecordUntilSilence('));
    assert.ok(speak.indexOf('window.mahaGoldWave.trackAudio(audio, blob)') > speak.indexOf('audio.src = url;') && speak.indexOf('window.mahaGoldWave.trackAudio(audio, blob)') < speak.indexOf('await audio.play();'), f + ': الأساسيّ يتبع المقطع');
    assert.ok(s.includes("mahaRtAudioEl.srcObject = e.streams[0];\n    try{ if(window.mahaGoldWave) window.mahaGoldWave.attachStream(e.streams[0]);"), f + ': المباشرة من مجراها');
    assert.ok(s.includes("window.mahaGoldWave.detachStream(); }catch(e){ __swallow(e, 'maha:goldwave-rt-end'); }"), f + ': فكّ المجرى عند إنهاء المباشرة');
    assert.ok(s.includes("window.mahaGoldWave.end(); }catch(e){ __swallow(e, 'maha:goldwave-end'); }"), f + ': إنهاء المكالمة');
  }
  assert.ok(read('js/app.bundle.js').includes(SRC), 'الجزء في الحزمة كما هو');
  assert.ok(!/getContext\(|<canvas/.test(SRC), 'بلا canvas');
  assert.ok(!/brightness|glow|box-shadow|opacity/.test(SRC), 'بلا وميض ولا توهّج');
});

test('٧. الشريط في مكالمة مها: بعرض الشاشة، الكاميرا فوق، بلا اسم ولا ✕، ولا سحب — والبنّاء كما كان', () => {
  const css = read('css/modules.css');
  assert.ok(css.includes('#mahaCallScreen.maha-goldband{left:0 !important; right:0 !important; top:50% !important; bottom:auto !important; width:100vw !important; transform:translateY(-50%); gap:8px !important;}'));
  assert.ok(css.includes('#mahaCallScreen.maha-goldband #mahaCallNameLabel,#mahaCallScreen.maha-goldband #btnMahaEndCall{display:none !important;}'), 'بلا اسم ولا ✕');
  assert.ok(css.includes('#mahaCallScreen.maha-goldband #mahaCallBtns{order:-1;}'), 'الكاميرا فوق');
  assert.ok(css.includes('#inputbar.maha-calling{visibility:hidden;}') && css.includes('#inputbar.maha-calling #btnMahaDock{visibility:visible;}'), '«م» ظاهر وحده');
  assert.ok(css.includes('body.maha-band-on #sidebar, body.maha-band-on #workarea{z-index:100000;}'), 'الجانبيّ والمعاينة/الكود فوق الشريط (نافذة المكالمة 99999)');
  assert.ok(/id="mahaCallScreen" style="[^"]*z-index:99999;/.test(read('index.html')), 'نافذة المكالمة تحتهما مباشرةً');
  const html = read('index.html');
  assert.ok(html.includes('<div id="mahaCallBtns" style="display:flex; align-items:center; gap:13px;">') && html.includes('<div id="mahaAvatarBox"'));
  assert.ok(html.includes('css/modules.css?v=662'), 'وسم الكاش رُفع');
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s2 = read(f);
    assert.ok(s2.includes("if(mahaCallScreenEl) mahaCallScreenEl.classList.toggle('maha-goldband', mahaCallMode !== 'builder'); // v-maha-band") && s2.includes("  if(mahaCallMode !== 'builder') mahaStartCloseWatch();"), f + ': للمكالمة لا للبنّاء');
    assert.ok(s2.includes("if(panel.classList.contains('maha-goldband')) return; // v-maha-band"), f + ': لا سحب');
    assert.ok(s2.includes("mahaStopCloseWatch(); // v-maha-band\n  if(mahaCallScreenEl) mahaCallScreenEl.classList.remove('maha-goldband');"), f + ': الإنهاء ينظّف');
    assert.ok(s2.includes("document.body.classList.toggle('maha-band-on', mahaCallMode !== 'builder');") && s2.includes("document.body.classList.remove('maha-band-on'); // v-maha-band-under"), f + ': فئة الجسم تُضاف وتُزال');
    assert.ok(s2.includes("if(btnMahaDockEl) btnMahaDockEl.onclick = () => { if(mahaCallActive && mahaCallMode !== 'builder'){ mahaEndCall(); return; } mahaUnlockAudio(); mahaStartCall(); };"), f + ': «م» ثانيةً يُنهي');
  }
});

// مراقبة الإغلاق تُشغَّل معزولة بساعة يدويّة
function closeWatch() {
  const src = read('js/app-08-maha.js');
  const chunk = src.slice(src.indexOf('const MAHA_SILENCE_END_MS = 20000;'), src.indexOf('function mahaEndCall(){'));
  const listeners = [];
  const timers = [];
  let now = 1000;
  const ctx = {
    mahaCallActive: true, mahaCallMode: 'assistant', mahaState: 'listening', mahaLastActivity: 0, ended: 0,
    Date: { now: () => now },
    document: { addEventListener: (t, f, c) => listeners.push({ t, f, c }), removeEventListener: (t, f) => { const i = listeners.findIndex((l) => l.f === f); if (i >= 0) listeners.splice(i, 1); } },
    setTimeout: (f) => { timers.push({ f, once: true }); return timers.length; },
    clearTimeout: () => {}, clearInterval: () => { timers.length = 0; },
    setInterval: (f) => { timers.push({ f, once: false }); return timers.length; },
  };
  vm.runInNewContext(chunk + '\nfunction mahaEndCall(){ ended++; mahaCallActive = false; mahaStopCloseWatch(); }\nthis.start = mahaStartCloseWatch; this.stop = mahaStopCloseWatch;', ctx);
  const runTimeouts = () => { for (const t of timers.filter((x) => x.once)) t.f(); };
  const advance = (ms) => { for (let i = 0; i < ms / 1000; i++) { now += 1000; for (const t of timers.filter((x) => !x.once)) t.f(); } };
  const tap = (sel) => { const ev = { target: { closest: (q) => (sel && q.split(', ').includes(sel) ? {} : null) }, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; listeners.slice().forEach((l) => l.f(ev)); return ev; };
  return { ctx, listeners, runTimeouts, advance, tap, setNow: (v) => { now = v; } };
}

test('٨. الإغلاق من أيّ مكان: الضغطة تُنهي المكالمة وتُستهلك، إلّا الكاميرا والصورة — ولا تُمسك ضغطة البدء نفسها', () => {
  const w = closeWatch();
  w.ctx.start();
  assert.equal(w.listeners.length, 0, 'التسجيل مؤجّل — ضغطة فتح المكالمة لا تُغلقها');
  w.runTimeouts();
  assert.equal(w.listeners.length, 1);
  assert.equal(w.listeners[0].c, true, 'في مرحلة الالتقاط: قبل أيّ معالج آخر');
  for (const sel of ['#btnMahaCamera', '#mahaCamPreview', '#mahaGenImage', '#mahaImageLightbox']) {
    const ev = w.tap(sel);
    assert.equal(w.ctx.ended, 0, sel + ' لا يُنهي');
    assert.equal(ev.prevented, false);
  }
  const ev = w.tap(null);
  assert.equal(w.ctx.ended, 1, 'ضغطة في أيّ مكان آخر = إنهاء');
  assert.ok(ev.prevented && ev.stopped, 'وتُستهلك فلا تفعل شيئًا آخر');
  assert.equal(w.listeners.length, 0, 'فُكّ المستمع');
});

test('٩. السكوت ٢٠ ثانية وهي تنتظر يُنهي المكالمة؛ والكلام أو ردّها يمدّد المهلة؛ والبنّاء لا يتأثّر', () => {
  let w = closeWatch();
  w.ctx.start();
  w.advance(19000);
  assert.equal(w.ctx.ended, 0, '١٩ ثانية لا تكفي');
  w.advance(2000);
  assert.equal(w.ctx.ended, 1, 'بعد ٢٠ ثانية سكوت: أُنهيت');

  w = closeWatch();
  w.ctx.start();
  w.advance(15000);
  w.ctx.mahaLastActivity = w.ctx.Date.now(); // تكلّم المستخدم أو ردّت مها
  w.advance(15000);
  assert.equal(w.ctx.ended, 0, 'النشاط يعيد العدّ');
  w.ctx.mahaState = 'thinking';
  w.advance(30000);
  assert.equal(w.ctx.ended, 0, 'وهي تفكّر أو تتكلّم لا يُحسب سكوتًا');

  w = closeWatch();
  w.ctx.mahaCallMode = 'builder';
  w.ctx.start();
  w.runTimeouts();
  w.advance(60000);
  w.tap(null);
  assert.equal(w.ctx.ended, 0, 'البنّاء الصوتيّ لا يُنهى بسكوت ولا بضغطة');
});

test('١٠. النشاط يُسجَّل من مصادره الثلاثة', () => {
  const src = read('js/app-08-maha.js');
  assert.ok(src.includes("  mahaState = state;\n  if(state !== 'listening') mahaLastActivity = Date.now();"), 'أيّ حالة غير الانتظار (تفكير · كلام مها)');
  assert.ok(src.includes('lastLoudAt = now; everLoud = true; mahaLastActivity = now; // v-maha-band'), 'كلام المستخدم في الوضع الأساسيّ');
  assert.ok(src.includes("if(ev.type === 'input_audio_buffer.speech_started'){\n        mahaLastActivity = Date.now(); // v-maha-band"), 'كلام المستخدم في المكالمة المباشرة');
  assert.ok(src.indexOf('let mahaLastActivity = 0;') < src.indexOf('function mahaSetState('), 'معرَّف قبل أوّل استعمال');
});

test('١١. نجوم الشاشة كلّها أثناء مكالمة مها: نجوم الجانبيّ نفسها بكثافتها، خلف الشريط، ونجوم الجانبيّ تبقى ظاهرة', () => {
  const { body } = load({ w: 1280, h: 900 });
  const sky = body.children.find((c) => c.id === 'mahaSkyLayer');
  assert.ok(sky, 'الطبقة في الجسم');
  assert.equal(sky.attrs['aria-hidden'], 'true');
  assert.equal(sky.children.length, 92, '١٢٨٠×٩٠٠ ÷ ١٢٥٠٠');
  const st = sky.children[0];
  assert.equal(st.className, 'omSkyStar', 'نجمة الجانبيّ نفسها');
  for (const k of ['--sz', '--dur', '--dly']) assert.ok(st.style[k], k);
  assert.equal(load({ w: 390, h: 800 }).body.children.find((c) => c.id === 'mahaSkyLayer').children.length, 30, 'الجوّال: ٣٠ على الأقلّ');
  const css = read('css/modules.css');
  assert.ok(css.includes('#mahaSkyLayer{position:fixed; inset:0; overflow:hidden; pointer-events:none; z-index:99998; display:none;}'), 'الشاشة كلّها، بلا ضغطات، تحت الشريط (99999)');
  assert.ok(css.includes('body.maha-band-on #mahaSkyLayer{display:block;}'), 'تظهر مع المكالمة وتختفي بعدها');
  assert.ok(css.includes('animation:omSkyTwinkle var(--dur) ease-in-out infinite var(--dly);'), 'وميض نجوم الجانبيّ نفسه');
  assert.ok(css.includes('body.maha-band-on #omSkyLayer{z-index:100001;}'), 'نجوم الجانبيّ فوق الجانبيّ المرفوع');
  assert.ok(css.includes('@media (prefers-reduced-motion:reduce){ #mahaSkyLayer{display:none !important;} }'));
  assert.ok(read('index.html').includes('@keyframes omSkyTwinkle{'), 'الحركة معرّفة في الصفحة');
});
