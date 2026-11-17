// v-ml-fit (فيديو om ai الترويجيّ بالمالايالام، ١٧ نوفمبر): ستّة مواضع قصّها التطبيق نفسه بالمالايالاميّة («ഫയൽ തി…»، «മൊസൈ/ക»،
// «ട്രെൻഡുക…»، «കൺസ്ട്രക്ഷൻ…»، «ഉപകരണത്തി|»، وتسميات تذييل الشريط متلاصقة). الإصلاح كلّه في css/مالايالام.css، للمالايالاميّة وحدها:
// الحاسوب (١–٩) ثمّ الجوّال بقواعد منفصلة (v-ml-fit-mobile، ١٠–١٥). الاختبار يحسب الاتّساع من قيم الملفّ نفسها وعرض الكلمات المقيس
// (scripts/lang-fit-probe.mjs بخطّ ويندوز Nirmala UI، الأعرض بين ما قيس؛ وعلى الجوّال خطّ أندرويد Noto Sans Malayalam أيضًا، على
// هاتف المالك المطويّ ٣٥٤px) — فأيّ تعديل يعيد القصّ يحمّر هنا.
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
// القواعد مع شرط @media الذي يلفّها إن وُجد (كتلة واحدة لا متداخلة)
const rules = (() => {
  const out = []; let i = 0, media = null;
  for (;;) {
    const open = CSS.indexOf('{', i); if (open < 0) break;
    const head = CSS.slice(i, open).trim();
    if (head.startsWith('@media')) { media = head.slice(6).trim(); i = open + 1; continue; }
    const close = CSS.indexOf('}', open);
    out.push({ sels: head.split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean), body: CSS.slice(open + 1, close).trim(), media });
    i = close + 1;
    const nOpen = CSS.indexOf('{', i), nClose = CSS.indexOf('}', i);
    if (media && nClose >= 0 && (nOpen < 0 || nClose < nOpen)) { media = null; i = nClose + 1; }
  }
  return out;
})();
const DESK = 'html[lang="ml"]:not(.mobile-ui) ', MOB = 'html[lang="ml"].mobile-ui ';
const find = (pre, needle, media) => { const r = rules.find((x) => x.media === media && x.sels.some((s) => s.startsWith(pre) && s.endsWith(needle))); assert.ok(r, 'قاعدة ' + pre + '… ' + needle + (media ? ' في ' + media : '')); return r.body; };
const rule = (needle) => find(DESK, needle, null); // الحاسوب
const ruleM = (needle, media) => find(MOB, needle, media || null); // الجوّال
const val = (body, prop) => { const all = [...body.matchAll(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'g'))]; assert.ok(all.length, prop + ' في ' + body); return all[all.length - 1][1].replace(/\s*!important\s*$/, '').trim(); }; // الأخيرة تغلب
const px = (v) => { const m = /(-?[\d.]+)px/.exec(v); assert.ok(m, 'px في ' + v); return Number(m[1]); };
const pct = (v) => { const m = /(-?[\d.]+)%/.exec(v); assert.ok(m, '% في ' + v); return Number(m[1]) / 100; };
// عرض الكلمة بالـem — Nirmala UI بوزن العنصر نفسه (المسبار، ١٧ نوفمبر)
const EM = { plateWord: 10.8 /* തിരഞ്ഞെടുക്കുക 900 */, ringWord: 8.24 /* സൈബർപങ്ക് 700 */, ringLine2: 8.01 /* പെയിന്റിംഗ് 700 */,
  videoWord: 7.78 /* സിനിമാറ്റിക് 700 */, themesWord: 8.93 /* ഉപകരണത്തിൽ 500 */, foot: [4.6, 6.12, 9.09, 3.41] /* ടൂളുകൾ ഫയലുകൾ ക്രമീകരണങ്ങൾ മോഡ് 500 */ };
