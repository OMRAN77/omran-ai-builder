'use strict';
/* v-trend-face-swap — المالك ٢٥ أكتوبر: «صلحة الاشكال الملامح». Omni يحفظ وجه الإطار الأوّل، وبرو يعيد رسم الوجه وهو يبنيه؛ فبعد
   بناء الإطار خطوة تبديل وجه (face-swap.lockFaces) مطفأة افتراضيًّا. يثبت هذا الملفّ (بلا أيّ نداء مدفوع — fetch مزيّف وصور مصنوعة):
   ١) البوّابات: مطفأة/بلا مفتاح/«المالك» لغير المالك/فنّيّ/عمر آخر = لا نداء والبايتات نفسها؛ وveo-create مطفأً = الخيارات كما كانت.
   ٢) المسار السعيد: مستطيل القصّة (الرأس بشعره) وحده يتغيّر بحافة ناعمة، وشكل الطلب، وإشارة مهلة، وترميز JPEG واحد، والذاكرة تعيد الإطار المبدَّل.
   ٣) الربط بالمرجع لا بالموضع، والزومبي نداء واحد، و«من ينقذك؟» نداءان. ٤) الربط الملتبس = صفر نداءات.
   ٥) أعطال المزوّد = الإطار نفسه، والحجز يُردّ لما لم يُنتجه المزوّد وحده. ٦) الميزانيّة والسقف. ٧) التحميل ببيئة فارغة، والسجلّ بلا مفتاح.
   ٨) قصّة Picture 1 لا تحمل وجهًا آخر (بلا مرجع أو غير متأكّد). ٩) الزومبي بشخصين من صورة واحدة = لا تبديل (لا دور معروف).
   v-trend-hair-lock (١٥–٢٠): أمر الـLoRA الرسميّ ولصق القصّة كلّها (الرأس بشعره)، ونصّ رفض المزوّد في السبب، وصورة واحدة لا تُطابَق بشعر
   ولبس رسمهما الإطار، وإعادة تبديل فشل عابر من الذاكرة، وسجلّ المالك لكلّ تخطٍّ، والوجه الوحيد لمشهد صاحبه وحده (لا الزومبي)، وقبّعة المشهد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
for (const k of ['TREND_FACE_SWAP', 'FAL_KEY', 'FACE_SWAP_MODEL', 'FACE_SWAP_LORA', 'FACE_SWAP_CAP_CENTS', 'TREND_ENGINE', 'MERGE_FACE_CROPS']) delete process.env[k];
process.env.AUTH_SECRET = 'face-swap-test-secret';
process.env.GEMINI_API_KEY = 'gm-face-swap-test';
const FAL = 'fal-secret-test-key-123';
const GKEY = 'gm-face-swap-test';

/* ── وحدات veo-create المزيّفة (كما trend-omni) — قبل أيّ require يصلها ── */
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kvStore = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kvStore.has(k) ? String(kvStore.get(k)) : null,
  kvSetRaw: async (k, v) => { kvStore.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kvStore.has(k)) return false; kvStore.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kvStore.get(k) || 0) + Number(n); kvStore.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kvStore.get(k) || 0) - Number(n); kvStore.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kvStore.has(k) ? JSON.parse(kvStore.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kvStore.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kvStore.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kvStore.get(k) || 0) + 1; kvStore.set(k, String(v)); return v; }, kvList: async () => [],
  kvPipeline: async (cmds) => cmds.map(([op, k, v]) => { if (op === 'INCRBY') { const x = Number(kvStore.get(k) || 0) + Number(v); kvStore.set(k, String(x)); return x; } kvStore.set(k, String(v)); return 'OK'; }),
});
mock('api/_lib/auth.js', { getUser: async () => null, getUserOnce: async () => null, putUser: async () => {}, isBanned: async () => false, verifyToken: () => null });
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/abuse-guard.js', { videoLock: async () => ({ ok: true }), releaseVideoLock: async () => {}, videoCooldownLeft: async () => 0, imageHourlyGuard: async () => ({ ok: true }) });
/* v-trend-hair-lock: سجلّ المالك مزيّف — كلّ سطر [الموضع، الرسالة] */
const notes = [];
mock('api/_lib/log-error.js', {
  logError: (scope, err) => { notes.push([scope, String((err && err.message) || err)]); },
  logErrorAndFlush: async (scope, err) => { notes.push([scope, String((err && err.message) || err)]); },
});

const FS = require(rp('api/_lib/face-swap.js'));
const TP = require(rp('api/_lib/trend-people.js'));
const FC = require(rp('api/_lib/face-composite.js'));

/* ── صور مصنوعة ── */
function png(w, h, fill) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) { const c = typeof fill === 'function' ? fill(i % w, Math.floor(i / w)) : fill; p.data[i * 4] = c[0]; p.data[i * 4 + 1] = c[1]; p.data[i * 4 + 2] = c[2]; p.data[i * 4 + 3] = 255; }
  return PNG.sync.write(p);
}
const jpg = (w, h, c) => Buffer.from(jpeg.encode({ width: w, height: h, data: Buffer.from(new Array(w * h).fill(c.concat(255)).flat()) }, 90).data);
const W = 1024, H = 1024;
const GRAY = [128, 128, 128];
const FRAME = png(W, H, GRAY).toString('base64');
const REF_A = jpg(64, 64, [200, 40, 40]).toString('base64');
const REF_B = jpg(64, 64, [40, 200, 40]).toString('base64');
const PHOTO = png(400, 400, [90, 90, 160]).toString('base64');
const decode = (b64) => FC.decode(Buffer.from(b64, 'base64'));
const px = (img, x, y) => { const i = (y * img.w + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const near = (a, b, t) => a.every((v, i) => Math.abs(v - b[i]) <= t);
/* صندوقا وجهين: يسار ويمين (ymin,xmin,ymax,xmax من ٠–١٠٠٠) */
const LEFT = [300, 150, 500, 350], RIGHT = [300, 650, 500, 850], CENTER = [300, 400, 500, 600];

/* ── fetch مزيّف: Flash يعيد faces، وfal يعيد صورة PNG بلون يحدّده المرجع ── */
function stub(o) {
  const calls = { flash: [], fal: [], other: [] };
  const f = async (url, init) => {
    const u = String(url);
    if (u.includes('generativelanguage.googleapis.com')) {
      calls.flash.push({ url: u, body: JSON.parse(init.body), signal: init.signal });
      if (o.flash && o.flash.throw) throw o.flash.throw;
      if (o.flash && o.flash.status) return new Response('{}', { status: o.flash.status });
      const text = o.flash && o.flash.raw != null ? o.flash.raw : JSON.stringify(Object.assign({ faces: (o.faces || []) }, o.others === null ? {} : { others: o.others || [] })); // others: null = شكل الجواب القديم
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
    }
    if (u.startsWith('https://fal.run/')) {
      const body = JSON.parse(init.body);
      const call = { url: u, headers: init.headers, body, signal: init.signal };
      calls.fal.push(call);
      const r = o.fal ? await o.fal(call, calls.fal.length - 1) : null;
      if (r) return r;
      const color = body.image_urls[1].endsWith(REF_B) ? [0, 220, 0] : [230, 0, 0];
      return falImage(png(body.image_size.width, body.image_size.height, color));
    }
    calls.other.push(u);
    return new Response('{}', { status: 404 });
  };
  return { f, calls };
}
const falImage = (buf, mime) => new Response(JSON.stringify({ images: [{ url: 'data:' + (mime || 'image/png') + ';base64,' + buf.toString('base64') }] }), { status: 200 });
function fakeKv(start) {
  const m = new Map(); if (start != null) m.set('spent', start);
  const day = () => 'faceswap:spent:' + new Date().toISOString().slice(0, 10);
  return {
    m, spent: () => Number(m.get(day()) || 0),
    kvIncrBy: async (k, n) => { const v = Number(m.get(k) || (start || 0)) + n; m.set(k, v); return v; },
    kvDecrBy: async (k, n) => { const v = Number(m.get(k) || 0) - n; m.set(k, v); return v; },
    kvExpire: async () => {},
  };
}
function on(extra) { process.env.TREND_FACE_SWAP = 'on'; process.env.FAL_KEY = FAL; Object.assign(process.env, extra || {}); }
function off() { for (const k of ['TREND_FACE_SWAP', 'FAL_KEY', 'FACE_SWAP_MODEL', 'FACE_SWAP_LORA', 'FACE_SWAP_CAP_CENTS']) delete process.env[k]; }
const swapRun = (refs, o, faces, extra) => {
  const s = stub(Object.assign({ faces }, extra || {}));
  const kv = (extra && extra.kv) || fakeKv();
  return FS.lockFaces({ b64: FRAME, mime: 'image/png' }, refs, Object.assign({ apiKey: GKEY, until: Date.now() + 120000, owner: true, fetchImpl: s.f, kv }, o))
    .then((r) => ({ r, calls: s.calls, kv }));
};
/* v-trend-hair-lock: صندوق كلّ بكسل تغيّر عن الرماديّ (سماح ترميز JPEG) — يساوي مستطيل القصّة الملصوق */
function changedBox(img) {
  const b = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (near(px(img, x, y), GRAY, 6)) continue;
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
  }
  return b;
}
const center = (b) => [Math.round((b[1] + b[3]) / 2000 * W), Math.round((b[0] + b[2]) / 2000 * H)];

test('١. البوّابات: مطفأة، بلا مفتاح، «المالك» لغير المالك = لا نداء والبايتات نفسها؛ والوحدة تُحمَّل ببيئة فارغة', async () => {
  off();
  let x = await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], {}, [{ ref: 0, box_2d: CENTER, sure: true }]);
  assert.equal(x.r.b64, FRAME); assert.equal(x.r.swapped, 0); assert.equal(x.r.reason, 'off');
  assert.equal(x.calls.flash.length + x.calls.fal.length, 0);
  process.env.TREND_FACE_SWAP = 'on';
  x = await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], {}, [{ ref: 0, box_2d: CENTER, sure: true }]);
  assert.equal(x.r.b64, FRAME); assert.equal(x.r.reason, 'no-key'); assert.equal(x.calls.flash.length + x.calls.fal.length, 0);
  on({ TREND_FACE_SWAP: 'owner' });
  x = await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], { owner: false }, [{ ref: 0, box_2d: CENTER, sure: true }]);
  assert.equal(x.r.b64, FRAME); assert.equal(x.r.reason, 'not-owner'); assert.equal(x.calls.flash.length + x.calls.fal.length, 0);
  assert.equal(FS.enabledFor(true), true); assert.equal(FS.enabledFor(false), false);
  process.env.TREND_FACE_SWAP = 'yes'; assert.equal(FS.mode(), 'off', 'قيمة غريبة = مطفأة');
  off();
  const env = { PATH: process.env.PATH };
  const out = require('node:child_process').spawnSync(process.execPath, ['-e', 'const m=require(' + JSON.stringify(rp('api/_lib/face-swap.js')) + ');console.log(m.mode(),m.enabledFor(true),m.capCents())'], { env, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr); assert.equal(out.stdout.trim(), 'off false 300');
});

