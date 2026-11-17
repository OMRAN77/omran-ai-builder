// v-ml-fit (فيديو om ai الترويجيّ بالمالايالام، ١٧ نوفمبر): ستّة مواضع قصّها التطبيق نفسه بالمالايالاميّة («ഫയൽ തി…»، «മൊസൈ/ക»،
// «ട്രെൻഡുക…»، «കൺസ്ട്രക്ഷൻ…»، «ഉപകരണത്തി|»، وتسميات تذييل الشريط متلاصقة). الإصلاح كلّه في css/مالايالام.css، للمالايالاميّة وحدها
// على الحاسوب وحده. الاختبار يحسب الاتّساع من قيم الملفّ نفسها وعرض الكلمات المقيس (scripts/lang-fit-probe.mjs بخطّ ويندوز Nirmala UI،
// الأعرض بين ما قيس؛ خطّ أندرويد Noto Sans Malayalam أضيق) — فأيّ تعديل يعيد القصّ يحمّر هنا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const FILE = 'css/مالايالام.css';
const CSS = strip(read(FILE));
const rules = CSS.split('}').filter((b) => b.includes('{')).map((b) => { const [s, d] = b.split('{'); return { sels: s.split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean), body: d.trim() }; });
const rule = (needle) => { const r = rules.find((x) => x.sels.some((s) => s.endsWith(needle))); assert.ok(r, 'قاعدة ' + needle); return r.body; };
const val = (body, prop) => { const m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(body); assert.ok(m, prop + ' في ' + body); return m[1].replace(/\s*!important\s*$/, '').trim(); };
const px = (v) => { const m = /(-?[\d.]+)px/.exec(v); assert.ok(m, 'px في ' + v); return Number(m[1]); };
const pct = (v) => { const m = /(-?[\d.]+)%/.exec(v); assert.ok(m, '% في ' + v); return Number(m[1]) / 100; };
// عرض الكلمة بالـem — Nirmala UI بوزن العنصر نفسه (المسبار، ١٧ نوفمبر)
const EM = { plateWord: 10.8 /* തിരഞ്ഞെടുക്കുക 900 */, ringWord: 8.24 /* സൈബർപങ്ക് 700 */, ringLine2: 8.01 /* പെയിന്റിംഗ് 700 */,
  videoWord: 7.78 /* സിനിമാറ്റിക് 700 */, themesWord: 8.93 /* ഉപകരണത്തിൽ 500 */, foot: [4.6, 6.12, 9.09, 3.41] /* ടൂളുകൾ ഫയലുകൾ ക്രമീകരണങ്ങൾ മോഡ് 500 */ };

test('١. الملفّ مربوط بوسم كاش بعد آخر أوراق الأنماط', () => {
  const html = read('index.html');
  const i = html.indexOf('href="css/مالايالام.css?v=');
  assert.ok(i > 0, 'مربوط بـ?v=');
  assert.match(html.slice(i), /^href="css\/مالايالام\.css\?v=\d+"/);
  assert.ok(i > html.indexOf('href="css/بلا-خطوط.css?v='), 'بعد بلا-خطوط.css');
});

test('٢. للمالايالاميّة وحدها وعلى الحاسوب وحده: كلّ محدِّد يبدأ بـhtml[lang="ml"]:not(.mobile-ui)، ولا ملفّ آخر يخصّ المالايالاميّة', () => {
  assert.ok(rules.length >= 7);
  for (const r of rules) for (const s of r.sels) assert.ok(s.startsWith('html[lang="ml"]:not(.mobile-ui) '), s);
  for (const f of fs.readdirSync(path.join(root, 'css')).filter((x) => x.endsWith('.css') && x !== 'مالايالام.css')) {
    assert.doesNotMatch(read('css/' + f), /\[lang="?ml"?\]|:lang\(ml\)/, f);
  }
  assert.doesNotMatch(read('index.html'), /\[lang="?ml"?\]|:lang\(ml\)/, 'index.html');
});