// الجوّال: الخطّان (ويندوز Nirmala UI لنافذة ضيّقة وللمسبار على ٤٠٠، وأندرويد Noto Sans Malayalam للهاتف) — مقيسة في صفحة التطبيق
const FONTS = {
  windows: { plateWord: 10.8, ringWord: 8.24, ringLine2: 8.01, videoWord: 7.78, themesWord: 8.93,
    nav: { tools: 4.6, chats: 5.0, files: 6.12, settings: 9.09, light: 7.03 /* ലൈറ്റ് മോഡ് */, dark: 8.0 /* ഡാർക്ക് മോഡ് */ } },
  android: { plateWord: 10.2, ringWord: 7.32, ringLine2: 6.2 /* കഥാപാത്രം */, videoWord: 6.91 /* ട്രെൻഡുകൾ */, themesWord: 8.17,
    nav: { tools: 4.18, chats: 4.7, files: 5.61, settings: 8.25, light: 6.46, dark: 7.51 } },
};
// العروض: ٤٠٠ (المسبار) بالخطّين، وهاتف المالك مطويًّا ٣٥٤ و٣٦٠ و٤١٢ بخطّ أندرويد، ومفتوحًا ٧٣٢ (ونوافذ ويندوز الضيّقة ٥٦٠–٨٦٠)
const PHONES = [[400, 'windows'], [400, 'android'], [354, 'android'], [360, 'android'], [412, 'android'], [732, 'android'], [560, 'windows'], [732, 'windows'], [860, 'windows']];
const SLOT = (vw) => vw - 54; // خانة الرفع في الستايل: هامش ٢٧px من كلّ جهة (مقيسة: ٣٤٦ على ٤٠٠)
// أوتار سطرَي اسم الحلقة (كما في ٥): القطر H، والاسم على bottom، وحشوته pad
function ringFit(H, font, lh, tilePct, bw, bottom, pad, em) {
  const D = H * tilePct, inner = D - 2 * bw, R = inner / 2, cy = bw + R, content = inner - 2 * pad, be = bw + inner * (1 - bottom);
  const chord = (top) => { const y1 = top + lh * 0.15, y2 = top + lh * 0.85, dy = Math.max(Math.abs(y1 - cy), Math.abs(y2 - cy)); return dy >= R ? 0 : 2 * Math.sqrt(R * R - dy * dy); };
  return { inner, content, w1: em.ringWord * font, w2: em.ringLine2 * font, line1: chord(be - 2 * lh), line2: chord(be - lh) };
}

test('١. الملفّ مربوط بوسم كاش بعد آخر أوراق الأنماط', () => {
  const html = read('index.html');
  const i = html.indexOf('href="css/مالايالام.css?v=');
  assert.ok(i > 0, 'مربوط بـ?v=');
  assert.match(html.slice(i), /^href="css\/مالايالام\.css\?v=\d+"/);
  assert.ok(i > html.indexOf('href="css/بلا-خطوط.css?v='), 'بعد بلا-خطوط.css');
});

test('٢. للمالايالاميّة وحدها، والحاسوب والجوّال منفصلان: كلّ محدِّد يبدأ بـhtml[lang="ml"]:not(.mobile-ui) أو html[lang="ml"].mobile-ui، ولا ملفّ آخر يخصّ المالايالاميّة', () => {
  assert.ok(rules.filter((r) => r.sels[0].startsWith(DESK)).length >= 7, 'قواعد الحاسوب');
  assert.ok(rules.filter((r) => r.sels[0].startsWith(MOB)).length >= 7, 'قواعد الجوّال');
  for (const r of rules) for (const s of r.sels) assert.ok(s.startsWith(DESK) || s.startsWith(MOB), s);
  for (const r of rules) for (const s of r.sels) if (r.media) assert.ok(s.startsWith(MOB) && r.media === '(max-width:560px)', 'شرط @media للجوّال وحده: ' + s);
  // الحاسوب أوّلًا كما كان، والجوّال بعده كلّه: لا قاعدة جوّال بين قواعد الحاسوب
  const firstMob = rules.findIndex((r) => r.sels[0].startsWith(MOB));
  assert.ok(rules.slice(firstMob).every((r) => r.sels[0].startsWith(MOB)), 'الجوّال في آخر الملفّ');
  for (const f of fs.readdirSync(path.join(root, 'css')).filter((x) => x.endsWith('.css') && x !== 'مالايالام.css')) {
    assert.doesNotMatch(read('css/' + f), /\[lang="?ml"?\]|:lang\(ml\)/, f);
  }
  assert.doesNotMatch(read('index.html'), /\[lang="?ml"?\]|:lang\(ml\)/, 'index.html');
});