test('٢. soloFirstFrame: الفنّيّ والعمر الآخر لا يُبدَّلان (لا نداء) — وبلا swap الإطار كما كان', async () => {
  on();
  for (const o of [{ artHint: true }, { ageShift: true }, { style: 'anime' }, {}]) {
    const s = stub({ faces: [{ ref: 0, box_2d: CENTER, sure: true }] });
    const r = await TP.soloFirstFrame('K', { data: PHOTO + 'x' + JSON.stringify(o), mime: 'image/png' }, 'a man in a souq', '720:1280',
      Object.assign({ faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }], callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s.f },
        o, Object.keys(o).length ? { swap: { until: Date.now() + 120000, owner: true, kv: fakeKv() } } : {}));
    assert.equal(r.b64, FRAME, JSON.stringify(o)); assert.equal(s.calls.flash.length + s.calls.fal.length, 0, JSON.stringify(o));
    assert.equal(r.swapped, undefined, 'لا حقل تبديل حين لا تبديل');
  }
  off();
});

test('٣. المسار السعيد (فرديّ): مستطيل القصّة وحده يتغيّر بحافة ناعمة، وشكل الطلب حرفيًّا، وإشارة مهلة، والذاكرة تعيد الإطار المبدَّل', async () => {
  on();
  const s = stub({ faces: [{ ref: 0, box_2d: CENTER, sure: true }] });
  const kv = fakeKv();
  let built = 0;
  const run = () => TP.soloFirstFrame('K', { data: PHOTO + 'happy', mime: 'image/png' }, 'a man in a souq', '720:1280', {
    faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }],
    callImage: async () => { built++; return { b64: FRAME, mime: 'image/png' }; }, fetchImpl: s.f, detail: true, hiRes: true,
    swap: { until: Date.now() + 120000, owner: true, kv } });
  const r = await run();
  assert.equal(r.swapped, 1); assert.equal(r.mime, 'image/jpeg'); assert.deepEqual(r.ref, { data: REF_A, mime: 'image/jpeg' }, 'مرجع Omni لقطة الوجه كما كان');
  assert.equal(s.calls.flash.length, 1, 'نداء ربط واحد'); assert.equal(s.calls.fal.length, 1);
  /* الربط: الإطار ثمّ المرجع، بلا موضع ولا جنس في الأمر */
  const fl = s.calls.flash[0];
  assert.ok(fl.url.includes('gemini-flash-latest') && fl.signal);
  const ftext = fl.body.contents[0].parts.filter((p) => p.text).map((p) => p.text).join('\n');
  assert.match(ftext, /never by left\/right order/); assert.match(ftext, /never by gender alone/);
  assert.equal(fl.body.contents[0].parts.filter((p) => p.inlineData)[1].inlineData.data, REF_A);
  /* شكل طلب المزوّد */
  const c = s.calls.fal[0];
  assert.equal(c.url, 'https://fal.run/fal-ai/flux-2/klein/9b/edit/lora');
  assert.equal(c.headers.Authorization, 'Key ' + FAL);
  assert.ok(c.signal, 'مهلة على النداء');
  assert.equal(c.body.prompt, FS.PROMPT);
  assert.match(c.body.prompt, /^head_swap: start with Picture 1 as the base image/);
  assert.equal(c.body.image_urls.length, 2);
  assert.match(c.body.image_urls[0], /^data:image\/jpeg;base64,/);
  assert.equal(c.body.image_urls[1], 'data:image/jpeg;base64,' + REF_A, 'Picture 2 = لقطة وجهه نفسها');
  assert.deepEqual(c.body.loras, [{ path: FS.LORA_DEFAULT, scale: 1 }]);
  assert.deepEqual(c.body.image_size, { width: 768, height: 768 }, 'قصّة موسّعة ٧٦٨ بلا تكبير');
  assert.deepEqual([c.body.output_format, c.body.sync_mode, c.body.enable_safety_checker, c.body.num_images], ['png', true, true, 1]);
  /* v-trend-hair-lock: مستطيل القصّة وحده يتغيّر (الرأس بشعره لا بيضاويّ الوجه) بحافة ناعمة ~١٠٪ من ضلعه؛ خارجه الرماديّ (سماح JPEG) */
  const img = decode(r.b64);
  assert.deepEqual([img.w, img.h], [W, H]);
  const [cx, cy] = center(CENTER);
  assert.ok(near(px(img, cx, cy), [230, 0, 0], 12), 'الوجه بُدّل: ' + px(img, cx, cy));
  const box = changedBox(img);
  assert.deepEqual([box.x1 - box.x0 + 1, box.y1 - box.y0 + 1].map((v) => v <= 768 && v >= 756), [true, true], 'المتغيّر = مستطيل القصّة ٧٦٨ (أطراف الحافة الخارجيّة دون سماح JPEG): ' + JSON.stringify(box));
  assert.ok(box.x0 > 0 && box.y0 > 0 && box.x1 < W - 1 && box.y1 < H - 1, 'القصّة داخل الإطار (حوافّها الأربع ناعمة)');
  /* الشعر فوق الوجه وما حوله من القصّة بُدّل كلّه — كان البيضاويّ يتركه */
  const fy0 = Math.round(CENTER[0] / 1000 * H);
  assert.ok(fy0 - box.y0 > 100, 'القصّة تمتدّ فوق الجبهة');
  assert.ok(near(px(img, cx, Math.round((box.y0 + fy0) / 2) + 40), [230, 0, 0], 12), 'فوق الجبهة (الشعر) بُدّل: ' + px(img, cx, Math.round((box.y0 + fy0) / 2) + 40));
  const edge = Math.round(768 * 0.1);
  assert.ok(near(px(img, box.x0 + edge + 6, cy), [230, 0, 0], 12) && near(px(img, box.x1 - edge - 6, cy), [230, 0, 0], 12), 'بعد الحافة لون المبدَّل كاملًا');
  const mid = px(img, box.x0 + Math.round(edge / 2), cy);
  assert.ok(!near(mid, GRAY, 20) && !near(mid, [230, 0, 0], 20), 'منتصف الحافة مزيج لا خطّ: ' + mid);
  let prev = -1, mono = true;
  for (let x = box.x0; x <= box.x0 + edge; x += 4) { const rr = px(img, x, cy)[0]; if (rr + 8 < prev) mono = false; prev = rr; }
  assert.ok(mono, 'الحافة تتدرّج من الإطار إلى المبدَّل');
  assert.equal(kv.spent(), 5, 'حجز وجه واحد');
  /* الذاكرة: النداء الثاني نفسه = الإطار المبدَّل بلا بناء ولا تبديل */
  const again = await run();
  assert.equal(again.cached, true); assert.equal(again.b64, r.b64); assert.equal(again.swapped, 1);
  assert.equal(built, 1); assert.equal(s.calls.fal.length, 1);
  off();
});

