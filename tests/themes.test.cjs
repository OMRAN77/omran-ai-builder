// tests/themes.test.cjs — v-themes (أمر المالك ٤ أكتوبر: «كمّل الثيمات الباقية» — «نفس فكرة الخشبيّة لكن في التصميم الجديد»،
// وشاشات الترحيب الأربع «شيل الأسامي عنها»). سلوك الاختيار والكسوة في tests/خلفيات.test.cjs (١٢)؛ هنا: CSS محصور تحت html.skin،
// كلّ ثيم مسجَّل له كتلة متغيّراته، كلّ خامة موجودة وخفيفة، المصغّرات بمقاس الشبكة، الترجمة، وتعايشه مع التصميم الجديد.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const CSS = rd('css/ثيمات.css');
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

// [المجلّد، المعرّف، مفتاح الاسم، فاتحة، مشهد] — كما في js/app-25-خلفيات.js
const THEMES = [['خشب-داكن', 'darkwood', 'bgThemeDarkwood', false, false], ['رخام', 'marble', 'bgThemeMarble', false, false],
  ['برمجة', 'code', 'bgThemeCode', false, false], ['مركبات', 'cars', 'bgThemeCars', false, false],
  ['أطفال', 'kids', 'bgThemeKids', true, false], ['طهي', 'cuisine', 'bgThemeCuisine', true, false],
  ['غروب', 'sunset', 'bgThemeSunset', false, true], ['شاطئ', 'beach', 'bgThemeBeach', true, true],
  ['شتاء', 'winter', 'bgThemeWinter', true, true], ['كراج', 'garage', 'bgThemeGarage', false, true],
  ['أنمي', 'anime', 'bgThemeAnime', false, true], ['أمن-سيبراني', 'cyber', 'bgThemeCyber', false, true],
  ['فصل', 'school', 'bgThemeSchool', false, true],
  // v-themes-ten: أنمي ٤ · سيارات ٢ · دراسيّة ٣ · بيت عصريّ — مشاهد من صور المالك
  ['أنمي-قتالي', 'tactical', 'bgThemeTactical', false, true], ['ملاك', 'angel', 'bgThemeAngel', true, true], ['أنمي-نيون', 'neonanime', 'bgThemeNeonAnime', false, true], ['محطّة', 'station', 'bgThemeStation', false, true], ['سباق', 'rally', 'bgThemeRally', false, true], ['دخان', 'smoke', 'bgThemeSmoke', false, true], ['مكتبة', 'library', 'bgThemeLibrary', true, true], ['مقهى', 'cafe', 'bgThemeCafe', true, true], ['ورشة', 'workshop', 'bgThemeWorkshop', false, true], ['عصري', 'modern', 'bgThemeModern', true, true]];

function jpegSize(file) {
  const b = fs.readFileSync(file);
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xC0 || m === 0xC1 || m === 0xC2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return [0, 0];
}
const block = (sel) => { const i = CSS.indexOf('\n' + sel + '{'); assert.ok(i >= 0, 'كتلة ' + sel); return CSS.slice(i, CSS.indexOf('\n}', i)); };

test('١. كلّ قاعدة محصورة تحت html.skin (وskin-<معرّف> وskin-scene) — من لم يختر ثيمًا والخشبيّ لا يتغيّر عندهما شيء', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(sels.length > 60, 'القواعد قُرئت: ' + sels.length);
  const top = (list) => { const out = []; let d = 0, cur = ''; for (const ch of list) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
  for (const list of sels) for (const sel of top(list)) {
    assert.match(sel, /^html\.skin(-[a-z]+)?\b/, 'قاعدة غير محصورة: ' + sel);
  }
  assert.doesNotMatch(css, /skin-wood/, 'الخشبيّ بملفّه وحده');
});

