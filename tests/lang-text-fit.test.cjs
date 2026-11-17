// v-lang-fit (١٧ نوفمبر، بعد v-ml-fit): مسبار الاتّساع scripts/lang-fit-probe.mjs وجد في لغات غير المالايالاميّة نصوصًا يقصّها التطبيق
// بـ«…» أو يكسر كلمتها في المواضع الستّة: لوحة رفع الستايل (fr «Choisir un fi…» وbn وur)، وبلاطة «تصميم البناء» في الأدوات (fr وru، سطر
// ثالث مخفيّ)، وحلقة أنماط الصور (ru «Карандашны/й»)، وبطاقة صانع الفيديو (es «Cinematográ…»). وكان المسبار يعدّ النصّ الصينيّ بلا مسافات
// كلمةً واحدة، و«Киберпанк-неон» كذلك، فيرى كسرًا في موضع كسر مشروع. الإصلاح في css/اتساع-اللغات.css: قاعدة عامّة حيث لا تمسّ نصًّا
// يتّسع أصلًا (العربيّة والإنجليزيّة صفر فرق بالبكسل)، ومحدِّد لغة حيث تمسّه. الأعراض بالـem مقيسة بالمسبار (خطوط ويندوز، ١٧ نوفمبر).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const FILE = 'css/اتساع-اللغات.css';
const RAW = read(FILE);
const CSS = strip(RAW);
const parse = (css) => strip(css).split('}').filter((b) => b.includes('{')).map((b) => { const i = b.lastIndexOf('{'); return { sels: b.slice(0, i).replace(/@[^{]*\{/g, '').split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean), body: b.slice(i + 1).trim() }; });
const rules = parse(CSS);
const rule = (needle) => { const r = rules.find((x) => x.sels.some((s) => s.endsWith(needle))); assert.ok(r, 'قاعدة ' + needle); return r; };
const val = (body, prop) => { const m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(body); assert.ok(m, prop + ' في ' + body); return m[1].replace(/\s*!important\s*$/, '').trim(); };
const px = (v) => { const m = /(-?[\d.]+)px/.exec(v); assert.ok(m, 'px في ' + v); return Number(m[1]); };
const pct = (v) => { const m = /(-?[\d.]+)%/.exec(v); assert.ok(m, '% في ' + v); return Number(m[1]) / 100; };
// تخصيص المحدِّد [معرّفات، أصناف/سمات/أشباه، أنواع] — :not() و:is() بمعامل واحد تُعدّ بمعاملها
const spec = (sel) => {
  const s = sel.replace(/:where\([^)]*\)/g, '').replace(/:(?:not|is)\(/g, ' ').replace(/\)/g, ' ');
  const a = (s.match(/#[\w-]+/g) || []).length;
  const b = (s.match(/\.[\w-]+/g) || []).length + (s.match(/\[[^\]]*\]/g) || []).length + (s.replace(/::[\w-]+/g, '').match(/:[\w-]+/g) || []).length;
  const c = (s.replace(/\[[^\]]*\]/g, '').match(/(?:^|[\s>+~])[a-z][\w-]*/gi) || []).length;
  return a * 1e6 + b * 1e3 + c;
};
// عرض النصّ بالـem (المسبار، خطوط ويندوز): أطول نصّ للوحة في كلّ لغة بوزن ٩٠٠، وكلمات الحلقة ٧٠٠، وبطاقة الفيديو ٧٠٠
const PLATE = { ar: 5.22, en: 5.53, bn: 9.31, fr: 8.37, ur: 7.48, ru: 7.24, es: 6.66, ne: 6.43, fil: 6.27, tr: 5.05, hi: 4.25, zh: 4.0, id: 3.86 };
const RING_RU = { 'Карандашный': 7.29, 'Киберпанк-': 6.05, 'Комикс/манга': 7.3 };
const VIDEO = { es: 8.18 /* Cinematográfico */, enEnhance: 7.84 /* Enhance quality */ };