test('٤. ترميز JPEG واحد: إطار 2K كبير بصيغة PNG يُرمَّز مرّة واحدة في التبديل ولا يُعاد ترميزه', async () => {
  on();
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) >>> 16) & 255; // ضجيج ثابت لا يُضغط
  const big = png(1536, 1536, () => [rnd(), rnd(), rnd()]).toString('base64');
  assert.ok(big.length > 6000000, 'فوق FRAME_B64_MAX');
  const s = stub({ faces: [{ ref: 0, box_2d: CENTER, sure: true }] });
  const real = FC.encodeJpeg; let full = 0;
  FC.encodeJpeg = (img, q) => { if (img.w === 1536 && img.h === 1536) full++; return real(img, q); };
  let r;
  try {
    r = await TP.soloFirstFrame('K', { data: PHOTO + 'big', mime: 'image/png' }, 'a man at a wedding', '720:1280', {
      faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }],
      callImage: async () => ({ b64: big, mime: 'image/png' }), fetchImpl: s.f, detail: true, hiRes: true,
      swap: { until: Date.now() + 120000, owner: true, kv: fakeKv() } });
  } finally { FC.encodeJpeg = real; }
  assert.equal(r.swapped, 1); assert.equal(r.mime, 'image/jpeg'); assert.equal(full, 1, 'ترميز واحد للإطار كلّه');
  off();
});

test('٥. الربط بالمرجع لا بالموضع: المرجع ١ على اليسار يأخذ وجه صورته هو (إطار المجموعة)', async () => {
  on();
  const s = stub({ faces: [{ ref: 1, box_2d: LEFT, sure: true }, { ref: 0, box_2d: RIGHT, sure: true }] });
  const r = await TP.groupFirstFrame('K', [{ data: PHOTO, mime: 'image/png' }, { data: PHOTO + 'b', mime: 'image/png' }], 'two friends in a souq', '720:1280', {
    faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }, { of: 1, who: 'the person', data: REF_B, mime: 'image/jpeg' }],
    callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s.f, swap: { until: Date.now() + 120000, owner: true, kv: fakeKv() } });
  assert.equal(r.swapped, 2); assert.equal(s.calls.fal.length, 2);
  const img = decode(r.b64);
  assert.ok(near(px(img, ...center(LEFT)), [0, 220, 0], 14), 'اليسار = المرجع ١: ' + px(img, ...center(LEFT)));
  assert.ok(near(px(img, ...center(RIGHT)), [230, 0, 0], 14), 'اليمين = المرجع ٠: ' + px(img, ...center(RIGHT)));
  /* صورة بلا لقطة وجه: الربط نفسه يطلب ref_box، والقصّة منها */
  const s2 = stub({ faces: [{ ref: 0, box_2d: LEFT, sure: true, ref_box: [100, 100, 300, 300] }, { ref: 1, box_2d: RIGHT, sure: true }] });
  const r2 = await TP.groupFirstFrame('K', [{ data: PHOTO, mime: 'image/png' }, { data: PHOTO + 'c', mime: 'image/png' }], 'two friends in a souq', '720:1280', {
    faceCrops: async () => [{ of: 1, who: 'the person', data: REF_B, mime: 'image/jpeg' }],
    callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s2.f, swap: { until: Date.now() + 120000, owner: true, kv: fakeKv() } });
  assert.equal(r2.swapped, 2);
  assert.match(s2.calls.flash[0].body.contents[0].parts.map((p) => p.text || '').join(' '), /Reference 0 — a photo of a real person/);
  const p2 = s2.calls.fal.map((c) => c.body.image_urls[1]);
  assert.ok(p2.includes('data:image/jpeg;base64,' + REF_B) && p2.some((u) => u !== 'data:image/jpeg;base64,' + REF_B && /^data:image\/jpeg;base64,/.test(u)));
  /* المجموعة: الفنّيّ والعمر الآخر بلا تبديل، والعطب = الإطار نفسه */
  for (const o of [{ ageShift: true }, { art: true }]) {
    const s3 = stub({ faces: [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 1, box_2d: RIGHT, sure: true }] });
    const r3 = await TP.groupFirstFrame('K', [{ data: PHOTO, mime: 'image/png' }, { data: PHOTO, mime: 'image/png' }], 'x', '720:1280', Object.assign({ faceCrops: async () => [], callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s3.f, swap: { until: Date.now() + 120000, owner: true } }, o));
    assert.deepEqual(r3, { b64: FRAME, mime: 'image/png' }); assert.equal(s3.calls.flash.length, 0);
  }
  const s4 = stub({ flash: { status: 500 } });
  const r4 = await TP.groupFirstFrame('K', [{ data: PHOTO, mime: 'image/png' }, { data: PHOTO, mime: 'image/png' }], 'x', '720:1280', { faceCrops: async () => [], callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s4.f, swap: { until: Date.now() + 120000, owner: true, kv: fakeKv() } });
  assert.equal(r4.b64, FRAME); assert.equal(r4.swapped, 0);
  off();
});

test('٦. الزومبي نداء واحد (المرجع ٠ وحده)، و«من ينقذك؟» نداءان (نسختان منه)، والنسختان بلا multi = لبس', async () => {
  on();
  const two = [{ data: REF_A, mime: 'image/jpeg', face: true }, { data: REF_B, mime: 'image/jpeg', face: true }];
  let x = await swapRun(two, { only: [0] }, [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 1, box_2d: RIGHT, sure: false }]);
  assert.equal(x.calls.fal.length, 1); assert.equal(x.r.swapped, 1);
  assert.equal(x.calls.fal[0].body.image_urls[1], 'data:image/jpeg;base64,' + REF_A);
  x = await swapRun([two[0]], { multi: true }, [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 0, box_2d: RIGHT, sure: true }]);
  assert.equal(x.calls.fal.length, 2); assert.equal(x.r.swapped, 2);
  x = await swapRun([two[0]], {}, [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 0, box_2d: RIGHT, sure: true }]);
  assert.equal(x.calls.fal.length, 0); assert.equal(x.r.reason, 'duplicate'); assert.equal(x.r.b64, FRAME);
  off();
});

