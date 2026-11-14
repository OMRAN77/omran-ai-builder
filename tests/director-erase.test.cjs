// tests/director-erase.test.cjs — v-director-erase (المالك ١١ نوفمبر: «تنضيف الفيديو قبل النشر يعني علي اسم ولا كتابه اي شي اقدر اشيلها»،
// ثمّ «شوف الارخص» و«ابد»): «امسح اسم أو كتابة» في مخرج التطبيق — مربّعات على لقطة من الفيديو المرفوع تُمسح من الفيديو كلّه قبل النشر:
// مجانًا في الجهاز (delogo في ترميز واحد) أو بالذكاء (شريط حول المربّعات مقاطع ≤١٩٧ إطارًا وقناعها إلى الخادم، ثمّ تركيب داخل المربّعات).
// أوامر الأداة حرفيًّا، والمسار كلّه (erMake) بأداة مزيّفة وشبكة مزيّفة، وحالة اللوحة مع الباركود والنشر، والنصوص بالـ١٤ لغة والوسوم.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { clientSlice, flush } = require('./_owner-vm.cjs');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));
const V = read('js/video.js');

// ── عناصر محاكاة بقدر ما تحتاجه اللوحة ──
function mkEl(tag) {
  let text = '';
  const cls = new Set(), on = {};
  const el = {
    tagName: tag, children: [], value: '', checked: false, disabled: false, type: '', hidden: false, className: '', style: {}, width: 16, height: 9,
    classList: { toggle: (c, v) => { if (v) cls.add(c); else cls.delete(c); }, add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    appendChild(c) { el.children.push(c); c.parentNode = el; return c; }, removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; },
    focus() {}, pause() {}, load() {}, attrs: {}, setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; }, removeAttribute(k) { delete el.attrs[k]; },
    addEventListener(k, f) { (on[k] = on[k] || []).push(f); }, fire(k, e) { for (const f of on[k] || []) f(e || {}); },
    querySelectorAll() { return []; },
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'getImageData' ? () => ({ data: [0, 0, 0, 255] }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }), setPointerCapture() {},
  };
  Object.defineProperty(el, 'textContent', { get: () => text + el.children.map((c) => c.textContent || '').join(''), set: (s) => { text = String(s); el.children = []; } });
  return el;
}
const IDS = ['vdPubCap', 'vdPubPlats', 'vdPubMsg', 'vdPubRes', 'vdPub', 'vdRes', 'vdVideo', 'vdDl', 'vdUpMsg',
  'vdErRow', 'vdErBtn', 'vdErUndo', 'vdErNote', 'vdEr', 'vdErHint', 'vdErCv', 'vdErT', 'vdErFree', 'vdErAi', 'vdErClear', 'vdErClose'];
