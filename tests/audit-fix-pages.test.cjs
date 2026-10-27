// tests/audit-fix-pages.test.cjs — v-audit-pages: إصلاحات فحص «الصفحات المستقلّة» (p.html واستوديو الإعلانات).
// كلّ اختبار يشغّل الكود الحقيقيّ من الملفّ (vm على DOM مزيّف أو دالّة مستخرجة) ويفشل على الأساس قبل الإصلاح.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pHtml = read('p.html');
const indexHtml = read('index.html');
const uiJs = read('js/app-05-ui.js');
const ad = read('ad-studio.html');

/* مقطع من الملفّ بين علامتين (الأولى مشمولة، الثانية لا) */
function cut(src, from, to) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, 'لم يُعثر على: ' + from);
  const b = src.indexOf(to, a + from.length);
  assert.ok(b > a, 'لم يُعثر على نهاية المقطع: ' + to);
  return src.slice(a, b);
}
const sandboxOf = (html, id) => {
  const m = html.match(new RegExp('<iframe id="' + id + '"[^>]*\\ssandbox="([^"]*)"'));
  assert.ok(m, 'إطار بلا sandbox: ' + id);
  return m[1].trim().split(/\s+/).sort();
};

/* ===== p.html: الطبقة البديلة والمحقن كما في المعاينة ===== */
const APP_SHIM = vm.runInNewContext('(' + uiJs.match(/const OMRAN_PREVIEW_SHIM = ('[^\n]*');\n/)[1] + ')');
const appInject = (() => {
  const ctx = { OMRAN_PREVIEW_SHIM: APP_SHIM, String };
  vm.createContext(ctx);
  vm.runInContext(cut(uiJs, 'function omranPreviewInject(code){', 'function omranSetPreview('), ctx);
  return ctx.omranPreviewInject;
})();
const pScript = pHtml.slice(pHtml.lastIndexOf('<script>') + 8, pHtml.lastIndexOf('</script>'));

function runP(code) {
  const mk = () => ({ textContent: '', style: {}, dir: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild() {}, set srcdoc(v) { this._src = v; }, get srcdoc() { return this._src; } });
  const byId = {};
  for (const k of ['state', 'frame', 'pTitle', 'pMeta', 'chatWrap', 'chatInner']) byId[k] = mk();
  byId.omMadeWith = Object.assign(mk(), { querySelector: () => null });
  const ctx = {
    document: { getElementById: (k) => byId[k] || null, createElement: mk, createTextNode: (t) => ({ t }), documentElement: {}, title: '' },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { language: 'en-US' },
    location: { search: '?id=abc' },
    URLSearchParams, Date, JSON, Promise, String, Array, encodeURIComponent, console,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ title: 't', username: 'sara', createdAt: 0, code }) }),
  };
  vm.createContext(ctx);
  vm.runInContext(pScript, ctx);
  return byId;
}
const settle = () => new Promise((r) => setTimeout(r, 20));

/* يشغّل كلّ <script> في srcdoc بالترتيب داخل إطار «معزول»: localStorage يرمي SecurityError كما في أصل null */
function runSandboxed(srcdoc) {
  const box = { out: {} };
  Object.defineProperty(box, 'localStorage', { configurable: true, get() { const e = new Error('The document is sandboxed and lacks the allow-same-origin flag.'); e.name = 'SecurityError'; throw e; } });
  Object.defineProperty(box, 'sessionStorage', { configurable: true, get() { const e = new Error('sandboxed'); e.name = 'SecurityError'; throw e; } });
  box.window = box;
  vm.createContext(box);
  const scripts = [...String(srcdoc).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const s of scripts) vm.runInContext(s, box);
  return box.out;
}

test('pages-static-1: إطار p.html بأعلام المعاينة نفسها (نماذج ونوافذ تنبيه) وبلا allow-same-origin', () => {
  const p = sandboxOf(pHtml, 'frame');
  const preview = sandboxOf(indexHtml, 'previewFrame');
  assert.deepEqual(p, preview, 'أعلام p.html تختلف عن previewFrame');
  for (const f of ['allow-scripts', 'allow-forms', 'allow-modals']) assert.ok(p.includes(f), 'ناقص ' + f);
  assert.ok(!p.includes('allow-same-origin'), 'الكود المشترك يصل إلى أصل الموقع وتوكنه');
  assert.ok(!p.includes('allow-top-navigation'), 'الكود المشترك يقدر يحوّل الزائر إلى صفحة أخرى');
});

