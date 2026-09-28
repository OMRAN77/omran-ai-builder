'use strict';
/* v-image-fonts (المالك ٢٨ سبتمبر: «احذف الخط العادي من الصور نهائي وتخلي الخطوط ٤: الديواني والفارسي والكوفي والثلث»؛ وقبلها
   بالتدقيق كان «ثلث» = Aref Ruqaa (رقعة) و«ديواني» = Katibeh (نسخ عناوين)). الكتابة على الصور بأربعة خطوط فقط، كلّ واحد باسمه
   الحقيقيّ، ولا خطّ عاديّ في أيّ راسم صور؛ والأسماء القديمة (في الطلبات والطبقات المحفوظة) تذهب إلى أقرب الأربعة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const attach = read('js/app-09-attach.js');

function loadFonts(){
  const a = attach.indexOf('const MAHA_FONTS = {'), b = attach.indexOf('/* 🖋️ v-text-design', a);
  assert.ok(a > 0 && b > a, 'جدول الخطوط والمحمِّل');
  const added = [];
  const document = {
    getElementById: (id) => added.find((n) => n.id === id) || null,
    createElement: (tag) => ({ tag, id: '', textContent: '', set onload(f){ this._on = f; setTimeout(f, 0); } }),
    head: { appendChild: (n) => { added.push(n); return n; } },
    fonts: { load: () => Promise.resolve([]), check: () => true },
  };
  const ctx = { document, setTimeout, __swallow(){}, __DESIGN_TITLE_FONT: 'thuluth', __DESIGN_BODY_FONT: 'diwani' };
  vm.createContext(ctx);
  vm.runInContext(attach.slice(a, b) + ';this.F = MAHA_FONTS; this.norm = mahaImageFont; this.load = mahaLoadFont;', ctx);
  return { ctx, added };
}

test('١. أربعة خطوط فقط للصور، كلّ واحد باسمه الحقيقيّ', () => {
  const { ctx } = loadFonts();
  assert.deepEqual(Object.keys(ctx.F).sort(), ['diwani', 'farsi', 'kufi', 'thuluth']);
  assert.equal(ctx.F.thuluth.css, 'Tholoth');
  assert.equal(ctx.F.diwani.css, 'UKIJ Diwani Tom');
  assert.equal(ctx.F.kufi.css, 'Reem Kufi');
  assert.equal(ctx.F.farsi.css, 'Gulzar');
  assert.match(attach, /const __DESIGN_TITLE_FONT = 'thuluth', __DESIGN_BODY_FONT = 'diwani';/, 'الملصق بلا خطّ مسمّى: عنوان ثلث وأسطر ديواني');
});

test('٢. الثلث والديواني مستضافان مع رخصتهما (GPL باستثناء التضمين، وLGPL)', () => {
  for(const f of ['assets/fonts/tholoth.woff2', 'assets/fonts/ukij-diwani-tom.woff2']){
    const buf = fs.readFileSync(path.join(root, f));
    assert.equal(buf.slice(0, 4).toString('latin1'), 'wOF2', f + ' woff2 حقيقيّ');
    assert.ok(buf.length > 30000 && buf.length < 200000, f + ' حجم معقول');
  }
  const lic = read('assets/fonts/LICENSE.md');
  assert.match(lic, /Tholoth/); assert.match(lic, /font embedding[\s\S]*exception/); assert.match(lic, /UKIJ Diwani Tom/); assert.match(lic, /LGPL/);
  const { ctx } = loadFonts();
  assert.equal(ctx.F.thuluth.url, '/assets/fonts/tholoth.woff2');
  assert.equal(ctx.F.diwani.url, '/assets/fonts/ukij-diwani-tom.woff2');
  // سياسة المحتوى تسمح بالخطّ من الموقع نفسه، وعامل الخدمة يخزّن woff2
  assert.match(read('vercel.json'), /font-src 'self'/);
  assert.match(read('sw.js'), /\.woff2'/);
});

test('٣. الأسماء القديمة إلى أقرب الأربعة، وما سواها الملصق الافتراضيّ', () => {
  const { ctx } = loadFonts();
  const map = { thuluth:'thuluth', diwani:'diwani', kufi:'kufi', farsi:'farsi', naskh:'thuluth', naskh2:'thuluth', naskhBody:'thuluth', quran:'thuluth', othmani:'thuluth', ruqaa:'diwani', nastaliq:'farsi' };
  for(const [k, v] of Object.entries(map)) assert.equal(ctx.norm(k), v, k);
  for(const k of ['default', 'modern', '', null, undefined, 'constructor', '__proto__', 'Tajawal']) assert.equal(ctx.norm(k), null, String(k));
});

test('٤. المحمِّل: قاعدة @font-face للمستضاف مرّة واحدة، ورابط Google للكوفي والفارسي، وأيّ اسم آخر لا يحمّل خطًّا عاديًّا', async () => {
  const { ctx, added } = loadFonts();
  assert.equal(await ctx.load('thuluth'), 'Tholoth');
  assert.equal(await ctx.load('thuluth'), 'Tholoth');
  const faces = added.filter((n) => n.tag === 'style');
  assert.equal(faces.length, 1, 'مرّة واحدة');
  assert.match(faces[0].textContent, /@font-face\{font-family:"Tholoth";src:url\("\/assets\/fonts\/tholoth\.woff2"\) format\("woff2"\)/);
  assert.equal(await ctx.load('kufi'), 'Reem Kufi');
  assert.ok(added.some((n) => n.tag === 'link' && /Reem\+Kufi/.test(n.href)));
  assert.equal(await ctx.load('default'), 'UKIJ Diwani Tom', 'الافتراضيّ ديواني لا Tajawal');
  assert.equal(await ctx.load('naskh'), 'Tholoth');
  assert.ok(!added.some((n) => /Tajawal|Amiri|Noto|Katibeh|Aref|Rakkas|Scheherazade/.test(String(n.href || n.textContent))), 'لا خطّ قديم يُحمَّل');
});

test('٥. الراسم والبطاقة المرتّبة بلا خطّ عاديّ، والراسم الميّت بـSegoe UI حُذف', () => {
  assert.match(attach, /const fam = \(css\) => '"' \+ css \+ '", "Tholoth", "UKIJ Diwani Tom", "Reem Kufi", serif';/);
  assert.ok(!attach.includes('function overlayDesignLines('), 'الراسم الميّت حُذف');
  assert.ok(!/["']Tajawal["']|"Segoe UI"|Tahoma, Arial/.test(attach), 'لا Tajawal ولا Segoe UI في راسمات الصور');
  assert.match(attach, /await mahaLoadFont\('kufi'\); \/\* v-image-fonts/);
  assert.equal((attach.match(/"Reem Kufi", serif/g) || []).length, 4, 'خطوط البطاقة المرتّبة الثلاثة + احتياط الراسم');
  assert.match(attach, /const fontWeight = fk === 'kufi' \? '700' : '400';/);
});

test('٦. قراءة الطلب: كلّ اسم خطّ إلى واحد من الأربعة', () => {
  const ctx = { window: {} }; ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-08-image-text.js'), ctx);
  const P = ctx.window.__parseImageTextSpec;
  const cases = [
    ['اكتب عليها «عمران» بخط ثلث', 'thuluth'], ['اكتب عليها «عمران» بخط ديواني', 'diwani'], ['اكتب عليها «عمران» بخط كوفي', 'kufi'],
    ['اكتب عليها «عمران» بخط فارسي', 'farsi'], ['اكتب عليها «عمران» بخط نستعليق', 'farsi'], ['اكتب عليها «عمران» بخط رقعة', 'diwani'],
    ['اكتب عليها «عمران» بخط نسخ', 'thuluth'], ['اكتب عليها «عمران» بخط قرآني', 'thuluth'], ['اكتب عليها «عمران» بالخط العثماني', 'thuluth'],
    ['اكتب عليها «عمران» بخط جميل', 'diwani'], ['اكتب عليها «عمران»', 'default'],
  ];
  for(const [q, want] of cases){ const r = P(q); assert.equal(r.fontKey, want, q); assert.equal(r.exactText, 'عمران', q); }
});

test('٧. المكالمة الصوتيّة والردّ الذي يعرض الخطوط: الأربعة وحدها', () => {
  const rt = read('api/_lib/realtime-session.js');
  assert.equal((rt.match(/font_style: \{ type: 'string', enum: \['diwani', 'farsi', 'kufi', 'thuluth'\]/g) || []).length, 2);
  assert.ok(!/othmani|'modern'|العثماني/.test(rt), 'لا خطّ قديم ولا «حديث» في المكالمة');
  const ts = read('api/_lib/text-swap.js');
  assert.match(ts, /\['thuluth', 'diwani', 'kufi', 'farsi'\]\.indexOf\(spec\.fontKey\)/);
  assert.ok(attach.includes('• الخط: ديواني · فارسي · كوفي · ثلث'));
  assert.ok(attach.includes('Font: diwani · farsi · kufi · thuluth'));
  // خطّ رسائل المحادثة لم يُمسّ (قرار الصور وحدها)
  assert.match(read('js/app-19-fonts.js'), /\{id:'tajawal', ar:'تجوال'/);
});