function panel(o = {}) {
  const els = {}; for (const k of IDS) els[k] = mkEl(k === 'vdErCv' ? 'canvas' : 'div');
  els.vdRes.classList.add('has');
  const api = [], urls = { made: [], revoked: [] }, timers = [];
  const ctx = {
    id: (k) => els[k] || null, L: (k) => k, drT: (k, x) => k + (x ? ' ' + JSON.stringify(x) : ''),
    drTok: () => 'tok', drOwner: () => true, DR: { out: '' }, syncDirector() {}, __swallow() {}, drMsg() {},
    URL: { createObjectURL: (f) => { const u = 'blob:u' + (urls.made.length + 1); urls.made.push({ u, f }); return u; }, revokeObjectURL: (u) => { urls.revoked.push(u); } },
    setTimeout: o.realTimers ? (fn) => { setImmediate(fn); return 1; } : (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    document: { createElement: mkEl, createTextNode: (s) => ({ textContent: String(s) }), querySelector: () => null },
    fetch: async (url, opt) => { api.push({ url: String(url), body: opt && opt.body ? JSON.parse(opt.body) : null }); return { json: async () => ({ ok: true }) }; },
    confirms: [], answer: true, ls: { aiapp_vd_endcard: '0' },
    localStorage: { getItem: (k) => (k in ctx.ls ? ctx.ls[k] : null), setItem: (k, v) => { ctx.ls[k] = String(v); } },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, Blob, File, TextDecoder, TextEncoder,
  };
  ctx.window = ctx; ctx.confirm = (q) => { ctx.confirms.push(q); return ctx.answer; };
  clientSlice('js/video.js', '  var PB={busy:false', '  function syncDirector(){', ctx);
  return { ctx, els, api, urls, timers };
}
const vfile = (n, t, size) => new File([new Uint8Array(size || 64)], n, { type: t });
const PLAIN = { v: { i: 0, color: {}, w: 1280, h: 720 }, a: { i: 1 }, w: 1280, h: 720, dw: 1280, dh: 720, ow: 1280, oh: 720, fps: '30', fast: false, dur: 13 };

test('١. المربّع ← بكسلات داخل الإطار ببكسل من كلّ جهة وبهامش يغطّي حواف الحروف، والمجّانيّ ترميز واحد: delogo ثمّ مقاس البطيء ومصفوفته والصوت AAC ستيريو ٤٨ك', () => {
  const { ctx } = panel();
  assert.deepEqual(J(ctx.erPx({ x: 0, y: 0, w: 1, h: 1 }, 1280, 720)), { x: 1, y: 1, w: 1278, h: 718 }, 'الإطار كلّه: delogo على الحافّة يرفض السلسلة');
  assert.deepEqual(J(ctx.erPx({ x: 0.5, y: 0.5, w: 0.1, h: 0.05 }, 1280, 720)), { x: 636, y: 356, w: 136, h: 44 }, 'هامش ٤ بكسل لـ٧٢٠ (٠٫٦٪)');
  const tiny = ctx.erPx({ x: 0.999, y: 0.999, w: 0.0001, h: 0.0001 }, 1280, 720);
  assert.ok(tiny.x >= 1 && tiny.y >= 1 && tiny.w >= 2 && tiny.h >= 2 && tiny.x + tiny.w <= 1279 && tiny.y + tiny.h <= 719, J(tiny));
  const a = ctx.erFreeArgs(PLAIN, '/erin/input', [{ x: 0.1, y: 0.85, w: 0.8, h: 0.08 }, { x: 0.8, y: 0.03, w: 0.15, h: 0.06 }]);
  const fc = a[a.indexOf('-filter_complex') + 1];
  assert.equal(fc, '[0:0]delogo=x=124:y=608:w=1032:h=66,delogo=x=1020:y=17:w=200:h=52,scale=1280:720:in_color_matrix=bt709:out_color_matrix=bt709,setsar=1,fps=30,format=yuv420p[v]');
  assert.deepEqual(J(a.slice(a.indexOf('-map'))), ['-map', '[v]', '-map', '0:1', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', 'er_out.mp4']);
  // مدوَّر: المرشّحات تأخذ الإطار بعد الدوران (dw×dh) — النسب نفسها على الشبكة القائمة
  const rot = ctx.erFreeArgs(Object.assign({}, PLAIN, { dw: 1080, dh: 1920, ow: 1080, oh: 1920, a: null }), 'x', [{ x: 0, y: 0.9, w: 1, h: 0.05 }]);
  assert.ok(rot[rot.indexOf('-filter_complex') + 1].startsWith('[0:0]delogo=x=1:y=1722:w=1078:h=108,scale=1080:1920'), rot.join(' '));
  assert.ok(!rot.includes('0:1') && !rot.includes('aac'), 'بلا صوت: لا خريطة صوت');
});

test('٢. الخطّة: المسح يعيد الترميز دائمًا — H.264 الصالح للسريع يصير بطيئًا («erase») بحدوده ومقاس مخرجه، وغيره كما كان', () => {
  const { ctx } = panel();
  const log = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/erin/input':\n  Duration: 00:00:20.00, start: 0.000000, bitrate: 1000 kb/s\n"
    + '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 900 kb/s, 30 fps, 30 tbr, 15360 tbn (default)\n'
    + '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)\n';
  const info = ctx.ecParse(log); info.atb = 48000;
  const fast = ctx.ecPlan(info, 50 * 1048576, false);
  assert.deepEqual([fast.fast, fast.why], [true, ''], 'الباركود وحده: سريع كما كان');
  const sl = ctx.ecPlan(info, 50 * 1048576, false, true);
  assert.deepEqual([sl.ok, sl.fast, sl.why, sl.ow, sl.oh], [true, false, 'erase', 1920, 1080]);
  assert.deepEqual(J(ctx.ecPlan(info, 400 * 1048576, false, true)), { ok: false, why: 'heavy' }, 'فوق ٣٠٠ ميغا على الحاسوب: حدّ البطيء لا السريع');
  assert.deepEqual(J(ctx.ecPlan(info, 120 * 1048576, true, true)), { ok: false, why: 'heavy' }, 'والجوّال ١٠٠');
});

test('٣. الشريط للذكاء: حول المربّعات بنسبة النموذج، داخل الإطار بأبعاد زوجيّة، ومقاس الإرسال مضاعفات ١٦ بلا تكبير؛ والمقاطع ١٩٧ إطارًا بالضبط', () => {
  const { ctx } = panel();
  const small = ctx.erBand([{ x: 0.85, y: 0.05, w: 0.1, h: 0.05 }], 1920, 1080);
  assert.deepEqual([small.w, small.h, small.SW, small.SH], [448, 256, 448, 256], 'شعار صغير: أدنى شريط وبلا تصغير (دقّة كاملة داخل المربّع)');
  assert.ok(small.x >= 0 && small.y >= 0 && small.x + small.w <= 1920 && small.y + small.h <= 1080 && small.x % 2 === 0 && small.y % 2 === 0, J(small));
  const r = small.rects[0];
  assert.ok(r.x > 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1, 'المربّع داخل الشريط بنسبه');
  const wide = ctx.erBand([{ x: 0.1, y: 0.85, w: 0.8, h: 0.08 }], 1280, 720);
  assert.ok(Math.abs(wide.w / wide.h - 672 / 384) < 0.08 || wide.w === 1280 || wide.h === 720, J(wide));
  assert.ok(wide.SW <= 672 && wide.SH <= 384 && wide.SW % 16 === 0 && wide.SH % 16 === 0, J(wide));
  const tall = ctx.erBand([{ x: 0.05, y: 0.2, w: 0.08, h: 0.6 }], 1080, 1920);
  assert.ok(tall.h > tall.w && tall.SW <= 384 && tall.SH <= 672, J(tall));
  const odd = ctx.erBand([{ x: 0.2, y: 0.4, w: 0.5, h: 0.1 }], 1000, 700); /* شريط ٥٦٨×٣٢٤: ليس مضاعف ١٦ من نفسه (الحالات فوق كانت كذلك صدفةً) */
  assert.deepEqual([odd.w, odd.h, odd.SW, odd.SH], [568, 324, 576, 320], J(odd));
  assert.deepEqual([1, 69, 70, 77, 78, 196, 197, 250].map(ctx.erSnap), [69, 69, 77, 77, 85, 197, 197, 197], 'قيم النموذج ٨ك−٣');
  const b = ctx.erBandArgs(PLAIN, '/erin/input', wide);
  const s = b.join(' ');
  assert.ok(s.includes('[0:0]crop=' + wide.w + ':' + wide.h + ':' + wide.x + ':' + wide.y + ',scale=' + wide.SW + ':' + wide.SH + ':in_color_matrix=bt709:out_color_matrix=bt709,setsar=1,fps=30,format=yuv420p[v]'), s);
  assert.ok(s.includes('-g 197 -keyint_min 197 -sc_threshold 0 -force_key_frames expr:eq(mod(n,197),0) -f segment -segment_time 6.566667 -segment_time_delta 0.05 -reset_timestamps 1 erb_%03d.mp4'), s);
  assert.ok(ctx.erBandArgs(Object.assign({}, PLAIN, { fps: '30000/1001' }), 'x', wide).join(' ').includes('-segment_time 6.573233'), '٢٩٫٩٧');
  assert.deepEqual(J(ctx.erMaskArgs(PLAIN, 193, 'erm_193.mp4')), ['-hide_banner', '-y', '-loop', '1', '-framerate', '30', '-i', 'erm.png', '-frames:v', '193', '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'yuv420p', '-r', '30', 'erm_193.mp4'], 'القناع بلا فقد وبعدد إطارات مقطعه');
});

test('٤. التركيب: النتائج تُقصّ لطول مقاطعها (والقصير يُمدّ، والذي لم يرجع شريطه ممسوحًا مجانًا)، ثمّ فوق الأصل داخل المربّعات وحدها بقناع ناعم', () => {
  const { ctx } = panel();
  const B = ctx.erBand([{ x: 0.85, y: 0.05, w: 0.1, h: 0.05 }], 1280, 720);
  const segs = [{ n: 'erb_000.mp4', f: 197, r: 'err_000.mp4', rf: 197 }, { n: 'erb_001.mp4', f: 197 }, { n: 'erb_002.mp4', f: 100, r: 'err_002.mp4', rf: 40 }];
  const a = ctx.erJoinArgs(PLAIN, segs, B), fc = a[a.indexOf('-filter_complex') + 1].split(';');
  assert.deepEqual(J(a.filter((x, i) => a[i - 1] === '-i')), ['err_000.mp4', 'erb_001.mp4', 'err_002.mp4']);
  assert.equal(fc[0], '[0:v]scale=' + B.SW + ':' + B.SH + ',setsar=1,format=yuv420p,trim=end_frame=197,setpts=PTS-STARTPTS[s0]', 'النتيجة تُقصّ إلى مقطعها (النموذج يكمّل إلى num_frames)');
  assert.ok(/^\[1:v\]scale=\d+:\d+,setsar=1,format=yuv420p,delogo=x=\d+:y=\d+:w=\d+:h=\d+,trim=end_frame=197,setpts=PTS-STARTPTS\[s1\]$/.test(fc[1]), fc[1]);
  assert.equal(fc[2], '[2:v]scale=' + B.SW + ':' + B.SH + ',setsar=1,format=yuv420p,setpts=N*0.083333/TB,fps=30,trim=end_frame=100,setpts=PTS-STARTPTS[s2]', 'أقلّ من مقطعه: يُمدّ زمنيًّا');
  assert.equal(fc[3], '[s0][s1][s2]concat=n=3:v=1:a=0,setpts=N/(30.000000*TB),fps=30[v]', 'fps بعد setpts: concat يحمل معدّل مدخلاته (نتائج بـ١٢ إطارًا تأخّرت إطارين في النواة الحقيقيّة)');
  const cp = ctx.erCompArgs(Object.assign({}, PLAIN, { ow: 1920, oh: 1080, dur: 13 }), '/erin/input', B, 390), s = cp.args.join(' ');
  assert.equal(cp.w, ctx.ecEven(B.w * 1.5)); assert.equal(cp.h, ctx.ecEven(B.h * 1.5));
  assert.ok(s.includes('-i /erin/input -i erj.mp4 -loop 1 -framerate 30 -t 14 -i era.png'), s);
  assert.ok(s.includes('[2:v]scale=' + cp.w + ':' + cp.h + ',format=gbrp,extractplanes=g[al];[b][al]alphamerge=shortest=1[ba];[base][ba]overlay=x=' + Math.round(B.x * 1.5) + ':y=' + Math.round(B.y * 1.5) + ':format=yuv420:eof_action=repeat,format=yuv420p[v]'), 'القناع قناة خضراء كاملة المدى (رماديّ yuv يحدّه ٢٣٥ فتطلّ الكتابة)');
  assert.ok(!cp.args.includes('-shortest'), 'صوت أقصر لا يقصّ الصورة');
  assert.ok(s.includes('-map [v] -frames:v 390 '), 'القناع المتكرّر لا يمدّ المخرج (كان ١٥ ث لفيديو ١٣ في النواة الحقيقيّة)');
  assert.ok(s.endsWith('-c:a aac -b:a 160k -ar 48000 -ac 2 -movflags +faststart er_out.mp4'), s);
});

// ── المسار كلّه بأداة مزيّفة تتصرّف كالمكتبة (terminate يرفض المعلّق) وشبكة مزيّفة ──
const PROBE = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/erin/input':\n  Duration: 00:00:13.00, start: 0.000000, bitrate: 1000 kb/s\n"
  + '  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, progressive), 1280x720 [SAR 1:1 DAR 16:9], 900 kb/s, 30 fps, 30 tbr, 15360 tbn (default)\n'
  + '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)\n';
function live(o = {}) {
  const P = panel({ realTimers: true }), { ctx } = P;
  const F = { execs: [], fs: {}, frames: { 'erb_000.mp4': 197, 'erb_001.mp4': 193, 'err_000.mp4': 197, 'err_001.mp4': 197 }, /* النموذج يكمّل المقطع إلى num_frames (١٩٣ ← ١٩٧) */ puts: [], api: [], fetched: [], alive: [] };
  const enc = (s) => new TextEncoder().encode(s);
  class FakeFF {
    constructor() { this.cbs = { log: [], progress: [] }; this.pend = new Set(); this.on_ = true; F.alive.push(this); }
    _p(get) { if (!this.on_) return Promise.reject(new Error('ffmpeg is not loaded')); return new Promise((res, rej) => { const e = { res, rej }; this.pend.add(e); setImmediate(() => { if (!this.pend.delete(e)) return; try { res(get()); } catch (x) { rej(x); } }); }); }
    load() { return this._p(() => true); } on(k, f) { this.cbs[k].push(f); }
    createDir() { return this._p(() => true); } mount() { return this._p(() => true); }
    listDir() { return this._p(() => Object.keys(F.fs).map((name) => ({ name, isDir: false }))); }
    exec(args) {
      const a = args.join(' ').replace(/^-hide_banner (-y )?/, ''); F.execs.push(a);
      return this._p(() => {
        if (a === '-i /erin/input') { for (const l of (o.probe || PROBE).split('\n')) for (const f of this.cbs.log) f({ message: l }); return 1; }
        if (a.endsWith('erb_%03d.mp4')) { for (const n of Object.keys(F.frames)) F.fs[n] = new Uint8Array(1000); return 0; }
        if (a.endsWith('-f framecrc erc.txt')) { const n = a.split(' ')[1]; if ((o.broken || []).includes(n)) return 1; /* ملفّ تالف: الأمر يفشل ولا يكتب */
          const inp = n === '/erin/input', k = inp ? (o.inputFrames || 0) : (F.frames[n] || 0); /* الأصل: حزم بتوقيت متزايد بمعدّله (مدّة الفيديو وحده) */
          F.fs['erc.txt'] = enc('#tb 0: 1/' + (inp ? (o.inputFps || 30) : 30) + '\n' + Array.from({ length: k }, (_, i) => '0, ' + (inp ? i + (o.inputStart || 0) : 0) + ', ' + (inp ? i + (o.inputStart || 0) : 0) + ', 1, 10, 0x1\n').join('')
            + (o.discard ? '0, 9, 9, 1, 10, 0x9, F=0x4\n'.repeat(o.discard) : '')); return 0; }
        if (/erm_\d+\.mp4$/.test(a)) { F.fs[a.split(' ').pop()] = new Uint8Array(300); return 0; }
        if (a.endsWith('erj.mp4')) { if (o.joinFail) return 1; F.fs['erj.mp4'] = new Uint8Array(2000); return 0; }
        if (a.endsWith('er_out.mp4')) { F.fs['er_out.mp4'] = new Uint8Array(4096); return 0; }
        throw new Error('أمر غير متوقّع: ' + a);
      });
    }
    readFile(n) { return this._p(() => { if (!(n in F.fs)) throw new Error('FS error'); return F.fs[n]; }); }
    writeFile(n, d) { F.fs[n] = d; return this._p(() => true); }
    deleteFile(n) { return this._p(() => { if (!(n in F.fs)) throw new Error('FS error'); delete F.fs[n]; return true; }); }
    terminate() { this.on_ = false; const ps = [...this.pend]; this.pend.clear(); for (const e of ps) e.rej(new Error('called FFmpeg.terminate()')); }
  }
  const replies = Object.assign({
    start: { ok: true, id: 'job1', ups: [0, 1, 2, 3].map((i) => ({ put: 'https://up.example/' + i, ctype: 'video/mp4' })), cents: 10 },
    submit: { ok: true, state: 'running', chunks: [{ i: 0, state: 'running' }, { i: 1, state: 'running' }] },
    status: [{ ok: true, state: 'running', chunks: [{ i: 0, state: 'done', url: 'https://cdn.example/r0.mp4' }, { i: 1, state: 'running' }] },
      { ok: true, state: 'done', chunks: [{ i: 0, state: 'done', url: 'https://cdn.example/r0.mp4' }, { i: 1, state: 'done', url: 'https://cdn.example/r1.mp4' }] }],
  }, o.replies || {});
  let polls = 0;
  Object.assign(ctx, {
    __imp: async () => ({ FFmpeg: FakeFF }),
    __omranProxyVideoUrl: (u) => '/api/video-download?url=' + encodeURIComponent(u),
    fetch: async (url, opt) => {
      const u = String(url);
      if (u.startsWith('/api/video-download')) { F.fetched.push({ u, auth: opt && opt.headers && opt.headers.Authorization }); return { ok: true, blob: async () => new Blob([new Uint8Array(900)]) }; }
      const op = /[?&]op=(\w+)/.exec(u)[1], body = JSON.parse(opt.body); F.api.push({ u, op, body });
      let r = replies[op]; if (op === 'status') { r = Array.isArray(r) ? r[Math.min(polls, r.length - 1)] : r; polls++; }
      const v = typeof r === 'function' ? r(body) : r;
      if (v === 'NET') throw new TypeError('Failed to fetch'); /* انقطاع: الطلب نفسه يفشل — لا جواب يُقرأ */
      return { json: async () => J(v) };
    },
    XMLHttpRequest: function () {
      const x = this; x.upload = {}; x.status = 0;
      x.open = (m, u) => { x.m = m; x.u = u; }; x.setRequestHeader = (k, v) => { x.ct = v; };
      x.send = (b) => { F.puts.push({ m: x.m, u: x.u, ct: x.ct, size: b.size }); x.status = 200; setImmediate(() => { if (x.upload.onprogress) x.upload.onprogress({ lengthComputable: true, loaded: b.size }); x.onload(); }); };
      x.abort = () => { setImmediate(() => x.onabort && x.onabort()); };
    },
    createImageBitmap: async () => ({}),
  });
  /* ecPng في vm: لوحة المحاكاة بلا toBlob — PNG وهميّ */
  ctx.ecPng = async () => new Uint8Array([137, 80, 78, 71]);
  const body = V.slice(V.indexOf('  async function erMake('), V.indexOf('  async function erStart('));
  const IMP = "await import('/ffmpeg/lib/index.js')";
  assert.equal(body.split(IMP).length, 2, 'استيراد الأداة مرّة');
  vm.runInContext(body.replace(IMP, 'await __imp()'), ctx);
  return Object.assign(P, { F });
}
const steps = (F) => F.execs.map((a) => (a === '-i /erin/input' ? 'probe' : a.endsWith('erb_%03d.mp4') ? 'band' : a.endsWith('erc.txt') ? 'count:' + a.split(' ')[1]
  : /erm_\d+\.mp4$/.test(a) ? 'mask:' + a.split(' ').pop() : a.endsWith('erj.mp4') ? 'join' : a.endsWith('er_out.mp4') ? 'comp' : a));

test('٥. بالذكاء كلّه: شريط ← مقطعان (١٩٧+١٩٣) ← موافقة بالعدد والسعر ← بدء ورفع أربعة ملفّات ← إرسال ← استطلاع ← جلب عبر الوسيط ← دمج وتركيب', async () => {
  const L = live(), { ctx, F } = L;
  const ps = [], file = vfile('clip.mov', 'video/quicktime', 5000);
  const my = ++ctx.ER.run;
  const r = await ctx.erMake(file, [{ x: 0.85, y: 0.05, w: 0.1, h: 0.05 }], 'ai', my, (k, p, x) => ps.push(k + ':' + Math.round(p) + (x ? '@' + J(x).d + '/' + J(x).n : '')));
  assert.deepEqual(steps(F), ['probe', 'band', 'count:erb_000.mp4', 'count:erb_001.mp4', 'mask:erm_197.mp4', 'mask:erm_193.mp4',
    'count:err_000.mp4', 'count:err_001.mp4', 'join', 'comp']);
  assert.deepEqual(ctx.confirms, ['vdErConfirm {"n":2,"c":10}'], 'إنفاق: موافقة بعدد المقاطع وسعرها قبل أيّ رفع');
  const start = F.api.find((x) => x.op === 'start');
  assert.ok(start.u.startsWith('/api/media?action=video-erase&op=start'), start.u);
  assert.deepEqual(start.body.chunks, [{ v: 0, m: 2, frames: 197 }, { v: 1, m: 3, frames: 193 }], 'قناعان: لكلّ طول مقطع قناعه');
  assert.deepEqual(start.body.files.map((f) => f.type), ['video/mp4', 'video/mp4', 'video/mp4', 'video/mp4']);
  assert.equal(start.body.token, 'tok');
  assert.deepEqual(F.puts.map((p) => [p.m, p.u, p.ct]), [0, 1, 2, 3].map((i) => ['PUT', 'https://up.example/' + i, 'video/mp4']), 'الرفع مباشرة إلى أهداف الخادم بنوعها');
  assert.deepEqual(F.api.map((x) => x.op), ['start', 'submit', 'status', 'status']);
  assert.deepEqual(F.fetched.map((x) => [x.u, x.auth]), [['/api/video-download?url=' + encodeURIComponent('https://cdn.example/r0.mp4'), 'Bearer tok'], ['/api/video-download?url=' + encodeURIComponent('https://cdn.example/r1.mp4'), 'Bearer tok']], 'عبر وسيط التنزيل بالترويسة — لا رابط المزوّد مباشرة');
  const join = F.execs.find((a) => a.endsWith('erj.mp4'));
  assert.ok(join.startsWith('-i err_000.mp4 -i err_001.mp4 '), join);
  assert.deepEqual([r.file.name, r.file.type, r.file.size, r.some, r.n], ['clip-clean.mp4', 'video/mp4', 4096, 0, 2]);
  assert.equal(ctx.ER.paid, true, 'بعد الإرسال: مدفوع (ملفّ جديد يسأل)');
  const nums = ps.map((s) => parseFloat(s.split(':')[1]));
  assert.ok(nums.every((v, i) => i === 0 || v >= nums[i - 1]), 'الرقم لا يرجع: ' + ps.join(' '));
  assert.ok(ps.some((s) => s.startsWith('vdErUp:')) && ps.some((s) => s.startsWith('vdErWait:') && s.endsWith('@2/2')) && ps.some((s) => s.startsWith('vdErJoin:')), ps.join(' '));
});

test('٦. بالذكاء: الرفض قبل أيّ شبكة، والسقف رسالته، ومقطع لم يرجع يُمسح مجانًا (والعدد يُقال)، والإلغاء يوقف الاستطلاع', async () => {
  let L = live(), file = vfile('a.mp4', 'video/mp4', 5000);
  L.ctx.answer = false;
  await assert.rejects(L.ctx.erMake(file, [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', ++L.ctx.ER.run, () => {}), (e) => e.code === 'declined');
  assert.deepEqual([L.F.api.length, L.F.puts.length], [0, 0], 'رفض الموافقة: لا بدء ولا رفع');
  L = live({ replies: { start: { ok: false, error: 'cap', left: 0 } } });
  await assert.rejects(L.ctx.erMake(file, [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', ++L.ctx.ER.run, () => {}), (e) => e.code === 'cap');
  assert.deepEqual(L.F.puts, [], 'السقف: لا رفع');
  L = live({ replies: { status: { ok: true, state: 'partial', chunks: [{ i: 0, state: 'done', url: 'https://cdn.example/r0.mp4' }, { i: 1, state: 'failed', why: 'x' }] } } });
  const r = await L.ctx.erMake(file, [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', ++L.ctx.ER.run, () => {});
  assert.deepEqual([r.some, r.n], [1, 2]);
  const join = L.F.execs.find((a) => a.endsWith('erj.mp4'));
  assert.ok(join.startsWith('-i err_000.mp4 -i erb_001.mp4 ') && /\[1:v\][^;]*delogo=/.test(join), join);
  // الإلغاء أثناء الانتظار: لا استطلاع بعده ولا تركيب
  L = live({ replies: { status: { ok: true, state: 'running', chunks: [{ i: 0, state: 'running' }, { i: 1, state: 'running' }] } } });
  const my = ++L.ctx.ER.run, p = L.ctx.erMake(file, [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', my, () => {});
  for (let i = 0; i < 400 && !L.F.api.some((x) => x.op === 'status'); i++) await flush();
  L.ctx.erCancel();
  await assert.rejects(p, (e) => e.code === 'stale');
  const n = L.F.api.length; for (let i = 0; i < 30; i++) await flush();
  assert.equal(L.F.api.length, n, 'لا استطلاع بعد الإلغاء');
  assert.ok(!L.F.execs.some((a) => a.endsWith('er_out.mp4')), 'ولا تركيب');
});

test('٦ب. نتيجة تالفة من المزوّد لا تدخل الدمج: عدّ إطاراتها يفشل فيُمسح مقطعها مجانًا (كان erc.txt السابق يُعدّ فيسقط الدمج كلّه — مقيس في التطبيق نفسه)، والحزم المرفوضة لا تُعدّ', async () => {
  let L = live({ broken: ['err_001.mp4'] });
  const r = await L.ctx.erMake(vfile('a.mp4', 'video/mp4', 5000), [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', ++L.ctx.ER.run, () => {});
  assert.deepEqual([r.some, r.n], [1, 2]);
  const join = L.F.execs.find((a) => a.endsWith('erj.mp4'));
  assert.ok(join.startsWith('-i err_000.mp4 -i erb_001.mp4 ') && /\[1:v\][^;]*delogo=/.test(join), join);
  L = live({ discard: 5 });
  await L.ctx.erMake(vfile('a.mp4', 'video/mp4', 5000), [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', ++L.ctx.ER.run, () => {});
  const start = L.F.api.find((x) => x.op === 'start');
  assert.deepEqual(start.body.chunks.map((c) => c.frames), [197, 193], 'حزم F=0x4 لا تُحسب إطارات');
});

test('٧. المجّانيّ كلّه: فحص ثمّ ترميز واحد، بلا شبكة ولا موافقة', async () => {
  const L = live(), file = vfile('b.webm', 'video/webm', 5000);
  const r = await L.ctx.erMake(file, [{ x: 0.1, y: 0.8, w: 0.8, h: 0.1 }], 'free', ++L.ctx.ER.run, () => {});
  assert.deepEqual(steps(L.F).slice(0, 1), ['probe']);
  assert.equal(L.F.execs.length, 2);
  assert.ok(L.F.execs[1].includes('delogo=') && L.F.execs[1].endsWith('er_out.mp4'), L.F.execs[1]);
  assert.deepEqual([L.F.api.length, L.F.puts.length, L.ctx.confirms.length, r.file.name], [0, 0, 0, 'b-clean.mp4']);
});

// ── اللوحة: الممسوح مصدر الباركود، و«رجّع الأصل»، والأقفال، وملفّ جديد ──
function flow(o = {}) {
  const P = panel(), { ctx } = P;
  const calls = [];
  ctx.erMake = (file, boxes, mode, my) => new Promise((res, rej) => calls.push({ file, boxes, mode, my, res, rej }));
  ctx.ecMake = (file, my) => new Promise((res, rej) => calls.push({ ec: true, file, my, res, rej }));
  if (o.card) ctx.ls.aiapp_vd_endcard = '1';
  return Object.assign(P, { calls });
}
test('٨. المسح ينجح: الممسوح يُعرض ويصير مصدر الباركود (يُضاف بعده إن كان مشغَّلًا)، و«رجّع الأصل» يعيد الأصل ويحرّر الممسوح', async () => {
  const { ctx, els, calls, urls } = flow({ card: true });
  const f = vfile('v.mp4', 'video/mp4');
  ctx.upPick(f); await flush();
  const orig = ctx.DR.out;
  assert.equal(ctx.ER.orig, ctx.EC.src, 'الأصل محفوظ (الكائن نفسه)');
  calls.shift().res(vfile('v-om-ai.mp4', 'video/mp4')); await flush(); /* باركود الأصل */
  ctx.ER.boxes = [{ x: 0.1, y: 0.8, w: 0.5, h: 0.1 }];
  const p = ctx.erStart('free'); await flush();
  assert.equal(ctx.ER.busy, true);
  assert.equal(calls[0].file, f, 'المسح من الأصل لا من نسخة الباركود');
  assert.deepEqual(J(calls[0].boxes), [{ x: 0.1, y: 0.8, w: 0.5, h: 0.1 }]);
  assert.equal(els.vdUpMsg.textContent, 'vdErWork {"p":0}');
  calls.shift().res({ file: vfile('v-clean.mp4', 'video/mp4'), some: 0, n: 0 }); await p; await flush();
  const clean = ctx.DR.out;
  assert.ok(clean !== orig && ctx.EC.src.url === clean && ctx.ER.out.url === clean && ctx.EC.src.file.name === 'v-clean.mp4');
  assert.equal(ctx.ER.orig.url, orig, 'الأصل باقٍ');
  assert.equal(calls.length, 1, 'الباركود يبدأ على الممسوح'); assert.equal(calls[0].ec, true); assert.equal(calls[0].file.name, 'v-clean.mp4');
  assert.ok(urls.revoked.some((u) => u !== orig), 'باركود الأصل حُرِّر'); assert.ok(!urls.revoked.includes(orig), 'الأصل لا يُحرَّر');
  calls.shift().res(vfile('v-clean-om-ai.mp4', 'video/mp4')); await flush();
  const card = ctx.DR.out;
  ctx.erUndo(); await flush();
  assert.equal(ctx.DR.out, orig); assert.equal(ctx.EC.src, ctx.ER.orig); assert.equal(ctx.ER.out, null);
  assert.ok(urls.revoked.includes(clean) && urls.revoked.includes(card), 'الممسوح وباركوده حُرِّرا');
  assert.deepEqual(J(ctx.ER.boxes), [{ x: 0.1, y: 0.8, w: 0.5, h: 0.1 }], 'المربّعات تبقى لتعديلها');
  assert.equal(calls.length, 1, 'الباركود من جديد على الأصل'); assert.equal(calls[0].file, f);
});

test('٩. الأقفال: لا مسح بلا مربّع، ولا أثناء نشر أو بعد رفعه للنشر؛ النشر والباركود ينتظران المسح؛ ملفّ جديد يلغيه (والمدفوع يسأل)', async () => {
  let P = flow(), { ctx, calls, els } = P;
  ctx.upPick(vfile('a.mp4', 'video/mp4')); await flush();
  await ctx.erStart('free');
  assert.deepEqual([calls.length, els.vdUpMsg.textContent], [0, 'vdErNeedBox'], 'بلا مربّع: رسالة لا عمل');
  ctx.ER.boxes = [{ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }];
  ctx.PB.vid = 'x1'; await ctx.erStart('free'); assert.equal(calls.length, 0, 'رُفع للنشر: لا تبديل (نشر مكرّر)'); ctx.erUndo(); ctx.PB.vid = '';
  ctx.PB.busy = true; await ctx.erStart('free'); assert.equal(calls.length, 0); ctx.PB.busy = false;
  ctx.erStart('free'); await flush();
  assert.equal(calls.length, 1);
  ctx.PB.plats = ['x']; els.vdPubCap.value = 'نص';
  els.vdPubPlats.querySelectorAll = (sel) => (sel === 'input:checked' ? [{ value: 'x', checked: true }] : []); /* منصّة مؤشَّرة: بلا الحارس كان يصل الرفع (لا قائمة فارغة توقفه قبله) */
  await ctx.pbGo();
  /* v-director-upload-fix: اختيار الملفّ يسأل عن الحسابات (تحديث اللوحة) — ليس نشرًا؛ المقصود هنا: لا هدف رفع ولا نشر */
  assert.deepEqual([P.api.filter((a) => !/[?&]op=accounts\b/.test(a.url)).length, P.api.length, ctx.confirms.length], [0, 1, 0], 'لا نشر أثناء المسح (ولا سؤال)');
  ctx.ecToggle(true); assert.equal(calls.length, 1, 'الباركود لا يبدأ أثناء المسح (التفضيل وحده)'); assert.equal(ctx.ls.aiapp_vd_endcard, '1');
  const first = calls[0];
  ctx.upPick(vfile('b.mp4', 'video/mp4')); await flush();
  assert.notEqual(ctx.ER.run, first.my, 'ملفّ جديد يلغي المسح');
  assert.deepEqual([ctx.ER.busy, ctx.ER.boxes.length], [false, 0]);
  first.res({ file: vfile('a-clean.mp4', 'video/mp4'), some: 0, n: 0 }); await flush();
  assert.ok(ctx.EC.src.file.name === 'b.mp4' && !ctx.ER.out, 'نتيجة الملغى لا تُعرض');
  // المدفوع الجاري: ملفّ جديد يسأل، والرفض يبقيه
  P = flow(); ({ ctx, calls } = P);
  ctx.upPick(vfile('c.mp4', 'video/mp4')); await flush();
  ctx.ER.boxes = [{ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }];
  ctx.erStart('ai'); await flush(); ctx.ER.paid = true; ctx.answer = false;
  const run = ctx.ER.run;
  ctx.upPick(vfile('d.mp4', 'video/mp4')); await flush();
  assert.deepEqual([ctx.confirms.slice(-1)[0], ctx.ER.run, ctx.EC.src.file.name], ['vdErLose', run, 'c.mp4'], 'المسح المدفوع لا يضيع بلا سؤال');
  ctx.answer = true; ctx.upPick(vfile('d.mp4', 'video/mp4')); await flush();
  assert.ok(ctx.ER.run !== run && ctx.EC.src.file.name === 'd.mp4');
});

test('١٠. الفشل يبقي الأصل برسالة (والثقيل والسقف والطويل برسائلها والرفض بلا رسالة) في الملاحظة تحت الزرّ وحدها (كانت مرّتين — مراجعة ثانية)، والمتوقَّع لا يُسجَّل خطأً، والتوليد في المخرج يلغي المسح', async () => {
  const { ctx, calls, els } = flow();
  const logged = []; ctx.__swallow = (e, w) => logged.push(w);
  ctx.upPick(vfile('a.mp4', 'video/mp4')); await flush();
  const orig = ctx.DR.out;
  ctx.ER.boxes = [{ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }];
  for (const [code, msg, err, log] of [['enc', 'vdErFail', true, true], ['heavy', 'vdErHeavy', true, false], ['cap', 'vdErCap', true, false], ['long', 'vdErLong', true, false], ['declined', '', false, false]]) {
    const n = logged.length;
    const p = ctx.erStart('ai'); await flush(); calls.shift().rej({ code }); await p;
    assert.deepEqual([ctx.DR.out, els.vdUpMsg.textContent, ctx.ER.busy, ctx.ER.paid], [orig, '', false, false], code + ': رسالة الصندوق فارغة');
    assert.deepEqual(J(ctx.ER.note), msg ? { t: msg, err } : null, code + ': الملاحظة تحت الزرّ');
    assert.equal(logged.length > n, log, code + ': ' + logged.slice(n).join());
  }
  ctx.erStart('free'); await flush();
  const my = calls[0].my;
  ctx.upEnd();
  assert.ok(ctx.ER.run !== my && !ctx.ER.orig && !ctx.ER.busy, 'upEnd يلغي المسح ويترك الأصل');
});

test('١٠ب. الإرسال يُعاد مرّة إن لم يظهر المرفوع بعد عند المزوّد (لا خصم قبل الإرسال)، والمرّة الثانية الفاشلة رسالة لا انتظار', async () => {
  let n = 0;
  let L = live({ replies: { submit: () => (++n === 1 ? { ok: false, error: 'not_uploaded', missing: [1] } : { ok: true, state: 'running', chunks: [{ i: 0, state: 'running' }, { i: 1, state: 'running' }] }) } });
  const r = await L.ctx.erMake(vfile('a.mp4', 'video/mp4', 5000), [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', ++L.ctx.ER.run, () => {});
  assert.deepEqual([L.F.api.map((x) => x.op).slice(0, 3), r.n], [['start', 'submit', 'submit'], 2]);
  L = live({ replies: { submit: { ok: false, error: 'not_uploaded', missing: [0] } } });
  await assert.rejects(L.ctx.erMake(vfile('a.mp4', 'video/mp4', 5000), [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', ++L.ctx.ER.run, () => {}), (e) => e.code === 'ai');
  assert.deepEqual(L.F.api.map((x) => x.op), ['start', 'submit', 'submit'], 'مرّتان فقط ولا استطلاع');
  assert.equal(L.ctx.ER.paid, false, 'لم يُرسل شيء: غير مدفوع');
});

test('١٠د. جواب الإرسال الضائع لا يضيّع ما دُفع: الانقطاع وصفحة الخطأ وretry/busy تُعاد (الخادم لا يرسل مرّتين)، وما لم يُحسم يستطلعه الإرسال حتّى يُعرف (كان يُرمى بعد الأولى)؛ والحاسم بلا صرف يُقال ويرجع غير مدفوع', async () => {
  const RUN = { ok: true, state: 'running', chunks: [{ i: 0, state: 'running' }, { i: 1, state: 'running' }] };
  const go = (L) => L.ctx.erMake(vfile('a.mp4', 'video/mp4', 5000), [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', ++L.ctx.ER.run, () => {});
  const ops = (L) => L.F.api.map((x) => x.op);
  let n = 0, L = live({ replies: { submit: () => (++n === 1 ? 'NET' : n === 2 ? { ok: false, error: 'http', status: 504 } : RUN) } });
  let r = await go(L);
  assert.deepEqual([ops(L), r.n, r.some, L.ctx.ER.paid], [['start', 'submit', 'submit', 'submit', 'status', 'status'], 2, 0, true], 'انقطاع ثمّ صفحة خطأ ثمّ يصل');
  n = 0; L = live({ replies: { submit: () => (++n <= 6 ? (n % 2 ? { ok: false, error: 'busy' } : { ok: false, error: 'retry' }) : RUN) } });
  r = await go(L);
  assert.deepEqual([ops(L), r.n, L.ctx.ER.paid], [['start', 'submit', 'submit', 'submit', 'submit', 'submit', 'submit', 'submit', 'status', 'status'], 2, true], 'خمس بلا حسم ثمّ الاستطلاع يعيد الإرسال حتّى يُعرف ثمّ يسأل الحالة');
  L = live({ replies: { submit: { ok: false, error: 'cap', left: 0 } } });
  await assert.rejects(go(L), (e) => e.code === 'cap');
  assert.deepEqual([ops(L), L.ctx.ER.paid], [['start', 'submit'], false], 'السقف عند الإرسال: حاسم بلا صرف (الخادم ردّ حجزه)');
  n = 0; L = live({ replies: { submit: () => (++n <= 5 ? 'NET' : { ok: false, error: 'not_found' }) } });
  await assert.rejects(go(L), (e) => e.code === 'ai');
  assert.deepEqual([ops(L), L.ctx.ER.paid], [['start', 'submit', 'submit', 'submit', 'submit', 'submit', 'submit'], false], 'زالت المهمّة أثناء الانتظار: يُقال لا نصف ساعة على عمًى');
  L = live({ replies: { submit: { ok: false, error: 'auth' } } });
  await assert.rejects(go(L), (e) => e.code === 'ai');
  assert.deepEqual(ops(L), ['start', 'submit'], 'رفض الرمز بلا جواب ضائع قبله: لم يُرسل شيء — يُقال فورًا');
  n = 0; L = live({ replies: { submit: () => (++n === 1 ? 'NET' : n === 2 ? { ok: false, error: 'auth' } : n === 3 ? { ok: false, error: 'owner_only' } : n === 4 ? { ok: false, error: 'unavailable' } : RUN) } });
  r = await go(L);
  assert.deepEqual([ops(L), r.n, r.some, L.ctx.ER.paid], [['start', 'submit', 'submit', 'submit', 'submit', 'submit', 'status', 'status'], 2, 0, true], 'بعد جواب ضائع: رفض الرمز لا يقول شيئًا عن المهمّة (ربّما أرسلها الضائع) — يُعاد ولا يُترك ما دُفع (مراجعة ثانية)');
  n = 0; L = live({ replies: { submit: () => (++n === 1 ? 'NET' : n === 2 ? { ok: false, error: 'not_uploaded' } : { ok: false, error: 'auth' }) } });
  await assert.rejects(go(L), (e) => e.code === 'ai');
  assert.deepEqual([ops(L), L.ctx.ER.paid], [['start', 'submit', 'submit', 'submit'], false], '«لم تُرفع» تثبت أنّ الضائع لم يرسل: الرمز بعدها حاسم');
});

test('١٠هـ. نصف ساعة الانتظار من الإرسال لا من قبله: انقطاع ٦ د ثمّ إرسال ثمّ نموذج يأخذ ٢٦ د — النتائج تُجلب (كانت تُترك عند ٣٠ د من قبل الإرسال وقد دُفعت — مراجعة ثانية)، والحدّ نصف ساعة بعد الإرسال', async () => {
  const RUN = { ok: true, state: 'running', chunks: [{ i: 0, state: 'running' }, { i: 1, state: 'running' }] };
  const DONE = { ok: true, state: 'done', chunks: [{ i: 0, state: 'done', url: 'https://cdn.example/r0.mp4' }, { i: 1, state: 'done', url: 'https://cdn.example/r1.mp4' }] };
  for (const [late, takes, some] of [[6, 26, 0], [29.9, 1, 0], [6, 31, 2]]) {
    let clock = 0, sentAt = -1;
    const L = live({ replies: {
      submit: () => (clock < late * 60000 ? 'NET' : ((sentAt < 0 ? (sentAt = clock) : 0), RUN)),
      status: () => (clock - sentAt < takes * 60000 ? RUN : DONE),
    } });
    L.ctx.Date = { now: () => clock }; /* ساعة افتراضيّة: الانتظار يمضي بها */
    const st = L.ctx.setTimeout; L.ctx.setTimeout = (fn, ms) => { if (ms < 60000) clock += ms || 0; return st(fn, ms); }; /* انتظارات المسح وحدها: مهلة تحميل الأداة (١٢٠ ث) تُسجَّل ولا تمضي — كانت تزيح البدء دقيقتين فينجح القديم صدفةً (طفرة) */
    const r = await L.ctx.erMake(vfile('a.mp4', 'video/mp4', 5000), [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], 'ai', ++L.ctx.ER.run, () => {});
    assert.deepEqual([r.some, r.n, L.F.fetched.length], [some, 2, 2 - some], 'إرسال عند ' + late + ' د ونموذج ' + takes + ' د');
    assert.ok(sentAt >= late * 60000 && clock - sentAt <= 30 * 60000 + 8000, 'الحدّ نصف ساعة بعد الإرسال: ' + (clock - sentAt));
  }
});

test('١٠ج. الأزرار: الصفّ للمرفوع المعروض وحده، والمسح معطّل بلا مربّع أو أثناء عمل أو بعد رفعه للنشر، و«رجّع الأصل» للممسوح وحده، وزرّ الذكاء بلا سعر (الموافقة تقوله)؛ والنشر والباركود معطّلان أثناء المسح', async () => {
  const { ctx, els, calls } = flow();
  const box = { querySelector: (q) => els[q.slice(1)] };
  ctx.upPick(vfile('a.mp4', 'video/mp4')); await flush();
  ctx.erSync(box);
  assert.deepEqual([els.vdErRow.hidden, els.vdErBtn.disabled, els.vdErFree.disabled, els.vdErAi.disabled, els.vdErUndo.hidden], [false, false, true, true, true]);
  ctx.ER.dur = 13; ctx.ER.boxes = [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }]; ctx.erSync(box);
  assert.deepEqual([els.vdErFree.disabled, els.vdErAi.disabled, els.vdErAi.textContent], [false, false, 'vdErAi'], 'بلا سعر: الإطارات لا تُعرف قبل الفحص (٦٠ إطارًا = ضعف تقدير ٣٠) — الموافقة تقول العدد والسعر الحقيقيّين');
  ctx.PB.vid = 'x'; ctx.erSync(box); assert.deepEqual([els.vdErBtn.disabled, els.vdErFree.disabled], [true, true], 'رُفع للنشر'); ctx.PB.vid = '';
  ctx.erStart('free'); await flush(); ctx.erSync(box);
  assert.deepEqual([els.vdErBtn.disabled, els.vdErFree.disabled, els.vdErAi.disabled], [true, true, true], 'أثناء المسح');
  calls.shift().res({ file: vfile('a-clean.mp4', 'video/mp4'), some: 0, n: 0 }); await flush(); ctx.erSync(box);
  assert.deepEqual([els.vdErUndo.hidden, els.vdErBtn.disabled], [false, false], 'الممسوح معروض: «رجّع الأصل»');
  ctx.DR.out = 'blob:other'; ctx.erSync(box);
  assert.equal(els.vdErRow.hidden, true, 'فيديو المخرج معروض لا المرفوع: لا صفّ');
  const sync = V.slice(V.indexOf('function syncDirector(){'), V.indexOf('var ST={t0:0'));
  assert.ok(sync.includes("if(ER.busy){ pg.disabled=true; if(ec){ ec.disabled=true; eb.classList.add('off'); } }") && sync.includes('erSync(box);'), 'النشر والباركود معطّلان أثناء المسح');
});

test('١١. الواجهة: الصفّ بين خيار الباركود ورسالته والمحرّر داخل الفيديو قبل أزراره، والأزرار مربوطة، والنصوص الـ٢١ بالـ١٤ لغة بلا اسم مزوّد، والوسوم مرفوعة', () => {
  const html = V.slice(V.indexOf("box.innerHTML='<div class=\"vmk-dir-head\">"), V.indexOf("var tabs=id('vmkTabs'); if(tabs&&tabs.parentNode===card)"));
  const iEc = html.indexOf('id="vdEcBox"'), iEr = html.indexOf('<div class="vmk-dir-er" id="vdErRow" hidden>'), iMsg = html.indexOf('id="vdUpMsg"');
  assert.ok(iEc > 0 && iEr > iEc && iMsg > iEr, 'بين الخيار ورسالته');
  const iVid = html.indexOf('<video id="vdVideo" controls playsinline></video>'), iEd = html.indexOf('<div class="vmk-er" id="vdEr" hidden>'), iActs = html.indexOf('<div class="vmk-dir-acts">');
  assert.ok(iVid > 0 && iEd > iVid && iActs > iEd, 'المحرّر بين الفيديو وأزراره');
  for (const k of ['vdErBtn', 'vdErUndo', 'vdErFree', 'vdErAi', 'vdErClear', 'vdErClose', 'vdErCv', 'vdErT']) assert.ok(html.includes('id="' + k + '"'), k);
  assert.ok(html.includes('<button type="button" id="vdErUndo" hidden></button><small class="vmk-er-note" id="vdErNote"></small></div>'), 'الملاحظة في الصفّ تحت الزرّ');
  assert.ok(V.includes("erBind(box); /* v-director-erase */"));
  const css = read('css/modules.css');
  for (const c of ['#videoMakerModal .vmk-dir-er{', '#videoMakerModal .vmk-er canvas{display:block;width:100%;max-width:760px;height:auto;', 'touch-action:none', 'html[data-mode="light"] #videoMakerModal .vmk-er{', '#videoMakerModal .vmk-er-note{', '#videoMakerModal .vmk-er-note:empty{display:none}', 'html[data-mode="light"] #videoMakerModal .vmk-er-note.err{']) assert.ok(css.includes(c), c);
  const KEYS = ['vdErBtn', 'vdErUndo', 'vdErHint', 'vdErFree', 'vdErAi', 'vdErClear', 'vdErClose', 'vdErNeedBox', 'vdErWork', 'vdErUp', 'vdErWait', 'vdErJoin', 'vdErDone', 'vdErSome', 'vdErFail', 'vdErHeavy', 'vdErCap', 'vdErConfirm', 'vdErLose', 'vdErNoFrame', 'vdErLong'];
  const BANNED = /claude|anthropic|gemini|google|\bgpt|openai|runway|\bveo\b|kling|minimax|\bluma\b|\bsora\b|upload-?post|\bfal\b|\bvoid\b|netflix|bria/i;
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(read('js/app-03-i18n-data.js'), base);
  for (const lg of ['ar', 'en']) for (const k of KEYS) { const t = base.I18N[lg][k]; assert.ok(t && t.length > 3, lg + ' ' + k); assert.doesNotMatch(t, BANNED, lg + ' ' + k); }
  assert.equal(base.I18N.ar.vdErBtn, 'امسح اسم أو كتابة من الفيديو', 'كلمة المالك');
  const seen = new Set();
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) {
    const m = read('i18n/' + lg + '.js').match(/v-director-erase \(797\)[^\n]*Object\.assign\(I18N\["(\w+)"\], (\{.*\})\);/);
    assert.ok(m && m[1] === lg, lg + ' كتلة الترجمة');
    const o = JSON.parse(m[2]);
    assert.deepEqual(Object.keys(o), KEYS, lg + ' المفاتيح');
    for (const k of KEYS) {
      assert.ok(o[k] && o[k].trim().length > 1, lg + ' ' + k); /* «关闭» حرفان */ assert.doesNotMatch(o[k], BANNED, lg + ' ' + k);
      assert.equal((o[k].match(/\{\w+\}/g) || []).sort().join(), (base.I18N.en[k].match(/\{\w+\}/g) || []).sort().join(), lg + ' ' + k + ' المتغيّرات');
      assert.notEqual(o[k], base.I18N.en[k], lg + ' ' + k + ' مترجم لا منسوخ');
    }
    seen.add(o.vdErBtn);
  }
  assert.equal(seen.size, 12, 'ترجمات لا نسخ');
  const used = new Set([...V.matchAll(/(?:L|drT|erSay|up)\('(vdEr\w+)'/g)].map((m) => m[1]));
  for (const k of ['vdErUp', 'vdErWait', 'vdErJoin', 'vdErWork']) assert.ok(V.includes("'" + k + "'"), k);
  assert.deepEqual([...new Set([...used, 'vdErUp', 'vdErWait', 'vdErJoin', 'vdErWork'])].sort(), [...KEYS].sort(), 'كلّ نصّ مستعمل معرَّف، وكلّ معرَّف مستعمل');
  const tg = /\.js\?v=(\d+)';[^\n]* v-director-erase \((\d+)\): [^\n]*\*\//.exec(read('js/app-04-i18n-state.js')); /* بلا رقم حرفيّ بعد ?v= (سقّاطة vPinTests)؛ السبب آخر التعليق (hw-resubmit يثبّت أوّله) */
  assert.ok(tg && Number(tg[1]) >= Number(tg[2]) && Number(tg[2]) === 797, 'وسم اللغات مرفوع وسببه في التعليق');
  const h = read('index.html');
  assert.ok(Number((/\/js\/video\.js\?v=(\d+)"/.exec(h) || [])[1]) >= 469 && Number((/css\/modules\.css\?v=(\d+)"/.exec(h) || [])[1]) >= 700, 'وسما video.js وmodules.css');
});

test('١٢. العميل والخادم على عقد واحد: /api/media?action=video-erase بثلاث عمليّات، والموجِّه يعرفه، والنتيجة عبر وسيط التنزيل لا مباشرة', () => {
  assert.ok(V.includes("fetch('/api/media?action=video-erase&op='+op"), 'الموجّه');
  for (const op of ["erApi('start'", "erApi('submit'", "var op=String(res&&res.state)==='upload'?'submit':'status';", 'var r2=await erApi(op,{id:st.id})']) assert.ok(V.includes(op), op); /* الاستطلاع: الحالة، أو الإرسال ما دام لم يُحسم (٥ و١٠د سلوكًا) */
  assert.ok(/case 'video-erase':\s*return require\('\.\/_lib\/video-erase\.js'\)/.test(read('api/media.js')), 'api/media.js يوجّه video-erase');
  assert.ok(!/fetch\(\s*(urls\[i\]|u)\s*[,)]/.test(V.slice(V.indexOf('async function erFetch('), V.indexOf('async function erFrames('))), 'لا جلب لرابط المزوّد مباشرة');
});

// ── مراجعة مستقلّة قبل الدمج (٧ ثبتت) ──
test('١٣. الرفض أو الفشل يعيد الباركود الذي أوقفه المسح (كان يُنسى والخيار مؤشَّر فيُنشر بدونه)، والمضاف قبل المسح لا يُعاد', async () => {
  for (const code of ['declined', 'enc']) {
    const { ctx, calls } = flow({ card: true });
    const f = vfile('a.mp4', 'video/mp4');
    ctx.upPick(f); await flush();
    assert.deepEqual(calls.map((c) => !!c.ec), [true], 'الباركود بدأ');
    ctx.ER.boxes = [{ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }];
    const p = ctx.erStart('ai'); await flush();
    assert.deepEqual(calls.map((c) => !!c.ec), [true, false], 'المسح بدأ');
    const stale = calls.shift();
    assert.notEqual(stale.my, ctx.EC.run, 'وأوقف الباركود');
    calls.shift().rej({ code }); await p; await flush();
    assert.deepEqual(calls.map((c) => !!c.ec), [true], code + ': الباركود يرجع');
    assert.equal(calls[0].file, f, 'على الأصل'); assert.equal(calls[0].my, ctx.EC.run, 'تشغيلة جديدة');
    calls.shift().res(vfile('a-om-ai.mp4', 'video/mp4')); await flush();
    assert.equal(ctx.DR.out, ctx.EC.out.url, 'وانتهى فصار المعروض');
  }
  const { ctx, calls, els } = flow({ card: true });
  ctx.upPick(vfile('b.mp4', 'video/mp4')); await flush();
  calls.shift().res(vfile('b-om-ai.mp4', 'video/mp4')); await flush();
  const card = ctx.DR.out;
  ctx.ER.boxes = [{ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }];
  const p = ctx.erStart('free'); await flush();
  calls.shift().rej({ code: 'enc' }); await p; await flush();
  assert.deepEqual([calls.length, ctx.DR.out, els.vdUpMsg.textContent, ctx.ER.note && ctx.ER.note.t], [0, card, '', 'vdErFail'], 'المعروض بباركوده بلا إعادة، و«أُضيف» لا يغطّي الفشل، والفشل في الملاحظة وحدها');
});

test('١٤. ملاحظة المسح تبقى تحت الزرّ: «ما رجع كلّه» لا تمحوها رسالة الباركود بعدها، والخطأ أحمر، و«رجّع الأصل» والمسح الجديد والملفّ الجديد يمسحونها', async () => {
  const { ctx, els, calls } = flow({ card: true });
  const box = { querySelector: (q) => els[q.slice(1)] };
  const take = (ec) => calls.splice(calls.findIndex((c) => !!c.ec === ec), 1)[0];
  const note = () => { ctx.erSync(box); return [els.vdErNote.textContent, els.vdErNote.className]; };
  ctx.upPick(vfile('a.mp4', 'video/mp4')); await flush();
  take(true).res(vfile('a-om-ai.mp4', 'video/mp4')); await flush();
  ctx.ER.boxes = [{ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }];
  let p = ctx.erStart('ai'); await flush();
  take(false).res({ file: vfile('a-clean.mp4', 'video/mp4'), some: 1, n: 3 }); await p; await flush();
  assert.equal(els.vdUpMsg.textContent, 'vdEcWork {"p":0}', 'رسالة الباركود غطّت رسالة المسح فورًا');
  assert.deepEqual(note(), ['vdErSome {"f":1,"n":3}', 'vmk-er-note'], 'والملاحظة باقية تحت الزرّ');
  take(true).res(vfile('a-clean-om-ai.mp4', 'video/mp4')); await flush();
  assert.deepEqual(note()[0], 'vdErSome {"f":1,"n":3}', 'وبعد انتهاء الباركود');
  ctx.erUndo(); await flush();
  assert.deepEqual(note(), ['', 'vmk-er-note'], '«رجّع الأصل» يمسحها');
  p = ctx.erStart('ai'); await flush();
  take(false).rej({ code: 'cap' }); await p; await flush();
  assert.deepEqual(note(), ['vdErCap', 'vmk-er-note err'], 'الخطأ أحمر');
  p = ctx.erStart('free'); await flush();
  assert.deepEqual(note()[0], '', 'مسح جديد يمسحها');
  take(false).rej({ code: 'enc' }); await p; await flush();
  assert.deepEqual(note()[0], 'vdErFail');
  ctx.upPick(vfile('b.mp4', 'video/mp4')); await flush();
  assert.deepEqual(note()[0], '', 'ملفّ جديد يمسحها');
  // بلا باركود: النتيجة لا تتكرّر — الجزئيّ والخطأ في الملاحظة وحدها، والكامل في رسالة الصندوق وحدها (كانت مرّتين — مراجعة ثانية)
  const F2 = flow(), e2 = F2.els, b2 = { querySelector: (q) => e2[q.slice(1)] };
  F2.ctx.upPick(vfile('c.mp4', 'video/mp4')); await flush();
  F2.ctx.ER.boxes = [{ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }];
  for (const [res, msg, nt] of [[{ some: 1, n: 3 }, '', 'vdErSome {"f":1,"n":3}'], [{ some: 0, n: 3 }, 'vdErDone', ''], [null, '', 'vdErFail']]) {
    p = F2.ctx.erStart('ai'); await flush();
    const c = F2.calls.splice(F2.calls.findIndex((x) => !x.ec), 1)[0];
    if (res) c.res(Object.assign({ file: vfile('c-clean.mp4', 'video/mp4') }, res)); else c.rej({ code: 'enc' });
    await p; await flush(); F2.ctx.erSync(b2);
    assert.deepEqual([e2.vdUpMsg.textContent, e2.vdErNote.textContent], [msg, nt], JSON.stringify(res));
    if (F2.ctx.ER.out) { F2.ctx.erUndo(); await flush(); }
  }
});

const probe = (dur, fps) => "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/erin/input':\n  Duration: " + dur + ", start: 0.000000, bitrate: 1000 kb/s\n"
  + '  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, progressive), 1280x720 [SAR 1:1 DAR 16:9], 900 kb/s, ' + fps + ' fps, ' + fps + ' tbr, 15360 tbn (default)\n'
  + '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)\n';
test('١٥. فوق حدّ المقاطع (٣٠) يُقال قبل ترميز الشريط وبرسالته، بمدّة دفق الفيديو نفسه لا الحاوية (صوت أطول كان يرفض فيديو يسعه الحدّ — مراجعة ثانية) وبلا تمريرة زائدة ما دامت الحاوية تحت الحدّ؛ والمجّانيّ بلا حدّ مقاطع', async () => {
  const boxes = [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], go = (L, mode) => L.ctx.erMake(vfile('a.mp4', 'video/mp4', 5000), boxes, mode || 'ai', ++L.ctx.ER.run, () => {});
  let L = live({ probe: probe('00:01:40.00', 60), inputFrames: 6000, inputFps: 60 });
  await assert.rejects(go(L), (e) => e.code === 'long');
  assert.deepEqual([steps(L.F), L.F.api.length, L.ctx.confirms.length], [['probe', 'count:/erin/input'], 0, 0], 'الفيديو نفسه ١٠٠ ث بـ٦٠ (٣١ مقطعًا): تمريرة عدّ بلا فكّ ثمّ الرسالة — لا شريط ولا شبكة ولا موافقة');
  L = live({ probe: probe('00:01:40.00', 60), inputFrames: 5400, inputFps: 60 });
  await go(L);
  assert.deepEqual([steps(L.F).slice(0, 3), L.ctx.confirms.length], [['probe', 'count:/erin/input', 'band'], 1], 'الحاوية ١٠٠ ث (صوت أطول) والفيديو ٩٠ ث (٢٨ مقطعًا): يمضي إلى الموافقة');
  for (const [k, early] of [[5913, true], [5912, false]]) { /* الطرف: المدّة حتّى نهاية آخر حزمة (٥٩١٣ = ٣١ مقطعًا يُقال مبكّرًا؛ ٥٩١٢ في سماح الإطارين يمضي) */
    L = live({ probe: probe('00:01:38.55', 60), inputFrames: k, inputFps: 60 });
    if (early) { await assert.rejects(go(L), (e) => e.code === 'long'); assert.deepEqual(steps(L.F), ['probe', 'count:/erin/input'], k); } else { await go(L); assert.equal(steps(L.F)[2], 'band', k); }
  }
  /* من صفر الحاوية كما يعدّ الشريط (مراجعة ثالثة): فيديو يبدأ بعد ٦ إطارات (٥٩٠٨ حزمة تنتهي عند ٥٩١٤ = ٣١ مقطعًا) يُقال مبكّرًا — كان يُحسب
     ٥٩٠٨ فيُرمَّز الشريط كلّه ثمّ يُقال؛ وحزم قبل الصفر لا تدخل الشريط فلا تُعدّ (٥٩١٤ حزمة من −٤ تنتهي عند ٥٩١٠ = ٣٠ مقطعًا يمضي) */
  L = live({ probe: probe('00:01:38.57', 60), inputFrames: 5908, inputFps: 60, inputStart: 6 });
  await assert.rejects(go(L), (e) => e.code === 'long');
  assert.deepEqual(steps(L.F), ['probe', 'count:/erin/input'], 'يبدأ متأخّرًا: يُقال قبل الشريط');
  L = live({ probe: probe('00:01:40.00', 60), inputFrames: 5914, inputFps: 60, inputStart: -4 });
  await go(L);
  assert.equal(steps(L.F)[2], 'band', 'حزم قبل الصفر لا تُعدّ: يمضي');
  L = live({ probe: probe('00:01:38.52', 60), inputFrames: 5910, inputFps: 60 });
  await go(L);
  assert.equal(steps(L.F)[1], 'band', 'عند الحدّ بالضبط (٣٠×١٩٧) وصوت أطول بـ٢٠ م.ث: سماح إطارين — بلا تمريرة');
  L = live({ probe: probe('00:01:38.00', 60) });
  await go(L);
  assert.equal(steps(L.F)[1], 'band', '٩٨ ث بـ٦٠: الحاوية تحت الحدّ — بلا تمريرة عدّ');
  L = live({ probe: probe('00:02:59.00', 30) });
  await go(L);
  assert.equal(steps(L.F)[1], 'band', '٣٠ إطارًا: حدّ الحاسوب (١٨٠ ث) قبل حدّ المقاطع');
  L = live({ probe: probe('00:01:40.00', 60), broken: ['/erin/input'] });
  await go(L);
  assert.deepEqual(steps(L.F).slice(0, 3), ['probe', 'count:/erin/input', 'band'], 'تعذّر العدّ: لا رفض مبكّر — الفحص بعد الترميز يكفي');
  L = live({ probe: probe('00:01:40.00', 60), inputFrames: 6000, inputFps: 60 });
  const r = await go(L, 'free');
  assert.deepEqual([L.F.execs.length, r.file.name], [2, 'a-clean.mp4'], 'المجّانيّ بلا حدّ مقاطع ولا تمريرة');
  assert.ok(V.includes("code==='long'?L('vdErLong')"), 'رسالته');
});

test('١٦. القناع الناعم: الحافّة كلّها خارج المربّع — التعبئة تكبر ٢٫٥σ فأضلاع المربّع ≥ ٩٩٪ (كانت σ وحدها: ٨٤٪ وحرف عليها يطلّ)', async () => {
  const { ctx } = panel();
  const ops = [];
  ctx.document.createElement = (tag) => {
    const el = mkEl(tag);
    el.getContext = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => ops.push([k, ...a, t.filter || '', t.fillStyle])), set: (t, k, v) => { t[k] = v; return true; } });
    return el;
  };
  ctx.ecPng = async (c) => c;
  for (const [W, H, boxes] of [[640, 360, [{ x: 0.3, y: 0.4, w: 0.3, h: 0.15 }]], [1080, 1920, [{ x: 0.05, y: 0.85, w: 0.9, h: 0.06 }, { x: 0.7, y: 0.02, w: 0.25, h: 0.05 }]]]) {
    ops.length = 0;
    const B = ctx.erBand(boxes, W, H), c = await ctx.erAlphaPng(B, W, H);
    assert.deepEqual([c.width, c.height], [W, H]);
    const sigma = Math.max(1, Math.round(Math.min(W, H) * 0.012));
    const fills = ops.filter((o) => o[0] === 'fillRect' && o[6] === '#fff');
    assert.equal(fills.length, B.rects.length);
    fills.forEach((o, i) => {
      const r = B.rects[i];
      assert.equal(o[5], 'blur(' + sigma + 'px)');
      for (const e of [r.x * W - o[1], r.y * H - o[2], o[1] + o[3] - (r.x + r.w) * W, o[2] + o[4] - (r.y + r.h) * H]) assert.ok(e >= 2.5 * sigma - 1e-9, W + 'x' + H + ' هامش ' + e + ' < ٢٫٥σ=' + 2.5 * sigma);
    });
  }
});

test('١٧. التوليد في المخرج (الزرّ وCtrl+Enter والمخطّط الزمنيّ) لا يضيّع مسحًا مدفوعًا جاريًا بلا سؤال — السؤال قبل أيّ أثر', () => {
  for (const [from, to] of [['async function drRun(){', 'var my=++DR.run, tk=drTok();'], ['async function drTimedRun(){', "if(!window.confirm(drT('vdTlConfirm'"]]) {
    const a = V.indexOf(from), b = V.indexOf(to, a), body = V.slice(a, b);
    assert.ok(a > 0 && b > a, from);
    const g = body.indexOf("if(ER.busy&&ER.paid&&!window.confirm(L('vdErLose'))) return;");
    assert.ok(g > 0, from + ': السؤال');
    assert.doesNotMatch(body.slice(g), /DR\.run|upEnd\(|DR\.busy=true|drReset\(/, from + ': قبل أيّ أثر');
  }
});