test('pages-static-1: كود المشروع المشترك يُحقن بطبقة التخزين نفسها قبل srcdoc فيعمل تطبيق يحفظ حالته', async () => {
  const code = '<!DOCTYPE html><html><head><title>todo</title></head><body><script>localStorage.setItem("todo","milk"); out.v = localStorage.getItem("todo");</script></body></html>';
  const byId = runP(code);
  await settle();
  const src = byId.frame.srcdoc;
  assert.equal(src, appInject(code), 'حقن p.html يختلف عن omranPreviewInject في المعاينة');
  assert.ok(src.includes(APP_SHIM), 'الطبقة ليست OMRAN_PREVIEW_SHIM نفسها');
  assert.equal(byId.frame.style.display, 'block');
  // كود بلا <head> ولا <html>: الطبقة في رأسه
  const bare = runP('<div id="x"></div><script>out.v=1</script>');
  await settle();
  assert.ok(bare.frame.srcdoc.startsWith(APP_SHIM), 'الطبقة ليست أوّل الكود');
  // التشغيل الفعليّ: بلا الطبقة يرمي localStorage فيتوقّف سكربت التطبيق
  const out = runSandboxed(src);
  assert.equal(out.v, 'milk', 'التطبيق المشترك لم يقرأ ما حفظه');
});

/* ===== استوديو الإعلانات ===== */
function adCtx(extra) {
  const ctx = Object.assign({ String, Object, Array, Math, JSON, Set, Number, RegExp, ARN: false }, extra || {});
  vm.createContext(ctx);
  return ctx;
}

