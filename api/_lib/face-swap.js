'use strict';
/* api/_lib/face-swap.js — v-trend-face-swap (المالك ٢٥ أكتوبر: «صلحة الاشكال الملامح»).
   الجذر مثبت: Omni يحفظ وجه الإطار الأوّل طوال المقطع، ونموذج الصور (برو) هو الذي يعيد رسم الوجه وهو يبني الإطار.
   سطر القفل وحده (frameLookLock) لم يكفِ، وتصحيح ثانٍ ببرو رُجع (v-trend-face-refine). فهنا خطوة مخصّصة بعد بناء الإطار:
   تبديل رأس بنموذج تعديل صغير على مزوّد fal (Flux 2 Klein 9B + LoRA «BFS head swap»): Picture 1 قصّة الوجه من الإطار بدقّتها،
   وPicture 2 وجه الشخص الحقيقيّ، ثمّ يُلصق **بيضاويّ الوجه وحده** بحافة ناعمة فوق الإطار — المشهد واللبس والإضاءة كما رسمها برو.
   - مطفأة افتراضيًّا: TREND_FACE_SWAP = off · owner (المالك وحده) · on، تُقرأ عند النداء؛ بلا FAL_KEY = مطفأة. التشغيل إنفاق بموافقة المالك.
   - سقف يوميّ FACE_SWAP_CAP_CENTS (٣٠٠ افتراضيًّا، يوم UTC) في KV: يُحجز ٥ سنتات لكلّ وجه قبل النداء، ولا يُردّ إلّا حجز نداء لم يُنتج شيئًا
     (غير 2xx أو ردّ بلا صورة — نمط render-ai)؛ الأسود والتالف والمهلة صُرفت عند المزوّد فتبقى محسوبة.
   - الربط بالمرجع لا بالموضع: نداء Flash واحد يرى الإطار وكلّ مرجع ويعيد صندوق كلّ مرجع بالشكل (لا يمين/يسار ولا جنس)، وأيّ لبس = لا نداء مدفوع.
   - لا يرمي أبدًا: أيّ عطب = الإطار نفسه بايتًا ببايت مع السبب؛ والنجاح الجزئيّ مقبول (وجه بُدّل وآخر بقي).
   - المفتاح لا يُطبع ولا يُسجَّل، ويُقرأ داخل الدالّة لا عند التحميل. */
const fc = require('./face-composite.js');
const mi = require('./merge-identity.js');
const { decodeImage } = require('./image-diff.js');

const SYNC = 'https://fal.run/';
const MODEL_LORA = 'fal-ai/flux-2/klein/9b/edit/lora';
const MODEL_PLAIN = 'fal-ai/flux-2/klein/9b/edit';
const LORA_DEFAULT = 'https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/resolve/d74319971db6bf2492b8d8869c8dc627edc00ed8/head_swap_flux-klein_9b_v1_step3750_rank64.safetensors';
/* عقد BFS: Picture 1 = الجسم والمشهد (قصّة الإطار)، Picture 2 = وجه الشخص الحقيقيّ */
const PROMPT = 'head_swap: start with Picture 1 as the base image, keeping its lighting, environment, background, body, clothing, headwear, pose and framing intact. Remove the head from Picture 1 and replace it with the head from Picture 2, keeping the face from Picture 2 exactly - same face shape, eyes, eyebrows, nose, lips, jawline, facial hair and skin details - with the head angle, expression and lighting of Picture 1.';
const COST_CENTS = 5; // تقدير الوجه الواحد (Klein 9B بقصّة ≤١٫٥ ميغابكسل)
const CAP_CENTS_DEFAULT = 300;
const spentKey = (day) => 'faceswap:spent:' + day;
const SPENT_TTL_SEC = 2 * 86400;
const MIN_LEFT_MS = 15000; // أقلّ من هذا قبل Omni = لا تبديل (لا نأكل وقت المحرّك)
const LOCATE_MAX_MS = 15000;
const FACE_MIN_PX = 64; // وجه أقصر من هذا في الإطار = لا تفاصيل تُبدَّل
const IOU_MAX = 0.3;
const DUP_IOU = 0.6; // وجه «آخر» يطابق صندوق مرجع بهذا القدر = الوجه نفسه ذكره Flash مرّتين
const SIDE_MIN = 768, SIDE_MAX = 1536; // ضلع القصّة بالبكسل الأصليّ: يُوسَّع سياقًا حتّى ٧٦٨، وأكبر من ١٥٣٦ يُترك
const PHOTO_MAX = 1024;
const ASPECT_TOL = 0.02;
const BLACK_LUMA = 10; // فاحص الأمان عند المزوّد يعيد صورة سوداء
const FEATHER = 0.12;