test('٧. الربط الملتبس = صفر نداءات مدفوعة والإطار نفسه', async () => {
  on();
  const two = [{ data: REF_A, mime: 'image/jpeg', face: true }, { data: REF_B, mime: 'image/jpeg', face: true }];
  const cases = [
    ['duplicate', [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 0, box_2d: RIGHT, sure: true }, { ref: 1, box_2d: CENTER, sure: true }]],
    ['overlap', [{ ref: 0, box_2d: [300, 300, 500, 500], sure: true }, { ref: 1, box_2d: [320, 320, 520, 520], sure: true }]],
    ['small', [{ ref: 0, box_2d: [300, 150, 350, 200], sure: true }, { ref: 1, box_2d: RIGHT, sure: true }]],
    ['unsure', [{ ref: 0, box_2d: LEFT, sure: false }, { ref: 1, box_2d: RIGHT, sure: true }]],
    ['missing', [{ ref: 1, box_2d: RIGHT, sure: true }]],
    ['bad-ref', [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 5, box_2d: RIGHT, sure: true }]],
  ];
  for (const [why, faces] of cases) {
    const x = await swapRun(two, {}, faces);
    assert.equal(x.r.reason, why, why); assert.equal(x.calls.fal.length, 0, why); assert.equal(x.r.b64, FRAME, why); assert.equal(x.kv.spent(), 0, why);
  }
  for (const [why, flash] of [['locate-500', { status: 500 }], ['locate-parse', { raw: 'not json' }], ['abort', { throw: Object.assign(new Error('aborted'), { name: 'TimeoutError' }) }]]) {
    const x = await swapRun(two, {}, [], { flash });
    assert.equal(x.calls.fal.length, 0, why); assert.equal(x.r.b64, FRAME, why); assert.equal(x.r.swapped, 0, why);
  }
  off();
});

test('٨. أعطال المزوّد (٥٠٠، انقطاع، أسود، تالف، نسبة خاطئة) = الإطار نفسه؛ والحجز يُردّ لما لم يُنتجه المزوّد وحده', async () => {
  on();
  const one = [{ data: REF_A, mime: 'image/jpeg', face: true }];
  const faults = {
    'fal-500 boom': () => new Response(JSON.stringify({ detail: 'boom' }), { status: 500 }), // v-trend-hair-lock: نصّ رفض المزوّد في السبب
    timeout: () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); },
    black: (c) => falImage(png(c.body.image_size.width, c.body.image_size.height, [0, 0, 0])),
    'bad-output': () => falImage(Buffer.from('this is not an image at all, just text bytes')),
    aspect: (c) => falImage(png(c.body.image_size.width * 2, c.body.image_size.height, [230, 0, 0])),
    'fal-empty': () => new Response(JSON.stringify({ images: [] }), { status: 200 }),
  };
  /* غير 2xx أو بلا صورة = لم يُنتج شيئًا فيُردّ؛ الأسود (فاحص الأمان) والتالف والنسبة والمهلة بعد الإرسال صُرفت فتبقى محسوبة (نمط render-ai) */
  const billed = { 'fal-500 boom': 0, 'fal-empty': 0, timeout: 5, black: 5, 'bad-output': 5, aspect: 5 };
  for (const [why, fn] of Object.entries(faults)) {
    const x = await swapRun(one, {}, [{ ref: 0, box_2d: CENTER, sure: true }], { fal: async (c) => fn(c) });
    assert.equal(x.r.b64, FRAME, why); assert.equal(x.r.swapped, 0, why); assert.equal(x.r.reason, why, why);
    assert.equal(x.calls.fal.length, 1, why); assert.equal(x.kv.spent(), billed[why], why + ': العدّاد');
  }
  /* نجاح جزئيّ: وجه بُدّل وآخر فشل — يُحسب الناجح وحده */
  const x = await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }, { data: REF_B, mime: 'image/jpeg', face: true }], {},
    [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 1, box_2d: RIGHT, sure: true }], { fal: async (c) => (c.body.image_urls[1].endsWith(REF_B) ? new Response('{}', { status: 500 }) : null) });
  assert.equal(x.r.swapped, 1); assert.equal(x.r.reason, 'fal-500'); assert.equal(x.kv.spent(), 5);
  const img = decode(x.r.b64);
  assert.ok(near(px(img, ...center(LEFT)), [230, 0, 0], 14)); assert.ok(near(px(img, ...center(RIGHT)), GRAY, 6));
  off();
});

test('٩. الميزانيّة: أقلّ من ١٥ث = لا نداء أصلًا، ومهلة المزوّد ≤ الباقي حتّى until', async () => {
  on();
  const one = [{ data: REF_A, mime: 'image/jpeg', face: true }];
  let x = await swapRun(one, { until: Date.now() + 14000 }, [{ ref: 0, box_2d: CENTER, sure: true }]);
  assert.equal(x.r.reason, 'budget'); assert.equal(x.calls.flash.length + x.calls.fal.length, 0);
  const realT = AbortSignal.timeout; const ms = [];
  AbortSignal.timeout = (n) => { ms.push(n); return realT.call(AbortSignal, n); };
  const until = Date.now() + 40000;
  try { x = await swapRun(one, { until }, [{ ref: 0, box_2d: CENTER, sure: true }]); } finally { AbortSignal.timeout = realT; }
  assert.equal(x.r.swapped, 1);
  assert.equal(ms.length, 2, 'مهلة للربط ومهلة للمزوّد');
  assert.ok(ms[0] <= 15000, 'الربط ≤ ١٥ث'); assert.ok(ms[1] > 0 && ms[1] <= 40000, 'المزوّد ≤ الباقي: ' + ms[1]);
  off();
});

test('١٠. السقف اليوميّ: بلوغه = لا نداء والعدّاد كما كان؛ ٠ يغلق؛ وFACE_SWAP_LORA الفارغ = النموذج بلا LoRA', async () => {
  on();
  const one = [{ data: REF_A, mime: 'image/jpeg', face: true }];
  const kv = fakeKv(300);
  let x = await swapRun(one, {}, [{ ref: 0, box_2d: CENTER, sure: true }], { kv });
  assert.equal(x.r.reason, 'cap'); assert.equal(x.calls.fal.length, 0); assert.equal(kv.spent(), 300, 'الحجز رُدّ');
  process.env.FACE_SWAP_CAP_CENTS = '0';
  x = await swapRun(one, {}, [{ ref: 0, box_2d: CENTER, sure: true }]);
  assert.equal(x.r.reason, 'cap'); assert.equal(x.calls.fal.length, 0);
  delete process.env.FACE_SWAP_CAP_CENTS;
  const broken = { kvIncrBy: async () => { throw new Error('redis down'); }, kvDecrBy: async () => 0 };
  x = await swapRun(one, {}, [{ ref: 0, box_2d: CENTER, sure: true }], { kv: broken });
  assert.equal(x.r.reason, 'cap-error'); assert.equal(x.calls.fal.length, 0, 'تعذّر العدّ = لا صرف');
  process.env.FACE_SWAP_LORA = '';
  x = await swapRun(one, {}, [{ ref: 0, box_2d: CENTER, sure: true }]);
  assert.equal(x.calls.fal[0].url, 'https://fal.run/fal-ai/flux-2/klein/9b/edit'); assert.ok(!('loras' in x.calls.fal[0].body));
  off();
});

