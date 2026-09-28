'use strict';
/* v-calligraphy-names (المالك ٢٨ سبتمبر «صلحها» — بعد v-image-fonts): خطّ رسائل المحادثة واستوديو التوقيع كانا يسمّيان
   Aref Ruqaa (رقعة) «الثلث» وKatibeh (نسخ عناوين) «الديواني» وRakkas (عرض ثقيل) «الرقعة». الآن كلّ اسم خطّه الحقيقيّ،
   كما في الصور: الثلث Tholoth والديواني UKIJ Diwani Tom مستضافان، والرقعة Aref Ruqaa. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/* مستند وهميّ يسجّل ما يُضاف إلى الرأس */
function fakeDocument(){
  const added = [];
  const document = {
    readyState: 'loading', addEventListener(){},
    documentElement: { lang: 'ar', style: { setProperty(){} }, setAttribute(){}, getAttribute(){ return null; } },
    getElementById: (id) => added.find((n) => n.id === id) || null,
    createElement: (tag) => ({ tag, id: '', textContent: '', setAttribute(k, v){ this[k] = v; } }),
    head: { appendChild: (n) => { added.push(n); return n; } },
    querySelectorAll: () => [],
    fonts: { load: () => Promise.resolve([]), check: () => true },
  };
  return { document, added };
}

function chatFonts(){
  const { document, added } = fakeDocument();
  const win = { Omran: {}, dispatchEvent(){} };
  const ctx = { window: win, document, localStorage: { getItem(){ return null; }, setItem(){} }, console, CustomEvent: function(){} };
  vm.runInNewContext(read('js/app-19-fonts.js'), ctx);
  return { api: win.Omran.fonts, added };
}

function signature(){
  const { document, added } = fakeDocument();
  const win = { Omran: {} };
  const src = read('js/app-20-signature.js');
  const ctx = { window: win, document, localStorage: { getItem(){ return null; }, setItem(){} }, console, setTimeout };
  vm.runInNewContext(src, ctx);
  // link() داخليّة — تُستخرج وتُشغَّل على المستند الوهميّ نفسه
  const a = src.indexOf('  function link(f){'), b = src.indexOf('  function ready(f, px){');
  assert.ok(a > 0 && b > a, 'link موجودة');
  vm.runInNewContext('var linked = Object.create(null); function tell(){}\n' + src.slice(a, b) + ';this.link = link;', ctx);
  return { fonts: win.Omran.signature.fonts(), link: ctx.link, added };
}

/* قاعدة @font-face كما يكتبها محمِّل الصور (mahaLoadFont) — المرجع الواحد للثلاثة */
async function imageFace(key){
  const attach = read('js/app-09-attach.js');
  const a = attach.indexOf('const MAHA_FONTS = {'), b = attach.indexOf('/* 🖋️ v-text-design', a);
  const { document, added } = fakeDocument();
  const ctx = { document, setTimeout, __swallow(){}, __DESIGN_TITLE_FONT: 'thuluth', __DESIGN_BODY_FONT: 'diwani' };
  vm.createContext(ctx);
  vm.runInContext(attach.slice(a, b) + ';this.load = mahaLoadFont;', ctx);
  await ctx.load(key);
  return added.find((n) => n.tag === 'style');
}

const REAL = { thuluth: "'Tholoth'", diwani: "'UKIJ Diwani Tom'", ruqaa: "'Aref Ruqaa'" };