test('١. الملفّ مربوط بوسم كاش بعد ملفّ المالايالاميّة مباشرة', () => {
  const html = read('index.html');
  const i = html.indexOf('href="css/اتساع-اللغات.css?v=');
  assert.ok(i > 0, 'مربوط بـ?v=');
  assert.match(html.slice(i), /^href="css\/اتساع-اللغات\.css\?v=\d+"/);
  assert.ok(i > html.indexOf('href="css/مالايالام.css?v='), 'بعد مالايالام.css');
  assert.ok(i > html.indexOf('href="css/رفع-الصور.css?v='), 'بعد رفع-الصور.css');
});

test('٢. الحاسوب وحده؛ العامّ لا يمسّ مقاس النصّ، والخاصّ بالروسيّة والإسبانيّة وحدهما، ولا ذكر للمالايالاميّة', () => {
  assert.ok(rules.length >= 5);
  for (const r of rules) for (const s of r.sels) assert.match(s, /^html(\[lang="(ru|es)"\])?:not\(\.mobile-ui\) /, s);
  // القواعد العامّة تفتح المكان فقط (عرض الخانة، الالتفاف، عدد الأسطر): لا خطّ ولا حشوة ولا تباعد — النصّ الذي يتّسع أصلًا لا يتغيّر
  for (const r of rules.filter((x) => x.sels.every((s) => s.startsWith('html:not(')))) {
    for (const d of r.body.split(';').map((x) => x.trim()).filter(Boolean)) {
      assert.match(d, /^(left|right|white-space|-webkit-line-clamp)\s*:/, 'عامّ: ' + d);
    }
  }
  assert.doesNotMatch(RAW, /\[lang="?ml"?\]|:lang\(ml\)/, 'المالايالاميّة في ملفّها وحده (ml-text-fit ٢)');
});

test('٣. لا كسر داخل الكلمة ولا خطّ تحت ٨px', () => {
  assert.doesNotMatch(CSS, /break-all|overflow-wrap\s*:\s*anywhere|word-break|line-break\s*:\s*anywhere|hyphens/);
  for (const r of rules) {
    const m = /(?:^|;)\s*font-size\s*:\s*([^;]+)/.exec(r.body); if (!m) continue;
    for (const s of (m[1].match(/[\d.]+px/g) || []).map(Number.parseFloat)) assert.ok(s >= 8, 'خطّ ' + s + 'px');
  }
});