test('١١. السجلّ لا يحمل المفتاحين ولو حملهما نصّ عطب', async () => {
  on();
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.join(' '));
  try {
    await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], {}, [{ ref: 0, box_2d: CENTER, sure: true }], { fal: async () => { throw new Error('fetch failed for Key ' + FAL); } });
    await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], {}, [], { flash: { throw: new Error('bad url ?key=' + GKEY) } });
    await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], {}, [{ ref: 0, box_2d: CENTER, sure: true }]);
    await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], {}, [{ ref: 0, box_2d: CENTER, sure: true }], { kv: { kvIncrBy: async () => { throw new Error('x ' + FAL); }, kvDecrBy: async () => 0 } });
  } finally { Object.assign(console, orig); }
  assert.ok(lines.length >= 2);
  for (const l of lines) { assert.ok(!l.includes(FAL), l); assert.ok(!l.includes(GKEY), l); }
  off();
});

/* ── veo-create: من يُبدَّل له، ومطفأً الخيارات كما كانت حرفيًّا ── */
const veo = require(rp('api/_lib/veo-create.js'));
const NOW = Date.now();
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: NOW + 86400000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
async function create(body) {
  const r = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } };
  await veo({ method: 'POST', query: {}, body: Object.assign({ quality: 'fast', durationSeconds: 8, confirmed: true, token: token('omran') }, body) }, r);
  return r;
}

test('١٢. veo-create: مطفأ = خيارات الإطار حرفيًّا كما كانت؛ مفعّل = swap لترندات الشخص وحدها، والزومبي ومن ينقذك؟ بخياريهما', async () => {
  const realSolo = TP.soloFirstFrame, realGroup = TP.groupFirstFrame, realFetch = global.fetch;
  let solo = [], group = [];
  TP.soloFirstFrame = async (k, p, s, r, o) => { solo.push(o); return { b64: 'SOLOFRAME', mime: 'image/png', ref: null, people: 1 }; };
  TP.groupFirstFrame = async (k, p, s, r, o) => { group.push(o); return { b64: 'GROUPFRAME', mime: 'image/png' }; };
  global.fetch = async (url) => (/\/interactions$/.test(String(url))
    ? new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://x/v' }] }] }), { status: 200 })
    : new Response('{}', { status: 404 }));
  const one = (trend) => create({ trend, params: { text: 'يا هلا', sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
  const pair = (trend) => create({ trend, params: { text: 'يا هلا', people: 2, sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'P1', imageMime: 'image/png', imagesBase64: ['P1', 'P2'], imagesMime: ['image/png', 'image/png'] });
  try {
    off();
    for (const t of ['heritagesing', 'zombielove', 'saveyourself', 'catwalk']) {
      solo = []; const r = await one(t); assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.ok(!('swap' in solo[0]), t + ': مطفأ = بلا swap');
      assert.deepEqual(Object.keys(solo[0]), ['style', 'artHint', 'budgetMs', 'start', 'ageShift', 'single', 'detail', 'hiRes'], t + ': المفاتيح كما كانت (+single: v-video-identity-mirror)');
      assert.equal(solo[0].single, TP.SINGLE_SUBJECT_TRENDS.has(t), t + ': single لترند الشخص الواحد وحده');
    }
    group = []; await pair('heritagesing'); assert.deepEqual(group[0], { timeoutMs: 120000 }, 'المجموعة مطفأً كما كانت');
    on({ TREND_FACE_SWAP: 'owner' });
    solo = []; const t0 = Date.now(); await one('heritagesing'); const sw = solo[0].swap;
    assert.deepEqual(Object.keys(sw), ['until', 'owner']); assert.equal(sw.owner, true);
    assert.ok(sw.until >= t0 + 120000 && sw.until <= Date.now() + 120000, 'until = t0 + ١٢٠ث');
    solo = []; await one('zombielove'); assert.deepEqual(solo[0].swap.only, [0]);
    solo = []; await one('saveyourself'); assert.equal(solo[0].swap.multi, true);
    group = []; await pair('heritagesing'); assert.deepEqual(Object.keys(group[0]), ['timeoutMs', 'swap']);
    group = []; await pair('zombielove'); assert.deepEqual(group[0].swap.only, [0]);
    for (const t of ['actionfigure', 'legofy', 'gamechar', 'babyversion', 'hugyounger', 'timecapsule', 'vhsflashback', 'ghibli', 'claymation', 'animeaction']) {
      solo = []; const r = await one(t); assert.equal(r.code, 200, t);
      assert.ok(solo.length === 1 && !('swap' in solo[0]), t + ': مستثنى');
    }
    process.env.TREND_ENGINE = 'veo';
    solo = []; await one('heritagesing'); assert.ok(!('swap' in solo[0]), 'Veo: بلا تبديل');
    delete process.env.TREND_ENGINE;
    delete process.env.FAL_KEY;
    solo = []; await one('heritagesing'); assert.ok(!('swap' in solo[0]), 'بلا مفتاح: بلا تبديل');
  } finally { TP.soloFirstFrame = realSolo; TP.groupFirstFrame = realGroup; global.fetch = realFetch; off(); delete process.env.TREND_ENGINE; }
});

/* ── قصّة Picture 1 بلا رأس آخر: الوجه الآخر مطليّ أزرق في الإطار، ولا بكسل أزرق في القصّة المرسلة ── */
const BLUE = [0, 0, 255];
function frameWith(boxes) {
  const inBox = (x, y) => boxes.some((b) => x >= b[1] / 1000 * W && x < b[3] / 1000 * W && y >= b[0] / 1000 * H && y < b[2] / 1000 * H);
  return png(W, H, (x, y) => (inBox(x, y) ? BLUE : GRAY)).toString('base64');
}
function blueIn(dataUri) {
  const img = decode(dataUri.replace(/^data:image\/\w+;base64,/, ''));
  let n = 0;
  for (let i = 0; i < img.w * img.h; i++) { const d = img.data; if (d[i * 4 + 2] > 150 && d[i * 4] < 100 && d[i * 4 + 1] < 100) n++; }
  return n;
}
const lockOn = (frameB64, refs, o, stubOpt) => {
  const s = stub(stubOpt);
  return FS.lockFaces({ b64: frameB64, mime: 'image/png' }, refs, Object.assign({ apiKey: GKEY, until: Date.now() + 120000, owner: true, fetchImpl: s.f, kv: fakeKv() }, o))
    .then((r) => ({ r, calls: s.calls }));
};

test('١٣. قصّة Picture 1 لا تحمل وجهًا بلا مرجع ولا مرجعًا غير متأكّد — ولا توسيع بلا قائمة others', async () => {
  on();
  const one = [{ data: REF_A, mime: 'image/jpeg', face: true }];
  const REF0 = [300, 250, 500, 449], STRANGER = [300, 550, 500, 750];
  const fr = frameWith([STRANGER]);
  /* وجه بلا مرجع في others (المشهور، الزومبي الغريب، الضيوف) */
  let x = await lockOn(fr, one, {}, { faces: [{ ref: 0, box_2d: REF0, sure: true }], others: [{ box_2d: STRANGER }] });
  assert.equal(x.r.swapped, 1); assert.equal(x.calls.fal.length, 1);
  assert.equal(blueIn(x.calls.fal[0].body.image_urls[0]), 0, 'لا بكسل من الوجه الآخر في القصّة');
  assert.ok(x.calls.fal[0].body.image_size.width < 768, 'لا توسيع يُدخل الوجه الآخر');
  /* الشكل نفسه بـref ‎-1 داخل faces */
  x = await lockOn(fr, one, {}, { faces: [{ ref: 0, box_2d: REF0, sure: true }, { ref: -1, box_2d: STRANGER, sure: false }] });
  assert.equal(x.r.swapped, 1); assert.equal(blueIn(x.calls.fal[0].body.image_urls[0]), 0);
  /* الزومبي في إطار المجموعة: المرجع ١ غير متأكّد، والقصّة تقف دونه */
  const two = [{ data: REF_A, mime: 'image/jpeg', face: true }, { data: REF_B, mime: 'image/jpeg', face: true }];
  x = await lockOn(frameWith([RIGHT]), two, { only: [0] }, { faces: [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 1, box_2d: RIGHT, sure: false }] });
  assert.equal(x.r.swapped, 1); assert.equal(blueIn(x.calls.fal[0].body.image_urls[0]), 0);
  /* جار قريب غير متأكّد: القصّة تُقصّ عند منتصف المسافة ولا تُوسَّع إلى ٧٦٨ */
  const A0 = [300, 150, 500, 350], NB = [300, 420, 500, 620];
  x = await lockOn(frameWith([NB]), two, { only: [0] }, { faces: [{ ref: 0, box_2d: A0, sure: true }, { ref: 1, box_2d: NB, sure: false }] });
  assert.equal(x.r.swapped, 1); assert.equal(blueIn(x.calls.fal[0].body.image_urls[0]), 0);
  assert.notDeepEqual(x.calls.fal[0].body.image_size, { width: 768, height: 768 });
  assert.ok(x.calls.fal[0].body.image_size.width <= 304, 'headRect مقصوص: ' + JSON.stringify(x.calls.fal[0].body.image_size));
  /* جار غير متأكّد يتقاطع مع الوجه المُبدَّل (٠٫٤٨) = لبس، صفر نداءات */
  x = await lockOn(FRAME, two, { only: [0] }, { faces: [{ ref: 0, box_2d: A0, sure: true }, { ref: 1, box_2d: [300, 220, 500, 420], sure: false }] });
  assert.equal(x.r.reason, 'overlap'); assert.equal(x.calls.fal.length, 0); assert.equal(x.r.b64, FRAME);
  /* وجه بلا مرجع يتقاطع جزئيًّا = لبس؛ ويطابقه تقريبًا = الوجه نفسه مذكورًا مرّتين فلا يمنع */
  x = await lockOn(FRAME, one, {}, { faces: [{ ref: 0, box_2d: A0, sure: true }], others: [{ box_2d: [300, 220, 500, 420] }] });
  assert.equal(x.r.reason, 'overlap'); assert.equal(x.calls.fal.length, 0);
  x = await lockOn(FRAME, one, {}, { faces: [{ ref: 0, box_2d: A0, sure: true }], others: [{ box_2d: [302, 152, 500, 352] }] });
  assert.equal(x.r.swapped, 1);
  /* جواب بلا others (الشكل القديم): لا نعرف من غيره في الإطار = لا توسيع وراء headRect */
  x = await lockOn(fr, one, {}, { faces: [{ ref: 0, box_2d: CENTER, sure: true }], others: null });
  assert.equal(x.r.swapped, 1); assert.ok(x.calls.fal[0].body.image_size.width < 768, JSON.stringify(x.calls.fal[0].body.image_size));
  /* والأمر يطلب others */
  assert.match(x.calls.flash[0].body.contents[0].parts.map((p) => p.text || '').join(' '), /EVERY other clearly visible human/);
  off();
});

test('١٤. الزومبي بشخصين من صورة واحدة = لا تبديل (اللقطتان بحجم الوجه لا بالدور)؛ ووجه واحد أو المجموعة يُبدَّل المرجع ٠ وحده', async () => {
  on();
  const pair = async () => [{ of: 0, who: 'the person on the left', data: REF_A, mime: 'image/jpeg' }, { of: 0, who: 'the person on the right', data: REF_B, mime: 'image/jpeg' }];
  let s = stub({ faces: [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 1, box_2d: RIGHT, sure: true }] });
  let r = await TP.soloFirstFrame('K', { data: PHOTO + 'zombie-two', mime: 'image/png' }, 'a couple, one turned zombie', '720:1280',
    { faceCrops: pair, callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s.f, swap: { until: Date.now() + 120000, owner: true, only: [0], kv: fakeKv() } });
  assert.equal(r.b64, FRAME); assert.equal(r.swapped, 0); assert.equal(r.swapWhy, 'roles');
  assert.equal(s.calls.flash.length + s.calls.fal.length, 0);
  /* وجه واحد في الصورة: only:[0] يعمل */
  s = stub({ faces: [{ ref: 0, box_2d: LEFT, sure: true }], others: [{ box_2d: RIGHT }] });
  r = await TP.soloFirstFrame('K', { data: PHOTO + 'zombie-one', mime: 'image/png' }, 'a man hugging a zombie', '720:1280',
    { faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }], callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s.f,
      swap: { until: Date.now() + 120000, owner: true, only: [0], kv: fakeKv() } });
  assert.equal(r.swapped, 1); assert.equal(s.calls.fal.length, 1);
  /* «من ينقذك؟» بشخصين من صورة واحدة لا only فيه — لا يمسّه الشرط */
  s = stub({ faces: [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 1, box_2d: RIGHT, sure: true }] });
  r = await TP.soloFirstFrame('K', { data: PHOTO + 'two-plain', mime: 'image/png' }, 'two friends', '720:1280',
    { faceCrops: pair, callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s.f, swap: { until: Date.now() + 120000, owner: true, kv: fakeKv() } });
  assert.equal(r.swapped, 2);
  /* المجموعة: المرجع ١ هو الصورة الثانية (الزومبي بنصّ الترند) — يُبدَّل المرجع ٠ وحده */
  s = stub({ faces: [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 1, box_2d: RIGHT, sure: true }] });
  r = await TP.groupFirstFrame('K', [{ data: PHOTO, mime: 'image/png' }, { data: PHOTO + 'z', mime: 'image/png' }], 'zombie love', '720:1280', {
    faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }, { of: 1, who: 'the person', data: REF_B, mime: 'image/jpeg' }],
    callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s.f, swap: { until: Date.now() + 120000, owner: true, only: [0], kv: fakeKv() } });
  assert.equal(r.swapped, 1); assert.equal(s.calls.fal.length, 1);
  assert.equal(s.calls.fal[0].body.image_urls[1], 'data:image/jpeg;base64,' + REF_A);
  off();
});

