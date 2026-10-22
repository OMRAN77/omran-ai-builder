// tests/decor-18.test.cjs — v-decor-18 (المالك ١٦ أكتوبر بلقطتي أقسام الديكور وترندات الفيديو: «افحصهم كلهم… تضيف لكلّ واحد ١٨،
// وصلّح الأخطاء الموجودة، ويكونون يشتغلون على نفس الطلب، ورتّبهم على شكل الفيديوهات مش بالطول، ويكونون فيهم صور»):
//   الأثاث والأرضيات والأقمشة والحوائط والستائر صارت ١٧ خيارًا + «بدون تغيير» كالإضاءة، ولكلّ خيار صورة حقيقيّة 1280×720 (موضَّحة بـReal-ESRGAN)؛
//   الأقسام الستّة شبكة بطاقات صور والاسم فوقها (كالترندات) بدل ستّة صفوف متراصّة؛ والمعرض عمودان على الجوّال.
//   الأخطاء: الأقمشة والحوائط والستائر كانت رسمة كرتونيّة بلا صورة، و«بدون تغيير» رسمة غرفة في الأقسام الخمسة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SECS = { designAiFurniture: 'furniture', designAiFlooring: 'flooring', designAiFabric: 'fabric', designAiWallColor: 'wallcolor', designAiCurtains: 'curtains' };
const LANGS = ['fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml'];
const core = read('js/partials-core.js');
const options = (id) => [...core.match(new RegExp('<select id="' + id + '"[\\s\\S]*?</select>'))[0].matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)</g)].map((m) => ({ v: m[1], attrs: m[2], ar: m[3].trim() }));

test('١. كلّ قسم ١٨ بطاقة: «بدون تغيير» + ١٧ خيارًا بقيم فريدة، ولكلّ جديد مفتاح ترجمة واسم إنجليزيّ', () => {
  for (const id of Object.keys(SECS)) {
    const o = options(id);
    assert.equal(o.length, 18, id);
    assert.equal(o[0].v, '', id + ': الأوّل «بدون تغيير»');
    assert.equal(new Set(o.map((x) => x.v)).size, 18, id + ': قيم فريدة');
    for (const x of o.slice(1)) assert.match(x.attrs, /data-i18n="designAi\w+"/, id + '/' + x.v);
  }
});