test('١. خطّ المحادثة: الثلث والديواني والرقعة بخطوطها الحقيقيّة، بلا «أقرب بديل»', () => {
  const { api } = chatFonts();
  const list = api.list();
  for(const [id, family] of Object.entries(REAL)){
    const f = list.find((x) => x.id === id);
    assert.equal(f.family, family, id);
    assert.ok(!f.alt, id + ' بلا شارة «أقرب بديل»');
  }
  assert.equal(list.find((x) => x.id === 'thuluth').url, '/assets/fonts/tholoth.woff2');
  assert.equal(list.find((x) => x.id === 'diwani').url, '/assets/fonts/ukij-diwani-tom.woff2');
  // المستضاف بلا google: لو دخل اسمه رابط Google المجمّع في PDF لفشلت الورقة كلّها (وضاع Tajawal معها)
  assert.equal(list.find((x) => x.id === 'thuluth').google, '');
  assert.equal(list.find((x) => x.id === 'diwani').google, '');
  assert.equal(list.find((x) => x.id === 'ruqaa').google, 'Aref+Ruqaa:wght@400;700');
  assert.equal(list.length, 16, 'العدد نفسه والمعرّفات نفسها — اختيارات المستخدمين المحفوظة باقية');
  assert.ok(!/Katibeh|Rakkas/.test(read('js/app-19-fonts.js').replace(/\/\*[\s\S]*?\*\//g, '')), 'لا خطّ بغير اسمه');
});

test('٢. اختيار الثلث في المحادثة يعرّف الخطّ المستضاف بقاعدة الصور نفسها ومعرّفها، مرّة واحدة', async () => {
  const { api, added } = chatFonts();
  api.apply('thuluth');
  api.apply('thuluth');
  const faces = added.filter((n) => n.tag === 'style');
  assert.equal(faces.length, 1, 'مرّة واحدة');
  const ref = await imageFace('thuluth');
  assert.equal(faces[0].id, ref.id, 'المعرّف نفسه (ff-tholoth-woff2) فلا تتكرّر القاعدة بين الصور والمحادثة');
  assert.equal(faces[0].textContent, ref.textContent, 'القاعدة حرفيًّا كقاعدة الصور');
  api.apply('diwani');
  assert.equal(added.filter((n) => n.tag === 'style')[1].textContent, (await imageFace('diwani')).textContent);
  api.apply('ruqaa');
  const l = added.find((n) => n.tag === 'link');
  assert.match(l.href, /family=Aref\+Ruqaa:wght@400;700&display=swap$/, 'الرقعة من Google');
});

test('٣. قاعدة سبق أن عرّفها راسم الصور لا تُكرَّر', async () => {
  const { api, added } = chatFonts();
  const ref = await imageFace('diwani');
  added.push(ref);
  api.apply('diwani');
  assert.equal(added.filter((n) => n.tag === 'style').length, 1);
});

test('٤. استوديو التوقيع: الخطوط الحقيقيّة، ووزن 400 للثلث والديواني (لا تغليظ اصطناعيّ)', async () => {
  const { fonts, link, added } = signature();
  const by = (id) => fonts.find((f) => f.id === id);
  for(const [id, family] of Object.entries(REAL)) assert.equal(by(id).family, family, id);
  assert.equal(by('thuluth').w, '400');
  assert.equal(by('diwani').w, '400');
  assert.equal(by('ruqaa').w, '700', 'Aref Ruqaa فيه 700 حقيقيّ');
  assert.equal(by('ruqaa').g, 'Aref+Ruqaa:wght@400;700');
  assert.equal(fonts.length, 6);
  assert.ok(!/Katibeh|Rakkas/.test(read('js/app-20-signature.js').replace(/\/\*[\s\S]*?\*\//g, '')));
  link(by('thuluth')); link(by('thuluth'));
  const faces = added.filter((n) => n.tag === 'style');
  assert.equal(faces.length, 1);
  const ref = await imageFace('thuluth');
  assert.equal(faces[0].id, ref.id);
  assert.equal(faces[0].textContent, ref.textContent);
  link(by('ruqaa'));
  assert.match(added.find((n) => n.tag === 'link').href, /family=Aref\+Ruqaa:wght@400;700&display=swap$/);
});

/* يستخرج دالّة كاملة من المصدر بمطابقة الأقواس */
function fnSource(src, name){
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  assert.ok(m, name);
  let depth = 0;
  for(let k = src.indexOf('{', m.index); k < src.length; k++){
    if(src[k] === '{') depth++;
    else if(src[k] === '}' && --depth === 0) return src.slice(m.index, k + 1);
  }
  throw new Error(name);
}

test('٥. PDF: الخطّ المستضاف في رأس المستند بعنوان كامل، ورابط Tajawal باقٍ للانتظار؛ خطوط Google كما كانت', () => {
  const src = fnSource(read('js/app-05-ui.js'), 'msgPdfFontHead');
  const run = (font, location) => { const ctx = { location }; vm.runInNewContext(src + ';this.head = msgPdfFontHead(' + JSON.stringify(font) + ');', ctx); return ctx.head; };
  const { api } = chatFonts();
  const thuluth = api.list().find((f) => f.id === 'thuluth');
  const h = run(thuluth, { origin: 'https://omran-ai-builder.vercel.app' });
  assert.match(h.link, /<link rel="stylesheet" data-pdf-font href="https:\/\/fonts\.googleapis\.com\/css2\?family=Tajawal:wght@400;500;700&display=swap">/);
  assert.ok(h.link.includes('<style>@font-face{font-family:"Tholoth";src:url("https://omran-ai-builder.vercel.app/assets/fonts/tholoth.woff2") format("woff2");}</style>'));
  assert.equal(h.family, "'Tholoth', 'Tajawal', Tahoma, Arial, sans-serif");
  // بلا أصل معروف (بيئة عارية): العنوان النسبيّ خير من لا شيء
  assert.ok(run(thuluth, undefined).link.includes('src:url("/assets/fonts/tholoth.woff2")'));
  // خطّ Google: المخرج حرفيًّا كما كان قبل التغيير
  const ruqaa = api.list().find((f) => f.id === 'ruqaa');
  assert.equal(run(ruqaa, { origin: 'https://x.test' }).link, '<link rel="stylesheet" data-pdf-font href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Tajawal:wght@400;500;700&display=swap">');
  assert.equal(run({ family: "'Tajawal'", google: '', line: 1.7 }, { origin: 'https://x.test' }).link, '<link rel="stylesheet" data-pdf-font href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap">');
});

test('٦. ذيل التوقيع تحت أدنى حبر فعليّ (أذيال الثلث أعمق)، ومكانه القديم للخطوط القصيرة', () => {
  const src = read('js/app-20-signature.js');
  const a = src.indexOf('  function paint(canvas, txt, scale){'), b = src.indexOf('  function blobOf(canvas){');
  assert.ok(a > 0 && b > a, 'paint موجودة');
  function draw(descent){
    const log = { moveY: null, h: null };
    const ctx2d = () => ({ measureText: () => ({ width: 300, actualBoundingBoxDescent: descent }), clearRect(){}, scale(){}, transform(){}, translate(){}, fillText(){},
      beginPath(){}, moveTo(x, y){ log.moveY = y; }, quadraticCurveTo(){}, stroke(){} });
    const canvas = { style: {}, getContext: ctx2d };
    const ctx = { document: { createElement: () => ({ getContext: ctx2d }) }, Math,
      state: { font: 'thuluth', size: 100, slant: 0, ink: 'white', flourish: true }, fontById: () => ({ w: '400', family: "'Tholoth'" }),
      inkVal: () => '#fff', T: (x) => x };
    vm.runInNewContext(src.slice(a, b) + ';this.r = paint(canvas, "عمران", 1);', Object.assign(ctx, { canvas }));
    log.h = ctx.r.h;
    return log;
  }
  const deep = draw(80); // حبر الثلث ينزل 0.8 تحت منتصف السطر
  assert.ok(deep.moveY >= 102 + 80 + 10, 'الذيل تحت الحبر: ' + deep.moveY);
  assert.ok(deep.h >= deep.moveY + 62, 'اللوحة تتّسع للذيل');
  const shallow = draw(30);
  assert.equal(shallow.moveY, 150, 'الخطّ القصير: الذيل في مكانه القديم');
  assert.equal(shallow.h, 212);
});

test('٧. الحزمة مطابقة', () => {
  const b = read('js/app.bundle.js');
  assert.ok(b.includes(`{id:'thuluth', ar:'الثلث', en:'Thuluth', family:"'Tholoth'"`));
  assert.ok(b.includes(`{ id:'diwani',  ar:'الديواني', en:'Diwani',   family:"'UKIJ Diwani Tom'"`));
});