/* ── v-trend-hair-lock (المالك: «سامحوني» بصورة واحدة لرجل ملتحٍ بشعر قصير جدًّا ← وجه أنحف وشعر طويل، والتبديل مفعّل للمالك) ── */
const OFFICIAL = 'head_swap: start with Picture 1 as the base image, keeping its lighting, environment, and background. remove the head from Picture 1 completely and replace it with the head from Picture 2, strictly preserving the hair, eye color, and nose structure of Picture 2. copy the direction of the eye, head rotation, and micro-expressions from Picture 1. Keep the body, clothing, pose, framing, and background intact.';

test('١٥. أمر الـLoRA الرسميّ حرفيًّا، وPicture 1 القصّة وPicture 2 المرجع؛ وعلامات التنصيص في TREND_FACE_SWAP تُقرأ؛ وgateWhy بلا مفتاح', async () => {
  assert.equal(FS.PROMPT, OFFICIAL);
  on();
  const x = await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], {}, [{ ref: 0, box_2d: CENTER, sure: true }]);
  assert.equal(x.r.swapped, 1);
  assert.equal(x.calls.fal[0].body.prompt, OFFICIAL);
  assert.equal(x.calls.fal[0].body.image_urls[1], 'data:image/jpeg;base64,' + REF_A, 'Picture 2 = المرجع، لا يُعكس');
  assert.deepEqual(x.calls.fal[0].body.loras, [{ path: FS.LORA_DEFAULT, scale: 1 }]);
  process.env.TREND_FACE_SWAP = "'owner'"; assert.equal(FS.mode(), 'owner');
  process.env.TREND_FACE_SWAP = '"on"'; assert.equal(FS.mode(), 'on');
  process.env.TREND_FACE_SWAP = 'owner';
  assert.equal(FS.gateWhy(true), ''); assert.equal(FS.gateWhy(false), 'not-owner');
  delete process.env.FAL_KEY; assert.equal(FS.gateWhy(true), 'no-key');
  off(); assert.equal(FS.gateWhy(true), 'off');
});