test('٣. لا كسر داخل الكلمة ولا خطّ تحت ٨px (Nirmala UI يفصل «ി» عن حرفها بـ٦٫٥px)', () => {
  assert.doesNotMatch(CSS, /break-all|overflow-wrap\s*:\s*anywhere|word-break|line-break\s*:\s*anywhere/);
  for (const r of rules) {
    const m = /(?:^|;)\s*font-size\s*:\s*([^;]+)/.exec(r.body); if (!m) continue;
    const sizes = (m[1].match(/[\d.]+px/g) || []).map(Number.parseFloat);
    assert.ok(sizes.length, 'حدّ أدنى بالـpx: ' + m[1]);
    for (const s of sizes) assert.ok(s >= 8, 'خطّ ' + s + 'px في ' + r.sels[0]);
  }
  assert.match(rule('.pstyleHero .pstyleHeroT i'), /overflow-wrap:normal/, 'الحلقة: بلا anywhere الأصليّ');
});

test('٤. لوحة الرفع في الستايل: سطران، وأطول كلمة تسع الخانة في كلّ عرض (الخطّ يتبع المربّع)', () => {
  const b = rule('.omUpStyle .omUpB');
  assert.equal(val(b, 'white-space'), 'normal');
  assert.equal(val(b, 'overflow'), 'visible');
  assert.equal(val(b, 'text-overflow'), 'clip');
  const fs_ = val(b, 'font-size'), cqw = Number((/([\d.]+)cqw/.exec(fs_) || [])[1]);
  assert.ok(cqw > 0, 'خطّ بالـcqw: ' + fs_);
  const box = 100 - 2 * pct(val(b, 'left')) * 100; // ٣٨٫٥٪ من كلّ جهة = ٢٣cqw
  assert.equal(pct(val(b, 'left')), pct(val(b, 'right')));
  assert.ok(EM.plateWord * cqw <= box, 'തിരഞ്ഞെടുക്കുക ' + (EM.plateWord * cqw).toFixed(1) + 'cqw في ' + box + 'cqw');
  assert.ok(box <= 24, 'داخل واجهة اللوحة (٣٨–٦٢٪)');
  // الحدّ الأدنى بالـpx لا يعمل في مربّعَي «دمج صور» على الحاسوب (٥٤٥px مقيسة من ١٢٨٠ إلى ١٩٢٠) فلا تخرج الكلمة عن اللوحة هناك
  assert.ok(px(fs_) <= 545 * cqw / 100, 'الحدّ الأدنى ' + px(fs_) + 'px ≤ ' + (545 * cqw / 100) + 'px');
});

test('٥. حلقة أنماط الصور: أطول كلمة بخطّها الأصليّ تسع الاسم، وكلّ سطر يسع وتر الدائرة', () => {
  const studios = read('js/app-12-studios.js');
  const tile = /\.pstyleHero \.pstyleHeroT\{position:absolute; width:(\d+)%;[^}]*border:(\d+)px/.exec(studios);
  const lbl = /\.pstyleHero \.pstyleHeroT i\{[^}]*font-size:(\d+)px; font-weight:700; line-height:([\d.]+)/.exec(studios);
  assert.ok(tile && lbl, 'قيم الحلقة الأصليّة في app-12-studios.js');
  const font = Number(lbl[1]), lh = Number(lbl[2]) * font;
  assert.equal(font, 8, 'خطّ الحلقة لم يُصغَّر');
  const b = rule('.pstyleHero .pstyleHeroT i');
  const hero = px(val(rule('.pstyleHero'), 'width'));
  const D = hero * Number(tile[1]) / 100, bw = Number(tile[2]), inner = D - 2 * bw, R = inner / 2, cy = bw + R;
  const pad = px(val(b, 'padding').split(/\s+/)[1] || val(b, 'padding')), content = inner - 2 * pad;
  const bottom = bw + inner * (1 - pct(val(b, 'bottom'))); // حافّة الاسم السفلى من أعلى الدائرة
  const chord = (top) => { const y1 = top + lh * 0.15, y2 = top + lh * 0.85, dy = Math.max(Math.abs(y1 - cy), Math.abs(y2 - cy)); return 2 * Math.sqrt(R * R - dy * dy); };
  const line2 = chord(bottom - lh), line1 = chord(bottom - 2 * lh);
  assert.ok(EM.ringWord * font <= inner, 'സൈബർപങ്ക് ' + (EM.ringWord * font).toFixed(1) + 'px داخل الاسم ' + inner.toFixed(1));
  assert.ok(EM.ringWord * font <= line1, 'السطر الأوّل: ' + (EM.ringWord * font).toFixed(1) + ' ≤ وتر ' + line1.toFixed(1));
  assert.ok(EM.ringLine2 * font <= line2, 'പെയിന്റിംഗ് في السطر الثاني: ' + (EM.ringLine2 * font).toFixed(1) + ' ≤ وتر ' + line2.toFixed(1));
  assert.ok(content <= line2, 'أيّ سطر واحد (≤ ' + content.toFixed(1) + 'px) يسع وتر السطر السفليّ ' + line2.toFixed(1));
});