test('٣. لا كسر داخل الكلمة ولا خطّ تحت ٨px (Nirmala UI يفصل «ി» عن حرفها بـ٦٫٥px)', () => {
  assert.doesNotMatch(CSS, /break-all|overflow-wrap\s*:\s*anywhere|word-break|line-break\s*:\s*anywhere/);
  for (const r of rules) {
    for (const m of r.body.matchAll(/(?:^|;)\s*font-size\s*:\s*([^;]+)/g)) {
      const sizes = (m[1].match(/[\d.]+px/g) || []).map(Number.parseFloat);
      assert.ok(sizes.length, 'حدّ أدنى بالـpx: ' + m[1]);
      for (const s of sizes) assert.ok(s >= 8, 'خطّ ' + s + 'px في ' + r.sels[0]);
    }
  }
  assert.match(rule('.pstyleHero .pstyleHeroT i'), /overflow-wrap:normal/, 'الحلقة: بلا anywhere الأصليّ');
  assert.match(ruleM('.pstyleHero .pstyleHeroT i'), /overflow-wrap:normal/, 'الحلقة على الجوّال: بلا anywhere الأصليّ');
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
  // الجوّال: عرض الهاتف، والشريط السفليّ بالوضعين، و«دمج صور»، واللوحة بنِسب الصورة المغطّية، والفجوة بالـem
  for (const k of ["opt('width'", '#omranBottomNav .omNavBtn > span', "name: 'homeLight'", "name: 'merge'", 'img: 2', 'gapMin', 'oneLine: true']) assert.ok(probe.includes(k), k);
  assert.ok(read('knowledge/DECISIONS.md').includes('v-ml-fit'));
  assert.ok(read('knowledge/DECISIONS.md').includes('v-ml-fit-mobile'));
  assert.ok(read('package.json').includes('node tests/ml-text-fit.test.cjs'));
});

// ── الجوّال (v-ml-fit-mobile) ──
const slotAt = (vw) => vw - 54; // خانة الرفع في الستايل: ٢٧px من كلّ جهة (مقيسة: ٣٠٠ على ٣٥٤، ٣٤٦ على ٤٠٠، ٦٧٨ على ٧٣٢)
const fontsOf = (body) => [...body.matchAll(/(?:^|;)\s*font-size\s*:\s*([^;]+)/g)].map((m) => m[1].replace(/\s*!important\s*$/, '').trim());