test('١٦. رفض المزوّد يحمل نصّه في السبب (٤٢٢/٤٠٤) منظَّفًا من المفتاح، والحجز يُردّ', async () => {
  on();
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.join(' '));
  let x;
  try {
    x = await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], {}, [{ ref: 0, box_2d: CENTER, sure: true }],
      { fal: async () => new Response(JSON.stringify({ detail: [{ msg: 'loras.0.path invalid ' + FAL }] }), { status: 422 }) });
  } finally { Object.assign(console, orig); }
  assert.match(x.r.reason, /^fal-422 loras\.0\.path invalid \*\*\*/);
  assert.equal(x.r.b64, FRAME); assert.equal(x.kv.spent(), 0, 'لم يُنتج شيئًا = يُردّ');
  for (const l of lines.concat([x.r.reason])) assert.ok(!l.includes(FAL), l);
  const y = await swapRun([{ data: REF_A, mime: 'image/jpeg', face: true }], {}, [{ ref: 0, box_2d: CENTER, sure: true }],
    { fal: async () => new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 }) });
  assert.equal(y.r.reason, 'fal-404 Application not found');
  off();
});

test('١٧. صورة واحدة: لا مطابقة بالشعر واللبس، ولا تفكير للصناديق، والوجه الوحيد في الإطار هو صاحبها؛ ومرجعان كما كانا', async () => {
  on();
  const one = [{ data: REF_A, mime: 'image/jpeg', face: true }];
  const two = [one[0], { data: REF_B, mime: 'image/jpeg', face: true }];
  const txt = (c) => c.body.contents[0].parts.filter((p) => p.text).map((p) => p.text).join('\n');
  let x = await swapRun(one, {}, [{ ref: 0, box_2d: CENTER, sure: true }]);
  const t1 = txt(x.calls.flash[0]);
  assert.ok(!t1.includes('Match by appearance'), 'لا مطابقة بالشعر واللبس');
  assert.ok(t1.includes('that alone is NOT a reason to be unsure'));
  assert.ok(t1.includes('EVERY other clearly visible human'));
  assert.match(t1, /never by left\/right order/); assert.match(t1, /never by gender alone/);
  assert.equal(x.calls.flash[0].body.generationConfig.thinkingConfig.thinkingBudget, 0);
  x = await swapRun(two, {}, [{ ref: 0, box_2d: LEFT, sure: true }, { ref: 1, box_2d: RIGHT, sure: true }]);
  assert.ok(txt(x.calls.flash[0]).includes('Match by appearance'), 'مرجعان: الأمر كما كان');
  assert.ok(!txt(x.calls.flash[0]).includes('NOT a reason to be unsure'));
  assert.equal(x.calls.flash[0].body.generationConfig.thinkingConfig.thinkingBudget, 0);
  const none = (x, why) => { assert.equal(x.r.reason, why || 'missing'); assert.equal(x.r.swapped, 0); assert.equal(x.calls.fal.length, 0); assert.equal(x.kv.spent(), 0); assert.equal(x.r.b64, FRAME, 'الإطار نفسه بايتًا ببايت'); };
  /* مشهد صاحبها وحده (alone): Flash لم يربط أحدًا لكنّه عدّ وجهًا واحدًا = صاحب الصورة */
  x = await swapRun(one, { alone: true }, [], { others: [{ box_2d: CENTER }] });
  assert.equal(x.r.swapped, 1); assert.equal(x.calls.fal.length, 1);
  x = await swapRun(one, { alone: true }, [{ ref: -1, box_2d: CENTER, sure: true }]);
  assert.equal(x.r.swapped, 1, 'ref ‎-1 متأكّد في faces نفسها');
  /* sure=false صريح على الوجه الوحيد (مغطّى، ملتفت) = لا تبديل ولا صرف */
  none(await swapRun(one, { alone: true }, [{ ref: -1, box_2d: CENTER, sure: false }]));
  /* بلا alone (الزومبي، الأميرة، المشهور): الوجه الوحيد قد يكون الشخصيّة الثانية — لا يُفترض أنّه صاحب الصورة */
  none(await swapRun(one, {}, [], { others: [{ box_2d: CENTER }] }));
  none(await swapRun(one, { only: [0] }, [], { others: [{ box_2d: RIGHT }] }));
  none(await swapRun(one, { alone: true, only: [0] }, [], { others: [{ box_2d: RIGHT }] }), 'missing');
  none(await swapRun(one, {}, [{ ref: -1, box_2d: CENTER, sure: true }]));
  /* وجهان = لا نعرف أيّهما: missing بلا صرف */
  none(await swapRun(one, { alone: true }, [], { others: [{ box_2d: LEFT }, { box_2d: RIGHT }] }));
  /* بلا others (الشكل القديم) = لا نعرف عدد الوجوه */
  none(await swapRun(one, { alone: true }, [], { others: null }));
  /* sure=false صريح (مغطّى، ملتبس) يبقى محميًّا */
  x = await swapRun(one, {}, [{ ref: 0, box_2d: CENTER, sure: false }]);
  assert.equal(x.r.reason, 'unsure'); assert.equal(x.calls.fal.length, 0);
  /* «من ينقذك؟» (multi) كما كان: لا وجه وحيد يُفترض */
  x = await swapRun(one, { multi: true, alone: true }, [], { others: [{ box_2d: CENTER }] });
  assert.equal(x.r.reason, 'missing'); assert.equal(x.calls.fal.length, 0);
  assert.ok(txt(x.calls.flash[0]).includes('Match by appearance'), 'multi: الأمر كما كان');
  off();
});

test('١٨. الذاكرة: فشل تبديل عابر يُعاد على الإطار الخام بلا دفع الإطار ثانية؛ والسبب الدائم لا يُعاد', async () => {
  on();
  let built = 0, fail = true;
  const s = stub({ faces: [{ ref: 0, box_2d: CENTER, sure: true }], fal: async () => (fail ? new Response('{}', { status: 500 }) : null) });
  const kv = fakeKv();
  const run = () => TP.soloFirstFrame('K', { data: PHOTO + 'retry', mime: 'image/png' }, 'a knight on a cliff', '720:1280', {
    faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }],
    callImage: async () => { built++; return { b64: FRAME, mime: 'image/png' }; }, fetchImpl: s.f, detail: true, hiRes: true,
    swap: { until: Date.now() + 120000, owner: true, kv } });
  const a = await run();
  assert.equal(a.swapped, 0); assert.equal(a.swapWhy, 'fal-500'); assert.equal(a.b64, FRAME);
  fail = false;
  const b = await run();
  assert.equal(b.cached, true); assert.equal(b.swapped, 1); assert.equal(b.mime, 'image/jpeg');
  assert.equal(built, 1, 'الإطار لم يُدفع ثانية'); assert.equal(s.calls.fal.length, 2);
  const c = await run();
  assert.equal(c.swapped, 1); assert.equal(c.b64, b.b64); assert.equal(s.calls.fal.length, 2, 'نجح = لا تبديل ثالث');
  /* سبب دائم (وجه صغير) = الإطار المخزَّن كما هو بلا نداء */
  let built2 = 0;
  const s2 = stub({ faces: [{ ref: 0, box_2d: [300, 150, 350, 200], sure: true }] });
  const run2 = () => TP.soloFirstFrame('K', { data: PHOTO + 'small', mime: 'image/png' }, 'a knight on a cliff', '720:1280', {
    faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }],
    callImage: async () => { built2++; return { b64: FRAME, mime: 'image/png' }; }, fetchImpl: s2.f, detail: true, hiRes: true,
    swap: { until: Date.now() + 120000, owner: true, kv: fakeKv() } });
  const d = await run2(); assert.equal(d.swapWhy, 'small');
  const e = await run2(); assert.equal(e.cached, true); assert.equal(e.swapWhy, 'small');
  assert.equal(built2, 1); assert.equal(s2.calls.flash.length, 1); assert.equal(s2.calls.fal.length, 0);
  off();
});