/** off · owner · on — غير ذلك (ومنه غير المضبوط) = off. */
function mode() {
  const m = String(process.env.TREND_FACE_SWAP || '').trim().toLowerCase();
  return m === 'on' || m === 'owner' ? m : 'off';
}
const falKey = () => String(process.env.FAL_KEY || '').trim();
/** مفعّلة لهذا الطلب؟ owner = الطالب حساب المالك (بوّابة checkOwnerBypass في المتّصل). */
function enabledFor(owner) {
  const m = mode();
  if (m === 'off' || !falKey()) return false;
  return m === 'on' || !!owner;
}
function capCents() {
  const raw = process.env.FACE_SWAP_CAP_CENTS === undefined ? '' : String(process.env.FACE_SWAP_CAP_CENTS).trim();
  return raw === '' ? CAP_CENTS_DEFAULT : (Number.isFinite(+raw) && +raw >= 0 ? +raw : CAP_CENTS_DEFAULT);
}
/** LoRA: FACE_SWAP_LORA يغلبه، والفارغ صراحةً = النموذج بلا LoRA. */
function loraPath() {
  return process.env.FACE_SWAP_LORA === undefined ? LORA_DEFAULT : String(process.env.FACE_SWAP_LORA).trim();
}
function modelId() {
  return String(process.env.FACE_SWAP_MODEL || '').trim() || (loraPath() ? MODEL_LORA : MODEL_PLAIN);
}

/* أيّ نصّ يصل السجلّ يُنظَّف من المفتاحين (key= في رابط Gemini، ومفتاح fal نفسه) */
function clean(s, keys) {
  let t = String(s || '').replace(/key=[^&\s"']+/g, 'key=***');
  for (const k of keys || []) if (k) t = t.split(k).join('***');
  return t.replace(/\s+/g, ' ').slice(0, 160);
}

const toB64 = (img, q) => Buffer.from(fc.encodeJpeg(img, q)).toString('base64');
function cut(img, r) {
  const w = r.x1 - r.x0, h = r.y1 - r.y0, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((r.y0 + y) * img.w + r.x0) * 4, ((r.y0 + y) * img.w + r.x1) * 4), y * w * 4);
  return { w, h, data: out };
}
function iou(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const i = w > 0 && h > 0 ? w * h : 0;
  const u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i;
  return u > 0 ? i / u : 0;
}
/* [ymin,xmin,ymax,xmax] من ٠–١٠٠٠ ← [x0,y0,x1,y1] نسبيّ (كما detectFaces) */
function relBox(b) {
  const v = Array.isArray(b) ? b.map(Number) : null;
  if (!v || v.length !== 4 || v.some((x) => !Number.isFinite(x))) return null;
  const c = (x) => Math.max(0, Math.min(1, x / 1000));
  const box = [c(v[1]), c(v[0]), c(v[3]), c(v[2])];
  return box[2] > box[0] && box[3] > box[1] ? box : null;
}

/* المرجع: لقطة وجه جاهزة (face) أو صورة كاملة تُصغَّر ≤١٠٢٤ ويُطلب صندوق وجهها في نداء الربط نفسه */
function prepRef(r) {
  const mime = r.mime || mi.sniffMime(r.data);
  if (r.face) return { b64: String(r.data), mime, face: true, img: null };
  const img = mi.decodeWork(r.data);
  if (!img) return { b64: String(r.data), mime, face: false, img: null }; // لا يُفكّ (webp) = يُرسل كما هو
  return { b64: toB64(mi.shrinkTo(img, PHOTO_MAX), 92), mime: 'image/jpeg', face: false, img };
}

