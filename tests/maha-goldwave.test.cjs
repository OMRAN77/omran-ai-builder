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
  return { style: { cssText: '' }, children: [], isConnected: true, clientWidth: 200, clientHeight: 161,
    appendChild(c) { this.children.push(c); } };
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
  const ctx = {
    document: { getElementById: (id) => (id === 'mahaGoldWave' ? host : null), createElement: () => el() },
    window: { matchMedia: () => ({ matches: !!o.reduce }), AudioContext: FakeCtx },
    requestAnimationFrame: (f) => { queue.push(f); return queue.length; },
    cancelAnimationFrame: () => { queue.length = 0; },
    __swallow() {},
    Uint8Array, Float32Array, Math, Promise,
  };
  vm.runInNewContext(SRC, ctx);
  const tick = (t) => { const fs2 = queue.splice(0); fs2.forEach((f) => f(t)); };
  return { host, api: ctx.window.mahaGoldWave, tick, queue, audioNodes };
}
const posX = (s) => parseFloat(String(s.style.backgroundPosition).split('px')[0]);

test('١. الشرائح: ٤٠ شريحة من الصورة المعكوسة المتكرّرة، والخلفيّة الثابتة للإطار الأوّل تُزال', () => {
  const { host, api } = load();
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
  assert.equal(host.children[0].style.backgroundSize, '400px 161px', 'البلاطة (الصورة + المعكوسة) ضعف العرض');
  host.style.display = 'none';
  tick(2016);
  assert.equal(queue.length, 0, 'مخفيّة = تتوقّف الحلقة (لا بطّاريّة مهدرة)');
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
  assert.match(html, /<div id="mahaGoldWave" aria-hidden="true" style="display:none; position:relative; width:200px; max-width:70vw; aspect-ratio:1534\/1235;[^"]*url\('\/assets\/maha\/maha-wave-tile\.webp'\) 0 0 \/ 200% 100% no-repeat;"><\/div>/);
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