test('pages-static-6: المربّع النصّيّ الحرّ يحمل موضعه وحجمه في style — لا علامة تنصيص زائدة', () => {
  const ctx = adCtx({ FREE: { 0: [{ t: 'نصّ <b>', x: 38, y: 44, s: 2.4 }, { t: 'ب', x: 12.5, y: 70 }] } });
  vm.runInContext(cut(ad, 'function esc(s){', '\nfunction render(){'), ctx);
  vm.runInContext(cut(ad, 'function cFree(i){', '\n\n/* ================= اللوحات الثلاث'), ctx);
  const h = ctx.cFree(0);
  assert.doesNotMatch(h, /style=""/, 'style فارغ — الموضع صار اسم سمة');
  const styles = [...h.matchAll(/<div class="fbx"[^>]*?\sstyle="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(styles.length, 2);
  assert.match(styles[0], /^left:38%;top:44%;font-size:calc\(var\(--u\)\*2\.4\)$/);
  assert.match(styles[1], /^left:12\.5%;top:70%;font-size:calc\(var\(--u\)\*2\.4\)$/);
  assert.ok(h.includes('>نصّ &lt;b&gt;</div>'), 'النصّ لم يمرّ بـesc');
});

function adRender(S) {
  const grid = { innerHTML: '' };
  const ctx = adCtx({
    S, T: (k) => k, initDrag() {}, NAMES: Array(10).fill('n'), CAPS: Array(10).fill('c'),
    CATS: { car: { ac: '#e0a94a', grad: 'none', title: 'لاندكروزر', spec: 'خليجي · ممشى', price: '49000', unit: 'درهم', kick: 'للبيع · دبي', chips: ['أ', 'ب', 'ج'] } },
    document: { getElementById: (k) => (k === 'grid' ? grid : null), querySelector: () => null },
  });
  vm.runInContext(cut(ad, 'function fmtNum(x){', 'function nums(t){'), ctx);
  vm.runInContext(cut(ad, 'function esc(s){', '\nfunction render(){'), ctx);
  vm.runInContext(cut(ad, 'function render(){', '\n/* ================= سحب حرّ'), ctx);
  ctx.render();
  return grid.innerHTML;
}

test('x-prod-4: بلا رقم من المستخدم لا يُطبع رقم ثابت غريب، ويُخفى سطر التواصل في التصاميم العشرة', () => {
  const S = { cat: null, title: '', spec: '', price: '', unit: '', tel: '', kick: '', chips: null };
  const ctx = adCtx({ S, CATS: { car: { price: '49000' } }, askPhoto() {} });
  vm.runInContext(cut(ad, 'function fmtNum(x){', 'function nums(t){'), ctx);
  vm.runInContext(cut(ad, 'function nums(t){', '\n\n/* ================= خطوات المحادثة'), ctx);
  vm.runInContext(cut(ad, 'function step2(t){', 'function askPhoto(){'), ctx);
  S.cat = 'car';
  ctx.step2('السعر ٤٥٠٠٠');
  assert.equal(S.price, '45,000');
  assert.equal(S.tel, '', 'رقم افتراضيّ وُضع بدل رقم المستخدم');
  ctx.step2('السعر 45000 والرقم 0501234567');
  assert.equal(S.tel, '050 123 4567', 'رقم المستخدم الحقيقيّ لم يُلتقط');

  const none = adRender({ cat: 'car', tel: '', chosen: null });
  assert.doesNotMatch(none, /0108|050 504/, 'الرقم الثابت ما زال يُرسم في الملصق');
  assert.doesNotMatch(none, /<bdi dir="ltr"><\/bdi>/, 'خانة رقم فارغة في الملصق');
  assert.doesNotMatch(none, /lblContact/, 'عنوان «للتواصل» بلا رقم');
  assert.equal((none.match(/class="canvas /g) || []).length, 10, 'تصميم سقط');

  const withTel = adRender({ cat: 'car', tel: '055 765 4321', chosen: null });
  assert.equal((withTel.match(/<bdi dir="ltr">055 765 4321<\/bdi>/g) || []).length, 10, 'رقم المستخدم لا يظهر في كلّ تصميم');
  // الرقم المثال باقٍ داخل «استخدم مثالًا جاهزًا» وحده
  assert.equal((ad.match(/050 504 0108/g) || []).length, 1);
  assert.match(cut(ad, "setChips([{t:T('useExample')", '\n'), /S\.tel='050 504 0108'/);
});

/* صورة وهميّة بمقاس معيّن، وقماش يسجّل ما رُسم عليه */
function imgEnv({ w, h, rawLen, type }) {
  const drawn = [];
  const raw = 'data:' + type + ';base64,' + 'A'.repeat(rawLen);
  class FileReader { readAsDataURL() { setTimeout(() => { this.result = raw; this.onload && this.onload(); }, 0); } }
  class Image { set src(v) { this._s = v; this.naturalWidth = w; this.naturalHeight = h; setTimeout(() => this.onload && this.onload(), 0); } get src() { return this._s; } }
  const document = {
    createElement: (tag) => {
      assert.equal(tag, 'canvas');
      const cv = {
        width: 0, height: 0,
        getContext: () => ({ drawImage: (im, x, y, dw, dh) => drawn.push({ dw, dh }), set imageSmoothingQuality(v) { cv.q = v; } }),
        toDataURL: (mt, q) => { cv.mt = mt; cv.quality = q; return 'data:' + mt + ';base64,' + 'B'.repeat(Math.round(cv.width * cv.height * 0.3)); },
      };
      drawn.canvas = cv;
      return cv;
    },
  };
  return { raw, drawn, FileReader, Image, document };
}
function loadRd(env) {
  const ctx = adCtx({ FileReader: env.FileReader, Image: env.Image, document: env.document, Promise, setTimeout });
  vm.runInContext(cut(ad, '/* ================= المحرّر على اللوحة ================= */', '\nlet PEND=null'), ctx);
  return ctx;
}

test('pages-static-5: صورة الهاتف تُصغَّر عند الرفع إلى ٢٠٤٨ بكسل للضلع الأطول بجودة ٩٠ قبل أن تصل الطلب', async () => {
  const env = imgEnv({ w: 4032, h: 3024, rawLen: 5_400_000, type: 'image/jpeg' }); // ≈ ٤ م.ب من الهاتف
  const ctx = loadRd(env);
  const out = await ctx.rdFile({ name: 'car.jpg', type: 'image/jpeg', size: 4_000_000 });
  assert.ok(env.drawn.length >= 1, 'الصورة لم تُرسم على قماش للتصغير');
  assert.deepEqual(env.drawn[0], { dw: 2048, dh: 1536 });
  assert.equal(env.drawn.canvas.mt, 'image/jpeg');
  assert.equal(env.drawn.canvas.quality, 0.9);
  assert.ok(out.startsWith('data:image/jpeg;base64,'), out.slice(0, 30));
  // الطلب كلّه تحت حدّ Vercel (٤٫٥ م.ب) بهامش
  assert.ok(out.length < 3_500_000, 'ما زالت أكبر من سقف الطلب: ' + out.length);
  assert.ok(out.length < env.raw.length);

  // PNG (شعار أو قصّة بخلفيّة شفّافة) لا تتحوّل JPEG فتفقد شفافيّتها
  const png = imgEnv({ w: 3000, h: 3000, rawLen: 6_000_000, type: 'image/png' });
  const p = await loadRd(png).rdFile({ name: 'logo.png', type: 'image/png', size: 4_500_000 });
  assert.notEqual(png.drawn.canvas.mt, 'image/jpeg');
  assert.ok(p.length < 3_500_000);

  // صورة صغيرة أصلًا تبقى كما هي — لا ضغط فوق ضغط
  const small = imgEnv({ w: 1200, h: 900, rawLen: 400_000, type: 'image/jpeg' });
  const s = await loadRd(small).rdFile({ name: 's.jpg', type: 'image/jpeg', size: 300_000 });
  assert.equal(s, small.raw);
  assert.equal(small.drawn.length, 0);
});

test('pages-static-5: مسارا الرفع (الصورة الرئيسيّة وخانات اللوحة) يمرّان بالتصغير نفسه', () => {
  const main = cut(ad, 'fileEl.onchange=e=>{', '\nfunction done(){');
  assert.doesNotMatch(main, /readAsDataURL/, 'الصورة الرئيسيّة ما زالت تُقرأ كما هي');
  assert.match(main, /rdFile\(f\)/);
  assert.match(cut(ad, 'fSlot.onchange=async e=>{', '\n};'), /await rdFile\(f\)/);
  // قراءة الملفّ الخامّ في موضع واحد: داخل مسار التصغير
  assert.equal((ad.match(/readAsDataURL/g) || []).length, 1);
});