/* نداء Flash واحد: الإطار وكلّ مرجع ← صندوق كلّ مرجع في الإطار بالشكل، وsure. شكل الطلب كـmerge-identity.detectFaces */
async function locate(apiKey, frame, refs, o) {
  const parts = [{ text: 'Image A — a generated video frame:' }, { inlineData: { mimeType: 'image/jpeg', data: toB64(mi.shrinkTo(frame, 1024), 85) } }];
  refs.forEach((r, k) => parts.push({ text: 'Reference ' + k + ' — ' + (r.face ? 'a close-up of one real person\'s face' : 'a photo of a real person') + ':' }, { inlineData: { mimeType: r.mime, data: r.b64 } }));
  parts.push({ text: 'Image A was drawn from the references: each reference shows a real person who appears in Image A. For EACH reference k, find the one person in Image A who is that same person. '
    + 'Match by appearance — face shape, features, skin tone, hair, facial hair, headwear, glasses, clothing and build — never by left/right order or image order, and never by gender alone. '
    + 'Return box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000 for that person\'s face in Image A, from the hairline/forehead to the chin and ear to ear. '
    + (o.multi ? 'Image A may show the person from Reference 0 twice (two versions of the same person): return one entry for each of them. ' : '')
    + 'For a reference that is a photo (not a close-up) also return ref_box: that person\'s face inside the reference itself, in the same format. '
    + 'Set sure to false whenever you are not certain which person in Image A matches, or the face is hidden, turned away or not a real human face. '
    + 'Also list in others the face of EVERY other clearly visible human or human-like face in Image A that is not in faces (extra characters, a zombie, a partner, guests, bystanders), even when it matches no reference; others is [] when there is none. '
    + 'Return JSON {"faces": [{"ref": k, "box_2d": [...], "ref_box": [...], "sure": true}], "others": [{"box_2d": [...]}]} only; leave out a reference you cannot find.' });
  const r = await (o.fetchImpl || fetch)(mi.DETECT_URL + apiKey, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(Math.max(1, Math.min(LOCATE_MAX_MS, o.until - Date.now()))),
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', required: ['faces', 'others'], properties: { faces: { type: 'ARRAY', items: { type: 'OBJECT', required: ['ref', 'box_2d', 'sure'], properties: { ref: { type: 'INTEGER' }, box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } }, ref_box: { type: 'ARRAY', items: { type: 'INTEGER' } }, sure: { type: 'BOOLEAN' } } } }, others: { type: 'ARRAY', items: { type: 'OBJECT', required: ['box_2d'], properties: { box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } } } } } } } },
    }),
  });
  if (!r.ok) return { why: 'locate-' + r.status };
  const d = await r.json().catch(() => null);
  const txt = ((((d && d.candidates) || [])[0] || {}).content || {}).parts || [];
  const s = txt.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed = null;
  try { parsed = JSON.parse(s || 'null'); } catch (e) { parsed = null; } /* guard-ok — جواب لا يُقرأ = لبس، يُعاد أدناه */
  /* others غائب (شكل الجواب القديم) = لا نعرف من غير المراجع في الإطار، فلا توسيع للقصّة (cropRect) */
  return parsed && Array.isArray(parsed.faces) ? { faces: parsed.faces, others: Array.isArray(parsed.others) ? parsed.others : null } : { why: 'locate-parse' };
}

/* التحقّق: صندوق واحد لكلّ مرجع مطلوب (saveyourself اثنان للمرجع ٠)، كلّها sure، تقاطع < ٠٫٣، والوجه ≥ ٦٤ بكسل. أيّ خرق = لا تبديل.
   avoid: كلّ وجه آخر في الإطار (مرجع غير متأكّد، أو بلا مرجع: الزومبي، المشهور، الضيوف) — القصّة تقف دونه فلا يرى النموذج رأسين في Picture 1 */
