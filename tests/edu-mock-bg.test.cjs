"use strict";
/* v-edu-mock-bg (المالك ٢٠ أكتوبر): خلفيّات التعليم من نماذجه حسب لون التطبيق — المكرّر لا يوضع، المسح يُغطّى ببطاقة شبه شفّافة ≤ ٤٠٪ مع blur،
   وألوان الأزرار والنصّ من الصورة (meta.json)، والنصّ بالـ١٤ لغة كما هو. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CSS = read('css/تعليم-خلفية.css');
const EDU = read('js/edu.js');
const HTML = read('index.html');
const META = JSON.parse(read('assets/edu-bg/meta.json'));
const COLORS = ['gold', 'purple', 'blue', 'cyan', 'green', 'orange', 'red', 'pink'];

test('١. ١٧ صورة webp حقيقيّة ≤ ١٩٥KB بأسماء الثيمات، ولا صورة لمكرّر (الأزواج شبه المتطابقة ممثَّلة بصورة واحدة)', () => {
  const dir = path.join(ROOT, 'assets/edu-bg');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
  const want = [];
  for (const [c, t] of Object.entries(META.themes)) for (const [k, suf] of [['d', 'desktop'], ['dl', 'desktop-light'], ['m', 'mobile'], ['ml', 'mobile-light']]) if (k in t) want.push(c + '-' + suf + '.webp');
  assert.deepEqual(files, want.sort());
  assert.equal(files.length, 17);
  const used = Object.values(META.themes).flatMap((t) => Object.values(t));
  assert.equal(new Set(used).size, used.length, 'كلّ صورة مرّة واحدة');
  for (const d of [12, 3, 5, 20]) assert.ok(!used.includes(d), 'المكرّر #' + d + ' لا يوضع');
  for (const f of files) {
    const b = fs.readFileSync(path.join(dir, f));
    assert.ok(b.length <= 195 * 1024, f + ' ' + b.length);
    assert.equal(b.toString('latin1', 0, 4) + b.toString('latin1', 8, 12), 'RIFFWEBP', f);
  }
});

test('٢. كلّ لون كتلة CSS بمتغيّراته من meta.json (البطاقات الأربع وشريط الرفع والقرص كما قيست من الصورة)', () => {
  for (const c of COLORS) {
    const m = CSS.match(new RegExp('html:root:root #eduHubModal\\[data-edu-bg="' + c + '"\\]\\{([^}]*)\\}'));
    assert.ok(m, c);
    const p = META.palette[String(META.themes[c].d)];
    for (const k of ['t1', 't2', 't3', 't4', 'bar', 'plus', 'card', 'video', 'bg']) assert.ok(m[1].includes('--edu-' + k + ':' + p[k] + ';'), c + ' ' + k);
    assert.ok(new RegExp('--edu-art-d:url\\("/assets/edu-bg/' + c + '-desktop\\.webp\\?v=\\d+"\\)').test(m[1]), c + ' صورة الحاسوب');
    const mob = 'm' in META.themes[c] ? c + '-mobile.webp' : c + '-desktop.webp';
    assert.ok(new RegExp('--edu-art-m:url\\("/assets/edu-bg/' + mob.replace('.', '\\.') + '\\?v=\\d+"\\)').test(m[1]), c + ' صورة الجوّال');
    for (const k of ['title', 'text', 'muted', 'f-title', 'f-field', 'f-btn', 'f-btn-ink', 'card-rgb']) assert.ok(m[1].includes('--edu-' + k + ':'), c + ' ' + k);
  }
  for (const c of ['gold', 'blue']) assert.ok(CSS.includes('html[data-mode="light"]:root:root #eduHubModal[data-edu-bg="' + c + '"]{'), c + ' فاتح');
});

test('٣. المفتاح من لون التطبيق (appTheme) والافتراضيّ ذهبيّ، ومراقب فوريّ', () => {
  const src = EDU.match(/var EDU_BG_COLORS=[\s\S]*?\nfunction syncEduBg\(\)\{[^\n]*\n/)[0];
  const run = (theme) => { const ctx = { localStorage: { getItem: (k) => (k === 'appTheme' ? theme : null) }, __swallow() {}, modal: { a: null, setAttribute(k, v) { this.a = v; } } }; vm.createContext(ctx); vm.runInContext(src + ';syncEduBg();', ctx); return ctx.modal.a; };
  for (const c of COLORS) assert.equal(run(c), c);
  assert.equal(run(null), 'gold'); assert.equal(run('weird'), 'gold');
  assert.ok(/new MutationObserver\(syncEduBg\)\.observe\(document\.documentElement,\{attributes:true,attributeFilter:\['class','style','data-mode'\]\}\)/.test(EDU));
});

test('٤. اللوح على مستطيلات المسح بالضبط (كسور الصورة + cqw/cqh بحساب cover + قصّ L يستثني الكتاب والكرة)، زجاج ٢٢٪ + بطاقة ٢٢٪ = ٣٩٪ ≤ ٤٠٪ مع blur 7px، وبلا لوح معتم', () => {
  assert.ok(CSS.includes('html:root:root #eduHubModal[data-edu-bg]{background:var(--edu-art-d) center/cover no-repeat, var(--edu-bg) !important;') && /\[data-edu-bg\]\{[^}]*container-type:size;/.test(CSS));
  const wrap = CSS.match(/#eduHubModal\[data-edu-bg\] \.eduWrap\{([^}]*)\}/)[1];
  for (const f of ['--iw:max(100cqw, calc(100cqh * var(--edu-R)))', '--ih:max(100cqh, calc(100cqw / var(--edu-R)))', '--pl:max(0px, calc(var(--ox) + var(--edu-x0) * var(--iw)))',
    '--pr:max(0px, calc(var(--ox) + (1 - var(--edu-x1)) * var(--iw)))', '--pt:max(0px, calc(var(--oy) + var(--edu-y0) * var(--ih)))', '--pb:max(0px, calc(var(--oy) + (1 - var(--edu-y1)) * var(--ih)))',
    'position:absolute;left:var(--pl);right:var(--pr);top:var(--pt);bottom:var(--pb);', 'height:auto !important;max-width:none !important', 'background:rgba(var(--edu-card-rgb),.22) !important;-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);']) assert.ok(wrap.includes(f), f);
  /* الملفّ مولَّد: مطابق لمخرج scripts/edu-bg-css.mjs (meta.json ← CSS)، وكلّ لون يحمل هندسة اللوح (الصندوق الجامع + زاويتا القصّ) للحاسوب والجوّال */
  const r = require('node:child_process').spawnSync(process.execPath, ['scripts/edu-bg-css.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, 'CSS يطابق المولَّد: ' + (r.stdout || '') + (r.stderr || ''));
  for (const c of COLORS) {
    const b = CSS.match(new RegExp('html:root:root #eduHubModal\\[data-edu-bg="' + c + '"\\]\\{([^}]*)\\}'))[1];
    for (const k of ['R', 'x0', 'x1', 'y0', 'y1', 'cx1', 'cy0', 'cbl', 'cy1']) { assert.ok(b.includes('--edu-' + k + ':'), c + ' ' + k); assert.ok(b.includes('--edu-m' + k + ':'), c + ' m' + k); }
  }
  assert.ok(CSS.includes('clip-path:polygon(0 0, var(--Xc) 0, var(--Xc) var(--Yc), 100% var(--Yc), 100% 100%, var(--Xb) 100%, var(--Xb) var(--Yb), 0 var(--Yb));'), 'قصّ L');
  assert.ok(CSS.includes('--Xc:calc(var(--ox) + var(--edu-cx1) * var(--iw) - var(--pl));') && CSS.includes('--edu-nrpx:max(0px, calc(100cqw - var(--pl) - var(--pr) - var(--Xc)));--edu-nlpx:max(0px, var(--Xb));'), 'القصّ والهوامش بالبكسل من هندسة الصورة');
  /* فخّ ثبت: --edu-m + x1 = --edu-mx1 اسم الجوّال — لا متغيّر آخر يبدأ بـm يصطدم به */
  const names = new Set([...CSS.matchAll(/--edu-([a-z0-9-]+):/g)].map((x) => x[1]));
  for (const n of names) if (/^m/.test(n) && n !== 'muted') assert.ok(names.has(n.slice(1)), 'متغيّر جوّال بلا أصل: ' + n);
  assert.ok(!names.has('mcx1') || names.has('cx1'));
  assert.ok(CSS.includes('--edu-cx1:var(--edu-mcx1);--edu-cy0:var(--edu-mcy0);--edu-cbl:var(--edu-mcbl);--edu-cy1:var(--edu-mcy1);'), 'الجوّال يبدّل القصّ أيضًا');
  assert.ok(CSS.includes(':is(.eduTwo,#eduUpWrap,#eduOldEduRow){margin-left:var(--edu-nlpx) !important;}') && CSS.includes('.eduMain{display:flex;flex-direction:column;gap:12px;margin-right:var(--edu-nrpx);}'), 'الصفوف خارج الزاويتين');
  /* الكرة الأرضيّة (أعلى اليمين) والكتاب (أسفل اليسار) خارج اللوح في صور اللوحات الدائريّة: الذهبيّ nr ≈ ١٤٪ وnl ≈ ٣١٪ */
  const g = CSS.match(/data-edu-bg="gold"\]\{[^}]*--edu-x1:([\d.]+);[^}]*--edu-cx1:([\d.]+);--edu-cy0:([\d.]+);--edu-cbl:([\d.]+);--edu-cy1:([\d.]+);/);
  assert.ok(Number(g[2]) < Number(g[1]) - 0.05 && Number(g[4]) > 0.45 && Number(g[3]) > Number(g[5]), 'الذهبيّ: زاويتان مستثناتان ' + g.slice(1).join(' '));
  /* التعتيم الكلّيّ: اللوح + البطاقة فوقه */
  const alphas = [...CSS.matchAll(/rgba\(var\(--edu-card-rgb\),(\.\d+)\)/g)].map((x) => Number(x[1]));
  assert.ok(alphas.length >= 4 && alphas.every((a) => a === 0.22), 'كلّ طبقات الزجاج ٢٢٪: ' + alphas.join(','));
  assert.ok(1 - (1 - 0.22) * (1 - 0.22) <= 0.4, 'المجموع ≤ ٤٠٪');
  assert.ok(!/rgba\(0,0,0,\.[5-9]/.test(CSS), 'لا تعتيم أسود فوق ٤٠٪ (طبقة النموذج .25)');
  assert.ok(/@media \(max-width:700px\)\{\n  html:root:root #eduHubModal\[data-edu-bg\]\{background-image:var\(--edu-art-m\) !important;--edu-R:var\(--edu-mR\);--edu-x0:var\(--edu-mx0\)/.test(CSS), 'الجوّال: الصورة الطوليّة ومستطيلها');
  assert.ok(CSS.includes('html.mobile-ui:root:root #eduHubModal[data-edu-bg]{background-image:var(--edu-art-m) !important;--edu-R:var(--edu-mR);'));
  assert.ok(CSS.includes('.eduUpCard{background:linear-gradient(color-mix(in srgb,var(--edu-f-bg) 30%,transparent),color-mix(in srgb,var(--edu-f-bg) 30%,transparent)),var(--edu-art-m) center/cover no-repeat, var(--edu-f-bg) !important;'), 'النموذج خلفه الطوليّة بطبقة ٣٠٪ (≤ ٤٠٪)');
  assert.ok(/\.eduUpCard\{[^}]*padding:22px 44px 20px !important;/.test(CSS), 'حشو النموذج بالبكسل');
  assert.ok(!/flex:1 0 auto/.test(CSS), 'البطاقات مضغوطة كالنماذج لا ممدودة');
});

test('٥. الرئيسيّة بترتيب النماذج: شريط رفع بعنوان فرعيّ (uploadSub بالـ١٤ لغة) → المنهج → البطاقات الأربع → لغة/موادي → صانع الفيديو، بلا نصّ جديد', () => {
  const h = EDU.slice(EDU.indexOf('function showHome()'));
  const order = ['class="eduMain"', 'id="eduUploadBtn"', 'class="eduUpTxt"', 'id="eduPasteToggle"', 'id="eduCurricBtn"', 'id="eduPlusHome"', 'class="eduTwo"', 'eduLangCard', 'eduSubjCard', 'id="eduUpWrap"', 'id="eduOldEduRow"'].map((x) => h.indexOf(x));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'الترتيب ' + order);
  assert.ok(/class="eduUpTxt"><b>'\+esc\(T\('upload'\)\)\+'<\/b><small>'\+esc\(T\('uploadSub'\)\)\+'<\/small>/.test(EDU));
  const i18n = read('js/app-03-i18n-data.js');
  assert.ok(!/eduMock|edu-mock/.test(i18n), 'لا مفاتيح نصّ جديدة');
  for (const f of ['.eduUpTxt b{font-size:22px', '.eduPlusTitle{display:block;font-size:16px', 'grid-template-columns:repeat(4,1fr);gap:14px', '.eduTwo{display:grid;grid-template-columns:1fr 1fr'])
    assert.ok(CSS.includes(f), f);
  assert.ok(CSS.includes('#eduHubModal:not([data-edu-bg]) .eduUpTxt small{display:none;}'));
});

test('٦. الوسوم: الملفّ آخرًا، وedu.js مرفوع', () => {
  assert.ok(HTML.indexOf('css/تعليم-خلفية.css?v=') > HTML.indexOf('css/بلا-خطوط.css?v='));
  assert.ok(Number(HTML.match(/تعليم-خلفية\.css\?v=(\d+)/)[1]) >= 4);
  assert.ok(Number(HTML.match(/\/js\/edu\.js\?v=(\d+)/)[1]) >= 670);
});