test('٤. لوحة الرفع في الستايل: واجهة اللوحة كلّها لكلّ اللغات، وكلّ نصّ بخطّه الأصليّ يسعها سطرًا واحدًا', () => {
  const up = strip(read('css/رفع-الصور.css'));
  const bs = Number((/\.omUpStyle\{[^}]*--bs:([\d.]+)cqw/.exec(up) || [])[1]);
  const old = /\.omUpStyle \.omUpB\{left:([\d.]+)% !important;right:([\d.]+)% !important/.exec(up);
  assert.ok(bs > 0 && old, 'خطّ الزرّ وخانته الأصليّان في رفع-الصور.css');
  const oldBox = 100 - Number(old[1]) - Number(old[2]);
  const b = rule('.omUpStyle .omUpB').body;
  assert.equal(val(b, 'white-space'), 'normal');
  assert.equal(pct(val(b, 'left')), pct(val(b, 'right')), 'متناظرة: النصّ في الوسط نفسه');
  const box = 100 - 200 * pct(val(b, 'left'));
  assert.ok(box > oldBox && box <= 24, 'أعرض من ' + oldBox + 'cqw وداخل واجهة اللوحة (٣٨–٦٢٪): ' + box);
  // ما كان مقصوصًا في الخانة القديمة
  for (const L of ['fr', 'bn', 'ur']) assert.ok(PLATE[L] * bs > oldBox, L + ' كان يُقصّ');
  for (const [L, em] of Object.entries(PLATE)) assert.ok(em * bs <= box - 1, L + ': ' + (em * bs).toFixed(1) + 'cqw في ' + box + 'cqw');
  // overflow يبقى hidden: visible أظهر بكسلات من ظلّ النصّ العربيّ تحت صندوقه (فرق ٦٧ بكسلًا في لقطة العربيّة)
  assert.doesNotMatch(b, /overflow|text-overflow|font-size|line-height/);
});

test('٥. بلاطات الأدوات ثلاثة أسطر، والقاعدة تغلب كلّ حدّ أسطر في tool-card-images.css (يُحمَّل بعدها)', () => {
  const r = rule('.btnLabel');
  assert.equal(val(r.body, '-webkit-line-clamp'), '3');
  const mine = Math.min(...r.sels.map(spec));
  const tc = parse(read('css/tool-card-images.css')).filter((x) => /-webkit-line-clamp/.test(x.body));
  const theirs = tc.flatMap((x) => x.sels).filter((s) => /\.hasToolPhoto[\w.-]* \.btnLabel$/.test(s));
  assert.ok(theirs.length >= 3, 'قواعد حدّ الأسطر في tool-card-images.css');
  for (const s of theirs) assert.ok(mine > spec(s), 'يغلب ' + s);
  // سلامة الحساب
  assert.equal(spec('html[data-mode="light"] #sectionsToolsPopup .ptGrid .btn.hasToolPhoto.hasToolPhoto .btnLabel'), 1006001);
});

test('٦. حلقة أنماط الصور بالروسيّة: «Карандашный» بخطّها الأصليّ تسع الاسم، وكلّ سطر يسع وتر دائرته', () => {
  const studios = read('js/app-12-studios.js');
  const tile = /\.pstyleHero \.pstyleHeroT\{position:absolute; width:(\d+)%;[^}]*border:(\d+)px/.exec(studios);
  const lbl = /\.pstyleHero \.pstyleHeroT i\{[^}]*font-size:(\d+)px; font-weight:700; line-height:([\d.]+); padding:0 (\d+)px;[^}]*overflow-wrap:anywhere/.exec(studios);
  const base = /\.pstyleHero\{position:relative; width:min\((\d+)px/.exec(studios);
  assert.ok(tile && lbl && base, 'قيم الحلقة الأصليّة في app-12-studios.js');
  const font = Number(lbl[1]), lh = Number(lbl[2]) * font;
  const oldContent = Number(base[1]) * Number(tile[1]) / 100 - 2 * Number(tile[2]) - 2 * Number(lbl[3]);
  assert.ok(RING_RU['Карандашный'] * font > oldContent, 'كانت تُكسر: ' + (RING_RU['Карандашный'] * font).toFixed(1) + ' > ' + oldContent.toFixed(1));
  const b = rule('.pstyleHero .pstyleHeroT i').body;
  assert.equal(val(b, 'overflow-wrap'), 'normal');
  const hero = px(val(rule('.pstyleHero').body, 'width'));
  const D = hero * Number(tile[1]) / 100, bw = Number(tile[2]), inner = D - 2 * bw, R = inner / 2, cy = bw + R;
  const pad = px(val(b, 'padding').split(/\s+/)[1] || val(b, 'padding')), content = inner - 2 * pad;
  const bottom = bw + inner * (1 - pct(val(b, 'bottom')));
  const chord = (top) => { const y1 = top + lh * 0.15, y2 = top + lh * 0.85, dy = Math.max(Math.abs(y1 - cy), Math.abs(y2 - cy)); return 2 * Math.sqrt(R * R - dy * dy); };
  const line2 = chord(bottom - lh), line1 = chord(bottom - 2 * lh);
  for (const w of ['Карандашный', 'Киберпанк-', 'Комикс/манга']) {
    assert.ok(RING_RU[w] * font <= content, w + ' ' + (RING_RU[w] * font).toFixed(1) + 'px داخل الاسم ' + content.toFixed(1));
    assert.ok(RING_RU[w] * font <= line1, w + ' في السطر الأوّل ≤ وتر ' + line1.toFixed(1));
  }
  assert.ok(content <= line2, 'أيّ سطر واحد (≤ ' + content.toFixed(1) + 'px) يسع وتر السطر السفليّ ' + line2.toFixed(1));
});

test('٧. بطاقة صانع الفيديو بالإسبانيّة: «Cinematográfico» تسع سطرها بلا «…»، والحشوة العامّة كانت ستغيّر الإنجليزيّة', () => {
  const mod = strip(read('css/modules.css'));
  const m = /html #videoMakerModal \.vmk-tab:not\(\.vmk-tab-noimg\)\{[^}]*min-width:(\d+)px;[^}]*border:(\d+)px/.exec(mod);
  const l = /html #videoMakerModal \.vmk-tab:not\(\.vmk-tab-noimg\) \.vmk-tab-lbl\{[^}]*padding:\d+px (\d+)px \d+px;font-size:(\d+)px/.exec(mod);
  assert.ok(m && l, 'مقاس البطاقة واسمها في modules.css');
  const inner = Number(m[1]) - 2 * Number(m[2]), oldLine = inner - 2 * Number(l[1]), oldFont = Number(l[2]);
  assert.ok(VIDEO.es * oldFont > oldLine, 'كانت تُقصّ');
  const b = rule('.vmk-tab:not(.vmk-tab-noimg) .vmk-tab-lbl');
  assert.ok(b.sels.every((s) => s.startsWith('html[lang="es"]')), 'للإسبانيّة وحدها');
  const line = inner - 2 * px(val(b.body, 'padding-inline'));
  assert.ok(VIDEO.es * px(val(b.body, 'font-size')) <= line - 2, (VIDEO.es * px(val(b.body, 'font-size'))).toFixed(1) + 'px في ' + line + 'px');
  // «Enhance quality» سطران اليوم (٨٦٫٢px في ٨٤)، والحشوة نفسها لكلّ اللغات تجعله سطرًا واحدًا — تغيير في الإنجليزيّة
  assert.ok(VIDEO.enEnhance * oldFont > oldLine && VIDEO.enEnhance * oldFont <= line);
});

test('٨. المسبار: الكسر بين حرفين صينيّين وبعد الشرطة مشروع، والكلمة بلا موضع كسر واحدة', () => {
  const src = read('scripts/lang-fit-probe.mjs');
  const a = src.indexOf('  const cjk = '), z = src.indexOf('  const r2 = ');
  assert.ok(a > 0 && z > a, 'تقسيم الكلمات في measurePage');
  const words = new Function(src.slice(a, z) + '; return words;')();
  const seg = (s) => words(s).map(([x, y]) => s.slice(x, y));
  assert.deepEqual(seg('赛博朋克霓虹风'), ['赛', '博', '朋', '克', '霓', '虹', '风']);
  assert.deepEqual(seg('+ 来自你设备的照片'), ['+', '来', '自', '你', '设', '备', '的', '照', '片']);
  assert.deepEqual(seg('Киберпанк-неон'), ['Киберпанк-', 'неон']);
  assert.deepEqual(seg('Comic/​Manga'), ['Comic/', 'Manga']);
  assert.deepEqual(seg('Карандашный набросок'), ['Карандашный', 'набросок']);
  assert.deepEqual(seg('ഫയൽ തിരഞ്ഞെടുക്കുക'), ['ഫയൽ', 'തിരഞ്ഞെടുക്കുക']);
  assert.deepEqual(seg('AI视频'), ['AI', '视', '频']);
});

test('٩. السجلّ والتسجيل', () => {
  assert.ok(read('knowledge/DECISIONS.md').includes('v-lang-fit'));
  assert.ok(read('package.json').includes('node tests/lang-text-fit.test.cjs'));
});