function validate(list, extra, nRefs, only, multi, H) {
  const all = [], strangers = [];
  for (const o of extra || []) { const b = relBox(o && o.box_2d); if (b) strangers.push({ ref: -1, box: b }); }
  for (const f of list) {
    const k = Number(f && f.ref);
    if (k === -1) { const b = relBox(f.box_2d); if (b) strangers.push({ ref: -1, box: b }); continue; } // وجه بلا مرجع في faces نفسها
    if (!Number.isInteger(k) || k < 0 || k >= nRefs) return { why: 'bad-ref' };
    const box = relBox(f.box_2d);
    if (!box) return { why: 'bad-box' };
    all.push({ ref: k, box, refBox: relBox(f.ref_box), sure: f.sure === true });
  }
  const want = [];
  for (const k of only) {
    const got = all.filter((f) => f.ref === k);
    if (!got.length) return { why: 'missing' };
    if (got.length > (multi && k === 0 ? 2 : 1)) return { why: 'duplicate' };
    for (const f of got) {
      if (!f.sure) return { why: 'unsure' };
      if ((f.box[3] - f.box[1]) * H < FACE_MIN_PX) return { why: 'small' };
      want.push(f);
    }
  }
  /* التقاطع بين كلّ صناديق المراجع، المتأكّد منها وغيره: مرجع ملتبس يلامس وجهًا يُبدَّل = اللصق يكتب فوقه */
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (iou(all[i].box, all[j].box) >= IOU_MAX) return { why: 'overlap' };
  const avoid = all.slice();
  for (const s of strangers) {
    const t = Math.max(0, ...want.map((f) => iou(f.box, s.box)));
    if (t >= DUP_IOU) continue; // الوجه المُبدَّل نفسه مذكورًا مرّتين
    if (t >= IOU_MAX) return { why: 'overlap' };
    avoid.push(s);
  }
  return { want, avoid, known: Array.isArray(extra) };
}

/* هل يدخل الصندوق (نسبيّ) المستطيل (بكسل)؟ */
const touches = (img, b, r) => b[2] * img.w > r.x0 && b[0] * img.w < r.x1 && b[3] * img.h > r.y0 && b[1] * img.h < r.y1;
/* قصّ المستطيل عن وجه آخر عند منتصف المسافة بين الوجهين (قاعدة headRect نفسها)؛ لا فاصل = null */
function apart(img, r, a, b) {
  const [ax0, ay0, ax1, ay1] = [a[0] * img.w, a[1] * img.h, a[2] * img.w, a[3] * img.h];
  const [bx0, by0, bx1, by1] = [b[0] * img.w, b[1] * img.h, b[2] * img.w, b[3] * img.h];
  const o = Object.assign({}, r);
  if (bx0 >= ax1) o.x1 = Math.min(o.x1, Math.floor((ax1 + bx0) / 2));
  else if (bx1 <= ax0) o.x0 = Math.max(o.x0, Math.ceil((bx1 + ax0) / 2));
  else if (by0 >= ay1) o.y1 = Math.min(o.y1, Math.floor((ay1 + by0) / 2));
  else if (by1 <= ay0) o.y0 = Math.max(o.y0, Math.ceil((by1 + ay0) / 2));
  else return null;
  return o;
}

/* قصّة الوجه بالبكسل الأصليّ: headRect (يقف عند منتصف المسافة إلى أقرب وجه) ويُقصّ عن كلّ وجه آخر يدخله، ثمّ يُوسَّع مربّعًا حتّى ٧٦٨
   سياقًا ما لم يدخله وجه آخر — وبلا قائمة others من Flash (known) لا توسيع. أكبر من ١٥٣٦ = يُترك. لا تكبير: image_size يُقرَّب لأعلى
   إلى مضاعف ١٦ فقط، والناتج يُعاد إلى أبعاد القصّة نفسها. */