test('٢. الأسماء بالأربع عشرة لغة: العربيّة والإنجليزيّة في الحزمة، والبقيّة في ملفّات اللغات', () => {
  const data = read('js/app-03-i18n-data.js');
  const dict = (l) => { const at = data.indexOf('\n  ' + l + ': {'); const end = data.indexOf('\n  en: {', at + 1); const sec = data.slice(at, l === 'ar' && end > at ? end : undefined); const d = {}; /* العربيّة حتّى بداية الإنجليزيّة لا آخر الملفّ (مراجعة نقض) */ for (const m of sec.matchAll(/"(designAi\w+)": "([^"]+)"/g)) if (!d[m[1]]) d[m[1]] = m[2]; return d; };
  const ctx = { I18N: { ar: dict('ar'), en: dict('en') }, window: {} };
  vm.createContext(ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  let n = 0;
  const OLD = /^designAi(Furniture|Flooring|Fabric|WallColor|Curtains)(Modern|Classic|Simple|Luxury|Bohemian|Parquet|Marble|Ceramic|Carpet|Light|Dark|Neutral|Bold|White|Beige|Gray|Remove)$/;
  const NEW = [];
  for (const id of Object.keys(SECS)) for (const x of options(id).slice(1)) {
    const k = x.attrs.match(/data-i18n="([^"]+)"/)[1];
    for (const l of ['ar', 'en'].concat(LANGS)) { assert.ok(ctx.I18N[l][k] || OLD.test(k), l + ' بلا ترجمة ' + k); }
    if (!OLD.test(k)) NEW.push(k);
    n++;
  }
  assert.equal(n, 85);
  assert.equal(NEW.length, 65);
  // مراجعة نقض (١٦ أكتوبر): الفلبينيّة تركت ٣٨ اسمًا جديدًا بالإنجليزيّة حرفيًّا («Cream»، «Navy blue»)، و«रतन/رتن» (جوهرة) كُتبت للخيزران،
  // و«Taupe» نُقلت صوتيًّا («top»، و«ٹوپ» = قبّعة) في خمس لغات. الأسماء الدخيلة الحقيقيّة (Japandi، Art Deco، Terrazzo…) مقبولة — حتّى عشرة.
  for (const l of LANGS) {
    const same = NEW.filter((k) => ctx.I18N[l][k].trim().toLowerCase() === ctx.I18N.en[k].trim().toLowerCase());
    assert.ok(same.length <= 10, l + ': ' + same.length + ' اسمًا بالإنجليزيّة: ' + same.join(', '));
    assert.ok(!/blue$/i.test(ctx.I18N[l].designAiFabricNavy) || l === 'en', l + ': كحلي');
  }
  assert.ok(ctx.I18N.hi.designAiFurnitureRattan !== 'रतन' && ctx.I18N.ur.designAiFurnitureRattan !== 'رتن', 'الخيزران لا «الجوهرة»');
  for (const l of ['hi', 'bn', 'ne', 'ml', 'ur']) assert.ok(!/^(टॉप|টপ|टप|ടോപ്പ്|ٹوپ)$/.test(ctx.I18N[l].designAiWallColorTaupe), l + ': Taupe لون لا «top»');
  assert.equal(ctx.I18N.ar.designAiWallColorNavy, 'كحلي');
  assert.equal(ctx.I18N.fr.designAiCurtainsSheer, 'Voilages');
});

test('٣. لكلّ خيار صورة WebP حقيقيّة 1280×720 مختلفة عن غيرها (موضَّحة: بطاقة القسم 3:4 على الجوّال تحتاج ~٦٦٠ بكسل ارتفاعًا)', () => {
  const seen = new Set();
  for (const [id, sec] of Object.entries(SECS)) for (const x of options(id).slice(1)) {
    const f = path.join(root, 'assets/design/decor-opts/' + sec + '-' + x.v + '.webp');
    assert.ok(fs.existsSync(f), 'لا صورة: ' + sec + '-' + x.v);
    const b = fs.readFileSync(f);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
    const chunk = b.toString('ascii', 12, 16);
    const w = chunk === 'VP8X' ? b.readUIntLE(24, 3) + 1 : chunk === 'VP8 ' ? b.readUInt16LE(26) & 0x3fff : 0;
    const h = chunk === 'VP8X' ? b.readUIntLE(27, 3) + 1 : chunk === 'VP8 ' ? b.readUInt16LE(28) & 0x3fff : 0;
    assert.deepEqual([w, h], [1536, 864], sec + '-' + x.v); // مولّد الموقع 1536×1024 مقصوصًا 16:9 بلا تكبير (قواعد الصور ١٧ أكتوبر)
    assert.ok(b.length > 15000 && b.length < 900000, 'حجم معقول (q90): ' + sec + '-' + x.v);
    seen.add(crypto.createHash('sha256').update(b).digest('hex'));
  }
  assert.equal(seen.size, 85, 'صورة لكلّ خيار لا صورة مكرّرة');
});

test('٤. البطاقات: صورة لكلّ خيار من decor-opts، و«بدون تغيير» علامة ⊘ لا رسمة غرفة كرتونيّة', () => {
  const src = read('js/design-sels.js');
  const sb = {};
  const pick = (a, b) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i)); };
  vm.runInNewContext(pick('  var NONE_BG=', '    var c=(PALS[id]||{})[v]; if(!c) return') + '  }\n' +
    pick('  function selImg(id,v){', '  function optTxt(o){') + '\nthis.selImg=selImg; this.roomBg=roomBg; this.OPT6=OPT6; this.COVER=COVER; this.NONE_BG=NONE_BG;', Object.assign(sb, { encodeURIComponent }));
  assert.deepEqual([...sb.OPT6], ['designAiLighting'].concat(Object.keys(SECS)));
  for (const [id, sec] of Object.entries(SECS)) {
    for (const x of options(id).slice(1)) { const r = sb.selImg(id, x.v); assert.match(r, /\?v=\d+$/, 'وسم كاش: ' + r); assert.equal(r.replace(/\?v=\d+$/, ''), 'assets/design/decor-opts/' + sec + '-' + x.v + '.webp'); }
    assert.equal(sb.roomBg(id, ''), sb.NONE_BG, id + ': ⊘ كالإضاءة');
    assert.ok(!/svg\+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20300%20400/.test(sb.roomBg(id, 'x')), 'لا رسمة غرفة');
    assert.ok(options(id).some((x) => x.v === sb.COVER[id]), id + ': غلاف البطاقة خيار موجود');
  }
  assert.equal(sb.roomBg('designAiLighting', ''), sb.NONE_BG);
});

