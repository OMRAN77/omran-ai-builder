// tests/trend-people.test.cjs — v-trend-people (طلب المالك: «اقدر اضيف شخصيات يعني مش شخصيه
// وحده في الفيديو ٢ او ٣»): شريط شخصيّات بدل زرّ صورة واحدة في لوحة الترندات. هذا نصف الواجهة
// وحده؛ نصف الخادم (دمج الصور في مرجع واحد) موقوف على قرار المالك في النسبة والتكلفة، ولذلك
// يثبّت الاختبار أيضًا أنّ الصور الزائدة تُرسل في حقل مستقلّ ولا تكسر المسار القائم بصورة واحدة.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const SRC = read('js/app-11-video-trends.js');
const UI = (() => { const c = { window: {} }; vm.runInNewContext(read('js/app-11-video-trends-data.js'), c); return c.window.__VIDEO_TRENDS.ui; })();
const LANGS = Object.keys(UI.fail);

// ── بيئة DOM مصغّرة تكفي renderPeople الحقيقيّة ──
function mk(tag) {
  const e = {
    tag, id: '', type: '', accept: '', multiple: false, files: null,
    children: [], textContent: '', onclick: null, onchange: null,
    style: { cssText: '' },
    setAttribute() {}, appendChild(c) { this.children.push(c); return c; },
    querySelector(sel) {
      const want = sel.replace(/^input\[type=(\w+)\]$/, '$1');
      for (const c of this.children) { if (c.tag === 'input' && c.type === want) return c; const d = c.querySelector && c.querySelector(sel); if (d) return d; }
      return null;
    },
  };
  Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set() { this.children.length = 0; } });
  return e;
}
/** يشغّل renderPeople الحقيقيّة من المصدر فوق مصفوفة photos معطاة. */
function env(initial) {
  const i = SRC.indexOf('  function renderPeople(strip, t){');
  const j = SRC.indexOf('  function openTrend(t){', i);
  assert.ok(i > 0 && j > i, 'renderPeople موجودة في المصدر');
  const maxLine = SRC.match(/var MAX_PEOPLE = (\d+);/);
  assert.ok(maxLine, 'MAX_PEOPLE معرّفة');
  const ctx = {
    photos: (initial || []).slice(), busy: false, MAX_PEOPLE: Number(maxLine[1]),
    ui: (k) => UI[k].ar, document: { createElement: mk }, FileReader: function () {},
    Array, String, Number, Event: function () {},
  };
  vm.runInNewContext(SRC.slice(i, j) + '\nthis.renderPeople = renderPeople;', ctx);
  return ctx;
}
const strip = () => mk('div');
const filled = (s) => s.children.filter((c) => c.tag === 'div' && /rgba\(212,175,55/.test(c.style.cssText)).length;
const adders = (s) => s.children.filter((c) => c.tag === 'div' && /dashed/.test(c.style.cssText)).length;

test('١. الشريط: بلا صور مربّع «＋» واحد، وبصورتين مربّعان ومربّع إضافة، وبثلاث لا إضافة', () => {
  const t = { photo: 'req' };
  let c = env([]); let s = strip(); c.renderPeople(s, t);
  assert.deepEqual([filled(s), adders(s)], [0, 1], 'فارغ = مربّع إضافة وحده');

  c = env([{ dataUrl: 'data:image/png;base64,AA', mime: 'image/png' }, { dataUrl: 'data:image/png;base64,BB', mime: 'image/png' }]);
  s = strip(); c.renderPeople(s, t);
  assert.deepEqual([filled(s), adders(s)], [2, 1], 'شخصيّتان + مكان ثالث');

  c = env([1, 2, 3].map((n) => ({ dataUrl: 'data:image/png;base64,' + n, mime: 'image/png' })));
  s = strip(); c.renderPeople(s, t);
  assert.deepEqual([filled(s), adders(s)], [3, 0], 'الحدّ ٣ يخفي مربّع الإضافة');
  assert.equal(c.MAX_PEOPLE, 3);
});

test('٢. الترقيم يتبع ترتيب الرفع، و✕ تشيل الشخصيّة وتعيد الترقيم', () => {
  const t = { photo: 'req' };
  const c = env([{ dataUrl: 'd:,1', mime: 'image/png' }, { dataUrl: 'd:,2', mime: 'image/png' }]);
  const s = strip(); c.renderPeople(s, t);
  const labels = s.children.flatMap((x) => (x.children || []).map((y) => y.textContent)).filter((x) => x && /شخصية/.test(x));
  assert.deepEqual(labels, ['شخصية 1', 'شخصية 2', 'شخصية 3'], 'الاثنتان ثمّ مكان الثالثة');

  // ✕ على الأولى: تبقى الثانية وحدها وتصير «شخصية 1»
  const x = s.children[0].children.find((y) => y.textContent === '✕');
  assert.ok(x && typeof x.onclick === 'function');
  x.onclick();
  assert.equal(c.photos.length, 1);
  assert.equal(c.photos[0].dataUrl, 'd:,2', 'المحذوفة هي الأولى لا الأخيرة');
  assert.deepEqual([filled(s), adders(s)], [1, 1]);

  // أثناء الإنشاء لا حذف ولا إضافة
  const c2 = env([{ dataUrl: 'd:,1', mime: 'image/png' }]); c2.busy = true;
  const s2 = strip(); c2.renderPeople(s2, t);
  s2.children[0].children.find((y) => y.textContent === '✕').onclick();
  assert.equal(c2.photos.length, 1, 'الحذف مقفول أثناء الإنشاء');
});

test('٣. الحمولة: الأولى تبقى imageBase64 (توافق)، والزائدة في imagesBase64 وحدها', () => {
  assert.match(SRC, /payload\.imageBase64 = raw\[0\]\.b64; payload\.imageMime = raw\[0\]\.mime;/);
  assert.match(SRC, /if\(raw\.length > 1\)\{ payload\.imagesBase64 = raw\.map/, 'لا حقل زائد لصورة واحدة');
  assert.match(SRC, /payload\.params = Object\.assign\(\{\}, params, \{ people: raw\.length \}\)/, 'عدد الأشخاص يصل للخادم');
  assert.match(SRC, /if\(t\.photo === 'req' && !photos\.length\)\{ status\(ui\('photoReq'\)\); return; \}/, 'الترند الذي يلزمه صورة يفحص المصفوفة');
  assert.ok(!/\bphoto\s*=\s*null\b/.test(SRC), 'لا بقايا من المتغيّر المفرد');
  assert.match(SRC, /fi\.multiple = true/, 'اختيار عدّة صور دفعة واحدة');
});

test('٤. النصّان الجديدان في الـ14 لغة، و«شخصية {n}» فيها المتغيّر، وبلا اسم مزوّد', () => {
  assert.equal(LANGS.length, 14);
  for (const l of LANGS) {
    assert.ok(UI.people && UI.people[l], 'people ناقصة: ' + l);
    assert.ok(UI.person && UI.person[l], 'person ناقصة: ' + l);
    assert.ok(UI.person[l].includes('{n}'), 'person بلا {n}: ' + l);
    assert.ok(!/veo|runway|minimax|gemini|claude/i.test(UI.people[l] + UI.person[l]), 'اسم مزوّد: ' + l);
  }
});

test('٥. الحزمة مبنيّة من الأجزاء', () => {
  const b = read('js/app.bundle.js');
  assert.ok(b.includes('function renderPeople(strip, t){'), 'الجزء داخل الحزمة');
});

/* v-trend-413 (المالك بلقطة «❌ تعذّر: HTTP 413» مع شخصيّتين): الصور كانت تُقرأ خامًا،
   وصورة جوّال واحدة تكفي لتجاوز حدّ حجم جسم الطلب عند حافّة الاستضافة. */
test('٦. صور الشخصيّات تُصغَّر قبل الإرسال — لا قراءة خام', () => {
  // لا تُدفع نتيجة readAsDataURL مباشرة إلى photos
  assert.doesNotMatch(SRC, /photos\.push\(\{\s*dataUrl:\s*String\(r\.result\)/, 'ما زالت الصورة تُقرأ خامًا');
  assert.match(SRC, /shrink\(f, function\(dataUrl\)\{/, 'اختيار الملفّ لا يمرّ على التصغير');
  // وصفة التصغير نفسها المثبَتة في مودالات الاستوديو (v530)
  assert.match(SRC, /var SHRINK_MAX = 1400, SHRINK_Q = 0.85;/, 'حدّ التصغير أو الجودة تغيّرا');
  assert.match(SRC, /c\.getContext\('2d'\)\.drawImage\(img, 0, 0, w, h\)/, 'لا رسم على canvas');
  assert.match(SRC, /toDataURL\('image\/jpeg', SHRINK_Q\)/, 'لا إعادة ترميز JPEG');
  assert.match(SRC, /photos\.push\(\{ dataUrl: dataUrl, mime: 'image\/jpeg' \}\)/, 'نوع الصورة بعد التصغير');

  // حساب الأبعاد الحقيقيّ من المصدر: ٤٠٠٠×٣٠٠٠ ⇒ ١٠٢٤×٧٦٨، والصغيرة لا تُكبَّر
  const body = SRC.slice(SRC.indexOf('function shrink(file, done){'), SRC.indexOf('\n  }', SRC.indexOf('r.readAsDataURL(file);')) + 4);
  const ctx = { document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,QUJD' }) }, Math, String, out: null };
  ctx.FileReader = function () { this.readAsDataURL = () => { this.result = 'x'; this.onload(); }; };
  const sizes = [[4000, 3000], [800, 600]];
  const got = [];
  for (const [w, h] of sizes) {
    ctx.Image = function () { const self = this; setImmediate(() => {}); Object.defineProperty(self, 'src', { set() { self.width = w; self.height = h; self.onload(); } }); };
    const c2 = Object.assign({ SHRINK_MAX: 1400, SHRINK_Q: 0.85 }, ctx);
    c2.document.createElement = () => { const c = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,QUJD' }; got.push(c); return c; };
    vm.runInNewContext(body + '\nshrink({}, function(){});', c2);
  }
  assert.deepEqual(got.map((c) => [c.width, c.height]), [[1400, 1050], [800, 600]], 'التصغير لا يحترم الحدّ أو يكبّر الصغيرة');
});

test('٧. «٤١٣» يُترجَم لرسالة مفهومة بالـ14 لغة، لا رمزًا خامًا', () => {
  assert.match(SRC, /if\(\/\\b413\\b\/\.test\(String\(\(e && e\.message\) \|\| ''\)\)\) return ui\('tooBig'\);/, 'لا ترجمة لرمز ٤١٣');
  assert.ok(UI.tooBig, 'نصّ tooBig غير موجود');
  assert.deepEqual(Object.keys(UI.tooBig).sort(), LANGS.slice().sort(), 'tooBig ناقص في بعض اللغات');
  for (const l of LANGS) {
    assert.ok(String(UI.tooBig[l]).trim().length > 8, l);
    assert.doesNotMatch(String(UI.tooBig[l]), /413|HTTP|Veo|MiniMax|Gemini|Runway/i, l + ': رمز تقنيّ أو اسم مزوّد في نصّ المستخدم');
  }
});

/* v-trend-identity (المالك بلقطتين: صورة ابنه مقابل ناتج «بيبي ستايل» — «يغيّر الأشكال، شوف
   الاختلاف الكبير»): قوالب الترندات «حوّل الشخص إلى…» وأقوى حفظ فيها ثلاث كلمات في الذيل. */
const TRENDS = require('../api/_lib/video-trends.js');

test('٨. كلّ ترند معه صورة يُختم بقفل هويّة، وبلا صورة لا يُلحق', () => {
  const keys = Object.keys(TRENDS.TRENDS);
  assert.ok(keys.length >= 40, 'عدد الترندات');
  let withPhoto = 0;
  for (const k of keys) {
    const withImg = TRENDS.buildTrendPrompt(k, { hasImage: true, name: 'عمران', text: 'مرحبا' });
    const noImg = TRENDS.buildTrendPrompt(k, { hasImage: false, name: 'عمران', text: 'مرحبا' });
    assert.ok(withImg && noImg, k);
    assert.match(withImg.prompt, /IDENTITY \(mandatory\)/, k + ': بلا قفل هويّة مع الصورة');
    assert.match(withImg.prompt, /same real person as in the reference image/, k);
    assert.match(withImg.prompt, /Never replace them with a different, prettier or more generic face/, k);
    assert.doesNotMatch(noImg.prompt, /IDENTITY \(mandatory\)/, k + ': قفل هويّة بلا صورة مرجعيّة');
    // القفل آخر ما يُقرأ حين يكون شخصًا واحدًا (شرط الأشخاص يليه عمدًا حين يزيدون)
    assert.ok(withImg.prompt.trimEnd().endsWith('more generic face.'), k + ': القفل ليس في الذيل');
    withPhoto++;
  }
  assert.equal(withPhoto, keys.length);
  // القفل يحفظ الهويّة عبر التحويل لا ضدّه — «بيبي ستايل» يبقى أمره قائمًا
  const baby = TRENDS.buildTrendPrompt('babyversion', { hasImage: true }).prompt;
  assert.match(baby, /toddler version of themselves/, 'أمر الترند نفسه ضاع');
  assert.ok(baby.indexOf('IDENTITY (mandatory)') > baby.indexOf('toddler version'), 'القفل قبل أمر الترند');
  // وشرط تعدّد الأشخاص يبقى بعده
  const two = TRENDS.buildTrendPrompt('babyversion', { hasImage: true, people: 2 }).prompt;
  assert.ok(two.indexOf('IMPORTANT — the reference image contains 2') > two.indexOf('IDENTITY (mandatory)'));
});

test('٩. مع إطار أوّل مبنيّ: أمر صريح بتحريكه بدل إعادة التحويل فوقه', () => {
  const src = read('api/_lib/veo-create.js');
  const at = src.indexOf('if (frame && frame.b64) {');
  assert.ok(at > 0, 'فرع نجاح الإطار الأوّل');
  const blk = src.slice(at, at + 1200);
  assert.match(blk, /imageBase64 = frame\.b64; imageMime = frame\.mime;/);
  assert.match(blk, /promptText \+= ' The attached first frame ALREADY shows every person/, 'لا أمر بتحريك الإطار الجاهز');
  assert.match(blk, /do not apply the transformation again/, 'لا منع لإعادة التحويل');
  // يُلحق بعد بناء أمر الترند لا قبله (وإلّا غلبته قوالب «حوّل الشخص إلى…»)
  assert.ok(src.indexOf('buildTrendPrompt') < at, 'الإلحاق قبل بناء أمر الترند');
});
