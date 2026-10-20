'use strict';
/* v-edu-scenes (المالك ٢٠ أكتوبر): «نفس هذي الفكرة [نماذجه: مشهد مكتب والواجهة على شاشة فيه]… ٢٤ ثيم يعني بيكونون ٤٨، ابدأ كمّل عليهم لكن
   ما أريد الصور مغبّشة… ما أريد شي يكون تحته وتكون الكتابة مرتبة… الخطوط بألوان الثيم». قسم التعليم مع ثيمات «خلفيّات الشاشة» الـ٢٤:
   مشهد كامل بلا كتابة (edu-bg في thumbs-paid.mjs بدقّة المولّد الأصليّة)، شاشته الفاضية تُقاس من الصورة (edu-bg-measure)، والواجهة
   فوقها مباشرةً بألوان الثيم (CSS مولَّد من meta.json). بلا ثيم لا يتغيّر شيء. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const GEN = read('scripts/thumbs-paid.mjs');
const CSS = read('css/تعليم-خلفية.css');
const EDU = read('js/edu.js');
const PLUS = read('js/edu-plus.js');
const HTML = read('index.html');
const BG = read('js/app-25-خلفيات.js');
const SKINS = ['wood'].concat([...BG.matchAll(/\['[^']+', '([a-z]+)', 'bgTheme/g)].map((m) => m[1]));
const LANGS = ['fr', 'hi', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];

test('١. ثيمات التطبيق الـ٢٤ كلّها في المولّد وفي CSS، بنسختي حاسوب وجوّال', async () => {
  assert.strictEqual(SKINS.length, 24, SKINS.join(' '));
  const mod = await import(path.join(ROOT, 'scripts/edu-bg-css.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  assert.deepStrictEqual([...mod.SKINS].sort(), [...SKINS].sort(), 'قائمة المولّد = ثيمات app-25');
  const skinsInGen = [...GEN.matchAll(/\n  ([a-z]+): \{ screen: '#[0-9a-f]{6}', style: '/g)].map((m) => m[1]);
  assert.deepStrictEqual(skinsInGen.sort(), [...SKINS].sort(), 'EDU_SKINS في thumbs-paid');
  for (const k of SKINS) {
    assert.ok(CSS.includes('html.skin-' + k + ':root:root #eduHubModal{--edu-d:url("/assets/edu-bg/skin-' + k + '-desktop.webp?v='), k + ' حاسوب');
    assert.ok(CSS.includes('--edu-m:url("/assets/edu-bg/skin-' + k + '-mobile.webp?v='), k + ' جوّال');
  }
});

test('٢. المولّد: وضع edu-bg — مشهد بشاشة فاضية بلون واحد، لا نصّ، دقّة أصليّة (لا سقف ١٩٥KB)، يُكتب في assets/edu-bg', () => {
  assert.ok(/isMode\('edu-bg'\)/.test(GEN), 'الوضع');
  assert.ok(/EDU_DESK = \(s\) =>[\s\S]*?screen spans from 27 percent to 97 percent of the image width and from 7 percent to 91 percent/.test(GEN), 'هندسة الحاسوب');
  assert.ok(/EDU_PHONE = \(s\) =>[\s\S]*?screen spans from 6 percent to 94 percent of the image width and from 12 percent to 86 percent/.test(GEN), 'هندسة الجوّال');
  assert.ok(/one perfectly uniform, smooth, matte, solid color ' \+ s\.screen \+ ' with absolutely nothing on it/.test(GEN), 'الشاشة فاضية بلون الثيم');
  assert.ok(/EDU_NO_TEXT = ' No people\. Absolutely no text, no letters, no numbers/.test(GEN), 'ممنوع النصّ');
  assert.ok(/every book spine and cover is completely blank/.test(GEN), 'الكتب فاضية');
  assert.ok(/name: 'skin-' \+ k \+ '-desktop', shape: 'land16', cap: 8192/.test(GEN) && /name: 'skin-' \+ k \+ '-mobile', shape: 'port', cap: 8192/.test(GEN), 'cap كبير = الدقّة الأصليّة');
  assert.ok(/const CAP = j\.cap \|\| \(/.test(GEN), 'save يحترم j.cap');
  assert.ok(!/EDU_MAX/.test(GEN) && !/saveEdu/.test(GEN), 'لا سقف حجم يغبّش');
  assert.ok(/edubg: 'assets\/edu-bg'/.test(GEN) && /j\.kind === 'edubg' \? OUT_DIR\.edubg : 'thumbs\/' \+ j\.kind/.test(GEN), 'يُكتب في assets مباشرةً (الورك فلو يضيف assets كلّها)');
  assert.ok(/webp\(\{ quality: 90 \}\)/.test(GEN), 'q90');
});

test('٣. CSS مطابق للمولَّد من meta.json، والواجهة فوق الشاشة بلا لوح وبألوان الثيم', async () => {
  const mod = await import(path.join(ROOT, 'scripts/edu-bg-css.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  const metaPath = path.join(ROOT, 'assets/edu-bg/meta.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  assert.strictEqual(CSS, mod.build(meta), 'css/تعليم-خلفية.css = build(meta.json)');
  // حساب cover نفسه: s = max(100cqw/W, 100cqh/H) والإزاحة نصف الفائض، والواجهة بكسور الشاشة
  assert.ok(/container-type:size;--edu-s:max\(calc\(100cqw \/ var\(--edu-dw\)\),calc\(100cqh \/ var\(--edu-dh\)\)\)/.test(CSS), 'مقياس cover');
  assert.ok(/--edu-bl:calc\(var\(--edu-ox\) \+ var\(--edu-x0\) \* var\(--edu-w\) \* var\(--edu-s\)\);--edu-bt:calc\(var\(--edu-oy\) \+ var\(--edu-y0\) \* var\(--edu-h\) \* var\(--edu-s\)\)/.test(CSS), 'حدود الشاشة من كسورها');
  assert.ok(/\.eduWrap\{position:absolute !important;left:max\(var\(--edu-bl\),0px\) !important;top:max\(var\(--edu-bt\),0px\) !important;width:calc\(min\(var\(--edu-br\),100cqw\) - max\(var\(--edu-bl\),0px\)\) !important;height:calc\(min\(var\(--edu-bb\),100cqh\) - max\(var\(--edu-bt\),0px\)\) !important/.test(CSS), 'الواجهة فوق الشاشة مقصوصة على النافذة');
  assert.ok(/\.eduUpOv\{background:var\(--edu-sc\) !important/.test(CSS) && /--edu-dsc:#[0-9a-f]{6};/.test(CSS), 'نموذج المحاضرة فوق لون الشاشة المقيس');
  assert.ok(/\.eduWrap\{[^}]*background:transparent !important;border:none !important;box-shadow:none !important/.test(CSS), 'لا لوح تحت الواجهة');
  assert.ok(/\.eduHead\{position:relative;z-index:6;background:transparent !important;border-bottom:none !important/.test(CSS) && /\.eduBody\{background:transparent !important/.test(CSS), 'الرأس والصفحة شفّافان، والرأس فوق طبقة النموذج');
  assert.ok(/\.eduUpCard\{background:transparent !important;border:none !important;box-shadow:none !important/.test(CSS), 'نموذج المحاضرة بلا بطاقة معتمة');
  assert.ok(!/backdrop-filter:blur/.test(CSS), 'لا زجاج');
  for (const v of ['--th-ink', '--th-gold', '--th-muted', '--th-btn', '--th-btn-ink', '--th-field', '--th-field-line']) assert.ok(CSS.includes('var(' + v + ')'), v);
  assert.ok(/\.eduHead h2\{[^}]*-webkit-text-fill-color:var\(--th-gold\) !important/.test(CSS) && /\.eduSecTitle\{color:var\(--th-gold\) !important/.test(CSS), 'العناوين بذهبيّ الثيم');
  assert.ok(/\.eduUploadBtn\{border:none !important;background:var\(--th-btn\) !important;color:var\(--th-btn-ink\) !important/.test(CSS), 'شريط الرفع بزرّ الثيم');
  assert.ok(/html\.skin-wood:root:root #eduHubModal\{--th-ink:#3b2a1c;--th-muted:#6b5038;--th-gold:#b57750;/.test(CSS), 'الخشبيّ بلا --th-* يأخذ ألوانه');
  assert.ok(/@media \(max-width:700px\)\{[\s\S]*?background-image:var\(--edu-m\) !important/.test(CSS), 'الجوّال بالصورة الطوليّة');
  assert.ok(/#eduHubModal \.eduQuote\{display:none;\}/.test(CSS), 'المقولة مخفيّة بلا ثيم');
  // ملفّ خارج الثيمات لا يُمسّ: كلّ القواعد تحت html.skin-<ثيم>
  const rules = CSS.split('\n').filter((l) => l && !l.startsWith('/*') && !l.startsWith(' ') && !l.startsWith('@media') && !l.startsWith('@container') && l !== '}' && !l.startsWith('#eduHubModal .eduQuote{display:none'));
  for (const l of rules) assert.ok(/^html\.skin-[a-z]+:root:root #eduHubModal/.test(l), 'قاعدة مقيّدة بثيم: ' + l.slice(0, 60));
});

test('٤. الصور: ٤٨ ملفًّا بدقّة المولّد الأصليّة (حاسوب ≥ ٢٤٠٠ وجوّال ≥ ١٥٠٠ عرضًا) ومقيسة في meta.json — حين تصل من التشغيلة', () => {
  const dir = path.join(ROOT, 'assets/edu-bg');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^skin-[a-z]+-(desktop|mobile)\.webp$/.test(f)) : [];
  if (!files.length) { console.log('   (لا صور بعد — تنتظر تشغيلة edu-bg؛ الفحص يصير إلزاميًّا عند وصولها)'); return; }
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  for (const k of SKINS) for (const dev of ['desktop', 'mobile']) {
    const f = 'skin-' + k + '-' + dev + '.webp';
    assert.ok(files.includes(f), f);
    const b = fs.readFileSync(path.join(dir, f));
    assert.strictEqual(b.toString('latin1', 0, 4) + b.toString('latin1', 8, 12), 'RIFFWEBP', f);
    const m = meta.images[f.replace(/\.webp$/, '')];
    assert.ok(m && m.ok, f + ' مقيسة وشاشتها ≥ ٣٥٪');
    assert.ok(m.w >= (dev === 'desktop' ? 2400 : 1500), f + ' عرض ' + m.w);
    assert.ok(m.rect.x0 < m.rect.x1 && m.rect.y0 < m.rect.y1 && m.rect.x0 >= 0 && m.rect.y1 <= 1, f + ' مستطيل سليم');
  }
});

test('٥. الصفحة: الرابط آخر الأنماط ووسوم الكاش، والمقولة بالـ١٤ لغة خارج .eduWrap', () => {
  // الأرقام تُقرأ من index.html لا تُثبَّت (سقّاطة البنية vPinTests)
  const tag = (re) => Number((HTML.match(re) || [])[1]);
  assert.ok(tag(/<link rel="stylesheet" href="css\/تعليم-خلفية\.css\?v=(\d+)">/) >= 1, 'الرابط بوسم');
  assert.ok(HTML.indexOf('css/تعليم-خلفية.css') > HTML.indexOf('css/بلا-خطوط.css') && HTML.indexOf('css/تعليم-خلفية.css') > HTML.indexOf('css/ثيمات.css'), 'بعد الثيمات وبلا-خطوط');
  assert.ok(tag(/\/js\/edu\.js\?v=(\d+)"/) >= 670 && tag(/\/js\/edu-plus\.js\?v=(\d+)"/) >= 3, 'الوسوم رُفعت فوق main (669 و2)');
  assert.ok(/function eduQuoteSync\(\)\{[\s\S]*?modal\.appendChild\(q\)/.test(EDU), 'المقولة أخو .eduWrap');
  assert.ok(/function showHome\(\)\{[\s\S]{0,200}eduQuoteSync\(\);/.test(EDU), 'تُحدَّث عند كلّ فتح');
  for (const key of ['المعرفة تبدأ من هنا', 'كل إنجاز يبدأ بخطوة']) {
    assert.ok(EDU.includes("eduL('" + key + "','"), key + ' عبر eduL');
    const m = PLUS.match(new RegExp('"' + key + '":(\\{[^}]*\\})'));
    assert.ok(m, key + ' في __EDU_XL2');
    const o = JSON.parse(m[1]);
    for (const l of LANGS) assert.ok(o[l] && o[l].length > 2, key + ' ' + l);
  }
});

test('٦. القياس: يجد الشاشة الفاضية في صورة اصطناعيّة بكسورها (حين تتوفّر sharp محلّيًّا)', async () => {
  let sharp; try { sharp = require('sharp'); } catch (e) { console.log('   (sharp غير مثبّتة هنا — القياس يُفحص في الورك فلو/محلّيًّا)'); return; }
  const os = require('os'); const { execFileSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edubg-'));
  const W = 1366, H = 768, r = [0.27, 0.07, 0.97, 0.91];
  const raw = Buffer.alloc(W * H * 3); for (let i = 0; i < raw.length; i++) raw[i] = 60 + ((i * 7919) % 120);
  for (let y = Math.round(r[1] * H); y < Math.round(r[3] * H); y++) for (let x = Math.round(r[0] * W); x < Math.round(r[2] * W); x++) { const i = (y * W + x) * 3; raw[i] = 30; raw[i + 1] = 20; raw[i + 2] = 12; }
  await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 90 }).toFile(path.join(dir, 'skin-test-desktop.webp'));
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/edu-bg-measure.mjs'), dir], { cwd: ROOT, stdio: 'pipe' });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).images['skin-test-desktop'];
  assert.ok(m.ok && Math.abs(m.rect.x0 - r[0]) < 0.03 && Math.abs(m.rect.y0 - r[1]) < 0.03 && Math.abs(m.rect.x1 - r[2]) < 0.03 && Math.abs(m.rect.y1 - r[3]) < 0.03, JSON.stringify(m));
  assert.ok(m.rect.x0 >= r[0] && m.rect.y0 >= r[1] && m.rect.x1 <= r[2] && m.rect.y1 <= r[3], 'داخل الشاشة لا خارجها');
  fs.rmSync(dir, { recursive: true, force: true });
});
