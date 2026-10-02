'use strict';
/* v-tts-sync (المالك ٢ أكتوبر «الكتابة ما تتبع الصوت، تتأخّر — أريد تطابق الاثنين»): أزمنة التظليل من الصوت نفسه
   (صمت البداية ووقفات الكلام)، ووزن الرقم أطول، والحلقة لا تموت إن بدأت قبل التشغيل. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-02-tts.js'), 'utf8');
const fnSrc = src.slice(src.indexOf('function ttsWordWeight(w){'), src.indexOf('async function speakSmart('));

function ctxWith(samples, sr) {
  const ctx = {
    window: { AudioContext: function () { this.decodeAudioData = (ab, ok) => { const b = { sampleRate: sr, getChannelData: () => samples }; ok(b); return Promise.resolve(b); }; } },
    fetch: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }),
    Promise, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc + '\nthis.voiced = ttsVoicedStarts; this.weight = ttsWordWeight; this.wstarts = ttsWeightStarts;', ctx);
  return ctx;
}
// مقطع ١٫٤ث: صمت ٠٫٥ث، كلمة ٠٫٣ث، وقفة ٠٫٣ث، كلمة ٠٫٣ث
function clip(sr) {
  const a = new Float32Array(Math.round(1.4 * sr));
  const on = (t0, t1) => { for (let i = Math.round(t0 * sr); i < Math.round(t1 * sr); i++) a[i] = (i % 2 ? 0.4 : -0.4); };
  on(0.5, 0.8); on(1.1, 1.4);
  return a;
}
const el = (t) => ({ textContent: t });

test('١. الكلمة تبدأ مع صوتها لا مع أوّل الملفّ، والثانية بعد الوقفة لا في منتصف المدّة', async () => {
  const sr = 8000;
  const c = ctxWith(clip(sr), sr);
  const st = await c.voiced('blob:x', [el('مرحبا'), el('سلامة')]);
  assert.ok(Math.abs(st[0] - 0.5) < 0.02, 'الأولى عند ٠٫٥ث: ' + st[0]);
  assert.ok(Math.abs(st[1] - 1.1) < 0.02, 'الثانية عند ١٫١ث بعد الوقفة: ' + st[1]);
  const old = c.wstarts([el('مرحبا'), el('سلامة')], 0, 1.4);
  assert.ok(old[0] === 0 && Math.abs(old[1] - 0.7) < 0.05, 'التقدير القديم كان ٠ و٠٫٧ — متأخّر نصف ثانية ثمّ متقدّم');
});

test('٢. الوزن: التشكيل لا يُحسب، والرقم أطول نطقًا، والحدّ الأدنى ١', () => {
  const c = ctxWith(new Float32Array(10), 8000);
  assert.equal(c.weight('مُوَاطِنٌ'), c.weight('مواطن'));
  assert.ok(c.weight('1.8') > c.weight('هذا'), 'الرقم أطول');
  assert.equal(c.weight('—'), 1);
});

test('٣. صوت صامت تمامًا = لا أزمنة (يبقى التقدير)، والحلقة تُسلَّح مع «playing» ولا تموت قبل التشغيل', async () => {
  const c = ctxWith(new Float32Array(8000), 8000);
  assert.equal(await c.voiced('blob:x', [el('أ')]), null);
  assert.ok(src.includes("audio.addEventListener('playing', arm);"));
  assert.ok(src.includes('if(!audio.paused) ttsHighlightRaf = requestAnimationFrame(tick);'));
  assert.ok(!src.includes('if(currentCloudToken !== token || !currentCloudAudio || audio.paused || audio.ended) return;'), 'الشرط القديم الذي يقتل الحلقة قبل التشغيل حُذف');
  assert.ok(fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8').includes('async function ttsVoicedStarts(url, els){'), 'الحزمة');
});