test('٢. السجلّ: الثلاثة عشر في js/app-25-خلفيات.js بالمعرّف والاسم والفاتح والمشهد، ولكلّ واحد كتلة متغيّراته', () => {
  const src = rd('js/app-25-خلفيات.js');
  for (const [dir, id, key, light, scene] of THEMES) {
    const re = new RegExp("\\['" + dir + "', '" + id + "', '" + key + "', '#[0-9a-f]{6}', " + light + (scene ? ', true' : '') + '\\]');
    assert.match(src, re, 'مسجَّل: ' + dir);
    const b = block('html.skin-' + id);
    for (const v of ['--th-page', '--th-ink', '--th-gold', '--th-line', '--th-dlg', '--th-tile', '--th-btn', '--th-field', '--th-user', '--th-ai', '--th-work']) {
      assert.ok(b.includes(v + ':') || block('html.skin').includes(v + ':'), id + ': ' + v);
    }
    assert.equal(/--th-scheme:light/.test(b), light, id + ': الفاتح يطابق السجلّ (bgimg-light)');
    assert.equal(/--th-scene:url\(/.test(b), scene, id + ': المشهد يطابق السجلّ (skin-scene)');
    if (scene) assert.match(b, /--th-pos:\d+% \d+%; --th-pos-m:\d+% \d+%;/, id + ': موضع الصورة للكمبيوتر والجوّال (v-themes-ten: الطوليّة تحتاج موضعًا رأسيًّا)');
  }
  // الكسوة: html.skin للثلاثة عشر لا للخشبيّ، وskin-scene من السجلّ لا من المحفوظ
  assert.match(src, /html\.classList\.toggle\('skin', !!مدخل && اسم !== 'wood'\);/);
  assert.match(src, /html\.classList\.toggle\('skin-scene', !!\(مدخل && مدخل\.مشهد\)\);/);
  assert.match(src, /b\.title = نصّ\(ث\.عنوان, اسم\);/);
});

test('٣. الخامات: كلّ url في CSS موجود وخفيف، والمشاهد ١٦٠٠ عرضًا، والمصغّرات ٣٦٠ عرضًا، والمولّد مسجَّل', () => {
  const urls = [...new Set([...CSS.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]))];
  assert.ok(urls.length >= 20, 'روابط: ' + urls.length);
  for (const u of urls) {
    const f = path.join(root, 'css', decodeURIComponent(u.replace(/\?v=\d+$/, ''))); // v-bg-fresh: وسم الإصدار على المشاهد والسيارة
    assert.ok(fs.existsSync(f), 'مفقود: ' + decodeURIComponent(u));
    assert.ok(fs.statSync(f).size < (/%D9%85%D8%B4%D9%87%D8%AF\.jpg/.test(u) ? 900 : 240) * 1024, 'ثقيل: ' + decodeURIComponent(u)); // v-scene-sharp: المشهد ٢٥٦٠ بكسل يُحمَّل عند اختيار ثيمه وحده
  }
  for (const [dir, , , , scene] of THEMES) {
    const d = path.join(root, 'assets', 'ثيمات', dir);
    assert.equal(jpegSize(path.join(d, 'مصغّر.jpg'))[0], 360, dir + ': مصغّر الشبكة');
    if (scene) { const [w, h] = jpegSize(path.join(d, 'مشهد.jpg')); assert.ok(Math.max(w, h) >= 2000 && Math.max(w, h) <= 2560, dir + ': المشهد ٢٠٠٠–٢٥٦٠ على ضلعه الأطول (v-scene-sharp؛ v-themes-ten: صور المالك العريضة ٢٠٠٠ والطوليّة ٢٥٦٠ ارتفاعًا)'); }
  }
  // السيارة المتوهّجة من صورة المالك (أمره: «وهذي بعد») في بداية «سيارات»: ضعفا حجمها، وتذوب خلفيّتها الداكنة في الكربون
  assert.equal(jpegSize(path.join(root, 'assets', 'ثيمات', 'مركبات', 'سيارة.jpg'))[0], 1200); // v-scene-sharp
  for (const u of urls) if (/%D9%85%D8%B4%D9%87%D8%AF\.jpg|%D8%B3%D9%8A%D8%A7%D8%B1%D8%A9\.jpg/.test(u)) assert.match(u, /\?v=\d+$/, 'v-bg-fresh: وسم إصدار على ' + decodeURIComponent(u)); // v-scene-wide: يُرفع عند تبديل المشهد
  // وخلفيّة دائمة لا في البداية وحدها (أمره بعدها: «صورة السيارة غير موجودة الخلفيّة» — كانت تختفي مع أوّل رسالة)
  assert.ok(CSS.includes('\nhtml.skin-cars #chatcol::before{'), 'بلا شرط omranWelcome');
  assert.ok(!/skin-cars body\.omranWelcome/.test(CSS));
  const car = CSS.slice(CSS.indexOf('\nhtml.skin-cars #chatcol::before{')).split('}')[0];
  assert.ok(car.includes(encodeURIComponent('سيارة.jpg')) && car.includes('mix-blend-mode:screen;') && car.includes('z-index:0;'), 'السيارة خلف الفقاعات');
  // والفقاعتان نصف شفّافتين فتُرى السيارة من خلالهما (أمره: «السيارة تختفي» — كانتا شبه معتمتين فتغطّيانها في المحادثة الطويلة)
  const carsVars = CSS.slice(CSS.indexOf('\nhtml.skin-cars{'), CSS.indexOf('\n}', CSS.indexOf('\nhtml.skin-cars{')));
  for (const v of ['--th-user', '--th-ai']) {
    const m = carsVars.match(new RegExp(v + ':rgba\\(\\d+,\\d+,\\d+,(\\.\\d+)\\)'));
    assert.ok(m && Number(m[1]) <= 0.6, 'سيارات ' + v + ' نصف شفّافة');
  }
  const gen = rd('scripts/ثيمات.mjs');
  assert.match(gen, /function guidedFill\(/, 'المربّعات المرسومة على صور المالك تُمسح بالتعبئة الموجَّهة');
  for (const f of ['20.webp', '23.webp', '24.webp', '17.webp', '19.webp']) assert.ok(gen.includes("'" + f + "'"), 'من صور المالك: ' + f);
});

test('٤. الربط: CSS بعد الخشبيّ، والتصميم الجديد يترك الخانات والإرسال للثيم، والمختار والزرّ يغلبان قاعدتي التطبيق', () => {
  const html = rd('index.html');
  const a = html.indexOf('css/ثيم-خشبي.css?v=3'), b = html.indexOf('css/ثيمات.css?v=8');
  assert.ok(a > 0 && b > a, 'يُحمَّل آخرًا فيعلو');
  const frame = rd('css/إطارات.css');
  assert.doesNotMatch(frame, /:not\(\.skin-wood\) (\.hist-item|#composerBox)/, 'قواعد الإطار للخانات والإرسال تستثني html.skin');
  assert.match(frame, /:not\(\.skin-wood\):not\(\.skin\) #composerBox > #btnSend/);
  // redesign.css يفرغ خلفيّة المختار على الكمبيوتر بـ(0,3,1)، والوضع الفاتح يلوّن «محادثة جديدة» بـ(1,2,1)
  assert.match(CSS, /html\.skin:not\(\.mobile-ui\) #history \.hist-item\.active\{background:var\(--th-tile\) !important;/);
  assert.match(CSS, /html\.skin:not\(\.mobile-ui\) #omranNewChatBtn, html\.skin:not\(\.mobile-ui\) #omranNewChatBtn:hover\{/);
  // مكان الكود بلون لوحة المعاينة (أمر المالك)، والمشهد: الصورة خلف الشاشة والقائمة والمعاينة زجاج فوقها
  assert.match(CSS, /html\.skin #code\{background:transparent !important;/);
  assert.match(CSS, /html\.skin-scene #bgImgLayer\{background:var\(--th-scene\) var\(--th-pos, center\) \/ cover no-repeat, var\(--th-page\) !important;\}/);
  assert.match(CSS, /html\.skin-scene #sidebar, html\.skin-scene #workarea\{-webkit-backdrop-filter:saturate\(1\.15\); backdrop-filter:saturate\(1\.15\);\}/, 'v-scene-clear: بلا تغبيش فوق المشهد');
  assert.ok(!/skin-scene #sidebar[^\n]*blur\(/.test(CSS), 'v-scene-clear: لا blur على لوحتي المشهد');
});

test('٥. الترجمة: أسماء الثلاثة عشر بالـ١٤ لغة، ووسم اللغات مرفوع', () => {
  const data = rd('js/app-03-i18n-data.js');
  for (const [, , key] of THEMES) {
    assert.equal((data.match(new RegExp('^    ' + key + ': ', 'gm')) || []).length, 2, 'ar+en: ' + key);
    for (const lg of LANGS) assert.ok(rd('i18n/' + lg + '.js').includes('"' + key + '":'), lg + ': ' + key);
  }
  assert.match(data, /bgThemeCyber: 'أمن سيبراني'/);
  assert.match(data, /bgThemeSchool: 'فصل دراسي'/);
  assert.ok(rd('js/app-04-i18n-state.js').includes(".js?v=732'"));
});