test('٦. بطاقات صانع الفيديو: «സിനിമാറ്റിക്» تسع سطر البطاقة بلا «…»', () => {
  const m = /html #videoMakerModal \.vmk-tab:not\(\.vmk-tab-noimg\)\{[^}]*min-width:(\d+)px;[^}]*border:(\d+)px/.exec(strip(read('css/modules.css')));
  assert.ok(m, 'مقاس البطاقة في modules.css');
  const b = rule('.vmk-tab:not(.vmk-tab-noimg) .vmk-tab-lbl');
  const line = Number(m[1]) - 2 * Number(m[2]) - 2 * px(val(b, 'padding-inline'));
  assert.ok(EM.videoWord * px(val(b, 'font-size')) <= line - 4, (EM.videoWord * px(val(b, 'font-size'))).toFixed(1) + 'px في ' + line + 'px بهامش ٤px');
});

test('٧. بلاطات الأدوات ثلاثة أسطر، وبلاطة «صورة من جهازك» بعرض خانتين تسع أطول كلمة', () => {
  assert.equal(val(rule('.btn.hasToolPhoto.hasToolPhoto .btnLabel'), '-webkit-line-clamp'), '3');
  const add = rule('.bgImgGrid .bgImgAdd');
  assert.equal(val(add, 'grid-column'), 'span 2');
  assert.equal(val(add, 'aspect-ratio'), 'auto', 'ارتفاع صفّها لا ضعفه');
  const g = /\.bgImgGrid\{[^}]*minmax\((\d+)px,1fr\)\); gap:(\d+)px/.exec(read('css/خلفيات.css'));
  assert.ok(g, 'شبكة الخلفيّات');
  const fsAdd = Number((/\.bgImgAdd\{font-size:(\d+)px/.exec(read('css/خلفيات.css')) || [])[1]);
  assert.ok(EM.themesWord * fsAdd <= 2 * Number(g[1]) + Number(g[2]) - 4, 'ഉപകരണത്തിൽ ' + EM.themesWord * fsAdd + 'px');
});

test('٨. أسفل الشريط: التسميات الأربع مع فجواتها تسع أضيق تذييل تظهر فيه (٢١١px)', () => {
  const hide = Number((/@container \(max-width:(\d+)px\)\{#omranSidebarFoot \.omNavBtn span\{display:none;\}\}/.exec(read('css/redesign.css')) || [])[1]);
  assert.ok(hide > 0, 'حدّ الإخفاء في redesign.css');
  const gap = px(val(rule('#omranSidebarFoot'), 'gap')), font = px(val(rule('#omranSidebarFoot :is(.omNavBtn, #omNavMode)'), 'font-size'));
  assert.ok(gap >= 6, 'فجوة ' + gap);
  const row = EM.foot.reduce((a, b) => a + b, 0) * font + 3 * gap;
  assert.ok(row <= hide + 1, 'الصفّ ' + row.toFixed(1) + 'px ≤ ' + (hide + 1));
});

test('٩. المسبار والسجلّ والتسجيل', () => {
  const probe = read('scripts/lang-fit-probe.mjs');
  for (const k of ['circleOut', 'plateOut', 'gapBefore', 'hidden', 'broken', '--android', '--mobile']) assert.ok(probe.includes(k), k);
  assert.ok(read('knowledge/DECISIONS.md').includes('v-ml-fit'));
  assert.ok(read('package.json').includes('node tests/ml-text-fit.test.cjs'));
});