function cropRect(img, f, others, known) {
  const ctr = (b) => [(b[0] + b[2]) / 2 * img.w, (b[1] + b[3]) / 2 * img.h];
  const [cx, cy] = ctr(f.box);
  const rest = others.filter((o) => o !== f);
  const near = rest.slice().sort((a, b) => { const [ax, ay] = ctr(a.box), [bx, by] = ctr(b.box); return Math.hypot(ax - cx, ay - cy) - Math.hypot(bx - cx, by - cy); })[0];
  const r = mi.headRect(img, f.box, near ? near.box : null);
  if (!r) return { why: 'tight' };
  let rect = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
  for (const o of rest) { if (touches(img, o.box, rect)) rect = apart(img, rect, f.box, o.box); if (!rect) return { why: 'tight' }; }
  const big = Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0);
  if (big > SIDE_MAX) return { why: 'large' };
  const side = Math.min(img.w, img.h, Math.max(SIDE_MIN, big));
  if (known && side > big) {
    const mx = (rect.x0 + rect.x1) / 2, my = (rect.y0 + rect.y1) / 2;
    const x0 = Math.round(Math.max(0, Math.min(img.w - side, mx - side / 2))), y0 = Math.round(Math.max(0, Math.min(img.h - side, my - side / 2)));
    const wide = { x0, y0, x1: x0 + side, y1: y0 + side };
    const hits = rest.some((o) => touches(img, o.box, wide));
    if (!hits) rect = wide;
  }
  if (rect.x1 - rect.x0 < 32 || rect.y1 - rect.y0 < 32) return { why: 'tight' };
  return { rect };
}