test('١٩. veo-create: تخطّي التبديل وسقوط الإطار وإغلاق البوّابة تصل سجلّ المالك؛ والنجاح بلا سطر؛ والمفتاح في لا سطر', async () => {
  const realSolo = TP.soloFirstFrame, realFetch = global.fetch;
  global.fetch = async (url) => (/\/interactions$/.test(String(url))
    ? new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://x/v' }] }] }), { status: 200 })
    : new Response('{}', { status: 404 }));
  const one = (trend, photo) => create({ trend, params: { text: 'يا هلا', sceneIndex: 0 }, ratio: '720:1280', imageBase64: photo, imageMime: 'image/jpeg' });
  /* الإطار الحقيقيّ (soloFirstFrame + lockFaces) ببناء مزيّف وFlash/fal مزيّفين */
  const withFake = (s) => { TP.soloFirstFrame = (k, p, sc, r, o) => realSolo(k, p, sc, r, Object.assign({}, o, {
    faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }], callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s.f })); };
  try {
    on({ TREND_FACE_SWAP: 'owner' });
    let s = stub({ faces: [{ ref: 0, box_2d: CENTER, sure: false }] });
    withFake(s); notes.length = 0;
    let r = await one('sorryreveal', 'PHOTO-unsure'); assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(s.calls.fal.length, 0);
    assert.equal(notes.length, 1, JSON.stringify(notes)); assert.equal(notes[0][0], 'face-swap/solo');
    assert.match(notes[0][1], /^trend=sorryreveal swap=0 why=unsure$/);
    s = stub({ faces: [{ ref: 0, box_2d: CENTER, sure: true }] });
    withFake(s); notes.length = 0;
    r = await one('sorryreveal', 'PHOTO-ok'); assert.equal(r.code, 200);
    assert.equal(s.calls.fal.length, 1); assert.deepEqual(notes, [], 'نجاح = لا سطر');
    /* رفض المزوّد: السبب بنصّه في سجلّ المالك بلا المفتاح */
    s = stub({ faces: [{ ref: 0, box_2d: CENTER, sure: true }], fal: async () => new Response(JSON.stringify({ detail: [{ msg: 'bad path ' + FAL }] }), { status: 422 }) });
    withFake(s); notes.length = 0;
    await one('heritagesing', 'PHOTO-422');
    assert.equal(notes.length, 1); assert.match(notes[0][1], /swap=0 why=fal-422 bad path \*\*\*/); assert.ok(!notes[0][1].includes(FAL));
    /* الإطار سقط = المحرّك يرسم وجهًا جديدًا — سطر */
    TP.soloFirstFrame = async () => ({ error: 'frame down' }); notes.length = 0;
    await one('sorryreveal', 'PHOTO-down');
    assert.deepEqual(notes.map((n) => n[0]), ['trend-frame/solo']); assert.match(notes[0][1], /^trend=sorryreveal skipped why=frame down$/);
    /* البوّابة مغلقة للمالك: مطفأة، ثمّ بلا مفتاح */
    TP.soloFirstFrame = async () => ({ b64: 'SOLOFRAME', mime: 'image/png', ref: null, people: 1 });
    process.env.TREND_FACE_SWAP = ''; notes.length = 0;
    await one('sorryreveal', 'PHOTO-off');
    assert.deepEqual(notes, [['face-swap/gate', 'trend=sorryreveal swap=off']]);
    process.env.TREND_FACE_SWAP = 'owner'; delete process.env.FAL_KEY; notes.length = 0;
    await one('sorryreveal', 'PHOTO-nokey');
    assert.deepEqual(notes, [['face-swap/gate', 'trend=sorryreveal swap=no-key']]);
    /* ترند مستثنى (لعبة) أو Veo = لا سطر */
    off(); notes.length = 0;
    await one('actionfigure', 'PHOTO-toy');
    process.env.TREND_ENGINE = 'veo'; await one('sorryreveal', 'PHOTO-veo'); delete process.env.TREND_ENGINE;
    assert.deepEqual(notes, []);
  } finally { TP.soloFirstFrame = realSolo; global.fetch = realFetch; off(); delete process.env.TREND_ENGINE; }
});

test('٢٠. veo-create: alone لمشهد صاحب الصورة وحده (لا الزومبي)، وhat للتخرّج وفيلم الثمانينات بجملة إبقاء القبّعة — وغيرها الأمر الرسميّ حرفيًّا', async () => {
  const realSolo = TP.soloFirstFrame, realFetch = global.fetch;
  global.fetch = async (url) => (/\/interactions$/.test(String(url))
    ? new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://x/v' }] }] }), { status: 200 })
    : new Response('{}', { status: 404 }));
  const one = (trend, photo) => create({ trend, params: { text: 'يا هلا', sceneIndex: 0 }, ratio: '720:1280', imageBase64: photo, imageMime: 'image/jpeg' });
  let swaps = [];
  const withFake = (s) => { TP.soloFirstFrame = (k, p, sc, r, o) => { swaps.push(o.swap); return realSolo(k, p, sc, r, Object.assign({}, o, {
    faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }], callImage: async () => ({ b64: FRAME, mime: 'image/png' }), fetchImpl: s.f })); }; };
  try {
    on({ TREND_FACE_SWAP: 'owner' });
    for (const t of ['graduation', 'lostfilm80s']) {
      const s = stub({ faces: [{ ref: 0, box_2d: CENTER, sure: true }] });
      withFake(s); swaps = [];
      const r = await one(t, 'PHOTO-hat-' + t); assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(swaps[0].hat, true, t); assert.ok(!('alone' in swaps[0]), t + ': في المشهد غيره');
      assert.equal(s.calls.fal.length, 1, t);
      assert.equal(s.calls.fal[0].body.prompt, OFFICIAL + FS.HAT_KEEP, t + ': الأمر الرسميّ + إبقاء القبّعة');
      assert.match(FS.HAT_KEEP, /^ Keep the hat or cap worn on the head in Picture 1 in place/);
    }
    /* «سامحوني»: صاحب الصورة وحده (alone) والأمر الرسميّ حرفيًّا — والوجه الوحيد بلا ربط يُبدَّل */
    let s = stub({ faces: [], others: [{ box_2d: CENTER }] });
    withFake(s); swaps = [];
    await one('sorryreveal', 'PHOTO-alone');
    assert.equal(swaps[0].alone, true); assert.ok(!('hat' in swaps[0]));
    assert.equal(s.calls.fal.length, 1); assert.equal(s.calls.fal[0].body.prompt, OFFICIAL);
    /* «الزومبي» بصورة واحدة: Flash لم يجد وجه المستخدم وعدّ الزومبي وحده = لا تبديل ولا صرف */
    s = stub({ faces: [], others: [{ box_2d: RIGHT }] });
    withFake(s); swaps = []; notes.length = 0;
    await one('zombielove', 'PHOTO-zombie');
    assert.ok(!('alone' in swaps[0]) && !('hat' in swaps[0])); assert.deepEqual(swaps[0].only, [0]);
    assert.equal(s.calls.fal.length, 0, 'رأس المستخدم لا يُلصق على الزومبي');
    assert.match(notes[0][1], /^trend=zombielove swap=0 why=missing$/);
    for (const t of ['spanishrap', 'bbywow', 'invisiblebike', 'celebselfie', 'standstill']) {
      withFake(stub({ faces: [], others: [{ box_2d: CENTER }] })); swaps = [];
      await one(t, 'PHOTO-' + t);
      assert.ok(swaps.length && !('alone' in swaps[0]), t + ': شخصيّة أخرى في المشهد');
    }
  } finally { TP.soloFirstFrame = realSolo; global.fetch = realFetch; off(); }
});