test('١٠. الجوّال — لوحة الرفع: على الهاتف خانة ٧:٥ تكبّر القاعدة الذهبيّة فتسع أطول كلمة بخطّها العريض في كلّ عرض؛ والأعرض ٢:١ كالحاسوب', () => {
  // نسبة الصورة من رأس ملفّها (VP8: العرض والارتفاع في البايتات ٢٦–٢٩)، والخانة الأصليّة بنسبتها
  const img = fs.readFileSync(path.join(root, 'assets/upload-art/style.webp'));
  assert.equal(img.slice(12, 16).toString(), 'VP8 ', 'style.webp بترميز VP8');
  const imgAspect = (img.readUInt16LE(26) & 0x3fff) / (img.readUInt16LE(28) & 0x3fff);
  assert.equal(imgAspect, 2);
  assert.match(read('css/رفع-الصور.css'), /\.omUpArt\{[^}]*aspect-ratio:2\/1;[^}]*\}/, 'الخانة ٢:١ كالصورة');
  assert.match(read('css/رفع-الصور.css'), /\.omUpArt\{[^}]*background:#000 center\/cover no-repeat/, 'الصورة مغطّية موسّطة');
  const Q = '(max-width:560px)';
  const [a, b] = val(ruleM('.omUpStyle', Q), 'aspect-ratio').split('/').map(Number);
  const Z = imgAspect / (a / b); // الصورة تغطّي الخانة بارتفاعها فتتّسع ×Z أفقيًّا والنِّسب الرأسيّة كما هي
  assert.ok(Z >= 1.4, 'تكبير ' + Z.toFixed(2));
  const toSlot = (x) => 0.5 - (0.5 - x) * Z; // نسبة من الصورة ← نسبة من الخانة
  const B = ruleM('.omUpStyle .omUpB', Q), L = pct(val(B, 'left'));
  assert.equal(L, pct(val(B, 'right')));
  assert.ok(Math.abs(L - toSlot(0.385)) < 0.001, 'النصّ على ٣٨٫٥٪ من الصورة كما في كلّ اللغات: ' + (toSlot(0.385) * 100).toFixed(2) + '%');
  assert.ok(L >= toSlot(0.38), 'داخل واجهة القاعدة (٣٨–٦٢٪ من الصورة)');
  const LL = pct(val(ruleM('.omUpStyle .omUpL', Q), 'left'));
  assert.ok(Math.abs(LL - toSlot(0.40)) < 0.001, '«ستايل» على ٤٠٪ من الصورة كما في كلّ اللغات');
  // الخطّ: قيمة بالـpx أوّلًا (WebView بلا cqw) ثمّ max(أدنى, min(أعلى, Kcqw))
  const fsB = fontsOf(B);
  assert.ok(fsB.length === 2 && /^\d+px$/.test(fsB[0]), 'px قبل cqw: ' + fsB.join(' | '));
  const m = /^max\((\d+)px,\s*min\((\d+)px,\s*([\d.]+)cqw\)\)$/.exec(fsB[1]); assert.ok(m, fsB[1]);
  for (const [vw, f] of PHONES.filter(([w]) => w <= 560)) {
    const slot = slotAt(vw), font = Math.max(+m[1], Math.min(+m[2], +m[3] * slot / 100)), box = (1 - 2 * L) * slot, word = FONTS[f].plateWord * font;
    assert.ok(word <= box + 0.5, vw + 'px ' + f + ': തിരഞ്ഞെടുക്കുക ' + word.toFixed(1) + 'px في ' + box.toFixed(1));
    assert.ok(2 * 1.1 * font <= 0.16 * slot * b / a, vw + 'px: السطران في ارتفاع القاعدة (١٦٪)');
    assert.ok(FONTS[f].plateWord * px(fsB[0]) <= box + 0.5, vw + 'px: قيمة px وحدها (WebView بلا cqw) تسع أيضًا');
  }
  // الأعرض (≥٥٦١: الجوّال المفتوح والتابلت ونافذة ويندوز الضيّقة): ٢:١ بنِسب الحاسوب
  const W = ruleM('.omUpStyle .omUpB');
  assert.equal(val(W, 'white-space'), 'normal');
  assert.equal(val(W, 'overflow'), 'visible');
  assert.equal(val(W, 'text-overflow'), 'clip');
  assert.equal(pct(val(W, 'left')), 0.385);
  const fsW = fontsOf(W), wm = /^max\((\d+)px,\s*([\d.]+)cqw\)$/.exec(fsW[1]);
  assert.ok(/^\d+px$/.test(fsW[0]) && wm, 'px قبل cqw: ' + fsW.join(' | '));
  for (const [vw, f] of [[561, 'windows'], ...PHONES.filter(([w]) => w > 560)]) {
    const slot = slotAt(vw), word = FONTS[f].plateWord * Math.max(+wm[1], +wm[2] * slot / 100);
    assert.ok(word <= 0.23 * slot && FONTS[f].plateWord * px(fsW[0]) <= 0.23 * slot, vw + 'px ' + f + ': ' + word.toFixed(1) + 'px في ' + (0.23 * slot).toFixed(1));
  }
});

test('١١. الجوّال — «دمج صور»: نصف العرض لا يسع الكلمة بخطّ لوحته، فالخانتان تحت بعضهما بعرض المفردة في كلّ عرض', () => {
  assert.equal(val(ruleM('#studioAiSlots.two'), 'flex-direction'), 'column');
  const g = /\.stSlots\{display:flex; gap:(\d+)px;\}/.exec(read('js/partials-core.js'));
  assert.ok(g, 'الخانتان صفّ مرن في partials-core.js');
  const Q = '(max-width:560px)', phone = ruleM('.omUpStyle .omUpB', Q), wide = ruleM('.omUpStyle .omUpB');
  const pm = /^max\((\d+)px,\s*min\((\d+)px,\s*([\d.]+)cqw\)\)$/.exec(fontsOf(phone)[1]), wm = /^max\((\d+)px,\s*([\d.]+)cqw\)$/.exec(fontsOf(wide)[1]);
  for (const [vw, f] of PHONES) { // لو بقيتا جنبًا إلى جنب: الخطّ يتبع نصف الخانة إلى حدّه الأدنى والكلمة أعرض من نصيبها
    const half = (slotAt(vw) - Number(g[1])) / 2, isPhone = vw <= 560;
    const font = isPhone ? Math.max(+pm[1], Math.min(+pm[2], +pm[3] * half / 100)) : Math.max(+wm[1], +wm[2] * half / 100);
    const box = (1 - 2 * pct(val(isPhone ? phone : wide, 'left'))) * half;
    assert.ok(FONTS[f].plateWord * font > box, vw + 'px ' + f + ': نصف الخانة كان يسع؟ ' + (FONTS[f].plateWord * font).toFixed(1) + ' في ' + box.toFixed(1));
  }
});