test('٥. الترتيب كالترندات: الأقسام الستّة شبكة بطاقات صور والاسم فوقها، والمعرض أفقيّ بعمودين على الجوّال، والاختيار لا يولّد', () => {
  const src = read('js/design-sels.js');
  assert.ok(src.includes("g.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:8px;';"), 'شبكة لا صفوف');
  assert.ok(src.includes("c.style.cssText='position:relative;aspect-ratio:3/4;border-radius:14px;overflow:hidden;cursor:pointer;background:#141418;';"), 'بطاقة صورة 3:4 كالترندات');
  assert.ok(src.includes("cap.style.cssText='position:absolute;inset:auto 0 0 0;"), 'الاسم فوق الصورة في أسفلها');
  assert.ok(src.includes("s.style.display='none'; s.parentElement.style.display='none';"), 'الصفوف الطويلة تختفي');
  assert.ok(src.includes('if(OPT6.indexOf(id)!==-1&&window.omranPicker) return;'), 'لا صفّ «عرض الكل» مكرّر للأقسام الستّة');
  assert.ok(src.includes('    secGrid();\n'), 'الشبكة تُبنى مع كلّ بناء (وتغيير اللغة)');
  // مراجعة نقض: outline المضمَّن للاختيار كان يمحو إطار تركيز لوحة المفاتيح (:focus-visible) — البطاقة تُفتح بـEnter ولا يُرى أين التركيز.
  const card = src.slice(src.indexOf('  function secCard(s){'), src.indexOf('  function secGrid(){'));
  assert.ok(!/\.style\.outline/.test(card) && card.includes("ring.style.boxShadow=v?"), 'حلقة الاختيار طبقة فوق الصورة لا outline');
  const onPick = src.match(/onPick: function\(v\)\{[^\n]+/)[0];
  assert.ok(!/fetch|Generate|click\(/.test(onPick), 'اختيار البطاقة يحفظ القيمة فقط');
  const ui = read('js/app-05-ui.js');
  assert.ok(ui.includes("grid.style.gridTemplateColumns = cfg.landscape ? 'repeat(auto-fill,minmax(min(45%,230px),1fr))' : 'repeat(auto-fill,minmax(150px,1fr))';"), 'عمودان على الجوّال');
  // v-photo-only: صار الاسم فوق الصورة في كلّ معرض «عرض الكل» لا في الأقسام الستّة وحدها (tests/gallery-photo-only.test.cjs).
  const pk = ui.slice(ui.indexOf('window.omranPicker = { open: function(cfg){'), ui.indexOf("sheet.style.display = 'flex';"));
  assert.ok(pk.includes("info.style.cssText = 'position:absolute;inset:auto 0 0 0;") && pk.includes('wrap.appendChild(info); card.appendChild(wrap);'), 'الاسم فوق الصورة في المعرض');
  assert.ok(!/it\.sub/.test(pk) && !pk.includes('card.appendChild(info)'), 'بلا سطر وصف تحت البطاقة كالترندات');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("info.style.cssText = 'position:absolute;inset:auto 0 0 0;padding:22px 8px 8px;text-align:center;pointer-events:none;"), 'الحزمة مبنيّة');
});

test('٦. وسوم الكاش مرفوعة: partials-core وdesign-sels وملفّات اللغات', () => {
  const html = read('index.html');
  assert.ok(Number(html.match(/partials-core\.js\?v=(\d+)/)[1]) >= 659);
  assert.ok(Number(html.match(/design-sels\.js\?v=(\d+)/)[1]) >= 571);
  assert.ok(Number(read('js/app-04-i18n-state.js').match(/i18n\/' \+ lg \+ '\.js\?v=(\d+)/)[1]) >= 749); // ٧٤٧ أخذه main لـv-video-write-ask قبل الدمج — وسم مشترك يُخدم من الكاش بلا أسماء الديكور
});