/* صورة الردّ: data URI (sync_mode) أو رابط على نطاق المزوّد نفسه (بلا المفتاح) */
async function fetchOut(url, f, signal) {
  const m = /^data:image\/[\w+.-]+;base64,(.+)$/.exec(url);
  if (m) return Buffer.from(m[1], 'base64');
  if (!/^https:\/\/[\w.-]+\.fal\.(?:media|run|ai)\//.test(url)) return null;
  const r = await f(url, { signal });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}
function nearBlack(img) {
  const d = img.data, step = Math.max(1, Math.floor(img.w * img.h / 4096));
  let s = 0, n = 0;
  for (let p = 0; p < img.w * img.h; p += step) { const i = p * 4; s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
  return n ? s / n < BLACK_LUMA : true;
}

/* نداء التبديل لوجه واحد ← صورة مفكوكة بأبعاد القصّة، أو { why } */
async function swapOne(job, o, key) {
  const W = Math.ceil(job.crop.w / 16) * 16, H = Math.ceil(job.crop.h / 16) * 16;
  const lora = loraPath();
  const body = {
    prompt: PROMPT,
    image_urls: ['data:image/jpeg;base64,' + toB64(job.crop, 95), 'data:' + job.ref.mime + ';base64,' + job.ref.b64],
    image_size: { width: W, height: H }, output_format: 'png', sync_mode: true, enable_safety_checker: true, num_images: 1,
  };
  if (lora) body.loras = [{ path: lora, scale: 1 }];
  const f = o.fetchImpl || fetch;
  const signal = AbortSignal.timeout(Math.max(1, o.until - Date.now()));
  const r = await f(SYNC + modelId(), { method: 'POST', headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const j = await r.json().catch(() => null);
  /* refund: المزوّد لم يُنتج شيئًا (غير 2xx أو بلا صورة) — وحده يُردّ حجزه؛ ما بعده صورة مولَّدة محسوبة عليه */
  if (!r.ok) return { why: 'fal-' + r.status, refund: true };
  const url = String((j && j.images && j.images[0] && j.images[0].url) || '');
  if (!url) return { why: 'fal-empty', refund: true };
  const buf = await fetchOut(url, f, signal);
  const img = buf ? decodeImage(buf) : null;
  if (!img || !img.w || !img.h) return { why: 'bad-output' };
  if (Math.abs((img.w / img.h) / (W / H) - 1) > ASPECT_TOL) return { why: 'aspect' };
  if (nearBlack(img)) return { why: 'black' };
  return { img: fc.resample(img, job.crop.w, job.crop.h) };
}

/* لصق بيضاويّ الوجه وحده: الصندوق أعرض ٦٪ وأعلى ٤٪ ويمتدّ ١٨٪ تحت الذقن (اللحية)، وحافة ناعمة ~١٢٪، وتخبو عند حدود القصّة فلا خطّ */
function paste(out, W, job, sw) {
  const { rect, box } = job;
  const fx0 = box[0] * W, fx1 = box[2] * W, fy0 = box[1] * job.H, fy1 = box[3] * job.H;
  const fw = fx1 - fx0, fh = fy1 - fy0;
  const ex0 = fx0 - 0.06 * fw, ex1 = fx1 + 0.06 * fw, ey0 = fy0 - 0.04 * fh, ey1 = fy1 + 0.18 * fh;
  const cx = (ex0 + ex1) / 2, cy = (ey0 + ey1) / 2, rx = (ex1 - ex0) / 2, ry = (ey1 - ey0) / 2;
  const cw = rect.x1 - rect.x0, ch = rect.y1 - rect.y0;
  const edge = Math.max(4, Math.round(Math.min(cw, ch) * 0.04));
  const xa = Math.max(rect.x0, Math.floor(ex0)), xb = Math.min(rect.x1, Math.ceil(ex1));
  const ya = Math.max(rect.y0, Math.floor(ey0)), yb = Math.min(rect.y1, Math.ceil(ey1));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= 1) continue;
      let a = Math.min(1, (1 - r) / FEATHER);
      const de = Math.min(x - rect.x0, rect.x1 - 1 - x, y - rect.y0, rect.y1 - 1 - y);
      a *= Math.max(0, Math.min(1, de / edge));
      if (a <= 0) continue;
      const o = (y * W + x) * 4, s = ((y - rect.y0) * cw + (x - rect.x0)) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(sw.data[s + c] * a + out[o + c] * (1 - a));
    }
  }
}

/**
 * frame: { b64, mime } الإطار المبنيّ؛ refs: [{ data, mime, face }] بترتيب الأشخاص (face = لقطة وجه جاهزة).
 * o: { apiKey (Gemini للربط)، until (آخر لحظة لها، ms)، owner، only ([k…] المراجع التي تُبدَّل؛ الافتراضيّ كلّها)، multi، fetchImpl، kv }.
 * يرجع { b64, mime, swapped, reason } — swapped عدد الوجوه المبدَّلة؛ صفر = الإطار نفسه بايتًا ببايت.
 */
async function lockFaces(frame, refs, opts) {
  const o = Object.assign({}, opts || {});
  const t0 = Date.now();
  const same = (reason) => ({ b64: frame && frame.b64, mime: frame && frame.mime, swapped: 0, reason });
  const keys = [falKey(), o.apiKey];
  let held = 0, kv = null, day = '';
  try {
    if (!frame || !frame.b64) return same('no-frame');
    if (!enabledFor(o.owner)) return same(mode() === 'off' ? 'off' : (falKey() ? 'not-owner' : 'no-key'));
    if (!o.apiKey) return same('no-locator');
    const list = (refs || []).filter((r) => r && r.data);
    if (!list.length) return same('no-refs');
    o.until = Number(o.until) || (t0 + 60000);
    if (o.until - t0 < MIN_LEFT_MS) return same('budget');
    const only = (Array.isArray(o.only) && o.only.length ? o.only : list.map((_, k) => k)).filter((k) => k < list.length);
    const img = decodeImage(Buffer.from(String(frame.b64), 'base64'));
    if (!img) return same('decode');
    const prepared = list.map(prepRef);
    const loc = await locate(o.apiKey, img, prepared, o);
    if (loc.why) return same(loc.why);
    const v = validate(loc.faces, loc.others, prepared.length, only, !!o.multi, img.h);
    if (v.why) return same(v.why);
    /* المهامّ: قصّة الإطار، ووجه المرجع (صورة كاملة بصندوقها = قصّة وجهها؛ وإلّا الصورة المصغّرة نفسها) */
    const jobs = [];
    let skip = '';
    for (const f of v.want) {
      const c = cropRect(img, f, v.avoid, v.known);
      if (c.why) { skip = c.why; continue; }
      let ref = prepared[f.ref];
      if (!ref.face && ref.img && f.refBox) {
        const rr = mi.headRect(ref.img, f.refBox, null);
        if (rr && rr.fh < ref.img.h * 0.45 && rr.x1 - rr.x0 >= 48 && rr.y1 - rr.y0 >= 48) ref = { b64: toB64(mi.shrinkTo(cut(ref.img, rr), 768), 92), mime: 'image/jpeg' };
      }
      jobs.push({ rect: c.rect, crop: cut(img, c.rect), box: f.box, H: img.h, ref });
    }
    if (!jobs.length) return same(skip || 'no-faces');
    if (o.until - Date.now() < 5000) return same('budget');
    /* السقف قبل الصرف: الحجز ذرّيّ (INCRBY) ويُردّ كلّه إن تجاوز، وتعذّر العدّ = لا صرف على عمًى */
    kv = o.kv || require('./kv.js');
    day = new Date().toISOString().slice(0, 10);
    const est = COST_CENTS * jobs.length;
    try {
      const spent = Number(await kv.kvIncrBy(spentKey(day), est));
      held = est;
      if (kv.kvExpire) await kv.kvExpire(spentKey(day), SPENT_TTL_SEC);
      if (!Number.isFinite(spent) || spent > capCents()) { await kv.kvDecrBy(spentKey(day), held); held = 0; return same('cap'); }
    } catch (e) {
      console.error('[face-swap] cap: ' + clean(e && e.message, keys));
      if (held) { try { await kv.kvDecrBy(spentKey(day), held); } catch (e2) { console.error('[face-swap] cap release: ' + clean(e2 && e2.message, keys)); } }
      held = 0;
      return same('cap-error');
    }
    const settled = await Promise.allSettled(jobs.map((j) => swapOne(j, o, falKey())));
    const results = settled.map((s) => (s.status === 'fulfilled' && s.value) ? s.value
      : { why: s.reason && s.reason.name === 'TimeoutError' ? 'timeout' : (s.reason && s.reason.name === 'AbortError' ? 'abort' : 'fal-error') });
    /* يُردّ حجز النداء الذي لم يُنتج شيئًا وحده (refund)؛ الأسود والتالف والنسبة الخاطئة والمهلة والانقطاع بعد الإرسال صُرفت عند المزوّد
       فتبقى محسوبة — وإلّا لا يحدّ السقف الصرف الحقيقيّ */
    const unbilled = results.filter((r) => !r.img && r.refund).length;
    held = 0;
    if (unbilled) {
      try { await kv.kvDecrBy(spentKey(day), COST_CENTS * unbilled); } catch (e) { console.error('[face-swap] refund: ' + clean(e && e.message, keys)); }
    }
    const out = Buffer.from(img.data);
    let n = 0;
    const whys = [];
    results.forEach((r, i) => { if (r.img) { paste(out, img.w, jobs[i], r.img); n++; } else whys.push(r.why); });
    const why = whys.concat(skip ? [skip] : []).filter(Boolean).join(',');
    console.log('[face-swap] ' + n + '/' + (jobs.length + (skip ? 1 : 0)) + ' faces' + (why ? ' why=' + why : '') + ' in ' + (Date.now() - t0) + 'ms');
    if (!n) return same(why || 'failed');
    return { b64: Buffer.from(fc.encodeJpeg({ w: img.w, h: img.h, data: out }, 92)).toString('base64'), mime: 'image/jpeg', swapped: n, reason: why };
  } catch (e) {
    if (held && kv) { try { await kv.kvDecrBy(spentKey(day), held); } catch (e2) { console.error('[face-swap] release: ' + clean(e2 && e2.message, keys)); } }
    const why = e && e.name === 'TimeoutError' ? 'timeout' : clean(e && e.message ? e.message : e, keys);
    console.warn('[face-swap] skipped: ' + why);
    return same(why || 'error');
  }
}

module.exports = { lockFaces, enabledFor, mode, capCents, modelId, loraPath, PROMPT, COST_CENTS, CAP_CENTS_DEFAULT, LORA_DEFAULT, MODEL_LORA, MODEL_PLAIN, spentKey, MIN_LEFT_MS };