test('١٢. الجوّال — حلقة أنماط الصور بعرض الشاشة إلّا ١٠px (حدّها ٤٢٠): الأسماء بخطّها ٨px في أوتار سطورها بالخطّين وكلّ عرض', () => {
  const studios = read('js/app-12-studios.js');
  const tile = /\.pstyleHero \.pstyleHeroT\{position:absolute; width:(\d+)%;[^}]*border:(\d+)px/.exec(studios);
  const lbl = /\.pstyleHero \.pstyleHeroT i\{[^}]*font-size:(\d+)px; font-weight:700; line-height:([\d.]+)/.exec(studios);
  assert.ok(tile && lbl, 'قيم الحلقة الأصليّة في app-12-studios.js');
  const font = Number(lbl[1]), lh = Number(lbl[2]) * font;
  assert.equal(font, 8, 'خطّ الحلقة لم يُصغَّر');
  const w = /^min\((\d+)px,\s*calc\(100%\s*-\s*(\d+)px\)\)$/.exec(val(ruleM('.pstyleHero'), 'width'));
  assert.ok(w, 'عرض الحلقة: ' + val(ruleM('.pstyleHero'), 'width'));
  assert.equal(+w[1], px(val(rule('.pstyleHero'), 'width')), 'الحدّ الأعلى = حلقة الحاسوب');
  const b = ruleM('.pstyleHero .pstyleHeroT i'), padPct = pct(val(b, 'padding').split(/\s+/)[1]), bottom = pct(val(b, 'bottom'));
  // كلّ اسم من الاثني عشر بعرضه كاملًا سطرًا واحدًا (em، وزن ٧٠٠): ما يأتي سطرًا واحدًا (≤ المحتوى) يقع على السطر السفليّ
  const LABELS = { windows: [11.27, 8.20, 11.86, 7.02, 13.08, 8.96, 6.70, 14.58, 11.73, 10.08, 7.54, 8.34],
    android: [9.79, 8.58, 10.42, 6.24, 10.52, 7.88, 5.82, 12.88, 10.37, 8.82, 6.68, 7.14] };
  const grow = Number((/\.pstyleHero \.pstyleHeroT:hover\{transform:translate\(-50%,-50%\) scale\(([\d.]+)\)/.exec(studios) || [])[1]);
  assert.ok(grow > 1, 'تكبير البلاطة عند اللمس في app-12-studios.js');
  for (const [vw, f] of PHONES) {
    const H = Math.min(+w[1], vw - +w[2]); // الحاوية بعرض الشاشة بلا حشوة (مقيسة: ٤٠٠ على ٤٠٠)
    const bw = Number(tile[2]), inner = H * Number(tile[1]) / 100 - 2 * bw;
    // البلاطة الطرفيّة تلمس حافّة الحلقة؛ مكبّرةً باللمس تبقى داخل الشاشة (وإلّا تحرّك العرض أفقيًّا)
    assert.ok(H * Number(tile[1]) / 100 * (grow - 1) / 2 <= (vw - H) / 2, vw + 'px: البلاطة المكبّرة داخل الشاشة');
    const r = ringFit(H, font, lh, Number(tile[1]) / 100, bw, bottom, padPct * inner, FONTS[f]); // الحشوة بالنسبة من عرض الدائرة
    const tag = vw + 'px ' + f + ' (الحلقة ' + H + '): ';
    assert.ok(r.w1 <= r.content, tag + 'സൈബർപങ്ക് ' + r.w1.toFixed(1) + ' يتوسّط المحتوى ' + r.content.toFixed(1));
    assert.ok(r.w1 <= r.line1, tag + 'السطر الأوّل ' + r.w1.toFixed(1) + ' ≤ وتر ' + r.line1.toFixed(1));
    assert.ok(r.w2 <= r.line2, tag + 'السطر الثاني ' + r.w2.toFixed(1) + ' ≤ وتر ' + r.line2.toFixed(1));
    for (const e of LABELS[f]) { const T = e * font; if (T <= r.content) assert.ok(T <= r.line2, tag + 'اسم من سطر واحد ' + T.toFixed(1) + ' ≤ وتر ' + r.line2.toFixed(1)); }
  }
});

test('١٣. الجوّال — بطاقات صانع الفيديو وبلاطة «صورة من جهازك»: قيم الحاسوب نفسها على المقاس نفسه', () => {
  const m = /html #videoMakerModal \.vmk-tab:not\(\.vmk-tab-noimg\)\{[^}]*min-width:(\d+)px;[^}]*border:(\d+)px/.exec(strip(read('css/modules.css')));
  assert.ok(m, 'مقاس البطاقة في modules.css (الهاتف والحاسوب)');
  const v = ruleM('.vmk-tab:not(.vmk-tab-noimg) .vmk-tab-lbl'), line = Number(m[1]) - 2 * Number(m[2]) - 2 * px(val(v, 'padding-inline'));
  for (const f of ['windows', 'android']) assert.ok(FONTS[f].videoWord * px(val(v, 'font-size')) <= line - 4, f + ': ' + (FONTS[f].videoWord * px(val(v, 'font-size'))).toFixed(1) + 'px في ' + line);
  assert.equal(v, rule('.vmk-tab:not(.vmk-tab-noimg) .vmk-tab-lbl'), 'كالحاسوب');
  const add = ruleM('.bgImgGrid .bgImgAdd');
  assert.equal(add, rule('.bgImgGrid .bgImgAdd'), 'كالحاسوب: بعرض خانتين وارتفاع صفّها');
});

test('١٤. الجوّال — الشريط السفليّ: كلّ تسمية في تبويبها، والفجوة بين كلّ تسميتين ≥ ٠٫٨em في الوضعين وكلّ عرض', () => {
  const nav = /html\.mobile-ui #omranBottomNav\{padding:\d+px (\d+)px/.exec(read('css/redesign.css'));
  assert.ok(nav, 'حشوة الشريط في redesign.css');
  assert.match(read('css/redesign.css'), /\.omNavBtn\{flex:1 1 0;/, 'التبويبات بعرض واحد');
  const f = /^max\(([\d.]+)px,\s*min\(([\d.]+)px,\s*([\d.]+)vw\)\)$/.exec(val(ruleM('#omranBottomNav :is(.omNavBtn, #omNavMode)'), 'font-size'));
  assert.ok(f, 'خطّ بالـvw بين حدّين');
  assert.equal(+f[2], 9.5, 'الحدّ الأعلى = خطّ التبويبات في كلّ اللغات');
  for (const [vw, ff] of PHONES) {
    const font = Math.max(+f[1], Math.min(+f[2], +f[3] * vw / 100)), W = (vw - 2 * Number(nav[1])) / 5, N = FONTS[ff].nav;
    for (const mode of ['light', 'dark']) { // زرّ الوضع يقول عكس الوضع الحاليّ
      const row = [N.tools, N.chats, N.files, N.settings, N[mode]].map((e) => e * font);
      for (const t of row) assert.ok(t <= W, vw + 'px ' + ff + ': تسمية ' + t.toFixed(1) + ' في تبويبها ' + W.toFixed(1));
      for (let k = 1; k < row.length; k++) {
        const gap = W - (row[k - 1] + row[k]) / 2;
        assert.ok(gap >= 0.8 * font, vw + 'px ' + ff + ' ' + mode + ': فجوة ' + gap.toFixed(1) + ' ≥ ' + (0.8 * font).toFixed(1));
      }
    }
  }
});

test('١٥. الحاسوب كما هو: قواعده الثماني كما دخلت، ولا قاعدة جوّال تطابقه', () => {
  // قواعد الحاسوب السبع كما دخلت في #1343 (v-ml-fit) — لا تُعدَّل من أجل الجوّال
  const desk = rules.filter((r) => r.sels[0].startsWith(DESK)).map((r) => r.sels.join(',') + '{' + r.body + '}');
  assert.equal(desk.length, 8);
  assert.ok(desk.includes('html[lang="ml"]:not(.mobile-ui) .pstyleHero{width:min(420px, 92vw);}'));
  assert.ok(desk.includes('html[lang="ml"]:not(.mobile-ui) #omranSidebarFoot :is(.omNavBtn, #omNavMode){font-size:8px;}'));
  for (const r of rules.filter((x) => x.sels[0].startsWith(MOB))) assert.ok(!/:not\(\.mobile-ui\)/.test(r.sels.join(',')), r.sels[0]);
});
